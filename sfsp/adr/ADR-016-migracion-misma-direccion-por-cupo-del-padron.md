# ADR-016: Migración a la misma dirección por cupo del padrón

- Estado: **PROPUESTO**
- Fecha: 2026-09-26 (UTC)
- Serie relacionada: SFSP-700 Migration §0.3 · SFSP-410 (cupo y cuentas internas) · SFSP-150 (filtro de transacciones)
- Decisiones que lo bloquean: **D26** (migración de los tokens actuales y tratamiento de los heredados). Además D09 (bloque de corte, `migrationId` y ratio por activo), D25 (cuentas internas), D24 (topes del instrumento) y D07 (quórums)
- Origen: borrador SFSP v0.3 §14.3 (documento interno, fuera del repositorio); C9 de `../PLAN-SFSP-v0.3-2026-09-26.md`; REV-410-12 y REV-410-17 de `../auditoria/REVISION-SFSP410-2026-09-26.md`; «Alternativa evaluada» de `../migracion-410/LEEME.md`

## 1. Contexto

La migración de la 8532 a la 5550 ya ocurrió con el génesis del 25-ago-2026. Lo que queda es pasar los contratos heredados de la 5550 (AUKA, AGKA, ONDK y los que la Junta decida) a contratos conformes a SFSP **dentro de la misma cadena**.

SFSP-700 se escribió para una migración entre cadenas: `SFSPMigrationRegistry` publica la raíz del padrón y cada tenedor **reclama** con una autorización firmada por el atestador (`mintForMigration`, `MigrationClaimed`). El v0.3 §14.3 dice que, sin cambio de cadena, **el reclamo por firma deja de ser necesario porque la equivalencia se asigna a la misma dirección**.

Además, la revisión adversaria encontró que la ruta del registro acuña directamente en el activo sin pasar por `_mintTo`: no mira las cuentas internas ni los topes de stock y acumulado (REV-410-12). La regla R1 de SFSP-410 («ninguna emisión, por ninguna ruta, a una cuenta interna») hoy solo la protege el constructor del padrón, fuera de la cadena.

## 2. Decisión

1. **Camino normativo de SFSP-700:** por cada activo, **una** orden de gobierno `SET_MINT_BUDGET` cuyo cupo es exactamente el padrón, y el emisor acuña a cada tenedor su saldo **en la misma dirección** con `mintOnDemand`.

   | Campo del cupo | Valor |
   |---|---|
   | Monto por periodo | `S0` del padrón (suma de los saldos con dirección; las claves sin dirección no entran) |
   | Máximo por operación | El mayor saldo del padrón |
   | Periodo | Tan largo que toda la ventana cae en un solo periodo |
   | Vigencia | Fin de la ventana de migración (días, no meses) |
   | `termsDocRoot` | Raíz de Merkle del padrón |
   | `paymentRef` por tenedor | `keccak256("MIGRACION\|<assetId>\|<dirección>")`, con `assetId` y dirección en hex y minúsculas |
   | `evidenceRoot` | La misma raíz del padrón |

2. **El heredado se bloquea con el filtro de transacciones** desde el bloque de corte (SFSP-150). La emisión por padrón es la ejecución del modo `FROZEN_SNAPSHOT`: congelación eficaz antes de acuñar e instantánea final.
3. **Cierre obligatorio:** `revokeMintBudget(assetId, "MIGRACION_FIN")` al terminar o al vencer, y **conciliación publicada**: cada `MintOnDemand` de la ventana casa con una hoja del padrón y su prueba, `paymentRef` se recalcula desde el destino, la suma es ≤ `S0`. Un evento que no case es incidente (pausa y revocación).
4. **El registro por reclamo queda como excepción**, para lo que no puede asignarse a la misma dirección: claves sin dirección, direcciones que son contratos con otro beneficiario, y direcciones cuyo control se perdió (SFSP-700 §0.3).
5. **Precondiciones por activo:** conciliación del supply no ubicado cerrada para AUKA (9.823,01) y ONDK (804,5) (SFSP-700 §0.5); topes del instrumento fijados contando `S0`; cada beneficiario cruzado contra las cuentas internas y contra la política `MINT` del activo nuevo.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Registro por reclamo (`SFSPMigrationRegistry`) como camino general | Contradice el v0.3 §14.3 (exige una acción del tenedor que no hace falta sin cambio de cadena); una orden `MIGRATION_CLAIM` por persona; no aplica R1 ni los topes (REV-410-12). Se conserva para las excepciones |
| Reforzar el registro para que consulte las cuentas internas y los topes | Cierra REV-410-12 pero mantiene el reclamo por firma y un contrato más que auditar en la ruta principal. Queda como opción si la Junta no acepta la pérdida de verificación individual en cadena |
| Una orden `MINT` de gobierno por tenedor | Correcta y verificada una a una, pero inviable con más de un centenar de tenedores por activo. Se usa solo para saldos desproporcionados, fuera del cupo |
| Acuñar todo a una cuenta interna y repartir por transferencia | Viola R1 y mezcla inventario interno con saldos de usuarios. Rechazada |

## 4. Consecuencias

A favor:

- Aplica R1 (cuentas internas), R3 (elegibilidad), R8 (topes) y R9 (pausa), porque pasa por `_mintTo`.
- `paymentRef` por (activo, dirección) es un anulador en cadena: impide el doble cobro en reintentos, en rondas posteriores y entre saldo por dirección y saldo por ranura.
- Los firmantes aprueban **ese** padrón y **ese** total, con espera. Una aprobación por activo.
- No necesita código nuevo en los contratos: `setMintBudget`, `mintOnDemand` y `revokeMintBudget` ya existen y tienen pruebas.

En contra, con su mitigación:

1. **El reparto individual no se verifica en cadena.** El contrato limita el total y el máximo por operación, no la prueba de Merkle. Queda detectable, no impedido. Mitigación: ventana corta, máximo por operación igual al mayor saldo, conciliación publicada y revocación al terminar.
2. **Ocupa el único cupo del activo**, y fijar el comercial después reinicia el consumo del periodo. Orden fijo: migración, revocación, cupo comercial.
3. **Un saldo es una operación**: un saldo desproporcionado va por orden `MINT` individual.
4. **Consume el tope acumulado**: los topes del instrumento se fijan contando `S0`.
5. **No emite los eventos de migración de SFSP-700** (`MigrationClaimed`). El indexador tiene que reconocer la migración por la `paymentRef` con prefijo `MIGRACION` y registrar la conciliación con `ConciliationRecorded` (fase 2, punto 8 del plan v0.3).
6. **Se evalúa la política `MINT`**, no `MIGRATE_CLAIM`: la política `MINT` del activo nuevo tiene que admitir a los tenedores del padrón.
7. **El inventario interno no se migra por este camino** (R1). Si un activo conforme de la serie 300 necesita tesorería (SFSP-300 §0.2), se acuña aparte, por orden de gobierno, con su propia aprobación. Esto es parte de D26.

## 5. Qué hace falta para pasar a ACEPTADO

1. Firma de D26 por la Junta, con ratificación del catálogo de heredados (SFSP-700 §0.4).
2. Filtro de transacciones probado en la 5534 con los siete validadores (SFSP-150).
3. Conciliación de AUKA y ONDK cerrada (SFSP-700 §0.5).
4. Reconocimiento de la migración y conciliación publicada en el indexador, con pruebas T-700-21 a T-700-29.
