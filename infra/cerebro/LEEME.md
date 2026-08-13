# EL CEREBRO · cerebro.ordenscan.com

El núcleo de control de Orden Global: un cerebro de partículas donde **cada
región es un sistema real con sus datos en vivo**, y una voz que da el parte
del día. Nada de lo que se ve es decorado.

## Las doce regiones · el ecosistema entero

| Región | Qué es | De dónde salen sus datos |
|---|---|---|
| NÚCLEO 5534 | la cadena de pruebas | `/rpc` → el nodo local · bloque, gas, edad |
| GÉNESIS 5550 | la cadena nueva | `informe.json` · juez 0 diferencias |
| MEMORIA 8532 | la cadena vieja | `/rpc-vieja` · **compara la raíz de estado con la del cierre**: si se moviera, la región entra en alarma |
| VETA WALLET | el backend | `/salud-wallet` → Heroku |
| ORDENSCAN | el explorador | `/explorador/block/totalBlock` |
| CHAINLIST | los PR #8593/#8594 | api.github.com (desde el navegador) |
| GENESIS ID | KYC/SSO | `/salud-genesis` → Render |
| TESORO | precio y comisión | `informe.json` |
| MYTOKENPAY | API de cobros y punto de venta | ficha fija |
| TARJETA | Visa virtual · CryptoMate | ficha fija |
| POLYGON | la red de salida · USDT | ficha fija |
| INFRAESTRUCTURA | las 10 máquinas de AWS | ficha fija |

**Toca cualquier región** —en el cerebro o en la lista— y se abre su ficha:
qué es, sus datos en vivo, y qué hay dentro.

Cuando llega un bloque nuevo, la región del NÚCLEO **dispara**: los impulsos
que viajan por los axones son actividad real, no animación al azar. Una región
en falla se pone roja y dispara en alarma.

## La voz

Botón **INFORME**: la voz del propio dispositivo (Web Speech, no sale nada a
ningún servicio) lee el parte **en orden**: saludo, estado general, las
cadenas, los productos, el dinero, lo hecho hoy y lo que falta.

Para que suene a asistente y no a robot:

- **Se elige la voz más natural que tenga el aparato** — primero las neurales
  de Microsoft y las de Google, después Mónica y Paulina de Apple — y hay un
  **selector** para cambiarla. La elección se recuerda.
- **Cada frase va suelta, con una pausa detrás.** Leer un párrafo de corrido
  es lo que hace que suene a máquina.
- Tono natural: `rate 0.97`, `pitch 1.0`. La versión anterior iba a `pitch
  0.85` y sonaba cavernosa.
- **`limpiar()` quita lo que se leería mal**: símbolos, direcciones, hashes,
  siglas. Un ejemplo real que había que arreglar: `gwei` se leía **«güey»** —
  ahora dice «gigawei». Los separadores de miles se quitan, porque «15,400» se
  leería «quince coma cuatrocientos».

**TEXTO** enseña el mismo parte escrito.

## Dónde vive

- Servidor: el nodo RPC de la 5534 (`i-0aff688efc52ab8c8`), Caddy en
  `/etc/caddy/Caddyfile`, archivos en `/srv/cerebro/`.
- Todo lo que la página consulta entra por su propio dominio vía proxies de
  Caddy — así no hay CORS que configurar en ningún sistema.
- DNS: `cerebro.ordenscan.com` → 18.234.39.26 (Route53, zona ordenscan.com).

## Cómo se actualiza el parte del día

Editar `informe.json` (aquí en el repositorio) y subirlo:

1. `aws s3 cp informe.json s3://og-5550-arranque-548380372606/cerebro/`
2. En el servidor: bajarlo a `/srv/cerebro/informe.json` (por SSM con un
   enlace firmado, como hace el guion de despliegue).

Los datos vivos (bloques, gas, raíz de estado, PRs) se actualizan solos.

## La contraseña · puesta el 13-ago-2026

El tablero **ya no está abierto a internet**. Lo señaló el Cerrajero en su
primera auditoría, y tenía razón: `partes.json` publicaba a quien lo pidiera
los hallazgos de los siete agentes —cuentas sin segundo factor, qué puertos
escuchan, qué secretos son cortos—. Eso es un mapa de por dónde entrar.

- Usuario **`jose`**. La contraseña **no está escrita en este repositorio, ni
  en el servidor, ni en S3**: en el `Caddyfile` sólo vive su hash bcrypt. Se le
  entregó a José directamente. Si se pierde se genera otra; la que había no se
  puede recuperar.
- Cubre **todo el sitio**, proxies incluidos (`/salud-wallet`, `/rpc`,
  `/explorador/*`…): filtran lo mismo que la página.
- **`pruebas.ordenglobal-rpc.com` sigue sin contraseña, a propósito.** Es otro
  bloque del `Caddyfile` y es el RPC público que usa MetaMask, que no sabe
  mandar credenciales. Comprobado tras el cambio: contesta 200.

Comprobado desde fuera: `/`, `/informe.json`, `/partes.json` y `/salud-wallet`
dan **401 sin clave y 200 con ella**.

Copia del archivo anterior en `/etc/caddy/Caddyfile.antes-de-la-clave`. Para
quitarla: borrar el bloque `basic_auth` y `systemctl reload caddy`.
