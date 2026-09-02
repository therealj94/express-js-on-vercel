# El puente fiat ↔ ORIGEN, con AuCorp como libro

*Propuesta para la Junta. Escrita el 2 de septiembre de 2026 sobre el código tal
como está en el repositorio ese día; ninguna cifra sale de memoria.*

---

## En una línea

Hoy el dinero de la gente cruza entre el mundo bancario y ORIGEN por **tres
circuitos manuales que no se hablan entre sí y ninguno pasa por AuCorp**. La
propuesta es que los tres sigan existiendo como *puertas* —no se cierra nada—
pero que todo lo que entre o salga en fiat quede **asentado en el libro de
partida doble de AuCorp**, que es la única pieza del ecosistema que ya lleva
saldos derivados del libro, con guarda de doble gasto, comprobante por
movimiento y extracto mensual. Ni un asiento nuevo de esta propuesta mueve
fondos solo: todos quedan detrás de la confirmación de un operador con clave
y comprobante, como ya pasa hoy con los depósitos y retiros de AuCorp.

## Vocabulario, para no equivocarse en el papel

- **ORIGEN** es la moneda de la cadena 5550 de Orden Global. Está
  *referenciada* al oro: su precio de referencia sale de `precio.py` y se
  enseña con fecha. No está *respaldada* por oro, no se dice «respaldada», y
  no se promete convertibilidad.
- **AuCorp** es una institución de tecnología financiera bajo la Regulación
  FinTech A de Próspera ZEDE. No es un banco con licencia bancaria; no hay
  seguro de depósitos. No se dice «regulado» a secas.
- **Fiat** aquí es cualquiera de las 21 monedas que `lib/monedas.js` sabe
  contar. Que la casa sepa contarla no quiere decir que pueda liquidarla en un
  banco de esa plaza: eso depende del corresponsal.

---

## Los tres circuitos manuales de hoy, mapeados

### 1 · Los agentes de Ordenex (persona a persona)

**Dónde vive:** `infra/ordenex-api/controllers/fiatController.js`,
`routes/fiat.js`, pantalla en `apps-web/ordenex/fiat.js`.

**Cómo funciona:** un *agente* dado de alta por admin publica que compra o
vende su propio ORIGEN por HNL o USD. El usuario abre una solicitud contra
él; la casa **reserva el ORIGEN en garantía** en el ledger de Ordenex; el
fiat viaja **de banco a banco entre las dos personas**; quien recibe el fiat
confirma; la garantía se ejecuta. Estados: `abierta → tomada → fiat-avisado →
liquidada | cancelada | disputa`. Si nadie confirma, arbitra admin.

**Qué es manual:** el fiat entero. La casa no toca lempiras ni dólares —es el
principio 1 del contrato de ese circuito—: sólo custodia ORIGEN y arbitra.

**Qué no queda en ningún libro:** el fiat. Ordenex sabe cuánto ORIGEN cambió
de manos y a qué precio pactaron, pero **no tiene un asiento en fiat**: no
puede decir cuántos lempiras entraron al ecosistema en agosto, ni emitir un
comprobante fiat, ni tamizar al titular de la cuenta bancaria del agente contra
la OFAC (el tamiz de Ordenex es sobre direcciones de la cadena).

### 2 · La compra con USDT desde Polygon y BSC (VentaOrigen)

**Dónde vive:** `infra/contratos-venta/contracts/VentaOrigen.sol` (escrito y
probado, **no desplegado**), `infra/ordenex-api/lib/vigiaCompras.js`.

**Cómo funciona:** el comprador aprueba USDT en Polygon o BSC y llama
`comprar()`; el contrato manda el USDT a la tesorería
(`0x6A1aeD…eBBc`) en la misma transacción y deja escrito cuánto ORIGEN se debe
y a qué dirección de la 5550; el vigía lee el evento con confirmaciones de
sobra y paga desde la billetera pagadora (`0x7462…3ad8`).

**Qué es manual:** todo lo que está *antes* y *después* del contrato. Fondear
la pagadora (hoy ~20,96 ORIGEN, decisión de tesorería pendiente), dar gas,
decidir las llaves owner/operator, y —lo que importa para este documento—
**convertir el USDT de la tesorería a fiat** o al revés. Ese paso no está en
ningún código: es una persona con una cuenta en un exchange.

**Qué no queda en ningún libro:** el USDT que llega a la tesorería y su
conversión posterior. La 5550 sabe cuánto ORIGEN salió; el explorador de
Polygon sabe cuánto USDT entró; nadie tiene los dos lados en un asiento con
fecha, tasa y contraparte.

### 3 · La recarga de tarjetas de débito (Cryptomate)

**Dónde vive:** el backend de la wallet y el informe
`documentos/Orden-Global-Tarjetas-Debito.pdf`
(`documentos/armar-informe-tarjetas.py`, medido el 27 de agosto de 2026).

**Cómo funciona:** la persona paga ORIGEN en la 5550; el sistema libera USDT
desde un tesoro en Polygon hacia el proveedor de la tarjeta; el proveedor
acredita saldo en dólares en la tarjeta.

**Qué es manual, y qué falló:** las dos mitades no son atómicas. Las **dos
únicas recargas** intentadas (31 de julio y 8 de agosto) **cobraron 82 ORIGEN
—207,12 dólares— y no entregaron saldo**; el rescate previsto (estado
`debited`) no se disparó solo. El tesoro que paga todas las recargas tenía
6,27 dólares. Una de las dos personas es un cliente de fuera de la casa.

**Qué no queda en ningún libro:** exactamente lo que hizo daño. No hay un
asiento que diga «se le debe a esta persona 41 ORIGEN o 103,56 USD de una
recarga que no llegó». Está en una colección de estados, no en un pasivo.

### Lo que los tres tienen en común

| | Agentes | VentaOrigen | Tarjetas |
|---|---|---|---|
| Quién mueve el fiat | dos personas, banco a banco | el comprador (USDT) y una persona en un exchange | el proveedor de tarjetas |
| Quién confirma | la contraparte, o admin | el vigía (cadena) | nadie confirmó las dos veces |
| Tamiz OFAC del lado fiat | no | no | no |
| Comprobante fiat para el cliente | no | no | no |
| Pasivo escrito cuando algo queda a medias | no (disputa) | no (fila pendiente) | no (estado `debited`) |
| Pasa por AuCorp | no | no | no |

Tres circuitos, tres formas de quedar a medias, y ninguna deja un pasivo a la
vista. Ese es el problema que se propone resolver, no la existencia de los
circuitos.

---

## Lo que AuCorp ya tiene y los otros no

Todo esto está escrito, probado y en verde en `infra/aucorp-api/`:

- **Libro de partida doble en unidades mínimas enteras**, con cuadre por
  moneda y saldo *derivado* del libro (`lib/libro.js`, `lib/asientos.js`). El
  saldo de un cliente es un pasivo: la casa se lo debe.
- **Guarda de doble gasto** en la base, no en memoria: dos retiros a la vez
  sobre el mismo saldo, y sale uno.
- **La frontera del dinero es manual y con comprobante obligatorio**
  (`/tesoreria/deposito`, `/tesoreria/retiro`, detrás de `X-Admin-Key`). Un
  depósito lo confirma quien vio llegar el dinero.
- **Solicitudes con estado y con «qué falta»**: los retiros se piden y los
  depósitos se avisan; cada una dice cuántas horas lleva sin cambio y qué le
  falta para terminar. Un barrido las cuenta y las canta en el log —**sólo
  avisa**, no resuelve.
- **Tamiz OFAC** del titular de cada destino bancario y de cada retiro, con
  la misma lista y el mismo algoritmo que Genesis. Fail-closed: sin lista no
  sale nada; con coincidencia fuerte queda una alerta para cumplimiento.
- **Comprobante por movimiento** (con saldo antes y después y huella SHA-256)
  y **extracto mensual** (JSON y CSV; PDF desde el navegador).
- **Límites por nivel** medidos en dólares sobre lo que sale, y reporte AML
  de cada movimiento a Genesis.
- **La identidad ya es la misma**: el `gid` de Genesis ata la cuenta fiat de
  AuCorp con la dirección custodiada de la Veta Wallet (viaja en el SSO).

Lo que le falta a AuCorp es precisamente el asiento que ata las dos casas:
comprar ORIGEN con saldo fiat y vender ORIGEN a saldo fiat. Está anotado en su
`LEEME.md` desde el primer día.

---

## La propuesta: AuCorp como libro del puente

### El principio

**Todo fiat que entre o salga del ecosistema pasa por una cuenta de AuCorp
del mismo `gid`.** Los tres circuitos siguen siendo puertas por donde el
dinero *físicamente* se mueve, pero el *registro* —quién debe qué a quién,
desde cuándo, con qué comprobante— vive en el libro de AuCorp.

Y una regla que no se negocia: **AuCorp no emite ORIGEN ni lo custodia**. Lo
custodia la Veta Wallet (dirección custodiada) y lo paga la billetera
pagadora de la 5550. AuCorp lleva el lado fiat y la cuenta de ORIGEN como
*posición* propia, igual que hoy lleva `posicion.cambio` para las divisas.

### Las cuentas nuevas del libro

Cuatro cuentas, y ninguna es de cliente:

| Cuenta | Tipo | Qué representa |
|---|---|---|
| `posicion.origen` | activo | ORIGEN que la casa tiene en su billetera pagadora, contado en unidades mínimas de ORIGEN (18 decimales, nunca coma flotante) |
| `puente.pendiente:<gid>` | pasivo | Fiat de un cliente ya cobrado por una compra de ORIGEN que **todavía no se pagó** en la 5550. Es un pasivo: se le debe |
| `puente.usdt` | activo | USDT en la tesorería de Polygon/BSC, mientras no se convierta |
| `tesoreria.tarjetas` | activo | USD del tesoro que paga recargas |

`reservas()` (que ya existe) compara pasivos contra activos por moneda y grita
si se le debe a la gente más de lo que hay. Con estas cuentas, **una recarga
cobrada y no entregada aparece en `reservas()` el mismo día**, como un pasivo
sin activo enfrente.

### Los dos movimientos del puente

**Comprar ORIGEN con saldo fiat** (desde la banca de AuCorp, con la tasa de
`precio.py` enseñada con su fecha):

1. Cliente pide: `POST /puente/comprar { ref, moneda, monto }`. Se tamiza
   (OFAC, límites, KYC), igual que un retiro.
2. Asiento *aparta*: `cliente:<gid>` debe → `puente.pendiente:<gid>` haber
   (sigue siendo pasivo). Solicitud `tipo: 'compra-origen', estado:
   'pendiente'`. **Nada sale de la 5550 todavía.**
3. **Un operador** con `X-Admin-Key` paga desde la billetera pagadora a la
   dirección custodiada del `gid` y llama `POST /tesoreria/puente/:id/ejecutar
   { hashTx }`. El API comprueba el hash en la 5550 (mismo patrón que el
   vigía: recibo, éxito, confirmaciones) antes de cerrar.
4. Asiento *cierra*: `puente.pendiente:<gid>` debe → `puente.usdt` o
   `banco.corresponsal.<moneda>` haber (el fiat queda en la casa), y
   `posicion.origen` haber por el ORIGEN entregado. Comprobante con las dos
   patas, tasa y hash.
5. Si no se paga en N horas, el **barrido lo canta**. Si se rechaza, el fiat
   vuelve entero a `cliente:<gid>`.

**Vender ORIGEN a saldo fiat** es el espejo: el cliente manda ORIGEN a la
pagadora desde su Veta Wallet con una referencia; el vigía (o un operador) lo
ve; `POST /tesoreria/puente/venta { gid, hashTx, moneda, monto }` asienta
`posicion.origen` debe → `cliente:<gid>` haber. Sin hash confirmado no se
acredita nada, y el hash es la llave de idempotencia.

En los dos casos el paso que toca fondos (3) es humano y deja comprobante. No
hay `setInterval` que pague.

### Cómo se recablean los tres circuitos

**Agentes de Ordenex.** El agente se convierte en un cliente de AuCorp con
nivel 3 y cuenta en HNL/USD. La solicitud de Ordenex sigue igual —reserva de
ORIGEN, fiat banco a banco— pero al *liquidar* Ordenex llama a AuCorp para
asentar la transferencia fiat entre `cliente:<agente>` y `cliente:<usuario>`
como una transferencia interna (o, si el fiat viajó por fuera, como un
asiento de clase `agente` con el comprobante bancario). Ganancia: el fiat
queda en un libro, el titular de la cuenta del agente pasa el tamiz OFAC, y el
usuario tiene comprobante y extracto. Coste: el agente tiene que hacer el KYC
de AuCorp (ya lo hizo en Genesis).

**VentaOrigen.** El vigía, además de pagar, asienta en AuCorp: `puente.usdt`
debe (lo que entró) → `posicion.origen` haber (lo que salió), con el hash de
cada cadena. La conversión USDT → fiat, cuando una persona la haga en un
exchange, es un asiento de tesorería con comprobante: `banco.corresponsal.usd`
debe → `puente.usdt` haber. Así la Junta ve cuánto USDT hay sin convertir y
cuánto ORIGEN se vendió a qué precio, en un solo sitio.

**Tarjetas.** Cada recarga se asienta *antes* de tocar Polygon: `cliente` (en
ORIGEN, si se abre esa moneda en AuCorp) o la solicitud `recarga` con estado
`cobrada`; el pago al proveedor es el paso humano/vigilado que la cierra.
Las dos recargas a medias de julio y agosto **se cargan primero como
pasivo** (`puente.pendiente:<gid>` por 41 ORIGEN cada una, o su equivalente
en USD al precio de ese día, según lo que decida la Junta) para que existan
en el libro antes de resolverse. Devolver el ORIGEN o completar la recarga
es entonces un asiento normal con comprobante, y `reservas()` deja de gritar
cuando se cierre.

### Lo que NO se propone

- No se propone que AuCorp pague ORIGEN solo. La billetera pagadora la maneja
  una persona (o el vigía para VentaOrigen, que ya tiene sus tres guardas).
- No se propone convertir automáticamente USDT a fiat.
- No se propone cerrar ninguno de los tres circuitos: son las únicas puertas
  que hay mientras no exista corresponsal en cada plaza.
- No se propone prometer una tasa ni una convertibilidad. La tasa de
  ORIGEN es de referencia y se enseña con fecha; el cliente acepta un
  `minOrigen`, como en el contrato.

---

## Qué decisión necesita la Junta

1. **Que el fiat del ecosistema se asiente en AuCorp**, aunque siga entrando
   por Ordenex, por Polygon o por el proveedor de tarjetas. Es una decisión de
   arquitectura y de responsabilidad: AuCorp pasa a ser quien *responde* por
   los saldos fiat de la gente, bajo su Regulación FinTech A. Sin este sí, lo
   demás no se construye.
2. **Cómo se contabilizan las dos recargas cobradas y no entregadas** (82
   ORIGEN, 207,12 USD al precio del informe): si como pasivo en ORIGEN o en
   USD, y si se devuelve el ORIGEN o se completa la recarga. Hay que
   decidirlo antes de asentarlas, porque el asiento fija la moneda de la deuda.
3. **Quién es el operador del puente** —la persona con `X-Admin-Key` de
   AuCorp y con acceso a la billetera pagadora— y con qué límite diario. Hoy
   la billetera pagadora tiene ~20,96 ORIGEN: fondearla es una decisión de
   tesorería que este documento no toma.
4. **Si los agentes de Ordenex tienen que ser clientes de AuCorp** (nivel 3,
   con expediente) para seguir operando. Es lo que hace que el tamiz OFAC les
   alcance del lado fiat.
5. **Comisiones y límites del puente.** Todo arranca en cero y en nivel 1,
   como el resto de AuCorp; los definitivos son política de la Junta
   (`AUCORP_TARIFAS`, `AUCORP_LIMITES`).
6. **Importar la lista de la OFAC en producción** el primer día
   (`POST /tesoreria/sanciones/importar`): mientras no esté, ningún retiro ni
   destino bancario nuevo pasa. Es a propósito, y conviene saberlo antes de
   abrir la puerta.

---

## Orden de obra propuesto, si la Junta dice que sí

1. Cuentas nuevas y clase `puente` en el libro; `reservas()` las ve. Sin
   rutas todavía. Prueba: las dos recargas a medias cargadas como pasivo y
   `reservas()` en rojo por esa cifra exacta.
2. `POST /puente/comprar` y `POST /tesoreria/puente/:id/ejecutar` con
   comprobación del hash en la 5550. Barrido y comprobante ya lo cubren.
3. Venta espejo con hash como idempotencia.
4. El vigía de VentaOrigen asienta en AuCorp (una llamada más, con la clave de
   la app en Genesis como hoy).
5. Ordenex asienta la liquidación fiat de cada solicitud de agente.
6. Pantalla «Comprar ORIGEN» en la banca, con la tasa de referencia y su
   fecha, detrás del mismo sello de idempotencia que todo lo demás.

Cada paso deja el sistema funcionando y probado; ninguno mueve fondos sin
una persona y un comprobante.
