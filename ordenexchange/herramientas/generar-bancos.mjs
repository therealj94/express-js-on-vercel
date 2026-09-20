#!/usr/bin/env node
// Genera src/data/bancos.ts a partir de src/data/fuentes/bancos.json.
//
// El JSON es la fuente de verdad de los bancos de cada país (nombre, tipo,
// tipos de cuenta, formato del identificador, código oficial, importancia y
// confianza). Se edita el JSON, se corre este script y el TypeScript queda
// regenerado; latam.ts toma de aquí los nombres para la transferencia
// bancaria de cada país.
//
//   node herramientas/generar-bancos.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const fuente = join(aqui, '..', 'src', 'data', 'fuentes', 'bancos.json')
const destino = join(aqui, '..', 'src', 'data', 'bancos.ts')

const datos = JSON.parse(readFileSync(fuente, 'utf8'))
const TIPOS = ['comercial', 'estatal', 'cooperativa', 'fintech', 'microfinanciera', 'caja']
const IMPORTANCIAS = ['principal', 'secundario', 'nicho']
const lit = (s) => JSON.stringify(String(s))

const paises = Object.keys(datos).sort()
let cuerpo = ''
let total = 0
for (const iso2 of paises) {
  const p = datos[iso2]
  const vistos = new Set()
  const bancos = (p.bancos || []).filter((b) => {
    const k = String(b.nombre || '').trim().toLowerCase()
    if (!k || vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  // Principales primero, luego secundarios, luego nicho; dentro de cada grupo, el orden de la fuente.
  const orden = (b) => IMPORTANCIAS.indexOf(b.importancia || 'secundario')
  bancos.sort((a, b) => orden(a) - orden(b))
  cuerpo += `  ${iso2}: [\n`
  for (const b of bancos) {
    if (!TIPOS.includes(b.tipo)) throw new Error(`${iso2} · ${b.nombre}: tipo «${b.tipo}» no válido`)
    const campos = [
      `nombre: ${lit(b.nombre.trim())}`,
      b.nombreCorto ? `nombreCorto: ${lit(b.nombreCorto.trim())}` : null,
      `tipo: ${lit(b.tipo)}`,
      `tiposCuenta: [${(b.tiposCuenta || []).map((t) => lit(String(t).trim())).join(', ')}]`,
      b.formatoCuenta ? `formatoCuenta: ${lit(b.formatoCuenta.trim())}` : null,
      b.codigo ? `codigo: ${lit(String(b.codigo).trim())}` : null,
      `importancia: ${lit(IMPORTANCIAS.includes(b.importancia) ? b.importancia : 'secundario')}`,
      b.nota ? `nota: ${lit(b.nota.trim())}` : null,
    ].filter(Boolean)
    cuerpo += `    { ${campos.join(', ')} },\n`
    total += 1
  }
  cuerpo += `  ],\n`
}

const salida = `// GENERADO por herramientas/generar-bancos.mjs a partir de src/data/fuentes/bancos.json.
// No se edita a mano: se edita el JSON y se vuelve a generar.
//
// Los bancos de cada país para la transferencia entre personas: nombre tal
// como lo conoce la gente, tipo de entidad, tipos de cuenta que ofrece con su
// nombre local, formato del número o identificador para transferir, código
// oficial cuando existe y qué tan usado es. latam.ts toma de aquí los nombres.

export type TipoBanco = ${TIPOS.map((t) => `'${t}'`).join(' | ')}
export type ImportanciaBanco = ${IMPORTANCIAS.map((t) => `'${t}'`).join(' | ')}

export interface Banco {
  nombre: string
  nombreCorto?: string
  tipo: TipoBanco
  /** Tipos de cuenta que ofrece a personas, con el nombre local (Ahorro, Corriente, Cheques, Caja de Ahorro, Cuenta RUT…). */
  tiposCuenta: string[]
  /** Formato del número de cuenta o del identificador para transferir («CLABE de 18 dígitos», «10 dígitos»…). */
  formatoCuenta?: string
  /** Código bancario oficial (SPEI, BCRA, ISPB, ACH…) si lo hay. */
  codigo?: string
  importancia: ImportanciaBanco
  nota?: string
}

export const BANCOS: Record<string, Banco[]> = {
${cuerpo}}

/** Bancos de un país (ISO2), principales primero. Vacío si el país no está. */
export function bancosDe(iso2: string): Banco[] {
  return BANCOS[String(iso2 ?? '').trim().toUpperCase()] ?? []
}

/** Solo los nombres, en el mismo orden: lo que latam.ts pone en la transferencia bancaria. */
export const nombresBancos = (iso2: string): string[] => bancosDe(iso2).map((b) => b.nombre)

/** Un banco por nombre, insensible a mayúsculas, aceptando también el nombre corto. */
export function bancoDe(iso2: string, nombre: string): Banco | undefined {
  const k = String(nombre ?? '').trim().toLowerCase()
  return bancosDe(iso2).find((b) => b.nombre.toLowerCase() === k || (b.nombreCorto && b.nombreCorto.toLowerCase() === k))
}
`
writeFileSync(destino, salida)
console.log(`bancos.ts: ${paises.length} países, ${total} bancos`)
