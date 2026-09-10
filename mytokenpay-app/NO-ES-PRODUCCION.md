# Esta carpeta NO es lo que corre en producción

`mytokenpay-app/` es una versión **vieja** del servicio MyTokenPay. Tiene `auth`
y `companies`, y guarda todo en tres `Map()` de JavaScript —es decir, en memoria,
y se borra en cada reinicio.

El servicio real —`mytokenpay-api` en Heroku— lleva mucho más: cobros con cuenta
dividida, retiros, premios, actividad, tasas, verificación en cadena, panel de
administración propio y el puente `/genesis/*`. Ese código está en:

    infra/mytokenpay-api/

**No despliegues desde aquí.** El 20 de agosto se hizo, y durante ~50 minutos
producción se quedó sin cobros, sin retiros y sin panel. El detalle completo, y
la comprobación que hay que correr antes de cualquier despliegue, están en
`infra/mytokenpay-api/PROCEDENCIA.md`.

Esta carpeta se conserva únicamente porque `mytokenpay-app/mobile/` (la app Expo)
sigue viviendo aquí. El `src/` de al lado es historia.
