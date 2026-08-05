// Validación de identificadores fiscales.
//
// Igual que la MRZ de un pasaporte, muchos identificadores fiscales llevan
// dígito verificador. Comprobarlo descarta de entrada los inventados sin
// consultar a ninguna administración.
//
// SE DISTINGUE ENTRE "VALIDO" Y "EXISTE"
//
// Que un RTN o un NIF cuadre significa que el número está bien construido, no
// que esté dado de alta ni que corresponda a esa empresa. Eso solo lo dice el
// registro del país. Por eso el resultado lleva `comprobacion`, que dice hasta
// dónde se llegó: `digito` si se validó la aritmética, `formato` si solo se
// pudo mirar la forma. El panel lo muestra tal cual para que nadie confunda una
// cosa con la otra.

export type NivelComprobacion = 'digito' | 'formato' | 'desconocido'

export interface ResultadoFiscal {
  valido: boolean
  comprobacion: NivelComprobacion
  normalizado: string
  tipo: string | null
  motivo?: string
}

const limpiar = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// ─────────────────────────────────────────────────────────────────────────────
// España: NIF, NIE y CIF
// ─────────────────────────────────────────────────────────────────────────────

const LETRAS_NIF = 'TRWAGMYFPDXBNJZSQVHLCKE'

function espana(v: string): ResultadoFiscal {
  // NIF de persona física: 8 dígitos + letra calculada como resto entre 23.
  let m = v.match(/^(\d{8})([A-Z])$/)
  if (m) {
    const esperada = LETRAS_NIF[Number(m[1]) % 23]
    return m[2] === esperada
      ? { valido: true, comprobacion: 'digito', normalizado: v, tipo: 'NIF' }
      : { valido: false, comprobacion: 'digito', normalizado: v, tipo: 'NIF', motivo: `La letra debería ser ${esperada}` }
  }

  // NIE de extranjero: X, Y o Z se sustituyen por 0, 1 y 2 y se calcula igual.
  m = v.match(/^([XYZ])(\d{7})([A-Z])$/)
  if (m) {
    const numero = Number(String('XYZ'.indexOf(m[1])) + m[2])
    const esperada = LETRAS_NIF[numero % 23]
    return m[3] === esperada
      ? { valido: true, comprobacion: 'digito', normalizado: v, tipo: 'NIE' }
      : { valido: false, comprobacion: 'digito', normalizado: v, tipo: 'NIE', motivo: `La letra debería ser ${esperada}` }
  }

  // CIF de sociedad: letra de tipo + 7 dígitos + control (dígito o letra).
  m = v.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/)
  if (m) {
    const digitos = m[2]
    let pares = 0
    let impares = 0
    for (let i = 0; i < 7; i++) {
      const d = Number(digitos[i])
      if (i % 2 === 0) {
        // Posiciones impares (1.ª, 3.ª…): se duplican y se suman sus cifras.
        const doble = d * 2
        impares += doble > 9 ? doble - 9 : doble
      } else {
        pares += d
      }
    }
    const control = (10 - ((pares + impares) % 10)) % 10
    const esperado = 'PQRSNW'.includes(m[1]) ? 'JABCDEFGHI'[control] : String(control)
    const alternativo = 'PQRSNW'.includes(m[1]) ? String(control) : 'JABCDEFGHI'[control]
    return m[3] === esperado || m[3] === alternativo
      ? { valido: true, comprobacion: 'digito', normalizado: v, tipo: 'CIF' }
      : { valido: false, comprobacion: 'digito', normalizado: v, tipo: 'CIF', motivo: `El control debería ser ${esperado}` }
  }

  return { valido: false, comprobacion: 'formato', normalizado: v, tipo: null, motivo: 'No tiene forma de NIF, NIE ni CIF' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guatemala: NIT
// ─────────────────────────────────────────────────────────────────────────────

function guatemala(v: string): ResultadoFiscal {
  const m = v.match(/^(\d{1,12})([0-9K])$/)
  if (!m) {
    return { valido: false, comprobacion: 'formato', normalizado: v, tipo: 'NIT', motivo: 'El NIT son dígitos más un verificador (0-9 o K)' }
  }
  const cuerpo = m[1]
  let suma = 0
  for (let i = 0; i < cuerpo.length; i++) {
    suma += Number(cuerpo[i]) * (cuerpo.length + 1 - i)
  }
  const resto = 11 - (suma % 11)
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return m[2] === esperado
    ? { valido: true, comprobacion: 'digito', normalizado: v, tipo: 'NIT' }
    : { valido: false, comprobacion: 'digito', normalizado: v, tipo: 'NIT', motivo: `El verificador debería ser ${esperado}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// El resto: comprobación de forma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formas conocidas por país. No llevan dígito verificador público, o no está
 * documentado de forma fiable, así que solo se comprueba la estructura y se
 * marca como `formato` — nunca como si se hubiera validado de verdad.
 */
const FORMAS: Record<string, { patron: RegExp; tipo: string; descripcion: string }> = {
  HND: { patron: /^\d{14}$/, tipo: 'RTN', descripcion: '14 dígitos' },
  SLV: { patron: /^\d{14}$/, tipo: 'NIT', descripcion: '14 dígitos' },
  NIC: { patron: /^[A-Z0-9]{14}$/, tipo: 'RUC', descripcion: '14 caracteres' },
  CRI: { patron: /^\d{9,12}$/, tipo: 'Cédula jurídica', descripcion: 'entre 9 y 12 dígitos' },
  PAN: { patron: /^[0-9A-Z-]{5,20}$/, tipo: 'RUC', descripcion: 'RUC panameño' },
  MEX: { patron: /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/, tipo: 'RFC', descripcion: 'RFC de 12 o 13 caracteres' },
  COL: { patron: /^\d{9,10}-?\d?$/, tipo: 'NIT', descripcion: 'NIT colombiano' },
  USA: { patron: /^\d{9}$/, tipo: 'EIN', descripcion: '9 dígitos' },
  ARG: { patron: /^\d{11}$/, tipo: 'CUIT', descripcion: '11 dígitos' },
  CHL: { patron: /^\d{7,8}[0-9K]$/, tipo: 'RUT', descripcion: 'RUT chileno' },
  PER: { patron: /^\d{11}$/, tipo: 'RUC', descripcion: '11 dígitos' },
  ECU: { patron: /^\d{13}$/, tipo: 'RUC', descripcion: '13 dígitos' },
  DOM: { patron: /^\d{9,11}$/, tipo: 'RNC', descripcion: 'RNC dominicano' },
}

/**
 * Argentina: el CUIT sí lleva verificador módulo 11, y se usa mucho, así que
 * se comprueba de verdad.
 */
function argentina(v: string): ResultadoFiscal {
  if (!/^\d{11}$/.test(v)) {
    return { valido: false, comprobacion: 'formato', normalizado: v, tipo: 'CUIT', motivo: 'El CUIT son 11 dígitos' }
  }
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(v[i]), 0)
  const resto = 11 - (suma % 11)
  const esperado = resto === 11 ? 0 : resto === 10 ? 9 : resto
  return Number(v[10]) === esperado
    ? { valido: true, comprobacion: 'digito', normalizado: v, tipo: 'CUIT' }
    : { valido: false, comprobacion: 'digito', normalizado: v, tipo: 'CUIT', motivo: `El verificador debería ser ${esperado}` }
}

/** Chile: RUT con verificador módulo 11. */
function chile(v: string): ResultadoFiscal {
  const m = v.match(/^(\d{7,8})([0-9K])$/)
  if (!m) return { valido: false, comprobacion: 'formato', normalizado: v, tipo: 'RUT', motivo: 'Forma de RUT no reconocida' }
  let suma = 0
  let factor = 2
  for (let i = m[1].length - 1; i >= 0; i--) {
    suma += Number(m[1][i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return m[2] === esperado
    ? { valido: true, comprobacion: 'digito', normalizado: v, tipo: 'RUT' }
    : { valido: false, comprobacion: 'digito', normalizado: v, tipo: 'RUT', motivo: `El verificador debería ser ${esperado}` }
}

export function validarIdentificadorFiscal(pais: string, identificador: string): ResultadoFiscal {
  const v = limpiar(identificador)
  const p = String(pais || '').toUpperCase()

  if (!v) return { valido: false, comprobacion: 'desconocido', normalizado: '', tipo: null, motivo: 'Identificador vacío' }

  if (p === 'ESP') return espana(v)
  if (p === 'GTM') return guatemala(v)
  if (p === 'ARG') return argentina(v)
  if (p === 'CHL') return chile(v)

  const forma = FORMAS[p]
  if (forma) {
    return forma.patron.test(v)
      ? { valido: true, comprobacion: 'formato', normalizado: v, tipo: forma.tipo }
      : {
          valido: false, comprobacion: 'formato', normalizado: v, tipo: forma.tipo,
          motivo: `Un ${forma.tipo} de ${p} son ${forma.descripcion}`,
        }
  }

  // País sin regla conocida: se acepta la forma general y se dice claramente
  // que no se ha comprobado nada más.
  return /^[A-Z0-9]{5,20}$/.test(v)
    ? {
        valido: true, comprobacion: 'desconocido', normalizado: v, tipo: null,
        motivo: `No hay regla de validación para ${p}: solo se comprobó la forma general`,
      }
    : {
        valido: false, comprobacion: 'desconocido', normalizado: v, tipo: null,
        motivo: 'El identificador debe tener entre 5 y 20 caracteres alfanuméricos',
      }
}

/** Países con validación aritmética de verdad, para mostrarlo en el panel. */
export const PAISES_CON_DIGITO = ['ESP', 'GTM', 'ARG', 'CHL']
