import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const planetHashes={saturn:'54a900ca9bf7ab62e70f862852759abdf342e6d6436a95a2fe9ebdb6bcd3bbac',jupiter:'b0f04d005350252636b0e3396fc592548cbd9e9126b269d32d5c6abd4b0e4f2b',earth_daymap:'767ee1dc6eb3802699bfccf6f264880f8acd0b80de3191cd24984fe279b07b7c',mars:'2d187f3e77a98eaa8cea5f4cc722f633c122ef170b9e94ace6b5fb6cbc3f8e01',moon:'2764ba6535ea0481a062846ee033cc7a909dae05b31a8fd13f3e98f3a7fd92bd',earth_clouds:'fffd7f68d41b37274822150e54a6ef605af1d3ec35624d9f628c3b896bfa42ed'};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function asset(file,url,expected){const dest=path.join(root,'public',file);let existing;try{existing=await readFile(dest);}catch{}if(existing&&sha(existing)===expected)return;const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('Asset download failed: '+file);const bytes=Buffer.from(await response.arrayBuffer());if(sha(bytes)!==expected)throw new Error('Asset checksum mismatch: '+file);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes);}
await Promise.all(Object.entries(planetHashes).map(([name,hash])=>asset('textures/'+name+'.jpg','https://www.solarsystemscope.com/textures/download/2k_'+name+'.jpg',hash)));
await asset('vision/hand_landmarker.task','https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task','fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1');
const wasm=path.join(root,'node_modules/@mediapipe/tasks-vision/wasm');await mkdir(path.join(root,'public/vision'),{recursive:true});for(const file of await readdir(wasm))await copyFile(path.join(wasm,file),path.join(root,'public/vision',file));
console.log('Planet textures and local AirTouch assets verified.');
