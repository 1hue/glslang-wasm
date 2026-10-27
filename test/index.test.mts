import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGlslang, parseLog } from '../dist/index.js';
import type { CheckResult } from '../dist/index.js';

const lines = (...text: string[]) => text.join('\n');

/** [line, column, message] per diagnostic */
function brief(result: CheckResult) {
	return result.diagnostics.map((d) => [d.line, d.column, d.message.trim()]);
}

test('reports errors with line and column', async () => {
	const glslang = await createGlslang();

	const result = await glslang.check(lines('#version 450', 'void main() { foo = 1; }'), { stage: 'fragment' });

	assert.deepEqual(brief(result), [[2, 15, "'foo' : undeclared identifier"]]);
});

test('valid ES shader is clean', async () => {
	const glslang = await createGlslang();
	const source = lines(
		'#version 300 es',
		'precision mediump float;',
		'out vec4 c;',
		'void main() { c = vec4(1); }',
	);

	const result = await glslang.check(source, { stage: 'fragment' });

	assert.deepEqual(brief(result), []);
});

test('defaults apply without #version, including profile', async () => {
	const glslang = await createGlslang();
	const source = lines('precision mediump float;', 'void main() { float x = 1; }');

	const result = await glslang.check(source, { stage: 'fragment', defaultVersion: 300, defaultProfile: 'es' });

	assert.deepEqual(brief(result), [[2, 21, "'=' :  cannot convert from ' const int' to ' temp mediump float'"]]);
});

test('vulkan client: opaque uniforms fine', async () => {
	const glslang = await createGlslang();
	const source = lines(
		'#version 450',
		'layout(set = 0, binding = 0) uniform sampler2D t;',
		'void main() {}',
	);

	const result = await glslang.check(source, { stage: 'fragment', client: 'vulkan' });

	assert.deepEqual(brief(result), []);
});

test('vulkan client: loose uniforms rejected', async () => {
	const glslang = await createGlslang();
	const source = lines('#version 450', 'uniform float u;', 'void main() {}');

	const result = await glslang.check(source, { stage: 'fragment', client: 'vulkan' });

	assert.match(result.diagnostics[0].message, /non-opaque uniforms/);
});

test('resolves nested includes and reports errors in them', async () => {
	const glslang = await createGlslang();
	const files: Record<string, string> = {
		'common.glsl': lines('#include "nested.glsl"', 'float twice(float x) { return x * 2.0; }'),
		'nested.glsl': 'float bad() { return undefinedThing; }',
	};
	const calls: [string, string, number][] = [];
	const source = lines('#version 450', '#include "common.glsl"', 'void main() { twice(1.0); }');

	const result = await glslang.check(source, {
		stage: 'fragment',
		name: 'main.frag',
		include: (header, { includer, depth }) => {
			calls.push([header, includer, depth]);
			return header in files ? { name: header, source: files[header] } : undefined;
		},
	});

	assert.deepEqual(calls, [
		['common.glsl', 'main.frag', 1],
		['nested.glsl', 'common.glsl', 2],
	]);
	assert.equal(result.diagnostics.length, 1);
	assert.equal(result.diagnostics[0].source, 'nested.glsl');
	assert.equal(result.diagnostics[0].line, 1);
});

test('missing include is an error', async () => {
	const glslang = await createGlslang();
	const source = lines('#version 450', '#include "nope.glsl"', 'void main() {}');

	const result = await glslang.check(source, { stage: 'fragment', include: () => undefined });

	assert.match(result.diagnostics[0].message, /Could not process include directive/);
});

test('include without callback is an error', async () => {
	const glslang = await createGlslang();
	const source = lines('#version 450', '#include "nope.glsl"', 'void main() {}');

	const result = await glslang.check(source, { stage: 'fragment' });

	assert.match(result.diagnostics[0].message, /required extension not requested/);
});

test('preamble declarations are visible and outside line numbering', async () => {
	const glslang = await createGlslang();
	const source = lines('#version 450', 'void main() { float y = TIME; foo; }');

	const result = await glslang.check(source, { stage: 'fragment', preamble: 'float TIME;\n' });

	assert.deepEqual(brief(result), [[2, 31, "'foo' : undeclared identifier"]]);
});

test('link reports missing entry point without a line', async () => {
	const glslang = await createGlslang();
	const source = lines('#version 450', 'void helper() {}');

	const result = await glslang.check(source, { stage: 'fragment', link: true });

	assert.equal(result.diagnostics.length, 1);
	assert.equal(result.diagnostics[0].line, undefined);
	assert.match(result.diagnostics[0].message, /Missing entry point/);
});

const SPIRV_MAGIC = 0x07230203;

const COMPUTE = lines(
	'#version 450',
	'layout(local_size_x = 8) in;',
	'layout(set = 0, binding = 0) buffer Data { float values[]; };',
	'void main() { values[gl_GlobalInvocationID.x] *= 2.0; }',
);

test('compile produces SPIR-V for the requested version', async () => {
	const glslang = await createGlslang();

	const result = await glslang.compile(COMPUTE, { stage: 'compute', spirvVersion: '1.4' });

	assert.deepEqual(result.diagnostics, []);
	assert.ok(result.spirv instanceof Uint32Array);
	assert.equal(result.spirv[0], SPIRV_MAGIC);
	assert.equal(result.spirv[1], 0x00010400);
});

test('compile errors give diagnostics and no SPIR-V', async () => {
	const glslang = await createGlslang();
	const source = lines('#version 450', 'void main() { foo; }');

	const result = await glslang.compile(source, { stage: 'fragment' });

	assert.equal(result.spirv, undefined);
	assert.match(result.diagnostics[0].message, /undeclared identifier/);
});

test('compile without main is a link error and no SPIR-V', async () => {
	const glslang = await createGlslang();

	const result = await glslang.compile(lines('#version 450', 'void helper() {}'), { stage: 'fragment' });

	assert.equal(result.spirv, undefined);
	assert.match(result.diagnostics[0].message, /Missing entry point/);
});

test('SPIR-V from one compile is not reused by the next', async () => {
	const glslang = await createGlslang();

	const first = await glslang.compile(COMPUTE, { stage: 'compute' });
	const failed = await glslang.compile(lines('#version 450', 'void main() { foo; }'), { stage: 'compute' });
	const checked = await glslang.check(COMPUTE, { stage: 'compute', client: 'vulkan' });

	assert.ok(first.spirv);
	assert.equal(failed.spirv, undefined);
	assert.equal('spirv' in checked, false);
});

test('deep parentheses hit the parser limit as a normal error', async () => {
	const glslang = await createGlslang();
	const depth = 20000;
	const expression = '('.repeat(depth) + '1.0' + ')'.repeat(depth);
	const source = lines('#version 450', `void main() { float x = ${expression}; }`);

	const result = await glslang.check(source, { stage: 'fragment' });

	assert.match(result.diagnostics[0].message, /memory exhausted/);
});

test('recovers with a fresh instance after a stack overflow', async () => {
	const glslang = await createGlslang();
	const terms = Array(10000).fill('y').join(' + ');
	const deep = lines('#version 450', 'out float o;', `void main() { float y = 1.0; o = ${terms}; }`);
	const normal = lines('#version 450', 'void main() { foo; }');

	await assert.rejects(glslang.check(deep, { stage: 'fragment' }), RangeError);
	const after = await glslang.check(normal, { stage: 'fragment' });

	assert.deepEqual(brief(after), [[2, 15, "'foo' : undeclared identifier"]]);
});

test('parseLog keeps continuation lines and skips totals', () => {
	const log = lines(
		"ERROR: 0:3:5: 'x' : undeclared identifier",
		'ERROR: Linking fragment stage: Missing entry point: Each stage requires one entry point',
		'continued',
		'ERROR: 2 compilation errors.  No code generated.',
	);

	assert.deepEqual(parseLog(log), [
		{
			severity: 'error',
			source: '0',
			line: 3,
			column: 5,
			message: "'x' : undeclared identifier",
		},
		{
			severity: 'error',
			source: '',
			message: 'Linking fragment stage: Missing entry point: Each stage requires one entry point\ncontinued',
		},
	]);
});
