use gpui::*;
#[derive(Clone, Copy)]
pub struct Theme {
    pub bg: Hsla,
    pub surface: Hsla,
    pub surface2: Hsla,
    pub surface3: Hsla,
    pub text: Hsla,
    pub muted: Hsla,
    pub secondary: Hsla,
    pub accent: Hsla,
    pub soft: Hsla,
    pub hover: Hsla,
    pub line: Hsla,
    pub good: Hsla,
    pub danger: Hsla,
    pub series: Hsla,
}
fn mix(a: u32, b: u32, t: f32) -> Hsla {
    let channel = |shift: u32| {
        ((((a >> shift) & 255) as f32 * t + ((b >> shift) & 255) as f32 * (1. - t)).round() as u32)
            << shift
    };
    rgb(channel(16) | channel(8) | channel(0)).into()
}
impl Theme {
    pub fn new(name: &str, light: bool) -> Self {
        let (bg, surface, s2, s3, text, secondary, accent, series) = match name {
            "t3-chat" => (
                0x130d14, 0x1c121c, 0x291828, 0x382036, 0xfff1f7, 0xcdb0be, 0xed2677, 0xff82b5,
            ),
            "grove" => (
                0x0b100d, 0x121a15, 0x1a2720, 0x25362c, 0xedf7f0, 0xa7bdad, 0x39ad78, 0xc5b878,
            ),
            "ocean" => (
                0x091015, 0x101b22, 0x172832, 0x213845, 0xedf8fd, 0xa6bfca, 0x42a4dc, 0x8ad4da,
            ),
            "ember" => (
                0x120d0b, 0x1d1512, 0x2b1d18, 0x3b2921, 0xfff4ee, 0xccb2a5, 0xe1783f, 0xf0b080,
            ),
            "iris" => (
                0x0e0b13, 0x17121e, 0x21192d, 0x30233f, 0xf8f1ff, 0xbdaacf, 0x9a67df, 0xd59ad7,
            ),
            _ => (
                0x0b0b0e, 0x14141a, 0x1c1c24, 0x262630, 0xeef0f5, 0xa9adba, 0x3987e5, 0xd95926,
            ),
        };
        if light {
            let a = match name {
                "t3-chat" => 0xb91b59,
                "grove" => 0x23734e,
                "ocean" => 0x186b98,
                "ember" => 0xa64c22,
                "iris" => 0x7843b7,
                _ => 0x245cc5,
            };
            let background = mix(a, 0xffffff, 0.04);
            Self {
                bg: background,
                surface: mix(a, 0xffffff, 0.07),
                surface2: mix(a, 0xffffff, 0.11),
                surface3: mix(a, 0xffffff, 0.16),
                text: rgb(0x192334).into(),
                secondary: rgb(0x48566b).into(),
                muted: {
                    let b: Rgba = background.into();
                    let n = ((b.r * 255.).round() as u32) << 16
                        | ((b.g * 255.).round() as u32) << 8
                        | (b.b * 255.).round() as u32;
                    mix(0x192334, n, 0.65)
                },
                accent: rgb(a).into(),
                soft: rgba((a << 8) | (0.12 * 255.) as u32).into(),
                hover: rgba((a << 8) | (0.07 * 255.) as u32).into(),
                line: rgba((0x192334 << 8) | (0.09 * 255.) as u32).into(),
                good: rgb(0x237444).into(),
                danger: rgb(0xbb3545).into(),
                series: rgb(match name {
                    "t3-chat" => 0x7845b3,
                    "grove" => 0x876718,
                    "ocean" => 0x257571,
                    "ember" => 0x855c17,
                    "iris" => 0xa43881,
                    _ => 0xa44514,
                })
                .into(),
            }
        } else {
            Self {
                bg: rgb(bg).into(),
                surface: rgb(surface).into(),
                surface2: rgb(s2).into(),
                surface3: rgb(s3).into(),
                text: rgb(text).into(),
                secondary: rgb(secondary).into(),
                muted: mix(text, bg, 0.65),
                accent: rgb(accent).into(),
                soft: rgba(
                    (accent << 8)
                        | ((if name == "iris" {
                            0.2
                        } else if name == "t3-code" {
                            0.16
                        } else {
                            0.18
                        }) * 255.) as u32,
                )
                .into(),
                hover: rgba(0xffffff0d).into(),
                line: rgba((text << 8) | (0.09 * 255.) as u32).into(),
                good: rgb(0x4ccf4c).into(),
                danger: rgb(0xe66767).into(),
                series: rgb(series).into(),
            }
        }
    }
}
