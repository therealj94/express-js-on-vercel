# Orden Global · Galaxy OS preview

An isolated visual proposal based on `claude/veta-wallet-phantom-design-7syah8` at `add26a34c7c4152edad294e38fa36d157d99f0cf`. The existing wallet source, authentication, account data, transaction routes and live bundle are not changed by this preview.

## Run

Use Node 22 or later. Run `npm ci --legacy-peer-deps`, then `npm run dev`. `npm run build` produces `dist`. `npm test` checks gesture geometry, bounds, preference validation and preview navigation.

`predev` and `prebuild` prepare third-party assets with SHA-256 verification. Downloads are required only if matching local files are absent. Browser runtime loads planet textures and the AirTouch model from its own origin. AirTouch code and WASM are loaded only when enabled.

## Experience

- Separate explorer entry, a skippable cinematic transition, invariant Orden Global identity in Spanish and English.
- Eleven app planets, close-up flight, orbit, wheel/touch zoom, application search, keyboard navigation and distant conceptual galaxies.
- Three.js / WebGL2 rendering with mapped surfaces, atmospheric scattering approximation, clouds and procedural star fields. A Canvas2D compatibility renderer preserves navigation on devices without WebGL2; it is a simplified projected view, not equivalent GPU rendering.
- Opt-in, locally synthesized Web Audio ambience and transition cues. No third-party music or audio recordings.
- Persistent, validated device-only preferences, reduced motion, contrast, text scaling and native modal focus handling.
- MediaPipe hand tracking, explicit camera consent, local inference, pinch selection and orbit gestures. No microphone request, recording, video upload or account access. The camera stops on disable, navigation away or tab hiding.
- Optional feature-detected WebMCP navigation/read tools. They cannot authenticate, transact or enable the camera.

## Boundaries

This is a design preview, not a replacement financial application. Each app opens a labeled preview panel. Other galaxies are conceptual placeholders, not connected services or partnership claims. The visual host bridge in `entry.tsx` preserves the existing AUGALAXY entry points, but production host integration must be separately reviewed and regression-tested before use. Do not replace the live bundle from this branch without that review.

## Assets and credit

Planet maps by **Solar System Scope / INOVE**, based on NASA data, used under **CC BY 4.0**: <https://www.solarsystemscope.com/textures/> and <https://creativecommons.org/licenses/by/4.0/>. Color, illumination, spherical projection and composition are modified. Credits are also shown in System settings.

AirTouch uses the Apache-2.0 MediaPipe Tasks Vision package and Google's Hand Landmarker model. Model source: <https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task>. Original dependency notices are preserved in the distributed package assets. Interface fonts DM Sans and Manrope load from Google Fonts with system-font fallbacks.

## Verification

- TypeScript and production bundling pass; six automated logic tests pass.
- Browser-tested: entry and timed intro, planet selection/close-up, ES/EN labels, gallery scale navigation, preference selection and persistence.
- Responsive layout inspected in a 390 × 844 iframe viewport; app search tested there. This is not physical-phone performance or touch-hardware testing.
- Browser GPU unavailable: full WebGL rendering could not be visually verified in this environment; compatibility rendering was inspected instead.
- Camera gestures require a real-device test. No camera permission was granted during automation. Sound playback and level should also be checked with headphones on the target device.
- WebMCP page registry is unavailable in this browser; its integration could not be runtime-validated. Pure action validation is covered by local tests.
