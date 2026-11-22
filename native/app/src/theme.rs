//! Design C · Feuille: one periwinkle hue at every depth, Bricolage Grotesque, liquid glass for the surfaces.
use crate::glass::Material;
use iced::font::{Family, Weight};
use iced::{Color, Font};

const fn hex(rgb: u32) -> Color { Color::from_rgb8((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8) }

pub const SHEET: Color = hex(0xfcfcff);
pub const SOFT: Color = hex(0xeff0fa);
pub const INK: Color = hex(0x1e2046);
pub const INK2: Color = hex(0x4c5084);
pub const INK3: Color = hex(0x62669a);
pub const ACC: Color = hex(0x4a48c6);
pub const ACC_INK: Color = hex(0x3836a6);
pub const OK: Color = hex(0x1a7f53);
pub const OK_SOFT: Color = hex(0xdcf2e6);
pub const WARN: Color = hex(0x8f5c08);
pub const WARN_SOFT: Color = hex(0xfbefd0);
pub const BAD: Color = hex(0xbf3f3a);
pub const BAD_SOFT: Color = hex(0xfbe4e2);

pub fn mix(a: Color, b: Color, t: f32) -> Color {
    let t = t.clamp(0.0, 1.0);
    Color { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t }
}

pub fn fade(c: Color, a: f32) -> Color { Color { a: c.a * a.clamp(0.0, 1.0), ..c } }

/// Bricolage cut at optical size 14, for text (tabular figures baked in).
pub fn text(weight: u16) -> Font {
    Font {
        family: Family::Name("Bricolage Text"),
        weight: match weight {
            0..=449 => Weight::Normal,
            450..=549 => Weight::Medium,
            550..=649 => Weight::Semibold,
            _ => Weight::Bold,
        },
        ..Font::DEFAULT
    }
}

/// Bricolage cut at optical size 96, for the large numbers.
pub fn display(weight: u16) -> Font { Font { family: Family::Name("Bricolage Display"), weight: if weight >= 450 { Weight::Medium } else { Weight::Normal }, ..Font::DEFAULT } }

pub const ICONS: Font = Font::with_name("lucide");

pub const FONTS: [&[u8]; 7] = [
    include_bytes!("../assets/fonts/BricolageText-400.ttf"),
    include_bytes!("../assets/fonts/BricolageText-500.ttf"),
    include_bytes!("../assets/fonts/BricolageText-600.ttf"),
    include_bytes!("../assets/fonts/BricolageText-700.ttf"),
    include_bytes!("../assets/fonts/BricolageDisplay-400.ttf"),
    include_bytes!("../assets/fonts/BricolageDisplay-500.ttf"),
    include_bytes!("../assets/fonts/lucide.ttf"),
];

/// How much of the sheet's white covers the ground: what a pane sitting on the sheet sees behind it.
pub const SHEET_TINT: f32 = 0.52;
const ON_SHEET: Option<Color> = Some(Color { a: SHEET_TINT, ..SHEET });

/// The sheet and the drawer: frosted, nearly white, the ground's colour showing through at the rims.
pub const SHEET_GLASS: Material = Material { tint: SHEET, tint_amount: SHEET_TINT, base: None, radius: 34.0, refraction: 46.0, frost: 18.0, shadow: 0.14, shadow_blur: 36.0 };

/// The current section in the rail: a small lens of clear glass on the ground.
pub const DISC_GLASS: Material = Material { tint: SHEET, tint_amount: 0.38, base: None, radius: 99.0, refraction: 22.0, frost: 3.0, shadow: 0.16, shadow_blur: 12.0 };

/// The primary action: a drop of accent glass on the sheet.
pub const ACCENT_GLASS: Material = Material { tint: ACC, tint_amount: 0.78, base: ON_SHEET, radius: 99.0, refraction: 22.0, frost: 5.0, shadow: 0.24, shadow_blur: 16.0 };

/// The primary action while the timer is ready: the same drop, green.
pub const READY_GLASS: Material = Material { tint: OK, ..ACCENT_GLASS };

/// Menus and toasts: floating glass over the sheet.
pub const FLOAT_GLASS: Material = Material { tint: SHEET, tint_amount: 0.62, base: ON_SHEET, radius: 26.0, refraction: 30.0, frost: 18.0, shadow: 0.16, shadow_blur: 30.0 };

/// A phone's drawer, risen from the bottom: more opaque, it covers the page.
pub const BOTTOM_GLASS: Material = Material { tint_amount: 0.86, radius: 32.0, ..SHEET_GLASS };

/// Dialogs: nearly opaque floating glass.
pub const DIALOG_GLASS: Material = Material { tint_amount: 0.9, radius: 30.0, ..FLOAT_GLASS };
