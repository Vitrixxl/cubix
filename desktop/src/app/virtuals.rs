use super::*;
impl Cubix {
    pub(super) fn virtual_rows(&mut self, key: &str, rows: Vec<Value>, cx: &Context<Self>) -> Div {
        let key = format!("{}:{}:{key}", self.page, self.puzzle);
        let entry = self.virtual_lists.entry(key).or_insert_with(|| {
            (
                ListState::new(rows.len(), ListAlignment::Top, px(120.)),
                std::rc::Rc::new(vec![]),
                0.,
            )
        });
        if *entry.1 != rows || entry.2 != self.width {
            let offset = entry.0.logical_scroll_top();
            entry.0.reset(rows.len());
            if offset.item_ix < rows.len() {
                entry.0.scroll_to(offset);
            }
            entry.1 = std::rc::Rc::new(rows);
            entry.2 = self.width;
        }
        let state = entry.0.clone();
        let rows = entry.1.clone();
        let weak = cx.entity().downgrade();
        div().flex_1().min_h_0().w_full().child(
            gpui::list(state, move |ix, _, cx| {
                weak.update(cx, |this, cx| {
                    this.virtual_row(&rows[ix], cx).into_any_element()
                })
                .unwrap_or_else(|_| div().into_any_element())
            })
            .size_full(),
        )
    }
    fn virtual_row(&mut self, model: &Value, cx: &Context<Self>) -> Div {
        #[cfg(feature = "reference")]
        {
            self.virtual_rows_rendered += 1;
        }
        let t = self.theme;
        match s(model, "kind") {
            "space" => div().h(px(number(&model["height"]) as f32)),
            "catalogHeader" => {
                let mut buttons = row().gap(px(4.));
                for set in list(&model["sets"]) {
                    buttons = buttons.child(
                        self.btn(
                            format!("set:{}", s(&set, "id")),
                            "",
                            s(&set, "id") == s(model, "active"),
                            cx,
                        )
                        .h(px(32.))
                        .px(px(12.))
                        .text_size(px(12.))
                        // The stage title already reads "ZBLL": its switches only name the corner pattern.
                        .child(
                            s(&set, "label")
                                .strip_prefix(&format!("{} ", s(model, "stage")))
                                .unwrap_or(s(&set, "label"))
                                .to_owned(),
                        )
                        .child(
                            txt(set["count"].to_string(), 12.)
                                .font_family("Geist Mono")
                                .font_weight(FontWeight::NORMAL)
                                .text_color(t.muted),
                        ),
                    );
                }
                row()
                    .w_full()
                    .min_h(px(44.))
                    .flex_wrap()
                    .justify_between()
                    .gap(px(8.))
                    .child(bold(s(model, "stage"), 20.))
                    .child(buttons)
            }
            "group" => row()
                .w_full()
                .h(px(42.))
                .justify_between()
                .child(
                    self.btn(format!("collapse:{}", s(model, "key")), "", false, cx)
                        .px(px(10.))
                        .gap(px(8.))
                        .text_size(px(15.))
                        .child(icon(
                            if model["open"] == true {
                                "IconChevronDown"
                            } else {
                                "IconChevronRight"
                            },
                            14.,
                        ))
                        .child(s(model, "label").to_owned())
                        .child(
                            txt(model["count"].to_string(), 12.).font_weight(FontWeight::NORMAL),
                        ),
                )
                .child(
                    self.btn(format!("train:{}", s(model, "key")), "", false, cx)
                        .text_size(px(12.))
                        .child(icon("IconTimer", 13.))
                        .child("Train all"),
                ),
            "selectorHeader" => {
                let key = s(model, "key");
                let count = number(&model["count"]) as usize;
                let total = number(&model["total"]) as usize;
                let checkbox = row()
                    .size(px(18.))
                    .flex_none()
                    .justify_center()
                    .rounded(px(6.))
                    .border(px(1.5))
                    .border_color(if count > 0 { t.accent } else { t.surface3 })
                    .bg(if count > 0 { t.accent } else { t.surface })
                    .text_color(gpui::white())
                    .when(count > 0, |d| {
                        d.child(icon(
                            if count == total {
                                "IconCheck"
                            } else {
                                "IconMinus"
                            },
                            12.,
                        ))
                    });
                col()
                    .w_full()
                    .gap(px(2.))
                    .pt(px(12.))
                    .child(
                        txt(s(model, "stage"), 11.)
                            .font_weight(FontWeight::BOLD)
                            .text_color(t.muted),
                    )
                    .child(
                        row()
                            .w_full()
                            .gap(px(4.))
                            .child(
                                self.btn(format!("selectSet:{key}"), "", false, cx)
                                    .w(px(32.))
                                    .h(px(38.))
                                    .flex_none()
                                    .px_0()
                                    .justify_center()
                                    .child(checkbox),
                            )
                            .child(
                                self.btn(format!("selectorToggle:{key}"), "", false, cx)
                                    .flex_1()
                                    .min_w_0()
                                    .h(px(38.))
                                    .px(px(12.))
                                    .gap(px(8.))
                                    .text_size(px(14.))
                                    .text_color(t.text)
                                    .child(txt(s(model, "label"), 14.).text_ellipsis())
                                    .child(
                                        txt(format!("{count}/{total}"), 12.)
                                            .flex_none()
                                            .font_family("Geist Mono")
                                            .text_color(t.muted),
                                    )
                                    .child(div().flex_1())
                                    .child(
                                        icon(
                                            if model["open"] == true {
                                                "IconMinus"
                                            } else {
                                                "IconPlus"
                                            },
                                            14.,
                                        )
                                        .text_color(t.muted),
                                    ),
                            ),
                    )
            }

            "selectorGroup" => row().w_full().pt(px(4.)).child(
                self.btn(format!("selectGroup:{}", s(model, "key")), "", false, cx)
                    .w_full()
                    .min_w_0()
                    .h(px(32.))
                    .px(px(10.))
                    .gap(px(8.))
                    .text_size(px(13.))
                    .text_color(t.secondary)
                    .child(txt(s(model, "label"), 13.).text_ellipsis())
                    .child(
                        txt(format!("{}/{}", model["count"], model["total"]), 12.)
                            .flex_none()
                            .font_family("Geist Mono")
                            .font_weight(FontWeight::NORMAL)
                            .text_color(t.muted),
                    ),
            ),
            "empty" => self.empty(s(model, "text")),
            "tiles" => {
                let tile = number(&model["width"]) as f32;
                let kind = s(model, "tileKind");
                let mut grid = row().items_start().gap(px(4.)).pb(px(4.));
                for id in list(&model["ids"]) {
                    let id = id.as_str().unwrap();
                    let c = self.find_case(id);
                    let short = id.split_once(' ').map(|(_, v)| v).unwrap_or(id);
                    if kind == "catalog" {
                        let pic = self.diagram(&c, if self.width <= 700. { 80. } else { 96. });
                        let stats = self.stats.iter().find(|st| st["caseId"] == id);
                        let learned = self.learned.contains(id);
                        let mut open = self
                            .btn(format!("case:{id}"), "", false, cx)
                            .flex_col()
                            .w_full()
                            .px_0()
                            .gap(px(2.))
                            .text_color(t.text)
                            .child(pic.mb(px(6.)))
                            .child(bold(short, 15.));
                        if s(&c, "name") != id {
                            open = open.child(txt(s(&c, "name"), 12.).text_color(t.secondary));
                        }
                        open = open.child(
                            txt(
                                stats
                                    .map(|st| format!("{} · {}", ft(&st["best"]), ft(&st["mean"])))
                                    .unwrap_or("—".into()),
                                12.,
                            )
                            .font_family("Geist Mono")
                            .font_weight(FontWeight::NORMAL)
                            .text_color(t.muted),
                        );
                        let learned_button = self
                            .btn(format!("learn:{id}"), "", false, cx)
                            .min_h(px(30.))
                            .min_w(px(80.))
                            .px(px(10.))
                            .mt(px(6.))
                            .rounded(px(10.))
                            .justify_center()
                            .gap(px(5.))
                            .text_size(px(11.))
                            .bg(if learned {
                                t.good.opacity(0.12)
                            } else {
                                t.hover
                            })
                            .text_color(if learned { t.good } else { t.muted })
                            .when(learned, |d| d.child(icon("IconCheck", 13.)))
                            .child(if learned { "Learned" } else { "To learn" });
                        grid = grid.child(
                            col()
                                .w(px(tile))
                                .flex_none()
                                .relative()
                                .pt(px(if self.width <= 700. { 10. } else { 14. }))
                                .pb(px(10.))
                                .px(px(6.))
                                .gap(px(2.))
                                .items_center()
                                .when(stats.is_some(), |d| {
                                    d.child(
                                        row()
                                            .justify_center()
                                            .absolute()
                                            .top(px(10.))
                                            .right(px(12.))
                                            .size(px(6.))
                                            .rounded_full()
                                            .bg(t.accent),
                                    )
                                })
                                .child(open)
                                .child(learned_button),
                        );
                    } else {
                        let selected = self.selected.contains(id);
                        let pic = self.diagram(&c, 58.);
                        grid = grid.child(
                            self.btn(format!("select:{id}"), "", false, cx)
                                .flex_col()
                                .w(px(tile))
                                .flex_none()
                                .px_0()
                                .pt(px(8.))
                                .pb(px(6.))
                                .gap(px(4.))
                                .rounded(px(14.))
                                .relative()
                                .bg(if selected {
                                    t.soft
                                } else {
                                    gpui::transparent_black()
                                })
                                .text_color(if selected { t.accent } else { t.secondary })
                                .child(pic)
                                .child(txt(short, 12.))
                                .when(selected, |d| {
                                    d.child(
                                        row()
                                            .justify_center()
                                            .absolute()
                                            .top(px(5.))
                                            .right(px(5.))
                                            .size(px(16.))
                                            .rounded_full()
                                            .bg(t.accent)
                                            .text_color(gpui::white())
                                            .child(icon("IconCheck", 10.)),
                                    )
                                }),
                        );
                    }
                }
                grid
            }
            "solve" => {
                let solve = &model["solve"];
                let id = solve["id"].to_string();
                let value = if solve["penalty"] == "dnf" {
                    "DNF".into()
                } else {
                    format!(
                        "{}{}",
                        time(
                            number(&solve["time_ms"])
                                + if solve["penalty"] == "+2" { 2000. } else { 0. }
                        ),
                        if solve["penalty"] == "+2" { "+" } else { "" }
                    )
                };
                let commented = !s(solve, "comment").is_empty();
                row()
                    .w_full()
                    .h(px(46.))
                    .gap(px(8.))
                    .child(
                        txt(model["index"].to_string(), 11.)
                            .flex_none()
                            .min_w(px(26.))
                            .whitespace_nowrap()
                            .font_family("Geist Mono")
                            .text_color(t.muted),
                    )
                    .child(
                        self.btn(format!("solve:{id}"), value, false, cx)
                            .px_0()
                            .font_family("Geist Mono")
                            .whitespace_nowrap()
                            .text_color(t.text)
                            .flex_1()
                            .when(commented, |d| {
                                d.child(icon("IconComment", 12.).text_color(t.muted))
                            }),
                    )
                    .child(
                        row()
                            .flex_none()
                            .gap(px(2.))
                            .child(
                                self.btn(
                                    format!("penalty:{id}:+2"),
                                    "+2",
                                    solve["penalty"] == "+2",
                                    cx,
                                )
                                .px(px(5.))
                                .text_size(px(12.)),
                            )
                            .child(
                                self.btn(
                                    format!("penalty:{id}:dnf"),
                                    "DNF",
                                    solve["penalty"] == "dnf",
                                    cx,
                                )
                                .px(px(5.))
                                .text_size(px(12.)),
                            )
                            .child(
                                self.btn(format!("comment:{id}"), "", false, cx)
                                    .px(px(5.))
                                    .when(commented, |d| d.text_color(t.accent))
                                    .child(icon("IconComment", 14.)),
                            )
                            .child(
                                self.btn(format!("delete:{id}"), "", false, cx)
                                    .px(px(5.))
                                    .hover(move |s| s.bg(t.hover).text_color(t.danger))
                                    .child(icon("IconTrash", 14.)),
                            ),
                    )
            }
            "sessionCase" => {
                let c = model["case"].clone();
                let solves = list(&model["solves"]);
                let id = s(&c, "id");
                let short = id.split_once(' ').map(|(_, v)| v).unwrap_or(id).to_owned();
                let effective = |solve: &Value| {
                    if solve["penalty"] == "dnf" {
                        None
                    } else {
                        Some(
                            number(&solve["time_ms"])
                                + if solve["penalty"] == "+2" { 2000. } else { 0. },
                        )
                    }
                };
                let valid: Vec<f64> = solves.iter().filter_map(effective).collect();
                let best = valid.iter().copied().reduce(f64::min);
                // The best time is the highlighted badge; only the mean needs words, once there is more than one time.
                let summary = (valid.len() > 1)
                    .then(|| format!("mean {}", time(valid.iter().sum::<f64>() / valid.len() as f64)));
                // Times as small square-cornered badges, newest first; a click opens the solve.
                let mut badges = row().flex_wrap().gap(px(6.));
                for solve in solves.iter().rev() {
                    let value = effective(solve);
                    let label = if solve["penalty"] == "dnf" {
                        "DNF".to_owned()
                    } else {
                        format!(
                            "{}{}",
                            time(value.unwrap_or(0.)),
                            if solve["penalty"] == "+2" { "+" } else { "" }
                        )
                    };
                    let is_best = value.is_some() && value == best;
                    let commented = !s(solve, "comment").is_empty();
                    badges = badges.child(
                        self.btn(format!("solve:{}", solve["id"]), label, false, cx)
                            .h(px(24.))
                            .min_h(px(24.))
                            .px(px(7.))
                            .gap(px(4.))
                            .rounded(px(6.))
                            .bg(if is_best { t.soft } else { t.surface2 })
                            .font_family("Geist Mono")
                            .text_size(px(12.))
                            .text_color(if solve["penalty"] == "dnf" {
                                t.danger
                            } else if is_best {
                                t.accent
                            } else {
                                t.text
                            })
                            .when(commented, |d| {
                                d.child(icon("IconComment", 11.).text_color(t.muted))
                            }),
                    );
                }
                // The case is named under its picture; beside it, its times or a plain dash while it has none.
                row()
                    .w_full()
                    .items_start()
                    .gap(px(14.))
                    .py(px(10.))
                    .child(
                        col()
                            .w(px(60.))
                            .flex_none()
                            .items_center()
                            .gap(px(5.))
                            .child(self.diagram(&c, 44.))
                            .child(
                                txt(short, 11.)
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(t.secondary)
                                    .whitespace_nowrap(),
                            ),
                    )
                    // As tall as the picture at least, so the dash or the times centre on it rather than on the name.
                    .child(
                        col()
                            .flex_1()
                            .min_w_0()
                            .min_h(px(44.))
                            .justify_center()
                            .gap(px(7.))
                            .when(solves.is_empty(), |d| {
                                d.child(
                                    div()
                                        .w(px(14.))
                                        .h(px(2.))
                                        .rounded(px(1.))
                                        .bg(t.muted.opacity(0.6)),
                                )
                            })
                            .when_some(summary, |d, summary| {
                                d.child(
                                    txt(summary, 11.)
                                        .font_family("Geist Mono")
                                        .whitespace_nowrap()
                                        .text_color(t.muted),
                                )
                            })
                            .when(!solves.is_empty(), |d| d.child(badges)),
                    )
            }
            _ => div(),
        }
    }
    pub(super) fn virtual_catalog(&mut self, cx: &Context<Self>) -> Div {
        let cases = self.all_cases();
        let sets = self.all_sets();
        let mut stages = Vec::new();
        for set in sets.iter() {
            let stage = s(set, "stage").to_owned();
            if !stages.contains(&stage) {
                stages.push(stage);
            }
        }
        let width = self.width.min(1100.) - if self.width <= 700. { 40. } else { 60. };
        let columns = ((width + 4.) / if self.width <= 700. { 100. } else { 132. })
            .floor()
            .max(1.) as usize;
        let tile = (width - 4. * (columns - 1) as f32) / columns as f32;
        let mut models = Vec::new();
        let mut total = 0;
        let mut learned = 0;
        for stage in &stages {
            let variants: Vec<_> = sets
                .iter()
                .filter(|v| s(v, "stage") == stage)
                .cloned()
                .collect();
            let active = variants
                .iter()
                .find(|v| self.sets.get(stage).is_some_and(|id| id == s(v, "id")))
                .unwrap_or(&variants[0]);
            let id = s(active, "id");
            models.push(json!({"kind":"catalogHeader","stage":stage,"sets":variants,"active":id}));
            let chosen: Vec<_> = cases.iter().filter(|c| s(c, "set") == id).collect();
            total += chosen.len();
            learned += chosen
                .iter()
                .filter(|c| self.learned.contains(s(c, "id")))
                .count();
            let chosen: Vec<_> = chosen
                .into_iter()
                .filter(|c| {
                    self.learning_filter == "all"
                        || (self.learning_filter == "learned") == self.learned.contains(s(c, "id"))
                })
                .collect();
            let mut groups = Vec::new();
            for c in &chosen {
                let group = s(c, "group");
                if !groups.contains(&group) {
                    groups.push(group);
                }
            }
            if chosen.is_empty() {
                models.push(json!({"kind":"empty","text":if self.learning_filter == "learned" { "No learned cases in this set yet." } else { "No not learned cases in this set." }}));
            }
            for group in groups {
                let key = format!("{id}:{group}");
                let chosen: Vec<_> = chosen
                    .iter()
                    .filter(|c| s(c, "group") == group)
                    .map(|c| s(c, "id"))
                    .collect();
                let open = !self.collapsed.contains(&key);
                models.push(json!({"kind":"group","key":key,"label":group,"count":chosen.len(),"open":open}));
                if open {
                    for row in chosen.chunks(columns) {
                        models.push(
                            json!({"kind":"tiles","tileKind":"catalog","width":tile,"ids":row}),
                        );
                    }
                }
                models.push(json!({"kind":"space","height":10}));
            }
            models.push(json!({"kind":"space","height":12}));
        }
        models.push(json!({"kind":"space","height":72}));
        let mut tabs = row().gap(px(4.));
        for stage in &stages {
            tabs = tabs.child(self.btn(
                format!("stage:{stage}"),
                stage,
                self.catalog_stage == *stage
                    || (self.catalog_stage.is_empty() && stages.first() == Some(stage)),
                cx,
            ));
        }
        let mut filters = row().gap(px(4.));
        for (filter, label, count) in [
            ("learned", "Learned", learned),
            ("not-learned", "Not learned", total - learned),
        ] {
            filters = filters.child(
                self.btn(
                    format!("learningFilter:{filter}"),
                    label,
                    self.learning_filter == filter,
                    cx,
                )
                .child(
                    txt(count.to_string(), 12.)
                        .font_family("Geist Mono")
                        .font_weight(FontWeight::NORMAL),
                ),
            );
        }
        let toolbar = row().flex_wrap().gap(px(12.)).child(tabs).child(filters);
        let body = self.virtual_rows("catalog", models, cx);
        col()
            .size_full()
            .gap(px(12.))
            .child(toolbar)
            .child(col().flex_1().min_h_0().pr(px(12.)).child(body))
    }
    pub(super) fn virtual_selector(&mut self, cx: &Context<Self>) -> Div {
        let cases = self.all_cases();
        let query = self.field("cases", cx).trim().to_lowercase();
        let width = if self.width >= 1024. && self.height >= 600. {
            ((self.width - 96.).min(1200.) / 4.28).clamp(220., 280.)
        } else {
            (self.width - 24.).min(560.) - 40.
        };
        let tile = (width - 8.) / 3.;
        let mut models = Vec::new();
        for set in self.all_sets().iter() {
            let id = s(set, "id");
            let ids: Vec<_> = cases
                .iter()
                .filter(|c| {
                    s(c, "set") == id
                        && format!("{} {} {}", s(c, "id"), s(c, "name"), s(c, "group"))
                            .to_lowercase()
                            .contains(&query)
                })
                .map(|c| s(c, "id"))
                .collect();
            if ids.is_empty() {
                continue;
            }
            let count = ids.iter().filter(|id| self.selected.contains(**id)).count();
            let open = self
                .selector_open
                .get(id)
                .copied()
                .unwrap_or(count > 0 || !query.is_empty());
            models.push(json!({"kind":"selectorHeader","key":id,"label":set["label"],"stage":set["stage"],"count":count,"total":ids.len(),"open":open}));
            if !open {
                continue;
            }
            // Same sub-headings as the algorithms page ("Connected Pairs", "Dot", …), each
            // toggling its whole group; a set with a single group keeps a plain grid.
            let mut groups: Vec<&str> = Vec::new();
            for c in cases.iter().filter(|c| s(c, "set") == id) {
                let group = s(c, "group");
                if !groups.contains(&group) {
                    groups.push(group);
                }
            }
            for group in &groups {
                let members: Vec<_> = cases
                    .iter()
                    .filter(|c| s(c, "set") == id && s(c, "group") == *group)
                    .map(|c| s(c, "id"))
                    .filter(|case_id| ids.contains(case_id))
                    .collect();
                if members.is_empty() {
                    continue;
                }
                if groups.len() > 1 {
                    let count = members
                        .iter()
                        .filter(|id| self.selected.contains(**id))
                        .count();
                    models.push(json!({"kind":"selectorGroup","key":format!("{id}:{group}"),"label":group,"count":count,"total":members.len()}));
                }
                for row in members.chunks(3) {
                    models
                        .push(json!({"kind":"tiles","tileKind":"selector","width":tile,"ids":row}));
                }
            }
        }
        let contents = self.virtual_rows("selector", models, cx);
        col()
            .size_full()
            .gap(px(10.))
            .child(
                row()
                    .w_full()
                    .h(px(40.))
                    .justify_between()
                    .child(bold("Cases", 16.))
                    .child(
                        self.btn("cases", "", false, cx)
                            .px(px(6.))
                            .child(icon("IconClose", 16.)),
                    ),
            )
            .child(
                row()
                    .w_full()
                    .h(px(30.))
                    .justify_between()
                    .child(
                        txt(format!("{} selected", self.selected.len()), 13.)
                            .text_color(self.theme.muted),
                    )
                    .child(self.btn("clear", "Clear", false, cx).px(px(6.))),
            )
            .child(self.input("cases"))
            .child(contents)
    }
}
