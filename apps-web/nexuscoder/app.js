/* Nexus Coder · los dos idiomas.
 *
 * Un solo archivo porque el sitio es uno solo: sin marco, sin compilar, sin
 * dependencias. Lo que hay en el repositorio es lo que corre — que además es
 * justo lo que la página dice que hacemos, y un estudio que predica una cosa y
 * publica otra se nota.
 *
 * ══ EL PATRÓN ══════════════════════════════════════════════════════════════
 *
 * `data-t` en el HTML y el diccionario aquí. El español es el original y el
 * inglés tiene que cubrir EXACTAMENTE las mismas claves: una que falte deja
 * media pantalla en el otro idioma, y eso solo se descubre cuando alguien la
 * abre. La comprobación de abajo lo canta en consola en vez de dejarlo pasar.
 */
const NX = (() => {
  'use strict';

  const I18N = {
    es: {
      'nav.prueba': 'Lo que corre', 'nav.hacemos': 'Qué hacemos',
      'nav.codigo': 'Cómo escribimos', 'nav.contacto': 'Contacto',

      'hero.et': 'Estudio de ingeniería · Fráncfort del Meno',
      'hero.t1': 'No hacemos la demo.',
      'hero.t2': 'Hacemos la', 'hero.t3': 'infraestructura.',
      'hero.baj': 'Una cadena propia, una identidad verificada, una billetera, una casa de cambio y '
                + 'un sistema de cuentas en veintiuna monedas. Todo lo de abajo está corriendo en '
                + 'producción ahora mismo — podés abrirlo y comprobarlo.',
      'hero.cta1': 'Ver lo que corre', 'hero.cta2': 'Cómo escribimos el código',

      'pr.et': 'La prueba',
      'pr.t': 'Un portafolio no se enseña. Se abre.',
      'pr.baj': 'Cualquiera puede poner capturas de pantalla. Estas son direcciones: entrá y usalas.',
      'pr.n2': 'Cadena 8532',
      'pr.k1': 'En producción', 'pr.k2': 'En producción', 'pr.k3': 'En producción',
      'pr.k4': 'Plataforma', 'pr.k5': 'Plataforma', 'pr.k6': 'Comercio',
      'pr.p1': 'Billetera de custodia propia para oro tokenizado. Web y móvil, con tarjeta, pagos '
             + 'entre personas y cobro por QR.',
      'pr.p2': 'Una Layer 1 propia con sus validadores, su suelo de gas y su explorador de bloques. '
             + 'No un contrato alquilado en la red de otro.',
      'pr.p3': 'Casa de cambio con motor de emparejamiento, libro de órdenes, velas japonesas y '
             + 'liquidación contra la cadena.',
      'pr.p4': 'Identidad verificada del ecosistema: KYC, KYB, tamiz de sanciones, reporte de '
             + 'movimientos y entrada única para todas las apps.',
      'pr.p5': 'Cuentas en moneda local en veintiuna monedas, con libro de partida doble, guarda '
             + 'contra el doble gasto y reconciliación.',
      'pr.p6': 'Cobro para comercios: directorio, punto de venta y liquidación en la misma cuenta '
             + 'del ecosistema.',

      'ha.et': 'Qué hacemos',
      'ha.t': 'Lo difícil, que es lo que casi nadie quiere tomar.',
      'ha.h1': 'Cadenas propias',
      'ha.c1': 'Redes permisionadas de punta a punta: génesis, validadores, política de gas, '
             + 'explorador y el plan de migración cuando hay que mover una cadena viva sin perder un bloque.',
      'ha.h2': 'Sistemas de dinero',
      'ha.c2': 'Libros de partida doble, motores de emparejamiento, guardas contra el doble gasto y '
             + 'reconciliación. El dinero en enteros y con BigInt, nunca en coma flotante.',
      'ha.h3': 'Identidad y cumplimiento',
      'ha.c3': 'KYC, KYB, tamiz de sanciones, reporte de movimientos y entrada única. Todo '
             + 'fail-closed: lo que no se pudo comprobar, no pasa.',
      'ha.h4': 'Billeteras y móvil',
      'ha.c4': 'Custodia propia y custodiada, frase de respaldo, firma en el dispositivo, y las '
             + 'tiendas: privacidad, permisos y todo lo que piden para dejarte publicar.',
      'ha.h5': 'Infraestructura',
      'ha.c5': 'AWS y Heroku, despliegue reproducible, vigías que avisan antes de que reclame un '
             + 'cliente, y auditoría de lo que corre contra lo que dice el repositorio.',
      'ha.h6': 'Auditoría y rescate',
      'ha.c6': 'Entramos a sistemas que ya están en producción y que nadie entiende del todo. '
             + 'Encontramos el doble pago, el secreto de siete caracteres y la ruta que nunca funcionó.',

      'co.et': 'Cómo escribimos el código',
      'co.t': 'Cinco reglas. Las cinco costaron caro.',
      'co.baj': 'No son un ideario de web. Son las conclusiones de incidentes concretos, y están '
              + 'escritas dentro del código que entregamos.',
      'co.h1': 'Ni un dato inventado.',
      'co.p1': 'Cuando un precio no se puede medir, la pantalla enseña un guion. Nunca un cero, '
             + 'nunca el último valor sin decir de cuándo es. Un cero se lee como un dato, y un dato '
             + 'falso en una pantalla de dinero es peor que una pantalla vacía.',
      'co.h2': 'El dinero es un entero.',
      'co.p2': 'Centavos, wei, gramins: siempre unidades mínimas enteras en un string, operadas con '
             + 'BigInt. 0.1 + 0.2 no da 0.3, y en un libro mayor cada redondeo deja una viruta que al '
             + 'cierre del mes nadie sabe explicar.',
      'co.h3': 'Si no se pudo comprobar, no pasa.',
      'co.p3': 'Fail-closed en todas las fronteras. Cuando el verificador de identidad no contesta, '
             + 'no se adivina un sí: se rechaza. Dejar pasar porque el proveedor está caído es justo '
             + 'el momento en que conviene mover dinero que no debería moverse.',
      'co.h4': 'El comentario dice POR QUÉ, no qué.',
      'co.p4': 'Un comentario que repite lo que ya dice la línea de abajo no sirve. Los nuestros '
             + 'cuentan qué se probó antes, qué se rompió y por qué la solución es esa. Dentro de tres '
             + 'meses eso no se reconstruye leyendo el código.',
      'co.h5': 'Se despliega empujando, nunca un paquete.',
      'co.p5': 'Esta la aprendimos el 12 de agosto: un clon desfasado subido como paquete borró '
             + 'funciones que estaban en producción. Desde entonces el despliegue sale del repositorio '
             + 'y de ningún otro sitio.',

      'nu.et': 'Comprobable',
      'nu.t': 'Números que se pueden verificar sin pedirnos permiso.',
      'nu.n1': 'La cadena que construimos y operamos',
      'nu.n2': 'Monedas en el sistema de cuentas, con sus decimales reales',
      'nu.n3': 'Productos del ecosistema, del explorador a la casa de cambio',
      'nu.n4': 'Plataformas: web, iOS y Android',
      'nu.pie': 'La cadena y el explorador son públicos. Lo demás se enseña en una llamada, con el '
              + 'código delante.',

      'ct.et': 'Trabajemos',
      'ct.t': '¿Tenés algo difícil?',
      'ct.p': 'Contanos qué hay que construir, o qué está roto y nadie sabe por qué. Las dos '
            + 'conversaciones nos interesan igual.',

      'pie.ciudad': 'Fráncfort del Meno, Alemania',
      'pie.hecho': 'Esta página no lleva rastreadores ni analítica de terceros.',
    },

    en: {
      'nav.prueba': "What's running", 'nav.hacemos': 'What we do',
      'nav.codigo': 'How we write', 'nav.contacto': 'Contact',

      'hero.et': 'Engineering studio · Frankfurt am Main',
      'hero.t1': "We don't build the demo.",
      'hero.t2': 'We build the', 'hero.t3': 'infrastructure.',
      'hero.baj': 'A chain of our own, a verified identity layer, a wallet, an exchange and a '
                + 'ledger in twenty-one currencies. Everything below is running in production right '
                + 'now — open it and check.',
      'hero.cta1': "See what's running", 'hero.cta2': 'How we write code',

      'pr.et': 'The proof',
      'pr.t': "A portfolio isn't shown. It's opened.",
      'pr.baj': 'Anyone can post screenshots. These are addresses: go in and use them.',
      'pr.n2': 'Chain 8532',
      'pr.k1': 'In production', 'pr.k2': 'In production', 'pr.k3': 'In production',
      'pr.k4': 'Platform', 'pr.k5': 'Platform', 'pr.k6': 'Commerce',
      'pr.p1': 'Self-custody wallet for tokenised gold. Web and mobile, with a card, person-to-person '
             + 'payments and QR collection.',
      'pr.p2': 'A Layer 1 of our own with its validators, its gas floor and its block explorer. Not a '
             + "contract rented on somebody else's network.",
      'pr.p3': 'An exchange with a matching engine, order book, Japanese candles and settlement '
             + 'against the chain.',
      'pr.p4': "The ecosystem's verified identity: KYC, KYB, sanctions screening, transaction "
             + 'reporting and single sign-on across every app.',
      'pr.p5': 'Local-currency accounts in twenty-one currencies, with a double-entry ledger, a '
             + 'double-spend guard and reconciliation.',
      'pr.p6': 'Merchant collection: directory, point of sale and settlement into the same ecosystem '
             + 'account.',

      'ha.et': 'What we do',
      'ha.t': "The hard part — the one almost nobody wants to take on.",
      'ha.h1': 'Chains of your own',
      'ha.c1': 'Permissioned networks end to end: genesis, validators, gas policy, explorer, and the '
             + 'migration plan for moving a live chain without losing a block.',
      'ha.h2': 'Money systems',
      'ha.c2': 'Double-entry ledgers, matching engines, double-spend guards and reconciliation. Money '
             + 'in integers with BigInt, never in floating point.',
      'ha.h3': 'Identity and compliance',
      'ha.c3': "KYC, KYB, sanctions screening, transaction reporting and single sign-on. All "
             + "fail-closed: what couldn't be verified doesn't pass.",
      'ha.h4': 'Wallets and mobile',
      'ha.c4': 'Self and managed custody, recovery phrase, on-device signing, and the app stores: '
             + 'privacy, permissions and everything they ask for before they let you publish.',
      'ha.h5': 'Infrastructure',
      'ha.c5': 'AWS and Heroku, reproducible deploys, watchers that warn before a customer does, and '
             + 'audits of what is running against what the repository says.',
      'ha.h6': 'Audit and rescue',
      'ha.c6': 'We go into systems already in production that nobody fully understands any more. We '
             + 'find the double payment, the seven-character secret and the route that never worked.',

      'co.et': 'How we write code',
      'co.t': 'Five rules. All five were expensive.',
      'co.baj': "These aren't website values. They are the conclusions of specific incidents, and "
              + 'they are written inside the code we hand over.',
      'co.h1': 'Not one invented figure.',
      'co.p1': "When a price can't be measured, the screen shows a dash. Never a zero, never the last "
             + 'value without saying when it is from. A zero reads as data, and false data on a money '
             + 'screen is worse than an empty screen.',
      'co.h2': 'Money is an integer.',
      'co.p2': 'Cents, wei, gramins: always whole minor units in a string, operated with BigInt. '
             + '0.1 + 0.2 does not equal 0.3, and in a ledger every rounding leaves a shaving that '
             + 'nobody can explain at month end.',
      'co.h3': "If it couldn't be verified, it doesn't pass.",
      'co.p3': "Fail-closed at every boundary. When the identity provider doesn't answer, we don't "
             + 'guess a yes: we refuse. Letting things through because a provider is down is exactly '
             + 'when it suits somebody to move money that shouldn’t move.',
      'co.h4': 'The comment says WHY, not what.',
      'co.p4': 'A comment that repeats the line below it is worthless. Ours record what was tried '
             + 'first, what broke, and why the fix is the one it is. Three months later that cannot be '
             + 'reconstructed by reading the code.',
      'co.h5': 'You deploy by pushing, never a package.',
      'co.p5': 'We learned this one on 12 August: a stale clone uploaded as a package wiped features '
             + 'that were live in production. Since then deploys come out of the repository and from '
             + 'nowhere else.',

      'nu.et': 'Verifiable',
      'nu.t': 'Numbers you can check without asking us for permission.',
      'nu.n1': 'The chain we built and operate',
      'nu.n2': 'Currencies in the ledger, with their real decimal places',
      'nu.n3': 'Products in the ecosystem, from explorer to exchange',
      'nu.n4': 'Platforms: web, iOS and Android',
      'nu.pie': 'The chain and the explorer are public. The rest we show on a call, with the code in '
              + 'front of us.',

      'ct.et': "Let's work",
      'ct.t': 'Got something hard?',
      'ct.p': "Tell us what needs building, or what is broken and nobody knows why. Both "
            + 'conversations interest us equally.',

      'pie.ciudad': 'Frankfurt am Main, Germany',
      'pie.hecho': 'This page carries no trackers and no third-party analytics.',
    },
  };

  /* La comprobación de cobertura. Se hace al cargar y no en una prueba aparte
     porque el fallo que caza —una clave que falta— solo se ve en la pantalla,
     y para entonces ya está publicada. */
  (() => {
    const es = Object.keys(I18N.es), en = Object.keys(I18N.en);
    const faltan = es.filter((k) => !(k in I18N.en));
    const sobran = en.filter((k) => !(k in I18N.es));
    if (faltan.length || sobran.length) {
      console.error('[i18n] el inglés no cubre el español:',
        { faltan, sobran });
    }
    // Y las claves del HTML que nadie tradujo: el otro lado del mismo agujero.
    const enHtml = [...document.querySelectorAll('[data-t]')].map((n) => n.dataset.t);
    const huerfanas = enHtml.filter((k) => !(k in I18N.es));
    if (huerfanas.length) console.error('[i18n] hay data-t sin traducción:', huerfanas);
  })();

  function idioma(l) {
    const d = I18N[l] || I18N.es;
    document.documentElement.lang = l;
    document.querySelectorAll('[data-t]').forEach((n) => {
      const v = d[n.dataset.t];
      // Si falta la clave se deja lo que había: media pantalla traducida es
      // feo, pero una pantalla en blanco es peor.
      if (v != null) n.textContent = v;
    });
    document.getElementById('b-es').setAttribute('aria-pressed', String(l === 'es'));
    document.getElementById('b-en').setAttribute('aria-pressed', String(l === 'en'));
    try { localStorage.setItem('nx.idioma', l); } catch { /* modo privado */ }
  }

  /* Arranque: lo que la persona eligió la última vez; si no, lo que trae su
     navegador. Preguntarle el idioma a alguien que ya lo tiene puesto en el
     sistema es hacerle trabajo que no hacía falta. */
  let inicial = 'es';
  try { inicial = localStorage.getItem('nx.idioma') || inicial; } catch { /* nada */ }
  if (!localStorage.getItem?.('nx.idioma') && /^en/i.test(navigator.language || '')) inicial = 'en';
  idioma(inicial);

  return { idioma };
})();
