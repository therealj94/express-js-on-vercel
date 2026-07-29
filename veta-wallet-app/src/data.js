// ===== Metadatos de los tokens oficiales de Orden Global =====
// Los saldos y precios reales vienen de la blockchain y de CoinGecko
// (src/api.js). Aquí solo viven nombre, ícono y descripción de cada token.

export const ORIGEN_PRICE = 2.35; // respaldo si el feed de precios no responde

export const TOKEN_META = {
  ORIGEN: { s: 'ORIGEN', n: 'ORIGEN', logo: true },
  AUKA: { s: 'AUKA', n: 'AUKA', glyph: 'Au', grad: ['#F8EFCF', '#C9A961', '#96793F'], fg: '#3A2C08' },
  AGKA: { s: 'AGKA', n: 'AGKA', glyph: 'Ag', grad: ['#EDF1F3', '#B4BCC2', '#7C858C'], fg: '#2A2F33' },
  ONDK: { s: 'ONDK', n: 'ONDK', glyph: '◈', grad: ['#1E8C74', '#0A463F'], fg: '#EAD79C' },
  MNKA: { s: 'MNKA', n: 'MNKA', glyph: '♛', grad: ['#F8EFCF', '#C9A961', '#96793F'], fg: '#3A2C08' },
};

export const COIN_INFO = {
  ORIGEN: {
    title: 'ORIGEN',
    desc: 'Cripto nativa de la blockchain de Orden Global, usada para pagos y transferencias dentro del ecosistema. Su valor se ancla a un gramín: 1/55 de un gramo de oro.',
    rows: [['Tipo', 'Cripto nativa · pagos'], ['Respaldo', '1 gramín = 1/55 g oro'], ['Network ID', '8532'], ['Contrato', 'Token nativo']],
  },
  AUKA: {
    title: 'AUKA',
    desc: 'Token respaldado en oro: sigue el precio de una onza de oro. Ofrece exposición al oro sin custodia física.',
    rows: [['Respaldo', 'Oro (1 oz)'], ['Precio', 'Sigue el oro en vivo'], ['Network ID', '8532'], ['Tipo', 'Commodity token']],
  },
  AGKA: {
    title: 'AGKA',
    desc: 'Token respaldado en plata: sigue el precio de una onza de plata. Una forma descentralizada de invertir en el mercado de la plata.',
    rows: [['Respaldo', 'Plata (1 oz)'], ['Precio', 'Sigue la plata en vivo'], ['Network ID', '8532'], ['Tipo', 'Commodity token']],
  },
  ONDK: {
    title: 'ONDK',
    desc: 'Representación de Orden Global en token. Activo de gobernanza y utilidad que refleja el valor y la participación dentro del ecosistema.',
    rows: [['Tipo', 'Token de Orden Global'], ['Uso', 'Gobernanza · utilidad'], ['Par', 'ONDKUSDT'], ['Network ID', '8532']],
  },
  MNKA: {
    title: 'MNKA',
    desc: 'Activo digital del ecosistema Orden Global, diseñado para impulsar el crecimiento y la innovación impulsados por la comunidad.',
    rows: [['Tipo', 'Activo digital'], ['Par', 'MNKAUSDT'], ['Network ID', '8532']],
  },
};

// Convierte los balances reales ([{symbol, qty, priceUsd, changePct, contract}])
// en la forma que renderiza la UI. Muestra TODOS los tokens, incluso en 0.
export function tokensFromBalances(balances) {
  return (balances || []).map((b) => {
    const sym = (b.symbol || '').toUpperCase();
    const meta = TOKEN_META[sym] || { s: sym, n: sym, glyph: sym.slice(0, 3), grad: ['#1E8C74', '#0A463F'], fg: '#EAD79C' };
    return {
      ...meta,
      s: sym,
      qty: Number(b.qty) || 0,
      price: Number(b.priceUsd) || 0,
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
