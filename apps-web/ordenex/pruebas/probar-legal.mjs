/* Los términos y el aviso de riesgo, leídos como TEXTO.
 *
 *   node apps-web/ordenex/pruebas/probar-legal.mjs
 *
 * Tres cosas, y las tres se comprueban contra los archivos y no contra una
 * opinión:
 *
 *  1. Las palabras que NO pueden aparecer. El reparto de términos es el del
 *     expediente de la Secretaría (14/08/2026): ORIGEN está REFERENCIADO al
 *     oro y nada más. Ni «regulado», ni «respaldado», ni «garantizado», ni
 *     una promesa de rendimiento. Se busca en legal.html, en los dos
 *     diccionarios (i18n.js, mercado.js) y en index.html.
 *  2. Lo que SÍ tiene que estar: la fórmula del gramín (31,1035 y 55), la
 *     frase «una referencia no es una promesa», las dos secciones con sus
 *     anclajes, los dos idiomas.
 *  3. El enlace: la portada y el riel enlazan legal.html#terminos y #riesgo,
 *     y la versión escrita en la página es LA MISMA que exige el API
 *     (infra/ordenex-api/lib/terminos.js). Dos versiones distintas serían
 *     una página que dice «vigente» de un texto que el API ya no acepta.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(WEB, '..', '..', 'infra', 'ordenex-api');

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (!ok && extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 300)}`);
};
const titulo = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 58 - q.length))}`);

const legal = await readFile(join(WEB, 'legal.html'), 'utf8');
const index = await readFile(join(WEB, 'index.html'), 'utf8');
const i18n = await readFile(join(WEB, 'i18n.js'), 'utf8');
const mercado = await readFile(join(WEB, 'mercado.js'), 'utf8');
const terminosApi = await readFile(join(API, 'lib', 'terminos.js'), 'utf8');

// El texto visible: sin comentarios HTML ni de CSS/JS, que no los lee nadie.
const visible = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

titulo('las palabras que la casa no puede decir');
{
  const prohibidas = [
    [/regulad[oa]s?\b/i, '«regulado/a/os»: la casa no está supervisada y no lo dice'],
    [/respaldad[oa]\b/i, '«respaldado/a»: ORIGEN está referenciado, no respaldado'],
    [/garantizad[oa]s?\b/i, '«garantizado/a»: nada está garantizado'],
    [/rentabilidad|rendimiento asegurado|guaranteed|backed by gold|regulated/i, 'promesas de rendimiento o «backed/regulated» en inglés'],
    [/va a subir|will rise|se revaloriza/i, 'proyecciones'],
  ];
  /* La única «respaldado» que el expediente admite es la de ONDK —un valor
     negociable respaldado por los activos del grupo, y así lo dice su ficha—.
     Se tolera SOLO en una frase que nombre a ONDK; en cualquier otra frase
     es la palabra que ORIGEN no puede llevar. */
  const respaldadoFueraDeOndk = (t) => t.split(/[.\n]/).find(f => /respaldad[oa]\b/i.test(f) && !/ONDK/.test(f));
  for (const [nombre, texto] of [['legal.html', legal], ['index.html', index], ['i18n.js', i18n], ['mercado.js', mercado]]) {
    const t = visible(texto);
    for (const [re, que] of prohibidas) {
      const m = /respaldad/.test(re.source) ? respaldadoFueraDeOndk(t) : t.match(re);
      decir(!m, `${nombre}: sin ${que}`, m ? `encontrado «${String(Array.isArray(m) ? m[0] : m).trim().slice(0, 120)}»` : '');
    }
  }
}

titulo('lo que sí tiene que estar');
{
  decir(/31,1035/.test(legal) && /55/.test(legal) && /÷ 31,1035 ÷ 55/.test(legal), 'la fórmula del gramín: onza ÷ 31,1035 ÷ 55');
  decir(/31\.1035/.test(legal), '…también en inglés, con punto');
  decir(/referenciado al oro/i.test(legal) && /referenced to gold/i.test(legal), 'ORIGEN «referenciado al oro» en los dos idiomas');
  decir(/Una referencia no es una promesa de valor/.test(legal) && /A reference is not a promise of value/.test(legal), 'y «una referencia no es una promesa de valor»');
  decir(/id="terminos"/.test(legal) && /id="riesgo"/.test(legal), 'las dos secciones con sus anclajes #terminos y #riesgo');
  decir(/id="terminos-en"/.test(legal) && /id="riesgo-en"/.test(legal), 'y sus gemelas en inglés');
  decir(/<main lang="es"/.test(legal) && /<main lang="en"/.test(legal), 'dos idiomas, uno por <main lang>');
  decir(/Podés perder todo/.test(legal) && /You can lose everything/.test(legal), 'el aviso de riesgo empieza por lo que importa');
  decir(/no se deshace/.test(legal) && /cannot be undone/.test(legal), 'y dice que un trato no se deshace');
  decir(/ORIGEN por unidad/.test(legal) && /ORIGEN per unit/.test(legal), 'y que el precio va en ORIGEN por unidad, no en dólares');
  decir(/connect-src 'none'/.test(legal), 'la página no habla con nadie (connect-src none)');
  decir(!/proyecci[oó]n(?!es en esta casa)/i.test(visible(legal).replace(/No hay proyecciones en esta casa/g, '')), 'sin proyecciones (salvo la frase que dice que no hay)');
}

titulo('enlazados y con la misma versión que el API');
{
  decir(/legal\.html#terminos/.test(visible(index)) && /legal\.html#riesgo/.test(visible(index)), 'el riel enlaza #terminos y #riesgo');
  decir(/data-t="pt\.legal"/.test(index), 'y la portada lleva el texto pt.legal');
  decir(/'pt\.legal': '.*legal\.html#terminos.*legal\.html#riesgo/.test(i18n), 'pt.legal (es) enlaza las dos secciones');
  decir(/'pt\.legal': '.*terms and conditions.*risk notice/.test(i18n), 'pt.legal (en) también');
  const vApi = (terminosApi.match(/TERMINOS_VERSION = '(\d{4}-\d{2}-\d{2})'/) || [])[1];
  const vWeb = [...legal.matchAll(/versi[oó]n (\d{4}-\d{2}-\d{2})/g)].map(m => m[1]);
  decir(Boolean(vApi), 'el API tiene una TERMINOS_VERSION con forma de fecha', vApi);
  decir(vWeb.length >= 2 && vWeb.every(v => v === vApi), `la página dice la MISMA versión (${vApi}) en los dos idiomas`, vWeb.join(' '));
  decir(/legal\.html#terminos/.test(terminosApi) && /legal\.html#riesgo/.test(terminosApi), 'y el API apunta a esos mismos anclajes');
}

console.log(malas ? `\n${malas} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(malas ? 1 : 0);
