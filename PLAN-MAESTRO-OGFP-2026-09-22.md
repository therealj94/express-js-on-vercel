# PLAN MAESTRO · Orden Global 2026-09-22

### Un solo plan para mejorar todo el sistema, implementar OGFP y migrar sin que nadie pierda nada

**Quién planifica:** Fable. **Quién ejecuta:** Opus, por partes, en el orden de este documento.
**Quién aprueba:** José. Nada de este plan se ejecuta hasta que él lo revise.

Fuentes integradas: la revisión independiente del ecosistema (21-sep-2026), la especificación OGFP v1.0 (axiomas, familias, pasaporte de activo, R1–R5, gobierno dual), el borrador OGFP v0.1 (implementación sobre Besu QBFT, roadmap por compuertas), y todo lo verificado en el repositorio y en producción durante estas sesiones.

---

## 0 · Cómo usar este documento

Este plan está dividido en **12 partes (P0–P11)**. Cada parte tiene: objetivo, qué se toca, pasos, pruebas, evidencia de cierre y lo que NO se hace. Opus recibe **una parte por sesión** con el prompt plantilla del Anexo A. No se empieza una parte sin cerrar las evidencias de la anterior, salvo donde el plan diga que son paralelas.

Hay **cuatro olas** de tiempo (sección 4). Solo la Ola 1 sube mañana a producción. OGFP entero no sube mañana: sube a testnet. Prometer otra cosa sería repetir el error que la auditoría señala (anunciar "todo conectado" sin evidencia).

### Reglas que Opus no puede romper en ninguna parte

1. **Producción = repositorio.** Nunca desplegar desde un clon desfasado (incidente del 12-ago y del 21-sep). Antes de subir: `apps-web/comparar-publicado.py` para la web y `git fetch heroku` + diff para el backend. Punto de vuelta atrás web: commit `a63bb194`.
2. **Ningún secreto en el repo ni en el chat.** Credenciales en `~/.aws/credentials`, Heroku config vars, Render env o AWS Parameter Store. Si aparece un secreto en un archivo, se rota; borrarlo del último commit no lo revoca.
3. **Nada que toque fondos se ejecuta sin simulacro.** Todo script sobre saldos, llaves o contratos arranca en modo lectura y solo escribe con una variable explícita (`MIGRAR=si`), con respaldo previo y relectura posterior. Es el patrón que ya funcionó en `infra/veta-wallet-migracion/`.
4. **Ningún test destructivo contra una base que no sea desechable.** Barrera técnica, no comentario (hallazgo H02 de la auditoría).
5. **Cada parte termina con evidencia**, no con "listo": salida de pruebas, capturas Playwright, SHA desplegado, respuesta de los agentes `cirujano-despliegue` / `cerrajero-seguridad` / `vigia-cadena` cuando aplique.
6. **No se anuncia como disponible lo que no está**: MINAS, DBNX, GoldexSwap, mercados sin volumen. Estados reales: `disponible / beta / interno / futuro`.
7. **Las decisiones de dinero, precio, derechos y legal son de José y de la Junta**, no de Opus. Donde el plan dice "DECISIÓN", Opus deja el parámetro configurable y documenta la opción; no lo fija.

---

## 1 · Punto de partida (hechos verificados, no supuestos)

| Pieza | Estado real hoy |
|---|---|
| Cadena **5550** (Besu QBFT, 7 validadores declarados) | Viva. Bloque ~230 k, ~10 s por bloque. RPC `rpc.ordenglobal-rpc.com`. |
| Cadena 8532 (polygon-edge) | Congelada desde 15-ago, copia idéntica de la emisión. Nadie la lee. |
| Testnet **5534** | Existe en los nodos 3–6 (mismo hardware que la 5550). |
| **ORIGEN** | Moneda **nativa** de la 5550 (gas y valor). Precio = PAXG/oz ÷ 31,1035 ÷ 55. |
| **14 tokens ERC-20 en la 5550** | ONDK (555 000 000, 138 tenedores), AUKA (55 000 000, 39), AGKA, MNKA, IBS, HARV, AUBEX, ASL, LOVE, REST, SOL, AGRO, AIT, POLITICAL. La suma de saldos cuadra con la emisión (`infra/migracion-cadena/invariante-emision.py`, 10-ago). |
| **Veta Wallet** | Frontend en AWS Amplify `d264zjawew1yea` (S3+CloudFront). Backend Node en Heroku `vetawallet` + MongoDB. **Custodial:** llave privada y semilla de cada usuario cifradas en Mongo (`lib/cripto.js`, 403 cuentas); el servidor firma. Comisión actual fija: 0,01 ORIGEN por envío. |
| Producción web hoy | Galaxy v2 + auditoría desplegados. Arreglo de login móvil (`c2077bf2`) **NO está en vivo**: AWS bloquea por facturación. `index.html` sin `<!DOCTYPE>` (quirks mode) pendiente. |
| **Genesis ID** | Dos implementaciones. La canónica de facto: `genesis-id/` (TS/Express/Mongo en Render `genesis-id.onrender.com`). `Ordenglobalfinale` (Next/Postgres) sin autoridad demostrada. |
| **ORDENSCAN** | `ogscan-frontend/` + `ogscan-backend/` (Amplify + Heroku `orden-global-scan`). Vivo. |
| **Ordenex** | `apps-web/ordenex/` + `infra/ordenex-api/` (Heroku). 14 mercados, volumen cero histórico. Sirve `/precio-declarado/ONDK`. |
| **MyTokenPay** | Web + móvil + `infra/mytokenpay-api/`. Móvil con `USE_MOCK_API=true`. Comercios de muestra. **Credencial administrativa en `ENTREGA.md` (P0).** |
| **AuCorp** | `aucorp/` + `infra/aucorp-api/`. Ledger propio con límites de conciliación. |
| Venta de ORIGEN | `infra/contratos-venta/VentaOrigen.sol` en Polygon/BSC cobra USDT; `vigiaCompras.js` paga ORIGEN en la 5550. Tesorería Polygon con USDT para fondeo de tarjeta (CryptoMate). |
| **PULSE2CHAT** | `chat.js`/`candado.js` + relay `infra/mensajes/`. Degrada a texto claro si `sin-aparatos` (H04). |
| ULTRON / Dr Electrum / AU-RA / Cerebro | Varias superficies; tests de Electrum con limpieza destructiva (H02). |
| Ramas | `main` (581 entradas) está **muy por detrás** de `claude/galaxy-web-review-260wt4` (2 312). La rama de trabajo es la verdad real; `main` no. |

**Conclusión de partida:** hay base real. Lo que falta no son piezas, es una sola verdad (qué versión corre dónde), barreras de seguridad, y un protocolo de activos que unifique wallet, mercado, identidad y explorador. Eso es OGFP.

---

## 2 · Decisiones de arquitectura (recomendaciones de Fable)

### 2.1 OGFP se implementa a nivel de aplicación, sin tocar el consenso de Besu
Aceptado del borrador v0.1. Besu sigue siendo la EVM. OGFP = contratos + registros + motores + APIs + políticas. Un fork del cliente solo se considera después de OGFP v1.0 estable y con necesidad demostrada.

### 2.2 Migración: **registrar, no mover** (la clave para que nadie pierda nada)
Los 14 tokens y el ORIGEN nativo **no se reemplazan**. Se registran en el `OGFPAssetRegistry` como activos con `legacyContract = dirección actual`, ratio 1:1, y el pasaporte de activo se les cuelga encima. Consecuencias:

- **Cero movimiento de fondos en la migración base.** Los saldos de ONDK, AUKA y el resto siguen en los mismos contratos, en las mismas direcciones. No hay snapshot que pueda fallar, no hay claim que alguien pierda.
- **La wallet cambia de fuente de verdad, no de saldos:** `lib/saldos.js` deja de tener la lista de contratos escrita a mano y la lee del registro. El usuario ve exactamente lo mismo.
- **Solo si un activo necesita un contrato nuevo** (por ejemplo ONDK con restricciones de transferencia OGFP-SEC) se hace la migración completa de la sección 15 del borrador: snapshot + Merkle + lock + claim + reconciliación. Y ahí la ventaja decisiva es que **la wallet es custodial**: el backend ejecuta el claim por cada usuario, verifica saldo antes = saldo después, y la persona no firma ni ve nada. Los tenedores externos (MetaMask) reciben una página de claim **sin fecha de vencimiento**.

### 2.3 Repositorios: uno nuevo para lo nuevo, rama + staging para lo existente
José preguntó por un repo nuevo para probar y luego fusionar. Recomendación:

| Qué | Dónde | Por qué |
|---|---|---|
| **OGFP Core** (contratos, SDK TypeScript, indexer, esquemas de eventos, DBNX API) | **Repo nuevo `therealj94/ogfp`** | Es código nuevo, con su propio CI, sus propias pruebas (Hardhat/Foundry), sus propios despliegues a la 5534. No arrastra 2 312 archivos ni la historia del monorepo. |
| Productos existentes (wallet, backend, Genesis, ogscan, ordenex, galaxy) | **Monorepo, rama `claude/ogfp-integracion`** creada desde `claude/galaxy-web-review-260wt4` | Copiar el monorepo entero a otro repo crea exactamente el problema que la auditoría señala: dos verdades. Una rama + entornos de staging da el aislamiento sin duplicar. |
| Staging | Amplify branch `staging` (ya existe), Heroku app `vetawallet-staging` (crear), Mongo staging con copia **anonimizada**, Render `genesis-id-staging`, Besu 5534 | Probar de punta a punta antes de producción. |
| Fusión | PR de `claude/ogfp-integracion` → `claude/galaxy-web-review-260wt4` → **`main`** | En P1 se pone `main` al día: hoy `main` no es la verdad y eso hay que cerrarlo. |

**No recomiendo** un "repo nuevo de prueba" que sea una copia del monorepo. Recomiendo repo nuevo para OGFP y rama+staging para el resto.

### 2.4 Genesis ID canónico = `genesis-id/` del monorepo
Ya tiene la regla "ninguna identidad se verifica sola", operadores con permisos, tamizado y bitácora. `Ordenglobalfinale` se archiva (solo lectura, con nota). Todo cliente (wallet, MyTokenPay, ogscan, DBNX) consume ese único Genesis.

### 2.5 Renombres (Orden Ledger, Orden Markets)
Adoptar los nombres **en el código y la documentación interna desde ya** (`orden-ledger`, `orden-markets`), pero **no cambiar los nombres visibles al público** hasta que el producto renombrado tenga algo distinto que mostrar (compuerta G7). Renombrar un explorador que sigue mostrando lo mismo confunde y no aporta.

### 2.6 Comisión USD 0,01
Hoy la comisión es 0,01 **ORIGEN** (≈ USD 2). El objetivo OGFP es USD 0,01 desacoplado del gas. Se implementa en el `OGFPFeeController` (P6) con oráculo ORIGEN/USD y relayer. **DECISIÓN de José:** fecha de cambio y si hay periodo de comisión cero de lanzamiento.

### 2.7 Privacidad
Besu 25.6.0 eliminó Tessera. No se diseña nada sobre transacciones privadas heredadas. Etapa P0–P1 del borrador: nada de PII on-chain; commitments y receipts públicos; payload cifrado en dominio privado. ZK se evalúa en G4, no antes.

---

## 3 · Las partes

Convención: **[OLA n]** indica cuándo. **Paralelo con** indica qué puede correr al mismo tiempo en otra sesión de Opus.

---

### P0 · Contención y base segura — [OLA 1, hoy]

**Objetivo:** cerrar los P0/P1 de la auditoría y lo pendiente de estas sesiones antes de construir nada encima.

**Toca:** `infra/mytokenpay-api/ENTREGA.md`, `ULTRON-APP/tests/electrum-db.test.ts`, `apps-web/veta-wallet/index.html`, `apps-web/veta-wallet/chat.js`, `mytokenpay-app/mobile/src/lib/api.ts`, `.github/` (secret scanning), `POR-HACER.md`.

**Pasos:**
1. **H01 credencial en ENTREGA.md.** Confirmar con José que la credencial está revocada (él la rota; Opus no la usa ni la imprime). Reescribir el documento sin el valor. Correr `cerrajero-seguridad` sobre el monorepo y sobre `ULTRON-APP`; adjuntar su parte. Activar `gitleaks` como workflow en ambos repos.
2. **Credenciales conocidas como comprometidas** (`POR-HACER.md` §4): AWS `AKIAX7LQENZ7I2QBPL6D` (desactivar), Zernio, cPanel, buzón `info@`. Lista para José; Opus verifica después con `aws iam list-access-keys` que la vieja esté inactiva.
3. **H02 pruebas destructivas de Electrum.** Barrera técnica en el arranque del test: aborta salvo que `DATABASE_URL` contenga `_test` o `ELECTRUM_TEST_DB=si`, y aborta siempre si el host coincide con producción. Prueba negativa que demuestre que rechaza una URL ajena.
4. **H03 MyTokenPay móvil.** `USE_MOCK_API` pasa a leerse del entorno (`EXPO_PUBLIC_MTP_MOCK`), por defecto `false` en perfil `production` de `eas.json`. README actualizado. Identificar qué APK está distribuido (José).
5. **H04 PULSE2CHAT.** Sin dispositivos o sin CANDADO: **no enviar**. Mostrar decisión explícita ("Este contacto no tiene dispositivo cifrado. ¿Enviar sin cifrar?") y marcar el mensaje. Texto público de la web alineado con ese comportamiento.
6. **Login móvil.** Cuando AWS desbloquee: subir `c2077bf2`, verificar en 375×667 y 360×640 con Playwright, confirmar sello `VETA_V`. Después, en la misma parte: agregar `<!DOCTYPE html>` a `index.html` y hacer QA **con sesión real en staging** (billetera, enviar, cobrar, chat, galaxia, ajustes, móvil y escritorio, capturas antes/después). Solo se sube si nada cambia visualmente salvo lo previsto.
7. **AWS facturación.** José. Mientras: retry programado ya existe; Opus no crea otro.

**Pruebas:** parte de `cerrajero-seguridad` limpio; test negativo de H02 en verde; build de MyTokenPay con mock apagado; Playwright de chat mostrando el bloqueo; capturas móviles de login.

**Cierre:** tabla de hallazgos H01–H04 con "cerrado + evidencia". Commit en la rama de trabajo. Despliegue web de Ola 1 (ver P11).

**No hacer:** no tocar Genesis, ni contratos, ni la lista de tokens. No usar ninguna credencial encontrada.

---

### P1 · Una sola verdad: manifiesto, ramas y catálogo — [OLA 1] · paralelo con P0

**Objetivo:** que cualquiera pueda saber qué repositorio, rama, SHA y artefacto corre en cada dominio (H05, H08, H11).

**Toca:** nuevo `MANIFIESTO-SERVICIOS.md` (raíz), `apps-web/augalaxy/src/experience/catalog.ts`, `sitio-ordenglobal/`, `main`.

**Pasos:**
1. **Manifiesto por servicio** con estos campos exactos: owner, repo, branch, commit SHA, artefacto, entorno, dominio, proveedor, base de datos, fuente de secretos, dependencias, respaldo, SLO, alerta, rollback. Servicios: Veta web, Veta backend, Genesis ID, ORDENSCAN front/back, Ordenex front/API, MyTokenPay web/API/móvil, AuCorp, ULTRON interno, ULTRON-APP, AU-RA, Cerebro, relay de mensajes, nodos 5550 (por nodo), testnet 5534, RPC público, sitio corporativo.
2. **Verificar SHA desplegado** de cada uno: `comparar-publicado.py` (web), `git fetch heroku` + `heroku releases` (Heroku), `version.json` (backend Veta, hoy dice `af3bef7` y no coincide: corregir la procedencia), footer de ORDENSCAN (`vbee6945b1c`). Donde no se pueda demostrar, escribir "NO VERIFICADO" en el manifiesto; no inventar.
3. **`main` al día.** PR `claude/galaxy-web-review-260wt4 → main` con squash o merge (decisión de José: recomiendo merge sin squash para conservar historia). Desde entonces `main` = producción. Borrar o archivar las 25 ramas `claude/*` muertas (listar; José decide cuáles).
4. **Catálogo con estados reales.** En `catalog.ts` cada mundo lleva `estado: 'disponible'|'beta'|'interno'|'futuro'`. MINAS y DBNX = `futuro`; Ordenex = `beta`; MyTokenPay = `beta`. La galaxia lo muestra en el rótulo y en la tarjeta; un mundo `futuro` no abre app, explica qué es. El sitio corporativo usa la misma taxonomía (una sola lista de productos, sin "seis puertas / siete productos / once mundos").
5. **Respaldo de datos ensayado (H08).** Restaurar un dump de Mongo del backend Veta en una base desechable, medir tiempo, documentar en `RESPALDO.md` con fecha. Sin datos reales fuera del entorno aislado.

**Cierre:** manifiesto completo; `main` = rama de trabajo; catálogo con estados; ensayo de restauración con tiempos.

---

### P2 · Galaxy OS y la entrada de Veta: de espectáculo a sistema — [OLA 1] · paralelo con P0/P1

**Objetivo:** cerrar la sección 9 y 8 de la auditoría (y lo que quedó de la mía): cada planeta resuelve a un destino real, conserva contexto, se puede volver, funciona con teclado, tacto y lector.

**Toca:** `apps-web/augalaxy/src/experience/*` (Universe, Experience, navigation, hostBridge, catalog), `apps-web/veta-wallet/app.js`, `index.html`, `i18n.js`.

**Pasos:**
1. **Rótulos:** tamaño mínimo estable, sin rebote, sin colisiones (ya hay `.label`; agregar separación por prioridad de foco).
2. **Selección en dos pasos:** primer toque = selecciona + tarjeta (nombre, estado, qué hace); segundo toque o botón "Abrir" = `__AE_ABRIR`. El planeta no cubre controles ni se mueve entre los dos toques (congelar órbita mientras hay selección).
3. **Volver:** al cerrar una app, la galaxia vuelve al mismo encuadre (guardar `yaw/pitch/distancia/selected` en `sessionStorage`).
4. **Lista equivalente:** botón "Lista" que muestra los mundos como lista accesible (`role="list"`, foco visible, Enter abre). Esto es la alternativa para lector de pantalla y para WebGL caído.
5. **Pro/Lite:** detección de capacidad + preferencia persistente + cambio sin perder contexto + recuperación de `webglcontextlost`.
6. **Movimiento reducido y audio:** ya hay `motionReduced()`; exponer el interruptor en la primera pantalla; audio siempre apagado hasta acción explícita.
7. **Idioma:** revisar `i18n.js` con inglés activo: ejemplo de correo, `aria-label`, textos de la galaxia. Prueba Playwright que recorre la entrada en `en` y falla si encuentra cadenas en español de una lista conocida.
8. **Móvil:** safe areas (`env(safe-area-inset-*)`), la escena cede espacio al formulario (ya está, verificar tras el DOCTYPE).
9. **app.js (0,87 MB):** medir primero (Lighthouse en móvil emulado, sin y con caché). Solo si el TTI en 4G supera 5 s, partir en módulos por pantalla con `import()` dinámico. No modularizar "porque sí".
10. **Panel de estado del ecosistema** dentro de la galaxia (mundo "Ajustes" o botón): lee el manifiesto y `/salud` de cada API; muestra `disponible / degradado / caído`. Base para P10.

**Pruebas:** Playwright: seleccionar → abrir → volver en cada mundo disponible; teclado solo; `prefers-reduced-motion`; contexto WebGL perdido; 375×667 y 1280×800. Lighthouse antes/después.

**Cierre:** recorridos grabados (capturas) + tabla de criterios de la sección 19 de la auditoría marcados.

---

### P3 · OGFP v0.2: especificación ejecutable (OGFP-100/110/120/800) — [OLA 2] · **repo nuevo**

**Objetivo:** convertir el borrador v0.1 y la spec v1.0 en interfaces, máquinas de estado, esquemas de eventos y pruebas de aceptación. Sin frontend. Empieza por Core, Identity, Compliance y Governance, como recomienda el borrador.

**Repo:** `therealj94/ogfp` (crear, privado). Estructura:

```
ogfp/
  spec/            OGFP-100 ... OGFP-900 en Markdown, una carpeta por serie
  adr/             decisiones de arquitectura numeradas
  contracts/       Solidity (Foundry): interfaces + implementaciones + tests
  sdk/             TypeScript: cliente, tipos generados de los eventos, utilidades
  indexer/         infra/ogfp-indexer (P7)
  dbnx-api/        (P7)
  deploy/          scripts de despliegue a 5534 y 5550, direcciones por red en JSON
  MANIFIESTO.md    qué está desplegado dónde (mismo formato que P1)
```

**Pasos:**
1. **ADR-001** arquitectura por capas L0–L5 (del borrador §4). **ADR-002** registrar-no-mover (§2.2 de este plan). **ADR-003** privacidad sin Tessera. **ADR-004** fee controller + relayer. **ADR-005** Genesis canónico.
2. **OGFP-100 CORE:** `assetId` estable (`OGFP:SEC:DBNX:000001`), clases SEC/COM/MON/UTILITY (+ HYBRID/WRAPPED reservadas de la spec v1.0), estados `DRAFT→REVIEW→APPROVED→ACTIVE→RESTRICTED/SUSPENDED→DELISTED→RETIRED`, versionado, Asset Passport con los campos de §7.2 del borrador más `legacyContract`, `legacyChainId`, `equivalenceRatio`.
3. **OGFP-110 IDENTITY:** GID pseudónimo, `IdentityBinding(wallet ↔ GID commitment, vigencia)`, estados de verificación, recovery `OPEN→VERIFIED→APPROVED→DELAY→EXECUTED/REJECTED`, claims tipo W3C VC 2.0 (`kycVigente`, `empresaVerificada`, `jurisdiccionPermitida`) sin PII.
4. **OGFP-120 COMPLIANCE:** `EligibilityEngine.evaluate(gid, asset, action) → {ok, reasonCode}`; reglas por jurisdicción, tipo de inversor, sanciones/holds; **por defecto permisivo para MON y UTILITY, restrictivo para SEC**.
5. **OGFP-800 GOV:** roles (DBNX Board, Orden Global Tech, Attestor, Issuer, Holder, Auditor), multisig + timelock, `emergencyPause` con reason code y vencimiento, tabla de firmas críticas de §17.2 del borrador.
6. **Eventos** (Apéndice B del borrador) como esquemas JSON + ABI: `AssetRegistered`, `AssetStatusChanged`, `IdentityBindingChanged`, `EligibilityEvaluated`, `SupplyAuthorized`, `MintExecuted/BurnExecuted`, `ReserveAttested/Expired`, `DisclosurePublished`, `RiskLevelChanged`, `TradeSettled`, `RecoveryExecuted`, `MigrationClaimed`, `GovernanceAction`.
7. **Threat model** (STRIDE por componente) y clasificación de datos (público / titular / DBNX / autoridad).
8. **Pruebas de aceptación** escritas en Gherkin o tablas, una por máquina de estado, antes de escribir contratos.

**Cierre:** `spec/` completo, 5 ADR, esquemas de eventos, pruebas de aceptación revisadas por José. Etiqueta `v0.2.0`.

**DECISIONES que José debe cerrar antes de P4:** quórums de firma (mint, recovery, pause, upgrade); nombre legal del marco (RFSA/RFCA); fórmula exacta de referencia de ORIGEN al oro (hoy PAXG/31,1035/55) y oráculo.

---

### P4 · OGFP Core en testnet 5534 — [OLA 2] · depende de P3

**Objetivo:** contratos desplegados en la 5534 con pruebas, deploy reproducible y direcciones versionadas.

**Contratos (Foundry, Solidity 0.8.x, sin upgradeability proxy en v0.2; upgrades = nuevo contrato + registro, decisión revisable):**
- `OGFPAssetRegistry` — assetId, clase, pasaporte, estado, `legacyContract`.
- `OGFPGovernanceController` — roles, multisig (Safe si se puede desplegar en la 5550; si no, multisig propio mínimo auditado), timelock, pause.
- `OGFPIdentityAdapter` — lee bindings/claims firmados por Genesis (firma EIP-712 de Genesis; nada de PII).
- `OGFPEligibilityEngine` — políticas por asset; `evaluate` view + evento.
- `OGFPMigrationRegistry` — snapshots (Merkle root), mapeos old→new, claims con nullifier, reconciliación.
- `OGFPFeeController` — cotiza fee en unidad de settlement, evento `FeeCharged`; relayer autorizado.
- `OGFPSettlementEngine` (mínimo) — DvP atómico asset↔ORIGEN nativo, `TradeSettled`.

**Pasos:**
1. Unit + integration + fuzz (Foundry) por contrato. Cobertura de máquinas de estado = 100 % de transiciones válidas e inválidas.
2. Script `deploy/5534.ts` idempotente; direcciones en `deploy/direcciones.5534.json`; verificación de bytecode contra el SHA del commit.
3. **Registrar los 14 tokens + ORIGEN** en el registro de la 5534 usando la lista de `infra/veta-wallet-backend/lib/saldos.js` (misma dirección, porque la 5534 nació del mismo génesis; verificar con `eth_getCode`).
4. `vigia-cadena` confirma que la 5534 sigue sana después del despliegue.
5. SDK TypeScript generado desde el ABI (`typechain`), con `leerPasaporte(assetId)`, `evaluarElegibilidad`, `registrarClaim`.

**Cierre:** pruebas en verde (adjuntar salida), direcciones publicadas, SDK publicado como paquete interno (`npm pack`), MANIFIESTO del repo OGFP con SHA.

---

### P5 · Genesis ID canónico + bindings + recuperación — [OLA 2] · paralelo con P4

**Objetivo:** un solo Genesis, que emita claims firmados que OGFP pueda verificar, y un proceso de recuperación con dual control.

**Toca:** `genesis-id/`, `genesis-id-app/`, `Ordenglobalfinale` (archivar), `infra/veta-wallet-backend/lib/genesisPuente.js`, `infra/genesis-proxy/`.

**Pasos:**
1. **Archivar `Ordenglobalfinale`:** README con "ARCHIVADO — la implementación canónica es `genesis-id/`", repo en solo lectura. Verificar que ningún cliente apunte a él (grep en todos los repos por su dominio).
2. **`store.ts`:** eliminar el fallback a persistencia local cuando falta Mongo en producción (`NODE_ENV=production` sin `MONGO_URL` → abortar arranque). Probar escrituras concurrentes (dos operadores aprobando el mismo expediente).
3. **Estados claros:** `pendiente / revisión / aprobado / rechazado / vencido` con causa y vencimiento; endpoint `GET /claims/:gid` que devuelve claims firmados EIP-712 (`kycVigente`, `nivel`, `jurisdiccion`, `exp`) **sin datos personales**.
4. **Binding wallet↔GID:** al verificar en Veta, el backend registra `IdentityBindingChanged` vía SDK (testnet). Un GID puede tener varias wallets (web, móvil futura no custodial).
5. **Recuperación:** caso → re-verificación fuerte → congelar binding → aprobación dual (operador Genesis + operador Tech) → transferencia de recuperación ejecutada por el backend custodial → `RecoveryReceipt`. En la wallet custodial la "recuperación" es rebinding de cuenta, no de llave, pero se registra igual para que el rastro exista.
6. **Datos:** separación de roles en Mongo (lectura de expedientes ≠ aprobación), retención definida, bitácora sin documentos completos. Rekognition/umbrales: conjunto sintético de prueba + revisión humana obligatoria (ya existe la regla; documentar la métrica).
7. Página pública `/genesis-id` en Veta que explica al usuario qué es (no el panel de operadores).

**Cierre:** un solo Genesis en el manifiesto; claims firmados verificables con el SDK; ensayo de recuperación con usuario ficticio en staging; escenarios negativos (revocación, expiración, separación de usuarios) en pruebas.

---

### P6 · Veta Wallet como cliente OGFP — [OLA 3] · depende de P4 y P5

**Objetivo:** que la wallet lea activos, pasaportes, elegibilidad y comisión de OGFP, sin que el usuario note ningún cambio de saldo.

**Toca:** `infra/veta-wallet-backend/` (`lib/saldos.js`, `transactionController.js`, `lib/comision.js`, `lib/gas.js`, `lib/genesisPuente.js`, nuevo `lib/ogfp.js`), `apps-web/veta-wallet/` (ficha de activo, pasaporte, R1–R5, estados de disclosure).

**Pasos:**
1. `lib/ogfp.js`: cliente del SDK apuntando por entorno (`OGFP_RED=5534|5550`, direcciones por red). **Feature flag `OGFP_ACTIVO`** por defecto `no` en producción.
2. `lib/saldos.js`: si `OGFP_ACTIVO`, la lista de tokens viene del `AssetRegistry` filtrada por `status=ACTIVE`; si no, la lista escrita. **Prueba de equivalencia:** para las 403 cuentas, saldos con lista escrita == saldos con registro (script en modo lectura, salida adjunta). Esto es la garantía de "nadie nota nada".
3. **Pre-envío:** `EligibilityEngine.evaluate` antes de firmar (solo para activos SEC; MON pasa). Mensajes de error con `reasonCode` traducidos.
4. **Comisión:** `FeeController` cotiza USD 0,01 en ORIGEN con oráculo (`origenPrice.js` ya calcula) y tolerancia; se muestra antes de firmar; ledger de comisiones separado. Relayer: la cuenta pagadora paga el gas; el usuario no necesita ORIGEN libre para mover un token. **DECISIÓN:** fecha de cambio de 0,01 ORIGEN a USD 0,01.
5. **Ficha de activo** en la wallet: pasaporte (emisor, tipo, R1–R5 con la redacción de §8.1, `disclosureStatus`, docs root, política de transferencia). ONDK muestra "valor negociable, derechos económicos por contrato, sin voto" como ya dice `ONDK-PREVENTA.md`.
6. **Idempotencia** (ya existe) extendida a las llamadas OGFP: un `MintExecuted`/`TradeSettled` nunca se duplica por reintento.
7. Staging completo: `vetawallet-staging` con Mongo anonimizado y `OGFP_RED=5534`. Playwright de los recorridos enviar/recibir/cambiar/ficha.

**Cierre:** prueba de equivalencia de saldos 403/403; flag apagado en producción; staging en verde; documentación de activación.

---

### P7 · Orden Ledger, Orden Markets y consola DBNX — [OLA 3] · paralelo con P6

**Objetivo:** el explorador deja de ser un "scan" de direcciones y se vuelve portal de transparencia; Ordenex se vuelve un mercado con OMS fuera de cadena y liquidación OGFP; DBNX nace como consola de admisión.

**7a · Orden Ledger** (`ogscan-frontend/`, `ogscan-backend/`, nuevo `ogfp/indexer/`)
1. Indexer de eventos OGFP (receipts, supply, reserves, disclosures, risk) en Postgres; reconciliación diaria contra la cadena.
2. Vistas públicas: estado de red, activos con pasaporte, supply autorizado/emitido/circulante, cobertura de reservas de ORIGEN cuando sea publicable, reportes, estado de mercado, receipts. **Sin saldos de terceros por defecto** (hoy los muestra; cambiar por commitments cuando exista P8 privacidad; mientras, DECISIÓN de José si se ocultan ya).
3. Mantener nombre público ORDENSCAN hasta G7; código y rutas internas ya como `orden-ledger`.

**7b · Orden Markets** (`apps-web/ordenex/`, `infra/ordenex-api/`)
1. OMS/matching determinista fuera de cadena con números de secuencia y bitácora auditable (ya hay diseño P2P en `DISENO-P2P.md`; unificar).
2. Pre-trade: elegibilidad + reglas de mercado. Post-trade: `SettlementEngine` DvP; estados `RECEIVED→ELIGIBLE→MATCHED→SETTLING→SETTLED/FAILED/CANCELLED`.
3. Vigilancia: reglas simples (wash trading, concentración) con alertas a DBNX.
4. `/precio-declarado/ONDK` se mantiene y se distingue siempre de precio de mercado.

**7c · DBNX** (nuevo `ogfp/dbnx-api/` + `apps-web/dbnx/`)
1. Casos (`Case ID`), paquete documental (hashes; documentos en vault cifrado), checklist, propuesta de Ultron (solo análisis), aprobación humana con firma, plantilla de derechos (SEC-EQ/DEBT/REV/ROY/RE), R1–R5 con historial, `SupplyAuthorized`, reporting `CURRENT→DUE→LATE→WARNING→SUSPENDED`.
2. Acceso solo con GID de operador DBNX y rol. Bitácora de acceso.
3. Ultron como copiloto: endpoint que recibe el paquete y devuelve inconsistencias y propuesta de categoría/riesgo; **nunca aprueba** (H07: permisos verificados en servidor, pruebas de negativa).

**Cierre:** una emisión sintética completa en 5534 recorriendo §7.1 del borrador (Genesis corporativo → caso DBNX → Ultron → humano → aprobación → pasaporte → registro → mint → aparece en wallet staging → aparece en Ledger → trade en Markets con DvP). Es la **compuerta G3+G7 en testnet**.

---

### P8 · Motores de reservas, ORIGEN y commodities (AUKA/AGK) — [OLA 3–4]

**Objetivo:** que el código imponga `MS ≤ min(DSC, RAC)` para ORIGEN y `emitido ≤ onzas verificadas` para AUKA/AGK.

**Toca:** `ogfp/contracts/` (`ReserveEngine`, `MonetaryEngine`, `CommodityEngine`, `OracleRegistry`), `infra/reserve-engine/`, `infra/oracle-registry/`, `infra/reconciliation/`.

**Pasos:**
1. **ORIGEN es nativo:** el `MonetaryEngine` no puede "mintear" gas nativo desde un contrato en Besu sin tocar el cliente. Por tanto: la emisión de ORIGEN es la **tesorería** (cuenta de supply). El motor registra DSC, RAC, MS (= supply total nativo conocido en génesis + emisiones documentadas), CS (= MS − tesorería − bloqueado), y **bloquea transferencias desde la tesorería** que excedan la capacidad (la tesorería es una cuenta controlada por multisig del `GovernanceController`). ADR-006 lo documenta. Un cambio en el cliente Besu para emisión nativa controlada se evalúa solo después de G6.
2. `ReserveEngine`: `ReserveAsset{tier A–E, valor, factor de elegibilidad, haircut, concentración, expiry, custodio, evidencia hash}` → `EligibleValue` con la fórmula de §9.4; porcentajes **configurables, no hardcodeados** (DECISIÓN DBNX).
3. `OracleRegistry`: PAXG/oro, plata, USD, con timestamp, tolerancia y freshness; fuentes actuales (`origenPrice.js`, gold-api, CoinGecko) migran aquí.
4. `CommodityEngine`: `MetalLot` (§10.3), mint solo contra onzas no tokenizadas, redención lock→burn→liberar. AUKA (`0x6Facc…`) y AGKA (`0x961f…`) actuales se registran como legacy con `mintableCapacity = 0` hasta que exista un lote verificado. **No se acuña nada nuevo sin lote.**
5. `infra/reconciliation/`: job diario (§17.3): ORIGEN, AUKA/AGK, securities, mercados, AuCorp/fiat; diferencias fuera de tolerancia → congelar emisión + alerta. Reutiliza `invariante-emision.py`.

**Cierre:** pruebas de que un mint por encima de RAC falla; reconciliación diaria generando evidencia en Ledger; piloto commodity con lote sintético (G5) y piloto ORIGEN (G6) en 5534.

---

### P9 · Migración OGFP-700: que nadie pierda ni un ONDK — [OLA 4, ensayo antes en 5534]

**Principio:** primero **registrar, no mover** (§2.2). La migración con movimiento de fondos solo aplica a activos que necesiten contrato nuevo, y se ensaya entera en la 5534 antes de tocar la 5550.

**9a · Fase de registro (sin mover nada)**
1. Inventario canónico (ya existe base): por cada uno de los 14 contratos + ORIGEN: chain, dirección, decimals, supply, tenedores, roles (`owner`, `pause`, `mint`, `burn`), bridges. Salida `ogfp/deploy/inventario-5550.json` con SHA-256. Verificar con `invariante-emision.py` que suma de saldos == emisión, por token, en un bloque anunciado.
2. Registrar cada uno en `AssetRegistry` de la 5550 con `legacyContract`, ratio 1:1, pasaporte inicial, estado `ACTIVE`, clase (ONDK=SEC, AUKA/AGKA=COM, MNKA/IBS/HARV/AUBEX/ASL/LOVE/REST/SOL/AGRO/AIT/POLITICAL = **DECISIÓN** de DBNX, por defecto `SEC` con `disclosureStatus=DUE`).
3. Wallet (P6) enciende `OGFP_ACTIVO` con la prueba de equivalencia 403/403 en verde. Ledger muestra los activos. **Nadie ve cambio de saldo porque no hubo cambio de saldo.**
4. Cadena 8532: se documenta en el inventario como "copia congelada de la emisión; no cuenta; no se migra". Instrucción pública para quien haya configurado la 8532 en MetaMask (ya en `ONDK-PREVENTA.md`).

**9b · Fase de contrato nuevo (solo si hace falta, por activo, empezando por ONDK si DBNX exige transfer restrictions)**
1. Auditoría de poderes del contrato viejo: ¿se puede pausar? ¿burn? Si no, **escrow permanente** (dirección sin llave conocida, documentada) + monitor de supply.
2. Anuncio público de bloque de snapshot con 7 días de antelación (Ledger + wallet + correo).
3. Snapshot de balances en el bloque; Merkle root publicado en `MigrationRegistry`; archivo `snapshot-<asset>-<bloque>.json` reproducible por cualquiera con el RPC.
4. Pausa/lock del contrato viejo en el bloque (o escrow).
5. **Claims custodiales automáticos:** script en backend Veta (patrón `migrar.js`): por cada usuario, en modo simulacro primero: leer saldo viejo, probar el claim, comparar saldo nuevo == saldo viejo, escribir solo con `MIGRAR=si`, respaldo por documento, relectura desde cadena, sin dejar ninguno a medias. Reporte: `N usuarios, N iguales, 0 diferencias`. **Si hay una sola diferencia, se detiene y se avisa.**
6. **Claims externos:** página en Veta/Ledger: firma con la wallet vieja (EIP-712) → mint del nuevo; o recuperación por Genesis ID con proceso reforzado (P5). **Ventana sin vencimiento**: un claim tardío siempre se puede ejecutar; los no reclamados quedan como `UNCLAIMED` en la reconciliación, nunca se reasignan.
7. Reconciliación: `viejo bloqueado + nuevo emitido + pendientes = emisión aprobada`, publicada en Ledger como panel de migración.
8. Doble lectura en la wallet durante la transición: muestra el saldo nuevo y, si hay viejo sin reclamar, lo muestra con aviso "en migración", nunca como cero.

**Ensayo obligatorio (G8):** clonar el estado de la 5550 en la 5534 (o en la `55330` desechable con `construir-genesis-desde-arbol.py`), correr 9a y 9b enteros, obtener `supply equality` y manejo de excepciones (usuario que se registra a mitad, claim duplicado, RPC caído a mitad de lote). Sin ensayo en verde, no se toca la 5550.

**Comunicación:** un texto corto en la wallet el día del registro ("Tus activos ahora tienen pasaporte; nada cambió en tus saldos") y nada más. La migración exitosa es la que no genera preguntas.

**Cierre:** inventario con SHA; registro de los 15 activos en 5550; equivalencia 403/403; ensayo G8 documentado; panel de migración en Ledger.

---

### P10 · Operar y observar — [OLA 2 en adelante, continuo]

**Objetivo:** alertas diferenciadas de frontend, API, base, proveedor y red; runbooks; presupuestos de rendimiento.

**Pasos:**
1. Monitoreo separado: validadores (liveness por nodo), RPC, indexer, Ledger, APIs (`/salud` en cada backend), Amplify. Reusar `infra/nodos/ogb-vigia.sh` y el agente `vigia-cadena`; agregar CloudWatch/SNS (confirmar suscripción pendiente de `POR-HACER.md` §5).
2. Llaves de validadores: plan a Web3Signer/HSM (hoy archivos en máquinas; `COPIA-FRIA-LLAVES.md`). Runbook de pérdida de validador, rotación, halt y recovery.
3. Presupuesto de rendimiento web: Lighthouse móvil ≥ 70, TTI 4G < 5 s, medido en CI en cada PR de `apps-web/`.
4. Página pública de cambios (`/cambios`) generada desde los sellos `VETA_V`/`AET_V`.
5. Costos: `contador-nube` mensual; retirar nodos 1 y 2 de la 8532 cuando José lo autorice (~138 USD/mes reales).
6. Runbooks: despliegue web (`rescate-produccion/SUBIR.md`), backend (`git push heroku`), rollback, restauración de Mongo (P1.5), incidente de seguridad.

**Cierre:** panel de estado (P2.10) alimentado por esto; alertas probadas con un fallo provocado en staging.

---

### P11 · Día de despliegue (mañana) — [OLA 1]

**Qué sube mañana (y nada más):** P0 (H01–H04, login móvil, DOCTYPE si el QA está en verde), P1 (manifiesto, catálogo con estados, `main` al día), P2 (lo que esté cerrado con pruebas; lo que no, se queda en la rama).

**Orden:**
1. José confirma que AWS Amplify vuelve a aceptar despliegues (facturación).
2. `cirujano-despliegue`: repo vs producción, sin diferencias no explicadas.
3. Backend (si P0.5 tocó `chat.js` solo es web; si tocó backend): `git fetch heroku && git diff heroku/main` → `git push heroku` → `heroku releases` → `/salud`.
4. Web: `python3 apps-web/augalaxy/publicar.py` (si cambió el motor) → `python3 apps-web/subir.py` → esperar job Amplify → `comparar-publicado.py` == 0 diferencias.
5. Verificación en vivo: Playwright 375×667, 360×640, 1280×800: login, galaxia, abrir Wallet, volver, chat con contacto sin dispositivo (bloqueo), inglés.
6. Sello: commit "Sellos de la subida en vivo" con `VETA_V`/`AET_V`.
7. Si algo falla: rollback a `a63bb194` (web) o `heroku rollback` (backend), y se anota qué falló.

**Cierre:** mensaje a José con SHA en vivo, capturas y el manifiesto actualizado.

---

## 4 · Cronograma por olas

| Ola | Cuándo | Partes | Sale a |
|---|---|---|---|
| **1 · Base segura y experiencia** | 22–23 sep | P0, P1, P2, P11 | **Producción** (web + backend si aplica) |
| **2 · OGFP especificado y en testnet** | semanas 1–2 | P3, P4, P5, P10 inicio | Repo `ogfp` v0.2 + contratos en 5534 + Genesis único |
| **3 · Productos como clientes OGFP** | semanas 3–6 | P6, P7, P8 | Staging completo; emisión sintética G3; pilotos G5/G6 en 5534 |
| **4 · Registro en 5550 y migración** | semanas 7–9 | P9 (ensayo G8, luego 9a en 5550), G9 producción limitada | Producción con `OGFP_ACTIVO`, caps y monitoreo |

Las semanas son de trabajo de Opus con revisión de José entre partes. Las compuertas G0–G10 del borrador se mapean así: G0=P0+P1, G1=P3, G2=P4, G3=P7c, G4=P8 privacidad (evaluación), G5/G6=P8, G7=P7b, G8=P9 ensayo, G9=P9a en 5550, G10=posterior.

---

## 5 · Decisiones que necesita José (antes de la parte indicada)

| # | Decisión | Antes de | Recomendación de Fable |
|---|---|---|---|
| 1 | Confirmar revocación de la credencial de `ENTREGA.md` y rotar AWS/Zernio/cPanel/info@ | P0 | Hacerlo hoy |
| 2 | Nombre y visibilidad del repo nuevo | P3 | `therealj94/ogfp`, privado |
| 3 | `main` al día: merge sin squash | P1 | Merge sin squash |
| 4 | Ramas `claude/*` a borrar | P1 | Todas menos la de trabajo y las de respaldo del 20-sep |
| 5 | Quórums de firma (mint, recovery, pause, upgrade) | P4 | 2 de 3 DBNX + 2 de 3 Tech para mint; 2+2 recovery; 1+1 pause con vencimiento 24 h; upgrade 3+3 con timelock 48 h |
| 6 | Fórmula y oráculo de ORIGEN | P3 | Mantener PAXG/31,1035/55; oráculo con 2 fuentes y tolerancia 1 % |
| 7 | Clase OGFP de los 12 tokens menores | P9a | SEC con `disclosureStatus=DUE` hasta que DBNX los revise |
| 8 | Fecha de cambio de comisión a USD 0,01 | P6 | Con `OGFP_ACTIVO` en 5550 (Ola 4) |
| 9 | Ocultar saldos de terceros en ORDENSCAN ya | P7a | Sí, mostrar solo receipts y agregados |
| 10 | Nombre legal del marco (RFSA/RFCA) y textos de riesgo | P7c | Abogado; Opus deja los textos como parámetros |
| 11 | ¿ONDK necesita contrato nuevo con transfer restrictions? | P9b | Solo si DBNX lo exige; si no, ONDK queda registrado sin moverse |
| 12 | Retirar nodos 1 y 2 de la 8532 | P10 | Sí, después de la copia fría verificada |
| 13 | Cuenta de staging en Heroku (`vetawallet-staging`) y Render | P5/P6 | Crear; cuesta un dyno + un servicio |

---

## 6 · Definición de "listo" (para cerrar cada parte)

| Área | Evidencia mínima |
|---|---|
| Inventario | Manifiesto con SHA por servicio; catálogo sin apps futuras como disponibles |
| Entrega | Compilación ligada a commit; CI en verde para ese SHA; dependencias fijadas |
| Identidad y permisos | Escenarios negativos con usuarios ficticios: revocación, expiración, separación de roles |
| Datos | Pruebas aisladas por construcción; respaldo documentado; restauración ensayada fuera de producción |
| Mensajería | Estados criptográficos explícitos; sin degradación no consentida |
| Asistentes | Herramientas con límites en servidor; pruebas de negativa; sin aprobación por prompt |
| Galaxy / interfaz | Seleccionar, abrir, volver en cada app; teclado, tacto, lector, zoom de texto, movimiento reducido |
| OGFP | Pruebas de todas las transiciones de estado; deploy reproducible; emisión sintética completa |
| Migración | Suma de saldos == emisión antes y después; equivalencia por usuario 100 %; ensayo en testnet en verde; claims sin vencimiento |
| Operación | Alertas diferenciadas probadas; runbooks; panel de estado |

---

## 7 · Riesgos principales y cómo los cubre el plan

| Riesgo | Cobertura |
|---|---|
| Pérdida de ONDK u otro token en la migración | §2.2 registrar-no-mover; claims custodiales con simulacro, respaldo y relectura; claims externos sin vencimiento; reconciliación publicada; ensayo G8 obligatorio |
| Desplegar código desfasado | Regla 1; `cirujano-despliegue`; `comparar-publicado.py`; `git fetch heroku` |
| Secretos expuestos | P0; gitleaks en CI; `cerrajero-seguridad` |
| Dos verdades (ramas, docs, flags) | P1 manifiesto; `main` al día; flags por entorno |
| OGFP encima de una base no verificada | Ola 1 cierra G0 antes de Ola 2 |
| ORIGEN nativo no minteable por contrato | ADR-006: tesorería gobernada por multisig + capacidad; cliente Besu solo después de G6 |
| Privacidad "de pantalla" | P7a oculta saldos; P8 evalúa dominio privado/ZK antes de prometer |
| Fee de USD 0,01 dependiente del gas | FeeController + relayer; oráculo con tolerancia |
| Un solo humano (José) como cuello de botella | Tabla de decisiones con recomendación por defecto; Opus deja parámetros configurables y sigue |
| AWS bloqueado | P11 espera; nada se sube por otra vía que no sea Amplify main |

---

## Anexo A · Prompt plantilla para cada sesión de Opus

```
Sos Opus ejecutando la PARTE <Pn> del PLAN-MAESTRO-OGFP-2026-09-22.md de Orden Global.

Antes de tocar nada, leé en este orden:
1. PLAN-MAESTRO-OGFP-2026-09-22.md (sección 0 entera, sección 1, sección 2 y la parte <Pn>).
2. MANIFIESTO-SERVICIOS.md (si ya existe) y rescate-produccion/LEEME.md.
3. Los archivos listados en "Toca" de la parte <Pn>.

Repositorio: <monorepo therealj94/express-js-on-vercel | therealj94/ogfp>
Rama: <claude/ogfp-integracion | main del repo ogfp>
Entorno: <staging | testnet 5534 | ninguno>

Reglas que no podés romper: las 7 de la sección 0. En especial: producción = repo;
ningún secreto en el repo ni en el chat; nada que toque fondos sin simulacro;
ningún test destructivo contra una base real.

Hacé los pasos de la parte en orden. Por cada paso dejá evidencia (salida de
pruebas, capturas, SHA). Si un paso requiere una DECISIÓN de José que no está
tomada, dejá el parámetro configurable con el valor recomendado por el plan,
anotalo en DECISIONES-PENDIENTES.md y seguí.

Al terminar: commit con mensaje claro, push a la rama, y un informe corto con:
qué se hizo, evidencias, qué quedó fuera y por qué, y qué necesita José.
No desplegués a producción salvo que la parte sea P11.
```

## Anexo B · Mapa de repositorios y carpetas después del plan

```
therealj94/express-js-on-vercel   (monorepo, main = producción)
  apps-web/veta-wallet, augalaxy, ordenex→orden-markets, dbnx (nuevo), mytokenpay, aucorp
  infra/veta-wallet-backend (copia versionada; Heroku es el remoto), genesis-proxy, ordenex-api,
        mytokenpay-api, aucorp-api, nodos, migracion-cadena (toolkit de snapshot/claim), reconciliation
  genesis-id/ (canónico), genesis-id-app/
  ogscan-frontend/, ogscan-backend/ → orden-ledger
  MANIFIESTO-SERVICIOS.md, PLAN-MAESTRO-OGFP-2026-09-22.md, DECISIONES-PENDIENTES.md

therealj94/ogfp   (nuevo)
  spec/ adr/ contracts/ sdk/ indexer/ dbnx-api/ deploy/ MANIFIESTO.md

therealj94/ULTRON-APP   (sin cambios de estructura; barrera de tests H02, copiloto DBNX)
Ordenglobalfinale   (archivado, solo lectura)
```

## Anexo C · Lo que este plan NO incluye a propósito

- Opinión legal, licencias, valoración de reservas, aprobación regulatoria.
- Cambios al consenso o al cliente Besu.
- Apps móviles nuevas no custodiales (se reservan en OGFP-110 como wallets adicionales por GID).
- MINAS, GoldexSwap y otros nombres sin producto: se quedan como `futuro` en el catálogo.
- Renombres públicos de ORDENSCAN/Ordenex antes de G7.

---

*Fin del plan. Versión 1 · 22-sep-2026 · Pendiente de revisión de José.*
