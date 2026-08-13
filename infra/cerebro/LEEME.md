# EL CEREBRO · cerebro.ordenscan.com

El núcleo de control de Orden Global: un cerebro de partículas donde **cada
región es un sistema real con sus datos en vivo**, y una voz que da el parte
del día. Nada de lo que se ve es decorado.

## Las ocho regiones

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

Cuando llega un bloque nuevo, la región del NÚCLEO **dispara**: los impulsos
que viajan por los axones son actividad real, no animación al azar. Una región
en falla se pone roja y dispara en alarma.

## La voz

Botón **INFORME DEL DÍA**: la voz del propio dispositivo (Web Speech, no sale
nada a ningún servicio) lee el parte: estado de las cadenas con los números en
vivo, lo hecho hoy, lo pendiente, y las fallas si las hay. **TEXTO** enseña lo
mismo escrito. La voz necesita un toque porque los navegadores no dejan hablar
solos.

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
