// Le habla al cerebro como le hablaría José y comprueba TRES cosas por cada
// frase: que conteste, en qué IDIOMA contesta, y con qué voz lo dice. El fallo
// que se persigue es el de la queja: preguntar "cost" en inglés y que conteste
// en castellano con voz inglesa, que suena a robot.
const {chromium} = require('playwright');
const RUTA = '/home/user/express-js-on-vercel/infra/cerebro/index.html';

const PRUEBAS_EN = ['hello', 'how are you', 'what can you do', 'what is the cost',
  'tell me more', 'how are the chains', 'security', 'the team', 'what needs me',
  'chainlist', 'the bots', 'what is failing', 'the wallet', 'thank you'];
const PRUEBAS_ES = ['hola', '¿cómo estás?', 'cuánto cuesta', 'cuéntame más',
  'cómo van las cadenas', 'seguridad', 'el equipo', 'qué me falta', 'gracias'];

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']});
  const p = await (await b.newContext()).newPage();
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));

  await p.addInitScript(() => {
    window.__d = [];
    const V = [
      {name:'Daniel', lang:'en-GB'}, {name:'Samantha', lang:'en-US'},
      {name:'Mónica', lang:'es-ES'}, {name:'Paulina', lang:'es-MX'}];
    const s = window.speechSynthesis;
    s.getVoices = () => V;
    s.speak = u => { const sb=document.querySelector('#sub');
      /* la frase entera vive en el subtitulo; el trozo solo es un pedazo */
      window.__d.push({txt:u.text, linea:sb?sb.textContent:'', lang:u.lang, voz:u.voice&&u.voice.name});
      setTimeout(() => { u.onstart&&u.onstart(); u.onend&&u.onend(); }, 5); };
    s.cancel = () => {};
    Object.defineProperty(s,'speaking',{get:()=>false});
    Object.defineProperty(s,'pending',{get:()=>false});
    Object.defineProperty(s,'paused',{get:()=>false});
    window.fetch = async u => {
      const url=String(u), J=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
      if(url.includes('informe.json'))return J({fecha:'13 aug',versionBackend:'79',precio:'2.55',
        comision:'0.001 ORIGEN',comisionEncendida:false,genesisListo:true,
        hechoHoy:['Algo hecho hoy'],pendiente:['Algo pendiente']});
      if(url.includes('partes.json'))return J([
        {agente:'contador',nombre:'CONTADOR',veredicto:'aviso',cuando:new Date().toISOString(),
         resumen:'El gasto de julio fue de quinientos veintitres dolares y agosto sube',
         hallazgos:['Las seis maquinas viejas siguen encendidas'],escala:['Poner fecha a la retirada']},
        {agente:'cerrajero',nombre:'CERRAJERO',veredicto:'falla',cuando:new Date().toISOString(),
         resumen:'Dos cuentas con administrador total sin segundo factor',
         hallazgos:['Sin politica de contrasenas'],escala:['Poner segundo factor']},
        {agente:'vigia',nombre:'VIGÍA',veredicto:'bien',cuando:new Date().toISOString(),
         resumen:'Las dos cadenas como deben',hallazgos:['Bloque veinte mil']}]);
      if(url.includes('/ordenes/quien'))return J({usuario:'melany'});
      if(url.includes('/ordenes/hablar')){
        if(window.__conModelo)
          return J({respuesta:'Todo en orden, José. La red de pruebas avanza. El tesoro no se ha movido.'});
        return new Response(JSON.stringify({error:'invalid_request_error',
          detalle:'Your credit balance is too low'}),{status:502,
          headers:{'content-type':'application/json'}});
      }
      if(url.includes('/ordenes/bots'))return J({cuando:new Date().toISOString(),estado:'bien',
        bloque:22541,segundos:12.1,enviosQueQuedan:55});
      if(url.includes('/rpc-vieja'))return J({jsonrpc:'2.0',id:1,result:'0x1'});
      if(url.includes('/rpc'))return J({jsonrpc:'2.0',id:1,result:'0x159e'});
      if(url.includes('totalBlock'))return J({blockTotal:22500});
      if(url.includes('api.github.com'))return J({state:'open',merged:false});
      return new Response('ok');
    };
  });

  await p.goto('file://' + RUTA, {waitUntil:'domcontentloaded', timeout:30000});
  await p.waitForTimeout(1500);
  await p.evaluate(() => { desbloqueada = true; });

  /* Desde que la voz RESPIRA, una frase sale en varios trozos: «Asi se mueve
     el dinero,» / «de punta a punta.» Un reloj fijo de 450 ms mide a mitad de
     frase y acusa de mudo a quien esta hablando. Se espera a que la cadena de
     trozos se asiente y se devuelve TODO lo dicho, no los tres primeros. */
  async function preguntar(frase){
    await p.evaluate(() => { parar(); window.__d = []; });
    await p.waitForTimeout(60);
    await p.evaluate(f => atender(f), frase);
    let prev=-1, quieto=0;
    for(let k=0;k<14;k++){
      await p.waitForTimeout(320);
      const n=await p.evaluate(() => window.__d.length);
      quieto=(n===prev&&n>0)?quieto+1:0; prev=n;
      if(quieto>=2)break;
    }
    return p.evaluate(() => window.__d.slice());
  }
  const idiomaTexto = x0 => { const x=' '+x0.toLowerCase()+' '; return /[ñáéíóú¿¡]/.test(x) ||
    (x.match(/ ?(que|de|la|el|los|con|para|una|del|por|se|no|es|y|en|buenas|buenos|noches|dias|tardes|placer|un) /gi)||[]).length >
    (x.match(/ (the|and|of|is|to|in|for|with|that|are|it|on|at) /gi)||[]).length ? 'es' : 'en'; };

  let mal = 0;
  for (const [modo, lista, esperado] of [['EN', PRUEBAS_EN, 'en'], ['ES', PRUEBAS_ES, 'es']]) {
    await p.evaluate(m => { document.querySelector('#idioma').value = m;
      document.querySelector('#idioma').dispatchEvent(new Event('change')); }, esperado);
    await p.waitForTimeout(350);
    console.log('\n───── ' + modo + ' ─────');
    for (const f of lista) {
      const d = await preguntar(f);
      if (!d.length) { console.log('  ✕ "' + f + '" → SIN RESPUESTA'); mal++; continue; }
      /* Una frase sale en varios trozos: «Operativo,» sola no tiene idioma.
         Se toma la TIRADA inicial de trozos que comparten voz e idioma --que
         es la primera frase entera-- y se clasifica eso. */
      const prim = Object.assign({}, d[0], {txt: d[0].linea || d[0].txt});
      const idi = idiomaTexto(prim.txt);
      // la voz tiene que ir con el idioma DEL TEXTO, no con el del selector
      const vozOk = prim.voz ? new RegExp('^' + idi, 'i').test(
        ({Daniel:'en-GB', Samantha:'en-US', 'Mónica':'es-ES', Paulina:'es-MX'})[prim.voz] || '') : true;
      const jarvisOk = idi === esperado;   // JARVIS contesta en el idioma del selector
      if (!jarvisOk || !vozOk) mal++;
      console.log('  ' + (jarvisOk && vozOk ? '✓' : '✕') + ' "' + f + '" → ' +
        (prim.txt || '').slice(0, 58) + (prim.txt.length > 58 ? '…' : ''));
      if (!jarvisOk) console.log('      contesta en ' + idi + ' y esperaba ' + esperado);
      if (!vozOk) console.log('      voz ' + prim.voz + ' para texto en ' + idi);
    }
  }

  // el caso de la queja: una cita de agente en castellano dentro del modo inglés
  await p.evaluate(() => { document.querySelector('#idioma').value='en';
    document.querySelector('#idioma').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  const d = await preguntar('what is the cost');
  console.log('\n───── EL CASO DE LA QUEJA · "what is the cost" en modo inglés');
  d.forEach(x => console.log('   [' + (x.voz||'sistema') + ' · ' + x.lang + '] ' + x.txt.slice(0,62)));

  // ── con el modelo respondiendo
  await p.evaluate(() => { window.__conModelo = true; hayModelo = null; });
  const conM = await preguntar('cuentame como va todo');
  console.log('\n───── CON MODELO (simulado)');
  conM.forEach(x => console.log('   ' + x.txt.slice(0,70)));
  const hist = await p.evaluate(() => HISTORIAL.length);
  console.log('   historial guardado:', hist, 'turnos');
  if (!conM.length) mal++;

  // ── y sin saldo, que es el caso de hoy: tiene que contestar IGUAL
  await p.evaluate(() => { window.__conModelo = false; hayModelo = null; HISTORIAL = []; });
  const sinM = await preguntar('cuanto cuesta');
  console.log('\n───── SIN SALDO · cae al cerebro de reglas');
  sinM.forEach(x => console.log('   ' + x.txt.slice(0,70)));
  if (!sinM.length) { console.log('   ✕ SE QUEDO SIN CONTESTAR'); mal++; }

  // ── lo nuevo de hoy
  console.log('\n───── LO NUEVO');
  await p.evaluate(() => { document.querySelector('#idioma').value='es';
    document.querySelector('#idioma').dispatchEvent(new Event('change')); HISTORIAL=[]; });
  await p.waitForTimeout(300);
  // saludo por nombre (entro como melany)
  const sal = await preguntar('hola');
  const porNombre = /Melany/.test((sal[0]||{}).txt||'');
  console.log('   saludo: "'+((sal[0]||{}).txt||'').slice(0,44)+'" '+(porNombre?'✓ por nombre':'✕ SIN NOMBRE'));
  if(!porNombre) mal++;
  // conocimiento
  for (const [f,marca] of [['explícame el ecosistema',/ecosistema financiero completo/],
                           ['las máquinas',/Diez máquinas en Amazon/],
                           ['el flujo del dinero',/de punta a punta/],
                           ['los tokens',/un billón/]]){
    const d = await preguntar(f);
    const ok = marca.test(d.map(x=>x.txt).join(' '));   // la marca puede caer en cualquier trozo
    console.log('   "'+f+'" '+(ok?'✓':'✕ NO CONTESTO DEL SABER: '+((d[0]||{}).txt||'').slice(0,50)));
    if(!ok) mal++;
  }
  // velocidad
  await preguntar('más despacio');
  const vel = await p.evaluate(() => VEL);
  console.log('   "más despacio" -> VEL '+vel+' '+(vel<1?'✓':'✕'));
  if(vel>=1) mal++;
  // lo desconocido: honesto, no un error
  const des = await preguntar('cuando llega el cometa halley');
  const hon = /no me lo han enseñado|not something I have been taught/i.test((des[0]||{}).txt||'');
  console.log('   desconocido -> '+(hon?'✓ honesto':'✕ '+((des[0]||{}).txt||'').slice(0,50)));
  if(!hon) mal++;

  console.log('\nfallos: ' + mal);
  console.log('errores de página: ' + (err.length ? err.join(' | ').slice(0,300) : 'ninguno'));
  await b.close();
})().catch(e => console.log('FALLO DEL TEST:', e.message));
