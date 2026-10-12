# Qbix mobile mockups: the kit

We are redrawing Qbix's phone UI (the user finds the current one unreadable: desktop panels squeezed into a phone, two or
three rows of tabs stacked, tiny text). The deliverable is ONE static HTML file, `docs/maquettes-mobile.html`, assembled by
`bun /home/vitrix/dev/cubix/docs/maquettes/serve.ts --build` from:

- `/home/vitrix/dev/cubix/docs/maquettes/head.html`: all the CSS (read it entirely before writing: every class you may use is there),
- `/home/vitrix/dev/cubix/docs/maquettes/parts/NN-name.html`: one file per group of pages, written by you,
- `/home/vitrix/dev/cubix/docs/maquettes/tail.html`: the scripts (cube drawing, lucide icons, status and gesture bars, table of contents).

Do NOT edit head.html or tail.html. If you truly need a class that does not exist, put a small `<style>` at the top of
your part, with selectors prefixed by your section id (`#timer .x {}`), and only use theme variables for colours
(`var(--pri)`, `var(--card)`…): the page has an accent picker and a light mode toggle that must keep working.

## Identity (same as desktop, non negotiable)

- Dark plum surfaces tinted by the accent, pink accent `--pri` (the user can change it), Bricolage Grotesque, heavy
  800 weights with tight negative tracking on titles, big rounded cards (20–24px), filled pill controls, no borders
  except the hairline `--border`. Status colours: `--ok` mint (best, learned), `--warn` butter (+2, streak), `--bad`
  soft red (DNF, worst), `--lilac` fourth series.
- Timer digits: `<div class="timer xl">12.<span class="ms">345</span></div>` (white seconds, pink milliseconds).
- Icons: lucide, as on the desktop: `<i data-lucide="timer"></i>` (any lucide name).
- Interface text in ENGLISH (the app is in English). The captions of the mockups (figcaption, page-head) in FRENCH.
- Real data from the seeded dev account: users `dev`, `coach`, `lena_speed`, `alex_cubes`, `kenji_cfop`, `ben_tps`,
  `chloe_f2l`, `hugo_sub10`, `yuki_blind`, `sofia_sq1`, `tom_onehand`; group `Cubix Club`; tournaments `Friday sprint`,
  `Weekly 2×2 sprint`, `Club cup`, `Qbix Autumn Open`; realistic times (3×3 around 11–14 s).
- Product rules: app screens never scroll as a page: lists scroll INSIDE the screen (`.scroll` = a list cut with a fade
  at the bottom shows it continues). Explanatory text goes to the guides (a `?` / help icon), never under the practice
  area. No Clock, FMC or Multi-blind events. Free, no ads, no premium. Smart cube = "Connect a cube" button (bluetooth).

## The phone

```html
<div class="phone"><div class="scr">
  <div class="body"> … the screen … </div>
</div></div>
```

The script adds the status bar (34px) on top and the gesture bar (18px) at the bottom of `.scr`; `.body` gets the
rest (≈ 380 × 770). Everything must FIT: check your heights. `.body` is `display:flex; flex-direction:column;
position:relative`. Put lists in `.scroll` so they are cut cleanly.

## The page section

```html
<section class="page" id="timer" data-short="Timer">
  <div class="page-head">
    <h2>01 · Timer <small>/timer</small></h2>
    <p>One or two sentences in French: what this page is for on the phone, what changed vs today.</p>
    <div class="feats"><span>Mélange</span><span>Choix du puzzle</span> … every desktop feature this page covers …</div>
  </div>
  <div class="phones">
    <figure class="variant">
      <figcaption><b><em>A</em> · Onglets</b><span>French: the idea of this proposal, 1–2 lines.</span></figcaption>
      <div class="stack">  <!-- one phone, or two when a second state (sheet open, dialog…) shows hidden features -->
        <div><div class="state">Repos</div><div class="phone">…</div></div>
        <div><div class="state">Feuille ouverte</div><div class="phone">…</div></div>
      </div>
    </figure>
    <figure class="variant"> B … </figure>
    <figure class="variant"> C … </figure>
  </div>
</section>
```

Each page has exactly three figures: A, B, C, in that order, each following ITS direction below. Each figure has
one phone, or two when needed so that every desktop feature of the page is visible somewhere (a sheet, a menu, a
dialog). Keep `.stack` to two phones max. The `<div class="state">` label is optional with one phone.

## The three directions (follow them exactly: the user may adopt a whole direction)

### A · Onglets (classic Android, closest to desktop)

```html
<div class="body">
  <div class="appbar">
    <span class="title">Timer</span>
    <button class="chip on"><span class="puzzle"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>3×3<i data-lucide="chevron-down"></i></button>
    <span class="avatar sm l">DE</span>
  </div>
  <div class="utabs"><span class="on">Timer</span><span>Analysis</span></div>   <!-- the section's pages, ONE row -->
  … content (padding 12–16px) …
  <nav class="tabbar">
    <span class="on"><span><i data-lucide="timer"></i></span>Timer</span>
    <span><span><i data-lucide="graduation-cap"></i></span>Learn</span>
    <span><span><i data-lucide="boxes"></i></span>Algs</span>
    <span><span><i data-lucide="swords"></i></span>Challenges</span>
    <span><span><i data-lucide="user-round"></i><i class="nd"></i></span>Me</span>
  </nav>
</div>
```
Sections and their pages (same as desktop): Timer = Timer, Analysis · Learn = Courses, Training · Algs = Algorithms
· Challenges = Duel, Tournaments, Daily · Me = Profile, Messages, Community, Coaching. A desktop side panel becomes a
pushed screen (appbar with `<button class="btn icon ghost"><i data-lucide="chevron-left"></i></button>` + title, no
utabs, tabbar kept) or a full-height dialog.

### B · Pouce (one hand, sheets)

```html
<div class="body">
  <div class="ctx">
    <span class="where">Timer <i data-lucide="chevron-down"></i></span>   <!-- opens the menu of the section's pages -->
    <span class="grow"></span>
    <button class="btn icon sm ghost"><i data-lucide="bluetooth"></i></button>
    <button class="chip"><span class="puzzle">…</span>3×3</button>
  </div>
  … content …
  <div class="sheet over-nav"> … a peeking sheet (optional) … </div>
  <div class="fnav-space"></div>   <!-- room for the floating bar -->
  <nav class="fnav">
    <span class="on"><i data-lucide="timer"></i>Timer</span>
    <span><i data-lucide="graduation-cap"></i></span>
    <span><i data-lucide="boxes"></i></span>
    <span><i data-lucide="swords"></i></span>
    <span><i data-lucide="user-round"></i><i class="nd"></i></span>
  </nav>
</div>
```
Primary actions sit low (thumb zone). Side panels = bottom sheets: `.sheet.over-nav` peeking above the bar at rest, or
`.scrim` + `.sheet` (full width, from the bottom, over the bar) when opened. Switching pages of a section: the `where`
dropdown, or a `.seg` just above the bar. Settings of a screen = a sheet of rows, not a row of chips on top.

### C · Hub (boards of tiles, immersive tools)

Hub screen of a section:
```html
<div class="body">
  <div class="hubhead"><span class="display">Challenges</span><span class="avatar sm l">DE</span></div>
  <div class="col g10 px16 grow"> … tiles: <div class="tile hero"> / <div class="tile"> with live data and one action … </div>
  <nav class="ibar">
    <span><i data-lucide="timer"></i></span><span><i data-lucide="graduation-cap"></i></span><span><i data-lucide="boxes"></i></span>
    <span class="on"><i data-lucide="swords"></i></span><span><i data-lucide="user-round"></i><i class="nd"></i></span>
  </nav>
</div>
```
A tool screen (timer, training session, race, chat, case…): NO ibar, full screen:
```html
<div class="body">
  <div class="tool">
    <button class="btn icon ghost"><i data-lucide="x"></i></button>
    <span class="title">Session<small>4 cases · 4 recommended</small></span>
    <button class="btn icon ghost"><i data-lucide="ellipsis"></i></button>
  </div>
  … immersive content …
  <div class="actionbar"> … contextual actions … </div>   <!-- optional -->
</div>
```
For a page that IS a tool (e.g. the timer), C may show the hub phone and the tool phone side by side.

## Components (all in head.html)

Type: `.display .h1 .h2 .h3 .t .s .xs .cap .big .alg(.sm) .num .b .xb .mfg .faint .pri .ok .warn .bad .lilac`
Layout: `.row .col .grow .between .center .end .wrap .g2…g20 .p8 .p12 .p16 .px12 .px16 .grid2 .grid3 .grid4 .grid5
.scroll .hscroll .trunc .hr`
Surfaces: `.card(.hi .pop .tight .dash .pri) .well .tile(.hero)`
Controls: `.btn(.pri .soft .ghost .ok .sm .lg .icon .block) .chip(.on .pri, <span class="v">value</span>) .seg(.block,
> .on) .utabs(> .on) .field(.area) .check(.on) .switch(.on) .badge .pill(.pri .ok .warn .lilac .bad) .dot(.ok .warn
.lilac .bad .faint) .bar(.ok .thin)>i[style=width:60%] .ring[style=--p:60]>b .avatar(.sm .lg .xl; colours .y .l .g .n)
.icon-tile(.pri) .li(.on)>.col`
Timer: `.timer(.xl .l .m .s; .armed .held)` with `.ms`, `.times` (row of the last five), `.stat` (`<div class="stat"><span><i class="dot ok"></i>Best</span><b>10.892</b></div>`)
Logo: `<span class="logo"><i></i>×9</span>` · Puzzle glyph: `<span class="puzzle"><i></i>×9</span>`
Cubes: `<i class="ll" data-ll="yxyyyyxyx|xyx|xxx|xyx|xxx"></i>` (last layer from above: 9 top | back3 | right3 | front3 |
left3; letters y w r o b g x=grey) — sizes `.sm .lg`. `<i class="iso" data-iso="U9|F9|R9"></i>` (isometric cube, each
face 9 letters; F2L cases: grey `x` everywhere except the pieces concerned) — sizes `.sm .lg .xl`. Case tile:
`<div class="case"><i class="iso sm" data-iso="…"></i><b><i class="st ok"></i>5</b><small>0.996</small></div>` (`.st`
= dashed circle not learned, `.st.prog` in progress, `.st.ok` learned).
Charts: inline `<svg>` with `stroke="var(--pri)"` / `var(--c2)` / `var(--ok)`, `fill="none"`, `vector-effect="non-scaling-stroke"`.

## Quality bar

- Readable: body text ≥ 13px, controls ≥ 32px high (primary ≥ 40px), one row of tabs max, generous spacing.
- Every feature the desktop page has must appear in at least one phone of EACH proposal (in place, in a sheet, a menu
  drawn open, or a second phone). List them in the page's `.feats`.
- The three proposals must be genuinely different layouts, not the same screen with another bar.
- Nothing overflows a phone horizontally; nothing is clipped except inside `.scroll`/`.hscroll`.
- Do not take screenshots, do not review your own work, do not commit: the lead reviews everything at the end.
  The lead watches your part live at http://127.0.0.1:8787/p/<id> (reloaded on every save), so write each section completely (up to its closing </section>) one after another rather than all at the end. Just write your part file(s) and report the list of pages you drew in one short paragraph.
