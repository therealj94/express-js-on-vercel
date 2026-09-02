/* El comprobante por movimiento, el extracto mensual y los filtros del
 * historial, contra el API de verdad.
 *
 *   node pruebas/probar-comprobante.mjs
 *
 * Lo que se persigue: que un comprobante diga lo que dice el libro (saldo
 * antes, saldo después, huella estable), que un comprobante ajeno NO exista
 * para quien lo pide, que el extracto de un mes cuadre (inicial + entradas −
 * salidas = final) y que el CSV se pueda abrir sin sorpresas.
 */
import { levantar, contador } from './arnes.mjs';

const { pedir, entrar, cerrar, ADMIN, BASE } = await levantar();
const { comprobar, decir, terminar } = contador();

const ana = await entrar('gid-ana');
const beto = await entrar('gid-beto');
await pedir('/cuentas', { metodo: 'POST', token: ana, cuerpo: { moneda: 'USD' } });
await pedir('/cuentas', { metodo: 'POST', token: beto, cuerpo: { moneda: 'USD' } });

// Dos depósitos y una transferencia, con fechas CONTROLADAS: los asientos se
// fechan al crearse, así que se retocan por detrás para que caigan en meses
// distintos y el extracto tenga algo que separar.
const { Asiento } = (await import('../models/index.js')).default;
const fechar = async (refTermina, iso) => Asiento.updateOne({ ref: new RegExp(refTermina + '$') }, { $set: { fecha: new Date(iso) } });

await pedir('/tesoreria/deposito', { metodo: 'POST', admin: ADMIN, cuerpo: {
  gid: 'gid-ana', moneda: 'USD', monto: '1000.00', ref: 'deposito-julio-0001', comprobante: 'Extracto #1' } });
await fechar('deposito-julio-0001', '2026-07-20T10:00:00Z');
await pedir('/tesoreria/deposito', { metodo: 'POST', admin: ADMIN, cuerpo: {
  gid: 'gid-ana', moneda: 'USD', monto: '250.50', ref: 'deposito-agosto-0002', comprobante: 'Extracto #2' } });
await fechar('deposito-agosto-0002', '2026-08-05T10:00:00Z');
const tr = await pedir('/movimientos/transferir', { metodo: 'POST', token: ana, cuerpo: {
  ref: 'transferencia-agosto-0003', para: 'gid-beto', moneda: 'USD', monto: '100.25' } });
await fechar('transferencia-agosto-0003', '2026-08-18T15:30:00Z');
comprobar(tr.estado === 200, 'el escenario se armó: dos depósitos y una transferencia', JSON.stringify(tr.datos));

decir('el comprobante de un movimiento');
{
  const r = await pedir('/movimientos/transferencia-agosto-0003/comprobante', { token: ana });
  const c = r.datos.comprobante;
  comprobar(r.estado === 200 && c?.numero === 'transferencia-agosto-0003', 'se pide por su número (la ref sin el gid)', JSON.stringify(r.datos));
  comprobar(c?.montos?.[0]?.sentido === 'sale' && c.montos[0].monto === '100.25', 'dice que salieron 100.25', JSON.stringify(c?.montos));
  comprobar(c?.montos?.[0]?.saldoAntes === '1250.50' && c.montos[0].saldoDespues === '1150.25',
    'con el saldo antes y después, derivados del libro', `${c?.montos?.[0]?.saldoAntes} → ${c?.montos?.[0]?.saldoDespues}`);
  comprobar(c?.contrapartes?.includes('Otra cuenta de AuCorp'), 'la contraparte se nombra sin exponer nada ajeno', JSON.stringify(c?.contrapartes));
  comprobar(/^[0-9a-f]{64}$/.test(c?.huella || ''), 'lleva una huella SHA-256');
  comprobar(/No es un banco/.test(c?.emisor || ''), 'y el emisor dice lo que AuCorp NO es');

  const otraVez = await pedir('/movimientos/transferencia-agosto-0003/comprobante', { token: ana });
  comprobar(otraVez.datos.comprobante?.huella === c.huella, 'la huella es estable: pedirlo dos veces da la misma');

  const deBeto = await pedir('/movimientos/transferencia-agosto-0003/comprobante', { token: beto });
  comprobar(deBeto.estado === 404, 'Beto NO puede pedir el comprobante con el número de Ana: el número no es un permiso', String(deBeto.estado));

  const suyo = await pedir(`/movimientos?q=transferencia-agosto`, { token: beto });
  const numBeto = suyo.datos.movimientos?.[0]?.numero;
  comprobar(numBeto === 'gid-ana:transferencia-agosto-0003' || suyo.datos.movimientos?.length === 1,
    'aunque Beto sí ve la transferencia en SU historial', JSON.stringify(numBeto));

  const inventado = await pedir('/movimientos/no-existe-0000/comprobante', { token: ana });
  comprobar(inventado.estado === 404 && inventado.datos.codigo === 'NO_EXISTE', 'un número inventado dice que no existe');
  const corto = await pedir('/movimientos/x/comprobante', { token: ana });
  comprobar(corto.estado === 400 && corto.datos.codigo === 'REF_INVALIDA', 'y un número sin forma se rechaza antes de mirar la base', JSON.stringify(corto.datos));
}

decir('el extracto mensual cuadra');
{
  const r = await pedir('/extracto?moneda=USD&mes=2026-08', { token: ana });
  const e = r.datos.extracto;
  comprobar(r.estado === 200 && e?.periodo === '2026-08', 'agosto en JSON', JSON.stringify(r.datos));
  comprobar(e?.saldoInicial === '1000.00', 'arranca con lo que había al cierre de julio', e?.saldoInicial);
  comprobar(e?.cantidad === 2, 'tiene los dos movimientos de agosto', String(e?.cantidad));
  comprobar(e?.totalEntradas === '250.50' && e?.totalSalidas === '100.25', 'con sus totales', `${e?.totalEntradas} / ${e?.totalSalidas}`);
  comprobar(e?.saldoFinal === '1150.25', 'y cierra en 1150.25 (inicial + entradas − salidas)', e?.saldoFinal);
  comprobar(e?.movimientos?.[0]?.saldo === '1250.50' && e?.movimientos?.[1]?.saldo === '1150.25', 'cada fila lleva el saldo después');

  const julio = await pedir('/extracto?moneda=USD&mes=2026-07', { token: ana });
  comprobar(julio.datos.extracto?.saldoInicial === '0.00' && julio.datos.extracto?.saldoFinal === '1000.00', 'julio va de 0 a 1000');
  const junio = await pedir('/extracto?moneda=USD&mes=2026-06', { token: ana });
  comprobar(junio.datos.extracto?.cantidad === 0 && junio.datos.extracto?.saldoFinal === '0.00', 'y un mes sin nada es un extracto vacío, no un error');

  const csv = await pedir('/extracto?moneda=USD&mes=2026-08&formato=csv', { token: ana });
  comprobar(csv.estado === 200 && /text\/csv/.test(csv.cabeceras.get('content-type') || ''), 'en CSV llega como text/csv');
  comprobar(/attachment; filename="aucorp-extracto-USD-2026-08.csv"/.test(csv.cabeceras.get('content-disposition') || ''), 'con nombre de archivo');
  /* `.text()` de fetch se come el BOM al decodificar (es lo que dice la
     especificación), así que se miran los BYTES. */
  const crudo = new Uint8Array(await (await fetch(`${BASE}/extracto?moneda=USD&mes=2026-08&formato=csv`,
    { headers: { Authorization: `Bearer ${ana}` } })).arrayBuffer());
  comprobar(crudo[0] === 0xEF && crudo[1] === 0xBB && crudo[2] === 0xBF, 'empieza con BOM para que Excel lo abra en UTF-8',
    [...crudo.slice(0, 3)].map((b) => b.toString(16)).join(' '));
  const filas = csv.texto.split('\r\n');
  comprobar(filas.some((f) => f.startsWith('Fecha,Número,Tipo,Concepto,Entra,Sale,Saldo')), 'con la cabecera de columnas');
  comprobar(filas.some((f) => /transferencia-agosto-0003.*,100\.25,1150\.25$/.test(f)), 'y la fila de la transferencia con su saldo', filas.find((f) => /transferencia/.test(f)));
  const { extractoCsv } = (await import('../lib/comprobante.js')).default;
  const conComa = extractoCsv({ ...e, movimientos: [{ ...e.movimientos[0], glosa: 'Pago a "Juan", con coma' }] });
  comprobar(conComa.includes('"Pago a ""Juan"", con coma"'), 'los textos con comas o comillas van entre comillas, con las comillas dobladas');

  const malMes = await pedir('/extracto?moneda=USD&mes=2026-13', { token: ana });
  comprobar(malMes.estado === 400 && malMes.datos.codigo === 'MES_INVALIDO', 'un mes 13 se rechaza');
  const sinMoneda = await pedir('/extracto?mes=2026-08', { token: ana });
  comprobar(sinMoneda.estado === 400 && sinMoneda.datos.codigo === 'MONEDA_FALTA', 'y sin moneda dice que falta');
  const sinSesion = await pedir('/extracto?moneda=USD&mes=2026-08');
  comprobar(sinSesion.estado === 401, 'sin sesión no hay extracto de nadie');
}

decir('los filtros del historial');
{
  const todo = await pedir('/movimientos', { token: ana });
  comprobar(todo.datos.total === 3 && todo.datos.movimientos.length === 3, 'sin filtro, los tres', String(todo.datos.total));
  const dep = await pedir('/movimientos?clase=deposito', { token: ana });
  comprobar(dep.datos.total === 2 && dep.datos.movimientos.every((m) => m.clase === 'deposito'), 'por clase: los dos depósitos');
  const agosto = await pedir('/movimientos?desde=2026-08-01&hasta=2026-08-31', { token: ana });
  comprobar(agosto.datos.total === 2, 'por fechas: agosto tiene dos', String(agosto.datos.total));
  const dia = await pedir('/movimientos?desde=2026-08-18&hasta=2026-08-18', { token: ana });
  comprobar(dia.datos.total === 1 && dia.datos.movimientos[0].numero === 'transferencia-agosto-0003', 'un solo día incluye el día entero');
  const texto = await pedir('/movimientos?q=julio', { token: ana });
  comprobar(texto.datos.total === 1 && texto.datos.movimientos[0].numero === 'deposito-julio-0001', 'por texto en la ref o la glosa');
  const regex = await pedir('/movimientos?q=.*', { token: ana });
  comprobar(regex.datos.total === 0, 'y la búsqueda es literal: «.*» no es un comodín');
  const alReves = await pedir('/movimientos?desde=2026-08-31&hasta=2026-08-01', { token: ana });
  comprobar(alReves.estado === 400 && alReves.datos.codigo === 'RANGO_INVALIDO', 'desde > hasta se rechaza');
  const claseMala = await pedir('/movimientos?clase=magia', { token: ana });
  comprobar(claseMala.estado === 400 && claseMala.datos.codigo === 'OPCION_INVALIDA', 'una clase inventada también');
  comprobar(todo.datos.movimientos.every((m) => m.numero && m.claseTexto), 'cada movimiento trae número y tipo legible');
}

const fallos = terminar();
await cerrar();
process.exit(fallos ? 1 : 0);
