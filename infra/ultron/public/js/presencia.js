/* LA PRESENCIA DE ULTRON: la figura, y las moléculas que la mantienen viva.
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
 * DE QUÉ ESTÁ HECHA
 *
 * De dos cosas que se necesitan la una a la otra.
 *
 * LA IMAGEN es la que dio la Junta. Un cuerpo de vidrio con el rostro
 * modelado no sale de un puñado de fórmulas, así que se usa la pieza de arte
 * en vez de imitarla a medias. Va sin canal alfa y compuesta con `screen`: la
 * figura es luz sobre negro, y en ese modo el negro desaparece solo contra el
 * grafito de la consola.
 *
 * LAS MOLÉCULAS son la vida, y no son un adorno encima: SALEN DE LA IMAGEN.
 * Al arrancar se dibuja la foto en un lienzo aparte, se leen sus píxeles y se
 * quedan los que tienen luz — cada uno con su sitio y SU COLOR. Eso es lo que
 * las hace pertenecer: una partícula del pecho es del azul del pecho y una de
 * las cintas es del cian de las cintas, porque son ese píxel. Después cada
 * una orbita alrededor de su sitio, y lo que se ve es la misma figura
 * respirando en vez de una foto quieta.
 *
 * Una de cada doce se va más lejos y vuelve, en órbitas largas: son las que
 * se leen como moléculas viajando, y sin ellas el conjunto vibra pero no se
 * mueve.
 *
 * LA VOZ LAS MUEVE. `nivel(v)` recibe la envolvente del habla y con ella
 * crecen las órbitas, se acelera el giro y sube el brillo. Cuando piensa, una
 * onda las recorre de abajo arriba. Cuando escucha, se aquietan y se abren.
 * No es decoración: es lo que dice en qué estado está sin tener que leerlo.
 *
 * EL LIENZO VA ENCIMA DE LA IMAGEN —por eso `#figura` está antes en el HTML—
 * porque las moléculas tienen que verse SOBRE el cuerpo, no detrás. Todo lo
 * del lienzo se pinta en modo `lighter`: es luz que se suma a la luz.
 *
 * SE APAGA SOLA. Fuera del despacho, con la pestaña oculta, o si la persona
 * pidió menos movimiento, el bucle se detiene: nadie paga batería por un
 * dibujo que no está mirando.
 */
const PRESENCIA = (() => {
  'use strict';

  const GLIFOS = '01ABCDEF·ORIGEN5550AUKA8532';
  const CANTIDAD = { escritorio: 3400, movil: 1500 };
  /** Cuántas se van de paseo largo. Una de cada doce: menos y no se nota que
   *  algo viaja; más y la silueta se deshace. */
  const VIAJERAS = 12;

  let cv = null, cx = null, img = null, alto = 0, ancho = 0, dpr = 1;
  let lluvia = [], moleculas = [], semillaMol = null;
  let raf = 0, t0 = performance.now();
  let nivelVoz = 0, nivelSuave = 0;
  let modo = 'quieto';            // quieto · pensando · escuchando · hablando
  let intensidad = 1;             // 1 portada · 0.3 detrás del texto
  let intensidadSuave = 1;
  const quieto = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /* Dónde cae el pecho dentro de la imagen, en fracciones de ella. Es el
     centro del aura y del núcleo, y el eje del remolino lento. */
  const PECHO = { u: 0.5, v: 0.42 };

  // ── el encuadre: dónde cae la imagen dentro del lienzo ────────────────────
  //
  // La imagen se coloca con `object-fit` —contain en pantalla ancha, cover en
  // un teléfono— y con `object-position: top center`. Para que una molécula
  // caiga sobre SU píxel hay que rehacer esa cuenta: sin esto las partículas
  // aterrizan corridas y la figura se ve doble.
  function encuadre() {
    if (!img || !img.naturalWidth || !cv) return null;
    const rc = cv.getBoundingClientRect(), ri = img.getBoundingClientRect();
    if (!ri.width || !ri.height) return null;
    const cubre = getComputedStyle(img).objectFit === 'cover';
    const sx = ri.width / img.naturalWidth, sy = ri.height / img.naturalHeight;
    const s = cubre ? Math.max(sx, sy) : Math.min(sx, sy);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    return { x: ri.left - rc.left + (ri.width - w) / 2, y: ri.top - rc.top, w, h };
  }

  /**
   * Las moléculas, leídas de la imagen.
   *
   * Se dibuja la foto pequeña en un lienzo aparte y se recorren sus píxeles.
   * Se queda con los que tienen luz, y con probabilidad proporcional a esa
   * luz: así el borde brillante —que es lo que dibuja la silueta— recibe
   * muchas y el cielo de fondo casi ninguna, sin tener que decidirlo a mano.
   *
   * Devuelve false si la imagen todavía no está decodificada; quien llama
   * vuelve a intentarlo cuando cargue.
   */
  function sembrar(cuantas) {
    if (!img || !img.complete || !img.naturalWidth) return false;
    const ANCHO = 190;
    const ALTO = Math.max(1, Math.round(ANCHO * img.naturalHeight / img.naturalWidth));
    let datos;
    try {
      const off = document.createElement('canvas');
      off.width = ANCHO; off.height = ALTO;
      const ox = off.getContext('2d', { willReadFrequently: true });
      ox.drawImage(img, 0, 0, ANCHO, ALTO);
      datos = ox.getImageData(0, 0, ANCHO, ALTO).data;
    } catch { return false; }   // otra procedencia: el lienzo quedaría manchado

    // Deterministas: la figura es la misma en cada carga, y eso importa
    // porque el ojo reconoce una silueta que no cambia de forma al recargar.
    let s = 20260906;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    const lista = [];
    for (let i = 0; i < ANCHO * ALTO; i++) {
      const p = i * 4, r = datos[p], g = datos[p + 1], b = datos[p + 2];
      const luz = (r * 0.30 + g * 0.59 + b * 0.11) / 255;
      if (luz < 0.10) continue;
      // Cuadrática: el brillo pesa el doble de lo que dice su número, que es
      // lo que concentra las moléculas en las venas y en el filo del cuerpo.
      if (rnd() > luz * luz * 3.2) continue;
      const viajera = rnd() < 1 / VIAJERAS;
      lista.push({
        u: (i % ANCHO) / ANCHO, v: Math.floor(i / ANCHO) / ALTO,
        r, g, b, luz,
        fase: rnd() * Math.PI * 2,
        // Las de paseo largo tienen órbita grande y giro lento: una molécula
        // que viaja lejos y rápido se lee como chispa, no como materia.
        orbita: viajera ? 0.012 + rnd() * 0.020 : 0.0016 + rnd() * 0.0042,
        vel: viajera ? 0.10 + rnd() * 0.16 : 0.45 + rnd() * 0.95,
        tam: 0.9 + rnd() * (viajera ? 0.7 : 1.2),
      });
    }
    // Se recorta al cupo quitando de en medio y no del final: cortar la cola
    // dejaría la mitad de abajo de la figura sin una sola molécula.
    while (lista.length > cuantas) lista.splice(Math.floor(rnd() * lista.length), 1);
    moleculas = lista;
    semillaMol = cuantas;
    return true;
  }

  function medir() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    ancho = cv.clientWidth; alto = cv.clientHeight;
    // El lienzo puede estar en una vista todavía oculta: entonces mide cero y
    // no hay nada que dibujar. Se sale, y el ResizeObserver vuelve a llamar
    // aquí en cuanto el despacho se muestra.
    if (ancho < 2 || alto < 2) return false;
    cv.width = Math.round(ancho * dpr); cv.height = Math.round(alto * dpr);
    const cupo = ancho < 700 ? CANTIDAD.movil : CANTIDAD.escritorio;
    if (semillaMol !== cupo) sembrar(cupo);
    lluvia = [];
    let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
    for (let i = 0; i < Math.round(ancho / 34); i++) {
      lluvia.push({ x: rnd(), y: rnd(), v: 0.02 + rnd() * 0.05, largo: 6 + Math.floor(rnd() * 14), semilla: Math.floor(rnd() * 1000) });
    }
    return true;
  }

  // ── el dibujo ─────────────────────────────────────────────────────────────
  function cuadro(ms) {
    const t = (ms - t0) / 1000;
    nivelSuave += (nivelVoz - nivelSuave) * 0.18;
    intensidadSuave += (intensidad - intensidadSuave) * 0.06;
    const I = intensidadSuave;
    const marco = encuadre();
    const px = marco ? marco.x + marco.w * PECHO.u : ancho * 0.5;
    const py = marco ? marco.y + marco.h * PECHO.v : alto * 0.42;
    const k = Math.min(alto * 0.5, ancho * 0.5);

    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, ancho, alto);
    cx.globalCompositeOperation = 'lighter';

    // 1 · la lluvia de código, detrás de todo
    cx.font = '11px "IBM Plex Mono", monospace';
    for (const c of lluvia) {
      const x = c.x * ancho;
      const y0 = ((c.y + t * c.v) % 1.25 - 0.15) * alto;
      for (let j = 0; j < c.largo; j++) {
        const y = y0 - j * 14;
        if (y < -14 || y > alto) continue;
        const a = (1 - j / c.largo) * 0.13 * I;
        cx.fillStyle = `rgba(120,190,255,${a.toFixed(3)})`;
        cx.fillText(GLIFOS[(c.semilla + j * 7 + Math.floor(t * 3 + j)) % GLIFOS.length], x, y);
      }
    }

    // 2 · el aura, que respira y crece con la voz
    {
      const late = 0.62 + 0.08 * Math.sin(t / 3.4 * Math.PI * 2) + nivelSuave * 0.5;
      const g = cx.createRadialGradient(px, py, 0, px, py, k * 1.15 * late);
      const a = 0.18 * I * (modo === 'escuchando' ? 1.25 : 1);
      g.addColorStop(0, `rgba(60,140,255,${a.toFixed(3)})`);
      g.addColorStop(0.5, `rgba(30,95,205,${(a * 0.35).toFixed(3)})`);
      g.addColorStop(1, 'rgba(20,60,160,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, ancho, alto);
    }

    /* 3 · LAS MOLÉCULAS.
     *
     * Cada una orbita alrededor de su propio píxel. Encima de esa órbita hay
     * un remolino lento alrededor del pecho —el término con `giro`— que es lo
     * que hace que el conjunto parezca un cuerpo respirando y no un montón de
     * puntos temblando cada uno por su lado.
     *
     * `energia` es lo que sube con la voz: agranda la órbita, acelera el giro
     * y sube el brillo, las tres cosas a la vez, que es como se ve la energía
     * de verdad. Y la onda de «pensando» es una banda que sube: dentro de
     * ella las moléculas se separan y se encienden. */
    if (marco && moleculas.length) {
      const energia = 0.55 + nivelSuave * 1.5 + 0.10 * Math.sin(t / 5.2 * Math.PI * 2);
      const agita = modo === 'pensando' ? 1.5 : modo === 'escuchando' ? 0.72 : 1;
      const ondaY = modo === 'pensando' ? 1 - ((t % 2.2) / 2.2) : -9;
      for (const m of moleculas) {
        const gi = t * 0.09 + m.v * 1.7;                       // el remolino
        const ex = m.orbita * energia * agita;
        let dx = Math.sin(t * m.vel + m.fase) * ex + Math.cos(gi) * 0.0022;
        let dy = Math.cos(t * m.vel * 0.83 + m.fase * 1.7) * ex + Math.sin(gi) * 0.0022;
        let extra = 0;
        if (ondaY > -1) {
          const d = Math.abs(m.v - ondaY);
          if (d < 0.09) { const w = 1 - d / 0.09; extra = w * 0.55; dx *= 1 + w; dy -= w * 0.006; }
        }
        const x = marco.x + (m.u + dx) * marco.w;
        const y = marco.y + (m.v + dy) * marco.h;
        if (x < -4 || y < -4 || x > ancho + 4 || y > alto + 4) continue;
        // El titileo va de 0,62 a 1: por debajo la molécula desaparece y la
        // silueta se deshilacha entre cuadro y cuadro.
        const brillo = m.luz * (0.62 + 0.38 * Math.sin(t * 1.6 + m.fase * 2.3))
          * (0.55 + nivelSuave * 0.75 + extra) * I;
        if (brillo <= 0.012) continue;
        cx.fillStyle = `rgba(${m.r},${m.g},${m.b},${Math.min(0.95, brillo).toFixed(3)})`;
        cx.fillRect(x, y, m.tam, m.tam);
      }
    }

    // 4 · el núcleo del pecho: lo que late cuando habla
    {
      const late = 0.5 + 0.14 * Math.sin(t * 1.6) + nivelSuave * 0.9;
      const r = k * 0.30 * late;
      const g = cx.createRadialGradient(px, py, 0, px, py, r);
      const a = 0.38 * I * late;
      g.addColorStop(0, `rgba(225,245,255,${Math.min(0.8, a).toFixed(3)})`);
      g.addColorStop(0.3, `rgba(110,195,255,${(a * 0.42).toFixed(3)})`);
      g.addColorStop(1, 'rgba(40,120,255,0)');
      cx.fillStyle = g;
      cx.beginPath(); cx.arc(px, py, r, 0, 6.284); cx.fill();
    }

    cx.globalCompositeOperation = 'source-over';

    /* La imagen respira y se enciende con la voz, por CSS: el navegador la
       compone en la tarjeta gráfica y no cuesta cuadro. Va un punto por
       debajo de su brillo natural para que las moléculas tengan de dónde
       sumar — sin ese margen, encender no se nota. */
    if (img) {
      const respira = 1 + 0.010 * Math.sin(t / 5.5 * Math.PI * 2) + nivelSuave * 0.008;
      img.style.transform = `scale(${respira.toFixed(4)})`;
      img.style.filter = `brightness(${(0.80 + nivelSuave * 0.40).toFixed(3)}) saturate(${(1 + nivelSuave * 0.25).toFixed(3)})`;
    }
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
    if (!moleculas.length) sembrar(ancho < 700 ? CANTIDAD.movil : CANTIDAD.escritorio);
    if (quieto()) return pintarUnaVez();
    t0 = performance.now() - 1000;
    raf = requestAnimationFrame(cuadro);
  }
  function parar() { cancelAnimationFrame(raf); raf = 0; }

  // ── el trato con la consola ───────────────────────────────────────────────
  function arrancar() {
    cv = document.getElementById('presencia');
    img = document.getElementById('figura');
    if (!cv || !cv.getContext) return;
    cx = cv.getContext('2d');
    /* Las moléculas salen de los píxeles de la imagen, así que hasta que no
       esté decodificada no hay nada que sembrar. `decode()` es la espera
       correcta —`complete` puede ser cierto con la imagen a medio pintar— y
       si falla se prueba igual: el peor caso es sembrar cero y reintentar en
       el siguiente `medir()`. */
    const alCargar = () => { sembrar(ancho < 700 ? CANTIDAD.movil : CANTIDAD.escritorio); if (!raf) correr(); };
    if (img) (img.decode ? img.decode().then(alCargar, alCargar) : img.addEventListener('load', alCargar, { once: true }));
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
  const plano = (p) => {
    intensidad = p === 'portada' ? 1 : 0.3;
    const atras = p !== 'portada';
    cv?.classList.toggle('fondo', atras);
    img?.classList.toggle('fondo', atras);
    if (!raf) pintarUnaVez();
  };

  return { arrancar, nivel, estado, plano, correr, parar,
    _adentro: { encuadre, sembrar, moleculas: () => moleculas } };
})();
