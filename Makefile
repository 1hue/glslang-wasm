# Development commands in containers
.PHONY: build build-ts test format sh clean

# Colors when run in terminal
TTY := $(shell [ -t 0 ] && echo -t)
PODMAN = podman run --rm -i $(TTY) -e TERM --pull=newer
# Container as host user
RUN = $(PODMAN) --userns=keep-id -e HOME=/tmp
# No network
RUN_OFFLINE = $(RUN) --network=none
# Images with project mount
NODE = -v .:/app:Z -w /app docker.io/library/node:latest
EMSDK = -v .:/src:Z docker.io/emscripten/emsdk:6.0.13
ALPINE = -v .:/app:Z -w /app docker.io/library/alpine:latest

# Build WASM and loader into dist/
build:
	$(RUN) $(EMSDK) sh scripts/compile.sh

# Build loader only
build-ts:
	$(RUN) $(NODE) sh -c 'npm ci && npm run build:ts'

test:
	$(RUN_OFFLINE) $(NODE) npm test

# Format C++ sources
format:
	$(PODMAN) $(ALPINE) sh -c 'apk add clang-extra-tools && clang-format -i src/*.cpp'

# Shell into container with colored ls and prompt
sh:
	$(RUN) $(NODE) bash --rcfile /etc/skel/.bashrc

clean:
	rm -rf dist
