"""Piezas comunes de los documentos: el sello, la portada y los diagramas.

Todo se dibuja en SVG dentro del propio HTML. No hay imágenes externas ni
fuentes descargadas: el PDF tiene que poder abrirse dentro de diez años sin
depender de que un servidor siga en pie.
"""

VERDE, VERDE2, ORO, ORO_CL, SUAVE, LINEA = "#0A3436", "#135054", "#9A7B2E", "#C9A961", "#5C6B68", "#D9E0DE"
OK, ALERTA, GRAVE = "#1E7A5A", "#A8590F", "#A32B22"

SELLO = f'''<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="22" fill="none" stroke="{VERDE}" stroke-width="1.6"/>
  <circle cx="24" cy="24" r="17" fill="none" stroke="{ORO_CL}" stroke-width="1"/>
  <path d="M24 7 L24 41" stroke="{VERDE}" stroke-width="1.6"/>
  <path d="M12 15 Q24 24 36 15" fill="none" stroke="{ORO_CL}" stroke-width="1.6"/>
  <path d="M12 33 Q24 24 36 33" fill="none" stroke="{ORO_CL}" stroke-width="1.6"/>
  <circle cx="24" cy="24" r="3.4" fill="{ORO_CL}"/>
</svg>'''


def portada(titulo, bajada, etiqueta, fecha, num):
    return f'''<section class="portada">
  <div>
    <div class="sello">{SELLO}<div class="marca"><b>Orden Global</b><span>{etiqueta}</span></div></div>
  </div>
  <div>
    <div class="filete"></div>
    <h1>{titulo}</h1>
    <p class="bajada">{bajada}</p>
  </div>
  <div class="pie">
    <b>Documento {num} · Junta Directiva</b><br>
    {fecha} · Elaborado sobre el estado real de los sistemas en producción<br>
    Todas las cifras de este documento provienen de mediciones, no de estimaciones.
  </div>
</section>'''


def cifras(*pares):
    tarjetas = "".join(
        f'<div class="tarjeta"><div class="n">{n}</div><div class="et">{e}</div></div>'
        for n, e in pares)
    return f'<div class="cifras">{tarjetas}</div>'


def comparar(antes, ahora, tit_antes="Antes", tit_ahora="Ahora"):
    a = "".join(f"<li>{x}</li>" for x in antes)
    b = "".join(f"<li>{x}</li>" for x in ahora)
    return (f'<div class="comparar">'
            f'<div class="col antes"><div class="cab">{tit_antes}</div><ul>{a}</ul></div>'
            f'<div class="col ahora"><div class="cab">{tit_ahora}</div><ul>{b}</ul></div></div>')


def tabla(cabeceras, filas):
    th = "".join(f"<th>{c}</th>" for c in cabeceras)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in f) + "</tr>" for f in filas)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>"


def nota(titulo, texto, clase=""):
    return f'<div class="nota {clase}"><b class="t">{titulo}</b>{texto}</div>'


def barra_progreso(datos, ancho=520):
    """Barras horizontales de avance. `datos` = [(etiqueta, porcentaje, texto)]."""
    alto_fila, hueco = 22, 8
    h = len(datos) * (alto_fila + hueco) + 10
    barras = []
    for i, (etq, pct, txt) in enumerate(datos):
        y = i * (alto_fila + hueco)
        w = max(2, (ancho - 150) * pct / 100)
        barras.append(f'''
    <text x="0" y="{y + 15}" font-size="11" font-family="Helvetica" fill="{VERDE}">{etq}</text>
    <rect x="58" y="{y + 3}" width="{ancho - 150}" height="14" rx="7" fill="{LINEA}"/>
    <rect x="58" y="{y + 3}" width="{w:.1f}" height="14" rx="7" fill="{ORO_CL}"/>
    <text x="{ancho - 86}" y="{y + 15}" font-size="10" font-family="Helvetica" fill="{SUAVE}">{txt}</text>''')
    return f'<svg viewBox="0 0 {ancho} {h}" xmlns="http://www.w3.org/2000/svg">{"".join(barras)}</svg>'


def caja(x, y, w, h, titulo, sub="", color=VERDE, relleno="#FFFFFF", pequeno=False):
    ts = 10 if not pequeno else 9
    lineas = f'<text x="{x + w/2}" y="{y + (h/2 if not sub else h/2 - 5)}" text-anchor="middle" font-size="{ts}" font-family="Helvetica" font-weight="600" fill="{color}">{titulo}</text>'
    if sub:
        lineas += f'<text x="{x + w/2}" y="{y + h/2 + 9}" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{SUAVE}">{sub}</text>'
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{relleno}" stroke="{color}" stroke-width="1.3"/>{lineas}'


def flecha(x1, y1, x2, y2, etiqueta="", color=ORO, punteada=False):
    guion = ' stroke-dasharray="4 3"' if punteada else ""
    txt = ""
    if etiqueta:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        txt = (f'<rect x="{mx - len(etiqueta)*2.6 - 4}" y="{my - 12}" width="{len(etiqueta)*5.2 + 8}" height="13" fill="#fff" opacity="0.92"/>'
               f'<text x="{mx}" y="{my - 2}" text-anchor="middle" font-size="7.5" font-family="Helvetica" fill="{color}">{etiqueta}</text>')
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.2"{guion} '
            f'marker-end="url(#punta)"/>{txt}')


DEFS = f'''<defs><marker id="punta" viewBox="0 0 10 10" refX="9" refY="5"
  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
  <path d="M 0 0 L 10 5 L 0 10 z" fill="{ORO}"/></marker></defs>'''


def documento(titulo_pdf, css_rel, cuerpo):
    return f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>{titulo_pdf}</title>
<link rel="stylesheet" href="{css_rel}">
</head><body>{cuerpo}</body></html>'''
