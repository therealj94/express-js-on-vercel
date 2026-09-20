# Cómo subir esto al dominio

El árbol de `apps-web/veta-wallet/` ya está compilado, sellado y comprobado con
la galaxia nueva dentro. **Falta solo el último paso: la subida.** No se pudo
hacer desde aquí porque las credenciales de AWS de la sesión están caducadas —
STS responde `InvalidClientTokenId`, así que no es un problema de permisos sino
de la llave misma.

## El comando

    cd <raíz del repositorio>
    python3 apps-web/subir.py apps-web/veta-wallet d264zjawew1yea

Con `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` buenas en el entorno, y
`boto3` y `requests` instalados. Son 86 archivos, 96 MB; el guion reintenta
cuatro veces cada archivo y cancela solo un despliegue anterior que hubiera
quedado a medias.

## Qué comprobar después

    python3 apps-web/comparar-publicado.py apps-web/veta-wallet https://app.vetawallet.com

Tiene que decir **iguales: 86, 0 distintos**. Y en el navegador:

- La pantalla de entrada debe pedir `augalaxy/assets/augalaxy.js?v=741afcb9b0`.
  Si pide otro sello, el navegador se quedó con la copia vieja.
- Ajustes enseña el sello de la casa: **6dc6025876**.
- Los nueve mapas de `augalaxy/textures/` deben responder 200. Si faltan, los
  planetas salen dibujados por procedimiento: se ve distinto, no roto, y por eso
  es fácil que pase inadvertido.

## Si algo sale mal

La vuelta atrás es el árbol que estaba sirviendo el dominio antes de esto, que
quedó versionado entero en el commit **a63bb194**:

    git checkout a63bb194 -- apps-web/veta-wallet
    python3 apps-web/subir.py apps-web/veta-wallet d264zjawew1yea

## Lo que sigue sin comprobarse

Un visor de verdad, un teléfono de verdad y el login de producción con una
cuenta real. Lo que sí está comprobado, con la wallet real servida en local y el
motor nuevo dentro: el motor monta, la puerta de entrada se dibuja sobre la
galaxia, los cuatro globales del visor están puestos, los 14 pedidos a
`/augalaxy/` responden y no hay un solo error de consola.
