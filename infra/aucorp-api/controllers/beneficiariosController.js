// A quién le manda dinero cada cliente, guardado.
//
// ══ POR QUÉ ESTO NO ES UNA COMODIDAD ═══════════════════════════════════════
//
// Parece una función de conveniencia —no volver a teclear el número— y en
// realidad es una función de seguridad. Un formulario en blanco delante de
// alguien apurado es donde un dígito cambiado manda el dinero a otra persona,
// y una transferencia bancaria emitida no se deshace pidiéndolo por favor.
//
// Guardar el destino UNA vez, verificarlo UNA vez, y después elegirlo de una
// lista quita ese riesgo de todas las veces siguientes.
//
// ══ LA COPIA CONGELADA ═════════════════════════════════════════════════════
//
// Cuando se pide un retiro, la solicitud se lleva una COPIA de los datos del
// beneficiario, no su id. Si mañana el cliente edita el beneficiario, el
// retiro que ya se pidió tiene que seguir diciendo a dónde se mandó de verdad.
// Un histórico que cambia cuando cambia otra tabla no es un histórico.
//
// ══ EL TAMIZ ═══════════════════════════════════════════════════════════════
//
// El titular de una cuenta bancaria de destino no pasó por Genesis: es un
// nombre que escribió el cliente. Se tamiza contra la lista de sanciones AL
// GUARDARLO (lib/sanciones.js). Sin lista cargada no se guarda —no poder
// mirar es un no— y con una coincidencia fuerte tampoco: queda una alerta
// para cumplimiento y al cliente se le dice que ese destino necesita revisión,
// sin decirle contra qué chocó.

const { Beneficiario, Usuario, AlertaSancion } = require('../models');
const sanciones = require('../lib/sanciones');
const V = require('../lib/validar');

/** Lo que se enseña de vuelta. El número de cuenta va ENMASCARADO: alcanza
 *  para reconocerlo y no alcanza para copiarlo desde una pantalla ajena. */
function pintarBeneficiario(b) {
  const n = b.numero || '';
  return {
    id: String(b._id),
    alias: b.alias, tipo: b.tipo, moneda: b.moneda,
    gidDestino: b.gidDestino || '',
    banco: b.banco || '', titular: b.titular || '', pais: b.pais || '',
    numero: n ? `···${n.slice(-4)}` : '',
    creado: b.creado,
  };
}

/**
 * Tamiza un nombre y contesta por el cliente si no pasa. Devuelve true si
 * pasa. Deja la alerta escrita cuando choca fuerte.
 */
async function pasaTamiz(res, { gid, nombre, contexto }) {
  const { veredicto, detalle } = sanciones.veredictoNombre(nombre);
  if (veredicto === 'sin-tamiz') {
    console.error(`[sanciones] ${contexto} de ${gid} sin tamizar: no hay lista cargada. Se cierra la puerta.`);
    res.status(503).json({
      error: 'Ahora mismo no se puede comprobar ese destino. No es culpa tuya: probá más tarde.',
      codigo: 'SIN_TAMIZ',
    });
    return false;
  }
  if (veredicto === 'revision') {
    try {
      await AlertaSancion.create({ gid, contexto, nombre, detalle: {
        fuertes: detalle.fuertes, posibles: detalle.posibles,
        coincidencias: detalle.coincidencias.slice(0, 10),
      } });
    } catch (e) {
      console.error(`[sanciones] no se pudo guardar la alerta: ${e.message}`);
    }
    console.error(`[sanciones] ${contexto} de ${gid}: coincidencia FUERTE (${detalle.fuertes}). Queda en revisión.`);
    res.status(403).json({
      error: 'Ese destino necesita una revisión de cumplimiento antes de poder usarse. Operaciones te va a contactar.',
      codigo: 'DESTINO_EN_REVISION',
    });
    return false;
  }
  return true;
}

// ── GET /beneficiarios ──────────────────────────────────────────────────────
async function listar(req, res) {
  try {
    const docs = await Beneficiario.find({ gid: req.usuario.gid }).sort({ creado: -1 });
    return res.json({ beneficiarios: docs.map(pintarBeneficiario) });
  } catch (e) {
    console.error(`[beneficiarios] no se pudieron listar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer la lista.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /beneficiarios ─────────────────────────────────────────────────────
// { alias, tipo, moneda, ... } — 'interno' pide gidDestino; 'bancario' pide
// banco, titular y número.
const crear = V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  const alias = V.texto(b.alias, { campo: 'alias', max: 60, obligatorio: true, etiqueta: 'un nombre para reconocerlo' });
  const tipo = V.opcion(b.tipo, ['interno', 'bancario'], { campo: 'tipo', etiqueta: 'el tipo de destino' });
  const cod = V.moneda(b.moneda);

  const doc = { gid: req.usuario.gid, alias, tipo, moneda: cod };

  try {
    if (tipo === 'interno') {
      const destino = V.gid(b.gidDestino, { campo: 'gidDestino', etiqueta: 'el Genesis ID de la persona' });
      if (destino === req.usuario.gid) {
        return res.status(400).json({ error: 'Ese sos vos.', codigo: 'DESTINO_ES_ORIGEN', campo: 'gidDestino' });
      }
      /* Se comprueba AHORA que existe y está verificado, no cuando se mande el
         dinero: guardar un destino que no puede recibir es guardar una
         decepción para más tarde, cuando la persona ya cree que lo tiene
         resuelto. Una identidad verificada por Genesis ya pasó su tamiz. */
      const otro = await Usuario.findOne({ gid: destino });
      if (!otro || otro.verificada !== true) {
        return res.status(400).json({
          error: 'Esa cuenta no puede recibir transferencias.', codigo: 'DESTINO_NO_APTO', campo: 'gidDestino',
        });
      }
      doc.gidDestino = destino;
    } else {
      doc.banco = V.texto(b.banco, { campo: 'banco', max: 120, obligatorio: true, etiqueta: 'el banco' });
      doc.titular = V.texto(b.titular, { campo: 'titular', max: 120, obligatorio: true, etiqueta: 'el titular de la cuenta' });
      doc.numero = V.numeroCuenta(b.numero);
      doc.swift = V.swift(b.swift);
      doc.pais = V.texto(b.pais, { campo: 'pais', max: 60, etiqueta: 'el país' });
      if (!await pasaTamiz(res, { gid: req.usuario.gid, nombre: doc.titular, contexto: 'beneficiario' })) return;
    }

    const creado = await Beneficiario.create(doc);
    return res.json({ beneficiario: pintarBeneficiario(creado) });
  } catch (e) {
    // Un error de ENTRADA no es un «no se pudo»: sube a conEntrada, que lo
    // contesta como 400 con su campo.
    if (e instanceof V.ErrorDeEntrada) throw e;
    if (e?.code === 11000) {
      return res.status(400).json({ error: 'Ya tenés un destino con ese nombre.', codigo: 'ALIAS_REPETIDO', campo: 'alias' });
    }
    console.error(`[beneficiarios] no se pudo crear: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo guardar.', codigo: 'NO_SE_PUDO' });
  }
});

// ── DELETE /beneficiarios/:id ───────────────────────────────────────────────
const borrar = V.conEntrada(async (req, res) => {
  const id = V.id(req.params.id, { etiqueta: 'el destino' });
  try {
    // El filtro lleva el gid: sin eso, un id ajeno borraría el beneficiario de
    // otra persona. El id no es un permiso.
    const r = await Beneficiario.deleteOne({ _id: id, gid: req.usuario.gid });
    if (!r.deletedCount) return res.status(404).json({ error: 'Ese destino no existe.', codigo: 'NO_EXISTE' });
    return res.json({ borrado: true });
  } catch (e) {
    console.error(`[beneficiarios] no se pudo borrar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo borrar.', codigo: 'NO_SE_PUDO' });
  }
});

module.exports = { listar, crear, borrar, pintarBeneficiario, pasaTamiz };
