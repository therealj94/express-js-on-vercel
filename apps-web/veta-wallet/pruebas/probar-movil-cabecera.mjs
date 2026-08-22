/* La cabecera del chat en un teléfono, con un nombre largo de verdad.
 *
 * «Mayra Carolina Enamorado Alvarez» ocupaba cuatro renglones y se metía por
 * debajo de los botones de llamada y video. Cuatro nombres de pila y apellidos
 * no es un caso raro en Honduras: es el caso normal.
 *
 * Lo que se mide: que el nombre quede en UN renglón, que no se solape con
 * ningún botón, y que nada se salga del ancho de la pantalla.
 *
 * Corre con el servidor estático en 8791:
 *   python3 -m http.server 8791 --directory /home/user/express-js-on-vercel &
 *   node probar-movil-cabecera.mjs
 */
import { chromium } from 'playwright';

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

let fallos = 0;
const ok = (que, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FALLA'}  ${que}${extra ? '  · ' + extra : ''}`);
  if (!cond) fallos++;
};

/* Nombres de verdad, del largo que la gente tiene. El primero es el del caso
   que reporto José. */
const NOMBRES = [
  'Mayra Carolina Enamorado Alvarez',
  'José Fernando Villanueva Mondragón',
  'Ana',
  'María de los Ángeles Hernández Portillo de Castellanos',
];

const ANCHOS = [320, 360, 390, 412];

const pag = await nav.newPage();
await pag.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:8791')
  ? r.continue() : r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));

try {
  for (const ancho of ANCHOS) {
    await pag.setViewportSize({ width: ancho, height: 780 });
    await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/index.html',
      { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(500);

    for (const nombre of NOMBRES) {
      /* Se monta la cabecera sola, con las clases de verdad y el mismo orden de
         elementos que pinta la app. Levantar la app entera con sesión pediría
         un backend; lo que se prueba acá es la caja, y la caja es esta. */
      const medida = await pag.evaluate(([nombre]) => {
        document.body.className = 'en-p2c';
        let caja = document.getElementById('__prueba');
        if (!caja) {
          caja = document.createElement('div');
          caja.id = '__prueba';
          document.body.appendChild(caja);
        }
        const boton = (n) => `<button class="cha-mas cha-hmas" aria-label="b${n}">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></button>`;
        caja.innerHTML = `
          <div class="cha-hcab">
            <button class="cha-volver" aria-label="volver"><svg viewBox="0 0 24 24"><path d="M19 12H5"/></svg></button>
            <button class="cha-quien-btn">
              <span class="cha-av">M</span>
              <span class="cha-quien">
                <b id="__nom">${nombre}</b>
                <small>GEN-MAYRA-0001</small>
              </span>
            </button>
            ${boton(1)}${boton(2)}${boton(3)}${boton(4)}
          </div>`;

        const nom = document.getElementById('__nom');
        const rNom = nom.getBoundingClientRect();
        /* LOS RENGLONES SE CUENTAN CON UN Range, y no dividiendo la altura por
           `lineHeight`. La primera version hacia eso y `lineHeight` vale
           «normal», asi que `parseFloat` daba NaN, el `||` caia a la altura
           entera, y la division daba 1 SIEMPRE. La prueba pasaba con el fallo
           delante. Un `Range` sobre el nodo de texto devuelve un rectangulo
           por renglon, que es el dato de verdad. */
        const rango = document.createRange();
        rango.selectNodeContents(nom.firstChild);   // el NODO DE TEXTO, no el <b>
        /* Se cuentan las alturas distintas y se tiran los rectangulos vacios.
           Contar rectangulos a secas daba dos hasta con un nombre de tres
           letras: el navegador devuelve alguno de altura cero. */
        const tops = new Set([...rango.getClientRects()]
          .filter(r => r.height > 0 && r.width > 0)
          .map(r => Math.round(r.top)));
        const linea = tops.size;
        const botones = [...caja.querySelectorAll('.cha-hmas')].map(b => b.getBoundingClientRect());
        // ¿el nombre invade el sitio de algún botón?
        const pisa = botones.some(b => rNom.right > b.left + 0.5 && rNom.left < b.right);
        return {
          renglones: linea,
          nomDerecha: Math.round(rNom.right),
          primerBoton: Math.round(Math.min(...botones.map(b => b.left))),
          pisa,
          botones: botones.length,
          anchoDoc: Math.round(document.documentElement.scrollWidth),
          // ¿los botones quedaron juntos a la derecha o repartidos?
          huecos: botones.slice(1).map((b, i) => Math.round(b.left - botones[i].right)),
        };
      }, [nombre]);

      const corto = nombre.length > 26 ? nombre.slice(0, 24) + '…' : nombre;
      console.log(`\n── ${ancho} px · «${corto}»`);
      ok('el nombre cabe en un renglón', medida.renglones === 1, `${medida.renglones} renglón(es)`);
      ok('no se mete debajo de los botones', !medida.pisa,
        `nombre acaba en ${medida.nomDerecha}, primer botón en ${medida.primerBoton}`);
      ok('nada se sale del ancho', medida.anchoDoc <= ancho, `doc ${medida.anchoDoc} vs ${ancho}`);
      ok('los botones quedan juntos, no repartidos',
        medida.huecos.every(h => h <= 14), `huecos: ${medida.huecos.join(', ')}`);
    }
  }
} catch (e) {
  console.error('\nse rompió:', e.message);
  fallos++;
} finally {
  await nav.close();
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\ntodo en verde');
process.exit(fallos ? 1 : 0);
