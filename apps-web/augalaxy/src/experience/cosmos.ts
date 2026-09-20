import {Camera,PerspectiveCamera,Vector3} from 'three';
import {worlds,World} from './catalog';
import {navigation,useExperience,motionReduced} from './navigation';
import {usePreferences} from './preferences';

export const SUN_RADIUS=2.75;
export const orbitRadii=[11,18];
const angles=[2.55,4.3,5.45,.35,1.4,3.4,5.95,4.65,.9,2.1,1.65];
export const orbitPositions=new Map(worlds.map((w,i)=>[w.id,new Vector3(...w.position)]));
let orbitalTime=0,lastOrbitFrame=-1;
export function updateOrbits(now:number,dt:number){
 if(Math.abs(now-lastOrbitFrame)<.5)return;lastOrbitFrame=now;
 const state=useExperience.getState(),prefs=usePreferences.getState().prefs;
 if(prefs.autoOrbit&&!motionReduced()&&!state.selected&&!state.hovered&&!state.settings&&!state.directory&&!state.windowId&&now-navigation.lastInteraction>1400)orbitalTime+=Math.min(.04,dt);
 worlds.forEach((w,i)=>{const radius=i<5?11:18,angle=angles[i]+orbitalTime*(i<5?.006:.0038);orbitPositions.get(w.id)!.set(Math.cos(angle)*radius,Math.sin(angle*2+i)*.24,Math.sin(angle)*radius);});
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
  if(state.stage!==this.stage){if(state.stage==='intro')this.introStart=now;this.stage=state.stage;}
  const base=mobile?80:43;let distance=base,yaw=navigation.yaw,pitch=navigation.pitch;
  this.target.set(0,0,0);
  if(state.stage==='gate'){this.target.set(mobile?-2:-4,mobile?0:-4,0);distance=mobile?65:36;pitch=.65;yaw=-.18;}
  if(state.stage==='galaxies'){this.target.set(10,0,-38);distance=mobile?250:176;}
  if(state.stage==='intro'){const p=Math.min(1,(now-this.introStart)/4200),e=p*p*(3-2*p);distance=base+(150-base)*(1-e);pitch=.6;}
  const world=worlds.find(w=>w.id===state.selected);
  if(world&&(state.stage==='system'||state.stage==='transit')){
   this.target.copy(locationOf(world));this.target.x+=mobile?0:world.radius*.85;
   this.target.y+=mobile?-world.radius*.55:0;
   distance=world.radius*(mobile?9.3:7.6);pitch=.12;
  }
  distance*=state.stage==='gate'||state.stage==='intro'?1:navigation.zoom;
  let fov=48;
  if(world&&state.journey){const t=Math.min(1,Math.max(0,(now-state.journey.startedAt)/state.journey.duration)),e=t*t*t;this.target.lerp(locationOf(world),t);distance=world.radius*(7.6*(1-e)+1.035*e);fov=48+Math.sin(t*Math.PI)*10;pitch=.1;}
  this.eye.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance).add(this.target);
  const factor=reduced?1:1-Math.exp(-Math.min(dt,.08)*(state.stage==='transit'?8:3.8));
  camera.position.lerp(this.eye,factor);this.look.lerp(this.target,factor);camera.lookAt(this.look);camera.updateMatrixWorld();
  const c=camera as PerspectiveCamera;if(c.isPerspectiveCamera&&Math.abs(c.fov-fov)>.01){c.fov=fov;c.updateProjectionMatrix();}
 }
}
export const labelNodes=new Map<string,HTMLButtonElement>();
const projected=new Vector3();
export function updateLabels(camera:Camera,width:number,height:number){
 const state=useExperience.getState(),prefs=usePreferences.getState().prefs,occupied:{x:number;y:number;width:number}[]=[],mobile=width<700;
 navigation.projected.clear();
 const ordered=[...worlds].sort((a,b)=>(a.id===state.selected?-1:b.id===state.selected?1:camera.position.distanceToSquared(locationOf(a))-camera.position.distanceToSquared(locationOf(b))));
 const bodies=worlds.map(w=>{const p=locationOf(w).clone().project(camera);return{x:(p.x*.5+.5)*width,y:(-p.y*.5+.5)*height,r:height*w.radius/(camera.position.distanceTo(locationOf(w))*.89)};});
 const sun=new Vector3().project(camera);bodies.push({x:(sun.x*.5+.5)*width,y:(-sun.y*.5+.5)*height,r:height*SUN_RADIUS/(camera.position.length()*.89)+12});
 for(const world of ordered){
  const center=locationOf(world);projected.copy(center).project(camera);const x=(projected.x*.5+.5)*width,cy=(-projected.y*.5+.5)*height;
  const distance=camera.position.distanceTo(center),r=height*world.radius/(distance*.89),visible=projected.z>0&&projected.z<1;
  navigation.projected.set(world.id,{x,y:cy,r,visible});
  const node=labelNodes.get(world.id);if(!node)continue;
  const labelWidth=Math.max(mobile?125:148,world.name.length*8*prefs.textScale),labelHeight=54*prefs.textScale;
  const fits=(y:number)=>x>labelWidth/2+8&&x<width-labelWidth/2-8&&y>(mobile?175:110)&&y<height-(mobile?202:174)&&!occupied.some(o=>Math.abs(x-o.x)<(labelWidth+o.width)*.5+8&&Math.abs(y-o.y)<labelHeight+8)&&!bodies.some(b=>{const dx=Math.max(Math.abs(b.x-x)-labelWidth/2,0),dy=Math.max(y-b.y,b.y-y-labelHeight,0);return dx*dx+dy*dy<(b.r+5)*(b.r+5);});
  const y=[cy+r+12,cy-r-labelHeight-14].find(fits);
  const available=state.stage==='system'&&prefs.labels&&visible&&y!==undefined&&!state.selected;
  node.style.transform='translate('+Math.round(x)+'px,'+Math.round(y??0)+'px) translate(-50%,0)';node.style.visibility=available?'visible':'hidden';node.style.opacity=available?'1':'0';node.tabIndex=available?0:-1;node.dataset.above=String(y!==undefined&&y<cy);
  if(available)occupied.push({x,y:y!,width:labelWidth});
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
  else if(travel>8){dragging=true;navigation.orbit(e.clientX-lastX,e.clientY-lastY);canvas.style.cursor='grabbing';}
  lastX=e.clientX;lastY=e.clientY;
 };
 const up=(e:PointerEvent)=>{if(points.has(e.pointerId)&&!dragging&&travel<=8&&useExperience.getState().stage==='system'){const id=hit(e);if(id)navigation.focus(id);}points.delete(e.pointerId);pinch=0;canvas.style.cursor='grab';};
 const cancel=(e:PointerEvent)=>{points.delete(e.pointerId);pinch=0;};
 const leave=()=>navigation.hover(null);
 const wheel=(e:WheelEvent)=>{if(!['system','galaxies'].includes(useExperience.getState().stage))return;e.preventDefault();navigation.dolly(Math.exp(Math.max(-120,Math.min(120,e.deltaY))*.0018));};
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('wheel',wheel,{passive:false});
 navigation.hitTest=(x,y)=>{const b=canvas.getBoundingClientRect();return projectedHit(x-b.left,y-b.top);};
 return()=>{points.clear();navigation.hitTest=()=>null;navigation.projected.clear();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('wheel',wheel);};
}
