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
VERSION = "20260926"


def e(t):
    return html.escape(t, quote=True)


# ── LAS SIETE CASAS ─────────────────────────────────────────────────────────
# Lo de Ordenex sale del código en vivo de ordenexchange.link (cadena.js e
# i18n.js), no de la ficha vieja: hoy son cinco mercados y no dos.
CASAS = {"es": [
    ("Veta Wallet", "Tu cuenta: guardás, mandás y cobrás desde el teléfono.", [
        "Ahorrás en ORIGEN, que sigue al oro y no a la moneda de tu país.",
        "Mandás a un contacto o a otro país en tres toques, y llega en segundos.",
        "Cobrás con un código que ya lleva el monto puesto.",
        "Cada movimiento te deja un comprobante con su número en la cadena.",
    ], ("Abrir Veta Wallet", "https://app.vetawallet.com"), None),
    ("PULSE2CHAT", "Un chat cifrado donde también se paga.", [
        "Le pedís a alguien lo que te debe y te lo manda ahí mismo.",
        "El comprobante queda en la conversación, comprobado contra la cadena.",
        "La llave vive en tu teléfono: nadie más lee lo que escribís, tampoco nosotros.",
        "Solo con gente verificada.",
    ], ("Abrir el chat", "https://app.vetawallet.com"), None),
    ("Genesis ID", "Tu identidad, verificada una sola vez para todo.", [
        "Lectura del documento, prueba de vida y cotejo contra las listas internacionales de sanciones.",
        "Lo hacés una vez y no repetís papeleo en ninguna casa.",
        "Te queda una credencial que cualquiera puede comprobar sin ver tus datos.",
    ], ("Verificarte", "https://app.vetawallet.com"), None),
    ("MyTokenPay", "Para cobrar en tu negocio con un código, sin terminal.", [
        "Generás un código con el monto y tu cliente lo escanea.",
        "Te llega al instante: no hay terminal que alquilar ni dos días de espera.",
        "Cada cobro queda con su comprobante, y llevás la cuenta sin cuaderno.",
    ], ("Ver cómo funciona", "https://app.vetawallet.com"), None),
    ("OrdenScan", "El explorador público de la cadena, sin cuenta y sin permiso.", [
        "Pegás el número de tu movimiento y ves cuándo entró, en qué bloque y a dónde fue.",
        "Sirve para probarle a alguien que le pagaste, sin depender de nuestra palabra.",
        "Están a la vista los contratos de cada moneda y quién firma cada bloque.",
    ], ("Abrir el explorador", "https://ordenscan.com"), None),
    ("Ordenex", "La casa de cambio: cinco mercados de la cadena, cada uno contra ORIGEN.", [
        "Libro de órdenes de verdad, y velas que solo pintan tratos reales.",
        "Cambiás ORIGEN por AUKA, AGKA, ONDK, IBS Energy o Harvi.",
        "Entrás y salís en lempiras o en dólares, con agentes verificados.",
        "Entrás con tu cuenta de Veta Wallet: Ordenex no guarda contraseñas.",
    ], ("Abrir Ordenex", "https://ordenexchange.link"),
        ("ordenex-spot", "Ver el spot", "0:32", "El spot de Ordenex, con sonido.")),
    ("AuCorp", "Cuentas en moneda local, con extracto para tu contador.", [
        "Cuentas en moneda local, con libro contable de partida doble detrás.",
        "Comprobante de cada movimiento y extracto mensual que cuadra, para tu contador o tu banco.",
        "Entrás con el mismo Genesis ID: no hay otra contraseña que recordar.",
    ], ("Abrir desde tu cuenta", "https://app.vetawallet.com"), None),
], "en": [
    ("Veta Wallet", "Your account: save, send and get paid from your phone.", [
        "You save in ORIGEN, which follows gold and not your country's currency.",
        "You send to a contact or to another country in three taps, and it arrives in seconds.",
        "You get paid with a code that already carries the amount.",
        "Every movement leaves you a receipt with its number on the chain.",
    ], ("Open Veta Wallet", "https://app.vetawallet.com"), None),
    ("PULSE2CHAT", "An encrypted chat where you can also pay.", [
        "You ask someone for what they owe you and they send it right there.",
        "The receipt stays in the conversation, checked against the chain.",
        "The key lives on your phone: nobody else reads what you write, us included.",
        "Only with verified people.",
    ], ("Open the chat", "https://app.vetawallet.com"), None),
    ("Genesis ID", "Your identity, verified once for everything.", [
        "Document check, liveness test and screening against international sanctions lists.",
        "You do it once and never repeat the paperwork in any other product.",
        "You get a credential anyone can verify without seeing your data.",
    ], ("Get verified", "https://app.vetawallet.com"), None),
    ("MyTokenPay", "Take payments at your business with a code, no terminal.", [
        "You create a code with the amount and your customer scans it.",
        "It arrives instantly: no terminal to rent and no two-day wait.",
        "Every payment comes with its receipt, so the books keep themselves.",
    ], ("See how it works", "https://app.vetawallet.com"), None),
    ("OrdenScan", "The chain's public explorer, no account and no permission needed.", [
        "Paste your movement's number and see when it went in, in which block and where it went.",
        "Use it to prove to someone that you paid them, without relying on our word.",
        "Every currency's contract is in plain view, and so is who signs each block.",
    ], ("Open the explorer", "https://ordenscan.com"), None),
    ("Ordenex", "The exchange: five markets on the chain, each one against ORIGEN.", [
        "A real order book, and candles drawn only from real trades.",
        "Swap ORIGEN for AUKA, AGKA, ONDK, IBS Energy or Harvi.",
        "Cash in and out in lempiras or dollars, through verified agents.",
        "Sign in with your Veta Wallet account: Ordenex stores no passwords.",
    ], ("Open Ordenex", "https://ordenexchange.link"),
        ("ordenex-spot", "Watch the spot", "0:32", "The Ordenex spot, in Spanish, with sound.")),
    ("AuCorp", "Local-currency accounts, with statements for your accountant.", [
        "Accounts in local currency, with double-entry bookkeeping behind them.",
        "A receipt for every movement and a monthly statement that adds up, for your accountant or your bank.",
        "You sign in with the same Genesis ID: no other password to remember.",
    ], ("Open from your account", "https://app.vetawallet.com"), None),
]}


# Un video de la campaña. Sin JavaScript es un <video> con sus controles; con
# JavaScript, el póster lleva un botón propio y los controles aparecen al darle.
def pieza(base, boton, dura, pie):
    # (el idioma no cambia nada aquí: todo el texto llega como argumento)
    return (f'<figure class="pieza"><div class="marco">'
            f'<video controls preload="none" playsinline poster="/assets/medios/{base}.jpg" width="720" height="1280">'
            f'<source src="/assets/medios/{base}.mp4" type="video/mp4"></video>'
            f'<button class="reproducir" type="button" hidden>{e(boton)} <span class="dato">{e(dura)}</span></button>'
            f'</div><figcaption>{e(pie)}</figcaption></figure>')


def casa(nombre, que, puntos, enlace, video, lang="es"):
    lis = "".join(f"<li>{e(p)}</li>" for p in puntos)
    vid = pieza(*video) if video else ""
    return (f'    <details class="casa"><summary><h3>{e(nombre)}</h3>'
            f'<span class="que">{e(que)}</span><span class="mas" aria-hidden="true"></span></summary>'
            f'<div class="dentro"><div><ul>{lis}</ul>{vid}'
            f'<a class="enlace" href="{e(enlace[1])}">{e(enlace[0])}</a></div></div></details>')


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
            f'<g fill="none" stroke="currentColor" stroke-width=".8" opacity=".62">'
            f'<circle cx="{C}" cy="{C}" r="{R}"/><circle cx="{C}" cy="{C}" r="{r}"/>'
            f'<path d="{radios}"/></g><path d="{cuna}" fill="#F5E4AB"/>{rotulo}</svg>')


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
