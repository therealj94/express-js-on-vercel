#!/usr/bin/env node
/* Comprobación previa al día de la subida (PLAN-FINAL-2026-09-25 §4).
 *
 *   node sfsp/deploy/preflight-subida.mjs
 *
 * SOLO LEE. No despliega, no escribe, no cambia nada en AWS, Render ni Heroku.
 * Nunca imprime el valor de una credencial: dice si está, no cuál es.
 *
 * Cada línea sale PASA, FALTA o NO_SE_PUEDE_LEER. NO_SE_PUEDE_LEER no es PASA:
 * una comprobación que no se pudo hacer no cuenta como hecha. */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const filas = [];
const anotar = (bloque, que, estado, detalle = '') => filas.push({ bloque, que, estado, detalle });

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, ...opts }).trim();
}

async function obtener(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
  return { status: r.status, texto: await r.text() };
}

// ---------------------------------------------------------------- código
try {
  const sucio = sh('git', ['status', '--porcelain', '--', 'sfsp', 'apps-web/veta-wallet']);
  anotar('código', 'árbol limpio en sfsp/ y apps-web/veta-wallet/', sucio ? 'FALTA' : 'PASA', sucio ? `${sucio.split('\n').length} archivo(s) sin guardar` : '');
  const sha = sh('git', ['rev-parse', 'HEAD']);
  const rama = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  let empujado = 'NO_SE_PUEDE_LEER';
  try {
    const remoto = sh('git', ['rev-parse', `origin/${rama}`]);
    empujado = remoto === sha ? 'PASA' : 'FALTA';
  } catch { /* sin rama remota */ }
  anotar('código', `rama ${rama} empujada (${sha.slice(0, 8)})`, empujado);

  const dir = join(raiz, 'sfsp', 'evidence', 'corridas');
  let evidencia = null;
  if (existsSync(dir)) {
    const archivos = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    for (const f of archivos) {
      const e = JSON.parse(readFileSync(f, 'utf8'));
      if (e.sourceSHA === sha) { evidencia = e; break; }
    }
  }
  if (!evidencia) anotar('código', 'verificar-todo corrido sobre este SHA', 'FALTA', 'correr: node sfsp/scripts/verificar-todo.mjs');
  else anotar('código', 'VERIFICACION_COMPLETA sobre este SHA', evidencia.cobertura === 'VERIFICACION_COMPLETA' ? 'PASA' : 'FALTA', `${evidencia.cobertura} · ${evidencia.totalPruebasQuePasan ?? '?'} pruebas`);
} catch (e) {
  anotar('código', 'git', 'NO_SE_PUEDE_LEER', String(e.message).slice(0, 80));
}

// ------------------------------------------------------------ credenciales
for (const n of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) {
  anotar('A · credenciales', `${n} en el entorno`, process.env[n] ? 'PASA' : 'FALTA', process.env[n] ? '(presente; no se muestra)' : 'va en la configuración del entorno, nunca por el chat');
}

let hayAws = false;
try { sh('aws', ['--version']); hayAws = true; } catch { /* sin CLI */ }
if (!hayAws) anotar('A · AWS', 'CLI de AWS', 'NO_SE_PUEDE_LEER', 'no está instalada aquí');
else if (process.env.AWS_ACCESS_KEY_ID) {
  try {
    const id = JSON.parse(sh('aws', ['sts', 'get-caller-identity', '--output', 'json']));
    anotar('A · AWS', 'la llave autentica', 'PASA', `usuario …${String(id.Arn).slice(-24)}`);
  } catch (e) {
    anotar('A · AWS', 'la llave autentica', 'FALTA', String(e.stderr || e.message).split('\n')[0].slice(0, 90));
  }
  for (const [nombre, app] of [['ensayo', 'd289v5ffkexk23'], ['producción', 'd264zjawew1yea']]) {
    try {
      sh('aws', ['amplify', 'get-app', '--app-id', app, '--region', process.env.AWS_REGION || 'us-east-1', '--output', 'json']);
      anotar('B1 · Veta Wallet', `Amplify ${nombre} (${app}) accesible`, 'PASA');
    } catch (e) {
      anotar('B1 · Veta Wallet', `Amplify ${nombre} (${app}) accesible`, 'FALTA', String(e.stderr || e.message).split('\n')[0].slice(0, 90));
    }
  }
  try {
    const nodos = JSON.parse(sh('aws', ['ssm', 'describe-instance-information', '--region', process.env.AWS_REGION || 'us-east-1', '--output', 'json']));
    const n = (nodos.InstanceInformationList || []).length;
    anotar('A3 · nodos', 'nodos visibles por SSM', n > 0 ? 'PASA' : 'FALTA', `${n} nodo(s)`);
  } catch (e) {
    anotar('A3 · nodos', 'nodos visibles por SSM', 'FALTA', String(e.stderr || e.message).split('\n')[0].slice(0, 90));
  }
}

// ------------------------------------------------------------ lo público
const publicos = [
  ['B1 · Veta Wallet', 'vetawallet.com responde', 'https://vetawallet.com/', (r) => r.status === 200],
  ['B1 · Veta Wallet', 'privacidad.html sigue publicada', 'https://vetawallet.com/privacidad.html', (r) => r.status === 200],
  ['B2 · Electrum', 'oficina de Dr Electrum en vivo', 'https://ultron-looi-desk.onrender.com/electrum-oficina/', (r) => r.texto.includes('Dr Electrum · Oficina')],
  ['B4 · AU-RA', 'salud de ultron-looi-desk', 'https://ultron-looi-desk.onrender.com/api/health', (r) => r.status === 200 && r.texto.includes('"ok":true')],
  ['cadena', 'RPC público de la 5550', 'https://rpc.ordenglobal-rpc.com', null],
];
for (const [bloque, que, url, ok] of publicos) {
  try {
    if (ok === null) {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      anotar(bloque, que, j.result === '0x15ae' ? 'PASA' : 'FALTA', `chainId ${j.result}`);
    } else {
      const r = await obtener(url);
      anotar(bloque, que, ok(r) ? 'PASA' : 'FALTA', `HTTP ${r.status}`);
    }
  } catch (e) {
    anotar(bloque, que, 'NO_SE_PUEDE_LEER', String(e.message).slice(0, 60));
  }
}

// ---------------------------------------------------------------- informe
const ancho = Math.max(...filas.map((f) => f.que.length));
let bloque = '';
for (const f of filas) {
  if (f.bloque !== bloque) { bloque = f.bloque; console.log(`\n── ${bloque}`); }
  console.log(`  ${f.estado.padEnd(17)} ${f.que.padEnd(ancho)}  ${f.detalle}`);
}
const faltan = filas.filter((f) => f.estado !== 'PASA').length;
console.log(`\n${faltan === 0 ? 'Todo en verde: se puede empezar el bloque B.' : `${faltan} cosa(s) por resolver antes de subir.`}`);
process.exit(faltan === 0 ? 0 : 1);
