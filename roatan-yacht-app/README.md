# Roatán Yacht Getaways — Android app

The booking flow as a native app: pick a vessel, pick a date, load the boat,
pay. Expo SDK 54 / React Native 0.81, the same versions the other apps in this
repo use, so one toolchain covers all of them.

It talks to the `roatan-yacht` server — the same `/api/catalog`, `/api/quote`
and `/api/bookings` the website uses. **Prices are never calculated on the
phone.** The app shows what the server says the trip costs, so an old APK in
someone's pocket can never disagree with the till.

## Build the APK

```bash
./scripts/build-apk.sh
# → android/app/build/outputs/apk/release/app-release.apk   (26 MB)
```

The script prebuilds, wires the release key and runs Gradle. It builds
`arm64-v8a` only — 26 MB instead of 65 MB, and it covers every phone sold in
roughly the last eight years; the x86 slices are for emulators. Pass
`ABIS=all` if you need a universal APK.

Requires the Android SDK (platform 36, build-tools 36) and JDK 17+. Copy the
`.apk` to a phone and open it; Android will ask you to allow installs from that
source once.

If you would rather not install the SDK, EAS builds it in Expo's cloud and
hands you a download link — same as `COMO_GENERAR_APK.md` at the repo root:

```bash
npm install -g eas-cli
eas login
eas init
eas build -p android --profile preview    # buildType: apk
```

## Pointing it at a server

The API host is baked in per build profile in `eas.json`, and falls back to
`extra.apiUrl` in `app.json`:

| Profile | Points at |
| --- | --- |
| `development` | `http://10.0.2.2:3000` — the emulator's name for your laptop |
| `preview` / `production` | the deployed site |

For a local build against your own machine, set it before the build:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo run:android
```

Android blocks plaintext HTTP by default. Testing against a `http://` server on
your LAN needs `usesCleartextTraffic` — fine for development, never for the
build you hand to guests. The deployed site is HTTPS, so the shipped APK is
unaffected.

## What is different from the website

Not a wrapper around the web page — a real app, and a few things had to change
to be honest on a phone:

- **Tap replaces drag.** On the desktop you drag an extra onto the deck plan.
  Dragging across a scrolling phone screen is a fight nobody wins, so a tap
  sends it aboard, the zone it lands in pulses, and a haptic confirms it. The
  metaphor survives; the wrestling does not.
- **The manifest became a bar.** There is no room for a sticky sidebar, so the
  total follows you down the page and opens the review screen.
- **The boat photographs ship inside the APK** (`assets/boats`), so the fleet
  looks right on first launch before the phone has reached any server. Photos
  added later through the admin are fetched from the API host instead.
- **Bookings are remembered on the device.** Every reference booked on this
  phone is stored, so "My booking" works without typing anything, and the
  boarding pass is the biggest thing on the screen because that is what the
  crew reads at the dock.
- **The Android back button navigates**, and payment opens Stripe in the system
  browser sheet rather than an in-app web view, because guests should be able
  to see the padlock in a browser they recognise when they type a card number.

## Layout

```
App.js                    screen state, the cart, and the quote debounce
src/api.js                the four calls the app makes
src/theme.js              the chart palette, shared with the website
src/images.js             bundled photographs, with a remote fallback
src/components/           DeckPlan (SVG), Calendar, shared UI atoms
src/screens/              Fleet, Build, Checkout, Booking
```

## Before the Play Store

`android/app/release.keystore` is committed so anyone can build an installable
APK from a clean checkout. That is right for handing a file around and wrong
for the Play Store: generate your own keystore, keep it out of the repo and
back it up, because whoever holds that key controls updates to the installed
app. Losing it means shipping under a new listing.
