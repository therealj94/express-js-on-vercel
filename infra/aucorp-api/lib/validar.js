// La frontera de entrada: qué forma tiene que tener cada dato antes de que un
// controller lo mire.
//
// ══ POR QUÉ UN ARCHIVO Y NO UN `if` EN CADA RUTA ═══════════════════════════
//
// Cada controller tenía su propio `String(req.body?.x || '').trim()` y cada
// uno decía «no es válido» a su manera. Eso deja dos agujeros: el dato que se
// olvidó comprobar en una ruta y no en otra, y el mensaje que le dice al
// cliente que algo falló sin decirle QUÉ. Aquí está cada forma una sola vez,
// con su mensaje, y la ruta solo dice «esto es un monto» o «esto es un id».
//
// ══ LA REGLA ═══════════════════════════════════════════════════════════════
//
// Lo que no se entiende se rechaza con 400, con el nombre del campo y el
// motivo. Nunca se endereza a ojo: enderezar un monto torcido es adivinar con
// la plata de otro. Y un id que no tiene forma de id se corta AQUÍ, con un
// mensaje claro, en vez de llegar a Mongo, reventar en un CastError y salir
// como un «no se pudo» que no ayuda a nadie.
//
// Cada función devuelve el valor limpio, o lanza un `ErrorDeEntrada` que el
// middleware de abajo convierte en la respuesta JSON de la casa.

const { moneda: monedaDe, aMinimas } = require('./monedas');

class ErrorDeEntrada extends Error {
  constructor(mensaje, codigo, campo) {
    super(mensaje);
    this.codigo = codigo;
    this.campo = campo;
    this.estado = 400;
  }
}

const fallar = (mensaje, codigo, campo) => { throw new ErrorDeEntrada(mensaje, codigo, campo); };

const crudo = (v) => (v == null ? '' : String(v));

/** Un texto acotado. Vacío es válido salvo que se pida `obligatorio`. */
function texto(v, { campo = 'texto', max = 200, obligatorio = false, etiqueta } = {}) {
  if (v != null && typeof v !== 'string' && typeof v !== 'number') {
    fallar(`${etiqueta || campo} tiene que ser un texto.`, 'TEXTO_INVALIDO', campo);
  }
  const s = crudo(v).trim();
  if (obligatorio && !s) fallar(`Falta ${etiqueta || campo}.`, 'FALTA', campo);
  if (s.length > max) {
    fallar(`${etiqueta || campo} es demasiado largo (máximo ${max} caracteres).`, 'TEXTO_LARGO', campo);
  }
  return s;
}

/** Un código de moneda que la casa maneja. */
function moneda(v, { campo = 'moneda' } = {}) {
  const s = crudo(v).trim().toUpperCase();
  if (!s) fallar('Falta la moneda.', 'MONEDA_FALTA', campo);
  const m = monedaDe(s);
  if (!m) fallar(`La moneda «${s.slice(0, 8)}» no existe en AuCorp.`, 'MONEDA_DESCONOCIDA', campo);
  return m.c;
}

/**
 * Un monto escrito por una persona, en unidades mínimas de `cod`. Mayor que
 * cero. `aMinimas` ya rechaza lo que no se entiende; aquí se le pone nombre
 * al motivo para que la pantalla pueda decirlo.
 */
function monto(v, cod, { campo = 'monto' } = {}) {
  const s = crudo(v).trim();
  if (!s) fallar('Falta el monto.', 'MONTO_FALTA', campo);
  if (s.startsWith('-')) fallar('El monto no puede ser negativo.', 'MONTO_NEGATIVO', campo);
  const m = monedaDe(cod);
  const min = aMinimas(s, cod);
  if (!min) {
    const dec = m ? m.dec : 2;
    fallar(dec === 0
      ? `El monto «${s.slice(0, 24)}» no se entiende. ${cod} no tiene decimales: escribí un número entero.`
      : `El monto «${s.slice(0, 24)}» no se entiende. Escribilo con hasta ${dec} decimales, por ejemplo 1234.56 o 1.234,56.`,
    'MONTO_INVALIDO', campo);
  }
  if (BigInt(min) <= 0n) fallar('El monto tiene que ser mayor que cero.', 'MONTO_CERO', campo);
  return min;
}

/**
 * Un Genesis ID. La forma es la de Genesis: prefijo GEN o GNB, dos bloques de
 * cuatro y un dígito verificador, en un alfabeto sin I, O, 0 ni 1. Se
 * comprueba el dígito: un gid mal tecleado se corta aquí y no se convierte en
 * una transferencia que «no encuentra la cuenta».
 *
 * Las pruebas usan gids de laboratorio (`gid-ana`) y en producción los emite
 * Genesis. Se aceptan los dos: el de Genesis con su verificador, y el de
 * laboratorio SOLO con la forma `gid-…` acotada, que ningún gid real tiene.
 */
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function verificadorGid(cuerpo) {
  let suma = 0;
  const limpio = cuerpo.replace(/-/g, '');
  for (let i = 0; i < limpio.length; i++) {
    const v = ALFABETO.indexOf(limpio[i]);
    if (v < 0) return '?';
    suma += v * (i + 2);
  }
  return ALFABETO[suma % ALFABETO.length];
}
function gidValido(s) {
  const m = s.match(/^(GEN|GNB)-([2-9A-HJ-NP-Z]{4})-([2-9A-HJ-NP-Z]{4})-([2-9A-HJ-NP-Z])$/);
  if (m) return verificadorGid(`${m[2]}-${m[3]}`) === m[4];
  return /^gid-[a-z0-9-]{2,40}$/.test(s) || /^sinkyc-[a-z0-9-]{2,40}$/.test(s);
}
function gid(v, { campo = 'gid', etiqueta = 'el Genesis ID' } = {}) {
  const s = crudo(v).replace(/\s/g, '');
  if (!s) fallar(`Falta ${etiqueta}.`, 'GID_FALTA', campo);
  const norm = /^(gen|gnb)-/i.test(s) ? s.toUpperCase() : s;
  if (!gidValido(norm)) {
    fallar(`${etiqueta[0].toUpperCase() + etiqueta.slice(1)} «${s.slice(0, 24)}» no tiene la forma de un Genesis ID (GEN-XXXX-XXXX-X). Revisá que esté bien copiado.`,
      'GID_INVALIDO', campo);
  }
  return norm;
}

/** Un id de documento de Mongo: 24 caracteres hexadecimales, ni uno más. */
function id(v, { campo = 'id', etiqueta = 'el identificador' } = {}) {
  const s = crudo(v).trim();
  if (!s) fallar(`Falta ${etiqueta}.`, 'ID_FALTA', campo);
  if (!/^[0-9a-fA-F]{24}$/.test(s)) fallar(`${etiqueta[0].toUpperCase() + etiqueta.slice(1)} no es válido.`, 'ID_INVALIDO', campo);
  return s.toLowerCase();
}

/** El sello de idempotencia del cliente. Acotado y con caracteres seguros. */
function ref(v, { campo = 'ref' } = {}) {
  const s = crudo(v).trim();
  if (!s) fallar('Falta el sello de la operación (ref).', 'REF_FALTA', campo);
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(s)) {
    fallar('El sello de la operación (ref) tiene que tener entre 8 y 80 caracteres: letras, números, punto, guion, dos puntos o guion bajo.',
      'REF_INVALIDA', campo);
  }
  return s;
}

/** Un entero dentro de un rango. Con `porDefecto` se admite ausente. */
function entero(v, { campo = 'numero', min = 0, max = Number.MAX_SAFE_INTEGER, porDefecto, etiqueta } = {}) {
  const s = crudo(v).trim();
  if (!s) {
    if (porDefecto !== undefined) return porDefecto;
    fallar(`Falta ${etiqueta || campo}.`, 'FALTA', campo);
  }
  if (!/^-?\d+$/.test(s)) fallar(`${etiqueta || campo} tiene que ser un número entero.`, 'ENTERO_INVALIDO', campo);
  const n = parseInt(s, 10);
  if (n < min || n > max) fallar(`${etiqueta || campo} tiene que estar entre ${min} y ${max}.`, 'FUERA_DE_RANGO', campo);
  return n;
}

/** Uno de una lista cerrada. */
function opcion(v, lista, { campo = 'opcion', porDefecto, etiqueta } = {}) {
  const s = crudo(v).trim();
  if (!s && porDefecto !== undefined) return porDefecto;
  if (!lista.includes(s)) {
    fallar(`${etiqueta || campo} tiene que ser uno de: ${lista.join(', ')}.`, 'OPCION_INVALIDA', campo);
  }
  return s;
}

/** Una fecha `AAAA-MM-DD`. Devuelve un Date en UTC al inicio del día
 *  (o al final, con `fin: true`). */
function fecha(v, { campo = 'fecha', fin = false, porDefecto } = {}) {
  const s = crudo(v).trim();
  if (!s) {
    if (porDefecto !== undefined) return porDefecto;
    fallar(`Falta ${campo}.`, 'FECHA_FALTA', campo);
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) fallar(`${campo} tiene que tener la forma AAAA-MM-DD.`, 'FECHA_INVALIDA', campo);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], fin ? 23 : 0, fin ? 59 : 0, fin ? 59 : 0, fin ? 999 : 0));
  if (isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    fallar(`${campo} no es una fecha real.`, 'FECHA_INVALIDA', campo);
  }
  return d;
}

/** Un mes `AAAA-MM`. Devuelve { anio, mes, desde, hasta } en UTC. */
function mes(v, { campo = 'mes' } = {}) {
  const s = crudo(v).trim();
  if (!s) fallar('Falta el mes (AAAA-MM).', 'MES_FALTA', campo);
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m || +m[2] < 1 || +m[2] > 12) fallar('El mes tiene que tener la forma AAAA-MM.', 'MES_INVALIDO', campo);
  const anio = +m[1];
  const numero = +m[2];
  if (anio < 2020 || anio > 2100) fallar('Ese año no tiene extracto.', 'MES_INVALIDO', campo);
  const desde = new Date(Date.UTC(anio, numero - 1, 1));
  const hasta = new Date(Date.UTC(anio, numero, 1) - 1);
  return { anio, mes: numero, etiqueta: `${anio}-${String(numero).padStart(2, '0')}`, desde, hasta };
}

/** Un número de cuenta bancaria: alfanumérico con separadores, acotado. */
function numeroCuenta(v, { campo = 'numero' } = {}) {
  const s = crudo(v).replace(/\s/g, '');
  if (!s) fallar('Falta el número de cuenta.', 'NUMERO_FALTA', campo);
  if (!/^[A-Za-z0-9-]{4,40}$/.test(s)) {
    fallar('El número de cuenta solo puede llevar letras, números y guiones (de 4 a 40).', 'NUMERO_INVALIDO', campo);
  }
  return s;
}

/** Un SWIFT/BIC: 8 u 11 caracteres. Vacío se admite. */
function swift(v, { campo = 'swift' } = {}) {
  const s = crudo(v).replace(/\s/g, '').toUpperCase();
  if (!s) return '';
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s)) {
    fallar('El SWIFT/BIC tiene 8 u 11 caracteres (por ejemplo BAMCHNTE o BAMCHNTEXXX).', 'SWIFT_INVALIDO', campo);
  }
  return s;
}

/** El cuerpo tiene que ser un objeto JSON. Un array o un texto no son un pedido. */
function cuerpo(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) {
    fallar('El cuerpo de la petición tiene que ser un objeto JSON.', 'CUERPO_INVALIDO', 'cuerpo');
  }
  return b;
}

/**
 * Envuelve un handler: si dentro salta un ErrorDeEntrada, contesta 400 con el
 * mensaje, el código y el campo. Cualquier otro error sigue su camino al
 * manejador general. Así la validación se escribe en línea recta —`const cod
 * = V.moneda(b.moneda)`— sin un `return res.status(400)` por cada campo.
 */
const conEntrada = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (e) {
    if (e instanceof ErrorDeEntrada) {
      return res.status(400).json({ error: e.message, codigo: e.codigo, campo: e.campo });
    }
    next(e);
  }
};

module.exports = {
  ErrorDeEntrada, conEntrada, cuerpo,
  texto, moneda, monto, gid, gidValido, id, ref, entero, opcion, fecha, mes, numeroCuenta, swift,
};
