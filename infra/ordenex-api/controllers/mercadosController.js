// Los cuatro GET publicos del contrato: la lista de mercados, el libro, las
// velas y los tratos. Todo sin sesion — mirar el precio es gratis; la sesion
// se pide al operar.
//
// Lo que NUNCA sale por aqui: quien esta detras de una orden o de un trato.
// El libro se sirve agregado por precio (niveles, no ordenes) y el tape sin
// contrapartes — un libro anonimo es parte de lo que hace sano un mercado
// chico, igual que en ordenesController.

const { MERCADOS } = require('../lib/tokens');
const motor = require('../lib/motor');
const { MARCOS, resumen24h } = require('../lib/velas');
const { referenciaDe } = require('../lib/referencia');
const { Trato, Vela } = require('../models');

// El libro enseña 20 niveles por lado: mas que eso no cabe en una pantalla y
// solo engorda la respuesta del sondeo. Las velas se cortan en 500: son ~8
// horas de 1m o casi año y medio de diario — de sobra para cualquier grafica.
const NIVELES_LIBRO = 20;
const TOPE_VELAS = 500;
const TOPE_TRATOS = 50;

// El mercado viene en la URL: si no es de la casa, es un 404 — la ruta que
// pide no existe — y el mismo mensaje para todos, sin pistas de mas.
function mercadoInvalido(res) {
  return res.status(404).json({ error: 'Ese mercado no existe en esta casa.', codigo: 'MERCADO_INVALIDO' });
}

// ── GET /mercados ───────────────────────────────────────────────────────────
// Cache en memoria de 3 segundos, y se cachea LA PROMESA, no el resultado:
// corre un solo dyno y esta es la ruta que sondea todo el mundo — si veinte
// clientes llegan en el mismo tick, arman la lista UNA vez y los veinte
// esperan la misma promesa. Tres segundos no le mienten a nadie (las velas
// del frontend se refrescan cada 30) y le ahorran a Mongo 28 consultas por
// sondeo. Si el armado falla, la cache se vacia para que la proxima peticion
// reintente en vez de repartir el mismo error durante tres segundos.
const CACHE_MS = 3_000;
let cacheLista = { en: 0, promesa: null };

function armarLista() {
  return Promise.all(
    MERCADOS.map(async (mercado) => {
      const [r, referencia] = await Promise.all([resumen24h(mercado), referenciaDe(mercado)]);
      return {
        mercado,
        ultimo: r.ultimo,
        cambio24h: r.cambio24h,
        vol24h: r.vol24h,
        referencia,
      };
    })
  );
}

/** GET /mercados → [{ mercado, ultimo, cambio24h, vol24h, referencia }] */
async function listar(req, res, next) {
  try {
    if (!cacheLista.promesa || Date.now() - cacheLista.en >= CACHE_MS) {
      const promesa = armarLista();
      cacheLista = { en: Date.now(), promesa };
      promesa.catch(() => {
        if (cacheLista.promesa === promesa) cacheLista = { en: 0, promesa: null };
      });
    }
    res.json(await cacheLista.promesa);
  } catch (e) {
    next(e);
  }
}

// ── GET /mercados/:par/libro ────────────────────────────────────────────────

// De la lista viva de ordenes (ya ordenada mejor-precio-primero por el motor)
// a niveles [precio, cantidad]: se agrega por precio con BigInt — nunca
// comparando strings de wei, que dirian que "9" > "10" — y se corta en 20
// niveles. Las cantidades son la SUMA de las restas del nivel: cuantas
// ordenes lo forman y de quien son no es asunto de nadie.
function niveles(ordenes) {
  const out = [];
  for (const o of ordenes) {
    const ultimo = out[out.length - 1];
    if (ultimo && BigInt(ultimo[0]) === BigInt(o.precio)) {
      ultimo[1] = (BigInt(ultimo[1]) + BigInt(o.resta)).toString();
    } else {
      if (out.length === NIVELES_LIBRO) break;
      out.push([BigInt(o.precio).toString(), BigInt(o.resta).toString()]);
    }
  }
  return out;
}

/** GET /mercados/:par/libro → { compras: [[precio,cant]…20], ventas: […] } */
function libro(req, res, next) {
  try {
    const par = String(req.params.par);
    if (!MERCADOS.includes(par)) return mercadoInvalido(res);

    // El libro vivo sale del motor, no de la base: la base tiene las ordenes,
    // pero el orden de calce y las restas al segundo los tiene la memoria.
    // Mientras el motor este frio (arrancando o tras un MOTOR_ROTO) aqui no se
    // finge un libro vacio: un libro vacio dice "no hay ordenes" y eso seria
    // mentira — fail-closed tambien con la informacion.
    const libros = typeof motor.librosEnMemoria === 'function' ? motor.librosEnMemoria() : null;
    if (!libros) {
      return res
        .status(503)
        .json({ error: 'El libro aun no esta cargado; proba en un momento.', codigo: 'MOTOR_FRIO' });
    }

    const l = libros.get(par) ?? { compras: [], ventas: [] };
    res.json({ compras: niveles(l.compras), ventas: niveles(l.ventas) });
  } catch (e) {
    next(e);
  }
}

// ── GET /mercados/:par/velas ────────────────────────────────────────────────

// Un instante epoch ms bien formado: digitos y nada mas. Number() a secas
// aceptaria '1e9' o '0x10', y una fecha rara en una consulta publica no es un
// cliente nuestro.
function epocaMs(v) {
  if (typeof v !== 'string' || !/^[0-9]{1,15}$/.test(v)) return null;
  return Number(v);
}

/** GET /mercados/:par/velas?marco=1h&desde=&hasta= → [[t0,o,h,l,c,v]…] */
async function velas(req, res, next) {
  try {
    const par = String(req.params.par);
    if (!MERCADOS.includes(par)) return mercadoInvalido(res);

    const marco = String(req.query.marco || '');
    if (!MARCOS[marco]) {
      return res.status(400).json({
        error: `El marco tiene que ser uno de: ${Object.keys(MARCOS).join(', ')}.`,
        codigo: 'MARCO_INVALIDO',
      });
    }

    // El rango: epoch ms, ambos opcionales. Por omision, hasta ahora y desde
    // lo que quepa en el tope — la primera carga de una grafica no deberia
    // exigir que el cliente sepa calcular fechas.
    let hasta = Date.now();
    if (req.query.hasta != null) {
      hasta = epocaMs(req.query.hasta);
      if (hasta == null) {
        return res.status(400).json({ error: 'hasta tiene que ser epoch en ms.', codigo: 'RANGO_INVALIDO' });
      }
    }
    let desde = Math.max(0, hasta - TOPE_VELAS * MARCOS[marco]);
    if (req.query.desde != null) {
      desde = epocaMs(req.query.desde);
      if (desde == null) {
        return res.status(400).json({ error: 'desde tiene que ser epoch en ms.', codigo: 'RANGO_INVALIDO' });
      }
    }
    if (desde > hasta) {
      return res.status(400).json({ error: 'desde no puede ser posterior a hasta.', codigo: 'RANGO_INVALIDO' });
    }

    // Si el rango trae mas velas que el tope se sirven las MAS NUEVAS (por
    // eso el sort desciende y luego se da vuelta): una grafica quiere el
    // presente y pagina hacia atras con `hasta`. Los huecos son huecos — solo
    // viajan velas que existieron; rellenar seria inventar numeros.
    const docs = await Vela.find({ mercado: par, marco, t0: { $gte: desde, $lte: hasta } })
      .sort({ t0: -1 })
      .limit(TOPE_VELAS)
      .lean();
    docs.reverse();
    res.json(docs.map((v) => [v.t0, v.o, v.h, v.l, v.c, v.v]));
  } catch (e) {
    next(e);
  }
}

// ── GET /mercados/:par/tratos ───────────────────────────────────────────────

/** GET /mercados/:par/tratos → ultimos 50 [{ precio, cantidad, lado, en }] */
async function tratos(req, res, next) {
  try {
    const par = String(req.params.par);
    if (!MERCADOS.includes(par)) return mercadoInvalido(res);

    // El desempate por _id cubre dos tratos en el mismo ms — el _id de Mongo
    // crece con el tiempo, el mismo truco que usa cargarLibros.
    const docs = await Trato.find({ mercado: par })
      .sort({ en: -1, _id: -1 })
      .limit(TOPE_TRATOS)
      .lean();
    res.json(docs.map((t) => ({ precio: t.precio, cantidad: t.cantidad, lado: t.lado, en: t.en })));
  } catch (e) {
    next(e);
  }
}

module.exports = { listar, libro, velas, tratos };
