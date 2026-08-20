# Rotar `PASS_TOKEN` sin echar a nadie de su sesión

`PASS_TOKEN` firma **todas** las sesiones de la billetera, y en algún momento de
este proyecto fue una cadena de **siete caracteres**. Siete caracteres se prueban
por fuerza bruta en un rato, y quien lo consiga no necesita robar una contraseña:
**se fabrica un token válido para cualquier usuario** y entra como quien quiera.

Por eso hay que cambiarlo. El problema es que cambiarlo de golpe echa a la calle
a todo el mundo: cada sesión abierta deja de valer en el instante del despliegue,
y como el token de refresco dura treinta días, no es un tropiezo de un minuto —
es todo el que tenga la app abierta teniendo que volver a escribir su contraseña,
sin aviso.

El código ya está preparado para que eso **no** pase. Va en tres etapas, igual
que se hizo con la clave de cifrado.

---

## Etapa 1 · poner el secreto nuevo · lo que hay que hacer HOY

### Generá el secreto

En una terminal de tu computadora:

```sh
openssl rand -base64 48
```

Sale una cadena larga y aleatoria. **No la pegues en ningún chat, ni en un
documento, ni en el repositorio.** Solo va a dos sitios: el panel de Heroku y tu
gestor de contraseñas.

### Ponelo en Heroku

En `dashboard.heroku.com` → la aplicación del backend → **Settings** →
**Reveal Config Vars**:

1. **Copiá el valor actual de `PASS_TOKEN`** y guardalo en una variable nueva
   llamada **`PASS_TOKEN_VIEJO`**. Tal cual, sin cambiarle nada.
2. **Reemplazá `PASS_TOKEN`** por el secreto que acabás de generar.

Ese orden importa: si ponés el nuevo antes de guardar el viejo, se pierde y ahí
sí se cae la sesión de todo el mundo.

Heroku reinicia la aplicación sola al guardar. **Nadie se entera de nada**: las
sesiones abiertas siguen valiendo, y las que se abran a partir de ese momento ya
nacen firmadas con el secreto bueno.

### Comprobalo

En el registro de arranque tiene que aparecer:

```
[secretos] PASS_TOKEN_VIEJO sigue configurada: aun se aceptan sesiones
firmadas con el secreto anterior...
```

Ese aviso es lo **correcto** en esta etapa: dice que la rotación está en marcha.
Y **no** debe aparecer ya `[secretos] PASS_TOKEN tiene 7 caracteres`.

---

## Etapa 2 · esperar 30 días

El token de refresco dura treinta días. Pasado ese plazo no queda ninguna sesión
firmada con el secreto viejo: todas se renovaron solas con el nuevo.

No hay nada que hacer en esta etapa. Solo dejar pasar el tiempo.

---

## Etapa 3 · borrar el viejo

Cuando pasen los 30 días, **borrá `PASS_TOKEN_VIEJO`** de las Config Vars.

El aviso del arranque desaparece y la rotación queda cerrada. A partir de ahí,
un token firmado con el secreto corto ya no lo acepta nadie.

---

## Cómo funciona por dentro

`lib/sesion.js` envuelve a `jsonwebtoken`. Los catorce ficheros que verificaban
sesiones ahora importan de ahí en vez de importar la librería directamente, y
**ninguna de las 44 llamadas cambió una letra**: siguen siendo `jwt.verify(...)`
y `jwt.sign(...)`.

Lo único que cambia es que, al verificar, si la firma no cuadra con el secreto
nuevo se reintenta con el viejo.

### Lo que deliberadamente NO reintenta

- **Un token vencido.** Está vencido con cualquier secreto. Reintentar solo
  gastaría tiempo y podría devolverle al cliente un error confuso.
- **Los tokens de Apple y Google.** `lib/socialAuth.js` los verifica con la clave
  pública del proveedor, que no es ningún secreto nuestro. El reintento solo se
  dispara cuando el secreto recibido es exactamente `PASS_TOKEN`, y ese fichero
  sigue importando `jsonwebtoken` directamente. Si el reintento se disparara ahí,
  un token firmado con nuestro secreto viejo se aceptaría como si viniera de
  Apple — eso sería un agujero, y hay una prueba que lo vigila.

### Las pruebas

```sh
node pruebas/probar-rotacion-token.mjs
```

Diez comprobaciones, todas en verde. Las tres que de verdad importan son las que
prueban lo que **no** debe pasar: que un token de un tercero no cuele por el
reintento, que uno vencido no reviva, y que verificar con una clave ajena no
dispare la caída al secreto viejo.

---

## El hallazgo de `user.token`, resuelto

Al abrir esto apareció otra cosa. `middleware/isAdmin.js` comparaba el token que
llega con un valor guardado en la base (`user.token`, cifrado con `PASS_TOKEN`):

```js
if (tokenFromRequest !== decryptedToken) return res.status(401)...
```

**Pero nada en el backend escribía nunca ese campo.** Se buscó entero: solo
aparecía leyéndose ahí, y puesto a `undefined` en el borrado de cuentas. El
inicio de sesión firmaba un token nuevo cada vez —vence a los 40 minutos— y no
guardaba nada. Esa comparación no podía cuadrar, así que las cuatro rutas que la
usan (`/admin/saldo`, `/admin/cuenta`, `/updateAdmin`, `/updateUser`) estaban
cerradas en la práctica.

**Decidido: se escribe.** Ahora la sesión en curso queda guardada, cifrada, en
los tres sitios que emiten una:

| Dónde | Por qué hace falta |
|---|---|
| `authController` · inicio de sesión | es el caso normal |
| `authController` · renovación | el token de acceso vence a los 40 min y se emite otro; sin esto un administrador perdería las rutas de administración cuarenta minutos después de entrar |
| `socialController` · Google y Apple | si no, entrar con Google dejaría fuera de administración y entrar con contraseña no — una diferencia invisible y muy difícil de diagnosticar |

Y va **cifrado, no en claro**: un volcado de la base no debe entregar sesiones
vivas. Cifrado, para aprovecharlo hay que tener además el secreto — y quien
tenga el secreto ya puede fabricar los tokens que quiera.

### Lo que esto cambia en el día a día

**Un administrador puede tener una sola sesión a la vez.** Si entra desde otro
teléfono o desde el navegador, la sesión anterior deja de valer **para las rutas
de administración**. Para el resto de la aplicación no cambia nada: los usuarios
normales pasan por `verifyToken` y `sesionGenesis`, que no miran este campo.

Para una cuenta que puede ver saldos ajenos y borrar cuentas, eso es lo
deseable.

### Si algún administrador queda fuera

Que vuelva a iniciar sesión. Con eso el campo se reescribe y la ruta vuelve a
funcionar. No hay que tocar la base.
