#!/usr/bin/env python3
"""Compila Aetherion, lo deja en la wallet y le SELLA la versión.

    python3 publicar.py

Por qué existe: la entrada del motor tiene nombre fijo (`aetherion.js`), y un
nombre fijo es una invitación a que un navegador se quede con la copia vieja.
Aquí se calcula la huella de lo compilado y se escribe en app.js, que pide el
motor con `?v=<huella>`: si el motor cambió, la dirección cambia, y no hay
copia vieja que valga. Los trozos ya llevan su huella en el nombre.
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, 'dist', 'assets')
CASA = os.path.abspath(os.path.join(AQUI, '..', 'veta-wallet'))
DESTINO = os.path.join(CASA, 'aetherion', 'assets')

print('  compilando…')
r = subprocess.run(['npx', 'vite', 'build'], cwd=AQUI, capture_output=True, text=True)
if r.returncode:
    print(r.stdout[-3000:], r.stderr[-3000:])
    sys.exit('  la compilación falló')

# el destino se vacía: los trozos viejos con otra huella no tienen que quedarse
os.makedirs(DESTINO, exist_ok=True)
for n in os.listdir(DESTINO):
    os.remove(os.path.join(DESTINO, n))
for n in sorted(os.listdir(DIST)):
    shutil.copy2(os.path.join(DIST, n), os.path.join(DESTINO, n))
    print(f'  · {n}  {os.path.getsize(os.path.join(DIST, n))/1000:.0f} kB')

# la huella: el motor y su hoja de estilo juntos
h = hashlib.md5()
for n in ('aetherion.js', 'aetherion.css'):
    with open(os.path.join(DESTINO, n), 'rb') as f:
        h.update(f.read())
version = h.hexdigest()[:10]

app = os.path.join(CASA, 'app.js')
with open(app, encoding='utf8') as f:
    codigo = f.read()
nuevo, cambios = re.subn(r"(const AET_V = ')[0-9a-f]+(')", rf"\g<1>{version}\g<2>", codigo)
if not cambios:
    sys.exit('  no encontré `const AET_V` en app.js: hay que sellarlo a mano')
with open(app, 'w', encoding='utf8') as f:
    f.write(nuevo)
print(f'  sellado v={version} en app.js')
