/* La gráfica de velas de la casa, dibujada a mano sobre un canvas 2D.
 *
 * Sin librerías y sin CDN por la misma razón que el QR de la billetera va
 * escrito a mano: una casa de cambio cuyo mercado deja de verse porque un
 * tercero cambió una URL no es seria. Todo lo que esta gráfica sabe hacer
 * cabe aquí y se puede leer entero.
 *
 * Dos reglas que este archivo no negocia:
 *
 * 1. EL DINERO NO PASA POR UN FLOTANTE. Los precios y volúmenes llegan como
 *    strings de wei y se manejan con BigInt de punta a punta: mínimos,
 *    máximos, márgenes, pasos del eje y etiquetas. Lo único que se convierte
 *    a Number es una FRACCIÓN acotada (posición relativa 0..1) para
 *    proyectarla a píxeles — un píxel no es dinero, un precio sí.
 *
 * 2. SIN ESTADO GLOBAL. dibujar() es una función de sus parámetros: mismo
 *    canvas, mismas velas y mismas opciones pintan lo mismo. El único estado
 *    con dueño vive en el closure de enganchar(), que es quien instala los
 *    listeners y el temporizador — y devuelve la función que lo apaga todo,
 *    porque quien abre un sondeo es dueño de pararlo.
 *
 * API:
 *   dibujar(canvas, velas, opciones)
 *     velas     [[t0, o, h, l, c, v], …] como las sirve el API (o,h,l,c,v en
 *               strings de wei; t0 época en ms o s, se normaliza). También se
 *               aceptan objetos { t0, o, h, l, c, v } — es la forma en que
 *               viven en la colección, y aceptar ambas evita un adaptador.
 *     opciones  { referencia?: string de wei — línea punteada rotulada,
 *                 cursor?: { x, y } en px CSS relativos al canvas — la cruz,
 *                 idioma?: 'es'|'en' }
 *   enganchar(canvas, obtenerVelas, cadaMs = 30000)
 *     obtenerVelas() → velas | { velas, opciones } (o promesa de eso).
 *     Instala ratón + refresco solo-con-pestaña-visible y devuelve el
 *     apagador.
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
  function normalizar(cruda) {
    const [t, o, h, l, c, v] = Array.isArray(cruda)
      ? cruda
      : [cruda?.t0, cruda?.o, cruda?.h, cruda?.l, cruda?.c, cruda?.v];
    try {
      const vela = { t: Number(t), o: BigInt(o), h: BigInt(h), l: BigInt(l), c: BigInt(c), v: BigInt(v ?? 0) };
      if (!Number.isFinite(vela.t) || vela.t <= 0) return null;
      // Las dos convenciones de época conviven en el mundo; hasta el año
      // 33658 un valor en segundos queda por debajo de 1e12 y se distingue.
      if (vela.t < 1e12) vela.t *= 1000;
      if (vela.h < vela.l || vela.v < 0n) return null;
      return vela;
    } catch { return null; }
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
  const SANS = "'Archivo',system-ui,sans-serif";

  // es primero y como respaldo, igual que en toda la casa. Entra por
  // opciones.idioma y no leyendo i18n.js: esta pieza se carga antes que aquel
  // y, sobre todo, todo entra por parámetros.
  const TXT = {
    es: { sinTratos: 'Sin tratos todavía', ilegible: 'No pudimos leer las velas', referencia: 'referencia', velas: 'velas', ultimo: 'último' },
    en: { sinTratos: 'No trades yet', ilegible: 'We couldn’t read the candles', referencia: 'reference', velas: 'candles', ultimo: 'last' },
  };

  const dosD = x => String(x).padStart(2, '0');
  const hora = t => { const d = new Date(t); return `${dosD(d.getHours())}:${dosD(d.getMinutes())}`; };
  const fecha = t => { const d = new Date(t); return `${dosD(d.getDate())}/${dosD(d.getMonth() + 1)}`; };

  // Un mensaje solo, centrado. Se usa para «sin tratos» y para «no pudimos
  // leer» — que son cosas DISTINTAS y se dicen distinto, pero se pintan igual.
  function mensaje(ctx, ancho, alto, texto, tinta) {
    ctx.font = `600 13px ${SANS}`;
    ctx.fillStyle = tinta;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, ancho / 2, alto / 2);
  }

  function dibujar(canvas, velas, opciones = {}) {
    const ctx = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;

    /* devicePixelRatio: el lienzo interno va en píxeles de dispositivo y el
       dibujo en píxeles CSS vía transform — así el texto sale nítido en una
       pantalla densa sin que ninguna cuenta de acá abajo sepa del ratio. El
       tamaño se toca solo si cambió: reasignar width borra el canvas. */
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const ancho = canvas.clientWidth || 640;
    const alto = canvas.clientHeight || 320;
    const W = Math.round(ancho * dpr), H = Math.round(alto * dpr);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    ctx.setLineDash([]);

    const idioma = opciones.idioma === 'en' ? 'en' : 'es';
    const T = TXT[idioma];
    const jade = color('--jade', '#3ED9A0');
    const coral = color('--coral', '#F0776B');
    const oro = color('--oro', '#C9A961');
    const crema = color('--crema', '#F3ECD9');
    const bruma = color('--bruma', '#AEC7C3');
    const humo = color('--humo', '#6E938F');

    // El canvas es una imagen para quien no la ve: el rótulo dice lo mismo
    // que la gráfica — cuántas velas y el último cierre, o el vacío honesto.
    canvas.setAttribute('role', 'img');

    const crudas = Array.isArray(velas) ? velas : [];
    const lista = crudas.map(normalizar).filter(Boolean);

    if (lista.length === 0) {
      // Cero velas y velas ilegibles NO son lo mismo: «sin tratos» es un
      // mercado recién nacido; «no pudimos leer» es un dato roto. Confundir
      // los dos es la clase de mentira amable que la casa no dice.
      const texto = crudas.length === 0 ? T.sinTratos : T.ilegible;
      canvas.setAttribute('aria-label', texto);
      mensaje(ctx, ancho, alto, texto, bruma);
      return;
    }

    const n = lista.length;
    canvas.setAttribute('aria-label',
      `${n} ${T.velas} · ${T.ultimo} ${formatear(lista[n - 1].c, 4)}`);

    // ── autoescala, en wei ────────────────────────────────────────────────
    let referencia = null;
    if (opciones.referencia != null && opciones.referencia !== '') {
      try { referencia = BigInt(opciones.referencia); } catch { /* ilegible: sin línea */ }
    }
    let min = lista[0].l, max = lista[0].h, maxV = 0n;
    for (const v of lista) {
      if (v.l < min) min = v.l;
      if (v.h > max) max = v.h;
      if (v.v > maxV) maxV = v.v;
    }
    /* La referencia entra en la escala: una línea rotulada que quedó fuera
       del encuadre es una línea que no existe, y la referencia se enseña
       justamente para poder compararla con los tratos. */
    if (referencia != null) {
      if (referencia < min) min = referencia;
      if (referencia > max) max = referencia;
    }
    if (max === min) max = min + (min / 100n + 1n);   // un solo precio: aire artificial
    // El margen del 6% respira arriba y abajo; el suelo es cero porque un
    // precio negativo no existe en esta casa.
    const margen = (max - min) * 6n / 100n + 1n;
    min = min - margen < 0n ? 0n : min - margen;
    max += margen;
    const rango = max - min;

    // ── los ticks del eje de precios, antes de la geometría: el ancho del
    // eje depende de cuánto ocupa la etiqueta más gorda ─────────────────────
    const paso = pasoLindo(rango / 4n);
    const decEje = decimalesDe(paso);
    const ticks = [];
    let tk = (min / paso) * paso;
    if (tk < min) tk += paso;
    for (; tk <= max && ticks.length < 12; tk += paso) ticks.push(tk);

    ctx.font = MONO;
    let anchoEje = 34;
    for (const t of ticks) {
      const m = ctx.measureText(formatear(t, decEje)).width;
      if (m + 14 > anchoEje) anchoEje = m + 14;
    }

    // ── la geometría: precios arriba, volumen abajo en franja tenue, hora al
    // pie, eje de precios a la derecha — donde lo esperan ojos de mercado ──
    const izq = 8;
    const der = ancho - anchoEje;
    const arriba = 8;
    const altoUtil = alto - arriba - 18;
    const altoVol = Math.max(24, Math.round(altoUtil * 0.16));
    const altoPrecio = altoUtil - altoVol - 8;
    const volTecho = arriba + altoPrecio + 8;
    const yDe = p => arriba + altoPrecio * fraccion(max - p, rango);

    // ── rejilla y eje de precios ──────────────────────────────────────────
    ctx.textBaseline = 'middle';
    for (const t of ticks) {
      const y = Math.round(yDe(t)) + 0.5;
      ctx.strokeStyle = 'rgba(243,236,217,.07)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(izq, y); ctx.lineTo(der, y); ctx.stroke();
      ctx.fillStyle = humo;
      ctx.textAlign = 'left';
      ctx.fillText(formatear(t, decEje), der + 7, y);
    }

    // ── la línea de referencia: punteada y ROTULADA, siempre — es un dato
    // informativo del feed, jamás la última operación (regla n.º 2) ────────
    if (referencia != null) {
      const y = Math.round(yDe(referencia)) + 0.5;
      ctx.strokeStyle = oro;
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(izq, y); ctx.lineTo(der, y); ctx.stroke();
      ctx.setLineDash([]);
      const rotulo = `${T.referencia} ${formatear(referencia, decEje)}`;
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
      ctx.font = MONO;
    }

    // ── velas y volumen ───────────────────────────────────────────────────
    const pasoX = (der - izq) / n;
    const cuerpoW = Math.max(1, Math.min(pasoX * 0.62, 13));
    for (let i = 0; i < n; i++) {
      const v = lista[i];
      const sube = v.c >= v.o;                       // el doji cuenta como jade
      const xC = izq + i * pasoX + pasoX / 2;
      const tinta = sube ? jade : coral;

      // El volumen primero y tenue: contexto, no protagonista.
      if (maxV > 0n && v.v > 0n) {
        const hV = Math.max(1, altoVol * fraccion(v.v, maxV));
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = tinta;
        ctx.fillRect(xC - cuerpoW / 2, volTecho + altoVol - hV, cuerpoW, hV);
        ctx.globalAlpha = 1;
      }

      // La mecha: de la máxima a la mínima, fina.
      ctx.strokeStyle = tinta;
      ctx.lineWidth = Math.max(1, cuerpoW * 0.14);
      ctx.beginPath();
      ctx.moveTo(xC, yDe(v.h));
      ctx.lineTo(xC, yDe(v.l));
      ctx.stroke();

      // El cuerpo: de apertura a cierre. Un doji se pinta de 1px de alto para
      // que la vela exista aunque el precio no se haya movido.
      const yO = yDe(v.o), yC = yDe(v.c);
      ctx.fillStyle = tinta;
      ctx.fillRect(xC - cuerpoW / 2, Math.min(yO, yC), cuerpoW, Math.max(1, Math.abs(yO - yC)));
    }

    // ── el eje del tiempo: pocas etiquetas y legibles ─────────────────────
    const cuantas = Math.max(2, Math.floor((der - izq) / 110));
    const cada = Math.max(1, Math.round(n / cuantas));
    const abarca = lista[n - 1].t - lista[0].t;
    // Más de dos días a la vista: la hora ya no distingue nada, el día sí.
    const rotuloT = t => (abarca > 48 * 3600 * 1000 ? fecha(t) : hora(t));
    ctx.fillStyle = humo;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < n; i += cada) {
      const xC = izq + i * pasoX + pasoX / 2;
      if (xC > der - 26) break;                      // no pisar el eje de precios
      ctx.fillText(rotuloT(lista[i].t), xC, alto - 5);
    }

    // ── la cruz y su ficha: O H L C V y la hora, pegadas al dedo ──────────
    const cursor = opciones.cursor;
    if (!cursor || cursor.x < izq || cursor.x > der || cursor.y < arriba || cursor.y > volTecho + altoVol) return;

    const i = Math.min(n - 1, Math.max(0, Math.floor((cursor.x - izq) / pasoX)));
    const vela = lista[i];
    const xC = izq + i * pasoX + pasoX / 2;

    // La vertical se imanta al centro de la vela: la pregunta del ratón es
    // «¿esta vela?», no «¿este píxel?». La horizontal sí sigue al dedo.
    ctx.strokeStyle = 'rgba(243,236,217,.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xC, arriba); ctx.lineTo(xC, volTecho + altoVol); ctx.stroke();
    if (cursor.y <= arriba + altoPrecio) {
      ctx.beginPath(); ctx.moveTo(izq, cursor.y); ctx.lineTo(der, cursor.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    const decFicha = Math.max(4, decEje);
    const fp = p => formatear(p, decFicha);
    const filas = [
      { k: '', v: `${fecha(vela.t)} ${hora(vela.t)}`, tinta: color('--oroLt', '#EAD79C') },
      { k: 'O', v: fp(vela.o) },
      { k: 'H', v: fp(vela.h) },
      { k: 'L', v: fp(vela.l) },
      { k: 'C', v: fp(vela.c), tinta: vela.c >= vela.o ? jade : coral },
      { k: 'V', v: formatear(vela.v, 2) },
    ];
    ctx.font = MONO;
    let wF = 96;
    for (const f of filas) {
      const m = ctx.measureText(`${f.k}  ${f.v}`).width;
      if (m + 22 > wF) wF = m + 22;
    }
    const hF = filas.length * 15 + 12;
    // La ficha huye del borde: a la derecha del dedo si cabe, a la izquierda
    // si no — taparle la vela a quien la está mirando sería absurdo.
    let xF = xC + 14;
    if (xF + wF > der) xF = xC - 14 - wF;
    let yF = Math.min(Math.max(cursor.y - hF / 2, arriba), volTecho + altoVol - hF);

    // Fondo sólido a propósito: una ficha translúcida encima de velas es
    // ilegible justo donde más se mira.
    ctx.fillStyle = '#052A2C';
    ctx.strokeStyle = color('--linea', 'rgba(201,169,97,.34)');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(xF, yF, wF, hF, 8);
    ctx.fill(); ctx.stroke();

    ctx.textBaseline = 'middle';
    filas.forEach((f, j) => {
      const y = yF + 13 + j * 15;
      if (f.k) {
        ctx.fillStyle = humo;
        ctx.textAlign = 'left';
        ctx.fillText(f.k, xF + 10, y);
      }
      ctx.fillStyle = f.tinta || crema;
      ctx.textAlign = 'right';
      ctx.fillText(f.v, xF + wF - 10, y);
    });
  }

  /* El enchufe con vida: ratón, refresco y redibujo viven en ESTE closure y
     mueren juntos con el apagador que se devuelve. El refresco corre solo con
     la pestaña visible —una gráfica refrescándose detrás de veinte pestañas
     es tráfico que nadie mira— y al volver a la pestaña dispara al instante,
     para no enseñar un mercado congelado. Si obtenerVelas falla, se queda lo
     último pintado: un dato viejo y honesto vale más que un lienzo en blanco,
     y de avisar del tropiezo se encarga quien trae los datos. */
  function enganchar(canvas, obtenerVelas, cadaMs = 30000) {
    let velas = [];
    let opciones = {};
    let cursor = null;
    let parado = false;

    const pintar = () => { if (!parado) dibujar(canvas, velas, { ...opciones, cursor }); };

    async function refrescar() {
      if (parado || document.hidden) return;
      try {
        const r = await obtenerVelas();
        if (parado || r == null) return;
        if (Array.isArray(r)) velas = r;
        else { velas = r.velas || []; opciones = r.opciones || {}; }
        pintar();
      } catch { /* fail-closed de pantalla: sin dato nuevo no se borra el viejo */ }
    }

    const alMover = e => {
      const caja = canvas.getBoundingClientRect();
      cursor = { x: e.clientX - caja.left, y: e.clientY - caja.top };
      pintar();
    };
    const alSalir = () => { cursor = null; pintar(); };
    const alVolver = () => { if (!document.hidden) refrescar(); };
    const alMedir = () => pintar();   // la ventana cambió: misma verdad, otro encuadre

    canvas.addEventListener('mousemove', alMover);
    canvas.addEventListener('mouseleave', alSalir);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('resize', alMedir);
    const reloj = setInterval(() => { if (!document.hidden) refrescar(); }, cadaMs);
    refrescar();

    return () => {
      parado = true;
      clearInterval(reloj);
      canvas.removeEventListener('mousemove', alMover);
      canvas.removeEventListener('mouseleave', alSalir);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('resize', alMedir);
    };
  }

  // _piezas se asoma para las pruebas, como en qr.js: se prueba el código
  // real, no una copia que se quedó vieja.
  return { dibujar, enganchar, _piezas: { normalizar, formatear, pasoLindo, decimalesDe, fraccion } };
})();

// Para las pruebas de referencia en node, como qr.js: en el navegador esto no
// existe y no molesta.
if (typeof module !== 'undefined') module.exports = VELAS;
