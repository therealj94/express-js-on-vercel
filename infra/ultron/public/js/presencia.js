/* LA PRESENCIA DE ULTRON: la figura, en el despacho.
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
 * DE QUÉ ESTÁ HECHA, Y POR QUÉ ASÍ
 *
 * La figura es la IMAGEN que dio la Junta. Antes se dibujaba con partículas
 * en un lienzo, y era honesto decirlo: no se parecía. Un cuerpo de vidrio con
 * el rostro modelado no sale de un puñado de fórmulas; es una pieza de arte, y
 * lo que corresponde con una pieza de arte es usarla, no imitarla a medias.
 *
 * Va SIN canal alfa y compuesta con `screen`: la figura es luz sobre negro, y
 * en modo pantalla el negro desaparece solo contra el grafito de la consola.
 * Eso ahorra el canal alfa entero —178 KB en vez de 650— y deja el fondo de la
 * casa detrás de ella, no un recorte pegado encima.
 *
 * LO QUE LA HACE ESTAR VIVA es el lienzo que va DEBAJO y las transformaciones
 * de encima:
 *   · respira, siempre, muy despacio;
 *   · el aura y el núcleo del pecho crecen con la envolvente del habla, que
 *     llega por `nivel(v)` desde voz.js;
 *   · cuando piensa, un anillo recorre la figura de abajo arriba;
 *   · cuando escucha, se aquieta y se abre.
 * No es adorno: es lo que dice en qué estado está sin tener que leerlo.
 *
 * SE APAGA SOLA. Fuera del despacho, con la pestaña oculta, o si la persona
 * pidió menos movimiento, el bucle se detiene: nadie paga batería por un
 * dibujo que no está mirando.
 */
const PRESENCIA = (() => {
  'use strict';

  const GLIFOS = '01ABCDEF·ORIGEN5550AUKA8532';

  let cv = null, cx = null, img = null, alto = 0, ancho = 0, dpr = 1;
  let lluvia = [];
  let raf = 0, t0 = performance.now();
  let nivelVoz = 0, nivelSuave = 0;
  let modo = 'quieto';            // quieto · pensando · escuchando · hablando
  let intensidad = 1;             // 1 portada · 0.3 detrás del texto
  let intensidadSuave = 1;
  const quieto = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /* Dónde cae la figura dentro del área, en fracciones de su propio alto: la
     imagen se coloca con `object-fit: contain` arriba del todo, así que estos
     números salen de ella y no de la caja. El pecho es el centro del aura. */
  const PECHO = { x: 0.5, y: 0.42 };

  function medir() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    ancho = cv.clientWidth; alto = cv.clientHeight;
    // El lienzo puede estar en una vista todavía oculta: entonces mide cero y
    // no hay nada que dibujar. Se sale, y el ResizeObserver vuelve a llamar
    // aquí en cuanto el despacho se muestra.
    if (ancho < 2 || alto < 2) return false;
    cv.width = Math.round(ancho * dpr); cv.height = Math.round(alto * dpr);
    lluvia = [];
    let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
    for (let i = 0; i < Math.round(ancho / 30); i++) {
      lluvia.push({ x: rnd(), y: rnd(), v: 0.02 + rnd() * 0.05, largo: 6 + Math.floor(rnd() * 14), semilla: Math.floor(rnd() * 1000) });
    }
    return true;
  }

  // ── el dibujo: todo lo que NO es la figura ────────────────────────────────
  function cuadro(ms) {
    const t = (ms - t0) / 1000;
    nivelSuave += (nivelVoz - nivelSuave) * 0.18;
    intensidadSuave += (intensidad - intensidadSuave) * 0.06;
    const I = intensidadSuave;
    const px = ancho * PECHO.x, py = alto * PECHO.y;
    const k = Math.min(alto * 0.5, ancho * 0.5);

    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, ancho, alto);
    cx.globalCompositeOperation = 'lighter';

    // 1 · la lluvia de código, al fondo del todo
    cx.font = '11px "IBM Plex Mono", monospace';
    for (const c of lluvia) {
      const x = c.x * ancho;
      const y0 = ((c.y + t * c.v) % 1.25 - 0.15) * alto;
      for (let j = 0; j < c.largo; j++) {
        const y = y0 - j * 14;
        if (y < -14 || y > alto) continue;
        const a = (1 - j / c.largo) * 0.16 * I;
        cx.fillStyle = `rgba(120,190,255,${a.toFixed(3)})`;
        cx.fillText(GLIFOS[(c.semilla + j * 7 + Math.floor(t * 3 + j)) % GLIFOS.length], x, y);
      }
    }

    // 2 · el aura que la envuelve, que respira y crece con la voz
    {
      const late = 0.62 + 0.08 * Math.sin(t / 3.4 * Math.PI * 2) + nivelSuave * 0.5;
      const g = cx.createRadialGradient(px, py, 0, px, py, k * 1.15 * late);
      const a = 0.20 * I * (modo === 'escuchando' ? 1.25 : 1);
      g.addColorStop(0, `rgba(60,140,255,${a.toFixed(3)})`);
      g.addColorStop(0.5, `rgba(30,95,205,${(a * 0.35).toFixed(3)})`);
      g.addColorStop(1, 'rgba(20,60,160,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, ancho, alto);
    }

    // 3 · el núcleo del pecho: lo que late cuando habla
    {
      const late = 0.5 + 0.14 * Math.sin(t * 1.6) + nivelSuave * 0.9;
      const r = k * 0.30 * late;
      const g = cx.createRadialGradient(px, py, 0, px, py, r);
      const a = 0.42 * I * late;
      g.addColorStop(0, `rgba(225,245,255,${Math.min(0.85, a).toFixed(3)})`);
      g.addColorStop(0.3, `rgba(110,195,255,${(a * 0.42).toFixed(3)})`);
      g.addColorStop(1, 'rgba(40,120,255,0)');
      cx.fillStyle = g;
      cx.beginPath(); cx.arc(px, py, r, 0, 6.284); cx.fill();
    }

    // 4 · pensando: un anillo la recorre de abajo arriba, una vez cada dos
    //     segundos. Es la señal de que está trabajando, sin una sola palabra.
    if (modo === 'pensando') {
      const u = (t % 2) / 2;
      const y = alto * (0.92 - u * 0.82);
      const g = cx.createLinearGradient(0, y - 26, 0, y + 26);
      const a = 0.30 * I * Math.sin(u * Math.PI);
      g.addColorStop(0, 'rgba(120,200,255,0)');
      g.addColorStop(0.5, `rgba(150,215,255,${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(120,200,255,0)');
      cx.fillStyle = g; cx.fillRect(0, y - 26, ancho, 52);
    }

    cx.globalCompositeOperation = 'source-over';

    /* La figura misma: respira siempre y se enciende con la voz. Va por CSS
       —una transformación y un filtro— porque el navegador la compone en la
       tarjeta gráfica y no cuesta nada; dibujarla en el lienzo cuadro a cuadro
       sí costaría. */
    if (img) {
      const respira = 1 + 0.012 * Math.sin(t / 5.5 * Math.PI * 2) + nivelSuave * 0.008;
      img.style.transform = `scale(${respira.toFixed(4)})`;
      img.style.filter = `brightness(${(0.92 + nivelSuave * 0.35).toFixed(3)}) saturate(${(1 + nivelSuave * 0.25).toFixed(3)})`;
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

  return { arrancar, nivel, estado, plano, correr, parar };
})();
