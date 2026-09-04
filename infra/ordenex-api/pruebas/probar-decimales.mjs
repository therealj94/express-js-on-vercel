/* Los decimales: la aritmética y la diferencia entre desacuerdo y duda.
 *
 *   node pruebas/probar-decimales.mjs
 *
 * Pura: sin Mongo y sin red. El proveedor se inyecta, que es la razón por la
 * que verificar() lo recibe en vez de importarlo — una cadena fingida puede
 * contestar 18 donde debía decir 6 y aquí se comprueba que eso mata.
 *
 * La prueba que da nombre al archivo es la primera: cien dólares en Polygon y
 * cien en BSC tienen que ser EL MISMO NÚMERO en el libro, aunque en la cadena
 * se escriban con doce ceros de diferencia. Si esa pasa, el error de acreditar
 * 0,0000000001 no puede volver.
 */

const dec = (await import('../lib/decimales.js')).default;
const {
  CANONICOS, verificar, puedeSeguir, listo, decimalesDe, rejilla,
  aCanonico, aNativo, cuantizar, estado,
} = dec;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

const { olvidar } = dec._adentro;

/* Los quince de la 5550, todos a 18. Se escribe una vez: sin esto, cada
   escenario dejaria catorce ilegibles de ruido y los conteos no dirian nada. */
const LA5550 = Object.fromEntries(Object.keys(dec.ESPERADOS[5550]).map((s) => [s, 18]));
const BIEN = { 5550: LA5550, 137: { USDT: 6 }, 56: { USDT: 18 }, 1: { USDT: 6 } };

const lanza = (fn, codigo) => {
  try { fn(); return false; } catch (e) { return codigo ? e.codigo === codigo : true; }
};

/* Una cadena fingida que contesta de VERDAD, por `call`.
 *
 * No se parchea ethers: en v6 los métodos del ABI se resuelven por Proxy y un
 * parche al prototipo no se vería. El proveedor fingido implementa `call` y
 * devuelve el uint8 codificado como lo haría un nodo, así que la prueba pasa
 * por el mismo decodificador que producción. Es más trabajo y prueba más.
 *
 * `dice` es { <red>: { <SÍMBOLO>: decimales } }, o la cadena 'sin-proveedor'
 * para simular un RPC caído, o 'revierte' para uno que contesta basura.
 */
function cadenaQueDice(dice) {
  // El módulo pregunta por contrato; el fingido se escribe por símbolo, que es
  // como lo lee un humano. Aquí se traduce, desde la misma tabla del módulo.
  const porContrato = new Map();
  for (const [red, activos] of Object.entries(dec.ESPERADOS)) {
    for (const [simbolo, f] of Object.entries(activos)) {
      if (f.contrato) porContrato.set(f.contrato.toLowerCase(), { red: Number(red), simbolo });
    }
  }
  return async (red) => {
    if (dice[red] === 'sin-proveedor') throw new Error('RPC caído');
    return {
      call: async (tx) => {
        const quien = porContrato.get(String(tx.to).toLowerCase());
        if (!quien) throw new Error(`contrato desconocido ${tx.to}`);
        const v = dice[quien.red]?.[quien.simbolo];
        if (v === 'revierte') throw new Error('execution reverted');
        if (v === undefined) throw new Error(`sin dato fingido para ${quien.simbolo}`);
        return '0x' + BigInt(v).toString(16).padStart(64, '0');
      },
    };
  };
}

decir('la prueba que da nombre al archivo');
{
  // Se verifica con una cadena que dice la verdad de cada red.
  await conCadena(BIEN, async () => {
    const cien = 100n;
    const enPolygon = (cien * 10n ** 6n).toString();   // 100000000
    const enBsc = (cien * 10n ** 18n).toString();      // 100 seguido de 18 ceros

    const a = aCanonico(enPolygon, 137, 'USDT');
    const b = aCanonico(enBsc, 56, 'USDT');

    comprobar(a === (cien * 10n ** 18n).toString(),
      '100 USDT de Polygon (6 dec) → 100 en el libro (18 dec)', `dio ${a}`);
    comprobar(a === b,
      'cien en Polygon y cien en BSC son EL MISMO número en el libro', `${a} vs ${b}`);
    comprobar(aCanonico(enPolygon, 1, 'USDT') === a,
      'y cien en Ethereum también');

    // El bug, escrito como lo que NO puede pasar.
    comprobar(a !== enPolygon,
      'el crudo de Polygon NO se acredita tal cual (sería 0,0000000001)');
  });
}

decir('subir de escala es exacto, siempre');
{
  await conCadena(BIEN, async () => {
    const casos = ['0', '1', '7', '999999', '123456789', (2n ** 63n).toString()];
    let todas = true;
    for (const m of casos) {
      for (const [red, act] of [[137, 'USDT'], [56, 'USDT'], [1, 'USDT']]) {
        const v = aNativo(aCanonico(m, red, act), red, act);
        if (v.nativo !== m || v.resto !== '0') todas = false;
      }
    }
    comprobar(todas, 'ida y vuelta desde nativo: exacta y sin resto, en las tres redes');

    comprobar(aCanonico('1', 137, 'USDT') === (10n ** 12n).toString(),
      '1 unidad mínima de Polygon = 10^12 en el libro');
    comprobar(aCanonico('1', 56, 'USDT') === '1',
      'en BSC no se mueve: ya está en 18');
  });
}

decir('bajar de escala NO es exacto, y el módulo lo dice en vez de callarlo');
{
  await conCadena(BIEN, async () => {
    // Este NO-invariante existe a propósito: es la prueba que impide que
    // alguien "arregle" aNativo devolviendo un solo valor.
    const v = aNativo('1', 137, 'USDT');
    comprobar(v.nativo === '0' && v.resto === '1',
      'un canónico de 1 en Polygon no llega a la rejilla: nativo 0, resto 1');
    comprobar(aCanonico(v.nativo, 137, 'USDT') !== '1',
      'y la vuelta NO reconstruye el original — por eso se devuelve el resto');

    const q = cuantizar('1', 137, 'USDT');
    comprobar(q.canonico === '0' && q.polvo === '1',
      'cuantizar de algo bajo la rejilla da cero, con su polvo');

    // Conservación: lo que entra sale, repartido. Nunca se inventa ni se pierde.
    let conserva = true;
    for (const m of ['0', '1', '999999999999', '1000000000000', '1000000000001',
                     (10n ** 20n + 7n).toString()]) {
      const c = cuantizar(m, 137, 'USDT');
      if ((BigInt(c.canonico) + BigInt(c.polvo)).toString() !== m) conserva = false;
      if (BigInt(c.polvo) >= 10n ** 12n) conserva = false;
    }
    comprobar(conserva, 'cuantizar conserva: canónico + polvo = lo pedido, y el polvo < la rejilla');

    const yaEnRejilla = (10n ** 12n * 5n).toString();
    const c2 = cuantizar(yaEnRejilla, 137, 'USDT');
    comprobar(c2.canonico === yaEnRejilla && c2.polvo === '0',
      'lo que ya cae en la rejilla no se mueve');

    comprobar(rejilla(137, 'USDT') === (10n ** 12n).toString()
      && rejilla(56, 'USDT') === '1',
      'la rejilla se puede decir en pantalla: 10^12 en Polygon, 1 en BSC');
  });
}

decir('sin verificar no se cuenta: nunca hay un 18 por omisión');
{
  // Estado de recién arrancado. Reimportar con ?fresco= NO sirve: el require
  // de CommonJS devuelve siempre el mismo objeto, así que el módulo seguiría
  // con lo verificado por los escenarios de arriba y la prueba pasaría en
  // falso — que es peor que fallar.
  olvidar();
  const limpio = dec;
  comprobar(lanza(() => limpio.decimalesDe(137, 'USDT'), 'DECIMALES_SIN_VERIFICAR'),
    'decimalesDe lanza DECIMALES_SIN_VERIFICAR antes de comprobar');
  comprobar(lanza(() => limpio.aCanonico('100', 137, 'USDT'), 'DECIMALES_SIN_VERIFICAR'),
    'y aCanonico también: no convierte a ciegas');
  comprobar(limpio.listo(137) === false && limpio.listo() === false,
    'listo() es false mientras no se haya comprobado nada');
  comprobar(lanza(() => limpio.decimalesDe(137, 'PEPE'), 'ACTIVO_DESCONOCIDO'),
    'un activo que no está en la tabla es ACTIVO_DESCONOCIDO, no un 18 amable');
}

decir('DESACUERDO mata, DUDA cierra la cadena — y no son lo mismo');
{
  // Desacuerdo: la cadena dice 18 donde la tabla espera 6.
  olvidar();
  const m = dec;
  const r = await conCadenaEn(m, { 5550: LA5550, 137: { USDT: 18 }, 56: { USDT: 18 }, 1: { USDT: 6 } });
  comprobar(r.desacuerdos.length === 1 && r.desacuerdos[0].red === 137
    && r.desacuerdos[0].esperado === 6 && r.desacuerdos[0].dijo === 18,
    'un contrato que dice 18 donde se esperaba 6 sale como desacuerdo, con los dos números',
    JSON.stringify(r.desacuerdos));
  comprobar(r.ilegibles.length === 0, 'y no se confunde con un ilegible');
  comprobar(m.puedeSeguir(r) === false, 'con un desacuerdo, el proceso NO puede seguir');
  comprobar(m.listo(137) === false && m.listo(1) === true,
    'la red en desacuerdo queda cerrada; las otras siguen listas');
}
{
  // Duda: el RPC no contesta. El API tiene que poder seguir en pie.
  olvidar();
  const m = dec;
  const r = await conCadenaEn(m, { 5550: LA5550, 137: 'sin-proveedor', 56: { USDT: 18 }, 1: { USDT: 6 } });
  comprobar(r.ilegibles.length === 1 && r.ilegibles[0].red === 137,
    'un RPC caído sale como ilegible');
  comprobar(r.desacuerdos.length === 0, 'y NO como desacuerdo — es una avería, no una mentira');
  comprobar(m.puedeSeguir(r) === true,
    'con solo ilegibles, el proceso SÍ sigue: matar el API por un RPC lento es peor');
  comprobar(m.listo(137) === false, 'pero esa cadena queda cerrada');
  comprobar(m.listo(56) === true && m.listo(1) === true, 'y las que sí se pudieron leer, abiertas');
  comprobar(m.listo() === false, 'listo() sin argumento es false si falta cualquiera');
}
{
  // Mas de 18 decimales: no se puede subir sin dividir, y dividir aqui pierde.
  olvidar();
  const m = dec;
  const r = await conCadenaEn(m, { 5550: LA5550, 137: { USDT: 24 }, 56: { USDT: 18 }, 1: { USDT: 6 } });
  comprobar(r.desacuerdos.length === 1 && r.desacuerdos[0].dijo === 24,
    'un contrato con más de 18 decimales se rechaza en vez de redondear');
}

decir('montos mal formados');
{
  await conCadena(BIEN, async () => {
    const malos = ['1.5', '1e18', '-5', '', ' 7', '0x10', 12, null, undefined, {}, '9'.repeat(79)];
    let todos = true;
    for (const m of malos) if (!lanza(() => aCanonico(m, 137, 'USDT'), 'MONTO_INVALIDO')) todos = false;
    comprobar(todos, 'decimales, notación científica, negativos, espacios, hex, Number y 79 dígitos: MONTO_INVALIDO');
    comprobar(!lanza(() => aCanonico('0', 137, 'USDT')),
      'el cero SÍ se acepta al convertir: cuantizar tiene que poder devolverlo');
    comprobar(!lanza(() => aCanonico(123n, 137, 'USDT')), 'un BigInt también vale');
  });
}

decir('la 5550 y el cuadro del panel');
{
  olvidar();
  const m = dec;
  await conCadenaEn(m, BIEN);
  comprobar(m.decimalesDe(5550, 'ORIGEN') === 18,
    'ORIGEN es nativo: sus decimales son los de la cadena, sin contrato que preguntar');
  comprobar(m.decimalesDe(5550, 'AUKA') === 18, 'y los tokens de la 5550 se comprueban de verdad');
  comprobar(m.listo() === true, 'con las cuatro redes en verde, listo() es true');

  const e = m.estado();
  comprobar(e.canonicos === 18, 'el cuadro dice en qué escala cuenta el libro');
  comprobar(e.redes[137].verificada === true && e.redes[137].nombre === 'Polygon',
    'y trae cada red con su nombre y si está verificada');
  const json = JSON.stringify(e);
  comprobar(!json.includes('0x') || json.includes('0xc2132D05'),
    'el cuadro puede llevar contratos (son públicos) pero nada más');
}

decir('la tabla no se separa de lib/tokens.js');
{
  const { TOKENS } = (await import('../lib/tokens.js')).default;
  const m = dec;
  const enTabla = Object.keys(m.ESPERADOS[5550]).sort();
  const enTokens = TOKENS.map((t) => t.s).sort();
  comprobar(JSON.stringify(enTabla) === JSON.stringify(enTokens),
    'los activos de la 5550 salen de tokens.js: ni faltan ni sobran',
    `tabla=${enTabla.length} tokens=${enTokens.length}`);
  comprobar(!enTokens.includes('USDT'),
    'y USDT NO está en tokens.js: meterlo ahí rompería el vigía de la 5550 entero');
}

// ── la costura con ethers, en un solo sitio ─────────────────────────────────

async function conCadenaEn(modulo, dice) {
  return modulo.verificar({ proveedorDe: cadenaQueDice(dice), plazoMs: 2000 });
}

async function conCadena(dice, cuerpo) {
  await conCadenaEn(dec, dice);
  await cuerpo();
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
