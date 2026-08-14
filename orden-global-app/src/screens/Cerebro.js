// El cerebro, visible: una red de neuronas latiendo. Se dibuja en un canvas
// dentro de un WebView --sin librerías de gráficos nativas, sin riesgo de
// compilación-- y late de verdad: nodos que respiran, pulsos de oro que
// viajan por las sinapsis, y una leve profundidad 3D por paralaje.
// Debajo, el botón abre el cerebro completo (cerebro.ordenscan.com/demo),
// donde FLUX narra con la voz grabada.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../theme';
import { useT } from '../i18n';
import { BotonOro } from '../ui';

const HTML = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#010D0E;overflow:hidden}canvas{display:block}</style>
<canvas id="c"></canvas><script>
const cv=document.getElementById('c'),x=cv.getContext('2d');
let W,H;function medir(){W=cv.width=innerWidth*devicePixelRatio;H=cv.height=innerHeight*devicePixelRatio;}
medir();addEventListener('resize',medir);
// La red: 42 neuronas en tres capas de profundidad. Las cercanas son más
// grandes y se mueven más — eso es todo el 3D que hace falta para que
// respire sin quemar la batería del teléfono.
const N=[];for(let i=0;i<42;i++){const z=.4+Math.random()*.6;
N.push({x:Math.random(),y:Math.random(),z,vx:(Math.random()-.5)*.00022,vy:(Math.random()-.5)*.00022,
f:2+Math.random()*4});}
const enlaces=[];for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++){
const dx=N[i].x-N[j].x,dy=N[i].y-N[j].y;if(dx*dx+dy*dy<.03)enlaces.push([i,j]);}
// pulsos de oro viajando por las sinapsis
const pulsos=[];function disparar(){const e=enlaces[(Math.random()*enlaces.length)|0];
if(e)pulsos.push({e,t:0,v:.008+Math.random()*.012});
setTimeout(disparar,240+Math.random()*700);}disparar();
let T=0;
(function pinta(){T+=.016;
x.fillStyle='#010D0E';x.fillRect(0,0,W,H);
for(const n of N){n.x+=n.vx*n.z;n.y+=n.vy*n.z;
if(n.x<0||n.x>1)n.vx*=-1;if(n.y<0||n.y>1)n.vy*=-1;}
x.lineWidth=1*devicePixelRatio;
for(const [i,j] of enlaces){const a=N[i],b=N[j];
x.strokeStyle='rgba(46,116,119,'+(0.10+0.08*Math.min(a.z,b.z))+')';
x.beginPath();x.moveTo(a.x*W,a.y*H);x.lineTo(b.x*W,b.y*H);x.stroke();}
for(let p=pulsos.length-1;p>=0;p--){const q=pulsos[p];q.t+=q.v;
if(q.t>=1){pulsos.splice(p,1);continue;}
const a=N[q.e[0]],b=N[q.e[1]];const px=(a.x+(b.x-a.x)*q.t)*W,py=(a.y+(b.y-a.y)*q.t)*H;
const g=x.createRadialGradient(px,py,0,px,py,7*devicePixelRatio);
g.addColorStop(0,'rgba(234,215,156,.95)');g.addColorStop(1,'rgba(201,169,97,0)');
x.fillStyle=g;x.beginPath();x.arc(px,py,7*devicePixelRatio,0,7);x.fill();}
for(const n of N){const late=1+.25*Math.sin(T*n.f);
const r=(1.4+2.6*n.z)*late*devicePixelRatio;
x.fillStyle='rgba(201,169,97,'+(0.35+0.5*n.z)+')';
x.beginPath();x.arc(n.x*W,n.y*H,r,0,7);x.fill();}
requestAnimationFrame(pinta);})();
</script>`;

export default function Cerebro({ abrirWeb }) {
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: C.negro }}>
      <WebView source={{ html: HTML }} style={{ flex: 1, backgroundColor: C.negro }}
        scrollEnabled={false} setSupportMultipleWindows={false} />
      <View style={s.pie}>
        <Text style={s.tit}>{t('cer.titulo')}</Text>
        <Text style={s.sub}>{t('cer.sub')}</Text>
        <BotonOro onPress={abrirWeb}>{t('cer.abrir')}</BotonOro>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pie: { padding: 18, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.line2, backgroundColor: 'rgba(2,17,18,0.9)' },
  tit: { color: C.txt, fontSize: 18, fontWeight: '300' },
  sub: { color: C.txt3, fontSize: 12.5, marginTop: 3, marginBottom: 12 },
});
