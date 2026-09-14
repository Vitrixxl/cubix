FROM rust:1.98-bookworm AS backend
WORKDIR /app
COPY rust-api ./rust-api
COPY data ./data
RUN cargo build --locked --release --manifest-path rust-api/Cargo.toml

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1000 --create-home cubix \
    && mkdir -p /var/lib/cubix && chown cubix:cubix /var/lib/cubix
WORKDIR /app
ENV CUBIX_HOST=0.0.0.0 PORT=3000 CUBIX_DB=/var/lib/cubix/cubix.db
COPY --from=backend /app/rust-api/target/release/cubix-api /usr/local/bin/cubix-api
USER cubix
EXPOSE 3000
CMD ["cubix-api"]
