// Generador del modulo `src/esquema-generado.ts` a partir de `spec/eventos.json`.
//
// POR QUE generar y no escribir a mano: hasta ahora el indexador tenia una tabla
// de eventos escrita a mano y los contratos otra. Nada obligaba a que
// coincidieran, y no coincidian (H15). Generando el decodificador la divergencia
// deja de ser algo que haya que recordar comprobar.
//
// La prueba `esquema.test.ts` vuelve a generar en memoria y compara con el
// archivo del arbol: si alguien edita el JSON y no regenera, o edita el
// generado a mano, la prueba falla.
//
// Uso: `npm run generar:esquema` (escribe el archivo).

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cargarEspecEventos, type EspecEventos } from './cargar.js';

const ENCABEZADO = `// ARCHIVO GENERADO. NO EDITAR A MANO.
//
// Fuente: sfsp/spec/eventos.json (la fuente unica del §3 del contrato interno).
// Regenerar con: npm run generar:esquema
// La prueba 'esquema.test.ts' falla si este archivo y el JSON divergen.
`;

function texto(valor: string): string {
  return JSON.stringify(valor);
}

/** Produce el contenido exacto de `src/esquema-generado.ts`. */
export function generarFuente(espec: EspecEventos): string {
  const partes: string[] = [ENCABEZADO];

  partes.push(`/** Version de la fuente unica desde la que se genero este modulo. */
export const VERSION_ESPEC_EVENTOS = ${texto(espec.version)};
`);

  partes.push(`/** Un campo de un evento, con todo lo que el indexador necesita saber. */
export interface CampoEventoGenerado {
  readonly nombre: string;
  readonly tipo: string;
  readonly indexado: boolean;
  readonly obligatorio: boolean;
  readonly atribuyeActivo: boolean;
  readonly esCantidad: boolean;
}

/** Efecto declarado sobre el suministro. */
export type EfectoSuministroGenerado = 'AUMENTA' | 'DISMINUYE' | 'AUTORIZA' | 'NINGUNO';

export interface EventoGenerado {
  readonly nombre: string;
  readonly emisor: string;
  readonly significado: string;
  readonly atribucion: 'POR_ACTIVO' | 'GLOBAL';
  readonly afectaSuministro: EfectoSuministroGenerado;
  readonly implementadoEnContratos: boolean;
  readonly campos: readonly CampoEventoGenerado[];
  /** Campos requeridos, precalculado para no recorrer en cada log. */
  readonly requeridos: readonly string[];
  /** Campos que son cantidades enteras (§5). */
  readonly cantidades: readonly string[];
  /** Campos sin los cuales el evento no se puede atribuir a un activo. */
  readonly camposDeAtribucion: readonly string[];
}
`);

  const nombres = espec.eventos.map((e) => texto(e.nombre)).join('\n  | ');
  partes.push(`/** Los ${espec.eventos.length} eventos del §3, por su nombre canonico. */
export type NombreEvento =
  | ${nombres};
`);

  const entradas = espec.eventos
    .map((e) => {
      const campos = e.campos
        .map(
          (c) =>
            `      { nombre: ${texto(c.nombre)}, tipo: ${texto(c.tipo)}, indexado: ${c.indexado}, obligatorio: ${c.obligatorio}, atribuyeActivo: ${c.atribuyeActivo}, esCantidad: ${c.esCantidad} },`,
        )
        .join('\n');
      const requeridos = e.campos.filter((c) => c.obligatorio).map((c) => texto(c.nombre));
      const cantidades = e.campos.filter((c) => c.esCantidad).map((c) => texto(c.nombre));
      const atribucion = e.campos.filter((c) => c.atribuyeActivo).map((c) => texto(c.nombre));
      return `  ${e.nombre}: {
    nombre: ${texto(e.nombre)},
    emisor: ${texto(e.emisor)},
    significado: ${texto(e.significado)},
    atribucion: ${texto(e.atribucion)},
    afectaSuministro: ${texto(e.afectaSuministro)},
    implementadoEnContratos: ${e.implementadoEnContratos},
    campos: [
${campos}
    ],
    requeridos: [${requeridos.join(', ')}],
    cantidades: [${cantidades.join(', ')}],
    camposDeAtribucion: [${atribucion.join(', ')}],
  },`;
    })
    .join('\n');

  partes.push(`/** Esquema completo por evento. Generado: editar el JSON, no esto. */
export const ESQUEMA_EVENTOS: Readonly<Record<NombreEvento, EventoGenerado>> = {
${entradas}
};
`);

  const emisores = espec.eventos
    .map((e) => `  ${e.nombre}: ${texto(e.emisor)},`)
    .join('\n');
  partes.push(`/** Nombre de evento -> emisor declarado. Compatibilidad con el §3. */
export const EVENTOS_CONOCIDOS: Readonly<Record<NombreEvento, string>> = {
${emisores}
};
`);

  const alias = Object.entries(espec.aliasesRetirados)
    .map(([viejo, a]) => `  ${texto(viejo)}: ${texto(a.canonico)},`)
    .join('\n');
  partes.push(`/**
 * Nombres retirados que se siguen decodificando al canonico.
 * POR QUE: un log historico emitido con el nombre viejo no se puede reescribir;
 * si se tratara como desconocido, el indice perderia hechos que si sabemos leer.
 * El registro sale marcado con \`aliasOrigen\` para que nadie lo confunda con un
 * evento emitido hoy.
 */
export const ALIASES_RETIRADOS: Readonly<Record<string, NombreEvento>> = {
${alias}
};
`);

  return partes.join('\n');
}

/** Ruta del modulo generado dentro de `src/`. */
export function rutaModuloGenerado(): string {
  // Este modulo vive en `<raiz>/src/esquema/` o `<raiz>/dist/esquema/`; el
  // generado siempre se escribe en `src/`, que es lo que se versiona.
  const aqui = dirname(fileURLToPath(import.meta.url));
  const raiz = join(aqui, '..', '..');
  return join(raiz, 'src', 'esquema-generado.ts');
}

// POR QUE esta guarda: el modulo tambien se importa desde la prueba, que no
// debe escribir nada en el arbol.
if (process.argv[1] !== undefined && process.argv[1].endsWith('generar.js')) {
  const destino = rutaModuloGenerado();
  writeFileSync(destino, generarFuente(cargarEspecEventos()), 'utf8');
  process.stdout.write(`esquema generado: ${destino}\n`);
}
