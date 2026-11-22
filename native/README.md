# Qbix native

The app in Rust, one code for the desktop (Linux, Wayland or X11) and Android: [iced](https://github.com/Santuzius/iced)
(its Android fork) on wgpu, no web view. It talks to the same Go API as the web app (`go-api`).

- `core/`: everything without an interface. Puzzles and events (`data/puzzles.json`), scrambles of every type
  (`scrambler/`), step training (cross, XCross, EOLine…), the algorithm catalogue (`data/catalog.json`) and the solving
  methods, the timer, times and averages, the store kept on the device and its synchronisation with the account
  (`/api/sync`), the app's socket (duel, matches, messages), the daily scramble (the web's exactly), awards and levels,
  spaced repetition, blindfolded memo (Speffz), the analysis of smart cube solves (CFOP steps), other timers' exports,
  and the smart cubes' protocols (GAN, MoYu, QiYi, Giiker, GoCube), tested on captures of real cubes.
- `app/`: the interface. The shell (rail, sheet, drawer; tab bar and bottom sheet on a phone), the pages (Timer,
  Training, Algs, Challenges, Social, Profile, Settings, Guides, Smart cubes), the liquid glass (`glass.wgsl`), the 3D
  cube and the case diagrams, the Bluetooth radio (btleplug).
- `core/data/`: the methods and the guides exported from `src/` (`bun native/core/data/export-methods.ts`,
  `export-guides.ts`); the interface's translations are read from `src/client/i18n`.

## Run

```sh
cargo run --release -p qbix          # the app
cargo test --release                 # the tests
QBIX_DATA_DIR=/tmp/qbix cargo run …  # with data apart (the default: ~/.local/share/qbix)
```

The server is set in Settings › Data (the production one by default). For the dev API (`bun run dev:docker`), use
`http://127.0.0.1:47130`: Profile signs in with any seeded username (dev, coach, lena_speed…).

Development helpers: `QBIX_SECTION=algs|training|challenges|social|profile|settings|help|devices` opens on a page,
`QBIX_STATE=session|solves|sessions|menu` on the timer's drawer or menu, `QBIX_CASE="OLL 27"` on a case;
`./desk.sh out.png` runs it full screen on Hyprland and captures it.

## Android

```sh
./android/build.sh            # x86_64 and arm64 → target/qbix.apk
./android/build.sh arm64      # a phone only
adb install -r target/qbix.apk
```

A NativeActivity, no Java. The script uses a Rust toolchain with the Android targets and a JDK kept in
`~/.local/share/qbix-toolchain` (apart from the system's), the SDK and NDK of `~/Android/Sdk`, and signs with a debug key.
