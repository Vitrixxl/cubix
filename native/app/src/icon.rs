//! Lucide icons (ISC licence), drawn from its font like text so they stay sharp and tinted at any size.
use crate::theme::ICONS;
use iced::widget::{Text, text};
use iced::{Color, alignment};

pub const TIMER: char = '\u{e1df}';
pub const TARGET: char = '\u{e183}';
pub const GRID: char = '\u{e0ec}';
pub const SWORDS: char = '\u{e2b3}';
pub const USERS: char = '\u{e1a3}';
pub const BLUETOOTH: char = '\u{e060}';
pub const HELP: char = '\u{e082}';
pub const SETTINGS: char = '\u{e157}';
pub const CHEVRON_DOWN: char = '\u{e071}';
pub const CHEVRON_RIGHT: char = '\u{e073}';
pub const CHEVRON_LEFT: char = '\u{e072}';
pub const CHEVRON_UP: char = '\u{e074}';
pub const PANEL_RIGHT: char = '\u{e435}';
pub const PANEL_BOTTOM: char = '\u{e430}';
pub const CLOSE: char = '\u{e1b1}';
pub const UNDO: char = '\u{e2a0}';
pub const TRASH: char = '\u{e18d}';
pub const CHECK: char = '\u{e070}';
pub const LIST: char = '\u{e10b}';
pub const REFRESH: char = '\u{e148}';
pub const BACK: char = '\u{e04c}';
pub const PLUS: char = '\u{e140}';
pub const SEARCH: char = '\u{e154}';
pub const PLAY: char = '\u{e13f}';
pub const PAUSE: char = '\u{e131}';
pub const NEXT: char = '\u{e163}';
pub const PREVIOUS: char = '\u{e162}';
pub const RESET: char = '\u{e14b}';
pub const FLAME: char = '\u{e0d7}';
pub const TROPHY: char = '\u{e376}';
pub const CALENDAR: char = '\u{e067}';
pub const USER: char = '\u{e46c}';
pub const CHAT: char = '\u{e119}';
pub const SEND: char = '\u{e155}';
pub const LOG_OUT: char = '\u{e111}';
pub const SHARE: char = '\u{e159}';
pub const PENCIL: char = '\u{e1f8}';
pub const LAYERS: char = '\u{e52d}';
pub const EYE: char = '\u{e0be}';
pub const SPARKLES: char = '\u{e416}';
pub const SLIDERS: char = '\u{e299}';
pub const DONE: char = '\u{e225}';
pub const CIRCLE: char = '\u{e07a}';
pub const CHART: char = '\u{e2a4}';
pub const CLOUD: char = '\u{e08c}';
pub const CLOUD_OFF: char = '\u{e091}';
pub const WIFI_OFF: char = '\u{e1ae}';
pub const ALERT: char = '\u{e192}';
pub const USER_PLUS: char = '\u{e1a1}';
pub const USER_X: char = '\u{e1a2}';
pub const TRENDING_UP: char = '\u{e190}';
pub const ACTIVITY: char = '\u{e038}';
pub const BOX: char = '\u{e065}';

pub fn icon<'a>(glyph: char, size: f32, color: Color) -> Text<'a> {
    text(glyph.to_string()).font(ICONS).size(size).color(color).line_height(1.0).align_x(alignment::Horizontal::Center).align_y(alignment::Vertical::Center)
}
