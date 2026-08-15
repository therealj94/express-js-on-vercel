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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, Animated, Easing, StyleSheet,
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

const TXT = {
  es: {
    manana: 'Buenos días', tarde: 'Buenas tardes', noche: 'Buenas noches',
    invitado: 'bienvenido',
    pista: 'Toca un mundo para entrar',
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
    pista: 'Tap a world to enter',
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
const MUNDOS = [
  {
    // El oro de la billetera es el degradado de marca tal cual (G.gold), no
    // una copia parecida: es la esfera que la Junta va a mirar primero.
    id: 'wallet', icono: 'wallet', x: 0.50, y: 0.47, tam: 1.00,
    grad: G.gold, halo: C.goldLt, tinta: C.darkText,
    ritmo: 2600, flota: 4.5, retraso: 0,
  },
  {
    id: 'chat', icono: 'chatbubbles', x: 0.19, y: 0.17, tam: 0.72,
    grad: ['#FBE0D4', '#E0937A', '#8A4A38'], halo: '#E0937A', tinta: '#3B1A11',
    ritmo: 3100, flota: 5.5, retraso: 420,
  },
  {
    id: 'pay', icono: 'storefront', x: 0.81, y: 0.21, tam: 0.76,
    grad: ['#D2F6E6', '#6FCFAE', '#1B6553'], halo: '#6FCFAE', tinta: '#06251D',
    ritmo: 2900, flota: 5, retraso: 900,
  },
  {
    id: 'gid', icono: 'finger-print', x: 0.18, y: 0.79, tam: 0.72,
    grad: ['#DEEBFC', '#8FB6E6', '#2C5280'], halo: '#8FB6E6', tinta: '#0B2340',
    ritmo: 3400, flota: 5.5, retraso: 1500,
  },
  {
    id: 'ajustes', icono: 'settings-sharp', x: 0.82, y: 0.81, tam: 0.68,
    grad: ['#D8E9E7', '#7FA9A6', '#284A49'], halo: '#7FA9A6', tinta: '#082322',
    ritmo: 3800, flota: 4.5, retraso: 2100,
  },
];

// Los colores del tema vienen en hexadecimal y los hilos necesitan alfa.
// Se convierte una vez por color, no en cada render.
function conAlfa(hex, a) {
  const h = String(hex).replace('#', '');
  const seis = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(seis, 16) || 0;
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
 var PULSOS=[], TOPE=64;
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

 var ultimo=0, objetivo=1000/60, ligero=false;
 var emaCosto=0, emaSalto=0, malo=0, bueno=0;
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
     desdeSemilla=0; proxSemilla=700+az()*900;
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
     /* En modo ligero las del fondo pierden el halo: son las que menos se
        ven y las que mas pixeles cuestan (el sello estampado grande). */
     if(!(ligero&&p1<0.28)){
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
      Se mide lo que TARDA el cuadro y tambien el hueco entre cuadros: lo
      primero dice si nos pasamos nosotros, lo segundo si el telefono anda
      ocupado con otra cosa. Bajar a 30 tarda medio segundo; volver a 60
      exige cuatro segundos buenos seguidos, para no oscilar entre los dos
      ritmos, que se nota muchisimo mas que ir siempre a 30. */
   var costo=reloj()-t0;
   emaCosto=emaCosto?emaCosto*0.92+costo*0.08:costo;
   emaSalto=emaSalto?emaSalto*0.90+dt*0.10:dt;
   if(!ligero){
     if(emaCosto>11||emaSalto>objetivo*1.8) malo+=dt; else malo=0;
     if(malo>600){ ligero=true; objetivo=1000/30; bueno=0; }
   }else{
     if(emaCosto<5.5) bueno+=dt; else bueno=0;
     if(bueno>4000){ ligero=false; objetivo=1000/60; malo=0; }
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
  const puntos = useMemo(() => {
    if (!caja.w || !caja.h) return [];
    const esc = Math.min(caja.w * 0.44, caja.h * 0.30);
    return ESFERA_FIJA.map((n) => ({
      ...n,
      px: caja.w * 0.5 + n.x * esc,
      py: caja.h * 0.55 + n.y * esc,
    }));
  }, [caja.w, caja.h]);

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
      {puntos.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.px - p.d / 2,
            top: p.py - p.d / 2,
            width: p.d, height: p.d, borderRadius: p.d / 2,
            opacity: p.o,
            backgroundColor: p.oro ? C.goldLt : '#7EECD4',
          }}
        />
      ))}
    </View>
  );
}

// Frontera de error alrededor del WebView: si el componente nativo no está
// en el binario, React lanza al RENDERIZARLO (no al importarlo), y sin esto
// se llevaría por delante toda la pantalla. Aquí sólo se cae el fondo.
class Fondo extends React.Component {
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
          source={{ html: HTML_NEURONAS, baseUrl: '' }}
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
function Vinculos({ campo, base, brillo }) {
  const nucleo = MUNDOS.find((m) => m.id === 'wallet') || MUNDOS[0];
  const cx = campo.w * nucleo.x;
  const cy = campo.h * nucleo.y;
  const rc = (base * nucleo.tam) / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {MUNDOS.map((m) => {
        if (m.id === nucleo.id) return null;
        const x2 = campo.w * m.x;
        const y2 = campo.h * m.y;
        const r2 = (base * m.tam) / 2;
        const dx = x2 - cx;
        const dy = y2 - cy;
        const L = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / L;
        const uy = dy / L;
        // Se recorta en los dos extremos: un hilo que entra en la esfera la
        // apuñala, y lo que tiene que parecer es que se acopla a ella.
        const ax = cx + ux * rc * 1.20;
        const ay = cy + uy * rc * 1.20;
        const bx = x2 - ux * r2 * 1.34;
        const by = y2 - uy * r2 * 1.34;
        const largo = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
        if (largo < 10) return null;
        const ang = Math.atan2(by - ay, bx - ax);
        return (
          <Animated.View
            key={m.id}
            style={{
              position: 'absolute',
              // Se coloca por el CENTRO del segmento y se gira sobre su
              // propio centro: así no hace falta transformOrigin, que no
              // está en todas las versiones de React Native.
              left: (ax + bx) / 2 - largo / 2,
              top: (ay + by) / 2 - 1,
              width: largo,
              height: 2,
              opacity: brillo,
              transform: [{ rotate: `${ang}rad` }],
            }}>
            <LinearGradient
              colors={[conAlfa(C.gold, 0), conAlfa(C.gold, 0.26), conAlfa(m.halo, 0.5)]}
              locations={[0, 0.45, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={st.hilo}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── UN MUNDO ────────────────────────────────────────────────────────────
function Nodo({ m, etiqueta, a11y, campo, base, onIr }) {
  const resp = useRef(new Animated.Value(0)).current;   // respiración
  const cerca = useRef(new Animated.Value(0)).current;  // acercamiento al tocar
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

  const escResp = resp.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const escToque = cerca.interpolate({ inputRange: [0, 1], outputRange: [1, 1.17] });
  const escala = Animated.multiply(escResp, escToque);
  const subeBaja = resp.interpolate({ inputRange: [0, 1], outputRange: [m.flota, -m.flota] });
  const haloOp = resp.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] });

  const tocar = () => {
    hap();
    // El acercamiento: la esfera se te viene encima y se navega EN EL PICO,
    // no al final — así el viaje se siente sin que la pantalla se retrase.
    Animated.timing(cerca, { toValue: 1, duration: 145, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(({ finished }) => {
        if (finished) onIr(m.id);
        Animated.timing(cerca, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      });
  };

  return (
    <Animated.View
      style={[st.nodo, { left: izq, top: arr, width: s, transform: [{ translateY: subeBaja }, { scale: escala }] }]}>
      <Pressable
        onPress={tocar}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        // El área de toque se estira más allá de la esfera: un círculo de
        // 90 px con el dedo encima deja poco margen para acertar.
        hitSlop={10}
        style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
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
          <Icon name={m.icono} size={Math.round(s * 0.34)} color={m.tinta} />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.34)']}
            style={[StyleSheet.absoluteFill, { borderRadius: s / 2 }]}
            pointerEvents="none"
          />
        </LinearGradient>
      </Pressable>
      <Text style={st.etiqueta} numberOfLines={1}>{etiqueta}</Text>
    </Animated.View>
  );
}

export default function Nucleo({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const [campo, setCampo] = useState({ w: 0, h: 0 });

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
    if (id === 'pay') return nav.go('pay-panel');
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
        <Text style={st.pista}>{t.pista}</Text>
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
          <Vinculos campo={campo} base={base} brillo={opHilo} />
        )}
        {campo.w > 0 && campo.h > 0 && MUNDOS.map((m) => (
          <Nodo
            key={m.id}
            m={m}
            etiqueta={ETIQ[m.id]}
            a11y={A11Y[m.id]}
            campo={campo}
            base={base}
            onIr={onIr}
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
  pista: { color: C.txt3, fontSize: 11, marginTop: 3, letterSpacing: 0.3 },

  campo: { flex: 1, marginTop: 6, marginBottom: 6 },
  hilo: { flex: 1, borderRadius: 1 },
  nodo: { position: 'absolute', alignItems: 'center' },
  aro: { position: 'absolute' },
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
