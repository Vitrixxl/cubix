// Shared by the three design directions: deterministic fake data (the seeded dev account) and the drawings
// (cases, scramble net, charts). Each direction colours them with its own CSS (.k-* classes).
const K = (() => {
  const rng = (seed) => { let s = (seed * 9301 + 49297) % 233280; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
  const fmt = (t) => t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}` : t.toFixed(2);
  /** n solve times around `mean`, the last ones a little faster (someone improving). */
  const times = (seed, n, mean, sd) => { const r = rng(seed); return [...Array(n)].map((_, i) => Math.max(mean * .62, mean + (r() + r() + r() - 1.5) * sd * 1.6 - (i / n) * sd * .5)); };
  /** Average of the last k, best and worst dropped (WCA). */
  const ao = (v, k, end = v.length) => { if (end < k) return null; const w = v.slice(end - k, end).sort((a, b) => a - b).slice(1, -1); return w.reduce((a, b) => a + b, 0) / w.length; };

  const rect = (x, y, w, h, c) => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  /** An OLL case seen from above: the 9 top stickers and the 12 side ones, a valid orientation (edges flipped in pairs, corner twists summing to 0 mod 3). */
  function oll(seed) {
    const r = rng(seed * 7 + 3);
    const flips = [0, 2, 2, 4][Math.floor(r() * 4)], e = [0, 0, 0, 0];
    for (let n = 0; n < flips;) { const i = Math.floor(r() * 4); if (!e[i]) { e[i] = 1; n++; } }
    let c; do c = [0, 0, 0, 0].map(() => Math.floor(r() * 3)); while ((c[0] + c[1] + c[2] + c[3]) % 3 || (!flips && !c.some(Boolean)));
    const on = (b) => (b ? "k-s on" : "k-s");
    // top: corners TL TR BR BL = c[0..3], edges T R B L = e[0..3]
    const top = [!c[0], !e[0], !c[1], !e[3], 1, !e[1], !c[3], !e[2], !c[2]];
    let out = top.map((v, i) => rect(9 + (i % 3) * 11, 9 + Math.floor(i / 3) * 11, 10, 10, on(v))).join("");
    // sides, clockwise: top strip (TL, T, TR), right (TR, R, BR), bottom (BR, B, BL), left (BL, L, TL)
    const strip = [[c[0] === 2, e[0], c[1] === 1], [c[1] === 2, e[1], c[2] === 1], [c[2] === 2, e[2], c[3] === 1], [c[3] === 2, e[3], c[0] === 1]];
    strip.forEach((s, side) => s.forEach((v, i) => {
      const p = 9 + i * 11, q = 9 + (2 - i) * 11;
      out += side === 0 ? rect(p, 3, 10, 4, on(v) + " side") : side === 1 ? rect(43, p, 4, 10, on(v) + " side") : side === 2 ? rect(q, 43, 10, 4, on(v) + " side") : rect(3, q, 4, 10, on(v) + " side");
    }));
    return `<svg class="k-case" viewBox="0 0 50 50">${out}</svg>`;
  }
  /** A PLL case: the top solved, the sides' colours permuted. */
  function pll(seed) {
    const r = rng(seed * 13 + 1), col = () => "k-f" + (2 + Math.floor(r() * 4));
    let out = [...Array(9)].map((_, i) => rect(9 + (i % 3) * 11, 9 + Math.floor(i / 3) * 11, 10, 10, "k-s on")).join("");
    for (let side = 0; side < 4; side++) for (let i = 0; i < 3; i++) {
      const p = 9 + i * 11, c = col() + " side";
      out += side === 0 ? rect(p, 3, 10, 4, c) : side === 1 ? rect(43, p, 4, 10, c) : side === 2 ? rect(p, 43, 10, 4, c) : rect(3, p, 4, 10, c);
    }
    return `<svg class="k-case" viewBox="0 0 50 50">${out}</svg>`;
  }
  /** A scrambled cube unfolded: U on top, L F R B in a row, D under F. Faces k-f0…5 = white, yellow, green, blue, red, orange. */
  function net(seed) {
    const r = rng(seed * 31 + 7), at = [[3, 0, 0], [0, 3, 5], [3, 3, 2], [6, 3, 4], [9, 3, 3], [3, 6, 1]];
    let out = "";
    for (const [fx, fy, centre] of at) for (let i = 0; i < 9; i++)
      out += rect((fx + (i % 3)) * 10 + (fx / 3) * 2, (fy + Math.floor(i / 3)) * 10 + (fy / 3) * 2, 9, 9, "k-f" + (i === 4 ? centre : Math.floor(r() * 6)));
    return `<svg class="k-net" viewBox="0 0 126 94">${out}</svg>`;
  }
  /** Solves as dots, the rolling average as a line; the best dot is .pb. `data-chart="seed,n,mean,sd[,k]"`. */
  function chart(v, k = 12, w = 600, h = 160) {
    const lo = Math.min(...v) - .3, hi = Math.max(...v) + .3, x = (i) => (i / (v.length - 1)) * (w - 8) + 4, y = (t) => h - 6 - ((t - lo) / (hi - lo)) * (h - 12);
    const best = v.indexOf(Math.min(...v));
    let out = [.25, .5, .75].map((f) => `<line class="k-grid" x1="0" x2="${w}" y1="${h * f}" y2="${h * f}"/>`).join("");
    out += v.map((t, i) => `<circle class="k-pt${i === best ? " pb" : ""}" cx="${x(i).toFixed(1)}" cy="${y(t).toFixed(1)}" r="${i === best ? 4 : 2}"/>`).join("");
    const pts = v.map((_, i) => ao(v, k, i + 1)).map((a, i) => a == null ? "" : `${x(i).toFixed(1)},${y(a).toFixed(1)}`).filter(Boolean);
    return `<svg class="k-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${out}<polyline class="k-ln" points="${pts.join(" ")}"/></svg>`;
  }
  /** A histogram as bars; `me` marks the bin holding that time. */
  function hist(v, bins = 16, me) {
    const lo = Math.min(...v), hi = Math.max(...v), n = Array(bins).fill(0), bin = (t) => Math.min(bins - 1, Math.floor(((t - lo) / (hi - lo)) * bins));
    v.forEach((t) => n[bin(t)]++);
    const max = Math.max(...n);
    return `<div class="k-hist">${n.map((c, i) => `<span class="${me != null && bin(me) === i ? "me" : ""}" style="height:${Math.max(4, (c / max) * 100)}%"></span>`).join("")}</div>`;
  }
  /** Weeks of activity, 7 days each, levels 0 to 4. */
  function heat(seed, weeks = 26) {
    const r = rng(seed);
    return `<div class="k-heat">${[...Array(weeks * 7)].map((_, i) => `<i class="l${r() < .22 ? 0 : 1 + Math.floor(r() * r() * 4 + (i / (weeks * 7)) * .9)}"></i>`).join("").replace(/l[5-9]/g, "l4")}</div>`;
  }
  const SCRAMBLES = ["R2 U' F2 D B2 L2 D' R2 U2 F' L D2 R' B U L' F2 D' R", "F' U2 R2 B2 D' L2 U F2 R2 D2 B' R U' L2 F D R' B2 U", "L2 D B2 U' R2 F2 U L2 D2 B R' U2 F L' D B2 R U' F'", "U R2 F2 L2 U' B2 D F2 U2 R' B D' L F2 U' R B' L2 D"];
  const USERS = ["lena_speed", "alex_cubes", "kenji_cfop", "ben_tps", "chloe_f2l", "hugo_sub10", "yuki_blind", "sofia_sq1", "tom_onehand", "coach"];
  const OLL_ALGS = ["R U2 R2 F R F' U2 R' F R F'", "F R U R' U' F' f R U R' U' f'", "f R U R' U' f' U' F R U R' U' F'", "r U R' U R U2 r'", "r' U' R U' R' U2 r", "R U2 R' U' R U' R'", "R U R' U R U2 R'", "F R U R' U' F'", "R U R' U' R' F R F'", "r U R' U' r' F R F'", "F' r U R' U' r' F R", "R U R' U' M' U R U' r'", "R U2 R2 U' R2 U' R2 U2 R", "R2 D R' U2 R D' R' U2 R'", "l' U' L U' L' U2 l", "R' F R U R' U' F' U R"];

  function fill(root = document) {
    const all = (s) => [...root.querySelectorAll(s)];
    all("[data-oll]").forEach((el) => (el.innerHTML = oll(+el.dataset.oll)));
    all("[data-pll]").forEach((el) => (el.innerHTML = pll(+el.dataset.pll)));
    all("[data-net]").forEach((el) => (el.innerHTML = net(+el.dataset.net)));
    all("[data-heat]").forEach((el) => { const [s, w] = el.dataset.heat.split(",").map(Number); el.innerHTML = heat(s, w); });
    all("[data-chart]").forEach((el) => { const [s, n, m, sd, k] = el.dataset.chart.split(",").map(Number); el.innerHTML = chart(times(s, n, m, sd), k || 12); });
    all("[data-hist]").forEach((el) => { const [s, n, m, sd, me] = el.dataset.hist.split(",").map(Number); el.innerHTML = hist(times(s, n, m, sd), 18, me); });
    all("[data-logo]").forEach((el) => (el.innerHTML = "<i></i>".repeat(9)));
    if (window.lucide) lucide.createIcons();
  }
  /** Windows are drawn at their real size (1440 × 900); a narrower viewport zooms the whole page out. */
  function fit() { document.body.style.zoom = Math.min(1, window.innerWidth / 1540); }
  addEventListener("resize", fit);
  addEventListener("DOMContentLoaded", fit);
  return { rng, fmt, times, ao, oll, pll, net, chart, hist, heat, fill, SCRAMBLES, USERS, OLL_ALGS };
})();
