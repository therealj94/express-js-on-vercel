import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const err = [];
for (const [nom, vp] of [['movil',{width:390,height:900}], ['escritorio',{width:1280,height:900}]]) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 2, reducedMotion:'reduce' });
  p.on('pageerror', e => err.push(nom+': '+e.message));
  await p.goto('http://127.0.0.1:8899/index.html');
  await p.waitForTimeout(900);
  // sin Genesis ID: la billetera se abre igual, el resto invita a verificarse
  await p.evaluate(() => {
    localStorage.setItem('veta.bienvenida.v1','1'); VETA.idioma('es');
    VETA._sembrar([{ s:'ORIGEN', n:'ORIGEN', cant:120, precio:.42, nativo:true, img:'assets/tokens/origen.jpg' }]);
    VETA._sesion({ correo:'jose@ordenkapital.com', nombre:'José Enamorado', direccion:'0xb' });
    VETA._identidad({ estado:'iniciada', gid:null });
    VETA.ir('app');
  });
  await p.waitForTimeout(700);
  if (nom === 'movil') {
    console.log('vista de entrada:', await p.evaluate(() => VETA._estado().vistaActual));
    console.log('esferas:', await p.evaluate(() => [...document.querySelectorAll('.nu-nombre')].map(x=>x.textContent)));
    console.log('con candado:', await p.evaluate(() => [...document.querySelectorAll('.nu-cerrado .nu-nombre')].map(x=>x.textContent)));
    console.log('puerta:', await p.evaluate(() => document.querySelector('.nu-puerta h3')?.textContent));
    console.log('pestanas visibles:', await p.evaluate(() => [...document.querySelectorAll('.tabs .nav')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent.trim())));
  }
  await p.screenshot({ path: `nucleo-sinGid-${nom}.png` });
  // con Genesis ID aprobado
  await p.evaluate(() => { VETA._identidad({ estado:'verificada', gid:'OG-1A2B-33' }); VETA.vista('nucleo'); });
  await p.waitForTimeout(500);
  if (nom === 'movil') {
    console.log('verificado · candados:', await p.evaluate(() => document.querySelectorAll('.nu-cerrado').length),
      '| puerta:', await p.evaluate(() => !!document.querySelector('.nu-puerta')));
  }
  await p.screenshot({ path: `nucleo-conGid-${nom}.png` });
  await p.close();
}
console.log(err.length ? 'ERRORES: '+err.join('|') : 'sin errores de pagina');
await b.close();
