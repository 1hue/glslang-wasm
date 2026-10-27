# Shortcuts for scripts/ - see CONTRIBUTING.md
.PHONY: build build-ts test clean

build:
	sh scripts/build.sh

build-ts:
	sh scripts/build-ts.sh

test:
	sh scripts/test.sh

clean:
	rm -rf dist
