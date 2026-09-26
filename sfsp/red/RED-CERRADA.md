# Red cerrada de la 5550 (v0.3 §2.1 · SFSP-150)

| Campo | Valor |
|---|---|
| Fecha | 26-sep-2026 |
| Estado | **Construido y ensayado en local. Nada desplegado.** La 5550 y la 5534 no se tocaron. |
| Red objetivo | 5550 · Besu **26.7.1** · QBFT · 7 validadores · API PERM apagada |
| Piezas | `contracts/src/SFSPNetworkPermissions.sol` (la lista), `red/filtro-besu/` (el complemento), `red/ensayo-local/` (el ensayo) |
| Pruebas | `contracts/test/26-red-cerrada.js` (17), ensayo con Besu real: 11/11 (`ensayo-local/resultado-ensayo-2026-09-26.json`) |
| Decisiones que bloquean el encendido | D07 (firmantes y espera), D26 (catálogo transitorio y cortes), D12 (5534), bloque de activación, lista inicial de desplegadores y de destinos de sistema. Todas `BLOCKED_DECISION`. |

---

## 1 · El mecanismo, confirmado

**En Besu 26.7.1 no existe la opción contractual.** Los permisos de cuentas por
contrato (`--permissions-accounts-contract-enabled`,
`--permissions-accounts-contract-address`) tuvieron este recorrido:

- **24.12.0**: se declararon obsoletos («Sunsetting features … Smart-contract-based
  (onchain) permissioning»).
- **25.6.0**: se retiraron («Breaking Changes · Remove onchain permissioning
  [#8597]»).

Qué queda en 26.7.1, y es lo que se usa:
`PermissioningService.registerTransactionPermissioningProvider(TransactionPermissioningProvider)`.
Esa API de complementos existe desde **25.3.0** («Add support for transaction
permissioning rules in Plugin API [#8365]»).

### Fuentes

1. `CHANGELOG.md` de Besu. Entradas de 24.12.0, 25.3.0 y 25.6.0.
   <https://github.com/hyperledger/besu/blob/main/CHANGELOG.md>. El repositorio
   se movió a `besu-eth/besu`.
2. Entrada de blog enlazada desde ese CHANGELOG: «Sunsetting Tessera and
   simplifying Hyperledger Besu»
   (<https://www.lfdecentralizedtrust.org/blog/sunsetting-tessera-and-simplifying-hyperledger-besu>).
   Deja como alternativas los permisos locales y el complemento.
3. Documentación: <https://docs.besu-eth.org/private-networks/concepts/permissioning>.
   Antes estaba en besu.hyperledger.org, que ahora redirige ahí.
4. Código de la etiqueta `26.7.1` de `besu-eth/besu`, leído el 26-sep-2026:
   - `plugin-api/…/services/PermissioningService.java`: `registerTransactionPermissioningProvider`.
   - `plugin-api/…/services/permissioning/TransactionPermissioningProvider.java`: `boolean isPermitted(Transaction)`.
   - `app/…/RunnerBuilder.java · buildAccountPermissioningController`: basta con
     que haya un proveedor registrado para que se cree el
     `AccountPermissioningController` y se instale como `PermissionTransactionFilter`
     del calendario de protocolo. Eso vale aunque no haya ninguna bandera `--permissions-*`.
   - `ethereum/core/…/mainnet/TransactionValidationParams.java`:
     `checkOnchainPermissions = true` en `transactionPoolParams`, en `miningParams` y en
     **`processingBlockParams`**. `PermissionTransactionValidator.validateForSender`
     consulta el filtro en esos tres casos. Es decir, **el filtro rige en el pool, en la
     producción y en la importación de bloques**.
   - `ethereum/permissioning/…/TransactionSmartContractPermissioningController.java`
     sigue en el árbol, con el selector `transactionAllowed(address,address,uint256,uint256,uint256,bytes)`,
     pero **ninguna bandera lo instancia**. Es código muerto. Se usa como referencia
     de la codificación.
5. `besu --help` del binario 26.7.1 (`besu/v26.7.1/linux-x86_64/openjdk-java-25`).
   Sólo lista `--permissions-accounts-config-file[-enabled]` y
   `--permissions-nodes-config-file[-enabled]`. No hay ninguna opción `--permissions-accounts-contract-*`.
   Arrancarlo con `--permissions-accounts-contract-enabled` devuelve
   `Unknown option: '--permissions-accounts-contract-enabled'`. Comprobado el 26-sep-2026.
   Del mismo modo, sin el jar, `--plugin-sfsp-filtro-habilitado=true` da
   `Unknown option` y el nodo no arranca.

### Descartados

| Alternativa | Por qué no |
|---|---|
| Opción contractual `--permissions-accounts-contract-*` | Retirada en 25.6.0. En 26.7.1 esas banderas dan `Unknown option` y el nodo no arranca. |
| Lista local `--permissions-accounts-config-file` | Filtra por **remitente**, no por destino. Además es un archivo por nodo: no lo gobierna la multifirma. |
| `TransactionPoolValidatorService` | Sólo actúa en el **pool**. Un validador con otro pool, o sin el complemento, mete la transacción en un bloque y los demás lo importan. |
| `TransactionSelectionService` | Sólo actúa al **elegir** transacciones para un bloque propio. No se aplica a los bloques de los demás. |
| `TransactionPermissioningProvider` (elegido) | Actúa en el pool, en la producción **y en la importación**. Un bloque con una transacción prohibida es **inválido** para el nodo que lo filtra. Queda demostrado en el ensayo (§6). |

---

## 2 · Cómo queda armado

```
 gobierno (multifirma, motivo, espera)
        │  applyChanges(orden SET_NETWORK_PERMISSION)
        ▼
 SFSPNetworkPermissions  ◄── transactionAllowed(sender, target, value, gasPrice, gasLimit, payload)
        ▲                         (eth_call simulado en la cabeza, por cada transacción)
        │
 filtro-besu (complemento) en CADA nodo: 7 validadores + RPC
```

El contrato es la **fuente de la lista**. El complemento **aplica** la lista.
Conserva **exactamente** la interfaz de la opción retirada, así que si algún día
Besu la reintrodujera, el contrato serviría sin cambios.

### Reglas de `transactionAllowed`

Se evalúan en orden. Por defecto, la respuesta es **no**.

| Destino | Admitido si… | SFSP-150 |
|---|---|---|
| `to` vacío (creación) | `sender` está en la lista de desplegadores | Nivel 1 · T-150-01 |
| Gobierno y la propia lista | **Siempre**. No se pueden dar de baja: así no hay bloqueo sin salida. | §6 |
| `ASSET_CONTRACT` (conforme) | Admitido por gobierno **y** su `codehash` actual es el del pasaporte | T-150-03 |
| `SYSTEM_TARGET` | Admitido por gobierno (contratos del protocolo, cuentas de sistema) | §3 |
| `LEGACY_TRANSITIONAL` | Admitido por gobierno **y** `block.number < bloque de corte` | T-150-04 |
| `SYSTEM_FUNCTION` | El selector (4 primeros bytes del `payload`) está habilitado para ese destino | §3 |
| ORIGEN nativo | `payload` vacío **y** el destino no tiene código | T-150-05 |
| Todo lo demás | **No**. Entran aquí los 172 heredados fuera del catálogo transitorio. | T-150-02 |

Al dar de alta, cada clase exige lo suyo:

- **`ASSET_CONTRACT`**: el activo está registrado en `SFSPAssetRegistry` y no está
  excluido. Su pasaporte nombra **este** contrato en **esta** cadena, tiene clase
  legal y no tiene perfil heredado, y su `codehash` coincide con el código de hoy.
- **`LEGACY_TRANSITIONAL`**: el pasaporte tiene perfil `LEGACY_REGISTERED` y el
  bloque de corte es futuro.
- **Desplegadores**: se dan de alta con su orden de gobierno, como todo lo demás.

**Bajas.** Una baja **no espera**, pero exige quórum. `purgeExcluded` la puede
llamar cualquiera, porque sólo **borra**, y sólo lo que el registro ya declaró
excluido para siempre (H04).

**Barato y sin estado que un atacante pueda llenar.**

- **Coste**: `transactionAllowed` es `view`, sin bucles y sin llamadas externas.
  Hace como mucho dos lecturas de almacenamiento, más `EXTCODEHASH` o `EXTCODESIZE`
  del destino. Medido en Hardhat, entre 2.567 y 7.740 de gas de ejecución por
  consulta, calldata incluido. La prueba 26 exige menos de 36.000 en total. La
  consulta no cuesta gas al usuario: la simula el nodo.
- **Escrituras**: sólo `applyChanges` (orden de gobierno con quórum, y espera si
  amplía), `purgeExcluded` (sólo borra) y `grantRole`/`revokeRole` (sólo la Junta).
  La prueba 26 lo fija sobre el ABI.

**Gobierno.** La orden es un payload SFSP-AUTH-v1:

- `action` = `SET_NETWORK_PERMISSION`, con la misma etiqueta en gobierno;
- `assetId` = `SFSP:NET:ADMISSION`;
- `amount` = número de cambios (64 como máximo);
- `amountSecondary` = 1 si alguno amplía, 0 si no;
- `nonce` = identificador de operación;
- `evidenceRoot` = `keccak256(abi.encode(TAG, cambios))`.

Cada cambio lleva un motivo obligatorio y emite
`NetworkPermissionChanged(subject, permissionKind, granted, reasonCode, operationId)`,
con la firma exacta de `spec/eventos.json`. En `SYSTEM_FUNCTION`, el selector va en
los 4 últimos bytes de `permissionKind`.

---

## 3 · Configuración exacta por nodo

Va igual en **los 7 validadores y en los nodos RPC**. Instalación y compilación:
`filtro-besu/README.md`.

```
# <BESU_HOME>/plugins/sfsp-filtro-red-0.1.0.jar   (huella SHA-256 publicada, igual en todos)
--plugin-sfsp-filtro-habilitado=true
--plugin-sfsp-filtro-contrato=<SFSPNetworkPermissions en la 5550>        # BLOCKED_DECISION hasta desplegar
--plugin-sfsp-filtro-bloque-activacion=<N>                               # BLOCKED_DECISION, idéntico en todos
# opcional, sólo para una reversión programada:
--plugin-sfsp-filtro-bloque-fin=<M>
```

Con `--config-file`, la forma TOML es la misma sin guiones (no ensayada, se
comprueba en la 5534):

```toml
plugin-sfsp-filtro-habilitado=true
plugin-sfsp-filtro-contrato="0x…"
plugin-sfsp-filtro-bloque-activacion=N
```

No hace falta ninguna `--permissions-*`, y la API `PERM` puede seguir apagada:
el complemento no la usa.

**Java**: Corretto 25, el que ya corre en los validadores.

---

## 4 · Por qué en los 7 (y en los RPC), y no sólo en el pool

El filtro también rige al **importar**. Un nodo con el complemento considera
**inválido** un bloque que lleve una transacción prohibida. Con 7 validadores,
QBFT necesita 5 para comprometer un bloque.

| Situación | Efecto |
|---|---|
| Los 7 con filtro | Nadie propone ni acepta una transacción prohibida. Es el estado buscado. |
| Uno sin filtro (≤ 2 sin filtro) | Su pool acepta lo prohibido y, cuando le toca proponer, su bloque no junta 5 votos. Hay cambios de ronda y **pérdida de vivacidad** en sus turnos. |
| ≥ 5 sin filtro | Comprometen bloques con lo prohibido. Los nodos **con** filtro los rechazan y **se detienen** (fork). El ensayo lo reproduce en §6. |
| Filtro sólo en el pool (`TransactionPoolValidatorService`) | No cierra nada: cualquier transacción que llegue a un proponente por otra vía se importa en todos. |

**Consecuencias.**

- **Misma configuración y mismo jar.** El contrato, el bloque de activación y el
  de fin tienen que ser **idénticos** en todos los nodos.
- **Nodos RPC.** También llevan el complemento: si no, sirven una vista distinta
  de lo que es válido y su pool reenvía basura.
- **Resincronizar desde el génesis** (sincronización FULL). El nodo reevalúa la
  historia con la misma ventana `[activación, fin)` y con el estado de cada bloque
  padre: el resultado es el mismo que tuvo la red. Si la ventana cambia con el
  tiempo (activar, revertir y volver a activar), hay que conservar el historial de
  ventanas o sincronizar por instantánea.

---

## 5 · Plan de prueba en la 5534

> **Aviso: `rpc-testnet.ordenglobal-rpc.com` apunta hoy a la 5550**, con el mismo
> génesis (PLAN v0.3 · C3). Ese nombre **no** se usa para el ensayo mientras no se
> corrija el DNS o el proxy. Se trabaja por túnel SSH a los nodos de la 5534, y
> **antes de cada transacción** se comprueba que `eth_chainId` devuelve `0x159e`
> (5534) y que el hash del bloque 0 es el de `infra/migracion-cadena/RED-5534.md`.
> La 5534 está **parada desde el 15-ago**: levantarla es el paso 0.

0. **Levantar la 5534.** Hoy tiene 4 validadores (node3 a node6). Para que el
   ensayo valga, hay que llevarla a **7**, como la 5550, con la misma versión y el
   mismo Java.
1. **Desplegar en la 5534**:
   - `SFSPAssetRegistry` y `SFSPGovernanceController`, con los firmantes de ensayo
     y la espera real que proponga D07;
   - `SFSPNetworkPermissions`;
   - un ERC-20 heredado de prueba, un «conforme» con pasaporte y uno transitorio.
2. **Órdenes de gobierno de alta** (multifirma real):
   - conforme;
   - transitorio con corte a unos 200 bloques;
   - destinos de sistema;
   - desplegadores.
3. **Lectura previa, sin transacciones.** Matriz de `eth_call transactionAllowed`
   sobre remitentes y destinos reales. Salida esperada: la del §2.
4. **Instalar el jar en los 7, uno a uno**, con `bloque-activacion = cabeza + ~2.000`.
   Antes de la activación todo se admite, así que el reinicio escalonado no cambia
   nada. Se comprueba en cada registro `contrato … en los bloques [N, sin fin)`.
5. **Tras la activación**, el mismo guion que el ensayo local (§6):
   - T-150-01: desplegar sin alta falla; con alta, funciona.
   - T-150-02: el heredado se rechaza con `Sender account not authorized…`.
   - T-150-03: se cambia el pasaporte para que no coincida y la admisión revierte.
   - T-150-04: el transitorio se corta en su bloque.
   - T-150-05: ORIGEN nativo sigue fluyendo.
   - T-150-06: una orden con una sola firma revierte.
   - T-150-07: se revisan los eventos.
6. **Prueba de mezcla.** Se apaga el complemento en **1** validador y se le manda
   directamente una transacción prohibida. Se comprueba que su bloque no junta
   quórum (cambio de ronda) y que la cadena sigue. Se vuelve a encender.
7. **Reversión programada.** Orden de `bloque-fin = cabeza + ~500` en los 7, uno a
   uno. Se comprueba que en `M` el heredado vuelve a operar en todos a la vez, sin
   fork.
8. **Medición.** Latencia de validación del pool y tiempo de bloque, con y sin
   filtro. El período de la 5534 es de 10 s.

---

## 6 · Ensayo local realizado (26-sep-2026)

`red/ensayo-local/ensayo-besu-local.mjs`:

- **Red**: Besu **26.7.1** real (binario oficial, Temurin 25) con el jar en
  `plugins/`.
- **Configuración**: QBFT de un validador en `127.0.0.1`, chainId **1337**, génesis
  nuevo, claves de prueba públicas de Hardhat.
- **Contratos**: los de verdad, compilados por Hardhat (`SFSPAssetRegistry`,
  `SFSPGovernanceController`, `SFSPNetworkPermissions`, ERC-20 heredado de
  prueba).

Resultado: **11/11**. El JSON está en `ensayo-local/resultado-ensayo-2026-09-26.json`.

| Paso | Resultado |
|---|---|
| Filtro apagado: el heredado opera | OK |
| T-150-02: heredado fuera del catálogo | Rechazado por el pool: `Sender account not authorized to send transactions` |
| T-150-05: ORIGEN nativo | Minado |
| Conforme registrado | Minado |
| T-150-04: transitorio antes del corte | Minado |
| T-150-01: despliegue sin alta | Rechazado |
| T-150-01: alta por orden multifirma (viaja por la red cerrada), después despliegue | Minado |
| T-150-04: transitorio desde el corte | Rechazado |
| Observador **con** filtro sincroniza toda la historia (antes y después de la activación) | OK |
| Reversión: validador con el complemento apagado vuelve a admitir el heredado | Minado |
| **Importación**: el observador **con** filtro rechaza ese bloque y se queda atrás | `Invalid block 86 … Sender … is not on the Account Allowlist` |

Para repetirlo, con los binarios fuera del repositorio:

```bash
cd sfsp/contracts && npx hardhat compile
BESU_HOME=<besu-26.7.1 con plugins/sfsp-filtro-red-0.1.0.jar> JAVA_HOME=<jdk-25> \
ENSAYO_DIR=<carpeta fuera del repo> node sfsp/red/ensayo-local/ensayo-besu-local.mjs
```

No se probó en local lo siguiente, y se prueba en la 5534:

- 7 validadores y la mezcla de nodos con y sin filtro;
- la forma TOML;
- la carga real del pool;
- `bloque-fin`.

---

## 7 · Plan de encendido en la 5550

### Requisitos previos (compuertas)

- **Decisiones y firmas**: D07 (firmantes, quórum y espera cargados), D26
  (catálogo de los 172 con su salida y cortes), el manifiesto de despliegue
  (SFSP-900 §0.2) y la auditoría externa de `SFSPNetworkPermissions` y del
  complemento.
- **Ensayo en la 5534**: §5 completo, en verde.
- **Inventario de lo que hoy manda transacciones.** Bots de `infra/bots`,
  backends, Veta, Ordenex y MyTokenPay: a qué destinos, desde qué cuentas. Todo
  destino que siga en uso tiene que entrar en la lista **antes** de la activación,
  o se rompe.

### Pasos

1. **Desplegar** `SFSPNetworkPermissions`, y el resto del protocolo que tenga que
   operar, **antes** de la activación. Hoy cualquier cuenta despliega. Después sólo
   lo harán los desplegadores.
2. **Cargar las listas** por órdenes de gobierno:
   - destinos de sistema: los contratos SFSP;
   - activos conformes;
   - transitorios del catálogo, con su corte;
   - desplegadores.
3. **Nivel 1 primero** (SFSP-150 §5). Para empezar sólo con la lista de
   despliegue, los heredados **en uso** se admiten al principio como
   `SYSTEM_TARGET`, con el motivo `TRANSICION_NIVEL_1`. Después se dan de baja
   **contrato por contrato**, empezando por los que van a inactivación. Cada baja es
   inmediata y queda en un evento.
4. **Verificación en lectura** con la matriz del §5.3 contra la 5550. Sólo
   `eth_call`.
5. **Activación.** Se fija `N` = cabeza + un margen que permita reiniciar los 7 uno
   a uno (por ejemplo, 48 h de bloques). Se instala en los RPC y en los 7
   validadores, **de uno en uno**, esperando en cada reinicio a que vuelva a tener
   peers. Con 6 de 7 arriba, el quórum se mantiene.
6. **En `N`**: seguimiento del registro de cada nodo, de la altura, de los cambios
   de ronda y de los rechazos del pool.

---

## 8 · Plan de reversión

| Nivel | Cómo | Tiempo | Riesgo |
|---|---|---|---|
| 1 · Corregir la lista | Orden de gobierno. Dar de **baja** no espera; dar de **alta** espera el timelock. Gobierno y la lista siempre están disponibles. | Minutos (baja) o la espera (alta) | Ninguno de consenso |
| 2 · Reversión programada | `--plugin-sfsp-filtro-bloque-fin=M` en todos los nodos, uno a uno, con `M` futuro | Horas | Ninguno si `M` es igual en todos |
| 3 · Emergencia | Reinicio escalonado con `--plugin-sfsp-filtro-habilitado=false`, o sin el jar y sin sus banderas | Minutos por nodo | Mientras dure la mezcla hay cambios de ronda. Si 5 ya están abiertos y comprometen algo prohibido, los que siguen filtrando se detienen hasta abrirse también (ensayado en §6). Se reinician todos. |

---

## 9 · Riesgos

1. **Bloquear el génesis de gobierno.**
   - Gobierno y la propia lista siempre son destinos admitidos, y una orden que
     intente darlos de baja revierte.
   - Los firmantes pagan gas en ORIGEN nativo (93 gwei), y la transferencia nativa
     sigue admitida.
   - Lo que **sí** se bloquea es desplegar: si en la activación falta un
     desplegador o un contrato SFSP por desplegar, hace falta una orden con espera.
   - **Mitigación**: desplegar antes y cargar los desplegadores antes.
2. **Bloquear validadores.**
   - Los validadores no mandan transacciones: los votos de QBFT
     (`qbft_proposeValidatorVote`) van en la cabecera, no son transacciones.
   - Un error de configuración (contrato mal escrito, contrato sin código) hace que
     **se rechace todo**. Es cerrado ante la duda. La cadena sigue produciendo
     bloques vacíos, y se corrige con la reversión de nivel 2 o 3.
   - Una **mezcla de nodos** con y sin filtro (§4) cuesta vivacidad o provoca un
     fork.
3. **Gas y CPU.**
   - La consulta no cuesta gas al usuario.
   - Cada nodo simula una llamada de 2.500 a 8.000 de gas por transacción nueva,
     con un tope de 200.000.
   - Una caché por (cabeza, transacción) evita repetirla dentro del mismo bloque.
   - Rechazar en el pool no le cuesta nada al atacante, como cualquier transacción
     inválida hoy. Se mantiene la limitación de tasa del RPC público.
4. **Rodeo por un destino admitido.** El filtro mira el `to` de la transacción, no
   las llamadas internas. Un destino admitido que reenvíe llamadas arbitrarias
   (multicall, relé, cuenta abstracta) abriría los heredados.
   - **Regla**: nunca se admite como `SYSTEM_TARGET` un contrato que haga llamadas
     arbitrarias.
   - La delegación EIP-7702 se rechaza en el complemento. Una cuenta delegada tiene
     código y ya no pasa como transferencia nativa.
5. **Determinismo.**
   - La consulta usa el estado de la cabeza y el número del bloque en curso (cabeza
     + 1): el mismo en quien propone y en quien importa.
   - Mismo jar, mismas banderas y misma versión de Besu en todos.
   - La API de complementos es `@Unstable` en parte (`TransactionSimulationService`,
     `BlockchainService`): **actualizar Besu obliga a recompilar y a volver a
     ensayar**.
6. **Diferencia con la opción retirada.** Aquella dejaba pasar **todo** si el
   contrato no existía; ésta lo **rechaza**. Lo que hay que vigilar es que la
   dirección del contrato esté bien escrita en los 9+ nodos.
7. **Reemplazar el contrato.** Es una nueva dirección, con una nueva activación
   coordinada y la ventana anterior cerrada con `bloque-fin`. Todo eso se documenta
   para resincronizaciones futuras.
8. **Lectura intacta.** Los heredados siguen **legibles**: `balanceOf` por
   `eth_call` no pasa por el filtro. Los titulares ven su saldo congelado, que es
   el `FROZEN_SNAPSHOT` de SFSP-700.
9. **Integraciones que hoy escriben en heredados** (bots, backends). Se rompen en
   la activación si no están en la lista (§7).

---

## 10 · Archivos

| Archivo | Qué es |
|---|---|
| `contracts/src/SFSPNetworkPermissions.sol` | La lista y `transactionAllowed` |
| `contracts/src/pruebas/SFSPSondasDePrueba.sol` · `SFSPHeredadoDePrueba` | ERC-20 heredado de prueba (sólo pruebas y ensayo) |
| `contracts/test/26-red-cerrada.js` | T-150-01 a T-150-07, codificación exacta de Besu, coste y superficie de escritura |
| `spec/eventos.json` | `NetworkPermissionChanged` pasa a `implementadoEnContratos: true` (emisor `NetworkAdmission` → `SFSPNetworkPermissions`) |
| `red/filtro-besu/` | Complemento Java (Gradle, JDK 25) y su README |
| `red/ensayo-local/ensayo-besu-local.mjs` | Ensayo con Besu real en 127.0.0.1 |
| `red/ensayo-local/resultado-ensayo-2026-09-26.json` | Resultado del ensayo (direcciones de prueba públicas) |

Pendiente: el **ADR** que registra la elección del mecanismo (SFSP-150 §4) y la
entrada del contrato en el SDK.
