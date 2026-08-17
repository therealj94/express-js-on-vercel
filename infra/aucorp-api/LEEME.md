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
| `controllers/tesoreria*` | La frontera: por dónde entra y sale el dinero. Detrás de `X-Admin-Key`. |

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

## Las pruebas

```
npm install
npm run probar
```

Cuatro suites. `probar-monedas` y `probar-libro` son puro cálculo;
`probar-asientos` y `probar-api` levantan un Mongo en memoria (y `probar-api`
además finge a Genesis, que es de otra casa — todo lo de AuCorp corre de
verdad, incluida la tasa de cambio real). `probar-cambio` llama a la fuente de
tasas de verdad a propósito: un fingido diría que todo funciona el día que la
fuente cambie de formato, y eso se descubriría con un cliente delante.

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
