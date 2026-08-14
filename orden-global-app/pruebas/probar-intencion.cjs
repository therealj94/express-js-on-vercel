/* El traductor, a solas: cada frase de ejemplo resuelve a SU ruta, los tres
 * fallos fallan BIEN (contacto que no existe, monto que falta, fuera del
 * mapa), y toda ruta que el traductor devuelve existe en el mapa.
 *
 * Corre en node pelado: los módulos no importan nada de React Native a
 * propósito, y aquí se paga esa disciplina --se prueban sin emulador--.
 */
const fs = require('fs');
const path = require('path');
function cargar2(f) {
  // export function X → function X; export const X → const X; y al final se
  // exporta todo por nombre. Así las funciones se ven ENTRE ELLAS, que es lo
  // que un simple "exports.X =" rompía.
  let src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  const nombres = [...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]);
  src = src.replace(/^export /gm, '');
  src += '\n' + nombres.map((n) => `exports.${n} = ${n};`).join('\n');
  const exports = {};
  new Function('exports', src)(exports);
  return exports;
}

const { traducir, EJEMPLOS } = cargar2('intencion.js');
const { MAPA, aUri, deUri } = cargar2('rutas.js');

const LIBRETA = [
  { nombre: 'Juan', correo: 'juan@mail.com', addr: '0x7a3f00000000000000000000000000000000c210' },
  { nombre: 'María', correo: 'maria@mail.com', addr: '0x91b400000000000000000000000000000000d577' },
];

let mal = 0;
const ok = (cond, msg) => { console.log('  ' + (cond ? '✓' : '✕') + ' ' + msg); if (!cond) mal++; };

console.log('══ LAS FRASES DE EJEMPLO RESUELVEN (es y en)');
const ESPERADO = ['wallet/abrir', 'wallet/enviar', 'pay/abrir', 'scan/abrir',
  'cerebro/abrir', 'chat/abrir', 'pay/cobrar', 'id/abrir'];
for (const idi of ['es', 'en']) {
  EJEMPLOS[idi].forEach((f, i) => {
    const r = traducir(f, LIBRETA);
    ok(r && r.ruta === ESPERADO[i], `[${idi}] "${f}" → ${r ? r.ruta : 'null'} (esperaba ${ESPERADO[i]})`);
  });
}

console.log('\n══ EL ENVÍO SALE COMPLETO');
const e = traducir('envía 15,50 a Juan', LIBRETA);
ok(e && e.ruta === 'wallet/enviar' && e.params.monto === '15.50' && e.params.nombre === 'Juan'
   && /^0x7a3f/.test(e.params.to), 'monto normalizado y dirección de la libreta: ' + JSON.stringify(e && e.params));
const e2 = traducir('send 20 to María', LIBRETA);
ok(e2 && e2.params.monto === '20' && e2.params.nombre === 'María', 'en inglés y con tilde en el nombre');

console.log('\n══ LOS TRES FALLOS FALLAN BIEN');
ok((traducir('envía 15 a Ramón', LIBRETA) || {}).falla === 'sinContacto', 'contacto que no existe → sinContacto');
ok((traducir('envíale a Juan', LIBRETA) || {}).falla === 'sinMonto', 'sin cantidad → sinMonto');
ok(traducir('cómprame un carro', LIBRETA) === null, 'fuera del mapa → null, no se intenta');
ok(traducir('envía mil a Juan', LIBRETA).falla === 'sinMonto', 'cantidades en letras se piden con número');

console.log('\n══ TODA RUTA DEVUELTA EXISTE EN EL MAPA');
const RUTAS = new Set(Object.keys(MAPA));
const frases = [...EJEMPLOS.es, ...EJEMPLOS.en, 'envía 15 a Juan', 'quiero chatear con Juan', 'cóbrale 200'];
let fuera = 0;
for (const f of frases) {
  const r = traducir(f, LIBRETA);
  if (r && r.ruta && !RUTAS.has(r.ruta)) { console.log('  ✕ "' + f + '" → ' + r.ruta + ' NO ESTÁ EN EL MAPA'); fuera++; }
}
ok(fuera === 0, 'ninguna ruta huérfana');

console.log('\n══ URI IDA Y VUELTA');
const u = aUri('wallet/enviar', { to: '0xabc', monto: '15.5', nombre: 'Juan' });
const v = deUri(u);
ok(v && v.ruta === 'wallet/enviar' && v.params.monto === '15.5' && v.entrada.firma === true,
   u + ' → vuelve entero y con firma:true');
ok(deUri('og://no/existe') === null, 'una uri fuera del mapa no resuelve');
ok(MAPA['pay/abrir'].gid === true && MAPA['pay/cobrar'].gid === true, 'MyTokenPay exige Genesis ID');

console.log('\nfallos: ' + mal);
process.exitCode = mal ? 1 : 0;
