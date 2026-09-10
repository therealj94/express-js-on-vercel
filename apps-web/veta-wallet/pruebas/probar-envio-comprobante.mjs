/* EL ENVÍO «PRO»: revisión, estados reales y comprobante; y cambiar la
 * contraseña sin que te saque.
 *
 *   node pruebas/probar-envio-comprobante.mjs
 *
 * Se abre la web de verdad en un navegador de verdad y se hace lo que haría
 * una persona: escribir la dirección y el monto, tocar «Revisar», leer la
 * ficha, tocar «Confirmar», y mirar el recibo. El backend y la cadena son de
 * mentira, pero contestan EXACTAMENTE con la forma del de verdad:
 *
 *   · /transaction/send devuelve `{ hash, status: 'pending', … }` sin esperar
 *     el bloque, como hace transactionController.js (no espera el minado por
 *     el corte de 30 s de Heroku). Si la prueba devolviera ya «confirmado»,
 *     no probaría lo que importa: que la pantalla distinga enviada de
 *     confirmada.
 *   · eth_getTransactionReceipt devuelve null la primera vez (la transacción
 *     todavía no está en un bloque) y el recibo hexadecimal de Besu la
 *     segunda. Así se ve la pantalla pasar de «esperando» a «confirmada · #N»
 *     por lo que dice la cadena, no por un reloj.
 *   · /users/changePassword contesta 401 con la actual mal y, con la buena,
 *     el par nuevo de tokens que emite el backend de esta entrega.
 *
 * Lo que se comprueba:
 *   1. la revisión enseña la dirección ENTERA, el monto, el equivalente, la
 *      comisión y la red antes de confirmar;
 *   2. el POST lleva lo que el backend espera, con sello de idempotencia;
 *   3. el recibo sale primero «enviada · esperando», y solo con el recibo de
 *      la cadena pasa a «confirmada» con el bloque en decimal;
 *   4. «Ver en OrdenScan» va a /tx/<hash> en pestaña nueva, y hay «Compartir»;
 *   5. cambiar la contraseña: la actual mal da su mensaje y NO cierra la
 *      sesión; la buena guarda el token nuevo y sigue adentro.
 */
import { createServer as servidorHttp } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { abrirNavegador } from '../../navegador.mjs';

let mal = 0;
const ok = (nombre, cierto, detalle = '') => {
  if (cierto) console.log('  ok    ' + nombre);
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '\n          ' + detalle : '')); }
};

/* La prueba sirve su propio sitio, igual que probar-actividad-scan. */
const RAIZ = new URL('../../../', import.meta.url).pathname;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const sitio = servidorHttp(async (q, r) => {
  try {
    const rel = decodeURIComponent(q.url.split('?')[0]);
    const f = join(RAIZ, rel.endsWith('/') ? rel + 'index.html' : rel);
    const d = await readFile(f);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((k) => sitio.listen(0, '127.0.0.1', k));
const BASE = `http://127.0.0.1:${sitio.address().port}`;
const SITIO = `${BASE}/apps-web/veta-wallet/index.html`;

const API = 'https://vetawallet-1a2e38ac52b1.herokuapp.com';
const RPC = 'https://rpc.ordenglobal-rpc.com/';
const MIA = '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2';
const DESTINO = '0x2222222222222222222222222222222222222222';
const HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001';
const CLAVE_BUENA = 'laVieja123';

const tokenDe = (tv) => {
  const carga = Buffer.from(JSON.stringify({ userId: 'u1', address: MIA, role: 'user', verify: true, tv,
    exp: Math.floor(Date.now() / 1000) + 9999 })).toString('base64url');
  return `x.${carga}.y`;
};

const nav = await abrirNavegador();
const ctx = await nav.newContext({ locale: 'es-HN', viewport: { width: 430, height: 1000 } });
const pag = await ctx.newPage();
const err = [];
pag.on('pageerror', (e) => err.push(String(e)));

/* Lo que llega al «backend» y a la «cadena», para mirarlo después. */
const envios = [];
const cambios = [];
let recibosPedidos = 0;

await pag.route('**/*', async (route) => {
  const u = route.request().url();
  if (u.includes('/aetherion/')) return route.abort();           // la puerta 3D no es lo que se prueba
  if (u.startsWith(BASE)) return route.continue();
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  if (u === API + '/transaction/send') {
    let cuerpo = {};
    try { cuerpo = JSON.parse(route.request().postData() || '{}'); } catch { /* se mira vacío */ }
    envios.push({ cuerpo, auth: route.request().headers().authorization || '' });
    // La MISMA salida que transactionController.send: hash y status 'pending'.
    return json(200, { hash: HASH, from: MIA, to: cuerpo.recipientAddress, amount: cuerpo.amount,
      chain_id: cuerpo.chain_id, coin: 'ORIGEN', status: 'pending', comision: '0.01', hashComision: '0x' + 'bb'.repeat(32) });
  }
  if (u === API + '/users/changePassword') {
    let cuerpo = {};
    try { cuerpo = JSON.parse(route.request().postData() || '{}'); } catch { /* se mira vacío */ }
    cambios.push({ cuerpo, auth: route.request().headers().authorization || '' });
    if (cuerpo.currentPassword !== CLAVE_BUENA) return json(401, { code: 'CLAVE_ACTUAL', message: 'La contraseña actual no es correcta.' });
    return json(200, { message: 'Contraseña cambiada. Las demás sesiones quedaron cerradas.', token: tokenDe(3), refreshToken: 'refresco-nuevo' });
  }
  if (u.startsWith(API + '/chains/getChainsForId/')) return json(200, { provider: RPC, price: 2.1, allTransfers: [] });
  if (u === RPC) {
    let pedido = {};
    try { pedido = JSON.parse(route.request().postData() || '{}'); } catch { /* nada */ }
    const contestar = (result) => json(200, { jsonrpc: '2.0', id: pedido.id ?? 1, result });
    if (pedido.method === 'eth_getTransactionReceipt') {
      recibosPedidos++;
      // Primera vez: todavía en el aire. Después: el recibo tal como lo da Besu.
      if (recibosPedidos < 2) return contestar(null);
      return contestar({ transactionHash: HASH, blockNumber: '0x3f7a1', blockHash: '0x' + '11'.repeat(32),
        status: '0x1', gasUsed: '0x5208', cumulativeGasUsed: '0x5208', from: MIA, to: DESTINO, logs: [] });
    }
    if (pedido.method === 'eth_getBalance') return contestar('0x8ac7230489e80000');   // 10 ORIGEN
    if (pedido.method === 'eth_call') return contestar('0x' + '0'.repeat(64));
    if (pedido.method === 'eth_gasPrice') return contestar('0x5d21dba00');
    return contestar(null);
  }
  return json(200, {});
});

await pag.goto(SITIO, { waitUntil: 'domcontentloaded' });
await pag.waitForTimeout(2400);

/* Se entra por la puerta que la app tiene para las pruebas, con la cartera
   sembrada: la prueba no lee la cadena para los saldos, lee para el recibo. */
await pag.evaluate(([tk, mia]) => {
  VETA._sesion({ token: tk, refresco: 'refresco-viejo', correo: 'ana@envio.local', nombre: 'Ana Envío', direccion: mia });
  VETA._identidad({ estado: 'verificada' });
  VETA._sembrar([{ s: 'ORIGEN', n: 'ORIGEN', cant: 10, precio: 2.5, nativo: true, contrato: null, grad: ['#F8EFCF', '#96793F'], fg: '#3A2C08' }]);
  document.getElementById('app')?.classList.remove('oculto');
  for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
  VETA.vista('enviar');
}, [tokenDe(2), MIA]);
await pag.waitForTimeout(900);

console.log('\n── la revisión, antes de confirmar ──────────────────────────');
await pag.fill('#env-dir', DESTINO);
await pag.fill('#env-monto', '1.5');
await pag.fill('#env-clave', CLAVE_BUENA);
await pag.click('#env-btn');
await pag.waitForTimeout(500);
const rev = await pag.evaluate(() => {
  const dl = document.getElementById('env-revision');
  return { hay: !!dl, texto: dl ? dl.textContent.replace(/\s+/g, ' ').trim() : '',
           boton: document.querySelector('#env-btn .bc-txt')?.textContent || document.getElementById('env-btn')?.textContent,
           enviosAntes: 0 };
});
ok('tocar «Revisar» abre la ficha de revisión, no manda nada', rev.hay && envios.length === 0, rev.texto);
ok('la ficha lleva la dirección ENTERA', rev.texto.includes(DESTINO), rev.texto);
ok('el monto y su equivalente en dólares', /1[.,]50?\s*ORIGEN/.test(rev.texto) && /\$3\.75/.test(rev.texto), rev.texto);
ok('la comisión de red y la red 5550', /Comisión/.test(rev.texto) && /5550/.test(rev.texto), rev.texto);
ok('y el botón ahora dice confirmar', /Confirmar/i.test(rev.boton || ''), rev.boton);

console.log('\n── confirmar: lo que sale y lo que se ve mientras tanto ───────');
await pag.click('#env-btn');
await pag.waitForTimeout(1300);   // el palomeo tarda 620 ms; después se pinta el recibo

ok('salió UN solo POST a /transaction/send', envios.length === 1, `salieron ${envios.length}`);
const e0 = envios[0] || { cuerpo: {} };
ok('con la cadena 5550, el destinatario, el monto y la contraseña',
   e0.cuerpo.chain_id === '5550' && e0.cuerpo.recipientAddress === DESTINO && e0.cuerpo.amount === '1.5' && e0.cuerpo.password === CLAVE_BUENA,
   JSON.stringify({ ...e0.cuerpo, password: e0.cuerpo.password ? '***' : undefined }));
ok('con sello de idempotencia', typeof e0.cuerpo.idempotencyKey === 'string' && e0.cuerpo.idempotencyKey.startsWith('web-'), e0.cuerpo.idempotencyKey);
ok('y con la sesión en la cabecera', /^Bearer x\./.test(e0.auth));

const pend = await pag.evaluate(() => {
  const c = document.getElementById('env-comprobante');
  return { hay: !!c, estado: c?.dataset.estado, pill: document.getElementById('comp-estado')?.textContent.trim(),
           bloque: document.getElementById('comp-bloque')?.textContent.trim(),
           hash: document.getElementById('comp-hash')?.textContent.trim(),
           formulario: !!document.getElementById('env-dir') };
});
ok('el recibo ocupa el lugar del formulario', pend.hay && !pend.formulario);
ok('y mientras la cadena no contesta dice «enviada · esperando», no «confirmada»',
   pend.estado === 'pendiente' && /esperando/i.test(pend.pill || ''), JSON.stringify(pend));
ok('sin bloque todavía', pend.bloque === '—', pend.bloque);
ok('con el número de comprobante entero', pend.hash === HASH, pend.hash);
ok('la cadena ya recibió la pregunta por el recibo', recibosPedidos >= 1, String(recibosPedidos));

console.log('\n── la confirmación llega de la cadena ──────────────────────');
await pag.waitForTimeout(4200);   // la segunda pregunta va tres segundos después
const conf = await pag.evaluate(() => {
  const c = document.getElementById('env-comprobante');
  const a = document.getElementById('comp-scan');
  const dl = c?.querySelector('dl.datos');
  return { estado: c?.dataset.estado, pill: document.getElementById('comp-estado')?.textContent.trim(),
           bloque: document.getElementById('comp-bloque')?.textContent.trim(),
           scan: a?.getAttribute('href'), pestana: a?.getAttribute('target'),
           compartir: !!document.getElementById('comp-compartir'),
           actualizar: !!document.getElementById('comp-actualizar'),
           datos: dl ? dl.textContent.replace(/\s+/g, ' ').trim() : '' };
});
ok('pasa a «confirmada en cadena» con el bloque', conf.estado === 'confirmada' && /Confirmada/.test(conf.pill || '') && /#260001/.test(conf.pill || ''), JSON.stringify(conf));
ok('el bloque va en decimal, no en hexadecimal', conf.bloque === '#260001', conf.bloque);
ok('«Ver en OrdenScan» lleva a /tx/<hash>', conf.scan === 'https://ordenscan.com/tx/' + HASH, conf.scan);
ok('en pestaña nueva, para no sacarte de la billetera', conf.pestana === '_blank');
ok('hay «Compartir»', conf.compartir);
ok('y ya no hay «Actualizar estado»: no queda nada que esperar', !conf.actualizar);
ok('el recibo lleva destinatario, fecha, red y comprobante', conf.datos.includes(DESTINO) && /5550/.test(conf.datos) && conf.datos.includes(HASH), conf.datos);
ok('no salió un segundo envío por el camino', envios.length === 1, `salieron ${envios.length}`);

console.log('\n── cambiar la contraseña ──────────────────────────────────');
await pag.evaluate(() => VETA.vista('clave'));
await pag.waitForTimeout(500);
ok('la pantalla existe y pide actual, nueva y repetir',
   await pag.evaluate(() => !!document.getElementById('cl-actual') && !!document.getElementById('cl-nueva') && !!document.getElementById('cl-repetir')));

// Lo que se rechaza sin tocar el servidor: siete caracteres.
await pag.fill('#cl-actual', CLAVE_BUENA); await pag.fill('#cl-nueva', 'corta77'); await pag.fill('#cl-repetir', 'corta77');
await pag.click('#cl-btn');
await pag.waitForTimeout(400);
ok('siete caracteres se rechazan ANTES de llamar al servidor', cambios.length === 0 && /8 caracteres/.test(await pag.evaluate(() => document.getElementById('cl-aviso')?.textContent || '')));

// La actual mal: 401, su mensaje, y la sesión sigue.
await pag.fill('#cl-actual', 'noEsEsta99'); await pag.fill('#cl-nueva', 'unaNuevaLarga1'); await pag.fill('#cl-repetir', 'unaNuevaLarga1');
await pag.click('#cl-btn');
await pag.waitForTimeout(900);
const mal401 = await pag.evaluate(() => ({
  aviso: document.getElementById('cl-aviso')?.textContent || '',
  // `_sesion` pone la sesión en memoria sin escribirla en localStorage, así
  // que lo que dice si sigue abierta es el estado de la app, no el almacén.
  sesion: !!VETA._estado().sesion,
  enApp: !document.getElementById('app')?.classList.contains('oculto'),
}));
ok('con la actual equivocada el servidor contesta 401 y la pantalla lo dice', cambios.length === 1 && /no es correcta/.test(mal401.aviso), mal401.aviso);
ok('y NO cierra la sesión por una contraseña mal tecleada', mal401.sesion && mal401.enApp, JSON.stringify(mal401));
ok('el cuerpo lleva solo currentPassword y newPassword', cambios[0] && Object.keys(cambios[0].cuerpo).sort().join(',') === 'currentPassword,newPassword', JSON.stringify(Object.keys(cambios[0]?.cuerpo || {})));

// La buena: el token nuevo se guarda y se sigue adentro.
const tokenAntes = await pag.evaluate(() => VETA._estado().sesion?.token);
await pag.fill('#cl-actual', CLAVE_BUENA); await pag.fill('#cl-nueva', 'unaNuevaLarga1'); await pag.fill('#cl-repetir', 'unaNuevaLarga1');
await pag.click('#cl-btn');
await pag.waitForTimeout(1500);
const bien = await pag.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('veta.sesion') || '{}');
  return { token: s.token, refresco: s.refresco, titulo: document.querySelector('.cab h2')?.textContent.trim(),
           enApp: !document.getElementById('app')?.classList.contains('oculto') };
});
ok('con la buena el servidor contesta el par nuevo y la web lo guarda', cambios.length === 2 && bien.token && bien.token !== tokenAntes && bien.refresco === 'refresco-nuevo', JSON.stringify({ ...bien, token: (bien.token || '').slice(0, 12) }));
ok('el token nuevo lleva la versión de sesión nueva', (() => { try { return JSON.parse(Buffer.from((bien.token || '').split('.')[1], 'base64url')).tv === 3; } catch { return false; } })());
ok('y se sigue adentro, de vuelta en Ajustes', bien.enApp && /Ajustes/.test(bien.titulo || ''), bien.titulo);

ok('sin errores de javascript', err.length === 0, err.slice(0, 3).join(' · '));

await nav.close(); sitio.close();
console.log(mal ? `\n${mal} en rojo\n` : '\nEl envío dice la verdad de la cadena y la contraseña se cambia sin que te saque\n');
process.exit(mal ? 1 : 0);
