# Contributing

## Build

Needs podman only.

| Command | |
| --- | --- |
| `sh scripts/build.sh` | Build `dist/` |
| `sh scripts/build-ts.sh` | Build loader `src/index.ts`, no WASM rebuild |
| `sh scripts/test.sh` | Run tests |

Or `chmod +x` and drop `sh`.

## Release

1. Publish GitHub release with new tag `v<version>`, e.g. `v1.0.1`.
   - Pre-release publishes under npm `next` instead of `latest`.
2. CI sets `package.json` version from tag, attaches tarball to release and stages it on npm.
3. Approve on npmjs.com under Staged Packages.
