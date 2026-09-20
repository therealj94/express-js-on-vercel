# Design review — September 20, 2026

The supplied phone screenshot exposes three failures in the previous revision: large opaque labels dominate and cover the planets, dense stars and multiple connection layers compete with the content, and selecting an app unexpectedly moves the camera. A taller test viewport missed the real phone’s reduced usable height.

## Changes

- Replace fixed label columns with lightweight text around the projected planets. Keep all app names available; penalize label and planet collisions during placement.
- Preserve camera position, zoom and orbit direction when selecting. Only Enter starts the flight. Interpolate flight pitch instead of snapping it at departure.
- Reduce the star map and system particle intensity. Show a quiet radial structure and emphasize the selected relationship.
- Adapt the mobile orbit envelope, separate top controls from labels, and use a compact bottom entry strip with its close control inside it.
- Update the tutorial to explain selection before travel.

## Verification and limits

Thirteen logic checks include unchanged camera position and orientation on selection, journey cancellation, orbit direction and the central Sun. Production TypeScript and bundling are checked. Desktop and short mobile composition are visually reviewed in the compatibility renderer. The local browser does not expose WebGL, so the updated Pro particle opacity and GPU appearance still need visual inspection on a GPU-enabled device. No claim of full Pro visual validation is made. Existing app names and production services are unchanged.

## Motion correction from the supplied recording

The ten-second phone recording revealed a temporal defect missed by still-image review: frame-by-frame discrete candidate selection made labels flip around almost-stationary planets. Labels now choose their anchor once per viewport width and keep it during orbit, hover and selection. The entry panel reserves its space before selection. Subpixel transforms avoid integer-pixel stepping, and the selection underline no longer changes the label box height. A 3,600-frame regression verifies stable anchors and bounded frame-to-frame displacement. Labels can still approach each other at extreme user-controlled camera angles; this correction deliberately avoids repeated automatic side changes.
