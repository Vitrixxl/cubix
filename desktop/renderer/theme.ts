const palettes: Record<string, number[]> = {
  "t3-code": [
    0x0b0b0e, 0x14141a, 0x1c1c24, 0x262630, 0xeef0f5, 0xa9adba, 0x3987e5,
    0xd95926,
  ],
  "t3-chat": [
    0x130d14, 0x1c121c, 0x291828, 0x382036, 0xfff1f7, 0xcdb0be, 0xed2677,
    0xff82b5,
  ],
  grove: [
    0x0b100d, 0x121a15, 0x1a2720, 0x25362c, 0xedf7f0, 0xa7bdad, 0x39ad78,
    0xc5b878,
  ],
  ocean: [
    0x091015, 0x101b22, 0x172832, 0x213845, 0xedf8fd, 0xa6bfca, 0x42a4dc,
    0x8ad4da,
  ],
  ember: [
    0x120d0b, 0x1d1512, 0x2b1d18, 0x3b2921, 0xfff4ee, 0xccb2a5, 0xe1783f,
    0xf0b080,
  ],
  iris: [
    0x0e0b13, 0x17121e, 0x21192d, 0x30233f, 0xf8f1ff, 0xbdaacf, 0x9a67df,
    0xd59ad7,
  ],
};
export const accents = Object.fromEntries(
  Object.entries(palettes).map(([k, v]) => [k, hex(v[6])]),
);
function hex(n: number) {
  return "#" + n.toString(16).padStart(6, "0");
}
function mix(a: number, b: number, t: number) {
  return [16, 8, 0].reduce(
    (n, s) =>
      n + (Math.round(((a >> s) & 255) * t + ((b >> s) & 255) * (1 - t)) << s),
    0,
  );
}
export function theme(name: string, light: boolean) {
  let [bg, surface, surface2, surface3, text, secondary, accent, series] =
    palettes[name] ?? palettes["t3-code"];
  if (light) {
    accent =
      (
        {
          "t3-code": 0x245cc5,
          "t3-chat": 0xb91b59,
          grove: 0x23734e,
          ocean: 0x186b98,
          ember: 0xa64c22,
          iris: 0x7843b7,
        } as any
      )[name] ?? 0x245cc5;
    [bg, surface, surface2, surface3] = [0.04, 0.07, 0.11, 0.16].map((t) =>
      mix(accent, 0xffffff, t),
    );
    text = 0x192334;
    secondary = 0x48566b;
    series = (
      {
        "t3-code": 0xa44514,
        "t3-chat": 0x7845b3,
        grove: 0x876718,
        ocean: 0x257571,
        ember: 0x855c17,
        iris: 0xa43881,
      } as any
    )[name];
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries({
    bg,
    surface,
    surface2,
    surface3,
    text,
    secondary,
    accent,
    series,
    muted: mix(text, bg, 0.65),
    good: light ? 0x237444 : 0x4ccf4c,
    danger: light ? 0xbb3545 : 0xe66767,
  }))
    result["--" + k] = hex(v);
  result["--soft"] =
    hex(accent) +
    (light ? "1e" : name === "iris" ? "33" : name === "t3-code" ? "28" : "2d");
  result["--hover"] = light ? hex(accent) + "11" : "#ffffff0d";
  result["--line"] = hex(text) + "16";
  return result;
}
