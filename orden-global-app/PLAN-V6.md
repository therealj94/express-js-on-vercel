# V6 — Genesis ID perfecto, bienvenida, GID en el chat y AURO final (15-ago)

## 1 · Nadie se queda sin Genesis ID

Bug confirmado en `src/screens/Auth.js`:
- `terminarSocial()` (Google/Apple) → `nav(seenOnboarding() ? 'ecosistema' : 'onboarding')` — **jamás pasa por `genesisOffer`**.
- Login con correo de cuenta vieja → `'ecosistema'` directo. Solo el REGISTRO nuevo ve la oferta.

Arreglo (el mismo camino para todos):
- Tras CUALQUIER login, si `!account.genesisUid` → pasar por **`genesisOffer`**
  (la pantalla ya existe). Que ofrezca «Ahora no» pero recuerde: un aviso
  persistente y elegante en el Núcleo (anillo ámbar en el nodo Genesis ID +
  ficha «Completa tu Genesis ID») hasta que lo tenga.
- AURO CHAT ya exige Genesis: su candado es la red de empuje natural — está
  bien, no tocarlo.

## 2 · La verificación que pasa sola

Lo que hay: `mrzOcr.js` lee MRZ (reverso) y tiene lector de ANVERSO (nombre
impreso, línea ~314). `RostroGuia.js` guía el selfie. El puente `/genesis`
declara datos y sube evidencias.

Objetivo «pase automático sin revisión manual»:
- **Leer el nombre del FRENTE del documento** y precargarlo (editable), no
  pedir que lo tecleen. Si el anverso no se deja leer, pedir el reverso (MRZ,
  más fiable) y sacar nombre+fecha+número de ahí.
- Guiar mejor la foto: marco con la proporción del documento, aviso de luz
  (usa la varianza del frame si la cámara la da barata), y NO aceptar la foto
  hasta que el OCR encontró un nombre — mejor repetir foto que mandar basura
  a revisión manual.
- Cotejo local honesto: nombre del OCR vs nombre declarado (normalizados);
  si coinciden y hay selfie, marcar la solicitud como `cotejo:'automatico'`
  al puente. La APROBACIÓN sigue siendo del servidor Genesis — la app no
  puede autoconcederla, y no debe fingir que sí.
- Estados claros en pantalla: leyendo → leído «JOSÉ ENAMORADO» ✓ → selfie →
  enviado → aprobado/pendiente con lenguaje humano.

## 3 · Bienvenida de primera vez

`Onboarding.js` existe (3 pantallas de la wallet). Se rehace como
**«Bienvenido a Orden Global»**: 4-5 tarjetas —el ecosistema (núcleo),
tu dinero (wallet), tu negocio (MyTokenPay), tu gente (AURO CHAT), NEXUS—
con los logos reales, animación sobria, **SALTAR** siempre visible arriba,
y al final «crea tu Genesis ID» si no lo tiene. Se muestra UNA vez
(seenOnboarding ya existe).

## 4 · El GID viaja por el chat

- En AURO CHAT ajustes y en el pasaporte: **mi GID visible y copiable**
  (toque = copiar, toast «GID copiado»).
- Buscador del chat: además de nombre/correo, **buscar por GID** — el relevo
  necesita el GID en la ficha: `/alta` y `/perfil` aceptan `gid`, `/buscar`
  busca también por él (empieza-por, insensible a mayúsculas).
- Resultado: la persona aparece **solo con su nombre** (no el correo en
  grande), botón AGREGAR → queda en `og.contactos` **y** en la libreta de la
  wallet (`addressBook.addContact` si trae addr) — un solo guardado, dos
  sitios, como pidió.
- Compartir: botón «compartir mi GID» (Share nativo) con texto listo.

## 5 · AURO CHAT sin cara de prototipo

Caza de textos que delatan: «sin cifrado de extremo a extremo», «los chats
no se guardan», «de ejemplo», avisos técnicos en pantallas de uso diario.
- La VERDAD no se borra: **se muda a donde corresponde** — AjustesAuro →
  «Privacidad y seguridad», escrita en lenguaje de producto («Tus mensajes
  viajan cifrados hasta el servidor de Orden Global. El cifrado de extremo a
  extremo llegará en una próxima versión.»). Nada de eso en la lista ni en
  el hilo.
- Pulir: burbujas, tiempos («ayer», «lun»), avatar con foto de perfil real
  (ya hay `/perfil` con foto), separadores, vacíos con ilustración sobria y
  UNA frase, sin tecnicismos. Header con presencia (foto + nombre + GID
  pequeño). Los ✓ y ✓✓ si el dato existe (entregado = llegó al relevo).

## Reglas vigentes
- La app NUNCA aprueba identidades: eso es del servidor Genesis.
- Estados honestos, pero en lenguaje de producto, no de laboratorio.
- Módulos nativos nuevos: prohibidos en esta tanda (todo debe viajar por aire
  salvo lo ya pendiente de APK).
