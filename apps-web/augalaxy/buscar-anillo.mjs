/* BUSCAR UNA GEOMETRÍA QUE NO SE PISE, SIN COMPILAR CADA VEZ.
 *
 * Replica la colocación de Wells.anillo() y el encuadre de rig.encuadrar()
 * con el MISMO Three.js, proyecta a un teléfono de 390x844 y mide la
 * distancia en pantalla entre cada par de casas. Con eso se puede barrer el
 * espacio de parámetros en segundos en vez de compilar y mirar.
 */
import * as THREE from 'three';

const CASAS = [
  { key: 'wallet', banda: 0, peso: 1.32 }, { key: 'chat', banda: 0, peso: 1.06 },
  { key: 'gid', banda: 0, peso: 1.06 }, { key: 'pay', banda: 0, peso: 1.02 },
  { key: 'genesis', banda: 0, peso: 1.0 }, { key: 'aucorp', banda: 1, peso: 1.0 },
  { key: 'scan', banda: 1, peso: 0.92 }, { key: 'oxch', banda: 1, peso: 0.92 },
  { key: 'minas', banda: 1, peso: 0.96 }, { key: 'dbnx', banda: 1, peso: 0.9 },
  { key: 'ajustes', banda: 1, peso: 0.86 },
];
const RADIO_ANILLO = 9.4;
const THETA = 0.65;
/* Los dos cuadros que hay que servir a la vez. rig.encuadrar() elige la
   inclinación por la forma de la pantalla, así que una geometría que arregla
   el teléfono puede romper el monitor: se miden los dos y manda el peor. */
const CUADROS = [
  { nombre: 'teléfono', W: 390, H: 844, FOV: 74, INCL: 0.74 },
  { nombre: 'monitor', W: 1440, H: 900, FOV: 62, INCL: 0.92 },
];

function colocar(c, i, P) {
  const enBanda = CASAS.filter((x) => x.banda === c.banda);
  const idx = enBanda.findIndex((x) => x.key === c.key);
  const n = Math.max(1, enBanda.length);
  const giro = 0.65 + Math.PI / n + (c.banda === 1 ? Math.PI / (n * 2) : 0) + (c.banda === 1 ? P.faseExt : P.faseInt);
  const a = giro + (idx / n) * Math.PI * 2;
  const r = RADIO_ANILLO * (c.banda === 0 ? P.rInt : P.rExt);
  const onda = c.banda === 0 ? -Math.cos(a - 0.65) * 1.15 : Math.sin(a * 2 + 1.7) * 1.2;
  const base = c.banda === 0 ? P.altoInt : P.altoExt;
  /* La pantalla del teléfono es alta y angosta; el anillo, ancho y plano. Con
     `estirar` la órbita se alarga en PROFUNDIDAD, que es el eje que la
     perspectiva convierte en alto de pantalla: la misma galaxia, puesta en la
     forma del cuadro que la va a mostrar. */
  return new THREE.Vector3(Math.cos(a) * r, base + onda * P.onda, Math.sin(a) * r * P.estirar);
}

function medir(P, C) {
  const { W, H, FOV, INCLINACION } = { W: C.W, H: C.H, FOV: C.FOV, INCLINACION: C.INCL };
  /* EL TAMAÑO DEL PLANETA MANDA SOBRE EL ENCUADRE, y ahí estaba la trampa.
     El aro que el encuadre le reserva a cada casa es 2,58 × su peso —para la
     billetera, 3,4 unidades— contra un anillo de radio 6,4: los planetas son
     enormes respecto de su órbita, así que la cámara tiene que irse lejísimos
     para que quepan, y de lejos TODO se junta. Achicar el planeta deja
     acercar la cámara: en pantalla se ve casi igual de grande y los huecos
     entre casas crecen. */
  const anclas = CASAS.map((c, i) => ({ key: c.key, pos: colocar(c, i, P), r: 1.72 * c.peso * P.tam, principal: c.banda === 0 }));
  const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 400);
  let mira = 0.4;
  const poner = (d) => {
    const sp = Math.sin(INCLINACION);
    cam.position.set(d * sp * Math.sin(THETA), d * Math.cos(INCLINACION), d * sp * Math.cos(THETA));
    cam.lookAt(0, mira, 0); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  };
  const medio = Math.tan((FOV * Math.PI) / 180 / 2);
  const cabe = (d, soloPrin) => {
    poner(d); const p = new THREE.Vector3();
    for (const a of anclas) {
      if (soloPrin && !a.principal) continue;
      p.copy(a.pos).project(cam);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      const dist = cam.position.distanceTo(a.pos);
      const rY = (a.r * 1.5) / (medio * dist), rX = rY / cam.aspect;
      if (Math.abs(p.x) + rX > 0.96) return false;
      if (p.y + rY > 0.92 || p.y - rY * 1.25 < -0.92) return false;
    }
    return true;
  };
  let todo = 40; for (let x = 9; x <= 40; x += 0.5) if (cabe(x, false)) { todo = x; break; }
  let prin = 9; for (let x = 9; x <= 40; x += 0.5) if (cabe(x, true)) { prin = x; break; }
  let d = Math.max(prin, todo * 1.04);
  const p = new THREE.Vector3();
  for (let paso = 0; paso < 3; paso++) {
    poner(d); let suma = 0, peso = 0;
    for (const a of anclas) {
      p.copy(a.pos).project(cam);
      const dist = cam.position.distanceTo(a.pos);
      const r = (a.r * 1.5) / (medio * dist);
      const cuanto = r * r * (a.principal ? 1.6 : 1);
      suma += p.y * cuanto; peso += cuanto;
    }
    const centro = peso > 0 ? suma / peso : 0;
    if (Math.abs(centro) < 0.02) break;
    mira = Math.max(-8, Math.min(5, mira + centro * medio * d * 0.85));
  }
  for (let x = d; x <= 40; x += 0.5) if (cabe(x, true)) { d = x; break; }
  /* EL TOPE ES DE VERDAD. rig.encuadrar() termina con clamp(d, 9, 40): pedir
     41,6 no aleja la cámara, la deja en 40 y con las casas un poco más juntas
     —y quizá alguna cortada— que lo que el cálculo prometía. Sin este recorte
     el buscador premiaba encuadres que la aplicación no puede dar. */
  const tocaTope = d > 40;
  d = Math.max(9, Math.min(40, d));
  poner(d);

  /* ¿LE QUEDA SU VENTANA AL CORAZÓN? AU-RA vive en el centro de la galaxia.
     Apretar el anillo de adentro para separar las casas es fácil, y deja al
     corazón detrás de un planeta. Se mide de verdad: dónde cae el origen en
     pantalla y a qué distancia pasa la casa más próxima. */
  const oc = new THREE.Vector3(0, 0, 0).project(cam);
  const centro = { x: (oc.x * 0.5 + 0.5) * W, y: (-oc.y * 0.5 + 0.5) * H };

  const pant = anclas.map((a) => {
    p.copy(a.pos).project(cam);
    const dist = cam.position.distanceTo(a.pos);
    const rpx = ((a.r / (medio * dist)) * H) / 2;
    return { key: a.key, x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, r: rpx, z: p.z, dist };
  });
  const pares = [];
  for (let i = 0; i < pant.length; i++) for (let j = i + 1; j < pant.length; j++) {
    pares.push({ a: pant[i].key, b: pant[j].key, d: Math.hypot(pant[i].x - pant[j].x, pant[i].y - pant[j].y) });
  }
  pares.sort((u, v) => u.d - v.d);
  const fuera = pant.filter((s) => s.x < 0 || s.x > W || s.y < 0 || s.y > H).length;
  const alCorazon = Math.min(...pant.map((s) => Math.hypot(s.x - centro.x, s.y - centro.y) - s.r));
  /* ── CUÁNTO LE TAPA EL DE ADELANTE ──────────────────────────────────────
     Separar los centros no basta: en 3D una casa puede quedar DETRÁS de otra
     y desaparecer aunque sus centros disten cien píxeles. Pasó de verdad —al
     poner los dos planos, ORDENSCAN se metió detrás de Veta Wallet en monitor
     y su blanco de toque cayó de 127 px a 31—, y ningún criterio de distancia
     lo habría visto. Se calcula el área de cada disco cubierta por los discos
     que están MÁS CERCA de la cámara. */
  const tapada = (a) => {
    let cubierto = 0;
    for (const b of pant) {
      if (b === a || b.dist >= a.dist) continue;
      const D = Math.hypot(a.x - b.x, a.y - b.y);
      if (D >= a.r + b.r) continue;
      if (D <= Math.abs(b.r - a.r)) { cubierto += Math.PI * Math.min(a.r, b.r) ** 2; continue; }
      // el área de la lente entre dos círculos que se cruzan
      const r1 = a.r, r2 = b.r;
      const a1 = Math.acos((D * D + r1 * r1 - r2 * r2) / (2 * D * r1));
      const a2 = Math.acos((D * D + r2 * r2 - r1 * r1) / (2 * D * r2));
      cubierto += r1 * r1 * (a1 - Math.sin(2 * a1) / 2) + r2 * r2 * (a2 - Math.sin(2 * a2) / 2);
    }
    return Math.min(1, cubierto / (Math.PI * a.r * a.r));
  };
  const tapadaMax = Math.max(...pant.map(tapada));
  return { pant, pares, d, mira, tocaTope, min: pares[0].d, alCorazon, tapadaMax,
           rmin: Math.min(...pant.map((s) => s.r)),
           apretados: pares.filter((q) => q.d < 60).length, fuera };
}

const BASE = { rInt: 0.68, rExt: 1.08, altoInt: 0, altoExt: 0, onda: 1, faseInt: 0, faseExt: 0, estirar: 1, tam: 1 };
const linea = (n, r) => `  ${n.padEnd(9)} min ${r.min.toFixed(0).padStart(3)} px · pares<60 ${r.apretados} · corazón ${r.alCorazon.toFixed(0).padStart(4)} px · más tapada ${(r.tapadaMax * 100).toFixed(0).padStart(3)}% · cámara ${r.d.toFixed(1)}`;
console.log('COMO ESTÁ HOY:');
for (const C of CUADROS) console.log(linea(C.nombre, medir(BASE, C)));
for (const q of medir(BASE, CUADROS[0]).pares.slice(0, 5)) console.log(`     ${q.a} ↔ ${q.b}  ${q.d.toFixed(0)} px`);

let mejor = null;
for (const rInt of [0.72, 0.76, 0.80, 0.84])
 for (const rExt of [0.84, 0.88, 0.92, 0.96, 1.00])
  for (const estirar of [1.05, 1.15, 1.25, 1.35])
   for (const altoInt of [2.2, 2.7, 3.2, 3.7])
    for (const altoExt of [-2.2, -2.7, -3.2, -3.7])
     for (const onda of [0.9, 1.2, 1.5])
      for (const faseInt of [0.13, 0.26, 0.39])
      for (const faseExt of [-0.13, 0, 0.13, 0.26])
       {
       const P = { rInt, rExt, altoInt, altoExt, onda, faseInt, faseExt, estirar, tam: 1 };
       /* Las condiciones, en los DOS cuadros: nada fuera del borde, nada
          pegado al tope de la cámara, ningún planeta por debajo de 19 px de
          radio —38 de diámetro es el borde de lo que un dedo acierta— y el
          ninguna casa tapada más de un tercio por otra que esté delante, y el
          corazón con al menos 48 px libres alrededor — lo que tiene hoy. El
          anillo de adentro se abrió en su día PARA dejarle el centro a AU-RA;
          apretarlo para separar casas resolvería una queja creando otra.
          Manda el PEOR de los dos: una geometría que luce en el monitor y se
          apelotona en el teléfono no sirve, y al revés tampoco. */
       const rs = CUADROS.map((C) => medir(P, C));
       if (rs.some((r) => r.fuera || r.tocaTope || r.d > 39.8 || r.rmin < 19 || r.alCorazon < 48 || r.tapadaMax > 0.34)) continue;
       const punt = Math.min(...rs.map((r) => r.min - r.apretados * 12));
       if (!mejor || punt > mejor.punt) mejor = { punt, P, rs };
     }
if (!mejor) { console.log('\nNINGUNA combinación cumple las condiciones.'); process.exit(0); }
console.log('\nEL MEJOR:');
CUADROS.forEach((C, i) => console.log(linea(C.nombre, mejor.rs[i])));
console.log('  ', JSON.stringify(mejor.P));
for (const q of mejor.rs[0].pares.slice(0, 5)) console.log(`     ${q.a} ↔ ${q.b}  ${q.d.toFixed(0)} px`);
