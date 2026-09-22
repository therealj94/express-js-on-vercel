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
 * Las ocho máquinas que vigila: estados y transiciones del binding, su
 * terminalidad, estados y transiciones de la cuenta, transiciones del alias, y
 * ejes y transiciones del ciclo de vida del activo. El lado del código sale de
 * `sdk/src/tipos.ts`, `sdk/src/binding.ts` y `sdk/src/maquinas.ts`; ninguna de
 * las tres se lee interpretando lógica, todas declaran la máquina en una tabla.
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
const RUTA_MAQUINAS = join(raiz, 'sdk', 'src', 'maquinas.ts');

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

/** Todas las tablas markdown de un texto, cada una como filas sin cabecera ni
 *  separador. Se devuelven todas porque una sección puede llevar la tabla de
 *  estados y la de transiciones, y cada comprobación quiere una distinta. */
function tablas(texto) {
  const encontradas = [];
  let actual = null;
  for (const linea of texto.split('\n')) {
    const esFila = /^\s*\|.*\|\s*$/.test(linea);
    if (!esFila) {
      if (actual) {
        encontradas.push(actual);
        actual = null;
      }
      continue;
    }
    const celdas = linea.trim().slice(1, -1).split('|').map((c) => c.trim());
    if (/^:?-{2,}:?$/.test(celdas[0])) {
      actual = actual ?? [];
      continue;
    }
    if (actual) actual.push(celdas);
  }
  if (actual) encontradas.push(actual);
  return encontradas;
}

/** Filas de la primera tabla markdown de un texto. */
const filasDeTabla = (texto) => tablas(texto)[0] ?? [];

/** Filas de la tabla número `n` (base 0), o lista vacía si no hay tantas. */
const filasDeTablaN = (texto, n) => tablas(texto)[n] ?? [];

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

/** Un mapa `const NOMBRE: Record<...> = { A: ['B'], ... }` del SDK. */
function mapaDeTransiciones(codigo, nombre = 'TRANSICIONES') {
  const m = new RegExp(`const ${nombre}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(codigo);
  if (!m) return null;
  return mapaDeCuerpo(m[1]);
}

/** El cuerpo `A: ['B', 'C'], D: []` convertido en objeto. */
function mapaDeCuerpo(cuerpo) {
  const mapa = {};
  for (const fila of cuerpo.matchAll(/([A-Z_]+)\s*:\s*\[([^\]]*)\]/g)) {
    mapa[fila[1]] = [...fila[2].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
  }
  return Object.keys(mapa).length ? mapa : null;
}

/** El mapa anidado `const NOMBRE: ... = { eje: { A: ['B'] }, ... }`, un nivel
 *  más hondo: devuelve `{ eje: { A: ['B'] } }`. */
function mapaAnidadoDeTransiciones(codigo, nombre) {
  const m = new RegExp(`const ${nombre}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(codigo);
  if (!m) return null;
  const mapa = {};
  for (const bloque of m[1].matchAll(/\n {2}([a-zA-Z]+):\s*\{([\s\S]*?)\n {2}\}/g)) {
    const interno = mapaDeCuerpo(bloque[2]);
    if (interno) mapa[bloque[1]] = interno;
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
const codigoMaquinas = leer(RUTA_MAQUINAS);

/** Pares `desde -> hacia` de una tabla markdown con las columnas desde y hacia
 *  en las posiciones dadas. Una celda sin ningún estado (por ejemplo
 *  `(ninguna)`) no aporta par: declara un estado terminal, no una transición. */
function paresDeTabla(filas, iDesde, iHacia) {
  const pares = [];
  for (const f of filas) {
    const desde = estadosDe(f[iDesde] ?? '')[0];
    if (!desde) continue;
    for (const hacia of estadosDe(f[iHacia] ?? '')) pares.push(`${desde} -> ${hacia}`);
  }
  return pares;
}

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
    /* §5.2 declara la máquina en una tabla `desde | hacia | quién autoriza |
       motivo`. Antes la dibujaba con flechas repartidas por varias líneas y
       sólo se leían cuatro de las catorce transiciones: el resto habría que
       adivinarlo, y aquí no se adivina. Si alguien devuelve el dibujo y quita
       la tabla, esto vuelve a decir NO_COMPROBADA en vez de dar por buena una
       lectura parcial. */
    const filas = filasDeTabla(secMaquina);
    const paresEspec = paresDeTabla(filas, 0, 1);
    const hayArteMultilinea = /^\s*[|v+\\/]/m.test(secMaquina);
    const paresCodigo = aPares(transCodigo);

    if (paresEspec.length === 0) {
      noComprobada(
        'binding.transiciones',
        'el §5.2 de SFSP-130 no declara las transiciones en una tabla legible ' +
          `${hayArteMultilinea ? '(sigue habiendo arte ASCII de varias líneas) ' : ''}` +
          'y no hay nada fiable que comparar con TRANSICIONES de binding.ts.',
        [`transiciones que el código admite (${paresCodigo.length}): ${paresCodigo.join(', ')}`],
      );
    } else {
      const d = comparar(paresEspec, paresCodigo);
      if (d.soloEspec.length === 0 && d.soloCodigo.length === 0) {
        conforme(
          'binding.transiciones',
          `${paresCodigo.length} transiciones, iguales en spec §5.2 y en TRANSICIONES`,
        );
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

  /* §5.3 lleva dos tablas: la primera es estado a efecto, la segunda es la
     máquina. Se pide la segunda por posición, no por adivinanza. */
  const paresCuentaEspec = secCuenta ? paresDeTabla(filasDeTablaN(secCuenta, 1), 0, 1) : [];
  const transCuentaCodigo = codigoMaquinas
    ? mapaDeTransiciones(codigoMaquinas, 'TRANSICIONES_CUENTA')
    : null;

  if (paresCuentaEspec.length === 0) {
    noComprobada(
      'cuenta.transiciones',
      'el §5.3 de SFSP-130 no declara las transiciones de la cuenta en una tabla legible',
    );
  } else if (transCuentaCodigo === null) {
    noComprobada(
      'cuenta.transiciones',
      'no se pudo extraer TRANSICIONES_CUENTA de sdk/src/maquinas.ts',
    );
  } else {
    const paresCuentaCodigo = aPares(transCuentaCodigo);
    const d = comparar(paresCuentaEspec, paresCuentaCodigo);
    if (d.soloEspec.length === 0 && d.soloCodigo.length === 0) {
      conforme(
        'cuenta.transiciones',
        `${paresCuentaCodigo.length} transiciones, iguales en spec §5.3 y en TRANSICIONES_CUENTA`,
      );
    } else {
      divergente('cuenta.transiciones', 'las transiciones de cuenta declaradas y las implementadas no coinciden', [
        ...d.soloEspec.map((x) => `la spec declara «${x}» y el código no la admite`),
        ...d.soloCodigo.map((x) => `el código admite «${x}» y la spec no la declara`),
      ]);
    }
  }

  /* ================================================== 4 · alias, transiciones */

  const secAlias = seccion(doc130, /Ciclo de vida del alias/i);
  const filasAlias = secAlias ? filasDeTabla(secAlias) : [];
  const transAlias = filasAlias
    .map((f) => ({ desde: estadosDe(f[0])[0], hacia: estadosDe(f[2] ?? '') }))
    .filter((t) => t.desde);

  const transAliasCodigo = codigoMaquinas
    ? mapaDeTransiciones(codigoMaquinas, 'TRANSICIONES_ALIAS')
    : null;

  if (transAlias.length === 0) {
    noComprobada('alias.transiciones', 'no se pudo leer la tabla §4.4 de SFSP-130');
  } else if (transAliasCodigo === null) {
    noComprobada('alias.transiciones', 'no se pudo extraer TRANSICIONES_ALIAS de sdk/src/maquinas.ts');
  } else {
    const paresAliasEspec = transAlias.flatMap((t) => t.hacia.map((h) => `${t.desde} -> ${h}`));
    const paresAliasCodigo = aPares(transAliasCodigo);
    const d = comparar(paresAliasEspec, paresAliasCodigo);
    if (d.soloEspec.length === 0 && d.soloCodigo.length === 0) {
      conforme(
        'alias.transiciones',
        `${paresAliasCodigo.length} transiciones, iguales en spec §4.4 y en TRANSICIONES_ALIAS`,
      );
    } else {
      divergente('alias.transiciones', 'las transiciones de alias declaradas y las implementadas no coinciden', [
        ...d.soloEspec.map((x) => `la spec declara «${x}» y el código no la admite`),
        ...d.soloCodigo.map((x) => `el código admite «${x}» y la spec no la declara`),
      ]);
    }
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

  /* §4.1 declara `eje | desde | hacia | autoridad`. Son seis máquinas, no una,
     así que se comparan eje por eje: decir «hay 33 transiciones y coinciden»
     escondería que dos ejes se intercambiaron las suyas. */
  const filasTrans = filasDeTablaN(sec ?? '', 1);
  const transEspec = {};
  for (const f of filasTrans) {
    const eje = (/`([a-zA-Z]+)`/.exec(f[0] ?? '') ?? [])[1];
    const desde = estadosDe(f[1] ?? '')[0];
    if (!eje || !desde) continue;
    transEspec[eje] = transEspec[eje] ?? new Set();
    /* Una celda «hacia» sin ningún estado declara un eje terminal en ese valor:
       no aporta par, y no aportarlo es justamente lo que hay que comparar. */
    for (const hacia of estadosDe(f[2] ?? '')) transEspec[eje].add(`${desde} -> ${hacia}`);
  }
  const transCodigoActivo = codigoMaquinas
    ? mapaAnidadoDeTransiciones(codigoMaquinas, 'TRANSICIONES_ACTIVO')
    : null;

  if (Object.keys(transEspec).length === 0) {
    noComprobada('activo.transiciones', 'la tabla §4.1 de SFSP-100 no se pudo leer como tabla');
  } else if (transCodigoActivo === null) {
    noComprobada(
      'activo.transiciones',
      'no se pudo extraer TRANSICIONES_ACTIVO de sdk/src/maquinas.ts',
    );
  } else {
    const dif = [];
    let total = 0;
    const ejes = new Set([...Object.keys(transEspec), ...Object.keys(transCodigoActivo)]);
    for (const eje of ejes) {
      const enEspec = [...(transEspec[eje] ?? [])];
      const enCodigo = transCodigoActivo[eje] ? aPares(transCodigoActivo[eje]) : null;
      if (enCodigo === null) {
        dif.push(`la spec declara transiciones del eje ${eje} y TRANSICIONES_ACTIVO no lo tiene`);
        continue;
      }
      if (enEspec.length === 0) {
        dif.push(`TRANSICIONES_ACTIVO tiene el eje ${eje} y la spec §4.1 no lo declara`);
        continue;
      }
      total += enCodigo.length;
      const d = comparar(enEspec, enCodigo);
      for (const x of d.soloEspec) dif.push(`${eje}: la spec declara «${x}» y el código no la admite`);
      for (const x of d.soloCodigo) dif.push(`${eje}: el código admite «${x}» y la spec no la declara`);
    }
    if (dif.length === 0) {
      conforme(
        'activo.transiciones',
        `${total} transiciones en ${ejes.size} ejes, iguales en spec §4.1 y en TRANSICIONES_ACTIVO`,
      );
    } else {
      divergente('activo.transiciones', 'las transiciones del ciclo de vida del activo divergen', dif);
    }
  }
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
