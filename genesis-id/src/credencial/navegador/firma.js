/* Lo justo para comprobar una credencial en el navegador: recuperar la
   dirección que firmó un texto, igual que hace `ethers.verifyMessage`.

   Se sirve DESDE ESTE MISMO ORIGEN y no desde un CDN. La página existe para
   que no haga falta confiar en Genesis ID; cargar el verificador de un tercero
   solo cambiaría en quién hay que confiar, y encima en alguien que nadie
   eligió. Que sea nuestro es honesto: se dice en la página, y se dan las
   órdenes para comprobarlo por fuera sin abrirla. */
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'

const deHex = (s) => Uint8Array.from((s.replace(/^0x/, '').match(/../g) || [])
  .map((b) => parseInt(b, 16)))
const hex = (b) => '0x' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

function sobreEip191(mensaje) {
  const cuerpo = new TextEncoder().encode(mensaje)
  const prefijo = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${cuerpo.length}`)
  return keccak_256(Uint8Array.from([...prefijo, ...cuerpo]))
}

export function quienFirmo(mensaje, firma) {
  try {
    const b = deHex(firma)
    if (b.length !== 65) return null
    const v = b[64] >= 27 ? b[64] - 27 : b[64]
    if (v !== 0 && v !== 1) return null
    const punto = secp256k1.Signature.fromCompact(b.slice(0, 64))
      .addRecoveryBit(v).recoverPublicKey(sobreEip191(mensaje))
    return hex(keccak_256(punto.toRawBytes(false).slice(1)).slice(-20))
  } catch { return null }
}
window.OG = { quienFirmo }
