import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as T from 'three';
import {noiseGLSL,planetVertex} from './shaders';
import {SUN_RADIUS,BLACK_HOLE_POSITION,BLACK_HOLE_RADIUS,PULSAR_POSITION,orbitRadii} from './cosmos';
import {useExperience,motionReduced} from './navigation';
import {assetURL} from './assets';

const planeVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export function GalacticPortrait(){
 const mesh=useRef<T.Mesh>(null),uniforms=useMemo(()=>({uMap:{value:null as T.Texture|null},uOpacity:{value:0}}),[]);
 useEffect(()=>{let disposed=false;const texture=new T.TextureLoader().load(assetURL('textures/whirlpool.jpg'),t=>{if(!disposed){t.colorSpace=T.SRGBColorSpace;uniforms.uMap.value=t;}});return()=>{disposed=true;texture.dispose();};},[uniforms]);
 useFrame(({camera,clock},dt)=>{const target=useExperience.getState().stage==='galaxies'?1:0;uniforms.uOpacity.value=T.MathUtils.damp(uniforms.uOpacity.value,target,3,dt);if(mesh.current){mesh.current.quaternion.copy(camera.quaternion);mesh.current.rotateZ(-.23+(motionReduced()?0:clock.elapsedTime*.001));mesh.current.visible=uniforms.uOpacity.value>.005;}});
 return <mesh ref={mesh} position={[10,-12,-40]}><planeGeometry args={[132,92]}/><shaderMaterial uniforms={uniforms} vertexShader={planeVertex} transparent depthWrite={false} blending={T.AdditiveBlending} fragmentShader={`varying vec2 vUv;uniform sampler2D uMap;uniform float uOpacity;void main(){vec2 p=(vUv-.5)*2.;float edge=1.-smoothstep(.62,1.,max(abs(p.x),abs(p.y)));vec3 col=texture2D(uMap,vUv).rgb;gl_FragColor=vec4(col,edge*uOpacity*.86);}`}/></mesh>;
}
export function SolarCore(){
 const sphere=useRef<T.Mesh>(null),corona=useRef<T.Mesh>(null),group=useRef<T.Group>(null);
 const uniforms=useMemo(()=>({uMap:{value:null as T.Texture|null},uLoaded:{value:0},uTime:{value:0}}),[]);
 useEffect(()=>{const tex=new T.TextureLoader().load(assetURL('textures/sun.jpg'),t=>{t.colorSpace=T.SRGBColorSpace;uniforms.uMap.value=t;uniforms.uLoaded.value=1;});return()=>tex.dispose();},[uniforms]);
 useFrame(({camera,clock},dt)=>{if(!motionReduced()){uniforms.uTime.value=clock.elapsedTime;if(sphere.current)sphere.current.rotation.y+=dt*.023;}if(corona.current)corona.current.quaternion.copy(camera.quaternion);if(group.current){const target=useExperience.getState().stage==='galaxies'?.08:1;group.current.scale.setScalar(T.MathUtils.damp(group.current.scale.x,target,3,dt));}});
 return <group ref={group}>
 <mesh ref={sphere}><sphereGeometry args={[SUN_RADIUS,96,80]}/><shaderMaterial uniforms={uniforms} vertexShader={planetVertex} fragmentShader={`uniform sampler2D uMap;uniform float uLoaded;uniform float uTime;varying vec3 vP;varying vec3 vN;varying vec3 vWorld;varying vec2 vUv;${noiseGLSL}
 void main(){float cells=fbm(vP*27.+uTime*.05);vec3 surface=mix(vec3(.88,.2,.015),vec3(1.,.79,.34),cells);if(uLoaded>.5)surface=texture2D(uMap,vUv).rgb;float rim=pow(1.-max(0.,dot(normalize(vN),normalize(cameraPosition-vWorld))),2.);vec3 col=surface*vec3(1.45,1.04,.62)*(1.15+cells*.45)*(1.-rim*.36);gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>
 #include <colorspace_fragment>}`.replace(';#include',';\n#include')}/></mesh>
 <mesh ref={corona}><planeGeometry args={[SUN_RADIUS*5.8,SUN_RADIUS*5.8]}/><shaderMaterial transparent depthWrite={false} blending={T.AdditiveBlending} uniforms={uniforms} vertexShader={planeVertex} fragmentShader={`uniform float uTime;varying vec2 vUv;${noiseGLSL}
 void main(){vec2 p=(vUv-.5)*5.8;float r=length(p),a=atan(p.y,p.x);float stream=fbm(vec3(cos(a)*8.,sin(a)*8.,uTime*.07));float glow=exp(-max(0.,r-1.)*(4.+stream*6.))*.46;float rays=pow(max(0.,stream-.28),3.)*exp(-max(0.,r-1.)*1.4)*2.;float mask=smoothstep(.94,1.05,r)*(1.-smoothstep(2.1,2.9,r));gl_FragColor=vec4(mix(vec3(1.,.22,.015),vec3(1.,.72,.3),glow),mask*(glow+rays));}`}/></mesh>
 </group>;
}
export function OrbitPaths(){
 const geometries=useMemo(()=>orbitRadii.map(r=>new T.BufferGeometry().setFromPoints(Array.from({length:257},(_,i)=>new T.Vector3(Math.cos(i/256*Math.PI*2)*r,0,Math.sin(i/256*Math.PI*2)*r)))),[]);
 const group=useRef<T.Group>(null);useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
 useFrame(({size})=>{if(group.current){group.current.visible=useExperience.getState().stage!=='galaxies'&&useExperience.getState().stage!=='transit';group.current.scale.set(size.width<700?.74:1,1,size.width<700?1.15:1);}});
 return <group ref={group}>{geometries.map((g,i)=><lineLoop key={i} geometry={g}><lineBasicMaterial color="#a99671" transparent opacity={.12} depthWrite={false}/></lineLoop>)}</group>;
}
export function BlackHole(){
 const mesh=useRef<T.Mesh>(null),uniforms=useMemo(()=>({uTime:{value:0}}),[]);
 useFrame(({camera,clock},dt)=>{if(mesh.current){mesh.current.quaternion.copy(camera.quaternion);mesh.current.visible=useExperience.getState().stage==='galaxies';}if(!motionReduced())uniforms.uTime.value=clock.elapsedTime;});
 return <mesh ref={mesh} position={BLACK_HOLE_POSITION}><planeGeometry args={[BLACK_HOLE_RADIUS*8,BLACK_HOLE_RADIUS*8]}/><shaderMaterial transparent depthWrite={false} uniforms={uniforms} vertexShader={planeVertex} fragmentShader={`varying vec2 vUv;uniform float uTime;${noiseGLSL}
 void main(){vec2 p=(vUv-.5)*8.;float r=length(p),a=atan(p.y,p.x);float diskR=length(vec2(p.x,p.y*4.7));float swirl=fbm(vec3(diskR*9.,a*2.5-uTime*.27,uTime*.025));float disk=(1.-smoothstep(2.4,3.8,diskR))*smoothstep(.92,1.15,diskR)*(.32+swirl*.95);float bands=.75+.25*sin(diskR*70.+swirl*10.);disk*=bands;float arc=exp(-pow((r-1.11)*20.,2.))*(.3+.7*smoothstep(-.4,.7,p.y));float halo=exp(-r*1.1)*.065;float shadow=1.-smoothstep(.99,1.04,r);vec3 col=vec3(1.,.47,.16)*disk*(.6+.55*smoothstep(-3.,3.,p.x))+vec3(1.,.84,.57)*arc+vec3(.38,.4,.55)*halo;float alpha=max(max(disk,arc),halo);if(r<1.02){col=vec3(.001,.002,.005);alpha=1.;}gl_FragColor=vec4(col,min(1.,alpha));}`}/></mesh>;
}
export function CosmicNebula(){
 const mesh=useRef<T.Mesh>(null),uniforms=useMemo(()=>({uTime:{value:0}}),[]);
 useFrame(({camera,clock})=>{if(mesh.current)mesh.current.quaternion.copy(camera.quaternion);if(!motionReduced())uniforms.uTime.value=clock.elapsedTime;});
 return <mesh ref={mesh} position={[-40,12,-135]}><planeGeometry args={[210,100]}/><shaderMaterial vertexShader={planeVertex} fragmentShader={`varying vec2 vUv;uniform float uTime;${noiseGLSL}
 void main(){vec2 p=vUv-.5;float n=fbm(vec3(p*8.,1.5+uTime*.003));float dust=fbm(vec3(p*17.+n*3.,3.));float mask=exp(-length(p*vec2(1.1,2.8))*5.);float lanes=smoothstep(.38,.7,dust)*mask;vec3 col=mix(vec3(.07,.16,.23),vec3(.24,.13,.24),n);gl_FragColor=vec4(col,lanes*.72);}`} uniforms={uniforms} transparent depthWrite={false} blending={T.AdditiveBlending}/></mesh>;
}
export function Pulsar(){
 const mesh=useRef<T.Mesh>(null),uniforms=useMemo(()=>({uTime:{value:0}}),[]);
 useFrame(({camera,clock})=>{if(mesh.current){mesh.current.quaternion.copy(camera.quaternion);mesh.current.visible=useExperience.getState().stage==='galaxies';}if(!motionReduced())uniforms.uTime.value=clock.elapsedTime;});
 return <mesh ref={mesh} position={PULSAR_POSITION}><planeGeometry args={[22,48]}/><shaderMaterial vertexShader={planeVertex} uniforms={uniforms} transparent depthWrite={false} blending={T.AdditiveBlending} fragmentShader={`varying vec2 vUv;uniform float uTime;void main(){vec2 p=(vUv-.5)*vec2(22.,48.);float r=length(p);float core=exp(-r*r*.5),halo=exp(-r*.7)*.6;float jet=exp(-abs(p.x)*7.)*exp(-abs(p.y)*.11)*(.22+.03*sin(uTime*.9));gl_FragColor=vec4(vec3(.55,.79,1.),min(1.,core+halo+jet));}`}/></mesh>;
}
