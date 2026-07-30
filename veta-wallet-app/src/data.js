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
