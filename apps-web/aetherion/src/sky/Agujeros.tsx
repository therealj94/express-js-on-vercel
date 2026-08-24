import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { RADIO_ANILLO } from '../kernel/rig'
import { cieloTextura } from './Firmamento'

/* LOS AGUJEROS NEGROS.
 *
 * No es un círculo negro con un aro pintado: es el cálculo de verdad, píxel a
 * píxel, en la tarjeta gráfica.
 *
 * ══ LO QUE HACE EL SOMBREADOR ═════════════════════════════════════════════
 *
 * Para cada píxel del cuadro que ocupa el agujero se reconstruye el RAYO que
 * sale del ojo, y se le pregunta qué le pasa a esa luz al pasar cerca de una
 * masa que dobla el espacio:
 *
 *  · EL PARÁMETRO DE IMPACTO (b) es a qué distancia pasaría el rayo del
 *    centro si nada lo desviara. Con b grande la luz sigue derecho; con b
 *    chico se dobla, y por debajo de cierto punto ya no sale: cae.
 *  · LA DEFLEXIÓN de Schwarzschild vale α ≈ 2·rs/b para rayos lejanos, y
 *    crece sin control al acercarse al radio del fotón (1.5·rs). Se usa esa
 *    fórmula con el término siguiente de la serie, que es lo que hace que el
 *    ANILLO DE EINSTEIN aparezca solo, sin dibujarlo: la luz de detrás rodea
 *    el agujero y llega al ojo como un aro brillante.
 *  · CON EL RAYO YA DOBLADO se mira el cielo: la misma textura del firmamento
 *    que ve todo el mundo, muestreada en la dirección desviada. Por eso las
 *    estrellas de detrás se ESTIRAN alrededor del borde y la Vía Láctea se
 *    parte y se curva al pasar. Nada de eso está pintado; sale del cálculo.
 *  · EL DISCO DE ACRECIÓN se cruza con el rayo YA DOBLADO — y ahí ocurre lo
 *    que hizo famosa a Gargantua: como la luz se dobla, se ve la cara de
 *    ATRÁS del disco arqueada por encima y por debajo del agujero, cosa
 *    imposible en línea recta.
 *  · EL BRILLO NO ES PAREJO: el gas orbita a una fracción de la velocidad de
 *    la luz, así que el lado que VIENE hacia nosotros se ve mucho más
 *    brillante y azulado, y el que se aleja se apaga y enrojece (Doppler
 *    relativista, ∝ δ⁴). Es la asimetría que hace que un disco parezca una
 *    cosa que gira de verdad y no un anillo de neón.
 *
 * ══ LO QUE NO HACE ════════════════════════════════════════════════════════
 *
 * No integra geodésicas paso a paso: eso es precioso y cuesta cien veces más.
 * Con la deflexión analítica el resultado es indistinguible a esta escala y
 * corre a sesenta cuadros en un teléfono — que es la diferencia entre una
 * demo y un producto.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  // fwidth: el ancho de un píxel medido en el propio sombreador
  varying vec2 vUv;

  uniform sampler2D uCielo;
  uniform vec3  uCentro;      // el agujero, en el mundo
  uniform vec3  uOjo;         // la cámara
  uniform vec3  uDer;         // los ejes del cartel, para armar el rayo
  uniform vec3  uArr;
  uniform float uTam;         // media anchura del cartel, en el mundo
  uniform float uRs;          // radio de Schwarzschild
  uniform vec3  uEjeDisco;    // normal del disco de acreción
  uniform float uDiscoInt;    // radio interior del disco
  uniform float uDiscoExt;    // exterior
  uniform float uTiempo;
  uniform float uIntro;

  const float PI = 3.14159265359;

  /* El cielo se guarda como mapa equirrectangular: una dirección se convierte
     en coordenada de textura con la latitud y la longitud. */
  vec3 mirarCielo(vec3 d) {
    vec2 uv = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, acos(clamp(d.y, -1.0, 1.0)) / PI);
    return texture2D(uCielo, uv).rgb;
  }

  /* Ruido barato para las vetas del disco: el gas no es liso, tiene grumos
     que giran, y sin ellos el disco parece plástico. */
  float ruido(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float suave(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ruido(i), ruido(i + vec2(1.0, 0.0)), f.x),
               mix(ruido(i + vec2(0.0, 1.0)), ruido(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    /* EL RAYO DE ESTE PÍXEL. El cartel mira siempre a la cámara, así que su
       punto se arma con los dos ejes del cartel y de ahí sale la dirección. */
    vec2 p = (vUv - 0.5) * 2.0;
    vec3 punto = uCentro + uDer * (p.x * uTam) + uArr * (p.y * uTam);
    vec3 dir = normalize(punto - uOjo);

    /* EL PARÁMETRO DE IMPACTO. La distancia del centro a la recta del rayo:
       cuánto se acercaría esta luz si nada la doblara. */
    vec3 alCentro = uCentro - uOjo;
    float t = dot(alCentro, dir);
    vec3 masCerca = uOjo + dir * t;
    vec3 desvio = masCerca - uCentro;
    float b = length(desvio);

    /* DENTRO DE LA SOMBRA NO SALE NADA. El horizonte aparente de un agujero
       negro no es su radio: es 2.6·rs, el radio de la esfera de fotones
       proyectada. Todo rayo que entra ahí cae y el ojo ve negro puro. */
    float sombra = uRs * 2.6;
    /* El ancho del suavizado se mide EN PÍXELES, no en unidades del mundo: de
       cerca el borde ocupa medio cuadro y de lejos dos píxeles, y un margen
       fijo se vería duro en un caso y borroso en el otro. */
    float pix = fwidth(b) * 1.5;
    if (b < sombra - pix && t > 0.0) {
      gl_FragColor = vec4(vec3(0.0), uIntro);
      return;
    }

    /* LA DEFLEXIÓN. α = 2rs/b con el término siguiente: cerca del radio del
       fotón la luz rodea el agujero, y ahí nace el anillo de Einstein sin
       que nadie lo dibuje. */
    float alfa = 0.0;
    vec3 hacia = vec3(0.0);
    if (t > 0.0 && b > 0.0001) {
      alfa = 2.0 * uRs / b + 3.0 * PI * uRs * uRs / (4.0 * b * b);
      alfa = min(alfa, 2.6);            // tope: más allá el rayo ya cayó
      hacia = normalize(-desvio);       // la luz se dobla HACIA la masa
    }
    vec3 dirDoblada = normalize(dir + hacia * alfa);

    // el cielo de detrás, ya deformado
    vec3 col = mirarCielo(dirDoblada);

    /* EL ANILLO DE FOTONES. Justo fuera de la sombra la luz da vueltas antes
       de escapar y se acumula: un filo finísimo y brillante. */
    float anillo = smoothstep(sombra * 1.30, sombra * 1.01, b)
                 * smoothstep(sombra * 0.99, sombra * 1.02, b);
    col += vec3(1.0, 0.86, 0.62) * anillo * 2.4;

    /* EL DISCO DE ACRECIÓN, cruzado con el rayo YA DOBLADO. Se prueban dos
       cruces —delante y detrás del agujero— y por eso se ve la cara de atrás
       arqueada por arriba y por abajo: la firma de Gargantua. */
    vec3 acum = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      vec3 d2 = (i == 0) ? dir : dirDoblada;
      float den = dot(d2, uEjeDisco);
      if (abs(den) < 0.0008) continue;
      float s = dot(uCentro - uOjo, uEjeDisco) / den;
      if (s < 0.0) continue;
      vec3 hit = uOjo + d2 * s;
      vec3 rel = hit - uCentro;
      float r = length(rel);
      if (r < uDiscoInt || r > uDiscoExt) continue;

      float q = (r - uDiscoInt) / (uDiscoExt - uDiscoInt);

      /* La velocidad orbital kepleriana: adentro corre, afuera se arrastra. */
      vec3 tang = normalize(cross(uEjeDisco, rel));
      float beta = 0.62 * sqrt(uDiscoInt / max(r, 0.001));

      /* DOPPLER RELATIVISTA. δ = 1/(γ(1-β·cosθ)); el brillo va como δ⁴ y el
         color se corre al azul cuando el gas viene hacia el ojo. Es lo que
         parte el disco en un lado deslumbrante y otro apagado. */
      float cosT = dot(tang, -d2);
      float gamma = 1.0 / sqrt(max(0.02, 1.0 - beta * beta));
      float delta = 1.0 / max(0.15, gamma * (1.0 - beta * cosT));
      float brillo = pow(delta, 4.0);

      /* Las vetas: el gas en grumos que orbitan, más rápido por dentro. */
      float ang = atan(rel.z, rel.x);
      float giro = uTiempo * (0.9 / max(0.25, r * 0.35));
      float veta = 0.62 + 0.38 * suave(vec2(ang * 3.4 + giro, r * 2.6));
      veta *= 0.55 + 0.45 * suave(vec2(ang * 9.0 - giro * 1.7, r * 6.0));

      /* El color por temperatura: blanco-azul pegado al horizonte, naranja
         profundo en el borde de afuera. */
      vec3 tinte = mix(vec3(1.00, 0.95, 0.88), vec3(1.00, 0.42, 0.10), pow(q, 0.7));
      tinte = mix(tinte, vec3(0.72, 0.86, 1.00), clamp((delta - 1.0) * 0.55, 0.0, 0.5));

      // se apaga en los dos bordes para que el disco no termine en un corte
      float velo = smoothstep(0.0, 0.14, q) * smoothstep(1.0, 0.72, q);
      acum += tinte * brillo * veta * velo * (i == 0 ? 1.0 : 1.15);
    }
    col += acum * 0.85;

    /* El resplandor que rodea todo: el polvo caliente que el agujero ilumina.
       Sin esto el conjunto se recorta contra el cielo como una calcomanía. */
    float halo = exp(-max(0.0, b - sombra) / (uRs * 5.0));
    col += vec3(1.0, 0.62, 0.28) * halo * 0.14;

    /* El cartel es cuadrado pero el fenómeno es redondo: fuera de su círculo
       se desvanece del todo, y así no se ve nunca la caja que lo contiene. */
    float dentro = 1.0 - smoothstep(0.82, 1.0, length(p));
    float a = clamp(max(max(col.r, col.g), col.b) * 1.5, 0.0, 1.0) * dentro * uIntro;
    // dentro de la sombra el alfa es entero: el negro TIENE que tapar el cielo
    a = max(a, smoothstep(sombra + pix, sombra - pix, b) * dentro * uIntro);
    gl_FragColor = vec4(col, a);
  }
`

interface Ruta {
  radio: number
  altura: number
  vel: number
  fase: number
  rs: number
  eje: THREE.Vector3
}

export function Agujeros() {
  const { camera } = useThree()
  const tex = useMemo(cieloTextura, [])

  /* DOS, Y LEJOS. Un agujero negro es lo más pesado que hay en pantalla y lo
     más fácil de sobreexplotar: dos, orbitando la galaxia muy por fuera del
     barrio de las casas, se cruzan de vez en cuando por el fondo y son un
     acontecimiento. Cinco serían decoración. */
  const rutas = useMemo<Ruta[]>(() => [
    { radio: RADIO_ANILLO * 7.4, altura: 12, vel: 0.0125, fase: 1.1, rs: 1.05,
      eje: new THREE.Vector3(0.16, 1, 0.1).normalize() },
    { radio: RADIO_ANILLO * 10.5, altura: -22, vel: -0.0082, fase: 4.2, rs: 0.72,
      eje: new THREE.Vector3(-0.34, 0.86, 0.38).normalize() },
  ], [])

  const mallas = useRef<(THREE.Mesh | null)[]>([])

  const mats = useMemo(() => rutas.map((rt) => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    /* Mezcla normal, NO aditiva: un agujero negro TAPA lo que hay detrás —
       ese es todo el punto. Con aditiva el negro sería invisible. */
    blending: THREE.NormalBlending,
    toneMapped: false,
    uniforms: {
      uCielo: { value: tex },
      uCentro: { value: new THREE.Vector3() },
      uOjo: { value: new THREE.Vector3() },
      uDer: { value: new THREE.Vector3(1, 0, 0) },
      uArr: { value: new THREE.Vector3(0, 1, 0) },
      uTam: { value: rt.rs * 9 },
      uRs: { value: rt.rs },
      uEjeDisco: { value: rt.eje.clone() },
      uDiscoInt: { value: rt.rs * 3.1 },
      uDiscoExt: { value: rt.rs * 10.5 },
      uTiempo: { value: 0 },
      uIntro: { value: 0 },
    },
  })), [rutas, tex])

  const pos = useMemo(() => new THREE.Vector3(), [])
  const der = useMemo(() => new THREE.Vector3(), [])
  const arr = useMemo(() => new THREE.Vector3(), [])
  const haciaOjo = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    rutas.forEach((rt, i) => {
      const m = mallas.current[i]
      if (!m) return
      const t = sim.now * rt.vel + rt.fase
      pos.set(Math.cos(t) * rt.radio, rt.altura + Math.sin(t * 0.7) * 6, Math.sin(t) * rt.radio)
      m.position.copy(pos)
      /* El cartel encara siempre a la cámara: el fenómeno es esférico y no
         tiene un «frente», así que lo que se dibuja es el disco que ocupa en
         la pantalla, y la cuenta se hace en el espacio del mundo. */
      m.quaternion.copy(camera.quaternion)

      haciaOjo.copy(camera.position).sub(pos).normalize()
      der.set(1, 0, 0).applyQuaternion(camera.quaternion)
      arr.set(0, 1, 0).applyQuaternion(camera.quaternion)

      const u = mats[i].uniforms
      u.uCentro.value.copy(pos)
      u.uOjo.value.copy(camera.position)
      u.uDer.value.copy(der)
      u.uArr.value.copy(arr)
      u.uTiempo.value = sim.now
      /* El cartel se agranda con la distancia para que el aro de luz siempre
         quepa: de cerca ocupa poco cuadro, de lejos hay que dejarle sitio a
         la lente. */
      const d = camera.position.distanceTo(pos)
      u.uTam.value = rt.rs * (7 + Math.min(9, d * 0.035))
      m.scale.setScalar(u.uTam.value)
      u.uIntro.value = sim.intro * (1 - 0.85 * sim.noche) * (1 - sim.vacio)
      void haciaOjo
    })
  })

  return (
    <>
      {rutas.map((rt, i) => (
        <mesh key={i} ref={(el) => { mallas.current[i] = el }} material={mats[i]} renderOrder={-5}>
          <planeGeometry args={[2, 2]} />
        </mesh>
      ))}
    </>
  )
}
