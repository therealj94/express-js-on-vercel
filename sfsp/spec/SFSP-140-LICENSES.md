# SFSP-140 · Licenses

| Campo | Valor |
|---|---|
| Serie | SFSP-140 · Licenses (registro de licencias) |
| Estado | `draft-0.4` (serie nueva, nace del borrador SFSP v0.2 §6) |
| Fuente de tipos | Este documento. Los tipos pasan a `CONTRATO-INTERNO.md` cuando exista código |
| Parte del plan maestro | P3 (spec). El código es fase 3 de `../PLAN-SFSP-v0.2-2026-09-23.md` |
| Decisiones que la bloquean | D13 (autoridad y jurisdicción), **titularidad de las licencias compartidas** (ATS Clase B y Non-Banking Lender, v0.2 §18), D07 (quién firma la habilitación) |

**Qué NO afirma este documento:** no afirma que ninguna licencia esté otorgada. Todas las del cuadro de §3 están **en trámite** o **por confirmar**. No da ningún número de licencia, y no convierte ninguna función en disponible.

---

## 1 · Para qué existe

Las licencias no están todas en la misma entidad. Un módulo operado por Orden Global puede depender de una licencia cuyo titular es Au Corp. Por eso el protocolo lleva un registro de licencias y **cada módulo declara de qué licencia depende**. Una operación de un módulo cuya licencia no esté otorgada y vigente **se rechaza por código**. No basta con que una pantalla la esconda.

---

## 2 · El registro

| Campo | Contenido |
|---|---|
| `licenseId` | Identificador estable |
| `tipo` | Por ejemplo: «Custodia Clase G», «FinTech ATS Clase B» |
| `titular` | Entidad titular (Genesis ID corporativo) |
| `autoridad` | Autoridad que la otorga (por ejemplo, RFSA) |
| `jurisdiccion` | Jurisdicción |
| `estado` | Ver §4 |
| `vigencia` | Desde, hasta |
| `numero` | Número de licencia. **`null` mientras no esté otorgada** |
| `referenciaDocumental` | Hash del documento de otorgamiento |

Cada **módulo** declara `dependeDe: licenseId[]`. La dependencia se resuelve **por titular, no por operador del módulo**.

---

## 3 · Dependencias declaradas en el v0.2

| Módulo | Licencia de la que depende | Titular |
|---|---|---|
| Redención física de metal (SFSP-300) | Custodia Clase G | AuBank, línea de Au Corp. |
| Liquidación contra moneda fiduciaria (SFSP-500) | FinTech ATS Clase B | **Por confirmar**: figura en la ruta de Ordenex y en la de GoldeX Swap |
| Operaciones de crédito | Non-Banking Lender | **Por confirmar**: figura en la ruta de AuBank y en la de Orden Global |
| Admisión y emisión de securities (SFSP-200) | Investment Company License | Orden Global |
| Oferta de los activos notificados | Notificación de oferta exenta ante RFSA | Orden Global |

Las dos filas «por confirmar» se resuelven **antes de la versión 1**, porque deciden qué entidad queda impedida de operar el módulo si la licencia no se obtiene.

---

## 4 · Estados de una licencia

```
[ EN_TRAMITE ] --otorgamiento--> [ OTORGADA ] --inicio de vigencia--> [ VIGENTE ]
                                                                        |   |   |
                                          suspensión <------------------+   |   +--> vencimiento --> [ VENCIDA ]
                                              |                             |
                                              v                             +--> revocación --> [ REVOCADA ]
                                        [ SUSPENDIDA ] --levantamiento--> [ VIGENTE ]
```

Solo `VIGENTE` habilita un módulo. Los demás estados, incluido `OTORGADA` antes de su fecha de inicio, **lo bloquean**.

---

## 5 · Reglas

1. **El registro interno puede contener licencias en trámite**, porque hace falta para planificar.
2. **La vista pública nunca muestra como disponible una función que dependa de una licencia no vigente.** Cuando muestra el estado, usa la expresión «en trámite». Anunciar o insinuar una licencia que no se tiene es una infracción en la mayoría de jurisdicciones, aunque la licencia vaya a obtenerse.
3. **Habilitar un módulo al obtener la licencia es una acción de gobernanza registrada** (SFSP-800), con código de motivo `LICENCIA_OTORGADA` y el número de licencia. **La especificación no se modifica**: lo único que cambia es un parámetro publicado.
4. La vencida, suspendida o revocada **cierra el módulo sola**, sin acción humana, y emite `ModuleAvailabilityChanged`.
5. **Taxonomía única de disponibilidad** en todo el sistema (interfaz pública, catálogo de productos y documentos): `DISPONIBLE`, `BETA`, `PROXIMAMENTE`, `USO_INTERNO`. Nada que dependa de una licencia no vigente puede estar en `DISPONIBLE` ni en `BETA`.

---

## 6 · Eventos

| Evento | Cuándo |
|---|---|
| `LicenseStatusChanged` | Toda transición de §4 |
| `ModuleAvailabilityChanged` | Un módulo se habilita o se bloquea por dependencia de licencia |

Sus campos están en `eventos.json`, con `implementadoEnContratos: false` hasta que exista el contrato.

---

## 7 · Pruebas de aceptación de la serie

1. **T-140-01**: Una operación de un módulo cuya licencia está `EN_TRAMITE` se rechaza con `LICENCIA_NO_OTORGADA`.
2. **T-140-02**: Un módulo con licencia `OTORGADA` pero antes de su fecha de vigencia sigue bloqueado.
3. **T-140-03**: Al pasar la licencia a `VENCIDA`, el módulo se bloquea sin ninguna acción humana y se emite `ModuleAvailabilityChanged`.
4. **T-140-04**: La dependencia se resuelve por titular: un módulo operado por Orden Global que depende de una licencia de Au Corp. queda bloqueado si esa licencia de Au Corp. no está vigente.
5. **T-140-05**: Habilitar un módulo sin autorización de gobernanza, o sin número de licencia, se rechaza.
6. **T-140-06**: La vista pública nunca devuelve `DISPONIBLE` ni `BETA` para un módulo con dependencia no vigente.
