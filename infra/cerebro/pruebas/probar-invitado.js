// EL FALLO: un invitado abria el enlace y a los diez segundos el navegador le
// pedia usuario y contrasena. Causa: los temporizadores seguian pidiendo rutas
// internas, y cada 401 lleva WWW-Authenticate -> el navegador saca su ventana.
// Aqui se simula el servidor de verdad --lo interno responde 401 con esa misma
// cabecera-- y se espera MAS que el temporizador mas rapido (10 s).
const {chromium}=require('playwright');
const fs=require('fs');
const HTML=fs.readFileSync('/home/user/express-js-on-vercel/infra/cerebro/index.html','utf8');
const INTERNO=/\/rpc|\/rpc-vieja|salud-|informe\.json|partes\.json|\/ordenes\/bots|\/ordenes\/quien|\/ordenes\/hablar|explorador/;
const PUBLICO=/\/img\//;

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  let mal=0;

  for(const [nombre,ruta,conVale] of [
      ['SIN VALE · presentación pública','/demo',false],
      ['CON VALE · con transacción','/demo?t=VALE123',true]]){
    const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
    const err=[], pedidasInternas=[];
    p.on('pageerror',e=>err.push(e.message));

    await p.route('**/*', r=>{
      const u=r.request().url();
      if(/\/demo(\?|$)/.test(u)&&!u.includes('ordenes'))
        return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:HTML});
      if(u.includes('/ordenes/demo/datos'))
        return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          fecha:'14 de agosto',precioORIGEN:'2.5455',versionBackend:'79',bloque5534:24300,
          gasGwei:93,chainId:5534,
          ultimaTransaccion:{cuando:new Date().toISOString(),bloque:24262,segundos:3,estado:'bien'}})});
      if(u.includes('/ordenes/demo/tx'))
        return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          estado:'bien',bloque:24310,segundos:4.2,hash:'0xdeadbeef'})});
      if(PUBLICO.test(u))return r.fulfill({status:200,contentType:'image/x-icon',body:''});
      if(INTERNO.test(u)){        // EXACTAMENTE como el servidor de verdad
        pedidasInternas.push(u.replace(/^https?:\/\/[^/]+/,''));
        return r.fulfill({status:401,headers:{'WWW-Authenticate':'Basic realm="restricted"'},body:''});
      }
      return r.fulfill({status:200,body:'ok'});
    });

    await p.addInitScript(()=>{
      const V=[{name:'Mónica',lang:'es-ES'}];
      const s=window.speechSynthesis; s.getVoices=()=>V;
      s.speak=u=>{setTimeout(()=>{u.onstart&&u.onstart();setTimeout(()=>u.onend&&u.onend(),250);},10);};
      s.cancel=()=>{};
      ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
    });
    await p.goto('http://cerebro.local'+ruta,{waitUntil:'domcontentloaded'});
    await p.waitForTimeout(1200);
    await p.click('[data-idi="es"]').catch(()=>{});
    await p.waitForTimeout(26000);      // el temporizador mas rapido era de 10 s

    const st=await p.evaluate(()=>({invitado:INVITADO,puedeTx:PUEDE_TX,
      modo:document.querySelector('#modo').textContent,
      cuenta:document.querySelector('#cuenta').textContent,
      rojos:document.querySelectorAll('.fila.mal').length,
      vivo:getComputedStyle(document.querySelector('#btnVivo')).display}));

    console.log('══ '+nombre);
    console.log('   peticiones internas: '+(pedidasInternas.length?'✕ '+[...new Set(pedidasInternas)].join(', '):'✓ NINGUNA en 26 s'));
    console.log('   cabecera: "'+st.modo+' · '+st.cuenta+'" · rojos='+st.rojos);
    console.log('   botón EN VIVO: '+(conVale?(st.vivo!=='none'?'✓ visible':'✕ oculto')
                                             :(st.vivo==='none'?'✓ oculto sin vale':'✕ VISIBLE SIN VALE')));
    if(pedidasInternas.length) mal++;
    if(st.rojos) mal++;
    if(conVale ? st.vivo==='none' : st.vivo!=='none') mal++;
    if(err.length){console.log('   errores: '+err.join(' | ').slice(0,160)); mal++;}
  }
  // ── reanudar donde se quedo
  const p3=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  await p3.route('**/*', r=>{
    const u=r.request().url();
    if(/\/demo(\?|$)/.test(u)&&!u.includes('ordenes'))
      return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:HTML});
    if(u.includes('/ordenes/demo/datos'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        fecha:'14 de agosto',precioORIGEN:'2.5455',bloque5534:24300,gasGwei:93,chainId:5534})});
    if(u.includes('/ordenes/demo/tx'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        estado:'bien',bloque:24310,segundos:4.2,hash:'0xdead'})});
    return r.fulfill({status:200,body:'ok'});
  });
  await p3.addInitScript(()=>{
    const V=[{name:'Mónica',lang:'es-ES'}];
    const s=window.speechSynthesis; s.getVoices=()=>V;
    s.speak=u=>{setTimeout(()=>{u.onstart&&u.onstart();setTimeout(()=>u.onend&&u.onend(),200);},8);};
    s.cancel=()=>{};
    ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
  });
  await p3.goto('http://cerebro.local/demo?t=V',{waitUntil:'domcontentloaded'});
  await p3.waitForTimeout(1200);
  await p3.click('[data-idi="es"]');
  await p3.waitForTimeout(2500);
  // parar a mitad, como quien se va a mirar el explorador
  await p3.click('#btnPresenta');
  await p3.waitForTimeout(500);
  let st=await p3.evaluate(()=>({pend:typeof colaGuardada!=='undefined'&&!!(colaGuardada&&colaGuardada.length),
    etiqueta:document.querySelector('#lblPresenta').textContent}));
  console.log('\n══ REANUDAR');
  console.log('   guarda lo pendiente: '+(st.pend?'✓':'✕'));
  console.log('   el botón dice: "'+st.etiqueta+'" '+(/CONTINUAR|RESUME/.test(st.etiqueta)?'✓':'✕'));
  if(!st.pend||!/CONTINUAR|RESUME/.test(st.etiqueta)) mal++;
  await p3.click('#btnPresenta');
  await p3.waitForTimeout(900);
  st=await p3.evaluate(()=>({sigue:PRESENTANDO,vacio:!(colaGuardada&&colaGuardada.length)}));
  console.log('   al pulsar, continúa: '+(st.sigue&&st.vacio?'✓':'✕'));
  if(!st.sigue||!st.vacio) mal++;

  // ── el segundo acto y el ORIGEN dorado
  await p3.evaluate(()=>{parar();PRESENTANDO=true;segundoActo();});
  /* Al hecho, no al reloj: la voz respira y la linea de la capa uno tarda
     mas en llegar que antes. */
  for(let i=0;i<30;i++){
    await p3.waitForTimeout(400);
    if(await p3.evaluate(()=>/capa uno|layer one|cadena/i
        .test(document.querySelector('#sub').textContent)))break;
  }
  st=await p3.evaluate(()=>({sub:document.querySelector('#sub').textContent,
    motas:typeof MOTAS!=='undefined'?MOTAS.length:-1,
    cifra:(document.querySelector('#cifras .oro .n')||{}).textContent||''}));
  const capa1=/capa uno|layer one/i.test(st.sub)||/cadena/i.test(st.sub);
  console.log('\n══ SEGUNDO ACTO');
  console.log('   narra: "'+st.sub.replace(/\s+/g,' ').slice(0,66)+'"');
  console.log('   habla de capa uno: '+(capa1?'✓':'✕'));
  if(!capa1) mal++;
  // el disparo del oro llega cuando la narración entra al ORIGEN (~12s),
  // así que se espera al hecho, no a un reloj.
  /* Se SALTA al capitulo del ORIGEN en vez de esperar a que llegue. En el
     emulador cada linea tarda ~10 s --el lienzo se come el hilo-- y esperar
     siete lineas eran noventa segundos de test para comprobar una cosa. Y de
     paso se ejercita la barra de capitulos, que es como se usa de verdad. */
  await p3.evaluate(()=>{const k=RECORRIDO.caps.findIndex(c=>/ORIGEN/i.test(c.tit));
    if(k>0)irACapitulo(k);});
  st={motas:0,cifra:''};
  for(let i=0;i<40;i++){
    await p3.waitForTimeout(600);
    st=await p3.evaluate(()=>({motas:MOTAS.length,
      cifra:(document.querySelector('#cifras .oro .n')||{}).textContent||''}));
    if(st.motas>0&&st.cifra) break;
  }
  console.log('   motas de ORIGEN volando: '+(st.motas>0?'✓ '+st.motas:'✕ 0'));
  console.log('   cifra en pantalla: "'+st.cifra+'" '+(st.cifra?'✓':'✕'));
  if(!st.motas) mal++;
  if(!st.cifra) mal++;

  console.log('\nfallos: '+mal);
  await b.close();
})().catch(e=>console.log('FALLO DEL TEST:',e.message));
