#!/usr/bin/env node
/* P09 · el ÚNICO paso de todo el árbol SFSP que necesita red, y sólo una vez.
 *
 * Deja en contracts/compilador/ el binario de solc fijado en compilador.json,
 * comprobando su SHA-256 antes de dejarlo escrito. Después de esto, compilar y
 * probar los contratos no vuelve a tocar la red nunca.
 *
 * Orden de búsqueda, de menos red a más:
 *   1. ya está en contracts/compilador/ y la huella cuadra  -> no hace nada;
 *   2. está en la caché de Hardhat de esta máquina          -> lo copia;
 *   3. una ruta local que le pases como argumento           -> la copia;
 *   4. binaries.soliditylang.org                            -> lo descarga.
 *
 * Un binario cuya huella no coincide NO se escribe: se descarta y se explica.
 * Sin dependencias: `fetch` viene en Node.
 *
 *   node compilador/preparar.mjs
 *   node compilador/preparar.mjs /ruta/a/un/solc/ya/descargado
 */

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const FIJADO = JSON.parse(readFileSync(join(aqui, 'compilador.json'), 'utf8'));
const DESTINO = join(aqui, FIJADO.archivo);

const huellaDe = (buf) => createHash('sha256').update(buf).digest('hex');

function instalar(buf, procedencia) {
  const huella = huellaDe(buf);
  if (huella !== FIJADO.sha256) {
    console.error(
      `\nEl binario obtenido de ${procedencia} NO es el fijado y no se instala.\n` +
        `  esperado: ${FIJADO.sha256}\n  obtenido: ${huella}\n`,
    );
    process.exit(1);
  }
  writeFileSync(DESTINO, buf);
  chmodSync(DESTINO, 0o755);
  console.log(`Instalado ${FIJADO.archivo} desde ${procedencia}.`);
  console.log(`Huella comprobada: ${huella}`);
  console.log('A partir de aquí, compilar y probar los contratos no necesita red.');
}

/* 1 · ya instalado */
if (existsSync(DESTINO) && huellaDe(readFileSync(DESTINO)) === FIJADO.sha256) {
  console.log(`Ya está: ${FIJADO.longVersion} con la huella correcta. No hace falta red.`);
  process.exit(0);
}

/* 2 · caché de Hardhat de esta máquina */
const cacheHardhat = join(
  homedir(),
  '.cache',
  'hardhat-nodejs',
  'compilers-v2',
  FIJADO.plataforma,
  FIJADO.archivo,
);
if (existsSync(cacheHardhat)) {
  instalar(readFileSync(cacheHardhat), `la caché local de Hardhat (${cacheHardhat})`);
  process.exit(0);
}

/* 3 · una ruta que nos pasen */
const rutaDada = process.argv[2];
if (rutaDada) {
  if (!existsSync(rutaDada)) {
    console.error(`No existe la ruta indicada: ${rutaDada}`);
    process.exit(1);
  }
  instalar(readFileSync(rutaDada), `la ruta indicada (${rutaDada})`);
  process.exit(0);
}

/* 4 · red. Aquí, y en ningún otro sitio del árbol. */
console.log(`Descargando ${FIJADO.archivo} de ${FIJADO.origen}`);
console.log('Este es el único paso que necesita red en todo el árbol SFSP.');

const respuesta = await fetch(FIJADO.origen);
if (!respuesta.ok) {
  console.error(`La descarga falló con HTTP ${respuesta.status}.`);
  console.error(
    'Alternativa sin red en esta máquina: conseguí el binario por otro medio y pasá su ruta:\n' +
      '  node compilador/preparar.mjs /ruta/al/solc',
  );
  process.exit(1);
}
instalar(Buffer.from(await respuesta.arrayBuffer()), FIJADO.origen);
