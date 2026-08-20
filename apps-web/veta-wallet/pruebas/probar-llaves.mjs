/* Entrar con la frase semilla o la llave privada: lo que no puede cambiar.
 *
 * POR QUE HAY VECTORES FIJOS Y NO SE GENERAN AL VUELO
 *
 * Porque lo que hay que proteger no es «que el código sea consistente consigo
 * mismo» —eso lo sería aunque estuviera mal— sino que siga dando LA MISMA
 * DIRECCION que el alta del backend, que es:
 *
 *     privateKey = bip39.mnemonicToSeed(frase).slice(0, 32)
 *
 * Esa derivación NO es BIP-44. Si alguien la «arregla» para que sea la
 * estándar, cada cuenta pasaría a tener otra dirección y nadie podría entrar
 * con su propia frase. Estas tres direcciones se sacaron corriendo la
 * derivación de verdad del backend (bip39 + ethereumjs-wallet) y se
 * comprobaron contra ethers. Si un cambio las mueve, esta prueba se pone en
 * rojo antes de que se despliegue.
 *
 * Las frases son las de la documentación de BIP-39: son públicas desde hace
 * años y no son de nadie.
 *
 * La prueba no usa ninguna librería a propósito, igual que el resto de las de
 * esta carpeta: solo el mismo código que corre en el navegador.
 */
import { readFileSync } from 'fs'

const W = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
eval(readFileSync(W + '/vendor/cripto-llaves.js', 'utf8'))
const LLAVES = eval(
  readFileSync(W + '/llaves.js', 'utf8').replace(/if \(typeof window[\s\S]*$/, '') + '; LLAVES',
)

const VECTORES = [
  { frase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    llave: '0x5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1',
    direccion: '0xea6e8f7525e8af0669546ac6c5b8318fd2c6d7b6' },
  { frase: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
    llave: '0x878386efb78845b3355bd15ea4d39ef97d179cb712b77d5c12b6be415fffeffe',
    direccion: '0x5f8ad1b918ac16b21811f034f956e2cc605eefe6' },
  { frase: 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
    llave: '0x77d6be9708c8218738934f84bbbb78a2e048ca007746cb764f0673e4b1812d17',
    direccion: '0x0395dca432634f5a3d33782416d5748646fe593e' },
]

let fallos = 0
const ok = (q, c) => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}`); if (!c) fallos++ }
const reto = (dir) =>
  `Veta Wallet · entrar con tu llave\ndireccion: ${dir}\nreto: RETOFIJO123\nvence: 2026-12-31T00:00:00.000Z`

console.log('\nLa derivación tiene que seguir dando la dirección del alta\n')
for (const v of VECTORES) {
  const llave = await LLAVES._llaveDesdeFrase(v.frase)
  ok(`la llave privada de «${v.frase.split(' ')[0]}…»`, '0x' + LLAVES._hex(llave) === v.llave)
  ok(`la dirección de «${v.frase.split(' ')[0]}…»`, LLAVES._direccionDe(llave) === v.direccion)
}

console.log('\nLa credencial que viaja al servidor\n')
for (const v of VECTORES) {
  const c = await LLAVES.credencial(v.frase, reto(v.direccion))
  ok('lleva la dirección correcta', c.direccion === v.direccion)
  ok('lleva una firma de 64 bytes', /^0x[0-9a-f]{128}$/.test(c.firma))
  ok('lleva el bit de recuperación', c.recupera === 0 || c.recupera === 1)
  ok('NO lleva la llave privada', !JSON.stringify(c).includes(v.llave.slice(2)))
  ok('NO lleva la frase', !JSON.stringify(c).includes(v.frase.split(' ')[0] + ' '))
}

console.log('\nEntrar con la llave privada escrita a mano\n')
for (const forma of [VECTORES[0].llave, VECTORES[0].llave.slice(2), VECTORES[0].llave.toUpperCase().replace('0X', '0x')]) {
  const c = await LLAVES.credencial(forma, reto(VECTORES[0].direccion))
  ok(`acepta «${forma.slice(0, 8)}…»`, c.direccion === VECTORES[0].direccion)
}

console.log('\nLo que se tiene que rechazar antes de salir del navegador\n')
const malos = [
  ['una frase de 11 palabras', VECTORES[0].frase.split(' ').slice(0, 11).join(' ')],
  ['una frase de 13 palabras', VECTORES[0].frase + ' extra'],
  ['un texto cualquiera', 'hola que tal como estas'],
  ['una llave de 63 caracteres', '0x' + 'a'.repeat(63)],
  ['una llave de 65 caracteres', '0x' + 'a'.repeat(65)],
  ['una llave con letras fuera del hexadecimal', '0x' + 'z'.repeat(64)],
  ['el vacío', ''],
  ['solo espacios', '     '],
]
for (const [que, valor] of malos) {
  const c = await LLAVES.credencial(valor, reto(VECTORES[0].direccion))
  ok(`rechaza ${que}`, c.error === 'formato')
}

console.log('\nDos firmas del mismo reto no son iguales por casualidad\n')
{
  const a = await LLAVES.credencial(VECTORES[0].frase, reto(VECTORES[0].direccion))
  const b = await LLAVES.credencial(VECTORES[0].frase, reto(VECTORES[0].direccion))
  ok('firmar dos veces da la misma dirección', a.direccion === b.direccion)
  const otra = await LLAVES.credencial(VECTORES[0].frase, reto(VECTORES[1].direccion))
  ok('un reto distinto da una firma distinta', a.firma !== otra.firma)
}

console.log(fallos ? `\n${fallos} en rojo\n` : '\nTodo en verde\n')
process.exit(fallos ? 1 : 0)
