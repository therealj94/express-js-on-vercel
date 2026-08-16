/* El precio declarado por la Junta: la puerta de entrada y la de salida.
 *
 *   node pruebas/probar-precio-declarado.mjs
 *
 * Esta coleccion existe para que ONDK pueda tener precio visible SIN que nadie
 * invente uno, y toda su honradez cabe en cuatro reglas. Son las cuatro que se
 * castigan aqui:
 *
 *  1. Sin acta y sin firmante no entra nada. Da igual lo bien formado que
 *     venga el resto: un precio del que no se puede decir de que resolucion
 *     sale es un numero escrito a mano.
 *  2. La fecha se exige explicita. Si faltara y se cayera a "hoy", cargar tres
 *     actas viejas de golpe las pondria las tres hoy — la grafica contaria una
 *     historia que no paso.
 *  3. El vigente es la ultima resolucion CUYA FECHA YA LLEGO. Una firmada con
 *     efecto a fin de mes no rige hoy.
 *  4. Sin resoluciones el vigente es null. Ni cero, ni el precio de emision
 *     supuesto, ni el ultimo que hubo en otra parte.
 *
 * Sin Mongo y sin red: todo lo que se comprueba pasa antes de tocar la base.
 */

import mongoose from 'mongoose';
import { esDeclarable, vigenteDe, DECLARABLES } from '../lib/preciosDeclarados.js';
import admin from '../controllers/adminController.js';
import precios from '../controllers/preciosController.js';

const { declararPrecio } = admin;
const { declarado } = precios;

// Aqui no hay Mongo, y la prueba manda A PROPOSITO un cuerpo bueno para ver
// que la validacion lo deja pasar. Sin esto, mongoose se queda esperando la
// conexion los diez segundos de su plazo por defecto.
mongoose.set('bufferTimeoutMS', 300);

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

// Un `res` de mentira que se queda con lo ultimo que le dijeron.
function respuesta() {
  const r = { codigo: null, cuerpo: null };
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  return r;
}

const BUENO = {
  token: 'ONDK', fecha: '2026-01-15', precio: 2.05,
  acta: 'JD-2026-03', firmante: 'Secretario de la Junta',
};

/** Manda un cuerpo y devuelve { codigo, cuerpo }. Si la validacion lo deja
 *  pasar, llega a Mongo y revienta sin conexion — eso se caza y se marca como
 *  PASO, que es justo lo que se quiere distinguir. */
async function mandar(cuerpo) {
  const res = respuesta();
  try {
    await declararPrecio({ body: cuerpo }, res);
  } catch {
    return { codigo: 'PASO', cuerpo: null };
  }
  // 503 NO_SE_PUDO_GUARDAR tambien es haber pasado la validacion: el fallo
  // vino de la base, no del guardarrail.
  if (res.codigo === 503) return { codigo: 'PASO', cuerpo: res.cuerpo };
  return { codigo: res.codigo, cuerpo: res.cuerpo };
}

decir('sin acta no hay precio declarado');
{
  const { acta, ...sinActa } = BUENO;
  const r = await mandar(sinActa);
  comprobar(r.codigo === 400 && r.cuerpo?.codigo === 'ACTA_INVALIDA',
    'un precio sin acta se rechaza', `${r.codigo} ${r.cuerpo?.codigo}`);

  const r2 = await mandar({ ...BUENO, acta: '   ' });
  comprobar(r2.codigo === 400 && r2.cuerpo?.codigo === 'ACTA_INVALIDA',
    'y un acta de puros espacios tampoco cuela', `${r2.codigo} ${r2.cuerpo?.codigo}`);

  const { firmante, ...sinFirma } = BUENO;
  const r3 = await mandar(sinFirma);
  comprobar(r3.codigo === 400 && r3.cuerpo?.codigo === 'FIRMANTE_INVALIDO',
    'ni una resolucion que nadie firma', `${r3.codigo} ${r3.cuerpo?.codigo}`);
}

decir('la fecha se dice, no se supone');
{
  const { fecha, ...sinFecha } = BUENO;
  const r = await mandar(sinFecha);
  comprobar(r.codigo === 400 && r.cuerpo?.codigo === 'FECHA_INVALIDA',
    'sin fecha de vigencia no entra', `${r.codigo} ${r.cuerpo?.codigo}`);
  comprobar(r.cuerpo?.error?.includes('2026-01-15'),
    'y el error enseña el formato que se espera', r.cuerpo?.error);

  const r2 = await mandar({ ...BUENO, fecha: 'el martes pasado' });
  comprobar(r2.codigo === 400 && r2.cuerpo?.codigo === 'FECHA_INVALIDA',
    'una fecha que no se puede leer se rechaza', `${r2.codigo} ${r2.cuerpo?.codigo}`);
}

decir('el precio es un numero de verdad');
{
  // String y no JSON.stringify: NaN e Infinity se serializan los dos como
  // "null" y las tres lineas del informe saldrian iguales.
  for (const malo of [0, -1, 'dos con cinco', null, NaN, Infinity]) {
    const r = await mandar({ ...BUENO, precio: malo });
    comprobar(r.codigo === 400 && r.cuerpo?.codigo === 'PRECIO_INVALIDO',
      `precio ${String(malo)} rechazado`, `${r.codigo} ${r.cuerpo?.codigo}`);
  }
}

decir('solo los instrumentos que de verdad se declaran');
{
  comprobar(DECLARABLES.length === 1 && DECLARABLES[0] === 'ONDK',
    'la lista blanca es ONDK y nadie mas', DECLARABLES.join(', '));
  // Que la Junta pudiera "declarar" el precio del oro seria absurdo: AUKA,
  // AGKA y ORIGEN siguen un metal y su precio se MIDE.
  for (const t of ['AUKA', 'AGKA', 'ORIGEN', 'IBS']) {
    comprobar(!esDeclarable(t), `${t} no lleva precio declarado`);
    const r = await mandar({ ...BUENO, token: t });
    comprobar(r.codigo === 400 && r.cuerpo?.codigo === 'NO_DECLARABLE',
      `y el panel rechaza declararle un precio a ${t}`, `${r.codigo} ${r.cuerpo?.codigo}`);
  }
  comprobar(esDeclarable('ondk'), 'ONDK se reconoce en minusculas tambien');
}

decir('un cuerpo completo SI pasa la validacion');
{
  const r = await mandar(BUENO);
  comprobar(r.codigo === 'PASO',
    'con token, fecha, precio, acta y firmante llega hasta la base',
    `se quedo en ${r.codigo} ${r.cuerpo?.codigo || ''}`);
}

decir('el vigente es la ultima resolucion que YA rige');
{
  const serie = [
    { fecha: '2024-07-01T00:00:00.000Z', precio: 1.00, acta: 'JD-2024-11' },
    { fecha: '2025-03-01T00:00:00.000Z', precio: 1.60, acta: 'JD-2025-04' },
    { fecha: '2026-01-15T00:00:00.000Z', precio: 2.05, acta: 'JD-2026-03' },
    // Firmada, pero con efecto a futuro: hoy NO rige.
    { fecha: '2027-01-01T00:00:00.000Z', precio: 2.40, acta: 'JD-2026-19' },
  ];
  const hoy = Date.parse('2026-08-16T12:00:00.000Z');

  const v = vigenteDe(serie, hoy);
  comprobar(v?.precio === 2.05, 'hoy rige 2.05, la del acta JD-2026-03', `${v?.precio} · ${v?.acta}`);
  comprobar(v?.precio !== 2.40, 'la firmada con efecto a 2027 NO se adelanta');

  const antes = vigenteDe(serie, Date.parse('2024-12-31T00:00:00.000Z'));
  comprobar(antes?.precio === 1.00, 'a finales de 2024 regia 1.00', `${antes?.precio}`);

  const antesDeTodo = vigenteDe(serie, Date.parse('2024-01-01T00:00:00.000Z'));
  comprobar(antesDeTodo === null,
    'y antes de la primera resolucion no hay precio: null, no 1.00 supuesto');

  // El escalon es plano ENTRE actas: cualquier dia de abril de 2025 vale lo
  // mismo que cualquier otro. Si esto empezara a dar numeros distintos, es que
  // alguien le metio movimiento inventado a un precio declarado.
  const abril1 = vigenteDe(serie, Date.parse('2025-04-01T00:00:00.000Z'));
  const abril30 = vigenteDe(serie, Date.parse('2025-04-30T23:59:59.000Z'));
  comprobar(abril1.precio === abril30.precio && abril1.precio === 1.60,
    'entre dos actas el precio no se mueve ni un centimo',
    `1-abr ${abril1.precio} · 30-abr ${abril30.precio}`);
}

decir('sin resoluciones cargadas, la pantalla se queda con el guion');
{
  comprobar(vigenteDe([]) === null, 'una serie vacia no tiene vigente');

  // Y el endpoint publico contesta 404 —no un precio de cortesia— para lo que
  // no es declarable.
  const res = respuesta();
  await declarado({ params: { token: 'AUKA' } }, res, () => {});
  comprobar(res.codigo === 404 && res.cuerpo?.codigo === 'NO_DECLARABLE',
    'GET /precio-declarado/AUKA es 404', `${res.codigo} ${res.cuerpo?.codigo}`);
}

decir('la respuesta publica se rotula sola');
{
  // `clase: 'declarado'` viaja siempre. Es el seguro contra que un cliente
  // pinte esto al lado de /mercados y ONDK parezca que cotiza.
  comprobar(typeof declarado === 'function', 'el endpoint existe');
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../controllers/preciosController.js', import.meta.url), 'utf8');
  comprobar(src.includes("clase: 'declarado'"),
    'y la respuesta lleva clase:declarado en la raiz');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
