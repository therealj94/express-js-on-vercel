// Paleta Orden Global. Los paneles son translúcidos a propósito: la app se
// dibuja sobre la fotografía de marca (ver AppBackground) y esa transparencia
// es la que le da la profundidad de vidrio sin restar legibilidad.
export const C = {
  bg: '#021B1C',
  bg2: 'rgba(6,42,43,0.94)',
  panel: 'rgba(11,55,57,0.66)',
  panel2: 'rgba(20,71,73,0.72)',
  panel3: 'rgba(24,84,86,0.78)',
  line: 'rgba(201,169,97,0.22)',
  line2: 'rgba(40,110,113,0.7)',
  input: 'rgba(12,58,59,0.78)',
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
  green: ['#0F5F55', '#0A3A3D', '#04191B'],
  greenCard: ['#0E6155', '#0A463F', '#063430'],
};

export const F = {
  // font families fall back to system; expo uses system by default
  h: undefined,
};
