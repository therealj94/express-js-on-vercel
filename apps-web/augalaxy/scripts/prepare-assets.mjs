/* RECURSOS DE TERCEROS: VERIFICAR SIEMPRE, DESCARGAR SOLO SI HACE FALTA, Y
   NUNCA TUMBAR LA COMPILACIÓN POR UNA DESCARGA AJENA.

   Este script bajaba las texturas de solarsystemscope.com en cada compilación
   y abortaba si el archivo no coincidía con su huella. El sitio corta por
   ritmo: cuando lo hace devuelve una página HTML de captcha con estado 202, la
   huella no coincide y la compilación moría con «Asset checksum mismatch:
   textures/jupiter.jpg», un mensaje que además miente —no llegó una textura
   distinta, llegó un captcha—. En una máquina de Vercel eso es un despliegue
   roto a ratos y sin explicación.

   Tres reglas ahora:
     1. Si el archivo ya está en disco con su huella exacta, no se toca la red.
     2. GALAXY_ASSET_BASE permite servir los nueve archivos desde un bucket
        propio (…/textures/mars.jpg, …/vision/hand_landmarker.task). Se intenta
        primero; el origen oficial queda como respaldo. Con esa variable puesta
        en el panel, la compilación no vuelve a depender de un tercero.
     3. Una descarga que no llega (red caída, 404, captcha, HTML en vez de
        imagen) se avisa y se sigue: el motor dibuja planetas por procedimiento
        cuando falta su mapa, y AirTouch avisa por su cuenta. Solo se aborta si
        llega una imagen de verdad cuya huella NO es la esperada, que eso sí es
        un problema de integridad. */
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mirror = (process.env.GALAXY_ASSET_BASE || '').replace(/\/+$/, '');
const sha = b => createHash('sha256').update(b).digest('hex');
const missing = [];

const planets = {
  saturn: '54a900ca9bf7ab62e70f862852759abdf342e6d6436a95a2fe9ebdb6bcd3bbac',
  jupiter: 'b0f04d005350252636b0e3396fc592548cbd9e9126b269d32d5c6abd4b0e4f2b',
  earth_daymap: '767ee1dc6eb3802699bfccf6f264880f8acd0b80de3191cd24984fe279b07b7c',
  mars: '2d187f3e77a98eaa8cea5f4cc722f633c122ef170b9e94ace6b5fb6cbc3f8e01',
  moon: '2764ba6535ea0481a062846ee033cc7a909dae05b31a8fd13f3e98f3a7fd92bd',
  earth_clouds: 'fffd7f68d41b37274822150e54a6ef605af1d3ec35624d9f628c3b896bfa42ed',
};

/* Un intento de descarga. Devuelve los bytes, o el motivo por el que no hay
   bytes utilizables. Distinguir «no me lo sirvieron» de «me sirvieron otra
   cosa» es justo lo que faltaba. */
async function fetchOnce(url) {
  let response;
  try {
    response = await fetch(url, {signal: AbortSignal.timeout(60000), redirect: 'follow'});
  } catch (error) {
    return {reason: 'sin respuesta (' + (error?.message || error) + ')'};
  }
  if (!response.ok) return {reason: 'respuesta ' + response.status};
  const type = (response.headers.get('content-type') || '').toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());
  const looksLikePage = type.includes('html') || bytes.subarray(0, 1).toString() === '<';
  if (looksLikePage) return {reason: 'el servidor devolvió una página, no el archivo (límite de descargas o captcha)'};
  if (!bytes.length) return {reason: 'archivo vacío'};
  return {bytes, type};
}

async function asset(file, url, expected) {
  /* Los mapas originales NO se publican: son el respaldo con licencia del que
     salen los WebP que sí se sirven (scripts/derivar-texturas.py). */
  const dest = path.join(root, file.startsWith('textures/') ? 'assets-fuente' : 'public', file);
  let existing;
  try { existing = await readFile(dest); } catch { /* todavía no está */ }
  if (existing && sha(existing) === expected) return;

  const sources = mirror ? [mirror + '/' + file, url] : [url];
  const problems = [];
  for (const source of sources) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await fetchOnce(source);
      if (result.bytes) {
        if (sha(result.bytes) !== expected) {
          /* Llegó un archivo real y no es el nuestro: eso no se instala en
             silencio ni se ignora. */
          throw new Error(
            'La huella de ' + file + ' no coincide con la esperada (origen: ' + source + '). ' +
            'Si el proveedor cambió el archivo, revisa el nuevo antes de actualizar su SHA-256.'
          );
        }
        await mkdir(path.dirname(dest), {recursive: true});
        await writeFile(dest, result.bytes);
        return;
      }
      problems.push(source + ': ' + result.reason);
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 4000));
    }
  }
  missing.push({file, problems: [...new Set(problems)]});
}

await Promise.all(
  Object.entries(planets).map(([name, hash]) =>
    asset('textures/' + name + '.jpg', 'https://www.solarsystemscope.com/textures/download/2k_' + name + '.jpg', hash)
  )
);
await asset('textures/sun.jpg', 'https://www.solarsystemscope.com/textures/download/2k_sun.jpg', 'ff0f076ba65e03b5ab518451bc96699325be38e3ccbdd5869ee1c00f3a0c8816');
await asset('textures/starmap.jpg', 'https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003895/starmap_4k.jpg', '0b33503895abebeb92fd89d3332e3ca62515b8cc458d243f208e4ca5d8c1452d');
await asset('textures/whirlpool.jpg', 'https://cdn.esahubble.org/archives/images/publicationjpg/heic0506a.jpg', '7b13a932bcf54653c591d369e8d1c4cbdbeb693ecc468242facb239fde52e4c2');
await asset('vision/hand_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task', 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1');

/* El WASM de MediaPipe viaja en node_modules: se copia, no se descarga. */
try {
  const wasm = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
  await mkdir(path.join(root, 'public/vision'), {recursive: true});
  for (const file of await readdir(wasm)) await copyFile(path.join(wasm, file), path.join(root, 'public/vision', file));
} catch (error) {
  missing.push({file: 'vision/wasm', problems: ['no se pudo copiar desde node_modules (' + (error?.message || error) + ')']});
}

const derivadas = await readdir(path.join(root, 'public/textures')).catch(() => []);
const sinDerivar = Object.keys(planets).concat('sun', 'starmap', 'whirlpool').filter(n => !derivadas.includes(n + '.webp'));
if (sinDerivar.length) missing.push({file: 'public/textures/*.webp', problems: ['faltan ' + sinDerivar.join(', ') + ': corré scripts/derivar-texturas.py']});

if (!missing.length) {
  console.log('Texturas planetarias y recursos locales de AirTouch verificados.');
} else {
  console.warn('\n⚠️  Faltan ' + missing.length + ' recurso(s) de terceros. La compilación SIGUE:');
  console.warn('   los planetas se dibujan por procedimiento y AirTouch avisa si no encuentra su modelo.\n');
  for (const {file, problems} of missing) console.warn('   · ' + file + '\n     ' + problems.join('\n     '));
  console.warn(
    '\n   Para que esto no dependa de un tercero: consigue los archivos una vez, súbelos a un\n' +
    '   bucket propio con la misma estructura y define GALAXY_ASSET_BASE en el entorno de\n' +
    '   compilación. Las huellas SHA-256 se siguen verificando igual.\n'
  );
}
