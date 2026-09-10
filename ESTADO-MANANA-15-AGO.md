# Qué se encontrará la gente al abrir · cierre del 15-ago, madrugada

## Funciona, comprobado esta noche

| | |
|---|---|
| Cadena **5550** | viva · 4 validadores · Besu QBFT · Shanghai · bloques cada 10 s |
| RPC `rpc/www/raíz .ordenglobal-rpc.com` | sirve la 5550 · atiende apps **y navegadores** (CORS puesto) |
| Saldos | se leen de la 5550, en app y en web |
| Envíos de ORIGEN | **probados con dinero real**: bloque 369, recibido |
| Precio de ONDK (2,10 USD) | arreglado y desplegado en el backend |
| Ordenscan | indexa la 5550 y muestra la transacción con su recibo |
| App | por aire: red 5550, teclado, copiar GID, sonidos, NEXUS |
| Web | desplegada en app. / legal. / www con la ficha «Layer 1 · Besu QBFT · Shanghai» |

## No funciona, y hay que decirlo

### 1 · La web solo deja enviar ORIGEN
En el teléfono se elige ONDK, AUKA, etc.; en la web no. **Esa pantalla nunca se
terminó** — no es algo que rompiera la migración. Es trabajo de producto.

### 2 · Genesis ID desde la web
El flujo quedó a medias y tiene un bloqueador que **decide José**: el puente
solo acepta el documento como TEXTO de la banda del pasaporte (MRZ), porque se
diseñó dando por hecho que el móvil lo lee con la cámara. Por web hay dos
caminos: teclear esa banda a mano, o hacer el lector dentro del navegador.

### 3 · El aviso «este chat quedó en tu instalación anterior»
A quien **reinstaló antes de anoche** le sale, porque su correo quedó reclamado
por una llave que se borró con la app. Ya no le pasará a nadie nuevo: el arreglo
publicado guarda la llave por cuenta y lee la que el relevo devuelve.

**El botón de recuperación que pidió José es lo correcto y está sin hacer.** Va
antes una cosa, y no es opcional: el secreto que firma las sesiones de la wallet
(`PASS_TOKEN`) tiene **siete caracteres** y lleva pendiente de rotar (tarea #27).
La recuperación honesta se apoya en esa sesión — montarla sobre una firma que ya
sabemos débil sería abrir la puerta de las cuentas con una cerradura floja.
Orden: **rotar el secreto y después el botón.**

Mientras tanto se desbloquea a mano en un minuto: liberar su ficha en
`/srv/mensajes/datos.json` (nodo `i-0aff688efc52ab8c8`). **Los mensajes NO se
pierden**: viven en otra lista y apuntan al correo, no a la ficha. Comprobado
dos veces con la cuenta de José (23 mensajes intactos).

### 4 · La 8532 sigue encendida
A propósito: es el respaldo. Pararla es una orden de José y son minutos. La
vuelta atrás completa sigue armada (regla del balanceador anotada en
`scratchpad/vuelta-atras-rpc.txt`, red de pruebas intacta en su carpeta).

## Lo primero de mañana
1. Que José confirme el precio de ONDK al enviar, **tras cerrar y abrir la app**
   (el backend se desplegó después de su última prueba).
2. Rotar `PASS_TOKEN` → y con eso, el botón de recuperar el chat.
3. La web al nivel de la app: enviar cualquier token, Genesis ID, diseño móvil.

## Y lo que no puede esperar
**Revocar el token de Heroku y el de Expo.** El de Heroku da acceso a la clave
privada de tesorería y a todas las claves de servicios del backend.
