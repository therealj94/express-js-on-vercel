# Día D · encender SFSP-410 en la 5550

Procedimiento para pasar de "probado en copia de la cadena" a "funcionando en la
5550". Los 12 pasos técnicos, con quién firma cada uno, están en `ENSAYO.md` §3.
Este documento es la **lista de compuertas**: ningún paso que mueve fondos se
ejecuta si su compuerta no está en verde, y cada compuerta la cierra una persona
distinta de quien ejecuta.

## Compuerta 0 · Lo que ya está hecho (verde)

| Pieza | Evidencia |
|---|---|
| Contratos con la política (cupo, cuentas internas, bóveda, quema al devolver) | 254 pruebas en verde (`contracts/test/16`–`19`) |
| Despliegue parametrizado, bloqueado sin decisiones, desplegador sin roles al final | `contracts/scripts/desplegar-sfsp410.js` |
| Ensayo completo en copia de la 5550 (bloque 270.661) | `ENSAYO.md` |
| Padrón y árboles de migración (sólo usuarios) | `migracion-410/` (datos fuera del repo) |
| Ordenex y Veta entregan desde la bóveda, detrás de `SFSP410_EMISION` (apagado) | `infra/*/SFSP410.md` |
| Revisión adversaria: 26 hallazgos, 8 corregidos | `auditoria/REVISION-SFSP410-2026-09-26.md` |

## Compuerta 1 · Decisiones de la Junta (rojo)

- [ ] **D23** adoptar SFSP-410.
- [ ] **D07** firmantes (direcciones de billeteras de hardware), quórum, quórum de actualización, espera (timelock), pausa máxima.
- [ ] **D24** por activo: tope de stock, tope acumulado y cupo (por periodo, por operación, vigencia).
- [ ] **D25** acta: las 6 billeteras del 14-sep, las 9 del 11-sep y las demás de la lista propuesta son de Orden Global y se declaran internas. Resolver `0xd894…`, `0x9af6…`, `0x6bdc…`.
- [ ] **D26** migrar sólo usuarios; modo de migración (SFSP-700 por reclamo, o cupo único por activo con el padrón como evidencia: ver `migracion-410/LEEME.md` y REV-17).
- [ ] **D27** llaves: multifirma con billeteras de hardware; **una llave de emisor por sistema** en KMS (REV-03); nada en variables de entorno.
- [ ] **D07/D27** cuenta **DBNX** del controlador de emisión (`roles.dbnx` de los parámetros): registra el documento de aprobación de cada emisión por `mint()` (v0.3 §5). Distinta del emisor y de techOps; el script lo exige y el paso 8 lo verifica en cadena. Sin ella ninguna emisión por orden de gobierno se ejecuta.
- [x] **D01 · REV-01** precio único: 1 ORIGEN = gramo de oro / 55 en Veta y Ordenex (decidido por la dirección el 26-sep; falta el acta). **D02** comisión = 0,01 USD por transacción, cobrada en ORIGEN.
- [ ] SÍ/NO de las direcciones "En revisión" del padrón y confirmación del único usuario de HARV y del contrato correcto de IBS.

## Compuerta 2 · Datos completos (rojo)

- [ ] Acceso de sólo lectura a Veta, Ordenex y Genesis ID (variables en la configuración del entorno, nunca en el chat). 26-sep:
  - **Genesis ID**: no se leyó. Sacar sus credenciales de Render no está autorizado para el agente. Hace falta una variable de sólo lectura propia.
  - **Veta**: el proxy del entorno inyecta una credencial AWS en `vetawallet.com` y responde 502. Hay que corregir esa regla.
- [x] Resolver las posiciones sin dirección: **todas las claves resueltas y los 46 tokens con emisión cuadran exacto** (`migracion-410/censo-tokens-5550.mjs`, bloque 273.831, saldos de la 5550 a la fecha).
  - Los 804,5 ONDK y los 9.823,01 AUKA que faltaban eran saldos de la cadena intermedia (15 al 25-ago). Se ubicaron con el respaldo del reinicio del 25-ago.
- [x] Padrón de ONDK y lote de 1 ORIGEN **sin firmar**, armados fuera del repositorio y simulados en hardhat.
  - Lote: 94 envíos, 93,80 ORIGEN, máx. 1 ORIGEN por operación (bloque 273.831).
  - Ninguno es «firme»: falta la hoja de aceptación y D25.
- [ ] Conciliar los saldos de ORIGEN que Veta anota sólo en su base (`scripts/conciliar-origen-interno.js`).
- [x] Ubicar los 9.823,01 AUKA pendientes. 26-sep: ubicados en 3 direcciones con el respaldo del reinicio del 25-ago; AUKA cuadra exacto.

## Compuerta 3 · Identidad (rojo)

- [ ] Cada usuario del padrón dado de alta en el adaptador de identidad con su atestación de Genesis ID (REV-02). Sin esto, toda entrega revierte.

## Compuerta 4 · Ensayo con los parámetros reales (rojo)

- [ ] `parametros.json` real armado **fuera del repositorio**.
- [ ] Repetir `ensayo-fork-5550.js` con ese archivo; adjuntar el resultado al acta.
- [ ] La Junta emite `DESPLIEGUE_AUTORIZADO` = SHA-256 de ese archivo exacto.

## Compuerta 5 · Venta primaria = SUBSCRIBE (rojo)

v0.3 §6 y §7: la venta (ORIGEN en la puerta única, tokens bajo demanda,
colocación de reservas) se rechaza **por código** fuera del país, del alcance de
la oferta exenta o del límite de exposición. El código ya lo hace cumplir, pero
en el emisor y la bóveda la exigencia **nace apagada** para no romper la
integración actual (SFSP-410 R13). Con ella apagada, `mintOnDemand` y
`releaseOnDemand` venden SIN evaluar SUBSCRIBE.

- [ ] Motor: `setLicenseRegistry`, matriz de países (primera ola, §18), base de colocación de cada activo y política `SUBSCRIBE` fijadas. Sin eso toda venta responde `BLOCKED_DECISION` (correcto).
- [ ] Motor: `grantRole(SUBSCRIPTION_EXECUTOR, …)` al emisor, a la bóveda y al motor de reservas.
- [ ] **Encender** la compuerta ANTES de fijar cualquier cupo de venta: `SFSPIssuanceController.setSubscriptionGate(motor, motivo)` y `SFSPNativeVault.setSubscriptionRequired(true, motivo)` (Junta).
- [ ] Los cupos de migración (pasos 7 y 8) se aprueban con la acción `SET_MIGRATION_BUDGET` (misma función `setMintBudget` / `setReleaseBudget`); `migracion-410/lote-migracion.mjs` ya la genera. El lote de 1 ORIGEN del paso 7: decidir si es migración (`SET_MIGRATION_BUDGET` + `releaseOnDemand`) o colocación (`SET_RELEASE_BUDGET` + `releaseOnSubscription`, que evalúa SUBSCRIBE) — SFSP-120 §0.3 regla 2 lo trata como colocación si sale de tesorería hacia un tercero.
- [ ] **`SFSP410_EMISION` no se enciende para vender** (paso 9) mientras Ordenex y Veta llamen a `releaseOnDemand` / `mintOnDemand`: tienen que llamar a `releaseOnSubscription` / `mintOnSubscription` con el contexto de suscripción de Genesis ID (país + sal de residencia de la dirección y, en el Mercado de Crecimiento, la autorización de exposición). Con la compuerta encendida y el backend sin cambiar, cada entrega revierte `SubscriptionRequired` y la orden queda en revisión (falla cerrada, sin pérdida de fondos).
- [ ] Genesis ID: puente que da de alta RESIDENCIA (compromiso con sal por dirección) y, si un país pasa a BLOQUEADO, `JURISDICCION_BLOQUEADA` en **todas** las direcciones del residente (SFSP-120 §0.4, reglas 5 y 6). Agregador de exposición fuera de la cadena (`recordExposureClearance`).
- [ ] Pendiente fuera de este lote: `SFSPTreasuryDesk.sell` (la tesorería vende ORIGEN a un tercero) no evalúa SUBSCRIBE; no se usa en venta hasta cablearlo.

## Ejecución (orden, con su compuerta)

| # | Qué | Mueve fondos | Requiere |
|---|---|---|---|
| 1 | Desplegar contratos (desplegador con billetera de hardware) | sólo gas | C1–C4 |
| 2 | Verificación independiente de bytecode, roles y cuentas internas | no | revisor distinto |
| 3 | Proponer, aprobar y (tras la espera) ejecutar políticas y cupos | no | firmantes |
| 4 | Alta de identidad de usuarios | no | Genesis ID |
| 5 | **Sellar**: cada cuenta interna envía su ORIGEN a la bóveda (`absorb`), dejando sólo el colchón de gas de las llaves operativas | **sí** | orden expresa de José + D25 |
| 6 | Comprobar `circulating()` = usuarios; publicar en ORDENSCAN | no | — |
| 7 | Lote de 1 ORIGEN a cada tenedor de ONDK (desde la bóveda) | sí, dentro del cupo | orden expresa + C5 (tipo de cupo) |
| 8 | Migración de tokens a usuarios (cupo `SET_MIGRATION_BUDGET`); retirar los 10 tokens sin usuarios | sí | D26 + orden expresa |
| 9 | Encender `SFSP410_EMISION=1` primero en Ordenex; Veta sólo con precio único (REV-01) | sí, dentro del cupo | orden expresa + **C5 completa** (compuerta de suscripción encendida y backends en `*OnSubscription`) |

## Si algo sale mal

- **Cortar un cupo**: cualquier firmante, solo, al instante (`revokeMintBudget` / `revokeReleaseBudget`).
- **Pausa de emergencia**: un firmante; caduca sola; bloquea emitir y liberar, no devolver.
- **Apagar la integración**: `SFSP410_EMISION` a cualquier valor distinto de `1`. Las órdenes que ya pasaron por la bóveda van a revisión, no se repagan (REV-08). Ver `infra/*/SFSP410.md`.
- **Nunca**: reusar una llave expuesta, pegar credenciales en el chat, mover fondos sin la orden del paso.
