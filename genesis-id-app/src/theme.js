// Paleta de Genesis ID: la misma bóveda teal + oro del ecosistema Orden
// Global, en la variante del panel de cumplimiento (fondo #021012, cian para
// datos). Sin fotografía de fondo: esta app se usa para decidir sobre
// expedientes y la legibilidad manda sobre la ambientación.
export const C = {
  bg: '#021012',
  panel: '#0A3436',
  panel2: '#0d2b2d',
  line: '#1C5E61',
  line2: '#164a4d',
  input: '#061e20',
  gold: '#C9A961',
  goldLt: '#EAD79C',
  goldHi: '#F8EFCF',
  cyan: '#4FD8E0',
  txt: '#F1EAD6',
  txt2: '#9BB6B2',
  txt3: '#66857f',
  ok: '#3ED9A0',
  warn: '#F5B62E',
  bad: '#F0776B',
  crit: '#ff5a7a',
  darkText: '#1a1200',
};

export const G = {
  gold: ['#F8EFCF', '#DFC078', '#C9A961', '#96793F'],
};

/** Color y fondo de cada nivel de riesgo, estado y gravedad. */
export const SEMAFORO = {
  // riesgo
  bajo: C.ok, medio: C.warn, alto: C.bad, inaceptable: C.crit,
  // estados de identidad
  verificada: C.ok, 'en-revision': C.warn, biometria: C.warn, documento: C.warn,
  datos: C.txt3, iniciada: C.txt3, rechazada: C.bad, suspendida: C.crit,
  // casos
  abierto: C.warn, 'en-analisis': C.cyan, cerrado: C.ok, reportado: C.cyan,
  // gravedad de alertas
  critica: C.crit, alta: C.bad, media: C.warn, informativa: C.cyan,
};
