// La carpeta del ensayo local solo se borra si es del ensayo.
//
//   node --test sfsp/red/ensayo-local/carpeta-ensayo.test.mjs
//
// Todo en carpetas temporales; el `home` y la raíz del repositorio se le pasan
// a la función para no depender de la máquina.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARCADOR, RAIZ_REPO, motivoParaNoUsar, prepararCarpetaEnsayo } from "./carpeta-ensayo.mjs";

const base = mkdtempSync(join(tmpdir(), "ensayo-carpeta-"));
test.after(() => rmSync(base, { recursive: true, force: true }));

const HOME = join(base, "casa");
mkdirSync(HOME, { recursive: true });
const REPO = join(base, "repo");
mkdirSync(join(REPO, "sfsp"), { recursive: true });
writeFileSync(join(REPO, "LEEME.md"), "x");
const op = { home: HOME, raizRepo: REPO };

test("el --data-path de un nodo NO se borra (antes se borraba entero)", () => {
  const nodo = join(base, "nodo-5534");
  mkdirSync(join(nodo, "database"), { recursive: true });
  writeFileSync(join(nodo, "database", "000001.sst"), "datos");
  writeFileSync(join(nodo, "key"), "clave-del-validador");
  assert.throws(() => prepararCarpetaEnsayo(nodo, op), /data-path/);
  assert.ok(existsSync(join(nodo, "key")) && existsSync(join(nodo, "database", "000001.sst")), "sigue todo ahí");
  // Ni aunque alguien le haya puesto el marcador.
  writeFileSync(join(nodo, MARCADOR), "");
  assert.throws(() => prepararCarpetaEnsayo(nodo, op), /data-path/);
  assert.ok(existsSync(join(nodo, "key")));
});

test("$HOME, lo que lo contiene y la raíz: no", () => {
  assert.match(motivoParaNoUsar(HOME, op), /HOME/);
  assert.match(motivoParaNoUsar(base, op), /HOME/);
  assert.match(motivoParaNoUsar("/", op), /raíz/);
});

test("el repositorio, ni por dentro ni por encima", () => {
  assert.match(motivoParaNoUsar(REPO, op), /repositorio/);
  assert.match(motivoParaNoUsar(join(REPO, "sfsp", "ensayo"), op), /repositorio/);
  // Con la raíz de verdad: `ENSAYO_DIR=.` lanzado desde el repositorio.
  assert.match(motivoParaNoUsar(RAIZ_REPO), /repositorio/);
});

test("una carpeta con cosas que no son del ensayo: no se toca", () => {
  const ajena = join(base, "ajena");
  mkdirSync(ajena);
  writeFileSync(join(ajena, "importante.txt"), "no borrar");
  assert.throws(() => prepararCarpetaEnsayo(ajena, op), /no está vacía/);
  assert.deepEqual(readdirSync(ajena), ["importante.txt"]);
});

test("un enlace simbólico que apunta a $HOME se trata como $HOME", () => {
  const enlace = join(base, "enlace-a-casa");
  symlinkSync(HOME, enlace);
  assert.match(motivoParaNoUsar(enlace, op), /HOME/);
});

test("una carpeta nueva o vacía se usa y queda marcada; la del ensayo anterior se vuelve a vaciar", () => {
  const nueva = join(base, "ensayo", "uno");
  assert.equal(motivoParaNoUsar(nueva, op), null);
  prepararCarpetaEnsayo(nueva, op);
  assert.deepEqual(readdirSync(nueva), [MARCADOR]);
  // El ensayo deja sus cosas (datos, génesis, registros)...
  mkdirSync(join(nueva, "datos"));
  writeFileSync(join(nueva, "genesis.json"), "{}");
  // ...y el siguiente ensayo la reconoce y la vacía.
  prepararCarpetaEnsayo(nueva, op);
  assert.deepEqual(readdirSync(nueva), [MARCADOR]);

  const vacia = join(base, "vacia");
  mkdirSync(vacia);
  prepararCarpetaEnsayo(vacia, op);
  assert.deepEqual(readdirSync(vacia), [MARCADOR]);
});
