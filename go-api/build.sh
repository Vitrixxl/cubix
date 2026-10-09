#!/bin/sh
# Copies the data files the binary embeds (go:embed cannot reach outside go-api/), then builds ./cubix-api.
# Arguments go to `go build` (e.g. `./build.sh -tags seed`).
set -e
cd "$(dirname "$0")"
mkdir -p embed
cp ../data/catalog.json ../data/puzzles.json ../data/method-ids.json embed/
# SQLite with STAT4: the query planner uses the sqlite_stat4 table ANALYZE fills.
tags=sqlite_stat4
if [ "$1" = -tags ]; then tags="$tags $2"; shift 2; fi
go build -o cubix-api -tags "$tags" "$@" .
