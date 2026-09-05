/* LA PRESENCIA DE ULTRON: la figura de luz, en el despacho.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTÁ, Y POR QUÉ NO ESTORBA
 *
 * Un sistema de inteligencia que es un cuadro de texto no se siente presente,
 * y la Junta pidió verlo. Pero una consola de gobierno se usa para leer
 * cifras, así que la figura vive DETRÁS del hilo: grande y clara cuando no
 * hay conversación —es la portada del despacho— y atenuada cuando hay algo
 * que leer. Nunca compite con el texto.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CÓMO ESTÁ HECHA
 *
 * Canvas 2D, sin librerías y sin compilar, como el resto de la consola. La
 * silueta —cabeza, cuello, hombros, torso— es un campo implícito: para cada
 * punto se sabe si está dentro y A QUÉ DISTANCIA DEL BORDE. Eso es lo que da
 * el aspecto translúcido de la imagen: las partículas del borde brillan y las
 * de dentro se apagan, así que la figura se lee por su contorno y se ve a
 * través de ella.
 *
 * Encima, tres capas: la lluvia de código al fondo, los rayos de luz que caen
 * desde arriba, y las cintas de energía que la envuelven. Y el núcleo del
 * pecho, que es lo que late cuando ULTRON habla.
 *
 * LA VOZ LA MUEVE. `nivel(v)` recibe la envolvente del habla (lib voz.js) y
 * con ella crece el núcleo, se aceleran las cintas y las partículas se
 * separan. Cuando ULTRON piensa, las sienes se agitan. Cuando escucha, la
 * figura se aquieta y se abre. No es adorno: es lo que dice en qué estado
 * está sin tener que leerlo.
 *
 * SE APAGA SOLA. Fuera del despacho, con la pestaña oculta, o si la persona
 * pidió menos movimiento, el bucle se detiene: nadie paga batería por un
 * dibujo que no está mirando.
 */
const PRESENCIA = (() => {
  'use strict';

  const GLIFOS = '01ABCDEF·ORIGEN5550AUKA8532';
  const CANTIDAD = { escritorio: 4200, movil: 1700 };

  let cv = null, cx = null, alto = 0, ancho = 0, dpr = 1;
  let puntos = [], lluvia = [], cintas = [];
  let raf = 0, t0 = performance.now();
  let nivelVoz = 0, nivelSuave = 0;
  let modo = 'quieto';            // quieto · pensando · escuchando · hablando
  let intensidad = 1;             // 1 portada · 0.32 detrás del texto
  let intensidadSuave = 1;
  const quieto = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // ── la silueta ────────────────────────────────────────────────────────────
  //
  // Coordenadas normalizadas: x de −1 a 1, y de −1 (arriba) a 1 (abajo). El
  // campo vale 0 en el centro de cada pieza y 1 justo en su borde; el mínimo
  // de las tres piezas es la silueta.
  const elipse = (x, y, cx0, cy0, rx, ry) => ((x - cx0) / rx) ** 2 + ((y - cy0) / ry) ** 2;
  function campo(x, y) {
    const cabeza = elipse(x, y, 0, -0.56, 0.265, 0.325);
    // la mandíbula se estrecha: sin esto la cabeza es un huevo
    const mandibula = y > -0.45 ? elipse(x * (1 + (y + 0.45) * 0.95), y, 0, -0.56, 0.265, 0.325) : cabeza;
    const cuello = elipse(x, y, 0, -0.20, 0.085, 0.12);
    const hombros = elipse(x, y, 0, 0.62, 0.78, 0.72);
    return Math.min(mandibula, cuello, hombros);
  }
  const OJO = { x: 0.105, y: -0.60, r: 0.038 };

  /**
   * El relieve del rostro. No se dibujan rasgos: se ILUMINAN.
   *
   * Una cara de frente se reconoce por dónde le da la luz —el caballete de la
   * nariz, el arco de las cejas, el labio, el mentón— y por dónde no: las
   * cuencas y el surco bajo los pómulos. Aquí eso es un multiplicador del
   * brillo de cada partícula, así que la cara aparece sin una sola línea
   * dibujada y sin dejar de ser una nube de puntos.
   */
  const gauss = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));
  function rostro(x, y) {
    let r = 1;
    r += 1.15 * gauss(x, y + 0.545, 0.030, 0.085);                                   // el caballete de la nariz
    r += 0.75 * gauss(x, y + 0.468, 0.048, 0.026);                                   // la punta
    r -= 0.55 * (gauss(x - 0.105, y + 0.60, 0.055, 0.032) + gauss(x + 0.105, y + 0.60, 0.055, 0.032)); // las cuencas
    r += 0.60 * gauss(x, y + 0.655, 0.150, 0.020);                                   // el arco de las cejas
    r += 0.45 * (gauss(x - 0.175, y + 0.545, 0.055, 0.055) + gauss(x + 0.175, y + 0.545, 0.055, 0.055)); // los pómulos
    r += 0.55 * gauss(x, y + 0.418, 0.070, 0.018);                                   // el labio de arriba
    r -= 0.40 * gauss(x, y + 0.400, 0.062, 0.007);                                   // la línea de la boca
    r += 0.45 * gauss(x, y + 0.383, 0.062, 0.016);                                   // el labio de abajo
    r += 0.50 * gauss(x, y + 0.335, 0.070, 0.030);                                   // el mentón
    r -= 0.30 * gauss(x, y + 0.500, 0.120, 0.020);                                   // el surco del pómulo
    return Math.max(0.25, r);
  }

  /** Puntos sobre la silueta, deterministas: la figura es la misma siempre. */
  function sembrar(n) {
    let s = 20260905; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const lista = []; let intentos = 0;
    while (lista.length < n && intentos < n * 60) {
      intentos++;
      const x = rnd() * 2.2 - 1.1, y = rnd() * 2.2 - 1.1;
      const f = campo(x, y);
      if (f > 1) continue;
      // Sin puntos en las cuencas: los ojos se leen solos.
      if (Math.hypot(Math.abs(x) - OJO.x, y - OJO.y) < OJO.r * 1.5) continue;
      // Más densidad cerca del borde: es lo que dibuja la silueta.
      const borde = 1 - f;                       // 0 en el borde, 1 en el centro
      const enLaCara = y < -0.30 && y > -0.86;
      const cara = enLaCara ? rostro(x, y) : 1;
      // Se siembra más densidad donde hay relieve: la cara necesita puntos
      // para que el modelado se vea, el torso se lee con el contorno.
      if (rnd() > (0.22 + 0.78 * Math.exp(-borde * 7)) * (enLaCara ? 1.6 : 1)) continue;
      lista.push({
        x, y,
        brillo: Math.min(1, (0.46 + 0.54 * Math.exp(-borde * 4)) * cara),
        fase: rnd() * Math.PI * 2,
        sien: Math.abs(x) > 0.15 && y < -0.45 && y > -0.72 ? 1 : 0,
        pecho: y > 0.1 && y < 0.7 && Math.abs(x) < 0.4 ? 1 : 0,
        r: 1.15 + rnd() * 1.15,
      });
    }
    return lista;
  }

  function medir() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    ancho = cv.clientWidth; alto = cv.clientHeight;
    // El lienzo puede estar en una vista todavía oculta: entonces mide cero y
    // no hay nada que dibujar. Se sale, y el ResizeObserver vuelve a llamar
    // aquí en cuanto el despacho se muestra.
    if (ancho < 2 || alto < 2) return false;
    cv.width = Math.round(ancho * dpr); cv.height = Math.round(alto * dpr);
    const movil = ancho < 700;
    if (!puntos.length || puntos.length !== (movil ? CANTIDAD.movil : CANTIDAD.escritorio)) {
      puntos = sembrar(movil ? CANTIDAD.movil : CANTIDAD.escritorio);
    }
    lluvia = [];
    let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
    for (let i = 0; i < Math.round(ancho / 26); i++) {
      lluvia.push({ x: rnd(), y: rnd(), v: 0.02 + rnd() * 0.05, largo: 6 + Math.floor(rnd() * 14), semilla: Math.floor(rnd() * 1000) });
    }
    cintas = [];
    for (let i = 0; i < 5; i++) cintas.push({ fase: (i / 5) * Math.PI * 2, radio: 0.62 + i * 0.09, alto: 0.1 + i * 0.16, v: 0.10 + i * 0.035 });
    return true;
  }

  // ── el dibujo ─────────────────────────────────────────────────────────────
  function cuadro(ms) {
    const t = (ms - t0) / 1000;
    /* El encuadre, calculado y no a ojo: la figura va de y = −0,86 (la
       coronilla) a y = 1,34 (el filo de los hombros), o sea 2,2 unidades. Se
       le da el 74 % del alto, con la coronilla al 18 %; y se limita por el
       ancho para que en un teléfono no se salga de lado. */
    const k = Math.min(alto * 0.336, ancho * 0.42);
    const cxp = ancho / 2, cyp = alto * 0.18 + 0.86 * k;
    const aX = (x) => cxp + x * k, aY = (y) => cyp + y * k;

    nivelSuave += (nivelVoz - nivelSuave) * 0.18;
    intensidadSuave += (intensidad - intensidadSuave) * 0.06;
    const I = intensidadSuave;
    const respira = 1 + 0.012 * Math.sin(t / 4.2 * Math.PI * 2);
    const agita = modo === 'pensando' ? 2.4 : modo === 'escuchando' ? 0.7 : 1;

    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, ancho, alto);
    cx.globalCompositeOperation = 'lighter';

    // 1 · la lluvia de código, al fondo
    cx.font = '11px "IBM Plex Mono", monospace';
    for (const c of lluvia) {
      const x = c.x * ancho;
      const y0 = ((c.y + t * c.v) % 1.25 - 0.15) * alto;
      for (let j = 0; j < c.largo; j++) {
        const y = y0 - j * 14;
        if (y < -14 || y > alto) continue;
        const a = (1 - j / c.largo) * 0.2 * I;
        cx.fillStyle = `rgba(120,190,255,${a.toFixed(3)})`;
        cx.fillText(GLIFOS[(c.semilla + j * 7 + Math.floor(t * 3 + j)) % GLIFOS.length], x, y);
      }
    }

    // 2 · los rayos que caen desde arriba
    for (let i = 0; i < 4; i++) {
      const x = cxp + (i - 1.5) * k * 0.62 + Math.sin(t * 0.16 + i) * k * 0.06;
      const g = cx.createLinearGradient(x, 0, x, alto * 0.86);
      g.addColorStop(0, `rgba(90,170,255,${(0.14 * I).toFixed(3)})`);
      g.addColorStop(1, 'rgba(90,170,255,0)');
      cx.fillStyle = g;
      cx.beginPath(); cx.moveTo(x - k * 0.02, 0); cx.lineTo(x + k * 0.02, 0);
      cx.lineTo(x + k * 0.3, alto * 0.86); cx.lineTo(x - k * 0.3, alto * 0.86); cx.closePath(); cx.fill();
    }

    // 3 · las cintas de energía que la envuelven
    for (const c of cintas) {
      cx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const u = i / 90 * Math.PI * 2;
        const giro = t * c.v * (1 + nivelSuave * 0.8) + c.fase;
        const rr = c.radio * (1 + 0.16 * Math.sin(u * 3 + giro * 2));
        const x = Math.cos(u + giro) * rr;
        const y = c.alto + Math.sin(u * 2 + giro) * 0.30 + Math.sin(u + giro) * 0.06;
        // se aplasta en profundidad: la cinta rodea, no es un aro plano
        const px = aX(x), py = aY(y * 0.92);
        if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
      }
      const g = cx.createLinearGradient(aX(-1), 0, aX(1), 0);
      const a = (0.5 + nivelSuave * 0.6) * I;
      g.addColorStop(0, `rgba(70,150,255,${(a * 0.25).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(160,225,255,${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(70,150,255,${(a * 0.25).toFixed(3)})`);
      cx.strokeStyle = g; cx.lineWidth = 1.5; cx.stroke();
    }

    // 4 · el resplandor que la envuelve: sin esto la figura son puntos sueltos
    {
      const g = cx.createRadialGradient(cxp, cyp + k * 0.1, 0, cxp, cyp + k * 0.1, k * 1.25);
      g.addColorStop(0, `rgba(40,110,220,${(0.18 * I).toFixed(3)})`);
      g.addColorStop(0.55, `rgba(30,90,200,${(0.07 * I).toFixed(3)})`);
      g.addColorStop(1, 'rgba(20,60,160,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, ancho, alto);
    }

    // 5 · el cuerpo
    for (const p of puntos) {
      const v = p.sien ? agita : 1;
      const dx = Math.sin(t * 0.7 * v + p.fase) * 0.006 * (1 + nivelSuave * 2 * p.pecho);
      const dy = (p.pecho ? (respira - 1) * 6 : 0) + Math.cos(t * 0.55 * v + p.fase * 1.3) * 0.006;
      const x = aX(p.x + dx), y = aY(p.y + dy);
      /* El titileo va de 0,55 a 1 y no de 0 a 1: por debajo de la mitad la
         partícula desaparece y la silueta se deshilacha. Y el tamaño mínimo es
         de un píxel y pico: un `fillRect` de menos de un píxel en una pantalla
         de doble densidad se ve como nada, que es lo que pasaba. */
      const a = p.brillo * (0.72 + 0.28 * Math.sin(t * 1.1 + p.fase)) * I * (1 + nivelSuave * 0.5 * p.pecho);
      cx.fillStyle = `rgba(${150 + p.brillo * 85 | 0},${210 + p.brillo * 40 | 0},255,${Math.min(1, a).toFixed(3)})`;
      const r = p.r * (1 + nivelSuave * 0.3 * p.pecho);
      cx.fillRect(x, y, r, r);
    }

    // 6 · los ojos
    const cierra = ((t % 4.6) < 0.16) ? Math.abs(Math.sin((t % 4.6) / 0.16 * Math.PI)) : 0;
    const abre = 1 - cierra;
    for (const s of [-1, 1]) {
      const x = aX(s * OJO.x), y = aY(OJO.y);
      const g = cx.createRadialGradient(x, y, 0, x, y, k * 0.075);
      const a = (0.85 * I) * (modo === 'pensando' ? 0.7 : 1);
      g.addColorStop(0, `rgba(235,248,255,${(a * abre).toFixed(3)})`);
      g.addColorStop(0.35, `rgba(120,205,255,${(a * 0.5 * abre).toFixed(3)})`);
      g.addColorStop(1, 'rgba(60,150,255,0)');
      cx.fillStyle = g;
      cx.beginPath(); cx.ellipse(x, y, k * 0.075, k * 0.075 * Math.max(0.08, abre), 0, 0, 6.284); cx.fill();
    }

    // 7 · el núcleo del pecho: lo que late cuando habla
    {
      const x = aX(0), y = aY(0.30);
      const late = 0.55 + 0.2 * Math.sin(t * 1.6) + nivelSuave * 0.8;
      const g = cx.createRadialGradient(x, y, 0, x, y, k * 0.34 * late);
      const a = 0.5 * I * late;
      g.addColorStop(0, `rgba(225,245,255,${Math.min(0.9, a).toFixed(3)})`);
      g.addColorStop(0.3, `rgba(110,195,255,${(a * 0.45).toFixed(3)})`);
      g.addColorStop(1, 'rgba(40,120,255,0)');
      cx.fillStyle = g;
      cx.beginPath(); cx.arc(x, y, k * 0.34 * late, 0, 6.284); cx.fill();
    }

    cx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(cuadro);
  }

  function pintarUnaVez() {
    // Sin movimiento: un solo cuadro, para que la figura esté aunque no anime.
    cancelAnimationFrame(raf); raf = 0;
    if (!ancho && !medir()) return;
    intensidadSuave = intensidad; nivelSuave = 0;
    cuadro(performance.now());
    cancelAnimationFrame(raf); raf = 0;
  }
  function correr() {
    if (raf || !cv) return;
    if (!ancho && !medir()) return;      // todavía oculto: el observador avisará
    if (quieto()) return pintarUnaVez();
    t0 = performance.now() - 1000;
    raf = requestAnimationFrame(cuadro);
  }
  function parar() { cancelAnimationFrame(raf); raf = 0; }

  // ── el trato con la consola ───────────────────────────────────────────────
  function arrancar() {
    cv = document.getElementById('presencia');
    if (!cv || !cv.getContext) return;
    cx = cv.getContext('2d');
    medir(); correr();
    /* El lienzo nace dentro de una vista que puede estar oculta —`arrancar()`
       corre antes de elegir la vista— y ahí mide cero. El observador es lo que
       lo hace aparecer solo en cuanto el despacho se muestra, sin que nadie
       tenga que acordarse de volver a medir. */
    if (window.ResizeObserver) {
      new ResizeObserver(() => { if (medir()) { if (raf) return; correr(); } }).observe(cv);
    }
    let t = null;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (medir() && !raf) pintarUnaVez(); }, 180); });
    document.addEventListener('visibilitychange', () => (document.hidden ? parar() : correr()));
  }
  const nivel = (v) => { nivelVoz = Math.max(0, Math.min(1, v || 0)); };
  const estado = (m) => { modo = m; };
  /** `portada` cuando el hilo está vacío; `fondo` cuando hay algo que leer. */
  const plano = (p) => { intensidad = p === 'portada' ? 1 : 0.3; cv?.classList.toggle('fondo', p !== 'portada'); if (!raf) pintarUnaVez(); };

  return { arrancar, nivel, estado, plano, correr, parar };
})();
