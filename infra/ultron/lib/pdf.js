// EL IMPRESOR: un documento de la junta, en PDF, con la cara de la casa.
//
// ── POR QUÉ HACÍA FALTA ─────────────────────────────────────────────────────
//
// ULTRON escribe memos, actas y análisis, y hasta hoy los entregaba en dos
// formatos: markdown y una página web. Los dos sirven para leer en pantalla y
// ninguno sirve para lo que la junta hace de verdad con un documento —
// mandárselo a un abogado, adjuntarlo a un correo, llevarlo impreso a una
// reunión, guardarlo como el acta de una decisión—. Un .md se abre con
// símbolos raros en el teléfono de quien lo recibe; un .html llega como un
// archivo que el correo marca sospechoso. El PDF es el formato en el que un
// documento de una empresa sale de la empresa. Sin él, cada escrito de ULTRON
// necesitaba que una persona lo copiara a Word, y un documento que hay que
// volver a maquetar a mano no está terminado.
//
// ── POR QUÉ SIN NAVEGADOR ───────────────────────────────────────────────────
//
// La forma cómoda de hacer un PDF es abrir el HTML en un Chrome sin ventana e
// imprimirlo. Eso son trescientos megas de navegador dentro del dyno, un
// arranque de segundos por documento y una pieza más que se puede caer. Acá el
// PDF se dibuja directo, con las fuentes que el formato ya trae dentro: pesa
// nada, no depende de nada y no se cae. Times y Helvetica cubren el español
// entero —acentos, eñes, signos de apertura, comillas angulares— sin tener que
// cargar una tipografía aparte.
//
// ── LA CARA ─────────────────────────────────────────────────────────────────
//
// Times para el cuerpo, porque un acta se lee como un documento y no como una
// aplicación; Helvetica en versalitas para la maquinaria —el rótulo de arriba,
// las cabeceras de tabla, el pie—, para que se distinga de un vistazo lo que
// es el texto de lo que es el papel. El oro de la casa se usa una sola vez por
// página, en la raya bajo el título: un color de marca repetido en cada
// elemento deja de ser una marca y pasa a ser ruido.
//
// El pie de cada página dice si el documento es de uso interno. No es adorno:
// ULTRON escribe cosas que la junta ve y el público no, y un papel que sale a
// la calle sin decir de qué lado estaba es la manera más fácil de que un
// número interno termine donde no debía.

const PDFDocument = require('pdfkit');

const ORO = '#C9A961';
const TINTA = '#1A1A1A';
const GRIS = '#6B6B6B';
const RAYA = '#D8D8D8';
const FONDO = '#F4F4F2';

const MARGEN = 64;
const CUERPO = 11;

// ── El markdown, en bloques ─────────────────────────────────────────────────
//
// Mismo lenguaje que entiende el panel (public/markdown.js). Se parte aparte y
// no se reusa aquel porque aquel devuelve HTML, y de un HTML ya armado no se
// puede sacar dónde parte una página.

/** Los trozos de una línea: normal, negrita, cursiva, código, enlace. */
function tramos(texto) {
  const partes = [];
  const re = /(\*\*[^*]+?\*\*)|(`[^`]+?`)|(\[[^\]]+?\]\(https?:\/\/[^\s)]+?\))|(\*[^*\n]+?\*)/g;
  let ultimo = 0; let m;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) partes.push({ texto: texto.slice(ultimo, m.index) });
    if (m[1]) partes.push({ texto: m[1].slice(2, -2), negrita: true });
    else if (m[2]) partes.push({ texto: m[2].slice(1, -1), codigo: true });
    else if (m[3]) {
      const c = m[3].match(/^\[([^\]]+)\]\((.+)\)$/);
      partes.push({ texto: c[1], url: c[2], enlace: true });
    } else if (m[4]) partes.push({ texto: m[4].slice(1, -1), cursiva: true });
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo) });
  return partes.filter((p) => p.texto !== '');
}

/** El mismo texto sin los signos del markdown, para medir y para las tablas. */
function plano(texto) {
  return tramos(texto).map((p) => p.texto).join('');
}

/** El markdown partido en bloques que se pueden dibujar uno tras otro. */
function bloques(md) {
  const lineas = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const salida = [];
  const parrafo = [];
  const cerrar = () => { if (parrafo.length) { salida.push({ t: 'parrafo', texto: parrafo.join(' ') }); parrafo.length = 0; } };
  let i = 0;

  while (i < lineas.length) {
    const l = lineas[i];

    if (/^```/.test(l)) {
      cerrar();
      const buf = []; i++;
      while (i < lineas.length && !/^```/.test(lineas[i])) buf.push(lineas[i++]);
      i++;
      salida.push({ t: 'codigo', texto: buf.join('\n') });
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) { cerrar(); salida.push({ t: 'titulo', nivel: h[1].length, texto: h[2] }); i++; continue; }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { cerrar(); salida.push({ t: 'regla' }); i++; continue; }

    // tabla: una fila con barras y debajo la línea de guiones
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1])) {
      cerrar();
      const celdas = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const cab = celdas(l); i += 2;
      const filas = [];
      while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) filas.push(celdas(lineas[i++]));
      salida.push({ t: 'tabla', cab, filas });
      continue;
    }

    if (/^\s*>\s?/.test(l)) {
      cerrar();
      const buf = [];
      while (i < lineas.length && /^\s*>\s?/.test(lineas[i])) buf.push(lineas[i++].replace(/^\s*>\s?/, ''));
      salida.push({ t: 'cita', texto: buf.join(' ').trim() });
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      cerrar();
      const items = [];
      const ordenada = /^\s*\d+[.)]\s+/.test(l);
      while (i < lineas.length && /^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])) {
        const m = lineas[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        items.push({ nivel: Math.min(2, Math.floor(m[1].length / 2)), texto: m[3] });
        i++;
        while (i < lineas.length && /^\s{2,}\S/.test(lineas[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])) {
          items[items.length - 1].texto += ' ' + lineas[i].trim(); i++;
        }
      }
      salida.push({ t: 'lista', ordenada, items });
      continue;
    }

    if (!l.trim()) { cerrar(); i++; continue; }
    parrafo.push(l.trim()); i++;
  }
  cerrar();
  return salida;
}

// ── El dibujo ───────────────────────────────────────────────────────────────

/** Escribe una línea con sus negritas y cursivas, respetando el ancho. */
function conFormato(doc, texto, { ancho, sangria = 0, tamano = CUERPO, color = TINTA, base = 'Times-Roman' } = {}) {
  const partes = tramos(texto);
  if (!partes.length) { doc.moveDown(0.4); return; }
  const negro = base === 'Times-Bold';
  partes.forEach((p, n) => {
    const ultimo = n === partes.length - 1;
    if (p.codigo) doc.font('Courier').fontSize(tamano - 1).fillColor('#8A4B2A');
    else if (p.negrita) doc.font(negro ? 'Times-Bold' : 'Times-Bold').fontSize(tamano).fillColor(color);
    else if (p.cursiva) doc.font('Times-Italic').fontSize(tamano).fillColor(color);
    else if (p.enlace) doc.font(base).fontSize(tamano).fillColor('#1B5E8A');
    else doc.font(base).fontSize(tamano).fillColor(color);
    doc.text(p.texto, { width: ancho, indent: n === 0 ? sangria : 0, continued: !ultimo,
      link: p.enlace ? p.url : null, underline: !!p.enlace, lineGap: 1.5 });
  });
}

/** ¿Cabe algo de este alto en lo que queda de página? */
function sitio(doc, alto) {
  return doc.y + alto <= doc.page.height - MARGEN - 26;
}

function pintarTabla(doc, b, ancho) {
  const cols = b.cab.length;
  if (!cols) return;
  /* El ancho de cada columna sale de lo que hay escrito en ella, no de dividir
     en partes iguales: una tabla de «Dato | Valor» con las dos columnas del
     mismo ancho deja la primera medio vacía y parte la segunda en cinco
     líneas. Se mide el contenido y se reparte, con un mínimo para que ninguna
     quede tan fina que corte cada palabra. */
  doc.font('Times-Roman').fontSize(CUERPO - 0.5);
  const pesos = b.cab.map((c, j) => {
    const largos = [plano(c).length, ...b.filas.map((f) => plano(f[j] || '').length)];
    return Math.max(6, Math.min(46, Math.max(...largos)));
  });
  const suma = pesos.reduce((a, x) => a + x, 0);
  const anchos = pesos.map((p) => Math.max(48, (p / suma) * ancho));
  const ajuste = ancho / anchos.reduce((a, x) => a + x, 0);
  for (let j = 0; j < cols; j++) anchos[j] *= ajuste;

  const pad = 6;
  const fila = (celdas, cabecera) => {
    const fuente = cabecera ? 'Helvetica-Bold' : 'Times-Roman';
    const tam = cabecera ? CUERPO - 2 : CUERPO - 0.5;
    doc.font(fuente).fontSize(tam);
    const alto = Math.max(...celdas.map((c, j) =>
      doc.heightOfString(plano(c || ''), { width: anchos[j] - pad * 2 }))) + pad * 2;
    if (!sitio(doc, alto)) { doc.addPage(); }
    const y0 = doc.y;
    if (cabecera) doc.rect(MARGEN, y0, ancho, alto).fill(FONDO);
    let x = MARGEN;
    doc.font(fuente).fontSize(tam).fillColor(cabecera ? TINTA : TINTA);
    for (let j = 0; j < cols; j++) {
      doc.text(plano(celdas[j] || ''), x + pad, y0 + pad, { width: anchos[j] - pad * 2 });
      x += anchos[j];
    }
    doc.y = y0 + alto;
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ancho, doc.y).lineWidth(0.5).strokeColor(RAYA).stroke();
    doc.x = MARGEN;
  };

  doc.moveDown(0.5);
  fila(b.cab, true);
  for (const f of b.filas) fila(f, false);
  doc.moveDown(0.6);
  doc.fillColor(TINTA);
}

function pintar(doc, lista, ancho) {
  for (const b of lista) {
    doc.x = MARGEN;
    if (b.t === 'titulo') {
      const tam = b.nivel === 1 ? 17 : b.nivel === 2 ? 14 : 12;
      doc.moveDown(b.nivel === 1 ? 0.9 : 0.7);
      // Un título solo al pie de una página es un título huérfano: que baje.
      if (!sitio(doc, tam * 3.4)) doc.addPage();
      doc.font('Times-Bold').fontSize(tam).fillColor(TINTA);
      doc.text(plano(b.texto), { width: ancho });
      doc.moveDown(0.28);
    } else if (b.t === 'parrafo') {
      doc.moveDown(0.32);
      conFormato(doc, b.texto, { ancho });
    } else if (b.t === 'lista') {
      doc.moveDown(0.3);
      let numero = 0;
      for (const it of b.items) {
        numero++;
        const sang = 14 + it.nivel * 14;
        const vineta = b.ordenada ? `${numero}.` : '·';
        const y0 = doc.y;
        doc.font('Times-Roman').fontSize(CUERPO).fillColor(GRIS);
        doc.text(vineta, MARGEN + it.nivel * 14, y0, { width: 12, lineBreak: false });
        doc.x = MARGEN + sang; doc.y = y0;
        conFormato(doc, it.texto, { ancho: ancho - sang });
        doc.x = MARGEN;
      }
      doc.moveDown(0.25);
    } else if (b.t === 'tabla') {
      pintarTabla(doc, b, ancho);
    } else if (b.t === 'cita') {
      doc.moveDown(0.45);
      const y0 = doc.y;
      doc.x = MARGEN + 16;
      conFormato(doc, b.texto, { ancho: ancho - 20, color: '#444', base: 'Times-Italic' });
      doc.moveTo(MARGEN + 2, y0).lineTo(MARGEN + 2, doc.y).lineWidth(2).strokeColor(ORO).stroke();
      doc.x = MARGEN;
      doc.moveDown(0.45);
    } else if (b.t === 'codigo') {
      doc.moveDown(0.45);
      doc.font('Courier').fontSize(CUERPO - 1.5);
      const alto = doc.heightOfString(b.texto, { width: ancho - 20 }) + 16;
      if (!sitio(doc, Math.min(alto, 400))) doc.addPage();
      const y0 = doc.y;
      doc.rect(MARGEN, y0, ancho, alto).fill(FONDO);
      doc.fillColor('#333').text(b.texto, MARGEN + 10, y0 + 8, { width: ancho - 20 });
      doc.y = y0 + alto; doc.x = MARGEN;
      doc.moveDown(0.5);
    } else if (b.t === 'regla') {
      doc.moveDown(0.6);
      doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ancho, doc.y).lineWidth(0.5).strokeColor(RAYA).stroke();
      doc.moveDown(0.6);
    }
    doc.fillColor(TINTA);
  }
}

// ── El documento entero ─────────────────────────────────────────────────────

const TIPOS = { memo: 'Memorándum', acta: 'Acta', analisis: 'Análisis', carta: 'Carta', plan: 'Plan', informe: 'Informe', otro: 'Documento' };

/**
 * Un documento de la biblioteca como PDF. Devuelve un Buffer.
 * `d` es lo que guarda memoria.guardarDocumento: { titulo, tipo, markdown, en,
 * miembro, para }.
 */
function documentoPdf(d) {
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({
      size: 'LETTER', margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
      bufferPages: true, autoFirstPage: true,
      info: {
        Title: String(d.titulo || 'Documento'),
        Author: 'Orden Global · Junta Directiva',
        Subject: TIPOS[d.tipo] || 'Documento',
        Creator: 'ULTRON FP',
      },
    });
    const trozos = [];
    doc.on('data', (t) => trozos.push(t));
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);

    const ancho = doc.page.width - MARGEN * 2;
    const interno = d.para !== 'fuera';

    // Cabecera
    doc.font('Helvetica-Bold').fontSize(8).fillColor(ORO)
      .text('ORDEN GLOBAL   ·   JUNTA DIRECTIVA', { characterSpacing: 1.6 });
    doc.moveDown(0.9);
    doc.font('Times-Bold').fontSize(23).fillColor(TINTA)
      .text(String(d.titulo || 'Documento'), { width: ancho, lineGap: 1 });
    doc.moveDown(0.45);
    const cuando = d.en ? new Date(d.en) : new Date();
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(
      [TIPOS[d.tipo] || 'Documento',
        cuando.toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' }),
        interno ? 'Uso interno' : 'Para fuera de la junta'].join('   ·   '),
      { characterSpacing: 0.3 });
    doc.moveDown(0.55);
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ancho, doc.y).lineWidth(1.4).strokeColor(ORO).stroke();
    doc.moveDown(0.9);
    doc.x = MARGEN;

    /* ULTRON casi siempre abre el markdown repitiendo el título del documento
       —«# Análisis FODA de Orden Global»— porque en markdown eso ES el título.
       Acá el título ya está arriba, en grande, con su fecha y su sello: dejarlo
       otra vez tres centímetros más abajo hace que el papel parezca mal armado.
       Se quita solo si es lo primero y dice lo mismo; si dice otra cosa, se
       respeta, porque entonces es un apartado y no un título repetido. */
    const cuerpo = bloques(d.markdown);
    const igual = (a, b) => plano(String(a)).trim().toLowerCase().replace(/\s+/g, ' ')
      === plano(String(b)).trim().toLowerCase().replace(/\s+/g, ' ');
    if (cuerpo[0]?.t === 'titulo' && cuerpo[0].nivel <= 2 && igual(cuerpo[0].texto, d.titulo)) cuerpo.shift();

    pintar(doc, cuerpo, ancho);

    // Quién lo escribió, al final del texto y no en el pie: es parte del
    // documento, no del papel.
    doc.moveDown(1.4);
    if (!sitio(doc, 46)) doc.addPage();
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ancho, doc.y).lineWidth(0.5).strokeColor(RAYA).stroke();
    doc.moveDown(0.5);
    doc.font('Times-Italic').fontSize(8.5).fillColor(GRIS).text(
      `Escrito por ULTRON FP a pedido de ${d.miembro || 'la junta'}. Las fuentes citadas están en el texto.`,
      { width: ancho });

    /* EL PIE SE DIBUJA AL FINAL, cuando ya se sabe cuántas páginas hay. Ponerlo
       a medida que se abren páginas obligaría a escribir «página 3 de ?».
       Y el margen de abajo se pone en cero mientras se dibuja: el pie va, por
       definición, DEBAJO del margen inferior, y escribir ahí con el margen
       puesto hace que PDFKit crea que la página se llenó y abra otra. Así
       salían tres páginas de un documento de una, cada página nueva empujando
       el pie a la siguiente — y ninguna terminaba con pie. */
    const rango = doc.bufferedPageRange();
    for (let n = 0; n < rango.count; n++) {
      doc.switchToPage(rango.start + n);
      const abajo = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - MARGEN + 16;
      doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
      doc.text(interno ? 'USO INTERNO · JUNTA DIRECTIVA' : 'ORDEN GLOBAL', MARGEN, y,
        { width: ancho / 2, characterSpacing: 0.8, lineBreak: false });
      doc.text(`${n + 1} / ${rango.count}`, MARGEN + ancho / 2, y,
        { width: ancho / 2, align: 'right', lineBreak: false });
      doc.page.margins.bottom = abajo;
    }

    doc.end();
  });
}

/** El nombre de archivo, sin acentos ni signos que rompan una descarga. */
function nombreArchivo(titulo) {
  return String(titulo || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'documento';
}

module.exports = { documentoPdf, nombreArchivo, _adentro: { bloques, tramos, plano } };
