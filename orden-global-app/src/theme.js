// Paleta Orden Global. Los paneles son translúcidos a propósito: la app se
// dibuja sobre la fotografía de marca (ver AppBackground) y esa transparencia
// es la que le da la profundidad de vidrio sin restar legibilidad.
export const C = {
  bg: '#021B1C',
  bg2: 'rgba(6,42,43,0.88)',
  // Vidrio: los paneles dejan pasar la fotografía de marca, igual que la
  // tarjeta del login. Los contenedores grandes además llevan desenfoque.
  // Al dejar la foto más visible (velo bajo en AppBackground), las tarjetas
  // suben de cuerpo para que el texto encima siga leyéndose sin esfuerzo.
  panel: 'rgba(6,40,42,0.82)',
  panel2: 'rgba(12,54,56,0.86)',
  panel3: 'rgba(22,78,80,0.74)',
  line: 'rgba(201,169,97,0.34)',
  line2: 'rgba(201,169,97,0.26)',
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

// gradient stop arrays
export const G = {
  gold: ['#F8EFCF', '#DFC078', '#C9A961', '#96793F'],
  green: ['rgba(13,88,79,0.86)', 'rgba(9,52,55,0.84)', 'rgba(4,25,27,0.88)'],
  greenCard: ['#0E6155', '#0A463F', '#063430'],
  // Tarjeta Visa: negro con calidez, para que el dorado del monograma y los
  // relieves no queden grises encima. Un negro puro apaga el oro.
  blackCard: ['#221D15', '#12100C', '#050505'],
};

export const F = {
  // La fuente de display del lockup de marca (splash y login). Se carga con
  // expo-font en src/fuentes.js; mientras no está lista —o si el binario no
  // trae el módulo— las pantallas caen a la del sistema. Nota: las fuentes
  // propias en Android no sintetizan negrita ni itálica, así que al aplicarla
  // hay que poner fontWeight 'normal' y fontStyle 'normal' explícitos.
  h: 'Cinzel-Bold',
};
