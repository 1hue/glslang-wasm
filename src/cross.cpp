// SPIR-V to GLSL and uniform list with SPIRV-Cross

#include <spirv_glsl.hpp>

#include <string>
#include <vector>

using namespace spirv_cross;

static std::string crossSource;
static std::string crossUniforms;

/** Empty for types a UI can't set */
static std::string typeName(const SPIRType &type) {
	if (type.basetype == SPIRType::SampledImage || type.basetype == SPIRType::Image) {
		std::string dimension;
		switch (type.image.dim) {
		case spv::Dim2D:
			dimension = "2D";
			break;
		case spv::Dim3D:
			dimension = "3D";
			break;
		case spv::DimCube:
			dimension = "Cube";
			break;
		default:
			return "";
		}
		return "sampler" + dimension + (type.image.arrayed ? "Array" : "") + (type.image.depth ? "Shadow" : "");
	}

	std::string scalar;
	std::string prefix;
	switch (type.basetype) {
	case SPIRType::Float:
		scalar = "float";
		break;
	case SPIRType::Int:
		scalar = "int";
		prefix = "i";
		break;
	case SPIRType::UInt:
		scalar = "uint";
		prefix = "u";
		break;
	case SPIRType::Boolean:
		scalar = "bool";
		prefix = "b";
		break;
	default:
		return "";
	}

	if (type.columns > 1) {
		std::string columns = std::to_string(type.columns);
		return type.columns == type.vecsize ? "mat" + columns : "mat" + columns + "x" + std::to_string(type.vecsize);
	}
	return type.vecsize == 1 ? scalar : prefix + "vec" + std::to_string(type.vecsize);
}

// Variable or member of block emitted as plain struct uniform
struct Entry {
	uint32_t id;
	uint32_t blockType;
	int member;
	std::string label;
	std::string type;
	unsigned size;
};

static void addEntry(std::vector<Entry> &entries, uint32_t id, uint32_t blockType, int member, const std::string &label,
	const SPIRType &type) {
	std::string kind = typeName(type);
	if (!kind.empty()) {
		entries.push_back({id, blockType, member, label, kind, type.array.empty() ? 1u : type.array[0]});
	}
}

static void addBlock(CompilerGLSL &compiler, std::vector<Entry> &entries, const Resource &resource) {
	const SPIRType &block = compiler.get_type(resource.base_type_id);
	for (uint32_t index = 0; index < block.member_types.size(); index++) {
		addEntry(entries, resource.id, resource.base_type_id, static_cast<int>(index),
			compiler.get_member_name(resource.base_type_id, index), compiler.get_type(block.member_types[index]));
	}
}

/** Uniform list like `[{"name":"block.color","label":"color","type":"vec3","size":1}]`. Names as in output */
static std::string toJson(CompilerGLSL &compiler, const std::vector<Entry> &entries) {
	std::string json = "[";
	for (const Entry &entry : entries) {
		std::string name = compiler.get_name(entry.id);
		if (entry.member >= 0) {
			name += "." + compiler.get_member_name(entry.blockType, static_cast<uint32_t>(entry.member));
		}
		json += json.size() > 1 ? "," : "";
		json += "{\"name\":\"" + name + "\",\"label\":\"" + entry.label + "\",\"type\":\"" + entry.type +
			"\",\"size\":" + std::to_string(entry.size) + "}";
	}
	return json + "]";
}

extern "C" {

// GLSL from last crossCompile
const char *crossCompileSource() { return crossSource.c_str(); }

// JSON uniform list from last crossCompile
const char *crossCompileUniforms() { return crossUniforms.c_str(); }

// version: GLSL version like 300. es: GLSL ES
// Returns 0 on success, else error message
const char *crossCompile(const uint32_t *words, int length, int version, int es) {
	try {
		CompilerGLSL compiler(words, static_cast<size_t>(length));

		CompilerGLSL::Options options = compiler.get_common_options();
		options.version = static_cast<uint32_t>(version);
		options.es = es != 0;
		options.vulkan_semantics = false;
		options.emit_uniform_buffer_as_plain_uniforms = true;
		options.fragment.default_float_precision = CompilerGLSL::Options::Highp;
		options.fragment.default_int_precision = CompilerGLSL::Options::Highp;
		compiler.set_common_options(options);

		// Combine separate texture and sampler into sampler2D named after texture
		compiler.build_combined_image_samplers();
		for (const CombinedImageSampler &combined : compiler.get_combined_image_samplers()) {
			compiler.set_name(combined.combined_id, compiler.get_name(combined.image_id));
		}

		ShaderResources resources = compiler.get_shader_resources();
		// Anonymous blocks like `uniform Block { ... }` get instance named after block
		for (const Resource &resource : resources.uniform_buffers) {
			if (compiler.get_name(resource.id).empty()) {
				compiler.set_name(resource.id, compiler.get_name(resource.base_type_id) + "_");
			}
		}
		for (const Resource &resource : resources.push_constant_buffers) {
			if (compiler.get_name(resource.id).empty()) {
				compiler.set_name(resource.id, compiler.get_name(resource.base_type_id) + "_");
			}
		}

		// Read labels first - compile renames reserved words like `noise`
		std::vector<Entry> entries;
		for (const Resource &resource : resources.gl_plain_uniforms) {
			addEntry(entries, resource.id, 0, -1, compiler.get_name(resource.id), compiler.get_type(resource.type_id));
		}
		for (const Resource &resource : resources.uniform_buffers) {
			addBlock(compiler, entries, resource);
		}
		for (const Resource &resource : resources.push_constant_buffers) {
			addBlock(compiler, entries, resource);
		}
		for (const Resource &resource : resources.sampled_images) {
			addEntry(entries, resource.id, 0, -1, compiler.get_name(resource.id), compiler.get_type(resource.type_id));
		}
		for (const CombinedImageSampler &combined : compiler.get_combined_image_samplers()) {
			addEntry(entries, combined.combined_id, 0, -1, compiler.get_name(combined.combined_id),
				compiler.get_type_from_variable(combined.image_id));
		}

		crossSource = compiler.compile();
		crossUniforms = toJson(compiler, entries);
		return nullptr;
	} catch (const std::exception &error) {
		crossSource.clear();
		crossUniforms = "[]";
		static std::string message;
		message = error.what();
		return message.c_str();
	}
}
}
