#!/bin/sh
# Builds the Android app (NativeActivity, no Java): ./build.sh [x86_64|arm64|all] → target/qbix.apk
# The Rust toolchain with the Android targets and a JDK live in ~/.local/share/qbix-toolchain, apart from the system's.
set -e
cd "$(dirname "$0")/.."
abis=${1:-all}
T=$HOME/.local/share/qbix-toolchain
SDK=${ANDROID_HOME:-$HOME/Android/Sdk}
NDK=$(ls -d "$SDK"/ndk/* | tail -1)/toolchains/llvm/prebuilt/linux-x86_64/bin
BT=$(ls -d "$SDK"/build-tools/* | tail -1)
JAR=$(ls "$SDK"/platforms/*/android.jar | tail -1)
export CARGO_HOME=$T/cargo RUSTUP_HOME=$T/rustup PATH=$T/cargo/bin:$T/jdk/bin:$PATH JAVA_HOME=$T/jdk
tgt=${CARGO_TARGET_DIR:-target}
out=$tgt/android
rm -rf $out && mkdir -p $out/lib
build() { # target abi clang
  t=$1; up=$(echo "$t" | tr a-z- A-Z_)
  export CC_$(echo "$t" | tr - _)=$NDK/${3}30-clang AR_$(echo "$t" | tr - _)=$NDK/llvm-ar CARGO_TARGET_${up}_LINKER=$NDK/${3}30-clang
  cargo build --release -p qbix --lib --target "$t"
  mkdir -p $out/lib/$2 && cp $tgt/$t/release/libqbix.so $out/lib/$2/
  "$NDK/llvm-strip" $out/lib/$2/libqbix.so
}
case $abis in x86_64|all) build x86_64-linux-android x86_64 x86_64-linux-android ;; esac
case $abis in arm64|all) build aarch64-linux-android arm64-v8a aarch64-linux-android ;; esac
"$BT/aapt2" compile --dir android/res -o $out/res.zip
"$BT/aapt2" link -o $out/base.apk --manifest android/AndroidManifest.xml -I "$JAR" $out/res.zip
python3 -c "
import os, sys, zipfile
z = zipfile.ZipFile(sys.argv[1], 'a', zipfile.ZIP_DEFLATED)
for root, _, files in os.walk(sys.argv[2]):
    for f in files:
        path = os.path.join(root, f)
        z.write(path, os.path.relpath(path, os.path.dirname(sys.argv[2])))
z.close()" $out/base.apk $out/lib
"$BT/zipalign" -f -p 4 $out/base.apk $out/aligned.apk
key=$T/debug.keystore
[ -f $key ] || keytool -genkeypair -keystore $key -storepass android -keypass android -alias qbix -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Qbix debug" >/dev/null 2>&1
"$BT/apksigner" sign --ks $key --ks-pass pass:android --key-pass pass:android --out $tgt/qbix.apk $out/aligned.apk
echo "$tgt/qbix.apk ($(du -h $tgt/qbix.apk | cut -f1))"
