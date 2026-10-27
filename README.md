# glslang-wasm

Unmodified [glslang](https://github.com/KhronosGroup/glslang) but in WebAssembly.

Checks your GLSL shaders for errors and compiles them to SPIR-V from JavaScript. Errors match glslangValidator word for word.

- Nothing else to install
- Handles OpenGL, Vulkan, ES, `#include`
- Runs in Node (used in [glsl-vscode](https://github.com/1hue/glsl-vscode)), browsers and web workers <sup>[↗](scripts/compile.sh#L37)</sup>

> [!NOTE]
> Built from Khronos glslang [16.6.0](https://github.com/KhronosGroup/glslang/releases/tag/16.6.0), see [compile.sh](scripts/compile.sh).

## Usage

```sh
npm install glslang-wasm
```

```js
// @ts-check
import { createGlslang } from 'glslang-wasm';

const glslang = await createGlslang();
const { diagnostics } = await glslang.check(source, { stage: 'fragment' });
const { spirv } = await glslang.compile(source, { stage: 'fragment' }); // Uint32Array
```

<details>
<summary>All options</summary>

```ts
createGlslang(options?: {
  // glslang.wasm bytes - default reads glslang.wasm from next to glslang.js
  wasmBinary?: Uint8Array;
});

check(source: string, options: {
  stage: 'vertex' | 'tesscontrol' | 'tesseval' | 'geometry' | 'fragment' | 'compute'
    | 'raygen' | 'intersect' | 'anyhit' | 'closesthit' | 'miss' | 'callable' | 'task' | 'mesh';
  // File name shown in diagnostics, e.g. 'sky.frag' - default '0'
  name?: string;
  // Default none, vulkan for compile()
  client?: 'none' | 'opengl' | 'vulkan';
  // Version for source without #version line, e.g. 450 - default 100
  defaultVersion?: number;
  // Profile for source without #version line, e.g. 'core' - default none
  defaultProfile?: 'none' | 'core' | 'compatibility' | 'es';
  // Default 1.4
  vulkanVersion?: '1.0' | '1.1' | '1.2' | '1.3' | '1.4';
  // Default 1.6, 1.0 for opengl
  spirvVersion?: '1.0' | '1.1' | '1.2' | '1.3' | '1.4' | '1.5' | '1.6';
  // Code inserted after #version, e.g. '#define LIGHTS 4' - doesn't shift source line numbers
  preamble?: string;
  // Called for each #include, e.g. #include "common.glsl" in sky.frag calls:
  //   include('common.glsl', { includer: 'sky.frag', system: false, depth: 1 })
  //   returns { name: 'resolved/path/common.glsl', source: '...' } or undefined
  // system: true for #include <lib.glsl>, false for #include "lib.glsl"
  // Without it #include is an error
  include?: (header: string, context: { includer: string; system: boolean; depth: number })
    => { name: string; source: string } | undefined;
  // Also check shader as a whole, e.g. missing main() or function declared but never defined
  // Default false, compile() always links
  link?: boolean;
});
```

</details>

## License

- [MIT](LICENSE)
- `dist/` is under [glslang](LICENSE-glslang), [Emscripten](LICENSE-emscripten), [musl](LICENSE-musl) licenses
