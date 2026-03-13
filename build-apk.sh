#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ExitSA — Local APK build script
# Requirements: Node.js 18+, Java 17+, Android SDK (ANDROID_HOME set)
# ─────────────────────────────────────────────────────────────────────────────
set -e

CYAN="\033[0;36m"
GREEN="\033[0;32m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${CYAN}ExitSA APK Builder${RESET}"
echo "────────────────────"

# Check prerequisites
check() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}✗ $1 not found. $2${RESET}"
    exit 1
  fi
  echo -e "${GREEN}✓ $1 found${RESET}"
}

check node  "Install Node.js 18+ from https://nodejs.org"
check java  "Install Java 17+ from https://adoptium.net"
check npx   "Comes with Node.js"

if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
  echo -e "${RED}✗ ANDROID_HOME not set."
  echo "  Install Android SDK via Android Studio or command-line tools."
  echo "  https://developer.android.com/studio${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ Android SDK at ${ANDROID_HOME:-$ANDROID_SDK_ROOT}${RESET}"

# Install npm packages
echo ""
echo "1/5  Installing npm packages…"
npm install --silent

# Copy web assets to www/
echo "2/5  Copying web assets to www/…"
mkdir -p www
cp index.html sw.js manifest.json icon.svg www/

# Sync Capacitor
echo "3/5  Syncing Capacitor…"
npx cap sync android

# Generate keystore if missing
if [ ! -f "exitsa-release.keystore" ]; then
  echo "4/5  Generating release keystore…"
  keytool -genkeypair -v \
    -keystore exitsa-release.keystore \
    -alias exitsa \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass exitsa2025 -keypass exitsa2025 \
    -dname "CN=ExitSA, OU=Mobile, O=ExitSA, L=Johannesburg, ST=Gauteng, C=ZA" \
    2>/dev/null
  echo -e "${GREEN}✓ Keystore created${RESET}"
else
  echo "4/5  Using existing keystore"
fi

# Build APK
echo "5/5  Building release APK (this takes ~2 min)…"
cp exitsa-release.keystore android/exitsa-release.keystore
cd android
chmod +x gradlew
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file=exitsa-release.keystore \
  -Pandroid.injected.signing.store.password=exitsa2025 \
  -Pandroid.injected.signing.key.alias=exitsa \
  -Pandroid.injected.signing.key.password=exitsa2025 \
  --quiet
cd ..

# Copy to downloads/
mkdir -p downloads
APK=$(find android -name "app-release.apk" | head -1)
cp "$APK" downloads/ExitSA.apk

echo ""
echo -e "${GREEN}────────────────────────────────────────${RESET}"
echo -e "${GREEN}✓ APK ready: downloads/ExitSA.apk${RESET}"
echo -e "${GREEN}  $(du -h downloads/ExitSA.apk | cut -f1) — ready to distribute${RESET}"
echo -e "${GREEN}────────────────────────────────────────${RESET}"
echo ""
echo "To install on a connected Android device:"
echo "  adb install downloads/ExitSA.apk"
