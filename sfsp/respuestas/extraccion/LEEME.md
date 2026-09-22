# Cómo se extrajo la respuesta a la solicitud SFSP v0.2

Todo es **sólo lectura** contra `https://rpc.ordenglobal-rpc.com/` y las APIs públicas: ni una transacción firmada.
Los scripts se escribieron con rutas de trabajo en `/tmp/claude-0/inv/`; para repetir, crear esa carpeta o ajustar las rutas.

| Orden | Script | Qué produce |
|---|---|---|
| 1 | `escaneo.mjs` | Recorre la cadena entera: conteos, bloques con transacciones, recibos, trazas (despliegues internos) → `datos/5550/` |
| 2 | `codigo.mjs` | Qué direcciones candidatas tienen código hoy → `codigo-5550.json` (172) |
| 3 | `analizar.mjs` | Ficha técnica de cada contrato (estándar, supply, dueño, funciones, proxies) → `fichas-5550.json` |
| 4 | `tenedores.mjs` | Saldos de 465 direcciones conocidas en cada token, y si suman el supply → `tenedores-5550.json` |
| 5 | `huellas.mjs` | Saldos de direcciones desconocidas, leídos por su huella en el almacenamiento → `huellas.json` |
| 6 | `roles.mjs` | Roles de control de acceso y última transferencia → `roles-5550.json` |
| 7 | `emparejar.mjs` | Los 173 contratos de la 8532 contra la 5550, por dirección o por huella → `emparejado-8532.json` |
| 8 | `pools.mjs`, `pool-weth.mjs` | Reservas y liquidez de los AMM, y el saldo real de WETH de cada pool |
| 9 | `red.mjs`, `tesoro.mjs` | Intervalo de bloque, gas, validadores; saldos de tesorería y cuadre de la emisión |
| 10 | `hoja.py` | Arma `BLOQUE-1-INVENTARIO.xlsx` |

`candidatas.txt` son las direcciones que aparecen en el repositorio, en los datos de la migración y en los eventos de la cadena.
Son datos públicos de la cadena; no hay datos personales ni credenciales.
