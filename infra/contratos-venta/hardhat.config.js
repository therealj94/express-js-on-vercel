require('@nomicfoundation/hardhat-toolbox');

/* Sin claves privadas en este archivo, jamás. Las redes de verdad se
   configuran al desplegar, con la llave en el entorno y no en el repo — el
   despliegue es `scripts/desplegar.js`, que las lee de ahí y se niega a correr
   si faltan. */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 400 },
      // Polygon y BNB Smart Chain van sobradas de EVM para esto; se fija la
      // versión para que el bytecode no cambie solo al actualizar hardhat.
      evmVersion: 'paris',
    },
  },
  paths: { sources: './contracts', tests: './test', cache: './cache', artifacts: './artefactos' },

  /* Las redes de verdad. La llave entra por LLAVE_DESPLIEGUE y no vive en
     ningun archivo: sin la variable, `accounts` va vacio y hardhat no puede
     firmar nada — fail-closed tambien aqui. Los RPC son publicos y se pueden
     pisar por entorno para usar uno de pago el dia que haga falta. */
  networks: {
    polygon: {
      url: process.env.RPC_POLYGON || 'https://polygon-bor-rpc.publicnode.com',
      chainId: 137,
      accounts: process.env.LLAVE_DESPLIEGUE ? [process.env.LLAVE_DESPLIEGUE] : [],
    },
    bsc: {
      url: process.env.RPC_BSC || 'https://bsc-rpc.publicnode.com',
      chainId: 56,
      accounts: process.env.LLAVE_DESPLIEGUE ? [process.env.LLAVE_DESPLIEGUE] : [],
    },
  },
};
