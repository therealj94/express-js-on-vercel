/* Las preguntas del inversionista.
   Dos cosas que comprobar, y la segunda importa mas que la primera:
   1. que las preguntas conocidas caigan en SU respuesta;
   2. que NINGUNA pregunta se quede sin respuesta --ni las raras--, y que
      cuando no hay dato NO se invente uno.
   La tercera, la que de verdad me quita el sueno: que las respuestas de las
   cosas ABIERTAS sigan diciendo que estan abiertas. Si alguien "mejora" el
   texto del oro y le quita el matiz, esto tiene que ponerse rojo. */
const {chromium}=require('playwright');
const RUTA='file:///home/user/express-js-on-vercel/infra/cerebro/index.html';

// preguntas tal y como las diria una persona, no como estan escritas dentro
const ES=[
 ['quees','oye y esto de orden global que es exactamente'],
 ['gana','y ustedes como ganan dinero con esto'],
 ['traccion','cuantos usuarios tienen de verdad'],
 ['competencia','por que no lo montan sobre polygon y ya'],
 ['mercado','a quien le venden esto'],
 ['token','que es el origen y cuanta emision hay'],
 ['oro','esto esta respaldado en oro'],
 ['mina','tienen minas de verdad, que es indexsa'],
 ['onzas','cuantas onzas de oro tienen'],
 ['onzas','esas onzas son reservas certificadas'],
 ['auka','que son auka y agka'],
 ['oro','donde esta el oro guardado'],
 ['precio','quien pone el precio del origen'],
 ['liquidez','si entro como salgo, hay liquidez'],
 ['tesoroQuien','quien controla el tesoro'],
 ['tech','como funciona la cadena, que consenso usan'],
 ['escala','cuantas transacciones por segundo aguanta'],
 ['caida','que pasa si se les cae un nodo'],
 ['auditoria','quien audito el codigo'],
 ['seguridad','como protegen el dinero de la gente'],
 ['legal','esto es legal, que licencias tienen'],
 ['kyc','como hacen el kyc de los usuarios'],
 ['riesgos','que riesgos tiene esto'],
 ['equipo','quien esta detras del proyecto'],
 ['coste','cuanto les cuesta operar esto'],
 ['ronda','cuanto buscan levantar y para que'],
 ['porQueCreer','por que deberia creerte'],
];
const EN=[
 ['quees','so what is orden global exactly'],
 ['gana','how do you make money'],
 ['traccion','how many users do you have'],
 ['oro','is this backed by gold'],
 ['mina','do you actually own mines'],
 ['onzas','how many ounces of gold do you have'],
 ['token','what is origen and what is the total supply'],
 ['riesgos','what could go wrong here'],
 ['ronda','how much are you raising'],
 ['legal','is this legal, do you have a licence'],
 ['porQueCreer','why should i believe you'],
];
// preguntas para las que NO hay entrada: nunca puede quedarse sin contestar
const RARAS=[
 'cuantos empleados tienen en colombia',
 'tienen oficinas fisicas',
 'que pasa con los impuestos',
 'han pensado en hacer un airdrop',
 'cual es el churn mensual',
 'quien es su banco',
 'do you have a cap table',
 'what is your cac',
];
// lo que NO puede desaparecer de las respuestas de las cosas abiertas
const MATICES=[
 ['oro',        /no est(a|á) cerrad|NOT settled|no voy a decirte|not going to tell you/i,
                'el oro tiene que seguir diciendo que la figura juridica esta abierta'],
 ['gana',       /no est(a|á) configurada|not configured|cobra cero|charges zero/i,
                'la comision tiene que seguir diciendo que cobra cero'],
 ['auditoria',  /no hay una auditor|no published external/i,
                'la auditoria tiene que seguir diciendo que no hay externa'],
 ['ronda',      /decisi(o|ó)n de la Junta|Board decision|nada firmado|nothing signed/i,
                'la ronda tiene que seguir siendo cosa de la Junta'],
 ['liquidez',   /no hay mercado secundario|no secondary market/i,
                'la liquidez tiene que seguir diciendo que no hay secundario'],
 ['escala',     /no tenemos una prueba de carga|do not have a published load test/i,
                'la escala no puede inventarse un TPS'],
 /* La mineria es donde una cifra grande hace mas dano: dos millones y medio
    de onzas dichas con voz de asistente suenan a hecho probado. El matiz no
    es un adorno del texto, es lo que separa una tesis de un fraude. */
 ['onzas',      /no son reservas certificadas|NOT certified reserves/i,
                'las onzas tienen que seguir diciendo que no son reserva certificada'],
 ['onzas',      /indicado e inferido|indicated and inferred/i,
                'las onzas tienen que decir en que categoria estan'],
 ['onzas',      /dato aportado|supplied figure/i,
                'Travesia tiene que seguir diciendo que no tiene informe propio'],
 ['mina',       /documento|paperwork|se ensen|get shown/i,
                'la mina tiene que seguir diciendo que los titulos son papeles que se ensenan'],
 ['auka',       /no los veo desplegados|do not see them deployed|dise(n|ñ)ados, no emitidos|designed, not issued/i,
                'AUKA y AGKA tienen que seguir diciendo que no estan emitidos'],
];
// numeros que NO existen: si aparecen es que alguien se los invento
const INVENTOS=/(facturaci[oó]n de|revenue of|valoraci[oó]n de \d|valued at|licencia n[uú]mero|licence number|auditad[oa] por [A-Z])/;

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const p=await b.newPage();
  const err=[]; p.on('pageerror',e=>err.push(e.message));
  await p.addInitScript(()=>{
    const V=[{name:'Google español',lang:'es-ES'}];
    const s=window.speechSynthesis; window.__d=[];
    s.getVoices=()=>V;
    s.speak=u=>{const sb=document.querySelector('#sub');
      window.__d.push(sb?sb.textContent:u.text);
      setTimeout(()=>{u.onstart&&u.onstart();setTimeout(()=>u.onend&&u.onend(),6);},4);};
    s.cancel=()=>{};
    ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
  });
  await p.goto(RUTA,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1400);
  await p.click('#puerta [data-idi="es"]').catch(()=>{});
  await p.waitForTimeout(500);
  await p.evaluate(()=>{desbloqueada=true;});
  let mal=0;

  const idioma=async m=>{await p.evaluate(x=>{const s=document.querySelector('#idioma');
    s.value=x;s.dispatchEvent(new Event('change'));},m);await p.waitForTimeout(300);};

  /* Se lee el TEMA, no el audio: el tema dice en que entrada cayo, que es lo
     que se quiere comprobar. Y se espera a que la cola se asiente. */
  const preguntar=async f=>{
    await p.evaluate(()=>{parar();window.__d=[];ultimoTema=null;});
    await p.waitForTimeout(50);
    await p.evaluate(x=>atender(x),f);
    /* La ventana tiene que ser MAYOR que la pausa mas larga entre trozos
       (300 ms), o el test ve una meseta que no existe y cree que solo dijo
       la primera linea. */
    let prev=-1,quieto=0;
    for(let k=0;k<20;k++){
      await p.waitForTimeout(420);
      const n=await p.evaluate(()=>window.__d.length);
      quieto=(n===prev&&n>0)?quieto+1:0; prev=n;
      if(quieto>=2)break;
    }
    return p.evaluate(()=>({tema:ultimoTema,
      dicho:[...new Set(window.__d)].join(' ').replace(/FLUX/g,' ')}));
  };

  for(const [modo,lista] of [['ES',ES],['EN',EN]]){
    await idioma(modo.toLowerCase());
    console.log('\n───── '+modo+' · preguntas conocidas');
    for(const [id,f] of lista){
      const r=await preguntar(f);
      const ok=r.tema==='inv:'+id;
      const vacio=!r.dicho.trim();
      console.log('  '+(ok?'✓':'✕')+' "'+f.slice(0,44)+'" → '+(r.tema||'NADA'));
      if(!ok){console.log('      esperaba inv:'+id+' · dijo: '+r.dicho.slice(0,80)); mal++;}
      if(vacio){console.log('      SILENCIO'); mal++;}
      if(INVENTOS.test(r.dicho)){console.log('      ⚠ SE INVENTO UN DATO: '+r.dicho.slice(0,90)); mal++;}
    }
  }

  await idioma('es');
  console.log('\n───── NUNCA UN CALLEJON SIN SALIDA');
  for(const f of RARAS){
    const r=await preguntar(f);
    const contesta=r.dicho.trim().length>40;
    const noSe=/no me lo han ense|not something I have been taught/i.test(r.dicho);
    console.log('  '+(contesta&&!noSe?'✓':'✕')+' "'+f.slice(0,40)+'" → '+r.dicho.slice(0,64).replace(/\s+/g,' '));
    if(!contesta||noSe){console.log('      se quedo sin contestar'); mal++;}
    if(INVENTOS.test(r.dicho)){console.log('      ⚠ SE INVENTO UN DATO'); mal++;}
  }

  console.log('\n───── LOS MATICES QUE NO SE PUEDEN PERDER');
  for(const [id,re,por] of MATICES){
    const t=await p.evaluate(x=>{const q=INVERSOR.find(y=>y.id===x);
      return q?q.es.join(' ')+' || '+q.en.join(' '):'';},id);
    const ok=re.test(t);
    console.log('  '+(ok?'✓':'✕')+' '+por);
    if(!ok)mal++;
  }

  console.log('\n───── EL ENSAYO');
  const e1=await preguntar('ensayo');
  const hayPreg=/pregunta esto|asks you this/i.test(e1.dicho);
  const e2=await p.evaluate(()=>enEnsayo);
  console.log('  suelta una pregunta: '+(hayPreg&&e2?'✓ '+e2:'✕ '+e1.dicho.slice(0,60)));
  if(!hayPreg||!e2)mal++;
  const e3=await preguntar('contesta');
  const daRespuesta=/contestar(i|í)a yo|how I would answer/i.test(e3.dicho);
  console.log('  y luego la respuesta: '+(daRespuesta?'✓':'✕ '+e3.dicho.slice(0,60)));
  if(!daRespuesta)mal++;
  // la baraja no repite
  await p.evaluate(()=>{barajaEnsayo=[];enEnsayo=null;});
  const vistas=new Set();
  for(let i=0;i<8;i++){await preguntar('ensayo');
    vistas.add(await p.evaluate(()=>enEnsayo));
    await p.evaluate(()=>{enEnsayo=null;});}
  console.log('  no repite: '+(vistas.size===8?'✓ 8 distintas':'✕ solo '+vistas.size));
  if(vistas.size!==8)mal++;

  console.log('\n───── LA LISTA');
  const L=await preguntar('que preguntas me pueden hacer');
  const abrio=await p.evaluate(()=>document.querySelector('#det').classList.contains('abre'));
  const n=await p.evaluate(()=>document.querySelectorAll('#detCuerpo li,#detCuerpo .li').length);
  console.log('  abre el panel: '+(abrio?'✓':'✕')+' con '+n+' preguntas');
  if(!abrio||n<20)mal++;

  console.log('\nfallos: '+mal);
  console.log('errores de página: '+(err.length?err.join(' | ').slice(0,300):'ninguno'));
  if(err.length)mal++;
  await b.close();
  process.exitCode=mal?1:0;
})().catch(e=>{console.log('FALLO DEL TEST:',e.message);process.exitCode=1;});
