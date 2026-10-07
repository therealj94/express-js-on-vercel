# Contratos v2 (SFSP)

Los contratos conformes a SFSP a los que migran las monedas de la red Orden Global (SFSP §14 y adenda v0.5). Reemplazan a los ERC-20 heredados, que no tienen roles, suspensión ni restricción de transferencia (§14.2).

| Contrato | Qué hace |
|---|---|
| `TokenSFSP` | Token con roles repartidos como la tabla de SFSP §5.3: la administración (`DEFAULT_ADMIN`: roles y registro) en la firma múltiple de los tres custodios; `EMISOR`, `SUSPENSION` y `QUEMA` en la operativa de dos de tres; `PAUSA` en cada custodio. Tiene suspensión de cuentas, restricción por elegibilidad y **acreditación de la migración por raíz de Merkle**. |
| `RegistroElegibilidad` | Estado de cada dirección según Genesis ID (sin verificar, habilitada o bloqueada), sin datos personales. Cuando el token lo tiene fijado, solo circulan entre direcciones habilitadas. |

## La acreditación

1. La plataforma de migración publica la foto y entrega `acunacion.json`: cada dirección con el monto que fija la política (§14.6) y su prueba de Merkle.
2. La firma múltiple llama `abrirMigracion(raiz, total, referencia)`.
3. Cualquiera puede llamar `acreditar` o `acreditarLote`: la prueba fija dirección y monto, y el destino es siempre la dirección de la hoja. Nadie recibe dos veces, ni más de lo abierto.
4. Los reclamos aprobados (§14.7) se acreditan con una ronda nueva.
5. La plataforma concilia el contrato contra lo que correspondía acuñar.

Las hojas usan el formato de OpenZeppelin (`keccak256(keccak256(abi.encode(address, uint256)))`), el mismo de la plataforma. Las pruebas usan un archivo generado con el código de la plataforma (`test/acunacion-ejemplo.json`).

## Lo que pide la tabla de §5.3 y cómo lo cumple el contrato

| Acción (§5.3) | Firmas y demora | En el contrato |
|---|---|---|
| Colocación de AUKA o AGKA contra metal | Dos de tres, sin demora | `emitir` desde la operativa; `demoraEmision` es cero en la serie 300. |
| Ampliación de supply de un security | Siete días, publicada | Todo lo que acuña espera: `anunciarEmision` y, pasados siete días, `emitir`; y también cada ronda de migración (`anunciarMigracion` y, pasados siete días, `abrirMigracion`), para que no sirva de atajo. `demoraEmision` es fija desde el despliegue y en la serie 200 nunca baja de siete días. |
| Pausa de emergencia | Una firma, inmediata; vence a las 72 horas si dos custodios no la ratifican | `pausar` por un custodio (`PAUSA_ROLE`); `paused()` deja de valer a las 72 horas salvo `ratificarPausa` de la operativa. Desde la operativa nace ratificada. |
| Supply de ORIGEN | No existe como acción | ORIGEN no tiene contrato: es la moneda nativa. |
| Acciones de los tres custodios | Tres de tres | Roles y registro, en la Safe de los tres custodios. |

Fuera de estos contratos quedan las acciones de la red (registrar un contrato, abrir la red, actualizar un módulo, el oráculo), que viven en el complemento de validación de los nodos. Sus demoras (48 horas a catorce días) no las aplica la Safe: hay que aplicarlas en ese complemento o con un módulo de demora, todavía sin hacer.

En un security, `lotes-safe.ts` genera primero solo el anuncio de la ronda; pasados siete días, con la misma `REFERENCIA`, genera la apertura y los lotes. En las commodities la ronda se abre directo.

## La firma múltiple

Dos **Safes 1.4.1** con los mismos custodios de la Junta: la operativa (dos de tres), que es la `MULTIFIRMA` de cada token y la tesorería de ORIGEN, y la de los tres custodios, que es el `ADMIN` de cada token.

En la red 5550 no hay ninguna Safe ni el desplegador determinista que las instala en sus direcciones canónicas. `scripts/desplegar-multifirma.ts` despliega las cuatro piezas que hacen falta (SafeL2, SafeProxyFactory, CompatibilityFallbackHandler y MultiSendCallOnly) desde los artefactos auditados de `safe/`. Antes de crear la Safe, comprueba que el código que quedó en la cadena es el canónico de Safe 1.4.1. `safe/ORIGEN.md` explica de dónde salen los artefactos y cómo se verificaron.

La plataforma de migración lleva las firmas y comprueba lo ejecutado (sección «Firma múltiple» de su README). Las pruebas (`test/multifirma.test.ts`) usan su mismo código contra una Safe de verdad:

- el código desplegado es el canónico;
- dos firmas ejecutan y una sola no;
- la firma de alguien que no es custodio no cuenta;
- la misma transacción no se ejecuta dos veces;
- el regalo de 1 ORIGEN sale en un solo lote;
- abrir la migración de un token solo pasa por la Safe.

## Desplegado en la red 5550

**4 de octubre de 2026.** Las cuatro piezas de Safe 1.4.1, con su código comprobado contra el canónico (`despliegues/orden-safe-infra.json`):

| Pieza | Dirección |
|---|---|
| SafeL2 | `0x60AE3FFab0dfF2193Af504AD62970B13aB76c991` |
| SafeProxyFactory | `0x34f640D5FD95c124215a5797BB65bfC8669c95e1` |
| CompatibilityFallbackHandler | `0x80C635A83527Bf86D1CC7F08D253132712FE07Fb` |
| MultiSendCallOnly | `0x330b7A7A756324CfA7A8aAbA69f0C5Df674307DF` |

Con esas piezas se crearon las dos firmas múltiples de la Junta de Administración del SFSP (`despliegues/orden-multifirma.json`, 7 de octubre de 2026). Tienen los mismos cinco custodios, y los umbrales los decidió la Junta:

| Safe | Umbral | Dirección | Para qué |
|---|---|---|---|
| Operativa | 3 de 5 | `0x6428aD9012Ba31032d2Ee0d59a8b8f019c09713a` | Tesorería de ORIGEN, regalo, emitir, abrir la migración, quemar, suspender, ratificar pausas |
| Administración | 4 de 5 | `0xe5Ef672286CAb569515A1c129555545Bd8B26b90` | Roles y registro de los contratos v2 |

| Cargo | Custodio | Dirección |
|---|---|---|
| Presidente | José Medardo Ordóñez | `0xF936854bCafd725599ce23c9BED603EA56dEB458` |
| Vicepresidenta | Mayra Enamorado | `0x7751d837FA11EBCBFb589554Bf1c8497f585a3b5` |
| Secretaria | Melany Ordóñez | `0x2303f1A58AA726eb3336bf8e23eF71f433e90c4A` |
| Fiscal | Leo Paguada | `0x96202cB8c27580F4705f117E2D3EB712Be782445` |
| Vocal 1 | Medardo José Ordóñez | `0x3640204838e31C60ED11b28C1E24D090c7C56238` |

**Reemplazadas, no usar:** las Safes del 4 de octubre (`0xc4BdFA82398687f5425a8b0Fd3792d149cE14dcf` y `0xb98C37102105BA3eFE99c34d8B0895Bf0645fdc6`, en `despliegues/orden-multifirma-reemplazada-20261004.json`) tenían otra composición de la Junta. Nunca recibieron fondos ni roles. No se les debe mandar nada.

### Tokens v2 en la red 5550 (7 de octubre de 2026)

Los siete tokens están desplegados en `despliegues/orden-<SÍMBOLO>.json`. Todos tienen la administración en la Safe 4 de 5, emisión, quema y suspensión en la operativa 3 de 5, y la pausa de emergencia en cada uno de los cinco custodios. Quien desplegó no quedó con ningún rol (comprobado en cadena). Nacen con supply 0. Los pasaportes se numeraron en el orden del catálogo.

| Moneda | Serie | Demora de emisión | Pasaporte | Contrato v2 |
|---|---|---|---|---|
| AUKA | SFSP-300 | 0 | COM-OG-0001 | `0xa433434E078248170d89d3Da3B565DA5187B4B5F` |
| AGKA | SFSP-300 | 0 | COM-OG-0002 | `0x0734DFaeB3bE72e37afe36B8928c1a2C017b6e83` |
| ONDK | SFSP-200 | 7 días | COM-OG-0003 | `0x7634528Ba3cD24f7E2a8e35f3a9c56F836E91d50` |
| HARV | SFSP-200 | 7 días | COM-OG-0004 | `0xd15839cFF8948BbAe1885627eb678479D5E39A35` |
| IBS | SFSP-200 | 7 días | COM-OG-0005 | `0x75848f6AeC7a013F560f1e8355cBE3fceB1A8907` |
| MNKA (MONARKA) | SFSP-200 | 7 días | COM-OG-0006 | `0x9b0DAd6F96D1c61256276cAAa91f14c5Ad6F902A` |
| LOVE (AMOR) | UTILITY | 0 | COM-OG-0007 | `0x3b0698071c0B1e6921dbA7676ABa38406069C17b` |

Registro de elegibilidad (administrado por la Safe 4 de 5, sin conectar todavía): `0x159C197aa2b38abF4Df76E28E280140fb52f14D1`.

En Render, las variables `V2_AUKA`, `V2_AGKA`, `V2_ONDK`, `V2_HARV`, `V2_IBS`, `V2_MONARKA` y `V2_AMOR` se ponen **el día del corte, después de acuñar**. Con la variable puesta, la lista única de monedas pasa a mostrar el contrato v2, y antes de acuñar todos verían saldo 0.

Cada custodio es, además, `PAUSADOR` de los tokens v2: pausa solo en emergencia, y la pausa vence a las 72 horas si la operativa no la ratifica. Todo lo desplegó una billetera de un solo uso, que solo pagó el gas y no tiene ningún poder. En la plataforma: `SAFE_DIRECCION`, `SAFE_CONSTITUCIONAL` y `SAFE_MULTISEND`.

## Comandos

```sh
npm install
npm run prueba        # 33 pruebas
```

| Script | Para qué |
|---|---|
| `scripts/desplegar-multifirma.ts` | Con `SOLO_INFRA=si`, solo las cuatro piezas de Safe. Si no, despliega las dos Safes (`CUSTODIOS`; la operativa con `UMBRAL`, por defecto 2, y la de administración con `UMBRAL_ADMIN`, por defecto todos) y las piezas que falten, y comprueba su código. En la red 5550 exige `CONFIRMO_PRODUCCION=si`. |
| `scripts/firmar.ts` | Para el custodio sin MetaMask. Primero muestra lo que de verdad hace la operación, sacado de los datos firmados: cada destino, monto y función. Se niega si el lote va a algo que no es su `MULTISEND`, si el archivo no coincide o si el hash no es el del panel. Con `FIRMAR=si` y su llave, firma en su computadora. |
| `scripts/desplegar.ts` | Despliega el token (y el registro si no hay uno) con `ADMIN`, `MULTIFIRMA` y `PAUSADORES`. La demora de emisión sale de la serie (siete días en la 200). En la red 5550 exige `CONFIRMO_PRODUCCION=si`. |
| `scripts/lotes-safe.ts` | Convierte `acunacion.json` en las transacciones para la firma múltiple (formato Safe Transaction Builder): apertura y lotes. Antes verifica cada prueba y el total, y en rondas siguientes deja fuera lo ya acreditado. |
| `scripts/ensayo.ts` | Ensayo general: despliega, acuña por lotes y concilia cada moneda. No corre en la 5550. |

```sh
CUSTODIOS=0xA…,0xB…,0xC… npx hardhat run scripts/desplegar-multifirma.ts --network ensayo
TIPADO=operacion-nonce-4.json MULTISEND=0x… npx hardhat run scripts/firmar.ts            # revisar
TIPADO=operacion-nonce-4.json MULTISEND=0x… FIRMAR=si LLAVE_FIRMANTE=0x… npx hardhat run scripts/firmar.ts
NOMBRE="Gold Kapital" SIMBOLO=AUKA PASAPORTE=COM-OG-0001 SERIE=SFSP-300 ADMIN=0x… MULTIFIRMA=0x… PAUSADORES=0xA…,0xB…,0xC… \
  npx hardhat run scripts/desplegar.ts --network ensayo
ACUNACION=acunacion.json TOKEN=0x… npx hardhat run scripts/lotes-safe.ts --network orden
ENSAYO_DIR=carpeta npx hardhat run scripts/ensayo.ts
```

**Ensayo del 4 de octubre de 2026**, con los saldos reales y la política: las 7 monedas cuadran. El lote más pesado (40 tenedores de ONDK) gasta unos 2,4 millones de gas, por debajo del límite de 10 millones por bloque de la 5550.

Compila con `evmVersion: paris`, porque no se sabe si el génesis de la 5550 tiene la bifurcación que habilita `PUSH0`.

## Antes de desplegar en la 5550

Lo exige el plan de migración, fases 0 a 3:

- **Auditoría externa** de estos contratos.
- **Firmas múltiples activas**: la Junta nombra los tres custodios, se despliegan con `scripts/desplegar-multifirma.ts`, y quedan como `MULTIFIRMA` y `ADMIN` en cada token y como `SAFE_DIRECCION` y `SAFE_CONSTITUCIONAL` en la plataforma. La tesorería de ORIGEN pasa a la operativa.
- **Ensayo en la red 5534**.
- **Acta de la Junta** con la política de la migración.
- **Bloque de corte anunciado**.
