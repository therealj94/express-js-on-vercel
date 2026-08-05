# Explorador Orden Global (ordenscan)

Un solo archivo, `index.html`. Sin dependencias, sin `npm install`, sin paso de
compilación. Se despliega copiándolo a cualquier hosting estático.

Backend: <https://orden-global-scan-c4abe71e8024.herokuapp.com>
(código en `../ogscan-backend`).

**Desplegado para revisión:** <https://main.d34dnrmfl6lkwn.amplifyapp.com>
(app de Amplify `ordenscan-explorador`, `d34dnrmfl6lkwn`). No tiene dominio
propio y no toca `ordenscan.com` en absoluto.

## Por qué existe este explorador

`ordenscan.com` es hoy el app de Amplify `ogscan-frontend` (`d25qv92e7m8uv9`),
una aplicación **Next.js SSR** cuyo código vive en
`gitlab.com/shark-technology/ogscan-frontend` — un repositorio de un tercero.
El auto-build está apagado y el último despliegue es de abril de 2025.

Ese sitio no tiene página `/block/[n]`, así que devuelve 404 y no cumple
EIP-3091. Y al no tener el código, no se puede corregir. De ahí este reemplazo:
un solo archivo, sin dependencias, que el equipo sí controla.

---

## Lo importante: el hosting tiene que reescribir todas las rutas

El explorador implementa **EIP-3091**, que es el estándar que Chainlist, MetaMask
y las demás billeteras exigen para reconocer un explorador de bloques:

| Ruta                | Muestra          |
| ------------------- | ---------------- |
| `/block/<número>`   | Ficha del bloque |
| `/tx/<hash>`        | Transacción      |
| `/address/<0x…>`    | Dirección        |

Esas rutas se resuelven en el navegador. Si alguien entra directamente a
`https://ordenscan.com/block/4129745`, el servidor recibe una petición por un
archivo que no existe y responde 404 — **antes de que el explorador llegue a
ejecutarse**. Ese es exactamente el motivo por el que hoy el sitio no cumple
EIP-3091.

La solución es la misma en todos los hostings: **servir `index.html` para
cualquier ruta que no sea un archivo real.**

- **Vercel** — ya está, con el `vercel.json` de esta carpeta.
- **Netlify** — ya está, con el `_redirects` de esta carpeta.
- **S3 + CloudFront** — en las propiedades del bucket, poner `index.html` tanto
  en *Index document* como en *Error document*; y en CloudFront, crear dos
  *Custom error responses* (403 y 404) que devuelvan `/index.html` con
  código 200.
- **AWS Amplify** — en *Rewrites and redirects*, una sola regla:

  | origen | destino | tipo |
  | --- | --- | --- |
  | `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|jpeg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|xml\|webmanifest)$)([^.]+$)/>` | `/index.html` | `200 (Rewrite)` |

  **No usar la regla `/<*>` → `/index.html` con `404-200`.** Está en varios
  tutoriales y parece equivalente, pero no lo es: Amplify sirve el `index.html`
  dejando el código de respuesta en **404**, y además redirige `/block/123` a
  `/block/123/` con un 301. Se probó y falla — una ruta EIP-3091 válida no puede
  responder 404. La regla de la tabla devuelve 200 directo, sin redirección.

Sin esa regla el explorador funciona al navegar dentro del sitio, pero se rompe
al recargar o al abrir un enlace compartido — que es justo lo que hace una
billetera cuando abre `/tx/<hash>`.

## Apuntar a otro backend

Por defecto usa el backend de producción. Para cambiarlo, definir la variable
antes del script del explorador:

```html
<script>window.OGSCAN_API = "https://mi-backend";</script>
```

La cadena vacía es un valor válido y significa «mismo dominio» — útil si algún
día el frontend y la API se sirven juntos, porque evita CORS.

## Probarlo en local

`index.html` no se puede abrir con doble clic: las rutas EIP-3091 necesitan un
servidor que reescriba. Con Python basta:

```bash
python3 - <<'PY'
import http.server, socketserver, os
FE = os.path.dirname(os.path.abspath("index.html"))
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?")[0].lstrip("/")
        f = p if p and os.path.isfile(os.path.join(FE, p)) else "index.html"
        self.path = "/" + f
        return super().do_GET()
socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(("127.0.0.1", 8080), H).serve_forever()
PY
```

Y abrir <http://127.0.0.1:8080/block/4129745>.

## Sobre el validador de cada bloque

La cadena usa PolyBFT. En PolyBFT el campo `miner` de la cabecera es **siempre**
la dirección cero: el proponente del bloque va firmado dentro de `extraData`,
junto con el conjunto de validadores y el mapa de firmas. Se comprobó contra el
nodo (`eth_getBlockByNumber`) en bloques recientes y antiguos.

Por eso la ficha de un bloque no muestra «Validador: 0x000…000» — eso no informa
de nada y hace pensar que el bloque no tiene validador. Muestra el consenso.
Decodificar el proponente real exige desempaquetar el RLP de `extraData`; queda
pendiente si se quiere mostrar.
