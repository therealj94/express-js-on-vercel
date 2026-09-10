// El tamiz de sanciones de AuCorp: beneficiarios y retiros contra la OFAC.
//
// ══ DE DÓNDE VIENE ═════════════════════════════════════════════════════════
//
// Es el mismo tamiz que corre en Genesis ID (genesis-id/src/aml/listas.ts,
// tamiz.ts y lib/texto.ts), traído a esta casa en CommonJS y con la misma
// forma de leer la lista oficial. Genesis tamiza IDENTIDADES cuando hace el
// KYC; aquí se tamizan DESTINOS: el titular de la cuenta bancaria a la que
// alguien quiere mandar dinero no pasó por Genesis, y es justo el nombre que
// hay que mirar antes de que salga una transferencia que no se deshace.
//
// ══ LAS TRES REGLAS ════════════════════════════════════════════════════════
//
// 1. DE FÁBRICA NO HAY LISTA, Y SIN LISTA NO SE TAMIZA. Una lista vacía
//    devuelve «sin coincidencias» ante cualquier nombre, y eso se ve igual que
//    una lista real bien consultada. Por eso `tamizar()` devuelve
//    `tamizado: false` cuando no hay nada cargado, y quien lo llama trata eso
//    como un NO: el retiro no sale. Operaciones la carga con UNA llamada
//    (`POST /tesoreria/sanciones/importar`) y queda guardada en Mongo, así que
//    sobrevive a los despliegues.
//
// 2. EL TAMIZ NO DECIDE. Produce coincidencias con su puntuación y su
//    explicación. Una coincidencia FUERTE cierra la puerta del retiro hasta que
//    una persona de cumplimiento la mire —eso es fail-closed—, pero no rechaza
//    a nadie para siempre: queda como alerta y la resuelve alguien con nombre.
//
// 3. AL USUARIO NO SE LE DICE CONTRA QUÉ CHOCÓ. Se le dice que ese destino
//    necesita revisión. Avisarle a alguien que su beneficiario está en una
//    lista es justo lo que la norma prohíbe.

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// Comparación de nombres (lib/texto.ts de Genesis)
// ─────────────────────────────────────────────────────────────────────────────

const LIGADURAS = { Æ: 'AE', Ø: 'O', Ð: 'D', Þ: 'TH', ß: 'SS', Œ: 'OE', Ł: 'L', Đ: 'D', Ħ: 'H', Ŋ: 'NG' };
const CIRILICO = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'ZH', З: 'Z', И: 'I',
  Й: 'I', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  У: 'U', Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHCH', Ъ: '', Ы: 'Y',
  Ь: '', Э: 'E', Ю: 'YU', Я: 'YA',
};

/** Mayúsculas, sin tildes, sin puntuación, un espacio entre palabras. */
function normalizar(texto) {
  let s = String(texto || '').toUpperCase();
  s = s.replace(/[ÆØÐÞŒŁĐĦŊß]/g, (c) => LIGADURAS[c] ?? c);
  s = s.replace(/[А-Яа-яЁё]/g, (c) => CIRILICO[c.toUpperCase()] ?? c);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[-'’`]/g, ' ');
  s = s.replace(/[^A-Z0-9 ]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const PARTICULAS = new Set([
  'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'DA', 'DAS', 'DO', 'DOS', 'VAN',
  'VON', 'BIN', 'IBN', 'AL', 'ABU', 'BEN', 'DI', 'DU', 'LE', 'MC', 'MAC',
  'SAN', 'SANTA', 'ST',
]);

/** Palabras significativas del nombre, ya normalizadas. */
function fichas(nombre) {
  return normalizar(nombre).split(' ').filter((t) => t.length > 0 && !PARTICULAS.has(t));
}

const EQUIVALENTES = [
  ['MOHAMMED', 'MUHAMMAD', 'MOHAMED', 'MUHAMED', 'MOHAMMAD', 'MAHOMET', 'MEHMET'],
  ['ABDULLAH', 'ABDALLAH', 'ABDULAH', 'ABDULA'],
  ['YUSUF', 'YOUSEF', 'YOUSSEF', 'JOSEPH', 'JOSE', 'GIUSEPPE'],
  ['IBRAHIM', 'IBRAHEEM', 'ABRAHAM', 'AVRAHAM'],
  ['ALEXANDER', 'ALEKSANDR', 'ALEJANDRO', 'ALESSANDRO', 'OLEKSANDR'],
  ['VLADIMIR', 'VOLODYMYR', 'WLADIMIR'],
  ['SERGEY', 'SERGEI', 'SERHIY', 'SERGIO'],
  ['DMITRY', 'DMITRI', 'DMYTRO', 'DIMITRI'],
  ['NIKOLAY', 'NIKOLAI', 'MYKOLA', 'NICOLAS', 'NICHOLAS'],
  ['JUAN', 'JOHN', 'JOAO', 'GIOVANNI', 'IVAN', 'JEAN'],
  ['JAIME', 'JAMES', 'JACOBO', 'IAGO', 'DIEGO'],
  ['CATALINA', 'KATHERINE', 'EKATERINA', 'CATHERINE'],
  ['MARIA', 'MARY', 'MARIE', 'MARIYA'],
  ['ALI', 'ALY'],
  ['HUSSEIN', 'HUSSAIN', 'HUSAYN', 'HUSEIN'],
  ['HASSAN', 'HASAN'],
  ['OMAR', 'UMAR'],
  ['KHALED', 'KHALID', 'HALID'],
];
const CANONICO = new Map();
for (const grupo of EQUIVALENTES) for (const v of grupo) CANONICO.set(v, grupo[0]);
const canonizar = (f) => CANONICO.get(f) ?? f;

function jaro(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const alcance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const usadoA = new Array(a.length).fill(false);
  const usadoB = new Array(b.length).fill(false);
  let comunes = 0;
  for (let i = 0; i < a.length; i++) {
    const desde = Math.max(0, i - alcance);
    const hasta = Math.min(i + alcance + 1, b.length);
    for (let j = desde; j < hasta; j++) {
      if (usadoB[j] || a[i] !== b[j]) continue;
      usadoA[i] = usadoB[j] = true;
      comunes++;
      break;
    }
  }
  if (comunes === 0) return 0;
  let transposiciones = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!usadoA[i]) continue;
    while (!usadoB[k]) k++;
    if (a[i] !== b[k]) transposiciones++;
    k++;
  }
  transposiciones /= 2;
  return (comunes / a.length + comunes / b.length + (comunes - transposiciones) / comunes) / 3;
}

/** Jaro-Winkler: premia el prefijo común, que en nombres es lo que pesa. */
function jaroWinkler(a, b) {
  const base = jaro(a, b);
  if (base < 0.7) return base;
  let prefijo = 0;
  while (prefijo < Math.min(4, a.length, b.length) && a[prefijo] === b[prefijo]) prefijo++;
  return base + prefijo * 0.1 * (1 - base);
}

const esInicial = (t) => t.length === 1;

function pareceFicha(a, b) {
  const ca = canonizar(a);
  const cb = canonizar(b);
  if (ca === cb) return 1;
  if (esInicial(a) || esInicial(b)) return a[0] === b[0] ? 0.6 : 0;
  // Nombres cortados (MRZ): «JOS» contra «JOSE». Misma regla que Genesis.
  const corto = a.length <= b.length ? a : b;
  const largo = a.length <= b.length ? b : a;
  if (corto.length >= 3 && largo.startsWith(corto)) return 0.97;
  return jaroWinkler(ca, cb);
}

/**
 * Parecido entre dos nombres completos, de 0 a 1. El orden de las palabras no
 * importa («GARCIA JUAN» = «JUAN GARCIA») porque las listas publican
 * «APELLIDO, Nombre» y las apps mandan «Nombre Apellido».
 */
function parecidoNombres(uno, otro) {
  const a = fichas(uno);
  const b = fichas(otro);
  if (!a.length || !b.length) return 0;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  const tomadas = new Set();
  let suma = 0;
  for (const ficha of corto) {
    let mejor = 0;
    let mejorIdx = -1;
    for (let j = 0; j < largo.length; j++) {
      if (tomadas.has(j)) continue;
      const p = pareceFicha(ficha, largo[j]);
      if (p > mejor) { mejor = p; mejorIdx = j; }
    }
    if (mejorIdx >= 0) tomadas.add(mejorIdx);
    suma += mejor;
  }
  return suma / corto.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// La lista de la OFAC (listas.ts de Genesis)
// ─────────────────────────────────────────────────────────────────────────────

/** Divide una línea de CSV respetando las comillas dobles. */
function celdas(linea) {
  const salida = [];
  let actual = '';
  let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (dentro && linea[i + 1] === '"') { actual += '"'; i++; } else dentro = !dentro;
    } else if (c === ',' && !dentro) {
      salida.push(actual);
      actual = '';
    } else actual += c;
  }
  salida.push(actual);
  // La OFAC escribe los campos vacíos como "-0-".
  return salida.map((s) => { const t = s.trim(); return t === '-0-' ? '' : t; });
}

const TIPOS_OFAC = { individual: 'persona', entity: 'entidad', vessel: 'buque', aircraft: 'aeronave' };
const MESES = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

function normalizarFecha(cruda) {
  const m = cruda.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (m) {
    const mes = MESES[m[2].toUpperCase()];
    if (mes) return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`;
  }
  if (/^\d{4}$/.test(cruda)) return `${cruda}-00-00`;
  return null;
}

/**
 * Lee `SDN.CSV` de la OFAC. Columnas: número, nombre, tipo, programa, cargo,
 * indicativo, tipo de buque, tonelaje, GRT, bandera, propietario,
 * observaciones. De las observaciones salen la fecha de nacimiento y las
 * direcciones de criptomonedas («Digital Currency Address - XBT …»).
 */
function leerSdnCsv(texto) {
  const salida = [];
  for (const linea of String(texto || '').split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const c = celdas(linea);
    if (c.length < 4) continue;
    const num = c[0];
    if (!/^\d+$/.test(num)) continue;
    const observaciones = c[11] || '';
    const direcciones = [...observaciones.matchAll(/Digital Currency Address\s*-\s*\w+\s+([A-Za-z0-9]+)/g)].map((m) => m[1]);
    const dob = observaciones.match(/DOB\s+(\d{1,2}\s+\w{3}\s+\d{4}|\d{4})/i);
    salida.push({
      id: `OFAC-${num}`,
      nombre: c[1],
      alias: [],
      tipo: TIPOS_OFAC[(c[2] || '').toLowerCase()] ?? 'entidad',
      programa: c[3] || '',
      lista: 'OFAC-SDN',
      fechaNacimiento: dob ? normalizarFecha(dob[1]) : null,
      direcciones,
    });
  }
  return salida;
}

/** `ALT.CSV`: los alias, enganchados a su registro por el número. */
function aplicarAlias(texto, registros) {
  const porNumero = new Map(registros.map((r) => [r.id.replace('OFAC-', ''), r]));
  for (const linea of String(texto || '').split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const c = celdas(linea);
    if (c.length < 4 || !/^\d+$/.test(c[0])) continue;
    const r = porNumero.get(c[0]);
    if (r && c[3]) r.alias.push(c[3]);
  }
}

/** Una lista en JSON con la forma de RegistroSancion de Genesis. */
function leerJson(texto, fuente) {
  const crudo = JSON.parse(texto);
  const lista = Array.isArray(crudo) ? crudo : (crudo.registros || []);
  return lista.filter((r) => r && r.nombre).map((r, i) => ({
    id: r.id || `${fuente}-${i}`,
    nombre: String(r.nombre),
    alias: Array.isArray(r.alias) ? r.alias.map(String) : [],
    tipo: r.tipo || 'persona',
    programa: r.programa || '',
    lista: r.lista || fuente,
    fechaNacimiento: r.fechaNacimiento || null,
    direcciones: Array.isArray(r.direcciones) ? r.direcciones.map(String) : [],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// El índice en memoria
// ─────────────────────────────────────────────────────────────────────────────

function vacio() {
  return { registros: [], porFicha: new Map(), porDireccion: new Map(), fuentes: [], cargadaEn: null, fechaDescarga: null };
}
let indice = vacio();

/** Índice invertido por palabra (y su prefijo de 4): sin esto habría que
 *  comparar cada consulta con las ~17 000 fichas de la OFAC. */
function indexar(registros, fuentes, fechaDescarga) {
  const porFicha = new Map();
  const porDireccion = new Map();
  registros.forEach((r, i) => {
    for (const n of [r.nombre, ...(r.alias || [])]) {
      for (const f of fichas(n)) {
        for (const clave of [f, f.slice(0, 4)]) {
          const lista = porFicha.get(clave);
          if (lista) { if (lista[lista.length - 1] !== i) lista.push(i); } else porFicha.set(clave, [i]);
        }
      }
    }
    for (const d of r.direcciones || []) porDireccion.set(String(d).toLowerCase(), i);
  });
  return { registros, porFicha, porDireccion, fuentes, cargadaEn: new Date().toISOString(), fechaDescarga };
}

/** Carga en caliente una lista ya leída. Lo usan las pruebas y el importador. */
function cargarEnMemoria(registros, fuente = 'memoria', fechaDescarga = new Date().toISOString().slice(0, 10)) {
  indice = indexar(registros, [`${fuente} (${registros.length})`], fechaDescarga);
  return registros.length;
}

const hayListas = () => indice.registros.length > 0;

function estado() {
  const dias = indice.fechaDescarga
    ? Math.floor((Date.now() - new Date(indice.fechaDescarga).getTime()) / 86400000)
    : null;
  return {
    cargadas: hayListas(),
    registros: indice.registros.length,
    fuentes: indice.fuentes,
    cargadaEn: indice.cargadaEn,
    fechaDescarga: indice.fechaDescarga,
    diasDesdeDescarga: dias,
    // Sin fecha es motivo de alarma, no de silencio: unas listas sin fecha se
    // tratan como viejas. Misma corrección que ya se hizo en Genesis.
    vencidas: !hayListas() || dias == null || dias > 30,
  };
}

function candidatos(nombre) {
  const vistos = new Set();
  for (const f of fichas(nombre)) {
    for (const clave of [f, f.slice(0, 4)]) {
      for (const i of indice.porFicha.get(clave) || []) vistos.add(i);
    }
  }
  return [...vistos].map((i) => indice.registros[i]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Consulta (tamiz.ts de Genesis)
// ─────────────────────────────────────────────────────────────────────────────

const UMBRAL_FUERTE = 0.92;
const UMBRAL_MINIMO = 0.84;
const fuerzaDe = (p) => (p >= UMBRAL_FUERTE ? 'fuerte' : p >= 0.88 ? 'posible' : 'debil');

/**
 * Tamiza un nombre (persona o razón social) contra la lista cargada.
 *
 * Devuelve { tamizado, coincidencias, fuertes, posibles, estadoListas }.
 * `tamizado: false` significa que NO había lista: no es lo mismo que limpio,
 * y quien llama lo tiene que tratar como un no.
 */
function tamizarNombre(nombre, datos = {}) {
  const est = estado();
  if (!hayListas()) return { tamizado: false, coincidencias: [], fuertes: 0, posibles: 0, estadoListas: est };

  const encontradas = [];
  for (const registro of candidatos(nombre)) {
    let mejor = 0;
    let cual = registro.nombre;
    for (const candidato of [registro.nombre, ...(registro.alias || [])]) {
      const p = parecidoNombres(nombre, candidato);
      if (p > mejor) { mejor = p; cual = candidato; }
    }
    if (mejor < UMBRAL_MINIMO) continue;

    const razones = [cual === registro.nombre
      ? `El nombre coincide al ${(mejor * 100).toFixed(0)} %`
      : `Coincide con el alias «${cual}» al ${(mejor * 100).toFixed(0)} %`];
    let puntuacion = mejor;

    const a = datos.fechaNacimiento ? String(datos.fechaNacimiento).slice(0, 4) : null;
    const b = registro.fechaNacimiento ? String(registro.fechaNacimiento).slice(0, 4) : null;
    if (a && b) {
      if (a === b) {
        puntuacion = Math.min(1, puntuacion + 0.08);
        razones.push(`Coincide también el año de nacimiento (${b})`);
      } else {
        // Baja, pero no desaparece si el nombre coincidía de lleno: una fecha
        // falsa es una forma habitual de esquivar el tamizado.
        const conPenalizacion = puntuacion - 0.25;
        puntuacion = mejor >= UMBRAL_FUERTE ? Math.max(UMBRAL_MINIMO, conPenalizacion) : Math.max(0, conPenalizacion);
        razones.push(`El año de nacimiento NO coincide (persona ${a}, ficha ${b}). Se mantiene a la vista porque el nombre coincide.`);
      }
    }
    if (puntuacion < UMBRAL_MINIMO) continue;

    encontradas.push({
      registro: { id: registro.id, nombre: registro.nombre, lista: registro.lista, programa: registro.programa, tipo: registro.tipo },
      puntuacion: Number(puntuacion.toFixed(4)),
      fuerza: fuerzaDe(puntuacion),
      razones,
      nombreCoincidente: cual,
    });
  }
  encontradas.sort((x, y) => y.puntuacion - x.puntuacion);
  return {
    tamizado: true,
    coincidencias: encontradas,
    fuertes: encontradas.filter((c) => c.fuerza === 'fuerte').length,
    posibles: encontradas.filter((c) => c.fuerza === 'posible').length,
    estadoListas: est,
  };
}

/** Una dirección de criptomoneda: o es exactamente la sancionada o no lo es. */
function tamizarDireccion(direccion) {
  if (!hayListas()) return { tamizado: false, sancionada: false, registro: null };
  const i = indice.porDireccion.get(String(direccion || '').toLowerCase());
  const registro = i == null ? null : indice.registros[i];
  return {
    tamizado: true,
    sancionada: Boolean(registro),
    registro: registro ? { id: registro.id, nombre: registro.nombre, lista: registro.lista, programa: registro.programa } : null,
  };
}

/**
 * LA PUERTA QUE USAN LOS CONTROLLERS. Devuelve un veredicto en una palabra:
 *
 *   'pasa'       → tamizado y sin coincidencia fuerte
 *   'revision'   → tamizado y con al menos una coincidencia fuerte
 *   'sin-tamiz'  → no había lista: NO se pudo mirar, y no poder mirar es no
 *
 * Con el detalle al lado para dejarlo en la alerta. Nunca al usuario.
 */
function veredictoNombre(nombre, datos) {
  const r = tamizarNombre(nombre, datos);
  if (!r.tamizado) return { veredicto: 'sin-tamiz', detalle: r };
  return { veredicto: r.fuertes > 0 ? 'revision' : 'pasa', detalle: r };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia en Mongo y descarga de la OFAC
// ─────────────────────────────────────────────────────────────────────────────
//
// Van en su propia colección (`sanciones`): son unas 17 000 fichas. Se borra y
// se vuelve a insertar en vez de mezclar: una lista de sanciones es una foto
// de un momento, y mezclar la de hoy con la del mes pasado deja dentro a gente
// que ya salió.

const sancionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  nombre: { type: String, required: true },
  alias: { type: [String], default: [] },
  tipo: { type: String, default: 'persona' },
  programa: { type: String, default: '' },
  lista: { type: String, default: '', index: true },
  fechaNacimiento: { type: String, default: null },
  direcciones: { type: [String], default: [] },
}, { versionKey: false });
const metaSchema = new mongoose.Schema({
  clave: { type: String, required: true, unique: true },
  fuente: { type: String, default: '' },
  fechaDescarga: { type: String, default: null },
  registros: { type: Number, default: 0 },
  guardadoEn: { type: Date, default: Date.now },
}, { versionKey: false });

const Sancion = mongoose.models.Sancion || mongoose.model('Sancion', sancionSchema, 'sanciones');
const SancionMeta = mongoose.models.SancionMeta || mongoose.model('SancionMeta', metaSchema, 'sanciones_meta');

const conectado = () => mongoose.connection.readyState === 1;

async function guardarEnMongo(registros, fuente, fechaDescarga) {
  if (!conectado()) throw new Error('sin Mongo no se puede guardar la lista');
  await Sancion.deleteMany({});
  const LOTE = 2000;
  for (let i = 0; i < registros.length; i += LOTE) {
    await Sancion.insertMany(registros.slice(i, i + LOTE), { ordered: false });
  }
  await SancionMeta.updateOne(
    { clave: 'meta' },
    { $set: { fuente, fechaDescarga, registros: registros.length, guardadoEn: new Date() } },
    { upsert: true },
  );
  return registros.length;
}

/** Trae la lista de Mongo y la deja indexada. 0 si no hay nada. */
async function cargarDesdeMongo() {
  if (!conectado()) return 0;
  const registros = await Sancion.find({}, { _id: 0 }).lean();
  if (!registros.length) { indice = vacio(); return 0; }
  const m = await SancionMeta.findOne({ clave: 'meta' }).lean();
  indice = indexar(registros, [m?.fuente || `mongodb (${registros.length})`], m?.fechaDescarga ?? null);
  return registros.length;
}

const URL_SDN = () => process.env.AUCORP_OFAC_SDN || 'https://www.treasury.gov/ofac/downloads/sdn.csv';
const URL_ALT = () => process.env.AUCORP_OFAC_ALT || 'https://www.treasury.gov/ofac/downloads/alt.csv';

async function bajar(url) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 120000);
  try {
    const r = await fetch(url, { signal: control.signal });
    if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(reloj);
  }
}

/** Baja la OFAC, la guarda y la deja indexada. Es la vía normal. */
async function importarDeOfac() {
  const registros = leerSdnCsv(await bajar(URL_SDN()));
  if (!registros.length) throw new Error('La descarga de la OFAC no trajo ninguna ficha: puede que hayan cambiado el formato o la dirección');
  let conAlias = 0;
  try {
    aplicarAlias(await bajar(URL_ALT()), registros);
    conAlias = registros.filter((r) => r.alias.length > 0).length;
  } catch (e) {
    console.warn(`[sanciones] no se pudieron traer los alias de la OFAC: ${e.message}`);
  }
  const fecha = new Date().toISOString().slice(0, 10);
  const fuente = `OFAC-SDN (${registros.length})`;
  await guardarEnMongo(registros, fuente, fecha);
  await cargarDesdeMongo();
  return { registros: registros.length, conAlias, fuente };
}

/** Importa una lista pegada como texto: CSV con el formato de la OFAC (con o
 *  sin ALT aparte) o JSON con la forma de Genesis. */
async function importarTexto(texto, nombreFuente = 'propia', alt = '') {
  const t = String(texto || '').trim();
  if (!t) throw new Error('No llegó ninguna lista');
  let nuevos;
  if (t.startsWith('[') || t.startsWith('{')) nuevos = leerJson(t, nombreFuente);
  else {
    nuevos = leerSdnCsv(t).map((r) => ({ ...r, lista: nombreFuente }));
    if (alt) aplicarAlias(alt, nuevos);
  }
  if (!nuevos.length) throw new Error('No se reconoció ninguna ficha en el texto');
  const fecha = new Date().toISOString().slice(0, 10);
  const fuente = `${nombreFuente} (${nuevos.length})`;
  await guardarEnMongo(nuevos, fuente, fecha);
  await cargarDesdeMongo();
  return { registros: nuevos.length, fuente };
}

/** Al arrancar: lo que haya en Mongo. Si no hay nada, queda vacío a propósito. */
async function iniciar() {
  try {
    const n = await cargarDesdeMongo();
    if (n) console.log(`[sanciones] lista cargada: ${indice.fuentes.join(', ')}`);
    else console.error('[sanciones] SIN LISTA DE SANCIONES: ningún retiro ni beneficiario nuevo va a pasar hasta que operaciones la importe (POST /tesoreria/sanciones/importar)');
    return n;
  } catch (e) {
    console.error(`[sanciones] no se pudo cargar la lista: ${e.message}`);
    return 0;
  }
}

module.exports = {
  // comparación
  normalizar, fichas, parecidoNombres, jaroWinkler,
  // lectura
  leerSdnCsv, aplicarAlias, leerJson,
  // índice
  cargarEnMemoria, hayListas, estado,
  // consulta
  tamizarNombre, tamizarDireccion, veredictoNombre, UMBRAL_FUERTE, UMBRAL_MINIMO,
  // persistencia
  guardarEnMongo, cargarDesdeMongo, importarDeOfac, importarTexto, iniciar,
  Sancion, SancionMeta,
};
