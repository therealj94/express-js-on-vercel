# ordenex-api

El backend de la casa de cambio de Orden Global. El contrato es `DISENO.md`,
en esta misma carpeta: si algo de aqui lo contradice, manda el contrato.

## Correr en local

```
npm install
MONGODB_URI=... ORDENEX_TOKEN=... node app.js
```

Node 20 o mas, sin transpilar: lo que hay en el repo es lo que corre. El API
escucha en `PORT` (3000 si no esta) y se levanta aunque Mongo o la cadena no
contesten — `GET /salud` dice que pata falta.

## Variables de entorno

Ninguna vive en el repo, jamas. Todas se ponen en Heroku (`heroku config:set`).

| Variable | Que es |
| --- | --- |
| `MONGODB_URI` | El cluster de Mongo. La base es `ordenex` y la fija el codigo. |
| `ORDENEX_TOKEN` | Secreto HS256 de las sesiones propias (JWT 40 min + refresh 30 dias). |
| `ORDENEX_ADM` | Clave AES-256 que cifra las llaves de las direcciones de deposito. |
| `ORDENEX_HOT_KEY` | La llave de la billetera caliente que firma los retiros. |
| `ORDENEX_ADMIN_KEY` | La `X-Admin-Key` de las rutas `/admin/*`. Sin ella el panel esta cerrado. |
| `GENESIS_URL` | Base de Genesis ID. |
| `GENESIS_API_KEY` | La clave de la app `ordenex` en Genesis (SSO, tamiz, AML). Solo servidor. |
| `OG_CHAIN_PROVIDER` | RPC de la 5550 (`https://rpc.ordenglobal-rpc.com`). |
| `ORDENEX_COMISION_PPM` | Comision de la casa en partes por millon (2500 = 0,25 %). Sin ella: 0, deliberado. |
| `CORS_ORIGENES` | Origenes permitidos, separados por comas. Sin ella ningun navegador entra. |

## Desplegar

Siempre desde el repo, con git:

```
git subtree push --prefix infra/ordenex-api heroku main
```

(o `git push heroku` si el remoto apunta directo a esta carpeta). **Nunca un
paquete subido a mano** — la leccion del 12 de agosto: lo desplegado tiene que
ser un commit que se pueda mirar, culpar y revertir.

## El mapa

```
app.js              andamio: cors, json 100kb, mongo, rutas, /salud, errores
lib/tokens.js       la tabla espejo de los 15 activos (no se toca sola)
lib/                ledger, motor, velas, vigia, genesis, cadena5550, cripto
models/index.js     todos los esquemas (dinero SIEMPRE string de wei)
middleware/sesion.js  la sesion Bearer propia
routes/ + controllers/  las rutas del contrato y su logica
pruebas/            probar-motor, probar-ledger, probar-api (CI de mano)
```
