/* El libro mayor.
 *
 *   node pruebas/probar-libro.mjs
 *
 * Lo que se persigue aquí es una sola cosa: que NO EXISTA un camino por el que
 * el saldo de alguien cambie sin un asiento cuadrado que lo explique. Todo lo
 * demás —las comisiones, el cambio de divisa— son casos de eso mismo.
 */
import libro from '../lib/libro.js';
import monedas from '../lib/monedas.js';
const { armar, saldo, reservas } = libro;
const { aTexto } = monedas;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);
const rechaza = (fn, que) => {
  let msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  comprobar(msg !== null, que, msg ? `dijo: ${msg}` : 'NO se quejó, lo aceptó');
};

// Qué cuenta es custodia de verdad y cuál no. La posición de cambio es una
// cuenta de la casa, no plata guardada de nadie.
const CUENTAS = { 'posicion.cambio': { custodia: false } };

decir('un depósito: la casa NO se queda con el dinero, lo DEBE');
const asientos = [];
{
  asientos.push(armar({
    ref: 'dep-1', glosa: 'Depósito en efectivo de Ana',
    lineas: [
      { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', debe: '10000' },
      { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', haber: '10000' },
    ],
  }));
  comprobar(saldo(asientos, 'cliente:ana', 'USD') === '10000',
    'Ana tiene 100.00 USD', aTexto(saldo(asientos, 'cliente:ana', 'USD'), 'USD'));
  comprobar(saldo(asientos, 'banco.corresponsal', 'USD') === '10000',
    'y en el banco hay 100.00 USD de verdad');

  const r = reservas(asientos, CUENTAS);
  comprobar(r.USD.cubierto && r.USD.diferencia === '0',
    'lo que se debe y lo que hay coinciden exactamente', JSON.stringify(r.USD));
}

decir('una transferencia entre clientes no crea ni destruye dinero');
{
  asientos.push(armar({
    ref: 'tr-1', glosa: 'Ana le manda 30.00 a Beto',
    lineas: [
      { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', debe: '3000' },
      { cuenta: 'cliente:beto', tipo: 'pasivo', moneda: 'USD', haber: '3000' },
    ],
  }));
  comprobar(saldo(asientos, 'cliente:ana', 'USD') === '7000', 'a Ana le quedan 70.00');
  comprobar(saldo(asientos, 'cliente:beto', 'USD') === '3000', 'y Beto tiene 30.00');
  const r = reservas(asientos, CUENTAS);
  comprobar(r.USD.diferencia === '0', 'y el total sigue cuadrando al céntimo', JSON.stringify(r.USD));
}

decir('la comisión es un INGRESO, no un céntimo que desaparece');
{
  asientos.push(armar({
    ref: 'dep-2', glosa: 'Depósito de Beto, 50.00 menos 1.00 de comisión',
    lineas: [
      { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', debe: '5000' },
      { cuenta: 'cliente:beto', tipo: 'pasivo', moneda: 'USD', haber: '4900' },
      { cuenta: 'ingreso.comisiones', tipo: 'ingreso', moneda: 'USD', haber: '100' },
    ],
  }));
  comprobar(saldo(asientos, 'cliente:beto', 'USD') === '7900', 'Beto queda con 79.00');
  comprobar(saldo(asientos, 'ingreso.comisiones', 'USD') === '100',
    'y la comisión aparece cobrada, con nombre y apellido');
  // La comisión es plata de la casa que sigue en la cuenta del banco: por eso
  // ahora hay MÁS guardado de lo que se le debe a los clientes. Eso está bien.
  const r = reservas(asientos, CUENTAS);
  comprobar(r.USD.diferencia === '100' && r.USD.cubierto,
    'y sobra exactamente la comisión en la cuenta del banco', JSON.stringify(r.USD));
}

decir('LO QUE NO CUADRA NO ENTRA');
{
  rechaza(() => armar({ ref: 'x', glosa: 'descuadrado', lineas: [
    { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', debe: '10000' },
    { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', haber: '9999' },
  ]}), 'un asiento que no cuadra por un céntimo');

  rechaza(() => armar({ ref: 'x', glosa: 'de los dos lados', lineas: [
    { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', debe: '100', haber: '100' },
    { cuenta: 'cliente:beto', tipo: 'pasivo', moneda: 'USD', haber: '100' },
  ]}), 'una línea con debe Y haber a la vez');

  /* EL CASO QUE MÁS IMPORTA: 100 dólares y 100 lempiras no se cancelan. Si el
     libro sumara todo junto, este asiento «cuadraría» y la casa se habría
     inventado un tipo de cambio de 1 a 1 sin que nadie lo decidiera. */
  rechaza(() => armar({ ref: 'x', glosa: 'monedas mezcladas', lineas: [
    { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', debe: '10000' },
    { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'HNL', haber: '10000' },
  ]}), 'dólares contra lempiras: no cuadra aunque el número sea igual');

  rechaza(() => armar({ ref: 'x', glosa: 'una sola línea', lineas: [
    { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', haber: '100' },
  ]}), 'un asiento de una sola línea');

  rechaza(() => armar({ ref: 'x', glosa: 'monto flotante', lineas: [
    { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', debe: 100.5 },
    { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', haber: '10050' },
  ]}), 'un monto en coma flotante en vez de unidades mínimas');

  rechaza(() => armar({ ref: 'x', glosa: 'tipo inventado', lineas: [
    { cuenta: 'algo', tipo: 'varios', moneda: 'USD', debe: '100' },
    { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', haber: '100' },
  ]}), 'una cuenta de tipo inventado');

  rechaza(() => armar({ ref: 'x', glosa: '', lineas: [
    { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', debe: '100' },
    { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', haber: '100' },
  ]}), 'un asiento sin glosa — un movimiento sin explicación no es un movimiento');
}

decir('el cambio de divisa deja la posición A LA VISTA');
{
  /* Ana cambia 50.00 USD a lempiras a 25.00 por dólar → 1250.00 HNL.
     Son dos patas, cada una cuadrada en SU moneda. */
  asientos.push(armar({
    ref: 'fx-1', glosa: 'Ana cambia 50.00 USD a HNL a 25.0000',
    lineas: [
      { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'USD', debe: '5000' },
      { cuenta: 'posicion.cambio', tipo: 'activo', moneda: 'USD', debe: '0', haber: '5000' },
      { cuenta: 'posicion.cambio', tipo: 'activo', moneda: 'HNL', debe: '125000' },
      { cuenta: 'cliente:ana', tipo: 'pasivo', moneda: 'HNL', haber: '125000' },
    ],
  }));
  comprobar(saldo(asientos, 'cliente:ana', 'USD') === '2000', 'a Ana le quedan 20.00 USD');
  comprobar(saldo(asientos, 'cliente:ana', 'HNL') === '125000', 'y tiene 1250.00 HNL');

  const r = reservas(asientos, CUENTAS);
  /* Y ahora lo importante: la casa DEBE 1250.00 lempiras que todavía no tiene
     en ningún banco. Eso no es un error del libro, es la verdad —y por eso el
     libro la enseña en vez de taparla con un asiento de ajuste. */
  comprobar(r.HNL && r.HNL.cubierto === false && r.HNL.diferencia === '-125000',
    'la casa queda CORTA en lempiras hasta que las compre de verdad',
    JSON.stringify(r.HNL));
  comprobar(r.USD.diferencia === '5100',
    'y le sobran los dólares que recibió a cambio, más la comisión', JSON.stringify(r.USD));
}

decir('un saldo en rojo se ve, no se esconde');
{
  /* El libro NO impide que una cuenta quede negativa: eso es una regla de
     negocio y se comprueba ANTES de asentar. Lo que el libro garantiza es que
     si pasa, se vea. Un libro que recorta el número a cero para que «se vea
     bien» es un libro que miente. */
  const conRojo = asientos.concat([armar({
    ref: 'ret-1', glosa: 'Retiro de Beto por más de lo que tiene',
    lineas: [
      { cuenta: 'cliente:beto', tipo: 'pasivo', moneda: 'USD', debe: '20000' },
      { cuenta: 'banco.corresponsal', tipo: 'activo', moneda: 'USD', haber: '20000' },
    ],
  })]);
  comprobar(saldo(conRojo, 'cliente:beto', 'USD') === '-12100',
    'el saldo de Beto sale en rojo, sin maquillar',
    aTexto(saldo(conRojo, 'cliente:beto', 'USD'), 'USD'));
}

decir('el saldo se DERIVA, no se guarda');
{
  // Recorrer los asientos en cualquier orden da lo mismo: no hay estado.
  const alReves = asientos.slice().reverse();
  comprobar(saldo(alReves, 'cliente:ana', 'USD') === saldo(asientos, 'cliente:ana', 'USD'),
    'el orden en que se sumen los asientos no cambia el saldo');
  comprobar(saldo(asientos, 'cliente:nadie', 'USD') === '0',
    'una cuenta sin movimientos vale cero, no undefined');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
