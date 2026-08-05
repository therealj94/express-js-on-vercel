// Comparación de nombres. Es el corazón del tamizado contra listas de
// sanciones, y donde se gana o se pierde la calidad del control.
//
// El problema real no es comparar cadenas: es que la misma persona aparece
// escrita de muchas formas. "José García Pérez" puede venir como "GARCIA PEREZ,
// JOSE", "Jose Garcia", "J. García Pérez" o "Yousef Garsia". Una comparación
// exacta no encuentra a nadie; una demasiado laxa inunda de falsos positivos y
// el equipo de cumplimiento termina ignorándolos, que es peor que no tenerlos.

// ─────────────────────────────────────────────────────────────────────────────
// Normalización
// ─────────────────────────────────────────────────────────────────────────────

// Caracteres que NFD no descompone porque no son letra + tilde, sino letras
// propias. Hay que traducirlos a mano.
const LIGADURAS: Record<string, string> = {
  Æ: 'AE', Ø: 'O', Ð: 'D', Þ: 'TH', ß: 'SS', Œ: 'OE', Ł: 'L', Đ: 'D', Ħ: 'H', Ŋ: 'NG',
}

// Cirílico → latino, en la transliteración que usan las listas públicas.
const CIRILICO: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'ZH', З: 'Z', И: 'I',
  Й: 'I', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  У: 'U', Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHCH', Ъ: '', Ы: 'Y',
  Ь: '', Э: 'E', Ю: 'YU', Я: 'YA',
}

/**
 * Deja un nombre en mayúsculas, sin tildes, sin puntuación y con un solo
 * espacio entre palabras. Es la forma en que se comparan todos los nombres.
 */
export function normalizar(texto: string): string {
  let s = String(texto || '').toUpperCase()
  s = s.replace(/[ÆØÐÞŒŁĐĦŊß]/g, (c) => LIGADURAS[c] ?? c)
  s = s.replace(/[А-Яа-яЁё]/g, (c) => CIRILICO[c.toUpperCase()] ?? c)
  // NFD separa la letra de su tilde; el rango ̀-ͯ son las tildes.
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Los guiones y apóstrofos separan palabras: "AL-ASSAD" → "AL ASSAD".
  s = s.replace(/[-'’`]/g, ' ')
  s = s.replace(/[^A-Z0-9 ]/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

// Partículas que no distinguen a nadie. "DE LA CRUZ" y "CRUZ" son la misma
// persona a efectos de tamizado, y dejarlas dentro solo diluye la puntuación.
const PARTICULAS = new Set([
  'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'DA', 'DAS', 'DO', 'DOS', 'VAN',
  'VON', 'BIN', 'IBN', 'AL', 'EL', 'ABU', 'BEN', 'DI', 'DU', 'LE', 'MC', 'MAC',
  'SAN', 'SANTA', 'ST',
])

/** Palabras significativas del nombre, ya normalizadas. */
export function fichas(nombre: string): string[] {
  return normalizar(nombre)
    .split(' ')
    .filter((t) => t.length > 0 && !PARTICULAS.has(t))
}

// Nombres de pila que son la misma persona escrita distinto. Es una fuente
// enorme de falsos negativos en tamizado real: media lista de sanciones está
// llena de variantes de transliteración del árabe y del ruso.
const EQUIVALENTES: string[][] = [
  ['MOHAMMED', 'MUHAMMAD', 'MOHAMED', 'MUHAMED', 'MOHAMMAD', 'MAHOMET', 'MEHMET'],
  ['ABDULLAH', 'ABDALLAH', 'ABDULAH', 'ABDULA'],
  ['YUSUF', 'YOUSEF', 'YOUSSEF', 'JOSEPH', 'JOSE', 'GIUSEPPE'],
  ['IBRAHIM', 'IBRAHEEM', 'ABRAHAM', 'AVRAHAM'],
  ['ALEXANDER', 'ALEKSANDR', 'ALEJANDRO', 'ALESSANDRO', 'OLEKSANDR'],
  ['VLADIMIR', 'VOLODYMYR', 'WLADIMIR'],
  ['SERGEY', 'SERGEI', 'SERHIY', 'SERGIO'],
  ['DMITRY', 'DMITRI', 'DMYTRO', 'DIMITRI'],
  ['NIKOLAY', 'NIKOLAI', 'MYKOLA', 'NICOLAS', 'NICHOLAS'],
  ['JUAN', 'JOHN', 'JOAO', 'GIOVANNI', 'IVAN', 'JEAN'],
  ['JAIME', 'JAMES', 'JACOBO', 'IAGO', 'DIEGO'],
  ['CATALINA', 'KATHERINE', 'EKATERINA', 'CATHERINE'],
  ['MARIA', 'MARY', 'MARIE', 'MARIYA'],
  ['ALI', 'ALY'],
  ['HUSSEIN', 'HUSSAIN', 'HUSAYN', 'HUSEIN'],
  ['HASSAN', 'HASAN'],
  ['OMAR', 'UMAR'],
  ['KHALED', 'KHALID', 'HALID'],
]

const CANONICO = new Map<string, string>()
for (const grupo of EQUIVALENTES) {
  for (const variante of grupo) CANONICO.set(variante, grupo[0])
}

const canonizar = (ficha: string) => CANONICO.get(ficha) ?? ficha

// ─────────────────────────────────────────────────────────────────────────────
// Jaro-Winkler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distancia de Jaro: proporción de caracteres comunes, penalizando las
 * transposiciones. Se eligió sobre la distancia de edición (Levenshtein)
 * porque tolera mejor los errores típicos de nombres —letras cambiadas de
 * orden, una consonante duplicada— sin premiar tanto a cadenas cortas.
 */
function jaro(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0

  const alcance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const usadoA = new Array(a.length).fill(false)
  const usadoB = new Array(b.length).fill(false)
  let comunes = 0

  for (let i = 0; i < a.length; i++) {
    const desde = Math.max(0, i - alcance)
    const hasta = Math.min(i + alcance + 1, b.length)
    for (let j = desde; j < hasta; j++) {
      if (usadoB[j] || a[i] !== b[j]) continue
      usadoA[i] = usadoB[j] = true
      comunes++
      break
    }
  }
  if (comunes === 0) return 0

  let transposiciones = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!usadoA[i]) continue
    while (!usadoB[k]) k++
    if (a[i] !== b[k]) transposiciones++
    k++
  }
  transposiciones /= 2

  return (comunes / a.length + comunes / b.length + (comunes - transposiciones) / comunes) / 3
}

/**
 * Jaro-Winkler: sube la puntuación cuando coincide el principio de la palabra.
 * En nombres propios el prefijo pesa: la gente se equivoca al final ("MARTINES"
 * por "MARTINEZ") mucho más que al principio.
 */
export function jaroWinkler(a: string, b: string): number {
  const base = jaro(a, b)
  if (base < 0.7) return base // sin premio si de entrada no se parecen
  let prefijo = 0
  while (prefijo < Math.min(4, a.length, b.length) && a[prefijo] === b[prefijo]) prefijo++
  return base + prefijo * 0.1 * (1 - base)
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparación de nombres completos
// ─────────────────────────────────────────────────────────────────────────────

/** Una sola letra representa una inicial: "J" contra "JOSE" cuenta como parcial. */
const esInicial = (t: string) => t.length === 1

function pareceFicha(a: string, b: string): number {
  const ca = canonizar(a)
  const cb = canonizar(b)
  if (ca === cb) return 1
  if (esInicial(a) || esInicial(b)) {
    return a[0] === b[0] ? 0.6 : 0
  }

  // NOMBRES CORTADOS POR LA PROPIA MRZ
  //
  // La zona de lectura mecánica tiene ancho fijo, así que cuando el nombre no
  // cabe, el documento lo TRUNCA: en una cédula hondureña, «JOSE» aparece como
  // «JOS». Eso no es un error de lectura ni una discrepancia: es lo que el
  // Estado imprimió, y la norma ICAO 9303 lo contempla.
  //
  // Sin esto, «Jose Ordoñez» contra «ORDONEZ JOS» daba 76 % y la verificación
  // se bloqueaba por «el nombre declarado no coincide con el del documento»,
  // acusando a la persona de algo que hizo bien.
  //
  // Se exigen al menos tres letras y que una sea prefijo exacto de la otra —no
  // basta parecerse—, y no se da 1 sino 0,97: el expediente conserva la señal
  // de que hubo una diferencia, que es información real para quien revise.
  // OJO: sobre las fichas tal como vienen, NO sobre la forma canónica. La
  // tabla de equivalencias convierte «JOSE» en «YUSUF» —que es lo correcto para
  // reconocer a un Youssef— y ahí «JOS» deja de ser prefijo de nada. Este fue
  // exactamente el motivo de que una cédula hondureña real no pasara.
  const corto = a.length <= b.length ? a : b
  const largo = a.length <= b.length ? b : a
  if (corto.length >= 3 && largo.startsWith(corto)) return 0.97

  return jaroWinkler(ca, cb)
}

/**
 * Parecido entre dos nombres completos, de 0 a 1.
 *
 * Compara palabra contra palabra tomando el mejor emparejamiento de cada una,
 * lo que hace que el orden no importe: "GARCIA JUAN" y "JUAN GARCIA" puntúan
 * igual. Eso es imprescindible porque las listas de sanciones publican
 * "APELLIDO, Nombre" y las apps mandan "Nombre Apellido".
 *
 * La puntuación se calcula sobre el nombre con MENOS palabras. Si no, un nombre
 * de dos palabras contra uno de cinco se hunde por las tres que sobran, y
 * "Juan García" dejaría de encontrar a "Juan Carlos García Pérez de la Vega".
 * El precio es que nombres muy cortos generan más falsos positivos, y por eso
 * quien decide es siempre una persona, no este número.
 */
export function parecidoNombres(uno: string, otro: string): number {
  // Sin canonizar aquí: `pareceFicha` ya lo hace, y necesita ver las fichas
  // originales para reconocer un nombre cortado por el ancho de la MRZ.
  const a = fichas(uno)
  const b = fichas(otro)
  if (!a.length || !b.length) return 0

  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a]
  const tomadas = new Set<number>()
  let suma = 0

  for (const ficha of corto) {
    let mejor = 0
    let mejorIdx = -1
    for (let j = 0; j < largo.length; j++) {
      if (tomadas.has(j)) continue
      const p = pareceFicha(ficha, largo[j])
      if (p > mejor) {
        mejor = p
        mejorIdx = j
      }
    }
    if (mejorIdx >= 0) tomadas.add(mejorIdx)
    suma += mejor
  }

  return suma / corto.length
}

/** Todas las palabras del nombre corto aparecen, con buen parecido, en el largo. */
export function contieneNombre(completo: string, buscado: string): boolean {
  return parecidoNombres(completo, buscado) >= 0.92
}
