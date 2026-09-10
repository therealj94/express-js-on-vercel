#!/usr/bin/env python3
"""Genera el dossier técnico de Veta Wallet en PDF."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, NextPageTemplate,
)

# ── paleta ────────────────────────────────────────────────────────────────────
VERDE  = colors.HexColor("#021B1C")
VERDE2 = colors.HexColor("#0A463F")
ORO    = colors.HexColor("#C9A961")
ORO_CL = colors.HexColor("#F0E2B8")
TXT    = colors.HexColor("#1A1A1A")
TXT2   = colors.HexColor("#4A4A4A")
TXT3   = colors.HexColor("#7A7A7A")
LINEA  = colors.HexColor("#DDD6C4")
FONDO  = colors.HexColor("#FBF9F4")

W, H = A4
MARGEN = 20 * mm

# ── estilos ───────────────────────────────────────────────────────────────────
def P(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=14.5, textColor=TXT,
                alignment=TA_LEFT, spaceAfter=7)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
    "portada_t":  P("pt", fontName="Helvetica-Bold", fontSize=40, leading=44,
                    textColor=ORO_CL, alignment=TA_CENTER, spaceAfter=0),
    "portada_s":  P("ps", fontSize=13, leading=19, textColor=colors.HexColor("#B9CFC9"),
                    alignment=TA_CENTER, spaceAfter=0),
    "portada_m":  P("pm", fontSize=9, leading=14, textColor=colors.HexColor("#7E9A94"),
                    alignment=TA_CENTER),
    "h1":         P("h1", fontName="Helvetica-Bold", fontSize=19, leading=24,
                    textColor=VERDE2, spaceBefore=4, spaceAfter=3),
    "h1n":        P("h1n", fontName="Helvetica-Bold", fontSize=9, leading=12,
                    textColor=ORO, spaceAfter=1),
    "h2":         P("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=17,
                    textColor=VERDE2, spaceBefore=13, spaceAfter=5),
    "h3":         P("h3", fontName="Helvetica-Bold", fontSize=10, leading=14,
                    textColor=TXT, spaceBefore=9, spaceAfter=3),
    "body":       P("body"),
    "lead":       P("lead", fontSize=11, leading=17, textColor=TXT2, spaceAfter=11),
    "small":      P("small", fontSize=8.5, leading=12.5, textColor=TXT3),
    "li":         P("li", leftIndent=11, bulletIndent=2, spaceAfter=4),
    "cell":       P("cell", fontSize=8.5, leading=12),
    "cellb":      P("cellb", fontName="Helvetica-Bold", fontSize=8.5, leading=12),
    "cellh":      P("cellh", fontName="Helvetica-Bold", fontSize=8, leading=11,
                    textColor=colors.white),
    "nota":       P("nota", fontSize=9, leading=14, textColor=TXT2, leftIndent=10),
    "mono":       P("mono", fontName="Courier", fontSize=8, leading=11.5, textColor=TXT2),
}

# ── plantillas de página ──────────────────────────────────────────────────────
def portada_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(VERDE)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setStrokeColor(ORO)
    canvas.setLineWidth(1.1)
    canvas.line(MARGEN + 28*mm, H - 96*mm, W - MARGEN - 28*mm, H - 96*mm)
    canvas.setFillColor(ORO)
    canvas.circle(W/2, H - 118*mm, 12*mm, fill=0, stroke=1)
    canvas.setFont("Helvetica-Bold", 15)
    canvas.drawCentredString(W/2, H - 120.6*mm, "OG")
    canvas.restoreState()

def normal_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(FONDO)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    # cabecera
    canvas.setStrokeColor(LINEA); canvas.setLineWidth(0.6)
    canvas.line(MARGEN, H - 14*mm, W - MARGEN, H - 14*mm)
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(TXT3)
    canvas.drawString(MARGEN, H - 12.4*mm, "VETA WALLET  ·  DOSSIER TECNICO")
    canvas.drawRightString(W - MARGEN, H - 12.4*mm, "Orden Global Corp")
    # pie
    canvas.line(MARGEN, 15*mm, W - MARGEN, 15*mm)
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(TXT3)
    canvas.drawString(MARGEN, 11*mm, "v1.18.0 · build 53 · 31 jul 2026")
    canvas.setFillColor(ORO)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawRightString(W - MARGEN, 11*mm, str(doc.page - 1))
    canvas.restoreState()

# ── helpers de contenido ──────────────────────────────────────────────────────
story = []

def h1(num, txt):
    story.append(PageBreak())
    story.append(Paragraph(num, S["h1n"]))
    story.append(Paragraph(txt, S["h1"]))
    story.append(Rule())
    story.append(Spacer(1, 7))

def Rule(color=ORO, w=1.0):
    t = Table([[""]], colWidths=[W - 2*MARGEN], rowHeights=[1])
    t.setStyle(TableStyle([("LINEBELOW", (0,0), (-1,-1), w, color)]))
    return t

def h2(txt): story.append(Paragraph(txt, S["h2"]))
def h3(txt): story.append(Paragraph(txt, S["h3"]))
def p(txt, st="body"): story.append(Paragraph(txt, S[st]))
def sp(x=6): story.append(Spacer(1, x))

def bullets(items):
    for it in items:
        story.append(Paragraph(it, S["li"], bulletText="•"))
    sp(4)

def tabla(headers, rows, widths=None, header_bg=VERDE2):
    data = [[Paragraph(h, S["cellh"]) for h in headers]]
    for r in rows:
        data.append([Paragraph(str(c), S["cell"]) for c in r])
    total = W - 2*MARGEN
    if widths is None:
        widths = [total/len(headers)] * len(headers)
    else:
        s = sum(widths); widths = [x/s*total for x in widths]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), header_bg),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("GRID", (0,0), (-1,-1), 0.4, LINEA),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F4F1E8")]),
    ]))
    story.append(t)
    sp(9)

def callout(titulo, texto, color=ORO):
    inner = [[Paragraph(f"<b>{titulo}</b>", S["cellb"])],
             [Paragraph(texto, S["nota"])]]
    t = Table(inner, colWidths=[W - 2*MARGEN])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#FDF6E3")),
        ("LINEBEFORE", (0,0), (0,-1), 2.6, color),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 11),
        ("RIGHTPADDING", (0,0), (-1,-1), 11),
    ]))
    story.append(KeepTogether(t)); sp(9)

# ══════════════════════════════════════════════════════════════════════════════
# PORTADA
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 62*mm))
story.append(Paragraph("VETA WALLET", S["portada_t"]))
story.append(Spacer(1, 5*mm))
story.append(Paragraph("Dossier técnico", S["portada_s"]))
story.append(Spacer(1, 46*mm))
story.append(Paragraph(
    "Arquitectura · Blockchain de Orden Global · Monedas y especificaciones<br/>"
    "Tarjeta Visa · Seguridad · Preparación para tiendas", S["portada_s"]))
story.append(Spacer(1, 30*mm))
story.append(Paragraph(
    "ORDEN GLOBAL CORP<br/>Versión 1.18.0 · build 53<br/>31 de julio de 2026", S["portada_m"]))

# ══════════════════════════════════════════════════════════════════════════════
story.append(NextPageTemplate("normal"))

# ── ÍNDICE ────────────────────────────────────────────────────────────────────
h1("", "Contenido")
tabla(["", "Sección", "Pág."],
      [["1", "Qué es Veta Wallet", "2"],
       ["2", "Arquitectura del sistema", "3"],
       ["3", "La blockchain de Orden Global", "5"],
       ["4", "Las monedas del ecosistema", "6"],
       ["5", "ORIGEN en detalle", "8"],
       ["6", "La tarjeta Visa", "9"],
       ["7", "Comprar ORIGEN con USDT", "11"],
       ["8", "Recargar la tarjeta", "12"],
       ["9", "Seguridad y custodia", "13"],
       ["10", "Verificación de identidad", "15"],
       ["11", "Mapa de la aplicación", "16"],
       ["12", "API del backend", "17"],
       ["13", "Distribución y actualizaciones", "19"],
       ["14", "Estado para publicar en tiendas", "20"],
       ["15", "Límites conocidos", "21"]],
      widths=[0.6, 8, 1.2])

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 1", "Qué es Veta Wallet")

p("Veta Wallet es una billetera digital custodia para móvil, desarrollada por "
  "Orden Global Corp. Permite guardar y transferir los activos del ecosistema "
  "Orden Global, comprar ORIGEN depositando USDT y gastar ese saldo en el mundo "
  "real mediante una tarjeta Visa virtual.", "lead")

h2("Las tres cosas que hace")

tabla(["Función", "Qué resuelve"],
      [["<b>Custodia</b>",
        "Guarda los activos del usuario sin exigirle que administre una clave privada. "
        "La clave existe y el usuario puede exportarla, pero no necesita entenderla para empezar."],
       ["<b>Puerta de entrada</b>",
        "El usuario deposita USDT en Polygon y recibe ORIGEN, un activo referenciado al oro. "
        "No hace falta pasar por un exchange."],
       ["<b>Puerta de salida</b>",
        "Una tarjeta Visa virtual convierte el saldo en poder de compra en cualquier "
        "comercio que acepte Visa, físico u online."]],
      widths=[1.5, 5])

h2("Custodia: qué significa exactamente")

p("Veta Wallet es <b>custodia</b>. La clave privada del usuario se genera en el "
  "servidor, se cifra con AES y se guarda en la base de datos. Se descifra únicamente "
  "cuando el usuario firma una operación, y para eso hace falta su contraseña.")

callout("Por qué custodia y no auto-custodia",
        "La auto-custodia traslada al usuario un problema que la mayoría no puede resolver: "
        "si pierde doce palabras, pierde todo, para siempre, sin recurso. Para un producto "
        "dirigido a gente que hoy usa efectivo, esa barrera elimina al público antes de "
        "empezar.<br/><br/>"
        "El costo es real y hay que decirlo: el usuario confía en que Orden Global custodie "
        "bien. La mitigación es que <b>puede exportar su frase de respaldo en cualquier "
        "momento</b> desde la app y dejar de depender de nosotros cuando quiera.")

h2("Lo que no es")

bullets([
    "<b>No es un banco.</b> No capta depósitos, no da crédito, no paga intereses y "
    "los saldos no están cubiertos por ningún seguro de depósitos.",
    "<b>No es un exchange.</b> No hay libro de órdenes ni trading entre usuarios.",
    "<b>No promete rendimientos.</b> ORIGEN sigue al oro; el oro sube y baja.",
])

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 2", "Arquitectura del sistema")

p("Tres piezas propias y cuatro proveedores externos. La app nunca habla "
  "directamente con ningún proveedor: todo pasa por el backend, que es el único "
  "que conoce las claves de API.", "lead")

h2("Componentes")

tabla(["Pieza", "Tecnología", "Dónde corre", "Función"],
      [["Aplicación móvil", "React Native 0.81 · Expo SDK 54", "iOS / Android",
        "Toda la interfaz. Lee saldos directo de la cadena por RPC."],
       ["Backend", "Node.js · Express · Babel", "Heroku",
        "Custodia de claves, firma de transacciones, puente con CryptoMate y Veriff."],
       ["Base de datos", "MongoDB", "MongoDB Atlas",
        "Usuarios, claves cifradas, tarjetas, recargas, depósitos."],
       ["Cadena", "EVM privada · chain 8532", "Nodos de Orden Global",
        "Donde viven ORIGEN, AUKA, AGKA, ONDK y MNKA."]],
      widths=[1.4, 2, 1.4, 3.4])

h2("Proveedores externos")

tabla(["Proveedor", "Para qué", "Qué recibe"],
      [["CryptoMate", "Emite y opera la tarjeta Visa virtual",
        "Nombre, documento, domicilio, fecha de nacimiento"],
       ["Veriff", "Verificación de identidad (KYC)", "Documento y selfie"],
       ["Polygon", "Red donde se depositan USDT y se liquida la tarjeta", "Nada personal"],
       ["Expo (EAS)", "Compilación y actualizaciones por aire", "Identificador anónimo del dispositivo"]],
      widths=[1.3, 3, 2.7])

h2("Un detalle de diseño que conviene entender")

p("Los saldos de la cadena 8532 <b>no los sirve el backend</b>: la app los lee "
  "directamente del nodo RPC. Eso tiene dos consecuencias buenas y una a vigilar.")

bullets([
    "<b>Bueno:</b> si el backend se cae, el usuario sigue viendo sus saldos reales.",
    "<b>Bueno:</b> el backend no puede mostrar un saldo que la cadena no respalde.",
    "<b>A vigilar:</b> la app depende de que el RPC público responda. Hay una "
    "dirección de respaldo configurada para ese caso.",
])

h2("Flujo de una operación típica")

p("Enviar ORIGEN a otra persona:", "small")
sp(2)
tabla(["Paso", "Quién", "Qué pasa"],
      [["1", "App", "El usuario escribe destino y monto, y su contraseña"],
       ["2", "Backend", "Verifica la contraseña contra el hash bcrypt"],
       ["3", "Backend", "Descifra la clave privada del usuario con AES"],
       ["4", "Backend", "Firma y emite la transacción en la cadena 8532"],
       ["5", "Backend", "Devuelve el hash <b>sin esperar el minado</b>"],
       ["6", "App", "Muestra el envío como pendiente; el saldo se actualiza al refrescar"]],
      widths=[0.7, 1.3, 6])

callout("Por qué no se espera el minado",
        "El router de Heroku corta cualquier petición a los 30 segundos. Si se espera "
        "la confirmación y la red tarda más, el usuario ve un error de red por una "
        "transacción que en realidad salió bien y va a minarse.<br/><br/>"
        "Ese es el peor resultado posible, porque invita a reenviar y a gastar dos veces. "
        "El hash es prueba suficiente de que se emitió.")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 3", "La blockchain de Orden Global")

tabla(["Parámetro", "Valor"],
      [["Nombre", "Orden Global"],
       ["Chain ID", "<b>8532</b>"],
       ["Tipo", "EVM privada (compatible con Ethereum)"],
       ["Moneda nativa", "ORIGEN"],
       ["Decimales", "18"],
       ["RPC principal", "https://www.ordenglobal-rpc.com"],
       ["RPC de respaldo", "https://rpc.ordenglobal-rpc.com/"],
       ["Estándar de tokens", "ERC-20"]],
      widths=[1.6, 5])

h2("Por qué una cadena propia")

p("Ser compatible con EVM significa que todo el herramental de Ethereum sirve: "
  "ethers.js, MetaMask, los estándares de token, las bibliotecas de firma. No hubo "
  "que inventar criptografía ni formatos.")

p("Ser privada significa control sobre el costo y la velocidad de las transacciones. "
  "En una red pública, una transferencia de $5 puede costar $3 de comisión en un mal "
  "día — eso vuelve inviable el caso de uso de pagos cotidianos, que es exactamente "
  "para lo que existe ORIGEN.")

callout("La contrapartida honesta",
        "Una cadena privada no tiene la descentralización de una pública. Los nodos "
        "los opera Orden Global. Para un token de pagos respaldado por una empresa que "
        "además custodia las claves, esa descentralización no aportaría garantías "
        "reales — pero es una diferencia que corresponde declarar, no esconder.<br/><br/>"
        "Consecuencia práctica: <b>ningún exchange descentralizado público soporta la "
        "cadena 8532</b>. Por eso el puente entre ORIGEN y USDT lo opera internamente "
        "el treasury de Orden Global, y no un DEX.")

h2("Direcciones")

p("La dirección de un usuario es la misma en la cadena 8532 y en Polygon: ambas son "
  "EVM, y una misma clave privada produce la misma dirección en las dos. Esto no es "
  "un detalle menor — es lo que permite que el usuario deposite USDT en Polygon "
  "<b>a su propia dirección</b>, sin que haya que generarle una cuenta aparte.", "body")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 4", "Las monedas del ecosistema")

p("Cinco activos, todos en la cadena 8532. ORIGEN es la moneda nativa; los otros "
  "cuatro son contratos ERC-20.", "lead")

tabla(["Símbolo", "Tipo", "Respaldo", "Contrato"],
      [["<b>ORIGEN</b>", "Cripto nativa · pagos", "1/55 g de oro", "Token nativo (sin contrato)"],
       ["<b>AUKA</b>", "Commodity token", "1 onza de oro", "0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B"],
       ["<b>AGKA</b>", "Commodity token", "1 onza de plata", "0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B"],
       ["<b>ONDK</b>", "Gobernanza y utilidad", "Ecosistema Orden Global", "0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1"],
       ["<b>MNKA</b>", "Activo digital", "Comunidad e innovación", "0x18b6680CFF71c11067bec312Fc48786bE2e54Ead"]],
      widths=[1, 1.6, 1.6, 4.4])

h2("Ficha de cada moneda")

h3("ORIGEN — la moneda de pagos")
p("Cripto nativa de la cadena de Orden Global. Su valor se ancla a un <b>gramín</b>: "
  "1/55 de un gramo de oro. Es la unidad en la que el usuario piensa y en la que la "
  "app muestra todo — el dólar aparece siempre como referencia al lado, nunca como "
  "la cifra principal.")

h3("AUKA — exposición al oro")
p("Token respaldado en oro que sigue el precio de una onza. Ofrece exposición al "
  "metal sin custodia física ni los costos de almacenamiento y seguro que implica.")

h3("AGKA — exposición a la plata")
p("El equivalente de AUKA para la plata: sigue el precio de una onza. Una forma "
  "descentralizada de participar del mercado de la plata.")

h3("ONDK — gobernanza y utilidad")
p("Representación de Orden Global en token. Refleja el valor y la participación "
  "dentro del ecosistema, y da acceso a decisiones de gobernanza.")

h3("MNKA — comunidad")
p("Activo digital diseñado para impulsar el crecimiento y la innovación impulsados "
  "por la comunidad del ecosistema.")

h2("Cómo se obtienen los precios")

tabla(["Activo", "Fuente del precio", "Respaldo si falla"],
      [["ORIGEN", "PAXG en Binance → CoinGecko", "OG_TOKEN_PRICE_USD, luego $2000/oz"],
       ["AUKA", "Precio del oro (mercado)", "Sin precio: la app muestra “—”"],
       ["AGKA", "Precio de la plata (mercado)", "Sin precio: la app muestra “—”"],
       ["ONDK", "Endpoint del backend", "Caché local 30 min, luego valor de referencia"],
       ["MNKA", "Ecosistema", "Sin precio: la app muestra “—”"]],
      widths=[1, 3, 3])

callout("Una regla de producto que vale la pena señalar",
        "Cuando no hay precio real, la app muestra <b>“—”</b>, no un número viejo ni un "
        "valor estimado.<br/><br/>"
        "Un precio congelado que parece actual es peor que ningún precio: alguien podría "
        "decidir vender o comprar a partir de él. El total del portafolio suma únicamente "
        "los activos con precio verificable, y avisa cuando alguno quedó fuera.")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 5", "ORIGEN en detalle")

h2("La fórmula")

p("Un ORIGEN equivale a un <b>gramín</b>: 1/55 de un gramo de oro.", "lead")

t = Table([[Paragraph(
    "precio_ORIGEN_USD  =  ( precio_onza_oro_USD  ÷  31.1035 )  ÷  55", S["mono"])]],
    colWidths=[W - 2*MARGEN])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#F0EDE2")),
    ("TOPPADDING", (0,0), (-1,-1), 11), ("BOTTOMPADDING", (0,0), (-1,-1), 11),
    ("LEFTPADDING", (0,0), (-1,-1), 14), ("BOX", (0,0), (-1,-1), 0.5, LINEA),
]))
story.append(t); sp(9)

p("31.1035 es la cantidad de gramos de una onza troy. El divisor 55 es lo que "
  "define el gramín.", "small")

h2("De dónde sale el precio del oro")

tabla(["Orden", "Fuente", "Nota"],
      [["1", "Binance · par PAXG/USDT", "PAXG cotiza 1:1 contra la onza. No pide clave y es la que menos falla"],
       ["2", "CoinGecko · pax-gold", "Segunda opinión si Binance no responde"],
       ["3", "Variable OG_TOKEN_PRICE_USD", "Precio fijado a mano en el entorno"],
       ["4", "$2000 la onza", "Último recurso, deliberadamente conservador"]],
      widths=[0.6, 2.2, 5])

callout("Por qué el último recurso subestima el oro",
        "Fijar $2000 por onza cuando el precio real es mayor hace que el usuario reciba "
        "<b>menos</b> ORIGEN por su USDT, no más.<br/><br/>"
        "Si hay que equivocarse sin fuentes de precio, es preferible errar contra la "
        "operación que a favor: un error que regala ORIGEN sale del treasury y no se "
        "recupera.")

h2("Un solo lugar para el precio")

p("La función que calcula el precio de ORIGEN vive en <font face='Courier' size='8.5'>"
  "lib/origenPrice.js</font> y la usan los tres flujos que mueven dinero: comprar "
  "ORIGEN con USDT, recargar la tarjeta y mostrar los consumos.")

p("Antes estaba copiada en dos controladores, <b>con respaldos distintos entre sí</b>. "
  "Dos copias del mismo precio significan comprar a una tasa y gastar a otra, y esa "
  "diferencia sale del bolsillo de alguien.")

h2("Los dos saldos de ORIGEN")

p("Hoy conviven dos saldos que no son lo mismo y la app los muestra por separado:")

tabla(["Saldo", "Dónde vive", "Se cobra", "Se puede enviar"],
      [["<b>En la billetera</b>", "Cadena 8532", "Firmando una transferencia", "Sí"],
       ["<b>Comprado</b>", "Base de datos del backend", "Decremento atómico", "Todavía no"]],
      widths=[1.4, 2, 2, 1.4])

p("El comprado es el que se acredita al depositar USDT. Se unificarán cuando el "
  "treasury de Orden Global pueda emitir ORIGEN on-chain — hoy el backend tiene la "
  "dirección del treasury pero no su clave privada, así que puede recibir ORIGEN "
  "pero no enviarlo.")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 6", "La tarjeta Visa")

p("Una tarjeta Visa virtual real, emitida por CryptoMate y operada íntegramente "
  "desde la app.", "lead")

tabla(["Característica", "Detalle"],
      [["Emisor", "CryptoMate (api.cryptomate.me)"],
       ["Red", "Visa"],
       ["Tipo", "Virtual · enterprise"],
       ["Requisito", "Verificación de identidad aprobada"],
       ["Liquidación", "USDT en Polygon hacia la wallet de la tarjeta"],
       ["Unidad mostrada", "ORIGEN, con el equivalente en USD al lado"],
       ["Mínimo por recarga", "$10 USD (requisito del emisor)"],
       ["Máximo por recarga", "$5.000 USD"]],
      widths=[1.8, 5])

h2("Todo lo que se puede hacer desde la app")

tabla(["Acción", "Qué hace"],
      [["Ver número y CVV", "Requiere contraseña o biometría en cada consulta. No se cachea nunca"],
       ["Copiar número y CVV", "Por separado, después de autenticarse"],
       ["Crear y cambiar el PIN", "PIN de 4 dígitos, exige contraseña"],
       ["Congelar", "Pausa la tarjeta al instante. Reversible"],
       ["Reemitir", "Número nuevo al instante, si te la clonaron"],
       ["Cancelar", "Definitivo"],
       ["Desbloquear", "Si el emisor la bloqueó por seguridad"],
       ["Límites de gasto", "Diario, semanal y mensual, editables"],
       ["Gasto acumulado", "Barras contra cada límite, en rojo al 85%"],
       ["Teléfono OTP", "Dónde llegan los códigos de compras online"],
       ["3D Secure por SMS", "Activar la verificación en compras online"],
       ["Estado de cuenta", "Exportación en CSV"],
       ["Detalle de consumo", "Comercio, divisa original, tipo de cambio, saldo después"],
       ["Disputar un cargo", "Desde el detalle del movimiento"],
       ["Avisos del emisor", "Bloqueos de seguridad y cargos rechazados"]],
      widths=[1.8, 5])

h2("Cómo se muestran los consumos")

p("Cada movimiento se muestra en <b>ORIGEN</b> arriba, con los dólares debajo en "
  "gris y más chico. El detalle muestra además la conversión de lo que realmente "
  "costó, con el tipo de cambio aplicado.")

p("La regla es la misma en toda la app: ORIGEN es la unidad, el dólar es la "
  "referencia. Nunca al revés.")

h2("Lo que no se puede hacer todavía")

callout("Pago por NFC y Google / Apple Wallet",
        "<b>Agregar la tarjeta a Google Wallet</b> es posible en principio, pero está "
        "bloqueado fuera de nuestro código: la documentación de Google es de acceso "
        "restringido, el TapAndPay SDK se entrega solo tras aprobación, y hace falta "
        "que CryptoMate exponga la OPC (<i>opaque payment card</i>) que sale de Visa "
        "Token Service. De los 17 endpoints de tarjeta que usa el backend, ninguno "
        "toca tokenización.<br/><br/>"
        "<b>Pagar por NFC desde la propia app</b> se descarta. Android lo permite "
        "técnicamente, pero el datáfono exige credenciales EMV emitidas por un Token "
        "Service Provider, más certificación EMVCo de la app y el alcance PCI que "
        "arrastra. Ninguna wallet de cripto lo hace: todas empujan a Google Wallet.")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 7", "Comprar ORIGEN con USDT")

p("El usuario deposita USDT en Polygon y recibe ORIGEN, sin apretar nada.", "lead")

h2("El flujo")

tabla(["Paso", "Qué pasa"],
      [["1", "La app muestra la dirección del usuario con su código QR, y avisa que solo se acepta USDT por Polygon"],
       ["2", "El usuario envía USDT a esa dirección — que es la suya, no una nuestra"],
       ["3", "El backend compara el saldo USDT de la cadena contra una marca de agua de lo ya acreditado"],
       ["4", "La diferencia es el depósito nuevo. Se convierte a ORIGEN al precio del momento"],
       ["5", "Se acredita el saldo interno y se registra el depósito con su tasa"]],
      widths=[0.7, 7])

h2("Detección sin watcher")

p("No hay proceso escuchando la cadena ni webhook de ningún proveedor. Cada consulta "
  "lee el saldo USDT actual y lo compara con lo ya acreditado.")

bullets([
    "<b>Es idempotente por construcción:</b> releer da el mismo resultado, así que "
    "consultar de más nunca acredita de más.",
    "<b>No depende del momento:</b> no hace falta haber estado escuchando cuando "
    "llegó el depósito.",
    "<b>Sobrevive a caídas:</b> si el servidor estuvo caído tres horas, la primera "
    "consulta al volver detecta todo lo que entró.",
])

h2("Precisión y candado")

p("La marca de agua se guarda como texto en unidades mínimas de USDT (6 decimales) "
  "y se compara como BigInt. Un número de coma flotante pierde precisión, y un "
  "centavo mal contado es un centavo regalado o cobrado de más.")

p("Contra la doble acreditación hay un <font face='Courier' size='8.5'>findOneAndUpdate"
  "</font> condicionado a que la marca de agua siga siendo la que se leyó. Si otra "
  "petición acreditó en el medio, el filtro no encuentra nada y esa petición se "
  "retira sin escribir.")

callout("Dónde queda el USDT",
        "Se queda quieto en la dirección del propio usuario en Polygon.<br/><br/>"
        "Barrerlo al treasury costaría gas en POL que el usuario no tiene, y quieto "
        "queda atribuido a quien lo mandó. Es el respaldo del saldo ORIGEN acreditado.")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 8", "Recargar la tarjeta")

p("Pasar saldo ORIGEN a la tarjeta Visa. Son dos transferencias en cadenas "
  "distintas, y ahí está toda la dificultad.", "lead")

h2("Dos caminos")

tabla(["Origen del ORIGEN", "Cómo se cobra", "Espera"],
      [["<b>Saldo comprado</b> (depósitos de USDT)",
        "Decremento atómico en la base de datos", "Ninguna: no hay nada que confirmar"],
       ["<b>Saldo en la billetera</b> (cadena 8532)",
        "Transferencia firmada al treasury", "Hasta 18 s por la confirmación"]],
      widths=[2.6, 2.6, 2.4])

p("Se intenta primero con el saldo comprado. Si no alcanza, se va a la cadena. "
  "<b>Las dos fuentes no se mezclan en una misma recarga:</b> si una mitad fallara "
  "habría que devolver la otra, y ese camino tiene más formas de salir mal que de "
  "salir bien. La app lo dice explícitamente cuando el usuario tiene saldo en ambos.")

h2("Las tres garantías")

tabla(["Garantía", "Cómo se consigue"],
      [["<b>Confirmar antes de pagar</b>",
        "El treasury libera USDT solo si el recibo del débito llega con status = 1. "
        "Antes se liberaba a ciegas: un pago que revertía igual entregaba USDT"],
       ["<b>No pagar dos veces</b>",
        "El sello <font face='Courier' size='8'>usdtReleasedAt</font> se escribe "
        "<i>antes</i> de transferir. Si el proceso muere entre el envío y el guardado, "
        "un reintento encuentra el sello puesto y no vuelve a pagar"],
       ["<b>Una recarga por usuario</b>",
        "Índice único parcial sobre (userId, estado pendiente o debitado). Dos "
        "peticiones simultáneas no pueden abrir dos recargas"]],
      widths=[1.8, 5])

callout("Por qué el sello se pone antes y no después",
        "Es una elección deliberada entre dos males.<br/><br/>"
        "Si se sella <i>después</i> de transferir y el proceso muere en el medio, un "
        "reintento paga de nuevo: el treasury entrega dos veces.<br/><br/>"
        "Si se sella <i>antes</i> y muere en el medio, puede quedar un pago hecho sin "
        "registrar. Es preferible investigar un pago sin registro a pagar dos veces: "
        "lo primero se corrige mirando la cadena, lo segundo es dinero perdido.")

h2("Qué ve el usuario")

p("Tres pasos en pantalla: <b>pago enviado</b> → <b>pago confirmado</b> → "
  "<b>saldo acreditado</b>. Puede cerrar la app en el medio; al volver, la recarga "
  "se retoma donde quedó en vez de empezar otra.")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 9", "Seguridad y custodia")

h2("Cómo se guarda cada secreto")

tabla(["Dato", "Cómo se guarda", "Dónde"],
      [["Contraseña", "Hash bcrypt (una sola dirección)", "MongoDB"],
       ["Clave privada", "Cifrada con AES", "MongoDB"],
       ["Frase de respaldo", "Cifrada con AES", "MongoDB"],
       ["Sesión (JWT)", "Llavero del sistema operativo", "Keychain / Keystore"],
       ["Credenciales recordadas", "Llavero del sistema operativo", "Keychain / Keystore"],
       ["Contraseña para biometría", "Llavero con autenticación obligatoria", "Keychain / Keystore"]],
      widths=[1.8, 3.2, 2])

h2("Autenticación")

tabla(["Mecanismo", "Detalle"],
      [["Token de sesión", "JWT, vigencia 40 minutos"],
       ["Token de refresco", "JWT, vigencia 30 días, renueva sin volver a pedir contraseña"],
       ["Revocación", "Contador <font face='Courier' size='8'>tokenVersion</font> dentro del refresh token"],
       ["Biometría", "Face ID / huella, gestionada por el sistema operativo"],
       ["Pantalla de bloqueo", "Al volver a la app tras un tiempo de inactividad"]],
      widths=[1.8, 5])

callout("Cómo funciona la revocación sin guardar tokens",
        "Guardar cada refresh token emitido en la base obliga a mantener una tabla que "
        "crece sin parar y a consultarla en cada renovación.<br/><br/>"
        "En su lugar, el usuario tiene un contador. El refresh token lleva dentro el "
        "valor que tenía cuando se emitió, y al renovar se comparan. <b>Subir el "
        "contador invalida de golpe todos los tokens anteriores</b>, sin guardar "
        "ninguno. Sube al eliminar la cuenta y al cambiar la contraseña.")

h2("Límites de intentos")

tabla(["Endpoint", "Límite", "Por qué"],
      [["Login", "20 cada 15 min", "Fuerza bruta contra contraseñas"],
       ["Registro", "20 cada 15 min", "Cada intento crea una wallet y manda un correo"],
       ["Recuperar / restablecer", "20 cada 15 min", "Fuerza bruta contra el token de reseteo"],
       ["Recargar tarjeta", "10 cada 15 min", "Operación financiera"],
       ["Revisar depósito", "120 cada 5 min", "Cada llamada lee la cadena de Polygon"],
       ["<b>Revelar seed / clave</b>", "<b>5 cada 15 min</b>", "El que gane esa carrera se lleva los fondos, no una sesión"],
       ["Eliminar cuenta", "5 cada 15 min", "Operación irreversible"]],
      widths=[2.2, 1.4, 4])

h2("Protección contra inyección NoSQL")

p("Un filtro global recorre el cuerpo, la query y los parámetros de cada petición y "
  "elimina las claves que empiezan con <font face='Courier' size='8.5'>$</font> o "
  "contienen puntos. Sin eso, mandar "
  "<font face='Courier' size='8.5'>{\"$ne\": null}</font> donde el servidor espera "
  "un texto convierte una comparación en un operador de Mongo.")

p("La cadena de ataque que esto cierra: restablecer la contraseña de cualquier "
  "cuenta → entrar → pedir la frase de respaldo → vaciar la wallet.", "small")

h2("Eliminación de cuenta")

p("Requisito obligatorio de ambas tiendas. Se anonimiza en vez de destruir:")

bullets([
    "Se borran los datos personales: correo, nombre, teléfono, país.",
    "Se cierran todas las sesiones en todos los dispositivos.",
    "Se borra todo lo guardado en el teléfono.",
    "<b>Se conserva la dirección con su clave cifrada.</b>",
    "Se conservan los registros de identidad que la ley obliga a guardar 5 años.",
])

callout("Por qué no se borra la clave",
        "Si el usuario todavía tiene fondos on-chain y destruimos su clave privada "
        "cifrada, ese dinero queda inaccesible para siempre — para él y para nosotros. "
        "Un arrepentimiento no debería costar los ahorros.<br/><br/>"
        "Conservándola, los fondos siguen siendo recuperables con la frase de respaldo "
        "que el usuario ya tenía. El correo queda libre para registrarse de nuevo.")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 10", "Verificación de identidad")

p("Obligatoria para solicitar la tarjeta. Es una exigencia legal derivada de la "
  "normativa contra el lavado de dinero, no una decisión comercial.", "lead")

tabla(["Etapa", "Qué pasa"],
      [["1. Datos", "El usuario completa nombre, documento, fecha de nacimiento, domicilio, ocupación y origen de fondos"],
       ["2. Veriff", "Se abre la verificación: foto del documento y selfie"],
       ["3. Resultado", "Veriff notifica por webhook; el estado se refleja en la app"],
       ["4. CryptoMate", "Con la verificación aprobada, se puede emitir la tarjeta"]],
      widths=[1.4, 6])

h2("Datos que se recogen y por qué")

tabla(["Dato", "Motivo"],
      [["Nombre y apellido", "Requisito del emisor de la tarjeta"],
       ["Documento de identidad", "Obligación legal de identificación"],
       ["Selfie", "Verificar que el documento pertenece a quien lo presenta"],
       ["Fecha de nacimiento", "Comprobar mayoría de edad"],
       ["Nacionalidad y domicilio", "Obligación legal"],
       ["Ocupación y origen de fondos", "Obligación legal (prevención de lavado)"],
       ["Volumen mensual esperado", "Perfil de riesgo del cliente"]],
      widths=[2, 5])

p("Estos datos se conservan <b>5 años desde el cierre de la cuenta</b>, incluso si "
  "el usuario la elimina. No es una decisión nuestra: la normativa obliga a "
  "conservar los registros de identificación durante ese plazo.", "small")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 11", "Mapa de la aplicación")

p("33 pantallas. La aplicación está en español e inglés, con 767 textos "
  "traducidos en cada idioma.", "lead")

tabla(["Área", "Pantallas"],
      [["<b>Entrada</b>", "Splash · Registro e ingreso · Onboarding · Bloqueo por biometría"],
       ["<b>Inicio</b>", "Portafolio · Detalle de token · Actividad · Notificaciones"],
       ["<b>Operar</b>", "Enviar · Recibir · Comprar · Intercambiar · Escanear QR"],
       ["<b>Tarjeta</b>", "Tarjeta · Ajustes de tarjeta · Recargar · Depositar USDT"],
       ["<b>Identidad</b>", "Verificación · Pasaporte Genesis · Importar pasaporte"],
       ["<b>Cuenta</b>", "Perfil · Ajustes · Contactos · Sesiones · Bloqueados"],
       ["<b>Seguridad</b>", "Ver frase de respaldo · Ver clave privada · Solo observación"],
       ["<b>Otros</b>", "Remesas · MyTokenPay · Ayuda · Acerca de · Eliminar cuenta"]],
      widths=[1.3, 6])

h2("Reglas de interfaz que atraviesan toda la app")

bullets([
    "<b>ORIGEN es la unidad.</b> El dólar aparece siempre al lado como referencia, "
    "más chico y en gris. Nunca como la cifra principal.",
    "<b>Sin precio se muestra “—”.</b> Nunca un número viejo que parezca actual.",
    "<b>Los datos sensibles no se cachean.</b> Número de tarjeta, CVV y PIN exigen "
    "autenticación en cada consulta.",
    "<b>La app nunca se reinicia sola</b> para aplicar una actualización: hacerlo "
    "a mitad de un envío sería peor que esperar.",
    "<b>Las advertencias van antes de la acción.</b> En la pantalla de depósito, el "
    "aviso de red está arriba de la dirección, no debajo.",
])

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 12", "API del backend")

p("70 rutas. La app usa 30 de ellas; el resto son de administración, webhooks y "
  "la billetera web.", "lead")

h2("Autenticación")
tabla(["Método", "Ruta", "Función"],
      [["POST", "/auth/register", "Crear cuenta (alias de registryWallet)"],
       ["POST", "/auth/login", "Ingresar"],
       ["POST", "/auth/refresh", "Renovar la sesión"],
       ["POST", "/auth/recuperarPassword", "Pedir el correo de recuperación"],
       ["POST", "/auth/resetPassword", "Restablecer con el token del correo"],
       ["GET", "/auth/verifyMail", "Confirmar el correo"]],
      widths=[0.8, 2.6, 4])

h2("Usuario")
tabla(["Método", "Ruta", "Función"],
      [["GET", "/users/userDate", "Datos de la cuenta"],
       ["POST", "/users/changePassword", "Cambiar contraseña (cierra las demás sesiones)"],
       ["POST", "/users/decriptSeed", "Revelar la frase de respaldo"],
       ["POST", "/users/decriptPrivate", "Revelar la clave privada"],
       ["DELETE", "<b>/users/me</b>", "<b>Eliminar la cuenta</b>"]],
      widths=[0.8, 2.6, 4])

h2("Billetera y depósitos")
tabla(["Método", "Ruta", "Función"],
      [["GET", "/wallet/deposit-info", "Dirección, red, mínimo y saldo. Revisa de paso"],
       ["POST", "/wallet/deposit/check", "Fuerza una revisión de depósitos"],
       ["GET", "/wallet/origen-balance", "Saldo ORIGEN comprado"],
       ["GET", "/wallet/deposits", "Historial de acreditaciones"],
       ["POST", "/transaction/send", "Enviar la moneda nativa"],
       ["POST", "/transaction/sendToken", "Enviar un token ERC-20"]],
      widths=[0.8, 2.6, 4])

h2("Tarjeta")
tabla(["Método", "Ruta", "Función"],
      [["POST", "/cards/request", "Solicitar la tarjeta"],
       ["GET", "/cards/my-card", "Estado, saldo y configuración"],
       ["POST", "/cards/pan", "Ver el número completo"],
       ["POST · PUT", "/cards/pin", "Ver / crear el PIN"],
       ["POST", "/cards/freeze", "Congelar y descongelar"],
       ["POST", "/cards/fund", "Recargar con ORIGEN"],
       ["GET", "/cards/fund/status", "Estado de una recarga en curso"],
       ["GET", "/cards/transactions", "Movimientos"],
       ["GET", "/cards/transactions/:id", "Detalle de un movimiento"],
       ["GET", "/cards/accumulated-spending", "Gasto acumulado contra los límites"],
       ["PATCH", "/cards/limits", "Editar los límites"],
       ["PUT", "/cards/otp-phone", "Teléfono para los códigos"],
       ["POST", "/cards/3ds", "Activar 3D Secure por SMS"],
       ["PUT", "/cards/reissue", "Reemitir"],
       ["PATCH", "/cards/unblock", "Desbloquear"],
       ["POST", "/cards/cancel", "Cancelar"],
       ["POST", "/cards/dispute", "Disputar un cargo"],
       ["GET", "/cards/statement", "Estado de cuenta en CSV"]],
      widths=[0.9, 2.5, 4])

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 13", "Distribución y actualizaciones")

h2("Cómo llegan los cambios al teléfono")

p("La app usa <b>EAS Update</b>: los cambios que son solo JavaScript se descargan "
  "por aire, sin pasar por las tiendas. La app los baja en segundo plano y ofrece "
  "reiniciar; nunca se reinicia sola.")

tabla(["Tipo de cambio", "Cómo llega", "Requiere tienda"],
      [["Pantallas, textos, lógica, llamadas a la API", "Por aire, al reabrir la app", "No"],
       ["Agregar o quitar un módulo nativo", "Instalando una versión nueva", "Sí"],
       ["Cambiar permisos o iconos", "Instalando una versión nueva", "Sí"]],
      widths=[3.4, 2.4, 1.6])

h2("La política de versión de runtime")

p("Un update solo se entrega a una app cuyo <font face='Courier' size='8.5'>"
  "runtimeVersion</font> coincida. La app usa la política "
  "<font face='Courier' size='8.5'>sdkVersion</font>, que produce "
  "<font face='Courier' size='8.5'>exposdk:54.0.0</font> — que es exactamente lo "
  "que pide Expo Go al buscar actualizaciones.")

callout("El costo de esa política, y hay que respetarlo",
        "Con <font face='Courier' size='8.5'>sdkVersion</font>, <b>cualquier</b> "
        "binario del SDK 54 se considera compatible con <b>cualquier</b> update.<br/><br/>"
        "Si se agrega un módulo <b>nativo</b> nuevo, hay que recompilar y repartir la "
        "versión nueva <b>antes</b> de publicar el update. Si no, el binario viejo se "
        "descarga JavaScript que llama a algo que no tiene y se cierra al abrir.<br/><br/>"
        "Cambiar pantallas, textos, estilos o lógica no tiene ese problema.")

h2("Compilación")

tabla(["Perfil", "Salida", "Canal", "Para qué"],
      [["preview", "APK", "preview", "Distribución interna por enlace directo"],
       ["production", "AAB", "production", "Subida a Google Play"]],
      widths=[1.2, 1.2, 1.2, 3.4])

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 14", "Estado para publicar en tiendas")

h2("Resuelto en el código")

tabla(["Requisito", "Estado", "Detalle"],
      [["Eliminación de cuenta en la app", "<b>Listo</b>", "Pantalla con 4 confirmaciones + contraseña, conectada a DELETE /users/me"],
       ["Política de privacidad", "<b>Listo</b>", "Redactada y enlazada desde Ajustes"],
       ["Términos y condiciones", "<b>Listo</b>", "Redactados y enlazados desde Ajustes"],
       ["versionCode (Android)", "<b>Listo</b>", "Declarado en app.json"],
       ["buildNumber (iOS)", "<b>Listo</b>", "Declarado en app.json"],
       ["Manifiesto de privacidad de Apple", "<b>Listo</b>", "4 categorías de required reason APIs declaradas"],
       ["Justificación de permisos", "<b>Listo</b>", "Textos en iOS; RECORD_AUDIO bloqueado en Android"],
       ["Iconos y splash", "<b>Listo</b>", "1024×1024, sin canal alfa en el icono de iOS"],
       ["Cifrado (exención)", "<b>Listo</b>", "ITSAppUsesNonExemptEncryption declarado"],
       ["Pantallas muertas", "<b>Ninguna</b>", "33 rutas verificadas, todas alcanzables"]],
      widths=[2.4, 1, 4])

h2("Pendiente — requiere acción fuera del código")

tabla(["Pendiente", "Quién", "Nota"],
      [["Cuenta de desarrollador de Apple (organización)", "Orden Global",
        "Tarda semanas. Requiere número D-U-N-S. <b>Es la ruta crítica de iOS</b>"],
       ["Publicar los dos documentos legales en el sitio", "Orden Global",
        "Las URLs enlazadas son vetawallet.com/privacidad y /terminos"],
       ["Cuenta de demostración para revisión", "Orden Global",
        "Apple y Google necesitan entrar. Con KYC aprobado y saldo de prueba"],
       ["Formulario de datos de las tiendas", "Orden Global",
        "App Privacy en Apple, Data Safety en Google. La política de privacidad tiene todo lo necesario"],
       ["Capturas de pantalla y textos de ficha", "Orden Global",
        "6.7\" y 5.5\" para iOS; teléfono y tablet para Android"],
       ["Licencias para Remesas", "Orden Global",
        "Transmisión de dinero puede requerir licencia según el país"],
       ["Rotar los secretos del historial de git", "Orden Global",
        "PASS_ADM requiere migrar la base; PASS_TOKEN cierra todas las sesiones"],
       ["Desplegar el backend", "Orden Global",
        "<b>El token de Heroku expiró.</b> El commit está listo y sin desplegar"]],
      widths=[2.6, 1.2, 4])

callout("El orden importa",
        "La cuenta de desarrollador de Apple es lo que más tarda y bloquea todo lo "
        "demás en iOS. Conviene iniciarla hoy, aunque el resto todavía no esté.<br/><br/>"
        "Android puede salir antes: no depende de ese trámite.")

# ══════════════════════════════════════════════════════════════════════════════
h1("SECCIÓN 15", "Límites conocidos")

p("Lo que hoy no está resuelto, dicho sin adornos.", "lead")

tabla(["Límite", "Consecuencia", "Qué haría falta"],
      [["<b>El treasury de Orden Global no puede emitir ORIGEN</b>",
        "El ORIGEN comprado con USDT es un saldo interno, no on-chain. No se puede enviar a otra persona",
        "La clave privada del treasury de OG en las variables de entorno, y ORIGEN en ese treasury"],
       ["<b>Derivación de clave no estándar</b>",
        "La frase de respaldo no recupera los mismos fondos en otra billetera (MetaMask, Trust)",
        "Migrar a derivación BIP-44 estándar. Afecta a las cuentas existentes"],
       ["<b>Cadena privada</b>",
        "Ningún exchange descentralizado soporta la 8532. El puente lo opera el treasury",
        "Es una decisión de diseño, no un defecto a corregir"],
       ["<b>Sin push provisioning</b>",
        "La tarjeta no se puede agregar a Google Wallet ni Apple Wallet",
        "Que CryptoMate exponga la OPC, y aprobación de Google y Apple"],
       ["<b>Las dos fuentes de ORIGEN no se combinan</b>",
        "Con 30 comprados y 20 en billetera no se puede recargar 40",
        "Cobro mixto con devolución si falla la segunda mitad"],
       ["<b>Sin barrido del USDT depositado</b>",
        "El USDT queda en la dirección del usuario, no en el treasury",
        "Un relayer que pague el gas en POL"]],
      widths=[2.2, 3, 3])

sp(10)
story.append(Rule(LINEA, 0.6))
sp(8)
p("Documento generado a partir del código fuente de Veta Wallet v1.18.0 · build 53. "
  "Las direcciones de contrato, los parámetros de red y las rutas de la API están "
  "tomadas directamente del repositorio, no de documentación previa.", "small")
sp(6)
p("<b>Orden Global Corp</b> · vetawallet.com · soporte@vetawallet.com", "small")

# ══════════════════════════════════════════════════════════════════════════════
SALIDA = "/tmp/Veta-Wallet-Dossier-Tecnico.pdf"

doc = BaseDocTemplate(SALIDA, pagesize=A4,
                      leftMargin=MARGEN, rightMargin=MARGEN,
                      topMargin=22*mm, bottomMargin=20*mm,
                      title="Veta Wallet — Dossier Técnico",
                      author="Orden Global Corp",
                      subject="Arquitectura, blockchain, monedas y especificaciones")

frame = Frame(MARGEN, 20*mm, W - 2*MARGEN, H - 42*mm, id="f")
doc.addPageTemplates([
    PageTemplate(id="portada", frames=[frame], onPage=portada_bg),
    PageTemplate(id="normal", frames=[frame], onPage=normal_bg),
])
doc.build(story)
print("OK:", SALIDA)
