export const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){
  float a=0.0;float w=0.5;
  for(int i=0;i<4;i++){a+=w*snoise(p);p*=2.15;w*=0.5;}
  return a;
}
`

/* LA ATMÓSFERA, AHORA CON SOL.
 *
 * Antes era un halo parejo alrededor de toda la esfera: bonito, y falso. Un
 * planeta con aire no brilla igual por todos lados — brilla DONDE LE DA EL
 * SOL, y en la línea donde el día se acaba se pone naranja. Eso es lo que el
 * ojo reconoce sin poder nombrarlo, y es la diferencia entre una bola con
 * aura y un mundo.
 *
 * Aquí el sol no necesita uniforme: AU-RA está en el origen, así que la
 * dirección de la luz en cualquier punto del mundo es sencillamente
 * normalize(-posición). Sale gratis.
 *
 * Lo que se calcula:
 *  · EL DÍA. Cuánto sol recibe este trozo de aire. La transición no es dura:
 *    la atmósfera dispersa luz hacia la sombra, y por eso el terminador de un
 *    planeta de verdad es suave y no un filo.
 *  · EL ATARDECER. Donde el sol RASPA de canto, la luz atraviesa muchísimo
 *    más aire, se le come el azul y queda el naranja. Es el anillo cálido que
 *    tiene cualquier foto de la Tierra desde órbita.
 *  · LA CONTRALUZ. Con el sol detrás del planeta, el aire del borde se
 *    enciende de golpe: es dispersión hacia adelante, y es el plano más
 *    espectacular que da un planeta.
 */
export function atmosphereFragment(extra = '') {
  return /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uDensity;
uniform float uBoost;
/* Cuánto se ve esta atmósfera. Durante un plano de casa, las de las demás se
   apagan: el halo es lo más visible de un mundo y sin bajarlo el cuadro sigue
   lleno de coronas de colores compitiendo con la que se presenta. */
uniform float uAtenua;
varying vec3 vN;
varying vec3 vW;
${SNOISE}
void main(){
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  // el sol vive en el origen del mundo: la luz sale de ahí
  vec3 L = normalize(-vW);

  float d = dot(V, N);
  float fr = pow(clamp(0.68 + d, 0.0, 1.0), 3.0);
  float n = fbm(normalize(vW) * 2.4 + vec3(0.0, uTime * 0.05, uTime * 0.02)) * 0.5 + 0.5;

  float sol = dot(N, L);
  /* El terminador suave: el aire lleva luz un poco más allá de donde el
     suelo ya está a oscuras. Sin esto, el halo se corta en seco. */
  float dia = smoothstep(-0.42, 0.30, sol);
  /* El atardecer: donde el sol raspa de canto, el rojo gana. */
  float rasante = pow(1.0 - abs(sol), 7.0) * smoothstep(-0.55, 0.15, sol);
  /* La contraluz: el sol detrás, y el borde arde. */
  float contra = pow(clamp(dot(V, -L), 0.0, 1.0), 5.0);

  vec3 calido = mix(uColor, vec3(1.0, 0.46, 0.20), 0.8);
  vec3 col = mix(uColor, calido, clamp(rasante * 1.1, 0.0, 1.0));
  col *= 1.0 + uBoost * 1.3 + contra * 1.5;

  float alpha = fr * (0.5 + n * 0.55) * uDensity
              * (0.06 + 0.94 * dia)               // la noche conserva un hilo
              * (1.0 + uBoost * 1.7 + contra * 1.2)
              + rasante * fr * uDensity * 0.55;   // el anillo del atardecer suma
  ${extra}
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * uAtenua);
}
`
}

export function atmosphereVertex() {
  return /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
}

export function dustVertex() {
  return /* glsl */ `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uPixelRatio;
varying float vTw;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.05 + aSeed * 17.0) * 0.6;
  p.y += cos(uTime * 0.04 + aSeed * 23.0) * 0.35;
  p.z += sin(uTime * 0.06 + aSeed * 29.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPixelRatio * (46.0 / max(1.0, -mv.z));
  vTw = 0.55 + 0.45 * sin(uTime * (0.4 + aSeed) + aSeed * 40.0);
  gl_Position = projectionMatrix * mv;
}
`
}

export function dustFragment() {
  return /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vTw;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float a = smoothstep(0.25, 0.0, r2) * vTw * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`
}

/* ── LAS SOMBRAS DE UN MUNDO CON ANILLOS ─────────────────────────────────────
 *
 * Es el detalle que separa un planeta con un aro pegado de Saturno. Son dos
 * sombras, y las dos se calculan sin motor de sombras —que costaría un mapa
 * por planeta— porque en este sistema el sol está en el ORIGEN y eso hace
 * toda la geometría trivial:
 *
 *  · EL ANILLO SE PROYECTA SOBRE EL PLANETA. Desde cada punto de la
 *    superficie se sale hacia el sol; si ese rayo cruza el plano del anillo
 *    entre sus dos radios, ese punto está a la sombra. Es la banda oscura que
 *    cruza el hemisferio de verano.
 *  · EL PLANETA SE PROYECTA SOBRE EL ANILLO. Desde cada punto del anillo se
 *    sale hacia el sol; si la esfera del planeta se cruza en el camino, ese
 *    trozo de anillo está eclipsado. Es la mordida oscura que el aro tiene
 *    siempre del lado contrario al sol.
 *
 * Se inyectan en materiales estándar con onBeforeCompile: así conservan toda
 * la iluminación buena de three y solo se les añade la sombra. */
export const SOMBRA_ANILLO = /* glsl */ `
  /* ¿Está este punto del mundo a la sombra del anillo? El anillo vive en el
     plano de normal uAnilloN que pasa por el centro del planeta. */
  float sombraDeAnillo(vec3 punto, vec3 centro, vec3 haciaSol,
                       vec3 anilloN, float rInt, float rExt) {
    float den = dot(haciaSol, anilloN);
    if (abs(den) < 1e-4) return 1.0;
    float t = dot(centro - punto, anilloN) / den;
    if (t <= 0.0) return 1.0;              // el anillo quedó detrás del sol
    vec3 cruce = punto + haciaSol * t - centro;
    float r = length(cruce);
    /* Los bordes del anillo no son filos: el polvo se va acabando, y la
       sombra con él. */
    float dentro = smoothstep(rInt, rInt * 1.06, r) * (1.0 - smoothstep(rExt * 0.94, rExt, r));
    return 1.0 - dentro * 0.82;
  }
`

export const SOMBRA_PLANETA = /* glsl */ `
  /* ¿Está este punto del anillo dentro de la sombra del planeta? Se prueba si
     la recta hacia el sol pasa a menos de un radio del centro. */
  float sombraDePlaneta(vec3 punto, vec3 centro, vec3 haciaSol, float radio) {
    vec3 aC = centro - punto;
    float t = dot(aC, haciaSol);
    if (t <= 0.0) return 1.0;              // el planeta está del otro lado
    float d = length(aC - haciaSol * t);
    // penumbra: el borde de una sombra de verdad es difuso
    return smoothstep(radio * 0.86, radio * 1.14, d) * 0.86 + 0.14;
  }
`
