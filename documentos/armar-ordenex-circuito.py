#!/usr/bin/env python3
"""El plan del circuito USDT <-> ORIGEN, tal como lo pidió José.

Este documento parte de SU diseño y no de uno propio: billetera de Ordenex
compartida para recibir y enviar, billetera aparte solo de ORIGEN, calculadora
con precio congelado, y salida solo por BNB.

Lo que hace este papel es decir con qué funciona ese diseño tal cual, qué
necesita cambiar para poder funcionar, y por qué. Las tres cosas que hay que
corregir están señaladas como tales, con su razón, no como una preferencia.
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
SALIDA = os.path.join(AQUI, 'ordenex-circuito-usdt-origen.pdf')

ROTULO[0] = 'ORDENEX  ·  Circuito USDT y ORIGEN  ·  Plan de construcción'
FECHA[0] = '3 de septiembre de 2026'


def construir():
    doc = BaseDocTemplate(SALIDA, pagesize=LETTER,
                          leftMargin=MARGEN, rightMargin=MARGEN,
                          topMargin=22 * mm, bottomMargin=20 * mm,
                          title='Ordenex · Circuito USDT y ORIGEN',
                          author='Orden Global Corp',
                          subject='Plan de construcción')
    marco = Frame(MARGEN, 20 * mm, ANCHO - 2 * MARGEN, ALTO - 42 * mm, id='cuerpo')
    doc.addPageTemplates([PageTemplate(id='normal', frames=[marco], onPage=decorar)])

    h = []
    au = ANCHO - 2 * MARGEN

    # ── Portada ──────────────────────────────────────────────────────────────
    h.append(Spacer(1, 28 * mm))
    h.append(Paragraph('ORDENEX', ParagraphStyle(
        'marca', fontName='Helvetica-Bold', fontSize=11, leading=13,
        textColor=ORO, spaceAfter=10)))
    h.append(P('El circuito USDT y ORIGEN<br/>Plan de construcción', 'titulo'))
    h.append(HRFlowable(width='30%', thickness=2, color=ORO, spaceBefore=10,
                        spaceAfter=12, hAlign='LEFT'))
    h.append(P('Veta Wallet guarda las monedas. Comprar, vender y retirar son '
               'servicios de Ordenex.', 'subtitulo'))
    h.append(Spacer(1, 6 * mm))
    h.append(recuadro(
        'Qué es este documento',
        'El plan de <b>tu</b> diseño, no de uno mío. Dice con qué funciona tal cual, qué '
        'hay que corregirle para que pueda funcionar, y por qué. Hay <b>tres correcciones</b> '
        'y las tres están señaladas: la atribución de los depósitos (página 4), el precio '
        'congelado (página 5), y el contrato entre dos cadenas (página 7). Las tres son '
        'límites de cómo funcionan las cadenas, no opiniones de diseño.'))
    h.append(Spacer(1, 8 * mm))
    h.append(P('Precios y costos de red medidos el 3 de septiembre de 2026 contra Ethereum, '
               'Polygon, BNB Smart Chain y la fuente de precio del oro.', 'pg'))
    h.append(PageBreak())

    # ── 1 · El reparto ───────────────────────────────────────────────────────
    h.append(P('1 · Quién hace qué', 'h1'))
    h.append(P(
        'La separación que pediste es buena y conviene escribirla, porque de ella salen '
        'casi todas las decisiones siguientes.'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['', 'Veta Wallet', 'Ordenex'],
        [
            ['Qué es', 'La caja. Guarda las monedas de la persona.',
             'La mesa. Compra, vende, entra y saca.'],
            ['Qué ve la persona', 'Su saldo en ORIGEN y sus movimientos.',
             'La calculadora, el precio, y el estado de su orden.'],
            ['USDT', 'No aparece nunca. Ni como saldo ni como token.',
             'Es la moneda de entrada y de salida.'],
            ['Qué botones tiene', 'Uno solo nuevo: <b>Retirar</b>, que pasa la mano a Ordenex.',
             'Depositar, retirar, la calculadora y el historial de órdenes.'],
        ],
        [30 * mm, 62 * mm, au - 92 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Una consecuencia que conviene ver ahora',
        'Dijiste antes «no tocar Veta Wallet», y sigue en pie para lo que importaba: '
        '<b>el USDT no va a aparecer ahí</b>. Pero si el retiro empieza en la billetera, '
        'la billetera necesita un botón que lleve a Ordenex. Es un botón y una pantalla de '
        'traspaso, no un cambio de fondo — pero es tocarla, y prefiero decirlo antes que '
        'descubrirlo a mitad.'))

    h.append(P('Las tres billeteras de la casa', 'h2'))
    h.append(P(
        'Tu diseño necesita tres, y cada una tiene un trabajo distinto. Conviene que sean '
        'tres llaves distintas: juntarlas ahorra un trámite hoy y multiplica el daño el día '
        'que una se pierda.'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Billetera', 'Dónde vive', 'Para qué', 'Qué guarda'],
        [
            ['USDT de Ordenex', 'Ethereum, Polygon y BSC (la misma dirección en las tres)',
             'Recibe los depósitos y paga los retiros.', 'USDT y gas de cada cadena'],
            ['ORIGEN de Ordenex', 'Cadena 5550',
             'Entrega el ORIGEN comprado y recibe el que se vende.', 'ORIGEN y gas de la 5550'],
            ['Fría', 'Fuera de línea',
             'Guarda lo que no hace falta tener a mano.', 'El grueso del fondo'],
        ],
        [34 * mm, 46 * mm, 50 * mm, au - 130 * mm]))
    h.append(PageBreak())

    # ── 2 · Cash in ──────────────────────────────────────────────────────────
    h.append(P('2 · La entrada, paso a paso', 'h1'))
    h.append(P('La persona quiere convertir USDT en ORIGEN.', 'pg'))
    h.append(Spacer(1, 4))
    h.append(paso(1, 'Abre la calculadora en Ordenex',
        'Escribe cuánto USDT quiere meter y elige la red: Ethereum, Polygon o BNB. La '
        'pantalla le dice <b>cuánto ORIGEN va a recibir</b>, con el precio del oro del '
        'momento y la comisión ya descontada. Nada de letra chica: el número de arriba es '
        'el que le va a llegar.'))
    h.append(paso(2, 'Confirma y se le congela el precio',
        'Ahí nace una <b>orden</b> con su número, su precio fijado, su plazo y la dirección '
        'de Ordenex de esa red. La orden es la pieza central de todo el circuito: sin ella '
        'no hay forma de saber de quién es un depósito. Ver la página 4.'))
    h.append(paso(3, 'Manda el USDT',
        'Desde su exchange, su billetera, de donde sea. A la dirección de Ordenex de la red '
        'que eligió, y a ninguna otra.'))
    h.append(paso(4, 'Pega el comprobante',
        'El identificador de su transacción. Ordenex mira la cadena y comprueba cuatro '
        'cosas: que existe, que llegó a la dirección de Ordenex, que es USDT del contrato '
        'correcto, y que nadie más reclamó ese mismo comprobante.'))
    h.append(paso(5, 'Confirmaciones y tamiz',
        'Se espera a que el depósito no se pueda deshacer, y se le pregunta a Genesis ID si '
        'quien envió está en listas de sanciones. Si lo está, la orden queda retenida para '
        'revisión humana; el dinero no se devuelve solo.'))
    h.append(paso(6, 'La billetera ORIGEN de Ordenex paga',
        'Manda el ORIGEN a la dirección que la persona tiene en Veta Wallet, en la cadena '
        '5550. Queda en la cadena, así que se puede comprobar en OrdenScan — la casa no '
        'pide que le crean.'))
    h.append(PageBreak())

    # ── 3 · La corrección 1: atribución ──────────────────────────────────────
    h.append(P('3 · Corrección 1 · De quién es cada depósito', 'h1'))
    h.append(recuadro(
        'El problema, en una frase',
        'Si todo el mundo manda a la misma dirección, la cadena no dice quién mandó qué. '
        'Y cuando alguien retira desde Binance, la dirección que aparece <b>es la de '
        'Binance</b>, no la suya. Sin resolver esto, dos personas que depositan lo mismo el '
        'mismo día son indistinguibles.', ALERTA))
    h.append(Spacer(1, 6))
    h.append(P('Hay tres salidas, y no son excluyentes', 'h2'))
    h.append(Spacer(1, 2))
    h.append(tabla(
        ['Salida', 'Cómo funciona', 'Sirve desde un exchange', 'Costo para la persona'],
        [
            ['La orden manda',
             'La persona abre la orden, manda, y pega el comprobante. Ordenex lo verifica '
             'contra la cadena.',
             'Sí', 'Un paso más: pegar el comprobante'],
            ['Contrato receptor',
             'La persona llama a <i>depositar()</i> en un contrato de Ordenex. El contrato '
             'deja escrito quién fue.',
             'No. Un exchange solo hace envíos simples.',
             'Dos transacciones y el doble de gas'],
            ['Dirección por persona',
             'Cada quien tiene la suya. No hay nada que atribuir.',
             'Sí', 'Ninguno'],
        ],
        [30 * mm, 62 * mm, 34 * mm, au - 126 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Recomendación',
        'Arrancar con <b>la orden manda</b>, que es la que respeta tu diseño de una sola '
        'billetera y además funciona desde un exchange, que es de donde va a venir casi todo '
        'el USDT. El <b>contrato receptor</b> se puede sumar después como comodidad para '
        'quien use su propia billetera: le ahorra pegar nada. La <b>dirección por persona</b> '
        'ya está construida en Ordenex y queda disponible el día que se prefiera.', VERDE))
    h.append(Spacer(1, 6))
    h.append(P(
        'Y hay que decidir qué se hace con el dinero que llegue sin orden abierta. Va a '
        'pasar: alguien manda antes de abrirla, o se confunde de red. Propuesta: queda '
        'retenido, se le avisa, y hay un procedimiento escrito para devolverlo o aplicarlo a '
        'una orden nueva. Lo que no puede pasar es que se quede sin dueño y sin registro.', 'pg'))
    h.append(PageBreak())

    # ── 4 · La calculadora y el precio ───────────────────────────────────────
    h.append(P('4 · La calculadora y el precio congelado', 'h1'))
    h.append(P('Cómo sale el número', 'h2'))
    h.append(P(
        'El ORIGEN vale <b>un cincuentaicincoavo de gramo de oro</b>. Con el precio del oro '
        'de hoy, así queda la cuenta:'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Paso', 'Cuenta', 'Hoy'],
        [
            ['Onza de oro', 'fuente de precio', 'US$ 4.493,00'],
            ['Gramo', 'onza dividido 31,1035', 'US$ 144,45'],
            ['Un ORIGEN', 'gramo dividido 55', 'US$ 2,6264'],
            ['100 USDT dan', 'USDT dividido el precio del ORIGEN', '38,07 ORIGEN'],
            ['1.000 USDT dan', '', '380,75 ORIGEN'],
        ],
        [38 * mm, 62 * mm, au - 100 * mm]))
    h.append(Spacer(1, 6))
    h.append(P(
        'A eso se le resta la comisión de la casa, y el resultado es lo que la pantalla '
        'promete. La comisión se enseña aparte y en números, no escondida en el tipo de '
        'cambio: un margen disimulado en el precio se descubre siempre, y cuando se '
        'descubre cuesta más que lo que se ganó.', 'pg'))

    h.append(P('Corrección 2 · El precio congelado tiene un costo, y hay que verlo', 'h2'))
    h.append(recuadro(
        'Lo que pasa si el plazo es largo',
        'Congelar el precio es regalar una opción. Quien abre una orden puede esperar: si el '
        'oro sube, la completa y gana; si baja, la deja morir y abre otra. No hace falta que '
        'sea nadie malintencionado — es lo que cualquiera hace sin pensarlo. Con el plazo '
        'largo y sin tope, esa opción la paga la casa <b>en todas las órdenes a la vez</b>.',
        ALERTA))
    h.append(Spacer(1, 6))
    h.append(P(
        'Y no se arregla con un plazo corto a secas, porque hay una tensión real: sacar '
        'USDT de un exchange tarda entre cinco y treinta minutos, más las confirmaciones. '
        'Un plazo de diez minutos hace que casi todos los depósitos lleguen vencidos.'))
    h.append(Spacer(1, 4))
    h.append(P('Lo que propongo, y son cuatro reglas juntas', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>Plazo de 20 minutos</b> desde que se abre la orden. Alcanza para quien ya tiene '
        'el USDT a mano, que es el caso normal.',
        '<b>Banda de tolerancia.</b> Si el depósito llega vencido pero el oro se movió menos '
        'de un 1 %, se respeta el precio igual. Si se movió más, se recotiza y se le pregunta '
        'antes de convertir nada.',
        '<b>Tope de órdenes abiertas</b> por persona: dos. Sin esto, una sola persona abre '
        'veinte y completa las tres que le convienen.',
        '<b>Tope de exposición total</b> de la casa: un monto máximo en órdenes abiertas a la '
        'vez. Cuando se llena, la calculadora sigue cotizando pero sin congelar.',
    ]):
        h.append(x)
    h.append(PageBreak())

    # ── 5 · Cash out ─────────────────────────────────────────────────────────
    h.append(P('5 · La salida, paso a paso', 'h1'))
    h.append(P('Solo por BNB Smart Chain, y en la página siguiente está el porqué con '
               'números.', 'pg'))
    h.append(Spacer(1, 4))
    h.append(paso(1, 'En Veta Wallet toca Retirar',
        'La billetera no hace la operación: pasa la mano a Ordenex con la sesión ya abierta, '
        'igual que ya hace con AuCorp.'))
    h.append(paso(2, 'Dice cuánto y a dónde',
        'Cuánto ORIGEN quiere sacar y a qué dirección de BNB quiere el USDT. La calculadora '
        'le enseña cuánto USDT recibe, con la comisión y el costo de red ya descontados.'))
    h.append(paso(3, 'Tamiz del destino',
        'Contra Genesis ID. Si la dirección está sancionada no sale, y no se le dice qué '
        'lista ni por qué: eso le enseñaría a esquivarlo.'))
    h.append(paso(4, 'El ORIGEN se mueve primero',
        'De la dirección de la persona a la billetera ORIGEN de Ordenex, en la 5550. Se '
        'espera a que quede confirmado. <b>Recién entonces</b> se considera cobrado.'))
    h.append(paso(5, 'Ordenex manda el USDT',
        'Desde su billetera de BNB a la dirección que la persona dio. Queda anotado con su '
        'identificador, y la persona lo puede comprobar en BscScan.'))
    h.append(paso(6, 'Si algo falla en el paso 5',
        'El ORIGEN ya está cobrado y el USDT no salió. La orden queda en <i>debe</i>, con '
        'alarma, y se resuelve a mano el mismo día. Es el punto más delicado del circuito y '
        'por eso tiene su propio estado y su propia alarma, no un mensaje de error.'))
    h.append(PageBreak())

    # ── 6 · La corrección 3: el contrato ─────────────────────────────────────
    h.append(P('6 · Corrección 3 · Un contrato no puede cruzar dos cadenas', 'h1'))
    h.append(recuadro(
        'Lo que hay que corregir del diseño',
        'Dijiste: «al dar enviar se activa contrato inteligente, recibe la billetera ORIGEN '
        'de Ordenex y la otra billetera USDT deposita a la cuenta de la persona». Eso, tal '
        'cual, <b>no se puede</b>: el ORIGEN vive en la cadena 5550 y el USDT en BNB Smart '
        'Chain. Son dos cadenas que no se conocen. Ningún contrato inteligente puede recibir '
        'en una y pagar en la otra en el mismo acto — no es una limitación nuestra, es cómo '
        'funcionan las cadenas.', ALERTA))
    h.append(Spacer(1, 6))
    h.append(P('Lo que sí se puede, y es lo honesto', 'h2'))
    h.append(P(
        'Dos pasos con un servidor en el medio: cobrar el ORIGEN en la 5550, y cuando está '
        'confirmado, pagar el USDT en BNB. Entre los dos pasos hay un instante en que la '
        'persona ya pagó y todavía no cobró, y <b>en ese instante confía en la casa</b>. No '
        'hay forma de eliminarlo sin un puente entre cadenas, que es un proyecto entero y '
        'con sus propios riesgos, bastante peores.'))
    h.append(Spacer(1, 4))
    h.append(P('Lo que hace que ese instante sea corto y verificable:', 'pg'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>El orden.</b> Primero cobrar, después pagar. Al revés, un fallo regala USDT.',
        '<b>Idempotencia.</b> Un reintento por corte de red no puede pagar dos veces.',
        '<b>Un estado que se ve.</b> La persona ve «cobrado, enviando» y después el '
        'identificador de su transacción. No un giro que da vueltas sin decir nada.',
        '<b>Alarma en el hueco.</b> Si pasan minutos entre cobrar y pagar, alguien se entera. '
        'Hoy nadie se enteraría.',
        '<b>Una cuenta que cuadra.</b> Todos los días se compara lo que dice el libro contra '
        'lo que hay en las tres cadenas. Un descuadre se ve el mismo día.',
    ]):
        h.append(x)
    h.append(Spacer(1, 6))
    h.append(P(
        'Donde el contrato inteligente <b>sí</b> aporta es en la entrada, y para otra cosa: '
        'un contrato receptor deja escrito en la cadena quién depositó, y eso resuelve la '
        'atribución de la página 4 sin pegar comprobantes. No hace la operación atómica — '
        'sigue siendo el servidor el que paga el ORIGEN — pero quita un paso a la persona.', 'pg'))
    h.append(PageBreak())

    # ── 7 · Los números ──────────────────────────────────────────────────────
    h.append(P('7 · Por qué la salida es solo por BNB', 'h1'))
    h.append(P('Costos de red medidos el 3 de septiembre de 2026. En la salida los paga la '
               'casa, así que salen de la comisión.', 'pg'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Cadena', 'Mandar USDT hoy', 'Quién lo paga en la entrada', 'En la salida'],
        [
            ['BNB Smart Chain', 'menos de un centavo', 'La persona', 'La casa. Es barato.'],
            ['Polygon', 'menos de un centavo', 'La persona', 'La casa. También barato.'],
            ['Ethereum', 'unos 8 centavos hoy, y sube mucho en picos',
             'La persona', 'La casa. Es el que se dispara.'],
        ],
        [34 * mm, 42 * mm, 40 * mm, au - 116 * mm]))
    h.append(Spacer(1, 6))
    h.append(P(
        'Tu decisión de sacar solo por BNB es correcta y conviene mantenerla. Ethereum hoy '
        'está inusualmente barato; su gas ha estado cien veces más caro en épocas de '
        'congestión, y un retiro que costaba centavos pasa a costar varios dólares sin '
        'aviso. Aceptarlo de <b>entrada</b> no tiene ese riesgo, porque ahí el gas lo paga '
        'quien manda.'))
    h.append(Spacer(1, 4))
    h.append(recuadro(
        'Y una trampa que ya costó caro en otros lados',
        'Los tres USDT no cuentan igual. En <b>Ethereum y Polygon tienen 6 decimales</b>; en '
        '<b>BNB Smart Chain, 18</b>. Un depósito de 100 USDT de Polygon leído con la regla de '
        'BSC se acredita como 0,0000000001. La conversión tiene que vivir en un solo archivo '
        'con su prueba por cadena, y no repetirse en cada módulo.'))

    h.append(P('Lo que hay que dejar parado', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>ORIGEN</b> en la billetera de Ordenex, para pagar las compras. Si se agota, la '
        'entrada se para: hace falta alarma por saldo bajo.',
        '<b>USDT en BNB</b>, para pagar los retiros. Igual, con su alarma.',
        '<b>Gas</b> en la 5550 y en BNB. Poco dinero, pero sin él no sale nada.',
    ]):
        h.append(x)
    h.append(PageBreak())

    # ── 8 · Riesgos ──────────────────────────────────────────────────────────
    h.append(P('8 · Lo que puede salir mal', 'h1'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Riesgo', 'Qué pasaría', 'Qué lo evita'],
        [
            ['Depósito sin dueño',
             'Llega USDT sin orden abierta, o desde un exchange.',
             'La orden con comprobante. Y un procedimiento escrito para lo que caiga suelto.'],
            ['Red equivocada',
             'Manda por Polygon una orden abierta para BNB.',
             'La orden fija la red. Si no coincide, queda retenido y se avisa, no se acredita.'],
            ['El precio congelado',
             'Se completan solo las órdenes que convienen a quien las abrió.',
             'Plazo corto, banda de tolerancia, tope por persona y tope total.'],
            ['El hueco de la salida',
             'Se cobró el ORIGEN y el USDT no salió.',
             'Estado propio, alarma, y resolución a mano el mismo día.'],
            ['Las llaves',
             'Quien tenga la de USDT o la de ORIGEN puede vaciarlas.',
             'Tres llaves separadas, cifradas, con tope diario y lo grueso en frío.'],
            ['Los decimales',
             'Acreditar una millonésima o cien billones.',
             'Una sola conversión, con prueba por cadena.'],
            ['Se acaba el ORIGEN',
             'Alguien paga y no hay con qué entregarle.',
             'Alarma de saldo bajo, y la calculadora deja de aceptar antes de quedarse en cero.'],
            ['Sanciones',
             'Recibir de, o pagar a, una dirección de la OFAC.',
             'Tamiz del origen y del destino. El motor ya existe y ya funciona.'],
        ],
        [32 * mm, 60 * mm, au - 92 * mm]))
    h.append(PageBreak())

    # ── 9 · Qué ocupo ────────────────────────────────────────────────────────
    h.append(P('9 · Lo que ocupo de vos', 'h1'))
    h.append(P('Sin esto no se puede empezar, o se empieza y se para a mitad.', 'pg'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Qué', 'Detalle'],
        [
            ['<b>La billetera de USDT</b>',
             'La que dijiste que proveerías. Necesito la dirección, y saber quién guarda la '
             'llave y cómo. Si la genero yo, queda cifrada con el mismo patrón que las demás '
             'de la casa.'],
            ['<b>La billetera de ORIGEN</b>',
             'Y con cuánto se fondea. Hoy el tesoro de Orden Global solo tiene dirección, sin '
             'llave privada: por eso la billetera actual no puede emitir ORIGEN. Esta sí tiene '
             'que poder firmar.'],
            ['<b>La comisión</b>',
             'De entrada y de salida. Y si la de salida cubre el costo de red o se cobra '
             'aparte.'],
            ['<b>El plazo del precio</b>',
             'Propongo 20 minutos con banda del 1 %. Decime si te sirve o lo movemos.'],
            ['<b>Los topes</b>',
             'Mínimo de depósito, máximo por operación, tope diario por persona, y órdenes '
             'abiertas a la vez.'],
            ['<b>La cuenta de RPC</b>',
             'Para las tres cadenas. Con servidores públicos, un depósito se puede quedar sin '
             'detectar, y eso es dinero de alguien que no aparece.'],
            ['<b>El visto bueno de la Junta</b>',
             'Sobre la salida. La entrada se puede construir mientras tanto.'],
        ],
        [42 * mm, au - 42 * mm]))
    h.append(PageBreak())

    # ── 10 · Fases ───────────────────────────────────────────────────────────
    h.append(P('10 · Cómo se construiría', 'h1'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Fase', 'Qué se entrega', 'Semanas'],
        [
            ['1 · Cimientos',
             'El registro de las tres cadenas, la conversión de decimales con su prueba, y '
             'las billeteras de la casa creadas y fondeadas. Sin tocar dinero de nadie.', '1'],
            ['2 · Calculadora y orden',
             'La pantalla que cotiza, el precio congelado con sus cuatro reglas, y la orden '
             'con su estado. Todavía sin mover dinero: se puede probar entera.', '1'],
            ['3 · Entrada',
             'Comprobante, verificación en cadena, confirmaciones, tamiz del origen, y el '
             'pago de ORIGEN a la billetera de la persona.', '1,5'],
            ['4 · Salida',
             'El botón en Veta Wallet, el cobro del ORIGEN, el pago del USDT en BNB, y el '
             'estado <i>debe</i> con su alarma. Tras el visto bueno de la Junta.', '1,5'],
            ['5 · Vigilancia',
             'Cuadre diario contra las tres cadenas, alarmas de saldo bajo, de gas y del '
             'hueco de la salida.', '0,5'],
        ],
        [34 * mm, au - 59 * mm, 25 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Lo que se puede probar sin arriesgar un centavo',
        'Las fases 1 y 2 completas, y la 3 contra las redes de prueba de cada cadena. Recién '
        'la primera operación real necesita dinero de verdad — y conviene que la primera la '
        'hagas vos, con un monto chico, antes de abrirla a nadie más.', VERDE))
    h.append(Spacer(1, 10))
    h.append(HRFlowable(width='100%', thickness=0.6, color=LINEA, spaceAfter=8))
    h.append(P(
        'Los precios de red, los decimales de los tres contratos de USDT y el precio del oro '
        'se midieron el 3 de septiembre de 2026 contra Ethereum, Polygon, BNB Smart Chain y '
        'la fuente de precio del oro. El estado del código se verificó contra lo que corre en '
        'producción ese mismo día.', 'pie'))

    doc.build(h)
    print('  PDF escrito en', SALIDA)


if __name__ == '__main__':
    construir()
