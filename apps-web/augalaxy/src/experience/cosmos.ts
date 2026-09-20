import {Camera,PerspectiveCamera,Vector3} from 'three';
import {worlds,World} from './catalog';
import {navigation,useExperience,motionReduced} from './navigation';
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
 if(!state.immersive&&prefs.autoOrbit&&!motionReduced()&&!state.selected&&!state.hovered&&!state.settings&&!state.directory&&!state.windowId&&!state.tutorial&&now-navigation.lastInteraction>650)orbitalTime+=Math.min(.04,dt);
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
 update(camera:Camera,width:number,height:number,now:number,dt:number){
  const state=useExperience.getState(),mobile=width<700,reduced=motionReduced();
  if(state.immersive){
   camera.position.set(0,7,38);
   const yaw=-navigation.yaw,pitch=navigation.pitch;
   this.target.set(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(80).add(camera.position);
   this.look.copy(this.target);camera.lookAt(this.look);camera.updateMatrixWorld();
   const c=camera as PerspectiveCamera;if(c.isPerspectiveCamera&&c.fov!==65){c.fov=65;c.updateProjectionMatrix();}return;
  }
  if(state.stage!==this.stage){if(state.stage==='intro')this.introStart=now;this.stage=state.stage;}
  const base=mobile?76:43;let distance=base,yaw=navigation.yaw,pitch=navigation.pitch+(mobile?.38:0);
  this.target.set(0,0,0);
  if(state.stage==='gate'){this.target.set(mobile?-2:-4,mobile?0:-4,0);distance=mobile?65:36;pitch=.65;yaw=-.18;}
  if(state.stage==='galaxies'){this.target.set(10,0,-38);distance=mobile?250:176;}
  if(state.stage==='intro'){const p=Math.min(1,(now-this.introStart)/4200),e=p*p*(3-2*p);distance=base+(150-base)*(1-e);pitch=.6;}
  const world=worlds.find(w=>w.id===state.selected);
  distance*=state.stage==='gate'||state.stage==='intro'?1:navigation.zoom;
  let fov=48;
  if(world&&state.journey){const t=Math.min(1,Math.max(0,(now-state.journey.startedAt)/state.journey.duration)),e=t*t*t;this.target.lerp(locationOf(world),t*t*(3-2*t));distance=base*navigation.zoom*(1-e)+world.radius*1.035*e;fov=48+Math.sin(t*Math.PI)*10;pitch=pitch*(1-t)+.1*t;}
  this.eye.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance).add(this.target);
  const factor=reduced?1:1-Math.exp(-Math.min(dt,.08)*(state.stage==='transit'?8:state.stage==='system'&&now-navigation.lastInteraction<250?12:5));
  camera.position.lerp(this.eye,factor);this.look.lerp(this.target,factor);camera.lookAt(this.look);camera.updateMatrixWorld();
  const c=camera as PerspectiveCamera;if(c.isPerspectiveCamera&&Math.abs(c.fov-fov)>.01){c.fov=fov;c.updateProjectionMatrix();}
 }
}
export const labelNodes=new Map<string,HTMLButtonElement>();
export const linkNodes=new Map<string,SVGLineElement>();
// Choose an anchor once per viewport, never again during orbit, hover or selection.
// Re-solving the discrete candidates every frame caused visible side-switching.
export const labelAnchors=new Map<string,{dx:number;dy:number}>();
let labelViewport='';
const labelSides=new Map<string,number>();
export function resetLabelLayout(){labelAnchors.clear();labelSides.clear();labelViewport='';}

function line(id:string,x1:number,y1:number,x2:number,y2:number,visible:boolean){
 const el=linkNodes.get(id);if(!el)return;el.style.visibility=visible?'visible':'hidden';
 el.setAttribute('x1',String(x1));el.setAttribute('y1',String(y1));el.setAttribute('x2',String(x2));el.setAttribute('y2',String(y2));
}
export function updateLabels(camera:Camera,width:number,height:number){
 const state=useExperience.getState(),mobile=width<700,active=state.stage==='system',selected=!!state.selected;
 navigation.projected.clear();
 for(const w of worlds){const center=locationOf(w),p=center.clone().project(camera);navigation.projected.set(w.id,{x:(p.x*.5+.5)*width,y:(-p.y*.5+.5)*height,r:height*w.radius/(camera.position.distanceTo(center)*.89),visible:p.z>0&&p.z<1});}
 const core=navigation.projected.get('genesis')!,outer=worlds.filter(w=>w.id!=='genesis');
 const occupied:{id:string;x:number;y:number;w:number;h:number}[]=[];
 const bodies=[...navigation.projected.values()];
 const ordered=[...worlds].sort((a,b)=>a.id==='genesis'?-1:b.id==='genesis'?1:0);
 const viewport=String(width); // Mobile browser chrome changes height while scrolling.
 if(viewport!==labelViewport){labelAnchors.clear();labelSides.clear();labelViewport=viewport;}
 const top=mobile?162:220,bottom=height-(mobile?192:170);
 for(const w of ordered){
  const p=navigation.projected.get(w.id)!,node=labelNodes.get(w.id);if(!node)continue;
  const lw=Math.max(60,w.name.length*(mobile?7.3:8)+14),lh=mobile?28:32;
  const raw=w.id==='genesis'?[[p.x,p.y-p.r-lh-7],[p.x,p.y+p.r+8]]:[[p.x,p.y+p.r+6],[p.x,p.y-p.r-lh-5],[p.x-p.r-lw/2-8,p.y-lh/2],[p.x+p.r+lw/2+8,p.y-lh/2]];
  for(let radius=1;radius<=3;radius++)for(let i=0;i<8;i++){const angle=i*Math.PI/4;raw.push([p.x+Math.cos(angle)*(p.r+lw*.5+radius*15),p.y+Math.sin(angle)*(p.r+radius*22)-lh/2]);}
  let best={x:width/2,y:top,score:Infinity};
  for(const [cx,cy] of labelAnchors.has(w.id)?[]:raw){
   const x=Math.max(lw/2+10,Math.min(width-lw/2-10,cx)),y=Math.max(top,Math.min(bottom-lh,cy));
   let score=Math.hypot(x-p.x,y+lh/2-p.y);
   for(const o of occupied){const ix=Math.max(0,Math.min(x+lw/2,o.x+o.w/2)-Math.max(x-lw/2,o.x-o.w/2)+10),iy=Math.max(0,Math.min(y+lh,o.y+o.h)-Math.max(y,o.y)+8);score+=ix*iy*12;}
   for(const body of bodies){const dx=Math.max(Math.abs(body.x-x)-lw/2,0),dy=Math.max(y-body.y,body.y-y-lh,0);score+=Math.max(0,body.r+5-Math.hypot(dx,dy))*35;}
   if(score<best.score)best={x,y,score};
  }
  let anchor=labelAnchors.get(w.id);
  if(!anchor&&active){anchor={dx:best.x-p.x,dy:best.y-p.y};labelAnchors.set(w.id,anchor);}
  const x=anchor?Math.max(lw/2+10,Math.min(width-lw/2-10,p.x+anchor.dx)):best.x;
  let y=anchor?Math.max(top,Math.min(bottom-lh,p.y+anchor.dy)):best.y;
  // Continuous separation, with a persistent side for every pair. No candidate flips.
  for(const o of active?occupied:[]){
   const key=w.id+':'+o.id;
   if(!labelSides.has(key))labelSides.set(key,y>=o.y?1:-1);
   const side=labelSides.get(key)!,overlap=(lw+o.w)/2+12-Math.abs(x-o.x);
   if(overlap>0){const separation=lh+9,delta=side>0?Math.max(0,o.y+separation-y):Math.min(0,o.y-separation-y);
    y+=delta*Math.min(1,overlap/24);
   }
  }
  y=Math.max(top,Math.min(bottom-lh,y));
  occupied.push({id:w.id,x,y,w:lw,h:lh});
  node.style.width=lw+'px';node.style.transform='translate('+x.toFixed(2)+'px,'+y.toFixed(2)+'px) translate(-50%,0)';
  const labelVisible=active&&(!state.immersive||(p.visible&&p.x>0&&p.x<width&&p.y>60&&p.y<height-70));
  node.style.visibility=labelVisible?'visible':'hidden';node.style.opacity=labelVisible?'1':'0';node.tabIndex=labelVisible?0:-1;
  node.dataset.core=String(w.id==='genesis');node.dataset.active=String(w.id===state.selected);
  line('label-'+w.id,p.x,p.y,x,y+lh/2,active&&p.visible&&Math.hypot(x-p.x,y+lh/2-p.y)>p.r+30);
  if(w.id!=='genesis'){
   line('core-'+w.id,core.x,core.y,p.x,p.y,active&&p.visible&&(!selected||w.id===state.selected));
   const other=navigation.projected.get(outer[(outer.indexOf(w)+1)%outer.length].id)!;
   line('peer-'+w.id,p.x,p.y,other.x,other.y,active&&w.id===state.selected&&p.visible&&other.visible);
  }
 }

}
export function projectedHit(x:number,y:number){
 let best:string|null=null,distance=Infinity;
 for(const [id,p] of navigation.projected){if(!p.visible)continue;const d=Math.hypot(x-p.x,y-p.y),reach=Math.max(28,p.r*1.15);if(d<reach&&d/reach<distance){best=id;distance=d/reach;}}
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
  else if(travel>4){dragging=true;navigation.orbit(e.clientX-lastX,e.clientY-lastY);canvas.style.cursor='grabbing';}
  lastX=e.clientX;lastY=e.clientY;
 };
 const up=(e:PointerEvent)=>{if(points.has(e.pointerId)&&!dragging&&travel<=4&&useExperience.getState().stage==='system'){const id=hit(e);if(id)navigation.focus(id);}points.delete(e.pointerId);pinch=0;canvas.style.cursor='grab';};
 const cancel=(e:PointerEvent)=>{points.delete(e.pointerId);pinch=0;};
 const leave=()=>navigation.hover(null);
 const wheel=(e:WheelEvent)=>{if(!['system','galaxies'].includes(useExperience.getState().stage))return;e.preventDefault();navigation.dolly(Math.exp(Math.max(-120,Math.min(120,e.deltaY))*.0018));};
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('wheel',wheel,{passive:false});
 navigation.hitTest=(x,y)=>{const b=canvas.getBoundingClientRect();return projectedHit(x-b.left,y-b.top);};
 return()=>{points.clear();navigation.hitTest=()=>null;navigation.projected.clear();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('wheel',wheel);};
}
