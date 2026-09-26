# Plan SFSP v0.3 · del documento rector a la plataforma funcionando

**26 de septiembre de 2026.** El borrador **SFSP v0.3** (José, 26-sep) sustituye al v0.2 y es la regla. Este plan hace tres cosas:
- lo coteja sección por sección con lo que existe hoy en el repositorio, en la 5550 y en los servicios;
- corrige lo que el documento dice y la medición contradice;
- ordena el trabajo en fases.

Todo lo marcado «existe» se comprobó hoy. Las pruebas se corrieron hoy. El plan no contiene secretos ni datos de personas: donde hay un secreto, solo dice dónde está.

> El `.docx` del v0.3 dice «Documento interno». **No se sube** al repositorio público; queda fuera hasta que José diga lo contrario.

---

## 0 · En una página

| | Estado hoy |
|---|---|
| **Pruebas** | Contratos **254/254**, SDK **186/186**, indexador **67/67**, todas en verde. Las pruebas de contratos 13 y 15 necesitan el SDK compilado (`cd sdk && npm run build`). |
| **Desplegado** | **Ningún contrato SFSP en ninguna red.** La 5550 corre con los 172 contratos heredados. |
| **Especificación** | Va alineada con el v0.2 y **no todavía con el v0.3**. Faltan: licencias por titular y operador, oferta exenta, tokenización de acciones, verificación previa a la acuñación, mercado híbrido, deslindes y la migración a la misma dirección en código. |
| **Código del protocolo** | Existen: registro de activos, gobierno, identidad, elegibilidad, emisión, activo regulado, liquidación, comisiones, migración, DID y bóveda nativa. **No existen**: registro de licencias, matriz de países, límite de exposición, motor de commodities y reservas, oráculo, tesorería cotizadora, motor de pagos, acciones corporativas ni filtro de red. |
| **Red 5550** | Besu 26.7.1, **7 validadores** en una sola cuenta de nube, gas de 93 gwei con tarifa base 0. **La API de permisos está apagada**: no hay red cerrada. **`admin_nodeInfo` está expuesto en el RPC público**. |
| **Condiciones de arranque (§16)** | **Siguen abiertas.** La credencial en texto plano sigue en el árbol. Los puentes Genesis↔Veta ya no son 2, sino **3**. No hay constancia de la copia fría de las llaves. |
| **Decisiones** | D00–D27 figuran como PENDIENTE en `DECISIONES-SFSP.json`. El v0.3 da por **tomadas en sustancia** D01 (precio en gramin) y D02 (comisión de 0,01 USD); falta el acta. |

**Veredicto.** «Subir todo y que funcione» tiene dos mitades:
- **Lo que depende de nosotros se puede hacer ya:** la fase 0 (limpieza y seguridad), la fase 1 (especificación v0.3) y la fase 2 (código del protocolo) se construyen y se prueban completas, apagadas.
- **Lo que no depende de código:** encender en la 5550 exige actas de la Junta, licencias, credenciales rotadas y la red cerrada. Eso no lo puede resolver el código, y el plan lo marca como compuerta.

---

## 1 · Lo que el v0.3 dice y la medición corrige

| # | El v0.3 dice | La medición dice | Qué hacer |
|---|---|---|---|
| C1 | §14.5: «792,5 ONDK no ubicados» | **804,5 ONDK** en el bloque 273.508. La diferencia (12 ONDK) es la única clave de **permiso** del contrato, que se contó como saldo. AUKA: 9.823,01, **coincide** | Corregir la cifra en el v0.4. Método: `migracion-410/censo-tokens-5550.mjs` |
| C2 | §14.5: la fuente para conciliar es el respaldo del reinicio del 25-ago | Coincide. En la foto de la 8532 del 10-ago los dos tokens cuadraban exacto; el faltante aparece después. El respaldo del 25-ago está en un bucket de arranque de la 5550 (`reinicio-5550/ETAPA-0-RESPALDO.md`) | Leerlo cuando haya credenciales rotadas (fase 0). **No se buscan saldos en la 8532**: los saldos son los de la 5550 hoy |
| C3 | §2.1: la 5534 existe y se destina a ensayos | `rpc-testnet.ordenglobal-rpc.com` **responde con la 5550**, con el mismo génesis. La 5534 está parada desde el 15-ago | Arreglar el DNS o el proxy del nombre de ensayo, y levantar la 5534 (hace falta para probar la red cerrada) |
| C4 | §10.5: los demás tokens se declaran «sin referencia» | Las apps tienen **precios fijos** para AUBEX (10 USD), HARV, IBS, REST, SOL, AGRO, AIT, ASL, LOVE y POLITICAL (`orden-global-app/src/api.js:664`, `veta-wallet-app/src/api.js:669`, `apps-web/veta-wallet/cadena.js:170`) | Fase 0: quitarlos todos, no solo el de AUBEX |
| C5 | §10.5: un único registro de oráculo | Hay **tres lecturas independientes**. `origenPrice.js` no tiene caché ni edad máxima. `referencia.js` usa caché de 30 s con un máximo de 5 min, no 10. Las apps llaman directo a CoinGecko con 2,35 USD fijo de respaldo | Fase 0: un solo módulo de oráculo para backends y apps. Sin dato fresco, guion |
| C6 | §13.3: MyTokenPay no lleva un libro contable paralelo | `infra/mytokenpay-api/src/lib/caja.ts` **es** un libro paralelo. La app móvil tiene `USE_MOCK_API = true` | Fase 4: consumir la liquidación del protocolo. Hasta entonces, no publicar la app móvil |
| C7 | §14.4: HARV e IBS tienen clase y serie por definir | Ordenex ya los **cotiza**: los 5 mercados son AUKA, AGKA, ONDK, IBS y HARV, y las apps los marcan `publico: true` | Decisión de la Junta (§18). Mientras tanto, mostrarlos como «uso interno» o retirar los dos mercados |
| C8 | §9 / §9.4: AUKA y AGKA se acuñan por anticipado y se colocan solo contra metal | La enmienda SFSP-410 a SFSP-300 dice lo contrario: se acuña solo contra un lote atestado | **Manda el v0.3.** Revertir esa enmienda en SFSP-300 (fase 1) |
| C9 | §14.3: se acuña el equivalente a la misma dirección, sin reclamo por firma | `SFSPMigrationRegistry` está basado en reclamo, con firma del atestador. La alternativa «cupo por padrón» (`migracion-410/LEEME.md`, REV-410-17) sí hace lo que pide el v0.3 | El v0.3 **resuelve D26 en sustancia**. Adoptar el cupo por padrón como camino normativo con un ADR (fase 1) y ajustar SFSP-700 |
| C10 | §11: estados de identidad del Apéndice A | Genesis ID no tiene el estado **`vencida`**, y «pendiente» está repartido en 4 estados intermedios | Fase 0: añadir `vencida` y mapear los estados intermedios a «pendiente» |

---

## 2 · El v0.3 sección por sección

| § | Qué exige | Qué existe | Qué falta |
|---|---|---|---|
| **2.1 Red cerrada** | Lista de quién despliega y **filtro de transacciones por destino**, controlados por gobierno | Nada. La API PERM está apagada. Solo lo menciona SFSP-150 | Mecanismo en Besu 26.7.1: **permisos de cuentas por contrato** (`transactionAllowed(sender, target, …)`, que filtra por destino; Besu lo marca obsoleto, hay que confirmarlo) o un **complemento** (`TransactionPermissioningProvider`). Tiene que estar activo en **los 7** validadores. Probar en la 5534, cambios solo por multifirma, evento `NetworkPermissionChanged` |
| **3 · L0** | Validadores sin un punto único | 7 validadores en una cuenta, con un operador y un balanceador | Separar cuentas y proveedores. Constancia de la copia fría (el procedimiento habla de 4 llaves; hoy son 7) |
| **4.2 Asset Passport** | Unos 25 campos, versionados y con vigencia | `Passport` sin auditor, valuador, custodio, segmento, cobertura, calendario, redención ni licencias. Identificador libre en `bytes32` | Ampliar la estructura. Identificador jerárquico. Un campo vencido se lee como vencido |
| **4.3 Vocabulario** | Acuñar, asignar, colocar, circular. Tesorería = acuñado sin colocar | SFSP-410 y ADR-015: circulante = lo que tienen los usuarios | Alinear los nombres en la especificación, el SDK y el explorador |
| **5 · Roles** | DBNX no valúa. Orden Global verifica **la forma** de la aprobación antes de acuñar | No hay verificación previa a la acuñación | `mint` exige un hash del documento de aprobación de DBNX, firmado, vigente y por el monto exacto |
| **6 · Licencias** | Registro con titular y operador. Módulo sin licencia vigente → rechazo. Oferta exenta como autorización limitada | Solo la especificación (SFSP-140), con dos titulares «por confirmar» | Contrato `SFSPLicenseRegistry`. La tabla del v0.3 como dato: Au Corp. titular, Ordenex/AuBank operadores, ATS y NBL propias de Orden Global. La oferta exenta, en el motor de elegibilidad (Próspera, acreditado, sofisticado). Taxonomía única de disponibilidad |
| **7 · SFSP-120** | Por defecto «solo entrante»; bloqueo solo por sanción | El motor tiene una **lista blanca que bloquea por defecto** y no conoce la acción `SUBSCRIBE` | Matriz de países con 4 estados. Acción `SUBSCRIBE` separada de `TRANSFER`. Por defecto `SOLO_ENTRANTE` |
| **8 · SFSP-200** | Supply = capital ÷ precio, colocación o división con prueba de neutralidad, **51 %** máximo y un mínimo por segmento, dos segmentos, límite de exposición por identidad, expediente con **Bloque 7**, **tokenización de acciones**, motor de pagos, acciones corporativas | Emisión, activo regulado y `dbnx-api` (casos, plantillas, riesgo). Eventos definidos sin contrato | Tokenización de acciones y verificación previa (nuevas en el v0.3). Límite de exposición, segmentos, 51 % y mínimo, declaración de ampliación, declaración del adquirente con versión del documento. El motor de pagos y las acciones corporativas esperan su especificación (el v0.3 los deja pendientes) |
| **9 · SFSP-300** | Lotes, custodia distribuida, cobertura contra lo **colocado**, redención (quema antes de entregar), 1 AUKA = 1.710,69 ORIGEN, AGKA por ratio del oráculo | Solo la especificación (con el conflicto C8). **0 onzas en custodia** | Motor de reservas y commodities: lotes, capacidad de colocación, redención en ORIGEN (canales físicos cerrados por parámetro), prueba de reservas |
| **10 · SFSP-400** | Supply fijo de un billón, precio en gramin, comisión de 0,01 USD en ORIGEN separada del gas, tesorería con 5 controles, oráculo único | La bóveda nativa (SFSP-410). La comisión existe en Veta, pero solo cobra con `OG_COMISION_USD`. El gas cuadra (0,001953 ORIGEN) | Oráculo único (C5). Tesorería cotizadora con sus 5 controles (parámetros en §18). Limpiar de SFSP-400 el texto de la emisión contra reservas |
| **11 · SFSP-110** | Un puente Genesis↔Veta. La dirección de billetera en cada vínculo | **Tres puentes**: `genesis-proxy`, `veta-wallet-backend/lib/genesisPuente.js` y `mytokenpay-api/src/routes/genesis.ts`. En los tres la dirección es opcional | Un solo puente. Dirección obligatoria en el vínculo (sin ella no hay límite de exposición). Estados según C10 |
| **12 · SFSP-600** | Privacidad criptográfica, no de interfaz | Principios y 2 prototipos | Elegir la tecnología (D06) |
| **13 · SFSP-500** | Mercado híbrido en Ordenex: libro con calce fuera de la cadena, **par ORIGEN/fiat** como puerta de entrada, swap en cadena con fondos conformes y sin securities en la v1 | Liquidación con entrega contra pago en contrato. Ordenex: 5 mercados contra ORIGEN y compra de ORIGEN con USDT. **No hay par fiat ni swap** | Par ORIGEN/fiat con los rieles de AuBank (a `aucorp-api` le falta el puente fiat→ORIGEN). Fondos de swap conformes. Retirar los restos de «GoldeX» en los textos |
| **14 · SFSP-700** | Migración dentro de la misma cadena: los 172 heredados inactivos por filtro, el catálogo de §14.4, conciliación antes de migrar AUKA u ONDK | Inventario de los 172. Censo de todos los tokens a la fecha (46 con emisión, todas las claves resueltas) | C9. El filtro de red (§2.1). Conciliación C1/C2. Ratificación del catálogo por la Junta |
| **15 · SFSP-800/900** | Firmantes y umbrales, manifiesto por servicio, conciliación diaria | Gobierno en contrato (quórum, espera, pausa que caduca) | Firmantes y umbrales (D07). Manifiesto con versión, respaldo y recuperación por servicio. Conciliación diaria contra la cadena real |
| **16 · Arranque** | 9 puntos | Ver §0 | Fase 0 |
| **Apéndices A y B** | 14 máquinas de estado y 28 eventos | Los 28 eventos tienen nombre canónico; solo **13** los emite un contrato | Los 18 restantes se emiten desde los contratos de la fase 2 |

---

## 3 · Fases

Regla que manda sobre todo: **se construye completo y se sube apagado.** Nada se enciende, nada toca dinero y nada se escribe en la 5550 sin la orden de José y la decisión firmada.

### Fase 0 · Limpieza y seguridad (sin decisiones de la Junta)

| # | Tarea | Quién |
|---|---|---|
| 0.1 | **Rotar** la credencial del panel de MyTokenPay y quitarla de `infra/mytokenpay-api/ENTREGA.md` (seguirá en el historial) | Humano rota, código limpia |
| 0.2 | Cerrar `admin_*` en el RPC público de la 5550 (hoy expone `admin_nodeInfo`) | Operación de nodos |
| 0.3 | Arreglar el nombre de ensayo (C3) y levantar la 5534 | Operación de nodos |
| 0.4 | Quitar todos los precios fijos de las apps (C4). Retirar AUBEX = 10 USD (§19) | Código |
| 0.5 | Un solo módulo de oráculo (C5): caché de 30 s, edad máxima de 10 min, guion sin dato. Lo consumen Veta, Ordenex y las apps | Código |
| 0.6 | Un solo puente Genesis↔Veta con dirección obligatoria. Estado `vencida` en Genesis ID (C10) | Código |
| 0.7 | Retirar «GoldeX» de los textos. Corregir el comentario obsoleto de `ordenex-api/lib/referencia.js` | Código |
| 0.8 | Barrera en la app móvil de MyTokenPay: no se puede compilar para tienda con `USE_MOCK_API = true` | Código |
| 0.9 | Credenciales rotadas para leer el respaldo del 25-ago y conciliar C1/C2 | Humano (AWS) |
| 0.10 | Accesos de solo lectura para Genesis ID y Veta, como variables del entorno y nunca por el chat. Corregir la regla del proxy que inyecta AWS en `vetawallet.com` | Humano (configuración) |

### Fase 1 · Especificación alineada al v0.3 (`draft-0.5`)

- **SFSP-140:**
  - titular y operador según la tabla del v0.3 §6;
  - la oferta exenta como autorización de alcance limitado;
  - taxonomía única de disponibilidad.
- **SFSP-120:**
  - acción `SUBSCRIBE`;
  - estado `SOLO_ENTRANTE` por defecto;
  - relación con el alcance de la oferta exenta (§7).
- **SFSP-200:**
  - Bloque 7 (deslindes, ventanilla, fondo de protección) como condición de admisión;
  - §8.9 tokenización de acciones;
  - verificación previa a la acuñación;
  - 51 % máximo y un mínimo por segmento.
- **SFSP-300:**
  - revertir el conflicto C8;
  - custodia por Ordenex bajo la licencia Clase G, con límite de concentración.
- **SFSP-400:**
  - quitar la emisión contra reservas;
  - precio en gramin (D01);
  - comisión de 0,01 USD en ORIGEN (D02).
- **SFSP-500:**
  - mercado híbrido en Ordenex;
  - reglas por clase de activo;
  - puerta de entrada ORIGEN/fiat.
- **SFSP-700:**
  - camino normativo = acuñación a la misma dirección por cupo del padrón (ADR nuevo);
  - catálogo §14.4;
  - cifras C1.
- **Apéndices:** estados y eventos del v0.3 como tabla normativa única.

### Fase 2 · Código del protocolo (apagado, con pruebas)

Cada contrato nuevo lleva sus pruebas, sus eventos del Apéndice B y su entrada en el SDK y el indexador.

1. `SFSPLicenseRegistry` + dependencia de licencia en cada módulo.
2. Matriz de países y `SUBSCRIBE` en `SFSPEligibilityEngine`. Límite de exposición por identidad.
3. Pasaporte ampliado. Identificador jerárquico. Verificación previa a la acuñación en `SFSPIssuanceController`.
4. Oráculo único en cadena (`SFSPOracleRegistry`) con frescura.
5. Reservas y commodities: lotes, capacidad de colocación, redención en ORIGEN.
6. Tesorería cotizadora con sus 5 controles (sin parámetros hasta el acta).
7. **Contrato del filtro de red** (`transactionAllowed`), gobernado por multifirma. Se prueba en la 5534 con los 7 validadores.
8. Migración por cupo del padrón (`mintOnDemand` a la misma dirección) con conciliación publicada.

Después, la auditoría externa de los contratos nuevos, antes de la 5550.

### Fase 3 · Red

- Mecanismo de filtro confirmado en Besu 26.7.1, activo en los 7 validadores de la 5534 y después de la 5550.
- Validadores en al menos dos cuentas y dos proveedores.
- Copia fría de las 7 llaves, con constancia.
- Prueba de restauración de la historia de la 8532, pendiente en el v0.3 §20.

### Fase 4 · Productos

- Par ORIGEN/fiat en Ordenex con los rieles de AuBank.
- Swap en cadena con fondos conformes.
- MyTokenPay sobre la liquidación del protocolo, sin libro propio.
- Veta y Ordenex con `SFSP410_EMISION`: sigue apagado hasta el Día D.

### Fase 5 · Encendido

Se hace por `deploy/sfsp410/DIA-D.md`, compuerta por compuerta, con los pasos de la ola 6 de `PLAN-FINAL-2026-09-25.md`.

---

## 4 · Lo que tiene que decidir o firmar la Junta

| Tema (v0.3 §18/§19) | Registro | Bloquea |
|---|---|---|
| Acta del precio en gramin | D01 | Tesorería, oráculo |
| Acta de la comisión de 0,01 USD | D02 | Encender el cobro de la comisión |
| Ratificación de los movimientos del 11 y 14-sep y de AUBEX del 17-sep; cuentas internas | D25 | Circulante, lote de ORIGEN |
| Firmantes, umbrales y esperas | D07 | Todo despliegue |
| Migración por cupo del padrón (el v0.3 §14.3 la resuelve en sustancia) | D26 + ADR | Migración de ONDK, AUKA y AGKA |
| Clase y serie de HARV, IBS, MONARKA, REAL STATE y los seis tokens del despliegue conjunto; contrato canónico de IBS | D08 | C7, migración |
| Ratificar el tratamiento de los heredados (§14.4) | D26 | Filtro de red |
| Adquirentes tempranos de ONDK | — | Migración de ONDK |
| Parámetros de tesorería, segmentos, límite de exposición y deslindes | D03/D04 | Fase 4 |
| Base legal de la venta de ORIGEN al público | — | Puerta de entrada abierta al público |

---

## 5 · Lo que no hace el código

- Licencias RFSA y oferta exenta.
- Custodia de metal.
- Valuador de ONDK.
- Opinión legal sobre los deslindes.
- Rotación de credenciales.
- Restricción de la cuenta de AWS.

Todo lo anterior condiciona el encendido, pero no la construcción.
