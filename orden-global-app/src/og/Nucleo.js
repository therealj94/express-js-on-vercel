// ═══ EL NÚCLEO ══════════════════════════════════════════════════════════
// El tablero principal de Orden Global. Sustituye a la lista de fichas de
// Ecosistema.js porque una lista dice "menú de opciones" y esto tiene que
// decir "un organismo vivo, y cada mundo es una app".
//
// Dos capas, y la separación es la clave del rendimiento:
//   · el FONDO es un canvas HTML dentro de un WebView. Una red de neuronas
//     con profundidad z, sinapsis entre las cercanas y pulsos de luz
//     viajando por ellas — la misma técnica del cerebro de infra/cerebro.
//     Un canvas dibuja 64 nodos y ~300 líneas en un solo hilo; hacer eso
//     con vistas nativas animadas serían cientos de vistas y el teléfono
//     se arrodilla. El WebView NO recibe toques (pointerEvents none).
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
// que caer ahí primero.
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

// ── EL FONDO: la red de neuronas ────────────────────────────────────────
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
 var W=0,H=0,ESC=0,VELO=null;
 var DPR=Math.min(window.devicePixelRatio||1,2);

 function medir(){
   W=window.innerWidth||360; H=window.innerHeight||640;
   C.width=Math.round(W*DPR); C.height=Math.round(H*DPR);
   C.style.width=W+'px'; C.style.height=H+'px';
   g.setTransform(DPR,0,0,DPR,0,0);
   ESC=Math.max(W,H)*0.62;
   /* El velo se construye UNA vez por medida. Crear un degradado radial en
      cada cuadro es de las pocas cosas que de verdad funden la bateria de
      un telefono de gama baja. */
   VELO=g.createRadialGradient(W*0.5,H*0.44,0,W*0.5,H*0.44,Math.max(W,H)*0.80);
   VELO.addColorStop(0,'rgba(16,62,60,0.55)');
   VELO.addColorStop(0.42,'rgba(7,30,32,0.32)');
   VELO.addColorStop(1,'rgba(0,0,0,0)');
 }

 var az=Math.random;
 /* 64 neuronas: bastantes para que se lea como una red, pocas para que las
    64x63/2 comparaciones de cada cuadro no cuesten nada. */
 var N=64, NEU=[];
 for(var i=0;i<N;i++){
   NEU.push({
     x:az()*2-1, y:(az()*2-1)*0.96, z:az()*2-1,
     vx:(az()-0.5)*0.00020, vy:(az()-0.5)*0.00016, vz:(az()-0.5)*0.00020,
     r:0.8+az()*1.4,
     oro:az()<0.16,          /* unas pocas son ORIGEN: las doradas */
     sx:0, sy:0, f:1
   });
 }

 /* El umbral se compara al CUADRADO para no sacar una raiz por pareja. */
 var UMBRAL=0.60, UM2=UMBRAL*UMBRAL;
 var rY=0, rX=-0.05;
 var PULSOS=[], desdePulso=0;

 function d2(a,b){
   var dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z;
   return dx*dx+dy*dy+dz*dz;
 }

 /* Un pulso solo viaja por una sinapsis que EXISTE: se busca un vecino
    dentro del umbral. Si la neurona esta sola, no hay disparo. */
 function soltarPulso(){
   var a=(az()*N)|0, mejor=-1, md=UM2;
   for(var j=0;j<N;j++){
     if(j===a) continue;
     var d=d2(NEU[a],NEU[j]);
     if(d<md){ md=d; mejor=j; if(az()<0.45) break; }
   }
   if(mejor<0) return;
   PULSOS.push({a:a,b:mejor,t:0,v:0.0055+az()*0.0065,oro:az()<0.45});
 }

 function proyectar(){
   var c1=Math.cos(rY),s1=Math.sin(rY),c2=Math.cos(rX),s2=Math.sin(rX);
   for(var i=0;i<N;i++){
     var n=NEU[i];
     var x=n.x*c1-n.z*s1, z1=n.x*s1+n.z*c1;
     var y=n.y*c2-z1*s2, z=n.y*s2+z1*c2;
     /* Perspectiva de verdad: lo que esta detras encoge y lo de delante
        crece. Es esto, y no el color, lo que hace que se lea en 3D. */
     var f=2.4/(2.4+z);
     n.sx=W/2+x*ESC*f; n.sy=H/2+y*ESC*f; n.f=f;
   }
 }

 /* Las sinapsis se agrupan en cuatro niveles de brillo y se trazan en
    cuatro llamadas. Una llamada a stroke() por linea -- trescientas por
    cuadro -- es exactamente lo que ahoga un canvas en un telefono. */
 var CUBOS=[[],[],[],[]];
 var TINTA=['rgba(64,180,166,0.055)','rgba(72,196,178,0.11)',
            'rgba(86,214,192,0.175)','rgba(110,228,206,0.25)'];

 function cuadro(ts){
   requestAnimationFrame(cuadro);
   if(document.hidden){ ultimo=ts; return; }
   var dt=ts-ultimo;
   if(dt<30) return;            /* ~30 cuadros por segundo: es un FONDO */
   if(dt>90) dt=90;             /* al volver de segundo plano no se salta */
   ultimo=ts;

   rY+=0.000075*dt;                       /* giro lento del conjunto */
   rX=-0.05+0.055*Math.sin(ts*0.00013);   /* y un cabeceo que respira */

   for(var i=0;i<N;i++){
     var n=NEU[i];
     n.x+=n.vx*dt; n.y+=n.vy*dt; n.z+=n.vz*dt;
     /* Rebote en las paredes del cubo: mantiene el volumen lleno sin que
        haya que resembrar neuronas nunca. */
     if(n.x<-1.1||n.x>1.1) n.vx=-n.vx;
     if(n.y<-1.05||n.y>1.05) n.vy=-n.vy;
     if(n.z<-1.1||n.z>1.1) n.vz=-n.vz;
   }
   proyectar();

   desdePulso+=dt;
   if(desdePulso>430){ desdePulso=0; soltarPulso(); }

   g.globalCompositeOperation='source-over';
   g.fillStyle='#000'; g.fillRect(0,0,W,H);
   g.fillStyle=VELO;   g.fillRect(0,0,W,H);
   /* Aditivo: donde se cruzan dos hilos la luz se suma, como en el vidrio */
   g.globalCompositeOperation='lighter';

   CUBOS[0].length=0;CUBOS[1].length=0;CUBOS[2].length=0;CUBOS[3].length=0;
   for(var a=0;a<N;a++){
     var A=NEU[a];
     if(A.f<0.60) continue;
     for(var b=a+1;b<N;b++){
       var B=NEU[b];
       if(B.f<0.60) continue;
       var d=d2(A,B);
       if(d>=UM2) continue;
       var cerca=1-d/UM2;
       var prof=(A.f+B.f)*0.5-0.58;
       if(prof<=0) continue;
       var k=(cerca*prof*4.2)|0; if(k>3)k=3;
       var cu=CUBOS[k];
       cu.push(A.sx,A.sy,B.sx,B.sy);
     }
   }
   g.lineWidth=0.65;
   for(var k2=0;k2<4;k2++){
     var cu2=CUBOS[k2]; if(!cu2.length) continue;
     g.strokeStyle=TINTA[k2];
     g.beginPath();
     for(var q=0;q<cu2.length;q+=4){
       g.moveTo(cu2[q],cu2[q+1]); g.lineTo(cu2[q+2],cu2[q+3]);
     }
     g.stroke();
   }

   for(var i2=0;i2<N;i2++){
     var m=NEU[i2];
     var p=(m.f-0.62)/0.90; if(p<0)p=0; if(p>1)p=1;
     var rr=m.r*(0.45+p*1.30);
     if(m.oro){
       /* El halo cuesta caro, asi que solo lo llevan las doradas: son diez
          de sesenta y cuatro y son las que dan el acento de marca. */
       g.fillStyle='rgba(236,204,132,'+(0.18+p*0.62).toFixed(3)+')';
       g.shadowColor='#C9A961'; g.shadowBlur=4+p*13;
     }else{
       g.fillStyle='rgba('+((38+p*104)|0)+','+((118+p*112)|0)+','+((112+p*96)|0)+','+(0.12+p*0.58).toFixed(3)+')';
       g.shadowBlur=0;
     }
     g.beginPath(); g.arc(m.sx,m.sy,rr,0,6.2832); g.fill();
     g.shadowBlur=0;
   }

   for(var u=PULSOS.length-1;u>=0;u--){
     var s=PULSOS[u];
     s.t+=s.v*dt/16;
     if(s.t>=1){ PULSOS.splice(u,1); continue; }
     var P=NEU[s.a], Q=NEU[s.b];
     var x1=P.sx+(Q.sx-P.sx)*s.t, y1=P.sy+(Q.sy-P.sy)*s.t;
     var cola=s.t-0.20; if(cola<0) cola=0;
     var x0=P.sx+(Q.sx-P.sx)*cola, y0=P.sy+(Q.sy-P.sy)*cola;
     /* Se apaga al entrar y al salir: un punto que aparece y desaparece de
        golpe se ve como un error de dibujo, no como luz. */
     var op=Math.sin(s.t*3.1416);
     var col=s.oro?'255,196,107':'126,236,212';
     g.strokeStyle='rgba('+col+','+(op*0.42).toFixed(3)+')';
     g.lineWidth=1.35;
     g.beginPath(); g.moveTo(x0,y0); g.lineTo(x1,y1); g.stroke();
     g.fillStyle='rgba('+col+','+(op*0.92).toFixed(3)+')';
     g.shadowColor=s.oro?'#ffc46b':'#7eecd4'; g.shadowBlur=11*op;
     g.beginPath(); g.arc(x1,y1,1.7*op+0.5,0,6.2832); g.fill();
     g.shadowBlur=0;
   }
 }

 var ultimo=0;
 medir();
 window.addEventListener('resize',medir);
 document.addEventListener('visibilitychange',function(){ ultimo=0; });
 requestAnimationFrame(cuadro);
})();
</script>
</body></html>`;

// Plan B del fondo, en React Native puro. Las posiciones son fijas y
// calculadas una sola vez a propósito: un fondo de emergencia no puede ser
// lo que gaste la batería, y tampoco puede bailar en cada render.
const POLVO = [];
for (let i = 0; i < 26; i += 1) {
  // Secuencia determinista (no Math.random) para que el fondo sea SIEMPRE
  // el mismo: si cambiara al volver a la pantalla se notaría como un fallo.
  const a = (i * 137.508 * Math.PI) / 180;
  const r = 0.09 + ((i * 0.61803) % 1) * 0.92;
  POLVO.push({
    x: 0.5 + Math.cos(a) * r * 0.52,
    y: 0.5 + Math.sin(a) * r * 0.46,
    d: 1.2 + ((i * 0.37) % 1) * 2.6,
    o: 0.06 + ((i * 0.23) % 1) * 0.26,
    oro: i % 7 === 0,
  });
}

function FondoQuieto() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(16,62,60,0.55)', 'rgba(7,30,32,0.28)', 'rgba(0,0,0,0)']}
        style={st.velo} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      />
      {POLVO.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: `${(p.x * 100).toFixed(2)}%`,
            top: `${(p.y * 100).toFixed(2)}%`,
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
