use gpui::*;
use std::{borrow::Cow, collections::HashMap, path::PathBuf, sync::Arc};
#[derive(Clone)]
pub struct Assets(pub PathBuf);
impl AssetSource for Assets {
    fn load(&self, path: &str) -> anyhow::Result<Option<Cow<'static, [u8]>>> {
        Ok(std::fs::read(self.0.join(path)).ok().map(Cow::Owned))
    }
    fn list(&self, path: &str) -> anyhow::Result<Vec<SharedString>> {
        Ok(std::fs::read_dir(self.0.join(path))?
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string().into())
            .collect())
    }
}
pub struct Images {
    pub root: PathBuf,
    cache: HashMap<String, Arc<RenderImage>>,
}
impl Images {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            cache: HashMap::new(),
        }
    }
    pub fn get(&mut self, path: &str) -> Option<Arc<RenderImage>> {
        if let Some(i) = self.cache.get(path) {
            return Some(i.clone());
        }
        let bytes = std::fs::read(self.root.join(path)).ok()?;
        self.svg(path, &String::from_utf8(bytes).ok()?)
    }
    pub fn svg(&mut self, key: &str, source: &str) -> Option<Arc<RenderImage>> {
        if let Some(i) = self.cache.get(key) {
            return Some(i.clone());
        }
        let normalized = if source.contains("xmlns=") {
            source.to_owned()
        } else {
            source.replacen("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"", 1)
        };
        let tree =
            resvg::usvg::Tree::from_str(&normalized, &resvg::usvg::Options::default()).ok()?;
        let size = tree.size();
        let scale = 300. / size.width().max(size.height());
        let (w, h) = (
            (size.width() * scale).ceil() as u32,
            (size.height() * scale).ceil() as u32,
        );
        let mut pixmap = resvg::tiny_skia::Pixmap::new(w, h)?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::from_scale(scale, scale),
            &mut pixmap.as_mut(),
        );
        // RenderImage expects straight alpha BGRA; tiny-skia returns premultiplied RGBA.
        let mut bytes = pixmap.take();
        for p in bytes.chunks_exact_mut(4) {
            let a = p[3] as u32;
            if a > 0 {
                for c in &mut p[..3] {
                    *c = ((*c as u32 * 255 / a).min(255)) as u8;
                }
            }
            p.swap(0, 2);
        }
        let frame = image::Frame::new(image::RgbaImage::from_raw(w, h, bytes)?);
        let result = Arc::new(RenderImage::new(vec![frame]));
        self.cache.insert(key.to_owned(), result.clone());
        Some(result)
    }
}
