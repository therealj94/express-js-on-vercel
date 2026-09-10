#!/usr/bin/env python3
"""Presupuesto operativo para la Junta Directiva de Orden Global — 19-ago-2026.

Fuentes de cada cifra (consultadas en vivo el 19-ago-2026):
  · AWS Cost Explorer  → julio US$523,71; agosto US$327,69 en 18 días
  · API de Heroku      → 5 apps en dyno Basic, sin addons pagos
  · expo.dev/pricing y mongodb.com/pricing
  · tarifario público de Twilio/Meta

Se guarda el GENERADOR, no solo el PDF: el año que viene se corrigen cuatro
números y sale el presupuesto nuevo, en vez de rehacerlo desde cero.

    python3 documentos-junta/generar-presupuesto.py
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '09-Presupuesto-Operativo.pdf')

TINTA   = colors.HexColor('#14121C')
GRIS    = colors.HexColor('#55505F')
GRIS_CL = colors.HexColor('#8C8697')
ORO     = colors.HexColor('#9A7420')
ORO_F   = colors.HexColor('#FBF6E9')
BORDE   = colors.HexColor('#E1DEE8')
FONDO   = colors.HexColor('#F7F6FA')
ROJO    = colors.HexColor('#A8291E')
ROJO_F  = colors.HexColor('#FBEDEB')
VERDE   = colors.HexColor('#1B6E46')
VERDE_F = colors.HexColor('#EDF6F1')

ANCHO = LETTER[0] - 40 * mm


def E(nombre, **kw):
    base = dict(name=nombre, fontName='Helvetica', fontSize=9.6, leading=14.4,
                textColor=TINTA, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(**base)


H1    = E('H1', fontName='Helvetica-Bold', fontSize=21, leading=25, spaceAfter=4)
SUB   = E('SUB', fontSize=10.2, leading=14.8, textColor=GRIS, spaceAfter=13)
H2    = E('H2', fontName='Helvetica-Bold', fontSize=13.4, leading=17,
          spaceBefore=17, spaceAfter=7)
P     = E('P', spaceAfter=7)
PEQ   = E('PEQ', fontSize=8.4, leading=12.2, textColor=GRIS)
CELDA = E('CELDA', fontSize=8.7, leading=12.2)
CELDB = E('CELDB', fontSize=8.7, leading=12.2, fontName='Helvetica-Bold')
CELDR = E('CELDR', fontSize=8.7, leading=12.2, alignment=TA_RIGHT)
CELDRB= E('CELDRB', fontSize=8.7, leading=12.2, alignment=TA_RIGHT,
          fontName='Helvetica-Bold')
ETIQ  = E('ETIQ', fontSize=7.8, leading=10.6, textColor=GRIS_CL,
          fontName='Helvetica-Bold')
CIFRA = E('CIFRA', fontName='Helvetica-Bold', fontSize=17, leading=19)


def regla(color=BORDE, alto=0.7):
    t = Table([['']], colWidths=[ANCHO], rowHeights=[alto])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), color)]))
    return t


def panel(titulo, cuerpo, tono='oro'):
    fondo, borde, tinta = {
        'oro':   (ORO_F, ORO, colors.HexColor('#6B4E10')),
        'rojo':  (ROJO_F, ROJO, colors.HexColor('#7E1F16')),
        'verde': (VERDE_F, VERDE, colors.HexColor('#125133')),
    }[tono]
    est = E('panel', fontSize=9.3, leading=13.6, textColor=tinta)
    dentro = [Paragraph(f'<b>{titulo}</b>', est), Spacer(1, 4)]
    for p in (cuerpo if isinstance(cuerpo, list) else [cuerpo]):
        dentro.append(Paragraph(p, est)); dentro.append(Spacer(1, 3))
    t = Table([[dentro]], colWidths=[ANCHO])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), fondo),
        ('LINEBEFORE', (0, 0), (0, -1), 2.6, borde),
        ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
    ]))
    return t


def tabla(filas, anchos, cabecera=True):
    datos = []
    for i, fila in enumerate(filas):
        cel = []
        for j, v in enumerate(fila):
            es_num = j == len(fila) - 1
            if i == 0 and cabecera:
                cel.append(Paragraph(str(v), ETIQ))
            elif es_num:
                cel.append(Paragraph(str(v), CELDRB if fila[0].startswith('<b>') else CELDR))
            else:
                cel.append(Paragraph(str(v), CELDB if str(v).startswith('<b>') else CELDA))
        datos.append(cel)
    t = Table(datos, colWidths=anchos, repeatRows=1 if cabecera else 0)
    est = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, BORDE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, FONDO]),
    ]
    if cabecera:
        est += [('LINEBELOW', (0, 0), (-1, 0), 1, GRIS_CL)]
    t.setStyle(TableStyle(est))
    return t


def kpis(trios):
    celdas = []
    for etiqueta, valor, nota in trios:
        celdas.append([Paragraph(etiqueta, ETIQ), Spacer(1, 2),
                       Paragraph(valor, CIFRA), Spacer(1, 2), Paragraph(nota, PEQ)])
    t = Table([celdas], colWidths=[ANCHO / len(trios)] * len(trios))
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, -1), FONDO),
        ('BOX', (0, 0), (-1, -1), 0.7, BORDE),
        ('LINEAFTER', (0, 0), (-2, -1), 0.7, BORDE),
        ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    return t


F = []
F.append(Paragraph('Presupuesto operativo del ecosistema', H1))
F.append(Paragraph(
    'Orden Global Corp · Para decisión de la Junta Directiva · 19 de agosto de 2026<br/>'
    'Incluye el desarrollo contratado, la operación actual medida, y lo necesario para llevar '
    'Genesis ID a 50.000 usuarios. Toda cifra tiene fuente; las estimaciones dicen su supuesto.', SUB))
F.append(regla(ORO, 1.4))
F.append(Spacer(1, 12))

F.append(kpis([
    ('PAGO ÚNICO', 'US$ 3.525', 'Nexus coder 3.500 + Google Play 25. Aparte: Apple Developer US$99/año.'),
    ('MENSUAL HOY (MEDIDO)', 'US$ ≈ 807', 'AWS 565 + Heroku 35 + Render 7 + Claude Code 200.'),
    ('MENSUAL A 50.000', 'US$ ≈ 1.320', 'Baja a ≈ 1.177 si la Junta aprueba la depuración de AWS (−143).'),
]))
F.append(Spacer(1, 6))

F.append(Paragraph('1 · Pagos únicos', H2))
F.append(tabla([
    ['Concepto', 'Detalle', 'US$'],
    ['Nexus coder', 'Desarrollo contratado. Monto indicado por la presidencia; conviene atarlo por '
     'escrito a entregables y fechas antes de girar.', '3.500,00'],
    ['Google Play Console', 'Cuota única de la cuenta de desarrollador, necesaria para publicar la app.', '25,00'],
    ['<b>Total único</b>', '', '<b>3.525,00</b>'],
], [38 * mm, ANCHO - 38 * mm - 24 * mm, 24 * mm]))
F.append(Spacer(1, 3))
F.append(Paragraph(
    'Anual, no mensual: Apple Developer Program US$99/año (obligatorio para la App Store) y las '
    'renovaciones de dominios en AWS Registrar (julio facturó US$30; varía por mes según qué dominio vence).', PEQ))

F.append(Paragraph('2 · Operación actual — medida, no estimada', H2))
F.append(Paragraph(
    'AWS sale del Cost Explorer consultado hoy; Heroku, de su API consultada hoy. '
    'Julio cerró en US$523,71 y agosto lleva US$327,69 en 18 días (US$18,20/día → proyección ≈ US$565).', P))
F.append(tabla([
    ['Servicio', 'Qué es', 'US$/mes'],
    ['AWS (total)', 'Los 6 nodos de la cadena (EC2 412 en julio), direcciones IP (41), balanceador (16,72), '
     'Route 53 (4,56), Amplify —la web de Veta Wallet— (2,24). Proyección de agosto al ritmo real.', '≈ 565'],
    ['Heroku', '5 aplicaciones en dyno Basic a US$7: vetawallet (backend billetera), orden-global-scan '
     '(explorador), ordenex-api, mytokenpay-api, ico-back. Sin bases de datos pagas.', '35'],
    ['Render', 'Genesis ID (motor de identidad). Plan Starter; el panel debe confirmarlo — el blueprint '
     'del repositorio aún dice «free», y en free el servicio se duerme.', '7'],
    ['MongoDB Atlas', 'Base de Genesis ID y de los backends. Hoy en nivel gratuito/compartido (a confirmar '
     'en el panel de Atlas).', '0'],
    ['Claude Code', 'Plan de trabajo de ingeniería asistida (monto indicado por la presidencia).', '200'],
    ['<b>Total mensual actual</b>', '', '<b>≈ 807</b>'],
], [30 * mm, ANCHO - 30 * mm - 22 * mm, 22 * mm]))

F.append(Paragraph('3 · Genesis ID a 50.000 usuarios — qué falta y cuánto cuesta', H2))
F.append(Paragraph(
    'El software ya está preparado: la bitácora de auditoría vive en colección propia (el techo '
    'medido pasó de 3.562 a más de 8.000 identidades en el plan mínimo) y las rutas de imágenes '
    'llevan limitador de concurrencia con cola. Lo que falta para 50.000 es infraestructura, '
    'porque cada identidad guarda su selfie y su documento dentro de la base:', P))
F.append(tabla([
    ['Pieza', 'Dimensionamiento', 'US$/mes'],
    ['Render — instancia', 'Subir de Starter (512 MB) a Standard (2 GB, 1 CPU). Con el limitador puesto, '
     '2 GB sostienen el flujo de verificaciones; si una campaña lo desborda, el techo es Pro (4 GB, US$85).', '25'],
    ['MongoDB Atlas M10', 'Clúster dedicado (2 GB RAM). 50.000 identidades con selfie y documento '
     '≈ 75–80 GB de fotos dentro de la base: M10 con almacenamiento ampliado. '
     'Precio de lista consultado hoy: US$58 + almacenamiento.', '≈ 70'],
    ['Rekognition (rostros)', 'Cotejo de cara contra documento: ≈ US$1 por 1.000 imágenes. Supuesto: '
     '5.000 verificaciones nuevas/mes × 4–5 imágenes.', '≈ 25'],
    ['Amplify — tráfico', 'La web a plena escala: supuesto 50.000 visitas/mes × 5 MB ≈ 250 GB × US$0,15. '
     'Hoy cuesta 2,24; crece con el uso real.', '≈ 35'],
    ['Heroku — vetawallet', 'El backend de la billetera de Basic a Standard-1X: más usuarios de Genesis ID '
     'son más sesiones de billetera.', '25 (antes 7)'],
    ['<b>Incremento de esta sección</b>', 'Sobre lo que ya se paga: Render +18, Atlas +70, Rekognition +25, '
     'Amplify +33, Heroku +18.', '<b>≈ +164</b>'],
], [32 * mm, ANCHO - 32 * mm - 24 * mm, 24 * mm]))
F.append(Spacer(1, 4))
F.append(Paragraph(
    'Nota técnica sin costo: mover las fotos de Mongo a S3 cifrado bajaría Atlas a ≈ US$58 y las fotos '
    'costarían ≈ US$2 (80 GB × 0,023). Es trabajo de desarrollo, no de presupuesto; puede encargarse a Nexus.', PEQ))

F.append(Paragraph('4 · Expo EAS — la app de Genesis ID en los teléfonos', H2))
F.append(Paragraph(
    'EAS publica las actualizaciones OTA de la app (las que llegan sin pasar por la tienda). '
    'Se cobra por usuarios activos al mes (MAU). Precios verificados hoy en expo.dev/pricing:', P))
F.append(tabla([
    ['Plan', 'Incluye', 'US$/mes'],
    ['Free (hoy)', '1.000 MAU y 15 builds Android + 15 iOS. Alcanza mientras la app tenga menos de 1.000 usuarios activos.', '0'],
    ['Starter', '3.000 MAU, US$45 en builds, cola prioritaria. El paso correcto al crecer.', '19'],
    ['Production', '50.000 MAU, US$225 en builds, 2 builds simultáneos. El plan que corresponde a la meta.', '199'],
], [26 * mm, ANCHO - 26 * mm - 20 * mm, 20 * mm]))
F.append(Spacer(1, 4))
F.append(panel('Recomendación', 'Pasar a Starter (US$19) ya, y saltar a Production (US$199) solo cuando la app '
               'cruce 3.000 usuarios activos. Pagar los 199 desde hoy sería pagar capacidad vacía; el presupuesto '
               'a plena escala sí los incluye.', 'verde'))

F.append(Paragraph('5 · WhatsApp Business por Twilio — número canadiense', H2))
F.append(tabla([
    ['Concepto', 'Tarifa', 'US$/mes'],
    ['Número local de Canadá', 'US$1,15/mes (tarifario Twilio).', '1,15'],
    ['Mensajes', 'Twilio cobra US$0,005 por mensaje (ida y vuelta) + la plantilla de Meta: marketing '
     '≈ US$0,06 por mensaje en la región; las respuestas de servicio dentro de la ventana de 24 h '
     'no pagan plantilla desde julio de 2025.', 'según volumen'],
    ['Supuesto de campaña', '2.000 plantillas de marketing/mes × ≈ 0,065 ≈ 130. Se presupuesta con margen.', '≈ 150'],
], [34 * mm, ANCHO - 34 * mm - 24 * mm, 24 * mm]))
F.append(Spacer(1, 4))
F.append(Paragraph(
    'Requisito sin costo: la verificación del negocio en Meta Business Manager (documentos de Orden Global '
    'Corp). Sin ella el número queda limitado en volumen de plantillas.', PEQ))

F.append(Paragraph('6 · Depuración de AWS — ahorro que espera la firma de la Junta', H2))
F.append(tabla([
    ['Decisión pendiente', 'Detalle', 'Ahorro/mes'],
    ['Retirar nodos 1 y 2', 'Los únicos exclusivos de la cadena vieja. Desde que se decidió retirarlos '
     'se llevan gastados US$1.715.', '−138,00'],
    ['Apagar ORDENEX', 'Máquina parada 29 meses en la región oeste; US$140 ya gastados en nada.', '−4,75'],
    ['Balanceador OrdenKapital', 'SE QUEDA: desde el 19 de agosto sirve la redirección de vetawallet.com '
     '(el enlace impreso en la campaña del sorteo).', '0'],
    ['<b>Ahorro al aprobar</b>', '', '<b>−142,75</b>'],
], [34 * mm, ANCHO - 34 * mm - 24 * mm, 24 * mm]))

F.append(Paragraph('7 · El cuadro completo', H2))
F.append(tabla([
    ['Escenario', 'Composición', 'US$/mes'],
    ['Hoy', 'AWS 565 + Heroku 35 + Render 7 + Atlas 0 + Claude Code 200', '≈ 807'],
    ['Camino a 50.000 (fase 1)', 'Hoy + Render 25 + Atlas M10 70 + Rekognition 25 + EAS Starter 19 + '
     'Twilio 150 + Heroku 25', '≈ 1.104'],
    ['Plena escala (50.000)', 'Fase 1 + EAS Production (199 en vez de 19) + Amplify a tráfico pleno (35)', '≈ 1.320'],
    ['<b>Plena escala con depuración</b>', 'Aprobando la sección 6 (−142,75)', '<b>≈ 1.177</b>'],
], [40 * mm, ANCHO - 40 * mm - 24 * mm, 24 * mm]))
F.append(Spacer(1, 6))
F.append(panel('Para girar este mes', [
    'Único: US$3.525 (Nexus 3.500 + Google Play 25) + US$99 de Apple Developer (anual).',
    'Mensual desde ya: ≈ US$807 actuales + Render Standard, Atlas M10, EAS Starter y Twilio '
    '≈ US$1.100/mes en fase 1.',
    'La Junta puede compensar casi todo el incremento aprobando la depuración de la sección 6: '
    'US$142,75/mes que hoy se pagan por máquinas sin destino.',
]))
F.append(Spacer(1, 8))
F.append(regla())
F.append(Spacer(1, 4))
F.append(Paragraph(
    'Fuentes: AWS Cost Explorer (consulta en vivo, 19-ago-2026: julio US$523,71; agosto US$327,69 en 18 días) · '
    'API de Heroku (formación real de dynos, 19-ago) · expo.dev/pricing y mongodb.com/pricing (consultados '
    '19-ago) · tarifario público Twilio/Meta (por-mensaje 0,005 + plantilla; ventana 24 h sin plantilla desde '
    'jul-2025) · parte del contador de la nube del 14-ago (ritmo diario y desperdicio con antigüedad). '
    'Los montos de Nexus coder (3.500) y Claude Code (200) los fija la presidencia. '
    'Tipos de cambio no aplican: todo en dólares estadounidenses.', PEQ))


def pie(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(GRIS_CL)
    canvas.drawString(20 * mm, 12 * mm, 'Orden Global Corp · Presupuesto operativo · 19 de agosto de 2026')
    canvas.drawRightString(LETTER[0] - 20 * mm, 12 * mm, f'Página {doc.page}')
    canvas.restoreState()


doc = BaseDocTemplate(SALIDA, pagesize=LETTER,
                      leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=18 * mm, bottomMargin=20 * mm,
                      title='Orden Global — Presupuesto operativo 2026',
                      author='Orden Global Corp')
marco = Frame(20 * mm, 20 * mm, LETTER[0] - 40 * mm, LETTER[1] - 38 * mm, id='m')
doc.addPageTemplates([PageTemplate(id='p', frames=[marco], onPage=pie)])
doc.build(F)
print('PDF listo:', SALIDA)
