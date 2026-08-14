/* «Abre Veta Wallet» y se abre.
 *
 * En una reunion esto vale mas que cualquier explicacion: quien duda deja de
 * dudar cuando ve la pagina de verdad en su propia pantalla. Por eso importa
 * que funcione con las formas en que la gente lo dice de verdad, y que abra
 * en OTRA pestana --si se lleva la presentacion, el remedio es peor--.
 *
 * Y hay una trampa que se comprueba aparte: «abre X» es una ORDEN, no una
 * pregunta sobre X. Si cayera en el buscador de temas, contestaria hablando
 * de la billetera en vez de abrirla.
 */
const {chromium}=require('playwright');
const RUTA='file:///home/user/express-js-on-vercel/infra/cerebro/index.html';

const CASOS=[
 ['abre veta wallet',              'vetawallet.com'],
 ['ábreme la billetera',           'vetawallet.com'],
 ['abre mytokenpay',               'mytokenpay.com'],
 ['abre la pasarela',              'mytokenpay.com'],
 ['abre ordenscan',                'ordenscan.com'],
 ['llévame al explorador',         'ordenscan.com'],
 ['abre genesis id',               'genesisid.online'],
 ['entra a la identidad',          'genesisid.online'],
 ['abre la red de pruebas',        'testnet.ordenscan.com'],
 ['open veta wallet',              'vetawallet.com'],
 ['show me the site mytokenpay',   'mytokenpay.com'],
];
/* Preguntar POR la billetera no debe abrir nada: es una pregunta. */
const NO_ABRIR=['háblame de veta wallet','qué es mytokenpay','cuántos usuarios tiene la billetera'];

(async()=>{
  const b=await chromium.launch({
    executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox']});
  const p=await(await b.newContext()).newPage();
  const err=[]; p.on('pageerror',e=>err.push(e.message));
  await p.addInitScript(()=>{
    const s=window.speechSynthesis; window.__d=[];
    s.getVoices=()=>[{name:'Paulina',lang:'es-MX'}];
    s.speak=u=>{window.__d.push(u.text);setTimeout(()=>{u.onstart&&u.onstart();
      setTimeout(()=>u.onend&&u.onend(),3);},2);};
    s.cancel=()=>{};
    ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
    /* se espia window.open sin abrir nada de verdad */
    window.__abiertas=[];
    window.open=(u,t)=>{window.__abiertas.push({u,t});return {closed:false};};
  });
  await p.route('**/*',r=>r.request().url().startsWith('file:')
    ? r.continue()
    : r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await p.goto(RUTA+'?demo=1',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{const s=document.querySelector('#idioma');
    s.value='es'; s.dispatchEvent(new Event('change')); desbloqueada=true; parar();});
  await p.waitForTimeout(400);
  let mal=0;

  console.log('══ ABRE LO QUE LE PIDES');
  for(const [frase,dominio] of CASOS){
    const r=await p.evaluate(async f=>{
      window.__abiertas=[]; window.__d=[]; parar();
      await atender(f);
      return {ab:window.__abiertas.map(x=>x.u), t:window.__abiertas.map(x=>x.t),
              dicho:window.__d.join(' ')};
    },frase);
    const ok=r.ab.some(u=>u.includes(dominio));
    const blank=r.t.every(x=>x==='_blank');
    console.log('   '+(ok&&blank?'✓':'✕')+' "'+frase+'" → '+(r.ab[0]||'NADA'));
    if(!ok){console.log('       esperaba '+dominio+' · dijo: '+r.dicho.slice(0,60)); mal++;}
    else if(!blank){console.log('       ✕ NO abre en otra pestaña'); mal++;}
  }

  console.log('\n══ PREGUNTAR NO ES ABRIR');
  for(const f of NO_ABRIR){
    const r=await p.evaluate(async x=>{
      window.__abiertas=[]; window.__d=[]; parar();
      await atender(x);
      return {ab:window.__abiertas.length, dicho:window.__d.join(' ')};
    },f);
    console.log('   '+(r.ab===0&&r.dicho.trim()?'✓':'✕')+' "'+f+'" → '+
                (r.ab?'ABRIÓ '+r.ab:'contesta')+' · «'+r.dicho.slice(0,44)+'»');
    if(r.ab!==0||!r.dicho.trim())mal++;
  }

  console.log('\n══ LA PUERTA PIDE EL MICRÓFONO');
  const q=await p.evaluate(()=>({
    casilla:!!document.querySelector('#pideMic'),
    marcada:document.querySelector('#pideMic')&&document.querySelector('#pideMic').checked,
    fn:typeof pedirMicrofono}));
  console.log('   casilla en la puerta: '+(q.casilla?'✓':'✕')+
              ' · marcada por defecto: '+(q.marcada?'✓':'✕')+
              ' · se pide al elegir idioma: '+(q.fn==='function'?'✓':'✕'));
  if(!q.casilla||!q.marcada||q.fn!=='function')mal++;

  console.log('\nfallos: '+mal);
  console.log('errores de página: '+(err.length?err.join(' | ').slice(0,200):'ninguno'));
  if(err.length)mal++;
  await b.close();
  process.exitCode=mal?1:0;
})().catch(e=>{console.log('FALLO DEL TEST:',e.message);process.exitCode=1;});
