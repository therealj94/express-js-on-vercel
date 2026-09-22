#!/usr/bin/env node
/* C09 · conformidad entre la especificación y el código.
 *
 * El problema que cierra: las máquinas de estado de `spec/` y las del código se
 * escribieron por separado, en días distintos, y nadie comprueba que sigan
 * siendo la misma. Una especificación que nadie contrasta contra el código es
 * prosa; un código que nadie contrasta contra la especificación es una opinión.
 *
 * Qué hace: extrae de `spec/SFSP-130-ACCOUNT-KEY.md` y `spec/SFSP-100-CORE.md`
 * los conjuntos de estados y las transiciones que están DECLARADOS en tablas, y
 * los compara con los que el código implementa. Si el código admite una
 * transición que la especificación no declara, o la especificación declara una
 * que el código no admite, falla y la nombra.
 *
 * Qué NO hace, y lo dice: cuando una máquina sólo está dibujada como arte ASCII
 * con flechas de varias líneas, o cuando el código no la declara en ningún
 * sitio y las transiciones ocurren sueltas en asignaciones, la extracción no es
 * fiable. En ese caso el resultado es NO_COMPROBADA, con el motivo exacto. Dar
 * por buena una conformidad que no se comprobó es peor que no comprobarla: es
 * la misma clase de afirmación sin evidencia que este árbol dice no permitirse.
 *
 *   node scripts/conformidad.mjs              informa; falla sólo si hay divergencia
 *   node scripts/conformidad.mjs --estricto   falla también si algo quedó NO_COMPROBADA
 *
 * Sin dependencias: sólo módulos de Node.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const estricto = process.argv.includes('--estricto');

const RUTA_130 = join(raiz, 'spec', 'SFSP-130-ACCOUNT-KEY.md');
const RUTA_100 = join(raiz, 'spec', 'SFSP-100-CORE.md');
const RUTA_TIPOS = join(raiz, 'sdk', 'src', 'tipos.ts');
const RUTA_BINDING = join(raiz, 'sdk', 'src', 'binding.ts');

/* --------------------------------------------------------------- utilidades */

function leer(ruta) {
  if (!existsSync(ruta)) return null;
  return readFileSync(ruta, 'utf8');
}

/** Devuelve el texto de una sección markdown, desde su encabezado hasta el
 *  siguiente encabezado de nivel igual o superior. */
function seccion(texto, patronTitulo) {
  const lineas = texto.split('\n');
  let inicio = -1;
  let nivel = 0;
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lineas[i]);
    if (!m) continue;
    if (inicio === -1 && patronTitulo.test(m[2])) {
      inicio = i + 1;
      nivel = m[1].length;
      continue;
    }
    if (inicio !== -1 && m[1].length <= nivel) return lineas.slice(inicio, i).join('\n');
  }
  return inicio === -1 ? null : lineas.slice(inicio).join('\n');
}

/** Filas de la primera tabla markdown de un texto, sin cabecera ni separador. */
function filasDeTabla(texto) {
  const filas = [];
  let dentro = false;
  for (const linea of texto.split('\n')) {
    const esFila = /^\s*\|.*\|\s*$/.test(linea);
    if (!esFila) {
      if (dentro) break;
      continue;
    }
    const celdas = linea.trim().slice(1, -1).split('|').map((c) => c.trim());
    if (/^:?-{2,}:?$/.test(celdas[0])) {
      dentro = true;
      continue;
    }
    if (dentro) filas.push(celdas);
  }
  return filas;
}

/** Los ESTADOS que una celda menciona, en mayúsculas con guión bajo. */
const estadosDe = (celda) => [...celda.matchAll(/`([A-Z][A-Z_]{2,})`/g)].map((m) => m[1]);

/** Miembros de una unión de literales de un `export type X = 'A' | 'B';`. */
function unionDeTipo(codigo, nombre) {
  const re = new RegExp(`export type ${nombre}\\s*=([^;]+);`);
  const m = re.exec(codigo);
  if (!m) return null;
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
}

/** Unión de literales de un campo dentro de un `export interface X { ... }`. */
function unionDeCampo(codigo, interfaz, campo) {
  const re = new RegExp(`export interface ${interfaz}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = re.exec(codigo);
  if (!m) return null;
  const linea = new RegExp(`\\n\\s*${campo}\\s*:([^;\\n]+);`).exec(`\n${m[1]}`);
  if (!linea) return null;
  return [...linea[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
}

/** El mapa `const TRANSICIONES: Record<...> = { A: ['B'], ... }` de binding.ts. */
function mapaDeTransiciones(codigo) {
  const m = /const TRANSICIONES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(codigo);
  if (!m) return null;
  const mapa = {};
  for (const fila of m[1].matchAll(/([A-Z_]+)\s*:\s*\[([^\]]*)\]/g)) {
    mapa[fila[1]] = [...fila[2].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
  }
  return Object.keys(mapa).length ? mapa : null;
}

const aPares = (mapa) =>
  Object.entries(mapa).flatMap(([desde, hacia]) => hacia.map((h) => `${desde} -> ${h}`));

/* ------------------------------------------------------------- informe ----- */

const informe = [];
const conforme = (maquina, detalle) => informe.push({ maquina, estado: 'CONFORME', detalle });
const divergente = (maquina, detalle, diferencias) =>
  informe.push({ maquina, estado: 'DIVERGENTE', detalle, diferencias });
const noComprobada = (maquina, motivo, notas = []) =>
  informe.push({ maquina, estado: 'NO_COMPROBADA', detalle: motivo, notas });

/** Compara dos conjuntos y devuelve lo que sobra a cada lado. */
function comparar(delEspec, delCodigo) {
  const espec = new Set(delEspec);
  const codigo = new Set(delCodigo);
  return {
    soloEspec: [...espec].filter((x) => !codigo.has(x)),
    soloCodigo: [...codigo].filter((x) => !espec.has(x)),
  };
}

/* ======================================================= 1 · binding, estados */

const doc130 = leer(RUTA_130);
const tipos = leer(RUTA_TIPOS);
const codigoBinding = leer(RUTA_BINDING);

if (doc130 === null) {
  noComprobada('binding.estados', `no se encontró ${RUTA_130}`);
  noComprobada('binding.transiciones', `no se encontró ${RUTA_130}`);
} else if (tipos === null) {
  noComprobada('binding.estados', `no se encontró ${RUTA_TIPOS}`);
} else {
  const sec = seccion(doc130, /Los seis estados/i);
  const filas = sec ? filasDeTabla(sec) : [];
  const estadosEspec = filas.map((f) => estadosDe(f[0])[0]).filter(Boolean);
  const estadosCodigo = unionDeTipo(tipos, 'BindingStatus');

  if (estadosEspec.length === 0) {
    noComprobada('binding.estados', 'la tabla §5.1 de SFSP-130 no se pudo leer como tabla');
  } else if (estadosCodigo === null) {
    noComprobada('binding.estados', 'no se pudo extraer la unión BindingStatus de sdk/src/tipos.ts');
  } else {
    const d = comparar(estadosEspec, estadosCodigo);
    if (d.soloEspec.length === 0 && d.soloCodigo.length === 0) {
      conforme('binding.estados', `${estadosEspec.length} estados, iguales en spec §5.1 y en BindingStatus`);
    } else {
      divergente('binding.estados', 'los estados declarados y los implementados no coinciden', [
        ...d.soloEspec.map((x) => `la spec declara el estado ${x} y el código no lo tiene`),
        ...d.soloCodigo.map((x) => `el código tiene el estado ${x} y la spec no lo declara`),
      ]);
    }
  }

  /* ============================================== 2 · binding, transiciones */

  const secMaquina = seccion(doc130, /Máquina de estado del binding/i);
  const transCodigo = codigoBinding ? mapaDeTransiciones(codigoBinding) : null;

  if (secMaquina === null) {
    noComprobada('binding.transiciones', 'no se encontró §5.2 en SFSP-130');
  } else if (transCodigo === null) {
    noComprobada(
      'binding.transiciones',
      'no se pudo extraer el mapa TRANSICIONES de sdk/src/binding.ts',
    );
  } else {
    /* Lo único que se puede leer de forma fiable del §5.2 son las flechas que
       caben en una línea: `[ A ] --motivo--> [ B ]`. El resto del diagrama son
       flechas dibujadas con `|`, `v`, `\` y `+--` repartidas por varias líneas,
       y leerlas exigiría adivinar. No se adivina. */
    const legibles = new Set();
    for (const l of secMaquina.split('\n')) {
      for (const m of l.matchAll(/\[\s*([A-Z_]+)\s*\][^[\]]*?<?-{2,}>?[^[\]]*?\[\s*([A-Z_]+)\s*\]/g)) {
        const [, a, b] = m;
        legibles.add(`${a} -> ${b}`);
        if (/<-{2,}/.test(m[0]) && /-{2,}>/.test(m[0])) legibles.add(`${b} -> ${a}`);
      }
    }
    const hayArteMultilinea = /^\s*[|v+\\/]/m.test(secMaquina);
    const paresCodigo = aPares(transCodigo);
    const sinRespaldo = paresCodigo.filter((p) => !legibles.has(p));

    if (hayArteMultilinea) {
      noComprobada(
        'binding.transiciones',
        'el §5.2 de SFSP-130 dibuja la máquina como arte ASCII con flechas de varias ' +
          'líneas (|, v, \\, +--). Sólo se pueden leer con fiabilidad las flechas de una ' +
          'sola línea, así que la comparación completa NO se hizo.',
        [
          `flechas de una línea leídas de la spec (${legibles.size}): ${[...legibles].join(', ') || 'ninguna'}`,
          `transiciones que el código admite (${paresCodigo.length}): ${paresCodigo.join(', ')}`,
          `transiciones del código sin una flecha legible que las respalde (${sinRespaldo.length}): ` +
            `${sinRespaldo.join(', ') || 'ninguna'}. Puede que el diagrama las dibuje en vertical; ` +
            `no se afirma que sobren.`,
          'Para cerrar esto: que §5.2 lleve, además del dibujo, una tabla `desde | hacia | quién autoriza`.',
        ],
      );
    } else {
      const d = comparar([...legibles], paresCodigo);
      if (d.soloEspec.length === 0 && d.soloCodigo.length === 0) {
        conforme('binding.transiciones', `${paresCodigo.length} transiciones, iguales en spec y código`);
      } else {
        divergente('binding.transiciones', 'las transiciones declaradas y las implementadas no coinciden', [
          ...d.soloEspec.map((x) => `la spec declara «${x}» y el código no la admite`),
          ...d.soloCodigo.map((x) => `el código admite «${x}» y la spec no la declara`),
        ]);
      }
    }

    /* Esta regla del §5.2 sí está escrita en prosa normativa y sin ambigüedad,
       y por eso sí se comprueba: «REVOKED es terminal». */
    const declaraTerminal = /`REVOKED`\s+es\s+terminal/i.test(secMaquina);
    const salidasDeRevoked = transCodigo.REVOKED ?? [];
    if (declaraTerminal && salidasDeRevoked.length > 0) {
      divergente('binding.terminalidad', 'la spec declara REVOKED terminal y el código deja salir de él', [
        `el código admite REVOKED -> ${salidasDeRevoked.join(', ')}`,
      ]);
    } else if (declaraTerminal) {
      conforme('binding.terminalidad', 'REVOKED es terminal en la spec §5.2 y en TRANSICIONES');
    } else {
      noComprobada('binding.terminalidad', 'la spec ya no declara en §5.2 que REVOKED sea terminal');
    }
  }

  /* ================================================ 3 · cuenta, estados */

  const secCuenta = seccion(doc130, /Máquina de estado de la cuenta/i);
  const estadosCuentaEspec = secCuenta
    ? filasDeTabla(secCuenta).map((f) => estadosDe(f[0])[0]).filter(Boolean)
    : [];
  const estadosCuentaCodigo = tipos ? unionDeTipo(tipos, 'AccountStatus') : null;

  if (estadosCuentaEspec.length === 0 || estadosCuentaCodigo === null) {
    noComprobada('cuenta.estados', 'no se pudo leer la tabla §5.3 de SFSP-130 o la unión AccountStatus');
  } else {
    const d = comparar(estadosCuentaEspec, estadosCuentaCodigo);
    if (d.soloEspec.length === 0 && d.soloCodigo.length === 0) {
      conforme('cuenta.estados', `${estadosCuentaEspec.length} estados, iguales en spec §5.3 y en AccountStatus`);
    } else {
      divergente('cuenta.estados', 'los estados de cuenta declarados y los implementados no coinciden', [
        ...d.soloEspec.map((x) => `la spec declara ${x} y el código no lo tiene`),
        ...d.soloCodigo.map((x) => `el código tiene ${x} y la spec no lo declara`),
      ]);
    }
  }

  noComprobada(
    'cuenta.transiciones',
    'el código no declara en ningún sitio la máquina de estado de la cuenta: no hay un ' +
      'mapa de transiciones equivalente a TRANSICIONES de binding.ts, y los estados se ' +
      'asignan sueltos en directorio.ts. No hay nada que comparar contra §5.3.',
    ['Para cerrar esto: un mapa de transiciones de AccountStatus en el SDK, y una tabla en §5.3.'],
  );

  /* ================================================== 4 · alias, transiciones */

  const secAlias = seccion(doc130, /Ciclo de vida del alias/i);
  const filasAlias = secAlias ? filasDeTabla(secAlias) : [];
  const transAlias = filasAlias
    .map((f) => ({ desde: estadosDe(f[0])[0], hacia: estadosDe(f[2] ?? '') }))
    .filter((t) => t.desde);

  if (transAlias.length === 0) {
    noComprobada('alias.transiciones', 'no se pudo leer la tabla §4.4 de SFSP-130');
  } else {
    noComprobada(
      'alias.transiciones',
      'la spec §4.4 sí declara las transiciones en tabla, pero el código no declara la ' +
        'máquina de alias en ningún sitio: los estados se asignan en `directorio.ts` ' +
        '(`viejo.status = \'RELEASED\'`) sin un mapa de transiciones que comparar. No se ' +
        'da por conforme lo que no se pudo leer.',
      [
        `declaradas en la spec: ${transAlias
          .map((t) => (t.hacia.length ? t.hacia.map((h) => `${t.desde} -> ${h}`).join(', ') : `${t.desde} -> (ninguna)`))
          .join(', ')}`,
        'Para cerrar esto: un mapa de transiciones de alias en el SDK, como el de binding.ts.',
      ],
    );
  }
}

/* ============================================ 5 · ciclo de vida del activo */

const doc100 = leer(RUTA_100);

if (doc100 === null || tipos === null) {
  noComprobada('activo.ejes', 'no se encontró SFSP-100-CORE.md o sdk/src/tipos.ts');
} else {
  const sec = seccion(doc100, /Los cinco ejes de estado/i);
  const filas = sec ? filasDeTabla(sec) : [];
  /* La tabla del §4 es eje -> valores; el código es la interfaz AssetLifecycle.
     Las dos son declaraciones explícitas, así que esta comparación SÍ es fiable. */
  const ejesEspec = filas
    .map((f) => ({ eje: (/`([a-zA-Z]+)`/.exec(f[0]) ?? [])[1], valores: estadosDe(f[1] ?? '') }))
    .filter((e) => e.eje && e.valores.length);

  if (ejesEspec.length === 0) {
    noComprobada('activo.ejes', 'la tabla §4 de SFSP-100 no se pudo leer como tabla');
  } else {
    const diferencias = [];
    for (const { eje, valores } of ejesEspec) {
      const enCodigo = unionDeCampo(tipos, 'AssetLifecycle', eje);
      if (enCodigo === null) {
        diferencias.push(`la spec declara el eje ${eje} y AssetLifecycle no lo tiene`);
        continue;
      }
      const d = comparar(valores, enCodigo);
      for (const x of d.soloEspec) diferencias.push(`${eje}: la spec declara ${x} y el código no`);
      for (const x of d.soloCodigo) diferencias.push(`${eje}: el código admite ${x} y la spec no lo declara`);
    }
    const m = /export interface AssetLifecycle\s*\{([\s\S]*?)\n\}/.exec(tipos);
    const ejesCodigo = m ? [...m[1].matchAll(/\n\s*([a-zA-Z]+)\s*:/g)].map((x) => x[1]) : [];
    for (const eje of ejesCodigo) {
      if (!ejesEspec.some((e) => e.eje === eje)) {
        diferencias.push(`AssetLifecycle tiene el eje ${eje} y la spec §4 no lo declara`);
      }
    }
    if (diferencias.length === 0) {
      conforme('activo.ejes', `${ejesEspec.length} ejes con sus valores, iguales en spec §4 y en AssetLifecycle`);
    } else {
      divergente('activo.ejes', 'los ejes del ciclo de vida del activo divergen', diferencias);
    }
  }

  noComprobada(
    'activo.transiciones',
    'SFSP-100 §4 declara los VALORES de cada eje pero ninguna tabla de transiciones: ' +
      'dice que cada eje tiene su propia autoridad y su propio registro, sin decir qué ' +
      'transición es admisible. El código tampoco las declara. No hay dos cosas que comparar.',
    ['Para cerrar esto: una tabla `eje | desde | hacia | autoridad` en SFSP-100 §4, y su mapa en el SDK.'],
  );
}

/* ------------------------------------------------------------------ salida */

const ancho = Math.max(...informe.map((i) => i.maquina.length));
console.log('\nConformidad entre spec/ y código (C09)\n');

for (const i of informe) {
  console.log(`  ${i.maquina.padEnd(ancho)}  ${i.estado}`);
  console.log(`  ${' '.repeat(ancho)}  ${i.detalle}`);
  for (const d of i.diferencias ?? []) console.log(`  ${' '.repeat(ancho)}  · ${d}`);
  for (const n of i.notas ?? []) console.log(`  ${' '.repeat(ancho)}  - ${n}`);
  console.log('');
}

const divergentes = informe.filter((i) => i.estado === 'DIVERGENTE');
const sinComprobar = informe.filter((i) => i.estado === 'NO_COMPROBADA');
const conformes = informe.filter((i) => i.estado === 'CONFORME');

console.log(
  `  resumen: ${conformes.length} conforme(s), ${divergentes.length} divergente(s), ` +
    `${sinComprobar.length} NO_COMPROBADA(s)`,
);

if (divergentes.length) {
  console.log('\n  Una divergencia significa que la especificación y el código dicen cosas');
  console.log('  distintas. No se decide aquí cuál de las dos está mal: se nombra y se corrige.');
}
if (sinComprobar.length) {
  console.log('\n  NO_COMPROBADA no es conformidad. Es una máquina que nadie está vigilando.');
}
console.log('');

process.exit(divergentes.length || (estricto && sinComprobar.length) ? 1 : 0);
