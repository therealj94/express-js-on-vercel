# Galaxy OS — revisión antes de sustituir el sitio

Fecha: 2026-09-20. Resultado: vista de diseño disponible; sustitución integral del sitio no realizada.

## Respaldos creados

| Referencia | Commit conservado |
| --- | --- |
| backup/main-before-galaxy-2026-09-20 | cb4d6576fb67850ee6bd1815da4a01d214d92636 |
| backup/legacy-webos-2026-09-20 | add26a34c7c4152edad294e38fa36d157d99f0cf |

Son referencias del código completo de esas ramas. No constituyen copias de bases de datos, secretos, archivos externos ni configuración del proveedor. No se ha confirmado cuál de estas revisiones corresponde al despliegue actualmente servido en el dominio. No se modificó main ni la rama del motor anterior.

## Evidencia

La revisión de diseño parte de 9976f3567a5b3421b6e841e1bd7ff7009619bcc9. La copia local equivalente del proyecto pasa 14 pruebas de lógica: geometría de gestos, límites, preferencias, cancelación de viajes, contrato de gestos, posición del núcleo, dirección de arrastre, cámara estable al seleccionar y 3.600 fotogramas con anclajes estables. Estas pruebas no equivalen a una validación de servicios reales.

## Hallazgos que impiden llamarlo integración completa

- Overlays.tsx abre paneles explícitos de diseño. Solo chat tiene un botón de llamada al host cuando el motor está embebido.
- entry.tsx conserva montaje, desmontaje, puerta, entrada, retorno y controles de vista; no implementa todos los contratos del motor anterior.
- El host anterior utiliza también __AE_CASA, __AE_VISOR, __AE_GENESIS, __AE_DECIR y __AE_PORTICO. Su funcionalidad no queda cubierta por sustituir únicamente los archivos de entrada del nuevo motor.
- El host carga archivos con nombres fijos y una marca de versión; los fragmentos, texturas y modelos son igualmente necesarios. La presencia de un bundle compilado no demuestra una actualización correcta del host.
- No están comprobados el login real, la continuidad de sesión ni el recorrido completo de salida y regreso en el host de producción.
- La apariencia Pro y la pérdida de contexto WebGL requieren un dispositivo con GPU; la revisión visual disponible ha sido Lite. AirTouch y niveles de audio requieren hardware real.
- Persisten posibles acercamientos entre nombres en ángulos extremos, aunque se eliminó el cambio discreto de lado durante la órbita.

## Alcance de esta revisión

Se conservaron respaldos de código, se revisaron contratos de integración y se repitieron las pruebas de navegación visual. No se conectaron cuentas, saldos, transacciones, trading ni servicios financieros restringidos. No se desplegó un reemplazo sobre el dominio existente. No se añadieron nuevos efectos decorativos: la prioridad antes de una entrega es cerrar los defectos de integración comprobables.
