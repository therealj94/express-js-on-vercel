// Las solicitudes: los retiros se PIDEN, no se ejecutan; los depósitos se
// AVISAN, no se acreditan.
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
// ══ LOS TRES FINALES DE UN RETIRO ══════════════════════════════════════════
//
//   ejecutada  → `retiro:` sale y el banco corresponsal paga. Fin.
//   rechazada  → el dinero VUELVE entero a la cuenta, comisión incluida. Si no
//                se pagó, no se cobra: cobrar por un servicio que no se prestó
//                es quedarse con plata ajena por un trámite.
//   pendiente  → sigue esperando, y el cliente lo ve esperando, con lo que
//                le falta dicho con palabras.
//
// No hay un cuarto final donde el dinero se queda en `retiro:` para siempre.
// Toda solicitud tiene que terminar en una de las dos primeras. Y las que se
// quedan a medias las canta lib/barrido.js — no las resuelve.
//
// ══ EL AVISO DE DEPÓSITO ═══════════════════════════════════════════════════
//
// Un cliente que transfirió a la cuenta de la casa no tiene dónde verlo hasta
// que operaciones lo acredita. Ahora lo AVISA: «mandé 500 USD, referencia X».
// Eso crea una solicitud `avisada` que NO mueve un céntimo —el crédito sigue
// entrando sólo por /tesoreria/deposito con el comprobante del banco— pero le
// da al cliente un lugar donde mirar y a operaciones una cola que atender.
//
// ══ EL TAMIZ ═══════════════════════════════════════════════════════════════
//
// Antes de apartar un retiro se tamiza al titular del destino contra la lista
// de sanciones, aunque ya se tamizó al guardarlo: la lista de hoy no es la de
// hace un mes. Sin lista no sale; con coincidencia fuerte tampoco.

const { Usuario, Solicitud, Beneficiario, Corresponsal } = require('../models');
const { aTexto } = require('../lib/monedas');
const { asentar } = require('../lib/asientos');
const { comision } = require('../lib/tarifas');
const { queFalta } = require('../lib/barrido');
const genesis = require('../lib/genesis');
const V = require('../lib/validar');
const { cuentaDe, pintar } = require('./cuentasController');
const { refDe } = require('./movimientosController');
const { pintarBeneficiario, pasaTamiz } = require('./beneficiariosController');
const { custodiaDe } = require('./tesoreriaController');

/** La cuenta donde espera el dinero ya pedido. Sigue siendo del cliente. */
const enProcesoDe = (gid) => `retiro:${gid}`;

const ESTADOS_TEXTO = {
  pendiente: 'Esperando pago', ejecutando: 'Pagándose', ejecutada: 'Pagado',
  rechazando: 'Devolviéndose', rechazada: 'Rechazado',
  avisada: 'Esperando acreditación', acreditada: 'Acreditado',
};

function pintarSolicitud(s, ahora = new Date()) {
  const ultima = s.actualizada || s.creada;
  return {
    id: String(s._id), ref: s.ref,
    numero: s.ref.split(':').slice(1).join(':') || s.ref,
    tipo: s.tipo, estado: s.estado,
    estadoTexto: ESTADOS_TEXTO[s.estado] || s.estado,
    terminada: ['ejecutada', 'rechazada', 'acreditada'].includes(s.estado),
    moneda: s.moneda,
    monto: pintar(s.monto, s.moneda),
    neto: pintar(s.neto, s.moneda),
    comision: pintar(s.comision || '0', s.moneda),
    beneficiario: s.beneficiario || null,
    referenciaBancaria: s.referenciaBancaria || '',
    nota: s.nota || '', comprobante: s.comprobante || '',
    // Lo que falta para que termine, dicho para una persona. Vacío si terminó.
    queFalta: queFalta(s),
    horasSinCambio: Math.floor((ahora.getTime() - new Date(ultima).getTime()) / 3600000),
    creada: s.creada, actualizada: ultima, resuelta: s.resuelta,
  };
}

// ── POST /solicitudes/retiro ────────────────────────────────────────────────
// { ref, moneda, monto, beneficiario (id) }
const pedirRetiro = V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  const cod = V.moneda(b.moneda);
  const neto = V.monto(b.monto, cod);
  const ref = refDe(req.usuario.gid, b.ref);
  const benId = V.id(b.beneficiario, { campo: 'beneficiario', etiqueta: 'el destino' });

  try {
    const usuario = await Usuario.findOne({ gid: req.usuario.gid });
    if (!usuario) return res.status(401).json({ error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' });
    if (usuario.verificada !== true) {
      return res.status(403).json({
        error: 'Para retirar hace falta terminar la verificación de identidad.',
        codigo: 'IDENTIDAD_SIN_VERIFICAR',
      });
    }

    const ben = await Beneficiario.findOne({ _id: benId, gid: usuario.gid });
    if (!ben) return res.status(400).json({ error: 'Elegí a dónde mandarlo.', codigo: 'BENEFICIARIO_FALTA', campo: 'beneficiario' });
    if (ben.tipo !== 'bancario') {
      return res.status(400).json({ error: 'Un retiro va a una cuenta bancaria. Para otra cuenta de AuCorp usá «transferir».', codigo: 'DESTINO_NO_BANCARIO', campo: 'beneficiario' });
    }
    if (ben.moneda !== cod) {
      // Mandar lempiras a una cuenta de dólares es una transferencia que el
      // banco rebota o convierte a su antojo. Ni una ni la otra son lo que
      // pidió el cliente.
      return res.status(400).json({
        error: 'Ese destino es de otra moneda.', codigo: 'MONEDA_DEL_DESTINO', campo: 'beneficiario',
      });
    }

    // El tamiz, antes de apartar un céntimo.
    if (!await pasaTamiz(res, { gid: usuario.gid, nombre: ben.titular, contexto: 'retiro' })) return;

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
      return res.status(400).json({ error: 'No hay saldo suficiente.', codigo: 'SALDO_INSUFICIENTE', campo: 'monto' });
    }
    if (e?.code === 11000) {
      const ya = await Solicitud.findOne({ ref });
      if (ya) return res.json({ solicitud: pintarSolicitud(ya), repetido: true });
    }
    console.error(`[solicitudes] no se pudo pedir el retiro: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo pedir el retiro.', codigo: 'NO_SE_PUDO' });
  }
});

// ── POST /solicitudes/deposito ──────────────────────────────────────────────
// { ref, moneda, monto, referenciaBancaria } → «avisé que mandé el dinero».
// NO acredita nada. Crea la solicitud `avisada` para que el cliente la vea y
// operaciones la busque en el extracto.
const avisarDeposito = V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  const cod = V.moneda(b.moneda);
  const monto = V.monto(b.monto, cod);
  const ref = refDe(req.usuario.gid, b.ref);
  const referencia = V.texto(b.referenciaBancaria, { campo: 'referenciaBancaria', max: 120, obligatorio: true, etiqueta: 'la referencia de la transferencia' });
  const nota = V.texto(b.nota, { campo: 'nota', max: 300, etiqueta: 'la nota' });

  try {
    const usuario = await Usuario.findOne({ gid: req.usuario.gid });
    if (!usuario) return res.status(401).json({ error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' });
    if (usuario.verificada !== true) {
      return res.status(403).json({ error: 'Para depositar hace falta terminar la verificación de identidad.', codigo: 'IDENTIDAD_SIN_VERIFICAR' });
    }
    const c = await Corresponsal.findOne({ moneda: cod, activa: true });
    if (!c) {
      return res.status(404).json({ error: 'Todavía no hay cuenta para recibir esa moneda.', codigo: 'SIN_CORRESPONSAL', campo: 'moneda' });
    }
    const s = await Solicitud.create({
      gid: usuario.gid, tipo: 'deposito', moneda: cod,
      monto, neto: monto, comision: '0',
      beneficiario: { banco: c.banco, titular: c.titular, moneda: c.moneda },
      referenciaBancaria: referencia, nota,
      estado: 'avisada', ref,
    });
    return res.json({ solicitud: pintarSolicitud(s) });
  } catch (e) {
    if (e?.code === 11000) {
      const ya = await Solicitud.findOne({ ref });
      if (ya) return res.json({ solicitud: pintarSolicitud(ya), repetido: true });
    }
    console.error(`[solicitudes] no se pudo avisar el depósito: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo registrar el aviso.', codigo: 'NO_SE_PUDO' });
  }
});

// ── GET /solicitudes?estado=&tipo= ──────────────────────────────────────────
const mias = V.conEntrada(async (req, res) => {
  const q = req.query || {};
  const filtro = { gid: req.usuario.gid };
  if (q.estado) filtro.estado = V.opcion(q.estado, Object.keys(ESTADOS_TEXTO), { campo: 'estado' });
  if (q.tipo) filtro.tipo = V.opcion(q.tipo, ['retiro', 'deposito'], { campo: 'tipo' });
  try {
    const docs = await Solicitud.find(filtro).sort({ creada: -1 }).limit(100);
    return res.json({ solicitudes: docs.map((s) => pintarSolicitud(s)), estados: ESTADOS_TEXTO });
  } catch (e) {
    console.error(`[solicitudes] no se pudieron listar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
});

// ── GET /solicitudes/:id ────────────────────────────────────────────────────
// Una sola, con todo: es lo que la pantalla imprime como constancia.
const una = V.conEntrada(async (req, res) => {
  const id = V.id(req.params.id, { etiqueta: 'la solicitud' });
  try {
    const s = await Solicitud.findOne({ _id: id, gid: req.usuario.gid });
    if (!s) return res.status(404).json({ error: 'No hay una solicitud con ese número en tu cuenta.', codigo: 'NO_EXISTE' });
    return res.json({ solicitud: pintarSolicitud(s) });
  } catch (e) {
    console.error(`[solicitudes] no se pudo leer: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
});

// ── GET /tesoreria/solicitudes?estado=pendiente&tipo= ───────────────────────
const cola = V.conEntrada(async (req, res) => {
  const q = req.query || {};
  const filtro = {};
  filtro.estado = V.opcion(q.estado, Object.keys(ESTADOS_TEXTO), { campo: 'estado', porDefecto: 'pendiente' });
  if (q.tipo) filtro.tipo = V.opcion(q.tipo, ['retiro', 'deposito'], { campo: 'tipo' });
  try {
    const docs = await Solicitud.find(filtro).sort({ creada: 1 }).limit(200);
    return res.json({
      solicitudes: docs.map((s) => ({ ...pintarSolicitud(s), gid: s.gid })),
    });
  } catch (e) {
    console.error(`[solicitudes] no se pudo leer la cola: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO' });
  }
});

/** Cierra una solicitud pendiente. El findOneAndUpdate con `estado:
 *  'pendiente'` en el filtro es la guarda: dos personas de operaciones
 *  resolviendo la misma solicitud a la vez, y solo una la agarra. */
const resolver = (modo) => V.conEntrada(async (req, res) => {
  const ejecutar = modo === 'ejecutar';
  const id = V.id(req.params.id, { etiqueta: 'la solicitud' });
  const b = V.cuerpo(req);
  const nota = V.texto(b.nota, { campo: 'nota', max: 300, etiqueta: 'el motivo' });
  const comprobante = V.texto(b.comprobante, { campo: 'comprobante', max: 200, etiqueta: 'el comprobante' });
  if (ejecutar && !comprobante) {
    return res.status(400).json({
      error: 'Falta el comprobante del pago.', codigo: 'COMPROBANTE_FALTA', campo: 'comprobante',
    });
  }
  if (!ejecutar && !nota) {
    // Un rechazo sin motivo es un rechazo que el cliente no puede corregir.
    return res.status(400).json({ error: 'Poné el motivo del rechazo.', codigo: 'NOTA_FALTA', campo: 'nota' });
  }

  try {
    const antes = await Solicitud.findById(id);
    if (!antes) return res.status(404).json({ error: 'No existe esa solicitud.', codigo: 'NO_EXISTE' });

    // Un DEPÓSITO no se «ejecuta» por aquí: se acredita por /tesoreria/deposito
    // con el comprobante del banco, que es la única puerta por la que entra
    // dinero. Rechazar el aviso sí se puede, y no mueve nada.
    if (antes.tipo === 'deposito') {
      if (ejecutar) {
        return res.status(400).json({
          error: 'Un aviso de depósito se acredita por POST /tesoreria/deposito con el comprobante del corresponsal, pasando el id de la solicitud.',
          codigo: 'DEPOSITO_POR_TESORERIA',
        });
      }
      const s = await Solicitud.findOneAndUpdate(
        { _id: id, estado: 'avisada' },
        { $set: { estado: 'rechazada', nota, resuelta: new Date(), actualizada: new Date() } },
        { new: true }
      );
      if (!s) return res.status(409).json({ error: 'Ese aviso ya no está pendiente.', codigo: 'YA_RESUELTA' });
      return res.json({ solicitud: pintarSolicitud(s) });
    }

    const s = await Solicitud.findOneAndUpdate(
      { _id: id, estado: 'pendiente' },
      { $set: { estado: ejecutar ? 'ejecutando' : 'rechazando', actualizada: new Date() } },
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
      await Solicitud.updateOne({ _id: s._id }, { $set: { estado: 'pendiente', actualizada: new Date() } });
      throw e;
    }

    const cerrada = await Solicitud.findOneAndUpdate(
      { _id: s._id },
      { $set: {
        estado: ejecutar ? 'ejecutada' : 'rechazada',
        nota, comprobante, resuelta: new Date(), actualizada: new Date(),
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
});

const ejecutar = resolver('ejecutar');
const rechazar = resolver('rechazar');

// ── GET /deposito/instrucciones?moneda=USD ──────────────────────────────────
// A dónde manda el dinero quien quiere depositar. Es la cuenta REAL de AuCorp
// en esa plaza, y por eso NO vive en el código: la carga operaciones.
const instruccionesDeposito = V.conEntrada(async (req, res) => {
  const cod = V.moneda(req.query?.moneda);
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
});

module.exports = {
  pedirRetiro, avisarDeposito, mias, una, cola, ejecutar, rechazar, instruccionesDeposito,
  enProcesoDe, pintarSolicitud, ESTADOS_TEXTO,
};
