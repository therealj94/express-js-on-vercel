/* LAS DOS CASAS QUE TODAVÍA NO ABREN.
 *
 *   node pruebas/casas-nuevas.mjs      (sirve la carpeta en 8887 él solo)
 *
 * MINAS y DBNX están en el cielo antes de existir, y eso es una decisión, no
 * un descuido: son las dos piezas que contestan las preguntas que cualquiera
 * hace primero —qué respalda esto, y bajo qué reglas— y un ecosistema se
 * entiende por su forma entera.
 *
 * Pero una casa que se ve y no lleva a ningún lado es peor que no ponerla. Lo
 * que se comprueba aquí es que las dos existan en los DOS sitios donde vive el
 * ecosistema —la constelación de la casa y la galaxia 3D—, que se puedan
 * tocar, que al tocarlas digan qué son y admitan que falta, y que no se cuelen
 * en sitios donde una casa cerrada no pinta nada.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8887;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--disable-renderer-backgrounding'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'n1', userId: 'n1', address: '0x' + 'a'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 420, height: 820 }, locale: 'es',
  hasTouch: true, isMobile: true });
const pag = await ctx.newPage();
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));
await pag.addInitScript(`localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.musica','no');
  localStorage.setItem('veta.genesis.visto','1');`);
await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'n@x.com', name: 'José' } } }));
await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForFunction(() => !document.getElementById('velo-og'), null, { timeout: 20000 }).catch(() => {});
const puerta = await pag.$('#bienvenida .btn-oro');
if (puerta && await puerta.isVisible()) await puerta.click();
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'n@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });

const CASAS = [
  { id: 'minas', titulo: 'MINAS', dice: /metales preciosos/i },
  { id: 'dbnx', titulo: 'DBNX', dice: /regulaci|tokeniza/i },
];

console.log('\n── están construidas en el cielo ───────────────────────────');
/* EL INICIO ES LA GALAXIA. Las casas no son botones de HTML: son planetas de
   la escena 3D. Así que la pregunta no es «¿está el botón?» sino «¿se
   construyó el mundo?» — que son cosas distintas y solo la segunda importa.
   Una casa puede estar declarada en la lista y no llegar nunca a la escena, y
   desde fuera eso se ve igual que todo bien hasta que alguien la busca. */
await pag.waitForFunction(() => (window.__AE_CASAS_VIVAS?.() || []).length > 4,
  null, { timeout: 45000 });
const vivas = await pag.evaluate(() => window.__AE_CASAS_VIVAS());
ok('el cielo está armado', vivas.length > 4, `${vivas.length} casas: ${vivas.join(' ')}`);
for (const c of CASAS) {
  ok(`${c.titulo} es un mundo de verdad en la escena`, vivas.includes(c.id));
}

console.log('\n── tocarlas dice qué son y admite que falta ─────────────────');
for (const c of CASAS) {
  await pag.evaluate((id) => VETA.nuAbrir(id), c.id);
  await pag.waitForSelector('.pronto-ficha', { timeout: 6000 }).catch(() => {});
  const ficha = await pag.evaluate(() => {
    const el = document.querySelector('.pronto-ficha');
    if (!el) return null;
    return {
      titulo: el.querySelector('h3')?.textContent || '',
      que: el.querySelector('.pronto-que')?.textContent || '',
      p: el.querySelector('.pronto-p')?.textContent || '',
      sello: el.querySelector('.pronto-sello')?.textContent || '',
      orbe: !!el.querySelector('.pronto-orbe svg'),
    };
  });
  if (!ficha) { ok(`${c.titulo} abre su ficha`, false, 'no salió'); continue; }
  ok(`${c.titulo} abre su ficha`, true);
  ok(`  con su nombre`, ficha.titulo.includes(c.titulo), ficha.titulo);
  ok(`  diciendo de qué va`, c.dice.test(ficha.que + ' ' + ficha.p),
     ficha.que.slice(0, 46));
  /* Y ADMITE QUE FALTA, sin prometer fecha. Una fecha que no se cumple cuesta
     más caro que la espera. */
  ok(`  admitiendo que todavía no está`, /pronto|soon/i.test(ficha.p + ficha.sello));
  ok(`  sin prometer una fecha`, !/\b(20\d\d|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(ficha.p),
     ficha.p.slice(0, 40));
  ok(`  y con su planeta pintado`, ficha.orbe);
  await pag.evaluate(() => document.querySelector('.puerta-afuera')?.remove());
}

console.log('\n── y están en la galaxia, con su propio mundo ───────────────');
{
  await pag.waitForFunction(() => Array.isArray(window.__AE_APPS) && !!window.__AE_MIRAR,
    null, { timeout: 45000 });
  const enCielo = await pag.evaluate(() => {
    const w = window;
    return (w.__AE_CASAS?.() || []).length ? 'puente' : null;
  });
  void enCielo;
  for (const c of CASAS) {
    ok(`${c.titulo} es una casa del cielo`,
       await pag.evaluate((id) => (window.__AE_APPS || []).some((a) => a.key === id), c.id));
  }
  /* CADA MUNDO CON SU CARA. Dos planetas nuevos pintados igual que otros dos
     que ya estaban serían dos bolas más; lo que hace que una casa se recuerde
     es que su mundo sea de una clase que no se repite. */
  const naturas = await pag.evaluate(() => window.__AE_NATURAS?.() || null);
  if (naturas) {
    ok('MINAS tiene superficie propia', naturas.minas === 'veta', String(naturas.minas));
    ok('DBNX también', naturas.dbnx === 'reticula', String(naturas.dbnx));
    const todas = Object.values(naturas);
    ok('y ninguna clase de mundo se repite', new Set(todas).size === todas.length,
       `${new Set(todas).size} clases para ${todas.length} casas`);
  }
}

console.log('\n── una casa cerrada no se cuela donde no debe ───────────────');
{
  /* No tiene que aparecer como destino para enviar dinero ni como una casa
     que abre: sigue cerrada, y el resto de la app tiene que tratarla así. */
  const abrio = await pag.evaluate(async () => {
    const antes = location.hash;
    VETA.nuAbrir('minas');
    await new Promise((r) => setTimeout(r, 700));
    const marco = !!document.querySelector('.marco-hoja');
    document.querySelector('.puerta-afuera')?.remove();
    return { cambio: location.hash !== antes, marco };
  });
  ok('tocarla no abre ningún marco', !abrio.marco);
  ok('ni cambia de pantalla', !abrio.cambio);
}


console.log('\n── ningún rótulo dice una palabra que no se escribió ────────');
{
  /* ══ EL «NULL» EN EL CIELO ═══════════════════════════════════════════════
     Pasó: apareció la palabra NULL en letras de oro junto a un planeta. No se
     lee como un dato que falta — se lee como que la casa está rota, y en una
     presentación eso es lo único que la gente recuerda.
     Y aparece SOLO, sin que nadie lo escriba: basta un mundo nuevo al que
     todavía no se le puso nombre, o un idioma al que le falta una entrada, o
     una wallet de otra versión mandando `name: null`. Así que ahora un mundo
     sin nombre se queda sin rótulo —que es lo honesto y no se nota— y esto lo
     vigila mundo por mundo. */
  const rotulos = await pag.evaluate(() => window.__AE_ROTULO_TXT || null);
  ok('se pueden leer los rótulos del cielo', !!rotulos,
     rotulos ? `${Object.keys(rotulos).length} mundos` : 'sin puente');
  if (rotulos) {
    const malos = Object.entries(rotulos)
      .filter(([, v]) => typeof v !== 'string' || !v.trim()
        || /^(null|undefined|NaN)$/i.test(v.trim()))
      .map(([k, v]) => `${k}=${v}`);
    ok('y todos dicen algo de verdad', malos.length === 0, malos.join(' '));
    ok('con los diez mundos y Ajustes nombrados', Object.keys(rotulos).length >= 11,
       Object.values(rotulos).join(' · '));
  }
}

ok('sin errores de página en todo el recorrido', pag.errores.length === 0,
   pag.errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
