/* El ecosistema: una tarjeta por casa, con lo que su servicio dice ahora. */
const ECOSISTEMA = (() => {
  'use strict';
  const esc = MARKDOWN.esc;
  const { usd, num, hora, estadoCasa, textoCasa } = TABLERO;

  const CASAS = [
    { k: 'ordenex', nombre: 'Ordenex', que: 'La casa de cambio: los mercados de la cadena 5550 contra ORIGEN, la compra con USDT y la salida.', url: 'https://ordenexchange.link/',
      filas: (v) => [['Bloque 5550', num(v?.ordenex?.bloque5550)], ['Compra con USDT', v?.ordenex?.compraUsdt || '—'], ['Mercados', num(v?.ordenex?.mercados?.length)]] },
    { k: 'aucorp', nombre: 'AuCorp', que: 'Cuentas en moneda local. Una FinTech; no es un banco.', url: 'https://main.d2e55u6ls6v9xt.amplifyapp.com/banca/',
      filas: (v) => [['Tasas', v?.aucorp?.tasas ? 'al día' : 'sin tasas'], ['Actualizadas', hora(v?.aucorp?.tasasCuando)], ['Monedas', num(v?.aucorp?.monedas?.length)]] },
    { k: 'wallet', nombre: 'Veta Wallet', que: 'La billetera del ecosistema, en el teléfono y en la web.', url: 'https://app.vetawallet.com/',
      filas: (v) => [['Servicio', textoCasa(v?.wallet)]] },
    { k: 'genesis', nombre: 'Genesis ID', que: 'La identidad única de cada persona en todas las casas.', url: 'https://genesis-id.onrender.com/',
      filas: (v) => [['Servicio', textoCasa(v?.genesis)]] },
    { k: 'ordenscan', nombre: 'OrdenScan', que: 'El explorador de la cadena 8532.', url: 'https://ordenscan.com/',
      filas: (v) => [['Bloque 8532', num(v?.ordenscan?.bloque8532)]] },
  ];

  function pintar(v) {
    document.getElementById('casas').innerHTML = [
      `<div class="tarjeta ${v?.origen ? 'ok' : 'aviso'}"><h3><i></i>ORIGEN</h3><p class="que">La moneda de la casa, referenciada al oro: onza ÷ 31,1035 ÷ 55. Una referencia no es una promesa de valor.</p>
        <div class="dato"><span>1 ORIGEN</span><b>${v?.origen ? usd(v.origen.origenUsd, 6) : '—'}</b></div>
        <div class="dato"><span>Onza de oro</span><b>${v?.origen?.oroOnzaUsd ? usd(v.origen.oroOnzaUsd) : '—'}</b></div>
        <div class="dato"><span>Fuente</span><b>${esc(v?.origen?.fuente || '—')}</b></div>
        <div class="dato"><span>Leído</span><b>${hora(v?.leidoEn)}</b></div>
        <div class="acciones"><button class="btn btn-chico" data-pregunta="Cotice 100 USDT en ORIGEN.">Cotizar</button></div></div>`,
      ...CASAS.map((c) => `<div class="tarjeta ${estadoCasa(v?.[c.k])}"><h3><i></i>${c.nombre}</h3><p class="que">${c.que}</p>
        <div class="dato"><span>Estado</span><b class="${estadoCasa(v?.[c.k])}">${textoCasa(v?.[c.k])}</b></div>
        ${c.filas(v).map(([k, x]) => `<div class="dato"><span>${k}</span><b>${esc(String(x))}</b></div>`).join('')}
        <div class="acciones"><a class="btn btn-chico" href="${c.url}" target="_blank" rel="noopener">Abrir ${c.nombre}</a><button class="btn btn-chico" data-pregunta="¿Cómo está ${c.nombre} en este momento?">Consultar a ULTRON</button></div></div>`),
    ].join('');
  }

  function enlazar() {
    document.addEventListener('ultron:vivo', (e) => pintar(e.detail));
    document.getElementById('casas').addEventListener('click', (e) => { const b = e.target.closest('[data-pregunta]'); if (b) { APP.vista('despacho'); DESPACHO.enviar(b.dataset.pregunta); } });
    pintar(TABLERO.vivoActual());
  }
  return { enlazar, pintar };
})();
