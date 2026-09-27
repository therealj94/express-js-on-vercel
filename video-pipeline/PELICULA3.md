# Película 3 — «Un martes»

> **Se rueda ya; se publica escena por escena cuando cada cosa funcione con
> gente real.** Las condiciones están en `ECOSISTEMA_MERCADEO.md` §5. Hoy solo
> el cierre (comprobante + ordenscan) es publicable tal cual.

**27-sep-2026.** Guion y plan de rodaje. Planos: `prompts/pelicula3_un_martes.json`
(lint: 0 PARA). Cola de la primera sesión: `prompts/q_p3_sesion1.json` (114
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
| **6:40** | La hija manda una nota de voz: le cobraron la renta, y fijate que los vuelos de diciembre están baratos. Lucía, con el café, le manda el dinero y compra el boleto para que vuelva en diciembre. | Veta Wallet: envío a otro país · Tarjeta Visa virtual en línea |
| **10:15** | Pasa por la floristería del barrio por girasoles para el cumpleaños de una amiga. Paga con el teléfono; al florista le suena el suyo y asiente. | MyTokenPay: pagar con QR · panel del comercio: cobro recibido |
| **12:10** | Pausa en el taller: mango con sal, el teléfono, y la mirada a su propio taller. Tiene su ONDK y el acta que lo respalda. | Veta Wallet: ONDK |
| **13:30** | Almuerzo de cumpleaños, cuatro amigos, risa. Llega la cuenta y cuatro manos saltan a la vez. Cada uno paga su parte con su QR. «¡Ya no hay “te lo paso luego”!». El amigo que nunca lo ha usado pregunta, fuera de cuadro: «¿Y cómo sé que le llegó?». Lucía le gira el teléfono con el comprobante, y el dueño levanta dos dedos desde la caja. | MyTokenPay: dividir cuenta, un QR por persona · cobro completo |
| **15:40** | En el taller, entre rollos de tela, llama el proveedor de otro país: el camión sale a las cuatro; si no le entra el pago hoy, la tela llega hasta la otra semana. Lucía paga ahí mismo. Corte a la bodega: el proveedor no confía, **mira**: *«…Aquí lo estoy viendo. Ya me cayó. ¡Súbanla!»*. El camión sale. | Veta Wallet: pago al proveedor; comprobante con hora |
| **18:30** | El florista baja la cortina del local y, bajo el alero, pasa lo del día a su cuenta en lempiras. Nadie lo dice: se ve. | MyTokenPay: retiro a moneda local |
| **21:10** | Sofá, zapatos fuera. Nota de voz de la hija, en su cuarto con una fecha marcada en el calendario: *«Ya pagué la renta. ¡Llego el dieciocho! ¿Cómo te fue hoy?»*. Lucía abre el historial: el día entero en cinco líneas. Escribe: **«Bien, mija. Un martes.»** | Historial del día |

**Cierre:** *Orden Global. Un sistema financiero que se puede comprobar.* ·
`ordenscan.com`

**Duración:** ~90 s en vertical 9:16 (plan de tiempos en `prompts/pelicula3_montaje.json`). De ahí sale un corte de 30 s para
anuncios, con el almuerzo y la llamada.

### Por qué el escéptico y el florista

La prueba de público dio la clave de todo: *«yo no voy a ser el primer
tonto»*. La confianza con el dinero aquí es social. Por eso en la película
**nadie es el primero**: el florista y el restaurante ya cobran así, las amigas
ya lo usan, y la única duda en voz alta (*«¿y cómo sé que le llegó?»*) se
contesta como promete la marca: enseñando el comprobante, no pidiendo
confianza. Y el jurado de Lima pidió ver *«a alguien sacando su plata»*: el
florista lo hace al cerrar, sin que nadie diga el verbo, que además está
vetado.

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

### 12:10 — ONDK: dueña de algo más grande

Pausa en el taller. Lucía come mango con sal en la puerta, mira el teléfono y
después levanta los ojos hacia su propio taller, con un orgullo callado. En la
pantalla, su ONDK y el acta que lo respalda. La idea que vende: **igual que es
dueña de su taller, es dueña de un pedazo de algo más grande, y lo puede
comprobar.** La bolsa siempre fue para otros; aquí la tiene una tapicera un
martes a mediodía.

Cómo se cuenta para que venda y no se caiga: sin cifra, sin gráfica y sin botón
de comprar en pantalla. Lo que se enseña es que **lo tiene** y el acta que lo
respalda. El ONDK no sube ni baja entre actas, y eso también vende: es lo
contrario de la montaña rusa que el público asocia con «cripto».

---

## 4. Cómo se hace cada cosa

| Pieza | Cómo | Coste |
|---|---|---|
| 24 planos humanos | MiniMax H3 en AWS, still → vídeo (i2v) | GPU |
| Pantallas A–J | **Capturas de las apps reales** con cuentas demo, igual que el tráiler de MyTokenPay. Nunca generadas: el modelo inventa letras | 0 |
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

`prompts/q_p3_sesion1.json`, 114 trabajos:
- **Casting:** 8 Lucías, 4 hijas, 4 proveedores.
- **Stills:** los 24 planos × 4 opciones.
- **La prueba:** el plano 02 dos veces a 124 fotogramas: desde su still (i2v)
  y desde texto (t2v, el camino probado).

Además siembra la caché en S3. Tope `--horas 4`; si todo va bien se apaga
antes.

**José elige desde el móvil** en las hojas de contactos: qué Lucía es Lucía, y
qué still de cada plano. Y viendo la prueba decidimos el método de la sesión 2:
- **i2v se ve bien →** la sesión 2 anima los stills elegidos.
- **i2v falla →** la sesión 2 va en t2v, que fue 45 de 46 clips sin un fallo.

### Sesión 2 — la película a calidad (~9 h, desde la caché)

24 planos × 2 semillas, y × 3 en los cuatro que sostienen la historia (02, 11,
15 y 22): 52 clips. Tope `--horas 10`. Mientras corre, aquí se hacen las
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

## 6. El día que aprueben el descuento: guion de rodaje

Todo lo de antes ya está hecho y probado en local. El día D es esto:

### Sesión 1 — un comando, ~3 h, ~$6

```bash
cd video-pipeline
HF_TOKEN=hf_... ./lanzar.sh 1
```

`lanzar.sh` comprueba el cupo (si no hay Spot, pregunta antes de ir a
On-Demand), pasa el preflight (un solo PARA y no enciende), crea la máquina con
tope de 4 h y dice cómo vigilarla. La máquina se apaga sola.

**Hitos en `aws_api.py logs <id>`:** `VRAM … -> bf16` → `TRABAJO: …` →
`CACHÉ SEMBRADA` → 114 × `entregado:` → `APAGADO: TRABAJO COMPLETO`. Si el log
no se mueve en 12 min: `aws_api.py destroy <id>`.

### Elegir — José, desde el móvil, sin GPU encendida

```bash
HF_TOKEN=hf_... python3 tools/recoger.py --sesion 1 --dest <carpeta>
```

Baja todo, verifica cada fichero contra su SHA-256 de Hugging Face y arma
**28 hojas** con números grandes, pensadas para el teléfono:
- 3 de casting: *«¿cuál es Lucía?»*, la hija y el proveedor.
- 24 de planos, con cuatro opciones cada una.
- 1 de la prueba de método: i2v contra t2v, inicio y final lado a lado.

José contesta en una línea: **«lucía 3 · 01=2 02=3 03=1 … · i2v»**.

### Sesión 2 — la película, ~9,5 h, ~$19

```bash
python3 tools/sesion2.py --picks "01=2 02=3 03=1 …" --metodo i2v   # o t2v
HF_TOKEN=hf_... ./lanzar.sh 2
```

52 tomas (2 por plano, 3 en los planos 02, 11, 15 y 22), a 124 fotogramas.
Si la prueba dice que i2v no convence, `--metodo t2v` usa el camino que ya dio
45 de 46 clips buenos. Tope de 11 h.

**Mientras corre, sin GPU:** capturas de pantalla A–J, voces, música y la
animática con los tiempos definitivos.

### Elegir tomas y sesión 3

```bash
HF_TOKEN=hf_... python3 tools/recoger.py --sesion 2 --cola prompts/q_p3_sesion2.json --dest <carpeta>
```

Hojas con el primer y el último fotograma de cada toma: se ve si la acción
ocurrió sin reproducir 52 clips. Lo que no convenza va a la sesión 3 con ids
nuevos (`_t4`…): `./lanzar.sh 3 prompts/q_p3_retomas.json`.

### Cómo se apaga (siempre, sin nadie mirando)

1. Se acaba la cola y en 20 min nadie manda otra.
2. `encolar.py --fin`.
3. El tope de horas, escrito dentro de la máquina en su primer segundo.
4. El contenedor muere por lo que sea.

Apagar = destruir; el disco se va con ella y la caché de S3 se queda. Si Spot
la interrumpe, lo entregado ya está en HF y el siguiente `lanzar.sh` sigue
donde iba. Al final de cada sesión, `aws_api.py status` tiene que decir
*«No se está cobrando nada»*.

### El ritmo ya se puede ver

`prompts/pelicula3_montaje.json` es el plan de tiempos: 35 bloques con planos,
pantallas, horas en pantalla y voces, **91,7 s**. La animática sale de ahí sin
GPU (`montaje/animatica.py`). Más largo que los 80 s previstos porque las
notas de voz necesitan su tiempo; el corte de 30 s para anuncios sale del
almuerzo y la llamada.

## 7. Lo que falta, y quién lo hace

| | Quién | Bloquea |
|---|---|---|
| Cupo Spot en Mumbai (pedido 27-sep, en revisión manual de AWS) | AWS | Sesión 1 (o se hace On-Demand) |
| `HF_TOKEN` con escritura | José | Sesión 1 |
| ¿D02 aprobada? ¿La comisión se puede enseñar? | José | Solo el inserto G |
| El envío a otro país existe como transferencia de ORIGEN, pero **nadie puede pasarlo a moneda local fuera de Honduras** (y el retiro es manual, solo lempiras). ¿Cuándo? | José | Publicar 6:40 y 15:40 |
| Capturas A–J de las apps reales | aquí, sin GPU, **cuando cada pantalla funcione de verdad** | Montaje |
| Que cada escena sea verdad para gente real | el equipo | **Publicar** (ver `ECOSISTEMA_MERCADEO.md` §5) |
| Voces y música | aquí, sin GPU | Montaje |
