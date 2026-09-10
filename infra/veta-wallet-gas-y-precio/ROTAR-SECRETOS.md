# Rotar `PASS_TOKEN` y `PASS_ADM`

Los dos son secretos del backend de Veta Wallet, guardados como variables de
configuración en Heroku. En este archivo **no hay ningún valor**, ni el viejo ni
el nuevo: sólo el procedimiento.

## Por qué

- **`PASS_TOKEN`** firma **todas** las sesiones. Quien lo tenga puede fabricar
  la sesión de cualquier usuario sin saber su contraseña.
- **`PASS_ADM`** cifra **todas** las llaves privadas y frases semilla
  guardadas. Quien lo tenga, y una copia de la base de datos, tiene el dinero.

Los dos han sido cadenas de **siete caracteres**. Siete caracteres se prueban
por fuerza bruta en un rato con una tarjeta gráfica corriente. El mínimo
razonable son 32 caracteres aleatorios.

Desde hoy el backend lo dice en el log **en cada arranque** mientras siga corto
(`[secretos] PASS_TOKEN tiene N caracteres…`). No bloquea el arranque a
propósito: dejar el servicio caído no protege a nadie.

## `PASS_TOKEN` · rotación limpia, sin echar a nadie

Cambiarlo a secas invalida todas las sesiones abiertas: la app pide login otra
vez a todo el mundo a la vez. Se evita verificando contra los dos durante unos
días.

1. Generar el nuevo (32 bytes al azar, en base64):
   `openssl rand -base64 32`
2. Ponerlo en Heroku como **`PASS_TOKEN_NUEVO`**, dejando `PASS_TOKEN` como
   está.
3. Desplegar una versión que **firme** con `PASS_TOKEN_NUEVO` y **acepte**
   cualquiera de los dos al verificar.
4. Esperar más que la vida de un token (la que sea; hoy hay que confirmarla en
   `userController.js`). Con esperar una semana sobra.
5. Poner el valor de `PASS_TOKEN_NUEVO` en `PASS_TOKEN`, borrar
   `PASS_TOKEN_NUEVO`, y quitar del código la aceptación del viejo.

**Atajo si no importa que todos vuelvan a entrar:** cambiar `PASS_TOKEN` por el
nuevo y ya está. Es un solo paso, y avisar antes.

## `PASS_ADM` · **ya está hecho** (comprobado el 12-ago-2026)

La rotación de la clave de cifrado **está terminada**. `lib/cripto.js` la hizo
en dos etapas y en producción `PASS_ADM` ya no existe. Contado dentro de la red
de Heroku, sin sacar ni una llave: de **435 usuarios**, **434 llaves privadas y
434 frases semilla** descifran con `PASS_ADM_NUEVA`. El único que falla es un
registro que ya constaba corrupto de antes de la rotación.

Lo de abajo se deja escrito por si hay que volver a rotarla.

## `PASS_ADM` · cómo se hizo, y cómo se haría otra vez

Aquí no se firma: se **cifra**. Si se cambia el valor, lo ya guardado deja de
poder descifrarse, y eso es perder las llaves de los usuarios. Hace falta una
migración:

1. Generar el nuevo y ponerlo como **`PASS_ADM_NUEVO`**.
2. Un script que, para cada usuario, descifre con `PASS_ADM` y vuelva a cifrar
   con `PASS_ADM_NUEVO`, **comprobando que la llave descifrada produce la misma
   dirección** que tiene la cuenta. Si una sola no cuadra, se detiene y no
   guarda nada.
3. Copia de la base de datos **antes**, y probarlo primero contra esa copia.
4. Sólo cuando el script termine sin una sola diferencia, mover el valor a
   `PASS_ADM` y borrar `PASS_ADM_NUEVO`.

**Esto se hace con José delante.** Es la operación con más capacidad de
destrucción de todo el sistema: un fallo a medio camino deja parte de las
llaves cifradas con un secreto y parte con otro.

## Después de rotar

- Comprobar que el log de arranque ya no imprime nada de `[secretos]`.
- Entrar en la app con una cuenta de prueba y hacer un envío pequeño: si
  `PASS_ADM` quedó mal, el envío falla al descifrar la llave, no antes.
