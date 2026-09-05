/* LAS MANOS DE ULTRON: el lote de herramientas y el impresor de documentos.
 *
 *   node infra/ultron/pruebas/probar-herramientas.mjs
 *
 * Dos cosas se prueban acá, y las dos por el mismo motivo: son silenciosas
 * cuando se rompen.
 *
 * EL LOTE. Correr tres herramientas a la vez es más rápido y también es la
 * forma más fácil de entregarle al modelo el resultado de la segunda donde
 * esperaba el de la primera — porque el modelo empareja por POSICIÓN, no por
 * nombre. Un error así no da excepción ni línea roja: da una respuesta que
 * suena bien y dice que la cadena está a 2,59 dólares. Por eso la prueba del
 * orden usa herramientas con tiempos AL REVÉS del orden pedido: si el lote
 * devolviera «la que terminó primero», esta prueba sería la que lo cazara.
 *
 * EL PDF. Un PDF mal armado casi nunca falla: sale. Sale con el pie repetido,
 * con la tabla partida, con tres páginas donde había una. Así que no se mira
 * si «no tiró error» — se cuentan páginas, se busca el texto dentro y se
 * comprueba que el sello de uso interno esté donde tiene que estar.
 */
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const herramientas = require('../lib/herramientas.js');
const pdf = require('../lib/pdf.js');

/* SACAR EL TEXTO DE UN PDF, para poder afirmar algo sobre él.
 *
 * Buscar la frase en el archivo en crudo no sirve y engaña: los flujos van
 * comprimidos, así que «USO INTERNO» no aparece — pero «ULTRON FP» sí, porque
 * está en la ficha de propiedades del archivo. Una prueba escrita así da por
 * bueno lo que no miró y por malo lo que sí estaba.
 *
 * Acá se descomprimen los flujos y se juntan las cadenas que el PDF manda
 * pintar. Van en hexadecimal —«[<4f5244454e> 30 <20474c4f42414c>] TJ»—, y el
 * espaciado entre letras las parte en trozos, así que se compara sin espacios:
 * lo que importa es que la frase esté, no con cuánto aire se dibujó. */
function textoDe(buffer) {
  let salida = '';
  const bytes = buffer;
  const marca = Buffer.from('stream');
  const fin = Buffer.from('endstream');
  let i = 0;
  while ((i = bytes.indexOf(marca, i)) !== -1) {
    let a = i + marca.length;
    if (bytes[a] === 0x0d) a++;
    if (bytes[a] === 0x0a) a++;
    const b = bytes.indexOf(fin, a);
    if (b === -1) break;
    try { salida += inflateSync(bytes.subarray(a, b)).toString('latin1'); } catch { /* no comprimido o no es texto */ }
    i = b + fin.length;
  }
  const hex = [...salida.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('');
  const literales = [...salida.matchAll(/\(((?:\\.|[^()\\])*)\)/g)]
    .map((m) => m[1].replace(/\\([()\\])/g, '$1')).join('');
  return hex + literales;
}
const sinAire = (s) => s.replace(/\s+/g, '');
const dice = (buffer, frase) => sinAire(textoDe(buffer)).includes(sinAire(frase));

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + String(extra).slice(0, 300) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

const llamar = (nombre, entrada = {}) => ({ function: { name: nombre, arguments: entrada } });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* Un doble de `correr`, que el lote acepta por parámetro. Estas pruebas son
   sobre el LOTE —quién corre a la vez, quién en fila, en qué orden vuelve—, no
   sobre lo que cada herramienta lee: con las de verdad harían falta internet y
   la casa en pie, y tardarían lo que tarde la casa en contestar. */
let registro = [];
function doble(mapa) {
  registro = [];
  return async (nombre, entrada) => {
    const mio = { nombre, entrada, empezo: Date.now() };
    registro.push(mio);
    const f = mapa[nombre];
    const espera = typeof f === 'number' ? f : (f?.espera || 0);
    if (espera) await dormir(espera);
    mio.termino = Date.now();
    return f?.salida !== undefined ? f.salida : `resultado de ${nombre}`;
  };
}

titulo('el lote: las que leen van a la vez');
{
  const correr = doble({ estado_vivo: 120, cadena_altura: 120, aucorp_monedas: 120 });
  const t0 = Date.now();
  const r = await herramientas.correrLote(
    [llamar('estado_vivo'), llamar('cadena_altura'), llamar('aucorp_monedas')],
    { ctx: {}, correr });
  const tardo = Date.now() - t0;
  decir(r.length === 3, `vuelven las tres (${r.length})`);
  decir(tardo < 300, `tardó ${tardo} ms, no los ~360 de correrlas en fila`);
  decir(r.map((x) => x.nombre).join(',') === 'estado_vivo,cadena_altura,aucorp_monedas',
    'y en el orden en que se pidieron', r.map((x) => x.nombre).join(','));
}

titulo('y vuelven EN ORDEN aunque terminen al revés');
{
  // La primera es la más lenta a propósito: si el lote devolviera por orden de
  // llegada, acá se vería.
  const correr = doble({
    lenta: { espera: 150, salida: 'SOY LA PRIMERA' },
    media: { espera: 80, salida: 'SOY LA SEGUNDA' },
    rapida: { espera: 5, salida: 'SOY LA TERCERA' },
  });
  const r = await herramientas.correrLote(
    [llamar('lenta'), llamar('media'), llamar('rapida')], { ctx: {}, correr });
  decir(r[0].salida === 'SOY LA PRIMERA' && r[1].salida === 'SOY LA SEGUNDA' && r[2].salida === 'SOY LA TERCERA',
    'cada resultado quedó pegado a su llamada', r.map((x) => x.salida).join(' | '));
}

titulo('las que ESCRIBEN van en fila y en su orden');
{
  const correr = doble({ anotar_pendiente: 60, cerrar_pendiente: 60, recordar: 60 });
  await herramientas.correrLote(
    [llamar('anotar_pendiente', { texto: 'a' }), llamar('cerrar_pendiente', { id: 'x' }), llamar('recordar', { texto: 'b' })],
    { ctx: {}, correr });
  const solapan = registro.some((a) => registro.some((b) => a !== b && a.empezo < b.termino && b.empezo < a.termino));
  decir(!solapan, 'ninguna empezó antes de que terminara la anterior');
  decir(registro.map((x) => x.nombre).join(',') === 'anotar_pendiente,cerrar_pendiente,recordar',
    'y corrieron en el orden que pidió el modelo', registro.map((x) => x.nombre).join(','));
}

titulo('leer no espera a escribir');
{
  const correr = doble({ crear_documento: 200, estado_vivo: 10 });
  const r = await herramientas.correrLote(
    [llamar('crear_documento', { titulo: 't', markdown: 'm' }), llamar('estado_vivo')], { ctx: {}, correr });
  const doc = registro.find((x) => x.nombre === 'crear_documento');
  const viva = registro.find((x) => x.nombre === 'estado_vivo');
  decir(viva.empezo < doc.termino, 'la lectura arrancó sin esperar a que terminara la escritura');
  decir(r[0].nombre === 'crear_documento' && r[1].nombre === 'estado_vivo', 'y el orden de vuelta se respeta');
}

titulo('lo mismo dos veces se corre una sola');
{
  const correr = doble({ cadena_direccion: 20 });
  const dir = { direccion: '0x8832E2D5cCc707bC5fef5780739f6a2F1C3eCAb3' };
  const r = await herramientas.correrLote(
    [llamar('cadena_direccion', dir), llamar('cadena_direccion', dir)], { ctx: {}, correr });
  decir(registro.length === 1, `la casa se leyó una vez (${registro.length})`);
  decir(r.length === 2 && r[0].salida === r[1].salida, 'y las dos llamadas recibieron el resultado');
}

titulo('y lo ya consultado en el turno no se vuelve a pedir');
{
  const correr = doble({ estado_vivo: 5 });
  const usadas = [{ nombre: 'estado_vivo', entrada: {}, salida: 'lo de antes' }];
  const r = await herramientas.correrLote([llamar('estado_vivo')], { ctx: {}, usadas, correr });
  decir(registro.length === 0, 'no se volvió a leer la casa');
  decir(/ya consultado/.test(r[0].salida) && /lo de antes/.test(r[0].salida),
    'se devolvió lo que ya se tenía, diciéndolo', r[0].salida);
}

titulo('una herramienta que revienta no tumba el lote');
{
  const correr = async (nombre) => {
    if (nombre === 'cadena_altura') throw new Error('la cadena no contesta');
    return `resultado de ${nombre}`;
  };
  const r = await herramientas.correrLote([llamar('cadena_altura'), llamar('estado_vivo')], { ctx: {}, correr });
  decir(r.length === 2, 'vuelven las dos');
  decir(/falló/.test(r[0].salida) && /no contesta/.test(r[0].salida),
    'la que falló lo dice, en vez de dejar el hueco', r[0].salida);
  decir(r[1].salida === 'resultado de estado_vivo', 'y la otra trae lo suyo');
}

titulo('el panel se entera de cada una');
{
  const correr = doble({ estado_vivo: 5, cadena_altura: 5 });
  const eventos = [];
  await herramientas.correrLote([llamar('estado_vivo'), llamar('cadena_altura')],
    { ctx: {}, correr, emitir: (e, d) => eventos.push(`${e}:${d.nombre}`) });
  decir(eventos.filter((e) => e.startsWith('herramienta:')).length === 2, 'avisa que empiezan las dos');
  decir(eventos.filter((e) => e.startsWith('herramienta-lista:')).length === 2, 'y que terminan las dos');
  decir(eventos.indexOf('herramienta:cadena_altura') < eventos.indexOf('herramienta-lista:estado_vivo'),
    'las dos se anuncian antes de que termine la primera: eso es lo que la persona ve corriendo a la vez');
}

// ── Las dos herramientas nuevas ─────────────────────────────────────────────

titulo('quien_es_quien');
{
  const junta = [
    { nombre: 'José Ordóñez', rol: 'Presidente', correo: 'j.ordonez@ordenglobal.org', whatsapp: '+50499999999' },
    { nombre: 'Ana Fajardo', rol: 'Tesorera', correo: 'ana@ordenglobal.org' },
  ];
  const s = await herramientas.correr('quien_es_quien', {}, { junta, miembro: junta[0], acciones: [] });
  decir(/José Ordóñez/.test(s) && /Ana Fajardo/.test(s), 'lista a la junta entera');
  decir(/Presidente/.test(s) && /Tesorera/.test(s), 'con su cargo');
  decir(/sin WhatsApp registrado/.test(s), 'y dice quién NO tiene WhatsApp, antes de que falle un envío');
  decir(/es con quien estás hablando ahora/.test(s), 'y marca a la persona que está delante');
  const vacia = await herramientas.correr('quien_es_quien', {}, { junta: [], acciones: [] });
  decir(/no está cargada/.test(vacia), 'sin junta cargada lo dice, no inventa nombres');
}

titulo('el impresor de documentos');
const md = `## Resumen

La red **8532** cuesta 444 USD/mes y procesa \`2,5\` transacciones al día.

| Dato | Valor |
|---|---|
| Coste | 444 USD/mes |
| Usuarios | 406 |

1. Migrar a la 5550.
2. Esperar.

> ORIGEN está referenciado al oro. Orden Global no está regulada.

Ver [ordenglobal.org](https://ordenglobal.org/).`;

{
  const b = await pdf.documentoPdf({ titulo: 'Migración de la cadena', tipo: 'analisis', markdown: md, en: new Date('2026-09-05'), miembro: 'j.ordonez@ordenglobal.org', para: 'junta' });
  const t = b.toString('latin1');
  decir(b.slice(0, 5).toString() === '%PDF-', 'sale un PDF de verdad');
  const paginas = (t.match(/\/Type\s*\/Page[^s]/g) || []).length;
  decir(paginas === 1, `cabe en una página (${paginas})`, 'un documento corto en tres páginas es el pie escrito bajo el margen');
  decir(dice(b, 'Migración de la cadena'), 'con el título dentro');
  decir(dice(b, 'ORDEN GLOBAL · JUNTA DIRECTIVA'), 'y el rótulo de la casa arriba');
  decir(dice(b, 'La red 8532 cuesta 444 USD/mes'), 'el texto entra sin los asteriscos del markdown');
  decir(dice(b, 'USO INTERNO · JUNTA DIRECTIVA'), 'lleva el sello de uso interno en el pie');
  decir(dice(b, '1 / 1'), 'y la página numerada sobre el total');
  decir(dice(b, 'Escrito por ULTRON FP'), 'y dice quién lo escribió');
}
{
  const b = await pdf.documentoPdf({ titulo: 'Comunicado', tipo: 'carta', markdown: md, en: new Date(), miembro: 'j@x.org', para: 'fuera' });
  decir(!dice(b, 'USO INTERNO'), 'el que va para fuera NO lleva el sello de interno');
  decir(dice(b, 'Para fuera de la junta'), 'sino que lo dice con todas las letras');
}
{
  // Largo de verdad: que numere y que el pie no vuelva a abrir páginas.
  const largo = Array.from({ length: 60 }, (_, i) => `## Punto ${i + 1}\n\nTexto del punto ${i + 1}. `.repeat(1) + 'Con su párrafo de detalle para que ocupe.').join('\n\n');
  const b = await pdf.documentoPdf({ titulo: 'Informe largo', tipo: 'informe', markdown: largo, en: new Date(), miembro: 'j@x.org', para: 'junta' });
  const paginas = (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  decir(paginas >= 3 && paginas <= 12, `un informe de 60 apartados ocupa ${paginas} páginas`);
  decir(dice(b, `1 / ${paginas}`) && dice(b, `${paginas} / ${paginas}`),
    `numeradas de «1 / ${paginas}» a «${paginas} / ${paginas}»`);
  decir(dice(b, 'Punto 60'), 'y el último apartado llegó al papel: nada se perdió al partir páginas');
}
{
  const vacio = await pdf.documentoPdf({ titulo: 'Sin cuerpo', tipo: 'otro', markdown: '', en: new Date(), miembro: 'j@x.org', para: 'junta' });
  decir(vacio.length > 800, 'un documento sin texto sale igual, con su cabecera');
}

titulo('el markdown, partido en bloques');
{
  const b = pdf._adentro.bloques(md);
  const tipos = b.map((x) => x.t);
  decir(tipos.includes('titulo') && tipos.includes('tabla') && tipos.includes('lista') && tipos.includes('cita'),
    'reconoce título, tabla, lista y cita', tipos.join(','));
  const tabla = b.find((x) => x.t === 'tabla');
  decir(tabla.cab.length === 2 && tabla.filas.length === 2, 'la tabla tiene dos columnas y dos filas');
  decir(pdf._adentro.plano('**negrita** y `código` y [enlace](https://x.org/)') === 'negrita y código y enlace',
    'y el texto plano sale sin los signos del markdown', pdf._adentro.plano('**negrita** y `código`'));
}

console.log(fallos ? `\n${fallos} fallo(s).\n` : '\nTodo en orden.\n');
process.exit(fallos ? 1 : 0);
