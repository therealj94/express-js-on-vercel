#!/usr/bin/env node
/* Corre todas las suites del árbol SFSP y deja un registro de evidencia.
 *
 * No usa red, no lee nodos, no toca bases y no necesita credenciales. Si algo
 * de eso hiciera falta, la corrida fallaría en vez de inventar un resultado.
 *
 *   node scripts/verificar-todo.mjs            corre todo
 *   node scripts/verificar-todo.mjs --rapido   salta las suites largas
 */

import { spawnSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const rapido = process.argv.includes('--rapido');

const SUITES = [
  { nombre: 'sdk', carpeta: 'sdk', comando: 'npm', args: ['test', '--silent'], larga: true },
  { nombre: 'contracts', carpeta: 'contracts', comando: 'npm', args: ['test', '--silent'], larga: true },
  { nombre: 'indexer', carpeta: 'indexer', comando: 'npm', args: ['test', '--silent'], larga: false },
  { nombre: 'dbnx-api', carpeta: 'dbnx-api', comando: 'npm', args: ['test', '--silent'], larga: false },
];

function sha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: raiz, encoding: 'utf8' }).trim();
  } catch {
    return 'sin-git';
  }
}

function contarPruebas(salida) {
  const pass = /^#\s*pass\s+(\d+)/m.exec(salida);
  const fail = /^#\s*fail\s+(\d+)/m.exec(salida);
  if (pass) return { pasan: Number(pass[1]), fallan: fail ? Number(fail[1]) : 0 };
  /* Formato de mocha, que es el que usa hardhat. */
  const mochaPass = /(\d+)\s+passing/.exec(salida);
  const mochaFail = /(\d+)\s+failing/.exec(salida);
  if (mochaPass) return { pasan: Number(mochaPass[1]), fallan: mochaFail ? Number(mochaFail[1]) : 0 };
  return { pasan: 0, fallan: 0 };
}

const resultados = [];
let huboFallo = false;

for (const suite of SUITES) {
  const carpeta = join(raiz, suite.carpeta);
  if (!existsSync(join(carpeta, 'package.json'))) {
    resultados.push({ suite: suite.nombre, estado: 'AUSENTE', detalle: 'no hay package.json' });
    continue;
  }
  if (rapido && suite.larga) {
    resultados.push({ suite: suite.nombre, estado: 'SALTADA', detalle: 'modo rápido' });
    continue;
  }

  process.stdout.write(`\n· ${suite.nombre} … `);
  const inicio = Date.now();
  const r = spawnSync(suite.comando, suite.args, {
    cwd: carpeta,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const salida = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const { pasan, fallan } = contarPruebas(salida);
  const ok = r.status === 0 && fallan === 0;
  if (!ok) huboFallo = true;

  process.stdout.write(ok ? `verde · ${pasan} pruebas` : `ROJO · ${pasan} pasan, ${fallan} fallan`);
  resultados.push({
    suite: suite.nombre,
    estado: ok ? 'PROBADO_AISLADO' : 'FALLO',
    pruebasQuePasan: pasan,
    pruebasQueFallan: fallan,
    duracionMs: Date.now() - inicio,
    ...(ok ? {} : { ultimasLineas: salida.trim().split('\n').slice(-25).join('\n') }),
  });
}

const registro = {
  evidenceId: `ev_${Date.now().toString(16)}`,
  taskId: 'sfsp/verificar-todo',
  sourceSHA: sha(),
  artifactDigest: null,
  configVersion: 'draft-0.3',
  environment: 'aislado-sin-red',
  chainId: null,
  genesisHash: null,
  blockNumber: null,
  blockHash: null,
  testCommand: 'node scripts/verificar-todo.mjs',
  fixtureId: 'fixtures/sinteticos',
  result: huboFallo ? 'NO_VERIFICADO' : 'PROBADO_AISLADO',
  timestampUTC: new Date().toISOString(),
  reviewer: null,
  limitations:
    'Pruebas en aislamiento con datos sintéticos. No acreditan comportamiento de ningún servicio desplegado, de la red 5550 ni de saldos reales.',
  restrictedEvidenceRef: null,
  suites: resultados,
};

const destino = join(raiz, 'evidence', 'corridas');
mkdirSync(destino, { recursive: true });
const archivo = join(destino, `${registro.evidenceId}.json`);
writeFileSync(archivo, `${JSON.stringify(registro, null, 2)}\n`);

/* Comprobación extra que no depende de ninguna suite: que el archivo de
   decisiones siga sin valores inventados. */
const decisiones = JSON.parse(readFileSync(join(raiz, 'DECISIONES-SFSP.json'), 'utf8'));
const economicosConValor = Object.entries(decisiones.parametrosEconomicos).filter(
  ([, v]) => v !== null && !(typeof v === 'object' && Object.values(v).every((x) => x === null)),
);

console.log('\n\n── resumen ──');
for (const r of resultados) {
  const n = r.pruebasQuePasan ?? 0;
  console.log(`  ${r.suite.padEnd(12)} ${r.estado.padEnd(18)} ${n ? `${n} pruebas` : ''}`);
}
console.log(`\n  decisiones pendientes: ${decisiones.decisiones.filter((d) => d.estado !== 'APROBADA').length}`);
console.log(`  parámetros económicos con valor: ${economicosConValor.length} (deben ser 0 hasta que se aprueben)`);
console.log(`\n  evidencia: evidence/corridas/${registro.evidenceId}.json`);
console.log(`  estado: ${registro.result}\n`);

process.exit(huboFallo ? 1 : 0);
