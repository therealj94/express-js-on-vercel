import {useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as T from 'three';
import {immersive,useViewer,registerViewerDriver} from './immersive';
import {worlds,worldName} from './catalog';
import {locationOf} from './cosmos';
import {usePreferences} from './preferences';
import {useVisorUI,visorUI,escenaTomada} from './visorUI';
import {pintarPortico,pintarCasa,pintarDicho,dentro,Zona,PORTICO_W,PORTICO_H,CASA_W,CASA_H,DICHO_W,DICHO_H} from './visorPaint';

/* SOSTENER LA MIRADA TARDA MÁS QUE UN DEDO. La cabeza tiembla: 1,5 s es lo que
   el motor anterior pedía para dar por apretado un botón del visor, y menos
   convierte cualquier vistazo en un clic. */
const DWELL_UI=1.5;

/** Dedicated stereo render owner. No app, account or host navigation is invoked here. */
export default function ViewerDriver(){
 const {gl,camera,scene,size}=useThree();const mode=useViewer(s=>s.mode);
 const state=useRef({session:null as XRSession|null,head:new T.Quaternion(),base:new T.Quaternion(),calibrated:false,tracking:false,selected:'',dwell:0,lastTarget:'',exit:false});
 const eyes=useRef([new T.PerspectiveCamera(),new T.PerspectiveCamera()]);
 const labels=useRef<{world:typeof worlds[number];sprite:T.Sprite;texture:T.CanvasTexture}[]>([]);
 const hud=useRef<T.Sprite|null>(null),hudText=useRef(''),rig=useRef<T.Group|null>(null);
 /* Los carteles de la casa: pórtico, panel de mundo y rótulo hablado. Viven en
    la escena, no en HTML, y por eso las dos cámaras los ven bien. */
 const panels=useRef<Record<'portico'|'casa'|'dicho',{sprite:T.Sprite;canvas:HTMLCanvasElement;texture:T.CanvasTexture;zonas:Zona[];firma:string;puesto:boolean;reacomodando:boolean}|null>>({portico:null,casa:null,dicho:null});
 const gaze=useRef({sobre:'',desde:0,gastado:''});
 useEffect(()=>{
  const s=state.current,previousParent=camera.parent;
  const group=new T.Group();group.position.set(0,7,38);rig.current=group;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const texture=new T.CanvasTexture(canvas),material=new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false});
  const sprite=new T.Sprite(material);sprite.scale.set(1.35,.3375,1);sprite.renderOrder=999;sprite.visible=false;scene.add(sprite);hud.current=sprite;
  labels.current=worlds.map(world=>{const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d')!;ctx.font='32px sans-serif';ctx.textAlign='center';ctx.fillStyle='#050c18';ctx.fillRect(0,0,512,96);ctx.fillStyle=world.id==='genesis'?'#eed8a6':'#f2f5ff';ctx.fillText(worldName(world,usePreferences.getState().prefs.lang),256,60);const texture=new T.CanvasTexture(c),sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false}));sprite.visible=false;sprite.renderOrder=900;scene.add(sprite);return {world,sprite,texture};});
  /* Un lienzo por cartel, repintado solo cuando cambia lo que dice o cuánto
     lleva el aro: repintar 1536×1024 en cada cuadro es tirar la gráfica por un
     panel que no se mueve. */
  /* CADA OJO VE MEDIA PANTALLA. Un cartel que en una pantalla entera se lee
     cómodo, en el estéreo se sale por los lados: estas medidas están tomadas
     contra el ojo estrecho, no contra el monitor. */
  const medidas={portico:[PORTICO_W,PORTICO_H,1.1,.41],casa:[CASA_W,CASA_H,1.9,1.27],dicho:[DICHO_W,DICHO_H,1.5,.375]} as const;
  for(const clave of ['casa','portico','dicho'] as const){
   const [w,h,mundoW,mundoH]=medidas[clave];
   const lienzo=document.createElement('canvas');lienzo.width=w;lienzo.height=h;
   const tex=new T.CanvasTexture(lienzo);tex.colorSpace=T.SRGBColorSpace;
   const sp=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:false,depthWrite:false,toneMapped:false,transparent:true}));
   sp.scale.set(mundoW,mundoH,1);sp.visible=false;sp.renderOrder=clave==='dicho'?990:995;scene.add(sp);
   panels.current[clave]={sprite:sp,canvas:lienzo,texture:tex,zonas:[],firma:'',puesto:false,reacomodando:false};
  }
  const orientation=(e:DeviceOrientationEvent)=>{if(e.alpha===null||e.beta===null||e.gamma===null)return;const q=new T.Quaternion().setFromEuler(new T.Euler(T.MathUtils.degToRad(e.beta),T.MathUtils.degToRad(e.alpha),-T.MathUtils.degToRad(e.gamma),'YXZ'));q.multiply(new T.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2));q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-T.MathUtils.degToRad(screen.orientation?.angle||0)));if(!s.calibrated){s.base.copy(q).invert();s.calibrated=true;}s.head.copy(s.base).multiply(q);s.tracking=true;};
  const ended=()=>{s.session=null;immersive.salir();};
  const select=()=>{s.exit=true;}; // Controller trigger is an always-available exit.
  const stop=()=>{
   window.removeEventListener('deviceorientation',orientation);const session=s.session;s.session=null;
   if(session){session.removeEventListener('end',ended);session.removeEventListener('select',select);void session.end().catch(()=>{});}
   gl.xr.enabled=false;gl.setScissorTest(false);gl.setViewport(0,0,size.width,size.height);
   if(camera.parent===group){group.remove(camera);previousParent?.add(camera);}scene.remove(group);
   s.head.identity();s.calibrated=false;s.tracking=false;s.selected='';s.dwell=0;s.exit=false;sprite.visible=false;hudText.current='';labels.current.forEach(l=>{l.sprite.visible=false;});
   gaze.current={sobre:'',desde:0,gastado:''};
   for(const clave of ['portico','casa','dicho'] as const){const panel=panels.current[clave];if(panel){panel.sprite.visible=false;panel.puesto=false;panel.reacomodando=false;panel.firma='';}}
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
  return()=>{unregister();stop();scene.remove(sprite);texture.dispose();material.dispose();hud.current=null;labels.current.forEach(l=>{scene.remove(l.sprite);l.texture.dispose();l.sprite.material.dispose();});labels.current=[];
   for(const clave of ['portico','casa','dicho'] as const){const panel=panels.current[clave];if(!panel)continue;scene.remove(panel.sprite);panel.texture.dispose();panel.sprite.material.dispose();panels.current[clave]=null;}};
 },[gl,camera,scene]);
 useFrame((_,dt)=>{
  if(!mode||mode==='trescientos60')return;
  const s=state.current,sprite=hud.current;if(!sprite)return;
  const view=mode==='xr'?gl.xr.getCamera():camera;
  if(mode==='carton')camera.quaternion.multiply(s.head);
  view.updateMatrixWorld();const origin=new T.Vector3(),direction=new T.Vector3(),quaternion=new T.Quaternion();view.getWorldPosition(origin);view.getWorldDirection(direction);view.getWorldQuaternion(quaternion);
  const carteles=escenaTomada();
  for(const l of labels.current){l.sprite.visible=!carteles;if(carteles)continue;l.sprite.position.copy(locationOf(l.world)).add(new T.Vector3(0,l.world.radius+.9,0));const scale=Math.max(2.2,origin.distanceTo(l.sprite.position)*.14);l.sprite.scale.set(scale,scale*96/512,1);}
  const ray=new T.Ray(origin,direction);

  /* ══ LOS CARTELES DE LA CASA, Y LA MIRADA QUE LOS APRIETA ═══════════════
     Mientras hay un cartel delante —o mientras la casa pone __AE_BLINDADO—
     la mirada NO elige planetas: el cartel tapa lo que hay detrás, y leer una
     casa abriría otra. */
  /* EL TIEMPO DE LA MIRADA SE MIDE CON RELOJ DE PARED, no sumando fotogramas.
     Sumar dt topado a 50 ms parece lo mismo hasta que el aparato va a 11
     cuadros por segundo —un teléfono modesto moviendo estéreo—: ahí «sostené
     un segundo y medio» se convierte en tres, y la persona aparta la vista
     convencida de que el botón no funciona. */
  const reloj=(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  const ui=useVisorUI.getState(),tomada=escenaTomada();
  const derecha=new T.Vector3(1,0,0).applyQuaternion(quaternion),arriba=new T.Vector3(0,1,0).applyQuaternion(quaternion);
  const suave=1-Math.exp(-Math.min(dt,.08)*3.4);
  let foco='';
  const colocar=(clave:'portico'|'casa'|'dicho',distancia:number,alto:number,vivo:boolean)=>{
   const panel=panels.current[clave];if(!panel)return null;
   panel.sprite.visible=vivo;
   if(!vivo){panel.puesto=false;return null;}
   /* SE CUELGA DONDE APARECIÓ, Y SOLO SE REACOMODA CUANDO MIRÁS A OTRO LADO.
      Clavado a la cámara sería una pegatina en el cristal —y, peor, no se
      podría apuntar a un botón: el cartel se movería contigo y la mirada
      caería siempre en el mismo punto—. Fijo en el mundo para siempre se
      perdería al girar la cabeza. Así que se queda quieto mientras lo estás
      mirando, y cuando la vista se va lejos viene detrás, con calma. */
   const destino=new T.Vector3(0,alto,-distancia).applyQuaternion(quaternion).add(origin);
   if(!panel.puesto){panel.sprite.position.copy(destino);panel.puesto=true;panel.reacomodando=false;}
   else{
    const hacia=panel.sprite.position.clone().sub(origin).normalize();
    const desvio=Math.acos(Math.max(-1,Math.min(1,hacia.dot(direction))));
    if(desvio>.38)panel.reacomodando=true;else if(desvio<.1)panel.reacomodando=false;
    if(panel.reacomodando)panel.sprite.position.lerp(destino,suave);
   }
   const centro=panel.sprite.position,normal=origin.clone().sub(centro).normalize();
   const denominador=direction.dot(normal);
   if(Math.abs(denominador)<1e-4)return null;
   const t=centro.clone().sub(origin).dot(normal)/denominador;
   if(t<=0)return null;
   const punto=origin.clone().addScaledVector(direction,t).sub(centro);
   const u=punto.dot(derecha)/panel.sprite.scale.x+.5,v=.5-punto.dot(arriba)/panel.sprite.scale.y;
   if(u<0||u>1||v<0||v>1)return null;
   return {panel,u,v};
  };

  /* Con el panel de una casa abierto, el pórtico y el rótulo bajan para no
     quedar encima de lo que se está leyendo. */
  const conCasa=!!ui.casa;
  const sobreCasa=colocar('casa',2.6,0,conCasa);
  /* EL PÓRTICO VA DELANTE DE LOS OJOS, no debajo: es lo primero que se ve con
     el visor puesto y hay que poder apretarlo sin buscarlo. Centrado, la
     mirada en reposo ya cae dentro. */
  const sobrePortico=colocar('portico',2.4,conCasa?-.95:0,!!ui.portico);
  colocar('dicho',2.7,conCasa?-1.3:-.62,!!ui.dicho);

  for(const apuntado of [sobrePortico,sobreCasa]){
   if(!apuntado)continue;
   const zona=apuntado.panel.zonas.find(z=>dentro(z,apuntado.u,apuntado.v));
   if(zona){foco=(apuntado===sobrePortico?'portico:':'casa:')+zona.id;break;}
  }
  if(foco!==gaze.current.sobre){gaze.current.sobre=foco;gaze.current.desde=reloj;gaze.current.gastado='';}
  /* UN DISPARO POR APUNTADA. Si la casa deja el panel abierto después de
     apretar —y a veces lo deja—, seguir mirando el botón volvía a apretarlo
     cada segundo y medio: tres «Abrir» seguidos sin que nadie los pidiera.
     Hay que salir del botón para poder volver a apretarlo. */
  const armado=foco&&foco!==gaze.current.gastado;
  const progreso=armado?Math.min(1,(reloj-gaze.current.desde)/DWELL_UI):0;
  /* El gatillo aprieta lo que se está apuntando; si no hay cartel delante,
     sigue siendo la salida de siempre. */
  const disparo=s.exit;s.exit=false;
  const apretar=armado&&(disparo||(progreso>=1&&useViewer.getState().gaze));
  if(apretar){
   gaze.current.gastado=foco;gaze.current.desde=reloj;
   if(foco.startsWith('portico:'))visorUI.aprietaPortico();
   else visorUI.aprietaCasa(foco.slice(5));
  }else if(disparo){immersive.salir();return;}

  /* Repintar solo cuando cambia lo escrito o cuánto lleva el aro. */
  const pintar=(clave:'portico'|'casa'|'dicho',firma:string,dibuja:(g:CanvasRenderingContext2D)=>Zona[]|void)=>{
   const panel=panels.current[clave];if(!panel||!panel.sprite.visible||panel.firma===firma)return;
   panel.firma=firma;const g=panel.canvas.getContext('2d')!;const zonas=dibuja(g);
   if(zonas)panel.zonas=zonas;panel.texture.needsUpdate=true;
  };
  const paso=Math.round(progreso*24);
  if(ui.portico)pintar('portico',ui.portico.boton+'|'+ui.portico.sub+'|'+(foco==='portico:portico'?paso:0),
   g=>pintarPortico(g,ui.portico!.boton,ui.portico!.sub,foco==='portico:portico'?progreso:0));
  if(ui.casa)pintar('casa',ui.casa.key+'|'+ui.casa.titulo+'|'+foco+'|'+(foco.startsWith('casa:')?paso:0),
   g=>pintarCasa(g,ui.casa!,foco.startsWith('casa:')?foco.slice(5):'',progreso));
  if(ui.dicho)pintar('dicho',String(ui.dicho.turno),g=>{pintarDicho(g,ui.dicho!.texto,ui.dicho!.peso);});

  let target='';
  if(tomada){if(s.lastTarget){s.lastTarget='';s.dwell=reloj;}if(useViewer.getState().target!==null)useViewer.setState({target:null});}
  else{
   let closest=Infinity;
   for(const w of worlds){const hit=ray.intersectSphere(new T.Sphere(locationOf(w),w.radius),new T.Vector3());if(hit&&hit.distanceTo(origin)<closest){closest=hit.distanceTo(origin);target=w.id;}}
   if(target!==s.lastTarget){s.lastTarget=target;s.dwell=reloj;}
   if(useViewer.getState().target!==(target||null))useViewer.setState({target:target||null});
   if(target&&reloj-s.dwell>1.2&&useViewer.getState().gaze)s.selected=target;
  }
  const es=usePreferences.getState().prefs.lang==='es',world=worlds.find(w=>w.id===s.selected);
  const text=(world?worldName(world,es?'es':'en'):'ORDEN GLOBAL')+'\n'+(mode==='xr'?(es?'Gatillo: salir del visor':'Trigger: exit headset'):(es?'Toca la pantalla para salir':'Tap screen to exit'));
  if(text!==hudText.current){hudText.current=text;const texture=sprite.material.map!,canvas=texture.image as HTMLCanvasElement,ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,1024,256);ctx.fillStyle='rgba(4,10,20,.9)';ctx.fillRect(0,0,1024,256);ctx.textAlign='center';ctx.fillStyle='#eed8a6';ctx.font='42px sans-serif';ctx.fillText(text.split('\n')[0],512,95);ctx.font='28px sans-serif';ctx.fillStyle='#f2f5ff';ctx.fillText(text.split('\n')[1],512,170);texture.needsUpdate=true;}
  sprite.visible=!tomada;sprite.position.copy(new T.Vector3(0,-.45,-1.8).applyQuaternion(quaternion).add(origin));
  if(mode==='xr'){gl.render(scene,camera);return;}
  const perspective=camera as T.PerspectiveCamera;
  for(let i=0;i<2;i++){const eye=eyes.current[i];eye.copy(perspective);eye.aspect=size.width/2/size.height;eye.position.copy(origin);eye.quaternion.copy(quaternion);eye.translateX((i===0?-1:1)*useViewer.getState().eyeDistance/2);eye.updateProjectionMatrix();gl.setScissorTest(true);gl.setViewport(i*size.width/2,0,size.width/2,size.height);gl.setScissor(i*size.width/2,0,size.width/2,size.height);gl.render(scene,eye);}
  gl.setScissorTest(false);gl.setViewport(0,0,size.width,size.height);
 },mode&&mode!=='trescientos60'?1:0);
 return null;
}
