// La frontera: por dónde entra y por dónde sale el dinero de verdad.
//
// ══ POR QUÉ ESTO NO ES UNA RUTA DE USUARIO ═════════════════════════════════
//
// Un depósito no lo declara quien deposita. Lo confirma quien VIO llegar el
// dinero: el corresponsal que recibió la transferencia, o el agente que contó
// los billetes. Una ruta donde el propio cliente dice «me llegaron mil» es una
// ruta donde cualquiera se acredita mil.
//
// Por eso estas rutas van detrás de X-Admin-Key, y la clave vive solo en el
// servidor de operaciones. Cuando haya integración directa con el
// corresponsal, el que llame aquí será el webhook firmado de ese banco y esta
// misma puerta seguirá sirviendo — cambia quién toca, no la puerta.
//
// ══ LO QUE FALTA, DICHO ════════════════════════════════════════════════════
//
// Hoy la confirmación es MANUAL: una persona de operaciones marca el depósito
// contra el extracto del corresponsal. Eso es lo que hay y así está escrito;
// no hay conciliación automática todavía, y fingir que la hay sería peor que
// no tenerla, porque nadie estaría revisando.
//
// ══ LO QUE ESTA FRONTERA TAMBIÉN VIGILA ════════════════════════════════════
//
// El barrido de solicitudes atascadas (lib/barrido.js) y la lista de
// sanciones (lib/sanciones.js) se manejan desde aquí. Las dos SOLO informan:
// ninguna ruta de este archivo resuelve una solicitud sola ni mueve un
// céntimo sin que una persona con clave lo pida con comprobante.

const { Usuario, Corresponsal, Solicitud, AlertaSancion } = require('../models');
const { aTexto } = require('../lib/monedas');
const { asentar, reconciliar } = require('../lib/asientos');
const { atascadas } = require('../lib/barrido');
const sanciones = require('../lib/sanciones');
const genesis = require('../lib/genesis');
const V = require('../lib/validar');
const { cuentaDe, pintar } = require('./cuentasController');
const { refDe } = require('./movimientosController');

/** Solo operaciones. Sin clave configurada NO entra nadie — nunca «si no hay
 *  clave, pasa». Comparación de longitud constante para no filtrar por tiempo
 *  cuántos caracteres acertó quien prueba. */
function soloOperaciones(req, res, next) {
  const esperada = (process.env.AUCORP_ADMIN_KEY || '').trim();
  if (!esperada) {
    console.error('[tesoreria] AUCORP_ADMIN_KEY no está puesta: la frontera queda cerrada');
    return res.status(503).json({ error: 'El servicio no está configurado.', codigo: 'SIN_CONFIGURAR' });
  }
  const dada = String(req.headers['x-admin-key'] || '');
  const { timingSafeEqual } = require('crypto');
  const a = Buffer.from(dada);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'No.', codigo: 'NO_AUTORIZADO' });
  }
  return next();
}

/** La cuenta de la casa donde está el dinero de esa plaza. Una por moneda:
 *  mezclar el corresponsal hondureño con el guatemalteco en una sola cuenta
 *  haría imposible saber cuánto hay REALMENTE en cada banco. */
const custodiaDe = (cod) => `banco.corresponsal.${cod.toLowerCase()}`;

const movimientoDeFrontera = (entra) => V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  const cod = V.moneda(b.moneda);
  const monto = V.monto(b.monto, cod);
  const gid = V.gid(b.gid);
  const ref = refDe(gid, b.ref);
  // El comprobante NO es opcional. Un asiento de frontera sin referencia al
  // extracto del banco es un asiento que en una auditoría no se puede seguir.
  const comprobante = V.texto(b.comprobante, { campo: 'comprobante', max: 200, etiqueta: 'el comprobante' });
  if (!comprobante) {
    return res.status(400).json({
      error: 'Falta el comprobante del corresponsal o del agente.', codigo: 'COMPROBANTE_FALTA', campo: 'comprobante',
    });
  }
  // Opcional: el aviso de depósito que este crédito atiende. Se marca como
  // acreditado DESPUÉS de que el asiento entró, y sólo si es del mismo gid y
  // la misma moneda — un id ajeno no cierra el aviso de otra persona.
  const solicitudId = entra && b.solicitud ? V.id(b.solicitud, { campo: 'solicitud', etiqueta: 'la solicitud' }) : null;

  try {
    const usuario = await Usuario.findOne({ gid });
    if (!usuario) return res.status(404).json({ error: 'No hay tal cuenta.', codigo: 'NO_EXISTE', campo: 'gid' });
    if (usuario.verificada !== true) {
      return res.status(403).json({
        error: 'Esa cuenta no está verificada.', codigo: 'IDENTIDAD_SIN_VERIFICAR',
      });
    }

    let aviso = null;
    if (solicitudId) {
      aviso = await Solicitud.findOne({ _id: solicitudId, gid, tipo: 'deposito', moneda: cod });
      if (!aviso) return res.status(400).json({ error: 'Ese aviso de depósito no es de esta cuenta o de esta moneda.', codigo: 'SOLICITUD_NO_COINCIDE', campo: 'solicitud' });
      if (aviso.estado !== 'avisada') return res.status(409).json({ error: 'Ese aviso ya está cerrado.', codigo: 'YA_RESUELTA', campo: 'solicitud' });
    }

    const banco = custodiaDe(cod);
    const lineas = entra
      ? [
        { cuenta: banco, tipo: 'activo', moneda: cod, debe: monto },
        { cuenta: cuentaDe(gid), tipo: 'pasivo', moneda: cod, haber: monto },
      ]
      : [
        { cuenta: cuentaDe(gid), tipo: 'pasivo', moneda: cod, debe: monto },
        { cuenta: banco, tipo: 'activo', moneda: cod, haber: monto },
      ];

    const { asiento, repetido } = await asentar({
      ref,
      glosa: `${entra ? 'Depósito' : 'Retiro'} ${cod} de ${gid} — ${comprobante}`,
      lineas,
    }, { clase: entra ? 'deposito' : 'retiro' });

    if (aviso) {
      const montoAvisado = aviso.monto;
      await Solicitud.updateOne({ _id: aviso._id, estado: 'avisada' }, { $set: {
        estado: 'acreditada', comprobante, resuelta: new Date(), actualizada: new Date(),
        // Si lo que llegó no es lo que avisó, queda escrito: el cliente lo ve.
        nota: montoAvisado === monto ? '' : `Se acreditó ${aTexto(monto, cod)} ${cod}; el aviso decía ${aTexto(montoAvisado, cod)}.`,
      } });
    }

    genesis.reportarMovimiento(gid, {
      id: asiento.ref, tipo: entra ? 'deposito_fiat' : 'retiro_fiat',
      moneda: cod, monto: aTexto(monto, cod), comprobante,
    });

    return res.json({ ref: asiento.ref, repetido, moneda: cod, monto: pintar(monto, cod), solicitud: aviso ? String(aviso._id) : null });
  } catch (e) {
    if (e?.codigo === 'SALDO_INSUFICIENTE') {
      return res.status(400).json({ error: 'No hay saldo suficiente.', codigo: 'SALDO_INSUFICIENTE' });
    }
    console.error(`[tesoreria] ${entra ? 'depósito' : 'retiro'}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo completar la operación.', codigo: 'NO_SE_PUDO' });
  }
});

// ── POST /tesoreria/deposito ────────────────────────────────────────────────
const deposito = movimientoDeFrontera(true);

// ── POST /tesoreria/retiro ──────────────────────────────────────────────────
const retiro = movimientoDeFrontera(false);

// ── GET /tesoreria/reconciliar ──────────────────────────────────────────────
// Compara el atajo contra el libro. Solo mira; para que ARREGLE hay que
// pedirlo con ?arreglar=1, porque una reparación silenciosa de la contabilidad
// es justo lo que nadie debería poder hacer sin decidirlo.
async function revisar(req, res) {
  try {
    const r = await reconciliar({ arreglar: req.query?.arreglar === '1' });
    return res.json(r);
  } catch (e) {
    console.error(`[tesoreria] no se pudo reconciliar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo reconciliar.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /tesoreria/corresponsal ────────────────────────────────────────────
// { moneda, banco, titular, numero, swift, ruta, instrucciones, activa }
//
// La cuenta REAL de AuCorp en cada plaza. Se carga aquí y no en el código:
// un número de cuenta bancaria en un commit es un número de cuenta publicado,
// y a diferencia de una clave, ese no se rota — hay que abrir otra cuenta en
// otro banco.
const corresponsalGuardar = V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  const cod = V.moneda(b.moneda);
  const datos = {
    banco: V.texto(b.banco, { campo: 'banco', max: 120, obligatorio: true, etiqueta: 'el banco' }),
    titular: V.texto(b.titular, { campo: 'titular', max: 120, obligatorio: true, etiqueta: 'el titular' }),
    numero: V.numeroCuenta(b.numero),
    swift: V.swift(b.swift),
    ruta: V.texto(b.ruta, { campo: 'ruta', max: 60, etiqueta: 'la ruta' }),
    instrucciones: V.texto(b.instrucciones, { campo: 'instrucciones', max: 500, etiqueta: 'las instrucciones' }),
    activa: b.activa !== false, actualizada: new Date(),
  };

  try {
    const c = await Corresponsal.findOneAndUpdate(
      { moneda: cod }, { $set: { moneda: cod, ...datos } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ corresponsal: { moneda: c.moneda, banco: c.banco, activa: c.activa } });
  } catch (e) {
    console.error(`[tesoreria] no se pudo guardar el corresponsal de ${cod}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo guardar.', codigo: 'NO_SE_PUDO' });
  }
});

// ── GET /tesoreria/corresponsales ───────────────────────────────────────────
async function corresponsalListar(req, res) {
  try {
    const docs = await Corresponsal.find({}).sort({ moneda: 1 });
    return res.json({ corresponsales: docs });
  } catch (e) {
    console.error(`[tesoreria] no se pudieron listar los corresponsales: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /tesoreria/nivel ───────────────────────────────────────────────────
// { gid, nivel, motivo } — sube o baja los límites de una cuenta.
//
// Es un acto de cumplimiento, no un ajuste técnico: subirle el nivel a alguien
// es decir que su expediente aguanta ese volumen. Por eso pide el motivo, que
// queda en el log aunque la cuenta después baje otra vez.
const nivelPoner = V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  const gid = V.gid(b.gid);
  const nivel = V.entero(b.nivel, { campo: 'nivel', min: 1, max: 3, etiqueta: 'el nivel' });
  const motivo = V.texto(b.motivo, { campo: 'motivo', max: 300, obligatorio: true, etiqueta: 'el motivo' });

  try {
    const u = await Usuario.findOneAndUpdate({ gid }, { $set: { nivel } }, { new: true });
    if (!u) return res.status(404).json({ error: 'No hay tal cuenta.', codigo: 'NO_EXISTE', campo: 'gid' });
    console.log(`[tesoreria] nivel de ${gid} → ${nivel}: ${motivo}`);
    return res.json({ gid: u.gid, nivel: u.nivel });
  } catch (e) {
    console.error(`[tesoreria] no se pudo cambiar el nivel de ${gid}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo guardar.', codigo: 'NO_SE_PUDO' });
  }
});

// ── GET /tesoreria/solicitudes/atascadas?horas=24 ───────────────────────────
// El barrido a pedido. SOLO enseña: quién lleva cuánto esperando y qué falta.
const solicitudesAtascadas = V.conEntrada(async (req, res) => {
  const horas = V.entero(req.query?.horas, { campo: 'horas', min: 1, max: 24 * 365, porDefecto: Number(process.env.AUCORP_BARRIDO_HORAS || 24), etiqueta: 'las horas' });
  try {
    return res.json(await atascadas({ horas }));
  } catch (e) {
    console.error(`[tesoreria] no se pudo correr el barrido: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo correr el barrido.', codigo: 'NO_SE_PUDO' });
  }
});

// ── GET /tesoreria/sanciones ────────────────────────────────────────────────
// El estado de la lista: cuántas fichas, de dónde, de cuándo, y si vencieron.
async function sancionesEstado(req, res) {
  try {
    const abiertas = await AlertaSancion.countDocuments({ estado: 'abierta' });
    return res.json({ listas: sanciones.estado(), alertasAbiertas: abiertas });
  } catch (e) {
    return res.json({ listas: sanciones.estado(), alertasAbiertas: null });
  }
}

// ── POST /tesoreria/sanciones/importar ──────────────────────────────────────
// Sin cuerpo: baja la lista oficial de la OFAC y la guarda. Con { texto,
// fuente, alt? }: importa una lista pegada (CSV de la OFAC o JSON propio).
const sancionesImportar = V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  try {
    if (b.texto) {
      const fuente = V.texto(b.fuente, { campo: 'fuente', max: 60, etiqueta: 'el nombre de la fuente' }) || 'propia';
      if (typeof b.texto !== 'string') return res.status(400).json({ error: 'La lista tiene que venir como texto.', codigo: 'TEXTO_INVALIDO', campo: 'texto' });
      const r = await sanciones.importarTexto(b.texto, fuente, typeof b.alt === 'string' ? b.alt : '');
      console.log(`[sanciones] lista importada a mano: ${r.fuente}`);
      return res.json({ ...r, listas: sanciones.estado() });
    }
    const r = await sanciones.importarDeOfac();
    console.log(`[sanciones] lista de la OFAC importada: ${r.fuente}, ${r.conAlias} con alias`);
    return res.json({ ...r, listas: sanciones.estado() });
  } catch (e) {
    if (e instanceof V.ErrorDeEntrada) throw e;
    console.error(`[sanciones] no se pudo importar: ${e.message}`);
    return res.status(503).json({ error: `No se pudo importar la lista: ${e.message}`, codigo: 'NO_SE_PUDO' });
  }
});

// ── GET /tesoreria/sanciones/alertas?estado=abierta ─────────────────────────
const sancionesAlertas = V.conEntrada(async (req, res) => {
  const estado = V.opcion(req.query?.estado, ['abierta', 'resuelta'], { campo: 'estado', porDefecto: 'abierta' });
  try {
    const docs = await AlertaSancion.find({ estado }).sort({ creada: -1 }).limit(200);
    return res.json({ alertas: docs.map((a) => ({
      id: String(a._id), gid: a.gid, contexto: a.contexto, nombre: a.nombre,
      detalle: a.detalle, estado: a.estado, nota: a.nota, creada: a.creada, resuelta: a.resuelta,
    })) });
  } catch (e) {
    console.error(`[sanciones] no se pudieron leer las alertas: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
});

// ── POST /tesoreria/sanciones/alertas/:id/resolver ──────────────────────────
// { nota } — una persona de cumplimiento la cierra con su motivo. Cerrarla NO
// aprueba el destino: el cliente tiene que volver a intentarlo, y si la lista
// sigue chocando, vuelve a quedar en revisión. Es a propósito.
const sancionesResolver = V.conEntrada(async (req, res) => {
  const id = V.id(req.params.id, { etiqueta: 'la alerta' });
  const nota = V.texto(V.cuerpo(req).nota, { campo: 'nota', max: 500, obligatorio: true, etiqueta: 'la nota de cumplimiento' });
  try {
    const a = await AlertaSancion.findOneAndUpdate({ _id: id, estado: 'abierta' },
      { $set: { estado: 'resuelta', nota, resuelta: new Date() } }, { new: true });
    if (!a) return res.status(409).json({ error: 'Esa alerta no está abierta.', codigo: 'YA_RESUELTA' });
    console.log(`[sanciones] alerta ${id} (${a.contexto} de ${a.gid}) resuelta: ${nota}`);
    return res.json({ alerta: { id: String(a._id), estado: a.estado, nota: a.nota } });
  } catch (e) {
    console.error(`[sanciones] no se pudo resolver la alerta: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo guardar.', codigo: 'NO_SE_PUDO' });
  }
});

module.exports = {
  soloOperaciones, deposito, retiro, revisar, custodiaDe,
  corresponsalGuardar, corresponsalListar, nivelPoner,
  solicitudesAtascadas, sancionesEstado, sancionesImportar, sancionesAlertas, sancionesResolver,
};
