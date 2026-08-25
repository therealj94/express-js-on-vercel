# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, KeepTogether)

OUT = "/home/user/express-js-on-vercel/trading/oro-scalping/informes/ORO_FINAL_Informe_25ago2026.pdf"

# ── Paleta: negro y dorado ──────────────────────────────────────────────
ORO      = colors.HexColor("#C9A227")
ORO_CLR  = colors.HexColor("#F0C440")
NEGRO    = colors.HexColor("#0D1117")
GRIS     = colors.HexColor("#5A6270")
GRIS_CL  = colors.HexColor("#EDEFF2")
VERDE    = colors.HexColor("#1E7A4B")
VERDE_BG = colors.HexColor("#E6F4EC")
ROJO     = colors.HexColor("#B3261E")
ROJO_BG  = colors.HexColor("#FBE9E7")
AZUL     = colors.HexColor("#1B4E82")
AZUL_BG  = colors.HexColor("#E8F0F8")

ss = getSampleStyleSheet()
def S(name, **kw):
    base = kw.pop("parent", ss["Normal"])
    return ParagraphStyle(name, parent=base, **kw)

H1   = S("H1", fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=NEGRO, spaceAfter=2)
SUB  = S("SUB", fontName="Helvetica", fontSize=10.5, leading=14, textColor=GRIS, spaceAfter=14)
H2   = S("H2", fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=NEGRO,
         spaceBefore=16, spaceAfter=7)
H3   = S("H3", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=NEGRO,
         spaceBefore=10, spaceAfter=4)
BODY = S("BODY", fontName="Helvetica", fontSize=9.6, leading=14.2, textColor=NEGRO,
         alignment=TA_JUSTIFY, spaceAfter=6)
SMALL= S("SMALL", fontName="Helvetica", fontSize=8.3, leading=11.5, textColor=GRIS)
CELL = S("CELL", fontName="Helvetica", fontSize=8.6, leading=11.5, textColor=NEGRO)
CELLB= S("CELLB", fontName="Helvetica-Bold", fontSize=8.6, leading=11.5, textColor=NEGRO)
CELLH= S("CELLH", fontName="Helvetica-Bold", fontSize=8.4, leading=11, textColor=colors.white)
KPIN = S("KPIN", fontName="Helvetica-Bold", fontSize=17, leading=19, alignment=TA_CENTER)
KPIL = S("KPIL", fontName="Helvetica", fontSize=7.4, leading=9.5, alignment=TA_CENTER, textColor=GRIS)

def kpi(valor, etiqueta, color):
    t = Table([[Paragraph(f'<font color="{color.hexval()}">{valor}</font>', KPIN)],
               [Paragraph(etiqueta, KPIL)]], colWidths=[38*mm], rowHeights=[10*mm, 7*mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("BACKGROUND", (0,0), (-1,-1), GRIS_CL),
        ("LINEBELOW", (0,0), (-1,0), 0, colors.white),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#D5D9DF")),
        ("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 2),
    ]))
    return t

def tabla(data, widths, header_bg=NEGRO, align_right_from=1):
    rows = []
    for i, r in enumerate(data):
        row = []
        for j, c in enumerate(r):
            if i == 0:
                row.append(Paragraph(str(c), CELLH))
            else:
                st = CELL if j < align_right_from else CELLB
                row.append(Paragraph(str(c), st))
        rows.append(row)
    t = Table(rows, colWidths=widths, repeatRows=1)
    st = [
        ("BACKGROUND", (0,0), (-1,0), header_bg),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 4.5), ("BOTTOMPADDING", (0,0), (-1,-1), 4.5),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("LINEBELOW", (0,0), (-1,-1), 0.4, colors.HexColor("#DCE0E6")),
        ("BOX", (0,0), (-1,-1), 0.6, colors.HexColor("#C8CDD4")),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            st.append(("BACKGROUND", (0,i), (-1,i), colors.HexColor("#F7F8FA")))
    t.setStyle(TableStyle(st))
    return t

def caja(titulo, cuerpo, color_borde, color_fondo, color_titulo):
    inner = [[Paragraph(f'<b><font color="{color_titulo.hexval()}">{titulo}</font></b>',
                        S("bt", fontName="Helvetica-Bold", fontSize=10, leading=13))],
             [Paragraph(cuerpo, S("bb", fontName="Helvetica", fontSize=9.2, leading=13.4,
                                  alignment=TA_JUSTIFY))]]
    t = Table(inner, colWidths=[168*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), color_fondo),
        ("LINEBEFORE", (0,0), (0,-1), 3, color_borde),
        ("TOPPADDING", (0,0), (-1,0), 7), ("BOTTOMPADDING", (0,0), (-1,0), 1),
        ("TOPPADDING", (0,1), (-1,1), 1), ("BOTTOMPADDING", (0,1), (-1,-1), 7),
        ("LEFTPADDING", (0,0), (-1,-1), 9), ("RIGHTPADDING", (0,0), (-1,-1), 9),
    ]))
    return t

def barra_titulo(txt):
    t = Table([[Paragraph(f'<font color="#FFFFFF"><b>{txt}</b></font>',
                          S("bh", fontName="Helvetica-Bold", fontSize=11.5, leading=14))]],
              colWidths=[168*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NEGRO),
        ("LINEBEFORE", (0,0), (0,-1), 3.5, ORO),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
    ]))
    return t

# ── Cabecera y pie ──────────────────────────────────────────────────────
def deco(canv, doc):
    canv.saveState()
    W, H = A4
    canv.setFillColor(NEGRO); canv.rect(0, H-16*mm, W, 16*mm, stroke=0, fill=1)
    canv.setFillColor(ORO);   canv.rect(0, H-17.2*mm, W, 1.2*mm, stroke=0, fill=1)
    canv.setFillColor(ORO_CLR); canv.setFont("Helvetica-Bold", 10)
    canv.drawString(20*mm, H-11*mm, "ORO FINAL  ·  INFORME DE OPERACIONES")
    canv.setFillColor(colors.HexColor("#9AA3AF")); canv.setFont("Helvetica", 8)
    canv.drawRightString(W-20*mm, H-11*mm, "XAUUSDm  ·  25 de agosto de 2026  ·  Cuenta demo Exness")
    canv.setStrokeColor(colors.HexColor("#D5D9DF")); canv.setLineWidth(0.5)
    canv.line(20*mm, 14*mm, W-20*mm, 14*mm)
    canv.setFillColor(GRIS); canv.setFont("Helvetica", 7.6)
    canv.drawString(20*mm, 10*mm, "Analisis del sistema ORO FINAL Turbo 10%  ·  Material educativo, no es asesoria financiera")
    canv.setFont("Helvetica-Bold", 8)
    canv.drawRightString(W-20*mm, 10*mm, f"{doc.page}")
    canv.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                      topMargin=24*mm, bottomMargin=18*mm,
                      title="ORO FINAL - Informe de operaciones 25 ago 2026",
                      author="ORO FINAL")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="n")
doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=deco)])

E = []

# ══ PORTADA / RESUMEN ══
E.append(Paragraph("Por que ganamos y por que fallamos", H1))
E.append(Paragraph("Autopsia de las 5 operaciones del 25 de agosto de 2026 &nbsp;|&nbsp; "
                   "Configuracion TURBO, riesgo 10% por operacion", SUB))

k = Table([[kpi("+$194.35", "GANANCIA EN 2 DIAS", VERDE),
            kpi("+19.4%", "SOBRE $1,000 INICIALES", VERDE),
            kpi("60%", "ACIERTO (3 DE 5)", AZUL),
            kpi("1.49", "FACTOR DE BENEFICIO", AZUL)]],
          colWidths=[42*mm]*4)
k.setStyle(TableStyle([("ALIGN", (0,0), (-1,-1), "CENTER"),
                       ("LEFTPADDING", (0,0), (-1,-1), 1), ("RIGHTPADDING", (0,0), (-1,-1), 1)]))
E.append(k)
E.append(Spacer(1, 12))

E.append(caja("CONCLUSION EN UNA FRASE",
  "El sistema se comporto exactamente como fue disenado: las tres ganadoras corrieron y las dos perdedoras "
  "se cortaron en <b>-1.00R exacto</b>, al centavo, sin deslizamiento. No hubo ningun fallo tecnico. "
  "Las dos perdidas fueron reversiones de mercado tan rapidas (3 y 6 minutos) que <b>ninguna gestion posible "
  "las habria evitado</b>. Con 5 operaciones no hay base estadistica para cambiar nada.",
  ORO, colors.HexColor("#FDF8E7"), colors.HexColor("#8A6D1F")))
E.append(Spacer(1, 4))

# ══ 1. LAS 5 OPERACIONES ══
E.append(barra_titulo("1.  Las cinco operaciones del dia"))
E.append(Spacer(1, 7))
data = [["#", "Hora", "Tipo", "Lote", "Score", "Entrada", "Salida", "Duracion", "Resultado"],
        ["1", "07:30", "SELL", "0.14", "74/100", "4634.718", "4625.808", "39 min", "+$124.75"],
        ["2", "08:25", "BUY",  "0.13", "67/100", "4643.834", "4634.916", "3 min",  "-$115.93"],
        ["3", "09:40", "SELL", "0.12", "78/100", "4630.466", "4639.440", "6 min",  "-$107.69"],
        ["4", "12:30", "SELL", "0.13", "62/100", "4637.311", "4627.050", "45 min", "+$133.40"],
        ["5", "13:1x", "SELL", "0.11", "-",      "4623.050", "4616.210", "~14 min","+$75.23"],
        ['<para alignment="right"><font color="#FFFFFF">NETO DEL DIA</font></para>',
         "", "", "", "", "", "", "",
         '<font color="#F0C440">+$109.76</font>']]
t = tabla(data, [8*mm, 15*mm, 14*mm, 13*mm, 17*mm, 24*mm, 24*mm, 20*mm, 25*mm], align_right_from=8)
t.setStyle(TableStyle([
    ("TEXTCOLOR", (8,1), (8,1), VERDE), ("TEXTCOLOR", (8,4), (8,5), VERDE),
    ("TEXTCOLOR", (8,2), (8,3), ROJO),
    ("BACKGROUND", (0,2), (-1,3), ROJO_BG),
    ("BACKGROUND", (0,6), (-1,6), NEGRO),
    ("TEXTCOLOR", (0,6), (-1,6), colors.white),
    ("SPAN", (0,6), (7,6)),
]))
E.append(t)
E.append(Spacer(1, 5))
E.append(Paragraph("Todas las operaciones se ejecutaron en la killzone de Londres (07:00-10:00) y de Nueva York "
                   "(12:30-15:30), hora del servidor. El tamano del lote lo calculo el bot para arriesgar exactamente "
                   "el 10% del capital disponible en cada momento.", SMALL))

# ══ 2. POR QUE ACERTAMOS ══
E.append(barra_titulo("2.  Por que ACERTAMOS"))
E.append(Spacer(1, 7))

E.append(Paragraph("Las tres ganadoras compartieron tres caracteristicas que no aparecieron en ninguna de las perdedoras.", BODY))

E.append(Paragraph("A. El objetivo se recorto por estructura", H3))
E.append(Paragraph(
  "El bot pide 3R en modo Turbo, pero si hay un maximo o minimo relevante de las ultimas 4 horas antes de ese nivel, "
  "adelanta el objetivo hasta ahi. En las dos ganadoras medibles el objetivo quedo en <b>1.42R y 1.64R</b> en vez de 3R. "
  "Cobro donde el mercado realmente freno, no donde la formula sonaba. Esta funcion se anadio en la ultima revision "
  "profesional y fue la diferencia entre cobrar y devolver la ganancia.", BODY))

E.append(Paragraph("B. La direccion coincidia con el sesgo del dia", H3))
E.append(Paragraph(
  "El 25 de agosto el oro cerro bajando: de 4643 a 4616. <b>Las tres ganadoras fueron SELL</b>, a favor de esa corriente. "
  "La confluencia de tendencia en tres temporalidades (M5, 15m y 1H) es la que empujo el score hacia arriba en el lado correcto.", BODY))

E.append(Paragraph("C. Tuvieron tiempo de madurar", H3))
E.append(Paragraph(
  "Duraron entre 14 y 45 minutos. Ese tiempo permitio que la gestion trabajara: el objetivo parcial, el stop movido a "
  "punto de entrada y el trailing por ATR. Dos de las tres <b>ni siquiera llegaron al objetivo final</b>: cerraron antes "
  "por trailing, asegurando la ganancia cuando el impulso se agoto.", BODY))

E.append(Spacer(1, 3))
E.append(caja("EL DATO MAS IMPORTANTE DEL DIA",
  "Las dos operaciones con objetivo recortado por estructura <b>ganaron</b>. Las dos que pidieron 3R completo, sin "
  "estructura cerca que las frenara, <b>perdieron</b>. Es solo una coincidencia de cinco operaciones, pero es el patron "
  "que mas merece vigilarse en las proximas semanas.",
  AZUL, AZUL_BG, AZUL))

# ══ 3. POR QUE FALLAMOS ══
E.append(barra_titulo("3.  Por que FALLAMOS"))
E.append(Spacer(1, 7))

E.append(Paragraph("Perdida 1  ·  COMPRA a las 08:25  ·  -$115.93", H3))
d = [["Concepto", "Valor", "Lectura"],
     ["Entrada / Stop", "4643.834 / 4634.916", "Riesgo 8.918 puntos = 1R"],
     ["Duracion", "3 minutos 5 segundos", "Menos de UNA vela de 5 minutos"],
     ["Score", "67 / 100", "Por encima del umbral Turbo (62)"],
     ["Objetivo", "3.14R, sin recorte", "Sin estructura cerca que lo frenara"],
     ["Resultado", "-1.00R exacto", "El stop se ejecuto al centavo"]]
E.append(tabla(d, [38*mm, 45*mm, 77*mm], align_right_from=99))
E.append(Spacer(1, 5))
E.append(Paragraph(
  "<b>Que paso:</b> el bot compro en el techo exacto de un rango. La secuencia del dia fue 4634, bajada a 4625 "
  "(la primera operacion, ganadora), rebote hasta 4643 -donde compro- y vuelta a 4634. Fue un rebote dentro de un dia "
  "bajista: la unica operacion del dia que fue contra la corriente dominante, y la unica compra.", BODY))
E.append(Paragraph(
  "<b>Por que la salida inteligente no la salvo:</b> la operacion murio en tres minutos. La salida inteligente necesita "
  "dos velas cerradas (10 minutos) antes de poder evaluar la salud. El precio llego al stop antes. "
  "<b>Esto no es un fallo del bot: es la fisica del mercado.</b> Ningun sistema de gestion actua en tres minutos.", BODY))

E.append(Spacer(1, 6))
E.append(Paragraph("Perdida 2  ·  VENTA a las 09:40  ·  -$107.69", H3))
d = [["Concepto", "Valor", "Lectura"],
     ["Entrada / Stop", "4630.466 / 4639.440", "Riesgo 8.974 puntos = 1R"],
     ["Duracion", "6 minutos", "Poco mas de una vela"],
     ["Score", "78 / 100", "El score MAS ALTO del dia... y perdio"],
     ["Objetivo", "2.96R, sin recorte", "Sin estructura cerca"],
     ["Momento", "20 min antes del cierre", "Killzone de Londres terminaba a las 10:00"]]
E.append(tabla(d, [38*mm, 45*mm, 77*mm], align_right_from=99))
E.append(Spacer(1, 5))
E.append(Paragraph(
  "<b>Que paso:</b> vendio a 4630 y el precio reboto a 4639. Es la leccion mas util del dia: <b>un score alto no es una "
  "promesa</b>. El 78/100 mide calidad de confluencia -cuantos factores estan alineados-, no probabilidad garantizada. "
  "La operacion de score 62 gano y la de 78 perdio. Con cinco operaciones eso no significa nada estadisticamente, "
  "pero conviene interiorizarlo desde el primer dia.", BODY))
E.append(Paragraph(
  "<b>Detalle a vigilar:</b> entro a solo 20 minutos del cierre de la sesion. Una operacion que nace tan cerca del final "
  "tiene poco margen para madurar; si no se resuelve, el bot la cierra al precio que este.", BODY))

E.append(Spacer(1, 3))
E.append(caja("LAS DOS PERDIDAS TIENEN LA MISMA FIRMA",
  "Ambas duraron menos de dos velas, ambas pidieron 3R completo sin estructura cerca, y ambas ocurrieron en la killzone "
  "de Londres de un dia lateral, con el precio oscilando entre 4616 y 4645. El bot fue alternando direccion "
  "(venta, compra, venta) en dos horas: esa es la firma clasica de un mercado sin tendencia, el enemigo natural de "
  "cualquier sistema de rupturas.",
  ROJO, ROJO_BG, ROJO))

# ══ 4. VEREDICTO ══
E.append(barra_titulo("4.  Veredicto:  no cambiar nada todavia"))
E.append(Spacer(1, 7))

d = [["Razon", "Evidencia"],
     ["El sistema esta sano",
      "60% de acierto, factor de beneficio 1.49 (por encima de 1.3 = bueno) y ganancia media practicamente igual a la perdida media."],
     ["Los stops funcionaron perfecto",
      "Las dos perdidas fueron exactamente -1.00R, sin deslizamiento. El broker ejecuto al precio pedido."],
     ["Cinco operaciones no son una muestra",
      "Ajustar parametros con tan pocos datos es sobreajuste: se optimiza para el pasado y se rompe el futuro. Hacen falta 30 o mas."],
     ["Las perdidas no eran evitables",
      "Ambas murieron en menos de dos velas. Solo un filtro de entrada mas estricto las habria evitado, y ese mismo filtro habria eliminado tambien ganadoras."]]
E.append(tabla(d, [42*mm, 126*mm], align_right_from=99))

E.append(Paragraph("Que medir en las proximas tres semanas", H3))
E.append(Paragraph(
  "El objetivo es llegar a 30 o mas operaciones registrando cuatro variables por cada una: <b>score de entrada</b> "
  "(para comprobar si de verdad predice), <b>sesion</b> (Londres o Nueva York: hoy las dos perdidas fueron de Londres), "
  "<b>si el objetivo fue estructural o 3R completo</b> (el patron mas prometedor) y <b>duracion</b> (para ver si las que "
  "mueren rapido son un tipo distinto de operacion).", BODY))
E.append(Paragraph(
  "En paralelo conviene correr el Probador de Estrategias de MetaTrader con esta misma configuracion Turbo sobre seis "
  "meses de historico con ticks reales. Eso entrega mas de doscientas operaciones en diez minutos en lugar de esperar "
  "meses, y permite decidir con datos y no con impresiones.", BODY))

E.append(Paragraph("Dos ideas para cuando haya datos", H3))
d = [["Idea", "Fundamento", "Estado"],
     ["No abrir en los ultimos 20-30 minutos de cada killzone",
      "Sentido comun de trader, no sobreajuste: una operacion que nace cerca del cierre no tiene tiempo de madurar.",
      "Pendiente de validar"],
     ["Exigir estructura cercana como condicion de entrada",
      "Si en 30 operaciones se confirma que las de objetivo recortado ganan mas, tiene sentido pedirlo como filtro.",
      "Pendiente de validar"]]
E.append(tabla(d, [50*mm, 88*mm, 30*mm], align_right_from=99))

E.append(Spacer(1, 6))
E.append(caja("LA REGLA DE ORO",
  "Lo peor que se puede hacer ahora es toquetear un sistema que va +19.4% en dos dias y se comporta exactamente como "
  "fue disenado. Las perdidas no son fallos: son el coste normal del negocio. Un sistema con 50-60% de acierto y "
  "ganancias mayores que las perdidas es matematicamente rentable, y para que esa ventaja se manifieste hace falta "
  "<b>volumen de operaciones y consistencia</b>, no ajustes constantes.",
  ORO, colors.HexColor("#FDF8E7"), colors.HexColor("#8A6D1F")))

E.append(Spacer(1, 8))
E.append(Paragraph(
  "<i>Documento generado a partir del historial real de la cuenta demo. Los resultados en demo no garantizan resultados "
  "en cuenta real. El trading con apalancamiento puede generar perdidas superiores al deposito.</i>", SMALL))

doc.build(E)
print("PDF generado:", OUT)
