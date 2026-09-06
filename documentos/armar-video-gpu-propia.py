#!/usr/bin/env python3
"""Documento técnico 8 · Video de alta calidad en GPU propia.

José pidió el plan escrito antes de encender nada: «primero el plan». Así que
este documento no gasta un dólar ni levanta una máquina. Propone, cuesta y
marca los puntos donde se decide seguir o parar.

Nace de una pregunta suya —«quiero hacer videos alta calidad en local, tenemos
AWS, ¿podemos encontrar una nueva que funcione?»— sobre el Manual técnico 7,
que había cerrado el asunto diciendo que ningún modelo alojable sostiene la
cara de una persona entre tomas.

Ese cierre era correcto en lo que midió y equivocado en lo que no miró. Las
tres correcciones están en la sección 2 y cada una se comprobó: las dos
primeras contra fuentes públicas del 2026, la tercera ejecutando comandos
contra nuestra propia cuenta de AWS.

Lo que el Manual 7 dejó bien —la marca en post, las referencias normalizadas,
el guion único, Remotion, los diecisiete errores— no se toca y se dice
explícitamente, para que este documento no se lea como un reemplazo.
"""

import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Spacer, PageBreak, HRFlowable, KeepTogether,
)

from marca_pdf import (
    ORO, TINTA, GRIS, LINEA, ALERTA, VERDE, ANCHO, ALTO, MARGEN,
    E, P, vinetas, tabla, recuadro, paso, decorar, ROTULO, FECHA,
)

def junto(*cosas):
    """Lo que no debe partirse entre dos páginas.

    Una tabla de cuatro filas cortada dejando dos arriba y dos abajo obliga a
    volver la página para comparar dos números que se pusieron juntos justamente
    para compararse. Las tablas largas sí se dejan fluir: partir una de diez
    filas no cuesta nada y forzarla entera abriría un hueco peor."""
    return KeepTogether(list(cosas))


AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, 'Orden-Global-Video-GPU-Propia.pdf')

ROTULO[0] = 'ORDEN GLOBAL  ·  Video de alta calidad en GPU propia  ·  Documento técnico 8'
FECHA[0] = '6 de septiembre de 2026'


def construir():
    doc = BaseDocTemplate(SALIDA, pagesize=LETTER,
                          leftMargin=MARGEN, rightMargin=MARGEN,
                          topMargin=22 * mm, bottomMargin=20 * mm,
                          title='Orden Global · Video de alta calidad en GPU propia',
                          author='Orden Global Corp',
                          subject='Plan técnico y corrección del Manual 7')
    marco = Frame(MARGEN, 20 * mm, ANCHO - 2 * MARGEN, ALTO - 42 * mm, id='cuerpo')
    doc.addPageTemplates([PageTemplate(id='normal', frames=[marco], onPage=decorar)])

    h = []
    au = ANCHO - 2 * MARGEN

    # ── Portada ─────────────────────────────────────────────────────────────
    h += [
        P('Video de alta calidad<br/>en nuestra propia GPU', 'titulo'),
        P('Plan por etapas y corrección de tres puntos del Manual técnico 7. '
          'Qué se puede mover hoy a máquinas nuestras, qué todavía no, cuánto '
          'cuesta cada etapa y en qué punto exacto se decide seguir o parar.', 'subtitulo'),
        recuadro('Nada de esto se ha gastado ni encendido',
                 'José pidió el plan antes que la prueba. No hay ninguna máquina levantada, '
                 'ningún modelo descargado y ningún cargo generado por este documento. Lo único '
                 'que se ejecutó fueron consultas de solo lectura al catálogo y a las cuotas de '
                 'nuestra cuenta de AWS, que no cuestan nada.'),
        Spacer(1, 10),
        P('Documento técnico 8 · No es un documento de Junta. Se lee después del Manual 7 y no lo reemplaza.', 'pie'),
        PageBreak(),
    ]

    # ── 1 · Lo que no se toca ───────────────────────────────────────────────
    h += [
        P('1 · Lo que el Manual 7 resolvió bien y aquí no se toca', 'h1'),
        P('Un documento que corrige otro tiene la obligación de decir primero qué deja en pie. '
          'Todo esto sigue vigente sin cambios, y quien produzca el próximo comercial debe '
          'seguirlo tal como está escrito allí:'),
    ]
    h += vinetas([
        '<b>La marca se compone en post.</b> El modelo pone la fotografía; el contador, los '
        'subtítulos, las cartelas y el monograma los dibuja el código. Un carácter de más en un '
        'logotipo generado mata el remate, y una corrección de texto tiene que costar un render '
        'y no una generación.',
        '<b>Referencias de 1440×1440 normalizadas</b>, con el mismo encuadre, fondo y luz. A un '
        'modelo no se le describe un logotipo: se le entrega.',
        '<b>Un solo <font face="Courier">src/guion.ts</font></b> con todos los tiempos, cifras y '
        'colores. Ningún otro archivo con un número a mano.',
        '<b>Remotion para el montaje, y Remotion Lambda para el render.</b> Es la pieza de AWS '
        'que el proyecto de verdad necesita: sin servidor encendido, sin cuota que pedir, '
        'céntimos por render. Nada de este documento la cambia.',
        '<b>Los diecisiete errores de la sección 7</b>, en particular los de criterio: la víctima '
        'no ve el robo, la física manda sobre la estética, y ver la referencia que nombró el '
        'cliente antes de escribir una línea.',
    ])
    h += [
        Spacer(1, 6),
        recuadro('El principio que sobrevive intacto y que además ordena este plan',
                 'La generación de imagen y el montaje son dos oficios distintos y se decidieron por '
                 'separado en el Manual 7. Esa separación es la que permite cambiar de modelo sin '
                 'tocar el montaje. Todo lo que sigue afecta únicamente a la mitad de la generación.'),
    ]

    # ── 2 · Las correcciones ────────────────────────────────────────────────
    h += [P('2 · Tres correcciones al Manual 7', 'h1')]

    h += [
        P('2.1 · La pregunta estaba mal planteada', 'h2'),
        P('El Manual 7 buscó un modelo base que sostuviera la cara de una persona entre tomas '
          'con solo el prompt y una imagen de referencia, probó Wan 2.2, HunyuanVideo y '
          'LTX-Video, y concluyó que ninguno lo hace. La conclusión es cierta y hay que '
          'agrandarla: <b>ningún modelo lo hace por esa vía</b>. Las comparativas de 2026 miden '
          'que tanto Wan 2.2 como HunyuanVideo 1.5 pierden la identidad del personaje pasados '
          'unos cinco a siete segundos, y ese es el techo práctico de un clip en cualquiera de '
          'los dos.'),
        P('Pero en el mundo de los modelos abiertos la identidad no se resuelve cambiando de '
          'modelo base. Se resuelve <b>entrenando un LoRA de esa persona</b>: un archivo '
          'pequeño, de unos pocos cientos de megas, que se entrena con veinticinco a treinta '
          'fotos de la misma cara en ángulos y luces distintos y que después se le acopla al '
          'modelo en cada generación. La documentación de entrenamiento de Wan 2.2 lo dice sin '
          'rodeos: sin LoRA la cara deriva —cambia la nariz, la forma del ojo, la estructura '
          'facial a media toma—, y un LoRA bien entrenado da consistencia más fiable que '
          'cualquier prompt o imagen de referencia.'),
        P('Esa palanca no aparece en ninguna parte del Manual 7. Es la corrección de fondo, '
          'porque cambia el veredicto: lo que se había declarado imposible es un problema '
          'resuelto por otro camino.', 'p'),
        Spacer(1, 4),
        recuadro('Y hay una ventaja que no es técnica',
                 'Un LoRA se entrena una vez y queda. El personaje deja de ser algo que hay que '
                 'volver a convencer al proveedor de que reproduzca en cada generación y pasa a ser '
                 'un archivo nuestro, versionado en el repositorio, que funciona igual dentro de un '
                 'año. Con Seedance, la cara del comercial vive en la infraestructura de ByteDance.'),
        Spacer(1, 8),
    ]

    h += [
        P('2.2 · La evaluación de LTX está dos generaciones vieja', 'h2'),
        P('El Manual 7 descarta «LTX-Video (Lightricks)» por calidad insuficiente para una pieza '
          'de marca. Ese juicio era correcto para el modelo que probó, pero ese modelo ya tiene '
          'dos sucesores:'),
        Spacer(1, 4),
        junto(tabla(['Versión', 'Salió', 'Qué trae'],
              [['LTX-Video', 'el que probó el Manual 7',
                'Cabía en 24 GB. Calidad por debajo de lo que pide una marca.'],
               ['LTX-2.3', '5 de marzo de 2026',
                '22 mil millones de parámetros (14B de video y 5B de audio). Clips de hasta '
                '20 segundos. Adaptadores IC-LoRA con condicionamiento de pose, profundidad y bordes.'],
               ['LTX-2.5', '11 de agosto de 2026',
                'Pesos abiertos. Audio y video en una sola pasada, que ningún otro abierto hace. '
                'Uso gratuito por debajo de 10 millones de dólares de facturación anual.']],
              [0.16 * au, 0.20 * au, 0.64 * au])),
        Spacer(1, 6),
        P('Los clips de veinte segundos importan más de lo que parece. El Manual 7 anota como '
          'defecto de Veo 3 que sus tomas de cuatro a ocho segundos obligan a diez o más '
          'generaciones para un comercial de sesenta y tres. Veinte segundos por toma cambia esa '
          'aritmética entera.'),
        Spacer(1, 4),
        recuadro('Una trampa que hay que decir por su nombre',
                 'Circulan páginas ofreciendo descargas de «Wan 2.7». No existe: los pesos abiertos '
                 'oficiales de Wan se detienen en la 2.2, y lo que esas páginas distribuyen no es lo '
                 'que dicen. Antes de bajar un modelo hay que verificar que salga del repositorio del '
                 'fabricante en Hugging Face y de ningún otro sitio.', ALERTA),
        Spacer(1, 8),
    ]

    h += [
        P('2.3 · El trámite de cuota que el Manual 7 temía no aplica a nuestra cuenta', 'h2'),
        P('El Manual 7 avisa, con razón como advertencia general, que las familias G y P de AWS '
          'vienen con cuota cero en una cuenta nueva y que el aumento tarda de horas a días, y '
          'concluye que ese trámite hay que abrirlo antes de prometer una fecha. '
          '<b>En la cuenta de Orden Global ese trámite ya está hecho.</b> Medido hoy con '
          '<font face="Courier">aws service-quotas list-service-quotas</font> sobre '
          '<font face="Courier">us-east-1</font>:'),
        Spacer(1, 4),
        junto(tabla(['Cuota', 'Código', 'Valor', 'Qué significa'],
              [['Instancias G y VT bajo demanda', 'L-DB2E81BA', '384 vCPU',
                'Podemos encender una GPU hoy mismo, sin pedir nada.'],
               ['Instancias P bajo demanda', 'L-417A185B', '384 vCPU',
                'También las de entrenamiento, aunque no hacen falta.'],
               ['G y VT en Spot', 'L-3819A6DF', '0',
                'Esto sí está en cero. No hay GPU a precio de Spot sin pedirlo antes.']],
              [0.30 * au, 0.16 * au, 0.12 * au, 0.42 * au])),
        Spacer(1, 5),
        P('Que el cupo bajo demanda esté abierto también se comprueba solo: la máquina del '
          'cerebro de ULTRON es una <font face="Courier">g5.xlarge</font> con una A10G y lleva '
          'semanas encendida.', 'pg'),
    ]

    # ── 3 · Las máquinas ────────────────────────────────────────────────────
    h += [
        P('3 · Las máquinas, con precios leídos hoy', 'h1'),
        P('Los precios del Manual 7 eran aproximados y pedía verificarlos antes de comprometer '
          'nada. Se verificaron con la API de precios de AWS para '
          '<font face="Courier">us-east-1</font>, Linux, tenencia compartida. Coinciden con los '
          'suyos hasta el céntimo, así que su tabla era buena:'),
        Spacer(1, 4),
        tabla(['Instancia', 'GPU y VRAM', 'CPU y RAM', 'USD/hora', 'Para qué'],
              [['<b>g6e.xlarge</b>', 'L40S · 45 GB', '4 vCPU · 32 GB', '<b>1,861</b>',
                '<b>La recomendada.</b> Entra Wan 2.2 de 14B y LTX-2.5 sin cuantizar, y la misma '
                'máquina entrena los LoRA.'],
               ['g6e.2xlarge', 'L40S · 45 GB', '8 vCPU · 64 GB', '2,242',
                'La misma GPU con el doble de CPU y memoria. Solo si el cuello resulta ser el '
                'preprocesado, cosa que hoy no sabemos.'],
               ['g5.2xlarge', 'A10G · 22 GB', '8 vCPU · 32 GB', '1,212',
                'Obliga a cuantizar el modelo grande. Ahí es donde se pierde el rostro: es el '
                'error que el propio Manual 7 documentó con Wan 2.2 de 5B.'],
               ['g6.xlarge', 'L4 · 22 GB', '4 vCPU · 16 GB', '0,805',
                'La más barata con GPU. Sirve para probar el circuito y para modelos chicos, no '
                'para la toma final.']],
              [0.14 * au, 0.15 * au, 0.16 * au, 0.12 * au, 0.43 * au]),
        Spacer(1, 6),
        recuadro('Por qué no la barata',
                 'La tentación es empezar por la g6.xlarge o la g5.2xlarge, que cuestan la mitad. '
                 'Con 22 GB de VRAM hay que cuantizar el modelo de 14B para que entre, y cuantizar '
                 'es exactamente lo que degrada primero: la cara. El Manual 7 ya pagó ese precio con '
                 'Wan 2.2 de 5B cuantizado y lo anotó como «calidad insuficiente para rostros». '
                 'Ahorrar un dólar por hora para volver a medir el mismo fracaso no es ahorrar.'),
        Spacer(1, 8),
        P('Y se mantiene sin discusión lo que el Manual 7 ya dejó claro: <b>los siete nodos de la '
          'cadena 5550 no se tocan.</b> No tienen GPU, están dimensionados para firmar bloques y '
          'llevan la cadena de la empresa encima. La infraestructura de video va en máquinas '
          'aparte de la misma cuenta.'),
    ]

    # ── 4 · Qué se mueve y qué no ───────────────────────────────────────────
    h += [
        P('4 · Qué se puede mover hoy y qué todavía no', 'h1'),
        P('La respuesta honesta no es «sí» ni «no», es una raya en medio del trabajo. De un lado '
          'de la raya los modelos abiertos ya están a la altura; del otro, todavía no.'),
        Spacer(1, 4),
        tabla(['Tipo de toma', '¿A GPU propia?', 'Por qué'],
              [['Producto, mineral, objeto, textura, planos abstractos, movimientos de cámara '
                'sobre cosas quietas',
                '<b>Sí, hoy</b>',
                'No hay rostro que sostener. El propio Manual 7 ya concedía que Nova Reel y Luma '
                'sirven «para planos de objeto o abstractos». Los abiertos están por encima de esos dos.'],
               ['Tomas con personas, con un LoRA entrenado por personaje',
                'Probable, hay que medirlo',
                'El LoRA resuelve la identidad. Lo que falta comprobar es si el fotorrealismo de '
                'piel y ojos de Wan 2.2 o LTX-2.5 aguanta al lado de Seedance en la misma pantalla. '
                'Eso no se decide leyendo: se genera el mismo plano con los dos y se miran juntos.'],
               ['Tomas con personas, sin LoRA, solo con imagen de referencia',
                '<b>No</b>',
                'Es lo que el Manual 7 midió y descartó, y sigue siendo cierto.'],
               ['Montaje, contador, cartelas, subtítulos, sonido, render',
                '<b>Ya está resuelto</b>',
                'Remotion Lambda. No necesita GPU ni cambia nada.']],
              [0.26 * au, 0.16 * au, 0.58 * au]),
        Spacer(1, 6),
        P('De ahí sale la recomendación de fondo, que no es sustituir a Seedance de golpe sino '
          '<b>un reparto</b>: lo que no lleva cara se genera en máquina nuestra desde la primera '
          'semana, y las tomas con personas siguen en Seedance mientras se entrenan y se miden '
          'los LoRA. Si la etapa 1 sale bien, se cruzan; si sale mal, no se ha roto nada y se '
          'sigue produciendo igual que hoy.'),
    ]

    # ── 5 · El plan ─────────────────────────────────────────────────────────
    h += [
        P('5 · El plan, por etapas, con su puerta de decisión', 'h1'),
        P('Cada etapa termina en una pregunta de sí o no. Ninguna compromete a la siguiente.'),
        Spacer(1, 6),
        paso(0, 'Reunir el material — 0 USD, no hace falta ninguna máquina',
             'De veinticinco a treinta fotografías por cada personaje que deba repetirse entre tomas: '
             'ángulos distintos, luces distintas, expresiones distintas, sin gafas de sol ni nada que '
             'tape la cara. Esto no lo puede hacer nadie más que ustedes y es lo único que bloquea '
             'todo lo demás. Sin este material, las etapas siguientes no tienen con qué empezar. '
             '<b>Puerta:</b> ¿están las fotos de al menos un personaje?'),
        Spacer(1, 5),
        paso(1, 'La prueba que decide — un día de máquina, entre 20 y 45 USD',
             'Se levanta una g6e.xlarge, se instalan Wan 2.2 con VACE y LTX-2.5, se entrena el LoRA '
             'del primer personaje y se generan DOS O TRES PLANOS QUE YA EXISTEN en el comercial '
             'hecho con Seedance — los mismos, no otros parecidos. Se ponen lado a lado y se miran. '
             'La máquina se apaga al terminar y deja de costar. '
             '<b>Puerta:</b> ¿aguanta la comparación en una pantalla grande? Lo decide José mirando, '
             'no una métrica.'),
        Spacer(1, 5),
        paso(2, 'Los LoRA del reparto — medio día de máquina por personaje',
             'Un LoRA por cada persona con nombre del comercial. Se guardan en el repositorio como '
             'cualquier otro archivo del proyecto, versionados, y se reutilizan en todas las piezas '
             'que vengan. Este es el activo que queda. '
             '<b>Puerta:</b> ¿cada cara se reconoce como la misma en seis planos distintos?'),
        Spacer(1, 5),
        paso(3, 'Producción por reparto — la máquina se enciende solo cuando se genera',
             'Lo que no lleva cara y las tomas con LoRA aprobado, en máquina nuestra. El resto sigue '
             'en Seedance sin ninguna prisa por moverlo. '
             '<b>Puerta:</b> ¿el coste por pieza terminada bajó de verdad, medido, no estimado?'),
        Spacer(1, 5),
        paso(4, 'El montaje — sin cambios',
             'Remotion y Remotion Lambda exactamente como los dejó el Manual 7. Céntimos por render '
             'y sin ninguna máquina encendida.'),
    ]

    # ── 6 · Costos ──────────────────────────────────────────────────────────
    h += [
        P('6 · Lo que cuesta, y lo que no puedo decirte todavía', 'h1'),
        Spacer(1, 4),
        tabla(['Concepto', 'Coste', 'Nota'],
              [['Etapa 1, la prueba completa', '20 – 45 USD',
                'Entre 10 y 24 horas de g6e.xlarge a 1,861 USD/hora, incluyendo el rato que se '
                'pierde instalando. Se apaga al terminar.'],
               ['Un LoRA por personaje', '8 – 15 USD',
                'Entre cuatro y ocho horas de la misma máquina. Se paga una vez por cara.'],
               ['Almacenamiento en S3', 'unos pocos USD al mes',
                'Modelos, LoRA, clips crudos y máster. Es el único gasto permanente.'],
               ['Render del montaje', '0,01 – 0,05 USD por render',
                'Remotion Lambda, tal como lo midió el Manual 7.'],
               ['Máquina encendida sin usarse', '<b>1 340 USD al mes</b>',
                '<b>Dejar la g6e.xlarge prendida y olvidada.</b> El riesgo económico real de este '
                'plan no es el precio de la GPU: es olvidarse de apagarla.']],
              [0.26 * au, 0.20 * au, 0.54 * au]),
        Spacer(1, 6),
        recuadro('El punto de equilibrio contra Seedance no lo puedo calcular hoy, y prefiero decirlo',
                 'Haría falta saber cuántos segundos de video genera una L40S por hora con estos '
                 'modelos, y eso no es un dato que se pueda leer en ninguna parte con honestidad: '
                 'depende de la resolución, de los pasos de muestreo y del modelo. La etapa 1 lo '
                 'mide de paso, y recién entonces se puede poner el número al lado del plan de '
                 'Seedance y compararlos. Cualquier cifra que ponga antes de esa medición sería '
                 'inventada.'),
    ]

    # ── 7 · Riesgos ─────────────────────────────────────────────────────────
    h += [
        P('7 · Lo que puede salir mal', 'h1'),
        P('Un plan sin esta sección es un folleto de ventas.'),
        Spacer(1, 4),
        tabla(['Riesgo', 'Qué hacemos'],
              [['<b>Que la calidad no alcance.</b> Es el riesgo principal y es real: hoy los '
                'abiertos siguen por debajo de Seedance en fotorrealismo de rostro.',
                'Por eso la etapa 1 cuesta menos de cincuenta dólares y se decide mirando dos '
                'planos iguales lado a lado. Es barata a propósito.'],
               ['<b>Que 45 GB de VRAM se queden cortos.</b> LTX-2.5 y Wan de 14B entran, pero sin holgura.',
                'La g6e.2xlarge tiene la misma GPU. Si el problema es de VRAM y no de CPU, subir de '
                'talla no lo arregla y hay que ir a varias GPU, que es donde el Manual 7 ya dijo '
                'que el coste por iteración deja de compensar.'],
               ['<b>Las licencias.</b> Wan 2.2 es Apache 2.0; LTX-2.5 es gratis por debajo de 10 M '
                'USD de facturación; sobre HunyuanVideo 1.5 las fuentes se contradicen — una dice '
                'Apache 2.0 y otra «licencia comunitaria de Tencent».',
                'Antes de usar cualquiera de los tres en una pieza comercial hay que leer el '
                'archivo de licencia del repositorio oficial, no un artículo. Y guardarlo con la '
                'fecha en que se leyó.'],
               ['<b>El LoRA de una cara real es un dato biométrico.</b> No es un detalle legal '
                'menor para una empresa que hace verificación de identidad.',
                'Consentimiento por escrito y firmado de cada persona antes de entrenar su LoRA, '
                'diciendo para qué se usa y por cuánto tiempo. Se guarda con el archivo.'],
               ['<b>No hay GPU en Spot.</b> Esa cuota está en cero, y Spot es lo que abarataría '
                'las corridas largas de entrenamiento.',
                'Con el volumen de este plan no hace falta. Si algún día se entrenan muchos LoRA '
                'seguidos, se pide el aumento antes, no en medio.'],
               ['<b>Olvidarse una máquina encendida.</b>',
                'Etiqueta de apagado automático y una alarma de facturación desde el primer día. '
                'Cuesta cero y evita el único gasto grande que este plan puede producir.']],
              [0.44 * au, 0.56 * au]),
    ]

    # ── 8 · Lo que no recomiendo ────────────────────────────────────────────
    h += [
        P('8 · Lo que no recomiendo, y por qué', 'h1'),
    ]
    h += vinetas([
        '<b>Sustituir Seedance de golpe.</b> Hoy sigue siendo mejor en rostro. Lo que se propone '
        'es dejar de depender de él para todo, no dejar de usarlo.',
        '<b>Las máquinas de varias GPU</b> (g6e.12xlarge a 10,5 USD/hora, p4d a 32,8). El Manual 7 '
        'ya lo razonó bien: el proceso exige muchas repeticiones y ahí el coste por iteración '
        'manda sobre la potencia.',
        '<b>Entrenar un modelo propio desde cero.</b> No aplica y no aplicará en el horizonte de '
        'este proyecto.',
        '<b>Los nodos de la cadena como máquinas de render.</b> Dicho en el Manual 7 y se repite '
        'aquí porque es la tentación obvia cuando se ve que hay siete máquinas encendidas.',
        '<b>Empezar por la GPU barata para «ahorrar en la prueba».</b> Explicado en la sección 3: '
        'mediría el fracaso que ya conocemos.',
    ])

    # ── 9 · La decisión ─────────────────────────────────────────────────────
    h += [
        Spacer(1, 10),
        HRFlowable(width='100%', thickness=0.8, color=LINEA, spaceAfter=10),
        P('9 · Lo que hace falta para arrancar', 'h1'),
        P('Dos cosas, y una es de ustedes:'),
        Spacer(1, 4),
        junto(tabla(['Qué', 'De quién', 'Sin esto…'],
              [['De 25 a 30 fotos de un personaje, en ángulos y luces distintos',
                'José / Orden Global',
                'La etapa 1 no puede empezar. Es el único bloqueo real del plan.'],
               ['Autorización para gastar entre 20 y 45 dólares de GPU',
                'José',
                'No se enciende nada. Este documento no gastó un céntimo.']],
              [0.42 * au, 0.20 * au, 0.38 * au])),
        Spacer(1, 8),
        recuadro('La respuesta corta a la pregunta que originó este documento',
                 'Sí, se puede hacer video de alta calidad en máquinas nuestras, y la cuenta de AWS '
                 'ya está lista para ello. Pero no porque haya aparecido un modelo nuevo que lo '
                 'resuelva solo: porque la identidad de un personaje se resuelve entrenando un LoRA, '
                 'que es un camino que el Manual 7 no consideró. Lo que falta por saber es si el '
                 'fotorrealismo alcanza, y eso cuesta menos de cincuenta dólares averiguarlo con '
                 'certeza en vez de discutirlo.', VERDE),
        Spacer(1, 12),
        P('Documento técnico 8 · Orden Global · 6 de septiembre de 2026', 'pie'),
        P('Las cuotas y los precios de AWS se midieron el día de la fecha contra la cuenta de la '
          'empresa con <font face="Courier">aws service-quotas</font>, '
          '<font face="Courier">aws ec2 describe-instance-types</font> y '
          '<font face="Courier">aws pricing get-products</font>. Las fechas de publicación y las '
          'características de los modelos salen de fuentes públicas consultadas el mismo día y '
          'deben reverificarse antes de comprometer una fecha: este campo cambia de mes a mes, '
          'que es precisamente lo que le pasó al Manual 7.', 'pie'),
    ]

    doc.build(h)
    print(f'  {SALIDA}  ·  {os.path.getsize(SALIDA) / 1024:.0f} KB')


if __name__ == '__main__':
    construir()
