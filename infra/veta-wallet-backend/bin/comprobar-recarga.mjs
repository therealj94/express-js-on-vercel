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
import { createRequire } from 'node:module';

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

/* El precio: el mismo que usa el backend (lib/origenPrice.js), para que la
   cifra en ORIGEN de aquí sea la MISMA que la persona ve en su app. Si diera
   otra, esta comprobación crearía la duda que viene a resolver.

   Las mismas reglas que el backend: por omisión el gramin (gramo de oro / 55,
   decisión del 26-sep-2026); `fijo` sólo si se pide con OG_PRECIO_MODO=fijo
   y OG_ORIGEN_USD, y fuera de ese modo OG_ORIGEN_USD no cuenta. Los 0,01 USD
   NO son el precio de ORIGEN: son la comisión por transacción. */
let precio = null;
let deDonde = null;
if ((process.env.OG_PRECIO_MODO || 'oro').toLowerCase() === 'fijo') {
  const fijado = Number(process.env.OG_ORIGEN_USD);
  if (fijado > 0) { precio = fijado; deDonde = 'fijo'; }
} else {
  /* Primero a ORDENEX, y no es por comodidad: la casa YA publica su precio de
     ORIGEN en /mercados, sacado del oráculo único, y es el que ve cualquiera
     que mire el mercado. Además CoinGecko limita las consultas. */
  try {
    const m = await fetch('https://ordenex-api-ba4b27b8b51a.herokuapp.com/mercados',
      { signal: AbortSignal.timeout(20000) }).then((x) => x.json());
    const ref = (m || []).map((x) => x?.referencia?.origenUsd).find((v) => v > 0);
    if (ref > 0) { precio = ref; deDonde = 'Ordenex (/mercados)'; }
  } catch { /* se pregunta al oráculo */ }
  if (!(precio > 0)) {
    /* Si Ordenex no contesta, el oráculo único (lib/oraculo.js, SFSP v0.3
       §10.5): el MISMO archivo que usa el backend, con CoinGecko de principal
       y gold-api de respaldo. Nunca una lectura propia de un feed. */
    const oraculo = createRequire(import.meta.url)('../lib/oraculo.js');
    const gramin = await oraculo.precioOrigenUsd();
    if (gramin > 0) { precio = gramin; deDonde = 'oráculo (lib/oraculo.js)'; }
  }
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
