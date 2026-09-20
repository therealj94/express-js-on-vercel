import {createRoot,Root} from 'react-dom/client';
import Experience from './Experience';
import {useExperience,navigation} from './navigation';
import {usePreferences} from './preferences';
import {resetLabelLayout} from './cosmos';
import {airtouch} from './airtouch';
import {sound} from './sound';
import {lookAtWorld,highlightWorld,touchWorld,transitionState,viewControls} from './hostBridge';
let root:Root|null=null;
let landing=0;
let mountedElement:HTMLElement|null=null;
function desmontar(){clearTimeout(landing);airtouch.stop();sound.dispose();root?.unmount();root=null;mountedElement=null;resetLabelLayout();navigation.projected.clear();navigation.hitTest=()=>null;navigation.home();useExperience.getState().set({settings:false,directory:false,help:false,tutorial:false,ready:false});}
function montar(el:HTMLElement){if(!(el instanceof HTMLElement)||!el.isConnected)throw new Error("Galaxy OS requires a connected mount element");desmontar();mountedElement=el;const lang=(window as any).__AE_LANG;if(lang==='es'||lang==='en')usePreferences.getState().set({lang});useExperience.getState().set({stage:(window as any).__AE_PUERTA?'gate':'system'});root=createRoot(el);root.render(<Experience embedded/>);}
function entrar(_type:string,callback?:()=>void){
 if(!root||!mountedElement?.isConnected)return;
 delete (window as any).__AE_PUERTA;
 navigation.home();useExperience.getState().set({stage:'intro'});clearTimeout(landing);
 landing=window.setTimeout(()=>callback?.(),100);
}
function puerta(){clearTimeout(landing);(window as any).__AE_PUERTA=true;navigation.home();useExperience.getState().set({stage:'gate',settings:false,directory:false,help:false,tutorial:false});}
function exhalar(){navigation.home();useExperience.getState().set({settings:false,directory:false,help:false,tutorial:false});}
// Isolated visual engine: uses the host navigation callback only in embedded mode.
// It never requests auth tokens, balances, keys or transaction APIs.
const api={montar,desmontar,entrar,puerta,exhalar,acomodo:()=>useExperience.getState().stage==='gate'?1:0,_transito:transitionState};
(window as any).AUGALAXY=api;
(window as any).__AE_MIRAR=lookAtWorld;
(window as any).__AE_RESALTAR=highlightWorld;
(window as any).__AE_TOCAR=touchWorld;
(window as any).__AE_VISTA=viewControls;
const container=document.querySelector<HTMLElement>('[data-orden-standalone]');
if(container){mountedElement=container;document.documentElement.classList.add('og-standalone');root=createRoot(container);root.render(<Experience/>);}
