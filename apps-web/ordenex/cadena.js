/* Los activos de la casa de cambio: la tabla espejo de la cadena 5550.
 *
 * Es la MISMA tabla que enseña la billetera en apps-web/veta-wallet/cadena.js
 * y que lee el backend en infra/veta-wallet-backend/lib/saldos.js
 * (TOKENS_5550). Las tres copias tienen que decir lo mismo: si un token se
 * añade allá y no acá, Ordenex le abriría mercado a un activo que no puede
 * acreditar — o al revés, escondería uno que sí existe. Cuando se toque una,
 * se tocan las tres.
 *
 * Aquí no hay precios ni RPC a propósito: en una casa de cambio el precio lo
 * dicen los tratos, y los tratos los sirve el API. La referencia (oro, plata)
 * también llega del API, ya rotulada. Este archivo solo sabe QUÉ se cambia.
 */

const CADENA = (() => {
  'use strict';

  // Los quince activos reales de la red 5550. Los contratos están confirmados
  // contra la cadena y todos usan 18 decimales: se fija el valor para no
  // gastar una llamada extra por token en cada carga.
  /* QUE SE PUBLICA, Y QUE NO
   *
   * La tabla sigue teniendo los quince activos de la red 5550 y eso es a
   * proposito: quitarlos de aqui dejaria de leer sus saldos, y a quien tuviera
   * MNKA en la billetera le desapareceria su dinero de la pantalla. Un activo
   * que no se publica no es un activo que no existe.
   *
   * `publico: false` significa: no se lista en el catalogo, no se ofrece para
   * comprar ni para cambiar, y Ordenex no le abre mercado. Si alguien tiene
   * saldo, lo sigue viendo —marcado «no listado»— y lo puede mover.
   *
   * Publicados hoy, por decision de la Junta: ORIGEN, AUKA, AGKA, ONDK, HARV
   * (Harvi) e IBS (IBS Energy). Republicar uno es cambiar `false` por `true`
   * en las TRES copias de esta tabla, no en una.
   */
  const TOKENS = [
    { s: 'ORIGEN', nativo: true, publico: true },
    { s: 'AUKA', contrato: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B', publico: true },
    { s: 'AGKA', contrato: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B', publico: true },
    { s: 'ONDK', contrato: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1', publico: true },
    { s: 'MNKA', contrato: '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead', publico: false },
    { s: 'IBS', contrato: '0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62', publico: true },
    { s: 'HARV', contrato: '0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923', publico: true },
    { s: 'AUBEX', contrato: '0xF1498640B27A66C0DC505093D70911C060e04fb0', publico: false },
    { s: 'ASL', contrato: '0x69846aC960D45F9946C613DFCe1b761D37Faf098', publico: false },
    { s: 'LOVE', contrato: '0x638F2ba0e3E1083D1ba570b449BD266F3860D164', publico: false },
    { s: 'REST', contrato: '0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD', publico: false },
    { s: 'SOL', contrato: '0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66', publico: false },
    { s: 'AIT', contrato: '0xAE14Db486872AC07d74Ad69cC09590239b21BA2e', publico: false },
    { s: 'AGRO', contrato: '0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe', publico: false },
    { s: 'POLITICAL', contrato: '0x92496E1848e001428A3495409a9A9f616bB6dD3B', publico: false },
  ];

  // Los mercados de la v1: cada token contra ORIGEN, en el orden de la tabla.
  // Se derivan aquí y no se escriben a mano para que un token nuevo traiga su
  // mercado solo, sin una segunda lista que se pueda quedar corta.
  /* Los pares SOLO de lo publicado. Un mercado abierto a un activo que la
     billetera no lista es justo la incoherencia que el comentario de arriba
     manda evitar: Ordenex le abriria mesa a algo que del otro lado no existe. */
  const PARES = TOKENS.filter(t => !t.nativo && t.publico !== false).map(t => `${t.s}-ORIGEN`);
  const PUBLICOS = TOKENS.filter(t => t.publico !== false).map(t => t.s);
  const esPublico = (sim) => PUBLICOS.includes(sim);

  // Los cuatro principales traen logo propio; el resto se pinta con su glifo
  // sobre un degradado, igual que en la billetera y en el teléfono.
  const META = {
    ORIGEN: { n: 'ORIGEN', img: 'assets/tokens/origen.jpg' },
    AUKA: { n: 'AUKA', img: 'assets/tokens/auka.jpg' },
    AGKA: { n: 'AGKA', img: 'assets/tokens/agka.jpg' },
    ONDK: { n: 'ONDK', img: 'assets/tokens/ondk.jpg' },
    MNKA: { n: 'MNKA', glifo: '♛', grad: ['#F8EFCF', '#96793F'], fg: '#3A2C08' },
    IBS: { n: 'IBS Energy', glifo: '⚡', grad: ['#FFE9B0', '#8A5E0E'], fg: '#3A2400' },
    HARV: { n: 'Harvi', glifo: '🌾', grad: ['#E9F2C8', '#5A7A2C'], fg: '#1D2A0C' },
    AUBEX: { n: 'AUBEX', glifo: 'AB', grad: ['#E4D9F7', '#4B3684'], fg: '#1C1030' },
    ASL: { n: 'Athletic', glifo: '🏃', grad: ['#D9F0E6', '#227455'], fg: '#062A1D' },
    LOVE: { n: 'Amor Global', glifo: '♥', grad: ['#FBD8E3', '#93254F'], fg: '#390318' },
    REST: { n: 'Real State', glifo: '🏠', grad: ['#DCE6F5', '#354E76'], fg: '#0E1A2C' },
    SOL: { n: 'Solar', glifo: '☀', grad: ['#FFEBB0', '#A5610E'], fg: '#3A1E00' },
    AIT: { n: 'AI', glifo: 'AI', grad: ['#D3E8FB', '#274F82'], fg: '#0A2038' },
    AGRO: { n: 'Agrotech', glifo: '🌱', grad: ['#E2F1D6', '#43682D'], fg: '#152508' },
    POLITICAL: { n: 'Political', glifo: 'PO', grad: ['#E9E0D6', '#6B5236'], fg: '#241A0C' },
  };

  /* La ficha corta de cada activo: qué es y a qué está referenciado. Vive
   * pegada a su contrato por el mismo motivo que en la billetera: si un día se
   * corrige una dirección, la descripción está a tres líneas y no en otro
   * archivo donde nadie se acuerda de mirar.
   *
   * Son más cortas que las de la billetera a propósito: en un mercado la ficha
   * acompaña a un libro de órdenes, no lo reemplaza. Y el reparto de términos
   * no se improvisa (expediente de la Secretaría de la Junta, 14/08/2026):
   * ORIGEN, AUKA y AGKA son REFERENCIADOS —siguen un precio—; el único
   * RESPALDADO es ONDK, que es un valor negociable bajo Próspera. Escribir
   * «respaldado» en cualquier otra ficha es la clase de palabra que se
   * comprueba en cinco minutos y no aguanta.
   */
  const FICHAS = {
    ORIGEN: {
      es: { d: 'La cripto nativa de la cadena de Orden Global y la moneda de cotización de esta casa: todos los mercados se pagan en ORIGEN.', t: 'Cripto nativa · cotización', r: 'Referenciado · 1 gramin = 1/55 g de oro' },
      en: { d: 'The native coin of the Orden Global chain and this house’s quote currency: every market settles in ORIGEN.', t: 'Native coin · quote', r: 'Referenced · 1 gramin = 1/55 g of gold' },
    },
    AUKA: {
      es: { d: 'Sigue el precio de una onza de oro. La referencia se enseña rotulada, aparte del último trato.', t: 'Token de commodity', r: 'Referenciado · oro, 1 onza' },
      en: { d: 'Tracks the price of one ounce of gold. The reference is shown labelled, apart from the last trade.', t: 'Commodity token', r: 'Referenced · gold, 1 ounce' },
    },
    AGKA: {
      es: { d: 'Sigue el precio de una onza de plata. La referencia se enseña rotulada, aparte del último trato.', t: 'Token de commodity', r: 'Referenciado · plata, 1 onza' },
      en: { d: 'Tracks the price of one ounce of silver. The reference is shown labelled, apart from the last trade.', t: 'Commodity token', r: 'Referenced · silver, 1 ounce' },
    },
    ONDK: {
      es: { d: 'El security token de Orden Global: un valor negociable bajo Próspera, respaldado por los activos del grupo. Da derechos económicos por contrato; no es una acción y no da voto.', t: 'Security token', r: 'Respaldado · valor negociable' },
      en: { d: 'The Orden Global security token: a security under Próspera, backed by the group’s assets. It grants contractual economic rights; it is not a share and carries no vote.', t: 'Security token', r: 'Backed · security' },
    },
    MNKA: {
      es: { d: 'Activo digital del ecosistema, pensado para la comunidad y su crecimiento.', t: 'Activo digital', r: 'Ecosistema · comunidad' },
      en: { d: 'A digital asset of the ecosystem, meant for the community and its growth.', t: 'Digital asset', r: 'Ecosystem · community' },
    },
    IBS: {
      es: { d: 'Token del sector energético dentro del ecosistema Orden Global.', t: 'Token de sector', r: 'Energía' },
      en: { d: 'A token of the energy sector within the Orden Global ecosystem.', t: 'Sector token', r: 'Energy' },
    },
    HARV: {
      es: { d: 'Activo digital del ecosistema Orden Global.', t: 'Activo digital', r: 'Ecosistema Orden Global' },
      en: { d: 'A digital asset of the Orden Global ecosystem.', t: 'Digital asset', r: 'Orden Global ecosystem' },
    },
    AUBEX: {
      es: { d: 'Activo digital del ecosistema Orden Global.', t: 'Activo digital', r: 'Ecosistema Orden Global' },
      en: { d: 'A digital asset of the Orden Global ecosystem.', t: 'Digital asset', r: 'Orden Global ecosystem' },
    },
    ASL: {
      es: { d: 'Token del sector deportivo dentro del ecosistema Orden Global.', t: 'Token de sector', r: 'Deporte' },
      en: { d: 'A token of the sports sector within the Orden Global ecosystem.', t: 'Sector token', r: 'Sport' },
    },
    LOVE: {
      es: { d: 'Activo digital del ecosistema Orden Global.', t: 'Activo digital', r: 'Ecosistema Orden Global' },
      en: { d: 'A digital asset of the Orden Global ecosystem.', t: 'Digital asset', r: 'Orden Global ecosystem' },
    },
    REST: {
      es: { d: 'Token del sector inmobiliario dentro del ecosistema Orden Global.', t: 'Token de sector', r: 'Bienes raíces' },
      en: { d: 'A token of the real estate sector within the Orden Global ecosystem.', t: 'Sector token', r: 'Real estate' },
    },
    SOL: {
      es: { d: 'Token del sector de energía solar dentro del ecosistema Orden Global.', t: 'Token de sector', r: 'Energía solar' },
      en: { d: 'A token of the solar energy sector within the Orden Global ecosystem.', t: 'Sector token', r: 'Solar energy' },
    },
    AIT: {
      es: { d: 'Token del sector de inteligencia artificial dentro del ecosistema Orden Global.', t: 'Token de sector', r: 'Inteligencia artificial' },
      en: { d: 'A token of the artificial intelligence sector within the Orden Global ecosystem.', t: 'Sector token', r: 'Artificial intelligence' },
    },
    AGRO: {
      es: { d: 'Token del sector agrícola dentro del ecosistema Orden Global.', t: 'Token de sector', r: 'Agricultura' },
      en: { d: 'A token of the farming sector within the Orden Global ecosystem.', t: 'Sector token', r: 'Farming' },
    },
    POLITICAL: {
      es: { d: 'Activo digital del ecosistema Orden Global.', t: 'Activo digital', r: 'Ecosistema Orden Global' },
      en: { d: 'A digital asset of the Orden Global ecosystem.', t: 'Digital asset', r: 'Orden Global ecosystem' },
    },
  };

  const meta = sim => META[sim] || { n: String(sim || '') };
  const ficha = (sim, idioma) => (FICHAS[sim] || {})[idioma] || (FICHAS[sim] || {}).es || null;
  // De un mercado 'AUKA-ORIGEN' sale su token base; de cualquier otra cosa, null.
  const baseDe = par => {
    const s = String(par || '').split('-')[0];
    // Despublicado = no hay mercado, ni aunque alguien traiga el enlace viejo.
    return TOKENS.some(t => t.s === s && !t.nativo && t.publico !== false) ? s : null;
  };

  /* ── LO QUE LA PERSONA TIENE EN SU VETA WALLET ─────────────────────────────
   * Se lee de la cadena por RPC, exactamente igual que en la billetera. Esto
   * NO es un saldo de Ordenex y no se mezcla con el portafolio: la casa de
   * cambio solo guarda lo que le depositan.
   *
   * Existe porque la confusion es garantizada y cara: alguien entra con su
   * cuenta, ve el portafolio vacio y concluye que Ordenex «no cargo» sus
   * activos. No los perdio — estan en su wallet, a un deposito de distancia.
   *
   * Falla en null y NUNCA en cero: un cero de consuelo es peor que un guion,
   * porque parece un saldo leido y no un dato que no llego.
   */
  const RPC = String(
    (typeof window !== 'undefined' && window.ONX_RPC) || 'https://rpc.ordenglobal-rpc.com/'
  );

  async function rpc(metodo, params) {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || 'rpc');
    return d.result;
  }

  // El hex de la cadena a wei en string. Los 18 decimales son fijos en los
  // quince activos, comprobado contra la red.
  const aWei = hex => {
    try { return BigInt(hex || '0x0').toString(); } catch { return null; }
  };

  async function saldosEnWallet(direccion) {
    if (!direccion) return null;
    const dir = String(direccion).toLowerCase();
    const relleno = dir.replace(/^0x/, '').padStart(64, '0');
    const filas = await Promise.all(TOKENS.map(async (t) => {
      try {
        const hex = t.nativo
          ? await rpc('eth_getBalance', [dir, 'latest'])
          : await rpc('eth_call', [{ to: t.contrato, data: '0x70a08231' + relleno }, 'latest']);
        return { s: t.s, wei: aWei(hex) };
      } catch { return { s: t.s, wei: null }; }
    }));
    // Solo lo que tiene algo: quince filas en cero al lado del portafolio de
    // la casa es ruido, y lo que se quiere contar es «esto lo tenes alla».
    return filas.filter(f => f.wei != null && f.wei !== '0');
  }

  return { TOKENS, PARES, PUBLICOS, esPublico, META, FICHAS, meta, ficha, baseDe, saldosEnWallet, RPC };
})();
