# glslang-wasm

Check GLSL shaders for errors and compile them to SPIR-V from JavaScript. Unmodified [glslang](https://github.com/KhronosGroup/glslang) but in WebAssembly. Errors match glslangValidator word for word. Nothing else to install.

Handles OpenGL, Vulkan and ES, Godot Shaders, `#include`.

Written for editor diagnostics in [glsl-vscode](https://github.com/1hue/glsl-vscode), also fine for build scripts or CI.

```js
const { createGlslang } = require('glslang-wasm');

const glslang = await createGlslang();
const { diagnostics } = await glslang.check(source, { stage: 'fragment' });
const { spirv } = await glslang.compile(source, { stage: 'fragment' }); // Uint32Array, Vulkan by default
```

Options in `dist/index.d.ts`.

## Build

Needs podman only.

| Command | |
| --- | --- |
| `sh scripts/build.sh` | Build `dist/` |
| `sh scripts/test.sh` | Test |
| `npm run build` | Build, with Node on host |
| `npm test` | Test, with Node on host |

## License

MIT. `dist/` also has glslang, Emscripten and musl licenses.
