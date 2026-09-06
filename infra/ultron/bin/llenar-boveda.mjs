/* Llena la bóveda de ULTRON con los secretos que ya viven en Heroku.
 *
 *   HEROKU_API_KEY=… ULTRON_CLAVE=… node infra/ultron/bin/llenar-boveda.mjs [--ver]
 *
 * Lee las variables de cada app de la casa por la API de Heroku y las guarda
 * en la bóveda de ULTRON (POST /boveda, como el dueño), con `yaEn` diciendo en
 * qué app y con qué nombre está cada una. NINGÚN VALOR SE IMPRIME: lo único
 * que sale por la terminal es el nombre, el largo y dónde está.
 *
 * ── LO QUE NO ENTRA, A PROPÓSITO ────────────────────────────────────────────
 * Las llaves privadas de billeteras y las semillas (HOT_KEY, GAS_KEY,
 * VENTA_KEY, TREASURY_*_PRIVATE_KEY, SEMILLA) NO se copian a la bóveda. No se
 * rotan por ULTRON —se sustituyen moviendo fondos—, así que guardarlas aquí
 * sería duplicar la pieza más peligrosa de la casa sin ganar nada. Tampoco la
 * llave de la propia bóveda ni la lista de la junta.
 *
 * Cada variable se guarda con un nombre único: las de ULTRON con el suyo; las
 * de las demás apps con el prefijo de la app (ORDENEX_API__MONGODB_URI), para
 * que dos MONGODB_URI distintas no se pisen.
 */

const HEROKU = (process.env.HEROKU_API_KEY || '').trim();
const CLAVE = (process.env.ULTRON_CLAVE || '').trim();
const CORREO = (process.env.ULTRON_CORREO || 'j.ordonez@ordenglobal.org').trim();
const BASE = process.env.ULTRON_URL || 'https://ultron-fp-d47136405fc3.herokuapp.com';
const SOLO_VER = process.argv.includes('--ver');
if (!HEROKU || !CLAVE) { console.error('Hacen falta HEROKU_API_KEY y ULTRON_CLAVE en el entorno (no se imprimen).'); process.exit(2); }

const APPS = ['ultron-fp', 'ordenex-api', 'aucorp-api', 'vetawallet', 'orden-global-scan', 'mytokenpay-api', 'pos-wallet', 'ico-back'];
const NO_ENTRA = /HOT_KEY|GAS_KEY|VENTA_KEY|PRIVATE_KEY|SEMILLA|SEED|MNEMONIC|ULTRON_BOVEDA_LLAVE|ULTRON_JUNTA|ULTRON_NODO_CERT/i;
/* Lo que NO es un secreto: se deja fuera para que la bóveda no sea un espejo
   del entorno. Un secreto es lo que abre algo. */
const NO_ES_SECRETO = /^(NODE_ENV|AWS_REGION|CORS_|GENESIS_URL|OG_CHAIN_PROVIDER|POLYGON_CHAIN_PROVIDER|ORDENEX_REDES|BARRIDO|COMPRAS|VENTAS|OG_PRECIO_MODO|OG_TOKEN_PRICE_USD|CORS_ALLOW_LOCALHOST|APPLE_CLIENT_IDS|GOOGLE_CLIENT_IDS|VERIFF_CALLBACK_URL|TREASURY_OG_ADDRESS|ULTRON_CEREBRO|ULTRON_DUENO|ULTRON_NODO_URL|ULTRON_NODO_MODELO|ULTRON_NODO_CTX|ELEVENLABS_VOZ|GMAIL_USER|OUTLOOK_USER|ZERNIO_CUENTA|ZERNIO_BASE)$/;

const h = async (ruta) => {
  const r = await fetch(`https://api.heroku.com${ruta}`, { headers: { Authorization: `Bearer ${HEROKU}`, Accept: 'application/vnd.heroku+json; version=3' } });
  if (!r.ok) throw new Error(`Heroku ${r.status} en ${ruta}`);
  return r.json();
};

// entrar como el dueño
const ent = await fetch(`${BASE}/entrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: CORREO, clave: CLAVE }) });
if (!ent.ok) { console.error('No se pudo entrar a ULTRON:', ent.status); process.exit(2); }
const cookie = ent.headers.get('set-cookie').split(';')[0];

let guardados = 0, saltados = [];
for (const app of APPS) {
  let vars; try { vars = await h(`/apps/${app}/config-vars`); } catch (e) { console.log(`  ${app}: ${e.message}`); continue; }
  for (const [k, v] of Object.entries(vars)) {
    if (NO_ENTRA.test(k)) { saltados.push(`${app}:${k} (llave privada o semilla: no entra)`); continue; }
    if (NO_ES_SECRETO.test(k)) continue;
    if (!v || String(v).length < 6) continue;
    const nombre = app === 'ultron-fp' ? k : `${app.toUpperCase().replace(/[^A-Z0-9]/g, '_')}__${k}`;
    const nota = `de ${app} (${k})`;
    if (SOLO_VER) { console.log(`  ${nombre.padEnd(44)} ${String(v).length} car. · ${nota}`); continue; }
    const r = await fetch(`${BASE}/boveda`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ nombre, valor: v, nota, yaEn: [{ app, variable: k }] }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { guardados++; console.log(`  ✓ ${nombre.padEnd(44)} ${d.largo} car. · en ${app}`); }
    else console.log(`  ✗ ${nombre}: ${d.error || r.status}`);
  }
}
console.log(`\n${SOLO_VER ? 'se guardarían' : 'guardados'}: ${guardados || '(ver arriba)'} · fuera a propósito: ${saltados.length}`);
for (const s of saltados) console.log('   ·', s);
