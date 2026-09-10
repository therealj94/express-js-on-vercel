/* De donde sale el navegador para las pruebas.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * Treinta y siete pruebas del repositorio llevan escrita a mano la ruta
 * `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Eso funciona en la
 * maquina donde se escribieron y en ningun otro sitio: ni en el portatil de
 * alguien que entre maniana, ni en un CI, ni cuando esa maquina actualice el
 * navegador y le cambie el numero.
 *
 * Ya pego una vez: la version de Playwright del proyecto esperaba el build 1234
 * y en el contenedor habia el 1194, asi que todas se caian pidiendo que se
 * bajara otro navegador.
 *
 * TODA PRUEBA NUEVA USA ESTO. Las treinta y siete viejas hay que migrarlas, y
 * mientras tanto el flujo de trabajo les pone un enlace donde lo buscan — eso
 * esta dicho en `.github/workflows/pruebas.yml` y es un puente, no la solucion.
 *
 * COMO SE USA
 *
 *   import { abrirNavegador } from '../navegador.mjs';
 *   const nav = await abrirNavegador();
 *
 * Y si hace falta pasarle algo mas:
 *
 *   const nav = await abrirNavegador({ slowMo: 50 });
 */

import { chromium } from 'playwright';
import { existsSync } from 'fs';

/* En orden de preferencia, y cada uno por un motivo:
     1. lo que diga la variable, para que quien tenga el navegador en otro sitio
        no tenga que tocar codigo;
     2. el que trae Playwright, que es el que de verdad cuadra con la version
        instalada — este es el bueno y deberia ganar casi siempre;
     3. los dos del contenedor de trabajo, para que lo de hoy siga corriendo;
     4. nada, y que Playwright busque solo. */
function candidatos() {
  const lista = [];
  if (process.env.OG_CHROMIUM) lista.push(process.env.OG_CHROMIUM);
  try { lista.push(chromium.executablePath()); } catch { /* sin navegador bajado */ }
  lista.push('/opt/pw-browsers/chromium');
  lista.push('/opt/pw-browsers/chromium-1194/chrome-linux/chrome');
  return lista;
}

/** La ruta del navegador, o `null` para que Playwright decida. */
export function rutaDelNavegador() {
  for (const ruta of candidatos()) {
    if (ruta && existsSync(ruta)) return ruta;
  }
  return null;
}

/**
 * Abre un Chromium listo para probar.
 *
 * `--no-sandbox` va porque en un contenedor sin usuario propio el aislamiento
 * de Chromium no arranca. No se pone por comodidad: sin eso, el navegador no
 * abre y la prueba no dice por que.
 */
export async function abrirNavegador(opciones = {}) {
  const ruta = rutaDelNavegador();
  return chromium.launch({
    args: ['--no-sandbox'],
    ...(ruta ? { executablePath: ruta } : {}),
    ...opciones,
  });
}
