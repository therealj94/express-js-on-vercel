#!/usr/bin/env node
/* ARMAR EL SABER DE ULTRON: todo lo que la casa tiene escrito, en un solo sitio.
 *
 *   node infra/ultron/bin/armar-saber.mjs
 *
 * ══ POR QUÉ SE COMPILA EN VEZ DE LEERSE EN VIVO ═════════════════════════════
 *
 * El saber de Orden Global vive repartido por el repositorio: dieciocho
 * documentos en la raíz, las cuarenta fichas de AU-RA, los dosieres de la
 * junta, el estado legal de la minería. ULTRON se despliega a Heroku como un
 * paquete que solo lleva `infra/ultron/` — así que si leyera esos archivos en
 * vivo, en producción no encontraría ninguno y no se enteraría: contestaría
 * con lo que el modelo inventa, que es exactamente lo que el prompt de AU-RA
 * lleva meses prohibiendo.
 *
 * Así que el saber se COMPILA acá, a `infra/ultron/saber/`, y va dentro del
 * paquete. Cada despliegue lleva una foto del saber con fecha, y una prueba se
 * pone roja si los documentos cambiaron y nadie volvió a armar.
 *
 * ══ QUÉ SE HACE CON CADA DOCUMENTO ═══════════════════════════════════════════
 *
 * Se parte en SECCIONES por encabezado. No en trozos de N caracteres: un
 * trozo que corta una tabla por la mitad le da al modelo la mitad de una
 * verdad, y con dinero eso es peor que nada. Una sección es una unidad de
 * sentido que alguien escribió con un título.
 *
 * Cada sección lleva de dónde salió, para que ULTRON pueda decir «según
 * TRASPASO-CONOCIMIENTO.md, sección tal» — y para que cuando diga algo que
 * suene raro, alguien pueda ir a mirar el original.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const SALIDA = join(AQUI, '..', 'saber');

/* ── LAS FUENTES ─────────────────────────────────────────────────────────────
 * Se enumeran, no se descubren con un glob de todo el repositorio. Un glob
 * mete un día el LEEME de una carpeta de pruebas, o un documento a medias que
 * alguien dejó, y ULTRON lo cita como verdad de la casa. Lo que entra acá lo
 * eligió alguien. */
const FUENTES = [
  // Lo que explica qué es la casa
  { ruta: 'ECOSISTEMA-ORDEN-GLOBAL.md', tema: 'El ecosistema', peso: 3 },
  { ruta: 'TRASPASO-CONOCIMIENTO.md', tema: 'Traspaso de conocimiento', peso: 3 },
  { ruta: 'LEEME.md', tema: 'El repositorio', peso: 1 },
  { ruta: 'README.md', tema: 'El repositorio', peso: 1 },
  // Cada casa
  { ruta: 'AUCORP.md', tema: 'AuCorp', peso: 2 },
  { ruta: 'VETA_WALLET_README.md', tema: 'Veta Wallet', peso: 2 },
  { ruta: 'VETA_WALLET_SPECS.md', tema: 'Veta Wallet', peso: 2 },
  { ruta: 'GENESIS_ID_INTEGRACION.md', tema: 'Genesis ID', peso: 2 },
  { ruta: 'CONECTAR-GENESIS-AUCORP.md', tema: 'Genesis ID y AuCorp', peso: 1 },
  { ruta: 'INTEGRACION_BLOCKCHAIN.md', tema: 'La cadena', peso: 2 },
  { ruta: 'ONDK-PREVENTA.md', tema: 'ONDK', peso: 2 },
  // Estado, planes y diagnósticos
  { ruta: 'PLAN-CRECIMIENTO.md', tema: 'Plan de crecimiento', peso: 2 },
  { ruta: 'POR-HACER.md', tema: 'Pendientes', peso: 2 },
  { ruta: 'DIAGNOSTICO-2026-08-26.md', tema: 'Diagnóstico', peso: 1 },
  { ruta: 'REVISION-2026-08-26.md', tema: 'Revisión', peso: 1 },
  { ruta: 'ESTADO-MANANA-15-AGO.md', tema: 'Estado', peso: 1 },
  { ruta: 'COMO_GENERAR_APK.md', tema: 'La app', peso: 1 },
  { ruta: 'EMPEZAR-EN-MI-COMPUTADORA.md', tema: 'Operación', peso: 1 },
  // Lo legal y la minería
  { ruta: 'infra/cerebro/conocimiento/legal-detalle.md', tema: 'Legal', peso: 3 },
  { ruta: 'infra/cerebro/conocimiento/legal-contradicciones.md', tema: 'Legal', peso: 3 },
  { ruta: 'infra/cerebro/conocimiento/mineria-pendiente-legal.md', tema: 'Minería · legal', peso: 2 },
  { ruta: 'infra/cerebro/conocimiento/portafolio-minero.md', tema: 'Minería', peso: 2 },
  { ruta: 'infra/cerebro/PROMPT-LEGAL-MINERIA.md', tema: 'Minería · legal', peso: 1 },
  // La voz de AU-RA: qué se puede decir y qué no
  { ruta: 'infra/aura/PROMPT-AURA.md', tema: 'AU-RA', peso: 2 },
  // Ordenex, por dentro
  { ruta: 'apps-web/README.md', tema: 'Las webs', peso: 1 },
  { ruta: 'infra/ordenex-api/LEEME.md', tema: 'Ordenex', peso: 2, opcional: true },
  { ruta: 'infra/aucorp-api/LEEME.md', tema: 'AuCorp', peso: 2, opcional: true },
  { ruta: 'infra/cerebro/LEEME.md', tema: 'El cerebro', peso: 2 },
];

/* Los dosieres de la junta son HTML. Se les quita la marca y se parten igual. */
const DOSIERES_DIR = 'documentos-junta';

// ── Partir un markdown en secciones ─────────────────────────────────────────

function seccionesDe(texto, fuente, tema, peso) {
  const lineas = texto.split('\n');
  const salida = [];
  let titulo = basename(fuente);
  let camino = [];          // los encabezados de arriba, para dar contexto
  let cuerpo = [];
  let nivel = 0;

  const cerrar = () => {
    const t = cuerpo.join('\n').trim();
    if (t.length < 40) { cuerpo = []; return; }   // un título sin nada debajo no es saber
    salida.push({
      id: createHash('sha1').update(fuente + '|' + camino.join('>') + '|' + titulo).digest('hex').slice(0, 12),
      fuente, tema, peso,
      titulo: [...camino, titulo].filter(Boolean).join(' › '),
      texto: t,
    });
    cuerpo = [];
  };

  for (const l of lineas) {
    const m = l.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (m) {
      cerrar();
      const n = m[1].length;
      if (n <= nivel) camino = camino.slice(0, Math.max(0, n - 2));
      else if (nivel && n > nivel) camino = [...camino, titulo].slice(-3);
      nivel = n;
      titulo = m[2].replace(/[*_`]/g, '');
      continue;
    }
    cuerpo.push(l);
  }
  cerrar();
  return salida;
}

/** HTML → texto plano, conservando saltos donde había bloques. */
function textoDeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(h[1-4])[^>]*>/gi, '\n\n## ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Correr ──────────────────────────────────────────────────────────────────

mkdirSync(SALIDA, { recursive: true });
const secciones = [];
const fuentesLeidas = [];
const huellas = {};   // ruta -> sha1 del contenido, para saber si hay que rearmar

for (const f of FUENTES) {
  const abs = join(RAIZ, f.ruta);
  if (!existsSync(abs)) {
    if (f.opcional) continue;
    console.error(`  ✗ falta ${f.ruta}`);
    process.exitCode = 1;
    continue;
  }
  const texto = readFileSync(abs, 'utf8');
  huellas[f.ruta] = createHash('sha1').update(texto).digest('hex');
  const s = seccionesDe(texto, f.ruta, f.tema, f.peso);
  secciones.push(...s);
  fuentesLeidas.push({ ruta: f.ruta, tema: f.tema, secciones: s.length, bytes: texto.length });
}

// Los dosieres de la junta
const dosDir = join(RAIZ, DOSIERES_DIR);
if (existsSync(dosDir)) {
  for (const n of readdirSync(dosDir).filter((x) => x.endsWith('.html')).sort()) {
    const ruta = `${DOSIERES_DIR}/${n}`;
    const html = readFileSync(join(dosDir, n), 'utf8');
    huellas[ruta] = createHash('sha1').update(html).digest('hex');
    const texto = textoDeHtml(html);
    const s = seccionesDe(texto, ruta, 'Dosier de la junta', 3);
    secciones.push(...s);
    fuentesLeidas.push({ ruta, tema: 'Dosier de la junta', secciones: s.length, bytes: texto.length });
  }
}

// Las fichas de AU-RA: ya son unidades de sentido, entran tal cual.
const saberAura = join(RAIZ, 'infra/cerebro/conocimiento/saber.json');
let fichas = [];
if (existsSync(saberAura)) {
  const raw = readFileSync(saberAura, 'utf8');
  huellas['infra/cerebro/conocimiento/saber.json'] = createHash('sha1').update(raw).digest('hex');
  const d = JSON.parse(raw);
  fichas = (d.fichas || []).map((f) => ({
    id: 'aura-' + f.id,
    fuente: 'infra/cerebro/conocimiento/saber.json',
    tema: f.tema || 'AU-RA',
    peso: 3,
    titulo: f.tema ? `${f.tema} › ${f.id}` : f.id,
    /* Se conserva si la ficha es PÚBLICA y quién la revisó. ULTRON habla con
       la junta y puede decir lo que AU-RA no dice; pero tiene que saber cuál
       es cuál para no filtrar en un correo a fuera lo que era de puertas
       adentro. */
    publico: f.publico === true,
    revisadoPor: f.revisadoPor || null,
    palabras: f.palabras || [],
    texto: [f.respuesta, f.texto, f.contenido, f.detalle].filter(Boolean).join('\n\n')
      || JSON.stringify(f),
  }));
  secciones.push(...fichas);
  fuentesLeidas.push({ ruta: 'infra/cerebro/conocimiento/saber.json', tema: 'Fichas de AU-RA', secciones: fichas.length, bytes: raw.length });
}

// `--comprobar`: no escribe nada; dice si lo armado sigue al día con los
// documentos. Lo usa el despliegue para no subir un saber viejo.
if (process.argv.includes('--comprobar')) {
  const previo = existsSync(join(SALIDA, 'indice.json')) ? JSON.parse(readFileSync(join(SALIDA, 'indice.json'), 'utf8')) : null;
  const viejas = previo ? Object.entries(huellas).filter(([r, h]) => previo.huellas?.[r] !== h).map(([r]) => r) : ['(nunca se armó)'];
  const idas = previo ? Object.keys(previo.huellas || {}).filter((r) => !(r in huellas)) : [];
  if (viejas.length || idas.length) {
    console.log(`saber desfasado: cambiaron ${[...viejas, ...idas.map((r) => r + ' (ya no existe)')].join(', ')}`);
    process.exit(1);
  }
  console.log(`saber al día · ${Object.keys(huellas).length} fuentes · armado ${previo.armadoEn}`);
  process.exit(0);
}

const salida = {
  armadoEn: new Date().toISOString(),
  fuentes: fuentesLeidas,
  huellas,
  total: secciones.length,
  bytes: secciones.reduce((a, s) => a + s.texto.length, 0),
};
writeFileSync(join(SALIDA, 'indice.json'), JSON.stringify(salida, null, 1));
writeFileSync(join(SALIDA, 'secciones.json'), JSON.stringify(secciones));

console.log(`\nULTRON · saber armado ${salida.armadoEn}`);
for (const f of fuentesLeidas) console.log(`  ${String(f.secciones).padStart(4)} secc · ${f.ruta}`);
console.log(`\n  ${salida.total} secciones · ${(salida.bytes / 1024).toFixed(0)} KB de texto · ${fichas.filter((x) => x.publico).length} fichas públicas de ${fichas.length}`);
