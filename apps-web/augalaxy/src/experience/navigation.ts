import {create} from 'zustand';
import {Vector3} from 'three';
import {worlds} from './catalog';
import {usePreferences} from './preferences';
import {sound} from './sound';
import {puenteCasa} from './hostBridge';
export type Stage='gate'|'intro'|'system'|'galaxies'|'transit';
export interface Journey {id:string;startedAt:number;duration:number;token:number;}
/** Lo que cada mundo tiene para decir sin abrirlo: solo contadores y marcas,
    nunca montos ni datos de la cuenta. Lo pone la casa (AUGALAXY.estados). */
export interface Estado {n?:number;candado?:boolean;nuevo?:boolean;}
interface ExperienceData {
 estados:Record<string,Estado>;
 immersive:boolean;stage:Stage;selected:string|null;windowId:string|null;settings:boolean;directory:boolean;
 help:boolean;ready:boolean;unsupported:boolean;fps:number;hovered:string|null;tutorial:boolean;
 journey:Journey|null;introDuration:number;cinema:boolean;rendererChoice:'pro'|'lite'|null;rendererActual:'pro'|'lite';webglAvailable:boolean|null;
}
interface ExperienceState extends ExperienceData {set:(v:Partial<ExperienceData>)=>void;}
export const useExperience=create<ExperienceState>((set)=>({estados:{},immersive:false,stage:'gate',selected:null,windowId:null,settings:false,directory:false,help:false,ready:false,unsupported:false,fps:60,hovered:null,tutorial:false,journey:null,introDuration:4800,cinema:false,rendererChoice:null,rendererActual:'lite',webglAvailable:null,set}));
const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
export const motionReduced=()=>{const p=usePreferences.getState().prefs;return p.motion==='reduced'||(p.motion==='system'&&typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches);};
/* Lo que la cámara lee mientras corre la historia del origen. Vive aquí, y no
   en genesis.ts, para que la cámara pueda mirarlo sin que los dos módulos se
   importen en círculo. */
export const pelicula={activo:false,yaw:0,pitch:.6,distancia:43,mira:new Vector3()};
let token=0,entrega=0;
export const cancelarEntrega=()=>clearTimeout(entrega);
export const navigation={
 zoom:1,yaw:0,pitch:.6,lastInteraction:0,hovered:null as string|null,
 /* EL GIRO CON PESO. Arrastrar gira como un plato (la inclinación va acotada) y
    al soltar el sistema sigue girando por inercia y se frena solo; la
    inclinación vuelve despacio a la de siempre. Así el cielo siempre acaba
    derecho y nunca se detiene en seco. */
 dragging:false,vyaw:0,
 focus(id:string|null){
  if(id!==null&&!worlds.some(w=>w.id===id))return;
  const prev=useExperience.getState().selected;
  if(useExperience.getState().stage==='galaxies'){this.zoom=1;this.yaw=0;this.pitch=.6;}this.lastInteraction=now();this.hovered=null;
  useExperience.getState().set({immersive:false,stage:'system',selected:id,journey:null,windowId:null,hovered:null});
  if(id&&id!==prev){sound.cue('select');sound.travel('focus');}
 },
 enter(id:string){
  if(!usePreferences.getState().prefs.tutorialSeen)usePreferences.getState().set({tutorialSeen:true});
  if(!worlds.some(w=>w.id===id)||useExperience.getState().stage==='transit')return;
  if(useExperience.getState().selected!==id)this.focus(id);
  const journey={id,startedAt:now(),duration:motionReduced()?120:2100,token:++token};
  useExperience.getState().set({stage:'transit',selected:id,journey,windowId:null,hovered:null});
  sound.travel('enter');sound.cue('open');
 },
 complete(tokenToComplete:number){
  const s=useExperience.getState();if(s.journey?.token!==tokenToComplete)return;
  const id=s.journey.id,puente=puenteCasa();
  /* CON LA CASA DETRÁS, LLEGAR ES ABRIR. Medio segundo para que el ojo termine
     el aterrizaje, y la wallet toma el mando: es su app, no un panel nuestro.
     Sin casa detrás, este motor corre solo y enseña su propia ficha. */
  if(puente&&id!=='ajustes'){
   /* LLEGAR NO ES VOLVER A SALIR. Antes el viaje terminaba, la cámara se
      alejaba otra vez medio segundo y recién ahí la casa cortaba a su
      pantalla: un ir y volver seguido de un salto. Ahora la cámara se queda
      aparcada en el planeta, el velo del color del mundo termina de cubrir la
      escena y la casa abre su app detrás del mismo velo. */
   sound.cue('arrival');
   clearTimeout(entrega);entrega=window.setTimeout(()=>{try{puente(id);}catch{/* la casa dirá lo suyo */}},motionReduced()?0:320);
   return;
  }
  s.set({stage:'system',journey:null,...(id==='ajustes'?{settings:true,windowId:null}:{windowId:id})});sound.cue('arrival');
 },
 step(direction:number){const s=useExperience.getState(),i=worlds.findIndex(w=>w.id===s.selected);this.focus(worlds[(i+direction+worlds.length)%worlds.length].id);},
 hover(id:string|null){this.hovered=id;useExperience.getState().set({hovered:id});},
 orbit(dx:number,dy:number){if(useExperience.getState().stage==='transit'||!Number.isFinite(dx)||!Number.isFinite(dy))return;this.lastInteraction=now();const gain=usePreferences.getState().prefs.orbitSensitivity,d=-dx*.0036*gain;this.yaw+=d;this.vyaw=this.dragging?this.vyaw*.4+d*.6:0;
  // la inclinación resiste al acercarse a sus topes, como una goma
  const p=this.pitch+dy*.0022*gain,lo=.22,hi=1.05;this.pitch=p<lo?lo-(lo-p)*.25:p>hi?hi+(p-hi)*.25:p;this.pitch=Math.max(.1,Math.min(1.15,this.pitch));
  if(Math.abs(dx)>6)sound.motion(Math.hypot(dx,dy)*.5,dx);},
 // soltar después de quedarse quieto no lanza nada: la inercia es del gesto, no del último movimiento viejo
 release(){this.dragging=false;if(Math.abs(this.vyaw)<.0006||now()-this.lastInteraction>90)this.vyaw=0;},
 dolly(factor:number){if(!Number.isFinite(factor)||factor<=0)return;const s=useExperience.getState();if(s.stage==='transit')return;this.lastInteraction=now();this.zoom=Math.max(.6,Math.min(3,this.zoom*factor));sound.motion(Math.abs(1-factor)*120,factor>1?12:-12);if(s.stage==='system'&&!s.selected&&this.zoom>2.4)this.galaxies();},
 galaxies(){this.zoom=1;this.yaw=0;this.pitch=.38;this.lastInteraction=now();useExperience.getState().set({immersive:false,stage:'galaxies',selected:null,journey:null,windowId:null});sound.travel('focus');},
 home(){this.zoom=1;this.yaw=0;this.pitch=.6;this.vyaw=0;this.dragging=false;this.lastInteraction=now();this.hovered=null;useExperience.getState().set({immersive:false,selected:null,stage:'system',windowId:null,journey:null,hovered:null});},
 hitTest:(_x:number,_y:number):string|null=>null,
 projected:new Map<string,{x:number;y:number;r:number;visible:boolean}>(),
};
