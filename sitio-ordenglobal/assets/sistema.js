/* EL SISTEMA · siete mundos, una estrella y una galaxia que gira de verdad
 *
 * ── QUÉ SUSTITUYE Y POR QUÉ ─────────────────────────────────────────────────
 *
 * Hasta aquí la portada dibujaba las casas con `constelacion.js`: siete
 * círculos con un degradado radial, estampados en un lienzo 2D. Era honesto y
 * costaba doce kilobytes, pero un degradado no es una esfera. No hay relieve,
 * no hay terminador, no hay atmósfera, y las siete daban la vuelta EN EL MISMO
 * TIEMPO —la de dentro y la de fuera—, que es la cosa que más delata a un
 * dibujo: en el cielo de verdad, cuanto más lejos, más despacio.
 *
 * Esto son mundos. Superficie generada en la tarjeta gráfica —continentes,
 * océanos, bandas, hielo, cráteres, vetas—, relieve sacado de la derivada del
 * propio terreno, una sola luz que viene del sol y que deja un terminador
 * suave y rojizo donde el día se acaba, atmósferas que se encienden por el
 * borde, luces de ciudad en el lado de noche y órbitas keplerianas: elipses
 * con su excentricidad y su inclinación, y periodos que salen de la tercera
 * ley de Kepler. La de fuera tarda cuatro veces más que la de dentro porque
 * así es como se mueve un sistema.
 *
 * ── POR QUÉ WEBGL A PELO Y NO THREE.JS ──────────────────────────────────────
 *
 * El argumento del archivo viejo sigue en pie y por eso no se rompe: quien
 * llega con datos móviles en Tegucigalpa no puede pagar novecientos kilobytes
 * de motor 3D ANTES de saber qué vendemos. Lo que cambió no es el precio que
 * se puede pagar, es lo que se compra con él. Aquí no hay dependencia: son
 * shaders escritos para esto, y lo que pesa —el ruido que hace las
 * superficies— corre en la tarjeta y no viaja por la red. Un archivo, sin
 * texturas que descargar, sin modelos: las superficies no existen hasta que la
 * GPU las calcula.
 *
 * ── SI NO HAY WEBGL, NO PASA NADA ───────────────────────────────────────────
 *
 * `arrancar()` devuelve false y `constelacion.js` —que sigue en su sitio, sin
 * tocar— se hace cargo con el dibujo plano de siempre. Lo mismo si el
 * navegador pierde el contexto a media sesión. El contrato con el documento es
 * exactamente el mismo: los rótulos son botones de verdad, las fichas se abren
 * igual, el teclado y el lector de pantalla no se enteran de que debajo cambió
 * el motor. Un planeta que no se puede tocar con el teclado es una decoración,
 * no un menú — eso no se negocia por bonito que quede.
 */
window.SISTEMA = (function () {
  'use strict';

  var QUIETO = matchMedia('(prefers-reduced-motion: reduce)');
  var BOLSILLO = matchMedia('(pointer: coarse)').matches;

  /* ── LAS SIETE CASAS, COMO MUNDOS ─────────────────────────────────────────
   *
   * El color de cada una es el del mapa que ya usan la app y la billetera: la
   * gente reconoce por SITIO y por COLOR antes que por el nombre, y cambiarlo
   * aquí sería romper esa memoria. Lo que se añade es de qué está hecho cada
   * mundo, y no es decorado: sale de lo que hace la casa.
   *
   *   a     semieje mayor de la órbita (la distancia media al sol)
   *   e     excentricidad: cuánto se aparta la elipse del círculo
   *   inc   inclinación del plano de la órbita, en grados
   *   nodo  dónde cruza el plano de referencia (longitud del nodo ascendente)
   *   peri  hacia dónde apunta el punto más cercano al sol
   *   M0    por dónde va al arrancar el reloj, para que no salgan en fila
   *   tilt  inclinación del eje: por qué tiene estaciones y polos visibles
   *   dia   lo que tarda en dar una vuelta sobre sí mismo, en segundos
   */
  var CASAS = [
    { id: 'wallet',  tipo: 0, a: 0.60, e: 0.031, inc:  1.4, nodo:  12, peri:  40, M0: 0.15,
      radio: 0.211, tilt: 11, dia: 44, anillo: false,
      col: [0.46, 0.35, 0.18], col2: [0.97, 0.88, 0.63], atmo: [0.92, 0.80, 0.48], atmoInt: 0.35 },
    { id: 'chat',    tipo: 1, a: 0.755, e: 0.019, inc:  3.2, nodo: 141, peri: 110, M0: 2.40,
      radio: 0.170, tilt: 24, dia: 35, anillo: false,
      col: [0.52, 0.24, 0.18], col2: [0.98, 0.79, 0.68], atmo: [0.96, 0.55, 0.42], atmoInt: 0.60 },
    { id: 'gid',     tipo: 2, a: 0.935, e: 0.013, inc:  0.8, nodo:  75, peri: 200, M0: 4.10,
      radio: 0.185, tilt: 23.4, dia: 28, anillo: false,
      col: [0.07, 0.31, 0.30], col2: [0.42, 0.66, 0.44], atmo: [0.33, 0.78, 0.70], atmoInt: 0.85 },
    { id: 'pay',     tipo: 3, a: 1.135, e: 0.046, inc:  2.2, nodo: 210, peri: 300, M0: 1.05,
      radio: 0.162, tilt: 15, dia: 24, anillo: false,
      col: [0.30, 0.56, 0.80], col2: [0.91, 0.97, 1.00], atmo: [0.37, 0.78, 0.94], atmoInt: 0.55 },
    { id: 'scan',    tipo: 4, a: 1.345, e: 0.023, inc:  4.1, nodo:  30, peri:  15, M0: 5.30,
      radio: 0.152, tilt:  8, dia: 19, anillo: false,
      col: [0.09, 0.36, 0.33], col2: [0.80, 0.99, 0.92], atmo: [0.45, 0.92, 0.79], atmoInt: 0.40 },
    { id: 'ordenex', tipo: 5, a: 1.575, e: 0.039, inc:  1.9, nodo: 265, peri: 250, M0: 3.25,
      radio: 0.277, tilt: 27, dia: 13, anillo: true,
      col: [0.26, 0.21, 0.43], col2: [0.82, 0.78, 0.96], atmo: [0.66, 0.60, 0.90], atmoInt: 0.50 },
    { id: 'aucorp',  tipo: 6, a: 1.83, e: 0.027, inc:  2.6, nodo: 160, peri:  80, M0: 0.70,
      radio: 0.158, tilt: 19, dia: 31, anillo: false,
      col: [0.30, 0.24, 0.15], col2: [0.84, 0.75, 0.56], atmo: [0.78, 0.69, 0.50], atmoInt: 0.18 }
  ];

  /* La vuelta de la casa más cercana, en segundos. Todas las demás salen de
     aquí por la tercera ley de Kepler (T ∝ a^1,5), que es la razón de que la
     de fuera tarde unas cuatro veces más. No es un número de diseño: es la
     ley, y es justamente lo que hace que el sistema se lea como un sistema. */
  var VUELTA_BASE = 104;
  var RADIO_SOL = 0.255;

  // ── matemática mínima: solo lo que se usa ──────────────────────────────────

  function mat4() { return new Float32Array(16); }

  function perspectiva(fovY, aspecto, cerca, lejos, despX, despY) {
    var f = 1 / Math.tan(fovY / 2), m = mat4();
    m[0] = f / aspecto; m[5] = f;
    /* El desplazamiento de lente: corre la imagen sin torcer la perspectiva ni
       mover la cámara. Es lo que deja al planeta abierto a un tercio de la
       pantalla con la ficha al lado, en vez de tapado por ella. */
    m[8] = despX || 0; m[9] = despY || 0;
    m[10] = (lejos + cerca) / (cerca - lejos); m[11] = -1;
    m[14] = (2 * lejos * cerca) / (cerca - lejos);
    return m;
  }

  function mirar(ojo, centro, arriba) {
    var zx = ojo[0] - centro[0], zy = ojo[1] - centro[1], zz = ojo[2] - centro[2];
    var l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    var xx = arriba[1] * zz - arriba[2] * zy,
        xy = arriba[2] * zx - arriba[0] * zz,
        xz = arriba[0] * zy - arriba[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    var m = mat4();
    m[0] = xx; m[1] = yx; m[2] = zx;
    m[4] = xy; m[5] = yy; m[6] = zy;
    m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx * ojo[0] + xy * ojo[1] + xz * ojo[2]);
    m[13] = -(yx * ojo[0] + yy * ojo[1] + yz * ojo[2]);
    m[14] = -(zx * ojo[0] + zy * ojo[1] + zz * ojo[2]);
    m[15] = 1;
    return m;
  }

  function multiplicar(a, b) {
    var m = mat4();
    for (var c = 0; c < 4; c++) {
      for (var f = 0; f < 4; f++) {
        m[c * 4 + f] = a[f] * b[c * 4] + a[4 + f] * b[c * 4 + 1] +
                       a[8 + f] * b[c * 4 + 2] + a[12 + f] * b[c * 4 + 3];
      }
    }
    return m;
  }

  /* La orientación de un planeta: primero se inclina el eje, luego gira sobre
     él. En ese orden, y no al revés — al revés el eje bailaría con el día. */
  function giroPlaneta(tilt, giro) {
    var ct = Math.cos(tilt), st = Math.sin(tilt);
    var cg = Math.cos(giro), sg = Math.sin(giro);
    // Rz(tilt) · Ry(giro), en columna mayor y 3×3.
    return new Float32Array([
       ct * cg,  st * cg, -sg,
      -st,       ct,       0,
       ct * sg,  st * sg,  cg
    ]);
  }

  // ── geometría: una esfera de verdad, subdividida desde un icosaedro ────────

  /* Un icosaedro subdividido reparte los triángulos por igual. Una esfera de
     latitud y longitud los amontona en los polos, y ahí es justo donde se ve
     el hielo. */
  function icosfera(niveles) {
    var t = (1 + Math.sqrt(5)) / 2;
    var v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
             [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
             [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    var caras = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
                 [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                 [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
                 [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    v = v.map(function (p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
    var cache = {};
    function medio(a, b) {
      var k = a < b ? a + '_' + b : b + '_' + a;
      if (cache[k] !== undefined) return cache[k];
      var p = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2];
      var l = Math.hypot(p[0], p[1], p[2]);
      v.push([p[0] / l, p[1] / l, p[2] / l]);
      return (cache[k] = v.length - 1);
    }
    for (var n = 0; n < niveles; n++) {
      var sig = [];
      for (var i = 0; i < caras.length; i++) {
        var c = caras[i], a = medio(c[0], c[1]), b = medio(c[1], c[2]), d = medio(c[2], c[0]);
        sig.push([c[0], a, d], [c[1], b, a], [c[2], d, b], [a, b, d]);
      }
      caras = sig;
    }
    var pos = new Float32Array(v.length * 3);
    for (var j = 0; j < v.length; j++) { pos[j * 3] = v[j][0]; pos[j * 3 + 1] = v[j][1]; pos[j * 3 + 2] = v[j][2]; }
    var idx = new Uint16Array(caras.length * 3);
    for (var k = 0; k < caras.length; k++) { idx[k * 3] = caras[k][0]; idx[k * 3 + 1] = caras[k][1]; idx[k * 3 + 2] = caras[k][2]; }
    return { pos: pos, idx: idx, n: idx.length };
  }

  // ── la órbita: Kepler, no un círculo ───────────────────────────────────────

  /* La ecuación de Kepler (M = E − e·sen E) no se despeja: se resuelve. Tres
     pasos de Newton bastan de sobra con excentricidades tan pequeñas como
     estas, y es lo que hace que el planeta corra un poco más cerca del sol y
     se arrastre en el punto lejano. Sin esto la elipse es un decorado; con
     esto, es una órbita. */
  function excentrica(e, M) {
    var E = M + e * Math.sin(M);
    for (var i = 0; i < 3; i++) {
      E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    return E;
  }

  function prepararCasa(casa) {
    var g = Math.PI / 180;
    casa.T = VUELTA_BASE * Math.pow(casa.a / CASAS[0].a, 1.5);
    casa.inc_ = casa.inc * g; casa.nodo_ = casa.nodo * g; casa.peri_ = casa.peri * g;
    casa.tilt_ = casa.tilt * g;
    casa.b = casa.a * Math.sqrt(1 - casa.e * casa.e);
    // La base del plano de la órbita, calculada una vez y no en cada cuadro.
    var cn = Math.cos(casa.nodo_), sn = Math.sin(casa.nodo_);
    var ci = Math.cos(casa.inc_), si = Math.sin(casa.inc_);
    var cw = Math.cos(casa.peri_), sw = Math.sin(casa.peri_);
    // eje hacia el periastro
    casa.eP = [cn * cw - sn * sw * ci, sw * si, sn * cw + cn * sw * ci];
    // eje perpendicular dentro del plano
    casa.eQ = [-cn * sw - sn * cw * ci, cw * si, -sn * sw + cn * cw * ci];
    return casa;
  }

  /* Dónde está la casa en el instante t. Devuelve también la fase 0–1 dentro
     de la vuelta, que es lo que la órbita usa para dibujar la estela detrás. */
  function sitio(casa, t, fuera) {
    var M = casa.M0 + (t / casa.T) * Math.PI * 2;
    var E = excentrica(casa.e, M);
    var x = casa.a * (Math.cos(E) - casa.e);
    var y = casa.b * Math.sin(E);
    fuera[0] = casa.eP[0] * x + casa.eQ[0] * y;
    fuera[1] = casa.eP[1] * x + casa.eQ[1] * y;
    fuera[2] = casa.eP[2] * x + casa.eQ[2] * y;
    fuera[3] = (E / (Math.PI * 2)) % 1;
    if (fuera[3] < 0) fuera[3] += 1;
    return fuera;
  }

  // ══ SHADERS ═══════════════════════════════════════════════════════════════

  var CAB = '#version 300 es\nprecision highp float;\n';

  /* El ruido simplex de Gustavson y Ashima, que es el que usa medio mundo
     porque no tiene los artefactos alineados del ruido de rejilla. De aquí
     sale TODO lo que se ve en las superficies: no hay una sola textura
     descargada en toda la escena. */
  var RUIDO = [
    'vec3 m289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 m289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 perm(vec4 x){return m289(((x*34.0)+1.0)*x);}',
    'vec4 tisr(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float ruido(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;',
    '  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;',
    '  i=m289(i);',
    '  vec4 p=perm(perm(perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 nr=tisr(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    '  p0*=nr.x;p1*=nr.y;p2*=nr.z;p3*=nr.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}',
    'float fbm(vec3 p,int oct){float s=0.0,a=0.5,f=1.0;',
    '  for(int i=0;i<7;i++){ if(i>=oct)break; s+=a*ruido(p*f); f*=2.03; a*=0.5; } return s;}',
    /* El ruido «de cresta» es el mismo ruido doblado por el valor absoluto:
       donde el simplex cruza el cero, este hace un filo. De ahí salen las
       cordilleras, las vetas de oro y las fisuras del hielo. */
    'float cresta(vec3 p,int oct){float s=0.0,a=0.5,f=1.0;',
    '  for(int i=0;i<7;i++){ if(i>=oct)break; float n=1.0-abs(ruido(p*f)); n*=n; s+=a*n; f*=2.07; a*=0.5; } return s;}'
  ].join('\n');

  var PLANETA_VS = CAB + [
    'in vec3 aPos;',
    'uniform mat4 uVP; uniform mat3 uRot; uniform vec3 uCentro; uniform float uRadio;',
    'out vec3 vObj; out vec3 vMundo; out vec3 vNor;',
    'void main(){',
    '  vObj = aPos;',                       // el punto en la esfera unidad, gira con el planeta
    '  vec3 n = uRot * aPos;',
    '  vNor = n;',
    '  vMundo = uCentro + n * uRadio;',
    '  gl_Position = uVP * vec4(vMundo,1.0);',
    '}'
  ].join('\n');

  var PLANETA_FS = CAB + RUIDO + '\n' + [
    'in vec3 vObj; in vec3 vMundo; in vec3 vNor;',
    'uniform vec3 uSol; uniform vec3 uOjo;',
    'uniform vec3 uCol; uniform vec3 uCol2; uniform vec3 uAtmo;',
    'uniform float uAtmoInt; uniform float uT; uniform float uApag;',
    'uniform int uTipo; uniform int uOct; uniform int uRelieve;',
    'out vec4 salida;',

    /* La altura del terreno en un punto de la esfera. Es la misma función que
       usa el color y la que usa el relieve, así que la montaña que se ve
       sombreada es exactamente la montaña que está pintada. */
    'float altura(vec3 p){',
    '  if(uTipo==0) return fbm(p*1.45,min(uOct,4))*0.72 + cresta(p*2.3,3)*0.30;',
    '  if(uTipo==1) return fbm(vec3(p.x,p.y*1.7,p.z)*1.7,min(uOct,4))*0.80;',
    '  if(uTipo==2) return fbm(p*1.15,min(uOct,4))*0.82 + fbm(p*2.9+7.0,3)*0.15;',
    '  if(uTipo==3) return fbm(p*1.7,min(uOct,4))*0.60 + cresta(p*3.1+3.0,3)*0.22;',
    '  if(uTipo==4) return fbm(p*1.9,min(uOct,4))*0.62;',
    '  if(uTipo==5) return fbm(vec3(p.x*2.2,p.y*7.0,p.z*2.2),min(uOct,5))*0.3;',
    '  return fbm(p*1.8,min(uOct,4))*0.58 + cresta(p*2.6+5.0,3)*0.30;',
    '}',

    'void main(){',
    '  vec3 p = vObj;',
    '  float lat = abs(p.y);',
    '  float h = altura(p);',
    '  vec3 alb; float agua = 0.0; float brillo = 0.05; vec3 emi = vec3(0.0); float fuerza = 0.05;',

    /* ── 0 · EL MUNDO DE LA VETA (Veta Wallet) ────────────────────────────
       Roca desnuda con filones de oro que siguen las crestas del terreno. De
       día es piedra; de noche los filones siguen brillando, que es de donde
       viene el nombre de la casa. */
    '  if(uTipo==0){',
    '    alb = mix(uCol, uCol2*0.80, smoothstep(-0.32,0.50,h));',
    /* Los filones siguen las crestas del terreno y son POCOS y LARGOS. Con la
       frecuencia alta que tenían salían diez mil chispas repartidas por igual,
       que es lo que hace una lija, no una mina. */
    '    float vet = pow(clamp(cresta(p*2.9+11.0,3)-0.62,0.0,1.0)*3.1,1.25);',
    '    vet = clamp(vet,0.0,1.0);',
    '    alb = mix(alb, vec3(1.0,0.82,0.44), vet*0.9);',
    '    emi = vec3(1.0,0.70,0.26)*vet*1.45;',
    '    brillo = 0.11; fuerza = 0.085;',

    /* ── 1 · EL MUNDO CÁLIDO (PULSE2CHAT) ─────────────────────────────────
       Cielo cargado y auroras latiendo en los dos polos. El latido es lento y
       no sincronizado entre hemisferios: dos relojes, como en la Tierra. */
    '  } else if(uTipo==1){',
    '    alb = mix(uCol*1.35, uCol2, smoothstep(-0.50,0.55,h));',
    '    float nub = smoothstep(0.05,0.75,fbm(vec3(p.x*2.2,p.y*3.4,p.z*2.2)+vec3(uT*0.012,0.0,0.0),4)+0.30);',
    '    alb = mix(alb, vec3(0.98,0.92,0.88), nub*0.55);',
    /* La aurora vive en el casquete polar y SOLO se ve de noche, como la de
       verdad. Antes empezaba a media latitud y con tanta fuerza que dejaba un
       manchón verde en pleno día: un planeta con un moratón. */
    '    float pol = smoothstep(0.76,0.97,lat);',
    '    float aur = pol * (0.40+0.60*sin(uT*0.55 + p.x*7.0 + p.z*5.0));',
    '    emi = vec3(0.34,0.92,0.68)*max(aur,0.0)*0.42;',
    '    brillo = 0.10; fuerza = 0.030;',

    /* ── 2 · EL MUNDO VIVO (Genesis ID) ───────────────────────────────────
       El único con océanos, y por eso el único con especular fuerte: el sol se
       refleja en el agua y no en la tierra. Las luces de ciudad no se reparten
       por igual — se agrupan en la costa, que es donde vive la gente. */
    '  } else if(uTipo==2){',
    '    float mar = smoothstep(0.045,0.125,h);',
    '    float alt = max(h-0.045,0.0);',
    '    vec3 seco = vec3(0.50,0.43,0.25);',
    '    vec3 tierra = mix(uCol2, seco, smoothstep(0.0,0.4,fbm(p*3.4+21.0,3)*0.5+0.5)*smoothstep(0.08,0.55,lat));',
    '    float nieve = clamp(smoothstep(0.72,0.90,lat) + smoothstep(0.20,0.40,alt),0.0,1.0);',
    '    tierra = mix(tierra, vec3(0.93,0.96,0.98), nieve);',
    '    vec3 mar_c = mix(vec3(0.012,0.070,0.140), uCol*1.9, smoothstep(-0.35,0.045,h));',
    '    alb = mix(mar_c, tierra, mar);',
    '    agua = 1.0-mar; brillo = mix(0.85,0.05,mar); fuerza = 0.055*mar;',
    /* Las luces se agrupan en una franja de costa y en grumos, porque la
       gente vive donde el río llega al mar y no repartida por el mapa. */
    '    float ciu = smoothstep(0.05,0.115,h)*smoothstep(0.30,0.14,h);',
    '    ciu *= smoothstep(0.52,0.80, fbm(p*4.6+33.0,3)*0.5+0.5);',
    '    ciu *= smoothstep(0.78,0.40,lat);',
    '    emi = vec3(1.0,0.80,0.48)*ciu*1.15;',

    /* ── 3 · EL MUNDO HELADO (MyTokenPay) ─────────────────────────────────
       Hielo con fisuras que dejan ver lo que corre por debajo. Mucha luz
       rebotada: la nieve es lo más blanco que hay en un sistema solar. */
    '  } else if(uTipo==3){',
    '    alb = mix(vec3(0.66,0.79,0.90), vec3(0.96,0.98,1.0), smoothstep(-0.35,0.45,h));',
    '    float fis = pow(clamp(cresta(p*6.0+3.0,4)-0.63,0.0,1.0)*2.8,1.3);',
    '    alb = mix(alb, uCol*0.75, clamp(fis*0.7,0.0,1.0));',
    '    emi = uCol*fis*1.0;',
    '    brillo = 0.55; fuerza = 0.05;',

    /* ── 4 · EL MUNDO DE CRISTAL (OrdenScan) ──────────────────────────────
       Facetas: la altura se escalona en siete pisos en vez de variar suave, y
       cada escalón coge la luz de otra manera. Es lo que se busca de una casa
       que se llama «explorador»: una superficie que devuelve lo que le entra. */
    '  } else if(uTipo==4){',
    '    float f = h*2.4;',
    '    float fac = floor(f*4.0)/4.0;',
    '    alb = mix(uCol, uCol2, clamp(fac*0.6+0.50,0.0,1.0));',
    '    emi = uAtmo*0.12*smoothstep(0.70,0.99,fract(f*4.0));',
    '    brillo = 0.88; fuerza = 0.11;',

    /* ── 5 · EL GIGANTE GASEOSO (Ordenex) ─────────────────────────────────
       No tiene suelo: son bandas de nube a distintas velocidades, deformadas
       por turbulencia, y una tormenta ovalada que lleva ahí más de lo que
       nadie lleva mirándola. Y un sistema de anillos, que se dibuja aparte. */
    '  } else if(uTipo==5){',
    '    float w = fbm(p*2.7+vec3(uT*0.010,0.0,uT*0.006),4)*0.34;',
    '    float y = p.y + w;',
    '    float ban = sin(y*12.0)*0.5+0.5;',
    '    float det = fbm(vec3(p.x*3.2,y*10.0,p.z*3.2),uOct)*0.35;',
    '    alb = mix(uCol, uCol2, clamp(ban+det,0.0,1.0));',
    '    vec3 cen = normalize(vec3(0.58,-0.30,0.76));',
    '    float d = length((p-cen)*vec3(1.0,2.5,1.0));',
    '    float tor = smoothstep(0.40,0.08,d);',
    '    alb = mix(alb, vec3(0.88,0.60,0.52), tor*0.85);',
    '    brillo = 0.05; fuerza = 0.012;',

    /* ── 6 · EL MUNDO DE BRONCE (AuCorp) ──────────────────────────────────
       Cráteres y regolito, sin aire. El más viejo del sistema a la vista: una
       superficie que lleva golpes y no los ha tapado nadie. */
    '  } else {',
    '    alb = mix(uCol, uCol2, clamp(h*0.95+0.5,0.0,1.0));',
    '    float cr = smoothstep(0.58,0.97,cresta(p*2.4+5.0,3));',
    '    alb = mix(alb, uCol2*0.95, cr*0.45);',
    '    brillo = 0.03; fuerza = 0.10;',
    '  }',

    // ── la luz ──────────────────────────────────────────────────────────────
    '  vec3 n0 = normalize(vNor);',
    '  vec3 N = n0;',
    '  if(uRelieve==1){',
    '    vec3 t = normalize(cross(abs(p.y)<0.94?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0), p));',
    '    vec3 b = cross(p,t);',
    '    float e = 0.011;',
    '    float hu = altura(normalize(p+t*e)) - h;',
    '    float hv = altura(normalize(p+b*e)) - h;',
    // la pendiente vive en el objeto; se lleva al mundo con la misma base
    '    vec3 tw = normalize(cross(abs(n0.y)<0.94?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0), n0));',
    '    vec3 bw = cross(n0,tw);',
    '    N = normalize(n0 - (tw*hu + bw*hv)*(fuerza/e));',
    '  }',
    '  vec3 L = normalize(uSol - vMundo);',
    '  vec3 V = normalize(uOjo - vMundo);',
    '  float ndl = dot(N,L);',
    '  float ndl0 = dot(n0,L);',
    /* El terminador no corta como un cuchillo: la luz se cuela un poco por el
       borde y se pone roja al atravesar más atmósfera. Es la diferencia entre
       un amanecer y una línea. */
    '  float dif = clamp((ndl+0.13)/1.13,0.0,1.0); dif = pow(dif,1.2);',
    '  float term = smoothstep(0.38,0.0,ndl0)*smoothstep(-0.22,0.04,ndl0);',
    '  vec3 luz = mix(vec3(1.0,0.965,0.90), vec3(1.0,0.58,0.30), term*0.75*step(0.02,uAtmoInt));',
    // especular GGX: estrecho en el agua y el cristal, ancho y débil en la roca
    '  vec3 H = normalize(L+V);',
    '  float rug = mix(0.70,0.055,brillo);',
    '  float a2 = rug*rug*rug*rug;',
    '  float nh = max(dot(N,H),0.0);',
    '  float den = nh*nh*(a2-1.0)+1.0;',
    '  float esp = (a2/(3.14159*den*den)) * brillo * step(0.0,ndl0) * dif;',
    '  float noche = smoothstep(0.08,-0.16,ndl0);',
    '  vec3 c = alb*dif*luz*1.30 + vec3(1.0,0.95,0.86)*min(esp,6.0)*0.55 + emi*noche;',
    /* Un rebote tenue del cielo propio, para que el lado de noche sea noche y
       no un agujero recortado en la pantalla. */
    '  float relleno = pow(clamp(dot(N,V),0.0,1.0),0.8)*0.115;',
    '  c += alb*relleno*vec3(0.80,0.86,1.0);',
    '  c += alb*uAtmo*0.05 + alb*0.012;',
    // el aire, encendido por el borde
    '  float fres = pow(1.0-max(dot(n0,V),0.0),3.0);',
    '  c += uAtmo*fres*(0.22+0.78*dif)*uAtmoInt*1.1;',
    '  c *= uApag;',
    '  salida = vec4(c,1.0);',
    '}'
  ].join('\n');

  /* La atmósfera es una cáscara aparte, un pelo más grande que el planeta y
     sumada a lo que ya hay. Como el brillo va con el Fresnel —cero mirándola
     de frente, uno de canto—, en el centro no tapa nada y en el borde se
     enciende, y como la cáscara sobresale un 5,5 % el halo se sale del
     planeta. Pintarla como un aro plano se nota enseguida: el aro brilla igual
     de los dos lados, y una atmósfera solo brilla por donde le da el sol. */
  var ATMO_FS = CAB + [
    'in vec3 vMundo; in vec3 vNor;',
    'uniform vec3 uSol; uniform vec3 uOjo; uniform vec3 uAtmo;',
    'uniform float uAtmoInt; uniform float uApag;',
    'out vec4 salida;',
    'void main(){',
    '  vec3 N = normalize(vNor);',
    '  vec3 L = normalize(uSol - vMundo);',
    '  vec3 V = normalize(uOjo - vMundo);',
    '  float fres = pow(1.0-abs(dot(N,V)),2.8);',
    '  float dif = clamp(dot(N,L)*0.55+0.48,0.0,1.0);',
    /* Hacia delante la atmósfera dispersa mucho más: por eso el creciente es
       más brillante junto al terminador que en el ecuador iluminado. */
    '  float frente = pow(clamp(dot(-V,L)*0.5+0.5,0.0,1.0),3.4);',
    '  float a = fres*dif*(0.40+2.30*frente)*uAtmoInt;',
    '  vec3 tinte = mix(uAtmo, vec3(1.0,0.86,0.70), frente*0.45);',
    '  salida = vec4(tinte*a*1.7*uApag, 1.0);',
    '}'
  ].join('\n');

  /* El sol. Lo que hace que una bola naranja parezca una estrella son dos
     cosas, y ninguna es el color: la granulación (las células de convección
     que suben y bajan) y el oscurecimiento del limbo — el borde se ve más
     apagado porque la línea de visión atraviesa capas más frías. Sin eso es
     una pelota; con eso, es plasma. */
  var SOL_FS = CAB + RUIDO + '\n' + [
    'in vec3 vObj; in vec3 vMundo; in vec3 vNor;',
    'uniform vec3 uOjo; uniform float uT; uniform int uOct;',
    'out vec4 salida;',
    'void main(){',
    '  vec3 p = vObj;',
    /* La granulación MODULA el brillo, no lo pinta. Las células de convección
       de una estrella son variaciones de un ocho por ciento largo: se ven
       como un moteado finísimo, no como manchas de otro color. Pintándolas
       como color, el sol sale de limón; modulándolas, sale de plasma. */
    '  float g1 = fbm(p*9.5 + vec3(0.0,uT*0.05,0.0), min(uOct,4));',
    '  float g2 = fbm(p*24.0 - vec3(uT*0.035,0.0,uT*0.02), 2);',
    '  float gran = clamp(g1*0.62 + g2*0.30, -1.0, 1.0);',
    '  vec3 N = normalize(vNor); vec3 V = normalize(uOjo - vMundo);',
    '  float mu = max(dot(N,V),0.0);',
    /* El oscurecimiento del limbo. Mirando al centro del disco se ve hasta el
       fondo caliente; mirando al borde, la línea de visión entra de refilón y
       solo atraviesa las capas altas, que están más frías — y más frío, en una
       estrella, es más naranja. Es LA cosa que separa una bola de una estrella. */
    '  float limbo = pow(mu,0.58);',
    '  vec3 nucleo = vec3(1.00,0.965,0.90);',
    '  vec3 borde  = vec3(1.00,0.52,0.14);',
    '  vec3 c = mix(borde, nucleo, limbo);',
    '  c *= 0.88 + 0.22*gran;',
    '  c *= limbo*0.72 + 0.50;',
    '  salida = vec4(c*1.06,1.0);',
    '}'
  ].join('\n');

  /* La corona, en un rectángulo siempre de cara a la cámara. No es un halo
     redondo y liso: tiene vetas que salen del disco y se mueven despacio,
     porque una corona lisa se lee como un brillo de Photoshop. */
  var CORONA_VS = CAB + [
    'in vec2 aUV;',
    'uniform mat4 uVP; uniform vec3 uCentro; uniform vec3 uDer; uniform vec3 uArr; uniform float uEsc;',
    'out vec2 vUV;',
    'void main(){ vUV=aUV; vec3 w = uCentro + (uDer*aUV.x + uArr*aUV.y)*uEsc;',
    '  gl_Position = uVP*vec4(w,1.0); }'
  ].join('\n');

  var CORONA_FS = CAB + RUIDO + '\n' + [
    'in vec2 vUV; uniform float uT; out vec4 salida;',
    'void main(){',
    '  float r = length(vUV);',
    '  if(r>1.0){ discard; }',
    '  float ang = atan(vUV.y,vUV.x);',
    '  float caida = exp(-r*5.6);',
    '  float vetas = 0.62+0.38*ruido(vec3(cos(ang)*2.4, sin(ang)*2.4, uT*0.05));',
    '  float a = caida*(0.48+0.52*vetas);',
    '  a += exp(-r*15.0)*0.42;',
    '  vec3 c = mix(vec3(1.0,0.58,0.18), vec3(1.0,0.95,0.80), exp(-r*8.0));',
    '  salida = vec4(c*a*0.62,1.0);',
    '}'
  ].join('\n');

  /* Los anillos de Ordenex. Un disco plano en el ecuador del planeta, con
     huecos como los de Cassini, y —lo que de verdad lo vende— la SOMBRA del
     planeta proyectada encima. Sin esa sombra los anillos parecen una calcomanía. */
  var ANILLO_VS = CAB + [
    'in vec2 aPos;',
    'uniform mat4 uVP; uniform mat3 uRot; uniform vec3 uCentro; uniform float uRadio;',
    'out vec3 vMundo; out float vR;',
    'void main(){',
    '  vR = length(aPos);',
    '  vec3 loc = vec3(aPos.x, 0.0, aPos.y) * uRadio;',
    '  vMundo = uCentro + uRot*loc;',
    '  gl_Position = uVP*vec4(vMundo,1.0);',
    '}'
  ].join('\n');

  var ANILLO_FS = CAB + RUIDO + '\n' + [
    'in vec3 vMundo; in float vR;',
    'uniform vec3 uSol; uniform vec3 uCentro; uniform vec3 uCol2;',
    'uniform float uRadioP; uniform float uApag;',
    'out vec4 salida;',
    'void main(){',
    '  float t = (vR-1.32)/(2.35-1.32);',
    '  if(t<0.0||t>1.0){ discard; }',
    '  float d = ruido(vec3(vR*22.0,0.0,0.0))*0.5+0.5;',
    '  d *= 0.55+0.45*(ruido(vec3(vR*61.0,3.0,0.0))*0.5+0.5);',
    // el hueco grande, como el de Cassini
    '  d *= smoothstep(0.015,0.075,abs(t-0.44));',
    '  d *= smoothstep(0.0,0.10,t)*smoothstep(1.0,0.86,t);',
    /* La sombra: se mira si el punto del anillo está por detrás del planeta
       visto desde el sol. Es geometría de secundaria y vale por mil texturas. */
    '  vec3 L = normalize(uSol-uCentro);',
    '  vec3 rel = vMundo-uCentro;',
    '  float proy = dot(rel,L);',
    '  float perp = length(rel - L*proy);',
    '  float som = (proy<0.0) ? smoothstep(uRadioP*0.88,uRadioP*1.12,perp) : 1.0;',
    '  vec3 c = uCol2*(0.55+0.45*som);',
    '  salida = vec4(c*d*0.8*uApag, d*0.80*uApag);',
    '}'
  ].join('\n');

  /* Las órbitas. La línea entera es tenue; lo que se ve de verdad es la estela
     justo detrás del planeta, que se apaga hacia atrás. Así la elipse se
     entiende sin que siete aros de oro compitan con los mundos. */
  var ORBITA_VS = CAB + [
    'in vec3 aPos; in float aFase;',
    'uniform mat4 uVP; out float vFase;',
    'void main(){ vFase=aFase; gl_Position=uVP*vec4(aPos,1.0); }'
  ].join('\n');

  var ORBITA_FS = CAB + [
    'in float vFase; uniform float uFase; uniform vec3 uCol; uniform float uApag;',
    'out vec4 salida;',
    'void main(){',
    '  float d = fract(uFase - vFase);',
    '  float estela = exp(-d*9.0);',
    '  float a = (0.055 + 0.62*estela)*uApag;',
    '  salida = vec4(uCol*a, a);',
    '}'
  ].join('\n');

  /* El cielo. Los colores no son inventados: salen de la temperatura de la
     estrella, que es lo que decide de qué color se ve. Las azules son pocas
     porque en el cielo de verdad son pocas. */
  var ESTRELLAS_VS = CAB + [
    'in vec3 aPos; in vec3 aCol; in vec2 aVar;',   // aVar = (tamaño, fase del titileo)
    'uniform mat4 uVP; uniform float uT; uniform float uEsc; uniform float uGiro;',
    'out vec3 vCol; out float vA;',
    'void main(){',
    /* La rotación diferencial: el disco NO gira como un plato. La velocidad de
       las estrellas es casi la misma a cualquier radio (curva de rotación
       plana), así que la velocidad ANGULAR cae con la distancia y los brazos
       se van cizallando. Es la razón por la que las galaxias tienen brazos en
       espiral y no radios de bicicleta. */
    '  float r = max(length(aPos.xz), 0.30);',
    '  float ang = uGiro / r;',
    '  float c = cos(ang), s = sin(ang);',
    '  vec3 p = vec3(aPos.x*c - aPos.z*s, aPos.y, aPos.x*s + aPos.z*c);',
    '  vCol = aCol;',
    '  vA = 0.62 + 0.38*sin(uT*(0.5+aVar.y*1.6) + aVar.y*31.0);',
    '  vec4 v = uVP*vec4(p,1.0);',
    '  gl_Position = v;',
    '  gl_PointSize = max(aVar.x*uEsc, 0.8);',
    '}'
  ].join('\n');

  var ESTRELLAS_FS = CAB + [
    'in vec3 vCol; in float vA; out vec4 salida;',
    'void main(){',
    '  vec2 d = gl_PointCoord-0.5;',
    '  float r = length(d);',
    '  if(r>0.5) discard;',
    '  float a = smoothstep(0.5,0.045,r)*vA;',
    '  salida = vec4(vCol*a, a);',
    '}'
  ].join('\n');

  /* La nebulosa del fondo: velos de color pintados con el mismo ruido, en un
     rectángulo que cubre la pantalla y se dibuja el primero de todo. Da
     profundidad al negro sin cobrar una sola descarga. */
  var FONDO_VS = CAB + [
    'in vec2 aUV; out vec2 vUV;',
    'void main(){ vUV=aUV; gl_Position=vec4(aUV,0.999,1.0); }'
  ].join('\n');

  var FONDO_FS = CAB + RUIDO + '\n' + [
    'in vec2 vUV; uniform float uT; uniform float uAsp; out vec4 salida;',
    'void main(){',
    '  vec2 q = vec2(vUV.x*uAsp, vUV.y);',
    '  float n1 = fbm(vec3(q*0.85 + vec2(uT*0.004,0.0), 0.3), 4);',
    '  float n2 = fbm(vec3(q*1.9 - vec2(0.0,uT*0.003), 5.1), 3);',
    /* El espacio es NEGRO. La primera versión de esto pintaba unos velos
       preciosos de azul y oro que se comían la escena entera: los mundos
       quedaban de adorno encima de un mármol. Una nebulosa de verdad, en una
       foto de verdad, es un susurro — se nota que está y no se puede decir
       dónde empieza. Estos números son ese susurro, y no se suben. */
    '  vec3 c = vec3(0.0105,0.0145,0.0355);',
    '  c += vec3(0.020,0.032,0.105)*clamp(n1*0.85+0.22,0.0,1.0);',
    '  c += vec3(0.085,0.060,0.022)*clamp(n2*0.55+0.05,0.0,1.0)*0.5;',
    '  c += vec3(0.035,0.018,0.060)*clamp(n1*n2+0.12,0.0,1.0)*0.5;',
    /* Más oscuro por abajo: ahí empieza el texto y la legibilidad manda sobre
       el cielo, siempre. */
    '  c *= mix(1.0, 0.40, smoothstep(0.15,-0.9,vUV.y));',
    '  salida = vec4(c,1.0);',
    '}'
  ].join('\n');

  /* La nebulosa se pinta UNA vez en una textura a media resolución y luego
     solo se estampa. Antes se calculaba entera en cada cuadro: siete octavas
     de ruido simplex por cada píxel de la pantalla, lo mismo cada dieciséis
     milésimas, para dar el mismo resultado — era, con diferencia, lo más caro
     de la escena, y encima lo más quieto. A media resolución no se nota
     porque son velos difusos, y el gasto pasa de todos los cuadros a uno. */
  var ESTAMPA_FS = CAB + [
    'in vec2 vUV; uniform sampler2D uTex; out vec4 salida;',
    'void main(){ salida = vec4(texture(uTex,vUV).rgb,1.0); }'
  ].join('\n');

  // ── el brillo: la mitad de lo que hace que una escena parezca fotografiada ──

  /* Un desenfoque de lo que más brilla, sumado encima. Se hace a cuarto de
     resolución porque lo que se busca es justo lo contrario del detalle, y a
     cuarto cuesta la dieciseisava parte. En el teléfono se apaga entero: allí
     el presupuesto se gasta en que los mundos tengan superficie. */
  var PASO_VS = CAB + ['in vec2 aUV; out vec2 vUV;',
    'void main(){ vUV=aUV*0.5+0.5; gl_Position=vec4(aUV,0.0,1.0); }'].join('\n');

  var BRILLO_FS = CAB + [
    'in vec2 vUV; uniform sampler2D uTex; out vec4 salida;',
    'void main(){',
    '  vec3 c = texture(uTex,vUV).rgb;',
    '  float l = dot(c, vec3(0.2126,0.7152,0.0722));',
    '  salida = vec4(c*smoothstep(0.80,1.60,l),1.0);',
    '}'
  ].join('\n');

  var DESENFOQUE_FS = CAB + [
    'in vec2 vUV; uniform sampler2D uTex; uniform vec2 uPaso; out vec4 salida;',
    'void main(){',
    '  vec3 s = texture(uTex,vUV).rgb*0.2270270;',
    '  s += (texture(uTex,vUV+uPaso*1.3846153).rgb + texture(uTex,vUV-uPaso*1.3846153).rgb)*0.3162162;',
    '  s += (texture(uTex,vUV+uPaso*3.2307692).rgb + texture(uTex,vUV-uPaso*3.2307692).rgb)*0.0702702;',
    '  salida = vec4(s,1.0);',
    '}'
  ].join('\n');

  var COMPONER_FS = CAB + [
    'in vec2 vUV; uniform sampler2D uEscena; uniform sampler2D uBrillo; uniform float uInt;',
    'out vec4 salida;',
    'void main(){',
    '  vec3 c = texture(uEscena,vUV).rgb + texture(uBrillo,vUV).rgb*uInt;',
    /* Del rango libre a la pantalla, con un hombro que SOLO toca las luces.
       El primer intento usaba Reinhard sobre todo el rango y una gamma
       encima: subía las sombras, aplanaba los medios y dejaba la escena
       lechosa, que es justo lo contrario del espacio. Por debajo de 0,8 esto
       no cambia un solo píxel; por encima, comprime en vez de recortar, y el
       sol se pone blanco por el centro sin arrastrar a todo lo demás. */
    '  c = c/(1.0 + max(c-vec3(0.80), vec3(0.0)));',
    '  salida = vec4(max(c,0.0),1.0);',
    '}'
  ].join('\n');

  // ══ EL MOTOR ══════════════════════════════════════════════════════════════

  var gl = null, lienzo = null, campo = null, contenedor = null;
  var ancho = 0, alto = 0, dpr = 1, rafId = 0, t0 = 0, previo = 0, reloj = 0;
  var progs = {}, bufs = {}, esfera = null, esferaN = 0;
  var etiquetas = [], fichas = [], solTexto = null;
  var abierta = null, ultima = null, foco = 0, focoVa = 0;
  var raton = { x: 0, y: 0, ax: 0, ay: 0 };
  var OCT = BOLSILLO ? 4 : 6, RELIEVE = 1, BRILLO = !BOLSILLO;
  var fbo = {}, muerto = false, enLista = function () { return false; };
  var camDist = 6;
  /* ── LA CALIDAD SE MIDE, NO SE ADIVINA ──────────────────────────────────────
     No hay forma de saber desde aquí qué tarjeta gráfica tiene quien abre la
     página. Hay teléfonos de gama baja que mueven esto sin despeinarse y
     portátiles con gráficos integrados de hace ocho años que no. Leer el
     nombre del renderizador y mantener una lista de modelos es una lista que
     envejece mal y que siempre va por detrás del mundo.
     Así que la página se mide a sí misma. Cuenta cuántos de los primeros
     cuadros tardan más de lo que deberían y, si va justa, baja un escalón:
     primero se va el brillo, luego el relieve y el detalle del ruido, y si
     aun así no llega, se retira y deja que el dibujo plano de siempre haga el
     trabajo. Nadie mira una portada a nueve cuadros por segundo pensando «qué
     bonitos los planetas». */
  var muestras = 0, lentos = 0, escalon = 0, ventana = 0;
  var tmp = [0, 0, 0, 0];
  var camOjo = [0, 0, 0], camMira = [0, 0, 0];

  function compilar(tipo, fuente) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, fuente); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (window.console) console.warn('sistema: shader', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function programa(vs, fs) {
    var v = compilar(gl.VERTEX_SHADER, vs), f = compilar(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (window.console) console.warn('sistema: enlace', gl.getProgramInfoLog(p));
      return null;
    }
    // Se guardan los sitios una vez: buscarlos por nombre en cada cuadro es
    // de las cosas más caras que se pueden hacer en un bucle de dibujo.
    p.u = {}; p.a = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), i;
    for (i = 0; i < n; i++) { var u = gl.getActiveUniform(p, i); p.u[u.name] = gl.getUniformLocation(p, u.name); }
    n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (i = 0; i < n; i++) { var at = gl.getActiveAttrib(p, i); p.a[at.name] = gl.getAttribLocation(p, at.name); }
    return p;
  }

  function buffer(datos, tipo) {
    var b = gl.createBuffer();
    var d = tipo || gl.ARRAY_BUFFER;
    gl.bindBuffer(d, b); gl.bufferData(d, datos, gl.STATIC_DRAW);
    return b;
  }

  // ── el cielo, sembrado una vez ─────────────────────────────────────────────

  /* Semilla fija, como en la puerta de la billetera: el cielo es el MISMO en
     cada visita. Uno que cambia en cada carga parece un salvapantallas. */
  function alAzar(semilla) {
    var s = semilla >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* El color de una estrella por su temperatura. Aproximación de Tanner
     Helland a la curva de Planck, que es la que usan los astrofotógrafos: azul
     por encima de 10 000 K, blanco hacia 6 000, naranja por debajo de 4 000. */
  function colorPorTemperatura(k) {
    var t = k / 100, r, g, b;
    if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; }
    else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); }
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else b = 138.52 * Math.log(t - 10) - 305.04;
    var c = function (x) { return Math.min(1, Math.max(0, x / 255)); };
    return [c(r), c(g), c(b)];
  }

  function sembrarCielo() {
    var az = alAzar(5550);                      // la cadena de la casa, de semilla
    var lejanas = BOLSILLO ? 420 : 900;
    var disco = BOLSILLO ? 700 : 1700;
    var n = lejanas + disco;
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vr = new Float32Array(n * 2);
    var i;
    for (i = 0; i < n; i++) {
      var enDisco = i >= lejanas, x, y, z, temp, tam;
      if (!enDisco) {
        // el cielo de fondo: repartido por una esfera muy lejana
        var u = az() * 2 - 1, th = az() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 16 + az() * 5;
        x = Math.cos(th) * s * R; y = u * R * 0.62; z = Math.sin(th) * s * R;
        temp = 2600 + Math.pow(az(), 2.6) * 11000;
        tam = 0.8 + Math.pow(az(), 3.5) * 3.2;
      } else {
        /* El disco de la galaxia: dos brazos logarítmicos con dispersión. La
           densidad cae hacia fuera, como en una de verdad. */
        var brazo = (az() < 0.5) ? 0 : Math.PI;
        var tt = Math.pow(az(), 0.62);
        var rr = 1.4 + tt * 12.0;
        var ang = brazo + tt * 3.5 + (az() - 0.5) * (0.95 - tt * 0.35);
        var disp = (az() - 0.5) * rr * 0.34;
        x = Math.cos(ang) * rr + disp;
        z = Math.sin(ang) * rr + (az() - 0.5) * rr * 0.34;
        y = (az() - 0.5) * (0.55 + rr * 0.075) - 2.4;   // el disco pasa por debajo del sistema
        temp = 2900 + Math.pow(az(), 2.2) * 9000;
        tam = 0.6 + Math.pow(az(), 3.2) * 2.0;
      }
      var c = colorPorTemperatura(temp);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      vr[i * 2] = tam; vr[i * 2 + 1] = az();
    }
    return { pos: pos, col: col, vr: vr, n: n, lejanas: lejanas };
  }

  // ── las órbitas, calculadas una vez en la CPU ──────────────────────────────

  function mallaOrbita(casa) {
    var N = 200, pos = new Float32Array(N * 3), fase = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var E = (i / (N - 1)) * Math.PI * 2;
      var x = casa.a * (Math.cos(E) - casa.e), y = casa.b * Math.sin(E);
      pos[i * 3] = casa.eP[0] * x + casa.eQ[0] * y;
      pos[i * 3 + 1] = casa.eP[1] * x + casa.eQ[1] * y;
      pos[i * 3 + 2] = casa.eP[2] * x + casa.eQ[2] * y;
      fase[i] = (i / (N - 1));
    }
    return { pos: buffer(pos), fase: buffer(fase), n: N };
  }

  function mallaAnillo() {
    /* Un anillo de triángulos: dos circunferencias unidas. El radio va en la
       propia coordenada, que es lo que el shader lee para saber en qué banda
       está cada punto. */
    var N = 96, r0 = 1.25, r1 = 2.45;
    var v = new Float32Array(N * 2 * 2 * 3 * 2), o = 0;
    for (var i = 0; i < N; i++) {
      var a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      var p = [[Math.cos(a0) * r0, Math.sin(a0) * r0], [Math.cos(a1) * r0, Math.sin(a1) * r0],
               [Math.cos(a1) * r1, Math.sin(a1) * r1], [Math.cos(a0) * r1, Math.sin(a0) * r1]];
      var tri = [0, 1, 2, 0, 2, 3];
      for (var j = 0; j < 6; j++) { v[o++] = p[tri[j]][0]; v[o++] = p[tri[j]][1]; }
    }
    return { buf: buffer(v.subarray(0, o)), n: o / 2 };
  }

  // ── el objetivo fuera de pantalla, para el brillo ──────────────────────────

  function crearFBO(w, h, flotante, conProfundidad) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (flotante) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    /* Sin profundidad propia, la escena dibujada aquí dentro pierde el orden:
       el planeta de detrás se pinta encima del de delante según le toque. El
       búfer de pantalla la trae de fábrica; este hay que dársela. */
    var rb = null;
    if (conProfundidad) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteTexture(t); gl.deleteFramebuffer(f);
      if (rb) gl.deleteRenderbuffer(rb);
      return null;
    }
    return { tex: t, fb: f, rb: rb, w: w, h: h };
  }

  function soltarFBOs() {
    ['escena', 'brillo1', 'brillo2', 'nebulosa'].forEach(function (k) {
      if (fbo[k]) {
        gl.deleteTexture(fbo[k].tex); gl.deleteFramebuffer(fbo[k].fb);
        if (fbo[k].rb) gl.deleteRenderbuffer(fbo[k].rb);
        fbo[k] = null;
      }
    });
  }

  /* Cuanto más estrecha la pantalla, más desde arriba se mira. En un monitor
     ancho y bajo, una vista rasante deja las elipses finas y el sistema cabe;
     en un teléfono vertical esa misma vista deja una franja de planetas con
     medio lienzo vacío debajo. Subiendo la cámara, las órbitas se abren y
     llenan el alto, que es lo que sobra allí. */
  function elevacion() {
    /* La altura de la cámara no se elige: se deduce. Una órbita circular vista
       desde un ángulo `e` se proyecta como una elipse tan ancha como el
       diámetro y tan alta como el diámetro por el seno de `e`. Pedirle a esa
       elipse la misma proporción que el lienzo da directamente el ángulo, y
       así el sistema llena los dos ejes en cualquier pantalla: casi rasante en
       un monitor ancho, casi cenital en un teléfono de pie. */
    var asp = lienzo.width / Math.max(1, lienzo.height);
    var s = Math.max(0.34, Math.min(0.92, 1 / asp));
    return Math.max(0.50, Math.min(1.15, Math.asin(s)));
  }

  /* A QUÉ DISTANCIA SE PONE LA CÁMARA.
     La primera versión lo despejaba con trigonometría de la órbita de fuera, y
     estaba mal: en perspectiva la mitad lejana de una elipse no se proyecta
     como la cercana, así que el número aproximado dejaba a la casa más
     exterior cortada por el borde de arriba — y con ella su rótulo, que es un
     botón. Aquí no se aproxima nada: se toman puntos de la órbita de fuera,
     se proyectan de verdad y se busca por bisección la distancia mínima a la
     que TODOS caben. Cuesta una vez por cambio de tamaño y quita para siempre
     la clase de fallo que solo aparece en el teléfono de otra persona. */
  function ajustarDistancia() {
    var fuera = CASAS[CASAS.length - 1];
    var margen = fuera.radio * 1.35;
    var muestras = [], i;
    for (i = 0; i < 48; i++) {
      var E = (i / 48) * Math.PI * 2;
      var x = fuera.a * (Math.cos(E) - fuera.e), y = fuera.b * Math.sin(E);
      muestras.push([fuera.eP[0] * x + fuera.eQ[0] * y,
                     fuera.eP[1] * x + fuera.eQ[1] * y,
                     fuera.eP[2] * x + fuera.eQ[2] * y]);
    }
    var elev = elevacion();
    var aspecto = lienzo.width / Math.max(1, lienzo.height);
    var LIMITE = 0.93;                 // deja un respiro antes del borde

    function cabe(d) {
      var ojo = [Math.sin(0.10) * d * Math.cos(elev), d * Math.sin(elev), Math.cos(0.10) * d * Math.cos(elev)];
      var VP = multiplicar(perspectiva(0.60, aspecto, 0.02, 80, 0, 0), mirar(ojo, [0, -0.02, 0], [0, 1, 0]));
      for (var j = 0; j < muestras.length; j++) {
        var p = muestras[j];
        var w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
        if (w <= 0.001) return false;
        var nx = (VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12]) / w;
        var ny = (VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13]) / w;
        // el margen del planeta, en unidades de pantalla a esa profundidad
        var dp = Math.hypot(p[0] - ojo[0], p[1] - ojo[1], p[2] - ojo[2]);
        var m = (margen / Math.max(dp, 0.001)) / Math.tan(0.30);
        if (Math.abs(nx) + m / aspecto > LIMITE || Math.abs(ny) + m > LIMITE) return false;
      }
      return true;
    }

    var lo = 1.0, hi = 40;
    if (!cabe(hi)) { camDist = hi; return; }
    for (i = 0; i < 26; i++) {
      var mid = (lo + hi) / 2;
      if (cabe(mid)) hi = mid; else lo = mid;
    }
    camDist = hi;
  }

  function pintarNebulosa() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.nebulosa.fb);
    gl.viewport(0, 0, fbo.nebulosa.w, fbo.nebulosa.h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    usarQuad(progs.fondo);
    gl.uniform1f(progs.fondo.u.uT, 0);
    gl.uniform1f(progs.fondo.u.uAsp, lienzo.width / Math.max(1, lienzo.height));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function medir() {
    if (!lienzo || !campo) return;
    var caja = campo.getBoundingClientRect();
    ancho = Math.max(1, Math.round(caja.width));
    alto = Math.max(1, Math.round(caja.height));
    dpr = Math.min(BOLSILLO ? 1.5 : 2, window.devicePixelRatio || 1);
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    lienzo.style.width = ancho + 'px';
    lienzo.style.height = alto + 'px';
    ajustarDistancia();
    soltarFBOs();
    fbo.nebulosa = crearFBO(Math.max(1, lienzo.width >> 1), Math.max(1, lienzo.height >> 1), false, false);
    if (fbo.nebulosa && progs.estampa) pintarNebulosa();
    if (BRILLO) {
      var w = lienzo.width, h = lienzo.height;
      fbo.escena = crearFBO(w, h, true, true);
      fbo.brillo1 = crearFBO(Math.max(1, w >> 2), Math.max(1, h >> 2), true, false);
      fbo.brillo2 = crearFBO(Math.max(1, w >> 2), Math.max(1, h >> 2), true, false);
      if (!fbo.escena || !fbo.brillo1 || !fbo.brillo2) { soltarFBOs(); BRILLO = false; }
    }
  }

  // ── abrir y cerrar una casa: el mismo contrato que antes ───────────────────

  function abrir(id) {
    if (abierta === id) { cerrar(); return; }
    if (abierta) ocultarFicha(abierta);
    abierta = id; focoVa = 1;
    CASAS.forEach(function (c, i) {
      var e = etiquetas[i]; if (e) e.setAttribute('aria-expanded', String(c.id === id));
    });
    var f = fichas[CASAS.map(function (c) { return c.id; }).indexOf(id)];
    if (f) {
      f.hidden = false;
      var h = f.querySelector('h3'); if (h) h.focus();
    }
    if (rafId === 0 && !QUIETO.matches) { previo = 0; rafId = requestAnimationFrame(cuadro); }
    if (QUIETO.matches) { foco = 1; cuadro(performance.now()); }
  }

  function ocultarFicha(id) {
    var f = fichas[CASAS.map(function (c) { return c.id; }).indexOf(id)];
    if (f) f.hidden = true;
  }

  function cerrar() {
    if (!abierta) return;
    ocultarFicha(abierta);
    var e = etiquetas[CASAS.map(function (c) { return c.id; }).indexOf(abierta)];
    ultima = abierta; abierta = null; focoVa = 0;
    CASAS.forEach(function (c, i) { if (etiquetas[i]) etiquetas[i].setAttribute('aria-expanded', 'false'); });
    if (e) e.focus();
    if (QUIETO.matches) { foco = 0; cuadro(performance.now()); }
  }

  function enchufar() {
    CASAS.forEach(function (casa, i) {
      var e = etiquetas[i];
      if (e && !e._enchufado) {
        e._enchufado = true;
        e.addEventListener('click', function (ev) { ev.preventDefault(); abrir(casa.id); });
      }
      var f = fichas[i];
      if (f && !f._enchufado) {
        f._enchufado = true;
        var x = f.querySelector('.cerrar');
        if (x) x.addEventListener('click', cerrar);
      }
    });
    if (!contenedor._teclas) {
      contenedor._teclas = true;
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && abierta) cerrar(); });
      contenedor.addEventListener('click', function (ev) {
        if (abierta && (ev.target === contenedor || ev.target.tagName === 'CANVAS'
            || ev.target.classList.contains('campo'))) cerrar();
      });
    }
  }

  // ── el cuadro ──────────────────────────────────────────────────────────────

  var suave = function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };

  function cuadro(ahora) {
    rafId = 0;
    if (muerto || !gl) return;

    var dt = previo ? Math.min(0.1, (ahora - previo) / 1000) : 0.016;
    if (previo && escalon < 3) vigilar(ahora - previo);
    previo = ahora;
    if (!QUIETO.matches) reloj += dt;
    var t = reloj;

    // el foco: cuánto se ha volado hacia la casa abierta
    foco += (focoVa - foco) * Math.min(1, dt * 3.4);
    if (Math.abs(focoVa - foco) < 0.002) foco = focoVa;
    var f = suave(Math.max(0, Math.min(1, foco)));

    raton.ax += (raton.x - raton.ax) * Math.min(1, dt * 3.0);
    raton.ay += (raton.y - raton.ay) * Math.min(1, dt * 3.0);

    // dónde está cada casa ahora mismo
    var puestos = CASAS.map(function (c) {
      var s = sitio(c, t, [0, 0, 0, 0]);
      return { casa: c, p: [s[0], s[1], s[2]], fase: s[3] };
    });
    var elegida = null, idFoco = abierta || ultima;
    for (var i = 0; i < puestos.length; i++) if (puestos[i].casa.id === idFoco) elegida = puestos[i];

    // ── la cámara ────────────────────────────────────────────────────────────
    /* La vista de reposo: por encima del plano de las órbitas, girando muy
       despacio. Tres cuartos y no cenital — desde arriba del todo un sistema
       solar se lee como un diagrama, y lo que se busca es que se lea como un
       sitio. */
    var angBase = 0.10 + t * 0.017 + raton.ax * 0.20;
    var aspecto0 = lienzo.width / Math.max(1, lienzo.height);
    var elev = elevacion();
    var dist = camDist;
    var altBase = dist * Math.sin(elev) + raton.ay * 0.30 + Math.sin(t * 0.09) * 0.14;
    var distBase = dist * Math.cos(elev);
    var ojoBase = [Math.sin(angBase) * distBase, altBase, Math.cos(angBase) * distBase];
    var miraBase = [0, -0.02, 0];

    var ojo = ojoBase, mira = miraBase, desp = 0;
    if (f > 0.001 && elegida) {
      /* El vuelo: la cámara se acerca a la casa y la mira a ella. El
         desplazamiento de lente la corre a un tercio para que la ficha tenga
         sitio; en el teléfono la ficha va debajo, así que se sube en vez de
         correrse. */
      /* DÓNDE SE PONE LA CÁMARA, Y POR QUÉ NO DONDE ESTABA.
         El primer intento se acercaba en línea recta desde donde ya estaba
         mirando. La mitad de las veces eso deja el planeta a contraluz, con el
         sol entero metido en el cuadro y la ficha encima del deslumbre: la
         casa que se acaba de abrir era una bola negra.
         Ahora la cámara se coloca RESPECTO AL SOL: se toma la dirección que va
         del sol al planeta y se gira setenta y tantos grados. Así se ve
         siempre una cara iluminada de tres cuartos —con su terminador, que es
         donde se lee el relieve—, el sol queda fuera de encuadre, y la parte
         en sombra cae del lado de la ficha, que es la que tiene que mandar. */
      var r = elegida.casa.radio;
      var dCerca = r * (elegida.casa.anillo ? 8.6 : 6.4);
      var lp = Math.hypot(elegida.p[0], elegida.p[2]) || 1;
      var hx = elegida.p[0] / lp, hz = elegida.p[2] / lp;
      /* El ángulo es de CIENTO TREINTA grados y no de setenta y cinco, y la
         diferencia es la noche y el día — literalmente. El ángulo de fase, o
         sea lo que se ve iluminado, es 180° menos este: a setenta y cinco se
         veía un tercio de la cara, que en un planeta oscuro es una bola negra;
         a ciento treinta se ve el ochenta por ciento, con el terminador aún
         dentro del disco, que es donde el relieve proyecta sombras y se lee la
         montaña. El sol queda detrás de la ficha en vez de en medio. */
      var gi = 2.27;
      var dirX = hx * Math.cos(gi) - hz * Math.sin(gi);
      var dirZ = hx * Math.sin(gi) + hz * Math.cos(gi);
      var ojoCerca = [elegida.p[0] + dirX * dCerca, elegida.p[1] + dCerca * 0.34, elegida.p[2] + dirZ * dCerca];
      ojo = [ojoBase[0] + (ojoCerca[0] - ojoBase[0]) * f,
             ojoBase[1] + (ojoCerca[1] - ojoBase[1]) * f,
             ojoBase[2] + (ojoCerca[2] - ojoBase[2]) * f];
      mira = [miraBase[0] + (elegida.p[0] - miraBase[0]) * f,
              miraBase[1] + (elegida.p[1] - miraBase[1]) * f,
              miraBase[2] + (elegida.p[2] - miraBase[2]) * f];
      desp = f * (enAncho() ? 0.52 : 0.0);
    }
    camOjo = ojo; camMira = mira;

    var aspecto = aspecto0;
    var proy = perspectiva(0.60, aspecto, 0.02, 80, desp, f * (enAncho() ? 0 : -0.38));
    var vista = mirar(ojo, mira, [0, 1, 0]);
    var VP = multiplicar(proy, vista);

    // ── pintar ───────────────────────────────────────────────────────────────
    var destino = (BRILLO && fbo.escena) ? fbo.escena.fb : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destino);
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    gl.clearColor(0.027, 0.035, 0.102, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // la nebulosa, al fondo del todo: ya está pintada, solo se estampa
    if (fbo.nebulosa) {
      usarQuad(progs.estampa);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbo.nebulosa.tex);
      gl.uniform1i(progs.estampa.u.uTex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      usarQuad(progs.fondo);
      gl.uniform1f(progs.fondo.u.uT, t);
      gl.uniform1f(progs.fondo.u.uAsp, aspecto);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // las estrellas y el disco de la galaxia
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    var pe = progs.estrellas;
    gl.useProgram(pe);
    gl.uniformMatrix4fv(pe.u.uVP, false, VP);
    gl.uniform1f(pe.u.uT, t);
    gl.uniform1f(pe.u.uEsc, dpr * (BOLSILLO ? 0.9 : 1.15));
    /* La galaxia gira de verdad, pero muy despacio: lo que se ve en un minuto
       es un empujón, no una peonza. Una galaxia tarda cientos de millones de
       años en dar una vuelta y eso también hay que respetarlo un poco. */
    gl.uniform1f(pe.u.uGiro, t * 0.0075);
    enlazar(pe, 'aPos', bufs.estPos, 3);
    enlazar(pe, 'aCol', bufs.estCol, 3);
    enlazar(pe, 'aVar', bufs.estVar, 2);
    gl.drawArrays(gl.POINTS, 0, bufs.estN);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // las órbitas
    var po = progs.orbita;
    gl.useProgram(po);
    gl.uniformMatrix4fv(po.u.uVP, false, VP);
    gl.depthMask(false);
    for (i = 0; i < puestos.length; i++) {
      var pu = puestos[i], ap = apagado(pu.casa.id, f, idFoco);
      var orb = bufs.orbitas[i];
      gl.uniform1f(po.u.uFase, pu.fase);
      gl.uniform3fv(po.u.uCol, pu.casa.atmo);
      gl.uniform1f(po.u.uApag, ap * 0.85);
      enlazar(po, 'aPos', orb.pos, 3);
      enlazar(po, 'aFase', orb.fase, 1);
      gl.drawArrays(gl.LINE_STRIP, 0, orb.n);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // el sol
    var ps = progs.sol;
    gl.useProgram(ps);
    gl.uniformMatrix4fv(ps.u.uVP, false, VP);
    gl.uniformMatrix3fv(ps.u.uRot, false, giroPlaneta(0, t * 0.035));
    gl.uniform3f(ps.u.uCentro, 0, 0, 0);
    gl.uniform1f(ps.u.uRadio, RADIO_SOL);
    gl.uniform3fv(ps.u.uOjo, ojo);
    gl.uniform1f(ps.u.uT, t);
    gl.uniform1i(ps.u.uOct, OCT);
    dibujarEsfera(ps);

    // los mundos
    var pp = progs.planeta;
    gl.useProgram(pp);
    gl.uniformMatrix4fv(pp.u.uVP, false, VP);
    gl.uniform3f(pp.u.uSol, 0, 0, 0);
    gl.uniform3fv(pp.u.uOjo, ojo);
    gl.uniform1f(pp.u.uT, t);
    gl.uniform1i(pp.u.uRelieve, RELIEVE);
    for (i = 0; i < puestos.length; i++) {
      var q = puestos[i], c = q.casa, apg = apagado(c.id, f, idFoco);
      /* Cuántas octavas de detalle merece ESTE mundo ahora mismo. Uno que
         ocupa veinte píxeles no puede enseñar el mismo terreno que uno que
         ocupa doscientos: el detalle que no cabe en un píxel no se ve, se
         emborrona, y encima se paga. Al acercarse la cámara, el mundo gana
         detalle de verdad — que es lo que hace un telescopio. */
      var dp = Math.hypot(q.p[0] - ojo[0], q.p[1] - ojo[1], q.p[2] - ojo[2]);
      var rpx = (c.radio / Math.max(dp, 0.001)) / Math.tan(0.30) * (lienzo.height / 2);
      gl.uniform1i(pp.u.uOct, rpx < 26 ? 3 : (rpx < 60 ? 4 : (rpx < 150 ? 5 : OCT)));
      gl.uniform3fv(pp.u.uCentro, q.p);
      gl.uniform1f(pp.u.uRadio, c.radio);
      gl.uniformMatrix3fv(pp.u.uRot, false, giroPlaneta(c.tilt_, t * Math.PI * 2 / c.dia));
      gl.uniform3fv(pp.u.uCol, c.col);
      gl.uniform3fv(pp.u.uCol2, c.col2);
      gl.uniform3fv(pp.u.uAtmo, c.atmo);
      gl.uniform1f(pp.u.uAtmoInt, c.atmoInt);
      gl.uniform1i(pp.u.uTipo, c.tipo);
      gl.uniform1f(pp.u.uApag, apg);
      dibujarEsfera(pp);
    }

    // los anillos, antes de las atmósferas para que el aire los tiña
    var pa = progs.anillo;
    gl.useProgram(pa);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniformMatrix4fv(pa.u.uVP, false, VP);
    gl.uniform3f(pa.u.uSol, 0, 0, 0);
    for (i = 0; i < puestos.length; i++) {
      var qa = puestos[i]; if (!qa.casa.anillo) continue;
      gl.uniform3fv(pa.u.uCentro, qa.p);
      gl.uniform1f(pa.u.uRadio, qa.casa.radio);
      gl.uniform1f(pa.u.uRadioP, qa.casa.radio);
      gl.uniformMatrix3fv(pa.u.uRot, false, giroPlaneta(qa.casa.tilt_, 0));
      gl.uniform3fv(pa.u.uCol2, qa.casa.col2);
      gl.uniform1f(pa.u.uApag, apagado(qa.casa.id, f, idFoco));
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.anillo.buf);
      gl.enableVertexAttribArray(pa.a.aPos);
      gl.vertexAttribPointer(pa.a.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, bufs.anillo.n);
    }

    // las atmósferas
    var pt = progs.atmo;
    gl.useProgram(pt);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    /* Solo la media cáscara de delante, y sin escribir profundidad: con las
       dos caras el halo se suma dos veces y el planeta sale envuelto en niebla
       en vez de con una línea de aire. */
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.depthMask(false);
    gl.uniformMatrix4fv(pt.u.uVP, false, VP);
    gl.uniform3f(pt.u.uSol, 0, 0, 0);
    gl.uniform3fv(pt.u.uOjo, ojo);
    for (i = 0; i < puestos.length; i++) {
      var qt = puestos[i]; if (qt.casa.atmoInt < 0.04) continue;
      gl.uniform3fv(pt.u.uCentro, qt.p);
      gl.uniform1f(pt.u.uRadio, qt.casa.radio * 1.055);
      gl.uniformMatrix3fv(pt.u.uRot, false, giroPlaneta(0, 0));
      gl.uniform3fv(pt.u.uAtmo, qt.casa.atmo);
      gl.uniform1f(pt.u.uAtmoInt, qt.casa.atmoInt);
      gl.uniform1f(pt.u.uApag, apagado(qt.casa.id, f, idFoco));
      dibujarEsfera(pt);
    }
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);

    // la corona del sol, de cara a la cámara
    var pc = progs.corona;
    gl.useProgram(pc);
    var dz = [ojo[0] - mira[0], ojo[1] - mira[1], ojo[2] - mira[2]];
    var ln = Math.hypot(dz[0], dz[1], dz[2]) || 1; dz = [dz[0] / ln, dz[1] / ln, dz[2] / ln];
    var der = [dz[2], 0, -dz[0]]; ln = Math.hypot(der[0], der[1], der[2]) || 1;
    der = [der[0] / ln, 0, der[2] / ln];
    var arr = [der[1] * dz[2] - der[2] * dz[1], der[2] * dz[0] - der[0] * dz[2], der[0] * dz[1] - der[1] * dz[0]];
    gl.uniformMatrix4fv(pc.u.uVP, false, VP);
    gl.uniform3f(pc.u.uCentro, 0, 0, 0);
    gl.uniform3fv(pc.u.uDer, der);
    gl.uniform3fv(pc.u.uArr, arr);
    gl.uniform1f(pc.u.uEsc, RADIO_SOL * 3.4);
    gl.uniform1f(pc.u.uT, t);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.quadC);
    gl.enableVertexAttribArray(pc.a.aUV);
    gl.vertexAttribPointer(pc.a.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    if (BRILLO && fbo.escena) componer();

    // ── los rótulos siguen a su mundo ────────────────────────────────────────
    if (!enLista()) colocarEtiquetas(puestos, VP, f, idFoco);
    else etiquetas.forEach(function (e) { if (e) { e.style.transform = ''; e.style.opacity = ''; } });
    if (solTexto) solTexto.style.opacity = (1 - f * 0.92).toFixed(2);

    if (!QUIETO.matches) rafId = requestAnimationFrame(bucle);
  }

  /* En el teléfono se pinta a treinta cuadros y no a sesenta: un sistema que
     gira despacio se ve exactamente igual y la mitad del presupuesto se queda
     para que los mundos tengan superficie. En escritorio no se toca nada. */
  function bucle(ahora) {
    rafId = 0;
    if (muerto || !gl) return;
    if (BOLSILLO && ahora - previo < 29) { rafId = requestAnimationFrame(bucle); return; }
    cuadro(ahora);
  }

  /* El objetivo es 60 cuadros en escritorio y 30 en el teléfono, que es a lo
     que se pinta allí a propósito. Se considera lento un cuadro que tarda más
     de una vez y media lo que le toca. Con una de cada tres así, se baja. */
  var calientes = 0;
  function vigilar(ms) {
    /* Los primeros cuadros no cuentan. Ahí dentro está la compilación de los
       shaders, la subida de los búferes y el primer pintado de la nebulosa:
       trabajo que se hace UNA vez y que en cualquier máquina tarda. Juzgar por
       ellos sería retirar el motor en un equipo que lo movía de sobra. */
    if (calientes < 20) { calientes++; return; }
    var objetivo = BOLSILLO ? 33.3 : 16.7;
    muestras++; ventana += ms;
    if (ms > objetivo * 1.55) lentos++;
    /* La ventana se cierra por CUADROS o por TIEMPO, lo que llegue antes.
       Contando solo cuadros, una máquina que va a cinco por segundo tardaría
       veinte segundos en admitir que va a cinco por segundo — o sea, todo el
       rato que alguien va a mirar la portada. Doce cuadros bastan para saberlo
       y dos segundos y medio son el máximo que se le da. */
    if (muestras < 12 || (muestras < 110 && ventana < 2500)) return;
    var mal = lentos / muestras;
    muestras = 0; lentos = 0; ventana = 0;
    if (mal < 0.33) { escalon = 3; return; }       // va bien: se deja de mirar
    escalon++;
    if (escalon === 1) {
      BRILLO = false; soltarFBOs();
      fbo.nebulosa = crearFBO(Math.max(1, lienzo.width >> 1), Math.max(1, lienzo.height >> 1), false, false);
      if (fbo.nebulosa) pintarNebulosa();
    } else if (escalon === 2) {
      RELIEVE = 0; OCT = 3;
      dpr = Math.min(dpr, 1);
      lienzo.width = Math.round(ancho * dpr); lienzo.height = Math.round(alto * dpr);
      medir();
    } else {
      /* Se acabó: ni con todo apagado llega. Se retira sin dejar rastro y
         entra el dibujo plano, que en una máquina así se ve mejor que esto
         a trompicones. */
      retirarse();
    }
  }

  /* RETIRARSE BIEN.
     Un `<canvas>` que ya entregó un contexto WebGL no entrega nunca un
     contexto 2D: el elemento recuerda el suyo para siempre y devuelve null a
     cualquier otro. Así que replegarse no es solo dejar de pintar — hay que
     dar un lienzo LIMPIO al motor que entra, o se queda con un null y la
     sección vacía. Cambiar el nodo entero se lleva de paso los oyentes de
     eventos que quedaran colgando. */
  function retirarse() {
    muerto = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (lienzo && lienzo.parentNode) {
      var nuevo = lienzo.cloneNode(false);
      nuevo.removeAttribute('style');
      lienzo.parentNode.replaceChild(nuevo, lienzo);
      lienzo = nuevo;
    }
    etiquetas.forEach(function (e) {
      if (!e) return;
      e.style.transform = ''; e.style.opacity = ''; e.style.visibility = '';
      e.style.zIndex = ''; e.style.pointerEvents = ''; e._enchufado = false;
    });
    if (solTexto) solTexto.style.opacity = '';
    if (window.CONSTELACION && window.CONSTELACION.arrancar) window.CONSTELACION.arrancar();
    else if (window.REPLEGAR_ECOSISTEMA) window.REPLEGAR_ECOSISTEMA();
  }

  function enAncho() { return ancho > 900; }

  /* Cuando una casa está abierta, las demás no desaparecen: se apagan. Que
     sigan girando ahí detrás es lo que recuerda que son un sistema y no un
     menú desplegable. */
  function apagado(id, f, idFoco) {
    return (id === idFoco) ? 1 : (1 - 0.86 * f);
  }

  function enlazar(p, nombre, buf, n) {
    var loc = p.a[nombre];
    if (loc === undefined || loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
  }

  function dibujarEsfera(p) {
    enlazar(p, 'aPos', bufs.esferaPos, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.esferaIdx);
    gl.drawElements(gl.TRIANGLES, esferaN, gl.UNSIGNED_SHORT, 0);
  }

  function usarQuad(p) {
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.quad);
    gl.enableVertexAttribArray(p.a.aUV);
    gl.vertexAttribPointer(p.a.aUV, 2, gl.FLOAT, false, 0, 0);
  }

  function pasada(prog, origen, destino) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, destino ? destino.fb : null);
    gl.viewport(0, 0, destino ? destino.w : lienzo.width, destino ? destino.h : lienzo.height);
    usarQuad(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, origen.tex);
    return prog;
  }

  function componer() {
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    var p = pasada(progs.brillo, fbo.escena, fbo.brillo1);
    gl.uniform1i(p.u.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    p = pasada(progs.desenfoque, fbo.brillo1, fbo.brillo2);
    gl.uniform1i(p.u.uTex, 0);
    gl.uniform2f(p.u.uPaso, 1 / fbo.brillo1.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    p = pasada(progs.desenfoque, fbo.brillo2, fbo.brillo1);
    gl.uniform1i(p.u.uTex, 0);
    gl.uniform2f(p.u.uPaso, 0, 1 / fbo.brillo2.h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    usarQuad(progs.componer);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fbo.escena.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fbo.brillo1.tex);
    gl.uniform1i(progs.componer.u.uEscena, 0);
    gl.uniform1i(progs.componer.u.uBrillo, 1);
    gl.uniform1f(progs.componer.u.uInt, 0.42);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.activeTexture(gl.TEXTURE0);
  }

  /* Los rótulos NO se pintan en el lienzo: son botones del documento que se
     mueven con su planeta. Se proyectan con la misma matriz que dibujó la
     escena, así que el nombre cae exactamente donde está el mundo, con su
     profundidad y su perspectiva. */
  function colocarEtiquetas(puestos, VP, f, idFoco) {
    var tanMedio = Math.tan(0.30);
    var puestosEnPantalla = [];
    for (var i = 0; i < puestos.length; i++) {
      var q = puestos[i], e = etiquetas[i];
      if (!e) continue;
      var p = q.p;
      var cx = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12];
      var cy = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13];
      var cw = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
      if (cw <= 0.001) { aparcar(e); continue; }
      var sx = (cx / cw * 0.5 + 0.5) * ancho;
      var sy = (0.5 - cy / cw * 0.5) * alto;
      var dist = Math.hypot(p[0] - camOjo[0], p[1] - camOjo[1], p[2] - camOjo[2]);
      var radioPx = (q.casa.radio / Math.max(dist, 0.001)) / tanMedio * (alto / 2);
      var suya = q.casa.id === idFoco;
      // el de detrás del sol se apaga: no se lee un nombre a través de una estrella
      var detras = (p[0] * camOjo[0] + p[2] * camOjo[2]) < -0.25 && Math.hypot(sx - ancho / 2, sy - alto / 2) < radioPx * 4;
      /* Los demás rótulos se apagan DEL TODO con el vuelo, no casi del todo.
         A un siete por ciento seguían legibles como fantasmas encima de la
         escena, y además seguían ocupando su sitio en el documento aunque la
         cámara los hubiera dejado fuera de cuadro. Sus planetas sí siguen
         ahí girando, tenues: el sistema no desaparece, solo se calla. */
      var op = suya ? 1 : (detras ? 0.22 : 0.92) * (1 - f);
      e.style.opacity = op.toFixed(2);
      e.style.zIndex = suya ? 4 : 2;
      e.classList.toggle('abierta', suya && f > 0.25);
      e.style.pointerEvents = (f > 0.25 && !suya) ? 'none' : '';
      if (op < 0.02) { aparcar(e); continue; }
      e.style.visibility = '';
      puestosEnPantalla.push({ e: e, x: sx, y: sy + radioPx + 12, an: e._ancho || 150, suya: suya });
    }
    separarRotulos(puestosEnPantalla);
    for (var j = 0; j < puestosEnPantalla.length; j++) {
      var r = puestosEnPantalla[j];
      r.e.style.transform = 'translate(-50%,0) translate(' + r.x.toFixed(1) + 'px,' + r.y.toFixed(1) + 'px)';
    }
  }

  /* Un rótulo que no se ve se APARCA en el centro, no solo se apaga. Los
     rótulos son elementos absolutos del documento: aunque estén invisibles,
     su caja sigue contando para el tamaño desplazable de la página. Uno que
     se quedó con la última posición que tuvo —la de un planeta que la cámara
     dejó fuera de cuadro— puede estar a mil píxeles de allí, estirando la
     portada por abajo sin que se vea nada que lo explique. */
  function aparcar(e) {
    e.style.opacity = '0';
    e.style.visibility = 'hidden';
    e.style.pointerEvents = 'none';
    e.style.transform = 'translate(-50%,0) translate(' + (ancho / 2) + 'px,' + (alto / 2) + 'px)';
  }

  /* Dos casas que se cruzan en pantalla dejaban sus nombres uno encima de
     otro, y dos nombres pisados no son dos nombres: son cero. Aquí el de
     detrás baja hasta que se puede leer. Se ordena por profundidad para que
     el que baje sea siempre el lejano, y la casa abierta no se mueve nunca. */
  function separarRotulos(lista) {
    lista.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < lista.length; i++) {
      for (var j = 0; j < i; j++) {
        var a = lista[j], b = lista[i];
        if (b.suya) continue;
        var solape = Math.abs(a.x - b.x) < (a.an + b.an) * 0.42;
        if (solape && Math.abs(a.y - b.y) < 24) b.y = a.y + 24;
      }
    }
  }

  /* El ancho de cada rótulo se mide UNA vez y se guarda. Preguntarlo en cada
     cuadro obliga al navegador a recalcular la maquetación sesenta veces por
     segundo para no enterarse de nada nuevo. */
  function medirRotulos() {
    etiquetas.forEach(function (e) { if (e) e._ancho = e.offsetWidth || 150; });
  }

  // ── arranque ───────────────────────────────────────────────────────────────

  function arrancar() {
    contenedor = document.getElementById('constelacion');
    if (!contenedor) return false;
    campo = contenedor.querySelector('.campo');
    lienzo = contenedor.querySelector('canvas');
    if (!campo || !lienzo || !lienzo.getContext) return false;

    try {
      gl = lienzo.getContext('webgl2', {
        alpha: false, antialias: !BOLSILLO, depth: true, stencil: false,
        powerPreference: 'default', failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false
      });
    } catch (e) { gl = null; }
    if (!gl) return false;

    // Sin coma flotante en las texturas no hay brillo, pero sí hay escena.
    if (BRILLO && !gl.getExtension('EXT_color_buffer_float')) BRILLO = false;

    progs.planeta = programa(PLANETA_VS, PLANETA_FS);
    progs.atmo = programa(PLANETA_VS, ATMO_FS);
    progs.sol = programa(PLANETA_VS, SOL_FS);
    progs.corona = programa(CORONA_VS, CORONA_FS);
    progs.anillo = programa(ANILLO_VS, ANILLO_FS);
    progs.orbita = programa(ORBITA_VS, ORBITA_FS);
    progs.estrellas = programa(ESTRELLAS_VS, ESTRELLAS_FS);
    progs.fondo = programa(FONDO_VS, FONDO_FS);
    progs.estampa = programa(PASO_VS, ESTAMPA_FS);
    if (BRILLO) {
      progs.brillo = programa(PASO_VS, BRILLO_FS);
      progs.desenfoque = programa(PASO_VS, DESENFOQUE_FS);
      progs.componer = programa(PASO_VS, COMPONER_FS);
      if (!progs.brillo || !progs.desenfoque || !progs.componer) BRILLO = false;
    }
    var esenciales = ['planeta', 'atmo', 'sol', 'corona', 'anillo', 'orbita', 'estrellas', 'fondo', 'estampa'];
    for (var i = 0; i < esenciales.length; i++) if (!progs[esenciales[i]]) { gl = null; return false; }

    CASAS.forEach(prepararCasa);

    esfera = icosfera(BOLSILLO ? 3 : 4);
    esferaN = esfera.n;
    bufs.esferaPos = buffer(esfera.pos);
    bufs.esferaIdx = buffer(esfera.idx, gl.ELEMENT_ARRAY_BUFFER);
    bufs.quad = buffer(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    bufs.quadC = bufs.quad;
    bufs.anillo = mallaAnillo();
    bufs.orbitas = CASAS.map(mallaOrbita);
    var cielo = sembrarCielo();
    bufs.estPos = buffer(cielo.pos); bufs.estCol = buffer(cielo.col);
    bufs.estVar = buffer(cielo.vr); bufs.estN = cielo.n;

    etiquetas = CASAS.map(function (c) { return contenedor.querySelector('.orbe[data-casa="' + c.id + '"]'); });
    fichas = CASAS.map(function (c) { return contenedor.querySelector('.ficha[data-casa="' + c.id + '"]'); });
    solTexto = contenedor.querySelector('.sol');

    enLista = function () {
      return getComputedStyle(contenedor).getPropertyValue('--modo').trim() === 'lista';
    };

    enchufar();
    medir();
    medirRotulos();
    t0 = performance.now();

    /* Si el navegador se queda sin contexto —una pestaña dormida mucho rato,
       un portátil que cambia de tarjeta, una GPU que se reinicia— lo que no
       puede pasar es que quede un agujero negro donde estaba el ecosistema.
       El bucle se para, los rótulos vuelven a su sitio y el dibujo plano de
       `constelacion.js` se hace cargo con el mismo documento de siempre. */
    lienzo.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      retirarse();
    }, false);

    var relojResize = null;
    addEventListener('resize', function () {
      clearTimeout(relojResize);
      relojResize = setTimeout(function () {
        medir(); medirRotulos();
        if (QUIETO.matches) cuadro(performance.now());
      }, 160);
    });

    contenedor.addEventListener('pointermove', function (ev) {
      var c = contenedor.getBoundingClientRect();
      raton.x = ((ev.clientX - c.left) / c.width - 0.5) * 2;
      raton.y = ((ev.clientY - c.top) / c.height - 0.5) * 2;
    });
    contenedor.addEventListener('pointerleave', function () { raton.x = raton.y = 0; });

    // Con movimiento reducido se pinta UN cuadro y se deja quieto.
    if (QUIETO.matches) { cuadro(performance.now()); return true; }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (fs) {
        fs.forEach(function (fr) {
          if (fr.isIntersecting && !rafId && !muerto) { previo = 0; rafId = requestAnimationFrame(cuadro); }
          else if (!fr.isIntersecting && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        });
      }, { threshold: 0 }).observe(contenedor);
    } else {
      rafId = requestAnimationFrame(bucle);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      else if (!document.hidden && !rafId && !muerto && !QUIETO.matches) { previo = 0; rafId = requestAnimationFrame(cuadro); }
    });

    QUIETO.addEventListener && QUIETO.addEventListener('change', function () {
      if (QUIETO.matches) { if (rafId) cancelAnimationFrame(rafId); rafId = 0; cuadro(performance.now()); }
      else if (!rafId) { previo = 0; rafId = requestAnimationFrame(cuadro); }
    });

    return true;
  }

  return { arrancar: arrancar, casas: CASAS };
})();
