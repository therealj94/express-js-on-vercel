/* EL NÚCLEO DE ULTRON — el centro de la pantalla.
 *
 * Viene del segundo diseño que mandó José (ULTRON OS · revisión 2): un núcleo
 * circular con anillos, onda radial y pulsaciones que nacen del centro. Sustituye
 * al busto en tres dimensiones, y no por capricho:
 *
 *   · EL BUSTO PEDÍA WEBGL. En un teléfono viejo o con la tarjeta ocupada no se
 *     dibujaba y el centro de ULTRON quedaba en negro. Esto es lienzo 2D: se
 *     dibuja en todo lo que tenga pantalla.
 *   · UNA CARA QUE CASI ES UNA CARA SE VE PEOR QUE NINGUNA. El busto acertaba de
 *     lejos y fallaba de cerca —la boca nunca termina de cuadrar con la voz—.
 *     Un núcleo no promete una cara, así que no la debe: se le mira la energía,
 *     no los labios, y esa sí se puede clavar.
 *   · PESA LA DÉCIMA PARTE. Sin three.js (600 kB), sin geometría, sin luces.
 *
 * ── LO QUE SE CAMBIÓ DEL DISEÑO, Y POR QUÉ ──────────────────────────────────
 *
 * ACOPLE · LA AMPLITUD SALE DEL AUDIO DE VERDAD. El diseño calcula la apertura
 * adivinando en qué letra va el texto por una regla de tres con la duración. Eso
 * se ve vivo y no tiene nada que ver con lo que se está oyendo. Aquí ya existe
 * `mente.nivel`: la envolvente REAL del MP3, sacada en os-boca.js. Se usa esa
 * cuando la hay, y la de visemas solo como respaldo si la voz es la del
 * navegador (que no da envolvente). El núcleo late con lo que suena.
 *
 * ACOPLE · LOS ESTADOS SON LOS DE LA CASA. El diseño trae `update` y `analyze`;
 * la consola maneja idle, listen, think, speak y error. Se mapean, y `error`
 * pinta en rojo con el color que ya usa el resto de la pantalla.
 *
 * ACOPLE · SE MONTA SOLO. Igual que el busto: el diseño dejaba `mount()`
 * exportado y nadie lo llamaba, y el centro quedaba vacío.
 *
 * ACOPLE · RESPETA «MENOS MOVIMIENTO». Con `prefers-reduced-motion` el núcleo
 * se queda quieto y late despacio: sigue diciendo el estado por color y tamaño,
 * sin girar ni disparar ondas.
 */

const PAL = {
  cyan: { hi: '#dffbff', mid: '#05e1ff', low: '#0a5c76' },
  verde: { hi: '#e6fff4', mid: '#5cf2b0', low: '#0d5c46' },
  ambar: { hi: '#fff2d9', mid: '#ffb648', low: '#5c3f0d' },
  rojo: { hi: '#ffe0e4', mid: '#ff5a6e', low: '#5c1420' },
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

/* Apertura por letra, para cuando NO hay envolvente de audio (voz del
   navegador). Es una aproximación honesta: las vocales abren, las labiales
   cierran. */
const VIS = { a: .95, á: .95, e: .7, é: .7, i: .5, í: .5, o: .85, ó: .85, u: .55, ú: .55, m: .12, b: .15, p: .15, f: .3, v: .3, s: .35, l: .4, r: .45, n: .3, d: .35, t: .35, c: .3, g: .35, q: .3, h: .2, j: .3, k: .3, w: .4, x: .3, y: .4, z: .3, ñ: .3 };
function visema(texto, pos) {
  if (!texto) return 0;
  const i = Math.floor(pos), f = pos - i;
  const en = (k) => { const c = (texto[k] || ' ').toLowerCase(); return VIS[c] ?? (/[a-zá-ú]/.test(c) ? .25 : 0); };
  return lerp(en(i), en(i + 1), f);
}

export function mount(canvas, mirar, opts = {}) {
  const ctx = canvas.getContext('2d');
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');
  let dpr = 1, w = 0, h = 0, raf, t0 = performance.now();
  const raton = { x: 0, y: 0 };
  let giro = 0, giroVel = 0, arrastrando = false, ultimoX = 0;
  let amp = 0, ampRapida = 0, nivel = 0, respiro = 0;
  const BINS = 96, bins = new Float32Array(BINS), binsT = new Float32Array(BINS);
  const ondas = [];
  const polvo = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, r: .6 + Math.random() * .9, v: .0004 + Math.random() * .0016, s: .5 + Math.random() * 1.6 }));
  const col = { hi: PAL.cyan.hi, mid: PAL.cyan.mid, low: PAL.cyan.low };
  const mezclar = (a, b, t) => {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const r = Math.round(lerp(A >> 16 & 255, B >> 16 & 255, t)), g = Math.round(lerp(A >> 8 & 255, B >> 8 & 255, t)), bl = Math.round(lerp(A & 255, B & 255, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  };
  let ultimoPulso = 0, ultimoPulso2 = 0, destello = 0;

  canvas.style.touchAction = 'none';
  const alBajar = (e) => { arrastrando = true; ultimoX = e.clientX; giroVel = 0; canvas.setPointerCapture?.(e.pointerId); };
  const alMover = (e) => { if (!arrastrando) return; const dx = e.clientX - ultimoX; ultimoX = e.clientX; giroVel = dx * .0022; giro += giroVel; };
  const alSoltar = () => { arrastrando = false; };
  const alDoble = () => { ondas.push({ r: .04, a: 1, w: 6, v: 1.05, d: .5 }); ondas.push({ r: .02, a: .85, w: 2.4, v: .7, d: .55 }); destello = 1; };
  canvas.addEventListener('pointerdown', alBajar); canvas.addEventListener('pointermove', alMover);
  canvas.addEventListener('pointerup', alSoltar); canvas.addEventListener('pointercancel', alSoltar);
  canvas.addEventListener('dblclick', alDoble);

  function medir() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight; if (!cw || !ch) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
    w = cw; h = ch;
  }

  /* ── primitivas ── */
  function anillo(cx, cy, r, lw, color, alfa, tramos, hueco, rot, irregular) {
    ctx.save(); ctx.lineWidth = lw; ctx.strokeStyle = rgba(color, alfa); ctx.lineCap = 'butt';
    if (!tramos) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); return; }
    const paso = Math.PI * 2 / tramos;
    for (let i = 0; i < tramos; i++) {
      const a0 = rot + i * paso, a1 = a0 + paso * (1 - hueco) * (irregular ? .45 + .55 * ((i * 7919 % 13) / 13) : 1);
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    }
    ctx.restore();
  }
  function marcas(cx, cy, r, n, largo, color, alfa, rot, cada, largoLargo) {
    ctx.save(); ctx.strokeStyle = rgba(color, alfa); ctx.lineWidth = 1.25 * dpr;
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * Math.PI * 2, L = (cada && i % cada === 0) ? largoLargo : largo;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * (r + L), cy + Math.sin(a) * (r + L)); ctx.stroke();
    }
    ctx.restore();
  }
  function aguja(cx, cy, r, a, s, color, alfa) {
    ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a);
    ctx.fillStyle = rgba(color, alfa); ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(-s * .6, s * .62); ctx.lineTo(-s * .6, -s * .62); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function cuadro(ahora) {
    raf = requestAnimationFrame(cuadro); medir(); if (!w) return;
    const t = (ahora - t0) / 1000, dt = 1 / 60;
    const s = mirar() || {}, st = s.state || 'idle';
    const lento = quieto.matches;
    raton.x += ((s.mouse?.x || 0) - raton.x) * .05; raton.y += ((s.mouse?.y || 0) - raton.y) * .05;

    /* color del estado — los mismos que el resto de la consola */
    const destino = st === 'error' ? PAL.rojo : st === 'think' ? PAL.ambar : st === 'listen' ? PAL.verde : PAL.cyan;
    col.hi = mezclar(col.hi, destino.hi, .06); col.mid = mezclar(col.mid, destino.mid, .06); col.low = mezclar(col.low, destino.low, .06);

    /* ACOPLE · la amplitud: primero el audio de verdad, después los visemas,
       y si no hay ninguno, la respiración del estado. */
    let objetivo = 0;
    if (st === 'speak' && typeof s.nivel === 'number' && s.nivel > 0) {
      objetivo = clamp(s.nivel * 1.15, 0, 1);            // envolvente real del MP3
    } else if (st === 'speak' && s.speech) {
      const sp = s.speech, cps = sp.text.length / Math.max(.5, sp.dur / 1000);
      const pos = clamp((sp.charIndex || 0) + ((performance.now() - (sp.boundaryT || sp.t0)) / 1000) * cps, 0, sp.text.length - 1);
      objetivo = visema(sp.text, pos);
    } else if (st === 'speak') objetivo = .35 + Math.abs(Math.sin(t * 7.3)) * .3;
    else if (st === 'listen') objetivo = .18 + Math.abs(Math.sin(t * 2.4)) * .22;
    else if (st === 'think') objetivo = .12 + Math.abs(Math.sin(t * 5.5)) * .1;
    else if (st === 'error') objetivo = .3;
    else objetivo = .07 + Math.sin(t * 1.15) * .025;
    if (lento) objetivo = Math.min(objetivo, .2);

    amp = lerp(amp, objetivo, .18); ampRapida = lerp(ampRapida, objetivo, .5);
    nivel = lerp(nivel, amp, .06); respiro = Math.sin(t * 1.15);

    /* pulsaciones: nacen en el núcleo y se expanden */
    const pulso = (o = {}) => ondas.push({ r: o.r ?? .05, a: o.a ?? 1, w: o.w ?? 2.4, v: o.v ?? .55, d: o.d ?? .55 });
    if (!lento) {
      if (st === 'speak') {
        if (ampRapida > .30 && ahora - ultimoPulso > 62) { pulso({ a: .55 + ampRapida * .6, w: 1.6 + ampRapida * 3.4, v: .5 + ampRapida * .55 }); ultimoPulso = ahora; }
        if (ampRapida > .68 && ahora - ultimoPulso2 > 150) { pulso({ a: 1, w: 5.5, v: .95, d: .5 }); pulso({ r: .32, a: .5, w: 2, v: .7 }); destello = 1; ultimoPulso2 = ahora; }
      } else if (st === 'listen') { if (ahora - ultimoPulso > 260) { pulso({ a: .45, w: 1.6, v: .42 }); ultimoPulso = ahora; } }
      else if (st === 'think') { if (ahora - ultimoPulso > 190) { pulso({ a: .34, w: 1.3, v: .78, d: .8 }); ultimoPulso = ahora; } }
      else if (st === 'error') { if (ahora - ultimoPulso > 340) { pulso({ a: .6, w: 2.6, v: .5 }); ultimoPulso = ahora; } }
      else if (ahora - ultimoPulso > 1150) { pulso({ a: .3, w: 1.4, v: .34, d: .42 }); ultimoPulso = ahora; }
    }
    destello = Math.max(0, destello - dt * 3.4);
    for (let i = ondas.length - 1; i >= 0; i--) { const o = ondas[i]; o.r += dt * o.v * (.6 + o.a * .5); o.a -= dt * o.d; if (o.a <= 0) ondas.splice(i, 1); }

    if (!arrastrando) { giroVel *= .93; giro += giroVel; }
    const auto = lento ? 0 : t * .18;

    /* barras radiales */
    for (let i = 0; i < BINS; i++) {
      const k = i / BINS * Math.PI * 2;
      const n = (Math.sin(k * 3 + t * 6.1) * .5 + Math.sin(k * 7 - t * 4.3) * .3 + Math.sin(k * 13 + t * 9.7) * .2);
      /* Suelo .12, no .035: con el suelo de origen, en reposo las 96 barras
         medían dos píxeles y el anillo de la onda no existía hasta que ULTRON
         hablaba. Un instrumento que solo se ve cuando pasa algo no se lee
         como un instrumento. */
      binsT[i] = clamp(amp * (.45 + .8 * Math.abs(n)) + .12, 0, 1.4);
      bins[i] = lerp(bins[i], binsT[i], st === 'speak' ? .38 : .12);
    }

    /* ── pintar ── */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w * .5 + raton.x * 14, cy = h * (opts.alto ?? .46) + raton.y * 10;
    const R = Math.min(w * .30, h * .34) * (opts.zoom ?? 1);
    ctx.globalCompositeOperation = 'lighter';

    // halo
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.5);
    halo.addColorStop(0, rgba(col.mid, .13 + nivel * .12)); halo.addColorStop(.35, rgba(col.low, .07)); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(cx - R * 2.5, cy - R * 2.5, R * 5, R * 5);

    // anillos exteriores
    anillo(cx, cy, R * 1.52, 1 * dpr, col.mid, .16, 0, 0, 0);
    marcas(cx, cy, R * 1.46, 96, 4 * dpr, col.mid, .26 + nivel * .3, giro * .4 + auto * .3 + t * .04, 8, 11 * dpr);
    anillo(cx, cy, R * 1.30, 2.5 * dpr, col.mid, .3 + nivel * .35, 5, .34, -giro * .8 - auto - t * .12, true);
    anillo(cx, cy, R * 1.20, 1 * dpr, col.mid, .2, 0, 0, 0);
    anillo(cx, cy, R * 1.09, 6 * dpr, col.low, .5, 3, .5, giro * 1.3 + auto * 1.6 + t * (st === 'think' ? .9 : .22));
    anillo(cx, cy, R * 1.02, 1.5 * dpr, col.mid, .45 + nivel * .4, 0, 0, 0);
    for (let i = 0; i < 3; i++) aguja(cx, cy, R * 1.38, giro * .6 + auto + t * .18 + i * Math.PI * 2 / 3, 7 * dpr, col.hi, .5 + nivel * .4);

    // pulsaciones
    ondas.forEach((o) => {
      const rr = R * o.r, a = clamp(o.a, 0, 1);
      if (rr < 2) return;
      const fade = a * clamp(1.25 - o.r * .5, 0, 1);
      ctx.save();
      ctx.lineWidth = o.w * dpr; ctx.strokeStyle = rgba(col.hi, fade * .6);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = o.w * 5 * dpr; ctx.strokeStyle = rgba(col.mid, fade * .11);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      if (o.w > 3) {
        ctx.lineWidth = 1.1 * dpr; ctx.strokeStyle = rgba(col.hi, fade * .3);
        ctx.beginPath();
        for (let i = 0; i <= 72; i++) { const a2 = i / 72 * Math.PI * 2, k = rr * (1 + .022 * Math.sin(a2 * 9 + o.r * 8)); const x = cx + Math.cos(a2) * k, y = cy + Math.sin(a2) * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
    });

    // onda radial
    const base = R * .70, tramo = R * .30;
    for (let i = 0; i < BINS; i++) {
      const a = i / BINS * Math.PI * 2 + giro * .25 + auto * .4;
      const L = tramo * bins[i], x0 = cx + Math.cos(a) * base, y0 = cy + Math.sin(a) * base;
      const x1 = cx + Math.cos(a) * (base + L), y1 = cy + Math.sin(a) * (base + L);
      ctx.lineWidth = 2.2 * dpr; ctx.strokeStyle = rgba(col.mid, .3 + bins[i] * .6);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      if (bins[i] > .5) { ctx.fillStyle = rgba(col.hi, (bins[i] - .5) * .9); ctx.beginPath(); ctx.arc(x1, y1, 1.7 * dpr, 0, Math.PI * 2); ctx.fill(); }
      const L2 = L * .45;
      ctx.lineWidth = 1.4 * dpr; ctx.strokeStyle = rgba(col.low, .35 + bins[i] * .3);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(cx + Math.cos(a) * (base - L2), cy + Math.sin(a) * (base - L2)); ctx.stroke();
    }
    anillo(cx, cy, base, 1.2 * dpr, col.mid, .5, 0, 0, 0);

    // anillos internos
    anillo(cx, cy, R * .58, 4 * dpr, col.low, .55, 7, .28, -giro * 1.6 - t * (st === 'think' ? 1.1 : .35), true);
    anillo(cx, cy, R * .48, 1.2 * dpr, col.mid, .4, 0, 0, 0);
    anillo(cx, cy, R * (.40 + nivel * .05), 2 * dpr, col.hi, .35 + nivel * .5, 0, 0, 0);
    marcas(cx, cy, R * .43, 36, 3 * dpr, col.mid, .3, giro * 2 + t * .5, 9, 8 * dpr);

    /* EL NÚCLEO. El diseño lo pintaba con un centro blanco al 95 % sobre modo
       «lighter»: en pantalla eso no es una esfera de energía, es un punto
       quemado —una mancha blanca sin forma, como una foto sobreexpuesta—. Lo
       que hace que se vea REAL no es más brillo: es que se le distingan las
       capas. Tres, de fuera adentro: la corona que se difumina, el cuerpo con
       su color, y un punto caliente PEQUEÑO que no llega a blanco puro salvo
       cuando de verdad está hablando fuerte. */
    const cr = R * (.30 + nivel * .16 + respiro * .012 + destello * .07);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    g.addColorStop(0, rgba(col.hi, .62)); g.addColorStop(.22, rgba(col.mid, .58));
    g.addColorStop(.48, rgba(col.mid, .3)); g.addColorStop(.78, rgba(col.low, .16)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
    /* El punto caliente: chico (un cuarto del núcleo, no la mitad) y con el
       blanco atado al nivel de voz. En reposo se ve el color de ULTRON; solo
       una sílaba fuerte lo lleva al blanco. */
    const gh = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * .26);
    gh.addColorStop(0, `rgba(255,255,255,${(.42 + nivel * .5 + destello * .2).toFixed(3)})`);
    gh.addColorStop(.5, rgba(col.hi, .34)); gh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gh; ctx.beginPath(); ctx.arc(cx, cy, cr * .26, 0, Math.PI * 2); ctx.fill();
    /* Y el borde: una esfera sin canto se lee como una mancha. Este aro fino,
       más marcado abajo, es lo que le da volumen. */
    ctx.save(); ctx.lineWidth = 1.4 * dpr; ctx.strokeStyle = rgba(col.hi, .3 + nivel * .35);
    ctx.beginPath(); ctx.arc(cx, cy, cr * .74, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.4 * dpr; ctx.strokeStyle = rgba(col.mid, .22 + nivel * .3);
    ctx.beginPath(); ctx.arc(cx, cy, cr * .74, Math.PI * .18, Math.PI * .82); ctx.stroke();
    ctx.restore();
    if (destello > .02) {
      const gf = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * (1.5 + destello));
      gf.addColorStop(0, rgba(col.hi, .5 * destello)); gf.addColorStop(.5, rgba(col.mid, .22 * destello)); gf.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gf; ctx.beginPath(); ctx.arc(cx, cy, cr * (1.5 + destello), 0, Math.PI * 2); ctx.fill();
    }

    // lente facetada
    ctx.save(); ctx.lineWidth = 1 * dpr; ctx.strokeStyle = rgba(col.hi, .22 + nivel * .3);
    for (let i = 0; i < 6; i++) {
      const a = t * .3 + giro + i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * cr * .34, cy + Math.sin(a) * cr * .34); ctx.lineTo(cx + Math.cos(a) * cr * .95, cy + Math.sin(a) * cr * .95); ctx.stroke();
    }
    ctx.restore();

    // orbitales de pensamiento
    if (st === 'think' && !lento) for (let i = 0; i < 3; i++) {
      const a = t * (1.6 + i * .5) + i * 2.1, r = R * (1.14 + i * .1);
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * .34;
      ctx.fillStyle = rgba(col.hi, .8); ctx.beginPath(); ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(col.mid, .18); ctx.beginPath(); ctx.arc(px, py, 10 * dpr, 0, Math.PI * 2); ctx.fill();
    }

    // polvo
    if (!lento) polvo.forEach((d) => {
      d.a += d.v * (st === 'think' ? 3 : 1); d.r += (st === 'think' ? -.0012 : .0004);
      if (d.r > 2.1) d.r = .6; if (d.r < .55) d.r = 2.1;
      ctx.fillStyle = rgba(col.mid, .28);
      ctx.beginPath(); ctx.arc(cx + Math.cos(d.a) * R * d.r, cy + Math.sin(d.a) * R * d.r * .9, d.s * dpr * .8, 0, Math.PI * 2); ctx.fill();
    });

    ctx.globalCompositeOperation = 'source-over';
  }

  raf = requestAnimationFrame(cuadro);
  return {
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', alBajar); canvas.removeEventListener('pointermove', alMover);
      canvas.removeEventListener('pointerup', alSoltar); canvas.removeEventListener('pointercancel', alSoltar);
      canvas.removeEventListener('dblclick', alDoble);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

/* ── ACOPLE · SE MONTA SOLO, Y SE PUEDE CAMBIAR ──────────────────────────────
   El núcleo es lo que se ve por omisión. El busto en tres dimensiones sigue
   estando: se pide con `?figura=busto` o desde el panel, y entonces —y solo
   entonces— se descarga three.js. Quien no lo pide no paga sus 600 kB. */
const FIGURA = 'ultron.figura';
export function figuraActual() {
  const u = new URLSearchParams(location.search).get('figura');
  if (u === 'busto' || u === 'nucleo') return u;
  try { return localStorage.getItem(FIGURA) === 'busto' ? 'busto' : 'nucleo'; } catch { return 'nucleo'; }
}

let vivo = null;
async function montar() {
  const cv = document.getElementById('holo');
  if (!cv) return;
  document.getElementById('sin-holo')?.remove();
  cv.style.display = 'block';
  if (vivo) { try { vivo.dispose(); } catch { /* ya estaba suelto */ } vivo = null; }

  const mirarMente = () => (typeof window.__ULTRON_MENTE === 'function' ? window.__ULTRON_MENTE() : { state: 'idle' });

  if (figuraActual() === 'busto') {
    try {
      const busto = await import('./os-holo.js');
      vivo = busto.mount(cv, mirarMente, innerWidth < 860 ? { zoom: 0.72, mira: 0.42 } : {});
      window.__ULTRON_FIGURA = 'busto'; window.__ULTRON_FIGURA_VIVA = vivo; window.ULTRON_HOLO_LISTO = true;
      window.dispatchEvent(new Event('ultron-holo-ready'));
      return;
    } catch (e) {
      /* Sin WebGL o sin tarjeta. No se deja el hueco: se cae al núcleo, que se
         dibuja en cualquier cosa. Antes esto dejaba un rectángulo negro. */
      console.warn('[figura] el busto no se pudo dibujar, va el núcleo:', e && e.message);
      try { localStorage.setItem(FIGURA, 'nucleo'); } catch { /* modo privado */ }
    }
  }
  /* El núcleo se sube un poco en el escritorio: debajo vive lo que ULTRON
     dice, y centrado del todo le comía el globo. */
  vivo = mount(cv, mirarMente, innerWidth < 860 ? { zoom: 0.86, alto: 0.42 } : { alto: 0.46 });
  window.__ULTRON_FIGURA = 'nucleo'; window.__ULTRON_FIGURA_VIVA = vivo; window.ULTRON_HOLO_LISTO = true;
  window.dispatchEvent(new Event('ultron-holo-ready'));
}

export function cambiarFigura(cual) {
  try { localStorage.setItem(FIGURA, cual === 'busto' ? 'busto' : 'nucleo'); } catch { /* modo privado */ }
  return montar();
}

window.UltronNucleo = { mount, montar, cambiarFigura, figuraActual };
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', montar);
else montar();
