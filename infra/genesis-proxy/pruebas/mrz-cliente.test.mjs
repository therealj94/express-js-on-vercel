// Los ayudantes de MRZ del cliente movil: son los que habilitan el boton de
// enviar, asi que si se equivocan la persona no puede avanzar (o manda basura).
const src = await import('fs').then(m => m.readFileSync('/home/user/express-js-on-vercel/veta-wallet-app/src/genesis.js','utf8'))
// Se extraen las dos funciones puras, sin arrastrar las dependencias de React Native.
const cuerpo = src.slice(src.indexOf('export function limpiarMrz'), src.indexOf('// ---------------------------------------------------------------------------\n// Estado'))
const mod = await import('data:text/javascript,' + encodeURIComponent(cuerpo))
const { limpiarMrz, revisarFormaMrz } = mod

let fallos = 0
const ok = (c, m) => { if (c) console.log('  ok   ', m); else { fallos++; console.log('  FALLA', m) } }

const TD3 = `P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
L898902C36UTO7408122F1204159ZE184226B<<<<<10`

ok(revisarFormaMrz(TD3).ok && revisarFormaMrz(TD3).formato === 'TD3', 'reconoce un pasaporte TD3')
ok(revisarFormaMrz(TD3.replace(/\n/g, '  \n  ')).ok, 'tolera espacios sobrantes al pegar')
ok(revisarFormaMrz(TD3.toLowerCase()).ok, 'tolera minusculas')
ok(limpiarMrz('p<uto«erik').includes('<'), 'convierte las comillas angulares que la gente teclea por error')

const TD1 = 'I<UTOD231458907<<<<<<<<<<<<<<<\n7408122F1204159UTO<<<<<<<<<<<6\nERIKSSON<<ANNA<MARIA<<<<<<<<<<'
ok(revisarFormaMrz(TD1).formato === 'TD1', 'reconoce una cedula TD1')

const TD2 = 'I<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<\nD231458907UTO7408122F1204159<<<<<<<6'
ok(revisarFormaMrz(TD2).formato === 'TD2', 'reconoce un TD2')

ok(!revisarFormaMrz('').ok, 'texto vacio -> no valido')
ok(!revisarFormaMrz('hola que tal').ok, 'texto cualquiera -> no valido')
const corto = revisarFormaMrz(TD3.split('\n')[0])
ok(!corto.ok && /línea/.test(corto.motivo), 'una sola linea -> dice cuantas leyo')
const recortado = revisarFormaMrz(TD3.split('\n').map(l => l.slice(0, 40)).join('\n'))
ok(!recortado.ok && /40/.test(recortado.motivo), 'lineas cortas -> dice cuantos caracteres tiene')

console.log(fallos ? `\n${fallos} FALLOS` : '\nMRZ DEL CLIENTE OK — 10 comprobaciones')
process.exit(fallos ? 1 : 0)
