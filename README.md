# Cubix

Personal desktop app to learn the CFOP method in depth: browse every F2L / OLL / PLL case with a
3D cube, learn the setup moves, train selected algorithms with a timer, and track your progress.

Stack: **Electrobun** (Bun main process) · **Elysia** HTTP API · **SQLite** (`bun:sqlite`) ·
**React 19** + **Jotai** + **Motion** in the webview · hand-rolled CSS with six dark themes.

## Features

- **Accounts** — create an account with a unique username and password, sign in, sign out,
  and edit your display name and bio. Guest practice stays available; registering upgrades
  the guest and preserves its times. Registered sessions expire after 30 days.
- **Profiles & community** — search public profiles by username or display name, view
  playground records, WCA averages, time evolution, recent times, and training progress per
  case. Profiles start private; private accounts are excluded from search and cannot be
  read by another member, including through direct API requests. The owner keeps access.

- **Algorithms** — separate F2L / OLL / PLL tabs, each with sub-sets (F2L Basic / Advanced /
  Expert, 2-Look OLL / OLL, 2-Look PLL / PLL). Every case card shows a 3D cube in the case state.
  Clicking a card animates the cube to the right side; the left side shows the **setup**, all
  algorithms (ranked by SpeedCubeDB votes, J Perm pick flagged, move counts, video links), and
  the case statistics (solves, best, mean, ao5, ao12, best ao5, time-evolution chart).
  The cube can be dragged to rotate and can play the selected algorithm move by move.
- **Training** — pick any set of cases (per set or individually, with search) from a 3-column grid
  of case diagrams. Cases are drawn at
  random; the current case is shown with its setup (optional random AUF) and the algorithm can be
  hidden/revealed. Timer: hold `Space` (or the timer area) to arm, release to start, any key to
  stop. The right panel lists the session's times per case; any time can be deleted (`×`) and the
  last time undone.
- **Playground** — free timer with random scrambles (kept when you switch pages or reload), a
  draggable 3D cube of the scrambled state, +2 / DNF penalties, delete, running stats. The page is
  box-free: every element floats on the background.
- **Themes** — six selectable, persistent palettes inspired by T3 Code / T3 Chat: T3 Code,
  T3 Chat, Grove, Ocean, Ember and Iris.
- **Native navigation history** — mouse/browser back and forward buttons navigate between pages
  and algorithm details without reloading the app.
- **Setup moves for every case** — computed as the inverse of the primary algorithm and verified
  with cubing.js (`scripts/build-db.ts`). Alternative setups are included when they were verified.

The catalogue renders static cases as lightweight isometric SVGs and reserves the `div`-based 3D
renderer for the interactive algorithm player. Motion hover/opening transitions remain enabled,
without geometry measurements on every card during scrolling.

## Layout

```
data/                 consolidated algorithm database (generated, committed)
  moves.json          notation reference (face, wide, slice, rotations, AUF, triggers)
  pll.json oll.json f2l.json f2l-advanced.json f2l-expert.json 2look-oll.json 2look-pll.json
  raw/                scraped/downloaded sources used by the build script
scripts/
  build-db.ts         raw sources → data/*.json, computes setups, verifies every case
  test-cube.ts        checks the in-app cube model against SpeedCubeDB diagrams and all data
  build-view.ts       bundles the React webview into dist/view (Bun HTML bundler)
  dev-web.ts          browser dev mode: API + webview with HMR on one port
src/
  shared/cube.ts      facelet cube model (parse/apply moves, geometry for the 3D renderer)
  shared/types.ts     DTOs shared by API and UI
  bun/                Electrobun main process: db.ts (SQLite), api.ts (Elysia), index.ts
  mainview/           React app (pages, components, hooks, styles.css)
electrobun.config.ts  mainProcess "bun", view copied from dist/view
hutch.config.ts       Hutch tasks (packageManager: bun)
```

## Running

Day-to-day use (no desktop shell): the **Cubix** entry in the app launcher runs
`scripts/cubix-launch.sh`, which starts the local server (`scripts/serve.ts`, port 47129, view
rebuilt at startup) if it is not already running and opens http://127.0.0.1:47129 in Brave.
From a terminal: `bun run launch` (or `bun run serve` for the server alone).


Prerequisites: [Bun](https://bun.sh) ≥ 1.2, [Hutch](https://framework.blackboard.sh/electrobun/)
(`curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh`). On Linux the system webview
needs GTK 3, WebKitGTK 4.1, Ayatana AppIndicator and librsvg.

```bash
bun install
hutch electrobun sync        # downloads the Electrobun SDK into .hutch/devkit (once)
bun run dev                  # build the view, then run the desktop app with file watching
bun run build                # production bundle (hutch electrobun build --env=stable)
```

Browser-only development (no desktop shell, HMR):

```bash
bun run dev:web              # http://localhost:5180
```

Other scripts: `bun run test` (cube model + data checks), `bun run typecheck`,
`bun run build:db` (regenerate data from `data/raw`).

User data lives in `~/.local/share/cubix/cubix.db` (override with `CUBIX_DB=/path/to/file.db`).

## Accounts and existing local history

Accounts belong to the API/database you connect to. The default launcher runs locally:
accounts on **different local installations do not synchronise automatically**. To share
profiles across devices, run one shared server/database and have members open that server.
Set `CUBIX_HOST=0.0.0.0 bun run serve` to listen beyond loopback on a shared host.
Use HTTPS for any non-local deployment. This change does not deploy a public server.
The view already supports a separate API origin through `?api=https://your-server`.

Existing pre-account times are kept intact and unassigned during migration. After creating
your account, attach them explicitly using local database access:

```bash
bun run import:history your_username
# For a non-default database:
CUBIX_DB=/path/to/cubix.db bun run import:history your_username
```

The command moves only unassigned legacy history and is safe to run again. This avoids
giving the old installation's private times to whichever remote visitor signs up first.
Signing into an existing account does not merge a different guest's history; register that
guest to preserve it. Guest access depends on the browser's saved token.

Passwords use Bun's [Argon2id password hashing](https://bun.sh/reference/bun/password).
API access uses random 256-bit bearer tokens; only SHA-256 token hashes are stored in SQLite.
Tokens are stored in browser local storage per API origin, revoked on sign-out, and rotated
when a guest registers. All personal solve/session queries are scoped to their owner.
Profile responses use `Cache-Control: no-store`. There is no email-based password reset.

Run `bun run test:accounts` for authentication, token revocation, profile privacy, ownership,
statistics and legacy-migration regression tests. `bun run test` also includes cube checks.
Restart a running `bun run serve` process after updating the backend; its view rebuilds on
reload, but backend modules are loaded at server startup.

## Data sources

| Source | Used for | License |
| --- | --- | --- |
| [SpeedCubeDB](https://speedcubedb.com/a/3x3/) | setups, alternative algorithms with community votes, ETM/STM, videos | site content, scraped for personal use |
| [J Perm](https://jperm.net/algs/) | recommended algorithm per case, shape groups, probabilities, 2-look sets | site content, personal use |
| [F2LTrainer (Dave2ooo)](https://github.com/Dave2ooo/F2LTrainer) | F2L basic/advanced/expert algorithms and scrambles | MIT |
| [andyjudson/cfop](https://github.com/andyjudson/cfop) | OLL/PLL case names and probabilities | MIT |
| [cubing.js](https://js.cubing.net/cubing/) | setup computation and verification (build time only) | MPL-2.0 / GPL-3.0 |

Conventions: cross on the bottom (white), last layer on top (yellow), green in front. F2L cases
target the front-right slot. Every algorithm was replayed from its setup; algorithms that only
work from another angle carry a `pre_auf` (shown as `(U)` before the algorithm).
