# ADR-007: privacidad; ocultar una pantalla no es privacidad

- Estado: **PROPUESTA** (bloqueada por D06)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-600 Privacy/Transparency
- Decisiones Dxx que lo bloquean: **D06** (alcance y diseño de privacidad). Relacionada: D13.

## 1. Contexto

La red actual expone estado. Las transferencias nativas y ERC-20 son observables donde la red las exponga: por RPC, por el indexador, por los logs de eventos y por cualquier réplica.

Existe una expectativa de "privacidad" heredada de la presencia de Tessera en la pila histórica. **El retiro de esa funcionalidad está documentado en Besu 25.6.0** (DECLARADO por el plan maestro; versión efectiva del cliente en la red: **NO_VERIFICADO**). Tessera heredado no es la base de SFSP.

## 2. Decisión

### 2.1 Lo que no cuenta como privacidad

- **Quitar saldos de terceros de una pantalla pública reduce exposición incidental. No reduce la observabilidad on-chain.** Quien tenga un RPC sigue viendo lo mismo.
- Publicar compromisos de documentos no oculta balances que ya están en el estado público.
- Un hash prueba integridad del dato presentado, no su veracidad externa ni su confidencialidad. Un hash de un dato predecible se adivina por fuerza bruta.
- Un compromiso determinista y global correlaciona personas entre contextos. Donde haga falta un compromiso público se usa aleatorización, y se documenta qué se puede inferir.
- Agregados pequeños también identifican personas.

### 2.2 Tessera queda descartado

No se construye sobre una función retirada del cliente. No se reintroduce por una vía lateral.

### 2.3 Dos prototipos, evaluados, no implementados

**Prototipo custodial:** cuentas individuales en un ledger privado con autorizaciones estrictas, cuentas de liquidación agregada en cadena, conciliación entre pasivos de cuentas y activo de custodia, y depósitos y retiros consentidos.
Garantía real: reduce lo que ve un observador externo de la cadena.
Límite: **no es privacidad frente al operador ni frente al custodio**, que ven todo. No crea una segunda moneda. No se trasladan fondos reales al agregado para hacer una demostración.

**Prototipo criptográfico:** un dominio de transferencias confidenciales con divulgación selectiva.
Garantía real posible: confidencialidad de importes y de partes frente al observador de la cadena, con divulgación autorizada.
Límite: exige seleccionar una construcción auditada, definir compromisos, prevención de doble gasto, pruebas, claves de visualización y de acceso, pérdida de claves, revocación y divulgación autorizada, disponibilidad de datos y rendimiento. **No se inventa criptografía.** Una API de cifrado de documentos no es una prueba de saldos confidenciales. Requiere auditoría especializada antes de cualquier fondo real.

Ninguno de los dos sustituye automáticamente las cuentas actuales.

### 2.4 Regla de anuncio

Una capacidad confidencial sólo se anuncia si una prueba confirma exactamente la garantía prometida y para el alcance probado. Si sólo hay registro legacy transparente, esa capacidad permanece apagada y así se anuncia.

### 2.5 Entregables del carril de privacidad

Modelo de amenazas de metadatos, clasificación de datos por audiencia y propósito, protocolo de acceso, prueba de fuga y la decisión D06. Viven en `privacy/` como evaluación, no como producto.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Mantener Tessera o una variante de transacciones privadas del cliente | Construir sobre una función retirada del upstream: sin soporte, sin parches y con migración forzada más adelante. Rechazada. |
| Ocultar el explorador público y anunciar privacidad | Coste de ingeniería casi nulo y afirmación falsa. Cualquiera con un RPC la desmiente. Rechazada. |
| Prototipo custodial como solución definitiva | Traslada toda la confianza al operador, concentra datos y responsabilidad, y no resiste un modelo de amenazas con insider. Aceptable como paso intermedio sólo si se anuncia como lo que es. |
| Prototipo criptográfico ya | Exige selección tecnológica, auditoría especializada, diseño de recuperación de claves y presupuesto de rendimiento que hoy no están. Rechazada como primer paso. |
| Evaluar ambos y no implementar ninguno hasta D06 (elegida) | La compuerta G4 permanece abierta y la plataforma se lanza sin privacidad, diciéndolo. Coste aceptado. |

## 4. Consecuencias

- El carril confidencial está **desactivado por defecto** y no hay código de producción en `privacy/`.
- La interfaz muestra un aviso explícito para activos legacy: sus transferencias son observables.
- Los recibos públicos se diseñan dentro del carril de privacidad, no antes.
- Una auditoría ampliada de datos requiere propósito, permiso y bitácora. No existe una llave maestra informal de lectura.
- Los datos personales, la biometría y los documentos quedan fuera de la cadena, de los eventos, del índice público y de la evidencia publicable.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| Los metadatos actuales (RPC, logs, tiempos, importes, recibos, backups, analítica, proveedor de tarjeta) permiten inferencias hoy. | Se acepta operar con transparencia declarada mientras se documenta qué se infiere. | Al cierre del modelo de amenazas, `privacy/amenazas.md`, y con D06 aprobada. |
| Existe expectativa pública de privacidad por la presencia histórica de Tessera. | Se acepta corregir la comunicación. | Inmediato en documentación; revisión al cierre de P8-P. |
| Un compromiso público ya publicado pudo ser determinista. | Se acepta revisar los compromisos existentes antes de publicar más. | Antes de publicar cualquier compromiso nuevo. |

## 6. Bloqueo por decisión Dxx

**D06** bloquea el carril confidencial y **toda promesa de privacidad**. **D13** bloquea actividades que requieran autorizaciones no acreditadas y puede imponer requisitos adicionales de tratamiento de datos.

## 7. Estado

**PROPUESTA.** El descarte de Tessera es firme; la elección de diseño espera a D06.
