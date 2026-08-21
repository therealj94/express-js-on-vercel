/* Ninguna pantalla puede mostrar una clave cruda.
 *
 * `t('cha.cancelar')` con esa clave sin escribir no revienta: devuelve la clave
 * y la persona lee «cha.cancelar» en un botón. Es el fallo más barato de
 * cometer y el más caro de ver, porque solo aparece en la pantalla concreta y
 * en el idioma concreto donde falta. Aquí se recorren todas las llamadas del
 * código y se exige que cada una exista en ESPAÑOL y en INGLÉS.
 *
 * Dos cosas que este comprobador aprendió a la mala:
 *  · el valor puede ir entre comillas dobles ("We're building this"), así que
 *    la clave se reconoce por el nombre, no por cómo se escribió el valor;
 *  · hay claves que se arman al vuelo —t('nu.' + m.id), t('bien.' + c.k + 'T')—
 *    y esas se expanden con las listas reales del código en vez de darlas por
 *    rotas.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => { try { return readFileSync(join(R, f), 'utf8'); } catch { return ''; } };
const i18n = leer('i18n.js');

const corte = (nom) => {
  const i = i18n.indexOf('\n' + nom + ': {');
  if (i < 0) throw new Error('no encuentro el bloque ' + nom);
  const fin = i18n.indexOf('\n},', i);
  return i18n.slice(i, fin < 0 ? i18n.indexOf('\n};', i) : fin);
};
// el nombre de la clave siempre va en comillas simples; el valor, como quiera
const clavesDe = (txt) => new Set([...txt.matchAll(/'([\w.]+)':/g)].map((m) => m[1]));
const ES = clavesDe(corte('es')), EN = clavesDe(corte('en'));

const FUENTES = ['app.js', 'chat.js', 'aura.js', 'cadena.js', 'qr.js', 'datos.js',
                 'telemetria.js', 'index.html'];
const usadas = new Map();
const apuntar = (k, f) => { if (!usadas.has(k)) usadas.set(k, f); };

for (const f of FUENTES) {
  const txt = leer(f);
  for (const m of txt.matchAll(/\bt\(\s*'([\w.]+)'\s*\)/g)) apuntar(m[1], f);
  /* En el HTML el texto se marca con data-t (y data-tp para el placeholder).
     La primera versión de este comprobador solo miraba `data-i18n`, que no
     existe en esta casa: decía «todo en verde» sin haber mirado una sola
     línea de la portada. Un comprobador que no comprueba es peor que no
     tenerlo, porque además tranquiliza. */
  for (const m of txt.matchAll(/data-tp?="([\w.]+)"/g)) apuntar(m[1], f);
}

/* Las que se arman al vuelo. Cada entrada dice de dónde salen las piezas. */
const app = leer('app.js');
const trozos = (re, txt = app) => [...txt.matchAll(re)].map((m) => m[1]);
const dinamicas = [
  // t('nu.' + m.id) — los módulos del Núcleo
  ...trozos(/\{\s*id:\s*'(\w+)'/g).map((id) => ['nu.' + id, 'app.js · Núcleo']),
  // t('bien.' + c.k + 'K'|'T'|'P') — los capítulos de la bienvenida
  ...trozos(/\{\s*k:\s*'(\w+)'/g).flatMap((k) =>
    ['K', 'T', 'P'].map((s) => ['bien.' + k + s, 'app.js · bienvenida'])),
  // t('cha.e' + k + 'T'|'P') — los estados vacíos del chat
  ...trozos(/chatVacio\(\s*'(\w+)'/g).flatMap((k) =>
    ['T', 'P'].map((s) => ['cha.e' + k + s, 'app.js · chat vacío'])),
];
for (const [k, f] of dinamicas) if (ES.has(k) || EN.has(k)) apuntar(k, f);

let mal = 0;
const decir = (m) => { mal++; console.log('  ' + m); };
for (const [k, f] of [...usadas].sort()) {
  if (!ES.has(k)) decir(`FALTA en español   ${k}   (${f})`);
  if (!EN.has(k)) decir(`FALTA en inglés    ${k}   (${f})`);
}
for (const k of [...ES].sort()) if (!EN.has(k)) decir(`DESPAREJA          ${k}   está en español y no en inglés`);
for (const k of [...EN].sort()) if (!ES.has(k)) decir(`DESPAREJA          ${k}   está en inglés y no en español`);

/* CLAVES REPETIDAS.
 *
 * En un objeto de JavaScript, escribir la misma clave dos veces no da ningún
 * error: la segunda pisa a la primera, en silencio. Pasó de verdad —
 * `cha.desbloquear` se usaba para desatascar el chat y se volvió a escribir
 * para desbloquear a una persona— y el resultado fue un botón que decía
 * «Desbloquear el chat» debajo del nombre de alguien.
 *
 * Los conteos de arriba no lo pueden ver: un Set cuenta una sola vez lo que
 * está dos. Hay que contar las LÍNEAS del archivo.
 */
// Se reusa `corte()`, que ya sabe dónde empieza y acaba cada bloque: partir el
// archivo a ojo por una frase suelta es como se cuentan 351 repetidas que no
// existen.
for (const [idioma, trozo] of [['español', corte('es')], ['inglés', corte('en')]]) {
  const cuenta = new Map();
  for (const m of trozo.matchAll(/^\s*'([\w.]+)':/gm)) cuenta.set(m[1], (cuenta.get(m[1]) || 0) + 1);
  for (const [k, n] of cuenta) {
    if (n > 1) decir(`REPETIDA en ${idioma}   ${k}   ×${n} — la segunda pisa a la primera sin avisar`);
  }
}

console.log(`${ES.size} claves en español · ${EN.size} en inglés · ${usadas.size} usadas en el código`);
console.log(mal ? `\n${mal} problema(s)` : '\nTodo en verde');
process.exit(mal ? 1 : 0);
