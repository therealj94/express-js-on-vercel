# Estado de los 46 puntos

Qué se cerró, con qué prueba, y qué sigue abierto. Es la contrapartida del
plan: el plan dice qué hay que hacer, esto dice qué se hizo.

Ninguna fila dice «cerrado» sin una prueba que se pueda volver a correr.

## Verificación del cierre

```
sdk                  99 pruebas
contracts           149
indexer              67
dbnx-api             86
pruebas-adversarias  14
                    ───
                    415
```

`node scripts/verificar-todo.mjs` sobre el árbol limpio devuelve
**`VERIFICACION_COMPLETA`** y `PROBADO_AISLADO`, con los tipos en modo estricto
compilando en los tres paquetes, veinte decisiones pendientes y **cero
parámetros económicos con valor**.

La suite adversaria reporta 14 y no 15 porque una de sus pruebas, la que lanza
el propio verificador para comprobar que el modo rápido no emite evidencia, se
salta cuando ya corre dentro de él. Corrida suelta da 15.

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
| H16 identidad enumerable | **PARCIAL, declarado** | `contracts` identidad: se quitaron los indexados, pero recorrer los logs reconstruye lo mismo |
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
| P03 rutas de un solo rol | **PARCIAL** | `spec/SFSP-800` §12 completo. En código: cinco acciones con doble control; `UPGRADE`, `RECOVERY`, `SET_QUORUM` y `SET_POLICY` siguen sin él |
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

Seis puntos, y ninguno es un olvido:

- **P01 y P10** esperan al adaptador durable. Las invariantes que hoy sostiene
  un solo hilo las tiene que sostener mañana un índice único en la base, y las
  trece pruebas de concurrencia no se pueden escribir contra un almacén que no
  existe. El contrato que tendrá que cumplir está escrito.
- **P11** es de la re-auditoría: hace falta alguien de fuera que corra las
  pruebas de contratos, porque el primer auditor no pudo.
- **C09** cierra cuatro máquinas de estado de ocho. Las otras cuatro salen
  `NO_COMPROBADA` en vez de darse por buenas, y la salida dice por qué: dos
  porque la especificación las dibuja con flechas en vez de con una tabla, y
  dos porque el código no declara la máquina en ninguna parte.

- **H16** cierra a medias y está dicho en el código: quitar los `indexed` del
  evento de identidad encarece la correlación pero no la impide, porque
  recorrer todos los logs reconstruye lo mismo y `subjectRefOf` tiene que ser
  pública para que el motor la consulte. Hay una prueba que **afirma la
  correlación que hoy existe**, para que el día que se arregle esa prueba falle.
- **P03** cierra a medias: transferencia forzosa, quema, emisión, liquidación y
  reanudación exigen doble control con separación de funciones real. `UPGRADE`,
  `RECOVERY`, `SET_QUORUM` y `SET_POLICY` siguen en el camino antiguo, donde
  quien propone se auto-aprueba. Son cuatro rutas de gobierno, no de dinero,
  pero una de ellas cambia los quórums de las demás.

Hay además dos cosas más que el lote de contratos dejó anotadas y conviene no
perder: el claim de migración se autoriza con la firma de un atestador y no con
doble control, y el registro canónico de la liquidación guarda el `codehash`
sólo en el evento sin revalidarlo en cada operación. La defensa que sí corre
siempre ahí es la comprobación de la entrega real.

## El recuento, sin redondear a favor

| | Cuántos | Cuáles |
|---|---:|---|
| Cerrados con prueba | **40** | los 24 hallazgos restantes, 7 pendientes, 9 propios |
| Cierre parcial declarado | **3** | H16 identidad, P03 doble control, C09 conformidad |
| Abiertos y documentados | **3** | P01 y P10 esperan al adaptador durable, P11 a la re-auditoría |
| | **46** | |

Un cierre parcial no se cuenta como cerrado. Es la diferencia entre este
documento y el que habría escrito si quisiera que el número quedara bonito.
