import type { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'

// evmVersion «paris»: no se sabe en qué bifurcación arrancó el génesis de la 5550, y desde
// «shanghai» el compilador usa PUSH0, que una cadena sin esa bifurcación rechaza. Paris corre en todas.
const config: HardhatUserConfig = {
  solidity: { version: '0.8.24', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris' } },
  networks: {
    // Red de ensayos: todo se prueba aquí antes de tocar la 5550 (plan de migración, principio 4).
    ensayo: { url: process.env.RPC_ENSAYO_URL || 'http://127.0.0.1:8545', chainId: 5534, accounts: process.env.LLAVE_DESPLIEGUE ? [process.env.LLAVE_DESPLIEGUE] : [] },
    // Producción. Desplegar aquí exige firma múltiple activa, auditoría y acta de la Junta.
    orden: { url: process.env.RPC_ORDEN_URL || 'https://rpc.ordenglobal-rpc.com/', chainId: 5550, accounts: process.env.LLAVE_DESPLIEGUE ? [process.env.LLAVE_DESPLIEGUE] : [] },
  },
}

export default config
