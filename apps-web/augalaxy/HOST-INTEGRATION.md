# Visual host compatibility

This branch contains a reviewable replacement visual shell, with the original engine source preserved. It does not replace the production wallet bundle, login or account services.

## Existing contract

| Existing entry | Preview behavior |
| --- | --- |
| `AUGALAXY.montar(element)` | Mounts the visual shell into the supplied host element; honors `__AE_LANG` and `__AE_PUERTA`. |
| `AUGALAXY.desmontar()` | Cancels visual timers, releases hand tracking and audio, unmounts React and clears view state. |
| `AUGALAXY.puerta()` | Restores the solar gate behind the existing host login. |
| `AUGALAXY.entrar(type, callback)` | Honors the original flight contract: 1100 ms for `directo`, 2300 ms for `descubrir`, with the host callback at 80% of the flight (880 / 1840 ms). The intro camera ramp and its automatic end follow the same duration, so the host changes view behind a flight that is still running instead of under a fixed 4.8 s intro. Reduced motion shortens both. An unknown type falls back to `directo`. |
| `AUGALAXY.exhalar()` | Returns to the solar system. |
| `AUGALAXY._transito()` | Reports active intro/flight, destination world and visible preview panel. |
| `__AE_MIRAR(x, y)` | Returns `{key, nombre}` for the visible planet or null while a modal/flight is active. |
| `__AE_RESALTAR(id)` | Highlights and pauses the orbit without moving the camera. |
| `__AE_TOCAR(id)` | Starts the same cancellable entry flight as the Enter button. |
| `__AE_VISTA.zoom(factor)` | Supports the host's existing pinch-zoom controller. Existing acercar/alejar/recentrar/girar/mover aliases remain. |

Only the existing chat handoff is exposed in embedded preview mode. Other destinations remain explicit design panels. No financial handoff, token reading, account fetch, transaction execution or authentication integration has been added.

## Asset and style isolation

The existing fixed entry names, `assets/augalaxy.js` and `assets/augalaxy.css`, remain. Chunks retain hashed names. Texture and hand-model paths resolve relative to the compiled entry, so a host can serve the build at its existing `/augalaxy/` path. Prebuild downloads are SHA-256 checked. Serve the entire output directory together; copying the entry alone omits required textures and chunks.

The Vite CSS transform scopes the shell stylesheet to `.galaxy-os`; host inputs, buttons, body and login styles retain their own rules. Full-page sizing applies only to `html.og-standalone`. Motion, contrast and text size live on the shell element.

## Engine-side globals the host calls, and what they are for

Verified against `apps-web/veta-wallet/app.js` on `backup/legacy-webos-2026-09-20`. Every one of these is **headset-only**: the wallet draws its ordinary HTML on a normal screen and calls the engine only while `VISOR.activo()` is true, because inside a headset the screen is split per eye and a single HTML layer is drawn over both halves, which reads as a doubled smear. They are now implemented.

| Global | Host call sites | Implementation |
| --- | --- | --- |
| `__AE_PORTICO(modo, boton, sub)` | 7 | An in-scene door. Putting a headset on is a clumsy moment; if gaze were already armed, whichever planet sat in the centre would open by itself. The portal is what the person sees first, and until it is pressed gaze opens nothing else. Pressing dispatches `ae-portico` with `{modo}`. |
| `__AE_CASA(datos \| null)` | 3 | The world panel as a scene object with real buttons, so opening a world does not mean taking the headset off. Pressing a button dispatches `ae-casa` with `{accion, key}`. Malformed data, or a panel with no usable button, is refused rather than left trapping the gaze. |
| `__AE_DECIR(texto, peso)` | 2 | The spoken line as a scene object. Scripture keeps its italic voice. |
| `__AE_GENESIS` | 3 | `empezar({alActo, alFin, casas, rotulos})`, `saltar()`, `vivo()`. The host writes the words act by act; this engine owns the timing and the camera. The act list and its durations are the previous engine's, because they are cut against the music the host starts. Staging is this engine's own, not an imitation of the old rig. |
| `__AE_BLINDADO` | 6 | Set by the host, read here: while it is true, gaze selects no planet. |
| `__AE_APPS`, `__AE_AURA`, `__AE_ABRIR` | 3 | Installed by the host for the engine. Only `__AE_ABRIR` is consumed (the chat handoff). |

Two decisions inside this implementation are worth stating, because both were found by driving the compiled bundle rather than by reading it:

- **Panels anchor where they appear.** A panel that follows the head continuously cannot be aimed at: it moves with you and the gaze always lands on the same spot, so its buttons are unreachable. It stays put while you look at it and only re-accommodates once your view has drifted well away.
- **Gaze time is wall-clock, and one press per aim.** Accumulating clamped frame deltas turned "hold for 1.5 s" into three seconds on an eleven-frame-per-second stereo view, and a held gaze re-fired the same button every 1.5 s — three `Abrir` actions nobody asked for. Leaving the button and returning is now required to press it again.

`AUGALAXY.acomodo()` still reports a binary 1/0 where the previous engine exposed the continuous 0..1 settling value. The old `__AE_TEATRO` and `__AE_NUCLEO` entry points, which `app.js` does not call, remain unimplemented.

## Remaining integration verification

- Check a staging host through login gate, intro, menu, mount/unmount and return transitions.
- Check Pro shaders, graphics performance and GPU context loss on actual WebGL2 devices.
- Check camera gestures and audio levels on physical hardware.
- The original engine remains preserved. The new headset driver is an experimental replacement, not full parity with the old portal, controller and cinematic contracts.
- No production app, identity, account or financial flow has been tested or changed.

## Hardening completed after the release audit

- Standalone startup requires the explicit `data-orden-standalone` marker. A generic host `#root` is never adopted.
- Mount validates its target before teardown. Unmount clears pending intro callbacks, hit testing, projected positions and label layout, and releases camera/audio resources.
- React mounting no longer overwrites a host-requested intro. Return closes stale app/settings/help/tutorial panels.
- Gesture selection is blocked behind directory, settings, help, tutorial and native dialogs. Editable host text is excluded from keyboard shortcuts.
- The chat handoff catches missing callbacks, explicit rejection and thrown/rejected errors. Failure keeps its panel open with a retryable message. A successful callback means the host accepted the handoff; it does not verify a remote chat service.
- Pending audio resume operations are invalidated on mute, suspend and teardown to avoid stale access to disposed audio nodes.

`tests/host-fixture.html` is a local, compiled-bundle fixture for mount, intro, immediate cancellation, return and a deliberately failing chat callback. It preserves unrelated host content and does not load account services. Serve the project with its dev server after building and open that fixture locally. This is not a production login test.

The portal, house, spoken-line and origin-story entry points are implemented above rather than stubbed. Production replacement still waits on the hardware checks above: a real headset, a real phone and the production login.

## Screen panorama adapter

`__AE_VISOR` now implements on-screen `trescientos60` entry, exit, state, detection and recentering using the shared camera in both renderers. Camera position remains fixed while pointer/arrow input changes its view direction. Orbits pause during panorama. Exiting restores the solar overview and emits `ae-visor-fuera`, including exits triggered by other navigation.

The initial panorama-only adapter has now been extended by the headset driver below. No login, account, transaction or remote application service is opened by the viewer. Browser validation covers screen controls; physical headset validation remains outstanding.

## Headset driver implementation and verification boundary

The Pro renderer now registers actual WebXR and phone-stereo drivers. WebXR requests an immersive session only from explicit entry, falls back from local-floor to local reference space, owns stereo rendering, and restores the original camera parent on exit. The phone driver requests orientation permission when required and renders separate eyes with bounded spacing. Planet labels and an exit instruction are rendered inside the 3D scene. Looking at a planet displays its name; no app or account is opened. A controller trigger exits WebXR; tapping the screen exits phone stereo.

Session startup is cancellable. Pending startup cannot revive a dismissed viewer. Permission/driver failure returns to the solar system with an error message. Unmount and renderer loss end sessions and remove sensor listeners. A mode is offered only when its driver and browser API are available; API presence does not prove sensor output or visual correctness.

19 logic tests pass, including mocked driver cancellation and failure. These are controller tests, not GPU, headset, sensor, stereo-comfort or hardware certification. WebXR rendering, phone sensor alignment, calibration and physical exit controls remain unverified on actual devices. Treat the headset drivers as experimental until those checks pass. The production replacement remains on hold. Financial-host authentication and portal actions are not integrated.
