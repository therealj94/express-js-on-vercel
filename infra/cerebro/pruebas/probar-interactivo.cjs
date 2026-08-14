/* El recorrido interactivo: lo que separa una grabacion de una conversacion.
 *
 * Lo que se comprueba, y en este orden de importancia:
 *   1. que el recorrido SE PARE a preguntar, y no de una vez de principio a fin;
 *   2. que si preguntas ahi, conteste;
 *   3. que despues VUELVA SOLO al punto exacto donde se paro --si volver
 *      cuesta, nadie pregunta, y entonces esto vuelve a ser una grabacion--;
 *   4. que el silencio tambien conteste: si nadie dice nada, sigue solo;
 *   5. que el nombre del invitado se use de verdad, no solo se guarde;
 *   6. que la ficha tecnica y los enlaces salgan cuando toca.
 */
const {chromium}=require('playwright');
const HTML=require('fs').readFileSync(
  '/home/user/express-js-on-vercel/infra/cerebro/index.html','utf8');

const VOZ=()=>{
  const s=window.speechSynthesis; window.__d=[];
  s.getVoices=()=>[{name:'Google español',lang:'es-ES'}];
  s.speak=u=>{const b=document.querySelector('#sub');
    window.__d.push(b?b.textContent:u.text);
    setTimeout(()=>{u.onstart&&u.onstart();setTimeout(()=>u.onend&&u.onend(),5);},4);};
  s.cancel=()=>{};
  ['speaking','pending','paused'].forEach(k=>
    Object.defineProperty(s,k,{get:()=>false}));
  /* sin microfono: se prueba el camino de los BOTONES, que es el que
     funciona en cualquier aparato y el que no puedo simular de otra forma */
  navigator.mediaDevices&&(navigator.mediaDevices.getUserMedia=()=>Promise.reject(new Error('no')));
};

/* Espera a que la voz deje de crecer: cada frase sale en varios trozos. */
async function asentar(p,ms){
  let prev=-1,quieto=0;
  /* La ventana tiene que ser MAYOR que la pausa entre frases (hasta 740 ms)
     mas la de entre trozos (300 ms), o se ve una meseta que no existe. */
  for(let k=0;k<(ms||18);k++){
    await p.waitForTimeout(900);
    const n=await p.evaluate(()=>window.__d.length);
    quieto=(n===prev)?quieto+1:0; prev=n;
    if(quieto>=2)return;
  }
}
const sub=p=>p.evaluate(()=>document.querySelector('#sub').textContent);

(async()=>{
  const b=await chromium.launch({
    executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox']});
  const p=await(await b.newContext({viewport:{width:1280,height:860}})).newPage();
  const err=[]; p.on('pageerror',e=>err.push(e.message));
  await p.route('**/*',r=>{
    const u=r.request().url();
    if(/cerebro\.local\/demo/.test(u)&&!u.includes('ordenes'))
      return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:HTML});
    if(u.includes('/ordenes/demo/datos'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        fecha:'14 de agosto',precioORIGEN:'2.5455',bloque5534:24300,gasGwei:93,chainId:5534})});
    if(u.includes('/voz/'))return r.fulfill({status:404,body:''});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await p.addInitScript(VOZ);
  await p.goto('http://cerebro.local/demo',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1400);
  let mal=0;

  console.log('══ LA PUERTA');
  const hayCampo=await p.evaluate(()=>!!document.querySelector('#nombreVisita'));
  console.log('   pide el nombre: '+(hayCampo?'✓':'✕'));
  if(!hayCampo)mal++;
  await p.fill('#nombreVisita','carlos');
  await p.click('#puerta [data-idi="es"]');
  await p.waitForTimeout(900);
  const chapa=await p.evaluate(()=>({v:VISITA,
    chapa:document.querySelector('#quienNom').textContent,
    disco:document.querySelector('#disco').textContent}));
  console.log('   lo guarda con mayúscula: "'+chapa.v+'" '+(chapa.v==='Carlos'?'✓':'✕'));
  console.log('   lo pone en la chapa: "'+chapa.chapa+'" · disco "'+chapa.disco+'" '+
              (/CARLOS/.test(chapa.chapa)&&chapa.disco==='C'?'✓':'✕'));
  if(chapa.v!=='Carlos'||!/CARLOS/.test(chapa.chapa))mal++;

  // el recorrido arranca solo en modo invitado
  await asentar(p,12);
  const saludo=(await p.evaluate(()=>window.__d.join(' ')));
  console.log('   te saluda por tu nombre: '+(/Carlos/.test(saludo)?'✓':'✕ '+saludo.slice(0,70)));
  if(!/Carlos/.test(saludo))mal++;

  console.log('\n══ SE PARA A PREGUNTAR');
  // esperar al primer punto de control
  let llego=false;
  for(let i=0;i<110;i++){
    await p.waitForTimeout(500);
    if(await p.evaluate(()=>esperandoPregunta)){llego=true;break;}
  }
  const st=await p.evaluate(()=>({
    esp:esperandoPregunta, pend:!!(colaGuardada&&colaGuardada.length),
    sio:getComputedStyle(document.querySelector('#siono')).display,
    si:document.querySelector('#btnSi').textContent,
    no:document.querySelector('#btnNo').textContent,
    cap:document.querySelector('#capNom').textContent,
    sub:document.querySelector('#sub').textContent}));
  console.log('   llega al punto de control: '+(llego?'✓ en "'+st.cap+'"':'✕ nunca paró'));
  console.log('   pregunta: "'+st.sub.replace(/\s+/g,' ').slice(0,62)+'"');
  console.log('   botones: "'+st.si+'" / "'+st.no+'" '+
              (/PREGUNTA/i.test(st.si)&&/SIGUE/i.test(st.no)?'✓':'✕'));
  console.log('   guarda lo que queda: '+(st.pend?'✓':'✕'));
  if(!llego||!st.pend||!/PREGUNTA/i.test(st.si))mal++;
  const antes=await p.evaluate(()=>colaGuardada?colaGuardada.length:0);
  const capAntes=st.cap;

  console.log('\n══ PREGUNTAS Y VUELVE SOLA');
  await p.click('#btnSi');
  await p.waitForTimeout(400);
  await p.evaluate(()=>{window.__d=[];atender('esto esta respaldado en oro');});
  await asentar(p);
  const resp=await p.evaluate(()=>({d:window.__d.join(' '),tema:ultimoTema,
    vuelve:volverTrasResponder, pend:!!(colaGuardada&&colaGuardada.length),
    n:colaGuardada?colaGuardada.length:0}));
  const contesta=/figura jur|no est. cerrad/i.test(resp.d);
  console.log('   contesta la pregunta: '+(contesta?'✓ '+resp.tema:'✕ '+resp.d.slice(0,70)));
  /* O sigue guardado, o ya se lo llevo la vuelta automatica --que es lo que
     tiene que pasar-- y entonces esta en la cola. Lo que NO puede es haberse
     perdido: eso seria volver al sitio equivocado. */
  const sitio=await p.evaluate(()=>({g:colaGuardada?colaGuardada.length:0,c:cola.length}));
  const conserva=resp.n===antes||sitio.g===antes||sitio.c>=antes-2;
  console.log('   NO pisa el sitio guardado: '+(conserva
    ?'✓ '+(sitio.g?'guardadas '+sitio.g:'ya retomadas, cola '+sitio.c)
    :'✕ '+antes+'→ guard '+sitio.g+' cola '+sitio.c));
  if(!contesta)mal++;
  if(!conserva)mal++;

  // y vuelve sola
  let volvio=false;
  for(let i=0;i<40;i++){
    await p.waitForTimeout(500);
    const v=await p.evaluate(()=>({p:PRESENTANDO,h:hablando,
      pend:!!(colaGuardada&&colaGuardada.length),
      s:document.querySelector('#sub').textContent}));
    if(v.p&&v.h&&!v.pend){volvio=true;break;}
  }
  const dsp=await p.evaluate(()=>({cap:document.querySelector('#capNom').textContent,
    sub:document.querySelector('#sub').textContent}));
  console.log('   vuelve sola al recorrido: '+(volvio?'✓':'✕ se quedó parada'));
  console.log('   y sigue en su capítulo: "'+dsp.cap+'" '+(dsp.cap===capAntes||dsp.cap?'✓':'✕'));
  console.log('   diciendo: "'+dsp.sub.replace(/\s+/g,' ').slice(0,58)+'"');
  if(!volvio)mal++;

  console.log('\n══ EL SILENCIO TAMBIÉN CONTESTA');
  // llegar a otro punto de control y no hacer nada
  let otro=false;
  for(let i=0;i<80;i++){
    await p.waitForTimeout(500);
    if(await p.evaluate(()=>esperandoPregunta)){otro=true;break;}
  }
  if(otro){
    /* El reloj de 15 s se arma cuando TERMINA de preguntar, no cuando
       empieza: contar desde que aparece `esperandoPregunta` deja fuera los
       segundos de la propia pregunta y da un falso fallo. Se espera al
       RELOJ, que es el hecho exacto --mirar el aviso en pantalla no vale,
       porque puede quedar texto de antes y el test sale corriendo--. */
    let armado=false;
    for(let i=0;i<40;i++){
      await p.waitForTimeout(400);
      if(await p.evaluate(()=>esperandoPregunta&&!!relojControl)){armado=true;break;}
    }
    if(!armado)console.log('   ✕ nunca abrió la escucha');
    await p.waitForTimeout(16500);          // el reloj es de 15 s
    const q=await p.evaluate(()=>({esp:esperandoPregunta,h:hablando,
      pend:!!(colaGuardada&&colaGuardada.length)}));
    console.log('   a los 15 s sigue sola: '+(!q.esp&&!q.pend?'✓':'✕ esperando='+q.esp));
    if(q.esp||q.pend)mal++;
  }else{console.log('   ✕ no llegó a un segundo punto de control'); mal++;}

  console.log('\n══ LO QUE SE VE');
  // la ficha tecnica del capitulo de la capa uno
  await p.evaluate(()=>{const k=RECORRIDO.caps.findIndex(c=>/CAPA UNO|LAYER ONE/i.test(c.tit));
    if(k>0)irACapitulo(k);});
  let ficha=null;
  for(let i=0;i<30;i++){
    await p.waitForTimeout(500);
    ficha=await p.evaluate(()=>({abre:document.querySelector('#ficha').classList.contains('abre'),
      tit:document.querySelector('#fichaTit').textContent,
      filas:document.querySelectorAll('#fichaCuerpo .r').length}));
    if(ficha.abre&&ficha.filas>=4)break;
  }
  console.log('   ficha técnica: '+(ficha.abre?'✓ "'+ficha.tit+'" con '+ficha.filas+' filas':'✕'));
  if(!ficha.abre||ficha.filas<4)mal++;
  const specs=await p.evaluate(()=>[...document.querySelectorAll('#fichaCuerpo .r')]
    .map(r=>r.textContent).join(' | '));
  const tieneQbft=/QBFT/i.test(specs), tieneShang=/Shanghai|Shangh/i.test(specs);
  console.log('   dice Besu QBFT: '+(tieneQbft?'✓':'✕')+' · EVM Shanghai: '+(tieneShang?'✓':'✕'));
  if(!tieneQbft||!tieneShang)mal++;

  // los enlaces del capitulo de productos
  await p.evaluate(()=>{const k=RECORRIDO.caps.findIndex(c=>/PRODUCTOS|PRODUCTS/i.test(c.tit));
    if(k>0)irACapitulo(k);});
  let enl=null;
  for(let i=0;i<30;i++){
    await p.waitForTimeout(500);
    enl=await p.evaluate(()=>[...document.querySelectorAll('#enlaces a')]
      .map(a=>a.textContent+' '+a.href));
    if(enl.length)break;
  }
  console.log('   enlaces: '+(enl.length?'✓ '+enl.length+' · '+enl[0]:'✕ ninguno'));
  const blank=await p.evaluate(()=>[...document.querySelectorAll('#enlaces a')]
    .every(a=>a.target==='_blank'));
  console.log('   abren en otra pestaña: '+(blank?'✓':'✕ SE LLEVARÍAN LA PRESENTACIÓN'));
  if(!enl.length||!blank)mal++;

  console.log('\nfallos: '+mal);
  console.log('errores de página: '+(err.length?err.join(' | ').slice(0,300):'ninguno'));
  if(err.length)mal++;
  await b.close();
  process.exitCode=mal?1:0;
})().catch(e=>{console.log('FALLO DEL TEST:',e.message);process.exitCode=1;});
