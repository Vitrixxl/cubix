// Qbix's backdrop and liquid glass, in one pass per pane.
//
// The backdrop is an analytic function of the window position (a periwinkle ground lit by four soft colour fields),
// so a pane of glass does not read the framebuffer: it evaluates the backdrop where its lens bends the light, blurred,
// tinted, with a rim catching the light from the pointer and a soft shadow under it.

struct Pane {
    rect: vec4<f32>,   // x, y, width, height, logical px
    tint: vec4<f32>,   // the glass's own colour (sRGB) and how much of it covers what is behind
    base: vec4<f32>,   // the surface under the pane (sRGB, alpha = coverage), when it does not sit on the backdrop
    params: vec4<f32>, // radius, refraction (px), shadow opacity, shadow blur (px)
    light: vec4<f32>,  // pointer x, y (logical px, negative: none), hover 0..1, press 0..1
    misc: vec4<f32>,   // scale factor, kind (0 backdrop, 1 glass), output is linear (1) or as is (0), frost (blur px)
    window: vec4<f32>, // window width, height (logical px), opacity, unused
};

@group(0) @binding(0) var<uniform> pane: Pane;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    // One triangle covering the viewport, which the renderer sets to the primitive's bounds.
    let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
    return vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    let lo = c / 12.92;
    let hi = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
    return select(hi, lo, c <= vec3<f32>(0.04045));
}

// The backdrop's texture (scene.wgsl), rendered at half the window's resolution, with its blurred mip chain.
@group(0) @binding(1) var scene_texture: texture_2d<f32>;
@group(0) @binding(2) var scene_sampler: sampler;

fn backdrop(p: vec2<f32>, lod: f32) -> vec3<f32> {
    return textureSampleLevel(scene_texture, scene_sampler, p / max(pane.window.xy, vec2<f32>(1.0)), lod).rgb;
}

// What lies behind a pane at p: the backdrop, under the surface the pane sits on.
fn behind(p: vec2<f32>, lod: f32) -> vec3<f32> {
    return mix(backdrop(p, lod), pane.base.rgb, pane.base.a);
}

fn rounded_box(p: vec2<f32>, centre: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
    let q = abs(p - centre) - half + vec2<f32>(r);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// A little noise against banding on the large soft gradients.
fn dither(p: vec2<f32>) -> f32 {
    return (fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}

// Premultiplied output, in the target's colour space.
fn out(c: vec3<f32>, a: f32) -> vec4<f32> {
    var rgb = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    if pane.misc.z > 0.5 { rgb = to_linear(rgb); }
    return vec4<f32>(rgb * a, a);
}

@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let scale = pane.misc.x;
    let p = frag.xy / scale;
    let opacity = pane.window.z;

    if pane.misc.y < 0.5 {
        return out(backdrop(p, 0.0) + vec3<f32>(dither(frag.xy)), 1.0);
    }

    let half = pane.rect.zw * 0.5;
    let centre = pane.rect.xy + half;
    let radius = min(pane.params.x, min(half.x, half.y));
    let d = rounded_box(p, centre, half, radius);
    let hover = pane.light.z;
    let press = pane.light.w;

    // Shadow: a blurred copy of the shape, a little lower; it lifts under the pointer and settles when pressed.
    let blur = max(pane.params.w * (1.0 + 0.35 * hover - 0.45 * press), 0.5);
    let ds = rounded_box(p - vec2<f32>(0.0, blur * 0.3), centre, half, radius);
    let shadow = pane.params.z * (1.0 - smoothstep(-blur * 0.5, blur, ds)) * (1.0 + 0.45 * hover - 0.5 * press) * opacity;
    let shade = vec4<f32>(0.0, 0.0, 0.0, shadow);

    let cover = clamp(0.5 - d * scale, 0.0, 1.0) * opacity;
    if cover <= 0.0 {
        return out(vec3<f32>(0.10, 0.11, 0.27), shadow);
    }

    // The rim's normal, from the distance field.
    let e = 0.75;
    let n = normalize(vec2<f32>(
        rounded_box(p + vec2<f32>(e, 0.0), centre, half, radius) - rounded_box(p - vec2<f32>(e, 0.0), centre, half, radius),
        rounded_box(p + vec2<f32>(0.0, e), centre, half, radius) - rounded_box(p - vec2<f32>(0.0, e), centre, half, radius)) + vec2<f32>(1e-5));

    // The lens: light bends towards the centre near the rim, more the closer to it.
    // A lens band along the rim, as wide as the glass allows up to 34 px.
    let band = clamp(min(half.x, half.y) * 0.6, 6.0, 34.0);
    let depth = clamp(-d / band, 0.0, 1.0);
    let bend = pow(1.0 - depth, 2.0) * pane.params.y * (1.0 + 0.3 * press);
    let q = p + n * bend;

    // Frost: the backdrop read from the mip level as wide as the frost, plus four taps around to smooth its texels;
    // each channel bent a little differently at the rim.
    let frost = pane.misc.w;
    let lod = log2(max(frost * scale * 0.5, 1.0));
    let fringe = n * bend * 0.22;
    var c = vec3<f32>(behind(q - fringe, lod).r, behind(q, lod).g, behind(q + fringe, lod).b) * 0.4;
    let o = frost * 0.5;
    c += (behind(q + vec2<f32>(o, o), lod) + behind(q + vec2<f32>(-o, o), lod) + behind(q + vec2<f32>(o, -o), lod) + behind(q + vec2<f32>(-o, -o), lod)) * 0.15;

    // The glass's own colour, lighter under the pointer, deeper when pressed.
    c = mix(c, pane.tint.rgb, pane.tint.a);
    c = c * (1.0 + 0.045 * hover - 0.08 * press);

    // Light: a sheen from the top, and the rim lit from the pointer (from the top left without one).
    let top = clamp((p.y - pane.rect.y) / max(pane.rect.w, 1.0), 0.0, 1.0);
    c += vec3<f32>(0.04) * (1.0 - top) * (1.0 - top);
    var dir = normalize(vec2<f32>(-0.45, -0.9));
    if pane.light.x >= 0.0 {
        let towards = normalize(pane.light.xy - centre + vec2<f32>(1e-3));
        dir = normalize(mix(dir, towards, 0.3 + 0.6 * hover));
    }
    let rim = 1.0 - smoothstep(0.0, 2.2 + 1.0 * hover, -d);
    let facing = max(dot(n, dir), 0.0);
    // The rim catches the light: a bright line where it faces it, a faint one all around.
    c = mix(c, vec3<f32>(1.0), rim * (0.22 + 0.70 * pow(facing, 1.4)) * (0.85 + 0.15 * hover));
    // The rim facing away is darker: the glass has a thickness.
    c -= vec3<f32>(0.10, 0.10, 0.07) * rim * pow(max(-dot(n, dir), 0.0), 1.6);
    // A wide glint inside the lit edge, and the lens gathering light along the whole rim.
    let inner = 1.0 - smoothstep(0.0, band * 0.9, -d);
    // Large panes keep a finer glint than small drops.
    let glint = 1.0 - 0.65 * smoothstep(12.0, 34.0, band);
    c += vec3<f32>(1.0) * inner * (0.04 + 0.16 * pow(facing, 3.0)) * glint;
    c += vec3<f32>(dither(frag.xy));

    // The glass over its own shadow.
    let glass = out(c, cover);
    let under = out(vec3<f32>(0.10, 0.11, 0.27), shadow);
    return glass + under * (1.0 - cover);
}
