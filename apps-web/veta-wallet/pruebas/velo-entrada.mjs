/* EL VELO DE APERTURA: la frase se lee ENTERA antes de irse.
 *
 *   node pruebas/velo-entrada.mjs
 *
 * Nació de un fallo que José vio y que era exactamente lo que decía: «sale
 * ORDEN GLOBAL, el futuro es orden, se traba, solo sale la El y se cierra».
 * La frase entra palabra por palabra (unos dos segundos) y quien ya tenía
 * sesión veía el velo irse a los SETECIENTOS milisegundos: se leía «El» y se
 * cerraba. Leer media palabra es peor que no poner frase.
 *
 * Aquí se exige que, en los dos caminos —con sesión y sin ella—, TODAS las
 * palabras estén completamente visibles antes de que el velo empiece a irse.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const PUERTO = 8830;
spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', new URL('..', import.meta.url).pathname], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

/* Se vigila el velo DESDE DENTRO de la página: cuántas palabras estaban del
   todo visibles en el instante en que empezó a irse. Medir desde fuera con un
   reloj no sirve — es justo el reloj lo que estaba mal. */
async function mirarVelo(ctx, conSesion) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', (e) => p.errores.push(String(e)));
  await p.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
  await p.addInitScript((hay) => {
    if (hay) {
      const tk = btoa(JSON.stringify({ sub: 'p1', exp: Math.floor(Date.now() / 1000) + 9999 }));
      localStorage.setItem('veta.sesion', JSON.stringify({
        token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'Medardo',
        direccion: '0x' + '1'.repeat(40),
      }));
    }
    /* El vigía se instala ANTES de que corra la app: cuando el velo se marca
       como «yendo», se anota qué palabras estaban enteras. */
    window.__veloParte = null;
    const mirar = () => {
      const velo = document.getElementById('velo-og');
      if (!velo) return;
      const obs = new MutationObserver(() => {
        if (!velo.classList.contains('yendo') || window.__veloParte) return;
        const spans = [...velo.querySelectorAll('.velo-frase span')];
        window.__veloParte = {
          total: spans.length,
          enteras: spans.filter((s) => +getComputedStyle(s).opacity > 0.92).length,
          texto: spans.map((s) => s.textContent).join(' '),
        };
      });
      obs.observe(velo, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mirar);
    else mirar();
  }, conSesion);
  await p.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  /* Se espera al MECANISMO: a que el velo se haya ido de verdad. */
  await p.waitForFunction(() => !!window.__veloParte || !document.getElementById('velo-og'),
    null, { timeout: 15000 }).catch(() => {});
  const parte = await p.evaluate(() => window.__veloParte);
  return { p, parte };
}

console.log('\n── quien llega por primera vez ──────────────────────────────');
{
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
  const { p, parte } = await mirarVelo(ctx, false);
  ok('el velo enseña la frase de la casa', !!parte && parte.total >= 3,
     parte ? parte.texto : 'no se vio el velo');
  ok('y se va con la frase ENTERA', !!parte && parte.enteras === parte.total,
     parte ? `${parte.enteras}/${parte.total} palabras` : '');
  ok('sin errores de página', p.errores.length === 0, p.errores.slice(0, 1).join(''));
  await ctx.close();
}

console.log('\n── quien vuelve, con su sesión puesta ───────────────────────');
{
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
  const { p, parte } = await mirarVelo(ctx, true);
  ok('también la ve entera', !!parte && parte.enteras === parte.total,
     parte ? `${parte.enteras}/${parte.total} · ${parte.texto}` : 'no se vio el velo');
  ok('sin errores de página', p.errores.length === 0, p.errores.slice(0, 1).join(''));
  await ctx.close();
}

console.log('\n── en el teléfono, y en inglés ──────────────────────────────');
{
  const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'en-US' });
  const { p, parte } = await mirarVelo(ctx, true);
  ok('la frase entera también en el teléfono', !!parte && parte.enteras === parte.total,
     parte ? `${parte.enteras}/${parte.total} · ${parte.texto}` : 'no se vio el velo');
  ok('sin errores de página', p.errores.length === 0, p.errores.slice(0, 1).join(''));
  await ctx.close();
}

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
