import {useEffect,useRef} from 'react';
import {PerspectiveCamera,Vector3} from 'three';
import {worlds,externalGalaxies,World} from './catalog';
import {navigation,useExperience} from './navigation';
import {usePreferences} from './preferences';
import {sound} from './sound';
import {textureFor,surfacePixels} from './textures';

const assets=new Map<string,HTMLCanvasElement>();
function random(seed:number){let s=seed;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const lattice=Float32Array.from({length:32768},random(781));
function noise(x:number,y:number,z:number){
 const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z),u=x-a,v=y-b,w=z-c;
 const f=(t:number)=>t*t*(3-2*t),mix=(p:number,q:number,t:number)=>p+(q-p)*t;
 const h=(i:number,j:number,k:number)=>lattice[((Math.imul(i,73856093)^Math.imul(j,19349663)^Math.imul(k,83492791))>>>0)%32768];
 return mix(mix(mix(h(a,b,c),h(a+1,b,c),f(u)),mix(h(a,b+1,c),h(a+1,b+1,c),f(u)),f(v)),mix(mix(h(a,b,c+1),h(a+1,b,c+1),f(u)),mix(h(a,b+1,c+1),h(a+1,b+1,c+1),f(u)),f(v)),f(w));
}
function fbm(x:number,y:number,z:number){let n=0,a=.5;for(let i=0;i<5;i++){n+=a*noise(x,y,z);x=x*2.03+7.1;y=y*2.03+1.7;z=z*2.03+9.2;a*=.5;}return n;}
function rgb(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
function planetAsset(w:World,index:number,surface?:ImageData,clouds?:ImageData){
 if(!surface&&assets.has(w.id))return assets.get(w.id)!;
 const c=document.createElement('canvas');c.width=c.height=640;const ctx=c.getContext('2d')!,im=ctx.createImageData(640,640),primary=rgb(w.color),secondary=rgb(w.secondary);
 for(let y=0;y<640;y++)for(let x=0;x<640;x++){
  const nx=(x-320)/319,ny=(y-320)/319,r2=nx*nx+ny*ny;if(r2>=1)continue;const nz=Math.sqrt(1-r2),sx=nx*3.4+index*7.3,sy=ny*3.4,sz=nz*3.4,n=surface?0:fbm(sx,sy,sz),fine=surface?0:noise(nx*130+index,ny*130,nz*130);let col:number[];
  if(surface){const u=((Math.atan2(nz,nx)/Math.PI/2+.5+index*.13)%1+1)%1,v=Math.acos(-ny)/Math.PI,tx=Math.floor(u*(surface.width-1)),ty=Math.floor(v*(surface.height-1)),k=(ty*surface.width+tx)*4;col=[surface.data[k],surface.data[k+1],surface.data[k+2]];
   if(w.kind===2)col=col.map((n,j)=>n*(.62+primary[j]/255*.46));
   if(w.id==='pay')col=[col[0]*.78,col[1],col[2]*.86];
   if(clouds&&w.kind===1){const ck=(Math.floor(v*(clouds.height-1))*clouds.width+Math.floor(u*(clouds.width-1)))*4,alpha=clouds.data[ck]/255*.74;col=col.map(v=>v*(1-alpha)+235*alpha);}
  }
  else if(w.kind===0){const curl=fbm(nx*6+index,ny*13,nz*6),band=.5+.5*Math.sin(ny*59+curl*8),thread=Math.pow(.5+.5*Math.sin(ny*400+curl*35),5);col=primary.map((v,j)=>(secondary[j]+(v-secondary[j])*(.18+.82*band))*(.83+fine*.24)+thread*15);}
  else if(w.kind===1){const sea=n<.5;col=sea?primary.map((v,j)=>secondary[j]+(v-secondary[j])*(.16+fine*.18)):[62+n*45,73+n*47,45+n*31];const ice=Math.max(0,Math.min(1,(Math.abs(ny)+n*.13-.87)*12));col=col.map(v=>v*(1-ice)+225*ice);const cloud=Math.max(0,Math.min(.9,(fbm(nx*9+index,ny*9,nz*9)-.52)*6));col=col.map(v=>v*(1-cloud)+237*cloud);}
  else{const ridge=Math.pow(Math.abs(noise(nx*31+index,ny*31,nz*31)*2-1),.5);col=primary.map((v,j)=>(secondary[j]+(v-secondary[j])*n)*(.63+fine*.3+ridge*.32));}
  const light=Math.max(0,-nx*.58-ny*.42+nz*.69),shade=.035+1.08*Math.pow(light,.65);const rim=Math.pow(1-nz,4)*.19*Math.max(.1,light),k=(y*640+x)*4;
  for(let j=0;j<3;j++)im.data[k+j]=Math.min(255,col[j]*shade+primary[j]*rim);im.data[k+3]=Math.min(255,(1-r2)*1000);
 }
 ctx.putImageData(im,0,0);assets.set(w.id,c);return c;
}
function galaxyAsset(seed:number,color:string){
 const key='galaxy'+seed;if(assets.has(key))return assets.get(key)!;
 const c=document.createElement('canvas');c.width=c.height=1800;const ctx=c.getContext('2d')!,rand=random(seed),tone=rgb(color);
 const glow=ctx.createRadialGradient(900,900,0,900,900,430);glow.addColorStop(0,'rgba(255,232,190,.6)');glow.addColorStop(.1,'rgba(230,209,179,.3)');glow.addColorStop(.35,'rgba(144,145,168,.08)');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(0,0,1800,1800);
 for(let i=0;i<30000;i++){
  const r=Math.pow(rand(),.73)*835,a=(i%4)*Math.PI/2+r/835*5.5+(rand()-.5)*(.4+r/835*1.35),x=900+Math.cos(a)*r,y=900+Math.sin(a)*r,t=r/835;
  const size=.4+Math.pow(rand(),5)*2.2;ctx.fillStyle='rgba('+tone.map((v,j)=>Math.round([248,223,180][j]*(1-t)+v*t)).join(',')+','+(.1+rand()*.55)+')';ctx.fillRect(x,y,size,size);
  if(i%28===0){const haze=ctx.createRadialGradient(x,y,0,x,y,25);haze.addColorStop(0,'rgba('+tone.join(',')+',.045)');haze.addColorStop(1,'transparent');ctx.fillStyle=haze;ctx.fillRect(x-25,y-25,50,50);}
 }
 assets.set(key,c);return c;
}
type Projection={world:World;x:number;y:number;r:number;depth:number};
export default function CompatibleUniverse({paused,labels}:{paused:boolean;labels:Map<string,HTMLButtonElement>}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current!,ctx=canvas.getContext('2d');if(!ctx){useExperience.getState().set({unsupported:true});return;}
  const camera=new PerspectiveCamera(48,1,.1,1000),look=new Vector3(0,1,0),target=new Vector3(),eye=new Vector3(),p=new Vector3();camera.position.set(0,5,38);
  let disposed=false;
  const sprites=worlds.map((w,i)=>planetAsset(w,i)),galaxies=[galaxyAsset(41,'#a2b4d3'),...externalGalaxies.map(g=>galaxyAsset(g.seed,g.color))];
  worlds.forEach((w,i)=>{void Promise.all([surfacePixels(textureFor(w)),w.kind===1?surfacePixels('earth_clouds'):Promise.resolve(undefined)]).then(([surface,clouds])=>{if(!disposed)sprites[i]=planetAsset(w,i,surface,clouds);}).catch(()=>{});});
  const rand=random(54),stars=Array.from({length:900},()=>({x:rand(),y:rand(),r:.3+Math.pow(rand(),6)*1.5,a:.15+rand()*.55}));
  let width=0,height=0,raf=0,previous=performance.now(),elapsed=0,introStart=0,previousStage='',hits:Projection[]=[],frames=0,measure=previous,planetScale=1;
  const resize=()=>{const b=canvas.getBoundingClientRect();width=b.width;height=b.height;const quality=usePreferences.getState().prefs.quality,dpr=Math.min(devicePixelRatio,quality==='high'?2:quality==='low'?1:1.5);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);camera.aspect=width/height;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();const unsubscribe=usePreferences.subscribe((s,old)=>{if(s.prefs.quality!==old.prefs.quality)resize();});
  const project=(position:[number,number,number])=>{p.fromArray(position).project(camera);return{x:(p.x*.5+.5)*width,y:(-.5*p.y+.5)*height,visible:p.z>0&&p.z<1};};
  const draw=(now:number)=>{
   raf=requestAnimationFrame(draw);const dt=Math.min(.1,(now-previous)/1000);previous=now;if(paused||!width||!height)return;
   const state=useExperience.getState(),prefs=usePreferences.getState().prefs,reduced=document.documentElement.dataset.motion==='reduced',mobile=width<700;if(!reduced)elapsed+=dt;
   if(state.stage!==previousStage){if(state.stage==='intro')introStart=elapsed;previousStage=state.stage;}
   target.set(0,.6,-1);let distance=mobile?48:29;const selected=worlds.find(w=>w.id===state.selected);
   if(state.stage==='gate'){target.set(-3,mobile?1:-3,0);distance=mobile?38:23;}
   if(state.stage==='galaxies'){target.set(0,0,-45);distance=mobile?230:160;}
   if(state.stage==='intro'){const t=Math.min(1,(elapsed-introStart)/4.4),ease=t*t*(3-2*t);distance=(mobile?110:78)*(1-ease)+(mobile?48:29)*ease;}
   if(selected&&state.stage==='system'){target.fromArray(selected.position);target.x+=mobile?0:selected.radius*1.1;distance=selected.radius*(mobile?8:6.4);}
   const yaw=state.stage==='gate'?-.1:navigation.yaw,pitch=state.stage==='gate'?.06:navigation.pitch;distance*=state.stage==='gate'||state.stage==='intro'?1:navigation.zoom;
   eye.set(Math.sin(yaw)*distance,Math.sin(pitch)*distance+2.5,Math.cos(yaw)*distance).add(target);const ease=reduced?1:1-Math.exp(-dt*2.5);camera.position.lerp(eye,ease);look.lerp(target,ease);camera.lookAt(look);camera.updateMatrixWorld();
   ctx.clearRect(0,0,width,height);ctx.fillStyle='#02040a';ctx.fillRect(0,0,width,height);
   for(const s of stars){ctx.globalAlpha=s.a*(.9+.1*Math.sin(elapsed*.4+s.x*30));ctx.fillStyle='#d5dfec';ctx.fillRect((s.x*width-navigation.yaw*30+width)%width,s.y*height,s.r,s.r);}ctx.globalAlpha=1;
   const galaxyList=[{position:[0,-7,-28] as [number,number,number],radius:62},...externalGalaxies.map(g=>({position:g.position,radius:24}))];
   galaxyList.forEach((g,i)=>{const q=project(g.position);if(!q.visible)return;const d=camera.position.distanceTo(new Vector3(...g.position)),r=height*g.radius/(d*.89);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(-.19+i*.37+elapsed*.004);ctx.scale(1,.38+i*.1);ctx.globalAlpha=state.stage==='galaxies'?.9:.65;ctx.drawImage(galaxies[i],-r,-r,r*2,r*2);ctx.restore();});
   planetScale+=((state.stage==='galaxies'?.015:1)-planetScale)*ease;
   hits=worlds.map(world=>{const q=project(world.position),depth=camera.position.distanceTo(new Vector3(...world.position));return{world,x:q.x,y:q.y,r:q.visible?height*world.radius*planetScale/(depth*.89):0,depth};}).sort((a,b)=>b.depth-a.depth);
   for(const h of hits){if(h.r<1||h.x+h.r*2<0||h.x-h.r*2>width||h.y+h.r*2<0||h.y-h.r*2>height)continue;const w=h.world,i=worlds.indexOf(w);ctx.save();ctx.translate(h.x,h.y);ctx.rotate(-.17+i*.025);
    const rings=(front:boolean)=>{if(!w.rings)return;ctx.save();ctx.scale(1,.28);for(let band=0;band<100;band++){const r=h.r*(1.28+band/100*.86);ctx.beginPath();ctx.arc(0,0,r,front?0:Math.PI,front?Math.PI:Math.PI*2);ctx.lineWidth=h.r*.009;ctx.strokeStyle='rgba('+rgb(w.color).join(',')+','+((Math.abs(band-60)<4)?.06:.2+.18*Math.sin(band*2.7))+')';ctx.stroke();}ctx.restore();};
    rings(false);const glow=ctx.createRadialGradient(0,0,h.r*.95,0,0,h.r*1.065);glow.addColorStop(0,'rgba('+rgb(w.color).join(',')+',.15)');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(-h.r*1.07,-h.r*1.07,h.r*2.14,h.r*2.14);ctx.drawImage(sprites[i],-h.r,-h.r,h.r*2,h.r*2);rings(true);ctx.restore();
   }
   const occupied:{x:number;y:number}[]=[];
   for(const h of [...hits].reverse()){const node=labels.get(h.world.id);if(!node)continue;const y=h.y+h.r*1.16,x=h.x,overlap=occupied.some(o=>Math.abs(x-o.x)<160*prefs.textScale&&Math.abs(y-o.y)<60*prefs.textScale),occluded=hits.some(o=>o.world!==h.world&&o.depth<h.depth&&Math.abs(x-o.x)<o.r+60&&Math.abs(y+22-o.y)<o.r+20);const visible=state.stage==='system'&&prefs.labels&&h.r>1&&x>80&&x<width-80&&y>100&&y<height-130&&!overlap&&!occluded&&(!selected||h.world.id===selected.id);node.style.transform='translate('+x+'px,'+y+'px) translate(-50%,0)';node.style.visibility=visible?'visible':'hidden';node.style.opacity=visible?'1':'0';node.tabIndex=visible?0:-1;if(visible)occupied.push({x,y});}
   frames++;if(now-measure>2000){useExperience.getState().set({fps:Math.round(frames*1000/(now-measure))});measure=now;frames=0;}
  };
  const hit=(x:number,y:number)=>{const b=canvas.getBoundingClientRect();return[...hits].reverse().find(h=>Math.hypot(x-b.left-h.x,y-b.top-h.y)<h.r)?.world.id||null;};navigation.hitTest=hit;
  let lastX=0,lastY=0,travel=0;const pointers=new Map<number,{x:number;y:number}>();let pinch=0;
  const down=(e:PointerEvent)=>{if(!['system','galaxies'].includes(useExperience.getState().stage))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});lastX=e.clientX;lastY=e.clientY;travel=0;canvas.setPointerCapture(e.pointerId);};
  const move=(e:PointerEvent)=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});travel+=Math.hypot(e.clientX-lastX,e.clientY-lastY);if(pointers.size===2){const a=[...pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(pinch)navigation.dolly(pinch/d);pinch=d;}else navigation.orbit(e.clientX-lastX,e.clientY-lastY);lastX=e.clientX;lastY=e.clientY;};
  const up=(e:PointerEvent)=>{if(pointers.has(e.pointerId)&&travel<8&&useExperience.getState().stage==='system'){const id=hit(e.clientX,e.clientY);if(id){navigation.focus(id);sound.cue();}}pointers.delete(e.pointerId);pinch=0;};
  const cancel=(e:PointerEvent)=>{pointers.delete(e.pointerId);pinch=0;};
  const wheel=(e:WheelEvent)=>{if(['gate','intro'].includes(useExperience.getState().stage))return;e.preventDefault();navigation.dolly(Math.exp(e.deltaY*.001));};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('wheel',wheel,{passive:false});useExperience.getState().set({ready:true});raf=requestAnimationFrame(draw);
  return()=>{disposed=true;unsubscribe();cancelAnimationFrame(raf);observer.disconnect();navigation.hitTest=()=>null;canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('wheel',wheel);};
 },[paused,labels]);
 return <canvas ref={ref} className="compatible-canvas" aria-label="Orden Global · compatible cosmic view"/>;
}
