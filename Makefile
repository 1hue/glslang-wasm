# Development commands, run in containers - see CONTRIBUTING.md
.PHONY: build build-ts test format sh clean

# Container with project at /w, image follows
RUN = podman run --rm --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w
NODE = docker.io/library/node:latest
EMSDK = docker.io/emscripten/emsdk:6.0.13

# dist/ - WASM and loader
build:
	$(RUN) $(EMSDK) sh scripts/compile.sh

# Loader only, no WASM rebuild
build-ts:
	$(RUN) $(NODE) sh -c 'npm ci && npm run build:ts'

test:
	$(RUN) --network=none $(NODE) npm test

# Root for apk
format:
	podman run --rm --pull=newer -v .:/w:Z -w /w docker.io/library/alpine:latest \
		sh -c 'apk add clang-extra-tools && clang-format -i src/*.cpp'

# Shell into container, e.g. for npm update
sh:
	$(RUN) -it $(NODE) bash

clean:
	rm -rf dist
