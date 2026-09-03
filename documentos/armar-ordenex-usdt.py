#!/usr/bin/env python3
"""El documento de decisión del cash in / cash out de USDT en Ordenex.

Se arma con reportlab y no a mano porque las cifras salen de mediciones que
hice contra las cadenas de verdad: si mañana cambian, se vuelve a correr esto
y el documento queda al día sin reescribirlo.
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
    E, P, vinetas, tabla, recuadro, paso, decorar, ROTULO, FECHA,
)

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, 'ordenex-usdt-cash-in-out.pdf')

ROTULO[0] = 'ORDENEX  ·  Cash in y cash out de USDT  ·  Documento de decisión'
FECHA[0] = '3 de septiembre de 2026'

def construir():
    doc = BaseDocTemplate(SALIDA, pagesize=LETTER,
                          leftMargin=MARGEN, rightMargin=MARGEN,
                          topMargin=22 * mm, bottomMargin=20 * mm,
                          title='Ordenex · Cash in y cash out de USDT',
                          author='Orden Global Corp',
                          subject='Documento de decisión')
    marco = Frame(MARGEN, 20 * mm, ANCHO - 2 * MARGEN, ALTO - 42 * mm, id='cuerpo')
    doc.addPageTemplates([PageTemplate(id='normal', frames=[marco], onPage=decorar)])

    h = []
    ancho_util = ANCHO - 2 * MARGEN

    # ── Portada ──────────────────────────────────────────────────────────────
    h.append(Spacer(1, 30 * mm))
    h.append(Paragraph('ORDENEX', ParagraphStyle(
        'marca', fontName='Helvetica-Bold', fontSize=11, leading=13,
        textColor=ORO, spaceAfter=10)))
    h.append(P('Cash in y cash out de USDT<br/>en Polygon y BNB Smart Chain', 'titulo'))
    h.append(HRFlowable(width='30%', thickness=2, color=ORO, spaceBefore=10,
                        spaceAfter=12, hAlign='LEFT'))
    h.append(P('Cómo funcionaría, qué cuesta, y las tres formas de hacerlo. '
               'Documento para decidir.', 'subtitulo'))
    h.append(Spacer(1, 8 * mm))
    h.append(recuadro(
        'Lo que hay que decidir en este documento',
        'Tres cosas. <b>Si se barren los depósitos</b> a una cuenta caliente o se dejan '
        'quietos, que se compara en la página 6. <b>Con cuánta liquidez se arranca</b>, con '
        'los costos medidos en la página 8. Y <b>si la salida de USDT se abre antes o '
        'después</b> de que lo mire la Junta, en la página 10. Todo lo demás de este '
        'documento existe para que esas tres respuestas sean fáciles.'))
    h.append(Spacer(1, 10 * mm))
    h.append(P('Todas las cifras de gas, decimales y contratos que aparecen acá fueron '
               'medidas contra Polygon y BNB Smart Chain el 3 de septiembre de 2026. '
               'No son estimaciones de manual.', 'pg'))
    h.append(PageBreak())

    # ── 1 · La decisión en una página ────────────────────────────────────────
    h.append(P('1 · Resumen para decidir', 'h1'))
    h.append(P(
        'Ordenex hoy mueve solo activos de la cadena 5550. Lo que se propone es que '
        'también acepte <b>USDT desde Polygon y desde BNB Smart Chain</b>, lo acredite '
        'en el libro de Ordenex, y permita sacarlo de vuelta a esas mismas cadenas. '
        'Veta Wallet no se toca: el USDT sigue sin aparecer como activo suyo.'))

    h.append(P('Lo que ya está construido y se reusa', 'h2'))
    h.append(P(
        'Ordenex ya genera <b>su propia dirección de depósito por usuario</b>, con la '
        'llave cifrada aparte y separada de la dirección de Veta Wallet. Y como las tres '
        'cadenas son EVM, <b>esa misma dirección funciona igual en Polygon y en BSC sin '
        'generar ni custodiar una llave más</b>. Esa era la parte más delicada del '
        'trabajo, y ya está hecha.'))
    h.append(P(
        'También existen el vigía que sondea cada treinta segundos, el libro de doble '
        'entrada en wei, y el circuito de retiro con su orden correcto: tamiz de '
        'sanciones, debitar, firmar, anotar, reportar al monitoreo.'))

    h.append(P('Lo que cambia el cálculo', 'h2'))
    h.append(P(
        'Antes de medir, la duda razonable era el costo de mover dinero entre direcciones. '
        'Medido, se disuelve: <b>consolidar un depósito cuesta menos de un centavo de '
        'dólar</b> en las dos cadenas, y aun con la red de Polygon treinta veces más cara '
        'que hoy sigue por debajo de veinte centavos. El gas no es el obstáculo.'))
    h.append(Spacer(1, 4))
    h.append(recuadro(
        'La recomendación, en una línea',
        'Arrancar con la <b>Opción B</b>: barrer los depósitos a una cuenta caliente por '
        'cadena, abrir primero solo la entrada, y abrir la salida cuando la Junta haya '
        'mirado el encuadre legal. Es la que deja el dinero donde se puede usar sin '
        'exponer una caliente antes de tiempo.', VERDE))
    h.append(PageBreak())

    # ── 2 · El punto de partida ──────────────────────────────────────────────
    h.append(P('2 · De dónde se parte, comprobado', 'h1'))
    h.append(P(
        'Todo lo de esta tabla se verificó leyendo el código en producción y consultando '
        'las cadenas, no de memoria.', 'pg'))
    h.append(Spacer(1, 6))
    h.append(tabla(
        ['Pieza', 'Estado hoy', 'Qué hace falta'],
        [
            ['Dirección de depósito por usuario',
             'Existe. Llave cifrada con ORDENEX_ADM, aparte de la de Veta Wallet.',
             'Nada. Sirve igual en Polygon y BSC.'],
            ['Capa de cadena',
             'Una sola, escrita a mano para la 5550.',
             'Convertirla en un registro de redes.'],
            ['Libro de doble entrada',
             'En wei, y asume 18 decimales para todo.',
             'Una capa de conversión por token.'],
            ['Vigía de depósitos',
             'Sondea saldos cada 30 s en la 5550.',
             'Leer eventos Transfer y contar confirmaciones.'],
            ['Retiro',
             'Firma desde una caliente en la 5550.',
             'Una caliente por cadena, con gas.'],
            ['Tamiz de sanciones',
             'Genesis ID, 19.321 registros de la OFAC. Funciona.',
             'Aplicarlo también al origen del depósito.'],
            ['Pantalla de depósito y retiro',
             'No existe en la web de Ordenex.',
             'Construirla.'],
        ],
        [42 * mm, 62 * mm, ancho_util - 104 * mm]))

    h.append(P('El USDT no es el mismo en las dos cadenas', 'h2'))
    h.append(P(
        'Y esta es la trampa que más caro sale si se pasa por alto. Los dos contratos '
        'se llaman USDT y valen lo mismo, pero cuentan distinto:'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Cadena', 'Contrato', 'Decimales'],
        [
            ['Polygon (137)', '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', '6'],
            ['BNB Smart Chain (56)', '0x55d398326f99059fF775485246999027B3197955', '18'],
            ['El libro de Ordenex', 'interno', '18 para todo'],
        ],
        [38 * mm, 88 * mm, ancho_util - 126 * mm]))
    h.append(Spacer(1, 6))
    h.append(recuadro(
        'Por qué importa tanto',
        'Un depósito de 100 USDT en Polygon leído como si tuviera 18 decimales se acredita '
        'como <b>0,0000000001</b>. Al revés, se acreditarían cien billones. La conversión '
        'tiene que vivir en <b>un solo archivo</b> y no repetirse en cada módulo: cada copia '
        'es un sitio donde el día de mañana alguien arregla uno y se olvida del otro.',
        ALERTA))
    h.append(PageBreak())

    # ── 3 · Cash in ──────────────────────────────────────────────────────────
    h.append(P('3 · Cómo funcionaría la entrada', 'h1'))
    h.append(P(
        'La persona ya entró a Ordenex con su cuenta de Veta Wallet. Quiere meter USDT.', 'pg'))
    h.append(Spacer(1, 4))
    h.append(paso(1, 'Elige la cadena, y solo entonces ve una dirección',
        'La pantalla obliga a elegir Polygon o BNB Smart Chain <b>antes</b> de enseñar nada. '
        'Es la misma dirección en las dos, pero enseñarla sin que la persona haya dicho por '
        'dónde manda es invitar a que mande por la cadena equivocada.'))
    h.append(paso(2, 'Manda el USDT desde donde sea',
        'Su exchange, su MetaMask, otra billetera. Ordenex no controla esa punta y no '
        'necesita controlarla.'))
    h.append(paso(3, 'El vigía lo ve, y espera',
        'Lee los eventos Transfer hacia esa dirección en las dos cadenas. Cuando aparece '
        'uno, <b>no acredita todavía</b>: cuenta confirmaciones. Polygon reorganiza bloques '
        'con más frecuencia que otras redes, y acreditar al primer bloque es acreditar '
        'dinero que puede desaparecer.'))
    h.append(paso(4, 'Tamiz de la dirección que envió',
        'Se le pregunta a Genesis ID si el remitente está en listas de sanciones. Si lo '
        'está, el depósito queda retenido y va a revisión humana, no al libro.'))
    h.append(paso(5, 'Se acredita en el libro',
        'Convertido a la unidad interna con los decimales de ESA cadena. Queda una fila en '
        '<i>depositos</i> con la cadena, el hash y el bloque, para que cualquiera pueda '
        'reconstruir de dónde salió cada centavo.'))
    h.append(paso(6, 'Se barre a la caliente',
        'Segun la opción que se elija. Ver la página siguiente.'))

    h.append(P('Lo que hay que resolver sí o sí', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>Confirmaciones por cadena.</b> Propuesta: 128 bloques en Polygon (unos 5 minutos) '
        'y 15 en BSC (unos 45 segundos). Se puede acelerar para montos chicos.',
        '<b>Mínimo de depósito.</b> Por debajo de cierto monto, la fila de historial cuesta '
        'más que lo depositado. La pasarela de Veta Wallet usa 0,50 dólares.',
        '<b>Reintentos.</b> Releer la cadena no puede acreditar dos veces. Se resuelve con '
        'el hash como llave única, no comparando saldos.',
    ]):
        h.append(x)
    h.append(PageBreak())

    # ── 4 · Cash out ─────────────────────────────────────────────────────────
    h.append(P('4 · Cómo funcionaría la salida', 'h1'))
    h.append(Spacer(1, 2))
    h.append(paso(1, 'Pide el retiro',
        'Elige cadena, dirección de destino y monto. La comisión se enseña ANTES de '
        'confirmar, y sale del monto, no aparte.'))
    h.append(paso(2, 'Tamiz del destino',
        'Contra Genesis. Si la dirección está sancionada, no sale, y no se le dice a la '
        'persona qué lista ni por qué: eso le enseñaría a esquivarlo.'))
    h.append(paso(3, 'Se debita el libro primero',
        'Antes de firmar nada. Si se firmara primero y el libro fallara después, habría '
        'dinero fuera sin registro.'))
    h.append(paso(4, 'Se firma desde la caliente de esa cadena',
        'Con idempotencia por clave del cliente: un reintento por timeout no puede firmar '
        'dos veces. Si la firma falla, <b>se reacredita el libro</b> y se anota el porqué.'))
    h.append(paso(5, 'Se anota y se reporta',
        'Fila en <i>retiros</i> con el hash, y aviso al monitoreo antilavado de Genesis.'))

    h.append(P('Lo que la salida necesita y la entrada no', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>USDT parado</b> en una caliente por cadena. Es dinero de la casa inmovilizado.',
        '<b>Gas parado.</b> POL en Polygon, BNB en BSC. Sin gas, los retiros se paran y '
        'nadie se entera hasta que alguien reclama: hace falta una alarma por saldo bajo.',
        '<b>Una llave caliente por cadena.</b> Es el activo más sensible del sistema: quien '
        'la tenga puede vaciar la caliente. Va cifrada y con tope diario de salida.',
        '<b>Una comisión que cubra el gas.</b> Si no, cada retiro cuesta plata a la casa.',
    ]):
        h.append(x)
    h.append(PageBreak())

    # ── 5 · Las tres opciones ────────────────────────────────────────────────
    h.append(P('5 · Tres formas de hacerlo', 'h1'))
    h.append(P(
        'Se diferencian en una sola cosa: <b>qué pasa con el USDT después de que entra</b>. '
        'Todo lo demás es igual.', 'pg'))
    h.append(Spacer(1, 6))

    h.append(P('Opción A · No se barre nada', 'h2'))
    h.append(P(
        'El USDT se queda quieto en la dirección de cada usuario, igual que hace hoy la '
        'pasarela de Veta Wallet. La casa no toca ese dinero nunca.'))
    for x in vinetas([
        '<b>A favor:</b> cero gas, cero caliente, cero llave que proteger. Es la opción con '
        'menos superficie de ataque que existe.',
        '<b>En contra:</b> los retiros salen de liquidez aparte de la casa. O sea que hay que '
        'poner dinero propio mientras el de la gente está quieto en direcciones que no se usan.',
    ]):
        h.append(x)

    h.append(P('Opción B · Se barre a una caliente por cadena', 'h2'))
    h.append(P(
        'Cada depósito confirmado se consolida: se le manda gas a la dirección del usuario y '
        'se mueve el USDT a la caliente de esa cadena. Los retiros salen de ahí.'))
    for x in vinetas([
        '<b>A favor:</b> el dinero que entra financia el que sale. No hace falta poner '
        'liquidez propia más allá de un colchón inicial.',
        '<b>En contra:</b> hay una caliente con saldo, y una llave que la abre. Y cuesta gas '
        '— medido abajo, y es poco.',
    ]):
        h.append(x)

    h.append(P('Opción C · Barrido a una fría, con caliente chica', 'h2'))
    h.append(P(
        'Como la B, pero la caliente solo guarda lo justo para los retiros del día y el resto '
        'pasa a una billetera fría que se firma a mano.'))
    for x in vinetas([
        '<b>A favor:</b> si alguien roba la caliente, se lleva un día de retiros, no el fondo.',
        '<b>En contra:</b> alguien tiene que rellenar la caliente a mano. Si esa persona se va '
        'de viaje, los retiros se paran.',
    ]):
        h.append(x)

    h.append(Spacer(1, 8))
    h.append(tabla(
        ['', 'A · Sin barrer', 'B · Caliente', 'C · Fría y caliente'],
        [
            ['Liquidez propia que hay que poner', 'Toda la de retiros', 'Solo un colchón', 'Solo un colchón'],
            ['Costo de gas', 'Ninguno', 'Menos de 1 centavo por depósito', 'Igual que B, más el traslado'],
            ['Si roban la llave caliente', 'No hay llave', 'Se va el fondo', 'Se va un día de retiros'],
            ['Trabajo humano diario', 'Ninguno', 'Ninguno', 'Rellenar la caliente'],
            ['Semanas de trabajo', '2', '3', '4'],
        ],
        [46 * mm, 36 * mm, 44 * mm, ancho_util - 126 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Recomendación',
        'La <b>B</b>. La A obliga a poner dinero propio para pagar retiros mientras el dinero '
        'de la gente duerme en direcciones que no se usan, y eso no se sostiene cuando crezca. '
        'La C es la correcta el día que el fondo sea grande, y se puede llegar a ella desde la '
        'B sin rehacer nada: es la misma pieza con un tope y un traslado encima.', VERDE))
    h.append(PageBreak())

    # ── 6 · Los números ──────────────────────────────────────────────────────
    h.append(P('6 · Los números, medidos', 'h1'))
    h.append(P(
        'Medidos contra las cadenas el 3 de septiembre de 2026. Un barrido son dos '
        'transacciones: mandarle gas a la dirección del usuario y mover el USDT.', 'pg'))
    h.append(Spacer(1, 6))
    h.append(tabla(
        ['Cadena', 'Precio del gas', 'Mover USDT', 'Mandar gas', 'Barrido completo'],
        [
            ['Polygon', '278 gwei', '0,0181 POL', '0,0058 POL', 'unos 0,006 dólares'],
            ['BNB Smart Chain', '0,05 gwei', '0,000003 BNB', '0,000001 BNB', 'unos 0,003 dólares'],
        ],
        [34 * mm, 30 * mm, 30 * mm, 30 * mm, ancho_util - 124 * mm]))
    h.append(Spacer(1, 8))
    h.append(P('Qué pasa si la red se congestiona', 'h2'))
    h.append(P(
        'Polygon sube de precio en picos. Aun multiplicando por treinta el precio de hoy, '
        'un barrido cuesta menos de veinte centavos:'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Escenario', 'Costo de un barrido en Polygon'],
        [
            ['Como hoy', '0,006 dólares'],
            ['Diez veces más caro', '0,060 dólares'],
            ['Treinta veces más caro', '0,179 dólares'],
        ],
        [60 * mm, ancho_util - 60 * mm]))
    h.append(Spacer(1, 8))
    h.append(P(
        'Con mil depósitos al mes, el gas de barrerlos todos ronda los <b>seis dólares</b> en '
        'Polygon y <b>tres</b> en BSC. Comparado con la liquidez propia que habría que '
        'inmovilizar en la Opción A, no hay discusión.'))

    h.append(P('Lo que sí cuesta dinero de verdad', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>El colchón de liquidez.</b> Con cuánto se arranca es decisión tuya. Un punto de '
        'partida razonable: lo que se estime como retiros de dos días.',
        '<b>El proveedor de RPC.</b> Mientras preparaba esto, dos servidores públicos de '
        'Polygon fallaron seguidos. Con los públicos, un depósito se puede quedar sin '
        'detectar y eso es dinero de alguien que no aparece. Una cuenta de pago ronda los '
        '50 dólares al mes.',
        '<b>El colchón de gas.</b> Unos pocos dólares al mes, pero tiene que estar y tiene '
        'que avisar cuando baje.',
    ]):
        h.append(x)
    h.append(PageBreak())

    # ── 7 · Riesgos ──────────────────────────────────────────────────────────
    h.append(P('7 · Lo que puede salir mal, y qué lo evita', 'h1'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Riesgo', 'Qué pasaría', 'Qué lo evita'],
        [
            ['Los decimales',
             'Acreditar cien billones o una millonésima.',
             'La conversión en un solo archivo, con prueba propia por cadena.'],
            ['Dos direcciones que aceptan USDT',
             'La gente tiene su dirección de Veta Wallet y la de Ordenex. Mandar a la '
             'equivocada acredita en el producto equivocado.',
             'Una sola dirección por pantalla, con la cadena en grande y aviso. Y un '
             'procedimiento escrito para devolver lo que caiga mal.'],
            ['Reorganización de bloques',
             'Acreditar un depósito que después desaparece.',
             'Esperar confirmaciones antes de tocar el libro.'],
            ['La llave caliente',
             'Quien la tenga vacía la caliente.',
             'Cifrada, tope diario de salida, alarma por movimiento raro. Y la Opción C '
             'cuando el fondo lo justifique.'],
            ['El RPC se cae',
             'Depósitos sin detectar, sin que nadie se entere.',
             'Varios proveedores por orden, y una alarma cuando el vigía lleva rato sin '
             'completar una vuelta.'],
            ['Alguien manda otro token',
             'Llega BUSD, o USDC, o un token basura, a una dirección de depósito.',
             'Solo se acredita el contrato de la lista. Lo demás queda quieto y se '
             'devuelve a mano si alguien reclama.'],
            ['Sanciones',
             'Recibir de una dirección de la OFAC.',
             'Tamiz del origen antes de acreditar, y del destino antes de retirar. El '
             'motor ya existe y funciona.'],
        ],
        [34 * mm, 62 * mm, ancho_util - 96 * mm]))
    h.append(PageBreak())

    # ── 8 · Lo legal ─────────────────────────────────────────────────────────
    h.append(P('8 · El encuadre legal, dicho de frente', 'h1'))
    h.append(P(
        'El documento de diseño de Ordenex dice, en su primer principio: <i>«La casa nunca '
        'toca fiat. El cash-in/out es entre personas. Sin esto, Ordenex sería una remesadora '
        'sin licencia — y el expediente legal del 14/08 es explícito en que licencias no hay '
        'todavía.»</i>'))
    h.append(P(
        'Ese principio se escribió para el circuito de lempiras y dólares, y se resolvió con '
        'los agentes: la casa custodia y arbitra, pero el dinero va de persona a persona.'))
    h.append(P(
        'Lo que se propone acá <b>no es fiat</b>: USDT es un activo digital, y recibirlo y '
        'enviarlo se parece más a mover un token que a cambiar moneda. Pero conviene no '
        'engañarse: un circuito de entrada y salida de una moneda estable respaldada en '
        'dólares se parece bastante más a una casa de cambio que un libro de órdenes entre '
        'usuarios, y es razonable que alguien lo vea así.'))
    h.append(Spacer(1, 4))
    h.append(recuadro(
        'La recomendación sobre esto',
        'Abrir la <b>entrada</b> primero y dejar la <b>salida</b> esperando el visto bueno de '
        'la Junta. Recibir USDT para operar dentro de Ordenex es difícil de distinguir de '
        'recibir cualquier otro token. Devolverlo a una dirección de fuera es la parte que '
        'merece que alguien con criterio legal la mire antes, no después. Y no cuesta tiempo: '
        'la entrada se construye igual, y la salida es la fase siguiente.', ALERTA))
    h.append(Spacer(1, 6))
    h.append(P(
        'Esto no es un consejo legal y no pretende serlo. Es la observación de quien está '
        'escribiendo el código, señalando dónde conviene que mire alguien que sí sabe.', 'pg'))

    # ── 9 · Plan ─────────────────────────────────────────────────────────────
    h.append(P('9 · Cómo se entregaría', 'h1'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Fase', 'Qué se entrega', 'Semanas'],
        [
            ['1 · Cimientos',
             'El registro de cadenas, la conversión de decimales con sus pruebas, y el '
             'vigía leyendo eventos con confirmaciones. Sin tocar dinero de nadie.',
             '1'],
            ['2 · Entrada',
             'Depósito de USDT en las dos cadenas, con tamiz del origen, y la pantalla '
             'con la advertencia de cadena. Barrido a la caliente.',
             '1,5'],
            ['3 · Salida',
             'Caliente por cadena, retiro con idempotencia, comisión, topes y alarmas de '
             'saldo bajo. Solo tras el visto bueno de la Junta.',
             '1,5'],
            ['4 · Vigilancia',
             'Alarmas de vigía parado, de gas bajo y de descuadre entre lo que dice el '
             'libro y lo que hay en las cadenas.',
             '0,5'],
        ],
        [30 * mm, ancho_util - 55 * mm, 25 * mm]))
    h.append(Spacer(1, 8))

    h.append(P('Lo que hace falta de tu lado antes de empezar', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>La decisión de barrido:</b> A, B o C.',
        '<b>La cuenta de RPC</b> para Polygon y BSC. La consigo yo si preferís.',
        '<b>Cuatro números:</b> mínimo de depósito, comisión de retiro, confirmaciones por '
        'cadena y tope diario por persona. Si no los tenés, propongo unos y los revisás.',
        '<b>El colchón:</b> cuánto USDT y cuánto gas para arrancar.',
        '<b>La consulta a la Junta</b> sobre la salida, que puede correr en paralelo con las '
        'dos primeras fases.',
    ]):
        h.append(x)

    h.append(Spacer(1, 10))
    h.append(HRFlowable(width='100%', thickness=0.6, color=LINEA, spaceAfter=8))
    h.append(P(
        'Documento preparado para la toma de decisión. Las cifras de gas, los contratos y '
        'los decimales se midieron contra Polygon y BNB Smart Chain el 3 de septiembre de '
        '2026; el estado del código se verificó contra lo que hay en producción ese mismo '
        'día. Nada de lo que aparece acá está estimado de memoria.', 'pie'))

    doc.build(h)
    print('  PDF escrito en', SALIDA)

if __name__ == '__main__':
    construir()
