/* Genesis Core · el cerebro en tres dimensiones.
 *
 * ══ POR QUÉ NO HAY LIBRERÍA ════════════════════════════════════════════════
 *
 * Esto podría ser Three.js en tres líneas. No lo es por dos razones concretas:
 * la CSP de esta casa no deja cargar de un CDN, y una pantalla que hay que
 * PROYECTAR en una reunión no puede depender de que un servidor ajeno conteste.
 * Son 74 piezas y unas cuantas miles de partículas — eso lo dibuja un canvas 2D
 * con la proyección hecha a mano, y el archivo entero pesa menos que el
 * favicon de una librería.
 *
 * ══ LOS NÚMEROS SON REALES ═════════════════════════════════════════════════
 *
 * Las neuronas y sus etiquetas salen de `cerebro-datos.js`, que es el mapa de
 * verdad del ecosistema. Las DENDRITAS que salen de cada neurona son textura:
 * no se cuentan, no se etiquetan y no representan nada. Inflar el recuento
 * para que el cerebro se viera más grande sería justo lo que esta casa no
 * hace — y además se cae solo en la primera pregunta.
 *
 * ══ POR QUÉ TODO ESTÁ SEMBRADO ═════════════════════════════════════════════
 *
 * El azar va con semilla fija. Un cerebro que sale distinto en cada carga es
 * un cerebro que nadie puede aprobar: se ve bien una vez, se proyecta al día
 * siguiente y la composición es otra. Con semilla, lo que se aprueba es lo que
 * se ve.
 */
import { GRUPOS, NODOS, ENLACES } from './cerebro-datos.js';

const lienzo = document.getElementById('lienzo');
const ctx = lienzo.getContext('2d', { alpha: false });
const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── el azar con semilla ─────────────────────────────────────────────────────
function sembrar(s) {
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = sembrar(20260818);

// ══ LA FORMA DEL CEREBRO ════════════════════════════════════════════════════
//
// Los centros de cada región van puestos A MANO y no al azar. Un cerebro
// generado sale como una pelota de puntos; uno compuesto tiene lóbulos, tiene
// frente y tiene nuca — y es lo que hace que se lea como un cerebro y no como
// una nube. Las coordenadas son (x izquierda-derecha, y arriba-abajo, z
// frente-fondo) en un espacio de unos ±200.
const CENTROS = {
  identidad:  [   0,  -68,   58],   // la frente: quién es quién
  cadena:     [   0,   14,  -18],   // el tronco, en el centro de todo
  nodo:       [ -18,   64,  -78],   // la nuca: lo que sostiene
  token:      [  74,   10,   16],   // lóbulo derecho
  app:        [ -96,  -18,   22],   // lóbulo izquierdo, grande
  backend:    [ -78,   40,  -30],
  infra:      [  38,   62,  -62],
  dominio:    [ 100,  -36,  -14],
  seguridad:  [ -46,  -62,  -46],
  agente:     [  30,  -74,  -66],   // arriba y atrás: el equipo que mira
  repo:       [ -34,   78,   34],
  abierto:    [  84,   56,   40],   // abajo a la derecha, separado a propósito
  decision:   [  56,  -34,   82],   // adelante: lo que espera respuesta
};

const RADIO_REGION = 34;   // cuánto se dispersan las neuronas de una región

// ── las neuronas ────────────────────────────────────────────────────────────
const porId = new Map();
const neuronas = NODOS.map((n) => {
  const c = CENTROS[n.g] || [0, 0, 0];
  // Dentro de su región, en una esfera. El cubo de la raíz cúbica reparte
  // parejo por VOLUMEN; sin eso se amontonan todas en el borde.
  const u = rnd(), v = rnd(), w = Math.cbrt(rnd());
  const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
  const r = RADIO_REGION * w;
  const nn = {
    id: n.id, nombre: n.n, grupo: n.g, peso: n.peso || 1,
    x: c[0] + r * Math.sin(ph) * Math.cos(th),
    y: c[1] + r * Math.sin(ph) * Math.sin(th),
    z: c[2] + r * Math.cos(ph),
    color: (GRUPOS[n.g] || {}).color || '#8FA0B8',
    fase: rnd() * Math.PI * 2,          // para que no latan todas a la vez
    dendritas: [],
  };
  // Las dendritas: hilos cortos que salen de la neurona. Textura, no datos.
  const cuantas = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < cuantas; i++) {
    const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1);
    const L = 9 + rnd() * 16;
    nn.dendritas.push([
      L * Math.sin(b) * Math.cos(a),
      L * Math.sin(b) * Math.sin(a),
      L * Math.cos(b),
    ]);
  }
  porId.set(n.id, nn);
  return nn;
});

/* ══ CENTRAR Y ESCALAR ══════════════════════════════════════════════════════
   Los centros de región se pusieron a mano mirando la forma, no la aritmética,
   así que el conjunto quedaba corrido a la derecha. En vez de retocar trece
   coordenadas a ojo —y volver a retocarlas cada vez que se agregue una
   región— se calcula el centro de masa una vez y se corre todo para que caiga
   en el origen. Así la cámara siempre apunta al medio del cerebro, tenga las
   regiones que tenga. */
(() => {
  let mx = 0, my = 0, mz = 0;
  for (const n of neuronas) { mx += n.x; my += n.y; mz += n.z; }
  mx /= neuronas.length; my /= neuronas.length; mz /= neuronas.length;
  // Y de paso se agranda: a escala 1 el cerebro ocupaba un pulgar de la
  // pantalla, y esto es una vista para PROYECTAR.
  const ESC = 1.55;
  for (const n of neuronas) {
    n.x = (n.x - mx) * ESC; n.y = (n.y - my) * ESC; n.z = (n.z - mz) * ESC;
    for (const d of n.dendritas) { d[0] *= ESC; d[1] *= ESC; d[2] *= ESC; }
  }
  for (const k of Object.keys(CENTROS)) {
    CENTROS[k] = [(CENTROS[k][0] - mx) * ESC, (CENTROS[k][1] - my) * ESC, (CENTROS[k][2] - mz) * ESC];
  }
})();

// ── los axones ──────────────────────────────────────────────────────────────
const axones = [];
for (const e of ENLACES) {
  const a = porId.get(e[0]), b = porId.get(e[1]);
  // Un enlace a una pieza que ya no existe no se dibuja y no truena: el mapa
  // lo edita una persona y una errata no puede tumbar la proyección.
  if (a && b) axones.push({ a, b });
}

// ── las señales que viajan ──────────────────────────────────────────────────
// Esto es «las pulsaciones»: puntos que recorren un axón de una punta a la
// otra. No representan tráfico medido — representan que la cosa está viva — y
// por eso no llevan número al lado.
const SENALES = quieto ? 0 : 150;
const senales = [];
for (let i = 0; i < SENALES; i++) {
  senales.push({
    ax: axones[Math.floor(rnd() * axones.length)],
    t: rnd(),
    v: 0.0018 + rnd() * 0.0042,
  });
}

// ── las estrellas del fondo ─────────────────────────────────────────────────
const estrellas = [];
for (let i = 0; i < 420; i++) {
  const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), R = 520 + rnd() * 640;
  estrellas.push({
    x: R * Math.sin(b) * Math.cos(a),
    y: R * Math.sin(b) * Math.sin(a),
    z: R * Math.cos(b),
    br: 0.18 + rnd() * 0.55,
  });
}

// ── cámara ──────────────────────────────────────────────────────────────────
/* dist 520 y no 640: con 640 el cerebro entraba entero pero dejaba una franja
   negra abajo y a la derecha, y en una sala grande eso se lee como que la cosa
   es chica. A 520 llena el cuadro y las etiquetas de las regiones de los bordes
   siguen cayendo dentro al girar. */
const cam = { giroY: 0.4, giroX: -0.12, dist: 520, objetivo: 520 };
let arrastrando = false, ultX = 0, ultY = 0, velY = 0.0022;

lienzo.addEventListener('pointerdown', (e) => {
  arrastrando = true; ultX = e.clientX; ultY = e.clientY;
  lienzo.setPointerCapture(e.pointerId);
});
lienzo.addEventListener('pointermove', (e) => {
  if (!arrastrando) return;
  cam.giroY += (e.clientX - ultX) * 0.005;
  cam.giroX += (e.clientY - ultY) * 0.004;
  // Se topa antes del polo: pasado el cenit la escena se da vuelta y quien la
  // está proyectando no sabe cómo volver.
  cam.giroX = Math.max(-1.2, Math.min(1.2, cam.giroX));
  ultX = e.clientX; ultY = e.clientY;
});
addEventListener('pointerup', () => { arrastrando = false; });
lienzo.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.objetivo = Math.max(340, Math.min(1400, cam.objetivo + e.deltaY * 0.8));
}, { passive: false });

// ── tamaño ──────────────────────────────────────────────────────────────────
let W = 0, H = 0, dpr = 1;
function medir() {
  // El dpr se topa en 2: a 3 el móvil dibuja nueve veces los píxeles y la
  // animación se arrastra, y nadie nota la diferencia.
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  lienzo.width = W * dpr; lienzo.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', medir);
medir();

// ── proyección ──────────────────────────────────────────────────────────────
const proy = { x: 0, y: 0, e: 0, z: 0 };
function proyectar(p, cy, sy, cx, sx) {
  // Girar en Y, después en X. En ese orden: al revés el cerebro cabecea en vez
  // de girar sobre su eje, y se marea quien lo mira.
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  const y2 = p.y * cx - z1 * sx;
  const z2 = p.y * sx + z1 * cx;
  const d = cam.dist + z2;
  if (d < 40) { proy.e = -1; return proy; }      // detrás de la cámara
  /* 1150 y no 620: es la distancia focal. Con una lente corta el cerebro
     salía del tamaño de un pulgar en una pantalla de proyección; con esta
     llena el cuadro y además comprime menos la perspectiva, que es lo que hace
     que se lea como un objeto y no como un abanico. */
  const e = 1150 / d;
  proy.x = W / 2 + x1 * e;
  proy.y = H / 2 + y2 * e;
  proy.e = e; proy.z = z2;
  return proy;
}

// ── el latido ───────────────────────────────────────────────────────────────
// Una onda esférica que sale del centro cada PERIODO y recorre el cerebro. Es
// el «pump»: lo que hace que el conjunto se lea como un órgano y no como un
// diagrama. Las neuronas se encienden cuando la onda les pasa por encima.
const PERIODO = 2400;
const VEL_ONDA = 0.42;   // unidades de mundo por milisegundo

function brilloLatido(dist, ahora) {
  const fase = ahora % PERIODO;
  const frente = fase * VEL_ONDA;
  const d = Math.abs(dist - frente);
  return d < 46 ? (1 - d / 46) ** 2 : 0;
}

const txtPulso = document.getElementById('txtPulso');
const listos = [];   // las neuronas, ordenadas por profundidad cada cuadro

function cuadro(ahora) {
  if (!arrastrando && !quieto) cam.giroY += velY;
  cam.dist += (cam.objetivo - cam.dist) * 0.08;

  const cy = Math.cos(cam.giroY), sy = Math.sin(cam.giroY);
  const cx = Math.cos(cam.giroX), sx = Math.sin(cam.giroX);

  // El fondo: no un negro plano sino un pozo con luz al centro, para que el
  // cerebro parezca estar DENTRO de algo.
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, '#071320');
  g.addColorStop(0.55, '#040A12');
  g.addColorStop(1, '#010407');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // ── estrellas ─────────────────────────────────────────────────────────────
  ctx.globalCompositeOperation = 'lighter';
  for (const s of estrellas) {
    const p = proyectar(s, cy, sy, cx, sx);
    if (p.e < 0) continue;
    ctx.fillStyle = `rgba(150,190,230,${s.br * Math.min(1, p.e * 1.4)})`;
    ctx.fillRect(p.x, p.y, 1.3, 1.3);
  }

  // ── axones ────────────────────────────────────────────────────────────────
  // Se dibujan ANTES que las neuronas para que los puntos queden encima de sus
  // propios cables, que es como se ve un circuito de verdad.
  for (const ax of axones) {
    const pa = proyectar(ax.a, cy, sy, cx, sx);
    if (pa.e < 0) continue;
    const ax1 = pa.x, ay1 = pa.y, ae = pa.e;
    const pb = proyectar(ax.b, cy, sy, cx, sx);
    if (pb.e < 0) continue;
    const prof = Math.min(ae, pb.e);
    ctx.strokeStyle = `rgba(90,150,200,${0.05 + prof * 0.10})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }

  // ── señales viajando ──────────────────────────────────────────────────────
  for (const s of senales) {
    s.t += s.v;
    if (s.t > 1) { s.t = 0; s.ax = axones[Math.floor(Math.random() * axones.length)]; }
    const a = s.ax.a, b = s.ax.b;
    const pt = { x: a.x + (b.x - a.x) * s.t, y: a.y + (b.y - a.y) * s.t, z: a.z + (b.z - a.z) * s.t };
    const p = proyectar(pt, cy, sy, cx, sx);
    if (p.e < 0) continue;
    const r = Math.max(0.8, 1.7 * p.e);

    /* La señal se tiñe del color de la región DE DONDE SALE, y solo el núcleo
       queda blanco. En la primera versión todas eran blanco-cian y, con
       doscientas encima, el cerebro entero se lavaba: las regiones perdían su
       color y quedaba una mancha. Teñidas, se ve de dónde a dónde va cada
       cosa, que además es la información que la pieza quiere dar. */
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
    halo.addColorStop(0, tinte(a.color, 0.40 * Math.min(1, p.e)));
    halo.addColorStop(1, tinte(a.color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(240,252,255,${Math.min(0.95, p.e * 0.9)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  }

  // ── neuronas ──────────────────────────────────────────────────────────────
  listos.length = 0;
  for (const n of neuronas) {
    const p = proyectar(n, cy, sy, cx, sx);
    if (p.e < 0) continue;
    n._x = p.x; n._y = p.y; n._e = p.e; n._z = p.z;
    n._d = Math.hypot(n.x, n.y, n.z);
    listos.push(n);
  }
  // De atrás hacia adelante: sin esto las de atrás se dibujan encima de las de
  // adelante y se pierde toda la profundidad.
  listos.sort((a, b) => b._z - a._z);

  for (const n of listos) {
    const late = quieto ? 0.35 : brilloLatido(n._d, ahora);
    const resp = quieto ? 0 : (Math.sin(ahora * 0.0016 + n.fase) * 0.5 + 0.5) * 0.35;
    const vivo = 0.42 + resp * 0.5 + late * 0.9;
    const r = (1.9 + n.peso * 0.95) * n._e * (1 + late * 0.7);

    // Las dendritas, primero y tenues.
    ctx.strokeStyle = n.color + '18';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (const d of n.dendritas) {
      const pd = proyectar({ x: n.x + d[0], y: n.y + d[1], z: n.z + d[2] }, cy, sy, cx, sx);
      if (pd.e < 0) continue;
      ctx.moveTo(n._x, n._y); ctx.lineTo(pd.x, pd.y);
    }
    ctx.stroke();

    // El halo, que es lo que da el brillo de neón sin necesitar un filtro caro.
    /* r*4 y no r*7, y con menos alfa: a siete radios los halos de setenta y
       cuatro neuronas se solapaban hasta dejar una mancha blanca en el medio y
       se perdían los colores de cada región, que es justo lo que hay que ver. */
    const halo = ctx.createRadialGradient(n._x, n._y, 0, n._x, n._y, r * 4);
    halo.addColorStop(0, tinte(n.color, 0.30 * vivo));
    halo.addColorStop(1, tinte(n.color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(n._x, n._y, r * 4, 0, 7); ctx.fill();

    // El núcleo.
    ctx.fillStyle = tinte(n.color, Math.min(1, vivo));
    ctx.beginPath(); ctx.arc(n._x, n._y, r, 0, 7); ctx.fill();
    /* El blanco queda SOLO para el instante en que la onda del latido pasa por
       encima. Antes se encendía casi siempre y el color de la región no se
       llegaba a ver nunca — que es justo lo que hay que ver. */
    if (late > 0.55) {
      ctx.fillStyle = `rgba(255,255,255,${(late - 0.55) * 1.5})`;
      ctx.beginPath(); ctx.arc(n._x, n._y, r * 0.5, 0, 7); ctx.fill();
    }
  }

  // ── las etiquetas de región ───────────────────────────────────────────────
  ctx.globalCompositeOperation = 'source-over';
  const cajas = [];
  for (const clave of Object.keys(CENTROS)) {
    const gr = GRUPOS[clave];
    if (!gr) continue;
    const cuantas = neuronas.filter((n) => n.grupo === clave).length;
    if (!cuantas) continue;
    const c = CENTROS[clave];
    const p = proyectar({ x: c[0], y: c[1], z: c[2] }, cy, sy, cx, sx);
    if (p.e < 0) continue;
    cajas.push({ x: p.x, y: p.y, z: p.z, e: p.e, color: gr.color, nombre: gr.nombre, cuantas });
  }
  // Las de adelante se pintan últimas y tapan a las de atrás, igual que las
  // neuronas. Una etiqueta del fondo encima de una del frente delata que no
  // hay profundidad de verdad.
  cajas.sort((a, b) => b.z - a.z);

  /* ══ QUE LAS ETIQUETAS NO SE PISEN ═══════════════════════════════════════
     Trece regiones proyectadas sobre un cuerpo compacto caen unas encima de
     otras: en la primera versión había cuatro cajas superpuestas y no se leía
     ninguna. Se colocan una por una y, si la nueva choca con alguna ya puesta,
     se empuja hacia abajo hasta que quepa.

     Y como la caja ya no está pegada a su región, se le dibuja una LÍNEA GUÍA
     hasta el punto de origen. Sin esa línea, mover la etiqueta para que se lea
     habría sido mentir sobre dónde está la región. */
  const puestas = [];
  for (const c of cajas) {
    const op = Math.max(0.25, Math.min(1, (c.e - 0.5) * 1.7));
    const w = anchoEtiqueta(c.nombre.toUpperCase(), `${c.cuantas} piezas`);
    const h = 34, sep = 6;
    let ex = c.x + 22, ey = c.y - h / 2;

    for (let intento = 0; intento < 40; intento++) {
      const choca = puestas.find((q) =>
        ex < q.x + q.w + sep && ex + w + sep > q.x &&
        ey < q.y + q.h + sep && ey + h + sep > q.y);
      if (!choca) break;
      ey = choca.y + choca.h + sep;
    }
    // Si el empujón la sacó de la pantalla, se sube en vez de perderla abajo.
    if (ey + h > H - 60) ey = Math.max(70, c.y - h / 2 - (ey + h - (H - 60)));
    puestas.push({ x: ex, y: ey, w, h });

    // La guía, del punto de la región a la caja.
    ctx.strokeStyle = tinte(c.color, 0.30 * op);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(ex - 6, ey + h / 2);
    ctx.stroke();
    ctx.fillStyle = tinte(c.color, 0.9 * op);
    ctx.beginPath(); ctx.arc(c.x, c.y, 2.6, 0, 7); ctx.fill();

    etiqueta(ex, ey + h / 2, c.nombre.toUpperCase(),
             `${c.cuantas} ${c.cuantas === 1 ? 'pieza' : 'piezas'}`, c.color, op, w);
  }

  // El texto del pulso, con el recuento de verdad.
  if (!txtPulso.dataset.puesto) {
    txtPulso.textContent = `${neuronas.length} piezas · ${axones.length} conexiones · ${cajas.length || Object.keys(CENTROS).length} regiones`;
    txtPulso.dataset.puesto = '1';
  }

  requestAnimationFrame(cuadro);
}

/** Una etiqueta como las del cerebro de verdad: caja fina, borde del color de
 *  la región, y el recuento debajo. Se dibuja en canvas y no en HTML para que
 *  respete el orden de profundidad junto con todo lo demás. */
/** El ancho que va a ocupar una etiqueta. Se calcula aparte porque hay que
 *  saberlo ANTES de dibujar, para poder resolver los choques. */
function anchoEtiqueta(titulo, pie) {
  ctx.font = '600 11px ui-monospace,Menlo,monospace';
  const w1 = ctx.measureText(titulo).width;
  ctx.font = '400 10px ui-monospace,Menlo,monospace';
  return Math.max(w1, ctx.measureText(pie).width) + 20;
}

function etiqueta(x, y, titulo, pie, color, op, w) {
  ctx.save();
  ctx.globalAlpha = op;
  const h = 34;

  ctx.fillStyle = 'rgba(3,9,16,.74)';
  ctx.strokeStyle = tinte(color, .75);
  ctx.lineWidth = 1;
  redondo(x, y - h / 2, w, h, 4);
  ctx.fill(); ctx.stroke();

  ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.font = '600 11px ui-monospace,Menlo,monospace';
  ctx.fillText(titulo, x + 10, y - 1);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(160,190,215,.75)';
  ctx.font = '400 10px ui-monospace,Menlo,monospace';
  ctx.fillText(pie, x + 10, y + 12);
  ctx.restore();
}

function redondo(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** #RRGGBB + alfa → rgba(). Los colores del mapa vienen en hexadecimal y el
 *  degradado los necesita con transparencia. */
function tinte(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

requestAnimationFrame(cuadro);
