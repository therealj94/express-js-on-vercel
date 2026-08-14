/* El cerebro en un teléfono de verdad, y el segundo acto en capturas.
   Existe porque la queja llegó con una foto: la maquetación no se comprueba
   leyendo CSS, se comprueba mirando. */
const {chromium}=require('playwright');
const RUTA='/home/user/express-js-on-vercel/infra/cerebro/index.html';
const SAL='/tmp/claude-0/-home-user-express-js-on-vercel/0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad/tiros/';
require('fs').mkdirSync(SAL,{recursive:true});

const VOZ=()=>{
  const V=[{name:'Google español',lang:'es-ES',localService:false},
           {name:'Google UK English Male',lang:'en-GB',localService:false}];
  const s=window.speechSynthesis;
  window.__d=[];
  s.getVoices=()=>V;
  s.speak=u=>{window.__d.push({t:u.text,p:u.pitch,r:u.rate});
    setTimeout(()=>{u.onstart&&u.onstart();
      setTimeout(()=>u.onend&&u.onend(),40);},5);};
  s.cancel=()=>{};
  ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  let mal=0;
  const err=[];

  // ── un teléfono real: el mismo tamaño de la captura de José
  const ctx=await b.newContext({viewport:{width:393,height:851},
    deviceScaleFactor:2,isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'});
  const p=await ctx.newPage();
  p.on('pageerror',e=>err.push(e.message));
  await p.addInitScript(VOZ);
  await p.goto('file://'+RUTA,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1200);
  await p.click('#puerta [data-idi="es"]');
  await p.waitForTimeout(900);
  await p.screenshot({path:SAL+'movil-1-inicio.png'});

  console.log('══ TELÉFONO 393×851');
  // nada se sale por los lados
  let d=await p.evaluate(()=>{
    const fuera=[];
    document.querySelectorAll('#teclas .tecla,#yo,#der,#ruta,#consola').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.width&&(r.left<-1||r.right>innerWidth+1))
        fuera.push((el.id||el.textContent.trim().slice(0,10))+' '+Math.round(r.left)+'..'+Math.round(r.right));
    });
    return {fuera, ancho:document.documentElement.scrollWidth, vp:innerWidth,
            filas:new Set([...document.querySelectorAll('#teclas .tecla')]
              .map(e=>Math.round(e.getBoundingClientRect().top))).size,
            botones:document.querySelectorAll('#teclas .tecla').length};
  });
  console.log('   botones del muelle: '+d.botones+' en '+d.filas+' fila(s)');
  console.log('   nada se sale: '+(d.fuera.length?'✕ '+d.fuera.join(' | '):'✓'));
  console.log('   sin scroll lateral: '+(d.ancho<=d.vp?'✓':'✕ '+d.ancho+'>'+d.vp));
  if(d.fuera.length)mal++;
  if(d.ancho>d.vp)mal++;

  // la cabecera no se pisa
  d=await p.evaluate(()=>{
    const y=document.querySelector('#yo').getBoundingClientRect();
    const i=document.querySelector('#izq');
    const iv=i&&getComputedStyle(i).display!=='none';
    return {iv, pisa: iv? !(i.getBoundingClientRect().right<y.left) : false};
  });
  console.log('   cabecera sin solaparse: '+(d.pisa?'✕':'✓'));
  if(d.pisa)mal++;

  // ── el recorrido: que se pueda mover y que tocar algo NO lo reinicie
  await p.click('#btnPresenta');
  await p.waitForTimeout(2600);
  d=await p.evaluate(()=>({ruta:getComputedStyle(document.querySelector('#ruta')).display,
    caps:RECORRIDO?RECORRIDO.caps.length:0, cap:document.querySelector('#capNom').textContent}));
  console.log('\n══ RECORRIDO');
  console.log('   barra visible: '+(d.ruta!=='none'?'✓':'✕')+' · '+d.caps+' capítulos · en "'+d.cap+'"');
  if(d.ruta==='none'||d.caps<4)mal++;
  await p.screenshot({path:SAL+'movil-2-recorrido.png'});

  // tocar un sistema del muelle a media narración
  const antes=await p.evaluate(()=>({cola:cola.length,pres:PRESENTANDO}));
  await p.evaluate(()=>{const f=document.querySelector('#sistemas .fila');f&&f.click();});
  await p.waitForTimeout(1200);
  d=await p.evaluate(()=>({cola:cola.length,pres:PRESENTANDO,
    sio:getComputedStyle(document.querySelector('#siono')).display,
    oido:document.querySelector('#oido').textContent,
    det:document.querySelector('#det').classList.contains('abre')}));
  const sigue=d.pres&&d.cola>0&&d.cola<=antes.cola;
  console.log('   tocar un sistema NO reinicia: '+(sigue?'✓ sigue con '+d.cola+' frases':'✕ cola '+antes.cola+'→'+d.cola));
  console.log('   no salta el sí/no: '+(d.sio==='none'?'✓':'✕'));
  console.log('   no tapa con el panel: '+(!d.det?'✓':'✕'));
  console.log('   avisa: "'+d.oido.slice(0,44)+'"');
  if(!sigue||d.sio!=='none'||d.det)mal++;

  // saltar de capítulo
  await p.click('#capAdelante');
  await p.waitForTimeout(1400);
  const c2=await p.evaluate(()=>({cap:document.querySelector('#capNom').textContent,
    pres:PRESENTANDO,hab:hablando}));
  await p.click('#capAtras');
  await p.waitForTimeout(1400);
  const c3=await p.evaluate(()=>document.querySelector('#capNom').textContent);
  console.log('   adelante → "'+c2.cap+'" '+(c2.pres&&c2.hab?'✓':'✕'));
  console.log('   atrás    → "'+c3+'" '+(c3?'✓':'✕'));
  if(!c2.pres||!c2.hab)mal++;

  // parar y continuar
  await p.click('#btnPresenta');
  await p.waitForTimeout(600);
  d=await p.evaluate(()=>({et:document.querySelector('#lblPresenta').textContent,
    pend:!!(colaGuardada&&colaGuardada.length)}));
  console.log('   al parar guarda: '+(d.pend?'✓':'✕')+' · botón "'+d.et+'"');
  if(!d.pend)mal++;
  await p.screenshot({path:SAL+'movil-3-parado.png'});
  await p.click('#btnPresenta');
  await p.waitForTimeout(900);
  d=await p.evaluate(()=>({pres:PRESENTANDO,vacio:!(colaGuardada&&colaGuardada.length)}));
  console.log('   continúa: '+(d.pres&&d.vacio?'✓':'✕'));
  if(!d.pres||!d.vacio)mal++;

  // ── la voz: que respire y que no grite "interrupted"
  console.log('\n══ LA VOZ');
  d=await p.evaluate(()=>{
    window.__d=[];
    parar(); PRESENTANDO=false;
    decir([{q:'FLUX',x:'Buenas noches. Así es como sueno: tranquilo, con aire entre las frases, y sin atropellar los números.'}]);
    return null;
  });
  // se espera a que la cadena de trozos SE ASIENTE, no a un reloj: con un
  // reloj fijo el test mide a media frase y acusa de un fallo que no hay.
  // OJO con el plateau: en el emulador cada trozo tarda ~700 ms porque el
  // lienzo se come el hilo. Con ventanas de 300 ms el test veia una meseta
  // que no existia y acusaba de un fallo que no habia. Dos lecturas iguales
  // separadas 900 ms.
  let prev=-1, quieto=0;
  for(let k=0;k<30;k++){
    await p.waitForTimeout(900);
    const n=await p.evaluate(()=>window.__d.length);
    quieto=(n===prev&&n>0)?quieto+1:0; prev=n;
    if(quieto>=2)break;
  }
  d=await p.evaluate(()=>({d:window.__d.slice(),oido:document.querySelector('#oido').textContent}));
  console.log('   trozos de la frase: '+d.d.length+' '+(d.d.length>=4?'✓ respira':'✕ de un tirón'));
  d.d.slice(0,4).forEach(x=>console.log('     · tono '+x.p.toFixed(3)+'  «'+x.t.slice(0,40)+'»'));
  const baja=d.d.length>1&&d.d[0].p>d.d[d.d.length-1].p;
  console.log('   el tono baja al final: '+(baja?'✓':'✕'));
  if(d.d.length<4)mal++;
  if(!baja)mal++;

  // modo DIRECTA
  await p.evaluate(()=>{RESPIRA=false;window.__d=[];parar();
    decir([{q:'FLUX',x:'Buenas noches. Así es como sueno: tranquilo, con aire, y sin prisa.'}]);});
  await p.waitForTimeout(1400);
  d=await p.evaluate(()=>window.__d.length);
  console.log('   modo DIRECTA: '+d+' trozo(s) '+(d===1?'✓':'✕'));
  if(d!==1)mal++;

  // interrumpir no debe pintar un error
  await p.evaluate(()=>{RESPIRA=true;parar();
    decir([{q:'FLUX',x:'Una frase larga, con varias comas, que voy a cortar a la mitad.'}]);
    setTimeout(()=>decir([{q:'FLUX',x:'Otra cosa.'}]),120);});
  await p.waitForTimeout(1600);
  const oido=await p.evaluate(()=>document.querySelector('#oido').textContent);
  console.log('   al interrumpir NO dice "interrupted": '+(/interrupt|Fallo/i.test(oido)?'✕ "'+oido+'"':'✓'));
  if(/interrupt|Fallo/i.test(oido))mal++;

  // ── el segundo acto, en capturas
  console.log('\n══ SEGUNDO ACTO (capturas)');
  // Se recorre POR CAPITULOS en vez de esperar: es lo que hace un humano con
  // la barra, y ademas no depende de lo lento que vaya el emulador.
  await p.evaluate(()=>{parar();PRESENTANDO=true;segundoActo();});
  await p.waitForTimeout(1800);
  for(const [k,nom] of [[0,'acto-1-capa1'],[1,'acto-2-origen'],[2,'acto-3-latam']]){
    if(k)await p.evaluate(j=>irACapitulo(j),k);
    await p.waitForTimeout(k?3500:0);
    await p.screenshot({path:SAL+'movil-'+nom+'.png'});
    const st=await p.evaluate(()=>({sub:document.querySelector('#sub').textContent.slice(0,58),
      motas:MOTAS.length,cif:(document.querySelector('#cifras .oro .n')||{}).textContent||'—',
      cap:document.querySelector('#capNom').textContent}));
    console.log('   ['+nom+'] cap='+st.cap+' motas='+st.motas+' cifra="'+st.cif+'"');
    console.log('        «'+st.sub.replace(/\s+/g,' ')+'»');
  }

  // ── y en un portátil, que no se rompió nada
  const ctx2=await b.newContext({viewport:{width:1440,height:900}});
  const q=await ctx2.newPage();
  q.on('pageerror',e=>err.push('escritorio: '+e.message));
  await q.addInitScript(VOZ);
  await q.goto('file://'+RUTA,{waitUntil:'domcontentloaded'});
  await q.waitForTimeout(1100);
  await q.click('#puerta [data-idi="es"]');
  await q.waitForTimeout(700);
  await q.click('#btnPresenta');
  await q.waitForTimeout(3000);
  await q.screenshot({path:SAL+'escritorio-recorrido.png'});
  const e2=await q.evaluate(()=>({ruta:getComputedStyle(document.querySelector('#ruta')).display,
    izq:getComputedStyle(document.querySelector('#izq')).display,
    ancho:document.documentElement.scrollWidth<=innerWidth}));
  console.log('\n══ ESCRITORIO 1440');
  console.log('   barra del recorrido: '+(e2.ruta!=='none'?'✓':'✕')+
              ' · cabecera: '+(e2.izq!=='none'?'✓':'✕')+
              ' · sin scroll lateral: '+(e2.ancho?'✓':'✕'));
  if(e2.ruta==='none'||e2.izq==='none'||!e2.ancho)mal++;

  console.log('\nfallos: '+mal);
  console.log('errores de página: '+(err.length?err.join(' | ').slice(0,300):'ninguno'));
  if(err.length)process.exitCode=1;
  await b.close();
})().catch(e=>{console.log('FALLO DEL TEST:',e.message);process.exitCode=1;});
