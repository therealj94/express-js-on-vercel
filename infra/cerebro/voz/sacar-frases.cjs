/* Saca del cerebro TODAS las frases fijas que se pueden grabar de antemano.
 *
 * Por que con un navegador y no leyendo el HTML: las frases no estan en una
 * lista, se construyen --el guion mete el bloque del dia, `limpiar()` cambia
 * «gwei» por «gigawei» y quita los simbolos--. Si aqui las copiara a mano,
 * el dia que alguien toque una linea el audio dejaria de corresponder al
 * texto y NADIE se enteraria hasta oirlo delante de un inversionista.
 * Asi que se cargan y se preguntan al propio cerebro, con sus funciones.
 *
 *   node infra/cerebro/voz/sacar-frases.cjs  >  frases.json
 */
const {chromium}=require('playwright');
const RUTA='file:///home/user/express-js-on-vercel/infra/cerebro/index.html';

(async()=>{
  const b=await chromium.launch({
    executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox']});
  const p=await b.newPage();
  await p.addInitScript(()=>{
    /* Que no hable de verdad mientras se le saca el guion. */
    const s=window.speechSynthesis;
    s.getVoices=()=>[]; s.speak=()=>{}; s.cancel=()=>{};
    ['speaking','pending','paused'].forEach(k=>
      Object.defineProperty(s,k,{get:()=>false}));
  });
  await p.goto(RUTA,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{document.querySelector('#puerta').classList.remove('abre');
                        desbloqueada=true;});

  const salida=[];
  for(const idi of ['es','en']){
    await p.evaluate(x=>{const s=document.querySelector('#idioma');
      s.value=x; s.dispatchEvent(new Event('change'));},idi);
    await p.waitForTimeout(400);
    const frases=await p.evaluate(()=>{
      const out=[];
      const mete=(origen,x)=>{
        const t=limpiar(x);
        if(t&&t.length>1)out.push({origen,texto:t,trozos:trozos(t)});
      };
      guionPresentacion().forEach(l=>mete('recorrido',l.x));
      /* El segundo acto no devuelve el guion, lo dice: se le deja decirlo con
         `decir` interceptado y se recogen las lineas por el camino. */
      const dec=window.decir; const cap=[];
      window.decir=(L)=>{ (L||[]).forEach(l=>l&&l.x&&cap.push(l.x)); };
      try{ segundoActo(); }finally{ window.decir=dec; }
      cap.forEach(x=>mete('acto2',x));
      INVERSOR.forEach(q=>q[IDI].forEach(x=>mete('inversor:'+q.id,x)));
      for(const k in SABER)SABER[k][IDI].forEach(x=>mete('saber:'+k,x));
      const P=PREGUNTAS[IDI]; for(const k in P)mete('pregunta:'+k,P[k]);
      /* Las frases sueltas que tambien tienen que sonar bien: la de probar
         la voz --si esa sale robotica, el boton que existe para juzgar la
         voz la juzga mal-- y las que dice al pararse a preguntar. */
      mete('suelta:probar',FRASE_PRUEBA());
      mete('suelta:control', IDI==='en'
        ? 'Anything you want to ask me so far? Or shall I carry on?'
        : '¿Hasta aquí alguna pregunta? ¿O sigo?');
      mete('suelta:vuelve', IDI==='en'?'Back to where we were.':'Volvemos a donde íbamos.');
      mete('suelta:asi', IDI==='en'?'This is how I would answer it.':'Así la contestaría yo.');
      mete('suelta:inv', IDI==='en'?'An investor asks you this.':'Un inversionista te pregunta esto.');
      return out;
    });
    /* Duplicados fuera: la misma frase no se graba dos veces. */
    const vistas=new Set();
    for(const f of frases){
      if(vistas.has(f.texto))continue;
      vistas.add(f.texto);
      salida.push(Object.assign({idioma:idi},f));
    }
  }
  await b.close();
  process.stdout.write(JSON.stringify(salida,null,1));
})().catch(e=>{console.error('FALLO:',e.message);process.exit(1);});
