# Orden Global · Galaxy OS preview

An isolated visual proposal based on `claude/veta-wallet-phantom-design-7syah8` at `add26a34c7c4152edad294e38fa36d157d99f0cf`. The existing wallet source, authentication, account data, transaction routes and live bundle are not changed by this preview.

## Run

Use Node 22 or later. Run `npm ci --legacy-peer-deps`, then `npm run dev`. `npm run build` produces `dist`. `npm test` checks gesture geometry, bounds, preference validation, preview navigation and the host entry timing.

`predev` and `prebuild` verify third-party assets by SHA-256. The planet, sun, star and galaxy maps are committed under `public/textures`, so an ordinary build performs no downloads at all. When a file is missing the script retries with backoff, refuses HTML error or captcha pages served in place of a file, and, if it still cannot obtain it, warns and lets the build finish: planets fall back to procedural surfaces and AirTouch reports its own missing model. It aborts only when a real file arrives whose checksum does not match the pinned one. `GALAXY_ASSET_BASE` serves the same paths from your own bucket and is tried before the original source.

Interface fonts are self-hosted with the bundle. The shell makes no third-party request at runtime.

## Experience

- Separate explorer entry, a skippable cinematic transition, invariant Orden Global identity in Spanish and English.
- GENESIS CORE is the textured central Sun and ecosystem brain. Ten app planets orbit it in two bands. Quiet radial connections link apps to the core; selecting an app reveals its neighboring connection. Orbits pause during selection, tutorials and open panels.
- All eleven names stay visible in the system view, including while focusing a destination. Unboxed labels are placed around their planets using an initial collision-cost placement, then retain that anchor throughout orbit and selection. Height changes from mobile browser chrome do not reset anchors. Mobile reserves separate regions for the heading, navigation, labels and entry strip.
- Drag direction follows the hand, with a four-pixel threshold, a faster response while dragging and a bounded sensitivity preference. Two-finger zoom and keyboard controls remain available.
- A six-step ES/EN tutorial appears on first entry, supports a real preview flight, remembers dismissal on this device and can be replayed from the header or Accessibility settings.
- Dock selection highlights a planet without moving the camera or opening it. An explicit Enter button starts a cancellable 2.1-second flight; the arrival panel opens only after the current journey completes. Previous/next buttons and arrow keys select worlds without dragging.
- Pro WebGL and Lite Canvas modes share camera paths, hit testing, label placement and navigation. Pro is the initial preference; users can save either startup mode. Missing or lost WebGL falls back to Lite with a visible status explanation.
- Wheel/pinch zoom reaches a separate deep-space overview with moving galaxies, three distant worlds, a pulsar and an illustrative accretion-disk black hole. Hubble imagery adds resolved galactic dust and stellar detail. Distances, sizes and motion are artistic, not a physical simulation.
- Three.js / WebGL2 rendering with mapped surfaces, atmospheric scattering approximation, clouds and procedural star fields. A Canvas2D compatibility renderer preserves navigation on devices without WebGL2; it is a simplified projected view, not equivalent GPU rendering.
- Opt-in, locally synthesized Web Audio ambience, throttled spatial orbit cues, focus sweeps and flight/arrival signatures, with a master compressor and independent ambience toggle. No third-party music or audio recordings.
- Persistent, validated device-only preferences, reduced motion, contrast, text scaling and native modal focus handling.
- MediaPipe hand tracking, explicit camera consent, local inference, pinch selection and orbit gestures. No microphone request, recording, video upload or account access. The camera stops on disable, navigation away or tab hiding.
- Optional feature-detected WebMCP navigation/read tools. They cannot authenticate, transact or enable the camera.

## Boundaries

This is a design preview, not a replacement financial application. Each app opens a labeled preview panel. Other galaxies are conceptual placeholders, not connected services or partnership claims. The visual host bridge preserves the existing AUGALAXY entry points and gesture return shapes; see `HOST-INTEGRATION.md`. CSS is isolated to the new shell and texture/model URLs resolve relative to the bundle for nested hosting. Production host integration must be separately reviewed and regression-tested before use. Do not replace the live bundle from this branch without that review.

## Assets and credit

Planet and solar maps by **Solar System Scope / INOVE**, based on NASA data, used under **CC BY 4.0**: <https://www.solarsystemscope.com/textures/> and <https://creativecommons.org/licenses/by/4.0/>. Color, illumination, spherical projection and composition are modified. Credits are also shown in System settings.

Star map: **NASA/Goddard Space Flight Center Scientific Visualization Studio**, <https://svs.gsfc.nasa.gov/3895>. Public domain per the SVS media policy. M51 image: **NASA, ESA, S. Beckwith (STScI), and The Hubble Heritage Team (STScI/AURA)**, <https://esahubble.org/images/heic0506a/>, CC BY 4.0 under <https://esahubble.org/copyright/>. The composition uses rotation, blending and softened edges; the full linked credit is displayed on the deep-space view. No institutional endorsement is implied.

AirTouch uses the Apache-2.0 MediaPipe Tasks Vision package and Google's Hand Landmarker model. Model source: <https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task>. Original dependency notices are preserved in the distributed package assets. Interface fonts DM Sans and Manrope are used under the SIL Open Font License 1.1 and are self-hosted in `src/experience/fonts`, with system-font fallbacks. Nothing is requested from Google Fonts at runtime.

## Verification

- TypeScript and production bundling pass; twenty automated logic tests cover bounds, geometry, validated preferences, journey cancellation, the existing host gesture contract, central-core position, drag direction and camera stability on selection, and 3,600 consecutive orbit frames without label side-switching.
- Browser-tested: entry and timed intro, dock selection before entry, flight completion and cancellation, ES/EN labels, deep-space navigation, Pro/Lite fallback, preference persistence and audio activation/mute controls.
- Responsive layout inspected in a 390 × 690 and 390 × 844 iframe viewports; app search tested there. This is not physical-phone performance or touch-hardware testing.
- The compiled shell was mounted in an isolated host fixture from a nested build path. Gate, intro callback, unmount/remount and host button/body style isolation were checked. This fixture is not the production wallet or its login.
- Browser GPU unavailable: full WebGL rendering could not be visually verified in this environment; compatibility rendering was inspected instead.
- Camera gestures require a real-device test. No camera permission was granted during automation. Sound playback and level should also be checked with headphones on the target device.
- WebMCP page registry is unavailable in this browser; its integration could not be runtime-validated. Pure action validation is covered by local tests.

- On-screen 360 is available under Visuals & motion. Experimental WebXR/phone-stereo drivers are available only with Pro and compatible APIs; they still require physical-device validation.

## Review fixes — September 20, 2026

A full read of this branch produced four blocking defects; all four are fixed here.

1. **The build depended on live third-party downloads and failed.** `prebuild` fetched seven JPEG maps from solarsystemscope.com on every build. That host rate-limits: it answers with an HTML captcha page and a 202 status, whose bytes fail the pinned checksum, so the build died with `Asset checksum mismatch: textures/jupiter.jpg` — a message describing an integrity problem that had not occurred. On a build machine this is an intermittently broken deploy. The maps are now committed, the script retries with backoff, tells a captcha page apart from a wrong file, accepts a private mirror through `GALAXY_ASSET_BASE`, and never fails the build over an asset the renderer can do without.
2. **The `entrar()` handoff no longer lands under the intro.** See the entry row in `HOST-INTEGRATION.md`: the original flight durations and the 80%-of-flight callback are restored, the intro camera ramp and its end follow the same duration, and `descubrir` and `directo` stop behaving alike. A regression test covers the timings.
3. **Interface fonts are self-hosted.** The stylesheet opened with an `@import` to fonts.googleapis.com: a render-blocking third-party request from the wallet's own origin on every visit, which any CSP would reject and which discloses visitors to a third party. The two variable faces (95 KB total, latin and latin-ext) now ship inside the bundle with hashed filenames, while `assets/augalaxy.css` keeps the fixed name the host loads.
4. **The host-integration gap is documented precisely.** `HOST-INTEGRATION.md` now lists every engine-side global the production wallet still calls, with its call-site count and what disappears if this bundle replaces the live one. The swap stays blocked; this preview is published at its own URL instead.
