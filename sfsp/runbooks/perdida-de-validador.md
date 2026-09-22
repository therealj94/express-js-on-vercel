# Runbook: pérdida de un validador

**Contexto declarado:** la red principal opera con consenso QBFT y siete validadores (DECLARADO; número y participación efectivos: **NO_VERIFICADO** en este entorno). La tolerancia a fallos presupone participación y fallos no excesivamente correlacionados. El conteo de validadores no es por sí mismo una prueba de descentralización.

---

## 1. Disparador

- Un validador deja de proponer o de firmar durante más de un umbral definido.
- Cae el nodo, su almacenamiento, su red o su proveedor.
- Se sospecha compromiso del host o de la llave de nodo.

## 2. Precondiciones

1. Hay monitoreo independiente por validador: participación en rondas, altura, latencia y salud del host.
2. Existe el censo de validadores con responsable y ubicación por cada uno.
3. Está documentado el mapa de dependencias compartidas: cuenta de nube, región, DNS, credenciales, facturación y hardware.
4. La custodia de la llave de validador es distinta de la custodia de fondos de clientes (ADR-009).

## 3. Pasos

1. **Confirmar que es una pérdida y no un problema de observación.** Consultar al menos dos fuentes independientes de la propia red. Un panel que no carga no es un validador caído.
2. **Determinar cuántos validadores quedan participando** y si el consenso sigue produciendo bloques. Si no produce, aplicar `halt-de-cadena.md`.
3. **Clasificar la causa:** host, almacenamiento, red, proveedor, configuración o sospecha de compromiso. Ante sospecha de compromiso de la llave, aplicar también `compromiso-de-llaves.md` y **no reutilizar la llave**.
4. **No tocar el conjunto de validadores todavía.** Un cambio de conjunto es una acción de gobierno y requiere su aprobación.
5. **Recuperar el nodo caído** si la causa es técnica: restaurar el servicio, resincronizar desde un punto de control conocido y comprobar que alcanza la altura actual antes de reincorporarlo.
6. **Si la llave está comprometida o perdida:** preparar el reemplazo del validador, una entidad a la vez, mediante el procedimiento de gobierno correspondiente, sin sacrificar el quórum en ningún momento intermedio.
7. **Registrar** ventana de indisponibilidad, bloques afectados, causa y acciones.
8. **Revisar correlación.** Si el fallo viene de una dependencia compartida, abrir una acción para eliminarla. Varios validadores en el mismo proveedor y la misma región son un solo punto de fallo.

## 4. Verificación

- La red produce bloques a ritmo normal.
- El validador recuperado participa en rondas consecutivas y no está atrasado.
- El indexador alcanza la cabeza de cadena y no acumula retraso.
- El quórum de consenso nunca bajó del mínimo durante la intervención, o quedó documentado el período en que sí lo hizo.

## 5. Criterio de parada

Se detiene cualquier intervención y se escala si:

- La pérdida de un validador más dejaría al consenso sin quórum.
- Dos o más validadores caen en la misma ventana: es una señal de causa común, no de coincidencia.
- Se sospecha compromiso de una llave de validador.
- Recuperar el nodo exige restaurar desde una copia de procedencia no verificada.

## 6. Qué NO hacer

- **No cambiar el conjunto de validadores como reacción rápida a una caída.**
- No reutilizar la llave de un validador cuyo host pudo estar comprometido.
- No mover llaves de validador a la infraestructura que custodia fondos de clientes.
- No suponer que instalar un firmante remoto cambia por sí mismo la custodia de la llave de nodo: hay que comprobar el módulo de seguridad del cliente y su compatibilidad.
- No ensayar rotación o recuperación de varias entidades a la vez.
- No borrar los datos del nodo caído antes de determinar la causa.
