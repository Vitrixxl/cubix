# The API (go-api/): a static binary, musl with SQLite linked in. The web app is not in the image: built on the
# developer's machine (scripts/deploy.ts), it is mounted from the server's repository (compose.yaml).
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
# Two packages compiled at once leave the 4 GiB Pi room for the applications it runs.
ARG GO_BUILD_JOBS=2
ENV GOFLAGS=-p=$GO_BUILD_JOBS
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked --mount=type=cache,target=/root/.cache/go-build,sharing=locked \
    CGO_ENABLED=1 ./build.sh -tags "sqlite_omit_load_extension $GO_TAGS" -trimpath -ldflags '-s -w -extldflags "-static"' \
    && cp cubix-api /cubix-api

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
# The build number identifies the commit: scripts/deploy.ts passes it with the commit
# (compose.yaml's build arguments), rather than the image reading a copy of the repository's history. The server
# loads /app/.env at start-up; written last, a new number recompiles nothing.
ARG CUBIX_BUILD_NUMBER=0
ARG CUBIX_COMMIT=
RUN printf 'CUBIX_BUILD_NUMBER=%s\nCUBIX_COMMIT=%s\n' "$CUBIX_BUILD_NUMBER" "$CUBIX_COMMIT" > /app/.env && cat /app/.env
USER cubix
EXPOSE 3000
CMD ["cubix-api"]
