// RETIRADO — el puente con Genesis ID ya no vive aquí.
//
// Este archivo fue una de las TRES copias del puente (SFSP v0.3 §11, plan
// tarea 0.6), y la que más se había quedado atrás: no tenía `/gid` ni
// `/documento-fotos`, y la dirección de billetera del vínculo era opcional.
// Nunca se desplegó por sí solo: era la «referencia» que el backend de Veta
// copiaba a mano, y cada copia a mano divergía.
//
// El puente canónico es `infra/veta-wallet-backend/lib/genesisPuente.js`
// (copiado byte a byte en `infra/mytokenpay-api/src/lib/genesisPuente.js`).
// Aquí solo se reexporta, para que las pruebas y las notas antiguas que
// apuntan a esta ruta sigan llevando al mismo código. No añadir lógica aquí.

export {
  routerGenesis,
  parserRostro,
  genesisConfigurado,
  normalizarDireccion,
  CODIGOS_VINCULO,
} from '../veta-wallet-backend/lib/genesisPuente.js'
