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
    voz: 0, vozMeta: 0, // lo alto que está hablando AU-RA ahora mismo

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
    /* La voz sube rápido y baja despacio, como un vúmetro: si siguiera
       el audio muestra a muestra, la red parpadearía en vez de respirar.
       0.35 al subir para que la sílaba se sienta; 0.08 al bajar para que
       el silencio se apague en vez de cortarse. */
    red.voz += (red.vozMeta - red.voz) * (red.vozMeta > red.voz ? 0.35 : 0.08);

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
    /* LA VOZ SE VE. Mientras AU-RA habla, la red respira con ella:
       los hilos se encienden en las sílabas y se apagan en los
       silencios. No es un adorno suelto — es lo que hace que la voz
       y el cerebro parezcan la misma criatura y no dos cosas que
       pasan a la vez. El valor viene del audio DE VERDAD (ver VOZ),
       así que el ritmo es el de lo que está diciendo. */
    const V = red.voz;

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
        const a = (0.10 + cerca * 0.18 + (p.brillo + q.brillo) * 0.16) * p.z * E * (1 + V * 1.15);
        if (a < 0.012) continue;
        c.strokeStyle = `rgba(${p.tinte[0]},${p.tinte[1]},${p.tinte[2]},${a})`;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
      }
    }

    // neuronas
    for (let i = 0; i < red.n.length; i++) {
      const p = red.n[i];
      const lat = 0.72 + 0.28 * Math.sin(red.cuadro * 0.02 + p.fase);
      const a = (0.32 + p.brillo * 0.68) * p.z * lat * E * (1 + V * 0.75);
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
        c.strokeStyle = `rgba(201,169,97,${0.17 * E * (1 + V * 1.6)})`;
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
        /* LA ESFERA ES DE UN SOLO DEDO. Sin el filtro de pointerId, el pulgar
           que scrollea (o la palma que roza el borde) entraba a la MISMA
           pelea: dos manos tirando de una esfera la hacian saltar veinte
           pixeles por cuadro — el «se sacuden como locos» que se vio en
           produccion en Android. Se guarda el dedo del agarre y todo evento
           de otro dedo se ignora; un segundo down sobre la esfera agarrada
           tampoco arma otro par de oyentes. */
        if (g.dedo !== undefined) return;
        const dedo = ev.pointerId;
        g.dedo = dedo;
        const x0 = ev.clientX, y0 = ev.clientY, off0x = g.offX || 0, off0y = g.offY || 0;
        let jalo = false;
        const mover = e2 => {
          if (e2.pointerId !== dedo) return;
          const dx = e2.clientX - x0, dy = e2.clientY - y0;
          if (!jalo && dx * dx + dy * dy < 36) return;    // aun puede ser un clic
          jalo = true;
          g.agarrado = true;
          // la correa: hasta 90px de estiron; mas alla la esfera no sigue
          g.manoX = Math.max(-90, Math.min(90, off0x + dx));
          g.manoY = Math.max(-90, Math.min(90, off0y + dy));
        };
        const soltar = e3 => {
          if (e3 && e3.pointerId !== dedo) return;
          g.dedo = undefined;
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
  /* EL SOL DE LA GALAXIA ES AU-RA, Y SE LE NOTA CUANDO HABLA. El orbe de la
     esquina y el sol del Inicio son la MISMA voz: aquí se publica su ánimo y
     su nivel para que el cielo 3D los lea y el sol resplandezca con cada
     frase. Es un número en window, no un evento: el motor lo mira una vez por
     cuadro y nadie tiene que suscribirse a nada. */
  const animoOrbe = a => {
    orbe.animo = a;
    if (typeof window !== 'undefined') window.__AE_AURA_ANIMO = a;
  };
  const nivelOrbe = v => {
    orbe.nivel = Math.max(0, Math.min(1, v));
    if (typeof window !== 'undefined') window.__AE_AURA_VOZ = orbe.nivel;
  };

  /* ════════════════════════════════════════════════════════════════════════
     LA VOZ
     Primero la voz de la casa (el cerebro sirve audio de verdad, humano);
     si no llega o no está configurada, la del navegador con la mejor voz
     disponible del idioma. AU-RA jamás se queda muda por un fallo de red:
     bajar de calidad sí, callarse no.
     ════════════════════════════════════════════════════════════════════════ */
  /* LA VOZ GRABADA — y es LA MISMA voz que la de en vivo.
     Las frases fijas de AU-RA (la visita antes de entrar, la bienvenida, el
     recorrido) estan sintetizadas de antemano con NUESTRO motor del nodo
     —Chatterbox, registro calido, el mismo que contesta en vivo— y servidas
     como ficheros desde el nodo del cerebro. Antes eran de Piper, otra voz:
     quien pasaba de la visita a la sesion oia cambiar a la persona, y la
     queja fue textual — «tenemos voces cruzadas». Una asistente, una voz.

     El mapa de claves viaja INCRUSTADO aqui: sin fetch de manifiesto no hay
     CORS que configurar, y un <audio> cruza dominios sin pedir permiso.

     La clave es un FNV-1a de 32 bits de 'voz|texto', gemelo del de
     infra/aura/voz-grabada/sacar-frases.mjs: si el texto cambia UNA coma, la
     clave cambia, el fichero no aparece y la frase cae sola a la voz del
     navegador. A proposito: mejor la voz de siempre que un audio que dice
     otra cosa que el subtitulo. Al cambiar textos hay que re-grabar
     (sacar-frases.mjs → rendir-en-nodo.py, en infra/aura/voz-grabada/). */
  const VOZ_BASE = 'https://cerebro.ordenscan.com/voz/aura/';
  const VOZ_NOMBRE = { es: 'aura-calida-es', en: 'aura-calida-en' };
  const VOZ_MAPA = {
    '034e03a7': 1,
    '046f9e10': 1,
    '069fbfd3': 1,
    '0706218d': 1,
    '078ee623': 1,
    '08f1e09c': 1,
    '095ecf45': 1,
    '0a02b786': 1,
    '0a55c10b': 1,
    '0ac3481b': 1,
    '0b0263f0': 1,
    '0c0a9720': 1,
    '0d2d74ef': 1,
    '0e1cb559': 1,
    '0e3a348d': 1,
    '0eeb36e6': 1,
    '105b1cc2': 1,
    '11d644c0': 1,
    '125051c2': 1,
    '141fca57': 1,
    '152e7bfa': 1,
    '16cc557e': 1,
    '16e81ee3': 1,
    '183cf53f': 1,
    '19053c0b': 1,
    '195fdb3f': 1,
    '19a18ed4': 1,
    '19d623f9': 1,
    '1a19df66': 1,
    '1a54a94e': 1,
    '1c94b03c': 1,
    '1cd7db4e': 1,
    '2514564a': 1,
    '2564b5c6': 1,
    '27401a4c': 1,
    '27ed1d65': 1,
    '2aa8cf98': 1,
    '2ae6ecee': 1,
    '2ba2731f': 1,
    '2c2035e3': 1,
    '2c55c86e': 1,
    '2da53674': 1,
    '2de2589b': 1,
    '2eec883f': 1,
    '32841bbd': 1,
    '335d65d9': 1,
    '35e8c576': 1,
    '362ef7b4': 1,
    '3683e0b4': 1,
    '38cd46d0': 1,
    '391d0010': 1,
    '3938d660': 1,
    '39c14ea1': 1,
    '3a1e2e70': 1,
    '3b8021ca': 1,
    '3c1df1b0': 1,
    '4027621b': 1,
    '418e30f1': 1,
    '433eef19': 1,
    '44588b9e': 1,
    '4497d570': 1,
    '464234b9': 1,
    '472ae64b': 1,
    '4885f68a': 1,
    '491690d4': 1,
    '492af218': 1,
    '493e0f59': 1,
    '4994901b': 1,
    '49f31e2a': 1,
    '4ab73989': 1,
    '4bc29801': 1,
    '4bd2048b': 1,
    '4c0edccb': 1,
    '4c1dac82': 1,
    '4c68a276': 1,
    '4dcd03a8': 1,
    '4e03f2d0': 1,
    '4eb3aa20': 1,
    '4f1cab62': 1,
    '4f623a15': 1,
    '508c2680': 1,
    '509cd67a': 1,
    '50bfb101': 1,
    '5255a343': 1,
    '532c28a8': 1,
    '55a6a200': 1,
    '566a68d1': 1,
    '56a80c3c': 1,
    '5973ddfd': 1,
    '597a11f0': 1,
    '59b5011a': 1,
    '5a32921a': 1,
    '5a4451e7': 1,
    '5b49b8ca': 1,
    '5d96bff9': 1,
    '5dd3e406': 1,
    '5eb2c1f5': 1,
    '5f537dbb': 1,
    '611a56a3': 1,
    '6169664b': 1,
    '61d6ff9f': 1,
    '62701e30': 1,
    '63707ae8': 1,
    '63f60fb5': 1,
    '657177ad': 1,
    '69d97ff3': 1,
    '6db7f19f': 1,
    '6e5526a9': 1,
    '712f9faa': 1,
    '748ddb94': 1,
    '74c6be84': 1,
    '74f8f885': 1,
    '758dc230': 1,
    '768431c2': 1,
    '76c65ca3': 1,
    '76defda0': 1,
    '76ebc236': 1,
    '775381d2': 1,
    '77584881': 1,
    '77666c49': 1,
    '77bb101b': 1,
    '7bd09f05': 1,
    '7d4bb4ae': 1,
    '8106f9b0': 1,
    '810f385d': 1,
    '814ca7c4': 1,
    '815fb7c1': 1,
    '82f347ef': 1,
    '8408eb4c': 1,
    '843a1b8a': 1,
    '84ecac47': 1,
    '85786ce6': 1,
    '858e3abe': 1,
    '86bfe9cf': 1,
    '86eda207': 1,
    '87454bb5': 1,
    '88927ae7': 1,
    '893933b8': 1,
    '8b64ab0a': 1,
    '8b66b494': 1,
    '8c8760bc': 1,
    '8ca9dadd': 1,
    '8e8b1e66': 1,
    '8fcb9f8f': 1,
    '929a019a': 1,
    '95018dab': 1,
    '95253c1f': 1,
    '95599d56': 1,
    '95c4d70d': 1,
    '962a6141': 1,
    '96f56496': 1,
    '9734ec12': 1,
    '97a19db7': 1,
    '97ea2671': 1,
    '98e1545a': 1,
    '996f4513': 1,
    '999e5cfc': 1,
    '9a9c52c0': 1,
    '9b5c2d8e': 1,
    '9d5f7b84': 1,
    '9f1dc37f': 1,
    '9f4411da': 1,
    '9f58b8fb': 1,
    'a048af18': 1,
    'a1653d19': 1,
    'a4423e45': 1,
    'a596ed36': 1,
    'a5eaeaef': 1,
    'a6d66366': 1,
    'a74e908d': 1,
    'a98323ad': 1,
    'aec8ed9b': 1,
    'af106fec': 1,
    'af9d9aa5': 1,
    'b120063d': 1,
    'b3bb441c': 1,
    'b419bd6c': 1,
    'b4618e4c': 1,
    'b69a9acd': 1,
    'b6f8a43b': 1,
    'b7d0ab38': 1,
    'b7dc6f60': 1,
    'b9284ff6': 1,
    'bad95410': 1,
    'bb795171': 1,
    'bc032b17': 1,
    'be68f8a0': 1,
    'beaf762d': 1,
    'bed9c0e7': 1,
    'c359ee87': 1,
    'c507a67c': 1,
    'c73f8c02': 1,
    'c7a404ac': 1,
    'c7c5c9e3': 1,
    'c88fe6ed': 1,
    'c9c873e4': 1,
    'c9ea205f': 1,
    'cd0a7a85': 1,
    'cd72a127': 1,
    'd0177f8f': 1,
    'd1e40c87': 1,
    'd22cd6a6': 1,
    'd2dd34fe': 1,
    'd38bf63a': 1,
    'd3d7d3d0': 1,
    'd4dead4f': 1,
    'd6c57a6c': 1,
    'd87d4965': 1,
    'dafd14d4': 1,
    'dbd21ae0': 1,
    'dc2713cd': 1,
    'dd0da545': 1,
    'dd123c85': 1,
    'de51452e': 1,
    'df5bb349': 1,
    'dff4b91e': 1,
    'e06621d4': 1,
    'e0ddfe77': 1,
    'e19e70f3': 1,
    'e3ffd9ce': 1,
    'e42317d4': 1,
    'e4d26449': 1,
    'e671b0ef': 1,
    'e8b712c2': 1,
    'eb93039c': 1,
    'ed7fe90d': 1,
    'ef164b3e': 1,
    'f00624e2': 1,
    'f0111888': 1,
    'f0845b93': 1,
    'f0d0b231': 1,
    'f1617a30': 1,
    'f277827a': 1,
    'f4192c63': 1,
    'f45aff00': 1,
    'f4839e68': 1,
    'f5cb1c8c': 1,
    'f610fe34': 1,
    'f67b46ee': 1,
    'f67ba294': 1,
    'f7755ffb': 1,
    'f7e446e8': 1,
    'f8d8365f': 1,
    'f8deab2b': 1,
    'f8ec1fea': 1,
    'fab6fc05': 1,
    'faf5b06f': 1,
    'fd675a45': 1,
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

  /* ════════════════════════════════════════════════════════════════════
     EL VÚMETRO DE VERDAD

     Hasta ahora el orbe «ondulaba al ritmo» con Math.random() cada 90ms: se
     movía, sí, pero no al ritmo de nada. Ahora se lee el audio REAL con un
     AnalyserNode, y ese mismo número mueve también las neuronas del Núcleo:
     cuando AU-RA habla, el cerebro entero late con sus sílabas y se apaga en
     sus silencios. Eso es lo que hace que la voz y el cerebro parezcan la
     misma criatura.

     Dos cosas lo hacen posible y ninguna es gratis:

     · El <audio> se REUTILIZA. createMediaElementSource solo puede llamarse
       una vez por elemento, así que un <audio> nuevo por frase iría dejando
       nodos colgados hasta que el navegador se rinda.
     · El servidor de la voz manda Access-Control-Allow-Origin (se le puso a
       Caddy en /voz/*). Sin esa cabecera el navegador entrega el sonido pero
       PROHÍBE leer sus muestras, y el analizador devolvería silencio para
       siempre — audio que suena y vúmetro plano.

     Si algo de esto falla —navegador viejo, permiso denegado, el contexto que
     no arranca— se vuelve al movimiento simulado. Que el vúmetro no funcione
     jamás puede dejar a AU-RA muda. */
  let elAudio = null, ctxAudio = null, analizador = null, muestras = null, relojNivel = 0;

  function audioDeLaCasa() {
    if (elAudio) return elAudio;
    elAudio = new Audio();
    elAudio.crossOrigin = 'anonymous';   // ANTES de cualquier src: si no, no sirve
    elAudio.preload = 'auto';
    return elAudio;
  }

  function engancharAnalizador() {
    if (analizador) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctxAudio = new AC();
      const fuente = ctxAudio.createMediaElementSource(audioDeLaCasa());
      analizador = ctxAudio.createAnalyser();
      analizador.fftSize = 256;
      analizador.smoothingTimeConstant = 0.6;
      muestras = new Uint8Array(analizador.fftSize);
      fuente.connect(analizador);
      // y del analizador a los altavoces: sin esto se analiza el silencio
      analizador.connect(ctxAudio.destination);
      return true;
    } catch {
      analizador = null;
      return false;
    }
  }

  /* El nivel: la desviación de la onda respecto al centro (RMS). Se mira la
     forma de onda y no el espectro porque lo que se quiere es «cuánto suena»,
     no «de qué color suena». */
  function nivelReal() {
    if (!analizador) return 0;
    analizador.getByteTimeDomainData(muestras);
    let suma = 0;
    for (let i = 0; i < muestras.length; i++) {
      const v = (muestras[i] - 128) / 128;
      suma += v * v;
    }
    const rms = Math.sqrt(suma / muestras.length);
    // la voz vive en una franja estrecha: se estira para que se note
    return Math.min(1, rms * 3.6);
  }

  function mirarNivel(deVerdad) {
    clearInterval(relojNivel);
    relojNivel = setInterval(() => {
      const n = deVerdad && analizador ? nivelReal()
        // sin analizador, una onda mansa: no finge precisión que no tiene
        : 0.34 + Math.sin(Date.now() / 110) * 0.16 + Math.random() * 0.12;
      nivelOrbe(n);
      red.vozMeta = n;
    }, 60);
  }

  function soltarNivel() {
    clearInterval(relojNivel);
    relojNivel = 0;
    nivelOrbe(0);
    red.vozMeta = 0;
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
    soltarNivel();
    animoOrbe('dormida');
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
     «AU-RA» sale deletreado, «AuCorp» masticado y «Ordenexchange» de
     corrido. Este mapa es SOLO para la boca — el texto en pantalla y la
     clave del audio grabado siguen siendo los originales. El gemelo de este
     mapa vive en el guion de grabacion (sacar-frases-aura.mjs): si cambia
     uno, cambia el otro. */
  const DICCION = {
    es: [
      [/AU-RA/g, 'Aura'], [/AuCorp/gi, 'Au Corp'], [/Ordenexchange/g, 'Orden Exchéinch'],
      [/PULSE2CHAT/g, 'Puls Chat'], [/MyTokenPay/g, 'Mai Token Péi'],
      [/Veta Wallet/g, 'Veta Wálet'], [/ordenscan/g, 'orden scan'],
      [/Genesis ID/g, 'Génesis Aidí'], [/Layer 1/g, 'Léyer Uan'],
      [/Hyperledger Besu/g, 'Jaiper Ledyer Besu'], [/QBFT/g, 'Cu Be Efe Te'],
    ],
    en: [
      [/AU-RA/g, 'Aura'], [/AuCorp/gi, 'Au Corp'], [/Ordenexchange/g, 'Orden Exchange'],
      /* ORIGEN es un nombre español y se dice en español, también cuando el
         resto de la frase va en inglés: «oh-REE-hen». «Oreehen» hacía que la
         voz inglesa arrancara con «or-», que es justo lo que no es. Se separa
         en sílabas para que el acento caiga donde tiene que caer. */
      [/ORIGEN/g, 'oh REE hen'],
      [/PULSE2CHAT/g, 'Pulse2Chat'], [/MyTokenPay/g, 'My Token Pay'],
      [/Genesis ID/g, 'Genesis I D'], [/Layer 1/g, 'Layer One'],
      [/Hyperledger Besu/g, 'Hyperledger Bessoo'], [/QBFT/g, 'Q B F T'],
      [/ORDENSCAN/g, 'Orden Scan'], [/ordenscan/g, 'Orden Scan'],
      [/Orden Global/g, 'Orden Global'],
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
      soltarNivel();
      animoOrbe('dormida');
      if (alTerminar) alTerminar();
    };
    try {
      const u = new SpeechSynthesisUtterance(pronunciar(texto, lang));
      const voz = mejorVozLocal(lang);
      if (voz) u.voice = voz;
      u.lang = lang === 'en' ? 'en-US' : 'es-419';
      u.rate = 1.0; u.pitch = 1.0;
      u.onend = u.onerror = terminar;
      /* La voz del sintetizador no es un elemento que se pueda analizar: no
         hay muestras que leer por ningún lado. Ahí el vúmetro es simulado, y
         se dice — pero mueve la red igual, para que el Núcleo respire también
         cuando la frase no tiene grabación propia. */
      mirarNivel(false);
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
    /* LA MÚSICA SE AGACHA CUANDO ALGUIEN HABLA. Aquí y no en cada sitio que
       llama a hablar: una sola puerta para la voz es una sola puerta para el
       agache, y ningún camino nuevo se olvida de bajarle. El tiempo se estima
       por el largo de la frase; si termina antes, terminar() la levanta. */
    /* AU-RA NO AGACHA LA MÚSICA. Se le hacía sitio como si fuera a hablar en
       voz alta —hasta seis segundos con un mensaje largo— y AU-RA no tiene
       voz: es texto en pantalla. No competía con nada, así que lo único que
       lograba era que la música se fuera y volviera cada vez que AU-RA decía
       algo, que es exactamente el fallo de «la música a veces se silencia».
       El día que AU-RA hable de verdad, esta línea vuelve. */
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
        // terminó de hablar: la música puede volver a su sitio
        /* ídem: sin voz, no hay a qué hacerle sitio. */
        fin();
      };
      alTerminarVoz = terminar;
      const k = claveVoz(texto, lang);
      if (!VOZ_MAPA[k]) return hablarConNavegador(texto, lang, terminar);
      // la voz de la casa: el fichero grabado. UN solo elemento para todas
      // las frases — ver el vúmetro, arriba: uno nuevo por frase dejaría un
      // nodo de audio colgado cada vez.
      const a = audioDeLaCasa();
      const hayAnalizador = engancharAnalizador();
      // el contexto arranca dormido hasta que hay un gesto; el saludo llega
      // detrás de un toque en el orbe, así que aquí ya se puede despertar
      if (ctxAudio && ctxAudio.state === 'suspended') ctxAudio.resume().catch(() => {});
      sonando = a;
      try { a.pause(); a.currentTime = 0; } catch {}
      a.src = VOZ_BASE + k + '.mp3';
      let arranco = false;
      a.onplaying = () => {
        arranco = true; animoOrbe('hablando');
        mirarNivel(hayAnalizador);
      };
      a.onended = () => { sonando = null; soltarNivel(); terminar(); };
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
    /* ¿Esta frase exacta está grabada con nuestra voz? Lo pregunta la puerta
       única de app.js para elegir camino: si está, suena el fichero —al
       instante, sin GPU y sin red—; si no está, va a la voz en vivo, que
       también es nuestra. Sin esto, «no está grabada» significaba «que la
       diga el navegador», y ahí es donde salía la voz robótica vieja en
       medio de una conversación con la nuestra. */
    tieneGrabada: (texto, lang = 'es') => !!VOZ_MAPA[claveVoz(texto, lang)],
    puedeEscuchar, escuchar, dejarDeEscuchar,
    reducido: REDUCIDO,
  };
})();
