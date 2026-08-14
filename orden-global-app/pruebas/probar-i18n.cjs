/* Que los dos idiomas digan lo mismo: toda clave de es existe en en y al
 * revés, ninguna traducción vacía, y las variables {x} coinciden. */
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.js'), 'utf8');
const m = src.match(/export const D = (\{[\s\S]*?\n\});/);
const D = new Function('return ' + m[1])();
let mal = 0;
const ok = (c, msg) => { if (!c) { console.log('  ✕ ' + msg); mal++; } };
const es = Object.keys(D.es), en = Object.keys(D.en);
for (const k of es) ok(en.includes(k), `falta en inglés: ${k}`);
for (const k of en) ok(es.includes(k), `sobra en inglés: ${k}`);
for (const idi of ['es', 'en']) for (const k in D[idi]) {
  ok(String(D[idi][k]).trim().length > 0, `vacía: ${idi}.${k}`);
}
for (const k of es) {
  const v = (x) => (String(x).match(/\{\w+\}/g) || []).sort().join(',');
  ok(v(D.es[k]) === v(D.en[k] || ''), `variables distintas en ${k}`);
}
console.log((mal ? '' : '  ✓ ' + es.length + ' claves, parejas y completas\n') + 'fallos: ' + mal);
process.exitCode = mal ? 1 : 0;
