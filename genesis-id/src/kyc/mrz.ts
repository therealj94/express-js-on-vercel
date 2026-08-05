// Lectura y comprobación de la zona legible por máquina (MRZ) de documentos
// de viaje e identidad, según ICAO 9303.
//
// POR QUE ESTO ES VERIFICACION DE VERDAD Y NO TEATRO
//
// La MRZ lleva dígitos de control calculados sobre sus propios campos. Si
// alguien inventa un número de documento, o cambia una fecha de nacimiento para
// aparentar ser mayor de edad, los dígitos dejan de cuadrar. No hace falta
// consultar a ningún organismo ni pagarle a ningún proveedor: la comprobación
// es aritmética y se hace aquí mismo.
//
// LO QUE ESTO NO DEMUESTRA — y conviene tenerlo muy claro
//
// Que la MRZ sea coherente prueba que el documento está bien FORMADO, no que
// sea auténtico ni que la persona que lo presenta sea su titular. Un
// falsificador que conozca el algoritmo puede fabricar una MRZ que cuadre.
// Para lo demás hacen falta cosas que no se pueden hacer sin terceros:
//
//   - Autenticidad del chip: los pasaportes electrónicos llevan un chip firmado
//     por el país emisor. Validarlo exige leer el NFC y tener los certificados
//     del directorio de claves públicas de la OACI.
//   - Que la cara del documento sea la de quien lo presenta, y que sea una
//     persona viva y no una foto. Eso es biometría, y va en `biometria.ts`.
//
// Por eso pasar la MRZ NUNCA basta para verificar una identidad. Es la primera
// puerta, la que descarta lo obviamente inválido sin gastar dinero.

export type TipoMrz = 'TD1' | 'TD2' | 'TD3'

export interface DatosMrz {
  formato: TipoMrz
  tipoDocumento: string
  paisEmisor: string
  nacionalidad: string
  numeroDocumento: string
  apellidos: string
  nombres: string
  nombreCompleto: string
  fechaNacimiento: string | null // ISO YYYY-MM-DD
  fechaVencimiento: string | null
  sexo: 'M' | 'F' | 'X'
  numeroPersonal: string
}

export interface ResultadoMrz {
  ok: boolean
  datos: DatosMrz | null
  /** Qué dígito de control falló, si alguno. */
  fallos: string[]
  motivo?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Dígito de control
// ─────────────────────────────────────────────────────────────────────────────

const PESOS = [7, 3, 1]

/** Valor de un carácter: dígitos su valor, letras 10-35, relleno `<` vale 0. */
function valor(c: string): number {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55
  if (c === '<') return 0
  return -1
}

/** Dígito de control ICAO: suma ponderada 7-3-1 módulo 10. */
export function digitoControl(campo: string): number {
  let suma = 0
  for (let i = 0; i < campo.length; i++) {
    const v = valor(campo[i])
    if (v < 0) return -1
    suma += v * PESOS[i % 3]
  }
  return suma % 10
}

const cuadra = (campo: string, digito: string): boolean => {
  if (digito === '<') return false
  const d = digitoControl(campo)
  return d >= 0 && d === Number(digito)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fechas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `YYMMDD` a ISO. El siglo hay que deducirlo porque la MRZ solo trae dos
 * dígitos de año, y el criterio depende de para qué es la fecha: una fecha de
 * nacimiento nunca está en el futuro, y una de vencimiento casi nunca está más
 * de una década en el pasado.
 */
function fechaIso(yymmdd: string, clase: 'nacimiento' | 'vencimiento'): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null

  const anioActual = new Date().getUTCFullYear()
  const dosDigitos = anioActual % 100
  let anio: number
  if (clase === 'nacimiento') {
    // Si sale en el futuro, era del siglo pasado.
    anio = yy > dosDigitos ? 1900 + yy : 2000 + yy
  } else {
    // Los vencimientos miran hacia adelante; se admite algo de pasado para
    // poder detectar y reportar un documento vencido.
    anio = yy < dosDigitos - 10 ? 2000 + yy : yy > dosDigitos + 50 ? 1900 + yy : 2000 + yy
  }

  const fecha = new Date(Date.UTC(anio, mm - 1, dd))
  // Rechaza fechas que no existen: un 31 de febrero se desborda a marzo.
  if (fecha.getUTCMonth() !== mm - 1 || fecha.getUTCDate() !== dd) return null
  return fecha.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// Nombres
// ─────────────────────────────────────────────────────────────────────────────

/** El campo de nombre es `APELLIDOS<<NOMBRES`, con `<` como separador. */
function partirNombre(campo: string): { apellidos: string; nombres: string } {
  const limpio = campo.replace(/<+$/, '')
  const corte = limpio.indexOf('<<')
  const bruto = (s: string) => s.replace(/</g, ' ').replace(/\s+/g, ' ').trim()
  if (corte < 0) return { apellidos: bruto(limpio), nombres: '' }
  return {
    apellidos: bruto(limpio.slice(0, corte)),
    nombres: bruto(limpio.slice(corte + 2)),
  }
}

const sexoDe = (c: string): 'M' | 'F' | 'X' => (c === 'M' ? 'M' : c === 'F' ? 'F' : 'X')

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

/** Deja solo las líneas de la MRZ, en mayúsculas y sin espacios sobrantes. */
function lineas(texto: string): string[] {
  return String(texto || '')
    .toUpperCase()
    .split(/[\r\n]+/)
    .map((l) => l.replace(/\s/g, ''))
    .filter((l) => l.length > 0)
}

/**
 * Lee una MRZ de cualquiera de los tres formatos y comprueba TODOS sus dígitos
 * de control, incluido el compuesto, que es el que ata los campos entre sí.
 *
 * Comprobar solo los dígitos individuales no alcanza: quien cambie un campo
 * puede recalcular su propio dígito. El compuesto cubre varios campos a la vez,
 * así que obliga a recalcularlo todo de forma coherente.
 */
export function leerMrz(texto: string): ResultadoMrz {
  const ls = lineas(texto)
  if (!ls.length) return { ok: false, datos: null, fallos: [], motivo: 'MRZ vacía' }

  if (ls.length >= 3 && ls[0].length === 30) return leerTd1(ls)
  if (ls.length >= 2 && ls[0].length === 44) return leerTd3(ls)
  if (ls.length >= 2 && ls[0].length === 36) return leerTd2(ls)

  return {
    ok: false,
    datos: null,
    fallos: [],
    motivo: `Formato no reconocido: ${ls.length} línea(s) de ${ls.map((l) => l.length).join('/')} caracteres. Se espera TD1 (3×30), TD2 (2×36) o TD3 (2×44).`,
  }
}

/** Pasaportes: dos líneas de 44. */
function leerTd3(ls: string[]): ResultadoMrz {
  const [l1, l2] = ls
  if (l2.length !== 44) {
    return { ok: false, datos: null, fallos: [], motivo: 'La segunda línea de un TD3 debe tener 44 caracteres' }
  }

  const numeroDocumento = l2.slice(0, 9)
  const nacimiento = l2.slice(13, 19)
  const vencimiento = l2.slice(21, 27)
  const numeroPersonal = l2.slice(28, 42)

  const fallos: string[] = []
  if (!cuadra(numeroDocumento, l2[9])) fallos.push('número de documento')
  if (!cuadra(nacimiento, l2[19])) fallos.push('fecha de nacimiento')
  if (!cuadra(vencimiento, l2[27])) fallos.push('fecha de vencimiento')
  // El número personal es opcional; solo se comprueba si viene.
  if (numeroPersonal.replace(/</g, '') && !cuadra(numeroPersonal, l2[42])) {
    fallos.push('número personal')
  }
  const compuesto = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
  if (!cuadra(compuesto, l2[43])) fallos.push('dígito compuesto')

  const { apellidos, nombres } = partirNombre(l1.slice(5))
  return armar('TD3', {
    tipoDocumento: l1.slice(0, 2).replace(/</g, ''),
    paisEmisor: l1.slice(2, 5).replace(/</g, ''),
    nacionalidad: l2.slice(10, 13).replace(/</g, ''),
    numeroDocumento: numeroDocumento.replace(/</g, ''),
    apellidos,
    nombres,
    nacimiento,
    vencimiento,
    sexo: l2[20],
    numeroPersonal: numeroPersonal.replace(/</g, ''),
  }, fallos)
}

/** Documentos de identidad de tamaño medio: dos líneas de 36. */
function leerTd2(ls: string[]): ResultadoMrz {
  const [l1, l2] = ls
  if (l2.length !== 36) {
    return { ok: false, datos: null, fallos: [], motivo: 'La segunda línea de un TD2 debe tener 36 caracteres' }
  }

  const numeroDocumento = l2.slice(0, 9)
  const nacimiento = l2.slice(13, 19)
  const vencimiento = l2.slice(21, 27)
  const opcional = l2.slice(28, 35)

  const fallos: string[] = []
  if (!cuadra(numeroDocumento, l2[9])) fallos.push('número de documento')
  if (!cuadra(nacimiento, l2[19])) fallos.push('fecha de nacimiento')
  if (!cuadra(vencimiento, l2[27])) fallos.push('fecha de vencimiento')
  const compuesto = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35)
  if (!cuadra(compuesto, l2[35])) fallos.push('dígito compuesto')

  const { apellidos, nombres } = partirNombre(l1.slice(5))
  return armar('TD2', {
    tipoDocumento: l1.slice(0, 2).replace(/</g, ''),
    paisEmisor: l1.slice(2, 5).replace(/</g, ''),
    nacionalidad: l2.slice(10, 13).replace(/</g, ''),
    numeroDocumento: numeroDocumento.replace(/</g, ''),
    apellidos,
    nombres,
    nacimiento,
    vencimiento,
    sexo: l2[20],
    numeroPersonal: opcional.replace(/</g, ''),
  }, fallos)
}

/** Cédulas y tarjetas: tres líneas de 30. */
function leerTd1(ls: string[]): ResultadoMrz {
  const [l1, l2, l3] = ls
  if (l2.length !== 30 || l3.length !== 30) {
    return { ok: false, datos: null, fallos: [], motivo: 'Un TD1 son tres líneas de 30 caracteres' }
  }

  const numeroDocumento = l1.slice(5, 14)
  const opcional1 = l1.slice(15, 30)
  const nacimiento = l2.slice(0, 6)
  const vencimiento = l2.slice(8, 14)
  const opcional2 = l2.slice(18, 29)

  const fallos: string[] = []
  if (!cuadra(numeroDocumento, l1[14])) fallos.push('número de documento')
  if (!cuadra(nacimiento, l2[6])) fallos.push('fecha de nacimiento')
  if (!cuadra(vencimiento, l2[14])) fallos.push('fecha de vencimiento')
  const compuesto = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29)
  if (!cuadra(compuesto, l2[29])) fallos.push('dígito compuesto')

  const { apellidos, nombres } = partirNombre(l3)
  return armar('TD1', {
    tipoDocumento: l1.slice(0, 2).replace(/</g, ''),
    paisEmisor: l1.slice(2, 5).replace(/</g, ''),
    nacionalidad: l2.slice(15, 18).replace(/</g, ''),
    numeroDocumento: numeroDocumento.replace(/</g, ''),
    apellidos,
    nombres,
    nacimiento,
    vencimiento,
    sexo: l2[7],
    numeroPersonal: (opcional1 + opcional2).replace(/</g, ''),
  }, fallos)
}

function armar(
  formato: TipoMrz,
  c: {
    tipoDocumento: string; paisEmisor: string; nacionalidad: string
    numeroDocumento: string; apellidos: string; nombres: string
    nacimiento: string; vencimiento: string; sexo: string; numeroPersonal: string
  },
  fallos: string[],
): ResultadoMrz {
  const datos: DatosMrz = {
    formato,
    tipoDocumento: c.tipoDocumento,
    paisEmisor: c.paisEmisor,
    nacionalidad: c.nacionalidad || c.paisEmisor,
    numeroDocumento: c.numeroDocumento,
    apellidos: c.apellidos,
    nombres: c.nombres,
    nombreCompleto: `${c.nombres} ${c.apellidos}`.replace(/\s+/g, ' ').trim(),
    fechaNacimiento: fechaIso(c.nacimiento, 'nacimiento'),
    fechaVencimiento: fechaIso(c.vencimiento, 'vencimiento'),
    sexo: sexoDe(c.sexo),
    numeroPersonal: c.numeroPersonal,
  }
  return {
    ok: fallos.length === 0,
    datos,
    fallos,
    motivo: fallos.length ? `No cuadran los dígitos de control: ${fallos.join(', ')}` : undefined,
  }
}
