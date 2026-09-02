// Prueba de la cadena completa: app movil -> puente del backend -> Genesis ID.
//
// Se levanta un backend de mentira que monta el router real de
// infra/genesis-proxy y apunta al Genesis ID que corre en el 4124. Lo que se
// comprueba es que la clave de API se queda en el servidor, que el puente ata
// la cuenta a partir de la sesion (nunca del cuerpo) y que el flujo entero
// —datos, documento, rostro, revision— llega a Genesis ID como debe.

import express from 'express'
// Ruta relativa: la absoluta que había apuntaba fuera de cualquier copia o
// worktree del repositorio, y la prueba solo corría en una máquina.
import { routerGenesis } from '../genesis.router.js'

const USUARIO = { id: 'cuenta-42', email: 'prueba.puente@ejemplo.hn', address: '0xabc0000000000000000000000000000000000001' }

// Sesion de mentira: en el backend real esto es el middleware del JWT.
const exigirSesion = (req, res, siguiente) => {
  if (req.headers.authorization !== 'Bearer token-de-prueba') {
    return res.status(401).json({ error: 'sin sesion' })
  }
  req.usuario = USUARIO
  siguiente()
}

const app = express()
app.use(express.json({ limit: '5mb' }))
app.use('/genesis', routerGenesis({ exigirSesion }))
const servidor = app.listen(0, '127.0.0.1')
await new Promise((r) => servidor.once('listening', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`

let fallos = 0
const ok = (c, m) => { if (c) console.log('  ok   ', m); else { fallos++; console.log('  FALLA', m) } }

const pedir = async (ruta, cuerpo, conSesion = true) => {
  const r = await fetch(BASE + '/genesis' + ruta, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(conSesion ? { Authorization: 'Bearer token-de-prueba' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) }
}

console.log('\n1. Sin sesion de la app, el puente no deja pasar')
ok((await pedir('/estado', null, false)).estado === 401, 'GET /estado sin token -> 401')

console.log('\n2. Con sesion, crea la identidad y NO trae GID')
const e1 = await pedir('/estado')
ok(e1.estado === 200, 'GET /estado -> 200')
ok(e1.cuerpo?.identidad?.gid === null, 'la identidad nace sin GID')
ok(e1.cuerpo?.identidad?.estado === 'iniciada', 'estado inicial "iniciada"')

console.log('\n3. Datos declarados')
const d = await pedir('/datos', {
  nombreCompleto: 'Anna Maria Eriksson', fechaNacimiento: '1974-08-12', paisResidencia: 'HND',
})
ok(d.estado === 200 && d.cuerpo?.identidad?.estado === 'datos', 'pasa a "datos"')

console.log('\n4. Documento manipulado: se rechaza y se dice por que')
const malo = await pedir('/documento', {
  mrz: 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO9008122F1204159ZE184226B<<<<<10',
})
ok(malo.cuerpo?.documento?.aceptable === false, 'documento alterado -> no aceptable')
ok(/dígitos de control/i.test(JSON.stringify(malo.cuerpo?.documento?.problemas)), 'explica que fallan los digitos')

console.log('\n5. Documento valido')
// Se construye uno con vencimiento futuro y sus digitos recalculados.
const PESOS = [7, 3, 1]
const valor = (c) => (c >= '0' && c <= '9') ? c.charCodeAt(0) - 48 : c === '<' ? 0 : c.charCodeAt(0) - 55
const dc = (s) => [...s].reduce((a, c, i) => a + valor(c) * PESOS[i % 3], 0) % 10
const doc = 'L898902C3', nac = '740812', ven = '351231', per = 'ZE184226B<<<<<'
const l2 = `${doc}${dc(doc)}UTO${nac}${dc(nac)}F${ven}${dc(ven)}${per}${dc(per)}`
const comp = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
const mrz = `P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n${l2}${dc(comp)}`
const bueno = await pedir('/documento', { mrz })
ok(bueno.cuerpo?.documento?.aceptable === true, 'documento valido -> aceptable')
ok(bueno.cuerpo?.identidad?.gid === null, 'sigue SIN GID tras el documento')

console.log('\n6. Rostro')
const bio = await pedir('/biometria', { selfie: 'data:image/jpeg;base64,AAAA' })
ok(bio.estado === 200, 'la biometria se acepta')
ok(bio.cuerpo?.identidad?.gid === null, 'y sigue sin GID: falta la decision humana')

console.log('\n7. El puente NO expone ninguna via para aprobar')
const rutas = ['/aprobar', '/verificar', '/panel/identidades', '/identidades/x/aprobar']
for (const r of rutas) {
  const x = await pedir(r, {})
  ok(x.estado === 404, `POST ${r} -> 404`)
}

console.log('\n8. Sin GID verificado no hay token de ecosistema')
ok((await pedir('/sso/token', {})).estado === 403, 'POST /sso/token -> 403')

console.log('\n9. La cuenta la fija el servidor, no el cliente')
const v = await pedir('/vincular', { cuenta: 'cuenta-de-otro', direccion: '0xdead' })
ok(v.estado === 200, 'POST /vincular -> 200')
ok(JSON.stringify(v.cuerpo?.vinculos || []).includes('cuenta-42'), 'se ata a la cuenta de la SESION')
ok(!JSON.stringify(v.cuerpo?.vinculos || []).includes('cuenta-de-otro'), 'ignora la cuenta que mando el cliente')

console.log('\n9b. Lo leído del documento vuelve para confirmarlo, y el estado sabe qué está hecho')
const est = await pedir('/estado')
ok(est.cuerpo?.identidad?.hecho?.documento === true, 'hecho.documento = true tras el documento válido')
ok(est.cuerpo?.identidad?.hecho?.rostro === true, 'hecho.rostro = true tras el selfie')
ok(est.cuerpo?.identidad?.documentoDatos?.nombre === 'ANNA MARIA ERIKSSON', 'los datos del documento viajan para confirmarlos')
ok((await pedir('/status')).estado === 200, 'GET /status responde igual que /estado')

console.log('\n9c. Leer el documento desde la foto: sin lector en Genesis, se dice y no se inventa')
const leido = await pedir('/documento/leer', { imagen: 'data:image/jpeg;base64,AAAA' })
ok(leido.estado === 503 || leido.estado === 200, `POST /documento/leer -> ${leido.estado}`)
ok(leido.estado !== 503 || leido.cuerpo?.motivo === 'sin-lector', 'sin proveedor: motivo "sin-lector"')

console.log('\n10. Tamizado de direcciones')
const limpia = await pedir('/tamiz/0x1111111111111111111111111111111111111111')
ok(limpia.cuerpo?.tamizado === true && limpia.cuerpo?.sancionada === false, 'direccion normal -> no sancionada')
const sucia = await pedir('/tamiz/0xDEADBEEF00000000000000000000000000000001')
ok(sucia.cuerpo?.sancionada === true, 'direccion de la lista -> sancionada')

console.log(fallos ? `\n${fallos} FALLOS` : '\nPUENTE OK — 26 comprobaciones')
servidor.close()
process.exit(fallos ? 1 : 0)
