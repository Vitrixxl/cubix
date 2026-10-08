# The Tauri shell's build machine (desktop/tauri/package.ts): Ubuntu 22.04, the oldest with WebKitGTK 4.1, so the Linux
# binary runs on any distribution at least as recent (glibc 2.35). It also cross-builds the Windows exe with cargo-xwin,
# and has Xvfb to run the app headless (desktop/tauri/check.sh).
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl build-essential pkg-config file patchelf \
      libwebkit2gtk-4.1-dev libssl-dev librsvg2-dev libxdo-dev \
      clang lld llvm nsis \
      xvfb xauth x11-apps imagemagick dbus dbus-x11 fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/* \
 && ln -sf clang /usr/bin/clang-cl
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable \
      --target x86_64-pc-windows-msvc \
 && cargo install --locked tauri-cli --version "^2" \
 && cargo install --locked cargo-xwin \
 && rm -rf $CARGO_HOME/registry $CARGO_HOME/git \
 && chmod -R a+rX $RUSTUP_HOME $CARGO_HOME
# check.ts drives the window and reads its properties.
RUN apt-get update && apt-get install -y --no-install-recommends xdotool x11-utils && rm -rf /var/lib/apt/lists/*
# Ubuntu 22.04's NSIS 3.08 lacks this header (3.09+), which Tauri's installer script includes.
RUN curl -fsSL -o /usr/share/nsis/Include/Win/RestartManager.nsh \
      https://raw.githubusercontent.com/kichik/nsis/v309/Include/Win/RestartManager.nsh
