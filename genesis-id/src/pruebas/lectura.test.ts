// Pruebas de la lectura de la MRZ del reverso desde el texto de un OCR.
//
// Nada de esto llama a AWS. Se prueba lo que decide: que de entre todo lo que
// ve una cámara se rescaten las líneas correctas, que las confusiones típicas
// del OCR se corrijan solo cuando los dígitos de control lo confirman, y que
// sin proveedor la respuesta sea «sin lector» y no un documento inventado. El
// doble de prueba solo devuelve RENGLONES: si cuadran lo decide la aritmética.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

for (const v of ['GENESIS_AWS_ACCESS_KEY_ID', 'GENESIS_AWS_SECRET_ACCESS_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'GENESIS_BIOMETRIA_URL']) {
  delete process.env[v]
}

const {
  extraerLineas, cuadranDigitos, corregirConDigitos, arreglarNombres, interpretarOcr,
  leerReverso, lectorConfigurado, _fijarLectorReversoParaPruebas,
} = await import('../kyc/lectura.js')

// Los ejemplos del propio estándar ICAO 9303.
const TD3 = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
]
const TD1 = [
  'I<UTOD231458907<<<<<<<<<<<<<<<',
  '7408122F1204159UTO<<<<<<<<<<<6',
  'ERIKSSON<<ANNA<MARIA<<<<<<<<<<',
]

describe('Rescatar las líneas de todo lo que ve la cámara', () => {
  test('encuentra un pasaporte entre el ruido del documento', () => {
    const r = extraerLineas(['REPUBLICA DE UTOPIA', 'PASAPORTE / PASSPORT', ...TD3, 'Firma del titular'].join('\n'))
    assert.ok(r && !('cortadas' in r))
    assert.equal(r!.formato, 'TD3')
    assert.deepEqual(r!.lineas, TD3)
  })

  test('encuentra una cédula TD1 aunque el OCR ponga espacios', () => {
    const r = extraerLineas(TD1.map((l) => l.replace(/<<</g, '<< <')).join('\n'))
    assert.ok(r && !('cortadas' in r))
    assert.equal(r!.formato, 'TD1')
    assert.deepEqual(r!.lineas, TD1)
  })

  test('une una línea que el OCR partió en dos', () => {
    const r = extraerLineas([TD3[0].slice(0, 20), TD3[0].slice(20), TD3[1]].join('\n'))
    assert.ok(r && !('cortadas' in r))
    assert.deepEqual(r!.lineas, TD3)
  })

  test('el texto impreso del documento no pasa por MRZ', () => {
    assert.equal(extraerLineas('REPUBLICA DE HONDURAS\nCOMISIONADOS PROPIETARIOS\nTRIBUNAL SUPREMO ELECTORAL'), null)
  })

  test('líneas cortadas por el encuadre se señalan como tales', () => {
    const r = extraerLineas([TD1[0].slice(0, 24), TD1[1].slice(0, 24)].join('\n'))
    assert.ok(r && 'cortadas' in r)
    assert.equal(r!.visto, 24)
  })
})

describe('Corregir solo lo que los dígitos confirman', () => {
  test('un documento correcto cuadra entero', () => {
    assert.deepEqual(cuadranDigitos(TD3, 'TD3'), { bien: 3, total: 3 })
    assert.deepEqual(cuadranDigitos(TD1, 'TD1'), { bien: 3, total: 3 })
  })

  test('una O donde va un 0 en la fecha se arregla y cuadra', () => {
    const rota = [TD3[0], TD3[1].replace('7408122', '74O8122')]
    assert.equal(cuadranDigitos(rota, 'TD3').bien, 2)
    assert.deepEqual(corregirConDigitos(rota, 'TD3'), TD3)
  })

  test('una cifra en el apellido se arregla sin mirar dígitos: ahí no cabe una cifra', () => {
    assert.deepEqual(arreglarNombres([TD3[0].replace('ERIKSSON', 'ER1KSS0N'), TD3[1]], 'TD3'), TD3)
    assert.deepEqual(arreglarNombres([TD1[0], TD1[1], TD1[2].replace('ERIKSSON', 'ER1KSS0N')], 'TD1'), TD1)
  })

  test('un dígito cambiado por otro dígito NO se adivina', () => {
    assert.equal(corregirConDigitos([TD3[0], TD3[1].replace('7408122', '7408132')], 'TD3'), null)
  })

  test('de punta a punta: texto sucio del OCR → MRZ exacta e interpretada', () => {
    const sucio = ['UTOPIA', TD3[0].replace('ERIKSSON', 'ER1KSSON'), TD3[1].replace('7408122', '74O8122')].join('\n')
    const r = interpretarOcr(sucio)
    assert.equal(r.ok, true)
    assert.equal(r.corregida, true)
    assert.equal(r.mrz, TD3.join('\n'))
    assert.equal(r.datos?.nombreCompleto, 'ANNA MARIA ERIKSSON')
    assert.equal(r.datos?.fechaNacimiento, '1974-08-12')
    assert.equal(r.datos?.nacionalidad, 'UTO')
  })

  test('cuando no cuadra ni corrigiendo, se devuelve marcada para revisarla, no como buena', () => {
    const r = interpretarOcr([TD3[0], TD3[1].replace('7408122', '7408132')].join('\n'))
    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'digitos')
    assert.ok(r.mrz)
    assert.equal(r.datos, null)
  })

  test('sin nada con forma de MRZ, «no encontrada»; cortada, «cortadas»', () => {
    assert.equal(interpretarOcr('REPUBLICA DE HONDURAS').motivo, 'no-encontrada')
    assert.equal(interpretarOcr([TD1[0].slice(0, 24), TD1[1].slice(0, 24)].join('\n')).motivo, 'cortadas')
  })
})

describe('El lector', () => {
  test('sin credenciales de Rekognition no hay lector, y leer dice «sin lector», nunca una MRZ', async () => {
    _fijarLectorReversoParaPruebas(null)
    assert.equal(lectorConfigurado(), false)
    const r = await leerReverso('data:image/jpeg;base64,AAAA')
    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'sin-lector')
    assert.equal(r.mrz, null)
  })

  test('con un lector que devuelve renglones sucios, la aritmética decide', async () => {
    _fijarLectorReversoParaPruebas(async () => ['REPUBLICA', TD3[0], TD3[1].replace('7408122', '74O8122')])
    const r = await leerReverso('data:image/jpeg;base64,AAAA')
    assert.equal(r.ok, true)
    assert.equal(r.mrz, TD3.join('\n'))
    _fijarLectorReversoParaPruebas(null)
  })

  test('un lector que solo ve el impreso no produce documento', async () => {
    _fijarLectorReversoParaPruebas(async () => ['REPUBLICA DE HONDURAS', 'TRIBUNAL SUPREMO ELECTORAL'])
    const r = await leerReverso('data:image/jpeg;base64,AAAA')
    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'no-encontrada')
    _fijarLectorReversoParaPruebas(null)
  })
})
