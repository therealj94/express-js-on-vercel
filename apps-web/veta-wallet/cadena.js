/* La cadena, los tokens y los precios.
 *
 * Es la misma logica que `src/api.js` en la aplicacion del telefono, y tiene
 * que seguir siendolo: los saldos se leen de la red por RPC, no de un endpoint
 * que los resuma. Si el telefono y el navegador leyeran de sitios distintos,
 * tarde o temprano dirian numeros distintos del mismo dinero.
 *
 * La regla que manda aqui: **sin precio real no se inventa un precio**. Un
 * numero cocinado entra al patrimonio sin ninguna marca, y alguien puede
 * vender mirandolo. Cuando no hay precio se manda null y la pantalla pinta un
 * guion.
 */

const CADENA = (() => {
  'use strict';

  const RPC = 'https://rpc.ordenglobal-rpc.com/';
  const COINGECKO = 'https://api.coingecko.com/api/v3';
  const OZ_GRAMOS = 31.1035;

  // Los quince tokens reales de la red 8532. Los contratos estan confirmados
  // contra la cadena y todos usan 18 decimales: se fija el valor para no
  // gastar una llamada extra por token en cada carga.
  const TOKENS = [
    { s: 'ORIGEN', nativo: true },
    { s: 'AUKA', contrato: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B' },
    { s: 'AGKA', contrato: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B' },
    { s: 'ONDK', contrato: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1' },
    { s: 'MNKA', contrato: '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead' },
    { s: 'IBS', contrato: '0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62' },
    { s: 'HARV', contrato: '0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923' },
    { s: 'AUBEX', contrato: '0xF1498640B27A66C0DC505093D70911C060e04fb0' },
    { s: 'ASL', contrato: '0x69846aC960D45F9946C613DFCe1b761D37Faf098' },
    { s: 'LOVE', contrato: '0x638F2ba0e3E1083D1ba570b449BD266F3860D164' },
    { s: 'REST', contrato: '0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD' },
    { s: 'SOL', contrato: '0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66' },
    { s: 'AIT', contrato: '0xAE14Db486872AC07d74Ad69cC09590239b21BA2e' },
    { s: 'AGRO', contrato: '0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe' },
    { s: 'POLITICAL', contrato: '0x92496E1848e001428A3495409a9A9f616bB6dD3B' },
  ];

  // Los cuatro principales traen logo propio; el resto se pinta con su glifo
  // sobre un degradado, igual que en el telefono.
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

  /* La ficha de cada token: que es, con que esta respaldado y en que red vive.
   *
   * Vive aqui y no en i18n.js a proposito. Es lo unico que se escribe sobre un
   * activo que la gente compra, y tiene que moverse pegado a su contrato: si
   * un dia se corrige una direccion, la descripcion esta a tres lineas y no en
   * otro archivo donde nadie se acuerda de mirar.
   *
   * Las descripciones de los tokens de sector son deliberadamente escuetas. A
   * diferencia de AUKA y AGKA, no tienen un commodity detras que se pueda
   * verificar: decir mas seria prometer mas.
   */
  const FICHAS = {
    ORIGEN: {
      es: { d: 'Cripto nativa de la cadena de Orden Global, con la que se pagan y se liquidan las transferencias del ecosistema. Su valor se ancla a un gramin: 1/55 de un gramo de oro.', t: 'Cripto nativa · pagos', r: '1 gramin = 1/55 g de oro' },
      en: { d: 'The native coin of the Orden Global chain, used to pay and settle transfers across the ecosystem. Its value is anchored to a gramin: 1/55 of a gram of gold.', t: 'Native coin · payments', r: '1 gramin = 1/55 g of gold' },
    },
    AUKA: {
      es: { d: 'Token respaldado en oro: sigue el precio de una onza. Da exposición al oro sin tener que custodiarlo.', t: 'Token de commodity', r: 'Oro · 1 onza' },
      en: { d: 'A gold-backed token: it tracks the price of one ounce. Exposure to gold without having to hold it.', t: 'Commodity token', r: 'Gold · 1 ounce' },
    },
    AGKA: {
      es: { d: 'Token respaldado en plata: sigue el precio de una onza. Una forma descentralizada de entrar al mercado de la plata.', t: 'Token de commodity', r: 'Plata · 1 onza' },
      en: { d: 'A silver-backed token: it tracks the price of one ounce. A decentralised way into the silver market.', t: 'Commodity token', r: 'Silver · 1 ounce' },
    },
    ONDK: {
      es: { d: 'Orden Global representada en token. Activo de gobernanza y utilidad: refleja el valor y la participación dentro del ecosistema.', t: 'Token de Orden Global', r: 'Ecosistema · gobernanza y utilidad' },
      en: { d: 'Orden Global represented as a token. A governance and utility asset: it reflects value and participation inside the ecosystem.', t: 'Orden Global token', r: 'Ecosystem · governance and utility' },
    },
    MNKA: {
      es: { d: 'Activo digital del ecosistema Orden Global, pensado para empujar el crecimiento y la innovación que salen de la comunidad.', t: 'Activo digital', r: 'Ecosistema · comunidad e innovación' },
      en: { d: 'A digital asset of the Orden Global ecosystem, meant to drive community-led growth and innovation.', t: 'Digital asset', r: 'Ecosystem · community and innovation' },
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

  // Precios de referencia de los tokens de sector, que no cotizan en ningun
  // mercado publico. No tienen variacion 24 h que reportar: se manda null en
  // vez de un 0 %, que se leeria como "hoy no se movio" cuando en realidad
  // nunca se mueve.
  const FIJOS = {
    AGRO: 13.13, AIT: 5.32, SOL: 0.75, REST: 8.57, LOVE: 0.1,
    POLITICAL: 0.33, ASL: 2.328, AUBEX: 10, HARV: 0.75, IBS: 1.2,
  };

  // ── RPC ───────────────────────────────────────────────────────────────────

  async function rpc(metodo, params, ms = 12000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(RPC, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }),
      });
      const d = await r.json().catch(() => ({}));
      return d?.result ?? null;
    } finally { clearTimeout(id); }
  }

  // Un saldo de 18 decimales no cabe en un double sin perder los ultimos
  // digitos, asi que se parte en entero y resto antes de convertir.
  function deUnidades(hex, dec = 18) {
    try {
      if (!hex || hex === '0x') return 0;
      const crudo = BigInt(hex);
      const div = BigInt(10) ** BigInt(dec);
      return Number(crudo / div) + Number(crudo % div) / Number(div);
    } catch { return 0; }
  }

  const saldoNativo = async dir =>
    deUnidades(await rpc('eth_getBalance', [dir, 'latest']));

  const saldoToken = async (contrato, dir) =>
    deUnidades(await rpc('eth_call', [
      { to: contrato, data: '0x70a08231' + dir.replace(/^0x/, '').toLowerCase().padStart(64, '0') },
      'latest',
    ]));

  // ── precios ───────────────────────────────────────────────────────────────

  async function metales() {
    try {
      const r = await fetch(`${COINGECKO}/simple/price?ids=pax-gold,kinesis-silver&vs_currencies=usd&include_24hr_change=true`);
      const d = await r.json();
      const oro = Number(d?.['pax-gold']?.usd);
      const plata = Number(d?.['kinesis-silver']?.usd);
      if (oro > 0) return {
        oro, plata: plata > 0 ? plata : null,
        oroChg: Number(d?.['pax-gold']?.usd_24h_change) || null,
        plataChg: Number(d?.['kinesis-silver']?.usd_24h_change) || null,
      };
    } catch {}
    // Respaldo sin clave. Solo trae el precio, no la variacion.
    const uno = async sim => {
      try {
        const r = await fetch(`https://api.gold-api.com/price/${sim}`);
        const p = Number((await r.json().catch(() => ({})))?.price);
        return p > 0 ? p : null;
      } catch { return null; }
    };
    const [oro, plata] = await Promise.all([uno('XAU'), uno('XAG')]);
    return { oro, plata, oroChg: null, plataChg: null };
  }

  // AUKA sigue la onza de oro, AGKA la de plata, y ORIGEN es un gramin:
  // 1/55 de un gramo de oro. De ahi salen los tres del mismo dato.
  async function precios() {
    const { oro, plata, oroChg, plataChg } = await metales();
    const p = {}, chg = {};
    if (oro) {
      p.AUKA = oro;
      p.ORIGEN = oro / OZ_GRAMOS / 55;
      if (oroChg != null) { chg.AUKA = oroChg; chg.ORIGEN = oroChg; }
    }
    if (plata) {
      p.AGKA = plata;
      if (plataChg != null) chg.AGKA = plataChg;
    }
    return { p, chg };
  }

  // ── el portafolio entero ──────────────────────────────────────────────────

  /* Devuelve los quince tokens SIEMPRE, incluso los que estan en cero: una
   * billetera que esconde lo que tenes en cero parece tener menos monedas de
   * las que tiene, y la lista cambiaria de forma sola al recibir un pago.
   *
   * `precioOndk` viene del backend (endpoint del chain); si no llego, ONDK se
   * queda sin precio y se pinta con un guion. */
  async function portafolio(direccion, precioOndk) {
    if (!direccion) return [];
    const [{ p, chg }, saldos] = await Promise.all([
      precios().catch(() => ({ p: {}, chg: {} })),
      Promise.all(TOKENS.map(async t => {
        try {
          return t.nativo ? await saldoNativo(direccion) : await saldoToken(t.contrato, direccion);
        } catch { return 0; }
      })),
    ]);

    return TOKENS.map((t, i) => {
      let precio = p[t.s];
      if (precio == null && t.s === 'ONDK' && precioOndk > 0) precio = precioOndk;
      if (precio == null && FIJOS[t.s] != null) precio = FIJOS[t.s];
      const cant = Number.isFinite(saldos[i]) ? saldos[i] : 0;
      return {
        s: t.s,
        ...META[t.s],
        contrato: t.contrato || null,
        nativo: !!t.nativo,
        cant,
        precio: precio != null && precio > 0 ? precio : null,
        chg: FIJOS[t.s] != null ? null : (chg[t.s] ?? null),
      };
    });
  }

  const ficha = (sim, idioma) => (FICHAS[sim] || {})[idioma] || (FICHAS[sim] || {}).es || null;

  return { TOKENS, META, FICHAS, ficha, portafolio, precios, rpc, RPC };
})();
