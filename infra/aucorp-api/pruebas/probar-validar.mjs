/* La frontera de entrada, campo por campo.
 *
 *   node pruebas/probar-validar.mjs
 *
 * Puro cálculo, sin base. Lo que se persigue: que cada forma torcida se
 * rechace CON SU MOTIVO, y que ninguna forma buena se rechace. Un validador
 * que deja pasar un gid mal tecleado es una transferencia a nadie; uno que
 * rechaza «1.234,56» es un cliente que no puede escribir como escribe.
 */
const V = (await import('../lib/validar.js')).default;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);
/** Devuelve el error lanzado, o null si no lanzó. */
const falla = (fn) => { try { fn(); return null; } catch (e) { return e; } };

decir('montos: se leen las dos formas del continente y se rechaza lo torcido');
{
  comprobar(V.monto('1,000.00', 'USD') === '100000', '«1,000.00» USD → 100000 centavos');
  comprobar(V.monto('1.234,56', 'USD') === '123456', '«1.234,56» USD → 123456');
  comprobar(V.monto('1500', 'CLP') === '1500', '«1500» CLP (cero decimales) → 1500');
  let e = falla(() => V.monto('12.5', 'CLP'));
  comprobar(e?.codigo === 'MONTO_INVALIDO' && /no tiene decimales/.test(e.message),
    'un decimal en pesos chilenos se rechaza Y se explica que no existen', e?.message);
  e = falla(() => V.monto('1.234', 'USD'));
  comprobar(e === null && V.monto('1.234', 'USD') === '123400', '«1.234» USD se lee como mil doscientos treinta y cuatro (agrupa bien)');
  comprobar(V.monto('12.345', 'USD') === '1234500', '«12.345» USD agrupa de a tres: son doce mil trescientos cuarenta y cinco');
  e = falla(() => V.monto('12.3456', 'USD'));
  comprobar(e?.codigo === 'MONTO_INVALIDO' && /hasta 2 decimales/.test(e.message),
    'cuatro decimales en dólares se rechazan y se dice cuántos caben', e?.message);
  e = falla(() => V.monto('-5', 'USD'));
  comprobar(e?.codigo === 'MONTO_NEGATIVO', 'un negativo se rechaza con su nombre', e?.codigo);
  e = falla(() => V.monto('0', 'USD'));
  comprobar(e?.codigo === 'MONTO_CERO', 'y el cero también', e?.codigo);
  e = falla(() => V.monto('', 'USD'));
  comprobar(e?.codigo === 'MONTO_FALTA', 'y el vacío dice que falta', e?.codigo);
  e = falla(() => V.monto('1e6', 'USD'));
  comprobar(e?.codigo === 'MONTO_INVALIDO', 'notación científica no es un monto', e?.codigo);
  e = falla(() => V.monto({ toString: () => '100' }, 'USD'));
  comprobar(e === null, 'un objeto con toString se lee como su texto (no revienta)');
}

decir('monedas');
{
  comprobar(V.moneda('usd') === 'USD', 'en minúsculas se normaliza');
  comprobar(V.moneda(' hnl ') === 'HNL', 'con espacios también');
  let e = falla(() => V.moneda('XXX'));
  comprobar(e?.codigo === 'MONEDA_DESCONOCIDA' && /XXX/.test(e.message), 'una inventada se rechaza diciendo cuál', e?.message);
  e = falla(() => V.moneda(''));
  comprobar(e?.codigo === 'MONEDA_FALTA', 'vacía dice que falta');
  e = falla(() => V.moneda('<script>alert(1)</script>'));
  comprobar(e?.codigo === 'MONEDA_DESCONOCIDA' && e.message.length < 80, 'y un texto largo se recorta en el mensaje', e?.message);
}

decir('el Genesis ID: forma y dígito verificador');
{
  // Un gid válido de verdad, construido con el mismo verificador que Genesis.
  const ALF = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const cuerpo = 'K7QP-3M2X';
  let suma = 0;
  const limpio = cuerpo.replace(/-/g, '');
  for (let i = 0; i < limpio.length; i++) suma += ALF.indexOf(limpio[i]) * (i + 2);
  const bueno = `GEN-${cuerpo}-${ALF[suma % ALF.length]}`;
  const malo = `GEN-${cuerpo}-${ALF[(suma + 1) % ALF.length]}`;

  comprobar(V.gid(bueno) === bueno, `${bueno} pasa`);
  comprobar(V.gid(bueno.toLowerCase()) === bueno, 'y en minúsculas se normaliza a mayúsculas');
  comprobar(V.gid(` ${bueno.slice(0, 8)} ${bueno.slice(8)} `) === bueno, 'y con espacios de por medio se limpia');
  let e = falla(() => V.gid(malo));
  comprobar(e?.codigo === 'GID_INVALIDO', 'un dígito verificador que no cuadra se rechaza (un gid mal tecleado)', e?.codigo);
  e = falla(() => V.gid('GEN-K7QP-3M2X'));
  comprobar(e?.codigo === 'GID_INVALIDO', 'sin verificador tampoco');
  e = falla(() => V.gid('GEN-K7QP-3M2I-4'));
  comprobar(e?.codigo === 'GID_INVALIDO', 'con una I (fuera del alfabeto) tampoco');
  comprobar(V.gid('gid-ana') === 'gid-ana', 'el gid de laboratorio de las pruebas pasa');
  e = falla(() => V.gid('gid-' + 'a'.repeat(60)));
  comprobar(e?.codigo === 'GID_INVALIDO', 'pero uno de laboratorio largo no');
  e = falla(() => V.gid(''));
  comprobar(e?.codigo === 'GID_FALTA', 'y vacío dice que falta');
  comprobar(V.gidValido(bueno) && !V.gidValido(malo), 'gidValido() dice lo mismo sin lanzar');
}

decir('ids de Mongo: forma exacta o nada');
{
  comprobar(V.id('65f1a2b3c4d5e6f7a8b9c0d1') === '65f1a2b3c4d5e6f7a8b9c0d1', 'veinticuatro hexadecimales pasan');
  comprobar(V.id('65F1A2B3C4D5E6F7A8B9C0D1') === '65f1a2b3c4d5e6f7a8b9c0d1', 'y se bajan a minúsculas');
  let e = falla(() => V.id('123'));
  comprobar(e?.codigo === 'ID_INVALIDO', 'uno corto se rechaza ANTES de llegar a Mongo', e?.codigo);
  e = falla(() => V.id('65f1a2b3c4d5e6f7a8b9c0dz'));
  comprobar(e?.codigo === 'ID_INVALIDO', 'y uno con una letra fuera de hex también');
  e = falla(() => V.id({ $ne: null }));
  comprobar(e?.codigo === 'ID_INVALIDO', 'un objeto (inyección de operadores) no es un id', e?.codigo);
  e = falla(() => V.id(''));
  comprobar(e?.codigo === 'ID_FALTA', 'vacío dice que falta');
}

decir('el sello de idempotencia');
{
  comprobar(V.ref('transferencia-ana-beto-0001') === 'transferencia-ana-beto-0001', 'uno normal pasa');
  let e = falla(() => V.ref('a1'));
  comprobar(e?.codigo === 'REF_INVALIDA' && /entre 8 y 80/.test(e.message), 'uno corto se rechaza diciendo el largo', e?.message);
  e = falla(() => V.ref('tiene espacios aqui'));
  comprobar(e?.codigo === 'REF_INVALIDA', 'con espacios no');
  e = falla(() => V.ref(''));
  comprobar(e?.codigo === 'REF_FALTA', 'vacío dice que falta');
}

decir('textos, enteros y opciones');
{
  comprobar(V.texto('  hola  ', { max: 10 }) === 'hola', 'se recorta');
  let e = falla(() => V.texto('x'.repeat(11), { max: 10, campo: 'alias', etiqueta: 'el alias' }));
  comprobar(e?.codigo === 'TEXTO_LARGO' && /máximo 10/.test(e.message), 'largo de más se rechaza (no se trunca en silencio)', e?.message);
  e = falla(() => V.texto('', { obligatorio: true, etiqueta: 'el motivo' }));
  comprobar(e?.codigo === 'FALTA' && /Falta el motivo/.test(e.message), 'obligatorio vacío dice qué falta', e?.message);
  e = falla(() => V.texto({ a: 1 }));
  comprobar(e?.codigo === 'TEXTO_INVALIDO', 'un objeto no es un texto');
  comprobar(V.entero('3', { min: 1, max: 3 }) === 3, 'un entero en rango pasa');
  e = falla(() => V.entero('4', { min: 1, max: 3, etiqueta: 'el nivel' }));
  comprobar(e?.codigo === 'FUERA_DE_RANGO' && /entre 1 y 3/.test(e.message), 'fuera de rango dice el rango', e?.message);
  e = falla(() => V.entero('2.5', { min: 1, max: 3 }));
  comprobar(e?.codigo === 'ENTERO_INVALIDO', 'un decimal no es entero');
  comprobar(V.entero('', { porDefecto: 0 }) === 0, 'ausente con defecto devuelve el defecto');
  comprobar(V.opcion('bancario', ['interno', 'bancario']) === 'bancario', 'una opción de la lista pasa');
  e = falla(() => V.opcion('otro', ['interno', 'bancario'], { etiqueta: 'el tipo' }));
  comprobar(e?.codigo === 'OPCION_INVALIDA' && /interno, bancario/.test(e.message), 'una de fuera dice cuáles valen', e?.message);
}

decir('fechas y meses');
{
  comprobar(V.fecha('2026-08-15').toISOString() === '2026-08-15T00:00:00.000Z', 'una fecha se lee al inicio del día UTC');
  comprobar(V.fecha('2026-08-15', { fin: true }).toISOString() === '2026-08-15T23:59:59.999Z', 'y con fin, al final');
  let e = falla(() => V.fecha('2026-02-30'));
  comprobar(e?.codigo === 'FECHA_INVALIDA', 'el 30 de febrero no existe', e?.codigo);
  e = falla(() => V.fecha('15/08/2026'));
  comprobar(e?.codigo === 'FECHA_INVALIDA' && /AAAA-MM-DD/.test(e.message), 'otra forma se rechaza diciendo la esperada', e?.message);
  const m = V.mes('2026-08');
  comprobar(m.desde.toISOString() === '2026-08-01T00:00:00.000Z' && m.hasta.toISOString() === '2026-08-31T23:59:59.999Z',
    'un mes va del 1 a las 00:00 al último día a las 23:59:59.999', `${m.desde.toISOString()} → ${m.hasta.toISOString()}`);
  comprobar(V.mes('2024-02').hasta.toISOString().startsWith('2024-02-29'), 'y febrero bisiesto termina el 29');
  e = falla(() => V.mes('2026-13'));
  comprobar(e?.codigo === 'MES_INVALIDO', 'el mes 13 no existe');
  e = falla(() => V.mes('2019-01'));
  comprobar(e?.codigo === 'MES_INVALIDO', 'y antes de 2020 no hay extracto');
}

decir('cuentas bancarias y SWIFT');
{
  comprobar(V.numeroCuenta('0123 4567 8901') === '012345678901', 'los espacios se quitan');
  comprobar(V.numeroCuenta('HN12-3456-7890') === 'HN12-3456-7890', 'los guiones se conservan');
  let e = falla(() => V.numeroCuenta('12'));
  comprobar(e?.codigo === 'NUMERO_INVALIDO', 'uno de dos dígitos no es una cuenta');
  e = falla(() => V.numeroCuenta('1234; DROP TABLE'));
  comprobar(e?.codigo === 'NUMERO_INVALIDO', 'y con caracteres raros tampoco');
  comprobar(V.swift('bamchnte') === 'BAMCHNTE', 'un BIC de 8 pasa y se sube a mayúsculas');
  comprobar(V.swift('BAMCHNTEXXX') === 'BAMCHNTEXXX', 'uno de 11 también');
  comprobar(V.swift('') === '', 'vacío se admite (no todos los bancos lo piden)');
  e = falla(() => V.swift('BAMC'));
  comprobar(e?.codigo === 'SWIFT_INVALIDO', 'uno de 4 no');
}

decir('el cuerpo de la petición');
{
  comprobar(JSON.stringify(V.cuerpo({ body: undefined })) === '{}', 'sin cuerpo es un objeto vacío');
  let e = falla(() => V.cuerpo({ body: [1, 2] }));
  comprobar(e?.codigo === 'CUERPO_INVALIDO', 'un array no es un pedido');
  e = falla(() => V.cuerpo({ body: 'hola' }));
  comprobar(e?.codigo === 'CUERPO_INVALIDO', 'y un texto tampoco');
}

decir('conEntrada traduce el error a 400 con campo y código');
{
  const h = V.conEntrada(async (req, res) => { V.moneda(req.body.moneda, { campo: 'moneda' }); res.json({ ok: true }); });
  let estado = null; let cuerpo = null; let siguiente = null;
  const res = { status(s) { estado = s; return this; }, json(j) { cuerpo = j; return this; } };
  await h({ body: { moneda: 'ZZZ' } }, res, (e) => { siguiente = e; });
  comprobar(estado === 400 && cuerpo?.codigo === 'MONEDA_DESCONOCIDA' && cuerpo?.campo === 'moneda',
    'un ErrorDeEntrada sale como 400 con código y campo', JSON.stringify(cuerpo));
  const h2 = V.conEntrada(async () => { throw new Error('otra cosa'); });
  await h2({ body: {} }, res, (e) => { siguiente = e; });
  comprobar(siguiente?.message === 'otra cosa', 'y cualquier otro error sigue al manejador general');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
