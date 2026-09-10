/* LA CONSTELACIÓN · el ecosistema explicado en una sola imagen
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 *
 * Orden Global ya piensa en planetas. La app y la billetera dibujan el mismo
 * mapa —`orden-global-app/src/og/Nucleo.js` y el bloque MUNDOS de
 * `apps-web/veta-wallet/app.js`— con una posición, un degradado y un halo por
 * casa, y con una regla escrita: la gente reconoce por SITIO y por COLOR antes
 * que por el nombre.
 *
 * La web pública, mientras tanto, los dibujaba como ocho rectángulos con una
 * pastilla verde de estado. Contradecía al producto en su propia portada, y de
 * paso era lo que más cara de plantilla tenía de toda la página.
 *
 * Aquí los planetas son planetas. Las coordenadas y los colores son los de
 * allá, sin retocar: quien vio la constelación en la app la reconoce aquí.
 *
 * ── AU-RA ES EL SOL ─────────────────────────────────────────────────────────
 *
 * No es una metáfora de folleto: es lo único del ecosistema que toca a todas
 * las casas —contesta por WhatsApp, en la web y en la app, con el precio de la
 * cadena— y es lo primero con lo que habla alguien que llega. En el centro, y
 * todo lo demás girando.
 *
 * ── POR QUÉ NO ES THREE.JS ──────────────────────────────────────────────────
 *
 * Porque el ecosistema YA tiene su 3D de verdad —AuGalaxy, con Three.js— y
 * vive DENTRO de la app, que es donde se justifica: ahí la persona ya entró y
 * va a quedarse. Novecientos kilobytes de motor 3D para ocho esferas en la
 * portada se los paga quien llega con datos móviles en Tegucigalpa, y se los
 * paga ANTES de saber qué vendemos. Esto son doce kilobytes de canvas y hace
 * lo que tiene que hacer: profundidad de verdad —órbitas inclinadas, tamaño y
 * brillo por distancia, los de atrás pasando por detrás del sol—, sesenta
 * cuadros y cero dependencias, que es la regla de esta web.
 *
 * Las etiquetas NO se pintan en el lienzo: son enlaces del documento que se
 * mueven con su planeta. Un planeta que no se puede tocar con el teclado ni
 * leer con un lector de pantalla es una decoración, no un menú.
 */
(function () {
  'use strict';

  var QUIETO = matchMedia('(prefers-reduced-motion: reduce)');

  /* Las casas, con los colores del mapa de la app. El orden es el orden de
     las órbitas: de dentro hacia fuera. `r` es el radio en tanto por uno del
     lado corto, `v` la vuelta en segundos y `f` la fase de arranque, para que
     no salgan todas alineadas como un desfile. */
  /* ── POR QUÉ GIRAN TODAS AL MISMO PASO ────────────────────────────────────
     La primera versión le dio a cada casa su propia vuelta (42 s, 58, 72…) y
     su propia fase, buscando que no salieran «alineadas como un desfile». El
     resultado en pantalla fue el contrario del que se buscaba: con periodos
     distintos las casas se alcanzan unas a otras, y cada pocos segundos tres
     o cuatro se amontonan en el mismo rincón con los rótulos encima. José lo
     vio en el teléfono: «los planetas organiza, se vean mejor ordenados
     orbitando».

     Ahora el sistema gira RÍGIDO: una sola vuelta para todas y las fases
     repartidas en séptimos exactos. Nunca se juntan, la separación entre dos
     vecinas es siempre la misma, y aun así el conjunto se mueve —y la
     inclinación sigue metiendo a unas por detrás del sol y trayendo a otras
     al frente, que es de donde sale el volumen.

     Esto es un mapa antes que una simulación. Un mapa que se lee es mejor
     que una física que se amontona. */
  var VUELTA = 168;        // segundos que tarda el sistema en dar la vuelta
  var CASAS = [
    { id: 'wallet',  r: 0.40, tam: 0.94,
      grad: ['#F8EFCF', '#DFC078', '#96793F'], halo: '#EAD79C' },
    { id: 'chat',    r: 0.50, tam: 0.76,
      grad: ['#FBE0D4', '#E0937A', '#8A4A38'], halo: '#E0937A' },
    { id: 'gid',     r: 0.60, tam: 0.74,
      grad: ['#D6EBE2', '#63A493', '#123B39'], halo: '#7FD8C4' },
    { id: 'pay',     r: 0.70, tam: 0.72,
      grad: ['#D8F7FF', '#5FC6EA', '#453398'], halo: '#5FC6EA' },
    { id: 'scan',    r: 0.80, tam: 0.66,
      grad: ['#D6F3EC', '#74E6C8', '#1B5A50'], halo: '#74E6C8' },
    { id: 'ordenex', r: 0.90, tam: 0.64,
      grad: ['#DCD4F2', '#8D7EC9', '#372B63'], halo: '#A99CDE' },
    { id: 'aucorp',  r: 1.00, tam: 0.62,
      grad: ['#E8E0C8', '#A5936A', '#463B24'], halo: '#CBBB8C' },
  ];
  // Las fases, en séptimos exactos y sin tocar a mano.
  CASAS.forEach(function (casa, i) { casa.v = VUELTA; casa.f = i / CASAS.length; });


  /* Cuánto se aplasta la órbita. En una pantalla ancha, 0,30 es una vista de
     tres cuartos y de ahí sale el volumen. En uno de 390 px eso deja el
     sistema en una franja de cien píxeles con un descampado debajo: en
     vertical sobra sitio y en horizontal no hay. Así que en el teléfono la
     elipse se abre y el sistema se mira más de frente. */
  var APLASTE = 0.30;
  var lienzo, ctx, ancho, alto, escala, rafId = 0, t0 = 0;
  var SECTORES = 8;        // ocho ángulos de luz por casa, elegidos por posición
  var bolas = {};          // cada esfera pintada UNA vez por sector y luego estampada
  var corona = null;
  var raton = { x: 0, y: 0, ax: 0, ay: 0 };
  var etiquetas = [];      // los rótulos del documento, uno por casa
  var fichas = [];         // la ficha de cada casa
  var solTexto = null;
  var ultima = null;       // la que se está cerrando, para que vuelva volando
  var campo, enLista = function () { return false; };

  /* ── ABRIR UNA CASA ───────────────────────────────────────────────────────
     Tocar un planeta no lleva a otra página: la trae AQUÍ. El planeta deja su
     órbita y se viene al frente mientras el resto del sistema se apaga y se
     aparta, y al lado se abre su ficha. Es el mismo gesto que hace la app al
     entrar a una casa desde el Núcleo, y es lo que convierte el dibujo en un
     menú: se entiende qué hace cada casa sin salir de la portada.

     `foco` va de 0 a 1 y lo mueve el reloj del propio bucle, no una
     transición de CSS: lo que se anima vive en el lienzo. */
  var abierta = null;      // id de la casa abierta, o null
  var foco = 0;            // 0 fuera, 1 abierta del todo
  var focoVa = 0;          // hacia dónde va
  var VUELO = 0.055;       // cuánto se acerca por cuadro: ~700 ms de viaje

  /* Una esfera de verdad: la luz no viene de frente sino de arriba a la
     izquierda, que es lo que separa una pelota de un círculo de color. */
  function pintarBola(casa, lado, luzX, luzY) {
    var c = document.createElement('canvas');
    c.width = c.height = lado;
    var x = c.getContext('2d');
    var m = lado / 2, rad = lado * 0.34;

    var halo = x.createRadialGradient(m, m, rad * 0.75, m, m, m);
    halo.addColorStop(0, casa.halo + '55');
    halo.addColorStop(0.45, casa.halo + '18');
    halo.addColorStop(1, casa.halo + '00');
    x.fillStyle = halo;
    x.fillRect(0, 0, lado, lado);

    /* El foco del degradado se corre hacia el sol: eso es lo que hace que la
       bola parezca iluminada POR AU-RA y no por una lámpara de estudio. */
    var g = x.createRadialGradient(m + rad * 0.46 * (luzX || 0),
                                   m + rad * 0.46 * (luzY || -1), rad * 0.06,
                                   m, m, rad);
    g.addColorStop(0, casa.grad[0]);
    g.addColorStop(0.42, casa.grad[1]);
    g.addColorStop(1, casa.grad[2]);
    x.beginPath();
    x.arc(m, m, rad, 0, Math.PI * 2);
    x.fillStyle = g;
    x.fill();

    /* El filo iluminado, del lado del sol. Antes era un arco blanco opaco a
       0,5 que no se fundía con el degradado y quedaba como una ceja despegada
       flotando sobre cada bola; ahora se suma a la luz y muere en los
       extremos. */
    var ang = Math.atan2(luzY || -1, luzX || 0);
    x.save();
    x.globalCompositeOperation = 'lighter';
    var filo = x.createLinearGradient(m + Math.cos(ang) * rad, m + Math.sin(ang) * rad,
                                      m - Math.cos(ang) * rad, m - Math.sin(ang) * rad);
    filo.addColorStop(0, 'rgba(255,255,255,.34)');
    filo.addColorStop(0.55, 'rgba(255,255,255,.05)');
    filo.addColorStop(1, 'rgba(255,255,255,0)');
    x.beginPath();
    x.arc(m, m, rad * 0.985, ang - Math.PI * 0.42, ang + Math.PI * 0.42);
    x.strokeStyle = filo;
    x.lineWidth = Math.max(1, rad * 0.05);
    x.stroke();
    x.restore();
    return c;
  }

  /* El sol: AU-RA. Núcleo blanco cálido, corona de oro y dos anillos tenues
     que le dan tamaño sin taparle nada a los planetas. */
  function pintarCorona(lado) {
    var c = document.createElement('canvas');
    c.width = c.height = lado;
    var x = c.getContext('2d');
    var m = lado / 2;
    var g = x.createRadialGradient(m, m, 0, m, m, m);
    g.addColorStop(0, 'rgba(255,251,238,.98)');
    g.addColorStop(0.055, 'rgba(248,239,207,.92)');
    g.addColorStop(0.13, 'rgba(232,200,122,.42)');
    g.addColorStop(0.30, 'rgba(201,169,97,.16)');
    g.addColorStop(0.62, 'rgba(201,169,97,.05)');
    g.addColorStop(1, 'rgba(201,169,97,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, lado, lado);
    return c;
  }

  function medir() {
    if (!campo) return;
    var caja = (campo.querySelector('.campo') || campo).getBoundingClientRect();
    var dpr = Math.min(devicePixelRatio || 1, 2);
    ancho = caja.width; alto = caja.height;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    lienzo.style.width = ancho + 'px';
    lienzo.style.height = alto + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* La órbita está APLASTADA, así que lo que la limita no es el lado corto
       sino el ancho: midiendo por el lado corto el sistema salía diminuto en
       una pantalla ancha, apelotonado en el centro y con los rótulos unos
       encima de otros. Se mide por los dos ejes, cada uno con lo que de
       verdad ocupa, y manda el que se quede corto. */
    APLASTE = ancho < 560 ? 0.58 : (ancho < 900 ? 0.42 : 0.30);
    var FUERA = CASAS[CASAS.length - 1].r;
    escala = Math.min(ancho * 0.42 / FUERA, (alto * 0.44) / (FUERA * APLASTE));
    /* Las esferas, más chicas que la primera versión: a 0,44 la de Veta
       Wallet se comía al sol y el sistema parecía un racimo. */
    var lado = Math.round(escala * 0.30);
    bolas = {};
    CASAS.forEach(function (casa) {
      bolas[casa.id] = [];
      for (var i = 0; i < SECTORES; i++) {
        var a = (i / SECTORES) * Math.PI * 2;
        bolas[casa.id].push(pintarBola(casa, lado, Math.cos(a), Math.sin(a)));
      }
    });
    corona = pintarCorona(Math.round(
      Math.min(escala * 2.4, Math.min(ancho, alto) * 1.02)));
  }

  function sitio(casa, t) {
    var ang = (t / casa.v + casa.f) * Math.PI * 2;
    return {
      x: ancho / 2 + Math.cos(ang) * casa.r * escala,
      y: alto / 2 + Math.sin(ang) * casa.r * escala * APLASTE,
      /* La profundidad. Detrás del sol se ve más chico y más apagado, y se
         dibuja ANTES que el sol para que pase por detrás de verdad. */
      z: Math.sin(ang),
    };
  }

  /* Dónde se para el planeta que se abre. En pantalla ancha se corre a la
     izquierda para dejarle sitio a la ficha; en una angosta se queda arriba y
     la ficha va debajo. */
  function parada() {
    /* `tam` es el multiplicador de la estampa, no un tamaño en píxeles: la
       esfera dibujada mide `lado * 0.68`. Puesto a ojo la primera vez, el
       planeta abierto salía de mil píxeles y se comía la pantalla. Aquí se
       pide una fracción del alto del campo y se despeja el multiplicador. */
    var esfera = escala * 0.30 * 0.68;          // lo que mide a escala 1
    var quiero = ancho > 900 ? alto * 0.42 : alto * 0.30;
    return ancho > 900
      ? { x: ancho * 0.28, y: alto * 0.48, tam: quiero / esfera }
      : { x: ancho * 0.50, y: alto * 0.30, tam: quiero / esfera };
  }

  var suave = function (p) { return p < 0.5 ? 4 * p * p * p
                                            : 1 - Math.pow(-2 * p + 2, 3) / 2; };

  function cuadro(ahora) {
    var t = (ahora - t0) / 1000;
    ctx.clearRect(0, 0, ancho, alto);

    // El ratón mueve el sistema un pelo: paralaje, no un juguete.
    raton.ax += (raton.x - raton.ax) * 0.06;
    raton.ay += (raton.y - raton.ay) * 0.06;
    ctx.save();
    ctx.translate(raton.ax * 14, raton.ay * 9);

    // El vuelo hacia la casa abierta, o de vuelta.
    foco += (focoVa - foco) * VUELO;
    if (Math.abs(focoVa - foco) < 0.002) foco = focoVa;
    var f = suave(Math.max(0, Math.min(1, foco)));
    var meta = f > 0 ? parada() : null;

    var puestos = CASAS.map(function (casa) {
      var p = sitio(casa, t);
      p.casa = casa;
      p.esc = casa.tam * (0.78 + (p.z + 1) * 0.16);   // más grande al venir hacia adelante
      p.luz = 0.52 + (p.z + 1) * 0.24;
      if (f > 0) {
        if (casa.id === abierta || (casa.id === ultima && focoVa === 0)) {
          // La elegida: deja la órbita y se viene al frente, creciendo.
          p.x += (meta.x - p.x) * f;
          p.y += (meta.y - p.y) * f;
          p.esc += (meta.tam - p.esc) * f;
          p.luz = p.luz + (1 - p.luz) * f;
          p.z = 1;                       // siempre delante del sol
        } else {
          // Las demás siguen girando, pero se apartan y se apagan.
          p.x = ancho / 2 + (p.x - ancho / 2) * (1 + 0.22 * f);
          p.y = alto / 2 + (p.y - alto / 2) * (1 + 0.22 * f);
          p.luz *= 1 - 0.82 * f;
        }
      }
      return p;
    });

    // Las órbitas, finísimas. Son la mitad de por qué el dibujo se lee.
    ctx.lineWidth = 1;
    CASAS.forEach(function (casa) {
      ctx.beginPath();
      ctx.ellipse(ancho / 2, alto / 2, casa.r * escala, casa.r * escala * APLASTE,
                  0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(201,169,97,' + (0.085 * (1 - f * 0.85)).toFixed(3) + ')';
      ctx.stroke();
    });

    var detras = puestos.filter(function (p) { return p.z < 0; });
    var delante = puestos.filter(function (p) { return p.z >= 0; });

    function estampar(p) {
      var lote = bolas[p.casa.id];
      if (!lote) return;
      // Hacia dónde le da el sol a ESTE planeta, desde donde está ahora.
      var ax = Math.atan2(alto / 2 - p.y, ancho / 2 - p.x);
      var b = lote[((Math.round(ax / (Math.PI * 2) * SECTORES) % SECTORES) + SECTORES) % SECTORES];
      if (!b) return;
      var l = b.width * p.esc;
      ctx.globalAlpha = p.luz;
      ctx.drawImage(b, p.x - l / 2, p.y - l / 2, l, l);
      ctx.globalAlpha = 1;
    }

    detras.forEach(estampar);

    if (corona) {
      var l = corona.width;
      // Late despacio: es una estrella, no un aviso.
      var late = 1 + Math.sin(t * 0.55) * 0.022;
      // Con una casa abierta, el sol se retira: la protagonista es ella.
      ctx.globalAlpha = 1 - 0.72 * f;
      ctx.drawImage(corona, ancho / 2 - (l * late) / 2, alto / 2 - (l * late) / 2,
                    l * late, l * late);
      ctx.globalAlpha = 1;
    }

    delante.forEach(estampar);
    ctx.restore();

    // El sol también se aparta como rótulo.
    if (solTexto) solTexto.style.opacity = (1 - f).toFixed(2);

    // Y los rótulos se van con su planeta. En modo lista no se mueven —están
    // en el flujo, debajo— pero el bucle NO se corta aquí: cortarlo mataba la
    // animación entera en el teléfono.
    if (!enLista()) puestos.forEach(function (p) {
      var e = etiquetas[CASAS.indexOf(p.casa)];
      if (!e) return;
      var suya = p.casa.id === abierta || (p.casa.id === ultima && focoVa === 0);
      /* Colgado del borde de la esfera y no de su centro: el radio cambia con
         la pantalla y con la profundidad, así que un desplazamiento fijo deja
         el nombre escrito dentro de la bola en cuanto la bola crece. */
      var radio = (bolas[p.casa.id] ? bolas[p.casa.id][0].width : 0) * p.esc * 0.34;
      e.style.transform = 'translate(-50%,0) translate('
        + (p.x + raton.ax * 14) + 'px,' + (p.y + raton.ay * 9 + radio + 10) + 'px)';
      // La abierta se lleva su rótulo debajo, más grande; las otras se apagan.
      e.style.opacity = suya ? '1' : (( 0.5 + (p.z + 1) * 0.25) * (1 - f)).toFixed(2);
      e.style.zIndex = suya ? 4 : (p.z >= 0 ? 3 : 1);
      e.classList.toggle('abierta', suya && f > 0.2);
      e.style.pointerEvents = f > 0.2 && !suya ? 'none' : '';
    });

    if (!QUIETO.matches) rafId = requestAnimationFrame(cuadro);
  }

  /* Abrir y cerrar. La ficha se enseña con `hidden`, que es lo que entienden
     los lectores de pantalla, y el foco del teclado se va a su título: quien
     navega sin ratón tiene que llegar a lo que acaba de abrir. */
  function abrir(id) {
    if (abierta === id) return cerrar();
    abierta = id; ultima = id; focoVa = 1;
    latir();
    CASAS.forEach(function (casa, i) {
      var f = fichas[i], e = etiquetas[i];
      if (f) f.hidden = casa.id !== id;
      if (e) e.setAttribute('aria-expanded', String(casa.id === id));
    });
    campo.classList.add('con-casa');
    var f = fichas[CASAS.map(function (c) { return c.id; }).indexOf(id)];
    if (f) { var h = f.querySelector('h3'); if (h) h.focus({ preventScroll: true }); }
  }

  function cerrar() {
    if (!abierta) return;
    var id = abierta;
    abierta = null; focoVa = 0;
    latir();
    fichas.forEach(function (f) { if (f) f.hidden = true; });
    etiquetas.forEach(function (e) { if (e) e.setAttribute('aria-expanded', 'false'); });
    campo.classList.remove('con-casa');
    var e = etiquetas[CASAS.map(function (c) { return c.id; }).indexOf(id)];
    if (e) e.focus({ preventScroll: true });
  }

  function enchufarAperturas() {
    CASAS.forEach(function (casa, i) {
      var e = etiquetas[i];
      if (e && !e._enchufado) {
        e._enchufado = true;
        e.addEventListener('click', function (ev) { ev.preventDefault(); abrir(casa.id); });
      }
      var f = fichas[i];
      if (f && !f._enchufado) {
        f._enchufado = true;
        var x = f.querySelector('.cerrar');
        if (x) x.addEventListener('click', cerrar);
      }
    });
    if (!campo._teclas) {
      campo._teclas = true;
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && abierta) cerrar();
      });
      // Tocar el vacío del cielo también cierra: es lo que espera la mano.
      campo.addEventListener('click', function (ev) {
        if (abierta && (ev.target === campo || ev.target.tagName === 'CANVAS'
            || ev.target.classList.contains('campo'))) cerrar();
      });
    }
  }

  /* Con movimiento reducido el bucle está parado: cada apertura pinta los
     cuadros que hagan falta para que el vuelo se vea igual, solo que sin
     animación continua de fondo. */
  function latir() {
    if (!QUIETO.matches || rafId) return;
    var pasos = 0;
    (function paso() {
      cuadro(performance.now());
      if (++pasos < 40 && Math.abs(focoVa - foco) > 0.004) requestAnimationFrame(paso);
      else cuadro(performance.now());
    })();
  }

  function arrancar() {
    campo = document.getElementById('constelacion');
    if (!campo) return;
    lienzo = campo.querySelector('canvas');
    /* En el teléfono los siete rótulos alrededor de una elipse de trescientos
       píxeles se pisan unos a otros, y un rótulo ilegible es peor que ninguno.
       Allí el sistema se queda como dibujo y los nombres bajan a una lista de
       verdad; la hoja de estilo lo dice con --modo y aquí solo se obedece. */
    enLista = function () {
      return getComputedStyle(campo).getPropertyValue('--modo').trim() === 'lista';
    };
    if (!lienzo || !lienzo.getContext) return;
    ctx = lienzo.getContext('2d');
    etiquetas = CASAS.map(function (casa) {
      return campo.querySelector('.orbe[data-casa="' + casa.id + '"]');
    });
    fichas = CASAS.map(function (casa) {
      return campo.querySelector('.ficha[data-casa="' + casa.id + '"]');
    });
    solTexto = campo.querySelector('.sol');
    enchufarAperturas();
    medir();
    t0 = performance.now();

    addEventListener('resize', function () {
      clearTimeout(arrancar._r);
      arrancar._r = setTimeout(function () { medir(); if (QUIETO.matches) cuadro(performance.now()); }, 160);
    });

    /* Con movimiento reducido se pinta UN cuadro y se deja quieto. La imagen
       sigue estando; lo que se va es el giro. */
    if (QUIETO.matches) { cuadro(performance.now()); return; }

    campo.addEventListener('pointermove', function (e) {
      var c = campo.getBoundingClientRect();
      raton.x = ((e.clientX - c.left) / c.width - 0.5) * 2;
      raton.y = ((e.clientY - c.top) / c.height - 0.5) * 2;
    });
    campo.addEventListener('pointerleave', function () { raton.x = raton.y = 0; });

    /* Fuera de la pantalla no se dibuja. Un lienzo girando en una sección que
       nadie está mirando es batería de alguien. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (fs) {
        fs.forEach(function (f) {
          if (f.isIntersecting && !rafId) { t0 = performance.now() - 1; rafId = requestAnimationFrame(cuadro); }
          else if (!f.isIntersecting && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        });
      }, { threshold: 0 }).observe(campo);
    } else {
      rafId = requestAnimationFrame(cuadro);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
