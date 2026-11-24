#!/usr/bin/env bash
# Build lokal (Linux/macOS). Butuh: Rust, Node 20+, JDK 17, Android SDK + NDK 26 (ANDROID_HOME & NDK_HOME terisi).
set -euo pipefail
rustup target add aarch64-linux-android armv7-linux-androideabi
npm install
node --no-warnings tests/core.test.js
npx tauri icon app-icon.png
[ -d src-tauri/gen/android ] || npx tauri android init --ci
npx tauri android build --apk --target aarch64 --target armv7 --ci
APK=$(find src-tauri/gen/android -name "*release-unsigned.apk" | head -n 1)
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -n 1)
"$BT/zipalign" -f -p 4 "$APK" aligned.apk
"$BT/apksigner" sign --ks release.jks --ks-pass pass:bukukas123 --key-pass pass:bukukas123 --out BukuKas.apk aligned.apk
echo "Selesai: $(pwd)/BukuKas.apk"
