// El barrido de solicitudes atascadas. SOLO AVISA.
//
// ══ QUÉ ES «ATASCADA» ══════════════════════════════════════════════════════
//
// Una solicitud que lleva más de N horas sin cambiar de estado y que todavía
// no terminó: un retiro `pendiente` que nadie pagó ni rechazó, uno en
// `ejecutando` o `rechazando` que se quedó a medias (el asiento entró pero el
// proceso murió antes de cerrarla), o un depósito `avisado` que nadie buscó en
// el extracto del banco.
//
// ══ POR QUÉ NO LAS RESUELVE ════════════════════════════════════════════════
//
// Porque cada una de esas es dinero de alguien y cada final cambia un saldo.
// Un proceso que «arregla» solicitudes viejas de madrugada es exactamente el
// proceso que un día paga dos veces o devuelve lo que ya se pagó. Aquí se
// mira, se cuenta, se dice quién lleva cuánto esperando y qué le falta — y
// una persona decide por /tesoreria/solicitudes/:id/ejecutar o /rechazar.
//
// Corre de dos formas: a pedido (`GET /tesoreria/solicitudes/atascadas`) y
// cada tanto por sí solo, escribiendo en el log. El log es lo que Heroku
// guarda y lo que se puede vigilar sin abrir nada.

const { Solicitud } = require('../models');
const { aTexto } = require('./monedas');

const HORA_MS = 60 * 60 * 1000;

/** Los estados que todavía esperan a alguien. */
const ABIERTOS = ['pendiente', 'ejecutando', 'rechazando', 'avisada'];

/** Qué le falta a una solicitud para terminar, dicho para una persona. Es lo
 *  que ve el cliente en su pantalla y lo que ve operaciones en el barrido. */
function queFalta(s) {
  switch (s.estado) {
    case 'pendiente': return 'Operaciones tiene que pagar el retiro contra el banco y cargar el comprobante, o rechazarlo con motivo.';
    case 'ejecutando': return 'El pago quedó a medias: el dinero ya salió de «en proceso» pero la solicitud no se cerró. Operaciones tiene que comprobarlo contra el banco antes de tocar nada.';
    case 'rechazando': return 'La devolución quedó a medias: hay que comprobar en el libro si el asiento de devolución entró antes de repetir nada.';
    case 'avisada': return 'Operaciones tiene que encontrar la transferencia en el extracto del banco y acreditarla por /tesoreria/deposito con su comprobante, o rechazar el aviso con motivo.';
    case 'ejecutada': return '';
    case 'acreditada': return '';
    case 'rechazada': return '';
    default: return 'Estado desconocido: hay que mirarla a mano.';
  }
}

const horasDesde = (fecha, ahora) => Math.floor((ahora.getTime() - new Date(fecha).getTime()) / HORA_MS);

/**
 * Las solicitudes abiertas con más de `horas` sin cambio.
 * Devuelve { horas, revisadas, atascadas: [...], porEstado } — nada más.
 */
async function atascadas({ horas = 24, ahora = new Date() } = {}) {
  const pedidas = Number(horas);
  const h = Math.max(1, Math.min(24 * 365, Number.isFinite(pedidas) ? pedidas : 24));
  const corte = new Date(ahora.getTime() - h * HORA_MS);
  const abiertas = await Solicitud.find({ estado: { $in: ABIERTOS } }).sort({ actualizada: 1 }).limit(1000);
  const viejas = abiertas.filter((s) => new Date(s.actualizada || s.creada) <= corte);

  const porEstado = {};
  for (const s of viejas) porEstado[s.estado] = (porEstado[s.estado] || 0) + 1;

  return {
    horas: h,
    revisadas: abiertas.length,
    atascadas: viejas.map((s) => ({
      id: String(s._id), ref: s.ref, gid: s.gid, tipo: s.tipo, estado: s.estado,
      moneda: s.moneda, neto: aTexto(s.neto, s.moneda),
      creada: s.creada, actualizada: s.actualizada || s.creada,
      horasSinCambio: horasDesde(s.actualizada || s.creada, ahora),
      queFalta: queFalta(s),
    })),
    porEstado,
    cuando: ahora.toISOString(),
  };
}

/**
 * El vigía: cada `cadaMinutos` corre el barrido y lo canta en el log. El
 * temporizador va con unref() para no impedir que el proceso termine (las
 * pruebas lo agradecen). Devuelve una función para pararlo.
 */
function vigilar({ horas, cadaMinutos } = {}) {
  const h = Number(horas || process.env.AUCORP_BARRIDO_HORAS || 24);
  const cada = Math.max(5, Number(cadaMinutos || process.env.AUCORP_BARRIDO_CADA_MIN || 60));
  const vuelta = async () => {
    try {
      const r = await atascadas({ horas: h });
      if (!r.atascadas.length) {
        console.log(`[barrido] ${r.revisadas} solicitud(es) abierta(s), ninguna con más de ${h} h sin cambio`);
        return;
      }
      console.error(`[barrido] ATENCIÓN: ${r.atascadas.length} solicitud(es) llevan más de ${h} h sin cambio (${JSON.stringify(r.porEstado)}). No se resuelven solas: alguien tiene que mirarlas.`);
      for (const s of r.atascadas) {
        console.error(`[barrido]   ${s.tipo} ${s.estado} ${s.neto} ${s.moneda} de ${s.gid} · ${s.horasSinCambio} h · ${s.ref}`);
      }
    } catch (e) {
      console.error(`[barrido] no se pudo correr: ${e.message}`);
    }
  };
  const reloj = setInterval(vuelta, cada * 60 * 1000);
  if (typeof reloj.unref === 'function') reloj.unref();
  return () => clearInterval(reloj);
}

module.exports = { atascadas, vigilar, queFalta, ABIERTOS };
