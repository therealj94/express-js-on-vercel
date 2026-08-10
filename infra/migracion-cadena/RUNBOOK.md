# Runbook de la migración · cadena 8532 → Hyperledger Besu (QBFT)

Este es el plan de ejecución, paso a paso, con cada verificación y cada punto
de vuelta atrás. La regla que gobierna todo el documento: **ningún paso
destructivo sin haber verificado el anterior, y ninguna apertura al público
sin que `verificar.py` cuadre al 100 %.**

> **ALTO — 10-ago-2026.** El ensayo encontró que la cadena tiene **173
> contratos**, no 14, y que el método de leer el estado por RPC no puede
> capturarlos. Las etapas 1 y 2 de abajo están **suspendidas** hasta cerrar lo
> que describe `HALLAZGOS-2026-08-10.md`. No construir ningún génesis con
> `inventario.py` tal como está: produciría una cadena que parece correcta y
> ha perdido la mayor parte del estado.

## Los identificadores de red

| Red | Chain ID | Se registra en Chainlist |
|---|---|---|
| Orden Global (principal, nueva) | **5550** | sí |
| Orden Global Testnet | **5534** | sí |
| Ensayo desechable | **55330** | no, se tira |
| Cadena vieja (polygon-edge) | 8532 | queda como respaldo caliente |

**El número cambia, y esa es la decisión importante.** Conservar el 8532 en la
cadena nueva obligaría a apagar la vieja en el corte: con el mismo chain ID,
una transacción firmada para una vale en la otra, en los dos sentidos y
mientras las dos existan. Apagar la vieja convierte el respaldo caliente
—volver reapuntando el DNS, minutos— en uno frío —crear máquinas, restaurar
2,2 GB, arrancar: horas—. Y un remedio que duele horas, en la práctica, no se
usa. Con 5550 las dos conviven sin poder contaminarse.

Lo que cuesta: quien agregó la red a mano en MetaMask la vuelve a agregar, y la
app móvil necesita una actualización OTA. Está todo en un solo punto por
sistema (ver «El interruptor», abajo).

Comprobado antes de empezar:

- **5550 y 5534 están libres** en el registro público (chainid.network,
  2.684 cadenas, 10-ago-2026). Los ocupados más cercanos al 5550 son 5545
  (DuckChain) por abajo y 5551 (Nahmii 2) por arriba, así que el número no
  tiene margen a los lados: es el único libre de su vecindad inmediata.
- En `ethereum-lists/chains` **no se puede reservar** un número: se toma cuando
  se fusiona el PR, y para eso la cadena tiene que estar viva respondiendo por
  RPC. Por eso cada red se registra en cuanto arranca, no meses después.
- ~~La cadena vieja tiene ~250 transacciones históricas~~ **desmentido**: el
  estado real son 332 cuentas, 173 de ellas contratos, y 1.385 ranuras de
  almacenamiento. Ver `HALLAZGOS-2026-08-10.md`.
- Polygon Edge está archivado desde el 4-dic-2024 (motivo de la migración).

## Las piezas de esta carpeta

| Archivo | Qué hace |
|---|---|
| `volcar-estado.go` | **La fuente de verdad**: recorre el árbol de estado del nodo entero y avisa si le falta un solo nodo |
| `emparejar-preimagenes.py` | Convierte los hashes del árbol en direcciones y ranuras reales; **cuenta lo que no logra** |
| `inventario.py` | ~~Etapa 1~~ **INSUFICIENTE** — lee por RPC y sólo ve lo que sospecha. Sirve como fuente de candidatos, no como inventario |
| `construir-genesis.py` | Convierte el inventario en el génesis Besu. **No usar hasta que el emparejamiento cierre en cero** |
| `verificar.py` | El juez: compara una cadena contra el inventario. Si no cuadra, no se abre |
| `chainlist/eip155-8532.json` | El registro para Chainlist, listo para el PR |
| `HALLAZGOS-2026-08-10.md` | Qué encontró el ensayo y qué falta para poder seguir |

## Etapa 0 · Prerrequisitos (una vez)

- [ ] Credenciales de AWS vigentes (las de la sesión anterior expiraron el 6-ago).
- [ ] Acuerdo de la Junta sobre el Documento 6 (o al menos: autorización de las
      etapas 1–3, que no tocan producción ni mueven fondos).
- [x] **Java 25** en las máquinas de ensayo. (Decía «Java 21» y era falso:
      Besu 26.7.1 está compilado con class file 69 y se niega a arrancar con
      21. En Amazon Linux 2023: `dnf install java-25-amazon-corretto-headless`.)

## Etapa 1 · Inventario (no toca nada) — **REHACER, ver HALLAZGOS**

El inventario correcto se toma del árbol de estado del nodo, no del RPC:

```bash
# en el nodo, sobre una copia del árbol
go build -o volcar volcar-estado.go
./volcar -trie ./trie -raiz 0x<stateRoot> -salida estado.json
python3 emparejar-preimagenes.py estado.json candidatos.json
```

Sólo cuando el emparejamiento cierre en **cero huérfanas y cero cuentas sin
dirección** hay un inventario del que se pueda construir un génesis.

Lo de abajo es el método viejo, que se conserva porque su barrido de eventos
sigue siendo la mejor fuente de direcciones candidatas:

```bash
python3 inventario.py            # produce inventario-8532.json + su SHA-256
```

Barre los 4,15 M de bloques por tramos de 1.000 (límite del RPC), junta cada
evento Transfer/Approval, lee `balanceOf` de cada tenedor, el código y el
almacenamiento de cada contrato, y el saldo+nonce de cada dirección. Es
reanudable si el RPC se cae.

**Entregable: `inventario-8532.json` y su huella SHA-256.** La huella se
apunta en el acta — es lo que hace al inventario inmutable como referencia.

- [ ] Guardar el archivo y su huella en dos sitios (repo + copia fría).

## Etapa 2 · Génesis y ensayo — **HECHA el 10-ago-2026**

La cadena de ensayo (chain ID 55330) arrancó con los 130 contratos completos y
las 159 cuentas de personas, y `comparar-cadenas.py` dio **968 comprobaciones
iguales, 0 distintas, 0 sin poder comparar**. Eso cubre código desplegado,
nombre, símbolo, decimales y emisión de cada contrato, más saldo nativo y nonce
de cada cuenta.

Dos cosas que costaron y conviene no volver a descubrir:

- **QBFT no produce bloques con `--p2p-enabled=false`.** Aunque el nodo esté
  solo y no tenga con quién hablar, necesita la capa p2p levantada. Se arranca
  con `--p2p-host=127.0.0.1 --discovery-enabled=false`, que lo deja aislado
  igual pero produciendo.
- **Besu colorea su salida.** `public-key export-address` y `rlp encode`
  devuelven códigos ANSI mezclados con el valor; si se toman tal cual, el
  `validadores.json` sale con basura y el `extraData` queda vacío. Hay que
  filtrarlos.

Lo de abajo es el procedimiento, ya validado.



```bash
python3 construir-genesis.py inventario-8532.json --devolver-stake --periodo 10
```

Produce `genesis-besu-8532.json` con:
- los 14 contratos de token en sus mismas direcciones, con su código y su
  almacenamiento (la ranura del mapa de saldos se detecta y se COMPRUEBA
  contra `balanceOf`, no se asume);
- cada cuenta con su saldo y su **nonce** (el nonce copiado impide que una
  transacción vieja firmada se reejecute en la cadena nueva);
- gas en cero (`zeroBaseFee`), gasLimit 10 M — como hoy;
- **sin** el contrato de staking de Edge: los validadores los gestiona QBFT.
  Sus 10 ORIGEN retenidos se devuelven al validador en el génesis.

En una máquina de ensayo (basta una t3.medium):

```bash
# 1. instalar Besu (empaquetado oficial) y Java 21
# 2. generar la llave del nodo y sacar su dirección:
besu --data-path=nodo1 public-key export-address
# 3. poner esa dirección en validadores.json y codificar el extraData:
besu rlp encode --from=validadores.json --type=QBFT_EXTRA_DATA
#    → pegar el resultado en el campo extraData del génesis
# 4. arrancar:
besu --data-path=nodo1 --genesis-file=genesis-besu-8532.json \
     --rpc-http-enabled --rpc-http-api=ETH,NET,WEB3,QBFT \
     --min-gas-price=0
```

- [ ] La cadena de ensayo produce bloques.
- [ ] `python3 verificar.py inventario-8532.json http://ensayo:8545` → TODO CUADRA.
- [ ] Enviar una transacción de prueba de cada tipo: ORIGEN nativo, transfer
      de un token, y una llamada de lectura desde ordenscan.

## Etapa 3 · Ensayo con las apps (sigue sin tocar producción)

Apuntar a la cadena de ensayo, una por una: Veta Wallet (web y app, vía
`EXPO_PUBLIC_*` y la config del cliente), Genesis ID (`GENESIS_*`), ordenscan.
Operar una semana como un día cualquiera.

- [ ] Saldos correctos en Veta Wallet.
- [ ] Un envío de token de punta a punta.
- [ ] ordenscan indexa desde el bloque 0 nuevo.
- [ ] El cerebro lee la cadena de ensayo (validadores vía QBFT: ahora sí
      existe `qbft_getValidatorsByBlockNumber` — actualizar `cerebro.html`,
      que hoy decodifica el extraData de Edge a mano).

## El interruptor · dónde cambia el número, sistema por sistema

Hoy **todo sigue en 8532**, a propósito: el backend de producción atiende esa
red y voltear el número antes del corte rompería la billetera en vivo. Lo que
está hecho es dejar un solo punto por sistema, para que el corte sea cambiar
cuatro cosas y no buscar en cuarenta archivos.

| Sistema | Dónde | Hoy | En el corte |
|---|---|---|---|
| Billetera web | `apps-web/veta-wallet/app.js` → `window.OG_CHAIN_ID` | 8532 | 5550 |
| App móvil | `EXPO_PUBLIC_WALLET_CHAIN_ID` (llega por OTA) | 8532 | 5550 |
| Backend de la wallet | registro en la colección `ChainId` de Mongo | fila 8532 | añadir fila 5550 |
| Génesis de la cadena | `construir-genesis.py --chain-id` | — | 5550 |

Las otras ~40 apariciones de «8532» en el repositorio son texto de páginas y
documentos: no rompen nada, se corrigen con el resto de la comunicación.

`construir-genesis.py` **se niega a construir con 8532**. Es a propósito:
equivocar el chain ID en silencio es peor que no arrancar.

## Etapa 4 · El corte (fin de semana, requiere autorización de la Junta)

1. **Congelar**: parar la escritura (backend de la wallet en mantenimiento).
2. **Última foto**: `inventario.py` otra vez → inventario FINAL + huella.
   (El de la etapa 1 fue para ensayar; este es el que viaja.)
3. **Génesis final**: `construir-genesis.py` sobre el inventario final.
4. Arrancar Besu en los 6 nodos con ese génesis, **con 1 validador** (el
   mismo de hoy: la llave nueva del nodo Besu, no la de Edge).
5. `verificar.py` contra el nodo nuevo → **si no cuadra, se aborta**: el DNS
   sigue apuntando a la cadena vieja y no pasó nada.
6. Mover `rpc.ordenglobal-rpc.com` al balanceador de los nodos Besu.
7. Descongelar. Observar 24 h.

**Vuelta atrás en cualquier punto**: la cadena vieja no se apaga ni se borra.
Reapuntar el DNS y todo sigue como antes del corte.

## Etapa 5 · Validadores, de uno en uno

Con QBFT los validadores se suman por **voto de los existentes**
(`qbft_proposeValidatorVote`), no por stake — ya no hace falta fondear nada
para validar. Por cada nodo: comprobar que está en la punta y estable ≥24 h,
proponer el voto, verificar que entra al conjunto, y que la cadena sigue
produciendo. Uno caído con 6 firmantes detiene la cadena; por eso jamás se
suman dos a la vez.

- [ ] 2 validadores … [ ] 4 … [ ] 6.

## Etapa 6 · Registro público y archivo

- **Chainlist**: PR a `ethereum-lists/chains` añadiendo
  `chainlist/eip155-8532.json` como `_data/chains/eip155-8532.json`. Requisito
  del registro: el RPC público debe responder `eth_chainId` = 8532 — ya lo
  hace hoy, así que el PR puede ir apenas el corte esté hecho (o incluso
  antes: el registro describe la red, no el motor).
- **Archivo**: la cadena Edge queda encendida en un solo nodo, en modo
  consulta, con las ~250 transacciones históricas exportadas del inventario y
  visibles en ordenscan como historia.

## Riesgos que este runbook cierra, y cómo

| Riesgo | Cierre |
|---|---|
| Un saldo llega mal | `verificar.py` compara TODOS contra el inventario firmado; sin 100 %, no se abre |
| Repetición de transacciones viejas | nonces copiados al génesis |
| extraData mal codificado | se usa el codificador oficial de Besu, nunca a mano |
| El corte sale mal | la cadena vieja sigue viva; vuelta atrás = reapuntar DNS |
| Un validador nuevo tumba la cadena | se suman de uno en uno, tras 24 h estables |
| Colisión de chain ID | verificado libre en el registro público antes de empezar |
| El RPC se cae durante el inventario | el barrido es reanudable y con reintentos |
