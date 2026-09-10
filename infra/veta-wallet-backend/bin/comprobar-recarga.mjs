#!/usr/bin/env node
/**
 * COMPROBAR UNA RECARGA DE TARJETA, DE PUNTA A PUNTA.
 *
 * Se manda USDT a la dirección de recarga de una tarjeta y hay tres cosas
 * distintas que pueden haber pasado, y solo mirando las tres se sabe cuál:
 *
 *   1. el USDT salió de quien lo mandó        → se ve en la cadena
 *   2. el USDT llegó a la dirección           → se ve en la cadena
 *   3. CryptoMate lo acreditó en la tarjeta   → se ve en su API
 *
 * Entre 2 y 3 puede pasar un rato, y ésa es justo la ventana en la que alguien
 * dice «mandé el dinero y no aparece». Con las tres a la vista se sabe si hay
 * que esperar o si hay que reclamar.
 *
 *   node bin/comprobar-recarga.mjs <ultimos4>
 *
 * CRYPTOMATE_API_KEY en el entorno. Solo LEE: no mueve nada.
 */
const l4 = process.argv[2];
if (!l4) { console.log('Uso: node bin/comprobar-recarga.mjs <ultimos4 de la tarjeta>'); process.exit(1); }

const CM = (process.env.CRYPTOMATE_API_KEY || '').trim();
if (!CM) { console.log('Falta CRYPTOMATE_API_KEY en el entorno.'); process.exit(1); }

const USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const RPCS = [process.env.POLYGON_RPC, 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com'].filter(Boolean);

const cm = (r) => fetch(`https://api.cryptomate.me${r}`, { headers: { 'x-api-key': CM } }).then((x) => x.json());

async function rpc(metodo, params) {
  let ultimo = null;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }), signal: AbortSignal.timeout(15000) });
      const d = await r.json();
      if (d.error) { ultimo = new Error(typeof d.error === 'string' ? d.error : d.error.message); continue; }
      return d.result;
    } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

const lista = await cm('/cards/virtual-cards/list');
const tarjeta = (Array.isArray(lista) ? lista : []).find((c) => String(c.last4) === String(l4));
if (!tarjeta) { console.log(`No hay ninguna tarjeta que termine en ${l4}.`); process.exit(1); }

console.log(`\n  ${tarjeta.card_holder_name} · ****${tarjeta.last4} · ${tarjeta.status}`);
console.log(`  ${(tarjeta.meta || {}).email || 'sin correo'}\n`);

const saldo = await cm(`/cards/virtual-cards/${tarjeta.id}/virtual-balances`);
const usd = Number(saldo.available_credit);

/* El precio: el mismo que usa el backend, para que la cifra en ORIGEN de aquí
   sea la MISMA que la persona ve en su app. Si diera otra, esta comprobación
   crearía la duda que viene a resolver. */
let precio = Number(process.env.OG_ORIGEN_USD);
let deDonde = 'OG_ORIGEN_USD';
if (!(precio > 0)) {
  if ((process.env.OG_PRECIO_MODO || 'fijo').toLowerCase() === 'oro') {
    /* Se le pregunta a ORDENEX y no a CoinGecko, y no es por comodidad: la
       casa YA publica su precio de ORIGEN en /mercados, y es el que ve
       cualquiera que mire el mercado. Preguntarle al feed de fuera por
       separado abre la puerta a que esta comprobación diga un número y la
       pantalla de la persona diga otro — que es exactamente la duda que esto
       viene a cerrar. Además CoinGecko limita las consultas y hoy no contestó. */
    try {
      const m = await fetch('https://ordenex-api-ba4b27b8b51a.herokuapp.com/mercados',
        { signal: AbortSignal.timeout(20000) }).then((x) => x.json());
      const ref = (m || []).map((x) => x?.referencia?.origenUsd).find((v) => v > 0);
      if (ref > 0) { precio = ref; deDonde = 'Ordenex (/mercados)'; }
    } catch { /* se dirá abajo */ }
    if (!(precio > 0)) {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd')
        .then((x) => x.json()).catch(() => null);
      const oro = r?.['pax-gold']?.usd;
      if (oro > 0) { precio = oro / 31.1035 / 55; deDonde = 'CoinGecko (oro)'; }
    }
  } else { precio = 0.01; deDonde = 'fijo'; }
}
if (!(precio > 0)) {
  /* Sin precio NO se inventa uno: se dice. Una cifra en ORIGEN sacada de un
     precio adivinado es peor que no enseñar cifra. */
  console.log('  NO se pudo leer el precio de ORIGEN: el saldo va solo en dólares.\n');
  precio = null;
}

console.log(`  saldo de la tarjeta : $${usd.toFixed(2)}`);
if (precio) console.log(`  en ORIGEN           : ${(usd / precio).toFixed(4)}   (a ${precio.toFixed(6)} USD por ORIGEN · ${deDonde})`);

const wallets = await cm(`/cards/virtual-cards/${tarjeta.id}/top-up`).catch(() => []);
for (const w of (Array.isArray(wallets) ? wallets : [])) {
  console.log(`\n  dirección de recarga (${w.blockchain}): ${w.address}`);
  const dato = '0x70a08231' + '0'.repeat(24) + w.address.toLowerCase().replace(/^0x/, '');
  try {
    const hex = await rpc('eth_call', [{ to: USDT, data: dato }, 'latest']);
    const enCamino = Number(BigInt(hex || '0x0')) / 1e6;
    console.log(`  USDT parado en esa dirección: ${enCamino.toFixed(6)}`);
    if (enCamino > 0.01) {
      console.log('  → llegó a la dirección pero CryptoMate todavía no lo acreditó. Suele tardar unos minutos.');
    } else {
      console.log('  → nada esperando: o ya se acreditó, o todavía no ha llegado.');
    }
  } catch (e) { console.log(`  no se pudo leer la cadena: ${String(e.message).slice(0, 90)}`); }
}
console.log('');
