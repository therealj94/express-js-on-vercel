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

export const VERSION = '1.1.0';
export const BUILD = 2;
export const RELEASED = '2026-07-29';

export const versionLabel = () => `v${VERSION} · build ${BUILD}`;

// Historial visible dentro de la app (Ajustes → Novedades).
// El más reciente primero. `es`/`en` para que se lea en ambos idiomas.
export const CHANGELOG = [
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
