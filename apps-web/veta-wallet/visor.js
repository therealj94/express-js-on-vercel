/* MODO VISOR · la casa dentro de un visor.
 *
 * ══ QUÉ VISORES ═══════════════════════════════════════════════════════════
 *
 * Los tres que existen de verdad, y ninguno se queda fuera:
 *
 *   · WEBXR — Quest, Pico, Vive, Wolvic, un PC con SteamVR. El navegador
 *     entrega la sesión inmersiva, las dos cámaras y la cabeza. Seis grados
 *     de libertad: uno se agacha y la galaxia se queda quieta.
 *   · CARTÓN — el teléfono metido en una caja (Cardboard y sus primos). No
 *     hay WebXR: hay pantalla partida en dos ojos, giroscopio para la cabeza
 *     y selección POR MIRADA, porque con el aparato en la cara no hay dedo
 *     que llegue a la pantalla.
 *   · TRESCIENTOS SESENTA — sin visor: mirar alrededor en la pantalla, con
 *     el giroscopio si lo hay o con el dedo si no. Sirve para probar y para
 *     quien quiera asomarse sin ponerse nada.
 *
 * ══ LO QUE NO SE HACE CON UN VISOR PUESTO ═════════════════════════════════
 *
 * NO SE MUEVE DINERO. Se mira, se recorre, se abre una casa de las que solo
 * informan. Firmar un envío con la cara tapada, sin poder leer la letra
 * chica y sin teclado es la clase de comodidad que termina en un
 * arrepentimiento caro. La wallet, los cobros y el cambio quedan fuera del
 * modo visor A PROPÓSITO, y cuando la mirada cae sobre una de esas casas se
 * dice por qué.
 *
 * ══ SALIR SIEMPRE SE PUEDE ════════════════════════════════════════════════
 *
 * Un modo del que no se sale es una trampa. Se sale con el botón, con Escape,
 * quitándose el visor (WebXR avisa), girando el teléfono a vertical, o
 * tocando la pantalla con dos dedos. Cualquiera de esas cinco.
 */
const VISOR = (() => {
  'use strict';

  const $ = (s) => document.querySelector(s);

  let estado = { activo: false, modo: null, ojos: 0.064, mirada: true, giro: true };
  let alCambiar = null;
  let salirReloj = null;

  /* Lo que este aparato PUEDE. Se pregunta antes de ofrecer nada: prometer un
     modo que no existe aquí es peor que no ofrecerlo. */
  async function detectar() {
    const motor = window.__AE_VISOR;
    const base = { xr: false, giroscopio: false, pidePermiso: false, motor: !!motor };
    if (!motor) {
      /* Sin el cielo 3D montado no hay a quién preguntar, pero las capacidades
         del navegador se saben igual. */
      const xr = navigator.xr;
      try { base.xr = !!(xr && await xr.isSessionSupported('immersive-vr')); } catch { /* nada */ }
      base.giroscopio = typeof DeviceOrientationEvent !== 'undefined';
      base.pidePermiso = typeof DeviceOrientationEvent?.requestPermission === 'function';
      return base;
    }
    return { ...(await motor.detectar()), motor: true };
  }

  /* Qué modo conviene con lo que hay. El orden no es capricho: un visor de
     verdad siempre gana, y el cartón solo si el aparato tiene giroscopio y
     además es un teléfono (en un escritorio, partir la pantalla en dos no
     ayuda a nadie). */
  function modoSugerido(cap) {
    if (cap.xr) return 'xr';
    const telefono = matchMedia('(pointer: coarse)').matches && cap.giroscopio;
    return telefono ? 'carton' : 'trescientos60';
  }

  /* ── EL PERMISO DEL GIROSCOPIO ────────────────────────────────────────────
   *
   * EN IOS ESTO SE PIDE DENTRO DEL GESTO O NO SE PIDE. Safari exige que
   * `requestPermission()` salga del propio manejador del toque: basta un
   * `await` a cualquier otra cosa antes —una comprobación de WebXR, una
   * espera para cambiar de vista— y la llamada se rechaza con NotAllowed. Ese
   * era exactamente el fallo: se pedía después de una espera de segundo y
   * medio, iOS decía que no, y la cabeza no movía nada sin que nadie dijera
   * por qué.
   *
   * Por eso vive aparte de entrar(): la casa lo llama DE PRIMERO, pegado al
   * toque, y el resultado queda guardado para cuando el modo arranque de
   * verdad. Y se pide UNA vez: iOS no vuelve a preguntar y repetirlo solo
   * gasta la respuesta guardada. */
  let permiso = null;              // null = sin preguntar, true/false = respuesta
  async function pedirGiro() {
    if (permiso !== null) return permiso;
    if (typeof DeviceOrientationEvent?.requestPermission !== 'function') {
      // Android y escritorio no preguntan: si hay sensor, hay sensor
      permiso = typeof DeviceOrientationEvent !== 'undefined';
      return permiso;
    }
    try { permiso = (await DeviceOrientationEvent.requestPermission()) === 'granted'; }
    catch { permiso = false; }
    return permiso;
  }
  const permisoGiro = pedirGiro;

  async function pantallaCompleta() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && (el.requestFullscreen || el.webkitRequestFullscreen))
        await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch { /* un navegador puede negarse; el modo funciona igual */ }
    /* Acostado, que es como se sostiene un visor. Si el navegador no deja
       bloquear la orientación, no pasa nada: se avisa en pantalla. */
    try { await screen.orientation?.lock?.('landscape'); } catch { /* nada */ }
  }

  /** Entra al modo. `modo` opcional: si no se dice, se elige el mejor. */
  async function entrar(modo) {
    if (estado.activo) return estado.modo;
    const motor = window.__AE_VISOR;
    if (!motor) throw new Error('sin-cielo');
    const cap = await detectar();
    const elegido = modo || modoSugerido(cap);

    if (elegido !== 'xr') {
      /* El permiso ya se pidió pegado al toque (pedirGiro). Si nadie lo pidió
         —una llamada desde una prueba, un camino nuevo— se intenta aquí como
         red de seguridad, sabiendo que en iOS puede llegar tarde. */
      if (permiso === null) await pedirGiro();
      await pantallaCompleta();
    }
    await motor.entrar(elegido, { ojos: estado.ojos, mirada: estado.mirada });

    estado = { ...estado, activo: true, modo: elegido, giro: true };
    delete document.body.dataset.visorGiro;
    document.body.classList.add('en-visor');
    document.body.dataset.visor = elegido;
    pintarCapa();
    engancharSalidas();
    alCambiar?.(estado);
    return elegido;
  }

  function salir() {
    if (!estado.activo) return;
    /* Ya se está saliendo: la marca evita el ida y vuelta cuando la salida
       viene del motor (quitarse el visor) y no de la casa. */
    estado.activo = false;
    /* NADA DEL VISOR SOBREVIVE A LA SALIDA. El pórtico, las palabras en la
       escena y el blindaje de la mirada existen solo con el aparato puesto:
       dejarlos colgados sería devolver la casa con la mirada muerta y un
       cartel flotando en medio del cielo. */
    try { window.__AE_PORTICO?.(null); } catch { /* nada */ }
    /* La casa abierta dentro de la escena también: quitarse el visor con un
       panel puesto dejaría un cartel de la billetera flotando en medio del
       cielo de la pantalla, sin botones que respondan. Ver Casa.tsx. */
    try { window.__AE_CASA?.(null); } catch { /* nada */ }
    try { window.__AE_DECIR?.(null); } catch { /* nada */ }
    window.__AE_BLINDADO = false;
    try { window.__AE_GENESIS?.saltar(); } catch { /* nada */ }
    try { window.__AE_VISOR?.salir(); } catch { /* nada */ }
    estado = { ...estado, activo: false, modo: null };
    document.body.classList.remove('en-visor');
    delete document.body.dataset.visor;
    $('#visor-capa')?.remove();
    soltarSalidas();
    try { screen.orientation?.unlock?.(); } catch { /* nada */ }
    try { if (document.fullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    catch { /* nada */ }
    alCambiar?.(estado);
  }

  /* ── LAS CINCO SALIDAS ────────────────────────────────────────────────── */
  const porTecla = (e) => { if (e.key === 'Escape') salir(); };
  const porGiroPantalla = () => {
    /* De vuelta a vertical: quien saca el teléfono de la caja lo pone
       derecho. Con un respiro, que girar sin querer no eche a nadie. */
    if (estado.modo !== 'carton') return;
    clearTimeout(salirReloj);
    if (innerHeight > innerWidth) salirReloj = setTimeout(salir, 900);
  };
  const porDosDedos = (e) => { if (e.touches && e.touches.length >= 2) salir(); };
  const porPantallaCompleta = () => {
    // salir de pantalla completa por el gesto del sistema también sale del modo
    if (estado.activo && estado.modo !== 'xr' && !document.fullscreenElement) salir();
  };

  /* SIN CABEZA. El motor avisa cuando el vigía no vio llegar ni un evento de
     orientación: ahí se marca el modo para que la capa lo diga y la persona
     sepa que puede mirar con el dedo. */
  let alSinGiro = null;
  addEventListener('ae-visor-sin-giro', () => {
    if (!estado.activo) return;
    estado.giro = false;
    document.body.dataset.visorGiro = 'no';
    const pista = document.querySelector('#visor-capa .vs-pista');
    if (pista) {
      const dice = (k, alt) => { try { return typeof t === 'function' ? t(k) : alt; } catch { return alt; } };
      pista.textContent = dice('vs.sinGiro', '');
      pista.classList.add('vs-aviso-giro');
    }
    alSinGiro?.();
  });

  /* La sexta salida, la que no elige nadie: el visor terminó la sesión por su
     cuenta —alguien se lo quitó, el sistema lo apagó, se acabó la batería—.
     El motor lo grita y la casa se recompone sola. */
  const porFinDelMotor = () => { if (estado.activo) salir(); };
  addEventListener('ae-visor-fuera', porFinDelMotor);

  function engancharSalidas() {
    addEventListener('keydown', porTecla);
    addEventListener('resize', porGiroPantalla);
    addEventListener('touchstart', porDosDedos, { passive: true });
    addEventListener('fullscreenchange', porPantallaCompleta);
  }
  function soltarSalidas() {
    removeEventListener('keydown', porTecla);
    removeEventListener('resize', porGiroPantalla);
    removeEventListener('touchstart', porDosDedos);
    removeEventListener('fullscreenchange', porPantallaCompleta);
    clearTimeout(salirReloj);
  }

  /* La capa de la casa mientras el visor está puesto: el botón de salir y la
     línea que recuerda cómo se sale. En XR no se pinta nada — ahí la pantalla
     del teléfono no se ve, y lo que manda es la escena. */
  function pintarCapa() {
    $('#visor-capa')?.remove();
    if (estado.modo === 'xr') return;
    const capa = document.createElement('div');
    capa.id = 'visor-capa';
    const dice = (k, alt) => { try { return typeof t === 'function' ? t(k) : alt; } catch { return alt; } };
    capa.innerHTML = `
      <button class="vs-salir" type="button" aria-label="${dice('vs.entrar', 'Salir')}">✕</button>
      <button class="vs-centrar" type="button">⌖</button>
      <div class="vs-pista">${dice('vs.salirP', '')}</div>`;
    capa.querySelector('.vs-salir').addEventListener('click', salir);
    /* Recentrar el frente: quien se sentó girado necesita decir «esto de aquí
       es el frente» sin levantarse de la silla. */
    capa.querySelector('.vs-centrar').addEventListener('click', recentrar);
    document.body.appendChild(capa);
  }

  const activo = () => estado.activo;
  const modo = () => estado.modo;
  const ver = () => ({ ...estado });

  function ojos(v) {
    estado.ojos = Math.max(0.02, Math.min(0.12, Number(v) || 0.064));
    try { window.__AE_VISOR?.ojos(estado.ojos); } catch { /* nada */ }
    return estado.ojos;
  }
  function mirada(v) {
    estado.mirada = !!v;
    try { window.__AE_VISOR?.mirada(estado.mirada); } catch { /* nada */ }
    return estado.mirada;
  }
  function recentrar() { try { window.__AE_VISOR?.recentrar(); } catch { /* nada */ } }

  return { detectar, modoSugerido, entrar, salir, activo, modo, ver, ojos, mirada, recentrar,
           pedirGiro, hayGiro: () => estado.giro !== false,
           alCambiar: (fn) => { alCambiar = fn; },
           alSinGiro: (fn) => { alSinGiro = fn; } };
})();

if (typeof window !== 'undefined') window.VISOR = VISOR;
