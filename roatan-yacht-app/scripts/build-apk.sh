#!/usr/bin/env bash
# Build an installable, signed APK from a clean checkout.
#
#   ./scripts/build-apk.sh                        → points at the deployed site
#   API_URL=http://192.168.1.20:3000 ./scripts/build-apk.sh   → your machine
#   ABIS=all ./scripts/build-apk.sh               → every architecture (~65 MB)
#
# Default is arm64-v8a only: 26 MB instead of 65 MB, and it covers every phone
# sold in roughly the last eight years. The x86 slices exist for emulators.
#
# Needs the Android SDK (platform 36, build-tools 36) and JDK 17+.
# No SDK? Use EAS instead: eas build -p android --profile preview
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
[ -d "$ANDROID_HOME" ] || { echo "Android SDK not found at $ANDROID_HOME. Set ANDROID_HOME."; exit 1; }

[ -d node_modules ] || npm install

# android/ is generated, not committed, so every build starts from app.json.
npx expo prebuild --platform android --no-install --clean

cp release.keystore android/app/release.keystore
cat >> android/gradle.properties <<'PROPS'

MYAPP_UPLOAD_STORE_FILE=release.keystore
MYAPP_UPLOAD_KEY_ALIAS=roatan
MYAPP_UPLOAD_STORE_PASSWORD=roatanyacht
MYAPP_UPLOAD_KEY_PASSWORD=roatanyacht
PROPS

# Swap the debug signing the template ships with for the release key.
python3 - <<'PY'
import pathlib
p = pathlib.Path('android/app/build.gradle'); s = p.read_text()
s = s.replace("""        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }""", """        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file(MYAPP_UPLOAD_STORE_FILE)
            storePassword MYAPP_UPLOAD_STORE_PASSWORD
            keyAlias MYAPP_UPLOAD_KEY_ALIAS
            keyPassword MYAPP_UPLOAD_KEY_PASSWORD
        }
    }""")
s = s.replace("""            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug""", "            signingConfig signingConfigs.release")
p.write_text(s)
PY

if [ "${ABIS:-arm64}" = "all" ]; then
  ARCHS="armeabi-v7a,arm64-v8a,x86,x86_64"
else
  ARCHS="arm64-v8a"
fi
sed -i "s/^reactNativeArchitectures=.*/reactNativeArchitectures=$ARCHS/" android/gradle.properties
echo "Architectures: $ARCHS"

# Say plainly whether this APK will be able to update itself, because the
# answer is decided here and cannot be fixed afterwards on installed phones.
if grep -q '"url"' app.json 2>/dev/null; then
  echo "Over-the-air updates: ON"
else
  echo "Over-the-air updates: OFF — run ./scripts/enable-ota.sh first if you want them."
fi

export EXPO_PUBLIC_API_URL="${API_URL:-https://roatan-yacht.vercel.app}"
echo "Building against $EXPO_PUBLIC_API_URL"
( cd android && ./gradlew assembleRelease --no-daemon -x lint )

APK=android/app/build/outputs/apk/release/app-release.apk
echo
echo "APK: $(pwd)/$APK"
ls -lh "$APK"
