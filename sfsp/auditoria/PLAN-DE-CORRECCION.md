# Plan de corrección · versión 2, completa

**Informe auditado:** Codex, commit `f1d57a31751f22d9f21060a8b1f945412f80d4bb`.
**Estado:** para revisión. No se ejecutó ninguna corrección.
**Alcance del plan:** 46 puntos de trabajo. 25 hallazgos numerados del informe,
11 pendientes que el informe deja en sus secciones 4, 6 y 7 sin numerar, y 10
defectos que encontré auditando mi propio trabajo.

La versión 1 de este plan cubría los 25 hallazgos y se dejaba fuera los otros
21. Ésta no.

---

## 1 · Veredicto sobre la auditoría

Verifiqué en el código los nueve P0 y una muestra de los P1. **Confirmé todos
los que revisé.** No hay ningún hallazgo inflado y varios permitirían mover
dinero ajeno si esto se conectara hoy.

El auditor además hizo dos cosas que uno complaciente no habría hecho: se negó a
certificar las 222 pruebas porque sólo pudo correr 144, y separó lo que probó de
lo que dedujo leyendo. También me corrigió un error mío: son 48 afirmaciones, no
38 como dije en el chat.

### Verificación de los hallazgos, uno por uno

| Hallazgo | Estado | Lo que encontré en el código |
|---|---|---|
| H01 gobierno no ligado al contenido | **Confirmado** | `forcedTransfer` comprueba `isActionApproved(operationId)` y nada más. |
| H02 `ISSUER` quema saldo ajeno | **Confirmado** | `burn` sólo exige rol, motivo y que el `operationId` no se repita. |
| H03 aprobaciones sin firma | **Confirmado** | No hay una sola llamada criptográfica en `dbnx-api`. |
| H04 migración reutilizable | **Confirmado** | El nullifier incluye `migrationId`: otra migración abre otro dominio. |
| H05 liquidación confía en el operador | **Confirmado** | Sin registro canónico de contratos ni orden firmada. |
| H06 autorización por monto | **Confirmado** | El contexto es `bytes32(amount)`. |
| H07 clones superficiales | **Confirmado** | `clonar` copia los Map y comparte los objetos; los lectores devuelven la referencia viva. |
| H08 revalidación incompleta | **Confirmado** | No compara dirección ni red; una fecha inválida da `NaN` y pasa. |
| H09 reservas duplicadas | **Confirmado** | Sin deduplicar y sin validar el rango de puntos básicos. |
| H10 idempotencia frágil | **Confirmado** | Depende de un mapa opcional que el llamador puede omitir. |
| H11 simulacro deja estado | **Confirmado** | La restauración no está en `finally`. |
| H12 cobertura imprecisa | **Confirmado** | Trunca el divisor antes de dividir y devuelve `number`. |
| H13 liberación sin inventario | **Confirmado** | No exige `cantidad <= noActivado`. |
| H14 reorganización incompleta | **Confirmado por lectura** | Acepta una rama sin cabeceras completas. |
| H15 eventos incompatibles | **Confirmado** | El contrato emite `UnitsMinted` y un `BurnExecuted` sin `assetId`; el indexador espera otra cosa. |
| H16 identidad enumerable | **Confirmado por lectura** | `SubjectRefBound` publica dirección y referencia indexadas. |
| H17 expiración ignorada | **Confirmado por lectura** | `claim` comprueba `c.expiry`, no `m.expiry`. |
| H18 reserva sin activo | **Confirmado por lectura** | La reserva guarda sólo el monto. |
| H19 reanudación reutilizable | **Confirmado por lectura** | `liftPause` no consume la propuesta. |
| H20 informe antiguo vale | **Confirmado por lectura** | Cualquier entrega previa de la plantilla cuenta. |
| H21 parámetro sin aprobación | **Confirmado** | Sólo comprueba que no sea nulo. |
| H22 verificador indulgente | **Confirmado** | Una suite ausente no marca fallo. |
| H23 reparametrización | **Confirmado por lectura** | Una plantilla emitida puede quedar sin un requerido. |
| H24, H25 | **Confirmados como redacción** | El código hace lo que hace; las frases absolutas son lo que está mal. |

---

## 2 · La raíz común de siete de los nueve P0

> La autorización se identifica por una clave débil, un `operationId`, un monto,
> un `migrationId`, en vez de comprometer el contenido exacto de lo que se va a
> hacer, y no siempre se consume una sola vez.

| Hallazgo | Se identifica por | Debería comprometer |
|---|---|---|
| H01 | `operationId` | activo, origen, destino, monto, acción |
| H02 | nada | activo, titular, monto, motivo |
| H05 | lo que pasa el operador | contrato canónico, partes, cantidades, precio |
| H06 | `bytes32(amount)` | dominio, contrato, acción, activo, partes, nonce, vencimiento |
| H18 | sólo el monto | activo y monto |
| H19 | tipo de acción | la pausa concreta que levanta |
| H04 | `migrationId` arbitrario | la posición de origen, globalmente |

La corrección es una sola pieza aplicada en siete sitios:

```
digest = keccak256(dominio ‖ chainId ‖ contrato ‖ acción ‖ activo ‖
                   partes ‖ montos ‖ nonce ‖ notBefore ‖ expiry)

aprobar(digest)  →  ejecutar(payload) recalcula el digest desde los
                    argumentos reales, comprueba aprobación y vigencia,
                    y lo consume
```

Si el ejecutor recalcula el digest, una aprobación deja de poder servir para
otra cosa. Y del lado de la API, H03 no es «validar mejor»: es que **no existe
verificación criptográfica**. Node trae `crypto.verify` con Ed25519 sin
dependencias.

---

## 3 · Lo que el informe deja pendiente sin numerar

Las secciones 4, 6 y 7 del informe contienen trabajo real que no aparece en la
tabla de hallazgos. Son once puntos y hay que tratarlos como tales.

| ID | De dónde sale | Qué hay que hacer |
|---|---|---|
| **P01** | A3, resistida con límite | La unicidad de números consumidos vive sólo en memoria. El adaptador durable tiene que llevar la misma invariante con un índice único en la base, y una prueba que lo exija. |
| **P02** | A4 parcial, sospecha 2 | La lista de confusables de alias es ad hoc. Pasar a los datos de confusables de Unicode, definir política de escrituras admitidas y documentar qué pares no se cubren. |
| **P03** | F9 refutada en alcance universal | Hay rutas críticas con un solo rol, entre ellas pausa y quema. Doble control en **todas** las acciones críticas, no sólo en la transferencia forzada. |
| **P04** | H5 con límite, sospecha 4 | Keccak está escrito a mano y tiene diez comprobaciones. Contrastarlo con el juego completo de vectores oficiales, o sustituirlo por una implementación revisada. |
| **P05** | Sospecha 1 | `MANAGED` presupone que la custodia externa es efectiva y no hay evidencia. Declararlo como supuesto explícito, ligado a D18, y no como propiedad del sistema. |
| **P06** | Sospecha 3 | Revocación de identidad frente a attestations tardías y cambios de rol: faltan pruebas. |
| **P07** | Sin cubrir 2 | Las cuatro pruebas del SDK que leen JSON dependen de una ruta relativa frágil y no corrieron para el auditor. |
| **P08** | Sin cubrir 3 | `tsc --strict` y el verificador oficial no son parte de la compuerta. |
| **P09** | Sin cubrir 4 | Arranque limpio sin red no verificado. El compilador no está fijado ni vendorizado. |
| **P10** | Sin cubrir 5 | Persistencia, concurrencia e integración sin probar. No existe un modelo de concurrencia. |
| **P11** | Sin cubrir 1 | Nadie de fuera ha ejecutado las 74 pruebas de contratos. |

---

## 4 · Auditoría de mi propio trabajo

Esto no está en el informe de Codex. Lo encontré revisando lo que hice, y lo
comprobé en el árbol.

| ID | Prioridad | Defecto | Comprobación |
|---|---|---|---|
| **C01** | P1 | **Deriva de especificación.** Trece documentos de `spec/` terminan con una sección «Propuestas para el contrato interno» que nunca se integró. `CONTRATO-INTERNO.md` ya no es la fuente única que dice ser, y la deriva empezó el mismo día que se escribió. | 13 archivos con esa sección |
| **C02** | P0 | **El verificador emite evidencia sin comprobar que el árbol esté limpio.** Registra `sourceSHA` del último commit, pero no comprueba si hay cambios sin commitear. Se puede correr la suite, editar el código y quedarse con una evidencia que apunta a otro código. Es el mismo defecto de procedencia que hizo perder producción el 12 de agosto. | `verificar-todo.mjs` no consulta el estado del árbol |
| **C03** | P1 | **Modelo de error incoherente.** Siete módulos lanzan `ErrorSFSP` y cuatro devuelven `Resultado`. `supply.ts` hace las dos cosas. El llamador no puede saber qué esperar, y un `throw` no capturado en un camino de dinero es una operación a medias. | `grep` sobre `sdk/src` |
| **C04** | P2 | **Los fixtures no los usa ninguna prueba.** Los cuatro archivos de `fixtures/` son decoración y sugieren una cobertura que no existe. | ninguna referencia en las suites |
| **C05** | P1 | **La afirmación del README es falsa.** Dice «222 pruebas en verde, sin red ni credenciales». En una máquina limpia Hardhat descarga el compilador, así que la suite de contratos necesita red. Es exactamente el tipo de frase que este proyecto dice no permitirse. | compilador en la caché del usuario, no vendorizado |
| **C06** | P1 | **No hay pruebas de propiedades.** Toda la aritmética se prueba con ejemplos. H12 es justo el defecto que una prueba de propiedades encuentra sola, y no lo encontró ninguna de las 48. | todas las suites son por ejemplo |
| **C07** | P1 | **`DECISIONES-SFSP.json` no tiene integridad.** Editarlo cambia el comportamiento de todo el árbol y nada lo detecta. Junto con H21, basta un cambio de una línea para desbloquear un parámetro económico. | sin firma ni huella comprobada |
| **C08** | P1 | **El simulacro de migración escribe en el directorio real** y después restaura. Debería correr contra una copia y no tocar el original nunca. H11 es el síntoma; esto es la causa. | `migrarCuentas` opera sobre la instancia recibida |
| **C09** | P1 | **Nadie comprueba que el código corresponda a la especificación.** Las máquinas de estado de `spec/` y las del código se escribieron por separado y no hay una prueba de conformidad. | no existe tal prueba |
| **C10** | P2 | **Una sola auditoría del mismo auditor deja puntos ciegos correlacionados.** La re-auditoría debería ser de otro auditor, no del mismo. | decisión de proceso |

**C02 es P0 y es mío.** Una evidencia que puede apuntar a un código distinto del
que se probó invalida todo el sistema de evidencia del proyecto, que es
precisamente lo que este árbol vende.

---

## 5 · Clasificación por lo que bloquea

| Clase | Puntos |
|---|---|
| **Bloquea la confianza en el proceso** | H22, C02, C05, P08 |
| **Bloquea la fase siguiente (SDK)** | H07, H08, H09, H10, H11, H12, H13, H20, H21, H23, H25, C03, C06, C08, P01, P07 |
| **Bloquea la integración** | H15, H14, C09 |
| **Bloquea la API de admisión** | H03, P06 |
| **Bloquea cualquier despliegue** | H01, H02, H04, H05, H06, H16, H17, H18, H19, H24, P03, P04, P05, P10, P11 |
| **Higiene y deriva** | C01, C04, C07, C10, P02, P09 |

Nada es urgente en el sentido de producción: no hay nada desplegado ni una sola
cuenta conectada. Lo urgente es no construir encima.

---

## 6 · Los lotes

### L0 · Que el proceso deje de mentir

**Primero, porque sin esto ninguna otra evidencia vale.**

1. Guardar el informe de Codex con su commit. Hecho.
2. **C02:** el verificador se niega a emitir evidencia si el árbol tiene cambios
   sin commitear, y registra el estado del árbol en el registro.
3. **H22:** una suite ausente falla, cero pruebas falla, `--rapido` no emite
   evidencia, todos los controles corren antes de escribir. Distinguir
   `VERIFICACION_COMPLETA` de `VERIFICACION_PARCIAL`.
4. **P08:** `tsc --strict` pasa a ser parte del verificador.
5. **C05:** corregir la afirmación del README. Decir qué necesita red y qué no.
6. **C07:** huella de `DECISIONES-SFSP.json` comprobada por el verificador; un
   cambio no anunciado falla.
7. Crear `sfsp/pruebas-adversarias/` con **una prueba roja por punto
   confirmado**, escrita para fallar hoy, y añadirla al verificador.
8. Añadir a `AFIRMACIONES-A-DESAFIAR.md` dos columnas: resultado de la última
   auditoría y prueba que lo fija.

**Cierre:** el verificador corre, reporta las rojas, y el registro dice
`VERIFICACION_PARCIAL` nombrándolas. Ese rojo es el objetivo del lote.

---

### L1 · Autorización ligada al contenido

Cierra la raíz de H01, H02, H05, H06, H18, H19, y habilita L3 y L4.

1. Sección normativa en `spec/SFSP-800`: forma canónica del digest, campos que
   entran, consumo único, y prohibición de autorizar por una clave que no
   comprometa el contenido.
2. `contracts/src/lib/SFSPAuthorization.sol` y `sdk/src/autorizacion.ts`, con
   vectores compartidos y una prueba que falla si los dos digests divergen.
3. **P03:** tabla de acciones críticas con su control mínimo, y doble control en
   todas, incluidas pausa y quema.
4. ADR-013 con el patrón y por qué se rechazó identificar por `operationId`.

---

### L2 · SDK

| Punto | Corrección |
|---|---|
| H07 | Copia profunda, copias defensivas en todo lector público, y validación de invariantes al restaurar. |
| H08 | Comparar el destino completo: cuenta, red, dirección, propósito, vigencia y versión. Fecha inválida es `UNKNOWN_SOURCE`, no un pase. |
| H09 | Deduplicar por identificador, rechazar puntos básicos fuera de 0 a 10000, y una reserva asignada pertenece a una obligación, no a una lista ambigua. |
| H12 | Aritmética racional exacta con `bigint`, una sola división al final, devolver `bigint`. |
| H13 | Exigir además `cantidad <= noActivado`. |
| H10, C08 | La correspondencia origen a cuenta vive en el directorio, durable y única. El simulacro corre sobre una copia y no toca el original. |
| H11 | `try/finally` y manejo de excepciones por cuenta. |
| H20 | Cada entrega se asocia a una obligación y un período concretos. |
| H21, C07 | `parametro` exige decisión aprobada, coherencia de versión e integridad del archivo. |
| H23 | Una plantilla emitida no se reparametriza: se crea una revisión pendiente. |
| H25 | Limitar la afirmación B4 a recuperación de fondos, clave o custodia. |
| C03 | Un solo modelo de error: `Resultado` en toda frontera pública, `throw` sólo para defectos de programación. |
| C06 | Banco de pruebas de propiedades sin dependencias para toda la aritmética. |
| P01 | El adaptador durable lleva la misma invariante de unicidad, con prueba. |
| P07 | Las pruebas que leen JSON dejan de depender de una ruta relativa frágil. |
| P02 | Confusables de alias sobre datos de Unicode, con política de escrituras y límites documentados. |

**Mejora propia:** una regla arquitectónica comprobable, «ninguna referencia
viva sale del directorio», con una prueba que mute lo devuelto por cada lector
público y exija que el estado interno no cambie. Cierra la familia entera de
H07, no el caso encontrado.

---

### L3 · Contratos

Después de L1 y L5. No hay prisa: no se despliega hasta la ola 2 y hasta que
existan D07, D11 y D12.

H01 y H06 con el digest de L1. H02 con autorización del titular o gobierno.
H05 con registro canónico, orden autorizada y comprobación de la entrega real.
H04 con exclusión técnica permanente, unicidad global por posición y nullifier
independiente, más revisar la conciliación inicial `A = S0`. H17 comprobando las
dos vigencias. H18 guardando activo y monto. H19 consumiendo la aprobación.
H16 con referencias no enlazables o declarando la correlación. H24 cambiando la
afirmación por una de solvencia y clasificando el superávit.

**Condición de la compuerta G2:** pruebas de invariantes y revisión
independiente de las rutas críticas. **P11:** un tercero ejecuta las 74 pruebas.

---

### L4 · Firmas de verdad en la API

**H03:** digest canónico calculado por el verificador, `crypto.verify` con
Ed25519, registro de firmantes por rol con vigencia y revocación, unicidad de
firmante, separación de funciones, y validación de forma antes que nada.
**P06:** pruebas de revocación frente a attestations tardías y cambios de rol.

Las pruebas de concepto del auditor quedan como pruebas permanentes.

---

### L5 · Un solo contrato de eventos

**H15.** `spec/eventos.json` como fuente única; los ABI y los decodificadores se
comprueban contra él; `BurnExecuted` gana `assetId`; `UnitsMinted` y
`MintExecuted` se unifican; un suministro derivado de eventos parciales se marca
desconocido y nunca se etiqueta `CHAIN_TOTALSUPPLY`.

**Mejora propia:** generar los tipos del indexador desde ese JSON, para que la
divergencia sea imposible y no sólo detectable.

**C01:** en el mismo lote, integrar al contrato interno las propuestas de los
trece documentos de `spec/`, y añadir una prueba que falle si un documento
propone un tipo que el contrato interno no tiene.

---

### L6 · Indexador y reorganizaciones

**H14.** Exigir cabeceras completas de la rama nueva, construir y validar la
transición antes de aplicarla, aplicarla de forma atómica, y comparar identidad
de bloque y no sólo altura. Hashes nulos dan `UNKNOWN_SOURCE`.

---

### L7 · Arranque limpio, concurrencia y conformidad

1. **P09:** fijar y vendorizar el compilador, con huella comprobada, y demostrar
   una compilación sin red.
2. **P10:** escribir el modelo de concurrencia, y probar las carreras que
   importan: dos altas simultáneas, dos alias a la vez, cambio de ruta durante
   una resolución.
3. **C09:** prueba de conformidad entre las máquinas de estado de `spec/` y las
   del código.
4. **C04:** o los fixtures los usan las pruebas, o se retiran.
5. CI que corra el verificador completo en cada empuje.
6. `INVARIANTES.md`: cada invariante comprobable por máquina con su prueba. Es
   lo primero que leerá la próxima auditoría.

---

### L8 · Re-auditoría

1. Actualizar `AFIRMACIONES-A-DESAFIAR.md` con el estado real de cada fila. Una
   afirmación que no resistió **no se defiende: se corrige o se borra.**
2. **P05:** declarar `MANAGED` como supuesto ligado a D18, no como propiedad.
3. **P04:** cerrar lo de keccak, con vectores completos o sustitución.
4. **C10:** la re-auditoría la hace **otro auditor**, no Codex, para no heredar
   sus puntos ciegos. A Codex se le pide sólo lo que esta vez no pudo hacer: las
   74 pruebas de contratos y el verificador oficial.
5. Comparar los dos informes y nombrar lo que siga abierto.

---

## 7 · Qué cambia en el plan maestro

1. **La compuerta G2 sube de exigencia:** «core verificado» pasa a incluir
   pruebas de invariantes y revisión independiente de las rutas críticas.
2. **Compuerta nueva antes de G2:** el patrón de autorización ligada al
   contenido, escrito, especificado y probado en las dos implementaciones.
3. **El orden de la ola 2 se invierte:** primero SDK, después el patrón, después
   contratos. Como estaba, los contratos iban antes y habrían acumulado deuda
   sobre una base equivocada.
4. **Aparece una regla de evidencia:** ninguna evidencia se emite desde un árbol
   con cambios sin commitear.

---

## 8 · Lo que no se hace

- No se despliega nada.
- No se defiende ninguna afirmación refutada.
- No se marca un punto como cerrado sin su prueba en verde.
- No se toca ningún parámetro económico.
- No se sube a `main` hasta que el verificador esté en `VERIFICACION_COMPLETA`.

---

## 9 · Orden y peso

| Lote | Depende de | Peso | Puntos que cierra |
|---|---|---|---|
| L0 proceso | nada | Pequeño, desbloquea todo | H22, C02, C05, C07, P08 |
| L2 SDK | L0 | El más grande útil ahora | 16 puntos |
| L5 eventos y deriva | L0 | Pequeño | H15, C01 |
| L1 autorización | L0 | Mediano, diseño y código | base de 6 P0, P03 |
| L6 indexador | L5 | Mediano | H14 |
| L4 firmas | L1 | Mediano | H03, P06 |
| L7 arranque y concurrencia | L0 | Mediano | P09, P10, C09, C04 |
| L3 contratos | L1, L5 | El más grande, el menos urgente | 10 puntos |
| L8 re-auditoría | todos | Pequeño | P04, P05, P11, C10 |

**Recomendación:** L0, L2 y L5 en el primer tirón. Con eso el proceso deja de
mentir, el SDK queda sano y la integración deja de estar rota. Lo demás después,
con calma.

---

## 10 · La lectura que me llevo

El auditor tiene razón en lo importante, y encontró en los contratos lo que yo
no revisé con suficiente cuidado. Pero el defecto que más me preocupa no es
suyo: es **C02**. Construí un árbol entero alrededor de la idea de que una
afirmación sin evidencia reproducible no vale, y el verificador que emite esa
evidencia no comprueba que el código probado sea el código registrado.

Eso es exactamente el error del 12 de agosto, cuando un clon desfasado borró
funciones de producción, y lo repetí en la herramienta que existía para
impedirlo.
