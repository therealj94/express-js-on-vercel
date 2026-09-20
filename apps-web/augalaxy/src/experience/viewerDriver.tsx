import {useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as T from 'three';
import {immersive,useViewer,registerViewerDriver} from './immersive';
import {worlds,worldName} from './catalog';
import {locationOf} from './cosmos';
import {usePreferences} from './preferences';

/** Dedicated stereo render owner. No app, account or host navigation is invoked here. */
export default function ViewerDriver(){
 const {gl,camera,scene,size}=useThree();const mode=useViewer(s=>s.mode);
 const state=useRef({session:null as XRSession|null,head:new T.Quaternion(),base:new T.Quaternion(),calibrated:false,tracking:false,selected:'',dwell:0,lastTarget:'',exit:false});
 const eyes=useRef([new T.PerspectiveCamera(),new T.PerspectiveCamera()]);
 const labels=useRef<{world:typeof worlds[number];sprite:T.Sprite;texture:T.CanvasTexture}[]>([]);
 const hud=useRef<T.Sprite|null>(null),hudText=useRef(''),rig=useRef<T.Group|null>(null);
 useEffect(()=>{
  const s=state.current,previousParent=camera.parent;
  const group=new T.Group();group.position.set(0,7,38);rig.current=group;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const texture=new T.CanvasTexture(canvas),material=new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false});
  const sprite=new T.Sprite(material);sprite.scale.set(1.35,.3375,1);sprite.renderOrder=999;sprite.visible=false;scene.add(sprite);hud.current=sprite;
  labels.current=worlds.map(world=>{const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d')!;ctx.font='32px sans-serif';ctx.textAlign='center';ctx.fillStyle='#050c18';ctx.fillRect(0,0,512,96);ctx.fillStyle=world.id==='genesis'?'#eed8a6':'#f2f5ff';ctx.fillText(worldName(world,usePreferences.getState().prefs.lang),256,60);const texture=new T.CanvasTexture(c),sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false}));sprite.visible=false;sprite.renderOrder=900;scene.add(sprite);return {world,sprite,texture};});
  const orientation=(e:DeviceOrientationEvent)=>{if(e.alpha===null||e.beta===null||e.gamma===null)return;const q=new T.Quaternion().setFromEuler(new T.Euler(T.MathUtils.degToRad(e.beta),T.MathUtils.degToRad(e.alpha),-T.MathUtils.degToRad(e.gamma),'YXZ'));q.multiply(new T.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2));q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-T.MathUtils.degToRad(screen.orientation?.angle||0)));if(!s.calibrated){s.base.copy(q).invert();s.calibrated=true;}s.head.copy(s.base).multiply(q);s.tracking=true;};
  const ended=()=>{s.session=null;immersive.salir();};
  const select=()=>{s.exit=true;}; // Controller trigger is an always-available exit.
  const stop=()=>{
   window.removeEventListener('deviceorientation',orientation);const session=s.session;s.session=null;
   if(session){session.removeEventListener('end',ended);session.removeEventListener('select',select);void session.end().catch(()=>{});}
   gl.xr.enabled=false;gl.setScissorTest(false);gl.setViewport(0,0,size.width,size.height);
   if(camera.parent===group){group.remove(camera);previousParent?.add(camera);}scene.remove(group);
   s.head.identity();s.calibrated=false;s.tracking=false;s.selected='';s.dwell=0;s.exit=false;sprite.visible=false;hudText.current='';labels.current.forEach(l=>{l.sprite.visible=false;});
  };
  const unregister=registerViewerDriver({
   async start(next,options){
    if(next==='xr'){
     const xr=navigator.xr;if(!xr)throw new Error('WebXR is unavailable');
     const session=await xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
     s.session=session;session.addEventListener('end',ended);session.addEventListener('select',select);
     try{let reference:XRReferenceSpaceType='local-floor';try{await session.requestReferenceSpace(reference);}catch{reference='local';}gl.xr.setReferenceSpaceType(reference);gl.xr.enabled=true;scene.add(group);group.add(camera);camera.position.set(0,0,0);camera.quaternion.identity();await gl.xr.setSession(session);}catch(e){stop();throw e;}
    }else{
     const Orientation=window.DeviceOrientationEvent as typeof DeviceOrientationEvent&{requestPermission?:()=>Promise<string>};
     if(!Orientation)throw new Error('Orientation sensor unavailable');
     if(Orientation.requestPermission&&await Orientation.requestPermission()!=='granted')throw new Error('Orientation permission denied');
     window.addEventListener('deviceorientation',orientation);
    }
   },stop,recenter(){s.calibrated=false;},tracking:()=>s.tracking||!!s.session,
  });
  return()=>{unregister();stop();scene.remove(sprite);texture.dispose();material.dispose();hud.current=null;labels.current.forEach(l=>{scene.remove(l.sprite);l.texture.dispose();l.sprite.material.dispose();});labels.current=[];};
 },[gl,camera,scene]);
 useFrame((_,dt)=>{
  if(!mode||mode==='trescientos60')return;
  const s=state.current,sprite=hud.current;if(!sprite)return;
  if(s.exit){s.exit=false;immersive.salir();return;}
  const view=mode==='xr'?gl.xr.getCamera():camera;
  if(mode==='carton')camera.quaternion.multiply(s.head);
  view.updateMatrixWorld();const origin=new T.Vector3(),direction=new T.Vector3(),quaternion=new T.Quaternion();view.getWorldPosition(origin);view.getWorldDirection(direction);view.getWorldQuaternion(quaternion);
  for(const l of labels.current){l.sprite.visible=true;l.sprite.position.copy(locationOf(l.world)).add(new T.Vector3(0,l.world.radius+.9,0));const scale=Math.max(2.2,origin.distanceTo(l.sprite.position)*.14);l.sprite.scale.set(scale,scale*96/512,1);}
  const ray=new T.Ray(origin,direction);let closest=Infinity,target='';
  for(const w of worlds){const hit=ray.intersectSphere(new T.Sphere(locationOf(w),w.radius),new T.Vector3());if(hit&&hit.distanceTo(origin)<closest){closest=hit.distanceTo(origin);target=w.id;}}
  if(target===s.lastTarget)s.dwell+=Math.min(dt,.05);else{s.lastTarget=target;s.dwell=0;}
  if(useViewer.getState().target!==(target||null))useViewer.setState({target:target||null});
  if(target&&s.dwell>1.2&&useViewer.getState().gaze)s.selected=target;
  const es=usePreferences.getState().prefs.lang==='es',world=worlds.find(w=>w.id===s.selected);
  const text=(world?worldName(world,es?'es':'en'):'ORDEN GLOBAL')+'\n'+(mode==='xr'?(es?'Gatillo: salir del visor':'Trigger: exit headset'):(es?'Toca la pantalla para salir':'Tap screen to exit'));
  if(text!==hudText.current){hudText.current=text;const texture=sprite.material.map!,canvas=texture.image as HTMLCanvasElement,ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,1024,256);ctx.fillStyle='rgba(4,10,20,.9)';ctx.fillRect(0,0,1024,256);ctx.textAlign='center';ctx.fillStyle='#eed8a6';ctx.font='42px sans-serif';ctx.fillText(text.split('\n')[0],512,95);ctx.font='28px sans-serif';ctx.fillStyle='#f2f5ff';ctx.fillText(text.split('\n')[1],512,170);texture.needsUpdate=true;}
  sprite.visible=true;sprite.position.copy(new T.Vector3(0,-.45,-1.8).applyQuaternion(quaternion).add(origin));
  if(mode==='xr'){gl.render(scene,camera);return;}
  const perspective=camera as T.PerspectiveCamera;
  for(let i=0;i<2;i++){const eye=eyes.current[i];eye.copy(perspective);eye.aspect=size.width/2/size.height;eye.position.copy(origin);eye.quaternion.copy(quaternion);eye.translateX((i===0?-1:1)*useViewer.getState().eyeDistance/2);eye.updateProjectionMatrix();gl.setScissorTest(true);gl.setViewport(i*size.width/2,0,size.width/2,size.height);gl.setScissor(i*size.width/2,0,size.width/2,size.height);gl.render(scene,eye);}
  gl.setScissorTest(false);gl.setViewport(0,0,size.width,size.height);
 },mode&&mode!=='trescientos60'?1:0);
 return null;
}
