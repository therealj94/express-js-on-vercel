// Paleta Orden Global. Los paneles son translúcidos a propósito: la app se
// dibuja sobre la fotografía de marca (ver AppBackground) y esa transparencia
// es la que le da la profundidad de vidrio sin restar legibilidad.
export const C = {
  bg: '#021B1C',
  bg2: 'rgba(6,42,43,0.88)',
  // Vidrio: los paneles dejan pasar la fotografía de marca, igual que la
  // tarjeta del login. Los contenedores grandes además llevan desenfoque.
  panel: 'rgba(8,46,48,0.70)',
  panel2: 'rgba(14,60,62,0.76)',
  panel3: 'rgba(24,84,86,0.62)',
  line: 'rgba(201,169,97,0.28)',
  line2: 'rgba(201,169,97,0.22)',
  input: 'rgba(10,50,52,0.78)',
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
};

export const F = {
  // font families fall back to system; expo uses system by default
  h: undefined,
};
