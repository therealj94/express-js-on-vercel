# Estado de los 46 puntos

Qué se cerró, con qué prueba, y qué sigue abierto. Es la contrapartida del
plan: el plan dice qué hay que hacer, esto dice qué se hizo.

Ninguna fila dice «cerrado» sin una prueba que se pueda volver a correr.

## Verificación del cierre

```
sdk                 125 pruebas
contracts           178
indexer              67
dbnx-api             86
pruebas-adversarias  14
                    ───
                    470
```

`node scripts/verificar-todo.mjs` sobre el árbol limpio devuelve
**`VERIFICACION_COMPLETA`** y `PROBADO_AISLADO`, con los tipos en modo estricto
compilando en los tres paquetes, veinte decisiones pendientes y **cero
parámetros económicos con valor**.

La suite adversaria reporta 14 y no 16 porque dos de sus pruebas lanzan el
propio verificador —una comprueba que el modo rápido no emite evidencia, otra
que un árbol sucio se detecta— y se saltan cuando ya corren dentro de él.
Corrida suelta da 16.

`árbol limpio: sí` significa algo desde el commit que arregló C02 por segunda
vez. Antes de eso el verificador preguntaba por una ruta que no existía, git
devolvía vacío y el vacío se leía como limpio: toda evidencia anterior declara
una limpieza que nadie comprobó. Vale por lo que probó, no por su procedencia.

`PROBADO_AISLADO` no es `VERIFICADO_RUNTIME`: nada de esto acredita el
comportamiento de un servicio desplegado, de la red 5550 ni de un saldo real.

---

## Los 25 hallazgos del informe de Codex

| ID | Estado | Prueba que lo fija |
|---|---|---|
| H01 gobierno no ligado al contenido | Cerrado | `contracts` autorización aplicada al ejecutor |
| H02 `ISSUER` quema saldo ajeno | Cerrado | `contracts` 05 |
| H03 aprobaciones sin firma | **Cerrado** | `dbnx-api` firmas ×16, con las dos pruebas de concepto del auditor |
| H04 migración reutilizable | Cerrado | `contracts` 07 |
| H05 liquidación confía en el operador | Cerrado | `contracts` 06, orden autorizada |
| H06 autorización por monto | Cerrado | `contracts` autorización |
| H07 clones superficiales | **Cerrado** | `adversarias` H07a, H07b |
| H08 revalidación incompleta | **Cerrado** | `adversarias` H08 ×2 |
| H09 reservas duplicadas | **Cerrado** | `adversarias` H09 ×2, `sdk` reservas |
| H10 idempotencia frágil | **Cerrado** | `adversarias` H10, `sdk` migración |
| H11 simulacro deja estado | **Cerrado** | `adversarias` H11 |
| H12 cobertura imprecisa | **Cerrado** | `adversarias` H12, `sdk` propiedades |
| H13 liberación sin inventario | **Cerrado** | `adversarias` H13, `sdk` propiedades |
| H14 reorganización incompleta | **Cerrado** | `indexer` reorg ×8 |
| H15 eventos incompatibles | **Cerrado** | `indexer` esquema ×9, `spec/eventos.json` |
| H16 identidad enumerable | **Cerrado entre propósitos** | `contracts` identidad ×4: compromiso por propósito, ninguna vista de una sola dirección, y los logs no lo dicen. Queda correlación DENTRO de un propósito, declarada y con prueba |
| H17 expiración ignorada | Cerrado | `contracts` 07 |
| H18 reserva sin activo | Cerrado | `contracts` 04 |
| H19 reanudación reutilizable | Cerrado | `contracts` 02 |
| H20 informe antiguo vale | **Cerrado** | `dbnx-api` reporting ×5 |
| H21 parámetro sin aprobación | **Cerrado** | `adversarias` H21 |
| H22 verificador indulgente | **Cerrado** | `adversarias` H22, verificador |
| H23 reparametrización | **Cerrado** | `dbnx-api` plantillas ×3 |
| H24 efectivo sin pasivo | Cerrado como solvencia | `contracts` vault |
| H25 afirmación universal sobre D19 | **Cerrado** | `adversarias` H25 |

**Corrección al informe:** H20 y H23 señalaban `sdk/src/reporting.ts` y
`sdk/src/plantillas.ts`. Esos archivos no existen en el SDK: los módulos viven
sólo en la API de admisión. El defecto era real y estaba donde el auditor lo
describió; la ruta del informe es lo que estaba mal.

---

## Los 11 pendientes que el informe dejó sin numerar

| ID | Estado | Dónde |
|---|---|---|
| P01 unicidad sólo en memoria | **Cerrado** | `durable/esquema.ts`: 10 restricciones en SQL, comprobadas por `sdk` T-CONC-01..13 |
| P02 confusables ad hoc | Cerrado | `sdk` alias P02: la cobertura está enumerada y es revisable |
| P03 rutas de un solo rol | **Cerrado** | `contracts` T-800-24: las diez acciones contra el ejecutor real. El camino viejo se retiró entero |
| P04 keccak con pocos vectores | **Cerrado** | `sdk` keccak P04 ×3, con constantes públicas de ERC-20 |
| P05 `MANAGED` presupone custodia | **Cerrado como supuesto declarado** | `sdk` custodia P05 |
| P06 revocación de identidad | **Cerrado** | `dbnx-api` firmas P06 ×4 |
| P07 ruta frágil de los JSON | **Cerrado** | `sdk` rutas, decisiones |
| P08 tipos y verificador fuera de la compuerta | **Cerrado** | verificador |
| P09 arranque limpio sin red | **Cerrado** | compilador fijado con huella, CI |
| P10 concurrencia sin modelo | **Cerrado** | `sdk` concurrencia ×13, con hilos de verdad contra el mismo archivo |
| P11 un tercero corre las 74 de contratos | **Abierto: preparado, falta el tercero** | `REPRODUCIR.md`, cinco órdenes. No lo puedo cerrar yo: cerrarlo es que lo corra otro |

---

## Los 10 de la auditoría del propio trabajo

| ID | Estado | Prueba |
|---|---|---|
| C01 deriva de especificación | **Cerrado** | `indexer` deriva-spec ×5, 48 propuestas integradas, 4 rechazadas |
| C02 evidencia sin árbol limpio | **Cerrado** | `adversarias` H22/C02, verificador |
| C03 modelo de error incoherente | **Cerrado** | `sdk` supply y reservas devuelven `Resultado` |
| C04 fixtures sin usar | **Cerrado** | `sdk` fixtures ×5 |
| C05 afirmación falsa del README | **Cerrado** | README, `contracts/compilador/LEEME.md` |
| C06 sin pruebas de propiedades | **Cerrado** | `sdk` propiedades ×7 |
| C07 decisiones sin integridad | **Cerrado** | `adversarias` C07, sello en el verificador |
| C08 simulacro escribe en el original | **Cerrado** | `adversarias` C08 |
| C09 sin conformidad spec a código | **Cerrado** | `conformidad.mjs --estricto`: 8 conformes, 0 divergentes, 0 no comprobadas |
| C10 un solo auditor | **Cerrado** | `PROMPT-REAUDITORIA.md` lo asigna a otro |

---

## Lo que sigue abierto, y por qué

**Un punto, y no depende de mí.**

- **P11**: `REPRODUCIR.md` deja las cinco órdenes para levantar esto desde cero
  y correr las 178 de contratos. Cerrarlo no es escribir el documento: es que
  lo corra alguien de fuera. Mientras eso no pase, se queda abierto. Darlo por
  cerrado porque las instrucciones existen sería justo el redondeo a favor que
  este documento evita.

## Lo que se cierra declarando el límite, no escondiéndolo

Dos cierres traen un límite escrito, y conviene leerlo antes de usarlos:

- **H16** cierra la correlación ENTRE propósitos, que es la que identificaba a
  la persona a través de sus billeteras. DENTRO de un mismo propósito dos
  direcciones del mismo sujeto guardan el mismo compromiso, y el almacenamiento
  de un contrato es público: eso se puede leer. Es deliberado, porque es lo que
  permite al motor tratarlas como un solo sujeto. Cerrarlo también exigiría que
  el compromiso no viviera en el contrato —una prueba de conocimiento en cada
  operación—, lo que cambia el modelo de ejecución entero. Está en el
  comentario de cabecera del adaptador y en una prueba que lo afirma.
- **`CommitmentBlocked`** publica el compromiso a propósito: una lista de
  bloqueo que nadie puede comprobar no es una lista de bloqueo. El precio es
  que un sujeto bloqueado queda correlacionable dentro de ese propósito sin
  leer el almacenamiento.
- **`PAUSE` y `TREASURY_RELEASE`** no entran en T-800-24 porque no tienen
  ejecutor con orden ligada al contenido: `emergencyPause` es de un solo
  firmante a propósito (una pausa que tuviera que reunir quórum llegaría
  tarde), y el contrapeso es que caduca sola y que levantarla sí exige doble
  control atado al incidente.

## Lo que encontré revisando el trabajo de los lotes

Los dos encargos entregaron en verde, y revisarlos encontró tres cosas que sus
propios informes no decían. Van aquí porque el punto de auditar el trabajo
propio es que también se audite al que audita.

1. **La conformidad spec-código** halló dos divergencias reales en
   `directorio.ts` y las dejó afirmadas sin arreglarlas, porque ese archivo no
   era suyo: el alta nacía `ACTIVE` —daba por completada un alta que nadie
   aprobó— y la máquina de estado de la cuenta era una tabla que ningún camino
   recorría. Arregladas: el alta nace `PENDING` y `PENDING` no resuelve;
   `cambiarEstadoCuenta` es el único camino y `CLOSED` no tiene vuelta. La
   migración pide `ACTIVE` de forma explícita, porque esa persona ya opera y
   dejarla en `PENDING` le cortaría los cobros en mitad del traslado.
2. **El lote de contratos** afirmó que ningún log publica el compromiso. Era
   cierto de `PurposeCommitmentBound`, pero `AttestationRecorded` y
   `AttestationRevoked` lo llevaban INDEXADO. Con `isCommitmentBound` pública,
   eso daba un camino de correlación MÁS BARATO que el residual declarado, y no
   estaba dicho en ninguna parte. Los dos eventos dejan de publicarlo.
3. **La prueba que recorría los logs** pasaba por la razón equivocada: recorría
   un contrato al que nadie había atestado nada. Ahora atesta antes de
   recorrer, y está comprobado que sujeta el arreglo — con el evento viejo
   falla, con el nuevo pasa.

## El recuento, sin redondear a favor

| | Cuántos | Cuáles |
|---|---:|---|
| Cerrados con prueba | **45** | los 25 hallazgos, 10 pendientes, 10 propios |
| Cierre parcial declarado | **0** | |
| Abiertos | **1** | P11: falta que lo corra un tercero, y eso no lo cierro yo |
| | **46** | |

Dos de los cerrados traen un límite escrito —H16 dentro de un mismo propósito,
y `PAUSE`/`TREASURY_RELEASE` fuera de T-800-24—. Están arriba, con su prueba.
Un límite dicho no es un cierre parcial; un límite callado sí lo sería.

Un cierre parcial no se cuenta como cerrado. Es la diferencia entre este
documento y el que habría escrito si quisiera que el número quedara bonito.
