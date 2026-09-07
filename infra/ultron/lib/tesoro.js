/**
 * EL TESORO DE LA TARJETA, VIGILADO.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * 7-sep. José: «necesito poder recargar, que funcione recargar». Se miró en
 * producción y el motivo era de una línea: el tesoro tenía **6,27 USDT**.
 *
 * El circuito de la tarjeta es: la persona paga ORIGEN en nuestra cadena y el
 * tesoro suelta USDT en Polygon a CryptoMate. O sea que el tesoro **cobra en
 * ORIGEN y paga en USDT**: cada recarga lo vacía un poco más, y nada lo vuelve
 * a llenar solo. Se acaba siempre. La primera vez nadie se enteró hasta que
 * alguien intentó recargar y no pudo.
 *
 * Esto lo mira solo y avisa ANTES, que es la diferencia entre un aviso y un
 * parte de daños.
 *
 * ── POR QUÉ NO HACE FALTA NINGUNA LLAVE ─────────────────────────────────────
 * Un saldo en una cadena es público: se lee con la DIRECCIÓN, que no es un
 * secreto. Aquí no entra ninguna llave privada, ni la del tesoro ni ninguna
 * otra, y por eso esto puede vivir dentro de ULTRON sin ampliar lo que ULTRON
 * podría llegar a mover si alguien lo engañara. Mira y avisa; no toca nada.
 *
 * ── LO QUE NO HACE, A PROPÓSITO ─────────────────────────────────────────────
 * No rellena el tesoro. Rellenarlo es vender ORIGEN por USDT y mover dinero de
 * la casa, y eso lo decide una persona. Lo que hace es que esa persona se
 * entere a tiempo.
 */

const avisos = require('./avisos');

/* USDT en Polygon (PoS), el mismo contrato que usa el backend de la wallet. */
const USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const DECIMALES = 6;

/* ── VARIOS RPC, Y NO UNO ────────────────────────────────────────────────────
   El público de siempre —polygon-rpc.com— contestó hoy «API key disabled,
   tenant disabled»: dejó de ser gratis sin avisar. Un vigía que depende de UN
   servidor ajeno no vigila nada el día que ése se cae, y encima calla, que es
   lo peor que puede hacer un vigía. Se prueban en orden y se usa el primero
   que conteste; el propio de la casa va primero si está puesto. */
const RPCS = () => [
  process.env.POLYGON_RPC,
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.llamarpc.com',
  'https://rpc.ankr.com/polygon',
  'https://polygon-rpc.com',
].map((u) => String(u || '').trim()).filter(Boolean);
const DIRECCION = () => String(process.env.TESORO_POLYGON || '').trim();

/* El suelo. Por debajo de esto se avisa. 150 USDT no es un número mágico: es
   lo que cuestan unas cuantas recargas normales, o sea el margen para reponer
   sin prisa. Se cambia con la variable el día que el volumen cambie. */
const MINIMO = () => Number(process.env.TESORO_MINIMO_USDT || 150);
/* Y el gas. Sin POL el tesoro tiene USDT y no lo puede mover: mismo problema,
   otra moneda, y más fácil de pasar por alto. */
const MINIMO_GAS = () => Number(process.env.TESORO_MINIMO_POL || 1);

const hay = () => !!DIRECCION();

/** Una llamada JSON-RPC cruda: no hace falta traerse ethers para leer dos saldos. */
async function rpc(metodo, params) {
  let ultimo = null;
  for (const url of RPCS()) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }),
        signal: AbortSignal.timeout(12_000),
      });
      const d = await r.json();
      /* El error viene de dos formas según el servidor: `{error:{message}}` y
         `{error:"texto"}`. Leer solo la primera daba «undefined» por mensaje. */
      if (d.error) { ultimo = new Error(typeof d.error === 'string' ? d.error : (d.error.message || 'error de la cadena')); continue; }
      if (d.result === undefined) { ultimo = new Error('la cadena contestó sin resultado'); continue; }
      return d.result;
    } catch (e) { ultimo = e; }
  }
  throw ultimo || new Error('ningún servidor de Polygon contestó');
}

const aNumero = (hex, dec) => Number(BigInt(hex || '0x0')) / 10 ** dec;

/** Lo que hay ahora mismo. Nunca lanza: un tesoro que no se pudo leer se dice. */
async function estado() {
  const dir = DIRECCION();
  if (!dir) return { hay: false, porQue: 'falta TESORO_POLYGON' };
  try {
    /* balanceOf(address) = 0x70a08231 + la dirección rellenada a 32 bytes. */
    const dato = '0x70a08231' + '0'.repeat(24) + dir.toLowerCase().replace(/^0x/, '');
    const [usdtHex, polHex] = await Promise.all([
      rpc('eth_call', [{ to: USDT, data: dato }, 'latest']),
      rpc('eth_getBalance', [dir, 'latest']),
    ]);
    const usdt = aNumero(usdtHex, DECIMALES);
    const pol = aNumero(polHex, 18);
    return {
      hay: true, ok: true, direccion: dir,
      usdt, pol, minimo: MINIMO(), minimoGas: MINIMO_GAS(),
      bajo: usdt < MINIMO(), sinGas: pol < MINIMO_GAS(),
      /* Cuántas recargas de 25 USD aguanta. Es lo que de verdad se quiere
         saber: «180 USDT» no dice nada, «siete recargas» sí. */
      recargasQueAguanta: Math.floor(usdt / 25),
      en: new Date(),
    };
  } catch (e) {
    return { hay: true, ok: false, direccion: dir, porQue: String(e?.message || e).slice(0, 140) };
  }
}

/**
 * Mira y avisa si hace falta. La lo llama el vigía.
 *
 * El aviso va por la puerta única (`lib/avisos.js`), que ya se acuerda de lo
 * que mandó: con la misma `clave` no vuelve a molestar hasta que pase el
 * silencio. Un aviso cada minuto se convierte en ruido y el ruido se ignora,
 * que es como se pierde el aviso que sí importaba.
 */
async function mirarYAvisar() {
  const e = await estado();
  if (!e.hay) return e;

  if (!e.ok) {
    await avisos.avisar({
      clave: 'tesoro:ilegible', gravedad: 'leve',
      titulo: 'No se pudo leer el tesoro de la tarjeta',
      lineas: [`${e.porQue}.`, 'Mientras no se pueda leer, nadie sabe si las recargas van a entrar.'],
    }).catch(() => {});
    return e;
  }

  if (e.bajo) {
    await avisos.avisar({
      clave: 'tesoro:bajo', gravedad: 'grave',
      titulo: `Al tesoro de la tarjeta le quedan ${e.usdt.toFixed(2)} USDT`,
      lineas: [
        `Aguanta unas ${e.recargasQueAguanta} recargas de 25 dólares.`,
        'Cuando se acabe, las recargas dejan de completarse: el ORIGEN de la persona se cobra y el USDT no sale.',
        'Se rellena vendiendo el ORIGEN que el tesoro ya cobró y devolviendo el USDT a Polygon.',
        `Tesoro: ${e.direccion}`,
      ],
    }).catch(() => {});
  } else {
    /* Repuesto: se olvida el aviso para que la próxima vez vuelva a sonar. Sin
       esto, el silencio de «ya avisé» taparía la segunda caída. */
    avisos.olvidar('tesoro:bajo');
  }

  if (e.sinGas) {
    await avisos.avisar({
      clave: 'tesoro:sin-gas', gravedad: 'grave',
      titulo: `El tesoro se está quedando sin gas (${e.pol.toFixed(3)} POL)`,
      lineas: ['Con USDT y sin gas tampoco puede pagar: es el mismo problema con otra moneda.'],
    }).catch(() => {});
  } else {
    avisos.olvidar('tesoro:sin-gas');
  }
  return e;
}

/** Para el panel y para que ULTRON lo diga en palabras. */
function comoTexto(e) {
  if (!e?.hay) return 'El tesoro de la tarjeta no está configurado (falta TESORO_POLYGON), así que nadie lo está vigilando.';
  if (!e.ok) return `No se pudo leer el tesoro de la tarjeta: ${e.porQue}.`;
  return [
    `Tesoro de la tarjeta (${e.direccion}):`,
    `· ${e.usdt.toFixed(2)} USDT — aguanta unas ${e.recargasQueAguanta} recargas de 25 dólares`,
    `· ${e.pol.toFixed(3)} POL de gas`,
    e.bajo ? `⚠ POR DEBAJO del suelo de ${e.minimo} USDT: hay que reponer antes de que las recargas se paren.` : `Por encima del suelo de ${e.minimo} USDT.`,
    e.sinGas ? '⚠ Y casi sin gas: con USDT y sin POL tampoco puede pagar.' : '',
    'El tesoro cobra en ORIGEN y paga en USDT, así que se vacía solo con cada recarga: reponerlo es vender el ORIGEN cobrado y devolver USDT a Polygon.',
  ].filter(Boolean).join('\n');
}

module.exports = { hay, estado, mirarYAvisar, comoTexto, MINIMO, USDT };
