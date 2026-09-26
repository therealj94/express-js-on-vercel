/* ════════════════════════════════════════════════════════════════════════════
   ORDEN GLOBAL · portada 2026

   Tres cosas, y nada más:
     1. El logo se ordena solo. Arranca como líneas enredadas del rojo de las
        fronteras —el mapa del tráiler de ORIGEN— y termina en el OG exacto,
        con sus 93 puntos encendiéndose como las ciudades del cierre. Es el
        nombre de la empresa contado en tres segundos: de desorden a orden.
     2. Los datos vivos: el precio del ORIGEN y el último bloque de la 5550.
     3. Copiar los códigos de la sección de prueba.
     4. El botón propio de los videos.

   Si algo no carga, la página no se rompe: el logo quieto ya está en el
   HTML como imagen, y los datos quedan con su guion.
   ════════════════════════════════════════════════════════════════════════════ */

/* ── 1 · EL LOGO QUE SE ORDENA ─────────────────────────────────────────────── */
(function () {
  var fig = document.querySelector('.marca-viva');
  var V = window.OG_VECTOR;
  if (!fig || !V) return;
  var cv = fig.querySelector('canvas');
  var ctx = cv && cv.getContext && cv.getContext('2d');
  if (!ctx) return;

  var quieto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Un azar con semilla: el enredo sale igual cada vez, y el de la 5550.
  var semilla = 5550;
  function azar() { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; }

  // Cada contorno se remuestrea a paso fijo: la ondulación necesita puntos
  // parejos, y el trazado original viene simplificado.
  function remuestrear(c, paso) {
    var xs = [], ys = [], ss = [], L = 0, tramos = [];
    for (var i = 0; i < c.length; i++) {
      var a = c[i], b = c[(i + 1) % c.length];
      var d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      tramos.push(d); L += d;
    }
    var acum = 0;
    for (i = 0; i < c.length; i++) {
      a = c[i]; b = c[(i + 1) % c.length];
      var n = Math.max(1, Math.round(tramos[i] / paso));
      for (var k = 0; k < n; k++) {
        var f = k / n;
        xs.push(a[0] + (b[0] - a[0]) * f);
        ys.push(a[1] + (b[1] - a[1]) * f);
        ss.push((acum + tramos[i] * f) / L);
      }
      acum += tramos[i];
    }
    return { x: xs, y: ys, s: ss, n: xs.length };
  }

  var lineas = V.lineas.map(function (c) { return remuestrear(c, 0.005); });
  var cx = V.aspecto / 2, cy = 0.5;
  var params = lineas.map(function () {
    return {
      tx: (azar() - 0.5) * 0.9, ty: (azar() - 0.5) * 0.55,
      f1: 1 + Math.floor(azar() * 3), f2: 3 + Math.floor(azar() * 4),
      p1: azar() * 6.283, p2: azar() * 6.283, rot: (azar() - 0.5) * 1.1
    };
  });
  // Los puntos se encienden en desorden, como luces de ciudades.
  var orden = V.puntos.map(function (p, i) { return { i: i, k: azar() }; })
    .sort(function (a, b) { return a.k - b.k; }).map(function (o) { return o.i; });

  var FRONTERA = [184, 65, 47], AMBAR = [232, 150, 60], ORO = [217, 180, 95];
  function mezcla(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function color(e) {
    var c = e < 0.5 ? mezcla(FRONTERA, AMBAR, e * 2) : mezcla(AMBAR, ORO, (e - 0.5) * 2);
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }
  function suave(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function lim(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // Tiempos, en segundos desde que arranca.
  var T_ENREDO = 0.7, T_ORDEN = 2.5, T_RELLENO = 0.8, T_PUNTO = 0.013, T_ENCIENDE = 0.3;
  var T_PUNTOS = T_ENREDO + T_ORDEN + 0.25;
  var T_FIN = T_PUNTOS + V.puntos.length * T_PUNTO + T_ENCIENDE;

  var W = 0, H = 0, esc = 1, ox = 0, oy = 0, dpr = 1;
  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = fig.clientWidth; H = fig.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    esc = Math.min(W * 0.97 / V.aspecto, H * 0.97);
    ox = (W - esc * V.aspecto) / 2; oy = (H - esc) / 2;
  }

  function dibujar(t) {
    var u = lim((t - T_ENREDO) / T_ORDEN), e = suave(u), A = 1 - e;
    var relleno = lim((t - T_ENREDO - T_ORDEN) / T_RELLENO);
    var aparece = lim(t / 0.35);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Las líneas: se van quedando quietas a medida que se ordenan.
    if (relleno < 1) {
      ctx.globalAlpha = aparece * (1 - relleno);
      ctx.strokeStyle = color(e);
      ctx.lineWidth = 1.15;
      ctx.lineJoin = 'round';
      var tiembla = t * 1.4;
      for (var i = 0; i < lineas.length; i++) {
        var L = lineas[i], P = params[i];
        var cr = Math.cos(P.rot * A), sr = Math.sin(P.rot * A);
        ctx.beginPath();
        for (var k = 0; k < L.n; k++) {
          var s = L.s[k] * 6.2832;
          var dx = A * (P.tx + 0.15 * Math.sin(s * P.f1 + P.p1 + tiembla) + 0.06 * Math.sin(s * P.f2 + P.p2 - tiembla * 1.3));
          var dy = A * (P.ty + 0.15 * Math.cos(s * P.f1 + P.p2 + tiembla * 0.8) + 0.06 * Math.sin(s * P.f2 + P.p1));
          var x0 = L.x[k] - cx, y0 = L.y[k] - cy;
          var X = ox + (cx + x0 * cr - y0 * sr + dx) * esc;
          var Y = oy + (cy + x0 * sr + y0 * cr + dy) * esc;
          if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // El logo de verdad, relleno, cuando las líneas ya llegaron.
    if (relleno > 0) {
      ctx.globalAlpha = relleno;
      ctx.fillStyle = 'rgb(217,180,95)';
      ctx.beginPath();
      for (var j = 0; j < V.lineas.length; j++) {
        var c = V.lineas[j];
        for (var m = 0; m < c.length; m++) {
          var px = ox + c[m][0] * esc, py = oy + c[m][1] * esc;
          if (m) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }

    // Los 93 puntos.
    ctx.fillStyle = 'rgb(245,228,171)';
    for (var q = 0; q < orden.length; q++) {
      var a = lim((t - T_PUNTOS - q * T_PUNTO) / T_ENCIENDE);
      if (a <= 0) continue;
      var p = V.puntos[orden[q]];
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(ox + p[0] * esc, oy + p[1] * esc, p[2] * esc * (1 + 0.6 * (1 - a)), 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  var inicio = 0, acabado = false;
  function cuadro(ahora) {
    if (!inicio) inicio = ahora;
    var t = (ahora - inicio) / 1000;
    if (t >= T_FIN) { dibujar(T_FIN + 1); acabado = true; return; }
    dibujar(t);
    requestAnimationFrame(cuadro);
  }

  medir();
  fig.classList.add('vivo');
  if (quieto) { dibujar(T_FIN + 1); acabado = true; }
  else requestAnimationFrame(cuadro);

  var espera;
  window.addEventListener('resize', function () {
    clearTimeout(espera);
    espera = setTimeout(function () { medir(); if (acabado) dibujar(T_FIN + 1); }, 120);
  });
})();

/* ── 2 · SOLO LO REAL SE MUEVE ─────────────────────────────────────────────
   Dos datos vivos, de las mismas fuentes que la billetera. Si una fuente no
   contesta queda el guion: un número inventado que se mueve es peor que
   ninguno, porque parece comprobado. */
(function () {
  var OZ = 31.1035, GRAMIN = 55;
  function todos(sel, fn) { var n = document.querySelectorAll(sel); for (var i = 0; i < n.length; i++) fn(n[i]); }
  // En la tira de arriba, un dato sin leer no se enseña con su guion: se
  // reserva el sitio y aparece cuando llega. Más abajo el guion sí queda,
  // porque ahí se explica de dónde sale cada número.
  var tira = document.querySelector('.vivo-tira');
  if (tira) tira.classList.add('espera');
  function poner(sel, txt) { todos(sel, function (el) {
    el.textContent = txt;
    var s = tira && tira.contains(el) && el.closest('.vivo-tira > span');
    if (s) s.classList.add('listo');
  }); }
  // La misma página sirve en los dos idiomas: coma decimal en español, punto
  // en inglés, y los miles siempre con un espacio fino para que no se confundan.
  var EN = document.documentElement.lang === 'en', LOC = EN ? 'en-US' : 'es-ES';
  function usd(v) { return 'USD ' + v.toLocaleString(LOC, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function miles(n) { return n.toLocaleString('en-US').replace(/,/g, '\u202F'); }

  function precio() {
    fetch('https://api.gold-api.com/price/XAU').then(function (r) { return r.json(); }).then(function (j) {
      var onza = Number(j && j.price);
      if (!isFinite(onza) || onza <= 0) return;
      var gramo = onza / OZ, origen = gramo / GRAMIN;
      poner('[data-origen]', usd(origen));
      poner('[data-gramo]', usd(gramo));
      var h = new Date();
      poner('[data-leido]', h.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }));
    }).catch(function () {});
  }

  var bloqueTs = 0, pidiendo = false;
  function cadena() {
    if (pidiendo) return; pidiendo = true;
    fetch('https://rpc.ordenglobal-rpc.com/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var b = j && j.result; if (!b) return;
      var n = parseInt(b.number, 16); if (!isFinite(n)) return;
      poner('[data-bloque]', miles(n));
      if (b.hash) poner('[data-hash]', b.hash);
      var ts = parseInt(b.timestamp, 16);
      if (isFinite(ts)) { bloqueTs = ts; hace(); }
    }).catch(function () {}).then(function () { pidiendo = false; });
  }
  function hace() {
    if (!bloqueTs) return;
    var s = Math.max(0, Math.round(Date.now() / 1000 - bloqueTs));
    poner('[data-hace]', s < 2 ? (EN ? 'just now' : 'recién') : (EN ? s + ' s ago' : 'hace ' + s + ' s'));
  }

  precio(); cadena();
  setInterval(function () { if (!document.hidden) precio(); }, 600000);
  setInterval(function () { if (!document.hidden) cadena(); }, 10000);
  setInterval(function () { if (!document.hidden) hace(); }, 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) cadena(); });
})();

/* ── 3 · COPIAR LOS CÓDIGOS ─────────────────────────────────────────────── */
(function () {
  var botones = document.querySelectorAll('.copiar');
  for (var i = 0; i < botones.length; i++) {
    botones[i].addEventListener('click', function () {
      var b = this, txt = b.getAttribute('data-copiar');
      // El del bloque se copia como está en ese momento, sin los espacios de miles.
      if (b.hasAttribute('data-copiar-vivo')) {
        var d = b.parentNode.querySelector('.dato');
        txt = d ? d.textContent.replace(/[^0-9]/g, '') : '';
        if (!txt) return;
      }
      var listo = function () {
        var antes = b.getAttribute('data-texto') || b.textContent;
        b.setAttribute('data-texto', antes);
        b.textContent = document.documentElement.lang === 'en' ? 'Copied' : 'Copiado';
        setTimeout(function () { b.textContent = antes; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(listo, function () {});
    });
  }
})();

/* ── 4 · LOS VIDEOS ────────────────────────────────────────────────────── */
// Sin JavaScript el video trae sus controles. Con él, el póster se ve limpio
// y los controles aparecen cuando alguien decide verlo.
(function () {
  var piezas = document.querySelectorAll('.pieza');
  for (var i = 0; i < piezas.length; i++) (function (p) {
    var v = p.querySelector('video'), b = p.querySelector('.reproducir');
    if (!v || !b) return;
    v.removeAttribute('controls');
    b.hidden = false;
    b.addEventListener('click', function () {
      b.hidden = true;
      v.controls = true;
      var r = v.play();
      if (r && r.catch) r.catch(function () {});
      v.focus();
    });
  })(piezas[i]);
})();
