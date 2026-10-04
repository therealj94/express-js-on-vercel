# De dónde salen estos artefactos

Son los cuatro contratos de Safe 1.4.1 que necesita la firma múltiple. Están copiados **sin cambios** (solo `contractName`, `abi` y `bytecode`) del paquete publicado en npm:

| | |
|---|---|
| Paquete | `@safe-global/safe-contracts@1.4.1` |
| Integridad (npm `dist.integrity`) | `sha512-fP1jewywSwsIniM04NsqPyVRFKPMAuirC3ftA/TA4X3Zc5EnwQp/UCJUU2PL/37/z/jMo8UUaJ+pnFNWmMU7dQ==` |
| shasum | `82605342f3289dc6b99818f599a3409ec2cb3fdc` |

El tarball descargado el 4 de octubre de 2026 coincide con los dos valores.

| Archivo | Ruta en el paquete |
|---|---|
| `SafeL2.json` | `build/artifacts/contracts/SafeL2.sol/SafeL2.json` |
| `SafeProxyFactory.json` | `build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json` |
| `CompatibilityFallbackHandler.json` | `build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json` |
| `MultiSendCallOnly.json` | `build/artifacts/contracts/libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json` |

No se instala el paquete porque pide ethers 5 y este proyecto usa ethers 6.

**Segunda comprobación, sobre lo desplegado:** después de desplegar, `scripts/safe.ts` compara el hash del código que quedó en la cadena con el `codeHash` canónico que publica Safe para la 1.4.1 en `@safe-global/safe-deployments@1.37.63`. Si alguna pieza no coincide, el script se detiene. Las pruebas (`test/multifirma.test.ts`) lo comprueban en cada corrida.
