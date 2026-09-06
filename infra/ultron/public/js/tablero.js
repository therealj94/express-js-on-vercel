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
  /* ── EL COLOR DE LO QUE NO SE SABE ────────────────────────────────────────
   *
   * Las cinco casas se pintaban en ROJO en cuanto no contestaban, y sin red
   * eso son cinco filas rojas y un tablero que grita que el ecosistema está
   * caído cuando lo único que pasa es que este servidor no pudo salir a
   * mirar. Un rojo que aparece cuando no hay nada roto enseña a ignorar el
   * rojo, que es justo lo que no se quiere el día que algo se caiga de veras.
   *
   * Así que se distinguen las dos cosas, que son distintas:
   *
   *   · la casa CONTESTÓ MAL (http > 0 y no ok) → eso sí es un fallo suyo,
   *     y va en rojo con su código;
   *   · NO SE PUDO LLEGAR (http = 0) → no se sabe nada de ella. Neutro.
   *
   * Y si NINGUNA se pudo leer, el problema no es de las casas sino de quien
   * mira: se dice UNA vez arriba, en vez de repetirlo cinco veces en rojo. */
  const cegada = (c) => !!c && !c.vivo && !c.http;
  const estadoCasa = (c) => (!c || cegada(c) ? 'neutro' : c.vivo ? 'ok' : 'mal');
  const textoCasa = (c) => (!c ? 'sin lectura' : c.vivo ? 'en servicio'
    : c.http ? `HTTP ${c.http}` : 'no se pudo leer');

  let vivo = null, yo = null, gasto = null;

  function pintar() {
    const v = vivo;
    /* El vacío, DISEÑADO. Cinco renglones con un guion cada uno no dicen «no
       hay dato»: dicen que nadie decidió qué hacer sin dato, y ocupan un
       tercio de la columna para no decir nada. Cuando la referencia no se
       pudo leer se colapsa a una sola línea que explica por qué. */
    $('tabOrigen').innerHTML = v?.origen
      ? `<div class="dato"><span>1 ORIGEN</span><b>${usd(v.origen.origenUsd, 4)}</b></div>
      <div class="dato"><span>Onza de oro</span><b>${v.origen.oroOnzaUsd ? usd(v.origen.oroOnzaUsd) : '—'}</b></div>
      <div class="dato"><span>Fuente</span><b>${esc(v.origen.fuente || '—')}</b></div>
      <div class="dato"><span>Compra con USDT</span><b class="${v?.ordenex?.compraUsdt === 'abierta' ? 'ok' : 'aviso'}">${esc(v?.ordenex?.compraUsdt || '—')}</b></div>
      <div class="dato"><span>Leído</span><b>${hora(v.leidoEn)}</b></div>`
      : `<div class="hueco">La referencia del oro no se pudo leer${v?.leidoEn ? ` · último intento ${hora(v.leidoEn)}` : ''}. No se estima ningún número.</div>`;
    const ciegas = v ? CASAS.filter(([k]) => cegada(v[k])).length : 0;
    const todasCiegas = ciegas === CASAS.length;
    $('tabCasas').innerHTML =
      (todasCiegas ? '<div class="hueco">Ninguna casa se pudo leer desde este servidor. Es la red de la casa, no las casas.</div>' : '')
      + CASAS.map(([k, n]) => `<div class="casa-fila ${estadoCasa(v?.[k])}"><i></i><b>${n}</b><span>${textoCasa(v?.[k])}</span></div>`).join('');
    /* Los dos leen la 5550: Ordenex y el explorador. Se enseñan los dos porque
       si se separan, OrdenScan se quedó atrás. La 8532 es la cadena vieja,
       congelada, y aquí no se lee. */
    const b5550 = v?.ordenex?.bloque5550, bScan = v?.ordenscan?.bloqueScan;
    $('tabCadenas').innerHTML = (b5550 == null && bScan == null)
      ? '<div class="hueco">Las alturas no se pudieron leer.</div>'
      : `<div class="dato"><span>Cadena 5550 · bloque (Ordenex)</span><b>${num(b5550)}</b></div>
      <div class="dato"><span>Cadena 5550 · bloque (OrdenScan)</span><b>${num(bScan)}</b></div>`;
    const junta = yo?.junta || [];
    $('tabJunta').innerHTML = junta.length
      ? junta.map((m) => `<div class="casa-fila ok"><i></i><b>${esc(m.nombre)}</b><span>${esc(m.rol || 'junta')}</span></div>`).join('')
      : '<div class="vacio">—</div>';
    $('tabSistema').innerHTML = `
      <div class="dato"><span>Cerebro</span><b class="${yo?.cerebro ? 'ok' : 'aviso'}">${yo?.cerebro ? (yo.donde === 'nodo' ? 'nodo propio' : 'Claude') : 'sin configurar'}</b></div>
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
