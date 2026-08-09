#!/usr/bin/env bash
# Turn on over-the-air updates.
#
# Needs an Expo account (free). It writes the project id and updates URL into
# app.json — those cannot be invented, which is why they are not committed.
#
# IMPORTANT: the APK people already have installed cannot be fixed over the
# air. It was built with updates disabled, so it has nothing listening. Run
# this, build a new APK, hand that one out once — from then on every JavaScript
# change reaches phones without reinstalling.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v eas >/dev/null || { echo "Install the CLI first: npm install -g eas-cli"; exit 1; }

eas whoami >/dev/null 2>&1 || eas login
eas init                    # creates the project, writes extra.eas.projectId
eas update:configure        # writes updates.url into app.json

echo
echo "Now build and distribute one more APK:"
echo "  ./scripts/build-apk.sh"
echo
echo "After that, publish changes with:"
echo "  eas update --branch preview --message \"what changed\""
