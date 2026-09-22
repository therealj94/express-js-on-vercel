# ADR-010: compatibilidad de nombres; prohibido el reemplazo global en bytes firmados

- Estado: **ACEPTADA**
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-100, SFSP-700
- Decisiones Dxx que lo bloquean: ninguna. **D00** condiciona el lanzamiento público de la marca y el uso exclusivo de la sigla, no esta regla de compatibilidad.

## 1. Contexto

El proyecto adopta un nombre documental nuevo, SFSP. Existe documentación, código, dominios, carpetas, identificadores de activo y estructuras firmadas que usan el nombre anterior, OGFP.

La tentación es hacer una sustitución global de texto. Sobre un repositorio de documentación es inofensivo. Sobre bytes que ya fueron firmados, es destructivo.

Estado marcario: nombre de trabajo. El clearance sigue pendiente (D00) y el uso público de la sigla ya existe (DECLARADO).

## 2. Decisión

### 2.1 Prohibición dura

**Queda prohibido un reemplazo global OGFP a SFSP en:**

1. **Bytes firmados.** Cualquier payload cuyo texto entre en el cálculo de una firma ya emitida. Cambiar un carácter cambia el hash y **invalida la firma**.
2. **Dominios EIP-712.** El campo `name` del dominio de firma forma parte del separador de dominio. Cambiarlo invalida todas las firmas existentes contra ese dominio y hace que las firmas nuevas no verifiquen contra los contratos desplegados.
3. **`assetId` ya asignados.** Un identificador de activo es estable por definición y no depende de la clasificación jurídica, que puede cambiar. Un identificador ya emitido se conserva.
4. **Despliegues existentes.** Direcciones, bytecode, metadatos de compilación y parámetros inmutables no se tocan por un cambio de nombre.
5. **Identificadores de operación, autorización, caso, migración y evidencia** ya emitidos.

### 2.2 Los nombres viejos quedan como alias

El nombre anterior no se borra: se conserva como **alias de compatibilidad**, en `AssetPassport.aliases` para activos y en un registro de alias de nomenclatura para el resto. Un alias no crea un activo nuevo ni un derecho nuevo.

Caso concreto registrado: un nombre de producto propuesto y un símbolo legacy observado pueden referirse al mismo instrumento. **Corregir un nombre no crea un token nuevo.** El vínculo se expresa como alias sujeto a verificación de instrumento, unidad y derechos.

### 2.3 Dónde sí se cambia el nombre

- Documentación nueva.
- Interfaz de usuario, sujeta a D00 para el uso público.
- Nombres de módulos y paquetes nuevos.
- Carpetas, endpoints y dominios existentes se mantienen hasta una **migración de alias versionada**, con período de convivencia y redirección declarada.

### 2.4 Versionado explícito

Toda estructura firmada lleva `schemaVersion`. Un cambio de nombre que afecte a una estructura firmada es un cambio de versión de esquema con su propia migración, no una sustitución de texto.

### 2.5 Procedimiento antes de cualquier renombrado masivo

1. Listar todos los lugares donde el literal participa en un hash, una firma o un identificador emitido.
2. Excluirlos del cambio de forma explícita y documentada.
3. Ejecutar el cambio sólo sobre el resto.
4. Verificar que las firmas y autorizaciones existentes siguen validando.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Sustitución global de texto en todo el árbol | Invalida firmas, rompe la verificación EIP-712 contra contratos desplegados y desconecta identificadores de activo de su historial. Coste potencialmente irreversible. Prohibida. |
| Redesplegar los contratos con el dominio nuevo | Obliga a migrar todas las posiciones (ADR-008) por un motivo de nomenclatura. Coste desproporcionado. Rechazada. |
| Mantener sólo el nombre antiguo en todo | Evita el riesgo técnico y renuncia al reposicionamiento. Rechazada. |
| Nombre nuevo hacia adelante y alias de compatibilidad hacia atrás (elegida) | Convivencia de dos nomenclaturas durante un período, con confusión posible y necesidad de una tabla de equivalencias mantenida. Coste aceptado. |

## 4. Consecuencias

- Coexisten dos nomenclaturas y hace falta una tabla de equivalencias versionada y pública internamente.
- Se conservan los nombres de producto existentes para transparencia y mercado; su renombrado público depende de función y disponibilidad probadas.
- Los documentos históricos se conservan: no se reescriben firmas, contratos ni derechos ya emitidos.
- Cualquier herramienta de reemplazo masivo se ejecuta con lista de exclusión explícita y revisión de diff.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| La convivencia de nombres confunde a usuarios y a soporte. | Se acepta mitigar con tabla de equivalencias y texto en las fichas. | Al cierre de la migración de alias versionada. |
| El clearance de marca podría obligar a otro nombre. | Se acepta que el nombre actual es de trabajo y que esta regla de compatibilidad se aplicaría igual a un tercer nombre. | Con D00 resuelta. |
| Puede existir un literal del nombre antiguo dentro de un payload firmado no inventariado. | Se acepta hacer el inventario antes de cualquier reemplazo. | Antes del primer renombrado masivo. |

## 6. Bloqueo por decisión Dxx

Ninguna. **D00** bloquea el lanzamiento de marca y el uso exclusivo de la sigla; no bloquea la redacción interna ni los nombres de carpeta, ni esta prohibición, que es más restrictiva que cualquier resultado de D00.

## 7. Estado

**ACEPTADA.** Es una restricción de seguridad sobre datos ya firmados, no una preferencia de estilo.
