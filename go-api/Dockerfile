# Light image of the Go API: a static binary (musl, C SQLite linked in) on scratch, no web app.
# docker build -f go-api/Dockerfile -t cubix-go-api .   (context: the repository root)
FROM golang:1.27-alpine AS build
RUN apk add --no-cache build-base
WORKDIR /src/go-api
COPY go-api/go.mod go-api/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY data /src/data
COPY rust-api/src/schema.sql rust-api/src/query-indexes.sql /src/rust-api/src/
COPY go-api ./
ARG GO_TAGS=""
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 ./build.sh -tags "sqlite_omit_load_extension $GO_TAGS" -trimpath -ldflags '-s -w -extldflags "-static"' \
    && mkdir -p /out/var/lib/cubix /out/tmp && chmod 1777 /out/tmp && cp cubix-api /out/cubix-api

FROM scratch
COPY --from=build /out/cubix-api /cubix-api
COPY --from=build --chown=1000:1000 /out/var /var
# SQLite's temporary files (large sorts, the seed).
COPY --from=build --chown=1000:1000 /out/tmp /tmp
ENV CUBIX_HOST=0.0.0.0 PORT=3000 CUBIX_DB=/var/lib/cubix/cubix.db
USER 1000
EXPOSE 3000
CMD ["/cubix-api"]
