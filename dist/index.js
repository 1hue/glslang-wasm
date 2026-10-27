"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLog = parseLog;
exports.createGlslang = createGlslang;
const createModule = require("./glslang.js");
const STAGES = {
    vertex: 0,
    tesscontrol: 1,
    tesseval: 2,
    geometry: 3,
    fragment: 4,
    compute: 5,
    raygen: 6,
    intersect: 7,
    anyhit: 8,
    closesthit: 9,
    miss: 10,
    callable: 11,
    task: 12,
    mesh: 13,
};
const CLIENTS = { none: 0, opengl: 1, vulkan: 2 };
// EProfile bits
const PROFILES = { none: 1, core: 2, compatibility: 4, es: 8 };
/**
 * `ERROR: 0:12:5: 'foo' : undeclared identifier`
 * `WARNING: 0:3: '#extension' : extension not supported: GL_FOO`
 */
const LOCATED = /^(ERROR|WARNING): (.*?):(\d+):(?:(\d+):)? (.*)$/;
// `ERROR: Linking fragment stage: Missing entry point: ...`
const UNLOCATED = /^(ERROR|WARNING): (.*)$/;
const TOTALS = /^\d+ compilation errors\./;
// Without `#version`, default version and profile are forced
const VERSION = /^[ \t]*#[ \t]*version\b/m;
/** `1.4` -> EShTargetClientVersion, 0 for default */
function vulkanTarget(version) {
    return version ? (1 << 22) | (Number(version.split('.')[1]) << 12) : 0;
}
/** `1.4` -> EShTargetLanguageVersion, 0 for default */
function spirvTarget(version) {
    return version ? (1 << 16) | (Number(version.split('.')[1]) << 8) : 0;
}
function parseLog(log) {
    const diagnostics = [];
    for (const line of log.split(/\r?\n/)) {
        const located = LOCATED.exec(line);
        if (located) {
            const [, severity, source, row, column, message] = located;
            diagnostics.push({
                severity: severity === 'ERROR' ? 'error' : 'warning',
                source,
                line: Number(row),
                ...(column ? { column: Number(column) } : {}),
                message,
            });
            continue;
        }
        const unlocated = UNLOCATED.exec(line);
        if (unlocated) {
            const [, severity, message] = unlocated;
            // Not totals like `1 compilation errors.  No code generated.`
            if (!TOTALS.test(message)) {
                diagnostics.push({ severity: severity === 'ERROR' ? 'error' : 'warning', source: '', message });
            }
            continue;
        }
        if (!line.trim()) {
            continue;
        }
        const last = diagnostics[diagnostics.length - 1];
        if (last) {
            last.message += `\n${line}`;
        }
    }
    return diagnostics;
}
/** `wasmBinary`: bytes of glslang.wasm, otherwise loaded next to glslang.js */
async function createGlslang(options = {}) {
    const load = async () => {
        const module = await createModule({ wasmBinary: options.wasmBinary, print() { }, printErr() { } });
        if (!module._initialize()) {
            throw new Error('glslang initialization failed');
        }
        return module;
    };
    let ready = load();
    await ready;
    const run = async (source, { stage, name = '', client = 'none', defaultVersion = 100, defaultProfile = 'none', include, preamble = '', vulkanVersion, spirvVersion, link = false, }, spirv) => {
        const module = await ready;
        const [sourcePointer, namePointer, preamblePointer] = [source, name, preamble].map(module.stringToNewUTF8);
        // Called by check.cpp per `#include`
        module.resolveInclude = (system, header, includer, depth) => {
            const result = include?.(header, { includer, system: system === 1, depth });
            return result ? module.stringToNewUTF8(`${result.name}\0${result.source}`) : 0;
        };
        let log;
        try {
            log = module.UTF8ToString(module._check(sourcePointer, namePointer, STAGES[stage], CLIENTS[client], defaultVersion, PROFILES[defaultProfile], include ? 1 : 0, preamblePointer, vulkanTarget(vulkanVersion), spirvTarget(spirvVersion), link ? 1 : 0, VERSION.test(source) ? 0 : 1, spirv ? 1 : 0));
        }
        catch (error) {
            // Trap, host stack overflow or throwing `include` leaves instance state unwound
            ready = load();
            throw error;
        }
        module._free(sourcePointer);
        module._free(namePointer);
        module._free(preamblePointer);
        // Copy out of WASM memory - next check overwrites it
        const length = module._spirvLength();
        const start = module._spirvData() / 4;
        const spirvWords = length ? module.HEAPU32.slice(start, start + length) : undefined;
        return { log, diagnostics: parseLog(log), spirv: spirvWords };
    };
    return {
        async check(source, options) {
            const { log, diagnostics } = await run(source, options, false);
            return { log, diagnostics };
        },
        async compile(source, options) {
            return run(source, { client: 'vulkan', ...options }, true);
        },
        async dispose() {
            (await ready)._finalize();
        },
    };
}
