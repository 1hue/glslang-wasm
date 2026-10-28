// Single-stage GLSL check with optional link and SPIR-V

#include <glslang/Public/ResourceLimits.h>
#include <glslang/Public/ShaderLang.h>
#include <SPIRV/GlslangToSpv.h>

#include <emscripten.h>

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// Module.resolveInclude from index.js: malloc'd `name\0source` or 0
EM_JS(char *, resolveInclude, (int system, const char *header, const char *includer, int depth),
	{ return Module.resolveInclude(system, UTF8ToString(header), UTF8ToString(includer), depth); });

class Includer : public glslang::TShader::Includer {
public:
	IncludeResult *includeSystem(const char *header, const char *includer, size_t depth) override {
		return resolve(1, header, includer, depth);
	}

	IncludeResult *includeLocal(const char *header, const char *includer, size_t depth) override {
		return resolve(0, header, includer, depth);
	}

	void releaseInclude(IncludeResult *result) override {
		if (result) {
			free(result->userData);
			delete result;
		}
	}

private:
	IncludeResult *resolve(int system, const char *header, const char *includer, size_t depth) {
		char *data = resolveInclude(system, header, includer, static_cast<int>(depth));
		if (!data) {
			return nullptr;
		}
		size_t nameLength = strlen(data);
		const char *source = data + nameLength + 1;
		return new IncludeResult(std::string(data, nameLength), source, strlen(source), data);
	}
};

static std::string infoLog;
static std::vector<unsigned int> spirvWords;

extern "C" {

int initialize() { return glslang::InitializeProcess(); }

void finalize() { glslang::FinalizeProcess(); }

// SPIR-V from last check with spirv set
const unsigned int *spirvData() { return spirvWords.data(); }

int spirvLength() { return static_cast<int>(spirvWords.size()); }

// name: source name in diagnostics, empty for string index
// stage: EShLanguage
// client: 0 none, 1 OpenGL, 2 Vulkan
// defaultProfile: EProfile, used without `#version`
// includes: enable `#include` via Module.resolveInclude
// preamble: text before source outside its line numbering
// vulkanVersion, spirvVersion: EShTargetClientVersion, EShTargetLanguageVersion, 0 for defaults
// link: also link as single-stage program (missing entry point etc.)
// forceDefaults: no `#version` in source - glslang only applies defaultProfile when forced
// spirv: link and generate SPIR-V (needs OpenGL or Vulkan client)
// autoMap: assign missing locations and bindings like loose uniforms for OpenGL SPIR-V
const char *check(const char *source, const char *name, int stage, int client, int defaultVersion,
	int defaultProfile, int includes, const char *preamble, int vulkanVersion, int spirvVersion,
	int link, int forceDefaults, int spirv, int autoMap) {
	auto language = static_cast<EShLanguage>(stage);
	glslang::TShader shader(language);
	shader.setAutoMapLocations(autoMap != 0);
	shader.setAutoMapBindings(autoMap != 0);

	if (*name) {
		shader.setStringsWithLengthsAndNames(&source, nullptr, &name, 1);
	} else {
		shader.setStrings(&source, 1);
	}

	std::string fullPreamble = includes ? "#extension GL_GOOGLE_include_directive : enable\n" : "";
	fullPreamble += preamble;
	shader.setPreamble(fullPreamble.c_str());

	int messages = EShMsgDisplayErrorColumn | EShMsgCascadingErrors;

	switch (client) {
	case 1:
		shader.setEnvInput(glslang::EShSourceGlsl, language, glslang::EShClientOpenGL, 100);
		shader.setEnvClient(glslang::EShClientOpenGL, glslang::EShTargetOpenGL_450);
		shader.setEnvTarget(glslang::EShTargetSpv,
			spirvVersion ? static_cast<glslang::EShTargetLanguageVersion>(spirvVersion)
						 : glslang::EShTargetSpv_1_0);
		messages |= EShMsgSpvRules;
		break;
	case 2:
		shader.setEnvInput(glslang::EShSourceGlsl, language, glslang::EShClientVulkan, 100);
		shader.setEnvClient(glslang::EShClientVulkan,
			vulkanVersion ? static_cast<glslang::EShTargetClientVersion>(vulkanVersion)
						  : glslang::EShTargetVulkan_1_4);
		shader.setEnvTarget(glslang::EShTargetSpv,
			spirvVersion ? static_cast<glslang::EShTargetLanguageVersion>(spirvVersion)
						 : glslang::EShTargetSpv_1_6);
		messages |= EShMsgSpvRules | EShMsgVulkanRules;
		break;
	}

	Includer includer;
	bool parsed =
		shader.parse(GetDefaultResources(), defaultVersion, static_cast<EProfile>(defaultProfile),
			forceDefaults != 0, false, static_cast<EShMessages>(messages), includer);

	infoLog = shader.getInfoLog();

	spirvWords.clear();
	if ((link || spirv) && parsed) {
		glslang::TProgram program;
		program.addShader(&shader);
		bool linked = program.link(static_cast<EShMessages>(messages));
		infoLog += program.getInfoLog();
		if (spirv && linked && (!autoMap || program.mapIO())) {
			glslang::GlslangToSpv(*program.getIntermediate(language), spirvWords);
		}
	}
	return infoLog.c_str();
}
}
