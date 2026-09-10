/* Las monedas que AuCorp maneja, y sus decimales.
 *
 * ══ EL ERROR QUE ESTE ARCHIVO EXISTE PARA EVITAR ═══════════════════════════
 *
 * «Todas las monedas tienen dos decimales» es falso, y es la clase de falso
 * que no se nota hasta que alguien reclama.
 *
 *   · El peso chileno (CLP) tiene CERO. No existe el centavo de peso.
 *   · El guaraní (PYG) tiene CERO.
 *   · El dinar de Túnez tiene tres, y el yen japonés cero.
 *
 * Guardar CLP con dos decimales significa que 1.000 pesos se anotan como
 * 100000 «centavos» que no existen. Todo cuadra en la base y todo sale mal en
 * la pantalla y en la transferencia bancaria: el saldo se ve cien veces más
 * grande, o cien veces más chico, según por dónde entre.
 *
 * Por eso los decimales son un DATO de cada moneda y no una constante, y por
 * eso todo el dinero de esta casa se guarda en UNIDADES MÍNIMAS enteras —
 * centavos donde hay centavos, pesos enteros donde no los hay— en un string,
 * y se opera con BigInt.
 *
 * ══ POR QUÉ ENTEROS Y NO DECIMALES ═════════════════════════════════════════
 *
 * 0.1 + 0.2 no da 0.3 en coma flotante. En una calculadora da igual; en un
 * libro mayor, cada operación deja una viruta y al final del mes el balance no
 * cuadra por un céntimo que nadie sabe de dónde salió. Los enteros no tienen
 * ese problema porque no hay nada que redondear.
 *
 * ══ LO QUE ESTA LISTA NO DICE ══════════════════════════════════════════════
 *
 * Que una moneda esté aquí significa que el sistema sabe CONTARLA, no que
 * AuCorp pueda liquidarla en un banco de ese país. Eso depende de tener
 * corresponsal y licencia allí, y se decide moneda por moneda en `operativa`.
 * Confundir las dos cosas es prometer una transferencia a Buenos Aires porque
 * el peso argentino aparece en un desplegable.
 */

/** Las monedas, con su código ISO 4217, sus decimales reales y su casa. */
const MONEDAS = [
  // ── la moneda de referencia de la casa ────────────────────────────────────
  { c: 'USD', dec: 2, n: 'Dólar estadounidense', pais: 'Estados Unidos', simbolo: '$' },

  // ── Centroamérica y el Caribe ─────────────────────────────────────────────
  { c: 'HNL', dec: 2, n: 'Lempira', pais: 'Honduras', simbolo: 'L' },
  { c: 'GTQ', dec: 2, n: 'Quetzal', pais: 'Guatemala', simbolo: 'Q' },
  { c: 'CRC', dec: 2, n: 'Colón', pais: 'Costa Rica', simbolo: '₡' },
  { c: 'NIO', dec: 2, n: 'Córdoba', pais: 'Nicaragua', simbolo: 'C$' },
  { c: 'PAB', dec: 2, n: 'Balboa', pais: 'Panamá', simbolo: 'B/.' },
  { c: 'DOP', dec: 2, n: 'Peso dominicano', pais: 'República Dominicana', simbolo: 'RD$' },
  { c: 'BZD', dec: 2, n: 'Dólar beliceño', pais: 'Belice', simbolo: 'BZ$' },
  { c: 'JMD', dec: 2, n: 'Dólar jamaiquino', pais: 'Jamaica', simbolo: 'J$' },

  // ── Sudamérica ────────────────────────────────────────────────────────────
  { c: 'MXN', dec: 2, n: 'Peso mexicano', pais: 'México', simbolo: '$' },
  { c: 'COP', dec: 2, n: 'Peso colombiano', pais: 'Colombia', simbolo: '$' },
  { c: 'PEN', dec: 2, n: 'Sol', pais: 'Perú', simbolo: 'S/' },
  { c: 'BOB', dec: 2, n: 'Boliviano', pais: 'Bolivia', simbolo: 'Bs' },
  { c: 'BRL', dec: 2, n: 'Real', pais: 'Brasil', simbolo: 'R$' },
  { c: 'ARS', dec: 2, n: 'Peso argentino', pais: 'Argentina', simbolo: '$' },
  { c: 'UYU', dec: 2, n: 'Peso uruguayo', pais: 'Uruguay', simbolo: '$U' },
  { c: 'VES', dec: 2, n: 'Bolívar', pais: 'Venezuela', simbolo: 'Bs.' },
  // CERO DECIMALES, las dos. No es un descuido: no existe la fracción.
  { c: 'CLP', dec: 0, n: 'Peso chileno', pais: 'Chile', simbolo: '$' },
  { c: 'PYG', dec: 0, n: 'Guaraní', pais: 'Paraguay', simbolo: '₲' },

  // ── Norteamérica y Europa ─────────────────────────────────────────────────
  { c: 'CAD', dec: 2, n: 'Dólar canadiense', pais: 'Canadá', simbolo: 'C$' },
  { c: 'EUR', dec: 2, n: 'Euro', pais: 'Zona euro', simbolo: '€' },
];

const POR_CODIGO = new Map(MONEDAS.map((m) => [m.c, m]));

/** La moneda en la que la casa lleva sus cuentas y contra la que se cotiza. */
const REFERENCIA = 'USD';

function moneda(codigo) {
  return POR_CODIGO.get(String(codigo || '').toUpperCase()) || null;
}

function existe(codigo) {
  return POR_CODIGO.has(String(codigo || '').toUpperCase());
}

/**
 * Un monto escrito por una persona («1.234,56», «1234.56», «1 234,56») a
 * unidades mínimas enteras, en string.
 *
 * Devuelve null ante CUALQUIER duda. Es una frontera: lo que entra torcido no
 * se endereza a ojo, se rechaza. Un «1.234» ambiguo —¿mil doscientos treinta y
 * cuatro, o uno con doscientos treinta y cuatro milésimas?— se resuelve por la
 * regla de abajo y, si no se puede, se rechaza.
 */
function aMinimas(texto, codigo) {
  const m = moneda(codigo);
  if (!m) return null;

  let s = String(texto == null ? '' : texto).trim();
  if (!s) return null;
  // Espacios de miles (incluido el fino) fuera.
  s = s.replace(/[\s  ]/g, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;

  const negativo = s.startsWith('-');
  if (negativo) return null;   // aquí no entran montos negativos, nunca

  /* ── Qué separa los decimales ──────────────────────────────────────────────
     La prueba de fuego no es contar separadores, es preguntar si el número
     queda BIEN AGRUPADO de tres en tres. Un separador de miles de verdad deja
     grupos exactos: 1.234.567 sí, 1.2.3.4 no. Con eso:

       · «1.234,56» y «1,234.56» dan lo mismo — manda el último separador y el
         otro tiene que ser un agrupamiento válido.
       · «1.234» se lee mil doscientos treinta y cuatro, porque agrupa bien.
       · «1234.567» NO agrupa (1234 no es un grupo de cabeza), así que 567 son
         decimales — y en dólares eso son tres decimales y se rechaza.
       · «1.2.3.4» no agrupa de ninguna forma: se rechaza, no se adivina. */
  const agrupado = (t, sep) =>
    new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(t);

  const ultimoPunto = s.lastIndexOf('.');
  const ultimaComa = s.lastIndexOf(',');
  const corte = Math.max(ultimoPunto, ultimaComa);
  const puntos = (s.match(/\./g) || []).length;
  const comas = (s.match(/,/g) || []).length;

  let enteros = s;
  let decimales = '';

  if (puntos && comas) {
    // Los dos signos presentes: el ÚLTIMO es el decimal, el otro son miles.
    const dec = ultimoPunto > ultimaComa ? '.' : ',';
    const mil = dec === '.' ? ',' : '.';
    if ((dec === '.' ? puntos : comas) !== 1) return null;  // dos comas decimales
    if (!agrupado(s.slice(0, corte), mil)) return null;     // miles mal puestos
    enteros = s.slice(0, corte);
    decimales = s.slice(corte + 1);
  } else if (puntos || comas) {
    const sep = puntos ? '.' : ',';
    const cola = s.slice(corte + 1);
    if ((puntos || comas) > 1) {
      // Repetido: solo puede ser separador de miles, y tiene que agrupar.
      if (!agrupado(s, sep)) return null;
      enteros = s;
    } else if (cola.length === 3 && agrupado(s, sep)) {
      enteros = s;                       // «1.234» → mil doscientos treinta y cuatro
    } else {
      enteros = s.slice(0, corte);
      decimales = cola;
    }
  }
  enteros = enteros.replace(/[.,]/g, '');
  if (!/^\d+$/.test(enteros)) return null;
  if (decimales && !/^\d+$/.test(decimales)) return null;

  /* Más decimales de los que la moneda tiene NO se redondean: se rechaza.
     Redondear el dinero de otra persona en silencio es como se pierden
     céntimos que después nadie sabe explicar. Que lo diga quien escribió. */
  if (decimales.length > m.dec) return null;

  const relleno = decimales.padEnd(m.dec, '0');
  try {
    return (BigInt(enteros) * 10n ** BigInt(m.dec) + BigInt(relleno || '0')).toString();
  } catch { return null; }
}

/** Unidades mínimas → texto para pantalla, con el punto decimal que toca. */
function aTexto(minimas, codigo) {
  const m = moneda(codigo);
  if (!m) return null;
  let v;
  try { v = BigInt(minimas); } catch { return null; }
  const neg = v < 0n;
  if (neg) v = -v;
  const base = 10n ** BigInt(m.dec);
  const ent = (v / base).toString();
  if (m.dec === 0) return (neg ? '-' : '') + ent;
  const dec = (v % base).toString().padStart(m.dec, '0');
  return `${neg ? '-' : ''}${ent}.${dec}`;
}

module.exports = { MONEDAS, REFERENCIA, moneda, existe, aMinimas, aTexto };
