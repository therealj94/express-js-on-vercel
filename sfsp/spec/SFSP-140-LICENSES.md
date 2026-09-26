# SFSP-140 · Licenses

| Campo | Valor |
|---|---|
| Serie | SFSP-140 · Licenses (registro de licencias) |
| Estado | `draft-0.5` (alineada con el borrador SFSP v0.3 §5 y §6) |
| Fuente de tipos | Este documento. Los tipos pasan a `CONTRATO-INTERNO.md` cuando exista código (`SFSPLicenseRegistry`, fase 2 de `../PLAN-SFSP-v0.3-2026-09-26.md`) |
| Parte del plan maestro | P3 (spec). El código es el punto 1 de la fase 2 del plan v0.3 |
| Decisiones que la bloquean | D13 (autoridad y jurisdicción), D07 (quién firma la habilitación), **base legal de la venta de ORIGEN al público** (v0.3 §18), **colocación de securities de terceros** (v0.3 §18), criterios de inversionista acreditado y sofisticado (D13) |

**Qué NO afirma este documento:** no afirma que ninguna licencia esté otorgada. Todas las del cuadro de §3 figuran como `EN_TRAMITE` en el registro. No da ningún número de licencia, no convierte ninguna función en disponible y no afirma que la notificación de oferta exenta sea una licencia.

---

## 0 · Cómo leer esta serie

El borrador SFSP v0.3 (26-sep-2026) sustituye al v0.2 y es la regla (`../PLAN-SFSP-v0.3-2026-09-26.md`). Es un documento interno y **no está en el repositorio**: aquí se cita por sección (`v0.3 §n`), no se copia. Para la especificación, el v0.3 manda. Para ejecutar en la 5550 sigue haciendo falta la decisión firmada: lo que dependa de una decisión `PENDIENTE` en `../DECISIONES-SFSP.json` devuelve `BLOCKED_DECISION`.

Cambios frente a `draft-0.4`:

| draft-0.4 (v0.2) | draft-0.5 (v0.3) |
|---|---|
| Un titular por fila; ATS Clase B y Non-Banking Lender «por confirmar» | Titular **y** operador por fila. Au Corp. y Orden Global tienen **cada una** su ATS Clase B y su Non-Banking Lender, como licencias independientes (v0.3 §6) |
| Custodia Clase G a nombre de AuBank | Titular Au Corp., operador **Ordenex** (v0.3 §5, §6) |
| La oferta exenta, una fila más de licencia | Es una **autorización de alcance limitado**, no una licencia, y la aplica el motor de elegibilidad (§4) |
| Investment Company License para la admisión de securities | Para la **oferta pública** de productos de inversión, la estructuración de vehículos y la tokenización de activos de terceros (v0.3 §6) |

---

## 1 · Para qué existe

Las licencias son de **personas jurídicas**. Au Corp. participa por dos divisiones, Ordenex y AuBank, que son **marcas operativas**: la titular de sus licencias es Au Corp. (v0.3 §1, §5). Por eso el registro separa dos campos que la versión anterior mezclaba:

| Campo | Qué es | Para qué sirve |
|---|---|---|
| `titular` | La entidad a cuyo nombre se otorga la licencia | Resolver la dependencia: un módulo se habilita o se bloquea por la licencia de su titular |
| `operador` | La división o entidad que opera el módulo | Rendición de cuentas y comunicación pública. **No habilita nada por sí mismo** |

Cada módulo declara de qué licencia depende. Una operación de un módulo cuya licencia no esté `VIGENTE` **se rechaza por código**. No basta con que una pantalla la esconda.

---

## 2 · El registro

| Campo | Contenido |
|---|---|
| `licenseId` | Identificador estable (ver §3) |
| `naturaleza` | `LICENCIA` o `AUTORIZACION_ALCANCE_LIMITADO` (§4) |
| `tipo` | Por ejemplo: «FinTech Custodia Clase G», «FinTech ATS Clase B», «Notificación de oferta exenta» |
| `titular` | Entidad titular (Genesis ID corporativo) |
| `operador` | División o entidad que opera el módulo. Puede diferir del titular solo si el operador es una división del titular |
| `autoridad` | Autoridad que la otorga o ante la que se notifica (por ejemplo, RFSA) |
| `jurisdiccion` | Jurisdicción |
| `estado` | Ver §5 |
| `vigencia` | Desde, hasta |
| `numero` | Número de licencia o de constancia. **`null` mientras no esté otorgada** |
| `alcance` | Solo para `AUTORIZACION_ALCANCE_LIMITADO`: a quién admite y qué excluye (§4) |
| `referenciaDocumental` | Hash del documento de otorgamiento o de la constancia de notificación |

Cada **módulo** declara `dependeDe: licenseId[]`. Si declara más de una, **todas** tienen que estar `VIGENTE` (conjunción, no alternativa).

---

## 3 · Dependencias declaradas en el v0.3 §6

### 3.1 Licencias

| `licenseId` | Tipo | Titular | Operador | Estado en el registro |
|---|---|---|---|---|
| `LIC_AUCORP_CORRETAJE_C` | Corretaje Clase C | Au Corp. | Ordenex | `EN_TRAMITE` |
| `LIC_AUCORP_ATS_B` | FinTech ATS Clase B | Au Corp. | Ordenex | `EN_TRAMITE` |
| `LIC_AUCORP_CUSTODIA_G` | FinTech Custodia Clase G | Au Corp. | Ordenex | `EN_TRAMITE` |
| `LIC_AUCORP_BANCA_B` | Banca Clase B | Au Corp. | AuBank | `EN_TRAMITE` |
| `LIC_AUCORP_NBL` | Non-Banking Lender | Au Corp. | AuBank | `EN_TRAMITE` |
| `LIC_OG_ATS_B` | FinTech ATS Clase B | Orden Global | Orden Global | `EN_TRAMITE` |
| `LIC_OG_NBL` | Non-Banking Lender | Orden Global | **Alcance por redefinir** (v0.3 §6) | `EN_TRAMITE` |
| `LIC_OG_ICL` | Investment Company License | Orden Global | Orden Global | `EN_TRAMITE` |
| `AUT_OG_OFERTA_EXENTA` | Notificación de oferta exenta ante RFSA | Orden Global | Orden Global | `EN_TRAMITE` hasta cargar su `referenciaDocumental` |

Au Corp. y Orden Global solicitan **cada una** su ATS Clase B y su Non-Banking Lender, para actividades distintas. El registro las trata como licencias **independientes**: una ATS de Orden Global vigente no habilita nada que dependa de la ATS de Au Corp., ni al revés.

### 3.2 Módulos

| Módulo | Serie | `dependeDe` | Titular | Operador |
|---|---|---|---|---|
| `MOD_MERCADO_HIBRIDO`: libro de órdenes e intercambio en cadena | SFSP-500 | `LIC_AUCORP_CORRETAJE_C` **y** `LIC_AUCORP_ATS_B` | Au Corp. | Ordenex |
| `MOD_CUSTODIA_CLIENTES`: custodia de activos de clientes y redención física de metal | SFSP-300, SFSP-500 | `LIC_AUCORP_CUSTODIA_G` | Au Corp. | Ordenex |
| `MOD_DEPOSITOS`: depósitos y cuentas (rieles de moneda fiduciaria) | SFSP-500 | `LIC_AUCORP_BANCA_B` | Au Corp. | AuBank |
| `MOD_CREDITO_AUBANK`: crédito bancario | fuera de serie | `LIC_AUCORP_NBL` | Au Corp. | AuBank |
| `MOD_RED_PAGOS_OG`: red de pagos y conversión de ORIGEN a moneda fiduciaria para la Freedom Card | SFSP-500 | `LIC_OG_ATS_B` | Orden Global | Orden Global |
| `MOD_CREDITO_OG`: crédito de Orden Global | fuera de serie | `LIC_OG_NBL` | Orden Global | alcance por redefinir |
| `MOD_COLOCACION_PRIVADA`: colocación privada de ORIGEN, AUKA, AGKA y ONDK | SFSP-120, 200, 300, 400 | `AUT_OG_OFERTA_EXENTA` | Orden Global | Orden Global |
| `MOD_OFERTA_PUBLICA`: oferta pública de productos de inversión, estructuración de vehículos y tokenización de activos de terceros | SFSP-120, 200 | `LIC_OG_ICL` | Orden Global | Orden Global |

Reglas de composición:

1. **La puerta de entrada** (compra de ORIGEN contra moneda fiduciaria en Ordenex, v0.3 §7 y §13.3) usa tres módulos a la vez: `MOD_DEPOSITOS` para el depósito, `MOD_MERCADO_HIBRIDO` para la compra y `MOD_COLOCACION_PRIVADA` para el alcance. Falta uno y la puerta se cierra.
2. **El libro de órdenes con custodia** (v0.3 §13) recibe depósitos de activos de clientes. Recibir y guardar activos de clientes es `MOD_CUSTODIA_CLIENTES` (v0.3 §5: Ordenex custodia «cuando la Licencia de Custodia Clase G esté vigente»). El modo libro exige por eso `MOD_MERCADO_HIBRIDO` **y** `MOD_CUSTODIA_CLIENTES`. El modo de intercambio en cadena, en el que el usuario opera desde su propia billetera, solo exige `MOD_MERCADO_HIBRIDO`.
3. **Cada conversión responde bajo la licencia de quien la ejecuta** (v0.3 §13.3): fiat → ORIGEN en Ordenex bajo `LIC_AUCORP_ATS_B`; ORIGEN → fiat para la Freedom Card bajo `LIC_OG_ATS_B`.
4. La solicitud de ATS Clase B de Orden Global se **reenfoca a la red de pagos** por el retiro de GoldeX (v0.3 §6, §19), y el alcance de su Non-Banking Lender, que se justificaba en ese mercado, se redefine. Hasta entonces `MOD_CREDITO_OG` no tiene alcance y cualquier operación devuelve `BLOCKED_DECISION`.

---

## 4 · La oferta exenta: autorización de alcance limitado

La notificación de oferta exenta es un **mecanismo de exención, no una licencia** (v0.3 §6). Permite la colocación privada sin oferta pública ni promoción general. El registro la trata con `naturaleza = AUTORIZACION_ALCANCE_LIMITADO` y le declara el alcance:

| Campo de `alcance` | Valor |
|---|---|
| Inversionistas admitidos | `RESIDENTE_PROSPERA`, `ACREDITADO`, `SOFISTICADO` |
| Oferta pública | No |
| Promoción general | No |
| Activos amparados | ORIGEN, AUKA, AGKA, ONDK |
| Criterios de `ACREDITADO` y `SOFISTICADO` | `null`, `BLOCKED_DECISION` (D13) |

Cómo se aplica:

1. **Lo aplica el motor de elegibilidad**, no la interfaz. Mientras la colocación de un activo se sustente en esta autorización, la acción `SUBSCRIBE` sobre ese activo exige que el sujeto tenga una atestación vigente de alguno de los tres tipos admitidos. Sin ella: `DENY`, código de motivo `FUERA_DE_ALCANCE_OFERTA_EXENTA`. El detalle de la regla, y cómo se combina con la matriz de países, está en SFSP-120 §0.5.
2. Mientras los criterios de acreditado y sofisticado sean `null`, solo `RESIDENTE_PROSPERA` puede evaluarse. Una `SUBSCRIBE` que dependa de los otros dos devuelve `BLOCKED_DECISION`.
3. El alcance limita la **suscripción primaria**, no la tenencia ni el mercado secundario (v0.3 §7).
4. **La apertura de la suscripción primaria al público general depende de `LIC_OG_ICL`** (v0.3 §7). Que la matriz de países marque un país como `PERMITIDO` no amplía el alcance de la oferta exenta.
5. La base legal de la venta de ORIGEN al público minorista es una **decisión abierta** (v0.3 §18). Mientras no se tome, ORIGEN solo se coloca dentro de este alcance.
6. Sin oferta pública ni promoción general: la regla de promoción de SFSP-120 §0.6 aplica con más fuerza a estos cuatro activos.

---

## 5 · Estados

```
[ EN_TRAMITE ] --otorgamiento--> [ OTORGADA ] --inicio de vigencia--> [ VIGENTE ]
                                                                        |   |   |
                                          suspensión <------------------+   |   +--> vencimiento --> [ VENCIDA ]
                                              |                             |
                                              v                             +--> revocación --> [ REVOCADA ]
                                        [ SUSPENDIDA ] --levantamiento--> [ VIGENTE ]
```

Los seis estados son los del v0.3 Apéndice A (Licencia) y valen igual para las dos naturalezas. Solo `VIGENTE` habilita un módulo. Los demás estados, incluido `OTORGADA` antes de su fecha de inicio, **lo bloquean**.

---

## 6 · Reglas

1. **El registro interno puede contener licencias en trámite**, porque hace falta para planificar.
2. **La vista pública nunca muestra como disponible una función que dependa de una licencia no vigente.** Cuando muestra el estado de una licencia no otorgada, usa la expresión «en trámite» y nunca un número, una fecha estimada ni un logotipo de la autoridad. Anunciar o insinuar una licencia que no se tiene es una infracción en la mayoría de jurisdicciones, aunque la licencia vaya a obtenerse (v0.3 §6).
3. **Habilitar un módulo al obtener la licencia es una acción de gobernanza registrada en cadena** (SFSP-800), con código de motivo `LICENCIA_OTORGADA` y el número de licencia. **La especificación no se modifica**: lo único que cambia es un parámetro publicado.
4. La licencia vencida, suspendida o revocada **cierra el módulo sola**, sin acción humana, y emite `ModuleAvailabilityChanged`.
5. Un operador no suple al titular: si la licencia del titular no está vigente, que la división operadora tenga otra licencia distinta no habilita el módulo.

### 6.1 Taxonomía única de disponibilidad

Una sola taxonomía en todo el sistema: interfaz pública, catálogo de productos, API y documentos (v0.3 §6).

| Valor | Significado | Con alguna dependencia no `VIGENTE` |
|---|---|---|
| `DISPONIBLE` | El público puede usarlo en las condiciones publicadas | **Prohibido** |
| `BETA` | El público puede usarlo con límites y aviso de producto en prueba | **Prohibido** |
| `PROXIMAMENTE` | Anunciado, no operable | Permitido **solo** con la leyenda «licencia en trámite», sin fecha ni número |
| `USO_INTERNO` | Operable solo por cuentas internas o en redes de ensayo; no se anuncia | Permitido |

Reglas:

1. Ningún otro valor es válido. Una etiqueta propia de una aplicación («pronto», «live», «preview», `publico: true`) es un defecto y se traduce a uno de estos cuatro antes de publicarse.
2. La disponibilidad de un módulo la calcula el registro a partir de sus dependencias. Una aplicación puede **bajar** la disponibilidad (por ejemplo, de `DISPONIBLE` a `USO_INTERNO`), nunca subirla.
3. Un activo o mercado sin clase ni serie decidida (por ejemplo HARV e IBS, v0.3 §14.4) se muestra `USO_INTERNO` hasta la decisión de la Junta (C7 del plan v0.3).

---

## 7 · Eventos

| Evento | Cuándo |
|---|---|
| `LicenseStatusChanged` | Toda transición de §5, en las dos naturalezas |
| `ModuleAvailabilityChanged` | Un módulo cambia de valor en la taxonomía de §6.1 por dependencia de licencia |
| `GovernanceAction` | La habilitación de un módulo (regla 3 de §6) |

Sus campos están en `eventos.json`. Desde draft-0.6 los emite `contracts/src/SFSPLicenseRegistry.sol` (`implementadoEnContratos: true`), junto con `LicenseRegistered` para el alta en `EN_TRAMITE`. Pruebas de aceptación T-140-01 a T-140-06: `contracts/test/20-registro-licencias.js` (T-140-01 se cubre como `isModuleAvailable == false`; el código de motivo `LICENCIA_NO_OTORGADA` lo pone el módulo consumidor, que todavía no está cableado).

---

## 8 · Diferencia con el código actual

No existe `SFSPLicenseRegistry`. Ningún módulo consulta hoy una licencia, el motor de elegibilidad no conoce la oferta exenta, y las aplicaciones usan etiquetas de disponibilidad propias (C7 del plan v0.3). Todo es fase 2.

---

## 9 · Pruebas de aceptación de la serie

1. **T-140-01**: Una operación de un módulo cuya licencia está `EN_TRAMITE` se rechaza con `LICENCIA_NO_OTORGADA`.
2. **T-140-02**: Un módulo con licencia `OTORGADA` pero antes de su fecha de vigencia sigue bloqueado.
3. **T-140-03**: Al pasar la licencia a `VENCIDA`, el módulo se bloquea sin ninguna acción humana y se emite `ModuleAvailabilityChanged`.
4. **T-140-04**: La dependencia se resuelve por titular: con `LIC_OG_ATS_B` `VIGENTE` y `LIC_AUCORP_ATS_B` `EN_TRAMITE`, `MOD_MERCADO_HIBRIDO` sigue bloqueado; con las dos al revés, `MOD_RED_PAGOS_OG` sigue bloqueado.
5. **T-140-05**: Habilitar un módulo sin autorización de gobernanza, o sin número de licencia, se rechaza.
6. **T-140-06**: La vista pública nunca devuelve `DISPONIBLE` ni `BETA` para un módulo con dependencia no vigente.
7. **T-140-07**: `MOD_MERCADO_HIBRIDO` con `LIC_AUCORP_ATS_B` `VIGENTE` y `LIC_AUCORP_CORRETAJE_C` `EN_TRAMITE` sigue bloqueado: las dependencias se combinan por conjunción.
8. **T-140-08**: Un depósito en el libro de órdenes con `LIC_AUCORP_CUSTODIA_G` no vigente se rechaza, y el intercambio en cadena desde la billetera propia no queda afectado.
9. **T-140-09**: Con la colocación de un activo sustentada en `AUT_OG_OFERTA_EXENTA`, una `SUBSCRIBE` de un sujeto sin atestación de alcance se rechaza con `FUERA_DE_ALCANCE_OFERTA_EXENTA`, aunque su país esté `PERMITIDO`.
10. **T-140-10**: Mientras `LIC_OG_ICL` no esté `VIGENTE`, ningún activo puede declarar la oferta pública como base de su colocación.
11. **T-140-11**: Un valor de disponibilidad fuera de `DISPONIBLE`, `BETA`, `PROXIMAMENTE` y `USO_INTERNO` se rechaza, y una aplicación no puede publicar un valor superior al que calcula el registro.
12. **T-140-12**: La vista pública de una licencia no vigente muestra «en trámite» y nunca devuelve `numero`, fecha estimada ni referencia a la autoridad como si estuviera otorgada.
