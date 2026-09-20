import {World} from './catalog';
import {assetURL} from './assets';
export const textureFor=(w:World)=>w.kind===0?(w.id==='wallet'?'saturn':'jupiter'):w.kind===1?'earth_daymap':w.kind===3?'mars':'moon';
const decoded=new Map<string,Promise<ImageData>>();
export function surfacePixels(name:string){
 if(!decoded.has(name))decoded.set(name,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0);resolve(ctx.getImageData(0,0,c.width,c.height));};img.onerror=reject;img.src=assetURL('textures/'+name+'.webp');}));
 return decoded.get(name)!;
}
