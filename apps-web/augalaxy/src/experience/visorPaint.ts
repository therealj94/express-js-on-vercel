import {DatosCasa,PesoDicho} from './visorUI';

/* LOS CARTELES DEL VISOR SE PINTAN EN UN LIENZO, no en HTML: dentro del visor
   el HTML se pinta una vez sobre las dos mitades de la pantalla y se ve doble.
   Aquí solo se dibuja; quién lo cuelga en la escena y quién lo apunta con la
   mirada es cosa de viewerDriver. Las zonas apretables se devuelven en
   coordenadas de 0 a 1 sobre el propio cartel, para que el mismo número sirva
   igual con cualquier tamaño de lienzo y se pueda comprobar sin un navegador. */

export interface Zona {id:string; x:number; y:number; w:number; h:number}
export const dentro=(z:Zona,x:number,y:number)=>x>=z.x&&x<=z.x+z.w&&y>=z.y&&y<=z.y+z.h;

const ORO='#ddc38c', TINTA='#f4f2ec', TENUE='#a5adbb';

function pildora(g:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
 g.beginPath();g.moveTo(x+r,y);g.lineTo(x+w-r,y);g.quadraticCurveTo(x+w,y,x+w,y+r);
 g.lineTo(x+w,y+h-r);g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);g.lineTo(x+r,y+h);
 g.quadraticCurveTo(x,y+h,x,y+h-r);g.lineTo(x,y+r);g.quadraticCurveTo(x,y,x+r,y);g.closePath();
}

/* EL ARO QUE SE LLENA. Dentro del visor no hay clic: tocar con la mirada es
   sostener la vista, y eso solo funciona si la persona VE que está pasando.
   Sin esta señal, quedarse mirando y que de pronto ocurra algo asusta; y
   quedarse mirando y que no ocurra nada, desconcierta. */
function aro(g:CanvasRenderingContext2D,cx:number,cy:number,radio:number,progreso:number){
 g.lineWidth=7;g.strokeStyle='rgba(221,195,140,.28)';g.beginPath();g.arc(cx,cy,radio,0,Math.PI*2);g.stroke();
 if(progreso<=0)return;
 g.strokeStyle=ORO;g.beginPath();g.arc(cx,cy,radio,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,progreso));g.stroke();
}

function parrafo(g:CanvasRenderingContext2D,texto:string,x:number,y:number,ancho:number,alto:number,max=99){
 const palabras=texto.split(/\s+/);let linea='',fila=0;
 for(const palabra of palabras){
  const prueba=linea?linea+' '+palabra:palabra;
  if(g.measureText(prueba).width>ancho&&linea){g.fillText(linea,x,y+fila*alto);linea=palabra;if(++fila>=max)return y+fila*alto;}
  else linea=prueba;
 }
 if(linea)g.fillText(linea,x,y+fila*alto);
 return y+(fila+1)*alto;
}

export const PORTICO_W=1024, PORTICO_H=384;
export function pintarPortico(g:CanvasRenderingContext2D,boton:string,sub:string,progreso:number){
 g.clearRect(0,0,PORTICO_W,PORTICO_H);
 pildora(g,18,18,PORTICO_W-36,244,64);
 const fondo=g.createLinearGradient(0,0,0,262);
 fondo.addColorStop(0,'rgba(8,16,34,.94)');fondo.addColorStop(1,'rgba(4,9,20,.96)');
 g.fillStyle=fondo;g.fill();
 g.lineWidth=3;g.strokeStyle='rgba(221,195,140,'+(0.34+progreso*0.5)+')';g.stroke();
 g.textAlign='center';g.textBaseline='middle';
 g.fillStyle=TINTA;g.font='600 86px "DM Sans",system-ui,sans-serif';
 g.fillText(boton,PORTICO_W/2,140,PORTICO_W-260);
 aro(g,128,140,52,progreso);
 if(sub){g.fillStyle=TENUE;g.font='400 38px "DM Sans",system-ui,sans-serif';g.fillText(sub,PORTICO_W/2,320,PORTICO_W-60);}
 return [{id:'portico',x:18/PORTICO_W,y:18/PORTICO_H,w:(PORTICO_W-36)/PORTICO_W,h:244/PORTICO_H}] as Zona[];
}

export const CASA_W=1536, CASA_H=1024;
export function pintarCasa(g:CanvasRenderingContext2D,d:DatosCasa,enfocado:string,progreso:number):Zona[]{
 g.clearRect(0,0,CASA_W,CASA_H);
 pildora(g,16,16,CASA_W-32,CASA_H-32,54);
 const fondo=g.createLinearGradient(0,0,0,CASA_H);
 fondo.addColorStop(0,'rgba(9,15,29,.95)');fondo.addColorStop(1,'rgba(4,8,18,.97)');
 g.fillStyle=fondo;g.fill();g.lineWidth=3;g.strokeStyle=(d.color||ORO)+'66';g.stroke();

 g.textAlign='left';g.textBaseline='alphabetic';
 g.fillStyle=d.color||ORO;g.font='600 40px "DM Sans",system-ui,sans-serif';
 g.fillText((d.sub||'ORDEN GLOBAL').toUpperCase(),84,132,CASA_W-168);
 g.fillStyle=TINTA;g.font='600 92px "DM Sans",system-ui,sans-serif';
 g.fillText(d.titulo,84,236,CASA_W-168);
 g.strokeStyle='rgba(220,227,242,.16)';g.lineWidth=2;
 g.beginPath();g.moveTo(84,286);g.lineTo(CASA_W-84,286);g.stroke();

 let y=360;
 for(const l of d.lineas||[]){
  g.fillStyle=TENUE;g.font='400 40px "DM Sans",system-ui,sans-serif';g.fillText(l.k,84,y,520);
  g.textAlign='right';g.fillStyle=TINTA;g.font='500 44px "DM Sans",system-ui,sans-serif';g.fillText(l.v,CASA_W-84,y,620);
  g.textAlign='left';y+=72;
 }
 g.fillStyle=TINTA;g.font='400 42px "DM Sans",system-ui,sans-serif';
 for(const p of d.parrafos||[]){y=parrafo(g,p,84,y+18,CASA_W-168,56,3)+12;}
 if(d.nota){g.fillStyle=TENUE;g.font='400 36px "DM Sans",system-ui,sans-serif';parrafo(g,d.nota,84,Math.min(y+26,CASA_H-300),CASA_W-168,48,3);}

 /* Los botones, abajo y grandes: con el visor puesto la puntería es peor que
    con un dedo, y un botón chico es un botón que no se aprieta. */
 const zonas:Zona[]=[];
 const n=d.botones.length,margen=84,hueco=28,ancho=(CASA_W-margen*2-hueco*(n-1))/n,alto=138,fila=CASA_H-margen-alto;
 d.botones.forEach((b,i)=>{
  const x=margen+i*(ancho+hueco),activo=enfocado===b.id;
  pildora(g,x,fila,ancho,alto,44);
  g.fillStyle=activo?'rgba(221,195,140,.16)':'rgba(255,255,255,.05)';g.fill();
  g.lineWidth=3;g.strokeStyle=activo?ORO:'rgba(220,227,242,.2)';g.stroke();
  g.textAlign='center';g.textBaseline='middle';g.fillStyle=activo?ORO:TINTA;
  g.font='500 44px "DM Sans",system-ui,sans-serif';
  g.fillText(b.texto,x+ancho/2,fila+alto/2,ancho-130);
  if(activo)aro(g,x+58,fila+alto/2,36,progreso);
  g.textAlign='left';g.textBaseline='alphabetic';
  zonas.push({id:b.id,x:x/CASA_W,y:fila/CASA_H,w:ancho/CASA_W,h:alto/CASA_H});
 });
 return zonas;
}

export const DICHO_W=2048, DICHO_H=512;
export function pintarDicho(g:CanvasRenderingContext2D,texto:string,peso:PesoDicho){
 g.clearRect(0,0,DICHO_W,DICHO_H);
 const tam=peso==='grande'?128:peso==='titulo'?116:peso==='cierre'?104:peso==='escritura'?96:92;
 /* La Escritura va en cursiva también aquí dentro: es la única señal que
    distingue las dos voces, y perderla sería contar la historia a una sola. */
 g.font=(peso==='escritura'?'italic ':'')+(peso==='titulo'?'600 ':'400 ')+tam+'px "DM Sans",system-ui,sans-serif';
 g.textAlign='center';g.textBaseline='middle';
 g.fillStyle=peso==='escritura'?'#efe3c8':TINTA;
 g.shadowColor='rgba(0,0,0,.85)';g.shadowBlur=24;
 const lineas=texto.split('\n').slice(0,3);
 const alto=tam*1.3,inicio=DICHO_H/2-((lineas.length-1)*alto)/2;
 lineas.forEach((l,i)=>g.fillText(l,DICHO_W/2,inicio+i*alto,DICHO_W-120));
 g.shadowBlur=0;
}
