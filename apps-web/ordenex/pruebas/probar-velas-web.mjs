/* La gráfica de velas, mirada por un navegador de verdad.
 *
 *   node apps-web/ordenex/pruebas/probar-velas-web.mjs
 *
 * Un canvas no se puede leer con querySelector: lo que promete solo se
 * comprueba mirando los píxeles. Aquí se sirve una página mínima con velas.js
 * (la pieza bajo prueba, sola — sus vecinas tienen sus propias pruebas), se
 * pintan velas sintéticas deterministas y se muestrea el resultado.
 *
 * Se comprueban las dos clases de promesa, y hacen falta las dos:
 *
 *   · Las que se ven. Que haya jade y coral de verdad, que la EMA exista en
 *     píxeles, que la banda de volumen desaparezca cuando no hay volumen —
 *     medido por dónde llega la vela más baja—, que el vacío dibuje su marco
 *     igual que un mercado lleno, que la cruz pinte sus pastillas.
 *   · Las que se afirman. dibujar() devuelve un INFORME de lo que acaba de
 *     pintar (leyenda, índice, EMAs, si hubo volumen). Ese informe se
 *     construye con las MISMAS cadenas que se dibujan, así que comprobarlo es
 *     comprobar lo pintado — y permite afirmar cosas que un contador de
 *     píxeles no sabría distinguir, como que la leyenda sigue a la cruz.
 *
 * La regla que más se vigila aquí es la de la EMA: EMA(n) no existe en las
 * primeras n-1 velas, y una línea que arranca en la primera es una mentira
 * gráfica. Se comprueba por tres caminos independientes: la aritmética, el
 * informe y el guion que sale en la leyenda al apuntar a una vela temprana.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2', '.woff': 'font/woff' };

/* La página de ensayo: un canvas con tamaño CSS fijo y velas.js, nada más.
   El fondo es el pozo de la casa para mirar la gráfica sobre su color real,
   pero el canvas queda transparente: todo píxel con alfa es píxel pintado.
   La paleta va en :root porque de ahí la lee velas.js — el tema vive en el
   CSS y la gráfica lo sigue, así que la prueba tiene que darle el CSS. */
const PAGINA = `<meta charset="utf-8"><title>ensayo velas</title>
<style>
:root{--pozo:#021B1C;--oro:#C9A961;--oroLt:#EAD79C;--crema:#F3ECD9;--bruma:#AEC7C3;
      --humo:#6E938F;--jade:#3ED9A0;--coral:#F0776B;--acento:#74E6C8;
      --linea:rgba(201,169,97,.34)}
body{background:#021B1C;margin:0}#cv{width:640px;height:360px;display:block;margin:20px}
</style>
<canvas id="cv"></canvas>
<script src="velas.js"></script>`;

const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0]);
  if (ruta === '/' || ruta === '/prueba-velas.html') {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return r.end(PAGINA);
  }
  try {
    const p = join(RAIZ, ruta);
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((r) => sv.listen(0, r));
const BASE = `http://127.0.0.1:${sv.address().port}/prueba-velas.html`;

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 140)}`);
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
// deviceScaleFactor 2 a propósito: si el devicePixelRatio está mal manejado,
// el lienzo interno no mide el doble y la primera comprobación lo delata.
const p = await nav.newPage({ viewport: { width: 1024, height: 760 }, deviceScaleFactor: 2 });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.goto(BASE);
await p.waitForTimeout(300);

/* Los ayudantes viven en la página porque los píxeles viven allá.
   - hacerVelas: sintéticas y DETERMINISTAS (nada de Math.random: una prueba
     que falla a veces no prueba nada), con subidas, bajadas y algún doji.
   - hacerUsd: las de REFERENCIA — dólares en Number y sin columna de volumen,
     exactamente como llegan del feed OHLC del metal.
   - contar: muestrea el lienzo y clasifica por color con tolerancia, porque
     el des-premultiplicado del canvas mueve los canales un pelo. Acepta un
     alfa mínimo (la rejilla de la casa es tenue a propósito) y devuelve
     también hasta dónde llega la vela más baja OPACA — la frontera del panel
     de precio, que es como se mide si la banda de volumen existe. */
await p.evaluate(() => {
  window.hacerVelas = (n, conVolumen = true) => {
    const U = 10n ** 18n;
    const velas = [];
    let precio = (26n * U) / 10n;                       // arranca en 2.6 ORIGEN
    const t0 = Date.UTC(2026, 7, 14, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      const delta = (U / 50n) * BigInt(((i * 7919) % 11) - 5);   // -5..5, con ceros
      const o = precio, c = precio + delta;
      const h = (o > c ? o : c) + U / 40n;
      const l = (o < c ? o : c) - U / 40n;
      const fila = [t0 + i * 3600000, o.toString(), h.toString(), l.toString(), c.toString()];
      if (conVolumen) fila.push(((3n + BigInt(i % 7)) * U).toString());
      velas.push(fila);
      precio = c;
    }
    return velas;
  };
  window.hacerUsd = (n) => {
    const velas = [];
    let precio = 3450.5;
    const t0 = Date.UTC(2026, 7, 1, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      const delta = (((i * 7919) % 11) - 5) * 3.7;
      const o = precio, c = precio + delta;
      velas.push([t0 + i * 4 * 3600000, o, Math.max(o, c) + 4.2, Math.min(o, c) - 3.8, c]);
      precio = c;
    }
    return velas;                                       // sin volumen: el feed no lo trae
  };
  window.contar = (alfaMin = 40) => {
    const c = document.querySelector('#cv');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const cerca = (a, b) => Math.abs(a - b) <= 8;
    let pintados = 0, jade = 0, coral = 0, oro = 0, acento = 0, ficha = 0;
    let fondoOpaco = -1, bajoOpaco = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < alfaMin) continue;
      const y = Math.floor((i / 4) / c.width);
      pintados++;
      const esJade = cerca(d[i], 62) && cerca(d[i + 1], 217) && cerca(d[i + 2], 160);
      const esCoral = cerca(d[i], 240) && cerca(d[i + 1], 119) && cerca(d[i + 2], 107);
      if (esJade) jade++;
      else if (esCoral) coral++;
      else if (cerca(d[i], 201) && cerca(d[i + 1], 169) && cerca(d[i + 2], 97)) oro++;
      else if (cerca(d[i], 116) && cerca(d[i + 1], 230) && cerca(d[i + 2], 200)) acento++;
      else if (a > 240 && cerca(d[i], 5) && cerca(d[i + 1], 42) && cerca(d[i + 2], 44)) ficha++;
      // La vela y la pastilla del último precio son opacas; el volumen va a
      // media tinta. El fondo del panel de precio es, por tanto, el píxel
      // opaco de vela más bajo del lienzo.
      if ((esJade || esCoral) && a > 240 && y > fondoOpaco) fondoOpaco = y;
    }
    // Segunda pasada: lo teñido de vela que vive POR DEBAJO del panel de
    // precio solo puede ser la banda de volumen.
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < alfaMin || a > 240) continue;
      const y = Math.floor((i / 4) / c.width);
      if (y < fondoOpaco + 12) continue;
      if ((cerca(d[i], 62) && cerca(d[i + 1], 217) && cerca(d[i + 2], 160))
       || (cerca(d[i], 240) && cerca(d[i + 1], 119) && cerca(d[i + 2], 107))) bajoOpaco++;
    }
    return { pintados, jade, coral, oro, acento, ficha, fondoOpaco, bajoOpaco };
  };
  // La huella de la esquina donde vive la leyenda: si cambia la leyenda,
  // cambia la huella. Sirve para probar que lo que cambió se PINTÓ.
  window.huellaLeyenda = () => {
    const c = document.querySelector('#cv');
    const d = c.getContext('2d').getImageData(0, 0, Math.min(600, c.width), 130).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 3] * 7) % 2147483647;
    return h;
  };
});

// ── 1 · la pieza y sus promesas de precisión ───────────────────────────────
console.log('\n── la pieza ─────────────────────────────────────────────────');
{
  const api = await p.evaluate(() => typeof VELAS === 'object'
    && typeof VELAS.dibujar === 'function' && typeof VELAS.enganchar === 'function');
  decir(api, 'VELAS expone dibujar y enganchar');

  // La promesa de no redondear: 2.999… se CORTA a 2.9999, jamás sube a 3.
  const fmt = await p.evaluate(() => [
    VELAS._piezas.formatear(BigInt('2999999999999999999'), 4),
    VELAS._piezas.formatear(BigInt('1000000000000000000'), 4),
    VELAS._piezas.formatear(1234567n * 10n ** 18n, 0),
  ]);
  decir(fmt[0] === '2.9999', 'el dinero se corta, no se redondea', fmt[0]);
  decir(fmt[1] === '1', 'los ceros de la cola no se enseñan', fmt[1]);
  decir(fmt[2] === '1,234,567', 'los miles llevan su coma', fmt[2]);
}

// ── 2 · la frontera de los tipos: wei por una puerta, dólares por la otra ──
console.log('\n── la frontera BigInt / Number ──────────────────────────────');
{
  const f = await p.evaluate(() => {
    const { deWei, deNumero } = VELAS._piezas;
    return {
      wei: String(deWei('1230000000000000000')),
      weiVacio: deWei(''), weiNulo: deWei(null), weiFlotante: deWei(1.5),
      usd: String(deNumero(3450.25)),
      usdDecimo: String(deNumero(0.1)),
      usdNegativo: String(deNumero(-2.5)),
      usdRoto: deNumero('no'), usdInfinito: deNumero(Infinity),
    };
  });
  decir(f.wei === '1230000000000000000', 'ORIGEN entra como string de wei, tal cual', f.wei);
  decir(f.weiVacio === null && f.weiNulo === null && f.weiFlotante === null,
        'y un wei vacío, nulo o flotante NO vale cero: vale nada (fail-closed)',
        JSON.stringify([f.weiVacio, f.weiNulo, f.weiFlotante]));
  // 0.1 es EL caso: 0.1*1e18 en coma flotante da 100000000000000016.
  decir(f.usdDecimo === '100000000000000000',
        'el dólar cruza por texto, no multiplicando: 0,1 no arrastra basura binaria', f.usdDecimo);
  decir(f.usd === '3450250000000000000000', 'y un precio de onza cruza exacto', f.usd);
  decir(f.usdNegativo === '-2500000000000000000', 'el signo sobrevive el cruce', f.usdNegativo);
  decir(f.usdRoto === null && f.usdInfinito === null, 'lo que no es número no cruza',
        JSON.stringify([f.usdRoto, f.usdInfinito]));
}

// ── 3 · la EMA, la regla que más se vigila ─────────────────────────────────
console.log('\n── la EMA: sembrada, no inventada ───────────────────────────');
{
  const e = await p.evaluate(() => {
    const U = 10n ** 18n;
    // Cierres 1..20 ORIGEN, para poder hacer la cuenta a mano.
    const cierres = Array.from({ length: 20 }, (_, i) => BigInt(i + 1) * U);
    const ema9 = VELAS._piezas.calcularEma(cierres, 9);
    const ema55 = VELAS._piezas.calcularEma(cierres, 55);
    // La siembra es la media simple de los 9 primeros: (1+…+9)/9 = 5.
    const semilla = 5n * U;
    // Y el paso siguiente: 5 + (10 - 5)·2/10 = 6.
    const siguiente = semilla + ((10n * U - semilla) * 2n) / 10n;
    return {
      antes: ema9.slice(0, 8).every(x => x === null),
      octavo: ema9[7], noveno: String(ema9[8]), esperado: String(semilla),
      decimo: String(ema9[9]), esperadoDecimo: String(siguiente),
      cortos: ema55.every(x => x === null),
      largo: ema9.length,
    };
  });
  decir(e.antes && e.octavo === null,
        'EMA(9): los primeros 8 puntos NO existen — una media sin memoria es una mentira gráfica');
  decir(e.noveno === e.esperado, 'y el punto 9 es exactamente la media simple de los 9 primeros',
        `${e.noveno} vs ${e.esperado}`);
  decir(e.decimo === e.esperadoDecimo, 'de ahí en adelante corre con alfa 2/(n+1), en BigInt',
        `${e.decimo} vs ${e.esperadoDecimo}`);
  decir(e.cortos, 'EMA(55) sobre 20 velas no existe en ningún punto: se calla entera');
  decir(e.largo === 20, 'la serie devuelta calza con la de cierres', String(e.largo));
}

// ── 4 · velas sintéticas: el canvas pinta de verdad ────────────────────────
console.log('\n── 90 velas de tratos ───────────────────────────────────────');
let informeBase;
{
  informeBase = await p.evaluate(() => {
    // La referencia por ENCIMA del rango de tratos a propósito: si la escala
    // no la incluyera, la línea quedaría fuera del encuadre y no se vería.
    return VELAS.dibujar(document.querySelector('#cv'), window.hacerVelas(90),
      { par: 'AUKA-ORIGEN', marco: '1h', referencia: (3n * 10n ** 18n).toString() });
  });
  const c = await p.evaluate(() => window.contar());
  decir(c.pintados > 2000, 'el lienzo no está en blanco', `${c.pintados} px pintados`);
  decir(c.jade > 100, 'hay velas jade (suben)', `${c.jade} px`);
  decir(c.coral > 100, 'hay velas coral (bajan)', `${c.coral} px`);
  decir(c.oro > 40, 'la línea de referencia está a la vista, punteada y en oro', `${c.oro} px`);
  decir(c.acento > 200, 'la EMA rápida está pintada, no solo calculada', `${c.acento} px`);

  decir(informeBase.n === 90 && informeBase.vacio === null, 'el informe cuenta las 90 velas',
        JSON.stringify({ n: informeBase.n, vacio: informeBase.vacio }));
  decir(informeBase.indice === 89, 'sin ratón, la leyenda enseña la ÚLTIMA vela',
        `índice ${informeBase.indice}`);
  const desde = informeBase.leyenda.emas.map(x => x.desde);
  decir(JSON.stringify(desde) === '[8,20,54]',
        'cada EMA arranca en su punto n-1, ni un pixel antes', JSON.stringify(desde));
  decir(informeBase.leyenda.par === 'AUKA-ORIGEN' && informeBase.leyenda.marco === '1h',
        'la leyenda rotula par y marco', JSON.stringify(informeBase.leyenda.par));
  decir(typeof informeBase.leyenda.cambio === 'number',
        'y el cambio de la vela en %', String(informeBase.leyenda.cambio));

  const rotulo = await p.evaluate(() => document.querySelector('#cv').getAttribute('aria-label') || '');
  decir(/90/.test(rotulo) && /AUKA-ORIGEN/.test(rotulo),
        'el rótulo accesible dice par y cuántas velas', rotulo);
  decir(!/referencia/i.test(rotulo),
        'y no llama referencia a lo que son tratos reales', rotulo);

  const medidas = await p.evaluate(() => {
    const c = document.querySelector('#cv');
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, dpr: devicePixelRatio };
  });
  decir(medidas.w === medidas.cw * 2 && medidas.h === medidas.ch * 2,
        'el lienzo interno respeta el devicePixelRatio (×2)', JSON.stringify(medidas));

  // Las EMAs se apagan con emas: [] — y entonces no queda ni un trazo suyo.
  const sinEma = await p.evaluate(() => {
    const inf = VELAS.dibujar(document.querySelector('#cv'), window.hacerVelas(90),
      { par: 'AUKA-ORIGEN', marco: '1h', emas: [] });
    return { inf, c: window.contar() };
  });
  decir(sinEma.inf.leyenda.emas.length === 0 && sinEma.c.acento < 20,
        'con emas: [] no se dibuja ni una media', `${sinEma.c.acento} px de acento`);
}

// ── 5 · la leyenda sigue a la cruz ─────────────────────────────────────────
console.log('\n── la leyenda y la cruz ─────────────────────────────────────');
{
  const r = await p.evaluate(() => {
    const cv = document.querySelector('#cv');
    const velas = window.hacerVelas(90);
    const op = { par: 'AUKA-ORIGEN', marco: '1h' };
    const izq = VELAS.dibujar(cv, velas, { ...op, cursor: { x: 60, y: 150 } });
    const hIzq = window.huellaLeyenda();
    const cIzq = window.contar();
    const der = VELAS.dibujar(cv, velas, { ...op, cursor: { x: 500, y: 150 } });
    const hDer = window.huellaLeyenda();
    const sin = VELAS.dibujar(cv, velas, op);
    const cSin = window.contar();
    return { izq, der, sin, hIzq, hDer, cIzq, cSin };
  });
  decir(r.izq.indice < 15 && r.der.indice > 60,
        'la cruz se imanta a la vela que tiene debajo',
        `x=60 → ${r.izq.indice} · x=500 → ${r.der.indice}`);
  decir(r.izq.leyenda.c !== r.der.leyenda.c && r.izq.leyenda.o !== r.der.leyenda.o,
        'y la leyenda cambia con ella: otro O H L C',
        `${r.izq.leyenda.c} vs ${r.der.leyenda.c}`);
  decir(r.hIzq !== r.hDer, 'ese cambio se PINTA, no solo se declara',
        `huellas ${r.hIzq} / ${r.hDer}`);
  decir(r.sin.indice === 89, 'al soltar la cruz vuelve a la última vela', `índice ${r.sin.indice}`);
  decir(r.cIzq.ficha > 400, 'la cruz trae sus pastillas de eje (precio y hora)',
        `${r.cIzq.ficha} px de pastilla`);
  decir(r.cSin.ficha < 60, 'sin cruz no hay pastillas de cruz', `${r.cSin.ficha} px`);

  // Apuntando a una vela temprana, EMA(55) todavía no existe — y se dice con
  // un guion, no con el precio disfrazado de media.
  const temprana = await p.evaluate(() => VELAS.dibujar(document.querySelector('#cv'),
    window.hacerVelas(90), { par: 'AUKA-ORIGEN', marco: '1h', cursor: { x: 40, y: 150 } }));
  const e55 = temprana.leyenda.emas.find(x => x.periodo === 55);
  const e9 = temprana.leyenda.emas.find(x => x.periodo === 9);
  decir(e55.valor === null, 'en las primeras velas la EMA55 se declara ausente, no se inventa',
        JSON.stringify(e55));
  decir(e9.valor === null || temprana.indice >= 8,
        'y la EMA9 solo aparece a partir de su novena vela', JSON.stringify(e9));
}

// ── 6 · el volumen: banda propia, o ninguna banda ──────────────────────────
console.log('\n── el histograma de volumen ─────────────────────────────────');
{
  const con = await p.evaluate(() => {
    const inf = VELAS.dibujar(document.querySelector('#cv'), window.hacerVelas(90, true),
      { par: 'AUKA-ORIGEN', marco: '1h' });
    return { inf, c: window.contar() };
  });
  const sin = await p.evaluate(() => {
    const inf = VELAS.dibujar(document.querySelector('#cv'), window.hacerVelas(90, false),
      { par: 'AUKA-ORIGEN', marco: '1h' });
    return { inf, c: window.contar() };
  });
  decir(con.inf.volumen === true && sin.inf.volumen === false,
        'el informe sabe si hubo volumen que pintar',
        `${con.inf.volumen} / ${sin.inf.volumen}`);
  decir(con.c.bajoOpaco > 500, 'con volumen hay barras teñidas bajo el panel de precio',
        `${con.c.bajoOpaco} px`);
  decir(sin.c.bajoOpaco < 50, 'sin volumen no queda ni una barra huérfana ahí abajo',
        `${sin.c.bajoOpaco} px`);
  decir(sin.c.fondoOpaco > con.c.fondoOpaco + 100,
        'y el precio se queda con todo el alto: la vela baja mucho más',
        `fondo ${con.c.fondoOpaco} → ${sin.c.fondoOpaco} px de lienzo`);
}

// ── 7 · las velas de REFERENCIA: dólares, y rotuladas como lo que son ──────
console.log('\n── referencia en dólares ────────────────────────────────────');
{
  const r = await p.evaluate(() => {
    const inf = VELAS.dibujar(document.querySelector('#cv'), window.hacerUsd(180),
      { par: 'AUKA', marco: '4h', unidad: 'USD' });
    return { inf, rotulo: document.querySelector('#cv').getAttribute('aria-label') || '',
             c: window.contar() };
  });
  decir(r.inf.n === 180 && r.inf.unidad === 'USD',
        'las velas del metal entran en Number y se pintan igual', JSON.stringify(r.inf.n));
  // La regla dura: en esta casa no se opera en dólares, así que dólar implica
  // referencia AUNQUE nadie lo haya pedido. Ante la duda se rotula.
  decir(r.inf.referencia === true, 'la unidad USD implica referencia por sí sola');
  decir(/referencia/i.test(r.rotulo) && /no una operación/i.test(r.rotulo),
        'y el rótulo accesible lo dice con todas las letras', r.rotulo);
  decir(r.inf.volumen === false, 'el feed del metal no trae volumen: no hay banda que fingir');
  decir(r.c.jade + r.c.coral > 500, 'aun así son velas de verdad, con su dirección',
        `${r.c.jade + r.c.coral} px`);
  decir(r.inf.leyenda.c.includes(','), 'y el precio en dólares lleva su coma de miles',
        r.inf.leyenda.c);

  const en = await p.evaluate(() => {
    VELAS.dibujar(document.querySelector('#cv'), window.hacerUsd(60),
      { par: 'AGKA', unidad: 'USD', idioma: 'en' });
    return document.querySelector('#cv').getAttribute('aria-label') || '';
  });
  decir(/reference/i.test(en) && /not an Ordenex trade/i.test(en),
        'en inglés la promesa es la misma', en);
}

// ── 8 · la cruz viva: enganchar, ratón y apagador ──────────────────────────
console.log('\n── el enchufe con vida ──────────────────────────────────────');
{
  await p.evaluate(() => {
    window.__apagar = VELAS.enganchar(document.querySelector('#cv'),
      () => ({ velas: window.hacerVelas(48),
               opciones: { par: 'AUKA-ORIGEN', marco: '1h',
                           referencia: (3n * 10n ** 18n).toString() } }));
  });
  await p.waitForTimeout(200);
  const antes = await p.evaluate(() => window.contar());
  decir(antes.ficha < 60, 'sin ratón encima no hay pastillas de cruz', `${antes.ficha} px`);

  // El canvas vive en (20,20) y mide 640×360: (340,200) cae en plena gráfica.
  await p.mouse.move(340, 200);
  await p.waitForTimeout(150);
  const con = await p.evaluate(() => window.contar());
  decir(con.ficha > 400, 'al mover el ratón aparecen las pastillas de los ejes', `${con.ficha} px`);
  decir(con.pintados > antes.pintados, 'y la cruz suma trazo al lienzo',
        `${antes.pintados} → ${con.pintados}`);

  await p.mouse.move(900, 500);            // fuera del canvas: pointerleave
  await p.waitForTimeout(150);
  const fuera = await p.evaluate(() => window.contar());
  decir(fuera.ficha < 60, 'al salir del lienzo la cruz se va', `${fuera.ficha} px`);

  await p.evaluate(() => window.__apagar());
  await p.mouse.move(340, 200);
  await p.waitForTimeout(150);
  const muerto = await p.evaluate(() => window.contar());
  decir(muerto.ficha < 60, 'tras apagar, mover el ratón ya no dibuja nada', `${muerto.ficha} px`);
}

// ── 9 · el vacío digno: mismo marco, sin un número inventado ───────────────
console.log('\n── el vacío ─────────────────────────────────────────────────');
{
  const lleno = await p.evaluate(() => {
    VELAS.dibujar(document.querySelector('#cv'), window.hacerVelas(48),
      { par: 'AUKA-ORIGEN', marco: '1h' });
    return window.contar(8);
  });
  const vacio = await p.evaluate(() => {
    const inf = VELAS.dibujar(document.querySelector('#cv'), [],
      { par: 'MNKA-ORIGEN', marco: '1h' });
    return { inf, c: window.contar(8),
             rotulo: document.querySelector('#cv').getAttribute('aria-label') || '' };
  });
  decir(vacio.inf.vacio === 'sinTratos' && vacio.inf.n === 0,
        'el informe distingue el mercado recién nacido', JSON.stringify(vacio.inf.vacio));
  decir(/sin tratos todavía/i.test(vacio.rotulo), 'el rótulo dice «sin tratos todavía»', vacio.rotulo);
  decir(/MNKA-ORIGEN/.test(vacio.rotulo), 'y de qué activo se está callando', vacio.rotulo);
  decir(vacio.c.pintados > 8000, 'el marco entero se dibuja igual que con mercado',
        `${vacio.c.pintados} px (lleno: ${lleno.pintados})`);
  decir(vacio.c.oro > 200, 'con sus ejes, no solo una frase flotando', `${vacio.c.oro} px de eje`);
  decir(vacio.c.jade + vacio.c.coral === 0, 'sin una sola vela inventada',
        `${vacio.c.jade + vacio.c.coral} px de vela`);
  decir(vacio.c.acento === 0, 'ni una EMA sobre la nada', `${vacio.c.acento} px`);

  const en = await p.evaluate(() => {
    VELAS.dibujar(document.querySelector('#cv'), [], { idioma: 'en' });
    return document.querySelector('#cv').getAttribute('aria-label') || '';
  });
  decir(/no trades yet/i.test(en), 'y en inglés también sabe decirlo', en);

  // Velas rotas NO son cero velas: un dato ilegible se confiesa, no se
  // disfraza de mercado recién nacido.
  const roto = await p.evaluate(() => {
    const inf = VELAS.dibujar(document.querySelector('#cv'), [['x', 'no', 'es', 'una', 'vela', '!']], {});
    return { inf, rotulo: document.querySelector('#cv').getAttribute('aria-label') || '',
             c: window.contar(8) };
  });
  decir(/no pudimos leer/i.test(roto.rotulo) && roto.inf.vacio === 'ilegible',
        'velas ilegibles se confiesan, no se pintan como vacío', roto.rotulo);
  decir(roto.c.oro > 200, 'y el marco se dibuja igual: la gráfica no desaparece',
        `${roto.c.oro} px de eje`);

  // Una sola vela ilegible entre muchas buenas no tumba la gráfica: se cae
  // ella sola. Fail-closed es descartar el dato malo, no el panel entero.
  const mixto = await p.evaluate(() => VELAS.dibujar(document.querySelector('#cv'),
    [...window.hacerVelas(20), [Date.now(), 'x', 'y', 'z', 'w', '0']], { par: 'AUKA-ORIGEN' }));
  decir(mixto.n === 20 && mixto.vacio === null,
        'una vela rota se cae sola; las 20 buenas se siguen viendo', JSON.stringify(mixto.n));
}

/* ── 10 · el único movimiento de la pieza, y quien pide que no lo haya ─────
   El latido del último precio es la única animación de este archivo. Por eso
   `prefers-reduced-motion: reduce` se puede comprobar de verdad: con la
   preferencia puesta, la gráfica tiene que quedarse EXACTAMENTE igual cuadro
   tras cuadro después de un cambio de precio. Se afirma esa dirección —la que
   protege a quien pidió calma— porque es la que no depende de atrapar un
   fotograma a tiempo. */
console.log('\n── prefers-reduced-motion ───────────────────────────────────');
{
  // Primero, que el destello EXISTA: si no se pintara nunca, apagarlo no
  // probaría nada. Esto se afirma sin reloj, dibujando el cuadro a mano.
  const halo = await p.evaluate(() => {
    const cv = document.querySelector('#cv');
    const velas = window.hacerVelas(48);
    VELAS.dibujar(cv, velas, { par: 'AUKA-ORIGEN', marco: '1h', destello: 0 });
    const quieto = window.contar();
    VELAS.dibujar(cv, velas, { par: 'AUKA-ORIGEN', marco: '1h', destello: 1 });
    const latiendo = window.contar();
    return { quieto: quieto.pintados, latiendo: latiendo.pintados };
  });
  decir(halo.latiendo > halo.quieto + 200, 'el latido del último precio se pinta cuando lo hay',
        `${halo.quieto} → ${halo.latiendo} px`);

  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.evaluate(() => {
    window.__paso = 0;
    window.__base = window.hacerVelas(48);
    window.__ap3 = VELAS.enganchar(document.querySelector('#cv'), () => {
      const v = window.__base.map(f => f.slice());
      // A partir del segundo sondeo el último cierre CAMBIA: es justo el
      // suceso que enciende el latido.
      if (window.__paso) v[47][4] = (BigInt(v[47][4]) + 10n ** 17n).toString();
      return { velas: v, opciones: { par: 'AUKA-ORIGEN', marco: '1h' } };
    }, 80);
  });
  await p.waitForTimeout(150);
  await p.evaluate(() => { window.__paso = 1; });
  await p.waitForTimeout(200);                       // que el cambio ya esté pintado
  const muestras = [];
  for (let i = 0; i < 6; i++) {
    muestras.push(await p.evaluate(() => window.huellaLeyenda() + ':' + window.contar().pintados));
    await p.waitForTimeout(60);
  }
  await p.evaluate(() => window.__ap3());
  await p.emulateMedia({ reducedMotion: null });
  decir(new Set(muestras).size === 1,
        'con la preferencia puesta, el lienzo no se mueve ni un píxel tras cambiar el precio',
        [...new Set(muestras)].join(' | '));
}

decir(errores.length === 0, 'sin errores de consola', errores.join(' | '));

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
