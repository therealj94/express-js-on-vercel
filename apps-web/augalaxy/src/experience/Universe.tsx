import {Component,ReactNode,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Bloom,EffectComposer} from '@react-three/postprocessing';
import * as T from 'three';
import {worlds,externalGalaxies,worldName,word,World} from './catalog';
import {usePreferences} from './preferences';
import {useExperience,navigation,motionReduced} from './navigation';
import {planetVertex,planetFragment,cloudFragment,atmoFragment,pointVertex,pointFragment} from './shaders';
import CompatibleUniverse from './CompatibleUniverse';
import {textureFor} from './textures';
import {assetURL} from './assets';
import {CameraDirector,updateOrbits,updateLabels,locationOf,labelNodes,linkNodes,bindSceneInput,deepWorlds} from './cosmos';
import ViewerDriver from './viewerDriver';
import {useViewer,immersive} from './immersive';
import {enCasa} from './hostBridge';
import {SolarCore,BlackHole,CosmicNebula,OrbitPaths,Pulsar,GalacticPortrait} from './StellarObjects';

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
 useFrame(({clock,size},dt)=>{const reduced=motionReduced();mat.uniforms.uOpacity.value=useExperience.getState().stage==='galaxies'?(spiral?.8:1):(spiral?.17:.38);if(!reduced)mat.uniforms.uTime.value=clock.elapsedTime;mat.uniforms.uScale.value=Math.min(size.height,1000)*.4;if(group.current&&spiral&&!reduced)group.current.rotation.y+=dt*.005;});
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
   fragmentShader={`uniform vec3 uColor;varying vec2 vUv;void main(){float r=vUv.x;float bands=.52+.2*sin(r*280.)+.13*sin(r*643.);float gap=1.-smoothstep(.0,.035,abs(r-.58));float a=smoothstep(0.,.07,r)*(1.-smoothstep(.85,1.,r))*bands*(1.-gap*.94);float shadow=smoothstep(-.4,.6,cos(vUv.y+.4));gl_FragColor=vec4(uColor*(.24+.76*shadow),a*.75);}`}/>
 </mesh>;
}

function Planet({world,index,deep=false}:{world:World;index:number;deep?:boolean}){
 const mesh=useRef<T.Mesh>(null),cloud=useRef<T.Mesh>(null),group=useRef<T.Group>(null);
 const uniforms=useMemo(()=>({uColor:{value:new T.Color(world.color)},uSecondary:{value:new T.Color(world.secondary)},uKind:{value:world.kind},uSeed:{value:index*7.3+1},uMap:{value:null as T.Texture|null},uHasMap:{value:0}}),[world,index]);
 useEffect(()=>{let disposed=false;const tex=new T.TextureLoader().load(assetURL('textures/'+textureFor(world)+'.jpg'),t=>{if(disposed){t.dispose();return;}t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;uniforms.uMap.value=t;uniforms.uHasMap.value=1;},undefined,()=>{});return()=>{disposed=true;tex.dispose();};},[world,uniforms]);
 const clouds=useMemo(()=>({uTime:{value:0},uTint:{value:new T.Color('#d8e5e9')}}),[]);
 const atmo=useMemo(()=>({uTint:{value:new T.Color(world.kind===1?'#5aafef':world.color)}}),[world]);
 useFrame(({clock},dt)=>{
  const reduced=motionReduced(),state=useExperience.getState();
  if(mesh.current&&!reduced)mesh.current.rotation.y+=dt*(world.kind===0?.027:.018);
  if(cloud.current&&!reduced){cloud.current.rotation.y+=dt*.027;clouds.uTime.value=clock.elapsedTime;}
  if(group.current){if(!deep)group.current.position.copy(locationOf(world));const desired=deep?(state.stage==='galaxies'?1:0):(state.stage==='galaxies'?.025:1);group.current.scale.setScalar(reduced?desired:T.MathUtils.damp(group.current.scale.x,desired,3,dt));group.current.visible=group.current.scale.x>.005;}
 });
 return <group ref={group} position={world.position} rotation={[0,index*.8,.15+index*.025]}>
  <mesh ref={mesh}><sphereGeometry args={[world.radius,80,64]}/><shaderMaterial vertexShader={planetVertex} fragmentShader={planetFragment} uniforms={uniforms}/></mesh>
  {world.kind===1&&<mesh ref={cloud}><sphereGeometry args={[world.radius*1.017,64,48]}/><shaderMaterial vertexShader={planetVertex} fragmentShader={cloudFragment} uniforms={clouds} transparent depthWrite={false}/></mesh>}
  <mesh><sphereGeometry args={[world.radius*1.04,48,32]}/><shaderMaterial vertexShader={planetVertex} fragmentShader={atmoFragment} uniforms={atmo} transparent depthWrite={false} blending={T.AdditiveBlending}/></mesh>
  {world.rings&&<Ring radius={world.radius} color={world.color}/>}
  {!deep&&index<5&&<mesh position={[world.radius*2.1,world.radius*.5,-world.radius]}><sphereGeometry args={[world.radius*.12,20,16]}/><meshStandardMaterial color="#807e77" roughness={.98}/></mesh>}
 </group>;
}
function SkyBackdrop(){
 const [map,setMap]=useState<T.Texture|null>(null);
 useEffect(()=>{let dead=false;const t=new T.TextureLoader().load(assetURL('textures/starmap.jpg'),t=>{if(dead)return;t.colorSpace=T.SRGBColorSpace;setMap(t);},undefined,()=>{});return()=>{dead=true;t.dispose();};},[]);
 return map?<mesh><sphereGeometry args={[450,48,32]}/><meshBasicMaterial side={T.BackSide} map={map} transparent opacity={.13} depthWrite={false}/></mesh>:null;
}
function SceneDriver({onLost}:{onLost:()=>void}){
 const {camera,gl,size}=useThree(),director=useRef(new CameraDirector()),last=useRef(0),frames=useRef(0);
 useEffect(()=>{const remove=bindSceneInput(gl.domElement),lost=(event:Event)=>{event.preventDefault();onLost();};gl.domElement.addEventListener('webglcontextlost',lost);useExperience.getState().set({ready:true});return()=>{remove();gl.domElement.removeEventListener('webglcontextlost',lost);};},[gl,onLost]);
 useFrame((_,dt)=>{const now=performance.now();updateOrbits(now,dt,size.width);if(useViewer.getState().mode!=='xr')director.current.update(camera,size.width,size.height,now,dt);updateLabels(camera,size.width,size.height);frames.current++;if(now-last.current>2000){useExperience.getState().set({fps:Math.round(frames.current*1000/(now-last.current))});frames.current=0;last.current=now;}},-2);
 return null;
}
export function PlanetLabels(){
 const prefs=usePreferences(s=>s.prefs);
 return <><svg className="network-overlay" aria-hidden="true">{worlds.flatMap(w=>(w.id==='genesis'?['label-']:['label-','core-','peer-']).map(prefix=><line key={prefix+w.id} className={prefix.slice(0,-1)} ref={node=>{if(node)linkNodes.set(prefix+w.id,node);else linkNodes.delete(prefix+w.id);}}/>))}</svg><div className="world-labels" aria-label={prefs.lang==='es'?'Aplicaciones planetarias':'Planetary applications'}>{worlds.map((w,i)=><button key={w.id} ref={node=>{if(node)labelNodes.set(w.id,node);else labelNodes.delete(w.id);}} className="world-label" onPointerEnter={()=>navigation.hover(w.id)} onPointerLeave={()=>navigation.hover(null)} onFocus={()=>navigation.hover(w.id)} onBlur={()=>navigation.hover(null)} /* Con la casa detrás no hay ficha nuestra que abrir: tocar un nombre es
    viajar y que la wallet abra su app. Sola, el nombre solo elige. */
 onClick={()=>enCasa()?navigation.enter(w.id):navigation.focus(w.id)}><span className="label-rule"/><span className="planet-label-index">{String(i+1).padStart(2,'0')}</span><strong>{worldName(w,prefs.lang)}</strong><small>{word(w.category,prefs.lang)}</small></button>)}</div></>;
}
class RenderGuard extends Component<{children:ReactNode;onError:()=>void},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return{failed:true};}componentDidCatch(){this.props.onError();}render(){return this.state.failed?null:this.props.children;}
}
let supported:boolean|undefined;
function supportsWebGL(){if(supported!==undefined)return supported;try{const c=document.createElement('canvas'),gl=c.getContext('webgl2');supported=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext();return supported;}catch{return false;}}
export default function Universe({paused=false}:{paused?:boolean}){
 const viewerMode=useViewer(s=>s.mode);
 const prefs=usePreferences(s=>s.prefs),choice=useExperience(s=>s.rendererChoice),[lost,setLost]=useState(false);
 const webgl=useMemo(supportsWebGL,[]),requested=choice||prefs.defaultRenderer,pro=requested==='pro'&&webgl&&!lost;
 const onLost=useMemo(()=>()=>setLost(true),[]);
 useEffect(()=>{useExperience.getState().set({rendererActual:pro?'pro':'lite',webglAvailable:webgl&&!lost});},[pro,webgl,lost]);
 const coarse=matchMedia('(pointer: coarse)').matches,low=prefs.quality==='low'||(prefs.quality==='auto'&&coarse),count=low?14000:prefs.quality==='high'?48000:32000,dpr=prefs.quality==='high'?1.75:low?1:1.35;
 if(!pro)return <div className="universe" data-renderer="lite"><CompatibleUniverse paused={paused} labels={labelNodes}/></div>;
 return <div className="universe" data-renderer="pro"><RenderGuard onError={onLost}><Canvas frameloop={paused?'never':'always'} dpr={dpr} camera={{position:[0,24,42],fov:48,near:.05,far:900}}
  gl={{antialias:true,alpha:false,powerPreference:'high-performance'}}
  fallback={<CompatibleUniverse paused={paused} labels={labelNodes}/>}
  onCreated={({gl})=>{gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.1;gl.setClearColor('#02040a');}}>
  <SceneDriver onLost={onLost}/><ViewerDriver/><ambientLight intensity={.25}/><pointLight position={[0,0,0]} intensity={90} decay={1.5}/><directionalLight position={[-30,30,15]} intensity={.3}/>
  <SkyBackdrop/><CosmicNebula/><GalacticPortrait/><StarField count={low?2000:4200} radius={380}/>
  <StarField spiral seed={41} count={count} radius={72} position={[0,-12,-36]} color="#94b3cf" tilt={.27}/>
  {externalGalaxies.map(g=><StarField key={g.name} spiral seed={g.seed} count={low?3400:9500} radius={24} position={g.position} color={g.color} tilt={.65}/>)}
  <OrbitPaths/><SolarCore/>{worlds.filter(w=>w.id!=='genesis').map((w,i)=><Planet key={w.id} world={w} index={i}/>)}
  {deepWorlds.map((w,i)=><Planet key={w.id} world={w} index={i+12} deep/>)}<BlackHole/><Pulsar/>
  {!low&&(!viewerMode||viewerMode==='trescientos60')&&<EffectComposer multisampling={0}><Bloom intensity={.55} luminanceThreshold={1.1} luminanceSmoothing={.7} mipmapBlur/></EffectComposer>}
 </Canvas></RenderGuard></div>;
}
