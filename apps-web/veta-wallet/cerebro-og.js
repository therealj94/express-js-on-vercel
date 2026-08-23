/* GENESIS CORE · el cerebro del ecosistema, en tres dimensiones.
 *
 * ══ DE DÓNDE SALE ══════════════════════════════════════════════════════════
 *
 * De la sala de Genesis ID: el mismo volumen con lóbulos, fisura, cerebelo y
 * tronco que se proyecta en las reuniones. No es una nube de puntos bonita —
 * eso ya lo teníamos y no era un cerebro—: es un contorno que se reconoce
 * antes de que nadie lo explique. Aquí vive con los ocho temas de la casa
 * colgados de sus regiones.
 *
 * ══ POR QUÉ UN CANVAS Y NO TRES DIMENSIONES DE VERDAD ══════════════════════
 *
 * Porque el cielo 3D ya se apagó cuando se entra aquí (una escena a la vez) y
 * porque esto tiene que abrir en un teléfono de gama baja sin pedirle un
 * contexto WebGL más. La proyección está hecha a mano: son cuatro senos y un
 * coseno por punto.
 *
 * ══ LOS BOTONES SIGUEN SIENDO DEL DOM ══════════════════════════════════════
 *
 * El canvas dibuja el tejido; los ocho temas son botones .nu-mundo de verdad
 * que este motor COLOCA en cada cuadro sobre la posición proyectada de su
 * ganglio. Así el toque, el teclado, el lector de pantalla y la mirada de AIR
 * TOUCH siguen funcionando sin que este archivo sepa nada de ellos.
 *
 * ══ SEMILLA FIJA ═══════════════════════════════════════════════════════════
 *
 * El azar va con semilla: un cerebro que sale distinto en cada carga no es un
 * lugar, es ruido. Lo que se aprueba una vez es lo que se ve siempre.
 */
const CEREBRO_OG = (() => {
  'use strict';

  const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── el azar con semilla ───────────────────────────────────────────────────
  function sembrar(s) {
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ══ EL VOLUMEN ═════════════════════════════════════════════════════════
     Ejes: x izquierda-derecha · y arriba(−)/abajo(+) · z frente(+)/nuca(−).
     Los dos hemisferios afinados en las puntas (sin eso es un huevo), la
     fisura longitudinal que lo delata como cerebro, el cerebelo atrás abajo
     y el tronco que baja. */
  const CENTRO_Y = -6;

  function dentro(x, y, z) {
    const t = z / 122;
    if (t > -1 && t < 1) {
      const afina = Math.sqrt(Math.max(0, 1 - t * t * 0.58));
      const rx = 94 * afina;
      const ry = (y < CENTRO_Y ? 78 : 54) * afina;
      const yy = (y - CENTRO_Y) / ry;
      if ((x / rx) ** 2 + yy * yy <= 1) {
        if (Math.abs(x) < 6.5 && y < CENTRO_Y - 14 && z > -96) return false;
        return true;
      }
    }
    if ((x / 60) ** 2 + ((y - 50) / 30) ** 2 + ((z + 100) / 42) ** 2 <= 1) return true;
    if ((x / 17) ** 2 + ((y - 74) / 48) ** 2 + ((z + 46) / 21) ** 2 <= 1) return true;
    return false;
  }

  /* Empuja un punto hacia adentro: una región puesta un poco afuera dispara
     sus puntos al vacío y el contorno se deshilacha justo donde más se nota. */
  function meter(x, y, z) {
    for (let k = 0; k < 26; k++) {
      if (dentro(x, y, z)) return [x, y, z];
      x *= 0.94; y = CENTRO_Y + (y - CENTRO_Y) * 0.94; z *= 0.94;
    }
    return [0, CENTRO_Y, 0];
  }

  let motor = null;

  /* Arranca el cerebro sobre un canvas, con sus temas.
     temas: [{ id, centro:[x,y,z], tinte:'#rrggbb', el }] */
  function montar(canvas, temas, opciones = {}) {
    apagar();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rnd = sembrar(5550);

    /* CUÁNTO SE DIBUJA. En un teléfono es menos tejido y no por prudencia:
       son los mismos píxeles repartidos en una décima parte de superficie —
       a densidad de escritorio la malla se ve como una mancha y se pierde
       justo el dibujo de la red. Manda el lado corto. */
    const estrecho = Math.min(innerWidth, innerHeight) < 620;
    const CUANTO = estrecho
      ? { relleno: 760, porTema: 34, vecinos: 2, senales: 46 }
      : { relleno: 1600, porTema: 58, vecinos: 3, senales: 96 };

    // ── el tejido ───────────────────────────────────────────────────────────
    const puntos = [];
    const cercaDe = (x, y, z) => {
      let mejor = temas[0], dm = Infinity;
      for (const t of temas) {
        const d = (x - t.centro[0]) ** 2 + (y - t.centro[1]) ** 2 + (z - t.centro[2]) ** 2;
        if (d < dm) { dm = d; mejor = t; }
      }
      return mejor;
    };
    for (let i = 0; i < CUANTO.relleno; i++) {
      let x = 0, y = CENTRO_Y, z = 0;
      for (let k = 0; k < 400; k++) {
        const px = (rnd() * 2 - 1) * 96;
        const py = CENTRO_Y + (rnd() * 2 - 1) * 88;
        const pz = (rnd() * 2 - 1) * 124;
        if (dentro(px, py, pz)) { x = px; y = py; z = pz; break; }
      }
      puntos.push({ x, y, z, t: cercaDe(x, y, z) });
    }
    // el espesor: tejido colgado de cada tema, para que se note dónde hay algo
    for (const t of temas) {
      for (let i = 0; i < CUANTO.porTema; i++) {
        const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1);
        const R = 6 + Math.cbrt(rnd()) * 30;
        const [x, y, z] = meter(
          t.centro[0] + R * Math.sin(b) * Math.cos(a),
          t.centro[1] + R * Math.sin(b) * Math.sin(a),
          t.centro[2] + R * Math.cos(b));
        puntos.push({ x, y, z, t });
      }
    }

    // ── los hilos: cada punto con sus vecinos más cercanos ─────────────────
    const hilos = [];
    {
      const vistas = new Set();
      for (let i = 0; i < puntos.length; i++) {
        const p = puntos[i];
        const cerca = [];
        for (let j = 0; j < puntos.length; j++) {
          if (i === j || puntos[j].t !== p.t) continue;
          const q = puntos[j];
          cerca.push([(p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2, j]);
        }
        cerca.sort((a, b) => a[0] - b[0]);
        for (let k = 0; k < CUANTO.vecinos && k < cerca.length; k++) {
          const j = cerca[k][1];
          const llave = i < j ? `${i}:${j}` : `${j}:${i}`;
          if (vistas.has(llave)) continue;
          vistas.add(llave);
          hilos.push([i, j]);
        }
      }
    }

    /* ── los axones: los temas conversando entre sí ────────────────────────
       Es la parte que dice lo que este cerebro quiere decir: las casas del
       ecosistema no son islas, se hablan. */
    const axones = [];
    for (let i = 0; i < temas.length; i++) {
      for (let k = 1; k <= 2; k++) {
        const j = (i + k) % temas.length;
        axones.push({ a: temas[i], b: temas[j] });
      }
    }
    const senales = [];
    for (let i = 0; i < (QUIETO ? 0 : CUANTO.senales); i++) {
      senales.push({ ax: axones[Math.floor(rnd() * axones.length)], t: rnd(),
                     v: 0.0016 + rnd() * 0.0032 });
    }

    /* LA REGIÓN ELEGIDA. Tocar un tema no solo abre su hoja: ENCIENDE su
       parte del cerebro y apaga el resto. Es la respuesta a «¿de dónde sale
       esto?» sin una palabra: se ve exactamente qué trozo del ecosistema está
       hablando. */
    let elegido = null;
    let luz = 0;               // cuánto se nota la diferencia, amortiguado

    // ── la cámara de mano ──────────────────────────────────────────────────
    /* zoom es el que se ve; gZoom es a donde va. Separados para que acercar
       sea un MOVIMIENTO y no un salto: es la diferencia entre un cerebro que
       se acerca y una imagen que cambia de tamano. */
    const cam = { giro: 0.5, alto: -0.16, gGiro: 0.5, gAlto: -0.16, zoom: 1, gZoom: 1 };
    let dpr = 1, ancho = 0, alto = 0, escala = 1;

    function medir() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      ancho = Math.max(1, Math.round(r.width));
      alto = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
      // el cerebro mide ~190 de ancho y ~180 de alto: entra entero, con aire
      /* Que quepa ENTERO: en un teléfono de pie el cerebro es más ancho que
         la pantalla, y un cerebro cortado por los lados deja de ser un
         cerebro. Manda el lado que escasea. */
      escala = Math.min(ancho / 205, alto / 210) * (estrecho ? 0.96 : 1.16);
    }

    /* La proyección: giro sobre el eje vertical, inclinación, y perspectiva
       suave. El mismo par de fórmulas para el tejido y para los ganglios, que
       es lo que hace que el botón caiga EXACTAMENTE sobre su punto. */
    function proyectar(p) {
      const cg = Math.cos(cam.giro), sg = Math.sin(cam.giro);
      const ca = Math.cos(cam.alto), sa = Math.sin(cam.alto);
      const x1 = p.x * cg - p.z * sg;
      const z1 = p.x * sg + p.z * cg;
      const y2 = p.y * ca - z1 * sa;
      const z2 = p.y * sa + z1 * ca;
      const k = 420 / (420 + z2);
      return {
        x: ancho / 2 + x1 * escala * k * cam.zoom,
        y: alto / 2 + (y2 - CENTRO_Y) * escala * k * cam.zoom,
        z: z2,
        k,
      };
    }

    // ── el dibujo ──────────────────────────────────────────────────────────
    let raf = 0, vivo = true;
    const proy = new Array(puntos.length);

    function cuadro() {
      if (!vivo) return;
      raf = requestAnimationFrame(cuadro);
      // giro suave hacia donde pide la mano, y una deriva propia si nadie toca
      if (!arrastrando && !QUIETO) cam.gGiro += 0.0016;
      cam.giro += (cam.gGiro - cam.giro) * 0.12;
      cam.alto += (cam.gAlto - cam.alto) * 0.12;
      cam.zoom += (cam.gZoom - cam.zoom) * 0.14;

      const g = ctx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, ancho, alto);

      for (let i = 0; i < puntos.length; i++) proy[i] = proyectar(puntos[i]);

      luz += ((elegido ? 1 : 0) - luz) * 0.1;

      /* Cuánto brilla un punto según a quién pertenece: lo elegido sube, lo
         demás se retira. Sin nadie elegido, todos por igual. */
      const peso = (t) => (luz < 0.02 ? 1 : t === elegido ? 1 + luz * 0.9 : 1 - luz * 0.72);

      // los hilos primero: son el tejido, van detrás de todo
      g.lineWidth = 0.7;
      for (const [i, j] of hilos) {
        const a = proy[i], b = proy[j];
        const prof = (a.z + b.z) / 2;
        /* El tejido tiene que LEERSE: es la forma del cerebro, no un fondo.
           Lo de adelante casi opaco, lo de atrás apenas insinuado — esa
           diferencia es toda la hondura. */
        const alfa = (0.16 + 0.34 * (1 - Math.min(1, (prof + 130) / 260))) * peso(puntos[i].t);
        g.strokeStyle = puntos[i].t.tinte + Math.round(alfa * 255).toString(16).padStart(2, '0');
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      // los puntos del tejido
      for (let i = 0; i < puntos.length; i++) {
        const p = proy[i];
        const alfa = (0.3 + 0.7 * (1 - Math.min(1, (p.z + 130) / 260))) * peso(puntos[i].t);
        g.fillStyle = puntos[i].t.tinte + Math.round(alfa * 255).toString(16).padStart(2, '0');
        // el tejido responde al zoom: de cerca los puntos crecen y los hilos
        // se leen mejor, que es lo que hace que acercarse SIRVA para algo
        const lado = 1.9 * p.k * (0.85 + cam.zoom * 0.35);
        g.fillRect(p.x, p.y, lado, lado);
      }
      // los axones entre temas, con su señal viajando
      for (const ax of axones) {
        const a = proyectar({ x: ax.a.centro[0], y: ax.a.centro[1], z: ax.a.centro[2] });
        const b = proyectar({ x: ax.b.centro[0], y: ax.b.centro[1], z: ax.b.centro[2] });
        g.strokeStyle = 'rgba(201,169,97,.16)';
        g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      for (const s of senales) {
        s.t += s.v;
        if (s.t > 1) s.t = 0;
        const a = proyectar({ x: s.ax.a.centro[0], y: s.ax.a.centro[1], z: s.ax.a.centro[2] });
        const b = proyectar({ x: s.ax.b.centro[0], y: s.ax.b.centro[1], z: s.ax.b.centro[2] });
        const x = a.x + (b.x - a.x) * s.t, y = a.y + (b.y - a.y) * s.t;
        g.fillStyle = 'rgba(234,215,156,.75)';
        g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill();
      }

      /* LOS GANGLIOS. El canvas pinta su halo y el DOM pone el botón encima,
         en el mismo punto y en el mismo cuadro: por eso lo que se ve y lo que
         se toca no se separan nunca. */
      for (const t of temas) {
        const p = proyectar({ x: t.centro[0], y: t.centro[1], z: t.centro[2] });
        const late = t === elegido ? 1 + Math.sin(performance.now() / 420) * 0.09 : 1;
        const r = 26 * p.k * cam.zoom * (t === elegido ? 1.5 * late : 1);
        const halo = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        halo.addColorStop(0, t.tinte + (t === elegido ? '99' : '55'));
        halo.addColorStop(1, t.tinte + '00');
        g.fillStyle = halo;
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
        if (t.el) {
          t.el.style.left = p.x + 'px';
          t.el.style.top = p.y + 'px';
          /* Lo de atrás se ve más chico y más apagado: es lo que convence al
             ojo de que hay hondura de verdad. */
          const cerca = Math.min(1, Math.max(0, (p.z + 130) / 260));
          t.el.style.setProperty('--k', (0.72 + 0.42 * (1 - cerca)).toFixed(3));
          t.el.style.setProperty('--z', (1 - cerca).toFixed(3));
          t.el.classList.toggle('gc-elegido', t === elegido);
          t.el.style.zIndex = String(4 + Math.round((1 - cerca) * 8));
        }
      }
    }

    // ── la mano ────────────────────────────────────────────────────────────
    let arrastrando = false, px = 0, py = 0, dedo = undefined;
    /* Los dedos vivos: con dos, el gesto deja de ser girar y pasa a ser
       ACERCAR. Es el pellizco de cualquier mapa; nadie tiene que aprenderlo. */
    const dedos = new Map();
    let pinza = 0;
    const abajo = (e) => {
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dedos.size === 2) {
        const [a, b] = [...dedos.values()];
        pinza = Math.hypot(a.x - b.x, a.y - b.y);
        arrastrando = false; dedo = undefined;   // dos dedos: manda el pellizco
        return;
      }
      if (dedo !== undefined) return;      // un solo dedo manda: dos pelean
      dedo = e.pointerId;
      arrastrando = true; px = e.clientX; py = e.clientY;
      /* La captura REVIENTA con un puntero sintético: AIR TOUCH manda un id
         que el navegador no conoce. Aquí no rompía el giro —el estado ya
         estaba puesto— pero dejaba una excepción suelta en cada pellizco. */
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* puntero de aire */ }
    };
    const mueve = (e) => {
      if (dedos.has(e.pointerId)) dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dedos.size === 2) {
        const [a, b] = [...dedos.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        // dedos que se separan (d > pinza) = acercar = factor < 1
        if (pinza > 0 && d > 0) motor?.zoom(pinza / d);
        pinza = d;
        e.preventDefault();
        return;
      }
      if (!arrastrando || e.pointerId !== dedo) return;
      cam.gGiro += (e.clientX - px) * 0.006;
      cam.gAlto = Math.max(-0.9, Math.min(0.9, cam.gAlto + (e.clientY - py) * 0.004));
      px = e.clientX; py = e.clientY;
      e.preventDefault();
    };
    const suelta = (e) => {
      dedos.delete(e.pointerId);
      if (dedos.size < 2) pinza = 0;
      if (e.pointerId !== dedo) return;
      arrastrando = false; dedo = undefined;
    };
    const rueda = (e) => {
      // rueda arriba (deltaY < 0) = acercar = factor < 1
      motor?.zoom(Math.exp(e.deltaY * 0.0012));
      e.preventDefault();
    };
    canvas.addEventListener('pointerdown', abajo);
    canvas.addEventListener('pointermove', mueve);
    canvas.addEventListener('pointerup', suelta);
    canvas.addEventListener('pointercancel', suelta);
    canvas.addEventListener('wheel', rueda, { passive: false });

    const alRedimensionar = () => medir();
    addEventListener('resize', alRedimensionar);

    medir();
    cuadro();

    motor = {
      apagar() {
        vivo = false;
        cancelAnimationFrame(raf);
        canvas.removeEventListener('pointerdown', abajo);
        canvas.removeEventListener('pointermove', mueve);
        canvas.removeEventListener('pointerup', suelta);
        canvas.removeEventListener('pointercancel', suelta);
        canvas.removeEventListener('wheel', rueda);
        removeEventListener('resize', alRedimensionar);
      },
      /* El mando de afuera: los botones de girar y el zoom de la casa. */
      girar(dx, dy) {
        cam.gGiro += dx * 0.006;
        cam.gAlto = Math.max(-0.9, Math.min(0.9, cam.gAlto + dy * 0.004));
      },
      /* EL MISMO CONTRATO QUE LA GALAXIA: factor > 1 ALEJA, < 1 acerca. Es el
         lenguaje del pellizco (los dedos que se juntan alejan) y el que ya
         habla la casa; tenerlo al revés aquí hacía que la mano abierta
         alejara cuando se acercaba. */
      zoom(f) { cam.gZoom = Math.max(0.55, Math.min(3.4, cam.gZoom / (f || 1))); },
      acercar() { motor.zoom(0.82); },
      alejar() { motor.zoom(1 / 0.82); },
      centrar() { cam.gGiro = 0.5; cam.gAlto = -0.16; cam.gZoom = 1; },
      recentrar() { motor.centrar(); },
      /* Encender una región (o apagar todas con null). */
      elegir(id) { elegido = temas.find((t) => t.id === id) || null; },
      elegida: () => elegido?.id || null,
      estado: () => ({ zoom: cam.gZoom }),
    };
    if (opciones.alMontar) opciones.alMontar(motor);
    return motor;
  }

  function apagar() {
    motor?.apagar();
    motor = null;
  }

  const vivo = () => !!motor;

  return { montar, apagar, vivo, mando: () => motor };
})();

if (typeof window !== 'undefined') window.CEREBRO_OG = CEREBRO_OG;
