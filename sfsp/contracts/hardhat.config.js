// Configuración mínima P4: sin plugins externos, sin red externa, sin claves.
// evmVersion "paris" porque el nodo Besu observado no acredita opcodes posteriores
// (§8 del contrato interno: no se asumen opcodes futuros sin verificar el nodo real).
//
// P09 · arranque limpio sin red.
// La versión del compilador NO se escribe aquí: se lee de `compilador/compilador.json`,
// que es la única fuente de la versión y de su huella SHA-256. Si el binario fijado
// está presente, se usa ése y se comprueba su huella antes de cada compilación; así
// una compilación no depende de la red ni de la caché personal del usuario, y un
// compilador distinto no pasa en silencio.
"use strict";

const { readFileSync, existsSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");
const { subtask } = require("hardhat/config");
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require("hardhat/builtin-tasks/task-names");

const FIJADO = JSON.parse(
  readFileSync(join(__dirname, "compilador", "compilador.json"), "utf8"),
);
const RUTA_SOLC = join(__dirname, "compilador", FIJADO.archivo);

function huellaDe(ruta) {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

/* Hardhat resuelve aquí qué binario de solc va a usar. Interceptarlo es el único
   punto donde se puede exigir que sea EXACTAMENTE el fijado. */
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, _hre, runSuper) => {
  if (args.solcVersion !== FIJADO.version) {
    throw new Error(
      `SFSP/P09: se pidió solc ${args.solcVersion} y el compilador fijado es ` +
        `${FIJADO.version}. Cambiar de compilador se hace en compilador/compilador.json, ` +
        `con su huella nueva comprobada, no por una ruta lateral.`,
    );
  }

  if (!existsSync(RUTA_SOLC)) {
    /* Único caso en el que hace falta red: el binario fijado no está en el árbol.
       No se calla: se dice qué va a pasar y cómo evitarlo la próxima vez. */
    console.warn(
      `\nSFSP/P09: falta ${FIJADO.archivo} en contracts/compilador/.\n` +
        `Hardhat va a recurrir a su caché personal o a descargarlo, que es el ÚNICO\n` +
        `paso de todo el árbol que necesita red. Para dejarlo resuelto una vez:\n` +
        `  node compilador/preparar.mjs\n`,
    );
    return runSuper();
  }

  const huella = huellaDe(RUTA_SOLC);
  if (huella !== FIJADO.sha256) {
    throw new Error(
      `SFSP/P09: el compilador de contracts/compilador/ NO es el fijado.\n` +
        `  esperado: ${FIJADO.sha256}\n` +
        `  presente: ${huella}\n` +
        `Un binario de compilador que no coincide con su huella no se usa: se sustituye.`,
    );
  }

  return {
    compilerPath: RUTA_SOLC,
    isSolcJs: false,
    version: FIJADO.version,
    longVersion: FIJADO.longVersion,
  };
});

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: FIJADO.version,
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
