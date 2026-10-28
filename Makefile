# Development commands in containers
.PHONY: build build-ts test format sh clean

# Colors when run in terminal
TTY := $(shell [ -t 0 ] && echo -t)
PODMAN = podman run --rm -i $(TTY) -e TERM
# Container as host user
RUN = $(PODMAN) --userns=keep-id -e HOME=/tmp
# No network
RUN_OFFLINE = $(RUN) --network=none
# Images with project mount
NODE_IMAGE = docker.io/library/node:latest
NODE = -v .:/app:z -w /app $(NODE_IMAGE)
EMSDK = -v .:/src:z docker.io/emscripten/emsdk:6.0.13
ALPINE = -v .:/app:z -w /app docker.io/library/alpine:latest

# Build WASM and loader into dist/
build:
	$(RUN) $(EMSDK) sh scripts/compile.sh

# Update image, build loader only
build-ts:
	podman pull $(NODE_IMAGE)
	$(RUN) $(NODE) sh -c 'npm ci && npm run build:ts'

test:
	$(RUN_OFFLINE) $(NODE) npm test

# Format TS and C++ sourcecode
format:
	$(PODMAN) $(ALPINE) sh -c 'apk add clang-extra-tools && clang-format -i src/*.cpp'
	$(RUN_OFFLINE) $(NODE) npx prettier --write .

# Shell into container with Debian colours
sh:
	$(RUN) $(NODE) bash --rcfile /etc/skel/.bashrc

clean:
	rm -rf dist
