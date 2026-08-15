import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const err = [];
const p = await b.newPage({ viewport:{width:390,height:900}, deviceScaleFactor:2, reducedMotion:'reduce' });
p.on('pageerror', e => err.push(e.message));
await p.goto('http://127.0.0.1:8899/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1','1'); VETA.idioma('es');
  VETA._sembrar([
    { s:'ORIGEN', n:'ORIGEN', cant:120, precio:.42, nativo:true },
    { s:'ONDK', n:'ONDK', cant:33, precio:2.10, contrato:'0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1' }]);
  VETA._sesion({ correo:'j@og.com', nombre:'José', direccion:'0x3d5510e5081822877d14cd51b356bf01df2c32c9' });
  VETA.ir('app'); VETA.vista('cobrar');
});
await p.waitForTimeout(400);
console.log('sin cantidad:', await p.evaluate(() => document.querySelector('.vacio b')?.textContent));
await p.fill('#cob-monto', '12.5');
await p.waitForTimeout(500);
console.log('con cantidad · hay QR:', await p.evaluate(() => !!document.querySelector('#cob-qr svg')),
  '| cifra:', await p.evaluate(() => document.querySelector('.cob-cifra')?.textContent.trim()),
  '| usd:', await p.evaluate(() => document.querySelector('.env-usd')?.textContent));
// cambiar de moneda conserva la cantidad
await p.selectOption('.cob-sim', 'ONDK');
await p.waitForTimeout(500);
console.log('en ONDK:', await p.evaluate(() => document.querySelector('.cob-cifra')?.textContent.trim()),
  '| usd:', await p.evaluate(() => document.querySelector('.env-usd')?.textContent));
await p.screenshot({ path: 'cobrar.png' });

// lo que lleva el codigo, y que se pueda volver a leer
const enlace = await p.evaluate(() => VETA._estado && (() => {
  const s = document.querySelector('#cob-qr svg'); return s ? 'hay-qr' : 'no';
})());
console.log('codigo dibujado:', enlace);

// el lector: un enlace de cobro entero deja el envio listo
await p.evaluate(() => {
  VETA.vista('billetera');
  VETA._leerCobro('https://www.vetawallet.com/#pagar?a=0x1111111111111111111111111111111111111111&m=7.25&s=ONDK');
});
await p.waitForTimeout(500);
console.log('tras leer un cobro · vista:', await p.evaluate(() => VETA._estado().vistaActual),
  '| dir:', await p.evaluate(() => document.querySelector('#env-dir')?.value),
  '| monto:', await p.evaluate(() => document.querySelector('#env-monto')?.value),
  '| titulo:', await p.evaluate(() => document.querySelector('.cab h2')?.textContent.trim()));

// una direccion suelta, como los codigos de "recibir" de siempre
await p.evaluate(() => { VETA.vista('billetera'); VETA._leerCobro('0x2222222222222222222222222222222222222222'); });
await p.waitForTimeout(400);
console.log('direccion suelta · dir:', await p.evaluate(() => document.querySelector('#env-dir')?.value),
  '| monto:', JSON.stringify(await p.evaluate(() => document.querySelector('#env-monto')?.value)));
console.log(err.length ? 'ERRORES: '+err.join('|') : 'sin errores de pagina');
await b.close();
