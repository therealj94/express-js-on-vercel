# Runbook: restauración de base de datos

**Regla base:** una restauración recupera una base, **no recupera dinero ni revierte transacciones de cadena**. Después de restaurar hay siempre una reconciliación, porque el mundo siguió avanzando mientras la copia estaba congelada.

---

## 1. Disparador

- Pérdida o corrupción de datos.
- Necesidad de recuperar un estado anterior tras un incidente.
- Ensayo programado de recuperación.

## 2. Precondiciones

1. Existe una copia de respaldo con procedencia verificada e integridad comprobada.
2. Están definidos el objetivo de punto de recuperación y el objetivo de tiempo de recuperación, **medidos**, no estimados a partir de cifras históricas.
3. Existe un entorno de restauración aislado. **Los datos reales sólo se restauran en un enclave de recuperación autorizado y aislado.** Un entorno de pruebas de agentes recibe datos sintéticos.
4. Está claro qué sistemas dependen de esa base y qué operaciones ocurrieron después del punto de la copia.

## 3. Pasos

1. **Detener las escrituras** sobre la base afectada. Si hay servicios que dependen de ella, ponerlos en modo lectura o detenerlos. **En producción, un servicio sin su base requerida no arranca usando almacenamiento local efímero.**
2. **Preservar el estado dañado** antes de sobrescribirlo. Es evidencia y puede contener datos posteriores al respaldo que haya que recuperar a mano.
3. **Verificar la copia**: integridad, fecha, alcance y procedencia. Una copia que no se puede verificar no se restaura.
4. **Restaurar en el enclave aislado**, nunca directamente sobre producción como primer intento.
5. **Determinar el hueco**: qué ocurrió entre el punto de la copia y el momento del incidente. Reconstruir desde el diario de operaciones, los eventos de cadena y los registros del proveedor de pagos.
6. **Reconciliar** antes de reabrir: operaciones, saldos internos contra cadena, estados de pago contra el proveedor, y evidencia.
7. **Promover** la base restaurada y reconciliada, con aprobación, y reabrir por fases.
8. **Destruir las copias de prueba** conforme a la política, y registrar la destrucción.

## 4. Verificación

- La base restaurada arranca y pasa sus comprobaciones de integridad.
- El objetivo de punto de recuperación real se mide y se registra, no se declara.
- La conciliación no deja diferencias sin explicar.
- Cero operaciones duplicadas tras la reapertura: la idempotencia por `operationId` se verifica con una prueba.
- Los datos personales y el material sensible no salieron del enclave.

## 5. Criterio de parada

Se detiene y se escala si:

- La copia no verifica integridad o su procedencia es dudosa.
- El hueco contiene operaciones financieras que no se pueden reconstruir.
- La reconciliación arroja diferencias en saldos de clientes.
- Restaurar exigiría sobrescribir datos posteriores al respaldo que no están en ningún otro sitio.

## 6. Qué NO hacer

- **No restaurar datos reales en un entorno de pruebas o de agentes.** Cambiar direcciones de correo no anonimiza una base con llaves, biometría o movimientos reales.
- No tratar una copia de ramas de control de versiones como respaldo de bases o de fondos.
- No restaurar directamente sobre producción sin ensayo previo.
- **No usar una restauración para "revertir" una transacción de cadena.** No existe esa operación.
- No reabrir escrituras antes de reconciliar.
- No dar por probado un procedimiento de recuperación que nunca se ejecutó completo.
