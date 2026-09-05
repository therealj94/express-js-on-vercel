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
| **Las manos** | Veintinueve herramientas compartidas por los dos cerebros: el saber, el estado vivo, internet, los mercados y las cadenas, la memoria, los pendientes, la biblioteca, quién es quién en la junta, y las tres que preparan y no mandan — abrir, exportar a PDF y proponer un envío. En una misma vuelta, las que leen corren a la vez y las que escriben en fila. | `lib/herramientas.js` |
| **El motor del nodo** | La única puerta hacia el modelo: TLS propio, secreto, solo `/api/chat` y `/api/tags`, y FIJA el modelo y el contexto a los de AU-RA para no desalojarla nunca. Se instala por SSM con `nodo/desplegar-motor.py`. | `nodo/` |
| **Los canales** | WhatsApp por Zernio (la misma línea de AU-RA) y correo por SES (el mismo remitente de siempre). **Solo a la junta**, y **solo con una persona confirmando**. | `lib/canales.js` |
| **La voz** | ElevenLabs, con la llave en el servidor; sin llave, la voz del navegador. | `lib/voz.js` |
| **El panel** | La presencia: una persona de luz —busto de partículas, ojos que parpadean, el núcleo en el pecho— con los datos vivos del ecosistema orbitando alrededor. Al entrar, el hero: la figura grande y el saludo por nombre escribiéndose. **Conversar**: escucha, contesta con voz y vuelve a escuchar. Gestos: respira, ladea la cabeza oyendo, se recoge pensando, asiente hablando. Y la conversación, el pulso, los pendientes, la memoria, la biblioteca, los hilos. Un archivo. | `public/index.html` |
| **El saludo** | `GET /saludo`: por su nombre, con la hora de Honduras y con lo que hay. Determinista: sale al instante y no puede irse a otro idioma. | `app.js` |

## La consola

`public/` es la consola de la Junta: una sola puerta, en la raíz. Vanilla,
sin compilar, con la identidad de la casa (grafito, marfil y el oro de Orden
Global) y registro institucional en cada palabra.

| Sección | Qué hace |
| --- | --- |
| Despacho | La conversación. Cada consulta que ULTRON hace a la casa aparece en el hilo como un registro con su entrada y su salida, antes de la respuesta. Texto en vivo, voz frase por frase, dictado y conversación continua. |
| Ecosistema | Una tarjeta por casa, leída de su servicio. Lo que no se pudo leer se dice. |
| Instrumentos | El catálogo entero (29) agrupado por lo que toca, cada uno ejecutable a mano por `POST /herramientas/:nombre`: corre la misma función que usa el modelo. |
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
