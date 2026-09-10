/* El libro mayor de AuCorp. Partida doble, en unidades mínimas enteras.
 *
 * ══ LA REGLA QUE SOSTIENE TODO ═════════════════════════════════════════════
 *
 * El saldo de un cliente NO ES UN CAMPO. Es la suma de los asientos que lo
 * tocan. En cuanto el saldo se guarda como número editable, existe un camino
 * —un bug, una carrera entre dos peticiones, una mano— por el que el saldo
 * cambia sin que haya un asiento que lo explique. Y cuando eso pasa, no hay
 * forma de saber de dónde salió la plata ni a quién se le quitó.
 *
 * Aquí un movimiento SIEMPRE es un asiento con dos lados que suman lo mismo.
 * Si no cuadra, no entra. No hay «arreglar el saldo a mano».
 *
 * ══ LOS TIPOS DE CUENTA Y HACIA DÓNDE CRECEN ═══════════════════════════════
 *
 *   activo     (lo que la casa tiene: el dinero en el banco corresponsal)
 *   gasto      (lo que la casa gastó)
 *        → crecen por el DEBE
 *
 *   pasivo     (lo que la casa DEBE: el saldo de cada cliente)
 *   patrimonio (lo que pusieron los dueños)
 *   ingreso    (las comisiones cobradas)
 *        → crecen por el HABER
 *
 * El saldo de un cliente es un PASIVO. Ese es el punto entero del negocio: el
 * dinero del cliente no es de la casa, la casa se lo debe. Ponerlo como activo
 * es el error contable que precede a gastarse el dinero de los clientes.
 *
 * ══ VARIAS MONEDAS ═════════════════════════════════════════════════════════
 *
 * Un asiento cuadra POR MONEDA, no en total. Sumar lempiras con dólares para
 * ver si «da cero» es inventarse un tipo de cambio dentro del libro. Un cambio
 * de divisa se anota como dos movimientos contra la cuenta de posición de
 * cambio, cada uno cuadrado en su propia moneda, y la ganancia o pérdida del
 * cambio queda visible en esa cuenta en vez de esconderse en un redondeo.
 */

const { moneda, aTexto } = require('./monedas');

/** Los tipos de cuenta y hacia qué lado crecen. */
const TIPOS = {
  activo: 'debe',
  gasto: 'debe',
  pasivo: 'haber',
  patrimonio: 'haber',
  ingreso: 'haber',
};

const CERO = 0n;

/** ¿Es un monto en unidades mínimas válido? Entero, en string, no negativo. */
function montoValido(v) {
  if (typeof v !== 'string' || !/^\d+$/.test(v)) return false;
  return true;
}

/**
 * Revisa un asiento y lo devuelve normalizado, o lanza con el motivo.
 *
 * Lanzar —y no devolver null— es a propósito: un asiento que no cuadra es un
 * error de programación en quien lo armó, no un dato de usuario mal escrito.
 * Tiene que hacer ruido en los registros, no perderse en un `if`.
 */
function armar(asiento) {
  const { ref, glosa, lineas } = asiento || {};
  if (!ref || typeof ref !== 'string') throw new Error('asiento sin referencia');
  if (!glosa || typeof glosa !== 'string') throw new Error('asiento sin glosa');
  if (!Array.isArray(lineas) || lineas.length < 2) {
    throw new Error('un asiento necesita al menos dos líneas');
  }

  const netos = new Map();   // moneda → debe - haber
  const limpias = lineas.map((l, i) => {
    const donde = `línea ${i + 1}`;
    if (!l || !l.cuenta) throw new Error(`${donde}: sin cuenta`);
    if (!TIPOS[l.tipo]) throw new Error(`${donde}: tipo de cuenta desconocido «${l.tipo}»`);
    if (!moneda(l.moneda)) throw new Error(`${donde}: moneda desconocida «${l.moneda}»`);

    const debe = l.debe || '0';
    const haber = l.haber || '0';
    if (!montoValido(debe) || !montoValido(haber)) {
      throw new Error(`${donde}: los montos van en unidades mínimas enteras, en string`);
    }
    const d = BigInt(debe);
    const h = BigInt(haber);
    // Una línea es de un lado o del otro. Las dos cosas a la vez es una línea
    // que se compensa sola: no mueve nada y esconde lo que quiso mover.
    if (d > CERO && h > CERO) throw new Error(`${donde}: no puede tener debe y haber a la vez`);
    if (d === CERO && h === CERO) throw new Error(`${donde}: no mueve nada`);

    const cod = l.moneda.toUpperCase();
    netos.set(cod, (netos.get(cod) || CERO) + d - h);
    return { cuenta: l.cuenta, tipo: l.tipo, moneda: cod, debe: d.toString(), haber: h.toString() };
  });

  // Cuadre POR MONEDA.
  for (const [cod, neto] of netos) {
    if (neto !== CERO) {
      throw new Error(
        `el asiento no cuadra en ${cod}: sobran ${aTexto((neto < CERO ? -neto : neto).toString(), cod)} ` +
        `en el ${neto > CERO ? 'debe' : 'haber'}`);
    }
  }

  return { ref, glosa, lineas: limpias, monedas: [...netos.keys()] };
}

/**
 * El saldo de una cuenta según los asientos, en unidades mínimas.
 *
 * Se recorre todo cada vez a propósito: mientras el libro es chico esto es
 * exacto y no puede desincronizarse. Cuando el volumen lo pida, la respuesta
 * NO es guardar el saldo suelto sino cerrar periodos —un asiento de apertura
 * con el saldo del corte, firmado— y sumar desde ahí. Eso sigue siendo
 * derivable y verificable; un campo suelto no.
 */
function saldo(asientos, cuenta, cod) {
  const codigo = String(cod || '').toUpperCase();
  let neto = CERO;
  let tipo = null;
  for (const a of asientos) {
    for (const l of a.lineas) {
      if (l.cuenta !== cuenta || l.moneda !== codigo) continue;
      tipo = tipo || l.tipo;
      neto += BigInt(l.debe) - BigInt(l.haber);
    }
  }
  if (!tipo) return '0';
  // Se devuelve en el sentido natural de la cuenta: el saldo de un cliente
  // (pasivo) se lee positivo cuando la casa le debe.
  return (TIPOS[tipo] === 'debe' ? neto : -neto).toString();
}

/**
 * LA COMPROBACIÓN QUE IMPORTA: ¿está el dinero de los clientes?
 *
 * Suma, por moneda, lo que la casa le debe a los clientes (pasivo) y lo que la
 * casa tiene guardado (activo). Devuelve la diferencia por moneda.
 *
 * Un descuadre negativo significa que se le debe a la gente más de lo que hay
 * en la cuenta del banco. Eso no es un problema de contabilidad: es dinero de
 * clientes que no está. Esta función existe para que eso se vea el mismo día y
 * no seis meses después.
 */
function reservas(asientos, cuentas) {
  const porMoneda = new Map();
  const toca = (cod) => {
    if (!porMoneda.has(cod)) porMoneda.set(cod, { debido: CERO, guardado: CERO });
    return porMoneda.get(cod);
  };
  for (const a of asientos) {
    for (const l of a.lineas) {
      const meta = cuentas ? cuentas[l.cuenta] : null;
      const mov = BigInt(l.haber) - BigInt(l.debe);
      if (l.tipo === 'pasivo' && (!meta || meta.cliente !== false)) {
        toca(l.moneda).debido += mov;
      } else if (l.tipo === 'activo' && (!meta || meta.custodia !== false)) {
        toca(l.moneda).guardado -= mov;
      }
    }
  }
  const salida = {};
  for (const [cod, { debido, guardado }] of porMoneda) {
    salida[cod] = {
      debido: debido.toString(),
      guardado: guardado.toString(),
      diferencia: (guardado - debido).toString(),
      cubierto: guardado >= debido,
    };
  }
  return salida;
}

module.exports = { TIPOS, armar, saldo, reservas };
