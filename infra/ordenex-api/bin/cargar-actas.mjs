/* Carga resoluciones de precio declarado desde el libro de actas.
 *
 *   ORDENEX_ADMIN_KEY=… node bin/cargar-actas.mjs actas.txt          (ensayo)
 *   ORDENEX_ADMIN_KEY=… node bin/cargar-actas.mjs actas.txt --cargar (de verdad)
 *
 * El archivo lleva una resolucion por linea, con los cuatro datos separados
 * por · o por | — el mismo orden en el que se leen en un acta:
 *
 *   01/07/2024 · 1.00 · JD-2024-11 · Secretario de la Junta
 *   # las lineas que empiezan con # se saltan
 *
 * POR QUE EXISTE ESTO Y NO SE PEGAN CINCO CURL
 *
 * Porque son cinco oportunidades de equivocarse en algo que despues sale en la
 * pantalla de 435 personas, y porque el orden dia/mes/año es exactamente donde
 * se cuela el error que nadie ve: 01/07/2024 es el 1 de JULIO en el libro de
 * actas y el 7 de ENERO para un `new Date()` a la americana. Aqui se lee a la
 * de aqui, se convierte a ISO, y el ENSAYO lo enseña escrito con el mes en
 * letras para que se pueda leer antes de mandar nada.
 *
 * ENSAYO POR DEFECTO. Hay que escribir --cargar para que salga una peticion.
 * Un script que escribe en produccion por el mero hecho de ejecutarlo es un
 * accidente esperando la tecla de arriba en la terminal equivocada.
 */
import { readFile } from 'node:fs/promises';

const API = (process.env.ORDENEX_API || 'https://ordenex-api-ba4b27b8b51a.herokuapp.com').replace(/\/+$/, '');
const CLAVE = process.env.ORDENEX_ADMIN_KEY || '';
const TOKEN = process.env.TOKEN_DECLARADO || 'ONDK';

const archivo = process.argv[2];
const deVerdad = process.argv.includes('--cargar');

if (!archivo) {
  console.error('uso: node bin/cargar-actas.mjs <archivo> [--cargar]');
  process.exit(2);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* dd/mm/aaaa → Date en UTC a medianoche. UTC y no local a proposito: la fecha
   de vigencia de una resolucion es un DIA, no un instante, y guardarla en la
   zona del que corre el script la correria un dia entero segun desde donde se
   cargue. */
function fechaDe(s) {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mes, a] = m.map(Number);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, mes - 1, d));
  // Rebota el 31 de febrero y compañia: Date lo desborda al mes siguiente sin
  // avisar, y una fecha corrida un dia en un acta es una fecha equivocada.
  if (f.getUTCDate() !== d || f.getUTCMonth() !== mes - 1) return null;
  return f;
}

const texto = await readFile(archivo, 'utf8');
const filas = [];
const malas = [];

texto.split('\n').forEach((linea, i) => {
  const l = linea.trim();
  if (!l || l.startsWith('#')) return;
  const partes = l.split(/\s*[·|]\s*/);
  if (partes.length < 4) { malas.push([i + 1, l, 'hacen falta cuatro datos: fecha · precio · acta · firmante']); return; }
  const [sf, sp, acta, firmante] = partes;
  const fecha = fechaDe(sf);
  const precio = Number(String(sp).replace(',', '.'));
  if (!fecha) { malas.push([i + 1, l, `fecha ilegible: «${sf}» (se espera dd/mm/aaaa)`]); return; }
  if (!(precio > 0)) { malas.push([i + 1, l, `precio ilegible: «${sp}»`]); return; }
  if (!acta.trim()) { malas.push([i + 1, l, 'falta el acta']); return; }
  if (!firmante.trim()) { malas.push([i + 1, l, 'falta quien firma']); return; }
  filas.push({ token: TOKEN, fecha: fecha.toISOString(), precio, acta: acta.trim(), firmante: firmante.trim() });
});

if (malas.length) {
  console.log('\nLineas que NO se pueden cargar:\n');
  for (const [n, l, por] of malas) console.log(`  linea ${n}: ${por}\n     ${l}`);
}

if (!filas.length) {
  console.log('\nNo hay ni una resolucion cargable. No se manda nada.\n');
  process.exit(1);
}

// Dos resoluciones con la misma fecha chocarian contra el indice unico del
// API. Se avisa aqui para que no parezca un fallo del servidor.
const porFecha = new Map();
for (const f of filas) {
  const dia = f.fecha.slice(0, 10);
  if (porFecha.has(dia)) console.log(`\n  aviso: dos resoluciones el ${dia} — el API va a rechazar la segunda`);
  porFecha.set(dia, f);
}

filas.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));

console.log(`\n${deVerdad ? 'CARGANDO' : 'ENSAYO — no se manda nada'} · ${TOKEN} · ${API}\n`);
console.log('  vigente desde        precio    acta            firma');
console.log('  ' + '─'.repeat(74));
let previo = null;
for (const f of filas) {
  const d = new Date(f.fecha);
  const fechaLeible = `${String(d.getUTCDate()).padStart(2, ' ')} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  // El salto respecto a la anterior, que es lo que se va a ver como escalon.
  const salto = previo == null ? '' :
    `${f.precio > previo ? '↑' : f.precio < previo ? '↓' : '='} ${(((f.precio / previo) - 1) * 100).toFixed(1)}%`;
  console.log(`  ${fechaLeible.padEnd(20)} ${('$' + f.precio.toFixed(2)).padStart(7)}   ${f.acta.padEnd(15)} ${f.firmante}  ${salto}`);
  previo = f.precio;
}
const ultima = filas[filas.length - 1];
console.log(`\n  vigente hoy: $${ultima.precio.toFixed(2)} (acta ${ultima.acta})\n`);

if (!deVerdad) {
  console.log('  Leelo. Si esta bien, volve a correrlo con --cargar\n');
  process.exit(0);
}

if (!CLAVE) {
  console.error('  ORDENEX_ADMIN_KEY no esta puesta. Sin ella el panel no abre.\n');
  process.exit(2);
}

let bien = 0, mal = 0;
for (const f of filas) {
  const r = await fetch(`${API}/admin/precio-declarado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': CLAVE },
    body: JSON.stringify(f),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok) { bien++; console.log(`  ok    ${f.acta} · $${f.precio.toFixed(2)}`); }
  else if (d.codigo === 'YA_DECLARADO') { bien++; console.log(`  ya    ${f.acta} · ya estaba cargada`); }
  else { mal++; console.log(`  FALLA ${f.acta} · ${r.status} ${d.codigo || ''} ${d.error || ''}`); }
}

console.log(`\n  ${bien} cargada(s), ${mal} con fallo\n`);
const v = await fetch(`${API}/precio-declarado/${TOKEN}`).then(r => r.json()).catch(() => null);
if (v) console.log(`  el API dice ahora: vigente ${v.vigente ? '$' + v.vigente.precio + ' · acta ' + v.vigente.acta : 'ninguna'} · ${v.serie.length} resolucion(es)\n`);
process.exit(mal ? 1 : 0);
