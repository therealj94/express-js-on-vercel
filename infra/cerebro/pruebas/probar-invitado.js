// EL FALLO: un invitado abria el enlace y a los diez segundos el navegador le
// pedia usuario y contrasena. Causa: los temporizadores seguian pidiendo rutas
// internas, y cada 401 lleva WWW-Authenticate -> el navegador saca su ventana.
// Aqui se simula el servidor de verdad --lo interno responde 401 con esa misma
// cabecera-- y se espera MAS que el temporizador mas rapido (10 s).
const {chromium}=require('playwright');
const fs=require('fs');
const HTML=fs.readFileSync('/home/user/express-js-on-vercel/infra/cerebro/index.html','utf8');
const INTERNO=/\/rpc|\/rpc-vieja|salud-|informe\.json|partes\.json|\/ordenes\/bots|\/ordenes\/quien|\/ordenes\/hablar|explorador/;

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
  console.log('\nfallos: '+mal);
  await b.close();
})().catch(e=>console.log('FALLO DEL TEST:',e.message));
