# Dos fallos del backend, encontrados probando la app · 12-ago-2026

Salieron montando el ensayo. El primero es solo del ensayo; **el segundo es
grave y hay que comprobarlo en producción.**

---

## 1 · El validador rechazaba el alta desde la app

**Síntoma:** al crear cuenta, la app muestra `"name" is not allowed`.

**Causa:** `middleware/validateForms.js` declara solo `email` y `password`, y
Joi tira por defecto cualquier clave no declarada. La app manda además `name` y
`fullName` — el nombre completo que escribe la persona.

**Arreglo** (aplicado en el ensayo):

```js
const validationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().allow('').optional(),
  fullName: Joi.string().allow('').optional(),
  username: Joi.string().allow('').optional(),
});
```

Se declaran uno por uno a propósito: cualquier campo inesperado sigue chocando.
Comprobado — `loQueSea` sigue dando `"loQueSea" is not allowed`.

El controlador de alta solo lee `email` y `password`; el nombre ni se guarda.
Dejarlos pasar no cambia nada.

**En producción NO pasa.** Lo comprobé: producción acepta `name` y crea la
cuenta. Su `validateForms` es más nuevo que la copia que yo tenía.

---

## 2 · Un correo que falla tumba el backend entero

**Esto sí importa.**

En `controller/authController.js`, el alta manda el correo de verificación así:

```js
transporter.sendMail(mailOptions, async (error, info) => {
  if (error) {
    console.log(error);
    return res.status(500).json({ message: "Failed to send verification email" });
  }
});
// ...sigue: crea la billetera y responde al cliente
```

Esa devolución de llamada corre **después** de que el alta ya respondió. Si el
envío falla, intenta responder **por segunda vez**, Express lanza
`ERR_HTTP_HEADERS_SENT`, nadie lo recoge y **el proceso muere**.

No es teoría: lo vi caer una y otra vez en el ensayo. Cada alta mataba el
servidor.

**Por qué es grave.** No hace falta un ataque. Basta con que alguien se
registre con un correo que el proveedor rechace, o que el servidor de correo
tenga un mal minuto, para tumbar el backend **de todos los usuarios a la vez**.
Y el alta ya se hizo: la cuenta queda creada y el proceso muerto.

Además rompe justo el paso siguiente: la app hace login **inmediatamente**
después de registrarse, y se encuentra el backend reiniciando.

**Arreglo** (aplicado en el ensayo):

```js
// El correo se manda y punto: NO se responde desde aquí.
transporter.sendMail(mailOptions, (error) => {
  if (error) console.log("aviso: no se pudo enviar el correo de verificacion:", error.message);
});
```

Que el aviso no salga no es motivo para tumbar un alta que ya se hizo.

Comprobado después del arreglo: el alta responde, **el proceso sigue vivo**, y
el login inmediato funciona.

---

## Lo que hay que verificar, y por qué no pude

La copia del backend que tengo salió del paquete de Heroku, pero **producción
ha cambiado desde entonces**: le faltan la ruta `/auth/social`, el campo
`proveedores` y el arreglo del `username` — cosas que en producción sí están y
responden.

Así que **no puedo afirmar que el fallo 2 siga vivo en producción.** Solo puedo
decir que está en la copia que tengo, que esa copia salió de producción, y que
no hay forma de forzar un fallo de correo desde fuera para probarlo sin
arriesgar.

**Para cerrarlo hace falta un token de Heroku**: bajar el código actual,
mirar esas líneas y, si siguen así, desplegar el arreglo.

Mientras tanto queda anotado como pendiente, y no como resuelto.

---

## De paso, una cuenta creada y borrada en producción

Para saber si el fallo 1 afectaba a producción tuve que mandarle un alta real
con el campo `name`. La aceptó — o sea, producción está bien — pero eso creó
una cuenta de verdad: `claude.prueba.validador@vetawallet.com`.

**Borrada en el momento**, con el mismo camino que usa la app
(`DELETE /users/me` con contraseña y `confirm: ELIMINAR`), y comprobado que ya
no entra: `wrong email or password`.
