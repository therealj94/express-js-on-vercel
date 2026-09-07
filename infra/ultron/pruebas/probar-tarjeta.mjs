#!/usr/bin/env node
/**
 * LA TARJETA: QUE EL MODELO Y LA VENTANA ESTÉN ESCRITOS EN UN SOLO SITIO.
 *
 * Esta prueba existe por un fallo que pasó dos veces y las dos fueron
 * invisibles.
 *
 * El nombre del modelo y el tamaño de la ventana vivían escritos a mano en
 * siete archivos —el env del motor, tres guiones de la tarjeta, dos drop-ins de
 * AU-RA y el propio código—. Y ollama carga el modelo con la ventana del
 * PRIMERO que la pide: si uno solo se queda atrás, cada pedido suyo RECARGA
 * 16 GB de disco y la junta espera dos minutos sin que nada parezca roto. No
 * hay error, no hay aviso; solo lentitud.
 *
 * Pasó con la ventana el 7-sep: `ogb-precalentar.sh` se quedó en 32 768
 * mientras los otros cuatro ya iban en 24 576, y solo se vio leyendo los cinco
 * archivos uno por uno.
 *
 * Ahora se escribe UNA vez en `ogb-tarjeta.env` y todos lo leen. Lo que esta
 * prueba vigila es que siga siendo así: que nadie vuelva a pegar un
 * «qwen3.8:27b» o un «24576» dentro de un guion porque en el momento era más
 * rápido.
 *
 *     node pruebas/probar-tarjeta.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TARJETA = join(AQUI, '..', 'nodo', 'tarjeta');
const leer = (n) => readFileSync(join(TARJETA, n), 'utf8');

let fallos = 0;
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`);
const decir = (ok, q, detalle) => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${q}`);
  if (detalle) console.log(`           ${detalle}`);
  if (!ok) fallos++;
};

titulo('el archivo único: el modelo y la ventana se escriben acá');
const env = leer('ogb-tarjeta.env');
const valores = Object.fromEntries(env.split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

const modelos = ['OGB_MODELO', 'ULTRON_MOTOR_MODELO', 'AURA_MODELO', 'AURA_MODELO_PENSADOR'];
const ventanas = ['OGB_CTX', 'ULTRON_MOTOR_CTX', 'AURA_VENTANA'];
const vectores = ['OGB_MODELO_VECTOR', 'ULTRON_MOTOR_VECTOR'];

for (const grupo of [modelos, ventanas, vectores]) {
  const faltan = grupo.filter((k) => !valores[k]);
  decir(!faltan.length, `están los ${grupo.length} nombres de ${grupo[0].split('_').pop().toLowerCase()}`, faltan.join(', ') || grupo.map((k) => valores[k]).join(' · '));
}

/* ── LA COMPROBACIÓN QUE DE VERDAD IMPORTA ──────────────────────────────────
   Que estén no basta: tienen que ser el MISMO valor. ULTRON pidiendo un modelo
   y AU-RA pidiendo otro es exactamente el desastre que este archivo vino a
   impedir, solo que ahora cabría en una pantalla. */
for (const [nombre, grupo] of [['modelo', modelos], ['ventana', ventanas], ['vectores', vectores]]) {
  const distintos = [...new Set(grupo.map((k) => valores[k]))];
  decir(distintos.length === 1, `y todos los de ${nombre} dicen LO MISMO: ULTRON y AU-RA no pueden pedir cosas distintas`,
    distintos.join('  ≠  '));
}

decir(Number(valores.OGB_CTX) >= 16384 && Number(valores.OGB_CTX) <= 32768,
  'la ventana está entre lo que cabe y lo que se usa', valores.OGB_CTX);

titulo('ningún guion lleva el modelo ni la ventana escritos a mano');
{
  /* Se miran TODOS los guiones y conf de la carpeta, no una lista escrita a
     mano: un archivo nuevo que vuelva a pegar el nombre del modelo tiene que
     ponerse rojo solo, sin que nadie se acuerde de añadirlo acá. */
  const archivos = readdirSync(TARJETA).filter((n) => /\.(sh|service|timer|conf)$/.test(n));
  const sospechosos = [];
  for (const n of archivos) {
    const texto = leer(n);
    texto.split('\n').forEach((linea, i) => {
      // Los comentarios cuentan la historia y ahí SÍ se nombran los valores
      // viejos; lo que no puede haber es un valor vivo pegado a mano.
      if (/^\s*#/.test(linea)) return;
      if (/"model"\s*:\s*"(?!\$)/.test(linea) || /\\"model\\"\s*:\s*\\"(?!\$)/.test(linea)) sospechosos.push(`${n}:${i + 1} modelo escrito a mano`);
      if (/num_ctx\\?"\s*:\s*[0-9]/.test(linea)) sospechosos.push(`${n}:${i + 1} ventana escrita a mano`);
    });
  }
  decir(!sospechosos.length, `los ${archivos.length} archivos de la tarjeta lo leen del env, no lo llevan dentro`,
    sospechosos.join(' · ') || 'ninguno lo lleva pegado');
}

titulo('y los tres guiones leen el archivo único');
for (const n of ['ogb-tibio.sh', 'ogb-precalentar.sh', 'ollama-vigia.sh']) {
  const t = leer(n);
  decir(/\.\s+\/etc\/ogb-tarjeta\.env/.test(t), `${n} lo lee`);
  decir(/MODELO="\$\{OGB_MODELO:-/.test(t) && /CTX="\$\{OGB_CTX:-/.test(t),
    `${n} tiene un valor de respaldo por si el archivo no está`);
}

titulo('el drop-in que se lo da a los dos servicios');
{
  const c = leer('zz-tarjeta.conf');
  decir(/EnvironmentFile=-\/etc\/ogb-tarjeta\.env/.test(c), 'apunta al archivo único, y con el guion de «si no está, no pasa nada»');
  decir(/aura\.service\.d/.test(c) && /ultron-motor\.service\.d/.test(c),
    'y dice dónde va instalado: los DOS que piensan con el modelo');
}

console.log(fallos ? `\n${fallos} en rojo.\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
