// Prueba la presentacion para inversionistas: que el recorrido narre, que la
// camara vuele al racimo que se nombra, que los contadores suban, que la
// transaccion en vivo se pinte, y --lo mas importante-- que el modo invitado
// NO pida ni ensene nada interno.
const {chromium}=require('playwright');
const RUTA='file:///home/user/express-js-on-vercel/infra/cerebro/index.html';

function entorno(invitado){
    if(!invitado) localStorage.setItem('idiomaCerebro','es');
    window.__d=[]; window.__pedidas=[];
    const V=[{name:'Mónica',lang:'es-ES'},{name:'Daniel',lang:'en-GB'}];
    const s=window.speechSynthesis; s.getVoices=()=>V;
    s.speak=u=>{window.__d.push(u.text);setTimeout(()=>{u.onstart&&u.onstart();u.onend&&u.onend();},4);};
    s.cancel=()=>{};
    ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
    window.fetch=async(u,o)=>{
      const url=String(u); window.__pedidas.push(url);
      const J=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
      if(url.includes('/ordenes/demo/datos'))return J({fecha:'14 de agosto',precioORIGEN:'2.5455',
        versionBackend:'79',bloque5534:24197,gasGwei:93,chainId:5534,
        ultimaTransaccion:{cuando:new Date().toISOString(),bloque:23621,segundos:9,estado:'bien'},
        cifras:{usuarios:435,tarjetas:24}});
      if(url.includes('/ordenes/demo/tx')||url.includes('bots/ahora'))
        return J({estado:'bien',bloque:24200,segundos:11.4,hash:'0xabc123def456',enviosQueQuedan:54});
      if(url.includes('informe.json'))return J({fecha:'14 de agosto',versionBackend:'79',precio:'2.55',
        comision:'0.001 ORIGEN',genesisListo:true,hechoHoy:['x'],pendiente:['SECRETO INTERNO']});
      if(url.includes('partes.json'))return J([{agente:'cerrajero',nombre:'CERRAJERO',veredicto:'falla',
        cuando:new Date().toISOString(),resumen:'SECRETO INTERNO de seguridad',hallazgos:[],escala:['x']}]);
      if(url.includes('/ordenes/quien'))return J({usuario:'jose'});
      if(url.includes('/ordenes/bots'))return J({cuando:new Date().toISOString(),estado:'bien',
        bloque:23621,segundos:9,enviosQueQuedan:55});
      if(url.includes('rpc-vieja'))return J({jsonrpc:'2.0',id:1,result:'0x1'});
      if(url.includes('/rpc'))return J({jsonrpc:'2.0',id:1,result:'0x159e'});
      if(url.includes('totalBlock'))return J({blockTotal:24000});
      if(url.includes('github'))return J({state:'open',merged:false});
      if(url.includes('hablar'))return new Response('{}',{status:502});
      return new Response('ok');
    };
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  let mal=0;
  const err=[];

  // ══ A · MODO INTERNO ══════════════════════════════════════════════════
  let p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage();
  p.on('pageerror',e=>err.push('INTERNO: '+e.message));
  await p.addInitScript(entorno,false);
  await p.goto(RUTA,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{desbloqueada=true;
    document.querySelector('#puerta').classList.remove('abre');});

  console.log('══ MODO INTERNO ══');
  /* Se espera AL HECHO, no al reloj. Desde que la voz respira, cada frase
     sale en varios trozos y el guion tarda mas en llegar a la linea que
     enciende los contadores: con esperas fijas el test acusaba de rotas
     cosas que solo iban dos segundos por detras. Y ademas asi se puede
     saltar de capitulo, que es como se ve de verdad. */
  /* Desde que el recorrido tiene PUNTOS DE CONTROL, se para a preguntar y
     no llega solo al final. Aqui se hace lo que haria una persona: cuando
     pregunta, se le dice que siga. Sin esto el test creia que la camara no
     volaba cuando en realidad el recorrido estaba esperando respuesta. */
  const hasta=async(pred,ms)=>{const t=Date.now();
    while(Date.now()-t<(ms||20000)){
      const v=await p.evaluate(pred); if(v)return v;
      if(await p.evaluate(()=>typeof esperandoPregunta!=='undefined'&&esperandoPregunta))
        await p.evaluate(()=>seguirRecorrido());
      await p.waitForTimeout(250);}
    return null;};

  // el recorrido
  await p.click('#btnPresenta');
  await p.waitForTimeout(1500);
  await hasta(()=>document.querySelector('#cifras').classList.contains('abre'));
  let st=await p.evaluate(()=>({presenta:PRESENTANDO,dichas:window.__d.length,
    cifras:document.querySelector('#cifras').classList.contains('abre'),
    nCifras:document.querySelectorAll('#cifras .c').length, foco:FOCO, zoom:+ZOOM.toFixed(2)}));
  console.log('  recorrido: '+(st.presenta?'✓ activo':'✕')+' · '+st.dichas+' trozos dichos');
  console.log('  contadores: '+(st.cifras?'✓ visibles ('+st.nCifras+')':'✕ no aparecen'));
  if(!st.presenta||st.dichas<3) mal++;
  if(!st.cifras||st.nCifras<3) mal++;

  // que el valor de un contador suba de verdad
  await hasta(()=>{const n=document.querySelector('#cifras .n');
    return n&&/[1-9]/.test(n.textContent);});
  const val=await p.evaluate(()=>{const n=document.querySelector('#cifras .n');return n?n.textContent:'';});
  const subio=/[1-9]/.test(val);
  console.log('  el contador sube: '+(subio?'✓ '+val:'✕ '+JSON.stringify(val)));
  if(!subio) mal++;

  // la cámara vuela y hace foco
  await hasta(()=>FOCO&&ZOOM>1.05);
  st=await p.evaluate(()=>({foco:FOCO,zoom:+ZOOM.toFixed(2),destino:!!camDestino}));
  console.log('  cámara: foco='+st.foco+' zoom='+st.zoom+' '+((st.foco&&st.zoom>1.05)?'✓ voló y acercó':'✕ no se movió'));
  if(!st.foco||st.zoom<=1.05) mal++;

  await p.evaluate(()=>pararPresentacion());
  await p.waitForTimeout(400);

  // la transacción en vivo
  await p.evaluate(()=>{window.__d=[];});
  await p.click('#btnVivo');
  await p.waitForTimeout(1600);
  st=await p.evaluate(()=>({abre:document.querySelector('#vivo').classList.contains('abre'),
    estado:document.querySelector('#vivoEstado').textContent,
    hash:document.querySelector('#vivoHash').textContent,
    link:document.querySelector('#vivoLink').getAttribute('href')||'',
    rej:document.querySelector('#vivoRej').textContent}));
  const vivoOk=st.abre&&/Confirmada|Confirmed/.test(st.estado)&&st.hash.includes('0xabc')&&st.link.includes('ordenscan');
  console.log('  transacción en vivo: '+(vivoOk?'✓ '+st.estado+' · '+st.rej.replace(/\s+/g,' ').trim():'✕ '+JSON.stringify(st)));
  if(!vivoOk) mal++;

  // el viaje del dólar
  await p.evaluate(()=>{document.querySelector('#vivo').classList.remove('abre');window.__d=[];viajeDelDolar();});
  /* Al hecho, no al reloj: con la voz respirando, la ruta tarda mas en
     recorrerse y 3,4 s fijos median a mitad del primer tramo. */
  await hasta(()=>/Polygon/i.test(window.__d.join(' ')),22000);
  const dolar=await p.evaluate(()=>window.__d.join(' | '));
  const dOk=/tarjeta/i.test(dolar)&&/Polygon/i.test(dolar);
  console.log('  viaje del dólar: '+(dOk?'✓ recorre la ruta':'✕ '+dolar.slice(0,60)));
  if(!dOk) mal++;

  // modo sala
  await p.evaluate(()=>{parar();document.querySelector('#btnSala').click();});
  const sala=await p.evaluate(()=>getComputedStyle(document.querySelector('#sub')).fontSize);
  console.log('  modo sala: subtítulo a '+sala+' '+(parseFloat(sala)>=20?'✓':'✕'));
  if(parseFloat(sala)<20) mal++;

  // ══ B · MODO INVITADO ═════════════════════════════════════════════════
  console.log('\n══ MODO INVITADO ══');
  const c2=await b.newContext({viewport:{width:1600,height:900}});
  const p2=await c2.newPage();
  p2.on('pageerror',e=>err.push('INVITADO: '+e.message));
  await p2.addInitScript(entorno,true);
  const fs=require('fs');
  const HTML=fs.readFileSync('/home/user/express-js-on-vercel/infra/cerebro/index.html','utf8');
  await p2.route('**/demo*',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:HTML}));
  await p2.goto('http://cerebro.local/demo?t=VALE123',{waitUntil:'domcontentloaded'});
  await p2.waitForTimeout(2000);
  await p2.evaluate(()=>{desbloqueada=true;
    document.querySelector('#puerta').classList.remove('abre');});
  await p2.waitForTimeout(300);

  const g=await p2.evaluate(()=>({
    invitado: typeof INVITADO!=='undefined'?INVITADO:null,
    pedidas: window.__pedidas.filter(u=>/informe\.json|partes\.json|ordenes\/bots|ordenes\/quien/.test(u)),
    dockOculto: getComputedStyle(document.querySelector('#dock')).display==='none',
    textoPagina: document.body.innerText
  }));
  console.log('  detecta invitado: '+(g.invitado?'✓':'✕ '+g.invitado));
  console.log('  pide algo interno: '+(g.pedidas.length===0?'✓ nada':'✕ '+JSON.stringify(g.pedidas)));
  console.log('  dock interno oculto: '+(g.dockOculto?'✓':'✕'));
  const filtra=!/SECRETO INTERNO/.test(g.textoPagina);
  console.log('  no muestra lo interno: '+(filtra?'✓':'✕ APARECE EN PANTALLA'));
  if(!g.invitado||g.pedidas.length||!g.dockOculto||!filtra) mal++;

  console.log('\nfallos: '+mal);
  console.log('errores de página: '+(err.length?err.join(' | ').slice(0,300):'ninguno'));
  await b.close();
})().catch(e=>console.log('FALLO DEL TEST:',e.message));
