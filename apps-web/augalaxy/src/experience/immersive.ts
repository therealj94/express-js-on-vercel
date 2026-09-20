import {navigation,useExperience} from './navigation';

/** Screen-based panorama. Never advertises headset modes that are not implemented. */
export const immersive={
 async detectar(){return {xr:false,giroscopio:false,pidePermiso:false,modos:['trescientos60']};},
 async entrar(mode:string){
  if(mode!=='trescientos60')throw new Error('unsupported-viewer-mode');
  if(!useExperience.getState().ready)throw new Error('scene-not-ready');
  navigation.home();navigation.pitch=.12;
  useExperience.getState().set({immersive:true,settings:false,directory:false,help:false,tutorial:false});
  return 'trescientos60';
 },
 salir(){if(!useExperience.getState().immersive)return;navigation.home();},
 estado(){return {activo:useExperience.getState().immersive,modo:useExperience.getState().immersive?'trescientos60':null,cabeza:false,ojos:.064,mirada:false,sinGiro:true};},
 recentrar(){navigation.yaw=0;navigation.pitch=.12;},
};

useExperience.subscribe((state,previous)=>{if(previous.immersive&&!state.immersive&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ae-visor-fuera'));});
