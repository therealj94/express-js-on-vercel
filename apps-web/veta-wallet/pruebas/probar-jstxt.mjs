/* Prueba del escapador de argumentos en manejadores (jsTxt) de app.js.
 *
 * El fallo que vigila: un dato dentro de onclick="VETA.algo('AQUI')" pasa por
 * DOS lectores —el de HTML, que des-escapa las entidades, y después el de
 * JavaScript—. esc() escapa para el primero, así que escribe &#39; y el lector
 * de HTML lo devuelve a ' antes de que el JS lo lea: la comilla cierra la
 * cadena y lo que sigue se ejecuta. Con un correo del relevo (que puede traer
 * comillas) eso ejecuta código en el dominio de la billetera.
 *
 * Aquí se reproduce la cadena entera: se arma el atributo tal como lo escribe
 * app.js, se des-escapa como lo haría el navegador, y se COMPILA el resultado
 * de verdad comprobando que la función recibe el dato ENTERO y que no se
 * ejecuta nada de más.
 *
 * Sin dependencias: solo node.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = readFileSync(join(aqui, '..', 'app.js'), 'utf8');

// Se sacan las DOS funciones del código real: si alguien las cambia, esta
// prueba lo prueba a él, no a una copia que se quedó vieja.
function sacar(nombre) {
  const i = fuente.indexOf(`  const ${nombre} = s =>`);
  if (i < 0) throw new Error(`no encontré ${nombre} en app.js`);
  const fin = fuente.indexOf('\n\n', i);
  return fuente.slice(i, fin).replace(/^\s*const \w+ = /, '').replace(/;\s*$/, '');
}
// eslint-disable-next-line no-eval
const esc = eval(`(${sacar('esc')})`);
// eslint-disable-next-line no-eval
const jsTxt = eval(`(${sacar('jsTxt')})`);

/* Lo que hace el lector de HTML con el valor de un atributo antes de que el
   JS lo vea. Solo las cinco entidades que escribe esc(): con eso alcanza para
   demostrar el punto. */
const comoLoLeeElNavegador = attr => attr
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

const CASOS = [
  ['correo normal', 'ana@ordenkapital.com'],
  ['apóstrofo legítimo', "o'brien@example.com"],
  ['cierre de cadena + código', "x');alert(document.domain);//@ev.il"],
  ['comillas dobles', 'a"b@x.com'],
  ['etiqueta HTML', '<img src=x onerror=alert(1)>@x.com'],
  ['barra invertida', 'a\\b@x.com'],
  ['salto de línea', 'a\nb@x.com'],
  ['separador de línea unicode', 'a b@x.com'],
  ['ampersand y entidad', 'a&amp;#39;b@x.com'],
  ['acentos y ñ', 'añó@ordenkapital.com'],
];

let fallos = 0;

for (const [nombre, dato] of CASOS) {
  // Lo que app.js escribe hoy
  const atributo = `VETA.chatAbrir(${jsTxt(dato)})`;
  const codigo = comoLoLeeElNavegador(atributo);

  let recibido = null, ejecutadoDeMas = false;
  const VETA = { chatAbrir: v => { recibido = v; } };
  const alert = () => { ejecutadoDeMas = true; };
  const document = { domain: 'www.vetawallet.com' };

  try {
    // eslint-disable-next-line no-new-func
    new Function('VETA', 'alert', 'document', codigo)(VETA, alert, document);
  } catch (e) {
    console.log(`✗ ${nombre}: el manejador ni siquiera compila — ${e.message}`);
    fallos++;
    continue;
  }

  if (ejecutadoDeMas) {
    console.log(`✗ ${nombre}: SE EJECUTÓ CÓDIGO INYECTADO`);
    fallos++;
  } else if (recibido !== dato) {
    console.log(`✗ ${nombre}: llegó ${JSON.stringify(recibido)} en vez de ${JSON.stringify(dato)}`);
    fallos++;
  } else {
    console.log(`✓ ${nombre}`);
  }
}

/* Y la contraprueba: con el esc() de antes, el caso de ataque SÍ se ejecuta.
   Si algún día esto deja de ser verdad, es que esc() cambió y esta prueba
   necesita otra explicación. */
{
  const codigoViejo = comoLoLeeElNavegador(`VETA.chatAbrir('${esc("x');alert(1);//@ev.il")}')`);
  let ejecutado = false;
  try {
    // eslint-disable-next-line no-new-func
    new Function('VETA', 'alert', codigoViejo)({ chatAbrir: () => {} }, () => { ejecutado = true; });
  } catch { /* también valdría: romper el manejador ya era un fallo */ }
  console.log(ejecutado
    ? '✓ contraprueba: con el esc() de antes el ataque SÍ se ejecutaba'
    : '✗ contraprueba: no se reprodujo el fallo viejo — revisar la prueba');
  if (!ejecutado) fallos++;
}

if (fallos) {
  console.log(`\n${fallos} FALLO(S)`);
  process.exit(1);
}
console.log('\nTODO BIEN: el dato llega entero y nada se ejecuta de más.');
