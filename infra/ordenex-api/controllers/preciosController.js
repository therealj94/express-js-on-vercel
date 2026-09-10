// GET /precio-declarado/:token — publico, sin sesion, igual que los mercados.
//
// La respuesta lleva `clase: 'declarado'` en la raiz aunque nadie se lo pida.
// Es el seguro contra el unico accidente grave que puede tener este endpoint:
// que un cliente pinte estas cifras al lado de las de /mercados y ONDK acabe
// pareciendo que cotiza. Un consumidor que no mira `clase` esta obligado a
// romperse a la vista, no a mentir en silencio.

const { esDeclarable, serie, vigenteDe, DECLARABLES } = require('../lib/preciosDeclarados');

/** GET /precio-declarado/:token
 *  → { token, clase:'declarado', moneda, vigente, serie: [...] }         */
async function declarado(req, res, next) {
  try {
    const token = String(req.params.token || '').toUpperCase();
    if (!esDeclarable(token)) {
      // 404 y no 400: para esta casa "el precio declarado de AUKA" no es una
      // peticion mal escrita, es una cosa que no existe. AUKA sigue un metal
      // que se mide.
      return res.status(404).json({
        error: 'Ese instrumento no lleva precio declarado.',
        codigo: 'NO_DECLARABLE',
        declarables: DECLARABLES,
      });
    }

    const lista = await serie(token);
    res.json({
      token,
      clase: 'declarado',
      moneda: 'USD',
      // null cuando la Junta todavia no ha declarado nada. El cliente pinta un
      // guion; no hay un cero de consuelo ni un precio de arranque supuesto.
      vigente: vigenteDe(lista),
      serie: lista,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { declarado };
