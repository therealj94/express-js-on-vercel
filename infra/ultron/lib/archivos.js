/* LO QUE LA JUNTA LE MANDA A ULTRON.
 *
 * Hasta hoy ULTRON escribía documentos y no podía RECIBIR ninguno. Un
 * asistente al que hay que copiarle y pegarle un informe de treinta páginas en
 * una caja de texto no es un asistente: es un formulario.
 *
 * ── LA REGLA QUE ORDENA TODO ESTE ARCHIVO ───────────────────────────────────
 *
 * Un archivo subido es DOS cosas distintas y hay que tratarlas por separado:
 *
 *   · los BYTES, que se guardan tal cual para poder devolverlos idénticos
 *     —una firma, un sello, un PDF que va a un abogado—, y
 *   · el TEXTO, que es lo único que el modelo puede leer.
 *
 * Mezclarlas lleva a los dos errores clásicos: mandarle bytes crudos al modelo
 * (que los ve como basura y gasta contexto) o guardar solo el texto (y perder
 * el original que alguien va a pedir).
 *
 * ── POR QUÉ NO HAY LIBRERÍA DE PDF ──────────────────────────────────────────
 *
 * Se extrae el texto a mano, con el formato por delante. Un `pdf-parse` son
 * varios megas de dependencia y un motor de JavaScript completo (pdf.js) para
 * hacer lo que aquí se resuelve en cien líneas: los PDF que manda la junta son
 * documentos de texto, no escaneos. Y para lo que esto NO puede leer —un
 * escaneo, una imagen— se dice con todas las letras en vez de devolver
 * caracteres rotos que el modelo tomaría por contenido.
 *
 * Lo mismo con .docx: es un zip con un XML adentro. Se abre con `zlib`, que ya
 * viene con Node, y se le quitan las etiquetas. Sin dependencias.
 */

const zlib = require('node:zlib');
const mongoose = require('mongoose');
const { Schema } = mongoose;

/* EL TOPE. Ocho megas es un PDF de doscientas páginas o una foto de teléfono
   sin comprimir. Más que eso no es un documento de junta: es un vídeo o un
   respaldo, y para eso no es esta puerta. El tope se comprueba DOS veces —en
   la ruta, antes de leer el cuerpo, y aquí— porque el de la ruta protege la
   memoria del servidor y el de aquí protege la base de datos. */
const TOPE_BYTES = 8 * 1024 * 1024;
/* Y el texto que se le puede pasar al modelo tiene su propio tope, que no es
   el mismo: un PDF de dos megas puede dar cuatrocientas mil letras, y eso no
   entra en ninguna ventana de contexto. Se recorta y se DICE que se recortó. */
const TOPE_TEXTO = 120_000;

/* Lo que se admite, y con qué se lee cada cosa. Una lista blanca y no una
   negra: lo que no está aquí no entra, en vez de intentar adivinar si un
   .exe es peligroso. */
const CLASES = {
  'application/pdf': { ext: 'pdf', lee: 'pdf', rotulo: 'PDF' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', lee: 'docx', rotulo: 'Word' },
  'text/plain': { ext: 'txt', lee: 'texto', rotulo: 'texto' },
  'text/markdown': { ext: 'md', lee: 'texto', rotulo: 'markdown' },
  'text/csv': { ext: 'csv', lee: 'texto', rotulo: 'CSV' },
  'application/json': { ext: 'json', lee: 'texto', rotulo: 'JSON' },
  'text/html': { ext: 'html', lee: 'html', rotulo: 'HTML' },
  'image/png': { ext: 'png', lee: null, rotulo: 'imagen PNG' },
  'image/jpeg': { ext: 'jpg', lee: null, rotulo: 'imagen JPEG' },
  'image/webp': { ext: 'webp', lee: null, rotulo: 'imagen WebP' },
};

const archivoSchema = new Schema({
  nombre: { type: String, required: true, maxlength: 200 },
  tipo: { type: String, required: true },
  bytes: { type: Number, required: true },
  /* El original, para devolverlo idéntico. Va en la base y no en disco porque
     el dyno de Heroku no tiene disco que sobreviva a un reinicio: lo que se
     escriba ahí desaparece al primer despliegue, y un documento que se
     evapora es peor que uno que nunca se pudo subir. */
  crudo: { type: Buffer, required: true },
  texto: { type: String, default: '' },        // lo que el modelo puede leer
  recortado: { type: Boolean, default: false },
  porQue: { type: String, default: '' },       // si no se pudo leer, por qué
  miembro: { type: String, index: true },
  conversacion: { type: Schema.Types.ObjectId },
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

const Archivo = mongoose.models.Archivo || mongoose.model('Archivo', archivoSchema);

/* Sin Mongo se guarda en memoria, igual que el resto de la casa: la consola
   tiene que poder probarse entera sin base de datos. */
const provisional = [];
const conMongo = () => mongoose.connection.readyState === 1;
const idNuevo = () => new mongoose.Types.ObjectId().toString();

// ── Sacarle el texto a cada cosa ────────────────────────────────────────────

/** Texto plano: lo único que hay que hacer es no romper los acentos. */
function deTexto(buf) {
  return buf.toString('utf8');
}

function deHtml(buf) {
  return buf.toString('utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

/* ── .docx ──────────────────────────────────────────────────────────────────
   Un .docx es un ZIP; el texto vive en `word/document.xml`. Se recorre la
   tabla central del zip buscando esa entrada y se infla. No se usa ninguna
   librería: zlib viene con Node y el formato de un zip son cuatro campos. */
function deDocx(buf) {
  // El directorio central está al final; su firma es PK\x01\x02.
  const FIRMA = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let i = buf.length - 4;
  const entradas = [];
  while ((i = buf.lastIndexOf(FIRMA, i - 1)) > 0) {
    const metodo = buf.readUInt16LE(i + 10);
    const comprimido = buf.readUInt32LE(i + 20);
    const largoNombre = buf.readUInt16LE(i + 28);
    const extra = buf.readUInt16LE(i + 30);
    const comentario = buf.readUInt16LE(i + 32);
    const desde = buf.readUInt32LE(i + 42);
    const nombre = buf.toString('utf8', i + 46, i + 46 + largoNombre);
    entradas.push({ nombre, metodo, comprimido, desde });
    if (extra + comentario > 1e6) break;   // un zip roto no puede colgar esto
    if (entradas.length > 4000) break;
  }
  const doc = entradas.find((e) => e.nombre === 'word/document.xml');
  if (!doc) throw Object.assign(new Error('El .docx no trae word/document.xml.'), { codigo: 'DOCX_RARO' });

  // La cabecera local dice cuánto ocupan el nombre y el extra de ESTA entrada.
  const h = doc.desde;
  if (buf.readUInt32LE(h) !== 0x04034b50) throw Object.assign(new Error('El .docx está dañado.'), { codigo: 'DOCX_ROTO' });
  const inicio = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
  const trozo = buf.subarray(inicio, inicio + doc.comprimido);
  const xml = (doc.metodo === 0 ? trozo : zlib.inflateRawSync(trozo)).toString('utf8');

  /* Los saltos de párrafo son etiquetas, no caracteres: sin esto el documento
     entero sale como un solo renglón de veinte mil letras y el modelo pierde
     toda la estructura —qué era un título, qué una lista, dónde acababa una
     cláusula—. */
  return xml
    .replace(/<w:p\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/* ── PDF ────────────────────────────────────────────────────────────────────
   Un PDF de texto guarda su contenido en flujos comprimidos con Flate. Se
   buscan todos los `stream`…`endstream`, se inflan los que se dejen, y de los
   operadores de texto se sacan las cadenas: `(así)  Tj` y `[(a) -2 (sí)] TJ`.

   Esto NO lee un escaneo: un escaneo es una imagen y no tiene operadores de
   texto. Se detecta —el resultado sale casi vacío— y se dice, en vez de
   devolver cuatro símbolos sueltos que el modelo trataría como el contenido
   del documento. Decir «esto es un escaneo y no puedo leerlo» es información;
   devolver basura es mentira. */
/* ASCII85, la variante de Adobe. Hace falta de verdad y no es un adorno: los
   documentos de la propia casa se generan con ReportLab, que escribe
   `/Filter [ /ASCII85Decode /FlateDecode ]` — o sea, comprimido Y DESPUÉS
   pasado a texto imprimible. Sin este paso, `inflateSync` contesta «incorrect
   header check» y ULTRON no puede leer ni los informes que él mismo escribió.
   Se descubrió justamente así: dándole de comer el documento 8. */
function de85(txt) {
  const s = txt.replace(/\s+/g, '').replace(/^<~/, '').replace(/~>$/, '');
  const out = [];
  let grupo = [];
  for (const ch of s) {
    if (ch === 'z' && grupo.length === 0) { out.push(0, 0, 0, 0); continue; }
    const v = ch.charCodeAt(0) - 33;
    if (v < 0 || v > 84) continue;
    grupo.push(v);
    if (grupo.length === 5) {
      let n = 0;
      for (const g of grupo) n = n * 85 + g;
      out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      grupo = [];
    }
  }
  if (grupo.length > 1) {
    const falta = 5 - grupo.length;
    for (let i = 0; i < falta; i++) grupo.push(84);
    let n = 0;
    for (const g of grupo) n = n * 85 + g;
    const b = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...b.slice(0, 4 - falta));
  }
  return Buffer.from(out);
}

function dePdf(buf) {
  const FLUJO = Buffer.from('stream');
  const FIN = Buffer.from('endstream');
  let i = 0, crudo = '';
  while ((i = buf.indexOf(FLUJO, i)) !== -1) {
    let a = i + FLUJO.length;
    if (buf[a] === 0x0d) a++;
    if (buf[a] === 0x0a) a++;
    const b = buf.indexOf(FIN, a);
    if (b === -1) break;
    /* QUÉ FILTROS LLEVA ESTE FLUJO lo dice su diccionario, que está justo
       antes. Adivinarlo probando descompresores a ver cuál no revienta
       funciona hasta que un PDF trae dos filtros encadenados — que es
       exactamente lo que hace ReportLab. */
    const dicc = buf.toString('latin1', Math.max(0, i - 400), i);
    let trozo = buf.subarray(a, b);
    try {
      if (/ASCII85Decode/.test(dicc)) trozo = de85(trozo.toString('latin1'));
      else if (/ASCIIHexDecode/.test(dicc)) trozo = Buffer.from(trozo.toString('latin1').replace(/[^0-9A-Fa-f]/g, '').replace(/(.{2})/g, '$1 ').trim().split(' ').map((h) => parseInt(h, 16)));
      if (/FlateDecode/.test(dicc)) {
        try { trozo = zlib.inflateSync(trozo); } catch { trozo = zlib.inflateRawSync(trozo); }
      }
      crudo += trozo.toString('latin1');
    } catch { /* un flujo que no se deja no tumba el documento entero */ }
    i = b + FIN.length;
    if (crudo.length > 12e6) break;
  }
  if (!crudo) return '';

  const salida = [];
  /* Los operadores que ponen texto en la página. Se recorren en orden para
     conservar el del documento, y los saltos de línea salen de `TD`/`Td`/`T*`,
     que es como un PDF dice «renglón nuevo». */
  const re = /\((?:\\.|[^()\\])*\)|<[0-9A-Fa-f\s]+>|\bT[Dd*]\b|\bTJ\b|\bTj\b|\bET\b/g;
  let m, linea = '';
  const suelta = () => { const t = linea.trim(); if (t) salida.push(t); linea = ''; };
  while ((m = re.exec(crudo)) !== null) {
    const s = m[0];
    if (s === 'TD' || s === 'Td' || s === 'T*' || s === 'ET') { suelta(); continue; }
    if (s === 'TJ' || s === 'Tj') continue;
    if (s[0] === '(') {
      linea += s.slice(1, -1)
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '\t')
        .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    } else if (s[0] === '<') {
      const hex = s.slice(1, -1).replace(/\s+/g, '');
      if (hex.length % 2 === 0) linea += Buffer.from(hex, 'hex').toString('latin1');
    }
  }
  suelta();
  return salida.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/* ¿Lo que salió es texto de verdad o ruido de un escaneo? Un documento tiene
   letras y espacios; un flujo mal interpretado, símbolos. Se mira la
   proporción, no la longitud: quinientos caracteres de basura pasan cualquier
   prueba de largo. */
function pareceTexto(t) {
  if (!t || t.length < 40) return false;
  const letras = (t.match(/[\p{L}\p{N}\s.,;:¿?¡!()%$€-]/gu) || []).length;
  return letras / t.length > 0.82;
}

/** El texto de un archivo, o el motivo por el que no se pudo sacar. */
function leer(buf, clase) {
  if (!clase.lee) return { texto: '', porQue: `Es una ${clase.rotulo}: se guarda entera y se puede volver a bajar, pero no lleva texto que se pueda leer.` };
  try {
    let t = clase.lee === 'pdf' ? dePdf(buf)
      : clase.lee === 'docx' ? deDocx(buf)
        : clase.lee === 'html' ? deHtml(buf)
          : deTexto(buf);
    if (clase.lee === 'pdf' && !pareceTexto(t)) {
      return { texto: '', porQue: 'El PDF no trae texto: es un escaneo o una imagen. Habría que pasarlo por un lector óptico antes.' };
    }
    if (!t.trim()) return { texto: '', porQue: 'El archivo llegó vacío o sin texto dentro.' };
    const recortado = t.length > TOPE_TEXTO;
    if (recortado) t = t.slice(0, TOPE_TEXTO);
    return { texto: t, recortado, porQue: '' };
  } catch (e) {
    return { texto: '', porQue: `No se pudo leer (${String(e.message).slice(0, 120)}). El archivo queda guardado igual.` };
  }
}

// ── La puerta ───────────────────────────────────────────────────────────────

/** ¿Se admite este tipo? Devuelve la clase o null. */
const claseDe = (tipo) => CLASES[String(tipo || '').split(';')[0].trim().toLowerCase()] || null;

/** Lo que se admite, para decírselo a la persona antes de que arrastre nada. */
const admitidos = () => Object.entries(CLASES).map(([tipo, c]) => ({ tipo, ext: c.ext, rotulo: c.rotulo, seLee: !!c.lee }));

async function guardar({ nombre, tipo, buf, miembro, conversacion }) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw Object.assign(new Error('El archivo llegó vacío.'), { codigo: 'VACIO' });
  if (buf.length > TOPE_BYTES) throw Object.assign(new Error(`El archivo pesa ${(buf.length / 1e6).toFixed(1)} MB y el tope son 8.`), { codigo: 'MUY_GRANDE' });
  const clase = claseDe(tipo);
  if (!clase) throw Object.assign(new Error(`No se admiten archivos de tipo «${tipo}». Se admiten: ${admitidos().map((a) => a.ext).join(', ')}.`), { codigo: 'TIPO_NO' });

  const { texto, recortado = false, porQue } = leer(buf, clase);
  const d = {
    nombre: String(nombre || `archivo.${clase.ext}`).slice(0, 200),
    tipo: String(tipo).split(';')[0].trim().toLowerCase(),
    bytes: buf.length, crudo: buf, texto, recortado, porQue,
    miembro, conversacion: conversacion || null,
  };
  if (conMongo()) return sinCrudo((await Archivo.create(d)).toObject());
  const a = { _id: idNuevo(), ...d, en: new Date() };
  provisional.unshift(a);
  return sinCrudo(a);
}

/* Los bytes NUNCA viajan en una respuesta de lista: son megas por archivo y
   quien pide la lista quiere los nombres. Se bajan por su propia ruta. */
const sinCrudo = (a) => { const { crudo, ...resto } = a; return { ...resto, _id: String(a._id) }; };

async function lista({ limite = 40, miembro = null } = {}) {
  if (conMongo()) {
    const q = miembro ? { miembro } : {};
    return (await Archivo.find(q).select('-crudo').sort({ en: -1 }).limit(limite).lean())
      .map((a) => ({ ...a, _id: String(a._id) }));
  }
  return provisional.filter((a) => !miembro || a.miembro === miembro).slice(0, limite).map(sinCrudo);
}

async function uno(id, { conCrudo = false } = {}) {
  if (conMongo()) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) return null;
    const a = await Archivo.findById(id).lean();
    if (!a) return null;
    return conCrudo ? { ...a, _id: String(a._id) } : sinCrudo(a);
  }
  const a = provisional.find((x) => String(x._id) === String(id));
  if (!a) return null;
  return conCrudo ? a : sinCrudo(a);
}

async function borrar(id, miembro) {
  if (conMongo()) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) return false;
    const r = await Archivo.deleteOne({ _id: id, ...(miembro ? { miembro } : {}) });
    return r.deletedCount > 0;
  }
  const i = provisional.findIndex((x) => String(x._id) === String(id) && (!miembro || x.miembro === miembro));
  if (i < 0) return false;
  provisional.splice(i, 1);
  return true;
}

module.exports = {
  guardar, lista, uno, borrar, claseDe, admitidos, Archivo,
  TOPE_BYTES, TOPE_TEXTO, CLASES,
  _adentro: { dePdf, deDocx, deHtml, deTexto, leer, pareceTexto, provisional },
};
