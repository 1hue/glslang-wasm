#version 450

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 color;

layout(set = 0, binding = 0) uniform sampler2D albedo;
layout(set = 0, binding = 1) uniform Material {
	vec4 tint;
	float exposure;
};

vec3 tonemap(vec3 hdr) {
	return hdr / (hdr + 1.0);
}

void main() {
	vec4 texel = texture(albedo, uv) * tint;
	color = vec4(tonemap(texel.rgb * exposure), texel.a);
}
