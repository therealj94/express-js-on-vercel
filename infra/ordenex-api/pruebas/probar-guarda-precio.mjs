/* La guarda de precio: la orden de 4365,3 AUKA tecleada en dolares NO entra.
 *
 *   node pruebas/probar-guarda-precio.mjs
 *
 * Sin Mongo, sin red, sin reloj. Lo que se castiga aqui es:
 *
 *  1. La aritmetica: el desvio contra la referencia se calcula en BigInt sobre
 *     wei y se rotula en por ciento con signo, sin exagerar (trunca).
 *  2. Los umbrales salen de la configuracion, tienen valores por omision
 *     sensatos (5 y 25) y una variable rota no apaga la guarda.
 *  3. Los tres niveles: dentro del ruido entra; pasado el aviso entra SOLO con
 *     aceptoDesvio; pasado el bloqueo no entra ni aceptandolo.
 *  4. Quien tiene referencia (AUKA, AGKA, ONDK) y quien no (IBS, HARV): a los
 *     segundos la guarda los deja pasar y lo dice.
 *  5. Fail-closed: un mercado con referencia que se queda sin ella no coloca.
 *  6. El controller: `guardar` contesta los codigos del contrato con el
 *     detalle que la pantalla necesita, y `colocar` corta ANTES del motor.
 */

import guarda from '../lib/guardaPrecio.js';
import ordenes from '../controllers/ordenesController.js';

const { umbrales, desvioPct, juzgar, mercadoConReferencia, aWei } = guarda;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

const U = 10n ** 18n;
const wei = (n) => (BigInt(Math.round(n * 1e6)) * U / 1000000n).toString();
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// La referencia real de AUKA/ORIGEN: onza de oro entre gramin = 31,1035 x 55.
const REF_AUKA = 31.1035 * 55; // 1710,6925, con cualquier precio del oro

function resFingido() {
  const r = { estado: 200, cuerpo: null };
  r.status = (n) => { r.estado = n; return r; };
  r.json = (c) => { r.cuerpo = c; return r; };
  return r;
}

delete process.env.ORDENEX_DESVIO_AVISO_PCT;
delete process.env.ORDENEX_DESVIO_BLOQUEO_PCT;

decir('la aritmetica del desvio');
{
  const ref = aWei(REF_AUKA);
  comprobar(ref === 1710692500000000000000n, 'la referencia 1710,6925 pasa a wei por texto, sin basura binaria', String(ref));
  comprobar(desvioPct(wei(1710.6925), ref) === 0, 'al precio de la referencia el desvio es 0');
  comprobar(cerca(desvioPct(wei(1796.227125), ref), 5), '1796,23 es +5 %', String(desvioPct(wei(1796.227125), ref)));
  comprobar(cerca(desvioPct(wei(1283.019375), ref), -25), '1283,02 es -25 %', String(desvioPct(wei(1283.019375), ref)));
  const orden4365 = desvioPct(wei(4365.3), ref);
  comprobar(orden4365 > 150 && orden4365 < 160, 'LA ORDEN: 4365,3 ORIGEN por AUKA es un +155 % contra la referencia', String(orden4365));
  comprobar(desvioPct('abc', ref) === null && desvioPct(wei(1), null) === null, 'sin precio o sin referencia, null — jamas un cero');
  comprobar(aWei(0) === null && aWei(-1) === null && aWei(NaN) === null && aWei('2') === null, 'una referencia que no es un precio no se convierte');
}

decir('los umbrales: por omision 5 y 25, y una variable rota no apaga la guarda');
{
  let u = umbrales();
  comprobar(u.avisoPct === 5 && u.bloqueoPct === 25, 'sin variables: aviso 5 %, bloqueo 25 %', JSON.stringify(u));
  process.env.ORDENEX_DESVIO_AVISO_PCT = '3';
  process.env.ORDENEX_DESVIO_BLOQUEO_PCT = '15';
  u = umbrales();
  comprobar(u.avisoPct === 3 && u.bloqueoPct === 15, 'con variables: se leen (3 y 15)', JSON.stringify(u));
  process.env.ORDENEX_DESVIO_AVISO_PCT = 'mucho';
  process.env.ORDENEX_DESVIO_BLOQUEO_PCT = '0';
  u = umbrales();
  comprobar(u.avisoPct === 5 && u.bloqueoPct === 25, 'una variable que no es porcentaje cae al valor por omision, no a cero', JSON.stringify(u));
  process.env.ORDENEX_DESVIO_AVISO_PCT = '40';
  process.env.ORDENEX_DESVIO_BLOQUEO_PCT = '25';
  u = umbrales();
  comprobar(u.avisoPct === 25 && u.bloqueoPct === 25, 'un aviso por encima del bloqueo se baja al bloqueo', JSON.stringify(u));
  delete process.env.ORDENEX_DESVIO_AVISO_PCT;
  delete process.env.ORDENEX_DESVIO_BLOQUEO_PCT;
}

decir('los tres niveles');
{
  const base = { referenciaEnOrigen: REF_AUKA, conReferencia: true };
  comprobar(juzgar({ ...base, precio: wei(1700) }).nivel === 'ok', '1700 (−0,6 %) entra sin mas');
  comprobar(juzgar({ ...base, precio: wei(1750) }).nivel === 'ok', '1750 (+2,3 %) entra sin mas');
  const aviso = juzgar({ ...base, precio: wei(1900) });
  comprobar(aviso.nivel === 'aviso' && aviso.desvioPct > 5, '1900 (+11 %) pide confirmar el desvio', JSON.stringify(aviso));
  comprobar(juzgar({ ...base, precio: wei(1900), aceptoDesvio: true }).nivel === 'ok', '…y con aceptoDesvio: true entra');
  comprobar(juzgar({ ...base, precio: wei(1900), aceptoDesvio: 'true' }).nivel === 'aviso', 'aceptoDesvio tiene que ser el booleano true, no un texto');
  comprobar(juzgar({ ...base, precio: wei(1500) }).nivel === 'aviso', '1500 (−12 %) tambien avisa: el desvio es en valor absoluto');
  const bloqueo = juzgar({ ...base, precio: wei(4365.3), aceptoDesvio: true });
  comprobar(bloqueo.nivel === 'bloqueo', 'LA ORDEN: 4365,3 se bloquea aunque venga aceptada', JSON.stringify(bloqueo));
  comprobar(juzgar({ ...base, precio: wei(1000), aceptoDesvio: true }).nivel === 'bloqueo', '1000 (−41 %) se bloquea tambien por abajo');
  comprobar(bloqueo.referencia === '1710692500000000000000', 'el juicio devuelve la referencia en wei, como viajan los precios de la casa', bloqueo.referencia);
  comprobar(bloqueo.avisoPct === 5 && bloqueo.bloqueoPct === 25, 'y los dos umbrales, para que la pantalla los pueda enseñar');
}

decir('quien tiene referencia y quien no');
{
  comprobar(mercadoConReferencia('AUKA-ORIGEN'), 'AUKA sigue al oro: se mide');
  comprobar(mercadoConReferencia('AGKA-ORIGEN'), 'AGKA sigue a la plata: se mide');
  comprobar(mercadoConReferencia('ONDK-ORIGEN'), 'ONDK tiene precio declarado: se mide');
  comprobar(!mercadoConReferencia('IBS-ORIGEN') && !mercadoConReferencia('HARV-ORIGEN'), 'IBS y HARV no tienen contra que medir');
  comprobar(!mercadoConReferencia('PEPE-ORIGEN') && !mercadoConReferencia(''), 'ni un mercado inventado ni el vacio');
  const libre = juzgar({ precio: wei(9999), referenciaEnOrigen: null, conReferencia: false });
  comprobar(libre.nivel === 'libre' && libre.desvioPct === null, 'sin referencia declarada, la guarda deja pasar y lo dice: libre');
}

decir('fail-closed: un mercado con referencia que se queda sin ella no coloca');
{
  comprobar(juzgar({ precio: wei(1710), referenciaEnOrigen: null, conReferencia: true }).nivel === 'sinReferencia', 'feed caido: sinReferencia');
  comprobar(juzgar({ precio: wei(1710), referenciaEnOrigen: NaN, conReferencia: true }).nivel === 'sinReferencia', 'una referencia que no es numero: sinReferencia');
  comprobar(juzgar({ precio: 'diez', referenciaEnOrigen: REF_AUKA, conReferencia: true }).nivel === 'sinReferencia', 'un precio ilegible tampoco se juzga a favor');
}

decir('el controller: los codigos del contrato, con el detalle para la pantalla');
{
  const con = (enOrigen) => async () => (enOrigen == null ? null
    : { usd: 4374.21, rotulo: 'onza de oro', origenUsd: 2.557, enOrigen, fuente: 'fingido', en: 1786825800000 });

  let res = resFingido();
  let corto = await ordenes.guardar(res, { mercado: 'AUKA-ORIGEN', precio: wei(4365.3) }, con(REF_AUKA));
  comprobar(corto === true && res.estado === 400 && res.cuerpo?.codigo === 'PRECIO_DESVIADO', 'LA ORDEN: 400 PRECIO_DESVIADO', JSON.stringify(res.cuerpo));
  comprobar(/ORIGEN por unidad, no en dolares/.test(res.cuerpo?.error || ''), 'y el mensaje dice lo que paso de verdad: la unidad');
  comprobar(res.cuerpo?.referenciaFuente?.fuente === 'fingido' && res.cuerpo?.referenciaFuente?.en === 1786825800000,
    'con la fuente y la hora de la referencia: el rotulo viaja hasta el error');

  res = resFingido();
  corto = await ordenes.guardar(res, { mercado: 'AUKA-ORIGEN', precio: wei(1900) }, con(REF_AUKA));
  comprobar(corto === true && res.estado === 400 && res.cuerpo?.codigo === 'DESVIO_SIN_ACEPTAR', 'un +11 % sin aceptar: 400 DESVIO_SIN_ACEPTAR', JSON.stringify(res.cuerpo));

  res = resFingido();
  corto = await ordenes.guardar(res, { mercado: 'AUKA-ORIGEN', precio: wei(1900), aceptoDesvio: true }, con(REF_AUKA));
  comprobar(corto === false && res.cuerpo === null, 'el mismo +11 % aceptado pasa sin contestar nada');

  res = resFingido();
  corto = await ordenes.guardar(res, { mercado: 'AUKA-ORIGEN', precio: wei(1710) }, con(null));
  comprobar(corto === true && res.estado === 503 && res.cuerpo?.codigo === 'SIN_REFERENCIA_AHORA', 'sin referencia: 503 SIN_REFERENCIA_AHORA', JSON.stringify(res.cuerpo));

  res = resFingido();
  corto = await ordenes.guardar(res, { mercado: 'AUKA-ORIGEN', precio: wei(1710) }, async () => { throw new Error('feed roto'); });
  comprobar(corto === true && res.estado === 503, 'un feed que lanza tampoco deja pasar');

  res = resFingido();
  let llamado = false;
  corto = await ordenes.guardar(res, { mercado: 'IBS-ORIGEN', precio: wei(9999) }, async () => { llamado = true; return null; });
  comprobar(corto === false && !llamado, 'IBS pasa sin pedir referencia: no hay contra que medir');
}

decir('colocar corta ANTES del motor y de la idempotencia');
{
  ordenes.colocar.traerReferencia = async () => ({ enOrigen: REF_AUKA, fuente: 'fingido', en: 1 });
  const req = { usuario: { id: 'u1', gid: 'GEN-1' }, body: {
    mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'limite', precio: wei(4365.3), cantidad: wei(1), ordenKey: 'orden-4365-3-auka',
  } };
  const res = resFingido();
  let next = null;
  await ordenes.colocar(req, res, (e) => { next = e; });
  comprobar(next === null && res.estado === 400 && res.cuerpo?.codigo === 'PRECIO_DESVIADO',
    'POST /ordenes con 4365,3 contesta PRECIO_DESVIADO sin tocar Mongo ni el motor', JSON.stringify(res.cuerpo));

  const res2 = resFingido();
  await ordenes.colocar({ ...req, body: { ...req.body, tipo: 'mercado', precio: undefined } }, res2, (e) => { next = e; });
  comprobar(res2.estado !== 400 || res2.cuerpo?.codigo !== 'PRECIO_DESVIADO',
    'una orden de mercado no lleva precio y no pasa por la guarda (sigue su camino)');
  ordenes.colocar.traerReferencia = undefined;
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
