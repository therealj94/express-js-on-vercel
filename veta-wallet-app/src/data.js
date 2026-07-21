// ===== Precios reales (jul 2026) — simulados sin backend =====
export const PRICES = { BTC: 64378, ETH: 1904, GOLD_G: 129.26, SILVER_G: 1.92 };
export const ORIGEN_PRICE = +(PRICES.GOLD_G / 55).toFixed(2); // 1/55 de gramo de oro
export const ONDK_PRICE = 2.1;

// icon: 'logo' usa el logo real; si no, glifo de texto con gradiente
export const TOKENS = [
  { s: 'ORIGEN', n: 'Origen', qty: 250, price: ORIGEN_PRICE, chg: 2.4, logo: true },
  { s: 'ONDK', n: 'ONDK', qty: 120, price: ONDK_PRICE, chg: 0.8, glyph: '◈', grad: ['#1E8C74', '#0A463F'], fg: '#EAD79C' },
  { s: 'AUKA', n: 'Auka · Oro', qty: 3, price: PRICES.GOLD_G, chg: 0.6, glyph: 'Au', grad: ['#F8EFCF', '#C9A961', '#96793F'], fg: '#3A2C08' },
  { s: 'AGKA', n: 'Agka · Plata', qty: 40, price: PRICES.SILVER_G, chg: -0.4, glyph: 'Ag', grad: ['#EDF1F3', '#B4BCC2', '#7C858C'], fg: '#2A2F33' },
  { s: 'BTC', n: 'Bitcoin', qty: 0.045, price: PRICES.BTC, chg: 1.39, glyph: '₿', grad: ['#F7931A', '#C9760F'], fg: '#fff' },
  { s: 'ETH', n: 'Ethereum', qty: 0.85, price: PRICES.ETH, chg: -0.27, glyph: 'Ξ', grad: ['#627EEA', '#3D54C4'], fg: '#fff' },
  { s: 'USDT', n: 'Tether', qty: 500, price: 1, chg: 0.0, glyph: '₮', grad: ['#26A17B', '#1A7D5E'], fg: '#fff' },
  { s: 'USDC', n: 'USD Coin', qty: 300, price: 1, chg: 0.0, glyph: '$', grad: ['#2775CA', '#1A5BA8'], fg: '#fff' },
];

export const TOTAL = TOKENS.reduce((s, t) => s + t.qty * t.price, 0);

export const COIN_INFO = {
  ORIGEN: {
    title: 'Origen (ORIGEN)',
    desc: 'Cripto nativa de la blockchain de Orden Global, usada para pagos y transferencias dentro del ecosistema. Su valor se ancla a un gramín: 1/55 de un gramo de oro.',
    rows: [['Tipo', 'Cripto nativa · pagos'], ['Respaldo', '1 gramín = 1/55 g oro'], ['Network ID', '8532'], ['Contrato', 'Token Nativo']],
  },
  ONDK: {
    title: 'ONDK',
    desc: 'Representación de Orden Global en token. Activo de gobernanza y utilidad que refleja el valor y la participación dentro del ecosistema Orden Global.',
    rows: [['Tipo', 'Token de Orden Global'], ['Uso', 'Gobernanza · utilidad'], ['Red', 'Orden Global'], ['Contrato', '0x9a…ONDK']],
  },
  AUKA: {
    title: 'Auka · Oro (AUKA)',
    desc: 'Reserva de oro. 1 AUKA equivale 1:1 a 1 gramo de oro físico custodiado y auditado. Su precio sigue el valor del oro al día de hoy.',
    rows: [['Respaldo', '1 AUKA = 1 g oro (1:1)'], ['Precio oro hoy', '$129.26 / g'], ['Custodia', 'Auditada'], ['Tipo', 'Commodity token']],
  },
  AGKA: {
    title: 'Agka · Plata (AGKA)',
    desc: 'Reserva de plata. 1 AGKA equivale 1:1 a 1 gramo de plata física custodiada y auditada. Su precio sigue el valor de la plata al día de hoy.',
    rows: [['Respaldo', '1 AGKA = 1 g plata (1:1)'], ['Precio plata hoy', '$1.92 / g'], ['Custodia', 'Auditada'], ['Tipo', 'Commodity token']],
  },
  BTC: { title: 'Bitcoin (BTC)', desc: 'La primera y mayor criptomoneda del mundo. Reserva de valor digital, descentralizada.', rows: [['Precio', '$64,378'], ['Cambio 24h', '+1.39%'], ['Red', 'Bitcoin']] },
  ETH: { title: 'Ethereum (ETH)', desc: 'Plataforma de contratos inteligentes líder. ETH es su moneda nativa.', rows: [['Precio', '$1,904'], ['Cambio 24h', '-0.27%'], ['Red', 'Ethereum']] },
  USDT: { title: 'Tether (USDT)', desc: 'Stablecoin anclada 1:1 al dólar estadounidense.', rows: [['Precio', '$1.00'], ['Tipo', 'Stablecoin']] },
  USDC: { title: 'USD Coin (USDC)', desc: 'Stablecoin regulada anclada 1:1 al dólar estadounidense.', rows: [['Precio', '$1.00'], ['Tipo', 'Stablecoin']] },
};

// ===== Velas japonesas (candlestick) — generación determinística =====
export function genCandles(seedStr, base, vol, trend = 0, n = 30) {
  let s = 0;
  for (let i = 0; i < seedStr.length; i++) s = (s * 31 + seedStr.charCodeAt(i)) % 100000;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const out = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    const o = price;
    const drift = (rnd() - 0.5 + trend) * vol;
    const c = Math.max(base * 0.4, o + drift);
    const hi = Math.max(o, c) + rnd() * vol * 0.6;
    const lo = Math.min(o, c) - rnd() * vol * 0.6;
    out.push({ o, h: hi, l: lo, c });
    price = c;
  }
  return out;
}

export const TXNS = [
  { t: 'Uber Eats', d: 'Hoy · 13:20', v: '-$18.40', kind: 'card', neg: true, ic: 'fast-food' },
  { t: 'Recibido de María', d: 'Hoy · 11:02', v: '+12.5 ORIGEN', kind: 'in', pos: true, ic: 'arrow-down' },
  { t: 'Swap ORIGEN → USDT', d: 'Hoy · 09:47', v: '50 ORIGEN', kind: 'swap', ic: 'swap-horizontal' },
  { t: 'Amazon', d: 'Ayer · 19:30', v: '-$64.99', kind: 'card', neg: true, ic: 'bag-handle' },
  { t: 'Recarga de tarjeta', d: 'Ayer · 15:10', v: '+$250.00', kind: 'card', pos: true, ic: 'arrow-up' },
  { t: 'Enviado a Carlos', d: '20 jul · 12:40', v: '-25 ORIGEN', kind: 'out', neg: true, ic: 'arrow-up' },
  { t: 'Gasolinera Puma', d: '19 jul · 08:15', v: '-$42.10', kind: 'card', neg: true, ic: 'car-sport' },
  { t: 'Compra ORIGEN', d: '18 jul · 21:03', v: '+42.5 ORIGEN', kind: 'in', pos: true, ic: 'cart' },
  { t: 'Netflix', d: '18 jul · 06:00', v: '-$12.99', kind: 'card', neg: true, ic: 'play' },
];

export const NOTIFS = [
  { ic: 'arrow-down', t: 'Remesa recibida', p: 'María te envió 12.5 ORIGEN ($29.38)', s: 'Hace 5 min', u: true },
  { ic: 'card', t: 'Compra con tarjeta', p: 'Uber Eats · $18.40 aprobado', s: 'Hace 1 h', u: true },
  { ic: 'swap-horizontal', t: 'Swap completado', p: '50 ORIGEN → 117.50 USDT', s: 'Hace 3 h' },
  { ic: 'finger-print', t: 'Nuevo inicio de sesión', p: 'Face ID · dispositivo nuevo', s: 'Ayer' },
  { ic: 'trending-up', t: 'Recompensa de staking', p: 'Ganaste 0.42 ORIGEN de tu stake', s: 'Ayer' },
];

export const SEED_WORDS = ['origen', 'oro', 'veta', 'bloque', 'llave', 'nodo', 'global', 'activo', 'semilla', 'puente', 'red', 'valor', 'cadena', 'firma', 'cripto', 'token', 'seguro', 'minero', 'fondo', 'clave', 'sur', 'norte', 'flujo', 'gramo'];

export function makeSeed() {
  const pool = [...SEED_WORDS];
  const out = [];
  for (let i = 0; i < 12; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

// Frase semilla de la sesión (simulada) — compartida entre creación y menú
export const WALLET_SEED = makeSeed();
export const WALLET_ADDRESS = '0x7F2a9c4B1eD8f3A05b6C4d2C7e9F1a3B';
export const SHORT_ADDR = '0x7F2a…4d2C';

export const money = (v) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qtyFmt = (q) => (q >= 1 ? Number(q).toLocaleString('en-US', { maximumFractionDigits: 4 }) : String(q));
