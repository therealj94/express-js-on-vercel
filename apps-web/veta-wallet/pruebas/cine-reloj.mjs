/* EL RELOJ DE LA PELÍCULA.
 *
 *   node pruebas/cine-reloj.mjs      (no necesita navegador: lee los archivos)
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * Dos cosas que se sienten pero no se ven, y que por eso se rompen sin que
 * nadie se entere hasta que ya está proyectada:
 *
 *  1. QUE LA PELÍCULA DURE LO QUE DURA LA CANCIÓN. Si se pasa, la música se
 *     acaba antes que la historia y el final se cuenta en silencio — que es
 *     exactamente el momento en que no puede pasar. Agregar un plano de ocho
 *     segundos es facilísimo; darse cuenta de que ya no cierra, no.
 *
 *  2. QUE CADA PLANO SE PUEDA LEER SIN APURO. «No es tan rápido» no es una
 *     opinión: es una cuenta. Un momento para registrar que la pantalla
 *     cambió, las palabras a la velocidad de una lectura tranquila, y un
 *     momento para salir antes de que entre la siguiente. Si un plano no llega
 *     a esa cuenta, alguien va a leerlo a medias — y medio renglón leído es
 *     peor que ninguno.
 *
 * Cuando la cuenta no cierra hay que recortar CONTENIDO. Acelerar la lectura
 * es hacer trampa con quien está mirando.
 *
 * La duración de la canción se mide del propio MP3, recorriendo sus tramas: no
 * hay un número escrito a mano que se pueda quedar viejo cuando se cambie la
 * pista.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const AET = join(RAIZ, '..', 'aetherion', 'src', 'kernel', 'genesis.ts');

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };

/* ── CUÁNTO DURA LA CANCIÓN ────────────────────────────────────────────────
   Se suman las tramas MPEG. Cada una lleva 1152 muestras, así que su duración
   es 1152/frecuencia — y sumándolas todas sale el largo exacto, sin depender
   de la cabecera, que en un MP3 de tasa variable miente. */
function duracionMp3(ruta) {
  const TASAS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const FREQ = { 0: 44100, 1: 48000, 2: 32000 };
  const d = readFileSync(ruta);
  let i = 0;
  if (d[0] === 0x49 && d[1] === 0x44 && d[2] === 0x33) {
    i = 10 + ((d[6] & 0x7f) << 21 | (d[7] & 0x7f) << 14 | (d[8] & 0x7f) << 7 | (d[9] & 0x7f));
  }
  let dur = 0;
  while (i < d.length - 4) {
    if (d[i] === 0xFF && (d[i + 1] & 0xE0) === 0xE0) {
      const ver = (d[i + 1] >> 3) & 3, capa = (d[i + 1] >> 1) & 3;
      const br = (d[i + 2] >> 4) & 15, sr = (d[i + 2] >> 2) & 3, pad = (d[i + 2] >> 1) & 1;
      if (ver === 3 && capa === 1 && br !== 0 && br !== 15 && sr !== 3) {
        const fr = FREQ[sr];
        dur += 1152 / fr;
        i += Math.floor(144 * TASAS[br] * 1000 / fr) + pad;
        continue;
      }
    }
    i++;
  }
  return dur;
}

/* ── LO QUE TARDA EN LEERSE UN RÓTULO ──────────────────────────────────────
   Registrar que la pantalla cambió, leer, y salir. Dos coma seis palabras por
   segundo es una lectura tranquila en español — la de alguien que está mirando
   una película, no la de alguien que estudia. */
const REGISTRO = 1.9, SALIDA = 1.1, PPS = 2.6;
const leer = (t) => REGISTRO + String(t).replace(/\n/g, ' ').trim().split(/\s+/).length / PPS + SALIDA;

const cancion = duracionMp3(join(RAIZ, 'assets', 'aud', 'cosmos.mp3'));
const app = readFileSync(join(RAIZ, 'app.js'), 'utf8');
const gen = readFileSync(AET, 'utf8');

/* ── EL GUION, LEÍDO DEL CÓDIGO ────────────────────────────────────────────── */
const bloque = gen.slice(gen.indexOf('const guion: Acto[] = ['), gen.indexOf('  let i = -1'));
const actos = [];
for (const linea of bloque.split('\n')) {
  const m = linea.match(/clave: '([^']+)', dura: (\d+)/);
  if (m) { actos.push({ clave: m[1], dura: +m[2] / 1000 }); continue; }
  if (linea.includes('casas.map')) {
    const d = +bloque.slice(bloque.indexOf(linea)).match(/dura: (\d+)/)[1] / 1000;
    actos.push({ clave: 'FILA', dura: d, fila: true });
  }
}

/* ── LOS TEXTOS ────────────────────────────────────────────────────────────── */
const es = app.slice(app.indexOf('    return es ? {'), app.indexOf('    } : {', app.indexOf('    return es ? {')));
const textos = {};
for (const m of es.matchAll(/^ {6}(\w+): '((?:[^'\\]|\\.)*)'/gm)) textos[m[1]] = m[2].replace(/\\n/g, ' ');
const mundos = {};
for (const m of es.matchAll(/(\w+): \['([^']+)', '([^']+)'\]/g)) mundos[m[1]] = `${m[2]} ${m[3]}`;
const fila = (app.match(/casas: \['([^\]]+)\]/) || [, ''])[1].replace(/['\s]/g, '').split(',').filter(Boolean);

console.log('\n── la película entra en la canción ──────────────────────────');
{
  let total = 0;
  for (const a of actos) total += a.fila ? a.dura * fila.length : a.dura;
  ok('la canción se midió del propio archivo', cancion > 60,
     `${cancion.toFixed(1)} s = ${Math.floor(cancion / 60)}:${String(Math.round(cancion % 60)).padStart(2, '0')}`);
  /* NO SE PASA. Que sobre un poco de canción está bien —la música cierra sola
     detrás del último rótulo—; que falte, no: el final se contaría en
     silencio, y ese es justo el momento que no puede quedarse sin música. */
  ok('y la película no se pasa de la canción', total <= cancion,
     `${total.toFixed(1)} s de película · ${cancion.toFixed(1)} s de canción · margen ${(cancion - total).toFixed(1)} s`);
  ok('ni se queda corta de más', total >= cancion - 12,
     `sobrarían ${(cancion - total).toFixed(1)} s de música`);
}

console.log('\n── todo se puede leer sin apuro ─────────────────────────────');
{
  /* Cuánto TEXTO tiene cada acto. Los mundos llevan rótulo y una línea; MINAS
     y DBNX llevan además su frase, y esa entra más tarde, así que lo que hay
     que comprobar es lo que queda de acto DESPUÉS de que aparezca. */
  const dicho = {};
  const bd = es.match(/dicho: \{([\s\S]*?)\n {6}\},/);
  if (bd) for (const m of bd[1].matchAll(/(\w+): '((?:[^'\\]|\\.)*)'/g)) dicho[m[1]] = m[2].replace(/\\n/g, ' ');

  const apurados = [];
  const revisar = (nombre, txt, dura) => {
    if (!txt) return;
    const hace = leer(txt);
    if (dura + 0.05 < hace) apurados.push(`${nombre}: ${dura.toFixed(1)}s para ${hace.toFixed(1)}s de lectura`);
  };
  for (const a of actos) {
    if (a.fila) { for (const k of fila) revisar(k, mundos[k], a.dura); continue; }
    if (a.clave.startsWith('casa:')) {
      const k = a.clave.slice(5);
      revisar(k, mundos[k], a.dura);
      /* La frase de MINAS y DBNX entra a los 3,4 s: lo que le queda de acto es
         lo que se tiene para leerla. */
      if (dicho[k]) revisar(`${k} (su frase)`, dicho[k], a.dura - 2.2);
      continue;
    }
    revisar(a.clave, textos[a.clave], a.dura);
  }
  ok('ningún plano pasa más rápido de lo que se lee', apurados.length === 0,
     apurados.join(' · '));
}

console.log('\n── en la creación no hay una palabra nuestra ────────────────');
{
  /* La Escritura se cita, no se mezcla. Una frase propia entre los versículos
     rompe el préstamo: deja de ser una cita y pasa a ser decoración. */
  const creacion = ['tinieblas', 'seaLuz', 'lumbreras', 'separo', 'bueno', 'fructificad'];
  const nuestras = /ORIGEN|cadena|moneda|ecosistema|Orden Global|wallet|oro/i;
  const coladas = creacion.filter((k) => textos[k] && nuestras.test(textos[k]));
  ok('los versículos están limpios', coladas.length === 0, coladas.join(' '));
  ok('y están todos', creacion.every((k) => !!textos[k]),
     creacion.filter((k) => !textos[k]).join(' ') || 'los seis');
  /* Y LA RIMA CENTRAL, que es lo que hace que la película sea una y no dos:
     el versículo separa la luz de las tinieblas, y nosotros separamos el valor
     de la promesa. Si alguien reescribe una de las dos sin la otra, se pierde. */
  ok('la rima central sigue en pie',
     /separó/i.test(textos.separo || '') && /separar/i.test(textos.origen || ''),
     `«${(textos.separo || '').slice(0, 38)}…» ↔ «${(textos.origen || '').slice(0, 38)}…»`);
}

console.log('\n── el arco está completo ────────────────────────────────────');
{
  const claves = actos.map((a) => a.clave);
  const debe = ['titulo', 'tinieblas', 'seaLuz', 'lumbreras', 'FILA', 'universo',
    'separo', 'origen', 'respaldo', 'casa:minas', 'cadena', 'casa:dbnx',
    'bueno', 'obra', 'puente', 'fructificad', 'proposito', 'cierre'];
  ok('están los dieciocho planos y en orden', JSON.stringify(claves) === JSON.stringify(debe),
     claves.join(' '));
  ok('y se presentan los diez mundos', fila.length === 8,
     `${fila.length} en fila + MINAS + DBNX = ${fila.length + 2}`);
}

console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
