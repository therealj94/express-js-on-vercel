import {createRoot,Root} from 'react-dom/client';
import Experience from './Experience';
import {useExperience,navigation,motionReduced} from './navigation';
import {usePreferences} from './preferences';
import {immersive} from './immersive';
import {resetLabelLayout} from './cosmos';
import {airtouch} from './airtouch';
import {sound} from './sound';
import {lookAtWorld,highlightWorld,touchWorld,transitionState,viewControls,entryTiming} from './hostBridge';
let root:Root|null=null;
let landing=0;
let mountedElement:HTMLElement|null=null;
function desmontar(){immersive.salir();clearTimeout(landing);airtouch.stop();sound.dispose();root?.unmount();root=null;mountedElement=null;resetLabelLayout();navigation.projected.clear();navigation.hitTest=()=>null;navigation.home();useExperience.getState().set({settings:false,directory:false,help:false,tutorial:false,ready:false,introDuration:4800});}
function montar(el:HTMLElement){if(!(el instanceof HTMLElement)||!el.isConnected)throw new Error("Galaxy OS requires a connected mount element");desmontar();mountedElement=el;const lang=(window as any).__AE_LANG;if(lang==='es'||lang==='en')usePreferences.getState().set({lang});useExperience.getState().set({stage:(window as any).__AE_PUERTA?'gate':'system'});root=createRoot(el);root.render(<Experience embedded/>);}
/* EL CONTRATO DE ENTRADA, COMO LO ESPERA LA CASA. El motor anterior volaba
   1100 ms en una sesión de siempre ('directo') y 2300 ms en una cuenta recién
   creada ('descubrir'), y avisaba a la casa al 80% del vuelo: la wallet cambia
   de vista mientras la cámara sigue volando y nadie ve la costura. Llamar al
   callback a los 100 ms con una intro de casi cinco segundos encima dejaba la
   vista de la app debajo de la intro. */
function entrar(type:string,callback?:()=>void){
 if(!root||!mountedElement?.isConnected)return;
 delete (window as any).__AE_PUERTA;
 const {duration,callbackAt}=entryTiming(type,motionReduced());
 navigation.home();useExperience.getState().set({stage:'intro',introDuration:duration});clearTimeout(landing);
 landing=window.setTimeout(()=>callback?.(),callbackAt);
}
function puerta(){clearTimeout(landing);(window as any).__AE_PUERTA=true;navigation.home();useExperience.getState().set({stage:'gate',settings:false,directory:false,help:false,tutorial:false});}
function exhalar(){navigation.home();useExperience.getState().set({settings:false,directory:false,help:false,tutorial:false});}
// Isolated visual engine: uses the host navigation callback only in embedded mode.
// It never requests auth tokens, balances, keys or transaction APIs.
const api={montar,desmontar,entrar,puerta,exhalar,acomodo:()=>useExperience.getState().stage==='gate'?1:0,_transito:transitionState};
(window as any).AUGALAXY=api;
(window as any).__AE_VISOR=immersive;
(window as any).__AE_MIRAR=lookAtWorld;
(window as any).__AE_RESALTAR=highlightWorld;
(window as any).__AE_TOCAR=touchWorld;
(window as any).__AE_VISTA=viewControls;
const container=document.querySelector<HTMLElement>('[data-orden-standalone]');
if(container){mountedElement=container;document.documentElement.classList.add('og-standalone');root=createRoot(container);root.render(<Experience/>);}
