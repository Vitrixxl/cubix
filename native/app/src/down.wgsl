@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
    return vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
}

// The mip chain: each level is the one above it, averaged over four bilinear taps.
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@fragment
fn down(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<f32>(textureDimensions(source)) * 0.5;
    let uv = frag.xy / size;
    let t = 0.5 / size;
    return 0.25 * (textureSampleLevel(source, smp, uv + vec2<f32>(-t.x, -t.y), 0.0) + textureSampleLevel(source, smp, uv + vec2<f32>(t.x, -t.y), 0.0)
        + textureSampleLevel(source, smp, uv + vec2<f32>(-t.x, t.y), 0.0) + textureSampleLevel(source, smp, uv + vec2<f32>(t.x, t.y), 0.0));
}
