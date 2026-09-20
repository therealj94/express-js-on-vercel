import {Vector3} from 'three';
export {pelicula} from './navigation';
import {worlds} from './catalog';
import {navigation,useExperience,motionReduced,pelicula} from './navigation';
import {locationOf} from './cosmos';
import {sound} from './sound';

/* LA HISTORIA DEL ORIGEN, CON ESTE MOTOR.
 *
 * La wallet no cuenta la historia sola: pide el motor (`window.__AE_GENESIS`),
 * lo arranca con `empezar({alActo, alFin, casas})` y ESCRIBE cuando el motor le
 * avisa en qué plano va. Las palabras son suyas —cambian con el idioma y con
 * quién mira—; el tiempo y la cámara son nuestros. Sin este objeto la wallet
 * avisa «no hay cielo» y no cuenta nada.
 *
 * Los planos y sus duraciones son los del motor anterior: están calculados
 * contra una pista de música que la casa arranca en la primera nota, así que
 * acortarlos o alargarlos desacompasa la película entera. Lo que cambia es la
 * puesta en escena: aquel motor tenía su propio aparejo de cámara y sus
 * efectos (lluvia, noche, vacío); este mueve SU cámara por el mismo camino
 * —radio, altura y giro, con las mismas curvas— y deja el resto quieto. Es la
 * misma historia contada con esta escena, no una imitación de la otra.
 *
 * Nada de esto abre apps, cuentas ni cobros: mueve una cámara y avisa. */

type Curva='suave'|'entra'|'sale'|'recta'|'llega';
interface Movimiento {radio?:number; phi?:number; giro?:number; mira?:number; curva?:Curva}
export interface Acto {clave:string; dura:number; mover?:Movimiento; casa?:string}
export interface OpcionesGenesis {
 alActo?:(clave:string)=>void;
 alFin?:(salteado:boolean)=>void;
 casas?:string[];
 rotulos?:'html'|'escena';
}

const CURVAS:Record<Curva,(p:number)=>number>={
 suave:p=>(p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2),
 entra:p=>p*p*p,
 sale:p=>1-Math.pow(1-p,3),
 recta:p=>p,
 /* LLEGAR Y SOSTENER: el plano tiene que estar COMPUESTO cuando aparece el
    rótulo. Si la cámara sigue viajando mientras se lee el nombre de la casa,
    lo que se ve es una cámara buscando, no un plano. */
 llega:p=>(p<.55?(1-Math.pow(1-p/.55,3))*.94:.94+((p-.55)/.45)*.06),
};

/* El radio del motor anterior estaba en sus unidades: allí la cámara reposaba
   a 20 y aquí a 43. La película se lee igual si se respeta la proporción. */
const ESCALA=2.15;
const CASAS_POR_DEFECTO=['gid','wallet','pay','oxch','aucorp','chat','scan','genesis'];

export function guion(casas:string[]):Acto[]{
 const elegidas=casas.filter(k=>worlds.some(w=>w.id===k));
 const actos:Acto[]=[
  {clave:'titulo',dura:5000},
  {clave:'tinieblas',dura:9200,mover:{radio:29,phi:1.02,giro:.14,mira:0,curva:'suave'}},
  {clave:'seaLuz',dura:10200,mover:{radio:54,phi:.98,curva:'sale'}},
  {clave:'lumbreras',dura:7200,mover:{radio:30,phi:.9,giro:.85,curva:'suave'}},
  ...elegidas.map(k=>({clave:'casa:'+k,dura:6200,casa:k,mover:{curva:'llega' as Curva}})),
  {clave:'universo',dura:5400,mover:{radio:104,phi:.82,giro:1.5,mira:0,curva:'entra'}},
  {clave:'separo',dura:6100,mover:{radio:40,phi:.9,giro:.5,curva:'suave'}},
  {clave:'origen',dura:8400,mover:{radio:14,phi:1.12,giro:1.1,curva:'entra'}},
  {clave:'respaldo',dura:7600,mover:{radio:17,phi:.94,giro:.6,curva:'suave'}},
  {clave:'casa:minas',dura:9400,casa:'minas',mover:{curva:'llega'}},
  {clave:'cadena',dura:8000,mover:{radio:24,phi:1.3,giro:1.25,curva:'suave'}},
  {clave:'casa:dbnx',dura:8300,casa:'dbnx',mover:{curva:'llega'}},
  {clave:'bueno',dura:8400,mover:{radio:34,phi:.86,giro:.6,curva:'sale'}},
  {clave:'obra',dura:7200,mover:{radio:30,giro:.5,curva:'recta'}},
  {clave:'puente',dura:7600,mover:{radio:52,phi:.98,giro:-1.35,curva:'suave'}},
  {clave:'fructificad',dura:5300,mover:{radio:74,phi:.88,giro:.9,curva:'sale'}},
  {clave:'proposito',dura:6500,mover:{radio:26,phi:.95,giro:.5,curva:'suave'}},
  {clave:'cierre',dura:5400,mover:{radio:20,phi:.95,giro:.2,curva:'sale'}},
 ];
 return actos.filter(a=>!a.casa||worlds.some(w=>w.id===a.casa));
}

const ahora=()=>typeof performance!=='undefined'?performance.now():Date.now();
const grados=(phi:number)=>Math.max(-.3,Math.min(1.18,Math.PI/2-phi));

let corriendo=false,raf=0,relojes:number[]=[],opcionesVivas:OpcionesGenesis={};

function limpiarRelojes(){relojes.forEach(clearTimeout);relojes=[];if(raf)cancelAnimationFrame(raf);raf=0;}

function terminar(salteado:boolean){
 if(!corriendo)return;
 corriendo=false;pelicula.activo=false;limpiarRelojes();
 useExperience.getState().set({cinema:false});
 navigation.home();
 const fin=opcionesVivas.alFin;opcionesVivas={};
 fin?.(salteado);
}

function plano(acto:Acto,desde:{yaw:number;pitch:number;distancia:number;mira:Vector3}){
 const mundo=acto.casa?worlds.find(w=>w.id===acto.casa):undefined;
 const destino={...desde,mira:desde.mira.clone()};
 if(mundo){
  /* La cámara se pone del mismo lado que la casa, para que quede entre el ojo
     y el sol: a contraluz, como en el motor anterior. */
  const p=locationOf(mundo);
  destino.mira=p.clone();
  destino.yaw=Math.atan2(p.x,p.z);
  destino.pitch=.3;
  destino.distancia=Math.max(9,mundo.radius*6);
 }
 const m=acto.mover;
 if(m){
  if(typeof m.radio==='number')destino.distancia=m.radio*ESCALA;
  if(typeof m.phi==='number')destino.pitch=grados(m.phi);
  if(typeof m.giro==='number')destino.yaw=desde.yaw+m.giro;
  if(m.mira===0)destino.mira=new Vector3();
 }
 return {destino,curva:CURVAS[acto.mover?.curva||'suave']};
}

function correr(actos:Acto[],indice:number){
 if(!corriendo)return;
 const acto=actos[indice];
 if(!acto){terminar(false);return;}
 opcionesVivas.alActo?.(acto.clave);
 const desde={yaw:pelicula.yaw,pitch:pelicula.pitch,distancia:pelicula.distancia,mira:pelicula.mira.clone()};
 const {destino,curva}=plano(acto,desde);
 const inicio=ahora();
 const paso=()=>{
  if(!corriendo)return;
  const p=Math.min(1,(ahora()-inicio)/acto.dura),e=curva(p);
  pelicula.yaw=desde.yaw+(destino.yaw-desde.yaw)*e;
  pelicula.pitch=desde.pitch+(destino.pitch-desde.pitch)*e;
  pelicula.distancia=desde.distancia+(destino.distancia-desde.distancia)*e;
  pelicula.mira.copy(desde.mira).lerp(destino.mira,e);
  if(p<1)raf=requestAnimationFrame(paso);
 };
 raf=requestAnimationFrame(paso);
 relojes.push(window.setTimeout(()=>correr(actos,indice+1),acto.dura));
}

export const genesis={
 empezar(opciones:OpcionesGenesis={}){
  if(corriendo)return;
  corriendo=true;opcionesVivas=opciones;
  pelicula.activo=true;
  pelicula.yaw=navigation.yaw;pelicula.pitch=navigation.pitch;pelicula.distancia=43;pelicula.mira.set(0,0,0);
  useExperience.getState().set({cinema:true,selected:null,windowId:null,settings:false,directory:false,help:false,tutorial:false,stage:'system'});
  sound.cue('intro');
  const actos=guion(opciones.casas??CASAS_POR_DEFECTO);
  /* Con movimiento reducido la historia no se cancela: se cuenta sin vuelos
     largos, en un tercio del tiempo. Quien pidió menos movimiento no pidió
     quedarse sin la historia. */
  const ritmo=motionReduced()?.34:1;
  correr(actos.map(a=>({...a,dura:Math.max(900,Math.round(a.dura*ritmo))})),0);
 },
 saltar(){terminar(true);},
 vivo(){return corriendo;},
};
