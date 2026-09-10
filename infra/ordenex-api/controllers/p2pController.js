/* EL P2P POR API. La máquina de estados y el reloj viven en lib/p2p.js; esto
   es solo la puerta: quién habla, qué pide, y qué se le contesta.
   Que la AUTORIZACIÓN salga de la orden y no del cuerpo de la petición es lo
   que impide operar la orden de otro — el mismo criterio de fiatController. */
const p2p = require('../lib/p2p');
const { Anuncio } = require('../models');

const yo = (req) => String(req.usuario?.userId || req.usuario?.id || '');

/* Lo que se le enseña a cada punta. El reloj va en SEGUNDOS y calculado en el
   servidor: si la pantalla restara de una fecha con la hora del teléfono mal
   puesta, el cronómetro mentiría justo cuando más importa. */
function aJson(o, quien) {
  const soy = String(quien) === String(o.pagadorId) ? 'pagador'
    : String(quien) === String(o.entregadorId) ? 'entregador' : null;
  return {
    id: String(o._id), numero: o.numero, estado: o.estado, papel: soy,
    activo: o.activo, cantidad: o.cantidad, moneda: o.moneda,
    montoFiat: o.montoFiat, precio: o.precio,
    segundosQueQuedan: p2p.segundosQueQuedan(o),
    congeladoEn: o.congeladoEn ?? null, apelableEn: o.apelableEn ?? null,
    referenciaPago: o.referenciaPago ?? null,
    /* Qué se puede hacer AHORA, decidido en el servidor. Si la pantalla lo
       dedujera sola, el día que cambie una regla habría dos verdades y la de
       la pantalla sería la que la persona toca. */
    puede: {
      pagar: soy === 'pagador' && o.estado === 'creada',
      liberar: soy === 'entregador' && o.estado === 'pagada',
      cancelar: soy === 'pagador' && o.estado === 'creada',
    },
    historia: (o.historia || []).map((h) => ({ de: h.de ?? null, a: h.a ?? null, quien: h.quien, en: h.en, nota: h.nota ?? null })),
    en: o.createdAt ?? null,
  };
}

const responder = (res, e) => res.status(e.status || 500).json({ error: e.message, codigo: e.codigo || null });

async function anuncios(req, res) {
  try {
    const q = { estado: 'publicado' };
    if (req.query.lado) q.lado = String(req.query.lado);
    if (req.query.moneda) q.moneda = String(req.query.moneda).toUpperCase();
    const l = await Anuncio.find(q).sort({ precio: 1 }).limit(50).lean();
    /* Sin datos de banco y sin quién es el comerciante: eso se revela solo a
       la contraparte de una orden con la garantía ya puesta. */
    res.json(l.map((a) => ({
      id: String(a._id), lado: a.lado, activo: a.activo, moneda: a.moneda, precio: a.precio,
      disponible: a.cantidadRestante, minFiat: a.minFiat, maxFiat: a.maxFiat,
      minutosParaPagar: a.minutosParaPagar, terminos: a.terminos || '',
    })));
  } catch (e) { responder(res, e); }
}

async function crearOrden(req, res) {
  try {
    const o = await p2p.tomar({
      anuncioId: String(req.body?.anuncioId || ''), tomadorId: yo(req),
      cantidad: req.body?.cantidad ?? null, montoFiat: req.body?.montoFiat ?? null,
      ordenKey: req.body?.ordenKey ?? null,
    });
    res.status(201).json(aJson(o, yo(req)));
  } catch (e) { responder(res, e); }
}

async function misOrdenes(req, res) {
  try {
    const { P2POrden } = require('../models');
    const mias = String(yo(req));
    const l = await P2POrden.find({ $or: [{ pagadorId: mias }, { entregadorId: mias }] })
      .sort({ createdAt: -1 }).limit(40).lean();
    /* Se vencen al leerlas: una lista que enseña «te quedan 3 minutos» sobre
       una orden ya muerta es peor que no enseñar nada. */
    const vivas = [];
    for (const o of l) vivas.push((await p2p.vencerSiTocaba(o)) || o);
    res.json(vivas.map((o) => aJson(o, mias)));
  } catch (e) { responder(res, e); }
}

async function unaOrden(req, res) {
  try {
    const o = await p2p.leer(req.params.id);
    if (!o) return res.status(404).json({ error: 'Esa orden no existe.', codigo: 'NO_EXISTE' });
    const mias = yo(req);
    if (String(o.pagadorId) !== mias && String(o.entregadorId) !== mias) {
      return res.status(403).json({ error: 'Esa orden no es tuya.', codigo: 'NO_ES_SUYO' });
    }
    res.json(aJson(o, mias));
  } catch (e) { responder(res, e); }
}

const pagado = async (req, res) => {
  try { res.json(aJson(await p2p.marcarPagado({ id: req.params.id, quien: yo(req), referencia: req.body?.referencia ?? null }), yo(req))); }
  catch (e) { responder(res, e); }
};
const liberar = async (req, res) => {
  try { res.json(aJson(await p2p.liberar({ id: req.params.id, quien: yo(req) }), yo(req))); }
  catch (e) { responder(res, e); }
};
const cancelar = async (req, res) => {
  try { res.json(aJson(await p2p.cancelar({ id: req.params.id, quien: yo(req), nota: req.body?.nota ?? null }), yo(req))); }
  catch (e) { responder(res, e); }
};

module.exports = { anuncios, crearOrden, misOrdenes, unaOrden, pagado, liberar, cancelar, _adentro: { aJson } };
