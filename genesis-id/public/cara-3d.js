/* La cara de Genesis Core.
 *
 * ══ QUÉ ES ═════════════════════════════════════════════════════════════════
 *
 * Una cabeza de malla poligonal, del mismo material que el cerebro de arriba:
 * puntos, aristas finas y nada más. Vive debajo del cerebro, mueve la boca
 * cuando la voz habla y parpadea cuando no.
 *
 * ══ POR QUÉ ESTÁ HECHA CON UNA FÓRMULA Y NO ES UN MODELO ═══════════════════
 *
 * Un modelo de cabeza —un .glb, un .obj— sería más fácil de mirar y traería
 * tres problemas que esta casa ya conoce: pesa megas que hay que servir, hace
 * falta una librería para cargarlo (y la CSP no deja traerla de un CDN), y la
 * boca habría que moverla igual.
 *
 * Aquí la cabeza es una superficie paramétrica: una elipsoide a la que se le
 * añaden el ceño, las cuencas, la nariz, los pómulos, los labios y la
 * mandíbula. Pesa lo que pesa el texto, y la boca se abre moviendo un número.
 *
 * ══ POR QUÉ EL BRILLO VA POR PROFUNDIDAD ═══════════════════════════════════
 *
 * Es la lección de la primera versión, y no es un detalle de acabado. Los
 * rasgos de una cara son bultos hacia ADELANTE: la nariz, el ceño, la
 * barbilla. Mirando la cabeza de frente, un bulto hacia adelante no mueve ni
 * un píxel en la pantalla — solo cambia la Z. Con todas las aristas pintadas
 * del mismo color, la primera versión salió literalmente como un huevo con dos
 * ojos: los rasgos estaban, medían lo que tenían que medir, y no se veía uno.
 *
 * Lo que los hace visibles es que lo que está cerca brille y lo que está lejos
 * se apague. Con eso, la nariz y el ceño aparecen solos.
 *
 * ══ LA BOCA SIGUE AL AUDIO DE VERDAD ═══════════════════════════════════════
 *
 * Cuando suena un fichero grabado, la abertura sale de medir el volumen del
 * audio en ese instante (Web Audio). No es una animación al azar sincronizada
 * a ojo: la boca se abre cuando hay sonido y se cierra en los silencios, y por
 * eso las pausas de la frase se ven. Cuando habla la voz del navegador no hay
 * forma de medir la señal, y ahí sí se fabrica una envolvente — dicho en el
 * comentario de `nivelFingido`, en `voz-core.js`, para que nadie lo confunda
 * con lo primero.
 */

/* ══ LA CABEZA ══════════════════════════════════════════════════════════════
   Coordenadas: x izquierda-derecha · y arriba(−)/abajo(+) · z frente(+).
   `u` da la vuelta (0 = frente, ±π = nuca) y `v` baja de la coronilla (0) a
   la barbilla (1). */

const suave = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/* Una campana centrada en `c` de anchura `a`. Es la herramienta con la que se
   ponen todos los rasgos: un bulto donde va la nariz, un hoyo donde va la
   cuenca. Coseno elevado y no gaussiana porque llega a cero DE VERDAD en el
   borde, y así un rasgo no ensucia media cara. */
function campana(x, c, a) {
  const d = Math.abs(x - c) / a;
  return d >= 1 ? 0 : Math.cos(d * Math.PI / 2) ** 2;
}

/* ══ EL CANON DE LA CABEZA ══════════════════════════════════════════════════

   Esto es lo que estaba mal, y era una sola cosa mal en muchos sitios: TODOS
   los rasgos estaban demasiado arriba.

   En una cabeza humana, medida de la coronilla a la barbilla, la línea de los
   OJOS cae EXACTAMENTE A LA MITAD. Es la regla más vieja del dibujo de
   retrato y la que más se incumple, porque el ojo cree que los ojos están más
   arriba de lo que están. Aquí estaban a 0,43 — y con ellos, la nariz a 0,53 y
   la boca a 0,65.

   El resultado se veía en cada captura: los rasgos apiñados en la mitad de
   arriba y un desierto entre la boca y el mentón. Eso no es una cara mal
   dibujada: es la cara de otra especie.

   El canon, de coronilla (0) a barbilla (1):

       0,25  nacimiento del pelo
       0,44  cejas
       0,50  OJOS ← la mitad exacta
       0,58  orejas (van de las cejas a la base de la nariz)
       0,72  base de la nariz
       0,83  línea de los labios
       1,00  barbilla

   Todo lo de abajo sale de aquí. Cuando algo se mueva, se mueve respetando
   estas alturas, no a ojo. */
/* Y AQUÍ ESTABA LA TRAMPA, que costó una vuelta entera.

   El canon son fracciones de la ALTURA de la cabeza. Pero `v` no es altura:
   es el ángulo de una esfera, y la altura sale de su coseno. Poner la boca en
   `v = 0,83` no la pone al 83 % de la cara — la pone al 92 %, pegada al
   mentón, que es exactamente como salió en la primera prueba.

   `altura(h)` hace la conversión al revés: se le da la fracción de altura que
   manda el canon y devuelve el `v` que le corresponde. Con esto, cada rasgo
   queda donde dice el canon y no donde lo deja la trigonometría.

       altura(0,50) → 0,500   ojos
       altura(0,72) → 0,645   base de la nariz
       altura(0,83) → 0,735   labios */
const altura = (h) => Math.acos(-(2 * h - 1)) / Math.PI;

const CEJA_V   = altura(0.44);
const OJO_V    = altura(0.50);
const OREJA_V  = altura(0.58);
const NARIZ_V  = altura(0.72);
const BOCA_V   = altura(0.83);
const MENTON_V = altura(0.955);

// La boca vive entre estas dos alturas. La costura —donde la malla se abre—
// va justo en medio, y de ahí sale también qué aristas hay que no dibujar.
const BOCA_ARRIBA = 0.7048, BOCA_ABAJO = 0.7633;
const BOCA_COSTURA = (BOCA_ARRIBA + BOCA_ABAJO) / 2;
const BOCA_ANCHO = 0.62;                 // hasta dónde llega de lado, en `u`

function vertice(u, v, boca) {
  const cu = Math.cos(u), su = Math.sin(u);
  const delante = Math.max(0, cu);          // 1 de frente, 0 de perfil
  const ph = v * Math.PI;
  const sp = Math.sin(ph), cp = Math.cos(ph);

  /* ══ EL PERFIL ══════════════════════════════════════════════════════════
     Ésta es la corrección que faltaba, y no es un rasgo más: es LA forma.

     Una cabeza vista de lado no es un óvalo. Tiene una frente casi vertical,
     un escalón donde empieza la nariz, la nariz saliendo, un retroceso en el
     labio y otro bajo el mentón. Ese contorno es lo que el ojo reconoce como
     cara antes que ninguna otra cosa.

     Las versiones anteriores ponían nariz, ceño y labios como BULTOS sobre
     una elipsoide, y el resultado seguía siendo una elipsoide con bultos: de
     frente no se veían, y de lado el contorno seguía siendo un huevo. Aquí el
     perfil se define primero —cuánto sale la cara a cada altura— y los rasgos
     se montan encima. */
  const perfil =
      0.045 * campana(v, 0.3690, 0.120)   // la frente, adelantada
    - 0.030 * campana(v, 0.4713, 0.045)  // el escalón del entrecejo
    + 0.150 * campana(v, 0.6070, 0.075)  // la nariz saliendo
    - 0.060 * campana(v, 0.6854, 0.035)  // el retroceso sobre el labio
    + 0.042 * campana(v, BOCA_V, 0.030)   // los labios
    - 0.052 * campana(v, 0.7797, 0.032)  // el hueco bajo el labio
    + 0.058 * campana(v, MENTON_V, 0.048);  // el mentón

  let rx = 0.70, ry = 1.0, rz = 0.80;

  // El cráneo abulta por detrás; sin esto la cabeza es un huevo simétrico.
  rz *= 1 + 0.14 * Math.max(0, -cu);

  /* La mandíbula: se estrecha hacia la barbilla. Es lo que más distingue una
     cabeza de una pelota. Al cuadrado, para que el estrechamiento empiece
     suave a la altura de la boca y apriete abajo. */
  const bajo = suave((v - 0.5771) / 0.423);
  rx *= 1 - 0.52 * bajo * bajo;
  rz *= 1 - 0.26 * bajo * bajo;
  // La coronilla se redondea, que si no queda un pico.
  rx *= 1 - 0.14 * suave((0.16 - v) / 0.16);
  rz *= 1 - 0.10 * suave((0.16 - v) / 0.16);
  // Y las sienes se meten un poco: una cabeza no es igual de ancha a la altura
  // de los ojos que a la altura de las orejas.
  rx *= 1 - 0.07 * campana(v, CEJA_V, 0.110);

  let x = rx * sp * su;
  let y = -ry * cp;
  // El perfil solo cuenta por delante: por detrás la cabeza es un cráneo liso.
  let z = rz * sp * cu + perfil * delante * delante;

  /* ── LOS RASGOS ──
     Las amplitudes son grandes a propósito. En la primera versión eran tres
     veces menores «para que no exagerase», y el resultado fue que no se veía
     ninguno: en una malla de alambre sin sombra, un rasgo sutil no existe. */

  // el ceño, encima de las cejas
  z += 0.075 * delante * campana(v, CEJA_V, 0.062);

  // las cuencas: dos hoyos a los lados del puente de la nariz
  const cuenca = campana(Math.abs(u), 0.42, 0.30) * campana(v, OJO_V, 0.050);
  z -= 0.10 * cuenca;

  // la nariz: caballete, punta y aletas
  const caballete = campana(u, 0, 0.26) * campana(v, 0.5706, 0.085);
  const punta = campana(u, 0, 0.19) * campana(v, NARIZ_V, 0.042);
  z += 0.13 * caballete + 0.20 * punta;
  z += 0.075 * campana(Math.abs(u), 0.21, 0.13) * campana(v, 0.6557, 0.024);
  // y el surco entre la nariz y el labio
  z -= 0.035 * campana(u, 0, 0.30) * campana(v, 0.6854, 0.018);

  // los pómulos
  const pomulo = campana(Math.abs(u), 0.66, 0.32) * campana(v, 0.5739, 0.065);
  x *= 1 + 0.075 * pomulo;
  z += 0.045 * pomulo;

  /* Las orejas. Van aquí y no como adorno: sin ellas la silueta es un huevo,
     por muy bien puestos que estén la nariz y el mentón. Son el rasgo que a
     dos metros dice «esto es una cabeza». */
  const oreja = campana(Math.abs(u), Math.PI / 2, 0.30) * campana(v, OREJA_V, 0.085);
  x *= 1 + 0.16 * oreja;
  z -= 0.05 * oreja;                     // van algo atrasadas, como las de verdad

  // los labios: dos rodetes, el de arriba y el de abajo
  z += 0.075 * campana(u, 0, 0.44) * campana(v, 0.7194, 0.024);
  z += 0.065 * campana(u, 0, 0.40) * campana(v, 0.7468, 0.026);

  // la barbilla y el hueco de debajo del labio
  z -= 0.040 * delante * campana(v, 0.7828, 0.026);
  z += 0.090 * delante * campana(v, MENTON_V, 0.048);

  /* ── LA BOCA SE ABRE ──
     Tres cosas a la vez, y hacen falta las tres. El labio de arriba sube un
     poco, el de abajo baja mucho, y la MANDÍBULA ENTERA rota con él. Moviendo
     solo el labio la cara parecía un buzón: se abría un agujero en una cara
     quieta. */
  const zona = campana(u, 0, BOCA_ANCHO);
  if (v >= BOCA_COSTURA) {
    const cuanto = suave((v - BOCA_COSTURA) / 0.10);
    y += boca * 0.10 * cuanto * zona;                       // el labio de abajo
    y += boca * 0.085 * suave((v - BOCA_COSTURA) / 0.26);   // la mandíbula
    z -= boca * 0.045 * suave((v - 0.74) / 0.26);           // se recoge atrás
  } else {
    y -= boca * 0.035 * zona * suave((v - 0.55) / 0.07);    // el de arriba
  }

  return [x, y, z];
}

/* La malla. Rejilla de paralelos y meridianos, más UNA diagonal por celda: la
   diagonal es lo que convierte los cuadros en triángulos, y es la diferencia
   entre que esto parezca una red de pescar y una cabeza facetada.

   `v` no llega ni a 0 ni a 1: en los polos todos los meridianos caen en el
   mismo punto y sale una estrella de rayos en la coronilla y otra en la
   barbilla — dos artefactos que no son parte de ninguna cabeza. */
/* Malla más densa: 60×46 en vez de 44×34, o sea el doble de caras. En la
   referencia la malla es densa y por eso se lee como una superficie tallada;
   a 44×34 cada triángulo era tan grande que la cara parecía un balón de
   fútbol. Son 2.760 vértices — nada para un lienzo de doscientos píxeles. */
const NU = 60, NV = 46;
/* `v` se corta antes del polo por los dos lados. En el polo, los cuarenta y
   cuatro meridianos caen en el mismo punto: arriba salía una estrella de
   rayos y abajo una aguja bajo el mentón. Cortando, arriba queda una coronilla
   plana pequeña —que es lo que hay— y abajo el borde de la mandíbula, que es
   justo donde empieza el cuello. */
const V0 = 0.045, V1 = 0.988;

/* La rejilla NO se reparte pareja. Se aprieta a la altura de los ojos, la
   nariz y la boca, y se estira en la coronilla y en la nuca, donde no pasa
   nada. Es lo que hace cualquier modelador: la densidad va donde está el
   detalle. Repartida pareja, la mitad de los triángulos se gastan dibujando un
   cráneo liso y a los rasgos les tocan cuatro.

   Y se hace INTEGRANDO una densidad, no sumando tirones sobre `v`. El primer
   intento sumaba tres senos y salía una función NO MONÓTONA: dos filas se
   cruzaban, y en el cuadro aparecían dos costuras horizontales atravesando la
   cara de oreja a oreja. Integrando, el reparto es monótono por construcción:
   no puede cruzarse aunque se toquen los números. */
function repartirV() {
  const densidad = (t) => 1
    + 1.7 * campana(t, 0.4873, 0.12)    // cejas y ojos
    + 1.5 * campana(t, 0.6310, 0.10)    // nariz
    + 1.6 * campana(t, 0.7652, 0.11);   // boca y mentón

  const N = 900, acum = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) acum[i] = acum[i - 1] + densidad(i / N);
  const total = acum[N];

  const vs = [];
  let i = 0;
  for (let j = 0; j < NV; j++) {
    const meta = (j / (NV - 1)) * total;
    while (i < N && acum[i + 1] < meta) i++;
    vs.push(V0 + (V1 - V0) * (i / N));
  }
  return vs;
}

function construirCara() {
  const puntos = [];
  const filas = repartirV();
  for (let j = 0; j < NV; j++) {
    const v = filas[j];
    for (let i = 0; i < NU; i++) {
      puntos.push({ u: (i / NU) * Math.PI * 2 - Math.PI, v,
                    x: 0, y: 0, z: 0, _e: -1, _b: 0 });
    }
  }
  const ind = (i, j) => j * NU + i;
  const aristas = [];
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = ind(i, j), d = ind((i + 1) % NU, j);
      aristas.push([a, d, 0]);
      if (j + 1 < NV) {
        const b = ind(i, j + 1), c = ind((i + 1) % NU, j + 1);
        /* La tercera casilla marca las aristas que CRUZAN la costura de la
           boca dentro de su anchura. Cuando la boca se abre, ésas se dejan de
           dibujar: si no, la abertura queda cruzada por los hilos que unen el
           labio de arriba con el de abajo y no se ve un hueco, se ve una
           malla estirada. */
        const cruza = puntos[a].v < BOCA_COSTURA && puntos[b].v >= BOCA_COSTURA
          && Math.abs(puntos[a].u) < BOCA_ANCHO;
        aristas.push([a, b, cruza ? 1 : 0]);
        aristas.push([a, c, cruza ? 1 : 0]);
      }
    }
  }
  return { puntos, aristas };
}

/* ══ EL CUELLO Y LOS HOMBROS ════════════════════════════════════════════════
   La cabeza acaba en la mandíbula y hasta ahora flotaba. En la referencia hay
   cuello y un arranque de hombros, y no es adorno: una cabeza cortada por la
   barbilla se lee como una máscara: con cuello se lee como una persona.

   Es una rejilla suelta —dos columnas de aros y unos puntos a los lados— y no
   parte de la malla de la cara, porque no tiene que deformarse con la boca ni
   con los rasgos. */
const CUELLO = (() => {
  const puntos = [], aristas = [];
  const AROS = 5, POR_ARO = 18;
  for (let j = 0; j < AROS; j++) {
    const t = j / (AROS - 1);
    const y = 0.90 + t * 0.52;                    // de la mandíbula hacia abajo
    const r = 0.30 + t * t * 0.42;                // se ensancha hacia el hombro
    for (let i = 0; i < POR_ARO; i++) {
      const a = (i / POR_ARO) * Math.PI * 2;
      puntos.push({ x: r * Math.sin(a), y, z: r * 0.82 * Math.cos(a), _e: -1, _b: 0 });
    }
  }
  const ind = (i, j) => j * POR_ARO + i;
  for (let j = 0; j < AROS; j++) {
    for (let i = 0; i < POR_ARO; i++) {
      aristas.push([ind(i, j), ind((i + 1) % POR_ARO, j)]);
      if (j + 1 < AROS) aristas.push([ind(i, j), ind(i, j + 1)]);
    }
  }
  return { puntos, aristas };
})();

// Los ojos no son parte de la rejilla: son dos discos con su pupila puestos en
// el hueco de la cuenca. Sacarlos de la malla es lo que permite que parpadeen
// sin deformar la cara alrededor.
const OJOS = [-0.42, 0.42].map((u) => ({ u, v: OJO_V }));

/* ══ LOS CONTORNOS ═════════════════════════════════════════════════════════
   Esto es lo que faltaba, y es la diferencia entre una malla con bultos y una
   CARA.

   Tres intentos se fueron en modelar los rasgos empujando vértices —nariz,
   ceño, labios, mandíbula, perfil— y el resultado seguía siendo un huevo con
   ojos. La razón es sencilla cuando se ve: en una malla de alambre, una
   superficie que se curva no dibuja ninguna línea. El ojo humano reconoce una
   cara por sus CONTORNOS —el borde del párpado, el caballete de la nariz, la
   línea de los labios, el ángulo de la mandíbula— y esos contornos hay que
   trazarlos, no insinuarlos.

   Así se hace en el vídeo de referencia, y por eso allí se lee la cara al
   instante aunque la malla de fondo sea igual de regular que la nuestra.

   Cada contorno es una lista de puntos en (u,v) que pasan por la misma
   `vertice()` que la malla: van pegados a la superficie, se deforman con ella
   y se abren con la boca, sin ser un dibujo aparte encima. */
const CONTORNOS = [
  // el caballete de la nariz, del entrecejo a la punta
  { p: [[0, 0.4841], [0, 0.5287], [0, 0.5739], [0, 0.6138], [0, NARIZ_V]], g: 1.5 },
  // las aletas: de la punta hacia fuera y abajo, una a cada lado
  { p: [[0, 0.6486], [-0.11, 0.6543], [-0.19, 0.6608], [-0.21, 0.6681]], g: 1.2 },
  { p: [[0, 0.6486], [ 0.11, 0.6543], [ 0.19, 0.6608], [ 0.21, 0.6681]], g: 1.2 },
  // la línea de los labios, de comisura a comisura
  { p: [[-0.44, 0.7363], [-0.26, 0.7269], [-0.10, 0.7311], [0, BOCA_V],
        [0.10, 0.7311], [0.26, 0.7269], [0.44, 0.7363]], g: 1.6, boca: true },
  // el arco del labio de abajo
  { p: [[-0.42, 0.7380], [-0.22, 0.7577], [0, 0.7633], [0.22, 0.7577], [0.42, 0.7380]],
    g: 1.2, bajo: true },
  /* La mandíbula: del lóbulo de la oreja al mentón. Arranca a la altura de la
     oreja y no en la sien: una mandíbula empieza DEBAJO de la oreja. */
  { p: [[-1.30, 0.5903], [-1.05, 0.6594], [-0.68, 0.7424], [-0.28, 0.8295], [0, 0.8639],
        [0.28, 0.8295], [0.68, 0.7424], [1.05, 0.6594], [1.30, 0.5903]], g: 1.1 },
  // Los pómulos, tenues: a la misma luz que el resto salían como dos arañazos.
  { p: [[-0.86, 0.5544], [-0.70, 0.5739], [-0.52, 0.5903]], g: 0.8, tenue: true },
  { p: [[ 0.86, 0.5544], [ 0.70, 0.5739], [ 0.52, 0.5903]], g: 0.8, tenue: true },
];

/* El borde del párpado: una almendra alrededor de cada ojo. Va aparte de la
   lista de arriba porque se cierra sobre sí misma y porque su altura la manda
   el parpadeo. */
function almendra(centroU, v, abre) {
  const p = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    p.push([centroU + Math.cos(a) * 0.150,
            v + Math.sin(a) * 0.027 * Math.max(0.06, abre)]);
  }
  return p;
}

/** Crea la cara sobre un lienzo propio. Devuelve el mando: `nivel(x)` mueve la
 *  boca y `mirar(x)` la gira un poco hacia donde se le diga. */
export function crearCara(lienzo) {
  const ctx = lienzo.getContext('2d', { alpha: true });
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const malla = construirCara();

  let W = 0, H = 0, dpr = 1;
  function medir() {
    const c = lienzo.getBoundingClientRect();
    W = Math.max(1, c.width); H = Math.max(1, c.height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    lienzo.width = Math.round(W * dpr);
    lienzo.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', medir);
  medir();

  // Distancia de cámara larga: de cerca la nariz se agranda y la cara sale con
  // perspectiva de ojo de pez.
  const DIST = 4.4;

  const estado = {
    boca: 0, bocaObjetivo: 0,
    parpadeo: 1,                      // 1 = abierto, 0 = cerrado
    proximo: 1400,
    /* Arranca ligeramente girada. De frente del todo, una cabeza simétrica se
       lee como una máscara plana; con un cuarto de giro se ve que hay volumen
       antes de que se mueva nada. */
    giro: 0.26, giroObjetivo: 0.26,
    cabeceo: 0,
    color: '#6FE3F5',
  };

  function proyectar(p) {
    // Giro en Y y después cabeceo en X. En ese orden: al revés la cabeza
    // bambolea en vez de girar sobre su cuello.
    const cy = Math.cos(estado.giro), sy = Math.sin(estado.giro);
    const cx = Math.cos(estado.cabeceo), sx = Math.sin(estado.cabeceo);
    const x1 = p.x * cy - p.z * sy;
    const z1 = p.x * sy + p.z * cy;
    const y2 = p.y * cx - z1 * sx;
    const z2 = p.y * sx + z1 * cx;
    const d = DIST + z2;
    if (d < 0.5) { p._e = -1; return; }
    /* La escala se despeja del alto del lienzo en vez de ser un número: la
       cabeza mide dos unidades y tiene que ocupar el ochenta por ciento del
       cuadro, tenga el lienzo el tamaño que tenga. Con un número fijo, la cara
       del teléfono —la mitad de lienzo— salía del tamaño de una uña. */
    const e = H * 0.40 * (DIST / d);
    p._x = W / 2 + x1 * e;
    p._y = H * 0.50 + y2 * e;
    p._e = e;
    p._z = z2;
  }

  const BANDAS = 8;
  const cubos = Array.from({ length: BANDAS }, () => []);
  let anterior = 0;

  function cuadro(ahora) {
    const dt = Math.min(64, ahora - anterior || 16); anterior = ahora;

    // La boca persigue su objetivo, no salta: sin suavizar vibra al ritmo del
    // análisis del audio y parece un tic, no habla.
    estado.boca += (estado.bocaObjetivo - estado.boca) * Math.min(1, dt / 55);
    estado.giro += (estado.giroObjetivo - estado.giro) * 0.045;
    if (!quieto) {
      estado.cabeceo = Math.sin(ahora * 0.00040) * 0.055;
      estado.giro += Math.sin(ahora * 0.00027) * 0.0016;   // un vaivén mínimo
    }

    // Parpadeo: cerrar es rápido y abrir un poco menos, como el de verdad.
    if (!quieto) {
      estado.proximo -= dt;
      if (estado.proximo < 0) {
        const t = -estado.proximo;
        estado.parpadeo = t < 70 ? 1 - t / 70 : t < 190 ? (t - 70) / 120 : 1;
        if (t > 190) estado.proximo = 2400 + Math.random() * 3600;
      } else estado.parpadeo = 1;
    }

    ctx.clearRect(0, 0, W, H);

    let zMin = Infinity, zMax = -Infinity;
    for (const p of malla.puntos) {
      const [x, y, z] = vertice(p.u, p.v, estado.boca);
      p.x = x; p.y = y; p.z = z;
      proyectar(p);
      if (p._e < 0) continue;
      if (p._z < zMin) zMin = p._z;
      if (p._z > zMax) zMax = p._z;
    }
    /* El brillo se normaliza con el mínimo y el máximo QUE HAY EN ESTE CUADRO,
       no con un margen escrito a mano. Con el margen fijo, al girar la cabeza
       la franja más brillante dejaba de usarse y los rasgos se apagaban justo
       cuando más se les ve, que es de tres cuartos. */
    const zRan = Math.max(0.001, zMax - zMin);
    for (const p of malla.puntos) {
      // Al cuadrado: concentra la luz en la nariz, el ceño y los pómulos sin
      // dejar el resto de la cara a oscuras. Al cubo —que fue el primer
      // intento— solo brillaba la nariz y lo demás se perdía.
      p._b = p._e < 0 ? 0 : ((p._z - zMin) / zRan) ** 2;
    }

    ctx.globalCompositeOperation = 'lighter';

    // El cuello, primero y tenue: está detrás de todo y no compite con la cara.
    for (const p of CUELLO.puntos) proyectar(p);
    ctx.strokeStyle = tinte(estado.color, 0.10);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const [i, j] of CUELLO.aristas) {
      const a = CUELLO.puntos[i], b = CUELLO.puntos[j];
      if (a._e < 0 || b._e < 0) continue;
      ctx.moveTo(a._x, a._y); ctx.lineTo(b._x, b._y);
    }
    ctx.stroke();
    ctx.fillStyle = tinte(estado.color, 0.30);
    ctx.beginPath();
    for (const p of CUELLO.puntos) {
      if (p._e < 0 || p.z < -0.05) continue;
      ctx.rect(p._x - 0.6, p._y - 0.6, 1.2, 1.2);
    }
    ctx.fill();

    /* Las aristas, repartidas en ocho franjas de brillo. Ocho y no dos: es lo
       que dibuja el relieve. Y son ocho trazos por cuadro, no dos mil. */
    for (const c of cubos) c.length = 0;
    for (const ar of malla.aristas) {
      // La costura de la boca desaparece según se abre.
      if (ar[2] && estado.boca > 0.12) continue;
      const a = malla.puntos[ar[0]], b = malla.puntos[ar[1]];
      if (a._e < 0 || b._e < 0) continue;
      const k = Math.min(BANDAS - 1, Math.floor((a._b + b._b) / 2 * BANDAS));
      cubos[k].push(a, b);
    }
    ctx.lineWidth = 0.75;
    for (let k = 0; k < BANDAS; k++) {
      const c = cubos[k];
      if (!c.length) continue;
      ctx.strokeStyle = tinte(estado.color, 0.035 + (k / (BANDAS - 1)) ** 2 * 0.62);
      ctx.beginPath();
      for (let i = 0; i < c.length; i += 2) {
        ctx.moveTo(c[i]._x, c[i]._y);
        ctx.lineTo(c[i + 1]._x, c[i + 1]._y);
      }
      ctx.stroke();
    }

    // Los vértices, con el mismo criterio de profundidad.
    for (let k = 2; k < BANDAS; k++) {
      const c = cubos[k];
      if (!c.length) continue;
      ctx.fillStyle = tinte(estado.color, 0.14 + (k / (BANDAS - 1)) ** 2 * 0.80);
      const s = 0.9 + (k / (BANDAS - 1)) * 1.1;
      ctx.beginPath();
      for (const p of c) ctx.rect(p._x - s / 2, p._y - s / 2, s, s);
      ctx.fill();
    }

    // Los ojos
    for (const o of OJOS) {
      const [x, y, z] = vertice(o.u, o.v, 0);
      const p = { x, y, z: z + 0.02 };
      proyectar(p);
      if (p._e < 0 || p._b < 0.25) continue;      // el ojo de la nuca no se pinta
      /* Un ojo es más ancho que alto y tiene párpado. Redondo y grande salía
         un faro, y dos faros en una malla no son una mirada. */
      const R = p._e * 0.038;
      const alto = Math.max(0.05, estado.parpadeo);
      ctx.fillStyle = tinte(estado.color, 0.30);
      ctx.beginPath(); ctx.ellipse(p._x, p._y, R * 1.75, R * 0.95 * alto, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(238,252,255,${0.95 * alto})`;
      ctx.beginPath(); ctx.ellipse(p._x, p._y, R * 0.52, R * 0.52 * Math.max(0.12, alto), 0, 0, 7); ctx.fill();
      // El párpado: un arco por encima, que es lo que da la expresión.
      ctx.strokeStyle = tinte(estado.color, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p._x, p._y, R * 1.8, R * 1.05, 0, Math.PI * 1.06, Math.PI * 1.94);
      ctx.stroke();
    }

    /* ── LOS CONTORNOS ──
       Se dibujan DESPUÉS de la malla y ANTES de los ojos, y brillantes: son la
       línea que el ojo sigue para reconocer la cara. Cada punto pasa por la
       misma `vertice()` que la malla, así que van pegados a la superficie y se
       mueven con ella — el contorno de los labios se abre cuando se abre la
       boca, sin código aparte. */
    const traza = (pts, grosor, alfa) => {
      ctx.strokeStyle = tinte(estado.color, alfa);
      ctx.lineWidth = grosor;
      ctx.beginPath();
      let abierto = false;
      for (const [u, v] of pts) {
        const [x, y, z] = vertice(u, v, estado.boca);
        const q = { x, y, z: z + 0.012 };    // un pelo por delante, para que no
        proyectar(q);                        // se lo coma la propia malla
        // Lo que ha girado hacia la nuca no se dibuja: un contorno de la cara
        // asomando por detrás de la cabeza es lo que delata que esto es una
        // superficie hueca y no una cabeza.
        if (q._e < 0 || q._z < -0.15) { abierto = false; continue; }
        if (!abierto) { ctx.moveTo(q._x, q._y); abierto = true; }
        else ctx.lineTo(q._x, q._y);
      }
      ctx.stroke();
    };

    for (const c of CONTORNOS) traza(c.p, c.g, c.tenue ? 0.26 : 0.62);
    for (const o of OJOS) traza(almendra(o.u, o.v, estado.parpadeo), 1.25, 0.70);

    /* Las cejas. Dos arcos y nada más, pero son lo que convierte dos ojos en
       una MIRADA: sin ellas la cara se queda con cara de nada. */
    for (const o of OJOS) {
      const [x, y, z] = vertice(o.u, CEJA_V, 0);   // la ceja, sobre el ojo
      const p = { x, y, z: z + 0.02 };
      proyectar(p);
      if (p._e < 0 || p._b < 0.18) continue;
      ctx.strokeStyle = tinte(estado.color, 0.42);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(p._x, p._y + p._e * 0.02, p._e * 0.075, p._e * 0.030,
                  0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }

    /* El resplandor de la boca al hablar. Es lo que hace que a dos metros se
       vea QUIÉN está hablando, sin tener que distinguir la mueca. */
    if (estado.boca > 0.02) {
      const [x, y, z] = vertice(0, BOCA_COSTURA, estado.boca);
      const p = { x, y, z };
      proyectar(p);
      if (p._e > 0) {
        const R = p._e * (0.09 + estado.boca * 0.11);
        const g = ctx.createRadialGradient(p._x, p._y, 0, p._x, p._y, R);
        g.addColorStop(0, tinte(estado.color, 0.34 * estado.boca));
        g.addColorStop(1, tinte(estado.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p._x, p._y, R, 0, 7); ctx.fill();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);

  return {
    /** 0 = boca cerrada, 1 = abierta del todo. */
    nivel(x) { estado.bocaObjetivo = Math.max(0, Math.min(1, x)); },
    /** −1 izquierda, 0 de frente, 1 derecha. */
    mirar(x) { estado.giroObjetivo = 0.26 + Math.max(-1, Math.min(1, x)) * 0.30; },
    color(c) { estado.color = c; },
    medir,
  };
}

function tinte(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
