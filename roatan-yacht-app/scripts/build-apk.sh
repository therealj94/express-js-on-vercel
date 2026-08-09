#!/usr/bin/env bash
# Build an installable, signed APK from a clean checkout.
#
#   ./scripts/build-apk.sh                        → points at the deployed site
#   API_URL=http://192.168.1.20:3000 ./scripts/build-apk.sh   → your machine
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

export EXPO_PUBLIC_API_URL="${API_URL:-https://roatan-yacht.vercel.app}"
echo "Building against $EXPO_PUBLIC_API_URL"
( cd android && ./gradlew assembleRelease --no-daemon -x lint )

APK=android/app/build/outputs/apk/release/app-release.apk
echo
echo "APK: $(pwd)/$APK"
ls -lh "$APK"
