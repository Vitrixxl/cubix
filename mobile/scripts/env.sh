#!/bin/sh
# Local Android toolchain installed under $HOME (no system packages needed).
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/share/jdk}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/share/android}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
