/* Los códigos de PULSE CHAT se leen desde los DOS lados.
 *
 * Hay dos formatos vivos y son el mismo ecosistema: `og://chat/…` lo imprime
 * el APK y `https://…/#chat?…` lo imprime la web. Durante un tiempo la web
 * entendía los dos y el teléfono solo el suyo: enseñar el código desde la web
 * y escanearlo con la app no hacía NADA — sin error y sin pista, que es la
 * peor forma de fallar, porque la persona cree que el código está mal.
 *
 * Esta prueba saca los dos lectores de su fichero de verdad —el de la app y el
 * de la web— y les da la MISMA lista de códigos. Si alguien vuelve a dejar uno
 * de los dos atrás, falla aquí.
 */
const { readFileSync } = require('node:fs');

const APP = '/home/user/express-js-on-vercel/orden-global-app/src/og/AuroChat.js';
const WEB = '/home/user/express-js-on-vercel/apps-web/veta-wallet/app.js';

// Se extrae la función del código real: si alguien la cambia, esto prueba a
// esa, no a una copia que se quedó vieja.
function sacar(ruta, arranque, fin) {
  const src = readFileSync(ruta, 'utf8');
  const i = src.indexOf(arranque);
  if (i < 0) throw new Error(`no encontré ${arranque} en ${ruta}`);
  const j = src.indexOf(fin, i);
  return src.slice(i, j + fin.length);
}

const cuerpoApp = sacar(APP, '  const leerCodigo = (crudo) => {', '\n  };');
// eslint-disable-next-line no-eval
const leerApp = eval(`(${cuerpoApp.replace(/^\s*const leerCodigo = /, '').replace(/;\s*$/, '')})`);

const cuerpoWeb = sacar(WEB, '  function leerInvitacion(crudo) {', '\n  }');
// eslint-disable-next-line no-eval
const leerWeb = eval(`(${cuerpoWeb.trim()})`);

const INV = 'a1b2c3d4e5f60718293a4b5c';

const CASOS = [
  ['código de persona, formato de la app', 'og://chat/abrir?con=ana%40ordenglobal.org', { con: 'ana@ordenglobal.org' }],
  ['código de persona, formato de la web', 'https://www.vetawallet.com/#chat?con=ana%40ordenglobal.org&gid=OG-1A2B-33', { con: 'ana@ordenglobal.org' }],
  ['invitación de grupo, formato de la app', `og://chat/grupo?inv=${INV}`, { inv: INV }],
  ['invitación de grupo, formato de la web', `https://www.vetawallet.com/#chat?inv=${INV}`, { inv: INV }],
  ['un QR de cualquier otra cosa', 'https://ejemplo.com/nada', null],
  ['una dirección suelta', '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2', null],
  ['una invitación con forma inventada', 'og://chat/grupo?inv=noesunpermiso', null],
  ['texto vacío', '', null],
];

let fallos = 0;
const igual = (r, esperado) => {
  if (!esperado) return !r || (!r.con && !r.inv);
  if (!r) return false;
  if (esperado.con) return String(r.con || '').toLowerCase() === esperado.con;
  return r.inv === esperado.inv;
};

for (const [nombre, codigo, esperado] of CASOS) {
  for (const [lado, leer] of [['app', leerApp], ['web', leerWeb]]) {
    let r = null, rompio = null;
    try { r = leer(codigo); } catch (e) { rompio = e.message; }
    const ok = !rompio && igual(r, esperado);
    if (!ok) {
      fallos++;
      console.log(`  FALLA [${lado}] ${nombre}`);
      console.log(`         devolvió ${rompio ? 'ERROR: ' + rompio : JSON.stringify(r)}, se esperaba ${JSON.stringify(esperado)}`);
    } else {
      console.log(`  ok    [${lado}] ${nombre}`);
    }
  }
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nLos dos lados leen los dos formatos');
process.exit(fallos ? 1 : 0);
