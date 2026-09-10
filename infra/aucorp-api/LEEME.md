# aucorp-api — las cuentas en moneda local del ecosistema

**AuCorp es una FinTech bajo Regulación A de Próspera, no un banco con licencia
bancaria.** No hay seguro de depósitos ni ventanilla de último recurso. Por eso
en toda la casa —código, API y pantallas— se dice «cuenta en moneda local», y
nunca «cuenta bancaria» ni «depósito asegurado». Está escrito aquí, en el
encabezado de `app.js` y en la respuesta de `/salud`, a propósito: es la clase
de cosa que se olvida justo cuando alguien está redactando un texto de venta.

AuCorp es dueña de Ordenex y aliada de Orden Global. Este servicio es el lado
FIAT del ecosistema; la Veta Wallet es el lado cripto, y los dos se atan por el
mismo `gid` de Genesis ID.

## Las reglas que gobiernan todo el código

1. **El dinero se guarda en unidades mínimas enteras**, en un string, operado
   con BigInt. Nunca coma flotante: `0.1 + 0.2` no da `0.3` y en un libro mayor
   cada redondeo deja una viruta que al cierre del mes nadie sabe explicar.
2. **Los decimales son un DATO de cada moneda, no una constante.** El peso
   chileno y el guaraní tienen CERO. Darles dos hace que mil pesos se anoten
   como cien mil.
3. **El saldo se DERIVA del libro, no se guarda.** `saldos` es un atajo con
   guarda de concurrencia; si discrepa del libro, gana el libro.
4. **Ni un dato inventado.** Sin tasa real no hay conversión y la pantalla
   pinta un guion. Nunca un 1:1 de relleno, nunca un cero de consuelo.
5. **Lo que no se entiende, se rechaza.** Enderezar a ojo un monto que llegó
   torcido es adivinar con la plata de otro.

## Las piezas

| Archivo | Qué hace |
|---|---|
| `lib/monedas.js` | Las 21 monedas y sus decimales reales; lee montos escritos a mano en las dos formas del continente. |
| `lib/libro.js` | Partida doble, en memoria. Cuadra POR MONEDA. `reservas()` compara lo que se debe contra lo que hay. |
| `lib/asientos.js` | La única puerta: persiste, guarda contra el doble gasto, y reconcilia. |
| `lib/cambio.js` | Tasas reales con su fecha y su origen dicho. |
| `lib/genesis.js` | El cliente de Genesis ID. Fail-closed. |
| `lib/validar.js` | La frontera de entrada: cada forma (monto, moneda, gid con dígito verificador, id, ref, fecha, mes, SWIFT) una sola vez, con su mensaje y su campo. Lo que no tiene forma es 400 antes de tocar la base. |
| `lib/sanciones.js` | El tamiz OFAC, el mismo de Genesis (`aml/listas`, `tamiz`, `lib/texto`) en CommonJS. Lee SDN.CSV y ALT.CSV, vive en Mongo, se importa por `/tesoreria/sanciones/importar`. Sin lista no se tamiza, y no tamizar es un no. |
| `lib/comprobante.js` | El comprobante de un asiento visto por su dueño (saldo antes y después derivados del libro, huella SHA-256) y el extracto de un mes (JSON y CSV). |
| `lib/barrido.js` | Las solicitudes con más de N horas sin cambio. **Sólo avisa** (log y `/tesoreria/solicitudes/atascadas`); nunca resuelve. |
| `controllers/tesoreria*` | La frontera: por dónde entra y sale el dinero. Detrás de `X-Admin-Key`. También la lista de sanciones y el barrido. |

## Las rutas que se sumaron

| Ruta | Quién | Qué |
|---|---|---|
| `GET /perfil` | sesión | Quién es, sus cuentas, su nivel y qué es esta casa |
| `GET /movimientos?moneda&clase&desde&hasta&q&pagina` | sesión | El historial con filtros (búsqueda literal, nunca regex) |
| `GET /movimientos/:numero/comprobante` | sesión | El comprobante de UN movimiento, por su número (la ref sin el gid) |
| `GET /extracto?moneda&mes&formato=json\|csv` | sesión | El extracto de un mes; cuadra inicial + entradas − salidas = final |
| `POST /solicitudes/deposito` | sesión | **Avisar** un depósito ya transferido. No acredita nada |
| `GET /solicitudes/:id` | sesión | Una solicitud con su estado, qué le falta y cuántas horas lleva |
| `GET /tesoreria/solicitudes/atascadas?horas` | admin | El barrido a pedido. Sólo enseña |
| `POST /tesoreria/deposito { …, solicitud? }` | admin | Igual que antes; con `solicitud` cierra el aviso que atiende |
| `GET /tesoreria/sanciones` · `POST …/importar` | admin | Estado de la lista; importar de la OFAC (sin cuerpo) o pegada (`{ texto, alt?, fuente }`) |
| `GET /tesoreria/sanciones/alertas` · `POST …/:id/resolver` | admin | Las coincidencias fuertes que cerraron una puerta, para cumplimiento |

**El tamiz es fail-closed y eso se nota el primer día:** hasta que operaciones
importe la lista, ningún destino bancario nuevo se guarda y ningún retiro se
pide (503 `SIN_TAMIZ`). Es a propósito. Una coincidencia fuerte devuelve 403
`DESTINO_EN_REVISION` sin decir contra qué chocó, y deja una alerta.

## Las variables de entorno

| Variable | Para qué | Sin ella |
|---|---|---|
| `MONGODB_URI` | La base (se fija `dbName: aucorp` en el código) | El API arranca, `/salud` lo canta, y toda operación falla cerrada |
| `AUCORP_TOKEN` | Firma las sesiones de esta casa. **Nunca el `PASS_TOKEN` de la wallet** | No entra nadie (503) |
| `AUCORP_ADMIN_KEY` | La frontera del dinero | La frontera queda cerrada (503) |
| `GENESIS_API_KEY` | El alta de la app `aucorp` en Genesis | No se puede verificar ningún SSO |
| `GENESIS_URL` | Dónde vive Genesis | Por defecto el de producción |
| `CORS_ORIGENES` | Los orígenes permitidos, separados por comas | Ningún navegador puede llamar |
| `AUCORP_MARGEN_BPS` | El margen del cambio, en puntos base | **Cero.** Un margen que nadie configuró es un cobro que nadie decidió |
| `AUCORP_BARRIDO_HORAS` | Cuántas horas sin cambio hacen «atascada» una solicitud | 24 |
| `AUCORP_BARRIDO_CADA_MIN` | Cada cuánto corre el barrido y escribe en el log | 60. `AUCORP_BARRIDO=no` lo apaga |
| `AUCORP_OFAC_SDN` · `AUCORP_OFAC_ALT` | De dónde bajar la lista | Las direcciones oficiales del Tesoro de EE. UU. |

## Las pruebas

```
npm install
npm run probar
```

Nueve suites. `probar-monedas`, `probar-libro`, `probar-validar` y
`probar-sanciones` son puro cálculo (la de sanciones lee una lista en el
formato real de la OFAC, `pruebas/listas/`, con fichas inventadas).
`probar-asientos`, `probar-comprobante`, `probar-barrido` y `probar-api`
levantan un Mongo en memoria y el app real, con Genesis fingido —fingido SOLO
Genesis, que es de otra casa, y ni un poco más permisivo que el real—.
`probar-cambio` llama a la fuente de tasas de verdad a propósito: un fingido
diría que todo funciona el día que la fuente cambie de formato.

Si `mongodb-memory-server` no puede descargar su binario (red cortada), las dos
suites de Mongo lo dicen y se salen sin fingir un verde. Se le puede pasar uno
ya descargado con `MONGOMS_SYSTEM_BINARY=/ruta/a/mongod`.

## Lo que falta, dicho

- **La conciliación con el corresponsal es MANUAL.** Hoy una persona de
  operaciones marca cada depósito contra el extracto. No hay integración
  automática todavía, y fingir que la hay sería peor que no tenerla porque
  nadie estaría revisando.
- **No hay ejecución real de divisas.** La tasa de `cambio.js` es de
  REFERENCIA. Cada cambio deja a la casa con una posición en `posicion.cambio`
  que alguien tiene que cerrar comprando la moneda de verdad. `reservas()`
  enseña esa posición corta a propósito, en vez de taparla con un ajuste.
- **Falta el puente con la Veta Wallet** (comprar ORIGEN/ONDK con saldo fiat).
  Los dos lados ya comparten el `gid` y la dirección custodiada viaja en el
  SSO, así que la pieza que falta es el asiento que ata las dos casas.
