/**
 * EL OJO — el navegador de ULTRON, que vive en otra casa.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * `leer_pagina` es un `fetch`: trae el HTML que manda el servidor y nada más.
 * Todas las casas de Orden Global se dibujan enteras con JavaScript, así que
 * por ahí ULTRON no ve nada. Medido el 7-sep: `ordenexchange.link` devuelve 78
 * caracteres de texto. Con el ojo son 970, con los cinco mercados y sus
 * precios dentro.
 *
 * El navegador NO puede vivir aquí: este dyno es Basic —512 MB— y Chromium
 * necesita entre 200 y 400 por pestaña. La primera página abierta aquí
 * adentro mataría a ULTRON. Vive en `infra/ultron-ojo`, en su propio dyno, y
 * esto es solo el teléfono para llamarlo.
 *
 * ── SI EL OJO NO ESTÁ ───────────────────────────────────────────────────────
 * Se dice. No se finge que la página se leyó, y no se devuelve la cáscara
 * vacía como si fuera la pantalla: contestar sobre una página que no se vio es
 * exactamente el fallo que el ojo vino a arreglar.
 */

const boveda = require('./boveda');

const PLAZO_MS = Number(process.env.ULTRON_OJO_PLAZO_MS || 45_000);

/** La dirección del ojo. Sin ella, no hay ojo y se dice. */
const donde = () => String(process.env.ULTRON_OJO_URL || '').trim().replace(/\/+$/, '');

const hay = () => !!donde();

/* La clave sale del entorno o de la bóveda, en ese orden — el mismo patrón que
   HEROKU_API_KEY en `operaciones.js`. Nunca se registra ni se devuelve. */
async function conClave(fn) {
  const suelta = String(process.env.ULTRON_OJO_CLAVE || '').trim();
  if (suelta) return fn(suelta);
  return boveda.usar('ULTRON_OJO_CLAVE', fn);
}

async function pedir(ruta, cuerpo) {
  const base = donde();
  if (!base) {
    throw Object.assign(new Error('El ojo no está configurado: falta ULTRON_OJO_URL. Sin él ULTRON no puede abrir una página que se dibuja con JavaScript.'), { codigo: 'SIN_OJO' });
  }
  return conClave(async (clave) => {
    let r;
    try {
      r = await fetch(`${base}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ojo-Clave': clave },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(PLAZO_MS),
      });
    } catch (e) {
      throw Object.assign(new Error(e?.name === 'TimeoutError'
        ? `El ojo tardó más de ${Math.round(PLAZO_MS / 1000)} s. La página puede estar muy pesada o el ojo dormido.`
        : `No se pudo hablar con el ojo: ${String(e?.message || e).slice(0, 120)}`), { codigo: 'OJO_MUDO' });
    }
    const d = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(d?.error || `El ojo contestó ${r.status}.`), { codigo: d?.codigo || 'OJO' });
    return d;
  });
}

/** ¿Está vivo? Sin clave: `/salud` es público a propósito. */
async function salud() {
  const base = donde();
  if (!base) return { hay: false };
  try {
    const r = await fetch(`${base}/salud`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    return { hay: true, ...d };
  } catch (e) {
    return { hay: true, ok: false, porQue: String(e?.message || e).slice(0, 120) };
  }
}

const mirar = ({ url, esperar = null, ancho, alto }) => pedir('/mirar', { url, esperar, ancho, alto });
const foto = ({ url, esperar = null, completa = false, ancho, alto }) => pedir('/foto', { url, esperar, completa, ancho, alto });
const guion = ({ pasos, ancho, alto }) => pedir('/guion', { pasos, ancho, alto });

/**
 * Lo que ve el ojo, escrito para que lo lea el modelo.
 *
 * Va el texto Y lo que se puede tocar. Sin la segunda parte no hay manera de
 * escribir el paso siguiente de un guion: «tocá ENTRAR» necesita saber que hay
 * un botón que dice ENTRAR y con qué selector se agarra.
 */
function comoTexto(d, { conBotones = true } = {}) {
  const partes = [`(${d.url} · ${d.estado ?? '?'} · «${d.titulo || 'sin título'}» · lo vio el navegador de verdad)`];
  if (d.texto) partes.push(d.texto);
  if (conBotones && d.botones?.length) {
    partes.push('\nSE PUEDE TOCAR: ' + d.botones.slice(0, 20).map((b) => `«${b.rotulo}» (${b.selector})`).join(' · '));
  }
  if (conBotones && d.campos?.length) {
    partes.push('SE PUEDE ESCRIBIR EN: ' + d.campos.slice(0, 12).map((c) => `${c.selector} [${c.tipo}]${c.rotulo ? ` «${c.rotulo}»` : ''}`).join(' · '));
  }
  /* Los errores de la pantalla son de lo más útil que trae el ojo: es la
     diferencia entre «la página está rara» y «falla esta línea». */
  if (d.consola?.length) {
    partes.push(`\nERRORES DE LA PÁGINA (${d.consola.length}): ` + d.consola.slice(0, 6).map((c) => c.texto).join(' | '));
  }
  if (d.peticionesFallidas?.length) {
    partes.push(`PETICIONES QUE FALLARON (${d.peticionesFallidas.length}): ` + d.peticionesFallidas.slice(0, 6).map((p) => `${p.url} → ${p.porQue}`).join(' | '));
  }
  if (d.recortado) partes.push('\n[recortado]');
  return partes.join('\n');
}

/* ── LAS ÚLTIMAS FOTOS, EN LA MANO ───────────────────────────────────────────
 * Una foto es un PNG: no cabe en `guardarDocumento`, que guarda markdown, y
 * meterla ahí sería inventar un almacén binario para una cosa que se mira una
 * vez. Se quedan las últimas cinco en memoria y el panel las sirve por
 * `/ojo/foto/:id`. Si el dyno se reinicia se pierden, y está bien: una foto de
 * cómo se veía una pantalla hace dos horas no le sirve a nadie.
 *
 * Cinco y no más: en 512 MB, guardar fotos sin tope es la forma tonta de
 * tumbar a ULTRON con su propia herramienta de mirar. */
const fotos = new Map();
const TOPE_FOTOS = 5;

function guardarFoto(png, { url, titulo }) {
  const id = require('node:crypto').randomBytes(9).toString('hex');
  fotos.set(id, { png: Buffer.from(png, 'base64'), url, titulo, en: new Date() });
  while (fotos.size > TOPE_FOTOS) fotos.delete(fotos.keys().next().value);
  return id;
}

const verFoto = (id) => fotos.get(String(id)) || null;

module.exports = { hay, donde, salud, mirar, foto, guion, comoTexto, guardarFoto, verFoto, PLAZO_MS, _adentro: { fotos } };
