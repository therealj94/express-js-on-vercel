/* EL ESTADO VIVO: cada pata falla sola, y el resumen para el modelo dice la verdad.
 *
 *   node infra/ultron/pruebas/probar-vivo.mjs
 *
 * No se sale a internet: se finge `fetch`. Lo que se prueba es la LÓGICA —
 * que una casa caída no tumbe el estado entero, que la compra con USDT salga
 * «cerrada» cuando el servidor dice entrega:false y «desconocida» cuando no
 * contesta, y que el precio del ORIGEN salga de la referencia de Ordenex y no
 * de una cuenta repetida acá.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + String(extra).slice(0, 200) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

const respuestas = new Map();
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  for (const [patron, r] of respuestas) {
    if (u.includes(patron)) {
      if (r instanceof Error) throw r;
      return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, text: async () => JSON.stringify(r.cuerpo) };
    }
  }
  throw new Error('fetch failed');
};
const vivo = require('../lib/vivo.js');

titulo('todo vivo');
respuestas.clear();
respuestas.set('ordenex-api', { cuerpo: { ok: true, cadena: true, mongo: true, bloque: 84690, entrega: false } });
respuestas.set('/mercados', { cuerpo: [{ mercado: 'AUKA-ORIGEN', ultimo: null, vol24h: 0, referencia: { usd: 4389.89, origenUsd: 2.566148, fuente: 'metals', en: '2026-09-04T10:00:00Z' } }] });
// el orden importa: /mercados es de ordenex-api también, así que va después
respuestas.set('aucorp-api', { cuerpo: { ok: true, tasas: true, tasasCuando: '2026-09-04T00:02:31Z', sanciones: { cargadas: true, registros: 19321, fechaDescarga: '2026-09-02', vencidas: false }, naturaleza: 'FinTech. No es un banco.' } });
respuestas.set('vetawallet', { cuerpo: { ok: true } });
respuestas.set('genesis-id', { cuerpo: { ok: true } });
respuestas.set('orden-global-scan', { cuerpo: { totalBlock: 1234567 } });
// /mercados y /monedas comparten host con /salud: se resuelven aparte
const fetchAntes = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/mercados')) return { status: 200, ok: true, text: async () => JSON.stringify(respuestas.get('/mercados').cuerpo) };
  if (u.endsWith('/monedas')) return { status: 200, ok: true, text: async () => JSON.stringify({ monedas: [{ codigo: 'USD' }, { codigo: 'HNL' }] }) };
  return fetchAntes(url);
};
{
  const v = await vivo.leer();
  decir(v.ordenex.vivo === true, 'Ordenex viva');
  decir(v.ordenex.compraUsdt === 'cerrada', 'la compra con USDT sale «cerrada» cuando entrega es false', v.ordenex.compraUsdt);
  decir(v.origen?.origenUsd === 2.566148, 'el ORIGEN sale de la referencia de Ordenex, no de una cuenta acá', JSON.stringify(v.origen));
  decir(v.aucorp.monedas?.length === 2, 'AuCorp trae sus monedas');
  decir(v.ordenscan.bloqueScan === 1234567, 'OrdenScan trae la altura de la 5550 (es la 5550, no la 8532 vieja)');
  const t = vivo.paraElModelo(v);
  decir(/ORIGEN: \$2\.566148/.test(t), 'el texto para el modelo lleva el precio', t.split('\n')[1]);
  decir(/compra con USDT cerrada/.test(t), 'y dice que la compra está cerrada — para que no le diga a nadie que mande dinero');
  decir(/AuCorp es: FinTech/.test(t), 'y lo que AuCorp ES, con las palabras del propio API');
}

titulo('una casa caída no tumba a las demás');
respuestas.set('aucorp-api', new Error('ECONNRESET'));
{
  const v = await vivo.leer();
  decir(v.aucorp.vivo === false && /ECONNRESET/.test(v.aucorp.error || ''), 'AuCorp: no contesta, con el motivo', v.aucorp.error);
  decir(v.ordenex.vivo === true, 'Ordenex sigue viva');
  decir(/AuCorp: NO CONTESTA/.test(vivo.paraElModelo(v)), 'y el modelo se entera de que AuCorp no contesta');
}

titulo('sin datos no se inventa nada');
respuestas.set('ordenex-api', new Error('timeout'));
globalThis.fetch = async (url) => { const u = String(url); if (u.includes('ordenex-api')) throw new Error('timeout'); return fetchAntes(url); };
{
  const v = await vivo.leer();
  decir(v.ordenex.compraUsdt === null, 'la compra con USDT es «desconocida» (null), no «cerrada» ni «abierta»', String(v.ordenex.compraUsdt));
  decir(v.origen === null, 'y el precio del ORIGEN es null, no un número viejo');
  decir(/ORIGEN: precio no disponible/.test(vivo.paraElModelo(v)), 'el modelo lee «no disponible»');
}

titulo('la caché');
{
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; return { status: 200, ok: true, text: async () => '{}' }; };
  await vivo.leerConCache(60_000); const n1 = llamadas;
  await vivo.leerConCache(60_000);
  decir(llamadas === n1, 'la segunda lectura dentro del plazo no vuelve a pedir nada', `${llamadas} llamadas`);
}

globalThis.fetch = fetchReal;
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
