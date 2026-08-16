// La operacion de la casa: agentes, disputas, el barrido y el estado.
//
// La X-Admin-Key ya la valido la ruta (routes/admin.js, en tiempo constante);
// aqui se asume un operador legitimo y aun asi ninguna funcion se salta el
// ledger ni escribe un saldo a mano: el admin tiene mas botones, no otra
// contabilidad.

const { Usuario, Cuenta, Orden, Retiro, Agente, Solicitud } = require('../models');
const ledger = require('../lib/ledger');
const cadena = require('../lib/cadena5550');
const { PORSIMBOLO } = require('../lib/tokens');
const { descifrarLlavePrivada } = require('../lib/cripto');

const MONEDAS = ['HNL', 'USD'];

// ── POST /admin/agentes ─────────────────────────────────────────────────────
// { gid, nombre, bancos: [{banco, cuenta, titular}], monedas }
//
// El alta exige que el gid ya haya entrado por SSO: un agente es un usuario
// de la casa con permisos de mas, no una fila suelta — sin Usuario detras no
// tendria ledger donde poner su ORIGEN en garantia y el circuito fiat
// naceria roto.
async function crearAgente(req, res) {
  const { gid, nombre, bancos, monedas } = req.body || {};

  if (typeof gid !== 'string' || !gid.trim()) {
    return res.status(400).json({ error: 'Falta el gid del agente.', codigo: 'GID_INVALIDO' });
  }
  if (typeof nombre !== 'string' || !nombre.trim()) {
    return res.status(400).json({ error: 'Falta el nombre del agente.', codigo: 'NOMBRE_INVALIDO' });
  }
  const bancosOk =
    Array.isArray(bancos) &&
    bancos.length > 0 &&
    bancos.every(
      (b) =>
        b &&
        typeof b.banco === 'string' && b.banco.trim() &&
        typeof b.cuenta === 'string' && b.cuenta.trim() &&
        typeof b.titular === 'string' && b.titular.trim()
    );
  if (!bancosOk) {
    return res.status(400).json({ error: 'bancos tiene que traer al menos {banco, cuenta, titular}.', codigo: 'BANCOS_INVALIDOS' });
  }
  const monedasOk =
    Array.isArray(monedas) && monedas.length > 0 && monedas.every((m) => MONEDAS.includes(m));
  if (!monedasOk) {
    return res.status(400).json({ error: 'monedas tiene que ser un subconjunto de HNL/USD.', codigo: 'MONEDAS_INVALIDAS' });
  }

  try {
    const usuario = await Usuario.findOne({ gid: gid.trim() });
    if (!usuario) {
      return res.status(404).json({
        error: 'Ese gid no ha entrado nunca a Ordenex: que haga el SSO primero.',
        codigo: 'USUARIO_NO_EXISTE',
      });
    }

    const agente = await Agente.create({
      gid: gid.trim(),
      userId: String(usuario._id),
      nombre: nombre.trim(),
      bancos,
      monedas,
      activo: true,
    });
    usuario.esAgente = true;
    await usuario.save();

    // Al admin si se le devuelven las cuentas bancarias completas: el las
    // acaba de teclear. Es GET /fiat/agentes el que jamas las ensena.
    return res.status(201).json({ agente });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ error: 'Ese gid ya es agente.', codigo: 'AGENTE_YA_EXISTE' });
    }
    console.error(`[admin] alta de agente fallo: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo dar el alta.', codigo: 'NO_SE_PUDO' });
  }
}

// ── DELETE /admin/agentes/:id ───────────────────────────────────────────────
// La baja es logica (activo=false), no un borrado: las solicitudes viejas
// apuntan a este agente por id, y arbitrar una disputa de hace un mes contra
// un agente desaparecido seria arbitrar a ciegas. Un agente de baja no
// aparece en GET /fiat/agentes ni puede tomar solicitudes; su historia queda.
async function borrarAgente(req, res) {
  try {
    const agente = await Agente.findById(req.params.id);
    if (!agente) {
      return res.status(404).json({ error: 'No hay ningun agente con ese id.', codigo: 'AGENTE_NO_EXISTE' });
    }
    agente.activo = false;
    await agente.save();
    await Usuario.updateOne({ _id: agente.userId }, { $set: { esAgente: false } });
    return res.json({ agente: { id: String(agente._id), activo: false } });
  } catch (e) {
    console.error(`[admin] baja de agente fallo: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo dar la baja.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /admin/solicitudes/:id/resolver ────────────────────────────────────
// { aFavor: 'usuario' | 'agente', nota? }
//
// El arbitraje de una disputa fiat. Si controllers/fiatController.js expone
// `resolverDisputa(req, res)` se delega entero alli — el que administra la
// maquina de estados de las solicitudes es el, y dos implementaciones del
// mismo arbitraje terminarian discrepando. El require es perezoso y en el
// momento de la llamada: asi el orden de despliegue de los archivos no
// decide que rama corre.
async function resolverSolicitud(req, res) {
  try {
    const fiat = require('./fiatController');
    if (typeof fiat.resolverDisputa === 'function') {
      return fiat.resolverDisputa(req, res);
    }
  } catch (e) {
    // fiatController no esta o no carga: se resuelve aqui mismo.
  }

  const { aFavor } = req.body || {};
  if (aFavor !== 'usuario' && aFavor !== 'agente') {
    return res.status(400).json({ error: 'aFavor tiene que ser "usuario" o "agente".', codigo: 'FALLO_INVALIDO' });
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

    // La garantia esta reservada en el ledger de quien vende el ORIGEN:
    // en una `entrada` (usuario compra) es del agente; en una `salida` es
    // del usuario. Gana quien pago el fiat: se le ejecuta la reserva a su
    // favor. Pierde: se libera de vuelta a su dueno.
    const duenoGarantia = solicitud.tipo === 'entrada' ? agente.userId : solicitud.userId;
    const contraparte = solicitud.tipo === 'entrada' ? solicitud.userId : agente.userId;
    const gana = solicitud.tipo === 'entrada'
      ? (aFavor === 'usuario' ? contraparte : null)
      : (aFavor === 'agente' ? contraparte : null);

    const ref = `disputa:${solicitud._id}`;
    let estadoFinal;
    if (gana) {
      await ledger.ejecutarReserva(duenoGarantia, solicitud.activo, solicitud.cantidad, gana, ref);
      estadoFinal = 'liquidada';
    } else {
      await ledger.liberar(duenoGarantia, solicitud.activo, solicitud.cantidad, ref);
      estadoFinal = 'cancelada';
    }

    solicitud.estado = estadoFinal;
    solicitud.historia.push({ estado: estadoFinal, quien: `admin:${aFavor}` });
    await solicitud.save();

    // AML de la liquidacion (regla del ecosistema), en silencio y sin tumbar
    // la resolucion: el arbitraje ya movio el dinero. El movimiento se
    // reporta sobre el gid del USUARIO — en una entrada compro ORIGEN con
    // fiat y en una salida lo vendio; el agente es la contraparte, no el
    // cliente monitoreado.
    if (estadoFinal === 'liquidada') {
      try {
        const genesis = require('../lib/genesis');
        if (typeof genesis.reportarMovimiento === 'function') {
          const usuarioSolicitud = await Usuario.findById(solicitud.userId).lean();
          await genesis.reportarMovimiento(usuarioSolicitud ? usuarioSolicitud.gid : null, {
            tipo: `fiat-${solicitud.tipo}`,
            activo: solicitud.activo,
            cantidad: solicitud.cantidad,
            moneda: solicitud.moneda,
            montoFiat: solicitud.montoFiat,
            resuelta: 'disputa',
            en: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error(`[admin] AML de la disputa ${solicitud._id} no se pudo reportar: ${e.message}`);
      }
    }

    return res.json({ solicitud: { id: String(solicitud._id), estado: estadoFinal } });
  } catch (e) {
    console.error(`[admin] resolver ${req.params.id} fallo: ${e.message}`);
    return res.status(e.status || 503).json({
      error: e.codigo ? e.message : 'No se pudo resolver la disputa.',
      codigo: e.codigo || 'NO_SE_PUDO',
    });
  }
}

// ── POST /admin/barrer ──────────────────────────────────────────────────────
// { activo }
//
// Mueve UN activo de todas las direcciones de deposito a la caliente. Es
// manual y de admin a proposito (v1): un barrido automatico firmando con
// cientos de llaves descifradas cada media hora es mas superficie de la que
// esta casa quiere tener sin necesidad.
//
// El ledger NO se toca: el deposito ya se acredito cuando el vigia lo vio;
// esto solo muda la custodia de sitio, y el vigia entiende el saldo que baja
// como lo que es (su marca de agua baja sin acreditar nada).
//
// Fail-closed por direccion: si un saldo no se pudo leer o una llave no se
// pudo descifrar, ESA direccion se salta y queda anotada en la respuesta —
// nunca se firma a ciegas ni con una llave que no valido su formato.
async function barrer(req, res) {
  const { activo } = req.body || {};
  if (!PORSIMBOLO[activo]) {
    return res.status(400).json({ error: 'Ese activo no existe en esta casa.', codigo: 'ACTIVO_INVALIDO' });
  }
  const caliente = cadena.direccionCaliente();
  if (!caliente) {
    return res.status(503).json({ error: 'La billetera caliente no esta configurada.', codigo: 'SIN_CONFIGURAR' });
  }

  let usuarios;
  try {
    usuarios = await Usuario.find(
      { direccionDeposito: { $ne: null }, llaveDepositoCifrada: { $ne: null } },
      { direccionDeposito: 1, llaveDepositoCifrada: 1 }
    ).lean();
  } catch (e) {
    return res.status(503).json({ error: 'No se pudieron leer las direcciones.', codigo: 'NO_SE_PUDO_LEER' });
  }

  const barridos = [];
  const fallos = [];
  // En serie, no en paralelo: cada firma descifra una llave y habla con el
  // RPC; cien a la vez es la receta para timeouts y nonces pisados.
  for (const u of usuarios) {
    const direccion = u.direccionDeposito;
    const saldo = await cadena.saldoDe(direccion, activo);
    if (!saldo.ok) {
      fallos.push({ direccion, error: `no se pudo leer el saldo: ${saldo.error}` });
      continue;
    }
    if (BigInt(saldo.wei) === 0n) continue; // nada que barrer, ni es un fallo

    const llave = descifrarLlavePrivada(u.llaveDepositoCifrada);
    if (!llave) {
      // Clave del cifrado ausente/equivocada o blob corrupto. Jamas se
      // adivina: se anota y que lo mire un humano.
      fallos.push({ direccion, error: 'la llave no se pudo descifrar' });
      continue;
    }

    try {
      const envio = await cadena.enviarDesde(llave, {
        a: caliente,
        activo,
        cantidadWei: saldo.wei,
        // El nativo se barre entero menos el gas; un token va integro (su
        // gas lo paga el ORIGEN que quede en la direccion).
        todo: Boolean(PORSIMBOLO[activo].nativo),
      });
      barridos.push({ direccion, cantidad: envio.cantidad, hash: envio.hash });
    } catch (e) {
      fallos.push({ direccion, error: `${e.codigo || e.code || ''} ${e.message}`.trim() });
    }
  }

  return res.json({ activo, caliente, barridos, fallos });
}

// ── GET /admin/estado ───────────────────────────────────────────────────────
// Los conteos de la casa y el saldo de la caliente. La pata de cadena es
// honesta como todo lo demas: si el RPC no contesta, `caliente.ok` va en
// false y los saldos en null — un panel que pinta ceros cuando el nodo esta
// caido es un panel que un dia jura que la caliente esta vacia.
async function estado(req, res) {
  let conteos;
  try {
    const [usuarios, agentes, ordenesAbiertas, retirosPendientes, porEstado] = await Promise.all([
      Usuario.countDocuments({}),
      Agente.countDocuments({ activo: true }),
      Orden.countDocuments({ estado: 'abierta' }),
      Retiro.countDocuments({ estado: 'pendiente' }),
      Solicitud.aggregate([{ $group: { _id: '$estado', n: { $sum: 1 } } }]),
    ]);
    const solicitudes = {};
    for (const s of porEstado) solicitudes[s._id] = s.n;
    conteos = { usuarios, agentes, ordenesAbiertas, retirosPendientes, solicitudes };
  } catch (e) {
    console.error(`[admin] estado: mongo no contesto: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer el estado.', codigo: 'NO_SE_PUDO_LEER' });
  }

  const direccion = cadena.direccionCaliente();
  let caliente;
  if (!direccion) {
    caliente = { ok: false, direccion: null, saldos: null, error: 'ORDENEX_HOT_KEY no esta configurada' };
  } else {
    const lectura = await cadena.saldosDe(direccion);
    caliente = lectura.ok
      ? { ok: true, direccion, saldos: lectura.saldos, error: null }
      : { ok: false, direccion, saldos: null, error: lectura.error };
  }

  return res.json({ ...conteos, caliente });
}

module.exports = { crearAgente, borrarAgente, resolverSolicitud, barrer, estado };
