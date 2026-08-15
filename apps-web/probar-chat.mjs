import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'relevo-'));
const PUERTO = 8391;
const rel = spawn('python3', ['/home/user/express-js-on-vercel/infra/mensajes/servidor.py'], {
  env: { ...process.env, MENSAJES_DATOS: join(dir, 'datos.json'), MENSAJES_PUERTO: String(PUERTO) },
  stdio: 'inherit',
});
const BASE = `http://127.0.0.1:${PUERTO}`;
const post = async (ruta, cuerpo) => {
  const r = await fetch(BASE + ruta, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cuerpo) });
  return { code: r.status, d: await r.json().catch(()=>({})) };
};
await new Promise(r => setTimeout(r, 1200));

// dos vecinos en el relevo de prueba
const yo = 'jose@prueba.local', otra = 'maria@prueba.local';
const kOtra = (await post('/alta', { correo: otra, nombre: 'María Fuentes', gid: 'OG-9K2M-77', addr: '0xaaaa' })).d.llave;
await post('/enviar', { correo: otra, llave: kOtra, para: yo, texto: '¿Llegó el envío?' });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fin = () => { try { rel.kill(); } catch {} try { b.close(); } catch {} };
process.on('uncaughtException', e => { console.log('FALLO:', e.message); fin(); process.exit(1); });
process.on('unhandledRejection', e => { console.log('FALLO:', e?.message || e); fin(); process.exit(1); });
setTimeout(() => { console.log('FALLO: se pasó de tiempo'); fin(); process.exit(1); }, 120000).unref();
const err = [];
// bypassCSP: la pagina declara a que servidores puede hablar, y aqui se la
// apunta a un relevo DE MENTIRA en 127.0.0.1 que la politica —con razon—
// no deja. Se levanta solo para las pruebas; que la politica de verdad
// siga estando y siga nombrando a los nuestros lo comprueba probar.mjs.
const p = await b.newPage({ viewport: {width:1280,height:860}, deviceScaleFactor: 2, reducedMotion: 'reduce', bypassCSP: true });
p.on('pageerror', e => err.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error') err.push('consola: ' + m.text()); });
// apuntar el cliente al relevo local ANTES de que carguen los scripts
await p.addInitScript(pt => { window.OG_MENSAJES_API = 'http://127.0.0.1:' + pt; }, PUERTO);
await p.goto('http://127.0.0.1:8899/index.html');
await p.waitForTimeout(900);

await p.evaluate(correo => {
  localStorage.setItem('veta.bienvenida.v1','1');
  VETA.idioma('es');
  VETA._sembrar([{ s:'ORIGEN', n:'Origen', cant:10, precio:.4, nativo:true }]);
  VETA._sesion({ correo, nombre: 'José Enamorado', direccion: '0xbbbb' });
  VETA._identidad({ estado: 'verificada', gid: 'OG-1A2B-33' });
  VETA.ir('app');
}, yo);
await p.evaluate(() => VETA.vista('chat'));
await p.waitForTimeout(1500);

console.log('conversaciones:', await p.evaluate(() => [...document.querySelectorAll('.cha-fila b')].map(x=>x.textContent.trim())));
await p.screenshot({ path: 'chat-lista.png' });

// abrir el hilo y contestar
await p.evaluate(o => VETA.chatAbrir(o), otra);
await p.waitForTimeout(900);
console.log('mensajes del hilo:', await p.evaluate(() => [...document.querySelectorAll('.cha-globo p')].map(x=>x.textContent)));
await p.fill('#chat-txt', 'Sí, ya salió. Mirá el comprobante.');
await p.click('.cha-manda');
await p.waitForTimeout(900);
console.log('tras contestar:', await p.evaluate(() => [...document.querySelectorAll('.cha-globo p')].map(x=>x.textContent)));

// una tarjeta de pago, como la deja la wallet tras confirmar en la cadena
await post('/pago', { correo: otra, llave: kOtra, para: yo, monto: '12.5', moneda: 'ORIGEN',
                      hash: '0x'+'ab'.repeat(32), nota: 'Por el pedido' });
await p.evaluate(() => VETA.chatAbrir('maria@prueba.local'));
await p.waitForTimeout(900);
console.log('tarjeta de pago:', await p.evaluate(() => document.querySelector('.cha-pago b')?.textContent),
  '| enlace:', await p.evaluate(() => document.querySelector('.cha-pago a')?.getAttribute('href')?.slice(0,34)));
await p.screenshot({ path: 'chat-hilo.png' });

// buscar gente por Genesis ID
await p.evaluate(() => VETA.chatBuscar('og-9k'));
await p.waitForTimeout(900);
console.log('buscar por GID:', await p.evaluate(() => [...document.querySelectorAll('.cha-fila small')].map(x=>x.textContent.trim())));

// crear un grupo
await p.evaluate(() => { window.prompt = () => 'Los del mercado'; });
await p.evaluate(() => VETA.chatGrupo());
await p.waitForTimeout(1200);
console.log('grupo:', await p.evaluate(() => document.querySelector('.cha-quien b')?.textContent));

// la puerta del Genesis ID
await p.evaluate(() => { VETA._identidad({ estado: 'iniciada' }); VETA.vista('billetera'); VETA.vista('chat'); });
await p.waitForTimeout(900);
console.log('sin Genesis ID aprobado:', await p.evaluate(() => document.querySelector('.cha-puerta h3')?.textContent));
await p.screenshot({ path: 'chat-puerta.png' });

// movil: la lista y el hilo son dos pantallas
const m = await b.newPage({ viewport: {width:390,height:844}, deviceScaleFactor: 2, reducedMotion: 'reduce', bypassCSP: true });
await m.addInitScript(pt => { window.OG_MENSAJES_API = 'http://127.0.0.1:' + pt; }, PUERTO);
await m.goto('http://127.0.0.1:8899/index.html');
await m.waitForTimeout(800);
await m.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1','1'); VETA.idioma('es');
  VETA._sembrar([{ s:'ORIGEN', n:'Origen', cant:10, precio:.4, nativo:true }]);
  VETA._sesion({ correo: 'carlos@prueba.local', nombre: 'Carlos', direccion: '0xcccc' });
  VETA._identidad({ estado: 'verificada', gid: 'OG-7C8D-11' });
  VETA.ir('app'); VETA.vista('chat');
});
// Carlos todavia no habla con nadie: se busca a Maria y se abre el hilo
await m.waitForTimeout(1200);
await m.evaluate(() => VETA.chatBuscar('maria'));
await m.waitForTimeout(900);
await m.waitForTimeout(1500);
await m.screenshot({ path: 'chat-movil-lista.png' });
await m.click('.cha-fila');
await m.waitForTimeout(900);
console.log('movil, lista oculta con el hilo abierto:',
  await m.evaluate(() => getComputedStyle(document.querySelector('.chat-lista')).display === 'none'));
await m.screenshot({ path: 'chat-movil-hilo.png' });

console.log(err.length ? 'ERRORES:\n' + err.join('\n') : 'sin errores de pagina');
await b.close();
rel.kill();
