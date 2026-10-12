# Qbix tablet and small screen mockups: the kit

Between the phone (≤ 700 px wide, served the React Native phone app under /phone) and a big desktop screen, Qbix shows
its desktop app squeezed: on a tablet in portrait (834 × 1194) the scramble is crammed into a narrow column beside the
timer and half the screen is empty; at 1024 × 768 the scramble disappears and the session panel eats a third of the
width; on a 1280 × 720 laptop the top bar + page tabs take 120 px of height and panels clip their content; text in side
cards wraps word by word (Training's "Recommended"). Screenshots of today's app, signed in as `yuki_blind`, at
820×1180, 1024×768, 1180×820 and 1280×720: `/home/vitrix/dev/cubix/artifacts/responsive-now/<size>-<page>.png`. LOOK at
the ones of your pages before drawing (Read tool on the PNG), so you fix what is actually wrong.

The deliverable is ONE static HTML file, `docs/maquettes-tablette.html`, assembled by
`bun /home/vitrix/dev/cubix/docs/maquettes-tablette/serve.ts --build` from:

- `/home/vitrix/dev/cubix/docs/maquettes-tablette/head.html`: all the CSS (read it entirely before writing: every class you may use is there; the end of the file, after "Tablet and small screen kit", is new),
- `/home/vitrix/dev/cubix/docs/maquettes-tablette/parts/NN-name.html`: one file per group of pages, written by you,
- `/home/vitrix/dev/cubix/docs/maquettes-tablette/tail.html`: the scripts (cube drawing, lucide icons, status/window bars, table of contents).

Do NOT edit head.html, tail.html or serve.ts. If you truly need a class that does not exist, put a small `<style>` at
the top of your part, with selectors prefixed by your section id (`#timer .x {}`), and only use theme variables for
colours (`var(--pri)`, `var(--card)`…): the page has an accent picker and a light mode toggle that must keep working.

The phone mockups the user already chose from live in `/home/vitrix/dev/cubix/docs/maquettes/parts/*.html` (same CSS
base): reuse their content, data and component patterns for your pages, they are the best reference of what each page
contains. The real desktop code (features, labels) is in `/home/vitrix/dev/cubix/desktop/renderer/` (and the phone app in
`/home/vitrix/dev/cubix/mobile/src/`). English labels are the strings in the components (`src/client/i18n/fr.json` is the French translation, keyed by the English text).

## Identity (same as desktop, non negotiable)

The user insists: the mockups must stay in the app's art direction. We change the LAYOUT only, never the look. Compare
with the screenshots in artifacts/responsive-now/ and the phone mockups: same surfaces, cards, chips, pills, buttons,
type scale, spacing rhythm, icons. Use only head.html's classes and theme variables; no new colours, gradients, shadows,
fonts, borders or decorative effects, no "dashboard template" look. A screen of a mockup must look like a Qbix screen.

- Dark plum surfaces tinted by the accent, pink accent `--pri`, Bricolage Grotesque, heavy 800 weights with tight
  negative tracking on titles, big rounded cards (20–24px), filled pill controls, no borders except the hairline
  `--border`. Status colours: `--ok` mint (best, learned), `--warn` butter (+2, streak), `--bad` soft red (DNF, worst),
  `--lilac` fourth series.
- Timer digits: `<div class="timer xxl">12.<span class="ms">345</span></div>` (sizes `.s .m .l .xl .xxl .xxxl`).
- Icons: lucide: `<i data-lucide="timer"></i>`.
- Interface text in ENGLISH. Captions of the mockups (figcaption, page-head, `.size`) in FRENCH.
- Real data from the seeded dev account: users `dev`, `coach`, `lena_speed`, `alex_cubes`, `kenji_cfop`, `ben_tps`,
  `chloe_f2l`, `hugo_sub10`, `yuki_blind`, `sofia_sq1`, `tom_onehand`; group `Cubix Club`; tournaments `Friday sprint`,
  `Weekly 2×2 sprint`, `Club cup`, `Qbix Autumn Open`; realistic times (3×3 around 11–14 s).
- Product rules: app screens never scroll as a page: lists scroll INSIDE (`.scroll` = list cut with a fade). Explanatory
  text goes to the guides (a `?` icon), never under the practice area. No Clock, FMC or Multi-blind. Free, no ads, no
  premium. Smart cube = "Connect a cube" button (bluetooth).

## The screens

Every figure shows the SAME page in ITS direction on two screens, side by side, drawn at real CSS size (the page scales
them):

```html
<div class="stack">
  <div><div class="size"><b>Tablette portrait</b> 834 × 1194</div>
    <div class="dev tab"><div class="scr"> … </div></div></div>
  <div><div class="size"><b>Petit écran</b> 1280 × 720</div>
    <div class="dev pc"><div class="scr"> … </div></div></div>
</div>
```

The script adds a 24px status bar (tablet) or window bar (pc) at the top of `.scr`: the usable area is 834 × 1170 for
`.tab` and 1280 × 696 for `.pc`. `.scr` is `display:flex; flex-direction:column`. Everything must FIT: compute your
heights, especially on the pc screen (696 px is short: that is the whole point). A third screen is allowed only to show
a state the two others cannot (a drawer/sheet/dialog open): either `.dev.tab` again or `.dev.tabl` (tablet landscape,
1194 × 810 usable). Label it with `.size`, e.g. `<div class="size"><b>Tiroir ouvert</b> 834 × 1194</div>`.

## The page section

```html
<section class="page" id="timer" data-short="Timer">
  <div class="page-head">
    <h2>01 · Timer <small>/timer</small></h2>
    <p>1–2 phrases en français : ce qui ne va pas aujourd'hui sur tablette / petit écran et ce que les propositions changent.</p>
    <div class="feats"><span>Mélange</span><span>Choix du puzzle</span> … every feature of this page on desktop …</div>
  </div>
  <div class="phones">
    <figure class="variant"><figcaption><b><em>A</em> · Rail</b><span>L'idée en 1–2 lignes, en français.</span></figcaption><div class="stack">…</div></figure>
    <figure class="variant"><figcaption><b><em>B</em> · Grand mobile</b><span>…</span></figcaption><div class="stack">…</div></figure>
    <figure class="variant"><figcaption><b><em>C</em> · Volets</b><span>…</span></figcaption><div class="stack">…</div></figure>
  </div>
</section>
```

Exactly three figures per page, A, B, C in that order, each following ITS direction below (the user may adopt a whole
direction, so be consistent with the shell of each direction). Every desktop feature of the page must appear in at
least one screen of EACH figure.

## The three directions

The 5 sections and their pages (same everywhere): Timer = Timer, Analysis · Learn = Courses, Training · Algs =
Algorithms · Challenges = Duel, Tournaments, Daily · Me = Profile, Messages, Community, Coaching. Puzzle picker chip
(`<button class="chip on"><span class="puzzle"><i></i>×9</span>3×3<i data-lucide="chevron-down"></i></button>`) and
account avatar (`<span class="avatar sm l">YU</span>`) are global.

### A · Rail (the desktop app, compact)

```html
<div class="shell">
  <nav class="rail">
    <span class="logo"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <a class="on"><span><i data-lucide="timer"></i></span>Timer</a>
    <a><span><i data-lucide="graduation-cap"></i></span>Learn</a>
    <a><span><i data-lucide="boxes"></i></span>Algs</a>
    <a><span><i data-lucide="swords"></i></span>Challenges</a>
    <a><span><i data-lucide="user-round"></i><i class="nd"></i></span>Me</a>
    <span class="sp"></span>
    <span class="avatar sm l">YU</span>
  </nav>
  <div class="main">
    <div class="phead"><span class="title">Timer</span><div class="utabs"><span class="on">Timer</span><span>Analysis</span></div><span class="grow"></span> … page actions, puzzle chip …</div>
    … content, padding 0 24px …
  </div>
  <aside class="dock"> … a side panel, docked (landscape) … </aside>
  <!-- or, in portrait: <div class="scrim"></div><div class="drawer"> … </div> drawn open on a third screen, and a button that opens it -->
</div>
```
The top bar disappears: the rail (76px) holds sections, logo and account; the page header holds title + page tabs +
page actions on ONE line. Side panels are docked `.dock` when the width allows (1280), and become a `.drawer` (over
the content, from the right, with `.scrim`) in portrait, opened by a header button. Content reflows: grids lose
columns in portrait, two columns become one with the secondary below.

### B · Grand mobile (the phone app grown to the tablet)

```html
<div class="bigtitle"><span class="display">Timer</span> … puzzle chip, avatar …</div>
<div class="utabs" style="padding:0 28px"><span class="on">Timer</span><span>Analysis</span></div>
… content …
<div class="sheet over-nav"> … a peeking sheet (portrait) … </div>
<div class="fnav-space"></div>
<nav class="fnav">
  <span class="on"><i data-lucide="timer"></i></span>
  <span><i data-lucide="graduation-cap"></i></span><span><i data-lucide="boxes"></i></span>
  <span><i data-lucide="swords"></i></span><span><i data-lucide="user-round"></i><i class="nd"></i></span>
</nav>
```
Same language as the phone app the user picked (floating bar centred at the bottom, ICONS ONLY, never a label in it, large title, one row of page tabs,
sheets, big touch targets ≥ 44px). Portrait: panels are bottom sheets (`.sheet.over-nav` peeking, or `.scrim` +
`.sheet` open). Landscape (1280): panels become side sheets: `.sidesheet.docked` (a flex child at the right of a row,
always visible) or `.sidesheet` floating over the content when opened. Use the extra width for two columns, never for
stretched rows. Touch first, but must also feel right with a mouse on a laptop.

### C · Volets (canonical layouts: list-detail, supporting pane)

```html
<div class="cbar">
  <span class="logo"><i></i>×9</span>
  <span class="sect"><i data-lucide="timer"></i>Timer<i data-lucide="chevron-down"></i></span>
  <div class="seg"><span class="on">Timer</span><span>Analysis</span></div>
  <span class="grow"></span> … puzzle chip, avatar …
</div>
<div class="panes">           <!-- side by side (landscape); add class "v" to stack them (portrait) -->
  <div class="pane"> <div class="ph"><span class="h3">Practice</span> … pane actions …</div> … </div>
  <div class="grip"></div>    <!-- the handle to resize -->
  <div class="pane side" style="width:340px"> … supporting pane … </div>
</div>
```
One thin bar (56px): section in a menu, pages in a segmented control, puzzle, account. Each page is decomposed into
panes. Portrait: `.panes.v`, the primary pane on top, the supporting pane below with a fixed height (its list scrolls
inside). Landscape: side by side. List-detail pages (algorithms, messages, tournaments, community, coaching) show the
list and the selected item together. Nothing floats, nothing hides behind a button: density adapts instead.

## Components (all in head.html)

Type: `.display(.xl) .h1 .h2 .h3 .t .s .xs .cap .big .alg(.sm) .num .b .xb .mfg .faint .pri .ok .warn .bad .lilac`
Layout: `.row .col .grow .between .center .end .wrap .g2…g20 .p8 .p12 .p16 .p20 .p24 .px12 .px16 .px24 .grid2 .grid3
.grid4 .grid5 .grid6 .grid8 .w280 .w320 .w360 .scroll .hscroll .trunc .hr`
Surfaces: `.card(.hi .pop .tight .dash .pri) .well .tile(.hero)`
Controls: `.btn(.pri .soft .ghost .ok .sm .lg .icon .block) .chip(.on .pri, <span class="v">value</span>) .seg(.block,
> .on) .utabs(> .on) .field(.area) .check(.on) .switch(.on) .badge .pill(.pri .ok .warn .lilac .bad) .dot(.ok .warn
.lilac .bad .faint) .bar(.ok .thin)>i[style=width:60%] .ring[style=--p:60]>b .avatar(.sm .lg .xl; colours .y .l .g .n)
.icon-tile(.pri) .li(.on)>.col`
Timer: `.timer(.s .m .l .xl .xxl .xxxl; .armed .held)` with `.ms`, `.times`, `.stat`
Cubes: `<i class="ll" data-ll="yxyyyyxyx|xyx|xxx|xyx|xxx"></i>` (last layer from above: 9 top | back3 | right3 | front3 |
left3; letters y w r o b g x=grey) — sizes `.sm .lg`. `<i class="iso" data-iso="U9|F9|R9"></i>` (isometric cube) — sizes
`.sm .lg .xl`. Case tile: `<div class="case"><i class="iso sm" data-iso="…"></i><b><i class="st ok"></i>5</b><small>0.996</small></div>`.
Charts: inline `<svg>` with `stroke="var(--pri)"` / `var(--c2)` / `var(--ok)`, `fill="none"`, `vector-effect="non-scaling-stroke"`.
Size cubes and charts with inline `style="width:…;height:…"` when you need them bigger on these screens.

## Quality bar

- Readable at real size: body ≥ 13px, controls ≥ 32px (touch targets ≥ 44px in B), one row of tabs max.
- Use the space: no half-empty screen, no column of text two words wide, no huge timer with the scramble crammed.
- Every desktop feature of the page in each figure; list them in `.feats`.
- The three proposals must be genuinely different layouts, following their shell.
- Nothing overflows a screen; nothing is clipped except inside `.scroll`/`.hscroll`.
- Do not take screenshots, do not review your own work, do not commit: the lead reviews everything at the end. The lead
  watches your part live at http://127.0.0.1:8788/p/<id> (reloaded on save), so write each section completely (up to
  its closing </section>) one after another. Report the list of pages you drew in one short paragraph.
