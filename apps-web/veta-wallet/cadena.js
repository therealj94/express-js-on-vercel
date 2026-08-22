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

  /* El API de Ordenex, que es donde vive el libro de precios declarados por la
     Junta. Se pide desde aqui y no por el backend de la wallet a proposito: el
     dato tiene UNA sola fuente y las dos casas leen la misma, que es lo unico
     que garantiza que la sala de Ordenex y la billetera digan el mismo numero
     el mismo dia. Se puede pisar con window.ONX_API para pruebas. */
  const ORDENEX_API = String(
    (typeof window !== 'undefined' && window.ONX_API) || 'https://ordenex-api-ba4b27b8b51a.herokuapp.com'
  ).replace(/\/+$/, '');

  // Los quince tokens reales de la red 5550. Los contratos estan confirmados
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

  /* La ficha de cada token: que es, a que esta referenciado y en que red vive.
   *
   * Vive aqui y no en i18n.js a proposito. Es lo unico que se escribe sobre un
   * activo que la gente compra, y tiene que moverse pegado a su contrato: si
   * un dia se corrige una direccion, la descripcion esta a tres lineas y no en
   * otro archivo donde nadie se acuerda de mirar.
   *
   * Las descripciones de los tokens de sector son deliberadamente escuetas. A
   * diferencia de AUKA y AGKA, no tienen un commodity detras que se pueda
   * verificar: decir mas seria prometer mas.
   *
   * Y el reparto de terminos, que aqui no se improvisa (expediente de la
   * Secretaria de la Junta, 14/08/2026): ORIGEN, AUKA y AGKA son REFERENCIADOS
   * -siguen un precio-; el unico RESPALDADO es ONDK, que es un valor negociable
   * bajo Prospera. Escribir "respaldado" en cualquier otra ficha es la clase de
   * palabra que se comprueba en cinco minutos y no aguanta.
   */
  const FICHAS = {
    ORIGEN: {
      es: { d: 'Cripto nativa de la cadena de Orden Global, con la que se pagan y se liquidan las transferencias del ecosistema. Su valor está referenciado al oro: un gramin, 1/55 de un gramo, al precio del oro del día.', t: 'Cripto nativa · pagos', r: 'Referenciado · 1 gramin = 1/55 g de oro' },
      en: { d: 'The native coin of the Orden Global chain, used to pay and settle transfers across the ecosystem. Its value is referenced to gold: one gramin, 1/55 of a gram, at the day’s gold price.', t: 'Native coin · payments', r: 'Referenced · 1 gramin = 1/55 g of gold' },
    },
    AUKA: {
      es: { d: 'Sigue el precio de una onza de oro: exposición al oro sin custodiarlo vos. La figura de respaldo del metal está en manos de la Junta y no está firmada.', t: 'Token de commodity', r: 'Oro · 1 onza (precio)' },
      en: { d: 'Tracks the price of one ounce of gold: exposure to gold without holding it yourself. The legal figure of the metal’s backing sits with the Board and is not signed.', t: 'Commodity token', r: 'Gold · 1 ounce (price)' },
    },
    AGKA: {
      es: { d: 'Sigue el precio de una onza de plata: una forma de entrar al mercado de la plata desde la billetera. La figura de respaldo del metal no está cerrada.', t: 'Token de commodity', r: 'Plata · 1 onza (precio)' },
      en: { d: 'Tracks the price of one ounce of silver: a way into the silver market from the wallet. The legal figure of the metal’s backing is not settled.', t: 'Commodity token', r: 'Silver · 1 ounce (price)' },
    },
    ONDK: {
      es: { d: 'Orden Global hecha token. Instrumento patrimonial digital —valor negociable bajo Próspera— respaldado por los activos del grupo: minería, infraestructura y participación en las compañías. Da derechos económicos por contrato; no es una acción y no da voto.', t: 'Security token de Orden Global', r: 'Ecosistema · valor negociable' },
      en: { d: 'Orden Global turned into a token. A digital equity instrument — a security under Próspera — backed by the group’s assets: mining, infrastructure and stakes in the companies. It grants contractual economic rights; it is not a share and carries no vote.', t: 'Orden Global security token', r: 'Ecosystem · security' },
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

  /* NO SE DEVUELVE null CUANDO ALGO SALE MAL: SE LANZA.
   *
   * Antes esta funcion se tragaba tres fallos distintos y los tres salian por
   * el mismo agujero. Un 502 del nodo con una pagina de HTML adentro moria en
   * el `.catch(() => ({}))` del json; un `{"error":{...}}` del propio RPC no se
   * miraba nunca; y `r.ok` no se comprobaba. En los tres casos la respuesta era
   * `null`, `deUnidades(null)` lo convertia en 0, y la billetera enseñaba un
   * cero que nadie habia leido de la cadena.
   *
   * Un cero es una afirmacion sobre el dinero de alguien: dice «no tenes
   * nada». Solo se puede decir cuando el nodo lo dijo. Si no contesto, o
   * contesto cualquier otra cosa, esto lanza y quien llama decide como se
   * rotula el hueco. Ver `portafolio()` aca abajo.
   *
   * El unico `result` que vale como cero es el que llega: un `0x0` es un cero
   * leido, y ese si se enseña. */
  async function rpc(metodo, params, ms = 12000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(RPC, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }),
      });
      if (!r.ok) throw new Error(`el nodo contesto ${r.status}`);
      let d;
      try { d = await r.json(); }
      catch { throw new Error('el nodo no contesto JSON'); }
      if (d && d.error) throw new Error(String(d.error.message || 'el nodo devolvio un error'));
      if (!d || d.result === undefined || d.result === null) {
        throw new Error(`el nodo no devolvio resultado para ${metodo}`);
      }
      return d.result;
    } finally { clearTimeout(id); }
  }

  // Un saldo de 18 decimales no cabe en un double sin perder los ultimos
  // digitos, asi que se parte en entero y resto antes de convertir.
  //
  /* Y por el mismo motivo que `rpc()`, un hexadecimal que no se entiende ya no
     vale 0: lanza. Un `catch { return 0 }` aca abajo deshace todo el cuidado
     de arriba — daria igual lo escrupuloso que sea el RPC si la conversion
     sigue teniendo su cero de consuelo guardado.
     `0x` a secas SI es cero: es lo que contesta la cadena para una cuenta que
     nunca recibio nada. */
  function deUnidades(hex, dec = 18) {
    if (hex === '0x') return 0;
    if (typeof hex !== 'string' || !hex) throw new Error('el nodo devolvio un saldo ilegible');
    const crudo = BigInt(hex); // lanza si no es un hexadecimal, y eso es lo que se quiere
    const div = BigInt(10) ** BigInt(dec);
    return Number(crudo / div) + Number(crudo % div) / Number(div);
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

  /* ── la historia de los precios ────────────────────────────────────────────
   * La misma referencia que el precio vivo, extendida en el tiempo. AUKA sigue
   * la onza de oro y ORIGEN es 1/55 de un gramo de ese mismo oro; AGKA, la
   * onza de plata. La serie sale del MISMO mercado del que sale el precio de
   * arriba (PAXG / kinesis-silver en CoinGecko), pasada por la MISMA formula.
   * No es «el precio al que se opero aqui» —eso no existe todavia— y por eso
   * la pantalla lo rotula como referencia, no como cotizacion propia.
   *
   * ONDK y los demas declarados NO tienen historia: su precio es un acta de la
   * Junta, y dibujarles una curva seria inventarla. Devuelven null y la ficha
   * no enseña grafica.
   *
   * La cache va en sessionStorage diez minutos: CoinGecko corta a quien
   * pregunta en bucle, y la curva de 90 dias no cambia en diez minutos.
   */
  const HISTORIABLES = { ORIGEN: 'pax-gold', AUKA: 'pax-gold', AGKA: 'kinesis-silver' };

  async function historia(sim, dias) {
    const id = HISTORIABLES[sim];
    if (!id) return null;
    const clave = `veta.hist.${id}.${dias}`;
    const formula = sim === 'ORIGEN' ? (p => p / OZ_GRAMOS / 55) : (p => p);
    try {
      const c = JSON.parse(sessionStorage.getItem(clave) || 'null');
      if (c && Date.now() - c.en < 10 * 60e3 && Array.isArray(c.d)) {
        return c.d.map(([t, p]) => [t, formula(p)]);
      }
    } catch {}
    try {
      const r = await fetch(`${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${dias}`);
      if (!r.ok) return null;
      const d = (await r.json())?.prices;
      if (!Array.isArray(d) || d.length < 2) return null;
      const limpia = d.filter(f => Array.isArray(f) && Number(f[1]) > 0)
        .map(([t, p]) => [Number(t), Number(p)]);
      if (limpia.length < 2) return null;
      try { sessionStorage.setItem(clave, JSON.stringify({ en: Date.now(), d: limpia })); } catch {}
      return limpia.map(([t, p]) => [t, formula(p)]);
    } catch { return null; }
  }

  const historiable = (sim) => Boolean(HISTORIABLES[sim]);

  /* ── el precio declarado por la Junta ──────────────────────────────────────
   * ONDK no cotiza: no tiene mercado, no tiene libro y no hay feed que lo
   * mida. Lo unico que existe es lo que la Junta Directiva le fija por
   * resolucion, y eso es un hecho comprobable —tal dia, tal acta, tal firma—
   * siempre que llegue con esas cuatro cosas puestas.
   *
   * Por eso esto NO devuelve un numero suelto: devuelve el numero CON su acta.
   * Un precio declarado sin su acta al lado es indistinguible de un precio
   * inventado, y la pantalla necesita el acta para poder rotularlo. Si falta
   * cualquiera de las piezas, null — y ONDK se queda con su guion, que es lo
   * que ha estado enseñando hasta hoy y no le miente a nadie.
   */
  async function precioDeclarado(simbolo = 'ONDK') {
    try {
      const r = await fetch(`${ORDENEX_API}/precio-declarado/${encodeURIComponent(simbolo)}`);
      if (!r.ok) return null;
      const d = await r.json();
      const v = d && d.vigente;
      if (!v) return null;
      const precio = Number(v.precio);
      if (!(precio > 0)) return null;
      if (!v.acta || !String(v.acta).trim()) return null;
      if (!v.fecha || Number.isNaN(Date.parse(v.fecha))) return null;
      return {
        precio,
        moneda: d.moneda || 'USD',
        acta: String(v.acta),
        fecha: v.fecha,
        firmante: v.firmante || null,
      };
    } catch { return null; }
  }

  // ── el portafolio entero ──────────────────────────────────────────────────

  /* Devuelve los quince tokens SIEMPRE, incluso los que estan en cero: una
   * billetera que esconde lo que tenes en cero parece tener menos monedas de
   * las que tiene, y la lista cambiaria de forma sola al recibir un pago.
   *
   * `precioOndk` viene del backend (endpoint del chain); si no llego, ONDK se
   * queda sin precio y se pinta con un guion.
   *
   * Y por encima de ese respaldo manda el PRECIO DECLARADO por la Junta: es el
   * unico numero de ONDK del que se puede decir de donde sale. Llega con su
   * acta y viaja pegado al token en `declarado`, para que la pantalla no pueda
   * pintarlo sin rotularlo — un precio declarado sin decir que lo es se lee
   * como cotizacion, y ONDK no cotiza. */
  /* UN SALDO QUE NO SE PUDO LEER VALE null, NUNCA 0.
   *
   * Aca vivia el peor cero de la casa: `catch { return 0 }`. Con el nodo caido
   * los quince saldos salian en cero, se sumaban en cero, y la pantalla decia
   * TU PATRIMONIO $0.00 sin un solo aviso. Un nodo caido y una billetera vacia
   * daban la misma imagen, y lo unico que las separa es el dinero de alguien.
   *
   * La doctrina ya estaba escrita en esta casa y es la que se aplica aca:
   * `infra/veta-wallet-backend/lib/saldos.js` («ni un cero de consuelo: se dice
   * que no se pudo mirar», con `vacia: null` y jamas `true`) y
   * `apps-web/ordenex/mercado.js` («null = no leidos (fail-closed)»).
   *
   * LA FORMA QUE SALE DE AQUI
   *
   * Sigue siendo un array de filas —una por token, los quince siempre— y cada
   * fila trae ahora tres campos que se leen juntos:
   *
   *   cant   number | null   el saldo, o null si NO se pudo leer
   *   leido  boolean         true solo si el nodo contesto ese saldo
   *   error  string | null   por que no se pudo, cuando `leido` es false
   *
   * De ahi se deduce todo sin preguntar en ningun otro sitio: si la lectura
   * fue entera (todas con `leido`), parcial (algunas) o si no hubo lectura
   * ninguna (ninguna con `leido`, que es el nodo caido: el caso que pide el
   * «—» y el «no pudimos leer tus saldos» en vez de un total).
   *
   * Va fila por fila y no como un veredicto unico del conjunto a proposito:
   * los quince saldos se piden en paralelo y pueden fallar tres. Un veredicto
   * global obligaria a elegir entre tirar doce saldos buenos o dar por buenos
   * tres huecos, y las dos cosas mienten un poco.
   *
   * Y NO se lanza: lanzar tira tambien las filas que si se leyeron, y con ellas
   * la unica informacion que distingue «se cayo el nodo» de «fallo un token».
   * Quien pinta decide, con las filas delante. */
  async function portafolio(direccion, precioOndk) {
    if (!direccion) return [];
    const [{ p, chg }, declONDK, saldos] = await Promise.all([
      precios().catch(() => ({ p: {}, chg: {} })),
      precioDeclarado('ONDK'),
      Promise.all(TOKENS.map(async t => {
        try {
          const cant = t.nativo
            ? await saldoNativo(direccion)
            : await saldoToken(t.contrato, direccion);
          /* Un numero que no es numero (NaN, infinito) tampoco es un saldo:
             se trata como lo que es, un fallo de lectura, en vez de dejarlo
             entrar como cifra y que aparezca sumado en el patrimonio. */
          if (!Number.isFinite(cant)) return { cant: null, leido: false, error: 'saldo ilegible' };
          return { cant, leido: true, error: null };
        } catch (e) {
          return { cant: null, leido: false, error: (e && e.message) || 'no se pudo leer' };
        }
      })),
    ]);

    return TOKENS.map((t, i) => {
      let precio = p[t.s];
      // La resolucion de la Junta va PRIMERO que el respaldo del backend: de
      // aquella se sabe el acta y la fecha; del otro, solo que llego.
      const decl = t.s === 'ONDK' ? declONDK : null;
      if (precio == null && decl) precio = decl.precio;
      if (precio == null && t.s === 'ONDK' && precioOndk > 0) precio = precioOndk;
      if (precio == null && FIJOS[t.s] != null) precio = FIJOS[t.s];
      /* El `Number.isFinite(...) ? ... : 0` que habia aca era el segundo cero
         de consuelo, y tapaba al primero: aunque la lectura hubiera fallado,
         la fila salia con un 0 bien formado. Ahora la lectura viaja entera. */
      const lectura = saldos[i];
      return {
        s: t.s,
        ...META[t.s],
        contrato: t.contrato || null,
        nativo: !!t.nativo,
        /* Viaja con la fila y no se consulta aparte: quien pinta la lista tiene
           que poder decidir en el sitio si esto se enseña, sin volver a buscar
           el token en otra tabla. */
        publico: t.publico !== false,
        /* null = no se pudo leer. NO es cero. Quien pinte esta fila tiene que
           mirar `leido` antes de escribir una cifra, y quien sume el
           patrimonio tiene que negarse a dar un total si falta alguna. */
        cant: lectura.cant,
        leido: lectura.leido,
        error: lectura.error,
        precio: precio != null && precio > 0 ? precio : null,
        /* El acta viaja con el precio, no aparte. La variacion se queda en
           null a proposito: un precio declarado no tiene «24 h» —no se movio
           en veinticuatro horas, se movio el dia que la Junta firmo— y pintar
           un 0,00 % ahi seria decir que un mercado lo dejo quieto. */
        declarado: decl,
        chg: decl || FIJOS[t.s] != null ? null : (chg[t.s] ?? null),
      };
    });
  }

  const ficha = (sim, idioma) => (FICHAS[sim] || {})[idioma] || (FICHAS[sim] || {}).es || null;

  /* Los que hoy se publican. Es lo que tienen que ofrecer las pantallas de
     comprar y de cambiar: ahi no cabe el «tengo saldo, dejame verlo». */
  const PUBLICOS = TOKENS.filter(t => t.publico !== false).map(t => t.s);
  const esPublico = (sim) => PUBLICOS.includes(sim);

  return { TOKENS, PUBLICOS, esPublico, META, FICHAS, ficha, portafolio, precios, precioDeclarado, historia, historiable, rpc, RPC };
})();
