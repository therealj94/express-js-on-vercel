/* ═══════════════════════════════════════════════════════════════════════════
   AU-RA · la asistente del ecosistema, y el cerebro donde habita.

   Este archivo es dos cosas que viven juntas porque son una sola idea:

   · LA RED — un cerebro de miles de neuronas dibujado en un canvas a pantalla
     completa. No es un fondo decorativo: es el Núcleo mismo. Las aplicaciones
     del ecosistema son sus ganglios —zonas de mayor densidad donde las
     señales convergen— y las esferas que se tocan flotan ENCIMA, en el DOM,
     ancladas a las mismas coordenadas.

   · EL ORBE — AU-RA en persona: una esfera de luz que flota en todo el
     ecosistema, escucha, contesta y guía. Modelo 1, en beta, y se presenta
     así: una promesa que crece, no un producto terminado que finge.

   REGLAS DE LA CASA QUE ESTO NO ROMPE:
   · Sin dependencias: canvas nativo, Web Speech nativo, y nada de CDN.
   · AU-RA PREPARA, la persona FIRMA. Jamás toca dinero sola: navega, explica
     y deja todo listo, y la contraseña siempre la pone la persona.
   · Montos y destinos nunca se inventan: salen de lo que la persona dijo y
     de sus contactos, igual que en el teléfono.

   RENDIMIENTO, porque un cerebro que tirona no asombra a nadie:
   · Rejilla espacial para vecinos (nada de O(n²) por cuadro).
   · Los vecinos se recalculan cada N cuadros, no cada cuadro.
   · devicePixelRatio con tope: nitidez sí, cuadruplicar píxeles no.
   · Se pausa solo cuando la pestaña se esconde o la vista no lo muestra.
   · Con prefers-reduced-motion se dibuja UN cuadro quieto y ya.
   ═══════════════════════════════════════════════════════════════════════════ */
const AURA = (() => {
  'use strict';

  const REDUCIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── la paleta del cerebro ─────────────────────────────────────────────────
  // Fondo casi negro con un suspiro de verde: el pozo de la marca apagado.
  // Neuronas en jade y bruma; las señales, en oro. El oro se reserva para lo
  // que viaja y para los ganglios: si todo brilla, nada brilla.
  const NEGRO = '#010708';
  const TINTES = [
    [126, 216, 196],   // jade claro
    [90, 160, 148],    // jade hondo
    [174, 199, 195],   // bruma
    [201, 169, 97],    // oro (poquísimas: 1 de cada 12)
  ];
  const ORO = [234, 215, 156];

  /* ════════════════════════════════════════════════════════════════════════
     LA RED
     ════════════════════════════════════════════════════════════════════════ */
  const red = {
    canvas: null, ctx: null,
    ancho: 0, alto: 0, dpr: 1,
    n: [],              // neuronas
    ganglios: [],       // [{id, x, y, r, tinte:[r,g,b], vivo}] en píxeles
    pulsos: [],         // señales viajando
    destellos: [],      // ondas al llegar una señal
    rejilla: null, celda: 96,
    cuadro: 0,
    puntero: { x: -9999, y: -9999 },
    energia: 0,         // 0 = dormida (bienvenida arranca aquí) · 1 = plena
    energiaMeta: 1,
    viva: false, raf: 0,
    alDestellar: null,  // aviso hacia fuera: un ganglio recibió señal
  };

  function densidad() {
    // Cuántas neuronas caben con dignidad: ~1 por cada 720px² en pantallas
    // grandes, con piso y techo. En un móvil salen ~1400; en un monitor
    // grande, ~3800. "Miles", literalmente, sin fundir un teléfono.
    const area = red.ancho * red.alto;
    return Math.max(1200, Math.min(3800, Math.round(area / 720)));
  }

  function sembrar() {
    const total = densidad();
    red.n = [];
    for (let i = 0; i < total; i++) {
      // Tres capas de profundidad: las hondas se mueven menos y se ven más
      // tenues. Es lo que hace que el ojo lea VOLUMEN y no confeti.
      const capa = i % 3;
      const z = capa === 0 ? 0.45 : capa === 1 ? 0.72 : 1;
      const tinte = TINTES[i % 9 === 0 ? 3 : i % 3];
      red.n.push({
        x: Math.random() * red.ancho,
        y: Math.random() * red.alto,
        ax: 0, ay: 0,               // ancla (se fija abajo)
        vx: 0, vy: 0,
        z, tinte,
        r: (0.6 + Math.random() * 1.1) * z,
        fase: Math.random() * Math.PI * 2,
        brillo: 0,                   // excitación (puntero o señal cerca)
        vecinos: [],
      });
    }
    // El ancla es donde nació: la neurona deriva alrededor y siempre vuelve.
    // Sin ancla, en tres minutos el flujo las amontona en una esquina.
    for (const p of red.n) { p.ax = p.x; p.ay = p.y; }

    // Alrededor de cada ganglio, densidad extra: un anillo de neuronas más
    // juntas. Es lo que hace que cada app se lea como un ÓRGANO del cerebro
    // y no como un botón pegado encima.
    for (const g of red.ganglios) {
      const extra = 46;
      for (let i = 0; i < extra; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = g.r * (0.7 + Math.random() * 1.5);
        const x = g.x + Math.cos(ang) * d, y = g.y + Math.sin(ang) * d;
        const tinte = i % 5 === 0 ? ORO : g.tinte;
        red.n.push({
          x, y, ax: x, ay: y, vx: 0, vy: 0, z: 1,
          tinte, r: 0.8 + Math.random() * 1.2,
          fase: Math.random() * Math.PI * 2, brillo: 0, vecinos: [],
        });
      }
    }
  }

  // ── vecindario ────────────────────────────────────────────────────────────
  function armarRejilla() {
    const cols = Math.max(1, Math.ceil(red.ancho / red.celda));
    const filas = Math.max(1, Math.ceil(red.alto / red.celda));
    const g = new Array(cols * filas);
    for (let i = 0; i < g.length; i++) g[i] = [];
    for (let i = 0; i < red.n.length; i++) {
      const p = red.n[i];
      const c = Math.min(cols - 1, Math.max(0, (p.x / red.celda) | 0));
      const f = Math.min(filas - 1, Math.max(0, (p.y / red.celda) | 0));
      g[f * cols + c].push(i);
    }
    red.rejilla = { g, cols, filas };
  }

  function tejerSinapsis() {
    // Cada neurona se une a sus 2 vecinas más cercanas dentro del radio.
    // Dos y no cinco: el encaje de una red neuronal se lee por los huecos
    // tanto como por los hilos, y con cinco queda una telaraña sucia.
    const R = red.celda, R2 = R * R;
    const { g, cols, filas } = red.rejilla;
    for (let i = 0; i < red.n.length; i++) {
      const p = red.n[i];
      const c = Math.min(cols - 1, Math.max(0, (p.x / red.celda) | 0));
      const f = Math.min(filas - 1, Math.max(0, (p.y / red.celda) | 0));
      let mejor = -1, mejor2 = -1, dM = R2, dM2 = R2;
      for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
        const ff = f + df, cc = c + dc;
        if (ff < 0 || cc < 0 || ff >= filas || cc >= cols) continue;
        const celda = g[ff * cols + cc];
        for (let k = 0; k < celda.length; k++) {
          const j = celda[k];
          if (j <= i) continue;                    // cada arista una sola vez
          const q = red.n[j];
          const dx = q.x - p.x, dy = q.y - p.y, d = dx * dx + dy * dy;
          if (d < dM) { dM2 = dM; mejor2 = mejor; dM = d; mejor = j; }
          else if (d < dM2) { dM2 = d; mejor2 = j; }
        }
      }
      p.vecinos.length = 0;
      if (mejor >= 0) p.vecinos.push(mejor);
      if (mejor2 >= 0) p.vecinos.push(mejor2);
    }
  }

  // ── las señales ───────────────────────────────────────────────────────────
  /* Un pulso es un paquete de luz que viaja de neurona en neurona hacia un
     ganglio. No sigue una ruta calculada de verdad —eso sería un A* que nadie
     ve— sino la ilusión honesta: en cada salto elige, entre los vecinos de la
     rejilla, el que más lo acerque al destino. El ojo lee "la red piensa". */
  function nacerPulso(gid) {
    if (!red.ganglios.length) return;
    const g = gid != null
      ? red.ganglios.find(x => x.id === gid) || red.ganglios[(Math.random() * red.ganglios.length) | 0]
      : red.ganglios[(Math.random() * red.ganglios.length) | 0];
    // Nace lejos del destino, en una neurona cualquiera del tercio exterior.
    let origen = null;
    for (let intento = 0; intento < 12 && !origen; intento++) {
      const p = red.n[(Math.random() * red.n.length) | 0];
      const dx = p.x - g.x, dy = p.y - g.y;
      if (dx * dx + dy * dy > 240 * 240) origen = p;
    }
    if (!origen) return;
    red.pulsos.push({
      x: origen.x, y: origen.y, ox: origen.x, oy: origen.y,
      tx: origen.x, ty: origen.y, t: 1,
      destino: g, vida: 260, oro: Math.random() < 0.85,
    });
  }

  function saltoDePulso(p) {
    // El siguiente tramo: el vecino de rejilla que más acerque al ganglio.
    const { g, cols, filas } = red.rejilla;
    const c = Math.min(cols - 1, Math.max(0, (p.x / red.celda) | 0));
    const f = Math.min(filas - 1, Math.max(0, (p.y / red.celda) | 0));
    const dxG = p.destino.x - p.x, dyG = p.destino.y - p.y;
    const dG = Math.hypot(dxG, dyG);
    if (dG < p.destino.r * 0.5) return false;      // llegó
    let elegido = null, mejor = Infinity;
    for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
      const ff = f + df, cc = c + dc;
      if (ff < 0 || cc < 0 || ff >= filas || cc >= cols) continue;
      const celda = g[ff * cols + cc];
      for (let k = 0; k < celda.length; k++) {
        const q = red.n[celda[k]];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = dx * dx + dy * dy;
        if (d < 36 || d > red.celda * red.celda) continue;  // ni encima ni un teletransporte
        // qué tanto acerca: distancia del candidato al destino
        const dd = Math.hypot(p.destino.x - q.x, p.destino.y - q.y);
        if (dd < mejor) { mejor = dd; elegido = q; }
      }
    }
    if (!elegido || mejor >= dG) {
      // Sin vecino que acerque: tramo directo corto (pasa en zonas ralas).
      const paso = Math.min(70, dG);
      p.tx = p.x + (dxG / dG) * paso; p.ty = p.y + (dyG / dG) * paso;
    } else {
      p.tx = elegido.x; p.ty = elegido.y;
      elegido.brillo = Math.min(1, elegido.brillo + 0.8);   // la estela excita
    }
    p.ox = p.x; p.oy = p.y; p.t = 0;
    return true;
  }

  // ── el ciclo ──────────────────────────────────────────────────────────────
  function paso() {
    const t = red.cuadro * 0.006;
    red.energia += (red.energiaMeta - red.energia) * 0.02;

    // El campo de flujo: dos senos cruzados. Es la marea que hace que el
    // cerebro RESPIRE en corrientes y no en temblor aleatorio.
    for (let i = 0; i < red.n.length; i++) {
      const p = red.n[i];
      const fx = Math.sin(p.y * 0.011 + t + p.fase) * 0.05
               + Math.sin(p.y * 0.003 - t * 0.7) * 0.03;
      const fy = Math.cos(p.x * 0.011 - t + p.fase) * 0.05
               + Math.cos(p.x * 0.004 + t * 0.6) * 0.03;
      // el ancla tira de vuelta; el flujo empuja; la fricción calma
      p.vx = (p.vx + fx * p.z + (p.ax - p.x) * 0.0016) * 0.96;
      p.vy = (p.vy + fy * p.z + (p.ay - p.y) * 0.0016) * 0.96;

      // el puntero excita lo que toca: la red se da cuenta de que estás
      const dx = p.x - red.puntero.x, dy = p.y - red.puntero.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 130 * 130) p.brillo = Math.min(1, p.brillo + 0.06);
      p.brillo *= 0.955;

      p.x += p.vx * red.energia; p.y += p.vy * red.energia;
    }

    /* Las orbitas. El canvas y el DOM leen LA MISMA formula en el mismo
       cuadro: el halo dibujado y el boton que se toca son un solo cuerpo,
       no dos capas que se persiguen. Con movimiento reducido no hay orbita:
       la constelacion se queda quieta y digna. */
    if (!REDUCIDO) {
      for (const g of red.ganglios) {
        const ang = red.cuadro * g.orbV + g.orbF;
        // el objetivo de cada organo: su orbita — o la mano que lo agarro
        let ox = Math.cos(ang) * g.orbR * red.energia;
        let oy = Math.sin(ang * 0.83) * g.orbR * red.energia;
        if (g.agarrado) { ox = g.manoX; oy = g.manoY; }
        /* El resorte. Agarrado sigue a la mano casi pegado; suelto REGRESA
           elastico a su orbita — se puede jalar una esfera, soltarla, y
           verla volver a su lugar en la constelacion. Eso es lo que vuelve
           juguete un tablero: se toca, responde, y nada se rompe. */
        const k = g.agarrado ? 0.55 : 0.055;
        g.offX = (g.offX || 0) + (ox - (g.offX || 0)) * k;
        g.offY = (g.offY || 0) + (oy - (g.offY || 0)) * k;
        g.x = g.ax + g.offX; g.y = g.ay + g.offY;
        if (g.el) g.el.style.translate = g.offX.toFixed(1) + 'px ' + g.offY.toFixed(1) + 'px';
      }
    }

    // vecinos: cada 10 cuadros basta — el drift es lento
    if (red.cuadro % 10 === 0) { armarRejilla(); tejerSinapsis(); }

    // pulsos: nacen a un ritmo que respira, viajan, llegan, destellan
    if (red.cuadro % 20 === 0 && red.pulsos.length < 20 && red.energia > 0.4) nacerPulso();
    for (let i = red.pulsos.length - 1; i >= 0; i--) {
      const p = red.pulsos[i];
      p.vida--; p.t += 0.16;
      if (p.t >= 1) {
        p.x = p.tx; p.y = p.ty;
        if (!saltoDePulso(p) || p.vida <= 0) {
          if (p.vida > 0) {  // llegó de verdad: destello en el ganglio
            red.destellos.push({ x: p.destino.x, y: p.destino.y, r: p.destino.r * 0.4, v: 1, tinte: p.destino.tinte });
            if (red.alDestellar) red.alDestellar(p.destino.id);
          }
          red.pulsos.splice(i, 1);
          continue;
        }
      } else {
        const s = p.t * p.t * (3 - 2 * p.t);       // suaviza el tramo
        p.x = p.ox + (p.tx - p.ox) * s;
        p.y = p.oy + (p.ty - p.oy) * s;
      }
    }
    for (let i = red.destellos.length - 1; i >= 0; i--) {
      const d = red.destellos[i];
      d.r += 2.6; d.v -= 0.03;
      if (d.v <= 0) red.destellos.splice(i, 1);
    }
    red.cuadro++;
  }

  function dibujar() {
    const c = red.ctx;
    c.setTransform(red.dpr, 0, 0, red.dpr, 0, 0);
    c.clearRect(0, 0, red.ancho, red.alto);

    const E = red.energia;

    // sinapsis primero: los hilos van DEBAJO de las cuentas
    c.lineWidth = 0.55;
    for (let i = 0; i < red.n.length; i++) {
      const p = red.n[i];
      for (let k = 0; k < p.vecinos.length; k++) {
        const q = red.n[p.vecinos[k]];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > red.celda) continue;
        const cerca = 1 - d / red.celda;
        const a = (0.10 + cerca * 0.18 + (p.brillo + q.brillo) * 0.16) * p.z * E;
        if (a < 0.012) continue;
        c.strokeStyle = `rgba(${p.tinte[0]},${p.tinte[1]},${p.tinte[2]},${a})`;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
      }
    }

    // neuronas
    for (let i = 0; i < red.n.length; i++) {
      const p = red.n[i];
      const lat = 0.72 + 0.28 * Math.sin(red.cuadro * 0.02 + p.fase);
      const a = (0.32 + p.brillo * 0.68) * p.z * lat * E;
      if (a < 0.02) continue;
      const r = p.r + p.brillo * 1.6;
      c.fillStyle = `rgba(${p.tinte[0]},${p.tinte[1]},${p.tinte[2]},${a})`;
      c.beginPath(); c.arc(p.x, p.y, r, 0, 6.2832); c.fill();
    }

    // las avenidas: curvas tenues entre organos vecinos, con una gota de
    // luz recorriendolas — el «todo esta conectado» dicho en un trazo
    for (const g of red.ganglios) {
      for (const o of g.union || []) {
        if (o.ax < g.ax) continue;                 // cada avenida una vez
        const mx = (g.x + o.x) / 2, my = (g.y + o.y) / 2 - 34;
        c.strokeStyle = `rgba(201,169,97,${0.17 * E})`;
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(g.x, g.y); c.quadraticCurveTo(mx, my, o.x, o.y); c.stroke();
        // la gota: recorre la curva con el reloj de la red
        const t2 = ((red.cuadro * 0.004 + (g.ax + o.ay) * 0.001) % 1 + 1) % 1;
        const u = 1 - t2;
        const gx = u * u * g.x + 2 * u * t2 * mx + t2 * t2 * o.x;
        const gy = u * u * g.y + 2 * u * t2 * my + t2 * t2 * o.y;
        c.fillStyle = `rgba(234,215,156,${0.9 * E})`;
        c.beginPath(); c.arc(gx, gy, 2.1, 0, 6.2832); c.fill();
      }
    }

    // halos de ganglio: el aliento de cada órgano
    for (const g of red.ganglios) {
      const lat = 0.5 + 0.5 * Math.sin(red.cuadro * 0.015 + g.x);
      const grad = c.createRadialGradient(g.x, g.y, g.r * 0.2, g.x, g.y, g.r * 1.7);
      grad.addColorStop(0, `rgba(${g.tinte[0]},${g.tinte[1]},${g.tinte[2]},${0.10 + lat * 0.05})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grad;
      c.beginPath(); c.arc(g.x, g.y, g.r * 1.7, 0, 6.2832); c.fill();
    }

    // pulsos: la cabeza en oro y una cola corta
    for (const p of red.pulsos) {
      const [r1, g1, b1] = p.oro ? ORO : [126, 216, 196];
      c.strokeStyle = `rgba(${r1},${g1},${b1},0.5)`;
      c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(p.ox + (p.x - p.ox) * 0.4, p.oy + (p.y - p.oy) * 0.4); c.lineTo(p.x, p.y); c.stroke();
      c.fillStyle = `rgba(${r1},${g1},${b1},0.95)`;
      c.beginPath(); c.arc(p.x, p.y, 1.9, 0, 6.2832); c.fill();
      c.fillStyle = `rgba(255,255,255,0.6)`;
      c.beginPath(); c.arc(p.x, p.y, 0.8, 0, 6.2832); c.fill();
    }

    // destellos de llegada
    for (const d of red.destellos) {
      c.strokeStyle = `rgba(${d.tinte[0]},${d.tinte[1]},${d.tinte[2]},${d.v * 0.5})`;
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(d.x, d.y, d.r, 0, 6.2832); c.stroke();
    }
  }

  function ciclo() {
    if (!red.viva) return;
    paso(); dibujar();
    red.raf = requestAnimationFrame(ciclo);
  }

  function medir() {
    const c = red.canvas;
    if (!c) return;
    red.dpr = Math.min(1.5, devicePixelRatio || 1);
    red.ancho = c.clientWidth; red.alto = c.clientHeight;
    c.width = Math.round(red.ancho * red.dpr);
    c.height = Math.round(red.alto * red.dpr);
  }

  /**
   * Monta la red en un canvas. `ganglios` llega en tanto por ciento del
   * cuadro (las mismas coordenadas que las esferas del DOM) y aquí se pasa a
   * píxeles: una sola fuente de verdad para el dibujo y para los botones.
   */
  function montarRed(canvas, ganglios, opciones = {}) {
    pararRed();
    red.canvas = canvas; red.ctx = canvas.getContext('2d');
    medir();
    /* La red siente el puntero: las neuronas cercanas se excitan. Es un
       detalle de dos lineas y es la mitad de la sensacion de VIVO. El
       listener va en window y no en el canvas porque las esferas del DOM
       estan encima y se comerian el evento. */
    if (!red.oyePuntero) {
      red.oyePuntero = true;
      addEventListener('pointermove', ev => {
        if (!red.canvas) return;
        const r = red.canvas.getBoundingClientRect();
        red.puntero.x = ev.clientX - r.left;
        red.puntero.y = ev.clientY - r.top;
      }, { passive: true });
      addEventListener('pointerleave', () => { red.puntero.x = red.puntero.y = -9999; });
    }
    red.ganglios = (ganglios || []).map((g, i) => ({
      id: g.id,
      // el sitio en TANTO POR CIENTO se guarda: es lo único que sobrevive a
      // un giro de pantalla, y de ahí se vuelven a sacar los píxeles
      px: g.x, py: g.y, tam: g.tam || 1,
      // el ANCLA es fija; la posicion viva (x,y) orbita alrededor
      ax: (g.x / 100) * red.ancho,
      ay: (g.y / 100) * red.alto,
      x: (g.x / 100) * red.ancho,
      y: (g.y / 100) * red.alto,
      r: (g.tam || 1) * Math.min(red.ancho, red.alto) * 0.06,
      tinte: g.tinte || [201, 169, 97],
      // La orbita de cada organo: radios y velocidades distintas y primas
      // entre si, para que la constelacion nunca repita la misma foto. El
      // centro (la billetera) casi no se mueve: es el corazon, no un satelite.
      orbR: (g.id === 'wallet' ? 4 : 10 + (i % 3) * 4),
      orbV: 0.0021 + (i % 5) * 0.0007,
      orbF: i * 2.39996,               // el angulo aureo: reparte las fases
      el: (opciones.elementos || {})[g.id] || null,
    }));
    // La constelacion: cada ganglio se une a sus dos vecinos mas cercanos.
    // Son las avenidas del cerebro — por ellas tambien viajan senales.
    for (const g of red.ganglios) {
      g.union = red.ganglios
        .filter(o => o !== g)
        .sort((a2, b2) => Math.hypot(a2.ax - g.ax, a2.ay - g.ay) - Math.hypot(b2.ax - g.ax, b2.ay - g.ay))
        .slice(0, 2);
    }
    red.energia = opciones.despertar ? 0 : 1;
    red.energiaMeta = 1;
    red.alDestellar = opciones.alDestellar || null;
    for (const g of red.ganglios) {
      if (!g.el || REDUCIDO) continue;
      g.el.style.touchAction = 'none';
      // guardado en el ganglio para poder quitarlo en pararRed(): sin eso,
      // volver al Núcleo sumaba un oyente más sobre el mismo botón
      g.soltarOyente = ev => {
        const x0 = ev.clientX, y0 = ev.clientY, off0x = g.offX || 0, off0y = g.offY || 0;
        let jalo = false;
        const mover = e2 => {
          const dx = e2.clientX - x0, dy = e2.clientY - y0;
          if (!jalo && dx * dx + dy * dy < 36) return;    // aun puede ser un clic
          jalo = true;
          g.agarrado = true;
          // la correa: hasta 90px de estiron; mas alla la esfera no sigue
          g.manoX = Math.max(-90, Math.min(90, off0x + dx));
          g.manoY = Math.max(-90, Math.min(90, off0y + dy));
        };
        const soltar = () => {
          removeEventListener('pointermove', mover);
          removeEventListener('pointerup', soltar);
          removeEventListener('pointercancel', soltar);
          if (jalo) {
            g.agarrado = false;
            // el clic que viene detras de un jalon no es un clic: se anula
            // aqui y nuAbrir lo consulta antes de navegar
            red.jalonHasta = Date.now() + 350;
          }
        };
        addEventListener('pointermove', mover);
        addEventListener('pointerup', soltar);
        addEventListener('pointercancel', soltar);
      };
      g.el.addEventListener('pointerdown', g.soltarOyente);
    }
    sembrar(); armarRejilla(); tejerSinapsis();
    if (REDUCIDO) {
      // Un solo cuadro, quieto y con energía plena: el cerebro se VE, no marea.
      red.energia = 1; paso(); dibujar();
      return;
    }
    red.viva = true;
    ciclo();
  }

  function pararRed() {
    red.viva = false;
    if (red.raf) cancelAnimationFrame(red.raf);
    red.raf = 0;
    red.pulsos.length = 0; red.destellos.length = 0;
    /* Cada esfera se lleva su oyente. Montar la red dos veces —entrar al
       Núcleo, salir y volver— dejaba dos escuchas de puntero en el mismo
       botón, y arrastrar movía la esfera al doble de velocidad. */
    for (const g of red.ganglios) {
      if (g.el && g.soltarOyente) { g.el.removeEventListener('pointerdown', g.soltarOyente); }
      g.soltarOyente = null;
    }
    red.ganglios = [];
    /* Y se suelta el canvas: si no, el vigilante de la pestaña resucitaba el
       bucle de dibujo al volver, con la sesión ya cerrada y el canvas fuera
       del documento. */
    red.canvas = null; red.ctx = null;
  }

  /** Manda una ráfaga de señales hacia un ganglio: "mirá ESTO". */
  function latirHacia(id, cuantas = 5) {
    for (let i = 0; i < cuantas; i++) setTimeout(() => nacerPulso(id), i * 130);
  }

  /* Girar el teléfono cambia el cuadro, y hasta ahora el canvas se quedaba con
     la medida vieja: las neuronas se estiraban y —lo que se ve feo de
     verdad— los ganglios dejaban de coincidir con las esferas del DOM, que
     sí se recolocan solas porque están en tanto por ciento. Se vuelve a
     medir y a sembrar; el retardo es para no hacerlo sesenta veces mientras
     alguien arrastra el borde de la ventana. */
  let relojMedida = 0;
  addEventListener('resize', () => {
    if (!red.canvas) return;
    clearTimeout(relojMedida);
    relojMedida = setTimeout(() => {
      if (!red.canvas || !red.canvas.isConnected) return;
      const anchoAntes = red.ancho, altoAntes = red.alto;
      medir();
      if (red.ancho === anchoAntes && red.alto === altoAntes) return;
      for (const g of red.ganglios) {
        g.ax = (g.px / 100) * red.ancho;
        g.ay = (g.py / 100) * red.alto;
        g.x = g.ax; g.y = g.ay;
        g.r = g.tam * Math.min(red.ancho, red.alto) * 0.06;
      }
      for (const g of red.ganglios) {
        g.union = red.ganglios
          .filter(o => o !== g)
          .sort((a2, b2) => Math.hypot(a2.ax - g.ax, a2.ay - g.ay) - Math.hypot(b2.ax - g.ax, b2.ay - g.ay))
          .slice(0, 2);
      }
      red.pulsos.length = 0; red.destellos.length = 0;
      sembrar(); armarRejilla(); tejerSinapsis();
      if (REDUCIDO) { paso(); dibujar(); }
    }, 220);
  });

  // La pestaña escondida no gasta batería en pensar.
  document.addEventListener('visibilitychange', () => {
    if (!red.canvas) return;
    if (document.hidden) { red.viva = false; if (red.raf) cancelAnimationFrame(red.raf); }
    else if (!REDUCIDO && red.canvas.isConnected) { red.viva = true; ciclo(); }
  });

  /* ════════════════════════════════════════════════════════════════════════
     EL ORBE
     Una esfera de luz respirando en su propio canvas chico. Cuatro ánimos:
     dormida (respira), escuchando (se abre), pensando (gira), hablando
     (ondula al ritmo). El dibujo son tres lóbulos de gradiente girando a
     velocidades primas entre sí: nunca se repite exactamente, como algo vivo.
     ════════════════════════════════════════════════════════════════════════ */
  const orbe = { canvas: null, ctx: null, lado: 0, animo: 'dormida', nivel: 0, raf: 0, t: 0 };
  const LOBULOS = [
    { tinte: [126, 216, 196], v: 0.011, d: 0.30 },
    { tinte: [201, 169, 97], v: -0.017, d: 0.34 },
    { tinte: [158, 134, 240], v: 0.023, d: 0.26 },   // el violeta: lo nuevo
  ];

  function dibujarOrbe() {
    const o = orbe, c = o.ctx;
    if (!c) return;
    o.t++;
    const L = o.lado, m = L / 2;
    c.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    c.clearRect(0, 0, L, L);

    const resp = o.animo === 'dormida' ? 0.05 * Math.sin(o.t * 0.03)
      : o.animo === 'escuchando' ? 0.10 * Math.sin(o.t * 0.12)
      : o.animo === 'pensando' ? 0.06 * Math.sin(o.t * 0.2)
      : 0.06 + o.nivel * 0.22;                      // hablando: el audio manda
    const R = m * (0.46 + resp * 0.5);

    // el vidrio de fondo
    const fondo = c.createRadialGradient(m, m, R * 0.1, m, m, R);
    fondo.addColorStop(0, 'rgba(16,46,44,0.92)');
    fondo.addColorStop(1, 'rgba(3,14,15,0.95)');
    c.fillStyle = fondo;
    c.beginPath(); c.arc(m, m, R, 0, 6.2832); c.fill();

    // los lóbulos, recortados a la esfera
    c.save();
    c.beginPath(); c.arc(m, m, R, 0, 6.2832); c.clip();
    const rapido = o.animo === 'pensando' ? 3 : 1;
    for (const l of LOBULOS) {
      const a = o.t * l.v * rapido;
      const x = m + Math.cos(a) * R * l.d;
      const y = m + Math.sin(a * 1.3) * R * l.d;
      const g = c.createRadialGradient(x, y, 0, x, y, R * 0.9);
      g.addColorStop(0, `rgba(${l.tinte[0]},${l.tinte[1]},${l.tinte[2]},0.78)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, L, L);
    }
    // el reflejo de arriba: lo que la vuelve esfera y no mancha
    const brillo = c.createRadialGradient(m - R * 0.35, m - R * 0.45, 0, m - R * 0.35, m - R * 0.45, R * 0.8);
    brillo.addColorStop(0, 'rgba(255,255,255,0.28)');
    brillo.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = brillo;
    c.fillRect(0, 0, L, L);
    c.restore();

    // el aro: quieto de ánimo dormido, ondulando cuando habla o escucha
    const ondas = o.animo === 'hablando' ? 2 + o.nivel * 5
      : o.animo === 'escuchando' ? 2.4 : 0.9;
    c.strokeStyle = 'rgba(234,215,156,0.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    for (let a = 0; a <= 128; a++) {
      const ang = (a / 128) * 6.2832;
      const rr = R + 3 + Math.sin(ang * 7 + o.t * 0.14) * ondas;
      const x = m + Math.cos(ang) * rr, y = m + Math.sin(ang) * rr;
      a === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.closePath(); c.stroke();

    if (!REDUCIDO) orbe.raf = requestAnimationFrame(dibujarOrbe);
  }

  function montarOrbe(canvas) {
    if (orbe.raf) cancelAnimationFrame(orbe.raf);
    orbe.canvas = canvas; orbe.ctx = canvas.getContext('2d');
    orbe.dpr = Math.min(2, devicePixelRatio || 1);
    orbe.lado = canvas.clientWidth;
    canvas.width = canvas.height = Math.round(orbe.lado * orbe.dpr);
    dibujarOrbe();
  }
  const animoOrbe = a => { orbe.animo = a; };
  const nivelOrbe = v => { orbe.nivel = Math.max(0, Math.min(1, v)); };

  /* ════════════════════════════════════════════════════════════════════════
     LA VOZ
     Primero la voz de la casa (el cerebro sirve audio de verdad, humano);
     si no llega o no está configurada, la del navegador con la mejor voz
     disponible del idioma. AU-RA jamás se queda muda por un fallo de red:
     bajar de calidad sí, callarse no.
     ════════════════════════════════════════════════════════════════════════ */
  /* LA VOZ GRABADA. Las frases fijas de AU-RA estan sintetizadas de antemano
     con Piper —la misma voz humana del cerebro de la casa, es_MX-claude y
     en_US-ryan— y servidas como ficheros desde el nodo del cerebro. El mapa
     de claves viaja INCRUSTADO aqui: sin fetch de manifiesto no hay CORS que
     configurar, y un <audio> cruza dominios sin pedir permiso.

     La clave es un FNV-1a de 32 bits de 'voz|texto', gemelo del de
     infra/cerebro/voz/rendir.py: si el texto cambia UNA coma, la clave
     cambia, el fichero no aparece y la frase cae sola a la voz del
     navegador. A proposito: mejor la voz de siempre que un audio que dice
     otra cosa que el subtitulo. Al cambiar textos hay que re-grabar
     (scratchpad/sacar-frases-aura.mjs → rendir.py → subir-voz-aura.py). */
  const VOZ_BASE = 'https://cerebro.ordenscan.com/voz/aura/';
  const VOZ_NOMBRE = { es: 'es_MX-claude-high', en: 'en_US-ryan-high' };
  const VOZ_MAPA = {
    '02e6279d': 1,
    '0a698dd6': 1,
    '0aa8d602': 1,
    '0abc7817': 1,
    '11243db2': 1,
    '1192a5d0': 1,
    '1eef45ee': 1,
    '1fa91c50': 1,
    '2453771b': 1,
    '252cd472': 1,
    '27893a96': 1,
    '2b30e4f6': 1,
    '2d74f75e': 1,
    '3101125c': 1,
    '310fbb99': 1,
    '332361ae': 1,
    '36c255d7': 1,
    '3c6e2bfd': 1,
    '4f5bde62': 1,
    '5282566d': 1,
    '53061f13': 1,
    '553f3f65': 1,
    '59321a82': 1,
    '612e9ecd': 1,
    '63614b00': 1,
    '66d9368a': 1,
    '677d2a34': 1,
    '725dd181': 1,
    '7800d0d3': 1,
    '7c4f68af': 1,
    '82715749': 1,
    '8d89f9e6': 1,
    '8dc001b9': 1,
    '8dc9a96e': 1,
    '98f8ef44': 1,
    'a27b1467': 1,
    'a4356c62': 1,
    'a6789581': 1,
    'ae407c8f': 1,
    'b07bb38d': 1,
    'b43b4c43': 1,
    'bab54a0a': 1,
    'bba90ea2': 1,
    'bcb5c233': 1,
    'bf2a7740': 1,
    'c31085c2': 1,
    'c60ebae7': 1,
    'd1605a1e': 1,
    'd53038d9': 1,
    'd64dfe40': 1,
    'd6c5fd6e': 1,
    'd7e0b3e7': 1,
    'e4c0c0ec': 1,
    'eb4090e0': 1,
    'ec73b95b': 1,
    'f9539766': 1,
    'fd0e7868': 1,
    'ff1bf3db': 1
  };

  function claveVoz(texto, lang) {
    const cadena = (VOZ_NOMBRE[lang] || VOZ_NOMBRE.es) + '|' + texto;
    const bytes = new TextEncoder().encode(cadena);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  let sonando = null;         // el <audio> vivo, para poder cortarlo
  let alTerminarVoz = null;   // cómo se cierra la frase EN CURSO si la cortan

  /* Cada frase tiene su turno. Cortar la voz sube el número, y con eso todo
     lo que venía en camino de la frase anterior —el error del audio, el
     vigilante de los 5s, el rechazo de play()— sabe que ya no es su momento
     y se calla en vez de arrancar la voz del navegador con una frase que
     acababan de mandar callar. Sin esto, saltar la bienvenida o adelantar
     una parada del recorrido dejaba a AU-RA hablando sola, y a veces dos
     voces encima. */
  let turnoVoz = 0;

  function pararVoz() {
    turnoVoz++;
    if (sonando) { try { sonando.pause(); } catch {} sonando = null; }
    try { speechSynthesis.cancel(); } catch {}
    animoOrbe('dormida'); nivelOrbe(0);
    // pause() no dispara ni `ended` ni `error`, así que la promesa de la
    // frase cortada se quedaría colgada para siempre —y con ella el
    // recorrido, que espera a que termine— si no se cierra aquí a mano.
    if (alTerminarVoz) { const f = alTerminarVoz; alTerminarVoz = null; f(); }
  }

  function mejorVozLocal(lang) {
    const voces = speechSynthesis.getVoices() || [];
    const del = voces.filter(v => v.lang && v.lang.toLowerCase().startsWith(lang));
    // Las voces "neural/natural/online" de los sistemas modernos suenan a
    // persona; las viejas, a contestador. Se prefieren por nombre.
    return del.find(v => /natural|neural|online|premium|enhanced/i.test(v.name))
        || del.find(v => !v.localService) || del[0] || null;
  }

  /* COMO SE PRONUNCIA LA CASA. Las marcas escritas no se leen solas:
     «AU-RA» sale deletreado, «AUBANK» masticado y «Ordenexchange» de
     corrido. Este mapa es SOLO para la boca — el texto en pantalla y la
     clave del audio grabado siguen siendo los originales. El gemelo de este
     mapa vive en el guion de grabacion (sacar-frases-aura.mjs): si cambia
     uno, cambia el otro. */
  const DICCION = {
    es: [
      [/AU-RA/g, 'Aura'], [/AUBANK/g, 'Au Banc'], [/Ordenexchange/g, 'Orden Exchéinch'],
      [/PULSE CHAT/g, 'Puls Chat'], [/MyTokenPay/g, 'Mai Token Péi'],
      [/Veta Wallet/g, 'Veta Wálet'], [/ordenscan/g, 'orden scan'],
      [/Genesis ID/g, 'Génesis Aidí'], [/Layer 1/g, 'Léyer Uan'],
      [/Hyperledger Besu/g, 'Jaiper Ledyer Besu'], [/QBFT/g, 'Cu Be Efe Te'],
    ],
    en: [
      [/AU-RA/g, 'Aura'], [/AUBANK/g, 'A U Bank'], [/Ordenexchange/g, 'Orden Exchange'],
      [/ORIGEN/g, 'Oreehen'], [/Orden Global/g, 'Orden Global'],
    ],
  };
  const pronunciar = (texto, lang) =>
    (DICCION[lang] || []).reduce((t2, [re, con]) => t2.replace(re, con), texto);

  function hablarConNavegador(texto, lang, alTerminar) {
    /* EL VIGILANTE, y es lo que salva todo lo que espera a esta promesa.
       En un navegador sin voces instaladas, speak() se traga la frase y
       jamas dispara onend ni onerror: la promesa quedaria colgada y con
       ella el autoavance del recorrido y la bienvenida entera. Se vigila
       dos veces: a los 900ms (¿arranco siquiera?) y con un tope duro
       proporcional al texto (¿termino alguna vez?). El cerebro de los
       inversionistas usa el mismo truco por la misma cicatriz. */
    let termino = false;
    const terminar = () => {
      if (termino) return;
      termino = true;
      animoOrbe('dormida'); nivelOrbe(0);
      if (alTerminar) alTerminar();
    };
    try {
      const u = new SpeechSynthesisUtterance(pronunciar(texto, lang));
      const voz = mejorVozLocal(lang);
      if (voz) u.voice = voz;
      u.lang = lang === 'en' ? 'en-US' : 'es-419';
      u.rate = 1.0; u.pitch = 1.0;
      u.onend = u.onerror = terminar;
      const reloj = setInterval(() => {
        if (termino || !speechSynthesis.speaking) return clearInterval(reloj);
        nivelOrbe(0.3 + Math.random() * 0.5);
      }, 90);
      animoOrbe('hablando');
      speechSynthesis.speak(u);
      setTimeout(() => { if (!speechSynthesis.speaking) terminar(); }, 900);
      setTimeout(terminar, 4000 + texto.length * 95);
    } catch { terminar(); }
  }

  /**
   * Habla. Devuelve una promesa que se cumple al terminar (o al fallar:
   * el que espera para seguir el recorrido no se queda colgado jamás).
   */
  function hablar(texto, lang = 'es') {
    return new Promise(fin => {
      pararVoz();                       // corta lo anterior y sube el turno
      const mio = turnoVoz;             // el turno de ESTA frase
      const vigente = () => mio === turnoVoz;
      let acabo = false;
      const terminar = () => {
        if (acabo) return;
        acabo = true;
        if (alTerminarVoz === terminar) alTerminarVoz = null;
        // si ya la cortaron, el orbe es de la frase nueva: no tocarlo
        if (vigente()) { animoOrbe('dormida'); nivelOrbe(0); }
        fin();
      };
      alTerminarVoz = terminar;
      const k = claveVoz(texto, lang);
      if (!VOZ_MAPA[k]) return hablarConNavegador(texto, lang, terminar);
      // la voz de la casa: el fichero grabado
      const a = new Audio();
      sonando = a;
      a.src = VOZ_BASE + k + '.mp3';
      let arranco = false;
      a.onplaying = () => {
        arranco = true; animoOrbe('hablando');
        const reloj = setInterval(() => {
          if (a.paused || a.ended) return clearInterval(reloj);
          nivelOrbe(0.3 + Math.random() * 0.5);
        }, 90);
      };
      a.onended = () => { sonando = null; terminar(); };
      a.onerror = () => {
        sonando = null;
        if (!vigente()) return terminar();   // ya la cortaron: ni una palabra
        // el cerebro no contestó: la del navegador, sin drama
        arranco ? terminar() : hablarConNavegador(texto, lang, terminar);
      };
      // la red tambien sabe colgarse sin decir error: a los 5s sin sonar,
      // la frase pasa a la voz del navegador y nadie espera a un mudo
      setTimeout(() => {
        if (!vigente()) return;
        if (!arranco && sonando === a) {
          try { a.pause(); } catch {}
          sonando = null;
          hablarConNavegador(texto, lang, terminar);
        }
      }, 5000);
      /* pause() sobre un play() todavía en el aire RECHAZA la promesa
         (AbortError), así que cortar la voz caía justo aquí — y sin el turno
         esto arrancaba el sintetizador con la frase recién callada. */
      a.play().catch(() => {
        sonando = null;
        if (!vigente()) return terminar();
        hablarConNavegador(texto, lang, terminar);
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     EL OÍDO
     Web Speech donde el navegador lo dé (Chrome/Edge/Android sí, Safari a
     medias, Firefox no). Donde no, la caja de texto es el oído — y eso no es
     un plan B triste: es exactamente lo que la app hace con NEXUS cuando el
     micrófono no está.
     ════════════════════════════════════════════════════════════════════════ */
  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let oido = null;

  const puedeEscuchar = () => Boolean(Reconocedor);

  function escuchar(lang, alTexto, alFallar, alParcial) {
    if (!Reconocedor) return alFallar && alFallar('sin-microfono');
    try {
      pararVoz();                       // no se escucha a sí misma
      oido = new Reconocedor();
      oido.lang = lang === 'en' ? 'en-US' : 'es-419';
      /* Los resultados intermedios se piden y se ENSEÑAN: sin el eco de lo
         que va oyendo, la persona habla a un orbe mudo sin saber si la
         detecta — que es exactamente la queja que trajo este cambio. */
      oido.interimResults = true;
      oido.maxAlternatives = 1;
      animoOrbe('escuchando');
      oido.onresult = ev => {
        let final = '', parcial = '';
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) final += r[0].transcript;
          else parcial += r[0].transcript;
        }
        if (!final) { if (alParcial) alParcial(parcial); return; }
        animoOrbe('pensando');
        alTexto(final);
      };
      oido.onerror = ev => { animoOrbe('dormida'); if (alFallar) alFallar(ev.error || 'error'); };
      oido.onend = () => { if (orbe.animo === 'escuchando') animoOrbe('dormida'); };
      oido.start();
    } catch (e) { animoOrbe('dormida'); if (alFallar) alFallar('error'); }
  }
  function dejarDeEscuchar() { try { oido && oido.stop(); } catch {} }

  /** true justo despues de soltar un jalon: ese clic no cuenta. */
  const jalando = () => Date.now() < (red.jalonHasta || 0);

  return {
    montarRed, pararRed, latirHacia, jalando,
    gangliosVivos: () => red.ganglios,
    energia: v => { red.energiaMeta = v; },
    montarOrbe, animoOrbe, nivelOrbe,
    hablar, pararVoz,
    puedeEscuchar, escuchar, dejarDeEscuchar,
    reducido: REDUCIDO,
  };
})();
