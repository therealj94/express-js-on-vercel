# Visual host compatibility

This branch contains a reviewable replacement visual shell, with the original engine source preserved. It does not replace the production wallet bundle, login or account services.

## Existing contract

| Existing entry | Preview behavior |
| --- | --- |
| `AUGALAXY.montar(element)` | Mounts the visual shell into the supplied host element; honors `__AE_LANG` and `__AE_PUERTA`. |
| `AUGALAXY.desmontar()` | Cancels visual timers, releases hand tracking and audio, unmounts React and clears view state. |
| `AUGALAXY.puerta()` | Restores the solar gate behind the existing host login. |
| `AUGALAXY.entrar(type, callback)` | Starts the brand intro and acknowledges the host handoff after 100 ms, matching the existing callback timing. The UI finishes or skips the intro independently. |
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

## Remaining integration verification

- Check a staging host through login gate, intro, menu, mount/unmount and return transitions.
- Check Pro shaders, graphics performance and GPU context loss on actual WebGL2 devices.
- Check camera gestures and audio levels on physical hardware.
- The original WebXR path is preserved in the old engine source but has not been ported to this preview entry.
- No production app, identity, account or financial flow has been tested or changed.

## Hardening completed after the release audit

- Standalone startup requires the explicit `data-orden-standalone` marker. A generic host `#root` is never adopted.
- Mount validates its target before teardown. Unmount clears pending intro callbacks, hit testing, projected positions and label layout, and releases camera/audio resources.
- React mounting no longer overwrites a host-requested intro. Return closes stale app/settings/help/tutorial panels.
- Gesture selection is blocked behind directory, settings, help, tutorial and native dialogs. Editable host text is excluded from keyboard shortcuts.
- The chat handoff catches missing callbacks, explicit rejection and thrown/rejected errors. Failure keeps its panel open with a retryable message. A successful callback means the host accepted the handoff; it does not verify a remote chat service.
- Pending audio resume operations are invalidated on mute, suspend and teardown to avoid stale access to disposed audio nodes.

`tests/host-fixture.html` is a local, compiled-bundle fixture for mount, intro, immediate cancellation, return and a deliberately failing chat callback. It preserves unrelated host content and does not load account services. Serve the project with its dev server after building and open that fixture locally. This is not a production login test.

The older WebXR/portal/genesis animation APIs are still unsupported. They are not installed as misleading no-op compatibility functions. Production replacement remains blocked on those real requirements and on the hardware checks above.

## Screen panorama adapter

`__AE_VISOR` now implements on-screen `trescientos60` entry, exit, state, detection and recentering using the shared camera in both renderers. Camera position remains fixed while pointer/arrow input changes its view direction. Orbits pause during panorama. Exiting restores the solar overview and emits `ae-visor-fuera`, including exits triggered by other navigation.

This adapter reports `xr: false`, `giroscopio: false` and no permission request. It rejects `xr` and `carton` explicitly; it does not present itself as a headset implementation. Settings explains this distinction. No camera, login, account, transaction or remote application service is opened by the panorama. Browser validation covers the screen controls; real headset support remains outstanding.
