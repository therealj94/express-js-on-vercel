# Panel de emisión y quema (SFSP-410) — modo prueba

Panel web de una sola página para **ver y operar la política de suministro SFSP-410**
(«circulante = lo que está en manos de usuarios») sobre un **nodo local de Hardhat**.
Permite seguir el circulante de cada activo, preparar y aprobar órdenes de gobierno con
doble control, simular pagos y redenciones de usuarios, y cortar cupos o pausar el sistema.

> **Sólo modo prueba.** El panel habla únicamente con `http://127.0.0.1:8545`
> (chainId 31337) y firma con las cuentas sintéticas desbloqueadas del nodo local.
> Se niega a arrancar en modo prueba si el nodo responde otro chainId. **No se conecta
> a la red 5550, no usa claves reales y no mueve fondos reales.**

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `panel.css`, `panel.js` | El panel (HTML + CSS + JS sin compilación). |
| `vendor/ethers.umd.min.js` | ethers v6.17 servido localmente. Si falta, se carga desde jsDelivr. |
| `config.json` | Lo genera el script de despliegue: red, direcciones, ABIs, cuentas etiquetadas y activos. |
| `../contracts/scripts/demo-panel.js` | Despliegue de demostración que escribe `config.json`. |

## Cómo ejecutar la demo

Hacen falta Node (el de `contracts/`) y Python 3 (sólo para servir archivos estáticos).

1. **Nodo local** (terminal 1):
   ```bash
   cd sfsp/contracts
   npx hardhat node
   ```
2. **Despliegue de demostración** (terminal 2):
   ```bash
   cd sfsp/contracts
   npx hardhat run scripts/demo-panel.js --network localhost
   ```
   Reutiliza `test/fixture.js` (`deployAll()`: gobierno con 4 firmantes, quórum 2 y
   espera de 1 h; registro, motor, identidad, activo regulado y controlador de emisión).
   Además:
   - registra un activo **ORIGEN (demo)** con su política MINT y despliega la
     **bóveda sellada** `SFSPNativeVault` (génesis simulado: 200 000 ETH, las 20 cuentas del nodo);
   - la fondea con `absorb` de 1000 ETH de prueba;
   - fija los límites del instrumento **AUKA (demo)**: stock de 1 000 000 y acumulado de 10 000 000;
   - marca a **Tesorería** como cuenta interna en el controlador de emisión y en la bóveda;
   - da el rol ISSUER de la bóveda a la Junta y el rol TECH_OPS de gobierno a la bóveda;
   - escribe `sfsp/panel-emision/config.json`.

   El script se niega a correr con cualquier chainId distinto de 31337.
3. **Servir el panel** (terminal 3):
   ```bash
   cd sfsp/panel-emision
   python3 -m http.server 8080
   ```
4. Abrir `http://127.0.0.1:8080/`.

Si reinicia el nodo, vuelva a ejecutar el paso 2: el nodo arranca vacío.

### Recorrido sugerido

1. **Actuar como: Firmante 1** → Propuestas → `SET_MINT_BUDGET` → *Preparar orden* → *Proponer*.
2. **Firmante 2** y **Firmante 3** → *Aprobar* (si Firmante 1 intenta aprobar, el panel
   muestra «Quien propone no puede aprobar…»).
3. **Junta** → *Ejecutar* → falla con «La espera (timelock)… aún no ha terminado».
   Pulse *Avanzar 1 h* (reloj del nodo local) y ejecute de nuevo: el cupo queda vigente.
4. **Emisor** → Operación → *Simular pago de usuario* (AUKA, Alice, 100): el circulante sube a 100.
   *Simular redención* (40): Alice consiente la quema, el emisor la ejecuta y el circulante baja a 60.
5. ORIGEN: proponga `RELEASE_NATIVE` (sin espera) o `SET_RELEASE_BUDGET` (con espera) y
   simule pagos y redenciones de ORIGEN: se libera desde la bóveda o se devuelve a ella.
6. Emergencia: **Firmante 4** → *Revocar cupo*; un pago posterior falla con «No hay cupo vigente».
   *Pausa de emergencia* deja el gobierno en pausa hasta su caducidad.

## Qué hace cada sección

- **Estado**: red y bloque, hora de la cadena, si el gobierno está en pausa (con motivo y fin),
  quórum (el proponente no cuenta) y espera (timelock). En modo prueba incluye botones para
  avanzar el reloj del nodo local.
- **Suministro por activo**:
  - *Tokens* (AUKA): circulante = `totalSupply`, comprobado contra la suma de saldos de los
    usuarios conocidos; tope de stock; emitido acumulado frente al tope acumulado; cupo por
    periodo, usado, restante, vencimiento y máximo por operación; cuentas internas marcadas
    (reconstruidas desde `InternalAccountFlagged` y comprobadas con `isInternalAccount`).
  - *ORIGEN*: circulante = `circulating()` (génesis − bóveda − cuentas internas fuera de la
    bóveda), saldo sellado, génesis, liberado y absorbido totales, cupo de liberación y
    cuentas internas.
- **Propuestas**: el formulario construye el *Payload* SFSP-AUTH-v1 igual que las pruebas y
  calcula el digest **en el navegador**, con la misma construcción que `test/orden-autorizada.js`
  (`digestDe`) y `SFSPAuthorization.digestOf`. Para los cupos también calcula la huella de términos
  y la compara con `budgetTermsRoot()` del contrato. Muestra un resumen legible y el payload
  completo antes de *Proponer*. La lista sale de los eventos `AuthorizationProposed` y de
  `authorizationOf`: aprobaciones frente a quórum, cuenta atrás de la espera y estado.
  El contenido de cada orden se guarda en `localStorage` de este navegador para que
  *Ejecutar* pueda reconstruir la tupla. Una propuesta creada en otro navegador se ve, pero
  no se puede ejecutar desde aquí.

  | Acción | Ejecutor | Espera |
  |---|---|---|
  | `SET_MINT_BUDGET` | `SFSPIssuanceController.setMintBudget` (Junta/TECH_OPS) | sí |
  | `BURN` (gobierno) | `SFSPRegulatedAsset.burn` (ISSUER) | no |
  | `RELEASE_NATIVE` | `SFSPNativeVault.release` (ISSUER) | no |
  | `SET_RELEASE_BUDGET` | `SFSPNativeVault.setReleaseBudget` (Junta/TECH_OPS) | sí |
- **Operación bajo demanda (demo)**: *Simular pago de usuario* llama a `mintOnDemand` (tokens)
  o a `releaseOnDemand` (ORIGEN) con `paymentRef = keccak256(id de recibo aleatorio)`.
  *Simular redención* hace que el usuario firme `approveBurnAuthorization` y que el emisor
  ejecute `burn` (tokens), o que el usuario devuelva ORIGEN a la bóveda con `absorb`.
- **Historial**: eventos decodificados con las ABIs de `config.json` (emisión, quema,
  cupos, cuentas internas y gobierno), del más reciente al más antiguo, con filtros.
- **Emergencia**: *Revocar cupo* (basta un firmante, TECH_OPS o la Junta) y *Pausa de
  emergencia* (un firmante; la pausa caduca sola).

Toda operación se simula antes de firmarse (`staticCall`). Si el contrato la rechaza, el
error propio se decodifica con las ABIs y se muestra en español; por ejemplo,
`BudgetPeriodExceeded` → «Se agotó el cupo del periodo en curso».

## Firma: prueba frente a producción

`panel.js` pasa toda firma por una sola abstracción (`Firma.signerPara`):

- **Modo `prueba`**: `eth_sendTransaction` al nodo local con la cuenta elegida en «Actuar como».
  Sirve para ensayar la separación de funciones con una sola persona delante.
- **Otro modo (no implementado)**: usaría la billetera del navegador (`window.ethereum`).
  Este panel **no trae configuración de producción**.

## Nota para producción

- En producción, cada rol firma con su **propia billetera de hardware** o mediante un
  **multisig**. Ninguna clave vive en un navegador ni en un servidor, y una misma persona no
  puede actuar como proponente, aprobador y ejecutor. El selector «Actuar como» sólo existe
  en modo prueba.
- **En la red 5550 no se ejecuta ninguna emisión ni quema sin las decisiones de la Junta
  (D03, D04, D05 y D07) y sin la aprobación de SFSP-410.** Los cupos, límites, activos,
  cuentas y montos de esta demo son sintéticos. No son recomendaciones ni parámetros
  aprobados.
- El génesis de ORIGEN que usa la demo es una simulación; en la cadena real lo fija el bloque génesis.
