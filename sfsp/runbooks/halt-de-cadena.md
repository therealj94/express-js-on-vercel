# Runbook: halt de cadena

**Definición:** la red deja de producir bloques o deja de finalizar. No es lo mismo que un RPC caído ni que un explorador atrasado.

---

## 1. Disparador

- La altura de bloque no avanza durante más de un umbral definido, observada desde al menos dos fuentes independientes.
- El consenso no alcanza quórum.
- Se detecta divergencia de estado entre nodos a la misma altura.

## 2. Precondiciones

1. Existe monitoreo de altura y de finalidad independiente de la interfaz de usuario.
2. Está identificado quién puede intervenir sobre cada validador.
3. Existe un canal de comunicación con los responsables que no dependa de la propia plataforma.
4. Los servicios dependientes saben distinguir "no avanza" de "error de lectura".

## 3. Pasos

1. **Confirmar el halt** desde dos o más nodos independientes y desde una fuente externa si existe. Registrar la última altura y el último hash de bloque conocidos.
2. **Congelar las escrituras dependientes.** Detener envío de transacciones, liquidaciones, emisiones, releases y migraciones. Las operaciones en vuelo quedan en estado `UNKNOWN`, no en `FAILED`.
3. **Comunicar el estado** con precisión: la red no avanza, las transacciones enviadas no están perdidas y no se deben reenviar. No prometer un tiempo de restablecimiento.
4. **Diagnosticar**: participación de validadores, versiones de cliente, divergencia de configuración, agotamiento de recursos, red entre validadores, cambio reciente de configuración o de versión.
5. **Recuperar por la causa encontrada.** Si es falta de participación, aplicar `perdida-de-validador.md` por cada uno. Si es divergencia de versión o de configuración, alinear y reiniciar de forma coordinada.
6. **Reanudar de forma controlada**, verificando que la cadena reanudada continúa la historia conocida: la altura y el hash previos al halt deben seguir presentes.
7. **Reconciliar antes de reabrir escrituras.** Comparar el diario de operaciones con el estado de la cadena: cada operación en `UNKNOWN` se resuelve leyendo el recibo, no reintentando.
8. **Reabrir** por fases, empezando por lectura, luego escrituras no financieras y por último las financieras.

## 4. Verificación

- La altura avanza de forma sostenida y la finalidad se alcanza.
- La historia previa al halt está intacta: mismos hashes a las mismas alturas.
- El indexador reconstruyó sin huecos y sin duplicados.
- Cero operaciones en `UNKNOWN` sin resolver.
- Los saldos conciliados coinciden con los de antes del halt más las operaciones confirmadas.

## 5. Criterio de parada

Se detiene la reanudación y se escala si:

- La cadena reanudada no contiene la historia previa: eso es una reorganización profunda o una cadena distinta, y es un incidente mayor.
- Hay divergencia de estado entre validadores a la misma altura.
- Una operación financiera quedó parcialmente ejecutada y no se puede determinar su estado final.

## 6. Qué NO hacer

- **No reenviar transacciones por si acaso.** Un estado incierto se reconcilia, no se vuelve a pagar.
- No marcar como fallidas transacciones cuyo estado no se pudo leer. Un error de lectura es `UNKNOWN`, nunca cero ni fallo.
- No mostrar saldo cero en la interfaz porque el RPC no responde. Se muestra la última lectura con marca de desactualizada y se bloquean las decisiones dependientes.
- No modificar el génesis ni las reglas de consenso para salir de un halt.
- No borrar ni reinicializar la base de datos de un validador sin preservar copia para diagnóstico.
- No anunciar una hora de restablecimiento sin diagnóstico.
