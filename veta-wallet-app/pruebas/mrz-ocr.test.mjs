// La lectura de la MRZ con la cámara.
//
// Se prueba la parte que decide: la aritmética de los dígitos de control, el
// rescate de las líneas entre todo lo que ve el OCR, y la corrección de las
// confusiones típicas. Si esto falla, o la persona no puede avanzar, o —peor—
// avanza con un documento mal leído.
import { readFileSync } from 'fs'

const RUTA = '/home/user/express-js-on-vercel/veta-wallet-app/src/mrzOcr.js'
const src = readFileSync(RUTA, 'utf8')
// Se toma solo la parte pura, sin el reconocedor nativo, que aquí no existe.
const cuerpo = src.slice(src.indexOf('const VALOR'), src.indexOf('export async function leerDeFoto'))
const { digitoControl, cuadranDigitos, corregirConDigitos, extraerLineas } =
  await import('data:text/javascript,' + encodeURIComponent(cuerpo))

let fallos = 0
const ok = (c, m) => { if (c) console.log('  ok   ', m); else { fallos++; console.log('  FALLA', m) } }

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

console.log('\n1. Aritmética de los dígitos de control')
ok(digitoControl('L898902C3') === '6', 'número de documento del ejemplo oficial')
ok(digitoControl('740812') === '2', 'fecha de nacimiento del ejemplo oficial')
ok(digitoControl('120415') === '9', 'fecha de caducidad del ejemplo oficial')
ok(digitoControl('D23145890') === '7', 'número de documento del ejemplo TD1')

console.log('\n2. Un documento correcto cuadra entero')
ok(JSON.stringify(cuadranDigitos(TD3, 'TD3')) === '{"bien":3,"total":3}', 'pasaporte TD3: 3 de 3')
ok(JSON.stringify(cuadranDigitos(TD1, 'TD1')) === '{"bien":3,"total":3}', 'cédula TD1: 3 de 3')

console.log('\n3. Un documento manipulado NO cuadra')
// Cambiar la fecha de nacimiento para aparentar otra edad rompe la aritmética.
const falsificado = [TD3[0], TD3[1].slice(0, 13) + '840812' + TD3[1].slice(19)]
ok(cuadranDigitos(falsificado, 'TD3').bien < 3, 'una fecha de nacimiento alterada se detecta')

console.log('\n4. Corrección de las confusiones del OCR')
const cambiar = (linea, pos, c) => linea.slice(0, pos) + c + linea.slice(pos + 1)

const conO = [TD3[0], cambiar(TD3[1], 15, 'O')]        // 0 leído como O
ok(cuadranDigitos(conO, 'TD3').bien < 3, 'antes de corregir, no cuadra')
ok(corregirConDigitos(conO, 'TD3')?.[1] === TD3[1], 'recupera un 0 leído como O')

const conZ = [TD3[0], cambiar(TD3[1], 19, 'Z')]        // 2 leído como Z
ok(corregirConDigitos(conZ, 'TD3')?.[1] === TD3[1], 'recupera un 2 leído como Z')

const dosFallos = [TD3[0], cambiar(cambiar(TD3[1], 15, 'O'), 23, 'O')]
ok(corregirConDigitos(dosFallos, 'TD3')?.[1] === TD3[1], 'recupera dos errores a la vez')

const td1Malo = [TD1[0], cambiar(TD1[1], 3, 'B'), TD1[2]] // 8 leído como B
ok(corregirConDigitos(td1Malo, 'TD1')?.[1] === TD1[1], 'corrige también en una cédula TD1')

console.log('\n5. Lo que NO debe corregir')
// Un documento realmente alterado no se puede "arreglar": si esto devolviera
// algo, el lector estaría inventando documentos válidos a partir de basura.
ok(corregirConDigitos(falsificado, 'TD3') === null, 'no inventa una MRZ válida a partir de una alterada')
ok(corregirConDigitos(['XXXX', 'YYYY'], 'TD3') === null, 'no corrige lo que no es una MRZ')

console.log('\n6. Rescatar las líneas de todo lo que ve la cámara')
const ruido = `REPUBLICA DE HONDURAS
Registro Nacional de las Personas
JUAN CARLOS PEREZ
${TD3[0]}
${TD3[1]}
Firma del titular`
const sacado = extraerLineas(ruido)
ok(sacado?.formato === 'TD3', 'reconoce el formato entre el resto del documento')
ok(sacado?.lineas.join('\n') === TD3.join('\n'), 'devuelve exactamente las dos líneas')

const conEspacios = extraerLineas(TD3.map((l) => l.replace(/(.{10})/g, '$1 ')).join('\n'))
ok(conEspacios?.lineas[1] === TD3[1], 'tolera los espacios que mete el OCR')

const td1Sacado = extraerLineas('CEDULA\n' + TD1.join('\n'))
ok(td1Sacado?.formato === 'TD1' && td1Sacado.lineas.length === 3, 'reconoce una cédula de 3 líneas')

ok(extraerLineas('NOMBRE JUAN PEREZ\nFECHA 12/05/1990') === null, 'no ve una MRZ donde no la hay')
ok(extraerLineas('') === null, 'no revienta con texto vacío')


console.log('\n7. Casos reales de una cedula hondurena')
// Lo que devolvio ML Kit con el telefono demasiado cerca: las lineas salen
// cortadas por la derecha. Antes se descartaban y se decia "no se distinguen
// las lineas", que mandaba a la persona a buscar mas luz para nada.
const cortado = `COMISIONADOS PROPIETARIOS
I<HND0035996903<<<<<<<<<<<
9403213M3103212HND<<<
ORDONEZ<ENAMORADO<<`
const rCorte = extraerLineas(cortado)
ok(rCorte?.cortadas === true, 'detecta que las lineas salen cortadas')
ok(rCorte?.visto < 30, `informa cuanto se vio (${rCorte?.visto} caracteres)`)

// La misma cedula bien encuadrada.
const HND = [
  'I<HND0035996903<<<<<<<<<<<<<<<',
  '9403213M3103212HND<<<<<<<<<<<6',
  'ORDONEZ<ENAMORADO<<JOSE<MARIO<',
]
const bien = extraerLineas('REPUBLICA DE HONDURAS\nCOMISIONADOS PROPIETARIOS\n' + HND.join('\n'))
ok(bien?.formato === 'TD1', 'con la cedula entera reconoce el formato TD1')
ok(bien?.lineas.join('\n') === HND.join('\n'), 'devuelve las tres lineas exactas')

// El OCR parte una linea en dos cuando hay una sombra o un doblez.
const partido = ['I<HND00359969', '03<<<<<<<<<<<<<<<', HND[1], HND[2]].join('\n')
const unido = extraerLineas(partido)
ok(unido?.lineas?.[0] === HND[0], 'une los trozos de una linea partida por el OCR')

// El texto impreso del documento no debe confundirse con una MRZ.
ok(extraerLineas('COMISIONADOS PROPIETARIOS\nREPUBLICA DE HONDURAS\nJOSE MARIO ORDONEZ') === null,
  'el texto impreso del documento no se toma por MRZ')

console.log(fallos ? `\n${fallos} FALLOS\n` : '\nTodo en verde\n')
process.exit(fallos ? 1 : 0)
