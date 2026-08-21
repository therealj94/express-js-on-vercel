/* La prueba que importa: una cuenta importada, SIN confirmar el correo,
   tiene que poder entrar con su frase. Es justo lo que estaba roto. */
import { HDNodeWallet, Mnemonic, Wallet } from 'ethers'
import { readFileSync } from 'fs'
const W = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
eval(readFileSync(W+'/vendor/cripto-llaves.js','utf8'))
const L = eval(readFileSync(W+'/llaves.js','utf8').replace(/if \(typeof window[\s\S]*$/,'')+'; LLAVES')
const API='https://vetawallet-1a2e38ac52b1.herokuapp.com'
let f=0; const ok=(q,c,x='')=>{console.log(`${c?'  ok  ':' FALLA'}  ${q}${x?'  · '+x:''}`); if(!c)f++}
const post=async(r,b)=>{const s=await fetch(API+r,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
  const t=await s.text(); let j={}; try{j=JSON.parse(t)}catch{}; return {estado:s.status,cuerpo:j,crudo:t.slice(0,90)}}

// Una frase nueva, de una billetera que no existe en ningun sitio.
const frase = Wallet.createRandom().mnemonic.phrase
const w = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(frase), "m/44'/60'/0'/0/0")
const correo = `prueba-sincorreo-${Date.now()}@ordenglobal.org`

console.log('\n1. Se trae la billetera (el correo de confirmacion NO va a salir)\n')
let r = await post('/auth/importar', { email: correo, password: 'unaClaveLarga1', name: 'Prueba',
  llavePrivada: w.privateKey, direccion: w.address })
ok('la cuenta se crea', r.estado===201, `${r.estado} ${r.cuerpo.message||r.crudo}`)
/* Con una direccion @ordenglobal.org el correo SI sale: el dominio esta
   verificado en SES aunque la cuenta siga en el cajon de pruebas. Lo que se
   comprueba es que la respuesta lo REPORTE, salga o no. */
ok('reporta si el correo salio', typeof r.cuerpo.correoEnviado === 'boolean', `correoEnviado=${r.cuerpo.correoEnviado}`)
ok('ya no dice «confirma tu correo para entrar»', !/para entrar/i.test(r.cuerpo.message||'') || /frase/i.test(r.cuerpo.message||''), r.cuerpo.message)

console.log('\n2. Con el correo SIN confirmar, se entra con la frase\n')
const previa = await L.credencial(frase, 'previo')
ok('la frase da la direccion de la casa', !!previa.direccion)
// Ojo: la cuenta se importo por la ruta ESTANDAR, asi que hay que firmar con esa.
const llave = await L.llaveParaImportar(frase, 0)
const wl = new Wallet(llave)
const r1 = await post('/auth/reto-llave', { direccion: wl.address })
ok('emite el reto', r1.estado===200)
const { secp, keccak_256 } = globalThis.LLAVECRIPTO
const hex = b => [...b].map(x=>x.toString(16).padStart(2,'0')).join('')
const resumen = keccak_256(new TextEncoder().encode(r1.cuerpo.reto))
const fi = secp.sign(resumen, llave.replace(/^0x/,''))
const r2 = await post('/auth/entrar-con-llave', { nonce: r1.cuerpo.nonce,
  firma: '0x'+hex(fi.toBytes('compact')), recupera: fi.recovery })
ok('ENTRA aunque el correo no este confirmado', r2.estado===200, `${r2.estado} ${r2.cuerpo.error||''}`)
ok('la sesion trae token', !!r2.cuerpo.token)
ok('y avisa de que el correo sigue sin confirmar', r2.cuerpo.correoConfirmado === false,
   `correoConfirmado=${r2.cuerpo.correoConfirmado}`)
console.log('\nCUENTA DE PRUEBA:', correo)
console.log(f?`\n${f} en rojo\n`:'\nTodo en verde\n')
process.exit(f?1:0)
