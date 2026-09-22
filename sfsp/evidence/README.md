# evidence/

## Para qué sirve esta carpeta

Aquí se anota **qué se probó, sobre qué artefacto y con qué límites**. Nada más. Es el registro que permite distinguir tres cosas que se confunden todo el tiempo:

1. **Requisito del proyecto:** lo que hace falta.
2. **Capacidad implementada:** lo que existe en un artefacto concreto.
3. **Evidencia de funcionamiento:** la prueba reproducible de que esa capacidad hace lo que dice, en un entorno identificado.

## Los seis estados de evidencia

| Estado | Qué significa | Qué hace falta para alcanzarlo |
|---|---|---|
| `DECLARADO` | Alguien lo afirma en un documento. Es el punto de partida, no un logro. | Una referencia al documento que lo afirma. |
| `CODIGO_LEIDO` | La capacidad está presente en un commit identificado. | `sourceSHA` y la ubicación exacta. Leer el código no demuestra que funcione. |
| `PROBADO_AISLADO` | Hay una prueba reproducible que pasa, **sin recursos reales**. | `sourceSHA`, `testCommand`, `fixtureId` y entorno. Datos sintéticos etiquetados. |
| `VERIFICADO_RUNTIME` | Se comprobó la instancia efectiva, con autorización. | `artifactDigest`, `configVersion`, entorno, `chainId`, `genesisHash`, `blockNumber`, `blockHash` y revisor. |
| `NO_VERIFICADO` | No hay evidencia. No significa que sea falso; significa que nadie lo comprobó. | Nada. Es el estado por defecto. |
| `BLOQUEADO` | Falta un requisito o una decisión que impide siquiera intentar la comprobación. | La referencia a lo que falta, por ejemplo una decisión `Dxx` o un acceso no concedido. |

### La regla

> **Ningún estado asciende por una afirmación en prosa.**

No asciende porque alguien escriba "listo", "funciona", "ya está probado" o "todo correcto". No asciende porque lo diga un informe, un acta, un mensaje o un asistente. **Asciende únicamente cuando existe el `EvidenceRecord` con los campos obligatorios de ese estado poblados.**

Corolarios:

- Un estado puede **bajar**. Si el artefacto cambia, la evidencia que lo respaldaba ya no aplica: la evidencia está atada a un `sourceSHA` y a un `artifactDigest` concretos.
- `NO_VERIFICADO` es una respuesta legítima y frecuente. Es preferible a una afirmación sin respaldo.
- `PROBADO_AISLADO` **no implica** `VERIFICADO_RUNTIME`. Una prueba que pasa en aislamiento no dice nada sobre producción.
- `CODIGO_LEIDO` **no implica** que el código leído sea el que corre. Eso lo dice `artifactDigest`, no `sourceSHA`.
- La cobertura de pruebas no equivale a auditoría.
- La evidencia técnica **no concede permiso jurídico** ni sustituye la custodia física de nada.

## Estado actual de este entorno

Este entorno **no tiene accesos**: no hay red, no hay nodos, no hay bases de datos y no hay credenciales.

Por lo tanto, ninguna afirmación sobre el ecosistema puede superar `DECLARADO` o `NO_VERIFICADO` desde aquí, y `VERIFICADO_RUNTIME` es inalcanzable en esta sesión. `registro.md` está vacío por esa razón, no por omisión.

## Archivos

| Archivo | Qué es |
|---|---|
| `PLANTILLA-EvidenceRecord.json` | La estructura del registro, según la sección 2.5 del contrato interno. Todo en `null`, más un ejemplo sintético marcado. |
| `registro.md` | La tabla donde se anotan las evidencias reales. Hoy sólo tiene encabezados. |

## Qué nunca entra aquí

- Credenciales, llaves, semillas y contraseñas.
- Datos personales, documentos y biometría.
- El vínculo entre una cuenta y una dirección.
- Direcciones reales y endpoints privados.
- Valores económicos.

La evidencia sensible se referencia con `restrictedEvidenceRef`; su contenido vive en el almacén restringido. **La versión publicable de la evidencia no contiene credenciales ni vínculos entre identidad y dirección.**

## Cómo se añade una evidencia

1. Copiar el bloque `plantilla` de `PLANTILLA-EvidenceRecord.json`.
2. Poblar **todos** los campos obligatorios del estado que se reclama.
3. Escribir `limitations` con lo que la prueba **no** demuestra. Un registro sin limitaciones escritas está incompleto.
4. Añadir una fila a `registro.md`.
5. Si el estado es `VERIFICADO_RUNTIME`, indicar el revisor, que es una persona distinta de quien ejecutó la prueba.
