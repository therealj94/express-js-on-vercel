/* La comisión de salida: 1 %, y solo al salir.
 *
 *   node pruebas/probar-comision.mjs
 *
 * «Comisión para salir, nada más, es de 1 %.» Las tres partes se prueban:
 * que sea 1 %, que sea SOLO al salir (entrar no cobra), y que no haya otra
 * escondida. Y sobre todo que la cuenta de la pantalla y la del servidor den
 * el MISMO número: un desglose que no cuadra con el recibo es peor que no
 * enseñar desglose.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readFileSync } = require('node:fs');

const c = require('../lib/comisionSalida.js');

let bien = 0;
const malos = [];
function comprobar(cond, que, detalle) {
  if (cond) { bien += 1; console.log(`  ok    ${que}`); return; }
  malos.push(que);
  console.log(`  FALLA ${que}${detalle !== undefined ? ` → ${detalle}` : ''}`);
}
const decir = (q) => console.log(`\n· ${q}`);

const WEI = 10n ** 18n;

decir('es el 1 %');
comprobar(c.ppm() === 10000, 'diez mil partes por millón', c.ppm());
comprobar(c.porciento() === 1, 'que es 1 %', c.porciento());
{
  const r = c.partir((100n * WEI).toString());
  comprobar(r.comision === (1n * WEI).toString(), 'de 100 se cobra 1', r.comision);
  comprobar(r.neto === (99n * WEI).toString(), 'y salen 99', r.neto);
  comprobar(BigInt(r.comision) + BigInt(r.neto) === BigInt(r.bruto),
    'y las dos partes suman exactamente el bruto: no se pierde ni un wei');
}

decir('se debita lo que la persona escribió, no más');
{
  // La regla: pide 100, recibe 99. NO se debitan 101 para que salgan 100.
  // La otra forma parece más amable y es peor: alguien con 100 exactos no
  // podría sacar sus 100 y vería «saldo insuficiente» sobre un saldo que sí
  // alcanza — de los errores que hacen escribir a la gente.
  const r = c.partir((100n * WEI).toString());
  comprobar(BigInt(r.bruto) === 100n * WEI, 'el bruto es lo escrito, tal cual');
  comprobar(BigInt(r.neto) < BigInt(r.bruto), 'y el neto es menor, nunca al revés');
}

decir('el redondeo va a favor de quien saca su dinero');
{
  // 99 wei al 1 % son 0,99 wei. Truncado hacia abajo: cero. La persona se
  // queda con el medio wei, no la casa.
  const r = c.partir('99');
  comprobar(r.comision === '0', 'una cantidad diminuta no paga comisión', r.comision);
  comprobar(r.neto === '99', 'y sale entera', r.neto);
  const r2 = c.partir('199');
  comprobar(r2.comision === '1', '199 wei pagan 1, no 2 (trunca, no redondea)', r2.comision);
  comprobar(r2.neto === '198', 'y salen 198', r2.neto);
}

decir('la cuenta es idéntica a la de la pantalla');
{
  // La pantalla hace la suya con BigInt (portafolio.js:corteDe). Si las dos
  // no coinciden, alguien ve un número antes de firmar y recibe otro.
  const deLaPantalla = (bruto, ppm) => {
    const b = BigInt(bruto);
    const comision = (b * BigInt(ppm)) / 1000000n;
    return { comision: comision.toString(), neto: (b - comision).toString() };
  };
  const casos = ['1', '99', '199', '1000000000000000000', '38074612533705550745',
                 '123456789012345678901', '999999999999999999999999'];
  for (const x of casos) {
    const a = c.partir(x);
    const b = deLaPantalla(x, c.ppm());
    comprobar(a.comision === b.comision && a.neto === b.neto,
      `${x} da lo mismo en las dos`, `${a.neto} vs ${b.neto}`);
  }
}

decir('las cantidades que no valen');
for (const malo of ['0', '-5', 0, -1n]) {
  let codigo = null;
  try { c.partir(malo); } catch (e) { codigo = e.codigo || 'LANZO'; }
  comprobar(codigo !== null, `${String(malo)} se rechaza`, codigo);
}
comprobar(c.vale('1') === true, 'un wei sí vale: sale entero');
comprobar(c.vale((100n * WEI).toString()) === true, 'y 100 también');

decir('una variable mal escrita no apaga la comisión');
{
  const antes = process.env.ORDENEX_COMISION_SALIDA_PPM;
  for (const malo of ['abc', '-1', '1000000', '0.5', '999999']) {
    process.env.ORDENEX_COMISION_SALIDA_PPM = malo;
    comprobar(c.ppm() === c.PPM_POR_OMISION,
      `ORDENEX_COMISION_SALIDA_PPM="${malo}" se ignora y queda el 1 %`, c.ppm());
  }
  // Cero SÍ es válido: es «no cobrar», y es una decisión que se puede tomar.
  process.env.ORDENEX_COMISION_SALIDA_PPM = '0';
  comprobar(c.ppm() === 0, 'pero un cero explícito sí vale: es no cobrar', c.ppm());
  comprobar(c.partir('100').comision === '0', 'y entonces no se cobra nada');
  process.env.ORDENEX_COMISION_SALIDA_PPM = '5000';
  comprobar(c.ppm() === 5000 && c.porciento() === 0.5, 'y 5000 ppm son 0,5 %', c.porciento());
  if (antes === undefined) delete process.env.ORDENEX_COMISION_SALIDA_PPM;
  else process.env.ORDENEX_COMISION_SALIDA_PPM = antes;
  comprobar(c.ppm() === 10000, 'y sin variable, vuelve al 1 %', c.ppm());
}

decir('SOLO al salir: entrar no cobra nada');
{
  // La compra no toca la comisión de salida por ninguna parte.
  const compra = readFileSync(new URL('../lib/compra.js', import.meta.url), 'utf8');
  comprobar(!/comisionSalida/.test(compra), 'lib/compra.js no cobra comisión de salida');
  comprobar(!/comision/i.test(compra.split('function origenWeiDe')[1].split('}')[0]),
    'y la cuenta del ORIGEN no descuenta nada');
  // El libro de órdenes sigue en cero y eso es deliberado: «nada más».
  const motor = readFileSync(new URL('../lib/motor.js', import.meta.url), 'utf8');
  comprobar(/ORDENEX_COMISION_PPM/.test(motor), 'el libro tiene su propia variable, aparte');
  const antes = process.env.ORDENEX_COMISION_PPM;
  delete process.env.ORDENEX_COMISION_PPM;
  const m = require('../lib/motor.js');
  comprobar(typeof m === 'object', 'y sin variable el libro no cobra: es lo declarado');
  if (antes !== undefined) process.env.ORDENEX_COMISION_PPM = antes;
}

decir('el retiro la usa, y en el orden correcto');
{
  const ctrl = readFileSync(new URL('../controllers/portafolioController.js', import.meta.url), 'utf8');
  comprobar(/comisionSalida\.partir\(cantidad\)/.test(ctrl), 'el retiro parte la cantidad');
  const iPartir = ctrl.indexOf('comisionSalida.partir(cantidad)');
  const iClave = ctrl.indexOf('Retiro.create(');
  comprobar(iPartir > 0 && iPartir < iClave,
    'antes de quemar la retiroKey: una operación imposible no gasta una clave');
  comprobar(/cantidadWei: corte\.neto/.test(ctrl), 'y a la cadena sale el NETO');
  comprobar(/debitar\(userId, activo, cantidad, ref\)/.test(ctrl), 'mientras se debita el BRUTO');
  const iEnvio = ctrl.indexOf('enviarDesdeCaliente(');
  const iAbono = ctrl.indexOf("acreditar('casa'");
  comprobar(iAbono > iEnvio,
    'la comisión se abona DESPUÉS del envío: así el reverso deshace una cosa, no dos');
  comprobar(/NO_CUBRE_COMISION/.test(ctrl), 'y una cantidad que no cubre la comisión se rechaza');
  // El reverso devuelve el bruto entero.
  comprobar(/acreditar\(userId, activo, cantidad, `\$\{ref\}:reverso`\)/.test(ctrl),
    'y si la firma falla se devuelve el BRUTO, no el neto');
}

decir('el recibo se guarda, no se recalcula');
{
  const modelos = readFileSync(new URL('../models/index.js', import.meta.url), 'utf8');
  for (const campo of ['comision', 'neto', 'comisionPpm']) {
    comprobar(new RegExp(`${campo}: \\{ type`).test(modelos), `el retiro guarda ${campo}`);
  }
  const ctrl = readFileSync(new URL('../controllers/portafolioController.js', import.meta.url), 'utf8');
  comprobar(/comision: visto\.comision/.test(ctrl),
    'y el reintento repite lo guardado: si la tasa cambia, el recibo no');
}

console.log(`\n${malos.length ? `FALLARON ${malos.length} de ${bien + malos.length}` : 'Todo en verde'}`);
if (malos.length) process.exit(1);
