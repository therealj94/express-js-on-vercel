/* Genesis Core · el cerebro en tres dimensiones.
 *
 * ══ POR QUÉ NO HAY LIBRERÍA ════════════════════════════════════════════════
 *
 * Esto podría ser Three.js en tres líneas. No lo es por dos razones concretas:
 * la CSP de esta casa no deja cargar de un CDN, y una pantalla que hay que
 * PROYECTAR en una reunión no puede depender de que un servidor ajeno conteste.
 * Todo lo que hay aquí lo dibuja un canvas 2D con la proyección hecha a mano.
 *
 * ══ LOS NÚMEROS SON REALES ═════════════════════════════════════════════════
 *
 * Hay DOS cosas dibujadas y no se confunden nunca:
 *
 *   1. LAS PIEZAS. Salen de `cerebro-datos.js`, que es el mapa de verdad del
 *      ecosistema. Son las que llevan halo, las que se cuentan y las únicas
 *      que aparecen en una etiqueta.
 *
 *   2. LA MALLA. Los miles de puntitos y los hilos que forman el tejido son
 *      TEXTURA: le dan cuerpo y forma de cerebro al volumen. No se cuentan,
 *      no se etiquetan y no representan nada.
 *
 * Inflar el recuento con la malla para que el cerebro se viera más grande
 * sería justo lo que esta casa no hace — y además se cae solo en la primera
 * pregunta que haga alguien. Por eso el pie de pantalla lo dice en voz alta.
 *
 * ══ POR QUÉ TODO ESTÁ SEMBRADO ═════════════════════════════════════════════
 *
 * El azar va con semilla fija. Un cerebro que sale distinto en cada carga es
 * un cerebro que nadie puede aprobar: se ve bien una vez, se proyecta al día
 * siguiente y la composición es otra. Con semilla, lo que se aprueba es lo que
 * se ve.
 */
import { GRUPOS, NODOS, ENLACES } from './cerebro-datos.js';
import { crearCara } from './cara-3d.js';
import { crearVoz } from './voz-core.js';
import { TEMAS, PRESENTACION, REGIONES } from './guion-core.js';
import { FICHAS, INTERNAS } from './fichas-core.js';
import { crearAmbiente } from './ambiente.js';

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

/* ══ CUÁNTO SE DIBUJA ═══════════════════════════════════════════════════════
   Se decide UNA vez, al abrir, porque de esto depende cuánta malla se
   construye y la malla se arma antes del primer cuadro.

   En un teléfono se dibuja menos, y no por prudencia: son los mismos píxeles
   de tejido repartidos en una décima parte de la superficie. A densidad de
   escritorio, en seis pulgadas la malla se ve como una mancha sólida —se
   pierde el dibujo de la red, que es justo lo que hay que ver— y encima la
   batería se va en rasterizar hilos que nadie distingue.

   Y lo que decide si la pantalla es chica es el LADO CORTO, no el ancho. Un
   teléfono acostado mide 844×390: por ancho pasaba por escritorio, y ahí le
   caían las trece etiquetas de proyector encima de un cerebro de trescientos
   noventa píxeles de alto. Lo que manda es siempre el lado que escasea. */
const ESTRECHO = Math.min(innerWidth, innerHeight) < 620;
const CUANTO = ESTRECHO
  ? { relleno: 620, porPieza: 9, vecinos: 2, senales: 80, trazos: 10, bruma: 18, estrellas: 240 }
  : { relleno: 1300, porPieza: 16, vecinos: 3, senales: 140, trazos: 15, bruma: 30, estrellas: 460 };

/* ══ EL VOLUMEN DEL CEREBRO ═════════════════════════════════════════════════

   La primera versión repartía las regiones en el aire y salía una nube de
   puntos bonita que no era un cerebro. La diferencia entre las dos cosas es
   ésta función: un volumen con lóbulos, con frente, con nuca y con cerebelo,
   dentro del cual TODO lo que se dibuja tiene que caer. Un contorno reconocible
   es lo que hace que alguien que entra a la sala sepa qué está mirando antes de
   que nadie se lo diga.

   Ejes: x izquierda-derecha · y arriba(−)/abajo(+) · z frente(+)/nuca(−). */

const CENTRO_Y = -6;      // el cuerpo del cerebro va un pelo por encima del eje

function dentro(x, y, z) {
  // ── los dos hemisferios ──
  const t = z / 122;
  if (t > -1 && t < 1) {
    /* Se afina hacia el polo frontal y hacia el occipital. Sin este afinado el
       cerebro es un huevo: son las puntas lo que le da la silueta. */
    const afina = Math.sqrt(Math.max(0, 1 - t * t * 0.58));
    const rx = 94 * afina;
    // Aplanado por abajo: un cerebro apoya, no es simétrico de arriba a abajo.
    const ry = (y < CENTRO_Y ? 78 : 54) * afina;
    const yy = (y - CENTRO_Y) / ry;
    if ((x / rx) ** 2 + yy * yy <= 1) {
      // La fisura longitudinal: el canal que separa los dos hemisferios. Es
      // el rasgo que más lo delata como cerebro y cuesta ocho caracteres.
      if (Math.abs(x) < 6.5 && y < CENTRO_Y - 14 && z > -96) return false;
      return true;
    }
  }
  // ── el cerebelo: atrás y abajo ──
  if ((x / 60) ** 2 + ((y - 50) / 30) ** 2 + ((z + 100) / 42) ** 2 <= 1) return true;
  // ── el tronco: lo que baja ──
  if ((x / 17) ** 2 + ((y - 74) / 48) ** 2 + ((z + 46) / 21) ** 2 <= 1) return true;
  return false;
}

/** Empuja un punto hacia adentro del volumen, acercándolo al centro en pasos.
 *  Sin esto, una región puesta un poco afuera dispara sus puntos al vacío y el
 *  contorno del cerebro se deshilacha justo por donde más se nota. */
function meter(x, y, z) {
  for (let k = 0; k < 26; k++) {
    if (dentro(x, y, z)) return [x, y, z];
    x *= 0.94; y = CENTRO_Y + (y - CENTRO_Y) * 0.94; z *= 0.94;
  }
  return [0, CENTRO_Y, 0];
}

/** Un punto al azar REPARTIDO PAREJO por el volumen del cerebro, por rechazo.
 *  Se insiste hasta que cae dentro y no se conforma con el último intento: un
 *  intento fallido devuelto tal cual queda como una mancha suelta flotando
 *  fuera del cerebro, que es exactamente lo que delata el truco. */
function puntoDentro() {
  for (let k = 0; k < 400; k++) {
    const x = (rnd() * 2 - 1) * 96;
    const y = CENTRO_Y + (rnd() * 2 - 1) * 88;
    const z = (rnd() * 2 - 1) * 126;
    if (dentro(x, y, z)) return [x, y, z];
  }
  return [0, CENTRO_Y, 0];
}

/** A qué región pertenece un punto cualquiera del volumen: la del centro más
 *  cercano. Sirve para teñir el relleno que da cuerpo al cerebro. */
function regionDe(x, y, z) {
  let mejor = null, md = Infinity;
  for (const k of Object.keys(CENTROS)) {
    const c = CENTROS[k];
    const d = (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2;
    if (d < md) { md = d; mejor = k; }
  }
  return mejor;
}

/* Los centros de cada región van puestos A MANO y en un lóbulo que tiene
   sentido: identidad y decisión en la frente (lo que mira hacia adelante),
   nodos e infraestructura en la nuca y el cerebelo (lo que sostiene), la cadena
   en el centro de todo. No es anatomía de verdad y no pretende serlo — es una
   composición para que el mapa se recuerde. */
const CENTROS = {
  identidad:  [ -36,  -30,   76],   // frente izquierda: quién es quién
  decision:   [  40,  -26,   80],   // frente derecha: lo que espera respuesta
  seguridad:  [ -50,  -54,   26],   // arriba y adelante
  agente:     [  48,  -52,   22],   // arriba: el equipo que mira
  cadena:     [   0,   -4,   -6],   // el centro exacto: todo pasa por acá
  token:      [  62,    6,   20],   // lóbulo derecho
  app:        [ -66,    4,   16],   // lóbulo izquierdo
  dominio:    [  70,   30,  -18],   // temporal derecho, abajo
  backend:    [ -70,   28,  -22],   // temporal izquierdo, abajo
  repo:       [ -42,  -48,  -58],   // parietal izquierdo, atrás
  abierto:    [  46,  -44,  -62],   // parietal derecho, atrás
  infra:      [  34,   26,  -86],   // occipital derecho
  nodo:       [ -30,   26,  -90],   // occipital izquierdo, hacia el cerebelo
  /* Las tres nuevas, y dónde van no es indiferente. Lo LEGAL ocupa el lóbulo
     temporal izquierdo alto —al lado de identidad, que es su pariente más
     cercano—; la MINERÍA va abajo y atrás, porque es el cimiento; y la JUNTA
     va arriba del todo, encima de todo lo demás, que es exactamente su sitio
     en la casa. */
  legal:      [ -60,  -20,  -46],
  mina:       [  10,   58,   34],
  junta:      [   0,  -66,   -6],
};

/* ══ EL COLOR ═══════════════════════════════════════════════════════════════
   Un proyector lava el color. Los trece tonos del mapa se distinguen perfecto
   en un monitor y en una sala grande se vuelven trece grises parecidos. Se
   sube el croma y se deja el TONO intacto: sigue siendo el color de la región,
   solo que llega hasta el fondo de la sala. */
function avivar(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const L = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  const F = 1.5;
  const ap = (c) => Math.round(Math.max(0, Math.min(255, L + (c - L) * F)));
  r = ap(r); g = ap(g); b = ap(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const COLOR = {};
for (const k of Object.keys(GRUPOS)) COLOR[k] = avivar(GRUPOS[k].color);

// ══ LAS PIEZAS ══════════════════════════════════════════════════════════════
// Éstas SÍ se cuentan: son las que están en el mapa.
const porId = new Map();
const neuronas = NODOS.map((n) => {
  const c = CENTROS[n.g] || [0, CENTRO_Y, 0];
  // Dentro de su región, en una esfera. La raíz cúbica reparte parejo por
  // VOLUMEN; sin eso se amontonan todas contra el borde.
  const u = rnd(), v = rnd(), w = Math.cbrt(rnd());
  const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
  const r = 26 * w;
  const [x, y, z] = meter(
    c[0] + r * Math.sin(ph) * Math.cos(th),
    c[1] + r * Math.sin(ph) * Math.sin(th),
    c[2] + r * Math.cos(ph));
  const nn = {
    // `d` viaja con la pieza: es lo que se enseña al tocarla. Sin esto habría
    // que volver a buscar el nodo en NODOS en cada toque, y el mapa ya está
    // aquí.
    id: n.id, nombre: n.n, grupo: n.g, peso: n.peso || 1, ficha: n.d || '',
    web: n.w || '',
    x, y, z,
    color: COLOR[n.g] || '#9FB4CC',
    fase: rnd() * Math.PI * 2,          // para que no latan todas a la vez
  };
  nn.d = Math.hypot(x, y - CENTRO_Y, z);
  porId.set(n.id, nn);
  return nn;
});

// ══ LA MALLA ════════════════════════════════════════════════════════════════
// TEXTURA. Ni una de éstas se cuenta ni se etiqueta — ver la cabecera.
//
// Es lo que convierte trece manchas sueltas en un tejido: cada región cría una
// nube de puntos alrededor de sus piezas, dentro del volumen, y cada punto se
// ata a sus tres vecinos más cercanos. Eso solo ya dibuja la red poligonal que
// se ve en un cerebro de verdad, sin triangular nada ni cargar una librería.
const VECINOS = CUANTO.vecinos;
const regiones = [];
const porRegion = {};
for (const clave of Object.keys(CENTROS)) porRegion[clave] = [];

const nuevo = (clave, x, y, z) =>
  porRegion[clave].push({ x, y, z, d: Math.hypot(x, y - CENTRO_Y, z), _e: -1 });

/* Primero, el RELLENO: puntos repartidos parejo por todo el volumen y teñidos
   por la región más cercana. Sin este paso el tejido solo existe alrededor de
   las trece regiones y el cerebro sale con agujeros entre lóbulo y lóbulo —
   es decir, sale una constelación otra vez y no una silueta. Este relleno es
   lo único que hace que el CONTORNO se lea. */
for (let i = 0; i < CUANTO.relleno; i++) {
  const [x, y, z] = puntoDentro();
  nuevo(regionDe(x, y, z), x, y, z);
}

/* Y después, el ESPESOR: puntos colgados de las piezas de verdad, para que el
   tejido se densifique donde efectivamente hay algo. Es lo que hace que la
   región de tokens (quince piezas) se vea más cargada que la de código (dos)
   sin necesidad de escribirlo en ningún lado. */
for (const clave of Object.keys(CENTROS)) {
  const piezas = neuronas.filter((n) => n.grupo === clave);
  for (let i = 0; i < piezas.length * CUANTO.porPieza; i++) {
    const base = piezas[Math.floor(rnd() * piezas.length)];
    const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1);
    const R = 6 + Math.cbrt(rnd()) * 28;
    const [x, y, z] = meter(
      base.x + R * Math.sin(b) * Math.cos(a),
      base.y + R * Math.sin(b) * Math.sin(a),
      base.z + R * Math.cos(b));
    nuevo(clave, x, y, z);
  }
}

for (const clave of Object.keys(CENTROS)) {
  const puntos = porRegion[clave];
  if (!puntos.length) continue;

  // Cada punto con sus tres vecinos. Cuadrático, pero son ~150 puntos por
  // región y esto corre UNA vez al abrir, no en cada cuadro.
  const vistas = new Set();
  const aristas = [];
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    const cerca = [];
    for (let j = 0; j < puntos.length; j++) {
      if (i === j) continue;
      const q = puntos[j];
      const dd = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
      cerca.push([dd, j]);
    }
    cerca.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < VECINOS && k < cerca.length; k++) {
      const j = cerca[k][1];
      const llave = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (vistas.has(llave)) continue;
      vistas.add(llave);
      aristas.push([i, j]);
    }
  }

  regiones.push({ clave, color: COLOR[clave] || '#9FB4CC', puntos, aristas });
}

// ── los axones: las conexiones REALES del mapa ──────────────────────────────
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
const SENALES = quieto ? 0 : CUANTO.senales;
const senales = [];
for (let i = 0; i < SENALES; i++) {
  senales.push({
    ax: axones[Math.floor(rnd() * axones.length)],
    t: rnd(),
    /* La mitad de rápidas que antes. Iban tan deprisa que el ojo veía una
       nube de puntos temblando; a este paso se sigue UNA con la vista de una
       pieza a la otra, que es lo que hay que ver: información pasando de una
       cosa a otra. */
    v: 0.0009 + rnd() * 0.0020,
  });
}

/* ══ LOS RAYOS ══════════════════════════════════════════════════════════════
   Un puñado de paquetes gordos que van de pieza a pieza dejando ESTELA, y que
   al llegar saltan a otro cable de la misma pieza — así que no se ve un punto
   yendo y viniendo: se ve algo recorriendo el ecosistema, de la cadena a la
   billetera, de la billetera a la identidad.

   Van aparte de las señales normales y son pocos a propósito. Con muchos el
   efecto se pierde: cien estelas a la vez son una maraña, ocho son ocho cosas
   que uno puede seguir. */
const RAYOS = quieto ? 0 : (ESTRECHO ? 5 : 9);
const ESTELA = 14;                 // cuántas posiciones pasadas se recuerdan
const rayos = [];
for (let i = 0; i < RAYOS; i++) {
  rayos.push({
    ax: axones[Math.floor(rnd() * axones.length)],
    haciaB: rnd() < 0.5,
    t: rnd(),
    v: 0.0026 + rnd() * 0.0022,
    cola: [],
  });
}

/** El siguiente cable que toma un rayo: uno que salga de la pieza donde acaba
 *  de llegar. Si esa pieza no tiene más cables, se queda y vuelve por donde
 *  vino — un rayo que desaparece en un callejón sin salida se lee como un
 *  fallo de dibujo. */
function siguienteCable(rayo, llegada) {
  const salen = axones.filter((x) => (x.a === llegada || x.b === llegada) && x !== rayo.ax);
  const elegido = salen.length ? salen[Math.floor(Math.random() * salen.length)] : rayo.ax;
  rayo.ax = elegido;
  rayo.haciaB = elegido.a === llegada;
  rayo.t = 0;
  rayo.cola.length = 0;
}

/* ══ LOS TRAZOS BLANCOS ═════════════════════════════════════════════════════
   Los filamentos largos que salen del cerebro y se van del cuadro. No son
   datos: son lo que le da ESCALA a la pieza. Sin ellos el cerebro flota
   encerrado en su propio contorno; con ellos se lee como algo que está
   conectado a más cosas de las que caben en la pantalla — que es exactamente
   lo que pasa.

   Cada trazo lleva una curvatura fija propia. Sin curvarlos salen radios
   rectos desde el centro y la cosa parece un sol, no un cerebro. */
const trazos = [];
for (let i = 0; i < CUANTO.trazos; i++) {
  const [x, y, z] = puntoDentro();
  let dx = x, dy = y - CENTRO_Y, dz = z;
  const L = Math.hypot(dx, dy, dz) || 1;
  dx /= L; dy /= L; dz /= L;
  const cur = [(rnd() - 0.5) * 0.085, (rnd() - 0.5) * 0.085, (rnd() - 0.5) * 0.085];

  const pts = [];
  let px = x, py = y, pz = z, paso = 10 + rnd() * 6;
  for (let k = 0; k < 24; k++) {
    pts.push({ x: px, y: py, z: pz, _e: -1 });
    px += dx * paso; py += dy * paso; pz += dz * paso;
    dx += cur[0]; dy += cur[1]; dz += cur[2];
    const m = Math.hypot(dx, dy, dz) || 1;
    dx /= m; dy /= m; dz /= m;
    paso *= 1.025;
  }
  trazos.push({ pts, t: rnd(), v: 0.0011 + rnd() * 0.0022 });
}

// ── la bruma del volumen ────────────────────────────────────────────────────
// Manchas suaves repartidas por dentro. Es lo que hace que el cerebro tenga
// CUERPO: sin ellas se ve el tejido pero se ve a través, como una jaula.
const bruma = [];
for (let i = 0; i < CUANTO.bruma; i++) {
  const [x, y, z] = puntoDentro();
  // Radios chicos y alfas bajas: con manchas grandes cada una se lee como un
  // círculo suelto en vez de fundirse con las de al lado, y en vez de cuerpo
  // se ven cuarenta globos.
  bruma.push({ x, y, z, r: 26 + rnd() * 22, a: 0.020 + rnd() * 0.022 });
}

// ── las estrellas del fondo ─────────────────────────────────────────────────
const estrellas = [];
for (let i = 0; i < CUANTO.estrellas; i++) {
  const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), R = 560 + rnd() * 700;
  estrellas.push({
    x: R * Math.sin(b) * Math.cos(a),
    y: R * Math.sin(b) * Math.sin(a),
    z: R * Math.cos(b),
    br: 0.18 + rnd() * 0.55,
  });
}

// ── cámara ──────────────────────────────────────────────────────────────────
const cam = { giroY: 0.42, giroX: -0.14, dist: 430, objetivo: 430 };
const VEL_GIRO = 0.0020;
let tope = [250, 1100];      // hasta dónde deja acercar y alejar el pellizco

/* ══ EL ENCUADRE SE CALCULA, NO SE ESCRIBE ══════════════════════════════════
   La distancia de cámara estaba fija en 430, que era el número que quedaba
   bien en una ventana ancha de escritorio. En un teléfono en vertical —donde
   lo ancho es lo escaso y el cerebro es justamente más ancho que alto— eso
   deja medio cerebro fuera del cuadro.

   Así que se despeja: se sabe el radio del cerebro y la focal, y se pide que
   quepa en el LADO CORTO de la pantalla, sea cual sea. Un número fijo servía
   para una pantalla; esto sirve para todas, incluso si alguien gira el
   teléfono a mitad de la reunión. */
const RADIO_MUNDO = 132;
function encuadrar() {
  // 0.44 del lado corto deja el margen donde viven las etiquetas y el sello.
  const cabe = Math.min(W, H) * (movil ? 0.46 : 0.44);
  const d = FOCAL * RADIO_MUNDO / Math.max(1, cabe);
  tope = [d * 0.55, d * 2.6];
  return d;
}

// ── tamaño ──────────────────────────────────────────────────────────────────
let W = 0, H = 0, dpr = 1, movil = false;
let tocado = false, primerCuadro = true;
function medir() {
  W = innerWidth; H = innerHeight;
  movil = Math.min(W, H) < 620;
  /* El dpr se topa en 2 —a 3 el móvil dibuja nueve veces los píxeles y nadie
     nota la diferencia— y baja a 1.5 en pantalla grande.

     Ese segundo tope es justo para el caso que importa: un portátil
     empujando un proyector. Ahí la ventana es enorme, el dibujo va casi todo
     en modo aditivo (que se rasteriza caro) y a dpr 2 son cuatro veces los
     píxeles de la pantalla lógica. La diferencia de nitidez a cuatro metros
     no la ve nadie; la diferencia entre 60 y 25 cuadros por segundo la ve
     toda la sala. */
  dpr = Math.min(devicePixelRatio || 1, W > 1600 ? 1.5 : 2);
  lienzo.width = W * dpr; lienzo.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* Al cambiar de tamaño se reencuadra, pero solo si nadie tocó el zoom:
     rehacer el encuadre después de que alguien se acercó a mirar una región
     le quita de las manos lo que acababa de hacer. En el móvil esto salta
     también al girar el teléfono y al aparecer la barra del navegador. */
  const d = encuadrar();
  if (!tocado) { cam.objetivo = d; if (!primerCuadro) cam.dist = d; }
}
addEventListener('resize', medir);
addEventListener('orientationchange', () => setTimeout(medir, 120));

/* ══ EL DEDO ════════════════════════════════════════════════════════════════
   Un puntero arrastra y gira. Dos puntero
s pellizcan para acercar, que en un
   teléfono es la única forma de acercar que hay: no hay rueda de ratón.

   Los punteros se guardan en un mapa en vez de mirar `e.touches` porque así
   el mismo código sirve para el ratón del escritorio, el dedo del teléfono y
   el lápiz de una tableta, sin tres caminos distintos que se desincronizan. */
const dedos = new Map();
let pellizco = 0;

const separacion = () => {
  const [a, b] = [...dedos.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};

lienzo.addEventListener('pointerdown', (e) => {
  // Poner el dedo cancela el viaje de la búsqueda: quien agarra el cerebro
  // manda sobre lo que estuviera haciendo la cámara.
  girandoHacia = null;
  dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (dedos.size === 2) pellizco = separacion();
  lienzo.setPointerCapture(e.pointerId);
});

lienzo.addEventListener('pointermove', (e) => {
  const previo = dedos.get(e.pointerId);
  if (!previo) return;
  const dx = e.clientX - previo.x, dy = e.clientY - previo.y;
  previo.x = e.clientX; previo.y = e.clientY;

  if (dedos.size >= 2) {
    if (dedos.size === 2 && pellizco > 0) {
      const ahora = separacion();
      // Separar los dedos acerca: por eso la razón va invertida sobre la
      // distancia de cámara.
      cam.objetivo = Math.max(tope[0], Math.min(tope[1], cam.objetivo * (pellizco / ahora)));
      pellizco = ahora;
      tocado = true;
    }
    return;                                   // pellizcando no se gira
  }

  cam.giroY += dx * 0.005;
  cam.giroX += dy * 0.004;
  // Se topa antes del polo: pasado el cenit la escena se da vuelta y quien la
  // está proyectando no sabe cómo volver.
  cam.giroX = Math.max(-1.2, Math.min(1.2, cam.giroX));
});

const soltar = (e) => {
  dedos.delete(e.pointerId);
  if (dedos.size < 2) pellizco = 0;
};
lienzo.addEventListener('pointerup', soltar);
lienzo.addEventListener('pointercancel', soltar);
addEventListener('pointerup', soltar);

lienzo.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.objetivo = Math.max(tope[0], Math.min(tope[1], cam.objetivo + e.deltaY * 0.7));
  tocado = true;
}, { passive: false });

// Doble toque: vuelve al encuadre de partida. En el móvil es fácil perderse
// después de dos pellizcos, y sin esto la única salida es recargar.
let ultimoToque = 0;
lienzo.addEventListener('pointerdown', () => {
  const t = performance.now();
  if (t - ultimoToque < 300) { cam.objetivo = encuadrar(); tocado = false; }
  ultimoToque = t;
});

// ── proyección ──────────────────────────────────────────────────────────────
const FOCAL = 1150;

// El primer encuadre va aquí y no arriba: `encuadrar()` necesita la focal, y
// declararla antes solo para poder medir antes sería mover la definición de
// sitio para engañar al orden de lectura.
medir();
primerCuadro = false;
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
  /* Focal larga y no corta: comprime menos la perspectiva, y eso es lo que
     hace que el conjunto se lea como un OBJETO y no como un abanico de
     puntos abriéndose hacia la cámara. */
  const e = FOCAL / d;
  proy.x = W / 2 + x1 * e;
  proy.y = H / 2 + y2 * e;
  proy.e = e; proy.z = z2;
  return proy;
}

/** Proyecta y guarda el resultado encima del propio punto. La malla tiene
 *  miles de puntos y cada uno se usa varias veces por cuadro (una vez como
 *  punto y una por cada arista que lo toca): proyectarlo de nuevo cada vez
 *  costaba más que todo el resto del dibujo junto. */
function marcar(p, cy, sy, cx, sx) {
  const r = proyectar(p, cy, sy, cx, sx);
  p._x = r.x; p._y = r.y; p._e = r.e; p._z = r.z;
}

/* ══ LOS HALOS, DIBUJADOS UNA SOLA VEZ ══════════════════════════════════════
   Cada halo era un `createRadialGradient` nuevo por partícula y por cuadro:
   con las señales, las piezas, la bruma y las chispas eso son unos doscientos
   sesenta degradados en CADA fotograma. Medido a 1920×1080 daba 23 cuadros por
   segundo — proyectado en una sala eso se ve como un tirón constante.

   Se dibuja un halo por color UNA vez en un lienzo aparte y después se estampa
   escalado con drawImage, que es una operación que la máquina hace sola. Son
   catorce lienzos de 64 píxeles en total. */
const HALOS = new Map();
const GRIS = '#96AFCD', BLANCO = '#F0FCFF';
function halo(color) {
  let c = HALOS.get(color);
  if (c) return c;
  const S = 64;
  c = document.createElement('canvas');
  c.width = c.height = S;
  const g2 = c.getContext('2d');
  const gr = g2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, tinte(color, 1));
  gr.addColorStop(0.34, tinte(color, 0.38));
  gr.addColorStop(1, tinte(color, 0));
  g2.fillStyle = gr;
  g2.fillRect(0, 0, S, S);
  HALOS.set(color, c);
  return c;
}

/** Estampa un halo centrado en (x,y) con radio R y una intensidad dada. */
function estampar(color, x, y, R, alfa) {
  if (R <= 0 || alfa <= 0.004) return;
  ctx.globalAlpha = Math.min(1, alfa);
  ctx.drawImage(halo(color), x - R, y - R, R * 2, R * 2);
  ctx.globalAlpha = 1;
}

// ── el latido ───────────────────────────────────────────────────────────────
// Una onda esférica que sale del centro cada PERIODO y recorre el cerebro. Es
// el «pump»: lo que hace que el conjunto se lea como un órgano y no como un
// diagrama. Todo lo que la onda toca se enciende al pasar — las piezas y el
// tejido, que es lo que hace que el cerebro entero parezca respirar.
/* ══ EL LATIDO ══════════════════════════════════════════════════════════════
   Cuatro segundos y medio por latido, no dos y medio, y una cresta el doble de
   ancha. Iba al ritmo de un corazón asustado: la onda cruzaba el cerebro antes
   de que a nadie le diera tiempo a seguirla con la vista, y en una proyección
   eso se lee como parpadeo nervioso, no como algo que respira.

   Más lento y más ancho, la onda se VE avanzar: sale del centro, cruza los
   lóbulos, llega al borde. Eso es lo que hace que parezca un órgano. */
const PERIODO = 4600;
const VEL_ONDA = 0.30;   // unidades de mundo por milisegundo
const ANCHO_ONDA = 78;

function brilloLatido(dist, ahora) {
  const d = Math.abs(dist - (ahora % PERIODO) * VEL_ONDA);
  return d < ANCHO_ONDA ? (1 - d / ANCHO_ONDA) ** 2 : 0;
}

// ── el dibujo ───────────────────────────────────────────────────────────────
const txtPulso = document.getElementById('txtPulso');

/* Las cajas de etiqueta del último cuadro, para el tacto; y si el giro
   automático está congelado porque la cara está hablando. Declaradas aquí
   —arriba del bucle que las usa— y no junto al bloque de la cara: `let` no se
   iza, y el primer cuadro se dibuja antes de que ese bloque llegue a correr. */
let etiquetasVivas = [];
let congelado = false;
let resaltada = null;      // la pieza cuya ficha está abierta
let girandoHacia = null;   // a dónde lleva la cámara la búsqueda, si a algún sitio

/* El gesto que se anuncia es el que existe en este aparato. `pointer: coarse`
   es el dedo; ahí no hay rueda que girar y sí hay dos dedos que pellizcar. */
{
  const dedo = matchMedia('(pointer: coarse)').matches;
  const g = document.getElementById('gesto');
  if (g && dedo) g.textContent = 'Arrastrá · pellizcá · dos toques reencuadra';
}
const listos = [];               // las piezas, ordenadas por profundidad
const BANDAS = 4;                // franjas de profundidad para la malla
/* Las cuatro franjas, de la más lejana a la más cercana. Los valores son
   altos a propósito: el tejido ES la pieza. Con la malla tenue se veía un
   enjambre de puntos flotando y la SILUETA del cerebro no se leía — que es
   justo lo único que había que conseguir. */
const ALFA_HILO = [0.10, 0.17, 0.27, 0.40];
const ALFA_PUNTO = [0.26, 0.46, 0.70, 0.95];
const banda = [];
for (let i = 0; i < BANDAS; i++) banda.push([]);
const encendidos = [];

function cuadro(ahora) {
  /* El giro. Si la búsqueda pidió llevar una pieza al frente, la cámara va
     hacia ahí y para; si no, sigue rodando sola. Se hace con una interpolación
     y no de un salto: teletransportar el cerebro delante de una sala hace
     perder de vista dónde estaba. */
  if (girandoHacia !== null) {
    let dif = girandoHacia - cam.giroY;
    // Por el camino corto: sin esto la cámara puede dar la vuelta entera para
    // llegar a un sitio que tenía al lado.
    while (dif > Math.PI) dif -= Math.PI * 2;
    while (dif < -Math.PI) dif += Math.PI * 2;
    cam.giroY += dif * 0.07;
    if (Math.abs(dif) < 0.01) girandoHacia = null;
  } else if (dedos.size === 0 && !quieto && !congelado) {
    cam.giroY += VEL_GIRO;
  }
  cam.dist += (cam.objetivo - cam.dist) * 0.08;
  ambiente.latir(ahora);

  const cy = Math.cos(cam.giroY), sy = Math.sin(cam.giroY);
  const cx = Math.cos(cam.giroX), sx = Math.sin(cam.giroX);

  // Los límites de `e` que hay ahora mismo, para repartir la malla en franjas
  // de profundidad. Se recalculan cada cuadro porque el zoom los mueve.
  const eMin = FOCAL / (cam.dist + 150);
  const eMax = FOCAL / Math.max(70, cam.dist - 150);
  const eRan = Math.max(0.0001, eMax - eMin);

  // El fondo: no un negro plano sino un pozo con luz al centro, para que el
  // cerebro parezca estar DENTRO de algo.
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, '#071320');
  g.addColorStop(0.55, '#040A12');
  g.addColorStop(1, '#010407');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'lighter';

  // ── estrellas ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(150,190,230,.55)';
  ctx.beginPath();
  for (const s of estrellas) {
    const p = proyectar(s, cy, sy, cx, sx);
    if (p.e < 0) continue;
    ctx.rect(p.x, p.y, 1.3, 1.3);
  }
  ctx.fill();

  // ── la bruma del volumen ──────────────────────────────────────────────────
  for (const b of bruma) {
    const p = proyectar(b, cy, sy, cx, sx);
    if (p.e < 0) continue;
    estampar(GRIS, p.x, p.y, b.r * p.e, b.a);
  }

  // ── la malla ──────────────────────────────────────────────────────────────
  // Se dibuja por región y por franja de profundidad: así son ~100 trazos por
  // cuadro en vez de cuatro mil, y la profundidad se sigue leyendo.
  encendidos.length = 0;
  for (const reg of regiones) {
    for (const p of reg.puntos) marcar(p, cy, sy, cx, sx);

    // los hilos
    for (const b of banda) b.length = 0;
    for (const ar of reg.aristas) {
      const a = reg.puntos[ar[0]], c = reg.puntos[ar[1]];
      if (a._e < 0 || c._e < 0) continue;
      const k = Math.max(0, Math.min(BANDAS - 1,
        Math.floor(((a._e + c._e) / 2 - eMin) / eRan * BANDAS)));
      banda[k].push(a, c);
    }
    ctx.lineWidth = 0.55;
    for (let k = 0; k < BANDAS; k++) {
      const b = banda[k];
      if (!b.length) continue;
      ctx.strokeStyle = tinte(reg.color, ALFA_HILO[k]);
      ctx.beginPath();
      for (let i = 0; i < b.length; i += 2) {
        ctx.moveTo(b[i]._x, b[i]._y);
        ctx.lineTo(b[i + 1]._x, b[i + 1]._y);
      }
      ctx.stroke();
    }

    // los puntos
    for (const b of banda) b.length = 0;
    for (const p of reg.puntos) {
      if (p._e < 0) continue;
      /* Lo que la CRESTA de la onda está tocando ahora mismo se aparta y se
         pinta encendido. Es el «pump» barriendo el tejido.

         El umbral es 0.62 y no 0.30 por una razón que se vio en pantalla: a
         0.30 la onda encendía media región de golpe, y como lo encendido se
         pinta claro, el cerebro entero se lavaba a blanco y los trece colores
         desaparecían. A 0.62 es una cresta fina que RECORRE el tejido, que es
         lo que se quiere: se ve el barrido y se siguen viendo las regiones. */
      const late = quieto ? 0 : brilloLatido(p.d, ahora);
      if (late > 0.62) { encendidos.push(p, late, reg.color); continue; }
      const k = Math.max(0, Math.min(BANDAS - 1,
        Math.floor((p._e - eMin) / eRan * BANDAS)));
      banda[k].push(p);
    }
    for (let k = 0; k < BANDAS; k++) {
      const b = banda[k];
      if (!b.length) continue;
      ctx.fillStyle = tinte(reg.color, ALFA_PUNTO[k]);
      ctx.beginPath();
      const s = 0.85 + k * 0.34;
      for (const p of b) ctx.rect(p._x - s / 2, p._y - s / 2, s, s);
      ctx.fill();
    }
  }

  /* Los puntos que la cresta está tocando, todos juntos y al final. Se
     encienden en el COLOR DE SU REGIÓN y no en blanco: encendidos en blanco,
     la onda borraba el color por donde pasaba y el barrido se leía como una
     mancha viajando, no como el cerebro latiendo. */
  for (let i = 0; i < encendidos.length; i += 3) {
    const p = encendidos[i], late = encendidos[i + 1], color = encendidos[i + 2];
    const r = (0.7 + (late - 0.62) * 3.4) * p._e * 0.55;
    ctx.fillStyle = tinte(color, 0.55 + (late - 0.62) * 1.1);
    ctx.beginPath(); ctx.arc(p._x, p._y, r, 0, 7); ctx.fill();
  }

  // ── los trazos blancos ────────────────────────────────────────────────────
  // En tres tramos con alfa decreciente: el filamento se desvanece a medida
  // que se aleja, y son tres trazos por hilo en vez de treinta y cuatro.
  for (const tr of trazos) {
    for (const p of tr.pts) marcar(p, cy, sy, cx, sx);
    const n = tr.pts.length;
    const tramos = [[0, 9, 0.24], [8, 16, 0.11], [15, n - 1, 0.045]];
    for (const [a, b, al] of tramos) {
      ctx.strokeStyle = `rgba(214,236,255,${al})`;
      ctx.lineWidth = al > 0.2 ? 0.95 : 0.6;
      ctx.beginPath();
      let abierto = false;
      for (let i = a; i <= b; i++) {
        const p = tr.pts[i];
        if (p._e < 0) { abierto = false; continue; }
        if (!abierto) { ctx.moveTo(p._x, p._y); abierto = true; }
        else ctx.lineTo(p._x, p._y);
      }
      ctx.stroke();
    }
    // la chispa que lo recorre
    if (!quieto) {
      tr.t += tr.v;
      if (tr.t > 1) tr.t = 0;
      const f = tr.t * (n - 1), i = Math.floor(f), m = f - i;
      const a = tr.pts[i], b = tr.pts[Math.min(n - 1, i + 1)];
      /* Chica y brillante, no grande y tenue. Con radio grande la chispa se
         alejaba del cerebro —donde no hay nada más dibujado— y ahí un
         degradado suave y ancho no se lee como una luz: se lee como un
         manchón gris flotando en el vacío. Y se apaga a mitad de recorrido,
         porque una luz que llega hasta el borde de la pantalla deja de
         parecer que salió de algún lado. */
      if (a._e > 0 && b._e > 0 && tr.t < 0.45) {
        const x = a._x + (b._x - a._x) * m, y = a._y + (b._y - a._y) * m;
        const vis = Math.min(1, (0.45 - tr.t) * 5);
        estampar(BLANCO, x, y, 2.2 + 2.6 * a._e, 0.85 * vis);
      }
    }
  }

  /* ── AXONES: LAS CONEXIONES REALES ────────────────────────────────────────
     Éstas sí son datos: cada una es un enlace escrito en el mapa. Van por
     encima del tejido y con el LATIDO encima: el trozo de cable que la onda
     está tocando se enciende, así que el pulso se ve VIAJAR de pieza a pieza
     en vez de aparecer y desaparecer en cada punto. Es lo que hace que el
     cerebro se lea como una cosa conectada y no como puntos que parpadean
     cada uno por su cuenta. */
  for (const n of neuronas) marcar(n, cy, sy, cx, sx);

  const enLatido = [];
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = 'rgba(140,200,245,.22)';
  ctx.beginPath();
  for (const ax of axones) {
    if (ax.a._e < 0 || ax.b._e < 0) continue;
    // Los del resaltado se apartan: se pintan después, con su color y arriba.
    if (resaltada && (ax.a === resaltada || ax.b === resaltada)) continue;
    const late = quieto ? 0 : Math.max(brilloLatido(ax.a.d, ahora), brilloLatido(ax.b.d, ahora));
    if (late > 0.25) { enLatido.push(ax, late); continue; }
    ctx.moveTo(ax.a._x, ax.a._y); ctx.lineTo(ax.b._x, ax.b._y);
  }
  ctx.stroke();

  // los cables que el latido está cruzando ahora mismo
  ctx.lineWidth = 1.1;
  for (let i = 0; i < enLatido.length; i += 2) {
    const ax = enLatido[i], late = enLatido[i + 1];
    ctx.strokeStyle = tinte(ax.a.color, 0.20 + late * 0.55);
    ctx.beginPath();
    ctx.moveTo(ax.a._x, ax.a._y); ctx.lineTo(ax.b._x, ax.b._y);
    ctx.stroke();
  }

  /* ── LO QUE ESTÁ TOCADO ──
     Al abrir la ficha de una pieza se encienden SUS cables y solo esos. Es la
     respuesta visual a «¿con qué habla esto?», que es la pregunta que hace
     todo el mundo delante de un mapa así, y que hasta ahora había que
     contestar señalando con el dedo en la pantalla. */
  if (resaltada && resaltada._e > 0) {
    const c = COLOR[resaltada.grupo] || '#6FE3F5';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = tinte(c, 0.75);
    ctx.beginPath();
    for (const ax of axones) {
      if (ax.a !== resaltada && ax.b !== resaltada) continue;
      if (ax.a._e < 0 || ax.b._e < 0) continue;
      ctx.moveTo(ax.a._x, ax.a._y); ctx.lineTo(ax.b._x, ax.b._y);
    }
    ctx.stroke();
    // Un anillo alrededor de la pieza tocada, para no perderla de vista.
    const R = 9 + Math.sin(ahora * 0.004) * 2.2;
    ctx.strokeStyle = tinte(c, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(resaltada._x, resaltada._y, R, 0, 7); ctx.stroke();
  }

  /* ── LOS RAYOS ──
     Se dibujan ENTRE los cables y las señales: por encima del cableado, para
     que se vean pasar por él, y por debajo de las piezas, para que una pieza
     nunca quede tapada por un rayo. */
  for (const r of rayos) {
    r.t += r.v;
    const de = r.haciaB ? r.ax.a : r.ax.b;
    const a2 = r.haciaB ? r.ax.b : r.ax.a;
    if (r.t >= 1) { siguienteCable(r, a2); continue; }

    const p = proyectar({
      x: de.x + (a2.x - de.x) * r.t,
      y: de.y + (a2.y - de.y) * r.t,
      z: de.z + (a2.z - de.z) * r.t,
    }, cy, sy, cx, sx);
    if (p.e < 0) continue;

    // La estela se guarda en pantalla y no en el mundo: guardarla en el mundo
    // obliga a proyectar catorce puntos por rayo y por cuadro, y se ve igual.
    r.cola.push(p.x, p.y);
    while (r.cola.length > ESTELA * 2) r.cola.splice(0, 2);

    const col = de.color;
    // La cola, de más apagada a más viva. En trozos, porque un degradado a lo
    // largo de un trazo no existe en canvas sin inventarse uno por segmento.
    ctx.lineCap = 'round';
    for (let i = 2; i < r.cola.length; i += 2) {
      const f = i / r.cola.length;
      ctx.strokeStyle = tinte(col, 0.06 + f * f * 0.42);
      ctx.lineWidth = 0.6 + f * 1.9;
      ctx.beginPath();
      ctx.moveTo(r.cola[i - 2], r.cola[i - 1]);
      ctx.lineTo(r.cola[i], r.cola[i + 1]);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // la cabeza
    estampar(col, p.x, p.y, 4 + 5.5 * p.e, 0.85);
    ctx.fillStyle = 'rgba(238,252,255,.92)';
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.1, 1.5 * p.e), 0, 7); ctx.fill();
  }

  // ── señales viajando ──────────────────────────────────────────────────────
  for (const s of senales) {
    s.t += s.v;
    if (s.t > 1) { s.t = 0; s.ax = axones[Math.floor(rnd() * axones.length)]; }
    const a = s.ax.a, b = s.ax.b;
    const p = proyectar({
      x: a.x + (b.x - a.x) * s.t,
      y: a.y + (b.y - a.y) * s.t,
      z: a.z + (b.z - a.z) * s.t,
    }, cy, sy, cx, sx);
    if (p.e < 0) continue;
    const r = Math.max(0.7, 1.05 * p.e);

    /* La señal se tiñe del color de la región DE DONDE SALE, y solo el núcleo
       queda blanco. En la primera versión todas eran blanco-cian y, con
       doscientas encima, el cerebro entero se lavaba: las regiones perdían su
       color y quedaba una mancha. Teñidas, se ve de dónde a dónde va cada
       cosa, que además es la información que la pieza quiere dar. */
    estampar(a.color, p.x, p.y, r * 3.2, 0.42 * Math.min(1, p.e * 0.5));
    /* El núcleo blanco va a media fuerza. A tope, ciento cuarenta señales
       encima del tejido se leían como ciento cuarenta piezas blancas: el ojo
       no distinguía cuál era una pieza del mapa y cuál un punto de paso, que
       es la única distinción que esta pantalla tiene que dejar clara. */
    ctx.fillStyle = `rgba(236,250,255,${Math.min(0.5, p.e * 0.19)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  }

  // ── las piezas ────────────────────────────────────────────────────────────
  listos.length = 0;
  for (const n of neuronas) if (n._e > 0) listos.push(n);
  // De atrás hacia adelante: sin esto las de atrás se dibujan encima de las de
  // adelante y se pierde toda la profundidad.
  listos.sort((a, b) => b._z - a._z);

  /* Dos pases, y el orden importa.
     Primero los HALOS, en modo aditivo: es lo que da el neón sin necesitar un
     filtro caro. Después los NÚCLEOS en modo normal.

     Estaban los dos en aditivo y el resultado era que casi todas las piezas
     salían blancas: un color claro sumado encima de su propio halo satura y
     pierde el tono, y en la zona de tokens —quince piezas juntas y doradas—
     quedaba una mancha blanca sin forma. En modo normal el núcleo conserva el
     color de su región por brillante que esté el halo debajo. */
  for (const n of listos) {
    const late = quieto ? 0.35 : brilloLatido(n.d, ahora);
    const resp = quieto ? 0 : (Math.sin(ahora * 0.0016 + n.fase) * 0.5 + 0.5) * 0.35;
    n._vivo = 0.45 + resp * 0.5 + late * 0.9;
    n._late = late;
    n._r = (1.5 + n.peso * 0.75) * n._e * 0.55 * (1 + late * 0.7);

    // El halo llega a cuatro radios y no a siete: a siete, con setenta y cuatro
    // piezas encima de un tejido ya luminoso, se solapaban hasta borrarse.
    estampar(n.color, n._x, n._y, n._r * 3.6, 0.17 * n._vivo);
  }

  ctx.globalCompositeOperation = 'source-over';
  for (const n of listos) {
    ctx.fillStyle = tinte(n.color, Math.min(1, n._vivo));
    ctx.beginPath(); ctx.arc(n._x, n._y, n._r, 0, 7); ctx.fill();
    /* El blanco queda SOLO para el instante en que la onda del latido pasa por
       encima. Antes se encendía casi siempre y el color de la región no se
       llegaba a ver nunca. */
    if (n._late > 0.55) {
      ctx.fillStyle = `rgba(255,255,255,${(n._late - 0.55) * 1.5})`;
      ctx.beginPath(); ctx.arc(n._x, n._y, n._r * 0.5, 0, 7); ctx.fill();
    }
  }

  /* ══ EL NOMBRE DE CADA PIEZA ══════════════════════════════════════════════
     Hasta ahora los nombres solo estaban en el índice, y eso deja el cerebro
     como una constelación bonita de puntos sin nombre: se ve que hay algo,
     pero no QUÉ.

     No se pintan los ciento uno: a la vista de conjunto no cabrían y sería
     ilegible. Se pintan los que están DE CARA a la cámara y por delante, y
     cuantos más cuanto más cerca esté el zoom — acercarse a mirar una zona es
     justo el gesto de «¿qué hay aquí?», y ahí el cerebro contesta con nombres.

     La pieza abierta y sus vecinas van SIEMPRE, aunque estén de espaldas:
     cuando alguien está mirando una cosa, lo que la rodea es lo que quiere
     leer. */
  ctx.globalCompositeOperation = 'source-over';
  const CUANTOS_NOMBRES = movil ? 8 : 22;
  const puestos = [];
  ctx.font = `500 ${movil ? 9 : 10.5}px ui-monospace,Menlo,monospace`;
  ctx.textBaseline = 'middle';

  const candidatas = [];
  for (const n of neuronas) {
    if (n._e < 0 || n._z < -20) continue;      // de espaldas, no
    const vecina = resaltada && (resaltada === n ||
      axones.some((x) => (x.a === resaltada && x.b === n) || (x.b === resaltada && x.a === n)));
    // La prioridad mezcla profundidad y peso: entre dos igual de cerca gana la
    // pieza gorda, que es la que da sentido al racimo que tiene alrededor.
    candidatas.push({ n, vecina, p: (vecina ? 1e6 : 0) + n._z + n.peso * 26 });
  }
  candidatas.sort((a, b) => b.p - a.p);

  for (const c of candidatas.slice(0, CUANTOS_NOMBRES + 12)) {
    const n = c.n;
    if (!c.vecina && puestos.length >= CUANTOS_NOMBRES) break;
    const w = ctx.measureText(n.nombre).width;
    const h = 13;
    let x = n._x + (n._r || 3) + 7, y = n._y;
    if (x + w > W - 16) x = n._x - (n._r || 3) - 7 - w;   // se cambia de lado
    // Un nombre encima de otro no se lee ninguno de los dos.
    const choca = puestos.some((q) =>
      x < q.x + q.w + 5 && x + w + 5 > q.x && y < q.y + h && y + h > q.y);
    if (choca) continue;
    if (x < 8 || y < 60 || y > H - 60) continue;
    puestos.push({ x, y: y - h / 2, w, h });

    const col = COLOR[n.grupo] || '#9FB4CC';
    const cerca = Math.max(0, Math.min(1, (n._z + 130) / 260));
    // Un fondo mínimo detrás del texto: sobre el tejido, la letra sola se
    // pierde en cuanto pasa por encima de una zona cargada.
    ctx.fillStyle = `rgba(3,10,17,${0.42 + cerca * 0.3})`;
    ctx.fillRect(x - 3, y - h / 2, w + 6, h);
    ctx.fillStyle = tinte(col, c.vecina ? 0.95 : 0.42 + cerca * 0.48);
    ctx.fillText(n.nombre, x, y + 0.5);
  }

  // ── las etiquetas de región ───────────────────────────────────────────────
  ctx.globalCompositeOperation = 'source-over';
  const cajas = [];
  for (const reg of regiones) {
    const gr = GRUPOS[reg.clave];
    if (!gr) continue;
    const c = CENTROS[reg.clave];
    const p = proyectar({ x: c[0], y: c[1], z: c[2] }, cy, sy, cx, sx);
    if (p.e < 0) continue;
    cajas.push({
      x: p.x, y: p.y, z: p.z, e: p.e, color: reg.color, nombre: gr.nombre,
      clave: reg.clave,
      // El recuento es de PIEZAS del mapa. La malla de esta región, que puede
      // tener doscientos puntos, no suma ni uno.
      cuantas: neuronas.filter((n) => n.grupo === reg.clave).length,
    });
  }
  // Las de adelante se pintan últimas y tapan a las de atrás, igual que las
  // piezas. Una etiqueta del fondo encima de una del frente delata que no hay
  // profundidad de verdad.
  cajas.sort((a, b) => b.z - a.z);

  /* ══ QUE LAS ETIQUETAS NO SE PISEN ═══════════════════════════════════════
     Trece regiones proyectadas sobre un cuerpo compacto caen unas encima de
     otras: en la primera versión había cuatro cajas superpuestas y no se leía
     ninguna. Se colocan una por una y, si la nueva choca con alguna ya puesta,
     se empuja hacia abajo hasta que quepa.

     Y como la caja ya no está pegada a su región, se le dibuja una LÍNEA GUÍA
     hasta el punto de origen. Sin esa línea, mover la etiqueta para que se lea
     habría sido mentir sobre dónde está la región. */
  /* Las cajas se sacan FUERA de la masa antes de resolver choques. En la
     versión anterior se dibujaban pegadas a su región y, como las regiones
     están dentro de un cuerpo compacto y luminoso, quedaban trece cajas
     oscuras encima del cerebro: tapaban justo lo que hay que mirar y encima no
     se leían. Ahora cada una sale despedida hacia afuera por el rayo que va
     del centro de la pantalla a su región, hasta un anillo por fuera del
     contorno, y la línea guía la sigue atando a su sitio de verdad. */
  /* ══ Y EN EL TELÉFONO, MENOS ═════════════════════════════════════════════
     Trece cajas de escritorio en una pantalla de seis pulgadas no es una
     versión pequeña de esto: es otra cosa, y peor. Ocupan más superficie que
     el propio cerebro, se apilan en una columna que llega de arriba abajo, y
     lo que quedaba por ver —que es el cerebro— desaparece detrás.

     Así que en móvil se muestran las SEIS regiones que están de cara a la
     cámara, y las demás esperan a que el cerebro gire. No se pierde nada:
     gira solo, y en veinte segundos han pasado todas. El recuento total
     sigue completo abajo, en el pulso, que es donde tiene que estar. */
  const CUANTAS = movil ? 6 : cajas.length;
  const visibles = movil
    ? [...cajas].sort((a, b) => a.z - b.z).slice(0, CUANTAS).sort((a, b) => b.z - a.z)
    : cajas;

  const h = movil ? 26 : 34, sep = movil ? 9 : 8;
  const margen = movil ? 10 : 24;
  /* El borde de abajo reserva la franja donde viven el subtítulo, la barra de
     temas y la cara. No es margen de cortesía: sin él, la etiqueta de una
     región caía justo encima de lo que la voz está diciendo, y se leían las
     dos cosas superpuestas. */
  const borde = movil ? 62 : 152, techo = movil ? 74 : 96;

  const puestas = [];
  for (const c of visibles) {
    const op = Math.max(0.3, Math.min(1, (c.e - eMin) / eRan * 0.8 + 0.4));
    const w = anchoEtiqueta(c.nombre.toUpperCase(), `${c.cuantas} piezas`);

    let vx = c.x - W / 2, vy = c.y - H / 2;
    const largo = Math.hypot(vx, vy) || 1;
    vx /= largo; vy /= largo;
    const anillo = Math.min(RADIO_MUNDO * c.e * 1.05 + (movil ? 14 : 26),
                            Math.min(W, H) * (movil ? 0.5 : 0.46));
    const ax = W / 2 + vx * anillo, ay = H / 2 + vy * anillo;

    // Del lado izquierdo la caja se alinea a la derecha, para que crezca hacia
    // afuera y no vuelva a meterse encima del cerebro.
    const izq = vx < 0;
    let ex = izq ? ax - w : ax;

    /* El recorte al cuadro va ANTES de resolver los choques, no después.
       Estaba después y deshacía el trabajo: la caja se empujaba hacia abajo
       hasta un hueco libre, el recorte la subía de vuelta al último renglón
       que cabe, y ahí volvía a caer encima de la que ya estaba puesta. Se
       veía al acercar con dos dedos, que es cuando las regiones se separan y
       las etiquetas se amontonan contra el borde. */
    let ey = Math.max(techo, Math.min(H - borde - h, ay - h / 2));

    for (let intento = 0; intento < 60; intento++) {
      const choca = puestas.find((q) =>
        ex < q.x + q.w + sep && ex + w + sep > q.x &&
        ey < q.y + q.h + sep && ey + h + sep > q.y);
      if (!choca) break;
      ey = choca.y + choca.h + sep;
      // Al llegar abajo se vuelve a empezar por arriba, en vez de salirse del
      // cuadro. Peor una etiqueta en otro renglón que una etiqueta cortada.
      if (ey + h > H - borde) ey = techo;
    }
    ex = Math.max(margen, Math.min(W - margen - w, ex));
    // Se guarda también la región: estas cajas son lo que se puede TOCAR
    // para que la cara la explique, así que hay que saber cuál es cuál.
    puestas.push({ x: ex, y: ey, w, h, clave: c.clave });

    ctx.strokeStyle = tinte(c.color, 0.34 * op);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(izq ? ex + w + 6 : ex - 6, ey + h / 2);
    ctx.stroke();
    ctx.fillStyle = tinte(c.color, 0.9 * op);
    ctx.beginPath(); ctx.arc(c.x, c.y, 2.6, 0, 7); ctx.fill();

    etiqueta(ex, ey + h / 2, c.nombre.toUpperCase(),
             `${c.cuantas} ${c.cuantas === 1 ? 'pieza' : 'piezas'}`, c.color, op, w);
  }

  // Las cajas de este cuadro quedan a mano del tacto. Se guardan aquí y no en
  // una variable del módulo con otro nombre porque lo que se puede tocar tiene
  // que ser EXACTAMENTE lo que se acaba de dibujar: cualquier copia con un
  // cuadro de retraso hace que tocar una etiqueta abra la de al lado.
  etiquetasVivas = puestas;

  // El texto del pulso, con el recuento de verdad.
  if (!txtPulso.dataset.puesto) {
    txtPulso.textContent =
      `${neuronas.length} piezas · ${axones.length} conexiones · ${regiones.length} regiones`;
    txtPulso.dataset.puesto = '1';
  }

  requestAnimationFrame(cuadro);
}

/** El ancho que va a ocupar una etiqueta. Se calcula aparte porque hay que
 *  saberlo ANTES de dibujar, para poder resolver los choques. */
function anchoEtiqueta(titulo, pie) {
  ctx.font = TIPO();
  const w1 = ctx.measureText(titulo).width;
  ctx.font = TIPO_PIE();
  return Math.max(w1, ctx.measureText(pie).width) + (movil ? 14 : 20);
}
const TIPO = () => movil ? '600 9.5px ui-monospace,Menlo,monospace'
                         : '600 11px ui-monospace,Menlo,monospace';
const TIPO_PIE = () => movil ? '400 8.5px ui-monospace,Menlo,monospace'
                             : '400 10px ui-monospace,Menlo,monospace';

/** Una etiqueta como las del cerebro de verdad: caja fina, borde del color de
 *  la región, y el recuento debajo. Se dibuja en canvas y no en HTML para que
 *  respete el orden de profundidad junto con todo lo demás. */
function etiqueta(x, y, titulo, pie, color, op, w) {
  ctx.save();
  ctx.globalAlpha = op;
  const h = movil ? 26 : 34;
  const px = movil ? 7 : 10;

  ctx.fillStyle = 'rgba(3,9,16,.78)';
  ctx.strokeStyle = tinte(color, .8);
  ctx.lineWidth = 1;
  redondo(x, y - h / 2, w, h, 4);
  ctx.fill(); ctx.stroke();

  // El resplandor del título se apaga en móvil: a 9.5 px el desenfoque se come
  // la letra en vez de rodearla, y el nombre de la región deja de leerse.
  if (!movil) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
  ctx.fillStyle = color;
  ctx.font = TIPO();
  ctx.fillText(titulo, x + px, y - (movil ? 2 : 1));
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(170,198,222,.8)';
  ctx.font = TIPO_PIE();
  ctx.fillText(pie, x + px, y + (movil ? 9 : 12));
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

/* ══ LA CARA, LA VOZ Y EL TACTO ═════════════════════════════════════════════

   La cara vive en su propio lienzo (`cara-3d.js`) y no dentro de éste. Son dos
   cosas con ritmos distintos —el cerebro gira despacio, la boca se mueve a la
   velocidad del habla— y meterlas en el mismo lienzo obliga a redibujar los
   dos mil puntos del cerebro cada vez que la boca cambia de forma.

   La voz sale del banco grabado de la casa. Ver `voz-core.js` y
   `guion-core.js`: cada línea del guion trae su fichero comprobado, y si el
   fichero no llega se dice la MISMA frase con la voz del aparato. */

const cara = crearCara(document.getElementById('lienzoCara'));
const elDice = document.getElementById('dice');
const botón = document.getElementById('botonHablar');
const rot = botón.querySelector('.rot');

const voz = crearVoz({
  alNivel: (x) => cara.nivel(x),
  alTexto: (t) => {
    elDice.textContent = t || '';
    elDice.classList.toggle('viva', !!t);
  },
  alEstado: (hablando) => {
    botón.classList.toggle('hablando', hablando);
    rot.textContent = hablando ? 'Parar' : 'Presentar';
    /* Mientras habla, el cerebro deja de girar solo. Girando, la etiqueta de
       la región de la que está hablando se va del sitio a mitad de la frase, y
       quien mira sigue la etiqueta en vez de escuchar. */
    congelado = hablando;
  },
});

/* ══ EL AMBIENTE ════════════════════════════════════════════════════════════
   Sintetizado, no un fichero: ver `ambiente.js`. El golpe grave va atado al
   mismo `PERIODO` que la onda que se ve, así que lo que se oye es exactamente
   lo que se está viendo. */
const ambiente = crearAmbiente({ periodo: PERIODO });
const btnSon = document.getElementById('botonSon');
btnSon.addEventListener('click', async () => {
  btnSon.setAttribute('aria-pressed', String(await ambiente.alternar()));
});
/* Si la última vez quedó encendido, se enciende al primer toque en la página:
   antes el navegador no deja, y preguntar otra vez sería preguntar de más. */
if (ambiente.recordado) {
  const alPrimerToque = async () => {
    removeEventListener('pointerdown', alPrimerToque);
    removeEventListener('keydown', alPrimerToque);
    btnSon.setAttribute('aria-pressed', String(await ambiente.alternar(true)));
  };
  addEventListener('pointerdown', alPrimerToque);
  addEventListener('keydown', alPrimerToque);
}

botón.addEventListener('click', () => {
  if (voz.hablando) voz.callar();
  else contar(temaActual);
});

/* ══ LOS TEMAS ══════════════════════════════════════════════════════════════
   Siete botones, uno por cosa de las que la voz sabe hablar. Se pintan del
   guion y no se escriben aquí: añadir un tema es añadirlo en `guion-core.js`
   y ya aparece, sin tocar ni una línea de esta pantalla. */
const barra = document.getElementById('temas');
let temaActual = TEMAS[0];

function contar(tema) {
  temaActual = tema;
  for (const b of barra.children) b.classList.toggle('viva', b.dataset.id === tema.id);
  voz.recitar(tema.lineas);
}

for (const t of TEMAS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.id = t.id;
  b.textContent = t.rot;
  b.title = t.sub;
  b.addEventListener('click', () => {
    // Tocar el tema que ya está sonando lo para: es lo que espera cualquiera
    // que le da otra vez al mismo botón.
    if (voz.hablando && temaActual.id === t.id) voz.callar();
    else contar(t);
  });
  barra.appendChild(b);
}
barra.firstChild.classList.add('viva');

/* ══ EL ÍNDICE Y LA VENTANA ═════════════════════════════════════════════════

   El cerebro enseña la FORMA del ecosistema. El índice enseña su CONTENIDO:
   las dieciséis regiones, lo que hay dentro de cada una, y cuáles traen
   expediente. Sin él, la única manera de saber qué información hay es girar
   la bola hasta toparse con algo — que es exactamente lo que no funcionaba.

   Y una pieza se abre en su propia VENTANA, con la ruta de dónde cuelga
   arriba y sus etiquetas debajo del nombre. Al cerrarla se vuelve a donde se
   estaba: el índice sigue abierto y en el mismo sitio. */

const elIndice = document.getElementById('indice');
const elArbol = document.getElementById('arbol');
const elCuenta = elIndice.querySelector('.cuenta');
const btnIndice = document.getElementById('abreIndice');
const elVent = document.getElementById('ventana');
const vMiga = elVent.querySelector('.miga');
const vTit = elVent.querySelector('h2');
const vTags = elVent.querySelector('.tags');
const vLede = elVent.querySelector('.lede');
const vCuerpo = elVent.querySelector('.cuerpo');

/** Crea un elemento con texto. Se usa `textContent` y nunca `innerHTML`: el
 *  expediente lo escribe una persona, y una comilla o un signo de menor en un
 *  párrafo legal no puede convertirse en etiqueta. */
function el(tipo, clase, txt) {
  const e = document.createElement(tipo);
  if (clase) e.className = clase;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

const conFicha = (n) => (FICHAS[n.id] || []).length > 0;

// ── el cajón ────────────────────────────────────────────────────────────────
function abrirIndice(si) {
  document.body.classList.toggle('indice-abierto', si);
  btnIndice.setAttribute('aria-expanded', String(si));
  if (si) setTimeout(() => elQ.focus({ preventScroll: true }), 340);
}
btnIndice.addEventListener('click', () =>
  abrirIndice(!document.body.classList.contains('indice-abierto')));

/* ── EL ÁRBOL ──
   Una sección por región, en el mismo orden en que están puestas en el
   cerebro, y dentro las piezas ordenadas por PESO: la cadena antes que el
   RPC, INDEXSA antes que Travesía. Alfabético pondría lo accesorio arriba. */
/* El orden en que se leen las regiones. No es el del mapa —que está puesto por
   dónde cae cada lóbulo— ni alfabético, que dejaría «Apps y webs» encima de
   «La cadena». Va de lo que la casa ES a lo que la casa TIENE PENDIENTE:

     quiénes somos → qué corre → quién lo cuida → qué falta

   Alguien que abre esto por primera vez lee de arriba abajo y entiende el
   ecosistema en ese orden. Es la mitad de lo que hace que un índice sirva. */
const ORDEN = [
  'legal', 'mina',                                  // quiénes somos
  'cadena', 'nodo', 'token', 'app', 'backend', 'infra', 'dominio',   // qué corre
  'identidad', 'seguridad', 'agente', 'repo',       // quién lo cuida
  'abierto', 'decision', 'junta',                   // qué falta
];
const porOrden = [...regiones].sort((a, b) => {
  const ia = ORDEN.indexOf(a.clave), ib = ORDEN.indexOf(b.clave);
  // Una región nueva que nadie puso en la lista va al final, no se pierde.
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});

function pintarArbol(filtro) {
  elArbol.replaceChildren();
  const q = filtro ? sinTildes(filtro) : '';
  let piezasVistas = 0, regionesVistas = 0;

  for (const reg of porOrden) {
    const gr = GRUPOS[reg.clave];
    if (!gr) continue;
    let piezas = neuronas.filter((n) => n.grupo === reg.clave);
    if (q) piezas = piezas.filter((n) => (indicePorId.get(n.id) || '').includes(q));
    if (!piezas.length) continue;
    piezas.sort((a, b) => (b.peso - a.peso) || a.nombre.localeCompare(b.nombre));
    piezasVistas += piezas.length;
    regionesVistas++;

    const caja = el('div', 'reg');
    // Buscando, todo abierto: si no, hay que abrir cada región para ver dónde
    // cayó lo que se buscaba, que es justo el trabajo que la búsqueda evita.
    if (q) caja.classList.add('abierta');

    const cab = el('button');
    cab.type = 'button';
    const punto = el('span', 'punto');
    punto.style.background = COLOR[reg.clave] || '#6FE3F5';
    cab.append(punto, el('span', 'n', gr.nombre),
               el('span', 'c', `${piezas.length}`), el('span', 'fl'));
    cab.addEventListener('click', () => caja.classList.toggle('abierta'));

    const lista = el('div', 'piezas');
    const dentro = el('div');
    for (const n of piezas) {
      const b = el('button');
      b.type = 'button';
      b.append(el('span', null, n.nombre));
      if (conFicha(n)) b.append(el('span', 'doc', 'exp'));
      b.addEventListener('click', () => irA(n));
      dentro.appendChild(b);
    }
    lista.appendChild(dentro);
    caja.append(cab, lista);
    elArbol.appendChild(caja);
  }

  if (!piezasVistas) {
    elArbol.appendChild(el('div', 'vacio', 'Nada en el mapa con esa palabra. Se busca en el nombre, en la región, en la descripción y en el expediente entero.'));
  }
  elCuenta.textContent = q
    ? `${piezasVistas} piezas en ${regionesVistas} regiones`
    : `${neuronas.length} piezas · ${axones.length} conexiones · ${regiones.length} regiones · ${INTERNAS} fichas internas no publicadas`;
}

// ── la ventana ──────────────────────────────────────────────────────────────
let volverA = null;      // a qué pieza se vuelve con el botón de atrás del recorrido

function cerrarVentana() {
  document.body.classList.remove('ventana-viva');
  // Se espera a que acabe la transición para esconderla: quitarla de golpe
  // deja el cierre sin animación, que es la mitad de lo que se pidió.
  setTimeout(() => { elVent.hidden = true; }, 260);
  resaltada = null;
}

function abrirVentana(n) {
  const gr = GRUPOS[n.grupo] || {};
  const c = COLOR[n.grupo] || '#6FE3F5';
  const secciones = FICHAS[n.id] || [];

  // ── la ruta: dónde pertenece ──
  vMiga.replaceChildren();
  const reg = el('b', null, gr.nombre || n.grupo);
  reg.style.color = c;
  vMiga.append(el('span', null, 'Orden Global'), el('i', null, '›'), reg,
               el('i', null, '›'), el('span', null, n.nombre));

  vTit.textContent = n.nombre;
  elVent.querySelector('article').style.borderColor = tinte(c, 0.42);

  // ── las etiquetas ──
  vTags.replaceChildren();
  const tag = (txt, clase) => vTags.appendChild(el('span', clase || 'neutra', txt));
  const t = el('span', 'neutra', gr.nombre || n.grupo);
  t.style.color = c;
  vTags.appendChild(t);
  const vecinas = axones.filter((x) => x.a === n || x.b === n);
  tag(`${vecinas.length} ${vecinas.length === 1 ? 'conexión' : 'conexiones'}`);
  // El estado sale del expediente, no de aquí: `confirmado` y `dicho` los
  // separó la Secretaría y pintarlos igual borraría justo ese matiz.
  for (const sec of secciones) if (sec.estado) tag(sec.estado, sec.estado);
  if (n.grupo === 'abierto' || n.grupo === 'decision') tag('sin resolver', 'alerta');
  tag(secciones.length ? `${secciones.length} en expediente` : 'sin expediente');

  vLede.textContent = n.ficha || 'Esta pieza todavía no tiene descripción en el mapa.';

  // ── el cuerpo ──
  vCuerpo.replaceChildren();
  for (const sec of secciones) {
    vCuerpo.appendChild(el('h3', null, sec.titulo));
    for (const p of sec.parrafos || []) vCuerpo.appendChild(el('p', null, p));
    if (sec.datos && sec.datos.length) {
      const dl = el('dl');
      for (const [k, v] of sec.datos) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
      vCuerpo.appendChild(dl);
    }
    if (sec.aviso) vCuerpo.appendChild(el('p', 'aviso', sec.aviso));
    vCuerpo.appendChild(el('p', 'fte', sec.fuente));
  }
  /* El enlace a la página de verdad, si esta pieza tiene una. Solo aparece
     cuando el mapa trae dirección, y el mapa solo la trae para las que se
     comprobaron una a una: un botón que abre una página muerta delante de la
     Junta es peor que no tener botón. */
  if (n.web) {
    vCuerpo.appendChild(el('h3', null, 'La página'));
    const a = document.createElement('a');
    a.className = 'ira';
    a.href = n.web;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';   // la pestaña nueva no puede tocar a ésta
    a.textContent = n.web.replace(/^https?:\/\//, '') + '  ↗';
    vCuerpo.appendChild(a);
  }

  if (vecinas.length) {
    vCuerpo.appendChild(el('h3', null, 'Conecta con'));
    const fila = el('div', 'vecinas');
    for (const ax of vecinas) {
      const otra = ax.a === n ? ax.b : ax.a;
      const b = el('button', null, otra.nombre);
      b.type = 'button';
      b.addEventListener('click', () => irA(otra));
      fila.appendChild(b);
    }
    vCuerpo.appendChild(fila);
  }

  elVent.hidden = false;
  vCuerpo.scrollTop = 0;
  // Un cuadro de respiro antes de encender la clase: sin él el navegador
  // aplica el estado final de golpe y no hay transición ninguna.
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.body.classList.add('ventana-viva')));
  resaltada = n;
  if (n.ficha) voz.recitar([{ texto: `${n.nombre}. ${n.ficha}` }]);
}

elVent.querySelector('.x').addEventListener('click', cerrarVentana);
elVent.querySelector('.fondo').addEventListener('click', cerrarVentana);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!elVent.hidden) cerrarVentana();
  else if (document.body.classList.contains('indice-abierto')) abrirIndice(false);
});

/** La pieza dibujada más cerca del dedo, si hay alguna a tiro.
 *
 *  Esta función se perdió al reescribir el panel por la ventana, y el síntoma
 *  fue que TOCAR EL CEREBRO NO ABRÍA NADA: el manejador la llamaba, no existía,
 *  y el error se quedaba en la consola sin que nadie lo viera. No lo cazó
 *  ninguna prueba porque todas pinchaban el índice y ninguna el lienzo — la
 *  prueba de abajo ya pincha el lienzo, que es como se usa esto de verdad.
 *
 *  El radio de acierto crece con el tamaño de la pieza y tiene un suelo
 *  generoso: con el dedo, nadie le da a un punto de tres píxeles. */
function piezaEn(x, y) {
  let mejor = null, md = Infinity;
  for (const n of neuronas) {
    if (n._e < 0) continue;
    const d = Math.hypot(n._x - x, n._y - y);
    const alcance = Math.max(movil ? 34 : 22, (n._r || 3) * 3.4);
    if (d < alcance && d < md) { md = d; mejor = n; }
  }
  return mejor;
}

/* ══ BUSCAR ═════════════════════════════════════════════════════════════════
   Se busca en el nombre, la región, la descripción Y el expediente entero
   —párrafos y datos—, porque lo que alguien va a preguntar no es el nombre de
   una pieza: «quórum» no titula nada, está dentro del bloque de gobernanza.
   El resultado no es una lista aparte: es el propio índice filtrado, así que
   quien busca sigue viendo EN QUÉ REGIÓN cayó cada cosa. */
const elQ = document.getElementById('q');
const sinTildes = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// El texto en el que se busca, armado UNA vez: hacerlo en cada tecla son cien
// normalizaciones de cadena por pulsación.
const indicePorId = new Map();
for (const n of neuronas) {
  const partes = [n.nombre, (GRUPOS[n.grupo] || {}).nombre || '', n.ficha];
  for (const sec of FICHAS[n.id] || []) {
    partes.push(sec.titulo, ...(sec.parrafos || []));
    for (const [k, v] of sec.datos || []) partes.push(k, v);
  }
  indicePorId.set(n.id, sinTildes(partes.join(' ')));
}

let tecleo = 0;
elQ.addEventListener('input', () => {
  // Un respiro antes de repintar: con cien piezas y el árbol entero, repintar
  // en cada tecla se nota al escribir deprisa.
  clearTimeout(tecleo);
  tecleo = setTimeout(() => pintarArbol(elQ.value.trim()), 90);
});
elQ.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { elQ.value = ''; pintarArbol(''); }
  if (e.key === 'Enter') {
    const primera = elArbol.querySelector('.piezas button');
    if (primera) primera.click();
  }
});

/** Abre una pieza: gira la cámara hasta ponerla de frente y abre su ventana.
 *  Girar y no solo abrir la ventana: con la pieza en la nuca, sus cables
 *  resaltados no se ven y el salto parece no haber hecho nada. */
function irA(n) {
  girandoHacia = -Math.atan2(n.x, n.z);
  abrirVentana(n);
}

pintarArbol('');

/* ── TOCAR UNA REGIÓN ──
   Se prueba contra las cajas TAL CUAL se dibujaron en el último cuadro. La
   línea guía ya ata cada caja a su sitio del cerebro, así que tocar la caja es
   tocar la región aunque la caja esté a media pantalla de distancia. */
lienzo.addEventListener('click', (e) => {
  // Un arrastre para girar termina en `click` y no debe disparar nada: si lo
  // hiciera, girar el cerebro haría hablar a la cara en cada gesto.
  if (arrastró) { arrastró = false; return; }
  const x = e.clientX, y = e.clientY;
  /* Se prueba primero la PIEZA y después la etiqueta. Al revés, una etiqueta
     que quedara encima de una pieza se comería el toque, y la pieza es lo
     concreto: alguien que apunta a un punto quiere ese punto. */
  const pieza = piezaEn(x, y);
  if (pieza) { abrirVentana(pieza); return; }

  const caja = etiquetasVivas.find((q) =>
    q.clave && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
  // Tocar el vacío cierra la ficha: en una proyección nadie quiere buscar la
  // equis, y es el gesto que ya hace todo el mundo.
  // Tocar el vacío apaga el resaltado. La ventana no se toca desde aquí: si
  // está abierta, este toque no llega — se lo queda su propio fondo.
  if (!caja) { resaltada = null; return; }

  const gr = GRUPOS[caja.clave];
  const cuantas = neuronas.filter((n) => n.grupo === caja.clave).length;
  /* El recuento se arma AQUÍ y no está escrito en el guion: así la frase dice
     lo que hay en el mapa hoy, y no una cifra que envejece en cuanto alguien
     añade una pieza. */
  const texto = `${gr.nombre}: ${cuantas} ${cuantas === 1 ? 'pieza' : 'piezas'}. `
              + (REGIONES[caja.clave] || '');
  // Sin `audio`: estas frases no están en el banco. Ver `guion-core.js`.
  voz.recitar([{ texto }]);
});

/* Un arrastre de más de unos píxeles no es un toque. Sin este umbral, en un
   teléfono cualquier giro cuenta como toque: el dedo nunca sale del píxel
   exacto donde entró, y el cerebro se pondría a hablar cada vez que alguien
   lo gira. */
let arrastró = false, tocóEn = null;
lienzo.addEventListener('pointerdown', (e) => { tocóEn = [e.clientX, e.clientY]; arrastró = false; });
lienzo.addEventListener('pointermove', (e) => {
  if (!tocóEn) return;
  if (Math.hypot(e.clientX - tocóEn[0], e.clientY - tocóEn[1]) > 6) arrastró = true;
});
addEventListener('pointerup', () => { tocóEn = null; });
