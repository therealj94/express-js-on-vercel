// El circuito fiat: agentes que venden y compran su propio ORIGEN por
// lempiras o dolares, con la casa de arbitro y JAMAS de contraparte.
//
// El principio 1 del contrato gobierna todo este archivo: la casa no toca
// fiat. Lo unico que custodia es el ORIGEN en garantia, dentro de su propio
// ledger, y lo unico que administra es la maquina de estados:
//
//   abierta → tomada → fiat-avisado → liquidada
//      │         │          │
//      │         │          └→ disputa → (admin) liquidada | cancelada
//      └─────────┴──────────→ cancelada
//
// TRES DECISIONES QUE CONVIENE ENTENDER ANTES DE TOCAR NADA:
//
// 1. La garantia se reserva AL ABRIR, no al tomar. Esta en el contrato y es
//    deliberado: en una entrada el usuario va a mandar lempiras REALES a la
//    cuenta bancaria de un agente, y solo lo hace tranquilo si el ORIGEN que
//    va a recibir ya esta apartado en el ledger — apartado de verdad, no
//    prometido. El costo es que abrir una solicitud congela plata del agente
//    antes de que diga que si; por eso el agente tambien puede cancelarla, y
//    por eso una solicitud contra un agente sin saldo libre ni siquiera nace.
//
// 2. El cambio de estado es el CERROJO. Toda transicion es un
//    findOneAndUpdate con el estado previo exacto en la guarda: de dos
//    confirmaciones simultaneas una gana el cerrojo y la otra encuentra la
//    solicitud ya liquidada — y recibe la MISMA respuesta buena, porque un
//    doble clic o un reintento por timeout no son un delito. El dinero se
//    mueve DESPUES de ganar el cerrojo; si el ledger falla, el estado se
//    revierte con su propia fila en historia firmada por `casa`. Ganar el
//    cerrojo primero es lo que hace imposible pagar dos veces la misma
//    garantia aunque el dueño tenga otras reservas del mismo activo.
//
// 3. Cada transicion escribe historia [{de, a, quien, en, nota}]. No es un
//    log de cortesia: es la UNICA evidencia que tiene el admin para arbitrar
//    una disputa entre dos personas que se acusan mutuamente, y por eso lleva
//    el estado de origen y el de destino — un "quedo en disputa" sin saber
//    desde donde no cuenta la mitad que importa.

const mongoose = require('mongoose');
const { Usuario, Agente, Solicitud } = require('../models');
const ledger = require('../lib/ledger');

const MONEDAS = ['HNL', 'USD'];
const ESTADOS = ['abierta', 'tomada', 'fiat-avisado', 'liquidada', 'cancelada', 'disputa'];

// lib/genesis.js se carga PEREZOSO, igual que en el resto de la casa: si el
// modulo falta o truena al cargar, se cae SOLO el reporte AML (que se anota y
// no bloquea) y no el circuito entero al montar las rutas.
function genesisPerezoso() {
  try {
    return require('../lib/genesis');
  } catch (e) {
    return null;
  }
}

// ── El tope por solicitud ───────────────────────────────────────────────────
// La regla del ecosistema: lo que una persona puede mover depende de la
// diligencia de su perfil en Genesis (`umbralDiligenciaUsd`). Ese dato hoy NO
// viaja en el perfilPublico del SSO, asi que se busca en el documento crudo
// del usuario — si el authController lo guardo alguna vez, se usa; si no hay
// dato, la casa asume el perfil MENOS habilitado: 1.000 USD por solicitud,
// el orden de los umbrales de diligencia simplificada. Conservador y
// deliberado — un tope inventado hacia arriba seria operar por encima de lo
// que la diligencia del cliente permite, y eso no se hace por un dato que
// falta.
const TOPE_USD_SIN_DATO = 1000;

// Lempiras por dolar, A PROPOSITO por debajo del cambio real (~24,7 en 2026):
// dividir entre menos hace que un monto en lempiras "parezca" MAS dolares y
// el tope muerda antes. En un tope, el error correcto es el que corta de mas,
// nunca el que deja pasar de mas.
const HNL_POR_USD = 20n;

function topeUsdDe(usuario) {
  const u = usuario ? usuario.umbralDiligenciaUsd : null;
  if (typeof u === 'number' && Number.isFinite(u) && u > 0) return Math.floor(u);
  return TOPE_USD_SIN_DATO;
}

// El fiat va en CENTAVOS, como string entero: '250000' son 2500,00 HNL. Los
// enteros de dinero de esta casa son strings operados con BigInt — el wei
// para la cadena, el centavo para el fiat: meter un float con decimales en el
// mismo circuito seria sentar al redondeo a la mesa.
function montoFiatValido(v) {
  if (typeof v !== 'string' || !/^[0-9]{1,15}$/.test(v)) return false;
  try {
    return BigInt(v) > 0n;
  } catch {
    return false;
  }
}

function usdCentavosDe(montoFiat, moneda) {
  const m = BigInt(montoFiat);
  return moneda === 'USD' ? m : m / HNL_POR_USD;
}

// Un monto de wei valido, el mismo criterio del resto de la casa.
function montoValido(v) {
  if (typeof v !== 'string' || !/^[0-9]{1,78}$/.test(v)) return false;
  try {
    return BigInt(v) > 0n;
  } catch {
    return false;
  }
}

// Una nota es opcional y de cortesia: si no vino como texto, no vino.
function notaDe(cuerpo) {
  const n = cuerpo && typeof cuerpo.nota === 'string' ? cuerpo.nota.trim() : '';
  return n ? n.slice(0, 300) : null;
}

// ── Las dos puntas ──────────────────────────────────────────────────────────
// Quien paga el fiat y quien lo recibe dependen del tipo, y TODO el circuito
// cuelga de esta tabla: en una `entrada` el usuario compra ORIGEN (paga fiat
// al banco del agente); en una `salida` lo vende (el agente le paga a el).
// La garantia de ORIGEN siempre la pone quien lo esta vendiendo.
function pagadorFiat(tipo) {
  return tipo === 'entrada' ? 'usuario' : 'agente';
}
function receptorFiat(tipo) {
  return tipo === 'entrada' ? 'agente' : 'usuario';
}
function duenoGarantia(solicitud, agente) {
  return solicitud.tipo === 'entrada' ? agente.userId : solicitud.userId;
}
function beneficiario(solicitud, agente) {
  return solicitud.tipo === 'entrada' ? solicitud.userId : agente.userId;
}

// ── La transicion atomica: el cerrojo ───────────────────────────────────────
// El estado previo EXACTO va en la guarda; si otro gano la carrera, el update
// no encuentra nada y devuelve null. La fila de historia entra en el mismo
// golpe que el estado: no existe la ventana en la que la solicitud diga una
// cosa y su historia otra.
async function transitar(id, de, a, quien, { nota = null, extra = null } = {}) {
  return Solicitud.findOneAndUpdate(
    { _id: id, estado: de },
    {
      $set: { estado: a, ...(extra || {}) },
      $push: { historia: { de, a, quien, en: new Date(), nota } },
    },
    { new: true }
  );
}

// El reverso de un cerrojo ganado cuyo dinero no se pudo mover. Firma `casa`
// y cuenta el porque: en una disputa futura, ese porque es evidencia. Si ni
// el reverso entra, se canta CRITICO — la solicitud queda diciendo un estado
// cuyo dinero no se movio, y eso lo arregla un humano con los asientos.
async function revertir(id, desde, hacia, porQue) {
  try {
    const s = await transitar(id, desde, hacia, 'casa', { nota: porQue });
    if (!s) {
      console.error(`[fiat] CRITICO: la solicitud ${id} quedo en '${desde}' sin su dinero movido y el reverso no la encontro`);
    }
  } catch (e) {
    console.error(`[fiat] CRITICO: la solicitud ${id} quedo en '${desde}' sin su dinero movido y el reverso fallo: ${e.message}`);
  }
}

// ── El AML de cada liquidacion ──────────────────────────────────────────────
// Regla heredada del ecosistema: cada operacion fiat consumada se reporta a
// Genesis. En silencio y SIN bloquear — la respuesta al usuario jamas carga
// el resultado del reporte (a nadie se le avisa si salto una alerta), y un
// fallo del reportero no deshace una liquidacion que ya movio el dinero. El
// movimiento se reporta sobre el gid del USUARIO: el es el cliente
// monitoreado; el agente es la contraparte.
async function reportarAml(solicitud, extra = {}) {
  try {
    const genesis = genesisPerezoso();
    if (!genesis || typeof genesis.reportarMovimiento !== 'function') {
      console.error('[fiat] lib/genesis.js no expone reportarMovimiento: AML sin reportar');
      return;
    }
    const usuario = await Usuario.findById(solicitud.userId).lean();
    await genesis.reportarMovimiento(usuario ? usuario.gid : null, {
      tipo: `fiat-${solicitud.tipo}`,
      activo: solicitud.activo,
      cantidad: solicitud.cantidad,
      moneda: solicitud.moneda,
      montoFiat: solicitud.montoFiat,
      ...extra,
      en: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`[fiat] AML de ${solicitud._id} no se pudo reportar: ${e.message}`);
  }
}

// ── La forma publica de una solicitud ───────────────────────────────────────
// `rol` dice desde que punta la esta mirando quien pregunta. Los bancos
// completos del agente SOLO se pegan cuando (a) mira el dueño, (b) es una
// entrada — el va a transferir a ese banco — y (c) el agente ya la tomo: un
// numero de cuenta antes del si del agente seria repartir cuentas bancarias
// a cambio de nada, que es exactamente lo que GET /fiat/agentes promete no
// hacer. Se prefiere el banco que el usuario eligio; si no eligio (o el
// agente ya no lo lista), van todos — peor seria dejarlo sin donde pagar.
function aJson(s, agente, rol) {
  const json = {
    id: String(s._id),
    tipo: s.tipo,
    activo: s.activo,
    cantidad: s.cantidad,
    moneda: s.moneda,
    montoFiat: s.montoFiat,
    banco: s.banco ?? null,
    referencia: s.referencia ?? null,
    estado: s.estado,
    rol: rol ?? null,
    agente: agente ? { id: String(agente._id), nombre: agente.nombre } : null,
    historia: (s.historia || []).map((h) => ({
      de: h.de ?? null,
      a: h.a ?? null,
      quien: h.quien,
      en: h.en,
      nota: h.nota ?? null,
    })),
    en: s.createdAt ?? null,
  };

  const revelable = ['tomada', 'fiat-avisado', 'disputa'].includes(s.estado);
  if (rol === 'usuario' && s.tipo === 'entrada' && agente && revelable) {
    const elegidos = s.banco ? (agente.bancos || []).filter((b) => b.banco === s.banco) : [];
    json.bancosAgente = (elegidos.length ? elegidos : agente.bancos || []).map((b) => ({
      banco: b.banco,
      cuenta: b.cuenta,
      titular: b.titular,
    }));
  }
  return json;
}

// Carga solicitud + agente y decide desde que punta habla la sesion. Si algo
// no cuadra, responde y devuelve null — el handler solo sigue con una punta
// legitima entre las manos. Que la autorizacion salga de aqui y no del cuerpo
// de la peticion es lo que impide operar la solicitud de otro.
async function cargar(req, res) {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: 'No hay ninguna solicitud con ese id.', codigo: 'SOLICITUD_NO_EXISTE' });
    return null;
  }
  const solicitud = await Solicitud.findById(id);
  if (!solicitud) {
    res.status(404).json({ error: 'No hay ninguna solicitud con ese id.', codigo: 'SOLICITUD_NO_EXISTE' });
    return null;
  }
  const agente = await Agente.findById(solicitud.agenteId);
  if (!agente) {
    // Sin agente no se sabe de quien es la garantia ni quien confirma:
    // fail-closed y que lo mire el admin.
    res.status(409).json({ error: 'El agente de esa solicitud no existe.', codigo: 'AGENTE_NO_EXISTE' });
    return null;
  }
  const punta =
    solicitud.userId === req.usuario.id ? 'usuario'
    : agente.userId === req.usuario.id ? 'agente'
    : null;
  if (!punta) {
    res.status(403).json({ error: 'Esa solicitud no es tuya.', codigo: 'NO_TE_TOCA' });
    return null;
  }
  return { solicitud, agente, punta };
}

function estadoNoEs(res, solicitud, esperado) {
  return res.status(409).json({
    error: `La solicitud esta '${solicitud.estado}' y esto exige '${esperado}'.`,
    codigo: 'ESTADO_INVALIDO',
  });
}

// ── GET /fiat/agentes?moneda=HNL ────────────────────────────────────────────
// Publico a proposito: quien todavia no tiene cuenta necesita ver que SI hay
// agentes antes de molestarse en entrar. De los bancos sale SOLO el nombre —
// ni cuenta ni titular: los numeros completos se revelan al dueño de una
// solicitud tomada, y en ningun otro sitio.
async function agentes(req, res) {
  const moneda = req.query.moneda;
  if (moneda != null && !MONEDAS.includes(moneda)) {
    return res.status(400).json({ error: 'La moneda tiene que ser HNL o USD.', codigo: 'MONEDA_INVALIDA' });
  }
  try {
    const lista = await Agente.find({ activo: true, ...(moneda ? { monedas: moneda } : {}) }).lean();
    return res.json(
      lista.map((a) => ({
        id: String(a._id),
        nombre: a.nombre,
        monedas: a.monedas,
        bancos: (a.bancos || []).map((b) => b.banco),
      }))
    );
  } catch (e) {
    console.error(`[fiat] agentes: ${e.message}`);
    return res.status(503).json({ error: 'No se pudieron traer los agentes.', codigo: 'NO_SE_PUDO_LEER' });
  }
}

// ── POST /fiat/solicitudes ──────────────────────────────────────────────────
// { tipo, agenteId, cantidad, moneda, montoFiat, banco? }
//
// Todas las validaciones ANTES de tocar un wei; la reserva de la garantia es
// lo ultimo que se hace antes de crear el documento, y si el documento no se
// pudo crear, la reserva se devuelve. El precio lo pactan las partes —
// cantidad y montoFiat vienen dados y la casa no opina (la referencia se
// enseña al lado, rotulada, pero eso es asunto de la web).
async function crearSolicitud(req, res) {
  const userId = req.usuario.id;
  const c = req.body || {};

  if (c.tipo !== 'entrada' && c.tipo !== 'salida') {
    return res.status(400).json({ error: 'tipo tiene que ser "entrada" o "salida".', codigo: 'TIPO_INVALIDO' });
  }
  if (c.activo != null && c.activo !== 'ORIGEN') {
    // v1 del contrato: el circuito fiat mueve SOLO ORIGEN.
    return res.status(400).json({ error: 'El circuito fiat solo mueve ORIGEN.', codigo: 'ACTIVO_INVALIDO' });
  }
  if (!montoValido(c.cantidad)) {
    return res.status(400).json({ error: 'La cantidad tiene que ser un entero de wei positivo, como string.', codigo: 'CANTIDAD_INVALIDA' });
  }
  if (!MONEDAS.includes(c.moneda)) {
    return res.status(400).json({ error: 'La moneda tiene que ser HNL o USD.', codigo: 'MONEDA_INVALIDA' });
  }
  if (!montoFiatValido(c.montoFiat)) {
    return res.status(400).json({ error: 'montoFiat va en centavos: un entero positivo, como string.', codigo: 'MONTO_FIAT_INVALIDO' });
  }
  let banco = typeof c.banco === 'string' ? c.banco.trim().slice(0, 200) : '';
  if (c.tipo === 'salida' && !banco) {
    // En una salida el banco es el TUYO: sin saber donde pagarte, el agente
    // no puede pagarte.
    return res.status(400).json({ error: 'En una salida hay que decir banco, cuenta y titular donde el agente te paga.', codigo: 'BANCO_INVALIDO' });
  }
  if (!mongoose.isValidObjectId(c.agenteId)) {
    return res.status(404).json({ error: 'No hay ningun agente activo con ese id.', codigo: 'AGENTE_NO_EXISTE' });
  }

  try {
    const agente = await Agente.findById(c.agenteId).lean();
    if (!agente || !agente.activo) {
      return res.status(404).json({ error: 'No hay ningun agente activo con ese id.', codigo: 'AGENTE_NO_EXISTE' });
    }
    if (!(agente.monedas || []).includes(c.moneda)) {
      return res.status(400).json({ error: 'Ese agente no opera esa moneda.', codigo: 'MONEDA_NO_OFRECIDA' });
    }
    if (c.tipo === 'entrada' && banco && !(agente.bancos || []).some((b) => b.banco === banco)) {
      return res.status(400).json({ error: 'Ese agente no tiene cuenta en ese banco.', codigo: 'BANCO_INVALIDO' });
    }
    if (agente.userId === userId) {
      // Las dos puntas no pueden ser la misma persona: ni tiene sentido ni
      // el ledger lo permite (ejecutar una reserva contra uno mismo es
      // liberar, no liquidar) — y de paso, un agente pintando volumen fiat
      // consigo mismo no es un cliente sino un problema.
      return res.status(400).json({ error: 'No podes abrir una solicitud contra vos mismo.', codigo: 'PUNTA_UNICA' });
    }

    // Ambas puntas con Genesis verificada — regla del contrato. La del agente
    // tambien se comprueba en cada solicitud, no solo en el alta: si a un
    // agente le tumbaron la verificacion ayer, hoy no opera. Fail-closed.
    const [yo, usuarioAgente] = await Promise.all([
      Usuario.findById(userId).lean(),
      Usuario.findById(agente.userId).lean(),
    ]);
    if (!yo || yo.verificada !== true) {
      return res.status(403).json({ error: 'Operar fiat exige la identidad verificada en Genesis.', codigo: 'NO_VERIFICADA' });
    }
    if (!usuarioAgente || usuarioAgente.verificada !== true) {
      return res.status(409).json({ error: 'Ese agente no puede operar ahora.', codigo: 'AGENTE_NO_VERIFICADO' });
    }

    // El tope por diligencia, sobre el monto fiat pasado a dolares.
    const tope = topeUsdDe(yo);
    if (usdCentavosDe(c.montoFiat, c.moneda) > BigInt(tope) * 100n) {
      return res.status(403).json({
        error: `Esa solicitud pasa del tope de ${tope} USD que permite tu perfil.`,
        codigo: 'TOPE_EXCEDIDO',
      });
    }

    // La garantia: el ORIGEN de quien lo vende queda reservado en el ledger.
    // El _id se genera antes para que la ref del asiento y el documento
    // nazcan atados — un asiento sin solicitud detras no se puede auditar.
    const id = new mongoose.Types.ObjectId();
    const ref = `fiat:${id}`;
    const dueno = c.tipo === 'entrada' ? agente.userId : userId;
    try {
      await ledger.reservar(dueno, 'ORIGEN', c.cantidad, ref);
    } catch (e) {
      if (e.codigo === 'SALDO_INSUFICIENTE' && c.tipo === 'entrada') {
        // El mensaje del ledger habla del "disponible" a secas y aqui el
        // saldo corto es el del AGENTE: se dice con nombre para que el
        // usuario no revise su propia cuenta buscando un hueco que no tiene.
        return res.status(409).json({ error: 'El agente no tiene suficiente ORIGEN libre para garantizar esa entrada.', codigo: 'GARANTIA_NO_ALCANZA' });
      }
      throw e;
    }

    let solicitud;
    try {
      solicitud = await Solicitud.create({
        _id: id,
        tipo: c.tipo,
        userId,
        agenteId: String(agente._id),
        activo: 'ORIGEN',
        cantidad: c.cantidad,
        moneda: c.moneda,
        montoFiat: c.montoFiat,
        banco: banco || null,
        historia: [{ de: null, a: 'abierta', quien: `usuario:${userId}`, en: new Date(), nota: null }],
      });
    } catch (e) {
      // La solicitud no nacio: la garantia vuelve. Si ni eso se pudo, CRITICO
      // con la ref — hay una reserva sin solicitud y la arregla un humano.
      try {
        await ledger.liberar(dueno, 'ORIGEN', c.cantidad, ref);
      } catch (e2) {
        console.error(`[fiat] CRITICO: quedo una reserva de ${c.cantidad} wei sin solicitud (ref ${ref}): ${e2.message}`);
      }
      throw e;
    }

    return res.status(201).json({ solicitud: aJson(solicitud, agente, 'usuario') });
  } catch (e) {
    if (e.codigo) {
      return res.status(e.status || 409).json({ error: e.message, codigo: e.codigo });
    }
    console.error(`[fiat] crear solicitud fallo: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo abrir la solicitud.', codigo: 'NO_SE_PUDO' });
  }
}

// ── GET /fiat/solicitudes?estado= ───────────────────────────────────────────
// Lo mio desde las dos puntas: lo que abri como usuario y lo que me llego
// como agente, lo mas nuevo primero. `rol` en cada fila dice desde cual punta
// se esta mirando — es lo que la web usa para pintar "te toca a vos" o "le
// toca al otro".
async function listarSolicitudes(req, res) {
  const userId = req.usuario.id;
  const estado = req.query.estado;
  if (estado != null && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: 'Ese estado no existe.', codigo: 'ESTADO_INVALIDO' });
  }
  try {
    const propio = await Agente.findOne({ userId }).lean();
    const puntas = [{ userId }];
    if (propio) puntas.push({ agenteId: String(propio._id) });

    const solicitudes = await Solicitud.find({ $or: puntas, ...(estado ? { estado } : {}) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const ids = [...new Set(solicitudes.map((s) => s.agenteId))].filter((x) => mongoose.isValidObjectId(x));
    const listaAgentes = await Agente.find({ _id: { $in: ids } }).lean();
    const porId = new Map(listaAgentes.map((a) => [String(a._id), a]));

    return res.json(
      solicitudes.map((s) => aJson(s, porId.get(s.agenteId) || null, s.userId === userId ? 'usuario' : 'agente'))
    );
  } catch (e) {
    console.error(`[fiat] listar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudieron traer las solicitudes.', codigo: 'NO_SE_PUDO_LEER' });
  }
}

// ── POST /fiat/solicitudes/:id/tomar ────────────────────────────────────────
// Solo el agente DESTINATARIO: tomar es decir "acepto el trato y mi garantia
// (o mi pago) va en serio". Un agente de baja no toma nada nuevo, aunque si
// puede terminar lo que ya tenia entre manos — su dinero sigue en juego.
async function tomar(req, res) {
  try {
    const cargado = await cargar(req, res);
    if (!cargado) return;
    const { solicitud, agente, punta } = cargado;

    if (punta !== 'agente') {
      return res.status(403).json({ error: 'Solo el agente destinatario puede tomarla.', codigo: 'NO_TE_TOCA' });
    }
    if (!agente.activo) {
      return res.status(409).json({ error: 'Ese agente esta de baja.', codigo: 'AGENTE_INACTIVO' });
    }
    if (solicitud.estado !== 'abierta') return estadoNoEs(res, solicitud, 'abierta');

    const s2 = await transitar(solicitud._id, 'abierta', 'tomada', `agente:${req.usuario.id}`);
    if (!s2) {
      const s3 = await Solicitud.findById(solicitud._id);
      return estadoNoEs(res, s3 || solicitud, 'abierta');
    }
    return res.json({ solicitud: aJson(s2, agente, punta) });
  } catch (e) {
    console.error(`[fiat] tomar ${req.params.id}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo tomar la solicitud.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /fiat/solicitudes/:id/avisar ───────────────────────────────────────
// { referencia }
//
// Quien PAGA el fiat anota la referencia de su transferencia bancaria: en una
// entrada el usuario, en una salida el agente. La referencia es la mitad de
// la prueba en una disputa (la otra mitad es el extracto del banco), y por
// eso se exige — un "ya te pague" sin numero no compromete a nada.
async function avisar(req, res) {
  try {
    const cargado = await cargar(req, res);
    if (!cargado) return;
    const { solicitud, agente, punta } = cargado;

    if (punta !== pagadorFiat(solicitud.tipo)) {
      return res.status(403).json({ error: 'Avisa quien paga el fiat: en una entrada el usuario, en una salida el agente.', codigo: 'NO_TE_TOCA' });
    }
    const referencia = typeof (req.body || {}).referencia === 'string' ? req.body.referencia.trim() : '';
    if (!referencia || referencia.length > 140) {
      return res.status(400).json({ error: 'Falta la referencia bancaria (hasta 140 caracteres).', codigo: 'REFERENCIA_INVALIDA' });
    }
    if (solicitud.estado !== 'tomada') return estadoNoEs(res, solicitud, 'tomada');

    const s2 = await transitar(solicitud._id, 'tomada', 'fiat-avisado', `${punta}:${req.usuario.id}`, {
      extra: { referencia },
    });
    if (!s2) {
      const s3 = await Solicitud.findById(solicitud._id);
      return estadoNoEs(res, s3 || solicitud, 'tomada');
    }
    return res.json({ solicitud: aJson(s2, agente, punta) });
  } catch (e) {
    console.error(`[fiat] avisar ${req.params.id}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo avisar el pago.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /fiat/solicitudes/:id/confirmar ────────────────────────────────────
// Quien RECIBE el fiat confirma que le llego — en una entrada el agente, en
// una salida el usuario — y con eso la garantia se ejecuta: el ORIGEN
// reservado pasa al que pago. Confirmar es la unica transicion que MUEVE
// dinero de sitio, y por eso es la que mas cuida el cerrojo: una solicitud ya
// liquidada respondida al mismo confirmador con la MISMA respuesta buena —
// idempotente — porque castigar un doble clic con un 409 solo fabrica
// tickets de soporte de dinero que si llego.
async function confirmar(req, res) {
  try {
    const cargado = await cargar(req, res);
    if (!cargado) return;
    const { solicitud, agente, punta } = cargado;

    if (punta !== receptorFiat(solicitud.tipo)) {
      return res.status(403).json({ error: 'Confirma quien recibe el fiat: en una entrada el agente, en una salida el usuario.', codigo: 'NO_TE_TOCA' });
    }
    if (solicitud.estado === 'liquidada') {
      return res.json({ solicitud: aJson(solicitud, agente, punta) });
    }
    if (solicitud.estado !== 'fiat-avisado') return estadoNoEs(res, solicitud, 'fiat-avisado');

    const s2 = await transitar(solicitud._id, 'fiat-avisado', 'liquidada', `${punta}:${req.usuario.id}`, {
      nota: notaDe(req.body),
    });
    if (!s2) {
      // Perdio la carrera. Si el ganador fue otra confirmacion identica, la
      // respuesta es la buena; si fue una cancelacion o una disputa, se dice.
      const s3 = await Solicitud.findById(solicitud._id);
      if (s3 && s3.estado === 'liquidada') {
        return res.json({ solicitud: aJson(s3, agente, punta) });
      }
      return estadoNoEs(res, s3 || solicitud, 'fiat-avisado');
    }

    try {
      await ledger.ejecutarReserva(
        duenoGarantia(solicitud, agente),
        solicitud.activo,
        solicitud.cantidad,
        beneficiario(solicitud, agente),
        `fiat:${solicitud._id}`
      );
    } catch (e) {
      await revertir(solicitud._id, 'liquidada', 'fiat-avisado', `la garantia no se pudo ejecutar: ${e.codigo || e.message}`);
      console.error(`[fiat] confirmar ${solicitud._id}: la garantia no se pudo ejecutar: ${e.message}`);
      return res.status(e.status || 503).json({
        error: 'No se pudo ejecutar la garantia; la solicitud sigue con el fiat avisado.',
        codigo: e.codigo || 'NO_SE_PUDO',
      });
    }

    // El AML va DESPUES del dinero y en silencio: reporta lo que paso, no
    // decide si pasa.
    await reportarAml(s2);

    return res.json({ solicitud: aJson(s2, agente, punta) });
  } catch (e) {
    console.error(`[fiat] confirmar ${req.params.id}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo confirmar.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /fiat/solicitudes/:id/cancelar ─────────────────────────────────────
// { nota? }
//
// Cancelar libera la garantia a su dueño. Hasta `tomada` puede cancelar
// cualquiera de las dos puntas: nadie ha pagado nada y retirarse es gratis
// (el agente ADEMAS lo necesita: abrir una entrada congela SU plata sin
// preguntarle). Con el fiat ya avisado solo cancela QUIEN LO PAGO — ese es el
// "salvo acuerdo" del contrato: el unico que puede renunciar a un pago
// avisado es el que dice haberlo hecho; que la otra punta cancelara seria
// quedarse el fiat y devolver la garantia a su dueño con una sola llamada.
// Una disputa no se cancela: la resuelve el admin.
async function cancelar(req, res) {
  try {
    const cargado = await cargar(req, res);
    if (!cargado) return;
    const { agente, punta } = cargado;
    const nota = notaDe(req.body);

    // Leer-decidir-cerrojo, con reintento acotado: la guarda va con el estado
    // EXACTO que se leyo (la fila de historia necesita saber DESDE donde), y
    // si otro se movio primero se relee y se decide de nuevo.
    let s = cargado.solicitud;
    for (let intento = 0; intento < 3; intento++) {
      if (s.estado === 'disputa') {
        return res.status(409).json({ error: 'Una disputa la resuelve el admin, no se cancela.', codigo: 'EN_DISPUTA' });
      }
      if (s.estado === 'liquidada' || s.estado === 'cancelada') {
        return estadoNoEs(res, s, 'abierta, tomada o fiat-avisado');
      }
      if (s.estado === 'fiat-avisado' && punta !== pagadorFiat(s.tipo)) {
        return res.status(409).json({ error: 'Con el fiat ya avisado solo puede cancelar quien lo pago.', codigo: 'SOLO_QUIEN_PAGO' });
      }

      const s2 = await transitar(s._id, s.estado, 'cancelada', `${punta}:${req.usuario.id}`, { nota });
      if (s2) {
        try {
          await ledger.liberar(duenoGarantia(s2, agente), s2.activo, s2.cantidad, `fiat:${s2._id}`);
        } catch (e) {
          await revertir(s2._id, 'cancelada', s.estado, `la garantia no se pudo liberar: ${e.codigo || e.message}`);
          console.error(`[fiat] cancelar ${s2._id}: la garantia no se pudo liberar: ${e.message}`);
          return res.status(e.status || 503).json({
            error: 'No se pudo liberar la garantia; la solicitud sigue viva.',
            codigo: e.codigo || 'NO_SE_PUDO',
          });
        }
        return res.json({ solicitud: aJson(s2, agente, punta) });
      }

      const s3 = await Solicitud.findById(s._id);
      if (!s3) {
        return res.status(404).json({ error: 'No hay ninguna solicitud con ese id.', codigo: 'SOLICITUD_NO_EXISTE' });
      }
      s = s3;
    }
    return res.status(409).json({ error: 'La solicitud esta cambiando de estado; proba de nuevo.', codigo: 'ESTADO_EN_DISPUTA' });
  } catch (e) {
    console.error(`[fiat] cancelar ${req.params.id}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo cancelar.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /fiat/solicitudes/:id/disputar ─────────────────────────────────────
// { nota? }
//
// Cualquiera de las dos puntas, desde `tomada` o `fiat-avisado` — antes de
// eso no hay nada que disputar (cancelar es gratis) y despues ya no hay nada
// en juego. Disputar CONGELA: la garantia queda reservada, nadie confirma ni
// cancela, y la solicitud espera al admin con su historia como expediente. La
// nota importa: "pague y no me confirma" hoy vale mas que reconstruirlo en
// quince dias.
async function disputar(req, res) {
  try {
    const cargado = await cargar(req, res);
    if (!cargado) return;
    const { agente, punta } = cargado;
    const nota = notaDe(req.body);

    let s = cargado.solicitud;
    for (let intento = 0; intento < 3; intento++) {
      if (s.estado !== 'tomada' && s.estado !== 'fiat-avisado') {
        return estadoNoEs(res, s, 'tomada o fiat-avisado');
      }
      const s2 = await transitar(s._id, s.estado, 'disputa', `${punta}:${req.usuario.id}`, { nota });
      if (s2) return res.json({ solicitud: aJson(s2, agente, punta) });

      const s3 = await Solicitud.findById(s._id);
      if (!s3) {
        return res.status(404).json({ error: 'No hay ninguna solicitud con ese id.', codigo: 'SOLICITUD_NO_EXISTE' });
      }
      s = s3;
    }
    return res.status(409).json({ error: 'La solicitud esta cambiando de estado; proba de nuevo.', codigo: 'ESTADO_EN_DISPUTA' });
  } catch (e) {
    console.error(`[fiat] disputar ${req.params.id}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo disputar.', codigo: 'NO_SE_PUDO' });
  }
}

// ── El arbitraje (lo llama adminController via POST /admin/solicitudes/:id/resolver)
// { aFavor: 'usuario' | 'agente', nota? }
//
// Gana quien pago el fiat ⇒ se le ejecuta la garantia y queda `liquidada`
// (con su AML, como toda liquidacion). Gana el dueño de la garantia ⇒ se le
// libera y queda `cancelada`. La nota del admin va a la historia: una disputa
// resuelta sin porque escrito es una disputa que va a volver.
//
// Ojo con la tabla: `aFavor` nombra a la PERSONA, no a un lado del dinero.
// En una entrada el que pago fiat es el usuario; en una salida, el agente.
async function resolverDisputa(req, res) {
  const { aFavor } = req.body || {};
  if (aFavor !== 'usuario' && aFavor !== 'agente') {
    return res.status(400).json({ error: 'aFavor tiene que ser "usuario" o "agente".', codigo: 'FALLO_INVALIDO' });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'No hay ninguna solicitud con ese id.', codigo: 'SOLICITUD_NO_EXISTE' });
  }

  try {
    const solicitud = await Solicitud.findById(req.params.id);
    if (!solicitud) {
      return res.status(404).json({ error: 'No hay ninguna solicitud con ese id.', codigo: 'SOLICITUD_NO_EXISTE' });
    }
    if (solicitud.estado !== 'disputa') {
      // Solo se arbitra lo disputado: resolver una solicitud viva por la
      // puerta del admin seria saltarse la confirmacion de las partes.
      return res.status(409).json({ error: 'Esa solicitud no esta en disputa.', codigo: 'NO_ESTA_EN_DISPUTA' });
    }
    const agente = await Agente.findById(solicitud.agenteId);
    if (!agente) {
      return res.status(409).json({ error: 'El agente de esa solicitud no existe.', codigo: 'AGENTE_NO_EXISTE' });
    }

    const ganaElQuePago = aFavor === pagadorFiat(solicitud.tipo);
    const estadoFinal = ganaElQuePago ? 'liquidada' : 'cancelada';

    const s2 = await transitar(solicitud._id, 'disputa', estadoFinal, `admin:${aFavor}`, { nota: notaDe(req.body) });
    if (!s2) {
      // Dos admins a la vez: el primero resolvio y este llega tarde. No se
      // re-arbitra lo arbitrado.
      return res.status(409).json({ error: 'Esa solicitud no esta en disputa.', codigo: 'NO_ESTA_EN_DISPUTA' });
    }

    try {
      if (ganaElQuePago) {
        await ledger.ejecutarReserva(
          duenoGarantia(solicitud, agente),
          solicitud.activo,
          solicitud.cantidad,
          beneficiario(solicitud, agente),
          `fiat:${solicitud._id}`
        );
      } else {
        await ledger.liberar(duenoGarantia(solicitud, agente), solicitud.activo, solicitud.cantidad, `fiat:${solicitud._id}`);
      }
    } catch (e) {
      await revertir(solicitud._id, estadoFinal, 'disputa', `el arbitraje no pudo mover la garantia: ${e.codigo || e.message}`);
      console.error(`[fiat] resolver ${solicitud._id}: la garantia no se pudo mover: ${e.message}`);
      return res.status(e.status || 503).json({
        error: 'No se pudo mover la garantia; la disputa sigue abierta.',
        codigo: e.codigo || 'NO_SE_PUDO',
      });
    }

    if (estadoFinal === 'liquidada') {
      await reportarAml(s2, { resuelta: 'disputa' });
    }

    return res.json({ solicitud: aJson(s2, agente, null) });
  } catch (e) {
    console.error(`[fiat] resolver ${req.params.id}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo resolver la disputa.', codigo: 'NO_SE_PUDO' });
  }
}

module.exports = {
  agentes,
  crearSolicitud,
  listarSolicitudes,
  tomar,
  avisar,
  confirmar,
  cancelar,
  disputar,
  resolverDisputa,
};
