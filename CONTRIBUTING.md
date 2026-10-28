# Contributing

## Build

Needs podman only.

| Command | |
| --- | --- |
| `make build` | Build `dist/` |
| `make build-ts` | Build loader `src/index.ts`, no WASM rebuild |
| `make test` | Run tests |
| `make format` | Format TS with Prettier and C++ with clang-format |
| `make sh` | Shell into container, e.g. for `npm update` |

> [!NOTE]
> | Commands | | |
> | --- | --- | --- |
> | `make` | on host | Provides development environment via podman |
> | `package.json` scripts | in container | Actual work: build js loader, test |

## Release

1. Publish GitHub release with new tag `v<version>`, e.g. `v1.0.1`.
   - Pre-release publishes under npm `next` instead of `latest`.
2. CI sets `package.json` version from tag, attaches tarball to release and stages it on npm.
3. Approve on npmjs.com under Staged Packages.
