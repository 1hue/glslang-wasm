# Development commands, run in containers - see CONTRIBUTING.md
.PHONY: build build-ts test format sh clean

# Colors when run in terminal
TTY := $(shell [ -t 0 ] && echo -t)
# Container with project at /w, image follows
RUN = podman run --rm $(TTY) --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w
NODE = docker.io/library/node:latest
EMSDK = docker.io/emscripten/emsdk:6.0.13

# Build WASM and loader into dist/
build:
	$(RUN) $(EMSDK) sh scripts/compile.sh

# Build loader only
build-ts:
	$(RUN) $(NODE) sh -c 'npm ci && npm run build:ts'

test:
	$(RUN) --network=none $(NODE) npm test

# Root for apk
format:
	podman run --rm $(TTY) --pull=newer -v .:/w:Z -w /w docker.io/library/alpine:latest \
		sh -c 'apk add clang-extra-tools && clang-format -i src/*.cpp'

# Shell into container with colored ls and prompt
sh:
	$(RUN) -i -e TERM $(NODE) bash --rcfile /etc/skel/.bashrc

clean:
	rm -rf dist
