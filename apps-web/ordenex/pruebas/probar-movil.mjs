/* La casa de cambio EN UN TELEFONO, medida a 360 px.
 *
 *   node apps-web/ordenex/pruebas/probar-movil.mjs
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * Las demas suites de Ordenex se corren a 1280 px, que es donde todo entra.
 * Y a 360 px la casa tenia tres agujeros que ninguna vio:
 *
 *   1. la tabla de «mis ordenes abiertas» mide 443 px de ancho, el `body`
 *      lleva `overflow-x:hidden` —que RECORTA en vez de dejar desplazar— y la
 *      columna que quedaba fuera del borde era la del boton «Cancelar». Una
 *      orden que ya reservo saldo y no se puede cancelar es dinero atrapado,
 *      no un defecto de maquetacion;
 *   2. la tabla de mercados se salia por lo mismo;
 *   3. `.riel-pie` se escondia por debajo de 900 px, y ahi viven SALIR y el
 *      cambio de idioma: en un telefono no habia manera de cerrar sesion.
 *
 * Asi que esto no comprueba que la pantalla «se vea bien»: comprueba que se
 * pueda LLEGAR con el dedo a lo que libera dinero y a lo que cierra la sesion,
 * y mide los numeros para que la proxima regresion se lea como un numero y no
 * como una impresion.
 *
 * ONX_RAIZ apunta a otra copia de la web (por ejemplo una sacada de git) para
 * poder medir el antes y el despues con la MISMA vara.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = process.env.ONX_RAIZ ? resolve(process.env.ONX_RAIZ) : join(AQUI, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2', '.woff': 'font/woff' };

// El ancho del telefono mas angosto que sigue en la calle. Si entra aqui,
// entra en todos.
const ANCHO = 360;

const U = 10n ** 18n;
const wei = n => (BigInt(n) * U).toString();
const TOKEN_SSO = 'token-sso-fingido-111';
const JWT = 'jwt-fingido-111';

const MERCADOS = [
  { mercado: 'AUKA-ORIGEN', ultimo: wei(111), cambio24h: 1.11, vol24h: wei(222) },
  { mercado: 'AGKA-ORIGEN', ultimo: wei(222), cambio24h: -2.22, vol24h: wei(111) },
];
const LIBRO = {
  compras: [[wei(110), wei(222)], [wei(109), wei(111)]],
  ventas: [[wei(112), wei(111)], [wei(113), wei(222)]],
};

// ── el servidor: la web y un API fingido en el MISMO origen ────────────────
const json = (r, codigo, obj) => {
  r.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  r.end(JSON.stringify(obj));
};
const cuerpoDe = q => new Promise(res => {
  let t = '';
  q.on('data', d => { t += d; });
  q.on('end', () => { try { res(JSON.parse(t || '{}')); } catch { res({}); } });
});

const ordenes = [];

async function api(q, r, ruta) {
  const un = ruta.match(/^\/mercados\/([^/]+)\/(libro|velas|tratos)$/);
  if (q.method === 'GET' && ruta === '/mercados') return json(r, 200, MERCADOS);
  if (q.method === 'GET' && ruta === '/tarifas') return json(r, 200, { comisionPpm: 2500, sobre: 'recibido' });
  if (q.method === 'GET' && un) {
    const vivo = MERCADOS.some(m => m.mercado === un[1] && m.ultimo != null);
    if (un[2] === 'libro') return json(r, 200, vivo ? LIBRO : { compras: [], ventas: [] });
    return json(r, 200, []);
  }
  if (q.method === 'GET' && /^\/mercados\/[^/]+\/referencia$/.test(ruta)) {
    return json(r, 404, { error: 'Este activo no tiene referencia.', codigo: 'SIN_REFERENCIA' });
  }
  if (q.method === 'GET' && /^\/precio-declarado\//.test(ruta)) {
    return json(r, 404, { error: 'No declarable.', codigo: 'NO_DECLARABLE' });
  }
  if (q.method === 'POST' && ruta === '/auth/sso') {
    const { token } = await cuerpoDe(q);
    if (token !== TOKEN_SSO) return json(r, 401, { error: 'No vale.', codigo: 'SSO_INVALIDO' });
    // `verificada: true` porque esta suite mide geometria, no idoneidad: la
    // puerta de ONDK tiene su propia prueba en probar-ordenex.mjs.
    return json(r, 200, { token: JWT, refreshToken: 'refresco-222',
      usuario: { gid: 'GID-FINGIDO-111', nombre: 'Fingido', verificada: true } });
  }
  const borra = ruta.match(/^\/ordenes\/([^/]+)$/);
  const guardada = ['/portafolio', '/movimientos', '/ordenes', '/fiat/solicitudes'].includes(ruta) || !!borra;
  if (!guardada) return null;
  if ((q.headers.authorization || '') !== 'Bearer ' + JWT) {
    return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' });
  }
  if (q.method === 'GET' && ruta === '/portafolio') {
    return json(r, 200, {
      cuentas: [{ activo: 'ORIGEN', disponible: wei(999), reservado: '0' },
                { activo: 'AUKA', disponible: wei(222), reservado: '0' }],
      direccionDeposito: '0x' + 'a111'.repeat(10),
    });
  }
  if (q.method === 'GET' && ruta === '/ordenes') return json(r, 200, ordenes);
  if (q.method === 'GET' && (ruta === '/movimientos' || ruta === '/fiat/solicitudes')) return json(r, 200, []);
  if (q.method === 'POST' && ruta === '/ordenes') {
    const o = await cuerpoDe(q);
    const orden = { id: 'orden-111', mercado: o.mercado, lado: o.lado, tipo: o.tipo,
      precio: o.precio ?? null, cantidad: o.cantidad, resta: o.cantidad,
      estado: 'abierta', en: new Date().toISOString() };
    ordenes.push(orden);
    return json(r, 200, orden);
  }
  if (q.method === 'DELETE' && borra) {
    const i = ordenes.findIndex(o => o.id === decodeURIComponent(borra[1]));
    if (i < 0) return json(r, 404, { error: 'No existe.', codigo: 'ORDEN_NO_EXISTE' });
    return json(r, 200, { ...ordenes.splice(i, 1)[0], estado: 'cancelada' });
  }
  return json(r, 405, { error: 'Fuera del contrato.', codigo: 'METODO_INVALIDO' });
}

const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0]);
  if (await api(q, r, ruta) !== null) return;
  try {
    const p = join(RAIZ, ruta.replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise(res => sv.listen(0, res));
const ORIGEN = `http://127.0.0.1:${sv.address().port}`;

// ── decir/comprobar, como toda prueba de la casa ───────────────────────────
let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 150)}`);
};

const nav = await chromium.launch({
  executablePath: process.env.ONX_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
/* Un telefono de verdad y no una ventana angosta: con `hasTouch` el navegador
   aplica las reglas de puntero grueso, que es donde vive la mitad de esta
   clase de fallos. */
const p = await nav.newPage({
  viewport: { width: ANCHO, height: 740 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true,
});
await p.addInitScript(o => { window.ONX_API = o; window.ONX_WALLET = o; }, ORIGEN);

/* La medida que resume todo el asunto: ¿algo de esta pantalla se sale de los
   360 px? Se pregunta al documento y a CADA elemento, porque el `body` lleva
   `overflow-x:hidden` y un desbordamiento recortado no mueve el scrollWidth
   del documento: se lo traga en silencio, que es justo lo que pasaba. */
const desbordes = () => p.evaluate((ancho) => {
  const nombre = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const fuera = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (r.right <= ancho + 1) return;

    /* Desbordar no es el pecado: el pecado es desbordar SIN SALIDA. Se sube
       por los padres hasta encontrar quién manda sobre lo que sobra:
         · un contenedor que desplaza (overflow-x auto/scroll) → se llega con
           el dedo, y ese es justamente el arreglo;
         · la cinta de precios, que es un carrusel infinito: su desborde ES la
           pieza, y recortarlo es lo que se quiere;
         · cualquier otro recorte, o ninguno → lo que sobra no se alcanza. */
    let padre = el.parentElement, veredicto = 'suelto';
    while (padre && padre !== document.body) {
      if (padre.classList.contains('cinta')) { veredicto = 'cinta'; break; }
      const s = getComputedStyle(padre);
      if (/auto|scroll/.test(s.overflowX)) { veredicto = 'riel'; break; }
      if (/hidden|clip/.test(s.overflowX)) { veredicto = 'recortado'; break; }
      padre = padre.parentElement;
    }
    if (veredicto === 'riel' || veredicto === 'cinta') return;
    fuera.push({ que: nombre(el), derecha: Math.round(r.right), como: veredicto });
  });
  return { documento: document.documentElement.scrollWidth, fuera: fuera.slice(0, 6) };
}, ANCHO);

console.log(`\n════ ORDENEX A ${ANCHO} px ${'═'.repeat(30)}`);
console.log(`     web: ${RAIZ}`);

await p.goto(`${ORIGEN}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
await p.evaluate(() => ONX.idioma('es'));
await p.waitForTimeout(400);

// ── 1 · la portada ────────────────────────────────────────────────────────
console.log('\n── la portada ────────────────────────────────────────────────');
{
  const d = await desbordes();
  decir(d.fuera.length === 0, 'nada se sale del ancho del teléfono',
    d.fuera.length ? JSON.stringify(d.fuera) : `documento: ${d.documento}px`);
}

// ── 2 · la lista de mercados ──────────────────────────────────────────────
console.log('\n── la lista de mercados ──────────────────────────────────────');
{
  await p.click('button[data-t="pt.ver"]');
  await p.waitForTimeout(900);
  const d = await desbordes();
  decir(d.fuera.length === 0, 'la tabla de mercados no se sale: desliza dentro de su riel',
    d.fuera.length ? JSON.stringify(d.fuera) : `documento: ${d.documento}px`);
}

// ── 3 · salir y cambiar de idioma existen en el teléfono ──────────────────
console.log('\n── salir y el idioma, a 360 px ───────────────────────────────');
{
  const m = await p.evaluate(() => {
    const vis = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const salir = [...document.querySelectorAll('#app button[data-t="nav.salir"]')].find(vis) || null;
    const es = [...document.querySelectorAll('#app .idiomas button[data-lang="en"]')].find(vis) || null;
    const caja = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; };
    return { salir: salir ? caja(salir) : null, idioma: es ? caja(es) : null };
  });
  decir(!!m.salir, 'el botón de SALIR se ve dentro de la aplicación', JSON.stringify(m.salir));
  decir(!!m.idioma, 'y el cambio de idioma también', JSON.stringify(m.idioma));

  if (m.idioma) {
    await p.click('#app .idiomas button[data-lang="en"]');
    await p.waitForTimeout(500);
    const en = await p.evaluate(() => document.documentElement.lang);
    decir(en === 'en', 'y cambiarlo desde el teléfono funciona de verdad', `lang=${en}`);
    await p.evaluate(() => ONX.idioma('es'));
    await p.waitForTimeout(400);
  }
}

// ── 4 · LA PRUEBA CARA: cancelar una orden desde el teléfono ──────────────
console.log('\n── cancelar una orden, con el dedo ───────────────────────────');
{
  // El canje se recoge al arrancar la página, como en la vuelta de verdad
  // desde la billetera: el token llega en el hash y la casa lo canjea sola.
  await p.goto('about:blank');
  await p.goto(`${ORIGEN}/index.html#sso=${TOKEN_SSO}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await p.waitForTimeout(1500);

  await p.fill('#vm-precio', '110');
  await p.fill('#vm-cant', '2');
  await p.click('#vm-enviar');
  await p.waitForTimeout(1200);

  const antes = await p.evaluate(() => {
    const b = document.querySelector('#vm-ordenes button');
    if (!b) return null;
    const t = document.querySelector('#vm-ordenes')?.closest('table');
    const r = b.getBoundingClientRect();
    return { derechaBoton: Math.round(r.right), anchoTabla: Math.round(t?.getBoundingClientRect().width || 0),
             ventana: window.innerWidth };
  });
  decir(!!antes, 'la orden colocada aparece en «mis órdenes abiertas»', JSON.stringify(antes));

  if (antes) {
    console.log(`           medida: tabla ${antes.anchoTabla}px · «Cancelar» termina en ${antes.derechaBoton}px de ${antes.ventana}px`);
    /* La comprobacion no es «el boton entra en la pantalla»: una tabla de
       cinco columnas en 360 px no entra y no tiene por que. Es que se pueda
       LLEGAR — o sea, que su contenedor desplace hasta el. */
    const alcanzable = await p.evaluate(() => {
      const b = document.querySelector('#vm-ordenes button');
      if (!b) return { ok: false, por: 'no hay botón' };
      let padre = b.parentElement, riel = null;
      while (padre && padre !== document.body) {
        const s = getComputedStyle(padre);
        if (/auto|scroll/.test(s.overflowX)) { riel = padre; break; }
        padre = padre.parentElement;
      }
      const r0 = b.getBoundingClientRect();
      if (r0.right <= window.innerWidth) return { ok: true, por: 'ya estaba a la vista', riel: !!riel };
      if (!riel) return { ok: false, por: 'se sale de la pantalla y ningún contenedor desplaza' };
      riel.scrollLeft = riel.scrollWidth;
      const r1 = b.getBoundingClientRect();
      return { ok: r1.right <= window.innerWidth + 1 && r1.left >= 0,
               por: `desplazando el riel: ${Math.round(r0.right)} → ${Math.round(r1.right)}`, riel: true };
    });
    decir(alcanzable.ok, 'se puede LLEGAR al botón «Cancelar» con el dedo', alcanzable.por);

    // Y que llegar sirva: se toca y la orden se va de verdad.
    await p.locator('#vm-ordenes button').first().scrollIntoViewIfNeeded();
    await p.locator('#vm-ordenes button').first().click();
    await p.waitForTimeout(1200);
    const quedan = await p.evaluate(() => document.querySelectorAll('#vm-ordenes button').length);
    decir(quedan === 0, 'y tocarlo cancela la orden: el saldo reservado vuelve', `quedan ${quedan}`);
  }

  const d = await desbordes();
  decir(d.fuera.length === 0, 'y en la sala tampoco se sale nada del ancho',
    d.fuera.length ? JSON.stringify(d.fuera) : `documento: ${d.documento}px`);
}

console.log(`\n${malas === 0 ? 'todo en pie.' : malas + ' comprobación(es) fallaron'}\n`);
await nav.close();
sv.close();
process.exit(malas === 0 ? 0 : 1);
