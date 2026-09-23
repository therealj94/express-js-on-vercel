import {Camera,PerspectiveCamera,Vector3} from 'three';
import {worlds,World} from './catalog';
import {navigation,useExperience,motionReduced,pelicula} from './navigation';
import {usePreferences} from './preferences';

export const SUN_RADIUS=2.75;
export const orbitRadii=[11,18];
const orbiting=worlds.filter(w=>w.id!=='genesis');
const angles=[2.55,4.1,5.35,.25,1.5,3.4,5.8,4.65,.9,2.1];
export const orbitPositions=new Map(worlds.map((w,i)=>[w.id,new Vector3(...w.position)]));
let orbitalTime=0,lastOrbitFrame=-1;
export function updateOrbits(now:number,dt:number,width=1000){
 if(Math.abs(now-lastOrbitFrame)<.5)return;lastOrbitFrame=now;
 const state=useExperience.getState(),prefs=usePreferences.getState().prefs;
 if(!state.immersive&&!pelicula.activo&&prefs.autoOrbit&&!motionReduced()&&!state.selected&&!state.hovered&&!state.settings&&!state.directory&&!state.windowId&&!state.tutorial&&now-navigation.lastInteraction>650)orbitalTime+=Math.min(.04,dt);
 orbitPositions.get('genesis')!.set(0,0,0);
 orbiting.forEach((w,i)=>{const radius=i<5?11:18,angle=angles[i]+orbitalTime*(i<5?.025:.016);orbitPositions.get(w.id)!.set(Math.cos(angle)*radius*(width<700?.74:1),Math.sin(angle*2+i)*.24,Math.sin(angle)*radius*(width<700?1.15:1));});
}
export const locationOf=(w:World)=>orbitPositions.get(w.id)||new Vector3(...w.position);
export const deepWorlds:World[]=[
 {id:'cosmic-aether',name:'Aether',category:['Gigante helado','Ice giant'],description:['',''],position:[-49,-17,9],radius:5.4,color:'#b6cedd',secondary:'#3b526c',kind:2,rings:true},
 {id:'cosmic-elysium',name:'Elysium',category:['Mundo oceánico','Ocean world'],description:['',''],position:[47,-8,-6],radius:4.3,color:'#68a3bc',secondary:'#233649',kind:1},
 {id:'cosmic-ember',name:'Ember',category:['Mundo volcánico','Volcanic world'],description:['',''],position:[91,-15,-80],radius:3.6,color:'#bf825d',secondary:'#3e2325',kind:3},
];
export const BLACK_HOLE_POSITION:[number,number,number]=[42,32,-85];
export const BLACK_HOLE_RADIUS=6.4;
export const PULSAR_POSITION:[number,number,number]=[-44,29,-110];
export class CameraDirector {
 look=new Vector3(0,0,0);eye=new Vector3();target=new Vector3();stage='';introStart=0;
 /* La cámara se suaviza en sus propias coordenadas (giro, inclinación,
    distancia), no punto a punto: interpolar la posición en línea recta corta
    por dentro del círculo, y cada giro rápido se sentía como un tirón que
    además acercaba y alejaba el sistema. */
 private s:{yaw:number;pitch:number;dist:number}|null=null;
 update(camera:Camera,width:number,height:number,now:number,dt:number){
  const state=useExperience.getState(),mobile=width<700,reduced=motionReduced();
  if(state.immersive){
   camera.position.set(0,7,38);
   const yaw=-navigation.yaw,pitch=navigation.pitch;
   this.target.set(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(80).add(camera.position);
   this.s=null;this.look.copy(this.target);camera.lookAt(this.look);camera.updateMatrixWorld();
   const c=camera as PerspectiveCamera;if(c.isPerspectiveCamera&&c.fov!==65){c.fov=65;c.updateProjectionMatrix();}return;
  }
  if(state.stage!==this.stage){if(state.stage==='intro')this.introStart=now;this.stage=state.stage;}
  /* MIENTRAS CORRE LA HISTORIA MANDA LA PELÍCULA. El encuadre lo decide el
     guion —radio, altura y giro por plano—, no la última vez que alguien
     arrastró el espacio. */
  if(pelicula.activo){
   this.target.copy(pelicula.mira);
   this.eye.set(Math.sin(pelicula.yaw)*Math.cos(pelicula.pitch)*pelicula.distancia,Math.sin(pelicula.pitch)*pelicula.distancia,Math.cos(pelicula.yaw)*Math.cos(pelicula.pitch)*pelicula.distancia).add(this.target);
   const cine=reduced?1:1-Math.exp(-Math.min(dt,.08)*4.5);
   this.s=null;camera.position.lerp(this.eye,cine);this.look.lerp(this.target,cine);camera.lookAt(this.look);camera.updateMatrixWorld();
   const lente=camera as PerspectiveCamera;if(lente.isPerspectiveCamera&&Math.abs(lente.fov-52)>.01){lente.fov=52;lente.updateProjectionMatrix();}
   return;
  }
  // inercia del giro y vuelta suave a la inclinación de siempre
  if(state.stage==='system'&&!navigation.dragging){
   if(reduced)navigation.vyaw=0;
   else if(Math.abs(navigation.vyaw)>.00004){navigation.yaw+=navigation.vyaw*Math.min(dt,.08)*60;navigation.vyaw*=Math.exp(-Math.min(dt,.08)*3.2);navigation.lastInteraction=now;}
   else navigation.vyaw=0;
   if(!state.selected&&now-navigation.lastInteraction>900){const k=1-Math.exp(-Math.min(dt,.08)*1.4);navigation.pitch+=(.6-navigation.pitch)*k;}
  }
  const base=mobile?76:43;let distance=base,yaw=navigation.yaw,pitch=navigation.pitch+(mobile?.38:0);
  this.target.set(0,0,0);
  if(state.stage==='gate'){this.target.set(mobile?-2:-4,mobile?0:-4,0);distance=mobile?65:36;pitch=.65;yaw=-.18;}
  if(state.stage==='galaxies'){this.target.set(10,0,-38);distance=mobile?250:176;}
  if(state.stage==='intro'){const p=Math.min(1,(now-this.introStart)/(state.introDuration*.875)),e=p*p*(3-2*p);distance=base+(150-base)*(1-e);pitch=.6;}
  const world=worlds.find(w=>w.id===state.selected);
  distance*=state.stage==='gate'||state.stage==='intro'?1:navigation.zoom;
  let fov=48;
  if(world&&state.journey){const t=Math.min(1,Math.max(0,(now-state.journey.startedAt)/state.journey.duration)),e=t*t*t;this.target.lerp(locationOf(world),t*t*(3-2*t));distance=base*navigation.zoom*(1-e)+world.radius*1.035*e;fov=48+Math.sin(t*Math.PI)*10;pitch=pitch*(1-t)+.1*t;}
  const factor=reduced?1:1-Math.exp(-Math.min(dt,.08)*(state.stage==='transit'?9:navigation.dragging?10:4.5));
  if(!this.s){
   // se retoma desde donde está la cámara de verdad (tras la película o el visor), sin salto
   const rel=camera.position.clone().sub(this.look),d=rel.length()||distance;
   this.s=d>.001?{yaw:Math.atan2(rel.x,rel.z),pitch:Math.asin(Math.max(-1,Math.min(1,rel.y/d))),dist:d}:{yaw,pitch,dist:distance};
  }
  // el giro siempre por el camino corto: volver al inicio tras diez vueltas no desenrolla diez vueltas
  const sm=this.s,vuelta=Math.PI*2;let dYaw=yaw-sm.yaw;dYaw=((dYaw+Math.PI)%vuelta+vuelta)%vuelta-Math.PI;sm.yaw+=dYaw*factor;sm.pitch+=(pitch-sm.pitch)*factor;sm.dist+=(distance-sm.dist)*factor;
  this.eye.set(Math.sin(sm.yaw)*Math.cos(sm.pitch)*sm.dist,Math.sin(sm.pitch)*sm.dist,Math.cos(sm.yaw)*Math.cos(sm.pitch)*sm.dist);
  this.look.lerp(this.target,factor);camera.position.copy(this.eye).add(this.look);camera.lookAt(this.look);camera.updateMatrixWorld();
  const c=camera as PerspectiveCamera;if(c.isPerspectiveCamera&&Math.abs(c.fov-fov)>.01){c.fov=fov;c.updateProjectionMatrix();}
 }
}
export const labelNodes=new Map<string,HTMLButtonElement>();
export const linkNodes=new Map<string,SVGLineElement>();
/* ── LOS NOMBRES VAN PEGADOS A SU PLANETA ─────────────────────────────────
   Antes cada nombre elegía su sitio UNA vez (como un desfase fijo respecto a
   su planeta) y lo conservaba para siempre. Con las órbitas girando, ese
   desfase —elegido cuando los vecinos estaban en otra parte— terminaba poniendo
   «PULSE2CHAT» encima del planeta de Ordenex: el nombre es un botón, así que
   tocar ese planeta abría el chat. Eso era el «no selecciona bien».

   Ahora cada cuadro se prueban cuatro sitios PEGADOS al planeta (debajo,
   arriba, derecha, izquierda) y se elige el que no pisa ni otro nombre ni otro
   planeta. Para que no baile, cambiar de lado cuesta: el nombre se queda donde
   está mientras ahí no estorbe. Y el movimiento se suaviza, así que un cambio
   de lado es un deslizamiento corto, no un salto. */
export const labelAnchors=new Map<string,{dx:number;dy:number}>();
const labelSides=new Map<string,number>();
const labelPos=new Map<string,{x:number;y:number}>();
export function resetLabelLayout(){labelAnchors.clear();labelSides.clear();labelPos.clear();}

function line(id:string,x1:number,y1:number,x2:number,y2:number,visible:boolean){
 const el=linkNodes.get(id);if(!el)return;el.style.visibility=visible?'visible':'hidden';
 el.setAttribute('x1',String(x1));el.setAttribute('y1',String(y1));el.setAttribute('x2',String(x2));el.setAttribute('y2',String(y2));
}
const embebido=()=>typeof document!=='undefined'&&!!document.querySelector?.('.galaxy-os.is-embedded');
/* LO QUE LA CASA TIENE FLOTANDO ENCIMA. AirTouch, el orbe de AU-RA y la música
   viven sobre el cielo: un nombre que cae debajo queda cortado («PRONT») y no
   se puede tocar. La casa marca esos botones con data-ae-obstaculo y los
   nombres los esquivan igual que esquivan otro planeta. Se miden dos veces por
   segundo, no en cada cuadro: casi nunca se mueven. */
let obstaculos:{x:number;y:number;w:number;h:number}[]=[],obstaculosEn=0;
function medirObstaculos(){
 const ahora=performance.now();if(ahora-obstaculosEn<500)return obstaculos;obstaculosEn=ahora;
 const lienzo=document.querySelector('.galaxy-os canvas')?.getBoundingClientRect();if(!lienzo)return obstaculos=[];
 obstaculos=[...document.querySelectorAll<HTMLElement>('[data-ae-obstaculo]')].map(e=>e.getBoundingClientRect())
  .filter(r=>r.width>0&&r.height>0).map(r=>({x:r.left-lienzo.left-6,y:r.top-lienzo.top-6,w:r.width+12,h:r.height+12}));
 return obstaculos;
}

export function updateLabels(camera:Camera,width:number,height:number){
 const state=useExperience.getState(),mobile=width<700,active=state.stage==='system',selected=!!state.selected;
 navigation.projected.clear();
 const sinAjustes=embebido(); // dentro de la wallet Ajustes ya está en su barra: como planeta sobra
 for(const w of worlds){const center=locationOf(w),p=center.clone().project(camera);navigation.projected.set(w.id,{x:(p.x*.5+.5)*width,y:(-p.y*.5+.5)*height,r:height*w.radius/(camera.position.distanceTo(center)*.89),visible:p.z>0&&p.z<1&&!(sinAjustes&&w.id==='ajustes')});}
 const core=navigation.projected.get('genesis')!,outer=worlds.filter(w=>w.id!=='genesis');
 const occupied:{id:string;x:number;y:number;w:number;h:number}[]=[];
 /* Dentro de la wallet no hay cabecera ni dock nuestros: el margen es el de la
    casa (su barra de arriba y el saludo de abajo), no el de la vista suelta. */
 const emb=embebido();
 const top=emb?(mobile?64:24):(mobile?162:220),bottom=height-(emb?(mobile?170:120):(mobile?192:170));
 // Primero los grandes y el núcleo: son los que más estorban si llegan tarde.
 const ordered=[...worlds].sort((a,b)=>a.id==='genesis'?-1:b.id==='genesis'?1:(navigation.projected.get(b.id)!.r-navigation.projected.get(a.id)!.r));
 const reduced=motionReduced();
 const flotan=emb?medirObstaculos():[];
 const girando=navigation.dragging||Math.abs(navigation.vyaw)>.0025;
 for(const w of ordered){
  const p=navigation.projected.get(w.id)!,node=labelNodes.get(w.id);if(!node)continue;
  const lw=Math.max(56,worldNameLength(w)*(emb?9.6:8.6)+16),lh=w.future?40:22,gap=4;
  // Los cuatro sitios pegados al planeta: [x del centro del nombre, y de su borde de arriba]
  const sitios:[number,number][]=[[p.x,p.y+p.r+gap],[p.x,p.y-p.r-lh-gap],[p.x+p.r+gap+lw/2,p.y-lh/2],[p.x-p.r-gap-lw/2,p.y-lh/2]];
  const antes=labelSides.get(w.id);
  let mejor=0,costeMejor=Infinity;
  sitios.forEach(([cx,cy],i)=>{
   let coste=i*3+(antes!==undefined&&antes!==i?60:0);
   // fuera de pantalla o metido en la zona de la casa
   coste+=Math.max(0,lw/2+8-cx)*40+Math.max(0,cx+lw/2+8-width)*40+Math.max(0,top-cy)*40+Math.max(0,cy+lh-bottom)*40;
   // encima de otro nombre
   // debajo de un botón de la casa
   for(const o of flotan){const ix=Math.max(0,Math.min(cx+lw/2,o.x+o.w)-Math.max(cx-lw/2,o.x)),iy=Math.max(0,Math.min(cy+lh,o.y+o.h)-Math.max(cy,o.y));coste+=ix*iy*12;}
   for(const o of occupied){const ix=Math.max(0,Math.min(cx+lw/2,o.x+o.w/2)-Math.max(cx-lw/2,o.x-o.w/2)+6),iy=Math.max(0,Math.min(cy+lh,o.y+o.h)-Math.max(cy,o.y)+4);coste+=ix*iy*8;}
   // encima de OTRO planeta: lo que hacía que tocar uno abriera otro
   for(const [id,b] of navigation.projected){if(id===w.id||!b.visible)continue;
    const dx=Math.max(Math.abs(b.x-cx)-lw/2,0),dy=Math.max(cy-b.y,b.y-(cy+lh),0),pisa=Math.max(0,b.r+10-Math.hypot(dx,dy));coste+=pisa*pisa*6;}
   if(coste<costeMejor){costeMejor=coste;mejor=i;}
  });
  labelSides.set(w.id,mejor);
  let [x,y]=sitios[mejor];
  x=Math.max(lw/2+8,Math.min(width-lw/2-8,x));y=Math.max(top,Math.min(bottom-lh,y));
  const previo=labelPos.get(w.id);
  if(previo&&!reduced&&active&&!girando){const k=.35;x=previo.x+(x-previo.x)*k;y=previo.y+(y-previo.y)*k;}
  labelPos.set(w.id,{x,y});
  occupied.push({id:w.id,x,y,w:lw,h:lh});
  node.style.width=lw+'px';node.style.transform='translate('+x.toFixed(2)+'px,'+y.toFixed(2)+'px) translate(-50%,0)';
  const labelVisible=active&&p.visible&&(!state.immersive||(p.x>0&&p.x<width&&p.y>60&&p.y<height-70));
  // Mientras el sistema gira, los nombres se apagan en vez de bailar de un lado
  // a otro; vuelven con un fundido cuando el giro se asienta.
  node.style.visibility=labelVisible?'visible':'hidden';node.style.opacity=labelVisible&&!girando?'1':'0';node.style.pointerEvents=girando?'none':'';node.tabIndex=labelVisible?0:-1;
  node.dataset.core=String(w.id==='genesis');node.dataset.active=String(w.id===state.selected);
  // Pegado al planeta ya no hace falta la línea guía; solo si quedó lejos por el borde.
  line('label-'+w.id,p.x,p.y,x,y+lh/2,active&&p.visible&&Math.hypot(x-p.x,y+lh/2-p.y)>p.r+lh+24);
  if(w.id!=='genesis'){
   line('core-'+w.id,core.x,core.y,p.x,p.y,active&&p.visible&&(!selected||w.id===state.selected));
   const other=navigation.projected.get(outer[(outer.indexOf(w)+1)%outer.length].id)!;
   line('peer-'+w.id,p.x,p.y,other.x,other.y,active&&w.id===state.selected&&p.visible&&other.visible);
  }
 }
}
const worldNameLength=(w:World)=>{const n=w.name;return usePreferences.getState().prefs.lang==='en'&&w.id==='ajustes'?8:n.length;};
export function projectedHit(x:number,y:number){
 let best:string|null=null,distance=Infinity;
 for(const [id,p] of navigation.projected){if(!p.visible)continue;const d=Math.hypot(x-p.x,y-p.y),reach=Math.max(30,p.r*1.2);if(d<reach&&d/reach<distance){best=id;distance=d/reach;}}
 return best;
}
export function bindSceneInput(canvas:HTMLCanvasElement){
 let startX=0,startY=0,lastX=0,lastY=0,travel=0,dragging=false,pinch=0;const points=new Map<number,{x:number;y:number}>();
 const hit=(e:PointerEvent)=>{const b=canvas.getBoundingClientRect();return projectedHit(e.clientX-b.left,e.clientY-b.top);};
 const down=(e:PointerEvent)=>{if(!['system','galaxies'].includes(useExperience.getState().stage)||document.querySelector('dialog[open]'))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});startX=lastX=e.clientX;startY=lastY=e.clientY;travel=0;dragging=false;canvas.setPointerCapture(e.pointerId);navigation.lastInteraction=performance.now();};
 const move=(e:PointerEvent)=>{
  if(!points.has(e.pointerId)){const id=useExperience.getState().stage==='system'?hit(e):null;if(id!==navigation.hovered)navigation.hover(id);canvas.style.cursor=id?'pointer':'grab';return;}
  points.set(e.pointerId,{x:e.clientX,y:e.clientY});travel=Math.max(travel,Math.hypot(e.clientX-startX,e.clientY-startY));
  if(points.size===2){const p=[...points.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch>1&&d>1)navigation.dolly(pinch/d);pinch=d;dragging=true;}
  else if(travel>4){dragging=true;navigation.dragging=true;navigation.orbit(e.clientX-lastX,e.clientY-lastY);canvas.style.cursor='grabbing';}
  lastX=e.clientX;lastY=e.clientY;
 };
 const up=(e:PointerEvent)=>{if(dragging&&points.size<=1)navigation.release();if(points.has(e.pointerId)&&!dragging&&travel<=4&&useExperience.getState().stage==='system'){const id=hit(e);if(id)navigation.focus(id);}points.delete(e.pointerId);pinch=0;canvas.style.cursor='grab';};
 const cancel=(e:PointerEvent)=>{points.delete(e.pointerId);pinch=0;if(!points.size)navigation.release();};
 const leave=()=>navigation.hover(null);
 const wheel=(e:WheelEvent)=>{if(!['system','galaxies'].includes(useExperience.getState().stage))return;e.preventDefault();navigation.dolly(Math.exp(Math.max(-120,Math.min(120,e.deltaY))*.0018));};
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('wheel',wheel,{passive:false});
 navigation.hitTest=(x,y)=>{const b=canvas.getBoundingClientRect();return projectedHit(x-b.left,y-b.top);};
 return()=>{points.clear();navigation.hitTest=()=>null;navigation.projected.clear();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('wheel',wheel);};
}
