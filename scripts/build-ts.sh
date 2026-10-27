#!/bin/sh
# Build loader only (dist/index.js, index.d.ts) in Node container - no WASM rebuild
set -eu
cd "$(dirname "$0")/.."

podman run --rm --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/library/node:latest \
	sh -c 'npm ci && npm run build:ts'
