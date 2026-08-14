/* Que la maqueta haga lo que dice: cada frase resuelve a SU direccion, la
   que toca dinero pide confirmacion y lo que no esta en el mapa se dice. */
const {chromium}=require('playwright');
const RUTA='file:///home/user/express-js-on-vercel/infra/genesis-app/maqueta.html';
const CASOS=[
 ['quiero ver veta wallet','og://wallet/dash','wallet'],
 ['abre mytokenpay','og://pay/cobrar','pay'],
 ['muéstrame mi tarjeta','og://wallet/card','card'],
 ['abre el explorador','og://scan/tx','scan'],
 ['quiero recibir','og://wallet/receive','recibir'],
 ['mis movimientos','og://wallet/activity','activity'],
 ['cóbrale 200 a este cliente','og://pay/cobrar?monto=200','pay'],
];
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const p=await(await b.newContext({viewport:{width:1200,height:1000}})).newPage();
  const err=[]; p.on('pageerror',e=>err.push(e.message));
  await p.goto(RUTA,{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>entrar());
  let mal=0;
  console.log('══ ABRIR Y MOSTRAR');
  for(const [f,uri,vista] of CASOS){
    const r=await p.evaluate(x=>{atender(x);
      return {reg:document.querySelector('#reg div').textContent,
              vista:[...document.querySelectorAll('.vista')].find(v=>v.classList.contains('on')).id};},f);
    const ok=r.reg.includes(uri)&&r.vista==='v-'+vista;
    console.log('  '+(ok?'✓':'✕')+' "'+f+'" → '+r.reg.split('→')[1]+' · '+r.vista);
    if(!ok)mal++;
  }
  console.log('\n══ EL DINERO SE CONFIRMA');
  const env=await p.evaluate(()=>{atender('envía 15 dólares a Juan');
    return {oido:document.querySelector('#oido').textContent,
            botones:[...document.querySelectorAll('#oido .par button')].map(b=>b.textContent),
            vista:[...document.querySelectorAll('.vista')].find(v=>v.classList.contains('on')).id};});
  const pide=env.botones.length===2&&env.vista!=='v-send'&&/15/.test(env.oido)&&/Juan/.test(env.oido);
  console.log('  '+(pide?'✓':'✕')+' pide confirmación antes de abrir enviar · «'+env.oido.slice(0,74)+'»');
  if(!pide)mal++;
  const tras=await p.evaluate(()=>{confirmar();
    return {to:document.querySelector('#s-to').textContent,
            amt:document.querySelector('#s-amt').textContent,
            vista:[...document.querySelectorAll('.vista')].find(v=>v.classList.contains('on')).id,
            oido:document.querySelector('#oido').textContent};});
  const rell=tras.vista==='v-send'&&/Juan/.test(tras.to)&&/15/.test(tras.amt)&&/firmas t/i.test(tras.oido);
  console.log('  '+(rell?'✓':'✕')+' rellena y NO envía · '+tras.to+' · '+tras.amt+' · «'+tras.oido+'»');
  if(!rell)mal++;
  console.log('\n══ LO QUE NO ESTÁ EN EL MAPA');
  for(const f of ['compra un carro','envía 15 dólares a Ramón','envíale a Juan']){
    /* Se vuelve a inicio antes de cada una: lo que se comprueba es que NO
       navega, y venir de la pantalla de enviar hacia trampa al test. */
    const r=await p.evaluate(x=>{ir('home','ORDEN GLOBAL');atender(x);
      return {reg:document.querySelector('#reg div').textContent,
              vista:[...document.querySelectorAll('.vista')].find(v=>v.classList.contains('on')).id};},f);
    const ok=/✕/.test(r.reg)&&r.vista!=='v-send';
    console.log('  '+(ok?'✓':'✕')+' "'+f+'" → '+r.reg.replace(/\s+/g,' ').slice(0,70));
    if(!ok)mal++;
  }
  console.log('\nfallos: '+mal+' · errores de página: '+(err.length?err.join('|'):'ninguno'));
  if(err.length)mal++;
  await b.close(); process.exitCode=mal?1:0;
})().catch(e=>{console.log('FALLO DEL TEST:',e.message);process.exitCode=1;});
