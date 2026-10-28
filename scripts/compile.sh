#!/bin/sh
# Build dist/ (glslang.wasm with SPIRV-Cross, loader) and root third-party licenses. Runs inside Emscripten container, see Makefile build
set -eu
cd "$(dirname "$0")/.."

GLSLANG_TAG=16.6.0
GLSLANG_COMMIT=e1b562a8bed273a02f30b59b66a5d499793cede5
SPIRV_CROSS_TAG=vulkan-sdk-1.4.363.0
SPIRV_CROSS_COMMIT=f11ba9f0b21ba8fc15153d50a2a1ae31ab1cf8f7

git clone --depth 1 --branch "$GLSLANG_TAG" https://github.com/KhronosGroup/glslang.git /tmp/glslang
test "$(git -C /tmp/glslang rev-parse HEAD)" = "$GLSLANG_COMMIT"
git clone --depth 1 --branch "$SPIRV_CROSS_TAG" https://github.com/KhronosGroup/SPIRV-Cross.git /tmp/spirv-cross
test "$(git -C /tmp/spirv-cross rev-parse HEAD)" = "$SPIRV_CROSS_COMMIT"

# Image cache is root-owned
export EM_CACHE=/tmp/emcache
cp -r "$EMSDK/upstream/emscripten/cache" "$EM_CACHE"

emcmake cmake -S /tmp/glslang -B /tmp/build \
	-DCMAKE_BUILD_TYPE=MinSizeRel \
	-DBUILD_EXTERNAL=OFF \
	-DENABLE_SPIRV=ON \
	-DENABLE_HLSL=OFF \
	-DENABLE_OPT=OFF \
	-DENABLE_PCH=OFF \
	-DENABLE_GLSLANG_BINARIES=OFF \
	-DGLSLANG_TESTS=OFF \
	-DGLSLANG_ENABLE_INSTALL=OFF
cmake --build /tmp/build --parallel --target glslang glslang-default-resource-limits

# SPIRV-Cross reports errors as C++ exceptions
emcmake cmake -S /tmp/spirv-cross -B /tmp/spirv-cross-build \
	-DCMAKE_BUILD_TYPE=MinSizeRel \
	-DCMAKE_CXX_FLAGS=-fwasm-exceptions \
	-DSPIRV_CROSS_CLI=OFF \
	-DSPIRV_CROSS_ENABLE_TESTS=OFF \
	-DSPIRV_CROSS_ENABLE_HLSL=OFF \
	-DSPIRV_CROSS_ENABLE_MSL=OFF \
	-DSPIRV_CROSS_ENABLE_CPP=OFF \
	-DSPIRV_CROSS_ENABLE_REFLECT=OFF \
	-DSPIRV_CROSS_ENABLE_C_API=OFF \
	-DSPIRV_CROSS_ENABLE_UTIL=OFF \
	-DSPIRV_CROSS_SKIP_INSTALL=ON
cmake --build /tmp/spirv-cross-build --parallel --target spirv-cross-core spirv-cross-glsl

rm -rf dist
mkdir dist
em++ -Oz -flto -fwasm-exceptions \
	-I/tmp/glslang -I/tmp/build/include -I/tmp/spirv-cross \
	src/check.cpp src/cross.cpp \
	$(find /tmp/build /tmp/spirv-cross-build -name '*.a') \
	-sMODULARIZE \
	-sEXPORT_ES6 \
	-sEXPORT_NAME=createModule \
	-sENVIRONMENT=node,web,worker \
	-sFILESYSTEM=0 \
	-sALLOW_MEMORY_GROWTH \
	-sSTACK_SIZE=8MB \
	-sEXPORTED_FUNCTIONS=_initialize,_finalize,_check,_spirvData,_spirvLength,_crossCompile,_crossCompileSource,_crossCompileUniforms,_malloc,_free \
	-sEXPORTED_RUNTIME_METHODS=stringToNewUTF8,UTF8ToString,HEAPU32 \
	-o dist/glslang.js

# Loader and its types
npm ci
npm run build:ts

cp /tmp/glslang/LICENSE.txt LICENSE-glslang
cp /tmp/spirv-cross/LICENSE LICENSE-spirv-cross
cp "$EMSDK/upstream/emscripten/LICENSE" LICENSE-emscripten
cp "$EMSDK/upstream/emscripten/system/lib/libc/musl/COPYRIGHT" LICENSE-musl
