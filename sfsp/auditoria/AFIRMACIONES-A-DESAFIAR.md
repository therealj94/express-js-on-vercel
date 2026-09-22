# Afirmaciones a desafiar

Esto es lo que este árbol **afirma**. Cada línea es falsable: si el auditor
encuentra un contraejemplo, la afirmación cae y hay que corregir el código o
retirar la frase. Ninguna se defiende con prosa; todas tienen un sitio concreto
donde comprobarse.

El auditor debe tratar cada fila como una hipótesis a romper, no como una
descripción a confirmar.

---

## A · Cuenta, alias y rutas

| # | Afirmación | Dónde comprobarla | Cómo romperla |
|---|---|---|---|
| A1 | El número de cuenta es aleatorio, no secuencial y no codifica país, tipo de persona ni nivel de verificación. | `sdk/src/numeroCuenta.ts` | Encontrar cualquier dependencia de una entrada, un contador o el reloj. |
| A2 | El muestreo de dígitos no tiene sesgo. | `digitosAleatorios` | Demostrar que algún dígito sale con probabilidad distinta de 1/10. |
| A3 | Un número retirado o de una corrida deshecha **nunca** se vuelve a entregar. | `sdk/src/directorio.ts`, conjunto `numerosConsumidos` | Hallar una ruta que lo devuelva al sorteo, incluida `restaurar`. |
| A4 | Dos alias que se ven iguales no pueden convivir. | `sdk/src/alias.ts` | Construir un par visualmente indistinguible que el esqueleto no colapse. |
| A5 | Cambiar alias o ruta no cambia el número de cuenta. | pruebas T61 y T62 | Encontrar un camino que lo cambie. |
| A6 | Nunca hay dos rutas primarias a la vez en una cuenta. | `cambiarEstadoBinding` | Hallar una secuencia que deje dos. |
| A7 | Una ruta caducada, suspendida o revocada no resuelve, y la resolución caduca y se revalida por versión. | `sdk/src/binding.ts` | Ejecutar con una resolución vieja después de un cambio de ruta. |
| A8 | `REVOKED` es terminal. | `TRANSICIONES` | Revivir una ruta revocada. |

## B · Recuperación, que es donde se puede engañar a una persona

| # | Afirmación | Dónde | Cómo romperla |
|---|---|---|---|
| B1 | Volver a vincular una cuenta **no mueve** activos legacy. | `custodia.ts`, prueba T64 | Encontrar código que insinúe lo contrario o una interfaz que lo prometa. |
| B2 | Con perfil `PERSONAL`, llave perdida y activo legacy sin poderes, la capacidad es `NONE` y el mensaje no promete nada. | prueba T65 | Hallar una combinación que devuelva capacidad sin poder real. |
| B3 | Recuperar acceso en `MANAGED` no exporta semilla ni llave. | prueba T66 | Encontrar un campo del dictamen que filtre material criptográfico. |
| B4 | Sin la política D19 aprobada, nada se ofrece como ejecutable. | `capacidadDeRecuperacion` | Hallar una rama que devuelva `ejecutable: true` con D19 pendiente. |

## C · Migración de cuentas

| # | Afirmación | Dónde | Cómo romperla |
|---|---|---|---|
| C1 | La migración inicial no cambia dirección, semilla ni saldo, y no exige firma. | `sdk/src/migracionCuentas.ts` | Encontrar una escritura sobre cualquiera de esos tres. |
| C2 | La función no recibe ni puede filtrar material criptográfico. | firma de `migrarCuentas` | Hallar una vía por la que una semilla entre o salga. |
| C3 | El modo simulacro no deja nada escrito. | prueba T67 | Encontrar un efecto que sobreviva a `restaurar`, salvo los números consumidos, que es deliberado. |
| C4 | Correr dos veces no reparte números nuevos. | prueba T67 idempotencia | Provocar duplicados con dos corridas. |
| C5 | Una excepción se aísla con expediente y no se elimina del censo. | rama de excepciones | Hallar un camino que la descarte para que el conteo cierre. |
| C6 | El reporte publicable no lleva direcciones, referencias de sujeto ni números de cuenta. | `reporteSanitizado` | Encontrar una fuga en el JSON. |

## D · Conciliación y aritmética

| # | Afirmación | Dónde | Cómo romperla |
|---|---|---|---|
| D1 | La conciliación es `S0 = A + N + P` con `E = N + P` como contraparte, y `E + N + P` es la ecuación equivocada. | `sdk/src/reconciliacion.ts` | Demostrar que la ecuación implementada es incorrecta para algún caso real. |
| D2 | Un ratio con resto no pierde derechos. | `convertirConRatio`, `conversionSinPerdida` | Hallar entradas donde se pierda una unidad. |
| D3 | Un derecho no se puede reclamar dos veces. | `RegistroDeClaims` y `SFSPMigrationRegistry.sol` | Conseguir un doble claim por nonce, por nullifier o por otra ruta. |
| D4 | Toda cantidad es entera en unidades base; no hay coma flotante en decisiones financieras. | todo el árbol | Encontrar un `number` en un camino de dinero. |
| D5 | `decimals: null` nunca se sustituye por 18. | `reservas.ts`, `supply.ts`, `indexer/src/supply.ts` | Hallar una sustitución implícita. |

## E · Suministro y reservas

| # | Afirmación | Dónde | Cómo romperla |
|---|---|---|---|
| E1 | Mandar unidades a una dirección sin llave no reduce el suministro nativo. | `supply.ts`, `esQuemaReconocida` | Encontrar una resta que lo haga. |
| E2 | Ampliar el techo administrativo no aumenta el saldo técnico disponible. | `puedeLiberar` | Hallar un caso donde subir `ReleaseCap` libere más de lo que permite la capacidad. |
| E3 | Una reserva vencida o ya asignada a otra obligación aporta cero. | `valorElegible` | Conseguir que cuente dos veces. |
| E4 | Los tres factores se aplican una sola vez cada uno. | fórmula de `valorElegible` | Demostrar doble descuento o descuento omitido. |
| E5 | La cobertura descuenta la escala de decimales. | `coberturaBps` | Encontrar el error de 10^decimals. |

## F · Contratos

| # | Afirmación | Dónde | Cómo romperla |
|---|---|---|---|
| F1 | `evaluate` es de sólo lectura y no emite eventos. | `SFSPEligibilityEngine.sol` | Hallar un cambio de estado o un log. |
| F2 | Lo acuñado acumulado nunca supera el monto aprobado, y quemar no renueva una autorización agotada. | `SFSPIssuanceController.sol` | Conseguir acuñar de más por cualquier ruta. |
| F3 | El inventario de tesorería cuenta dentro del outstanding. | mismo contrato | Hallar una forma de excluirlo. |
| F4 | Las restricciones de transferencia se imponen también por la ruta ERC-20 y por allowance. | `SFSPRegulatedAsset.sol` | Encontrar un atajo que las evite. |
| F5 | El forced transfer exige aprobación de gobierno y la consume. | mismo contrato | Ejecutarlo sin aprobación o reusar una. |
| F6 | En DvP, si una pata falla no se mueve la otra. | `SFSPSettlementEngine.sol` | Conseguir un estado intermedio persistido. |
| F7 | El vault no crea efectivo sin pasivo. | `SFSPCashVault.sol` | Encontrar una entrada de nativo que no genere pasivo. |
| F8 | La pausa exige motivo y caduca sola. | `SFSPGovernanceController.sol` | Dejarla indefinida. |
| F9 | Ningún quórum ni parámetro económico está escrito en el código. | todos | Encontrar un número de política embebido. |

## G · Decisiones y honestidad de estado

| # | Afirmación | Dónde | Cómo romperla |
|---|---|---|---|
| G1 | Ningún parámetro económico tiene valor: pedirlo devuelve `BLOCKED_DECISION`. | `DECISIONES-SFSP.json`, `decisiones.ts` | Hallar un valor por defecto operativo en cualquier capa. |
| G2 | `UNKNOWN_SOURCE` nunca se degrada a cero ni a `ALLOW`. | todo el árbol | Encontrar una degradación. |
| G3 | Registrar un activo legacy no le añade capacidades. | `SFSPAssetRegistry.sol`, `enforcementScope` | Hallar una capacidad concedida por el registro. |
| G4 | Retirar un activo del catálogo no borra saldo, documentos ni acceso del titular. | cinco ejes de estado | Encontrar un eje que arrastre a otro. |
| G5 | No se afirma privacidad en ninguna parte. | `privacy/`, `spec/SFSP-600` | Hallar una promesa de confidencialidad. |
| G6 | El README no dice «probado» de nada que no tenga una prueba que se pueda volver a correr. | `README.md` frente a las suites | Encontrar una fila inflada. |

## H · Seguridad del propio árbol

| # | Afirmación | Cómo romperla |
|---|---|---|
| H1 | Cero secretos, cero llaves, cero datos personales en todo el árbol. | Encontrar uno. |
| H2 | Cero direcciones reales del ecosistema. | Encontrar una. |
| H3 | Las pruebas no usan red, nodos, bases ni credenciales. | Encontrar una llamada saliente. |
| H4 | El SDK no tiene dependencias de ejecución. | Encontrar una. |
| H5 | Keccak-256 está escrito a mano y es correcto. | Romperlo con un vector que falle. |

---

## Lo que el auditor **no** puede concluir

Este árbol no toca producción, no leyó la red 5550, no leyó cuentas reales y no
desplegó nada. Por tanto:

- que una prueba pase **no** dice nada sobre el comportamiento de ningún servicio
  desplegado;
- que un contrato compile **no** dice que la EVM de la 5550 lo acepte;
- que el censo de migración cuadre con datos sintéticos **no** dice que cuadre
  con el censo real, que todavía no se leyó.

Un informe que confunda `PROBADO_AISLADO` con `VERIFICADO_RUNTIME` está mal,
aunque todo lo demás esté bien.
