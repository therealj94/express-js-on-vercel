# SFSP · Social Financial System Protocol

**Estado:** `draft-0.3` · especificación ejecutable y implementación de referencia.
**No es** una versión desplegada, certificada ni autorizada para producción.

Este árbol es **código nuevo y aislado**. No modifica ningún producto existente del
monorepo (Veta Wallet, Genesis ID, ORDENSCAN, Ordenex, AuCorp, MyTokenPay, los nodos
ni los contratos legacy). Está escrito para poder extraerse tal cual a su propio
repositorio (`therealj94/sfsp`) con `git subtree split --prefix=sfsp` cuando exista
la aprobación D11, y para fusionarse con el resto sólo después de probarlo.

```
sfsp/
  spec/         SFSP-100 … SFSP-900 · la especificación normativa
  adr/          ADR-001 … ADR-012 · decisiones de arquitectura con alternativas
  sdk/          implementación de referencia TypeScript + pruebas T57–T68
  contracts/    Solidity: registro, emisión, gobierno, liquidación, migración
  indexer/      checkpoints, deduplicación y reconciliación de eventos
  dbnx-api/     casos de admisión, autorizaciones y reporting
  privacy/      prototipos y modelo de amenazas · DESACTIVADO por defecto
  deploy/       manifiestos por red · sin llaves, sin destinos inventados
  evidence/     plantillas y resultados sanitizados
  runbooks/     operación, incidentes, release y recuperación
  fixtures/     datos sintéticos etiquetados · nunca datos reales
  scripts/      utilidades de verificación offline
  DECISIONES-SFSP.json   copia legible por herramientas · valores no aprobados = null
  CONTRATO-INTERNO.md    tipos, IDs, eventos y códigos compartidos por todo el árbol
  BASELINE-SFSP.md       línea base observada del ecosistema y sus discrepancias
  COMO-FUSIONAR.md       el camino de vuelta: extraer, conectar y migrar sin que nadie note nada
  OPUS-START-SFSP-v3.0.md  cómo se trabaja aquí: reglas, permisos y cierre de sesión
```

## Qué está construido y probado, y qué no

| Capa | Estado | Evidencia |
|---|---|---|
| Especificación SFSP-100 a SFSP-900 | escrita · 13 documentos, 3.418 líneas | `spec/` |
| ADR-001 a ADR-012 | escritos · 4 aceptados, 8 propuestos a la espera de una decisión | `adr/` |
| SDK: cuenta, alias, binding, custodia, recuperación, migración, reservas, suministro | implementado | **48 pruebas** · incluye T57–T68 |
| Contratos Solidity: registro, gobierno, identidad, elegibilidad, activo regulado, emisión, vault, liquidación, migración, comisión | escritos y compilados | **74 pruebas** sobre EVM en proceso |
| Indexador de Orden Ledger | implementado | **38 pruebas** |
| API de DBNX: casos, autorizaciones, riesgo, divulgación, plantillas, copiloto | implementado | **62 pruebas** |
| Runbooks de operación e incidentes | escritos · 13 | `runbooks/` |
| **Total** | | **222 pruebas en verde, sin red ni credenciales** |
| Motores de reservas, commodity y oráculos | **NO implementados** | son P8 y dependen de D04 y D05 |
| Privacidad confidencial | **NO implementada** | `privacy/` contiene evaluación, no producto |
| Despliegue en 5534 o 5550 | **NO hecho** | requiere D11, D12 y la compuerta P11 |
| Lectura de la red, de llaves o de cuentas reales | **NO hecha** | no hay accesos en este entorno |

Ningún estado de esta tabla asciende por una afirmación en prosa. Lo que dice
«implementado» tiene una prueba que se puede volver a correr con el comando de abajo.

## Correr las pruebas

```bash
cd sfsp/sdk       && npm test     # lógica de cuenta, alias, binding, migración, reservas
cd sfsp/contracts && npm test     # contratos sobre una EVM en proceso
cd sfsp           && node scripts/verificar-todo.mjs   # las dos suites y el informe
```

Las pruebas no usan red, no leen nodos, no tocan bases de datos y no necesitan
credenciales. Todos los datos son sintéticos y están etiquetados en `fixtures/`.

## Las reglas que este árbol no puede romper

1. Ningún valor económico no aprobado se inventa: si falta, el resultado es `BLOCKED`
   y el campo en `DECISIONES-SFSP.json` es `null`. No hay *fallback* operativo.
2. Ninguna semilla, llave privada ni dato personal entra en código, pruebas, registros
   ni evidencia. Las pruebas de custodia usan material sintético generado en el acto.
3. `evaluate` y toda lectura de elegibilidad son sin escritura. El ejecutor vuelve a
   validar al liquidar.
4. Un error de lectura es `UNKNOWN`, nunca cero. Un fallo al descifrar es una excepción,
   nunca permiso para crear otra posición.
5. Registrar un activo *legacy* no le añade capacidades: `implementationProfile` y
   `enforcementScope` declaran exactamente qué se puede imponer y qué no.
6. Nada aquí autoriza un despliegue. Toda producción pasa por P11 con aprobación humana
   de alcance y caducidad.

## Relación con el plan maestro

Este árbol implementa las partes **P3** (especificación), **P4** (core y liquidación en
entorno aislado), la porción SFSP-130 de **P5**, y las piezas de **P7/P8/P9** que pueden
construirse y probarse sin accesos. Las partes P0, P1, P2, P6, P10 y P11 tocan sistemas
existentes y credenciales: quedan fuera de este árbol y se ejecutan en sus repositorios
con las aprobaciones correspondientes.
