import {create} from 'zustand';
import type {Lang} from './catalog';
export interface Preferences {
  lang:Lang; sound:boolean; volume:number; ambient:boolean; motion:'system'|'full'|'reduced';
  quality:'auto'|'high'|'balanced'|'low'; labels:boolean; textScale:number;
  contrast:boolean; sensitivity:number; handSmoothing:number; intro:boolean;
}
export const defaults:Preferences={lang:'es',sound:false,volume:0.36,ambient:true,motion:'system',quality:'auto',labels:true,textScale:1,contrast:false,sensitivity:1,handSmoothing:0.5,intro:true};
const key='orden.galaxy.preferences.v1';
const between=(v:unknown,a:number,b:number,f:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(a,Math.min(b,v)):f;
export function sanitize(value:unknown):Preferences {
 const v=(value&&typeof value==='object'?value:{}) as Partial<Preferences>;
 return {...defaults,
  lang:v.lang==='en'?'en':'es',sound:typeof v.sound==='boolean'?v.sound:defaults.sound,
  ambient:v.ambient!==false,volume:between(v.volume,0,0.7,defaults.volume),
  motion:['system','full','reduced'].includes(v.motion||'')?v.motion!:defaults.motion,
  quality:['auto','high','balanced','low'].includes(v.quality||'')?v.quality!:defaults.quality,
  labels:v.labels!==false,textScale:between(v.textScale,1,1.4,1),contrast:v.contrast===true,
  sensitivity:between(v.sensitivity,0.5,1.8,1),handSmoothing:between(v.handSmoothing,0.1,0.9,0.5),intro:v.intro!==false};
}
function read(){try{return sanitize(JSON.parse(localStorage.getItem(key)||'{}'));}catch{return defaults;}}
export const usePreferences=create<{prefs:Preferences;set:(patch:Partial<Preferences>)=>void;reset:()=>void;storageAvailable:boolean}>((set)=>({
 prefs:read(),storageAvailable:true,
 set:patch=>set(state=>{const prefs=sanitize({...state.prefs,...patch});let ok=true;try{localStorage.setItem(key,JSON.stringify(prefs));}catch{ok=false;}return {prefs,storageAvailable:ok};}),
 reset:()=>{let ok=true;try{localStorage.setItem(key,JSON.stringify(defaults));}catch{ok=false;}set({prefs:{...defaults},storageAvailable:ok});}
}));
