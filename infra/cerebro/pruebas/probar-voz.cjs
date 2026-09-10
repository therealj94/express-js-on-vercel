// Prueba el motor de la voz del cerebro sin depender de la red: se sirve el
// archivo local y se simulan las respuestas. Lo que se comprueba es la
// SECUENCIA de llamadas a speechSynthesis, que es donde estaba el fallo:
// cancel() y speak() en el mismo tick dejan mudo a Safari.
const {chromium} = require('playwright');
const fs = require('fs');

const RUTA = '/home/user/express-js-on-vercel/infra/cerebro/index.html';

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  const p = await (await b.newContext()).newPage();
  const err = [];
  p.on('pageerror', e => err.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') err.push('CONSOLE: ' + m.text()); });

  await p.addInitScript(() => {
    window.__d = [];
    // Voces de mentira, como las de un iPad
    const V = [
      {name:'Daniel', lang:'en-GB', localService:true},
      {name:'Samantha', lang:'en-US', localService:true},
      {name:'Mónica', lang:'es-ES', localService:true},
      {name:'Paulina', lang:'es-MX', localService:true}
    ];
    const s = window.speechSynthesis;
    s.getVoices = () => V;
    s.speak = u => {
      window.__d.push({t:'speak', txt:u.text.slice(0,44), voz:u.voice&&u.voice.name,
                       lang:u.lang, rate:u.rate, pitch:u.pitch});
      setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 25);
    };
    s.cancel = () => window.__d.push({t:'cancel'});
    Object.defineProperty(s, 'speaking', {get:()=>false});
    Object.defineProperty(s, 'pending',  {get:()=>false});
    Object.defineProperty(s, 'paused',   {get:()=>false});

    // La red: fixtures mínimos para que la página se llene
    const real = window.fetch;
    window.fetch = async (u, o) => {
      const url = String(u);
      const J = x => new Response(JSON.stringify(x), {headers:{'content-type':'application/json'}});
      if (url.includes('informe.json')) return J({fecha:'13 aug', versionBackend:'79',
        precio:'2.55', comision:'0.001 ORIGEN', comisionEncendida:false, genesisListo:true,
        hechoHoy:['One thing done'], pendiente:['One thing pending']});
      if (url.includes('partes.json')) return J([
        {agente:'cerrajero', nombre:'CERRAJERO', veredicto:'falla',
         cuando:new Date().toISOString(), resumen:'Two admin accounts without a second factor',
         hallazgos:['a'], escala:['Turn on the second factor']},
        {agente:'vigia', nombre:'VIGÍA', veredicto:'bien',
         cuando:new Date().toISOString(), resumen:'Both chains as they should be', hallazgos:[]}]);
      if (url.includes('/ordenes/bots')) return J({cuando:new Date().toISOString(),
        estado:'bien', bloque:22541, segundos:12.1, enviosQueQuedan:55});
      if (url.includes('/rpc-vieja')) return J({jsonrpc:'2.0', id:1, result:'0x1'});
      if (url.includes('/rpc')) return J({jsonrpc:'2.0', id:1, result:'0x159e'});
      if (url.includes('totalBlock')) return J({blockTotal:22500});
      if (url.includes('api.github.com')) return J({state:'open', merged:false});
      return new Response('ok');
    };
  });

  await p.goto('file://' + RUTA, {waitUntil:'domcontentloaded', timeout:30000});
  await p.waitForTimeout(1500);
  // la puerta de idioma tapa todo hasta que se elige: se elige.
  if(await p.$('#puerta.abre')) await p.click('#puerta [data-idi="es"]');
  await p.waitForTimeout(400);

  console.log('errores al cargar:', err.length ? err.join(' | ').slice(0,400) : 'ninguno');
  console.log('estado:', JSON.stringify(await p.evaluate(() => ({
    sistemas: document.querySelectorAll('#sistemas .fila').length,
    agentes:  document.querySelectorAll('#agentes .fila').length,
    voces:    document.querySelector('#voces').options.length,
    vozElegida: document.querySelector('#voces').value
  }))));

  // ── 1 · el botón principal, en frío (esto es lo que fallaba)
  await p.click('#hablar');
  await p.waitForTimeout(1800);
  let r = await p.evaluate(() => ({
    sec: window.__d.map(x=>x.t).slice(0,6).join(' → '),
    n: window.__d.filter(x=>x.t==='speak').length,
    prim: window.__d.find(x=>x.t==='speak') || null
  }));
  console.log('\nEN FRÍO · secuencia:', r.sec);
  console.log('EN FRÍO · speak() llamado', r.n, 'veces');
  console.log('EN FRÍO · primera:', JSON.stringify(r.prim));

  // ── 2 · interrumpir y volver a hablar (aquí sí hay cancel)
  await p.evaluate(() => window.__d = []);
  await p.click('#hablar');            // parar
  await p.click('#hablar');            // arrancar otra vez
  await p.waitForTimeout(1500);
  r = await p.evaluate(() => ({sec: window.__d.map(x=>x.t).slice(0,5).join(' → '),
                               n: window.__d.filter(x=>x.t==='speak').length}));
  console.log('\nINTERRUMPIDO · secuencia:', r.sec);
  console.log('INTERRUMPIDO · speak() llamado', r.n, 'veces');

  // ── 3 · en español
  await p.evaluate(() => { parar(); });          // vaciar la cola de verdad
  await p.waitForTimeout(700);
  // el selector vive dentro del panel de ajustes, que esta cerrado: se
  // cambia el valor y se avisa, que es justo lo que hace el usuario al abrirlo.
  await p.evaluate(()=>{const s=document.querySelector('#idioma');
    s.value='es'; s.dispatchEvent(new Event('change'));});
  await p.waitForTimeout(600);
  await p.evaluate(() => window.__d = []);
  await p.click('#hablar');
  await p.waitForTimeout(1500);
  r = await p.evaluate(() => ({
    n: window.__d.filter(x=>x.t==='speak').length,
    prim: window.__d.find(x=>x.t==='speak') || null,
    titulo: document.querySelector('#tAg').textContent,
    boton: document.querySelector('#lblHablar').textContent
  }));
  console.log('\nESPAÑOL · speak() llamado', r.n, 'veces');
  console.log('ESPAÑOL · primera:', JSON.stringify(r.prim));
  console.log('ESPAÑOL · la interfaz dice:', r.titulo, '/', r.boton);

  console.log('\nerrores totales:', err.length ? err.join(' | ').slice(0,400) : 'ninguno');
  await p.screenshot({path:'/tmp/cerebro.png'});
  await b.close();
})().catch(e => console.log('FALLO DEL TEST:', e.message));
