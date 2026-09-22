#!/usr/bin/env node
/* P09 · comprueba que el compilador que se va a usar es EXACTAMENTE el fijado.
 *
 * Por qué existe: hasta hoy el árbol fijaba el número de versión ("0.8.28") y
 * nada más. Un número de versión no es un compilador: el binario que Hardhat
 * descargaba la primera vez quedaba en la caché personal del usuario, sin huella
 * comprobada y sin forma de saber, meses después, si el que compiló era ése.
 * Una compilación no es reproducible si no se sabe con qué se hizo.
 *
 * Corre solo (npm run comprobar:compilador) y también antes de cada `npm test`
 * de esta carpeta, mediante el gancho `pretest`. Si falla, la suite no corre:
 * un resultado obtenido con otro compilador no es el resultado de esta suite.
 *
 * Sin dependencias: sólo módulos de Node.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const aqui = dirname(fileURLToPath(import.meta.url));
const raizContratos = join(aqui, '..');

const FIJADO = JSON.parse(readFileSync(join(aqui, 'compilador.json'), 'utf8'));
const RUTA_SOLC = join(aqui, FIJADO.archivo);

const fallos = [];
const avisos = [];
const falla = (codigo, detalle) => fallos.push({ codigo, detalle });

/* 1 · la configuración no puede fijar una versión por su cuenta -------------- */

const config = readFileSync(join(raizContratos, 'hardhat.config.js'), 'utf8');
const literales = [...config.matchAll(/version:\s*["'](\d+\.\d+\.\d+)["']/g)].map((m) => m[1]);
const discordantes = literales.filter((v) => v !== FIJADO.version);
if (discordantes.length) {
  falla(
    'CONFIG_CON_VERSION_PROPIA',
    `hardhat.config.js escribe a mano la versión ${discordantes.join(', ')}; ` +
      `la única fuente es compilador/compilador.json (${FIJADO.version})`,
  );
}
if (!config.includes('compilador.json')) {
  falla(
    'CONFIG_NO_LEE_EL_FIJADO',
    'hardhat.config.js no lee compilador/compilador.json: la versión podría divergir de la fijada',
  );
}

/* 2 · el binario vendorizado, presente y con la huella exacta ---------------- */

if (!existsSync(RUTA_SOLC)) {
  falla(
    'COMPILADOR_AUSENTE',
    `falta contracts/compilador/${FIJADO.archivo}. Sin él, compilar necesita red ` +
      `(o la caché personal del usuario). Resolvelo con: node compilador/preparar.mjs`,
  );
} else {
  const huella = createHash('sha256').update(readFileSync(RUTA_SOLC)).digest('hex');
  if (huella !== FIJADO.sha256) {
    falla(
      'HUELLA_DISTINTA',
      `el binario presente no es el fijado. esperado ${FIJADO.sha256}, presente ${huella}`,
    );
  } else {
    /* 3 · y que el binario diga de sí mismo lo que dice el manifiesto -------- */
    try {
      const salida = execFileSync(RUTA_SOLC, ['--version'], { encoding: 'utf8' });
      if (!salida.includes(FIJADO.longVersion)) {
        falla(
          'VERSION_DECLARADA_DISTINTA',
          `el binario se identifica como "${salida.trim().split('\n').pop()}" y el manifiesto dice ${FIJADO.longVersion}`,
        );
      }
    } catch (e) {
      falla('COMPILADOR_NO_EJECUTABLE', `no se pudo ejecutar el binario fijado: ${e.message}`);
    }
  }
}

/* 4 · y que lo ya compilado se haya compilado con ése ------------------------ */

const buildInfo = join(raizContratos, 'artifacts', 'build-info');
if (existsSync(buildInfo)) {
  for (const archivo of readdirSync(buildInfo).filter((f) => f.endsWith('.json'))) {
    let info;
    try {
      info = JSON.parse(readFileSync(join(buildInfo, archivo), 'utf8'));
    } catch {
      avisos.push(`no se pudo leer artifacts/build-info/${archivo}`);
      continue;
    }
    const usado = info.solcLongVersion ?? info.solcVersion ?? null;
    if (usado === null) {
      avisos.push(`artifacts/build-info/${archivo} no declara con qué compilador se hizo`);
    } else if (!String(usado).startsWith(FIJADO.version)) {
      falla(
        'ARTEFACTO_DE_OTRO_COMPILADOR',
        `artifacts/build-info/${archivo} se compiló con ${usado}, no con ${FIJADO.longVersion}. ` +
          `Borrá artifacts/ y cache/ y volvé a compilar.`,
      );
    }
  }
}

/* ---------------------------------------------------------------- resultado */

for (const a of avisos) console.log(`  aviso: ${a}`);

if (fallos.length === 0) {
  console.log(
    `compilador fijado OK · ${FIJADO.longVersion} · sha256 ${FIJADO.sha256.slice(0, 16)}… · sin red`,
  );
  process.exit(0);
}

console.error('\nEl compilador NO es el fijado. La suite de contratos no debe correr así.\n');
for (const f of fallos) console.error(`  · ${f.codigo}: ${f.detalle}`);
console.error('');
process.exit(1);
