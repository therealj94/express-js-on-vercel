// Las velas: la memoria grafica de los tratos.
//
// Principio 2 del contrato: NI UN NUMERO INVENTADO. Una vela existe porque
// hubo tratos reales dentro de su marco, y por ninguna otra razon. No se
// fabrican velas vacias para rellenar huecos (un hueco es informacion: nadie
// opero), no se arrastra el cierre anterior como si fuera actividad, y el
// precio de referencia del oro jamas entra aqui — eso vive en referencia.js,
// aparte y rotulado.
//
// El mismo reparto que el motor: la AGREGACION es pura (t0De, agregar,
// resumen24hPuro — sin Mongo, sin reloj) para que pruebas/probar-velas.mjs la
// castigue sin levantar nada; la cascara (anotarTrato, resumen24h) pone los
// efectos alrededor.
//
// SOBRE EL ORDEN. El motor anota los tratos sin esperar (un trato consumado
// no se deshace porque la grafica tosio), asi que dos anotaciones del mismo
// mercado pueden estar en vuelo a la vez. La cola-promesa por mercado —el
// mismo patron del motor: un dyno, cero carreras— las serializa EN EL ORDEN
// EN QUE SE LLAMARON, que es el orden en que se calzaron; por eso `c` puede
// ser simplemente el precio del ultimo trato anotado, sin comparar relojes.
// El indice unico {mercado, marco, t0} de models/index.js es la red de abajo
// por si un dia corren dos procesos por error.

// La duracion de cada marco, en ms. Los cortes son en UTC y caen SIEMPRE en
// multiplos exactos de la duracion desde el epoch: la vela diaria arranca a
// medianoche UTC, la de hora en punto, la de 15 en :00/:15/:30/:45. Un corte
// que dependiera de la zona horaria del dyno pintaria velas distintas cada
// vez que Heroku mude la maquina.
const MARCOS = {
  '1m': 60_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
};

const DIA_MS = 86_400_000;

// Requires perezosos por la misma razon que en el motor: probar la agregacion
// pura no puede exigir Mongo.
let _modelos = null;
const losModelos = () => (_modelos ??= require('../models'));

// ════════════════════════════════════════════════════════════════════════════
// LA AGREGACION PURA
// ════════════════════════════════════════════════════════════════════════════

/** El arranque del marco al que pertenece un instante. Acepta Date o epoch ms.
 *  Falla cerrado: un marco desconocido o una fecha rota no se "arreglan" con
 *  un valor por omision — se lanzan, y el que llamo se entera. */
function t0De(marco, en) {
  const dur = MARCOS[marco];
  if (!dur) throw new Error(`marco desconocido: ${marco}`);
  const ms = en instanceof Date ? en.getTime() : Number(en);
  if (!Number.isFinite(ms) || ms < 0) throw new Error(`fecha invalida para una vela: ${en}`);
  return Math.floor(ms / dur) * dur;
}

/**
 * Suma UN trato a UNA vela (o la abre, si `vela` es null) y devuelve la vela
 * nueva sin tocar la de entrada. Todo el dinero en strings de wei y las
 * comparaciones con BigInt: `h` y `l` comparados como strings dirian que
 * "9" > "10".
 *
 * Es donde se decide o/h/l/c/v, asi que valida como aduana: un trato de
 * precio o cantidad cero no pinta velas (el motor no los fabrica, pero si un
 * dia aparece uno, mejor un error a una vela mentirosa), y una vela de otro
 * marco o de otro corte es un bug del que llama, no algo que se acomoda.
 */
function agregar(vela, trato, marco) {
  const t0 = t0De(marco, trato.en);
  const precio = BigInt(trato.precio);
  const cantidad = BigInt(trato.cantidad);
  if (precio <= 0n || cantidad <= 0n) {
    throw new Error('un trato sin precio o sin cantidad no pinta velas');
  }
  const p = precio.toString();

  if (!vela) {
    return {
      mercado: trato.mercado,
      marco,
      t0,
      o: p, // el primer trato del marco abre; nunca se rellena con un cierre ajeno
      h: p,
      l: p,
      c: p,
      v: cantidad.toString(),
    };
  }

  if (vela.mercado !== trato.mercado || vela.marco !== marco || vela.t0 !== t0) {
    throw new Error(
      `el trato no es de esta vela (${vela.mercado} ${vela.marco} ${vela.t0} vs ${trato.mercado} ${marco} ${t0})`
    );
  }

  return {
    ...vela,
    h: precio > BigInt(vela.h) ? p : vela.h,
    l: precio < BigInt(vela.l) ? p : vela.l,
    c: p, // los tratos llegan en el orden del calce: el ultimo ES el cierre
    v: (BigInt(vela.v) + cantidad).toString(),
  };
}

/**
 * El resumen de 24 horas a partir de velas de 1m: { ultimo, cambio24h, vol24h }.
 *
 *  - `ultimo` es el cierre de la vela mas nueva QUE EXISTA, aunque sea de hace
 *    tres dias: el ultimo precio real no caduca, lo que caduca es el volumen.
 *  - `cambio24h` compara contra el precio que estaba EN PIE hace 24 horas: el
 *    cierre de la ultima vela anterior a la ventana. Si el mercado es mas
 *    joven que un dia, contra la apertura de su primera vela — que es el
 *    primer precio real que existio. Sin tratos en la ventana el cambio es 0:
 *    el precio no se movio, y eso tambien es un dato.
 *  - `vol24h` suma SOLO las velas de la ventana. La vela que cruza el borde
 *    cuenta entera o nada; con marcos de 1m el error maximo es un minuto, y
 *    prorratear un volumen seria inventarse en que segundo cayo cada trato.
 *  - Sin velas: { null, null, '0' } — un guion honesto, no un cero de precio.
 */
function resumen24hPuro(velas, ahora) {
  const orden = [...velas].sort((a, b) => a.t0 - b.t0);
  if (orden.length === 0) {
    return { ultimo: null, cambio24h: null, vol24h: '0', alto24h: null, bajo24h: null };
  }

  const corte = ahora - DIA_MS;
  const ultimo = orden[orden.length - 1].c;

  let base = null;
  for (let i = orden.length - 1; i >= 0; i--) {
    if (orden[i].t0 < corte) {
      base = orden[i].c;
      break;
    }
  }

  /* El maximo y el minimo de las ultimas 24 h, que es lo que una casa de cambio
     enseña al lado del ultimo precio. Se sacan de las MISMAS velas de la
     ventana que el volumen — no de un rango de tiempo distinto — porque si no
     un dia diriamos «maximo 24 h» de un tramo que no son 24 h.

     Van en null cuando no hubo ni una vela dentro de la ventana: un mercado sin
     tratos en el dia no tiene maximo, y repetir ahi el ultimo precio seria
     inventar un rango que nadie opero. */
  let vol = 0n;
  let primeraDentro = null;
  let alto = null;
  let bajo = null;
  for (const v of orden) {
    if (v.t0 >= corte) {
      vol += BigInt(v.v);
      primeraDentro ??= v;
      const h = BigInt(v.h);
      const l = BigInt(v.l);
      if (alto === null || h > alto) alto = h;
      if (bajo === null || l < bajo) bajo = l;
    }
  }
  if (base === null) base = primeraDentro ? primeraDentro.o : ultimo;

  // El cambio con dos decimales, calculado entero: (u-b)·10000/b y dividir
  // por 100 recien al final. Pasar los wei por Number antes de restar
  // perderia precision justo donde se mide una diferencia chica.
  const u = BigInt(ultimo);
  const b = BigInt(base);
  const cambio24h = b > 0n ? Number(((u - b) * 10000n) / b) / 100 : null;

  return {
    ultimo, cambio24h, vol24h: vol.toString(),
    alto24h: alto === null ? null : alto.toString(),
    bajo24h: bajo === null ? null : bajo.toString(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// LA CASCARA
// ════════════════════════════════════════════════════════════════════════════

// La cola-promesa por mercado, calcada del motor. La cola guardada nunca queda
// rechazada (el .catch la sanea) para que un trato que no se pudo anotar no
// atasque las velas del mercado entero.
const COLAS = new Map();
function encolar(mercado, tarea) {
  const cola = COLAS.get(mercado) ?? Promise.resolve();
  const turno = cola.then(() => tarea());
  COLAS.set(mercado, turno.catch(() => {}));
  return turno;
}

/**
 * Anota un trato consumado en las velas 1m/15m/1h/1d de su mercado.
 *
 * Leer-agregar-escribir, serializado por la cola: dentro de un proceso no hay
 * carrera posible. Si aun asi el create choca con el indice unico (dos
 * procesos por error), se relee y se agrega sobre lo que gano — el trato no
 * se pierde ni se cuenta dos veces. Si algo falla de verdad, se lanza: el
 * motor ya decidio que un fallo de velas se anota en el log y no deshace el
 * trato, pero fingir que se anoto seria dejar un hueco mudo en la grafica.
 */
async function anotarTrato(trato) {
  if (!trato || typeof trato.mercado !== 'string' || !trato.mercado) {
    throw new Error('un trato sin mercado no se puede anotar');
  }
  return encolar(trato.mercado, async () => {
    const { Vela } = losModelos();
    for (const marco of Object.keys(MARCOS)) {
      const t0 = t0De(marco, trato.en);
      const llave = { mercado: trato.mercado, marco, t0 };
      const actual = await Vela.findOne(llave).lean();
      if (actual) {
        const nueva = agregar(actual, trato, marco);
        await Vela.updateOne(llave, { $set: { h: nueva.h, l: nueva.l, c: nueva.c, v: nueva.v } });
        continue;
      }
      try {
        await Vela.create(agregar(null, trato, marco));
      } catch (e) {
        if (e.code !== 11000) throw e;
        const ganadora = await Vela.findOne(llave).lean();
        if (!ganadora) throw e; // choco con algo que ya no esta: eso si es un accidente
        const nueva = agregar(ganadora, trato, marco);
        await Vela.updateOne(llave, { $set: { h: nueva.h, l: nueva.l, c: nueva.c, v: nueva.v } });
      }
    }
  });
}

/**
 * El resumen 24h de un mercado, leyendo velas de 1m: la ventana entera mas la
 * ultima vela anterior a ella (el precio en pie hace 24h). Con 1m son a lo
 * sumo 1.441 documentos y el indice {mercado, marco, t0} sirve las dos
 * consultas sin recorrer nada.
 */
async function resumen24h(mercado) {
  const { Vela } = losModelos();
  const ahora = Date.now();
  const corte = ahora - DIA_MS;
  const [previa, ventana] = await Promise.all([
    Vela.findOne({ mercado, marco: '1m', t0: { $lt: corte } }).sort({ t0: -1 }).lean(),
    Vela.find({ mercado, marco: '1m', t0: { $gte: corte } }).lean(),
  ]);
  return resumen24hPuro(previa ? [previa, ...ventana] : ventana, ahora);
}

module.exports = { MARCOS, t0De, agregar, resumen24hPuro, anotarTrato, resumen24h };
