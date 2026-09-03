#!/usr/bin/env python3
"""El estilo de los documentos de Orden Global: paleta, tipos y piezas.

Vive aparte porque lo usan varios documentos. Dos copias de la misma paleta se
separan el día que una cambia, y entonces dos papeles de la misma casa dejan de
parecerse — que es justo lo que un documento de la casa no puede permitirse.

`SALIDA` la pone cada documento; acá no hay ninguna.
"""

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable,
)


# La paleta de la casa: oro sobre tinta. La misma del panel y del correo.
ORO = colors.HexColor('#B08A3E')
ORO_CLARO = colors.HexColor('#F2E9D5')
TINTA = colors.HexColor('#12212A')
GRIS = colors.HexColor('#5C6B75')
LINEA = colors.HexColor('#D8D2C4')
ALERTA = colors.HexColor('#9E3B2E')
VERDE = colors.HexColor('#2F6B4F')
FONDO_SUAVE = colors.HexColor('#FAF7F0')

ANCHO, ALTO = LETTER
MARGEN = 20 * mm

def estilo(nombre, **kw):
    base = dict(fontName='Helvetica', fontSize=10, leading=14.5,
                textColor=TINTA, spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(nombre, **base)

E = {
    'titulo': estilo('titulo', fontName='Helvetica-Bold', fontSize=25, leading=29,
                     textColor=TINTA, spaceAfter=4),
    'subtitulo': estilo('subtitulo', fontSize=13, leading=18, textColor=GRIS, spaceAfter=18),
    'h1': estilo('h1', fontName='Helvetica-Bold', fontSize=15, leading=19,
                 textColor=TINTA, spaceBefore=16, spaceAfter=8),
    'h2': estilo('h2', fontName='Helvetica-Bold', fontSize=11.5, leading=15,
                 textColor=ORO, spaceBefore=12, spaceAfter=5),
    'p': estilo('p', alignment=TA_JUSTIFY),
    'pg': estilo('pg', alignment=TA_JUSTIFY, textColor=GRIS, fontSize=9.4, leading=13.5),
    'li': estilo('li', alignment=TA_JUSTIFY, leftIndent=11, bulletIndent=2, spaceAfter=4),
    'celda': estilo('celda', fontSize=9, leading=12.5, spaceAfter=0),
    'celdaN': estilo('celdaN', fontSize=9, leading=12.5, spaceAfter=0,
                     fontName='Helvetica-Bold'),
    'cab': estilo('cab', fontSize=8.6, leading=11.5, spaceAfter=0,
                  fontName='Helvetica-Bold', textColor=colors.white),
    'pie': estilo('pie', fontSize=8, leading=10, textColor=GRIS),
    'nota': estilo('nota', fontSize=9.2, leading=13, textColor=TINTA),
}

def P(t, s='p'):
    return Paragraph(t, E[s])

def vinetas(items, estilo_item='li'):
    return [Paragraph(t, E[estilo_item], bulletText='•') for t in items]

def tabla(cabeceras, filas, anchos, alineaciones=None):
    datos = [[Paragraph(c, E['cab']) for c in cabeceras]]
    for f in filas:
        datos.append([Paragraph(str(c), E['celda']) for c in f])
    t = Table(datos, colWidths=anchos, repeatRows=1, hAlign='LEFT')
    estilos = [
        ('BACKGROUND', (0, 0), (-1, 0), TINTA),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 1), (-1, -2), 0.4, LINEA),
        ('BOX', (0, 0), (-1, -1), 0.6, LINEA),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, FONDO_SUAVE]),
    ]
    if alineaciones:
        for col, al in alineaciones.items():
            estilos.append(('ALIGN', (col, 0), (col, -1), al))
    t.setStyle(TableStyle(estilos))
    return t

def recuadro(titulo, cuerpo, color=ORO):
    """Un aparte con barra de color. Para lo que no se puede pasar por alto."""
    interior = [Paragraph(f'<b>{titulo}</b>', E['nota']), Spacer(1, 3),
                Paragraph(cuerpo, E['nota'])]
    t = Table([[interior]], colWidths=[ANCHO - 2 * MARGEN])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), FONDO_SUAVE),
        ('LINEBEFORE', (0, 0), (0, -1), 2.6, color),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    return t

def paso(n, titulo, texto):
    """Un paso numerado del circuito. El número en su cuadro, a la izquierda."""
    num = Paragraph(f'<font color="#FFFFFF"><b>{n}</b></font>',
                    ParagraphStyle('n', fontName='Helvetica-Bold', fontSize=12,
                                   leading=15, alignment=TA_CENTER))
    cuerpo = [Paragraph(f'<b>{titulo}</b>', E['nota']), Spacer(1, 2),
              Paragraph(texto, E['pg'])]
    caja = Table([[num]], colWidths=[9 * mm], rowHeights=[9 * mm])
    caja.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), ORO),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    t = Table([[caja, cuerpo]], colWidths=[13 * mm, ANCHO - 2 * MARGEN - 13 * mm])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t

# ── El marco de cada página ──────────────────────────────────────────────────

# Cada documento pone su rótulo y su fecha antes de construir.
ROTULO = ['']
FECHA = ['']

def decorar(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont('Helvetica', 7.6)
        canvas.setFillColor(GRIS)
        canvas.drawString(MARGEN, ALTO - 13 * mm,
                          ROTULO[0])
        canvas.setStrokeColor(LINEA)
        canvas.setLineWidth(0.5)
        canvas.line(MARGEN, ALTO - 15.5 * mm, ANCHO - MARGEN, ALTO - 15.5 * mm)
        canvas.drawRightString(ANCHO - MARGEN, 12 * mm, str(doc.page))
        canvas.drawString(MARGEN, 12 * mm, 'Orden Global Corp  ·  ' + FECHA[0])
    canvas.restoreState()

