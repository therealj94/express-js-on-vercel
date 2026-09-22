// Configuración mínima P4: sin plugins externos, sin red externa, sin claves.
// evmVersion "paris" porque el nodo Besu observado no acredita opcodes posteriores
// (§8 del contrato interno: no se asumen opcodes futuros sin verificar el nodo real).
"use strict";

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "paris",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  // Red por defecto en proceso. Nada de RPC externo ni llaves reales (§7 perímetro de datos).
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
      // "merge" es el nombre que usa Hardhat para el hardfork Paris.
      hardfork: "merge",
      allowUnlimitedContractSize: false,
    },
  },
  mocha: { timeout: 120000 },
};
