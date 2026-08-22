# Estado de seguridad, medido el 22 de agosto de 2026

Solo lo comprobado de primera mano contra producción. Lo que reportan los
agentes y no pude confirmar va marcado como tal.

---

## LO PRIMERO, PORQUE ORDENA TODO LO DEMÁS

**Casi nada de lo que se arregló está corriendo.**

| Servicio | Cómo se despliega | ¿Al día? |
|---|---|---|
| Genesis ID (Render) | **automático** desde la rama | **sí** — commit `1861a8d` |
| Ordenex API (Heroku) | a mano, `git subtree push` | **no** |
| Backend de la billetera (Heroku) | a mano, `git push heroku` | **no** |
| La web (Amplify) | a mano, `subir.py` | **no** |

Comprobado, no supuesto:

- `GET /tarifas` de Ordenex —ruta creada hoy— contesta **404**.
- `app.vetawallet.com/candado.js` **no tiene** la firma de mensajes.
- `app.vetawallet.com/app.js` **no tiene** ni el nombre que se acorta ni la hoja
  de grupos fuera de la rama del hilo.

O sea que el ecosistema que se está usando hoy es el de antes de esta sesión, en
tres de los cuatro servicios. **La brecha entre lo arreglado y lo que corre es
ahora mismo el mayor problema de seguridad que hay**, más grande que cualquier
hallazgo suelto de la lista.

Yo no puedo cerrarla: probé las credenciales de AWS y de Heroku en este
contenedor y **las dos están inválidas**.

---

## Cabeceras de seguridad, medidas ahora

| Servicio | HSTS | CSP | X-Frame | nosniff | Firma del servidor |
|---|---|---|---|---|---|
| Backend de la billetera | sí | sí | sí | sí | oculta |
| **Ordenex API** | **no** | **no** | **no** | **no** | **`Express` a la vista** |
| **Relevo de mensajes** | **no** | **no** | **no** | **no** | oculta |
| Genesis ID | sí | no | sí | sí | oculta |
| `app.vetawallet.com` | **no** | sí | **no** | sí | oculta |

Lo de Ordenex **ya está arreglado en la rama** —`helmet` y los frenos por tipo
de ruta— y sigue así en producción por lo de arriba.

Lo de `app.vetawallet.com` es distinto: es Amplify sirviendo la web, y la
cabecera se pone en la configuración del sitio, no en el código. No lo cubre
ningún arreglo de esta sesión.

---

## Genesis ID: desplegado, pero dos cosas siguen apagadas

`GET /healthz`, commit `1861a8d`:

| | |
|---|---|
| Las listas se mantienen solas | **sí** |
| Caducidad de documentos activa | **sí** |
| El ancla de la bitácora corre | **sí** — 1.320 entradas ancladas hoy a las 01:57 |
| **La bitácora se firma** | **NO** |
| **Operadores sin segundo factor** | **2** |
| El ancla sale fuera de la base | **no** — solo al registro |

Las dos que están en **no** no son fallos de código: el código está desplegado y
funcionando. Falta poner **una variable de entorno** en Render y que **dos
personas aprieten un botón**. Mientras tanto:

- La bitácora está encadenada pero **sin firmar**, o sea que quien tenga la
  cadena de conexión de Mongo la puede reescribir entera y va a cuadrar. Es
  exactamente el agujero que ese arreglo cerraba.
- Dos operadores con rol de aprobar identidades y leer cédulas entran **solo con
  contraseña**.

El ancla sí corre y deja el hash en el registro del servicio, que está fuera de
la base. Configurando `GENESIS_ANCLA_URL` saldría además a un sitio propio.

---

## Lo que ya estaba medido y sigue igual

- **No hay copias de seguridad de ninguna de las tres bases de MongoDB.** En la
  de la billetera viven las semillas cifradas de cada usuario.
- **No hay vigilancia ni alertas** en ningún servicio. Si algo se cae ahora, el
  primer aviso es un usuario quejándose.
- **No hay CI.** Las pruebas existen —y hoy son muchas más— y no las corre nada.
- **No hay registro de auditoría** en la billetera ni en Ordenex. Genesis ID sí.
- **No hay procedimiento de incidente escrito**, ni forma de cerrar todas las
  sesiones de golpe.
- **La billetera y Ordenex se administran con una cadena de texto compartida**,
  no con operadores con nombre. Genesis ID sí los tiene, con roles y segundo
  factor.
- **`npm audit` del backend de la billetera: 21**, una crítica. Ordenex y
  Genesis ID: cero.

---

## Lo que se cerró esta sesión, para no volver sobre ello

Genesis ID: las nueve. PULSE2CHAT: la firma del remitente y el código de
seguridad. Ordenex: el trato atómico, el retiro dudoso, el freno, las cabeceras,
la comisión a la vista y la puerta de idoneidad de ONDK. La billetera: el saldo
cero, la revocación de sesión, la idempotencia obligatoria, el freno del envío,
la firma del webhook y el registro que imprimía credenciales.

**Todo eso está en la rama. Casi nada está corriendo.**
