/* El circuito fiat contra un Mongo de verdad (en memoria): la maquina de
 * estados con el dinero en garantia.
 *
 *   node pruebas/probar-fiat.mjs
 *
 * Se prueba lo que el contrato promete: entrada y salida de punta a punta
 * (reserva al abrir, bancos revelados solo al dueño con la solicitud tomada,
 * aviso con referencia, confirmacion que ejecuta la garantia), cancelacion
 * con liberacion (y la regla del "salvo acuerdo" tras el aviso), doble
 * confirmacion idempotente que NO paga dos veces, disputa que congela y
 * arbitraje del admin hacia ambos lados. Y al final, la de siempre: la doble
 * entrada del ledger cuadra despues de todo el trajin.
 *
 * Los handlers se llaman directo con req/res fingidos — el HTTP, el JWT y el
 * Genesis fingido son asunto de probar-api.mjs; aqui se prueba el circuito.
 *
 * Corre contra mongodb-memory-server (devDependencies). Si no esta instalado
 * se dice y se sale — sin fingir un verde que no se gano.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}

const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_prueba' });

const { Usuario, Cuenta, Asiento, Agente, Solicitud } = (await import('../models/index.js')).default;
const ledger = (await import('../lib/ledger.js')).default;
const fiat = (await import('../controllers/fiatController.js')).default;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

const U = 10n ** 18n;
const w = (n) => (BigInt(n) * U).toString();
const cuentaDe = async (u, a) => {
  const c = await Cuenta.findOne({ userId: u, activo: a }).lean();
  return c ? { disponible: BigInt(c.disponible), reservado: BigInt(c.reservado) } : { disponible: 0n, reservado: 0n };
};

// Un handler de Express llamado a pelo: req y res fingidos, y la respuesta
// resuelta en la promesa. Si el handler tirara sin responder (no deberia:
// todos rematan en res.json), se atrapa como fallo y no como cuelgue.
const llamar = (fn, { usuario = null, cuerpo = {}, params = {}, query = {} } = {}) =>
  new Promise((resolve) => {
    const req = { usuario, body: cuerpo, params, query, headers: {} };
    const res = {
      _status: 200,
      status(codigo) { this._status = codigo; return this; },
      json(objeto) { resolve({ status: this._status, cuerpo: objeto }); },
    };
    Promise.resolve(fn(req, res)).catch((e) =>
      resolve({ status: 500, cuerpo: { error: String(e && e.message), codigo: 'EXCEPCION_SIN_ATRAPAR' } })
    );
  });

// ── El elenco ───────────────────────────────────────────────────────────────
// ana: usuaria verificada. beto: agente verificado con dos bancos. caro: SIN
// verificar. dora: agente activo cuyo usuario perdio la verificacion.
const anaDoc = await Usuario.create({ gid: 'G-ANA', nombre: 'Ana', verificada: true });
const betoDoc = await Usuario.create({ gid: 'G-BETO', nombre: 'Beto', verificada: true, esAgente: true });
const caroDoc = await Usuario.create({ gid: 'G-CARO', nombre: 'Caro', verificada: false });
const doraDoc = await Usuario.create({ gid: 'G-DORA', nombre: 'Dora', verificada: false, esAgente: true });
const anaId = String(anaDoc._id);
const betoId = String(betoDoc._id);
const caroId = String(caroDoc._id);

const agenteBeto = await Agente.create({
  gid: 'G-BETO',
  userId: betoId,
  nombre: 'Beto Cambios',
  bancos: [
    { banco: 'Atlantida', cuenta: '01-234-567', titular: 'Beto B.' },
    { banco: 'BAC', cuenta: '99-888-777', titular: 'Beto B.' },
  ],
  monedas: ['HNL', 'USD'],
  activo: true,
});
const agenteDora = await Agente.create({
  gid: 'G-DORA',
  userId: String(doraDoc._id),
  nombre: 'Dora Divisas',
  bancos: [{ banco: 'Occidente', cuenta: '11-222', titular: 'Dora D.' }],
  monedas: ['HNL'],
  activo: true,
});
await Agente.create({
  gid: 'G-BAJA',
  userId: 'usuario-de-baja',
  nombre: 'Agente De Baja',
  bancos: [{ banco: 'Ficohsa', cuenta: '00-000', titular: 'Nadie' }],
  monedas: ['HNL'],
  activo: false,
});
const agenteBetoId = String(agenteBeto._id);

const ana = { id: anaId, gid: 'G-ANA' };
const beto = { id: betoId, gid: 'G-BETO' };
const caro = { id: caroId, gid: 'G-CARO' };

// La plata de partida. ORIGEN es el unico activo del circuito.
await ledger.acreditar(betoId, 'ORIGEN', w(1000), 'semilla:beto');
await ledger.acreditar(anaId, 'ORIGEN', w(500), 'semilla:ana');

decir('GET /fiat/agentes: publico, y sin un solo numero de cuenta');
{
  const r = await llamar(fiat.agentes, { query: { moneda: 'HNL' } });
  comprobar(r.status === 200 && Array.isArray(r.cuerpo), 'devuelve la lista', JSON.stringify(r.cuerpo));
  const nombres = r.cuerpo.map((a) => a.nombre);
  comprobar(nombres.includes('Beto Cambios') && nombres.includes('Dora Divisas'),
    'con los agentes activos de esa moneda');
  comprobar(!nombres.includes('Agente De Baja'), 'y sin los que estan de baja');

  const crudo = JSON.stringify(r.cuerpo);
  comprobar(!crudo.includes('01-234-567') && !crudo.includes('99-888-777') && !crudo.includes('titular'),
    'NI cuentas NI titulares: solo nombres de banco', crudo);
  const beto2 = r.cuerpo.find((a) => a.nombre === 'Beto Cambios');
  comprobar(Array.isArray(beto2.bancos) && beto2.bancos.includes('Atlantida') && beto2.bancos.includes('BAC'),
    'los nombres de banco si se enseñan');

  const rUsd = await llamar(fiat.agentes, { query: { moneda: 'USD' } });
  comprobar(rUsd.cuerpo.length === 1 && rUsd.cuerpo[0].nombre === 'Beto Cambios',
    'el filtro por moneda filtra de verdad');
  const rMal = await llamar(fiat.agentes, { query: { moneda: 'EUR' } });
  comprobar(rMal.status === 400 && rMal.cuerpo.codigo === 'MONEDA_INVALIDA', 'una moneda inventada es un 400');
}

decir('entrada de punta a punta: ana compra 100 ORIGEN a beto');
let idEntrada;
{
  const r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(100), moneda: 'HNL', montoFiat: '250000', banco: 'Atlantida' },
  });
  comprobar(r.status === 201 && r.cuerpo.solicitud?.estado === 'abierta', 'la solicitud nace abierta', JSON.stringify(r.cuerpo));
  idEntrada = r.cuerpo.solicitud.id;
  comprobar(r.cuerpo.solicitud.historia.length === 1
    && r.cuerpo.solicitud.historia[0].de === null && r.cuerpo.solicitud.historia[0].a === 'abierta',
    'con su fila de nacimiento {de: null, a: abierta}');

  let b = await cuentaDe(betoId, 'ORIGEN');
  comprobar(b.disponible === 900n * U && b.reservado === 100n * U,
    'y la garantia se reservo del AGENTE al abrir: entrada = ORIGEN de beto',
    `disponible=${b.disponible} reservado=${b.reservado}`);

  // Antes de que beto la tome, ana NO ve los numeros de cuenta.
  let lista = await llamar(fiat.listarSolicitudes, { usuario: ana });
  let mia = lista.cuerpo.find((s) => s.id === idEntrada);
  comprobar(mia && mia.rol === 'usuario' && !('bancosAgente' in mia),
    'abierta: el dueño todavia NO ve los bancos completos', JSON.stringify(mia));

  // Tomar: solo el agente destinatario.
  const rAna = await llamar(fiat.tomar, { usuario: ana, params: { id: idEntrada } });
  comprobar(rAna.status === 403, 'tomarla el propio usuario es un 403');
  const rCaro = await llamar(fiat.tomar, { usuario: caro, params: { id: idEntrada } });
  comprobar(rCaro.status === 403 && rCaro.cuerpo.codigo === 'NO_TE_TOCA', 'y un tercero ni la toca');
  const rToma = await llamar(fiat.tomar, { usuario: beto, params: { id: idEntrada } });
  comprobar(rToma.status === 200 && rToma.cuerpo.solicitud.estado === 'tomada', 'el agente destinatario si la toma');

  // Tomada: ahora si, el banco completo — y SOLO el que ana eligio.
  lista = await llamar(fiat.listarSolicitudes, { usuario: ana });
  mia = lista.cuerpo.find((s) => s.id === idEntrada);
  comprobar(Array.isArray(mia.bancosAgente) && mia.bancosAgente.length === 1
    && mia.bancosAgente[0].cuenta === '01-234-567' && mia.bancosAgente[0].titular === 'Beto B.',
    'tomada: el dueño ve cuenta y titular del banco elegido', JSON.stringify(mia.bancosAgente));
  const listaBeto = await llamar(fiat.listarSolicitudes, { usuario: beto });
  const suya = listaBeto.cuerpo.find((s) => s.id === idEntrada);
  comprobar(suya && suya.rol === 'agente', 'el agente la ve con rol agente');

  // Avisar: paga el usuario (entrada), con referencia obligatoria.
  const rMalAviso = await llamar(fiat.avisar, { usuario: beto, params: { id: idEntrada }, cuerpo: { referencia: 'X' } });
  comprobar(rMalAviso.status === 403, 'avisar el que NO paga es un 403');
  const rSinRef = await llamar(fiat.avisar, { usuario: ana, params: { id: idEntrada }, cuerpo: {} });
  comprobar(rSinRef.status === 400 && rSinRef.cuerpo.codigo === 'REFERENCIA_INVALIDA', 'y sin referencia no hay aviso');
  const rAviso = await llamar(fiat.avisar, { usuario: ana, params: { id: idEntrada }, cuerpo: { referencia: 'TRF-778899' } });
  comprobar(rAviso.status === 200 && rAviso.cuerpo.solicitud.estado === 'fiat-avisado'
    && rAviso.cuerpo.solicitud.referencia === 'TRF-778899',
    'quien paga avisa y la referencia queda anotada');

  // Confirmar: recibe el agente (entrada).
  const rMalConf = await llamar(fiat.confirmar, { usuario: ana, params: { id: idEntrada } });
  comprobar(rMalConf.status === 403, 'confirmar el que NO recibe el fiat es un 403');
  const rConf = await llamar(fiat.confirmar, { usuario: beto, params: { id: idEntrada } });
  comprobar(rConf.status === 200 && rConf.cuerpo.solicitud.estado === 'liquidada', 'quien recibe confirma y queda liquidada');

  b = await cuentaDe(betoId, 'ORIGEN');
  const a = await cuentaDe(anaId, 'ORIGEN');
  comprobar(b.disponible === 900n * U && b.reservado === 0n, 'la garantia de beto se consumio', `${b.disponible}/${b.reservado}`);
  comprobar(a.disponible === 600n * U && a.reservado === 0n, 'y el ORIGEN aparecio en el disponible de ana', `${a.disponible}`);
}

decir('doble confirmacion: idempotente, y sin pagar dos veces');
{
  const antes = { b: await cuentaDe(betoId, 'ORIGEN'), a: await cuentaDe(anaId, 'ORIGEN') };
  const r = await llamar(fiat.confirmar, { usuario: beto, params: { id: idEntrada } });
  comprobar(r.status === 200 && r.cuerpo.solicitud?.estado === 'liquidada',
    'el segundo confirmar recibe la MISMA respuesta buena', JSON.stringify(r.cuerpo));
  const despues = { b: await cuentaDe(betoId, 'ORIGEN'), a: await cuentaDe(anaId, 'ORIGEN') };
  comprobar(despues.b.disponible === antes.b.disponible && despues.b.reservado === antes.b.reservado
    && despues.a.disponible === antes.a.disponible && despues.a.reservado === antes.a.reservado,
    'y el ledger NO se movio ni un wei');
  const patas = await Asiento.countDocuments({ ref: `fiat:${idEntrada}` });
  comprobar(patas === 4, 'cuatro patas y solo cuatro: reserva (2) + ejecucion (2)', `patas=${patas}`);
}

decir('salida de punta a punta: ana vende 50 ORIGEN a beto');
{
  const rSinBanco = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'salida', agenteId: agenteBetoId, cantidad: w(50), moneda: 'USD', montoFiat: '10000' },
  });
  comprobar(rSinBanco.status === 400 && rSinBanco.cuerpo.codigo === 'BANCO_INVALIDO',
    'una salida sin banco propio no nace: el agente no sabria donde pagar');

  const r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'salida', agenteId: agenteBetoId, cantidad: w(50), moneda: 'USD', montoFiat: '10000', banco: 'Atlantida 01-999-111, Ana A.' },
  });
  comprobar(r.status === 201, 'la salida nace', JSON.stringify(r.cuerpo));
  const id = r.cuerpo.solicitud.id;

  let a = await cuentaDe(anaId, 'ORIGEN');
  comprobar(a.disponible === 550n * U && a.reservado === 50n * U,
    'la garantia se reservo del USUARIO: salida = ORIGEN de ana', `${a.disponible}/${a.reservado}`);

  await llamar(fiat.tomar, { usuario: beto, params: { id } });
  const rAviso = await llamar(fiat.avisar, { usuario: beto, params: { id }, cuerpo: { referencia: 'TRF-556677' } });
  comprobar(rAviso.status === 200 && rAviso.cuerpo.solicitud.estado === 'fiat-avisado',
    'en la salida avisa el AGENTE: el paga el fiat');
  const rConf = await llamar(fiat.confirmar, { usuario: ana, params: { id } });
  comprobar(rConf.status === 200 && rConf.cuerpo.solicitud.estado === 'liquidada',
    'y confirma el USUARIO: el lo recibe');

  a = await cuentaDe(anaId, 'ORIGEN');
  const b = await cuentaDe(betoId, 'ORIGEN');
  comprobar(a.disponible === 550n * U && a.reservado === 0n && b.disponible === 950n * U,
    'la garantia de ana paso al disponible de beto', `ana=${a.disponible}/${a.reservado} beto=${b.disponible}`);
}

decir('cancelar libera la garantia');
{
  // Abierta: el agente tambien puede cancelar — la plata congelada es SUYA.
  let r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(100), moneda: 'HNL', montoFiat: '250000' },
  });
  let id = r.cuerpo.solicitud.id;
  let b = await cuentaDe(betoId, 'ORIGEN');
  comprobar(b.disponible === 850n * U && b.reservado === 100n * U, 'abierta: la garantia esta puesta');
  const rCaro = await llamar(fiat.cancelar, { usuario: caro, params: { id } });
  comprobar(rCaro.status === 403, 'un tercero no cancela nada');
  r = await llamar(fiat.cancelar, { usuario: beto, params: { id }, cuerpo: { nota: 'sin liquidez esta semana' } });
  comprobar(r.status === 200 && r.cuerpo.solicitud.estado === 'cancelada', 'el agente cancela una abierta que congela SU plata');
  b = await cuentaDe(betoId, 'ORIGEN');
  comprobar(b.disponible === 950n * U && b.reservado === 0n, 'y su garantia volvio entera', `${b.disponible}/${b.reservado}`);

  // Con fiat avisado: SOLO quien pago puede cancelar (el "salvo acuerdo").
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(60), moneda: 'HNL', montoFiat: '150000' },
  });
  id = r.cuerpo.solicitud.id;
  await llamar(fiat.tomar, { usuario: beto, params: { id } });
  await llamar(fiat.avisar, { usuario: ana, params: { id }, cuerpo: { referencia: 'TRF-000111' } });
  const rBeto = await llamar(fiat.cancelar, { usuario: beto, params: { id } });
  comprobar(rBeto.status === 409 && rBeto.cuerpo.codigo === 'SOLO_QUIEN_PAGO',
    'quien RECIBE el fiat no puede cancelar un pago ya avisado', JSON.stringify(rBeto.cuerpo));
  const rAna = await llamar(fiat.cancelar, { usuario: ana, params: { id }, cuerpo: { nota: 'acordamos deshacerla' } });
  comprobar(rAna.status === 200 && rAna.cuerpo.solicitud.estado === 'cancelada',
    'quien pago si: renuncia a su propio pago');
  b = await cuentaDe(betoId, 'ORIGEN');
  comprobar(b.disponible === 950n * U && b.reservado === 0n, 'y la garantia de beto se libero');

  const rDoble = await llamar(fiat.cancelar, { usuario: ana, params: { id } });
  comprobar(rDoble.status === 409, 'cancelar lo cancelado es un 409');
}

decir('disputa: congela, y el admin arbitra hacia ambos lados');
{
  // A favor del usuario (entrada): ana pago, beto no confirma.
  let r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(80), moneda: 'HNL', montoFiat: '200000', banco: 'BAC' },
  });
  const idDisputa = r.cuerpo.solicitud.id;
  await llamar(fiat.tomar, { usuario: beto, params: { id: idDisputa } });
  await llamar(fiat.avisar, { usuario: ana, params: { id: idDisputa }, cuerpo: { referencia: 'TRF-91847' } });

  r = await llamar(fiat.disputar, { usuario: ana, params: { id: idDisputa }, cuerpo: { nota: 'pague y no me confirma' } });
  comprobar(r.status === 200 && r.cuerpo.solicitud.estado === 'disputa', 'la punta que pago disputa');
  const fila = r.cuerpo.solicitud.historia.at(-1);
  comprobar(fila.de === 'fiat-avisado' && fila.a === 'disputa' && fila.nota === 'pague y no me confirma',
    'con su fila {de, a, nota} en la historia', JSON.stringify(fila));

  const rConf = await llamar(fiat.confirmar, { usuario: beto, params: { id: idDisputa } });
  comprobar(rConf.status === 409, 'disputada: ya nadie confirma');
  const rCanc = await llamar(fiat.cancelar, { usuario: ana, params: { id: idDisputa } });
  comprobar(rCanc.status === 409 && rCanc.cuerpo.codigo === 'EN_DISPUTA', 'ni cancela: espera al admin');
  let b = await cuentaDe(betoId, 'ORIGEN');
  comprobar(b.reservado === 80n * U, 'y la garantia sigue congelada', `reservado=${b.reservado}`);

  const rMalFavor = await llamar(fiat.resolverDisputa, { params: { id: idDisputa }, cuerpo: { aFavor: 'nadie' } });
  comprobar(rMalFavor.status === 400, 'aFavor tiene dos valores y solo dos');
  r = await llamar(fiat.resolverDisputa, { params: { id: idDisputa }, cuerpo: { aFavor: 'usuario', nota: 'comprobante bancario valido' } });
  comprobar(r.status === 200 && r.cuerpo.solicitud.estado === 'liquidada',
    'a favor del usuario en una entrada = liquidada', JSON.stringify(r.cuerpo));
  b = await cuentaDe(betoId, 'ORIGEN');
  const a = await cuentaDe(anaId, 'ORIGEN');
  comprobar(b.disponible === 870n * U && b.reservado === 0n && a.disponible === 630n * U,
    'la garantia de beto se ejecuto a favor de ana', `beto=${b.disponible}/${b.reservado} ana=${a.disponible}`);

  const rTarde = await llamar(fiat.resolverDisputa, { params: { id: idDisputa }, cuerpo: { aFavor: 'agente' } });
  comprobar(rTarde.status === 409 && rTarde.cuerpo.codigo === 'NO_ESTA_EN_DISPUTA', 'lo arbitrado no se re-arbitra');

  // La historia completa cuenta el viaje entero, eslabon por eslabon.
  const s = await Solicitud.findById(idDisputa).lean();
  const viaje = s.historia.map((h) => h.a);
  comprobar(JSON.stringify(viaje) === JSON.stringify(['abierta', 'tomada', 'fiat-avisado', 'disputa', 'liquidada']),
    'historia: abierta → tomada → fiat-avisado → disputa → liquidada', JSON.stringify(viaje));
  comprobar(s.historia.every((h, i) => i === 0 || h.de === s.historia[i - 1].a),
    'y cada fila engancha con la anterior: de[i] === a[i-1]');
  comprobar(s.historia.at(-1).quien === 'admin:usuario' && s.historia.at(-1).nota === 'comprobante bancario valido',
    'la resolucion firma admin y lleva su nota', JSON.stringify(s.historia.at(-1)));

  // A favor del agente (salida): el agente pago; la garantia de ana es suya.
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'salida', agenteId: agenteBetoId, cantidad: w(40), moneda: 'USD', montoFiat: '4000', banco: 'Atlantida 01-999-111, Ana A.' },
  });
  const idSalida = r.cuerpo.solicitud.id;
  await llamar(fiat.tomar, { usuario: beto, params: { id: idSalida } });
  await llamar(fiat.avisar, { usuario: beto, params: { id: idSalida }, cuerpo: { referencia: 'TRF-3141' } });
  await llamar(fiat.disputar, { usuario: beto, params: { id: idSalida }, cuerpo: { nota: 'pague y no confirma' } });
  r = await llamar(fiat.resolverDisputa, { params: { id: idSalida }, cuerpo: { aFavor: 'agente', nota: 'transferencia verificada' } });
  comprobar(r.status === 200 && r.cuerpo.solicitud.estado === 'liquidada',
    'a favor del agente en una salida = liquidada');
  const a2 = await cuentaDe(anaId, 'ORIGEN');
  const b2 = await cuentaDe(betoId, 'ORIGEN');
  comprobar(a2.disponible === 590n * U && a2.reservado === 0n && b2.disponible === 910n * U,
    'la garantia de ana se ejecuto a favor de beto', `ana=${a2.disponible}/${a2.reservado} beto=${b2.disponible}`);

  // A favor del dueño de la garantia: se libera, no se paga (cancelada).
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'salida', agenteId: agenteBetoId, cantidad: w(30), moneda: 'USD', montoFiat: '3000', banco: 'Atlantida 01-999-111, Ana A.' },
  });
  const idTomada = r.cuerpo.solicitud.id;
  await llamar(fiat.tomar, { usuario: beto, params: { id: idTomada } });
  r = await llamar(fiat.disputar, { usuario: beto, params: { id: idTomada }, cuerpo: { nota: 'el banco que dio no existe' } });
  comprobar(r.status === 200 && r.cuerpo.solicitud.estado === 'disputa', 'disputar desde tomada tambien vale');
  r = await llamar(fiat.resolverDisputa, { params: { id: idTomada }, cuerpo: { aFavor: 'usuario', nota: 'nadie pago nada' } });
  comprobar(r.status === 200 && r.cuerpo.solicitud.estado === 'cancelada',
    'a favor del dueño de la garantia = cancelada: se libera, no se paga');
  const a3 = await cuentaDe(anaId, 'ORIGEN');
  comprobar(a3.disponible === 590n * U && a3.reservado === 0n, 'y la garantia de ana volvio a su disponible');
}

decir('las puertas: verificacion, tope, punta unica y saldo');
{
  let r = await llamar(fiat.crearSolicitud, {
    usuario: caro,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'HNL', montoFiat: '100' },
  });
  comprobar(r.status === 403 && r.cuerpo.codigo === 'NO_VERIFICADA', 'sin Genesis verificada no se opera fiat');

  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: String(agenteDora._id), cantidad: w(1), moneda: 'HNL', montoFiat: '100' },
  });
  comprobar(r.status === 409 && r.cuerpo.codigo === 'AGENTE_NO_VERIFICADO',
    'y un agente que perdio la verificacion tampoco opera: se comprueba en CADA solicitud');

  r = await llamar(fiat.crearSolicitud, {
    usuario: beto,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'HNL', montoFiat: '100' },
  });
  comprobar(r.status === 400 && r.cuerpo.codigo === 'PUNTA_UNICA', 'nadie abre una solicitud contra si mismo');

  // El tope conservador: 1000 USD por solicitud cuando el perfil no dijo.
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'USD', montoFiat: '100001' },
  });
  comprobar(r.status === 403 && r.cuerpo.codigo === 'TOPE_EXCEDIDO', 'sin dato del perfil, 1000,01 USD ya no pasa');
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'HNL', montoFiat: '2000020' },
  });
  comprobar(r.status === 403 && r.cuerpo.codigo === 'TOPE_EXCEDIDO',
    'en lempiras el tope muerde con el cambio conservador (20 HNL = 1 USD)');
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'USD', montoFiat: '100000' },
  });
  comprobar(r.status === 201, 'y 1000,00 USD justos si pasan');
  await llamar(fiat.cancelar, { usuario: ana, params: { id: r.cuerpo.solicitud.id } });

  // Con umbral en el perfil (lo guardaria el authController), el tope es ESE.
  // Se escribe con el driver crudo: el esquema no declara el campo y la
  // gracia es exactamente esa — el circuito lo lee del documento, este o no
  // en el esquema.
  await Usuario.collection.updateOne({ _id: anaDoc._id }, { $set: { umbralDiligenciaUsd: 5000 } });
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'USD', montoFiat: '400000' },
  });
  comprobar(r.status === 201, 'con umbralDiligenciaUsd=5000 en el perfil, 4000 USD pasan', JSON.stringify(r.cuerpo));
  await llamar(fiat.cancelar, { usuario: ana, params: { id: r.cuerpo.solicitud.id } });
  await Usuario.collection.updateOne({ _id: anaDoc._id }, { $unset: { umbralDiligenciaUsd: 1 } });

  // El saldo manda: sin garantia posible, la solicitud no nace.
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(100000), moneda: 'HNL', montoFiat: '100' },
  });
  comprobar(r.status === 409 && r.cuerpo.codigo === 'GARANTIA_NO_ALCANZA',
    'una entrada que el agente no puede garantizar no nace, y se dice con nombre');
  r = await llamar(fiat.crearSolicitud, {
    usuario: ana,
    cuerpo: { tipo: 'salida', agenteId: agenteBetoId, cantidad: w(100000), moneda: 'HNL', montoFiat: '100', banco: 'Atlantida 01-999, Ana' },
  });
  comprobar(r.status === 409 && r.cuerpo.codigo === 'SALDO_INSUFICIENTE',
    'y una salida sin saldo propio tampoco');
}

decir('cuerpos que no son cuerpos');
{
  const malos = [
    [{ tipo: 'permuta', agenteId: agenteBetoId, cantidad: w(1), moneda: 'HNL', montoFiat: '100' }, 'TIPO_INVALIDO'],
    [{ tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'HNL', montoFiat: '100', activo: 'AUKA' }, 'ACTIVO_INVALIDO'],
    [{ tipo: 'entrada', agenteId: agenteBetoId, cantidad: '1.5', moneda: 'HNL', montoFiat: '100' }, 'CANTIDAD_INVALIDA'],
    [{ tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'EUR', montoFiat: '100' }, 'MONEDA_INVALIDA'],
    [{ tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'HNL', montoFiat: '12.50' }, 'MONTO_FIAT_INVALIDO'],
    [{ tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'HNL', montoFiat: '0' }, 'MONTO_FIAT_INVALIDO'],
    [{ tipo: 'entrada', agenteId: agenteBetoId, cantidad: w(1), moneda: 'HNL', montoFiat: '100', banco: 'Ficticio' }, 'BANCO_INVALIDO'],
    [{ tipo: 'entrada', agenteId: 'no-es-un-id', cantidad: w(1), moneda: 'HNL', montoFiat: '100' }, 'AGENTE_NO_EXISTE'],
  ];
  for (const [cuerpo, codigo] of malos) {
    const r = await llamar(fiat.crearSolicitud, { usuario: ana, cuerpo });
    comprobar(r.status >= 400 && r.cuerpo.codigo === codigo,
      `se rechaza con ${codigo}`, JSON.stringify({ status: r.status, cuerpo: r.cuerpo }));
  }

  const rNoId = await llamar(fiat.tomar, { usuario: beto, params: { id: String(new mongoose.Types.ObjectId()) } });
  comprobar(rNoId.status === 404, 'tomar un id que no existe es un 404');
  const rAvisoAbierta = await llamar(fiat.confirmar, { usuario: beto, params: { id: idEntrada } });
  comprobar(rAvisoAbierta.status === 200 && rAvisoAbierta.cuerpo.solicitud.estado === 'liquidada',
    '(y la entrada liquidada de arriba sigue respondiendo idempotente)');
}

decir('la doble entrada cuadra despues de todo el trajin');
{
  const asientos = await Asiento.find({}).lean();
  const INTERNOS = ['reservar-sale', 'reservar-entra', 'liberar-sale', 'liberar-entra', 'ejecutar-sale', 'ejecutar-entra'];
  const internos = new Map();
  const total = new Map();
  const frontera = new Map();
  for (const x of asientos) {
    const m = BigInt(x.monto);
    total.set(x.activo, (total.get(x.activo) ?? 0n) + m);
    if (INTERNOS.includes(x.tipo)) internos.set(x.activo, (internos.get(x.activo) ?? 0n) + m);
    else frontera.set(x.activo, (frontera.get(x.activo) ?? 0n) + m);
  }
  comprobar([...internos.values()].every((v) => v === 0n),
    'todo el circuito fiat suma CERO por activo: nada se creo ni se destruyo',
    JSON.stringify([...internos].map(([k, v]) => `${k}:${v}`)));
  comprobar([...total].every(([k, v]) => v === (frontera.get(k) ?? 0n)),
    'y el total del ledger sigue siendo exactamente lo que entro por la frontera');

  const cuentas = await Cuenta.find({ activo: 'ORIGEN' }).lean();
  const enCuentas = cuentas.reduce((s, c) => s + BigInt(c.disponible) + BigInt(c.reservado), 0n);
  comprobar(enCuentas === 1500n * U, 'los 1500 ORIGEN de semilla siguen siendo 1500, repartidos distinto',
    `enCuentas=${enCuentas}`);
}

await mongoose.disconnect();
await servidor.stop();

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
