# Revisión adversarial de SFSP-410 antes de producción (equipo D)

- Fecha: 2026-09-26 (UTC)
- Alcance: los 5 últimos commits de `claude/galaxy-web-review-260wt4`
  (`03e5731e..fc958241`): contratos (`SFSPIssuanceController`, `SFSPNativeVault`,
  `SFSPGovernanceController.authorizationActionOf`, `lib/ISFSP.sol`, pruebas 16–18),
  scripts de despliegue y ensayo, `deploy/sfsp410`, `migracion-410`, los adaptadores
  de Ordenex y Veta, SFSP-410 y ADR-015.
- Método: lectura completa del código del alcance con mirada de atacante y de
  auditor; pruebas antes y después; un despliegue SINTÉTICO completo del script en
  la red Hardhat en proceso. **Nada se desplegó, no se tocó ninguna red real, no se
  leyó ningún `.env`, no se hizo commit.**
- Criterio: se corrige lo que es claramente correcto y local (con prueba). Lo que
  cambia semántica o economía queda **Pendiente-decisión** para José / la Junta.

## 1. Resumen

| Severidad | Total | Corregidos | Pendiente-decisión | Aceptados / Info |
|---|---|---|---|---|
| Crítica | 1 | 1 | 0 | 0 |
| Alta | 4 | 3 | 1 | 0 |
| Media | 6 | 2 | 4 | 0 |
| Baja | 9 | 3 | 5 | 1 |
| Info | 6 | 0 | 2 | 4 |

**Bloqueante para encender `SFSP410_EMISION=1` en Veta: REV-410-01 (precio).**
Bloqueante operativo para los dos backends: REV-410-02 (altas de identidad).

## 2. Hallazgos

| ID | Sev. | Componente | Descripción | Evidencia | Estado |
|---|---|---|---|---|---|
| REV-410-01 | **Crítica** | Veta + Ordenex (economía) | **Dos precios de ORIGEN a la vez.** Veta entrega ORIGEN a 0,01 USD fijos; Ordenex compra y **vende** (paga USDT de la caja) al gramin de oro, ≈2,57–2,63 USD. Factor ≈ **257–263×**. Con el interruptor encendido la diferencia deja de ser un saldo interno y pasa a ser ORIGEN real en cadena, transferible: 100 USDT en Veta → 10.000 ORIGEN → vendidos en Ordenex ≈ 26.300 USDT. Pérdida por ORIGEN liberado desde Veta ≈ 2,62 USD; el techo por periodo es `min(perPeriod del cupo de la bóveda × 2,62 USD, USDT disponible en la caja de Ordenex)`. El propio `SFSP410.md` de Veta lo dice («hay que resolverlo antes de encender»), pero no hay ninguna guarda en código. | `infra/veta-wallet-backend/lib/origenPrice.js:51`; `infra/ordenex-api/lib/referencia.js:38`; `infra/ordenex-api/lib/venta.js:122`; `infra/veta-wallet-backend/controller/depositController.js` (`acreditarEnCadena`) | **Corregido** (26-sep, decisión de la dirección: 1 ORIGEN = gramo de oro / 55 en Veta y Ordenex; 0,01 USD es la comisión). `origenPrice.js` pasa a oro por omisión; `pruebas/probar-precio-comision.mjs`. |
| REV-410-02 | Alta | Veta / Ordenex (elegibilidad) | La bóveda evalúa la elegibilidad del destino (R3). Ningún usuario de Veta/Ordenex tiene hoy alta en `SFSPIdentityAdapter` (es nuevo): al encender, **todas** las entregas revierten con `ReleaseRejected` → Ordenex `en-revision`, Veta `revisar` (no se reintenta sola). En Veta la marca de agua ya avanzó: el usuario pagó y no recibe hasta que una persona actúe. | `SFSPNativeVault.sol:305`; `lib/sfsp410.js` (`ReleaseRejected → revisar`); `entregaOrigen.js` (`REINTENTABLES`) | Pendiente-decisión (prerrequisito: alta Genesis ID de todos los destinos antes de encender, o política `MINT` de ORIGEN sin propósito; y `reencolar` masivo documentado) |
| REV-410-03 | Media | Despliegue / backends | El script concede ISSUER a **una** dirección (`roles.emisor`) en emisión y bóveda, así que Ordenex y Veta tendrían que compartir la misma llave: dos apps con la llave (contra D27) y colisiones de nonce, porque la cola de `sfsp410.js` sólo serializa dentro de un proceso (y el nonce se lee `pending`). Con REV-410-06 una colisión ya no marca nada como entregado en falso (queda `en-duda`/`revisar`), pero sí genera trabajo manual. | `desplegar-sfsp410.js:618,621`; `lib/sfsp410.js:342,460` | Pendiente-decisión (una llave ISSUER por sistema en KMS; `roles.emisor` como lista) |
| REV-410-04 | Media | `SFSPIssuanceController.mint` | `mint()` no exigía que gobierno hubiera aprobado el digest **con la etiqueta MINT** (sí lo hacían `setMintBudget` y la bóveda). Un payload MINT propuesto como, p. ej., `SET_POLICY` (mismo quórum) se ejecutaba como emisión: los firmantes veían otra etiqueta en el registro. | `SFSPIssuanceController.sol:476-481` | **Corregido** (`authorizationActionOf == MINT`; prueba `test/19-revision-sfsp410.js`) |
| REV-410-05 | Baja | `SFSPNativeVault._pay` | La bóveda podía pagarse a sí misma: consumía cupo y `paymentRef`, `receive()` lo contaba como absorbido e inflaba `totalReleased`/`totalAbsorbed` sin que nadie recibiera nada. | `SFSPNativeVault.sol:306` | **Corregido** (prueba en `19-…`) |
| REV-410-06 | Alta | Ordenex `compra.js`, Veta `entregaOrigen.js`, `lib/sfsp410.js` | Las dos entregas llamaban `entregarOrigen` **sin esperar el minado**: 'entregada' significaba «enviada». Una tx que se mina revertida (el otro backend gastó el cupo en el mismo bloque, carrera de nonce) o que se cae del mempool dejaba la orden/depósito `entregada` sin ORIGEN entregado, y ese estado no se revisa nunca. | `compra.js:751`; `entregaOrigen.js:55-58`; `sfsp410.js:527` | **Corregido**: `{ esperar: true }` en ambos; en Veta una revertida vuelve a `pendiente`; en el adaptador, una revertida cuya referencia ya está gastada se lee del evento como `ya-entregado`. Pruebas: Ordenex 69/69, Veta 46/46 (la rama «revertida con referencia gastada» no tiene prueba propia: exige desactivar el automine). Coste: la petición de depósito de Veta espera un bloque. |
| REV-410-07 | Alta | Ordenex `compra.js` (idempotencia) | `paymentRef` se derivaba del `_id` de la **orden**. `OrdenCompra.depositoId` no tiene índice único y `atender` hace «buscar y luego crear» en dos pasos: dos procesos atendiendo el mismo depósito crean dos órdenes → dos `paymentRef` → la cadena ve dos pagos → **doble entrega**. El `DepositoExterno` sí es único (`{cadena, txHash, logIndex}`). | `compra.js:489,585,706`; `vigiaDepositosExternos.js:119` | **Corregido**: `SFSP410/v1\|ordenex\|deposito-usdt\|<depositoId>` (prueba «dos órdenes para el MISMO depósito no entregan dos veces»; `SFSP410.md` actualizado). Recomendado además: índice único parcial en `OrdenCompra.depositoId`. |
| REV-410-08 | Alta | Ordenex `compra.js` (rollback) | Orden en duda por SFSP-410 (la liberación pudo minarse) → una persona la reencola → alguien **apaga** el interruptor → el ciclo la entrega por la caliente, que no conoce `paymentRef`: **segunda entrega del mismo pago**. `SFSP410.md` lo advertía sólo en prosa. | `compra.js:639` | **Corregido**: apagado, una orden con motivo `SFSP410…` vuelve a `en-revision` con la comprobación `isOperationUsed(paymentRef)` en el motivo (prueba REV-410-08). |
| REV-410-09 | Media | `deploy/sfsp410/parametros.plantilla.json` (higiene) | `_pendientesDeClasificar` publicaba 3 direcciones completas con saldo, una de ellas tratada como **usuario** por el censo ONDK (66.150 ONDK). Contradice SFSP-410 §7 y el propio `nota` del archivo. | `parametros.plantilla.json:382-385` | **Corregido** en el árbol (truncadas como las demás); **Pendiente-decisión**: siguen en el historial de git (reescribirlo o aceptarlo). |
| REV-410-10 | Baja | `desplegar-sfsp410.js` (roles) | La validación permitía `techOps == emisor` (y la Junta como cualquiera de los dos): una sola llave caliente ejecutaría órdenes de cupo, marcaría cuentas y emitiría. | `desplegar-sfsp410.js:170` | **Corregido** (prueba en `19-…`) |
| REV-410-11 | Baja | `desplegar-sfsp410.js` (verificación) | El paso 8 no comprobaba que cada ejecutor tuviera TECH_OPS en gobierno (sin él `consumeAuthorization` revierte y ningún cupo/liberación funciona). | `desplegar-sfsp410.js:654` | **Corregido** (verificado con un despliegue sintético completo: 86 tx, 28 roles, 21 órdenes, desplegador sin roles) |
| REV-410-12 | Media | `SFSPMigrationRegistry` → `SFSPRegulatedAsset.mintForMigration` | R1 dice «ninguna emisión, **por ninguna ruta**, a una cuenta interna», pero la ruta de migración acuña directo en el activo sin pasar por `_mintTo`: no mira `isInternalAccount` ni los topes de stock/acumulado. Hoy lo evita sólo el constructor del padrón (fuera de cadena). | `SFSPRegulatedAsset.sol:277`; `SFSPMigrationRegistry.sol:335` | Pendiente-decisión (o enmendar R1, o que el registro consulte las cuentas internas, o migrar por la alternativa REV-410-17, que sí pasa por `_mintTo`) |
| REV-410-13 | Media | SFSP-410 §1 (definición) | Para tokens «circulante = `totalSupply()`», pero R1 sólo impide **acuñar** a cuentas internas; recibir por transferencia (comisiones, devoluciones, liquidaciones) no está impedido, así que `totalSupply` puede incluir saldos internos e I-82 deja de ser verdad en producción. ORIGEN sí resta las internas. | `spec/SFSP-410-SUPPLY-POLICY.md` §1, I-82 | Pendiente-decisión (circulante de tokens = `totalSupply − Σ saldos internos`, o prohibir recibir) |
| REV-410-14 | Media | Veta `swapController.fundCard` (recarga por bóveda) | Carrera previa: dos recargas simultáneas pasan el `findOne` de «en curso» y **las dos firman** el envío de ORIGEN antes de que `CardFunding.create` choque con el índice único; la segunda responde 409 con su ORIGEN ya enviado. Antes iba a la tesorería (reembolsable); ahora va a la **bóveda**, que no tiene retiro: devolverlo exige una orden `RELEASE_NATIVE` con quórum. | `swapController.js:257,320` | Pendiente-decisión (crear el `CardFunding` —reserva— antes de firmar) |
| REV-410-15 | Baja | `mintOnDemand` / `releaseOnDemand` | Aceptan `evidenceRoot = 0`; `release` lo rechaza. Los backends siempre mandan evidencia, pero el ensayo usa 0 en sus pruebas negativas, así que exigirla cambiaría esos resultados. | `SFSPIssuanceController.sol:372`; `SFSPNativeVault.sol:274`; `ensayo-fork-5550.js:364-368` | Pendiente-decisión |
| REV-410-16 | Baja | Cupos | Fijar un cupo nuevo en mitad de un periodo reinicia `usedInPeriod` a 0 (además del borde de periodo, ya aceptado). Requiere quórum + timelock, pero permite hasta 2× `perPeriod` en un periodo sin que lo diga el acta. | `SFSPIssuanceController.sol:351`; `SFSPNativeVault.sol:257` | Aceptado (documentar en el acta de cada cupo) |
| REV-410-17 | Info | Migración (alternativa del líder) | Evaluada: un `SET_MINT_BUDGET` por activo = `S0` del padrón, `termsDocRoot`/`evidenceRoot` = raíz del padrón, `paymentRef = keccak("MIGRACION\|<assetId>\|<dirección>")`. **Sólida** (aplica R1, R3, R8, R9; `paymentRef` actúa de nullifier en cadena, también entre rondas y contra la doble reclamación dirección/ranura). **Pierde** la verificación individual en cadena (la llave del emisor podría repartir distinto dentro de `S0`; se detecta pero no se impide), ocupa el único cupo del activo, un saldo = una operación, consume `cumulativeCap`, y no emite eventos SFSP-700. Procedimiento y mitigaciones escritos. | `migracion-410/LEEME.md` («Alternativa evaluada») | Pendiente-decisión (D26 + ADR que enmiende SFSP-700) |
| REV-410-18 | Baja | `SFSPNativeVault.circulating()` | Supone suministro nativo fijo. Vale hoy porque el `baseFee` de la 5550 es 0 y no hay recompensa de bloque; si cambia la configuración de consenso (quema EIP-1559 o recompensas), el circulante publicado deriva. Con gas > 0, las direcciones de cobro de comisiones (coinbase de validadores) de la organización tienen que estar entre las internas. | `SFSPNativeVault.sol:145` | Pendiente-decisión (declarar coinbases en D25; vigilar la configuración) |
| REV-410-19 | Baja | Cuentas internas | Hay dos listas independientes (emisión y bóveda); TECH_OPS puede marcar en una y no en la otra. El despliegue las carga igual en las dos y lo verifica, pero después pueden divergir. | `SFSPIssuanceController.sol:258`; `SFSPNativeVault.sol:169` | Pendiente-decisión (alarma del indexador ante divergencia) |
| REV-410-20 | Baja | Ordenex | Una orden que se queda en `entregando` porque el proceso murió no tiene camino de administración (`reintentarSfsp410` sólo toma `en-revision`/`en-duda`). Es seguro (no hay doble entrega), pero queda parada sin aviso. | `compra.js` (`reintentarSfsp410`) | Pendiente-decisión (barrido de `entregando` viejas → `en-duda`) |
| REV-410-21 | Baja | `migracion-410/lib/comun.mjs` | Ruta por defecto fija al scratchpad de una sesión concreta. No filtra datos, pero sin `SALIDA` escribe en una ruta que no existe en otra máquina. | `comun.mjs:23` | Pendiente-decisión (trivial: exigir `SALIDA`) |
| REV-410-22 | Info | Ordenex `guardaDeCupoSfsp410` | La guarda al abrir resta lo comprometido de Ordenex, pero no lo que consume Veta del mismo cupo: una orden puede nacer y acabar en la cola de gobierno. Documentado como «guarda, no reserva». | `compra.js` (`guardaDeCupoSfsp410`) | Aceptado |
| REV-410-23 | Info | `desplegar-sfsp410.js` | `DESPLIEGUE_AUTORIZADO` = SHA-256 del archivo de parámetros, que cualquiera con el archivo puede calcular: es un seguro contra errores, no un control de acceso. El control real es el firmante externo + Junta multifirma. | `desplegar-sfsp410.js:395` | Aceptado |
| REV-410-24 | Info | `ensayo-fork-5550.js` | Dos EOA de la organización escritas en el script (`0x3c27ce23…`, `0xef9885d2…`): cuentas internas, públicas en la cadena. No son de usuarios. | `ensayo-fork-5550.js:331,367` | Aceptado |
| REV-410-25 | Info | Fuera de alcance | `sfsp/respuestas/extraccion/datos/tenedores-5550.json` (commit anterior `d163f968`) versiona una lista de tenedores. No es de estos 5 commits, pero choca con la misma regla que REV-410-09. | — | Pendiente-decisión |
| REV-410-26 | Info | Comprobado sin hallazgo | Ver §3. | — | Aceptado |

## 3. Comprobado y correcto (sin hallazgo)

- **Reentrada en `_pay`**: `release` y `releaseOnDemand` son `nonReentrant`; efectos
  (cupo, `paymentRef`, `totalReleased`) antes de la llamada; reentrar por `receive()`/`absorb`
  sólo suma a lo absorbido. Un destino que revierte o gasta todo el gas sólo hace fallar su propia tx.
- **Separación de roles**: ISSUER no puede fijar cupos (exige TECH_OPS o Junta + orden
  aprobada); TECH_OPS no puede desmarcar cuentas internas (sólo la Junta); TECH_OPS humano no
  recibe TECH_OPS en gobierno.
- **Reuso de digests**: el digest compromete `chainId` y `verifyingContract` (`checkBinding`) y
  la acción del payload; emisión y bóveda usan acciones distintas (`SET_MINT_BUDGET` /
  `SET_RELEASE_BUDGET`). Todo ejecutor gasta en gobierno **y** en su propio registro en la
  misma tx, y exige `isAuthorizationApproved` (falso una vez gastado): no hay reuso entre contratos.
- **Espera**: los dos cupos exigen etiqueta, quórum, `proposedAt + timelock` y consumo único.
- **Aritmética**: 0.8.28 con comprobación; `used ≤ perPeriod` y `amount ≤ maxPerOperation ≤ perPeriod`.
  Un `perPeriod` cercano a 2²⁵⁶ sólo podría provocar un revert (DoS de gobierno), no un exceso.
- **Pausa**: bloquea `mint`, `mintOnDemand`, `release`, `releaseOnDemand` (y el activo); permite
  devolver. Fijar un cupo en pausa está permitido (no emite).
- **Gas**: `internalOutsideVault()` con 64 cuentas ≈ 170k de gas en una vista; no se usa en
  caminos que escriben.
- **`periodIndex`**: se fija al periodo en curso al fijar el cupo y se actualiza al emitir; `budgetRemaining` es coherente.
- **Refactor `_applyCaps`/`_executeMint`**: mismos topes, mismo orden, mismos efectos que antes.
- **Script de despliegue**: el desplegador acaba sin ningún rol (verificado con `hasRole` y en el
  despliegue sintético); todos los roles van a direcciones de parámetros; cuentas internas en los
  dos contratos; no lee, pide ni guarda llaves; una red que no es Hardhat local exige `--real`,
  `DESPLIEGUE_AUTORIZADO`, parámetros no sintéticos, chainId/genesisHash iguales, Junta con código
  y desplegador en las cuentas del firmante externo. El relé del ensayo sólo deja pasar lecturas.
- **Migración**: la hoja del constructor es `leafOf` byte a byte (prueba 18); los pares ordenados
  y el nodo impar igual que el contrato; se excluyen las internas de cualquier fuente; las 89
  claves sin dirección van a una raíz de reserva aparte y no entran en `S0`.
- **Secretos**: `SFSP410_ISSUER_KEY` sólo se nombra en los errores (probado); la URI de Mongo se
  recorta en el script de conciliación; la llave del usuario en `devolverOrigen` no se guarda ni
  se escribe.
- **Interruptor**: sólo `SFSP410_EMISION === "1"` enciende (probado con `'true'`).

## 4. Direcciones de 40 hex en el diff (higiene del repositorio público)

| Clase | Dónde | Veredicto |
|---|---|---|
| Cuentas y contratos deterministas de Hardhat (chainId 31337) | `panel-emision/config.json` (15) | OK, sintéticas |
| Sintéticas de prueba (`0x…a11ce`, `0x…b0b`, `0x…dead`, `0x…c0ffe`, `0x…01`) | `test/18-…`, pruebas de Veta | OK |
| Contrato USDT de Polygon | Veta | OK, público |
| Contratos viejos de los tokens (4) | `parametros.plantilla.json` | OK, contratos de la organización, públicos |
| Billetera ORIGEN de Ordenex `0xDE23…` | `ordenex-api/SFSP410.md` | OK, de la organización, ya en `lib/billeteras.js` |
| EOA internas de la organización (2) | `ensayo-fork-5550.js` | Aceptable (REV-410-24) |
| 3 direcciones «pendientes de clasificar» con saldo, una de usuario | `parametros.plantilla.json` | **Corregido en el árbol** (REV-410-09); siguen en el historial |

Los dos valores de 64 hex del diff son `bytes32` de texto (`SFSP:NATIVE:ORIGEN:DEMO`,
`SFSP:SEC:ISS1:S1`), no llaves. No hay llaves privadas, URIs con credenciales ni tokens de API
en el diff.

## 5. Pruebas

| Suite | Antes | Después |
|---|---|---|
| `sfsp/contracts` · `npx hardhat test` | 247 ✔, 0 ✘ | **254 ✔**, 0 ✘ (+7: `test/19-revision-sfsp410.js`) |
| `sfsp/indexer` · `npm test` | 67 ✔ | 67 ✔ |
| `sfsp/sdk` · `npm test` | 186 ✔ | 186 ✔ |
| Ordenex · `node pruebas/probar-sfsp410.mjs` | 65 ok | **69 ok** (REV-410-07 ×2, REV-410-08 ×2) |
| Veta · `node pruebas/probar-sfsp410.mjs` | 45 ok | **46 ok** (REV-410-06) |
| Despliegue sintético en Hardhat en proceso (`desplegar-sfsp410.js`) | — | OK: 86 tx, 28 roles verificados, 21 órdenes preparadas, desplegador sin roles |

## 6. Archivos tocados

- `sfsp/contracts/src/SFSPIssuanceController.sol` (REV-410-04), `sfsp/contracts/src/SFSPNativeVault.sol` (REV-410-05)
- `sfsp/contracts/test/19-revision-sfsp410.js` (nuevo)
- `sfsp/contracts/scripts/desplegar-sfsp410.js` (REV-410-10, REV-410-11)
- `sfsp/deploy/sfsp410/parametros.plantilla.json` (REV-410-09)
- `infra/ordenex-api/lib/compra.js`, `infra/ordenex-api/lib/sfsp410.js`, `infra/ordenex-api/SFSP410.md`, `infra/ordenex-api/pruebas/probar-sfsp410.mjs`
- `infra/veta-wallet-backend/lib/entregaOrigen.js`, `infra/veta-wallet-backend/lib/sfsp410.js` (idéntico al de Ordenex), `infra/veta-wallet-backend/SFSP410.md`, `infra/veta-wallet-backend/pruebas/probar-sfsp410.mjs`
- `sfsp/migracion-410/LEEME.md` (procedimiento de la alternativa, sin datos personales)

## 7. Qué queda para José / la Junta (en orden)

1. **REV-410-01**: un solo precio de ORIGEN en Veta y Ordenex antes de encender nada en Veta.
2. **REV-410-02**: altas de identidad de todos los destinos (o política `MINT` de ORIGEN) antes de encender.
3. **REV-410-03**: una llave ISSUER por sistema, en KMS (D27).
4. **REV-410-17 / REV-410-12**: decidir el camino de migración (registro SFSP-700 con R1 reforzado, o cupo por padrón con ADR).
5. **REV-410-13**: definición de circulante de tokens con cuentas internas que reciben por transferencia.
6. **REV-410-14**: reserva antes de firmar en la recarga de tarjeta.
7. **REV-410-09 / REV-410-25**: reescribir o no el historial con direcciones de tenedores.
8. El resto (Baja/Info) al hilo del despliegue.
