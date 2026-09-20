#!/usr/bin/env python3
"""De los originales con licencia a lo que se publica.

    python3 scripts/derivar-texturas.py

Los JPEG de `assets-fuente/textures/` son los originales de Solar System Scope,
NASA y ESA: son los que llevan el crédito, los que verifica prepare-assets por
su SHA-256 y los que NO se publican. De ellos salen los WebP de
`public/textures/`, que es lo que baja la gente.

Por qué: un planeta ocupa ochenta píxeles en un teléfono y se estaban mandando
JPEG de 2048 px. El fondo estelar y la galaxia M51 aguantan más porque se ven
enteros, pero tampoco 4 MB.
"""
from PIL import Image
import pathlib, sys

AQUI = pathlib.Path(__file__).resolve().parent.parent
FUENTE, DESTINO = AQUI / 'assets-fuente' / 'textures', AQUI / 'public' / 'textures'
# ancho máximo y calidad por mapa: el fondo se mira entero, un planeta no
MEDIDAS = {'starmap': (2048, 80), 'whirlpool': (1600, 82), 'sun': (1024, 86)}
POR_DEFECTO = (1024, 84)

DESTINO.mkdir(parents=True, exist_ok=True)
if not FUENTE.is_dir():
    sys.exit(f'no encuentro los originales en {FUENTE}')
total_antes = total_despues = 0
for jpg in sorted(FUENTE.glob('*.jpg')):
    ancho, calidad = MEDIDAS.get(jpg.stem, POR_DEFECTO)
    img = Image.open(jpg).convert('RGB')
    if img.width > ancho:
        img = img.resize((ancho, max(1, round(img.height * ancho / img.width))), Image.LANCZOS)
    destino = DESTINO / (jpg.stem + '.webp')
    img.save(destino, 'WEBP', quality=calidad, method=6)
    total_antes += jpg.stat().st_size
    total_despues += destino.stat().st_size
    print(f'  {jpg.stem:14s} {jpg.stat().st_size/1e6:5.2f} MB → {destino.stat().st_size/1e6:5.2f} MB  ({img.width}px)')
print(f'  total {total_antes/1e6:.1f} MB → {total_despues/1e6:.1f} MB')
