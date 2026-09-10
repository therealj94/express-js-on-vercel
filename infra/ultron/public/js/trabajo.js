/* ULTRON HUD · capa Grok encima del OS.
 *
 * No reemplaza os.js ni el cerebro. Se engancha a tres ganchos:
 *   ULTRON_TALLER.dichoUsuario(texto)   — burbuja de usted, al enviar
 *   ULTRON_TALLER.pintarRespuesta(md)   — burbuja de ULTRON, en vivo
 *   ULTRON_TALLER.hiloDelDia(c)         — el hilo de hoy, al entrar
 *   ULTRON_TALLER.inicio / paso / fin   — el rastro de lo que está haciendo
 *
 * Lo que se ve: un chat. El tablero, los hilos viejos, la bóveda y los
 * ajustes viven detrás de un botón. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[c]));
  let burbujaViva = null;

  function md(texto) {
    return window.MARKDOWN ? MARKDOWN.aHtml(texto) : esc(texto);
  }

  function globo() {
    const g = $('globo');
    if (g) g.classList.remove('oculto');
    return $('dicho');
  }

  function hayBurbujas() {
    const d = $('dicho');
    return !!(d && d.querySelector('.burbuja'));
  }

  function mostrarVacio() {
    const v = $('hilo-vacio');
    if (v) v.hidden = false;
    const g = $('globo');
    if (g && !hayBurbujas()) g.classList.add('oculto');
  }

  function ocultarVacio() {
    const v = $('hilo-vacio');
    if (v) v.hidden = true;
  }

  function scrollHilo() {
    const d = $('dicho');
    if (d) d.scrollTop = d.scrollHeight;
  }

  function burbuja(rol, quien, html) {
    const el = document.createElement('div');
    el.className = 'burbuja ' + rol;
    el.innerHTML = `<div class="quien">${esc(quien)}</div><div class="cuerpo">${html}</div>`;
    return el;
  }

  function dichoUsuario(texto) {
    const d = globo();
    if (!d) return;
    ocultarVacio();
    burbujaViva = null;
    d.appendChild(burbuja('usted', 'TÚ', esc(texto).replace(/\n/g, '<br>')));
    scrollHilo();
  }

  function pintarRespuesta(raw) {
    const d = globo();
    if (!d) return;
    ocultarVacio();
    if (!burbujaViva) {
      burbujaViva = burbuja('ultron viva', 'ULTRON', '<span class="shimmer">trabajando…</span>');
      d.appendChild(burbujaViva);
    }
    const cuerpo = burbujaViva.querySelector('.cuerpo');
    if (!raw) {
      scrollHilo();
      return;
    }
    if (cuerpo) cuerpo.innerHTML = md(raw);
    scrollHilo();
  }

  function hiloDelDia(c) {
    const d = globo();
    if (!d) return;
    const ultimos = (c?.ultimos || []).filter((t) => String(t.texto || '').trim());
    if (!ultimos.length) {
      d.innerHTML = '';
      mostrarVacio();
      return;
    }
    ocultarVacio();
    d.innerHTML = ultimos.map((t) => {
      const ultron = t.rol === 'ultron';
      return `<div class="burbuja ${ultron ? 'ultron' : 'usted'}"><div class="quien">${ultron ? 'ULTRON' : 'TÚ'}</div><div class="cuerpo">${md(t.texto)}</div></div>`;
    }).join('');
    burbujaViva = null;
    scrollHilo();
  }

  async function pintarListaHilos() {
    const caja = $('lista-hilos');
    if (!caja) return;
    caja.innerHTML = '<div class="sub">leyendo…</div>';
    try {
      const r = await DATOS.get('/conversaciones/registro');
      const dias = r?.dias || [];
      if (!dias.length) {
        caja.innerHTML = '<div class="sub">Todavía no hay hilos. Lo que hable hoy queda aquí.</div>';
        return;
      }
      caja.innerHTML = dias.map((dia) => {
        const esHoy = dia.dia === r.hoy;
        const id = dia.conversaciones[0]?._id || '';
        const titulo = dia.conversaciones.map((x) => x.titulo).find(Boolean) || 'sin título';
        return `<button type="button" class="reg ${esHoy ? 'hoy' : ''}" data-dia="${esc(dia.dia)}" data-conv="${esc(id)}">
          <b>${esHoy ? 'HOY' : esc(dia.dia)}</b>
          <span>${esc(titulo)} · ${dia.turnos} turno${dia.turnos === 1 ? '' : 's'}</span>
        </button>`;
      }).join('');
    } catch (e) {
      caja.innerHTML = `<div class="sub mal">${esc(e.message || 'no se pudo leer')}</div>`;
    }
  }

  async function abrirConversacion(id) {
    if (!id) return;
    const d = globo();
    if (!d) return;
    ocultarVacio();
    d.innerHTML = '<div class="burbuja ultron"><div class="quien">ULTRON</div><div class="cuerpo">trayendo el hilo…</div></div>';
    cerrarHilos();
    try {
      const c = await DATOS.get('/conversaciones/' + encodeURIComponent(id));
      const turnos = (c?.turnos || []).filter((t) => String(t.texto || '').trim());
      if (!turnos.length) {
        d.innerHTML = '';
        mostrarVacio();
        return;
      }
      d.innerHTML = turnos.map((t) => {
        const ultron = t.rol === 'ultron';
        const cuando = t.en ? new Date(t.en).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="burbuja ${ultron ? 'ultron' : 'usted'}"><div class="quien">${ultron ? 'ULTRON' : 'TÚ'}${cuando ? ' · ' + esc(cuando) : ''}</div><div class="cuerpo">${md(t.texto || '')}</div></div>`;
      }).join('');
      burbujaViva = null;
      scrollHilo();
    } catch (e) {
      d.innerHTML = `<div class="burbuja ultron"><div class="quien">ULTRON</div><div class="cuerpo mal">${esc(e.message)}</div></div>`;
    }
  }

  function abrirHilos() {
    document.body.classList.add('ver-hilos');
    document.body.classList.remove('ver-tablero');
    const c = $('cajon-hilos');
    const v = $('velo-hud');
    if (c) c.hidden = false;
    if (v) v.hidden = false;
    pintarListaHilos();
  }

  function cerrarHilos() {
    document.body.classList.remove('ver-hilos');
    const c = $('cajon-hilos');
    if (c) c.hidden = true;
    if (!document.body.classList.contains('ver-tablero')) {
      const v = $('velo-hud');
      if (v) v.hidden = true;
    }
  }

  function abrirTablero() {
    document.body.classList.add('ver-tablero', 'cajon');
    document.body.classList.remove('ver-hilos');
    const c = $('cajon-hilos');
    if (c) c.hidden = true;
    const v = $('velo-hud');
    if (v) v.hidden = false;
    const cab = $('tablero-cab');
    if (cab) cab.hidden = false;
  }

  function cerrarTablero() {
    document.body.classList.remove('ver-tablero', 'cajon');
    const cab = $('tablero-cab');
    if (cab) cab.hidden = true;
    const v = $('velo-hud');
    if (v) v.hidden = true;
  }

  function cerrarCapas() {
    cerrarHilos();
    cerrarTablero();
  }

  /* ── rastro: lo que está haciendo, tipo terminal Grok ─────────────────── */

  function inicio() {
    const r = $('rastro');
    if (r) r.innerHTML = '';
    paso({ hace: 'pensando' });
  }

  function paso(d) {
    const r = $('rastro');
    if (!r) return;
    r.querySelectorAll('.paso.va').forEach((el) => {
      el.classList.remove('va');
      el.classList.add('ok');
    });
    const el = document.createElement('div');
    el.className = 'paso va';
    el.textContent = String((d && (d.hace || d.nombre)) || 'paso').replace(/_/g, ' ');
    r.appendChild(el);
    r.scrollTop = r.scrollHeight;
  }

  function fin(d) {
    const r = $('rastro');
    if (r) {
      r.querySelectorAll('.paso.va').forEach((el) => {
        el.classList.remove('va');
        el.classList.add(d && d.ok === false ? 'mal' : 'ok');
      });
    }
    if (burbujaViva) burbujaViva.classList.remove('viva');
    burbujaViva = null;
  }

  function enlazar() {
    $('m-hilos')?.addEventListener('click', () => {
      if (document.body.classList.contains('ver-hilos')) cerrarHilos();
      else abrirHilos();
    });
    $('hilos-cerrar')?.addEventListener('click', cerrarHilos);
    $('hilo-hoy')?.addEventListener('click', () => {
      cerrarHilos();
      DATOS.get('/conversaciones/hoy').then(hiloDelDia).catch(() => {});
    });
    $('lista-hilos')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-conv]');
      if (!b || !b.dataset.conv) return;
      abrirConversacion(b.dataset.conv);
    });
    $('m-tablero')?.addEventListener('click', () => {
      if (document.body.classList.contains('ver-tablero')) cerrarTablero();
      else abrirTablero();
    });
    $('tablero-cerrar')?.addEventListener('click', cerrarTablero);
    $('velo-hud')?.addEventListener('click', cerrarCapas);
  }

  window.ULTRON_TALLER = {
    inicio, paso, fin,
    dichoUsuario, pintarRespuesta, hiloDelDia,
    setTaller() { /* el HUD ya es el taller */ },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enlazar);
  } else {
    enlazar();
  }
})();
