# ADR-014: AU-RA FP opera el protocolo para todas las empresas, y no aprueba nada monetario

- Estado: **PROPUESTA**
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-800 Governance · `operador/AU-RA-FP.md`
- Decisiones Dxx que lo bloquean: **D20** (marca), **D21** (estructura societaria y contratos de servicio). D07 y D11 para ponerlo en producción.

## 1. Contexto

SFSP-800 repartía la ejecución técnica a «Orden Global (tecnología)». La dirección fija ahora otra estructura: Orden Global es dueña de Veta Wallet, de la cadena y de la tesorería; AuCorp es dueña de Ordenex; DBNX es una empresa aparte que audita y publica datos de los activos; y un operador, hasta ahora llamado ULTRON FP, presta los servicios del protocolo a todas y vigila que se cumpla.

Con la estructura vieja, la dueña de la tesorería era también quien ejecutaba la parte técnica de su propia liberación. Con la nueva, el operador es una parte distinta de cada empresa a la que sirve.

El nombre «Ultron» es una marca de un tercero. Se cambia a **AU-RA FP** (*Financial Protocol*).

## 2. Decisión

1. **AU-RA FP ocupa el rol que SFSP-800 daba a «Orden Global (tecnología)»:** comprueba la autorización y ejecuta. No aprueba monetariamente.
2. **Los asistentes de AU-RA FP** (la asistente AU-RA en sus canales, y el copiloto de admisión de DBNX) siguen bajo la regla de SFSP-800 para asistentes: preparan análisis; no son aprobadores.
3. **DBNX es la única que escribe pasaportes**, y publica los datos públicos de cada activo.
4. **Cada empresa es cliente de AU-RA FP** y sólo usa los servicios contratados.
5. **El cumplimiento se asegura en tres capas**: por construcción, por separación de funciones comprobada en código, y por vigilancia con evidencia. Sin evidencia, `NO_VERIFICABLE`, nunca `CUMPLE`.
6. **AU-RA FP no se audita a sí mismo.** Sus informes los revisa DBNX o un auditor independiente.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Que cada empresa opere su propia copia de SFSP | Tres directorios de cuentas que no se hablan, tres interpretaciones de las mismas reglas, y un `SF-` de Veta que Ordenex no sabe resolver. Rechazada. |
| Que el operador también apruebe (p. ej. que AU-RA FP decida liberaciones) | Concentra en una sola mano operar y aprobar, y contradice SFSP-800. Rechazada. |
| Que DBNX, además de auditar, opere | El auditor pasaría a auditarse a sí mismo. Rechazada. |
| Mantener el nombre ULTRON FP | Riesgo de marca ajena. Rechazada. |

## 4. Consecuencias

- SFSP-800 §1 cambia de «Orden Global (tecnología)» a «AU-RA FP (operador)», y aparecen Orden Global y AuCorp como dueñas de lo suyo.
- Se añaden D20 y D21 al registro de decisiones.
- `sdk/src/operador/` implementa el registro del ecosistema, el catálogo de servicios, la separación de funciones y el informe de cumplimiento.
- El nombre **AU-RA** coincide con la asistente que ya existe. Se asume que pasa a ser el canal público de AU-RA FP. Si no, hay que cambiar uno de los dos nombres.
- La infraestructura sigue llamándose Ultron hasta una migración coordinada.
