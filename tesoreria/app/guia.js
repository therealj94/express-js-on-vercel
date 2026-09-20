/* ============================================================
   Orden Global · Tesorería — guía interactiva (recorrido)
   ------------------------------------------------------------
   Un recorrido de marcas sobre la pantalla real: oscurece todo
   menos el elemento del paso, y explica al lado qué es y para
   qué sirve. Se lanza solo la primera vez que alguien entra a
   cada plataforma, y siempre desde el botón «?» de la barra.
   ============================================================ */
(function (global) {
  'use strict';

  let activo = null;

  function rect(elm) {
    const r = elm.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height, vx: r.left, vy: r.top };
  }

  /**
   * pasos: [{ sel, titulo, texto, pos?: 'abajo'|'arriba'|'derecha'|'izquierda', antes?: fn }]
   * opciones: { llave, alTerminar }
   */
  function recorrido(pasos, opciones) {
    cerrar();
    const o = Object.assign({ llave: null }, opciones || {});
    const capa = document.createElement('div');
    capa.className = 'guia-capa';
    capa.innerHTML = `
      <div class="guia-foco" data-foco></div>
      <div class="guia-tarjeta" data-tarjeta role="dialog" aria-live="polite">
        <div class="guia-paso" data-paso></div>
        <h4 data-titulo></h4>
        <p data-texto></p>
        <div class="guia-pie">
          <button class="btn chico fantasma" data-saltar>Saltar</button>
          <span class="guia-puntos" data-puntos></span>
          <span style="display:flex;gap:6px">
            <button class="btn chico" data-atras>Atrás</button>
            <button class="btn chico pri" data-sig>Siguiente</button>
          </span>
        </div>
      </div>`;
    document.body.appendChild(capa);
    document.body.classList.add('guia-abierta');
    let i = 0;
    const foco = capa.querySelector('[data-foco]'), tarjeta = capa.querySelector('[data-tarjeta]');

    function colocar() {
      const p = pasos[i];
      if (p.antes) p.antes();
      const elm = p.sel ? document.querySelector(p.sel) : null;
      capa.querySelector('[data-paso]').textContent = `${i + 1} de ${pasos.length}`;
      capa.querySelector('[data-titulo]').textContent = p.titulo;
      capa.querySelector('[data-texto]').innerHTML = p.texto;
      capa.querySelector('[data-puntos]').innerHTML = pasos.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
      capa.querySelector('[data-atras]').disabled = i === 0;
      capa.querySelector('[data-sig]').textContent = i === pasos.length - 1 ? 'Entendido' : 'Siguiente';

      if (!elm) {
        foco.style.opacity = '0';
        tarjeta.style.left = '50%'; tarjeta.style.top = '50%'; tarjeta.style.transform = 'translate(-50%,-50%)';
        return;
      }
      elm.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => {
        const r = rect(elm), m = 8;
        foco.style.opacity = '1';
        foco.style.left = (r.x - m) + 'px'; foco.style.top = (r.y - m) + 'px';
        foco.style.width = (r.w + m * 2) + 'px'; foco.style.height = (r.h + m * 2) + 'px';
        // La tarjeta busca sitio: debajo si cabe, si no arriba; a la derecha si el elemento es angosto.
        const ancho = Math.min(360, window.innerWidth - 32);
        tarjeta.style.transform = 'none'; tarjeta.style.width = ancho + 'px';
        let left, top;
        const pos = p.pos || (r.w < window.innerWidth * 0.45 && r.vx + r.w + ancho + 24 < window.innerWidth ? 'derecha' : 'abajo');
        if (pos === 'derecha') { left = r.x + r.w + 16; top = r.y; }
        else if (pos === 'izquierda') { left = r.x - ancho - 16; top = r.y; }
        else if (pos === 'arriba') { left = r.x; top = r.y - 16 - 190; }
        else { left = r.x; top = r.y + r.h + 16; }
        left = Math.max(window.scrollX + 16, Math.min(left, window.scrollX + window.innerWidth - ancho - 16));
        if (pos === 'abajo' && r.vy + r.h + 220 > window.innerHeight) top = r.y - 16 - 190;
        if (top < window.scrollY + 12) top = r.y + r.h + 16;
        tarjeta.style.left = left + 'px'; tarjeta.style.top = top + 'px';
      }, 260);
    }

    function terminar() {
      cerrar();
      if (o.llave) { try { localStorage.setItem(o.llave, '1'); } catch (e) {} }
      if (o.alTerminar) o.alTerminar();
    }
    capa.querySelector('[data-sig]').addEventListener('click', () => { if (i < pasos.length - 1) { i++; colocar(); } else terminar(); });
    capa.querySelector('[data-atras]').addEventListener('click', () => { if (i > 0) { i--; colocar(); } });
    capa.querySelector('[data-saltar]').addEventListener('click', terminar);
    const teclas = (e) => { if (e.key === 'Escape') terminar(); if (e.key === 'ArrowRight') capa.querySelector('[data-sig]').click(); if (e.key === 'ArrowLeft') capa.querySelector('[data-atras]').click(); };
    document.addEventListener('keydown', teclas);
    const recolocar = () => colocar();
    window.addEventListener('resize', recolocar);
    activo = { capa, teclas, recolocar };
    colocar();
  }

  function cerrar() {
    if (!activo) return;
    activo.capa.remove();
    document.removeEventListener('keydown', activo.teclas);
    window.removeEventListener('resize', activo.recolocar);
    document.body.classList.remove('guia-abierta');
    activo = null;
  }

  function yaVisto(llave) { try { return localStorage.getItem(llave) === '1'; } catch (e) { return true; } }

  global.Guia = { recorrido, cerrar, yaVisto };
})(window);
