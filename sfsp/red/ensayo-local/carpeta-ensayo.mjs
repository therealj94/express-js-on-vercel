// SFSP-150 · La carpeta del ensayo local, y cuándo se puede borrar.
//
// `ensayo-besu-local.mjs` empieza cada vez con un génesis nuevo, así que vacía
// ENSAYO_DIR. Antes lo hacía con un `rm -rf` sobre lo que dijera la variable,
// sin mirar nada: con `ENSAYO_DIR=$HOME`, con la raíz del repositorio o con el
// `--data-path` de un nodo de la 5534 (base de datos y clave del validador
// incluidas) lo borraba entero antes de fallar por cualquier otra cosa. Y el
// runbook (RED-CERRADA.md §6) se corre en las mismas máquinas de operación que
// hablan con los nodos por túnel.
//
// Ahora solo se borra una carpeta que el propio ensayo reconoce como suya:
//
//   · si no existe, o existe y está vacía, se usa;
//   · si tiene algo, solo si lleva el marcador `.ensayo-sfsp150` que deja el
//     ensayo al crearla;
//   · nunca `/`, ni $HOME ni nada que lo contenga, ni el repositorio (dentro o
//     por encima), ni una carpeta con `database/` o `key` —la forma de un
//     `--data-path` de Besu—, lleve o no el marcador.
//
// No hay bandera para saltárselo: quien quiera reutilizar una carpeta que no es
// del ensayo, que la vacíe a mano sabiendo lo que borra.

import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MARCADOR = ".ensayo-sfsp150";
export const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** ¿`hija` es `madre` o está dentro de ella? */
const dentroDe = (hija, madre) => {
  const r = relative(madre, hija);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

const real = (ruta) => {
  try { return realpathSync(ruta); } catch { return resolve(ruta); }
};

/**
 * Por qué NO se puede usar `ruta` como carpeta del ensayo, o `null` si se puede.
 * No toca nada: solo mira.
 */
export function motivoParaNoUsar(ruta, { raizRepo = RAIZ_REPO, home = homedir() } = {}) {
  if (typeof ruta !== "string" || !ruta.trim()) return "ENSAYO_DIR vacío";
  const abs = real(resolve(ruta));
  const repo = real(raizRepo);
  const casa = home ? real(home) : null;
  if (abs === resolve("/")) return "es la raíz del sistema";
  if (casa && dentroDe(casa, abs)) return `es $HOME o la contiene (${casa})`;
  if (dentroDe(abs, repo)) return "está dentro del repositorio";
  if (dentroDe(repo, abs)) return "contiene el repositorio";
  if (!existsSync(abs)) return null;
  if (!statSync(abs).isDirectory()) return "existe y no es una carpeta";
  const hay = readdirSync(abs);
  if (hay.includes("database") || hay.includes("key")) {
    return "tiene database/ o key: parece el --data-path de un nodo Besu";
  }
  if (hay.length > 0 && !hay.includes(MARCADOR)) {
    return `no está vacía y no la creó el ensayo (falta ${MARCADOR})`;
  }
  return null;
}

/**
 * Deja `ruta` vacía y marcada como del ensayo, o lanza sin tocar nada.
 * Devuelve la ruta absoluta.
 */
export function prepararCarpetaEnsayo(ruta, opciones) {
  const motivo = motivoParaNoUsar(ruta, opciones);
  if (motivo) throw new Error(`ENSAYO_DIR=${ruta} no se usa: ${motivo}. Usá una carpeta vacía fuera del repositorio.`);
  const abs = real(resolve(ruta));
  if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
  mkdirSync(abs, { recursive: true });
  writeFileSync(join(abs, MARCADOR), "Carpeta del ensayo local SFSP-150 (sfsp/red/ensayo-local). Se borra entera en cada ensayo.\n");
  return abs;
}
