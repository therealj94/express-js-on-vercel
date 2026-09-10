/* ¿LAS PALABRAS DEL VISOR SE VEN, O SÓLO ESTÁN EN EL SITIO?
 *
 *   node pruebas/visor-se-ve.mjs      (sirve la carpeta en 8893 él solo)
 *
 * ══ POR QUÉ HACE FALTA UNA PRUEBA QUE MIRE PÍXELES ═════════════════════════
 *
 * Todas las demás pruebas del visor preguntan DÓNDE están las cosas: a qué
 * distancia cuelga el cartel, a cuántos grados de la vista, si está «delante».
 * Y hay un fallo entero que esas preguntas no pueden ver.
 *
 * El cartel del teatro se colocaba con los dos argumentos de `lookAt` en el
 * orden de una CÁMARA, no de un objeto: quedaba dado vuelta, enseñando el
 * dorso — y el dorso de un plano no se dibuja. El cartel existía, estaba a dos
 * metros y medio, a doce grados, y la prueba decía «delante: sí». En el visor
 * no había nada. Era la otra mitad de «me lo puse y no salían las letras».
 *
 * Así que esto mira la pantalla: cuenta píxeles claros en la banda donde cuelga
 * el cartel, sin él y con él. Si la diferencia no aparece, no se ve.
 *
 * ══ Y SE MIDE SOBRE UNA CAPTURA, NO LEYENDO EL LIENZO ══════════════════════
 *
 * Un lienzo WebGL sin `preserveDrawingBuffer` sale EN BLANCO si se lee fuera
 * del pintado. La primera versión de esto leía el lienzo desde la página y
 * daba cero siempre — con cartel y sin cartel. Una prueba que devuelve el
 * mismo número pase lo que pase no está midiendo nada.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const RAIZ='/home/user/express-js-on-vercel/apps-web/veta-wallet', P=8893;
spawn('fuser',['-k',`${P}/tcp`]).on('close',()=>{});
await new Promise(r=>setTimeout(r,400));
const sv=spawn('python3',['-m','http.server',String(P),'--bind','127.0.0.1','--directory',RAIZ],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,900));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const JWT=()=>'x.'+Buffer.from(JSON.stringify({sub:'c1',userId:'c1',address:'0x'+'d'.repeat(40),exp:Math.floor(Date.now()/1000)+9999})).toString('base64url')+'.y';
const ctx=await b.newContext({viewport:{width:900,height:600},locale:'es'});
const pag=await ctx.newPage();
await pag.addInitScript(`localStorage.setItem('veta.idioma','es');localStorage.setItem('veta.musica','no');
 Element.prototype.requestFullscreen=function(){return Promise.resolve();};`);
await pag.route(/herokuapp\.com/,r=>r.fulfill({status:200,json:{}}));
await pag.route(/coingecko\.com/,r=>r.fulfill({json:{}}));
await pag.route('**/auth/login',r=>r.fulfill({json:{token:JWT(),user:{email:'c@x.com',name:'José'}}}));
await pag.goto(`http://127.0.0.1:${P}/index.html`,{waitUntil:'domcontentloaded'});
await pag.waitForFunction(()=>!document.getElementById('velo-og'),null,{timeout:20000}).catch(()=>{});
const pu=await pag.$('#bienvenida .btn-oro'); if(pu&&await pu.isVisible()) await pu.click();
await pag.waitForSelector('#i-correo',{state:'visible',timeout:20000});
await pag.fill('#i-correo','c@x.com'); await pag.fill('#i-clave','clave'); await pag.click('#btn-acceso');
await pag.waitForFunction(()=>!document.getElementById('app').classList.contains('oculto'),null,{timeout:30000});
await pag.waitForFunction(()=>!!window.__AE_VISOR&&!!window.__AE_DECIR,null,{timeout:45000});
await pag.evaluate(()=>VETA.vsEntrar('trescientos60'));
await pag.waitForFunction(()=>window.VISOR.activo(),null,{timeout:30000});
await pag.waitForTimeout(1500);
await pag.evaluate(()=>{window.__AE_PORTICO?.(null);window.__AE_BLINDADO=false;});
await pag.waitForTimeout(2500);

/* SE MIDE SOBRE UNA CAPTURA, no leyendo el lienzo desde la pagina: un lienzo
   WebGL sin `preserveDrawingBuffer` sale EN BLANCO si se lee fuera del pintado,
   y esa lectura daba cero siempre — tanto con cartel como sin el. Una prueba
   que da el mismo numero pase lo que pase no esta midiendo nada. */
const { readFileSync } = await import('node:fs');
const zlib = await import('node:zlib');
function pixeles(buf) {
  let i=8,w=0,h=0,prof=0,tipo=0; const trozos=[];
  while(i<buf.length){ const len=buf.readUInt32BE(i); const nom=buf.toString('ascii',i+4,i+8);
    if(nom==='IHDR'){w=buf.readUInt32BE(i+8);h=buf.readUInt32BE(i+12);prof=buf[i+16];tipo=buf[i+17];}
    else if(nom==='IDAT') trozos.push(buf.subarray(i+8,i+8+len)); else if(nom==='IEND') break;
    i+=12+len; }
  const can = tipo===6?4:3;
  const cruda = zlib.inflateSync(Buffer.concat(trozos));
  const linea = w*can; const px = Buffer.alloc(h*linea);
  for(let y=0;y<h;y++){ const fil=cruda[y*(linea+1)];
    const ent=cruda.subarray(y*(linea+1)+1,y*(linea+1)+1+linea);
    const sal=px.subarray(y*linea,(y+1)*linea);
    for(let x=0;x<linea;x++){ const a=x>=can?sal[x-can]:0; const b=y>0?px[(y-1)*linea+x]:0;
      const c=(x>=can&&y>0)?px[(y-1)*linea+x-can]:0; let v=ent[x];
      if(fil===1)v+=a; else if(fil===2)v+=b; else if(fil===3)v+=(a+b)>>1;
      else if(fil===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
        v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);} sal[x]=v&255; } }
  return {w,h,can,linea,px};
}
const contar = async () => {
  const buf = await pag.screenshot();
  const {w,h,can,linea,px} = pixeles(buf);
  let claros=0;
  const x0=Math.round(w*0.2),x1=Math.round(w*0.8);
  const y0=Math.round(h*0.40),y1=Math.round(h*0.92);
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const o=y*linea+x*can;
    if(px[o]>185&&px[o+1]>175&&px[o+2]>140) claros++; }
  return claros;
};
const sin = await contar();
await pag.evaluate(()=>window.__AE_DECIR('AAAA BBBB CCCC DDDD','grande'));
await pag.waitForTimeout(1600);
const con = await contar();
const sitio = await pag.evaluate(()=>window.__AE_TEATRO?.());
let f = 0;
const ok = (q, c, x = '') => {
  console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`);
  if (!c) f++;
};

console.log('');
ok('el cartel está donde tiene que estar', sitio?.delante === true,
  `a ${sitio?.dist} m y ${sitio?.grados}°`);
/* El umbral no es fino a propósito: con el cartel puesto la diferencia fue de
   más de tres mil píxeles, y con el cartel dado vuelta de ciento setenta —o
   sea, ruido de la galaxia moviéndose entre las dos capturas. Cualquier número
   entre medio separa las dos cosas sin ambigüedad. */
ok('y SE DIBUJA: la pantalla cambia cuando entra', con > sin + 800,
  `${sin} → ${con} píxeles claros`);

await b.close(); sv.kill();
console.log(f ? `\n${f} fallan\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
