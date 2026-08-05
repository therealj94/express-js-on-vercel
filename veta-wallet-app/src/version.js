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

export const VERSION = '1.27.0';
export const BUILD = 63;
export const RELEASED = '2026-08-05';

export const versionLabel = () => `v${VERSION} · build ${BUILD}`;

// Historial visible dentro de la app (Ajustes → Novedades).
// El más reciente primero. `es`/`en` para que se lea en ambos idiomas.
export const CHANGELOG = [
  {
    v: '1.27.0',
    build: 63,
    date: '2026-08-05',
    es: [
      'Girar la cabeza era imposible de pasar, y el motivo era una contradicción mía: para seguir la cuenta atrás hay que mirar la pantalla, y mirando la pantalla nadie gira la cabeza 22 grados. Ahora bastan 15, que una fotografía de frente sigue sin poder hacer.',
      'Se toman DOS fotos por gesto, medio segundo aparte, y basta con que una salga bien. Antes, un gesto bien hecho se perdía por llegar tarde o adelantarse al disparo.',
      'Gesto nuevo: acercar la cara a la cámara. Se puede hacer mirando la pantalla, y se comprueba comparando con la primera foto — o sea que se mide el movimiento, no lo largo que tengas el brazo.',
      'Si la cara queda lejos, ahora lo dice así: «acércala hasta llenar el óvalo», en vez de dar el gesto por fallado sin explicar.',
    ],
    en: [
      'Turning your head was impossible to pass, because of a contradiction on my side: following the countdown means looking at the screen, and looking at the screen nobody turns their head 22 degrees. Fifteen is now enough — still out of reach for a photograph held straight on.',
      'TWO photos are taken per gesture, half a second apart, and one good one is enough. A well-done gesture used to be lost by being slightly early or late.',
      'New gesture: move your face closer to the camera. It can be done while looking at the screen, and it is checked against your first photo — so what is measured is the movement, not the length of your arm.',
      'If your face is too far, it now says «move closer until you fill the oval», instead of failing the gesture without explaining.',
    ],
  },
  {
    v: '1.26.0',
    build: 62,
    date: '2026-08-05',
    es: [
      'Ahora se piden las DOS caras del documento, como en cualquier verificación seria. El frente lleva tu nombre completo; el reverso, el código que se comprueba solo.',
      'Con eso se arregla el nombre cortado: la MRZ del reverso tiene ancho fijo y recorta —«JOSE» sale «JOS»—, y sin el frente no había forma de distinguir un nombre truncado de una discrepancia real. Ahora el frente lo confirma y deja de bloquear.',
      'Del frente viaja solo el TEXTO reconocido, nunca la fotografía. La imagen del documento sigue sin salir de tu teléfono.',
      'La cámara del rostro tiene guía visual: un óvalo que marca dónde ponerte, un anillo que se llena con la cuenta atrás, y un dibujo animado que hace el gesto que se te pide. Se entiende sin leer, que es lo que hacía falta con los ojos cerrados.',
      'Modo manual: si preferís disparar vos en lugar de esperar la cuenta, podés cambiarlo con un toque.',
      'El nombre truncado por el documento ya no baja la coincidencia: «Jose Ordóñez» contra «ORDONEZ JOS» pasa de 76 % a 99 %.',
    ],
    en: [
      'Both SIDES of the document are now requested, as in any serious verification. The front carries your full name; the back, the code that verifies itself.',
      'That fixes the truncated name: the MRZ on the back has a fixed width and cuts names — «JOSE» prints as «JOS» — and without the front there was no way to tell a truncated name from a real mismatch. The front now confirms it and it stops blocking.',
      'Only the recognised TEXT of the front travels, never the photograph. The document image still never leaves your phone.',
      'The face camera now has visual guidance: an oval showing where to sit, a ring that fills with the countdown, and an animated drawing performing the gesture asked of you. It works without reading — which is what was needed with your eyes closed.',
      'Manual mode: if you prefer to trigger the shot yourself instead of waiting for the countdown, one tap switches it.',
      'A name truncated by the document no longer lowers the match: «Jose Ordóñez» against «ORDONEZ JOS» goes from 76 % to 99 %.',
    ],
  },
  {
    v: '1.25.0',
    build: 61,
    date: '2026-08-05',
    es: [
      'La foto de cada gesto se toma sola, con una cuenta atrás que vibra. Antes había que apretar un botón después de cada gesto, y con «cierra los ojos» eso era imposible: no se puede ver el botón con los ojos cerrados. Nadie podía terminar la verificación y el mensaje culpaba a la luz.',
      'Ya no hay que hacer los cuatro gestos perfectos. Basta mirar de frente y cumplir dos de los tres. Antes uno a medias —una sonrisa tímida, unos ojos entornados— tumbaba la verificación entera.',
      'Se puede volver al paso anterior desde cualquier pantalla. Antes, si algo fallaba, la única salida era abandonar la verificación y empezar de cero.',
      'Los errores se quedan en pantalla hasta que los cerrás. Antes salían como un mensajito que desaparecía en dos segundos: si estabas mirando la cámara, no llegabas a leerlo.',
      'Se dice claramente que el código está en la parte de ATRÁS del documento, y que el frente no hace falta.',
      'Cuando un gesto falla, se nombra cuál fue y por qué, en vez de decir «1 de 4 no se cumplieron».',
    ],
    en: [
      'Each gesture photo is now taken automatically, with a countdown you can feel. It used to require pressing a button after each gesture, which made «close your eyes» impossible: you cannot see the button with your eyes closed. Nobody could finish verification and the message blamed the lighting.',
      'You no longer need all four gestures perfect. Looking straight at the camera plus two of the three is enough. One half-done gesture used to sink the whole verification.',
      'You can go back to the previous step from any screen. If something failed, the only way out used to be abandoning verification and starting over.',
      'Errors now stay on screen until you dismiss them. They used to vanish after two seconds — if you were looking at the camera, you never read them.',
      'It now says clearly that the code is on the BACK of your document, and that the front is not needed.',
      'When a gesture fails, it names which one and why, instead of «1 of 4 were not met».',
    ],
  },
  {
    v: '1.24.0',
    build: 60,
    date: '2026-08-05',
    es: [
      'El escáner del documento no leía las cédulas hondureñas. Las líneas sí se veían, pero salían cortadas por los lados al acercar el teléfono, y el lector las descartaba diciendo «no se distinguen las líneas» — un diagnóstico falso que mandaba a buscar más luz cuando lo que sobraba era cercanía.',
      'Ahora, si salen cortadas, se dice exactamente eso: «alejá un poco el teléfono para que quepan enteras».',
      'La guía de encuadre pasa a ser una franja de lado a lado en el centro. Antes era un recuadro pequeño abajo, donde casi nadie pone el documento.',
      'Si la cámara parte una línea en dos por una sombra o un doblez, los trozos se vuelven a unir en vez de descartarse.',
      'Nuevo: leer el documento desde una foto ya tomada. La cámara del teléfono enfoca y acerca mejor que la de la app, y para un documento gastado eso decide. La imagen sigue sin salir del teléfono.',
      'El texto impreso del documento —«REPÚBLICA DE HONDURAS», «COMISIONADOS PROPIETARIOS»— ya no se confunde con las líneas de código.',
    ],
    en: [
      'The document scanner could not read Honduran ID cards. The lines were visible, but got cut off at the sides when the phone came close, and the reader discarded them saying «the lines are not legible» — a false diagnosis that sent people looking for more light when the problem was being too close.',
      'Now, if they are cut off, it says exactly that: «move the phone back so they fit whole».',
      'The framing guide is now a band across the middle. It used to be a small box at the bottom, where almost nobody holds the document.',
      'If the camera splits a line in two because of a shadow or a fold, the pieces are joined back instead of discarded.',
      'New: read the document from a photo you already took. The phone camera focuses and zooms better than the in-app one, and for a worn document that decides it. The image still never leaves your phone.',
      'Printed text on the document is no longer mistaken for the code lines.',
    ],
  },
  {
    v: '1.23.0',
    build: 59,
    date: '2026-08-05',
    es: [
      'La fecha de nacimiento se escribe en tres casillas —día, mes, año— con teclado numérico y salto automático. Antes había que teclearla exactamente como «1990-05-23»: un guion de menos y la verificación se caía por «no coincide con tu documento».',
      'Ya se puede elegir cualquier país de residencia, con buscador. Antes solo había diez botones: quien vive en Ecuador, Perú o Argentina no podía terminar la verificación, o declaraba un país que no es el suyo.',
      'Si el documento no coincide con lo que declaraste, ahora podés volver a corregirlo. Antes la verificación se quedaba muerta en esa pantalla, sin salida.',
      'Si la comprobación del rostro falla —mala luz, un gesto a medias— podés repetirla ahí mismo. Antes se iba a revisión manual y había que esperar días por una foto mal tomada. Y si cerrabas la app, al volver tampoco te dejaba reintentar.',
      'Aviso inmediato cuando la fecha escrita no existe o la edad no permite abrir cuenta, en vez de descubrirlo tres pantallas después.',
    ],
    en: [
      'Date of birth is now three boxes — day, month, year — with a number pad and automatic jumps. It used to require typing exactly «1990-05-23»: one missing dash and verification failed with «does not match your document».',
      'You can now pick any country of residence, with search. There used to be ten buttons only: anyone living in Ecuador, Peru or Argentina could not finish verification, or declared a country that was not theirs.',
      'If your document does not match what you declared, you can now go back and fix it. Verification used to dead-end on that screen with no way out.',
      'If the face check fails — poor light, a half-done gesture — you can retry right there. It used to go to manual review, meaning days of waiting over a bad photo. And closing the app lost the retry too.',
      'Immediate warning when the date typed does not exist or the age does not allow opening an account, instead of finding out three screens later.',
    ],
  },
  {
    v: '1.22.0',
    build: 58,
    date: '2026-08-05',
    es: [
      'Ya no hace falta teclear el código del documento. Apuntás la cámara al pie de la cédula o el pasaporte y se lee solo. Eran 88 caracteres llenos de «<»: era el punto donde la gente abandonaba la verificación, y con razón.',
      'Si la cámara confunde un cero con una O —les pasa a todos los lectores—, se corrige solo usando los dígitos de control del propio documento. Y cuando hay más de una lectura posible no elige ninguna: te pide otra foto, porque acertar por casualidad sería mandar el documento de otra persona.',
      'La foto del documento no sale del teléfono. La lectura ocurre acá y lo único que viaja es el texto, igual que antes.',
      'Escribirlo a mano sigue disponible para cuando la cámara no ayuda.',
    ],
    en: [
      'You no longer have to type the document code. Point the camera at the bottom of your ID or passport and it reads itself. It was 88 characters full of «<» — the point where people gave up on verification, and understandably so.',
      'If the camera mistakes a zero for an O — every reader does — it is corrected automatically using the document\u2019s own check digits. And when more than one reading is possible it picks none: it asks for another photo, because guessing right by chance would mean submitting someone else\u2019s document.',
      'The document photo never leaves your phone. Reading happens here and only the text travels, same as before.',
      'Typing it by hand is still there for when the camera does not help.',
    ],
  },
  {
    v: '1.21.0',
    build: 57,
    date: '2026-08-05',
    es: [
      'La verificación de identidad ahora comprueba que sos vos quien está delante de la cámara, y no una fotografía. Genesis ID sortea tres gestos al azar en ese momento —sonreír, abrir la boca, cerrar los ojos, girar la cabeza— y los comprueba uno por uno.',
      'El rostro se compara con la foto del documento de forma automática. Antes esa comparación la tenía que hacer una persona a mano en cada verificación.',
      'Se quitó el envío de una sola foto, que no permitía distinguir a una persona de una imagen suya sacada de internet.',
      'Arreglado: el envío de la foto fallaba con un error de tamaño y solo decía "no se pudo enviar la foto".',
      'Arreglados cuatro iconos de la pantalla de verificación que se dibujaban como un hueco vacío.',
    ],
    en: [
      'Identity verification now checks that you are the one in front of the camera, not a photograph. Genesis ID picks three gestures at random right then — smile, open your mouth, close your eyes, turn your head — and checks them one by one.',
      'Your face is now matched against your document photo automatically. That comparison used to be done by hand on every verification.',
      'Removed the single-photo submission, which could not tell a person apart from a picture of them taken off the internet.',
      'Fixed: sending the photo failed with a size error and only said "the photo could not be sent".',
      'Fixed four icons on the verification screen that rendered as an empty gap.',
    ],
  },
  {
    v: '1.20.1',
    build: 56,
    date: '2026-08-04',
    es: [
      'Cambio interno: vuelta al SDK 54 de Expo, a pedido, para las pruebas en curso. Sin cambios visibles para el usuario.',
    ],
    en: [
      'Internal change: reverted to Expo SDK 54, on request, for ongoing testing. No visible changes for users.',
    ],
  },
  {
    v: '1.20.0',
    build: 55,
    date: '2026-08-04',
    es: [
      'La app se actualizó a la última versión de Expo (SDK 57). Vuelve a poder probarse en el Expo Go de la tienda, sin instalar versiones viejas.',
      'El idioma del sistema se detecta con la API oficial. Antes se leía por una vía antigua que en esta versión ya no responde: un teléfono en español habría abierto la app en inglés sin avisar de nada.',
      'Actualizadas todas las librerías internas a las versiones que pide el SDK nuevo, incluido el motor de React Native.',
    ],
    en: [
      'The app was updated to the latest Expo version (SDK 57). It can be tested again with the Expo Go from the store, without installing older versions.',
      'The system language is now detected through the official API. It used to be read through an older path that no longer responds in this version: a phone set to Spanish would have opened the app in English without any warning.',
      'All internal libraries updated to the versions the new SDK expects, including the React Native engine.',
    ],
  },
  {
    v: '1.19.0',
    build: 54,
    date: '2026-08-04',
    es: [
      'Si un envío se queda sin respuesta, la app ya no te ofrece reenviarlo: te lleva a Actividad con el historial recién actualizado. Antes te avisaba de que la transacción podía haber salido igual y te ponía el botón de reintentar justo debajo, con el riesgo de pagar dos veces.',
      'Tocar dos veces seguidas "Firmar y enviar" ya no dispara dos transferencias. Lo mismo al confirmar con la contraseña en la tarjeta.',
      'Ver tu frase de respaldo o tu llave privada ahora pide tu contraseña o tu huella, igual que ver el PIN de la tarjeta. Y se ocultan solas a los 45 segundos.',
      'El número, el CVV y el PIN de la tarjeta ya no se quedan pegados en el portapapeles: se borran junto con el temporizador que los oculta.',
      'Cuando no hay precio real de un token, se muestra "—" en vez de un valor de referencia. Un precio aproximado sumado a tu patrimonio total podía llevarte a decidir mal.',
      'Si no se pueden leer tus saldos, la app te lo dice. Antes mostraba "$0.00", que se confunde con una cuenta vacía.',
      'Al firmar un envío ves el monto exacto que se va a mover, sin redondear.',
      'Se retiró el interruptor de "Cuenta privada": decía que quedaba activado, pero no hacía nada.',
    ],
    en: [
      'If a transfer times out, the app no longer offers to resend it: it takes you to Activity with a freshly updated history. It used to warn that the transaction might have gone through anyway and put the retry button right underneath, risking a double payment.',
      'Tapping "Sign & send" twice no longer fires two transfers. Same when confirming with your password on the card.',
      'Viewing your backup phrase or private key now asks for your password or fingerprint, just like viewing the card PIN. They also hide themselves after 45 seconds.',
      'Your card number, CVV and PIN no longer stay in the clipboard: they are cleared along with the timer that hides them.',
      'When there is no real price for a token, "—" is shown instead of a reference value. An approximate price added to your total could lead you to a bad decision.',
      'If your balances cannot be read, the app says so. It used to show "$0.00", which looks like an empty account.',
      'When signing a transfer you now see the exact amount that will move, unrounded.',
      'The "Private account" switch was removed: it said it was on, but it did nothing.',
    ],
  },
  {
    v: '1.18.0',
    build: 53,
    date: '2026-07-31',
    es: [
      'Eliminar tu cuenta ahora borra de verdad tus datos del servidor, no solo de este teléfono. Se conserva únicamente tu clave cifrada, para que los fondos que te queden sigan siendo recuperables con tu frase de respaldo.',
      'Cambiar la contraseña ahora cierra la sesión en todos los demás teléfonos. Si la cambiás porque sospechás que alguien entró, el cambio sirve de algo.',
      'El ORIGEN que comprás con USDT ya puede recargar la tarjeta. Antes se veía el saldo pero no se podía usar.',
      'Los envíos que fallan ahora te dicen qué pasó — sin saldo, red caída, dirección inválida — en vez de quedarse noventa segundos girando.',
      'La política de privacidad y los términos ahora se abren desde Ajustes.',
    ],
    en: [
      'Deleting your account now really erases your data from the server, not just from this phone. Only your encrypted key is kept, so any remaining funds stay recoverable with your backup phrase.',
      'Changing your password now signs you out on every other phone. If you change it because you suspect someone got in, the change actually does something.',
      'The ORIGEN you buy with USDT can now top up the card. Before you could see the balance but not use it.',
      'Failed transfers now tell you what happened — no balance, network down, invalid address — instead of spinning for ninety seconds.',
      'The privacy policy and terms now open from Settings.',
    ],
  },
  {
    v: '1.17.1',
    build: 52,
    date: '2026-07-31',
    es: [
      'Depositar USDT se movió a la sección de la tarjeta, que es donde tiene sentido: si no te alcanza el ORIGEN para recargar, lo conseguís ahí mismo sin salir.',
    ],
    en: [
      'Deposit USDT moved into the card section, where it belongs: if you do not have enough ORIGEN to top up, you get it right there without leaving.',
    ],
  },
  {
    v: '1.17.0',
    build: 51,
    date: '2026-07-31',
    es: [
      'Ya podés depositar USDT y recibir ORIGEN. En Inicio tenés la dirección con su código QR: mandás USDT por la red Polygon y tu ORIGEN aparece solo, sin apretar nada.',
      'Todo se muestra en ORIGEN, con el equivalente en dólares al lado. También ves a qué precio se convirtió cada depósito.',
      'El ORIGEN comprado se muestra aparte del que ya tenías en la billetera, porque todavía son dos saldos distintos. Los vamos a unir más adelante.',
      'La pantalla avisa con claridad que solo se acepta USDT por Polygon: mandar otra moneda u otra red no tiene vuelta atrás.',
    ],
    en: [
      'You can now deposit USDT and receive ORIGEN. Home has the address with its QR code: you send USDT over the Polygon network and your ORIGEN shows up on its own, without pressing anything.',
      'Everything is shown in ORIGEN, with the dollar equivalent beside it. You also see the price each deposit was converted at.',
      'Purchased ORIGEN is shown separately from what you already had in the wallet, because they are still two different balances. We will join them later.',
      'The screen states clearly that only USDT over Polygon is accepted: sending another coin or another network cannot be undone.',
    ],
  },
  {
    v: '1.16.1',
    build: 50,
    date: '2026-07-31',
    es: [
      'Se arregla que las actualizaciones dejaran de llegar a Expo Go desde la build 47. Volvés a recibir cada cambio al reabrir la app.',
    ],
    en: [
      'Fixes updates no longer reaching Expo Go since build 47. You get every change again when you reopen the app.',
    ],
  },
  {
    v: '1.16.0',
    build: 49,
    date: '2026-07-31',
    es: [
      'Ya podés recargar tu tarjeta desde la app. Pasás ORIGEN de tu billetera y el saldo de la tarjeta se acredita solo.',
      'Todo se muestra en ORIGEN: lo que recargás, el saldo de la tarjeta y cada consumo. El dólar aparece siempre como referencia al lado, nunca como la unidad.',
      'La recarga son dos pasos en redes distintas, así que la pantalla te muestra en cuál va: pago enviado, pago confirmado y saldo acreditado. Podés salir mientras tanto — sigue su curso y el saldo aparece solo.',
      'Si la red tarda, la recarga no se pierde: al volver a entrar la app la retoma donde quedó.',
    ],
    en: [
      'You can now top up your card from the app. You move ORIGEN from your wallet and the card balance is credited automatically.',
      'Everything is shown in ORIGEN: what you add, the card balance and every purchase. The dollar always appears as a reference beside it, never as the unit.',
      'A top up is two steps across different networks, so the screen shows which one it is on: payment sent, payment confirmed, balance credited. You can leave meanwhile — it carries on and the balance appears on its own.',
      'If the network is slow the top up is not lost: the app picks it up where it left off when you come back.',
    ],
  },
  {
    v: '1.15.0',
    build: 48,
    date: '2026-07-31',
    es: [
      'La app ya puede actualizarse sola. Hasta ahora los arreglos solo llegaban a quien la abría desde Expo Go: al APK instalado no le llegaba ninguno, porque le faltaba el componente que los descarga. Ya está instalado.',
      'Importante: esta versión no puede llegarle por aire a quien tenga el APK viejo — justamente porque a ese APK le falta esa pieza. Hay que instalar uno nuevo una última vez. De ahí en adelante, cada mejora llega sola.',
      'Cuando haya una versión nueva, la app la descarga en segundo plano y te ofrece reiniciar. Nunca se reinicia sola: hacerlo a mitad de un envío sería peor que esperar.',
    ],
    en: [
      'The app can now update itself. Until now fixes only reached people opening it from Expo Go: the installed APK never received any, because it was missing the component that downloads them. That is now installed.',
      'Important: this version cannot reach anyone on the old APK over the air — precisely because that APK lacks this piece. A new one has to be installed one last time. From then on, every improvement arrives on its own.',
      'When a new version is available, the app downloads it in the background and offers to restart. It never restarts on its own: doing that mid-transfer would be worse than waiting.',
    ],
  },
  {
    v: '1.14.1',
    build: 47,
    date: '2026-07-31',
    es: [
      'El teléfono para los códigos sí se estaba guardando, pero la pantalla seguía diciendo "sin teléfono registrado". Ahora muestra el que tenés y lo trae del servidor.',
      'La verificación por SMS también se activaba de verdad, pero nada en pantalla lo indicaba. Ahora la fila queda marcada con un check verde y dice que está activada.',
    ],
    en: [
      'The phone for verification codes was being saved correctly, but the screen kept saying "no phone registered". It now shows the one you have, read from the server.',
      'SMS verification was also being enabled for real, but nothing on screen showed it. The row is now marked with a green check and says it is enabled.',
    ],
  },
  {
    v: '1.14.0',
    build: 46,
    date: '2026-07-31',
    es: [
      'Nueva pantalla de Ajustes de la tarjeta, con todo lo que antes no existía en la app: editar tus límites de gasto, el teléfono donde llegan los códigos de compras online, activar la verificación por SMS, exportar tu estado de cuenta, reemitir la tarjeta y cancelarla.',
      'Ahora ves cuánto llevás gastado contra cada límite —diario, semanal y mensual— con barras que se ponen rojas al acercarse al tope.',
      'Tocá cualquier consumo para ver el detalle completo: comercio, divisa original, tipo de cambio y saldo después. Si no reconocés un cargo, podés disputarlo desde ahí.',
      'Si te clonan la tarjeta, "Reemitir" te da un número nuevo al instante. Congelar solo la pausa; reemitir la reemplaza.',
      'Los avisos del emisor —bloqueos por seguridad, cargos declinados— ahora aparecen en la pantalla de la tarjeta. El servidor los venía guardando y nadie los veía.',
    ],
    en: [
      'New Card settings screen with everything the app was missing: edit your spending limits, the phone where online purchase codes arrive, enable SMS verification, export your statement, reissue the card and cancel it.',
      'You can now see how much you have spent against each limit — daily, weekly and monthly — with bars that turn red as you approach the cap.',
      'Tap any purchase to see the full detail: merchant, original currency, exchange rate and balance after. If you do not recognise a charge, you can dispute it right there.',
      'If your card is cloned, "Reissue" gives you a new number instantly. Freezing only pauses it; reissuing replaces it.',
      'Issuer alerts — security blocks, declined charges — now appear on the card screen. The server had been storing them and nobody ever saw them.',
    ],
  },
  {
    v: '1.13.0',
    build: 45,
    date: '2026-07-31',
    es: [
      'Corregimos lo que te dijimos en la versión anterior: tu tarjeta SÍ puede tener PIN. El error que salía no era "las virtuales no usan PIN" — era que a tu tarjeta nunca se le asignó uno.',
      'Ahora podés crearlo desde la app: elegís un PIN de 4 a 12 dígitos, lo confirmás con tu Face ID, huella o contraseña, y queda guardado en el emisor. Después podés cambiarlo cuando quieras.',
    ],
    en: [
      'Correcting what we told you in the previous version: your card CAN have a PIN. The error was not "virtual cards do not use a PIN" — it was that your card never had one assigned.',
      'You can now create it from the app: pick a 4 to 12 digit PIN, confirm with Face ID, fingerprint or your password, and it is saved with the issuer. You can change it whenever you want.',
    ],
  },
  {
    v: '1.12.1',
    build: 44,
    date: '2026-07-31',
    es: [
      'Abrir la tarjeta ya no es una espera en blanco: mientras el emisor responde se dibuja tu tarjeta con un destello dorado recorriéndola y van pasando frases del ecosistema. Los tres segundos que tarda la consulta ahora cuentan algo.',
    ],
    en: [
      'Opening your card is no longer a blank wait: while the issuer responds, your card is drawn with a gold sheen sweeping across it and short lines about the ecosystem cycle through. The three seconds the lookup takes now say something.',
    ],
  },
  {
    v: '1.12.0',
    build: 43,
    date: '2026-07-31',
    es: [
      'Face ID y huella para autorizar. Donde antes había que teclear la contraseña — enviar dinero, ver el número o el CVV de la tarjeta — ahora basta tu cara o tu dedo. La primera vez escribís la contraseña y marcás la casilla; de ahí en adelante queda guardada en el llavero seguro del teléfono, del que solo sale con tu biometría. El teclado sigue disponible si preferís, o si la biometría falla.',
      'Al enviar dinero la biometría NO se dispara sola: primero tenés que poder leer el monto y el destino. En la tarjeta sí se pide de una, porque ahí no hay nada que aprobar.',
      'Corregido el recuadro blanco detrás del logo OG en la tarjeta y en "Acerca de": el archivo era un JPEG sin transparencia. Ahora el monograma va calado sobre el negro.',
      'La pantalla de bloqueo se rediseñó: halo dorado, anillo que late mientras el sistema espera tu cara o tu dedo, y los errores en un aviso legible en vez de texto suelto.',
    ],
    en: [
      'Face ID and fingerprint to authorize. Where you used to type your password — sending money, viewing your card number or CVV — your face or finger is now enough. The first time you type the password and tick the box; from then on it lives in the phone\'s secure keychain and is only released by your biometrics. The keyboard is always available as a fallback.',
      'When sending money biometrics do NOT fire automatically: you must be able to read the amount and recipient first. On the card it does fire immediately, because there is nothing to approve there.',
      'Fixed the white box behind the OG logo on the card and in "About": the file was a JPEG with no transparency. The monogram is now knocked out over the black.',
      'The lock screen was redesigned: gold halo, a ring that pulses while the system waits for your face or finger, and errors shown in a readable notice instead of loose text.',
    ],
  },
  {
    v: '1.11.3',
    build: 42,
    date: '2026-07-31',
    es: [
      'El monograma de Orden Global ahora es el protagonista de la tarjeta, en dorado pleno sobre el negro, en vez de una marca de agua tenue. El grabado de circuito es más denso y con dos intensidades, y el chip tiene el brillo del oro pulido.',
      'El número, el vencimiento y el titular van en relieve, con más aire entre ellos.',
    ],
    en: [
      'The Orden Global monogram is now the hero of the card, in full gold on black, instead of a faint watermark. The circuit engraving is denser and rendered at two intensities, and the chip has the sheen of polished gold.',
      'The number, expiry and cardholder name are embossed, with more room to breathe.',
    ],
  },
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
