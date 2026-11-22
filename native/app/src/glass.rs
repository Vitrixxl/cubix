//! The backdrop and the liquid glass (glass.wgsl): one wgpu pipeline, a uniform slot per pane, drawn in iced's own
//! render pass. `Glass` is a container whose content is drawn in a layer above its pane.
use iced::advanced::layout::{self, Layout};
use iced::advanced::widget::{Operation, Tree, Widget};
use iced::advanced::{Clipboard, Shell, mouse, overlay, renderer, renderer::Renderer as _};
use iced::widget::shader::Viewport;
use iced::{Color, Element, Event, Length, Padding, Rectangle, Size, Vector, wgpu};
use iced_wgpu::primitive::{self, Renderer as _};
use std::collections::HashMap;

/// One pane's uniforms (see `Pane` in glass.wgsl).
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, bytemuck::Pod, bytemuck::Zeroable)]
struct Pane {
    rect: [f32; 4],
    tint: [f32; 4],
    base: [f32; 4],
    params: [f32; 4],
    light: [f32; 4],
    misc: [f32; 4],
    window: [f32; 4],
}

const SLOT: u64 = 256;
// ponytail: a fixed pool of 512 panes a frame (128 KB); a growing buffer if a screen ever holds more glass than that.
const SLOTS: u64 = 512;
/// The backdrop is rendered at this fraction of the window's pixels: it is soft, and the glass blurs it anyway.
const SCENE_SCALE: f32 = 0.5;
const LEVELS: u32 = 7;
const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, bytemuck::Pod, bytemuck::Zeroable)]
struct Scene {
    res: [f32; 4],
}

fn fullscreen(device: &wgpu::Device, label: &str, module: &wgpu::ShaderModule, entry: &str, layout: &wgpu::BindGroupLayout, format: wgpu::TextureFormat, blend: Option<wgpu::BlendState>) -> wgpu::RenderPipeline {
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some(label), bind_group_layouts: &[layout], push_constant_ranges: &[] });
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState { module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState { module, entry_point: Some(entry), targets: &[Some(wgpu::ColorTargetState { format, blend, write_mask: wgpu::ColorWrites::ALL })], compilation_options: Default::default() }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn entry(binding: u32, ty: wgpu::BindingType) -> wgpu::BindGroupLayoutEntry { wgpu::BindGroupLayoutEntry { binding, visibility: wgpu::ShaderStages::FRAGMENT, ty, count: None } }

const TEXTURE: wgpu::BindingType = wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false };
const SAMPLER: wgpu::BindingType = wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering);

/// The backdrop's texture, its mip levels, and what renders them.
struct Target {
    size: (u32, u32),
    levels: Vec<wgpu::TextureView>,
    down: Vec<wgpu::BindGroup>,
    glass: wgpu::BindGroup,
}

pub struct Pipeline {
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    buffer: wgpu::Buffer,
    linear: bool,
    slots: HashMap<usize, u32>,
    scene: wgpu::RenderPipeline,
    scene_uniform: wgpu::Buffer,
    scene_group: wgpu::BindGroup,
    down: wgpu::RenderPipeline,
    down_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    target: Option<Target>,
    rendered: Option<(u32, u32)>,
}

impl Pipeline {
    /// The texture at `size`, made (with its bind groups) when the window's size changes.
    fn target(&mut self, device: &wgpu::Device, size: (u32, u32)) {
        if self.target.as_ref().is_some_and(|t| t.size == size) { return }
        let levels = LEVELS.min(32 - size.0.max(size.1).leading_zeros());
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("qbix backdrop"),
            size: wgpu::Extent3d { width: size.0, height: size.1, depth_or_array_layers: 1 },
            mip_level_count: levels,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let all = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let level_views: Vec<wgpu::TextureView> = (0..levels).map(|l| texture.create_view(&wgpu::TextureViewDescriptor { base_mip_level: l, mip_level_count: Some(1), ..Default::default() })).collect();
        let down = (1..levels as usize)
            .map(|l| {
                device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("qbix backdrop mip"),
                    layout: &self.down_layout,
                    entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&level_views[l - 1]) }, wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&self.sampler) }],
                })
            })
            .collect();
        let glass = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("qbix glass"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: &self.buffer, offset: 0, size: wgpu::BufferSize::new(std::mem::size_of::<Pane>() as u64) }) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&all) },
                wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&self.sampler) },
            ],
        });
        self.target = Some(Target { size, levels: level_views, down, glass });
        self.rendered = None;
    }

    /// Renders the ground and its mip chain once per window size, before the frame that samples them.
    fn render(&mut self, device: &wgpu::Device, queue: &wgpu::Queue) {
        let Some(target) = &self.target else { return };
        if self.rendered == Some(target.size) { return }
        queue.write_buffer(&self.scene_uniform, 0, bytemuck::bytes_of(&Scene { res: [target.size.0 as f32, target.size.1 as f32, 0.0, 0.0] }));
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("qbix backdrop") });
        let pass = |encoder: &mut wgpu::CommandEncoder, view: &wgpu::TextureView, pipeline: &wgpu::RenderPipeline, group: &wgpu::BindGroup| {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("qbix backdrop"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view, resolve_target: None, depth_slice: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store } })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, group, &[]);
            pass.draw(0..3, 0..1);
        };
        pass(&mut encoder, &target.levels[0], &self.scene, &self.scene_group);
        for (l, group) in target.down.iter().enumerate() {
            pass(&mut encoder, &target.levels[l + 1], &self.down, group);
        }
        queue.submit([encoder.finish()]);
        self.rendered = Some(target.size);
    }
}

impl primitive::Pipeline for Pipeline {
    fn new(device: &wgpu::Device, _queue: &wgpu::Queue, format: wgpu::TextureFormat) -> Self {
        let module = |label, source: &'static str| device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some(label), source: wgpu::ShaderSource::Wgsl(source.into()) });
        let glass = module("qbix glass", include_str!("glass.wgsl"));
        let scene_module = module("qbix scene", include_str!("scene.wgsl"));
        let down_module = module("qbix mip", include_str!("down.wgsl"));
        let uniform = |dynamic, size: usize| wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: dynamic, min_binding_size: wgpu::BufferSize::new(size as u64) };
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("qbix glass"), entries: &[entry(0, uniform(true, std::mem::size_of::<Pane>())), entry(1, TEXTURE), entry(2, SAMPLER)] });
        let scene_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("qbix scene"), entries: &[entry(0, uniform(false, std::mem::size_of::<Scene>()))] });
        let down_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("qbix mip"), entries: &[entry(0, TEXTURE), entry(1, SAMPLER)] });
        let buffer = device.create_buffer(&wgpu::BufferDescriptor { label: Some("qbix glass panes"), size: SLOT * SLOTS, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let scene_uniform = device.create_buffer(&wgpu::BufferDescriptor { label: Some("qbix scene"), size: std::mem::size_of::<Scene>() as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let scene_group = device.create_bind_group(&wgpu::BindGroupDescriptor { label: Some("qbix scene"), layout: &scene_layout, entries: &[wgpu::BindGroupEntry { binding: 0, resource: scene_uniform.as_entire_binding() }] });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("qbix backdrop"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        Self {
            pipeline: fullscreen(device, "qbix glass", &glass, "fs", &layout, format, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING)),
            layout,
            buffer,
            linear: format.is_srgb(),
            slots: HashMap::new(),
            scene: fullscreen(device, "qbix scene", &scene_module, "fs", &scene_layout, FORMAT, None),
            scene_uniform,
            scene_group,
            down: fullscreen(device, "qbix mip", &down_module, "down", &down_layout, FORMAT, None),
            down_layout,
            sampler,
            target: None,
            rendered: None,
        }
    }

    fn trim(&mut self) { self.slots.clear() }
}

#[derive(Debug)]
pub struct Primitive(Pane);

impl primitive::Primitive for Primitive {
    type Pipeline = Pipeline;

    fn prepare(&self, pipeline: &mut Pipeline, device: &wgpu::Device, queue: &wgpu::Queue, _bounds: &Rectangle, viewport: &Viewport) {
        let physical = viewport.physical_size();
        let size = (((physical.width as f32 * SCENE_SCALE) as u32).max(1), ((physical.height as f32 * SCENE_SCALE) as u32).max(1));
        pipeline.target(device, size);
        if self.0.misc[1] < 0.5 { pipeline.render(device, queue) }
        let slot = pipeline.slots.len() as u32;
        if slot as u64 >= SLOTS { return }
        let mut pane = self.0;
        let logical = viewport.logical_size();
        pane.misc[0] = viewport.scale_factor();
        pane.misc[2] = if pipeline.linear { 1.0 } else { 0.0 };
        pane.window[0] = logical.width;
        pane.window[1] = logical.height;
        queue.write_buffer(&pipeline.buffer, slot as u64 * SLOT, bytemuck::bytes_of(&pane));
        // A primitive stays at one address from its preparation to its drawing within a frame.
        pipeline.slots.insert(self as *const Self as usize, slot);
    }

    fn draw(&self, pipeline: &Pipeline, pass: &mut wgpu::RenderPass<'_>) -> bool {
        let (Some(slot), Some(target)) = (pipeline.slots.get(&(self as *const Self as usize)), &pipeline.target) else { return true };
        pass.set_pipeline(&pipeline.pipeline);
        pass.set_bind_group(0, &target.glass, &[*slot * SLOT as u32]);
        pass.draw(0..3, 0..1);
        true
    }
}

fn rgba(c: Color, a: f32) -> [f32; 4] { [c.r, c.g, c.b, a] }

/// How a pane of glass looks.
#[derive(Clone, Copy, Debug)]
pub struct Material {
    pub tint: Color,
    pub tint_amount: f32,
    /// The surface the pane sits on, when it is not the backdrop (a button on the sheet).
    pub base: Option<Color>,
    pub radius: f32,
    pub refraction: f32,
    pub frost: f32,
    pub shadow: f32,
    pub shadow_blur: f32,
}

impl Material {
    fn pane(&self, bounds: Rectangle, light: [f32; 4], opacity: f32) -> Pane {
        Pane {
            rect: [bounds.x, bounds.y, bounds.width, bounds.height],
            tint: rgba(self.tint, self.tint_amount),
            base: self.base.map_or([0.0; 4], |b| rgba(b, b.a)),
            params: [self.radius, self.refraction, self.shadow, self.shadow_blur],
            light,
            misc: [1.0, 1.0, 0.0, self.frost],
            window: [0.0, 0.0, opacity, 0.0],
        }
    }

    /// How far its shadow reaches past its bounds.
    pub fn reach(&self) -> f32 { self.shadow_blur * 1.8 + 2.0 }
}

/// Draws a pane of `material` at `bounds`, lit from the pointer.
pub fn draw_pane(renderer: &mut iced::Renderer, material: &Material, bounds: Rectangle, cursor: mouse::Cursor, hover: f32, press: f32, opacity: f32) {
    let light = match cursor.position() {
        Some(p) => [p.x, p.y, hover, press],
        None => [-1.0, -1.0, hover, press],
    };
    let reach = material.reach();
    let area = bounds.expand(reach);
    renderer.draw_primitive(area, Primitive(material.pane(bounds, light, opacity)));
}

/// The window's ground, behind everything.
pub struct Backdrop;

impl<Message> Widget<Message, iced::Theme, iced::Renderer> for Backdrop {
    fn size(&self) -> Size<Length> { Size::new(Length::Fill, Length::Fill) }

    fn layout(&mut self, _tree: &mut Tree, _renderer: &iced::Renderer, limits: &layout::Limits) -> layout::Node { layout::atomic(limits, Length::Fill, Length::Fill) }

    fn draw(&self, _tree: &Tree, renderer: &mut iced::Renderer, _theme: &iced::Theme, _style: &renderer::Style, layout: Layout<'_>, _cursor: mouse::Cursor, _viewport: &Rectangle) {
        let mut pane = Pane::default();
        pane.misc = [1.0, 0.0, 0.0, 0.0];
        pane.window = [0.0, 0.0, 1.0, 0.0];
        renderer.draw_primitive(layout.bounds(), Primitive(pane));
    }
}

impl<'a, Message: 'a> From<Backdrop> for Element<'a, Message> {
    fn from(b: Backdrop) -> Self { Element::new(b) }
}

/// A container of glass: its pane, then its content in a layer above.
pub struct Glass<'a, Message> {
    content: Element<'a, Message>,
    material: Material,
    padding: Padding,
    width: Length,
    height: Length,
    opacity: f32,
}

pub fn glass<'a, Message>(material: Material, content: impl Into<Element<'a, Message>>) -> Glass<'a, Message> {
    Glass { content: content.into(), material, padding: Padding::ZERO, width: Length::Shrink, height: Length::Shrink, opacity: 1.0 }
}

impl<'a, Message> Glass<'a, Message> {
    pub fn padding(mut self, p: impl Into<Padding>) -> Self {
        self.padding = p.into();
        self
    }
    pub fn width(mut self, w: impl Into<Length>) -> Self {
        self.width = w.into();
        self
    }
    pub fn height(mut self, h: impl Into<Length>) -> Self {
        self.height = h.into();
        self
    }
    /// Fades the pane (its content fades by its own colours).
    pub fn opacity(mut self, o: f32) -> Self {
        self.opacity = o;
        self
    }
}

impl<'a, Message> Widget<Message, iced::Theme, iced::Renderer> for Glass<'a, Message> {
    fn size(&self) -> Size<Length> { Size::new(self.width, self.height) }
    fn children(&self) -> Vec<Tree> { vec![Tree::new(&self.content)] }
    fn diff(&self, tree: &mut Tree) { tree.diff_children(std::slice::from_ref(&self.content)) }

    fn layout(&mut self, tree: &mut Tree, renderer: &iced::Renderer, limits: &layout::Limits) -> layout::Node {
        layout::padded(limits, self.width, self.height, self.padding, |l| self.content.as_widget_mut().layout(&mut tree.children[0], renderer, l))
    }

    fn operate(&mut self, tree: &mut Tree, layout: Layout<'_>, renderer: &iced::Renderer, operation: &mut dyn Operation) {
        self.content.as_widget_mut().operate(&mut tree.children[0], layout.children().next().unwrap(), renderer, operation)
    }

    fn update(&mut self, tree: &mut Tree, event: &Event, layout: Layout<'_>, cursor: mouse::Cursor, renderer: &iced::Renderer, clipboard: &mut dyn Clipboard, shell: &mut Shell<'_, Message>, viewport: &Rectangle) {
        self.content.as_widget_mut().update(&mut tree.children[0], event, layout.children().next().unwrap(), cursor, renderer, clipboard, shell, viewport)
    }

    fn mouse_interaction(&self, tree: &Tree, layout: Layout<'_>, cursor: mouse::Cursor, viewport: &Rectangle, renderer: &iced::Renderer) -> mouse::Interaction {
        self.content.as_widget().mouse_interaction(&tree.children[0], layout.children().next().unwrap(), cursor, viewport, renderer)
    }

    fn draw(&self, tree: &Tree, renderer: &mut iced::Renderer, theme: &iced::Theme, style: &renderer::Style, layout: Layout<'_>, cursor: mouse::Cursor, viewport: &Rectangle) {
        if self.opacity <= 0.001 { return }
        draw_pane(renderer, &self.material, layout.bounds(), cursor, 0.0, 0.0, self.opacity);
        renderer.with_layer(*viewport, |r| self.content.as_widget().draw(&tree.children[0], r, theme, style, layout.children().next().unwrap(), cursor, viewport));
    }

    fn overlay<'b>(&'b mut self, tree: &'b mut Tree, layout: Layout<'b>, renderer: &iced::Renderer, viewport: &Rectangle, translation: Vector) -> Option<overlay::Element<'b, Message, iced::Theme, iced::Renderer>> {
        self.content.as_widget_mut().overlay(&mut tree.children[0], layout.children().next().unwrap(), renderer, viewport, translation)
    }
}

impl<'a, Message: 'a> From<Glass<'a, Message>> for Element<'a, Message> {
    fn from(g: Glass<'a, Message>) -> Self { Element::new(g) }
}
