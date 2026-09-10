// La guarda de las delegaciones EIP-7702.
//
// POR QUÉ ESTA PRUEBA EXISTE. El 4 de septiembre se robaron 15 USDT de la
// billetera de gas anterior un bloque después de que llegaran, y se buscó
// durante horas una llave filtrada que no existía. Lo que había era una
// delegación EIP-7702: código de un drenador puesto encima de la cuenta con
// UNA firma. Lo que entra sale en la misma transacción.
//
// Aquí se comprueba que el fondeo de gas reconoce eso y NO manda. Con datos
// reales de la cadena, porque los dos casos que importan son reales:
//   · el «Forwarder» de Polygon, que apuntaba a 0xEc0Bcf45…74Dc9
//   · el drenador de BSC, que apuntaba a 0x40211616…9E2C, la dirección que
//     se llevó el dinero
// y el tercero, que también es real: la «cuenta inteligente» de MetaMask, que
// es una delegación legítima — pero a la que tampoco se le manda gas, porque
// desde el código no hay forma de distinguir una buena de una mala.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const d = require('../lib/delegacion.js');

let bien = 0;
const malos = [];
function comprobar(cond, que, detalle) {
  if (cond) { bien += 1; console.log(`  ok    ${que}`); return; }
  malos.push(que);
  console.log(`  FALLA ${que}${detalle !== undefined ? ` → ${detalle}` : ''}`);
}

// Las dos delegaciones de verdad que tenía la billetera vieja, tal como las
// devuelve eth_getCode.
const DRENADOR_BSC = '0xa19160b1b01396da5fb72927c033fd71c62d79df';
const FORWARDER_POLY = '0x31a12e00769f8ade55a9b6172f372fad7c251ad7';
const METAMASK = '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b';
const codigoDelegado = (a) => `0xef0100${a.slice(2)}`;

console.log('\n· leer el código');
const limpia = d.leer('0x');
comprobar(limpia.limpia === true && limpia.tipo === 'cuenta', 'una cuenta normal se lee como limpia');
comprobar(d.leer('').limpia === true, 'la cadena vacía también');
comprobar(d.leer(null).limpia === true, 'null también (el nodo a veces no devuelve nada)');

for (const [nombre, a] of [['el drenador de BSC', DRENADOR_BSC], ['el Forwarder de Polygon', FORWARDER_POLY], ['la cuenta inteligente de MetaMask', METAMASK]]) {
  const l = d.leer(codigoDelegado(a));
  comprobar(l.tipo === 'delegacion', `${nombre} se lee como delegación`, l.tipo);
  comprobar(l.limpia === false, `${nombre} NO cuenta como limpia`);
  comprobar(l.delegado === a.toLowerCase(), `${nombre} dice hacia dónde apunta`, l.delegado);
}

// Mayúsculas: el nodo puede devolver el código con la dirección en checksum.
comprobar(d.leer(`0xEF0100${DRENADOR_BSC.slice(2).toUpperCase()}`).tipo === 'delegacion',
  'la reconoce aunque venga en mayúsculas');

console.log('\n· contratos de verdad');
// 1.524 bytes: el tamaño real del drenador de BSC. Un contrato no es una
// delegación, pero tampoco es una cuenta: a una dirección de depósito con
// código de contrato tampoco se le manda nada.
const gordo = d.leer(`0x${'60'.repeat(1524)}`);
comprobar(gordo.tipo === 'contrato', 'un contrato se lee como contrato', gordo.tipo);
comprobar(gordo.limpia === false, 'y no cuenta como limpio');
comprobar(gordo.delegado === null, 'y no finge tener un delegado');
// El caso que se cuela si uno mide sólo el prefijo: la longitud correcta pero
// otro prefijo, o el prefijo correcto con la longitud mal.
comprobar(d.leer(`0xff0100${DRENADOR_BSC.slice(2)}`).tipo === 'contrato', 'otro prefijo del mismo largo NO es delegación');
comprobar(d.leer('0xef0100').tipo === 'contrato', 'el prefijo suelto, sin dirección, tampoco');

console.log('\n· preguntarle a la cadena');
const falso = (codigo) => ({ _red: 't', getCode: async () => codigo });
const rota = (msg) => ({ _red: 't', getCode: async () => { throw new Error(msg); } });

d._adentro.olvidar();
let r = await d.de(falso('0x'), '0x0000000000000000000000000000000000000001');
comprobar(r.ok === true && r.limpia === true, 'una cuenta normal: ok y limpia');

d._adentro.olvidar();
r = await d.de(falso(codigoDelegado(DRENADOR_BSC)), '0x0000000000000000000000000000000000000002');
comprobar(r.ok === true && r.limpia === false && r.delegado === DRENADOR_BSC,
  'una delegada: ok, no limpia, y con el delegado');

// LA REGLA QUE MÁS IMPORTA. Si el nodo no contesta no se supone que está
// limpia: se devuelve ok:false y quien llama decide. Una lectura que falla no
// es un permiso.
d._adentro.olvidar();
r = await d.de(rota('el nodo no contesta'), '0x0000000000000000000000000000000000000003');
comprobar(r.ok === false, 'si el nodo falla, ok:false');
comprobar(r.limpia === false, 'y NUNCA se da por limpia');
comprobar(typeof r.error === 'string' && r.error.length > 0, 'y dice por qué', r.error);

console.log('\n· la memoria corta');
d._adentro.olvidar();
let veces = 0;
const contador = { _red: 't', getCode: async () => { veces += 1; return '0x'; } };
await d.de(contador, '0x0000000000000000000000000000000000000004');
await d.de(contador, '0x0000000000000000000000000000000000000004');
comprobar(veces === 1, 'dentro de la vuelta no pregunta dos veces por la misma', veces);
await d.de(contador, '0x0000000000000000000000000000000000000005');
comprobar(veces === 2, 'pero otra dirección sí se pregunta', veces);
// Y caduca: una delegación se pone con una firma, en segundos. Recordarla
// mucho rato sería fondear a ciegas una dirección que ya cambió.
await d.de(contador, '0x0000000000000000000000000000000000000004', { ahora: Date.now() + d._adentro.PLAZO_MEMORIA_MS + 1 });
comprobar(veces === 3, 'y pasado el plazo se vuelve a preguntar', veces);
comprobar(d._adentro.PLAZO_MEMORIA_MS <= 60_000, 'el plazo es corto: como mucho un minuto', d._adentro.PLAZO_MEMORIA_MS);
// Un fallo no se guarda: si el nodo se cae un segundo, la siguiente vuelta
// tiene que poder preguntar otra vez.
d._adentro.olvidar();
let intentos = 0;
const inestable = { _red: 't', getCode: async () => { intentos += 1; if (intentos === 1) throw new Error('caído'); return '0x'; } };
const dir = '0x0000000000000000000000000000000000000006';
comprobar((await d.de(inestable, dir)).ok === false, 'el primer intento falla');
comprobar((await d.de(inestable, dir)).ok === true, 'y el fallo NO se queda guardado: el segundo pregunta de nuevo');

console.log('\n· cómo se explica');
const del = d.leer(codigoDelegado(FORWARDER_POLY));
const texto = d.motivo(del, '0x8E839Af7A405f49bf72B239929b8ee3c07Ee7ba0');
comprobar(/7702/.test(texto), 'el motivo nombra el EIP-7702', texto);
comprobar(texto.includes(FORWARDER_POLY), 'y dice hacia dónde apunta');
comprobar(texto.includes('0x8E839Af7A405f49bf72B239929b8ee3c07Ee7ba0'), 'y de qué dirección habla');
comprobar(d.motivo(d.leer('0x'), '0xabc') === null, 'de una cuenta normal no dice nada');

console.log('\n· el fondeo de gas se niega');
// La guarda de verdad, dentro de asegurarGas: con una dirección delegada no
// se firma nada. Se comprueba con la billetera de gas SIN configurar, que es
// el estado de una máquina de pruebas: aun así la respuesta nunca puede ser
// 'enviado'.
const gas = require('../lib/gas.js');
comprobar(typeof gas.formaPropia === 'function', 'gas.formaPropia existe para revisar la billetera sin fondear');
const fuente = require('node:fs').readFileSync(new URL('../lib/gas.js', import.meta.url), 'utf8');
comprobar(/delegacion\.de\(pv, provisional\)/.test(fuente),
  'asegurarGas pregunta por la dirección de destino antes de firmar');
comprobar(/estado: 'delegada'/.test(fuente), "y tiene un estado propio: 'delegada'");
// El orden importa: la comprobación va DENTRO de enFila y ANTES del envío.
const iGuarda = fuente.indexOf('delegacion.de(pv, provisional)');
const iEnvio = fuente.indexOf('c.billetera.connect(pv).sendTransaction');
comprobar(iGuarda > 0 && iEnvio > 0 && iGuarda < iEnvio, 'y va antes de firmar, no después');
comprobar(/no se pudo comprobar si .* está delegada/.test(fuente),
  'si no se puede comprobar, tampoco se manda');

console.log(`\n${malos.length ? `FALLARON ${malos.length} de ${bien + malos.length}` : 'Todo en verde'}`);
if (malos.length) process.exit(1);
