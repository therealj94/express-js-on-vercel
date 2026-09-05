/* El tablero: la casa en vivo, siempre a la vista. Se lee de /vivo cada
 * treinta segundos y de /yo una vez. Lo que no se pudo leer sale como «—» o
 * «no responde»: ningún número se estima. */
const TABLERO = (() => {
  'use strict';
  const esc = MARKDOWN.esc;
  const $ = (id) => document.getElementById(id);
  const usd = (n, d = 2) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—');

  const CASAS = [
    ['ordenex', 'Ordenex', 'casa de cambio'], ['aucorp', 'AuCorp', 'cuentas en moneda local'],
    ['wallet', 'Veta Wallet', 'billetera'], ['genesis', 'Genesis ID', 'identidad'], ['ordenscan', 'OrdenScan', 'explorador'],
  ];
  const estadoCasa = (c) => (!c ? 'neutro' : c.vivo ? 'ok' : 'mal');
  const textoCasa = (c) => (!c ? 'sin lectura' : c.vivo ? 'en servicio' : c.http ? `HTTP ${c.http}` : 'no responde');

  let vivo = null, yo = null, gasto = null;

  function pintar() {
    const v = vivo;
    $('tabOrigen').innerHTML = `
      <div class="dato"><span>1 ORIGEN</span><b class="${v?.origen ? '' : 'aviso'}">${v?.origen ? usd(v.origen.origenUsd, 4) : 'sin precio'}</b></div>
      <div class="dato"><span>Onza de oro</span><b>${v?.origen?.oroOnzaUsd ? usd(v.origen.oroOnzaUsd) : '—'}</b></div>
      <div class="dato"><span>Fuente</span><b>${esc(v?.origen?.fuente || '—')}</b></div>
      <div class="dato"><span>Compra con USDT</span><b class="${v?.ordenex?.compraUsdt === 'abierta' ? 'ok' : 'aviso'}">${esc(v?.ordenex?.compraUsdt || '—')}</b></div>
      <div class="dato"><span>Leído</span><b>${hora(v?.leidoEn)}</b></div>`;
    $('tabCasas').innerHTML = CASAS.map(([k, n, q]) => `<div class="casa-fila ${estadoCasa(v?.[k])}"><i></i><b>${n}</b><span>${textoCasa(v?.[k])}</span></div>`).join('');
    $('tabCadenas').innerHTML = `
      <div class="dato"><span>Cadena 5550 · bloque</span><b>${num(v?.ordenex?.bloque5550)}</b></div>
      <div class="dato"><span>Cadena 8532 · bloque</span><b>${num(v?.ordenscan?.bloque8532)}</b></div>`;
    const junta = yo?.junta || [];
    $('tabJunta').innerHTML = junta.length
      ? junta.map((m) => `<div class="casa-fila ok"><i></i><b>${esc(m.nombre)}</b><span>${esc(m.rol || 'junta')}</span></div>`).join('')
      : '<div class="vacio">—</div>';
    $('tabSistema').innerHTML = `
      <div class="dato"><span>Cerebro</span><b class="${yo?.cerebro ? 'ok' : 'mal'}">${yo ? (yo.donde === 'nodo' ? 'nodo propio' : 'Claude') : '—'}</b></div>
      <div class="dato"><span>Modelo</span><b>${esc((yo?.modelo || '—').replace(/^nodo:/, ''))}</b></div>
      <div class="dato"><span>Memoria</span><b class="${yo?.memoria === 'mongo' ? 'ok' : 'aviso'}">${yo?.memoria === 'mongo' ? 'persistente' : 'provisional'}</b></div>
      <div class="dato"><span>Voz</span><b class="${yo?.voz ? 'ok' : 'aviso'}">${yo?.voz ? 'ElevenLabs' : 'navegador'}</b></div>
      <div class="dato"><span>Saber</span><b>${num(yo?.saber?.total)} secciones</b></div>
      <div class="dato"><span>Consultas hoy</span><b>${gasto ? num(gasto.hoy.turnos) : '—'}</b></div>`;
  }

  async function refrescar() {
    const [v, g] = await Promise.allSettled([DATOS.vivo(), DATOS.gasto()]);
    if (v.status === 'fulfilled') vivo = v.value;
    if (g.status === 'fulfilled') gasto = g.value;
    pintar();
    document.dispatchEvent(new CustomEvent('ultron:vivo', { detail: vivo }));
  }

  let reloj = null;
  function arrancar(quien) {
    yo = quien; pintar(); refrescar();
    clearInterval(reloj); reloj = setInterval(refrescar, 30_000);
  }
  function parar() { clearInterval(reloj); reloj = null; }

  return { arrancar, parar, refrescar, vivoActual: () => vivo, CASAS, estadoCasa, textoCasa, usd, num, hora };
})();
