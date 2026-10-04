// Genera el hash de una clave para MIGRACION_OPERADORES.
//
//   npm run clave -- 'la-clave-del-operador'
//
// Imprime solo el hash: la clave en claro no se guarda en ningún lado.
import { hashClave } from './sesion.js'

const clave = process.argv[2]
if (!clave || clave.length < 12) {
  console.error('Uso: npm run clave -- <clave de al menos 12 caracteres>')
  process.exit(1)
}
console.log(hashClave(clave))
