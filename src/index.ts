import createModule = require('./glslang.js');

export type Stage =
	| 'vertex'
	| 'tesscontrol'
	| 'tesseval'
	| 'geometry'
	| 'fragment'
	| 'compute'
	| 'raygen'
	| 'intersect'
	| 'anyhit'
	| 'closesthit'
	| 'miss'
	| 'callable'
	| 'task'
	| 'mesh';

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

const STAGES: Record<Stage, number> = {
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

const CLIENTS: Record<Client, number> = { none: 0, opengl: 1, vulkan: 2 };

// EProfile bits
const PROFILES: Record<Profile, number> = { none: 1, core: 2, compatibility: 4, es: 8 };

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
function vulkanTarget(version?: string): number {
	return version ? (1 << 22) | (Number(version.split('.')[1]) << 12) : 0;
}

/** `1.4` -> EShTargetLanguageVersion, 0 for default */
function spirvTarget(version?: string): number {
	return version ? (1 << 16) | (Number(version.split('.')[1]) << 8) : 0;
}

export function parseLog(log: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

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
export async function createGlslang(options: { wasmBinary?: Uint8Array } = {}): Promise<Glslang> {
	const load = async () => {
		const module = await createModule({ wasmBinary: options.wasmBinary, print() {}, printErr() {} });
		if (!module._initialize()) {
			throw new Error('glslang initialization failed');
		}
		return module;
	};

	let ready = load();
	await ready;

	const run = async (
		source: string,
		{
			stage,
			name = '',
			client = 'none',
			defaultVersion = 100,
			defaultProfile = 'none',
			include,
			preamble = '',
			vulkanVersion,
			spirvVersion,
			link = false,
		}: CheckOptions,
		spirv: boolean,
	): Promise<CompileResult> => {
		const module = await ready;
		const [sourcePointer, namePointer, preamblePointer] = [source, name, preamble].map(module.stringToNewUTF8);

		// Called by check.cpp per `#include`
		module.resolveInclude = (system, header, includer, depth) => {
			const result = include?.(header, { includer, system: system === 1, depth });
			return result ? module.stringToNewUTF8(`${result.name}\0${result.source}`) : 0;
		};

		let log: string;
		try {
			log = module.UTF8ToString(
				module._check(
					sourcePointer,
					namePointer,
					STAGES[stage],
					CLIENTS[client],
					defaultVersion,
					PROFILES[defaultProfile],
					include ? 1 : 0,
					preamblePointer,
					vulkanTarget(vulkanVersion),
					spirvTarget(spirvVersion),
					link ? 1 : 0,
					VERSION.test(source) ? 0 : 1,
					spirv ? 1 : 0,
				),
			);
		} catch (error) {
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
