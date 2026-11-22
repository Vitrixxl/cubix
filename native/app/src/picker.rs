//! The puzzle menu at the top right of a page: the puzzle, how it is solved and what scrambles it gets.
use crate::icon::{self, icon};
use crate::press::{Look, press};
use crate::theme::*;
use crate::ui::{self, tx};
use iced::widget::{Space, column, row};
use iced::{Alignment, Element, Length};
use qbix_core::puzzles::{self, Context};
use qbix_core::t;

/// The button that opens the menu, naming what is chosen.
pub fn button<'a, M: Clone + 'a>(label: String, open: bool, a: f32, on: M) -> Element<'a, M> {
    press(if open { Look::Tab { on: true } } else { Look::Soft }, row![tx(label, 15.5, 600, fade(INK, a)), icon(if open { icon::CHEVRON_UP } else { icon::CHEVRON_DOWN }, 16.0, fade(INK3, a))].spacing(8).align_y(Alignment::Center)).padding([0, 15]).opacity(a).on_press(on).into()
}

pub fn menu<'a, M: Clone + 'a>(current: &Context, pick: impl Fn(Context) -> M + 'a) -> Element<'a, M> {
    let mut col = column![ui::label(t("Puzzle"))].spacing(10).width(Length::Fixed(470.0));
    let puzzles: Vec<&puzzles::Puzzle> = puzzles::puzzles().iter().collect();
    let item = |p: &puzzles::Puzzle| {
        let on = p.id == current.puzzle;
        let mut next = current.clone();
        next.puzzle = p.id.clone();
        if !puzzles::modes_of(&p.id).contains(&next.solve_mode.as_str()) { next.solve_mode = "standard".into() }
        if !qbix_core::scramble::timer_types(&p.id, &next.solve_mode).contains(&next.scramble_type) { next.scramble_type = "normal".into() }
        press(Look::Tab { on }, row![tx(t(&p.label), 15.0, if on { 650 } else { 550 }, if on { ACC_INK } else { INK }), Space::new().width(Length::Fill), icon(icon::CHECK, 15.0, if on { ACC_INK } else { fade(ACC_INK, 0.0) })].align_y(Alignment::Center)).width(Length::Fill).height(38).radius(13.0).padding([0, 13]).on_press(pick(next)).into()
    };
    let cols = 3;
    let per = puzzles.len().div_ceil(cols);
    col = col.push(row((0..cols).map(|c| column(puzzles.iter().skip(c * per).take(per).map(|p| item(p))).spacing(2).width(Length::Fill).into())).spacing(6));
    {
        let modes = puzzles::modes_of(&current.puzzle);
        if modes.len() > 1 {
            col = col.push(ui::label(t("Way of solving")));
            col = col.push(ui::pills(modes.iter().map(|m| {
                let mut next = current.clone();
                next.solve_mode = m.to_string();
                if !qbix_core::scramble::timer_types(&next.puzzle, m).contains(&next.scramble_type) { next.scramble_type = "normal".into() }
                (t(puzzles::mode_label(m)), pick(next), *m == current.solve_mode)
            }).collect()));
        }
        let types = qbix_core::scramble::timer_types(&current.puzzle, &current.solve_mode);
        if types.len() > 1 {
            col = col.push(ui::label(t("Scrambles")));
            col = col.push(ui::pills(types.iter().map(|s| {
                let mut next = current.clone();
                next.scramble_type = s.clone();
                (t(puzzles::scramble_label(s)), pick(next), *s == current.scramble_type)
            }).collect()));
        }
    }
    col.padding(8).into()
}
