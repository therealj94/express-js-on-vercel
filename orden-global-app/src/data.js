// ===== Metadatos de los tokens oficiales de Orden Global =====
// Los saldos y precios reales vienen de la blockchain y de CoinGecko
// (src/api.js). Aquí solo viven nombre, ícono y descripción de cada token.

export const ORIGEN_PRICE = 2.35; // respaldo si el feed de precios no responde

// Cada token que tiene logo propio lo trae en `image`; TokenIcon renderiza
// esa imagen sobre un disco oscuro. Los que no lo tienen (MNKA) siguen con
// el glifo antiguo sobre un degradado. Así se mezclan sin sorpresas.
export const TOKEN_META = {
  ORIGEN: { s: 'ORIGEN', n: 'ORIGEN', image: require('../assets/tokens/origen.jpg') },
  AUKA:   { s: 'AUKA',   n: 'AUKA',   image: require('../assets/tokens/auka.jpg') },
  AGKA:   { s: 'AGKA',   n: 'AGKA',   image: require('../assets/tokens/agka.jpg') },
  ONDK:   { s: 'ONDK',   n: 'ONDK',   image: require('../assets/tokens/ondk.jpg') },
  MNKA:   { s: 'MNKA',   n: 'MNKA',   glyph: '♛', grad: ['#F8EFCF', '#C9A961', '#96793F'], fg: '#3A2C08' },
  IBS:      { s: 'IBS',      n: 'IBS Energy',glyph: '⚡',  grad: ['#FFE9B0', '#E0A426', '#8A5E0E'], fg: '#3A2400' },
  HARV:     { s: 'HARV',     n: 'Harvi',     glyph: '🌾',  grad: ['#E9F2C8', '#9CBF5E', '#5A7A2C'], fg: '#1D2A0C' },
  AUBEX:    { s: 'AUBEX',    n: 'AUBEX',     glyph: 'AB',  grad: ['#E4D9F7', '#8E6FC9', '#4B3684'], fg: '#1C1030' },
  ASL:      { s: 'ASL',      n: 'Athletic',  glyph: '🏃',  grad: ['#D9F0E6', '#4FB98B', '#227455'], fg: '#062A1D' },
  LOVE:     { s: 'LOVE',     n: 'Amor Global',glyph: '♥',  grad: ['#FBD8E3', '#E0648B', '#93254F'], fg: '#390318' },
  REST:     { s: 'REST',     n: 'Real State',glyph: '🏠',  grad: ['#DCE6F5', '#6E8FC2', '#354E76'], fg: '#0E1A2C' },
  SOL:      { s: 'SOL',      n: 'Solar',     glyph: '☀',  grad: ['#FFEBB0', '#F0A93A', '#A5610E'], fg: '#3A1E00' },
  AIT:      { s: 'AIT',      n: 'AI',        glyph: 'AI',  grad: ['#D3E8FB', '#4E8FD6', '#274F82'], fg: '#0A2038' },
  AGRO:     { s: 'AGRO',     n: 'Agrotech',  glyph: '🌱',  grad: ['#E2F1D6', '#7FB25A', '#43682D'], fg: '#152508' },
  POLITICAL:{ s: 'POLITICAL',n: 'Political', glyph: 'PO',  grad: ['#E9E0D6', '#A98E6E', '#6B5236'], fg: '#241A0C' },
};

// Las mismas 3 filas para las 5 monedas (Tipo · Respaldo · Red) para que
// la ficha de cada token se lea igual y compare fácil. El "Contrato" lo
// añade TokenDetail al final: dirección real si es un token de contrato,
// o "Token nativo" para ORIGEN. Se eliminó "Par" (era interno del feed
// de precios) para no ensuciar la vista al usuario.
export const COIN_INFO = {
  ORIGEN: {
    title: 'ORIGEN',
    desc: 'Cripto nativa de la blockchain de Orden Global, usada para pagos y transferencias dentro del ecosistema. Su valor se ancla a un gramín: 1/55 de un gramo de oro.',
    rows: [
      ['Tipo', 'Cripto nativa · pagos'],
      ['Respaldo', '1 gramín = 1/55 g oro'],
      ['Red', 'Orden Global · 8532'],
    ],
  },
  AUKA: {
    title: 'AUKA',
    desc: 'Token respaldado en oro: sigue el precio de una onza de oro. Ofrece exposición al oro sin custodia física.',
    rows: [
      ['Tipo', 'Commodity token'],
      ['Respaldo', 'Oro · 1 onza'],
      ['Red', 'Orden Global · 8532'],
    ],
  },
  AGKA: {
    title: 'AGKA',
    desc: 'Token respaldado en plata: sigue el precio de una onza de plata. Una forma descentralizada de invertir en el mercado de la plata.',
    rows: [
      ['Tipo', 'Commodity token'],
      ['Respaldo', 'Plata · 1 onza'],
      ['Red', 'Orden Global · 8532'],
    ],
  },
  ONDK: {
    title: 'ONDK',
    desc: 'Representación de Orden Global en token. Activo de gobernanza y utilidad que refleja el valor y la participación dentro del ecosistema.',
    rows: [
      ['Tipo', 'Token de Orden Global'],
      ['Respaldo', 'Ecosistema · gobernanza y utilidad'],
      ['Red', 'Orden Global · 8532'],
    ],
  },
  MNKA: {
    title: 'MNKA',
    desc: 'Activo digital del ecosistema Orden Global, diseñado para impulsar el crecimiento y la innovación impulsados por la comunidad.',
    rows: [
      ['Tipo', 'Activo digital'],
      ['Respaldo', 'Ecosistema · comunidad e innovación'],
      ['Red', 'Orden Global · 8532'],
    ],
  },
  // Descripciones honestas: a diferencia de AUKA/AGKA, estos tokens no
  // tienen un respaldo en un commodity específico verificado, así que la
  // fila "Respaldo" describe el sector del proyecto, no un activo físico.
  IBS: {
    title: 'IBS Energy',
    desc: 'Token del sector energético dentro del ecosistema Orden Global.',
    rows: [['Tipo', 'Token de sector'], ['Respaldo', 'Energía'], ['Red', 'Orden Global · 8532']],
  },
  HARV: {
    title: 'Harvi',
    desc: 'Activo digital del ecosistema Orden Global.',
    rows: [['Tipo', 'Activo digital'], ['Respaldo', 'Ecosistema Orden Global'], ['Red', 'Orden Global · 8532']],
  },
  AUBEX: {
    title: 'AUBEX',
    desc: 'Activo digital del ecosistema Orden Global.',
    rows: [['Tipo', 'Activo digital'], ['Respaldo', 'Ecosistema Orden Global'], ['Red', 'Orden Global · 8532']],
  },
  ASL: {
    title: 'Athletic',
    desc: 'Token del sector deportivo dentro del ecosistema Orden Global.',
    rows: [['Tipo', 'Token de sector'], ['Respaldo', 'Deporte'], ['Red', 'Orden Global · 8532']],
  },
  LOVE: {
    title: 'Amor Global',
    desc: 'Activo digital del ecosistema Orden Global.',
    rows: [['Tipo', 'Activo digital'], ['Respaldo', 'Ecosistema Orden Global'], ['Red', 'Orden Global · 8532']],
  },
  REST: {
    title: 'Real State',
    desc: 'Token del sector inmobiliario dentro del ecosistema Orden Global.',
    rows: [['Tipo', 'Token de sector'], ['Respaldo', 'Bienes raíces'], ['Red', 'Orden Global · 8532']],
  },
  SOL: {
    title: 'Solar',
    desc: 'Token del sector de energía solar dentro del ecosistema Orden Global.',
    rows: [['Tipo', 'Token de sector'], ['Respaldo', 'Energía solar'], ['Red', 'Orden Global · 8532']],
  },
  AIT: {
    title: 'Artificial Intelligence',
    desc: 'Token del sector de inteligencia artificial dentro del ecosistema Orden Global.',
    rows: [['Tipo', 'Token de sector'], ['Respaldo', 'Inteligencia artificial'], ['Red', 'Orden Global · 8532']],
  },
  AGRO: {
    title: 'Agrotech',
    desc: 'Token del sector agrícola dentro del ecosistema Orden Global.',
    rows: [['Tipo', 'Token de sector'], ['Respaldo', 'Agricultura'], ['Red', 'Orden Global · 8532']],
  },
  POLITICAL: {
    title: 'Political',
    desc: 'Activo digital del ecosistema Orden Global.',
    rows: [['Tipo', 'Activo digital'], ['Respaldo', 'Ecosistema Orden Global'], ['Red', 'Orden Global · 8532']],
  },
};

// Convierte los balances reales ([{symbol, qty, priceUsd, changePct, contract}])
// en la forma que renderiza la UI. Muestra TODOS los tokens, incluso en 0.
// Un precio ausente (feed caído) llega como null y la UI lo pinta como "—";
// nunca se sustituye por un valor congelado.
export function tokensFromBalances(balances) {
  return (balances || []).map((b) => {
    const sym = (b.symbol || '').toUpperCase();
    const meta = TOKEN_META[sym] || { s: sym, n: sym, glyph: sym.slice(0, 3), grad: ['#1E8C74', '#0A463F'], fg: '#EAD79C' };
    const price = b.priceUsd != null && Number(b.priceUsd) > 0 ? Number(b.priceUsd) : null;
    return {
      ...meta,
      s: sym,
      qty: Number(b.qty) || 0,
      price: price != null ? price : 0,
      hasPrice: price != null,
      chg: b.changePct != null ? Number(b.changePct) : null,
      contract: b.contract || null,
    };
  });
}

// ---------- montos escritos por el usuario ----------
//
// En un teléfono configurado en español el teclado `decimal-pad` muestra
// COMA, no punto. `parseFloat("1,5")` devuelve 1: el usuario pedía enviar
// uno y medio y salía uno, sin ningún aviso. Y "0,5" quedaba en cero, que
// la app rechazaba como "monto inválido" sin explicar por qué.
//
// normalizeAmtInput() se usa en el onChangeText de cada campo de monto para
// que el estado guarde siempre la forma canónica con punto; parseAmt() es
// el único lugar donde un texto de monto se convierte a número.
export function normalizeAmtInput(s) {
  // Se acepta lo que el teclado pueda producir (coma o punto) y se deja un
  // solo separador: el primero que aparezca. Los demás se descartan para que
  // "1.2.3" no se convierta en un número distinto del que se ve en pantalla.
  const limpio = String(s ?? '').replace(/[^\d.,]/g, '').replace(/,/g, '.');
  const i = limpio.indexOf('.');
  if (i === -1) return limpio;
  return limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, '');
}

export function parseAmt(s) {
  if (typeof s === 'number') return Number.isFinite(s) && s > 0 ? s : 0;
  const txt = String(s ?? '').trim().replace(/,/g, '.');
  // Estricto a propósito: un número positivo con UN solo separador. Cualquier
  // otra cosa — signo, separadores de más, texto — devuelve 0 en vez de
  // adivinarse. `parseFloat` aceptaba "1.2.3" como 1.2 y "-5" como -5; para un
  // monto que se va a firmar es preferible que el usuario lo reescriba a que
  // salga un número distinto del que quiso poner. El campo nunca llega en ese
  // estado (lo limpia normalizeAmtInput en cada tecla), pero un monto que
  // viene de un deep link o de otra pantalla sí puede.
  if (txt === '' || txt === '.' || !/^\d*\.?\d*$/.test(txt)) return 0;
  const n = parseFloat(txt);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const money = (v) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qtyFmt = (q) => {
  const n = Number(q) || 0;
  if (n === 0) return '0';
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
};

// Versión "de precisión" para vistas donde la exactitud importa (detalle
// del token, revisión de envío, historial): siempre 6 decimales, pero
// los últimos vacíos van en tono tenue para no romper la lectura. Devuelve
// un array [entero, decimales, decimalesTenue] para que la UI decida.
// El tercer elemento son los ceros/decimales sobrantes tras la parte útil.
export function qtyFmtParts(q) {
  const n = Number(q) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const fixed = abs.toFixed(6);
  const [intPart, decPart = '000000'] = fixed.split('.');
  // Encontrar el último dígito no-cero para separar la parte útil de la tenue.
  let last = decPart.length;
  while (last > 0 && decPart[last - 1] === '0') last--;
  const decUtil = decPart.slice(0, last);
  const decDim = decPart.slice(last);
  const intWithSep = Number(intPart).toLocaleString('en-US');
  return { sign, int: intWithSep, decUtil, decDim };
}

// Monto EXACTO, sin recortar, para las pantallas donde el usuario aprueba
// algo irreversible. qtyFmt recorta a 4 decimales para valores >= 1, así que
// firmar 42.512345 mostraba "42.5123": la cifra que se ve tiene que ser la
// cifra que se firma. Se quitan los ceros sobrantes del final.
export const qtyExacto = (q) => {
  const n = Number(q) || 0;
  if (n === 0) return '0';
  const s = n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  const [ent, dec] = s.split('.');
  const entSep = Number(ent).toLocaleString('en-US');
  return dec ? `${entSep}.${dec}` : entSep;
};
