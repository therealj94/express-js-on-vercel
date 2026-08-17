// Los retiros: se PIDEN, no se ejecutan.
//
// ══ POR QUÉ EL DINERO SE APARTA AL PEDIRLO ═════════════════════════════════
//
// Entre que alguien pide un retiro y que operaciones lo paga pasa tiempo. Si
// durante ese rato el dinero siguiera disponible en su cuenta, podría pedir
// tres retiros de todo su saldo y los tres se verían pagables. El primero que
// se ejecutara dejaría a los otros dos sin fondo, y quien los descubriría
// sería el corresponsal rebotando una transferencia.
//
// Así que al pedirlo, un asiento mueve el dinero de `cliente:<gid>` a
// `retiro:<gid>`. Sigue siendo un PASIVO —la casa se lo sigue debiendo, no se
// lo quedó— pero ya no está disponible para gastarlo otra vez. Se ve en el
// extracto y se ve en las reservas.
//
// ══ LOS TRES FINALES ═══════════════════════════════════════════════════════
//
//   ejecutada  → `retiro:` sale y el banco corresponsal paga. Fin.
//   rechazada  → el dinero VUELVE entero a la cuenta, comisión incluida. Si no
//                se pagó, no se cobra: cobrar por un servicio que no se prestó
//                es quedarse con plata ajena por un trámite.
//   pendiente  → sigue esperando, y el cliente lo ve esperando.
//
// No hay un cuarto final donde el dinero se queda en `retiro:` para siempre.
// Toda solicitud tiene que terminar en una de las dos primeras.

const { Usuario, Solicitud, Beneficiario, Corresponsal } = require('../models');
const { moneda, aMinimas, aTexto } = require('../lib/monedas');
const { asentar } = require('../lib/asientos');
const { comision } = require('../lib/tarifas');
const genesis = require('../lib/genesis');
const { cuentaDe, pintar } = require('./cuentasController');
const { refDe } = require('./movimientosController');
const { pintarBeneficiario } = require('./beneficiariosController');
const { custodiaDe } = require('./tesoreriaController');

/** La cuenta donde espera el dinero ya pedido. Sigue siendo del cliente. */
const enProcesoDe = (gid) => `retiro:${gid}`;

function pintarSolicitud(s) {
  return {
    id: String(s._id), ref: s.ref, tipo: s.tipo, estado: s.estado,
    moneda: s.moneda,
    monto: pintar(s.monto, s.moneda),
    neto: pintar(s.neto, s.moneda),
    comision: pintar(s.comision || '0', s.moneda),
    beneficiario: s.beneficiario || null,
    nota: s.nota || '', comprobante: s.comprobante || '',
    creada: s.creada, resuelta: s.resuelta,
  };
}

// ── POST /solicitudes/retiro ────────────────────────────────────────────────
// { ref, moneda, monto, beneficiario (id) }
async function pedirRetiro(req, res) {
  const cod = String(req.body?.moneda || '').toUpperCase();
  if (!moneda(cod)) return res.status(400).json({ error: 'Esa moneda no existe.', codigo: 'MONEDA_DESCONOCIDA' });

  const neto = aMinimas(req.body?.monto, cod);
  if (!neto || BigInt(neto) <= 0n) {
    return res.status(400).json({ error: 'El monto no es válido.', codigo: 'MONTO_INVALIDO' });
  }
  const ref = refDe(req.usuario.gid, req.body?.ref);
  if (!ref) return res.status(400).json({ error: 'Falta el sello de la operación.', codigo: 'REF_FALTA' });

  try {
    const usuario = await Usuario.findOne({ gid: req.usuario.gid });
    if (!usuario) return res.status(401).json({ error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' });
    if (usuario.verificada !== true) {
      return res.status(403).json({
        error: 'Para retirar hace falta terminar la verificación de identidad.',
        codigo: 'IDENTIDAD_SIN_VERIFICAR',
      });
    }

    const ben = await Beneficiario.findOne({ _id: req.body?.beneficiario, gid: usuario.gid });
    if (!ben) return res.status(400).json({ error: 'Elegí a dónde mandarlo.', codigo: 'BENEFICIARIO_FALTA' });
    if (ben.moneda !== cod) {
      // Mandar lempiras a una cuenta de dólares es una transferencia que el
      // banco rebota o convierte a su antojo. Ni una ni la otra son lo que
      // pidió el cliente.
      return res.status(400).json({
        error: 'Ese destino es de otra moneda.', codigo: 'MONEDA_DEL_DESTINO',
      });
    }

    /* El monto que se aparta es el neto MÁS la comisión: si alguien pide
       retirar 100 y la comisión es 2, se le apartan 102 y le llegan 100. La
       alternativa —apartar 100 y mandarle 98— es la que hace que la gente
       reciba menos de lo que escribió, y eso siempre se siente como un engaño
       aunque estuviera en la letra chica. */
    const cargo = comision('retiro', neto, cod);
    const total = (BigInt(neto) + BigInt(cargo)).toString();

    // Se congela una COPIA del destino: si mañana edita el beneficiario, este
    // retiro tiene que seguir diciendo a dónde se mandó de verdad.
    const copia = pintarBeneficiario(ben);

    const lineas = [
      { cuenta: cuentaDe(usuario.gid), tipo: 'pasivo', moneda: cod, debe: total },
      { cuenta: enProcesoDe(usuario.gid), tipo: 'pasivo', moneda: cod, haber: neto },
    ];
    if (BigInt(cargo) > 0n) {
      lineas.push({ cuenta: 'ingreso.comisiones', tipo: 'ingreso', moneda: cod, haber: cargo });
    }

    await asentar({
      ref: `${ref}:aparta`,
      glosa: `Retiro pedido de ${aTexto(neto, cod)} ${cod} a ${copia.alias}`
        + (BigInt(cargo) > 0n ? ` (comisión ${aTexto(cargo, cod)})` : ''),
      lineas,
    }, { clase: 'retiro' });

    // El asiento entró: recién ahora existe la solicitud. Al revés —crear la
    // solicitud y después apartar— dejaría solicitudes sin dinero detrás.
    const s = await Solicitud.create({
      gid: usuario.gid, tipo: 'retiro', moneda: cod,
      monto: total, neto, comision: cargo,
      beneficiario: copia, estado: 'pendiente', ref,
    });

    genesis.reportarMovimiento(usuario.gid, {
      id: ref, tipo: 'retiro_fiat_pedido', moneda: cod,
      monto: aTexto(neto, cod), contraparte: copia.alias,
    });

    return res.json({ solicitud: pintarSolicitud(s) });
  } catch (e) {
    if (e?.codigo === 'SALDO_INSUFICIENTE') {
      return res.status(400).json({ error: 'No hay saldo suficiente.', codigo: 'SALDO_INSUFICIENTE' });
    }
    if (e?.code === 11000) {
      const ya = await Solicitud.findOne({ ref });
      if (ya) return res.json({ solicitud: pintarSolicitud(ya), repetido: true });
    }
    console.error(`[solicitudes] no se pudo pedir el retiro: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo pedir el retiro.', codigo: 'NO_SE_PUDO' });
  }
}

// ── GET /solicitudes ────────────────────────────────────────────────────────
async function mias(req, res) {
  try {
    const docs = await Solicitud.find({ gid: req.usuario.gid }).sort({ creada: -1 }).limit(100);
    return res.json({ solicitudes: docs.map(pintarSolicitud) });
  } catch (e) {
    console.error(`[solicitudes] no se pudieron listar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
}

// ── GET /tesoreria/solicitudes?estado=pendiente ─────────────────────────────
async function cola(req, res) {
  try {
    const estado = String(req.query?.estado || 'pendiente');
    const docs = await Solicitud.find({ estado }).sort({ creada: 1 }).limit(200);
    return res.json({
      solicitudes: docs.map((s) => ({ ...pintarSolicitud(s), gid: s.gid })),
    });
  } catch (e) {
    console.error(`[solicitudes] no se pudo leer la cola: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
}

/** Cierra una solicitud pendiente. El findOneAndUpdate con `estado:
 *  'pendiente'` en el filtro es la guarda: dos personas de operaciones
 *  resolviendo la misma solicitud a la vez, y solo una la agarra. */
async function resolver(req, res, { ejecutar }) {
  const nota = String(req.body?.nota || '').trim().slice(0, 300);
  const comprobante = String(req.body?.comprobante || '').trim().slice(0, 200);
  if (ejecutar && !comprobante) {
    return res.status(400).json({
      error: 'Falta el comprobante del pago.', codigo: 'COMPROBANTE_FALTA',
    });
  }
  if (!ejecutar && !nota) {
    // Un rechazo sin motivo es un rechazo que el cliente no puede corregir.
    return res.status(400).json({ error: 'Poné el motivo del rechazo.', codigo: 'NOTA_FALTA' });
  }

  try {
    const s = await Solicitud.findOneAndUpdate(
      { _id: req.params.id, estado: 'pendiente' },
      { $set: { estado: ejecutar ? 'ejecutando' : 'rechazando' } },
      { new: true }
    );
    if (!s) {
      return res.status(409).json({
        error: 'Esa solicitud ya no está pendiente.', codigo: 'YA_RESUELTA',
      });
    }

    try {
      if (ejecutar) {
        // El dinero sale de verdad: deja de deberse y sale del banco.
        await asentar({
          ref: `${s.ref}:paga`,
          glosa: `Retiro pagado de ${aTexto(s.neto, s.moneda)} ${s.moneda} — ${comprobante}`,
          lineas: [
            { cuenta: enProcesoDe(s.gid), tipo: 'pasivo', moneda: s.moneda, debe: s.neto },
            { cuenta: custodiaDe(s.moneda), tipo: 'activo', moneda: s.moneda, haber: s.neto },
          ],
        }, { clase: 'retiro' });
      } else {
        // Vuelve TODO, comisión incluida: no se pagó, no se cobra.
        const lineas = [
          { cuenta: enProcesoDe(s.gid), tipo: 'pasivo', moneda: s.moneda, debe: s.neto },
          { cuenta: cuentaDe(s.gid), tipo: 'pasivo', moneda: s.moneda, haber: s.monto },
        ];
        if (BigInt(s.comision || '0') > 0n) {
          lineas.splice(1, 0, {
            cuenta: 'ingreso.comisiones', tipo: 'ingreso', moneda: s.moneda, debe: s.comision,
          });
        }
        await asentar({
          ref: `${s.ref}:devuelve`,
          glosa: `Retiro rechazado, devuelto entero — ${nota}`,
          lineas,
          // `reverso` y no `retiro`: es lo que le dice a lib/consumo.js que
          // este movimiento DESHACE una salida, para que un retiro rechazado
          // no siga consumiendo el límite del día de alguien que al final no
          // sacó nada.
        }, { clase: 'reverso' });
      }
    } catch (e) {
      // El asiento no entró: la solicitud vuelve a pendiente. Dejarla en
      // 'ejecutando' sería un retiro que nadie puede ni pagar ni devolver.
      await Solicitud.updateOne({ _id: s._id }, { $set: { estado: 'pendiente' } });
      throw e;
    }

    const cerrada = await Solicitud.findOneAndUpdate(
      { _id: s._id },
      { $set: {
        estado: ejecutar ? 'ejecutada' : 'rechazada',
        nota, comprobante, resuelta: new Date(),
      } },
      { new: true }
    );

    genesis.reportarMovimiento(s.gid, {
      id: `${s.ref}:${ejecutar ? 'paga' : 'devuelve'}`,
      tipo: ejecutar ? 'retiro_fiat' : 'retiro_fiat_rechazado',
      moneda: s.moneda, monto: aTexto(s.neto, s.moneda), comprobante,
    });

    return res.json({ solicitud: pintarSolicitud(cerrada) });
  } catch (e) {
    console.error(`[solicitudes] no se pudo resolver: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo resolver.', codigo: 'NO_SE_PUDO' });
  }
}

const ejecutar = (req, res) => resolver(req, res, { ejecutar: true });
const rechazar = (req, res) => resolver(req, res, { ejecutar: false });

// ── GET /deposito/instrucciones?moneda=USD ──────────────────────────────────
// A dónde manda el dinero quien quiere depositar. Es la cuenta REAL de AuCorp
// en esa plaza, y por eso NO vive en el código: la carga operaciones.
async function instruccionesDeposito(req, res) {
  const cod = String(req.query?.moneda || '').toUpperCase();
  if (!moneda(cod)) return res.status(400).json({ error: 'Esa moneda no existe.', codigo: 'MONEDA_DESCONOCIDA' });
  try {
    const c = await Corresponsal.findOne({ moneda: cod, activa: true });
    if (!c) {
      /* Sin corresponsal en esa plaza NO se inventa una cuenta ni se enseña la
         de otra moneda. Que el sistema sepa contar quetzales no quiere decir
         que haya dónde recibirlos, y decir que sí es como llega dinero a un
         sitio del que después nadie lo saca. */
      return res.status(404).json({
        error: 'Todavía no hay cuenta para recibir esa moneda.',
        codigo: 'SIN_CORRESPONSAL',
      });
    }
    return res.json({
      instrucciones: {
        moneda: c.moneda, banco: c.banco, titular: c.titular,
        numero: c.numero, swift: c.swift, ruta: c.ruta,
        instrucciones: c.instrucciones,
      },
      // Lo que hace falta para que el depósito se pueda encontrar. Sin esto,
      // una transferencia sin referencia es dinero que llega sin dueño.
      aviso: 'Poné tu Genesis ID como referencia de la transferencia. Sin referencia, el depósito puede tardar en acreditarse.',
      referencia: req.usuario.gid,
    });
  } catch (e) {
    console.error(`[solicitudes] no se pudieron leer las instrucciones: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
}

module.exports = { pedirRetiro, mias, cola, ejecutar, rechazar, instruccionesDeposito, enProcesoDe };
