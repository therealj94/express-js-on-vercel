# Esta carpeta NO es la que se publica

Comprobado el 18/08/2026.

`legal.vetawallet.com` y `app.vetawallet.com` **no salen de aquí**. Salen de
`apps-web/veta-wallet/`, que es la app web entera de Veta Wallet: el mismo
paquete sirve la aplicación y los documentos legales.

Se comprobó descargando lo publicado y comparándolo con el repositorio: los diez
ficheros de `apps-web/veta-wallet/` coinciden byte a byte con lo que sirve
`legal.vetawallet.com`, y `privacidad.html` de ESTA carpeta no coincide —tiene
un enlace «Eliminar cuenta» que no está publicado y le falta el de Genesis ID
que sí está—.

## Por qué importa

Es una trampa silenciosa. Quien venga a corregir la política de privacidad
—como pasó hoy— edita el archivo que lleva «legal» en el nombre, lo da por
hecho, y el documento público sigue diciendo lo mismo de antes. Hoy eso habría
dejado en pie una frase que nombraba como proveedor de biometría a una empresa
que nunca llegó a conectarse.

## Qué hacer

Editar `apps-web/veta-wallet/privacidad.html` y `terminos.html`.

El despliegue de esa carpeta es **manual** en AWS Amplify (app `vetawallet-legal`,
appId `d264zjawew1yea`, rama `main`): se sube un zip con `create_deployment` +
`start_deployment`. No hay repositorio conectado, así que un `git push` no
publica nada por su cuenta.

## Y `www.vetawallet.com`

Va por su propia distribución de CloudFront (`d1ceoywtt4iywx`), que **no está en
la cuenta de AWS 548380372606**. Desde aquí no se puede desplegar ni invalidar
su caché, y esa caché es de un año en el borde. Hace falta saber quién la
administra: mientras tanto, `www` puede seguir sirviendo una versión vieja de los
documentos legales aunque `legal` y `app` ya estén corregidos.

## Esta carpeta

Se deja porque no está claro si algo más apunta a ella. Antes de borrarla hay
que confirmarlo. Lo que no hay que hacer es editarla creyendo que se publica.
