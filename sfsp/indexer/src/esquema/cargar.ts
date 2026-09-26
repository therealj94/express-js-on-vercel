// Lectura y validacion de `spec/eventos.json`, la fuente unica de eventos.
//
// POR QUE vive fuera de la biblioteca: `index.ts` no exporta este modulo. La
// biblioteca del indexador sigue siendo logica pura sin acceso a disco; esto es
// herramienta de generacion y de prueba, que si puede leer el arbol.
//
// POR QUE se busca el archivo hacia arriba en vez de usar una ruta relativa
// fija: el mismo modulo se ejecuta desde `src/` (tsc) y desde `dist/` (node
// --test), y el informe ya senalo (P07) que las rutas relativas fragiles hacen
// que una prueba no corra fuera de la maquina de quien la escribio.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Un campo de un evento, tal como lo declara la fuente unica. */
export interface CampoEvento {
  readonly nombre: string;
  readonly tipo: string;
  readonly indexado: boolean;
  readonly obligatorio: boolean;
  /** true si sin este campo el evento NO se puede atribuir a un activo. */
  readonly atribuyeActivo: boolean;
  /** true si el valor es un entero en unidades base (§5). */
  readonly esCantidad: boolean;
}

/** Efecto del evento sobre el suministro del activo. */
export type EfectoSuministro = 'AUMENTA' | 'DISMINUYE' | 'AUTORIZA' | 'NINGUNO';

export interface EventoEspecificado {
  readonly nombre: string;
  readonly emisor: string;
  readonly significado: string;
  /** `POR_ACTIVO` exige al menos un campo con `atribuyeActivo`. */
  readonly atribucion: 'POR_ACTIVO' | 'GLOBAL';
  readonly afectaSuministro: EfectoSuministro;
  readonly implementadoEnContratos: boolean;
  readonly campos: readonly CampoEvento[];
}

export interface AliasRetirado {
  readonly canonico: string;
  readonly porQue: string;
}

export interface EspecEventos {
  readonly version: string;
  readonly reglas: readonly string[];
  readonly aliasesRetirados: Readonly<Record<string, AliasRetirado>>;
  readonly eventos: readonly EventoEspecificado[];
}

/** Maximo de campos indexados por evento en Solidity. */
const MAX_INDEXADOS = 3;

const TIPOS_ADMITIDOS = new Set([
  'bytes32',
  'address',
  'uint256',
  'uint64',
  'uint32',
  // Puntos básicos (diferenciales, tolerancias, límites) del oráculo, las
  // reservas y la tesorería (SFSP v0.3 fase 2).
  'uint16',
  'uint8',
  'bool',
  'string',
]);

function falla(mensaje: string): never {
  // POR QUE una excepcion y no un codigo: un JSON de eventos mal formado es un
  // defecto de programacion del arbol, no una decision de politica. Debe romper
  // la compuerta, no degradarse a un valor por defecto.
  throw new Error(`spec/eventos.json invalido: ${mensaje}`);
}

/** Ruta absoluta de `spec/eventos.json`, buscada hacia arriba desde este modulo. */
export function rutaEspecEventos(desde?: string): string {
  let dir = desde ?? dirname(fileURLToPath(import.meta.url));
  for (let salto = 0; salto < 12; salto += 1) {
    const candidato = join(dir, 'spec', 'eventos.json');
    if (existsSync(candidato)) return candidato;
    const padre = resolve(dir, '..');
    if (padre === dir) break;
    dir = padre;
  }
  falla('no se encontro el archivo subiendo desde ' + (desde ?? 'el modulo'));
}

function leerCampo(valor: unknown, evento: string, indice: number): CampoEvento {
  if (typeof valor !== 'object' || valor === null) {
    falla(`${evento}: el campo ${indice} no es un objeto`);
  }
  const c = valor as Record<string, unknown>;
  const nombre = c['nombre'];
  const tipo = c['tipo'];
  if (typeof nombre !== 'string' || nombre === '') {
    falla(`${evento}: campo ${indice} sin nombre`);
  }
  if (typeof tipo !== 'string' || !TIPOS_ADMITIDOS.has(tipo)) {
    falla(`${evento}.${nombre}: tipo no admitido (${String(tipo)})`);
  }
  for (const bandera of ['indexado', 'obligatorio', 'atribuyeActivo', 'esCantidad']) {
    if (typeof c[bandera] !== 'boolean') {
      falla(`${evento}.${nombre}: la bandera '${bandera}' debe ser booleana`);
    }
  }
  return {
    nombre,
    tipo,
    indexado: c['indexado'] as boolean,
    obligatorio: c['obligatorio'] as boolean,
    atribuyeActivo: c['atribuyeActivo'] as boolean,
    esCantidad: c['esCantidad'] as boolean,
  };
}

function leerEvento(valor: unknown, indice: number): EventoEspecificado {
  if (typeof valor !== 'object' || valor === null) {
    falla(`el evento ${indice} no es un objeto`);
  }
  const e = valor as Record<string, unknown>;
  const nombre = e['nombre'];
  if (typeof nombre !== 'string' || nombre === '') falla(`evento ${indice} sin nombre`);
  const emisor = e['emisor'];
  if (typeof emisor !== 'string' || emisor === '') falla(`${nombre}: sin emisor`);
  const significado = e['significado'];
  if (typeof significado !== 'string') falla(`${nombre}: sin significado`);
  const atribucion = e['atribucion'];
  if (atribucion !== 'POR_ACTIVO' && atribucion !== 'GLOBAL') {
    falla(`${nombre}: atribucion debe ser POR_ACTIVO o GLOBAL`);
  }
  const afecta = e['afectaSuministro'];
  if (
    afecta !== 'AUMENTA' &&
    afecta !== 'DISMINUYE' &&
    afecta !== 'AUTORIZA' &&
    afecta !== 'NINGUNO'
  ) {
    falla(`${nombre}: afectaSuministro no reconocido`);
  }
  if (typeof e['implementadoEnContratos'] !== 'boolean') {
    falla(`${nombre}: implementadoEnContratos debe ser booleano`);
  }
  const crudos = e['campos'];
  if (!Array.isArray(crudos) || crudos.length === 0) falla(`${nombre}: sin campos`);
  const campos = crudos.map((c, i) => leerCampo(c, nombre, i));

  const vistos = new Set<string>();
  for (const c of campos) {
    if (vistos.has(c.nombre)) falla(`${nombre}: campo repetido '${c.nombre}'`);
    vistos.add(c.nombre);
  }
  const indexados = campos.filter((c) => c.indexado).length;
  if (indexados > MAX_INDEXADOS) {
    falla(`${nombre}: ${indexados} campos indexados; Solidity admite ${MAX_INDEXADOS}`);
  }
  const atribuyen = campos.filter((c) => c.atribuyeActivo);
  if (atribucion === 'POR_ACTIVO' && atribuyen.length === 0) {
    falla(`${nombre}: declarado POR_ACTIVO pero ningun campo atribuye activo`);
  }
  if (atribucion === 'GLOBAL' && atribuyen.length > 0) {
    falla(`${nombre}: declarado GLOBAL pero hay campos que atribuyen activo`);
  }
  for (const c of atribuyen) {
    // Un campo de atribucion opcional no sirve: sin el, el evento queda sin
    // activo y el suministro tendria que salir desconocido igualmente.
    if (!c.obligatorio) falla(`${nombre}.${c.nombre}: atribuye activo y no es obligatorio`);
  }
  if (afecta !== 'NINGUNO' && afecta !== 'AUTORIZA' && atribucion !== 'POR_ACTIVO') {
    falla(`${nombre}: cambia el suministro y no se puede atribuir a un activo`);
  }

  return {
    nombre,
    emisor,
    significado,
    atribucion,
    afectaSuministro: afecta,
    implementadoEnContratos: e['implementadoEnContratos'] as boolean,
    campos,
  };
}

/** Lee y valida la fuente unica. Lanza si algo no cuadra. */
export function cargarEspecEventos(ruta?: string): EspecEventos {
  const archivo = ruta ?? rutaEspecEventos();
  const crudo: unknown = JSON.parse(readFileSync(archivo, 'utf8'));
  if (typeof crudo !== 'object' || crudo === null) falla('la raiz no es un objeto');
  const raiz = crudo as Record<string, unknown>;

  const version = raiz['version'];
  if (typeof version !== 'string' || version === '') falla('falta version');

  const reglasCrudas = raiz['reglas'];
  if (!Array.isArray(reglasCrudas) || reglasCrudas.some((r) => typeof r !== 'string')) {
    falla('reglas debe ser una lista de textos');
  }

  const eventosCrudos = raiz['eventos'];
  if (!Array.isArray(eventosCrudos)) falla('eventos debe ser una lista');
  const eventos = eventosCrudos.map(leerEvento);

  const nombres = new Set<string>();
  for (const ev of eventos) {
    if (nombres.has(ev.nombre)) falla(`evento repetido '${ev.nombre}'`);
    nombres.add(ev.nombre);
  }

  const aliasCrudos = raiz['aliasesRetirados'];
  if (typeof aliasCrudos !== 'object' || aliasCrudos === null) {
    falla('aliasesRetirados debe ser un objeto');
  }
  const aliases: Record<string, AliasRetirado> = {};
  for (const [nombre, valor] of Object.entries(aliasCrudos as Record<string, unknown>)) {
    if (typeof valor !== 'object' || valor === null) falla(`alias ${nombre} invalido`);
    const a = valor as Record<string, unknown>;
    if (typeof a['canonico'] !== 'string' || !nombres.has(a['canonico'])) {
      falla(`alias ${nombre}: 'canonico' no es un evento declarado`);
    }
    if (typeof a['porQue'] !== 'string' || a['porQue'] === '') {
      falla(`alias ${nombre}: falta el porQue del retiro`);
    }
    if (nombres.has(nombre)) {
      falla(`alias ${nombre}: un nombre retirado no puede ser tambien canonico`);
    }
    aliases[nombre] = { canonico: a['canonico'], porQue: a['porQue'] };
  }

  return {
    version,
    reglas: reglasCrudas as readonly string[],
    aliasesRetirados: aliases,
    eventos,
  };
}
