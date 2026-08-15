// ═══ EL NÚCLEO ══════════════════════════════════════════════════════════
// El tablero principal de Orden Global. Sustituye a la lista de fichas de
// Ecosistema.js porque una lista dice "menú de opciones" y esto tiene que
// decir "un organismo vivo, y cada mundo es una app".
//
// Dos capas, y la separación es la clave del rendimiento:
//   · el FONDO es un canvas HTML dentro de un WebView. Una NUBE ESFÉRICA de
//     ~70 neuronas repartidas por la superficie de una esfera que gira
//     despacio, con sus sinapsis, sus pulsos de luz y sus disparos que se
//     contagian de vecina en vecina. Un canvas dibuja 70 puntos, ~150
//     líneas y sus pulsos en un solo hilo; hacer eso con vistas nativas
//     animadas serían cientos de vistas y el teléfono se arrodilla.
//     El WebView NO recibe toques (pointerEvents none).
//   · los NODOS-APP van ENCIMA en React Native de verdad, para que
//     respondan al dedo al instante y con háptica, cosa que un toque
//     rebotado desde el WebView por postMessage nunca consigue.
import React, {
  useCallback, useEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import {
  View, Text, Image, Pressable, Animated, Easing, StyleSheet, PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { useLang } from '../i18n';
import { useAccount, hap } from '../ui';
import { Icon } from '../icons';

// react-native-webview es un módulo NATIVO: vive en el binario, no en el
// paquete de JavaScript. Si la app instalada se compiló sin él, una
// actualización por aire (OTA) que lo importe reventaría esta pantalla al
// abrirla. Se pide aquí y, si no responde, el fondo cae al plan B en RN
// puro: la Junta ve un tablero sereno, no una pantalla roja.
let WebViewNativo = null;
try {
  WebViewNativo = require('react-native-webview').WebView;
} catch (e) {
  WebViewNativo = null;
}

// AsyncStorage TAMBIÉN es un módulo nativo. En la práctica siempre está —lo
// importan accounts.js y api.js, que se cargan al arrancar la app—, pero la
// misma red va debajo: si algún día no respondiera, la colocación deja de
// recordarse entre sesiones y ya está. Los nodos se siguen arrastrando. Un
// adorno de memoria no vale una pantalla en rojo.
let ALMACEN = null;
try {
  ALMACEN = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  ALMACEN = null;
}

// La versión va en la llave a propósito: si mañana cambian los mundos o el
// formato, la colocación vieja se ignora sola en vez de colocar nodos donde
// ya no hay nada.
const LLAVE_COLOCACION = 'og.nucleo.colocacion.v1';

// ── LOS LOGOS DE MARCA ──────────────────────────────────────────────────
// `require` con ruta literal y en el cuerpo del módulo porque Metro resuelve
// las imágenes al empaquetar: una ruta calculada no se empaqueta y en el
// teléfono llega como `undefined`.
const LOGOS = {
  wallet: require('../../assets/veta-wallet.png'),
  pay: require('../../assets/mytokenpay.png'),
  gid: require('../../assets/genesis-id.png'),
};

const TXT = {
  es: {
    manana: 'Buenos días', tarde: 'Buenas tardes', noche: 'Buenas noches',
    invitado: 'bienvenido',
    pista: 'Toca un mundo para entrar · arrástralo para moverlo',
    reponer: 'volver a poner en su sitio',
    irReponer: 'Devolver los mundos a su posición original',
    chat: 'Chat', wallet: 'Veta Wallet', pay: 'MyTokenPay',
    gid: 'Genesis ID', ajustes: 'Ajustes',
    irChat: 'Abrir el chat de Orden Global',
    irWallet: 'Abrir Veta Wallet, tu billetera',
    irPay: 'Abrir MyTokenPay, tu negocio',
    irGid: 'Abrir tu Genesis ID',
    irAjustes: 'Abrir los ajustes',
  },
  en: {
    manana: 'Good morning', tarde: 'Good afternoon', noche: 'Good evening',
    invitado: 'welcome',
    pista: 'Tap a world to enter · drag it to move it',
    reponer: 'put them back',
    irReponer: 'Return the worlds to their original places',
    chat: 'Chat', wallet: 'Veta Wallet', pay: 'MyTokenPay',
    gid: 'Genesis ID', ajustes: 'Settings',
    irChat: 'Open the Orden Global chat',
    irWallet: 'Open Veta Wallet, your wallet',
    irPay: 'Open MyTokenPay, your business',
    irGid: 'Open your Genesis ID',
    irAjustes: 'Open settings',
  },
};

// ── LOS CINCO MUNDOS ────────────────────────────────────────────────────
// `x` e `y` son fracciones del tablero, no píxeles: la constelación se ve
// igual en un teléfono estrecho y en una tableta. La billetera va en el
// centro y más grande porque es el corazón — el dinero — y el ojo tiene
// que caer ahí primero. La esfera de neuronas del fondo se centra en ELLA
// (ver CY en el canvas), así que la billetera no es sólo el nodo grande:
// es literalmente el centro de la red.
// NO hay "cobrar con QR": eso vive DENTRO de MyTokenPay, que es de donde
// nunca debió salir.
//
// LA LENTE. Dentro de cada esfera hay un disco OSCURO recortado en círculo, y
// ahí vive la marca. Nace de un problema concreto: los logos reales de
// MyTokenPay y Genesis ID vienen en PNG cuadrado y SIN transparencia, sobre
// su propio fondo casi negro. Pegados tal cual sobre una esfera clara se ven
// como un sello cuadrado encima de una canica — exactamente lo que José no
// quiere. Con la lente, ese fondo del PNG ES el disco: se recorta en círculo,
// no hay borde que delate el cuadrado, y el logo queda flotando en su propia
// noche. `lente` copia el fondo que trae cada imagen para que el recorte no
// deje ni una uña de color distinto, y `zoom` la agranda hasta que la marca
// llena el disco en vez de nadar en él.
// Los `zoom` NO son a ojo: se midió en cada PNG a qué distancia del centro
// llega el píxel más lejano de la marca y se dejó un margen por debajo del
// tope. Pasarse recorta una esquina del logo contra el círculo, que es
// justo el defecto que esto viene a arreglar.
// Chat y Ajustes no tienen logo, pero llevan la MISMA lente con su icono
// dentro: el lenguaje visual es uno solo, no dos.
const MUNDOS = [
  {
    // El oro de la billetera es el degradado de marca tal cual (G.gold), no
    // una copia parecida: es la esfera que la Junta va a mirar primero.
    // La V de Veta viene con transparencia, así que va "contain" y sin
    // recortar: se apoya en la lente en vez de rellenarla.
    id: 'wallet', icono: 'wallet', x: 0.50, y: 0.47, tam: 1.00,
    grad: G.gold, halo: C.goldLt, tinta: C.darkText,
    lente: '#05201B', zoom: 0.84,   // tope medido: 0.89
    ritmo: 2600, flota: 4.5, retraso: 0,
  },
  {
    id: 'chat', icono: 'chatbubbles', x: 0.19, y: 0.17, tam: 0.72,
    grad: ['#FBE0D4', '#E0937A', '#8A4A38'], halo: '#E0937A', tinta: '#3B1A11',
    lente: '#20100A', zoom: 0,
    ritmo: 3100, flota: 5.5, retraso: 420,
  },
  {
    // El verde menta de antes peleaba con la marca de verdad: MyTokenPay es
    // cian, azul y violeta. La esfera pasa a ser del color del logo que
    // sostiene, porque una esfera verde con un logo cian dentro se lee como
    // una pegatina de otra app. `lente` es el negro azulado exacto del PNG.
    id: 'pay', icono: 'storefront', x: 0.81, y: 0.21, tam: 0.76,
    grad: ['#D8F7FF', '#5FC6EA', '#453398'], halo: '#5FC6EA', tinta: '#07203A',
    lente: '#0A0812', zoom: 1.15,   // tope medido: 1.23
    ritmo: 2900, flota: 5, retraso: 900,
  },
  {
    // El emblema de Genesis ID es ORO sobre verde profundo. La esfera repite
    // ese verde para que el sello dorado sea lo único que brilla dentro; el
    // azul pálido de antes le robaba el oro.
    id: 'gid', icono: 'finger-print', x: 0.18, y: 0.79, tam: 0.72,
    grad: ['#D6EBE2', '#63A493', '#123B39'], halo: '#7FD8C4', tinta: '#062A26',
    lente: '#062123', zoom: 1.42,   // tope medido: 1.56
    ritmo: 3400, flota: 5.5, retraso: 1500,
  },
  {
    // Ajustes se va al gris pizarra: no es una marca, es la herramienta. Y de
    // paso deja de parecerse al verde nuevo de Genesis ID, que antes tenía
    // casi el mismo tono.
    id: 'ajustes', icono: 'settings-sharp', x: 0.82, y: 0.81, tam: 0.68,
    grad: ['#E4E8EE', '#93A0AE', '#2E3844'], halo: '#A9B6C4', tinta: '#161C24',
    lente: '#0C1116', zoom: 0,
    ritmo: 3800, flota: 4.5, retraso: 2100,
  },
];

// Se reutiliza el MISMO objeto para "este nodo no se ha movido": así la
// comparación de props de los hilos memoizados no ve un objeto nuevo por
// render y no repinta lo que no ha cambiado.
const SIN_MOVER = { x: 0, y: 0 };
// Identidad estable para "no hay nada guardado": si fuera un `{}` literal en
// el cuerpo del componente, cada render lo daría por cambiado.
const SIN_COLOCACION = {};

// Los colores del tema vienen en hexadecimal y los hilos necesitan alfa.
// El tema MEZCLA formatos (C.gold es hex, C.line ya es rgba): si a esto le
// entra un rgba y se le pasa por parseInt, sale un color inventado y nadie
// se entera. Por eso lo que no sea un hex de 3 o 6 se devuelve tal cual.
function conAlfa(color, a) {
  const s = String(color).trim();
  if (s[0] !== '#') return s;
  const h = s.slice(1);
  const seis = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(seis)) return s;
  const n = parseInt(seis, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── EL FONDO: la esfera de neuronas ─────────────────────────────────────
// El HTML es una constante del módulo, no algo que se calcule al pintar:
// si la cadena cambiara de identidad en cada render el WebView recargaría
// la página entera y la red arrancaría de cero a cada rato.
const HTML_NEURONAS = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
 html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}
 canvas{display:block;width:100%;height:100%}
</style>
</head><body><canvas id="lienzo"></canvas>
<script>
(function(){
 var C=document.getElementById('lienzo'); if(!C||!C.getContext) return;
 var g=C.getContext('2d');
 /* Por encima de 2 el ojo ya no distingue nada en un punto de luz difuso y
    en cambio la GPU pinta el cuadruple de pixeles. Techo duro en 2. */
 var DPR=Math.min(window.devicePixelRatio||1,2);
 var W=0,H=0,ESC=0,CX=0,CY=0,VELO=null;
 var az=Math.random;
 var reloj=(window.performance&&performance.now)
   ? function(){return performance.now();}
   : function(){return +new Date();};

 /* ═══ 1. LA NUBE ESFERICA ═════════════════════════════════════════════
    Fibonacci: repartir N puntos avanzando siempre el ANGULO AUREO es la
    unica forma barata de cubrir una esfera sin que se amontonen en los
    polos, que es exactamente lo que pasa si se sortean latitud y longitud
    al azar. Los puntos quedan a distancias casi iguales, y de ahi sale que
    el cableado de vecinas se lea como una malla y no como una maraña. */
 var N=70, PER=2.62;
 var F_MIN=PER/(PER+1), F_RAN=PER/(PER-1)-F_MIN;
 var AUREO=Math.PI*(3-Math.sqrt(5));
 var NEU=[];
 for(var i=0;i<N;i++){
   var yy=1-(i/(N-1))*2;
   var an=Math.sqrt(Math.max(0,1-yy*yy));
   var th=AUREO*i;
   /* Cada neurona se despeina un pelin hacia dentro o hacia fuera: la
      esfera perfecta de Fibonacci se lee como un modelo 3D de alambre, y
      lo que hay que ver es un cerebro. */
   var rad=0.955+az()*0.09;
   NEU.push({
     x:Math.cos(th)*an*rad, y:yy*rad, z:Math.sin(th)*an*rad,
     r:0.85+az()*0.80,
     oro:(i%6===0),          /* una de cada seis es ORIGEN: las doradas */
     sx:0, sy:0, f:1, p:0,
     disp:0, carga:0, ar:[]
   });
 }
 function d2(a,b){ var dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z; return dx*dx+dy*dy+dz*dz; }

 /* ═══ 2. EL CABLEADO, UNA SOLA VEZ ════════════════════════════════════
    La esfera gira ENTERA y rigida, asi que quien es vecina de quien no
    cambia nunca. El grafo se calcula al arrancar (70x70 comparaciones, una
    vez) y en cada cuadro solo se recorre una lista fija de ~150 aristas.
    Es la diferencia entre 2.400 comparaciones por cuadro y ninguna. */
 var K=4, ARIS=[], vistos={};
 function porD(u,v){ return u.d-v.d; }
 for(var a1=0;a1<N;a1++){
   var cer=[];
   for(var b1=0;b1<N;b1++){
     if(b1===a1) continue;
     var dd=d2(NEU[a1],NEU[b1]);
     if(cer.length<K){ cer.push({j:b1,d:dd}); if(cer.length===K) cer.sort(porD); }
     else if(dd<cer[K-1].d){ cer[K-1]={j:b1,d:dd}; cer.sort(porD); }
   }
   for(var m1=0;m1<cer.length;m1++){
     var b2=cer[m1].j, lo=a1<b2?a1:b2, hi=a1<b2?b2:a1, cl=lo*128+hi;
     if(vistos[cl]) continue; vistos[cl]=1;
     ARIS.push({a:lo,b:hi,fa:az()*6.283,ve:0.00040+az()*0.00060,largo:0});
   }
 }
 /* Diez axones LARGOS que cruzan la esfera por dentro. Sin ellos esto es
    una pelota geodesica — un objeto; con ellos hay trafico atravesando el
    volumen y se lee como algo que piensa. Van mas apagados a proposito. */
 for(var q1=0;q1<10;q1++){
   var a2=(az()*N)|0, b3=(az()*N)|0;
   if(a2===b3) continue;
   var lo2=a2<b3?a2:b3, hi2=a2<b3?b3:a2, cl2=lo2*128+hi2;
   if(vistos[cl2]) continue; vistos[cl2]=1;
   ARIS.push({a:lo2,b:hi2,fa:az()*6.283,ve:0.00024+az()*0.00030,largo:1});
 }
 /* Cada neurona guarda por que sinapsis puede disparar: cuando se enciende
    no hay que buscar a sus vecinas, ya las tiene. */
 for(var e1=0;e1<ARIS.length;e1++){ NEU[ARIS[e1].a].ar.push(e1); NEU[ARIS[e1].b].ar.push(e1); }

 /* ═══ 3. EL PUNTO DE LUZ, PRECOCINADO ═════════════════════════════════
    shadowBlur por elemento es el asesino de los canvas en movil: obliga a
    la GPU a un desenfoque real por cada figura. Aqui se pinta UN degradado
    radial en un lienzo de 64x64 al arrancar y luego se estampa escalado.
    Estampar mas grande y mas tenue es, para el ojo, estar fuera de foco —
    que es justo lo que tienen que parecer las neuronas del fondo. */
 function sello(rgb){
   var c=document.createElement('canvas'); c.width=64; c.height=64;
   var x=c.getContext('2d');
   var gr=x.createRadialGradient(32,32,0,32,32,32);
   gr.addColorStop(0,'rgba('+rgb+',0.95)');
   gr.addColorStop(0.20,'rgba('+rgb+',0.44)');
   gr.addColorStop(0.52,'rgba('+rgb+',0.12)');
   gr.addColorStop(1,'rgba('+rgb+',0)');
   x.fillStyle=gr; x.fillRect(0,0,64,64);
   return c;
 }
 var SP_VERDE=sello('120,232,210'), SP_ORO=sello('240,203,128');

 function medir(){
   W=window.innerWidth||360; H=window.innerHeight||640;
   C.width=Math.round(W*DPR); C.height=Math.round(H*DPR);
   C.style.width=W+'px'; C.style.height=H+'px';
   g.setTransform(DPR,0,0,DPR,0,0);
   /* El centro NO es el centro de la pantalla: la esfera se centra donde
      cae la esfera-billetera, por debajo de la cabecera. Asi la billetera
      es el nucleo del cerebro y no un adorno pegado encima. */
   CX=W*0.5; CY=H*0.55;
   /* Un solo radio para alto y ancho: si se usaran fracciones distintas la
      esfera saldria ovalada y el volumen se pierde al instante. */
   ESC=Math.min(W*0.44,H*0.30);
   /* El velo se construye UNA vez por medida. Crear un degradado radial en
      cada cuadro es de las pocas cosas que de verdad funden la bateria de
      un telefono de gama baja. */
   VELO=g.createRadialGradient(CX,CY,0,CX,CY,Math.max(W,H)*0.74);
   VELO.addColorStop(0,'rgba(18,74,70,0.50)');
   VELO.addColorStop(0.34,'rgba(10,46,47,0.30)');
   VELO.addColorStop(0.72,'rgba(4,18,20,0.13)');
   VELO.addColorStop(1,'rgba(0,0,0,0)');
 }

 /* ═══ 4. GIRO Y PERSPECTIVA ═══════════════════════════════════════════ */
 var rY=0, INCL=-0.34, bal=0;
 function proyectar(){
   var c1=Math.cos(rY), s1=Math.sin(rY);
   var inc=INCL+bal, c2=Math.cos(inc), s2=Math.sin(inc);
   for(var i=0;i<N;i++){
     var n=NEU[i];
     /* Primero gira sobre su eje, despues se inclina: asi el eje de giro
        queda ladeado y se ven los polos, que es lo que delata que hay un
        volumen girando y no un circulo de puntos moviendose. */
     var x=n.x*c1-n.z*s1, z1=n.x*s1+n.z*c1;
     var y=n.y*c2-z1*s2, z=n.y*s2+z1*c2;
     var f=PER/(PER+z);
     n.sx=CX+x*ESC*f; n.sy=CY+y*ESC*f; n.f=f;
     /* p: 0 = al fondo del todo, 1 = pegada al cristal. De este UNICO
        numero salen el tamaño, la opacidad y el desenfoque. */
     var p=(f-F_MIN)/F_RAN;
     n.p=p<0?0:(p>1?1:p);
   }
 }

 /* ═══ 5. DISPAROS Y CONTAGIO ══════════════════════════════════════════
    Esto es lo que separa una red VIVA de un adorno: una neurona se
    enciende, manda pulsos por sus sinapsis, y la que los recibe acumula
    carga hasta que ella tambien se enciende. */
 /* El tope acota el peor caso, pero holgado: si se corta a mitad de una
    cascada hay pulsos que nacen y no llegan a ninguna parte, y eso es
    exactamente lo contrario de lo que la escena tiene que contar. En
    treinta segundos de vida el pico medido ronda los 45. */
 var PULSOS=[], TOPE=96;
 function disparar(i,gen){
   var n=NEU[i];
   if(n.disp>0.6) return;          /* ya esta encendida: no se apila */
   n.disp=1; n.carga=0;
   var li=n.ar;
   for(var q=0;q<li.length;q++){
     if(PULSOS.length>=TOPE) return;
     var ei=li[q], E=ARIS[ei];
     /* En el contagio no salen todos: un disparo que enciende siempre sus
        cuatro sinapsis se ve mecanico, como una animacion en bucle. */
     if(gen>0 && az()<0.35) continue;
     PULSOS.push({
       e:ei, dir:(E.a===i)?1:-1, t:0,
       dur:(E.largo?900:520)+az()*280,
       oro:(n.oro||az()<0.62),     /* el oro es el acento de marca, domina */
       gen:gen
     });
   }
 }

 /* ═══ 6. EL CUADRO ════════════════════════════════════════════════════ */
 var NB=5;
 var CUBOS=[[],[],[],[],[]];
 var TINTA=['rgba(58,168,156,0.050)','rgba(66,186,172,0.100)',
            'rgba(78,206,188,0.165)','rgba(96,224,204,0.245)',
            'rgba(134,244,220,0.350)'];
 /* Las estelas de los pulsos tambien se agrupan por brillo: ocho stroke()
    como mucho, en vez de uno por pulso. */
 var EST=[[],[],[],[],[],[],[],[]];
 var EST_COL=['rgba(255,206,122,0.10)','rgba(255,206,122,0.22)',
              'rgba(255,212,136,0.38)','rgba(255,224,160,0.58)',
              'rgba(126,240,214,0.09)','rgba(126,240,214,0.19)',
              'rgba(142,246,222,0.33)','rgba(172,250,232,0.50)'];

 var ultimo=0, objetivo=1000/60, podar=false, techo30=false;
 /* Arrancan en -1 y no en 0: hay WebViews de Android que redondean
    performance.now() al milisegundo, asi que el primer coste medido puede
    ser 0 clavado — y una media que empieza en 0 con "si es 0, siembrala"
    no arranca nunca y el termometro se queda ciego para siempre. */
 var emaCosto=-1, emaSalto=-1, malo=0, bueno=0, lento=0;
 var desdeSemilla=0, proxSemilla=600;

 function cuadro(ts){
   requestAnimationFrame(cuadro);          /* UN solo bucle para todo */
   if(document.hidden){ ultimo=0; return; }
   if(!ultimo){ ultimo=ts; return; }
   var dt=ts-ultimo;
   if(dt<objetivo-1.5) return;             /* el freno de mano de los fps */
   ultimo=ts;
   if(dt>90) dt=90;                        /* al volver de segundo plano no se salta */

   var t0=reloj();

   rY+=0.000105*dt;                        /* una vuelta entera por minuto */
   bal=0.055*Math.sin(ts*0.00011);         /* y un cabeceo que respira */

   /* Los disparos espontaneos son la chispa: sin ellos la red se apaga en
      cuanto se acaba el ultimo contagio. */
   desdeSemilla+=dt;
   if(desdeSemilla>proxSemilla){
     desdeSemilla=0; proxSemilla=520+az()*700;
     disparar((az()*N)|0,0);
   }
   for(var i0=0;i0<N;i0++){
     var n0=NEU[i0];
     if(n0.disp>0){ n0.disp-=dt/540; if(n0.disp<0) n0.disp=0; }
     if(n0.carga>0){ n0.carga-=dt/3000; if(n0.carga<0) n0.carga=0; }
   }
   proyectar();

   g.globalCompositeOperation='source-over';
   g.globalAlpha=1;
   g.fillStyle='#000'; g.fillRect(0,0,W,H);
   g.fillStyle=VELO;  g.fillRect(0,0,W,H);
   /* Aditivo: donde se cruzan dos hilos la luz se suma, como en el vidrio.
      Ademas quita la necesidad de ordenar por z: sumar no depende del
      orden, asi que nos ahorramos un sort de 70 elementos por cuadro. */
   g.globalCompositeOperation='lighter';

   /* ── sinapsis ── */
   for(var k0=0;k0<NB;k0++) CUBOS[k0].length=0;
   for(var e2=0;e2<ARIS.length;e2++){
     var E2=ARIS[e2], A=NEU[E2.a], B=NEU[E2.b];
     var prof=(A.p+B.p)*0.5;
     /* Cada sinapsis se enciende y se apaga con su fase propia: media onda
        encendida, media apagada. La red nunca parpadea a coro. */
     var on=Math.sin(ts*E2.ve+E2.fa); if(on<0) on=0; on*=on;
     /* La que dispara enciende TODAS las suyas de golpe: ese destello en
        estrella es lo que hace ver el camino del contagio. */
     var ex=A.disp>B.disp?A.disp:B.disp;
     if(ex>on) on=ex;
     var v=on*(0.14+prof*0.96);
     if(E2.largo) v*=0.55;
     if(v<=0.035) continue;
     var k1=(v*NB)|0; if(k1>NB-1) k1=NB-1;
     CUBOS[k1].push(A.sx,A.sy,B.sx,B.sy);
   }
   g.lineWidth=0.7;
   for(var k2=0;k2<NB;k2++){
     var cu=CUBOS[k2]; if(!cu.length) continue;
     g.strokeStyle=TINTA[k2];
     g.beginPath();
     for(var q2=0;q2<cu.length;q2+=4){ g.moveTo(cu[q2],cu[q2+1]); g.lineTo(cu[q2+2],cu[q2+3]); }
     g.stroke();
   }

   /* ── neuronas ── */
   for(var i1=0;i1<N;i1++){
     var n1=NEU[i1], p1=n1.p, ds=n1.disp;
     var nuc=n1.r*(0.35+p1*1.25)*(1+ds*0.55);
     /* El halo de las de atras es proporcionalmente enorme y casi
        transparente (desenfoque); el de las de delante, ceñido y vivo. */
     var rh=nuc*(3.6-p1*1.8)+2;
     var op=(0.055+p1*0.200)*(1+ds*1.9); if(op>0.85) op=0.85;
     /* Al podar, las del fondo pierden el halo: son las que menos se ven y
        las que mas pixeles cuestan (el sello estampado grande y tenue). */
     if(!(podar&&p1<0.28)){
       g.globalAlpha=op;
       g.drawImage(n1.oro?SP_ORO:SP_VERDE, n1.sx-rh, n1.sy-rh, rh*2, rh*2);
     }
     /* El nucleo nitido solo lo llevan las de delante: una neurona del
        fondo con el punto duro dibujado rompe la sensacion de profundidad. */
     if(p1>0.16){
       g.globalAlpha=1;
       var co=(p1-0.16)*0.72+ds*0.30; if(co>0.95) co=0.95;
       g.fillStyle=n1.oro
         ? 'rgba(250,230,178,'+co.toFixed(3)+')'
         : 'rgba(190,248,232,'+co.toFixed(3)+')';
       g.beginPath(); g.arc(n1.sx,n1.sy,nuc*0.82,0,6.2832); g.fill();
     }
   }

   /* ── pulsos ── */
   for(var k3=0;k3<8;k3++) EST[k3].length=0;
   for(var u=PULSOS.length-1;u>=0;u--){
     var s=PULSOS[u];
     s.t+=dt/s.dur;
     if(s.t>=1){
       PULSOS.splice(u,1);
       var Ez=ARIS[s.e], des=(s.dir>0)?Ez.b:Ez.a, D=NEU[des];
       /* El pulso LLEGA y deja carga. Cuando la carga desborda el umbral, la
          vecina dispara: eso es el contagio, y es lo que se tiene que
          entender al mirar la pantalla.
          La carga es VARIABLE (0.55 a 1.07) a proposito: si fuera fija, o
          nunca llega a 1 y no hay contagio nunca, o siempre llega y arde
          la esfera entera. Asi prende una de cada dos y la cadena avanza a
          saltos, que es como se ve una red de verdad. Lo que no prende se
          queda cargado y lo prende el siguiente pulso que pase. */
       D.carga+=0.55+az()*0.52;
       /* Se corta a la tercera generacion: sin tope, un solo disparo
          incendia la esfera entera y deja de leerse como una red. */
       if(D.carga>=1 && s.gen<3 && az()<0.72) disparar(des,s.gen+1);
       continue;
     }
     var E3=ARIS[s.e];
     var P=(s.dir>0)?NEU[E3.a]:NEU[E3.b];
     var Q=(s.dir>0)?NEU[E3.b]:NEU[E3.a];
     var pr=(P.p+Q.p)*0.5;
     /* Se enciende al salir y se apaga al llegar: un punto que aparece y
        desaparece de golpe se ve como un error de dibujo, no como luz. */
     var o2=Math.sin(s.t*3.1416)*(0.30+pr*0.70);
     if(o2<=0.02) continue;
     var x1=P.sx+(Q.sx-P.sx)*s.t, y1=P.sy+(Q.sy-P.sy)*s.t;
     var co2=s.t-0.26; if(co2<0) co2=0;
     var x0=P.sx+(Q.sx-P.sx)*co2, y0=P.sy+(Q.sy-P.sy)*co2;
     var ni=(o2*4)|0; if(ni>3) ni=3;
     EST[(s.oro?0:4)+ni].push(x0,y0,x1,y1);
     if(o2>0.18){
       var rc=(1.5+pr*2.0)*(0.5+o2*0.8)+1.3;
       g.globalAlpha=o2*0.9;
       g.drawImage(s.oro?SP_ORO:SP_VERDE, x1-rc, y1-rc, rc*2, rc*2);
     }
   }
   g.globalAlpha=1;
   g.lineWidth=1.25;
   for(var k5=0;k5<8;k5++){
     var es=EST[k5]; if(!es.length) continue;
     g.strokeStyle=EST_COL[k5];
     g.beginPath();
     for(var q5=0;q5<es.length;q5+=4){ g.moveTo(es[q5],es[q5+1]); g.lineTo(es[q5+2],es[q5+3]); }
     g.stroke();
   }

   /* ── el termometro ──────────────────────────────────────────────────
      Se miden DOS cosas porque son dos averias distintas y el remedio no
      es el mismo:
       · lo que TARDA el cuadro (emaCosto): si nos pasamos de presupuesto,
         la culpa es nuestra. Se poda el dibujo y se baja a 30. En cuanto
         el coste vuelve a estar holgado, se recupera todo.
       · el hueco ENTRE cuadros con el coste bajo (emaSalto): entonces no
         hay nada que podar — la pantalla o el sistema no dan 60 y punto.
         Se fija el techo en 30 y NO se vuelve a intentar: reintentarlo
         cada pocos segundos hacia que el fondo cambiara de calidad una y
         otra vez, y ese parpadeo se nota muchisimo mas que ir siempre
         a 30 cuadros. */
   var costo=reloj()-t0;
   emaCosto=emaCosto<0?costo:emaCosto*0.92+costo*0.08;
   emaSalto=emaSalto<0?dt:emaSalto*0.90+dt*0.10;

   if(!techo30){
     /* Un segundo y medio seguido, no un bache: durante una transicion de
        pantalla cualquier telefono pierde cuadros y seria injusto
        condenarlo a 30 para siempre por eso. */
     if(emaSalto>objetivo*1.8&&emaCosto<7) lento+=dt; else lento=0;
     if(lento>1500){ techo30=true; objetivo=1000/30; }
   }
   if(!podar){
     if(emaCosto>11) malo+=dt; else malo=0;
     if(malo>600){ podar=true; objetivo=1000/30; bueno=0; }
   }else{
     if(emaCosto<5.5) bueno+=dt; else bueno=0;
     if(bueno>4000){ podar=false; objetivo=techo30?1000/30:1000/60; malo=0; }
   }
 }

 medir();
 /* Dos chispas de arranque: la red ya esta viva en el primer segundo, sin
    esperar a que salte la primera semilla. */
 disparar((az()*N)|0,0);
 disparar((az()*N)|0,0);
 window.addEventListener('resize',medir);
 document.addEventListener('visibilitychange',function(){ ultimo=0; });
 requestAnimationFrame(cuadro);
})();
</script>
</body></html>`;

// El `source` es una constante del módulo por la misma razón que el HTML: al
// arrastrar un nodo el tablero se repinta muchas veces por segundo, y si esta
// pantalla le pasara al WebView un objeto NUEVO en cada repintado, el WebView
// lo tomaría por otra página y recargaría la red de neuronas sin parar. Con
// una constante, el fondo ni se entera de que hay un dedo arrastrando.
const FUENTE_NEURONAS = { html: HTML_NEURONAS, baseUrl: '' };

// Plan B del fondo, en React Native puro. Es la MISMA esfera de Fibonacci
// con la misma inclinación y la misma perspectiva, pero congelada: si el
// plan B fuera un fondo distinto, el salto entre un teléfono con WebView y
// otro sin él se notaría como un fallo, no como una versión sobria.
// Todo determinista (nada de Math.random) para que sea SIEMPRE igual.
const ESFERA_FIJA = [];
(function sembrar() {
  const n = 48;
  const aureo = Math.PI * (3 - Math.sqrt(5));
  const ci = Math.cos(-0.34);
  const si = Math.sin(-0.34);
  for (let i = 0; i < n; i += 1) {
    const y0 = 1 - (i / (n - 1)) * 2;
    const an = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const th = aureo * i;
    const x = Math.cos(th) * an;
    const z0 = Math.sin(th) * an;
    const y = y0 * ci - z0 * si;
    const z = y0 * si + z0 * ci;
    const f = 2.62 / (2.62 + z);
    const p = Math.max(0, Math.min(1, (f - 2.62 / 3.62) / (2.62 / 1.62 - 2.62 / 3.62)));
    ESFERA_FIJA.push({ x: x * f, y: y * f, d: 1.1 + p * 3.6, o: 0.05 + p * 0.32, oro: i % 6 === 0 });
  }
}());

function FondoQuieto() {
  // Se mide el hueco porque el radio tiene que ser el MISMO en píxeles a lo
  // ancho y a lo alto: con porcentajes la esfera saldría ovalada.
  const [caja, setCaja] = useState({ w: 0, h: 0 });

  // Las posiciones NO se animan: mover 48 vistas por cuadro es justo lo que
  // un fondo de emergencia no puede permitirse. Lo único que late son DOS
  // opacidades — las verdes y las doradas, en contrafase — con controlador
  // nativo. Cuesta dos animaciones en total y basta para que la esfera
  // parezca respirar en vez de parecer una captura de pantalla.
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    bucle.start();
    return () => bucle.stop();
  }, [pulso]);
  const opVerde = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.70, 1] });
  const opOro = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 0.58] });

  const puntos = useMemo(() => {
    if (!caja.w || !caja.h) return [];
    const esc = Math.min(caja.w * 0.44, caja.h * 0.30);
    return ESFERA_FIJA.map((n) => ({
      ...n,
      px: caja.w * 0.5 + n.x * esc,
      py: caja.h * 0.55 + n.y * esc,
    }));
  }, [caja.w, caja.h]);

  const capa = (oro) => (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: oro ? opOro : opVerde }]}>
      {puntos.filter((p) => !!p.oro === oro).map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.px - p.d / 2,
            top: p.py - p.d / 2,
            width: p.d, height: p.d, borderRadius: p.d / 2,
            opacity: p.o,
            backgroundColor: oro ? C.goldLt : '#7EECD4',
          }}
        />
      ))}
    </Animated.View>
  );

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setCaja((p) => (Math.abs(p.w - width) < 1 && Math.abs(p.h - height) < 1 ? p : { w: width, h: height }));
      }}>
      <LinearGradient
        colors={['rgba(18,74,70,0.50)', 'rgba(10,46,47,0.26)', 'rgba(0,0,0,0)']}
        style={st.velo} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      />
      {capa(false)}
      {capa(true)}
    </View>
  );
}

// Frontera de error alrededor del WebView: si el componente nativo no está
// en el binario, React lanza al RENDERIZARLO (no al importarlo), y sin esto
// se llevaría por delante toda la pantalla. Aquí sólo se cae el fondo.
// PURE y no Component: el tablero se repinta en cada cuadro mientras un dedo
// arrastra un nodo, y sin esta barrera el WebView entraría en la comparación
// de React sesenta veces por segundo para nada. No recibe props, así que la
// comparación superficial siempre da "igual" y el fondo se queda quieto.
class Fondo extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = { roto: !WebViewNativo };
  }

  static getDerivedStateFromError() {
    return { roto: true };
  }

  componentDidCatch() {
    // El fallo ya está contado en el estado; no hay nada que avisar al
    // usuario: el tablero sigue funcionando con el fondo de reserva.
  }

  render() {
    if (this.state.roto) return <FondoQuieto />;
    const WV = WebViewNativo;
    return (
      // La View de fuera es la que de verdad garantiza que ningún toque
      // llegue al WebView: el pointerEvents del propio WebView no siempre
      // se respeta en Android.
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} pointerEvents="none">
        <WV
          source={FUENTE_NEURONAS}
          originWhitelist={['*']}
          pointerEvents="none"
          style={st.web}
          containerStyle={st.web}
          scrollEnabled={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          javaScriptEnabled
          domStorageEnabled={false}
          cacheEnabled={false}
          // El canvas se anima solo: con capa por hardware Android lo compone
          // en la GPU en vez de repintarlo en el hilo de la interfaz.
          androidLayerType="hardware"
          setBuiltInZoomControls={false}
          allowsInlineMediaPlayback
          onError={() => this.setState({ roto: true })}
          onRenderProcessGone={() => this.setState({ roto: true })}
        />
      </View>
    );
  }
}

// ── LOS HILOS ───────────────────────────────────────────────────────────
// Cada mundo cuelga del núcleo con un hilo. Es lo que convierte cinco
// botones sueltos en cinco terminaciones de la MISMA red: el fondo late y
// los mundos están enganchados a él, no flotando por encima.
// Se dibuja con Views rotadas (cuatro, y ninguna recibe toques) en vez de
// traer react-native-svg sólo para esto.
//
// Un hilo por separado y MEMOIZADO. Mientras un dedo arrastra un nodo, este
// componente se repinta a la velocidad de la pantalla; si los cuatro hilos se
// recalcularan cada vez, se estarían rehaciendo tres degradados que no se han
// movido ni un píxel. Todas las props son números y cadenas salvo `brillo`,
// que es un Animated.Value de identidad fija, así que la comparación
// superficial de React.memo basta: sólo se rehace el hilo que se estira.
const Hilo = React.memo(function Hilo({ ax, ay, bx, by, tono, brillo, tenso }) {
  const largo = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
  // Nodo casi encima del núcleo: no queda hilo que dibujar, y un segmento de
  // tres píxeles girando se ve como un parpadeo sucio.
  if (largo < 10) return null;
  const ang = Math.atan2(by - ay, bx - ax);
  const gr = Math.round(tenso ? 3 : 2);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        // Se coloca por el CENTRO del segmento y se gira sobre su
        // propio centro: así no hace falta transformOrigin, que no
        // está en todas las versiones de React Native.
        left: (ax + bx) / 2 - largo / 2,
        top: (ay + by) / 2 - gr / 2,
        width: largo,
        height: gr,
        opacity: brillo,
        transform: [{ rotate: `${ang}rad` }],
      }}>
      <LinearGradient
        // El hilo del nodo que se está arrastrando se enciende: es la señal de
        // que lo que se mueve sigue colgando del núcleo, que la sinapsis se
        // ESTIRA en vez de romperse.
        colors={tenso
          ? [conAlfa(C.gold, 0.10), conAlfa(C.goldLt, 0.62), conAlfa(tono, 0.92)]
          : [conAlfa(C.gold, 0), conAlfa(C.gold, 0.26), conAlfa(tono, 0.5)]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={st.hilo}
      />
    </Animated.View>
  );
});

function Vinculos({ campo, base, brillo, desplaz, activo }) {
  const nucleo = MUNDOS.find((m) => m.id === 'wallet') || MUNDOS[0];
  // El núcleo también se puede arrastrar: si se mueve la billetera, los cuatro
  // hilos la siguen desde su nuevo sitio.
  const d0 = desplaz[nucleo.id] || SIN_MOVER;
  const cx = campo.w * nucleo.x + d0.x;
  const cy = campo.h * nucleo.y + d0.y;
  const rc = (base * nucleo.tam) / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {MUNDOS.map((m) => {
        if (m.id === nucleo.id) return null;
        const d = desplaz[m.id] || SIN_MOVER;
        const x2 = campo.w * m.x + d.x;
        const y2 = campo.h * m.y + d.y;
        const r2 = (base * m.tam) / 2;
        const dx = x2 - cx;
        const dy = y2 - cy;
        const L = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / L;
        const uy = dy / L;
        // Se recorta en los dos extremos: un hilo que entra en la esfera la
        // apuñala, y lo que tiene que parecer es que se acopla a ella.
        return (
          <Hilo
            key={m.id}
            ax={cx + ux * rc * 1.20}
            ay={cy + uy * rc * 1.20}
            bx={x2 - ux * r2 * 1.34}
            by={y2 - uy * r2 * 1.34}
            tono={m.halo}
            brillo={brillo}
            tenso={activo === m.id || activo === nucleo.id}
          />
        );
      })}
    </View>
  );
}

// Cuánto se le permite al dedo temblar antes de que esto deje de ser un toque
// y pase a ser un arrastre. Seis píxeles es lo que ya usa la burbuja flotante
// (FlotanteOG): el mismo número en toda la app para que el dedo aprenda una
// sola regla.
const UMBRAL_ARRASTRE = 6;

const acotar = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

// Fracción del tablero → desplazamiento en píxeles desde el sitio de fábrica,
// ACOTADO para que la esfera y su etiqueta quepan enteras.
// Se acota aquí y no sólo al soltar porque el tablero cambia de forma: un
// mundo guardado junto al borde de arriba en una pantalla alta se asomaba
// fuera al girar el teléfono, donde el tablero es mucho más bajo y la misma
// esfera ocupa proporcionalmente el doble. La fracción se respeta mientras
// quepa; cuando no cabe, gana el borde.
function desdeFraccion(fx, fy, campo, s, m) {
  const r = s / 2;
  const cx = acotar(campo.w * fx, r + 6, Math.max(r + 6, campo.w - r - 6));
  const cy = acotar(campo.h * fy, r + 6, Math.max(r + 6, campo.h - r - 28));
  return { x: cx - campo.w * m.x, y: cy - campo.h * m.y };
}

// ── UN MUNDO ────────────────────────────────────────────────────────────
// MEMOIZADO: arrastrar un nodo repinta la pantalla en cada cuadro para que el
// hilo se estire, y sin esta barrera los CINCO mundos —con sus degradados y
// sus logos— se reconciliarían sesenta veces por segundo por mover uno.
const Nodo = React.memo(function Nodo({
  m, etiqueta, a11y, campo, base, ix, iy, reponer, onIr, onMover, onTomar, onSoltar,
}) {
  const resp = useRef(new Animated.Value(0)).current;   // respiración
  const cerca = useRef(new Animated.Value(0)).current;  // acercamiento al tocar
  const sujeto = useRef(new Animated.Value(0)).current; // en el aire, en la mano
  // El desplazamiento del arrastre, en PÍXELES desde el sitio de nacimiento.
  const desp = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [alzado, setAlzado] = useState(false);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    // Cada esfera respira con su propio ritmo y su propio retraso. Si todas
    // latieran a la vez el tablero parpadearía como un semáforo en lugar de
    // sentirse vivo.
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(resp, {
          toValue: 1, duration: m.ritmo, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(resp, {
          toValue: 0, duration: m.ritmo, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ]),
    );
    const t = setTimeout(() => { if (vivo.current) bucle.start(); }, m.retraso);
    return () => { vivo.current = false; clearTimeout(t); bucle.stop(); };
  }, [m.ritmo, m.retraso, resp]);

  const s = Math.round(base * m.tam);
  const izq = Math.round(campo.w * m.x - s / 2);
  const arr = Math.round(campo.h * m.y - s / 2);

  // ══ COLOCAR Y REPONER ══════════════════════════════════════════════════
  // La VERDAD de dónde vive este mundo es una FRACCIÓN del tablero, no unos
  // píxeles: los píxeles se van de sitio al girar el teléfono, y lo que en un
  // móvil estrecho es "arriba a la derecha" en una tableta serían unos nodos
  // apelotonados en una esquina. Los píxeles se derivan de la fracción cada
  // vez que el tablero cambia de tamaño.
  const fraccion = useRef({ fx: ix, fy: iy });

  // 1) El tablero cambió de tamaño (arranque, giro, teclado). Se recolocan los
  //    píxeles a partir de la fracción VIVA — la de ahora, no la de fábrica.
  //    Sin este efecto, girar el teléfono después de mover un mundo lo
  //    devolvía de un salto a su sitio original y el trabajo se perdía.
  useEffect(() => {
    if (!campo.w || !campo.h) return;
    const f = fraccion.current;
    desp.setValue(desdeFraccion(f.fx, f.fy, campo, s, m));
  }, [campo, s, m, desp]);

  // 2) Una orden que viene de FUERA: la colocación que se leyó del teléfono al
  //    abrir, o el "volver a poner en su sitio". `campo` no está en las
  //    dependencias a propósito — de los cambios de tamaño se ocupa el efecto
  //    de arriba, y este sólo tiene que reaccionar a la orden. Cuando corre, lo
  //    hace con el `campo` del render que la trajo, que es el bueno.
  const reponerAntes = useRef(reponer);
  useEffect(() => {
    const esReposicion = reponer !== reponerAntes.current;
    reponerAntes.current = reponer;
    fraccion.current = { fx: ix, fy: iy };
    if (!campo.w || !campo.h) return;
    const meta = desdeFraccion(ix, iy, campo, s, m);
    if (esReposicion) {
      // Volver a su sitio se ANIMA: si los mundos aparecieran de golpe en su
      // posición original nadie entendería que han vuelto — parecería que la
      // pantalla se ha recargado.
      Animated.spring(desp, {
        toValue: meta, friction: 7, tension: 55, useNativeDriver: false,
      }).start();
    } else {
      // Al abrir, en cambio, sin animación: nadie ha pedido un espectáculo,
      // sólo su tablero como lo dejó.
      desp.setValue(meta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ix, iy, reponer]);

  // El tablero necesita saber dónde está este nodo AHORA para estirar su
  // hilo. Se entera por el oyente del propio valor animado, así que sirve
  // igual para el dedo que arrastra y para el muelle que devuelve a su sitio:
  // un solo mecanismo para los dos.
  const donde = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const id = desp.addListener((v) => {
      donde.current = v;
      onMover(m.id, v.x, v.y);
    });
    return () => desp.removeListener(id);
  }, [desp, m.id, onMover]);

  const escResp = resp.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const escToque = cerca.interpolate({ inputRange: [0, 1], outputRange: [1, 1.17] });
  // En la mano crece: es la única forma de que el dedo sepa que ha AGARRADO
  // algo y no que lo está rozando.
  const escMano = sujeto.interpolate({ inputRange: [0, 1], outputRange: [1, 1.13] });
  const escala = Animated.multiply(Animated.multiply(escResp, escToque), escMano);
  const subeBaja = resp.interpolate({ inputRange: [0, 1], outputRange: [m.flota, -m.flota] });
  const haloBase = resp.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] });
  // Y el halo se abre: el nodo levantado proyecta más luz, como si se hubiera
  // acercado a la cámara.
  const haloMano = sujeto.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const haloOp = Animated.multiply(haloBase, haloMano);

  // Los datos que necesita el PanResponder cambian en cada render (el tamaño
  // del campo, el destino al que navegar), pero el PanResponder se crea UNA
  // vez. El puente entre los dos es este ref, que se refresca al pintar.
  const hoy = useRef(null);
  const tocar = useCallback(() => {
    hap();
    // El acercamiento: la esfera se te viene encima y se navega EN EL PICO,
    // no al final — así el viaje se siente sin que la pantalla se retrase.
    Animated.timing(cerca, { toValue: 1, duration: 145, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(({ finished }) => {
        if (finished) hoy.current.onIr(m.id);
        Animated.timing(cerca, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      });
  }, [cerca, m.id]);
  hoy.current = { campo, s, onIr, onTomar, onSoltar, tocar };

  const arrastrando = useRef(false);
  const pan = useRef(PanResponder.create({
    // Se coge el dedo desde que toca: si sólo se cogiera al moverse, el toque
    // corto no llegaría nunca aquí y habría que repartirlo entre dos
    // componentes.
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    // ═══ ESTA LÍNEA ES LA QUE HACE QUE EL ARRASTRE FUNCIONE ═══════════════
    // App.js tiene su propio PanResponder envolviendo la pantalla para cambiar
    // de pestaña con un barrido horizontal (|dx| > 20). Sin negarse aquí,
    // React Native le CEDE el dedo a ese padre en cuanto el nodo se arrastra
    // veinte píxeles de lado: el mundo se quedaba a medio camino y la app
    // saltaba a la pestaña siguiente. Mientras este nodo esté en la mano, el
    // dedo es suyo y de nadie más.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,

    onPanResponderGrant: () => {
      arrastrando.current = false;
      // El desplazamiento acumulado pasa a ser el ORIGEN, y el valor vuelve a
      // cero: así `g.dx` del gesto se puede escribir tal cual, sin sumar.
      desp.setOffset({ x: donde.current.x, y: donde.current.y });
      desp.setValue({ x: 0, y: 0 });
    },

    onPanResponderMove: (_, g) => {
      desp.setValue({ x: g.dx, y: g.dy });
      if (arrastrando.current) return;
      if (Math.abs(g.dx) <= UMBRAL_ARRASTRE && Math.abs(g.dy) <= UMBRAL_ARRASTRE) return;
      // Se ha pasado del temblor: esto ya es un arrastre y deja de ser un
      // toque. Un golpecito para avisar de que el mundo se ha despegado.
      arrastrando.current = true;
      hap();
      setAlzado(true);
      hoy.current.onTomar(m.id);
      Animated.spring(sujeto, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    },

    onPanResponderRelease: (_, g) => {
      desp.flattenOffset();
      // Un toque corto: ni se movió ni se despegó. Sigue siendo el botón de
      // siempre y abre su app.
      if (!arrastrando.current) {
        if (Math.abs(g.dx) <= UMBRAL_ARRASTRE && Math.abs(g.dy) <= UMBRAL_ARRASTRE) hoy.current.tocar();
        return;
      }
      arrastrando.current = false;
      setAlzado(false);
      Animated.spring(sujeto, { toValue: 0, friction: 7, tension: 80, useNativeDriver: true }).start();

      const d = hoy.current;
      if (!d.campo.w || !d.campo.h) return;
      const r = d.s / 2;
      const cx = d.campo.w * m.x + donde.current.x;
      const cy = d.campo.h * m.y + donde.current.y;
      // Se acota DENTRO del tablero, con hueco abajo para la etiqueta: un
      // mundo soltado en el borde se quedaba medio fuera y ya no había forma
      // de volver a cogerlo.
      const cxOk = acotar(cx, r + 6, d.campo.w - r - 6);
      const cyOk = acotar(cy, r + 6, d.campo.h - r - 28);
      if (cxOk !== cx || cyOk !== cy) {
        // Se pasó del borde: vuelve dentro con un muelle. Un recorte seco se
        // lee como un fallo; el muelle se lee como un límite.
        Animated.spring(desp, {
          toValue: { x: cxOk - d.campo.w * m.x, y: cyOk - d.campo.h * m.y },
          friction: 7, tension: 60, useNativeDriver: false,
        }).start();
      }
      // La fracción nueva se apunta AQUÍ y no pasa por el estado de React: el
      // efecto de arriba la usará si el teléfono gira, y así el muelle del
      // recorte no se corta a media carrera por un repintado.
      const fx = cxOk / d.campo.w;
      const fy = cyOk / d.campo.h;
      fraccion.current = { fx, fy };
      hap();
      d.onSoltar(m.id, fx, fy);
    },

    // Si el sistema se lleva el dedo de todas formas (una llamada entrante,
    // una notificación a pantalla completa) el nodo se queda donde estaba y
    // no se guarda nada. Mejor eso que dejarlo pegado al borde.
    onPanResponderTerminate: () => {
      desp.flattenOffset();
      arrastrando.current = false;
      setAlzado(false);
      Animated.spring(sujeto, { toValue: 0, friction: 7, tension: 80, useNativeDriver: true }).start();
    },
  })).current;

  const logo = LOGOS[m.id] || null;
  // La lente ocupa poco menos de dos tercios de la esfera: más grande se come
  // el borde de vidrio y la esfera deja de leerse como esfera.
  const dl = Math.round(s * 0.62);
  const dz = Math.round(dl * (m.zoom || 1));

  return (
    // DOS capas de animación y no una, y es obligatorio: el arrastre lo mueve
    // el hilo de JavaScript (el dedo manda) y la respiración va por el
    // controlador NATIVO. React Native no deja mezclar los dos en la misma
    // lista de `transform` —revienta con "animated node has been moved to
    // native"—, así que el arrastre va fuera y la vida va dentro.
    <Animated.View
      {...pan.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={a11y}
      // Con lector de pantalla no hay arrastre que valga: el toque de
      // accesibilidad tiene que abrir la app igual que antes.
      onAccessibilityTap={tocar}
      // El área de toque se estira más allá de la esfera: un círculo de
      // 90 px con el dedo encima deja poco margen para acertar.
      hitSlop={10}
      style={[st.nodo, {
        left: izq,
        top: arr,
        width: s,
        // El que va en la mano pasa por ENCIMA de los demás: si no, arrastrar
        // un mundo pequeño por detrás de la billetera lo hacía desaparecer.
        zIndex: alzado ? 20 : 1,
        transform: [{ translateX: desp.x }, { translateY: desp.y }],
      }]}>
      <Animated.View
        pointerEvents="none"
        style={{ width: s, alignItems: 'center', transform: [{ translateY: subeBaja }, { scale: escala }] }}>
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          {/* El halo son tres discos concéntricos y no una sombra: Android
              ignora shadowColor y `elevation` sólo sabe pintar gris. */}
          <Animated.View style={[st.aro, { width: s * 1.62, height: s * 1.62, borderRadius: s * 0.81, backgroundColor: m.halo, opacity: Animated.multiply(haloOp, 0.07) }]} />
          <Animated.View style={[st.aro, { width: s * 1.32, height: s * 1.32, borderRadius: s * 0.66, backgroundColor: m.halo, opacity: Animated.multiply(haloOp, 0.13) }]} />
          <Animated.View style={[st.aro, { width: s * 1.12, height: s * 1.12, borderRadius: s * 0.56, backgroundColor: m.halo, opacity: Animated.multiply(haloOp, 0.20) }]} />

          <LinearGradient
            colors={m.grad}
            // La luz entra por arriba a la izquierda, como en el mundo real:
            // ese único detalle es lo que convierte un círculo en una esfera.
            start={{ x: 0.14, y: 0.04 }}
            end={{ x: 0.88, y: 1 }}
            style={[st.esfera, { width: s, height: s, borderRadius: s / 2 }]}>
            <View style={[st.brillo, { width: s * 0.42, height: s * 0.30, borderRadius: s * 0.21, top: s * 0.09, left: s * 0.14 }]} />
            {/* La sombra del volumen va ANTES que la lente: si pasara por
                encima, el logo saldría medio apagado por abajo. La lente es
                vidrio hundido, no pintura sobre la esfera. */}
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.34)']}
              style={[StyleSheet.absoluteFill, { borderRadius: s / 2 }]}
              pointerEvents="none"
            />
            <View style={[st.lente, {
              width: dl, height: dl, borderRadius: dl / 2, backgroundColor: m.lente,
            }]}>
              {logo ? (
                // `overflow: hidden` de la lente es el recorte circular: el PNG
                // cuadrado se agranda hasta tapar el disco entero y lo que
                // sobra por las esquinas se va. No queda cuadrado a la vista,
                // sólo la marca.
                // El `borderRadius` de la propia imagen es el cinturón además
                // de los tirantes: si algún Android se hiciera el remolón con
                // el recorte del padre, lo peor que puede pasar es un logo
                // redondo un pelín grande. Nunca el cuadrado pegado.
                <Image
                  source={logo}
                  style={{ width: dz, height: dz, borderRadius: dz / 2 }}
                  resizeMode="contain"
                />
              ) : (
                <Icon name={m.icono} size={Math.round(dl * 0.52)} color={m.halo} />
              )}
            </View>
            {/* Un aro finísimo de luz en el canto de la lente: sin él el disco
                oscuro parece un agujero en la esfera. */}
            <View style={[st.canto, { width: dl, height: dl, borderRadius: dl / 2 }]} pointerEvents="none" />
          </LinearGradient>
        </View>
        <Text style={st.etiqueta} numberOfLines={1}>{etiqueta}</Text>
      </Animated.View>
    </Animated.View>
  );
});

export default function Nucleo({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const [campo, setCampo] = useState({ w: 0, h: 0 });

  // ══ LA COLOCACIÓN ══════════════════════════════════════════════════════
  // `colocacion` es sólo el punto de PARTIDA: lo que se leyó del teléfono al
  // abrir. Mientras el dedo arrastra, la posición viva está en el valor
  // animado de cada nodo, no aquí — si cada píxel del arrastre pasara por el
  // estado de React, el tablero iría a tirones. El estado se toca dos veces:
  // al cargar y al reponer.
  const [colocacion, setColocacion] = useState(SIN_COLOCACION);
  const [movidos, setMovidos] = useState(false);   // ¿hay algo fuera de su sitio?
  const [reponer, setReponer] = useState(0);       // contador de "vuelve a tu sitio"
  const [enMano, setEnMano] = useState(null);      // qué mundo lleva el dedo

  // Las posiciones VIVAS de los cinco mundos, en un ref y no en el estado: se
  // escriben en cada cuadro del arrastre y sólo las leen los hilos.
  const desplaz = useRef({});
  // Lo que hay escrito en el teléfono, tal cual. Se mantiene aparte del estado
  // porque al soltar un mundo hay que reescribir el fichero ENTERO: si sólo se
  // guardara el que se acaba de mover, los otros cuatro se perderían.
  const guardado = useRef({});
  const [, redibujar] = useReducer((n) => (n + 1) % 1000000, 0);
  const pedido = useRef(false);
  const raf = useRef(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!ALMACEN) return;
      try {
        const crudo = await ALMACEN.getItem(LLAVE_COLOCACION);
        if (!vivo || !crudo) return;
        const leido = JSON.parse(crudo);
        // Se filtra mundo a mundo y por rango. Un fichero de una versión vieja
        // —o corrupto— no puede colocar un nodo fuera de la pantalla, que es
        // la única avería de esto que no tendría arreglo desde la propia app:
        // no se puede arrastrar lo que no se ve.
        const limpio = {};
        let hay = false;
        MUNDOS.forEach((m) => {
          const p = leido && leido[m.id];
          if (!p) return;
          const fx = Number(p.fx);
          const fy = Number(p.fy);
          if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
          if (fx <= 0 || fx >= 1 || fy <= 0 || fy >= 1) return;
          limpio[m.id] = { fx, fy };
          hay = true;
        });
        if (!hay) return;
        guardado.current = limpio;
        setColocacion(limpio);
        setMovidos(true);
      } catch (e) {
        // Colocación ilegible: se abre el tablero como el primer día.
      }
    })();
    return () => { vivo = false; };
  }, []);

  // Los hilos se redibujan como mucho UNA vez por cuadro. El oyente del valor
  // animado puede dispararse varias veces seguidas (x e y son dos valores
  // distintos), y sin esta brida se pedirían dos repintados para el mismo
  // movimiento.
  const onMover = useCallback((id, x, y) => {
    const antes = desplaz.current[id];
    if (antes && antes.x === x && antes.y === y) return;
    desplaz.current[id] = { x, y };
    if (pedido.current) return;
    pedido.current = true;
    raf.current = requestAnimationFrame(() => { pedido.current = false; redibujar(); });
  }, []);
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);

  const onTomar = useCallback((id) => setEnMano(id), []);

  const onSoltar = useCallback((id, fx, fy) => {
    guardado.current = { ...guardado.current, [id]: { fx, fy } };
    setEnMano(null);
    setMovidos(true);
    // Se escribe al SOLTAR y no durante el arrastre: guardar en disco sesenta
    // veces por segundo es la forma más rápida de que un teléfono modesto
    // empiece a dar tirones.
    if (ALMACEN) {
      ALMACEN.setItem(LLAVE_COLOCACION, JSON.stringify(guardado.current)).catch(() => {});
    }
  }, []);

  const reponerTodo = useCallback(() => {
    hap();
    guardado.current = {};
    setColocacion(SIN_COLOCACION);
    setMovidos(false);
    setReponer((n) => n + 1);
    if (ALMACEN) ALMACEN.removeItem(LLAVE_COLOCACION).catch(() => {});
  }, []);

  // Un ÚNICO latido para los cuatro hilos, con controlador nativo. Cuatro
  // bucles independientes serían cuatro animaciones más en el puente para
  // un detalle que nadie mira de frente.
  const latido = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(latido, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    bucle.start();
    return () => bucle.stop();
  }, [latido]);
  const opHilo = latido.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0.86] });

  // El saludo cambia con la hora del teléfono. Cuesta una línea y es lo que
  // separa "una app" de "mi app".
  const saludo = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t.manana;
    if (h < 20) return t.tarde;
    return t.noche;
  }, [t]);

  // Sólo el nombre de pila: "Buenas tardes, José Enamorado" suena a carta
  // del banco; "Buenas tardes, José" suena a alguien que te conoce.
  const nombre = (account?.name || '').trim().split(/\s+/)[0] || t.invitado;

  const onIr = useCallback((id) => {
    if (id === 'chat') return nav.go('chat');
    if (id === 'wallet') return nav.go('home');
    if (id === 'pay') return nav.go('pay-inicio');
    // Genesis ID abre el pasaporte si ya existe; si no, lleva al KYC, que es
    // el único camino para que exista.
    if (id === 'gid') return nav.go(account?.genesisUid ? 'passport' : 'kyc');
    return nav.go('settings');
  }, [nav, account?.genesisUid]);

  const ETIQ = { chat: t.chat, wallet: t.wallet, pay: t.pay, gid: t.gid, ajustes: t.ajustes };
  const A11Y = { chat: t.irChat, wallet: t.irWallet, pay: t.irPay, gid: t.irGid, ajustes: t.irAjustes };

  // El diámetro sale del lado más corto del tablero: en un teléfono bajo las
  // esferas encogen en vez de pisarse unas a otras.
  const base = Math.max(78, Math.min(campo.w * 0.31, campo.h * 0.245, 136));

  return (
    <View style={st.raiz}>
      <Fondo />

      <View style={st.cab} pointerEvents="box-none">
        <Image source={require('../../assets/og-logo.png')} style={st.logo} resizeMode="contain" />
        <Text style={st.marca}>ORDEN GLOBAL</Text>
        <Text style={st.saludo}>
          {saludo}, <Text style={st.nombre}>{nombre}</Text>
        </Text>
        <Text style={st.pista} numberOfLines={2}>{t.pista}</Text>
        {/* El enlace sólo aparece cuando hay algo que reponer. Un botón de
            "deshacer" siempre visible es ruido en una pantalla que sólo tiene
            cinco cosas. */}
        {movidos && (
          <Pressable
            onPress={reponerTodo}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t.irReponer}>
            {({ pressed }) => (
              <Text style={[st.reponer, pressed && st.reponerTocado]}>{t.reponer}</Text>
            )}
          </Pressable>
        )}
      </View>

      <View style={st.campo} onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        // Sólo se guarda si cambió de verdad: onLayout se dispara también al
        // rotar y al abrir el teclado, y cada set repinta las cinco esferas.
        setCampo((p) => (Math.abs(p.w - width) < 1 && Math.abs(p.h - height) < 1 ? p : { w: width, h: height }));
      }}>
        {/* Los hilos van DEBAJO de los mundos: si cruzaran por encima de una
            esfera se verían como un arañazo. */}
        {campo.w > 0 && campo.h > 0 && (
          <Vinculos
            campo={campo}
            base={base}
            brillo={opHilo}
            desplaz={desplaz.current}
            activo={enMano}
          />
        )}
        {campo.w > 0 && campo.h > 0 && MUNDOS.map((m) => (
          <Nodo
            key={m.id}
            m={m}
            etiqueta={ETIQ[m.id]}
            a11y={A11Y[m.id]}
            campo={campo}
            base={base}
            // Números sueltos y no un objeto: el nodo está memoizado y un
            // objeto nuevo en cada render tiraría por tierra la memoización
            // justo cuando más falta hace, que es mientras se arrastra.
            ix={colocacion[m.id] ? colocacion[m.id].fx : m.x}
            iy={colocacion[m.id] ? colocacion[m.id].fy : m.y}
            reponer={reponer}
            onIr={onIr}
            onMover={onMover}
            onTomar={onTomar}
            onSoltar={onSoltar}
          />
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  // Negro de verdad: esta pantalla tapa a propósito la fotografía de marca
  // que dibuja AppBackground, porque las neuronas necesitan vacío detrás.
  raiz: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  web: { flex: 1, backgroundColor: '#000' },
  velo: { position: 'absolute', left: 0, right: 0, top: 0, height: '72%' },

  cab: { alignItems: 'center', paddingTop: 8, paddingHorizontal: 18 },
  logo: { width: 82, height: 56 },
  marca: { color: C.txt, fontSize: 12.5, letterSpacing: 5.5, marginTop: 6, fontWeight: '600' },
  saludo: { color: C.txt2, fontSize: 14, marginTop: 10 },
  nombre: { color: C.gold, fontWeight: '700' },
  pista: { color: C.txt3, fontSize: 11, marginTop: 3, letterSpacing: 0.3, textAlign: 'center' },
  // En minúsculas y subrayado: es un enlace, no un botón. Que no compita con
  // los cinco mundos, que son lo único que hay que mirar aquí.
  reponer: {
    color: C.gold, fontSize: 11, marginTop: 7, letterSpacing: 0.2,
    textDecorationLine: 'underline',
  },
  reponerTocado: { color: C.goldHi },

  campo: { flex: 1, marginTop: 6, marginBottom: 6 },
  hilo: { flex: 1, borderRadius: 1.5 },
  nodo: { position: 'absolute', alignItems: 'center' },
  aro: { position: 'absolute' },
  // El recorte circular de los logos vive aquí: `overflow: hidden` sobre un
  // borde redondo es lo que convierte un PNG cuadrado en una marca redonda.
  lente: {
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  canto: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  esfera: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },
  brillo: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.30)' },
  etiqueta: {
    color: C.txt, fontSize: 11, fontWeight: '600', letterSpacing: 0.3,
    marginTop: 9, textAlign: 'center',
    // El negro del fondo no siempre queda debajo del texto (a veces cae una
    // sinapsis encendida): la sombra lo despega sin recuadros feos.
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
