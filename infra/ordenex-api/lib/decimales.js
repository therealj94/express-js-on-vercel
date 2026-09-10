// El único sitio de la casa donde vive un número de decimales, y la única
// puerta por la que un monto cambia de escala.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE
//
// USDT no usa los mismos decimales en todas las cadenas. Comprobado leyendo
// cada contrato, no de memoria: Polygon 6, BNB Smart Chain 18, Ethereum 6.
// El libro de esta casa cuenta en 18 (models/index.js:8-11), así que un
// depósito de 100 USDT en Polygon leído como si fueran 18 se acreditaría como
// 0,0000000001 USDT. La persona depositó cien dólares y ve una millonésima.
// En el otro sentido —si alguna cuenta se hace al revés— se acreditarían cien
// billones, y ESE error no se recupera.
//
// Hoy ese error NO está ocurriendo: USDT no está en lib/tokens.js, el vigía
// solo mira la 5550 y vigiaCompras nunca toca el libro. Lo que hay es el
// hueco por el que iba a entrar, y este archivo lo tapa antes de abrirlo.
//
// ══════════════════════════════════════════════════════════════════════════
// LA REGLA DE ORO: LOS DECIMALES SE LEEN, NO SE SUPONEN
//
// La tabla ESPERADOS de abajo no es la verdad: es la HIPÓTESIS contra la que
// se comprueba la verdad al arrancar. Existe porque sin ella `decimals()` no
// se puede desmentir — un contrato equivocado (o suplantado) contestaría lo
// que le conviniera y no habría con qué discutirle.
//
// El contrato de esta misma casa ya resolvió esto y su solución es la que se
// copia: contratos-venta/contracts/VentaOrigen.sol:158-165 lee decimals() por
// staticcall en el constructor y revierte si no cuadra.
//
// ══════════════════════════════════════════════════════════════════════════
// DESACUERDO Y DUDA NO SON EL MISMO FALLO, Y SE TRATAN DISTINTO
//
// · DESACUERDO — la cadena dice 18 donde la tabla espera 6. No es una avería:
//   es la tabla mintiendo, o la dirección no siendo el contrato que creemos.
//   Ninguna espera lo arregla y todo lo que corriera contaría mal. Ahí SÍ se
//   muere el proceso, y el log lleva red, activo, contrato, esperado y dicho:
//   quien lo lea tiene que poder arreglarlo sin abrir un explorador.
//
// · DUDA — el RPC no contestó. Eso es una avería de red, y matar el proceso
//   por una avería de red es justo lo que prohíbe app.js:7-10 («el API se
//   levanta AUNQUE la cadena o Mongo no contesten»), con razón: en Heroku un
//   process.exit por un RPC lento entra en bucle de reinicios y el mensaje
//   que explica el problema se pierde en el ruido. El API se levanta y lo que
//   queda CERRADO es esa cadena — 503 en todo lo que la toque — y se reintenta.
//
// La diferencia importa porque cerrar una cadena protege exactamente igual
// que morirse: con listo(red) en false, de esa red no se mueve un centavo.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EL LIBRO GUARDA TODO EN 18
//
// Porque subir de escala es EXACTO y bajar no lo es. De 6 a 18 es multiplicar
// por 10^12: sin redondeo, sin pérdida, sin dirección que elegir. De 18 a 6 es
// una división con resto, y en qué dirección se redondea es una decisión de
// dinero.
//
// Y la asimetría manda porque el camino es asimétrico: un DEPÓSITO ocurre una
// vez y no se puede rehacer —si se acredita mal hay que reconstruirlo a mano
// contra la cadena—, mientras que un RETIRO se decide en el momento, con la
// persona mirando, y se le puede decir «esta red mueve de a 0,000001».
//
// La regla, entonces: el paso exacto donde no se puede volver atrás, y el paso
// con decisión donde se puede hablar.
//
// Hay dos razones más, y no son menores. VentaOrigen.sol:216-221 ya normaliza
// a 18 y divide al final («dividir antes es como se pierden centavos en
// silencio»), así que elegir otra cosa sería tener dos convenciones en el
// mismo circuito. Y todo lo demás de la casa ya está a 18 y es correcto ahí
// —motor.js, guardaPrecio.js, ordenesController.js, la web entera—, así que
// con canónico 18 ni una de esas líneas cambia. El diff más chico es el más
// seguro cuando lo que se toca es dinero.

const { Contract } = require('ethers');
const { PORSIMBOLO } = require('./tokens');

/** Los decimales del libro. No es un supuesto heredado: es LA decisión. */
const CANONICOS = 18;

// Las cadenas, por su id. Los nombres son para el log y el panel: un mensaje
// que dice «red 56» obliga a buscar qué red es justo cuando hay una urgencia.
const REDES = {
  5550: 'Orden Global',
  137: 'Polygon',
  56: 'BNB Smart Chain',
  1: 'Ethereum',
};

/**
 * Lo que se ESPERA de cada contrato. Los de la 5550 salen de lib/tokens.js
 * para que no haya dos listas que se separen: aquella es la tabla espejo y
 * ya avisa (tokens.js:5-9) de lo que pasa cuando una copia miente.
 *
 * USDT NO se añade a lib/tokens.js, y esto no es una preferencia de orden.
 * cadena5550.js:153 lee LOS QUINCE de golpe con un Promise.all que invalida
 * la lectura entera si uno falla; el contrato de USDT no existe en la 5550,
 * así que ese balanceOf trona, saldosDe() devuelve ok:false para TODA
 * dirección, y el vigía dejaría de acreditar ORIGEN, AUKA y los otros trece
 * —en silencio, con un log que solo diría «no se pudo leer»—. USDT vive aquí
 * y en su propia tabla de redes, y no toca aquella ni de lejos.
 */
const ESPERADOS = {
  5550: Object.fromEntries(
    Object.entries(PORSIMBOLO).map(([s, t]) => [
      s,
      { contrato: t.contrato || null, nativo: Boolean(t.nativo), decimales: 18 },
    ])
  ),
  137: {
    USDT: { contrato: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', nativo: false, decimales: 6 },
  },
  56: {
    USDT: { contrato: '0x55d398326f99059fF775485246999027B3197955', nativo: false, decimales: 18 },
  },
  1: {
    USDT: { contrato: '0xdAC17F958D2ee523a2206206994597C13D831ec7', nativo: false, decimales: 6 },
  },
};

const ABI_DECIMALES = ['function decimals() view returns (uint8)'];

// ── El estado, que empieza vacío a propósito ────────────────────────────────
//
// Nada está verificado hasta que verificar() corre. decimalesDe() lanza
// mientras tanto, y no devuelve 18 «mientras se comprueba»: un valor por
// omisión de 18 ES el bug de este archivo, reaparecido pero bendecido por el
// módulo que existía para impedirlo. La ausencia de dato tiene que doler.
const verificados = new Map(); // `${red}|${activo}` -> number
const porRed = new Map(); // red -> { listo, en, comprobados, desacuerdos, ilegibles }

function fallo(codigo, status, mensaje) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  e.status = status;
  return e;
}

const clave = (red, activo) => `${Number(red)}|${String(activo).toUpperCase()}`;

/**
 * Un entero no negativo en string o BigInt, de hasta 78 dígitos — el tope de
 * un uint256. Misma forma que ledger.js:70-77, con una diferencia deliberada:
 * aquí el cero SÍ se admite. Allá mover cero es ruido en los asientos; acá
 * convertir cero es aritmética, y cuantizar() tiene que poder devolverlo para
 * decir «esto no llega ni a la unidad más chica de esta red».
 */
function entero(monto, que = 'monto') {
  if (typeof monto === 'bigint') {
    if (monto < 0n) throw fallo('MONTO_INVALIDO', 400, `El ${que} no puede ser negativo.`);
    return monto;
  }
  if (typeof monto === 'string' && /^[0-9]{1,78}$/.test(monto)) return BigInt(monto);
  throw fallo('MONTO_INVALIDO', 400, `El ${que} tiene que ser un entero en string.`);
}

function ficha(red, activo) {
  const f = ESPERADOS[Number(red)]?.[String(activo).toUpperCase()];
  if (!f) {
    throw fallo('ACTIVO_DESCONOCIDO', 400,
      `No se conoce ${activo} en la red ${REDES[Number(red)] || red}.`);
  }
  return f;
}

/**
 * Los decimales verificados de un activo.
 *
 * LANZA si todavía no se verificó o si el activo no está en la tabla. Nunca
 * devuelve un valor por omisión: ver el comentario de `verificados`.
 */
function decimalesDe(red, activo) {
  ficha(red, activo); // que el activo exista es un error distinto de que no se haya mirado
  const d = verificados.get(clave(red, activo));
  if (d === undefined) {
    throw fallo('DECIMALES_SIN_VERIFICAR', 503,
      `Los decimales de ${activo} en ${REDES[Number(red)] || red} no se han comprobado contra la cadena.`);
  }
  return d;
}

/** ¿Se puede mover dinero de esta cadena ahora mismo? Sin argumento: todas. */
function listo(red) {
  if (red === undefined) {
    const redes = Object.keys(ESPERADOS);
    return redes.length > 0 && redes.every((r) => porRed.get(Number(r))?.listo === true);
  }
  return porRed.get(Number(red))?.listo === true;
}

/**
 * Crudo de la cadena → canónico del libro. `bruto * 10^(18 - d)`.
 *
 * SIEMPRE EXACTA: subir de escala es multiplicar. No hay redondeo, no hay
 * decisión y no hay resto que devolver. Es toda la razón de que el canónico
 * sea 18 y de que la conversión de entrada viva en el camino que no se puede
 * rehacer.
 */
function aCanonico(bruto, red, activo) {
  const v = entero(bruto, 'bruto');
  const d = decimalesDe(red, activo);
  return (v * 10n ** BigInt(CANONICOS - d)).toString();
}

/**
 * Canónico del libro → crudo de la cadena, CON su resto.
 *
 * Devolver las dos mitades es la decisión de diseño más importante de este
 * archivo, y es a propósito: en qué dirección se redondea es una decisión de
 * dinero, no de código, así que este módulo se NIEGA a tomarla. Devolver el
 * resto obliga a quien llama a mirarlo y a decidir qué hace con él.
 *
 * Una función que devolviera solo `nativo` estaría truncando el dinero de
 * alguien en silencio, y quien la llamara ni se enteraría — que es
 * exactamente la clase de fallo mudo que este archivo existe para no tener.
 */
function aNativo(canonico, red, activo) {
  const v = entero(canonico, 'canónico');
  const d = decimalesDe(red, activo);
  const factor = 10n ** BigInt(CANONICOS - d);
  return { nativo: (v / factor).toString(), resto: (v % factor).toString() };
}

/**
 * La rejilla de la red: el canónico más grande, menor o igual al pedido, que
 * esa cadena puede mover exactamente.
 *
 * Es aNativo() con la decisión ya tomada: FLOOR, en contra de la casa y a
 * favor de la persona, como todo cociente de esta casa (motor.js:32-38). El
 * polvo se lo queda ella en el libro; nunca la casa, y nunca hacia arriba —
 * redondear hacia arriba es entregar lo que nadie pagó, y ese error no se
 * recupera.
 *
 * `canonico: '0'` significa que el pedido no llega ni a la unidad más chica
 * que la red sabe mover. Quien llame tiene que tratarlo como un no, con la
 * cantidad mínima real en el mensaje — nunca como un envío de cero.
 */
function cuantizar(canonico, red, activo) {
  const v = entero(canonico, 'canónico');
  const d = decimalesDe(red, activo);
  const factor = 10n ** BigInt(CANONICOS - d);
  const nativo = v / factor;
  return {
    canonico: (nativo * factor).toString(),
    nativo: nativo.toString(),
    polvo: (v % factor).toString(),
  };
}

/** El paso más chico de esta red, en canónico. Para poder decirlo en pantalla. */
function rejilla(red, activo) {
  return (10n ** BigInt(CANONICOS - decimalesDe(red, activo))).toString();
}

/**
 * Le pregunta decimals() a cada contrato y lo compara con lo esperado.
 *
 * `proveedorDe` se INYECTA en vez de importarse para que esto se pueda probar
 * entero y sin red: la prueba pasa una cadena fingida que contesta 18 donde
 * debía decir 6 y comprueba que el arranque se muere.
 *
 * Cada contrato se mira POR SEPARADO, nunca con un Promise.all que se
 * invalide entero: un RPC que falla en un token no puede convertir en
 * «ilegible» a los otros catorce, que es justo el fallo que este archivo
 * describe en su tabla ESPERADOS.
 */
async function verificar({ proveedorDe, plazoMs = 12000, redes } = {}) {
  if (typeof proveedorDe !== 'function') {
    throw fallo('SIN_PROVEEDOR', 500, 'verificar() necesita proveedorDe(red).');
  }
  const objetivo = (redes || Object.keys(ESPERADOS)).map(Number);
  const salida = { ok: true, comprobados: [], desacuerdos: [], ilegibles: [] };

  // Las cadenas se miran a la vez, y dentro de cada una los contratos tambien.
  // No es por velocidad de lujo: en serie, cuatro RPC caidos son cuatro plazos
  // encadenados y el arranque se vuelve un minuto de nada. En paralelo, lo que
  // se espera es UN plazo. Cada contrato lleva su propio try/catch, asi que
  // esto NO es el Promise.all que invalida la lectura entera si uno falla —
  // ese es justo el fallo que este archivo describe en su tabla ESPERADOS.
  await Promise.all(objetivo.map(async (red) => {
    const activos = ESPERADOS[red] || {};
    const dela = { listo: true, en: new Date(), comprobados: [], desacuerdos: [], ilegibles: [] };

    let pv = null;
    let pvError = null;
    try {
      pv = await proveedorDe(red);
    } catch (e) {
      pvError = e?.message || String(e);
    }

    await Promise.all(Object.entries(activos).map(async ([activo, f]) => {
      // El nativo de una cadena no tiene contrato al que preguntarle: sus
      // decimales son los de la cadena y no hay nada que desmentir. Se anota
      // como comprobado para que el cuadro no mienta por omision.
      if (f.nativo) {
        verificados.set(clave(red, activo), f.decimales);
        dela.comprobados.push({ activo, decimales: f.decimales, nativo: true });
        salida.comprobados.push({ red, activo, decimales: f.decimales });
        return;
      }
      if (!pv) {
        dela.ilegibles.push({ activo, contrato: f.contrato, error: pvError || 'sin proveedor' });
        salida.ilegibles.push({ red, activo, contrato: f.contrato, error: pvError || 'sin proveedor' });
        dela.listo = false;
        return;
      }
      const enDesacuerdo = (dijo) => {
        dela.desacuerdos.push({ activo, contrato: f.contrato, esperado: f.decimales, dijo });
        salida.desacuerdos.push({ red, activo, contrato: f.contrato, esperado: f.decimales, dijo });
        dela.listo = false;
      };
      try {
        const c = new Contract(f.contrato, ABI_DECIMALES, pv);
        const dicho = Number(await conPlazo(c.decimals(), plazoMs));
        // Mas de 18 decimales no se puede subir a canonico sin dividir, y
        // dividir aqui seria perder dinero en la puerta de entrada. Antes que
        // redondear, no operar — es la regla de VentaOrigen.sol:164.
        if (!Number.isInteger(dicho) || dicho < 0 || dicho > CANONICOS) return enDesacuerdo(dicho);
        if (dicho !== f.decimales) return enDesacuerdo(dicho);
        verificados.set(clave(red, activo), dicho);
        dela.comprobados.push({ activo, decimales: dicho, nativo: false });
        salida.comprobados.push({ red, activo, decimales: dicho });
      } catch (e) {
        dela.ilegibles.push({ activo, contrato: f.contrato, error: e?.message || String(e) });
        salida.ilegibles.push({ red, activo, contrato: f.contrato, error: e?.message || String(e) });
        dela.listo = false;
      }
    }));

    porRed.set(red, dela);
  }));

  salida.ok = salida.desacuerdos.length === 0 && salida.ilegibles.length === 0;
  return salida;
}

function conPlazo(promesa, ms) {
  let reloj;
  const corte = new Promise((_, rechaza) => {
    reloj = setTimeout(() => rechaza(new Error(`no contestó en ${ms} ms`)), ms);
  });
  return Promise.race([promesa, corte]).finally(() => clearTimeout(reloj));
}

/**
 * El cuadro para /admin/estado y /salud, con la misma forma que
 * lib/configuracion.js:30-77. Un panel tiene que poder contestar «¿las
 * unidades están comprobadas?» ANTES del primer depósito raro, no después.
 */
function estado() {
  const redes = {};
  for (const red of Object.keys(ESPERADOS).map(Number)) {
    const d = porRed.get(red);
    redes[red] = {
      nombre: REDES[red] || String(red),
      verificada: Boolean(d?.listo),
      en: d?.en || null,
      comprobados: d?.comprobados || [],
      desacuerdos: d?.desacuerdos || [],
      ilegibles: d?.ilegibles || [],
    };
  }
  return { canonicos: CANONICOS, listo: listo(), redes };
}

/**
 * Lo que app.js hace con el resultado. Vive aquí y no allá para que la regla
 * —desacuerdo mata, duda cierra— esté escrita junto a su porqué y no repartida
 * en un arranque que nadie relee.
 *
 * Devuelve true si el proceso puede seguir. Si devuelve false, quien llama
 * tiene que morirse: no se llama a process.exit desde aquí para que este
 * módulo se pueda probar sin matar al que lo prueba.
 */
function puedeSeguir(r) {
  for (const d of r.desacuerdos) {
    console.error(
      `[decimales] DESACUERDO en ${REDES[d.red] || d.red}: ${d.activo} ${d.contrato} ` +
      `dice ${d.dijo} decimales y esta casa esperaba ${d.esperado}`
    );
  }
  for (const i of r.ilegibles) {
    console.error(
      `[decimales] no se pudo leer ${i.activo} en ${REDES[i.red] || i.red} (${i.contrato}): ${i.error}` +
      ` — esa cadena queda CERRADA hasta que se pueda comprobar`
    );
  }
  if (r.desacuerdos.length) {
    console.error('[decimales] el servicio NO arranca: contar mal el dinero es peor que no contar.');
    return false;
  }
  if (r.ilegibles.length) {
    // A propósito NO se muere: app.js:7-10 dice que el API se levanta aunque
    // la cadena no conteste, y cerrar la red protege igual que morirse.
    console.error('[decimales] el API sigue en pie; las cadenas sin comprobar contestan 503.');
  }
  return true;
}

module.exports = {
  CANONICOS, REDES, ESPERADOS,
  verificar, puedeSeguir, listo, decimalesDe, rejilla,
  aCanonico, aNativo, cuantizar, estado,
  // Solo para las pruebas: volver al estado de recién arrancado. Vive aquí y
  // no como export normal porque olvidar los decimales en producción sería
  // dejar a la casa sin saber contar; una prueba, en cambio, necesita poder
  // comprobar que ANTES de verificar nada se lanza — y reimportar el módulo no
  // sirve, porque el require de CommonJS devuelve siempre el mismo objeto.
  _adentro: { entero, ficha, clave, conPlazo, olvidar: () => { verificados.clear(); porRed.clear(); } },
};
