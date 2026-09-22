# Runbook: rollback de aplicación

**Regla base y advertencia principal: un rollback de la aplicación no revierte transacciones ni borra eventos.** Devuelve el código a una versión anterior. Todo lo que ocurrió en la cadena, en el proveedor de pagos o en la base de datos sigue ocurrido. Las compensaciones financieras exigen un procedimiento aparte, con su propia aprobación.

---

## 1. Disparador

- Un release introduce un fallo que afecta a usuarios, datos o dinero.
- Aumento de errores por encima del umbral tras una activación.
- Comportamiento financiero incorrecto detectado en canario.

## 2. Precondiciones

1. Existe un artefacto previo **verificado** por digest. No se elige por su identificador escrito en un documento.
2. Está documentada la **compatibilidad de esquema** entre la versión actual y la versión de destino.
3. Se conoce qué migraciones de datos se aplicaron con el release y si son reversibles.
4. Existe diario de operaciones durable para reconciliar.
5. La reversión pasa por `release-p11.md`: **revertir es un release**.

## 3. Pasos

1. **Detener el despliegue en curso** y congelar las escrituras sensibles del alcance afectado.
2. **Evaluar la compatibilidad de esquema.** Tres casos:
   - **Compatible hacia atrás:** la versión anterior lee el esquema actual. Se puede revertir el código sin tocar datos.
   - **Incompatible pero con migración reversible:** se revierte el código y se aplica la migración inversa probada, en ese orden y con respaldo previo.
   - **Incompatible sin migración inversa:** **no se revierte.** Se corrige hacia adelante. Revertir el código dejaría a la aplicación leyendo datos que no entiende, y eso corrompe en silencio.
3. **Tomar respaldo** del estado actual antes de cualquier cambio de datos.
4. **Seleccionar el artefacto de destino** por digest verificado.
5. **Revertir** el código y, si corresponde, la configuración con su `configVersion` correspondiente. Código y configuración se revierten juntos.
6. **Reconciliar.** Las operaciones en vuelo durante la ventana quedan en `UNKNOWN` y se resuelven leyendo recibos y consultando al proveedor. **No se reintentan.**
7. **Evaluar compensaciones.** Si el fallo produjo efectos financieros, el procedimiento de compensación es separado, con aprobación propia, y no consiste en volver atrás.
8. **Comunicar** el estado con precisión: qué se revirtió, qué no se puede revertir y qué queda pendiente de compensación.
9. **Cerrar** con informe y con la causa del fallo del release.

## 4. Verificación

- El digest servido coincide con el del artefacto de destino.
- La aplicación lee y escribe correctamente contra el esquema vigente.
- Los errores vuelven por debajo del umbral.
- Cero operaciones en `UNKNOWN` sin resolver.
- El inventario de efectos no reversibles está escrito: transacciones confirmadas, eventos emitidos, correos enviados, cobros realizados.

## 5. Criterio de parada

Se detiene la reversión y se corrige hacia adelante si:

- El esquema es incompatible y no hay migración inversa probada.
- La reversión exigiría borrar datos creados por la versión nueva.
- El artefacto de destino no se puede verificar por digest.
- La reversión afectaría a operaciones financieras ya confirmadas.

## 6. Qué NO hacer

- **No esperar que un rollback revierta transacciones de cadena, cobros o eventos emitidos.**
- No revertir código sin revisar la compatibilidad de esquema.
- No aplicar una migración inversa sin respaldo previo y sin haberla probado.
- No elegir el artefacto de destino por un identificador citado en un documento histórico.
- No revertir sólo el código dejando la configuración nueva, ni al revés.
- No compensar a un cliente modificando su saldo sin el procedimiento aprobado.
- No tratar una reversión como una operación exenta de la compuerta P11.
