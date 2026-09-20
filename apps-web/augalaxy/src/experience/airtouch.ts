import {usePreferences} from './preferences';
import {navigation,useExperience} from './navigation';
import {assetURL} from './assets';

/* EL MODELO DE MANOS, UNA SOLA VEZ EN EL SITIO. La wallet ya sirve MediaPipe en
   /vendor/vision/ —los mismos bytes, comprobados uno a uno— y el motor traía su
   copia: 43 MB repetidos en el mismo dominio, subidos en cada despliegue. Si la
   casa dice dónde están los suyos, se usan; si el motor corre solo, los de su
   propio bundle. */
const visionHost=()=>{const v=typeof window!=='undefined'?(window as any).__AE_VISION:null;
 return v&&typeof v==='object'&&typeof v.wasm==='string'&&typeof v.modelo==='string'?v as {wasm:string;modelo:string}:null;};
type Point={x:number;y:number};
export type HandStatus='off'|'loading'|'searching'|'tracking'|'error';
export function measureHand(points:Point[]){
 if(points.length<21||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const palm=Math.hypot(points[0].x-points[17].x,points[0].y-points[17].y);
 if(palm<.015)return null;
 return {x:points[5].x*.3+points[8].x*.7,y:points[5].y*.3+points[8].y*.7,
 pinch:Math.hypot(points[4].x-points[8].x,points[4].y-points[8].y)/palm,palm};
}
class AirTouchController {
 private stream:MediaStream|null=null;private video:HTMLVideoElement|null=null;
 private model:import('@mediapipe/tasks-vision').HandLandmarker|null=null;private frame=0;private run=0;
 status:HandStatus='off';error='';private listeners=new Set<()=>void>();
 cursor={x:0,y:0,visible:false,pinched:false};
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 private publish(){this.listeners.forEach(fn=>fn());}
 async start(){
  if(this.status==='loading'||this.status==='tracking'||this.status==='searching')return;
  const run=++this.run;this.status='loading';this.error='';this.publish();
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('unsupported');
   const stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});
   if(run!==this.run){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;
   const vision=await import('@mediapipe/tasks-vision');
   const casa=visionHost();
   const files=await vision.FilesetResolver.forVisionTasks(casa?casa.wasm:assetURL('vision/'));
   if(run!==this.run)return;
   const model=await vision.HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:casa?casa.modelo:assetURL('vision/hand_landmarker.task'),delegate:'CPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.65,minTrackingConfidence:.65});
   if(run!==this.run){model.close();return;}this.model=model;
   const video=this.video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;await video.play();
   if(run!==this.run)return;
   this.status='searching';this.publish();let last=0,lastVideo=-1,wasPinched=false,downX=0,downY=0,downAt=0,oldX=0,oldY=0,lastPinchEnd=0,lastTarget:string|null=null,filtered=false,wasSeen=false;
   const tick=(now:number)=>{
    if(run!==this.run)return;
    try{
     if(now-last>66&&video.currentTime!==lastVideo&&video.readyState>=2){
      last=now;lastVideo=video.currentTime;
      const results=model.detectForVideo(video,now),hand=measureHand(results.landmarks[0]||[]);
      if(!hand){this.cursor.visible=false;wasPinched=false;filtered=false;if(wasSeen){this.status='searching';this.publish();}wasSeen=false;}
      else{
       if(!wasSeen){this.status='tracking';this.publish();}wasSeen=true;
       const p=usePreferences.getState().prefs;
       const x=Math.min(innerWidth-12,Math.max(12,(.5+(.5-hand.x)*p.sensitivity/.66)*innerWidth));
       const y=Math.min(innerHeight-12,Math.max(12,((hand.y-.16)/.7)*innerHeight));
       const alpha=1-p.handSmoothing*.78;
       this.cursor.x=filtered?this.cursor.x+(x-this.cursor.x)*alpha:x;this.cursor.y=filtered?this.cursor.y+(y-this.cursor.y)*alpha:y;filtered=true;this.cursor.visible=true;
       const pressed=wasPinched?hand.pinch<.47:hand.pinch<.32;
       this.cursor.pinched=pressed;
       if(pressed&&!wasPinched){downX=this.cursor.x;downY=this.cursor.y;oldX=downX;oldY=downY;downAt=now;}
       const element=document.elementFromPoint(this.cursor.x,this.cursor.y) as HTMLElement|null;
       if(pressed&&wasPinched&&now-downAt>260&&!element?.closest('button,input,select,dialog')){
        navigation.orbit((this.cursor.x-oldX)*1.3,(this.cursor.y-oldY)*1.3);
       }
       if(!pressed&&wasPinched&&now-downAt<850&&Math.hypot(this.cursor.x-downX,this.cursor.y-downY)<38){
        const control=element?.closest('button') as HTMLButtonElement|null;
        if(control&&!control.disabled){control.click();}
        else if(!document.querySelector('dialog[open]')&&useExperience.getState().stage==='system'){const hit=navigation.hitTest(this.cursor.x,this.cursor.y);if(hit){if(hit===lastTarget&&now-lastPinchEnd<850)navigation.enter(hit);else navigation.focus(hit);lastTarget=hit;lastPinchEnd=now;}}
       }
       oldX=this.cursor.x;oldY=this.cursor.y;wasPinched=pressed;
      }
     }
     this.frame=requestAnimationFrame(tick);
    }catch(e){this.fail(e);}
   };
   this.frame=requestAnimationFrame(tick);
  }catch(e){if(run===this.run)this.fail(e);}
 }
 private fail(e:unknown){const name=e instanceof Error?e.name:'';const message=e instanceof Error?e.message:'';this.stop();this.status='error';this.error=/NotAllowed|Permission/.test(name)?'permission':name==='NotFoundError'?'camera':message==='unsupported'?'unsupported':'model';this.publish();}
 stop(){++this.run;cancelAnimationFrame(this.frame);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;if(this.video){this.video.pause();this.video.srcObject=null;this.video=null;}this.model?.close();this.model=null;this.status='off';this.cursor.visible=false;this.cursor.pinched=false;this.publish();}
}
export const airtouch=new AirTouchController();
