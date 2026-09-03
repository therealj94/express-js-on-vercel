#!/usr/bin/env python3
"""Las opciones de cash in y cash out de Ordenex, con el lente de dos empresas.

Este es el tercer documento y el que cambia el marco: Ordenex y Orden Global son
empresas distintas. Eso descarta cosas que en un solo grupo serían razonables
—entre ellas una que yo mismo había recomendado— y ordena las demás.

Cada opción se juzga por cuatro cosas: qué hace la persona, de quién es el
dinero en cada tramo, qué se puede probar después, y qué pasa el día que algo
salga mal.
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
SALIDA = os.path.join(AQUI, 'ordenex-opciones-cash-in-out.pdf')

ROTULO[0] = 'ORDENEX  ·  Opciones de cash in y cash out  ·  Dos empresas'
FECHA[0] = '3 de septiembre de 2026'


def construir():
    doc = BaseDocTemplate(SALIDA, pagesize=LETTER,
                          leftMargin=MARGEN, rightMargin=MARGEN,
                          topMargin=22 * mm, bottomMargin=20 * mm,
                          title='Ordenex · Opciones de cash in y cash out',
                          author='Orden Global Corp',
                          subject='Opciones para decidir')
    marco = Frame(MARGEN, 20 * mm, ANCHO - 2 * MARGEN, ALTO - 42 * mm, id='cuerpo')
    doc.addPageTemplates([PageTemplate(id='normal', frames=[marco], onPage=decorar)])

    h = []
    au = ANCHO - 2 * MARGEN

    # ── Portada ──────────────────────────────────────────────────────────────
    h.append(Spacer(1, 28 * mm))
    h.append(Paragraph('ORDENEX', ParagraphStyle(
        'marca', fontName='Helvetica-Bold', fontSize=11, leading=13,
        textColor=ORO, spaceAfter=10)))
    h.append(P('Las opciones de cash in y cash out<br/>con dos empresas de por medio', 'titulo'))
    h.append(HRFlowable(width='30%', thickness=2, color=ORO, spaceBefore=10,
                        spaceAfter=12, hAlign='LEFT'))
    h.append(P('Tres formas de recibir, tres de pagar, y de quién es el dinero '
               'en cada tramo.', 'subtitulo'))
    h.append(Spacer(1, 6 * mm))
    h.append(recuadro(
        'Lo que cambió desde el documento anterior',
        'Ordenex y Orden Global son <b>empresas distintas</b>. Eso no es un detalle de '
        'organigrama: descarta opciones que en un solo grupo serían razonables. En concreto, '
        'descarta la que yo mismo había recomendado — usar la dirección de Veta Wallet — '
        'porque esa llave la tiene Orden Global, y el dinero de los clientes de Ordenex no '
        'puede pasar por manos de la otra empresa. La razón está en la página 2.'))
    h.append(Spacer(1, 8 * mm))
    h.append(P('Costos de red y precio del oro medidos el 3 de septiembre de 2026. El estado '
               'del código de Ordenex verificado contra el repositorio el mismo día.', 'pg'))
    h.append(PageBreak())

    # ── 1 · El marco ─────────────────────────────────────────────────────────
    h.append(P('1 · Qué cambia por ser dos empresas', 'h1'))
    h.append(P(
        'Cuando todo es del mismo grupo, «dónde cae el dinero» es una decisión de comodidad. '
        'Con dos empresas es una decisión de propiedad, y se juzga distinto: no por lo que '
        'ahorra, sino por lo que se puede sostener el día que alguien pregunte de quién era '
        'ese dinero a las tres de la tarde.'))
    h.append(Spacer(1, 4))
    h.append(P('Tres reglas que salen de ahí', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>Cada llave tiene un solo dueño.</b> Una llave de Ordenex la controla Ordenex. '
        'Orden Global no puede mover el USDT de Ordenex ni al revés — y no porque no se '
        'confíen, sino porque si pueden hacerlo, la separación no existe.',
        '<b>El dinero del cliente no pasa por la otra empresa.</b> Ni un minuto. Si el USDT '
        'toca una dirección de Orden Global antes de llegar a Ordenex, hubo un momento en que '
        'una empresa custodió fondos del negocio de la otra.',
        '<b>Cada movimiento tiene un nombre en los dos libros.</b> Lo que para Ordenex es una '
        'compra, para Orden Global es una venta. Si un movimiento no se puede nombrar en los '
        'dos lados, el diseño está mal.',
    ]):
        h.append(x)
    h.append(Spacer(1, 6))
    h.append(recuadro(
        'La opción que queda descartada, y por qué',
        'Recibir el USDT en la dirección que la persona ya tiene en Veta Wallet era lo más '
        'cómodo: una sola dirección en todo el ecosistema y nada que pegar. Pero esa llave la '
        'guarda el backend de Orden Global. Para llevar ese dinero a Ordenex, <b>Orden Global '
        'tendría que firmar</b> — o sea que Ordenex dependería de la otra empresa para cobrar '
        'lo suyo, y en los libros ese dinero habría estado en manos ajenas. Se descarta.',
        ALERTA))
    h.append(PageBreak())

    # ── 2 · El recorrido del dinero ──────────────────────────────────────────
    h.append(P('2 · De quién es el dinero en cada tramo', 'h1'))
    h.append(P(
        'Esta es la tabla que hay que poder enseñar. Vale para cualquiera de las opciones '
        'que siguen: lo que cambia entre ellas es el tramo 2.', 'pg'))
    h.append(Spacer(1, 6))
    h.append(P('La entrada: la persona compra ORIGEN', 'h2'))
    h.append(Spacer(1, 2))
    h.append(tabla(
        ['Tramo', 'Qué pasa', 'De quién es'],
        [
            ['1', 'La persona tiene USDT en su exchange o billetera.', 'De la persona'],
            ['2', 'Manda el USDT a una dirección de Ordenex.',
             '<b>De Ordenex</b> desde que llega. Nunca de Orden Global.'],
            ['3', 'Ordenex le entrega ORIGEN a su dirección de Veta Wallet.',
             'El ORIGEN pasa a ser de la persona, en custodia de Orden Global.'],
            ['4', 'Ordenex se queda con el USDT y con su comisión.', 'De Ordenex'],
        ],
        [16 * mm, 78 * mm, au - 94 * mm]))
    h.append(Spacer(1, 8))
    h.append(P('La salida: la persona vende ORIGEN', 'h2'))
    h.append(Spacer(1, 2))
    h.append(tabla(
        ['Tramo', 'Qué pasa', 'De quién es'],
        [
            ['1', 'La persona tiene ORIGEN en Veta Wallet.',
             'De la persona, en custodia de Orden Global.'],
            ['2', 'Su ORIGEN se mueve a la billetera ORIGEN de Ordenex.',
             '<b>De Ordenex</b>. Es una venta de la persona a Ordenex.'],
            ['3', 'Ordenex le manda USDT a la dirección que la persona dio.',
             'De la persona, ya fuera del ecosistema.'],
        ],
        [16 * mm, 78 * mm, au - 94 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'La pregunta que hay que contestar antes de escribir código',
        'En el tramo 3 de la entrada, <b>¿de dónde sale ese ORIGEN?</b> O Ordenex lo tiene '
        'de inventario propio, o se lo compra a Orden Global cada vez. Son dos negocios '
        'distintos, con dos contabilidades distintas, y el código se escribe diferente. No '
        'es una pregunta técnica: es la que define qué empresa es Ordenex.'))
    h.append(PageBreak())

    # ── 3 · Cash in · las tres opciones ──────────────────────────────────────
    h.append(P('3 · Cash in · Las tres formas de recibir', 'h1'))
    h.append(P(
        'Las tres terminan igual: el USDT consolidado en la billetera de Ordenex. Lo que '
        'cambia es <b>dónde cae primero</b> y <b>qué tiene que hacer la persona</b>.', 'pg'))

    h.append(P('Opción A · Una sola billetera de Ordenex', 'h2'))
    h.append(P(
        'Todos mandan a la misma dirección. La que dijiste que proveerías.'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>Qué hace la persona:</b> abre la orden, copia la dirección, manda, y después '
        '<b>copia el identificador de su transacción y lo pega</b> en Ordenex.',
        '<b>Por qué ese paso extra es obligatorio:</b> si todos mandan al mismo sitio, la '
        'cadena no dice quién mandó qué. Y cuando alguien retira desde Binance, la dirección '
        'que aparece es la de Binance, no la suya.',
        '<b>A favor:</b> una sola dirección que vigilar, un solo saldo que mirar, y el dinero '
        'ya está junto sin barrer nada.',
        '<b>En contra:</b> el paso de pegar el comprobante es donde más gente se traba. Pegan '
        'un enlace, pegan el de otra operación, o no lo encuentran.',
    ]):
        h.append(x)

    h.append(P('Opción B · Una dirección por persona, derivada por Ordenex', 'h2'))
    h.append(P(
        'Cada quien tiene la suya, generada con la llave de Ordenex. Ya está construido en '
        'Ordenex: la dirección y su llave cifrada existen desde el diseño original.'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>Qué hace la persona:</b> abre la orden, copia <b>su</b> dirección, manda. Y '
        'aparece. Nada que pegar.',
        '<b>De quién es el dinero:</b> de Ordenex desde el primer segundo. Esas direcciones '
        'las controla la llave de Ordenex, no la de Veta Wallet.',
        '<b>El barrido:</b> se consolida a la billetera principal. Cuesta <b>menos de un '
        'centavo por depósito</b>, medido. Con mil depósitos al mes, unos seis dólares.',
        '<b>A favor:</b> es lo más fácil que puede ser para quien deposita. Y si se equivoca '
        'de red entre las tres, el dinero llega igual: la misma dirección existe en las tres.',
        '<b>En contra:</b> el dinero pasa unos minutos repartido antes de juntarse, y hay que '
        'vigilar muchas direcciones en vez de una.',
    ]):
        h.append(x)

    h.append(P('Opción C · Un contrato receptor de Ordenex', 'h2'))
    h.append(P(
        'La persona llama a una función del contrato en vez de hacer un envío simple. El '
        'contrato deja escrito en la cadena quién depositó.'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>A favor:</b> la atribución queda en la cadena, sin comprobante y sin barrido. Es '
        'la prueba más limpia de todas.',
        '<b>En contra, y es grave:</b> <b>no funciona desde un exchange</b>. Binance solo hace '
        'envíos simples, no llama funciones. Y de un exchange va a venir casi todo el USDT.',
        '<b>Además:</b> obliga a dos transacciones —autorizar y depositar— y el doble de gas, '
        'que paga la persona.',
    ]):
        h.append(x)
    h.append(PageBreak())

    # ── 4 · Comparación cash in ──────────────────────────────────────────────
    h.append(P('4 · Cash in · Comparación y recomendación', 'h1'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['', 'A · Una billetera', 'B · Por persona', 'C · Contrato'],
        [
            ['Pasos de la persona', '5, uno de ellos pegar', '4', '4, pero dos firmas'],
            ['Sirve desde un exchange', 'Sí', 'Sí', '<b>No</b>'],
            ['Dinero de Ordenex desde', 'el primer segundo', 'el primer segundo', 'el primer segundo'],
            ['Si se equivoca de red', 'Llega igual', 'Llega igual', 'No llega: hay que rehacer'],
            ['Costo de red para la casa', 'Ninguno', 'Menos de 1 centavo', 'Ninguno'],
            ['Qué se vigila', '1 dirección', 'Muchas direcciones', '1 contrato'],
            ['Ya está construido', 'No', '<b>Sí, en parte</b>', 'No'],
        ],
        [40 * mm, 40 * mm, 38 * mm, au - 118 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Recomendación',
        'La <b>B</b> de arranque. Es la más fácil para quien deposita, el dinero es de '
        'Ordenex desde el primer segundo igual que en la A, y buena parte ya está escrita. El '
        'barrido cuesta menos que el café de la mañana al mes.<br/><br/>'
        'La <b>C</b> se puede sumar después como comodidad para quien use billetera propia. '
        'La <b>A</b> es la que elegiría si lo que más pesa es tener un solo saldo que mirar y '
        'no te molesta el paso de pegar — y es una razón legítima; solo conviene elegirla por '
        'eso y no por control, porque en control las tres son iguales.', VERDE))
    h.append(Spacer(1, 6))
    h.append(P('Y esto vale para las tres', 'h2'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>TRON no.</b> Es la red de USDT más usada y más barata, y no es EVM: esa dirección '
        'no existe ahí. Lo que se mande por TRC20 se pierde. Tiene que estar en rojo en la '
        'pantalla, y no como advertencia legal sino como aviso grande.',
        '<b>Lo que llegue sin orden</b> queda retenido y se avisa. Hace falta un procedimiento '
        'escrito para devolverlo o aplicarlo, decidido antes de que pase.',
        '<b>Otro token que no sea USDT</b> no se acredita nunca. Queda quieto.',
    ]):
        h.append(x)
    h.append(PageBreak())

    # ── 5 · Cash out ─────────────────────────────────────────────────────────
    h.append(P('5 · Cash out · Las tres formas de pagar', 'h1'))
    h.append(P(
        'Acá el eje no es dónde cae el dinero, sino <b>quién autoriza que salga</b>. Y hay '
        'un hecho que manda sobre las tres: el ORIGEN vive en la cadena 5550 y el USDT en '
        'BNB. Ningún contrato puede cobrar en una y pagar en la otra en el mismo acto. '
        'Siempre son dos pasos con alguien en el medio.', 'pg'))

    h.append(P('Opción A · Manual', 'h2'))
    h.append(P('Ordenex cobra el ORIGEN automáticamente, y una persona revisa y firma cada '
               'pago de USDT.'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>A favor:</b> ninguna llave con saldo puede pagar sola. Un fallo del sistema no '
        'saca un centavo.',
        '<b>En contra:</b> el retiro tarda lo que tarde esa persona. De noche y en fin de '
        'semana, no hay retiros. Y no escala.',
    ]):
        h.append(x)

    h.append(P('Opción B · Automático con topes', 'h2'))
    h.append(P('El servidor firma, con límite por operación, límite diario, y la reserva '
               'guardada aparte en frío.'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>A favor:</b> el retiro sale en minutos, a cualquier hora, sin nadie despierto.',
        '<b>En contra:</b> hay una llave con saldo que puede pagar sola. Lo que la acota es '
        'el tope: si se pierde, se va lo que había en la caliente, no el fondo.',
    ]):
        h.append(x)

    h.append(P('Opción C · Automático hasta un monto, revisado arriba de él', 'h2'))
    h.append(P('Lo chico sale solo; lo grande espera una firma humana.'))
    h.append(Spacer(1, 2))
    for x in vinetas([
        '<b>A favor:</b> el 95 % de los retiros son chicos y salen solos. El daño posible de '
        'la llave queda acotado al tope de lo automático.',
        '<b>En contra:</b> alguien tiene que estar disponible para los grandes, y hay que '
        'decidir el umbral — y revisarlo cuando el negocio crezca.',
    ]):
        h.append(x)
    h.append(Spacer(1, 8))
    h.append(tabla(
        ['', 'A · Manual', 'B · Automático', 'C · Mixto'],
        [
            ['Cuánto tarda un retiro', 'Horas, y no de noche', 'Minutos, siempre', 'Minutos si es chico'],
            ['Si roban la llave', 'No hay llave con saldo', 'Se va la caliente', 'Se va el tope diario'],
            ['Trabajo humano', 'Cada retiro', 'Ninguno', 'Solo los grandes'],
            ['Aguanta crecer', 'No', 'Sí', 'Sí'],
        ],
        [42 * mm, 40 * mm, 38 * mm, au - 120 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Recomendación',
        'Empezar en <b>A</b> las primeras semanas — con poco volumen, revisar cada retiro a '
        'mano es barato y enseña cómo se comporta la gente de verdad — y pasar a <b>C</b> en '
        'cuanto el volumen moleste. La <b>B</b> pura solo cuando los topes y las alarmas '
        'lleven tiempo probados.<br/><br/>'
        'Y sea cual sea: el ORIGEN se cobra <b>antes</b> de pagar el USDT, nunca al revés. '
        'Al revés, un fallo regala dinero.', VERDE))
    h.append(PageBreak())

    # ── 6 · El hueco ─────────────────────────────────────────────────────────
    h.append(P('6 · El instante en que la persona confía', 'h1'))
    h.append(P(
        'En cualquiera de las tres opciones de salida hay un momento en que la persona ya '
        'entregó su ORIGEN y todavía no recibió su USDT. No se puede eliminar sin un puente '
        'entre cadenas, que es otro proyecto entero y con riesgos peores. Lo que sí se puede '
        'es hacerlo corto, visible, y que nunca pase inadvertido.'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Qué', 'Por qué'],
        [
            ['El orden: cobrar y después pagar',
             'Al revés, cualquier fallo entre los dos pasos regala USDT.'],
            ['Un estado propio para ese hueco',
             'La operación no está «pendiente»: está <i>cobrada y sin pagar</i>. Es distinto '
             'y merece nombre propio, porque es una deuda de Ordenex con esa persona.'],
            ['Alarma si dura minutos',
             'Sin alarma, nadie se entera hasta que la persona reclama. Y para entonces ya '
             'perdió la confianza.'],
            ['Que la persona lo vea',
             'Debe leer «recibimos tu ORIGEN, estamos enviando tu USDT» y después el '
             'identificador. No un giro que da vueltas sin decir nada.'],
            ['Cuadre diario',
             'Comparar el libro contra las cadenas todos los días. Un descuadre se ve el '
             'mismo día, no el mes siguiente.'],
        ],
        [56 * mm, au - 56 * mm]))
    h.append(PageBreak())

    # ── 7 · Lo que hay que definir ───────────────────────────────────────────
    h.append(P('7 · Lo que hay que definir entre las dos empresas', 'h1'))
    h.append(P(
        'Esto no es técnico y por eso es lo primero. Tres de estas respuestas cambian el '
        'código, no la pantalla.', 'pg'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Pregunta', 'Por qué importa'],
        [
            ['¿De dónde saca Ordenex el ORIGEN que vende?',
             'Si es inventario propio, Ordenex compra ORIGEN a alguien alguna vez y eso es un '
             'contrato. Si se lo pide a Orden Global en cada compra, es una operación entre '
             'empresas por cada cliente. El código y los libros son distintos.'],
            ['¿De quién es la comisión?',
             '¿Toda de Ordenex? ¿Ordenex le paga a Orden Global por el cliente, por Genesis ID '
             'o por el SSO? Si hay pago, tiene que salir en los dos libros.'],
            ['En el retiro, ¿qué operación es?',
             'La persona le vende ORIGEN a Ordenex. Orden Global mueve el ORIGEN porque lo '
             'custodia, no porque sea suyo. Hay que poder decirlo así.'],
            ['¿Quién responde ante la persona?',
             'Entró por Veta Wallet y le pagó a Ordenex. Si algo falla, ¿a quién reclama? La '
             'respuesta va en los términos, y hay que escribirla antes de la primera operación.'],
            ['¿Quién guarda cada llave?',
             'Las de Ordenex no puede tenerlas quien opera Veta Wallet. Si las tiene la misma '
             'persona, la separación es de papel.'],
            ['¿Y el tesoro de Ordenex, en qué está?',
             'Si guarda USDT, el movimiento del oro le pega. Si guarda ORIGEN, lo que debe y '
             'lo que tiene se mueven juntos y el riesgo se cancela solo.'],
        ],
        [58 * mm, au - 58 * mm]))
    h.append(PageBreak())

    # ── 8 · Recomendación ────────────────────────────────────────────────────
    h.append(P('8 · Lo que recomiendo, junto', 'h1'))
    h.append(Spacer(1, 4))
    h.append(tabla(
        ['Decisión', 'Recomendación', 'Por qué'],
        [
            ['Cómo se recibe', 'Dirección por persona, derivada por Ordenex',
             'Lo más fácil para quien deposita, y de Ordenex desde el primer segundo.'],
            ['Dónde termina el USDT', 'Barrido a la billetera de Ordenex',
             'Es lo que pediste, y cuesta menos de un centavo por depósito.'],
            ['Redes de entrada', 'BNB, Polygon y Ethereum',
             'El gas de entrada lo paga quien manda, así que aceptar las tres no cuesta nada.'],
            ['Red de salida', 'Solo BNB',
             'En la salida el gas lo paga la casa, y Ethereum se dispara sin aviso.'],
            ['Quién autoriza los pagos', 'Manual al principio, mixto después',
             'Con poco volumen revisar a mano es barato y enseña mucho.'],
            ['El precio', 'Congelado 20 minutos, banda del 1 %, con topes',
             'Sin topes, congelar el precio es regalar una opción contra la casa.'],
            ['El tesoro de Ordenex', 'Mayoritariamente en ORIGEN',
             'Es lo único que cancela de verdad el riesgo del precio del oro.'],
        ],
        [36 * mm, 52 * mm, au - 88 * mm]))
    h.append(Spacer(1, 8))
    h.append(recuadro(
        'Y el orden de las cosas',
        'Primero las seis respuestas de la página 8 — sin ellas se escribe código que después '
        'hay que tirar. Después las llaves de Ordenex, creadas y fondeadas. Después la '
        'entrada, que se puede probar entera contra redes de prueba sin arriesgar un centavo. '
        'Y la salida al final, cuando la Junta haya mirado el encuadre.<br/><br/>'
        'La primera operación real conviene que la hagas vos, con un monto chico, antes de '
        'abrirla a nadie más.', VERDE))
    h.append(Spacer(1, 10))
    h.append(HRFlowable(width='100%', thickness=0.6, color=LINEA, spaceAfter=8))
    h.append(P(
        'Tercer documento de la serie. El primero compara las formas de custodiar los '
        'depósitos; el segundo describe el circuito completo tal como lo planteaste; este '
        'ordena las opciones con el lente de dos empresas separadas. Los tres se generan '
        'desde el repositorio y se pueden volver a construir cuando cambien las cifras.', 'pie'))

    doc.build(h)
    print('  PDF escrito en', SALIDA)


if __name__ == '__main__':
    construir()
