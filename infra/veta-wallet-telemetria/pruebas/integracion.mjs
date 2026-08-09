// Prueba de integración contra un Genesis ID de verdad.
//
// Usa los módulos REALES —sin fetch de mentira— contra un servidor levantado
// en local, y comprueba lo único que de verdad importa de todo este montaje:
// que después de mandar el padrón y un error, el panel pueda decir A QUIEN le
// pasó, con su nombre.
//
// Se corre a mano, no en CI: necesita el servidor arriba.
//
//   node pruebas/integracion.mjs <PUERTO> <CLAVE_SECRETA> <CLAVE_PUBLICA>

const [, , PUERTO, SECRETA, PUBLICA] = process.argv
const BASE = `http://localhost:${PUERTO}`

process.env.GENESIS_URL = BASE
process.env.GENESIS_API_KEY = SECRETA
process.env.GENESIS_TELEMETRIA_KEY = PUBLICA
process.env.GENESIS_TELEMETRIA_INTERVALO_MS = '300'

const tele = await import('../telemetria.js')
const dir = await import('../directorio.js')

const fallos = []
const chk = (c, m) => { if (!c) fallos.push(m); else console.log('  ✓', m) }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

// Usuarios como los tendría el backend de Veta Wallet en Mongo.
const USUARIOS = [
  { _id: 'aa11', email: 'maria@vw.hn', nombre: 'Maria Elena Fuentes', address: '0xaaa1000000000000000000000000000000000001', pais: 'HN', password: 'NO-DEBE-SALIR', seed: 'NO-DEBE-SALIR' },
  { _id: 'bb22', email: 'carlos@vw.hn', nombre: 'Carlos Alberto Nunez', address: '0xbbb2000000000000000000000000000000000002', pais: 'HN' },
  { _id: 'cc33', email: 'ana@vw.gt', nombre: 'Ana Sofia Ramirez', address: '0xccc3000000000000000000000000000000000003', pais: 'GT' },
]

console.log('\n1. Sincronizar el padrón con los módulos reales')
const r1 = await dir.sincronizar(USUARIOS)
chk(r1.ok, `padrón enviado: ${r1.enviados} usuarios`)

console.log('\n2. Mandar telemetría: ingresos, una transacción y un error')
for (const u of USUARIOS) {
  tele.ingreso(tele.idDeUsuario(u), { pais: u.pais, plataforma: 'android' })
}
tele.ingreso(tele.idDeUsuario(USUARIOS[0]), { pais: 'HN', plataforma: 'web' })
tele.transaccion(tele.idDeUsuario(USUARIOS[1]), { valor: 750, moneda: 'USD' })

// El error que sufren dos personas — el caso que motivó todo esto.
const error = new Error('TypeError: no se pudo firmar la transaccion (saldo indefinido)')
error.stack = 'at firmar (tx.js:88)\nat enviar (pago.js:41)'
for (const u of [USUARIOS[0], USUARIOS[0], USUARIOS[2]]) {
  tele.fallo('pago.fallido', error, {
    usuario: tele.idDeUsuario(u), pais: u.pais, plataforma: 'web', ruta: 'POST /transaction/send',
  })
}
await tele.vaciar()
await esperar(600)
await tele.vaciar()
const est = tele.estadisticas()
chk(est.enviados >= 8, `eventos enviados: ${est.enviados} (cola: ${est.enCola}, fallos: ${est.fallos})`)

console.log('\n3. Consultar el panel, como lo hace la app')
const sesion = await (await fetch(`${BASE}/api/sesion/entrar`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'prueba@ordenglobal.link', contrasena: 'clave-de-prueba-123' }),
})).json()
const panel = async (r) => (await fetch(`${BASE}/api${r}`, {
  headers: { Authorization: `Bearer ${sesion.token}` },
})).json()

const D = await panel('/panel/directorio/resumen')
chk(D.total === 3, `el padrón llegó: ${D.total} personas`)
chk(D.conWallet === 3, `con billetera: ${D.conWallet}`)

const L = await panel('/panel/directorio?limite=5')
const ella = L.usuarios.find((u) => u.email === 'maria@vw.hn')
chk(Boolean(ella), 'María está en el padrón')
chk(!('password' in ella) && !('seed' in ella), 'NO se filtraron la contraseña ni la semilla')
chk(ella.direccionWallet === '0xaaa1000000000000000000000000000000000001',
  'su billetera viajó (y Genesis ID exige los 40 caracteres reales)')

const A = await panel('/panel/analitica/eventos?limite=50')
chk(A.total >= 8, `el panel ve ${A.total} eventos`)
chk(A.facetas.plataforma.some((f) => f.clave === 'web'), 'la faceta separa la web')
chk(A.facetas.plataforma.some((f) => f.clave === 'android'), 'y el teléfono')

const T = await panel('/panel/analitica/eventos?tipo=transaccion&montoMin=500');
chk(T.total >= 1 && T.sumaValor >= 750, `filtro por importe: ${T.total} evento(s), $${T.sumaValor}`)

console.log('\n4. LA PRUEBA DE FUEGO: ¿el panel sabe a quién le falló el pago?')
const E = await panel('/panel/analitica/errores?limite=10')
const grupo = E.errores.find((g) => /firmar la transaccion/.test(g.titulo))
chk(Boolean(grupo), 'el error se agrupó')

const Q = await panel(`/panel/analitica/errores/${grupo.huella}/afectados`)
chk(Q.total === 2, `afectados: ${Q.total} (María dos veces y Ana una)`)
chk(Q.identificados === 2, `identificados con nombre: ${Q.identificados}`)
const nombres = Q.afectados.map((a) => a.nombre).sort()
chk(nombres.includes('Maria Elena Fuentes'), 'María resuelta por su nombre')
chk(nombres.includes('Ana Sofia Ramirez'), 'Ana resuelta por su nombre')
const maria = Q.afectados.find((a) => a.nombre === 'Maria Elena Fuentes')
chk(maria.veces === 2, `a María le pasó ${maria.veces} veces`)
chk(maria.email === 'maria@vw.hn', 'con su correo, para poder llamarla')

console.log('\n5. Últimos ingresos, app y web separados')
const S = await panel('/panel/analitica/sesiones?limite=10')
chk(S.total === 3, `${S.total} personas con ingreso`)
chk(S.sesiones.every((s) => s.identificado), 'las tres con nombre')
const mariaS = S.sesiones.find((s) => s.nombre === 'Maria Elena Fuentes')
chk(Boolean(mariaS.ultimaEn.web && mariaS.ultimaEn.android),
  'María tiene marca en las dos plataformas por separado')

// María entró por la web, y Ana aparece ahí también porque SU error se
// reportó desde la web — que es exactamente lo que se quiere ver: quién tocó
// la web, sea por donde sea.
const W = await panel('/panel/analitica/sesiones?plataforma=web&limite=10')
chk(W.total === 2, `con actividad desde la web: ${W.total} (María y Ana)`)
const soloAndroid = await panel('/panel/analitica/sesiones?plataforma=android&limite=10')
chk(soloAndroid.total === 3, `y desde el teléfono: ${soloAndroid.total}`)

console.log('\n' + (fallos.length
  ? `✗ ${fallos.length} FALLOS:\n  - ` + fallos.join('\n  - ')
  : '✓ TODO EL CIRCUITO FUNCIONA de punta a punta'))
process.exit(fallos.length ? 1 : 0)
