// Las ordenes por HTTP: colocar, listar las mias, cancelar.
//
// Este archivo es la aduana, no el motor: valida TODO lo que viene del
// cliente (mercado contra la tabla de la casa, wei bien formados, minimos,
// ordenKey) y recien entonces llama al motor. El motor confia en que lo que
// le llega ya paso por aqui — por eso aqui no se perdona nada.
//
// El userId sale SIEMPRE de la sesion (req.usuario, puesto por el middleware)
// y jamas del cuerpo: es lo que impide operar la cuenta de otro.

const { MERCADOS } = require('../lib/tokens');
const motor = require('../lib/motor');
const { Orden, Usuario } = require('../models');
const { esDeclarable } = require('../lib/preciosDeclarados');
const { referenciaDe } = require('../lib/referencia');
const guardaPrecio = require('../lib/guardaPrecio');

// Los minimos. Una orden de polvo no le sirve a nadie y si estorba: llena el
// libro de escalones que no mueven un wei, pinta velas de mentira jugando con
// cantidades ridiculas, y con el floor del redondeo hasta la comision le sale
// gratis. 10^12 wei son 0,000001 unidades — nadie que opere de verdad esta
// por debajo, y quien si lo esta, esta jugando con el libro.
const CANTIDAD_MINIMA = 10n ** 12n; // wei del activo
const NOTIONAL_MINIMO = 10n ** 12n; // wei de ORIGEN (solo limite: a mercado no hay precio)

const ESTADOS = ['abierta', 'ejecutada', 'cancelada', 'rechazada'];

// Un wei bien formado: entero positivo en string. El tope de 40 digitos es de
// cordura (10^40 wei = 10^22 unidades, mas que cualquier emision): un numero
// mas largo no es una orden, es un intento de hacer sudar al BigInt.
const esWei = (v) => typeof v === 'string' && /^[0-9]{1,40}$/.test(v);

function malo(res, codigo, mensaje) {
  return res.status(400).json({ error: mensaje, codigo });
}

// Lo que se le devuelve al cliente de una orden: sus campos y nada mas.
function ordenJson(o) {
  return {
    id: String(o._id ?? o.id),
    mercado: o.mercado,
    lado: o.lado,
    tipo: o.tipo,
    precio: o.precio,
    cantidad: o.cantidad,
    resta: o.resta,
    estado: o.estado,
    ordenKey: o.ordenKey,
    en: o.en,
  };
}

// De un trato, al que lo causo solo le importan precio, cantidad y lado. Las
// contrapartes NO viajan: quien esta al otro lado de tu orden no es asunto
// tuyo — un libro anonimo es parte de lo que hace sano un mercado chico.
function tratoJson(t) {
  return { precio: t.precio, cantidad: t.cantidad, lado: t.lado, en: t.en };
}

/* ── LA GUARDA DE PRECIO ──────────────────────────────────────────────────
   Una orden limite se mide contra la referencia del oro ANTES de tocar el
   motor (lib/guardaPrecio.js): pasado el aviso entra solo con `aceptoDesvio`,
   pasado el bloqueo no entra, y sin referencia en un mercado que la tiene
   tampoco. Es lo que habria parado la orden de 4365,3 AUKA tecleada en
   dolares. Devuelve la respuesta ya mandada (true) o false si la orden pasa.

   Se separa de `colocar` para poder probarla con una referencia fingida:
   `traerReferencia` es inyectable y por omision es la de referencia.js. */
async function guardar(res, { mercado, precio, aceptoDesvio }, traerReferencia = referenciaDe) {
  const conReferencia = guardaPrecio.mercadoConReferencia(mercado);
  let referenciaEnOrigen = null;
  let fuente = null;
  if (conReferencia) {
    let r = null;
    try { r = await traerReferencia(mercado); } catch { r = null; }
    referenciaEnOrigen = r && typeof r.enOrigen === 'number' ? r.enOrigen : null;
    fuente = r ? { fuente: r.fuente, en: r.en, rotulo: r.rotulo, usd: r.usd, origenUsd: r.origenUsd } : null;
  }
  const j = guardaPrecio.juzgar({ precio, referenciaEnOrigen, conReferencia, aceptoDesvio });
  const detalle = {
    desvioPct: j.desvioPct, referencia: j.referencia, referenciaFuente: fuente,
    avisoPct: j.avisoPct, bloqueoPct: j.bloqueoPct,
  };
  if (j.nivel === 'sinReferencia') {
    res.status(503).json({
      error: 'Ahora mismo no tenemos la referencia del oro para este mercado, y sin ella no se coloca una orden limite. Proba en unos minutos.',
      codigo: 'SIN_REFERENCIA_AHORA',
      ...detalle,
    });
    return true;
  }
  if (j.nivel === 'bloqueo') {
    const lado = j.desvioPct > 0 ? 'por encima' : 'por debajo';
    res.status(400).json({
      error: `El precio se aleja un ${Math.abs(j.desvioPct).toFixed(2)} % ${lado} de la referencia del oro, y la casa no acepta ordenes a mas de ${j.bloqueoPct} %. Revisa la unidad: el precio va en ORIGEN por unidad, no en dolares.`,
      codigo: 'PRECIO_DESVIADO',
      ...detalle,
    });
    return true;
  }
  if (j.nivel === 'aviso') {
    const lado = j.desvioPct > 0 ? 'por encima' : 'por debajo';
    res.status(400).json({
      error: `El precio se aleja un ${Math.abs(j.desvioPct).toFixed(2)} % ${lado} de la referencia del oro (mas del ${j.avisoPct} %). Si es lo que queres, confirmalo con aceptoDesvio: true.`,
      codigo: 'DESVIO_SIN_ACEPTAR',
      ...detalle,
    });
    return true;
  }
  return false;
}

/** POST /ordenes {mercado, lado, tipo, precio?, cantidad, ordenKey, aceptoDesvio?} */
async function colocar(req, res, next) {
  try {
    const { mercado, lado, tipo, precio, cantidad, ordenKey, aceptoDesvio } = req.body || {};

    if (!MERCADOS.includes(mercado)) {
      return malo(res, 'MERCADO_INVALIDO', 'Ese mercado no existe en esta casa.');
    }
    if (lado !== 'compra' && lado !== 'venta') {
      return malo(res, 'LADO_INVALIDO', "El lado tiene que ser 'compra' o 'venta'.");
    }
    if (tipo !== 'limite' && tipo !== 'mercado') {
      return malo(res, 'TIPO_INVALIDO', "El tipo tiene que ser 'limite' o 'mercado'.");
    }
    // La ordenKey es obligatoria: es lo unico que hace inofensivo el reintento
    // de un cliente con timeout. Un exchange que acepta ordenes sin sello de
    // idempotencia esta invitando a duplicarlas.
    if (typeof ordenKey !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(ordenKey)) {
      return malo(res, 'ORDENKEY_INVALIDA', 'Falta la ordenKey (8 a 100 caracteres: letras, numeros, . _ : -).');
    }

    /* LA PUERTA DE IDONEIDAD, Y POR QUE TIENE QUE ESTAR ACA.
     *
     * La pantalla ya pide identidad verificada y descargo aceptado antes de
     * dejar operar sobre un valor negociable. Eso esta bien y no basta: una
     * puerta que solo vive en el navegador es un cartel, porque `POST /ordenes`
     * se puede llamar sin pasar por la pantalla. La que cuenta es esta.
     *
     * Solo aplica a los mercados de un token con precio declarado por la Junta
     * —hoy ONDK— porque es lo que hace del par un valor negociable y no un
     * activo de uso. El circuito de efectivo ya exigia lo mismo
     * (`fiatController.js`, `NO_VERIFICADA`); esta es la misma regla en el
     * camino que faltaba, con el mismo codigo para que el cliente ya sepa
     * tratarla.
     */
    const base = String(mercado).split('-')[0];
    if (esDeclarable(base)) {
      const yo = await Usuario.findById(req.usuario.id).lean();
      if (!yo || yo.verificada !== true) {
        return res.status(403).json({
          error: `Operar ${base} exige la identidad verificada en Genesis: es un valor negociable, no un activo de uso.`,
          codigo: 'NO_VERIFICADA',
        });
      }
    }
    if (!esWei(cantidad)) {
      return malo(res, 'CANTIDAD_INVALIDA', 'La cantidad tiene que ser un string de wei.');
    }
    if (BigInt(cantidad) < CANTIDAD_MINIMA) {
      return malo(res, 'ORDEN_MUY_CHICA', 'La cantidad minima es 0,000001 del activo.');
    }
    if (tipo === 'limite') {
      if (!esWei(precio) || BigInt(precio) === 0n) {
        return malo(res, 'PRECIO_INVALIDO', 'Una orden limite lleva precio: un string de wei de ORIGEN por unidad.');
      }
      const notional = (BigInt(cantidad) * BigInt(precio)) / 10n ** 18n;
      if (notional < NOTIONAL_MINIMO) {
        return malo(res, 'ORDEN_MUY_CHICA', 'El total de la orden es demasiado chico (minimo 0,000001 ORIGEN).');
      }
      // La guarda de precio, DESPUES de saber que el precio esta bien formado
      // y ANTES de la idempotencia y del motor: una orden desviada no se
      // guarda ni «repetida».
      if (await guardar(res, { mercado, precio, aceptoDesvio }, colocar.traerReferencia)) return;
    } else if (precio != null) {
      // Una orden de mercado con precio es un cliente confundido; aceptarla
      // ignorando el precio seria ejecutarle algo distinto de lo que cree
      // haber pedido.
      return malo(res, 'PRECIO_SOBRA', 'Una orden de mercado no lleva precio.');
    }

    // Idempotencia, camino rapido: si esta ordenKey ya coloco algo, se
    // devuelve ESO y no se toca el motor. La comprobacion que cierra toda
    // carrera vive dentro de la cola del motor; esta solo ahorra el viaje.
    const previa = await Orden.findOne({ userId: req.usuario.id, ordenKey });
    if (previa) {
      return res.json({ orden: ordenJson(previa), tratos: [], repetida: true });
    }

    const r = await motor.colocar({
      userId: req.usuario.id,
      mercado,
      lado,
      tipo,
      precio: tipo === 'limite' ? precio : null,
      cantidad,
      ordenKey,
    });

    if (r.repetida) {
      return res.json({ orden: ordenJson(r.orden), tratos: [], repetida: true });
    }
    res.status(201).json({ orden: ordenJson(r.orden), tratos: r.tratos.map(tratoJson) });
  } catch (e) {
    // Los errores de la casa traen codigo y status y el manejador de app.js
    // ya sabe contestarlos { error, codigo }; los accidentes van al log.
    next(e);
  }
}

/** GET /ordenes?estado=abierta — las mias, las mas nuevas primero. */
async function listar(req, res, next) {
  try {
    const filtro = { userId: req.usuario.id };
    if (req.query.estado != null) {
      if (!ESTADOS.includes(req.query.estado)) {
        return malo(res, 'ESTADO_INVALIDO', `El estado tiene que ser uno de: ${ESTADOS.join(', ')}.`);
      }
      filtro.estado = req.query.estado;
    }
    const ordenes = await Orden.find(filtro).sort({ en: -1, _id: -1 }).limit(100).lean();
    res.json({ ordenes: ordenes.map(ordenJson) });
  } catch (e) {
    next(e);
  }
}

/** DELETE /ordenes/:id — cancela y libera lo que quedaba en garantia. */
async function cancelar(req, res, next) {
  try {
    const orden = await motor.cancelar(String(req.params.id), req.usuario.id);
    res.json({ orden: ordenJson(orden) });
  } catch (e) {
    next(e);
  }
}

// `colocar.traerReferencia` es el punto de inyeccion de las pruebas: por
// omision es null y `guardar` usa referencia.js. Una prueba le cuelga una
// funcion que devuelve la referencia que quiera, sin red.
colocar.traerReferencia = undefined;

module.exports = { colocar, listar, cancelar, guardar };
