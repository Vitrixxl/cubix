FROM rust:1.98-bookworm AS backend
WORKDIR /app
# Keep the 4 GiB Pi responsive: one compiler, no LTO, smaller code generation units.
# The mobile app is built on the developer machine, never in this image.
ARG CARGO_BUILD_JOBS=1
# compose.dev.yaml adds `seed` (development data); production builds keep none.
ARG CARGO_FEATURES=""
ENV CARGO_BUILD_JOBS=$CARGO_BUILD_JOBS CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
COPY rust-api ./rust-api
COPY data ./data
# The registry and target/ outlive the image (BuildKit cache mounts): a change to the API recompiles its own crate,
# never the dependencies. The binary is copied out, the mount being gone once the step ends.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/app/rust-api/target,sharing=locked \
    cargo build --locked --release --manifest-path rust-api/Cargo.toml --features "$CARGO_FEATURES" \
    && cp rust-api/target/release/cubix-api /cubix-api

# The web app, which the desktop app loads too. Only runtime dependencies are installed: Bun bundles
# TypeScript itself, and no install script (Electron, Playwright) is needed to build.
FROM oven/bun:1.4 AS web
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY data ./data
COPY src ./src
COPY desktop ./desktop
# The app's pages are written ahead of time by several processes (desktop/prerender.tsx), about 300 MB each: one core
# stays for the API's compiler beside them on the 4 GiB Pi.
ARG CUBIX_PRERENDER_JOBS=3
ENV CUBIX_PRERENDER_JOBS=$CUBIX_PRERENDER_JOBS
RUN bun desktop/web.ts

# The build number identifies the commit to the mobile application. It is derived from the
# committer date so shallow clones (pihost) work; the arguments override it when set.
FROM rust:1.98-bookworm AS buildinfo
WORKDIR /src
ARG CUBIX_BUILD_NUMBER
ARG CUBIX_COMMIT
COPY .git ./.git
RUN build="${CUBIX_BUILD_NUMBER:-$(( $(git log -1 --format=%ct 2>/dev/null || echo 0) / 60 ))}" \
    && commit="${CUBIX_COMMIT:-$(git rev-parse HEAD 2>/dev/null || true)}" \
    && printf 'CUBIX_BUILD_NUMBER=%s\nCUBIX_COMMIT=%s\n' "$build" "$commit" > /build.env \
    && cat /build.env

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1000 --create-home cubix \
    && mkdir -p /var/lib/cubix && chown cubix:cubix /var/lib/cubix
WORKDIR /app
ENV CUBIX_HOST=0.0.0.0 PORT=3000 CUBIX_DB=/var/lib/cubix/cubix.db CUBIX_WEB_DIR=/app/web
COPY --from=backend /cubix-api /usr/local/bin/cubix-api
COPY --from=web /app/dist/web /app/web
# The server loads /app/.env at start-up; keeping the number outside the compiled layer
# means a commit that only touches the mobile application does not recompile Rust.
COPY --from=buildinfo /build.env /app/.env
USER cubix
EXPOSE 3000
CMD ["cubix-api"]
