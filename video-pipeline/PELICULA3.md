# Película 3 — «Un martes»

**27-sep-2026.** Guion y plan de rodaje. Planos: `prompts/pelicula3_un_martes.json`
(lint: 0 PARA). Cola de la primera sesión: `prompts/q_p3_sesion1.json` (106
trabajos). Se rueda en AWS Mumbai cuando llegue el cupo Spot (`AWS.md`).

---

## 1. La idea

**Un día de Lucía, que no piensa en el dinero ni una sola vez.** Clase media,
ciudad, 42 años, un taller pequeño de tapicería y diseño de interiores, una
hija estudiando en otro país. El dinero se mueve a la velocidad de su día y
nadie en la película lo comenta. Ese es el argumento: no se explica nada, se ve
cómo se vive.

Por qué así, y no como un recorrido de funciones: la película del ecosistema
se leyó como *«un catálogo de servicios»*, y explicar la moneda dio *«no entendí
ni un carajo»*. Aquí cada app aparece **porque la historia la necesita**, nunca
al revés.

**El hilo emocional es la hija.** Abre la mañana con una nota de voz y cierra la
noche con otra. Todo lo de en medio —la floristería, el almuerzo, el
proveedor— es la vida que pasa entre esas dos notas.

### Las cinco horas del día

| Hora | Qué pasa | Qué se usa (pantalla real) |
|---|---|---|
| **6:40** | La hija manda una nota de voz: le cobraron la renta, y los vuelos de diciembre están baratos. Lucía, con el café, le manda el dinero y compra el boleto para que vuelva en diciembre. | Veta Wallet: envío a otro país · Tarjeta Visa virtual en línea |
| **10:15** | Pasa por la floristería del barrio por girasoles para el cumpleaños de una amiga. Paga con el teléfono; al florista le suena el suyo y asiente. | MyTokenPay: pagar con QR · panel del comercio: cobro recibido |
| **13:30** | Almuerzo de cumpleaños, cuatro amigos, risa. Llega la cuenta y cuatro manos saltan a la vez. Cada uno paga su parte con su QR. «¡Ya no hay “te lo paso luego”!». El dueño levanta dos dedos desde la caja. | MyTokenPay: dividir cuenta, un QR por persona · cobro completo |
| **15:40** | En el taller, entre rollos de tela, llama el proveedor de otro país: el camión sale a las cuatro; si no le entra el pago hoy, la tela llega hasta la otra semana. Lucía paga ahí mismo. Corte a la bodega: *«…Ya. Ya me cayó. ¡Súbanla!»*. El camión sale. | Veta Wallet: pago al proveedor; comprobante con hora y comisión |
| **21:10** | Sofá, zapatos fuera. Nota de voz de la hija, en su cuarto con una fecha marcada en el calendario: *«Ya pagué la renta. ¡Llego el dieciocho! ¿Cómo te fue hoy?»*. Lucía abre el historial: el día entero en cinco líneas. Escribe: **«Bien, mija. Un martes.»** | Historial del día |

**Cierre:** *Orden Global. Un sistema financiero que se puede comprobar.* ·
`ordenscan.com`

**Duración:** ~80 s en vertical 9:16. De ahí sale un corte de 30 s para
anuncios, con el almuerzo y la llamada.

### Nadie habla a cámara

El labial en español de H3 es una lotería. Así que **toda palabra viene de un
teléfono**: notas de voz, una llamada, y una sola frase de la amiga, que grita
con el teléfono delante de la boca. Cuando habla Lucía, está de espaldas o de
perfil. No es una limitación escondida: es cómo se habla hoy con quien quieres.

---

## 2. Referencias de tono (no se copian)

- ***Roma*** (Cuarón): la casa, la luz de ventana, la cámara quieta que deja
  pasar la vida por delante. Para 6:40 y 21:10.
- **Los anuncios «Shot on iPhone»** de Apple con gente real: piel de verdad,
  nada de sonrisa de catálogo. Es la biblia `apple_human` que ya usa `look.py`.
- **El almuerzo de *Y tu mamá también***: mesa ruidosa, todos hablando a la vez,
  la cámara como uno más en la mesa.
- **Lo que evitamos a propósito:** el dorado, las monedas, las gráficas, los
  hologramas y las pantallas brillando en la cara. Dos pruebas de público
  leyeron «secta» y «estafa cripto» justo ahí. Están en el negativo de todos
  los planos.

---

## 3. Lo que no se puede decir (y cómo lo resuelve el guion)

| Regla (CLAUDE.md, acta 14-08, ADR-004) | En esta película |
|---|---|
| ORIGEN no está respaldada; el público **deduce** oro solo | Cero oro en imagen, color o palabra. El dorado está en el negativo |
| Nada de «regulado», «licenciado», precios futuros ni ganancias | No aparece ninguna de esas palabras |
| **Ninguna pantalla afirma un costo total por operación hasta D02** | El «0,01 USD» **no va de rótulo**. Si D02 está aprobada, sale como una línea del comprobante real; si no, el comprobante enseña hora y estado, y nada más. Además, anunciado como alarde quedó **último** en credibilidad |
| El directorio de comercios es de muestra | La floristería y el restaurante son inventados y sin nombre; no se enseña el directorio |
| Ordenex como mercado: cero operaciones | No sale |
| La tarjeta Visa existe y está activa; es **virtual**, la emite CryptoMate | Se usa **en línea**, para el boleto. No se enseña pagando en un datáfono |
| La licencia de H3 excluye EE. UU., UE, RU y Corea | Pautar solo fuera de esos territorios |

### La escena que dejé fuera, y por qué

**«Invertir en el token de una empresa y ver cómo se mueve el precio en VICO».**
No encontré VICO en ninguno de los dos repos. Y aunque exista, enseñar a una
persona invirtiendo y mirando un precio que se mueve **construye la promesa de
ganancia** que las reglas prohíben, igual que el oro se construía sin decirlo.
Está preparada para entrar entre las 10:15 y las 13:30 si José decide:
1. qué es VICO y si está en producción con operaciones reales, y
2. con visto bueno legal para mostrar un producto de inversión.

Si entra, va sin cifras de rendimiento, con una línea de precio que sube **y
baja**, y sin cara de alegría al mirarla.

---

## 4. Cómo se hace cada cosa

| Pieza | Cómo | Coste |
|---|---|---|
| 22 planos humanos | MiniMax H3 en AWS, still → vídeo (i2v) | GPU |
| Pantallas A–H | **Capturas de las apps reales** con cuentas demo, igual que el tráiler de MyTokenPay. Nunca generadas: el modelo inventa letras | 0 |
| Voces | ElevenLabs: Lucía, la hija, el proveedor, la amiga. Diseñadas, no de biblioteca | créditos EL |
| Música | Compuesta aquí (`musica_cine.py`), sin licencias | 0 |
| Rótulos de hora | PNG con Pillow (no hay `drawtext`) | 0 |
| Montaje, color y grano | `post.py finish --look apple_human` | 0 |

### Continuidad de personajes

La ficha física de Lucía va **literal** al principio de cada plano suyo (la
lección de *Cincuenta*: sin eso la señora cambió de país entre planos). Lleva la
**misma camisa color óxido todo el día**, que es lo que el ojo usa para
reconocerla. La hija comparte cejas y tono de piel con ella.

### Dos cosas nuevas que encontré revisando el código de ComfyUI

1. **Los clips de «4 s» salían de 107 fotogramas, por debajo del rango de
   entrenamiento.** El nodo de H3 solo acepta longitudes 17k+5 (…, 90, 107,
   124, …) y redondea hacia arriba; los 97 que pedía el runner se convertían en
   107 (4,46 s). El modelo está entrenado entre **124 y 362**. Esta película va
   a **5 s → 124 fotogramas**, dentro del rango.
2. **La cadena still → vídeo no podía funcionar en el pod.** Un still de H3 es
   un `.mp4` de 5 fotogramas, y `LoadImage` solo lee imágenes de
   `ComfyUI/input`. El runner ahora extrae el primer fotograma a PNG y lo deja
   donde toca (`a_entrada()` en `03_run_queue.py`, probado en local). Y existe
   por fin `workflows/h3_i2v_api.json`: el de calidad con un `LoadImage`
   titulado `IMAGE` en la entrada `first_frame`, que el nodo sí tiene.

---

## 5. Plan de rodaje: tres sesiones, cada una se apaga sola

Regla del runbook: primero el resultado, luego la repetibilidad. Por eso la
sesión 1 no genera la película: genera **lo necesario para decidir**.

### Sesión 1 — casting, stills y la prueba que decide el método (~3 h)

`prompts/q_p3_sesion1.json`, 106 trabajos:
- **Casting:** 8 Lucías, 4 hijas, 4 proveedores.
- **Stills:** los 22 planos × 4 opciones.
- **La prueba:** el plano 02 dos veces a 124 fotogramas: desde su still (i2v)
  y desde texto (t2v, el camino probado).

Además siembra la caché en S3. Tope `--horas 4`; si todo va bien se apaga
antes.

**José elige desde el móvil** en las hojas de contactos: qué Lucía es Lucía, y
qué still de cada plano. Y viendo la prueba decidimos el método de la sesión 2:
- **i2v se ve bien →** la sesión 2 anima los stills elegidos.
- **i2v falla →** la sesión 2 va en t2v, que fue 45 de 46 clips sin un fallo.

### Sesión 2 — la película a calidad (~9 h, desde la caché)

22 planos × 2 semillas, y × 3 en los cuatro que sostienen la historia (02, 11,
15 y 22): 48 clips. Tope `--horas 10`. Mientras corre, aquí se hacen las
capturas de pantalla, las voces y la música. No hace falta esperar a la GPU.

### Sesión 3 — retomas (~1–2 h)

Solo los planos que no convenzan, con ids nuevos (`_t2`); el pod ignora en
silencio los ids que ya generó.

### Coste estimado

| | Spot (~$2.04/h) | On-Demand ($5.49/h) |
|---|---|---|
| Sesión 1 (~3 h, sin caché) | ~$6 | ~$17 |
| Sesión 2 (~9 h) | ~$18 | ~$50 |
| Sesión 3 (~1,5 h) | ~$3 | ~$8 |
| **Total GPU** | **~$27** | **~$75** |

Más ~$1,30/mes de caché en S3 y los créditos de voz de ElevenLabs.

---

## 6. Encender y apagar (cómo no se queda nada cobrando)

```bash
cd video-pipeline
python3 tools/aws_api.py cupo                      # ¿aprobaron el Spot?
python3 tools/preflight.py --nube aws --spot \
    --guion prompts/pelicula3_un_martes.json --cola prompts/q_p3_sesion1.json
# 0 PARA, o no se enciende
python3 tools/aws_api.py create --spot --horas 4 \
    --job prompts/q_p3_sesion1.json \
    --env HF_TOKEN=$HF_TOKEN --env HF_REPO=Therealjose54/orden-global-videos \
    --env ESPERA_MIN=20
python3 tools/aws_api.py logs <i-...>              # hitos: bf16, CACHÉ SEMBRADA, entregado ×106
python3 tools/aws_api.py status                    # al final: «No se está cobrando nada»
```

Se apaga sola de cuatro maneras, la primera que llegue:
1. **Acaba la cola** y nadie manda otra en `ESPERA_MIN` (20 min).
2. **`encolar.py --fin`**.
3. **El tope de horas** (`--horas`), escrito dentro de la propia máquina en su
   primer segundo de vida.
4. **El contenedor muere** por lo que sea.

Apagar = destruir: el disco se borra con ella, y la caché de S3 queda para la
próxima. Probado el 27-sep: `terminated`, cero discos.

Si Spot interrumpe la máquina: los clips hechos ya están en HF (se entregan uno
a uno), y el siguiente `create` retoma sin repetirlos.

---

## 7. Lo que falta, y quién lo hace

| | Quién | Bloquea |
|---|---|---|
| Cupo Spot en Mumbai (pedido 27-sep, en revisión manual de AWS) | AWS | Sesión 1 (o se hace On-Demand) |
| `HF_TOKEN` con escritura | José | Sesión 1 |
| ¿D02 aprobada? ¿La comisión se puede enseñar? | José | Solo el inserto G |
| ¿Qué es VICO? ¿Entra la inversión? | José + legal | Solo la escena opcional |
| ¿El envío a otro país está en producción en Veta Wallet? ¿A qué países? | José | Inserto A y G |
| Capturas A–H de las apps reales | aquí, sin GPU | Montaje |
| Voces y música | aquí, sin GPU | Montaje |
