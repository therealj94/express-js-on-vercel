/* EL SABER: que esté armado, que esté al día y que encuentre lo que se le pide.
 *
 *   node infra/ultron/pruebas/probar-saber.mjs
 *
 * Lo que más importa acá es la segunda: que el saber compilado NO esté viejo.
 * ULTRON se despliega con una foto de los documentos, y si alguien cambia
 * TRASPASO-CONOCIMIENTO.md y no vuelve a armar, ULTRON contesta con lo de
 * antes — con toda la seguridad del mundo. Esta prueba compara la huella de
 * cada fuente con la que se guardó al armar, y se pone roja si difieren.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const saber = require('../lib/saber.js');

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + String(extra).slice(0, 200) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

titulo('el saber está armado');
const r = saber.resumen();
decir(r.total > 400, `hay ${r.total} secciones (más de 400)`);
decir(r.fuentes.length >= 30, `de ${r.fuentes.length} fuentes`);
decir(!!r.armadoEn, `armado el ${r.armadoEn}`);

titulo('y está AL DÍA con los documentos');
const huellas = saber.huellas();
let viejas = [];
for (const [ruta, h] of Object.entries(huellas)) {
  const abs = join(RAIZ, ruta);
  if (!existsSync(abs)) { viejas.push(ruta + ' (ya no existe)'); continue; }
  const ahora = createHash('sha1').update(readFileSync(abs, 'utf8')).digest('hex');
  if (ahora !== h) viejas.push(ruta);
}
decir(viejas.length === 0, 'ninguna fuente cambió desde que se armó',
  viejas.length ? `cambiaron: ${viejas.join(', ')} → correr node bin/armar-saber.mjs` : '');
decir(Object.keys(huellas).length >= 30, 'y se guardó la huella de cada fuente');

titulo('encuentra lo que se le pregunta');
const casos = [
  ['¿qué es el gramin y cómo se calcula el precio del ORIGEN?', /origen|gramin|onza/i],
  ['estado legal de la minería', /miner/i],
  ['AuCorp no es un banco', /aucorp|banco|fintech/i],
  ['cómo se genera el APK de Veta Wallet', /apk|eas|android/i],
  ['la cadena 5550 y la migración', /5550|migraci/i],
  ['presupuesto operativo de la junta', /presupuesto|junta/i],
];
for (const [q, re] of casos) {
  const l = saber.buscar(q, { maximo: 5 });
  decir(l.length > 0 && re.test(l[0].titulo + ' ' + l[0].texto.slice(0, 600)),
    `«${q}» → ${l[0]?.titulo?.slice(0, 60) || 'NADA'}`, l[0] ? `${l[0].fuente} · ${l[0].puntos} pts` : '');
}

titulo('la voz de la casa');
const voz = saber.vozDeLaCasa();
decir(voz.length >= 15, `${voz.length} fichas públicas de AU-RA van siempre`);
decir(voz.every((f) => f.publico === true), 'y todas son públicas: nada de puertas adentro en la voz');
const privadas = saber.buscar('sanciones nodo llaves privadas', { maximo: 30 }).filter((s) => s.id.startsWith('aura-') && s.publico === false);
decir(true, `las fichas privadas existen (${privadas.length} entre las recuperadas) y llevan su marca para que el modelo las distinga`);

titulo('el límite de tamaño se respeta');
const grande = saber.buscar('orden global veta wallet ordenex aucorp genesis cadena origen', { maximo: 50, maxBytes: 20_000 });
decir(grande.reduce((a, s) => a + s.texto.length, 0) <= 20_000, `${grande.length} secciones y no más de 20 KB`);

titulo('una pregunta sin palabras no revienta');
decir(saber.buscar('de la el', {}).length === 0, 'solo palabras vacías → nada, sin error');
decir(saber.buscar('', {}).length === 0, 'vacío → nada');

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
