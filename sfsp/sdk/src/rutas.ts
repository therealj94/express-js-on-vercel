/* Localizar la raíz del árbol SFSP sin depender de cuántas carpetas hay que
 * subir (P07).
 *
 * Las pruebas que leen `DECISIONES-SFSP.json` lo buscaban con una ruta relativa
 * contada a mano desde `dist/test`. Eso se rompe en cuanto alguien cambia la
 * salida del compilador o corre las pruebas desde otro sitio, y fue justamente
 * lo que impidió al auditor ejecutar cuatro de las pruebas del SDK.
 *
 * Buscar hacia arriba el archivo que marca la raíz funciona desde `src`, desde
 * `dist`, desde una copia y desde cualquier profundidad. */

import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARCA = 'DECISIONES-SFSP.json';

/**
 * Sube desde `desde` hasta encontrar la carpeta que contiene el archivo marca.
 * Devuelve null si no aparece: quien llame decide si eso es un error.
 */
export function raizSFSP(desde: string = dirname(fileURLToPath(import.meta.url))): string | null {
  let actual = desde;
  const tope = parse(actual).root;
  for (;;) {
    if (existsSync(join(actual, MARCA))) return actual;
    if (actual === tope) return null;
    const padre = dirname(actual);
    if (padre === actual) return null;
    actual = padre;
  }
}

/** Ruta del archivo de decisiones, o null si este árbol no lo tiene. */
export function rutaDeDecisiones(desde?: string): string | null {
  const raiz = raizSFSP(desde);
  return raiz ? join(raiz, MARCA) : null;
}
