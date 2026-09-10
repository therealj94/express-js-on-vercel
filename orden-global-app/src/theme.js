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

// La escala tipográfica. Cada pantalla traía sus propios tamaños sueltos
// —14, 14.5, 15.5, 12.5— y dos pantallas vecinas se leían como de apps
// distintas. Una sola escala, con nombre por lo que ES cada texto y no por
// su tamaño, para que un título sea un título en Enviar, en Ajustes y en el
// comprobante. Las pantallas nuevas la usan; las viejas se van pasando.
export const T = {
  h1: { fontSize: 26, fontWeight: '800', color: C.txt, lineHeight: 32 },
  h2: { fontSize: 19, fontWeight: '800', color: C.txt },
  h3: { fontSize: 16.5, fontWeight: '700', color: C.txt },
  // La cifra grande de un monto: tabular para que los dígitos no bailen.
  cifra: { fontSize: 28, fontWeight: '800', color: C.gold, fontVariant: ['tabular-nums'] },
  cuerpo: { fontSize: 14, color: C.txt, lineHeight: 20 },
  cuerpo2: { fontSize: 12.5, color: C.txt2, lineHeight: 18 },
  nota: { fontSize: 11.5, color: C.txt3, lineHeight: 16 },
  etiqueta: { fontSize: 11, letterSpacing: 2, color: C.txt3, fontWeight: '700' },
  boton: { fontSize: 15.5, fontWeight: '800' },
};

// Los botones de la app son DOS, y viven aquí y no en cada pantalla.
//   primario   → lo que se quiere que la persona haga: dorado, con sombra.
//   secundario → la alternativa: vidrio oscuro con filo dorado.
// Los nombres viejos de Button3D (gold, teal, dark, ghost) siguen aceptándose
// y caen en uno de estos dos: había cuatro degradados para lo mismo.
export const BOTON = {
  radio: 17,
  alto: 16,          // relleno vertical
  primario: { colores: G.gold, texto: C.darkText, borde: 'transparent', sombra: 'oro' },
  secundario: { colores: ['#123F41', '#0A3436'], texto: C.txt, borde: 'rgba(201,169,97,0.34)', sombra: 'negra' },
};
