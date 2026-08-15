# No puedo entrar en Genesis ID

Qué pasó, qué quedó arreglado en el código, y **lo que falta con nombre de quien
tiene que hacerlo**. Escrito a raíz del caso de José (15 de agosto de 2026):
entra a `https://genesis-id.onrender.com` desde el móvil, escribe su correo y su
contraseña, pulsa ENTRAR y le sale en rojo **«La sesión caducó»**.

Aquí no hay ninguna contraseña, ni ninguna clave, ni ningún token. Cuando hace
falta nombrar uno se nombra **la variable**, nunca su valor.

---

## 1. Lo que de verdad le pasó

Son dos averías encadenadas, no una.

**a) Ese formulario nunca fue para él.** La raíz de `genesis-id.onrender.com`
sirve `public/admin.html`, que es el **panel de cumplimiento del equipo**. Las
webs del ecosistema llevaban ahí a los usuarios con un botón de «Verificar mi
identidad». José llegó a una puerta de operadores y escribió las credenciales de
su billetera. No es operador: no hay ninguna cuenta suya que abrir. Los
operadores solo nacen de dos sitios —el arranque
(`GENESIS_ADMIN_EMAIL`, hoy `admin@ordenglobal.link`) y
`POST /api/panel/operadores` con sesión de admin—, **no hay autorregistro por
ninguna ruta**, y `cabejean@hotmail.com` no aparece en ningún punto del
repositorio.

**b) El panel le mintió sobre el motivo.** El servidor sí mandaba el motivo real
—«Correo o contraseña incorrectos»—, pero `admin.html` convertía **cualquier**
401 en «La sesión caducó» y tiraba el cuerpo de la respuesta sin leerlo. Un
rechazo de credenciales se anunciaba como el vencimiento de una sesión que nunca
existió. Eso es lo que hizo que el caso durase días: el único dato útil se
perdía por el camino.

Y debajo había una trampa: a los cinco fallos la cuenta se bloqueaba quince
minutos, pero **el contador no volvía nunca a cero**, así que el primer intento
fallido después de cumplir el castigo volvía a bloquearla entera. Quien insiste
desde el móvil —justo lo que hace alguien que no sabe por qué le rechazan— se
quedaba encerrado en ciclos de quince minutos, sin ver el motivo.

> Lo que **no** era: no fue la persistencia. `/healthz` da
> `almacenPersistente: true`, el motor es Mongo y las sesiones sobreviven a los
> reinicios de Render. Tampoco fue un secreto de firma: el token del panel no se
> firma, es azar guardado en la base. Ni una migración de contraseñas: el
> formato scrypt no ha cambiado desde el primer commit.

---

## 2. Lo que ya quedó arreglado (código, sin desplegar)

| Fichero | Qué cambia |
|---|---|
| `public/admin.html` | `api()` lee el cuerpo también en 401 y enseña el motivo del servidor tal cual. «La sesión caducó» queda reservado a cuando **había** una sesión guardada y el 401 viene de otra ruta; en `/sesion/entrar` no se dice nunca. Un fallo de red se anuncia como fallo de red. El botón se bloquea mientras se pregunta, para que un doble toque en el móvil no gaste dos intentos. |
| `public/admin.html` | Bajo el formulario, una línea que dice a quién es esta puerta y dónde se verifica de verdad quien viene a eso. |
| `src/auth/operadores.ts` | El contador de fallos vive en una ventana y se reinicia al vencer: se sale del bloqueo. Reintentar dentro del bloqueo ya no lo alarga. La bitácora distingue internamente las tres causas (`sin-operador`, `desactivado`, `contrasena`) y anota `sesion.bloqueada`. La respuesta al usuario sigue sin distinguirlas, a propósito. |
| `src/routes/sesion.ts` | El bloqueo responde **429 con `Retry-After`**, no 401: «espere» y «esos datos no valen» son cosas distintas. La sesión se guarda **antes** de entregar el token. |
| `src/routes/panel.ts` | Crear un operador espera al volcado antes de responder «creado», y si no se pudo guardar lo deshace y lo dice (503). Antes se respondía `ok` con 100 ms de ventaja sobre la escritura: un reinicio en esa ventana se llevaba la cuenta recién creada sin que nadie se enterara. |
| `src/store.ts` + `src/index.ts` | `/healthz` publica `guardadoOk` y `ultimoGuardado`: un guardado que falla ya no es invisible. Cierre ordenado en SIGTERM/SIGINT (Render lo manda en cada despliegue). `trust proxy` declarado: el límite de peticiones deja de ser global y la bitácora ve la IP real. Y en Render **no se arranca sin almacén persistente** (ver 4.b). |
| `src/pruebas/puerta.test.ts` | Prueba nueva del rechazo y del bloqueo. Usa un correo que no existe: no hace falta ninguna contraseña para probarlo. |

Comprobado: `npm run typecheck` limpio y `npm run prueba` en verde (156
pruebas). El HTML queda con las etiquetas cuadradas y su JavaScript pasa
`node --check`.

Fuera de `genesis-id/`, donde la evidencia señalaba (queda dicho aquí porque son
otro despliegue):

- `apps-web/veta-wallet/app.js` — pedía `GET /genesis/status`; el puente publica
  `/genesis/estado`. Ese 404 se traducía a «sin-iniciar», así que la tarjeta
  decía **«Sin verificar» a todo el mundo**, tuviera GID aprobado o no, y por eso
  se pintaba siempre el botón que llevaba al panel de operadores. Corregido, y
  un fallo de consulta ya no se disfraza de «sin verificar».
- `apps-web/veta-wallet/i18n.js` — textos del estado nuevo, en español e inglés.
- `apps-web/mytokenpay/app.js` y `index.html` — los dos enlaces que mandaban al
  panel de cumplimiento ahora van a `https://www.vetawallet.com/genesis-id`.
- `infra/veta-wallet-backend/app.js` — `https://app.vetawallet.com` añadido a
  `allowedOrigins`. Sin eso el navegador bloqueaba **todas** las llamadas desde
  ese dominio, login incluido, y por fuera parecía un fallo de Genesis ID.

---

## 3. Lo que falta, y quién tiene que hacerlo

### a) Confirmar si `cabejean@hotmail.com` es operador — **un administrador**

Es el único dato que falta para cerrar el caso. No se puede saber desde el
código: hay que mirarlo en el servicio.

1. Entrar en `https://genesis-id.onrender.com` con `admin@ordenglobal.link`.
2. Pestaña **Operadores y apps**.
3. Buscar `cabejean@hotmail.com` en la lista.

- **Si no está** (lo más probable): no hay ninguna cuenta que arreglar. José no
  tiene que entrar ahí — ver el punto (c).
- **Si está pero con `activo: false`**: reactivarlo desde esa misma pantalla.
- **Si está y está activo**: es la contraseña. Que la cambie un administrador
  desde el panel; **la elige José**, no se fija desde aquí.

Con los cambios de arriba, además, la pestaña **Bitácora** ya distingue el
motivo: busque `sesion.fallida` y mire el campo `causa`.

### b) Si José necesita cuenta de operador — **un administrador**

Solo si va a revisar identidades. Panel → **Operadores y apps** → crear
operador, con su rol (`cumplimiento`, `revisor` o `auditor`; `admin` solo si de
verdad va a gestionar operadores y aplicaciones). **La contraseña la escribe él
en ese momento**, con doce caracteres como mínimo, y el sistema le pedirá
cambiarla al entrar. En este documento no va ninguna contraseña, ni fijada ni
sugerida.

### c) Decirle a José dónde se verifica de verdad — **quien le atienda**

Si lo que quiere es verificar su identidad, **no necesita cuenta en el panel**.
El trámite se hace desde la aplicación de Veta Wallet en el teléfono (o desde
`https://www.vetawallet.com/genesis-id` en la web), porque hace falta la cámara
para leer el documento y comprobar el rostro. El panel de
`genesis-id.onrender.com` es la herramienta del equipo de cumplimiento, y ahí no
hay forma de registrarse ni la habrá.

### d) Desplegar — **quien tenga acceso a Render y a Heroku**

Nada de lo de arriba está desplegado. **No he desplegado nada a propósito**:
este es el servicio que aprueba identidades reales.

- **Genesis ID (Render).** `render.yaml` tiene `autoDeploy: true`, así que se
  despliega solo al empujar a la rama conectada. Si no salta, en el panel de
  Render: servicio `genesis-id` → **Manual Deploy** → *Deploy latest commit*.
  Para comprobar que subió, `GET /healthz` y mirar `version.commit`: si sigue
  el de antes, el despliegue no se disparó.
- **Webs (`apps-web/`).** Van por Amplify. Ojo: Amplify sirve `genesis-id.html`
  en `/genesis-id`, sin extensión — así están escritos los enlaces.
- **Backend de la wallet (`infra/veta-wallet-backend/`).** El cambio de CORS solo
  vale desplegado; ese despliegue estaba bloqueado por un token vencido y no lo
  he tocado.

Después de desplegar Genesis ID, dos comprobaciones de un minuto:

1. Un intento con un correo inventado debe enseñar **«Correo o contraseña
   incorrectos»** en el panel, no «La sesión caducó».
2. `/healthz` debe seguir con `estado: ok`, `almacenPersistente: true` y el
   `guardadoOk: true` nuevo.

### e) Variables de entorno — **quien administre Render**

Ninguna hay que crear para arreglar el caso de José. Estas son las que hay que
mirar, por su **nombre**; los valores se ponen en el panel de Render y no se
escriben nunca en el repositorio:

| Variable | Qué debe contener | Estado |
|---|---|---|
| `GENESIS_MONGO_URL` | La cadena de conexión a MongoDB. **Sin ella se pierden operadores e identidades en cada despliegue.** | Ya puesta. Confirmado por `/healthz`. |
| `GENESIS_MONGO_DB` | Nombre de la base. Otro nombre = base vacía **con `almacenPersistente: true`**, o sea, la avería que peor se ve. | `genesisid`. |
| `GENESIS_PERMITIR_ARCHIVO` | **Nueva. No la ponga.** Solo existe como salida de emergencia: con `si`, el servicio arranca en Render aun sin base de datos. Sin ella, si falta `GENESIS_MONGO_URL` el servicio **se niega a arrancar** en vez de perder datos en silencio. | Sin poner, que es lo correcto. |
| `GENESIS_VETA_URL` | La dirección del backend **real** de Veta Wallet. Por defecto apunta a un host de Heroku; si el backend de `vetawallet.com` es otro, la confirmación contra el padrón falla sin decir por qué. | **Por comprobar.** |
| `GENESIS_ADMIN_EMAIL` | Correo del primer administrador, que solo se crea si no hay ningún operador. | `admin@ordenglobal.link`. |

### f) Decidir qué pasa con `genesisid.online` — **el dueño del dominio**

Hoy contesta un lander de dominio parqueado y sus `/api/portal/*` dan 404, pero
se sigue citando como «portal oficial» en `GENESIS_ID_INTEGRACION.md`, en
`genesis-id/.env.example` y en los textos de la app móvil. Mientras no se decida
si se recupera o se entierra, seguirá mandando gente a un sitio muerto.

---

## 4. Dos advertencias sobre lo que cambié

**a) El bloqueo ahora responde 429.** Cualquier cliente que dé por hecho que la
puerta solo devuelve 200 o 401 tiene que contar con ello. El panel ya lo hace.

**b) En Render ya no se arranca sin base de datos.** Es un cambio de conducta
deliberado: antes, con `GENESIS_MONGO_URL` vacía o mal escrita, el servicio
arrancaba igual, respondía 200, recreaba `admin@ordenglobal.link` con otra
contraseña y **hacía desaparecer al resto de operadores y a las identidades**.
Una pérdida de datos silenciosa en el servicio que aprueba identidades es peor
que una avería ruidosa. Consecuencia que hay que asumir: si esa variable
desaparece del panel de Render, el servicio **no levanta** y el health check
falla, con el motivo escrito en el registro de arranque. La salida de emergencia
es `GENESIS_PERMITIR_ARCHIVO=si`, y solo para un rato.

---

## 5. Lo que no hice

- **No probé a entrar con el correo de José.** Le habría sumado intentos
  fallidos y podría haberle alargado un bloqueo, sin averiguar nada que el
  código no diga ya.
- **No creé ni cambié ninguna cuenta, ni ninguna contraseña.**
- **No desplegué nada, ni borré nada.**
- **No hay ninguna contraseña, clave ni token en este documento ni en el
  código**, solo nombres de variables.

## 6. Averías pendientes que no toqué

- **La bitácora no se poda nunca** y todo el estado vive en un único documento
  de Mongo, que corta en 16 MB. Al cruzar ese límite, el guardado empieza a
  fallar; con el `guardadoOk` nuevo de `/healthz` al menos se verá, pero la cura
  es sacar `bitacora`, `movimientos` y `sesiones` a colecciones propias.
- **El bloqueo por intentos va por correo y vive en memoria.** Cualquiera puede
  dejar fuera quince minutos a un operador conocido con cinco intentos, y un
  reinicio borra todos los bloqueos. Con `trust proxy` declarado ya se puede
  añadir la IP a la llave; conviene comprobar en Render que el límite y la
  bitácora ven la dirección real del cliente.
- **La raíz sigue sirviendo el panel.** Lo suyo es que `/` sea una página
  pública y el panel viva en `/admin` —que ya funciona—, pero mover la raíz
  rompe los enlaces guardados del equipo y merece avisarlo antes.
