// ═══ EL COMPROBANTE DE UN ENVÍO ══════════════════════════════════════════
// node pruebas/probar-comprobante.cjs
//
// src/comprobante.js no tiene imports a propósito: se lee, se le quitan los
// `export` y se ejecuta tal cual — la MISMA aritmética que corre en el
// teléfono. Se prueba lo que decide:
//
//   · leerRecibo: qué es «confirmada» y qué no. Un recibo sin bloque NO es
//     una confirmación (Besu devuelve el objeto con blockNumber en null
//     mientras la transacción sigue pendiente), y status 0x0 es «la red la
//     incluyó y la rechazó»: el monto no se movió.
//   · enlaceExplorador: solo con un hash de verdad, siempre a /tx/<hash>.
//   · textoComprobante: lo que se comparte dice bloque y estado leídos, no
//     supuestos.
//
// Y además se mira Trade.js: que las fases del envío ya NO avancen con un
// reloj. Fue el fallo de fondo —la pantalla verde salía con la transacción
// en el aire— y una prueba que no lo vigile deja que vuelva.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const fuente = leer('src/comprobante.js');
const fabrica = new Function(fuente.replace(/^export /gm, '') + '\nreturn { EXPLORADOR_TX_POR_OMISION, esHash, enlaceExplorador, leerRecibo, textoComprobante };');
const { EXPLORADOR_TX_POR_OMISION, esHash, enlaceExplorador, leerRecibo, textoComprobante } = fabrica();

let pasan = 0;
const fallos = [];
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { pasan += 1; return; }
  fallos.push(nombre + (detalle ? `  (${detalle})` : ''));
};
const j = (x) => JSON.stringify(x);

const HASH = '0x' + 'ab'.repeat(32);

// ── 1. el recibo, tal como lo devuelve un nodo Besu ───────────────────────
{
  // Lo que contesta eth_getTransactionReceipt de verdad: todo en hexadecimal.
  const crudo = {
    transactionHash: HASH, blockNumber: '0x3f7a1', blockHash: '0x' + '11'.repeat(32),
    status: '0x1', gasUsed: '0x5208', cumulativeGasUsed: '0x5208', from: '0x' + '22'.repeat(20), to: '0x' + '33'.repeat(20), logs: [],
  };
  const r = leerRecibo(crudo);
  prueba('un recibo con bloque y status 1 es una confirmación', r && r.confirmada === true && r.exito === true, j(r));
  prueba('el bloque sale en decimal', r && r.bloque === 260001, j(r && r.bloque));
  prueba('el gas usado también', r && r.gasUsado === 21000, j(r && r.gasUsado));
  prueba('y el hash viaja en el recibo', r && r.hash === HASH);
}
{
  const r = leerRecibo({ ...{ transactionHash: HASH, blockNumber: '0x3f7a1' }, status: '0x0' });
  prueba('status 0 es «incluida y RECHAZADA»: confirmada pero sin éxito', r && r.confirmada === true && r.exito === false, j(r));
}
{
  const r = leerRecibo({ transactionHash: HASH, blockNumber: '0x10' });
  prueba('un nodo que no informa status deja exito en null, no en true', r && r.exito === null, j(r));
}
{
  prueba('null (todavía pendiente) no es un recibo', leerRecibo(null) === null);
  prueba('un objeto sin bloque tampoco', leerRecibo({ transactionHash: HASH, blockNumber: null, status: null }) === null);
  prueba('basura tampoco', leerRecibo('0x1') === null && leerRecibo(42) === null && leerRecibo({}) === null);
}

// ── 2. el enlace al explorador ────────────────────────────────────────────
{
  prueba('la ruta por omisión es la misma que enlazan la web y el chat', EXPLORADOR_TX_POR_OMISION === 'https://ordenscan.com/tx/');
  prueba('con hash: /tx/<hash>', enlaceExplorador(HASH) === 'https://ordenscan.com/tx/' + HASH, enlaceExplorador(HASH));
  prueba('con otra base configurada, la respeta y le pone la barra', enlaceExplorador(HASH, 'https://otro.scan/tx') === 'https://otro.scan/tx/' + HASH);
  prueba('sin hash no hay enlace (ni a un «no encontrado»)', enlaceExplorador(null) === null && enlaceExplorador('') === null);
  prueba('un hash local (local_…) no es un hash', enlaceExplorador('local_1725000000') === null && !esHash('local_1'));
  prueba('un hash corto tampoco', enlaceExplorador('0xabc') === null);
}

// ── 3. lo que se comparte ─────────────────────────────────────────────────
{
  const r = { titulo: 'Comprobante · Veta Wallet', enviado: 'Enviado', para: 'Para', fecha: 'Fecha', red: 'Red',
    bloque: 'Bloque', estado: 'Estado', confirmada: 'Confirmada en cadena', pendiente: 'Enviada · esperando confirmación', comprobante: 'Comprobante' };
  const base = { monto: '1.5', simbolo: 'ORIGEN', usd: '$3.75 USD', para: '0x' + '33'.repeat(20), paraNombre: 'Ana',
    fecha: '02 sept 2026, 10:15', red: 'Orden Global · 5550', bloque: 260001, confirmada: true, enlace: enlaceExplorador(HASH) };
  const txt = textoComprobante(base, r);
  prueba('lleva monto, símbolo y equivalente', /Enviado: 1\.5 ORIGEN \(≈ \$3\.75 USD\)/.test(txt), txt);
  prueba('lleva el nombre del contacto Y la dirección completa', txt.includes('Para: Ana · 0x' + '33'.repeat(20)));
  prueba('lleva la red y la fecha', txt.includes('Red: Orden Global · 5550') && txt.includes('Fecha: 02 sept 2026, 10:15'));
  prueba('lleva el bloque y dice «confirmada»', txt.includes('Bloque: #260001') && txt.includes('Estado: Confirmada en cadena'));
  prueba('y el enlace a OrdenScan', txt.includes('Comprobante: https://ordenscan.com/tx/' + HASH));

  const pend = textoComprobante({ ...base, bloque: null, confirmada: false }, r);
  prueba('pendiente: sin bloque y dice «esperando»', !pend.includes('Bloque:') && pend.includes('Estado: Enviada · esperando confirmación'), pend);
  const sinUsd = textoComprobante({ ...base, usd: null, paraNombre: null }, r);
  prueba('sin precio no inventa un equivalente', /Enviado: 1\.5 ORIGEN\n/.test(sinUsd), sinUsd);
}

// ── 4. Trade.js: las fases son de la red, no de un reloj ──────────────────
{
  const trade = leer('src/screens/Trade.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  prueba('Trade.js ya no avanza las fases con setTimeout', !/setTimeout\(\s*\(\)\s*=>\s*setFase/.test(trade));
  prueba('espera el recibo de la cadena (esperarRecibo) antes del comprobante', /await esperarRecibo\(/.test(trade));
  prueba('la fase 3 solo se marca con recibo', /if \(recibo\) fase\(3\)/.test(trade));
  prueba('un recibo con status 0 se trata como error, no como éxito', /recibo\.exito === false/.test(trade));
  prueba('el comprobante ofrece «Ver en OrdenScan» y «Compartir»', /send\.verScan/.test(trade) && /send\.compartir/.test(trade) && /Share\.share\(/.test(trade));
  prueba('la red se nombra desde CHAIN_ID (RED_NOMBRE), no escrita a mano', !/Orden Global · 5550/.test(trade) && /RED_NOMBRE/.test(trade));
}
{
  const api = leer('src/api.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  prueba('api.js pregunta eth_getTransactionReceipt al RPC', /eth_getTransactionReceipt/.test(api));
  prueba('y no reintenta solo el cambio de contraseña (noRetry)', /changePassword[\s\S]{0,300}noRetry: true/.test(api));
}
{
  // package.json: expo-sharing NO está, así que el comprobante tiene que
  // compartirse con Share de react-native y no con un módulo nativo nuevo.
  const pkg = JSON.parse(leer('package.json'));
  prueba('no se agregó expo-sharing (sería un módulo nativo más)', !pkg.dependencies['expo-sharing']);
}

for (const f of fallos) console.log('  FALLA ' + f);
console.log(fallos.length ? `\n${fallos.length} en rojo (${pasan} en verde)\n` : `\n✓ ${pasan} pruebas en verde\n`);
process.exit(fallos.length ? 1 : 0);
