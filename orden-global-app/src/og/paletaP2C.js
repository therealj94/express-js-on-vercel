/* LA PALETA DE PULSE2CHAT · azul, y sólo para el chat.
 *
 * El resto de la app es verde y oro —la billetera, ORIGEN— y eso no cambia.
 * PULSE2CHAT es un producto con nombre propio dentro de la app, y tiene que
 * verse como tal: quien entra al chat tiene que saber que entró al chat, no a
 * otra pestaña de la billetera. Un azul profundo de fondo, un acento claro
 * para lo que se toca, y dos burbujas que se distinguen de un vistazo.
 *
 * LO QUE SE QUEDA EN ORO a propósito: el comprobante de pago dentro del hilo.
 * Es dinero, y el dinero en esta casa es oro; que resalte sobre el azul es
 * justo lo que se quiere.
 *
 * Todo lo del chat lee de aquí y no de `theme.js`: así el día que alguien
 * cambie el verde de la billetera, el chat sigue siendo el chat.
 */
export const P2C = {
  // el suelo: azul profundo, dos tonos para dar cuerpo a los paneles
  fondo: '#071A33',
  fondo2: '#0B2A4A',
  // paneles y hojas (las que suben desde abajo) sobre ese suelo
  panel: 'rgba(11,42,74,0.86)',
  panel2: 'rgba(16,52,92,0.90)',
  hoja: '#0D2C50',
  // el acento: lo que se toca, lo que manda
  acento: '#3B82F6',
  acentoLt: '#93C5FD',
  acentoHi: '#DBEAFE',
  acentoDp: '#1D4ED8',
  // líneas y campos
  linea: 'rgba(147,197,253,0.30)',
  linea2: 'rgba(147,197,253,0.20)',
  tinte: 'rgba(59,130,246,0.12)',
  tinte2: 'rgba(59,130,246,0.22)',
  input: 'rgba(7,26,51,0.88)',
  inputBr: '#2B5A9A',
  // texto
  texto: '#EEF4FF',
  texto2: '#B7C7E3',
  texto3: '#7C93B8',
  // las burbujas: la propia en el azul del acento con texto blanco; la ajena
  // en un azul sordo que deja el texto claro encima
  mia: '#2563EB',
  suya: '#123B66',
  textoMia: '#FFFFFF',
  textoMiaSuave: 'rgba(255,255,255,0.72)',
  textoBoton: '#08192F',
  // el degradado de los botones que en el resto de la app son de oro
  grad: ['#93C5FD', '#3B82F6', '#2563EB'],
  // señales
  bien: '#3ED9A0',
  mal: '#F0776B',
  // los fondos de un estado de sólo texto: el índice es lo que viaja al
  // relevo (0..7), el color lo decide la app — igual que en la web
  fondosEstado: ['#1D4ED8', '#0F766E', '#7C3AED', '#B45309', '#BE123C', '#0369A1', '#4D7C0F', '#334155'],
};

export default P2C;
