/* La gráfica de velas de la casa, dibujada a mano sobre un canvas 2D.
 *
 * Sin librerías y sin CDN por la misma razón que el QR de la billetera va
 * escrito a mano: una casa de cambio cuyo mercado deja de verse porque un
 * tercero cambió una URL no es seria. Todo lo que esta gráfica sabe hacer
 * cabe aquí y se puede leer entero.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LAS DOS CLASES DE VELA, QUE JAMÁS SE MEZCLAN
 *
 * Este archivo pinta dos cosas que se parecen en la forma y no se parecen en
 * nada en lo que significan:
 *
 *   · Velas de TRATOS. Salen de operaciones reales de Ordenex y van en
 *     ORIGEN, en wei, en BigInt. Son las únicas que pueden llamarse precio.
 *   · Velas de REFERENCIA. Salen del mercado REAL del metal (oro y plata) y
 *     van en DÓLARES. Son el cartel de «la onza va a tanto» colgado en la
 *     pared: informan, no cotizan.
 *
 * Una vela de referencia pintada como si fuera un trato es exactamente la
 * mentira que esta casa no comete, así que el rótulo no es decoración: es la
 * promesa. `unidad:'USD'` implica referencia SIEMPRE — en esta casa no se
 * opera en dólares, de modo que si la unidad es el dólar el dato no puede
 * venir del libro. Ante la duda se rotula; nunca se calla.
 *
 * Y hay una tercera situación, la más fácil de deshonrar: el activo que no
 * tiene ni tratos ni referencia (los tokens de sector). Su gráfica se dibuja
 * ENTERA —rejilla, marco, ejes— y se queda vacía con el motivo escrito. Ni
 * una línea plana, ni un precio de relleno: la casa prefiere un lienzo que
 * dice «todavía no» a un lienzo que miente bonito.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LA FRONTERA DE LOS TIPOS (la regla que sostiene todo lo demás)
 *
 *   ORIGEN → BigInt. Los montos llegan como string de wei y se manejan con
 *   BigInt de punta a punta: mínimos, máximos, márgenes, pasos del eje, EMAs
 *   y etiquetas. Un flotante jamás toca dinero de la casa.
 *
 *   USD → Number, y SOLO en el carril de referencia. Los dólares del feed ya
 *   nacen flotantes en CoinGecko: fingir exactitud convirtiéndolos a wei «de
 *   verdad» sería teatro. Entran por UNA sola puerta —`deNumero()`— que los
 *   pasa a la misma coma fija de 18 decimales con doce decimales de mira, vía
 *   texto (toFixed) y no multiplicando por 1e18, para no arrastrar la basura
 *   binaria del flotante. A partir de esa puerta, adentro todo es BigInt otra
 *   vez y el resto del motor no sabe —ni necesita saber— de dónde vino el
 *   número.
 *
 *   La otra puerta, la de salida, es `fraccion()`: un BigInt se vuelve Number
 *   únicamente como posición relativa 0..1 para proyectarla a píxeles. Un
 *   píxel no es dinero; un precio sí.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SIN ESTADO GLOBAL
 *
 * dibujar() es una función de sus parámetros: mismo canvas, mismas velas y
 * mismas opciones pintan lo mismo. Devuelve un INFORME de lo que pintó —un
 * espejo de lo dibujado, no un estado con dueño— para que quien la llama (y
 * las pruebas) puedan comprobar la leyenda sin adivinar píxeles. El único
 * estado con dueño vive en el closure de enganchar(), que instala listeners y
 * temporizador y devuelve la función que lo apaga todo: quien abre un sondeo
 * es dueño de pararlo.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * API
 *
 *   dibujar(canvas, velas, opciones) → informe
 *     velas     [[t0, o, h, l, c, v], …] como las sirve el API, o los objetos
 *               { t0, o, h, l, c, v } tal como viven en la colección — se
 *               aceptan las dos formas y así no hace falta un adaptador.
 *               Con unidad 'ORIGEN' los montos son strings de wei; con 'USD'
 *               son Numbers de dólares (y entonces v suele no venir: el feed
 *               OHLC del metal no trae volumen, y esa banda desaparece).
 *     opciones  { unidad:'ORIGEN'|'USD'   qué son estos números (def. ORIGEN)
 *                 par:'AUKA-ORIGEN'       para la leyenda y el rótulo accesible
 *                 marco:'1m'|'15m'|'1h'|'1d'|…  manda en el formato del eje de tiempo
 *                 emas:[9,21,55]          medias exponenciales; [] las apaga
 *                 decimales:n             fuerza los decimales de las etiquetas
 *                 referencia:true         TODA la gráfica es referencia (badge)
 *                 referencia:'<wei>'|num  una LÍNEA de referencia sobre tratos
 *                 rotulo:'referencia'     el texto de esa línea
 *                 cursor:{x,y}            la cruz, en px CSS del canvas
 *                 destello:0..1           el latido del último precio (enganchar)
 *                 dpr:n                   sobreescribe el devicePixelRatio
 *                 idioma:'es'|'en' }
 *     informe   { vacio, n, indice, unidad, referencia, volumen, leyenda }
 *
 *   enganchar(canvas, obtenerVelas, cadaMs = 30000)
 *     obtenerVelas() → velas | { velas, opciones } (o promesa de eso).
 *     Instala cruz + refresco solo-con-pestaña-visible y devuelve el apagador.
 */

const VELAS = (() => {
  'use strict';

  const U = 10n ** 18n;

  // La proyección a píxel: la única puerta por la que un BigInt se vuelve
  // Number, y solo como fracción 0..1 con seis decimales de mira — sobra
  // para cualquier pantalla y no toca jamás el valor del dinero.
  const MIRA = 1000000n;
  const fraccion = (num, den) => (den <= 0n ? 0 : Number((num * MIRA) / den) / 1e6);

  /* De wei a texto, CORTANDO — jamás redondeando, mismo criterio que
     ONX.deWei: redondear hacia arriba en un eje de precios enseña un precio
     al que nadie operó. Recibe BigInt (aquí adentro ya no viajan strings). */
  function formatear(n, dec) {
    const signo = n < 0n ? '-' : '';
    if (n < 0n) n = -n;
    const entero = (n / U).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const cola = (n % U).toString().padStart(18, '0')
      .slice(0, Math.max(0, dec)).replace(/0+$/, '');
    return signo + entero + (cola ? '.' + cola : '');
  }

  /* ── LA FRONTERA ─────────────────────────────────────────────────────────
     Dos puertas y ni una más. Las dos devuelven la misma coma fija de 18
     decimales en BigInt, o null si el dato no es dato — fail-closed: un monto
     ilegible no vale cero, no vale nada. */

  // ORIGEN: string de wei (o BigInt). Estricta a propósito — un Number con
  // parte decimal hace que BigInt() lance, y eso está BIEN: dinero de la casa
  // que llegó como flotante es un error de quien lo mandó, no algo que esta
  // gráfica deba disimular redondeando.
  function deWei(x) {
    if (x == null || x === '') return null;
    try { return BigInt(x); } catch { return null; }
  }

  // USD: Number de dólares. Vía texto, no multiplicando por 1e18: 0.1*1e18 en
  // coma flotante ya sale torcido, y toFixed(12) da doce decimales exactos de
  // los que al dólar le sobran once. El techo es cordura, no capricho: un
  // «precio» de mil billones de dólares es un dato roto, y se descarta.
  const DEC_PUENTE = 12;
  const TECHO_USD = 1e15;
  function deNumero(x) {
    const n = typeof x === 'number' ? x : Number(x);
    if (!Number.isFinite(n) || Math.abs(n) >= TECHO_USD) return null;
    const negativo = n < 0;
    const [entero, decimal = ''] = Math.abs(n).toFixed(DEC_PUENTE).split('.');
    const fijo = BigInt(entero) * U + BigInt(decimal.padEnd(18, '0').slice(0, 18));
    return negativo ? -fijo : fijo;
  }

  /* El paso «lindo» del eje: 1, 2 ó 5 por la potencia de diez que toque, en
     wei y con BigInt — el clásico de todo eje de precios, sin pasar por
     logaritmos flotantes. Devuelve el menor candidato que cubra el bruto. */
  function pasoLindo(bruto) {
    if (bruto <= 1n) return 1n;
    const mag = 10n ** BigInt(bruto.toString().length - 1);
    for (const m of [mag, 2n * mag, 5n * mag, 10n * mag]) if (m >= bruto) return m;
    return 10n * mag;
  }

  // Cuántos decimales necesita una etiqueta para distinguir dos ticks que
  // están a un paso: exactamente los que el paso trae ocupados. Con paso de
  // 5×10^16 wei (0.05) hacen falta 2; con paso entero, ninguno.
  function decimalesDe(paso) {
    const s = paso.toString();
    let ceros = 0;
    for (let i = s.length - 1; i >= 0 && s[i] === '0'; i--) ceros++;
    return Math.max(0, 18 - ceros);
  }

  /* Una vela cruda del API, vuelta números de trabajo — o null si no se pudo.
     Fail-closed de pantalla: una vela con un monto ilegible no se pinta como
     cero, no se pinta y punto. La coherencia h ≥ l también se exige: una vela
     con la mecha al revés es un dato roto, no una vela rara. */
  function normalizar(cruda, puerta = deWei) {
    const [t, o, h, l, c, v] = Array.isArray(cruda)
      ? cruda
      : [cruda?.t0, cruda?.o, cruda?.h, cruda?.l, cruda?.c, cruda?.v];
    let tt = Number(t);
    if (!Number.isFinite(tt) || tt <= 0) return null;
    // Las dos convenciones de época conviven en el mundo; hasta el año 33658
    // un valor en segundos queda por debajo de 1e12 y se distingue.
    if (tt < 1e12) tt *= 1000;
    const vo = puerta(o), vh = puerta(h), vl = puerta(l), vc = puerta(c);
    if (vo == null || vh == null || vl == null || vc == null) return null;
    // El volumen ausente es cero legítimo (el feed del metal no lo trae); el
    // volumen ILEGIBLE, en cambio, invalida la vela — no es lo mismo «no hay»
    // que «no se pudo leer».
    const vv = v == null || v === '' ? 0n : puerta(v);
    if (vv == null || vv < 0n || vh < vl) return null;
    return { t: tt, o: vo, h: vh, l: vl, c: vc, v: vv };
  }

  /* ── LA MEDIA EXPONENCIAL, HONESTA ───────────────────────────────────────
     EMA(n) con alfa = 2/(n+1), SEMBRADA con la media simple de los primeros n
     cierres. Los primeros n-1 puntos quedan en null y NO se dibujan: una EMA
     que arranca en el primer dato finge tener una memoria que no tiene, y en
     una gráfica eso es una mentira gráfica — la línea se vería reaccionando a
     un pasado que nunca ocurrió.

     Todo en BigInt: la recurrencia es ema += (cierre - ema) · 2 / (n+1), con
     la multiplicación ANTES de la división para que la división entera
     trunque a nivel de wei y no de centavo. El sesgo que queda es sub-wei y
     es determinista — el mismo dato pinta siempre la misma línea. */
  function calcularEma(cierres, periodo) {
    const n = cierres.length;
    const salida = new Array(n).fill(null);
    if (!Number.isInteger(periodo) || periodo < 1 || n < periodo) return salida;
    let suma = 0n;
    for (let i = 0; i < periodo; i++) suma += cierres[i];
    let ema = suma / BigInt(periodo);
    salida[periodo - 1] = ema;
    const divisor = BigInt(periodo + 1);
    for (let i = periodo; i < n; i++) {
      ema += ((cierres[i] - ema) * 2n) / divisor;
      salida[i] = ema;
    }
    return salida;
  }

  // Los colores salen del :root en el momento de pintar: el tema vive en el
  // CSS y la gráfica lo sigue, no lo duplica. El respaldo escrito es la
  // paleta de la casa, para que un canvas fuera de la página (una prueba, un
  // ensayo) pinte igual.
  function color(nombre, respaldo) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
      return v || respaldo;
    } catch { return respaldo; }
  }

  const MONO = "500 10.5px 'JetBrains Mono',ui-monospace,monospace";
  const MONO_B = "700 10.5px 'JetBrains Mono',ui-monospace,monospace";
  const SANS = "'Archivo',system-ui,sans-serif";

  // es primero y como respaldo, igual que en toda la casa. Entra por
  // opciones.idioma y no leyendo i18n.js: esta pieza se carga antes que aquel
  // y, sobre todo, todo entra por parámetros.
  const TXT = {
    es: {
      sinTratos: 'Sin tratos todavía',
      sinTratosSub: 'esta gráfica se llena con operaciones reales',
      ilegible: 'No pudimos leer las velas',
      ilegibleSub: 'preferimos no dibujar nada antes que un número inventado',
      referencia: 'referencia',
      badge: 'REFERENCIA',
      velas: 'velas',
      ultimo: 'último',
      aviso: 'precio de referencia del mercado del metal, no una operación de Ordenex',
      // ── el precio declarado ──────────────────────────────────────────────
      badgeDecl: 'DECLARADO',
      avisoDecl: 'precio fijado por resolución de la Junta Directiva, no un precio de mercado',
      sinActas: 'Sin resoluciones cargadas',
      sinActasSub: 'aquí van los precios que la Junta declaró, con su acta',
      acta: 'acta',
      firma: 'firma',
      desde: 'vigente desde',
      resoluciones: 'resoluciones',
      // Por qué estas velas no llevan mecha. Va en la leyenda y no en una nota
      // al pie: quien lee velas busca la mecha, y su ausencia tiene que estar
      // explicada donde se la echa de menos.
      sinMecha: 'cada vela abre en el precio del acta anterior y cierra en el de esta; sin mecha, porque entre dos actas no hubo operaciones',
    },
    en: {
      sinTratos: 'No trades yet',
      sinTratosSub: 'this chart fills up with real trades',
      ilegible: 'We couldn’t read the candles',
      ilegibleSub: 'we’d rather draw nothing than an invented number',
      referencia: 'reference',
      badge: 'REFERENCE',
      velas: 'candles',
      ultimo: 'last',
      aviso: 'reference price from the metal market, not an Ordenex trade',
      badgeDecl: 'DECLARED',
      avisoDecl: 'price set by resolution of the Board of Directors, not a market price',
      sinActas: 'No resolutions loaded',
      sinActasSub: 'the prices the Board declared go here, each with its minute',
      acta: 'minute',
      firma: 'signed',
      desde: 'in force since',
      resoluciones: 'resolutions',
      sinMecha: 'each candle opens at the previous minute’s price and closes at this one’s; no wick, because between two minutes there were no trades',
    },
  };

  const dosD = x => String(x).padStart(2, '0');
  const hora = t => { const d = new Date(t); return `${dosD(d.getHours())}:${dosD(d.getMinutes())}`; };
  const fecha = t => { const d = new Date(t); return `${dosD(d.getDate())}/${dosD(d.getMonth() + 1)}`; };
  const mesAno = t => { const d = new Date(t); return `${dosD(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };

  // Marcos cuyo cubo cabe dentro de un día: ahí la hora dice algo. En 1d la
  // hora sería siempre la misma y solo estorbaría.
  const MARCOS_INTRADIA = ['1m', '5m', '15m', '30m', '1h', '2h', '4h'];

  // roundRect es de casa en los navegadores de hoy, pero un canvas prestado
  // (una prueba vieja, un motor raro) no tiene por qué tenerlo — y una ficha
  // sin esquinas se lee igual que una con esquinas.
  function caja(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  /* Una fila de la leyenda: trozos con su tinta y su tipografía, escritos uno
     tras otro. Con `medir` en true no pinta, solo suma anchos — así la caja
     de fondo se dibuja del tamaño exacto ANTES que el texto. */
  function fila(ctx, x, y, piezas, medir) {
    let cx = x;
    for (const p of piezas) {
      if (!p || !p.t) continue;
      ctx.font = p.font || MONO;
      if (!medir) {
        ctx.fillStyle = p.tinta;
        ctx.fillText(p.t, cx, y);
      }
      cx += ctx.measureText(p.t).width;
    }
    return cx - x;
  }

  // Una pastilla de eje: fondo, borde y texto centrado. Es el vocabulario de
  // toda plataforma de mercado — el número que importa va dentro de algo que
  // se distingue del fondo aunque caiga encima de una vela.
  function pastilla(ctx, x, y, w, h, fondo, borde, texto, tinta, fuente) {
    caja(ctx, x, y, w, h, 4);
    ctx.fillStyle = fondo;
    ctx.fill();
    if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.font = fuente || MONO_B;
    ctx.fillStyle = tinta;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, x + w / 2, y + h / 2 + 0.5);
  }

  function dibujar(canvas, velas, opciones = {}) {
    const ctx = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx) return { vacio: 'ilegible', n: 0, indice: -1, leyenda: null };

    /* devicePixelRatio: el lienzo interno va en píxeles de dispositivo y el
       dibujo en píxeles CSS vía transform — así el texto sale nítido en una
       pantalla densa sin que ninguna cuenta de acá abajo sepa del ratio. El
       tamaño se toca solo si cambió: reasignar width borra el canvas. El tope
       de 3 es economía: por encima se gastan cuatro veces los píxeles y no se
       gana un ojo de nitidez. */
    const dprPedido = Number(opciones.dpr);
    const dpr = Math.min(3, Math.max(1,
      Number.isFinite(dprPedido) && dprPedido > 0 ? dprPedido : (window.devicePixelRatio || 1)));
    const ancho = canvas.clientWidth || 640;
    const alto = canvas.clientHeight || 320;
    const W = Math.round(ancho * dpr), H = Math.round(alto * dpr);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    const idioma = opciones.idioma === 'en' ? 'en' : 'es';
    const T = TXT[idioma];
    const jade = color('--jade', '#3ED9A0');
    const coral = color('--coral', '#F0776B');
    const oro = color('--oro', '#C9A961');
    const oroLt = color('--oroLt', '#EAD79C');
    const crema = color('--crema', '#F3ECD9');
    const bruma = color('--bruma', '#AEC7C3');
    const humo = color('--humo', '#6E938F');
    const acento = color('--acento', '#74E6C8');
    const pozo = color('--pozo', '#021B1C');
    const linea = color('--linea', 'rgba(201,169,97,.34)');
    const REJILLA = 'rgba(243,236,217,.07)';
    const FICHA = '#052A2C';   // el fondo sólido de las pastillas de la cruz

    // ── qué clase de vela es esta gráfica ─────────────────────────────────
    const unidad = opciones.unidad === 'USD' ? 'USD' : 'ORIGEN';
    const puerta = unidad === 'USD' ? deNumero : deWei;
    // `referencia` sirve dos platos distintos y se distinguen por el tipo:
    //   true / objeto → TODA la gráfica es referencia (lleva badge y aviso)
    //   string/número → una LÍNEA de referencia sobre velas de tratos
    // Y el dólar implica referencia por sí solo: aquí no se opera en dólares.
    const refBandera = opciones.referencia === true
      || (opciones.referencia != null && typeof opciones.referencia === 'object');
    const esReferencia = unidad === 'USD' || refBandera;
    const par = typeof opciones.par === 'string' ? opciones.par : '';
    const marco = typeof opciones.marco === 'string' ? opciones.marco : '';

    canvas.setAttribute('role', 'img');

    const crudas = Array.isArray(velas) ? velas : [];
    const todas = crudas.map(v => normalizar(v, puerta)).filter(Boolean);

    /* LA VENTANA DE LA VISTA. `opciones.ventana = {desde, hasta}` recorta lo
       que se DIBUJA, nunca lo que se CALCULA: las medias se sacan de la serie
       entera y despues se recortan igual que las velas. Si se calcularan
       sobre el trozo visible, acercar la vista cambiaria el valor de la EMA
       — la misma vela diria dos numeros distintos segun el zoom, que es una
       mentira silenciosa y de las peores, porque parece un detalle. */
    const vt = opciones.ventana;
    let corte0 = 0, corte1 = todas.length;
    if (vt && Number.isFinite(vt.desde) && Number.isFinite(vt.hasta)) {
      corte0 = Math.max(0, Math.min(todas.length - 1, Math.floor(vt.desde)));
      corte1 = Math.max(corte0 + 1, Math.min(todas.length, Math.ceil(vt.hasta)));
    }
    const lista = todas.slice(corte0, corte1);
    const n = lista.length;

    // ── la geometría, que es la misma con datos y sin ellos ───────────────
    // Que el encuadre no dependa de si hay velas es justamente lo que hace
    // digno el vacío: la gráfica del token sin mercado tiene el mismo marco,
    // la misma rejilla y los mismos ejes que la del mercado más líquido.
    const IZQ = 10, ARRIBA = 8, ALTO_T = 20, EJE_MIN = 46;

    const filaLeyenda1 = [
      par ? { t: par, tinta: crema, font: `600 11.5px ${SANS}` } : null,
      par && marco ? { t: '  ·  ', tinta: humo } : null,
      marco ? { t: marco, tinta: bruma } : null,
      (par || marco) ? { t: '   ' + unidad, tinta: humo } : { t: unidad, tinta: humo },
      esReferencia ? { t: '   ' + T.badge, tinta: oro, font: MONO_B } : null,
    ].filter(Boolean);

    /* ── el vacío digno ────────────────────────────────────────────────────
       Cero velas y velas ilegibles NO son lo mismo: «sin tratos» es un
       mercado que todavía no ha nacido; «no pudimos leer» es un dato roto.
       Confundir los dos es la clase de mentira amable que la casa no dice.
       Se pinta el marco entero y en el centro el motivo — sin una sola
       etiqueta de precio ni de hora, porque no hay ni precios ni horas que
       rotular y un número de relleno en un eje es un número inventado. */
    if (n === 0) {
      const motivo = crudas.length === 0 ? 'sinTratos' : 'ilegible';
      const texto = T[motivo];
      const sub = T[motivo + 'Sub'];
      canvas.setAttribute('aria-label',
        `${par ? par + ' · ' : ''}${texto}${esReferencia ? ' · ' + T.aviso : ''}`);

      const der = ancho - EJE_MIN;
      const pie = alto - ALTO_T;
      ctx.strokeStyle = REJILLA;
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const y = Math.round(ARRIBA + (pie - ARRIBA) * i / 5) + 0.5;
        ctx.beginPath(); ctx.moveTo(IZQ, y); ctx.lineTo(der, y); ctx.stroke();
      }
      for (let i = 1; i < 6; i++) {
        const x = Math.round(IZQ + (der - IZQ) * i / 6) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, ARRIBA); ctx.lineTo(x, pie); ctx.stroke();
      }
      ctx.strokeStyle = linea;
      ctx.beginPath();
      ctx.moveTo(Math.round(der) + 0.5, ARRIBA);
      ctx.lineTo(Math.round(der) + 0.5, Math.round(pie) + 0.5);
      ctx.lineTo(IZQ, Math.round(pie) + 0.5);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 13px ${SANS}`;
      ctx.fillStyle = bruma;
      ctx.fillText(texto, (IZQ + der) / 2, (ARRIBA + pie) / 2 - 8);
      ctx.font = `400 11px ${SANS}`;
      ctx.fillStyle = humo;
      ctx.fillText(sub, (IZQ + der) / 2, (ARRIBA + pie) / 2 + 10);

      if (filaLeyenda1.length) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const w = fila(ctx, 0, 0, filaLeyenda1, true);
        ctx.fillStyle = 'rgba(2,27,28,.72)';
        ctx.fillRect(IZQ + 2, ARRIBA + 2, w + 16, 20);
        fila(ctx, IZQ + 10, ARRIBA + 12, filaLeyenda1, false);
      }
      return { vacio: motivo, n: 0, indice: -1, unidad, referencia: esReferencia, volumen: false, leyenda: null };
    }

    // ── autoescala, en la coma fija ───────────────────────────────────────
    // La línea de referencia sobre tratos, si la hay. Entra en la escala: una
    // línea rotulada fuera del encuadre es una línea que no existe, y se
    // enseña justamente para poder compararla con los tratos.
    let refLinea = null;
    if (!refBandera && opciones.referencia != null && opciones.referencia !== '') {
      refLinea = puerta(opciones.referencia);
    }

    let min = lista[0].l, max = lista[0].h, maxV = 0n;
    for (const v of lista) {
      if (v.l < min) min = v.l;
      if (v.h > max) max = v.h;
      if (v.v > maxV) maxV = v.v;
    }

    // Las EMAs se calculan ANTES de cerrar la escala porque también tienen
    // que caber: una media que se sale del encuadre por abajo sería una línea
    // cortada, y una línea cortada se lee como un dato que no está.
    const periodos = (Array.isArray(opciones.emas) ? opciones.emas : [9, 21, 55])
      .map(Number)
      .filter(p => Number.isInteger(p) && p >= 1 && p <= 400)
      .filter((p, i, a) => a.indexOf(p) === i)
      .sort((a, b) => a - b)
      .slice(0, 4);
    const TINTAS_EMA = [acento, oroLt, bruma, humo];
    // Sobre la serie ENTERA (`todas`), no sobre el trozo visible — ver la nota
    // de la ventana. Luego se recorta al mismo tramo que las velas.
    const cierres = todas.map(v => v.c);
    const medias = periodos.map((p, i) => ({
      periodo: p,
      tinta: TINTAS_EMA[i % TINTAS_EMA.length],
      alfa: [0.85, 0.72, 0.62, 0.52][i % 4],
      valores: calcularEma(cierres, p).slice(corte0, corte1),
    }));
    for (const m of medias) {
      for (const v of m.valores) {
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (refLinea != null) {
      if (refLinea < min) min = refLinea;
      if (refLinea > max) max = refLinea;
    }

    if (max === min) max = min + (min / 100n + 1n);   // un solo precio: aire artificial
    /* El margen de respiro, y NO es simetrico a proposito. Abajo basta un 6%;
       arriba hace falta mas porque ahi vive la leyenda, y con 6% las velas de
       maximo se metian por detras de las filas O/H/L/C. La leyenda es
       translucida, asi que no borraba el dato — pero leer un maximo a traves
       de un panel es leerlo peor, y el maximo es justo el numero que alguien
       mira en una grafica. Se le reserva el sitio en la ESCALA, que es donde
       se arregla de verdad; taparlo con un recorte lo habria escondido. */
    const margen = (max - min) * 6n / 100n + 1n;
    min = min - margen < 0n ? 0n : min - margen;
    max += margen * 3n;
    const rango = max - min;

    // ── los ticks del eje de precios, antes de la geometría: el ancho del
    // eje depende de cuánto ocupa la etiqueta más gorda ───────────────────
    const paso = pasoLindo(rango / 5n);
    const decPedidos = Number(opciones.decimales);
    const decEje = Number.isInteger(decPedidos) && decPedidos >= 0 && decPedidos <= 18
      ? decPedidos : decimalesDe(paso);
    const ticks = [];
    let tk = (min / paso) * paso;
    if (tk < min) tk += paso;
    for (; tk <= max && ticks.length < 12; tk += paso) ticks.push(tk);

    /* Los decimales de LECTURA (leyenda y pastilla de la cruz) son más finos
       que los del eje: el eje rotula escalones y la lectura rotula un precio
       concreto, y en un precio concreto los últimos decimales son justo lo
       que se fue a mirar. */
    const decFicha = Number.isInteger(decPedidos) && decPedidos >= 0 && decPedidos <= 18
      ? decPedidos : Math.max(unidad === 'USD' ? 2 : 4, decEje);

    // El eje se mide contra la etiqueta MÁS GORDA que va a tener que
    // sostener — las de los ticks y la de la cruz, que lleva más decimales.
    // Medir solo los ticks deja la pastilla de la cruz cortada por el borde.
    ctx.font = MONO;
    let anchoEje = EJE_MIN;
    for (const t of [...ticks, min, max]) {
      const m = ctx.measureText(formatear(t, t === min || t === max ? decFicha : decEje)).width;
      if (m + 16 > anchoEje) anchoEje = m + 16;
    }

    /* ── la geometría con datos: precio arriba, volumen abajo, tiempo al pie
       y el eje de precios a la DERECHA, donde lo esperan ojos de mercado.
       La banda de volumen solo existe si hay volumen: las velas de
       referencia vienen del feed OHLC del metal, que no trae volumen, y una
       banda vacía del 18% sería espacio robado al precio por nada. */
    const der = ancho - anchoEje;
    const pie = alto - ALTO_T;
    const altoUtil = pie - ARRIBA;
    const hayVolumen = maxV > 0n;
    const HUECO = 8;
    const altoVol = hayVolumen ? Math.max(22, Math.round(altoUtil * 0.18)) : 0;
    const altoPrecio = hayVolumen ? altoUtil - altoVol - HUECO : altoUtil;
    const volTecho = ARRIBA + altoPrecio + HUECO;
    const volPie = volTecho + altoVol;
    const yDe = p => ARRIBA + altoPrecio * fraccion(max - p, rango);
    // El camino de vuelta: de un píxel del eje a un precio. Solo para LEER —
    // la pastilla de la cruz — nunca para operar. Por eso puede permitirse
    // pasar por una fracción: nadie compra a este número.
    const precioDe = y => max - (rango * BigInt(Math.round(
      Math.min(1, Math.max(0, (y - ARRIBA) / (altoPrecio || 1))) * 1e6))) / MIRA;

    // ── rejilla y eje de precios ──────────────────────────────────────────
    ctx.textBaseline = 'middle';
    for (const t of ticks) {
      const y = Math.round(yDe(t)) + 0.5;
      ctx.strokeStyle = REJILLA;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(IZQ, y); ctx.lineTo(der, y); ctx.stroke();
      ctx.fillStyle = humo;
      ctx.textAlign = 'left';
      ctx.font = MONO;
      ctx.fillText(formatear(t, decEje), der + 8, y);
    }

    // ── el eje del tiempo: pocas etiquetas, legibles, y la rejilla vertical
    // colgando de ellas — que la rejilla caiga donde caen las etiquetas es
    // lo que hace que se pueda leer «esta vela es de las 14:00» sin contar.
    const pasoX = (der - IZQ) / n;
    const abarca = lista[n - 1].t - lista[0].t;
    const cuantas = Math.max(2, Math.floor((der - IZQ) / 110));
    const cada = Math.max(1, Math.round(n / cuantas));

    /* Qué escribir en el eje del tiempo lo decide el HUECO ENTRE ETIQUETAS,
       no el tramo total: con etiquetas cada trece horas la hora distingue, y
       con etiquetas cada cinco días no distingue nada. La regla:

         hueco de un día o más  → la fecha (y el mes/año si el hueco es de
                                  meses, que si no la fecha se repite al año)
         hueco intradía         → la hora, y la FECHA en la primera etiqueta
                                  de cada día nuevo

       Ese último detalle es el que evita el eje que dice «14:00 · 14:00 ·
       14:00» tres días seguidos. Un eje que se repite no es un eje. */
    const hueco = n > 1 ? (abarca / (n - 1)) * cada : 0;
    const porDia = marco
      ? !MARCOS_INTRADIA.includes(marco) || hueco >= 20 * 3600e3
      : hueco >= 20 * 3600e3;
    const porMes = hueco >= 45 * 86400e3;
    let diaPrevio = null;
    const rotuloT = t => {
      const d = new Date(t);
      const dia = `${d.getFullYear()}/${d.getMonth()}/${d.getDate()}`;
      const nuevo = dia !== diaPrevio;
      diaPrevio = dia;
      if (porMes) return mesAno(t);
      return porDia || nuevo ? fecha(t) : hora(t);
    };

    ctx.textAlign = 'center';
    ctx.font = MONO;
    for (let i = 0; i < n; i += cada) {
      const xC = IZQ + i * pasoX + pasoX / 2;
      if (xC > der - 26) break;                       // no pisar el eje de precios
      ctx.strokeStyle = REJILLA;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(xC) + 0.5, ARRIBA);
      ctx.lineTo(Math.round(xC) + 0.5, hayVolumen ? volPie : ARRIBA + altoPrecio);
      ctx.stroke();
      // La rejilla se queda donde cae la vela, pero la ETIQUETA se corre para
      // no salirse por el borde: media fecha en el margen izquierdo es una
      // fecha que no se puede leer.
      const texto = rotuloT(lista[i].t);
      const w = ctx.measureText(texto).width;
      ctx.fillStyle = humo;
      ctx.fillText(texto, Math.min(Math.max(xC, IZQ + w / 2), der - w / 2), pie + 12);
    }

    // El marco: la vertical del eje de precios y la línea del pie. Discreto
    // pero presente — un panel sin borde flota, y esta gráfica no flota.
    ctx.strokeStyle = linea;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(der) + 0.5, ARRIBA);
    ctx.lineTo(Math.round(der) + 0.5, Math.round(pie) + 0.5);
    ctx.lineTo(IZQ, Math.round(pie) + 0.5);
    ctx.stroke();

    // ── panel de precio, recortado: nada de lo que se dibuje aquí adentro
    // puede derramarse sobre el volumen, los ejes ni la leyenda ───────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(IZQ, ARRIBA, der - IZQ, altoPrecio);
    ctx.clip();

    // La línea de referencia sobre tratos: punteada y ROTULADA, siempre — es
    // un dato informativo del feed, jamás la última operación (principio 2).
    if (refLinea != null) {
      const y = Math.round(yDe(refLinea)) + 0.5;
      ctx.strokeStyle = oro;
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(IZQ, y); ctx.lineTo(der, y); ctx.stroke();
      ctx.setLineDash([]);
      const rotulo = `${opciones.rotulo || T.referencia} ${formatear(refLinea, decEje)}`;
      ctx.font = `600 10px ${SANS}`;
      const wR = ctx.measureText(rotulo).width;
      // Un respaldo oscuro bajo el rótulo: la palabra tiene que leerse aunque
      // caiga encima de una vela.
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(2,22,23,.9)';
      ctx.fillRect(der - wR - 12, y - 15, wR + 8, 13);
      ctx.globalAlpha = 1;
      ctx.fillStyle = oro;
      ctx.textAlign = 'left';
      ctx.fillText(rotulo, der - wR - 8, y - 8);
    }

    // ── las velas ─────────────────────────────────────────────────────────
    const cuerpoW = Math.max(1, Math.min(pasoX * 0.62, 13));
    const xDe = i => IZQ + i * pasoX + pasoX / 2;
    // Las de referencia van un pelo más apagadas que las de tratos: no es
    // decoración, es jerarquía — el trato real siempre pesa más que el cartel.
    ctx.globalAlpha = esReferencia ? 0.9 : 1;
    for (let i = 0; i < n; i++) {
      const v = lista[i];
      const sube = v.c >= v.o;                        // el doji cuenta como jade
      const xC = xDe(i);
      const tinta = sube ? jade : coral;

      // La mecha: de la máxima a la mínima, fina.
      ctx.strokeStyle = tinta;
      ctx.lineWidth = Math.max(1, cuerpoW * 0.14);
      ctx.beginPath();
      ctx.moveTo(Math.round(xC) + 0.5, yDe(v.h));
      ctx.lineTo(Math.round(xC) + 0.5, yDe(v.l));
      ctx.stroke();

      // El cuerpo: de apertura a cierre. Un doji se pinta de 1px de alto para
      // que la vela exista aunque el precio no se haya movido.
      const yO = yDe(v.o), yC = yDe(v.c);
      ctx.fillStyle = tinta;
      ctx.fillRect(xC - cuerpoW / 2, Math.min(yO, yC), cuerpoW, Math.max(1, Math.abs(yO - yC)));
    }
    ctx.globalAlpha = 1;

    // ── las EMAs, encima y sutiles ────────────────────────────────────────
    // Sutiles a propósito: la vela es el dato y la media es la lectura. Una
    // media que grita tapa el dato que pretende explicar.
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'round';
    for (const m of medias) {
      ctx.strokeStyle = m.tinta;
      ctx.globalAlpha = m.alfa;
      ctx.beginPath();
      let trazando = false;
      for (let i = 0; i < n; i++) {
        const v = m.valores[i];
        if (v == null) continue;                      // los primeros n-1: no existen
        const x = xDe(i), y = yDe(v);
        if (trazando) ctx.lineTo(x, y);
        else { ctx.moveTo(x, y); trazando = true; }
      }
      if (trazando) ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';

    // ── la línea del último precio ────────────────────────────────────────
    const ultima = lista[n - 1];
    const subeUlt = ultima.c >= ultima.o;
    const tintaUlt = subeUlt ? jade : coral;
    const yUlt = Math.round(yDe(ultima.c)) + 0.5;
    ctx.strokeStyle = tintaUlt;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(IZQ, yUlt); ctx.lineTo(der, yUlt); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.restore();   // fin del recorte del panel de precio

    // ── el histograma de volumen ──────────────────────────────────────────
    // Con su PROPIA escala (el máximo de la ventana), teñido por la dirección
    // de su vela y a media tinta: es contexto, no protagonista. Que tenga
    // escala propia es lo correcto — el volumen y el precio no comparten
    // unidades y superponerlos en un mismo eje sería una coincidencia
    // dibujada como si fuera una relación.
    if (hayVolumen) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(IZQ, volTecho, der - IZQ, altoVol);
      ctx.clip();
      ctx.strokeStyle = REJILLA;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(IZQ, Math.round(volPie) + 0.5);
      ctx.lineTo(der, Math.round(volPie) + 0.5);
      ctx.stroke();
      for (let i = 0; i < n; i++) {
        const v = lista[i];
        if (v.v <= 0n) continue;
        const hV = Math.max(1, altoVol * fraccion(v.v, maxV));
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = v.c >= v.o ? jade : coral;
        ctx.fillRect(xDe(i) - cuerpoW / 2, volPie - hV, cuerpoW, hV);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── la cruz: imantada a la vela ───────────────────────────────────────
    // La vertical se pega al centro de la vela porque la pregunta del ratón
    // es «¿esta vela?», no «¿este píxel?». La horizontal sí sigue al dedo:
    // ahí la pregunta es «¿a qué precio está esta altura?».
    const cursor = opciones.cursor;
    const dentro = cursor && cursor.x >= IZQ && cursor.x <= der
      && cursor.y >= ARRIBA && cursor.y <= (hayVolumen ? volPie : ARRIBA + altoPrecio);
    const indice = dentro
      ? Math.min(n - 1, Math.max(0, Math.floor((cursor.x - IZQ) / pasoX)))
      : n - 1;
    const enPrecio = dentro && cursor.y <= ARRIBA + altoPrecio;

    if (dentro) {
      const xC = Math.round(xDe(indice)) + 0.5;
      ctx.strokeStyle = 'rgba(243,236,217,.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xC, ARRIBA);
      ctx.lineTo(xC, hayVolumen ? volPie : ARRIBA + altoPrecio);
      ctx.stroke();
      if (enPrecio) {
        const y = Math.round(cursor.y) + 0.5;
        ctx.beginPath(); ctx.moveTo(IZQ, y); ctx.lineTo(der, y); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ── las pastillas de los ejes ─────────────────────────────────────────
    const fp = p => formatear(p, decFicha);

    // La del último precio, del color de la dirección. Se calla si la cruz
    // está pisando su sitio: dos números encimados no son dos números.
    const textoUlt = formatear(ultima.c, decEje);
    ctx.font = MONO_B;
    const wUlt = Math.min(ancho - der - 8,
      Math.max(anchoEje - 10, ctx.measureText(textoUlt).width + 12));
    const chocan = enPrecio && Math.abs(cursor.y - yUlt) < 13;
    if (!chocan) {
      // El destello: el latido del último precio cuando cambia. Lo enciende
      // enganchar() y solo si el usuario no pidió menos movimiento.
      const destello = Math.min(1, Math.max(0, Number(opciones.destello) || 0));
      if (destello > 0) {
        ctx.globalAlpha = 0.35 * destello;
        ctx.fillStyle = tintaUlt;
        caja(ctx, der + 2, yUlt - 12, wUlt + 6, 22, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      pastilla(ctx, der + 5, yUlt - 9, wUlt, 17, tintaUlt, null, textoUlt, pozo, MONO_B);
    }

    if (dentro) {
      if (enPrecio) {
        const textoP = fp(precioDe(cursor.y));
        ctx.font = MONO;
        const wP = Math.min(ancho - der - 8,
          Math.max(anchoEje - 10, ctx.measureText(textoP).width + 12));
        pastilla(ctx, der + 5, Math.round(cursor.y) - 9, wP, 17, FICHA, linea, textoP, crema, MONO);
      }
      // La pastilla del tiempo lleva SIEMPRE fecha y hora completas, mande el
      // marco lo que mande: el eje de abajo puede permitirse abreviar porque
      // rotula muchos puntos, pero quien apunta a una vela concreta está
      // preguntando exactamente cuál, y ahí no se abrevia.
      const vC = lista[indice];
      const textoT = `${fecha(vC.t)} ${hora(vC.t)}`;
      ctx.font = MONO;
      const wT = ctx.measureText(textoT).width + 14;
      let xT = xDe(indice) - wT / 2;
      xT = Math.min(Math.max(xT, IZQ), der - wT);
      pastilla(ctx, xT, pie + 2, wT, 16, FICHA, linea, textoT, crema, MONO);
    }

    // ── la leyenda, arriba a la izquierda, estilo terminal ────────────────
    // Sigue a la cruz; sin cruz enseña la última vela. Que sin ratón muestre
    // la ÚLTIMA y no un guion es deliberado: quien llega a la gráfica quiere
    // saber cómo cerró lo último, no que le pregunten dónde apunta.
    const v = lista[indice];
    const cambio = v.o === 0n ? null : Number((v.c - v.o) * 10000n / v.o) / 100;
    const tintaCambio = cambio == null ? humo : (cambio >= 0 ? jade : coral);
    const emasLeyenda = medias.map(m => ({
      periodo: m.periodo,
      tinta: m.tinta,
      valor: m.valores[indice] == null ? null : fp(m.valores[indice]),
      desde: m.valores.findIndex(x => x != null),
    }));

    const filas = [filaLeyenda1];
    const f2 = [];
    for (const [k, val] of [['O', v.o], ['H', v.h], ['L', v.l], ['C', v.c]]) {
      f2.push({ t: k, tinta: humo });
      f2.push({ t: ' ' + fp(val) + '   ', tinta: k === 'C' ? tintaCambio : crema });
    }
    if (cambio != null) {
      f2.push({ t: (cambio >= 0 ? '+' : '') + cambio.toFixed(2) + '%', tinta: tintaCambio, font: MONO_B });
    }
    filas.push(f2);
    if (emasLeyenda.length) {
      const f3 = [];
      for (const e of emasLeyenda) {
        f3.push({ t: `EMA${e.periodo} `, tinta: e.tinta, font: MONO_B });
        // Un guion cuando la media todavía no existe: en las primeras n-1
        // velas no hay EMA(n), y decirlo es más honesto que enseñar el precio
        // disfrazado de media.
        f3.push({ t: (e.valor == null ? '—' : e.valor) + '   ', tinta: e.tinta });
      }
      filas.push(f3);
    }
    if (hayVolumen) {
      filas.push([{ t: 'V ', tinta: humo }, { t: formatear(v.v, 2), tinta: bruma }]);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let wL = 0;
    for (const f of filas) wL = Math.max(wL, fila(ctx, 0, 0, f, true));
    const hL = filas.length * 15 + 8;
    // Un fondo traslúcido, no sólido: la leyenda se posa sobre la gráfica sin
    // borrar la vela que tiene debajo. La ficha de la cruz sí es sólida —
    // aquella se lee de un vistazo y esta se lee con calma.
    ctx.fillStyle = 'rgba(2,27,28,.72)';
    ctx.fillRect(IZQ + 2, ARRIBA + 2, wL + 20, hL);
    filas.forEach((f, j) => fila(ctx, IZQ + 10, ARRIBA + 13 + j * 15, f, false));

    /* El rótulo accesible dice lo MISMO que la gráfica, ni más ni menos: qué
       par, cuántas velas, el último cierre con su unidad y su cambio — y si
       esto es referencia, lo dice con todas las letras. Un aria-label que
       promete un precio de mercado sobre un cartel informativo es la misma
       mentira, escrita para quien no puede verla. */
    canvas.setAttribute('aria-label', [
      par || (esReferencia ? T.badge : ''),
      marco,
      `${n} ${T.velas}`,
      `${T.ultimo} ${formatear(ultima.c, decFicha)} ${unidad}`,
      cambio == null ? '' : `${cambio >= 0 ? '+' : ''}${cambio.toFixed(2)}%`,
      esReferencia ? T.aviso : '',
    ].filter(Boolean).join(' · '));

    return {
      vacio: null,
      n,
      // Cuantas hay en total y que tramo se esta viendo: `enganchar` lo
      // necesita para saber si la ventana sigue pegada a la punta (y por
      // tanto debe seguir a las velas nuevas) o si la persona se fue atras.
      total: todas.length,
      ventana: { desde: corte0, hasta: corte1 },
      indice: indice < 0 ? indice : corte0 + indice,
      indiceVisible: indice,
      unidad,
      referencia: esReferencia,
      volumen: hayVolumen,
      leyenda: {
        par, marco, unidad,
        o: fp(v.o), h: fp(v.h), l: fp(v.l), c: fp(v.c),
        cambio: cambio == null ? null : Number(cambio.toFixed(2)),
        emas: emasLeyenda.map(e => ({ periodo: e.periodo, valor: e.valor, desde: e.desde })),
      },
    };
  }

  /* ── EL PRECIO DECLARADO ────────────────────────────────────────────────
     Una gráfica distinta para una cosa distinta, y por eso es otra función y
     no un modo de `dibujar`.

     ONDK no cotiza: no hay libro, no hay contraparte, no hay apertura ni
     máximo ni mínimo. Lo que hay es una lista de resoluciones de la Junta.
     Dibujar eso con velas sería inventarle a cada tramo un cuerpo que nunca
     existió — cuatro precios donde solo hubo uno. Se dibuja lo que de verdad
     pasó: una línea que se queda QUIETA en el valor firmado y salta el día
     que la Junta firma otro. Cada salto es un acta que alguien puede pedir.

     Que la línea sea plana entre actas no es una limitación del dibujo: es el
     dato. Un precio declarado que ondula es un precio inventado con rótulo de
     declarado, que es peor que no tener precio.                              */
  function escalones(canvas, serie, opciones = {}) {
    const ctx = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx) return { vacio: 'ilegible', n: 0, indice: -1, leyenda: null };

    const dprPedido = Number(opciones.dpr);
    const dpr = Math.min(3, Math.max(1,
      Number.isFinite(dprPedido) && dprPedido > 0 ? dprPedido : (window.devicePixelRatio || 1)));
    const ancho = canvas.clientWidth || 640;
    const alto = canvas.clientHeight || 320;
    const W = Math.round(ancho * dpr), H = Math.round(alto * dpr);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    const idioma = opciones.idioma === 'en' ? 'en' : 'es';
    const T = TXT[idioma];
    const jade = color('--jade', '#3ED9A0');
    const coral = color('--coral', '#F0776B');
    const oro = color('--oro', '#C9A961');
    const oroLt = color('--oroLt', '#EAD79C');
    const crema = color('--crema', '#F3ECD9');
    const bruma = color('--bruma', '#AEC7C3');
    const humo = color('--humo', '#6E938F');
    const linea = color('--linea', 'rgba(201,169,97,.34)');
    const REJILLA = 'rgba(243,236,217,.07)';
    const FICHA = '#052A2C';

    const par = typeof opciones.par === 'string' ? opciones.par : '';
    const moneda = typeof opciones.moneda === 'string' ? opciones.moneda : 'USD';
    canvas.setAttribute('role', 'img');

    /* Una resolución solo cuenta si trae las cuatro cosas que la hacen
       comprobable: cuándo rige, cuánto, de qué acta y quién firmó. A la que le
       falte una se cae aquí y no llega al lienzo — el mismo criterio que usa
       el API al guardarla, repetido en el dibujo porque esta pieza también se
       come lo que le den de un `fetch` que podría venir de cualquier lado. */
    const filas = (Array.isArray(serie) ? serie : [])
      .map(d => {
        if (!d) return null;
        const t = Date.parse(d.fecha);
        const p = Number(d.precio);
        if (!Number.isFinite(t) || !Number.isFinite(p) || p <= 0) return null;
        if (!d.acta || !String(d.acta).trim()) return null;
        return { t, p, acta: String(d.acta), firmante: String(d.firmante || ''), nota: d.nota || null };
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);

    /* Velas japonesas por defecto, línea escalonada con `estilo:'linea'`. Las
       dos dibujan EL MISMO dato y ninguna añade uno: la vela es el mismo salto
       entre dos actas, contado con un cuerpo en vez de con un escalón. */
    const velasJapo = opciones.estilo !== 'linea';

    const IZQ = 10, ARRIBA = 8, ALTO_T = 20, EJE_MIN = 56;
    const der = ancho - EJE_MIN;
    const pie = alto - ALTO_T;

    const cabecera = [
      par ? { t: par, tinta: crema, font: `600 11.5px ${SANS}` } : null,
      par ? { t: '   ' + moneda, tinta: humo } : { t: moneda, tinta: humo },
      { t: '   ' + T.badgeDecl, tinta: oro, font: MONO_B },
    ].filter(Boolean);

    // La rejilla y el marco se pintan igual haya actas o no: el vacío digno
    // de `dibujar`, con el mismo encuadre.
    function marco() {
      ctx.strokeStyle = REJILLA;
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const y = Math.round(ARRIBA + (pie - ARRIBA) * i / 5) + 0.5;
        ctx.beginPath(); ctx.moveTo(IZQ, y); ctx.lineTo(der, y); ctx.stroke();
      }
      for (let i = 1; i < 6; i++) {
        const x = Math.round(IZQ + (der - IZQ) * i / 6) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, ARRIBA); ctx.lineTo(x, pie); ctx.stroke();
      }
      ctx.strokeStyle = linea;
      ctx.beginPath();
      ctx.moveTo(Math.round(der) + 0.5, ARRIBA);
      ctx.lineTo(Math.round(der) + 0.5, Math.round(pie) + 0.5);
      ctx.lineTo(IZQ, Math.round(pie) + 0.5);
      ctx.stroke();
    }

    function cartel() {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const w = fila(ctx, 0, 0, cabecera, true);
      ctx.fillStyle = 'rgba(2,27,28,.72)';
      ctx.fillRect(IZQ + 2, ARRIBA + 2, w + 16, 20);
      fila(ctx, IZQ + 10, ARRIBA + 12, cabecera, false);
    }

    if (filas.length === 0) {
      canvas.setAttribute('aria-label', `${par ? par + ' · ' : ''}${T.sinActas} · ${T.avisoDecl}`);
      marco();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 13px ${SANS}`;
      ctx.fillStyle = bruma;
      ctx.fillText(T.sinActas, (IZQ + der) / 2, (ARRIBA + pie) / 2 - 8);
      ctx.font = `400 11px ${SANS}`;
      ctx.fillStyle = humo;
      ctx.fillText(T.sinActasSub, (IZQ + der) / 2, (ARRIBA + pie) / 2 + 10);
      cartel();
      return { vacio: 'sinActas', n: 0, indice: -1, moneda, declarado: true, leyenda: null };
    }

    /* El eje del tiempo llega hasta HOY, no hasta la última acta: el tramo
       entre la última resolución y hoy es precisamente el que dice «esto es
       lo que rige ahora mismo», y cortarlo en la última firma escondería
       cuánto lleva sin revisarse. `ahora` entra por opciones para que la
       prueba no dependa del reloj. */
    const ahora = Number.isFinite(opciones.ahora) ? opciones.ahora : Date.now();
    const t0 = filas[0].t;
    const t1 = Math.max(ahora, filas[filas.length - 1].t);
    const spanT = Math.max(1, t1 - t0);

    let min = filas[0].p, max = filas[0].p;
    for (const f of filas) { if (f.p < min) min = f.p; if (f.p > max) max = f.p; }
    // Un respiro arriba y abajo, y un suelo en cero nunca: la escala arranca
    // donde arrancan los datos. Con una sola resolución no hay rango, así que
    // se abre un ±10% para que la línea no quede pegada a un borde.
    const holgura = (max - min) || Math.max(max * 0.1, 0.01);
    const yMin = min - holgura * 0.35;
    const yMax = max + holgura * 0.35;
    const spanY = Math.max(1e-9, yMax - yMin);

    const X = t => IZQ + (der - IZQ) * (t - t0) / spanT;
    const Y = p => pie - (pie - ARRIBA) * (p - yMin) / spanY;

    marco();

    /* ── el eje de precios ─────────────────────────────────────────────────
       Paso propio y no `pasoLindo`: aquel trabaja en la coma fija de BigInt,
       porque los tratos son dinero de esta casa y se cuentan en wei. Un precio
       declarado es una cifra PUBLICADA en dólares con dos decimales, no un
       saldo que se opera — nadie compra a este número —, así que aquí manda el
       Number y mezclarlo con la coma fija habría sido forzar una conversión
       que no significa nada. */
    const bruto = (yMax - yMin) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
    const paso = [1, 2, 5, 10].map(m => m * mag).find(m => m >= bruto) || mag * 10;
    // Los decimales que el paso deja ocupados, con dos de suelo: en dólares
    // un precio siempre se escribe con centavos.
    const dec = Math.max(2, Math.min(6, Math.ceil(-Math.log10(paso)) + 1));
    ctx.font = MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let p = Math.ceil(yMin / paso) * paso; p <= yMax; p += paso) {
      const y = Y(p);
      if (y < ARRIBA + 6 || y > pie - 2) continue;
      ctx.strokeStyle = REJILLA;
      ctx.beginPath();
      ctx.moveTo(IZQ, Math.round(y) + 0.5); ctx.lineTo(der, Math.round(y) + 0.5); ctx.stroke();
      ctx.fillStyle = humo;
      ctx.fillText(p.toFixed(dec), der + 6, y);
    }

    // ── el eje del tiempo: la fecha de cada acta, y hoy ───────────────────
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = humo;
    ctx.font = MONO;
    let ultimoX = -1e9;
    for (const f of filas) {
      const x = X(f.t);
      // Sin apretujar: si dos actas caen a menos de 46px, la segunda etiqueta
      // se calla. La marca en la línea sigue estando.
      if (x - ultimoX < 46) continue;
      ultimoX = x;
      ctx.fillText(mesAno(f.t), Math.min(der - 14, Math.max(IZQ + 14, x)), pie + 5);
    }

    /* ── el camino del precio, plano entre actas ───────────────────────────
       Plano desde cada acta hasta la siguiente, y un salto vertical el día de
       la firma. Sin curvas ni suavizado: interpolar entre dos resoluciones
       dibujaría precios en fechas en las que la Junta no declaró nada.
       Con velas encima va tenue: ahí es la guía que enseña cuánto tiempo
       estuvo quieto cada precio, que es lo que un cuerpo de vela no dice. */
    ctx.strokeStyle = velasJapo ? 'rgba(201,169,97,.30)' : oro;
    ctx.lineWidth = velasJapo ? 1 : 2;
    ctx.beginPath();
    let yPrev = null;
    filas.forEach((f, i) => {
      const x = X(f.t), y = Y(f.p);
      if (yPrev === null) ctx.moveTo(x, y);
      else { ctx.lineTo(x, yPrev); ctx.lineTo(x, y); }   // el salto de la firma
      ctx.lineTo(i + 1 < filas.length ? X(filas[i + 1].t) : X(t1), y);
      yPrev = y;
    });
    ctx.stroke();

    const vig = filas[filas.length - 1];

    /* ── LAS VELAS JAPONESAS ───────────────────────────────────────────────
       Una vela por resolución. Y las cuatro cifras de cada una salen de
       precios que la Junta firmó de verdad, ninguna de una invención:

         apertura = el precio declarado ANTERIOR
         cierre   = el precio declarado de ESTA acta
         máximo   = el mayor de los dos
         mínimo   = el menor de los dos

       Por eso NO llevan mecha. Una mecha dice «entre medias el precio llegó
       hasta aquí», y entre dos actas no hubo operaciones: no hay un máximo
       intradía que contar. Dibujarle mechas a esto sería inventar justo la
       parte que no existe — y quedaría más bonito, que es exactamente lo que
       hace peligrosa esa tentación.

       La primera es un doji: nace en su propio precio, porque antes de la
       primera resolución no había ninguno. */
    if (velasJapo) {
      // Ancho por hueco disponible, con suelo y techo: con cinco actas en dos
      // años el hueco es enorme y una vela de 200px de ancho no se lee.
      const hueco = (der - IZQ) / Math.max(1, filas.length);
      const anchoV = Math.max(7, Math.min(30, hueco * 0.42));

      filas.forEach((f, i) => {
        const apertura = i === 0 ? f.p : filas[i - 1].p;
        const cierre = f.p;
        const x = X(f.t);
        const yA = Y(apertura), yC = Y(cierre);
        const arriba = Math.min(yA, yC);
        // Suelo de 2px: un cuerpo de cero píxeles (el doji, o dos actas al
        // mismo precio) desaparecería del lienzo y esa vela existe igual.
        const altoV = Math.max(2, Math.abs(yC - yA));
        const tinta = cierre > apertura ? jade : cierre < apertura ? coral : oro;

        ctx.fillStyle = tinta;
        ctx.globalAlpha = 0.82;
        ctx.fillRect(Math.round(x - anchoV / 2), Math.round(arriba), Math.round(anchoV), Math.round(altoV));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = tinta;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(Math.round(x - anchoV / 2) + 0.5, Math.round(arriba) + 0.5,
          Math.round(anchoV) - 1, Math.round(altoV) - 1);
      });
    } else {
      // El tramo vigente, remarcado: es el único precio que rige hoy.
      ctx.strokeStyle = oroLt;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(X(vig.t), Y(vig.p));
      ctx.lineTo(X(t1), Y(vig.p));
      ctx.stroke();

      // Una marca redonda en cada firma: cada punto es un acta.
      for (const f of filas) {
        ctx.beginPath();
        ctx.arc(X(f.t), Y(f.p), 3.4, 0, Math.PI * 2);
        ctx.fillStyle = FICHA; ctx.fill();
        ctx.strokeStyle = oroLt; ctx.lineWidth = 1.6; ctx.stroke();
      }
    }

    // ── la pastilla del precio vigente, en el eje ─────────────────────────
    const txtVig = vig.p.toFixed(dec);
    ctx.font = MONO_B;
    const wVig = ctx.measureText(txtVig).width + 12;
    pastilla(ctx, der + 2, Y(vig.p) - 9, Math.min(wVig, EJE_MIN - 4), 18, oro, oro, txtVig, '#04191A', MONO_B);

    /* ── la cruz ───────────────────────────────────────────────────────────
       Se posa en la resolución que REGÍA en esa fecha, no en la más cercana:
       si el cursor está en abril y la última acta es de enero, lo que hay que
       leer es la de enero, que es la que estaba vigente ese día. */
    let indice = filas.length - 1;
    const cur = opciones.cursor;
    if (cur && Number.isFinite(cur.x)) {
      const tCur = t0 + spanT * (Math.min(der, Math.max(IZQ, cur.x)) - IZQ) / (der - IZQ);
      indice = 0;
      for (let i = 0; i < filas.length; i++) if (filas[i].t <= tCur) indice = i;
    }
    const sel = filas[indice];

    if (cur && Number.isFinite(cur.x)) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(243,236,217,.28)';
      ctx.lineWidth = 1;
      const xs = Math.round(X(sel.t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(xs, ARRIBA); ctx.lineTo(xs, pie); ctx.stroke();
      ctx.restore();
    }

    // ── la leyenda: qué acta, quién firmó, desde cuándo ───────────────────
    const d = new Date(sel.t);
    const fechaLarga = `${dosD(d.getDate())}/${dosD(d.getMonth() + 1)}/${d.getFullYear()}`;

    /* Las cifras de la vela seleccionada. Se enseñan las CUATRO, y la de
       apertura dice de dónde sale: es el precio del acta anterior, no un dato
       aparte. Quien lee una vela espera que apertura y cierre sean dos
       momentos del mismo período; aquí son dos resoluciones, y decirlo es lo
       que impide que esta gráfica se lea como una de mercado. */
    const aper = indice === 0 ? sel.p : filas[indice - 1].p;
    const sube = sel.p > aper, baja = sel.p < aper;
    const tintaV = sube ? jade : baja ? coral : oro;
    const filaOC = velasJapo ? [
      { t: 'A ', tinta: humo }, { t: aper.toFixed(dec), tinta: bruma, font: MONO },
      { t: '  C ', tinta: humo }, { t: sel.p.toFixed(dec), tinta: tintaV, font: MONO_B },
      { t: '  M ', tinta: humo }, { t: Math.max(aper, sel.p).toFixed(dec), tinta: bruma, font: MONO },
      { t: '  m ', tinta: humo }, { t: Math.min(aper, sel.p).toFixed(dec), tinta: bruma, font: MONO },
    ] : null;

    const lineas = [
      cabecera.concat([{ t: `   ${sel.p.toFixed(dec)}`, tinta: oroLt, font: MONO_B }]),
      filaOC,
      [
        { t: `${T.acta} `, tinta: humo },
        { t: sel.acta, tinta: crema, font: MONO_B },
        { t: `   ${T.desde} `, tinta: humo },
        { t: fechaLarga, tinta: bruma, font: MONO },
      ],
      sel.firmante ? [{ t: `${T.firma} `, tinta: humo }, { t: sel.firmante, tinta: bruma }] : null,
      velasJapo ? [{ t: T.sinMecha, tinta: humo, font: `400 10px ${SANS}` }] : null,
      [{ t: T.avisoDecl, tinta: oro, font: `400 10px ${SANS}` }],
    ].filter(Boolean);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let wL = 0;
    for (const f of lineas) wL = Math.max(wL, fila(ctx, 0, 0, f, true));
    const hL = 8 + lineas.length * 15;
    ctx.fillStyle = 'rgba(2,27,28,.72)';
    ctx.fillRect(IZQ + 2, ARRIBA + 2, wL + 20, hL);
    lineas.forEach((f, j) => fila(ctx, IZQ + 10, ARRIBA + 13 + j * 15, f, false));

    /* El rótulo accesible dice lo mismo, incluido el aviso: quien no ve la
       gráfica tiene que enterarse igual de que esto no es precio de mercado. */
    canvas.setAttribute('aria-label', [
      par, `${filas.length} ${T.resoluciones}`,
      `${vig.p.toFixed(dec)} ${moneda}`,
      `${T.acta} ${vig.acta}`,
      // Lo de la mecha va también aquí: quien lee con lector de pantalla no
      // puede notar por su cuenta que estas velas no la llevan.
      velasJapo ? T.sinMecha : '',
      T.avisoDecl,
    ].filter(Boolean).join(' · '));

    return {
      vacio: null,
      n: filas.length,
      indice,
      moneda,
      declarado: true,
      velas: velasJapo,
      leyenda: {
        par, moneda,
        precio: sel.p, acta: sel.acta, firmante: sel.firmante,
        fecha: new Date(sel.t).toISOString(),
        // Las cuatro cifras de la vela, para que una prueba pueda comprobar
        // que ninguna se inventó: la apertura ES el cierre de la anterior.
        o: aper, c: sel.p, h: Math.max(aper, sel.p), l: Math.min(aper, sel.p),
        vigente: { precio: vig.p, acta: vig.acta, fecha: new Date(vig.t).toISOString() },
      },
    };
  }

  /* prefers-reduced-motion: si no se puede preguntar, no se anima. Fail-closed
     también para el movimiento — molestar a quien pidió calma es peor que
     quedarse quieto de más. */
  function quieto() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return true; }
  }

  const DESTELLO_MS = 420;

  /* El enchufe con vida: cruz, refresco y redibujo viven en ESTE closure y
     mueren juntos con el apagador que se devuelve. El refresco corre solo con
     la pestaña visible —una gráfica refrescándose detrás de veinte pestañas
     es tráfico que nadie mira— y al volver a la pestaña dispara al instante,
     para no enseñar un mercado congelado. Si obtenerVelas falla, se queda lo
     último pintado: un dato viejo y honesto vale más que un lienzo en blanco,
     y de avisar del tropiezo se encarga quien trae los datos. */
  /* LOS GESTOS DE LA GRAFICA, sueltos de quien la dibuja.
   *
   * Existe aparte porque hay dos formas de usar esta libreria y las dos
   * merecen zoom: `enganchar`, que trae las velas y pinta sola, y quien
   * prefiere pintar el mismo, con su propio reloj y sus propios rotulos —que
   * es como lo hace la sala de mercado—. Meter la rueda dentro de `enganchar`
   * habria dejado sin zoom justo a la pantalla donde mas se necesita.
   *
   * Guarda la VENTANA (que tramo se mira) y avisa cuando cambia. No dibuja
   * nada: quien la usa decide como.
   *
   *   const g = VELAS.gestos(canvas, { total: () => velas.length, alCambiar: pintar });
   *   g.ventana()  ->  {desde,hasta} | null   ·   g.apagar()
   */
  function gestos(canvas, { total, alCambiar } = {}) {
    const cuantas = () => {
      const t = typeof total === 'function' ? Number(total()) : 0;
      return Number.isFinite(t) && t > 0 ? t : 0;
    };
    const avisar = () => { try { alCambiar && alCambiar(ventana); } catch {} };

    let ventana = null;      // null = todo, y pegado a la punta
    let arrastre = null;
    const MIN_VELAS = 12;    // por debajo de una docena ya no es una grafica

    /* Acercar alrededor de la vela SEÑALADA, no del centro: si acercas
       mirando el final, el final se queda quieto. Es la diferencia entre una
       lupa y un salto. */
    function acercar(factor, anclaX) {
      const t = cuantas(); if (!t) return;
      const v = ventana || { desde: 0, hasta: t };
      const largo = v.hasta - v.desde;
      const nuevo = Math.max(MIN_VELAS, Math.min(t, Math.round(largo * factor)));
      if (nuevo === largo) return;
      const ancho = canvas.clientWidth || 1;
      const k = Math.max(0, Math.min(1, (anclaX == null ? ancho / 2 : anclaX) / ancho));
      const foco = v.desde + largo * k;
      let desde = Math.round(foco - nuevo * k);
      desde = Math.max(0, Math.min(t - nuevo, desde));
      ventana = nuevo >= t ? null : { desde, hasta: desde + nuevo };
      avisar();
    }

    /* Correr la vista en VELAS, no en pixeles: «tres velas» significa lo
       mismo con cualquier zoom, «treinta pixeles» no. */
    function correr(delta) {
      const t = cuantas(); if (!t || !delta) return;
      const v = ventana || { desde: 0, hasta: t };
      const largo = v.hasta - v.desde;
      if (largo >= t) return;                 // viendolo todo no hay a donde correr
      let desde = Math.max(0, Math.min(t - largo, Math.round(v.desde + delta)));
      ventana = { desde, hasta: desde + largo };
      avisar();
    }

    function verTodo() { ventana = null; avisar(); }

    /* Si la ventana estaba PEGADA a la punta, sigue pegada cuando entra una
       vela nueva. Si la persona se fue a mirar atras, no se la arrastra hacia
       adelante: una grafica que te devuelve al presente cada treinta segundos
       es una grafica con la que no se puede estudiar nada. */
    function seguirPunta(totalViejo) {
      if (!ventana) return;
      const t = cuantas();
      if (!t || ventana.hasta < totalViejo) return;
      const largo = ventana.hasta - ventana.desde;
      const desde = Math.max(0, t - largo);
      ventana = { desde, hasta: t };
    }

    const alRodar = e => {
      if (!cuantas()) return;
      e.preventDefault();                     // la pagina no se mueve: la grafica se acerca
      const b = canvas.getBoundingClientRect();
      acercar(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX - b.left);
    };
    const alAgarrar = e => {
      if (e.button != null && e.button !== 0) return;
      const b = canvas.getBoundingClientRect();
      arrastre = { x: e.clientX - b.left, movido: 0 };
      canvas.style.cursor = 'grabbing';
      if (canvas.setPointerCapture && e.pointerId != null) {
        try { canvas.setPointerCapture(e.pointerId); } catch {}
      }
    };
    const alArrastrar = e => {
      if (!arrastre) return;
      const b = canvas.getBoundingClientRect();
      const x = e.clientX - b.left;
      const ancho = canvas.clientWidth || 1;
      const t = cuantas();
      const largo = (ventana ? ventana.hasta - ventana.desde : t) || 1;
      const delta = Math.round((arrastre.x - x) * (largo / ancho));
      if (delta !== arrastre.movido) { correr(delta - arrastre.movido); arrastre.movido = delta; }
    };
    const alSoltar = () => { arrastre = null; canvas.style.cursor = 'crosshair'; };
    const alDoble = () => verTodo();          // el gesto que todo el mundo prueba
    /* El teclado no es un extra: quien no puede usar un raton tiene que poder
       recorrer la grafica igual. */
    const alTeclado = e => {
      const t = cuantas();
      const largo = (ventana ? ventana.hasta - ventana.desde : t) || 1;
      const paso = Math.max(1, Math.round(largo / 12));
      if (e.key === 'ArrowLeft') { correr(-paso); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { correr(paso); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { acercar(1 / 1.3, null); e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { acercar(1.3, null); e.preventDefault(); }
      else if (e.key === 'Home' || e.key === 'Escape') { verTodo(); e.preventDefault(); }
    };

    const conPuntero = typeof window !== 'undefined' && 'PointerEvent' in window;
    const mover = conPuntero ? 'pointermove' : 'mousemove';
    const agarrar = conPuntero ? 'pointerdown' : 'mousedown';
    const soltar = conPuntero ? 'pointerup' : 'mouseup';
    const salir = conPuntero ? 'pointerleave' : 'mouseleave';
    canvas.addEventListener('wheel', alRodar, { passive: false });
    canvas.addEventListener(agarrar, alAgarrar);
    canvas.addEventListener(mover, alArrastrar);
    canvas.addEventListener(soltar, alSoltar);
    canvas.addEventListener(salir, alSoltar);
    canvas.addEventListener('dblclick', alDoble);
    canvas.addEventListener('keydown', alTeclado);
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'pan-y';       // arriba y abajo es de la pagina; el lado, de la grafica
    if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');

    return {
      ventana: () => ventana,
      acercar: () => acercar(1 / 1.3, null),
      alejar: () => acercar(1.3, null),
      verTodo,
      seguirPunta,
      apagar() {
        canvas.removeEventListener('wheel', alRodar);
        canvas.removeEventListener(agarrar, alAgarrar);
        canvas.removeEventListener(mover, alArrastrar);
        canvas.removeEventListener(soltar, alSoltar);
        canvas.removeEventListener(salir, alSoltar);
        canvas.removeEventListener('dblclick', alDoble);
        canvas.removeEventListener('keydown', alTeclado);
      },
    };
  }

  function enganchar(canvas, obtenerVelas, cadaMs = 30000) {
    let velas = [];
    let opciones = {};
    let cursor = null;
    let parado = false;
    let ultimoCierre = null;
    let destello = 0;
    let cuadro = 0, latido = 0;

    /* La ventana la lleva VELAS.gestos, que es la misma pieza que usa quien
       pinta por su cuenta: aqui solo se le pregunta y se repinta. */
    let total = 0;
    let mandos = null;

    const pintar = () => {
      if (parado) return;
      const inf = dibujar(canvas, velas, {
        ...opciones, cursor, destello, ventana: mandos && mandos.ventana(),
      });
      if (inf && inf.total != null) total = inf.total;
      return inf;
    };

    /* Un solo dibujo por cuadro de pantalla. Sin esto, un ratón moderno pide
       ciento veinte redibujos por segundo para una pantalla que enseña
       sesenta: la mitad del trabajo se tira a la basura antes de verse. */
    const pedirPintar = () => {
      if (parado || cuadro) return;
      if (typeof requestAnimationFrame !== 'function') return pintar();
      cuadro = requestAnimationFrame(() => { cuadro = 0; pintar(); });
    };

    // El latido del último precio: 420 ms de destello cuando el cierre
    // CAMBIA. Es el único movimiento de esta pieza, y por eso es el único que
    // hay que apagar cuando el sistema pide menos movimiento.
    const encender = () => {
      if (quieto() || typeof requestAnimationFrame !== 'function') { destello = 0; return; }
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (latido) cancelAnimationFrame(latido);
      const paso = () => {
        if (parado) return;
        const ahora = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const k = (ahora - t0) / DESTELLO_MS;
        destello = k >= 1 ? 0 : 1 - k;
        pintar();
        if (destello > 0) latido = requestAnimationFrame(paso);
        else latido = 0;
      };
      latido = requestAnimationFrame(paso);
    };

    async function refrescar() {
      if (parado || document.hidden) return;
      try {
        const r = await obtenerVelas();
        if (parado || r == null) return;
        if (Array.isArray(r)) velas = r;
        else { velas = r.velas || []; opciones = r.opciones || {}; }
        // El cierre se compara como TEXTO: no hace falta saber si son wei o
        // dólares para saber si cambió, y así esta comparación no tiene que
        // cruzar la frontera de tipos.
        const u = velas.length ? velas[velas.length - 1] : null;
        const cierre = u == null ? null : String(Array.isArray(u) ? u[4] : u?.c);
        if (ultimoCierre != null && cierre !== ultimoCierre) encender();
        ultimoCierre = cierre;
        /* Si la ventana estaba PEGADA a la punta, sigue pegada cuando entra
           una vela nueva. Si la persona se fue a mirar atras, no se la
           arrastra hacia adelante: leer el pasado es una intencion, y una
           grafica que te devuelve al presente cada treinta segundos es una
           grafica con la que no se puede estudiar nada. */
        const antes = total;
        total = velas.length;
        if (mandos) mandos.seguirPunta(antes);
        pintar();
      } catch { /* fail-closed de pantalla: sin dato nuevo no se borra el viejo */ }
    }

    const alMover = e => {
      const borde = canvas.getBoundingClientRect();
      cursor = { x: e.clientX - borde.left, y: e.clientY - borde.top };
      pedirPintar();
    };
    const alSalir = () => { cursor = null; pedirPintar(); };

    const alVolver = () => { if (!document.hidden) refrescar(); };
    const alMedir = () => pedirPintar();   // la ventana cambió: misma verdad, otro encuadre

    // Puntero y no ratón: el mismo trazo sirve para el dedo y para el lápiz,
    // y quien no tenga PointerEvent se queda con el ratón de toda la vida.
    const conPuntero = typeof window !== 'undefined' && 'PointerEvent' in window;
    const mover = conPuntero ? 'pointermove' : 'mousemove';
    const salir = conPuntero ? 'pointerleave' : 'mouseleave';
    canvas.addEventListener(mover, alMover);
    canvas.addEventListener(salir, alSalir);
    mandos = gestos(canvas, { total: () => total, alCambiar: pedirPintar });
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('resize', alMedir);
    const reloj = setInterval(() => { if (!document.hidden) refrescar(); }, cadaMs);
    refrescar();

    /* El apagador lleva los mandos colgados: la sala puede poner botones de
       acercar/alejar/todo sin duplicar ni un calculo de este archivo. */
    const apagar = () => {
      parado = true;
      clearInterval(reloj);
      if (cuadro) cancelAnimationFrame(cuadro);
      if (latido) cancelAnimationFrame(latido);
      canvas.removeEventListener(mover, alMover);
      canvas.removeEventListener(salir, alSalir);
      if (mandos) mandos.apagar();
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('resize', alMedir);
    };
    apagar.acercar = () => mandos && mandos.acercar();
    apagar.alejar = () => mandos && mandos.alejar();
    apagar.verTodo = () => mandos && mandos.verTodo();
    return apagar;
  }

  // _piezas se asoma para las pruebas, como en qr.js: se prueba el código
  // real, no una copia que se quedó vieja.
  return {
    dibujar,
    escalones,
    enganchar,
    gestos,
    _piezas: { normalizar, formatear, pasoLindo, decimalesDe, fraccion, calcularEma, deWei, deNumero },
  };
})();

// Para las pruebas de referencia en node, como qr.js: en el navegador esto no
// existe y no molesta.
if (typeof module !== 'undefined') module.exports = VELAS;
