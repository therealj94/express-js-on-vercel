# De dónde salió este código, y por qué está aquí

## Qué es esta carpeta

Es el código que **corre ahora mismo** en `mytokenpay-api` (Heroku,
`mytokenpay-api-5ab43b64205a.herokuapp.com`). No es una copia de trabajo ni un
borrador: se sacó del *slug* que Heroku tenía desplegado, para que el repositorio
por fin tenga una copia de lo que está en producción.

Se quitaron tres cosas del slug al importarlo, ninguna afecta al servicio:
`.heroku/` y `.profile.d/` (el runtime de Node que mete el buildpack, 151 MB),
y `.agents/` + `skills-lock.json` (documentos de diseño, no código).

## Por qué no estaba en el repositorio

Nunca se subió. `mytokenpay-app/` —la otra carpeta de este repositorio— es una
versión **anterior y mucho más pequeña** del mismo servicio: tiene `auth` y
`companies`, y el almacén son tres `Map()` en memoria. Producción, en cambio,
lleva cobros con cuenta dividida, retiros, premios, actividad, tasas, cadena, su
propio panel de administración y el puente `/genesis/*`. Alguien siguió
trabajando sobre el servidor y ese trabajo no volvió al repositorio.

## El incidente del 20 de agosto

El 20 de agosto, entre las 17:04 y las 17:55, se desplegó `mytokenpay-app/` sobre
`mytokenpay-api` creyendo que era el mismo código. No lo era: durante esos ~50
minutos producción sirvió la versión vieja, y con ella desaparecieron los cobros,
los retiros, los premios, la actividad y el panel de administración.

Se restauró volviendo al slug anterior (release 28). **Los datos quedaron
intactos** —205 usuarios, 140 comercios, 80 cobros, 75 movimientos, 72 sellos, 7
retiros, todos anteriores al incidente— porque las escrituras de la versión vieja
chocaban con los índices únicos de la base real y fallaban en vez de escribir.
Lo único que quedó son unas doce cuentas y comercios de prueba con correos
`@ordenglobal.test`.

La causa fue no comprobar antes de desplegar. La comprobación existe y se hizo
para `vetawallet` ese mismo día: **bajar el slug vivo y compararlo con el
repositorio**. Para `mytokenpay-api` no se hizo.

## Antes de desplegar esta carpeta, siempre

```sh
# 1. Bajar lo que está corriendo
curl -n -X POST https://api.heroku.com/apps/mytokenpay-api/slugs \
  -H 'Accept: application/vnd.heroku+json; version=3'   # → url de descarga

# 2. Comparar la lista de rutas del slug con la de aquí
grep -rnE "Router\.(get|post|put|patch|delete)\(" src/routes/ | sort

# 3. Si en el slug hay rutas que aquí no están, PARAR.
```

Un despliegue que **quita** rutas no es un despliegue: es una pérdida.

## El mapa de rutas de producción, a día de hoy

```
/api/auth        signup · login · me · forgot-password · reset-password · sso
/api/companies   / · /mine · /:id · POST / · PUT /:id · POST /:id/kyc
/api/cobros      POST / · /mios · /mios/:id · /mios/:id/anular
                 /mios/verificar-todos · /mios/:id/verificar
                 /codigo/:codigo · /codigo/:codigo/reservar
                 /codigo/:codigo/liberar · /codigo/:codigo/pagar
/api/retiros     solicitudes de retiro a lempiras
/api/admin       revisión de KYB y resolución de retiros
/api/actividad   bitácora
/api             premios · categories · countries · tasa
/genesis         estado · datos · documento · biometria · vincular
                 sso/token · billetera · tamiz/:direccion · movimientos
/admin           panel estático (src/publico/admin.html)
```
