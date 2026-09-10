/* La caja donde corre el script de migración, montada por la prueba misma.
 *
 * POR QUE ESTE FICHERO EXISTE
 *
 * Las dos pruebas de esta carpeta hacían `import("/tmp/mtest/migrar.js")`.
 * `/tmp/mtest` era un andamio montado A MANO el 5-ago: una carpeta con un
 * node_modules preparado, un mongoose de mentira y una copia de `migrar.js`
 * con el import reescrito. Existe en la máquina donde se montó y en ninguna
 * otra, así que estas pruebas no corren en el CI ni en la computadora de nadie
 * más — y no fallan avisando: fallan diciendo «Cannot find package».
 *
 * Peor todavía: esa copia de `migrar.js` YA NO ERA la del repositorio. Habían
 * quedado distintas. O sea que la prueba estaba en verde contra un fichero que
 * no es el que se despliega, que es la única cosa peor que no tener prueba.
 *
 * Y lo que guardan no es histórico. La migración de `PASS_ADM` ya se hizo, pero
 * `cripto.js` —el módulo que prueba la clave nueva y cae a la vieja— sigue vivo
 * en producción descifrando las llaves privadas y las frases semilla de las
 * cuentas. Es lo único que permite mover los fondos de alguien. Eso merece una
 * prueba que corra en todas partes.
 *
 * Así que la caja se monta acá, desde los ficheros del repositorio, cada vez.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CASA = join(AQUI, '..')

/** De dónde sacar los paquetes de verdad (crypto-js). */
function dondeHayPaquetes() {
  const sitios = [
    join(CASA, 'node_modules'),
    join(CASA, '..', 'veta-wallet-backend', 'node_modules'),
    join(CASA, '..', '..', 'genesis-id', 'node_modules'),
  ]
  for (const s of sitios) if (existsSync(join(s, 'crypto-js'))) return s
  throw new Error(
    'No encuentro crypto-js en ningún node_modules del repositorio.\n' +
    'Corré `npm install` en infra/veta-wallet-migracion y volvé a intentar.',
  )
}

/**
 * Monta la caja y devuelve la ruta del `migrar.js` que hay que importar.
 *
 * Se copia el `migrar.js` DEL REPOSITORIO y se le reescribe el único import
 * absoluto que trae —`/app/lib/cripto.js`, que es la ruta dentro del dyno de
 * Heroku— para que apunte al `cripto.js` del repositorio. Nada más se toca: si
 * el script cambia, la prueba ejercita el cambio.
 */
export function montarCaja() {
  const caja = mkdtempSync(join(tmpdir(), 'migra-'))
  mkdirSync(join(caja, 'lib'), { recursive: true })
  mkdirSync(join(caja, 'node_modules', 'mongoose'), { recursive: true })

  writeFileSync(join(caja, 'package.json'), JSON.stringify({ name: 'caja', type: 'module' }))

  // El módulo real que se está probando.
  copyFileSync(join(CASA, 'cripto.js'), join(caja, 'lib', 'cripto.js'))

  // El script real, con el import del dyno apuntado a la copia de acá.
  const guion = readFileSync(join(CASA, 'migrar.js'), 'utf8')
  const arreglado = guion.replace(/(["'])\/app\/lib\//g, '$1./lib/')
  if (arreglado === guion && guion.includes('/app/')) {
    throw new Error('migrar.js trae rutas de /app que no supe reescribir; revisá caja.mjs')
  }
  writeFileSync(join(caja, 'migrar.js'), arreglado)

  /* El mongoose de mentira gana la resolución porque está en el node_modules
     DE LA CAJA, que node mira antes de subir a los de arriba. */
  writeFileSync(join(caja, 'node_modules', 'mongoose', 'package.json'),
    JSON.stringify({ name: 'mongoose', version: '0.0.0-falso', main: 'index.cjs' }))
  copyFileSync(join(AQUI, 'mongoose-falso.cjs'), join(caja, 'node_modules', 'mongoose', 'index.cjs'))

  // Y crypto-js, el de verdad, prestado de donde ya esté instalado.
  symlinkSync(join(dondeHayPaquetes(), 'crypto-js'), join(caja, 'node_modules', 'crypto-js'), 'dir')

  return {
    guion: join(caja, 'migrar.js'),
    cripto: join(caja, 'lib', 'cripto.js'),
    carpeta: caja,
    tirar: () => rmSync(caja, { recursive: true, force: true }),
  }
}
