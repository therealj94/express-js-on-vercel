/* LAS DOS COPIAS DE LA CABECERA TIENEN QUE SER LA MISMA, BYTE POR BYTE.
 *
 * Espejo de infra/aura/probar-cabecera.py, y a propósito: las dos suites
 * corren en sitios distintos del CI y cualquiera de las dos tiene que poder
 * ponerse roja sola. ULTRON va a Heroku y AU-RA al nodo, así que el mismo
 * texto vive en dos sitios — duplicación inevitable, pero VIGILADA. Si alguien
 * edita una y se olvida de la otra:
 *
 *   · se separa la verdad de la casa, y la copia vieja es la que un día le
 *     habla a alguien sobre su dinero;
 *   · y se rompe el prefijo compartido, que es lo que hace que cambiar de
 *     AU-RA a ULTRON cueste 1 segundo y no 6,5. Sin esto se rompe EN SILENCIO:
 *     nada falla, solo se pone lento y nadie sabe por qué.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

let fallos = 0;
const decir = (ok, que, extra = '') => { if (!ok) fallos++; console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + extra : ''}`); };

const COPIAS = {
  ULTRON: new URL('../lib/cabecera-de-la-casa.md', import.meta.url),
  'AU-RA': new URL('../../aura/cabecera-de-la-casa.md', import.meta.url),
};
const huella = {};
for (const [quien, ruta] of Object.entries(COPIAS)) {
  const hay = existsSync(ruta);
  decir(hay, `la copia de ${quien} está en su sitio`, hay ? '' : ruta.pathname);
  if (hay) huella[quien] = createHash('sha256').update(readFileSync(ruta)).digest('hex');
}
if (Object.keys(huella).length === 2) {
  const [a, b] = [huella.ULTRON, huella['AU-RA']];
  decir(a === b, 'las dos copias son IDÉNTICAS byte por byte',
    a === b ? '' : `ULTRON ${a.slice(0, 16)} · AU-RA ${b.slice(0, 16)} — copiar una sobre la otra`);
}

/* Y que el prompt de ULTRON EMPIECE con ella, en los dos modos. Una letra
   delante y no coincide nada: el prefijo compartido se pierde entero. */
const cab = readFileSync(COPIAS.ULTRON, 'utf8').trim();
process.env.ANTHROPIC_API_KEY = 'fingida';
delete process.env.MONGODB_URI;
globalThis.fetch = async () => { throw new Error('sin red'); };
const { createRequire } = await import('node:module');
const cerebro = createRequire(import.meta.url)('../lib/cerebro.js');
const uno = { nombre: 'José', correo: 'j@ordenglobal.org', rol: 'presidente' };
for (const modo of ['texto', 'voz']) {
  const b = cerebro._adentro.sistema({ miembro: uno, memorias: [], estadoVivo: null, secciones: [], vozCasa: [], chico: true, modo });
  decir(b[0].text.startsWith(cab), `en modo ${modo}, el prompt arranca con la cabecera y sin nada delante`);
}

/* Lo que protege a la gente tiene que seguir escrito. Una cabecera a la que le
   quitaron sus reglas comparte prefijo igual de bien, así que la prueba de
   arriba no se enteraría. */
for (const [texto, que] of [
  ['REFERENCIADOS al', 'dice «referenciados»'],
  ['Nunca se dice «respaldados»', 'y que nunca se dice «respaldados»'],
  ['no está «regulada» ni «registrada»', 'que no está regulada ni registrada'],
  ['AuCorp NO ES UN BANCO', 'que AuCorp no es un banco'],
  ['SEC', 'y lleva el incidente de la SEC, que es por qué existe la regla'],
  ['LA CADENA 5550', 'que la cadena viva es la 5550'],
  ['NO SE MUEVE DINERO', 'y que no se mueve dinero'],
]) decir(cab.includes(texto), que);

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
