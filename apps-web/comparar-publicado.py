#!/usr/bin/env python3
"""¿Lo que está publicado es lo que dice el repositorio?

    python3 apps-web/comparar-publicado.py <carpeta> <url-base> [--todo]

══ POR QUE EXISTE ═══════════════════════════════════════════════════════════

Dos veces en dos dias lo mismo, y las dos veces se descubrio de casualidad:

  · Ordenscan servia «Chain 8532» —el numero de la cadena ANTERIOR— porque
    produccion corria una version vieja. El repositorio decia 5550 desde hacia
    meses.
  · Los arreglos del boton de AIR TOUCH y del toque de las esferas estaban
    commiteados, probados y en verde... y sin desplegar. La gente seguia con
    los dos bugs.

El sello de version que ya llevan la billetera y Ordenex contesta «¿llego mi
subida?», que es otra pregunta. No contesta «¿hay algo mas nuevo sin subir?»,
porque el sello viaja DENTRO del archivo que se sube: si nadie sube, el sello
de produccion y el del repositorio coinciden tan tranquilos aunque el
repositorio lleve cambios encima.

Esto compara los ARCHIVOS, uno por uno, que es lo unico que no se puede
falsear.

══ COMO LEER LA SALIDA ══════════════════════════════════════════════════════

    igual     el archivo publicado es identico al del repositorio
    DISTINTO  hay cambios sin publicar (o publicados desde otro sitio)
    FALTA     el archivo esta en el repositorio y no se sirve

Devuelve 0 si todo coincide y 1 si hay diferencias, para poder encadenarlo.
"""
import hashlib
import os
import sys
import urllib.error
import urllib.request

# Lo que no es el sitio no se compara: son los mismos que `subir.py` deja
# fuera, y compararlos daria un «FALTA» por cada uno que no significa nada.
FUERA = ('pruebas', 'node_modules', '.git')
# Documentacion y configuracion del despliegue: viven en el repositorio pero no
# son el sitio, y avisarlas en cada pasada enseña a ignorar los avisos.
NO_ES_EL_SITIO = ('README.md', '_redirects', '_headers', 'vercel.json', 'netlify.toml')
# Los binarios grandes se saltan salvo que se pida --todo: bajar 40 MB de
# imagenes para comprobar que no cambiaron cuesta mas de lo que informa.
PESADOS = ('.png', '.jpg', '.jpeg', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.ico', '.gz')


def huella(b):
    return hashlib.md5(b).hexdigest()[:10]


def bajar(url):
    q = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(q, timeout=45) as r:
        return r.read()


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    raiz, base = sys.argv[1].rstrip('/'), sys.argv[2].rstrip('/')
    todo = '--todo' in sys.argv

    archivos = []
    for dirpath, dirnames, nombres in os.walk(raiz):
        dirnames[:] = [d for d in dirnames if d not in FUERA]
        for n in nombres:
            rel = os.path.relpath(os.path.join(dirpath, n), raiz)
            if any(p in FUERA for p in rel.split(os.sep)):
                continue
            if n in NO_ES_EL_SITIO:
                continue
            if not todo and os.path.splitext(n)[1].lower() in PESADOS:
                continue
            archivos.append(rel)

    iguales, distintos, faltan = [], [], []
    for rel in sorted(archivos):
        local = open(os.path.join(raiz, rel), 'rb').read()
        url = base + '/' + rel.replace(os.sep, '/')
        try:
            remoto = bajar(url)
        except urllib.error.HTTPError as e:
            faltan.append((rel, f'HTTP {e.code}'))
            continue
        except Exception as e:
            faltan.append((rel, type(e).__name__))
            continue
        # Un hosting con reescritura comodin devuelve el index.html con estado
        # 200 para lo que no existe. Eso NO es el archivo: se cuenta como falta.
        if rel != 'index.html' and remoto.lstrip()[:15].lower().startswith(b'<!doctype html'):
            if not rel.endswith('.html'):
                faltan.append((rel, 'devuelve el index (no existe)'))
                continue
        (iguales if huella(local) == huella(remoto) else distintos).append(rel)

    print(f'\n{raiz}  ->  {base}')
    print(f'  iguales  : {len(iguales)}')
    if distintos:
        print(f'  DISTINTOS: {len(distintos)}')
        for r in distintos:
            print(f'     {r}')
    if faltan:
        print(f'  FALTAN   : {len(faltan)}')
        for r, por in faltan:
            print(f'     {r}  ({por})')
    if not distintos and not faltan:
        print('  publicado y repositorio dicen lo mismo')
    return 1 if (distintos or faltan) else 0


if __name__ == '__main__':
    sys.exit(main())
