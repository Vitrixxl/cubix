//! What a page gives the shell: its title, its pages (tabs), the tools at the top right, its body, its drawer and
//! what floats over the window. The shell lays them out the same way everywhere: on the desktop the rail, the sheet
//! and the drawer; on a phone the tab bar, the sheet and a sheet rising from the bottom.
use iced::Element;

pub struct Drawer<'a, M> {
    /// Whether it is open: the shell keeps drawing a closing drawer until it is gone.
    pub open: bool,
    /// What it shows: a change cross-fades the content.
    pub key: String,
    pub title: String,
    pub sub: Option<String>,
    pub back: Option<M>,
    pub close: M,
    pub body: Element<'a, M>,
}

pub struct View<'a, M> {
    pub title: String,
    pub tabs: Vec<(String, M, bool)>,
    pub tools: Vec<Element<'a, M>>,
    pub body: Element<'a, M>,
    pub drawer: Option<Drawer<'a, M>>,
    /// Menus and dialogs, over everything.
    pub overlay: Option<Element<'a, M>>,
    /// How much of the interface around the body shows (less while a solve runs).
    pub chrome: f32,
}

impl<'a, M: 'a> View<'a, M> {
    pub fn new(title: String, body: impl Into<Element<'a, M>>) -> Self { Self { title, tabs: vec![], tools: vec![], body: body.into(), drawer: None, overlay: None, chrome: 1.0 } }

    pub fn map<N: 'a>(self, f: impl Fn(M) -> N + Clone + 'a) -> View<'a, N>
    where
        M: Clone,
    {
        View {
            title: self.title,
            tabs: self.tabs.into_iter().map(|(n, m, on)| (n, f(m), on)).collect(),
            tools: self.tools.into_iter().map(|e| e.map(f.clone())).collect(),
            body: self.body.map(f.clone()),
            drawer: self.drawer.map(|d| Drawer { open: d.open, key: d.key, title: d.title, sub: d.sub, back: d.back.map(&f), close: f(d.close), body: d.body.map(f.clone()) }),
            overlay: self.overlay.map(|o| o.map(f.clone())),
            chrome: self.chrome,
        }
    }
}
