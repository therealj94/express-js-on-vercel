# Descargar e instalar Orden Global

**APK del 25-ago-2026 · perfil `preview` · versión 1.33.0**

https://expo.dev/artifacts/eas/eE8qIGTdiLekFFopSMx4axF4z8TH8NhpjSLZv_U5MzI.apk

Abrilo desde el teléfono y se instala. Android va a pedir permiso para
instalar desde el navegador la primera vez: es normal para un APK que no
viene de la tienda.

Comprobado desde aquí antes de dártelo: se descarga (200), pesa 137,5 MB, es
un ZIP de Android de verdad, está **firmado** con el esquema v2/v3, declara el
paquete `com.ordenglobal.app` y lleva los permisos de cámara, micrófono y
notificaciones que la app necesita.

---

## Qué trae de nuevo

Las casas del ecosistema que viven en la web se abren **dentro** de la app, con
la sesión ya puesta — no se entra dos veces:

| Dónde se toca | Qué abre |
|---|---|
| Núcleo → el planeta del chat | PULSE2CHAT, con cifrado de punta a punta y llamadas |
| Núcleo → Ordenex | La casa de cambio |
| Núcleo → AuCorp | Las cuentas en moneda local |
| Ajustes → El origen de todo | La galaxia y la película, tres minutos |

Ordenex y AuCorp estaban marcados «próximamente» en el Núcleo. Los dos
abrieron hace tiempo; ahora se entra.

El dinero **no** pasa por ahí. Las llaves, la firma de una transacción y la
huella siguen siendo nativas, donde el sistema operativo las protege de verdad.

---

## Cómo se actualiza a partir de ahora

**Por aire, y solo.** Cualquier cambio de JavaScript en `orden-global-app/` se
publica al canal `preview` al empujarlo, y el teléfono lo recibe al reabrir la
app. Sin tienda y sin volver a instalar nada.

**Lo que se abre desde la web se actualiza aún antes**: cada despliegue de
`app.vetawallet.com` llega al teléfono en el momento, sin pasar siquiera por la
actualización por aire.

**Cuándo hace falta un APK nuevo.** Solo si cambia algo NATIVO: una librería con
parte nativa, un permiso, el icono, la versión. Se pide escribiendo el perfil
en `.solicitud-de-build` y empujándolo — eso dispara la compilación sola.

La frontera la marca `runtimeVersion: fingerprint`: la huella se calcula de lo
nativo, y una actualización por aire solo llega a los teléfonos cuya huella
coincide. Es más seguro que ir por número de versión, y también más silencioso:
si algo nativo cambió, el teléfono viejo no recibe nada —en vez de recibir algo
que no puede ejecutar— pero tampoco avisa de que se quedó atrás.
