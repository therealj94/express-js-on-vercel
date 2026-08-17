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

const { Beneficiario, Usuario } = require('../models');
const { moneda } = require('../lib/monedas');

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

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
async function crear(req, res) {
  const alias = texto(req.body?.alias, 60);
  const tipo = texto(req.body?.tipo, 20);
  const cod = texto(req.body?.moneda, 3).toUpperCase();

  if (!alias) return res.status(400).json({ error: 'Ponele un nombre para reconocerlo.', codigo: 'ALIAS_FALTA' });
  if (!moneda(cod)) return res.status(400).json({ error: 'Esa moneda no existe.', codigo: 'MONEDA_DESCONOCIDA' });
  if (tipo !== 'interno' && tipo !== 'bancario') {
    return res.status(400).json({ error: 'Tipo de destino desconocido.', codigo: 'TIPO_INVALIDO' });
  }

  const doc = { gid: req.usuario.gid, alias, tipo, moneda: cod };

  try {
    if (tipo === 'interno') {
      const destino = texto(req.body?.gidDestino, 80);
      if (!destino) return res.status(400).json({ error: 'Falta a quién.', codigo: 'DESTINO_FALTA' });
      if (destino === req.usuario.gid) {
        return res.status(400).json({ error: 'Ese sos vos.', codigo: 'DESTINO_ES_ORIGEN' });
      }
      /* Se comprueba AHORA que existe y está verificado, no cuando se mande el
         dinero: guardar un destino que no puede recibir es guardar una
         decepción para más tarde, cuando la persona ya cree que lo tiene
         resuelto. */
      const otro = await Usuario.findOne({ gid: destino });
      if (!otro || otro.verificada !== true) {
        return res.status(400).json({
          error: 'Esa cuenta no puede recibir transferencias.', codigo: 'DESTINO_NO_APTO',
        });
      }
      doc.gidDestino = destino;
    } else {
      doc.banco = texto(req.body?.banco, 120);
      doc.titular = texto(req.body?.titular, 120);
      doc.numero = texto(req.body?.numero, 60);
      doc.swift = texto(req.body?.swift, 20);
      doc.pais = texto(req.body?.pais, 60);
      if (!doc.banco || !doc.titular || !doc.numero) {
        return res.status(400).json({
          error: 'Faltan el banco, el titular o el número de cuenta.', codigo: 'DATOS_FALTAN',
        });
      }
    }

    const creado = await Beneficiario.create(doc);
    return res.json({ beneficiario: pintarBeneficiario(creado) });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(400).json({ error: 'Ya tenés uno con ese nombre.', codigo: 'ALIAS_REPETIDO' });
    }
    console.error(`[beneficiarios] no se pudo crear: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo guardar.', codigo: 'NO_SE_PUDO' });
  }
}

// ── DELETE /beneficiarios/:id ───────────────────────────────────────────────
async function borrar(req, res) {
  try {
    // El filtro lleva el gid: sin eso, un id ajeno borraría el beneficiario de
    // otra persona. El id no es un permiso.
    const r = await Beneficiario.deleteOne({ _id: req.params.id, gid: req.usuario.gid });
    if (!r.deletedCount) return res.status(404).json({ error: 'No existe.', codigo: 'NO_EXISTE' });
    return res.json({ borrado: true });
  } catch (e) {
    console.error(`[beneficiarios] no se pudo borrar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo borrar.', codigo: 'NO_SE_PUDO' });
  }
}

module.exports = { listar, crear, borrar, pintarBeneficiario };
