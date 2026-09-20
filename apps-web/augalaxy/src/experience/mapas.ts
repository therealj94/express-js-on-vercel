import {Cache,Texture,TextureLoader,SRGBColorSpace} from 'three';
import {assetURL} from './assets';

/* UN MAPA SE BAJA UNA VEZ.
 *
 * Medido en producción: la primera carga se traía 21,4 MB de texturas y CADA
 * UNA DOS VECES. La causa no era el tamaño sino la caché: three trae la suya
 * APAGADA de fábrica, y aquí cada componente hacía su propio TextureLoader.
 * Cuatro mundos comparten el mapa de la luna, el sol lo piden el núcleo y su
 * planeta, la galaxia M51 la piden el fondo y el retrato: cada uno se bajaba
 * sus megas por su cuenta. Encender la caché y compartir el cargador es la
 * mitad del peso de la primera visita.
 *
 * Las texturas se sirven en WebP a 1K: un planeta ocupa ochenta píxeles en un
 * teléfono y estábamos mandando JPEG de 2048. Los originales, que son los que
 * llevan el crédito y la licencia, viven en `assets-fuente/` y no se publican;
 * de ahí salen estos con `scripts/derivar-texturas.py`. */
Cache.enabled = true;
const cargador = new TextureLoader();

export function mapa(nombre: string, alLlegar?: (t: Texture) => void) {
  return cargador.load(assetURL('textures/' + nombre + '.webp'), t => {
    t.colorSpace = SRGBColorSpace;
    alLlegar?.(t);
  }, undefined, () => { /* sin mapa, el planeta se dibuja por procedimiento */ });
}

/* EL ESPACIO PROFUNDO NO SE BAJA PARA ENSEÑAR UN LOGIN. La galaxia M51 (4 MB)
   solo se ve si alguien entra a «Galaxias», y el mapa estelar es un fondo al
   13% de opacidad: ninguno de los dos merece estar en el camino de la primera
   pantalla. Se piden cuando hacen falta, y una sola vez. */
const pedidos = new Set<string>();
export function mapaDiferido(nombre: string, alLlegar: (t: Texture) => void) {
  if (pedidos.has(nombre)) return;
  pedidos.add(nombre);
  mapa(nombre, alLlegar);
}
export function olvidarDiferidos() { pedidos.clear(); }
