# Pantallas de Veta Wallet para el film (datos ficticios)

`capturar_veta.py` abre la web **real** de Veta Wallet (rama
`origin/claude/veta-wallet-phantom-design-7syah8`, `apps-web/veta-wallet/`) en
Chromium, con el personaje ficticio **Lucía Ferrer**, y saca PNG de 1080x1920.
Cada pantalla se captura a 360x640 CSS @3x.

## Cómo repetirlo

```bash
pip install playwright pillow          # sin `playwright install`: usa /opt/pw-browsers
python3 video-pipeline/montaje/pantallas/capturar_veta.py            # todas
python3 video-pipeline/montaje/pantallas/capturar_veta.py --solo A,J # algunas
python3 video-pipeline/montaje/pantallas/capturar_veta.py --salida /otra/carpeta
```

La web se extrae sola con `git archive` a `/tmp/veta-capturas-web`
(se cambia con `VETA_TRABAJO`). Si la rama cambia, borrá esa carpeta.

## Red: nada sale a un backend

`page.route('**/*')` y `context.route('**/*')` atienden **todas** las peticiones:

| destino | qué se hace |
|---|---|
| `127.0.0.1` (servidor estático local) | se sirve el archivo |
| `fonts.googleapis.com`, `fonts.gstatic.com` | las baja Python (proxy + CA del entorno) y las cachea; el navegador no sale |
| API Veta, MyTokenPay, RPC 5550, Ordenex, gold-api, CoinGecko, er-api, Genesis, cerebro.ordenscan | JSON de mentira (clase `Mocks`) |
| cualquier otro host | `abort()` |

Al terminar se escribe `red.log` en la carpeta de salida (pantalla, host,
acción, método, ruta) y un resumen por consola. Service workers bloqueados.
No hay login: la sesión es un token de mentira sembrado en `localStorage`.

## Datos (todos ficticios)

ORIGEN 612.40 a $2.50 (oro mock = 2.50 × 31.1035 × 55), ONDK 250 (precio
declarado mock con acta JD-2026-08-16, oculto en la captura), AUKA/AGKA 0.
Direcciones inventadas. Hora falsa por pantalla con `page.clock`, zona
`America/El_Salvador`, día 27/09/2026. La historia pasa en San Salvador:
moneda local = dólar, 1 ORIGEN = $2.50 (tasa local 1:1).

| PNG | estado |
|---|---|
| `A_enviar` | comprobante de 80 ORIGEN, confirmado en cadena, 06:41 |
| `B_tarjeta` | Visa virtual + «Boleto aéreo» (06:43, reloj a 06:45 → «hace 2 min») |
| `C_pagar` | MyTokenPay «Pagar una cuenta», Floristería El Girasol $18.00 (7.20 ORIGEN), pagada |
| `E_dividir` | Comedor Doña Tere dividida en 4: total $62.00, 3 pagadas + la suya ($15.50 = 6.20 ORIGEN) tomada, a punto de pagar |
| `E_dividir_pagado` | la misma cuenta después de pagar: «ya está pagada» |
| `G_comprobante` | comprobante a Textiles del Valle, 120 ORIGEN, 15:42, con «Ver en OrdenScan» |
| `H_actividad` | actividad del día (reloj 15:46) |
| `J_ondk` | ficha ONDK: «Lo que tenés 250», acta y descripción; sin valor ni precio |

Variantes extra: `B_tarjeta_arriba`, `C_pagar_revision`, `E_dividir_arriba`.

## Lo que se toca con CSS (no son datos)

- Se ocultan los flotantes: orbe AU-RA, mano AIR TOUCH (`#at-boton`), botón de
  pantalla completa.
- J: se ocultan «Valor», «Precio declarado $…», el pie del precio y la gráfica.
- A y G: en `index.html` la clase `.comp` choca con la de la página
  `#comprobar` (`padding:110px…`), y el recibo sale con un hueco enorme arriba.
  Se le devuelve el relleno normal de `.bloque`. Es un fallo real de la web.
- **Moneda (MyTokenPay)**: la web real solo sabe lempiras — `mtpHnl()` en
  `app.js` escribe `'L '` fijo delante de todo monto de un cobro. No hay dato
  que lo cambie. Los montos del mock van en dólares (en los campos `montoHnl`,
  `tasaHnlPorOrigen` = 2.50) y un script inyectado reescribe en pantalla cada
  «L 12.34» como «$12.34». Cada foto se revisa: si queda «L 1…», «lempira» o
  «HNL» visible, la consola lo avisa con `!!`.
