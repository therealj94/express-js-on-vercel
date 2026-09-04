#!/usr/bin/env python3
"""El plan del depósito con dirección provisional, en diseño y en funcionamiento.

José eligió la forma: la persona deposita en una dirección provisional propia y
de ahí el dinero se junta solo en UNA billetera de Ordenex. Este documento es el
plan de esa decisión — no vuelve a abrir la comparación de opciones, que está en
`ordenex-opciones-cash-in-out.pdf`.

Va en dos mitades porque las dos hacen falta y se suelen escribir por separado,
que es como salen las cosas que funcionan y nadie usa, o las que se ven muy bien
y no se pueden construir:

  · DISEÑO — lo que la persona ve, en el orden en que lo ve, con las palabras
    que va a leer. Las pantallas están escritas, no descritas.
  · FUNCIONAMIENTO — el vigía, el barrido, el gas y los fallos.

Lo que dice sobre el código de Ordenex está comprobado contra el repositorio, no
recordado: qué existe ya (la dirección por usuario, el vigía de la 5550, el
barrido manual del panel, el vigía de compras de Polygon y BSC) y qué falta.
"""

import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, HRFlowable,
)

from marca_pdf import (
    ORO, TINTA, GRIS, LINEA, ALERTA, VERDE, ANCHO, ALTO, MARGEN,
    E, P, vinetas, tabla, recuadro, paso, pantalla, lado_a_lado, decorar,
    ROTULO, FECHA,
)

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, 'ordenex-deposito-provisional.pdf')

ROTULO[0] = 'ORDENEX  ·  Depósito con dirección provisional  ·  Diseño y construcción'
FECHA[0] = '4 de septiembre de 2026'


def construir():
    doc = BaseDocTemplate(SALIDA, pagesize=LETTER,
                          leftMargin=MARGEN, rightMargin=MARGEN,
                          topMargin=22 * mm, bottomMargin=20 * mm,
                          title='Ordenex · Depósito con dirección provisional',
                          author='Orden Global Corp',
                          subject='Plan de diseño y construcción')
    marco = Frame(MARGEN, 20 * mm, ANCHO - 2 * MARGEN, ALTO - 42 * mm, id='cuerpo')
    doc.addPageTemplates([PageTemplate(id='normal', frames=[marco], onPage=decorar)])

    h = []
    au = ANCHO - 2 * MARGEN

    # ── Portada ──────────────────────────────────────────────────────────────
    h.append(Spacer(1, 26 * mm))
    h.append(Paragraph('ORDENEX', ParagraphStyle(
        'marca', fontName='Helvetica-Bold', fontSize=11, leading=13,
        textColor=ORO, spaceAfter=10)))
    h.append(P('El depósito con dirección provisional<br/>Plan de diseño y construcción', 'titulo'))
    h.append(HRFlowable(width='30%', thickness=2, color=ORO, spaceBefore=10,
                        spaceAfter=12, hAlign='LEFT'))
    h.append(P('Cada persona deposita en una dirección propia. El dinero se junta '
               'solo en una sola billetera de Ordenex.', 'subtitulo'))
    h.append(Spacer(1, 5 * mm))
    h.append(recuadro(
        'Qué es este documento',
        'La decisión ya está tomada y este papel no la vuelve a abrir. Es el plan de '
        'construirla, en sus dos mitades: <b>el diseño</b> — lo que la persona ve, con las '
        'palabras que va a leer, pantalla por pantalla — y <b>el funcionamiento</b> — el '
        'vigía, el barrido, el gas y qué pasa cuando algo falla.<br/><br/>'
        'Buena parte ya está construida. La página 12 dice exactamente qué existe y qué '
        'falta, comprobado contra el repositorio y no de memoria.'))
    h.append(Spacer(1, 6 * mm))
    h.append(P('Costos de red y precio del oro medidos contra Ethereum, Polygon y BNB Smart '
               'Chain el 3 de septiembre de 2026. Estado del código comprobado el 4.', 'pg'))
    h.append(PageBreak())

    # ── 1 · El resumen ───────────────────────────────────────────────────────
    h.append(P('1 · Lo que se construye, en una página', 'h1'))
    h.append(P(
        'Cada persona recibe <b>su propia dirección</b> para depositar. La cadena registra '
        'quién mandó qué sin que nadie tenga que pegar un comprobante, y unos minutos '
        'después un proceso mueve ese dinero a <b>una sola billetera</b>, que es donde vive '
        'la liquidez de Ordenex y donde se mira el saldo.'))
    h.append(Spacer(1, 4))
    h.append(P('Las dos cosas que esto resuelve a la vez', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>La persona no pega nada.</b> Manda a su dirección y ya. El paso de copiar un '
        'identificador de transacción y pegarlo en una casilla es donde se pierde la gente, '
        'y desaparece entero.',
        '<b>La casa mira un solo saldo.</b> Pasados unos minutos todo está junto. El panel '
        'enseña un número, no una lista de direcciones.',
    ]):
        h.append(x)
    h.append(Spacer(1, 6))
    h.append(P('Y la cosa que hay que entender bien', 'h2'))
    h.append(P(
        'La dirección provisional es <b>un buzón, no una caja fuerte</b>. El dinero está ahí '
        'los minutos que tarda el barrido. Lo que en cualquier momento está repartido es lo '
        'que entró en los últimos minutos; el resto está junto. «Una dirección por persona» '
        'no significa mil bóvedas que cuidar, igual que un banco no guarda la plata en una '
        'caja distinta por cada número de cuenta.'))
    h.append(Spacer(1, 6))
    h.append(recuadro(
        'Y ninguna llave que guardar',
        'Hoy Ordenex crea una billetera al azar por persona y guarda <b>su llave privada '
        'cifrada</b> en la base de datos. Funciona, pero son mil secretos. Con derivación '
        'determinista la dirección de la persona se <b>calcula</b> a partir de una sola '
        'semilla más su número, y en la base <b>no queda ninguna llave</b>: queda un número. '
        'Es la página 4, y es el cambio más importante de todo el plan.',
        VERDE))
    h.append(PageBreak())

    # ── 2 · La forma del dinero ──────────────────────────────────────────────
    h.append(P('2 · Las paradas del dinero', 'h1'))
    h.append(P(
        'Tres paradas en la entrada, y en ninguna de ellas el dinero es de Orden Global.', 'pg'))
    h.append(Spacer(1, 6))
    h.append(tabla(
        ['Parada', 'Dónde', 'Cuánto tiempo', 'De quién es'],
        [
            ['1 · Fuera', 'El exchange o la billetera de la persona.', 'Lo que ella quiera',
             'De la persona'],
            ['2 · Provisional', 'Su dirección de depósito, en Polygon, BSC o Ethereum.',
             '<b>Minutos</b>', '<b>De Ordenex</b>, desde que llega'],
            ['3 · Única', 'La billetera de Ordenex. La misma dirección en las tres redes.',
             'Hasta que se use', 'De Ordenex'],
        ],
        [26 * mm, 62 * mm, 26 * mm, au - 114 * mm]))
    h.append(Spacer(1, 8))
    h.append(P('Las billeteras de la casa', 'h2'))
    h.append(P(
        'Cuatro llaves, y conviene que sean cuatro de verdad. Juntarlas ahorra un trámite hoy '
        'y multiplica el daño el día que una se pierda.', 'pg'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Llave', 'Qué firma', 'Qué pasa si se pierde'],
        [
            ['<b>Semilla de depósitos</b>', 'El barrido de las direcciones provisionales.',
             'Se pierde lo que esté sin barrer en ese momento — minutos de depósitos.'],
            ['<b>Billetera única</b>', 'Los retiros. Guarda la liquidez en USDT.',
             'Se pierde el fondo. Es la que va con más cuidado, y la que puede ir a firma '
             'de dos personas.'],
            ['<b>Billetera de gas</b>', 'Fondea cada dirección para poder barrerla.',
             'Casi nada: lleva monedas sueltas y se repone.'],
            ['<b>Billetera ORIGEN</b>', 'Entrega el ORIGEN comprado, en la cadena 5550.',
             'Se para la entrega hasta reponerla. No se pierde el USDT.'],
        ],
        [36 * mm, 58 * mm, au - 94 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'La que aguanta el ataque es la semilla, no la billetera única',
        'La billetera única puede vivir con firma de dos personas y estar casi siempre '
        'quieta. La semilla, en cambio, tiene que firmar sola cada pocos minutos, así que no '
        'puede pedir firma humana. Por eso el diseño la deja <b>valiendo poco</b>: si el '
        'barrido va rápido, lo que esa llave protege en cualquier instante son los depósitos '
        'de los últimos minutos, no el fondo.'))
    h.append(PageBreak())

    # ── 3 · La derivación ────────────────────────────────────────────────────
    h.append(P('3 · Cómo nace la dirección provisional', 'h1'))
    h.append(P(
        'Hoy Ordenex hace esto en <font face="Courier">controllers/portafolioController.js</font>: '
        'la primera vez que alguien abre su portafolio, crea una billetera al azar con '
        '<font face="Courier">Wallet.createRandom()</font>, cifra la llave privada con '
        '<font face="Courier">ORDENEX_ADM</font> y la guarda en el campo '
        '<font face="Courier">llaveDepositoCifrada</font>. Se hace perezoso, y eso ya está '
        'bien pensado: no se generan quince mil llaves que nadie pidió.'))
    h.append(P(
        'El problema no es cuándo se crean, sino que se <b>guarden</b>.'))
    h.append(Spacer(1, 6))
    h.append(lado_a_lado(
        pantalla('HOY · una llave por persona en la base', [
            ('rotulo', 'usuario 347'),
            ('texto', 'direccionDeposito: 0x8f2a…'),
            ('texto', 'llaveDepositoCifrada: «U2FsdGVk…»'),
            ('sep', ''),
            ('nota', 'Mil usuarios son mil llaves cifradas guardadas. Un volcado de la '
                     'base es un volcado de mil buzones — cifrados, pero ahí.'),
        ], ancho=au * 0.5 - 8),
        pantalla('PROPUESTO · un número por persona', [
            ('rotulo', 'usuario 347'),
            ('texto', 'direccionDeposito: 0x8f2a…'),
            ('texto', 'indiceDeposito: 347'),
            ('sep', ''),
            ('nota', 'La llave no se guarda: se calcula cuando hace falta firmar, a partir '
                     'de la semilla y del 347. En la base no hay ninguna.'),
        ], ancho=au * 0.5 - 8)))
    h.append(Spacer(1, 8))
    h.append(P('Qué se gana, exactamente', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>Un solo secreto en vez de miles.</b> Se protege una semilla, no una base entera.',
        '<b>La base deja de ser un objetivo.</b> Quien se lleve un volcado de Mongo se lleva '
        'números que no abren nada.',
        '<b>Las direcciones se pueden regenerar.</b> Si mañana hay que reconstruir el '
        'servicio desde cero, con la semilla vuelven todas, en orden y sin haber guardado '
        'ninguna.',
        '<b>La misma dirección sirve en las tres redes.</b> Polygon, BSC y Ethereum comparten '
        'el formato: una derivación, tres redes, y a la persona se le enseña una sola '
        'dirección.',
    ]):
        h.append(x)
    h.append(Spacer(1, 6))
    h.append(recuadro(
        'Lo que hay que respetar al cambiarlo',
        'Los usuarios que ya tengan dirección creada <b>se quedan con la suya</b>. No se les '
        'cambia: alguien pudo haberla guardado en su exchange como destino frecuente, y una '
        'dirección que cambia sin avisar es dinero que llega a un buzón que ya nadie mira. '
        'El campo viejo sigue funcionando para ellos; el nuevo aplica de ahí en adelante. Las '
        'dos formas conviven, y el barrido sabe cuál usar para cada uno.',
        ALERTA))
    h.append(PageBreak())

    # ── 4 · DISEÑO · la pantalla de depósito ─────────────────────────────────
    h.append(P('4 · Diseño · La pantalla de depósito', 'h1'))
    h.append(P(
        'Dos momentos, y el segundo no aparece hasta que el primero está resuelto. Enseñar la '
        'dirección antes de que la persona haya dicho cuánto quiere meter es invitarla a '
        'mandar sin orden — y un depósito sin orden no tiene precio congelado.', 'pg'))
    h.append(Spacer(1, 6))
    h.append(lado_a_lado(
        pantalla('PRIMERO · la calculadora', [
            ('rotulo', 'quiero depositar'),
            ('dato', '100 USDT'),
            ('rotulo', 'por la red'),
            ('texto', 'Polygon &nbsp;·&nbsp; BNB Chain &nbsp;·&nbsp; Ethereum'),
            ('sep', ''),
            ('rotulo', 'vas a recibir'),
            ('dato', '38.07 ORIGEN'),
            ('nota', 'A $2.6264 por ORIGEN, comisión ya descontada.'),
            ('boton', 'Congelar este precio'),
            ('nota', 'El precio te queda fijo 30 minutos.'),
        ], ancho=au * 0.5 - 8),
        pantalla('DESPUÉS · la dirección', [
            ('rotulo', 'mandá exactamente'),
            ('dato', '100 USDT'),
            ('rotulo', 'por polygon · y solo por polygon'),
            ('texto', '<font face="Courier" size="8">0x8f2a4c…9d1e</font>'),
            ('nota', '[ código QR ]&nbsp;&nbsp;&nbsp;[ Copiar ]'),
            ('sep', ''),
            ('rotulo', 'te quedan'),
            ('dato', '29:14'),
            ('nota', 'Recibís 38.07 ORIGEN. Si el tiempo se acaba antes de que llegue, '
                     'se recalcula al precio de ese momento y te avisamos antes.'),
        ], ancho=au * 0.5 - 8)))
    h.append(Spacer(1, 8))
    h.append(P('Las decisiones de diseño que hay detrás', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>El número grande es el que le importa.</b> Lo que va a recibir, no lo que va a '
        'mandar. La comisión ya está descontada ahí: no hay una letra chica que reste después.',
        '<b>La red se elige antes de ver la dirección</b>, y la dirección se enseña con el '
        'nombre de la red encima. Es la misma en las tres, pero enseñarla sin decir cuál '
        'invita al error que más caro sale.',
        '<b>El reloj es un dato, no un adorno.</b> Y lo que pasa cuando llega a cero está '
        'escrito ahí mismo, en la pantalla, antes de que pase — no en unos términos que nadie '
        'abre.',
        '<b>Un botón por pantalla.</b> Congelar, después copiar. La persona nunca tiene dos '
        'acciones compitiendo.',
    ]):
        h.append(x)
    h.append(PageBreak())

    # ── 5 · DISEÑO · los estados ─────────────────────────────────────────────
    h.append(P('5 · Diseño · Los cuatro estados, y cómo se ven', 'h1'))
    h.append(P(
        'Entre que la persona manda el dinero y ve su ORIGEN pasan unos minutos. Esos minutos '
        'son donde se pierde la confianza, así que cada uno tiene una pantalla que dice algo '
        'distinto y verdadero. <b>Nunca una barra girando sin texto.</b>', 'pg'))
    h.append(Spacer(1, 6))
    h.append(tabla(
        ['Estado', 'Qué pasó de verdad', 'Qué dice la pantalla', 'Cuánto dura'],
        [
            ['<b>Esperando</b>', 'La orden existe, no ha llegado nada.',
             '«Esperando tu depósito» y el reloj del precio.', 'Lo que tarde'],
            ['<b>Visto</b>', 'El vigía vio el dinero en la dirección.',
             '«Recibimos tus 100 USDT. Confirmando en la red.»', 'Segundos'],
            ['<b>Confirmado</b>', 'Hay confirmaciones de sobra: no se deshace.',
             '«Confirmado. Entregando tu ORIGEN.»', '1–2 minutos'],
            ['<b>Acreditado</b>', 'El ORIGEN salió a su Veta Wallet.',
             '«Listo. 38.07 ORIGEN en tu billetera» + el enlace a OrdenScan.', 'Final'],
        ],
        [24 * mm, 46 * mm, 62 * mm, au - 132 * mm]))
    h.append(Spacer(1, 8))
    h.append(P('El momento «visto» es el que hay que cuidar', 'h2'))
    h.append(P(
        'Es el primero en que la casa puede decirle algo que ella no sabía. Ahí es donde el '
        'depósito deja de ser un acto de fe.'))
    h.append(Spacer(1, 4))
    h.append(pantalla('AVISO · en cuanto el vigía ve el dinero', [
        ('rotulo', 'recibido'),
        ('dato', '100 USDT'),
        ('texto', 'Lo vimos llegar a tu dirección en Polygon.'),
        ('nota', 'Estamos esperando las confirmaciones de la red. Un par de minutos.'),
        ('sep', ''),
        ('nota', 'Vas a recibir <b>38.07 ORIGEN</b> al precio que congelaste. '
                 'Te avisamos cuando esté en tu Veta Wallet.'),
    ], ancho=au * 0.62))
    h.append(Spacer(1, 6))
    h.append(P(
        'Ese aviso sale por donde la persona esté: la pantalla si la tiene abierta, y la '
        'notificación del teléfono si la cerró. El aviso de «acreditado» siempre sale, aunque '
        'no haya nadie mirando.', 'pg'))
    h.append(PageBreak())

    # ── 6 · DISEÑO · los errores caros ───────────────────────────────────────
    h.append(P('6 · Diseño · Los tres errores caros, y cómo se evitan', 'h1'))
    h.append(P(
        'No son fallos del sistema: son cosas que la persona puede hacer y que cuestan '
        'dinero. El diseño existe sobre todo para estos tres.', 'pg'))
    h.append(Spacer(1, 6))

    h.append(P('Uno · Mandar por la red equivocada', 'h2'))
    h.append(P(
        'El más caro de todos. TRON es la red donde más USDT se mueve y la más barata, y '
        '<b>no es de esta familia</b>: la dirección de la persona no existe ahí. Lo que se '
        'mande por TRC20 no llega a ningún sitio recuperable.'))
    h.append(P(
        'Por eso no va como advertencia legal al pie, que nadie lee, sino <b>en rojo, arriba '
        'de la dirección, con el nombre de la red repetido</b>. Y si la persona eligió '
        'Polygon, la pantalla dice Polygon tres veces: en el rótulo, junto a la dirección y '
        'debajo del código QR.', 'pg'))
    h.append(Spacer(1, 5))

    h.append(P('Dos · Mandar un monto distinto al de la orden', 'h2'))
    h.append(P(
        'Pasa siempre, y no siempre es error: el exchange cobra su comisión de retiro y llegan '
        '99.2 en vez de 100. <b>Se acredita lo que llegó</b>, al precio congelado, y se dice '
        'con todas las letras. Rechazar un depósito por 80 centavos es la clase de rigor que '
        'no protege a nadie y hace perder un cliente.'))
    h.append(P(
        'Si llega <b>de más</b>, se acredita de más, al mismo precio, mientras quepa en el '
        'límite de la orden. Si llega mucho de más, se acredita hasta el límite y el resto '
        'queda como saldo a favor con aviso — nunca se retiene en silencio.', 'pg'))
    h.append(Spacer(1, 5))

    h.append(P('Tres · Que se venza el precio congelado', 'h2'))
    h.append(P(
        'Treinta minutos y el dinero no llegó. No se puede sostener un precio para siempre '
        '—de eso se trata congelarlo— pero tampoco se le puede cambiar el precio a alguien '
        'sin avisarle.'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Cuándo llega', 'Qué precio se le da', 'Qué se le dice'],
        [
            ['Dentro del plazo', 'El congelado. Sin excepción.', 'Nada: es lo prometido.'],
            ['Vencido, pero el precio le favorece o da igual',
             'El congelado, igual.', '«Llegó tarde y te lo respetamos.»'],
            ['Vencido y el precio se movió en contra',
             'El del momento en que llegó.',
             'Se le dice <b>antes</b> de entregar, con los dos números a la vista.'],
        ],
        [40 * mm, 52 * mm, au - 92 * mm]))
    h.append(Spacer(1, 6))
    h.append(recuadro(
        'La regla que resume las tres',
        'La casa nunca gana por el descuido de la persona. Cuando el error le sale a favor a '
        'Ordenex, se corrige a favor de ella; cuando le sale en contra a Ordenex y es chico, '
        'lo absorbe la casa. Eso cuesta algo y compra lo único que un servicio de dinero no '
        'puede comprar de otra manera.'))
    h.append(PageBreak())

    # ── 7 · FUNCIONAMIENTO · el vigía ────────────────────────────────────────
    h.append(P('7 · Funcionamiento · El vigía multicadena', 'h1'))
    h.append(P(
        'Ordenex ya tiene un vigía de depósitos: <font face="Courier">lib/vigia.js</font>, que '
        'cada 30 segundos compara el saldo real de cada dirección con la última marca que '
        'vio, y acredita la diferencia. Está bien hecho y sus dos promesas son las correctas: '
        '<b>nunca acredita si la lectura falló</b> —una lectura a medias no se convierte en un '
        'saldo a medias— y <b>nunca acredita dos veces</b>.'))
    h.append(P(
        'Solo tiene un límite: <b>mira únicamente la cadena 5550</b>. Lo que falta no es un '
        'vigía nuevo, es enseñarle a mirar tres cadenas más.'))
    h.append(Spacer(1, 6))
    h.append(tabla(
        ['Red', 'Confirmaciones', 'Es decir', 'Por qué esa cifra'],
        [
            ['Polygon', '60 bloques', '~2 minutos',
             'Reorganiza poco, pero lo hace. Ya es el número que usa el vigía de compras.'],
            ['BNB Smart Chain', '30 bloques', '~1.5 minutos',
             'Bloques de 3 segundos y reorganizaciones cortas.'],
            ['Ethereum', '2 épocas', '~13 minutos',
             'Hasta que el bloque es final de verdad. Es lenta, y hay que decirlo en la '
             'pantalla.'],
        ],
        [34 * mm, 26 * mm, 24 * mm, au - 84 * mm]))
    h.append(Spacer(1, 8))
    h.append(P('Lo que hay que copiar del vigía de compras', 'h2'))
    h.append(P(
        '<font face="Courier">lib/vigiaCompras.js</font> ya resuelve para Polygon y BSC los '
        'problemas exactos que este vigía va a tener, y la solución no hay que inventarla:', 'pg'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>Contra acreditar dos veces:</b> la identidad de un depósito es (cadena, hash, '
        'índice del log) con un <b>índice único en Mongo</b>, y la fila se crea antes de '
        'acreditar. La guarda es de la base, no un <font face="Courier">if</font> en memoria — '
        'un <font face="Courier">if</font> no sobrevive a dos procesos corriendo a la vez.',
        '<b>Contra acreditar algo que se deshizo:</b> no se mira la punta de la cadena sino lo '
        'que ya tiene confirmaciones, y antes de acreditar se vuelve a pedir el recibo para '
        'comprobar que sigue ahí.',
        '<b>Contra las caídas de un proveedor:</b> varias direcciones de RPC por red, en '
        'orden, con la de pago primero.',
    ]):
        h.append(x)
    h.append(Spacer(1, 5))
    h.append(recuadro(
        'Una diferencia que sí importa',
        'El vigía de la 5550 funciona por <b>marca de agua</b> —compara saldos— y eso sirve '
        'cuando la dirección solo recibe. En las cadenas de fuera hay que ir por '
        '<b>eventos Transfer</b>, no por saldo: el barrido baja el saldo constantemente, y un '
        'depósito que llegue justo entre el barrido y el siguiente sondeo se perdería. Con '
        'eventos, cada llegada tiene su propia identidad y ninguna depende de cuándo se miró.',
        ALERTA))
    h.append(PageBreak())

    # ── 8 · FUNCIONAMIENTO · el barrido ──────────────────────────────────────
    h.append(P('8 · Funcionamiento · El barrido automático', 'h1'))
    h.append(P(
        'Ordenex ya tiene <font face="Courier">POST /admin/barrer</font>, y el comentario del '
        'código dice que es manual y de admin <b>a propósito</b> en la primera versión. Fue la '
        'decisión correcta para empezar. Automatizarlo es lo que este plan agrega, y conviene '
        'hacerlo sabiendo qué se está aceptando a cambio.'))
    h.append(Spacer(1, 5))
    h.append(paso(1, 'Elegir a quién barrer',
        'No se recorren todas las direcciones: solo las que el vigía marcó con saldo. Con '
        'quince mil usuarios, recorrerlas todas cada vuelta son quince mil consultas para '
        'encontrar tres depósitos.'))
    h.append(paso(2, 'Comprobar que hay gas, y mandarlo si no',
        'Una dirección con USDT y sin moneda nativa no puede mover nada. La billetera de gas '
        'le manda lo justo para una transferencia, calculado al precio del momento y con '
        'margen. Este paso es el que más falla y el que más silenciosamente para todo.'))
    h.append(paso(3, 'Mover el USDT entero',
        'Todo el saldo, de una vez, a la billetera única. Nunca «lo que se pueda»: un barrido '
        'a medias deja polvo en mil direcciones que después cuesta más recoger que lo que vale.'))
    h.append(paso(4, 'Anotar, y volver a mirar',
        'La transferencia se anota con su hash. Si el proceso se muere entre firmar y anotar, '
        'la vuelta siguiente ve una dirección con saldo cero y una anotación pendiente, y '
        'cierra el círculo mirando la cadena — no adivinando.'))
    h.append(Spacer(1, 4))
    h.append(P('Cada cuánto, y cuánto cuesta', 'h2'))
    h.append(Spacer(1, 2))
    h.append(tabla(
        ['Red', 'Costo de un barrido', 'Con la red congestionada', 'Cada cuánto conviene'],
        [
            ['Polygon', '$0.006', '$0.179 (30×)', 'Cada 2 minutos'],
            ['BNB Smart Chain', '$0.003', 'Poco variable', 'Cada 2 minutos'],
            ['Ethereum', '$0.08', 'Mucho más en horas malas',
             'Por umbral: solo si pasa de cierto monto, o una vez al día'],
        ],
        [34 * mm, 34 * mm, 40 * mm, au - 108 * mm]))
    h.append(Spacer(1, 6))
    h.append(recuadro(
        'La regla del umbral, y por qué Ethereum va aparte',
        'Barrer $4 en Ethereum cuesta $0.08 — un 2% del depósito, más que la comisión entera. '
        'Por eso el barrido no corre por reloj sino <b>por umbral</b>: se barre cuando el '
        'saldo justifica el gas. En Polygon y BSC el umbral es tan bajo que en la práctica se '
        'barre siempre; en Ethereum hay que ponerlo de verdad y aceptar que el dinero pequeño '
        'espera a juntarse. Es una cifra que se decide con números, no una opinión: el barrido '
        'no debería costar más del 1% de lo que mueve.'))
    h.append(PageBreak())

    # ── 9 · Los decimales ────────────────────────────────────────────────────
    h.append(P('9 · La trampa de los decimales', 'h1'))
    h.append(P(
        'Esta es la clase de cosa que no se ve en una prueba y aparece en producción con el '
        'dinero de alguien. USDT <b>no usa los mismos decimales en todas las cadenas</b>, y '
        'yo lo comprobé leyendo cada contrato, no de memoria:'))
    h.append(Spacer(1, 5))
    h.append(tabla(
        ['Red', 'Contrato de USDT', 'Decimales', '100 USDT se escriben'],
        [
            ['Polygon', '<font face="Courier" size="7">0xc2132D05…04B58e8F</font>', '<b>6</b>',
             '100000000'],
            ['BNB Smart Chain', '<font face="Courier" size="7">0x55d39832…B3197955</font>',
             '<b>18</b>', '100000000000000000000'],
            ['Ethereum', '<font face="Courier" size="7">0xdAC17F95…13D831ec7</font>', '<b>6</b>',
             '100000000'],
        ],
        [34 * mm, 54 * mm, 22 * mm, au - 110 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Qué pasa exactamente si se ignora',
        'El libro de Ordenex asume 18 decimales para todo. Un depósito de <b>100 USDT en '
        'Polygon</b> leído como si fueran 18 decimales se acredita como '
        '<b>0.0000000001 USDT</b>. La persona depositó cien dólares y ve una millonésima. '
        'En el otro sentido —si alguna cuenta se hace al revés— se acreditarían cien billones, '
        'y ese error no se recupera. No es un detalle de precisión: es la diferencia entre '
        'que el sistema funcione y que no.',
        ALERTA))
    h.append(Spacer(1, 6))
    h.append(P('Cómo se evita, y de una forma que no se pueda olvidar', 'h2'))
    h.append(P(
        'Los decimales <b>no se escriben a mano en ningún sitio</b>. Se leen del contrato al '
        'arrancar, con <font face="Courier">decimals()</font>, se guardan en memoria y se '
        'comprueban contra lo que se esperaba. Si un contrato dice algo distinto de lo que la '
        'tabla espera, el servicio <b>no arranca</b> y lo canta en el log.'))
    h.append(P(
        'Puede sonar duro que no arranque. Es lo correcto: un servicio de dinero que arranca '
        'con una duda sobre las unidades es peor que uno que no arranca, porque el que no '
        'arranca se ve enseguida y el otro se ve tres días después, en los libros.', 'pg'))
    h.append(PageBreak())

    # ── 10 · Lo que puede salir mal ──────────────────────────────────────────
    h.append(P('10 · Lo que puede salir mal, y qué pasa entonces', 'h1'))
    h.append(P(
        'Un plan que solo describe el camino bueno no es un plan. Estos son los fallos que '
        'este diseño puede tener, con lo que hace el sistema en cada uno.', 'pg'))
    h.append(Spacer(1, 6))
    h.append(tabla(
        ['Qué falla', 'Qué se ve desde fuera', 'Qué hace el sistema'],
        [
            ['La billetera de gas se queda seca',
             'Los depósitos se acreditan, pero no se juntan. El saldo único deja de subir.',
             'Alarma <b>antes</b> de quedarse seca, por saldo mínimo. Los depósitos siguen '
             'acreditándose: el vigía no depende del barrido.'],
            ['Un RPC se cae o miente',
             'Nada. Y eso es lo correcto.',
             'La lectura falla entera, no a medias, y esa dirección se salta hasta la vuelta '
             'siguiente. Varias direcciones de RPC por red.'],
            ['El barrido falla a mitad',
             'Nada.',
             'El dinero se queda en la provisional, que sigue siendo de Ordenex. Se reintenta. '
             'No se pierde: se retrasa.'],
            ['Dos procesos barren a la vez',
             'Nada.',
             'La segunda transacción falla sola —el saldo ya no está— y el índice único impide '
             'la doble anotación.'],
            ['Llega un token que no es USDT',
             'Nada, para esa persona.',
             'No se acredita <b>nunca</b>. Queda quieto y se avisa. Acreditar un token '
             'desconocido por su nombre es como se roba a un exchange.'],
            ['Alguien manda por TRON',
             'Su dinero no llega.',
             'No hay nada que hacer, y por eso el aviso va en rojo y arriba. Es el único fallo '
             'de esta lista que el sistema no puede reparar.'],
            ['Se filtra la semilla',
             'Se vacían las direcciones provisionales.',
             'Se pierde lo que estuviera sin barrer: minutos de depósitos, no el fondo. Es '
             'la razón de que el barrido sea rápido.'],
        ],
        [40 * mm, 52 * mm, au - 92 * mm]))
    h.append(PageBreak())

    # ── 11 · Qué existe y qué falta ──────────────────────────────────────────
    h.append(P('11 · Qué está construido y qué falta', 'h1'))
    h.append(P(
        'Comprobado contra el repositorio el 4 de septiembre, archivo por archivo. Es más de '
        'lo que parece.', 'pg'))
    h.append(Spacer(1, 6))
    h.append(tabla(
        ['Pieza', 'Estado', 'Dónde vive / qué falta'],
        [
            ['Dirección de depósito por persona', '<b>Existe</b>',
             '<font face="Courier" size="7">portafolioController.js</font> — creación '
             'perezosa y atómica, llave cifrada.'],
            ['Cifrado de llaves', '<b>Existe</b>',
             '<font face="Courier" size="7">lib/cripto.js</font> — AES-256 y verificación '
             'por formato estricto.'],
            ['Vigía de depósitos', '<b>Existe</b>, solo 5550',
             '<font face="Courier" size="7">lib/vigia.js</font> — falta que mire Polygon, BSC '
             'y Ethereum, y por eventos.'],
            ['Barrido', '<b>Existe</b>, manual',
             '<font face="Courier" size="7">POST /admin/barrer</font> — falta el automático '
             'con gas y umbral.'],
            ['Lectura de Polygon y BSC', '<b>Existe</b>',
             '<font face="Courier" size="7">lib/vigiaCompras.js</font> — RPCs, confirmaciones '
             'e idempotencia ya resueltos.'],
            ['Libro y cuentas', '<b>Existe</b>',
             '<font face="Courier" size="7">lib/ledger.js</font> y los esquemas de cuenta y '
             'asiento.'],
            ['Tamiz de sanciones', '<b>Existe</b>',
             'Genesis ID, con 19.321 registros. Falta llamarlo desde el depósito.'],
            ['Derivación por índice', '<b>Falta</b>', 'Es el cambio de la página 4.'],
            ['Billetera de gas', '<b>Falta</b>', 'Llave nueva, fondeo y alarma de saldo.'],
            ['Decimales por red', '<b>Falta</b>', 'Y es lo que más urge: página 10.'],
            ['Pantallas de depósito', '<b>Falta</b>', 'Las de las páginas 5, 6 y 7.'],
            ['Avisos al teléfono', '<b>Falta</b>', 'La tubería ya existe en la app.'],
        ],
        [52 * mm, 28 * mm, au - 80 * mm]))
    h.append(PageBreak())

    # ── 12 · El orden y lo que hace falta de vos ─────────────────────────────
    h.append(P('12 · El orden de construcción', 'h1'))
    h.append(P(
        'En este orden, y no en otro: cada paso deja algo que se puede probar de verdad antes '
        'de que el siguiente dependa de él. Ninguno mueve dinero real hasta el último.', 'pg'))
    h.append(Spacer(1, 5))
    h.append(paso(1, 'Los decimales, primero que nada',
        'Leerlos del contrato, comprobarlos al arrancar, y que el servicio se niegue a '
        'arrancar si no cuadran. Va primero porque todo lo demás cuenta dinero, y contar mal '
        'desde el principio es lo único de esta lista que no se puede arreglar después.'))
    h.append(paso(2, 'La derivación y la billetera de gas',
        'Las dos llaves nuevas, con sus direcciones ya fondeadas y probadas en cada red. Sin '
        'usuarios todavía: solo comprobar que se deriva, que se fondea y que se puede barrer.'))
    h.append(paso(3, 'El vigía multicadena, mirando y sin acreditar',
        'Que vea depósitos de verdad en las tres redes y los anote, pero <b>sin tocar el '
        'libro</b>. Una semana así enseña más que cualquier prueba: se ve qué RPC falla, cuánto '
        'tarda de verdad cada red, y qué hace la gente que no se puede predecir.'))
    h.append(paso(4, 'El barrido automático, con topes',
        'Primero con un tope bajo por vuelta. Si algo está mal, está mal por poco dinero.'))
    h.append(paso(5, 'Las pantallas, y recién ahí abrir',
        'La calculadora, el precio congelado, los cuatro estados y los avisos. Y se abre con '
        'un puñado de personas conocidas antes que con los 407.'))
    h.append(Spacer(1, 6))

    h.append(PageBreak())
    h.append(P('Lo que necesito de vos', 'h1'))
    h.append(P(
        'Tres cosas para empezar, y una que va antes que las tres.', 'pg'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Qué', 'Para qué', 'Cuándo'],
        [
            ['<b>Las respuestas de la página 8 del documento anterior</b>',
             'De dónde sale el ORIGEN, de quién es la comisión, y en qué está el tesoro. Tres '
             'de esas seis cambian el código.',
             '<b>Antes de escribir nada</b>'],
            ['La billetera única de Ordenex',
             'Dónde se junta todo. La creás vos y la llave no pasa por acá.', 'Paso 2'],
            ['El umbral de Ethereum y el plazo del precio',
             'Cuánto tiene que juntar antes de barrer en Ethereum, y si el congelado son 30 '
             'minutos o menos.', 'Paso 4'],
            ['La comisión',
             'El número que va en la calculadora. Hoy no está decidido.', 'Paso 5'],
        ],
        [60 * mm, au - 100 * mm, 28 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Y una advertencia que prefiero dar ahora',
        'Este plan describe un servicio que recibe dinero de terceros y lo cambia por otra '
        'cosa. Lo que hay acá es la parte técnica y de diseño — que esté bien construido y que '
        'se entienda. <b>No cubre si Ordenex puede prestar este servicio, ni dónde, ni con qué '
        'requisitos</b>, y esa pregunta no la contesta un documento técnico ni yo. Va antes de '
        'abrir a los 407, no después.',
        ALERTA))

    doc.build(h)
    print(f'  {SALIDA}')


if __name__ == '__main__':
    construir()
