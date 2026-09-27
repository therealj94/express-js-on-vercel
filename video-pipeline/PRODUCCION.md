# Lista de producción — Orden Global, "El camino"

Estado de cada pieza antes de generar. Lo que está en rojo bloquea la tanda.

## Listo

| | |
|---|---|
| Guion en 9 planos, 63 s exactos | `prompts/orden_global.json` |
| Ficha de casting: 6 personajes + el ramo | prompts compuestos, en inglés |
| Microgesto físico por plano | lo que separa una cara viva de un render correcto |
| Formato vertical 9:16 de punta a punta | generación 720×1280, entrega 1080×1920 |
| Acabado que respeta el vertical | corregido: antes recortaba como si fuera cine |
| Inversión del plano 01 | `post.py reverse`, probado |
| Encadenado por último fotograma | `extend.py`, solo en 6→7 y 7→8→9 |
| Voz y labial preparados en el pod | `VOZ=1` instala Chatterbox y LatentSync |
| Guardián con piso de saldo | $35, deja ~$13 de margen sobre los $3.46 de la pieza |

## Bloqueante

**Los workflows en formato API.** Sin ellos la cola aborta limpio pero no genera.
Salen de la autoprueba, que vuelca al log el esquema de los nodos de H3 y el
inventario de plantillas; con eso se construyen aquí, con la GPU apagada.

## Decisiones tomadas, y por qué

**El hilo dorado va en post, no en el modelo.** Cada plano se genera por
separado y no tiene memoria del anterior: pedir un filamento continuo a través
de nueve cortes garantiza nueve hilos distintos. En post se controla grosor,
deriva y continuidad. Excepción: el plano 08, donde el filamento es un objeto
físico dentro de la escena.

**El rebobinado se genera al derecho y se invierte.** A un modelo se le pide que
las rosas revivan, y el clip se da la vuelta. Pedirle que "rebobine" produce
papilla.

**Se genera a 720×1280 y se sube al final.** Es 9:16 exacto dentro del rango
nativo de H3. Generar directo a 1080×1920 cuesta 2,2 veces más y el modelo
pierde coherencia por encima de su resolución de entrenamiento.

**La voz no la hace el modelo de vídeo.** El audio nativo de H3 hace del labial
en español una lotería, y esta pieza tiene una sola línea hablada: si falla,
falla el remate. El plano 09 se genera mudo y el labial se sincroniza encima.

**Voz: Chatterbox, en el propio pod.** Abierto, coste cero, y en pruebas ciegas
el 63,8 % de los oyentes lo prefirió frente a los de pago. Si la toma no
convence, el plan B es Inworld o ElevenLabs con voz latina neutra — dos frases
cuestan céntimos. La dirección importa más que el motor: plano, informativo,
sin subir el tono al final. El chiste solo funciona si nadie lo interpreta.

## Riesgo que no se puede cerrar de antemano

**La misma cara en planos distintos.** Karim sale en el 06, el 07 y el 09;
Elena en el 01 y el 07. Los retratos de casting sirven de referencia, pero H3
sin LoRA propio no garantiza identidad. Si al revisar no se parecen lo
suficiente, se entrena un LoRA de personaje en fal ($10, 1.000 pasos) y se
regeneran solo esos planos.

Es el único punto donde la pieza puede necesitar dinero extra, y no se sabrá
hasta ver las primeras tomas.
