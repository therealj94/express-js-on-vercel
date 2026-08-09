# Love Cloud Roatán — Android app

The booking flow as a native app: pick a vessel, pick a date, load the boat,
pay. Expo SDK 54 / React Native 0.81, the same versions the other apps in this
repo use, so one toolchain covers all of them.

It talks to the `roatan-yacht` server — the same `/api/catalog`, `/api/quote`
and `/api/bookings` the website uses. When the server answers, its number is
the price; the app never argues with the till.

**It also works with no server at all.** The catalogue ships inside the APK, so
the fleet, the extras and the prices are there on first launch with no signal.
Offline the total is worked out on the phone, labelled an estimate, and the
request goes out over WhatsApp with the whole manifest written into it. Roatán
is not a place with reliable data, and a booking app that shows an error screen
when the tower is busy is not an app.

`src/pricing.js` mirrors `server/pricing.js`. Two copies of a formula is a real
risk, so `scripts/check-pricing-parity.mjs` runs both over the same carts and
fails on any difference — including the case that matters most, an extra bought
inside a package not being charged twice:

```bash
cd ../roatan-yacht && npm start &     # the server on :3000
cd ../roatan-yacht-app
API=http://localhost:3000 node scripts/check-pricing-parity.mjs
```

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

**Settings inside the app is the first place it looks.** Type the address,
press Test, press Save — one APK survives the site moving, and nobody has to
reinstall because a domain changed. Failing that it uses the value baked in at
build time:

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

## Over-the-air updates

The APK built today has them **off**. `expo-updates` is compiled in, but the
updates URL carries an Expo project id that only exists once someone runs
`eas init` against their own account — so the manifest says
`expo.modules.updates.ENABLED=false` and the app runs the JavaScript it shipped
with.

To switch them on:

```bash
./scripts/enable-ota.sh    # eas login, eas init, eas update:configure
./scripts/build-apk.sh     # build one more APK
```

Hand that APK out once. From then on, JavaScript changes reach phones with
`eas update --branch preview` — no reinstalling. `runtimeVersion` uses the
`fingerprint` policy, so adding a library with native code correctly stops
updates from reaching older APKs instead of shipping them JavaScript their
binary cannot run.

The phones that already have the current APK cannot be fixed over the air —
they are missing the very component that would fetch the fix. That is the same
trap `COMO_GENERAR_APK.md` describes for Veta Wallet.

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
