// Un Genesis ID DE VERDAD —el código de genesis-id/— levantado en 127.0.0.1
// con datos de prueba, para la prueba de punta a punta del pase de AU-RA
// (../probar-sso-punta-a-punta.mjs). No es una copia ni un simulacro: son las
// mismas rutas que corren en Render, con un archivo de datos temporal.
//
// Imprime UNA línea JSON en la salida con la dirección y las claves de prueba
// (se crean aquí y mueren con el proceso) y se queda escuchando.
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-punta-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
process.env.GENESIS_ADMIN_EMAIL = 'admin@prueba.local'
process.env.GENESIS_ADMIN_PASSWORD = 'contrasena-de-prueba-larga'
process.env.GENESIS_SSO_SECRETO = 'secreto-de-prueba-punta-a-punta'
delete process.env.GENESIS_MONGO_URL

const RAIZ = '../../../../genesis-id/src/'
const { default: app, arrancar } = await import(RAIZ + 'index.js')
const { store } = await import(RAIZ + 'store.js')
const { rotar } = await import(RAIZ + 'auth/aplicaciones.js')
const ids = await import(RAIZ + 'motor/identidades.js')
const { gidPersonal } = await import(RAIZ + 'lib/uid.js')

await arrancar()
const claves: Record<string, string> = {}
for (const clave of ['veta-wallet', 'aura', 'pulse2chat']) {
  const a = store.todo().aplicaciones.find((x: any) => x.clave === clave)
  claves[clave] = rotar(a.id, 'prueba')!
}

const ahora = new Date().toISOString()
/** Una persona verificada con la cuenta `cuenta` de la wallet atada a su GID. */
function verificada(email: string, cuenta: string | null) {
  const i = ids.iniciar(email, 'prueba')
  i.nombreLegal = 'Persona De Prueba'
  i.estado = 'verificada'
  i.gid = gidPersonal()
  i.verificadaEn = ahora
  i.fechaNacimiento = '1990-07-04'
  i.vinculos = cuenta ? [{ app: 'veta-wallet', cuenta, direccion: null, vinculadaEn: ahora, ultimoAcceso: null }] : []
  return i
}
const ana = verificada('ana@prueba.local', 'cuenta-ana')
verificada('sinvinculo@prueba.local', null)
const aMedias = ids.iniciar('amedias@prueba.local', 'prueba')
aMedias.estado = 'datos'
aMedias.nombreDeclarado = 'A Medias'
ids.iniciar('vacia@prueba.local', 'prueba')      // la «iniciada» que crea abrir la wallet
await store.guardarYa()

const servidor = app.listen(0, '127.0.0.1', () => {
  const { port } = servidor.address() as any
  process.stdout.write(JSON.stringify({ base: `http://127.0.0.1:${port}`, claves, gidAna: ana.gid }) + '\n')
})
