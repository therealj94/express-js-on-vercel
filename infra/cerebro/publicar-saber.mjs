/* De lo que Genesis sabe, lo poco que AU-RA puede decir.
 *
 *   node infra/cerebro/publicar-saber.mjs           publica
 *   node infra/cerebro/publicar-saber.mjs --probar  solo comprueba, no escribe
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARCHIVO ES EL SITIO DONDE VIVE LA FRONTERA
 *
 * Genesis —el cerebro interno— sabe TODO: la infraestructura, los pendientes,
 * lo que se está arreglando. AU-RA habla con cualquiera que abra la billetera.
 * Entre las dos cosas tiene que haber una puerta, y una puerta solo sirve si
 * está en UN sitio y se cruza de UNA manera.
 *
 * Esa puerta es este programa. Lee el saber entero, se queda únicamente con lo
 * que una persona marcó `publico: true` y firmó, y escribe un archivo nuevo con
 * eso y nada más.
 *
 * SE FILTRA AL PUBLICAR, NO AL LEER
 *
 * La tentación fácil es mandarle a AU-RA el saber completo con una marca de
 * «esto no lo enseñes». Eso no es una frontera: es el texto interno viajando a
 * todos los navegadores del mundo, a un clic de «ver código fuente» de
 * cualquiera. Lo interno no sale de aquí. Lo que se escribe abajo se escribe
 * desde cero, ficha por ficha, con las claves contadas.
 *
 * LO PRIVADO ES EL VALOR DE PARTIDA
 *
 * Una ficha sin `publico` no se publica. Con `publico` en cualquier cosa que no
 * sea exactamente `true` —la cadena "true", 1, "sí"— tampoco. No hay
 * interpretación amable: o está marcada, o no sale.
 *
 * Y AUNQUE ESTE MARCADA, HAY COSAS QUE NO SALEN
 *
 * Una persona puede equivocarse y marcar como pública una ficha donde se coló
 * una clave, una dirección de servidor o una frase semilla. El barrido de abajo
 * corta la publicación entera si encuentra algo así — no la ficha: la
 * publicación. Que falle ruidoso y que nadie pueda ignorarlo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ORIGEN = join(AQUI, 'conocimiento', 'saber.json');
const DESTINO = join(AQUI, '..', '..', 'apps-web', 'veta-wallet', 'saber.js');
const soloProbar = process.argv.includes('--probar');

const problemas = [];
const fallar = (m) => problemas.push(m);

// ── lo que jamás puede salir, esté marcado como esté ────────────────────────
// Se mira el TEXTO que se va a publicar, no el nombre del campo: una clave no
// avisa de que lo es. Los patrones son deliberadamente amplios; un falso
// positivo cuesta reescribir una frase, y un falso negativo cuesta una llave.
const PROHIBIDO = [
  [/\b0x[a-fA-F0-9]{64}\b/, 'algo con pinta de llave privada'],
  [/\b[A-Za-z0-9_-]{32,}\b/, 'una cadena larga con pinta de clave o token'],
  [/\b(contrase[nñ]a|password|secreto|api[_-]?key|token|seed|frase semilla)\s*[:=]/i, 'un campo de credencial'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'una llave de AWS'],
  [/\bi-0[a-f0-9]{16}\b/, 'el identificador de una máquina de AWS'],
  [/\b\d{1,3}(\.\d{1,3}){3}\b/, 'una dirección IP'],
  [/\.(internal|local|onrender\.com|herokuapp\.com)\b/i, 'un nombre de servidor interno'],
];

// ── leer y validar ──────────────────────────────────────────────────────────
let bruto;
try {
  bruto = JSON.parse(readFileSync(ORIGEN, 'utf8'));
} catch (e) {
  console.error(`No se pudo leer el saber: ${e.message}`);
  process.exit(1);
}

const fichas = Array.isArray(bruto.fichas) ? bruto.fichas : [];
if (!fichas.length) fallar('el saber está vacío');

const vistos = new Set();
for (const f of fichas) {
  const donde = `ficha «${f.id || '(sin id)'}»`;
  if (!f.id || typeof f.id !== 'string') fallar(`${donde}: le falta el id`);
  if (vistos.has(f.id)) fallar(`${donde}: el id está repetido`);
  vistos.add(f.id);
  if (typeof f.es !== 'string' || !f.es.trim()) fallar(`${donde}: le falta el texto en español`);
  // Los dos idiomas o ninguno: media ficha traducida es AU-RA contestando en
  // español a quien preguntó en inglés, que es peor que no saber.
  if (typeof f.en !== 'string' || !f.en.trim()) fallar(`${donde}: le falta el texto en inglés`);
  if (!Array.isArray(f.palabras) || !f.palabras.length) fallar(`${donde}: sin palabras no hay forma de encontrarla`);

  // Marcar algo como público es un acto de alguien, y se firma.
  if (f.publico === true) {
    if (!f.revisadoPor || !String(f.revisadoPor).includes('@')) {
      fallar(`${donde}: está marcada como pública y nadie la firmó (revisadoPor)`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.revisadoEn || ''))) {
      fallar(`${donde}: está marcada como pública y no dice cuándo se revisó`);
    }
    for (const texto of [f.es, f.en, f.tema || '']) {
      for (const [re, que] of PROHIBIDO) {
        if (re.test(texto)) fallar(`${donde}: es pública y lleva ${que} — no se publica nada hasta arreglarlo`);
      }
    }
  } else if (f.publico !== false && f.publico !== undefined) {
    // Ni "true", ni 1, ni "sí". O es el booleano, o no cuenta.
    fallar(`${donde}: «publico» tiene que ser true o false, no ${JSON.stringify(f.publico)}`);
  }
}

if (problemas.length) {
  console.error('\nNo se publica nada. Hay que arreglar esto primero:\n');
  for (const p of problemas) console.error('  · ' + p);
  console.error('');
  process.exit(1);
}

// ── quedarse con lo público, campo por campo ────────────────────────────────
// Se construye una ficha NUEVA con las claves contadas. Nada de copiar la
// original quitando cosas: lo que no se nombra aquí, no existe al otro lado.
const publicas = fichas
  .filter((f) => f.publico === true)
  .map((f) => ({
    id: f.id,
    tema: f.tema || f.id,
    palabras: f.palabras.map((p) => String(p).toLowerCase()),
    es: f.es.trim(),
    en: f.en.trim(),
  }));

const internas = fichas.length - publicas.length;

const salida = `/* EL SABER PÚBLICO DE AU-RA. NO SE EDITA A MANO.
 *
 * Lo genera infra/cerebro/publicar-saber.mjs desde el saber de Genesis
 * (infra/cerebro/conocimiento/saber.json), que es el único sitio donde se
 * escribe. Aquí solo está lo que una persona marcó como público y firmó.
 *
 * Si hace falta que AU-RA sepa algo nuevo: se escribe la ficha allá, se corre
 * el publicador, y el cambio queda en un commit que alguien puede leer.
 *
 * ${publicas.length} fichas públicas · ${internas} se quedaron en casa.
 */
window.AURA_SABER = ${JSON.stringify(publicas, null, 2)};
`;

// ── el cerrojo final: mirar lo que se va a escribir, no lo que se pretendía ──
// Todo lo anterior comprueba las fichas una a una. Esto comprueba EL ARCHIVO,
// que es lo que de verdad llega al navegador. Si algo interno se hubiera colado
// por un fallo del programa de arriba, aquí se ve.
for (const f of fichas.filter((x) => x.publico !== true)) {
  const trozo = String(f.es || '').slice(0, 40);
  if (trozo && salida.includes(trozo)) {
    console.error(`\nALTO: texto de la ficha interna «${f.id}» apareció en lo que se iba a publicar.`);
    process.exit(1);
  }
}

if (soloProbar) {
  console.log(`Todo en orden · ${publicas.length} públicas · ${internas} internas · no se escribió nada`);
  process.exit(0);
}

writeFileSync(DESTINO, salida);
console.log(`Publicado: ${publicas.length} fichas para AU-RA · ${internas} se quedaron en Genesis`);
console.log(`  ${DESTINO}`);
