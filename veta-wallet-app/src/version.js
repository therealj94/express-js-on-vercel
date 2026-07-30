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

export const VERSION = '1.5.0';
export const BUILD = 15;
export const RELEASED = '2026-07-29';

export const versionLabel = () => `v${VERSION} · build ${BUILD}`;

// Historial visible dentro de la app (Ajustes → Novedades).
// El más reciente primero. `es`/`en` para que se lea en ambos idiomas.
export const CHANGELOG = [
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
