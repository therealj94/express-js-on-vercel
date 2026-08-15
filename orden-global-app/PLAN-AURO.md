# AURO CHAT — la mensajería de Orden Global (spec, 15-ago)

El chat pasa a llamarse **AURO CHAT**. Deja de ser una lista de contactos y
se vuelve mensajería completa: grupos con su nombre, su foto y su enlace de
invitación; foto de perfil; guardar contactos al escanear; y —lo que la
vuelve nuestra— **el pago dentro de la conversación**: envías ORIGEN y en el
hilo aparece el comprobante, al instante, sin salir a contarlo aparte.

## El contrato del relevo (infra/mensajes/servidor.py)

Todo POST va firmado con `{correo, llave}` salvo `/alta`. Lo que ya existe
—`/alta /enviar /bandeja /buscar /conversaciones /leido /ficha /subir` y
`GET /archivo/<id>`— **no cambia de forma**; se le añade:

| Ruta | Cuerpo | Devuelve |
|---|---|---|
| `/perfil` | `{nombre?, foto?}` | `{ok}` — editar mi nombre y mi foto (`foto` = id de `/subir`) |
| `/ficha` | `{de}` | ahora incluye `foto` |
| `/alta` | acepta `foto` | igual |
| `/grupo/crear` | `{nombre, foto?, miembros:[correo]}` | `{id:'g:<16hex>', invitacion:'<24hex>'}` |
| `/grupo/info` | `{id}` | `{id,nombre,foto,admin,invitacion,miembros:[{correo,nombre,foto}]}` |
| `/grupo/editar` | `{id, nombre?, foto?}` | `{ok}` — **solo el admin** (quien lo creó) |
| `/grupo/invitar` | `{id, correos:[]}` | `{ok, añadidos}` — miembro puede invitar |
| `/grupo/unirse` | `{invitacion}` | `{id, nombre}` — entrar por enlace/QR |
| `/grupo/salir` | `{id}` | `{ok}` (si sale el admin, hereda el más antiguo) |
| `/pago` | `{para, monto, moneda?, hash?, nota?}` | mensaje `tipo:'pago'` en el hilo |

Reglas del servidor:
- `para` en `/enviar` y `desde` en `/bandeja` aceptan **correo o id de grupo**
  (`g:…`). En un grupo, solo reciben/leen sus miembros — comprobado en cada
  petición, no solo al entrar.
- `/conversaciones` devuelve también los grupos, con `{esGrupo:true, nombre,
  foto, miembros:<n>}` y su último mensaje.
- Un mensaje de grupo lleva `de` (correo del autor) para pintar quién habla.
- La invitación es una **capability**: el token largo ES el permiso. Se puede
  regenerar (`/grupo/editar` con `{nuevaInvitacion:true}`) para invalidar la
  anterior.

## El pago en la conversación (lo que tiene que sentirse rápido)

1. En el hilo, **ENVIAR ORIGEN** abre la pantalla nativa de envío ya
   preparada, con un dato más: `avisarChat` = el correo (o el id del grupo).
2. Cuando la persona **firma y el envío sale bien**, la wallet llama a
   `/pago` con el monto y el hash.
3. En el hilo aparece una **tarjeta de pago** —no un texto—: monto grande en
   oro, ✓ confirmado, la hora, y "ver en el explorador" con el hash.
   Del otro lado se ve igual, con el verbo cambiado (recibiste).

NEXUS nunca transmite: sigue preparando y firmando la persona. El aviso se
manda **después** de que la cadena confirmó, nunca antes.

## Las pantallas

- `AuroChat.js` (renombra ChatOG.js) — conversaciones + hilo + tarjetas de
  pago + adjuntos + escanear→**guardar contacto**.
- `GruposAuro.js` — crear grupo (nombre, foto, miembros), su ficha con QR y
  enlace de invitación, editar, invitar, salir.
- `AjustesAuro.js` — mi perfil (nombre y foto), mi código QR, privacidad
  (qué se ve de mí), y lo honesto: **sin cifrado de extremo a extremo en esta
  versión**, dicho en su sitio y no escondido.

Rutas nuevas del mapa (`src/og/rutas.js`):
`chat/abrir` (ya) · `chat/grupo` → `{p:'auro-grupo'}` (params `id` o `inv`) ·
`chat/ajustes` → `{p:'auro-ajustes'}` · `chat/nuevo-grupo` → `{p:'auro-nuevo'}`

## Reglas que no cambian
- AURO CHAT solo con **Genesis ID aprobado**.
- Sin E2E en esta versión — no se promete en ningún texto.
- Adjuntos ≤ 8 MB; el id largo del archivo es su permiso.
- Todo movimiento pasa por el MAPA.
