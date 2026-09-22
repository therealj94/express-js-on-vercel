# ADR-003: una fuente canónica por servicio; main no es el artefacto servido

- Estado: **PROPUESTA** (bloqueada por D11)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-900 Operations
- Decisiones Dxx que lo bloquean: **D11** (repositorios y release source por servicio). Relacionada: D12 (recursos de staging y aislamiento).

## 1. Contexto

Se observaron dos árboles capaces de compilar y publicar el backend de Veta: uno dentro del monorepo y otro en un repositorio separado (DECLARADO por la línea base; cuál publica el artefacto servido: **NO_VERIFICADO**). Se inspeccionaron dos snapshots de código en commits distintos; un snapshot de código no identifica por sí mismo el backend publicado.

El mismo patrón aparece en identidad, donde se describen dos implementaciones de Genesis ID (DECLARADO).

El riesgo concreto es escribir un parche, probarlo y publicarlo sobre el árbol que no es el que sirve tráfico. El parche queda "aplicado" en documentación y ausente en producción.

## 2. Decisión

1. Cada servicio tiene **exactamente un** repositorio canónico, una rama de release y un procedimiento de publicación, registrados en un manifiesto de servicios.
2. La procedencia se demuestra por la cadena completa: fuente, commit, build reproducible, digest de artefacto, configuración versionada sin secretos, despliegue y comprobación posterior. Falta cualquier eslabón, falta la prueba.
3. **`main` no es el artefacto servido.** Tampoco lo son un `version.json`, un pie de página, el nombre de una rama, el tamaño del árbol ni la salida de un agente. Son pistas; ninguna cierra la cuestión sin unión con build y despliegue.
4. Mientras D11 esté pendiente, ningún árbol se declara dueño del backend por conveniencia. El segundo árbol se conserva como espejo de sólo lectura o se retira de CI **después** de demostrar procedencia, nunca antes.
5. No se copia el monorepo para obtener un entorno llamado staging.
6. El manifiesto tiene una versión privada (repo, SHA, digest, configVersion, entorno, chainId, proveedor, almacenes, fuente de secretos, backup, RPO/RTO, rollback) y una versión pública minimizada que omite red interna, credenciales y topología.
7. No accedido no es caído. Un servicio del que no se obtuvo lectura se marca `NO_VERIFICADO` internamente y con una etiqueta pública que no induzca disponibilidad.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Declarar el monorepo canónico para todo y seguir | Coste inmediato bajo, coste latente alto: si el artefacto real viene del otro árbol, cada parche de seguridad publicado queda sin efecto y la evidencia dice lo contrario. Rechazada. |
| Fusionar los dos árboles ahora en uno | Exige resolver conflictos sobre código cuya procedencia no está establecida, con riesgo de perder el código que efectivamente corre. Requiere D11 igualmente. Rechazada como primer paso. |
| Archivar el árbol dudoso | Irreversible en la práctica si se elige mal. Un `grep` no demuestra que nadie dependa de él. Rechazada hasta prueba de no dependencia y respaldo verificado. |
| Congelar escrituras hasta D11 y determinar procedencia por build y digest (elegida) | Retrasa entregas sobre esos servicios. Coste aceptado. |

## 4. Consecuencias

- Hasta D11 no hay escritura ni despliegue sobre un árbol cuya procedencia sea dudosa. Se permite leer, construir y comparar digests.
- El repositorio `therealj94/sfsp` **no fue creado** por esta entrega y no se crea hasta D11.
- Se protegen `main` y las ramas de release: sin force push, sin merge masivo, sin borrado de ramas y sin archivar repositorios sin autorización y prueba de recuperación.
- El respaldo de ramas no cuenta como respaldo de bases de datos ni de fondos.
- La integración se hace por PR pequeños y probados.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| Durante el congelamiento, un fallo urgente del backend puede requerir publicar sin procedencia establecida. | Se acepta sólo con aprobación de operación nominal, alcance mínimo y registro del árbol usado. | Con D11 resuelta. |
| El manifiesto se desactualiza respecto de la realidad desplegada. | Se acepta con verificación periódica por digest. | Cada release pasa por P11, que compara digest declarado y digest servido. |
| El espejo de sólo lectura recibe commits por costumbre del equipo. | Se acepta con protección de rama y alerta. | Al retirar el espejo de CI tras D11. |

## 6. Bloqueo por decisión Dxx

**D11 bloquea:** escritura o despliegue sobre una copia dudosa, y la creación del repositorio nuevo. **D12 bloquea:** pruebas integradas o destructivas, porque no hay aislamiento acreditado.

## 7. Estado

**PROPUESTA.** Pasa a ACEPTADA cuando D11 registre, por servicio, el repositorio y la fuente de release aprobados.
