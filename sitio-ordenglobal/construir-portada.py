#!/usr/bin/env python3
# Arma index.html desde la plantilla y los datos de abajo.
#
#   python3 construir-portada.py
#
# Las casas y las pruebas viven aquí como datos y no en el HTML: así la
# versión en inglés sale de la misma lista y no se desincroniza, y una casa
# nueva es una fila más y no un bloque de HTML copiado a mano.
#
# Este archivo NO se publica: reconstruir.sh copia archivos concretos.

import html, math, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
VERSION = "20260927"


def e(t):
    return html.escape(t, quote=True)


# ── LAS SIETE CASAS ─────────────────────────────────────────────────────────
# Cada casa: nombre, qué es, puntos, enlace, video y estado. El estado sale de
# la revisión en vivo del 27 de septiembre de 2026: None = disponible (no
# lleva sello), "beta" = abierta en prueba, "pronto" = todavía no se usa.
# Regla de SFSP (sección 6): nada que dependa de una licencia no otorgada se
# presenta como disponible. Por eso Ordenex no promete lempiras ni dólares.
CASAS = {"es": [
    ("Veta Wallet", "Tu cuenta en ORIGEN, en el teléfono.", [
        "Guardás en ORIGEN, que sigue al oro y no a la moneda de tu país.",
        "Mandás ORIGEN a cualquier contacto en tres toques, y llega en segundos.",
        "Cobrás con un código que ya lleva el monto puesto.",
        "Cada movimiento te deja su comprobante en la cadena.",
    ], ("Abrir Veta Wallet", "https://app.vetawallet.com"), None, None),
    ("Genesis ID", "Te verificás una vez y te sirve en todo el sistema.", [
        "Documento, prueba de vida y cotejo contra las listas internacionales de sanciones.",
        "Cada verificación la aprueba una persona, no una máquina.",
        "Tus documentos quedan cifrados y fuera de la cadena: ahí solo va la prueba.",
    ], ("Conocer Genesis ID", "https://app.vetawallet.com/genesis-id"), None, "beta"),
    ("PULSE2CHAT", "Hablás y pagás en la misma conversación.", [
        "Solo entra gente verificada con Genesis ID.",
        "Le pedís a alguien lo que te debe y te lo manda ahí mismo.",
        "El comprobante queda en el chat, comprobado contra la cadena.",
        "Llamadas de voz y video, dentro de Veta Wallet.",
    ], ("Abrir el chat", "https://app.vetawallet.com"), None, "beta"),
    ("Ordenex", "El mercado del sistema.", [
        "Cinco mercados de la cadena, cada uno contra ORIGEN.",
        "Libro de órdenes de verdad, y velas que solo pintan tratos reales.",
        "Entrás con tu cuenta de Veta Wallet: Ordenex no guarda contraseñas.",
    ], ("Abrir Ordenex", "https://ordenexchange.link"),
        ("ordenex-spot", "Ver el spot", "0:32", "El spot de Ordenex, con sonido."), "beta"),
    ("AuCorp", "Tus cuentas, conectadas al sistema.", [
        "Cuentas con libro contable de partida doble detrás.",
        "Comprobante de cada movimiento y extracto que cuadra, para tu contador.",
        "Entrás con el mismo Genesis ID: no hay otra contraseña que recordar.",
    ], ("Conocer Au Corp", "https://www.aucorp.io"), None, "beta"),
    ("MyTokenPay", "Para cobrar en tu negocio con un código, sin terminal.", [
        "Generás un código con el monto y tu cliente lo escanea.",
        "Sin terminal que alquilar.",
        "Cada cobro queda con su comprobante en la cadena, y llevás la cuenta sin cuaderno.",
    ], None, None, "pronto"),
    ("OrdenScan", "El explorador público de la cadena, sin cuenta y sin permiso.", [
        "Pegás el número de tu movimiento y ves cuándo entró, en qué bloque y a dónde fue.",
        "Sirve para probarle a alguien que le pagaste, sin depender de nuestra palabra.",
        "Están a la vista los contratos de cada moneda y quién firma cada bloque.",
    ], ("Abrir el explorador", "https://ordenscan.com"), None, None),
], "en": [
    ("Veta Wallet", "Your ORIGEN account, on your phone.", [
        "You save in ORIGEN, which follows gold and not your country's currency.",
        "You send ORIGEN to any contact in three taps, and it arrives in seconds.",
        "You get paid with a code that already carries the amount.",
        "Every movement leaves you its receipt on the chain.",
    ], ("Open Veta Wallet", "https://app.vetawallet.com"), None, None),
    ("Genesis ID", "Get verified once and it works across the whole system.", [
        "Document check, liveness test and screening against international sanctions lists.",
        "Every verification is approved by a person, not a machine.",
        "Your documents stay encrypted and off the chain: only the proof goes there.",
    ], ("About Genesis ID", "https://app.vetawallet.com/genesis-id"), None, "beta"),
    ("PULSE2CHAT", "Talk and pay in the same conversation.", [
        "Only people verified with Genesis ID get in.",
        "You ask someone for what they owe you and they send it right there.",
        "The receipt stays in the chat, checked against the chain.",
        "Voice and video calls, inside Veta Wallet.",
    ], ("Open the chat", "https://app.vetawallet.com"), None, "beta"),
    ("Ordenex", "The system's market.", [
        "Five markets on the chain, each one against ORIGEN.",
        "A real order book, and candles drawn only from real trades.",
        "Sign in with your Veta Wallet account: Ordenex stores no passwords.",
    ], ("Open Ordenex", "https://ordenexchange.link"),
        ("ordenex-spot", "Watch the spot", "0:32", "The Ordenex spot, in Spanish, with sound."), "beta"),
    ("AuCorp", "Your accounts, connected to the system.", [
        "Accounts with double-entry bookkeeping behind them.",
        "A receipt for every movement and a statement that adds up, for your accountant.",
        "You sign in with the same Genesis ID: no other password to remember.",
    ], ("About Au Corp", "https://www.aucorp.io"), None, "beta"),
    ("MyTokenPay", "Take payments at your business with a code, no terminal.", [
        "You create a code with the amount and your customer scans it.",
        "No terminal to rent.",
        "Every payment keeps its receipt on the chain, so the books keep themselves.",
    ], None, None, "pronto"),
    ("OrdenScan", "The chain's public explorer, no account and no permission needed.", [
        "Paste your movement's number and see when it went in, in which block and where it went.",
        "Use it to prove to someone that you paid them, without relying on our word.",
        "Every currency's contract is in plain view, and so is who signs each block.",
    ], ("Open the explorer", "https://ordenscan.com"), None, None),
]}

ETIQUETA = {"es": {"beta": "En beta", "pronto": "Próximamente"},
            "en": {"beta": "In beta", "pronto": "Coming soon"}}


# Un video de la campaña. Sin JavaScript es un <video> con sus controles; con
# JavaScript, el póster lleva un botón propio y los controles aparecen al darle.
def pieza(base, boton, dura, pie):
    # (el idioma no cambia nada aquí: todo el texto llega como argumento)
    return (f'<figure class="pieza"><div class="marco-v">'
            f'<video controls preload="none" playsinline poster="/assets/medios/{base}.jpg" width="720" height="1280">'
            f'<source src="/assets/medios/{base}.mp4" type="video/mp4"></video>'
            f'<button class="reproducir" type="button" hidden>{e(boton)} <span class="dato">{e(dura)}</span></button>'
            f'</div><figcaption>{e(pie)}</figcaption></figure>')


def casa(nombre, que, puntos, enlace, video, estado, lang="es"):
    lis = "".join(f"<li>{e(p)}</li>" for p in puntos)
    vid = pieza(*video) if video else ""
    etq = (f'<span class="etq {estado}">{ETIQUETA[lang][estado]}</span>' if estado else "")
    enl = f'<a class="enlace" href="{e(enlace[1])}">{e(enlace[0])}</a>' if enlace else ""
    return (f'      <article class="casa"><h3>{e(nombre)}</h3>{etq}'
            f'<p class="que">{e(que)}</p><ul>{lis}</ul>{vid}'
            f'<div class="pie-casa">{enl}</div></article>')


# ── LA PRUEBA ───────────────────────────────────────────────────────────────
# Cada fila: qué se comprueba, dónde, y el código que hay que pegar. El de la
# cadena es el último bloque, que se rellena en vivo.
PRUEBAS = {"es": [
    ("La cadena 5550", "Figura en el directorio público de redes, con ORIGEN como su moneda.",
     ("chainlist.org", "https://chainlist.org/chain/5550"), "5550", None),
    ("Orden Global Corp", "Su código LEI, activo.",
     ("gleif.org", "https://search.gleif.org/#/record/9845000J73CT98D9ES75"), "9845000J73CT98D9ES75", None),
    ("Au Corp", "Su código LEI, activo.",
     ("gleif.org", "https://search.gleif.org/#/record/9845006T54D05BC57090"), "9845006T54D05BC57090", None),
    ("Cada movimiento", "El último bloque de la cadena, en el explorador público.",
     ("ordenscan.com", "https://ordenscan.com"), None, "bloque"),
    ("El precio de ORIGEN", "Con el precio del oro de la fuente que prefieras.",
     ("gold-api.com", "https://gold-api.com"), "gramo de oro ÷ 55", None),
], "en": [
    ("The 5550 chain", "Listed in the public directory of networks, with ORIGEN as its currency.",
     ("chainlist.org", "https://chainlist.org/chain/5550"), "5550", None),
    ("Orden Global Corp", "Its LEI code, active.",
     ("gleif.org", "https://search.gleif.org/#/record/9845000J73CT98D9ES75"), "9845000J73CT98D9ES75", None),
    ("Au Corp", "Its LEI code, active.",
     ("gleif.org", "https://search.gleif.org/#/record/9845006T54D05BC57090"), "9845006T54D05BC57090", None),
    ("Every movement", "The chain's latest block, in the public explorer.",
     ("ordenscan.com", "https://ordenscan.com"), None, "bloque"),
    ("The price of ORIGEN", "With the gold price from whichever source you prefer.",
     ("gold-api.com", "https://gold-api.com"), "gram of gold ÷ 55", None),
]}

# Lo poco que cambia de idioma dentro de los bloques armados aquí.
TXT = {
    "es": {"copiar": "Copiar", "disco": "Un gramo de oro partido en 55 porciones. Cada porción es un ORIGEN.",
           "trailer": ("Ver el tráiler", "«La misma regla», el tráiler de ORIGEN, con sonido.")},
    "en": {"copiar": "Copy", "disco": "A gram of gold split into 55 portions. Each portion is one ORIGEN.",
           "trailer": ("Watch the trailer", "“The same rule”, the ORIGEN trailer, in Spanish, with sound.")},
}


def prueba(que, detalle, donde, codigo, vivo, lang="es"):
    cp = TXT[lang]["copiar"]
    if vivo:
        cod = (f'<div class="codigo"><span class="dato" data-bloque>—</span>'
               f'<button class="copiar" type="button" data-copiar-vivo="bloque">{cp}</button></div>')
    else:
        cod = (f'<div class="codigo"><span class="dato">{e(codigo)}</span>'
               f'<button class="copiar" type="button" data-copiar="{e(codigo)}">{cp}</button></div>')
    return (f'    <div class="prueba-fila"><p class="que"><b>{e(que)}</b><span>{e(detalle)}</span></p>'
            f'<p><a class="enlace" href="{e(donde[1])}">{e(donde[0])}</a></p>{cod}</div>')


# ── EL GRAMO PARTIDO EN 55 ──────────────────────────────────────────────────
# El diagrama es la fórmula: 55 porciones, y una que sale.
def disco(lang="es"):
    C, R, r = 200, 182, 44
    ang = lambda i: -math.pi / 2 + i * 2 * math.pi / 55 - math.pi / 55
    radios = "".join(
        f"M{C + r * math.cos(ang(i)):.2f},{C + r * math.sin(ang(i)):.2f}"
        f"L{C + R * math.cos(ang(i)):.2f},{C + R * math.sin(ang(i)):.2f}" for i in range(55))
    a0, a1, am = ang(0), ang(1), -math.pi / 2
    dx, dy = 18 * math.cos(am), 18 * math.sin(am)
    p = lambda rr, a: f"{C + dx + rr * math.cos(a):.2f},{C + dy + rr * math.sin(a):.2f}"
    cuna = f"M{p(r, a0)}L{p(R, a0)}A{R},{R} 0 0 1 {p(R, a1)}L{p(r, a1)}A{r},{r} 0 0 0 {p(r, a0)}Z"
    # La porción que sale lleva su nombre al lado, con una línea que la señala.
    tx, ty = C + 58, C + dy - R + 10
    rotulo = (f'<path d="M{C + 9:.1f},{C + dy - R + 16:.1f}L{tx - 6:.1f},{ty - 4:.1f}" stroke="#F5E4AB" stroke-width=".8" fill="none"/>'
              f'<text x="{tx}" y="{ty}">1 ORIGEN</text>')
    return (f'<svg class="disco" viewBox="-6 -24 412 430" role="img" aria-labelledby="disco-t">'
            f'<title id="disco-t">{TXT[lang]["disco"]}</title>'
            f'<g class="radios" fill="none" stroke="currentColor" stroke-width=".8" opacity=".62">'
            f'<circle cx="{C}" cy="{C}" r="{R}" pathLength="1"/><circle cx="{C}" cy="{C}" r="{r}" pathLength="1"/>'
            f'<path d="{radios}" pathLength="1"/></g><path class="cuna" d="{cuna}" fill="#F5E4AB"/>'
            f'<g class="rotulo">{rotulo}</g></svg>')


# Cada idioma: su plantilla, su JSON-LD y a dónde se escribe.
SALIDAS = [
    ("es", "portada.plantilla.html", "portada.ld.json.html", "index.html"),
    ("en", "portada.plantilla.en.html", "portada.ld.json.en.html", "en/index.html"),
]


def construir(lang, plantilla, ld, salida):
    leer = lambda n: open(os.path.join(AQUI, n), encoding="utf-8").read()
    boton, pie = TXT[lang]["trailer"]
    out = (leer(plantilla)
           .replace("{{LD}}", leer(ld).strip())
           .replace("{{DISCO}}", disco(lang))
           .replace("{{TRAILER}}", pieza("origen-trailer", boton, "1:28", pie))
           .replace("{{CASAS}}", "\n".join(casa(*c, lang=lang) for c in CASAS[lang]))
           .replace("{{PRUEBAS}}", "\n".join(prueba(*p, lang=lang) for p in PRUEBAS[lang]))
           .replace("{{V}}", VERSION))
    sobra = re.findall(r"\{\{\w+\}\}", out)
    if sobra:
        sys.exit(f"{salida}: quedaron marcadores sin rellenar: {sobra}")
    open(os.path.join(AQUI, salida), "w", encoding="utf-8").write(out)
    print(f"{salida} · {len(out) / 1024:.1f} KB")


def main():
    for s in SALIDAS:
        construir(*s)


if __name__ == "__main__":
    main()
