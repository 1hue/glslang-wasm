#!/bin/sh
# Format C++ sources with clang-format in Alpine container
set -eu
cd "$(dirname "$0")/.."

# Root for apk - rootless podman maps it to your user
podman run --rm --pull=newer -v .:/w:Z -w /w docker.io/library/alpine:latest \
	sh -c 'apk add clang-extra-tools && clang-format -i src/*.cpp'
