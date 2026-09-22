# Afirmaciones a desafiar

Esto es lo que este árbol **afirma**. Cada línea es falsable: si el auditor
encuentra un contraejemplo, la afirmación cae y hay que corregir el código o
retirar la frase.

Tras la auditoría independiente del 22 de septiembre de 2026, cada fila lleva
**el resultado de esa auditoría** y **la prueba que hoy la fija**. Una
afirmación que no resistió no se defiende: se corrige o se reescribe con su
alcance verdadero, y eso es lo que se hizo.

Leyenda del estado:

- **Resistió** · el auditor la atacó y aguantó.
- **Refutada → corregida** · cayó, y el código cambió. La prueba nombrada
  reproduce el ataque del auditor.
- **Refutada → reescrita** · cayó porque la frase prometía de más. La frase es
  lo que cambió, no el código.
- **Parcial → cerrada** · aguantaba a medias; se cerró el hueco.
- **Pendiente** · el trabajo está identificado y todavía no cerrado.

---

## A · Cuenta, alias y rutas

| # | Afirmación | Auditoría | Prueba que la fija |
|---|---|---|---|
| A1 | El número de cuenta es aleatorio, no secuencial y no codifica datos de la persona. | Resistió | `sdk` T57, T59 |
| A2 | El muestreo de dígitos no tiene sesgo. | Resistió | `sdk` T59, propiedades |
| A3 | Un número retirado o de una corrida deshecha nunca se vuelve a entregar. | Resistió, con límite: sólo en memoria | `sdk` T68 · falta el adaptador durable (P01, I-08) |
| A4 | Dos alias que se ven iguales no pueden convivir. | Parcial → cerrada: la cobertura ahora está enumerada y es revisable | `sdk` T60, P02 |
| A5 | Cambiar alias o ruta no cambia el número de cuenta. | Parcial → cerrada con A6 | `sdk` T61, T62 |
| A6 | Nunca hay dos rutas primarias a la vez en una cuenta. | **Refutada → corregida**: los clones eran superficiales | `adversarias` H07a |
| A7 | Una ruta caducada o revocada no resuelve, y la resolución se revalida entera. | **Refutada → corregida**: no comparaba dirección ni red, y `NaN` pasaba | `adversarias` H08 ×2 |
| A8 | `REVOKED` es terminal. | Parcial → cerrada: ya no se puede eludir mutando una referencia | `adversarias` H07b |

## B · Recuperación

| # | Afirmación | Auditoría | Prueba que la fija |
|---|---|---|---|
| B1 | Volver a vincular una cuenta no mueve activos legacy. | Resistió | `sdk` T64 |
| B2 | `PERSONAL` + llave perdida + legacy sin poderes = `NONE`, y así se muestra. | Resistió | `sdk` T65 |
| B3 | Recuperar acceso en `MANAGED` no exporta semilla ni llave. | Resistió | `sdk` T66 |
| B4 | ~~Sin D19 no hay ninguna recuperación ejecutable.~~ **Sin D19 no hay recuperación ejecutable de FONDOS.** Restablecer el acceso, cuando la llave no se perdió, no mueve nada y se ofrece siempre. | **Refutada → reescrita**: la frase prometía de más, el código era correcto | `adversarias` H25 |

## C · Migración de cuentas

| # | Afirmación | Auditoría | Prueba que la fija |
|---|---|---|---|
| C1 | La migración inicial no cambia dirección, semilla ni saldo, y no exige firma. | Resistió | `sdk` T67 |
| C2 | La función no recibe ni puede filtrar material criptográfico. | Resistió, con límite: dentro de las entradas válidas observadas | `sdk` T67, fixtures |
| C3 | El modo simulacro no deja nada escrito. | **Refutada → corregida**: ahora corre sobre una copia y no toca el original | `adversarias` C08 |
| C4 | Correr dos veces no reparte números nuevos. | **Refutada → corregida**: la idempotencia vive en el directorio | `adversarias` H10 |
| C5 | Una excepción se aísla con expediente y no se elimina del censo. | Parcial → cerrada: cada cuenta va en su propio manejo de errores | `adversarias` H11 |
| C6 | El reporte publicable no lleva direcciones, referencias ni números. | Resistió | `sdk` migración |

## D · Conciliación y aritmética

| # | Afirmación | Auditoría | Prueba que la fija |
|---|---|---|---|
| D1 | `S0 = A + N + P`, con `E = N + P` como contraparte. | Parcial: la ecuación del SDK aguanta; la interpretación contractual de congelado no | `sdk` reconciliación, propiedades · **pendiente L3** para H04 |
| D2 | Un ratio con resto no pierde derechos. | Resistió | `sdk` propiedades |
| D3 | Un derecho no se puede reclamar dos veces. | Parcial: dentro de una migración sí; entre migraciones no | `sdk` reconciliación · **pendiente L3** para H04 |
| D4 | Toda cantidad es entera; no hay coma flotante en decisiones financieras. | **Refutada → corregida**: la cobertura perdía precisión y devolvía `number` | `adversarias` H12 |
| D5 | `decimals: null` nunca se sustituye por 18. | Resistió | `sdk` reservas, indexador |

## E · Suministro y reservas

| # | Afirmación | Auditoría | Prueba que la fija |
|---|---|---|---|
| E1 | Mandar unidades a una dirección sin llave no reduce el suministro nativo. | Resistió | `sdk` propiedades |
| E2 | Ampliar el techo administrativo no aumenta el saldo técnico disponible. | Parcial → cerrada: faltaba comprobar el inventario técnico | `adversarias` H13 |
| E3 | Una reserva vencida o ya asignada aporta cero. | **Refutada → corregida**: se podía contar dos veces | `adversarias` H09 |
| E4 | Los tres factores se aplican una sola vez cada uno. | Resistió, con límite: faltaba imponer el rango | `sdk` reservas, propiedades |
| E5 | La cobertura descuenta la escala de decimales. | Parcial → cerrada con D4 | `adversarias` H12 |

## F · Contratos

| # | Afirmación | Auditoría | Prueba que la fija |
|---|---|---|---|
| F1 | `evaluate` es de sólo lectura y no emite eventos. | Resistió | `contracts` 03 |
| F2 | Lo acuñado acumulado nunca supera lo aprobado, y quemar no renueva. | Parcial: la emisión ordinaria aguanta; la migración permitía doble reemplazo | `contracts` 04 · **pendiente L3** |
| F3 | El inventario de tesorería cuenta dentro del outstanding. | Resistió | `contracts` 04 |
| F4 | Las restricciones se imponen también por la ruta ERC-20. | Resistió | `contracts` 05 |
| F5 | El forced transfer exige aprobación de gobierno y la consume. | Parcial: la aprobación no estaba ligada a la ejecución exacta | **pendiente L3** para H01 |
| F6 | En DvP, si una pata falla no se mueve la otra. | Parcial: la atomicidad aguanta; la autenticidad del activo no | **pendiente L3** para H05 |
| F7 | ~~El vault no crea efectivo sin pasivo.~~ **El vault mantiene solvencia: activo on-chain ≥ pasivos, y un superávit forzado se clasifica.** | **Refutada → reescrita**: se puede forzar Ether con `SELFDESTRUCT` | **pendiente L3** para H24 |
| F8 | La pausa exige motivo y caduca sola. | Parcial: una aprobación de reanudación antigua se reutilizaba | **pendiente L3** para H19 |
| F9 | ~~Ningún quórum ni parámetro económico está escrito en el código.~~ **Ningún parámetro económico está escrito en el código, y toda acción crítica exige doble control.** | **Refutada → reescrita**: había rutas de un solo rol, entre ellas pausa y quema | `spec/SFSP-800` §12 · **pendiente L3** para P03 |

## G · Decisiones y honestidad de estado

| # | Afirmación | Auditoría | Prueba que la fija |
|---|---|---|---|
| G1 | Ningún parámetro económico tiene valor: pedirlo devuelve `BLOCKED_DECISION`. | Parcial → cerrada: el lector no exigía que la decisión estuviera aprobada | `adversarias` H21, C07 |
| G2 | `UNKNOWN_SOURCE` nunca se degrada a cero ni a `ALLOW`. | **Refutada → corregida**: el suministro se presentaba como conocido sin cobertura | `indexer` supply-cobertura, reorg |
| G3 | Registrar un activo legacy no le añade capacidades. | Resistió, con límite | `contracts` 01, `sdk` fixtures |
| G4 | Retirar un activo del catálogo no borra saldo ni acceso del titular. | Resistió | `contracts` 01 |
| G5 | No se afirma privacidad en ninguna parte. | Parcial: el adaptador de identidad permite correlación enumerable | **pendiente L3** para H16 |
| G6 | El README no dice «probado» de nada sin una prueba que se pueda repetir. | Parcial → cerrada: la frase «sin red» era falsa y el verificador era indulgente | `adversarias` H22, README |

## H · Seguridad del propio árbol

| # | Afirmación | Auditoría | Prueba que la fija |
|---|---|---|---|
| H1 | Cero secretos, cero llaves, cero datos personales. | Resistió | barrido, `sdk` fixtures |
| H2 | Cero direcciones reales del ecosistema. | Resistió | barrido, `indexer` esquema |
| H3 | Las pruebas no usan red, nodos, bases ni credenciales. | Parcial → cerrada: el compilador se descargaba. Ahora está fijado y comprobado | `contracts/compilador`, CI |
| H4 | El SDK no tiene dependencias de ejecución. | Resistió | `package.json` |
| H5 | Keccak-256 está escrito a mano y es correcto. | Resistió, con límite: diez comprobaciones no son una auditoría criptográfica | `sdk` keccak · **pendiente P04** |

---

## Lo que el auditor no puede concluir

Este árbol no toca producción, no leyó la red 5550, no leyó cuentas reales y no
desplegó nada. Que una prueba pase no dice nada sobre un servicio desplegado;
que un contrato compile no dice que la EVM de la 5550 lo acepte; que el censo
cuadre con datos sintéticos no dice que cuadre con el censo real.

Un informe que confunda `PROBADO_AISLADO` con `VERIFICADO_RUNTIME` está mal,
aunque todo lo demás esté bien.

## Lo que sigue abierto

Las filas marcadas **pendiente** son trabajo identificado, no defectos
olvidados: D1, D3, F2, F5, F6, F7, F8, F9 y G5 esperan al lote de contratos, y
H5 a la decisión sobre el keccak escrito a mano. Mientras sigan ahí, la
verificación no puede ser completa, y el verificador lo dice.
