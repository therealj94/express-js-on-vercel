/* Que la demostracion llegue HASTA EL FINAL.
 *
 * Existe por la queja del 14-ago: «cuando esta haciendo la transaccion se
 * traba ahi y no sigue». La causa era fina y merece quedar escrita:
 * `guardarSitio()` guardaba CUALQUIER cosa que se dijera mientras
 * PRESENTANDO siguiera puesto --incluida la narracion de la propia
 * transaccion, que se guardaba a si misma--. A partir de ahi `parar()` veia
 * algo pendiente y dejaba de llamar al `fin`, que es quien lanza el segundo
 * acto. La presentacion se moria en su mejor momento.
 *
 * Se recorre el camino entero: recorrido -> puntos de control -> transaccion
 * -> segundo acto -> cierre. Y se comprueba que no se queda clavado en
 * ningun escalon.
 */
const {chromium}=require('playwright');
const HTML=require('fs').readFileSync(
  '/home/user/express-js-on-vercel/infra/cerebro/index.html','utf8');

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
    if(u.includes('/ordenes/demo/tx'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        estado:'bien',bloque:24310,segundos:4.2,hash:'0xabc123def456',gasGwei:93})});
    if(u.includes('/voz/'))return r.fulfill({status:404,body:''});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await p.addInitScript(()=>{
    const s=window.speechSynthesis; window.__d=[];
    s.getVoices=()=>[{name:'Paulina',lang:'es-MX'}];
    s.speak=u=>{const q=document.querySelector('#sub');
      window.__d.push(q?q.textContent:u.text);
      setTimeout(()=>{u.onstart&&u.onstart();setTimeout(()=>u.onend&&u.onend(),4);},3);};
    s.cancel=()=>{};
    ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
    navigator.mediaDevices&&(navigator.mediaDevices.getUserMedia=()=>Promise.reject(new Error('no')));
  });
  await p.goto('http://cerebro.local/demo?t=VALE',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1500);
  await p.fill('#nombreVisita','Carlos');
  await p.click('#puerta [data-idi="es"]');
  let mal=0;

  /* Avanza el recorrido como una persona: cuando pregunta, le dice que siga.
     Devuelve `true` en cuanto se cumple lo que se espera. */
  /* Las paradas se cuentan POR CAPITULO, no por flanco de la bandera: con
     un flanco y un sondeo cada 300 ms se pierden paradas cortas y sale un
     recuento que no es el que ve una persona. Este mismo error me hizo
     creer que el recorrido solo paraba una vez cuando paraba en todas. */
  let paradas=0;
  async function avanzar(pred,segundos){
    const t=Date.now();
    while(Date.now()-t<segundos*1000){
      if(await p.evaluate(pred))return {ok:true,paradas};
      if(await p.evaluate(()=>esperandoPregunta)){
        paradas++;
        await p.evaluate(()=>seguirRecorrido());
        await p.waitForTimeout(420);      // que arranque de verdad antes de mirar otra vez
      }
      await p.waitForTimeout(140);
    }
    return {ok:false,paradas};
  }

  console.log('══ EL CAMINO ENTERO');
  // 1 · el recorrido llega hasta la transaccion
  let r=await avanzar(()=>document.querySelector('#vivo').classList.contains('abre'),150,'tx');
  console.log('   llega a la transacción: '+(r.ok?'✓':'✕ NO LLEGÓ')+
              ' · se paró a preguntar '+r.paradas+' veces');
  /* Aqui solo se exige que se PARE alguna vez. Contar cuantas desde fuera
     es poco fiable --el sondeo va por viajes de ida y vuelta al navegador--
     y quien prueba de verdad cada parada es probar-interactivo.cjs. */
  if(!r.ok||r.paradas<1)mal++;

  // 2 · la transaccion confirma
  r=await avanzar(()=>/Confirmada|Confirmed/.test(document.querySelector('#vivoEstado').textContent),60);
  const tx=await p.evaluate(()=>({estado:document.querySelector('#vivoEstado').textContent,
    hash:document.querySelector('#vivoHash').textContent}));
  console.log('   confirma: '+(r.ok?'✓ '+tx.estado+' · '+tx.hash.slice(0,14):'✕ '+tx.estado));
  if(!r.ok)mal++;

  // 3 · Y NO SE QUEDA AHI: pasa al segundo acto. Este es el fallo de la queja.
  r=await avanzar(()=>/capa uno|layer one|aplicaci|application/i
      .test(document.querySelector('#sub').textContent),90);
  const s2=await p.evaluate(()=>({sub:document.querySelector('#sub').textContent,
    cap:document.querySelector('#capNom').textContent,
    pres:PRESENTANDO,hab:hablando}));
  console.log('   pasa al segundo acto: '+(r.ok?'✓ en "'+s2.cap+'"':'✕ SE QUEDÓ CLAVADO'));
  console.log('     «'+s2.sub.replace(/\s+/g,' ').slice(0,64)+'»');
  if(!r.ok)mal++;

  // 4 · y llega al ORIGEN, y al cierre
  r=await avanzar(()=>/000/.test((document.querySelector('#cifras .oro .n')||{}).textContent||'')
      &&MOTAS.length>0,180);
  const oro=await p.evaluate(()=>({cif:(document.querySelector('#cifras .oro .n')||{}).textContent||'',
    motas:typeof MOTAS!=='undefined'?MOTAS.length:-1}));
  console.log('   llega al ORIGEN: '+(oro.cif?'✓ "'+oro.cif+'" · '+oro.motas+' motas':'✕'));
  if(!oro.cif)mal++;

  /* El cierre se busca en lo DICHO, no en el subtitulo: cuando la ultima
     frase termina, `parar()` limpia el subtitulo y mirarlo ahi es mirar
     donde ya no esta. */
  r=await avanzar(()=>/Gracias por tu tiempo|Thank you for your time/
      .test(window.__d.join(' ')),260);
  if(!r.ok){const d=await p.evaluate(()=>({sub:document.querySelector('#sub').textContent,
    cap:document.querySelector('#capNom').textContent,h:hablando,p:PRESENTANDO,
    cola:cola.length,guard:colaGuardada?colaGuardada.length:0}));
    console.log('     se quedó en "'+d.cap+'" cola='+d.cola+' guard='+d.guard+
                ' hablando='+d.h+' · «'+d.sub.replace(/\s+/g,' ').slice(0,54)+'»');}
  console.log('   llega al cierre: '+(r.ok?'✓ tras '+paradas+' paradas':'✕ no llegó al final'));
  if(!r.ok)mal++;

  console.log('\n══ LO QUE NO PUEDE PASAR');
  // el sitio guardado solo puede ser del recorrido, nunca de otra cosa
  const limpio=await p.evaluate(()=>{
    parar(); PRESENTANDO=true;
    const antes=colaGuardada?colaGuardada.length:0;
    decir([{q:'JARVIS',x:'Una frase cualquiera que no es del recorrido.'}]);
    return {antes, guardada:colaGuardada?colaGuardada.length:0};
  });
  await p.waitForTimeout(600);
  const tras=await p.evaluate(()=>colaGuardada?colaGuardada.length:0);
  console.log('   hablar fuera del recorrido NO se guarda como sitio: '+
              (tras===limpio.antes?'✓':'✕ '+limpio.antes+'→'+tras));
  if(tras!==limpio.antes)mal++;

  console.log('\nfallos: '+mal);
  console.log('errores de página: '+(err.length?err.join(' | ').slice(0,300):'ninguno'));
  if(err.length)mal++;
  await b.close();
  process.exitCode=mal?1:0;
})().catch(e=>{console.log('FALLO DEL TEST:',e.message);process.exitCode=1;});
