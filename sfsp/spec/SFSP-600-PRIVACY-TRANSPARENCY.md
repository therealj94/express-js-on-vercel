# SFSP-600 · Privacy & Transparency

| Campo | Valor |
|---|---|
| Serie | SFSP-600 · Privacy & Transparency |
| Estado | `draft-0.3` |
| Fuente de tipos | `CONTRATO-INTERNO.md` §7, §3 |
| Parte del plan maestro | P8-P (privacidad verificable), P7a (Orden Ledger), §2.7, gate G4 |
| Decisiones que la bloquean | **D06 (alcance y diseño de privacidad)**, D13 (jurisdicción y permisos), D14 (retiro de la 8532 y continuidad histórica) |

**Qué NO afirma este documento:** no afirma que exista ninguna capacidad de privacidad implementada, probada o desplegada; ninguno de los dos prototipos está implementado; la privacidad efectivamente demostrada hoy es **ninguna**.

---

## 1 · Línea base: lo legacy transparente sigue siendo observable

Este es el punto de partida y no se suaviza.

1. Los saldos y las transferencias legacy, nativas y ERC-20, **siguen pudiendo observarse** donde la red los exponga.
2. La red actual **no se vuelve confidencial por ocultar un explorador**. Quitar saldos de terceros de una interfaz **disminuye exposición incidental, no privacidad on-chain**.
3. **Publicar commitments de documentos no oculta balances** ya disponibles en el estado público.
4. Un observador con acceso a un nodo o a una copia del estado ve lo que el estado expone, independientemente de lo que muestre cualquier portal.
5. Para el registro legacy transparente se muestra un **aviso explícito** al titular.

### 1.1 Superficies a documentar

Cada una es una vía por la que se observa o se filtra información. Se documentan todas antes de cualquier afirmación de privacidad.

| Superficie | Qué expone |
|---|---|
| RPC público o semipúblico | Estado, saldos, calldata, trazas |
| Calldata y logs | Destinatarios, importes, selectores de función |
| Indexadores | Historial reconstruido y consultable |
| Registros de aplicación (logs) | Identificadores, rutas, errores con datos |
| Copias de seguridad | Todo lo anterior, fuera de la ventana de retención |
| Analytics | Comportamiento, sesiones, correlación con identidad |
| Proveedor de tarjeta | Datos de pago y comercio |
| Operadores | Acceso privilegiado por función |
| Tiempos de bloque y de envío | Correlación temporal entre operaciones |
| Importes | Huella distintiva de un importe poco común |
| Receipts | Resultado y eventos de una operación concreta |

---

## 2 · Qué ve cada actor

Tabla de visibilidad por actor, con propósito, retención y revocación declarados. Esta tabla describe el **objetivo de diseño**; su verificación es el cierre de G4.

| Actor | Ve hoy en legacy transparente | Propósito | Retención | Revocación |
|---|---|---|---|---|
| **Público** | Saldos y transferencias on-chain, eventos, `accountNumber` cuando se comparte, alias | Verificabilidad del ledger | Permanente en cadena | No revocable en cadena |
| **Titular** | Sus posiciones, documentos, derechos, historial, sus bindings | Ejercicio de derechos | Mientras exista la cuenta | No aplica |
| **Operador** | Lo necesario para su función, con bitácora | Operación | Según política, por función | Revocación de acceso por rol |
| **Auditor** | Lo autorizado para un alcance y un periodo, con propósito y bitácora | Auditoría | Duración del encargo | Fin del encargo |
| **Autoridad** | Lo que la solicitud acreditada exija, según jurisdicción | Cumplimiento legal | Según la solicitud | Según la solicitud |
| **Custodio** | Lo relativo a las posiciones bajo su custodia | Custodia | Según contrato | Fin del contrato |

Reglas:

1. **Una auditoría ampliada requiere propósito, permiso y bitácora**, no una llave maestra informal.
2. **No se publican por defecto** vinculaciones de Genesis ID, montos o rutas que rompan un diseño confidencial, ni snapshots de clientes.
3. El directorio cuenta → wallet es privado por defecto; exponer una dirección exige propósito explícito.

---

## 3 · Metadatos y correlación

Lo que no está en el importe puede estar en el metadato.

1. Un **pseudónimo o `commitment` determinista y global correlaciona usuarios**. Donde haga falta un compromiso público se usa aleatorización, y se documenta qué se puede inferir.
2. Un **hash de un dato predecible se puede adivinar**. No se usa como pseudónimo el hash de un dato de baja entropía.
3. **Los agregados pequeños también pueden identificar personas.** Un conteo por jurisdicción, por franja horaria o por producto con pocos sujetos no es anónimo.
4. Se **minimiza el dato público**: lo que no necesita estar en cadena no se pone en cadena.
5. Se **separan las pruebas de validez de los expedientes identificables**. Una prueba de que una condición se cumple no transporta el expediente.
6. Los eventos sensibles se minimizan. Un rechazo por `revert` no deja un log on-chain útil, y su auditoría operativa es separada.
7. La correlación temporal y por importe se evalúa explícitamente en el cierre de G4: qué puede inferir un observador por RPC, calldata, logs, tiempos, importes y receipts.

---

## 4 · Los dos prototipos

P8-P compara **dos diseños nuevos**. **Ninguno está implementado.** Ninguno sustituye de forma automática las cuentas actuales.

### 4.1 Prototipo custodial

Cuentas individuales en un ledger privado con autorizaciones estrictas, cuentas de liquidación agregada en cadena, conciliación de pasivos contra el activo de custodia, y depósitos y retiros consentidos.

| Aspecto | Contenido |
|---|---|
| Qué logra | Reduce la exposición pública de movimientos individuales |
| Qué **no** logra | **No equivale a privacidad criptográfica frente al custodio ni frente a los operadores** |
| Qué **no** hace | **No crea una segunda moneda** |
| Límite operativo | **No se trasladan fondos reales al agregado para hacer una demostración** |
| Requisitos | Conciliación de pasivos y activo, autorizaciones estrictas, consentimiento explícito |
| Estado | **NO implementado** |

### 4.2 Prototipo criptográfico

Dominio criptográfico de transferencias confidenciales con divulgación selectiva.

| Aspecto | Contenido |
|---|---|
| Qué exige definir | Construcción **auditada y seleccionada**, commitments, prevención de doble gasto, pruebas, viewing/access keys, pérdida de claves, revocación y divulgación autorizada, disponibilidad de datos, rendimiento |
| Qué **no** se hace | **No se inventa criptografía.** No se usa una API de cifrado de documentos como prueba de saldos confidenciales |
| Requisito previo a fondos reales | **Auditoría especializada** |
| Estado | **NO implementado** |

### 4.3 Comparación

| Dimensión | Custodial | Criptográfico |
|---|---|---|
| Frente al público | Oculta movimientos individuales | Oculta movimientos individuales |
| Frente al operador o custodio | **No protege** | Protege según la construcción elegida |
| Recuperación | Procedimiento custodial | Requiere diseño de pérdida de claves |
| Divulgación selectiva | Por control de acceso | Por viewing keys |
| Auditoría previa | De controles y conciliación | **Criptográfica especializada** |
| Complejidad de implementación | Menor | Mayor |
| Estado hoy | NO implementado | NO implementado |

---

## 5 · Tessera no es la base

1. **Tessera heredado no es la base de SFSP.** El retiro de esa función está documentado en Besu 25.6.0.
2. Ninguna afirmación de privacidad de SFSP se apoya en transacciones privadas de Tessera.
3. Un despliegue existente que lo use se documenta como línea base histórica, con su estado y su fecha, no como capacidad del protocolo.
4. Si existiera una dependencia operativa, entra en el inventario de continuidad, no en el diseño objetivo.

---

## 6 · Qué se puede anunciar y qué no

Esta sección es la regla de comunicación de la serie.

| Situación | Se puede anunciar | No se puede anunciar |
|---|---|---|
| Hoy, sin D06 y sin prototipos implementados | Registro legacy transparente, con su aviso explícito; minimización de exposición incidental en las interfaces propias | Cualquier forma de privacidad, confidencialidad o anonimato |
| Con el prototipo custodial probado | Que los movimientos individuales no se publican en cadena, y **que el custodio y los operadores sí los ven** | Privacidad frente al custodio. Privacidad criptográfica |
| Con el prototipo criptográfico probado y auditado | Exactamente la garantía que la prueba confirme, con su alcance y sus límites publicados | Nada más allá de esa garantía |
| En cualquier caso | Los límites, qué ve cada actor, y qué puede inferir un observador | Anonimato, imposibilidad de correlación, privacidad perfecta |

Reglas:

1. **Privacidad, respaldo, elegibilidad, finalidad y disponibilidad se anuncian sólo para el alcance efectivamente probado.**
2. **Un hash prueba integridad del dato presentado, no su veracidad externa.**
3. El sistema puede lanzar primero pasaportes legacy transparentes, **sólo sin anunciar privacidad inexistente**.
4. Para lanzar una capacidad confidencial, la prueba debe **confirmar la garantía prometida**. Para lanzar únicamente registro legacy transparente, esa capacidad permanece **apagada** y así se anuncia.
5. Los receipts públicos se diseñan en P8-P. No se publican antes.
6. El gate **G4 sólo habilita la privacidad efectivamente demostrada**, no la diseñada.

---

## 7 · Perímetro de datos

| Dato | Dónde puede estar | Dónde nunca |
|---|---|---|
| Semilla, llave privada | Custodia (KMS/HSM/MPC) | Código, pruebas, registros, evidencia, CI, staging, documentos |
| Datos personales, biometría, documentos | Genesis ID, bóveda cifrada | Cadena, eventos, índice público, evidencia publicable |
| `genesisSubjectRef` | Directorio privado | Ledger, API pública, QR |
| Vínculo cuenta ↔ dirección | Directorio privado, por propósito | Enumeración pública |
| `accountNumber` | Público, es un destino | n/a |
| Alias | Público | Como factor de autenticación |

El tablero público de operación no contiene datos sensibles.

---

## 8 · Parámetros pendientes

| Parámetro | Valor | Decisión |
|---|---|---|
| Alcance de privacidad | `null` | D06 |
| Diseño elegido (custodial, criptográfico o ninguno) | `null` | D06 |
| Construcción criptográfica concreta | `null` | D06 |
| Política de viewing keys y divulgación autorizada | `null` | D06 |
| Retención por tipo de dato y por actor | `null` | D06 / D13 |
| Continuidad y retiro de la 8532 | `null` | D14 |

Mientras D06 esté pendiente, el carril confidencial está **desactivado por defecto** y toda promesa de privacidad devuelve `BLOCKED_DECISION`.

---

## 9 · Pruebas de aceptación de la serie

1. **T22**: Prueba de fuga: se enumera qué puede inferir un observador por RPC, calldata, logs, tiempos, importes y receipts, y se publica el resultado con sus límites.
2. **T23**: Prueba de correlación: dos operaciones del mismo sujeto no quedan vinculadas por un `commitment` determinista; el compromiso público usa aleatorización.
3. **T24**: Prueba de visibilidad por actor: cada actor de la tabla del §2 ve exactamente lo declarado, ni más ni menos, en el entorno de prueba.
4. **T-600-04**: Ningún evento, log, índice público ni artefacto de evidencia contiene PII, biometría ni `genesisSubjectRef`. Ref. T52.
5. **T-600-05**: Ocultar saldos de terceros en la interfaz no cambia lo observable por RPC; la prueba lo demuestra y la interfaz muestra el aviso explícito para legacy. Ref. T22.
6. **T-600-06**: Un agregado por debajo del umbral de k sujetos no se publica; la prueba usa un conjunto sintético con grupos pequeños. Ref. T22.
7. **T-600-07**: Un hash de un dato de baja entropía se invierte por fuerza bruta en la prueba, demostrando que no sirve como pseudónimo. Ref. T22.
8. **T-600-08**: El prototipo custodial permanece desactivado por defecto y ninguna ruta traslada fondos reales al agregado. Ref. T23.
9. **T-600-09**: El prototipo criptográfico permanece desactivado; ninguna ruta usa una API de cifrado de documentos como prueba de saldos. Ref. T24.
10. **T-600-10**: Ninguna documentación ni interfaz generada por este árbol afirma privacidad mientras D06 esté pendiente y el estado de las pruebas sea `NO_VERIFICADO`. Ref. T50.
11. **T-600-11**: Ninguna afirmación de privacidad del árbol depende de Tessera; una búsqueda en la especificación y el código lo confirma. Ref. T22.
12. **T-600-12**: Una solicitud de auditoría ampliada sin propósito, permiso ni bitácora se rechaza. Ref. T51, T53.
13. **T-600-13**: El tablero público de operación no expone ningún dato sensible ni topología interna. Ref. T27, T52.

---

## 10 · Propuestas para el contrato interno

1. **`ActorView`**: declaración de visibilidad por actor (`PUBLIC`, `HOLDER`, `OPERATOR`, `AUDITOR`, `AUTHORITY`, `CUSTODIAN`) con propósito, retención y condición de revocación. Hoy el §7 del contrato interno define el perímetro del dato pero no la vista por actor.
2. **`PrivacyProfile`**: `LEGACY_TRANSPARENT` / `CUSTODIAL_PROTOTYPE` / `CRYPTOGRAPHIC_PROTOTYPE` / `DISABLED`, con su estado de evidencia asociado, para que el pasaporte pueda declarar qué carril aplica.
3. **`MetadataClass`**: clasificación del metadato (`AMOUNT`, `TIMING`, `COUNTERPARTY`, `SELECTOR`, `RECEIPT`, `AGGREGATE`) usada por la prueba de fuga.
4. **`disclosureAccessId`**: identificador de una concesión de acceso ampliado con propósito, alcance, periodo y bitácora.

Ninguna se usa como si existiera hasta que se agregue a `CONTRATO-INTERNO.md`.
