import {navigation,useExperience} from './navigation';
import {worlds,worldName} from './catalog';
import {usePreferences} from './preferences';
import {escenaTomada} from './visorUI';

/* El puntero de la casa tampoco elige mundos cuando hay algo delante: un panel
   del visor tapa lo que hay detrás, y durante la historia del origen manda el
   guion —un gesto que arranque un vuelo a mitad de película deja dos cámaras
   peleando por el mismo encuadre. */
export function sceneBlocked(){const s=useExperience.getState();return !!(s.windowId||s.settings||s.directory||s.help||s.tutorial||s.cinema||escenaTomada()||(typeof document!=='undefined'&&document.querySelector('dialog[open]')));}

// Visual compatibility contract used by the existing host gesture controller.
// No account, authentication or transaction APIs belong in this bridge.
export function lookAtWorld(x:number,y:number){
 const state=useExperience.getState();
 if(!Number.isFinite(x)||!Number.isFinite(y)||state.stage!=='system'||sceneBlocked())return null;
 const world=worlds.find(w=>w.id===navigation.hitTest(x,y));
 return world?{key:world.id,nombre:worldName(world,usePreferences.getState().prefs.lang)}:null;
}
export function highlightWorld(id:string|null){navigation.hover(!sceneBlocked()&&worlds.some(w=>w.id===id)?id:null);}
export function touchWorld(id:string){if(useExperience.getState().stage==='system'&&!sceneBlocked())navigation.enter(id);}
export function transitionState(){const s=useExperience.getState();return{active:s.stage==='transit'||s.stage==='intro',mode:s.stage==='transit'?'enter':s.stage==='intro'?'intro':null,wid:s.journey?.id||null,activeId:s.windowId};}
export const viewControls={
 zoom:(factor:number)=>navigation.dolly(factor),
 acercar:()=>navigation.dolly(.82),alejar:()=>navigation.dolly(1.22),recentrar:()=>navigation.home(),
 girar:(x:number,y:number)=>{if(Number.isFinite(x)&&Number.isFinite(y))navigation.orbit(x,y);},
 mover:(x:number,y:number)=>{if(Number.isFinite(x)&&Number.isFinite(y))navigation.orbit(x,y);},
};

export async function openHostChat(host:unknown):Promise<boolean>{
 if(typeof host!=='function')return false;
 try{const result=await host('chat');return result!==false;}catch{return false;}
}

/* Tiempos de la entrada, tal como los espera la casa: vuelo corto para una
   sesión de siempre, descenso largo para una cuenta recién creada, y aviso al
   80% del vuelo para que la wallet cambie de vista sin costura visible. */
export const FLIGHT_MS:Record<'descubrir'|'directo',number>={descubrir:2300,directo:1100};
export function entryTiming(type:string,reduced:boolean){
 const duration=FLIGHT_MS[type==='descubrir'?'descubrir':'directo'];
 const visible=reduced?100:duration;
 return {duration,visible,callbackAt:Math.round(visible*.8)};
}

/* EL PUENTE DE LA CASA. Si la wallet dejó `__AE_ABRIR`, aterrizar en un mundo
   ABRE LA APP DE VERDAD y la casa toma el mando; el panel de vista previa es
   solo para cuando este motor corre solo. Su presencia es el interruptor entre
   las dos vidas del motor, igual que en el motor anterior. */
export const puenteCasa=()=>{const p=typeof window!=='undefined'?(window as any).__AE_ABRIR:undefined;return typeof p==='function'?p as (k:string)=>unknown:undefined;};
export const enCasa=()=>!!puenteCasa();
