/* Las monedas y la lectura de montos.
 *
 *   node pruebas/probar-monedas.mjs
 *
 * Esta es la frontera por donde entra el dinero escrito por una persona, y por
 * eso se castiga duro. Lo que se persigue:
 *
 *  1. Que CLP y PYG tengan CERO decimales. Es el error clásico —«todas tienen
 *     dos»— y no se nota hasta que un saldo chileno sale cien veces más grande.
 *  2. Que «1.234,56» y «1,234.56» den lo mismo: la mitad del continente
 *     escribe de una forma y la otra mitad de la otra.
 *  3. Que más decimales de los que la moneda tiene se RECHACEN, no se
 *     redondeen. Redondear el dinero de otro en silencio es como se pierden
 *     céntimos que nadie sabe explicar.
 *  4. Que la vuelta —texto a mínimas y de vuelta a texto— no pierda nada.
 */
/* CommonJS del otro lado (el API corre sin transpilar, como el de Ordenex), asi
   que se importa el modulo entero y se desarma aqui. */
import mod from '../lib/monedas.js';
const { MONEDAS, moneda, existe, aMinimas, aTexto } = mod;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

decir('los decimales son un DATO, no una constante');
{
  comprobar(moneda('CLP').dec === 0, 'el peso chileno tiene CERO decimales', `dec=${moneda('CLP').dec}`);
  comprobar(moneda('PYG').dec === 0, 'el guaraní tiene CERO decimales', `dec=${moneda('PYG').dec}`);
  comprobar(moneda('USD').dec === 2 && moneda('HNL').dec === 2, 'el dólar y la lempira, dos');

  // 1000 pesos chilenos son 1000 unidades mínimas, no 100000.
  comprobar(aMinimas('1000', 'CLP') === '1000',
    'mil pesos chilenos son 1000 unidades, no 100000', aMinimas('1000', 'CLP'));
  comprobar(aMinimas('1000', 'USD') === '100000',
    'y mil dólares SÍ son 100000 centavos', aMinimas('1000', 'USD'));

  // La comprobación que caza el error si alguien mete un `dec: 2` a mano.
  const sinDec = MONEDAS.filter((m) => typeof m.dec !== 'number' || m.dec < 0 || m.dec > 4);
  comprobar(sinDec.length === 0, 'ninguna moneda tiene decimales imposibles',
    sinDec.map((m) => m.c).join(', '));
  const codigos = MONEDAS.map((m) => m.c);
  comprobar(new Set(codigos).size === codigos.length, 'ningún código repetido');
  comprobar(codigos.every((c) => /^[A-Z]{3}$/.test(c)), 'todos los códigos son ISO de tres letras');
}

decir('las dos formas de escribir un número, y las dos valen');
{
  comprobar(aMinimas('1.234,56', 'USD') === '123456', 'a la europea: 1.234,56', aMinimas('1.234,56', 'USD'));
  comprobar(aMinimas('1,234.56', 'USD') === '123456', 'a la americana: 1,234.56', aMinimas('1,234.56', 'USD'));
  comprobar(aMinimas('1234.56', 'USD') === '123456', 'sin miles: 1234.56');
  comprobar(aMinimas('1234,56', 'USD') === '123456', 'con coma: 1234,56');
  comprobar(aMinimas('1 234,56', 'USD') === '123456', 'con espacio de miles');
  comprobar(aMinimas('0,05', 'USD') === '5', 'cinco centavos');
  comprobar(aMinimas('0', 'USD') === '0', 'cero es cero');

  /* «1.234» es AMBIGUO y se resuelve como mil doscientos treinta y cuatro,
     que es lo que escribe todo el mundo al poner un separador de miles. */
  comprobar(aMinimas('1.234', 'USD') === '123400',
    '«1.234» se lee como mil doscientos treinta y cuatro', aMinimas('1.234', 'USD'));
  /* Y por la misma regla «1.005» es mil cinco, no uno con cinco milésimas. Se
     decide por el AGRUPAMIENTO, no por si la cifra empieza en cero: si se
     leyera al revés, «1.005» y «1.234» —escritos igual— darían cosas
     distintas, que es justo la incoherencia que hace perder plata. */
  comprobar(aMinimas('1.005', 'USD') === '100500',
    '«1.005» se lee como mil cinco, por la misma regla', aMinimas('1.005', 'USD'));
  comprobar(aMinimas('1.234.567', 'USD') === '123456700',
    '«1.234.567» son un millón doscientos treinta y cuatro mil quinientos sesenta y siete');
}

decir('LO QUE NO SE ENTIENDE, SE RECHAZA');
{
  // Rechazar es la respuesta correcta en una frontera de dinero. Enderezar a
  // ojo lo que llegó torcido es adivinar con la plata de otro.
  for (const [t, m, por] of [
    ['1234.567', 'USD', 'tres decimales en una moneda de dos'],
    ['1.234.56', 'USD', 'miles mal agrupados'],
    ['1,23,456.78', 'USD', 'agrupamiento que no es de tres en tres'],
    ['10,5', 'CLP', 'decimales en una moneda que no los tiene'],
    ['-5', 'USD', 'negativo'],
    ['abc', 'USD', 'letras'],
    ['', 'USD', 'vacío'],
    ['  ', 'USD', 'solo espacios'],
    ['1.2.3.4', 'USD', 'separadores sin sentido'],
    ['5', 'XXX', 'moneda que no existe'],
    [null, 'USD', 'null'],
  ]) {
    comprobar(aMinimas(t, m) === null, `«${t}» en ${m} se rechaza — ${por}`, String(aMinimas(t, m)));
  }
  comprobar(!existe('XXX') && !existe(''), 'una moneda inventada no existe');
}

decir('la ida y la vuelta no pierden nada');
{
  const casos = [
    ['USD', '1234.56'], ['USD', '0.01'], ['USD', '0.00'],
    ['CLP', '1000'], ['CLP', '0'], ['PYG', '7500000'],
    ['EUR', '999999999.99'], ['HNL', '25.50'], ['CAD', '12.05'],
  ];
  for (const [m, t] of casos) {
    const min = aMinimas(t, m);
    const vuelta = aTexto(min, m);
    comprobar(vuelta === t, `${m} ${t} → ${min} → ${vuelta}`);
  }
}

decir('cifras grandes sin perder un céntimo');
{
  // El motivo de guardar enteros: en coma flotante, esto se rompe.
  const mil = aMinimas('999999999999.99', 'USD');
  comprobar(mil === '99999999999999', 'un billón menos un céntimo entra entero', mil);
  comprobar(aTexto(mil, 'USD') === '999999999999.99', 'y vuelve igual');

  // Sumar diez veces diez céntimos da un dólar EXACTO. Con flotantes no.
  let suma = 0n;
  for (let i = 0; i < 10; i++) suma += BigInt(aMinimas('0.10', 'USD'));
  comprobar(aTexto(suma.toString(), 'USD') === '1.00',
    'diez veces diez céntimos dan un dólar exacto', aTexto(suma.toString(), 'USD'));
}

decir('la cobertura de la region');
{
  const hace = (c) => MONEDAS.some((m) => m.c === c);
  const faltan = ['USD', 'HNL', 'GTQ', 'CRC', 'NIO', 'PAB', 'DOP', 'MXN', 'COP', 'PEN',
                  'BOB', 'BRL', 'ARS', 'UYU', 'CLP', 'PYG', 'VES', 'CAD', 'EUR']
    .filter((c) => !hace(c));
  comprobar(faltan.length === 0, 'están Latinoamérica, Canadá y el euro', faltan.join(', '));
  comprobar(MONEDAS.every((m) => m.n && m.pais && m.simbolo),
    'y cada una trae nombre, país y símbolo para la pantalla');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
