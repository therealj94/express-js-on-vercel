# ULTRON FP · Conocimiento Full

El asistente de la Junta Directiva de Orden Global. Un solo servicio Node
(`app.js`) que sirve el panel y el API, y que piensa con Claude teniendo
delante **todo lo que la casa tiene escrito**, **el estado vivo de cada
sistema**, **lo que la junta le ha dicho** e **internet**.

```
node bin/armar-saber.mjs     # compila el saber de la casa a saber/
npm run probar               # 6 suites
node app.js                  # http://localhost:3900
```

---

## Qué es, en una frase por pieza

| Pieza | Qué hace | Dónde |
|---|---|---|
| **El saber** | 679 secciones de 36 fuentes —los documentos de la raíz, los dosieres de la junta, lo legal, las 40 fichas de AU-RA—, partidas por encabezado y recuperadas por pregunta (BM25). Se **compila** con `bin/armar-saber.mjs` y viaja dentro del paquete; una prueba se pone roja si los documentos cambiaron y nadie rearmó. | `lib/saber.js`, `saber/` |
| **El estado vivo** | Ordenex, AuCorp, Veta Wallet, Genesis ID, OrdenScan y el precio del ORIGEN, leídos de sus rutas públicas cada 30 s. Cada pata falla sola. | `lib/vivo.js` |
| **La memoria** | Lo que la junta le dice (por miembro o de toda la junta), los hilos y los documentos. Mongo; sin Mongo, provisional y lo dice. | `lib/memoria.js` |
| **El cerebro** | **Dos, unas mismas manos.** El del **nodo** piensa con el modelo de AU-RA en nuestra tarjeta (`lib/cerebros/nodo.js`, por el motor de `nodo/`); el de **Claude** con Anthropic. `ULTRON_CEREBRO` elige; sin la variable, el nodo si está configurado. Streaming en los dos. | `lib/cerebro.js` |
| **Las manos** | Sesenta herramientas compartidas por los dos cerebros: el saber, el estado vivo, internet, los mercados y las cadenas, la memoria, los pendientes, la biblioteca, quién es quién en la junta, y las tres que preparan y no mandan — abrir, exportar a PDF y proponer un envío. En una misma vuelta, las que leen corren a la vez y las que escriben en fila. | `lib/herramientas.js` |
| **El motor del nodo** | La única puerta hacia el modelo: TLS propio, secreto, solo `/api/chat` y `/api/tags`, y FIJA el modelo y el contexto a los de AU-RA para no desalojarla nunca. Se instala por SSM con `nodo/desplegar-motor.py`. | `nodo/` |
| **Los canales** | WhatsApp por Zernio (la misma línea de AU-RA) y correo por SES (el mismo remitente de siempre). **Solo a la junta**, y **solo con una persona confirmando**. | `lib/canales.js` |
| **La voz** | ElevenLabs, con la llave en el servidor; sin llave, la voz del navegador. | `lib/voz.js` |
| **El panel** | La presencia: una persona de luz —busto de partículas, ojos que parpadean, el núcleo en el pecho— con los datos vivos del ecosistema orbitando alrededor. Al entrar, el hero: la figura grande y el saludo por nombre escribiéndose. **Conversar**: escucha, contesta con voz y vuelve a escuchar. Gestos: respira, ladea la cabeza oyendo, se recoge pensando, asiente hablando. Y la conversación, el pulso, los pendientes, la memoria, la biblioteca, los hilos. Un archivo. | `public/index.html` |
| **ULTRON OS** | El sistema operativo del ecosistema, en una pantalla: el **núcleo** en el centro —lienzo 2D, late con la envolvente real de la voz—, ocho paneles con las cifras vivas (salud propia, enlaces, mercado, cerebro, integridad · ecosistema, documentos, pendientes, el dueño), el muelle de las casas y la caja de hablar. En el teléfono los paneles pasan a un cajón. | `public/os.html`, `public/js/os-nucleo.js` |
| **La salud propia** | Nueve signos de ULTRON mismo cada cinco minutos, una nota de 0 a 100 guardada en la base, y **reparación sola** de lo que es interno y reversible. Incluye el relevo del cerebro al respaldo cuando el nodo no contesta. | `lib/salud.js` |
| **El saludo** | `GET /saludo`: por su nombre, con la hora de Honduras y con lo que hay. Determinista: sale al instante y no puede irse a otro idioma. | `app.js` |

## La consola

`public/` es la consola de la Junta: una sola puerta, en la raíz. Vanilla,
sin compilar, con la identidad de la casa (grafito, marfil y el oro de Orden
Global) y registro institucional en cada palabra.

| Sección | Qué hace |
| --- | --- |
| Despacho | La conversación. Cada consulta que ULTRON hace a la casa aparece en el hilo como un registro con su entrada y su salida, antes de la respuesta. Texto en vivo, voz frase por frase, dictado y conversación continua. |
| Ecosistema | Una tarjeta por casa, leída de su servicio. Lo que no se pudo leer se dice. |
| Instrumentos | El catálogo entero (60) agrupado por lo que toca, cada uno ejecutable a mano por `POST /herramientas/:nombre`: corre la misma función que usa el modelo. |
| Pendientes y memoria · Biblioteca · Bitácora | El registro de la Junta. |
| La Junta · Ajustes | Los miembros y sus canales; la voz y el estado de la plataforma. |

Se prueba con `node pruebas/probar-consola.mjs` (navegador de verdad contra
el servidor de verdad, sin llaves). Con `ULTRON_FOTO=<carpeta>` guarda
capturas.

## Cómo se conecta con AU-RA

Desde el 5-sep **comparten el cerebro**: ULTRON piensa con el mismo
`qwen2.5:14b` que atiende a los clientes de AU-RA, en la misma tarjeta, con el
mismo contexto de 12 288 fichas. La junta lo decidió así —lo nuestro, en
nuestro nodo— y el motor lo garantiza: un pedido con otro modelo u otro
contexto desalojaría al de AU-RA, así que el motor los fija y no se negocia.
Lo que cambia es el prompt (con presupuesto en FICHAS: se mide la base y el
saber recibe lo que sobra, para no pasarse nunca del contexto) y que la
búsqueda web es nuestra (`buscar_web`, DuckDuckGo sin llave o Brave con
`ULTRON_BRAVE`). Y tres guardas que un modelo chico necesita: la del
**idioma** (al primer carácter de otro alfabeto se corta el stream y se le
pide seguir en español), la de las **citas** (no cita `buscar_web` sin
haberla llamado) y la de los **pendientes repetidos** (dos que dicen lo mismo
son uno).
Claude sigue disponible con `ULTRON_CEREBRO=claude` y una llave.

Comparten también **lo demás**:

- **el saber**: ULTRON lee las mismas 40 fichas de `infra/cerebro/conocimiento/saber.json`, y sabe cuáles son públicas;
- **la voz de la casa**: las fichas públicas van en cada prompt — «referenciado», nunca «respaldado»; no «regulada»;
- **la línea de WhatsApp**: ULTRON manda por Zernio con las mismas variables. La ENTRADA la trae AU-RA, que es la única que sondea la bandeja: antes de pensar, le pregunta a ULTRON por cada mensaje (`POST /whatsapp/entrada` con `ULTRON_SECRETO_AURA`); si el número es de la junta ULTRON contesta y AU-RA solo pone la boca, si no (403) AU-RA sigue como siempre y no vuelve a preguntar por ese número en diez minutos. Ver `infra/aura/ultron.py`. En el nodo hacen falta `ULTRON_URL` y `ULTRON_SECRETO_AURA` en `/etc/aura-whatsapp.env`.

## Las reglas que no se negocian

1. **Con los hechos.** Lo que sabe de la casa sale de las fichas y del estado vivo. Si no está, dice que no sabe o lo busca.
2. **Cita de dónde sale.** «según TRASPASO-CONOCIMIENTO.md», «según /salud de Ordenex ahora».
3. **Nunca promete una ganancia.** ORIGEN, AUKA y AGKA son «referenciados», no «respaldados». Orden Global no está «regulada». AuCorp no es un banco.
4. **No mueve dinero ni toca llaves.** Ni tiene con qué: ninguna de sus herramientas llega a una billetera, y las tres que salen de la casa —abrir, exportar a PDF, proponer un envío— dejan un botón para que lo toque una persona.
5. **Nada sale hacia un teléfono o un correo sin que una persona lo confirme.** `proponer_envio` prepara; el botón «Enviar» del panel manda; el servidor vuelve a comprobar que el destino es de la junta.
6. **Distingue lo interno de lo externo.** Un documento «para fuera» solo usa lo público.

## Variables de entorno

| Variable | Qué es | Obligatoria |
|---|---|---|
| `ULTRON_JUNTA` | JSON: `[{"nombre","correo","clave","gid","rol","whatsapp"}]`. Hace falta `clave` **o** `gid` (o las dos). **Sin esto no entra nadie.** | sí |
| `ULTRON_SECRETO` | Firma de las sesiones (una cadena larga al azar). | sí |
| `ULTRON_CEREBRO` | `nodo` o `claude`. Sin ella: nodo si está configurado. | no |
| `ULTRON_NODO_URL`, `ULTRON_NODO_SECRETO`, `ULTRON_NODO_CERT` | El motor del nodo: `https://<ip>:8443`, su secreto y su certificado (PEM). Los pone `nodo/desplegar-motor.py`. | sí para pensar con el nodo |
| `ULTRON_NODO_MODELO`, `ULTRON_NODO_PRESUPUESTO` | Por omisión `qwen2.5:14b` y 28 000 letras. | no |
| `ULTRON_BRAVE` | Llave de Brave Search; sin ella, DuckDuckGo. | no |
| `ANTHROPIC_API_KEY` | El cerebro de Claude. Solo hace falta con `ULTRON_CEREBRO=claude`. | no |
| `MONGODB_URI` | La memoria. Sin ella, provisional. Base `ultron` (`ULTRON_DB`). | recomendada |
| `ULTRON_MODELO` | Por omisión `claude-fable-5-1`. | no |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOZ` | La voz. | no |
| `ZERNIO_BASE`, `ZERNIO_CLAVE`, `ZERNIO_CUENTA` | WhatsApp de salida (las mismas de AU-RA). | no |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Correo por SES. | no |
| `ULTRON_SECRETO_AURA` | El secreto con el que AU-RA reenvía WhatsApp de la junta. | no |
| `GENESIS_API_KEY` | La clave de la app `ultron` en Genesis ID. Enciende el ingreso con Veta Wallet. Sin ella el botón ni se enseña. | no |
| `GENESIS_URL` | Genesis ID. Por omisión `https://genesis-id.onrender.com`. | no |
| `ORDENEX_API`, `AUCORP_API`, `WALLET_API`, `GENESIS_API`, `ORDENSCAN_API` | Para apuntar a otras casas (ensayo). | no |
| `ULTRON_DUENO` | El correo del dueño: el único que aprueba lo peligroso y toca la bóveda. Sin ella, el miembro con rol «presidente», o el primero de la junta. | recomendada |
| `ULTRON_BOVEDA_LLAVE` | 32 bytes en hex: la llave que cifra la bóveda. **Sin ella la bóveda está apagada** y se dice. Rotarla deja ilegible lo guardado. | para la bóveda |
| `GITHUB_TOKEN` | Para entrar al repositorio. Mejor en la bóveda con ese mismo nombre que en el entorno. | para el taller |
| `HEROKU_API_KEY` | Para desplegarse y aplicar secretos. Mejor en la bóveda. | para desplegarse |
| `ULTRON_REPOS` | Los repositorios de la casa, separados por coma. Por omisión `therealj94/express-js-on-vercel`. | no |
| `ULTRON_APP` | La app de Heroku que se despliega a sí misma. Por omisión `ultron-fp`. | no |
| `ULTRON_EQUIPO`, `ULTRON_EQUIPO_TOPE` | `on` enciende el reloj de los bots; el tope de vueltas al día (12). Sin la primera, los bots se corren a mano. | no |
| `SALUD_CADA_MS` | Cada cuánto se mira ULTRON a sí mismo (por omisión 5 min) | no |
| `ULTRON_RAM_MB` | El límite de memoria del dyno, para la nota (por omisión 512) | no |
| `ULTRON_RELEVO_MS` | Cuánto dura el relevo del cerebro a Claude (por omisión 10 min) | no |
| `ULTRON_AVISOS` | `apagado` · `correo` · `whatsapp` · `ambos` · **`partido`** (lo grave por WhatsApp y correo, lo leve solo por correo) | no |
| `ULTRON_AVISOS_SILENCIO_MS` | Cuánto tarda en repetirse un aviso con la misma clave (6 h) | no |

**Ninguna llave va en el código ni en el repositorio.** Se ponen en Heroku.

## La puerta

Dos formas de entrar, y **la lista manda en las dos**:

- **Correo y clave.** La de siempre, rotable desde `ULTRON_JUNTA`.
- **El pase de Genesis.** La persona toca «Entrar con mi Veta Wallet», la
  wallet le pide a Genesis ID un pase de SSO y la devuelve a ULTRON con él;
  ULTRON se lo da a Genesis a comprobar con su propia `GENESIS_API_KEY` y
  Genesis contesta de quién es ese pase (un GID). Si ese GID está en
  `ULTRON_JUNTA`, entra.

Genesis no decide quién es de la junta: decide si un pase es de verdad y de
quién. Un GID verificado del ecosistema —hay miles— **no** abre esta puerta si
no está en la lista. Quien rebota ve su GID en pantalla para pasárselo a quien
administra la variable; ese es el alta de un miembro nuevo.

Para encenderlo hacen falta dos cosas, y ninguna pasa por el código:

1. Dar de alta la app `ultron` en Genesis ID (ya está declarada en
   `APPS_ECOSISTEMA`, se crea sola en el arranque) y poner su clave de API en
   `GENESIS_API_KEY` aquí. Si el arranque no dejó ver la clave, se rota desde
   el panel de Genesis → Aplicaciones → ultron → Rotar.
2. Escribir el `gid` de cada miembro en `ULTRON_JUNTA`.

Sin `GENESIS_API_KEY` el botón ni se enseña y todo sigue como estaba: **el SSO
suma una forma de entrar, no reemplaza la que hay.**

## La mano derecha

José lo pidió así: «una AI libre para pensar y ayudarme, que busque
constantemente mejorarse, pero siempre yo siendo el dueño y nadie más». Eso son
dos ideas y van separadas:

- **Libre para pensar.** Ninguna herramienta está prohibida. ULTRON puede
  proponer correr un comando, cambiar su propio código, poner un secreto en
  producción, desplegarse.
- **El dueño autoriza.** Lo que puede romper algo o sale de la casa no corre
  hasta que el dueño lo aprueba **con un clic en el panel, viendo exactamente qué
  se va a correr**. Ni siquiera para el propio dueño se salta ese clic: es la
  segunda firma, y protege contra un modelo que actúe «en su nombre» por una
  instrucción colada en un documento.

Cuatro niveles (`lib/permisos.js`): **leer** (pasa), **escribir** (pasa a la
junta; un bot solo memorias y pendientes), **peligroso** y **fuera** (pedido al
dueño). Una aprobación vale para la huella exacta de esa llamada —aprobar
`terminal: ls` no aprueba `terminal: rm -rf`—, una sola vez, media hora.

Las manos (`lib/taller.js`, `lib/boveda.js`, `lib/aprender.js`, `lib/equipo.js`):

| Qué | Herramientas | Nivel |
|---|---|---|
| El repositorio | `repo_arbol`, `repo_leer`, `repo_buscar` | leer |
| Proponer un cambio de código | `repo_proponer_cambio` — rama `ultron/…` + commit + PR; **nunca la rama principal** | peligroso |
| La terminal | `terminal` — un comando, 60 s, salida acotada, **sin ninguna variable de entorno de la casa** | peligroso |
| Desplegarse | `desplegarse` — la rama que se diga, a Heroku, desde el propio dyno (sin las pruebas del navegador: para una rama que ya pasó por una persona) | peligroso |
| La bóveda | `boveda_listar` (nombres, edades, dónde está aplicado: **nunca valores**), `boveda_aplicar` (de la bóveda a una variable de Heroku, sin pasar por el modelo) | leer / peligroso |
| Aprender | `aprender` (una lección: una corrección de la junta que manda sobre las fichas), `habilidad_usar`, `habilidad_crear`, `habilidad_publicar` (al repositorio, como PR) | escribir / peligroso |
| El equipo | `equipo_estado`, `equipo_partes`, `equipo_correr`, `auditar_dependencias`, `autorizaciones` | leer / peligroso |
| Operaciones | `heroku_apps`, `heroku_registro` (con las llaves tapadas), `heroku_variables` (nombres y largos), `nodos` | leer |
| | `heroku_reiniciar`, `nodo_comando` (un comando en node1…node7 por SSM, plazo 90 s) | peligroso |
| Las bases | `mongo_consultar` — solo lectura, con la URI de la bóveda (`<APP>__MONGODB_URI`) y los campos sensibles tapados | leer |
| Su propia salud | `salud_revisar` (nueve signos y una nota), `salud_historial` | leer |
| | `salud_reparar` — reconectar, relevar, rearrancar, soltar cachés, cerrar pedidos olvidados | escribir |

**El valor de un secreto no pasa por el modelo. Nunca.** Entra por el
formulario de la bóveda del panel (solo el dueño), se cifra con AES-256-GCM
antes de tocar la base, y sale por un solo camino: hacia una variable de
Heroku, con autorización.

**Las habilidades** son archivos markdown en `habilidades/` con un encabezado
(`nombre`, `cuando`), como las skills de Claude. Hay doce de fábrica:
investigar a fondo, proponer un cambio de código, revisar la seguridad, el
parte del día, diagnosticar una casa caída, rotar un secreto, desplegar con
seguridad, escribir para la junta, responder a un incidente, preparar una
reunión de junta, hablar con los nodos y cuidar a ULTRON. ULTRON ve la lista y carga
una entera cuando la tarea lo pide. Las que escribe él van a la base; si el
dueño aprueba, se publican al repositorio como PR.

**El equipo** son bots en `equipo/`: médico (cada hora), centinela (cada 6 h),
cerrajero (cada semana), contador y cronista (cada día). Cada uno tiene su tarea y su lista de
herramientas; leen, y solo escriben memorias y pendientes. Sus partes se leen
en el panel. El reloj arranca apagado (`ULTRON_EQUIPO=on`), con tope diario.

**Llenar la bóveda** desde lo que ya está en Heroku: `bin/llenar-boveda.mjs`
lee las variables de cada app y las guarda con `yaEn` (dónde vive cada una),
sin imprimir ningún valor. Las llaves privadas de billeteras y las semillas
NO entran, a propósito: no se rotan por ULTRON y duplicarlas no gana nada.

**El vigía** (`lib/vigia.js`) mide las seis casas cada minuto desde el servidor
—aunque nadie mire—, exige dos lecturas fallidas antes de declarar una caída y
recuerda desde cuándo. Avisa a la junta solo con `ULTRON_AVISOS`.

## La salud propia, y que se repare solo

El vigía mira las seis casas. `lib/salud.js` mira **a ULTRON**, que es lo que
faltaba: si el que vigila se cae, nadie avisa de nada. Cada cinco minutos toma
nueve signos —memoria del proceso contra el límite del dyno, retraso del bucle
de eventos, ping a Mongo, cerebro (y si está de relevo), vigía, equipo, puerta,
autorizaciones que nadie contestó, y fallos repetidos de la última hora— y saca
una nota de 0 a 100 que se guarda en la base, así que se puede decir «lleva tres
días bajando» y no solo «ahora está mal».

**Lo que se arregla solo**, sin preguntar, porque preguntar tarda horas y no
hacerlo deja a ULTRON mudo: reconectar Mongo, relevar el cerebro, rearrancar el
vigía o el equipo, soltar cachés cuando la memoria aprieta, cerrar los pedidos
de autorización que llevan más de dos horas sin contestar. **Lo que no**:
reiniciar el dyno, borrar archivos, rotar secretos, tocar variables de
producción — eso se anota como pendiente y lo decide una persona.

**El relevo del cerebro** (`lib/cerebro.js`) es la pieza que más cambia el día a
día. Antes, `cual()` elegía el nodo con solo mirar si las variables estaban
PUESTAS, no si el nodo CONTESTABA: con la tarjeta apagada ULTRON quedaba mudo
teniendo la llave de Anthropic al lado sin usar. Ahora, si el nodo no contesta
—o tarda, o Ollama está caído— Claude cubre **ese mismo turno**, queda de
guardia diez minutos (`ULTRON_RELEVO_MS`) y se vuelve al nodo solo en cuanto
revive. El panel dice cuándo está de relevo y por qué.

**El médico** (`equipo/medico.md`, cada hora) corre esa revisión, aplica las
reparaciones y escribe un parte. Si no hay nada, su parte es una línea.

## Los avisos: grave al teléfono, leve al correo

`lib/avisos.js` es la única puerta por la que ULTRON habla sin que le hablen.
Quien mide (el vigía, la salud, un bot) dice qué pasó y cuán grave es; la
puerta decide el canal, a quién y si ya se dijo hace un rato (la misma clave
no se repite en seis horas salvo que suba de gravedad). Con
`ULTRON_AVISOS=partido` —lo que pidió José— lo **grave** (una casa caída,
ULTRON sin cerebro o sin base) va por **WhatsApp y correo**, y lo **leve** (una
casa que volvió, un signo en «ojo» que dura, el parte de la mañana, una
reparación que se repite, el cerebro más de una hora de relevo) va **solo por
correo**. Siempre a la junta y a nadie más. `avisar_junta` es la herramienta
para que una persona pida un aviso; sale de la casa, así que pasa por el clic
del dueño.

**El parte de la mañana.** El cronista corre a las **06:50 de Honduras**
(`hora: 06:50` en su encabezado) y su parte sale por correo (`enviar: leve`):
lo que vence hoy, lo que cambió, lo que preocupa, las cifras, y lo que se
aprendió ayer. Un bot con `hora:` corre a esa hora y no «cada N horas desde
que arrancó el dyno». Y al arrancar, un bot que corrió hace poco no se repite.

## La bitácora, los pendientes con fecha y la visión

**La bitácora** (`lib/bitacora.js`, `GET /bitacora`, herramienta `bitacora`)
anota cada herramienta que escribe, es peligrosa o sale de la casa —y cualquier
fallo—: qué, quién (persona o bot), por qué canal, la entrada resumida sin
secretos, si salió bien y cuánto tardó. Solo se añade. Lo de leer no se anota.

**Los pendientes tienen fecha** (`vence`, AAAA-MM-DD): los vencidos y los de
hoy van primero en la lista, en el parte del día y en el tablero (en rojo si
vencieron). Una fecha que no se entiende no se adivina: queda sin fecha.

**Visión.** Una imagen subida (PNG, JPEG, WebP) se MIRA: `leer_archivo` le
pide al cerebro —Claude, o el modelo del nodo por `images`— que la describa
con todo el texto y las cifras que se lean, y la descripción queda guardada
con el archivo. Una foto de una factura o una captura de pantalla se leen como
un documento más.

## Desplegar

Heroku, app `ultron-fp`, por la API de la plataforma igual que Ordenex:

```
node infra/ultron/bin/desplegar.mjs        # pruebas → paquete → build → /salud
```

El motor en el nodo de AU-RA (una vez, o cuando cambie `nodo/`):

```
HEROKU_API_KEY=… python3 infra/ultron/nodo/desplegar-motor.py
```

Abre el puerto 8443, instala el servicio, genera certificado y secreto si no
existen, y le pone a ULTRON en Heroku la URL, el certificado y el secreto sin
que pasen por ninguna pantalla.

Antes de cada despliegue, `node bin/armar-saber.mjs` si cambió algún documento
(la prueba lo exige).

## Lo que no está todavía, y se dice

- **PDF.** Los documentos se bajan como `.md` y `.html` (que se imprime a PDF desde el navegador). Un `.pdf` directo es la siguiente pieza.
- **Entrada por correo.** Los correos salen; para que la junta le escriba por correo hace falta el buzón entrante (`infra/correo-entrante`) enchufado, como con WhatsApp.
- **Que la junta tenga su GID puesto.** El ingreso con Veta Wallet ya está,
  pero solo entra por ahí quien tenga su `gid` escrito en `ULTRON_JUNTA`. Quien
  entre sin estar en la lista ve su GID en pantalla para pasarlo: ese es el
  alta.
