// La paleta de la casa — la misma de veta-wallet-app/src/theme.js, porque
// Orden Global es el contenedor de esas apps y no puede sentirse de otra
// familia. Sobre negro profundo (la "pantalla negra" pedida), con el oro de
// la marca como único acento.
export const C = {
  negro: '#010D0E',
  bg: '#021B1C',
  panel: 'rgba(6,40,42,0.82)',
  panel2: 'rgba(12,54,56,0.86)',
  line: 'rgba(201,169,97,0.34)',
  line2: 'rgba(201,169,97,0.18)',
  input: 'rgba(8,44,46,0.88)',
  inputBr: '#2E7477',
  gold: '#C9A961',
  goldLt: '#EAD79C',
  goldHi: '#F8EFCF',
  goldDp: '#96793F',
  txt: '#F3ECD9',
  txt2: '#AEC7C3',
  txt3: '#6E938F',
  up: '#3ED9A0',
  down: '#F0776B',
  darkText: '#3A2C08',
};

export const G = {
  gold: ['#F8EFCF', '#DFC078', '#C9A961', '#96793F'],
  pantalla: ['#04262A', '#021B1C', '#010D0E'],
};

// Los logos canónicos de cada app (sus propios assets) y el fondo sobre el
// que cada ficha los enseña como fueron diseñados.
export const MARCAS = {
  veta: { fondo: '#F2EFE9', logo: require('../assets/veta-wallet.png') },
  pay: { fondo: '#0B1220', logo: require('../assets/mytokenpay.png') },
  gid: { fondo: '#14304A', logo: require('../assets/genesis-id.png') },
  og: { fondo: '#021B1C', logo: require('../assets/og.png') },
};
