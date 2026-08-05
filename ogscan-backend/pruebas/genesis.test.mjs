// Prueba el modulo de consulta a Genesis del explorador contra el Genesis ID
// que corre en local, con las mismas listas sembradas.
const { estadoDeDireccion, genesisActivo } = await import('/home/user/express-js-on-vercel/ogscan-backend/src/lib/genesis.js')
let fallos = 0
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FALLA ') + m); if (!c) fallos++ }

ok(genesisActivo(), 'la clave esta configurada')

const sancionada = await estadoDeDireccion('0xDEADBEEF00000000000000000000000000000001')
ok(sancionada.consultado === true, 'se consulto de verdad')
ok(sancionada.sancionada === true, 'la direccion de la lista sale como sancionada')
ok(sancionada.ficha?.lista === 'DEMO', 'trae la lista donde figura')

const limpia = await estadoDeDireccion('0x1111111111111111111111111111111111111111')
ok(limpia.sancionada === false, 'una direccion normal sale limpia')
ok(limpia.verificada === false, 'y sin identidad verificada')

// La cache: la segunda consulta no debe volver a salir a la red.
const t0 = Date.now()
await estadoDeDireccion('0x1111111111111111111111111111111111111111')
ok(Date.now() - t0 < 20, `la segunda consulta sale de la cache (${Date.now() - t0} ms)`)

console.log(fallos ? `\n${fallos} FALLOS` : '\nEXPLORADOR+GENESIS OK — 7 comprobaciones')
process.exit(fallos ? 1 : 0)
