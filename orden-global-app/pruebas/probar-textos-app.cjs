// ═══ LOS TEXTOS DE LA APP ════════════════════════════════════════════════
// node pruebas/probar-textos-app.cjs
//
// Tres cosas que se rompen sin que nadie lo vea hasta que alguien lo lee en
// el teléfono, en el idioma concreto donde falta:
//
//   1. Que cada clave exista en ESPAÑOL y en INGLÉS. `t('cp.cta')` sin la
//      clave no revienta: enseña «cp.cta» en un botón.
//   2. Que ninguna clave esté escrita dos veces en el mismo idioma: la
//      segunda pisa a la primera en silencio.
//   3. Que las pantallas de la persona común no digan «token», «wallet
//      address», «Swap» ni «(Seed)», y que ningún texto diga que «vos tenés
//      las llaves»: el backend firma, y decir lo contrario es mentir.
//
// i18n.js importa React, así que no se evalúa: se leen los dos bloques con
// expresiones regulares, igual que hace la prueba de textos de la web.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const i18n = fs.readFileSync(path.join(raiz, 'src', 'i18n.js'), 'utf8');

const corte = (nom) => {
  const i = i18n.indexOf('\n  ' + nom + ': {');
  if (i < 0) throw new Error('no encuentro el bloque ' + nom);
  const fin = i18n.indexOf('\n  },', i);
  return i18n.slice(i, fin);
};
const bloque = { es: corte('es'), en: corte('en') };
const clavesDe = (txt) => new Set([...txt.matchAll(/'([\w.-]+)':/g)].map((m) => m[1]));
const ES = clavesDe(bloque.es), EN = clavesDe(bloque.en);

let pasan = 0;
const fallos = [];
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { pasan += 1; return; }
  fallos.push(nombre + (detalle ? `  (${detalle})` : ''));
};

// ── 1. paridad ────────────────────────────────────────────────────────────
const soloEs = [...ES].filter((k) => !EN.has(k));
const soloEn = [...EN].filter((k) => !ES.has(k));
prueba('toda clave en español está en inglés', soloEs.length === 0, soloEs.slice(0, 8).join(', '));
prueba('toda clave en inglés está en español', soloEn.length === 0, soloEn.slice(0, 8).join(', '));

// ── 2. repetidas ──────────────────────────────────────────────────────────
for (const [idioma, txt] of Object.entries(bloque)) {
  const cuenta = new Map();
  for (const m of txt.matchAll(/'([\w.-]+)':/g)) cuenta.set(m[1], (cuenta.get(m[1]) || 0) + 1);
  const rep = [...cuenta].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
  prueba(`sin claves repetidas en ${idioma}`, rep.length === 0, rep.slice(0, 8).join(', '));
}

// ── 3. las claves que usan las pantallas nuevas ───────────────────────────
const usadas = new Set();
for (const f of ['src/screens/Trade.js', 'src/screens/ChangePassword.js', 'src/screens/More.js']) {
  const s = fs.readFileSync(path.join(raiz, f), 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'([\w.-]+)'/g)) usadas.add(m[1]);
}
const faltan = [...usadas].filter((k) => !ES.has(k) || !EN.has(k));
prueba('todo lo que piden Enviar, Cambiar contraseña y Ajustes existe en los dos idiomas', faltan.length === 0, faltan.join(', '));

// ── 4. sin jerga en las pantallas de la persona común ─────────────────────
const valor = (idioma, k) => {
  const m = bloque[idioma].match(new RegExp(`'${k.replace('.', '\\.')}':\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`));
  return m ? (m[1] ?? m[2]) : null;
};
const SIN_JERGA = ['tab.home', 'tab.swap', 'home.swap', 'home.assets', 'set.seed', 'tok.native', 'send.hash', 'prof.wallet',
  'act.emptyP', 'notif.gotToast', 'set.notifsSub', 'recv.scan', 'help.q2t', 'help.q1p', 'send.to', 'send.estado', 'cp.title'];
for (const k of SIN_JERGA) {
  const es = valor('es', k) || '';
  prueba(`«${k}» no dice token/wallet/swap/seed/hash en español`, !/\btokens?\b|wallet address|\bswap\b|\(seed\)|\bhash\b/i.test(es), es);
}
prueba('la pestaña de la casa se llama Billetera', valor('es', 'tab.home') === 'Billetera', valor('es', 'tab.home'));
prueba('«Tu plata» es lo que hay en la billetera', valor('es', 'home.assets') === 'Tu plata', valor('es', 'home.assets'));

// ── 5. la verdad sobre las llaves ─────────────────────────────────────────
const MENTIRA = /tus reglas|tenés las llaves|tenes las llaves|las llaves son tuyas|única forma de recuperar|lo único que da acceso|your rules|you hold the keys|only way to recover|only way in/i;
for (const idioma of ['es', 'en']) {
  const culpables = [...bloque[idioma].matchAll(/'([\w.-]+)':\s*'((?:[^'\\]|\\.)*)'/g)].filter((m) => MENTIRA.test(m[2])).map((m) => m[1]);
  prueba(`ningún texto en ${idioma} dice que la persona tiene las llaves o que sin la frase no se entra`, culpables.length === 0, culpables.join(', '));
}
prueba('Ajustes dice quién guarda las llaves', /guarda las llaves por vos/.test(valor('es', 'set.custodiaNota') || ''));
prueba('y la ayuda dice que se entra con el correo desde otro teléfono', /correo/.test(valor('es', 'help.q4p') || ''));

// ── 6. sin «respaldado / regulado» sobre ORIGEN, AUKA y AGKA ─────────────
const data = fs.readFileSync(path.join(raiz, 'src', 'data.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
prueba('data.js no dice «respaldado» ni «Respaldo» en las fichas', !/respaldad|'Respaldo'/i.test(data));
prueba('las fichas dicen «Referencia»', /\['Referencia',/.test(data));

for (const f of fallos) console.log('  FALLA ' + f);
console.log(fallos.length ? `\n${fallos.length} en rojo (${pasan} en verde)\n` : `\n✓ ${pasan} pruebas en verde · ${ES.size} claves en cada idioma\n`);
process.exit(fallos.length ? 1 : 0);
