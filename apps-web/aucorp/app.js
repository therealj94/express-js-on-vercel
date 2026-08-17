/* AuCorp — los dos idiomas, el trazo del héroe y el revelado.
 *
 * Un solo archivo porque el sitio es uno solo: sin marco, sin compilar, sin
 * dependencias. Lo que hay en el repositorio es lo que corre.
 */
const AUCORP = (() => {
  'use strict';

  const $ = (s, d = document) => d.querySelector(s);
  const $$ = (s, d = document) => [...d.querySelectorAll(s)];

  /* ═══ LOS DOS IDIOMAS ══════════════════════════════════════════════════════
     Mismo patrón que el resto de la casa: `data-t` en el HTML y el diccionario
     aquí. El español es el original y el inglés tiene que cubrir EXACTAMENTE
     las mismas claves — una que falte deja media pantalla en el otro idioma y
     solo se descubre cuando alguien la abre. La prueba lo comprueba. */
  const I18N = {
    es: {
      'nav.quienes': 'Quiénes somos', 'nav.eco': 'Ecosistema',
      'nav.serv': 'Servicios', 'nav.prog': 'Progreso',
      'nav.quienes2': 'Quiénes somos', 'nav.serv2': 'Servicios', 'nav.prog2': 'Progreso',
      'cta.cuenta': 'Entrar', 'cta.cuenta2': 'Abrir cuenta', 'cta.cuenta3': 'Abrir cuenta',
      'cta.eco': 'Ver el ecosistema', 'cta.hablar': 'Hablar con nosotros',

      'hero.et': 'Institución FinTech · Próspera ZEDE',
      'hero.h1a': 'La banca que entiende', 'hero.h1b': 'los dos mundos',
      'hero.p': 'AuCorp une la solidez de las finanzas tradicionales con la infraestructura de los sistemas descentralizados. Custodia, pagos y remesas sobre una base regulada, con respaldo real y propósito social.',
      'hero.sello': 'Constituida en Próspera ZEDE bajo la',

      'q.et': 'Qué es AuCorp',
      'q.h2': 'Una institución financiera con dos naturalezas',
      'q.p1': 'AuCorp es una institución de tecnología financiera constituida en Próspera ZEDE bajo la Regulación FinTech A. Forma parte del Sistema Financiero Social como su pilar bancario, y da vida a la Red de Intercambio Social.',
      'q.p2': 'Su trabajo es el de un puente: que el dinero que se mueve en la banca de siempre y el que se mueve en cadena puedan encontrarse sin que la persona de en medio tenga que entender de las dos.',
      'q.k1': 'Jurisdicción', 'q.k2': 'Marco', 'q.k3': 'Función', 'q.k4': 'Registro', 'q.k5': 'Alcance',
      'q.v3': 'Pilar bancario del Sistema Financiero Social',
      'q.v4': 'Blockchain de Orden Global',
      'q.v5': 'Latinoamérica, con vocación global',

      'd1.h': 'Conexión híbrida',
      'd1.p': 'Finanzas tradicionales y descentralizadas en el mismo sitio, sin pedirle a nadie que elija un bando.',
      'd2.h': 'Respaldo real',
      'd2.p': 'Activos tangibles y tecnología propia detrás de la operación, no una promesa de marketing.',
      'd3.h': 'Propósito social',
      'd3.p': 'Inclusión y acceso, con el foco puesto en Latinoamérica y en quien hoy queda fuera del sistema.',

      'e.et': 'El ecosistema', 'e.h2': 'Dos casas, un sistema',
      'e.p': 'AuCorp no es una pieza de Orden Global ni al revés: son dos instituciones con dueños y funciones distintas que operan sobre la misma infraestructura. Y Ordenex, la casa de cambio, es de AuCorp.',
      'e.cap': 'La línea discontinua entre iguales es una alianza: ninguna de las dos manda sobre la otra. La flecha llena de AuCorp a Ordenex es propiedad, y va en un solo sentido.',
      'e.r1.l': 'Aliada', 'e.r1.h': 'AuCorp · Orden Global',
      'e.r1.p': 'Dos instituciones independientes que operan sobre la misma infraestructura. AuCorp pone el pilar bancario y el marco regulatorio; Orden Global pone la cadena, el registro y los activos del ecosistema. Ninguna es filial de la otra.',
      'e.r2.l': 'Dueña', 'e.r2.h': 'AuCorp · Ordenex',
      'e.r2.p': 'Ordenex es la casa de cambio del ecosistema y es propiedad de AuCorp. Ahí se cotizan y se cambian los activos de Orden Global, con libro de órdenes, gráficas y entrada y salida en moneda local.',

      's.et': 'Nuestros servicios',
      's.h2': 'Lo que una institución financiera tiene que saber hacer',
      's.p': 'Servicios híbridos que conectan la banca tradicional con los activos digitales regulados.',
      's1.h': 'Custodia digital', 's1.p': 'Guarda de activos digitales con separación de fondos y control de acceso.',
      's2.h': 'Procesamiento de pagos', 's2.p': 'Cobros y liquidación para comercios, en moneda local y en activos del ecosistema.',
      's3.h': 'Remesas', 's3.p': 'Envío entre países con liquidación en cadena y entrega en moneda local.',
      's4.h': 'Soluciones híbridas', 's4.p': 'Tesorería, conversión y reportes para empresas que operan en los dos mundos.',

      'p.et': 'Nuestro progreso', 'p.h2': 'Pasos firmes, y cada uno comprobable',
      'p.p': 'Lo que ya está de pie y lo que está en camino, dicho sin adornos: una casa financiera que promete de más se comprueba en cinco minutos.',
      'p1.c': 'Constitución', 'p1.h': 'Regulación activa',
      'p1.p': 'Constituida en Próspera ZEDE bajo la Regulación FinTech A, con el marco operativo vigente.',
      'p2.c': 'Infraestructura', 'p2.h': 'Registro en cadena',
      'p2.p': 'Operación registrada en la blockchain de Orden Global, con explorador público.',
      'p3.c': 'Mercado', 'p3.h': 'Ordenex en marcha',
      'p3.p': 'La casa de cambio, propiedad de AuCorp, con libro de órdenes, gráficas y entrada y salida en moneda local.',
      'p4.c': 'En camino', 'p4.h': 'Expansión en Latinoamérica',
      'p4.p': 'Corredores de remesas y red de agentes para entrada y salida en moneda local, país por país.',
      'est.hecho': 'Completado', 'est.hecho2': 'Completado', 'est.hecho3': 'Completado', 'est.curso': 'En curso',

      'c.et': 'Comienza hoy', 'c.h2': 'La conversación empieza con una cuenta',
      'c.p': 'Personas, comercios e instituciones. Si operás en los dos mundos —o querés empezar—, este es el sitio.',

      'f.p': 'Institución de tecnología financiera constituida en Próspera ZEDE. Aliada de Orden Global y dueña de Ordenex.',
      'f.h1': 'La casa', 'f.h2': 'El ecosistema', 'f.der': 'Todos los derechos reservados',
    },
    en: {
      'nav.quienes': 'About us', 'nav.eco': 'Ecosystem',
      'nav.serv': 'Services', 'nav.prog': 'Progress',
      'nav.quienes2': 'About us', 'nav.serv2': 'Services', 'nav.prog2': 'Progress',
      'cta.cuenta': 'Sign in', 'cta.cuenta2': 'Open an account', 'cta.cuenta3': 'Open an account',
      'cta.eco': 'See the ecosystem', 'cta.hablar': 'Talk to us',

      'hero.et': 'FinTech institution · Próspera ZEDE',
      'hero.h1a': 'The bank that speaks', 'hero.h1b': 'both languages',
      'hero.p': 'AuCorp joins the solidity of traditional finance with the infrastructure of decentralised systems. Custody, payments and remittances on a regulated base, with real backing and a social purpose.',
      'hero.sello': 'Incorporated in Próspera ZEDE under',

      'q.et': 'What AuCorp is',
      'q.h2': 'A financial institution with two natures',
      'q.p1': 'AuCorp is a financial technology institution incorporated in Próspera ZEDE under FinTech Regulation A. It is the banking pillar of the Social Financial System, and it gives life to the Social Exchange Network.',
      'q.p2': 'Its job is that of a bridge: so money moving through ordinary banking and money moving on chain can meet, without the person in the middle having to understand either one.',
      'q.k1': 'Jurisdiction', 'q.k2': 'Framework', 'q.k3': 'Role', 'q.k4': 'Registry', 'q.k5': 'Reach',
      'q.v3': 'Banking pillar of the Social Financial System',
      'q.v4': 'Orden Global blockchain',
      'q.v5': 'Latin America, with a global vocation',

      'd1.h': 'Hybrid connection',
      'd1.p': 'Traditional and decentralised finance in one place, without asking anyone to pick a side.',
      'd2.h': 'Real backing',
      'd2.p': 'Tangible assets and our own technology behind the operation, not a marketing promise.',
      'd3.h': 'Social purpose',
      'd3.p': 'Inclusion and access, focused on Latin America and on whoever the system leaves out today.',

      'e.et': 'The ecosystem', 'e.h2': 'Two houses, one system',
      'e.p': 'AuCorp is not a part of Orden Global, nor the other way round: they are two institutions with different owners and different jobs, operating on the same infrastructure. And Ordenex, the exchange, belongs to AuCorp.',
      'e.cap': 'The dashed line between equals is an alliance: neither one commands the other. The solid arrow from AuCorp to Ordenex is ownership, and it runs one way only.',
      'e.r1.l': 'Ally', 'e.r1.h': 'AuCorp · Orden Global',
      'e.r1.p': 'Two independent institutions operating on the same infrastructure. AuCorp brings the banking pillar and the regulatory framework; Orden Global brings the chain, the registry and the ecosystem’s assets. Neither is a subsidiary of the other.',
      'e.r2.l': 'Owner', 'e.r2.h': 'AuCorp · Ordenex',
      'e.r2.p': 'Ordenex is the ecosystem’s exchange and it is owned by AuCorp. That is where Orden Global’s assets are quoted and traded, with an order book, charts, and cash in and out in local currency.',

      's.et': 'Our services',
      's.h2': 'What a financial institution has to know how to do',
      's.p': 'Hybrid services connecting traditional banking with regulated digital assets.',
      's1.h': 'Digital custody', 's1.p': 'Safekeeping of digital assets with segregated funds and access control.',
      's2.h': 'Payment processing', 's2.p': 'Collection and settlement for merchants, in local currency and in ecosystem assets.',
      's3.h': 'Remittances', 's3.p': 'Cross-border transfers settled on chain and delivered in local currency.',
      's4.h': 'Hybrid solutions', 's4.p': 'Treasury, conversion and reporting for companies operating in both worlds.',

      'p.et': 'Our progress', 'p.h2': 'Firm steps, every one of them checkable',
      'p.p': 'What already stands and what is on the way, said plainly: a financial house that overpromises is checked in five minutes.',
      'p1.c': 'Incorporation', 'p1.h': 'Active regulation',
      'p1.p': 'Incorporated in Próspera ZEDE under FinTech Regulation A, with the operating framework in force.',
      'p2.c': 'Infrastructure', 'p2.h': 'On-chain registry',
      'p2.p': 'Operations recorded on the Orden Global blockchain, with a public explorer.',
      'p3.c': 'Market', 'p3.h': 'Ordenex running',
      'p3.p': 'The exchange, owned by AuCorp, with an order book, charts, and cash in and out in local currency.',
      'p4.c': 'On the way', 'p4.h': 'Expansion across Latin America',
      'p4.p': 'Remittance corridors and an agent network for cash in and out in local currency, country by country.',
      'est.hecho': 'Done', 'est.hecho2': 'Done', 'est.hecho3': 'Done', 'est.curso': 'In progress',

      'c.et': 'Start today', 'c.h2': 'The conversation starts with an account',
      'c.p': 'People, merchants and institutions. If you operate in both worlds — or want to start — this is the place.',

      'f.p': 'A financial technology institution incorporated in Próspera ZEDE. Ally of Orden Global and owner of Ordenex.',
      'f.h1': 'The house', 'f.h2': 'The ecosystem', 'f.der': 'All rights reserved',
    },
  };

  const guardado = () => { try { return localStorage.getItem('aucorp.idioma'); } catch { return null; } };
  let idioma = guardado() || ((navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es');

  function pintarIdioma() {
    const d = I18N[idioma] || I18N.es;
    $$('[data-t]').forEach((el) => {
      const t = d[el.dataset.t];
      if (t != null) el.textContent = t;
    });
    document.documentElement.lang = idioma;
    $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === idioma)));
  }

  function cambiarIdioma(l) {
    if (l !== 'es' && l !== 'en') return;
    idioma = l;
    try { localStorage.setItem('aucorp.idioma', l); } catch {}
    pintarIdioma();
  }

  /* ═══ EL TRAZO DEL HÉROE ═══════════════════════════════════════════════════
     El logo es un circuito que crece hacia arriba dentro de un galón. Esto lo
     dibuja: pistas que suben desde el pie, doblan en ángulo recto una o dos
     veces y terminan en un nodo. Todas nacen del centro hacia afuera, así que
     la forma del conjunto es la V del logo.

     Se dibuja UNA vez, en canvas y no en DOM: son ~40 trazos y meterlos como
     elementos sería pedirle al navegador que recalcule estilo para un adorno.
     Con `prefers-reduced-motion` no se anima nada — aparece dibujado. */
  function trazo(lienzo) {
    const ctx = lienzo && lienzo.getContext && lienzo.getContext('2d');
    if (!ctx) return;

    const calma = (() => {
      try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
    })();

    let pistas = [];
    let ancho = 0, alto = 0;

    function armar() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ancho = lienzo.clientWidth || 1200;
      alto = lienzo.clientHeight || 700;
      lienzo.width = Math.round(ancho * dpr);
      lienzo.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Una pista cada ~34 px, y su altura crece cuanto más cerca del centro:
      // eso es lo que dibuja la V sin tener que dibujarla.
      const paso = 34;
      const n = Math.max(10, Math.floor(ancho / paso));
      const medio = (n - 1) / 2;
      pistas = [];
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (ancho / n);
        const cerca = 1 - Math.abs(i - medio) / medio;          // 1 en el centro, 0 en los bordes
        // El semilla determinista: la misma pantalla dibuja lo mismo al
        // redimensionar. Un Math.random aquí haría que la figura saltara.
        const s = Math.sin(i * 12.9898) * 43758.5453;
        const r = s - Math.floor(s);
        const largo = alto * (0.18 + cerca * 0.52 + r * 0.16);
        const codo = alto - largo * (0.35 + r * 0.35);
        const desvio = (r - 0.5) * 44;
        pistas.push({ x, largo, codo, desvio, orden: r });
      }
      pistas.sort((a, b) => a.orden - b.orden);
    }

    function pintar(avance) {
      ctx.clearRect(0, 0, ancho, alto);
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const pie = alto;
      pistas.forEach((p, i) => {
        const cuanto = Math.max(0, Math.min(1, avance * pistas.length - i));
        if (cuanto <= 0) return;
        const cima = pie - p.largo * cuanto;
        ctx.globalAlpha = 0.22 + 0.5 * (p.largo / alto);
        ctx.strokeStyle = '#E3C069';
        ctx.beginPath();
        ctx.moveTo(p.x, pie);
        if (cima < p.codo) {
          ctx.lineTo(p.x, p.codo);
          ctx.lineTo(p.x + p.desvio, p.codo - 18);
          ctx.lineTo(p.x + p.desvio, cima);
        } else {
          ctx.lineTo(p.x, cima);
        }
        ctx.stroke();
        // El nodo de la punta: solo cuando la pista ya llegó del todo.
        if (cuanto > 0.98) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#F1DFAE';
          ctx.beginPath();
          ctx.arc(cima < p.codo ? p.x + p.desvio : p.x, cima, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }

    armar();
    if (calma) { pintar(1); }
    else {
      const inicio = performance.now();
      const DURA = 1500;
      const paso = (t) => {
        const a = Math.min(1, (t - inicio) / DURA);
        // Suavizado de salida: arranca rápido y se posa.
        pintar(1 - Math.pow(1 - a, 3));
        if (a < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }

    let reloj = null;
    addEventListener('resize', () => {
      clearTimeout(reloj);
      reloj = setTimeout(() => { armar(); pintar(1); }, 160);
    });
  }

  /* ═══ EL REVELADO ══════════════════════════════════════════════════════════ */
  function revelar() {
    const bloques = $$('.rev');
    if (!('IntersectionObserver' in window)) {
      bloques.forEach((b) => b.classList.add('ve'));
      return;
    }
    const ojo = new IntersectionObserver((filas) => {
      filas.forEach((f) => {
        if (!f.isIntersecting) return;
        f.target.classList.add('ve');
        ojo.unobserve(f.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    bloques.forEach((b) => ojo.observe(b));
  }

  /* ═══ LA CABECERA ══════════════════════════════════════════════════════════
     Va clara sobre el héroe (que es negro) y se vuelve oscura —o sea, de tinta
     sobre hueso— en cuanto se sale de él. Se decide mirando dónde termina el
     héroe y no a los N píxeles: un número fijo se rompe el día que el héroe
     cambie de alto. */
  function cabecera() {
    const top = $('#top');
    const heroe = $('#inicio');
    const btn = $('#btnCuenta');
    if (!top || !heroe) return;
    const mirar = () => {
      const dentro = heroe.getBoundingClientRect().bottom > 78;
      top.classList.toggle('oscura', dentro);
      top.classList.toggle('pegada', !dentro);
      if (btn) {
        btn.classList.toggle('btn-claro', dentro);
        btn.classList.toggle('btn-oro', !dentro);
      }
    };
    mirar();
    addEventListener('scroll', mirar, { passive: true });
  }

  /* ═══ LOS LOGOS, SI ESTÁN ══════════════════════════════════════════════════
     Mientras no existan los archivos, la marca va en tipografía y el glifo
     dibujado, que es digno. En cuanto alguien deje assets/aucorp.png, se
     enseña solo. Se prueba cargándolo, no preguntando: un 404 de una imagen no
     se puede consultar de otra manera. */
  function logoSiHay() {
    const im = new Image();
    im.onload = () => {
      const hueco = $('.marca .glifo');
      if (!hueco) return;
      const el = document.createElement('img');
      el.src = 'assets/aucorp.png';
      el.alt = '';
      el.style.cssText = 'width:28px;height:28px;object-fit:contain';
      hueco.replaceWith(el);
    };
    im.src = 'assets/aucorp.png';
  }

  function arrancar() {
    pintarIdioma();
    $$('[data-lang]').forEach((b) => b.addEventListener('click', () => cambiarIdioma(b.dataset.lang)));
    trazo($('#trazo'));
    revelar();
    cabecera();
    logoSiHay();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

  // Para las pruebas.
  return { I18N, idioma: cambiarIdioma, _idioma: () => idioma };
})();
