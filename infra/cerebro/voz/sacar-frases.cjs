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
const fs=require('fs');
const FICHERO='/home/user/express-js-on-vercel/infra/cerebro/index.html';
const RUTA='file://'+FICHERO;

/* ── LAS FRASES SUELTAS DEL PROPIO FICHERO ────────────────────────────────
   Las listas de arriba cubren los guiones, pero el cerebro dice muchas mas
   cosas: «En pausa. Di continua.», «Lanzando los bots de prueba.», la ayuda,
   los avisos... Un barrido con el manifiesto en la mano encontro CIENTO UNA
   frases fijas que nadie grababa y que por tanto sonaban con la voz del
   navegador --el corte que se oye y que se describio como «se vuelve
   robotico»--.
   Copiarlas a mano aqui seria empezar otra lista que se queda vieja. Se sacan
   del propio fichero: cualquier frase nueva que alguien escriba manana entra
   sola. Si alguna no llega a decirse nunca, lo unico que cuesta es un mp3. */
function literalesDelFichero(){
  const html=fs.readFileSync(FICHERO,'utf8');
  const re=/'((?:[^'\\\n]|\\.){22,300}?)'/g, es=[], en=[]; let m;
  const vistos=new Set();
  const ES=new Set('que de la el los las con para una uno del por se no es y en su sus lo al eso esto esta este como mas muy hay son buenas buenos noches dias tardes placer un'.split(' '));
  const EN=new Set('the and of is to in for with that are it on at an you we they this these those what how not have has can will'.split(' '));
  while((m=re.exec(html))){
    const t=m[1].replace(/\\'/g,"'").replace(/\\\\/g,'\\');
    if(!/[.?!]$/.test(t)||!/ /.test(t))continue;   // una frase acaba en punto
    if(/[<>{}=]|https?:|function|px|rgba?\(/.test(t))continue;
    /* Tiene que EMPEZAR como empieza una frase. «? Or shall I carry on?» es
       la cola de un texto que se arma con el nombre en medio; grabar ese
       trozo suelto no sirve, y el «?» solo no produce ni un sonido: Piper
       devuelve un wav vacio y la grabacion entera se caia ahi. */
    if(!/^[A-ZÁÉÍÓÚÑ¿¡«"']/.test(t))continue;
    if(vistos.has(t))continue; vistos.add(t);
    let pe=(t.match(/[áéíóúñ¿¡]/gi)||[]).length, pi=0;
    for(const w of t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
                  .split(/[^a-z]+/)){ if(ES.has(w))pe++; if(EN.has(w))pi++; }
    /* En la duda va a los dos: grabar de mas no rompe nada, no grabar si. */
    if(pe>=pi)es.push(t);
    if(pi>=pe)en.push(t);
  }
  return {es,en};
}

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
  /* Se carga COMO INVITADO SIN NOMBRE --?demo=1-- a proposito. Asi `VOC()`
     devuelve vacio y lo que se graba es la version NEUTRA de cada frase:
     «Bienvenido a Orden Global.» y no «..., Jose.». Al reproducir, la frase
     con nombre no existe en el manifiesto, se busca la neutra y suena
     grabada. Cargandolo de otra forma se grababa «Jose» dentro y todas las
     frases con nombre caian a la voz del navegador --que fue exactamente la
     queja: «cuando me saluda y al final me sale robotico»--. */
  await p.goto(RUTA+'?demo=1',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{document.querySelector('#puerta').classList.remove('abre');
                        desbloqueada=true;});

  const salida=[];
  const LIT=literalesDelFichero();
  for(const idi of ['es','en']){
    await p.evaluate(x=>{const s=document.querySelector('#idioma');
      s.value=x; s.dispatchEvent(new Event('change'));},idi);
    await p.evaluate(L=>{window.__LIT=L;},LIT[idi]);
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
      /* TODO lo fijo que puede decir fuera de un guion --la transaccion, el
         viaje del dolar, abrir los sitios, las respuestas cortas--. Vive en
         una sola lista dentro del cerebro justo para que esto no se olvide:
         cuando se olvido, la voz se callaba en mitad de la transaccion. */
      FRASES_FIJAS().forEach((x,i)=>mete('fija:'+i,x));
      /* Los tres saludos del dia, sin nombre. Sin esto, el saludo --lo
         PRIMERO que se oye-- salia siempre con la voz del navegador. */
      (IDI==='en'?['Good morning.','Good afternoon.','Good evening.']
                 :['Buenos días.','Buenas tardes.','Buenas noches.'])
        .forEach((x,i)=>mete('suelta:saludo'+i,x));
      mete('suelta:control', IDI==='en'
        ? 'Anything you want to ask me so far? Or shall I carry on?'
        : '¿Hasta aquí alguna pregunta? ¿O sigo?');
      mete('suelta:vuelve', IDI==='en'?'Back to where we were.':'Volvemos a donde íbamos.');
      mete('suelta:asi', IDI==='en'?'This is how I would answer it.':'Así la contestaría yo.');
      mete('suelta:inv', IDI==='en'?'An investor asks you this.':'Un inversionista te pregunta esto.');
      /* Y todo lo suelto que vive escrito en el propio fichero. */
      (window.__LIT||[]).forEach((x,i)=>mete('literal:'+i,x));
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
