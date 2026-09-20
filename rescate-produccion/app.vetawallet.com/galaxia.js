/* La galaxia de la entrada.
 *
 * Un solo canvas detrás de la puerta de la casa: estrellas en tres
 * profundidades que derivan despacio, una nebulosa de oro y azul que respira,
 * y el HIPERSALTO — al entrar, las estrellas se estiran en trazos y la
 * pantalla viaja hasta el Núcleo, que es la otra galaxia (su constelación de
 * esferas). El verde del pozo se queda para adentro de la casa; la puerta es
 * espacio abierto.
 *
 * POR QUÉ ASÍ Y NO DE OTRA MANERA
 *
 *  · Sin librerías, como todo el resto: un canvas 2D y matemática de
 *    secundaria. Three.js para esto sería pagar un camión para llevar una
 *    carta.
 *  · La nebulosa NO se pinta con gradientes por cuadro: se pinta UNA vez en
 *    un canvas aparte y cada cuadro solo se estampa girada. Los gradientes
 *    radiales por cuadro eran el 80% del costo en el primer borrador.
 *  · `prefers-reduced-motion` apaga el movimiento entero: se pinta un cielo
 *    quieto (una vez) y el salto se salta. La promesa de accesibilidad no es
 *    negociable por bonita que sea la animación.
 *  · El bucle se detiene solo cuando la pestaña se esconde o cuando la capa
 *    ya no está a la vista: una galaxia girando debajo de la app sería
 *    batería quemada en nada.
 */
const GALAXIA = (() => {
  'use strict';

  const QUIETO = matchMedia('(prefers-reduced-motion: reduce)');
  /* El teléfono se trata distinto A PROPÓSITO: menos píxeles (dpr 1.25),
     menos estrellas y 30 cuadros por segundo. En una GPU de bolsillo el cielo
     a 60fps con blur encima es exactamente el «se traba» del login; a 30fps
     un cielo que deriva despacio se ve igual y cuesta la mitad. */
  const BOLSILLO = matchMedia('(pointer: coarse)').matches;

  let lienzo = null, ctx = null;
  let ancho = 0, alto = 0, dpr = 1;
  let estrellas = [];
  let nebulosa = null;          // el canvas aparte con la nebulosa ya pintada
  let rafId = 0;
  let t0 = 0;                   // el reloj de la deriva
  let giro = 0;                 // ángulo acumulado de la nebulosa
  let salto = null;             // { desde, dura, alFin, reloj } mientras se viaja
  let relojResize = null;
  let previo = 0;               // el cuadro anterior, para pasos por tiempo real
  let medirLuego = false;       // un resize llegó en pleno salto: se difiere
  let interior = false;         // el cielo del Núcleo: transparente y sereno
  let fugaces = [];             // las estrellas fugaces en vuelo
  let proximaFugaz = 0;         // cuándo nace la próxima
  let empujon = null;           // { x, y, desde, dura } — el viaje hacia un planeta

  // ── el reparto del cielo ──────────────────────────────────────────────────

  /* Semilla fija: el cielo es el MISMO en cada visita. Un cielo que cambia
     en cada carga parece un salvapantallas; uno que siempre es el tuyo,
     una casa. (Y de paso las pruebas pueden mirar píxeles sin ruleta.) */
  function alAzar(semilla) {
    let s = semilla >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const TONOS = [
    [255, 246, 227],   // blanco cálido: la mayoría
    [255, 246, 227],
    [255, 246, 227],
    [232, 200, 122],   // oro de la casa
    [159, 182, 255],   // azul frío, pocas
  ];

  function sembrar() {
    const az = alAzar(5550);   // la cadena de la casa, de semilla
    const cuantas = Math.min(420, Math.round((ancho * alto) / (BOLSILLO ? 11000 : 6200)));
    estrellas = [];
    for (let i = 0; i < cuantas; i++) {
      const capa = i % 3;                       // 0 lejos · 1 media · 2 cerca
      const tono = TONOS[Math.floor(az() * TONOS.length)];
      estrellas.push({
        x: az() * ancho, y: az() * alto,
        r: 0.35 + capa * 0.4 + az() * 0.7,      // las cercanas, más grandes
        v: (0.55 + capa * 0.9) * (0.75 + az() * 0.5),   // y más rápidas
        tono,
        brillo: 0.35 + az() * 0.6,
        parpadeo: 0.5 + az() * 2.2,             // frecuencia del titileo
        fase: az() * Math.PI * 2,
      });
    }
  }

  /* EL SOL ESPIRAL. El corazón de la galaxia del Inicio: dos brazos de
     polvo de estrellas enroscados que giran despacio alrededor del centro,
     pintados UNA vez en su propio lienzo y estampados girados cada cuadro —
     la misma receta de la nebulosa, por el mismo costo. Solo vive en el modo
     interior: en la puerta el protagonista es AU-RA. */
  let sol = null;
  let giroSol = 0;

  function pintarSol() {
    const l = 520;
    sol = document.createElement('canvas');
    sol.width = sol.height = l;
    const c = sol.getContext('2d');
    const az = alAzar(4747);
    const cx = l / 2, cy = l / 2;
    // el resplandor del núcleo
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, l * 0.16);
    g.addColorStop(0, 'rgba(248,239,207,0.85)');
    g.addColorStop(0.35, 'rgba(232,200,122,0.32)');
    g.addColorStop(1, 'rgba(232,200,122,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, l, l);
    // dos brazos logarítmicos de polvo
    for (let brazo = 0; brazo < 2; brazo++) {
      for (let i = 0; i < 900; i++) {
        const t = i / 900;
        const ang = brazo * Math.PI + t * 4.6 + (az() - 0.5) * 0.5;
        const r = 12 + t * (l * 0.46);
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r * 0.62;    // achatada: se ve de tres cuartos
        const brillo = (1 - t) * 0.5 + az() * 0.25;
        c.fillStyle = az() < 0.12
          ? `rgba(248,239,207,${(brillo * 0.9).toFixed(2)})`
          : `rgba(${az() < 0.5 ? '182,196,255' : '232,200,122'},${(brillo * 0.4).toFixed(2)})`;
        const p = 0.6 + az() * 1.5;
        c.fillRect(x, y, p, p);
      }
    }
  }

  /* La nebulosa: tres velos de color sobre negro azulado, pintados una vez.
     El lienzo es MÁS GRANDE que la pantalla para poder girarlo sin que se
     vean las esquinas. Nada de verde: azul profundo, oro y un resto púrpura. */
  function pintarNebulosa() {
    /* El lienzo LÓGICO cubre la diagonal (para girar sin ver esquinas), pero
       se pinta a MEDIA resolución y se estampa escalado: son velos difusos de
       gradiente y el aumento no se ve — la memoria y el costo del estampado
       caen a un cuarto. En un 4K el lienzo a resolución entera eran ~80MB. */
    const l = Math.ceil(Math.hypot(ancho, alto)) + 80;
    const f = 0.5;
    nebulosa = document.createElement('canvas');
    nebulosa.logico = l;
    nebulosa.width = nebulosa.height = Math.ceil(l * f);
    const c = nebulosa.getContext('2d');
    const az = alAzar(1889);
    const lf = l * f;
    const mancha = (x, y, r, rgba) => {
      const g = c.createRadialGradient(x * f, y * f, 0, x * f, y * f, r * f);
      g.addColorStop(0, rgba);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, lf, lf);
    };
    mancha(l * 0.32, l * 0.38, l * 0.52, 'rgba(27,44,107,0.34)');   // azul real
    mancha(l * 0.68, l * 0.62, l * 0.46, 'rgba(201,169,97,0.13)');  // oro viejo
    mancha(l * 0.56, l * 0.30, l * 0.36, 'rgba(59,35,88,0.22)');    // púrpura
    mancha(l * 0.24, l * 0.72, l * 0.30, 'rgba(232,200,122,0.08)'); // rescoldo
    // polvo: puntitos apenas visibles que le dan grano a los velos
    for (let i = 0; i < 240; i++) {
      c.fillStyle = `rgba(255,246,227,${0.015 + az() * 0.03})`;
      c.fillRect(az() * lf, az() * lf, 1, 1);
    }
  }

  // ── pintar ────────────────────────────────────────────────────────────────

  function fondo() {
    /* En el interior el cielo es un velo sobre el negro del Núcleo, no una
       pintura opaca: la constelación de esferas ES el protagonista y esto es
       su firmamento. En la entrada, el espacio se pinta entero. */
    if (interior) { ctx.clearRect(0, 0, ancho, alto); return; }
    const g = ctx.createLinearGradient(0, 0, 0, alto);
    g.addColorStop(0, '#050510');
    g.addColorStop(0.55, '#080B1E');
    g.addColorStop(1, '#0A0E24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ancho, alto);
  }

  /* ── las estrellas fugaces ──────────────────────────────────────────────────
     Cada tantos segundos una cruza un tramo del cielo y se apaga. No llevan
     semilla: son el azar del cielo, y ninguna prueba depende de ellas. */
  function nacerFugaz(ahora) {
    const desdeArriba = Math.random() < 0.7;
    const x = Math.random() * ancho;
    const y = desdeArriba ? Math.random() * alto * 0.4 : Math.random() * alto;
    const ang = (35 + Math.random() * 30) * (Math.PI / 180) * (Math.random() < 0.5 ? 1 : -1);
    fugaces.push({
      x, y, vx: Math.cos(ang) * (9 + Math.random() * 7), vy: Math.abs(Math.sin(ang)) * (5 + Math.random() * 4),
      nacio: ahora, vida: 600 + Math.random() * 350,
    });
    proximaFugaz = ahora + 5200 + Math.random() * 8000;
  }

  function pintarFugaces(ahora, dt) {
    if (!proximaFugaz) proximaFugaz = ahora + 2200 + Math.random() * 4000;
    if (ahora >= proximaFugaz && fugaces.length < 2 && !salto) nacerFugaz(ahora);
    for (const f of fugaces) {
      const edad = (ahora - f.nacio) / f.vida;
      if (edad >= 1) continue;
      f.x += f.vx * dt; f.y += f.vy * dt;
      // brilla al nacer, se apaga al morir; la cola apunta hacia atrás
      const a = edad < 0.25 ? edad / 0.25 : 1 - (edad - 0.25) / 0.75;
      const cola = 16 + 46 * Math.min(1, edad * 2);
      const g = ctx.createLinearGradient(f.x, f.y, f.x - f.vx * cola / 9, f.y - f.vy * cola / 9);
      g.addColorStop(0, `rgba(248,239,207,${0.9 * a})`);
      g.addColorStop(1, 'rgba(248,239,207,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - f.vx * cola / 9, f.y - f.vy * cola / 9);
      ctx.stroke();
    }
    fugaces = fugaces.filter(f => (ahora - f.nacio) / f.vida < 1);
  }

  function cuadro(ahora) {
    const t = (ahora - t0) / 1000;
    /* El paso se escala por el tiempo REAL entre cuadros: a 120 o 144Hz el
       cielo derivaría al doble si el paso fuera «por cuadro». El tope de 3
       evita el bandazo al volver de una pestaña dormida. */
    const dt = previo ? Math.min(3, (ahora - previo) / 16.7) : 1;
    previo = ahora;
    fondo();

    // la nebulosa gira tan despacio que solo se nota si uno se queda
    giro += 0.00022;
    ctx.save();
    ctx.translate(ancho * 0.5, alto * 0.5);
    ctx.rotate(giro);
    ctx.globalAlpha = interior ? 0.45 : 1;
    ctx.drawImage(nebulosa, -nebulosa.logico / 2, -nebulosa.logico / 2,
                  nebulosa.logico, nebulosa.logico);
    ctx.globalAlpha = 1;
    ctx.restore();

    if (interior && sol) {
      giroSol += 0.0009 * dt;
      ctx.save();
      ctx.translate(ancho * 0.5, alto * 0.44);
      ctx.rotate(giroSol);
      ctx.globalAlpha = 0.5;
      const ls = Math.min(ancho, alto) * 0.66;
      ctx.drawImage(sol, -ls / 2, -ls / 2, ls, ls);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    const enSalto = salto ? Math.min(1, (ahora - salto.desde) / salto.dura) : 0;
    // aceleración del viaje: arranca suave y termina lanzado
    const empuje = enSalto * enSalto * enSalto;
    const cx = ancho / 2, cy = alto / 2;

    for (const e of estrellas) {
      // deriva diagonal lenta; el cielo respira, no corre
      e.x += e.v * 0.016 * dt;
      e.y -= e.v * 0.006 * dt;
      if (e.x > ancho + 4) e.x = -4;
      if (e.y < -4) e.y = alto + 4;

      const late = e.brillo * (0.75 + 0.25 * Math.sin(t * e.parpadeo + e.fase));
      const [r, g, b] = e.tono;

      if (enSalto > 0.02) {
        /* EL HIPERSALTO. Cada estrella se estira en un trazo que huye del
           centro: el largo crece con el empuje y con su distancia, que es
           exactamente cómo se ve acelerar hacia adelante. */
        const dx = e.x - cx, dy = e.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const largo = empuje * d * 0.5 + empuje * 26;
        ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(1, late + empuje * 0.5)})`;
        ctx.lineWidth = e.r * (1 + empuje * 1.6);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + (dx / d) * largo, e.y + (dy / d) * largo);
        ctx.stroke();
        // y además huye de verdad: la posición se va del centro
        e.x += (dx / d) * empuje * 30 * dt;
        e.y += (dy / d) * empuje * 30 * dt;
      } else {
        ctx.fillStyle = `rgba(${r},${g},${b},${interior ? late * 0.7 : late})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (salto) {
      // el destello del final: dorado, breve, y sin blanco quemado
      if (enSalto > 0.72) {
        const f = (enSalto - 0.72) / 0.28;
        const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(ancho, alto) * 0.8);
        g2.addColorStop(0, `rgba(232,200,122,${0.55 * f})`);
        g2.addColorStop(1, 'rgba(232,200,122,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, ancho, alto);
      }
      if (enSalto >= 1) terminarSalto();
    }

    /* EL EMPUJÓN: al elegir un planeta, las estrellas se apartan de él un
       instante — el cielo entero dice «vamos hacia allá» sin mover la
       constelación, que es del DOM y tiene su propio gesto. */
    if (empujon) {
      /* Doble clampa: el reloj del RAF marca el INICIO del cuadro y puede
         venir por detrás del performance.now() que fechó el empujón — un p
         negativo pintaba un color con alfa «-9» y tumbaba el canvas. */
      const p = Math.min(1, Math.max(0, (ahora - empujon.desde) / empujon.dura));
      const fuerza = Math.sin(p * Math.PI) * 3.2;
      for (const e of estrellas) {
        const dx = e.x - empujon.x, dy = e.y - empujon.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * fuerza * dt;
        e.y += (dy / d) * fuerza * dt;
      }
      /* Y el destello del planeta elegido: un aliento de SU color que crece
         y se apaga con el viaje — la apertura tiene firma, no es un fundido
         genérico. */
      if (empujon.tinte) {
        const alfa = Math.sin(p * Math.PI) * 0.34;
        const radio = 90 + p * Math.max(ancho, alto) * 0.5;
        const g3 = ctx.createRadialGradient(empujon.x, empujon.y, 0, empujon.x, empujon.y, radio);
        g3.addColorStop(0, empujon.tinte + Math.round(alfa * 255).toString(16).padStart(2, '0'));
        g3.addColorStop(1, empujon.tinte + '00');
        ctx.fillStyle = g3;
        ctx.fillRect(0, 0, ancho, alto);
      }
      if (p >= 1) empujon = null;
    }

    pintarFugaces(ahora, dt);
    if (!salto && medirLuego) { medirLuego = false; medir(); }
  }

  /* El aterrizaje es UNO, llegue por donde llegue: el bucle cuando el viaje
     cumple su tiempo, o el guardián de abajo si el navegador congeló los
     cuadros. Los dos caminos pasan por aquí y el segundo ya no encuentra
     nada que hacer. */
  function terminarSalto() {
    if (!salto) return;
    clearTimeout(salto.reloj);
    const fin = salto.alFin;
    salto = null;
    sembrar();               // el cielo del regreso, entero otra vez
    if (fin) fin();
  }

  function bucle(ahora) {
    rafId = 0;
    if (!ctx) return;
    /* Escondida la capa o la pestaña, la galaxia duerme. El salto es la
       excepción: tiene que terminar para poder avisar que terminó.
       OJO: la visibilidad se mira con getClientRects y NO con offsetParent,
       porque offsetParent de un elemento position:fixed es null SIEMPRE — el
       primer borrador dormía el cielo entero creyéndolo oculto. */
    if (!salto && (document.hidden || lienzo.getClientRects().length === 0)) {
      rafId = requestAnimationFrame(bucle);
      return;
    }
    // en el teléfono, un cuadro sí y uno no; el salto corre entero siempre
    if (BOLSILLO && !salto && ahora - previo < 30) {
      rafId = requestAnimationFrame(bucle);
      return;
    }
    cuadro(ahora);
    rafId = requestAnimationFrame(bucle);
  }

  // ── medidas ───────────────────────────────────────────────────────────────

  function medir() {
    if (!lienzo) return;
    /* En pleno salto no se resiembra: resetear las estrellas a su cielo
       quieto a mitad del túnel lo colapsa a la vista. El resize queda
       anotado y se atiende al aterrizar. */
    if (salto) { medirLuego = true; return; }
    dpr = Math.min(BOLSILLO ? 1.25 : 2, window.devicePixelRatio || 1);
    ancho = lienzo.clientWidth;
    alto = lienzo.clientHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sembrar();
    pintarNebulosa();
    if (interior && !sol) pintarSol();
    if (QUIETO.matches) cuadro(performance.now());   // un cielo quieto, entero
  }

  // ── lo público ────────────────────────────────────────────────────────────

  function montar(el, opciones = {}) {
    if (!el || lienzo === el) return;
    apagar();
    interior = !!opciones.interior;
    lienzo = el;
    // apagar() lo dejó escondido; se enseña ANTES de medir, que si no el
    // lienzo mide cero y el cielo nace vacío.
    lienzo.style.display = '';
    ctx = lienzo.getContext('2d');
    t0 = performance.now();
    previo = 0;
    medir();
    addEventListener('resize', alMedir);
    if (!QUIETO.matches) rafId = requestAnimationFrame(bucle);
  }

  const alMedir = () => {
    clearTimeout(relojResize);
    relojResize = setTimeout(medir, 160);
  };

  function apagar() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    removeEventListener('resize', alMedir);
    if (salto) clearTimeout(salto.reloj);
    if (lienzo) {
      /* Se limpia Y se esconde desde aquí, no solo desde el CSS: la regla que
         lo apaga dentro de la app usa :has(), y en un navegador sin :has() un
         último cuadro congelado taparía la fotografía del interior. */
      try { lienzo.width = lienzo.width; } catch { /* nada */ }
      lienzo.style.display = 'none';
    }
    lienzo = null; ctx = null; salto = null; medirLuego = false;
  }

  /**
   * El viaje. `alFin` se llama UNA vez, con el flash ya pasado: es el momento
   * de enseñar la otra galaxia (el Núcleo). Con movimiento reducido no hay
   * viaje que hacer: se llama de inmediato y la app entra en seco, que es lo
   * que esa preferencia pide.
   */
  function saltar(alFin, dura = 1350) {
    if (!ctx || QUIETO.matches) { if (alFin) alFin(); return; }
    if (salto) return;                       // un viaje a la vez
    salto = { desde: performance.now(), dura, alFin };
    /* EL GUARDIÁN DEL ATERRIZAJE. requestAnimationFrame se congela con la
       pestaña escondida (y no corre si el cielo nació quieto): sin esto, quien
       tapa la pestaña justo tras entrar se quedaría con la sesión guardada y
       la puerta en pantalla, esperando un aterrizaje que no llega. Un timer sí
       corre en segundo plano, aunque el navegador lo estire. */
    salto.reloj = setTimeout(terminarSalto, dura + 400);
    if (!rafId) rafId = requestAnimationFrame(bucle);
  }

  /* Si la persona cambia «reducir movimiento» con la puerta abierta, el cielo
     obedece al instante: se para y queda un cuadro quieto, o arranca. La
     promesa es «respetado siempre», no «respetado al montar». */
  QUIETO.addEventListener?.('change', () => {
    if (!ctx) return;
    if (QUIETO.matches) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      cuadro(performance.now());
    } else if (!rafId) {
      previo = 0;
      rafId = requestAnimationFrame(bucle);
    }
  });

  const viva = () => !!ctx;

  /** El cielo acompaña el viaje hacia un planeta: las estrellas se apartan
      del punto (px,py en píxeles de pantalla) durante `dura` ms. */
  function empujarHacia(px, py, dura = 520, tinte = null) {
    if (!ctx || QUIETO.matches) return;
    // el tinte llega como #rrggbb; cualquier otra forma se ignora sin drama
    if (tinte && !/^#[0-9a-fA-F]{6}$/.test(tinte)) tinte = null;
    empujon = { x: px, y: py, desde: performance.now(), dura, tinte };
  }

  return { montar, apagar, saltar, viva, empujarHacia };
})();

if (typeof window !== 'undefined') window.GALAXIA = GALAXIA;
