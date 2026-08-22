/* La gráfica de precios: un lienzo que se puede agarrar.
 *
 * QUE ES Y QUE NO ES
 *
 * Dibuja una serie de precios reales —[[milisegundos, valor], …]— y deja
 * moverse por ella: pellizco con dos dedos, rueda del raton, arrastre para ver
 * el pasado, botones de acercar y alejar, y doble toque para volver a ver todo.
 * Un dedo (o el cursor) posado enseña el precio y la fecha exactos de ese
 * punto.
 *
 * Lo que NO hace es inventar: no suaviza la curva con splines que pintan
 * precios por los que la serie nunca paso, no rellena huecos, y no dibuja nada
 * si no le dieron datos. La regla de la casa —sin precio real no se inventa un
 * precio— aplica igual a un numero que a mil.
 *
 * POR QUE UN LIENZO PROPIO Y NO UNA BIBLIOTECA
 *
 * Por lo mismo que el QR y el cifrado: todo lo que corre en esta billetera se
 * puede leer entero. Una biblioteca de graficas trae cien mil lineas ajenas
 * para dibujar una linea de mil puntos, y este archivo son trescientas
 * nuestras.
 *
 * COMO SE USA (lo cablea app.js)
 *
 *   const g = GRAFICA.montar(contenedor, {
 *     fmt:   v  => 'US$ 2,58',          // como se escribe un precio
 *     fecha: ms => '12 ago 14:00',      // como se escribe un instante
 *     txt:   { mas, menos, todo },      // rotulos de los botones
 *   });
 *   g.poner(serie);   // la serie entera, ordenada por tiempo
 *   g.destruir();     // al irse de la pantalla
 */
(() => {
  'use strict';

  // La ventana minima: con menos de seis puntos a la vista ya no hay curva que
  // leer, solo segmentos sueltos, y el zoom deja de significar nada.
  const MIN_PUNTOS = 6;

  const TINTAS = {
    linea: '#EAD79C',
    area0: 'rgba(201,169,97,.26)',
    area1: 'rgba(201,169,97,0)',
    rejilla: 'rgba(201,169,97,.14)',
    rotulo: '#6E938F',
    cruz: 'rgba(243,236,217,.38)',
    punto: '#F8EFCF',
  };

  function montar(cont, op) {
    const fmt = op.fmt || (v => String(v));
    const fmtEje = op.fmtEje || fmt;
    const fecha = op.fecha || (ms => new Date(ms).toLocaleString());
    const txt = op.txt || {};

    cont.classList.add('grf');
    cont.innerHTML = `
      <canvas></canvas>
      <div class="grf-tip oculto" role="status"></div>
      <div class="grf-ctl">
        <button type="button" data-g="menos" aria-label="${txt.menos || '−'}">−</button>
        <button type="button" data-g="mas" aria-label="${txt.mas || '+'}">+</button>
        <button type="button" data-g="todo" aria-label="${txt.todo || '⟲'}">⟲</button>
      </div>`;
    const cv = cont.querySelector('canvas');
    const tip = cont.querySelector('.grf-tip');
    const cx = cv.getContext('2d');

    let datos = null;          // [[ms, v], …]
    let v0 = 0, v1 = 0;        // la ventana visible, en indices (fraccionales)
    let cruzI = null;          // el punto señalado, o null
    let ancho = 0, alto = 0, dpr = 1;

    // ── medidas ──────────────────────────────────────────────────────────────
    function medir() {
      const r = cont.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      ancho = r.width; alto = r.height;
      cv.width = Math.round(ancho * dpr); cv.height = Math.round(alto * dpr);
      cv.style.width = ancho + 'px'; cv.style.height = alto + 'px';
      pintar();
    }
    const ro = new ResizeObserver(medir);
    ro.observe(cont);

    /* Margenes: la escala de precios vive a la derecha, el tiempo abajo.
       El derecho no es fijo: se mide con el rotulo mas ancho de la escala,
       porque «$2.55» y «$4,400» no ocupan lo mismo y un margen de talla unica
       o recorta los miles o deja un pasillo vacio en los centavos. */
    const M = { izq: 6, der: 58, arr: 10, aba: 22 };

    function aX(i) { return M.izq + ((i - v0) / (v1 - v0)) * (ancho - M.izq - M.der); }
    function deX(px) { return v0 + ((px - M.izq) / (ancho - M.izq - M.der)) * (v1 - v0); }

    /* Los ticks «bonitos» del eje de precios: multiplos de 1·2·2,5·5 por
       potencia de diez, que es lo unico que un ojo lee sin hacer cuentas.
       Y una guardia: si el paso elegido deja menos de tres marcas —pasaba
       justo cuando el rango caia un pelo por encima del paso, y la escala se
       quedaba con UNA linea— se parte a la mitad hasta que haya escala. */
    function ticks(min, max, n) {
      const gen = paso => {
        const t = [];
        for (let v = Math.ceil(min / paso) * paso; v <= max + paso * 1e-9; v += paso) t.push(v);
        return t;
      };
      const paso0 = (max - min) / n;
      const pot = Math.pow(10, Math.floor(Math.log10(paso0)));
      let paso = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => (max - min) / p <= n) || 10 * pot;
      let t = gen(paso);
      while (t.length < 3) { paso /= 2; t = gen(paso); }
      return t;
    }

    // ── el dibujo ────────────────────────────────────────────────────────────
    function pintar() {
      if (!ancho) return;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, ancho, alto);
      if (!datos || datos.length < 2) return;

      const a = Math.max(0, Math.floor(v0)), b = Math.min(datos.length - 1, Math.ceil(v1));
      let min = Infinity, max = -Infinity;
      for (let i = a; i <= b; i++) { const v = datos[i][1]; if (v < min) min = v; if (v > max) max = v; }
      if (min === max) { min *= 0.995; max *= 1.005; }           // una serie plana tambien se ve
      const aire = (max - min) * 0.09;
      min -= aire; max += aire;
      const aY = v => M.arr + (1 - (v - min) / (max - min)) * (alto - M.arr - M.aba);

      // La rejilla y la escala de precios
      cx.font = '10.5px "JetBrains Mono", ui-monospace, monospace';
      cx.textBaseline = 'middle';
      const marcas = ticks(min, max, 4).map(v => ({ v, rot: fmtEje(v) }));
      M.der = Math.max(44, ...marcas.map(m => cx.measureText(m.rot).width)) + 16;
      for (const { v, rot } of marcas) {
        const y = aY(v);
        cx.strokeStyle = TINTAS.rejilla; cx.lineWidth = 1;
        cx.beginPath(); cx.moveTo(M.izq, y); cx.lineTo(ancho - M.der + 4, y); cx.stroke();
        cx.fillStyle = TINTAS.rotulo; cx.textAlign = 'left';
        cx.fillText(rot, ancho - M.der + 8, y);
      }

      // El tiempo, tres marcas
      cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
      for (const f of [0.08, 0.5, 0.92]) {
        const i = Math.round(v0 + f * (v1 - v0));
        if (i < 0 || i >= datos.length) continue;
        cx.fillStyle = TINTAS.rotulo;
        cx.fillText(fecha(datos[i][0], true), aX(i), alto - 6);
      }

      // El area bajo la curva y la curva. Polilinea punto a punto: cada vertice
      // es un precio que existio; entre medias, recta, que no afirma nada.
      const camino = new Path2D();
      let empezo = false;
      for (let i = a; i <= b; i++) {
        const x = aX(i), y = aY(datos[i][1]);
        if (!empezo) { camino.moveTo(x, y); empezo = true; } else camino.lineTo(x, y);
      }
      const relleno = new Path2D(camino);
      relleno.lineTo(aX(b), alto - M.aba); relleno.lineTo(aX(a), alto - M.aba); relleno.closePath();
      const grad = cx.createLinearGradient(0, M.arr, 0, alto - M.aba);
      grad.addColorStop(0, TINTAS.area0); grad.addColorStop(1, TINTAS.area1);
      cx.fillStyle = grad; cx.fill(relleno);
      cx.strokeStyle = TINTAS.linea; cx.lineWidth = 2; cx.lineJoin = 'round'; cx.stroke(camino);

      // El ultimo precio a la vista, con su punto
      if (b === datos.length - 1) {
        cx.fillStyle = TINTAS.punto;
        cx.beginPath(); cx.arc(aX(b), aY(datos[b][1]), 3.5, 0, 7); cx.fill();
      }

      // La cruz del punto señalado
      if (cruzI != null && cruzI >= a && cruzI <= b) {
        const x = aX(cruzI), y = aY(datos[cruzI][1]);
        cx.strokeStyle = TINTAS.cruz; cx.lineWidth = 1;
        cx.setLineDash([3, 3]);
        cx.beginPath(); cx.moveTo(x, M.arr); cx.lineTo(x, alto - M.aba); cx.stroke();
        cx.setLineDash([]);
        cx.fillStyle = TINTAS.punto;
        cx.beginPath(); cx.arc(x, y, 4, 0, 7); cx.fill();
        cx.strokeStyle = 'rgba(2,27,28,.9)'; cx.lineWidth = 2;
        cx.beginPath(); cx.arc(x, y, 4, 0, 7); cx.stroke();

        tip.innerHTML = `<b>${fmt(datos[cruzI][1])}</b><span>${fecha(datos[cruzI][0])}</span>`;
        tip.classList.remove('oculto');
        const tw = tip.offsetWidth;
        tip.style.left = Math.max(4, Math.min(ancho - tw - 4, x - tw / 2)) + 'px';
        tip.style.top = Math.max(2, y - tip.offsetHeight - 14) + 'px';
      } else {
        tip.classList.add('oculto');
      }
    }

    // ── moverse por la serie ─────────────────────────────────────────────────
    function fijar() {
      const n = datos.length - 1;
      const anchoV = Math.max(MIN_PUNTOS, Math.min(n, v1 - v0));
      if (v0 < 0) { v1 -= v0; v0 = 0; }
      if (v1 > n) { v0 -= (v1 - n); v1 = n; }
      v0 = Math.max(0, v0); v1 = Math.min(n, Math.max(v1, v0 + anchoV));
      pintar();
    }

    function zoom(factor, ancla) {
      if (!datos) return;
      const iAncla = deX(ancla ?? ancho / 2);
      v0 = iAncla - (iAncla - v0) / factor;
      v1 = iAncla + (v1 - iAncla) / factor;
      fijar();
    }

    function todo() {
      if (!datos) return;
      v0 = 0; v1 = datos.length - 1; cruzI = null; pintar();
    }

    // ── los dedos y el raton ─────────────────────────────────────────────────
    const punteros = new Map();     // pointerId -> {x, y}
    let arrastre = null;            // {x0, v0a, v1a} mientras se arrastra
    let pinza0 = null;              // distancia inicial del pellizco
    let ultimoToque = 0;

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (punteros.size === 1) {
        arrastre = { x0: e.offsetX, v0a: v0, v1a: v1 };
        // Doble toque = ver todo. Un gesto que ya sabe todo el mundo.
        const ahora = Date.now();
        if (ahora - ultimoToque < 320) { todo(); arrastre = null; }
        ultimoToque = ahora;
      } else if (punteros.size === 2) {
        const [p1, p2] = [...punteros.values()];
        pinza0 = { d: Math.abs(p1.x - p2.x), v0a: v0, v1a: v1, cx: (p1.x + p2.x) / 2 };
        arrastre = null;
      }
      e.preventDefault();
    });

    cv.addEventListener('pointermove', e => {
      if (punteros.has(e.pointerId)) punteros.set(e.pointerId, { x: e.offsetX, y: e.offsetY });

      if (punteros.size === 2 && pinza0) {
        // El pellizco: la ventana se estira por el factor entre las dos
        // distancias, anclada donde estan los dedos.
        const [p1, p2] = [...punteros.values()];
        const d = Math.max(12, Math.abs(p1.x - p2.x));
        const factor = d / Math.max(12, pinza0.d);
        const iAncla = pinza0.v0a + ((pinza0.cx - M.izq) / (ancho - M.izq - M.der)) * (pinza0.v1a - pinza0.v0a);
        v0 = iAncla - (iAncla - pinza0.v0a) / factor;
        v1 = iAncla + (pinza0.v1a - iAncla) / factor;
        fijar();
        return;
      }
      if (arrastre && punteros.size === 1) {
        const dx = e.offsetX - arrastre.x0;
        const porPx = (arrastre.v1a - arrastre.v0a) / (ancho - M.izq - M.der);
        v0 = arrastre.v0a - dx * porPx;
        v1 = arrastre.v1a - dx * porPx;
        // Arrastrar con el dedo posado tambien mueve la cruz, no la deja huerfana.
        if (Math.abs(dx) < 4 && e.pointerType !== 'mouse') señalar(e.offsetX);
        fijar();
        return;
      }
      // Sin arrastre: el cursor posado señala el punto mas cercano.
      if (e.pointerType === 'mouse' && datos) señalar(e.offsetX);
    });

    function soltar(e) {
      punteros.delete(e.pointerId);
      if (punteros.size < 2) pinza0 = null;
      if (punteros.size === 0) {
        // Un toque corto sin arrastre, en tactil, es «señalame este punto».
        if (arrastre && e.pointerType !== 'mouse') señalar(e.offsetX);
        arrastre = null;
      }
    }
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', soltar);
    cv.addEventListener('pointerleave', e => {
      if (e.pointerType === 'mouse' && !arrastre) { cruzI = null; pintar(); }
    });

    function señalar(px) {
      const i = Math.round(deX(px));
      cruzI = Math.max(0, Math.min(datos.length - 1, i));
      pintar();
    }

    /* La rueda hace zoom donde esta el cursor. `passive:false` porque hay que
       frenar el scroll de la pagina: girar la rueda ENCIMA de la grafica es
       para la grafica — si ademas se llevara la pagina, seria una ruleta. */
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.offsetX);
    }, { passive: false });

    cont.querySelector('[data-g="mas"]').addEventListener('click', () => zoom(1.35));
    cont.querySelector('[data-g="menos"]').addEventListener('click', () => zoom(1 / 1.35));
    cont.querySelector('[data-g="todo"]').addEventListener('click', todo);

    // El pellizco del navegador (zoom de pagina) no tiene que pelearse con el nuestro.
    cv.style.touchAction = 'none';

    return {
      poner(serie) {
        datos = Array.isArray(serie) && serie.length >= 2 ? serie : null;
        cruzI = null;
        if (datos) { v0 = 0; v1 = datos.length - 1; }
        medir();
      },
      destruir() { ro.disconnect(); punteros.clear(); },
    };
  }

  window.GRAFICA = { montar };
})();
