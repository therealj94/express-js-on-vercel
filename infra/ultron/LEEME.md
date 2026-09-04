# ULTRON FP · Conocimiento Full

El asistente de la Junta Directiva de Orden Global. Un solo servicio Node
(`app.js`) que sirve el panel y el API, y que piensa con Claude teniendo
delante **todo lo que la casa tiene escrito**, **el estado vivo de cada
sistema**, **lo que la junta le ha dicho** e **internet**.

```
node bin/armar-saber.mjs     # compila el saber de la casa a saber/
npm run probar               # 5 suites
node app.js                  # http://localhost:3900
```

---

## Qué es, en una frase por pieza

| Pieza | Qué hace | Dónde |
|---|---|---|
| **El saber** | 679 secciones de 36 fuentes —los documentos de la raíz, los dosieres de la junta, lo legal, las 40 fichas de AU-RA—, partidas por encabezado y recuperadas por pregunta (BM25). Se **compila** con `bin/armar-saber.mjs` y viaja dentro del paquete; una prueba se pone roja si los documentos cambiaron y nadie rearmó. | `lib/saber.js`, `saber/` |
| **El estado vivo** | Ordenex, AuCorp, Veta Wallet, Genesis ID, OrdenScan y el precio del ORIGEN, leídos de sus rutas públicas cada 30 s. Cada pata falla sola. | `lib/vivo.js` |
| **La memoria** | Lo que la junta le dice (por miembro o de toda la junta), los hilos y los documentos. Mongo; sin Mongo, provisional y lo dice. | `lib/memoria.js` |
| **El cerebro** | Claude con seis herramientas: búsqueda web, buscar saber, estado vivo, recordar, crear documento, proponer envío. Streaming. | `lib/cerebro.js` |
| **Los canales** | WhatsApp por Zernio (la misma línea de AU-RA) y correo por SES (el mismo remitente de siempre). **Solo a la junta**, y **solo con una persona confirmando**. | `lib/canales.js` |
| **La voz** | ElevenLabs, con la llave en el servidor; sin llave, la voz del navegador. | `lib/voz.js` |
| **El panel** | La presencia (un campo de partículas que está vivo), la conversación, el pulso de la casa, la memoria, la biblioteca, los hilos. Un archivo. | `public/index.html` |

## Cómo se conecta con AU-RA

No comparten cerebro: AU-RA corre un modelo de 7 mil millones en el nodo, hecho
para miles de personas con un guion; ULTRON corre Claude para seis personas
que piensan a fondo. Comparten **lo demás**:

- **el saber**: ULTRON lee las mismas 40 fichas de `infra/cerebro/conocimiento/saber.json`, y sabe cuáles son públicas;
- **la voz de la casa**: las fichas públicas van en cada prompt — «referenciado», nunca «respaldado»; no «regulada»;
- **la línea de WhatsApp**: ULTRON manda por Zernio con las mismas variables. La ENTRADA la trae AU-RA, que es la única que sondea la bandeja: antes de pensar, le pregunta a ULTRON por cada mensaje (`POST /whatsapp/entrada` con `ULTRON_SECRETO_AURA`); si el número es de la junta ULTRON contesta y AU-RA solo pone la boca, si no (403) AU-RA sigue como siempre y no vuelve a preguntar por ese número en diez minutos. Ver `infra/aura/ultron.py`. En el nodo hacen falta `ULTRON_URL` y `ULTRON_SECRETO_AURA` en `/etc/aura-whatsapp.env`.

## Las reglas que no se negocian

1. **Con los hechos.** Lo que sabe de la casa sale de las fichas y del estado vivo. Si no está, dice que no sabe o lo busca.
2. **Cita de dónde sale.** «según TRASPASO-CONOCIMIENTO.md», «según /salud de Ordenex ahora».
3. **Nunca promete una ganancia.** ORIGEN, AUKA y AGKA son «referenciados», no «respaldados». Orden Global no está «regulada». AuCorp no es un banco.
4. **No mueve dinero ni toca llaves.** Ni tiene con qué: sus herramientas son las seis de arriba.
5. **Nada sale hacia un teléfono o un correo sin que una persona lo confirme.** `proponer_envio` prepara; el botón «Enviar» del panel manda; el servidor vuelve a comprobar que el destino es de la junta.
6. **Distingue lo interno de lo externo.** Un documento «para fuera» solo usa lo público.

## Variables de entorno

| Variable | Qué es | Obligatoria |
|---|---|---|
| `ULTRON_JUNTA` | JSON: `[{"nombre","correo","clave","rol","whatsapp"}]`. **Sin esto no entra nadie.** | sí |
| `ULTRON_SECRETO` | Firma de las sesiones (una cadena larga al azar). | sí |
| `ANTHROPIC_API_KEY` | El cerebro. Sin ella el panel arranca y dice «cerebro apagado». | sí para pensar |
| `MONGODB_URI` | La memoria. Sin ella, provisional. Base `ultron` (`ULTRON_DB`). | recomendada |
| `ULTRON_MODELO` | Por omisión `claude-fable-5-1`. | no |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOZ` | La voz. | no |
| `ZERNIO_BASE`, `ZERNIO_CLAVE`, `ZERNIO_CUENTA` | WhatsApp de salida (las mismas de AU-RA). | no |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Correo por SES. | no |
| `ULTRON_SECRETO_AURA` | El secreto con el que AU-RA reenvía WhatsApp de la junta. | no |
| `ORDENEX_API`, `AUCORP_API`, `WALLET_API`, `GENESIS_API`, `ORDENSCAN_API` | Para apuntar a otras casas (ensayo). | no |

**Ninguna llave va en el código ni en el repositorio.** Se ponen en Heroku.

## Desplegar

Heroku, app `ultron-fp`, por la API de la plataforma igual que Ordenex:

```
node infra/ultron/bin/desplegar.mjs        # pruebas → paquete → build → /salud
```

Antes de cada despliegue, `node bin/armar-saber.mjs` si cambió algún documento
(la prueba lo exige).

## Lo que no está todavía, y se dice

- **PDF.** Los documentos se bajan como `.md` y `.html` (que se imprime a PDF desde el navegador). Un `.pdf` directo es la siguiente pieza.
- **Entrada por correo.** Los correos salen; para que la junta le escriba por correo hace falta el buzón entrante (`infra/correo-entrante`) enchufado, como con WhatsApp.
- **Genesis SSO.** La puerta es correo + clave por miembro. El SSO de Genesis existe y se enchufa cuando la junta sea más que seis.
