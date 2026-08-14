// Toca cosas del ecosistema y comprueba que JARVIS OFRECE el reporte, que el
// «sí» lo dispara, que el «no» lo cancela, y que un «sí» suelto SIN pregunta
// en el aire no hace nada raro.
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
 const err=[]; p.on('pageerror',e=>err.push(e.message));
 await p.addInitScript(()=>{
   localStorage.setItem('idiomaCerebro','es');
   window.__d=[];
   const V=[{name:'Mónica',lang:'es-ES'},{name:'Paulina',lang:'es-MX'},{name:'Daniel',lang:'en-GB'}];
   const s=window.speechSynthesis; s.getVoices=()=>V;
   s.speak=u=>{window.__d.push(u.text);setTimeout(()=>{u.onstart&&u.onstart();u.onend&&u.onend();},5);};
   s.cancel=()=>{};
   ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
   window.fetch=async u=>{const url=String(u),J=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
     if(url.includes('quien'))return J({usuario:'jose'});
     if(url.includes('informe'))return J({fecha:'14 ago',versionBackend:'79',precio:'2.55',comision:'0.001 ORIGEN',genesisListo:true,hechoHoy:['a'],pendiente:['b']});
     if(url.includes('partes'))return J([{agente:'cerrajero',nombre:'CERRAJERO',veredicto:'falla',cuando:new Date().toISOString(),resumen:'Dos cuentas sin segundo factor',hallazgos:['Sin politica'],escala:['Poner segundo factor']}]);
     if(url.includes('/ordenes/bots'))return J({cuando:new Date().toISOString(),estado:'bien',bloque:22541,segundos:12.1,enviosQueQuedan:55});
     if(url.includes('rpc-vieja'))return J({jsonrpc:'2.0',id:1,result:'0x1'});
     if(url.includes('/rpc'))return J({jsonrpc:'2.0',id:1,result:'0x159e'});
     if(url.includes('totalBlock'))return J({blockTotal:22500});
     if(url.includes('github'))return J({state:'open',merged:false});
     if(url.includes('hablar'))return new Response('{}',{status:502});
     return new Response('ok');};
 });
 await p.goto('file:///home/user/express-js-on-vercel/infra/cerebro/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForTimeout(2000);
 // la puerta de idioma tapa todo hasta que se elige: se elige. 
 if(await p.$('#puerta.abre')) await p.click('#puerta [data-idi="es"]'); 
 await p.waitForTimeout(400);
 await p.evaluate(()=>{desbloqueada=true;});
 let mal=0;
 const dicho=()=>p.evaluate(()=>window.__d.slice());
 /* La voz sale en trozos desde que respira: se espera a que aparezca lo que
    se busca, no a un reloj. Con 400 ms fijos el test media a media frase. */
 const hasta=async(pred,ms)=>{const t=Date.now();
   while(Date.now()-t<(ms||4000)){
     const d=await dicho(); if(pred(d))return d;
     await p.waitForTimeout(200);}
   return dicho();};
 const dijo=re=>hasta(d=>re.test(d.join(' ')));
 const limpiar=async()=>{await p.evaluate(()=>{window.__d=[];parar();
   document.querySelector('#det').classList.remove('abre');});await p.waitForTimeout(120);};

 // 1 · tocar un sistema del dock -> ofrece
 await limpiar();
 await p.click('#sistemas .fila:nth-child(4)');   // VETA WALLET
 let d=await dijo(/¿Quieres que te dé el reporte de/);
 const ofrece=/¿Quieres que te dé el reporte de/.test(d.join(' '));
 const botones=await p.evaluate(()=>document.querySelector('#siono').classList.contains('abre'));
 console.log('1 · tocar sistema   '+(ofrece?'✓ ofrece':'✕ '+(d[0]||'nada'))+' · botones '+(botones?'✓':'✕'));
 if(!ofrece||!botones)mal++;

 // 2 · decir «sí» -> reporte completo
 await p.evaluate(()=>{window.__d=[];atender('sí');});
 d=await hasta(d=>d.length>=2&&/VETA WALLET|BILLETERA/i.test(d.join(' ')),6000);
 const reporta=d.length>=2 && /VETA WALLET|BILLETERA/i.test(d.join(' '));
 console.log('2 · decir sí        '+(reporta?'✓ da el reporte ('+d.length+' frases)':'✕ '+JSON.stringify(d.slice(0,2))));
 if(!reporta)mal++;

 // 3 · tocar un agente -> ofrece; decir «no» -> lo deja
 await limpiar();
 await p.click('#agentes .fila:nth-child(6)');    // CERRAJERO
 d=await dijo(/reporte de CERRAJERO/);
 const of2=/reporte de CERRAJERO/.test(d.join(' '));
 await p.evaluate(()=>{window.__d=[];atender('no');});
 d=await dijo(/Como quieras/);
 const rechaza=/Como quieras/.test(d.join(' '));
 console.log('3 · agente y decir no '+(of2?'✓ ofrece':'✕')+' · '+(rechaza?'✓ lo deja':'✕ '+(d[0]||'nada')));
 if(!of2||!rechaza)mal++;

 // 4 · «sí» sin pregunta en el aire -> no debe romper nada
 await limpiar();
 await p.evaluate(()=>{window.__d=[];atender('sí');});
 d=await hasta(d=>d.length>0);
 const sano=d.length>0 && !/reporte de/.test(d[0]);
 console.log('4 · sí sin contexto  '+(sano?'✓ contesta algo sensato':'✕ '+(d[0]||'SILENCIO')));
 if(!sano)mal++;

 // 5 · tocar y luego preguntar OTRA cosa -> la oferta se cae
 await limpiar();
 await p.click('#sistemas .fila:nth-child(2)');
 await p.waitForTimeout(300);
 await p.evaluate(()=>{window.__d=[];atender('cuánto cuesta');});
 await p.waitForTimeout(400);
 const armada=await p.evaluate(()=>!!ofrecido);
 console.log('5 · cambiar de tema  '+(!armada?'✓ la oferta se cae':'✕ sigue armada'));
 if(armada)mal++;

 console.log('\nfallos: '+mal);
 console.log('errores de página: '+(err.length?err.join(' | ').slice(0,200):'ninguno'));
 await b.close();
})().catch(e=>console.log('FALLO DEL TEST:',e.message));
