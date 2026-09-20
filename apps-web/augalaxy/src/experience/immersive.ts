import {create} from 'zustand';
import {navigation,useExperience} from './navigation';
export type ViewerMode='trescientos60'|'xr'|'carton';
interface Driver{start:(mode:ViewerMode,options:{ojos?:number;mirada?:boolean})=>Promise<void>;stop:()=>void;recenter:()=>void;tracking:()=>boolean;}
let driver:Driver|null=null,generation=0;
export const useViewer=create<{mode:ViewerMode|null;opening:boolean;eyeDistance:number;error:string;gaze:boolean;target:string|null}>(()=>({mode:null,opening:false,eyeDistance:.064,error:'',gaze:true,target:null}));
export function registerViewerDriver(value:Driver){driver=value;return()=>{if(driver===value){immersive.salir();driver=null;}};}
function finish(){driver?.stop();useViewer.setState({mode:null,target:null});}
export const immersive={
 async detectar(){let xr=false;try{xr=!!driver&&!!(await navigator.xr?.isSessionSupported('immersive-vr'));}catch{}const orientation=typeof window!=='undefined'?(window as any).DeviceOrientationEvent:null;return {xr,giroscopio:!!driver&&!!orientation,pidePermiso:typeof orientation?.requestPermission==='function',modos:['trescientos60',...(xr?['xr']:[]),...(driver&&orientation?['carton']:[])]};},
 async entrar(mode:string,options:{ojos?:number;mirada?:boolean}={}){
  if(!['trescientos60','xr','carton'].includes(mode))throw new Error('unsupported-viewer-mode');
  if(mode!=='trescientos60'&&!driver)throw new Error('unsupported-viewer-mode');
  if(!useExperience.getState().ready)throw new Error('scene-not-ready');
  if(useViewer.getState().opening)throw new Error('viewer-opening');
  this.salir();const run=++generation,owner=driver;useViewer.setState({opening:true,gaze:options.mirada!==false,target:null,error:'',mode:mode as ViewerMode,eyeDistance:Number.isFinite(options.ojos)?Math.max(.04,Math.min(.08,options.ojos!)):.064});
  navigation.home();navigation.pitch=.12;useExperience.getState().set({immersive:true,settings:false,directory:false,help:false,tutorial:false});
  try{if(mode!=='trescientos60')await owner!.start(mode as ViewerMode,options);if(run!==generation){owner?.stop();throw new Error('viewer-cancelled');}return mode;}
  catch(error){if(run===generation){finish();navigation.home();useViewer.setState({error:error instanceof Error?error.message:'viewer-error'});}throw error;}
  finally{useViewer.setState({opening:false});}
 },
 salir(){++generation;finish();if(useExperience.getState().immersive)navigation.home();},
 estado(){return {activo:useExperience.getState().immersive,modo:useViewer.getState().mode,cabeza:driver?.tracking()||false,ojos:useViewer.getState().eyeDistance,mirada:useViewer.getState().gaze,sinGiro:!(driver?.tracking())};},
 recentrar(){navigation.yaw=0;navigation.pitch=.12;driver?.recenter();},
 mirada(value:boolean){useViewer.setState({gaze:!!value});},
 apuntando(){return useViewer.getState().target;},
 ojos(value:number){if(Number.isFinite(value))useViewer.setState({eyeDistance:Math.max(.04,Math.min(.08,value))});},
};
useExperience.subscribe((state,previous)=>{if(previous.immersive&&!state.immersive){++generation;finish();if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ae-visor-fuera'));}});
