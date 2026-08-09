#!/usr/bin/env python3
"""Cut every photograph to the shapes the products actually display.

The app shows photographs in tall portrait cards. Feeding it a landscape crop
made the component scale the picture up and slice most of it away — boats lost
their bows, tables lost their plates. So each source gets an explicit focal
point here, once, and every derivative is cut around it.

  -app.jpg   900x1200 (3:4)  the phone: boat cards, category art, detail sheets
  -card.jpg  900x600  (3:2)  the website grid
  -sm.jpg    620x827  (3:4)  the website gallery thumbnails

FOCAL is (cx, cy, zoom): the centre of interest as a fraction of the frame, and
how much of the largest possible crop to keep. zoom below 1 moves in closer —
that is how the two speedboat-at-distance shots stop being pictures of sky.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, '..', 'public', 'media')
APP_ASSETS = os.path.join(HERE, '..', '..', 'roatan-yacht-app', 'assets', 'boats')

FOCAL = {
    # Already shot in portrait and framed well — keep the whole frame.
    'knotty-stern':          (0.50, 0.46, 1.00),
    'knotty-cockpit-wide':   (0.50, 0.52, 1.00),
    'knotty-helm':           (0.50, 0.52, 1.00),
    'knotty-cabin-night':    (0.50, 0.46, 1.00),
    'knotty-cockpit-table':  (0.50, 0.54, 1.00),
    # Landscape source: the set table is the subject, the ceiling is not.
    'knotty-dinner-night':   (0.52, 0.55, 1.00),
    # The boat sits high-left with half the frame given to wake. Move in on it.
    'lilknotty-running':     (0.52, 0.33, 0.62),
    # Same shot from further away — even more sky to lose.
    'lilknotty-running-wide': (0.47, 0.50, 0.58),
    'lilknotty-dusk':        (0.50, 0.48, 1.00),
    # Hull runs from the top to two-thirds down; the bottom is empty harbour.
    'lilknotty-marina':      (0.50, 0.40, 1.00),
    'hero-knotty':           (0.34, 0.50, 1.00),
}

# The phone crop is 800 wide: a 363 dp card on a 3x screen wants ~1090 px,
# and every pixel past that is APK weight nobody can see.
SIZES = [('app', 800, 1067), ('card', 900, 600), ('sm', 620, 827)]


def crop(im, cx, cy, zoom, ratio):
    """Largest box of `ratio` that fits, scaled by zoom, centred on (cx, cy)."""
    w, h = im.size
    bw, bh = (w, w / ratio) if w / h < ratio else (h * ratio, h)
    bw, bh = bw * zoom, bh * zoom
    # Centre on the focal point, then slide back inside the frame.
    left = min(max(cx * w - bw / 2, 0), w - bw)
    top = min(max(cy * h - bh / 2, 0), h - bh)
    return im.crop((round(left), round(top), round(left + bw), round(top + bh)))


def main():
    if not os.path.isdir(APP_ASSETS):
        os.makedirs(APP_ASSETS)
    made = 0
    for name, (cx, cy, zoom) in FOCAL.items():
        src = os.path.join(MEDIA, name + '.jpg')
        if not os.path.exists(src):
            print('missing source:', src, file=sys.stderr)
            continue
        original = Image.open(src).convert('RGB')
        for suffix, ow, oh in SIZES:
            out = crop(original, cx, cy, zoom, ow / oh).resize((ow, oh), Image.LANCZOS)
            path = os.path.join(MEDIA, '%s-%s.jpg' % (name, suffix))
            out.save(path, quality=86, optimize=True, progressive=True)
            made += 1
            # The phone crop is the only one that ships inside the APK.
            if suffix == 'app':
                out.save(os.path.join(APP_ASSETS, '%s-app.jpg' % name),
                         quality=80, optimize=True, progressive=True)
    print('wrote %d crops for %d photographs' % (made, len(FOCAL)))


if __name__ == '__main__':
    main()
