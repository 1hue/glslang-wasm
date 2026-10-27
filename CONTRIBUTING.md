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

1. Bump `version` in `package.json` and push to `main`.
2. Publish GitHub release tagged `v<version>`. Pre-releases go to npm tag `next`.
3. CI attaches tarball to release and stages it on npm.
4. Approve on npmjs.com under Staged Packages.
