/* OrdenExchange · frontend de usuario
   HTML + CSS + JS sin compilación. Estado en un objeto único (S), render por
   vista, ruteo por hash, un solo ayudante api() que nunca lanza. Todo lo que
   viene del servidor pasa por esc() antes de tocar innerHTML. */
/* global I18N, IDIOMA, t, fijarIdioma */
'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0 · Utilidades
// ═══════════════════════════════════════════════════════════════════════════
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ESC[c]); }
function num(v) { const n = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function fijo(n, dec) { // número → cadena decimal sin ceros infinitos
  if (!Number.isFinite(n)) return '0';
  let s = n.toFixed(dec);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}
function fijoAbajo(n, dec) { // como fijo(), pero truncando: es lo que hace el servidor con el activo
  if (!Number.isFinite(n)) return '0';
  const f = Math.pow(10, dec);
  return fijo(Math.floor(n * f + 1e-9) / f, dec);
}
function inicial(apodo) { return (apodo || '?').trim().charAt(0).toUpperCase() || '?'; }
function enmascarar(v) { const s = String(v || ''); return s.length > 4 ? '•••• ' + s.slice(-4) : s; }
function acortar(s, n = 10) { s = String(s || ''); return s.length > n * 2 + 1 ? s.slice(0, n) + '…' + s.slice(-6) : s; }
function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }

const IC = {
  mercado: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 17l5-6 4 4 5-7 4 5"/><path d="M3 21h18"/></svg>',
  ordenes: '<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  anuncios: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 15h6"/></svg>',
  billetera: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/></svg>',
  yo: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  copiar: '<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  x: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  reloj: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  clip: '<svg class="ic" viewBox="0 0 24 24"><path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></svg>',
  enviar: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 12l18-8-6 18-3-8z"/></svg>',
  alerta: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
  info: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  escudo: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  estrella: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  arriba: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  abajo: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  cambio: '<svg class="ic" viewBox="0 0 24 24"><path d="M7 4v13M3 13l4 4 4-4M17 20V7M13 11l4-4 4 4"/></svg>',
  bien: '<svg class="ic" viewBox="0 0 24 24"><path d="M7 11v9H4v-9zM7 11l4-8c2 0 3 1 3 3v3h5a2 2 0 0 1 2 2l-1.5 7a2 2 0 0 1-2 2H7"/></svg>',
  mal: '<svg class="ic" viewBox="0 0 24 24"><path d="M17 13V4h3v9zM17 13l-4 8c-2 0-3-1-3-3v-3H5a2 2 0 0 1-2-2l1.5-7a2 2 0 0 1 2-2H17"/></svg>',
  ojo: '<svg class="ic" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  candado: '<svg class="ic" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  mas: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  salir: '<svg class="ic" viewBox="0 0 24 24"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H9"/></svg>',
  externo: '<svg class="ic" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

// ═══════════════════════════════════════════════════════════════════════════
// 1 · Estado
// ═══════════════════════════════════════════════════════════════════════════
const CLAVE_SESION = 'ordenexchange.sesion';
const VISTAS_PRIVADAS = ['orden', 'ordenes', 'anuncios', 'billetera', 'pagos', 'perfil', 'agente'];
const S = {
  sesion: null, saldos: [], catalogo: null, errorCatalogo: false, abiertas: 0,
  ruta: { vista: 'mercado' }, despues: null, v: {}, temporizadores: [],
  mercado: { quiero: 'comprar', activo: 'ORIGEN', pais: '', monto: '', metodo: '', soloAgentes: false, orden: 'precio', pagina: 1, anuncios: [], total: 0, cargando: false, cargado: false, error: null },
  precios: {}, metodos: null, hoja: null, ssoPendiente: null, bancosDetalle: {},
};

// Catálogo
function paises() { return (S.catalogo && S.catalogo.paises) || []; }
function paisDe(iso2) { return paises().find(p => p.iso2 === iso2) || null; }
function paisPorMoneda(moneda) { return paises().find(p => p.moneda && p.moneda.codigo === moneda) || null; }
function activos() { return (S.catalogo && S.catalogo.activos) || [{ simbolo: 'ORIGEN', nombre: 'Origen', decimales: 8, ancla: 'oro' }, { simbolo: 'AUKA', nombre: 'Auka', decimales: 8, ancla: 'oro' }, { simbolo: 'AGKA', nombre: 'Agka', decimales: 8, ancla: 'plata' }]; }
function activoDef(sim) { return activos().find(a => a.simbolo === sim) || { simbolo: sim, decimales: 8 }; }
function nombrePais(p) { return p ? (IDIOMA === 'en' && p.nombreEn ? p.nombreEn : p.nombre) : ''; }
function metodoCatalogo(pais, tipo) { const p = paisDe(pais); return p && p.metodos ? p.metodos.find(m => m.tipo === tipo) || null : null; }
function nombreMetodo(tipo, pais, fallback) { const m = metodoCatalogo(pais, tipo); if (m) return IDIOMA === 'en' && m.nombreEn ? m.nombreEn : m.nombre; return fallback || tipo; }
function etiquetaCampo(c) { return IDIOMA === 'en' && c.etiquetaEn ? c.etiquetaEn : c.etiqueta; }
function config() { return (S.catalogo && S.catalogo.configuracion) || { comisionPct: 0, garantiaAgente: '0', maxOrdenesAbiertas: 5, minOrdenUsd: 5, maxOrdenUsdSinAgente: 5000 }; }
function esDemo() { return !!(S.catalogo && S.catalogo.demo); }
function yo() { return S.sesion ? S.sesion.usuario : null; }
function saldoDe(activo) { return S.saldos.find(s => s.activo === activo) || { activo, disponible: '0', congelado: '0' }; }

// ═══════════════════════════════════════════════════════════════════════════
// 2 · Formato
// ═══════════════════════════════════════════════════════════════════════════
function locale(pais) { return (IDIOMA === 'en' ? 'en' : 'es') + (pais ? '-' + pais : (IDIOMA === 'en' ? '' : '-419')); }
function fmtNum(n, dec, pais, maxDec) {
  try { return new Intl.NumberFormat(locale(pais), { minimumFractionDigits: dec, maximumFractionDigits: maxDec === undefined ? dec : maxDec }).format(n); }
  catch (_) { return Number(n).toFixed(dec); }
}
function fmtFiat(v, moneda, conCodigo) {
  const p = paisPorMoneda(moneda);
  const dec = p && p.moneda ? p.moneda.decimales : 2;
  const sim = p && p.moneda && p.moneda.simbolo ? p.moneda.simbolo : moneda;
  const s = sim + ' ' + fmtNum(num(v), dec, p ? p.iso2 : null);
  return conCodigo && sim !== moneda ? s + ' ' + moneda : s;
}
function fmtActivo(v, activo, sinSimbolo) {
  const d = activoDef(activo);
  const dec = Math.min(8, d.decimales === undefined ? 8 : d.decimales);
  const n = num(v);
  const s = fmtNum(n, Math.min(2, dec), null, dec);
  return sinSimbolo ? s : s + ' ' + activo;
}
function fmtUsd(v) { return 'USD ' + fmtNum(num(v), 2, null); }
function fmtPct(v) { return fmtNum(num(v), 1, null) + ' %'; }
function fechaCorta(iso) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
  catch (_) { return String(iso).slice(0, 16); }
}
function hora(iso) { try { return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (_) { return ''; } }
function fechaRel(iso) {
  if (!iso) return '';
  const dif = (Date.now() - new Date(iso).getTime()) / 1000;
  if (dif < 45) return t('com.ahora');
  if (dif < 3600) return t('com.hace', { t: Math.round(dif / 60) + ' ' + t('com.min') });
  if (dif < 86400) return t('com.hace', { t: Math.round(dif / 3600) + ' ' + t('com.h') });
  if (dif < 172800) return t('com.ayer');
  if (dif < 30 * 86400) return t('com.hace', { t: Math.round(dif / 86400) + ' ' + t('com.d') });
  return fechaCorta(iso);
}
function mmss(seg) { seg = Math.max(0, Math.round(seg)); const m = Math.floor(seg / 60); const s = seg % 60; return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
function duracion(seg) { if (seg === null || seg === undefined) return '—'; if (seg < 60) return Math.round(seg) + ' s'; if (seg < 3600) return Math.round(seg / 60) + ' ' + t('com.min'); return fmtNum(seg / 3600, 1) + ' ' + t('com.h'); }
function bandera(iso2) { const p = paisDe(iso2); return p && p.bandera ? p.bandera : ''; }
function tasa(rep) { return rep ? fmtNum(num(rep.tasaFinalizacion30d), 1, null) : '0'; }

// ═══════════════════════════════════════════════════════════════════════════
// 3 · Avisos, copiar, diálogos
// ═══════════════════════════════════════════════════════════════════════════
function aviso(texto, tipo, ms) {
  const caja = $('#avisos'); if (!caja) return;
  const el = document.createElement('div');
  el.className = 'aviso' + (tipo ? ' ' + tipo : ''); el.setAttribute('role', 'status');
  el.textContent = texto;
  caja.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms || 3800);
}
async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); }
  catch (_) {
    const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* nada */ } ta.remove();
  }
  aviso(t('com.copiado'), 'ok', 1600);
}
function copiable(texto, mostrar) {
  return `<button type="button" class="copiable" data-accion="copiar" data-texto="${esc(texto)}" title="${t('com.copiar')}">${esc(mostrar === undefined ? texto : mostrar)}${IC.copiar}</button>`;
}
function cerrarCapa() { const c = $('#capa'); if (c) c.innerHTML = ''; S.hoja = null; document.body.style.overflow = ''; }
function abrirDialogo(o) {
  const c = $('#capa'); if (!c) return;
  c.innerHTML = `<div class="telon" data-accion="cerrar-capa"></div>
  <div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dlg-titulo">
    <button type="button" class="btn-icono cerrar-x" data-accion="cerrar-capa" aria-label="${t('com.cerrar')}">${IC.x}</button>
    <h2 id="dlg-titulo">${o.titulo}</h2>
    ${o.texto ? `<p>${o.texto}</p>` : ''}
    <form data-form="${esc(o.form || 'dialogo-nada')}" novalidate>
      ${o.cuerpo || ''}
      <div id="dlg-error" class="error-campo" hidden></div>
      <div class="acciones">
        <button type="button" class="btn btn-fantasma" data-accion="cerrar-capa">${o.cancelar || t('com.cancelar')}</button>
        <button type="submit" class="btn ${o.clase || 'btn-oro'}" id="dlg-ok">${o.ok || t('com.confirmar')}</button>
      </div>
    </form>
  </div>`;
  document.body.style.overflow = 'hidden';
  const primero = $('.dialogo input, .dialogo textarea, .dialogo select');
  if (primero) setTimeout(() => primero.focus(), 30);
}
function errorDialogo(msg) { const e = $('#dlg-error'); if (e) { e.textContent = msg; e.hidden = !msg; } const b = $('#dlg-ok'); if (b) b.disabled = false; }
function ocupado(form, si) { const b = form ? form.querySelector('button[type=submit]') : null; if (b) { b.disabled = !!si; if (si) { b.dataset.txt = b.innerHTML; b.textContent = t('com.cargando'); } else if (b.dataset.txt) { b.innerHTML = b.dataset.txt; } } }
function notaHTML(texto, tipo, icono) { return `<div class="nota ${tipo || ''}">${icono || IC.info}<div>${texto}</div></div>`; }

// ═══════════════════════════════════════════════════════════════════════════
// 4 · Sesión y API
// ═══════════════════════════════════════════════════════════════════════════
function cargarSesion() { try { const j = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); if (j && j.token && j.usuario) S.sesion = j; } catch (_) { S.sesion = null; } }
function guardarSesion() { try { if (S.sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(S.sesion)); else localStorage.removeItem(CLAVE_SESION); } catch (_) { /* nada */ } }
function fijarSesion(token, usuario) { S.sesion = { token, usuario }; guardarSesion(); if (usuario && usuario.idioma && usuario.idioma !== IDIOMA) fijarIdioma(usuario.idioma); }
function actualizarUsuario(u) { if (S.sesion && u) { S.sesion.usuario = u; guardarSesion(); } }
function cerrarSesion(vencida) {
  const habia = !!S.sesion;
  S.sesion = null; S.saldos = []; S.abiertas = 0; S.metodos = null; guardarSesion();
  detenerSondeos(); cerrarCapa();
  if (vencida && habia) aviso(t('auth.sesionVencida'), 'mal');
  if (VISTAS_PRIVADAS.includes(S.ruta.vista)) { S.despues = location.hash; ir('#/entrar'); } else render();
}

async function api(metodo, ruta, cuerpo) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 25000);
  const cab = { Accept: 'application/json' };
  if (cuerpo !== undefined) cab['Content-Type'] = 'application/json';
  if (S.sesion && S.sesion.token) cab.Authorization = 'Bearer ' + S.sesion.token;
  try {
    const r = await fetch('/api' + ruta, { method: metodo, headers: cab, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: ctl.signal });
    let datos = {};
    const txt = await r.text();
    if (txt) { try { datos = JSON.parse(txt); } catch (_) { datos = { error: txt.slice(0, 200) }; } }
    if (r.status === 401 && S.sesion) cerrarSesion(true);
    return { ok: r.ok, estado: r.status, datos: datos || {} };
  } catch (e) {
    const tiempo = e && e.name === 'AbortError';
    return { ok: false, estado: 0, datos: { error: tiempo ? t('err.tiempo') : t('err.red'), codigo: tiempo ? 'tiempo' : 'red' } };
  } finally { clearTimeout(tm); }
}
function mensajeError(r) {
  const d = r && r.datos ? r.datos : {};
  if (d.codigo && (I18N[IDIOMA]['err.' + d.codigo] || I18N.es['err.' + d.codigo])) return t('err.' + d.codigo);
  if (d.error) return String(d.error);
  return t('err.generico');
}
async function refrescarYo() {
  if (!S.sesion) return;
  const r = await api('GET', '/auth/yo');
  if (r.ok) { actualizarUsuario(r.datos.usuario); S.saldos = r.datos.saldos || []; }
  const o = await api('GET', '/ordenes?estado=abiertas&porPagina=1');
  if (o.ok) S.abiertas = o.datos.abiertas || 0;
}
async function cargarPrecios(moneda) {
  if (!moneda) return null;
  const r = await api('GET', '/mercado/precios?moneda=' + encodeURIComponent(moneda));
  if (r.ok) S.precios[moneda] = r.datos; else if (!S.precios[moneda]) S.precios[moneda] = { error: true, moneda };
  return S.precios[moneda];
}
function referencia(moneda, activo) { const p = S.precios[moneda]; return p && p.referencia && p.referencia[activo] ? num(p.referencia[activo].fiat) : 0; }
async function cargarMetodosPropios(forzar) {
  if (S.metodos && !forzar) return S.metodos;
  const r = await api('GET', '/metodos-pago');
  S.metodos = r.ok ? r.datos.metodos || [] : (S.metodos || []);
  return S.metodos;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 · Ruteo y sondeos
// ═══════════════════════════════════════════════════════════════════════════
function parsearRuta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [camino, q] = h.split('?');
  const partes = camino.split('/').filter(Boolean);
  return { vista: partes[0] || 'mercado', id: partes[1] ? decodeURIComponent(partes[1]) : undefined, sub: partes[2], query: new URLSearchParams(q || '') };
}
function ir(hash) { if (location.hash === hash) navegar(); else location.hash = hash; }
function cada(fn, ms) { const id = setInterval(fn, ms); S.temporizadores.push(id); return id; }
function detenerSondeos() { S.temporizadores.forEach(clearInterval); S.temporizadores = []; }
function navegar() {
  detenerSondeos(); cerrarCapa();
  const r = parsearRuta();
  if (VISTAS_PRIVADAS.includes(r.vista) && !S.sesion) { S.despues = location.hash; location.hash = '#/entrar'; return; }
  if ((r.vista === 'entrar' || r.vista === 'registro') && S.sesion) { location.hash = S.despues || '#/mercado'; S.despues = null; return; }
  const misma = S.ruta.vista === r.vista && S.ruta.id === r.id;
  S.ruta = r;
  if (!misma) S.v = {};
  render();
  if (!misma) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navegar);

// ═══════════════════════════════════════════════════════════════════════════
// 6 · Armazón: cabecera, barra inferior, pie
// ═══════════════════════════════════════════════════════════════════════════
function enlaceNav(vista, clave, icono) {
  const activa = S.ruta.vista === vista || (vista === 'ordenes' && S.ruta.vista === 'orden') || (vista === 'perfil' && ['pagos', 'agente'].includes(S.ruta.vista));
  const cont = vista === 'ordenes' && S.abiertas > 0 ? `<span class="contador">${S.abiertas}</span>` : '';
  return `<a href="#/${vista}" class="${activa ? 'activa' : ''}">${icono || ''}<span>${t(clave)}</span>${cont}</a>`;
}
function cabecera() {
  const u = yo();
  return `<header class="cabecera"><div class="cabecera-in">
    <a href="#/mercado" class="marca" aria-label="OrdenExchange"><b>Orden</b><span>Exchange</span></a>
    ${esDemo() ? `<span class="etq-demo">${t('nav.demo')}</span>` : ''}
    <nav class="nav-sup" aria-label="${t('nav.menu')}">
      ${enlaceNav('mercado', 'nav.mercado')}${enlaceNav('ordenes', 'nav.ordenes')}${enlaceNav('anuncios', 'nav.anuncios')}${enlaceNav('billetera', 'nav.billetera')}
    </nav>
    <div class="cabecera-der">
      <div class="idioma" role="group" aria-label="${t('nav.idioma')}">
        <button type="button" class="${IDIOMA === 'es' ? 'activa' : ''}" data-accion="idioma" data-v="es">ES</button>
        <button type="button" class="${IDIOMA === 'en' ? 'activa' : ''}" data-accion="idioma" data-v="en">EN</button>
      </div>
      ${u ? `<a href="#/perfil" class="cuenta" title="${t('nav.cuenta')}"><span class="avatar">${esc(inicial(u.apodo))}</span><span class="apodo">${esc(u.apodo)}</span></a>`
          : `<a href="#/entrar" class="btn btn-oro btn-chico">${t('nav.entrar')}</a>`}
    </div>
  </div></header>`;
}
function barraInferior() {
  return `<nav class="barra-inf" aria-label="${t('nav.menu')}">
    ${enlaceNav('mercado', 'nav.mercado', IC.mercado)}${enlaceNav('ordenes', 'nav.ordenes', IC.ordenes)}${enlaceNav('anuncios', 'nav.anuncios', IC.anuncios)}${enlaceNav('billetera', 'nav.billetera', IC.billetera)}${enlaceNav('perfil', 'nav.yo', IC.yo)}
  </nav>`;
}
function pie() {
  return `<footer class="pie"><div class="pie-in">
    <div><span class="marca"><b>Orden</b><span>Exchange</span></span> · ${t('pie.ecosistema')}</div>
    <div>${t('pie.aviso')}</div>
  </div></footer>`;
}
function vacioHTML(titulo, texto, boton) { return `<div class="vacio"><h3>${titulo}</h3>${texto ? `<p>${texto}</p>` : ''}${boton || ''}</div>`; }
function errorCargaHTML(msg) { return `<div class="vacio"><h3>${esc(msg || t('com.errorCarga'))}</h3><button type="button" class="btn btn-linea btn-chico" data-accion="recargar">${t('com.reintentar')}</button></div>`; }
function esqueletos(n) { return Array.from({ length: n || 3 }, () => '<div class="esqueleto"></div>').join(''); }
function pestanasHTML(lista, actual, accion) {
  return `<div class="pestanas" role="tablist">${lista.map(p => `<button type="button" role="tab" aria-selected="${p.v === actual}" class="${p.v === actual ? 'activa' : ''}" data-accion="${accion}" data-v="${p.v}">${p.txt}${p.n ? `<span class="contador">${p.n}</span>` : ''}</button>`).join('')}</div>`;
}
function insigniasHTML(u) {
  let s = '';
  if (u && u.agente) s += `<span class="insignia agente">${IC.estrella}${t('com.agente')}</span>`;
  if (u && u.verificado && !u.agente) s += `<span class="insignia verificado">${IC.escudo}${t('com.verificado')}</span>`;
  return s;
}
function repCorta(rep) { if (!rep) return ''; const n = rep.ordenesTotales || 0; return `${n === 1 ? t('com.orden1') : t('com.ordenes', { n })} · ${t('com.completadas', { pct: tasa(rep) })}`; }
function reputacionHTML(rep) {
  rep = rep || {};
  return `<div class="rep">
    <div><span>${t('rep.total')}</span><b>${rep.ordenesTotales || 0}</b></div>
    <div><span>${t('rep.completadas')}</span><b>${rep.ordenesCompletadas || 0}</b></div>
    <div><span>${t('rep.tasa')}</span><b>${tasa(rep)} %</b></div>
    <div><span>${t('rep.positivas')}</span><b class="verde">${rep.positivas || 0}</b></div>
    <div><span>${t('rep.negativas')}</span><b class="rojo">${rep.negativas || 0}</b></div>
    <div><span>${t('rep.liberacion')}</span><b>${duracion(rep.tiempoPromedioLiberacionSeg)}</b></div>
    <div><span>${t('rep.pago')}</span><b>${duracion(rep.tiempoPromedioPagoSeg)}</b></div>
    <div><span>${t('rep.apelaciones')}</span><b>${rep.apelacionesPerdidas || 0}</b></div>
  </div>`;
}
function selectPaises(nombre, actual, extra) {
  return `<select class="entrada" ${extra || ''} name="${nombre}">${paises().map(p => `<option value="${esc(p.iso2)}" ${p.iso2 === actual ? 'selected' : ''}>${esc(p.bandera || '')} ${esc(nombrePais(p))} · ${esc(p.moneda ? p.moneda.codigo : '')}</option>`).join('')}</select>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7 · Mercado (portada)
// ═══════════════════════════════════════════════════════════════════════════
function elegirPaisInicial() {
  if (S.mercado.pais && paisDe(S.mercado.pais)) return;
  let iso = null;
  try { iso = localStorage.getItem('ordenexchange.pais'); } catch (_) { /* nada */ }
  if (!iso || !paisDe(iso)) { const u = yo(); if (u && paisDe(u.pais)) iso = u.pais; }
  if (!iso || !paisDe(iso)) { const reg = (navigator.language || '').split('-')[1]; if (reg && paisDe(reg.toUpperCase())) iso = reg.toUpperCase(); }
  if (!iso || !paisDe(iso)) iso = paises()[0] ? paises()[0].iso2 : '';
  S.mercado.pais = iso;
}
function monedaMercado() { const p = paisDe(S.mercado.pais); return p && p.moneda ? p.moneda.codigo : ''; }

/** La custodia, dicha con una sola frase: dónde está el activo ahora mismo. */
function custodiaHTML(o) {
  const cant = esc(fmtActivo(o.cantidadActivo, o.activo));
  const candado = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  const visto = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const vuelta = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a6 6 0 0 1 0 12h-3"/></svg>';
  if (o.estado === 'completada') return `<div class="custodia liberada"><span class="cand">${visto}</span><div class="cuerpo"><b>${t('orden.custodiaLiberada', { n: cant })}</b><small>${t('orden.custodiaLiberadaSub')}</small></div></div>`;
  if (o.estado === 'cancelada') return `<div class="custodia devuelta"><span class="cand">${vuelta}</span><div class="cuerpo"><b>${t('orden.custodiaDevuelta', { n: cant })}</b><small>${t('orden.custodiaDevueltaSub')}</small></div></div>`;
  return `<div class="custodia activa"><span class="cand">${candado}</span><div class="cuerpo"><b>${t('orden.custodiaActiva', { n: cant })}</b><small>${t(o.estado === 'apelacion' ? 'orden.custodiaApelacionSub' : 'orden.custodiaSub')}</small></div></div>`;
}
function pizarraHTML(moneda) {
  const p = S.precios[moneda];
  const pais = paisPorMoneda(moneda);
  const items = activos().map(a => {
    const ref = p && p.referencia && p.referencia[a.simbolo];
    return `<div class="pz-item"><div class="sim"><i class="${a.ancla === 'plata' ? 'plata' : ''}"></i>${esc(a.simbolo)}</div>
      <div class="valor">${ref ? esc(fmtFiat(ref.fiat, moneda)) : (p && p.error ? '—' : '<span class="gris">…</span>')}<small>${esc(moneda)}</small></div>
      <div class="usd">${ref ? esc(fmtUsd(ref.usd)) : (p && p.error ? t('mercado.precioSinRef') : '')}</div></div>`;
  }).join('');
  const metales = p && !p.error ? `${t('mercado.oro')} <b>${esc(fmtNum(p.oroUsdOnza, 0))}</b> · ${t('mercado.plata')} <b>${esc(fmtNum(p.plataUsdOnza, 2))}</b> ${t('mercado.porOnza')}` : '';
  return `<section class="pizarra" id="pizarra" aria-label="${t('mercado.referencia')}">
    <div class="pz-cab"><span class="etq">${t('mercado.referencia')} · ${esc(pais ? nombrePais(pais) : moneda)}</span>
      <span class="tiempo">${p && p.actualizadoEn ? t('mercado.actualizado', { t: fechaRel(p.actualizadoEn) }) : ''}</span></div>
    <div class="pz-items">${items}<div class="pz-item metales-esc solo-esc">${metales}</div></div>
    <div class="pz-pie"><span>${t('mercado.gramaje')}</span><span class="metales oculto-esc">${metales}</span></div>
  </section>`;
}

function filtrosHTML() {
  const m = S.mercado; const pais = paisDe(m.pais); const moneda = monedaMercado();
  const metodos = pais && pais.metodos ? pais.metodos : [];
  return `<div class="filtros" id="filtros">
    <div class="segmento lados" role="tablist" aria-label="${t('mercado.filtros')}">
      <button type="button" role="tab" aria-selected="${m.quiero === 'comprar'}" class="${m.quiero === 'comprar' ? 'activa comprar' : ''}" data-accion="m-quiero" data-v="comprar">${t('mercado.comprar')}</button>
      <button type="button" role="tab" aria-selected="${m.quiero === 'vender'}" class="${m.quiero === 'vender' ? 'activa vender' : ''}" data-accion="m-quiero" data-v="vender">${t('mercado.vender')}</button>
    </div>
    <div class="f-linea"><div class="pastillas" role="tablist" aria-label="${t('com.activo')}">${activos().map(a => `<button type="button" role="tab" aria-selected="${m.activo === a.simbolo}" class="${m.activo === a.simbolo ? 'activa' : ''}" data-accion="m-activo" data-v="${esc(a.simbolo)}">${esc(a.simbolo)}</button>`).join('')}</div></div>
    <div class="f-linea">
      ${selectPaises('pais', m.pais, `data-cambio="m-pais" aria-label="${t('com.pais')}"`)}
      <div class="entrada-grupo f-monto"><input class="entrada" type="text" inputmode="decimal" placeholder="${t('mercado.montoPh', { moneda })}" value="${esc(m.monto)}" data-entrada="m-monto" aria-label="${t('com.monto')}"><span class="sufijo">${esc(moneda)}</span></div>
      <select class="entrada" data-cambio="m-metodo" aria-label="${t('com.metodos')}"><option value="">${t('mercado.todosMetodos')}</option>${metodos.map(x => `<option value="${esc(x.tipo)}" ${m.metodo === x.tipo ? 'selected' : ''}>${esc(IDIOMA === 'en' && x.nombreEn ? x.nombreEn : x.nombre)}</option>`).join('')}</select>
      <label class="interruptor"><input type="checkbox" data-cambio="m-agentes" ${m.soloAgentes ? 'checked' : ''}><span class="pista"></span>${t('mercado.soloAgentes')}</label>
    </div>
  </div>`;
}

function requisitosTexto(req) {
  if (!req) return '';
  const l = [];
  if (req.ordenesMin > 0) l.push(t('mercado.reqOrdenes', { n: req.ordenesMin }));
  if (req.tasaFinalizacionMin > 0) l.push(t('mercado.reqTasa', { n: req.tasaFinalizacionMin }));
  if (req.diasRegistroMin > 0) l.push(t('mercado.reqDias', { n: req.diasRegistroMin }));
  if (req.soloAgentes) l.push(t('mercado.reqAgentes'));
  return l.join(' · ');
}
function chipsMetodos(metodos, pais, max) {
  const l = (metodos || []).slice(0, max || 4).map(m => `<span class="chip ${esc(m.categoria || '')}">${esc(nombreMetodo(m.tipo, pais, m.nombre))}${m.banco ? ' · ' + esc(m.banco) : ''}</span>`);
  if ((metodos || []).length > (max || 4)) l.push(`<span class="chip">+${metodos.length - (max || 4)}</span>`);
  return `<div class="chips">${l.join('')}</div>`;
}
function anuncioHTML(a, ctx) {
  const u = a.anunciante || {}; const rep = u.reputacion || {};
  const compra = a.lado === 'venta'; // el anunciante vende → yo compro
  const req = requisitosTexto(a.requisitos);
  const btn = ctx && ctx.sinBoton ? '' : `<button type="button" class="btn ${compra ? 'btn-comprar' : 'btn-vender'}" data-accion="abrir-hoja" data-id="${esc(a.id)}">${compra ? t('mercado.comprarBtn', { activo: a.activo }) : t('mercado.venderBtn', { activo: a.activo })}</button>`;
  return `<article class="anuncio" data-id="${esc(a.id)}">
    <div class="a-quien"><span class="avatar">${esc(inicial(u.apodo))}${u.enLinea ? '<i class="punto"></i>' : ''}</span>
      <div class="cuerpo"><div class="nombre"><a href="#/usuario/${esc(u.id)}">${esc(u.apodo)}</a>${insigniasHTML(u)}</div>
      <div class="rep">${repCorta(rep)}</div></div></div>
    <div class="a-precio"><div class="valor">${esc(fmtFiat(a.precio, a.moneda))}<small>${esc(a.moneda)}</small></div>
      <div class="flot">${a.tipoPrecio === 'flotante' && a.margen ? esc(t('anuncios.flotante') + ' ' + fmtNum(a.margen, 1) + ' %') : t('anuncios.fijo')}</div></div>
    <div class="a-disp"><div><span>${t('mercado.disponibleDe')}</span><b>${esc(fmtActivo(a.cantidadDisponible, a.activo))}</b></div>
      <div><span>${t('mercado.limitesDe')}</span><b>${esc(fmtFiat(a.limiteMin, a.moneda))} – ${esc(fmtFiat(a.limiteMax, a.moneda))}</b></div></div>
    <div class="a-metodos">${chipsMetodos(a.metodos, a.pais)}<span class="ventana">${IC.reloj}${t('com.minutos', { n: a.ventanaPagoMin })}</span></div>
    <div class="a-ventana-esc">${t('com.minutos', { n: a.ventanaPagoMin })}</div>
    <div class="a-accion">${btn}${a.cumpleRequisitos === false ? `<div class="req">${esc(a.motivoNoCumple || t('hoja.noCumples'))}</div>` : (req ? `<div class="pequeno centrado mt8">${t('mercado.req', { req: esc(req) })}</div>` : '')}</div>
  </article>`;
}
function listaAnunciosHTML() {
  const m = S.mercado;
  if (m.error) return errorCargaHTML(m.error);
  if (!m.cargado) return esqueletos(4);
  if (!m.anuncios.length) return vacioHTML(t('mercado.sinAnuncios'), t('mercado.sinAnunciosSub'), yo() ? `<a href="#/anuncios/nuevo" class="btn btn-linea btn-chico">${t('mercado.publicar')}</a>` : '');
  const cab = `<div class="ta-cab" aria-hidden="true"><div>${t('mercado.anunciante')}</div><div>${t('mercado.precioCol')}</div><div>${t('mercado.dispLimites')}</div><div>${t('mercado.pagoCol')}</div><div>${t('mercado.ventanaCol')}</div><div>${t('mercado.accion')}</div></div>`;
  const mas = m.anuncios.length < m.total ? `<div class="centrado mt12"><button type="button" class="btn btn-linea" data-accion="m-mas" ${m.cargando ? 'disabled' : ''}>${t('mercado.cargarMas')}</button></div>` : '';
  return cab + m.anuncios.map(a => anuncioHTML(a)).join('') + mas;
}
function metaMercadoHTML() {
  const m = S.mercado;
  return `<div class="mercado-meta"><span>${m.cargado ? t('mercado.mostrando', { n: m.anuncios.length, total: m.total }) : ''}</span>
    <label>${t('mercado.ordenarPor')} <select data-cambio="m-orden" aria-label="${t('mercado.ordenarPor')}">
      <option value="precio" ${m.orden === 'precio' ? 'selected' : ''}>${t('mercado.porPrecio')}</option>
      <option value="completadas" ${m.orden === 'completadas' ? 'selected' : ''}>${t('mercado.porCompletadas')}</option>
      <option value="reciente" ${m.orden === 'reciente' ? 'selected' : ''}>${t('mercado.porReciente')}</option></select></label></div>`;
}
function comoFuncionaHTML() {
  const paso = (n, tt, dd) => `<div class="como-paso"><i>${n}</i><div><b>${t(tt)}</b><p>${t(dd)}</p></div></div>`;
  return `<section class="como" id="como-funciona"><h2>${t('como.titulo')}</h2><p>${t('como.sub')}</p>
    <div class="como-cols">
      <div class="como-col comprar"><h3>${t('como.comprar')}</h3>${paso(1, 'como.c1', 'como.c1d')}${paso(2, 'como.c2', 'como.c2d')}${paso(3, 'como.c3', 'como.c3d')}</div>
      <div class="como-col vender"><h3>${t('como.vender')}</h3>${paso(1, 'como.v1', 'como.v1d')}${paso(2, 'como.v2', 'como.v2d')}${paso(3, 'como.v3', 'como.v3d')}</div>
    </div>
    <div class="como-notas"><div>${IC.candado}<span>${t('como.custodia')}</span></div><div>${IC.escudo}<span>${t('como.gid')}</span></div><div>${IC.estrella}<span>${t('como.origen')}</span></div></div>
  </section>`;
}
const vistaMercado = {
  clase: '',
  html() {
    if (S.errorCatalogo && !S.catalogo) return errorCargaHTML();
    if (!S.catalogo) return esqueletos(5);
    return `<section class="portada-cab"><h1>${t('mercado.titulo')}</h1><p>${t('mercado.sub')}</p></section>
      ${pizarraHTML(monedaMercado())}${filtrosHTML()}${metaMercadoHTML()}<div id="lista-anuncios">${listaAnunciosHTML()}</div>${comoFuncionaHTML()}`;
  },
  montar() {
    if (!S.catalogo) return;
    const moneda = monedaMercado();
    if (!S.precios[moneda] || S.precios[moneda].error) cargarPrecios(moneda).then(() => { const p = $('#pizarra'); if (p && S.ruta.vista === 'mercado') p.outerHTML = pizarraHTML(monedaMercado()); });
    if (!S.mercado.cargado && !S.mercado.cargando) cargarMercado();
    cada(() => { const mo = monedaMercado(); cargarPrecios(mo).then(() => { const p = $('#pizarra'); if (p && S.ruta.vista === 'mercado') p.outerHTML = pizarraHTML(mo); }); }, 60000);
  },
};
function pintarLista() { const l = $('#lista-anuncios'); if (l) l.innerHTML = listaAnunciosHTML(); const mm = $('.mercado-meta'); if (mm) mm.outerHTML = metaMercadoHTML(); }
async function cargarMercado(mas) {
  const m = S.mercado;
  if (!mas) { m.pagina = 1; m.anuncios = []; m.cargado = false; m.total = 0; }
  m.cargando = true; m.error = null;
  const q = new URLSearchParams({ quiero: m.quiero, activo: m.activo, pagina: String(m.pagina), porPagina: '20', orden: m.orden });
  const moneda = monedaMercado();
  if (m.pais) q.set('pais', m.pais);
  if (moneda) q.set('moneda', moneda);
  if (num(m.monto) > 0) q.set('monto', fijo(num(m.monto), 2));
  if (m.metodo) q.set('metodo', m.metodo);
  if (m.soloAgentes) q.set('soloAgentes', '1');
  const firma = q.toString(); m.firma = firma;
  pintarLista();
  const r = await api('GET', '/mercado/anuncios?' + firma);
  if (m.firma !== firma) return; // llegó una respuesta vieja
  m.cargando = false;
  if (!r.ok) { m.error = mensajeError(r); pintarLista(); return; }
  const nuevos = r.datos.anuncios || [];
  m.anuncios = mas ? m.anuncios.concat(nuevos) : nuevos;
  m.total = r.datos.total === undefined ? m.anuncios.length : r.datos.total;
  m.cargado = true;
  pintarLista();
}
const cargarMercadoConEspera = debounce(() => cargarMercado(), 450);
function cambioFiltro(refrescarFiltros) {
  if (refrescarFiltros) { const f = $('#filtros'); if (f) f.outerHTML = filtrosHTML(); }
  cargarMercado();
}

// ═══════════════════════════════════════════════════════════════════════════
// 8 · Hoja de orden (panel comprar / vender)
// ═══════════════════════════════════════════════════════════════════════════
function anuncioPorId(id) { return S.mercado.anuncios.find(a => a.id === id) || (S.v.anuncios || []).find(a => a.id === id) || null; }
async function abrirHoja(id) {
  const a = anuncioPorId(id); if (!a) return;
  if (!yo()) { S.despues = location.hash; aviso(t('hoja.entrar')); ir('#/entrar'); return; }
  const compra = a.lado === 'venta';
  S.hoja = { anuncio: a, compra, ultimo: 'fiat', fiat: '', activo: '', metodo: null, propios: [], cargandoPropios: !compra, error: null, enviando: false };
  const tipos = a.metodos.map(m => m.tipo);
  if (compra) { S.hoja.metodo = a.metodos[0] || null; }
  pintarHoja();
  if (!compra) {
    const lista = await cargarMetodosPropios();
    if (!S.hoja || S.hoja.anuncio.id !== id) return;
    S.hoja.propios = lista.filter(m => m.activo !== false && m.pais === a.pais && (tipos.length === 0 || tipos.includes(m.tipo)));
    S.hoja.metodo = S.hoja.propios[0] || null;
    S.hoja.cargandoPropios = false;
    pintarHoja();
  }
}
function limitesHoja() {
  const a = S.hoja.anuncio; const precio = num(a.precio);
  const min = num(a.limiteMin);
  const max = Math.min(num(a.limiteMax), num(a.cantidadDisponible) * precio);
  return { min, max, precio };
}
function hojaHTML() {
  const h = S.hoja; const a = h.anuncio; const u = a.anunciante || {}; const usr = yo();
  const dec = paisPorMoneda(a.moneda) && paisPorMoneda(a.moneda).moneda ? paisPorMoneda(a.moneda).moneda.decimales : 2;
  const { min, max } = limitesHoja();
  const titulo = h.compra ? t('hoja.comprarTitulo', { activo: '' }) : t('hoja.venderTitulo', { activo: '' });
  let metodosHTML;
  if (h.compra) {
    metodosHTML = `<div class="campo"><label>${t('hoja.pagarCon')}</label>
      ${a.metodos.map((m, i) => `<label class="casilla ${h.metodo === m ? 'activa' : ''}"><input type="radio" name="metodo" value="${i}" ${h.metodo === m ? 'checked' : ''} data-cambio="h-metodo"><div class="cuerpo"><b>${esc(nombreMetodo(m.tipo, a.pais, m.nombre))}</b>${m.banco ? `<small>${esc(m.banco)}</small>` : ''}</div></label>`).join('')}</div>`;
  } else if (h.cargandoPropios) {
    metodosHTML = esqueletos(2);
  } else if (!h.propios.length) {
    metodosHTML = `<div class="campo"><label>${t('hoja.recibirEn')}</label>${notaHTML(esc(t('hoja.sinMetodosPropios', { pais: nombrePais(paisDe(a.pais)) })) + `<div class="mt8"><a href="#/pagos" class="btn btn-linea btn-chico" data-accion="cerrar-capa-ir">${t('hoja.agregarMetodo')}</a></div>`, 'roja', IC.alerta)}
      <div class="pequeno">${t('hoja.metodosAceptados')}: ${esc(a.metodos.map(m => nombreMetodo(m.tipo, a.pais, m.nombre)).join(', ') || t('com.todos'))}</div></div>`;
  } else {
    metodosHTML = `<div class="campo"><label>${t('hoja.recibirEn')}</label>
      ${h.propios.map(m => `<label class="casilla ${h.metodo === m ? 'activa' : ''}"><input type="radio" name="metodo" value="${esc(m.id)}" ${h.metodo === m ? 'checked' : ''} data-cambio="h-metodo"><div class="cuerpo"><b>${esc(m.nombreMetodo)}${m.banco ? ' · ' + esc(m.banco) : ''}</b><small>${esc(m.titular)} · ${esc(enmascarar(Object.values(m.campos || {})[0] || ''))}</small></div></label>`).join('')}</div>`;
  }
  const noOpera = usr && usr.puedeOperar === false;
  const noCumple = a.cumpleRequisitos === false;
  const puede = !noOpera && !noCumple && (h.compra || h.propios.length > 0);
  const campoFiat = `<div class="campo"><label for="h-fiat">${h.compra ? t('hoja.voyAPagar') : t('hoja.voyARecibir')}</label><div class="entrada-grupo"><input id="h-fiat" class="entrada" type="text" inputmode="decimal" autocomplete="off" value="${esc(h.fiat)}" data-entrada="h-fiat" placeholder="${esc(fmtNum(min, dec))} – ${esc(fmtNum(max, dec))}"><span class="sufijo">${esc(a.moneda)}</span></div></div>`;
  const campoActivo = `<div class="campo"><label for="h-activo">${h.compra ? t('hoja.voyARecibir') : t('hoja.voyAVender')}</label><div class="entrada-grupo"><input id="h-activo" class="entrada" type="text" inputmode="decimal" autocomplete="off" value="${esc(h.activo)}" data-entrada="h-activo" placeholder="0.00"><span class="sufijo"><button type="button" class="enlace" data-accion="h-max">${t('com.max')}</button>${esc(a.activo)}</span></div></div>`;
  return `<div class="telon" data-accion="cerrar-capa"></div>
  <aside class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
    <div class="hoja-cabeza"><h2 id="hoja-titulo">${titulo}<span class="activo-etq ${h.compra ? 'verde' : 'rojo'}">${esc(a.activo)}</span></h2><button type="button" class="btn-icono" data-accion="cerrar-capa" aria-label="${t('com.cerrar')}">${IC.x}</button></div>
    <div class="anunciante"><span class="avatar">${esc(inicial(u.apodo))}</span><div class="cuerpo"><b><a href="#/usuario/${esc(u.id)}">${esc(u.apodo)}</a>${insigniasHTML(u)}</b><small>${repCorta(u.reputacion)}</small></div>
      <div class="precio-ref"><b>${esc(fmtFiat(a.precio, a.moneda))}</b><small>${t('hoja.precioUnidad', { activo: a.activo })}</small></div></div>
    <form data-form="hoja" novalidate>
      <div class="conversion">${h.compra ? campoFiat : campoActivo}<span class="flecha">${IC.cambio}</span>${h.compra ? campoActivo : campoFiat}</div>
      <div class="limites"><span data-accion="h-min" title="${t('com.limites')}">${t('hoja.limiteMin', { min: fmtFiat(min, a.moneda) })}</span><span data-accion="h-max" title="${t('com.limites')}">${t('hoja.limiteMax', { max: fmtFiat(max, a.moneda) })}</span></div>
      <div id="h-error" class="error-campo mb12" hidden></div>
      ${metodosHTML}
      <div class="campo"><label>${t('hoja.terminos')}</label><div class="terminos">${a.terminos ? esc(a.terminos) : `<span class="gris">${t('hoja.sinTerminos')}</span>`}</div></div>
      ${requisitosTexto(a.requisitos) ? `<div class="pequeno mb12">${t('hoja.requisitos')}: ${esc(requisitosTexto(a.requisitos))}</div>` : ''}
      ${noCumple ? notaHTML(esc(a.motivoNoCumple || t('hoja.noCumples')), 'roja', IC.alerta) : ''}
      ${noOpera ? notaHTML(`<b>${t('hoja.noOpera')}</b><br>${esc(usr.motivoNoOpera || t('err.no-verificado'))}<div class="mt8"><a href="#/perfil" class="btn btn-linea btn-chico" data-accion="cerrar-capa-ir">${t('hoja.irPerfil')}</a></div>`, 'roja', IC.alerta) : ''}
      ${notaHTML(esc(h.compra ? t('hoja.custodiaCompra', { activo: a.activo }) : t('hoja.custodiaVenta', { activo: a.activo })) + ' ' + esc(h.compra ? t('hoja.ventana', { n: a.ventanaPagoMin }) : t('hoja.ventanaVenta', { n: a.ventanaPagoMin })), 'gris', IC.candado)}
      <button type="submit" class="btn btn-bloque ${h.compra ? 'btn-comprar' : 'btn-vender'}" id="h-ok" ${puede ? '' : 'disabled'}>${h.enviando ? t('hoja.abriendo') : (h.compra ? t('mercado.comprarBtn', { activo: a.activo }) : t('mercado.venderBtn', { activo: a.activo }))}</button>
    </form>
  </aside>`;
}
function pintarHoja() { const c = $('#capa'); if (!c || !S.hoja) return; c.innerHTML = hojaHTML(); document.body.style.overflow = 'hidden'; validarHoja(); }
function convertirHoja(desde, valor) {
  const h = S.hoja; const a = h.anuncio; const { precio } = limitesHoja();
  const decF = paisPorMoneda(a.moneda) && paisPorMoneda(a.moneda).moneda ? paisPorMoneda(a.moneda).moneda.decimales : 2;
  const decA = Math.min(8, activoDef(a.activo).decimales === undefined ? 8 : activoDef(a.activo).decimales);
  h.ultimo = desde;
  if (desde === 'fiat') { h.fiat = valor; const n = num(valor); h.activo = n > 0 && precio > 0 ? fijoAbajo(n / precio, decA) : ''; const o = $('#h-activo'); if (o) o.value = h.activo; }
  else { h.activo = valor; const n = num(valor); h.fiat = n > 0 ? fijo(n * precio, decF) : ''; const o = $('#h-fiat'); if (o) o.value = h.fiat; }
  validarHoja();
}
function validarHoja() {
  const h = S.hoja; if (!h) return false;
  const a = h.anuncio; const { min, max } = limitesHoja();
  const f = num(h.fiat); let msg = '';
  if (h.fiat === '' && h.activo === '') msg = '';
  else if (!(f > 0)) msg = t('hoja.montoInvalido');
  else if (f < min - 1e-9) msg = t('hoja.limiteMin', { min: fmtFiat(min, a.moneda) });
  else if (f > max + 1e-9) msg = t('hoja.limiteMax', { max: fmtFiat(max, a.moneda) });
  const e = $('#h-error'); if (e) { e.textContent = msg; e.hidden = !msg; }
  const usr = yo();
  const puede = !msg && f > 0 && h.metodo && !(usr && usr.puedeOperar === false) && a.cumpleRequisitos !== false;
  const b = $('#h-ok'); if (b) b.disabled = !puede || h.enviando;
  return !!puede;
}
async function enviarHoja(form) {
  const h = S.hoja; if (!h || !validarHoja()) return;
  const a = h.anuncio;
  const cuerpo = { anuncioId: a.id };
  if (h.ultimo === 'fiat') cuerpo.montoFiat = fijo(num(h.fiat), 2); else cuerpo.cantidadActivo = fijo(num(h.activo), 8);
  if (h.compra) {
    // FALTA EN API: AnuncioPublico.metodos no trae `id` (Omit<MetodoEnAnuncio,'id'>), pero POST /ordenes pide
    // `metodoId` del anunciante. Mando el id si el servidor lo incluye y, si no, el tipo como pista.
    if (h.metodo && h.metodo.id) cuerpo.metodoId = h.metodo.id; else if (h.metodo) cuerpo.metodoTipo = h.metodo.tipo;
  } else if (h.metodo) cuerpo.metodoId = h.metodo.id;
  h.enviando = true; ocupado(form, true);
  const r = await api('POST', '/ordenes', cuerpo);
  if (!S.hoja) return;
  h.enviando = false;
  if (!r.ok) { ocupado(form, false); const e = $('#h-error'); if (e) { e.textContent = mensajeError(r); e.hidden = false; } if (r.datos.codigo === 'sin-saldo' || r.datos.codigo === 'fuera-de-limites') cargarMercado(); return; }
  S.abiertas += 1; cerrarCapa();
  ir('#/orden/' + encodeURIComponent(r.datos.orden.id));
}

// ═══════════════════════════════════════════════════════════════════════════
// 9 · Orden
// ═══════════════════════════════════════════════════════════════════════════
const ABIERTOS = ['pendiente-pago', 'pagado', 'apelacion'];
function fijarOrden(o) {
  S.v.orden = o;
  S.v.mensajes = Array.isArray(o.mensajes) ? o.mensajes.slice() : (S.v.mensajes || []);
  S.v.fin = o.segundosRestantes !== null && o.segundosRestantes !== undefined ? Date.now() + o.segundosRestantes * 1000 : null;
  S.v.cargado = true;
}
async function cargarOrden(id) {
  S.v.cargando = true;
  const r = await api('GET', '/ordenes/' + encodeURIComponent(id));
  if (S.ruta.vista !== 'orden' || S.ruta.id !== id) return;
  S.v.cargando = false;
  if (!r.ok) { S.v.error = r.estado === 404 ? t('orden.noEncontrada') : mensajeError(r); render(); return; }
  fijarOrden(r.datos.orden); render();
}
function ultimoMensajeId() { const m = S.v.mensajes || []; return m.length ? m[m.length - 1].id : ''; }
async function sondearOrden() {
  const o = S.v.orden; if (!o || !ABIERTOS.includes(o.estado) || S.v.sondeando) return;
  S.v.sondeando = true;
  const desde = ultimoMensajeId();
  const r = await api('GET', `/ordenes/${encodeURIComponent(o.id)}/mensajes${desde ? '?desde=' + encodeURIComponent(desde) : ''}`);
  S.v.sondeando = false;
  if (!r.ok || S.ruta.vista !== 'orden' || !S.v.orden || S.v.orden.id !== o.id) return;
  const d = r.datos;
  const nuevos = (d.mensajes || []).filter(m => !S.v.mensajes.some(x => x.id === m.id));
  if (d.orden && d.orden.estado !== S.v.orden.estado) {
    const borrador = $('#chat-texto') ? $('#chat-texto').value : '';
    S.v.mensajes = S.v.mensajes.concat(nuevos);
    fijarOrden(Object.assign({}, d.orden, { mensajes: S.v.mensajes }));
    S.v.borrador = borrador; render();
    if (!ABIERTOS.includes(d.orden.estado)) refrescarYo().then(() => { const n = $$('.contador'); n.forEach(c => c.textContent = S.abiertas); });
    return;
  }
  if (d.orden) { S.v.orden = Object.assign({}, d.orden, { mensajes: S.v.mensajes }); }
  if (nuevos.length) { S.v.mensajes = S.v.mensajes.concat(nuevos); pintarMensajes(true); }
}
function pintarMensajes(desplazar) { const c = $('#chat-mensajes'); if (!c) return; c.innerHTML = mensajesHTML(); if (desplazar !== false) c.scrollTop = c.scrollHeight; }
function mensajesHTML() {
  const o = S.v.orden; const u = yo(); const lista = S.v.mensajes || [];
  if (!lista.length) return `<div class="vacio-chat">${t('orden.sinMensajes')}</div>`;
  return lista.map(m => {
    if (m.de === 'sistema') return `<div class="msg-sistema">${esc(m.texto)}<time>${esc(hora(m.en))}</time></div>`;
    const mio = u && m.de === u.id; const operador = typeof m.de === 'string' && m.de.startsWith('operador:');
    const quien = mio ? '' : (operador ? `<span class="de">${t('orden.sistema')} · OrdenExchange</span>` : '');
    return `<div class="burbuja ${mio ? 'mia' : ''} ${operador ? 'operador' : ''}">${quien}${m.imagen ? `<img src="${esc(m.imagen)}" alt="${t('orden.comprobante')}" data-accion="ver-imagen" loading="lazy">` : ''}${m.texto ? esc(m.texto) : ''}<time>${esc(hora(m.en))}</time></div>`;
  }).join('');
}
function chatHTML() {
  const o = S.v.orden; const abierta = ABIERTOS.includes(o.estado);
  const puedeChatear = o.acciones ? o.acciones.chatear !== false : abierta;
  return `<section class="chat" aria-label="${t('orden.chat')}"><div class="cab">${t('orden.chat')} · ${esc(o.contraparte ? o.contraparte.apodo : '')}<small>${abierta ? t('com.enLinea') : t('estado.' + o.estado)}</small></div>
    <div class="mensajes" id="chat-mensajes">${mensajesHTML()}</div>
    ${puedeChatear ? `<form class="redactar" data-form="chat" novalidate>
      <div id="chat-previa">${S.v.imagen ? previaImagenHTML() : ''}</div>
      <div class="linea"><input type="file" accept="image/*" id="chat-archivo" hidden data-cambio="chat-archivo">
        <button type="button" class="btn-icono" data-accion="chat-adjuntar" title="${t('orden.adjuntar')}" aria-label="${t('orden.adjuntar')}">${IC.clip}</button>
        <textarea id="chat-texto" class="entrada" rows="1" placeholder="${t('orden.escribir')}" data-entrada="chat-texto">${esc(S.v.borrador || '')}</textarea>
        <button type="submit" class="btn btn-oro" aria-label="${t('orden.enviar')}">${IC.enviar}</button></div></form>`
    : `<div class="cerrado">${t('orden.datosOcultos')}</div>`}
  </section>`;
}
function previaImagenHTML() { return `<div class="previa-img"><img src="${esc(S.v.imagen)}" alt=""><small>${t('orden.comprobante')} · ${esc(fmtNum(S.v.imagen.length / 1024, 0))} KB</small><button type="button" class="btn btn-fantasma btn-chico" data-accion="chat-quitar-imagen">${t('orden.quitarImagen')}</button></div>`; }
async function comprimirImagen(archivo) {
  if (!archivo.type || !archivo.type.startsWith('image/')) throw new Error('tipo');
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const LIM = 1.5 * 1024 * 1024; let lado = 1600; let calidad = 0.86;
    for (let i = 0; i < 10; i++) {
      const f = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * f)); c.height = Math.max(1, Math.round(img.height * f));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/jpeg', calidad);
      if (d.length <= LIM) return d;
      calidad -= 0.14; if (calidad < 0.45) { calidad = 0.82; lado = Math.round(lado * 0.7); }
    }
    throw new Error('grande');
  } finally { URL.revokeObjectURL(url); }
}
async function enviarChat(form) {
  const ta = $('#chat-texto'); const texto = ta ? ta.value.trim() : '';
  if (!texto && !S.v.imagen) return;
  const o = S.v.orden; ocupado(form, true);
  const cuerpo = {}; if (texto) cuerpo.texto = texto; if (S.v.imagen) cuerpo.imagen = S.v.imagen;
  const r = await api('POST', `/ordenes/${encodeURIComponent(o.id)}/mensajes`, cuerpo);
  ocupado(form, false);
  if (!r.ok) { aviso(mensajeError(r), 'mal'); return; }
  if (r.datos.mensaje && !S.v.mensajes.some(m => m.id === r.datos.mensaje.id)) S.v.mensajes.push(r.datos.mensaje);
  S.v.imagen = null; S.v.borrador = '';
  if (ta) { ta.value = ''; ta.style.height = ''; }
  const p = $('#chat-previa'); if (p) p.innerHTML = '';
  pintarMensajes(true);
}
function reloj() {
  const el = $('#reloj'); const caja = $('#temporizador'); if (!el || !S.v.fin) return;
  const seg = Math.round((S.v.fin - Date.now()) / 1000);
  el.textContent = mmss(seg);
  if (caja) {
    caja.classList.toggle('urgente', seg > 0 && seg <= 180); caja.classList.toggle('vencido', seg <= 0);
    const total = ((S.v.orden && S.v.orden.ventanaPagoMin) || 15) * 60;
    caja.style.setProperty('--p', String(Math.max(0, Math.min(1, seg / total))));
  }
  if (seg <= 0 && !S.v.vencioAvisado) { S.v.vencioAvisado = true; const tx = $('#temporizador .texto b'); if (tx) tx.textContent = t('orden.vencio'); }
}
function pasosHTML(o) {
  const c = o.miRol === 'comprador';
  const idx = o.estado === 'pendiente-pago' ? 0 : (o.estado === 'pagado' ? (c ? 2 : 1) : (o.estado === 'completada' ? 3 : 0));
  const pasos = c
    ? [['orden.c1', t('orden.c1d', { monto: fmtFiat(o.montoFiat, o.moneda, true) })], ['orden.c2', t('orden.c2d')], ['orden.c3', t('orden.c3d', { activo: o.activo })]]
    : [['orden.v1', t('orden.v1d', { n: o.ventanaPagoMin, monto: fmtFiat(o.montoFiat, o.moneda, true) })], ['orden.v2', t('orden.v2d')], ['orden.v3', t('orden.v3d')]];
  const actual = o.estado === 'pendiente-pago' ? (c ? 0 : 0) : (o.estado === 'pagado' ? (c ? 2 : 1) : idx);
  return `<div class="pasos">${pasos.map((p, i) => { const hecho = i < actual || o.estado === 'completada'; const act = i === actual && o.estado !== 'completada'; return `<div class="paso ${hecho ? 'hecho' : ''} ${act ? 'actual' : ''} ${!hecho && !act ? 'pendiente-p' : ''}"><span class="n">${hecho ? IC.check : i + 1}</span><div><b>${t(p[0])}</b><p>${esc(p[1])}</p></div></div>`; }).join('')}</div>`;
}
function datosPagoHTML(o) {
  const m = o.metodoPago || {}; const c = o.miRol === 'comprador';
  const campos = m.campos && typeof m.campos === 'object' ? Object.entries(m.campos) : [];
  const cat = metodoCatalogo(o.pais, m.tipo);
  const etiqueta = clave => { const def = cat && cat.campos ? cat.campos.find(x => x.clave === clave) : null; return def ? etiquetaCampo(def) : clave; };
  return `<div class="datos-pago"><div class="cab"><b>${c ? t('orden.datosPago') : t('orden.datosPagoVendedor')}</b><span class="chip ${esc(m.categoria || '')}">${esc(nombreMetodo(m.tipo, o.pais, m.nombreMetodo))}</span></div>
    ${m.banco ? `<div class="dato"><span>${t('pagos.banco')}</span>${copiable(m.banco)}</div>` : ''}
    ${m.titular ? `<div class="dato"><span>${t('pagos.titular')}</span>${copiable(m.titular)}</div>` : ''}
    ${campos.length ? campos.map(([k, v]) => `<div class="dato"><span>${esc(etiqueta(k))}</span>${copiable(String(v))}</div>`).join('') : (ABIERTOS.includes(o.estado) ? '' : `<div class="pequeno">${t('orden.datosOcultos')}</div>`)}
    <div class="dato"><span>${t('orden.montoFiat')}</span>${copiable(fijo(num(o.montoFiat), 2), fmtFiat(o.montoFiat, o.moneda, true))}</div>
    ${o.referenciaPago ? `<div class="dato"><span>${t('orden.referencia')}</span><b>${esc(o.referenciaPago)}</b></div>` : ''}
    ${c && ABIERTOS.includes(o.estado) ? notaHTML(t('orden.avisoPago'), '', IC.alerta).replace('class="nota ', 'class="nota mt12 mb0 ') : ''}
  </div>`;
}
function accionesOrdenHTML(o) {
  const a = o.acciones || {}; const l = [];
  if (a.pagar) l.push(`<button type="button" class="btn btn-comprar" data-accion="orden-pagado">${t('orden.marcarPagado')}</button>`);
  if (a.liberar) l.push(`<button type="button" class="btn btn-comprar" data-accion="orden-liberar">${IC.candado}${t('orden.liberar', { activo: o.activo })}</button>`);
  if (a.calificar) l.push(`<button type="button" class="btn btn-oro" data-accion="orden-calificar">${t('orden.calificar')}</button>`);
  if (a.apelar) l.push(`<button type="button" class="btn btn-linea" data-accion="orden-apelar">${t('orden.apelar')}</button>`);
  if (a.retirarApelacion) l.push(`<button type="button" class="btn btn-linea" data-accion="orden-retirar-apelacion">${t('orden.retirarApelacion')}</button>`);
  if (a.cancelar) l.push(`<button type="button" class="btn btn-peligro" data-accion="orden-cancelar">${t('orden.cancelar')}</button>`);
  return l.length ? `<div class="acciones mt16">${l.join('')}</div>` : '';
}
function finalOrdenHTML(o) {
  const c = o.miRol === 'comprador';
  if (o.estado === 'completada') {
    const recibido = fmtActivo(Math.max(0, num(o.cantidadActivo) - num(o.comision)), o.activo);
    return `<div class="orden-final ok"><div class="icono">${IC.check}</div><h2>${t('orden.completadaTitulo')}</h2>
      <div class="big">${esc(c ? recibido : fmtFiat(o.montoFiat, o.moneda, true))}</div>
      <p>${esc(c ? t('orden.completadaComprador', { cantidad: recibido }) : t('orden.completadaVendedor', { cantidad: fmtActivo(o.cantidadActivo, o.activo), monto: fmtFiat(o.montoFiat, o.moneda, true) }))}</p>
      ${o.completadaEn ? `<p class="pequeno mt8">${esc(fechaCorta(o.completadaEn))}</p>` : ''}</div>`;
  }
  if (o.estado === 'cancelada') {
    return `<div class="orden-final mal"><div class="icono">${IC.x}</div><h2>${t('orden.canceladaTitulo')}</h2>
      <p>${t('orden.canceladaPor.' + (o.canceladaPor || 'sistema'))}. ${esc(t('orden.canceladaDevuelto', { activo: o.activo }))}</p>
      ${o.motivoCancelacion ? `<p class="mt8"><b>${t('orden.motivo')}:</b> ${esc(o.motivoCancelacion)}</p>` : ''}
      ${o.apelacion && o.apelacion.resolucion ? `<p class="mt8">${t('orden.resolucion.' + o.apelacion.resolucion)}${o.apelacion.nota ? ' ' + esc(o.apelacion.nota) : ''}</p>` : ''}</div>`;
  }
  if (o.estado === 'apelacion' && o.apelacion) {
    const ap = o.apelacion; const quien = ap.abiertaPor === (yo() || {}).id ? t('com.tu') : (o.contraparte ? o.contraparte.apodo : '');
    return `<div class="orden-final apel"><div class="icono">${IC.alerta}</div><h2>${t('orden.apelacionTitulo')}</h2><p>${t('orden.apelacionDesc')}</p>
      <p class="mt8"><b>${esc(t('orden.apelacionAbiertaPor', { quien, t: fechaRel(ap.abiertaEn) }))}</b> · ${t('orden.motivoApelacion.' + ap.motivo)}</p>
      ${ap.detalle ? `<p class="pequeno mt8">${esc(ap.detalle)}</p>` : ''}</div>`;
  }
  return '';
}
function calificacionesHTML(o) {
  const c = o.miRol === 'comprador'; const cal = o.calificaciones || {};
  const mia = c ? cal.delComprador : cal.delVendedor; const suya = c ? cal.delVendedor : cal.delComprador;
  if (!mia && !suya) return '';
  const linea = (etq, x) => x ? `<div class="dato"><span>${etq}</span><b class="${x.tipo === 'positiva' ? 'verde' : 'rojo'}">${t('orden.' + x.tipo)}${x.comentario ? ` · <span style="font-family:var(--sans);font-weight:400;color:var(--ceniza)">${esc(x.comentario)}</span>` : ''}</b></div>` : '';
  return `<div class="tarjeta compacta">${linea(t('orden.calificaste'), mia)}${linea(t('orden.teCalificaron'), suya)}</div>`;
}
const vistaOrden = {
  clase: '',
  html() {
    if (S.v.error) return errorCargaHTML(S.v.error);
    if (!S.v.cargado) return esqueletos(4);
    const o = S.v.orden; const c = o.miRol === 'comprador'; const cp = o.contraparte || {};
    const abierta = ABIERTOS.includes(o.estado);
    const conReloj = o.estado === 'pendiente-pago' && S.v.fin !== null;
    const textoReloj = o.estado === 'pendiente-pago' ? (c ? t('orden.pagaEn') : t('orden.vendedorEspera')) : '';
    const estadoTexto = o.estado === 'pagado' ? (c ? t('orden.esperaVendedor') : t('orden.compruebaYLibera')) : (o.estado === 'pendiente-pago' && !c ? t('orden.esperaComprador') : '');
    return `<div class="orden-cab">
      <div class="fila-1"><a href="#/ordenes" class="btn-icono" aria-label="${t('com.volver')}">${IC.abajo.replace('class="ic"', 'class="ic" style="transform:rotate(90deg)"')}</a>
        <h1>${c ? t('orden.tuCompras') : t('orden.tuVendes')} <span class="activo-etq ${c ? 'verde' : 'rojo'}">${esc(fmtActivo(o.cantidadActivo, o.activo))}</span></h1><span class="estado ${esc(o.estado)}">${t('estado.' + o.estado)}</span></div>
      <div class="numero"><span>${t('orden.numero')}:</span>${copiable(o.numero)}<span>· ${esc(t('orden.abiertaHace', { t: fechaRel(o.creadaEn) }))}</span></div>
      ${conReloj ? `<div class="temporizador" id="temporizador"><div class="reloj" id="reloj" aria-live="off">${mmss((S.v.fin - Date.now()) / 1000)}</div><div class="texto"><b>${textoReloj}</b>${t('com.ventana')}: ${t('com.minutos', { n: o.ventanaPagoMin })}</div><div class="progreso" aria-hidden="true"><i></i></div></div>` : ''}
      ${estadoTexto && !conReloj ? notaHTML(esc(estadoTexto), o.estado === 'pagado' && !c ? 'verde' : 'gris', IC.info) : ''}
    </div>
    <div class="orden-grid"><div>
      ${finalOrdenHTML(o)}
      <div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('orden.resumen')}</h2><span class="pequeno">${t('orden.anuncio')} ${esc(o.anuncioNumero)}</span></div>
        <div class="resumen-orden">
          <div class="item grande"><span>${c ? t('orden.montoFiat') : t('orden.montoRecibir')}</span><b>${esc(fmtFiat(o.montoFiat, o.moneda, true))}</b></div>
          <div class="item"><span>${t('orden.precio')}</span><b>${esc(fmtFiat(o.precio, o.moneda))} / ${esc(o.activo)}</b></div>
          <div class="item"><span>${t('orden.cantidad')}</span><b>${esc(fmtActivo(o.cantidadActivo, o.activo))}</b></div>
          ${num(o.comision) > 0 ? `<div class="item"><span>${t('orden.comision')}</span><b>${esc(fmtActivo(o.comision, o.activo))}</b></div><div class="item"><span>${c ? t('orden.recibiras') : t('orden.entregas')}</span><b>${esc(fmtActivo(c ? num(o.cantidadActivo) - num(o.comision) : o.cantidadActivo, o.activo))}</b></div>` : ''}
        </div>
        ${custodiaHTML(o)}
        <div class="contraparte"><span class="avatar">${esc(inicial(cp.apodo))}${cp.enLinea ? '<i class="punto"></i>' : ''}</span><div class="cuerpo"><b>${c ? t('orden.vendedor') : t('orden.comprador')}: <a href="#/usuario/${esc(cp.id)}">${esc(cp.apodo)}</a>${insigniasHTML(cp)}</b><small>${repCorta(cp.reputacion)}</small></div><a href="#/usuario/${esc(cp.id)}" class="btn btn-fantasma btn-chico">${t('orden.verPerfil')}</a></div>
      </div>
      ${abierta || o.estado === 'completada' ? `<div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('orden.pasos')}</h2></div>${pasosHTML(o)}${(abierta || o.miRol === 'vendedor') && o.metodoPago ? datosPagoHTML(o) : ''}${accionesOrdenHTML(o)}</div>` : accionesOrdenHTML(o)}
      ${calificacionesHTML(o)}
    </div><div class="orden-chat-col">${chatHTML()}</div></div>`;
  },
  montar() {
    const id = S.ruta.id;
    if (!S.v.cargado && !S.v.cargando && !S.v.error) { cargarOrden(id); return; }
    if (!S.v.cargado) return;
    pintarMensajes(true);
    if (ABIERTOS.includes(S.v.orden.estado)) cada(sondearOrden, 4000);
    if (S.v.fin !== null) { reloj(); cada(reloj, 1000); }
  },
};
function dialogoOrden(clave) {
  const o = S.v.orden; if (!o) return; const cp = o.contraparte || {};
  const monto = fmtFiat(o.montoFiat, o.moneda, true);
  if (clave === 'pagado') abrirDialogo({ titulo: t('orden.pagadoTitulo'), texto: esc(t('orden.pagadoDesc', { monto })), form: 'orden-pagado', ok: t('orden.marcarPagado'), clase: 'btn-comprar', cuerpo: `<div class="campo"><label for="d-ref">${t('orden.referencia')} <span class="gris">(${t('com.opcional')})</span></label><input id="d-ref" name="referencia" class="entrada" maxlength="80" placeholder="${t('orden.referenciaPh')}"></div>` });
  if (clave === 'cancelar') abrirDialogo({ titulo: t('orden.cancelarTitulo'), texto: t('orden.cancelarDesc'), form: 'orden-cancelar', ok: t('orden.cancelar'), clase: 'btn-peligro', cuerpo: `<div class="campo"><label for="d-motivo">${t('orden.motivo')}</label><input id="d-motivo" name="motivo" class="entrada" maxlength="200" placeholder="${t('orden.motivoPh')}"></div>` });
  if (clave === 'liberar') abrirDialogo({ titulo: esc(t('orden.liberarTitulo', { cantidad: fmtActivo(o.cantidadActivo, o.activo) })), texto: esc(t('orden.liberarDesc', { monto })), form: 'orden-liberar', ok: t('orden.liberar', { activo: o.activo }), clase: 'btn-comprar', cuerpo: `<div class="campo"><label for="d-pass">${t('com.contrasena')}</label><input id="d-pass" name="contrasena" type="password" class="entrada" autocomplete="current-password" required></div>` });
  if (clave === 'apelar') abrirDialogo({ titulo: t('orden.apelarTitulo'), texto: t('orden.apelarDesc'), form: 'orden-apelar', ok: t('orden.apelar'), cuerpo: `<div class="campo"><label for="d-mot">${t('orden.motivo')}</label><select id="d-mot" name="motivo" class="entrada">${['no-recibi-pago', 'no-liberan', 'monto-incorrecto', 'otro'].filter(m => o.miRol === 'comprador' ? m !== 'no-recibi-pago' : m !== 'no-liberan').map(m => `<option value="${m}">${t('orden.motivoApelacion.' + m)}</option>`).join('')}</select></div><div class="campo"><label for="d-det">${t('com.detalle')}</label><textarea id="d-det" name="detalle" class="entrada" maxlength="1000" required placeholder="${t('orden.detallePh')}"></textarea></div>` });
  if (clave === 'retirar') abrirDialogo({ titulo: t('orden.retirarApelacionTitulo'), texto: t('orden.retirarApelacionDesc'), form: 'orden-retirar-apelacion', ok: t('orden.retirarApelacion') });
  if (clave === 'calificar') abrirDialogo({ titulo: esc(t('orden.calificarTitulo', { apodo: cp.apodo || '' })), texto: t('orden.calificarDesc'), form: 'orden-calificar', ok: t('orden.calificar'), cuerpo: `<div class="calif mb12"><button type="button" class="pos activa" data-accion="calif-tipo" data-v="positiva">${IC.bien}${t('orden.positiva')}</button><button type="button" class="neg" data-accion="calif-tipo" data-v="negativa">${IC.mal}${t('orden.negativa')}</button></div><input type="hidden" name="tipo" value="positiva"><div class="campo"><label for="d-com">${t('orden.comentario')}</label><textarea id="d-com" name="comentario" class="entrada" maxlength="300" placeholder="${t('orden.comentarioPh')}"></textarea></div>` });
}
async function accionOrden(form, ruta, cuerpo, okMsg) {
  const o = S.v.orden; if (!o) return; ocupado(form, true);
  const r = await api('POST', `/ordenes/${encodeURIComponent(o.id)}/${ruta}`, cuerpo);
  if (!r.ok) { errorDialogo(mensajeError(r)); ocupado(form, false); return; }
  cerrarCapa(); aviso(okMsg, 'ok');
  if (r.datos.orden) { fijarOrden(Object.assign({}, r.datos.orden, { mensajes: r.datos.orden.mensajes || S.v.mensajes })); }
  detenerSondeos(); render();
  if (!ABIERTOS.includes(S.v.orden.estado)) refrescarYo().then(() => render());
}

// ═══════════════════════════════════════════════════════════════════════════
// 10 · Mis órdenes
// ═══════════════════════════════════════════════════════════════════════════
const PESTANAS_ORDENES = [['abiertas', 'abiertas', 'ordenes.abiertas'], ['completada', 'completada', 'ordenes.completadas'], ['cancelada', 'cancelada', 'ordenes.canceladas'], ['apelacion', 'apelacion', 'ordenes.apelaciones']];
async function cargarOrdenes(silencioso) {
  const p = S.v.pestana || 'abiertas';
  if (!silencioso) { S.v.cargado = false; render(); }
  const r = await api('GET', '/ordenes?estado=' + p + '&porPagina=50');
  if (S.ruta.vista !== 'ordenes' || (S.v.pestana || 'abiertas') !== p) return;
  if (!r.ok) { S.v.error = mensajeError(r); render(); return; }
  S.v.error = null; S.v.ordenes = r.datos.ordenes || []; S.v.cargado = true;
  if (r.datos.abiertas !== undefined) S.abiertas = r.datos.abiertas;
  render();
}
function ordenFilaHTML(o) {
  const c = o.miRol === 'comprador'; const cp = o.contraparte || {};
  let resto = '';
  if (o.estado === 'pendiente-pago' && o.venceEn) { const seg = (new Date(o.venceEn).getTime() - Date.now()) / 1000; resto = `<span class="resto ${seg < 180 ? 'urgente' : ''}" data-vence="${esc(o.venceEn)}">${seg > 0 ? mmss(seg) : t('orden.vencio')}</span>`; }
  return `<a class="orden-fila" href="#/orden/${esc(o.id)}"><span class="lado ${c ? 'comprar' : 'vender'}">${c ? t('mercado.comprar').slice(0, 3).toUpperCase() : t('mercado.vender').slice(0, 3).toUpperCase()}</span>
    <div class="cuerpo"><b>${esc(fmtActivo(o.cantidadActivo, o.activo))} · ${esc(fmtFiat(o.montoFiat, o.moneda, true))}</b><small>${esc(t('ordenes.con', { apodo: cp.apodo || '' }))} · ${esc(o.numero)} · ${esc(fechaRel(o.creadaEn))}</small></div>
    <div class="derecha"><span class="estado ${esc(o.estado)}">${t('estado.' + o.estado)}</span>${resto}${o.noLeidos > 0 ? `<span class="pequeno oro">${t('ordenes.noLeidos', { n: o.noLeidos })}</span>` : ''}</div></a>`;
}
const vistaOrdenes = {
  clase: 'medio',
  html() {
    const p = S.v.pestana || 'abiertas';
    let cuerpo;
    if (S.v.error) cuerpo = errorCargaHTML(S.v.error);
    else if (!S.v.cargado) cuerpo = esqueletos(3);
    else if (!S.v.ordenes.length) cuerpo = p === 'abiertas' ? vacioHTML(t('ordenes.vacioAbiertas'), t('ordenes.vacioAbiertasSub'), `<a href="#/mercado" class="btn btn-oro btn-chico">${t('ordenes.irMercado')}</a>`) : vacioHTML(t('ordenes.vacio'));
    else cuerpo = S.v.ordenes.map(ordenFilaHTML).join('');
    return `<div class="titulo-vista"><h1>${t('ordenes.titulo')}</h1></div>${pestanasHTML(PESTANAS_ORDENES.map(x => ({ v: x[0], txt: t(x[2]), n: x[0] === 'abiertas' ? S.abiertas : 0 })), p, 'ordenes-pestana')}<div id="lista-ordenes">${cuerpo}</div>`;
  },
  montar() {
    if (!S.v.cargado && !S.v.cargando) { S.v.cargando = true; cargarOrdenes(true).finally(() => { S.v.cargando = false; }); }
    if ((S.v.pestana || 'abiertas') === 'abiertas') {
      cada(() => cargarOrdenes(true), 15000);
      cada(() => { $$('.orden-fila .resto').forEach(el => { const seg = (new Date(el.dataset.vence).getTime() - Date.now()) / 1000; el.textContent = seg > 0 ? mmss(seg) : t('orden.vencio'); el.classList.toggle('urgente', seg < 180); }); }, 1000);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 11 · Mis anuncios
// ═══════════════════════════════════════════════════════════════════════════
async function cargarAnuncios() {
  const r = await api('GET', '/anuncios');
  if (S.ruta.vista !== 'anuncios' || S.ruta.id) return;
  if (!r.ok) { S.v.error = mensajeError(r); render(); return; }
  S.v.anuncios = r.datos.anuncios || []; S.v.cargado = true; render();
}
function anuncioMioHTML(a) {
  const venta = a.lado === 'venta';
  const precio = a.precioEfectivo || a.precio || (a.tipoPrecio === 'flotante' ? fijo(referencia(a.moneda, a.activo) * num(a.margen) / 100, 2) : '0');
  const metodos = venta ? (a.metodos || []).map(m => nombreMetodo(m.tipo, a.pais, m.nombre) + (m.banco ? ' · ' + m.banco : '')) : (a.metodos || []).map(m => nombreMetodo(m.tipo, a.pais, m.nombre));
  const puedeActivar = a.estado === 'pausado' || a.estado === 'agotado';
  return `<article class="anuncio-mio">
    <div class="cab"><span class="ladoetq ${venta ? 'venta' : 'compra'}">${venta ? t('anuncios.vendes') : t('anuncios.compras')} ${esc(a.activo)}</span><span class="estado ${esc(a.estado)}">${t('anuncioEstado.' + a.estado)}</span><span class="num mono">${esc(a.numero)}</span></div>
    <div class="flex"><span class="bandera">${esc(bandera(a.pais))}</span><span class="pequeno">${esc(a.moneda)}</span></div>
    <div class="datos">
      <div><span>${t('anuncios.precioEfectivo')}</span><b>${esc(fmtFiat(precio, a.moneda))}${a.tipoPrecio === 'flotante' ? ` <small class="gris">${esc(fmtNum(a.margen, 1))} %</small>` : ''}</b></div>
      <div><span>${t('com.disponible')}</span><b>${esc(fmtActivo(a.cantidadDisponible, a.activo, true))} / ${esc(fmtActivo(a.cantidadTotal, a.activo, true))}</b></div>
      <div><span>${t('anuncios.limitesPorOrden')}</span><b>${esc(fmtFiat(a.limiteMin, a.moneda))} – ${esc(fmtFiat(a.limiteMax, a.moneda))}</b></div>
      <div><span>${t('com.ordenes')}</span><b>${t('anuncios.ordenesAbiertas', { n: a.ordenesAbiertas || 0 })} · ${t('anuncios.ordenesCompletadas', { n: a.ordenesCompletadas || 0 })}</b></div>
    </div>
    <div class="pequeno" style="grid-column:1/-1">${esc(metodos.join(', '))} · ${t('com.minutos', { n: a.ventanaPagoMin })}</div>
    ${a.estado !== 'cerrado' ? `<div class="acciones">
      <a href="#/anuncios/${esc(a.id)}" class="btn btn-linea btn-chico">${t('anuncios.editar')}</a>
      ${a.estado === 'activo' ? `<button type="button" class="btn btn-linea btn-chico" data-accion="anuncio-estado" data-id="${esc(a.id)}" data-v="pausado">${t('anuncios.pausar')}</button>` : ''}
      ${puedeActivar ? `<button type="button" class="btn btn-comprar btn-chico" data-accion="anuncio-estado" data-id="${esc(a.id)}" data-v="activo">${t('anuncios.activar')}</button>` : ''}
      <button type="button" class="btn btn-peligro btn-chico" data-accion="anuncio-cerrar" data-id="${esc(a.id)}">${t('anuncios.cerrar')}</button></div>` : ''}
  </article>`;
}
const vistaAnuncios = {
  clase: 'medio',
  html() {
    if (S.ruta.id) return formAnuncioHTML();
    let cuerpo;
    if (S.v.error) cuerpo = errorCargaHTML(S.v.error);
    else if (!S.v.cargado) cuerpo = esqueletos(3);
    else if (!S.v.anuncios.length) cuerpo = vacioHTML(t('anuncios.vacio'), t('anuncios.vacioSub'), `<a href="#/anuncios/nuevo" class="btn btn-oro btn-chico">${t('anuncios.nuevo')}</a>`);
    else cuerpo = S.v.anuncios.map(anuncioMioHTML).join('');
    const u = yo(); const aviso = u && u.puedeOperar === false ? notaHTML(esc(t('perfil.noOpera', { motivo: u.motivoNoOpera || '' })) + ` <a href="#/perfil" class="enlace">${t('hoja.irPerfil')}</a>`, 'roja', IC.alerta) : '';
    return `<div class="titulo-vista"><h1>${t('anuncios.titulo')}</h1><a href="#/anuncios/nuevo" class="btn btn-oro btn-chico">${IC.mas}${t('anuncios.nuevo')}</a></div>${aviso}${cuerpo}`;
  },
  montar() {
    if (S.ruta.id) { montarFormAnuncio(); return; }
    if (!S.v.cargado && !S.v.cargando) { S.v.cargando = true; cargarAnuncios().finally(() => { S.v.cargando = false; }); }
  },
};
function formNuevo() {
  const u = yo() || {}; const p = paisDe(u.pais) || paises()[0] || { iso2: '', moneda: { codigo: '' } };
  return { paso: 1, id: null, lado: 'venta', activo: 'ORIGEN', pais: p.iso2, moneda: p.moneda ? p.moneda.codigo : '', tipoPrecio: 'flotante', precio: '', margen: '100', cantidadTotal: '', limiteMin: '', limiteMax: '', metodosPagoIds: [], metodosTipos: [], ventanaPagoMin: 15, terminos: '', respuestaAutomatica: '', requisitos: { ordenesMin: 0, tasaFinalizacionMin: 0, diasRegistroMin: 0, soloAgentes: false }, enviando: false, error: null };
}
function formDesdeAnuncio(a) {
  const f = formNuevo();
  Object.assign(f, { id: a.id, numero: a.numero, estado: a.estado, lado: a.lado, activo: a.activo, pais: a.pais, moneda: a.moneda, tipoPrecio: a.tipoPrecio, precio: a.precio || '', margen: a.margen === null || a.margen === undefined ? '100' : String(a.margen), cantidadTotal: a.cantidadTotal, limiteMin: a.limiteMin, limiteMax: a.limiteMax, ventanaPagoMin: a.ventanaPagoMin, terminos: a.terminos || '', respuestaAutomatica: a.respuestaAutomatica || '', requisitos: Object.assign({ ordenesMin: 0, tasaFinalizacionMin: 0, diasRegistroMin: 0, soloAgentes: false }, a.requisitos || {}) });
  f.metodosPagoIds = a.lado === 'venta' ? (a.metodos || []).map(m => m.id).filter(Boolean) : [];
  f.metodosTipos = a.lado === 'compra' ? (a.metodos || []).map(m => m.tipo) : [];
  return f;
}
async function montarFormAnuncio() {
  const id = S.ruta.id;
  if (!S.v.form) {
    if (id === 'nuevo') { S.v.form = formNuevo(); }
    else if (!S.v.cargandoForm) {
      S.v.cargandoForm = true;
      const r = await api('GET', '/anuncios/' + encodeURIComponent(id));
      if (S.ruta.vista !== 'anuncios' || S.ruta.id !== id) return;
      S.v.cargandoForm = false;
      if (!r.ok) { S.v.error = r.estado === 404 ? t('anuncios.noEncontrado') : mensajeError(r); render(); return; }
      S.v.form = formDesdeAnuncio(r.datos.anuncio);
    } else return;
  }
  const f = S.v.form;
  if (S.v.listo) return;
  S.v.listo = true; // las cargas de apoyo se hacen una sola vez por visita
  const tareas = [];
  if (f.moneda && !S.precios[f.moneda]) tareas.push(cargarPrecios(f.moneda));
  if (!S.metodos) tareas.push(cargarMetodosPropios());
  if (!S.saldos.length) tareas.push(refrescarYo());
  if (tareas.length) await Promise.all(tareas);
  if (S.ruta.vista === 'anuncios' && S.ruta.id === id) render();
}
function precioEfectivoForm(f) { return f.tipoPrecio === 'fijo' ? num(f.precio) : referencia(f.moneda, f.activo) * num(f.margen) / 100; }
function vistaPrecioHTML(f) {
  const ref = referencia(f.moneda, f.activo); const ef = precioEfectivoForm(f);
  const dif = ref > 0 && ef > 0 ? (ef / ref - 1) * 100 : 0;
  return `<div class="vista-precio" id="vista-precio"><div><span>${t('anuncios.vistaPrevia')}</span><b>${ef > 0 ? esc(fmtFiat(ef, f.moneda)) : '—'}</b><div class="dif ${dif > 0.05 ? 'arriba' : (dif < -0.05 ? 'abajo' : '')}">${ref > 0 && ef > 0 ? (dif >= 0 ? '+' : '') + esc(fmtNum(dif, 2)) + ' % ' + t('anuncios.diferencia') : ''}</div></div>
    <div><span>${t('anuncios.referencia')}</span><b>${ref > 0 ? esc(fmtFiat(ref, f.moneda)) : '—'}</b><div class="dif gris">${ref > 0 ? '' : t('mercado.precioSinRef')}</div></div></div>`;
}
function validarFormAnuncio(f, paso) {
  const errores = {};
  const p = S.precios[f.moneda]; const fx = p && p.fx ? num(p.fx) : 0;
  const ef = precioEfectivoForm(f);
  if (paso === 1 || paso === 0) {
    if (f.tipoPrecio === 'fijo' && !(num(f.precio) > 0)) errores.precio = t('anuncios.errPrecio');
    if (f.tipoPrecio === 'flotante' && (num(f.margen) < 80 || num(f.margen) > 120)) errores.margen = t('anuncios.errMargen');
  }
  if (paso === 2 || paso === 0) {
    const cant = num(f.cantidadTotal); const min = num(f.limiteMin); const max = num(f.limiteMax);
    if (!(cant > 0)) errores.cantidadTotal = t('anuncios.errCantidad');
    else if (f.lado === 'venta' && !f.id) { const disp = num(saldoDe(f.activo).disponible); if (cant > disp + 1e-12) errores.cantidadTotal = t('anuncios.errSinSaldo', { activo: f.activo, max: fmtActivo(disp, f.activo) }); }
    if (!(min > 0) || !(max > 0)) errores.limites = t('anuncios.errLimites');
    else {
      if (min > max) errores.limites = t('anuncios.errMinMax');
      const minUsd = config().minOrdenUsd || 0;
      if (fx > 0 && min < minUsd * fx - 1e-9) errores.limites = t('anuncios.errMinUsd', { min: fmtFiat(minUsd * fx, f.moneda), usd: minUsd });
      if (ef > 0 && cant > 0 && max > cant * ef + 1e-6) errores.limites = t('anuncios.errMaxCantidad', { max: fmtFiat(cant * ef, f.moneda) });
    }
    if (f.lado === 'venta' && !f.metodosPagoIds.length) errores.metodos = t('anuncios.errSinMetodos');
    if (f.lado === 'compra' && !f.metodosTipos.length) errores.metodos = t('anuncios.errSinMetodos');
  }
  return errores;
}
function errHTML(e) { return e ? `<div class="error-campo">${esc(e)}</div>` : ''; }
function formAnuncioHTML() {
  if (S.v.error) return errorCargaHTML(S.v.error);
  const f = S.v.form; if (!f) return esqueletos(3);
  const pais = paisDe(f.pais); const edicion = !!f.id;
  const errores = S.v.mostrarErrores ? validarFormAnuncio(f, f.paso) : {};
  const verbo = f.lado === 'venta' ? t('anuncios.ladoVenta').toLowerCase() : t('anuncios.ladoCompra').toLowerCase();
  const pasos = `<div class="pasos-form">${[1, 2, 3].map(n => `<div class="${n === f.paso ? 'actual' : (n < f.paso ? 'hecho' : '')}">${n}. ${t('anuncios.paso' + n)}</div>`).join('')}</div>`;
  let cuerpo = '';
  if (f.paso === 1) {
    cuerpo = `${edicion ? notaHTML(t('anuncios.noEditable'), 'gris') : `<div class="campo"><label>${t('anuncios.lado')}</label><div class="opciones">
        <button type="button" class="opcion vender ${f.lado === 'venta' ? 'activa' : ''}" data-accion="af-lado" data-v="venta"><b>${t('anuncios.ladoVenta')} ${esc(f.activo)}</b><small>${esc(t('anuncios.ladoVentaDesc', { activo: f.activo, moneda: f.moneda }))}</small></button>
        <button type="button" class="opcion comprar ${f.lado === 'compra' ? 'activa' : ''}" data-accion="af-lado" data-v="compra"><b>${t('anuncios.ladoCompra')} ${esc(f.activo)}</b><small>${esc(t('anuncios.ladoCompraDesc', { activo: f.activo, moneda: f.moneda }))}</small></button></div></div>
      <div class="fila-campos"><div class="campo"><label>${t('com.activo')}</label><div class="pastillas">${activos().map(a => `<button type="button" class="${f.activo === a.simbolo ? 'activa' : ''}" data-accion="af-activo" data-v="${esc(a.simbolo)}">${esc(a.simbolo)}</button>`).join('')}</div></div>
      <div class="campo"><label for="af-pais">${t('com.pais')} · ${t('com.moneda')}</label>${selectPaises('pais', f.pais, 'id="af-pais" data-cambio="af-pais"')}</div></div>`}
      <div class="campo"><label>${t('anuncios.tipoPrecio')}</label><div class="opciones">
        <button type="button" class="opcion ${f.tipoPrecio === 'flotante' ? 'activa' : ''}" data-accion="af-tipo" data-v="flotante"><b>${t('anuncios.flotante')}</b><small>${t('anuncios.flotanteDesc')}</small></button>
        <button type="button" class="opcion ${f.tipoPrecio === 'fijo' ? 'activa' : ''}" data-accion="af-tipo" data-v="fijo"><b>${t('anuncios.fijo')}</b><small>${t('anuncios.fijoDesc')}</small></button></div></div>
      ${f.tipoPrecio === 'fijo' ? `<div class="campo"><label for="af-precio">${esc(t('anuncios.precioFijo', { activo: f.activo, moneda: f.moneda }))}</label><div class="entrada-grupo"><input id="af-precio" class="entrada num" type="text" inputmode="decimal" value="${esc(f.precio)}" data-entrada="af" data-campo="precio"><span class="sufijo">${esc(f.moneda)}</span></div>${errHTML(errores.precio)}</div>`
        : `<div class="campo"><label for="af-margen">${t('anuncios.margen')}</label><div class="entrada-grupo"><input id="af-margen" class="entrada num" type="text" inputmode="decimal" value="${esc(f.margen)}" data-entrada="af" data-campo="margen"><span class="sufijo">%</span></div><div class="ayuda">${t('anuncios.margenAyuda')}</div>${errHTML(errores.margen)}</div>`}
      ${vistaPrecioHTML(f)}`;
  } else if (f.paso === 2) {
    const propios = (S.metodos || []).filter(m => m.pais === f.pais && m.activo !== false);
    const tipos = pais && pais.metodos ? pais.metodos : [];
    const disp = saldoDe(f.activo).disponible;
    cuerpo = `<div class="campo"><label for="af-cant">${esc(t('anuncios.cantidadTotal', { verbo }))}</label><div class="entrada-grupo"><input id="af-cant" class="entrada num" type="text" inputmode="decimal" value="${esc(f.cantidadTotal)}" data-entrada="af" data-campo="cantidadTotal"><span class="sufijo">${f.lado === 'venta' ? `<button type="button" class="enlace" data-accion="af-max">${t('com.max')}</button>` : ''}${esc(f.activo)}</span></div>
      ${f.lado === 'venta' ? `<div class="ayuda">${esc(t('anuncios.saldoDisponible', { cantidad: fmtActivo(disp, f.activo) }))}</div>` : ''}${errHTML(errores.cantidadTotal)}</div>
      <div class="fila-campos"><div class="campo"><label for="af-min">${t('anuncios.limiteMin')}</label><div class="entrada-grupo"><input id="af-min" class="entrada num" type="text" inputmode="decimal" value="${esc(f.limiteMin)}" data-entrada="af" data-campo="limiteMin"><span class="sufijo">${esc(f.moneda)}</span></div></div>
      <div class="campo"><label for="af-max">${t('anuncios.limiteMax')}</label><div class="entrada-grupo"><input id="af-max" class="entrada num" type="text" inputmode="decimal" value="${esc(f.limiteMax)}" data-entrada="af" data-campo="limiteMax"><span class="sufijo">${esc(f.moneda)}</span></div></div></div>
      ${errHTML(errores.limites)}
      <div class="campo mt12"><label>${f.lado === 'venta' ? t('anuncios.metodosVenta') : t('anuncios.metodosCompra')}</label><div class="ayuda mb8">${esc(f.lado === 'venta' ? t('anuncios.metodosVentaDesc', { pais: nombrePais(pais) }) : t('anuncios.metodosCompraDesc', { pais: nombrePais(pais) }))}</div>
      ${f.lado === 'venta'
        ? (propios.length ? propios.map(m => `<label class="casilla ${f.metodosPagoIds.includes(m.id) ? 'activa' : ''}"><input type="checkbox" value="${esc(m.id)}" ${f.metodosPagoIds.includes(m.id) ? 'checked' : ''} data-cambio="af-metodo-id"><div class="cuerpo"><b>${esc(m.nombreMetodo)}${m.banco ? ' · ' + esc(m.banco) : ''}</b><small>${esc(m.titular)} · ${esc(enmascarar(Object.values(m.campos || {})[0] || ''))}</small></div></label>`).join('')
          : notaHTML(esc(t('anuncios.sinMetodosPropios', { pais: nombrePais(pais) })) + ` <a href="#/pagos" class="enlace">${t('pagos.agregar')}</a>`, 'roja', IC.alerta))
        : tipos.map(m => `<label class="casilla ${f.metodosTipos.includes(m.tipo) ? 'activa' : ''}"><input type="checkbox" value="${esc(m.tipo)}" ${f.metodosTipos.includes(m.tipo) ? 'checked' : ''} data-cambio="af-metodo-tipo"><div class="cuerpo"><b>${esc(IDIOMA === 'en' && m.nombreEn ? m.nombreEn : m.nombre)}</b></div></label>`).join('')}
      ${errHTML(errores.metodos)}</div>
      <div class="campo"><label>${t('anuncios.ventanaPago')}</label><div class="pastillas">${((S.catalogo && S.catalogo.ventanasPago) || [15, 30, 45, 60]).map(v => `<button type="button" class="${Number(f.ventanaPagoMin) === v ? 'activa' : ''}" data-accion="af-ventana" data-v="${v}">${t('com.minutos', { n: v })}</button>`).join('')}</div><div class="ayuda">${t('anuncios.ventanaDesc')}</div></div>`;
  } else {
    const r = f.requisitos;
    cuerpo = `<div class="campo"><label for="af-terminos">${t('anuncios.terminos')} <span class="gris">(${t('com.opcional')})</span></label><textarea id="af-terminos" class="entrada" maxlength="1000" placeholder="${t('anuncios.terminosPh')}" data-entrada="af" data-campo="terminos">${esc(f.terminos)}</textarea></div>
      <div class="campo"><label for="af-auto">${t('anuncios.respuestaAuto')} <span class="gris">(${t('com.opcional')})</span></label><textarea id="af-auto" class="entrada" maxlength="500" placeholder="${t('anuncios.respuestaAutoPh')}" data-entrada="af" data-campo="respuestaAutomatica">${esc(f.respuestaAutomatica)}</textarea></div>
      <div class="etq mb8">${t('anuncios.requisitos')}</div>
      <div class="fila-campos tres">
        <div class="campo"><label for="af-r1">${t('anuncios.reqOrdenes')}</label><input id="af-r1" class="entrada num" type="number" min="0" step="1" value="${esc(r.ordenesMin)}" data-entrada="af-req" data-campo="ordenesMin"></div>
        <div class="campo"><label for="af-r2">${t('anuncios.reqTasa')}</label><input id="af-r2" class="entrada num" type="number" min="0" max="100" step="1" value="${esc(r.tasaFinalizacionMin)}" data-entrada="af-req" data-campo="tasaFinalizacionMin"></div>
        <div class="campo"><label for="af-r3">${t('anuncios.reqDias')}</label><input id="af-r3" class="entrada num" type="number" min="0" step="1" value="${esc(r.diasRegistroMin)}" data-entrada="af-req" data-campo="diasRegistroMin"></div></div>
      <label class="interruptor mb12"><input type="checkbox" ${r.soloAgentes ? 'checked' : ''} data-cambio="af-req-agentes"><span class="pista"></span>${t('anuncios.reqAgentes')}</label>
      <div class="tarjeta compacta mt12"><div class="etq mb8">${t('anuncios.resumen')}</div>
        <div class="dato"><span>${t('anuncios.lado')}</span><b>${f.lado === 'venta' ? t('anuncios.ladoVenta') : t('anuncios.ladoCompra')} ${esc(f.activo)} · ${esc(f.moneda)}</b></div>
        <div class="dato"><span>${t('anuncios.vistaPrevia')}</span><b>${esc(fmtFiat(precioEfectivoForm(f), f.moneda))}${f.tipoPrecio === 'flotante' ? ' (' + esc(fmtNum(num(f.margen), 1)) + ' %)' : ''}</b></div>
        <div class="dato"><span>${t('com.cantidad')}</span><b>${esc(fmtActivo(f.cantidadTotal, f.activo))}</b></div>
        <div class="dato"><span>${t('anuncios.limitesPorOrden')}</span><b>${esc(fmtFiat(f.limiteMin, f.moneda))} – ${esc(fmtFiat(f.limiteMax, f.moneda))}</b></div>
        <div class="dato"><span>${t('anuncios.ventanaPago')}</span><b>${t('com.minutos', { n: f.ventanaPagoMin })}</b></div></div>`;
  }
  return `<div class="titulo-vista"><h1>${edicion ? t('anuncios.editarTitulo') : t('anuncios.nuevoTitulo')}</h1>${edicion ? `<span class="mono pequeno">${esc(f.numero || '')}</span>` : ''}</div>
    <form class="tarjeta" data-form="anuncio" novalidate>${pasos}${cuerpo}${f.error ? `<div class="error-campo mt12">${esc(f.error)}</div>` : ''}
    <div class="form-pie">${f.paso > 1 ? `<button type="button" class="btn btn-fantasma" data-accion="af-paso" data-v="${f.paso - 1}">${t('com.atras')}</button>` : `<a href="#/anuncios" class="btn btn-fantasma">${t('com.cancelar')}</a>`}
      ${f.paso < 3 ? `<button type="button" class="btn btn-oro" data-accion="af-paso" data-v="${f.paso + 1}">${t('com.continuar')}</button>` : `<button type="submit" class="btn ${f.lado === 'venta' ? 'btn-vender' : 'btn-comprar'}" ${f.enviando ? 'disabled' : ''}>${f.enviando ? t('anuncios.publicando') : (edicion ? t('anuncios.guardar') : t('anuncios.publicar'))}</button>`}</div></form>`;
}
function cambioCampoForm(campo, valor) {
  const f = S.v.form; if (!f) return; f[campo] = valor;
  if (campo === 'precio' || campo === 'margen') { const v = $('#vista-precio'); if (v) v.outerHTML = vistaPrecioHTML(f); }
}
async function enviarFormAnuncio(form) {
  const f = S.v.form; if (!f) return;
  const errores = validarFormAnuncio(f, 0);
  if (Object.keys(errores).length) { S.v.mostrarErrores = true; f.paso = errores.precio || errores.margen ? 1 : 2; render(); return; }
  const cuerpo = { tipoPrecio: f.tipoPrecio, cantidadTotal: fijo(num(f.cantidadTotal), 8), limiteMin: fijo(num(f.limiteMin), 2), limiteMax: fijo(num(f.limiteMax), 2), ventanaPagoMin: Number(f.ventanaPagoMin), terminos: f.terminos.trim() || undefined, respuestaAutomatica: f.respuestaAutomatica.trim() || undefined, requisitos: { ordenesMin: Number(f.requisitos.ordenesMin) || 0, tasaFinalizacionMin: Number(f.requisitos.tasaFinalizacionMin) || 0, diasRegistroMin: Number(f.requisitos.diasRegistroMin) || 0, soloAgentes: !!f.requisitos.soloAgentes } };
  if (f.tipoPrecio === 'fijo') cuerpo.precio = fijo(num(f.precio), 2); else cuerpo.margen = num(f.margen);
  if (f.lado === 'venta') cuerpo.metodosPagoIds = f.metodosPagoIds; else cuerpo.metodosTipos = f.metodosTipos;
  if (!f.id) Object.assign(cuerpo, { lado: f.lado, activo: f.activo, moneda: f.moneda, pais: f.pais });
  f.enviando = true; f.error = null; ocupado(form, true);
  const r = f.id ? await api('PATCH', '/anuncios/' + encodeURIComponent(f.id), cuerpo) : await api('POST', '/anuncios', cuerpo);
  f.enviando = false;
  if (!r.ok) { f.error = mensajeError(r); render(); return; }
  aviso(f.id ? t('anuncios.actualizado') : t('anuncios.publicado'), 'ok');
  S.v = {}; refrescarYo(); ir('#/anuncios');
}

// ═══════════════════════════════════════════════════════════════════════════
// 12 · Billetera
// ═══════════════════════════════════════════════════════════════════════════
async function cargarBilletera() {
  const u = yo(); const moneda = u ? u.moneda : '';
  const [b, p] = await Promise.all([api('GET', '/billetera'), moneda && !S.precios[moneda] ? cargarPrecios(moneda) : null]);
  if (S.ruta.vista !== 'billetera') return;
  if (!b.ok) { S.v.error = mensajeError(b); render(); return; }
  S.v.billetera = b.datos; S.saldos = b.datos.saldos || S.saldos; S.v.cargado = true; render();
  cargarPestanaBilletera();
}
async function cargarPestanaBilletera() {
  const p = S.v.pestana || 'movimientos';
  if (p === 'movimientos' && !S.v.movimientos) { const r = await api('GET', '/billetera/movimientos?pagina=1'); if (S.ruta.vista !== 'billetera') return; S.v.movimientos = r.ok ? r.datos.movimientos || [] : []; S.v.movTotal = r.ok ? r.datos.total : 0; S.v.movPagina = 1; render(); }
  if (p === 'depositar' && !S.v.depositos) { const r = await api('GET', '/billetera/depositos'); if (S.ruta.vista !== 'billetera') return; S.v.depositos = r.ok ? r.datos.depositos || [] : []; render(); }
  if (p === 'retirar' && !S.v.retiros) { const r = await api('GET', '/billetera/retiros'); if (S.ruta.vista !== 'billetera') return; S.v.retiros = r.ok ? r.datos.retiros || [] : []; render(); }
}
function valorAprox(cantidad, activo) { const u = yo(); if (!u) return ''; const ref = referencia(u.moneda, activo); return ref > 0 ? t('bill.aprox', { monto: fmtFiat(num(cantidad) * ref, u.moneda, true) }) : ''; }
function saldosHTML() {
  return `<div class="saldos">${activos().map(a => { const s = saldoDe(a.simbolo); return `<div class="saldo"><div class="sim">${esc(a.simbolo)}<small>${esc(a.nombre || '')}</small></div><div class="disp">${esc(fmtActivo(s.disponible, a.simbolo, true))}</div><div class="aprox">${t('bill.disponible')} ${esc(valorAprox(s.disponible, a.simbolo))}</div><div class="cust">${t('bill.custodia')}: <b>${esc(fmtActivo(s.congelado, a.simbolo, true))}</b></div></div>`; }).join('')}</div>`;
}
function movHTML(m) {
  const delta = num(m.disponibleDelta); const cong = num(m.congeladoDelta);
  const mas = delta > 0 || (delta === 0 && cong < 0);
  const principal = delta !== 0 ? delta : cong;
  return `<div class="mov"><div class="ic ${mas ? 'mas' : 'menos'}">${mas ? IC.abajo : IC.arriba}</div>
    <div class="cuerpo"><b>${t('mov.' + m.tipo) === 'mov.' + m.tipo ? esc(m.tipo) : t('mov.' + m.tipo)}</b><small>${esc(m.detalle || '')}${m.referencia ? ' · ' + esc(acortar(m.referencia, 8)) : ''} · ${esc(fechaCorta(m.en))}</small></div>
    <div class="delta ${principal > 0 ? 'mas' : (principal < 0 ? 'menos' : '')}">${principal > 0 ? '+' : ''}${esc(fmtActivo(principal, m.activo, true))}<small>${esc(m.activo)}${delta !== 0 && cong !== 0 ? ` · ${t('bill.custodia').toLowerCase()} ${cong > 0 ? '+' : ''}${esc(fmtActivo(cong, m.activo, true))}` : (delta === 0 ? ` · ${t('bill.custodia').toLowerCase()}` : '')}</small></div></div>`;
}
function selectActivos(id, actual, extra) { return `<select id="${id}" class="entrada" name="activo" ${extra || ''}>${activos().map(a => `<option value="${esc(a.simbolo)}" ${a.simbolo === actual ? 'selected' : ''}>${esc(a.simbolo)}</option>`).join('')}</select>`; }
function pestanaBilleteraHTML() {
  const p = S.v.pestana || 'movimientos'; const b = S.v.billetera || {}; const u = yo() || {};
  if (p === 'movimientos') {
    const l = S.v.movimientos;
    const filtro = S.v.movActivo || '';
    const lista = l ? l.filter(m => !filtro || m.activo === filtro) : null;
    return `<div class="flex mb12"><div class="pastillas"><button type="button" class="${!filtro ? 'activa' : ''}" data-accion="bill-mov-activo" data-v="">${t('com.todos')}</button>${activos().map(a => `<button type="button" class="${filtro === a.simbolo ? 'activa' : ''}" data-accion="bill-mov-activo" data-v="${esc(a.simbolo)}">${esc(a.simbolo)}</button>`).join('')}</div></div>
      ${!lista ? esqueletos(3) : (lista.length ? lista.map(movHTML).join('') + (S.v.movTotal > l.length ? `<div class="centrado mt12"><button type="button" class="btn btn-linea btn-chico" data-accion="bill-mov-mas">${t('com.verMas')}</button></div>` : '') : vacioHTML(t('bill.sinMovimientos')))}`;
  }
  if (p === 'depositar') {
    const cad = b.cadena || {};
    const dep = S.v.depositos;
    return `<div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('bill.depositarTitulo')}</h2></div><p class="sub mb12">${t('bill.depositarDesc')}</p>
      ${b.direccionDeposito ? `<div class="direccion-caja"><span class="etq">${t('bill.tesoreria')}</span>${copiable(b.direccionDeposito)}<div class="pequeno mt8">${t('bill.cadena')}: ${t('bill.cadenaNombre')}${cad.id ? ' · ID ' + esc(cad.id) : ''}${cad.explorador ? ` · <a class="enlace" href="${esc(cad.explorador)}" target="_blank" rel="noopener">${t('bill.explorador')}</a>` : ''}</div></div>` : notaHTML(t('bill.sinTesoreria'), 'roja', IC.alerta)}
      ${b.direccionCadena ? `<div class="pequeno mb12">${t('bill.desdeTuDireccion')}: <span class="mono">${esc(b.direccionCadena)}</span></div>` : notaHTML(esc(t('bill.sinDireccion')) + ` <a href="#/perfil" class="enlace">${t('bill.registrarDireccion')}</a>`, 'roja', IC.alerta)}
      <form data-form="deposito" novalidate><div class="fila-campos"><div class="campo"><label for="dep-activo">${t('com.activo')}</label>${selectActivos('dep-activo', 'ORIGEN')}</div>
        <div class="campo"><label for="dep-hash">${t('bill.txHash')}</label><input id="dep-hash" name="txHash" class="entrada mono" placeholder="${t('bill.txHashPh')}" autocomplete="off" required pattern="0x[0-9a-fA-F]{64}"></div></div>
        <div id="dep-error" class="error-campo mb12" hidden></div>
        <button type="submit" class="btn btn-oro" ${b.direccionDeposito && b.direccionCadena ? '' : 'disabled'}>${t('bill.registrarDeposito')}</button></form></div>
      <div class="tarjeta-cabeza"><h2>${t('bill.depositos')}</h2></div>
      ${!dep ? esqueletos(2) : (dep.length ? dep.map(d => `<div class="fila"><div class="cuerpo"><b>${esc(fmtActivo(d.cantidad, d.activo))}</b><small>${esc(acortar(d.txHash, 10))} · ${t('bill.bloque', { n: d.bloque })} · ${t('bill.confirmaciones', { n: d.confirmaciones })} · ${esc(fechaCorta(d.en))}${d.motivo ? ' · ' + esc(d.motivo) : ''}</small></div><span class="estado ${esc(d.estado)}">${t('depEstado.' + d.estado)}</span></div>`).join('') : vacioHTML(t('bill.sinDepositos')))}`;
  }
  const ret = S.v.retiros; const act = S.v.retActivo || 'ORIGEN'; const s = saldoDe(act);
  return `<div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('bill.retirarTitulo')}</h2></div><p class="sub mb12">${t('bill.retirarDesc')}</p>
    <form data-form="retiro" novalidate>
      <div class="fila-campos"><div class="campo"><label for="ret-activo">${t('com.activo')}</label>${selectActivos('ret-activo', act, 'data-cambio="ret-activo"')}</div>
      <div class="campo"><label for="ret-cant">${t('com.cantidad')}</label><div class="entrada-grupo"><input id="ret-cant" name="cantidad" class="entrada num" type="text" inputmode="decimal" autocomplete="off" required><span class="sufijo"><button type="button" class="enlace" data-accion="ret-max">${t('bill.usarTodo')}</button>${esc(act)}</span></div><div class="ayuda">${t('bill.disponible')}: ${esc(fmtActivo(s.disponible, act))}</div></div></div>
      <div class="campo"><label for="ret-dir">${t('bill.direccion')}</label><input id="ret-dir" name="direccion" class="entrada mono" placeholder="${t('bill.direccionPh')}" value="${esc(b.direccionCadena || '')}" autocomplete="off" required pattern="0x[0-9a-fA-F]{40}"></div>
      <div class="campo"><label for="ret-pass">${t('com.contrasena')}</label><input id="ret-pass" name="contrasena" type="password" class="entrada" autocomplete="current-password" required></div>
      <div id="ret-error" class="error-campo mb12" hidden></div>
      <button type="submit" class="btn btn-oro">${t('bill.solicitarRetiro')}</button></form></div>
    <div class="tarjeta-cabeza"><h2>${t('bill.retiros')}</h2></div>
    ${!ret ? esqueletos(2) : (ret.length ? ret.map(r => `<div class="fila"><div class="cuerpo"><b>${esc(fmtActivo(r.cantidad, r.activo))}</b><small>${esc(acortar(r.direccion, 8))} · ${esc(fechaCorta(r.solicitadoEn))}${r.txHash ? ' · tx ' + esc(acortar(r.txHash, 8)) : ''}${r.motivo ? ' · ' + esc(r.motivo) : ''}</small></div><div class="derecha"><span class="estado ${esc(r.estado)}">${t('retiroEstado.' + r.estado)}</span>${r.estado === 'pendiente' ? `<div class="mt8"><button type="button" class="btn btn-fantasma btn-chico" data-accion="ret-cancelar" data-id="${esc(r.id)}">${t('bill.cancelarRetiro')}</button></div>` : ''}</div></div>`).join('') : vacioHTML(t('bill.sinRetiros')))}`;
}
const vistaBilletera = {
  clase: 'medio',
  html() {
    if (S.v.error) return errorCargaHTML(S.v.error);
    if (!S.v.cargado) return `<div class="titulo-vista"><h1>${t('bill.titulo')}</h1></div>${esqueletos(3)}`;
    const p = S.v.pestana || 'movimientos';
    const faucet = esDemo() ? `<div class="nota gris">${IC.info}<div>${t('bill.faucetDesc')}<div class="flex mt8">${activos().map(a => `<button type="button" class="btn btn-linea btn-chico" data-accion="faucet" data-v="${esc(a.simbolo)}">${t('bill.faucet', { activo: a.simbolo })}</button>`).join('')}</div></div></div>` : '';
    return `<div class="titulo-vista"><h1>${t('bill.titulo')}</h1><span class="pequeno">${t('bill.custodiaDesc')}</span></div>${saldosHTML()}${faucet}
      ${pestanasHTML([{ v: 'movimientos', txt: t('bill.movimientos') }, { v: 'depositar', txt: t('bill.depositar') }, { v: 'retirar', txt: t('bill.retirar') }], p, 'bill-pestana')}
      <div id="bill-pestana">${pestanaBilleteraHTML()}</div>`;
  },
  montar() { if (!S.v.cargado && !S.v.cargando) { S.v.cargando = true; cargarBilletera().finally(() => { S.v.cargando = false; }); } },
};

// ═══════════════════════════════════════════════════════════════════════════
// 13 · Métodos de pago
// ═══════════════════════════════════════════════════════════════════════════
function metodoHTML(m) {
  const cat = metodoCatalogo(m.pais, m.tipo);
  const etiqueta = k => { const d = cat && cat.campos ? cat.campos.find(x => x.clave === k) : null; return d ? etiquetaCampo(d) : k; };
  return `<article class="metodo ${m.activo === false ? 'inactivo' : ''}"><div class="cab"><span class="bandera">${esc(bandera(m.pais))}</span><div class="cuerpo"><b>${esc(nombreMetodo(m.tipo, m.pais, m.nombreMetodo))}${m.banco ? ' · ' + esc(m.banco) : ''}</b><small>${esc(m.titular)} · ${esc(m.moneda)}</small></div><span class="chip ${esc(m.categoria || '')}">${m.activo === false ? t('pagos.inactivo') : t('pagos.activo')}</span></div>
    <div class="campos">${Object.entries(m.campos || {}).map(([k, v]) => `<div><span>${esc(etiqueta(k))}</span><b>${esc(enmascarar(v))}</b></div>`).join('')}</div>
    <div class="acciones"><button type="button" class="btn btn-linea btn-chico" data-accion="pago-editar" data-id="${esc(m.id)}">${t('com.editar')}</button><button type="button" class="btn btn-fantasma btn-chico" data-accion="pago-activo" data-id="${esc(m.id)}" data-v="${m.activo === false ? '1' : '0'}">${m.activo === false ? t('pagos.activar') : t('pagos.desactivar')}</button><button type="button" class="btn btn-peligro btn-chico" data-accion="pago-eliminar" data-id="${esc(m.id)}">${t('com.eliminar')}</button></div></article>`;
}
/** Los bancos de un país al detalle (tipos de cuenta, formato): se piden una vez por país. */
async function cargarBancos(pais) {
  if (S.bancosDetalle[pais] !== undefined) return;
  S.bancosDetalle[pais] = null;
  const r = await api('GET', '/mercado/bancos/' + encodeURIComponent(pais));
  S.bancosDetalle[pais] = r.ok ? (r.datos.bancos || []) : [];
  if (S.ruta.vista === 'pagos' && S.v.form) render();
}
function tipoBancoTexto(tipo) { const k = 'banco.tipo.' + tipo; const v = t(k); return v === k ? '' : v; }
function formPagoHTML() {
  const f = S.v.form; const pais = paisDe(f.pais); const tipos = pais && pais.metodos ? pais.metodos : [];
  const def = tipos.find(x => x.tipo === f.tipo) || null;
  const bancos = def && def.bancos ? def.bancos : [];
  const campos = def && def.campos ? def.campos : [];
  // Detalle de los bancos (tipos de cuenta, formato del identificador) para la transferencia bancaria.
  const conDetalle = def && def.tipo === 'transferencia' && bancos.length > 0;
  if (conDetalle && S.bancosDetalle[f.pais] === undefined) cargarBancos(f.pais);
  const detalle = conDetalle ? (S.bancosDetalle[f.pais] || []) : [];
  const bancoSel = detalle.find(b => b.nombre === f.banco) || null;
  const opcionBanco = b => `<option value="${esc(b)}" ${f.banco === b ? 'selected' : ''}>${esc(b)}</option>`;
  const opcionesBancos = detalle.length
    ? `<optgroup label="${esc(t('pagos.principales'))}">${detalle.filter(b => b.importancia === 'principal').map(b => opcionBanco(b.nombre)).join('')}</optgroup><optgroup label="${esc(t('pagos.otrosBancos'))}">${detalle.filter(b => b.importancia !== 'principal').map(b => opcionBanco(b.nombre)).join('')}</optgroup>`
    : bancos.map(opcionBanco).join('');
  const campoHTML = (c, i) => {
    const etiqueta = `<label for="pg-c-${esc(c.clave)}">${esc(etiquetaCampo(c))}${c.obligatorio ? '' : ` <span class="gris">(${t('com.opcional')})</span>`}</label>`;
    if (c.clave === 'tipoCuenta' && bancoSel && bancoSel.tiposCuenta && bancoSel.tiposCuenta.length) {
      const actual = f.campos.tipoCuenta || '';
      const enLista = bancoSel.tiposCuenta.includes(actual);
      const otro = f.tipoCuentaOtro || (actual && !enLista);
      return `<div class="campo">${etiqueta}<select id="pg-c-tipoCuenta" class="entrada" data-cambio="pg-tipocuenta"><option value="">${t('pagos.elegirTipoCuenta')}</option>${bancoSel.tiposCuenta.map(x => `<option value="${esc(x)}" ${actual === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="__otro" ${otro ? 'selected' : ''}>${t('pagos.tipoCuentaOtro')}</option></select>${otro ? `<input class="entrada mt8" value="${esc(enLista ? '' : actual)}" data-entrada="pg-campo" data-campo="tipoCuenta" maxlength="60" placeholder="${esc(t('pagos.tipoCuentaOtro'))}">` : ''}</div>`;
    }
    const formato = i === 0 && bancoSel && bancoSel.formatoCuenta ? `<div class="ayuda">${esc(t('pagos.formato', { f: bancoSel.formatoCuenta }))}</div>` : '';
    return `<div class="campo">${etiqueta}<input id="pg-c-${esc(c.clave)}" class="entrada mono" value="${esc(f.campos[c.clave] || '')}" data-entrada="pg-campo" data-campo="${esc(c.clave)}" ${c.obligatorio ? 'required' : ''} maxlength="60" autocomplete="off" ${c.ejemplo ? `placeholder="${esc(c.ejemplo)}"` : ''}>${formato}</div>`;
  };
  const notaBanco = bancoSel ? `<div class="ayuda">${[tipoBancoTexto(bancoSel.tipo), bancoSel.nota].filter(Boolean).map(esc).join(' · ')}</div>` : '';
  return `<form class="tarjeta" data-form="pago" novalidate><div class="tarjeta-cabeza"><h2>${f.id ? t('pagos.editarTitulo') : t('pagos.agregarTitulo')}</h2><button type="button" class="btn-icono" data-accion="pago-cancelar" aria-label="${t('com.cerrar')}">${IC.x}</button></div>
    <div class="fila-campos">
      <div class="campo"><label for="pg-pais">${t('com.pais')}</label>${f.id ? `<input class="entrada" value="${esc(bandera(f.pais) + ' ' + nombrePais(pais))}" disabled>` : selectPaises('pais', f.pais, 'id="pg-pais" data-cambio="pg-pais"')}</div>
      <div class="campo"><label for="pg-tipo">${t('pagos.tipo')}</label>${f.id ? `<input class="entrada" value="${esc(nombreMetodo(f.tipo, f.pais))}" disabled>` : `<select id="pg-tipo" class="entrada" data-cambio="pg-tipo"><option value="">${t('pagos.elegirTipo')}</option>${tipos.map(x => `<option value="${esc(x.tipo)}" ${f.tipo === x.tipo ? 'selected' : ''}>${esc(IDIOMA === 'en' && x.nombreEn ? x.nombreEn : x.nombre)}</option>`).join('')}</select>`}</div></div>
    ${def ? `${bancos.length ? `<div class="campo"><label for="pg-banco">${t('pagos.banco')}</label><select id="pg-banco" class="entrada" data-cambio="pg-banco"><option value="">${t('pagos.elegirBanco')}</option>${opcionesBancos}<option value="__otro" ${f.banco && !bancos.includes(f.banco) ? 'selected' : ''}>${t('pagos.otroBanco')}</option></select>${f.banco && !bancos.includes(f.banco) || f.bancoOtro ? `<input class="entrada mt8" placeholder="${t('pagos.banco')}" value="${esc(bancos.includes(f.banco) ? '' : f.banco)}" data-entrada="pg-banco-otro">` : notaBanco}</div>` : ''}
      <div class="campo"><label for="pg-titular">${t('pagos.titular')}</label><input id="pg-titular" class="entrada" value="${esc(f.titular)}" placeholder="${t('pagos.titularPh')}" data-entrada="pg-titular" required maxlength="80"></div>
      ${campos.map(campoHTML).join('')}` : ''}
    ${f.error ? `<div class="error-campo mb12">${esc(f.error)}</div>` : ''}
    <div class="acciones"><button type="button" class="btn btn-fantasma" data-accion="pago-cancelar">${t('com.cancelar')}</button><button type="submit" class="btn btn-oro" ${def ? '' : 'disabled'}>${t('com.guardar')}</button></div></form>`;
}
const vistaPagos = {
  clase: 'medio',
  html() {
    let cuerpo;
    if (S.v.error) cuerpo = errorCargaHTML(S.v.error);
    else if (!S.metodos) cuerpo = esqueletos(2);
    else if (!S.metodos.length && !S.v.form) cuerpo = vacioHTML(t('pagos.vacio'), t('pagos.vacioSub'), `<button type="button" class="btn btn-oro btn-chico" data-accion="pago-nuevo">${t('pagos.agregar')}</button>`);
    else cuerpo = S.metodos.map(metodoHTML).join('');
    return `<div class="titulo-vista"><div><h1>${t('pagos.titulo')}</h1><p>${t('pagos.sub')}</p></div>${S.v.form ? '' : `<button type="button" class="btn btn-oro btn-chico" data-accion="pago-nuevo">${IC.mas}${t('pagos.agregar')}</button>`}</div>${S.v.form ? formPagoHTML() : ''}${cuerpo}`;
  },
  montar() { if (!S.metodos && !S.v.cargando) { S.v.cargando = true; cargarMetodosPropios(true).then(() => { S.v.cargando = false; if (S.ruta.vista === 'pagos') render(); }); } },
};
async function enviarFormPago(form) {
  const f = S.v.form; if (!f) return;
  const def = metodoCatalogo(f.pais, f.tipo); if (!def) return;
  const campos = {};
  for (const c of def.campos || []) { const v = (f.campos[c.clave] || '').trim(); if (c.obligatorio && !v) { f.error = t('pagos.errCampo', { campo: etiquetaCampo(c) }); render(); return; } if (v) campos[c.clave] = v; }
  if (!f.titular.trim()) { f.error = t('pagos.errCampo', { campo: t('pagos.titular') }); render(); return; }
  if (def.bancos && def.bancos.length && !f.banco) { f.error = t('pagos.errCampo', { campo: t('pagos.banco') }); render(); return; }
  f.error = null; ocupado(form, true);
  const r = f.id ? await api('PATCH', '/metodos-pago/' + encodeURIComponent(f.id), { titular: f.titular.trim(), banco: f.banco || undefined, campos }) : await api('POST', '/metodos-pago', { pais: f.pais, tipo: f.tipo, banco: f.banco || undefined, titular: f.titular.trim(), campos });
  if (!r.ok) { f.error = mensajeError(r); render(); return; }
  aviso(t('pagos.guardado'), 'ok'); S.v.form = null; await cargarMetodosPropios(true); render();
}

// ═══════════════════════════════════════════════════════════════════════════
// 14 · Perfil y Genesis ID
// ═══════════════════════════════════════════════════════════════════════════
/** Debajo del estado: el asistente cuando la persona tiene algo que hacer; si no, qué está pasando. */
function gidCuerpoHTML(u) {
  if (u.gidEstado === 'verificada' || u.gidEstado === 'suspendida') return '';
  if (esDemo()) return '';
  if (!u.emailVerificado) return notaHTML(t('gid.correoPrimero'), '', IC.info);
  if (S.v.gidNoConfigurado) return notaHTML(t('gid.noConfigurado'), '', IC.info);
  if (S.v.gidError) return notaHTML(esc(S.v.gidError), 'roja', IC.alerta);
  const info = S.v.gidInfo;
  if (!info) {
    // La primera vez que hace falta, se pide: así aparece también justo después de confirmar el correo.
    if (!S.v.gidCargando) { S.v.gidCargando = true; sincronizarGid(true).finally(() => { S.v.gidCargando = false; }); }
    return esqueletos(1);
  }
  if (u.gidEstado === 'en-revision' && !info.rostroPendiente) return `<p class="pequeno">${t('gid.siguiente')}: ${esc(info.siguientePaso || t('gidEstado.en-revision'))}</p>`;
  return asistenteGidHTML();
}
function gidTexto(estado) { return { 'sin-verificar': t('gid.sinVerificar'), 'en-revision': t('gid.enRevision'), verificada: t('gid.verificada'), rechazada: t('gid.rechazada'), suspendida: t('gid.suspendida') }[estado] || ''; }
function asistenteGidHTML() {
  const g = S.v.gid || (S.v.gid = { paso: 1, error: null, ok: null, datos: {}, mrz: '', foto: null, problemas: [] });
  const u = yo() || {};
  const info = S.v.gidInfo || {};
  const pasos = ['gid.pasoDatos', 'gid.pasoDocumento', 'gid.pasoFoto'];
  const d = g.datos;
  const volumenes = [['500', '< 1 000 USD'], ['3000', '1 000 – 5 000 USD'], ['7500', '5 000 – 10 000 USD'], ['25000', '> 10 000 USD']];
  let cuerpo = '';
  if (g.paso === 1) cuerpo = `<div class="fila-campos"><div class="campo"><label for="g-nombre">${t('gid.nombreCompleto')}</label><input id="g-nombre" name="nombreCompleto" class="entrada" required value="${esc(d.nombreCompleto || info.nombreDeclarado || '')}" autocomplete="name"><div class="ayuda">${t('gid.nombreAyuda')}</div></div>
      <div class="campo"><label for="g-fecha">${t('gid.fechaNacimiento')}</label><input id="g-fecha" name="fechaNacimiento" type="date" class="entrada" required value="${esc(d.fechaNacimiento || info.fechaNacimientoDeclarada || '')}"></div>
      <div class="campo"><label for="g-pais">${t('gid.paisResidencia')}</label><select id="g-pais" name="paisResidencia" class="entrada">${paises().map(p => `<option value="${esc(p.iso3)}" ${(d.paisResidencia || info.paisResidencia || (paisDe(u.pais) || {}).iso3) === p.iso3 ? 'selected' : ''}>${esc(p.bandera || '')} ${esc(nombrePais(p))}</option>`).join('')}</select></div>
      <div class="campo"><label for="g-tel">${t('gid.telefono')}</label><input id="g-tel" name="telefono" type="tel" class="entrada" value="${esc(d.telefono || u.telefono || '')}" placeholder="${esc((paisDe(u.pais) || {}).prefijoTelefono || '')}"></div>
      <div class="campo"><label for="g-dir">${t('gid.direccion')}</label><input id="g-dir" name="direccion" class="entrada" value="${esc(d.direccion || '')}" autocomplete="street-address"></div>
      <div class="campo"><label for="g-ocup">${t('gid.ocupacion')}</label><input id="g-ocup" name="ocupacion" class="entrada" required value="${esc(d.ocupacion || '')}" placeholder="${esc(t('gid.ocupacionEj'))}"></div>
      <div class="campo"><label for="g-orig">${t('gid.origenFondos')}</label><input id="g-orig" name="origenFondos" class="entrada" required value="${esc(d.origenFondos || '')}" placeholder="${esc(t('gid.origenFondosEj'))}"></div>
      <div class="campo"><label for="g-vol">${t('gid.volumen')}</label><select id="g-vol" name="volumenEsperadoUsd" class="entrada">${volumenes.map(([v, l]) => `<option value="${v}" ${String(d.volumenEsperadoUsd || '3000') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="ayuda">${t('gid.volumenAyuda')}</div></div></div>
      <label class="casilla-simple"><input type="checkbox" name="pepDeclarado" ${d.pepDeclarado ? 'checked' : ''}><span>${t('gid.pep')}</span></label>`;
  else if (g.paso === 2) cuerpo = `<div class="campo"><label for="g-mrz">${t('gid.mrz')}</label><textarea id="g-mrz" name="mrz" class="entrada mono" rows="3" required placeholder="P&lt;HNDAPELLIDO&lt;&lt;NOMBRE&lt;&lt;…" spellcheck="false">${esc(g.mrz)}</textarea><div class="ayuda">${t('gid.mrzAyuda')}</div></div>`;
  else cuerpo = `${info.rostroPendiente ? notaHTML(t('gid.rostroRepetir'), 'roja', IC.alerta) : ''}<div class="campo"><label for="g-foto">${t('gid.foto')}</label><input id="g-foto" type="file" accept="image/*" capture="user" class="entrada" data-cambio="g-foto"><div class="ayuda">${t('gid.fotoAyuda')}</div>${g.foto ? `<div class="previa-img mt8"><img src="${esc(g.foto)}" alt=""><small>${esc(fmtNum(g.foto.length / 1024, 0))} KB</small></div>` : ''}</div>`;
  const boton = g.paso === 3 ? t('gid.enviar') : t('com.continuar');
  return `<form data-form="gid" novalidate class="mt12"><div class="etq mb8">${t('gid.asistente')}</div><div class="gid-pasos">${pasos.map((p, i) => `<div class="${i + 1 === g.paso ? 'actual' : (i + 1 < g.paso ? 'hecho' : '')}">${t(p)}</div>`).join('')}</div>
    ${info.siguientePaso && g.paso !== 3 ? `<p class="pequeno mb8">${t('gid.siguiente')}: ${esc(info.siguientePaso)}</p>` : ''}${cuerpo}${g.error ? notaHTML(esc(g.error), 'roja', IC.alerta) : ''}${g.ok ? notaHTML(esc(g.ok), 'verde', IC.check) : ''}
    <div class="acciones">${g.paso > 1 ? `<button type="button" class="btn btn-fantasma" data-accion="g-paso" data-v="${g.paso - 1}">${t('com.atras')}</button>` : ''}<button type="submit" class="btn btn-oro" ${g.paso === 3 && !g.foto ? 'disabled' : ''}>${boton}</button></div></form>`;
}
const vistaPerfil = {
  clase: 'medio',
  html() {
    const u = yo(); if (!u) return '';
    const p = paisDe(u.pais);
    const estadoOp = u.congelado ? notaHTML(esc(t('perfil.congelado', { motivo: u.motivoCongelado || '' })), 'roja', IC.alerta) : (u.puedeOperar === false ? notaHTML(esc(t('perfil.noOpera', { motivo: u.motivoNoOpera || '' })), 'roja', IC.alerta) : notaHTML(t('perfil.opera'), 'verde', IC.check));
    return `<div class="perfil-cab"><span class="avatar grande">${esc(inicial(u.apodo))}</span><div class="cuerpo"><h1>${esc(u.apodo)}${insigniasHTML(u)}</h1><p>${esc(u.email)} · ${esc(bandera(u.pais))} ${esc(nombrePais(p))} · ${esc(t('perfil.registrado', { n: u.registradoHaceDias || 0 }))}</p></div></div>
    ${estadoOp}
    ${correoHTML(u)}
    <div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('gid.titulo')}</h2><span class="estado ${esc(u.gidEstado)}">${t('gidEstado.' + u.gidEstado)}</span></div>
      <p class="sub mb12">${gidTexto(u.gidEstado)}</p>
      ${u.gid ? `<div class="dato"><span>${t('perfil.gidId')}</span>${copiable(u.gid)}</div>` : ''}${u.nombreLegal ? `<div class="dato"><span>${t('perfil.nombreLegal')}</span><b>${esc(u.nombreLegal)}</b></div>` : ''}
      <div class="acciones mt12"><button type="button" class="btn btn-linea btn-chico" data-accion="gid-sincronizar">${t('gid.sincronizar')}</button>${esDemo() && u.gidEstado !== 'verificada' ? `<button type="button" class="btn btn-comprar btn-chico" data-accion="gid-demo">${t('gid.verificarDemo')}</button>` : ''}</div>
      ${gidCuerpoHTML(u)}</div>
    <form class="tarjeta" data-form="perfil" novalidate><div class="tarjeta-cabeza"><h2>${t('perfil.datos')}</h2></div>
      <div class="fila-campos"><div class="campo"><label for="p-apodo">${t('perfil.apodo')}</label><input id="p-apodo" name="apodo" class="entrada" value="${esc(u.apodo)}" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" required></div>
      <div class="campo"><label for="p-correo">${t('perfil.correo')}</label><input id="p-correo" class="entrada" value="${esc(u.email)}" disabled></div>
      <div class="campo"><label for="p-pais">${t('perfil.pais')}</label>${selectPaises('pais', u.pais, 'id="p-pais"')}</div>
      <div class="campo"><label for="p-idioma">${t('perfil.idioma')}</label><select id="p-idioma" name="idioma" class="entrada"><option value="es" ${u.idioma === 'es' ? 'selected' : ''}>Español</option><option value="en" ${u.idioma === 'en' ? 'selected' : ''}>English</option></select></div>
      <div class="campo"><label for="p-tel">${t('perfil.telefono')}</label><input id="p-tel" name="telefono" type="tel" class="entrada" value="${esc(u.telefono || '')}" placeholder="${esc(p ? p.prefijoTelefono || '' : '')}"></div>
      <div class="campo"><label for="p-dir">${t('perfil.direccionCadena')}</label><input id="p-dir" name="direccionCadena" class="entrada mono" value="${esc(u.direccionCadena || '')}" placeholder="0x…" pattern="0x[0-9a-fA-F]{40}" autocomplete="off"><div class="ayuda">${t('perfil.direccionAyuda')}</div></div></div>
      <div id="perfil-error" class="error-campo mb12" hidden></div>
      <button type="submit" class="btn btn-oro">${t('perfil.guardar')}</button></form>
    <form class="tarjeta" data-form="contrasena" novalidate><div class="tarjeta-cabeza"><h2>${t('perfil.contrasena')}</h2></div>
      <div class="fila-campos"><div class="campo"><label for="c-actual">${t('perfil.contrasenaActual')}</label><input id="c-actual" name="actual" type="password" class="entrada" autocomplete="current-password" required></div>
      <div class="campo"><label for="c-nueva">${t('perfil.contrasenaNueva')}</label><input id="c-nueva" name="nueva" type="password" class="entrada" autocomplete="new-password" minlength="8" required><div class="ayuda">${t('auth.contrasenaMin')}</div></div></div>
      <div id="contrasena-error" class="error-campo mb12" hidden></div>
      <button type="submit" class="btn btn-linea">${t('perfil.cambiar')}</button></form>
    <div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('perfil.reputacion')}</h2><span class="pequeno">${t('perfil.reputacionSub')}</span></div>${reputacionHTML(u.reputacion)}</div>
    <div class="cuadricula dos mb12"><a href="#/pagos" class="fila enlace-fila"><div class="cuerpo"><b>${t('perfil.pagosLink')}</b><small>${t('pagos.sub')}</small></div>${IC.abajo.replace('class="ic"', 'class="ic" style="transform:rotate(-90deg);width:18px;height:18px;stroke:var(--humo)"')}</a>
      <a href="#/agente" class="fila enlace-fila"><div class="cuerpo"><b>${t('perfil.agenteLink')}</b><small>${t('agenteEstado.' + (u.estadoAgente || 'no'))}</small></div>${IC.abajo.replace('class="ic"', 'class="ic" style="transform:rotate(-90deg);width:18px;height:18px;stroke:var(--humo)"')}</a></div>
    <div class="centrado mt16"><button type="button" class="btn btn-peligro" data-accion="salir">${IC.salir}${t('perfil.salir')}</button></div>`;
  },
  montar() {
    if (S.v.refrescado) return;
    S.v.refrescado = true;
    refrescarYo().then(async () => {
      const u = yo();
      if (u && !esDemo() && u.emailVerificado && u.gidEstado !== 'verificada' && u.gidEstado !== 'suspendida' && !S.v.gidInfo && !S.v.gidCargando) await sincronizarGid(true);
      if (S.ruta.vista === 'perfil') render();
    });
  },
};
async function pasoGid(form) {
  const g = S.v.gid; if (!g) return; g.error = null; g.ok = null;
  const fd = new FormData(form);
  const campo = n => String(fd.get(n) || '').trim();
  ocupado(form, true);
  let r;
  if (g.paso === 1) {
    g.datos = { nombreCompleto: campo('nombreCompleto'), fechaNacimiento: campo('fechaNacimiento'), paisResidencia: campo('paisResidencia'), telefono: campo('telefono') || undefined,
      direccion: campo('direccion') || undefined, ocupacion: campo('ocupacion'), origenFondos: campo('origenFondos'), propositoCuenta: t('gid.propositoDefecto'),
      volumenEsperadoUsd: Number(campo('volumenEsperadoUsd')) || undefined, pepDeclarado: fd.get('pepDeclarado') === 'on' };
    if (!g.datos.nombreCompleto || !g.datos.fechaNacimiento || !g.datos.ocupacion || !g.datos.origenFondos) { g.error = t('com.obligatorio'); render(); return; }
    r = await api('POST', '/genesis/datos', g.datos);
    if (r.ok) { g.ok = t('gid.datosOk'); aplicarRespuestaGid(r.datos, 2); }
  } else if (g.paso === 2) {
    g.mrz = campo('mrz').toUpperCase(); if (!g.mrz) { g.error = t('com.obligatorio'); render(); return; }
    r = await api('POST', '/genesis/documento', { mrz: g.mrz });
    if (r.ok) {
      const d = r.datos.documento || {}; g.problemas = d.problemas || [];
      if (d.aceptable === false) { g.error = t('gid.documentoProblemas', { lista: g.problemas.join(', ') || '—' }); aplicarRespuestaGid(r.datos, 2); }
      else { g.ok = t('gid.documentoOk'); aplicarRespuestaGid(r.datos, 3); }
    }
  } else {
    if (!g.foto) { render(); return; }
    r = await api('POST', '/genesis/biometria', { selfie: g.foto });
    if (r.ok) { g.foto = null; aplicarRespuestaGid(r.datos, null); aviso(t('gid.fotoOk'), 'ok'); }
  }
  if (r && !r.ok) g.error = mensajeError(r);
  render();
}
/** Lo que el puente devuelve en cada paso: la identidad recortada, la cuenta ya sincronizada y, a veces, un aviso. */
function aplicarRespuestaGid(d, pasoSiNoDice) {
  if (!d) return;
  if (d.identidad) S.v.gidInfo = d.identidad;
  if (d.usuario) actualizarUsuario(d.usuario);
  const g = S.v.gid || (S.v.gid = { paso: 1, error: null, ok: null, datos: {}, mrz: '', foto: null, problemas: [] });
  const paso = d.identidad && d.identidad.paso ? d.identidad.paso : pasoSiNoDice;
  if (paso) g.paso = paso;
  if (d.aviso) aviso(d.aviso, 'mal', 8000);
}
async function sincronizarGid(silencioso) {
  S.v.gidError = null;
  const r = await api('GET', '/genesis/estado');
  if (!r.ok) {
    if (r.estado === 503 && r.datos && r.datos.codigo === 'genesis-no-configurado') { S.v.gidNoConfigurado = true; if (!silencioso) aviso(t('gid.noConfigurado'), 'mal'); render(); return; }
    S.v.gidError = mensajeError(r);
    if (!silencioso) aviso(S.v.gidError, 'mal');
    if (S.ruta.vista === 'perfil') render();
    return;
  }
  aplicarRespuestaGid(r.datos, null);
  if (!silencioso) aviso(t('gid.sincronizado'), 'ok');
  await refrescarYo(); if (S.ruta.vista === 'perfil') render();
}

// ═══════════════════════════════════════════════════════════════════════════
// 15 · Agente de cambio
// ═══════════════════════════════════════════════════════════════════════════
const vistaAgente = {
  clase: 'medio',
  html() {
    const d = S.v.datos;
    const intro = `<div class="titulo-vista"><h1>${t('agente.titulo')}</h1></div><div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('agente.que')}</h2></div><p class="sub">${t('agente.queDesc')}</p></div>`;
    if (S.v.error) return intro + errorCargaHTML(S.v.error);
    if (!d) return intro + esqueletos(2);
    const req = d.requisitos || {}; const sol = d.solicitud; const est = d.estadoAgente;
    const item = (ok, txt) => `<div class="${ok ? 'ok' : 'falta'}">${ok ? IC.check : IC.x}<span>${txt}</span></div>`;
    const requisitos = `<div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('agente.requisitos')}</h2><span class="estado ${d.cumple ? 'completada' : 'pausado'}">${d.cumple ? t('agente.cumples') : t('agente.noCumples')}</span></div>
      <div class="req-lista">${item(req.gidVerificado, t('agente.reqGid'))}${item(req.saldoSuficiente, esc(t('agente.reqSaldo', { garantia: fmtActivo(d.garantiaRequerida, 'ORIGEN') })))}${item((req.ordenesCompletadas || 0) >= (req.ordenesMin || 0), esc(t('agente.reqOrdenes', { n: req.ordenesCompletadas || 0, min: req.ordenesMin || 0 })))}</div>
      <div class="dato"><span>${t('agente.garantia')}</span><b>${esc(fmtActivo(d.garantiaRequerida, 'ORIGEN'))}</b></div><p class="pequeno mt8">${t('agente.garantiaDesc')}</p></div>`;
    let estado = '';
    if (est === 'aprobado') estado = `<div class="tarjeta">${notaHTML(`<b>${t('agente.eres')}</b>`, 'verde', IC.estrella)}<p class="sub mb12">${t('agente.renunciarDesc')}</p><button type="button" class="btn btn-peligro" data-accion="agente-renunciar">${t('agente.renunciar')}</button></div>`;
    else if (est === 'suspendido') estado = `<div class="tarjeta">${notaHTML(t('agente.suspendido'), 'roja', IC.alerta)}</div>`;
    else if (sol && sol.estado === 'pendiente') estado = `<div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('agente.estado')}</h2><span class="estado pendiente">${t('agente.solicitud.pendiente')}</span></div><p class="sub">${esc(t('agente.solicitadaEn', { t: fechaRel(sol.solicitadaEn) }))} · ${t('agente.garantia')}: ${esc(fmtActivo(sol.garantia, 'ORIGEN'))}</p><p class="terminos mt12">${esc(sol.descripcion)}</p><div class="acciones mt12"><button type="button" class="btn btn-linea" data-accion="agente-retirar">${t('agente.retirar')}</button></div></div>`;
    else {
      const previa = sol ? `<div class="dato"><span>${t('agente.estado')}</span><b><span class="estado ${esc(sol.estado)}">${t('agente.solicitud.' + sol.estado)}</span></b></div>${sol.nota ? `<div class="dato"><span>${t('agente.nota')}</span><b style="font-family:var(--sans);font-weight:400">${esc(sol.nota)}</b></div>` : ''}${sol.resueltaEn ? `<p class="pequeno mt8">${esc(t('agente.resueltaEn', { t: fechaRel(sol.resueltaEn) }))}</p>` : ''}<div class="divisor"></div>` : '';
      estado = `<form class="tarjeta" data-form="agente" novalidate><div class="tarjeta-cabeza"><h2>${t('agente.solicitar')}</h2></div>${previa}
        <div class="campo"><label for="ag-desc">${t('agente.descripcion')}</label><textarea id="ag-desc" name="descripcion" class="entrada" required minlength="20" maxlength="1000" placeholder="${t('agente.descripcionPh')}"></textarea></div>
        <div id="ag-error" class="error-campo mb12" hidden></div>
        <button type="submit" class="btn btn-oro" ${d.cumple ? '' : 'disabled'}>${t('agente.enviar')}</button></form>`;
    }
    return intro + requisitos + estado;
  },
  montar() { if (!S.v.datos && !S.v.cargando) { S.v.cargando = true; api('GET', '/agentes/estado').then(r => { S.v.cargando = false; if (S.ruta.vista !== 'agente') return; if (r.ok) S.v.datos = r.datos; else S.v.error = mensajeError(r); render(); }); } },
};
async function accionAgente(ruta, cuerpo, okMsg, form) {
  if (form) ocupado(form, true);
  const r = await api('POST', '/agentes/' + ruta, cuerpo);
  if (!r.ok) { if (form) { const e = $('#ag-error'); if (e) { e.textContent = mensajeError(r); e.hidden = false; } ocupado(form, false); } else aviso(mensajeError(r), 'mal'); return; }
  cerrarCapa(); aviso(okMsg, 'ok'); S.v = {}; await refrescarYo(); render();
}

// ═══════════════════════════════════════════════════════════════════════════
// 16 · Perfil público
// ═══════════════════════════════════════════════════════════════════════════
const vistaUsuario = {
  clase: 'medio',
  html() {
    if (S.v.error) return errorCargaHTML(S.v.error);
    const u = S.v.usuario; if (!u) return esqueletos(3);
    const anuncios = S.v.anuncios || [];
    return `<div class="perfil-cab"><span class="avatar grande">${esc(inicial(u.apodo))}${u.enLinea ? '<i class="punto"></i>' : ''}</span><div class="cuerpo"><h1>${esc(u.apodo)}${insigniasHTML(u)}</h1><p>${u.nombreAbreviado ? esc(u.nombreAbreviado) + ' · ' : ''}${esc(bandera(u.pais))} ${esc(nombrePais(paisDe(u.pais)))} · ${esc(t('usuario.registradoHace', { n: u.registradoHaceDias || 0 }))} · ${u.enLinea ? t('usuario.enLinea') : t('usuario.desconectado')}</p></div></div>
      <div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('perfil.reputacion').replace(/^\S+\s/, '')}</h2></div>${reputacionHTML(u.reputacion)}</div>
      <div class="tarjeta-cabeza"><h2>${t('usuario.anuncios')}</h2></div>
      ${anuncios.length ? anuncios.map(a => anuncioHTML(a)).join('') : vacioHTML(t('usuario.sinAnuncios'))}`;
  },
  montar() { if (!S.v.usuario && !S.v.cargando) { S.v.cargando = true; api('GET', '/usuarios/' + encodeURIComponent(S.ruta.id) + '/perfil').then(r => { S.v.cargando = false; if (S.ruta.vista !== 'usuario') return; if (r.ok) { S.v.usuario = r.datos.usuario; S.v.anuncios = r.datos.anuncios || []; } else S.v.error = r.estado === 404 ? t('usuario.noEncontrado') : mensajeError(r); render(); }); } },
};

// ═══════════════════════════════════════════════════════════════════════════
// 17 · Entrada / registro / SSO / demo
// ═══════════════════════════════════════════════════════════════════════════
const vistaAuth = {
  clase: 'angosto',
  html() {
    const registro = S.ruta.vista === 'registro'; const sso = S.ssoPendiente;
    const u = yo(); const paisIni = (u && u.pais) || S.mercado.pais || '';
    const demo = esDemo() ? `<div class="tarjeta"><div class="tarjeta-cabeza"><h2>${t('auth.demoTitulo')}</h2></div><p class="sub mb12">${t('auth.demoDesc')}</p><div class="demo-usuarios">${S.v.demoUsuarios ? (S.v.demoUsuarios.length ? S.v.demoUsuarios.map(d => `<button type="button" class="demo-usuario" data-accion="demo-entrar" data-v="${esc(d.apodo)}"><span class="avatar">${esc(inicial(d.apodo))}</span><div class="cuerpo"><b>${esc(d.apodo)} ${d.agente ? `<span class="insignia agente">${IC.estrella}${t('com.agente')}</span>` : ''}<span class="bandera">${esc(bandera(d.pais))}</span></b><small>${esc(d.descripcion || '')}</small></div></button>`).join('') : `<p class="pequeno">${t('ordenes.vacio')}</p>`) : esqueletos(2)}</div></div>` : '';
    const formEntrar = `<form class="tarjeta" data-form="entrar" novalidate>
      <div class="campo"><label for="a-correo">${t('auth.correo')}</label><input id="a-correo" name="email" type="email" class="entrada" required autocomplete="email" inputmode="email"></div>
      <div class="campo"><label for="a-pass">${t('auth.contrasena')}</label><input id="a-pass" name="contrasena" type="password" class="entrada" required autocomplete="current-password"></div>
      <div id="auth-error" class="error-campo mb12" hidden></div>
      <button type="submit" class="btn btn-oro btn-bloque">${t('auth.entrarBtn')}</button>
      <div class="divisor"></div>
      <button type="button" class="btn btn-linea btn-bloque" data-accion="sso-abrir">${IC.escudo}${t('auth.gid')}</button>
      <div id="sso-caja" ${S.v.ssoAbierto ? '' : 'hidden'}><p class="ayuda mt12 mb8">${t('auth.gidDesc')}</p><div class="campo"><input name="ssoToken" class="entrada mono" placeholder="${t('auth.tokenPh')}" autocomplete="off"></div><button type="button" class="btn btn-linea btn-bloque" data-accion="sso-enviar">${t('auth.gidBtn')}</button></div></form>
      <p class="alterna">${t('auth.sinCuenta')} <a href="#/registro" class="enlace">${t('auth.registro')}</a></p>`;
    const formRegistro = `<form class="tarjeta" data-form="registro" novalidate>
      ${sso ? notaHTML(esc(t('auth.gidNecesita', { gid: sso.gid || '' })), 'gris', IC.escudo) : ''}
      <div class="campo"><label for="r-correo">${t('auth.correo')}</label><input id="r-correo" name="email" type="email" class="entrada" required autocomplete="email" inputmode="email"></div>
      ${sso ? '' : `<div class="campo"><label for="r-pass">${t('auth.contrasena')}</label><input id="r-pass" name="contrasena" type="password" class="entrada" required minlength="8" autocomplete="new-password"><div class="ayuda">${t('auth.contrasenaMin')}</div></div>`}
      <div class="campo"><label for="r-apodo">${t('auth.apodo')}</label><input id="r-apodo" name="apodo" class="entrada" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" autocomplete="username"><div class="ayuda">${t('auth.apodoAyuda')}</div></div>
      <div class="fila-campos"><div class="campo"><label for="r-pais">${t('auth.pais')}</label>${selectPaises('pais', paisIni, 'id="r-pais"')}</div>
      <div class="campo"><label for="r-idioma">${t('auth.idioma')}</label><select id="r-idioma" name="idioma" class="entrada"><option value="es" ${IDIOMA === 'es' ? 'selected' : ''}>Español</option><option value="en" ${IDIOMA === 'en' ? 'selected' : ''}>English</option></select></div></div>
      <div id="auth-error" class="error-campo mb12" hidden></div>
      <button type="submit" class="btn btn-oro btn-bloque">${t('auth.crearBtn')}</button></form>
      <p class="alterna">${t('auth.conCuenta')} <a href="#/entrar" class="enlace">${t('auth.entrar')}</a></p>`;
    return `<div class="auth"><span class="marca grande"><b>Orden</b><span>Exchange</span></span><h1>${registro ? t('auth.tituloRegistro') : t('auth.titulo')}</h1><p>${t('auth.sub')}</p>${registro ? formRegistro : formEntrar}${demo}</div>`;
  },
  montar() { if (esDemo() && !S.v.demoUsuarios && !S.v.cargando) { S.v.cargando = true; api('GET', '/auth/demo/usuarios').then(r => { S.v.cargando = false; S.v.demoUsuarios = r.ok ? r.datos.usuarios || [] : []; if (S.ruta.vista === 'entrar' || S.ruta.vista === 'registro') render(); }); } },
};
function entradaOk(datos, msg) {
  fijarSesion(datos.token, datos.usuario);
  S.ssoPendiente = null; S.v = {};
  if (datos.codigoDemo) S.codigoDemo = datos.codigoDemo;
  const pendiente = datos.verificacionPendiente || (datos.usuario && datos.usuario.emailVerificado === false);
  aviso(msg || (pendiente ? t('correo.enviado') : t('auth.bienvenido', { apodo: datos.usuario ? datos.usuario.apodo : '' })), 'ok');
  refrescarYo().then(() => render());
  if (datos.usuario && datos.usuario.pais && paisDe(datos.usuario.pais) && !S.mercado.cargado) S.mercado.pais = datos.usuario.pais;
  // Con el correo sin confirmar, lo primero es confirmarlo: sin eso no hay Genesis ID.
  const destino = pendiente ? '#/perfil' : (S.despues && !/#\/(entrar|registro)/.test(S.despues) ? S.despues : '#/mercado'); S.despues = null;
  ir(destino);
}

/** Tarjeta para confirmar el correo: código de seis dígitos, reenvío, y el código a la vista en la demo. */
function correoHTML(u) {
  if (!u || u.emailVerificado !== false) return '';
  return `<div class="tarjeta" id="correo-pendiente"><div class="tarjeta-cabeza"><h2>${t('correo.titulo')}</h2><span class="estado en-revision">${t('correo.pendiente')}</span></div>
    <p class="sub mb12">${esc(t('correo.desc', { email: u.email }))}</p>
    ${S.codigoDemo ? notaHTML(`${t('correo.demo')} <b class="mono">${esc(S.codigoDemo)}</b>`, 'gris', IC.candado) : ''}
    <form data-form="correo" novalidate><div class="campo"><label for="codigo-correo">${t('correo.codigo')}</label><input id="codigo-correo" class="entrada mono" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" value="${esc(S.v.codigoCorreo || '')}" data-entrada="codigo-correo"></div>
    ${S.v.errorCorreo ? `<div class="error-campo mb12">${esc(S.v.errorCorreo)}</div>` : ''}
    <div class="acciones"><button type="submit" class="btn btn-oro">${t('correo.confirmar')}</button><button type="button" class="btn btn-linea" data-accion="correo-reenviar">${t('correo.reenviar')}</button></div></form></div>`;
}
function errorAuth(msg) { const e = $('#auth-error'); if (e) { e.textContent = msg; e.hidden = false; } }
async function entrarSso(token, extra) {
  const r = await api('POST', '/auth/sso', Object.assign({ token }, extra || {}));
  if (r.ok) { entradaOk(r.datos, r.datos.nuevo ? t('auth.cuentaCreada') : undefined); return true; }
  if (r.estado === 409 && r.datos.codigo === 'necesita-registro') { S.ssoPendiente = { token, gid: r.datos.gid }; S.v = {}; aviso(t('err.necesita-registro')); ir('#/registro'); if (location.hash === '#/registro') render(); return false; }
  aviso(mensajeError(r), 'mal'); errorAuth(mensajeError(r)); return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// 18 · Acciones (delegación de eventos)
// ═══════════════════════════════════════════════════════════════════════════
const ACC = {
  'cerrar-capa': () => cerrarCapa(),
  'cerrar-capa-ir': () => { cerrarCapa(); },
  recargar: () => { if (S.ruta.vista === 'mercado') { S.mercado.error = null; S.mercado.cargado = false; S.errorCatalogo = false; if (!S.catalogo) arrancar(); else cargarMercado(); } else { S.v = {}; render(); } },
  copiar: el => copiar(el.dataset.texto || ''),
  idioma: el => { fijarIdioma(el.dataset.v); if (S.sesion) api('PATCH', '/auth/yo', { idioma: IDIOMA }).then(r => { if (r.ok) actualizarUsuario(r.datos.usuario); }); if (S.v.gid) S.v.gid.error = null; render(); if (S.hoja) pintarHoja(); },
  salir: async () => { await api('POST', '/auth/salir'); cerrarSesion(false); aviso(t('auth.salioOk'), 'ok'); ir('#/mercado'); },
  'ver-imagen': el => { const c = $('#capa'); if (!c) return; c.innerHTML = `<div class="visor-img" data-accion="cerrar-capa"><img src="${esc(el.getAttribute('src'))}" alt=""></div>`; },
  // Mercado
  'm-quiero': el => { S.mercado.quiero = el.dataset.v; cambioFiltro(true); },
  'm-activo': el => { S.mercado.activo = el.dataset.v; cambioFiltro(true); },
  'm-mas': () => { S.mercado.pagina += 1; cargarMercado(true); },
  'abrir-hoja': el => abrirHoja(el.dataset.id),
  'h-max': () => { const { max } = limitesHoja(); const i = $('#h-fiat'); if (i) { i.value = fijo(max, 2); convertirHoja('fiat', i.value); } },
  'h-min': () => { const { min } = limitesHoja(); const i = $('#h-fiat'); if (i) { i.value = fijo(min, 2); convertirHoja('fiat', i.value); } },
  // Orden
  'orden-pagado': () => dialogoOrden('pagado'), 'orden-cancelar': () => dialogoOrden('cancelar'), 'orden-liberar': () => dialogoOrden('liberar'),
  'orden-apelar': () => dialogoOrden('apelar'), 'orden-retirar-apelacion': () => dialogoOrden('retirar'), 'orden-calificar': () => dialogoOrden('calificar'),
  'calif-tipo': el => { $$('.calif button').forEach(b => b.classList.toggle('activa', b === el)); const h = $('.dialogo input[name=tipo]'); if (h) h.value = el.dataset.v; },
  'chat-adjuntar': () => { const i = $('#chat-archivo'); if (i) i.click(); },
  'chat-quitar-imagen': () => { S.v.imagen = null; const p = $('#chat-previa'); if (p) p.innerHTML = ''; },
  'ordenes-pestana': el => { S.v.pestana = el.dataset.v; S.v.cargado = false; S.v.ordenes = []; detenerSondeos(); render(); },
  // Anuncios
  'anuncio-estado': async el => { el.disabled = true; const r = await api('POST', `/anuncios/${encodeURIComponent(el.dataset.id)}/estado`, { estado: el.dataset.v }); if (!r.ok) { aviso(mensajeError(r), 'mal'); el.disabled = false; return; } aviso(t('anuncios.actualizado'), 'ok'); S.v.cargado = false; render(); cargarAnuncios(); },
  'anuncio-cerrar': el => abrirDialogo({ titulo: t('anuncios.cerrarTitulo'), texto: t('anuncios.cerrarDesc'), form: 'anuncio-cerrar', ok: t('anuncios.cerrar'), clase: 'btn-peligro', cuerpo: `<input type="hidden" name="id" value="${esc(el.dataset.id)}">` }),
  'af-lado': el => { S.v.form.lado = el.dataset.v; S.v.form.metodosPagoIds = []; S.v.form.metodosTipos = []; render(); },
  'af-activo': el => { S.v.form.activo = el.dataset.v; render(); },
  'af-tipo': el => { S.v.form.tipoPrecio = el.dataset.v; render(); },
  'af-ventana': el => { S.v.form.ventanaPagoMin = Number(el.dataset.v); render(); },
  'af-max': () => { const f = S.v.form; f.cantidadTotal = fijo(num(saldoDe(f.activo).disponible), 8); render(); },
  'af-paso': el => { const f = S.v.form; const destino = Number(el.dataset.v); if (destino > f.paso) { const err = validarFormAnuncio(f, f.paso); if (Object.keys(err).length) { S.v.mostrarErrores = true; render(); return; } } S.v.mostrarErrores = false; f.paso = destino; render(); window.scrollTo(0, 0); },
  // Billetera
  'bill-pestana': el => { S.v.pestana = el.dataset.v; render(); cargarPestanaBilletera(); },
  'bill-mov-activo': el => { S.v.movActivo = el.dataset.v; render(); },
  'bill-mov-mas': async el => { el.disabled = true; const pag = (S.v.movPagina || 1) + 1; const r = await api('GET', '/billetera/movimientos?pagina=' + pag); if (r.ok) { S.v.movimientos = S.v.movimientos.concat(r.datos.movimientos || []); S.v.movPagina = pag; S.v.movTotal = r.datos.total; } render(); },
  faucet: async el => { el.disabled = true; const r = await api('POST', '/billetera/faucet', { activo: el.dataset.v, cantidad: el.dataset.v === 'ORIGEN' ? '100' : '1' }); if (!r.ok) { aviso(mensajeError(r), 'mal'); el.disabled = false; return; } aviso(t('bill.faucetOk'), 'ok'); S.saldos = r.datos.saldos || S.saldos; S.v.movimientos = null; render(); cargarPestanaBilletera(); },
  'ret-max': () => { const act = S.v.retActivo || 'ORIGEN'; const i = $('#ret-cant'); if (i) i.value = fijo(num(saldoDe(act).disponible), 8); },
  'ret-cancelar': async el => { el.disabled = true; const r = await api('POST', `/billetera/retiros/${encodeURIComponent(el.dataset.id)}/cancelar`); if (!r.ok) { aviso(mensajeError(r), 'mal'); el.disabled = false; return; } aviso(t('bill.retiroCancelado'), 'ok'); S.v.retiros = null; await refrescarYo(); render(); cargarPestanaBilletera(); },
  // Pagos
  'pago-nuevo': () => { const u = yo() || {}; S.v.form = { id: null, pais: paisDe(u.pais) ? u.pais : (paises()[0] || {}).iso2, tipo: '', banco: '', titular: '', campos: {}, error: null }; render(); window.scrollTo(0, 0); },
  'pago-editar': el => { const m = (S.metodos || []).find(x => x.id === el.dataset.id); if (!m) return; S.v.form = { id: m.id, pais: m.pais, tipo: m.tipo, banco: m.banco || '', titular: m.titular, campos: Object.assign({}, m.campos || {}), error: null }; render(); window.scrollTo(0, 0); },
  'pago-cancelar': () => { S.v.form = null; render(); },
  'pago-activo': async el => { el.disabled = true; const r = await api('PATCH', '/metodos-pago/' + encodeURIComponent(el.dataset.id), { activo: el.dataset.v === '1' }); if (!r.ok) { aviso(mensajeError(r), 'mal'); el.disabled = false; return; } await cargarMetodosPropios(true); render(); },
  'pago-eliminar': el => abrirDialogo({ titulo: t('pagos.eliminarTitulo'), texto: t('pagos.eliminarDesc'), form: 'pago-eliminar', ok: t('com.eliminar'), clase: 'btn-peligro', cuerpo: `<input type="hidden" name="id" value="${esc(el.dataset.id)}">` }),
  // Perfil / Genesis
  'gid-sincronizar': el => { el.disabled = true; sincronizarGid(false).finally(() => { el.disabled = false; }); },
  'correo-reenviar': async el => {
    el.disabled = true;
    const r = await api('POST', '/auth/reenviar-codigo', {});
    el.disabled = false;
    if (!r.ok) { aviso(mensajeError(r), 'mal'); return; }
    if (r.datos.codigoDemo) S.codigoDemo = r.datos.codigoDemo;
    aviso(t('correo.enviado'), 'ok'); render();
  },
  'gid-demo': async el => { el.disabled = true; const r = await api('POST', '/genesis/demo/verificar', {}); if (!r.ok) { aviso(mensajeError(r), 'mal'); el.disabled = false; return; } aviso(t('gid.verificadoDemo'), 'ok'); if (r.datos.usuario) actualizarUsuario(r.datos.usuario); await refrescarYo(); render(); },
  'g-paso': el => { S.v.gid.paso = Number(el.dataset.v); S.v.gid.error = null; S.v.gid.ok = null; render(); },
  // Agente
  'agente-retirar': () => abrirDialogo({ titulo: t('agente.retirar'), texto: t('agente.garantiaDesc'), form: 'agente-retirar', ok: t('agente.retirar') }),
  'agente-renunciar': () => abrirDialogo({ titulo: t('agente.renunciar'), texto: t('agente.renunciarDesc'), form: 'agente-renunciar', ok: t('agente.renunciar'), clase: 'btn-peligro' }),
  // Auth
  'sso-abrir': () => { S.v.ssoAbierto = !S.v.ssoAbierto; const c = $('#sso-caja'); if (c) { c.hidden = !S.v.ssoAbierto; const i = c.querySelector('input'); if (i && !c.hidden) i.focus(); } },
  'sso-enviar': async el => { const i = $('#sso-caja input'); const token = i ? i.value.trim() : ''; if (!token) { errorAuth(t('com.obligatorio')); return; } el.disabled = true; await entrarSso(token); el.disabled = false; },
  'demo-entrar': async el => { el.disabled = true; const r = await api('POST', '/auth/demo/entrar', { apodo: el.dataset.v }); if (!r.ok) { aviso(mensajeError(r), 'mal'); el.disabled = false; return; } entradaOk(r.datos); },
};

const ENT = {
  'm-monto': el => { S.mercado.monto = el.value; cargarMercadoConEspera(); },
  'h-fiat': el => convertirHoja('fiat', el.value),
  'h-activo': el => convertirHoja('activo', el.value),
  'chat-texto': el => { S.v.borrador = el.value; el.style.height = 'auto'; el.style.height = Math.min(120, el.scrollHeight) + 'px'; },
  af: el => cambioCampoForm(el.dataset.campo, el.value),
  'af-req': el => { S.v.form.requisitos[el.dataset.campo] = Number(el.value) || 0; },
  'pg-titular': el => { S.v.form.titular = el.value; },
  'pg-campo': el => { S.v.form.campos[el.dataset.campo] = el.value; },
  'pg-banco-otro': el => { S.v.form.banco = el.value; S.v.form.bancoOtro = true; },
};

const CAM = {
  'm-pais': el => { S.mercado.pais = el.value; S.mercado.metodo = ''; try { localStorage.setItem('ordenexchange.pais', el.value); } catch (_) { /* nada */ } cambioFiltro(true); const mo = monedaMercado(); cargarPrecios(mo).then(() => { const p = $('#pizarra'); if (p && S.ruta.vista === 'mercado') p.outerHTML = pizarraHTML(mo); }); },
  'm-metodo': el => { S.mercado.metodo = el.value; cambioFiltro(false); },
  'm-agentes': el => { S.mercado.soloAgentes = el.checked; cambioFiltro(false); },
  'm-orden': el => { S.mercado.orden = el.value; cambioFiltro(false); },
  'h-metodo': el => { const h = S.hoja; if (!h) return; h.metodo = h.compra ? h.anuncio.metodos[Number(el.value)] : h.propios.find(m => m.id === el.value); $$('.hoja .casilla').forEach(c => c.classList.toggle('activa', c.contains(el))); validarHoja(); },
  'chat-archivo': async el => { const f = el.files && el.files[0]; el.value = ''; if (!f) return; try { S.v.imagen = await comprimirImagen(f); const p = $('#chat-previa'); if (p) p.innerHTML = previaImagenHTML(); } catch (e) { aviso(e && e.message === 'tipo' ? t('err.imagenTipo') : t('err.imagenGrande'), 'mal'); } },
  'af-pais': el => { const p = paisDe(el.value); S.v.form.pais = el.value; S.v.form.moneda = p && p.moneda ? p.moneda.codigo : ''; S.v.form.metodosPagoIds = []; S.v.form.metodosTipos = []; if (!S.precios[S.v.form.moneda]) cargarPrecios(S.v.form.moneda).then(() => render()); render(); },
  'af-metodo-id': el => { const l = S.v.form.metodosPagoIds; if (el.checked) { if (!l.includes(el.value)) l.push(el.value); } else S.v.form.metodosPagoIds = l.filter(x => x !== el.value); el.closest('.casilla').classList.toggle('activa', el.checked); },
  'af-metodo-tipo': el => { const l = S.v.form.metodosTipos; if (el.checked) { if (!l.includes(el.value)) l.push(el.value); } else S.v.form.metodosTipos = l.filter(x => x !== el.value); el.closest('.casilla').classList.toggle('activa', el.checked); },
  'af-req-agentes': el => { S.v.form.requisitos.soloAgentes = el.checked; },
  'ret-activo': el => { S.v.retActivo = el.value; render(); },
  'pg-pais': el => { S.v.form.pais = el.value; S.v.form.tipo = ''; S.v.form.banco = ''; S.v.form.campos = {}; render(); },
  'pg-tipo': el => { S.v.form.tipo = el.value; S.v.form.banco = ''; S.v.form.campos = {}; S.v.form.bancoOtro = false; render(); },
  'pg-banco': el => { S.v.form.banco = el.value === '__otro' ? '' : el.value; S.v.form.bancoOtro = el.value === '__otro'; S.v.form.tipoCuentaOtro = false; if (S.v.form.campos.tipoCuenta) delete S.v.form.campos.tipoCuenta; render(); },
  'pg-tipocuenta': el => { const f = S.v.form; f.tipoCuentaOtro = el.value === '__otro'; if (el.value === '__otro') delete f.campos.tipoCuenta; else if (el.value) f.campos.tipoCuenta = el.value; else delete f.campos.tipoCuenta; render(); },
  'g-foto': async el => { const f = el.files && el.files[0]; if (!f) return; try { S.v.gid.foto = await comprimirImagen(f); } catch (e) { aviso(e && e.message === 'tipo' ? t('err.imagenTipo') : t('err.imagenGrande'), 'mal'); } render(); },
};

const FORM = {
  'dialogo-nada': () => cerrarCapa(),
  correo: async form => {
    const codigo = String((form.querySelector('#codigo-correo') || {}).value || '').replace(/\s/g, '');
    S.v.codigoCorreo = codigo;
    if (!/^\d{6}$/.test(codigo)) { S.v.errorCorreo = t('correo.invalido'); render(); return; }
    const r = await api('POST', '/auth/verificar-correo', { codigo });
    if (!r.ok) { S.v.errorCorreo = mensajeError(r); render(); return; }
    S.v.errorCorreo = null; S.v.codigoCorreo = ''; S.codigoDemo = null;
    if (S.sesion && r.datos.usuario) { S.sesion.usuario = r.datos.usuario; guardarSesion(); }
    aviso(t('correo.ok'), 'ok');
    refrescarYo().then(() => render());
  },
  hoja: form => enviarHoja(form),
  chat: form => enviarChat(form),
  'orden-pagado': form => accionOrden(form, 'pagado', { referencia: (new FormData(form).get('referencia') || '').trim() || undefined }, t('orden.pagadoOk')),
  'orden-cancelar': form => accionOrden(form, 'cancelar', { motivo: (new FormData(form).get('motivo') || '').trim() || undefined }, t('orden.canceladaOk')),
  'orden-liberar': form => { const c = new FormData(form).get('contrasena') || ''; if (!c) { errorDialogo(t('com.obligatorio')); return; } accionOrden(form, 'liberar', { contrasena: c }, t('orden.liberadoOk')); },
  'orden-apelar': form => { const fd = new FormData(form); const detalle = (fd.get('detalle') || '').trim(); if (!detalle) { errorDialogo(t('com.obligatorio')); return; } accionOrden(form, 'apelar', { motivo: fd.get('motivo'), detalle }, t('orden.apeladaOk')); },
  'orden-retirar-apelacion': form => accionOrden(form, 'apelacion/retirar', undefined, t('orden.apelacionRetiradaOk')),
  'orden-calificar': form => { const fd = new FormData(form); accionOrden(form, 'calificar', { tipo: fd.get('tipo') || 'positiva', comentario: (fd.get('comentario') || '').trim() || undefined }, t('orden.calificadaOk')); },
  anuncio: form => enviarFormAnuncio(form),
  'anuncio-cerrar': async form => { const id = new FormData(form).get('id'); ocupado(form, true); const r = await api('POST', `/anuncios/${encodeURIComponent(id)}/estado`, { estado: 'cerrado' }); if (!r.ok) { errorDialogo(mensajeError(r)); return; } cerrarCapa(); aviso(t('anuncios.cerrado'), 'ok'); S.v.cargado = false; render(); cargarAnuncios(); },
  deposito: async form => { const fd = new FormData(form); const txHash = (fd.get('txHash') || '').trim(); const e = $('#dep-error'); if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) { if (e) { e.textContent = t('err.tx-no-encontrada'); e.hidden = false; } return; } if (e) e.hidden = true; ocupado(form, true); const r = await api('POST', '/billetera/depositos', { txHash, activo: fd.get('activo') }); ocupado(form, false); if (!r.ok) { if (e) { e.textContent = mensajeError(r); e.hidden = false; } return; } aviso(t('bill.depositoOk', { cantidad: fmtActivo(r.datos.deposito.cantidad, r.datos.deposito.activo) }), 'ok'); S.v.depositos = null; S.v.movimientos = null; await refrescarYo(); render(); cargarPestanaBilletera(); },
  retiro: async form => { const fd = new FormData(form); const e = $('#ret-error'); const cuerpo = { activo: fd.get('activo'), cantidad: fijo(num(fd.get('cantidad')), 8), direccion: (fd.get('direccion') || '').trim(), contrasena: fd.get('contrasena') || '' }; if (!(num(cuerpo.cantidad) > 0) || !/^0x[0-9a-fA-F]{40}$/.test(cuerpo.direccion) || !cuerpo.contrasena) { if (e) { e.textContent = t('com.obligatorio'); e.hidden = false; } return; } if (num(cuerpo.cantidad) > num(saldoDe(cuerpo.activo).disponible)) { if (e) { e.textContent = t('bill.sinSaldo'); e.hidden = false; } return; } if (e) e.hidden = true; ocupado(form, true); const r = await api('POST', '/billetera/retiros', cuerpo); ocupado(form, false); if (!r.ok) { if (e) { e.textContent = mensajeError(r); e.hidden = false; } return; } aviso(t('bill.retiroOk'), 'ok'); S.v.retiros = null; S.v.movimientos = null; await refrescarYo(); render(); cargarPestanaBilletera(); },
  pago: form => enviarFormPago(form),
  'pago-eliminar': async form => { const id = new FormData(form).get('id'); ocupado(form, true); const r = await api('DELETE', '/metodos-pago/' + encodeURIComponent(id)); if (!r.ok) { errorDialogo(r.estado === 409 ? t('pagos.enUso') : mensajeError(r)); return; } cerrarCapa(); aviso(t('pagos.eliminado'), 'ok'); await cargarMetodosPropios(true); render(); },
  perfil: async form => { const fd = new FormData(form); const e = $('#perfil-error'); const cuerpo = { apodo: (fd.get('apodo') || '').trim(), pais: fd.get('pais'), idioma: fd.get('idioma'), telefono: (fd.get('telefono') || '').trim() || null, direccionCadena: (fd.get('direccionCadena') || '').trim() || null }; if (!/^[A-Za-z0-9_]{3,20}$/.test(cuerpo.apodo)) { if (e) { e.textContent = t('auth.apodoFormato'); e.hidden = false; } return; } if (cuerpo.direccionCadena && !/^0x[0-9a-fA-F]{40}$/.test(cuerpo.direccionCadena)) { if (e) { e.textContent = t('perfil.direccionAyuda'); e.hidden = false; } return; } if (e) e.hidden = true; ocupado(form, true); const r = await api('PATCH', '/auth/yo', cuerpo); ocupado(form, false); if (!r.ok) { if (e) { e.textContent = mensajeError(r); e.hidden = false; } return; } actualizarUsuario(r.datos.usuario); if (cuerpo.idioma !== IDIOMA) fijarIdioma(cuerpo.idioma); aviso(t('perfil.guardado'), 'ok'); render(); },
  contrasena: async form => { const fd = new FormData(form); const e = $('#contrasena-error'); const actual = fd.get('actual') || ''; const nueva = fd.get('nueva') || ''; if (nueva.length < 8) { if (e) { e.textContent = t('auth.contrasenaMin'); e.hidden = false; } return; } ocupado(form, true); const r = await api('POST', '/auth/contrasena', { actual, nueva }); ocupado(form, false); if (!r.ok) { if (e) { e.textContent = mensajeError(r); e.hidden = false; } return; } if (e) e.hidden = true; form.reset(); aviso(t('perfil.cambiada'), 'ok'); },
  gid: form => pasoGid(form),
  agente: form => { const d = (new FormData(form).get('descripcion') || '').trim(); if (d.length < 20) { const e = $('#ag-error'); if (e) { e.textContent = t('com.obligatorio'); e.hidden = false; } return; } accionAgente('solicitar', { descripcion: d }, t('agente.solicitadaOk'), form); },
  'agente-retirar': form => { ocupado(form, true); accionAgente('retirar', undefined, t('agente.retiradaOk')); },
  'agente-renunciar': form => { ocupado(form, true); accionAgente('renunciar', undefined, t('agente.renunciadoOk')); },
  entrar: async form => { const fd = new FormData(form); const email = (fd.get('email') || '').trim(); const contrasena = fd.get('contrasena') || ''; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorAuth(t('auth.correoInvalido')); return; } if (!contrasena) { errorAuth(t('com.obligatorio')); return; } ocupado(form, true); const r = await api('POST', '/auth/entrar', { email, contrasena }); if (!r.ok) { ocupado(form, false); errorAuth(mensajeError(r)); return; } entradaOk(r.datos); },
  registro: async form => {
    const fd = new FormData(form); const email = (fd.get('email') || '').trim(); const apodo = (fd.get('apodo') || '').trim(); const pais = fd.get('pais'); const idioma = fd.get('idioma');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorAuth(t('auth.correoInvalido')); return; }
    if (!/^[A-Za-z0-9_]{3,20}$/.test(apodo)) { errorAuth(t('auth.apodoFormato')); return; }
    const contrasena = fd.get('contrasena') || ''; if (contrasena.length < 8) { errorAuth(t('auth.contrasenaMin')); return; }
    // Con sesión única la cuenta nace verificada, pero la contraseña hace falta igual: liberar y retirar la piden.
    if (S.ssoPendiente) { ocupado(form, true); const ok = await entrarSso(S.ssoPendiente.token, { email, apodo, pais, idioma, contrasena }); if (!ok) ocupado(form, false); return; }
    ocupado(form, true);
    const r = await api('POST', '/auth/registro', { email, contrasena, apodo, pais, idioma });
    if (!r.ok) { ocupado(form, false); errorAuth(mensajeError(r)); return; }
    entradaOk(r.datos, t('auth.cuentaCreada'));
  },
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-accion]'); if (!el) return;
  const fn = ACC[el.dataset.accion]; if (!fn) return;
  if (el.tagName !== 'A' || el.dataset.accion !== 'cerrar-capa-ir') ev.preventDefault();
  fn(el, ev);
});
document.addEventListener('input', ev => { const el = ev.target.closest('[data-entrada]'); if (!el) return; const fn = ENT[el.dataset.entrada]; if (fn) fn(el, ev); });
document.addEventListener('change', ev => { const el = ev.target.closest('[data-cambio]'); if (!el) return; const fn = CAM[el.dataset.cambio]; if (fn) fn(el, ev); });
document.addEventListener('submit', ev => { const f = ev.target.closest('form[data-form]'); if (!f) return; ev.preventDefault(); const fn = FORM[f.dataset.form]; if (fn) fn(f, ev); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#capa') && $('#capa').innerHTML) cerrarCapa(); });

// ═══════════════════════════════════════════════════════════════════════════
// 19 · Render y arranque
// ═══════════════════════════════════════════════════════════════════════════
const VISTAS = { mercado: vistaMercado, orden: vistaOrden, ordenes: vistaOrdenes, anuncios: vistaAnuncios, billetera: vistaBilletera, pagos: vistaPagos, perfil: vistaPerfil, agente: vistaAgente, usuario: vistaUsuario, entrar: vistaAuth, registro: vistaAuth };
function render() {
  const app = $('#app'); if (!app) return;
  const vista = VISTAS[S.ruta.vista] || vistaMercado;
  const foco = document.activeElement && document.activeElement.id;
  const clave = S.ruta.vista + '/' + (S.ruta.id || '');
  const entra = S.vistaPintada !== clave; S.vistaPintada = clave;
  app.innerHTML = cabecera() + `<main id="contenido" class="contenido ${vista.clase || ''} ${entra ? 'entra' : ''}">${vista.html()}</main>` + pie() + barraInferior();
  document.title = 'OrdenExchange · ' + (S.ruta.vista === 'mercado' ? t('nav.mercado') : (t('nav.' + S.ruta.vista) === 'nav.' + S.ruta.vista ? t('orden.titulo') : t('nav.' + S.ruta.vista)));
  if (foco) { const el = document.getElementById(foco); if (el && el.focus) el.focus(); }
  if (vista.montar) vista.montar();
}
async function arrancar() {
  fijarIdioma(IDIOMA); cargarSesion();
  const params = new URLSearchParams(location.search);
  const sso = params.get('sso');
  if (!location.hash) history.replaceState(null, '', location.pathname + '#/mercado');
  S.ruta = parsearRuta(); render();
  const [cat] = await Promise.all([api('GET', '/mercado/catalogo'), S.sesion ? refrescarYo() : Promise.resolve()]);
  if (cat.ok) { S.catalogo = cat.datos; S.errorCatalogo = false; } else S.errorCatalogo = true;
  elegirPaisInicial();
  if (sso) { history.replaceState(null, '', location.pathname + location.hash); const ok = await entrarSso(sso); if (ok) return; }
  navegar();
}
arrancar();
