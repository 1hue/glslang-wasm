export type Stage = 'vertex' | 'tesscontrol' | 'tesseval' | 'geometry' | 'fragment' | 'compute' | 'raygen' | 'intersect' | 'anyhit' | 'closesthit' | 'miss' | 'callable' | 'task' | 'mesh';
/** `none`: plain GLSL, `opengl`/`vulkan`: SPIR-V rules for that client */
export type Client = 'none' | 'opengl' | 'vulkan';
export type Profile = 'none' | 'core' | 'compatibility' | 'es';
export interface Include {
    /** Resolved name, used as `includer` for nested includes and in diagnostics */
    name: string;
    source: string;
}
export interface IncludeContext {
    /** Name of the including source */
    includer: string;
    /** `<...>` rather than `"..."`. A failed `"..."` is retried as system */
    system: boolean;
    depth: number;
}
/** Synchronous; undefined when not found */
export type IncludeResolver = (header: string, context: IncludeContext) => Include | undefined;
export interface CheckOptions {
    stage: Stage;
    /** Source name in diagnostics and `includer` for its includes. Default: string index `0` */
    name?: string;
    /** Enables `#include` (GL_GOOGLE_include_directive, no `#extension` needed) */
    include?: IncludeResolver;
    /** Text before the source (after `#version`), e.g. declarations. Not part of source line numbers */
    preamble?: string;
    /** Default `none` */
    client?: Client;
    /** Used without `#version`. Default 100 */
    defaultVersion?: number;
    /** Used without `#version`. Default `none` */
    defaultProfile?: Profile;
    /** `vulkan` client version. Default 1.4 */
    vulkanVersion?: '1.0' | '1.1' | '1.2' | '1.3' | '1.4';
    /** SPIR-V target for `vulkan`/`opengl`. Default 1.6 for Vulkan, 1.0 for OpenGL */
    spirvVersion?: '1.0' | '1.1' | '1.2' | '1.3' | '1.4' | '1.5' | '1.6';
    /** Also link as a single-stage program: missing entry point etc. Default false */
    link?: boolean;
}
/** Client `vulkan` by default, `none` can't produce SPIR-V. Always links */
export type CompileOptions = Omit<CheckOptions, 'link'>;
export interface Diagnostic {
    severity: 'error' | 'warning';
    /** Source name, include name, string index or name from `#line`. Empty for link errors */
    source: string;
    /** 1-based. None for link errors */
    line?: number;
    /** 1-based, when glslang reports one */
    column?: number;
    message: string;
}
export interface CheckResult {
    /** Raw glslang info log */
    log: string;
    diagnostics: Diagnostic[];
}
export interface CompileResult extends CheckResult {
    /** SPIR-V words. None when there are errors */
    spirv?: Uint32Array;
}
export interface Glslang {
    /**
     * Blocks while glslang runs; use a worker for a hard timeout.
     * Rejects on a WASM trap or stack overflow, then later calls use a fresh instance
     */
    check(source: string, options: CheckOptions): Promise<CheckResult>;
    /** Check, link and generate SPIR-V. Same blocking and recovery as check */
    compile(source: string, options: CompileOptions): Promise<CompileResult>;
    dispose(): Promise<void>;
}
export declare function parseLog(log: string): Diagnostic[];
/** `wasmBinary`: bytes of glslang.wasm, otherwise loaded next to glslang.js */
export declare function createGlslang(options?: {
    wasmBinary?: Uint8Array;
}): Promise<Glslang>;
