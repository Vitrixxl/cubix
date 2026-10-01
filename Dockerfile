FROM rust:1.98-bookworm AS backend
WORKDIR /app
# Keep the 4 GiB Pi responsive: one compiler, no LTO, smaller code generation units.
# The mobile app is built on the developer machine, never in this image.
ARG CARGO_BUILD_JOBS=1
ENV CARGO_BUILD_JOBS=$CARGO_BUILD_JOBS CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
COPY rust-api ./rust-api
COPY data ./data
RUN cargo build --locked --release --manifest-path rust-api/Cargo.toml

# The web app, which the desktop app loads too. Only runtime dependencies are installed: Bun bundles
# TypeScript itself, and no install script (Electron, Playwright) is needed to build.
FROM oven/bun:1.4 AS web
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY data ./data
COPY src ./src
COPY desktop ./desktop
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
COPY --from=backend /app/rust-api/target/release/cubix-api /usr/local/bin/cubix-api
COPY --from=web /app/dist/web /app/web
# The server loads /app/.env at start-up; keeping the number outside the compiled layer
# means a commit that only touches the mobile application does not recompile Rust.
COPY --from=buildinfo /build.env /app/.env
USER cubix
EXPOSE 3000
CMD ["cubix-api"]
