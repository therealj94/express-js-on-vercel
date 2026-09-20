import {create} from 'zustand';
import {Vector3} from 'three';
export type Stage='gate'|'intro'|'system'|'galaxies';
interface ExperienceData {
 stage:Stage; selected:string|null; windowId:string|null; settings:boolean; directory:boolean;
 help:boolean; ready:boolean; unsupported:boolean; fps:number;
}
interface ExperienceState extends ExperienceData {set:(v:Partial<ExperienceData>)=>void;}
export const useExperience=create<ExperienceState>((set)=>({stage:'gate',selected:null,windowId:null,settings:false,directory:false,help:false,ready:false,unsupported:false,fps:60,set}));
export const navigation={
 target:new Vector3(0,1,0), eye:new Vector3(0,5,33), zoom:1, yaw:0, pitch:0,
 focus(id:string|null){useExperience.getState().set({selected:id});this.zoom=1;this.yaw=0;this.pitch=0;},
 orbit(dx:number,dy:number){this.yaw+=dx*0.003;this.pitch=Math.max(-0.6,Math.min(0.6,this.pitch+dy*0.002));},
 dolly(factor:number){this.zoom=Math.max(0.55,Math.min(3,this.zoom*factor));},
 home(){this.zoom=1;this.yaw=0;this.pitch=0;useExperience.getState().set({selected:null,stage:'system',windowId:null});},
 hitTest:(_x:number,_y:number):string|null=>null,
};
