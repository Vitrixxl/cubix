use super::*;
fn inline(
    node: &Value,
    text: &mut String,
    links: &mut Vec<(std::ops::Range<usize>, String)>,
    highlights: &mut Vec<(std::ops::Range<usize>, HighlightStyle)>,
) {
    if let Some(t) = node.as_str() {
        text.push_str(t);
        return;
    }
    let start = text.len();
    for c in list(&node["children"]) {
        inline(&c, text, links, highlights);
    }
    let range = start..text.len();
    match s(node, "tag") {
        "a" => {
            links.push((range.clone(), s(node, "href").into()));
            highlights.push((
                range,
                HighlightStyle {
                    color: Some(rgb(0x68aaff).into()),
                    underline: Some(UnderlineStyle {
                        thickness: px(1.),
                        color: None,
                        wavy: false,
                    }),
                    ..Default::default()
                },
            ));
        }
        "strong" => highlights.push((
            range,
            HighlightStyle {
                font_weight: Some(FontWeight::BOLD),
                ..Default::default()
            },
        )),
        _ => {}
    }
}
impl Cubix {
    pub(super) fn guide_link(&mut self, href: &str, window: &mut Window, cx: &mut Context<Self>) {
        let page = match href {
            "/" => Some("playground"),
            "/algorithms/" => Some("algorithms"),
            "/training/" => Some("training"),
            _ => None,
        };
        if let Some(p) = page {
            self.action(&format!("nav:{p}"), window, cx);
            return;
        }
        if let Some((key, _)) = self
            .guides
            .as_object()
            .unwrap()
            .iter()
            .find(|(_, v)| v["path"] == href)
        {
            let previous = self.location();
            self.page = key.clone();
            self.record_navigation(previous);
            cx.notify();
            return;
        }
        cx.open_url(href);
    }
    fn guide_node(&mut self, node: &Value, key: String, width: f32, cx: &Context<Self>) -> Div {
        let tag = s(node, "tag");
        let class = s(node, "class");
        let children = list(&node["children"]);
        if ["p", "h1", "h2", "h3", "a", "summary", "li"].contains(&tag) || node.is_string() {
            let (mut text, mut links, mut highlights) = (String::new(), Vec::new(), Vec::new());
            inline(node, &mut text, &mut links, &mut highlights);
            let ranges = links.iter().map(|(r, _)| r.clone()).collect();
            let weak = cx.entity().downgrade();
            let content = InteractiveText::new(
                SharedString::from(key.clone()),
                StyledText::new(text).with_highlights(highlights),
            )
            .on_click(ranges, move |index, window, cx| {
                let _ = weak.update(cx, |this, cx| this.guide_link(&links[index].1, window, cx));
            });
            let mut d = div().child(content);
            match tag {
                "h1" => {
                    d = d
                        .max_w(px(760.))
                        .mt(px(8.))
                        .mb(px(20.))
                        .text_size(px((self.width * 0.04).clamp(30., 48.)))
                        .line_height(relative(1.15))
                        .font_weight(FontWeight::BOLD)
                }
                "h2" => {
                    d = d
                        .mt(px(32.))
                        .mb(px(12.))
                        .text_size(px(24.))
                        .line_height(relative(1.3))
                        .font_weight(FontWeight::BOLD)
                }
                "h3" => {
                    d = d
                        .mt(px(28.))
                        .mb(px(10.))
                        .text_size(px(20.))
                        .font_weight(FontWeight::BOLD)
                }
                "p" => d = d.my(px(12.)),
                "li" => d = d.my(px(10.)),
                _ => {}
            }
            if class == "public-lead" {
                d = d
                    .max_w(px(780.))
                    .text_size(px(if self.width <= 700. { 17. } else { 19. }))
                    .text_color(rgb(0xa9adba));
            }
            if class == "public-eyebrow" {
                d = d
                    .text_size(px(12.))
                    .font_weight(FontWeight::BOLD)
                    .text_color(rgb(0x3987e5));
            }
            return d;
        }
        if tag == "details" {
            let open = self.collapsed.contains(&key);
            let action = format!("collapse:{key}");
            let summary = children.first().cloned().unwrap_or_default();
            let mut text = String::new();
            inline(&summary, &mut text, &mut Vec::new(), &mut Vec::new());
            let mut d = col()
                .py(px(16.))
                .border_b_1()
                .border_color(rgb(0x30303a))
                .child(
                    self.btn(
                        action,
                        format!("{} {text}", if open { "▾" } else { "▸" }),
                        false,
                        cx,
                    )
                    .px_0()
                    .text_size(px(16.))
                    .text_color(rgb(0xeef0f5)),
                );
            if open {
                for (i, child) in children.iter().enumerate().skip(1) {
                    d = d.child(self.guide_node(child, format!("{key}-{i}"), width, cx));
                }
            }
            return d;
        }
        let grid = class == "public-grid" && self.width > 700.;
        let mut d = if grid {
            row().flex_wrap().items_start().gap_x(px(40.))
        } else {
            col()
        };
        if tag == "nav" {
            d = row()
                .flex_wrap()
                .gap_x(px(24.))
                .gap_y(px(12.))
                .mt(px(40.))
                .pt(px(24.))
                .border_t_1()
                .border_color(rgb(0x30303a));
        }
        if tag == "footer" {
            d = d.mt(px(28.)).text_size(px(13.)).text_color(rgb(0xa9adba));
        }
        if tag == "ol" {
            d = d.pl(px(24.));
        }
        for (i, child) in children.iter().enumerate() {
            let child_width = if grid { (width - 40.) / 2. } else { width };
            let item = self.guide_node(child, format!("{key}-{i}"), child_width, cx);
            d = d.child(if grid { item.w(px(child_width)) } else { item });
        }
        d
    }
    pub(super) fn guide_page(&mut self, cx: &Context<Self>) -> Div {
        let guide = self.guides[&self.page]["content"].clone();
        let compact = self.width <= 700.;
        let inner = (self.width - 15.).min(1040.);
        let padding = if compact { 22. } else { 28. };
        let content = self.guide_node(
            &guide,
            format!("guide:{}", self.page),
            inner - padding * 2.,
            cx,
        );
        let header = row()
            .w_full()
            .max_w(px(1096.))
            .mx_auto()
            .py(px(24.))
            .px(px(28.))
            .justify_between()
            .border_b_1()
            .border_color(rgb(0x30303a))
            .child(
                self.btn("nav:playground", "CUBIX", false, cx)
                    .px_0()
                    .text_size(px(16.))
                    .text_color(rgb(0xeef0f5)),
            )
            .child(
                self.btn("nav:playground", "Open cube timer", false, cx)
                    .px(px(18.))
                    .h(px(39.))
                    .rounded(px(8.))
                    .bg(rgb(0x245cc5))
                    .text_color(rgb(0xeef0f5))
                    .text_size(px(16.))
                    .font_weight(FontWeight::NORMAL),
            );
        let scroll = self.scroll("guide").pb_0().gap_0().child(header).child(
            col()
                .w_full()
                .max_w(px(1040.))
                .mx_auto()
                .px(px(padding))
                .pt(px(if compact { 40. } else { 64. }))
                .pb(px(40.))
                .child(content),
        );
        col()
            .size_full()
            .pr(px(15.))
            .bg(rgb(0x0b0b0e))
            .text_color(rgb(0xeef0f5))
            .font_weight(FontWeight::NORMAL)
            .text_size(px(16.))
            .line_height(relative(1.75))
            .child(scroll)
    }
}
