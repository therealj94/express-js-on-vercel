# Descargar la app y actualizarla por aire

Preguntaste por qué no se hizo. La respuesta corta: **no se hizo porque nunca
llegó a correr**. No fue una decisión ni un olvido de configurar algo en el
teléfono — el mecanismo estaba montado y roto en dos puntos, y los dos se
arreglan en este mismo commit.

Esto es lo que encontré al mirar el historial real de ejecuciones del
repositorio.

---

## Lo que pasó de verdad

### 1. La descarga: el compilador nunca se ejecutó, ni una vez

El workflow `Veta Wallet — compilar Android` existe desde hace días. Su
historial de ejecuciones está **vacío**: cero corridas. Sólo se dispara a mano
y nadie lo disparó nunca.

Por eso no hay nada que descargar. No hay APK, no hay `.aab`, no hay build en
el panel de Expo. No es que la descarga fallara: nunca hubo archivo.

### 2. El "por aire": disparó 11 veces y falló las 11

El workflow de actualizaciones sí corrió, entre el 5 y el 7 de agosto:

```
2026-08-07  Veta Wallet — publicar preview   failure
2026-08-07  Veta Wallet — publicar preview   failure
2026-08-06  Veta Wallet — publicar preview   failure
2026-08-06  Veta Wallet — publicar preview   failure
2026-08-06  Veta Wallet — publicar preview   cancelled
2026-08-06  Veta Wallet — publicar preview   failure
2026-08-05  ... (5 más)                      failure
```

**Ninguna terminó bien.** Todas se cayeron en el mismo escalón, `npm ci`, a
segundo y medio de arrancar: el `package-lock.json` que estaba en el
repositorio no coincidía con el `package.json`, y `npm ci` —a diferencia de
`npm install`— se niega a seguir cuando eso pasa. Es su trabajo negarse: si
instalara "lo más parecido", cada build traería un juego de dependencias
distinto.

Ese desfase **ya está corregido**: el lock se regeneró con el commit de la
1.33.0. Lo comprobé aquí, `npm ci` ahora pasa limpio.

### 3. Y después del 7 de agosto, ni siquiera disparó

El workflow escuchaba empujes a la rama `claude/veta-wallet-phantom-design-x37uqw`.
El trabajo se mudó a `claude/veta-wallet-phantom-design-7syah8` — que es donde
están el acceso con Google, el acceso con Apple, la ficha de la tienda y todo
lo de estos días.

El disparador se quedó apuntando a la rama vieja. **Cada commit desde entonces
publicó exactamente nada, sin error y sin aviso**, porque para GitHub no había
nada que hacer. Es la peor clase de falla: silenciosa.

Corregido en este commit: ahora apunta a la rama en la que estamos.

---

## El tercer problema, que no habías visto y era el peligroso

Aunque las dos cosas anteriores hubieran funcionado, **publicar la 1.33.0 por
aire habría roto los teléfonos que hoy tienen la 1.32.0 instalada.**

`runtimeVersion` decía `sdkVersion`. Esa regla dice: *"toda app compilada con
el mismo SDK de Expo puede recibir el mismo update"*. Las dos son SDK 54, así
que para Expo eran intercambiables.

No lo son. La 1.33.0 agrega dos módulos **nativos**:

- `expo-apple-authentication`
- `expo-auth-session`, que a su vez arrastra `expo-application`

Un módulo nativo es código compilado dentro del binario. Por aire sólo viaja
JavaScript. El JavaScript de la 1.33.0 llama a `expo-application`; en el
binario de la 1.32.0 ese módulo **no existe**, nunca se compiló ahí. El
resultado no es un botón que no anda: es la pantalla de acceso cayéndose al
abrir, en teléfonos que hoy funcionan bien.

Lo cambié a `appVersion`. Ahora la frontera es el número de versión:

> Un update publicado desde la **1.33.0** llega **sólo** a los teléfonos que
> tengan instalada la **1.33.0**.

Es una regla que se puede tener en la cabeza sin consultar nada.

---

## Entonces, la 1.33.0 ¿se puede mandar por aire?

**No.** Y no es una limitación que se pueda esquivar: trae módulos nativos.
Tiene que salir como binario nuevo — compilar, instalar, y en el caso de
producción, pasar por la tienda.

Lo que sí viaja por aire es **todo lo que venga después**, mientras no se toque
nada nativo: textos, traducciones, pantallas, colores, arreglos de lógica,
cambios en las llamadas al servidor. Eso llega en minutos y sin revisión de
Google.

| Cambio | ¿Por aire? |
|---|---|
| Corregir un texto, un precio, una traducción | sí |
| Rediseñar una pantalla entera | sí |
| Arreglar un error de cálculo o de red | sí |
| Agregar un módulo nativo (cámara, Apple, notificaciones…) | **no**, build |
| Cambiar permisos, icono, nombre o versión | **no**, build |

---

## Cómo se hace, hoy

Todo sale de la pestaña **Actions** del repositorio. Son tres clics y no hay
que instalar nada en tu computadora.

### Para tener algo que descargar

**Actions → `Veta Wallet — compilar Android` → Run workflow**

1. En **Use workflow from**, elegí la rama
   `claude/veta-wallet-phantom-design-7syah8`. *Este paso es el que se olvida.*
   Si queda en `main`, compila código viejo sin acceso con Google.
2. En **Perfil de build**, elegí:

   | Perfil | Qué sale | Para qué |
   |---|---|---|
   | `preview` | **APK** | probar en tu teléfono. Se instala directo. **Empezá por acá.** |
   | `production` | **AAB** | subir a Google Play. No se instala en un teléfono. |
   | `development` | APK | desarrollo en vivo |

3. Run workflow. Tarda entre 10 y 25 minutos.
4. El enlace de descarga aparece en el resumen de la corrida y en
   <https://expo.dev/accounts/vetawallet/projects/veta-wallet/builds>

### Para actualizar por aire

**Actions → `Veta Wallet — actualizar por aire` → Run workflow**

Elegí la misma rama, y el canal:

| Canal | A quién llega |
|---|---|
| `preview` | los teléfonos con el APK de prueba |
| `development` | los teléfonos con la app de desarrollo |
| `production` | **los teléfonos que la instalaron desde Google Play** |

`production` cambia lo que ve la gente de verdad, sin que Google lo revise. Es
una herramienta buena y peligrosa por la misma razón.

También se dispara solo con cada empuje a la rama de trabajo, al canal
`preview`. Eso es lo que estaba roto y ya no lo está.

### Qué ve la persona en el teléfono

Esta parte ya estaba bien hecha y no había que tocarla. La app pregunta si hay
algo nuevo al abrirse y cada vez que vuelve del segundo plano, como mucho una
vez cada 10 minutos. Si hay update, lo descarga en silencio y **muestra una
cinta con un botón "Aplicar"**.

Nunca se reinicia sola. Fue a propósito: reiniciarse a la mitad de un envío
sería peor que esperar.

---

## Qué necesito de vos

### Para lanzar las builds y los updates yo mismo

Lo intenté. La respuesta del servidor, textual:

```
POST /repos/therealj94/express-js-on-vercel/actions/workflows/veta-build.yml/dispatches
403 Resource not accessible by integration
```

El permiso que me falta se llama **Actions: Read and write**, y va en la
instalación de la app de Claude en el repositorio:

**GitHub → tu perfil → Settings → Applications → Claude → Configure →**
**Permissions → Actions: Read and write**

Con eso, "compilá la app" o "mandá el arreglo por aire" pasan a ser una frase
tuya y nada más.

**Mi recomendación es que no lo des todavía.** Los dos primeros disparos
conviene hacerlos vos, mirando el resultado: es la diferencia entre saber que
el mecanismo anda y suponerlo. Después, si querés, lo activás.

Hay una alternativa —darme un `EXPO_TOKEN` y que compile desde acá, salteando
GitHub— pero implica pasarme una credencial por chat, que es justo lo que
venimos evitando, y no aporta nada que los tres clics no den. No la recomiendo.

### Para que la 1.33.0 sirva de algo

El acceso con Google **no va a funcionar** en la build hasta que existan los
tres identificadores de OAuth y estén puestos en `eas.json`. Sin ellos el botón
ni siquiera aparece — está escondido a propósito, para que nadie vea un botón
muerto. El paso a paso está en `PUBLICAR-1.33.md`.

El orden importa:

```
identificadores de Google  →  desplegar el backend  →  compilar  →  probar  →  subir
```

Compilar antes del primer paso da una app sin el botón.

---

## Aparte: encontré un error que bloquea la tienda

Iba a borrar la cuenta de diagnóstico que usé para probar el cifrado
(`diagnostico-cifrado-11ago@ordenglobal.org`). No pude. El servidor responde
500. Fui a los registros de Heroku y la causa está escrita con todas las
letras:

```
[delete-account] MongoServerError: E11000 duplicate key error
  collection: wallet.users  index: username_1  dup key: { username: null }
```

`deleteAccount` anonimiza la cuenta poniendo `user.username = undefined`. Mongo
lo guarda como `null`. Pero hay un índice **único** sobre `username`.

La consecuencia: **la primera cuenta que se borra funciona. La segunda y todas
las siguientes fallan**, porque ya hay un `null` ocupando el lugar. Alguien ya
borró una cuenta antes, así que hoy la función está muerta para todo el mundo.

Por qué importa más de lo que parece:

- Google Play **exige** que se pueda borrar la cuenta desde dentro de la app.
  Apple también.
- La ficha que preparamos **declara** que se puede
  (`Data safety → You can request that data be deleted → Yes`).
- Un revisor que lo pruebe dos veces lo ve fallar.

El arreglo es de una línea, en `controller/userController.js`, donde hoy dice
`user.username = undefined;`. En vez de dejarlo nulo, darle un valor único —el
mismo patrón que ya usa la línea del correo dos renglones más arriba:

```js
// El correo ya se anonimiza así:
user.email = `eliminado+${sufijo}@vetawallet.invalid`;
// El nombre de usuario tiene que seguir la misma idea, no quedar nulo:
user.username = `eliminado+${sufijo}`;
```

Conviene además volver el índice `sparse`, para que ninguna cuenta vieja con
`username` nulo vuelva a chocar.

**No lo desplegué.** Desplegar el backend es de las cosas que quedamos en no
hacer sin vos. Está listo para cuando digas; con eso desplegado, borro la
cuenta de diagnóstico en el mismo momento.

---

## Resumen

| | Estado |
|---|---|
| `npm ci` fallaba y tumbaba todas las publicaciones | arreglado (lock regenerado) |
| El disparador apuntaba a la rama vieja | **arreglado en este commit** |
| `runtimeVersion` habría roto los teléfonos con la 1.32.0 | **arreglado en este commit** |
| No se podía publicar a `production` por aire | **agregado en este commit** |
| Nunca se compiló nada | te toca: Actions → compilar → `preview` |
| No puedo disparar los workflows | permiso `Actions: Read and write`, cuando quieras |
| Borrar la cuenta está roto en producción | arreglo escrito, falta desplegarlo |
