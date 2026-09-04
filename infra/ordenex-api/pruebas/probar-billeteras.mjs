// Las billeteras de la casa: que estén bien escritas y que se reconozcan.
//
// POR QUÉ ESTA PRUEBA EXISTE. Una dirección mal copiada no da error en ningún
// sitio: se firma, se emite, y el dinero queda en una dirección que no es de
// nadie. El checksum de EIP-55 la detecta gratis y esta prueba lo obliga.
//
// Y sobre todo: la de gas anterior está COMPROMETIDA —un bot barredor se llevó
// 15 USDT un bloque después de que llegaran— así que hay una prueba dedicada a
// que siga reconocida como retirada. Si alguien la vuelve a poner de buena por
// costumbre o copiando un comentario viejo, aquí se cae.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { getAddress } = require('ethers');
const b = require('../lib/billeteras.js');

let bien = 0;
const malos = [];
function comprobar(cond, que, detalle) {
  if (cond) { bien += 1; console.log(`  ok    ${que}`); return; }
  malos.push(que);
  console.log(`  FALLA ${que}${detalle !== undefined ? ` → ${detalle}` : ''}`);
}

console.log('\n· las tres de ahora');
for (const [nombre, dir] of Object.entries({ UNICA: b.UNICA, GAS: b.GAS, ORIGEN: b.ORIGEN })) {
  comprobar(typeof dir === 'string' && /^0x[0-9a-fA-F]{40}$/.test(dir), `${nombre} tiene forma de dirección`, dir);
  let ok = false;
  try { ok = getAddress(dir) === dir; } catch { ok = false; }
  comprobar(ok, `${nombre} pasa el checksum de EIP-55`, dir);
}

// Que sean tres y no dos. Si dos apuntan a la misma, el barrido mandaría el
// dinero a la que paga el gas y el gas se gastaría de la caja: un solo error
// de copiar y pegar y las dos cuentas dejan de cuadrar a la vez.
const ahora = [b.UNICA, b.GAS, b.ORIGEN];
comprobar(new Set(ahora.map((d) => d.toLowerCase())).size === 3,
  'las tres de ahora son distintas entre sí', ahora.join(' '));

console.log('\n· las retiradas');
const retiradas = Object.keys(b.RETIRADAS);
comprobar(retiradas.length >= 5, 'están las cinco viejas escritas', retiradas.length);
for (const d of retiradas) {
  let ok = false;
  try { ok = getAddress(d) === d; } catch { ok = false; }
  comprobar(ok, `la retirada ${d.slice(0, 10)}… pasa el checksum`, d);
  comprobar(typeof b.RETIRADAS[d] === 'string' && b.RETIRADAS[d].length > 3,
    `la retirada ${d.slice(0, 10)}… dice qué era`, b.RETIRADAS[d]);
}

// Ninguna vieja puede seguir en uso. Es la prueba que caza el cambio a medias:
// se cambian dos constantes de tres y la tercera queda apuntando a la anterior.
const enUso = new Set(ahora.map((d) => d.toLowerCase()));
for (const d of retiradas) {
  comprobar(!enUso.has(d.toLowerCase()), `la retirada ${d.slice(0, 10)}… ya no está en uso`, d);
}

console.log('\n· la comprometida');
const COMPROMETIDA = '0x8E839Af7A405f49bf72B239929b8ee3c07Ee7ba0';
comprobar(retiradas.some((d) => d.toLowerCase() === COMPROMETIDA.toLowerCase()),
  'la de gas del 4 de septiembre sigue en la lista de retiradas');
comprobar(/COMPROMETIDA/i.test(b.porQueRetirada(COMPROMETIDA) || ''),
  'y dice que está comprometida, no solo que es vieja', b.porQueRetirada(COMPROMETIDA));
comprobar(b.GAS.toLowerCase() !== COMPROMETIDA.toLowerCase(),
  'y la de gas de ahora NO es ella');

console.log('\n· reconocerlas');
for (const d of [...ahora, ...retiradas]) {
  comprobar(b.esDeLaCasa(d), `esDeLaCasa reconoce ${d.slice(0, 10)}…`);
}
// En minúsculas y en mayúsculas: una dirección llega como la escribe quien la
// pega, y un retiro no se puede colar solo por venir sin checksum.
comprobar(b.esDeLaCasa(b.UNICA.toLowerCase()), 'la reconoce en minúsculas');
comprobar(b.esDeLaCasa(b.UNICA.toUpperCase().replace('0X', '0x')), 'la reconoce en mayúsculas');
comprobar(!b.esDeLaCasa('0x1111111111111111111111111111111111111111'), 'una ajena NO es de la casa');
comprobar(!b.esDeLaCasa(''), 'la cadena vacía no es de la casa');
comprobar(!b.esDeLaCasa(null), 'null no es de la casa');
comprobar(!b.esDeLaCasa(undefined), 'undefined no es de la casa');

console.log('\n· por qué se rechaza');
comprobar(b.porQueRetirada(b.UNICA) === null, 'de una en uso no dice nada: no es retirada');
comprobar(b.porQueRetirada('0x1111111111111111111111111111111111111111') === null, 'de una ajena tampoco');
// Que no reviente con basura: esto lo llama el retiro con lo que mande el
// cliente, y una excepción ahí sería un 500 donde toca un 400.
for (const basura of ['no soy una dirección', '0x', '', null, undefined, 42, {}]) {
  let salida = 'REVENTÓ';
  try { salida = b.porQueRetirada(basura); } catch { /* queda REVENTÓ */ }
  comprobar(salida === null, `con ${JSON.stringify(basura) || String(basura)} devuelve null y no lanza`, salida);
}
// Y la comprometida la reconoce venga como venga escrita.
comprobar(/COMPROMETIDA/i.test(b.porQueRetirada(COMPROMETIDA.toLowerCase()) || ''),
  'reconoce la comprometida en minúsculas');

console.log('\n· nadie más las escribe a mano');
// El motivo de que este archivo exista es que haya UN sitio. Si otro módulo
// vuelve a escribir una dirección literal, el día del cambio se cambia aquí y
// el otro se queda viejo — que es exactamente lo que pasó esta vez.
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const dirLib = new URL('../lib/', import.meta.url).pathname;
const literal = /0x(?:8E839Af7|3E531Ce4|DE451Ac0|6A1aeD0B|746268404|8832E2D5|8861427c|DE23eb4E)/i;
for (const f of readdirSync(dirLib).filter((n) => n.endsWith('.js') && n !== 'billeteras.js')) {
  const txt = readFileSync(join(dirLib, f), 'utf8');
  comprobar(!literal.test(txt), `lib/${f} no escribe ninguna dirección de la casa a mano`);
}

console.log(`\n${malos.length ? `FALLARON ${malos.length} de ${bien + malos.length}` : 'Todo en verde'}`);
if (malos.length) process.exit(1);
