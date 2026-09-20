import {create} from 'zustand';

/* LO QUE LA CASA DIBUJA DENTRO DEL VISOR.
 *
 * Con el visor puesto la pantalla está partida en dos mitades, una por ojo, y
 * cada una ve la escena desde un punto distinto. Un rótulo HTML se pinta UNA
 * vez encima de las dos: al ojo izquierdo le queda corrido y al derecho
 * también, en sentidos opuestos. El cerebro no fusiona eso; se ve una mancha
 * doble y marea. Por eso la wallet no dibuja su HTML de siempre cuando hay
 * visor: le pide al motor que ponga las palabras y los botones COMO OBJETOS DE
 * LA ESCENA, y para eso llama a tres funciones que el motor anterior instalaba
 * en window. Este motor no las instalaba, y sin ellas ponerse el visor desde la
 * wallet dejaba tres agujeros:
 *
 *   · Sin PÓRTICO no hay puerta. Calzarse un visor es un momento torpe —uno se
 *     acomoda la correa y mira alrededor— y si la mirada ya está armada, el
 *     primer planeta que quede en el centro se abre solo. La persona termina
 *     dentro de una app sin haber decidido nada. El pórtico es lo primero que
 *     se ve y, hasta que no se aprieta, la mirada no abre nada más.
 *   · Sin CASA, abrir un mundo obliga a quitarse el visor.
 *   · Sin DECIR, la historia se cuenta muda.
 *
 * El camino de vuelta es el mismo del motor anterior: eventos del documento,
 * `ae-portico` con {modo} y `ae-casa` con {accion, key}. La wallet ya los
 * escucha; no hay que tocarla.
 *
 * BLINDADO lo pone la casa, no el motor: mientras hay un cartel delante, la
 * mirada no elige planetas por detrás de él. Aquí solo se lee. */

export type ModoPortico = 'inicio' | 'salir' | null;
export interface BotonCasa {id:string; texto:string}
export interface DatosCasa {
  key:string; titulo:string; sub?:string; color?:string;
  lineas?:Array<{k:string; v:string}>; parrafos?:string[]; nota?:string; botones:BotonCasa[];
}
export type PesoDicho = 'normal'|'grande'|'cierre'|'titulo'|'escritura';

interface VisorUIState {
  portico:{modo:Exclude<ModoPortico,null>; boton:string; sub:string}|null;
  casa:DatosCasa|null;
  dicho:{texto:string; peso:PesoDicho; turno:number}|null;
}
export const useVisorUI=create<VisorUIState>(()=>({portico:null,casa:null,dicho:null}));

let turno=0;

/* La casa lo pone en true mientras hay un cartel delante. Se lee en cada
   cuadro: es de la casa, no nuestro, y puede cambiar sin avisar. */
export const blindado=()=>typeof window!=='undefined'&&(window as any).__AE_BLINDADO===true;

/* Con un cartel abierto la mirada tampoco debe elegir planetas, esté o no
   puesto el blindaje: el cartel tapa lo que hay detrás. */
export const escenaTomada=()=>{const s=useVisorUI.getState();return !!(s.portico||s.casa)||blindado();};

function texto(value:unknown,limite:number){return typeof value==='string'?value.slice(0,limite):'';}

export const visorUI={
  portico(modo:unknown,boton?:unknown,sub?:unknown){
    if(modo!=='inicio'&&modo!=='salir'){useVisorUI.setState({portico:null});return;}
    useVisorUI.setState({portico:{modo,boton:texto(boton,42)||(modo==='salir'?'SALIR':'ENTRAR'),sub:texto(sub,90)}});
  },
  casa(datos:unknown){
    if(!datos||typeof datos!=='object'){useVisorUI.setState({casa:null});return;}
    const d=datos as DatosCasa;
    if(!Array.isArray(d.botones)||!d.botones.length){useVisorUI.setState({casa:null});return;}
    useVisorUI.setState({casa:{
      key:texto(d.key,40),titulo:texto(d.titulo,60),sub:texto(d.sub,80),color:texto(d.color,24)||'#ddc38c',
      lineas:(Array.isArray(d.lineas)?d.lineas:[]).slice(0,6).map(l=>({k:texto(l?.k,28),v:texto(l?.v,28)})),
      parrafos:(Array.isArray(d.parrafos)?d.parrafos:[]).slice(0,4).map(p=>texto(p,240)),
      nota:texto(d.nota,240),
      botones:d.botones.slice(0,4).map(b=>({id:texto(b?.id,40),texto:texto(b?.texto,32)})).filter(b=>b.id&&b.texto),
    }});
  },
  decir(value:unknown,peso:unknown='normal'){
    if(typeof value!=='string'||!value.trim()){useVisorUI.setState({dicho:null});return;}
    const pesos:PesoDicho[]=['normal','grande','cierre','titulo','escritura'];
    useVisorUI.setState({dicho:{texto:value.slice(0,220),peso:pesos.includes(peso as PesoDicho)?peso as PesoDicho:'normal',turno:++turno}});
  },
  /* El pórtico avisa a la casa cuando la mirada (o el gatillo) terminó de
     apretarlo; la casa decide qué significa. El motor no abre nada por su
     cuenta: se limita a cerrar el cartel y a contar lo que pasó. */
  aprietaPortico(){
    const actual=useVisorUI.getState().portico;if(!actual)return;
    useVisorUI.setState({portico:null});
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ae-portico',{detail:{modo:actual.modo}}));
  },
  aprietaCasa(id:string){
    const actual=useVisorUI.getState().casa;if(!actual)return;
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ae-casa',{detail:{accion:id,key:actual.key}}));
  },
  limpiar(){turno=0;useVisorUI.setState({portico:null,casa:null,dicho:null});},
};
