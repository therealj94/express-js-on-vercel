// ============================================================
// Versión de Veta Wallet.
//
// Sirve para saber QUÉ build está corriendo en el teléfono: la versión se ve
// en el login, en el splash y en Ajustes → Acerca de. Cada vez que se
// entrega un cambio se sube VERSION y se añade su entrada en CHANGELOG.
//
// Regla: VERSION debe coincidir con `expo.version` de app.json.
//   mayor.menor.parche  →  1.2.0
//   BUILD sube de uno en uno en CADA entrega, sin excepción.
// ============================================================

export const VERSION = '1.11.2';
export const BUILD = 41;
export const RELEASED = '2026-07-31';

export const versionLabel = () => `v${VERSION} · build ${BUILD}`;

// Historial visible dentro de la app (Ajustes → Novedades).
// El más reciente primero. `es`/`en` para que se lea en ambos idiomas.
export const CHANGELOG = [
  {
    v: '1.11.2',
    build: 41,
    date: '2026-07-31',
    es: [
      'Tarjeta rediseñada en negro y dorado, con el monograma de Orden Global y el grabado de circuito de la tarjeta física.',
      'El nombre del titular y el CVV ahora se leen sin esfuerzo: el titular subió de tamaño y el CVV va en una caja blanca con dígitos negros grandes, como en una tarjeta de verdad.',
      'Después de poner tu contraseña podés copiar por separado el número, el CVV y el vencimiento con un toque. Antes solo se podía copiar el número, y copiar todo junto no sirve para pegarlo en una tienda.',
    ],
    en: [
      'Card redesigned in black and gold, with the Orden Global monogram and the circuit engraving from the physical card.',
      'The cardholder name and CVV are now effortless to read: the name is larger and the CVV sits in a white box with big black digits, like on a real card.',
      'After entering your password you can copy the number, CVV and expiry separately with one tap. Previously only the number could be copied, and copying everything together is useless when pasting into a store.',
    ],
  },
  {
    v: '1.11.1',
    build: 40,
    date: '2026-07-31',
    es: [
      'Al pedir el PIN salía un error de servidor. La causa: tu tarjeta es virtual y las virtuales no usan PIN — se paga con el número, sin cajero — así que el emisor no tiene ese dato. Ahora la app te lo explica en vez de mostrar un error, y no ofrece el PIN cuando la tarjeta no lo maneja.',
    ],
    en: [
      'Requesting the PIN showed a server error. The cause: your card is virtual, and virtual cards do not use a PIN — you pay with the number, no ATM — so the issuer has no such data. The app now explains this instead of showing an error, and no longer offers the PIN when the card does not support one.',
    ],
  },
  {
    v: '1.11.0',
    build: 39,
    date: '2026-07-31',
    es: [
      'La pantalla de tu tarjeta ahora está conectada de verdad: los últimos 4 dígitos, el estado, el saldo disponible, los límites y tus consumos vienen del emisor, no de la app.',
      'IMPORTANTE — "Congelar tarjeta" ahora congela de verdad. Antes el interruptor solo cambiaba el dibujo en pantalla y la tarjeta seguía activa. Si alguna vez la congelaste creyendo que quedaba bloqueada, revisá tus movimientos: no lo estaba. Ahora, si el bloqueo no se puede aplicar, la app te lo dice y el interruptor vuelve a su lugar.',
      'Ver el número completo, el vencimiento, el CVV y el PIN ahora pide tu contraseña cada vez, muestra los datos reales de tu tarjeta y los oculta solos a los 45 segundos. Nunca se guardan en el teléfono.',
      'Si todavía no tenés tarjeta, podés solicitarla desde la app. Se emite a tu nombre y requiere tener la identidad verificada.',
    ],
    en: [
      'Your card screen is now genuinely connected: the last 4 digits, status, available balance, limits and your purchases all come from the issuer, not from the app.',
      'IMPORTANT — "Freeze card" now actually freezes. The toggle previously only changed what was drawn on screen while the card stayed active. If you ever froze it believing it was blocked, review your transactions: it was not. Now, if the block cannot be applied, the app tells you and the toggle reverts.',
      'Viewing the full number, expiry, CVV and PIN now asks for your password every time, shows your card\'s real details, and hides them automatically after 45 seconds. They are never stored on your phone.',
      'If you do not have a card yet, you can request one from the app. It is issued in your name and requires a verified identity.',
    ],
  },
  {
    v: '1.10.8',
    build: 38,
    date: '2026-07-31',
    es: [
      'Corregido un error grave en Remesas: al tocar "Enviar remesa" el monto en dólares pasaba a la pantalla de envío como si fueran ORIGEN, así que se enviaba más del doble de lo que pediste. Ahora se convierte al precio del día y la pantalla de envío te recuerda cuántos dólares pediste mandar, para que puedas revisarlo antes de firmar.',
      'Los montos con coma ya se entienden bien. En un teléfono en español el teclado escribe coma, y antes "1,5" se enviaba como 1. Ahora la coma vale como decimal en Enviar, Recibir, Comprar e Intercambiar. Un monto que no se entienda se rechaza en vez de adivinarse.',
      'La pantalla de confirmación ahora es la única que manda: se firma exactamente el destino y el monto que revisaste. Antes, si algo cambiaba mientras la ficha estaba abierta — un enlace de pago entrante, el escáner — podía salir un envío distinto del aprobado.',
    ],
    en: [
      'Fixed a serious bug in Remittances: tapping "Send remittance" passed the dollar amount to the send screen as if it were ORIGEN, so more than twice the requested value was sent. It now converts at today\'s price, and the send screen reminds you how many dollars you asked to send so you can check before signing.',
      'Amounts typed with a comma now work. On a Spanish-language phone the keypad types a comma, and "1,5" used to be sent as 1. The comma is now read as a decimal in Send, Receive, Buy and Swap. An amount that cannot be read is rejected instead of guessed.',
      'The confirmation screen is now the single source of truth: exactly the recipient and amount you reviewed get signed. Previously, anything that changed while the sheet was open — an incoming payment link, the scanner — could result in a different transfer than the one approved.',
    ],
  },
  {
    v: '1.10.7',
    build: 37,
    date: '2026-07-31',
    es: [
      'Arreglada la raíz del bug de ONDK: el servidor cerraba la sesión a los 40 min y, si no tenías "Recordarme" activado, la app se quedaba pegada pidiendo datos con una sesión vencida (por eso a veces no llegaba el precio ni el historial). Ahora el backend entrega también un token de renovación que dura 30 días y la app lo usa para renovar la sesión sola, sin pedir contraseña de nuevo — pase lo que pase con "Recordarme".',
    ],
    en: [
      'Fixed the root cause of the ONDK bug: the server ended your session after 40 min and, without "Remember me" on, the app kept requesting data with an expired session (why price and history sometimes did not load). The backend now also issues a 30-day renewal token and the app uses it to renew the session on its own, without asking for your password again — regardless of "Remember me".',
    ],
  },
  {
    v: '1.10.6',
    build: 36,
    date: '2026-07-30',
    es: [
      'ONDK ahora siempre muestra un precio: si el servidor no lo devuelve y el teléfono nunca lo cacheó, se usa un valor de referencia ($2.10) para que las cuentas nuevas no queden con "—" en la ficha. El precio real del servidor siempre gana en la siguiente carga que sí lo mande.',
      'Es un parche mientras arreglamos la raíz en el backend. La solución definitiva llega apenas tengamos acceso a Heroku (API key).',
    ],
    en: [
      'ONDK now always shows a price: if the server does not return it and the phone never cached it, a reference value ($2.10) is used so fresh accounts do not see "—". The real server price always wins on the next load that includes it.',
      'This is a patch while we fix the root on the backend. Definitive fix ships as soon as we have Heroku access (API key).',
    ],
  },
  {
    v: '1.10.5',
    build: 35,
    date: '2026-07-30',
    es: [
      'Precio de ONDK más resistente: si el servidor no lo devuelve en una carga (pasa a veces con cuentas nuevas), la app usa el último precio bueno guardado en el teléfono. Se acabó el "—" que dejaba a algunos usuarios sin ver cuánto vale su ONDK.',
      'El precio se cachea 30 minutos por dispositivo y sobrevive a reinicios de la app.',
    ],
    en: [
      'ONDK price is more resilient: if the server does not return it on a load (happens sometimes with fresh accounts), the app uses the last good price stored on the device. No more "—" leaving some users without ONDK value.',
      'Price is cached for 30 minutes per device and survives app restarts.',
    ],
  },
  {
    v: '1.10.4',
    build: 34,
    date: '2026-07-30',
    es: [
      'Mensajes de error de login más claros: en vez de mostrar el texto crudo del servidor ("wrong email or password") ahora dice "El correo o la contraseña no coinciden con ninguna cuenta en este servidor" — sirve para distinguir cuando el problema es un caso raro de conexión, credenciales mal escritas, o una cuenta que existe en la web pero no en el servidor que consulta la app.',
      'El reintento automático con correo en minúsculas ahora se dispara con cualquier error de credenciales (401, 403 o 400/422 con mensaje típico), no solo con 401. Cubre backends con distintos códigos de estado.',
    ],
    en: [
      'Clearer login error messages: instead of the raw server text ("wrong email or password") the app now says "The email or password does not match any account on this server" — helps distinguish a rare connection issue, mistyped credentials, or an account that exists on the web but not on the server the app calls.',
      'The automatic retry with lowercased email now fires on any credential error (401, 403 or 400/422 with typical wording), not only 401. Covers backends that use different status codes.',
    ],
  },
  {
    v: '1.10.3',
    build: 33,
    date: '2026-07-30',
    es: [
      'Login arreglado para correos con mayúsculas. Antes la app forzaba todo a minúsculas antes de enviarlo al servidor, y las cuentas registradas con caja mixta (por ejemplo Canadian-8th@proton.me) entraban a la web pero fallaban en la app. Ahora el correo se envía tal como lo escribes y, si el servidor lo rechaza, la app vuelve a probar con la versión en minúsculas — así funcionan ambos estilos de servidor.',
    ],
    en: [
      'Login fixed for emails with capital letters. The app used to force everything to lowercase before hitting the server, so accounts registered with mixed case (e.g. Canadian-8th@proton.me) worked on the web but failed in the app. Now the email is sent as you typed it, and if the server rejects it the app retries once with the lowercased version — so both server styles work.',
    ],
  },
  {
    v: '1.10.2',
    build: 32,
    date: '2026-07-30',
    es: [
      'Tasas de cambio en Remesas ahora son en vivo. Cada vez que abrís la pantalla, la app consulta el mercado (open.er-api.com, sin API key) y muestra la conversión del día. Un puntito verde indica que la tasa es en vivo; dorado si es la última guardada; rojo si estás sin conexión. Con un tap en "Actualizar tasas" refrescás manualmente.',
      'Comisión Veta de $1 USD por remesa se muestra en el simulador: ves qué envías, qué se cobra y qué llega al destinatario en su moneda local — sin sorpresas.',
    ],
    en: [
      'Remittance rates are now live. Every time you open the screen the app queries the market (open.er-api.com, no API key) and shows today’s conversion. A green dot means the rate is live; gold means last saved; red means offline. A "Update rates" tap refreshes manually.',
      'Veta fee of $1 USD per remittance is shown in the simulator: you see what you send, what is charged and what arrives to the recipient in local currency — no surprises.',
    ],
  },
  {
    v: '1.10.1',
    build: 31,
    date: '2026-07-30',
    es: [
      'Nueva opción "Eliminar cuenta" en Ajustes → Zona peligrosa: asistente de 5 pasos con cuatro confirmaciones progresivas (¿estás seguro?, ¿sabés que perderás fondos?, ¿sabés que no se recupera?, ¿confirmas?) más verificación con tu contraseña real. Al concluir se cierra la sesión y se borran todos los datos guardados en el teléfono; se pide al servidor que borre la cuenta remota, y si el backend aún no lo soporta te avisamos para que escribas al soporte. Requisito de Google Play y App Store.',
      'Contactos oficiales del equipo en Ayuda: WhatsApp +504 3213-6457 y correo j.ordonez@ordenglobal.org.',
    ],
    en: [
      'New "Delete account" option in Settings → Danger zone: 5-step wizard with four progressive confirmations (are you sure? aware you lose funds? aware it is unrecoverable? confirm?) plus verification with your real password. On completion the session closes and all data stored on the phone is wiped; the server is asked to delete the account, and if the backend does not support it yet we tell you to write support. Required by Google Play and App Store.',
      'Official team contacts in Help: WhatsApp +504 3213-6457 and email j.ordonez@ordenglobal.org.',
    ],
  },
  {
    v: '1.10.0',
    build: 30,
    date: '2026-07-30',
    es: [
      'Nueva sección Remesas con puerta destacada en Home: hero verde con avión de papel, tres beneficios (segundos · fee mínima · sin bancos), simulador que muestra cuánto llega a Honduras, El Salvador, Guatemala, Nicaragua, Costa Rica, Panamá, México, Colombia o EE.UU. con tasa de referencia, y guía de 3 pasos.',
      'Botones "Enviar remesa" y "Recibir" enlazan directo con Enviar (con monto pre-relleno) y con Recibir (donde se genera el link/QR de pago).',
      'Set de iconos completado: se agregaron help-buoy, chatbubbles, mail, alert-circle, cloud-offline, add, construct, paper-plane, heart, trending-up. Antes salían huecos en Ayuda y en algunos avisos.',
      'Contactos oficiales de soporte cargados en Ayuda: WhatsApp +504 3213-6457 y correo j.ordonez@ordenglobal.org.',
    ],
    en: [
      'New Remittances section with a highlighted entry on Home: green hero with a paper plane, three benefits (seconds · minimal fee · no banks), a simulator showing how much arrives to Honduras, El Salvador, Guatemala, Nicaragua, Costa Rica, Panamá, Mexico, Colombia or USA at a reference rate, and a 3-step how-it-works.',
      '"Send remittance" and "Receive" buttons wire directly into Send (with amount pre-filled) and Receive (where you can generate the pay link/QR).',
      'Icon set completed: added help-buoy, chatbubbles, mail, alert-circle, cloud-offline, add, construct, paper-plane, heart, trending-up. Help and several notices had empty spots before.',
      'Official support contacts wired in Help: WhatsApp +504 3213-6457 and email j.ordonez@ordenglobal.org.',
    ],
  },
  {
    v: '1.9.5',
    build: 29,
    date: '2026-07-30',
    es: [
      'Centro de ayuda dentro de la app: siete preguntas frecuentes con respuestas, y dos botones para escribir al equipo por WhatsApp o correo con el contexto de la app precargado. Entra por Ajustes → Ayuda.',
      'Detección automática del idioma: la primera vez que abres la app, si tu teléfono está en español, ves la app en español; si está en inglés, en inglés. Después respetamos tu preferencia manual.',
    ],
    en: [
      'In-app help center: seven FAQs with answers, and two buttons to reach the team via WhatsApp or email with app context pre-filled. Enter via Settings → Help.',
      'Automatic language detection: the first time you open the app, if your phone is in Spanish you see the app in Spanish; if in English, in English. Manual preference is respected afterwards.',
    ],
  },
  {
    v: '1.9.4',
    build: 28,
    date: '2026-07-30',
    es: [
      'Solicitar un pago: en Recibir puedes escribir un monto y un motivo. La app arma un link (vetawallet://pay?...) y un QR con esos datos, y un botón Compartir lo manda por WhatsApp o correo. Quien lo abre desde Veta Wallet cae directo en Enviar con los campos rellenos — no tiene que copiar dirección ni escribir el monto.',
      'El escáner QR de Enviar también reconoce los links de pago: si te mandan un QR con monto, la app te llena el destino y el importe.',
      'Al llegar por solicitud de pago, un aviso azul te recuerda "verifica antes de firmar" para que nunca envíes sin revisar.',
    ],
    en: [
      'Request a payment: on Receive you can type an amount and a reason. The app builds a link (vetawallet://pay?...) and a QR with those fields, and a Share button sends it via WhatsApp or email. Whoever opens it from Veta Wallet lands directly on Send with fields filled — no need to copy address or type amount.',
      'The Send QR scanner now also recognises payment links: if someone sends you a QR with amount, the app fills destination and amount for you.',
      'When arriving via a payment request, a blue toast reminds "verify before signing" so you never send without checking.',
    ],
  },
  {
    v: '1.9.3',
    build: 27,
    date: '2026-07-30',
    es: [
      'Indicador de fuerza de contraseña en la pantalla de registro: 4 barras que se llenan con color y una etiqueta (débil / aceptable / buena / fuerte) para saber en el momento qué tan sólida es.',
      'Recordatorio amable en Home para respaldar tu frase semilla si llevás más de 24 horas usando la app y aún no la has visto. Con opción "Más tarde" que reposa el aviso una semana. Cuando la ves, no vuelve a molestar.',
    ],
    en: [
      'Password strength indicator on the register screen: 4 bars that fill with color and a label (weak / ok / good / strong) so you know your password strength as you type.',
      'Gentle Home reminder to back up your seed phrase if you have used the app for over 24 hours without viewing it. "Later" snoozes the reminder for a week. Once you see the seed, it stops nudging.',
    ],
  },
  {
    v: '1.9.2',
    build: 26,
    date: '2026-07-30',
    es: [
      'Toast con colores: verde para éxito, rojo para error, ámbar para advertencia, dorado para información. Ya no dice todo con el mismo tono.',
      'Nueva pantalla Sesiones activas en Ajustes → Seguridad: ves desde cuándo estás loggeado en este teléfono, cuáles sesiones cerraste y puedes cerrar la actual con confirmación.',
    ],
    en: [
      'Toast with colors: green for success, red for error, amber for warning, gold for info. It no longer says everything in the same tone.',
      'New Active sessions screen in Settings → Security: see since when you have been signed in on this phone, which sessions you closed, and sign out on this device with confirmation.',
    ],
  },
  {
    v: '1.9.1',
    build: 25,
    date: '2026-07-30',
    es: [
      'Cantidad de token con precisión visual: en la ficha del token se muestran los 6 decimales, los últimos vacíos van en tono tenue para que la lectura fluya sin perder exactitud.',
      'Confirmar envío ahora vibra con Success al firmar y hace una sacudida (con haptic Error) si la contraseña queda vacía o el envío falla. El feedback físico deja claro qué pasó sin depender solo del color.',
    ],
    en: [
      'Token amount with visual precision: the token detail shows all 6 decimals, trailing zeros dimmed so reading flows without losing exactness.',
      'Send confirmation now vibrates with Success on sign, and shakes (with Error haptic) if the password is empty or the send fails. Physical feedback makes it clear what happened, not only color.',
    ],
  },
  {
    v: '1.9.0',
    build: 24,
    date: '2026-07-30',
    es: [
      'Onboarding de tres pantallas la primera vez que entras: qué es Veta, cómo funciona y cómo va Genesis ID. Se puede saltar y solo aparece una vez.',
      'Skeletons pulsantes en Home mientras se cargan los saldos: se acabó el flash con "$0.00" y "0 ORIGEN" al abrir la app.',
      'Nueva opción Observar dirección en Ajustes: agrega la wallet de un familiar o de un negocio para ver sus saldos sin tener la llave. Solo lectura.',
      'Etiquetas de accesibilidad en los botones principales (VoiceOver en iPhone, TalkBack en Android leen ya con contexto).',
    ],
    en: [
      'Three-screen onboarding on first launch: what Veta is, how it works, how Genesis ID fits in. Skippable and shown only once.',
      'Pulsing skeletons on Home while balances load: no more flash of "$0.00" and "0 ORIGEN" when opening the app.',
      'New Watch address option in Settings: add a family member’s or a business wallet to see balances without holding the key. Read-only.',
      'Accessibility labels on the main buttons (VoiceOver on iPhone, TalkBack on Android now read them with context).',
    ],
  },
  {
    v: '1.8.0',
    build: 23,
    date: '2026-07-30',
    es: [
      'Bloqueo con biometría al abrir la app y al volver del segundo plano tras más de 2 minutos. Usa tu huella o Face ID. Si tu teléfono no tiene biometría configurada, la app te avisa y sigue funcionando.',
      'Barra roja "sin conexión" cuando el teléfono pierde internet: sabes que los datos que ves son los guardados, no los últimos.',
      'Comisión de red leída del RPC en tiempo real. Se acabó el fee fijo — si la red sube, el envío calcula bien y no falla.',
      'Precios sin feed real muestran "—" en vez de un número congelado. Si algún token no tiene precio ahora, la app te lo avisa en Home.',
    ],
    en: [
      'Biometric lock when opening the app and when returning from background after more than 2 minutes. Uses your fingerprint or Face ID. If your phone has no biometrics set up, the app tells you and keeps working.',
      'Red "no connection" bar when the phone loses internet: you know the data you see is saved data, not the latest.',
      'Network fee read from RPC in real time. No more fixed fee — if the network price rises, the send calculates correctly and does not fail.',
      'Prices without real feed show "—" instead of a frozen number. If any token has no price right now, the app warns you on Home.',
    ],
  },
  {
    v: '1.7.0',
    build: 22,
    date: '2026-07-30',
    es: [
      'Seguridad reforzada: tu contraseña y el token de sesión pasan al llavero del sistema (Keychain en iPhone, Keystore en Android) en vez del almacenamiento común. Un respaldo de tu teléfono ya no expone tus credenciales.',
      'El "Recordarme" del login queda apagado por defecto. Ahora es una decisión tuya, no una opción tomada por la app.',
      'Red de seguridad global: si algo falla en la app, aparece una pantalla de "algo salió mal" con opción de reintentar, en vez de quedarse en blanco.',
      'La pantalla Comprar entra en modo "en preparación": no muestra direcciones de tesorería hasta que la detección automática de pagos esté lista. Es para evitar que alguien mande USDT y no reciba nada.',
      'Declaración de Face ID y de encriptación no exenta, requisitos de la App Store.',
    ],
    en: [
      'Hardened security: your password and session token move to the system keychain (Keychain on iPhone, Keystore on Android) instead of common storage. A backup of your phone no longer exposes your credentials.',
      'The "Remember me" toggle on login is now off by default. It is your decision, not one the app made for you.',
      'Global safety net: if something crashes, a friendly "something went wrong" screen appears with a retry, instead of a blank screen.',
      'The Buy screen enters "in preparation" mode: no treasury addresses are shown until automatic payment detection is ready. Prevents anyone from sending USDT and not being credited.',
      'Face ID and non-exempt encryption declarations, required by the App Store.',
    ],
  },
  {
    v: '1.6.1',
    build: 21,
    date: '2026-07-30',
    es: [
      'Comprar ahora es solo ORIGEN. La tarjeta del token no muestra tu saldo y aparece un badge "ÚNICO POR AHORA" con la nota: los demás tokens se obtienen con Intercambiar desde ORIGEN.',
      'Ya no se traba el teclado sobre el input al agregar un contacto ni al escribir la contraseña de envío: la pantalla se acomoda para que veas lo que escribes.',
      'La libreta de contactos ahora es del teléfono, no del correo: sobrevive a cambios de sesión y actualizaciones. Si tenías contactos guardados con el sistema viejo, se importan solos la primera vez.',
      'Botón de borrar contacto más visible (rojo) y con confirmación antes de eliminar.',
      'Ficha de cada moneda con la misma estructura: Tipo, Respaldo, Red y Contrato — las 5 tokens se leen igual y se pueden comparar de un vistazo. Se quitó "Par" (era información interna del feed de precios).',
      'Intercambiar es solo desde ORIGEN: el origen del swap queda fijo y el destino esconde a ORIGEN. Nada de ONDK→ORIGEN por accidente. Para volver a ORIGEN vendrá una pantalla de "vender" más adelante.',
    ],
    en: [
      'Buy is now ORIGEN-only. The token card hides your balance and shows an "ONLY FOR NOW" badge with the note that other tokens are obtained via Swap from ORIGEN.',
      'The keyboard no longer covers the input when adding a contact or typing the send password: the sheet moves up so you can see what you type.',
      'The contacts book is now per device, not per email: it survives session changes and updates. If you had contacts saved with the old system, they migrate automatically on first read.',
      'Delete-contact button is more visible (red) and asks for confirmation before removing.',
      'Every token card follows the same structure: Type, Backing, Network and Contract — all 5 tokens read alike and can be compared at a glance. "Pair" was removed (it was internal price-feed info).',
      'Swap is one-way from ORIGEN: the "from" side is locked and the "to" picker hides ORIGEN. No accidental ONDK→ORIGEN. A "sell" screen will be added later to go back into ORIGEN.',
    ],
  },
  {
    v: '1.6.0',
    build: 20,
    date: '2026-07-30',
    es: [
      'Nuevo flujo "Comprar": eliges token (ORIGEN, AUKA, AGKA, ONDK, MNKA) y monto en USDT, pagas por Tron (TRC-20) o BNB Smart Chain (BEP-20) y ves el estado en vivo hasta que los tokens caen en tu billetera.',
      'La orden genera un monto exacto con 4 decimales aleatorios (ej. 100.0342 USDT) — el backend reconocerá tu pago aunque la red no soporte memo/tag.',
      'Sin comisiones. Mínimo de compra: 5 USDT.',
      'La pasarela viaja en modo de pruebas: la pantalla enseña el diseño completo y avisa con un banner grande. La detección automática del pago se enciende cuando conectemos el backend.',
    ],
    en: [
      'New "Buy" flow: pick a token (ORIGEN, AUKA, AGKA, ONDK, MNKA) and USDT amount, pay via Tron (TRC-20) or BNB Smart Chain (BEP-20) and watch the status live until the tokens land in your wallet.',
      'Each order generates an exact amount with 4 random decimals (e.g. 100.0342 USDT) — the backend can identify your payment even on networks with no memo/tag.',
      'No fees. Minimum order: 5 USDT.',
      'The gateway ships in test mode: the screen shows the full design with a large notice. Automatic payment detection turns on when we connect the backend.',
    ],
  },
  {
    v: '1.5.4',
    build: 19,
    date: '2026-07-30',
    es: [
      'AUKA se une al resto: ya se ve con su insignia dorada oficial en Portafolio, Enviar, Recibir y en el gráfico.',
      'El ojito del saldo ahora tapa TODO tu dinero: total, cambio del día, valor y cantidad de cada token. Los precios de mercado siguen visibles porque son públicos.',
    ],
    en: [
      'AUKA joins the rest: it now shows its official golden badge in Portfolio, Send, Receive and the chart.',
      'The balance eye now hides ALL your money: total, day change, and each token’s value and quantity. Market prices stay visible because they are public.',
    ],
  },
  {
    v: '1.5.3',
    build: 18,
    date: '2026-07-30',
    es: [
      'Cada token muestra ahora su logo real: ORIGEN, AGKA y ONDK llevan su insignia oficial en Portafolio, Enviar, Recibir y en el gráfico.',
      'Firma corporativa de Orden Global al final de Ajustes → Acerca de esta versión.',
    ],
    en: [
      'Each token now shows its real logo: ORIGEN, AGKA and ONDK carry their official badge in Portfolio, Send, Receive and the chart.',
      'Orden Global corporate signature at the bottom of Settings → About this version.',
    ],
  },
  {
    v: '1.5.2',
    build: 17,
    date: '2026-07-29',
    es: [
      'Prueba de despliegue automático: este mensaje llegó a tu teléfono sin abrir la computadora ni escribir un solo comando.',
    ],
    en: [
      'Automatic deployment test: this message reached your phone without opening your computer or running a single command.',
    ],
  },
  {
    v: '1.5.1',
    build: 16,
    date: '2026-07-29',
    es: [
      'Crear cuenta ahora prueba varias rutas del backend: si tu servidor publica el registro con otro nombre, la app lo encuentra igual.',
      'Los mensajes de registro distinguen entre "ese correo ya existe", "el servidor no tiene registro" y "ruta no encontrada".',
    ],
    en: [
      'Sign-up now tries several backend routes: if your server publishes registration under a different name, the app still finds it.',
      'Sign-up messages distinguish "email already exists", "server has no sign-up" and "route not found".',
    ],
  },
  {
    v: '1.5.0',
    build: 15,
    date: '2026-07-29',
    es: [
      'Ojito para ver la contraseña al confirmar el envío: evita escribirla mal y gastar un intento con la red.',
      'Actividad se actualiza al instante tras enviar: el movimiento aparece como pendiente hasta que la red lo confirma.',
      'Tocar una transacción abre su ficha: monto, contraparte, fecha, red, bloque, gas y hash — todo se copia al tocarlo.',
      'Si el remitente o el destinatario están en tus contactos, aparece su nombre en vez de la dirección cortada.',
      'La creación de cuenta avisa si el servidor no devuelve la dirección de billetera, en vez de dejarte con una cuenta a medias.',
    ],
    en: [
      'Eye toggle for the password when confirming a send: prevents typos that would waste a network attempt.',
      'Activity refreshes right after sending: the entry shows as pending until the network confirms it.',
      'Tap a transaction to open its card: amount, counterparty, date, network, block, gas and hash — everything is copyable.',
      'If the sender or recipient is in your contacts, their name shows instead of the shortened address.',
      'Account creation now warns if the server does not return your wallet address, instead of leaving you with a half-created account.',
    ],
  },
  {
    v: '1.4.2',
    build: 14,
    date: '2026-07-29',
    es: [
      'Arreglada la colisión de mayúsculas que rompía el build en Windows y macOS: la libreta se llama ahora addressBook y la pantalla se queda como Contacts.',
      'La revisión previa detecta este tipo de colisión.',
    ],
    en: [
      'Fixed a case-only naming collision that broke the Windows/macOS build: the address book is now addressBook and the screen stays as Contacts.',
      'The pre-build check catches this kind of collision.',
    ],
  },
  {
    v: '1.4.1',
    build: 13,
    date: '2026-07-29',
    es: [
      'Ajustada al SDK 54, que es el que soporta Expo Go de la App Store hoy: ya abre escaneando el QR.',
    ],
    en: [
      'Aligned to SDK 54, the one Expo Go on the App Store supports today: it now opens by scanning the QR.',
    ],
  },
  {
    v: '1.4.0',
    build: 12,
    date: '2026-07-29',
    es: [
      'La app sube al SDK 57 de Expo: ya se puede abrir en Expo Go escaneando el QR, sin construir el APK.',
      'El trabajo en segundo plano usa la librería nueva; en Expo Go los avisos llegan con la app abierta y en el APK también cerrada.',
      'Ajustes avisa de esa diferencia cuando corres en Expo Go.',
    ],
    en: [
      'The app moves to Expo SDK 57: it now opens in Expo Go by scanning the QR, with no APK build needed.',
      'Background work uses the new library; in Expo Go alerts arrive with the app open, and in the APK also when closed.',
      'Settings points out that difference when running in Expo Go.',
    ],
  },
  {
    v: '1.3.1',
    build: 11,
    date: '2026-07-29',
    es: [
      'Arreglado el build del APK: @babel/core estaba declarado como dependencia de desarrollo y el servidor de compilación lo omitía.',
      'La revisión previa avisa si alguna pieza que Metro necesita queda fuera de "dependencies".',
    ],
    en: [
      'APK build fixed: @babel/core was declared as a dev dependency and the build server skipped it.',
      'The pre-build check now warns if anything Metro needs is left out of "dependencies".',
    ],
  },
  {
    v: '1.3.0',
    build: 10,
    date: '2026-07-29',
    es: [
      'Enviar ahora tiene tres pasos: revisas todo, firmas con tu contraseña y ves el avance hasta que se confirma.',
      'Se acabó el "Aborted": cada fallo dice qué pasó, y si se agota el tiempo avisa de que la transacción pudo salir igual.',
      'El comprobante muestra bloque, gas, fecha, total, lo que te queda y el hash.',
      'Los avisos de dinero recibido ya no se borran solos y siguen llegando aunque cambies de app.',
    ],
    en: [
      'Sending now has three steps: you review everything, sign with your password and watch the progress until it confirms.',
      'No more "Aborted": every failure says what happened, and a timeout warns the transaction may have gone through anyway.',
      'The receipt shows block, gas, date, total, what you have left and the hash.',
      'Incoming-funds alerts no longer dismiss themselves and keep arriving when you switch apps.',
    ],
  },
  {
    v: '1.2.2',
    build: 9,
    date: '2026-07-29',
    es: [
      'Faltaba declarar el plugin del selector de fotos: sin él el build del APK fallaba.',
      'Nuevo "npm run verificar": revisa el proyecto antes de construir y avisa si falta algo por instalar.',
    ],
    en: [
      'The photo picker plugin was not declared: without it the APK build failed.',
      'New "npm run verificar": checks the project before building and warns if anything is missing.',
    ],
  },
  {
    v: '1.2.1',
    build: 8,
    date: '2026-07-29',
    es: [
      'El pasaporte ya acepta la imagen o el PDF que descargas del portal, no solo un archivo .json.',
      'Puedes subir tu foto y escribir tu nombre, documento, nacionalidad y fecha: la credencial queda completa.',
      'Al arreglar el titular, el nombre real reemplaza al deducido del correo en toda la app.',
      'Si falta el nombre o la foto, el propio pasaporte lo avisa y ofrece completarlo.',
    ],
    en: [
      'The passport now accepts the image or PDF you download from the portal, not just a .json file.',
      'You can upload your photo and type your name, document, nationality and date: the credential is then complete.',
      'Once the holder is fixed, the real name replaces the one guessed from the email across the app.',
      'If the name or photo is missing, the passport itself says so and offers to complete it.',
    ],
  },
  {
    v: '1.2.0',
    build: 7,
    date: '2026-07-29',
    es: [
      'Las notificaciones ya salen como banner emergente, con sonido y vibración, igual que un mensaje.',
      'Corregido: con la app cerrada no había sesión, así que el aviso de dinero recibido nunca llegaba.',
      'El aviso se ve también en la pantalla de bloqueo y al tocarlo abre Actividad.',
    ],
    en: [
      'Notifications now pop up as a heads-up banner, with sound and vibration, just like a message.',
      'Fixed: with the app closed there was no session, so the incoming-funds alert never arrived.',
      'The alert also shows on the lock screen, and tapping it opens Activity.',
    ],
  },
  {
    v: '1.1.4',
    build: 6,
    date: '2026-07-29',
    es: [
      'El portal aún no publica su API de aplicaciones: la verificación automática queda a la espera y se usa la importación manual del pasaporte.',
      'El servidor permite probar una ruta concreta del portal al instante, sin redesplegar.',
    ],
    en: [
      'The portal does not publish its apps API yet: automatic verification is on hold and the manual passport import is used instead.',
      'The server can now test a specific portal route instantly, with no redeploy.',
    ],
  },
  {
    v: '1.1.3',
    build: 5,
    date: '2026-07-29',
    es: [
      'La clave del portal ya funciona. Ahora falta ajustar la ruta de su API: el servidor la descubre solo.',
      'Las rutas del portal se configuran sin tocar código, por si el portal las mueve.',
    ],
    en: [
      'The portal key works now. What remains is the API route: the server discovers it on its own.',
      'Portal routes are configurable without touching code, in case the portal moves them.',
    ],
  },
  {
    v: '1.1.2',
    build: 4,
    date: '2026-07-29',
    es: [
      'Encontrada la causa de que el pasaporte no llegara: la clave del portal guardada en el servidor estaba abreviada.',
      'El servidor revisa la clave y dice qué le pasa, en vez de reportar que el portal no responde.',
      'Si la verificación se atasca, ahí mismo se ofrece subir el pasaporte a mano.',
    ],
    en: [
      'Found why the passport never arrived: the portal key stored on the server was an abbreviated copy.',
      'The server now checks the key and says what is wrong with it, instead of reporting that the portal is down.',
      'If verification stalls, you can now upload the passport by hand right there.',
    ],
  },
  {
    v: '1.1.1',
    build: 3,
    date: '2026-07-29',
    es: [
      'Pasaporte Genesis ID: el titular ya no sale como «Info». El portal manda el nombre en dos campos y ahora se arma completo.',
      'El domicilio del titular ya no se guardaba como dirección de billetera.',
      'Diagnóstico del portal: dice por qué falla la conexión, no solo que falló.',
    ],
    en: [
      'Genesis ID passport: the holder no longer shows as “Info”. The portal sends the name in two fields and it is now assembled in full.',
      "The holder's home address was being stored as the wallet address.",
      'Portal diagnostics: it now says why the connection fails, not just that it failed.',
    ],
  },
  {
    v: '1.1.0',
    build: 2,
    date: '2026-07-29',
    es: [
      'Aviso de envío: al mandar un token se abre una ficha con el detalle y el hash.',
      'Notificaciones al recibir tokens, con la app abierta o cerrada.',
      'Velas japonesas rediseñadas con temporalidad (1D, 1S, 1M, 3M, 1A) y precios en vivo.',
      'Escáner de códigos QR para pegar la dirección de destino al enviar.',
      'Contactos: libreta de billeteras favoritas para enviar más rápido.',
      'Importar el pasaporte de Genesis ID (archivo, QR o pegado).',
      'Perfil sin información duplicada: lo verificado se muestra, no se vuelve a pedir.',
      'El botón atrás de Android navega hacia atrás en vez de cerrar la app.',
      'Fondos fotográficos más visibles y esta pantalla de versiones.',
    ],
    en: [
      'Send receipt: sending a token now opens a card with the details and hash.',
      'Notifications when you receive tokens, with the app open or closed.',
      'Redesigned candlestick chart with timeframes (1D, 1W, 1M, 3M, 1Y) and live prices.',
      'QR scanner to fill in the destination address when sending.',
      'Contacts: an address book of favorite wallets for faster sending.',
      'Import your Genesis ID passport (file, QR or pasted).',
      'Profile with no duplicated information: verified data is shown, not asked again.',
      "Android's back button goes back instead of closing the app.",
      'More visible photographic backgrounds and this versions screen.',
    ],
  },
  {
    v: '1.0.0',
    build: 1,
    date: '2026-07-27',
    es: [
      'Primera versión conectada a la blockchain de Orden Global (red 8532).',
      'Cuentas reales, saldos on-chain y precios en vivo de oro y plata.',
      'Envío de ORIGEN, recepción por QR y actividad real de la red.',
      'Genesis ID: verificación en el portal oficial y pasaporte en la app.',
      'Español e inglés, sesión recordada y gestos de navegación.',
    ],
    en: [
      'First version connected to the Orden Global blockchain (network 8532).',
      'Real accounts, on-chain balances and live gold and silver prices.',
      'Send ORIGEN, receive by QR and real network activity.',
      'Genesis ID: verification on the official portal and passport in the app.',
      'Spanish and English, remembered session and navigation gestures.',
    ],
  },
];
