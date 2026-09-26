# SFSP-410 · Ensayo general sobre una bifurcación local de la 5550

- Fecha: 2026-09-26 (UTC) · Equipo A
- Estado: **ENSAYO**. Ningún contrato existe en la 5550. **No se envió ninguna transacción a ninguna red real.**
- Scripts: `contracts/scripts/desplegar-sfsp410.js` (despliegue), `contracts/scripts/ensayo-fork-5550.js` (ensayo), `contracts/scripts/relay-solo-lectura.js` (relé de lectura)
- Parámetros: `deploy/sfsp410/parametros.plantilla.json` (plantilla con 165 valores en `null`)

## 1. Qué se ensayó

Se bifurcó la cadena 5550 en el **bloque 270.661** (26-sep-2026 07:30:15 UTC, `0xd41045d7…e066`, Besu 26.7.1) dentro de la red Hardhat **en proceso**, con chainId 5550, hardfork Paris (`merge`) y el límite de gas real de la cadena (10.000.000 por bloque). Sobre esa copia local:

1. Se desplegó todo con **el mismo script que se usará en la red real**, alimentado con un archivo de parámetros **SINTÉTICO** (quórum 2 de 4, timelock 3.600 s, cupos y topes inventados). Esos valores no son una propuesta.
2. Los firmantes sintéticos propusieron y aprobaron las 21 órdenes que dejó preparadas el despliegue. TECH_OPS las ejecutó: 17 `SET_POLICY` en el acto y los 4 cupos después de la espera.
3. **(a)** Se suplantaron las 44 cuentas internas propuestas. Las 31 que tenían saldo movieron todo su ORIGEN a `SFSPNativeVault` con `absorb`. Esto se hizo **sólo en la bifurcación**.
4. **(b)** Se comprobó que `circulating()` es igual a la suma de ORIGEN de los tenedores que no son cuentas internas.
5. **(c)** Se fijó el cupo de liberación por gobierno (proponer, aprobar, esperar, ejecutar) y se hizo `releaseOnDemand` a un usuario real.
6. **(d)** Se fijó el cupo de emisión del ONDK nuevo y se hizo `mintOnDemand` a un usuario real de ONDK.
7. **(e)** Se comprobó que acuñar o liberar hacia una cuenta interna revierte.

### Cómo se resolvió la bifurcación

- **Motor de Hardhat sin proxy.** EDR, el motor de Hardhat escrito en Rust, no usa el proxy de salida del entorno ni confía en su CA. Por eso el ensayo levanta `relay-solo-lectura.js` en `127.0.0.1`, que reenvía con `undici` (con proxy y CA) al RPC público.
- **El relé sólo lee.** Deja pasar únicamente métodos de lectura y rechaza cualquier escritura (`eth_sendRawTransaction`, `eth_sendTransaction`, `eth_accounts`, …). En el ensayo reenvió unas 16.900 lecturas (16.949 y 16.883 en dos corridas sobre el mismo bloque): `eth_getBalance`, `eth_getCode`, `eth_getStorageAt`, `eth_getTransactionCount`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_chainId`, `net_version` y `web3_clientVersion`. La escritura de prueba que se le mandó al final quedó **bloqueada en el relé**.
- **`hardhat.config.js` no se toca.** Antes de crear el proveedor, el script ajusta `hre.config.networks.hardhat` en memoria: `chainId: 5550`, `chains[5550].hardforkHistory = {merge: 0}` y `blockGasLimit` igual al del bloque bifurcado. Después llama a `hardhat_reset` con `forking`.
- **El génesis sigue cuadrando.** Las cuentas sintéticas de Hardhat nacen con 10.000 ETH que en la 5550 no existen, así que se les devuelve su saldo real de la 5550 (0). Todas las transacciones van con precio de gas 0, porque el `baseFee` de la 5550 es 0. Así la suma de todos los saldos sigue siendo exactamente el génesis y no se quema ni se crea ORIGEN.

## 2. Resultados

### 2.1 Circulante de ORIGEN

| Magnitud | Valor (ORIGEN) |
|---|---:|
| Génesis (`genesisSupply`) | 1.000.000.000.000 |
| Suma de los 172 tenedores de la foto, leída en vivo en la bifurcación | 1.000.000.000.000 (**cuadra exacto**; sin cambios desde la foto del bloque 270.224) |
| `circulating()` recién desplegado, con las internas todavía fuera de la bóveda | **10.350,790118839492560704** |
| Bóveda tras consolidar (`vaultBalance` = `totalAbsorbed`) | 999.999.989.649,209881160507439296 |
| Internas fuera de la bóveda tras consolidar | 0 |
| `circulating()` tras consolidar | **10.350,790118839492560704** (idéntico: consolidar no cambia el circulante) |
| Esperado: tenedores no internos (vivo = foto 270.224) | 10.350,790118839492560704 → **CUADRA** |
| · de ellos, clase USUARIO | 340,846702495492560704 |
| · de ellos, DESCONOCIDO pequeño | 10.009,943416344 |
| Identidad `génesis = bóveda + internas fuera + circulante` | **se cumple** |

**Lectura.** De los 10.350,79 ORIGEN que hoy contarían como circulante, **10.007 están en una sola dirección**, `0xd894…4bda5`. Aparece como destino en pruebas del repo (pregunta 6 de la foto) y no se incluyó entre las internas. Si la Dirección confirma que es interna, el circulante baja a **343,79 ORIGEN**.

La foto da 347,76 ORIGEN a la clase USUARIO, y aquí salen 340,85. La diferencia, 6,92 ORIGEN, está en tres direcciones que la foto clasificó como «sembradas en el corte» y que la lista propuesta trata como internas: `0xb710…`, `0x7ac1…` y `0x3409…`, las grandes tenedoras de tokens.

### 2.2 Consolidación (a), por grupo

| Grupo | Cuentas con saldo | ORIGEN a la bóveda |
|---|---:|---:|
| ORIGEN_14SEP (las 6 del 14-sep) | 6 | 999.999.988.919,904175 |
| PREMIOS_MERCADEO | 2 | 509,996094 |
| ORDENEX | 3 | 200,338579504507439296 |
| TOKENS_GRANDES | 3 | 6,915671632 |
| PAGADORA | 1 | 4,761195936 |
| ONDK_11SEP | 4 | 2,033434752 |
| TESORERIA | 2 | 2 |
| LIQUIDEZ | 2 | 2 |
| DESPLEGADOR | 1 | 1 |
| VALIDADOR (7) | 7 | 0,260730336 |
| **Total** | **31** | **999.999.989.649,209881160507439296** |

Las otras 13 cuentas de la lista tenían saldo 0: las 4 madre, 4 de Ordenex y 5 del reparto de ONDK.

### 2.3 Liberación, emisión y negativos

| Paso | Resultado |
|---|---|
| Cupo antes de la espera (R5) | revierte `BudgetWaitPending` ✔ |
| (c) `releaseOnDemand` 50 ORIGEN a `0x58dE…F450` (usuario) | saldo 204,947 → 254,947; circulante +50; cupo restante 950 de 1.000 ✔ |
| · mismo `paymentRef` dos veces | `OperationReplay` ✔ |
| · 101 ORIGEN (máximo por operación 100) | `BudgetOperationTooLarge` ✔ |
| · usuario real **sin alta** de identidad | `ReleaseRejected` ✔ |
| · hacia `0xef98…cb45` (interna) | `ReleaseToInternalAccount` ✔ |
| · llamado por quien no es ISSUER | `Unauthorized` ✔ |
| (d) `mintOnDemand` 250 ONDK a `0xc55a…3Eaf` (usuario ONDK) | `totalSupply` = 250 = saldo del usuario (I-82); cupo restante 9.750 ✔ |
| (e) `mintOnDemand` hacia `0x3c27…791a` (interna, **con** alta de identidad) | `MintToInternalAccount` ✔ |
| (e) `releaseOnDemand` hacia la misma | `ReleaseToInternalAccount` ✔ |
| (e) TECH_OPS intenta desmarcar una interna | `InternalAccountUnflagNeedsBoard` ✔ |
| Un solo firmante corta el cupo de ONDK (R6) → `mintOnDemand` | `BudgetNotSet` ✔ |
| El desplegador al final | **ningún rol** en ninguno de los 11 contratos (comprobado con `hasRole` para los 5 roles) ✔ |
| Guardas del script contra el RPC real (a través del relé) | sin `--real`, sin `DESPLIEGUE_AUTORIZADO`, con hash erróneo o con archivo SINTETICO: rechazado con código 5, sin enviar nada ✔ |

### 2.4 Gas

Despliegue: **43.752.090 de gas en 172 transacciones** (bloques 270.661 → 270.833 de la bifurcación). La transacción más grande usa 3,45 M y cabe en el bloque de 10 M de la 5550.

| Paso del despliegue | Tx | Gas |
|---|---:|---:|
| 1 · 11 contratos | 11 | 29.444.685 |
| 2 · cableado (gobierno, emisor, migraciones, TECH_OPS de ejecutores) | 23 | 1.101.251 |
| 3 · pasaportes (ORIGEN + 4 tokens) | 6 | 3.039.757 |
| 4 · topes del instrumento | 4 | 371.040 |
| 5 · 44 cuentas internas × 2 contratos | 88 | 8.127.316 |
| 6 · roles definitivos | 28 | 1.367.596 |
| 7 · el desplegador revoca todo lo suyo | 12 | 300.445 |

| Contrato | Gas de despliegue |
|---|---:|
| SFSPGovernanceController | 2.163.012 |
| SFSPAssetRegistry | 2.858.795 |
| SFSPIdentityAdapter | 1.535.353 |
| SFSPEligibilityEngine | 2.076.680 |
| SFSPIssuanceController | 3.448.870 |
| SFSPMigrationRegistry | 2.552.971 |
| SFSPNativeVault | 2.679.372 |
| SFSPRegulatedAsset × 4 (ONDK, AUKA, IBS, HARV) | 3.032.411 c/u |

| Paso del ensayo | Tx | Gas |
|---|---:|---:|
| Gobierno: proponer + 2 aprobaciones × 21 órdenes | 63 | 4.378.095 |
| Ejecutar 17 `SET_POLICY` | 17 | 2.235.641 |
| Ejecutar 4 cupos tras la espera | 4 | 708.246 |
| (a) `absorb` de 31 cuentas | 31 | 917.557 (≈ 29.600 c/u) |
| Altas de identidad sintéticas | 3 | 146.445 |
| (c) `releaseOnDemand` | 1 | 163.805 |
| (d) `mintOnDemand` | 1 | 250.480 |
| Corte de cupo por un firmante | 1 | 47.520 |

Coste orientativo en la red real: la 5550 responde `eth_gasPrice` = 93 gwei. A ese precio el despliegue completo cuesta unos **4,1 ORIGEN** y cada `releaseOnDemand` o `mintOnDemand` unos 0,015–0,023 ORIGEN.

## 3. Pasos en la red real, en orden, y quién firma cada uno

Ninguno se puede dar hoy. Los bloquean D07, D23, D24, D25, D26, D27 y D08, y además las compuertas D11, D12 y P11 del `MANIFIESTO.md`.

| # | Paso | Quién firma o decide | Mueve fondos |
|---|---|---|---|
| 0 | Decidir cada valor de la plantilla y levantar el acta. D25 confirma la lista de cuentas internas y pone `confirmadaPorActa: true`. | Junta (D07, D23, D24, D25, D08, D27) | No |
| 1 | Desplegar la multifirma de la Junta (contrato) y dar de alta las billeteras de hardware de los firmantes. Poner en KMS las llaves de servicio ISSUER y TECH_OPS. | Firmantes · Tecnología | No |
| 2 | Llenar `parametros.json` y **repetir este ensayo con el archivo real** en la bifurcación: el script acepta parámetros no sintéticos en local y suplanta al desplegador. Adjuntar el resultado al acta. Declarar también como internas las llaves operativas que tengan ORIGEN (ver hallazgo H-2). | Tecnología; revisa un tercero | No |
| 3 | La Junta revisa el archivo exacto y emite `DESPLIEGUE_AUTORIZADO` con su SHA-256. Compuerta P11. | Junta | No |
| 4 | Ejecutar `node scripts/desplegar-sfsp410.js --parametros parametros.json --rpc <firmante externo> --real`. Son 172 transacciones que firma **la billetera de hardware del desplegador**, sin llaves en el script. Al final el desplegador queda sin roles, y el script lo verifica. | Desplegador (hardware) | Sólo gas |
| 5 | Verificación independiente: bytecode desplegado frente al de la build, `hasRole` de cada contrato, cuentas internas, pasaportes (`MANIFIESTO` §6). | Auditor / revisor distinto del autor | No |
| 6 | Proponer las 21 órdenes preparadas en `ordenesDeGobierno`: 17 `SET_POLICY` y 4 cupos (ONDK, IBS, HARV, ORIGEN). AUKA no tiene cupo (SFSP-410 §3.2). | Un firmante propone | No |
| 7 | Aprobar cada orden. Con el quórum real, quien propone no cuenta. | Otros firmantes, hasta el quórum (D07) | No |
| 8 | Ejecutar las `SET_POLICY` en el acto. Ejecutar `setMintBudget` y `setReleaseBudget` **después** del timelock y **antes** de que venza la orden (`vigenciaOrdenesSegundos` > timelock; el script lo exige). | TECH_OPS (ejecuta, no aprueba) | No |
| 9 | Dar de alta a los usuarios reales en el adaptador de identidad con su **atestación Genesis ID** (compromiso por propósito). Sin alta, liberar o acuñar revierte, como se vio en el ensayo. | ATTESTOR (Genesis ID) | No |
| 10 | Consolidar: cada cuenta interna envía su ORIGEN a la bóveda con `absorb(CONSOLIDACION)` y **deja fuera sólo el colchón de gas** de las cuentas operativas declaradas. Son 31 cuentas con saldo; las 6 del 14-sep concentran el 99,999999 %. Comprobar después que `circulating()` = usuarios + desconocidos pequeños. | Quien controla cada llave (Dirección, D25) | **Sí** (D23, D25) |
| 11 | Migración SFSP-700 de ONDK, AUKA, IBS y HARV con padrón **sólo de usuarios** (D26). El inventario interno no se migra. Retirar AGKA, MNKA, AUBEX, ASL, LOVE, REST, SOL, AIT, AGRO y POLITICAL. | Junta + ATTESTOR de migración | Sí (D26) |
| 12 | Ordenex y Veta pasan a `mintOnDemand` y `releaseOnDemand` con la llave ISSUER en KMS. Cualquier firmante puede cortar un cupo al instante. | ISSUER (servicio) · firmantes para cortar | Sí, dentro del cupo |

## 4. Hallazgos

- **H-1 · Bóveda (baja).** `SFSPNativeVault.setInternalAccount` acepta la dirección de la propia bóveda. Sólo rechaza `address(0)`. Si se marca, `internalOutsideVault()` suma su saldo otra vez y `circulating()` queda por debajo de lo real (o en 0). Sólo pueden hacerlo TECH_OPS o la Junta. Propuesta: `require(account != address(this))`. No se modificó ningún `.sol`.
- **H-2 · Diseño (operativo).** R2 impide que la bóveda libere a una cuenta interna, así que **el gas de las llaves propias no puede salir de la bóveda**. Hay que dejar un colchón de gas en una cuenta interna declarada fuera de la bóveda, que `circulating()` ya descuenta. Las llaves operativas nuevas (desplegador, multifirma, firmantes, ISSUER, TECH_OPS, ATTESTOR) deben declararse internas. Si no, su ORIGEN cuenta como circulante. El script de despliegue avisa de cada una que falte.
- **H-3 · Operativo.** Si la ventana de una orden de cupo (`expiry`) es menor que el timelock, el cupo aprobado no se puede ejecutar nunca. El script lo impide con `vigenciaOrdenesSegundos > timelockSegundos`. `requiresAuthorization = true` en la política de un activo con cupo haría revertir toda emisión bajo demanda, y el script también lo impide.
- **H-4 · Datos.** `parametros.plantilla.json` lleva las 44 direcciones reales de la organización que pidió el líder. `MANIFIESTO.md` §7 prohíbe direcciones reales en `deploy/`, y SFSP-410 §7 dice que la foto no vive en el repositorio público. Casi todas ya aparecen en el repo (`respuestas/`, `infra/`), pero **decidir antes de hacer commit**. Ninguna dirección de usuario entra en el repositorio: el ensayo las lee de la foto, fuera del repo, y este documento las abrevia.
- **H-5 · Pendientes de D25.** No se incluyeron `0xd894…4bda5` (10.007 ORIGEN), `0x9af6…0b92` (IBS) ni `0x6bdc…cdc8` (ONDK, que el censo trata como usuario). Las 9 billeteras de origen del reparto de ONDK del 11-sep tampoco, porque sólo se conoce su prefijo. IBS tiene dos contratos con el mismo símbolo (SFSP-700).

## 5. Cómo repetirlo

```
cd sfsp/contracts
CUENTAS_INTERNAS=<ruta fuera del repo>/cuentas-internas.propuesta.json \
node scripts/ensayo-fork-5550.js \
  --foto  <ruta>/supply/tenedores-clasificados.json \
  --censo <ruta>/ondk/censo-ondk.json \
  --salida <carpeta de trabajo>
```

Las cuentas internas reales se leen de un archivo externo (`CUENTAS_INTERNAS`): no viven en este repositorio público. Tarda unos 5 minutos, casi todo en lecturas al RPC. Deja en `--salida` estos archivos: `parametros.SINTETICO.json`, `despliegue-ensayo.json` (direcciones, bloques, SHA-256 de los parámetros, gas por transacción y órdenes de gobierno) y `ensayo-resultado.json`. Sale con código 0 sólo si todo cuadra.

La plantilla sin decidir devuelve `BLOCKED_DECISION` (código 9) con la lista de los 165 valores que faltan:

```
node scripts/desplegar-sfsp410.js --parametros ../deploy/sfsp410/parametros.plantilla.json
```
