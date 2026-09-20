import {navigation,useExperience} from './navigation';
import {worlds,worldName} from './catalog';
import {usePreferences} from './preferences';

// Visual compatibility contract used by the existing host gesture controller.
// No account, authentication or transaction APIs belong in this bridge.
export function lookAtWorld(x:number,y:number){
 const state=useExperience.getState();
 if(!Number.isFinite(x)||!Number.isFinite(y)||state.stage!=='system'||state.windowId||state.settings||state.directory)return null;
 const world=worlds.find(w=>w.id===navigation.hitTest(x,y));
 return world?{key:world.id,nombre:worldName(world,usePreferences.getState().prefs.lang)}:null;
}
export function highlightWorld(id:string|null){navigation.hover(worlds.some(w=>w.id===id)?id:null);}
export function touchWorld(id:string){if(useExperience.getState().stage==='system'&&!useExperience.getState().windowId&&!useExperience.getState().settings)navigation.enter(id);}
export function transitionState(){const s=useExperience.getState();return{active:s.stage==='transit'||s.stage==='intro',mode:s.stage==='transit'?'enter':s.stage==='intro'?'intro':null,wid:s.journey?.id||null,activeId:s.windowId};}
export const viewControls={
 zoom:(factor:number)=>navigation.dolly(factor),
 acercar:()=>navigation.dolly(.82),alejar:()=>navigation.dolly(1.22),recentrar:()=>navigation.home(),
 girar:(x:number,y:number)=>{if(Number.isFinite(x)&&Number.isFinite(y))navigation.orbit(x,y);},
 mover:(x:number,y:number)=>{if(Number.isFinite(x)&&Number.isFinite(y))navigation.orbit(x,y);},
};
