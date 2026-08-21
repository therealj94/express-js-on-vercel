# Arma una version de Veta Wallet que cabe en un solo archivo.
#
#   python3 unificar.py veta-wallet <carpeta-destino>
#
# Existe por una limitacion que no esta en nuestras manos. El CDN que hay
# delante de www.vetawallet.com pertenece a otra cuenta de AWS y devuelve el
# mismo documento para CUALQUIER ruta: /app.js, /qr.js y hasta las imagenes
# contestan el index. Solo hay un archivo alcanzable.
#
# Como el origen de ese CDN si es nuestro, la salida es que ese unico archivo se
# baste solo: los tres scripts y el icono viajan dentro del HTML, y las paginas
# sueltas van de acompañantes para que /privacidad, /terminos y /genesis-id
# sigan existiendo aunque el CDN entregue siempre lo mismo.
#
# No hay una segunda copia del sitio que mantener: esto se genera de las mismas
# fuentes que el resto, en cada despliegue.

import base64, os, re, sys

ORIGEN, DESTINO = sys.argv[1], sys.argv[2]
leer = lambda n: open(os.path.join(ORIGEN, n), encoding='utf-8').read()

html = leer('index.html')

# --- las imagenes, dentro del HTML ---------------------------------------
MAX_PNG = 260   # el monograma de la tarjeta se pinta a ~227 px de ancho
# La tipografia de display viaja por el mismo carril que las imagenes: en
# www.vetawallet.com solo se entrega un documento, asi que un @font-face que
# apunte a un archivo suelto no llegaria nunca y la marca caeria a la letra
# del sistema.
TIPOS = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
         '.woff2': 'font/woff2'}


def como_datos(rel):
    """Una imagen de la carpeta, convertida a `data:` para viajar en el HTML."""
    ruta = os.path.join(ORIGEN, rel)
    crudo = open(ruta, 'rb').read()
    ext = os.path.splitext(rel)[1].lower()
    if ext == '.png':
        try:
            # Cada kB aqui se paga por triplicado: en base64 son cuatro tercios,
            # y viajan dentro del HTML en cada carga. Se reduce al tamaño mayor
            # al que se pinta la imagen (el monograma de la tarjeta manda) y se
            # baja a paleta, que en un dibujo de lineas no se nota y pesa la
            # tercera parte.
            from PIL import Image
            import io
            im = Image.open(io.BytesIO(crudo)).convert('RGBA')
            im.thumbnail((MAX_PNG, MAX_PNG), Image.LANCZOS)
            mejor = crudo
            for intento in (im, im.quantize(colors=128, method=Image.FASTOCTREE)):
                buf = io.BytesIO()
                intento.save(buf, 'PNG', optimize=True)
                if buf.tell() < len(mejor):
                    mejor = buf.getvalue()
            crudo = mejor
        except ImportError:
            pass
    return f'data:{TIPOS.get(ext, "application/octet-stream")};base64,' + base64.b64encode(crudo).decode()


# Se recorre la carpeta entera en vez de nombrar los archivos uno por uno: el
# dia que se agregue un token nuevo con su logo, esto ya lo mete solo. Se hace
# de la ruta mas larga a la mas corta para que un nombre no se coma a otro que
# lo contenga.
IMAGENES = []
for base, _, nombres in os.walk(os.path.join(ORIGEN, 'assets')):
    for n in nombres:
        if os.path.splitext(n)[1].lower() in TIPOS:
            IMAGENES.append(os.path.relpath(os.path.join(base, n), ORIGEN).replace(os.sep, '/'))
IMAGENES.sort(key=len, reverse=True)

# --- el arranque, antes que nada -----------------------------------------
# Tiene que correr sincronico y en la cabecera: decide si esta pagina es la
# aplicacion o un texto legal, y de eso depende que los scripts se ejecuten.
arranque = """<script>
window.__legal = (function () {
  var p = location.pathname.replace(/\\/+$/, '').toLowerCase();
  if (p === '/privacidad' || p === '/privacidad.html') return 'privacidad';
  if (p === '/terminos' || p === '/terminos.html') return 'terminos';
  if (p === '/genesis-id' || p === '/genesis-id.html') return 'genesis-id';
  return null;
})();
</script>
"""
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + arranque, 1)

# --- los tres scripts, dentro del HTML -----------------------------------
# Van envueltos en una guarda para que en una pagina legal no arranquen: app.js
# se engancha a DOMContentLoaded y buscaria elementos que ahi no existen.
# VETA vuelve a window a mano porque los manejadores en linea del HTML lo
# llaman por su nombre, y dentro del bloque seria inalcanzable.
# LA LISTA SALE DEL HTML, NO DE AQUI.
#
# Estaba escrita a mano y en un orden fijo. El dia que se metio un `<script>`
# nuevo en index.html —los modulos de llamadas, el 16 de agosto— la lista dejo
# de casar con la pagina, el `assert` de abajo salto, y `www.vetawallet.com` se
# quedo congelado sin que nadie se enterara: el sitio bueno seguia
# desplegandose y el unificado fallaba en un paso aparte.
#
# Ahora se leen las etiquetas de la propia pagina, en su orden. Agregar un
# script nuevo no vuelve a romper esto, y —lo que de verdad importa— tampoco
# puede dejarlo fuera en silencio: un `chat.js` sin su `candado.js` cifraria
# nada y el sello seguiria diciendo que si.
SCRIPTS = re.findall(r'<script src="([^"]+)"></script>', html)
faltan = [n for n in SCRIPTS if not os.path.exists(os.path.join(ORIGEN, n))]
assert not faltan, 'la pagina pide scripts que no estan: %s' % faltan
assert SCRIPTS, 'no se encontro ni una etiqueta de script en la pagina'
codigo = '\n'.join(leer(n) for n in SCRIPTS)
assert '</script' not in codigo, 'un script cierra la etiqueta y romperia el HTML'
bloque = ('<script>\nif (!window.__legal) {\n' + codigo +
          '\nwindow.VETA = VETA;\n}\n</script>')

# Las etiquetas no van todas seguidas en la pagina: hay dos grupos, con el HTML
# del sitio en medio. Se sustituye la PRIMERA por el bloque entero y las demas
# se quitan, en vez de exigir que esten pegadas —exigirlo fue justo lo que
# rompio esto—.
primera = True
def cambiar(m):
    global primera
    if primera:
        primera = False
        return bloque
    return ''
html, n = re.subn(r'<script src="[^"]+"></script>\s*', cambiar, html)
assert n == len(SCRIPTS), 'se sustituyeron %d etiquetas de %d' % (n, len(SCRIPTS))

# Las rutas a imagenes se sustituyen DESPUES de incrustar el codigo: algunas
# viven dentro de cadena.js (los logos de los tokens), no en el HTML.
for rel in IMAGENES:
    if rel in html:
        html = html.replace(rel, como_datos(rel))
assert '<script src=' not in html, 'quedo un script suelto sin incrustar'
assert 'assets/' not in html, 'quedo una imagen sin incrustar'


def pagina(nombre):
    """El cuerpo y el estilo de una pagina legal, listos para un <template>."""
    s = leer(nombre)
    titulo = re.search(r'<title>(.*?)</title>', s, re.S).group(1)
    estilo = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
    cuerpo = re.search(r'<body>(.*?)</body>', s, re.S).group(1)
    idioma = re.search(r'<html lang="([^"]+)"', s).group(1)
    clave = nombre.replace('.html', '')
    return (f'<template id="pag-{clave}" data-titulo="{titulo}" data-lang="{idioma}">'
            f'<style>{estilo}</style>{cuerpo}</template>')


# genesis-id.html no es una pagina legal, pero viaja por el mismo carril y por
# el mismo motivo: es una pagina suelta, y en www.vetawallet.com no hay forma de
# alcanzarla si no va dentro del unico documento que ese CDN entrega. Sin esto,
# /genesis-id responde 200 con la portada — un enlace roto que no lo parece.
legales = pagina('privacidad.html') + pagina('terminos.html') + pagina('genesis-id.html')

# El intercambio va al final del cuerpo, cuando las plantillas ya existen.
# Los estilos de la aplicacion se retiran: los de la pagina legal son de otro
# mundo y no tienen por que convivir.
cierre = legales + """
<script>
if (window.__legal) {
  var t = document.getElementById('pag-' + window.__legal);
  document.head.querySelectorAll('style').forEach(function (s) { s.remove(); });
  document.title = t.getAttribute('data-titulo');
  document.documentElement.lang = t.getAttribute('data-lang');
  document.body.replaceChildren(t.content.cloneNode(true));
}
</script>
"""
html = html.replace('</body>', cierre + '</body>', 1) if '</body>' in html else html + cierre

os.makedirs(DESTINO, exist_ok=True)
salida = os.path.join(DESTINO, 'index.html')
open(salida, 'w', encoding='utf-8').write(html)
print(f'  {salida} · {len(html.encode()) / 1024:.0f} kB · un solo archivo')
