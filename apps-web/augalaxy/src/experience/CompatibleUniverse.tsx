import {useEffect,useRef} from 'react';
import {PerspectiveCamera,Vector3} from 'three';
import {worlds,externalGalaxies,World} from './catalog';
import {useExperience,motionReduced} from './navigation';
import {usePreferences} from './preferences';
import {textureFor,surfacePixels} from './textures';
import {assetURL} from './assets';
import {SUN_RADIUS,BLACK_HOLE_POSITION,BLACK_HOLE_RADIUS,PULSAR_POSITION,CameraDirector,updateOrbits,updateLabels,locationOf,bindSceneInput,orbitRadii,deepWorlds} from './cosmos';
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

function solarAsset(surface?:ImageData){
 const c=document.createElement('canvas');c.width=c.height=720;const ctx=c.getContext('2d')!,im=ctx.createImageData(720,720);
 for(let y=0;y<720;y++)for(let x=0;x<720;x++){
  const nx=(x-360)/359,ny=(y-360)/359,r=nx*nx+ny*ny;if(r>=1)continue;const nz=Math.sqrt(1-r),k=(y*720+x)*4;
  let col=[255,159,51];
  if(surface){const u=(Math.atan2(nz,nx)/Math.PI/2+.5)%1,v=Math.acos(-ny)/Math.PI,j=(Math.floor(v*(surface.height-1))*surface.width+Math.floor(u*(surface.width-1)))*4;col=[surface.data[j],surface.data[j+1],surface.data[j+2]];}
  const limb=.63+.37*Math.pow(nz,.45);im.data[k]=Math.min(255,col[0]*1.45*limb);im.data[k+1]=Math.min(255,col[1]*1.23*limb+13);im.data[k+2]=Math.min(255,col[2]*.67*limb+5);im.data[k+3]=Math.min(255,(1-r)*2000);
 }
 ctx.putImageData(im,0,0);return c;
}
function blackHoleAsset(){
 const key='blackhole';if(assets.has(key))return assets.get(key)!;
 const c=document.createElement('canvas');c.width=1200;c.height=800;const ctx=c.getContext('2d')!,im=ctx.createImageData(c.width,c.height);
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
  const px=(x-600)/132,py=(y-400)/132,r=Math.hypot(px,py),dr=Math.hypot(px,py*4.5),angle=Math.atan2(py*4.5,px),j=(y*c.width+x)*4;
  if(r<1){im.data[j]=1;im.data[j+1]=2;im.data[j+2]=5;im.data[j+3]=255;continue;}
  const turbulence=dr<4?fbm(dr*9,Math.sin(angle)*7,Math.cos(angle)*7):0;
  const disk=Math.max(0,Math.min(1,(4-dr)/1.2))*Math.max(0,Math.min(1,(dr-1.08)*5))*(.35+turbulence*.7)*(.78+.22*Math.sin(dr*170+turbulence*12));
  const photon=Math.exp(-Math.pow((r-1.06)*27,2))*(py<0?1:.37);
  const lens=r<1.65&&py<0?Math.exp(-Math.pow((r-1.2)*8,2))*.19:0;
  const bright=disk*(.62+.5*(px+4)/8)+photon+lens,alpha=Math.min(1,bright);
  im.data[j]=Math.min(255,195+photon*60);im.data[j+1]=Math.min(255,112+photon*90+disk*42);im.data[j+2]=Math.min(255,53+photon*100);im.data[j+3]=alpha*255;
 }
 ctx.putImageData(im,0,0);assets.set(key,c);return c;
}
type Projection={world:World;x:number;y:number;r:number;depth:number;sun?:boolean};
export default function CompatibleUniverse({paused,labels}:{paused:boolean;labels:Map<string,HTMLButtonElement>}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current!,ctx=canvas.getContext('2d');if(!ctx){useExperience.getState().set({unsupported:true});return;}
  const camera=new PerspectiveCamera(48,1,.05,1000),director=new CameraDirector(),p=new Vector3();camera.position.set(0,24,42);
  let disposed=false,width=0,height=0,raf=0,previous=performance.now(),elapsed=0,frames=0,measure=previous,systemScale=1,deepScale=0;
  const allWorlds=[...worlds.filter(w=>w.id!=='genesis'),...deepWorlds],sprites=allWorlds.map((w,i)=>planetAsset(w,i)),galaxies=[galaxyAsset(41,'#b0c4df'),...externalGalaxies.map(g=>galaxyAsset(g.seed,g.color))],blackhole=blackHoleAsset();let sun=solarAsset();
  allWorlds.forEach((w,i)=>{void Promise.all([surfacePixels(textureFor(w)),w.kind===1?surfacePixels('earth_clouds'):Promise.resolve(undefined)]).then(([surface,clouds])=>{if(!disposed)sprites[i]=planetAsset(w,i,surface,clouds);}).catch(()=>{});});
  void surfacePixels('sun').then(surface=>{if(!disposed)sun=solarAsset(surface);}).catch(()=>{});
  const background=new Image();background.src=assetURL('textures/starmap.jpg');
  const hubble=new Image();hubble.src=assetURL('textures/whirlpool.jpg');let portrait:HTMLCanvasElement|null=null;
  hubble.onload=()=>{if(disposed)return;portrait=document.createElement('canvas');portrait.width=1800;portrait.height=1250;const g=portrait.getContext('2d')!;g.drawImage(hubble,0,0,1800,1250);g.globalCompositeOperation='destination-in';g.translate(900,625);g.scale(1,1250/1800);const mask=g.createRadialGradient(0,0,350,0,0,900);mask.addColorStop(0,'#fff');mask.addColorStop(.55,'#fffd');mask.addColorStop(1,'transparent');g.fillStyle=mask;g.fillRect(-900,-900,1800,1800);};
  const rand=random(54),stars=Array.from({length:780},()=>({x:rand(),y:rand(),r:.3+Math.pow(rand(),6)*1.5,a:.15+rand()*.55}));
  const resize=()=>{const b=canvas.getBoundingClientRect();width=b.width;height=b.height;const q=usePreferences.getState().prefs.quality,dpr=Math.min(devicePixelRatio,q==='high'?2:q==='low'?1:1.5);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);camera.aspect=width/height;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();const unsubscribe=usePreferences.subscribe((s,old)=>{if(s.prefs.quality!==old.prefs.quality)resize();});
  const project=(position:Vector3|[number,number,number])=>{Array.isArray(position)?p.fromArray(position):p.copy(position);const depth=camera.position.distanceTo(p);p.project(camera);return{x:(p.x*.5+.5)*width,y:(-.5*p.y+.5)*height,visible:p.z>0&&p.z<1,depth};};
  const drawSun=(x:number,y:number,r:number)=>{if(r<.8)return;ctx.save();ctx.translate(x,y);const glow=ctx.createRadialGradient(0,0,r*.9,0,0,r*2.8);glow.addColorStop(0,'rgba(255,173,69,.7)');glow.addColorStop(.13,'rgba(255,128,29,.3)');glow.addColorStop(.35,'rgba(238,78,11,.08)');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(-r*3,-r*3,r*6,r*6);
   ctx.strokeStyle='rgba(255,156,47,.15)';ctx.lineWidth=Math.max(.4,r*.015);for(let i=0;i<24;i++){const a=i/24*Math.PI*2+elapsed*.003,rr=r*(1.03+.06*Math.sin(i*7));ctx.beginPath();ctx.ellipse(Math.cos(a)*rr,Math.sin(a)*rr,r*.14,r*.035,a,0,Math.PI*2);ctx.stroke();}ctx.drawImage(sun,-r,-r,r*2,r*2);ctx.restore();};
  const draw=(now:number)=>{
   raf=requestAnimationFrame(draw);const dt=Math.min(.1,(now-previous)/1000);previous=now;if(paused||!width||!height)return;
   const state=useExperience.getState(),reduced=motionReduced();if(!reduced)elapsed+=dt;updateOrbits(now,dt,width);director.update(camera,width,height,now,dt);const ease=reduced?1:1-Math.exp(-dt*3.5);systemScale+=((state.stage==='galaxies'?.025:1)-systemScale)*ease;deepScale+=((state.stage==='galaxies'?1:0)-deepScale)*ease;
   ctx.clearRect(0,0,width,height);ctx.fillStyle='#02040a';ctx.fillRect(0,0,width,height);
   if(background.complete&&background.naturalWidth){ctx.save();ctx.globalAlpha=.13;const bw=Math.max(width*1.5,height*2.2),bh=bw/2;ctx.drawImage(background,(width-bw)/2,(height-bh)/2,bw,bh);ctx.restore();}
   for(const s of stars){ctx.globalAlpha=s.a*(.9+.1*Math.sin(elapsed*.4+s.x*30));ctx.fillStyle='#d5dfec';ctx.fillRect(s.x*width,s.y*height,s.r,s.r);}ctx.globalAlpha=1;
   const galaxyList=[{position:[0,-12,-36] as [number,number,number],radius:72},...externalGalaxies.map(g=>({position:g.position,radius:24}))];
   galaxyList.forEach((g,i)=>{const q=project(g.position);if(!q.visible)return;const r=height*g.radius/(q.depth*.89);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(-.19+i*.37+elapsed*.003);ctx.scale(1,.4+i*.1);ctx.globalAlpha=state.stage==='galaxies'?(i===0&&portrait?.12:1):.22;ctx.drawImage(galaxies[i],-r,-r,r*2,r*2);ctx.restore();});
   if(portrait&&deepScale>.01){const q=project([10,-12,-40]),r=height*66/(q.depth*.89);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(-.23+elapsed*.001);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=deepScale*.86;ctx.drawImage(portrait,-r,-r*.696,r*2,r*1.392);ctx.restore();}
   if(systemScale>.3){ctx.strokeStyle='rgba(205,171,112,'+(.15*systemScale)+')';ctx.lineWidth=.7;for(const radius of orbitRadii){ctx.beginPath();for(let i=0;i<=160;i++){const a=i/160*Math.PI*2,q=project([Math.cos(a)*radius*(width<700?.74:1),0,Math.sin(a)*radius*(width<700?1.15:1)]);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);}ctx.stroke();}}
   const objects:Projection[]=allWorlds.map(world=>{const deep=world.id.startsWith('cosmic-'),q=project(deep?world.position:locationOf(world));return{world,x:q.x,y:q.y,r:q.visible?height*world.radius*(deep?deepScale:systemScale)/(q.depth*.89):0,depth:q.depth};});
   const sq=project([0,0,0]);objects.push({world:worlds.find(w=>w.id==='genesis')!,x:sq.x,y:sq.y,r:height*SUN_RADIUS*systemScale/(sq.depth*.89),depth:sq.depth,sun:true});objects.sort((a,b)=>b.depth-a.depth);
   for(const h of objects){if(h.r<1||h.x+h.r*2.3<0||h.x-h.r*2.3>width||h.y+h.r*2<0||h.y-h.r*2>height)continue;if(h.sun){drawSun(h.x,h.y,h.r);continue;}
    const w=h.world,i=allWorlds.indexOf(w);ctx.save();ctx.translate(h.x,h.y);ctx.rotate(-.17+i*.025);
    const rings=(front:boolean)=>{if(!w.rings)return;ctx.save();ctx.scale(1,.28);for(let band=0;band<100;band++){const r=h.r*(1.28+band/100*.86);ctx.beginPath();ctx.arc(0,0,r,front?0:Math.PI,front?Math.PI:Math.PI*2);ctx.lineWidth=h.r*.009;ctx.strokeStyle='rgba('+rgb(w.color).join(',')+','+((Math.abs(band-60)<4)?.035:.18+.15*Math.sin(band*2.7))+')';ctx.stroke();}ctx.restore();};
    rings(false);const glow=ctx.createRadialGradient(0,0,h.r*.95,0,0,h.r*1.06);glow.addColorStop(0,'rgba('+rgb(w.color).join(',')+',.13)');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(-h.r*1.07,-h.r*1.07,h.r*2.14,h.r*2.14);ctx.drawImage(sprites[i],-h.r,-h.r,h.r*2,h.r*2);rings(true);ctx.restore();
   }
   if(deepScale>.02){
    const bh=project(BLACK_HOLE_POSITION),r=height*BLACK_HOLE_RADIUS/(bh.depth*.89);if(bh.visible){ctx.save();ctx.globalAlpha=deepScale;ctx.translate(bh.x,bh.y);ctx.rotate(-.14);ctx.drawImage(blackhole,-r*4.55,-r*3.03,r*9.1,r*6.06);ctx.restore();}
    const ps=project(PULSAR_POSITION),pr=height*1.4/(ps.depth*.89);ctx.save();ctx.globalAlpha=deepScale;const g=ctx.createRadialGradient(ps.x,ps.y,0,ps.x,ps.y,pr*4);g.addColorStop(0,'#effaff');g.addColorStop(.16,'#72bded');g.addColorStop(.4,'#37769966');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(ps.x-pr*4,ps.y-pr*4,pr*8,pr*8);const jet=ctx.createLinearGradient(0,ps.y-pr*12,0,ps.y+pr*12);jet.addColorStop(0,'transparent');jet.addColorStop(.5,'#8cc7efbb');jet.addColorStop(1,'transparent');ctx.fillStyle=jet;ctx.fillRect(ps.x-.6,ps.y-pr*12,1.2,pr*24);ctx.restore();
   }
   updateLabels(camera,width,height);frames++;if(now-measure>2000){useExperience.getState().set({fps:Math.round(frames*1000/(now-measure))});measure=now;frames=0;}
  };
  const unbind=bindSceneInput(canvas);useExperience.getState().set({ready:true});raf=requestAnimationFrame(draw);
  return()=>{disposed=true;unsubscribe();unbind();cancelAnimationFrame(raf);observer.disconnect();};
 },[paused,labels]);
 return <canvas ref={ref} className="compatible-canvas" aria-label="Orden Global · Lite universe"/>;
}
