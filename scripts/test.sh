#!/bin/sh
# Run tests in Node container
set -eu
cd "$(dirname "$0")/.."

podman run --rm --pull=newer --network=none --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/library/node:latest \
	node --test test/*.test.mts
