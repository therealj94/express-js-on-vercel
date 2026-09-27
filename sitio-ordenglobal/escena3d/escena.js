/* ════════════════════════════════════════════════════════════════════════════
   ORIGEN, en 3D · la escena. Fuente: esto NO se publica tal cual.

   construir-3d.sh la empaqueta con esbuild junto con las partes de Three.js
   que usa (y nada más) en assets/origen3d-escena.js, que es lo que carga
   assets/origen3d.js cuando la sección se acerca.

   Un gramo de oro martillado se marca en 55 porciones; una sale sola y es un
   gramín: un ORIGEN. Aparece el símbolo en su anillo de 55 marcas y sube y
   baja con el oro. El scroll lleva la cuenta, como en el tráiler.
   ════════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import SIMBOLO from './simbolo.js';

export async function arrancar(sec) {
  const lienzo = sec.querySelector('canvas');
  const escena3 = sec.querySelector('.escena');
  const frases = sec.querySelectorAll('.frase');

  const render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' });
  render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  render.toneMapping = THREE.ACESFilmicToneMapping;
  render.toneMappingExposure = 0.92;
  render.outputColorSpace = THREE.SRGBColorSpace;

  const escena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(render);
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

  // Luz de estudio cálida: una principal, un contraluz y un relleno bajo.
  const clave = new THREE.DirectionalLight(0xffe2a8, 2.6); clave.position.set(2.5, 4, 3); escena.add(clave);
  const contra = new THREE.DirectionalLight(0xffc56b, 1.6); contra.position.set(-3, 1.5, -3); escena.add(contra);
  escena.add(new THREE.AmbientLight(0x4a3820, 0.6));

  // La superficie martillada: ruido fractal dibujado en un lienzo, que sirve
  // de relieve y de rugosidad. Sale igual cada vez (semilla fija, la 5550).
  function textura() {
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    let s = 5550; const az = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const capas = [8, 16, 32, 64].map((k) => { const a = new Float32Array(k * k); for (let i = 0; i < a.length; i++) a[i] = az(); return { k, a }; });
    const suave = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, peso = 0.55;
      for (const { k, a } of capas) {
        const fx = (x / N) * k, fy = (y / N) * k, x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = suave(fx - x0), ty = suave(fy - y0), P = (i, j) => a[((j % k) * k) + (i % k)];
        const n = (P(x0, y0) * (1 - tx) + P(x0 + 1, y0) * tx) * (1 - ty) + (P(x0, y0 + 1) * (1 - tx) + P(x0 + 1, y0 + 1) * tx) * ty;
        v += n * peso; peso *= 0.5;
      }
      const o = (y * N + x) * 4, b = Math.max(0, Math.min(255, v * 230));
      img.data[o] = img.data[o + 1] = img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  const martillado = textura();

  // Las 55 porciones: cada una es un sector extruido con bisel, así el gramo
  // es de verdad 55 piezas y no un dibujo.
  const R = 1, r0 = 0.045, GROSOR = 0.07, N = 55, HUECO = 0.0035;
  const BASE = new THREE.Color(0xc99a3a);
  const oro = new THREE.MeshStandardMaterial({ color: BASE, metalness: 1, roughness: 0.34, bumpMap: martillado, bumpScale: 3, roughnessMap: martillado, transparent: true });
  const oroUno = oro.clone(); oroUno.transparent = false;
  // El gramo entero, antes de marcarse: una sola pieza, sin líneas.
  const entera = new THREE.Shape();
  entera.absarc(0, 0, R, 0, Math.PI * 2, false);
  const agujero = new THREE.Path(); agujero.absarc(0, 0, r0, 0, Math.PI * 2, true); entera.holes.push(agujero);
  const geoEntera = new THREE.ExtrudeGeometry(entera, { depth: GROSOR, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.006, bevelSegments: 2, curveSegments: 96 });
  geoEntera.translate(0, 0, -GROSOR / 2);
  // Las coordenadas UV de la extrusión son las del plano: se llevan a [0,1].
  [martillado].forEach((t) => { t.repeat.set(1 / (2 * R), 1 / (2 * R)); t.offset.set(0.5, 0.5); });

  const disco = new THREE.Group();
  const piezas = [];
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 + HUECO, a1 = ((i + 1) / N) * Math.PI * 2 - HUECO;
    const f = new THREE.Shape();
    f.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    f.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    f.absarc(0, 0, R, a0, a1, false);
    f.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
    f.absarc(0, 0, r0, a1, a0, true);
    const geo = new THREE.ExtrudeGeometry(f, { depth: GROSOR, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6 });
    geo.translate(0, 0, -GROSOR / 2);
    const m = new THREE.Mesh(geo, i === 0 ? oroUno : oro);
    m.userData.medio = (a0 + a1) / 2;
    disco.add(m); piezas.push(m);
  }
  // La porción que sale queda arriba, apuntando al espectador.
  const moneda = new THREE.Mesh(geoEntera, oro); disco.add(moneda);
  disco.rotation.z = Math.PI / 2 - piezas[0].userData.medio;
  const soporte = new THREE.Group(); soporte.add(disco); escena.add(soporte);

  // El símbolo de ORIGEN, en oro macizo, dentro de un anillo con 55 marcas:
  // la del gramín, arriba, más larga. Aparece cuando la porción se va.
  const oroSimbolo = new THREE.MeshStandardMaterial({ color: 0xd9ad4a, metalness: 1, roughness: 0.26, bumpMap: martillado, bumpScale: 1.2, transparent: true });
  const simbolo = new THREE.Group();
  const ALTO = 1.3;
  SIMBOLO.formas.forEach((fz) => {
    const sh = new THREE.Shape(fz.contorno.map(([x, y]) => new THREE.Vector2(x * ALTO, y * ALTO)));
    fz.agujeros.forEach((h) => sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x * ALTO, y * ALTO)))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.01, bevelSegments: 3, curveSegments: 12 });
    g.translate(0, 0, -0.05);
    simbolo.add(new THREE.Mesh(g, oroSimbolo));
  });
  const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.008, 8, 160), oroSimbolo);
  simbolo.add(anillo);
  const marcas = [];
  for (let i = 0; i < N; i++) {
    const larga = i === 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, larga ? 0.13 : 0.05, 0.012), oroSimbolo);
    const a = Math.PI / 2 - (i / N) * Math.PI * 2;
    const rr = 0.9 + (larga ? 0.065 : 0.025);
    m.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0); m.rotation.z = a - Math.PI / 2;
    simbolo.add(m); marcas.push(m);
  }
  simbolo.position.y = 0.32;
  escena.add(simbolo);

  // ── El guion: cada tramo del scroll, un paso del tráiler ─────────────────
  const lim = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const suave = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const tramo = (p, a, b) => suave(lim((p - a) / (b - a)));
  const PASOS = [0, 0.2, 0.42, 0.68, 0.82, 1.01];

  let ancho = 0, alto = 0;
  function medir() {
    ancho = lienzo.clientWidth; alto = lienzo.clientHeight;
    render.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    // En un teléfono de pie hace falta más distancia para que el gramo quepa.
    camara.position.set(0, 0, camara.aspect < 0.8 ? 8 : 5.6);
    camara.updateProjectionMatrix();
  }

  let p = 0, t0 = performance.now(), visible = false;
  function progreso() {
    const b = sec.getBoundingClientRect();
    return lim(-b.top / Math.max(1, b.height - innerHeight));
  }

  function cuadro(ahora) {
    if (!visible) return;
    const t = (ahora - t0) / 1000;
    p = progreso();

    // 1 · El gramo entero, inclinado, girando despacio.
    const abre = tramo(p, 0.2, 0.4);      // se marcan las 55 porciones
    const sale = tramo(p, 0.42, 0.6);     // una porción se eleva
    const frente = tramo(p, 0.6, 0.7);  // la porción queda sola, de frente
    const late = tramo(p, 0.82, 0.88);     // sube y baja con el oro
    const forma = tramo(p, 0.64, 0.78);   // la porción se vuelve el símbolo

    soporte.rotation.x = -1.05 + abre * 0.55 - frente * 0.2;
    soporte.rotation.y = Math.sin(t * 0.35) * 0.18 * (1 - sale);
    disco.rotation.z = Math.PI / 2 - piezas[0].userData.medio + (1 - abre) * t * 0.12;
    soporte.position.y = 0.3 - frente * 3.1;
    soporte.scale.setScalar(1 - frente * 0.3);
    // Hasta que se marcan, es una sola moneda; después, las 55 piezas.
    soporte.visible = frente < 0.98;
    const marcado = abre > 0.02;
    moneda.visible = !marcado;
    for (let i = 0; i < N; i++) piezas[i].visible = marcado;

    for (let i = 0; i < N; i++) {
      const m = piezas[i], a = m.userData.medio;
      const sep = abre * 0.05;
      m.position.set(Math.cos(a) * sep, Math.sin(a) * sep, 0);
    }
    // La elegida: sale del disco, gira hacia la cámara y flota.
    const uno = piezas[0], am = uno.userData.medio;
    const fuera = sale * 0.55 + frente * 2.6;
    uno.position.x += Math.cos(am) * fuera;
    uno.position.y += Math.sin(am) * fuera;
    uno.position.z = sale * 0.5 + frente * 0.9;
    uno.scale.setScalar(1 + frente * 0.8);
    uno.rotation.x = 0;
    oro.color.copy(BASE).multiplyScalar(1 - sale * 0.55);
    oro.opacity = 1 - frente * 0.85;
    oroUno.emissive.setRGB(0.1 * sale, 0.06 * sale, 0.01 * sale);
    oroUno.transparent = forma > 0; oroUno.opacity = 1 - forma;
    uno.visible = forma < 0.99;

    // El símbolo: gira desde el perfil hasta quedar de frente, y las 55
    // marcas se dibujan una por una alrededor.
    simbolo.visible = forma > 0.001;
    oroSimbolo.opacity = forma;
    simbolo.scale.setScalar(0.6 + forma * 0.4);
    simbolo.rotation.y = (1 - forma) * -1.4 + Math.sin(t * 0.5) * 0.12 * forma;
    const cuantas = Math.floor(lim((p - 0.66) / 0.14) * N);
    for (let i = 0; i < N; i++) marcas[i].visible = i < cuantas;
    // Sube y baja: una onda lenta, como el precio en el tráiler.
    const ola = late * Math.sin(t * 1.3) * 0.22;
    uno.position.z += ola * 0.2;
    soporte.position.y += ola * frente;
    simbolo.position.y = 0.32 + ola * 0.9;

    // Las frases.
    let k = 0; for (let i = 0; i < PASOS.length - 1; i++) if (p >= PASOS[i]) k = i;
    frases.forEach((f, i) => f.classList.toggle('aqui', i === k));
    escena3.style.setProperty('--sube', ola.toFixed(3));

    render.render(escena, camara);
    requestAnimationFrame(cuadro);
  }

  medir();
  // El lienzo se mide a sí mismo: en el teléfono la barra del navegador
  // cambia el alto sin avisar con un resize.
  new ResizeObserver(medir).observe(lienzo);
  new IntersectionObserver((es) => {
    const v = es.some((e) => e.isIntersecting);
    if (v && !visible) { visible = true; requestAnimationFrame(cuadro); }
    visible = v;
  }).observe(sec);
  sec.classList.add('vivo3d');
}
