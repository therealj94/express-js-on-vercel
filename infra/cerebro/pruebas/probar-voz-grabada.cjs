/* La voz grabada, y sobre todo su RED.
 *
 * Lo que se comprueba aqui no es que suene bien --eso lo juzga un oido--,
 * es lo unico que puede salir catastroficamente mal: que un audio que no
 * carga deje al asistente MUDO delante de un inversionista. Ese fallo ya
 * costo un dia entero cuando fue la voz del navegador, y la regla salio de
 * ahi: antes una voz mediocre que un silencio.
 *
 * Cuatro escenarios:
 *   1. hay manifiesto y el audio carga  -> suena el fichero, NO el navegador
 *   2. hay manifiesto pero el fichero da 404 -> habla el navegador
 *   3. hay manifiesto y el audio se queda colgado -> habla el navegador
 *   4. no hay manifiesto -> habla el navegador, como toda la vida
 *
 * Y una quinta que es de correccion, no de red: que la clave del audio
 * dependa del TEXTO. Si alguien cambia una frase y no vuelve a grabar, el
 * cerebro tiene que dejar de encontrar el fichero --y hablar-- en vez de
 * reproducir un audio que dice otra cosa que el subtitulo.
 */
const {chromium}=require('playwright');
const HTML=require('fs').readFileSync(
  '/home/user/express-js-on-vercel/infra/cerebro/index.html','utf8');

/* un mp3 de verdad, corto y silencioso, en base64: los navegadores se niegan
   a reproducir bytes inventados y el test daria un falso negativo */
const MP3=Buffer.from(
 '//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAADAAAGQABVVVVVVVVVVVVVVVVVVVVVVVVV'+
 'Vaqqqqqqqqqqqqqqqqqqqqqqqqqq//////////////////////////8AAAA5TEFNRTMuOTlyAaUA'+
 'AAAALjUAABRAJATiQgAAQAAABkAoGvUeAAAAAAAAAAAAAAAAAAAA//uQxAADwAABpAAAACAAADSA'+
 'AAAETEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'+
 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uQxA6DwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVV'+
 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'+
 'VVVVVVVVVVVVVVVVVVVV','base64');

const espiaVoz=()=>{
  const s=window.speechSynthesis;
  window.__nav=[];                       // lo que dijo el NAVEGADOR
  s.getVoices=()=>[{name:'Google español',lang:'es-ES'}];
  s.speak=u=>{window.__nav.push(u.text);
    setTimeout(()=>{u.onstart&&u.onstart();setTimeout(()=>u.onend&&u.onend(),20);},5);};
  s.cancel=()=>{};
  ['speaking','pending','paused'].forEach(k=>
    Object.defineProperty(s,k,{get:()=>false}));
  /* y lo que se reprodujo como FICHERO */
  window.__aud=[];
  const P=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){
    window.__aud.push(this.src.replace(/^https?:\/\/[^/]+/,''));
    return P.apply(this,arguments);
  };
};

async function montar(b,{manifiesto,audio}){
  const p=await(await b.newContext()).newPage();
  const err=[]; p.on('pageerror',e=>err.push(e.message));
  await p.route('**/*',r=>{
    const u=r.request().url();
    if(/cerebro\.local\/?$/.test(u)||/\/index\.html/.test(u))
      return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:HTML});
    if(u.includes('/voz/manifiesto.json'))
      return manifiesto
        ? r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(manifiesto)})
        : r.fulfill({status:404,body:''});
    if(u.includes('/voz/')){
      if(audio==='404')return r.fulfill({status:404,body:''});
      if(audio==='colgado')return new Promise(()=>{});   // nunca contesta
      return r.fulfill({status:200,contentType:'audio/mpeg',body:MP3});
    }
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await p.addInitScript(espiaVoz);
  await p.goto('http://cerebro.local/',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1300);
  await p.click('#puerta [data-idi="es"]').catch(()=>{});
  await p.waitForTimeout(600);
  await p.evaluate(()=>{parar();desbloqueada=true;});
  return {p,err};
}

/* Espera AL HECHO CONCRETO que toca en cada caso.
   Ojo con esto, que ya me engano una vez: `play()` se apunta en cuanto se
   llama, antes de saber si el fichero existe. Si aqui se espera "algo",
   los casos de RED devuelven al instante con el intento de fichero y
   parece que el asistente se quedo mudo cuando en realidad no le habia
   dado tiempo ni a fallar. Por eso cada caso dice QUE espera. */
async function decirY(p,txt,quiero,ms){
  await p.evaluate(()=>{parar();window.__nav=[];window.__aud=[];});
  await p.waitForTimeout(60);
  await p.evaluate(t=>decir([{q:'JARVIS',x:t}]),txt);
  const listo=quiero==='nav'  ? r=>r.nav.length
            : quiero==='aud'  ? r=>r.aud.length
            :                   r=>r.nav.length||r.aud.length;
  const t0=Date.now();
  while(Date.now()-t0<(ms||6000)){
    const r=await p.evaluate(()=>({nav:window.__nav.slice(),aud:window.__aud.slice()}));
    if(listo(r))return r;
    await p.waitForTimeout(200);
  }
  return p.evaluate(()=>({nav:window.__nav.slice(),aud:window.__aud.slice()}));
}

(async()=>{
  const b=await chromium.launch({
    executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  let mal=0;
  const FRASE='Bienvenido a Orden Global.';

  // la clave se calcula con el propio cerebro: es la que usa de verdad
  const {p:p0}=await montar(b,{manifiesto:null});
  const clave=await p0.evaluate(t=>claveVoz(t,'es_MX-claude-high'),FRASE);
  console.log('clave de "'+FRASE+'": '+clave);
  const MAN={[clave]:{f:clave+'.mp3',i:'es',o:'recorrido'}};

  console.log('\n── 4 · sin manifiesto (como toda la vida)');
  let r=await decirY(p0,FRASE,'nav');
  console.log('   navegador: '+r.nav.length+'  fichero: '+r.aud.length+
              '  '+(r.nav.length&&!r.aud.length?'✓':'✕'));
  if(!r.nav.length||r.aud.length)mal++;

  console.log('\n── 1 · con manifiesto y audio bueno');
  const {p:p1,err:e1}=await montar(b,{manifiesto:MAN,audio:'ok'});
  r=await decirY(p1,FRASE,'aud');
  const usaFichero=r.aud.some(u=>u.includes(clave+'.mp3'));
  console.log('   fichero: '+(usaFichero?'✓ '+r.aud[0]:'✕ '+JSON.stringify(r.aud)));
  await p1.waitForTimeout(1200);        // tiempo de sobra para meter la pata
  const encima=await p1.evaluate(()=>window.__nav.length);
  console.log('   y NO habla el navegador encima: '+(!encima?'✓':'✕ '+encima));
  r.nav=new Array(encima);
  if(!usaFichero||r.nav.length)mal++;

  console.log('\n── 5 · una frase QUE NO ESTÁ grabada');
  r=await decirY(p1,'Una frase que nadie ha grabado nunca.','nav');
  console.log('   habla el navegador: '+(r.nav.length&&!r.aud.length?'✓':'✕')+
              '  (fichero: '+r.aud.length+')');
  if(!r.nav.length||r.aud.length)mal++;

  console.log('\n── 2 · el fichero da 404');
  const {p:p2}=await montar(b,{manifiesto:MAN,audio:'404'});
  r=await decirY(p2,FRASE,'nav');
  console.log('   lo intenta: '+(r.aud.length?'✓':'—')+
              '  y acaba hablando el navegador: '+(r.nav.length?'✓ NO SE QUEDA MUDO':'✕ SILENCIO'));
  if(!r.nav.length)mal++;

  console.log('\n── 3 · el fichero se queda colgado');
  const {p:p3}=await montar(b,{manifiesto:MAN,audio:'colgado'});
  r=await decirY(p3,FRASE,'nav',9000);
  console.log('   a los 2 s se rinde y habla: '+(r.nav.length?'✓ NO SE QUEDA MUDO':'✕ SILENCIO'));
  if(!r.nav.length)mal++;

  console.log('\n── parar calla también el fichero');
  const {p:p4}=await montar(b,{manifiesto:MAN,audio:'ok'});
  await decirY(p4,FRASE,'aud');
  await p4.evaluate(()=>parar());
  await p4.waitForTimeout(300);
  const quieto=await p4.evaluate(()=>audioActual===null);
  console.log('   '+(quieto?'✓':'✕ sigue sonando'));
  if(!quieto)mal++;

  const errs=e1.filter(x=>!/play\(\)|interact/i.test(x));
  console.log('\nfallos: '+mal);
  console.log('errores de página: '+(errs.length?errs.join(' | ').slice(0,240):'ninguno'));
  if(errs.length)mal++;
  await b.close();
  process.exitCode=mal?1:0;
})().catch(e=>{console.log('FALLO DEL TEST:',e.message);process.exitCode=1;});
