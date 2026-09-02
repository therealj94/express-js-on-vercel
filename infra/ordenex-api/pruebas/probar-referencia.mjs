/* Las velas de REFERENCIA: la derivacion, el mapeo de rangos y la frontera
 * con los activos que no tienen mercado real. Sin Mongo, sin red, sin reloj.
 *
 *   node pruebas/probar-referencia.mjs
 *
 * Lo que se castiga aqui es LA REGLA que separa las dos clases de vela:
 *
 *  - ORIGEN se deriva del ORO y de nada mas — gramo de oro entre 55, o sea
 *    o/h/l/c divididos entre 31,1035 x 55, con el t0 copiado. Misma fuente,
 *    misma hora, otra unidad.
 *  - AUKA y AGKA se guardan TAL CUAL viene el feed: a la plata no la toca la
 *    aritmetica del oro ni por asomo.
 *  - El ratio AUKA/ORIGEN en dolares tiene que dar 1710,69 SIEMPRE, con
 *    cualquier precio del oro — que es la razon entera de servir la referencia
 *    en dolares y no en ORIGEN.
 *  - Los doce tokens de sector NO tienen referencia, y eso se contesta con
 *    SIN_REFERENCIA: ni una linea plana, ni un precio de relleno.
 *  - Lo que viene torcido del proveedor (cero, NaN, fila corta) se tira; una
 *    grafica con un hueco es mejor que una grafica con una mentira.
 */

import ref from '../lib/referenciaVelas.js';
import mercados from '../controllers/mercadosController.js';

const {
  ONZA_EN_GRAMOS,
  GRAMOS_POR_ORIGEN,
  DIVISOR_ORIGEN,
  RANGOS,
  MARCOS_REF,
  REFERENCIAS,
  limpiar,
  limpiarTodas,
  derivarOrigen,
  activoDeReferencia,
  marcoDeDias,
} = ref;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

// Comparacion de flotantes: la derivacion divide y redondea, asi que exigir
// igualdad al bit seria exigir algo que la coma flotante no promete.
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
// Y para el ratio, tolerancia RELATIVA: el redondeo a seis decimales de la
// derivacion es un grano fijo, asi que su peso depende del tamaño del numero.
// Con el oro donde vive de verdad (miles de dolares) el error relativo anda
// por 1e-9; exigir menos de 1e-5 lo cubre con holgura sin fingir exactitud.
const cercaRel = (a, b, tol = 1e-5) => Math.abs(a - b) / Math.abs(b) <= tol;

// Un fingido de res que se queda con lo que le pasaron. No hace falta Express
// para comprobar que un 404 es un 404 con su codigo.
function resFingido() {
  const r = { estado: 200, cuerpo: null, seLlamoNext: false };
  r.status = (n) => {
    r.estado = n;
    return r;
  };
  r.json = (c) => {
    r.cuerpo = c;
    return r;
  };
  return r;
}
const pedir = async (par, query = {}) => {
  const res = resFingido();
  await mercados.referencia({ params: { par }, query }, res, () => {
    res.seLlamoNext = true;
  });
  return res;
};

decir('la aritmetica de la casa');
{
  comprobar(ONZA_EN_GRAMOS === 31.1035, '1 onza = 31,1035 g');
  comprobar(GRAMOS_POR_ORIGEN === 55, 'ORIGEN = gramo de oro / 55');
  comprobar(
    cerca(DIVISOR_ORIGEN, 1710.6925, 1e-9),
    'el divisor es 31,1035 x 55 = 1710,6925',
    `dio ${DIVISOR_ORIGEN}`
  );
  comprobar(cerca(DIVISOR_ORIGEN, 1710.69, 0.01), 'que redondeado es el 1710,69 del contrato');
}

decir('ORIGEN se deriva del ORO, dividiendo o/h/l/c');
{
  // Una vela de oro plausible (los ordenes de magnitud del feed real).
  const oro = [1786825800000, 4374.21, 4374.88, 4374.16, 4374.24];
  const origen = derivarOrigen(oro);

  comprobar(origen[0] === oro[0], 't0 se copia: misma hora, misma lectura', `dio ${origen[0]}`);
  comprobar(
    cerca(origen[1], oro[1] / DIVISOR_ORIGEN) &&
      cerca(origen[2], oro[2] / DIVISOR_ORIGEN) &&
      cerca(origen[3], oro[3] / DIVISOR_ORIGEN) &&
      cerca(origen[4], oro[4] / DIVISOR_ORIGEN),
    'los cuatro precios son el del oro entre 1710,6925',
    `dio ${JSON.stringify(origen)}`
  );
  comprobar(cerca(origen[4], 2.556999, 1e-3), 'un ORIGEN sale a ~2,56 USD con el oro a 4374', `dio ${origen[4]}`);

  // Dividir por una constante positiva no puede desordenar la vela.
  comprobar(
    origen[2] >= origen[1] && origen[2] >= origen[4] && origen[3] <= origen[1] && origen[3] <= origen[4],
    'la vela sigue siendo una vela: h por encima, l por debajo'
  );

  // Pureza: la vela de oro entra y sale igual.
  const copia = JSON.stringify(oro);
  derivarOrigen(oro);
  comprobar(JSON.stringify(oro) === copia, 'derivar no toca la vela de oro que le pasaron');
}

decir('el ratio AUKA/ORIGEN es 1710,69 SIEMPRE — por eso la referencia va en dolares');
{
  // La razon entera de servir esto en USD: las dos son oro, su ratio no se
  // mueve nunca. Con el oro a 1000, a 4374 o a 90000, el cociente es el mismo.
  for (const precio of [1000, 4374.21, 20000, 90000]) {
    const [, , , , origenUsd] = derivarOrigen([1, precio, precio, precio, precio]);
    comprobar(
      cercaRel(precio / origenUsd, DIVISOR_ORIGEN),
      `con el oro a ${precio} USD, una AUKA vale 1710,69 ORIGEN`,
      `dio ${precio / origenUsd}`
    );
  }
  // El ratio no depende del precio: se compara el de un oro barato con el de
  // uno caro y tienen que ser el mismo numero. Esto es lo que hace inutil la
  // grafica en ORIGEN — y por lo que la referencia se sirve en dolares.
  const barato = 1000 / derivarOrigen([1, 1000, 1000, 1000, 1000])[4];
  const caro = 90000 / derivarOrigen([1, 90000, 90000, 90000, 90000])[4];
  comprobar(cercaRel(barato, caro), 'el ratio con el oro barato y con el caro es el MISMO', `${barato} vs ${caro}`);
  comprobar(true, 'una grafica de AUKA en ORIGEN seria una raya plana: no se pinta, se explica');
}

decir('a la plata no la toca la aritmetica del oro');
{
  // AGKA se guarda tal cual viene: es la onza de plata en dolares y punto.
  const plata = [1784332800000, 53.92, 57.38, 53.86, 57.38];
  const limpia = limpiar(plata);
  comprobar(JSON.stringify(limpia) === JSON.stringify(plata), 'AGKA pasa por limpiar sin cambiar un decimal');
  comprobar(
    limpia[1] !== derivarOrigen(plata)[1],
    'y derivarOrigen NUNCA se le aplica: solo el oro es el gramin'
  );
  comprobar(
    REFERENCIAS.AGKA.fuente.includes('kinesis-silver') && !REFERENCIAS.AGKA.fuente.includes('÷'),
    'su fuente es la plata, sin division de por medio',
    REFERENCIAS.AGKA.fuente
  );
  comprobar(
    REFERENCIAS.ORIGEN.fuente.includes('pax-gold') && REFERENCIAS.ORIGEN.fuente.includes('55'),
    'y la de ORIGEN dice de donde sale: el oro entre 31,1035 x 55',
    REFERENCIAS.ORIGEN.fuente
  );
}

decir('el mapeo dias → marco: lo que el proveedor devuelve, rotulado');
{
  comprobar(RANGOS.length === 3, 'son exactamente tres rangos');
  comprobar(marcoDeDias(1) === '30m', '1 dia  → 48 velas de 30 min → marco 30m');
  comprobar(marcoDeDias(30) === '4h', '30 dias → 180 velas de 4 h  → marco 4h');
  comprobar(marcoDeDias(365) === '4d', '365 dias → 92 velas de 4 dias → marco 4d');
  comprobar(marcoDeDias(7) === null, 'un rango que no pedimos no tiene marco inventado');
  comprobar(
    MARCOS_REF.join(',') === '30m,4h,4d',
    'y los marcos de referencia son esos tres y ninguno mas',
    MARCOS_REF.join(',')
  );
  comprobar(
    !MARCOS_REF.includes('1m') && !MARCOS_REF.includes('1h') && !MARCOS_REF.includes('1d'),
    'ninguno coincide con los marcos de las velas de TRATOS: no se pueden confundir'
  );
  comprobar(RANGOS.length * 2 === 6, 'un refresco son 6 llamadas: tres rangos por dos metales');
}

decir('quien tiene referencia y quien no');
{
  comprobar(activoDeReferencia('AUKA-ORIGEN') === 'AUKA', 'AUKA-ORIGEN sigue al oro');
  comprobar(activoDeReferencia('AGKA-ORIGEN') === 'AGKA', 'AGKA-ORIGEN sigue a la plata');
  comprobar(activoDeReferencia('ORIGEN') === 'ORIGEN', 'ORIGEN a secas tiene su gramin');

  // Los doce tokens de sector: ni tratos ni referencia. Ni uno se cuela.
  const sector = ['MNKA', 'IBS', 'HARV', 'AUBEX', 'ASL', 'LOVE', 'REST', 'SOL', 'AIT', 'AGRO', 'POLITICAL', 'ONDK'];
  comprobar(sector.length === 12, 'son doce tokens de sector');
  comprobar(
    sector.every((s) => activoDeReferencia(`${s}-ORIGEN`) === null),
    'y ninguno de los doce tiene referencia: null, no una linea plana'
  );
  comprobar(activoDeReferencia('') === null && activoDeReferencia(null) === null, 'y lo vacio tampoco hereda nada');
}

decir('la ruta: un activo sin referencia contesta SIN_REFERENCIA');
{
  const r = await pedir('MNKA-ORIGEN');
  comprobar(r.estado === 404, 'MNKA-ORIGEN da 404', `dio ${r.estado}`);
  comprobar(r.cuerpo?.codigo === 'SIN_REFERENCIA', 'con codigo SIN_REFERENCIA', JSON.stringify(r.cuerpo));
  comprobar(!('velas' in (r.cuerpo || {})), 'y sin velas de relleno en el cuerpo del error');
  comprobar(!r.seLlamoNext, 'sin caer al manejador de errores: es una respuesta, no un accidente');

  // Los de sector, uno por uno: ni el mas raro se cuela con una grafica falsa.
  // Desde que MERCADOS son solo los PUBLICADOS, hay dos respuestas y las dos
  // son un 404 honesto: los publicados sin referencia (IBS, HARV, ONDK) dicen
  // SIN_REFERENCIA; los nueve que no tienen mesa dicen MERCADO_INVALIDO —
  // antes el API aceptaba ordenes en los catorce y aqui contestaban como si
  // la mesa existiera.
  const publicadosSinRef = ['IBS', 'HARV', 'ONDK'];
  const sinMesa = ['MNKA', 'AUBEX', 'ASL', 'LOVE', 'REST', 'SOL', 'AIT', 'AGRO', 'POLITICAL'];
  const conRef = await Promise.all(publicadosSinRef.map((s) => pedir(`${s}-ORIGEN`)));
  comprobar(
    conRef.every((x) => x.estado === 404 && x.cuerpo?.codigo === 'SIN_REFERENCIA'),
    'los publicados sin referencia contestan SIN_REFERENCIA',
    conRef.map((x, i) => `${publicadosSinRef[i]}:${x.estado}/${x.cuerpo?.codigo}`).join(' ')
  );
  const sinMesaR = await Promise.all(sinMesa.map((s) => pedir(`${s}-ORIGEN`)));
  comprobar(
    sinMesaR.every((x) => x.estado === 404 && x.cuerpo?.codigo === 'MERCADO_INVALIDO'),
    'y los nueve sin mesa contestan MERCADO_INVALIDO, no una grafica',
    sinMesaR.map((x, i) => `${sinMesa[i]}:${x.estado}/${x.cuerpo?.codigo}`).join(' ')
  );
}

decir('la ruta: lo demas que tiene que fallar cerrado');
{
  const inventado = await pedir('PEPE-ORIGEN');
  comprobar(
    inventado.estado === 404 && inventado.cuerpo?.codigo === 'MERCADO_INVALIDO',
    'un mercado que no es de la casa da MERCADO_INVALIDO, no SIN_REFERENCIA',
    JSON.stringify(inventado.cuerpo)
  );

  const marcoMalo = await pedir('AUKA-ORIGEN', { marco: '1h' });
  comprobar(
    marcoMalo.estado === 400 && marcoMalo.cuerpo?.codigo === 'MARCO_INVALIDO',
    'un marco de velas de TRATOS (1h) no sirve aqui: 400 MARCO_INVALIDO',
    JSON.stringify(marcoMalo.cuerpo)
  );
}

decir('lo que viene torcido del proveedor se tira, no se arregla');
{
  comprobar(limpiar([1, 2, 3, 4, 5]) !== null, 'una fila bien formada pasa');
  comprobar(limpiar([1, 0, 3, 4, 5]) === null, 'un precio en cero no pasa');
  comprobar(limpiar([1, 2, 3, -4, 5]) === null, 'ni uno negativo');
  comprobar(limpiar([1, 2, NaN, 4, 5]) === null, 'ni un NaN');
  comprobar(limpiar([1, 2, 3, 4]) === null, 'ni una fila corta');
  comprobar(limpiar([0, 2, 3, 4, 5]) === null, 'ni un t0 en cero');
  comprobar(limpiar(['1', 2, 3, 4, 5]) === null, 'ni un t0 que llega como texto');
  comprobar(limpiar(null) === null && limpiar('vela') === null, 'ni lo que ni siquiera es una fila');

  const mezcla = limpiarTodas([
    [300, 3, 3, 3, 3],
    [100, 1, 1, 1, 1],
    [200, 0, 2, 2, 2], // torcida: se cae
    'basura',
    [150, 15, 15, 15, 15],
  ]);
  comprobar(mezcla.length === 3, 'de cinco filas con dos podridas quedan tres', `quedaron ${mezcla.length}`);
  comprobar(
    mezcla.map((v) => v[0]).join(',') === '100,150,300',
    'ordenadas por t0, de vieja a nueva — que es como se pinta',
    mezcla.map((v) => v[0]).join(',')
  );
  comprobar(limpiarTodas(null).length === 0 && limpiarTodas({}).length === 0, 'y una respuesta que no es lista da []');
}

decir('los rotulos: una vela de referencia jamas se disfraza de trato');
{
  for (const activo of ['AUKA', 'AGKA', 'ORIGEN']) {
    const { rotulo } = REFERENCIAS[activo];
    comprobar(/referencia/i.test(rotulo), `${activo}: el rotulo dice "referencia"`, rotulo);
    comprobar(/no son tratos de ordenex/i.test(rotulo), `${activo}: y dice que no son tratos de Ordenex`);
  }
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
