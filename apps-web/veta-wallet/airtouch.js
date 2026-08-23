/* AIR TOUCH: la mano en el aire mueve la casa.
 *
 * La cámara mira la mano, MediaPipe (vendoreado, corre ENTERO en este
 * aparato: ni un cuadro de video sale del navegador) devuelve 21 puntos, y
 * este módulo los convierte en UN puntero y UN gesto:
 *
 *   · el ÍNDICE apunta — el cursor dorado lo sigue;
 *   · juntar PULGAR e ÍNDICE (pellizco) es tocar; mantenerlo y mover, agarrar.
 *
 * Dos gestos y ni uno más: la precisión viene de hacer poco y hacerlo bien.
 *
 * LO QUE HACE PRECISO A ESTE AIR TOUCH
 *
 *  · El pellizco se mide RELATIVO al tamaño de la mano (distancia pulgar-
 *    índice sobre el ancho de la palma): funciona igual cerca y lejos de la
 *    cámara.
 *  · Con HISTÉRESIS: se cierra por debajo de un umbral y recién se abre por
 *    encima de otro más alto. Sin ella, el borde del umbral parpadea y un
 *    toque se vuelve tres.
 *  · El cursor lleva un filtro «one-euro» simplificado: quieto se planta
 *    (nada de temblor), rápido responde (nada de arrastre). Es EL filtro de
 *    los sistemas de puntero en el aire.
 *  · La zona útil de la cámara es el centro del cuadro: no hay que estirar
 *    el brazo hasta el borde para llegar a una esquina de la pantalla.
 *
 * El armado pesado (wasm + modelo, ~20MB locales) se carga SOLO al activar:
 * quien nunca lo toca, nunca lo baja. Para las pruebas —y para cualquier
 * futuro control remoto— `encender({ fuente })` acepta una fuente de puntos
 * falsa: el resto del camino corre entero sin cámara.
 */
const AIRTOUCH = (() => {
  'use strict';

  const puede = () => !!(navigator.mediaDevices?.getUserMedia) && typeof WebAssembly !== 'undefined';

  let video = null, flujo = null, landmarker = null;
  let rafId = 0, corriendo = false;
  let alPunto = () => {};
  let fuenteFalsa = null;

  // ── la interpretación: de 21 puntos a un puntero y un gesto ───────────────
  /* Pura a propósito: entra la lista de landmarks (x,y en 0..1, SIN espejar),
     sale { x, y, pellizco, escala }. Las pruebas la ejercitan directo. */
  function interpretar(pts) {
    if (!pts || pts.length < 21) return null;
    // el ancho de la palma: muñeca (0) al nudillo del meñique (17)
    const palma = Math.hypot(pts[0].x - pts[17].x, pts[0].y - pts[17].y) || 0.0001;
    const pinza = Math.hypot(pts[4].x - pts[8].x, pts[4].y - pts[8].y) / palma;
    // el puntero: el nudillo del índice manda y el tip afina — el tip solo
    // tiembla más que la mano entera
    const px = pts[5].x * 0.35 + pts[8].x * 0.65;
    const py = pts[5].y * 0.35 + pts[8].y * 0.65;
    return { x: px, y: py, pinza, escala: palma };
  }

  /* La zona útil: el centro del cuadro de cámara se estira a la pantalla
     entera. El espejo va aquí (la cámara te ve al revés). */
  const estirar = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
  function aPantalla(p) {
    return {
      x: (1 - estirar(p.x, 0.18, 0.82)) * innerWidth,
      y: estirar(p.y, 0.22, 0.86) * innerHeight,
    };
  }

  // ── el filtro: quieto se planta, rápido responde ──────────────────────────
  let fx = null, fy = null;
  function suavizar(x, y, dtMs) {
    if (fx === null) { fx = x; fy = y; return { x, y }; }
    const v = Math.hypot(x - fx, y - fy) / Math.max(1, dtMs);   // px por ms
    const alfa = Math.min(0.85, 0.12 + v * 0.45);
    fx += (x - fx) * alfa;
    fy += (y - fy) * alfa;
    return { x: fx, y: fy };
  }

  // ── el gesto con histéresis ───────────────────────────────────────────────
  const CIERRA = 0.34, ABRE = 0.46;
  let pellizcado = false;

  function paso(pts, dtMs) {
    const m = interpretar(pts);
    if (!m) { alPunto({ presente: false }); return; }
    if (!pellizcado && m.pinza < CIERRA) pellizcado = true;
    else if (pellizcado && m.pinza > ABRE) pellizcado = false;
    const { x, y } = suavizar(aPantalla(m).x, aPantalla(m).y, dtMs);
    alPunto({ presente: true, x, y, pellizco: pellizcado });
  }

  // ── el motor de verdad: cámara + modelo ───────────────────────────────────
  async function armar() {
    if (landmarker) return;
    const vision = await import('./vendor/vision/vision_bundle.mjs');
    const conjunto = await vision.FilesetResolver.forVisionTasks('vendor/vision/wasm');
    landmarker = await vision.HandLandmarker.createFromOptions(conjunto, {
      baseOptions: { modelAssetPath: 'vendor/vision/hand_landmarker.task', delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  }

  async function abrirCamara() {
    flujo = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    video = document.createElement('video');
    video.muted = true; video.playsInline = true;
    video.srcObject = flujo;
    await video.play();
  }

  let ultimoTs = 0, ultimoCuadro = 0;
  function bucle(ahora) {
    rafId = 0;
    if (!corriendo) return;
    if (fuenteFalsa) {
      const pts = fuenteFalsa();
      paso(pts, ahora - (ultimoCuadro || ahora));
      ultimoCuadro = ahora;
    } else if (video && video.readyState >= 2) {
      // el timestamp tiene que crecer SIEMPRE o el modelo se niega
      const ts = Math.max(ultimoTs + 1, Math.round(ahora));
      ultimoTs = ts;
      const r = landmarker.detectForVideo(video, ts);
      paso(r?.landmarks?.[0] || null, ahora - (ultimoCuadro || ahora));
      ultimoCuadro = ahora;
    }
    rafId = requestAnimationFrame(bucle);
  }

  /**
   * Enciende. `alCambiar` recibe {presente,x,y,pellizco} en cada cuadro.
   * `fuente` (opcional, pruebas) reemplaza cámara y modelo: una función que
   * devuelve la lista de landmarks de ese instante, o null.
   * Los fallos se lanzan con nombre: 'negado', 'sin-camara', 'sin-modelo'.
   */
  async function encender({ alCambiar, fuente } = {}) {
    if (corriendo) return;
    alPunto = alCambiar || (() => {});
    fuenteFalsa = fuente || null;
    if (!fuenteFalsa) {
      try { await abrirCamara(); } catch (e) {
        const negado = /NotAllowed|Permission/i.test(String(e?.name || e));
        const err = new Error(negado ? 'negado' : 'sin-camara');
        err.motivo = negado ? 'negado' : 'sin-camara';
        throw err;
      }
      try { await armar(); } catch (e) {
        apagar();
        const err = new Error('sin-modelo');
        err.motivo = 'sin-modelo'; err.causa = e;
        throw err;
      }
    }
    corriendo = true;
    fx = fy = null; pellizcado = false; ultimoTs = 0; ultimoCuadro = 0;
    rafId = requestAnimationFrame(bucle);
  }

  function apagar() {
    corriendo = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    try { flujo?.getTracks().forEach(t => t.stop()); } catch { /* nada */ }
    flujo = null; video = null;
    // el landmarker se conserva: volver a encender no re-baja 20MB
    alPunto = () => {}; fuenteFalsa = null;
  }

  const activo = () => corriendo;

  return { puede, encender, apagar, activo, interpretar };
})();

if (typeof window !== 'undefined') window.AIRTOUCH = AIRTOUCH;
