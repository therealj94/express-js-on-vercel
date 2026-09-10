// Lectura de la MRZ del REVERSO a partir del texto que devuelve un OCR.
//
// POR QUÉ EXISTE EN EL SERVIDOR
//
// El teléfono lee la zona mecánica con ML Kit y manda solo el texto. En el
// navegador no hay lector: hasta hoy las dos fotos del documento las leía un
// operador, días después, y la persona se quedaba sin saber si su documento
// servía. `kyc/textoDocumento.ts` ya mira el FRENTE con Rekognition; esto mira
// el REVERSO, que es donde están los dígitos de control, y con ellos una
// lectura o cuadra o se descarta: no hay «más o menos».
//
// EL TRUCO QUE HACE QUE ESTO FUNCIONE
//
// Ningún OCR lee bien la MRZ a la primera: confunde O con 0, I con 1, S con 5,
// B con 8. Pero la MRZ lleva sus propios dígitos de control, así que se prueban
// las combinaciones de los caracteres ambiguos y se escoge la ÚNICA que cuadra
// con todos ellos a la vez. Es la misma lógica que `orden-global-app/src/mrzOcr.js`,
// con las mismas salvaguardas, para que el teléfono y la web lean igual.
//
// LO QUE NO HACE
//
// Decidir. Una MRZ que cuadra dice que el documento está bien formado, no que
// lo emitiera un país; la aprobación sigue siendo de una persona. Y sin
// proveedor devuelve `sin-lector`: no hay un lector de mentira que «lea» algo.

import { digitoControl, leerMrz, type DatosMrz, type TipoMrz } from './mrz.js'
import { detectarTexto, rekognitionConfigurado, ErrorRekognition } from './rekognition.js'

/** Dónde está cada dígito de control y qué campo cubre, por formato. */
const CONTROLES: Record<TipoMrz, { linea: number; campo: [number, number]; digito: number }[]> = {
  TD3: [
    { linea: 1, campo: [0, 9], digito: 9 },    // número de documento
    { linea: 1, campo: [13, 19], digito: 19 }, // fecha de nacimiento
    { linea: 1, campo: [21, 27], digito: 27 }, // fecha de caducidad
  ],
  TD2: [
    { linea: 1, campo: [0, 9], digito: 9 },
    { linea: 1, campo: [13, 19], digito: 19 },
    { linea: 1, campo: [21, 27], digito: 27 },
  ],
  TD1: [
    { linea: 0, campo: [5, 14], digito: 14 },
    { linea: 1, campo: [0, 6], digito: 6 },
    { linea: 1, campo: [8, 14], digito: 14 },
  ],
}

/** Cuántos dígitos de control cuadran, y cuántos se comprobaron. */
export function cuadranDigitos(lineas: string[], formato: TipoMrz): { bien: number; total: number } {
  const reglas = CONTROLES[formato] || []
  let bien = 0
  for (const r of reglas) {
    const l = lineas[r.linea]
    if (!l) continue
    if (l[r.digito] === String(digitoControl(l.slice(r.campo[0], r.campo[1])))) bien++
  }
  return { bien, total: reglas.length }
}

/**
 * Letras que un OCR pone donde había una cifra, sobre la tipografía OCR-B.
 *
 * La corrección va SOLO letra→cifra y SOLO donde la norma no admite letras.
 * Cambiar una cifra por otra cifra sería adivinar, y con suficientes intentos
 * se encuentra una combinación que cuadra y corresponde al documento de otro.
 */
const LETRA_A_CIFRA: Record<string, string[]> = {
  O: ['0'], Q: ['0'], D: ['0'], U: ['0'],
  I: ['1'], L: ['1'],
  Z: ['2'], A: ['4'], S: ['5'], G: ['6'], T: ['7'], B: ['8'],
}

/** El reflejo exacto: cifras que el OCR pone donde solo puede haber letras. */
const CIFRA_A_LETRA: Record<string, string> = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' }

/** Arregla las cifras que aparezcan en la línea de nombres: ahí no cabe una cifra. */
export function arreglarNombres(lineas: string[], formato: TipoMrz): string[] {
  const iNombres = formato === 'TD1' ? 2 : 0
  const l = lineas[iNombres]
  if (!l) return lineas
  const desde = formato === 'TD1' ? 0 : 5
  const copia = [...lineas]
  copia[iNombres] = l.split('').map((c, i) => (i >= desde && CIFRA_A_LETRA[c]) ? CIFRA_A_LETRA[c] : c).join('')
  return copia
}

/** Posiciones donde la norma exige cifra: los dígitos de control y las fechas. */
function zonasNumericas(formato: TipoMrz): Map<number, Set<number>> {
  const mapa = new Map<number, Set<number>>()
  for (const r of CONTROLES[formato] || []) {
    const set = mapa.get(r.linea) || new Set<number>()
    set.add(r.digito)
    if (r.campo[1] - r.campo[0] === 6) for (let i = r.campo[0]; i < r.campo[1]; i++) set.add(i)
    mapa.set(r.linea, set)
  }
  return mapa
}

type Cambio = { linea: number; pos: number; a: string }

const aplicar = (lineas: string[], cambios: Cambio[]): string[] => {
  const copia = [...lineas]
  for (const { linea, pos, a } of cambios) {
    copia[linea] = copia[linea].slice(0, pos) + a + copia[linea].slice(pos + 1)
  }
  return copia
}

/**
 * Intenta arreglar la lectura: primero con UN cambio, luego con dos, y así. Si
 * a esa distancia mínima hay más de una lectura que cuadra, `null`: dos
 * respuestas posibles es no tener respuesta.
 */
export function corregirConDigitos(lineas: string[], formato: TipoMrz): string[] | null {
  const inicial = cuadranDigitos(lineas, formato)
  if (inicial.total === 0) return null
  if (inicial.bien === inicial.total) return lineas

  const numericas = zonasNumericas(formato)
  const candidatas: { linea: number; pos: number; alts: string[] }[] = []
  lineas.forEach((linea, iL) => {
    const soloCifras = numericas.get(iL)
    if (!soloCifras) return
    for (const i of soloCifras) {
      const alts = LETRA_A_CIFRA[linea[i]]
      if (alts) candidatas.push({ linea: iL, pos: i, alts })
    }
  })
  if (!candidatas.length || candidatas.length > 10) return null

  for (let k = 1; k <= candidatas.length; k++) {
    const encontradas = new Set<string>()
    let ejemplo: string[] | null = null
    const combinar = (desde: number, elegidas: Cambio[]) => {
      if (elegidas.length === k) {
        const prueba = aplicar(lineas, elegidas)
        const r = cuadranDigitos(prueba, formato)
        if (r.bien === r.total) {
          const clave = prueba.join('\n')
          if (!encontradas.has(clave)) { encontradas.add(clave); ejemplo = prueba }
        }
        return
      }
      for (let i = desde; i < candidatas.length; i++) {
        for (const a of candidatas[i].alts) {
          combinar(i + 1, [...elegidas, { linea: candidatas[i].linea, pos: candidatas[i].pos, a }])
        }
      }
    }
    combinar(0, [])
    if (encontradas.size === 1) return ejemplo
    if (encontradas.size > 1) return null
  }
  return null
}

const FORMATOS: { largo: number; formato: TipoMrz; cuantas: number }[] = [
  { largo: 44, formato: 'TD3', cuantas: 2 },
  { largo: 36, formato: 'TD2', cuantas: 2 },
  { largo: 30, formato: 'TD1', cuantas: 3 },
]

/** ¿Tiene pinta de línea de MRZ? El «<» la distingue del resto del impreso. */
const pareceMrz = (l: string) =>
  l.length >= 12 && (l.includes('<<') || (l.includes('<') && /\d/.test(l)))

export interface LineasExtraidas { formato: TipoMrz; lineas: string[] }
export interface LineasCortadas { cortadas: true; visto: number; lineas: string[] }

/**
 * Saca las líneas de MRZ de todo el texto que vio el OCR: une una línea que
 * el OCR partió por una sombra, ignora el resto del documento y, si el
 * encuadre las cortó, lo dice — es un fallo que la persona arregla alejando la
 * cámara, no «no se ve nada».
 */
export function extraerLineas(textoOcr: string): LineasExtraidas | LineasCortadas | null {
  const trozos = String(textoOcr || '')
    .toUpperCase()
    .replace(/[«»‹›]/g, '<')
    .replace(/[ \t]/g, '')
    .split(/[\r\n]+/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ''))
    .filter(Boolean)

  for (const { largo, formato, cuantas } of FORMATOS) {
    const candidatas: string[] = []
    for (let i = 0; i < trozos.length; i++) {
      for (const l of [trozos[i], trozos[i] + (trozos[i + 1] || '')]) {
        if (!pareceMrz(l)) continue
        if (Math.abs(l.length - largo) > 1) continue
        candidatas.push(l.length > largo ? l.slice(0, largo) : l.padEnd(largo, '<'))
        break
      }
    }
    if (candidatas.length >= cuantas) return { formato, lineas: candidatas.slice(0, cuantas) }
  }

  const parecidas = trozos.filter(pareceMrz)
  if (parecidas.length >= 2) {
    const masLarga = Math.max(...parecidas.map((l) => l.length))
    if (masLarga < 30) return { cortadas: true, visto: masLarga, lineas: parecidas }
  }
  return null
}

export type MotivoLectura = 'sin-lector' | 'no-encontrada' | 'cortadas' | 'digitos' | 'error'

export interface Lectura {
  ok: boolean
  /** La MRZ: correcta cuando `ok`, dudosa cuando `motivo === 'digitos'`. */
  mrz: string | null
  formato: TipoMrz | null
  corregida: boolean
  motivo?: MotivoLectura
  cuadran?: { bien: number; total: number }
  /** Lo que dice la MRZ, ya interpretada, para que la persona lo confirme. */
  datos: DatosMrz | null
}

const fallo = (motivo: MotivoLectura, extra: Partial<Lectura> = {}): Lectura =>
  ({ ok: false, mrz: null, formato: null, corregida: false, datos: null, motivo, ...extra })

/** Del texto crudo del OCR a una MRZ que cuadra, o a un motivo honesto. Nunca lanza. */
export function interpretarOcr(textoOcr: string): Lectura {
  const encontrado = extraerLineas(textoOcr)
  if (!encontrado) return fallo('no-encontrada')
  if ('cortadas' in encontrado) return fallo('cortadas')

  const { formato } = encontrado
  const lineas = arreglarNombres(encontrado.lineas, formato)
  const yaCuadra = cuadranDigitos(lineas, formato)
  if (yaCuadra.bien === yaCuadra.total) {
    const mrz = lineas.join('\n')
    return { ok: true, mrz, formato, corregida: false, datos: leerMrz(mrz).datos }
  }
  const arregladas = corregirConDigitos(lineas, formato)
  if (arregladas) {
    const mrz = arregladas.join('\n')
    return { ok: true, mrz, formato, corregida: true, datos: leerMrz(mrz).datos }
  }
  // Con forma de MRZ pero sin cuadrar: viaja marcada para corregirla a mano,
  // nunca interpretada como buena.
  return fallo('digitos', { mrz: lineas.join('\n'), formato, cuadran: yaCuadra })
}

type LectorReverso = (imagen: string) => Promise<string[]>

/* El lector de verdad llama a AWS; las pruebas inyectan uno de mentira, igual
   que hace `textoDocumento.ts`. Un doble solo puede devolver RENGLONES: lo que
   cuadre o no lo decide la aritmética de arriba, que no se puede engañar. */
let lector: LectorReverso | null = null
export function _fijarLectorReversoParaPruebas(falso: LectorReverso | null): void { lector = falso }

/** ¿Hay con qué leer una foto? Hoy: Rekognition con `DetectText`. */
export const lectorConfigurado = (): boolean => Boolean(lector) || rekognitionConfigurado()

/**
 * Lee el reverso a partir de su foto. La imagen se manda al proveedor, se toma
 * el texto y se descarta: aquí no se guarda nada.
 */
export async function leerReverso(imagen: string): Promise<Lectura> {
  if (!lectorConfigurado()) return fallo('sin-lector')
  try {
    const renglones = await (lector || ((img: string) => detectarTexto(img, 'el reverso del documento')))(imagen)
    return interpretarOcr(renglones.join('\n'))
  } catch (e) {
    if (e instanceof ErrorRekognition && e.tipo === 'SinCredenciales') return fallo('sin-lector')
    return fallo('error')
  }
}
