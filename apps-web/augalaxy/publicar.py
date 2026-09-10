#!/usr/bin/env python3
"""Compila la galaxia, la deja en la wallet y le SELLA la versión.

    python3 publicar.py

Por qué existe: la entrada del motor tiene nombre fijo (`augalaxy.js`), y un
nombre fijo es una invitación a que un navegador se quede con la copia vieja.
Aquí se calcula la huella de lo compilado y se escribe en app.js, que pide el
motor con `?v=<huella>`: si el motor cambió, la dirección cambia, y no hay
copia vieja que valga. Los trozos ya llevan su huella en el nombre.

── POR QUÉ ESTE ARCHIVO ESTUVO ROTO, Y QUÉ ENSEÑA ──────────────────────────

Hasta el 6-sep-2026 esto apuntaba a `veta-wallet/aetherion/assets/aetherion.js`.
Esa carpeta no existe: el motor se renombró a `augalaxy` y quedó en
`veta-wallet/augalaxy/assets/augalaxy.js`, que es lo que app.js pide de verdad.
Con la ruta vieja el guion reventaba en la primera línea que tocara un archivo,
así que en la práctica NADIE lo corría: se compilaba a mano, se copiaba a mano,
y `AET_V` se quedaba con la huella de una versión de agosto.

La consecuencia no es cosmética. Se publica una galaxia nueva, la dirección que
pide el navegador sigue siendo `augalaxy.js?v=94968b8cba` porque la huella no
cambió, y quien ya tenía la página abierta sigue viendo la de antes. Es
exactamente el «publiqué y sigo viendo lo viejo» que ya pasó una vez y que la
nota de vite.config.ts describe.

La lección, que vale más que el arreglo: un guion de publicación que no se
ejecuta en cada publicación no es un guion, es documentación que miente. Si el
paso se hace a mano «porque el guion falla», lo que hay que arreglar es el
guion — y comprobar que corre entero.
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, 'dist', 'assets')
CASA = os.path.abspath(os.path.join(AQUI, '..', 'veta-wallet'))
DESTINO = os.path.join(CASA, 'augalaxy', 'assets')
# Los dos archivos de nombre fijo: lo que app.js pide por ruta conocida.
ENTRADA = ('augalaxy.js', 'augalaxy.css')

print('  compilando…')
r = subprocess.run(['npx', 'vite', 'build'], cwd=AQUI, capture_output=True, text=True)
if r.returncode:
    print(r.stdout[-3000:], r.stderr[-3000:])
    sys.exit('  la compilación falló')

if not os.path.isdir(DIST):
    sys.exit(f'  no hay nada compilado en {DIST}')
faltan = [n for n in ENTRADA if not os.path.exists(os.path.join(DIST, n))]
if faltan:
    sys.exit(f'  la compilación no dejó {", ".join(faltan)}: revisá vite.config.ts')

# el destino se vacía: los trozos viejos con otra huella no tienen que quedarse
os.makedirs(DESTINO, exist_ok=True)
for n in os.listdir(DESTINO):
    os.remove(os.path.join(DESTINO, n))
for n in sorted(os.listdir(DIST)):
    shutil.copy2(os.path.join(DIST, n), os.path.join(DESTINO, n))
    print(f'  · {n}  {os.path.getsize(os.path.join(DIST, n))/1000:.0f} kB')

# la huella: el motor y su hoja de estilo juntos
h = hashlib.md5()
for n in ENTRADA:
    with open(os.path.join(DESTINO, n), 'rb') as f:
        h.update(f.read())
version = h.hexdigest()[:10]

app = os.path.join(CASA, 'app.js')
with open(app, encoding='utf8') as f:
    codigo = f.read()
nuevo, cambios = re.subn(r"(const AET_V = ')[0-9a-f]+(')", rf"\g<1>{version}\g<2>", codigo)
if not cambios:
    sys.exit('  no encontré `const AET_V` en app.js: hay que sellarlo a mano')
if nuevo == codigo:
    print(f'  la galaxia no cambió: sigue en v={version}')
else:
    with open(app, 'w', encoding='utf8') as f:
        f.write(nuevo)
    print(f'  sellado v={version} en app.js')
print('  ahora falta subir la wallet:  python3 ../subir.py veta-wallet d264zjawew1yea')
