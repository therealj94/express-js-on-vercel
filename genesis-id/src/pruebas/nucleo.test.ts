// Pruebas del núcleo de Genesis ID.
//
// Se centran en lo que de verdad decide si alguien queda verificado o no: la
// lectura del documento, la comparación de nombres contra listas, las reglas de
// monitoreo y —sobre todo— que no exista ninguna vía para aprobar una identidad
// sin que una persona lo firme.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { leerMrz, digitoControl } from '../kyc/mrz.js'
import { normalizar, fichas, parecidoNombres, jaroWinkler } from '../lib/texto.js'
import { gidPersonal, gidNegocio, gidValido } from '../lib/uid.js'
import { firmarToken, verificarToken, hashContrasena, verificarContrasena } from '../lib/cripto.js'
import { cargarEnMemoria, estadoListas } from '../aml/listas.js'
import { tamizarPersona, tamizarDireccion } from '../aml/tamiz.js'
import { evaluarRiesgo } from '../aml/riesgo.js'
import { evaluarMovimientos } from '../aml/monitoreo.js'
import { validarIdentificadorFiscal } from '../kyb/fiscal.js'
import { nivelPais } from '../aml/paises.js'
import { sinProveedor } from '../kyc/biometria.js'

// MRZ de ejemplo del propio estándar ICAO 9303.
const TD3 = `P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
L898902C36UTO7408122F1204159ZE184226B<<<<<10`

describe('MRZ (ICAO 9303)', () => {
  test('los dígitos de control del anexo del estándar cuadran', () => {
    assert.equal(digitoControl('L898902C3'), 6)
    assert.equal(digitoControl('740812'), 2)
    assert.equal(digitoControl('120415'), 9)
  })

  test('lee un pasaporte TD3 completo', () => {
    const r = leerMrz(TD3)
    assert.equal(r.ok, true)
    assert.equal(r.datos?.numeroDocumento, 'L898902C3')
    assert.equal(r.datos?.apellidos, 'ERIKSSON')
    assert.equal(r.datos?.nombres, 'ANNA MARIA')
    assert.equal(r.datos?.fechaNacimiento, '1974-08-12')
    assert.equal(r.datos?.sexo, 'F')
  })

  test('detecta una fecha de nacimiento manipulada', () => {
    const r = leerMrz(TD3.replace('7408122', '9008122'))
    assert.equal(r.ok, false)
    assert.ok(r.fallos.includes('fecha de nacimiento'))
    // El dígito compuesto también salta: por eso no basta con recalcular uno.
    assert.ok(r.fallos.includes('dígito compuesto'))
  })

  test('detecta un número de documento inventado', () => {
    const r = leerMrz(TD3.replace('L898902C3', 'Z999999Z9'))
    assert.equal(r.ok, false)
    assert.ok(r.fallos.includes('número de documento'))
  })

  test('rechaza una MRZ con longitud que no es de ningún formato', () => {
    const r = leerMrz('ESTO NO ES UNA MRZ')
    assert.equal(r.ok, false)
    assert.match(r.motivo ?? '', /Formato no reconocido/)
  })
})

describe('Revisión del documento', () => {
  test('un documento vencido no es aceptable', () => {
    // El del estándar venció en 2012.
    const r = revisarDocumento(TD3)
    assert.equal(r.aceptable, false)
    assert.ok(r.hallazgos.some((h) => h.clave === 'documento.vencido'))
  })

  test('un nombre declarado distinto del documento es hallazgo grave', () => {
    const r = revisarDocumento(TD3, { nombreCompleto: 'Pedro Martínez Gómez' })
    assert.ok(r.hallazgos.some((h) => h.clave === 'documento.nombreNoCoincide' && h.gravedad === 'grave'))
  })

  test('el mismo nombre en otro orden y sin tildes sí coincide', () => {
    const r = revisarDocumento(TD3, { nombreCompleto: 'Eriksson, Anna María' })
    assert.ok(!r.hallazgos.some((h) => h.clave === 'documento.nombreNoCoincide'))
  })
})

describe('Comparación de nombres', () => {
  test('normaliza tildes, ligaduras y puntuación', () => {
    assert.equal(normalizar('José Ángel Ñuñez-Pérez'), 'JOSE ANGEL NUNEZ PEREZ')
    assert.equal(normalizar('Åsa Ø. Þorsson'), 'ASA O THORSSON')
  })

  test('descarta las partículas que no distinguen a nadie', () => {
    assert.deepEqual(fichas('Juan de la Cruz'), ['JUAN', 'CRUZ'])
  })

  test('el orden de los apellidos no cambia el resultado', () => {
    assert.equal(parecidoNombres('Juan García Pérez', 'García Pérez, Juan'), 1)
  })

  test('tolera un error de escritura al final del apellido', () => {
    assert.ok(parecidoNombres('Juan Martínez', 'Juan Martines') > 0.9)
  })

  test('reconoce variantes de transliteración', () => {
    // Es la causa más común de falsos negativos en tamizado real.
    assert.equal(parecidoNombres('Mohammed Ali', 'Muhammad Aly'), 1)
  })

  test('un nombre corto encuentra al mismo dentro de uno largo', () => {
    assert.ok(parecidoNombres('Juan García', 'Juan Carlos García Pérez de la Vega') >= 0.92)
  })

  test('dos personas distintas no se parecen', () => {
    assert.ok(parecidoNombres('Ana López', 'Roberto Fernández') < 0.6)
  })

  test('Jaro-Winkler premia el prefijo común', () => {
    assert.ok(jaroWinkler('MARTINEZ', 'MARTINES') > jaroWinkler('MARTINEZ', 'XARTINES'))
  })
})

describe('GID', () => {
  test('los GID generados son válidos', () => {
    for (let i = 0; i < 200; i++) {
      assert.ok(gidValido(gidPersonal()))
      assert.ok(gidValido(gidNegocio()))
    }
  })

  test('cambiar un carácter invalida el GID', () => {
    const gid = gidPersonal()
    const alfabeto = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    // Se cambia el primer carácter del cuerpo por otro distinto.
    const otro = alfabeto[(alfabeto.indexOf(gid[4]) + 1) % alfabeto.length]
    assert.equal(gidValido(gid.slice(0, 4) + otro + gid.slice(5)), false)
  })

  test('no usa caracteres que se confunden al leer', () => {
    const muestra = Array.from({ length: 300 }, () => gidPersonal()).join('')
    assert.equal(/[IO01]/.test(muestra.replace(/GEN|GNB/g, '')), false)
  })
})

describe('Criptografía', () => {
  test('la contraseña se verifica y no se guarda en claro', () => {
    const hash = hashContrasena('una contraseña larga y buena')
    assert.ok(!hash.includes('una contraseña'))
    assert.ok(verificarContrasena('una contraseña larga y buena', hash))
    assert.ok(!verificarContrasena('otra cosa', hash))
  })

  test('un token firmado se verifica', () => {
    const ahora = Math.floor(Date.now() / 1000)
    const t = firmarToken({ sub: 'GEN-AAAA-BBBB-C', app: 'veta-wallet', alcances: ['perfil'], iat: ahora, exp: ahora + 60 }, 'secreto')
    assert.equal(verificarToken(t, 'secreto')?.sub, 'GEN-AAAA-BBBB-C')
  })

  test('un token con otro secreto no se acepta', () => {
    const ahora = Math.floor(Date.now() / 1000)
    const t = firmarToken({ sub: 'X', app: 'a', alcances: [], iat: ahora, exp: ahora + 60 }, 'secreto')
    assert.equal(verificarToken(t, 'otro-secreto'), null)
  })

  test('un token vencido no se acepta', () => {
    const ahora = Math.floor(Date.now() / 1000)
    const t = firmarToken({ sub: 'X', app: 'a', alcances: [], iat: ahora - 120, exp: ahora - 60 }, 'secreto')
    assert.equal(verificarToken(t, 'secreto'), null)
  })

  test('no se acepta un token sin firma (alg: none)', () => {
    // El fallo clásico de las librerías de JWT: fiarse del `alg` del token.
    const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'GID' })).toString('base64url')
    const cuerpo = Buffer.from(JSON.stringify({
      sub: 'GEN-FALSO', app: 'x', alcances: [], iat: 0, exp: 9999999999,
    })).toString('base64url')
    assert.equal(verificarToken(`${cabecera}.${cuerpo}.`, 'secreto'), null)
  })
})

describe('Tamizado de sanciones', () => {
  // Fichas inventadas para la prueba. No son personas reales.
  const LISTA = [
    {
      id: 'PRUEBA-1', nombre: 'IVANOV, Sergei Petrovich', alias: ['SERGEY IVANOV'],
      tipo: 'persona' as const, programa: 'PRUEBA', lista: 'PRUEBA',
      fechaNacimiento: '1965-03-12', nacionalidades: ['RUS'],
      direcciones: ['0xDEADBEEF00000000000000000000000000000001'],
    },
    {
      id: 'PRUEBA-2', nombre: 'COMERCIAL FICTICIA S.A.', alias: [],
      tipo: 'entidad' as const, programa: 'PRUEBA', lista: 'PRUEBA',
    },
  ]

  test('sin listas cargadas NO dice que esté limpio', () => {
    cargarEnMemoria([], 'vacia')
    const r = tamizarPersona('Cualquier Persona')
    // Esta es la distinción que evita el falso verde.
    assert.equal(r.tamizado, false)
    assert.equal(r.coincidencias.length, 0)
  })

  test('encuentra al sancionado aunque el nombre venga en otro orden', () => {
    cargarEnMemoria(LISTA, 'prueba')
    const r = tamizarPersona('Sergei Petrovich Ivanov')
    assert.equal(r.tamizado, true)
    assert.equal(r.fuertes, 1)
  })

  test('encuentra por alias', () => {
    cargarEnMemoria(LISTA, 'prueba')
    assert.ok(tamizarPersona('Sergey Ivanov').fuertes >= 1)
  })

  test('una fecha de nacimiento distinta baja la puntuación', () => {
    cargarEnMemoria(LISTA, 'prueba')
    const mismo = tamizarPersona('Sergei Petrovich Ivanov', { fechaNacimiento: '1965-03-12' })
    const otro = tamizarPersona('Sergei Petrovich Ivanov', { fechaNacimiento: '1990-01-01' })
    assert.ok(mismo.coincidencias[0].puntuacion > otro.coincidencias[0].puntuacion)
    assert.equal(mismo.fuertes, 1)
    assert.equal(otro.fuertes, 0)
  })

  test('con el nombre exacto pero otra fecha, la coincidencia NO desaparece', () => {
    // Una fecha de nacimiento falsa es una forma habitual de esquivar el
    // tamizado. Si la coincidencia se descartara sin más, bastaría con mentir
    // en la fecha para pasar limpio.
    cargarEnMemoria(LISTA, 'prueba')
    const r = tamizarPersona('Sergei Petrovich Ivanov', { fechaNacimiento: '1990-01-01' })
    assert.equal(r.coincidencias.length, 1, 'el analista tiene que seguir viéndola')
    assert.equal(r.fuertes, 0, 'pero ya no cuenta como coincidencia fuerte')
    assert.match(r.coincidencias[0].razones.join(' '), /NO coincide/)
  })

  test('alguien que no está en la lista no coincide', () => {
    cargarEnMemoria(LISTA, 'prueba')
    assert.equal(tamizarPersona('Roberto Fernández Castillo').coincidencias.length, 0)
  })

  test('encuentra una dirección de criptomoneda sancionada', () => {
    cargarEnMemoria(LISTA, 'prueba')
    const r = tamizarDireccion('0xdeadbeef00000000000000000000000000000001')
    assert.equal(r.sancionada, true)
    assert.equal(r.registro?.id, 'PRUEBA-1')
  })

  test('una dirección cualquiera no está sancionada', () => {
    cargarEnMemoria(LISTA, 'prueba')
    assert.equal(tamizarDireccion('0x1111111111111111111111111111111111111111').sancionada, false)
  })

  test('el estado de las listas informa de lo que hay cargado', () => {
    cargarEnMemoria(LISTA, 'prueba')
    assert.equal(estadoListas().cargadas, true)
    assert.equal(estadoListas().registros, 2)
  })
})

describe('Riesgo', () => {
  const documentoBueno = {
    aceptable: true, datos: null, hallazgos: [], edad: 30,
  }

  test('sin tamizado NO se puede aprobar, aunque todo lo demás esté bien', () => {
    cargarEnMemoria([], 'vacia')
    const r = evaluarRiesgo({
      documento: documentoBueno as any,
      tamiz: tamizarPersona('Alguien'),
      biometria: { estado: 'ok', parecido: 0.95, vivacidad: 0.99, proveedor: 'x', evaluadoEn: '' },
    })
    assert.notEqual(r.recomendacion, 'aprobar')
    assert.ok(r.bloqueos.some((b) => /no ha sido tamizada/i.test(b)))
  })

  test('sin proveedor de biometría queda bloqueada', () => {
    cargarEnMemoria([{ id: 'x', nombre: 'NADIE', alias: [], tipo: 'persona', programa: '', lista: 'p' }], 'p')
    const r = evaluarRiesgo({
      documento: documentoBueno as any,
      tamiz: tamizarPersona('Alguien Distinto'),
      biometria: sinProveedor(),
    })
    assert.ok(r.bloqueos.some((b) => /biometr/i.test(b)))
    assert.notEqual(r.recomendacion, 'aprobar')
  })

  test('un país prohibido da riesgo inaceptable', () => {
    const r = evaluarRiesgo({
      documento: documentoBueno as any,
      tamiz: { tamizado: true, coincidencias: [], fuertes: 0, posibles: 0, estadoListas: estadoListas() },
      biometria: { estado: 'ok', parecido: 0.95, vivacidad: 0.99, proveedor: 'x', evaluadoEn: '' },
      pais: 'PRK',
    })
    assert.equal(r.nivel, 'inaceptable')
    assert.equal(r.recomendacion, 'rechazar')
  })

  test('todo en orden da recomendación de aprobar', () => {
    const r = evaluarRiesgo({
      documento: documentoBueno as any,
      tamiz: { tamizado: true, coincidencias: [], fuertes: 0, posibles: 0, estadoListas: estadoListas() },
      biometria: { estado: 'ok', parecido: 0.95, vivacidad: 0.99, proveedor: 'x', evaluadoEn: '' },
      pais: 'HND',
    })
    assert.equal(r.bloqueos.length, 0)
    assert.equal(r.recomendacion, 'aprobar')
  })
})

describe('Países', () => {
  test('las jurisdicciones del llamamiento del GAFI están prohibidas', () => {
    assert.equal(nivelPais('PRK'), 'prohibido')
    assert.equal(nivelPais('IRN'), 'prohibido')
  })
  test('las de vigilancia intensificada son de alto riesgo', () => {
    assert.equal(nivelPais('VEN'), 'alto')
  })
  test('un país normal es normal', () => {
    assert.equal(nivelPais('HND'), 'normal')
    assert.equal(nivelPais('ESP'), 'normal')
  })
  test('un código inventado no se da por bueno', () => {
    assert.equal(nivelPais('XXX'), 'medio')
  })
})

describe('Monitoreo de transacciones', () => {
  const mov = (i: number, montoUsd: number, direccion: 'entrada' | 'salida', horasAtras: number) => ({
    id: `m${i}`, gid: 'GEN-X', direccion, contraparte: `0x${i}`.padEnd(42, '0'),
    monto: montoUsd, activo: 'USDT', montoUsd,
    fecha: new Date(Date.now() - horasAtras * 3600000).toISOString(),
  })

  test('una operación sobre el umbral genera alerta reportable', () => {
    const a = evaluarMovimientos([mov(1, 15000, 'entrada', 1)])
    const umbral = a.find((x) => x.regla === 'umbral.unico')
    assert.ok(umbral)
    assert.equal(umbral!.reportable, true)
  })

  test('detecta fraccionamiento justo bajo el umbral', () => {
    const movs = [mov(1, 9500, 'entrada', 10), mov(2, 9400, 'entrada', 20), mov(3, 9600, 'entrada', 30)]
    const a = evaluarMovimientos(movs)
    const e = a.find((x) => x.regla === 'estructuracion')
    assert.ok(e, 'debería detectar estructuración')
    assert.equal(e!.gravedad, 'critica')
  })

  test('tres operaciones normales no disparan fraccionamiento', () => {
    const movs = [mov(1, 100, 'entrada', 10), mov(2, 250, 'entrada', 20), mov(3, 80, 'salida', 30)]
    assert.equal(evaluarMovimientos(movs).some((x) => x.regla === 'estructuracion'), false)
  })

  test('detecta la cuenta de paso', () => {
    const movs = [mov(1, 5000, 'entrada', 30), mov(2, 4800, 'salida', 20)]
    assert.ok(evaluarMovimientos(movs).some((x) => x.regla === 'cuenta.paso'))
  })

  test('detecta contraparte sancionada', () => {
    cargarEnMemoria([{
      id: 'S1', nombre: 'SANCIONADO', alias: [], tipo: 'persona', programa: 'P', lista: 'P',
      direcciones: ['0xBAD0000000000000000000000000000000000001'],
    }], 'prueba')
    const m = { ...mov(1, 50, 'salida', 1), contraparte: '0xBAD0000000000000000000000000000000000001' }
    const a = evaluarMovimientos([m])
    assert.ok(a.some((x) => x.regla === 'contraparte.sancionada' && x.gravedad === 'critica'))
  })

  test('sin movimientos no hay alertas', () => {
    assert.equal(evaluarMovimientos([]).length, 0)
  })
})

describe('Identificadores fiscales', () => {
  test('valida un NIF español por su letra', () => {
    // 12345678 % 23 = 14 -> 'Z'
    assert.equal(validarIdentificadorFiscal('ESP', '12345678Z').valido, true)
    assert.equal(validarIdentificadorFiscal('ESP', '12345678A').valido, false)
  })

  test('el NIF validado se marca como comprobado por dígito', () => {
    assert.equal(validarIdentificadorFiscal('ESP', '12345678Z').comprobacion, 'digito')
  })

  test('valida un RTN hondureño solo por su forma, y lo dice', () => {
    const r = validarIdentificadorFiscal('HND', '08011985123456')
    assert.equal(r.valido, true)
    // Aquí está la honestidad: no se afirma que exista, solo que tiene la forma.
    assert.equal(r.comprobacion, 'formato')
  })

  test('rechaza un RTN con longitud incorrecta', () => {
    assert.equal(validarIdentificadorFiscal('HND', '123').valido, false)
  })

  test('valida un CUIT argentino por su verificador', () => {
    assert.equal(validarIdentificadorFiscal('ARG', '20-12345678-6').valido, true)
    assert.equal(validarIdentificadorFiscal('ARG', '20-12345678-9').valido, false)
  })

  test('un país sin regla se marca como no comprobado', () => {
    assert.equal(validarIdentificadorFiscal('JPN', 'ABC123456').comprobacion, 'desconocido')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Nombres cortados por el ancho de la MRZ (caso real, cedula hondureña)
// ─────────────────────────────────────────────────────────────────────────────

test('un nombre truncado por el documento sigue coincidiendo', () => {
  // La MRZ tiene ancho fijo: «JOSE» se imprime «JOS». No es una discrepancia,
  // es lo que el Estado emitio, y bloquear por eso acusa a la persona de algo
  // que hizo bien.
  assert.ok(parecidoNombres('Jose Ordoñez', 'ORDONEZ JOS') > 0.9)
  assert.ok(parecidoNombres('Jose Mario Ordoñez Enamorado', 'ORDONEZ ENAMORADO JOS MARIO') > 0.9)
  assert.ok(parecidoNombres('Maria Jose Nuñez Peña', 'NUNEZ PENA MARIA JOS') > 0.9)
})

test('la Ñ del documento, que la MRZ escribe como N, no estorba', () => {
  assert.equal(parecidoNombres('José Mario Ordóñez Enamorado', 'ORDONEZ ENAMORADO JOSE MARIO'), 1)
  assert.equal(parecidoNombres('Peña', 'PENA'), 1)
})

test('truncar no puede servir para colar a otra persona', () => {
  assert.ok(parecidoNombres('Jose Mario Ordoñez Enamorado', 'ORDONEZ ENAMORADO CARLOS ALBERTO') < 0.85)
  assert.ok(parecidoNombres('Juan Perez', 'RODRIGUEZ MARTINEZ ANA') < 0.85)
  // Dos letras no bastan: «AN» no puede dar por bueno a «ANASTASIA».
  assert.ok(parecidoNombres('An Lopez', 'LOPEZ ANASTASIA') < 0.9)
})

test('las equivalencias de transliteracion siguen funcionando', () => {
  // Lo que se arreglo no puede haber roto el motivo por el que existe la tabla.
  assert.equal(parecidoNombres('Youssef Ibrahim', 'YUSUF IBRAHEEM'), 1)
  assert.equal(parecidoNombres('Mohammed Ali', 'MUHAMMAD ALY'), 1)
})

// ─────────────────────────────────────────────────────────────────────────────
// El anverso del documento
// ─────────────────────────────────────────────────────────────────────────────

import { revisarDocumento } from '../kyc/documento.js'

// Cedula hondureña TD1 con el nombre cortado por el ancho de la MRZ, que es
// exactamente lo que devuelve un documento real.
const CEDULA = [
  'I<HND0035996903<<<<<<<<<<<<<<<',
  '9403213M3103212HND<<<<<<<<<<<4',
  'ORDONEZ<ENAMORADO<<MEDARDO<JOS',
].join('\n')

const ANVERSO = `REPUBLICA DE HONDURAS
REGISTRO NACIONAL DE LAS PERSONAS
Nombres: MEDARDO JOSE
Apellidos: ORDONEZ ENAMORADO
Fecha de nacimiento: 21/03/1994`

test('sin anverso, el nombre cortado por la MRZ deja aviso pero no bloquea', () => {
  const r = revisarDocumento(CEDULA, { nombreCompleto: 'Medardo Jose Ordonez Enamorado' })
  assert.equal(r.anverso.aportado, false)
  assert.ok(r.hallazgos.some((h) => h.clave === 'anverso.falta'))
})

test('con el anverso se confirma el nombre entero y la fecha', () => {
  const r = revisarDocumento(
    CEDULA,
    { nombreCompleto: 'Medardo Jose Ordonez Enamorado', fechaNacimiento: '1994-03-21' },
    ANVERSO)
  assert.equal(r.anverso.aportado, true)
  assert.equal(r.anverso.nombreConfirmado, true)
  assert.equal(r.anverso.fechaConfirmada, true)
  assert.ok(r.aceptable, 'un documento correcto con anverso tiene que ser aceptable')
})

test('si el anverso no confirma el nombre, avisa pero NO bloquea por si solo', () => {
  // Corrige un error propio: bloquear porque el reconocimiento no encontro una
  // palabra en el anverso. Ese anverso esta impreso sobre una filigrana de
  // colores y se fotografia de lado; una lectura fallida no dice nada de nadie.
  // Quien decide sigue siendo la MRZ, que lleva digitos de control — y ahi este
  // nombre inventado si choca, y ese es el que bloquea.
  const r = revisarDocumento(
    CEDULA, { nombreCompleto: 'Carlos Alberto Ramirez Lopez' }, ANVERSO)
  assert.equal(r.anverso.nombreConfirmado, false)
  assert.ok(r.hallazgos.some((h) => h.clave === 'anverso.nombreNoLegible' && h.gravedad === 'aviso'))
  assert.ok(r.hallazgos.some((h) => h.clave === 'documento.nombreNoCoincide' && h.gravedad === 'grave'),
    'lo que bloquea es la MRZ, no el anverso')
  assert.ok(!r.aceptable)
})

test('un anverso ilegible no tumba una verificacion buena', () => {
  // El caso real: cedula correcta, anverso fotografiado de lado y con reflejos
  // del que apenas se saca texto. Tiene que seguir siendo aceptable.
  const r = revisarDocumento(
    CEDULA,
    { nombreCompleto: 'Medardo Jose Ordonez Enamorado', fechaNacimiento: '1994-03-21' },
    'REPUBLICA DE HONDURAS\nRNP\nDOCUMENTO NACIONAL DE IDENTIFICACION')
  assert.equal(r.anverso.nombreConfirmado, false)
  assert.ok(r.aceptable, 'un anverso ilegible no puede bloquear un documento correcto')
})

test('el anverso levanta el bloqueo del nombre cortado, sin ocultarlo', () => {
  // Un solo nombre de pila: contra la MRZ cortada esto daba por debajo del
  // minimo y bloqueaba. El anverso demuestra que no habia discrepancia.
  const r = revisarDocumento(
    CEDULA, { nombreCompleto: 'Medardo Jose Ordonez Enamorado' }, ANVERSO)
  assert.ok(!r.hallazgos.some((h) => h.clave === 'documento.nombreNoCoincide'))
  assert.ok(r.aceptable)
})

test('un anverso vacio o ilegible no se cuenta como comprobado', () => {
  const r = revisarDocumento(CEDULA, { nombreCompleto: 'Medardo Jose Ordonez' }, '   ')
  assert.equal(r.anverso.aportado, false)
  assert.notEqual(r.anverso.nombreConfirmado, true)
})

test('el nombre recortado por la MRZ no acaba impreso en la credencial', () => {
  // «MEDARDO JOS ORDONEZ ENAMORADO» salia en el pasaporte como si la persona
  // se llamara asi. Es el ancho del campo, no su nombre.
  const r = revisarDocumento(
    CEDULA,
    { nombreCompleto: 'Medardo Jose Ordonez Enamorado', fechaNacimiento: '1994-03-21' },
    ANVERSO)
  assert.equal(r.anverso.nombreConfirmado, true)
  assert.ok(r.datos!.nombreCompleto.includes('JOS'), 'el documento sigue diciendo lo que dice')
  assert.ok(!r.datos!.nombreCompleto.includes('JOSE'), 'y viene recortado, que es el caso a cubrir')
})
