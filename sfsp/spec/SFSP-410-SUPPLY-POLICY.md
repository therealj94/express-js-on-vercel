# SFSP-410 · Política de suministro: el circulante es lo que tienen los usuarios

- Estado: **PROPUESTA** (pendiente de firma de la Junta, decisiones D23–D27)
- Fecha: 2026-09-26 (UTC)
- Enmienda a: SFSP-200, SFSP-300, SFSP-400, SFSP-800 · ADR-015
- Código: `contracts/src/SFSPIssuanceController.sol` (cupo y cuentas internas), `contracts/src/SFSPNativeVault.sol` (bóveda de ORIGEN)
- Pruebas: `contracts/test/16-politica-suministro.js` (21), `contracts/test/17-boveda-nativa.js` (10)
- Panel: `panel-emision/` (modo prueba)
- **Nota draft-0.5 (26-sep-2026):** el borrador SFSP v0.3 §9.4 **revierte §3.2** de esta política para AUKA y AGKA (ver §3.2 y la nota de reversión de `SFSP-300-COMMODITIES.md`). El v0.3 §4.3 trata además lo acuñado en billeteras internas como tesorería; cómo convive eso con R1 fuera de `COM` queda en D23. La migración por cupo del padrón se propone en ADR-016.

## 0. La regla

> **No existe suministro "por si acaso".** Una unidad existe en circulación sólo
> cuando está en manos de un usuario. Se crea (o se libera) cuando el usuario
> paga o entrega el respaldo, y se destruye (o se reabsorbe) cuando la devuelve.
> Nada se acuña hacia la tesorería, la operación o la liquidez de la organización.

Consecuencia directa sobre el pasaporte de cada activo (SFSP-100 v0.2, tres
cifras): **emitido = en circulación**. La diferencia entre las dos cifras deja de
existir, y con ella el inventario que había que vigilar.

## 1. Definiciones

| Término | Qué es |
|---|---|
| **Circulante** | Para un token SFSP: `totalSupply()`. Para ORIGEN: `génesis − bóveda − cuentas internas fuera de la bóveda` (`SFSPNativeVault.circulating()`). Se puede recalcular desde fuera con lecturas de saldo. |
| **Cuenta interna** | Toda dirección de la organización: tesorería, operación (Ordenex, Veta), liquidez, ejecutores, comisiones. Se declara en cadena (`setInternalAccount`). Marcarla lo puede hacer TECH_OPS o la Junta; **desmarcarla sólo la Junta**, porque amplía lo que se puede crear. |
| **Cupo** | Límite pre-aprobado por gobierno para emitir (o liberar) **bajo demanda**: por periodo, por operación y con vigencia. Se fija con doble control **y** espera, y el digest se gasta. |
| **Emisión bajo demanda** | Acuñar al usuario exactamente lo que pagó, dentro del cupo, ligado a la referencia del pago (`paymentRef`), que no se puede repetir. |
| **Bóveda sellada** | `SFSPNativeVault`: contrato sin dueño ni retiro de administrador donde vive todo el ORIGEN que no es de usuarios. Sus únicas salidas son `release` (orden de gobierno) y `releaseOnDemand` (cupo). |
| **Reabsorber** | Devolver ORIGEN a la bóveda (`absorb`). Es el equivalente de quemar para la moneda nativa. |

## 2. Reglas (normativas)

| # | Regla | Dónde se impone |
|---|---|---|
| R1 | Ninguna emisión, por ninguna ruta, tiene como destino una cuenta interna. | `SFSPIssuanceController._mintTo` (`MintToInternalAccount`) |
| R2 | Ninguna liberación de la bóveda tiene como destino una cuenta interna. | `SFSPNativeVault._pay` (`ReleaseToInternalAccount`) |
| R3 | El destino de toda emisión o liberación tiene que ser elegible para el activo (usuario verificado). | `SFSPRegulatedAsset.mintFromIssuance`, `SFSPNativeVault._pay` (motor de elegibilidad) |
| R4 | Emitir fuera de cupo exige la orden de gobierno ligada al contenido de SFSP-800 §12 (doble control, consumo único). | `SFSPIssuanceController.mint` |
| R5 | Fijar un cupo exige la acción `SET_MINT_BUDGET` / `SET_RELEASE_BUDGET`, quórum, **espera del timelock contada desde la propuesta** y consumo único. Los términos (periodo, vigencia, acta) van comprometidos en el digest. | `setMintBudget`, `setReleaseBudget` |
| R6 | Cortar un cupo lo puede hacer **un solo** firmante, TECH_OPS o la Junta, al instante. Reducir poder no necesita quórum. | `revokeMintBudget`, `revokeReleaseBudget` |
| R7 | Un mismo pago no emite dos veces: `paymentRef` es el identificador de operación y se consume. | `mintOnDemand`, `releaseOnDemand` (`OperationReplay`) |
| R8 | El cupo nunca salta los topes del instrumento (stock y acumulado de SFSP-200 §4). | `_applyInstrumentCaps` |
| R9 | Con gobierno en pausa no se emite ni se libera. Devolver (quemar, reabsorber) sigue permitido. | `mintOnDemand`, `release*` |
| R10 | La quema de lo que un usuario devuelve exige su consentimiento sobre el digest exacto (activo, titular, monto, motivo) o una orden de gobierno. | `SFSPRegulatedAsset.burn` (ya existente, H02) |
| R11 | La bóveda no tiene retiro de administrador, dueño ni actualización. | `SFSPNativeVault` (prueba estructural en `17-boveda-nativa.js`) |
| R12 | Ningún valor económico (cupos, topes, periodos, quórums) está escrito en el código. Sin valor fijado, la capacidad devuelve `BLOCKED_DECISION`. | todos los contratos (I-59) |

## 3. Tokens SFSP (AUKA, AGKA, ONDK y los que vengan)

### 3.1 Flujos

```
COMPRA      usuario paga (USDT / tarjeta / oro entregado)
            → el sistema confirma el pago y calcula el monto
            → mintOnDemand(asset, usuario, monto, hash(recibo), evidencia)   [dentro del cupo]
            → MintExecuted + MintOnDemand; circulante sube exactamente el monto

FUERA DE    propuesta en el panel → aprueban los firmantes → mint(...)        [sin cupo]
CUPO

VENTA /     usuario firma approveBurnAuthorization(digest) sobre lo que devuelve
REDENCIÓN   → el emisor ejecuta burn(...)
            → BurnExecuted; circulante baja exactamente el monto
            → se paga al usuario (USDT o metal) por el camino del producto
```

### 3.2 Commodities (AUKA, AGKA) — REVERTIDO por el v0.3

> **Revertido (draft-0.5).** El borrador SFSP v0.3 §9.1 y §9.4 dice lo contrario de este apartado y manda: AUKA y AGKA **pueden acuñarse por anticipado y quedar en tesorería**; lo que exige onzas verificadas, asignadas y no comprometidas es la **colocación** (SFSP-300 §0.2). Para la clase `COM`, R1 no impide acuñar a la tesorería registrada; siguen rigiendo el cupo, la pausa y el consentimiento en la quema. El texto de abajo se conserva como histórico (C8 del plan v0.3).

Se **anula el §0.2 del borrador v0.2** ("acuñar antes, colocar sólo con metal") y
se restablece SFSP-300 §2.1 #6: **no hay un suministro acuñado por adelantado**.
Un token de commodity se acuña sólo cuando hay un lote `ATTESTED` libre que lo
cubre, y el invariante de SFSP-300 §2.3 se mantiene
(`onzas asignadas no entregadas ≥ tokens respaldados en circulación + obligaciones pendientes`).
El cupo de un commodity nunca puede superar las onzas libres atestadas; hasta que
exista el motor de reservas (`SFSPCommodityEngine`, pendiente), la emisión de
commodities se hace **sólo por orden de gobierno**, sin cupo.

### 3.3 Valores (SFSP-200)

La colocación 51/49 con retención del 49 % por el emisor (SFSP-200 §2) se
reinterpreta: el 49 % es **supply autorizado, no acuñado**. Se acuña cuando se
coloca, al inversor, y nunca al emisor. `SupplyExpansionDeclared` sigue siendo
previo a cualquier ampliación del supply autorizado.

### 3.4 Topes: por qué el acumulado no se recupera al quemar

`cumulativeCap` (SFSP-200 §4, T-200-04) mide todo lo emitido en la vida del
instrumento, y quemar no lo reduce. Con emisión y quema continuas, **el tope que
gobierna el día a día es el de stock** (`outstandingLimit` = máximo en manos de
usuarios), y el acumulado se fija como techo de vida del instrumento, revisable
por la Junta. Es una decisión consciente (D24), no un olvido.

## 4. ORIGEN (moneda nativa)

ORIGEN nace en el génesis de la cadena 5550 (1.000.000.000.000 unidades) y
ningún contrato puede acuñarlo ni quemarlo (ADR-006). SFSP-410 adopta para ORIGEN
la alternativa **(b) de D03: control de distribución por bóveda**:

| Operación | Cómo |
|---|---|
| Emitir | `releaseOnDemand` dentro del cupo, o `release` con orden de gobierno, siempre a un usuario elegible. |
| Quemar | El usuario (o la operación) devuelve con `absorb`. |
| Circulante | `circulating()` = génesis − bóveda − cuentas internas declaradas fuera de la bóveda. |
| Ordenex / Veta | La billetera de entregas deja de tener inventario propio: cada entrega es un `releaseOnDemand` con la referencia del pago. Mientras dure la transición, cualquier saldo operativo es una **cuenta interna declarada** y cuenta fuera del circulante. |

Lo que esto **no** es: no es respaldo (D03-a), no cambia el suministro del
génesis y no es un envoltorio ERC-20 (rechazado en ADR-006). Se comunica como
"ORIGEN no emitido, sellado en una bóveda pública", nunca como "quemado".

## 5. Gobierno (qué acción, quién)

| Acción | Etiqueta en gobierno | Propone | Aprueba | Espera | Ejecuta |
|---|---|---|---|---|---|
| Fijar cupo de emisión | `SET_MINT_BUDGET` | Tecnología (AU-RA FP) | Firmantes de la Junta/DBNX, quórum D07 | timelock | TECH_OPS / Junta |
| Emitir fuera de cupo | `MINT` | Tecnología | quórum D07 | — | ISSUER |
| Quemar por gobierno | `BURN` | Tecnología | quórum D07 | — | ISSUER |
| Fijar cupo de liberación nativa | `SET_RELEASE_BUDGET` | Tecnología | quórum D07 | timelock | TECH_OPS / Junta |
| Liberar de la bóveda fuera de cupo | `RELEASE_NATIVE` | Tecnología | quórum D07 | — | ISSUER |
| Cortar un cupo | — | cualquier firmante, TECH_OPS o Junta, solo | — | — | quien lo corta |
| Marcar cuenta interna | — | TECH_OPS o Junta | — | — | — |
| Desmarcar cuenta interna | — | Junta | — | — | — |

AU-RA FP ejecuta y nunca aprueba (ADR-014). El ISSUER que ejecuta
`mintOnDemand` es una llave de servicio **sin poder de aprobación**: lo más que
puede hacer si se compromete es agotar el cupo vigente hacia usuarios elegibles,
y un solo firmante puede cortarlo.

## 6. Invariantes nuevas

| # | Qué afirma | Prueba |
|---|---|---|
| I-79 | Ninguna emisión llega a una cuenta interna, ni por orden de gobierno ni por cupo. | `16-politica-suministro.js` |
| I-80 | Un cupo sólo se fija con su acción, quórum, espera y consumo único; cambiar un término tras aprobar invalida la aprobación. | `16-politica-suministro.js` |
| I-81 | Dentro del cupo: máximo por operación, máximo por periodo, un pago no emite dos veces, y los topes del instrumento siguen mandando. | `16-politica-suministro.js` |
| I-82 | Tras emitir bajo demanda y quemar al devolver, `totalSupply` = suma de saldos de usuarios. | `16-politica-suministro.js` |
| I-83 | La bóveda nativa sólo paga por `release` (quórum) o `releaseOnDemand` (cupo), nunca a una cuenta interna ni a un destino no elegible, y no tiene retiro de administrador. | `17-boveda-nativa.js` |
| I-84 | `circulating()` = génesis − bóveda − cuentas internas fuera de la bóveda. | `17-boveda-nativa.js` |

## 7. Transición desde el estado actual (sin mover fondos hasta decisión)

| Paso | Qué | Mueve fondos | Estado |
|---|---|---|---|
| 0 | Confirmar quién controla las 6 direcciones que recibieron el ORIGEN de las billeteras madre el 14-sep y las 9 de ONDK del 11-sep. | No | **Bloqueante**, pregunta a la dirección |
| 1 | Foto y clasificación de tenedores (usuario / interna / contrato / desconocido). | No | **Hecho** (lectura en vivo, bloque 270.224, 26-sep): los usuarios tienen 347,76 ORIGEN en 140 billeteras; más del 99,8 % de cada activo está en direcciones grandes sin documentar. La foto se entrega aparte: no vive en este repositorio público. |
| 2 | Conciliar los saldos de ORIGEN que la billetera guarda en su base de datos y que no existen en cadena (depósitos USDT). | No | Pendiente de acceso a la base |
| 3 | Desplegar tokens SFSP en red de prueba; migrar (SFSP-700) **sólo saldos de usuarios**; el inventario interno no se migra; contratos viejos retirados. | En 5550, sí → requiere D26 | Contratos y pruebas listos |
| 4 | Desplegar la bóveda; consolidar en ella todo el ORIGEN interno; declarar las cuentas internas. | Sí → requiere D23 y D25 | Contrato y pruebas listos |
| 5 | Panel con billeteras de hardware y multifirma; Ordenex llama a `mintOnDemand`/`releaseOnDemand`; llaves fuera de Heroku (KMS). | No (hasta el primer cupo) | Panel en modo prueba |
| 6 | Primer cupo por activo, con acta de la Junta. | Sí → requiere D24 | — |

## 8. Decisiones que abre (ver `DECISIONES-SFSP.json`)

D23 adoptar SFSP-410 · D24 cupos y topes por activo · D25 cuentas internas y
control de las direcciones del 14-sep · D26 migración de los tokens actuales sólo
con saldos de usuarios · D27 reemplazo de las llaves operativas en variables de
entorno por multifirma y KMS. D03 queda con la alternativa (b) como posición de
SFSP-410; D07 (quórums) sigue bloqueando cualquier ejecución real.
