#!/usr/bin/env node
/* Corre todas las suites del árbol SFSP y deja un registro de evidencia.
 *
 * La versión anterior de este archivo tenía el defecto que más me preocupa de
 * todo el proyecto (C02): registraba el SHA del último commit sin comprobar si
 * el árbol tenía cambios sin guardar. Se podía correr la suite, editar el
 * código, y quedarse con una evidencia que apunta a un código distinto del que
 * se probó. Es exactamente el error del 12 de agosto, cuando un clon desfasado
 * borró funciones de producción, repetido en la herramienta que existía para
 * impedirlo.
 *
 * También daba verde con suites ausentes y con cero pruebas (H22), y no corría
 * la comprobación de tipos (P08) ni miraba la integridad del archivo de
 * decisiones (C07).
 *
 * Ahora: una corrida sólo emite `VERIFICACION_COMPLETA` si el árbol está
 * limpio, las cuatro suites existen, todas corren, ninguna devuelve cero
 * pruebas, los tipos compilan en estricto y las decisiones no cambiaron sin
 * anunciarse. Cualquier otra cosa es `VERIFICACION_PARCIAL`, y eso NO es
 * evidencia de nada.
 *
 *   node scripts/verificar-todo.mjs              verificación completa
 *   node scripts/verificar-todo.mjs --rapido     exploración, nunca evidencia
 *   node scripts/verificar-todo.mjs --sello      recalcula la huella de decisiones
 */

import { spawnSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const rapido = process.argv.includes('--rapido');
const resellar = process.argv.includes('--sello');

/* Las cuatro suites son obligatorias. Que falte una no es «no aplica»: es una
   verificación que no se hizo, y se dice así. */
const SUITES = [
  { nombre: 'sdk', carpeta: 'sdk' },
  { nombre: 'contracts', carpeta: 'contracts' },
  { nombre: 'indexer', carpeta: 'indexer' },
  { nombre: 'dbnx-api', carpeta: 'dbnx-api' },
];

/* La suite adversaria encierra cada hallazgo de la auditoría en una prueba.
   Mientras tenga rojas, la verificación no puede ser completa: son defectos
   conocidos y sin corregir. */
const ADVERSARIA = { nombre: 'pruebas-adversarias', carpeta: 'pruebas-adversarias' };

const problemas = [];
const anota = (codigo, detalle) => problemas.push({ codigo, detalle });

/* ------------------------------------------------------- procedencia (C02) */

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: raiz, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function procedencia() {
  const sha = git('rev-parse HEAD');
  if (!sha) {
    anota('SIN_GIT', 'no se pudo leer el commit: la evidencia no tendría procedencia');
    return { sourceSHA: null, arbolLimpio: false, sucios: [] };
  }
  /* Sólo importa lo que está dentro de sfsp/: un cambio en otra parte del
     monorepo no altera lo que estas suites prueban. */
  const estado = git('status --porcelain -- sfsp') ?? '';
  const sucios = estado.split('\n').map((l) => l.trim()).filter(Boolean);
  if (sucios.length) {
    anota(
      'ARBOL_SUCIO',
      `${sucios.length} archivo(s) de sfsp/ con cambios sin guardar: el SHA no describe lo que se probó`,
    );
  }
  return { sourceSHA: sha, arbolLimpio: sucios.length === 0, sucios };
}

/* ------------------------------------------- integridad de decisiones (C07) */

const RUTA_DECISIONES = join(raiz, 'DECISIONES-SFSP.json');
const RUTA_SELLO = join(raiz, 'evidence', 'sello-decisiones.txt');

const huellaDecisiones = () =>
  createHash('sha256').update(readFileSync(RUTA_DECISIONES)).digest('hex');

function comprobarDecisiones() {
  const huella = huellaDecisiones();

  if (resellar) {
    mkdirSync(dirname(RUTA_SELLO), { recursive: true });
    writeFileSync(RUTA_SELLO, `${huella}\n`);
    console.log(`Sello de decisiones actualizado: ${huella.slice(0, 16)}…`);
    console.log('Commitealo junto al cambio de DECISIONES-SFSP.json.');
    process.exit(0);
  }

  if (!existsSync(RUTA_SELLO)) {
    anota('SIN_SELLO', 'no hay sello de DECISIONES-SFSP.json: correr con --sello y commitearlo');
  } else if (readFileSync(RUTA_SELLO, 'utf8').trim() !== huella) {
    anota(
      'DECISIONES_CAMBIADAS',
      'DECISIONES-SFSP.json cambió sin actualizar su sello: un parámetro económico pudo desbloquearse sin que nadie lo anuncie',
    );
  }

  /* Y el control de fondo: ningún parámetro económico puede tener valor
     mientras su decisión siga pendiente. */
  const d = JSON.parse(readFileSync(RUTA_DECISIONES, 'utf8'));
  const aprobadas = new Set(
    d.decisiones.filter((x) => x.estado === 'APROBADA').map((x) => x.id),
  );
  const gobierna = {
    precioOrigenModo: 'D01', precioOrigenReferencia: 'D01',
    feeObjetivoUSD: 'D02', feeAlcance: 'D02', gasPatrocinado: 'D02',
    releaseCap: 'D03',
    haircutsPorTier: 'D04', factoresDeElegibilidad: 'D04', limitesDeConcentracion: 'D04',
    quorumMint: 'D07', quorumRecovery: 'D07', quorumPause: 'D07',
    quorumUpgrade: 'D07', timelockUpgradeSegundos: 'D07',
    compraMinimaUSD: 'D05', minimoRedencionFisica: 'D05',
  };
  const conValor = [];
  for (const [nombre, valor] of Object.entries(d.parametrosEconomicos)) {
    const tieneValor =
      valor !== null &&
      !(typeof valor === 'object' && Object.values(valor).every((v) => v === null));
    if (!tieneValor) continue;
    conValor.push(nombre);
    const dec = gobierna[nombre];
    if (dec && !aprobadas.has(dec)) {
      anota(
        'PARAMETRO_SIN_DECISION',
        `${nombre} tiene valor pero ${dec} sigue pendiente`,
      );
    }
  }
  return { huella, pendientes: d.decisiones.filter((x) => x.estado !== 'APROBADA').length, conValor };
}

/* ------------------------------------------------------------- tipos (P08) */

function comprobarTipos() {
  const paquetes = ['sdk', 'indexer', 'dbnx-api'];
  const salida = [];
  for (const p of paquetes) {
    const carpeta = join(raiz, p);
    if (!existsSync(join(carpeta, 'tsconfig.json'))) {
      anota('SIN_TSCONFIG', `${p} no tiene tsconfig.json`);
      salida.push({ paquete: p, estado: 'AUSENTE' });
      continue;
    }
    const r = spawnSync('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], {
      cwd: carpeta,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const ok = r.status === 0;
    if (!ok) anota('TIPOS', `${p} no compila en modo estricto`);
    salida.push({
      paquete: p,
      estado: ok ? 'OK' : 'FALLO',
      ...(ok ? {} : { detalle: (r.stdout ?? '').trim().split('\n').slice(0, 12).join('\n') }),
    });
  }
  return salida;
}

/* ----------------------------------------------------------------- suites */

function contarPruebas(salida) {
  const pass = /^#\s*pass\s+(\d+)/m.exec(salida);
  const fail = /^#\s*fail\s+(\d+)/m.exec(salida);
  if (pass) return { pasan: Number(pass[1]), fallan: fail ? Number(fail[1]) : 0, leido: true };
  const mochaPass = /(\d+)\s+passing/.exec(salida);
  const mochaFail = /(\d+)\s+failing/.exec(salida);
  if (mochaPass) {
    return { pasan: Number(mochaPass[1]), fallan: mochaFail ? Number(mochaFail[1]) : 0, leido: true };
  }
  /* No saber cuántas pruebas corrieron NO es cero pruebas aprobadas: es una
     salida que no se entendió, y eso invalida la corrida. */
  return { pasan: 0, fallan: 0, leido: false };
}

function correrSuite(suite, obligatoria) {
  const carpeta = join(raiz, suite.carpeta);
  if (!existsSync(join(carpeta, 'package.json'))) {
    if (obligatoria) anota('SUITE_AUSENTE', `falta la suite ${suite.nombre}`);
    return { suite: suite.nombre, estado: 'AUSENTE', pruebasQuePasan: 0, pruebasQueFallan: 0 };
  }

  process.stdout.write(`\n· ${suite.nombre} … `);
  const inicio = Date.now();
  const r = spawnSync('npm', ['test', '--silent'], {
    cwd: carpeta,
    encoding: 'utf8',
    /* Marca para que una suite sepa que ya corre DENTRO del verificador y no
       lo vuelva a invocar: si no, la suite adversaria se llamaría a sí misma. */
    env: { ...process.env, FORCE_COLOR: '0', SFSP_DENTRO_DEL_VERIFICADOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const salida = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const { pasan, fallan, leido } = contarPruebas(salida);

  if (!leido) {
    anota('SALIDA_ILEGIBLE', `no se pudo contar las pruebas de ${suite.nombre}`);
  } else if (pasan === 0 && obligatoria) {
    anota('CERO_PRUEBAS', `${suite.nombre} no ejecutó ninguna prueba`);
  }
  if (r.status !== 0 || fallan > 0) {
    anota('SUITE_ROJA', `${suite.nombre}: ${fallan} prueba(s) fallan`);
  }

  const ok = r.status === 0 && fallan === 0 && leido && (pasan > 0 || !obligatoria);
  process.stdout.write(
    ok ? `verde · ${pasan} pruebas` : `ROJO · ${pasan} pasan, ${fallan} fallan`,
  );

  return {
    suite: suite.nombre,
    estado: ok ? 'PROBADO_AISLADO' : 'FALLO',
    pruebasQuePasan: pasan,
    pruebasQueFallan: fallan,
    salidaLegible: leido,
    duracionMs: Date.now() - inicio,
    ...(ok ? {} : { ultimasLineas: salida.trim().split('\n').slice(-25).join('\n') }),
  };
}

/* -------------------------------------------------------------------- main */

const proc = procedencia();
const decisiones = comprobarDecisiones();

if (rapido) {
  anota('MODO_RAPIDO', 'una corrida en modo rápido no emite evidencia');
}

const resultados = [];
for (const suite of SUITES) {
  if (rapido && suite.nombre === 'contracts') {
    resultados.push({ suite: suite.nombre, estado: 'SALTADA', pruebasQuePasan: 0, pruebasQueFallan: 0 });
    continue;
  }
  resultados.push(correrSuite(suite, true));
}
/* La adversaria es opcional mientras no exista; en cuanto existe, es obligatoria. */
if (existsSync(join(raiz, ADVERSARIA.carpeta, 'package.json'))) {
  resultados.push(correrSuite(ADVERSARIA, true));
}

const tipos = rapido ? [] : comprobarTipos();

const completa = problemas.length === 0;
const totalPruebas = resultados.reduce((n, r) => n + (r.pruebasQuePasan ?? 0), 0);

const registro = {
  evidenceId: `ev_${Date.now().toString(16)}`,
  taskId: 'sfsp/verificar-todo',
  sourceSHA: proc.sourceSHA,
  arbolLimpio: proc.arbolLimpio,
  archivosSucios: proc.sucios,
  selloDecisiones: decisiones.huella,
  artifactDigest: null,
  configVersion: 'draft-0.3',
  environment: 'aislado-sin-red',
  chainId: null,
  genesisHash: null,
  blockNumber: null,
  blockHash: null,
  testCommand: `node scripts/verificar-todo.mjs${rapido ? ' --rapido' : ''}`,
  fixtureId: 'fixtures/sinteticos',
  result: completa ? 'PROBADO_AISLADO' : 'NO_VERIFICADO',
  cobertura: completa ? 'VERIFICACION_COMPLETA' : 'VERIFICACION_PARCIAL',
  totalPruebasQuePasan: totalPruebas,
  problemas,
  timestampUTC: new Date().toISOString(),
  reviewer: null,
  limitations:
    'Pruebas en aislamiento con datos sintéticos. No acreditan comportamiento de ningún servicio desplegado, de la red 5550 ni de saldos reales.',
  restrictedEvidenceRef: null,
  suites: resultados,
  tipos,
};

/* La evidencia se escribe SIEMPRE, también cuando la verificación es parcial:
   un intento fallido que no deja rastro es peor que uno que lo deja. Lo que
   cambia es qué dice. */
const destino = join(raiz, 'evidence', 'corridas');
mkdirSync(destino, { recursive: true });
writeFileSync(join(destino, `${registro.evidenceId}.json`), `${JSON.stringify(registro, null, 2)}\n`);

console.log('\n\n── resumen ──');
for (const r of resultados) {
  console.log(
    `  ${r.suite.padEnd(20)} ${r.estado.padEnd(18)} ${r.pruebasQuePasan ? `${r.pruebasQuePasan} pruebas` : ''}`,
  );
}
for (const t of tipos) {
  console.log(`  tipos ${t.paquete.padEnd(14)} ${t.estado}`);
}
console.log(`\n  árbol limpio: ${proc.arbolLimpio ? 'sí' : 'NO'}`);
console.log(`  decisiones pendientes: ${decisiones.pendientes}`);
console.log(`  parámetros económicos con valor: ${decisiones.conValor.length}`);

if (problemas.length) {
  console.log(`\n  ── por qué NO es una verificación completa ──`);
  for (const p of problemas) console.log(`  · ${p.codigo}: ${p.detalle}`);
}

console.log(`\n  evidencia: evidence/corridas/${registro.evidenceId}.json`);
console.log(`  cobertura: ${registro.cobertura}`);
console.log(`  estado: ${registro.result}\n`);

process.exit(completa ? 0 : 1);
