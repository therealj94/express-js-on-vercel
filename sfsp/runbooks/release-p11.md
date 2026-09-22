# Runbook: puerta P11, compuerta obligatoria de cada release

**Alcance:** toda publicación a un entorno con datos, dinero o usuarios reales. Aplica a interfaz, backend, contratos, registros, banderas de funcionalidad, APIs y parámetros financieros. No existe una autorización global previa.

**Regla base:** una compuerta no se cierra con una captura de pantalla ni con un mensaje de un asistente. Se cierra con un checklist firmado y versionado.

---

## 1. Disparador

- Cualquier intención de publicar, activar una bandera, cambiar un parámetro o modificar un contrato en un entorno no desechable.
- También una reversión: revertir es un release.

## 2. Precondiciones

1. Existe un `releaseId` asignado y un propietario humano nominal.
2. El alcance está escrito y es acotado. "Todo lo pendiente" no es un alcance.
3. Las decisiones Dxx que habilitan **exactamente ese alcance** están aprobadas. Si alguna está pendiente, el release se reduce hasta no depender de ella o se detiene.
4. Existen pruebas ejecutadas sobre el mismo artefacto que se va a publicar.
5. Existe un artefacto previo **verificado** para revertir, identificado por digest.
6. El procedimiento de reversión es compatible con el esquema de datos vigente.
7. El manifiesto de servicios está actualizado para los servicios afectados.

## 3. Pasos

1. **Identificar.** Registrar `releaseId`, propietario, alcance, tickets y hallazgos cubiertos, `sourceSHA`, `artifactDigest`, `configVersion`, entorno y red (`chainId`, `genesisHash` cuando aplique). Revisar el estado de las decisiones que habilitan ese alcance.
2. **Verificar.** Comprobar pruebas, revisión de seguridad, manifiesto, servicios dependientes, capacidad del proveedor y procedimiento de reversión.
3. **Elegir el artefacto de reversión.** Se selecciona un artefacto previo **verificado**, por digest comprobado contra el registro de artefactos. **No se elige un identificador por estar escrito en un documento histórico.** Un identificador copiado de un plan antiguo no es una verificación.
4. **Aprobar.** Obtener aprobación humana de la operación. Para fondos, parámetros, permisos, llaves o derechos, aprobación especializada adicional con límite por acción. No se ejecuta desde una sesión de agente con permiso ambiguo.
5. **Inspeccionar los scripts antes de usarlos.** Todo script del repositorio que participe en el release (comparación con lo publicado, publicación, subida, despliegue del proveedor) **se lee completo antes de ejecutarlo**. Se comprueba qué destino toca, qué remoto usa, qué borra y qué asume. El comando exacto y el remoto real se fijan en este runbook por servicio antes de la ejecución. **No se ejecuta un comando de despliegue sólo porque aparezca en un documento previo.**
6. **Construir una vez y promover.** Se construye un único artefacto y se promueve el mismo entre entornos. No se reconstruye por entorno.
7. **Canario o lectura en sombra.** Antes de la activación amplia, comprobar inicio de sesión, permisos, datos visibles, errores, estado del ledger y de la red. Para un cambio financiero, ninguna verificación de canario usa dinero real sin autorización expresa y límites.
8. **Activar por fases** con criterio de avance escrito.
9. **Cerrar.** Informe al responsable con versión efectiva, pruebas, decisiones, resultados, discrepancias y límites.

## 4. Verificación

- El digest del artefacto servido coincide con el digest aprobado. Se comprueba, no se supone.
- `configVersion` efectiva coincide con la aprobada.
- Las pruebas de humo del alcance pasan en el entorno real.
- No hay incremento de errores por encima del umbral definido.
- La evidencia queda registrada como `EvidenceRecord` con `environment`, `sourceSHA`, `artifactDigest` y `configVersion`.

## 5. Criterio de parada

Se detiene el despliegue, se preserva el diario de operaciones y se reconcilia si ocurre cualquiera de estos:

- El digest servido no coincide con el aprobado.
- Aparece una discrepancia de saldos, de suministro o de conciliación.
- Hay transacciones en estado `UNKNOWN` sin resolver.
- Falla una dependencia crítica.
- Se detecta que el alcance depende de una decisión Dxx pendiente.
- Un script del release hace algo que no estaba en la lectura previa.

**Una reversión de la aplicación no revierte transacciones ni borra eventos.** Las compensaciones financieras exigen un procedimiento aparte, con su propia aprobación.

## 6. Qué NO hacer

- No publicar un sello o etiqueta de versión desacoplado del artefacto para aparentar procedencia.
- No ejecutar un comando de despliegue del proveedor sólo porque figura en un documento histórico.
- No elegir un artefacto de reversión por su identificador escrito en un plan.
- No usar una autorización de un release anterior: **la autorización P11 tiene alcance y caducidad**, y no habilita la siguiente.
- No reconstruir el artefacto entre entornos.
- No cerrar la compuerta con una captura ni con el resumen de un asistente.
- No desplegar sobre un árbol cuya procedencia sea dudosa mientras D11 esté pendiente.

---

## 7. Checklist firmable

Copiar por release, completar, firmar y versionar junto a la evidencia.

```
RELEASE P11 - CHECKLIST
-----------------------------------------------------------
releaseId .................. ____________________
propietario (nombre y rol) . ____________________
fecha y hora UTC ........... ____________________
alcance (una frase) ........ ____________________
tickets / hallazgos ........ ____________________

ARTEFACTO
sourceSHA .................. ____________________
artifactDigest ............. ____________________
configVersion .............. ____________________
entorno .................... ____________________
chainId .................... ____________________
genesisHash ................ ____________________
repositorio canónico ....... ____________________
rama de release ............ ____________________

DECISIONES
Dxx requeridas por el alcance ......... ____________________
todas aprobadas (SI/NO) ............... [ ]
si NO: alcance reducido o detenido .... [ ]

PRUEBAS Y SEGURIDAD
suite ejecutada sobre este digest ..... [ ]  ref: __________
revisión de seguridad ................. [ ]  ref: __________
escaneo de secretos sin hallazgos ..... [ ]
manifiesto de servicios actualizado ... [ ]

SCRIPTS
scripts del release leídos completos .. [ ]
comando exacto fijado ................. ____________________
remoto / destino real fijado .......... ____________________

REVERSIÓN
artefacto previo VERIFICADO ........... digest: __________
verificado por (nombre) ............... ____________________
compatible con el esquema vigente ..... [ ]
procedimiento probado ................. [ ]  fecha: ________

APROBACIONES
operación .......... nombre ______ rol ______ firma ______
especializada ...... nombre ______ rol ______ firma ______
                     (fondos, parámetros, permisos, llaves, derechos)
límites por acción ................... ____________________
caducidad de la autorización ......... ____________________

EJECUCIÓN
canario / sombra ejecutado ............ [ ]  resultado: ______
digest servido verificado ............. [ ]
configVersion efectiva verificada ..... [ ]
pruebas de humo ....................... [ ]

CIERRE
evidenceId ............................ ____________________
discrepancias ......................... ____________________
límites declarados .................... ____________________
firma del responsable ................. ____________________
-----------------------------------------------------------
```
