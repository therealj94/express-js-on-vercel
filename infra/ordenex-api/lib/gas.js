// La billetera que le paga el gas a las direcciones de depósito.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ HACE FALTA, Y POR QUÉ ES EL PASO QUE MÁS CALLADAMENTE FALLA
//
// Una dirección con USDT y sin moneda nativa NO PUEDE MOVER NADA. El USDT es
// un token: transferirlo cuesta gas, y el gas se paga en POL, BNB o ETH — no
// en USDT. Así que antes de barrer hay que mandarle a esa dirección lo justo
// para una transferencia.
//
// Y es el paso que peor se ve cuando falla, porque NO ROMPE NADA VISIBLE: los
// depósitos se siguen acreditando, la persona ve su saldo, la pantalla dice lo
// que tiene que decir. Lo único que pasa es que el dinero deja de juntarse en
// la billetera única. Se descubre mirando un saldo que no sube, o sea tarde.
// Por eso la alarma de este archivo avisa ANTES de quedarse seca, y por eso el
// aviso se mide en «barridos que quedan» y no en monedas.
//
// ══════════════════════════════════════════════════════════════════════════
// LA BILLETERA DE GAS ES BARATA A PROPÓSITO
//
// Firma sola, cada pocos minutos, sin que ningún humano apruebe nada. Eso
// significa que su llave está caliente y no hay forma de que no lo esté. El
// diseño lo acepta y compensa por el lado del valor: esta billetera lleva
// monedas sueltas para gas y nada más. Si se la llevan, se pierde el gas de
// unos días; el fondo vive en la billetera única, que puede estar quieta y con
// firma de dos personas.
//
// ══════════════════════════════════════════════════════════════════════════
// EL FONDEO SE SESGA HACIA EL EXCESO, Y EL MOTIVO NO ES EL DINERO
//
// Fondear de más deja polvo nativo en la dirección: unos céntimos que no se
// pierden del todo (los aprovecha el barrido siguiente de esa misma dirección).
// Fondear de menos no quema gas —el nodo rechaza la transferencia— pero obliga
// a una segunda vuelta, y una vuelta más es MÁS TIEMPO con el dinero fuera de
// la billetera única.
//
// Y ese tiempo es exactamente lo que un robo de la semilla se lleva:
//
//     en riesgo ≈ (depósitos por minuto × ticket medio) × latencia del barrido
//
// O sea que el margen de gas y el intervalo del barrido NO son parámetros de
// rendimiento: son parámetros de seguridad. Un fondeo corto no cuesta gas,
// cuesta exposición.

const { Wallet, parseUnits, formatEther } = require('ethers');
// Se guarda el MODULO y no la funcion suelta: `const { proveedorDe } = ...`
// captura la referencia al importar, y entonces no hay forma de ponerle
// enfrente una cadena fingida sin salir a las redes de verdad. Un modulo que
// mueve dinero y no se puede probar sin gastar gas no se prueba, y este tiene
// que estar probado ANTES de que la billetera tenga un centavo.
const proveedores = require('./proveedores');
const { REDES } = proveedores;

/**
 * La dirección de la billetera de gas. Vive en lib/billeteras.js, con las
 * otras dos y con las retiradas, para que haya UN solo sitio donde mirar
 * cuál es cada una.
 *
 * Se comprueba contra la llave del entorno al cargar: una ORDENEX_GAS_KEY
 * perfectamente válida pero de otra billetera fondearía direcciones con el
 * dinero de otro entorno, y ese fallo no se ve hasta que alguien cuadra
 * saldos semanas después. Mismo espíritu que cadena5550.js:196-200.
 *
 * OJO CON LA ANTERIOR. La de antes del 4 de septiembre está COMPROMETIDA: un
 * bot se llevó 15 USDT un bloque después de que llegaran. Si alguien vuelve a
 * poner aquella llave, esta comprobación la rechaza — que es exactamente para
 * lo que existe.
 */
const { GAS: DIRECCION_GAS } = require('./billeteras');

/**
 * Cuánto se multiplica el precio del gas del momento al calcular el fondeo.
 *
 * Entre que el gas sale y el barrido firma pasan segundos o una vuelta entera,
 * y el precio se mueve. El margen cubre ese hueco. Los números salen de lo
 * medido el 3 de septiembre: Polygon llega a picos de 30×, pero cubrir un pico
 * de 30× en cada fondeo sería tirar dinero — 3× cubre la operación normal y un
 * pico grande simplemente pospone ese barrido, que es lo correcto.
 */
const MARGEN_PRECIO = { 137: 3n, 56: 15n, 1: 2n };
const MARGEN_DIVISOR = { 137: 1n, 56: 10n, 1: 1n }; // BSC: 1,5×

/**
 * El techo absoluto por fondeo, en unidades nativas. Un pico de precio no
 * puede vaciar la billetera de gas en una sola vuelta: si el fondeo calculado
 * lo supera, esa dirección se pospone y se dice.
 */
const TOPE_POR_ENVIO = {
  137: parseUnits(process.env.ORDENEX_GAS_TOPE_POLYGON || '5', 18),
  56: parseUnits(process.env.ORDENEX_GAS_TOPE_BSC || '0.01', 18),
  1: parseUnits(process.env.ORDENEX_GAS_TOPE_ETHEREUM || '0.01', 18),
};

/** Techo de gas cuando el nodo no quiere estimar. Ver `cuantoHaceFalta`. */
const TECHO_GAS = 90000n;

/**
 * Cuántos fondeos de aviso quedan. Se expresa en BARRIDOS y no en monedas
 * porque «0,05 ETH» no le dice nada a nadie y «quedan 40 barridos» sí — y
 * además se ajusta solo cuando el gas sube, sin que nadie toque un número.
 */
const BARRIDOS_AVISO = Number(process.env.ORDENEX_GAS_AVISO_BARRIDOS || 200);
const BARRIDOS_CRITICO = Number(process.env.ORDENEX_GAS_CRITICO_BARRIDOS || 50);

const llave = () => (process.env.ORDENEX_GAS_KEY || '').trim();

function fallo(codigo, mensaje) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  return e;
}

// ── La llave, comprobada contra su dirección ────────────────────────────────
let cargado = null;
function cargar() {
  const k = llave();
  if (cargado && cargado.k === k) return cargado;
  const c = { k, billetera: null, motivo: null };
  if (!k) {
    c.motivo = 'falta ORDENEX_GAS_KEY';
  } else {
    try {
      const w = new Wallet(k);
      if (w.address !== DIRECCION_GAS) {
        // La llave es válida pero es de OTRA billetera. Fondear con ella
        // gastaría el dinero de un entorno distinto, y eso no se descubre
        // hasta que alguien cuadra saldos semanas después.
        c.motivo = `la ORDENEX_GAS_KEY no es la de ${DIRECCION_GAS}`;
      } else {
        c.billetera = w;
      }
    } catch {
      // El mensaje no lleva la llave ni un trozo: un error se copia a un ticket.
      c.motivo = 'la ORDENEX_GAS_KEY no tiene forma de llave privada';
    }
  }
  cargado = c;
  return c;
}

const hayGas = () => Boolean(cargar().billetera);
const motivo = () => cargar().motivo;

// ── Un solo escritor por red ────────────────────────────────────────────────
//
// La billetera de gas es UNA llave firmando muchas veces seguidas. Sin
// serializar, dos fondeos piden el mismo nonce y uno reemplaza al otro — y el
// daño no son los céntimos duplicados, que van a una dirección nuestra: es que
// TODAS las direcciones que venían detrás en esa vuelta se quedan sin fondear.
// Un fondeo doble no cuesta un céntimo, cuesta una ronda entera de barrido.
//
// Esto serializa DENTRO de un proceso. Con dos dynos hace falta además un
// arriendo en Mongo, y va con el barrido — aquí no, porque una cola en memoria
// que finge cubrir dos procesos es peor que no tenerla: se confía en ella.
const colas = new Map();
function enFila(red, tarea) {
  const antes = colas.get(red) || Promise.resolve();
  const ahora = antes.then(tarea, tarea);
  // Se guarda una cadena que nunca rechaza, para que un fallo no rompa la fila.
  colas.set(red, ahora.then(() => {}, () => {}));
  return ahora;
}

/**
 * El precio del gas de esa red ahora mismo, en wei.
 *
 * Se pregunta a la cadena y no se usa una constante: es la lección que
 * cadena5550.js:118-121 ya dejó escrita («los 400 gwei fijos cobraban 4 veces
 * de más»). Devuelve null si no se pudo saber — y null NO es cero.
 */
async function precioDe(pv) {
  try {
    const f = await pv.getFeeData();
    const p = f.maxFeePerGas ?? f.gasPrice;
    return p && p > 0n ? p : null;
  } catch {
    return null;
  }
}

/**
 * Cuánto falta para que esa dirección pueda hacer UNA transferencia de USDT.
 *
 * @param plan {{a: string, contrato: string, cantidad: bigint}} el barrido real
 *   que se va a hacer. Se estima contra ÉL y no contra un caso genérico: un
 *   `transfer` a un destino con saldo cero cuesta unos 20.000 de gas más que a
 *   uno con saldo (el slot pasa de cero a no-cero). O sea que el PRIMER barrido
 *   hacia la billetera única es el caro y todos los demás son baratos, y una
 *   constante estaría mal en los dos sentidos según el día.
 */
async function cuantoHaceFalta(red, provisional, plan) {
  const id = Number(red);
  let pv;
  try {
    pv = await proveedores.proveedorDe(id);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const precio = await precioDe(pv);
  if (!precio) {
    return { ok: false, error: 'no se pudo leer el precio del gas' };
  }

  let limite = null;
  try {
    const abi = ['function transfer(address,uint256) returns (bool)'];
    const { Contract } = require('ethers');
    const c = new Contract(plan.contrato, abi, pv);
    const est = await c.transfer.estimateGas(plan.a, plan.cantidad, { from: provisional });
    limite = (est * 125n) / 100n; // +25%, como cadena5550.js:250-262
  } catch (e) {
    // El nodo no quiso estimar. Aquí la regla se PARTE POR RED a propósito:
    // en Polygon y BSC se usa un techo y se sigue, porque fondear de más ahí
    // cuesta céntimos. En Ethereum NO se adivina: se pospone. Adivinar en
    // Ethereum cuesta lo suficiente como para que esperar una vuelta sea mejor.
    if (id === 1) return { ok: false, error: `no se pudo estimar el gas: ${e.message}` };
    limite = TECHO_GAS;
  }

  const precioTope = (precio * (MARGEN_PRECIO[id] ?? 2n)) / (MARGEN_DIVISOR[id] ?? 1n);
  const necesario = limite * precioTope;

  let saldoNativo;
  try {
    saldoNativo = await pv.getBalance(provisional);
  } catch (e) {
    // Fail-closed: sin saber cuánto tiene, no se decide cuánto mandarle.
    return { ok: false, error: `no se pudo leer el saldo nativo: ${e.message}` };
  }

  const faltante = necesario > saldoNativo ? necesario - saldoNativo : 0n;
  return { ok: true, limite, precio, precioTope, necesario, saldoNativo, faltante };
}

/**
 * Deja esa dirección en condiciones de barrer, mandándole gas si le falta.
 *
 * SIEMPRE relee el saldo nativo, en cada vuelta, y nunca lleva memoria de «a
 * esta ya la fondeé». Una memoria no sobrevive a un reinicio ni a dos procesos,
 * y releer el saldo hace que un fondeo repetido sea, en el caso normal, un
 * no-op — que es una defensa mucho más barata que coordinarse.
 *
 * @returns {{ok, estado, hash?, faltante?, motivo?}}
 *   estado ∈ 'ya-tenia' | 'enviado' | 'pospuesto' | 'sin-fondos' | 'en-duda' | 'no-se-pudo'
 */
async function asegurarGas(red, provisional, plan) {
  const id = Number(red);
  const c = cargar();
  if (!c.billetera) return { ok: false, estado: 'no-se-pudo', motivo: c.motivo };

  const cuenta = await cuantoHaceFalta(id, provisional, plan);
  if (!cuenta.ok) return { ok: false, estado: 'no-se-pudo', motivo: cuenta.error };
  if (cuenta.faltante === 0n) return { ok: true, estado: 'ya-tenia', faltante: 0n };

  const tope = TOPE_POR_ENVIO[id];
  if (tope && cuenta.faltante > tope) {
    // Pico de precio. No se fondea: se dice y se espera. Sin este techo, un
    // pico de 30x vacía la billetera de gas en una vuelta y el barrido se para
    // del todo — que es mucho peor que barrer un rato más tarde.
    return { ok: false, estado: 'pospuesto', faltante: cuenta.faltante,
             motivo: `el fondeo (${formatEther(cuenta.faltante)}) supera el tope de esta red` };
  }

  return enFila(id, async () => {
    let pv;
    try { pv = await proveedores.proveedorDe(id); } catch (e) {
      return { ok: false, estado: 'no-se-pudo', motivo: e.message };
    }

    // El saldo de la propia billetera de gas, JUSTO antes de firmar. Si no
    // alcanza, no se intenta: una transacción que el nodo rechaza por fondos
    // no quema gas, pero consume una vuelta y ensucia el log.
    let mio;
    try { mio = await pv.getBalance(DIRECCION_GAS); } catch (e) {
      return { ok: false, estado: 'no-se-pudo', motivo: `no se pudo leer el saldo de gas: ${e.message}` };
    }
    if (mio < cuenta.faltante) {
      return { ok: false, estado: 'sin-fondos', faltante: cuenta.faltante,
               motivo: `la billetera de gas tiene ${formatEther(mio)} y hacen falta ${formatEther(cuenta.faltante)}` };
    }

    try {
      const tx = await c.billetera.connect(pv).sendTransaction({
        to: provisional, value: cuenta.faltante,
      });
      await tx.wait(1); // sin el saldo puesto, el barrido revertiría
      return { ok: true, estado: 'enviado', hash: tx.hash, faltante: cuenta.faltante };
    } catch (e) {
      // Un plazo agotado NO es un fallo: es una DUDA. Puede haber una
      // transacción viva en el mempool y reintentarla es como se mandan dos.
      // Es la doctrina de cadena5550.js:57-107 y aquí se hereda tal cual.
      const nuncaSalio = e?.code === 'INSUFFICIENT_FUNDS' || e?.code === 'NONCE_EXPIRED'
        || e?.code === 'CALL_EXCEPTION';
      return {
        ok: false,
        estado: nuncaSalio ? 'no-se-pudo' : 'en-duda',
        motivo: `${e?.code || ''} ${e?.message || e}`.trim(),
      };
    }
  });
}

/**
 * Cómo está la billetera de gas en cada red.
 *
 * Si el RPC no contesta, `ok:false` y `saldo:null` — nunca un cero de consuelo.
 * Un panel que pinta ceros cuando el nodo está caído es un panel que un día
 * jura que la billetera está vacía y manda a fondear lo que ya estaba.
 */
async function alarma() {
  const salida = [];
  for (const id of Object.keys(REDES).map(Number)) {
    if (id === 5550) continue; // la 5550 paga su gas en ORIGEN, no es de aquí
    const fila = { red: id, nombre: REDES[id].nombre, ok: false, saldo: null,
                   barridosQueQuedan: null, nivel: 'no-se-sabe' };
    try {
      const pv = await proveedores.proveedorDe(id);
      const [saldo, precio] = await Promise.all([pv.getBalance(DIRECCION_GAS), precioDe(pv)]);
      fila.ok = true;
      fila.saldo = formatEther(saldo);
      if (precio) {
        const porBarrido = TECHO_GAS * ((precio * (MARGEN_PRECIO[id] ?? 2n)) / (MARGEN_DIVISOR[id] ?? 1n));
        const quedan = porBarrido > 0n ? Number(saldo / porBarrido) : null;
        fila.barridosQueQuedan = quedan;
        fila.nivel = quedan === null ? 'no-se-sabe'
          : quedan <= BARRIDOS_CRITICO ? 'critico'
          : quedan <= BARRIDOS_AVISO ? 'aviso' : 'bien';
      }
    } catch (e) {
      fila.error = e.message;
    }
    salida.push(fila);
  }
  return salida;
}

/** El cuadro del panel. Nunca la llave; la dirección sí, que es pública. */
function estado() {
  const c = cargar();
  return { direccion: DIRECCION_GAS, configurada: Boolean(c.billetera), motivo: c.motivo };
}

module.exports = {
  DIRECCION_GAS, TECHO_GAS, MARGEN_PRECIO, TOPE_POR_ENVIO,
  BARRIDOS_AVISO, BARRIDOS_CRITICO,
  hayGas, motivo, cuantoHaceFalta, asegurarGas, alarma, estado,
  _adentro: { cargar, precioDe, enFila, olvidar: () => { cargado = null; colas.clear(); } },
};
