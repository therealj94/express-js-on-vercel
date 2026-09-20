import {createRoot,Root} from 'react-dom/client';
import Experience from './Experience';
import {useExperience,navigation} from './navigation';
import {usePreferences} from './preferences';
import {airtouch} from './airtouch';
import {sound} from './sound';
let root:Root|null=null;
let landing=0;
function desmontar(){clearTimeout(landing);airtouch.stop();sound.dispose();root?.unmount();root=null;}
function montar(el:HTMLElement){desmontar();const lang=(window as any).__AE_LANG;if(lang==='es'||lang==='en')usePreferences.getState().set({lang});root=createRoot(el);root.render(<Experience embedded/>);}
function entrar(_type:string,callback?:()=>void){
 delete (window as any).__AE_PUERTA;
 navigation.home();useExperience.getState().set({stage:'intro'});clearTimeout(landing);
 landing=window.setTimeout(()=>callback?.(),100);
}
function puerta(){useExperience.getState().set({stage:'gate',selected:null,windowId:null});}
function exhalar(){navigation.home();}
// Isolated visual engine: uses the host navigation callback only in embedded mode.
// It never requests auth tokens, balances, keys or transaction APIs.
const api={montar,desmontar,entrar,puerta,exhalar,acomodo:()=>useExperience.getState().stage==='gate'?1:0,_transito:()=>({active:false,mode:null,wid:null,activeId:useExperience.getState().windowId})};
(window as any).AUGALAXY=api;
(window as any).__AE_MIRAR=(x:number,y:number)=>navigation.hitTest(x,y);
(window as any).__AE_VISTA={
 acercar:()=>navigation.dolly(.82),alejar:()=>navigation.dolly(1.22),recentrar:()=>navigation.home(),
 girar:(x:number,y:number)=>navigation.orbit(x,y),mover:(x:number,y:number)=>navigation.orbit(x,y),
};
const container=document.getElementById('root');
if(container){root=createRoot(container);root.render(<Experience/>);}
