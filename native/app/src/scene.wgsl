// The backdrop: a calm periwinkle ground, lighter at the top left. Rendered at half the window's resolution into a
// texture whose mip chain the glass reads, blurred, behind each pane.

struct Scene {
    res: vec4<f32>, // target width, height
};

@group(0) @binding(0) var<uniform> scene: Scene;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
    return vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
}

fn glow(uv: vec2<f32>, at: vec2<f32>, reach: f32) -> f32 { return 1.0 - smoothstep(0.0, reach, length(uv - at)); }

@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = frag.xy / scene.res.xy;
    var c = vec3<f32>(0.886, 0.894, 0.961);
    c = mix(c, vec3<f32>(0.955, 0.958, 0.995), glow(uv, vec2<f32>(0.12, 0.0), 0.9) * 0.75);
    c = mix(c, vec3<f32>(0.840, 0.835, 0.955), glow(uv, vec2<f32>(0.95, 1.05), 0.8) * 0.6);
    c = mix(c, vec3<f32>(0.900, 0.880, 0.950), glow(uv, vec2<f32>(0.05, 1.0), 0.6) * 0.35);
    return vec4<f32>(c, 1.0);
}
