# SFSP-900 · Operations

| Campo | Valor |
|---|---|
| Serie | SFSP-900 · Operations |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §2.5, §3, §4 |
| Parte del plan maestro | P10 (operación, liquidez y continuidad), P1 (manifiesto y trazabilidad), P11 |
| Decisiones que la bloquean | D12 (recursos de staging y aislamiento efectivo), D11 (repositorios y release source), D14 (retiro de la red histórica), D15 (proveedor de pagos y liquidez), D07 (poderes críticos) |

**Qué NO afirma este documento:** no afirma que exista monitoreo desplegado, alertas probadas, respaldos verificados, RPO/RTO medidos ni ningún runbook ensayado; no fija ningún presupuesto, porque se fija tras medir.

---

## 1 · Observabilidad por componente

El monitoreo es **separado por componente**. Una sola señal agregada oculta el fallo que importa.

| Componente | Señales mínimas | Fallo característico |
|---|---|---|
| **Validadores** | Participación por validador, producción de bloques, deriva de reloj, versión | Caída correlacionada, pérdida de quórum |
| **RPC** | Latencia, tasa de error, altura del bloque frente a la del nodo, límites | Respuestas de un nodo atrasado |
| **Indexador** | Checkpoint de bloque y hash, retraso, huecos, tasa de deduplicación | Índice atrasado que un portal sirve como actual |
| **APIs** | Latencia, errores por código, saturación, versión servida | Degradación silenciosa |
| **Base de datos** | Conexiones, replicación, espacio, latencia de escritura, backups | Escritura no durable |
| **Cola / outbox** | Profundidad, antigüedad del mensaje más viejo, reintentos, mensajes muertos | Operaciones atascadas en `UNKNOWN` |
| **Signer** | Disponibilidad, política de destinos y montos, rechazos, rotación | Firma fuera de política |
| **Oráculo** | Freshness, desviación entre fuentes, horarios de mercado, cuarentena | Precio stale servido como vigente |
| **Custodio** | Disponibilidad, conciliación de lotes, vencimiento de evidencias | Evidencia vencida sin alerta |
| **Proveedor de pagos** | Estados de autorización, captura, liquidación, reverso, devolución, disputa; webhooks duplicados | Doble asiento |
| **CashVault** | Capacidad, cobertura, salidas por tipo, autorizaciones consumidas | Distribución por encima de capacidad |

### 1.1 Alertas

1. Cada alerta tiene **dueño, severidad, umbral y runbook**.
2. Las alertas se **prueban sólo con fallos sintéticos**.
3. Una alerta sin runbook no se despliega.
4. Un portal que carga puede estar indexando datos atrasados: la señal de retraso del indexador es obligatoria y se muestra.

### 1.2 Dependencias compartidas

Se identifican explícitamente: cuenta de nube, región, DNS, credenciales, facturación y hardware. Dos servicios en la misma cuenta y la misma región **no son redundancia**.

Con siete validadores, la tolerancia presupone participación y fallos no excesivamente correlacionados. **El conteo no se vende como descentralización demostrada.**

---

## 2 · Conciliación diaria

Conceptos que se concilian **todos los días**, cada uno por separado:

| # | Concepto | Contra qué |
|---|---|---|
| 1 | Suministro nativo | Lectura del nodo a bloque común |
| 2 | Suministro de tokens por activo | `supplySource` declarada en el pasaporte |
| 3 | Inventario de tesorería y del vault | Registro interno |
| 4 | Pasivos de cuentas | Registro custodial |
| 5 | Reservas asignadas y sus vencimientos | Custodios y attestors |
| 6 | Órdenes y ejecuciones pendientes | Journal del OMS y del `SettlementEngine` |
| 7 | Entregas físicas pendientes | Custodio de metal |
| 8 | Tarjetas y POS | Proveedor de pagos |
| 9 | Depósitos multired | Proveedor y cadena de origen |
| 10 | Comisiones cobradas y perdidas | Journal de fees |
| 11 | Operaciones en `UNKNOWN` | Relectura de recibos |

Reglas:

1. Las alertas por cobertura o inconsistencia **bloquean la acción que aumenta el riesgo**.
2. **No borran balances** y **no declaran fallida** una transacción en `UNKNOWN`.
3. **Liquidez usable por moneda y plazo se compara con pagos exigibles bajo escenarios de estrés.** Liquidez operativa y valor de reservas son libros distintos.
4. Toda comparación de cantidades exige **bloque común** y hash por activo y titular.
5. Una diferencia sin explicación abre un expediente, no se cierra por antigüedad.

---

## 3 · Runbooks requeridos

Lista mínima. Un runbook no existe hasta que se ha **ensayado** y el ensayo ha dejado registro reproducible.

| # | Runbook | Disparador |
|---|---|---|
| 1 | Pérdida de un nodo validador | Alerta de participación |
| 2 | Halt de la cadena | Ausencia de bloques nuevos |
| 3 | Oráculo stale o en cuarentena | Alerta de freshness o desviación |
| 4 | Custodio no disponible | Fallo de conciliación o de contacto |
| 5 | Doble webhook del proveedor | Identificador repetido |
| 6 | Corrupción del índice | Hueco o hash divergente en el checkpoint |
| 7 | Recuperación de la base de datos | Pérdida o corrupción |
| 8 | Compromiso de llaves | Detección o sospecha |
| 9 | Rollback de aplicación con compatibilidad de esquema | Fallo de release |
| 10 | Acceso perdido custodial | Solicitud del titular (SFSP-130 §9.1) |
| 11 | Llave o dirección comprometida | Detección (SFSP-130 §9.1) |
| 12 | Wallet externa sin llave | Solicitud del titular (SFSP-130 §9.1) |
| 13 | Operación en `UNKNOWN` y reconciliación | Estado `UNKNOWN` en el journal |
| 14 | Déficit de cobertura del vault | Alerta de capacidad (SFSP-400 §5.2) |
| 15 | Incidente de secreto expuesto | Detección de credencial |
| 16 | Retiro de recursos de una red histórica | D14 aprobada |
| 17 | Interrupción de una migración por lotes | Diferencia o transacción incierta (SFSP-700 §7) |

Reglas:

1. Un runbook nombra: disparador, dueño, pasos, criterios de parada, criterios de reanudación y evidencia a preservar.
2. **Ninguna prueba de un runbook usa una credencial filtrada.**
3. Los simulacros dejan registro con resultados reproducibles.
4. Un runbook de compromiso de llaves **no se cierra** revocando sesiones: exige mover los activos por capacidades reales, o declarar que no existe ruta (SFSP-130 §8).

---

## 4 · RPO y RTO

| Parámetro | Valor | Cómo se fija |
|---|---|---|
| RPO por componente | `null` | Se **mide** en un ensayo de restauración, no se declara |
| RTO por componente | `null` | Igual |
| Ventana de retención de backups | `null` | Política aprobada |
| Frecuencia de ensayo de restauración | `null` | Política aprobada |

Reglas:

1. El ensayo de restauración usa **datos reales sólo en un enclave de recuperación autorizado y aislado**. El staging de agentes recibe **datos sintéticos**.
2. **Cambiar correos no anonimiza** una base con llaves, biometría o movimientos reales.
3. Las copias de prueba se **destruyen** conforme a la política.
4. **Un respaldo de ramas de código no es un respaldo de fondos ni de bases de datos.**
5. **No hay rollback de saldos on-chain** como si fueran una base restaurable.
6. RPO y RTO se fijan **tras la medición**, no por montos o cifras históricas.

---

## 5 · Presupuestos

Todos los presupuestos se fijan **tras medir**. Hoy son `null`.

| Presupuesto | Valor | Decisión o condición |
|---|---|---|
| Patrocinio de gas | `null` | D02, tras medición |
| Coste de infraestructura por componente | `null` | tras medición |
| Coste por operación (gas más servicio) | `null` | D01 / D02 |
| Presupuesto de rendimiento web por versión | `null` | fijado por versión en CI |
| Límites de exposición del OMS | `null` | D08 |
| Liquidez operativa mínima por moneda y plazo | `null` | D15 |

Métricas de experiencia propuestas: LCP <= 2,5 s, INP <= 200 ms y CLS <= 0,1 en el percentil 75 **cuando exista muestra suficiente de campo**. En CI se usan métricas de laboratorio, TBT y un presupuesto fijado por versión. **El INP real no se sustituye por una cifra de una herramienta de laboratorio.**

---

## 6 · Estados de evidencia

```ts
type EvidenceState =
  | 'DECLARADO' | 'CODIGO_LEIDO' | 'PROBADO_AISLADO'
  | 'VERIFICADO_RUNTIME' | 'NO_VERIFICADO' | 'BLOQUEADO';
```

| Estado | Qué acredita |
|---|---|
| `DECLARADO` | Una afirmación de un documento. No acredita capacidad. |
| `CODIGO_LEIDO` | Una capacidad presente en un SHA identificado. No acredita que se ejecute. |
| `PROBADO_AISLADO` | Una prueba reproducible **sin recursos reales**. |
| `VERIFICADO_RUNTIME` | Una comprobación **autorizada** de la instancia efectiva. |
| `NO_VERIFICADO` | Ausencia de evidencia. No es un fallo, es una ausencia. |
| `BLOQUEADO` | Un requisito faltante que impide actuar. |

**Ningún estado asciende por la sola frase «listo».** Un estado sube cuando existe un `EvidenceRecord` con su `testCommand`, su `fixtureId` y su resultado reproducible.

### 6.1 `EvidenceRecord`

Campos según el §2.5 del contrato interno: `evidenceId`, `taskId`, `requirementIds`, `findingIds`, `sourceSHA`, `artifactDigest`, `configVersion`, `environment`, `chainId`, `genesisHash`, `blockNumber`, `blockHash`, `testCommand`, `fixtureId`, `result`, `timestampUTC`, `reviewer`, `limitations`, `restrictedEvidenceRef`.

Reglas:

1. `limitations` **no es opcional en la práctica**: toda evidencia declara qué no cubre.
2. La versión publicable de la evidencia **no contiene credenciales ni vínculos identidad-dirección**.
3. `restrictedEvidenceRef` apunta al material restringido sin incluirlo.
4. Los riesgos aceptados tienen **aprobador y vencimiento**. No se acepta una excepción para falsificar un balance o un derecho.

---

## 7 · Aislamiento

1. Las pruebas destructivas se ejecutan **sólo sobre infraestructura desechable provisionada para esa ejecución**, con permisos y red que impidan el acceso a producción.
2. **No hay bypass por nombre de base ni por variable de entorno.** Se rechaza incluso una URL que se llame `produccion_test`.
3. Se prueba **primero la negativa**, luego la limpieza del recurso sintético.
4. El staging usa llaves sintéticas, bases nuevas, secretos de sandbox, notificaciones redirigidas a un sumidero y egress restringido.
5. Bloqueado por D12 mientras no existan recursos de staging acreditados.

---

## 8 · Manifiesto de servicios

Campos mínimos por servicio: owner, repo, branch, `sourceSHA`, `artifactDigest`, `releaseId`, `configVersion`, entorno, `chainId` y `genesisHash`, dominio, proveedor, almacenes, fuente de secretos, dependencias, backup, RPO, RTO, SLO, alerta y rollback compatible.

Reglas:

1. La **versión pública omite** red interna, credenciales, identificadores sensibles y topología detallada.
2. Un `version.json` o un pie de página son **una pista, no prueba suficiente** sin la unión con el build y el despliegue.
3. **No se decide que un servicio está caído porque no se accedió a él.** Se usa `NO_VERIFICADO` internamente y una etiqueta pública que no induzca disponibilidad.
4. El estado de la API lo aporta un **servicio público minimizado**, no el manifiesto privado completo.

---

## 9 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| RPO y RTO por componente | `null` | tras medición |
| Presupuesto de patrocinio de gas | `null` | D02 |
| Liquidez operativa mínima | `null` | D15 |
| Umbrales de alerta | `null` | tras medición |
| Recursos de staging acreditados | `null` | D12 |
| Release source por servicio | `null` | D11 |
| Retiro de la red histórica | `null` | D14 |

---

## 10 · Pruebas de aceptación de la serie

1. **T27**: El manifiesto de servicios está completo por servicio y su versión pública no expone red interna, credenciales ni topología.
2. **T28**: El ensayo de restauración mide RPO y RTO reales; las copias de prueba se destruyen conforme a la política.
3. **T33**: Un rollback de aplicación es compatible con los esquemas y no revierte transacciones ni borra eventos.
4. **T40**: Un oráculo stale entra en cuarentena, dispara su alerta y bloquea la decisión dependiente con `UNKNOWN_SOURCE`.
5. **T41**: Una evidencia de reserva vencida emite `ReserveExpired`, baja la capacidad y dispara su alerta.
6. **T42**: La conciliación diaria detecta un déficit de cobertura, bloquea la distribución afectada y no modifica ningún balance.
7. **T43**: Una entrega física pendiente figura en la conciliación diaria hasta `DELIVERED` o cancelación acreditada.
8. **T44**: Comisiones cobradas, perdidas y revertidas se concilian por separado y ninguna se infiere de otra.
9. **T45**: Órdenes y ejecuciones pendientes se concilian contra el journal; una ejecución confirmada no aparece como cancelable.
10. **T46**: Un doble webhook del proveedor produce un solo asiento y su alerta correspondiente.
11. **T47**: Un fallo de RPC produce `UNKNOWN`, no cero, y la interfaz conserva la última lectura identificada como desactualizada.
12. **T48**: Una operación en `UNKNOWN` se reconcilia por relectura de recibo y no se reintenta automáticamente.
13. **T49**: Un simulacro de interrupción de lote reanuda desde las confirmaciones y no duplica lo ya confirmado.
14. **T54**: Los recorridos de interfaz son estables en las resoluciones y modos definidos, con teclado, lector de pantalla y movimiento reducido.
15. **T55**: El presupuesto de rendimiento por versión se comprueba en CI con métricas de laboratorio; el INP real no se sustituye por una cifra de laboratorio.
16. **T56**: El tablero público de operación no expone datos sensibles y sus alertas han sido demostradas con fallos sintéticos.
17. **T-900-17**: Una prueba destructiva rechaza un destino llamado `produccion_test` y toda variable de override; se prueba primero la negativa. Ref. T29, T30.
18. **T-900-18**: El indexador expone su retraso y su checkpoint; un portal que sirve datos atrasados lo muestra explícitamente. Ref. T37.
19. **T-900-19**: Cada alerta desplegada tiene dueño, severidad, umbral y runbook; una alerta sin runbook no se despliega. Ref. T56.
20. **T-900-20**: Ningún `EvidenceRecord` publicable contiene credenciales ni vínculos identidad-dirección, y todos declaran `limitations`. Ref. T52.

---

## 11 · Propuestas para el contrato interno

`runbookId`, `ReconciliationRun` y `AcceptedRisk` están integradas en
`../CONTRATO-INTERNO.md` §1 y §2.16 (punto C01 del plan de corrección).

1. **`ServiceManifestEntry`** — **RECHAZADA.** El manifiesto de servicios vive en
   `../deploy/MANIFIESTO.md` y no aparece en ninguna ruta de dinero: no hay dos
   piezas que necesiten acordar su forma.
2. **`AlertDefinition`** — **RECHAZADA.** Es configuración de observabilidad,
   propia de `../runbooks/`. Lo que sí necesitaban varias piezas era el
   `runbookId`, y ése sí se integró.

## 12 · Concurrencia del directorio (P10)

Hasta draft-0.3 no existía modelo de concurrencia en ninguna parte del árbol. La
implementación de referencia del directorio (`sdk/src/directorio.ts`) es en
memoria y de un solo hilo, así que entre la comprobación y la escritura no cabe
nadie y las carreras no pueden ocurrir. El sistema real atiende peticiones a la
vez: ahí sí caben.

El modelo completo, con las carreras una por una y las trece pruebas que las
demostrarían, está en **`scripts/concurrencia.md`**. Esta sección fija lo
normativo.

### 12.1 Regla de origen

> Una invariante que hoy sostiene el hecho de haber un solo hilo, mañana la
> sostiene el almacén durable o no la sostiene nadie.

Derivada, y de aplicación directa: **el código de aplicación no arbitra las
carreras.** No se reserva con una lectura previa; se intenta la escritura, decide
el índice único o la comparación de versión, y el fallo del motor se traduce a un
código del §4 del contrato interno. Comprobar antes de escribir se admite sólo
para dar un mensaje mejor, nunca como mecanismo.

### 12.2 Las carreras y su mecanismo

| # | Carrera | Qué se pierde si nadie la cierra | Mecanismo exigido | Pruebas |
|---|---|---|---|---|
| C1 | Dos altas de cuenta simultáneas | Dos cuentas con el mismo `accountNumber`, o un número ya mostrado entregado a otra persona | Índice único sobre `claveDeIndice(accountNumber)`; el consumo del número se confirma **fuera** de la transacción del alta y no se deshace | T-CONC-01, T-CONC-02 |
| C2 | Dos solicitudes del mismo alias a la vez | Dos alias que se ven iguales resolviendo a cuentas distintas | Único sobre `normalized`; único **parcial** sobre `skeleton` para `ACTIVE`, `RESERVED` y `DISPUTED`; los dos índices en una sola transacción | T-CONC-03, T-CONC-04, T-CONC-05 |
| C3 | Cambio de ruta mientras se resuelve un destino | El dinero va a una dirección que el titular ya no reconoce; dos rutas `PRIMARY` a la vez | Versión optimista (`WHERE version = $n`); único parcial `(accountId, chainId) WHERE status='PRIMARY'`; `UNIQUE (bindingId, version)` en el historial; la revalidación pasa a ser la **condición de la escritura**, no un paso previo | T-CONC-06 … T-CONC-09 |
| C4 | Dos migraciones del mismo censo | Dos cuentas SFSP para la misma cuenta de origen, con dos números ya mostrados | Clave primaria `(censoId, refCuentaOrigen)`; único global por `refCuentaOrigen`; único parcial de corrida `EN_CURSO` por censo; el simulacro corre contra una copia | T-CONC-10, T-CONC-11, T-CONC-12 |
| C5 | El mismo `operationId` dos veces | Un efecto repetido, o un identificador de idempotencia reusado para otra cosa | `operationId` como clave primaria **con huella de la petición**, escrito en la misma transacción que el efecto; huella distinta con el mismo identificador se rechaza con `DENY_AUTHORIZATION` | T-CONC-13 |

### 12.3 Aislamiento

Ninguna de las cinco exige `SERIALIZABLE`: todas se cierran con índices y con
versión optimista bajo `READ COMMITTED`. Subir el nivel de aislamiento para no
tener que pensar el índice correcto queda **prohibido por omisión**: si aparece
una invariante que ningún índice puede expresar, se documenta primero aquí, con
el motivo, y después se sube.

### 12.4 Lo que el adaptador durable no puede hacer

1. Sostener una invariante con una lectura previa.
2. Reintentar en silencio una operación que decide a dónde va el dinero.
3. Devolver un número de cuenta al sorteo por cualquier ruta, incluidas una
   reversión y un simulacro.
4. Escribir los dos índices de un alias en dos transacciones.
5. Dar por válida una prueba de concurrencia que corra en un solo proceso: hacen
   falta conexiones distintas y solapamiento real forzado con puntos de
   sincronización, no con esperas.

### 12.5 Estado

Las trece pruebas `T-CONC-xx` **no existen** y no pueden escribirse hasta que
exista el adaptador durable. Hasta entonces, las invariantes de concurrencia
figuran en `INVARIANTES.md` como **sin prueba**, y ninguna se cuenta como
cerrada. El modelo se escribe antes que el adaptador, para que el adaptador se
escriba contra él y no al revés.
