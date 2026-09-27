/* ════════════════════════════════════════════════════════════════════════════
   ORDEN GLOBAL · portada 27

   1. La apertura: el enredo cobrizo de las fronteras llena la pantalla y se
      ordena en el OG; los 93 puntos se encienden y el logo vuela a su lugar
      en la cabecera. Una vez por visita, y se puede saltar.
   2. Las escenas del scroll: el manifiesto que se enciende palabra por
      palabra, el descenso por las seis capas y la galería de las casas.
   3. Lo vivo: el precio del ORIGEN y la cadena, que late con cada bloque.
   4. Copiar códigos y los videos.

   Todo lo que se mueve depende de html.anima, que pone la cabecera solo si
   no hay movimiento reducido. Sin eso, la página se lee de corrido.
   ════════════════════════════════════════════════════════════════════════════ */
window.OG27 = true;

(function () {
  var html = document.documentElement;
  var anima = html.classList.contains('anima');
  function lim(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function listo() { html.classList.add('listo'); }

  /* ── 1 · LA APERTURA ─────────────────────────────────────────────────── */
  (function () {
    var cap = document.querySelector('.apertura');
    var V = window.OG_VECTOR;
    var visto = false;
    try { visto = sessionStorage.getItem('og-apertura') === '1'; } catch (e) {}
    if (!anima || !cap || !V || visto) { listo(); return; }
    var cv = cap.querySelector('canvas'), ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) { listo(); return; }
    try { sessionStorage.setItem('og-apertura', '1'); } catch (e) {}

    cap.classList.add('activa');
    html.style.overflow = 'hidden';

    var semilla = 5550;
    function azar() { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; }
    function remuestrear(c, paso) {
      var xs = [], ys = [], ss = [], L = 0, tramos = [], i, a, b;
      for (i = 0; i < c.length; i++) { a = c[i]; b = c[(i + 1) % c.length]; var d = Math.hypot(b[0] - a[0], b[1] - a[1]); tramos.push(d); L += d; }
      var acum = 0;
      for (i = 0; i < c.length; i++) {
        a = c[i]; b = c[(i + 1) % c.length];
        var n = Math.max(1, Math.round(tramos[i] / paso));
        for (var k = 0; k < n; k++) { var f = k / n; xs.push(a[0] + (b[0] - a[0]) * f); ys.push(a[1] + (b[1] - a[1]) * f); ss.push((acum + tramos[i] * f) / L); }
        acum += tramos[i];
      }
      return { x: xs, y: ys, s: ss, n: xs.length };
    }
    var lineas = V.lineas.map(function (c) { return remuestrear(c, 0.005); });
    var cx = V.aspecto / 2, cy = 0.5;
    var params = lineas.map(function () {
      return { tx: (azar() - 0.5), ty: (azar() - 0.5), f1: 1 + Math.floor(azar() * 3), f2: 3 + Math.floor(azar() * 4),
        p1: azar() * 6.283, p2: azar() * 6.283, rot: (azar() - 0.5) * 2.2 };
    });
    var orden = V.puntos.map(function (p, i) { return { i: i, k: azar() }; })
      .sort(function (a, b) { return a.k - b.k; }).map(function (o) { return o.i; });

    var FRONTERA = [184, 65, 47], AMBAR = [232, 150, 60], ORO = [217, 180, 95];
    function mezcla(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function color(e) {
      var c = e < 0.5 ? mezcla(FRONTERA, AMBAR, e * 2) : mezcla(AMBAR, ORO, (e - 0.5) * 2);
      return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
    }
    function suave(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }

    // Tiempos, en segundos.
    var T_ENREDO = 0.55, T_ORDEN = 1.9, T_RELLENO = 0.5, T_PUNTO = 0.007, T_ENCIENDE = 0.25, T_VUELO = 0.95;
    var T_PUNTOS = T_ENREDO + T_ORDEN + 0.1;
    var T_FIN = T_PUNTOS + V.puntos.length * T_PUNTO + T_ENCIENDE + 0.25;

    var W, H, dpr, esc, ox, oy, amp;
    function medir() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      var ancho = Math.min(W * (W < 700 ? 0.8 : 0.56), 980);
      esc = ancho / V.aspecto; ox = (W - ancho) / 2; oy = (H - esc) / 2;
      // El enredo cubre la pantalla entera, no solo el cuadro del logo.
      amp = Math.max(W / ancho, H / esc) * 0.95;
    }

    // Dibuja el logo ordenándose (t) dentro de la caja (bx, by, be).
    function dibujar(t, bx, by, be) {
      var u = lim((t - T_ENREDO) / T_ORDEN), e = suave(u), A = 1 - e;
      var relleno = lim((t - T_ENREDO - T_ORDEN) / T_RELLENO);
      var aparece = lim(t / 0.3);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (relleno < 1) {
        ctx.globalAlpha = aparece * (1 - relleno);
        ctx.strokeStyle = color(e);
        ctx.lineWidth = 1.2 + A * 0.6;
        ctx.lineJoin = 'round';
        var tiembla = t * 1.6, a2 = A * amp;
        for (var i = 0; i < lineas.length; i++) {
          var L = lineas[i], P = params[i];
          var cr = Math.cos(P.rot * A), sr = Math.sin(P.rot * A);
          ctx.beginPath();
          for (var k = 0; k < L.n; k++) {
            var s = L.s[k] * 6.2832;
            var dx = a2 * (P.tx + 0.16 * Math.sin(s * P.f1 + P.p1 + tiembla) + 0.06 * Math.sin(s * P.f2 + P.p2 - tiembla * 1.3));
            var dy = a2 * (P.ty * 0.8 + 0.16 * Math.cos(s * P.f1 + P.p2 + tiembla * 0.8) + 0.06 * Math.sin(s * P.f2 + P.p1));
            var x0 = L.x[k] - cx, y0 = L.y[k] - cy;
            var X = bx + (cx + x0 * cr - y0 * sr + dx) * be;
            var Y = by + (cy + x0 * sr + y0 * cr + dy) * be;
            if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
          }
          ctx.closePath(); ctx.stroke();
        }
      }
      if (relleno > 0) {
        ctx.globalAlpha = relleno;
        ctx.fillStyle = 'rgb(217,180,95)';
        ctx.beginPath();
        for (var j = 0; j < V.lineas.length; j++) {
          var c = V.lineas[j];
          for (var m = 0; m < c.length; m++) { var px = bx + c[m][0] * be, py = by + c[m][1] * be; if (m) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
      ctx.fillStyle = 'rgb(245,228,171)';
      for (var q = 0; q < orden.length; q++) {
        var al = lim((t - T_PUNTOS - q * T_PUNTO) / T_ENCIENDE);
        if (al <= 0) continue;
        var p = V.puntos[orden[q]];
        ctx.globalAlpha = al;
        ctx.beginPath();
        ctx.arc(bx + p[0] * be, by + p[1] * be, p[2] * be * (1 + 0.8 * (1 - al)), 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    var destino = document.querySelector('.techo .marca img');
    var inicio = 0, saltado = false, vueloDesde = 0, terminado = false;
    function cerrar() {
      if (terminado) return; terminado = true;
      cap.classList.remove('activa', 'sale');
      html.style.overflow = '';
      listo();
    }
    function cuadro(ahora) {
      if (terminado) return;
      if (!inicio) inicio = ahora;
      var t = (ahora - inicio) / 1000;
      if (saltado && !vueloDesde) vueloDesde = t;
      if (t < T_FIN && !vueloDesde) { dibujar(t, ox, oy, esc); requestAnimationFrame(cuadro); return; }
      // El vuelo: el logo terminado se encoge hasta la cabecera.
      if (!vueloDesde) vueloDesde = t;
      if (vueloDesde === t) { cap.classList.add('sale'); listo(); }
      var v = suave(lim((t - vueloDesde) / T_VUELO));
      var r = destino ? destino.getBoundingClientRect() : { left: 24, top: 20, height: 26 };
      var be = esc + (r.height - esc) * v;
      var bx = ox + (r.left - ox) * v, by = oy + (r.top - oy) * v;
      dibujar(99, bx, by, be);
      cv.style.opacity = v > 0.85 ? String(1 - (v - 0.85) / 0.15) : '1';
      if (v < 1) requestAnimationFrame(cuadro); else cerrar();
    }
    medir();
    addEventListener('resize', medir);
    function saltar() { saltado = true; }
    cap.querySelector('button').addEventListener('click', saltar);
    ['keydown', 'wheel', 'touchstart', 'pointerdown'].forEach(function (ev) { addEventListener(ev, saltar, { once: true, passive: true }); });
    requestAnimationFrame(cuadro);
  })();

  /* ── 2 · LAS ESCENAS DEL SCROLL ─────────────────────────────────────── */
  // La cabecera: se aparta al bajar y vuelve al subir.
  var techo = document.querySelector('.techo'), ultimoY = scrollY;

  // Lo que entra en pantalla.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px' });
    document.querySelectorAll('.aparece, .disco, .pasaporte').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.aparece, .disco, .pasaporte').forEach(function (el) { el.classList.add('visto'); });
  }

  // El manifiesto se parte en palabras, sin tocar los tramos en ámbar.
  var manif = document.querySelector('.manifiesto'), palabras = [];
  if (anima && manif) {
    manif.querySelectorAll('.escena p').forEach(function (p) {
      (function partir(nodo) {
        Array.prototype.slice.call(nodo.childNodes).forEach(function (h) {
          if (h.nodeType === 3) {
            var frag = document.createDocumentFragment();
            h.textContent.split(/(\s+)/).forEach(function (w) {
              if (!w) return;
              if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
              var s = document.createElement('span'); s.className = 'w'; s.textContent = w; frag.appendChild(s); palabras.push(s);
            });
            nodo.replaceChild(frag, h);
          } else if (h.nodeType === 1) partir(h);
        });
      })(p);
    });
  }

  var desc = document.querySelector('.descenso'), capas = desc ? desc.querySelectorAll('.capas-lista li') : [];
  var sonda = desc && desc.querySelector('.sonda'), marcas = sonda ? sonda.querySelectorAll('span') : [];
  var escenaDesc = desc && desc.querySelector('.escena');
  var casas = document.querySelector('.casas'), pista = casas && casas.querySelector('.pista');
  var ancho = window.matchMedia('(min-width: 901px)');

  function medirCasas() {
    if (!anima || !casas) return;
    if (!ancho.matches) { casas.classList.add('sin-pin'); casas.style.removeProperty('--alto-casas'); return; }
    casas.classList.remove('sin-pin');
    var sobra = Math.max(0, pista.scrollWidth - innerWidth);
    casas.style.setProperty('--alto-casas', (innerHeight + sobra) + 'px');
  }

  function progreso(el) {
    var r = el.getBoundingClientRect();
    return lim(-r.top / Math.max(1, r.height - innerHeight));
  }

  var pedido = false;
  function escenas() {
    pedido = false;
    var y = scrollY;
    if (techo) {
      techo.classList.toggle('fondo', y > 40);
      techo.classList.toggle('fuera', y > ultimoY && y > 200);
      ultimoY = y;
    }
    if (!anima) return;
    if (manif && palabras.length) {
      var n = Math.floor(progreso(manif) * 1.25 * palabras.length);
      for (var i = 0; i < palabras.length; i++) palabras[i].classList.toggle('on', i < n);
    }
    if (desc && capas.length) {
      var p = progreso(desc), k = Math.min(capas.length - 1, Math.floor(p * capas.length));
      for (var c = 0; c < capas.length; c++) { capas[c].classList.toggle('aqui', c === k); capas[c].classList.toggle('antes', c < k); }
      for (var m = 0; m < marcas.length; m++) marcas[m].classList.toggle('aqui', m === k);
      escenaDesc.style.setProperty('--hondo', (k / (capas.length - 1)).toFixed(3));
      if (sonda) sonda.style.setProperty('--prof', p.toFixed(4));
    }
    if (casas && pista && ancho.matches) {
      var sobra = Math.max(0, pista.scrollWidth - innerWidth);
      pista.style.setProperty('--corre', (-progreso(casas) * sobra).toFixed(1) + 'px');
    }
  }
  function pedir() { if (!pedido) { pedido = true; requestAnimationFrame(escenas); } }
  medirCasas();
  addEventListener('scroll', pedir, { passive: true });
  addEventListener('resize', function () { medirCasas(); pedir(); });
  escenas();
})();

/* ── 3 · SOLO LO REAL SE MUEVE ─────────────────────────────────────────────
   Dos datos vivos, de las mismas fuentes que la billetera. Si una fuente no
   contesta queda el guion: un número inventado que se mueve es peor que
   ninguno, porque parece comprobado. */
(function () {
  var OZ = 31.1035, GRAMIN = 55;
  function todos(sel, fn) { var n = document.querySelectorAll(sel); for (var i = 0; i < n.length; i++) fn(n[i]); }
  function poner(sel, txt) { todos(sel, function (el) { el.textContent = txt; }); }
  var EN = document.documentElement.lang === 'en', LOC = EN ? 'en-US' : 'es-ES';
  function usd(v) { return 'USD ' + v.toLocaleString(LOC, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function miles(n) { return n.toLocaleString('en-US').replace(/,/g, ' '); }

  function precio() {
    fetch('https://api.gold-api.com/price/XAU').then(function (r) { return r.json(); }).then(function (j) {
      var onza = Number(j && j.price);
      if (!isFinite(onza) || onza <= 0) return;
      var gramo = onza / OZ, origen = gramo / GRAMIN;
      poner('[data-origen]', usd(origen));
      poner('[data-gramo]', usd(gramo));
      poner('[data-leido]', new Date().toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }));
    }).catch(function () {});
  }

  var bloqueTs = 0, ultimo = 0, pidiendo = false;
  var numero = document.querySelector('.cadena .numero'), latido = document.querySelector('.latido');
  function cadena() {
    if (pidiendo) return; pidiendo = true;
    fetch('https://rpc.ordenglobal-rpc.com/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var b = j && j.result; if (!b) return;
      var n = parseInt(b.number, 16); if (!isFinite(n)) return;
      poner('[data-bloque]', miles(n));
      if (n !== ultimo && ultimo && numero) { numero.classList.remove('nuevo'); void numero.offsetWidth; numero.classList.add('nuevo'); }
      ultimo = n;
      var ts = parseInt(b.timestamp, 16);
      if (isFinite(ts)) { bloqueTs = ts; hace(); }
    }).catch(function () {}).then(function () { pidiendo = false; });
  }
  function hace() {
    if (!bloqueTs) return;
    var s = Math.max(0, Math.round(Date.now() / 1000 - bloqueTs));
    poner('[data-hace]', s < 2 ? (EN ? 'just now' : 'recién') : (EN ? s + ' s ago' : 'hace ' + s + ' s'));
  }
  // La barra se llena en los diez segundos que tarda el bloque siguiente.
  function latir() {
    if (latido && bloqueTs) {
      var f = ((Date.now() / 1000 - bloqueTs) % 10) / 10;
      latido.style.setProperty('--late', f.toFixed(3));
    }
    requestAnimationFrame(latir);
  }

  precio(); cadena();
  if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) requestAnimationFrame(latir);
  setInterval(function () { if (!document.hidden) precio(); }, 600000);
  setInterval(function () { if (!document.hidden) cadena(); }, 5000);
  setInterval(function () { if (!document.hidden) hace(); }, 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) cadena(); });
})();

/* ── 4 · COPIAR LOS CÓDIGOS Y LOS VIDEOS ─────────────────────────────── */
(function () {
  document.querySelectorAll('.copiar').forEach(function (b) {
    b.addEventListener('click', function () {
      var txt = b.getAttribute('data-copiar');
      if (b.hasAttribute('data-copiar-vivo')) {
        var d = b.parentNode.querySelector('.dato');
        txt = d ? d.textContent.replace(/[^0-9]/g, '') : '';
        if (!txt) return;
      }
      var antes = b.getAttribute('data-texto') || b.textContent;
      b.setAttribute('data-texto', antes);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () {
        b.textContent = document.documentElement.lang === 'en' ? 'Copied' : 'Copiado';
        setTimeout(function () { b.textContent = antes; }, 1800);
      }, function () {});
    });
  });
  document.querySelectorAll('.pieza').forEach(function (p) {
    var v = p.querySelector('video'), b = p.querySelector('.reproducir');
    if (!v || !b) return;
    v.removeAttribute('controls');
    b.hidden = false;
    b.addEventListener('click', function () {
      b.hidden = true; v.controls = true;
      var r = v.play(); if (r && r.catch) r.catch(function () {});
      v.focus();
    });
  });
})();
