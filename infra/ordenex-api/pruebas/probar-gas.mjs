/* La billetera de gas: las cuentas y las decisiones, sin red y sin fondos.
 *
 *   node pruebas/probar-gas.mjs
 *
 * El proveedor y el firmante se fingen, así que esto corre hoy — antes de que
 * la billetera de gas tenga un centavo. Lo que se castiga son las DECISIONES:
 * cuándo no se fondea, cuándo se pospone, y sobre todo que un fondeo repetido
 * no mande dinero dos veces.
 */

const gas = (await import('../lib/gas.js')).default;
const { olvidar } = gas._adentro;
const { Wallet, parseUnits, parseEther } = await import('ethers');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const ver = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? String(v) : v));
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

const PROVISIONAL = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const UNICA = '0x8832E2D5cCc707bC5fef5780739f6a2F1C3eCAb3';
const USDT_POLYGON = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const PLAN = { a: UNICA, contrato: USDT_POLYGON, cantidad: 100000000n };

/* Un proveedor fingido. `opciones` decide qué contesta cada pieza, para poder
   probar cada fallo por separado en vez de todos a la vez. */
function proveedorFingido(o = {}) {
  return {
    getFeeData: async () => {
      if (o.sinPrecio) throw new Error('el nodo no contesta feeData');
      return { maxFeePerGas: o.precio ?? parseUnits('30', 9), gasPrice: o.precio ?? parseUnits('30', 9) };
    },
    getBalance: async (dir) => {
      if (o.sinSaldo) throw new Error('el nodo no contesta getBalance');
      if (dir === gas.DIRECCION_GAS) return o.saldoGas ?? parseEther('10');
      return o.saldoProvisional ?? 0n;
    },
    estimateGas: async () => {
      if (o.sinEstimacion) throw new Error('execution reverted');
      return o.estimacion ?? 60000n;
    },
    call: async () => '0x' + '0'.repeat(64),
    // ethers pide esto al construir un Contract con runner
    provider: null,
  };
}

/* Se sustituye proveedorDe y el envío. Es la única costura y va explícita. */
const proveedores = (await import('../lib/proveedores.js')).default;
const proveedorReal = proveedores.proveedorDe;
let enviados = [];
let fingirEnvio = null;

function conCadena(o, cuerpo) {
  const pv = proveedorFingido(o);
  proveedores.proveedorDe = async () => pv;
  // El firmante: se intercepta connect() para que sendTransaction no salga a
  // ninguna red. Se cuenta CADA envío, que es lo que hace posible la prueba
  // del fondeo repetido.
  enviados = [];
  fingirEnvio = async (tx) => {
    enviados.push(tx);
    if (o.envioTruena) { const e = new Error(o.envioTruena.msg); e.code = o.envioTruena.code; throw e; }
    return { hash: '0x' + 'ab'.repeat(32), wait: async () => ({ status: 1 }) };
  };
  const original = Wallet.prototype.connect;
  Wallet.prototype.connect = function () {
    return { sendTransaction: (tx) => fingirEnvio(tx) };
  };
  return Promise.resolve(cuerpo()).finally(() => {
    Wallet.prototype.connect = original;
    proveedores.proveedorDe = proveedorReal;
  });
}

function conLlave(k, cuerpo) {
  const antes = process.env.ORDENEX_GAS_KEY;
  if (k === undefined) delete process.env.ORDENEX_GAS_KEY;
  else process.env.ORDENEX_GAS_KEY = k;
  olvidar();
  return Promise.resolve(cuerpo()).finally(() => {
    if (antes === undefined) delete process.env.ORDENEX_GAS_KEY;
    else process.env.ORDENEX_GAS_KEY = antes;
    olvidar();
  });
}

// Una llave cualquiera que NO es la de la billetera de gas.
const LLAVE_AJENA = '0x' + 'cd'.repeat(32);

decir('la llave tiene que ser la de ESA billetera');
await conLlave(undefined, () => {
  comprobar(gas.hayGas() === false, 'sin ORDENEX_GAS_KEY no se firma nada');
  comprobar(String(gas.motivo()).includes('falta'), 'y se dice que falta');
});
await conLlave(LLAVE_AJENA, () => {
  comprobar(gas.hayGas() === false,
    'una llave válida pero de OTRA billetera tampoco sirve');
  comprobar(String(gas.motivo()).includes(gas.DIRECCION_GAS),
    'y el motivo nombra la dirección que se esperaba', String(gas.motivo()));
});
await conLlave('no-es-una-llave', () => {
  comprobar(gas.hayGas() === false, 'una llave con forma mala se rechaza');
  let m = String(gas.motivo());
  comprobar(!m.includes('no-es-una-llave'), 'y el motivo NO lleva la llave dentro', m);
});
comprobar(gas.DIRECCION_GAS === '0x8861427c430814a1D58999D833382Dc7f4a362e8',
  'la dirección de gas es la nueva, literal en el código', gas.DIRECCION_GAS);
comprobar(gas.DIRECCION_GAS !== UNICA, 'y no es la billetera única');
// LA QUE NO PUEDE VOLVER. La anterior se quedo comprometida —un bot se llevo
// 15 USDT un bloque despues de que llegaran— y esta prueba existe para que
// nadie la reponga por costumbre o copiando un comentario viejo.
comprobar(gas.DIRECCION_GAS.toLowerCase() !== '0x8e839af7a405f49bf72b239929b8ee3c07ee7ba0',
  'y NO es la comprometida del 4 de septiembre');

// A partir de aquí hace falta una llave que SÍ derive la dirección de gas.
// No existe: es de José. Se comprueba lo que no depende de firmar.
decir('las cuentas del fondeo');
await conCadena({}, async () => {
  const r = await gas.cuantoHaceFalta(137, PROVISIONAL, PLAN);
  comprobar(r.ok, 'se calcula contra la cadena, no contra una constante');
  comprobar(r.limite === (60000n * 125n) / 100n,
    'el límite estimado lleva +25% de margen', String(r.limite));
  comprobar(r.precioTope === parseUnits('30', 9) * 3n,
    'y el precio lleva el margen de Polygon (3×)', String(r.precioTope));
  comprobar(r.faltante === r.necesario,
    'con saldo nativo en cero, falta todo');
});
await conCadena({ saldoProvisional: parseEther('1000') }, async () => {
  const r = await gas.cuantoHaceFalta(137, PROVISIONAL, PLAN);
  comprobar(r.faltante === 0n, 'con saldo de sobra, no falta nada');
});
await conCadena({ saldoProvisional: 1n }, async () => {
  const r = await gas.cuantoHaceFalta(137, PROVISIONAL, PLAN);
  comprobar(r.faltante === r.necesario - 1n,
    'se manda solo LA DIFERENCIA: el sobrante de la vez anterior se aprovecha');
});

decir('cuando el nodo no coopera, la regla se parte por red');
await conCadena({ sinEstimacion: true }, async () => {
  const p = await gas.cuantoHaceFalta(137, PROVISIONAL, PLAN);
  comprobar(p.ok && p.limite === gas.TECHO_GAS,
    'Polygon: sin estimación se usa el techo y se sigue — fondear de más cuesta céntimos');
  const b = await gas.cuantoHaceFalta(56, PROVISIONAL, PLAN);
  comprobar(b.ok && b.limite === gas.TECHO_GAS, 'BSC igual');
  const e = await gas.cuantoHaceFalta(1, PROVISIONAL, PLAN);
  comprobar(!e.ok, 'Ethereum NO: adivinar ahí cuesta demasiado, se pospone', ver(e));
});
await conCadena({ sinPrecio: true }, async () => {
  const r = await gas.cuantoHaceFalta(137, PROVISIONAL, PLAN);
  comprobar(!r.ok && /precio del gas/.test(r.error),
    'sin precio no se inventa uno: se dice que no se pudo');
});
await conCadena({ sinSaldo: true }, async () => {
  const r = await gas.cuantoHaceFalta(137, PROVISIONAL, PLAN);
  comprobar(!r.ok, 'y sin poder leer el saldo tampoco se decide cuánto mandar (fail-closed)');
});

decir('el tope por envío: un pico de precio no vacía la billetera');
await conLlave(LLAVE_AJENA, () => conCadena({ precio: parseUnits('30000', 9) }, async () => {
  // Con la llave ajena no se llega a firmar, pero la cuenta sí se hace.
  const r = await gas.cuantoHaceFalta(137, PROVISIONAL, PLAN);
  comprobar(r.ok && r.faltante > gas.TOPE_POR_ENVIO[137],
    'con el gas por las nubes, el fondeo calculado supera el tope de la red',
    `faltante=${r.faltante} tope=${gas.TOPE_POR_ENVIO[137]}`);
}));

decir('los márgenes son los medidos, y BSC es el más ajustado');
comprobar(gas.MARGEN_PRECIO[137] === 3n, 'Polygon 3×: cubre lo normal, un pico pospone');
comprobar(gas.MARGEN_PRECIO[56] === 15n, 'BSC 1,5× (15/10): precio muy estable');
comprobar(gas.MARGEN_PRECIO[1] === 2n, 'Ethereum 2×: es donde el margen cuesta de verdad');
comprobar(gas.TOPE_POR_ENVIO[1] < gas.TOPE_POR_ENVIO[137],
  'y el tope de Ethereum es el más bajo en unidades nativas');

decir('la alarma se mide en barridos, no en monedas');
await conCadena({ saldoGas: parseEther('10') }, async () => {
  const a = await gas.alarma();
  const pol = a.find((x) => x.red === 137);
  comprobar(a.every((x) => x.red !== 5550),
    'la 5550 no sale: ahí el gas es ORIGEN y no lo paga esta billetera');
  comprobar(pol && pol.ok && typeof pol.barridosQueQuedan === 'number',
    'la alarma dice cuántos barridos quedan, no cuántas monedas', ver(pol));
  comprobar(pol.nivel === 'bien', 'con diez POL y gas normal, el nivel es bien');
});
await conCadena({ saldoGas: 1n }, async () => {
  const pol = (await gas.alarma()).find((x) => x.red === 137);
  comprobar(pol.barridosQueQuedan === 0 && pol.nivel === 'critico',
    'casi vacía: crítico');
});
await conCadena({ sinSaldo: true }, async () => {
  const pol = (await gas.alarma()).find((x) => x.red === 137);
  comprobar(pol.ok === false && pol.saldo === null,
    'con el RPC caído: ok false y saldo NULL — nunca un cero de consuelo',
    ver(pol));
  comprobar(pol.nivel === 'no-se-sabe', 'y el nivel dice que no se sabe, no que está bien');
});

decir('sin llave configurada, asegurarGas no toca nada');
await conLlave(undefined, () => conCadena({}, async () => {
  const r = await gas.asegurarGas(137, PROVISIONAL, PLAN);
  comprobar(!r.ok && r.estado === 'no-se-pudo', 'no se fondea', ver(r));
  comprobar(enviados.length === 0, 'y NO se intentó ningún envío');
}));

decir('el cuadro del panel no lleva la llave');
await conLlave(LLAVE_AJENA, () => {
  const json = JSON.stringify(gas.estado());
  comprobar(!json.includes(LLAVE_AJENA) && !json.includes(LLAVE_AJENA.slice(-8)),
    'ni la llave ni sus últimos caracteres', json);
  comprobar(json.includes(gas.DIRECCION_GAS), 'pero sí la dirección, que es pública');
});

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
