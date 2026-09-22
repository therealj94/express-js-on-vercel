# Runbook: compromiso de llaves

**Alcance:** llave de validador, llave de gobierno del protocolo, llave de firma de fondos de clientes o llave de un usuario. **Son modelos de amenaza distintos y no se tratan igual.**

**Regla base:** ante sospecha fundada se actúa como si el compromiso fuera cierto. Una llave sospechosa es una llave comprometida hasta que se demuestre lo contrario, no al revés.

---

## 1. Disparador

- Exposición del material o de su contraseña (ver `incidente-secreto-expuesto.md`).
- Firma no explicada, transacción no autorizada o movimiento anómalo.
- Compromiso del host, del módulo o del operador que la custodia.
- Salida de un operador con acceso, sin rotación previa.

## 2. Precondiciones

1. Está identificado el tipo de llave y qué poderes concretos tiene.
2. Existe separación entre custodia de validadores, custodia de gobierno y custodia de fondos de clientes (ADR-009).
3. Existe procedimiento de aprobación dual para rotaciones.
4. **D07, D10, D18 y D19 están pendientes**: fuera de fixtures sintéticos, los quórums y la política de recuperación no están fijados. Cualquier acción real requiere aprobación nominal.

## 3. Pasos

1. **Clasificar la llave** y enumerar sus poderes efectivos: qué contratos, qué montos, qué destinos, qué cuentas.
2. **Contener primero lo que se puede contener sin la llave comprometida.** Revocar sesiones, retirar el acceso del operador, aislar el host, cortar la conectividad del firmante.
3. **Si es llave de gobierno:** evaluar pausa de los poderes afectados por el procedimiento de gobierno, con el quórum restante y sin usar la llave sospechosa. Si la pausa requiere la llave comprometida, escalar de inmediato.
4. **Si es llave de validador:** aplicar `perdida-de-validador.md`. No reutilizar la llave. Reemplazo una entidad a la vez, sin sacrificar quórum.
5. **Si es llave de fondos de clientes:** detener las firmas de ese firmante, cuantificar la exposición por saldo alcanzable, y preparar el movimiento de activos a un destino controlado **sólo por las capacidades que realmente existan** para cada activo (ADR-005). Para lo que sea `NONE`, no hay ruta: se documenta y se comunica.
6. **Si es llave de un usuario:** ver `recuperacion-de-cuenta.md`, caso 2.
7. **Rotar** el material afectado con aprobación dual, respaldo verificado y lote canario. **Migrar cifrado no es rotar una llave comprometida**: si la llave está comprometida, cambiar el esquema de cifrado no basta.
8. **Preservar evidencia** durante todo el proceso: registros de firma, accesos, horarios, transacciones.
9. **Revisar el alcance histórico**: qué se firmó con esa llave desde la fecha probable de compromiso.
10. **Cerrar** con informe, causa, alcance, acciones y riesgos residuales.

## 4. Verificación

- La llave antigua ya no tiene poder: se comprueba que una operación firmada con ella es rechazada.
- La llave nueva funciona y está bajo el control previsto.
- No quedan sistemas configurados con la llave antigua.
- El inventario de firmas históricas está revisado y documentado.
- Para cada activo alcanzable se registró la capacidad real de recuperación y lo que se hizo.

## 5. Criterio de parada

Se escala al máximo nivel y se detiene la operación normal si:

- La llave comprometida controla fondos de clientes y la rotación no puede completarse.
- La pausa de un poder requiere la propia llave comprometida.
- Se detectan firmas no explicadas ya ejecutadas.
- El compromiso alcanza a más de una de las tres custodias separadas: indica un fallo de aislamiento, no un incidente puntual.

## 6. Qué NO hacer

- **No mover fondos con la llave sospechosa** salvo decisión expresa y documentada de que es la única vía y de que el riesgo se asume.
- No rotar sin preservar evidencia.
- No suponer que un cambio de contraseña de aplicación rota una llave.
- No retirar la clave de descifrado antigua antes de demostrar cobertura y recuperación de copias y expedientes.
- No borrar registros que no descifren para cerrar un porcentaje: conservan acceso a sus derechos visibles y abren expediente manual.
- No prometer al usuario recuperación de fondos cuando la capacidad del par (activo, perfil) sea `NONE`.
- No ensayar rotaciones de varias entidades a la vez.
