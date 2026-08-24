/* LO QUE DE VERDAD ESTÁ PUBLICADO.
 *
 *   node pruebas/sso-vivo.mjs
 *
 * Las otras pruebas comprueban el código de esta carpeta. Esta comprueba lo que
 * los servidores están SIRVIENDO, que no es lo mismo: entre las dos cosas hay
 * un despliegue que puede no haber corrido, haber corrido a medias, o haber
 * subido a la pizarra equivocada. Justo ahí vivía el fallo de Ordenex — el
 * arreglo estaba escrito y la gente seguía viendo la página en blanco.
 *
 * Baja el código publicado de cada casa y comprueba tres cosas:
 *
 *  1. QUE LAS DOS ESTÉN SELLADAS. Un sello sin poner («sin-sellar») significa
 *     que subió algo que no pasó por subir.py, y entonces nada de lo de abajo
 *     dice nada.
 *  2. QUE LAS DOS PUNTAS DEL SSO ESTÉN EN SU SITIO. Este arreglo solo funciona
 *     con las dos publicadas: la wallet acuñando y Ordenex pidiendo. Una sola
 *     al día es exactamente el estado en el que parece arreglado y no lo está.
 *  3. QUE ORDENEX RECONOZCA LAS TRES DIRECCIONES DE LA WALLET. Reconociendo
 *     solo una, entrar desde ensayo se cae al piso en silencio.
 *
 * Y de paso comprueba que las dos puertas del SSO —la que acuña y la que
 * canjea— contesten, porque un circuito perfecto contra un servidor dormido
 * también deja a alguien mirando «Entrando…».
 */

const CASAS = {
  'wallet · producción': 'https://app.vetawallet.com',
  'wallet · ensayo': 'https://main.d289v5ffkexk23.amplifyapp.com',
  'ordenex': 'https://ordenexchange.link',
};

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };

const traer = async (u) => {
  /* La pregunta de más al final es para saltarse cualquier copia guardada por
     el camino: leer la de ayer y darla por buena sería el mismo fallo que esta
     prueba existe para encontrar. */
  const r = await fetch(`${u}/app.js?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
};

const sello = (src) => (src.match(/const (?:VETA|ONX)_V = '([^']*)'/) || [])[1] || null;
const fecha = (src) => (src.match(/const (?:VETA|ONX)_FECHA = '([^']*)'/) || [])[1] || null;

console.log('\n── qué está sirviendo cada casa ────────────────────────────');
const src = {};
for (const [nombre, url] of Object.entries(CASAS)) {
  try {
    src[nombre] = await traer(url);
    const v = sello(src[nombre]);
    ok(nombre, !!v && v !== 'sin-sellar', `${v} · ${fecha(src[nombre])}`);
  } catch (e) {
    ok(nombre, false, `no contesta (${e.message})`);
  }
}

console.log('\n── ensayo y producción, la misma copia ─────────────────────');
{
  const a = src['wallet · producción'] && sello(src['wallet · producción']);
  const b = src['wallet · ensayo'] && sello(src['wallet · ensayo']);
  /* Si no coinciden no está necesariamente mal —se puede estar probando algo
     en ensayo a propósito—, pero hay que saberlo: es la explicación de la
     mitad de los «a mí me funciona». */
  ok('van iguales', !!a && a === b, a === b ? a : `producción ${a} · ensayo ${b}`);
}

console.log('\n── las dos puntas del SSO, publicadas ──────────────────────');
{
  const w = src['wallet · producción'] || '';
  const o = src['ordenex'] || '';
  ok('la wallet escucha el pedido', w.includes("'sso-pedido'"));
  ok('y acuña el token', w.includes('/genesis/sso/token'));
  ok('y solo le contesta al origen que tiene enmarcado', w.includes('ev.origin !== suyo'));
  ok('Ordenex pide en vez de viajar', o.includes("og: 'sso-pedido'"));
  ok('y comprueba de dónde viene la llave', o.includes('CASAS_MADRE.includes(ev.origin)'));

  const casas = [...new Set(o.match(/https:\/\/(?:app\.vetawallet\.com|main\.d[0-9a-z]+\.amplifyapp\.com)/g) || [])];
  ok('reconoce las tres direcciones de la wallet', casas.length >= 3, casas.join(' '));
}

console.log('\n── la ficha de versión, publicada ──────────────────────────');
{
  const w = src['wallet · producción'] || '';
  ok('la fila está en Ajustes', w.includes('VETA.versionMirar()'));
  ok('y el lector suelto también', w.includes('const version = ()'));
  ok('con el botón que tira la copia vieja', w.includes('ver-refrescar'));
}

console.log('\n── y los servidores contestan ──────────────────────────────');
{
  /* Sin sesión, las dos puertas tienen que decir que no —401—, que es la
     respuesta correcta. Lo que se está comprobando no es el permiso: es que la
     puerta EXISTE. Un 404 aquí significa que el circuito termina en una pared
     por mucho que el navegador haga todo bien. */
  const puertas = [
    ['la wallet acuña', 'https://vetawallet-1a2e38ac52b1.herokuapp.com/genesis/sso/token'],
    ['Ordenex canjea', 'https://ordenex-api-ba4b27b8b51a.herokuapp.com/auth/sso'],
  ];
  for (const [nombre, u] of puertas) {
    try {
      const r = await fetch(u, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: '{"token":"x"}' });
      ok(nombre, r.status === 401, `${r.status} ${r.status === 401 ? '(rechaza, que es lo correcto)' : ''}`);
    } catch (e) { ok(nombre, false, e.message); }
  }
}

console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
