/* La derivacion estandar del navegador tiene que dar EXACTAMENTE la misma
   direccion que ethers (y por tanto que MetaMask) para la ruta m/44'/60'/0'/0/N. */
import { HDNodeWallet, Mnemonic } from 'ethers'
import { readFileSync } from 'fs'
const W = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
eval(readFileSync(W+'/vendor/cripto-llaves.js','utf8'))
const L = eval(readFileSync(W+'/llaves.js','utf8').replace(/if \(typeof window[\s\S]*$/,'')+'; LLAVES')

const FRASES = [
 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
 'legal winner thank year wave sausage worth useful legal winner thank yellow',
 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
]
let f=0; const ok=(q,c,x='')=>{console.log(`${c?'  ok  ':' FALLA'}  ${q}${x?'  · '+x:''}`); if(!c)f++}

for (const frase of FRASES) {
  const c = await L.candidatas(frase)
  ok(`${frase.split(' ')[0]}… devuelve 4 estandar + la de la casa`, c.length === 5)
  for (let i = 0; i < 4; i++) {
    const esperada = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(frase), `m/44'/60'/0'/0/${i}`).address.toLowerCase()
    ok(`  cuenta ${i} coincide con MetaMask`, c[i].direccion === esperada, c[i].direccion)
  }
  // La de la casa tiene que ser DISTINTA de la estandar: si fueran iguales,
  // el problema que estamos arreglando no existiria.
  ok('  la de la casa es distinta de la estandar', c[4].direccion !== c[0].direccion)

  // Y la llave que se manda al servidor tiene que ser la de la cuenta elegida.
  const llave = await L.llaveParaImportar(frase, 1)
  const w = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(frase), "m/44'/60'/0'/0/1")
  ok('  la llave a importar es la de la cuenta elegida', llave === w.privateKey)
}

// Una llave privada suelta
const w = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(FRASES[0]), "m/44'/60'/0'/0/0")
const c = await L.candidatas(w.privateKey)
ok('una llave privada da una sola candidata', c.length === 1 && c[0].direccion === w.address.toLowerCase())
ok('y se importa tal cual', (await L.llaveParaImportar(w.privateKey, 0)) === w.privateKey)
ok('un texto cualquiera no da candidatas', (await L.candidatas('hola que tal')) === null)

console.log(f?`\n${f} en rojo\n`:'\nLa derivacion estandar coincide con MetaMask\n')
process.exit(f?1:0)
