# Invariantes de SFSP

**Qué es esto.** La lista de lo que este árbol sostiene que no puede pasar, cada
línea con cuatro cosas: qué afirma, qué la rompería, dónde vive el código que la
sostiene, y el identificador de la prueba que la fija. Es lo primero que debería
leer la próxima auditoría.

**Qué NO es.** No es una lista de propiedades demostradas. Una fila con
`SIN PRUEBA` es una invariante que hoy **nadie comprueba**: está escrita porque
el diseño la exige, no porque el árbol la garantice. Contarla como garantizada
sería exactamente la clase de afirmación sin evidencia que este proyecto dice no
permitirse.

**De dónde salen.** De `auditoria/AFIRMACIONES-A-DESAFIAR.md` (las 48
afirmaciones), del `auditoria/PLAN-DE-CORRECCION.md` (los 46 puntos), y del
modelo de concurrencia de `scripts/concurrencia.md`.

**Cómo se lee la columna de prueba.**

| Marca | Significado |
|---|---|
| `T57` … `T68` | prueba del SDK, en `sdk/src/test/` |
| `ADV·Hxx` | prueba de la suite adversaria, en `pruebas-adversarias/src/sdk.test.ts` |
| `CONF·<máquina>` | comprobación de `scripts/conformidad.mjs` |
| `COMP·<código>` | comprobación de `contracts/compilador/comprobar-compilador.mjs` |
| `VER·<código>` | comprobación de `scripts/verificar-todo.mjs` |
| archivo `.js` | prueba de contratos, sin identificador estable: se nombra el archivo |
| **SIN PRUEBA** | nadie la comprueba hoy |
| **NO_COMPROBADA** | existe una comprobación y declara que no pudo comprobarlo |

La autoridad sobre si una prueba está en verde **no es este documento**: es
`node scripts/verificar-todo.mjs` y el registro que deja en `evidence/corridas/`.
Aquí sólo se dice qué prueba fija qué invariante. Un documento que afirme colores
envejece en horas; uno que nombre pruebas, no.

---

## 1 · Número de cuenta

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-01 | El `accountNumber` es aleatorio: no es secuencial y no codifica país, tipo de persona ni nivel de verificación. | Cualquier dependencia de una entrada, un contador o el reloj en la generación. | `sdk/src/numeroCuenta.ts` | T59 |
| I-02 | El muestreo de dígitos no tiene sesgo: cada dígito sale con probabilidad 1/10. | Un módulo sobre un rango que no sea múltiplo de 10 sin rechazo. | `digitosAleatorios` en `numeroCuenta.ts` | T57 |
| I-03 | El dígito de control detecta los errores de tecleo definidos. | Un par de errores que el control no distinga. | `numeroCuenta.ts` | T58 |
| I-04 | Un número retirado, o de una corrida deshecha, **nunca** se vuelve a entregar. | Una ruta que lo devuelva al sorteo, `restaurar` incluida. | `numerosConsumidos` en `sdk/src/directorio.ts` | T68 |
| I-05 | I-04 se sostiene **también con varios procesos**. | Dos procesos con su propio conjunto en memoria: el número liberado en uno vuelve al sorteo en el otro. | no existe: el conjunto es de proceso | **SIN PRUEBA** · exige adaptador durable · T-CONC-02 |
| I-06 | Dos altas simultáneas no producen dos cuentas con el mismo número. | Comprobar antes de escribir, en vez de dejar arbitrar a un índice único. | no existe | **SIN PRUEBA** · T-CONC-01 |

## 2 · Alias

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-07 | Dos alias que se ven iguales no coexisten activos. | Un par visualmente indistinguible que el esqueleto no colapse. | `sdk/src/alias.ts` | T60 |
| I-08 | Los nombres reservados no se entregan, ni disfrazados. | Una variante que esquive la lista de reservados. | `esReservado` en `alias.ts` | T60 |
| I-09 | Cambiar de alias no cambia el `accountNumber`. | Un camino que lo cambie. | `cambiarAlias` en `directorio.ts` | T61 |
| I-10 | La lista de confusables cubre los pares que declara cubrir, y **dice** cuáles no cubre. | Un par confusable real fuera de la lista y sin documentar. | `alias.ts` | **SIN PRUEBA** · punto **P02** del plan |
| I-11 | Dos solicitudes concurrentes del mismo alias, o del mismo esqueleto, dejan exactamente una activa. | Dos índices escritos en dos transacciones, o una comprobación previa como mecanismo. | no existe | **SIN PRUEBA** · T-CONC-03, T-CONC-04 |
| I-12 | `cambiarAlias` es atómico: la cuenta nunca queda con dos alias activos ni con cero. | Una excepción entre registrar el nuevo y liberar el viejo. | `cambiarAlias` en `directorio.ts` | **SIN PRUEBA** · T-CONC-05 |

## 3 · Rutas (bindings)

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-13 | Cambiar de ruta no cambia el `accountNumber`. | Un camino que lo cambie. | `directorio.ts` | T62 |
| I-14 | Una ruta caducada, suspendida o revocada **no resuelve**. | Resolver con una ruta fuera de vigencia; una fecha inválida que pase como `NaN`. | `estaVigente` en `sdk/src/binding.ts` | T63, ADV·H08 |
| I-15 | La resolución de destino caduca y se revalida contra la versión de la ruta. | Ejecutar con una resolución vieja después de un cambio de ruta. | `resolverDestino`, `revalidarDestino` | T63, ADV·H08 |
| I-16 | La revalidación compara el destino **completo**: cuenta, red, dirección, propósito, vigencia y versión. | Comparar sólo la versión, o sólo el identificador. | `revalidarDestino` | ADV·H08 |
| I-17 | `REVOKED` es terminal: una ruta revocada no vuelve. | Cualquier transición con origen `REVOKED`. | `TRANSICIONES` en `binding.ts` | CONF·binding.terminalidad |
| I-18 | Los estados de ruta del código son exactamente los seis de SFSP-130 §5.1. | Un estado en el código que la spec no declare, o al revés. | `BindingStatus` en `sdk/src/tipos.ts` | CONF·binding.estados |
| I-19 | Las transiciones que el código admite son las que SFSP-130 §5.2 declara. | Una transición de más o de menos en cualquiera de los dos lados. | `TRANSICIONES` vs SFSP-130 §5.2 | **NO_COMPROBADA** · CONF·binding.transiciones: §5.2 es arte ASCII y no se puede extraer con fiabilidad |
| I-20 | Nunca hay dos rutas `PRIMARY` a la vez en una cuenta. | Una secuencia que deje dos; hoy sólo lo impide el hilo único. | `cambiarEstadoBinding` en `directorio.ts` | ADV·H07a (un proceso) · **SIN PRUEBA** en concurrencia · T-CONC-07 |
| I-21 | Dos cambios concurrentes desde la misma versión no prosperan los dos. | Escribir sin `WHERE version = $n`. | no existe | **SIN PRUEBA** · T-CONC-08 |
| I-22 | Entre revalidar y ejecutar no cabe un cambio de ruta. | Revalidar como paso previo en vez de como condición de la escritura. | no existe | **SIN PRUEBA** · T-CONC-09 |

## 4 · Directorio como estructura

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-23 | Ninguna referencia viva sale del directorio: mutar lo que devuelve un lector no cambia el estado interno. | Un lector público que devuelva el objeto guardado. | lectores de `directorio.ts` | ADV·H07b |
| I-24 | Una instantánea aísla de verdad: restaurar no deja dos rutas primarias ni recicla números. | Un clon superficial que comparta objetos. | `clonar`, `restaurar` en `directorio.ts` | ADV·H07a, T68 |

## 5 · Migración de cuentas

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-25 | La migración inicial no cambia dirección, semilla ni saldo, y no exige firma. | Una escritura sobre cualquiera de los tres. | `sdk/src/migracionCuentas.ts` | T67 |
| I-26 | La función no recibe ni puede filtrar material criptográfico. | Una vía por la que una semilla entre o salga. | firma de `migrarCuentas` | T67 (por construcción de la firma) |
| I-27 | El simulacro no deja nada escrito, salvo los números consumidos, que es deliberado. | Un efecto que sobreviva a `restaurar`. | `migrarCuentas`, modo `SIMULACRO` | T67, T68, ADV·H11 |
| I-28 | El simulacro corre sobre una copia y no toca el directorio original. | Operar sobre la instancia recibida y restaurar después. | `migrarCuentas` | ADV·H11 · punto **C08** |
| I-29 | Correr dos veces no reparte números nuevos. | Provocar duplicados con dos corridas. | `migrarCuentas` | T67 |
| I-30 | I-29 se sostiene con **dos procesos** y con el mismo censo. | Idempotencia sostenida por memoria en vez de por clave en la base. | no existe | **SIN PRUEBA** · T-CONC-10, T-CONC-11 |
| I-31 | Un simulacro y un aplicar del mismo censo a la vez no se contaminan. | Estado compartido entre los dos modos. | no existe | **SIN PRUEBA** · T-CONC-12 |
| I-32 | Una excepción se aísla con expediente y no se elimina del censo. | Un camino que la descarte para que el conteo cierre. | rama de excepciones de `migracionCuentas.ts` | T67 |
| I-33 | El reporte publicable no lleva direcciones, referencias de sujeto ni números de cuenta. | Una fuga en el JSON. | `reporteSanitizado` | T67 |
| I-34 | Toda escritura sensible es idempotente por `operationId`, y reusarlo con otra carga se rechaza. | Idempotencia dependiente de un mapa que el llamador puede omitir. | `directorio.ts`, `migracionCuentas.ts` | ADV·H10 (un proceso) · **SIN PRUEBA** en concurrencia · T-CONC-13 |

## 6 · Aritmética y conciliación

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-35 | La conciliación es `S0 = A + N + P`, con `E = N + P` como contraparte; `E + N + P` es la ecuación equivocada. | Un caso real donde la implementada dé otro resultado. | `sdk/src/reconciliacion.ts` | prueba de `reconciliacion.test.ts` |
| I-36 | Un ratio con resto no pierde derechos. | Entradas donde se pierda una unidad. | `convertirConRatio` | `reconciliacion.test.ts` |
| I-37 | Toda cantidad es entera en unidades base: no hay coma flotante en un camino de dinero. | Un `number` en una decisión financiera. | todo el árbol | **SIN PRUEBA** como regla global · hay pruebas por caso · punto **C06** |
| I-38 | `decimals: null` nunca se sustituye por 18. | Una sustitución implícita. | `reservas.ts`, `supply.ts`, `indexer/src/supply.ts` | `reservas-supply.test.ts` |
| I-39 | La cobertura descuenta la escala de decimales y no trunca antes de dividir. | El error de `10^decimals`; truncar el divisor. | `coberturaBps` en `supply.ts` | ADV·H12 |
| I-40 | Mandar unidades a una dirección sin llave no reduce el suministro nativo. | Una resta que lo haga. | `esQuemaReconocida` en `supply.ts` | `reservas-supply.test.ts` |
| I-41 | Ampliar el techo administrativo no aumenta el saldo técnico disponible. | Un caso donde subir `ReleaseCap` libere más de lo que permite la capacidad. | `puedeLiberar` | `reservas-supply.test.ts` |
| I-42 | No se libera más de lo que hay sin activar. | Liberar sin exigir `cantidad <= noActivado`. | `puedeLiberar` | ADV·H13 |
| I-43 | Una reserva vencida, o ya asignada a otra obligación, aporta cero. | Conseguir que cuente dos veces. | `valorElegible` en `reservas.ts` | ADV·H09 |
| I-44 | Los tres factores de elegibilidad se aplican una sola vez cada uno, y los puntos básicos están entre 0 y 10000. | Doble descuento, descuento omitido, o un factor del 200 %. | `valorElegible` | ADV·H09 |
| I-45 | La aritmética es correcta para **todas** las entradas, no sólo para los ejemplos probados. | Un contraejemplo que ninguna prueba por ejemplo alcanza. | aritmética del SDK | **SIN PRUEBA** · punto **C06**: no hay pruebas de propiedades |

## 7 · Recuperación y custodia

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-46 | Volver a vincular una cuenta **no mueve** activos legacy. | Código o interfaz que lo insinúe. | `sdk/src/custodia.ts` | T64 |
| I-47 | Con perfil `PERSONAL`, llave perdida y activo legacy sin poderes, la capacidad es `NONE` y no se promete nada. | Una combinación que devuelva capacidad sin poder real. | `capacidadDeRecuperacion` | T65 |
| I-48 | Recuperar acceso en `MANAGED` no exporta semilla ni llave. | Un campo del dictamen que filtre material criptográfico. | `custodia.ts` | T66 |
| I-49 | Sin la política **D19** aprobada, nada se ofrece como ejecutable. | Una rama que devuelva `ejecutable: true` con D19 pendiente. | `capacidadDeRecuperacion` | ADV·H25 |
| I-50 | `MANAGED` es un **supuesto** sobre la custodia externa, no una propiedad demostrada del sistema. | Presentarlo como garantía. | documentación de `custodia.ts` | **SIN PRUEBA** · punto **P05**, ligado a **D18** |
| I-51 | Una revocación de identidad surte efecto frente a attestations tardías y a cambios de rol. | Una attestation emitida antes y presentada después que siga valiendo. | `dbnx-api/` | **SIN PRUEBA** · punto **P06** |

## 8 · Contratos

Las 74 pruebas de `contracts/test/` no llevan identificador estable, así que se
nombra el archivo. **P11** sigue abierto: nadie de fuera las ha ejecutado.

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-52 | `evaluate` es de sólo lectura: no cambia estado ni emite eventos. | Un cambio de estado o un log. | `SFSPEligibilityEngine.sol` | `test/03-identity-eligibility.js` |
| I-53 | Lo acuñado acumulado nunca supera lo aprobado, y quemar no renueva una autorización agotada. | Acuñar de más por cualquier ruta. | `SFSPIssuanceController.sol` | `test/04-issuance.js` |
| I-54 | El inventario de tesorería cuenta dentro del outstanding. | Una forma de excluirlo. | `SFSPIssuanceController.sol` | `test/04-issuance.js` |
| I-55 | Las restricciones de transferencia se imponen también por la ruta ERC-20 y por allowance. | Un atajo que las evite. | `SFSPRegulatedAsset.sol` | `test/05-asset.js` |
| I-56 | En DvP, si una pata falla no se mueve la otra. | Un estado intermedio persistido. | `SFSPSettlementEngine.sol` | `test/06-settlement.js` |
| I-57 | El vault no crea efectivo sin pasivo. | Una entrada de nativo que no genere pasivo. | `SFSPCashVault.sol` | `test/00-smoke.js`, `test/08-fee.js` |
| I-58 | La pausa exige motivo y caduca sola. | Dejarla indefinida. | `SFSPGovernanceController.sol` | `test/02-governance.js` |
| I-59 | Ningún quórum ni parámetro económico está escrito en el código. | Un número de política embebido. | todos los `.sol` | VER·PARAMETRO_CON_VALOR (parcial) · **F9 refutada en alcance universal**, ver **P03** |
| I-60 | Una autorización compromete el **contenido** de lo que autoriza y se consume una sola vez. | Autorizar por `operationId`, por monto, o reusar una aprobación. | `contracts/src/lib/SFSPAuthorization.sol`, `sdk/src/autorizacion.ts` | lote **L1** en curso · hallazgos **H01, H02, H05, H06, H18, H19** |
| I-61 | Un derecho de migración no se puede reclamar dos veces, ni por otra migración. | Un doble claim por nonce, por nullifier, o abriendo otro dominio con otro `migrationId`. | `SFSPMigrationRegistry.sol` | `test/07-migration.js` · **H04 abierto**: la unicidad global por posición no está |
| I-62 | Toda acción crítica exige doble control, no sólo la transferencia forzada. | Una ruta crítica con un solo rol, pausa y quema incluidas. | `SFSPGovernanceController.sol` | **SIN PRUEBA** · punto **P03** |
| I-79 | Ninguna emisión llega a una cuenta interna, ni por orden de gobierno ni por cupo (SFSP-410 R1). | Acuñar hacia tesorería u operación por cualquier ruta. | `SFSPIssuanceController.sol` | `test/16-politica-suministro.js` |
| I-80 | Un cupo de emisión sólo se fija con su acción, quórum, espera y consumo único; cambiar un término tras aprobar invalida la aprobación. | Fijar un cupo con un digest de otra acción, antes de la espera, o con otro periodo. | `SFSPIssuanceController.sol`, `SFSPNativeVault.sol` | `test/16-politica-suministro.js`, `test/17-boveda-nativa.js` |
| I-81 | Dentro del cupo: máximo por operación, máximo por periodo, un pago no emite dos veces, y los topes del instrumento siguen mandando. | Emitir por encima de cualquiera de los cuatro. | `SFSPIssuanceController.sol` | `test/16-politica-suministro.js` |
| I-82 | Tras emitir bajo demanda y quemar al devolver, `totalSupply` = suma de saldos de usuarios. | Una unidad acuñada que no esté en manos de un usuario. | `SFSPIssuanceController.sol`, `SFSPRegulatedAsset.sol` | `test/16-politica-suministro.js` |
| I-83 | La bóveda nativa sólo paga por `release` (quórum) o `releaseOnDemand` (cupo), nunca a una cuenta interna ni a un destino no elegible, y no tiene retiro de administrador. | Una tercera salida, o un pago a una cuenta interna. | `SFSPNativeVault.sol` | `test/17-boveda-nativa.js` |
| I-84 | `circulating()` = génesis − bóveda − cuentas internas fuera de la bóveda. | Un circulante que no se pueda recalcular con lecturas de saldo. | `SFSPNativeVault.sol` | `test/17-boveda-nativa.js` |

## 9 · Eventos e indexador

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-63 | Los eventos que los contratos emiten son los que el indexador decodifica. | Un evento emitido con otra forma que la esperada. | `spec/eventos.json`, ABI, `indexer/src/` | lote **L5** en curso · hallazgo **H15** |
| I-64 | Un suministro derivado de eventos parciales se marca desconocido y nunca se etiqueta `CHAIN_TOTALSUPPLY`. | Presentar como conocido un suministro incompleto. | `indexer/src/supply.ts` | `indexer` · `supply.test.ts` |
| I-65 | Una reorganización sólo se aplica con las cabeceras completas de la rama nueva, comparando identidad de bloque y no altura. | Aceptar una rama incompleta; comparar sólo alturas. | `indexer/src/checkpoint.ts` | lote **L6** pendiente · hallazgo **H14** |
| I-66 | `UNKNOWN_SOURCE` nunca se degrada a `ALLOW` ni a saldo cero. | Una degradación silenciosa. | todo el árbol | `indexer`, `sdk` (por caso) · **SIN PRUEBA** como regla global |
| I-67 | El índice público no permite enumerar el vínculo cuenta ↔ dirección. | Un evento que publique dirección y referencia indexadas. | `SFSPIdentityAdapter.sol`, `indexer/src/privacidad.ts` | `privacidad.test.ts` · **H16 abierto** en el contrato |

## 10 · Proceso, evidencia y conformidad

Éstas son las invariantes del árbol sobre sí mismo. Son las que fallaron primero
y las que hacen que las demás signifiquen algo.

| # | Qué afirma | Qué lo rompería | Dónde está el código | Prueba |
|---|---|---|---|---|
| I-68 | No se emite evidencia desde un árbol con cambios sin guardar. | Probar, editar, y quedarse con una evidencia que apunta a otro código. | `scripts/verificar-todo.mjs` | VER·ARBOL_SUCIO · ADV·C02 |
| I-69 | Una suite ausente, o con cero pruebas, no es un verde. | Dar por buena una verificación que no se hizo. | `verificar-todo.mjs` | VER·SUITE_AUSENTE, VER·CERO_PRUEBAS · ADV·H22 |
| I-70 | `DECISIONES-SFSP.json` no cambia sin anunciarse. | Editarlo y que nada lo detecte. | `verificar-todo.mjs`, `evidence/sello-decisiones.txt` | VER·sello · ADV·C07 |
| I-71 | Un parámetro económico exige decisión aprobada y coherencia de versión. | Desbloquear un parámetro con un cambio de una línea. | `sdk/src/decisiones.ts` | ADV·H21 |
| I-72 | Los tipos compilan en modo estricto. | Un `any` o un error de tipos que nadie ve. | `verificar-todo.mjs`, `tsc --strict` | VER·tipos · punto **P08** |
| I-73 | El compilador de Solidity que produce los artefactos es exactamente el fijado, con su huella. | Compilar con otro solc, o con uno de la caché personal sin huella comprobada. | `contracts/compilador/`, `contracts/hardhat.config.js` | COMP·HUELLA_DISTINTA y las demás de `comprobar-compilador.mjs` |
| I-74 | Compilar y probar no necesita red. | Que falte el binario vendorizado y Hardhat lo descargue en silencio. | `contracts/compilador/` | COMP·COMPILADOR_AUSENTE |
| I-75 | Los estados y ejes de las máquinas de `spec/` son los del código. | Un estado, un eje o un valor en un lado y no en el otro. | `scripts/conformidad.mjs` | CONF·binding.estados, CONF·cuenta.estados, CONF·activo.ejes |
| I-76 | Las **transiciones** de las máquinas de `spec/` son las del código. | Una transición de más o de menos. | `scripts/conformidad.mjs` | **NO_COMPROBADA** en las cuatro máquinas: ver §11 |
| I-77 | El contrato interno es la fuente única: ningún documento de `spec/` propone un tipo que no esté en él. | Trece documentos con propuestas que nunca se integraron. | `CONTRATO-INTERNO.md`, `spec/` | **SIN PRUEBA** · punto **C01** |
| I-78 | Los fixtures describen algo que alguna prueba usa. | Cuatro archivos de decoración que sugieren cobertura inexistente. | `fixtures/` | **SIN PRUEBA** · punto **C04** |

## 11 · Lo que `conformidad.mjs` declara NO_COMPROBADA

Ninguna de estas cuatro se da por conforme. No están rotas: están **sin
vigilancia**, que no es lo mismo y tampoco es aceptable.

| Máquina | Por qué no se pudo comprobar | Qué haría falta |
|---|---|---|
| `binding.transiciones` | SFSP-130 §5.2 dibuja la máquina como arte ASCII con flechas repartidas en varias líneas. Sólo se leen con fiabilidad las de una línea: 4 de las 14 que el código admite. | Que §5.2 lleve, además del dibujo, una tabla `desde │ hacia │ quién autoriza`. |
| `cuenta.transiciones` | El código no declara la máquina de la cuenta en ningún sitio: no hay un mapa equivalente al `TRANSICIONES` de `binding.ts`, los estados se asignan sueltos en `directorio.ts`. | Un mapa de transiciones de `AccountStatus` en el SDK, y una tabla en §5.3. |
| `alias.transiciones` | La spec §4.4 **sí** las declara en tabla; el código no declara la máquina. Falta el lado del código. | Un mapa de transiciones de alias en el SDK, como el de `binding.ts`. |
| `activo.transiciones` | SFSP-100 §4 declara los valores de cada eje pero ninguna transición: dice que cada eje tiene su propia autoridad, sin decir cuál. El código tampoco. No hay dos cosas que comparar. | Una tabla `eje │ desde │ hacia │ autoridad` en SFSP-100 §4, y su mapa en el SDK. |

## 12 · Recuento

Son **84 invariantes**, I-01 a I-84 (I-79 a I-84: política de suministro, SFSP-410).

| Estado | Cuántas | Cuáles |
|---|---|---|
| Con prueba que la fija | 57 | el resto |
| Con prueba **parcial** | 9 | I-20 y I-34 (probadas en un proceso, no en concurrencia); I-59, I-60, I-61, I-63, I-65, I-66, I-67 (hallazgo abierto o lote en curso) |
| **SIN PRUEBA** | 16 | I-05, I-06, I-10, I-11, I-12, I-21, I-22, I-30, I-31, I-37, I-45, I-50, I-51, I-62, I-77, I-78 |
| **NO_COMPROBADA** | 2 | I-19 y I-76: existe una comprobación y declara que no pudo comprobarlo |

De las 16 sin prueba, **ocho esperan al adaptador durable** (I-05, I-06, I-11,
I-12, I-21, I-22, I-30, I-31: son el bloque de `scripts/concurrencia.md`, trece
pruebas `T-CONC-xx` que hoy no se pueden escribir), **dos esperan a un lote
pendiente** (I-51 por P06, I-62 por P03), y **seis son deuda escrita y sin
dueño**: I-10 (P02), I-37 e I-45 (C06), I-50 (P05), I-77 (C01), I-78 (C04).

Una invariante sin prueba no es una invariante: es una intención. Están aquí para
que se vean, no para que cuenten.
