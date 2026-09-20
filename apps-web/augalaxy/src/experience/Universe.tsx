import {useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import * as T from 'three';
import {worlds,externalGalaxies,worldName,word,World} from './catalog';
import {usePreferences} from './preferences';
import {useExperience,navigation} from './navigation';
import {planetVertex,planetFragment,cloudFragment,atmoFragment,pointVertex,pointFragment} from './shaders';
import {sound} from './sound';
import CompatibleUniverse from './CompatibleUniverse';
import {textureFor} from './textures';

const locations=new Map<string,T.Mesh>();
const labelNodes=new Map<string,HTMLButtonElement>();
function rng(seed:number){let s=seed;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

function StarField({spiral=false,seed=55,position=[0,0,0],radius=100,color='#a6b9d9',count=5000,tilt=0}:{
 spiral?:boolean;seed?:number;position?:[number,number,number];radius?:number;color?:string;count?:number;tilt?:number;
}){
 const group=useRef<T.Group>(null);
 const geo=useMemo(()=>{
  const random=rng(seed),p=new Float32Array(count*3),c=new Float32Array(count*3),s=new Float32Array(count),phase=new Float32Array(count);
  const warm=new T.Color('#ffe1ad'),cold=new T.Color(color),white=new T.Color('#f1f0e9');
  for(let i=0;i<count;i++){
   const r=Math.pow(random(),spiral?.68:.333)*radius;
   const branch=i%4*Math.PI/2,angle=spiral?branch+r/radius*5.5+(random()-.5)*(.35+1.7*r/radius):random()*Math.PI*2;
   if(spiral){p[i*3]=Math.cos(angle)*r;p[i*3+1]=(random()-.5)*(1-r/radius)*radius*.1;p[i*3+2]=Math.sin(angle)*r;}
   else{const v=random()*2-1;p[i*3]=Math.cos(angle)*Math.sqrt(1-v*v)*r;p[i*3+1]=v*r;p[i*3+2]=Math.sin(angle)*Math.sqrt(1-v*v)*r;}
   const tint=spiral?warm.clone().lerp(cold,Math.min(1,r/radius*1.9)):white.clone().lerp(cold,random()*.6);
   tint.multiplyScalar(.42+random()*.7);c.set([tint.r,tint.g,tint.b],i*3);
   s[i]=spiral?.45+Math.pow(random(),4)*2.8:.35+Math.pow(random(),8)*2.5;phase[i]=random()*6.28;
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('color',new T.BufferAttribute(c,3));g.setAttribute('aSize',new T.BufferAttribute(s,1));g.setAttribute('aPhase',new T.BufferAttribute(phase,1));return g;
 },[spiral,seed,radius,color,count]);
 const mat=useMemo(()=>new T.ShaderMaterial({vertexShader:pointVertex,fragmentShader:pointFragment,vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{uTime:{value:0},uScale:{value:280},uOpacity:{value:spiral?.8:1}}}),[spiral]);
 useEffect(()=>()=>{geo.dispose();mat.dispose();},[geo,mat]);
 useFrame(({clock,size},dt)=>{const reduced=document.documentElement.dataset.motion==='reduced';if(!reduced)mat.uniforms.uTime.value=clock.elapsedTime;mat.uniforms.uScale.value=Math.min(size.height,1000)*.4;if(group.current&&spiral&&!reduced)group.current.rotation.y+=dt*.005;});
 return <group ref={group} position={position} rotation={[tilt,0,spiral?.15:0]}><points geometry={geo} material={mat} frustumCulled={false}/></group>;
}

function Ring({radius,color}:{radius:number;color:string}){
 const geometry=useMemo(()=>{
  const geo=new T.RingGeometry(radius*1.3,radius*2.15,160);const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv');
  for(let i=0;i<pos.count;i++){const r=Math.hypot(pos.getX(i),pos.getY(i));uv.setXY(i,(r/radius-1.3)/.85,Math.atan2(pos.getY(i),pos.getX(i)));}
  return geo;
 },[radius]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const uniforms=useMemo(()=>({uColor:{value:new T.Color(color)}}),[color]);
 return <mesh geometry={geometry} rotation={[-1.12,.12,.24]}>
  <shaderMaterial side={T.DoubleSide} transparent depthWrite={false} uniforms={uniforms}
   vertexShader="varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}"
   fragmentShader={`uniform vec3 uColor;varying vec2 vUv;void main(){float r=vUv.x;float bands=.52+.2*sin(r*280.)+.13*sin(r*643.);float gap=1.-smoothstep(.0,.035,abs(r-.58));float a=smoothstep(0.,.07,r)*smoothstep(1.,.85,r)*bands*(1.-gap*.94);float shadow=smoothstep(-.4,.6,cos(vUv.y+.4));gl_FragColor=vec4(uColor*(.24+.76*shadow),a*.75);}`}/>
 </mesh>;
}
function Planet({world,index}:{world:World;index:number}){
 const mesh=useRef<T.Mesh>(null),cloud=useRef<T.Mesh>(null),group=useRef<T.Group>(null);
 const uniforms=useMemo(()=>({uColor:{value:new T.Color(world.color)},uSecondary:{value:new T.Color(world.secondary)},uKind:{value:world.kind},uSeed:{value:index*7.3+1},uMap:{value:null as T.Texture|null},uHasMap:{value:0}}),[world,index]);
 useEffect(()=>{let disposed=false;const tex=new T.TextureLoader().load('/textures/'+textureFor(world)+'.jpg',t=>{if(disposed){t.dispose();return;}t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;uniforms.uMap.value=t;uniforms.uHasMap.value=1;},undefined,()=>{});return()=>{disposed=true;tex.dispose();};},[world,uniforms]);
 const clouds=useMemo(()=>({uTime:{value:0},uTint:{value:new T.Color('#d8e5e9')}}),[]);
 const atmo=useMemo(()=>({uTint:{value:new T.Color(world.kind===1?'#5aafef':world.color)}}),[world]);
 useEffect(()=>{if(mesh.current)locations.set(world.id,mesh.current);return()=>{locations.delete(world.id);};},[world.id]);
 useFrame(({clock},dt)=>{
  const reduced=document.documentElement.dataset.motion==='reduced';
  if(mesh.current&&!reduced)mesh.current.rotation.y+=dt*(world.kind===0?.037:.024);
  if(cloud.current&&!reduced){cloud.current.rotation.y+=dt*.033;clouds.uTime.value=clock.elapsedTime;}
  if(group.current)group.current.position.y=world.position[1]+(reduced?0:Math.sin(clock.elapsedTime*.16+index)*.08);
  if(group.current){const desired=useExperience.getState().stage==='galaxies'?.015:1;group.current.scale.setScalar(reduced?desired:T.MathUtils.damp(group.current.scale.x,desired,2.5,dt));}
 });
 const select=()=>{if(useExperience.getState().stage!=='system')return;navigation.focus(world.id);sound.cue('select');};
 const open=()=>{select();if(world.id==='ajustes')useExperience.getState().set({settings:true});else useExperience.getState().set({windowId:world.id});};
 return <group ref={group} position={world.position} rotation={[0,index*.8,.15+index*.025]}>
  <mesh ref={mesh} onClick={e=>{if(e.delta<6){e.stopPropagation();select();}}} onDoubleClick={e=>{e.stopPropagation();open();}}>
   <sphereGeometry args={[world.radius,80,64]}/>
   <shaderMaterial vertexShader={planetVertex} fragmentShader={planetFragment} uniforms={uniforms}/>
  </mesh>
  {world.kind===1&&<mesh ref={cloud}><sphereGeometry args={[world.radius*1.017,64,48]}/><shaderMaterial vertexShader={planetVertex} fragmentShader={cloudFragment} uniforms={clouds} transparent depthWrite={false}/></mesh>}
  <mesh><sphereGeometry args={[world.radius*1.04,48,32]}/><shaderMaterial vertexShader={planetVertex} fragmentShader={atmoFragment} uniforms={atmo} transparent depthWrite={false} blending={T.AdditiveBlending}/></mesh>
  {world.rings&&<Ring radius={world.radius} color={world.color}/>}
  {index<5&&<mesh position={[world.radius*2.1,world.radius*.5,-world.radius]}><sphereGeometry args={[world.radius*.12,20,16]}/><meshStandardMaterial color="#807e77" roughness={.98}/></mesh>}
 </group>;
}

function CameraRig(){
 const {camera,gl,size}=useThree();const look=useRef(new T.Vector3(0,1,0));const position=useRef(new T.Vector3());const target=useRef(new T.Vector3());
 const introStart=useRef(0),lastStage=useRef(''),lastMeasure=useRef(0),samples=useRef<number[]>([]);
 const projected=useMemo(()=>new T.Vector3(),[]),actual=useMemo(()=>new T.Vector3(),[]),ray=useMemo(()=>new T.Raycaster(),[]),pointer=useMemo(()=>new T.Vector2(),[]);
 useEffect(()=>{
  const element=gl.domElement;let down=false,x=0,y=0;const points=new Map<number,{x:number;y:number}>();let pinch=0;
  const start=(e:PointerEvent)=>{if(useExperience.getState().stage!=='system'&&useExperience.getState().stage!=='galaxies')return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});down=true;x=e.clientX;y=e.clientY;element.setPointerCapture(e.pointerId);if(points.size===2){const p=[...points.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}};
  const move=(e:PointerEvent)=>{if(!down)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size===2){const p=[...points.values()];const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch>0)navigation.dolly(pinch/d);pinch=d;}else navigation.orbit(e.clientX-x,e.clientY-y);x=e.clientX;y=e.clientY;};
  const end=(e:PointerEvent)=>{points.delete(e.pointerId);down=points.size>0;pinch=0;};
  const wheel=(e:WheelEvent)=>{const stage=useExperience.getState().stage;if(stage==='gate'||stage==='intro')return;e.preventDefault();navigation.dolly(Math.exp(e.deltaY*.001));};
  element.addEventListener('pointerdown',start);element.addEventListener('pointermove',move);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);element.addEventListener('wheel',wheel,{passive:false});
  navigation.hitTest=(x,y)=>{const bounds=element.getBoundingClientRect();pointer.set((x-bounds.left)/bounds.width*2-1,-(y-bounds.top)/bounds.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects([...locations.values()]);if(!hits.length)return null;return [...locations].find(([,m])=>m===hits[0].object)?.[0]||null;};
  useExperience.getState().set({ready:true});
  return()=>{element.removeEventListener('pointerdown',start);element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',end);element.removeEventListener('wheel',wheel);navigation.hitTest=()=>null;};
 },[camera,gl]);
 useFrame(({clock},dt)=>{
  const {stage,selected}=useExperience.getState(),prefs=usePreferences.getState().prefs;
  const reduced=prefs.motion==='reduced'||(prefs.motion==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  const mobile=size.width<700,world=worlds.find(w=>w.id===selected);
  if(stage!==lastStage.current){if(stage==='intro')introStart.current=clock.elapsedTime;lastStage.current=stage;}
  target.current.set(0,.6,-1);let distance=mobile?48:29;
  if(stage==='gate'){target.current.set(-3,mobile?1:-3,0);distance=mobile?38:23;}
  if(stage==='galaxies'){target.current.set(0,0,-45);distance=mobile?230:160;}
  if(stage==='intro'){const p=Math.min(1,(clock.elapsedTime-introStart.current)/4.4);const e=p*p*(3-2*p);distance=(mobile?110:78)*(1-e)+(mobile?48:29)*e;}
  if(world&&stage==='system'){target.current.fromArray(world.position);target.current.x+=mobile?0:world.radius*1.1;distance=world.radius*(mobile?8:6.4);}
  const yaw=stage==='gate'?-.1:navigation.yaw,pitch=stage==='gate'?.06:navigation.pitch;
  distance*=stage==='gate'||stage==='intro'?1:navigation.zoom;
  position.current.set(Math.sin(yaw)*distance,Math.sin(pitch)*distance+2.5,Math.cos(yaw)*distance).add(target.current);
  const factor=reduced?1:1-Math.exp(-dt*(stage==='intro'?4:2.5));
  camera.position.lerp(position.current,factor);look.current.lerp(target.current,factor);camera.lookAt(look.current);
  camera.updateMatrixWorld();
  const occupied:{x:number;y:number;w:number}[]=[];
  const ordered=[...worlds].sort((a,b)=>(a.id===selected?-1:b.id===selected?1:camera.position.distanceToSquared(new T.Vector3(...a.position))-camera.position.distanceToSquared(new T.Vector3(...b.position))));
  for(const w of ordered){
   const node=labelNodes.get(w.id),body=locations.get(w.id);if(!node||!body)continue;
   body.getWorldPosition(actual);projected.copy(actual);projected.y-=w.radius*1.2;projected.project(camera);
   const x=(projected.x*.5+.5)*size.width,y=(-projected.y*.5+.5)*size.height;
   const width=160*prefs.textScale;const overlap=occupied.some(o=>Math.abs(x-o.x)<(width+o.w)*.5&&Math.abs(y-o.y)<55*prefs.textScale);
   const visible=stage==='system'&&prefs.labels&&projected.z<1&&projected.z>0&&x>80&&x<size.width-80&&y>100&&y<size.height-130&&!overlap&&(!selected||w.id===selected);
   node.style.transform='translate('+x+'px,'+y+'px) translate(-50%,0)';
   node.style.visibility=visible?'visible':'hidden';node.style.opacity=visible?'1':'0';node.tabIndex=visible?0:-1;
   if(visible)occupied.push({x,y,w:width});
  }
  if(dt<.2)samples.current.push(dt);
  if(clock.elapsedTime-lastMeasure.current>2){const average=samples.current.reduce((a,b)=>a+b,0)/Math.max(1,samples.current.length);useExperience.getState().set({fps:Math.round(1/Math.max(.001,average))});samples.current=[];lastMeasure.current=clock.elapsedTime;}
 });
 return null;
}
export function PlanetLabels(){
 const prefs=usePreferences(s=>s.prefs);
 return <div className="world-labels" aria-label={prefs.lang==='es'?'Aplicaciones planetarias':'Planetary applications'}>{worlds.map(w=><button key={w.id} ref={node=>{if(node)labelNodes.set(w.id,node);else labelNodes.delete(w.id);}} className="world-label" onClick={()=>{navigation.focus(w.id);sound.cue();}} onDoubleClick={()=>useExperience.getState().set(w.id==='ajustes'?{settings:true}:{windowId:w.id})}><span className="label-rule"/><strong>{worldName(w,prefs.lang)}</strong><small>{word(w.category,prefs.lang)}</small></button>)}</div>;
}
export default function Universe({paused=false}:{paused?:boolean}){
 const prefs=usePreferences(s=>s.prefs),fps=useExperience(s=>s.fps);
 const webgl=useMemo(()=>{try{const c=document.createElement('canvas'),gl=c.getContext('webgl2');if(!gl)return false;gl.getExtension('WEBGL_lose_context')?.loseContext();return true;}catch{return false;}},[]);
 const coarse=matchMedia('(pointer: coarse)').matches;
 const low=prefs.quality==='low'||(prefs.quality==='auto'&&(coarse||fps<28));
 const count=low?12000:prefs.quality==='high'?42000:26000;
 const dpr=prefs.quality==='high'?1.75:low?1:1.35;
 if(!webgl)return <div className="universe" data-renderer="compatible"><CompatibleUniverse paused={paused} labels={labelNodes}/></div>;
 return <div className="universe" data-renderer="webgl"><Canvas frameloop={paused?'never':'always'} dpr={dpr} camera={{position:[0,5,38],fov:48,near:.1,far:800}}
  gl={{antialias:true,alpha:false,powerPreference:'high-performance'}}
  fallback={<div className="canvas-fallback">Orden Global · {prefs.lang==='es'?'Vista de aplicaciones disponible en el menú.':'App view available in the menu.'}</div>}
  onCreated={({gl})=>{gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.05;gl.setClearColor('#02040a');}}>
  <CameraRig/><ambientLight intensity={.15}/><directionalLight position={[-12,9,18]} intensity={2}/>
  <StarField count={low?1600:3600} radius={380}/>
  <StarField spiral seed={41} count={count} radius={62} position={[0,-7,-28]} color="#91a6cd" tilt={.27}/>
  {externalGalaxies.map(g=><StarField key={g.name} spiral seed={g.seed} count={low?3200:8500} radius={24} position={g.position} color={g.color} tilt={.65}/>)}
  {worlds.map((w,i)=><Planet key={w.id} world={w} index={i}/>)}
 </Canvas></div>;
}
