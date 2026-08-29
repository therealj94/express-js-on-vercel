/* Que NINGUNA frase de la presentacion caiga a la voz del navegador.
 *
 * Existe por la queja del 14-ago: «cuando me saluda y al final me sale
 * robotico». La causa: el extractor cargaba el cerebro como usuario interno,
 * asi que `VOC()` devolvia «, Jose» y lo que se grababa era
 * «Bienvenido a Orden Global, Jose.». Al reproducir con otro nombre --o con
 * ninguno-- esa frase no existia en el manifiesto y caia a la voz del
 * sistema, que ademas elegia castellano de Espana. El corte se oia a un
 * kilometro justo en el saludo y en el cierre, que son los dos momentos que
 * mas se recuerdan.
 *
 * Aqui se recorre TODO lo que dice --el guion, el segundo acto, las
 * respuestas al inversionista, el saber, el saludo y las frases sueltas-- y
 * se comprueba frase por frase que hay audio para ella. No se reproduce
 * nada: solo se pregunta si existe.
 *
 * Se prueba con nombre Y sin nombre, porque son dos caminos distintos.
 */
const {chromium}=require('playwright');
const fs=require('fs');
const RUTA='file:///home/user/express-js-on-vercel/infra/cerebro/index.html';
/* EL MANIFIESTO NO LLEVA LA RUTA ESCRITA.
   Aca habia una ruta absoluta con el identificador de UNA sesion de trabajo
   dentro: fuera de esa sesion no existe, y esta prueba fallaba siempre en
   cualquier otra maquina. Se pasa por argumento, por AURA_MANIFIESTO, o se
   busca donde suele quedar. */
const MAN = process.argv[2] || process.env.AURA_MANIFIESTO ||
  (function () {
    const raiz = '/tmp';
    for (const d of (fs.existsSync(raiz) ? fs.readdirSync(raiz) : [])) {
      if (!d.startsWith('claude-')) continue;
      const pila = [require('path').join(raiz, d)];
      while (pila.length) {
        const aqui = pila.pop();
        let hijos = [];
        try { hijos = fs.readdirSync(aqui, { withFileTypes: true }); } catch { continue }
        for (const h of hijos) {
          const r = require('path').join(aqui, h.name);
          if (h.isDirectory()) { if (pila.length < 200) pila.push(r) }
          else if (r.endsWith('/audio/manifiesto.json')) return r;
        }
      }
    }
    return '';
  })();

(async()=>{
  if(!MAN || !fs.existsSync(MAN)){
    console.log('no hay manifiesto de audio. Grabalo con rendir.py, o pasa la ruta:');
    console.log('  node pruebas/probar-nada-robotico.cjs <manifiesto.json>');
    console.log('  o AURA_MANIFIESTO=<ruta> node pruebas/probar-nada-robotico.cjs');
    process.exitCode=1; return;
  }
  const manifiesto=fs.readFileSync(MAN);
  const b=await chromium.launch({
    executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox']});
  let mal=0;

  for(const [idi,nombre] of [['es','Carlos'],['es',''],['en','Sarah']]){
    const p=await(await b.newContext()).newPage();
    const err=[]; p.on('pageerror',e=>err.push(e.message));
    await p.route('**/*',r=>{
      const u=r.request().url();
      if(u.includes('/voz/manifiesto.json'))
        return r.fulfill({status:200,contentType:'application/json',body:manifiesto});
      if(u.startsWith('file:'))return r.continue();
      return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    });
    await p.addInitScript(()=>{
      const s=window.speechSynthesis;
      s.getVoices=()=>[{name:'Paulina',lang:'es-MX'}];
      s.speak=()=>{}; s.cancel=()=>{};
      ['speaking','pending','paused'].forEach(k=>Object.defineProperty(s,k,{get:()=>false}));
    });
    await p.goto(RUTA+'?demo=1',{waitUntil:'domcontentloaded'});
    await p.waitForTimeout(1600);
    await p.evaluate(x=>{const s=document.querySelector('#idioma');
      s.value=x; s.dispatchEvent(new Event('change'));},idi);
    await p.waitForTimeout(500);

    const r=await p.evaluate(n=>{
      VISITA=n; parar();
      const faltan=[], sinPronunciar=[];
      /* Nombres en ingles y siglas que una voz mexicana lee mal. Si alguno
         sigue crudo en lo que se PRONUNCIA, es que la tabla no lo cubre. */
      const CRUDO=/(MyTokenPay|Veta Wallet|\bKYC\b|\bKYB\b|\bAML\b|\bSSO\b|\bQBFT\b|\bEVM\b|\bUSDT\b)/;
      const mira=(origen,x)=>{
        const c=conVoz(x);
        if(!c.url)faltan.push(origen+' | '+String(c.decir).slice(0,70));
        if(IDI==='es'&&CRUDO.test(c.decir))
          sinPronunciar.push(origen+' | '+String(c.decir).slice(0,70));
      };
      guionPresentacion().forEach(l=>l.x&&mira('recorrido',l.x));
      const dec=window.decir, cap=[];
      window.decir=L=>{(L||[]).forEach(l=>l&&l.x&&cap.push(l.x));};
      try{ segundoActo(); }finally{ window.decir=dec; }
      cap.forEach(x=>mira('acto2',x));
      INVERSOR.forEach(q=>q[IDI].forEach(x=>mira('inv:'+q.id,x)));
      for(const k in SABER)SABER[k][IDI].forEach(x=>mira('saber:'+k,x));
      const P=PREGUNTAS[IDI]; for(const k in P)mira('pregunta',P[k]);
      mira('saludo',saludo());
      mira('probar',FRASE_PRUEBA());
      mira('control', IDI==='en'
        ? 'Anything you want to ask me so far'+VOC()+'? Or shall I carry on?'
        : '¿Hasta aquí alguna pregunta'+VOC()+'? ¿O sigo?');
      mira('vuelve', IDI==='en'?'Back to where we were.':'Volvemos a donde íbamos.');
      /* Y TODO lo fijo de fuera de los guiones. Aqui esta el fallo que se
         escapo dos veces: la transaccion se queda muda porque sus frases no
         estaban en ningun guion y nadie las grababa. */
      FRASES_FIJAS().forEach((x,i)=>mira('fija:'+i,x));
      return {faltan,sinPronunciar,
        man:MANIFIESTO?Object.keys(MANIFIESTO).length:0};
    },nombre);

    const quien=idi+(nombre?' · «'+nombre+'»':' · sin nombre');
    console.log('\n══ '+quien+'  ('+r.man+' frases grabadas)');
    console.log('   sin audio: '+(r.faltan.length?'✕ '+r.faltan.length:'✓ ninguna'));
    r.faltan.slice(0,8).forEach(x=>console.log('     · '+x));
    if(r.faltan.length)mal++;
    if(idi==='es'){
      console.log('   nombres en inglés sin pronunciar: '+
        (r.sinPronunciar.length?'✕ '+r.sinPronunciar.length:'✓ ninguno'));
      r.sinPronunciar.slice(0,5).forEach(x=>console.log('     · '+x));
      if(r.sinPronunciar.length)mal++;
    }
    if(err.length){console.log('   errores: '+err.join(' | ').slice(0,180));mal++;}
    await p.close();
  }

  console.log('\nfallos: '+mal);
  await b.close();
  process.exitCode=mal?1:0;
})().catch(e=>{console.log('FALLO DEL TEST:',e.message);process.exitCode=1;});
