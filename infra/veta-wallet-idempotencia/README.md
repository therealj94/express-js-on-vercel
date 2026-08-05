# Idempotencia de los envíos de Veta Wallet

Impide que un mismo envío de dinero se ejecute dos veces.

Desplegado en producción el 2026-08-05, **release 59**.

---

## El problema

Mandar dinero no es una operación que se pueda repetir sin consecuencias. Y se
repite sola con facilidad:

- el usuario toca dos veces el botón;
- la red va lenta y el teléfono reintenta;
- la respuesta se pierde de vuelta y nadie sabe si la transferencia salió.

En los tres casos llega un segundo `POST` idéntico. La app ya mandaba un sello
de idempotencia para que el backend pudiera reconocerlo — pero **el backend lo
ignoraba**: leía `{ chain_id, recipientAddress, password, amount }` y el campo
`idempotencyKey` ni se miraba. Firmaba y emitía una segunda transferencia.

La app se defendía por su lado (candado de reentrada, y no ofrecer reintento
cuando el resultado quedaba en duda), pero eso solo cubre los toques dobles del
mismo teléfono. No cubre un reintento de red, ni dos dispositivos, ni una app
reinstalada.

---

## La regla de oro: reservar antes de firmar

El sello se reserva **antes** de emitir la transacción, nunca después. Si se
reservara después, dos peticiones simultáneas pasarían las dos la comprobación
y las dos transferirían — que es justo lo que hay que impedir.

Y se reserva **después** de validar la contraseña, para que una contraseña mal
escrita no queme el sello del usuario.

### El índice único es el mecanismo, no un adorno

La protección **no** está en «buscar y, si no existe, crear»: entre la búsqueda
y la creación caben dos peticiones simultáneas, y las dos encontrarían vacío.

Está en que la inserción sea única. Cuando dos llegan a la vez, la base deja
pasar una sola y a la otra le devuelve un error de clave duplicada (`11000`).
Ese error es la señal de que alguien más ya está con este envío. Una carrera se
convierte en una respuesta clara.

El índice va sobre `(clave, usuario)` y no sobre la clave sola: así el sello de
una persona no puede chocar —ni reutilizarse— contra el de otra.

---

## Qué pasa cuando algo falla

Aquí está la decisión más delicada, y depende de si la transacción **pudo haber
salido**:

| Situación | Qué se hace |
| --- | --- |
| Falló antes de emitir (saldo insuficiente, nonce, argumento inválido) | El sello **se libera**: reintentar es seguro y correcto |
| Falló de forma dudosa (se cortó la red al emitir) | El sello queda marcado **dudoso**. Un reintento NO vuelve a transferir: pide verificar en la cadena antes de repetir |

Se prefiere molestar al usuario con una verificación antes que arriesgarse a
mandar su dinero dos veces. Los códigos que se consideran previos al envío
están en `FALLOS_ANTES_DE_EMITIR`; **todo lo demás se trata como dudoso**, que
es el lado seguro.

---

## Lo que ve la app

| Caso | Respuesta |
| --- | --- |
| Primera vez | 200 con el hash, como siempre |
| Reintento de algo que ya salió | **200 con el mismo hash** y `repetido: true` |
| Hay otro intento en curso | 409 `en-curso` |
| Un intento anterior quedó en duda | 409 `verificar-antes-de-repetir` |
| Mismo sello, datos distintos | 422 `sello-reutilizado` |

Devolver 200 con el hash original es deliberado: para el usuario el envío
**funcionó**, y eso es la verdad — funcionó la primera vez. Un error aquí solo
lo invitaría a intentarlo otra vez.

Sin sello, todo se comporta exactamente como antes. El cambio no rompe ningún
cliente.

Los sellos caducan solos a las 24 h. Nadie reintenta un envío al día siguiente,
y la colección no crece sin límite.

---

## Dónde está

El código del backend no vive en este repositorio, así que aquí se guarda una
copia de lo que se desplegó:

| Archivo | En el backend |
| --- | --- |
| `Idempotencia.model.js` | `models/Idempotencia.js` |
| `idempotencia.js` | `lib/idempotencia.js` |
| `transactionController.fragmento.js` | el `send` y `sendToken` de `controller/transactionController.js` |

---

## Pruebas

**Unidad** — el módulo real contra una colección en memoria que imita el índice
único:

```sh
cd /ruta/al/backend && node .../pruebas/unidad.test.mjs
```

27 comprobaciones: primer envío, segundo toque, reintento devolviendo el mismo
hash, conflicto por monto y por destinatario, sellos de dos personas que no se
cruzan, fallo previo al envío que sí se puede reintentar, corte de red que no,
las cinco respuestas HTTP, y los dos casos que salieron de la revisión (ver
abajo).

**Producción** — contra la base real, en un dyno one-off. Solo toca la colección
de sellos con una clave de prueba que borra al final; no emite ninguna
transacción:

```sh
python3 ../veta-wallet-migracion/dyno.py pruebas/produccion.js
```

8 comprobaciones, incluida la que de verdad importa: **dos reservas
simultáneas, pasa exactamente una**. También confirma que el índice único
existe de verdad —si no se hubiera creado, el código pasaría las dos veces sin
que nada avisara— y que el TTL está puesto.

Las dos pasan.

---

## Dos cosas que aparecieron al revisarlo

Ninguna de las dos la vi al escribirlo; salieron al releerlo buscando fallos.

### `completar()` podía convertir un envío bueno en un error

Estaba escrito como `await completar(...)` justo antes de responder. Si esa
escritura fallaba —un hipo de la base, nada raro— la excepción caía en el
`catch` del controlador, que marcaba el sello como dudoso y **le devolvía un
error al usuario por un envío que ya había salido y ya estaba en su historial**.
El peor resultado posible: el usuario ve un error y lo repite.

Ahora `completar()` no lanza nunca, por contrato. El precio es que el sello
queda en «en-curso» y un reintento recibe un 409 hasta que caduca — molesto,
pero del lado seguro.

### El sello venía del cliente sin normalizar

`idempotencyKey` se usaba tal cual llegara. Dos consecuencias:

- Un objeto (`{"$ne": null}`) acababa dentro de una consulta a Mongo. Aquí no
  daba acceso a nada ajeno —el usuario sale del token, no del cuerpo— pero no
  hay razón para dejar entrar datos del cliente como operadores de consulta.
- Un sello larguísimo revienta el límite de clave del índice, y ese error no es
  `11000`, así que salía como un 500 en vez de como lo que es.

`normalizarSello()` lo fuerza a texto y lo recorta a 200 caracteres.
