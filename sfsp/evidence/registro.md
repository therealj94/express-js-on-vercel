# Registro de evidencias

Tabla de evidencias reales. **Hoy está vacía.**

No está vacía por omisión: este entorno no tiene accesos de red, nodos, bases de datos ni credenciales, por lo que no se pudo producir ninguna evidencia por encima de `DECLARADO` o `NO_VERIFICADO`, y `VERIFICADO_RUNTIME` es inalcanzable desde aquí.

Cada fila corresponde a un `EvidenceRecord` completo, cuyo detalle se conserva junto a la ejecución. Ver `README.md` para los seis estados y `PLANTILLA-EvidenceRecord.json` para la estructura.

**Ninguna fila se añade por una afirmación en prosa.**

---

## Tabla

| evidenceId | taskId | requirementIds | findingIds | sourceSHA | artifactDigest | configVersion | environment | chainId | genesisHash | blockNumber | blockHash | testCommand | fixtureId | result | timestampUTC | reviewer | limitations | restrictedEvidenceRef |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

---

## Recuento por estado

| Estado | Registros |
|---|---|
| `DECLARADO` | 0 |
| `CODIGO_LEIDO` | 0 |
| `PROBADO_AISLADO` | 0 |
| `VERIFICADO_RUNTIME` | 0 |
| `NO_VERIFICADO` | 0 |
| `BLOQUEADO` | 0 |
| **Total** | **0** |

---

## Reglas de esta tabla

1. Una fila por `EvidenceRecord`. No se agrupan pruebas distintas en una fila.
2. `limitations` es obligatorio en todos los estados. Una fila sin limitaciones escritas está incompleta.
3. `reviewer` es obligatorio en `VERIFICADO_RUNTIME` y es una persona distinta de quien ejecutó la prueba.
4. Si el artefacto cambia, la fila **no se actualiza**: se añade una fila nueva con el `sourceSHA` y el `artifactDigest` nuevos.
5. Aquí no se escriben credenciales, datos personales, direcciones reales, endpoints ni valores económicos. La evidencia sensible se referencia con `restrictedEvidenceRef`.
