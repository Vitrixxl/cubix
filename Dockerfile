# The API (go-api/): a static binary, musl with SQLite linked in. The mobile app is built on the developer
# machine, never in this image.
FROM golang:1.27-alpine AS backend
RUN apk add --no-cache build-base
WORKDIR /app/go-api
COPY go-api/go.mod go-api/go.sum ./
# The modules and the build cache outlive the image (BuildKit cache mounts): a change to the API recompiles
# its own package, never go-sqlite3's C.
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked go mod download
COPY data /app/data
COPY go-api ./
# compose.dev.yaml adds `seed` (development data); production builds keep none.
ARG GO_TAGS=""
# Two packages compiled at once leave the 4 GiB Pi room for the web build running beside it.
ARG GO_BUILD_JOBS=2
ENV GOFLAGS=-p=$GO_BUILD_JOBS
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked --mount=type=cache,target=/root/.cache/go-build,sharing=locked \
    CGO_ENABLED=1 ./build.sh -tags "sqlite_omit_load_extension $GO_TAGS" -trimpath -ldflags '-s -w -extldflags "-static"' \
    && cp cubix-api /cubix-api

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
FROM alpine/git AS buildinfo
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
# The GC hands memory back past this soft limit: a burst of Argon2 hashes (64 MiB each) does not stay resident.
ENV GOMEMLIMIT=256MiB
COPY --from=backend /cubix-api /usr/local/bin/cubix-api
COPY --from=web /app/dist/web /app/web
# The server loads /app/.env at start-up; keeping the number outside the compiled layer
# means a commit that only touches the mobile application does not recompile the API.
COPY --from=buildinfo /build.env /app/.env
USER cubix
EXPOSE 3000
CMD ["cubix-api"]
