# Development commands in containers
.PHONY: build build-ts test format clang-image sh clean

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
CLANG_IMAGE = localhost/glslang-wasm-clang-format
CLANG = -v .:/app:z $(CLANG_IMAGE)

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
format: clang-image node_modules/.package-lock.json
	$(RUN_OFFLINE) $(CLANG) clang-format -i src/*.cpp
	$(RUN_OFFLINE) $(NODE) node_modules/.bin/prettier --write .

# Build clang-format image, cached after first run
clang-image:
	podman build -t $(CLANG_IMAGE) -f scripts/clang-format.Containerfile scripts

# Shell into container with Debian colours
sh:
	$(RUN) $(NODE) bash --rcfile /etc/skel/.bashrc

# Install deps when lockfile changes
node_modules/.package-lock.json: package-lock.json
	podman pull $(NODE_IMAGE)
	$(RUN) $(NODE) sh -c 'npm ci && npm audit --audit-level=moderate'

clean:
	rm -rf dist

clean-npm: clean
	rm -rf node_modules
