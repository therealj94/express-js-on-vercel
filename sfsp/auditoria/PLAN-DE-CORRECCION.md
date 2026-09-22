# Plan de corrección tras la auditoría independiente

**Informe auditado:** Codex, 25 hallazgos (9 P0, 14 P1, 2 P2) sobre el commit
`f1d57a31751f22d9f21060a8b1f945412f80d4bb`.
**Estado de este plan:** para revisión. No se ejecutó ninguna corrección todavía.

---

## 1 · Veredicto sobre la auditoría

La auditoría es buena y hay que tomarla en serio. Verifiqué en el código los
nueve P0 y una muestra de los P1, y **confirmé todos los que revisé**. No es un
informe inflado: son defectos reales, con archivo y línea, y varios de ellos
permitirían mover dinero ajeno si esto se conectara hoy.

También hizo dos cosas que un auditor complaciente no habría hecho: se negó a
certificar las 222 pruebas porque sólo pudo correr 144, y separó lo que probó de
lo que dedujo leyendo.

### Lo que verifiqué yo mismo

| Hallazgo | Verificado | Qué encontré |
|---|---|---|
| H01 gobierno no ligado al contenido | **Confirmado** | `forcedTransfer` comprueba `isActionApproved(operationId)` y nada más. Una aprobación sirve para cualquier origen, destino y monto. |
| H02 `ISSUER` quema saldo ajeno | **Confirmado** | `burn` sólo exige el rol, un motivo y que el `operationId` no se repita. No hay consentimiento del titular ni aprobación de gobierno. |
| H03 aprobaciones sin firma | **Confirmado** | No existe una sola llamada criptográfica en `dbnx-api`. Las firmas son cadenas que nadie verifica. |
| H04 migración congelada reutilizable | **Confirmado** | El nullifier incluye `migrationId`, así que otra migración sobre el mismo origen abre un dominio nuevo. |
| H05 liquidación confía en el operador | **Confirmado** | No hay registro canónico de contratos ni orden firmada que comprometa los términos. |
| H06 autorización por monto | **Confirmado** | El contexto es `bytes32(amount)`. Dos operaciones del mismo monto comparten autorización. |
| H07 clones superficiales | **Confirmado** | `clonar` copia los Map pero comparte los objetos, y `cuentaPorId` devuelve la referencia viva. |
| H08 revalidación incompleta | **Confirmado** | Compara `bindingId` y `version`, no la dirección ni la red. Una fecha inválida da `NaN` y pasa. |
| H09 reservas duplicadas | **Confirmado** | `valorElegibleTotal` no deduplica y no valida que los puntos básicos estén entre 0 y 10000. |
| H12 cobertura imprecisa | **Confirmado** | Trunca el divisor antes de dividir y devuelve `number`. |
| H13 liberación sin inventario | **Confirmado** | No exige `cantidad <= noActivado`. |
| H15 eventos incompatibles | **Confirmado** | El contrato emite `UnitsMinted` y un `BurnExecuted` sin `assetId`; el indexador espera `MintExecuted` y un `BurnExecuted` con activo. |
| H21 parámetro sin aprobación | **Confirmado** | `parametro` sólo comprueba que el valor no sea nulo. |
| H22 verificador indulgente | **Confirmado** | Una suite ausente no marca fallo. |
| H24, H25 | **Confirmados como redacción** | El código hace lo que hace; las frases absolutas son las que están mal. |

### Dos correcciones al informe, y una mía

El informe dice «48 afirmaciones» y tiene razón: son 48, no 38 como dije yo en
el chat. El error era mío.

El informe no pudo correr las 74 pruebas de contratos ni el verificador oficial.
Eso no invalida nada de lo que encontró, pero sí significa que **puede haber más
defectos en los contratos que nadie ha buscado todavía**, porque son justo la
parte que no se ejecutó.

Y una observación que el auditor no hizo: los contratos son la pieza con más
P0 y a la vez la que menos falta hace ahora. Eso cambia el orden del trabajo.

---

## 2 · La raíz común, que vale más que los nueve parches

Siete de los nueve P0 son **el mismo defecto de diseño**:

> La autorización se identifica por una clave débil (un `operationId`, un monto,
> un `migrationId`) en vez de comprometer el contenido exacto de lo que se va a
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

**Esto no se arregla con siete parches.** Se arregla escribiendo una vez el
patrón correcto y aplicándolo en los siete sitios:

```
digest = keccak256(dominio ‖ chainId ‖ contrato ‖ acción ‖ activo ‖
                   partes ‖ montos ‖ nonce ‖ notBefore ‖ expiry)

aprobar(digest)  →  ejecutar(payload) recalcula el digest, comprueba
                    que está aprobado y vigente, y lo consume
```

Si el ejecutor recalcula el digest a partir de los argumentos reales, una
aprobación deja de poder servir para otra cosa. Es una pieza de código, no
siete.

Lo mismo del lado de la API: H03 no es «falta validar mejor», es que **no existe
verificación criptográfica**. Node trae `crypto.verify` con Ed25519 sin ninguna
dependencia. La firma pasa a ser una firma de verdad sobre el mismo digest
canónico, y el digest lo calcula el verificador, no el que firma.

---

## 3 · Reclasificación honesta de la gravedad

El informe usa P0 para «impide conectarse a fondos reales». Correcto. Pero para
ordenar el trabajo hace falta una segunda pregunta: **qué bloquea qué**.

| Clase | Qué significa | Hallazgos |
|---|---|---|
| **Bloquea la siguiente fase** | El SDK es lo que P5 y P6 necesitan. Un defecto aquí frena el trabajo de la semana que viene. | H07, H08, H09, H10, H11, H12, H13, H20, H21, H22, H23, H25 |
| **Bloquea cualquier despliegue** | Contratos. No hacen falta hasta la ola 2, pero sin esto no se despliega nunca. | H01, H02, H04, H05, H06, H16, H17, H18, H19, H24 |
| **Bloquea la integración** | Contratos e indexador no hablan el mismo idioma. | H15 |
| **Bloquea la confianza en el proceso** | Si el verificador miente, ninguna otra evidencia vale. | H22 |
| **Bloquea la API de admisión** | H03 |

Nada de esto es urgente en el sentido de producción, porque **no hay nada
desplegado y no hay una sola cuenta real conectada**. Lo urgente es no construir
encima.

---

## 4 · Los lotes, en orden

Cada lote dice qué toca, qué hallazgos cierra, qué prueba lo demuestra y cuándo
se considera cerrado. El orden importa: L0 primero, porque sin él no se puede
confiar en que los demás estén hechos.

---

### L0 · Convertir el informe en pruebas, antes de arreglar nada

**Por qué primero.** Un hallazgo corregido sin una prueba que lo fije vuelve.
Y el verificador actual puede dar verde con suites ausentes, así que lo primero
es que deje de mentir.

**Qué se hace:**

1. Guardar el informe de Codex en `sfsp/auditoria/informes/` con su commit. La
   auditoría pasa a ser parte del historial, no un adjunto de chat.
2. Crear `sfsp/pruebas-adversarias/`, una suite nueva con **una prueba por
   hallazgo confirmado, escrita para fallar hoy**. Veinticinco pruebas rojas.
3. Endurecer `scripts/verificar-todo.mjs` (H22): una suite ausente falla, cero
   pruebas falla, `--rapido` no puede emitir evidencia, y todos los controles
   corren antes de escribir el registro. Distinguir `VERIFICACION_COMPLETA` de
   `VERIFICACION_PARCIAL`.
4. Añadir la suite adversaria al verificador.
5. Añadir a `AFIRMACIONES-A-DESAFIAR.md` dos columnas: estado de la última
   auditoría y prueba que lo fija.

**Cierre:** el verificador corre, reporta 25 rojas, y el registro de evidencia
dice `VERIFICACION_PARCIAL` con las 25 nombradas. **Ese rojo es el objetivo del
lote**, no un fallo.

**Mejora sobre lo que pidió el auditor:** él pide corregir. Esto además deja
cada defecto encerrado en una prueba permanente, de modo que la próxima
auditoría empieza donde terminó ésta.

---

### L1 · Patrón de autorización ligada al contenido

**Por qué antes que los arreglos sueltos.** Es la raíz de siete P0. Escribirlo
una vez y aplicarlo evita siete parches que se contradigan entre sí.

**Qué se hace:**

1. `spec/SFSP-800` gana una sección normativa: forma canónica del digest, qué
   campos entran, cómo se consume, y la prohibición de autorizar por una clave
   que no comprometa el contenido.
2. `contracts/src/lib/SFSPAuthorization.sol`: construcción y verificación del
   digest tipado, registro de consumo, vigencia.
3. `sdk/src/autorizacion.ts`: la misma construcción del digest en TypeScript,
   con una prueba que compara el digest de las dos implementaciones sobre los
   mismos vectores. Si divergen, falla.
4. ADR-013 que documente el patrón y por qué se rechazó identificar por
   `operationId`.

**Cierra:** la base de H01, H02, H05, H06, H18, H19. No los cierra del todo
hasta L3, pero sin esto L3 no se puede escribir.

**Prueba:** vectores compartidos Solidity/TypeScript; una aprobación para un
payload no sirve para otro que difiera en un solo campo; el segundo uso revierte.

---

### L2 · SDK: los doce defectos que bloquean la fase siguiente

Este es el lote que más importa esta semana, porque el SDK es lo que P5 y P6
consumen.

| Hallazgo | Corrección |
|---|---|
| H07 | Copia profunda en `clonar`, copias defensivas en todo lector público, y validación de invariantes al restaurar: cero o una ruta primaria por cuenta, ningún número reciclado, ningún vínculo revocado revivido. |
| H08 | `revalidarDestino` compara **el destino completo**: cuenta, red, dirección, propósito, vigencia y versión. Validación de esquema y de fecha antes de comparar; una fecha inválida es `UNKNOWN_SOURCE`, no un pase. |
| H09 | Deduplicar por `reserveAssetId`, rechazar puntos básicos fuera de 0 a 10000, y cambiar el modelo de asignación: una reserva asignada pertenece a **una** obligación, no a una lista que se interpreta con ambigüedad. |
| H12 | Aritmética racional exacta con `bigint`, una sola división al final, y devolver `bigint`. Nada de `number` en un camino de dinero. |
| H13 | Exigir además `cantidad <= noActivado`: capacidad económica e inventario técnico son dos comprobaciones, no una. |
| H10 | La correspondencia origen a cuenta pasa a ser parte del directorio, durable y única, no un mapa opcional que el llamador puede olvidar. |
| H11 | `try/finally` para restaurar siempre, y validación y conversión por cuenta dentro del manejo de excepciones, para que un saldo ilegible produzca una excepción estructurada y no aborte el lote. |
| H20 | Cada entrega se asocia a una obligación y un período concretos. Un informe de enero no satisface septiembre. Y el texto explicativo tiene que coincidir con el estado. |
| H21 | `parametro` exige que la decisión esté aprobada y que la versión de política coincida, no sólo que el valor no sea nulo. |
| H23 | Una plantilla emitida no se reparametriza: se crea una revisión nueva en estado pendiente. |
| H25 | Corregir la afirmación B4: limitarla a recuperación de fondos, clave o custodia. La recuperación de acceso sin D19 es correcta y debe poder ofrecerse. |

**Cierre:** las once pruebas adversarias correspondientes pasan a verde, las 48
del SDK siguen verdes, y `tsc --strict` compila sin avisos.

**Mejora propia:** añadir una regla arquitectónica comprobable, «ninguna
referencia viva sale del directorio», con una prueba que mute lo devuelto por
cada lector público y exija que el estado interno no cambie. Eso cierra H07 y
toda su familia futura, no sólo el caso que el auditor encontró.

---

### L3 · Contratos: aplicar el patrón y cerrar el resto

**Cuándo.** Después de L1 y L2. No hay prisa de calendario: no se despliega nada
hasta la ola 2 y hasta que existan D07, D11 y D12.

| Hallazgo | Corrección |
|---|---|
| H01, H06 | Sustituir la aprobación por `operationId` y el contexto `bytes32(amount)` por el digest tipado de L1, recalculado en el ejecutor y consumido una vez. |
| H02 | `burn` exige autorización del titular o decisión de gobierno que comprometa activo, titular, monto y motivo. |
| H05 | Registro de contratos canónicos por `assetId`, orden autorizada que comprometa todos los términos, y comprobación del resultado real de la entrega, no del retorno del contrato. |
| H04 | Exclusión técnica permanente comprobada, unicidad global por posición de origen y nullifier independiente del `migrationId`. Revisar además la conciliación inicial `A = S0`, que es incompatible con «congelado y excluido». |
| H17 | Comprobar a la vez la vigencia de la migración y la del claim. |
| H18 | La reserva guarda activo y monto; cerrarla contra otro activo revierte; un activo desconocido revierte en vez de devolver cero. |
| H19 | `liftPause` consume la aprobación y la liga a la pausa concreta. |
| H16 | Referencias de sujeto no enlazables por propósito, o declarar con precisión la capacidad de correlación en `spec/SFSP-110` y en `privacy/`. |
| H24 | Cambiar la afirmación F7 por una de solvencia, y clasificar el superávit inesperado en la conciliación. |

**Cierre:** las pruebas adversarias de contratos en verde, las 74 existentes en
verde, y un repaso de las rutas que el auditor no pudo ejecutar.

**Mejora propia:** los contratos no se dan por buenos con pruebas propias. Antes
de cualquier despliegue hacen falta pruebas de invariantes y una revisión
independiente de las rutas críticas, escrita en el plan como condición de la
compuerta G2, no como buena intención.

---

### L4 · Firmas de verdad en la API de admisión

**H03.** Hoy no hay ninguna verificación criptográfica. La corrección:

1. Digest canónico calculado por el verificador a partir del payload, nunca
   recibido del firmante.
2. `crypto.verify` con Ed25519, sin dependencias nuevas.
3. Registro de firmantes autorizados por rol, con vigencia y revocación.
4. Unicidad de firmante, separación de funciones comprobada, y rechazo de un
   mismo actor en dos roles.
5. La forma se valida antes que nada: un arreglo con objetos vacíos no es una
   lista de aprobaciones.

**Cierre:** las pruebas de concepto del auditor (`approvals: [{}]`, digest
literal `no-es-el-hash`, mismo actor en dos roles) quedan como pruebas
permanentes y fallan.

---

### L5 · Un solo contrato de eventos

**H15.** La causa es que contratos e indexador se escribieron en paralelo contra
una tabla en prosa. La corrección es que dejen de tener cada uno su versión:

1. `spec/eventos.json` como fuente única: nombre, emisor, campos, tipos.
2. Los ABI de los contratos y los decodificadores del indexador se comprueban
   contra ese archivo en una prueba. Si divergen, falla.
3. `BurnExecuted` gana `assetId`. `UnitsMinted` y `MintExecuted` se unifican.
4. El agregador de suministro respeta la marca de completo: un suministro
   derivado de eventos parciales se marca desconocido, y nunca se etiqueta
   `CHAIN_TOTALSUPPLY` algo que no vino de `totalSupply`.

**Mejora propia:** generar los tipos del indexador desde ese JSON, para que la
divergencia sea imposible y no sólo detectable.

---

### L6 · Indexador y reorganizaciones

**H14.** Exigir las cabeceras completas de la rama nueva, construir la
transición entera y validarla **antes** de aplicarla, y aplicarla de forma
atómica. Una reorganización profunda no puede borrar el historial y después
fallar. La conciliación compara identidad de bloque, no sólo altura; hashes
nulos dan `UNKNOWN_SOURCE`.

---

### L7 · Arranque limpio y disciplina de verificación

1. Fijar el compilador: `solc` con versión exacta y verificación de huella, y
   comprobar que una compilación sin red funciona. Hoy Hardhat lo descarga.
2. `tsc --strict` como parte del verificador, no aparte.
3. CI que corra el verificador completo en cada empuje.
4. `INVARIANTES.md`: la lista de invariantes comprobables por máquina, cada uno
   con su identificador de prueba. Es el documento que la próxima auditoría lee
   primero.

---

### L8 · Re-auditoría

1. Actualizar `AFIRMACIONES-A-DESAFIAR.md` con el estado real de cada fila
   después de las correcciones. Las refutadas se retiran o se reescriben con su
   alcance verdadero: **una afirmación que no resistió no se defiende, se
   corrige o se borra.**
2. Volver a correr la auditoría contra el commit nuevo, con el mismo prompt.
3. Comparar los dos informes. Lo que siga abierto se nombra.
4. Pedirle expresamente al auditor lo que esta vez no pudo hacer: las 74 pruebas
   de contratos y el verificador oficial.

---

## 5 · Qué cambia en el plan maestro

Tres cosas, y conviene decirlas ahora:

1. **La compuerta G2 sube de exigencia.** «Core verificado» pasa a incluir
   pruebas de invariantes y revisión independiente de las rutas críticas. Lo que
   teníamos no alcanzaba, y esta auditoría lo demuestra.
2. **Aparece una compuerta nueva antes de G2:** el patrón de autorización ligada
   al contenido tiene que estar escrito, especificado y probado en las dos
   implementaciones. Sin eso, cualquier contrato que se escriba hereda el
   defecto.
3. **El orden de la ola 2 cambia.** Primero SDK, después el patrón de
   autorización, después contratos. Tal como estaba, los contratos iban antes y
   habrían acumulado más deuda sobre una base equivocada.

---

## 6 · Lo que no se hace

- No se despliega nada. Esto no cambia con las correcciones.
- No se defiende ninguna afirmación refutada. Se corrige el código o se retira
  la frase; discutirla no cierra un hallazgo.
- No se marca un hallazgo como cerrado sin su prueba en verde.
- No se toca ningún parámetro económico: siguen en `null` hasta que existan las
  decisiones.
- No se suben las correcciones a `main` hasta que el verificador esté en
  `VERIFICACION_COMPLETA`.

---

## 7 · Esfuerzo y orden sugerido

| Lote | Depende de | Peso |
|---|---|---|
| L0 pruebas adversarias y verificador estricto | nada | Pequeño, y desbloquea todo |
| L2 SDK | L0 | El más grande de los útiles ahora |
| L1 patrón de autorización | L0 | Mediano, es diseño más código |
| L5 contrato de eventos | L0 | Pequeño |
| L6 indexador | L5 | Mediano |
| L4 firmas en la API | L1 | Mediano |
| L3 contratos | L1, L5 | El más grande, y el menos urgente |
| L7 arranque limpio y CI | L0 | Pequeño |
| L8 re-auditoría | todos | Pequeño |

**Mi recomendación:** L0, L2 y L5 en el primer tirón. Con eso el SDK queda sano,
la integración deja de estar rota y el verificador deja de mentir. L1 y L3
después, con calma, porque son diseño y no hay ninguna prisa real: no hay nada
desplegado ni una sola cuenta conectada.

---

## 8 · La lectura que me llevo

El auditor tiene razón en lo importante. La parte que escribí con más cuidado
—el modelo de cuenta, la migración sin mover nada, la honestidad sobre lo que no
se puede recuperar— resistió casi entera. La parte que salió más rápido, los
contratos, es donde están casi todos los P0, y tienen todos el mismo origen:
autorizar por una etiqueta en vez de por el contenido.

Eso no se arregla con nueve parches. Se arregla con una pieza bien hecha y
aplicada en nueve sitios, y con veinticinco pruebas que impidan que vuelva.
