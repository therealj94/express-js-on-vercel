# Runbook: secreto expuesto

**Regla base: borrar el texto no revoca el secreto.** Un secreto que estuvo en un repositorio, un chat, un registro, un ticket, una captura o un documento **se considera comprometido desde el momento de la exposición**, sin importar cuántas personas lo hayan visto ni cuánto tiempo estuvo visible. La única respuesta válida es revocar.

---

## 1. Disparador

- Aparece una credencial, token, llave de API, cadena de conexión, certificado, semilla o contraseña en código, historial de control de versiones, registros, tickets, documentos, chats, capturas, variables de entorno compartidas o salida de un agente.
- Lo reporta un escaneo de secretos, una persona o un tercero.

## 2. Precondiciones

1. Existe un responsable de seguridad identificado. **La revocación la ejecuta esa persona**, no el descubridor y no un agente.
2. Existe un canal de incidentes separado de aquel donde apareció el secreto.
3. Existe un registro de incidentes que **no repite el secreto**.

## 3. Pasos

1. **No borrar todavía.** Preservar la evidencia antes de cualquier limpieza: ubicación exacta, commit o identificador de mensaje, fecha de aparición, fecha de detección, quién tenía acceso a ese lugar y desde cuándo. Capturar la referencia, **no el valor**.
2. **Abrir el incidente** con un identificador. En el registro se anota el tipo de secreto y su ubicación, nunca su valor ni un fragmento que permita reconstruirlo.
3. **Clasificar el alcance.** ¿Qué abre ese secreto? Entornos, cuentas, bases de datos, proveedores, fondos, datos personales. Si abre custodia o fondos, escalar de inmediato y aplicar también `compromiso-de-llaves.md`.
4. **Revocar y rotar.** El responsable de seguridad revoca la credencial en el emisor y emite una nueva por el canal de gestión de secretos. Revocar primero; reemplazar después. Si revocar rompe un servicio, se acepta la interrupción: un secreto comprometido en uso es peor.
5. **Revisar el historial.** Buscar el secreto en todo el historial del control de versiones, en registros, respaldos, artefactos de integración continua, imágenes y copias. Un secreto borrado del árbol de trabajo sigue en el historial y en cualquier clon existente.
6. **Revisar el uso.** Examinar los registros de acceso del recurso protegido desde la fecha de exposición: accesos, direcciones de origen, operaciones ejecutadas, volúmenes anómalos. Documentar qué se pudo hacer con ese secreto, aunque no haya indicio de que se hiciera.
7. **Limpiar.** Sólo después de preservar evidencia y revocar: eliminar el secreto de donde esté, reescribir el historial si la política lo permite y avisar a quienes tengan clones.
8. **Cerrar causas.** Añadir o ajustar el escaneo de secretos en integración continua y sobre el historial, fijar dependencias, aplicar mínimo privilegio y proteger los trabajos de integración de solicitudes de cambio.
9. **Notificar** a quien corresponda según la política y la naturaleza del secreto.

## 4. Verificación

- La credencial antigua **falla** al usarse. Se comprueba intentándolo de forma controlada.
- La credencial nueva funciona y está en el gestor de secretos, no en el código.
- El escaneo sobre el historial completo no encuentra ocurrencias.
- El registro de accesos del recurso está revisado y el resultado está escrito.
- El incidente tiene conclusión, responsable y fecha.

## 5. Criterio de parada

Se escala y se detiene la operación normal si:

- El secreto abre custodia, fondos de clientes o datos personales.
- Los registros muestran accesos no explicados posteriores a la exposición.
- No se puede revocar (el emisor no lo permite o no hay control sobre la cuenta).
- Se encuentra el mismo secreto en más de un sistema, lo que indica reutilización.

## 6. Qué NO hacer

- **No borrar el texto y dar el incidente por cerrado.** Borrar no revoca.
- No repetir el secreto, ni parcialmente, en el ticket, en el chat, en el informe ni en la evidencia.
- No usar la credencial filtrada para "comprobar si todavía funciona" con una operación real. Si hay que comprobarlo, se hace contra un endpoint de verificación y se documenta.
- No rotar sin revocar la anterior.
- No asumir que un repositorio privado limita el alcance: cuentan todos los que tienen acceso y todos los clones.
- No dejar que un agente ejecute la revocación.
- No esperar a la ventana de mantenimiento.
