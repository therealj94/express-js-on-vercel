/* NAVEGADOR LOCAL (Playwright), de respaldo del ojo.
 *
 * El ojo (ULTRON_OJO_URL) sigue siendo la vía principal: vive en otra
 * máquina y no come RAM del dyno. Cuando no está, o cuando una página
 * llega vacía por fetch, este módulo abre Chromium ACÁ y lee de verdad.
 *
 * No se instala el navegador en cada deploy: `npm run instalar-navegador`
 * (o ULTRON_PLAYWRIGHT=1 en el build) baja Chromium una vez.
 * Si no hay binario, se dice claro — no se finge una lectura.
 */

const PLAZO_MS = Number(process.env.ULTRON_NAV_PLAZO_MS || 35_000);

let _pw = null;
let _motivo = 'sin probar';

function cargar() {
  if (_pw !== null) return _pw;
  try {
    _pw = require('playwright');
    _motivo = 'playwright cargado';
    return _pw;
  } catch (e) {
    _pw = false;
    _motivo = 'playwright no está en node_modules (npm i playwright && npx playwright install chromium)';
    return false;
  }
}

function hay() {
  return !!cargar();
}

function estado() {
  cargar();
  return { hay: !!_pw, motivo: _motivo };
}

function urlOk(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/.test(u.hostname)) return null;
  return u.toString();
}

async function conPagina(fn, { ancho = 1280, alto = 900 } = {}) {
  const pw = cargar();
  if (!pw) {
    const err = new Error(_motivo);
    err.codigo = 'SIN_PLAYWRIGHT';
    throw err;
  }
  let browser;
  try {
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  } catch (e) {
    const err = new Error(`Chromium no arrancó: ${String(e.message || e).slice(0, 180)}. Corré: npx playwright install chromium`);
    err.codigo = 'SIN_CHROMIUM';
    throw err;
  }
  const ctx = await browser.newContext({
    viewport: { width: ancho, height: alto },
    userAgent: 'Mozilla/5.0 ULTRON-NAV/1',
    locale: 'es-HN',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(PLAZO_MS);
  try {
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
  }
}

function recortar(t, n = 8000) {
  t = String(t || '').replace(/\s+\n/g, '\n').trim();
  return t.length <= n ? t : t.slice(0, n - 16) + '\n[…recortado]';
}

async function leer({ url, esperar = null }) {
  const u = urlOk(url);
  if (!u) return { ok: false, texto: 'URL inválida o privada.', url: String(url || '') };
  return conPagina(async (page) => {
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: PLAZO_MS });
    if (esperar) await page.waitForSelector(String(esperar), { timeout: Math.min(12_000, PLAZO_MS) }).catch(() => {});
    else await page.waitForTimeout(800);
    const titulo = await page.title().catch(() => '');
    const texto = await page.evaluate(() => {
      const basura = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG']);
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      const out = [];
      let n;
      while ((n = walker.nextNode())) {
        if (basura.has(n.parentElement?.tagName)) continue;
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length > 1) out.push(t);
      }
      return out.join('\n');
    });
    return { ok: true, url: u, titulo, texto: recortar(texto, 10_000) };
  }, {});
}

async function foto({ url, esperar = null, completa = false, ancho = 1280, alto = 900 }) {
  const u = urlOk(url);
  if (!u) return { ok: false, error: 'URL inválida o privada.' };
  return conPagina(async (page) => {
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: PLAZO_MS });
    if (esperar) await page.waitForSelector(String(esperar), { timeout: Math.min(12_000, PLAZO_MS) }).catch(() => {});
    else await page.waitForTimeout(600);
    const buf = await page.screenshot({ fullPage: !!completa, type: 'png' });
    const titulo = await page.title().catch(() => '');
    return { ok: true, url: u, titulo, png: buf };
  }, { ancho, alto });
}

async function guion({ pasos = [], ancho = 1280, alto = 900 }) {
  const diario = [];
  let ultimoTexto = '';
  let ultimaFoto = null;
  await conPagina(async (page) => {
    for (let i = 0; i < pasos.length; i++) {
      const p = pasos[i] || {};
      const tipo = String(p.tipo || p.hacer || '').toLowerCase();
      const que = String(p.que || p.selector || p.url || '');
      try {
        if (tipo === 'ir') {
          const u = urlOk(p.url || p.que);
          if (!u) throw new Error('URL inválida');
          await page.goto(u, { waitUntil: 'domcontentloaded', timeout: PLAZO_MS });
        } else if (tipo === 'esperar') {
          await page.waitForSelector(que, { timeout: Math.min(15_000, PLAZO_MS) });
        } else if (tipo === 'escribir') {
          const valor = p.secreto != null ? String(p.secreto) : String(p.valor || p.texto || '');
          await page.fill(que, valor);
        } else if (tipo === 'tocar' || tipo === 'click') {
          await page.click(que);
        } else if (tipo === 'leer') {
          ultimoTexto = recortar(await page.innerText(que || 'body'), 8_000);
        } else if (tipo === 'foto') {
          ultimaFoto = await page.screenshot({ type: 'png', fullPage: !!p.completa });
        } else {
          throw new Error(`paso desconocido: ${tipo}`);
        }
        diario.push({ ok: true, paso: i + 1, tipo, que: tipo === 'escribir' ? que : que.slice(0, 80) });
      } catch (e) {
        diario.push({ ok: false, paso: i + 1, tipo, que: que.slice(0, 80), porQue: String(e.message || e).slice(0, 160) });
        break;
      }
    }
    if (!ultimoTexto) {
      ultimoTexto = recortar(await page.innerText('body').catch(() => ''), 6_000);
    }
  }, { ancho, alto });
  const ok = diario.length > 0 && diario.every((d) => d.ok);
  return { ok, diario, texto: ultimoTexto, png: ultimaFoto };
}

function comoTexto(visto) {
  if (!visto) return 'El navegador no devolvió nada.';
  if (visto.error) return visto.error;
  if (visto.texto != null) {
    const tit = visto.titulo ? `${visto.titulo}\n` : '';
    const url = visto.url ? `${visto.url}\n` : '';
    return `${url}${tit}${visto.texto || '(sin texto visible)'}`.trim();
  }
  return JSON.stringify({ ok: visto.ok, diario: visto.diario });
}

module.exports = { hay, estado, leer, foto, guion, comoTexto, urlOk };
