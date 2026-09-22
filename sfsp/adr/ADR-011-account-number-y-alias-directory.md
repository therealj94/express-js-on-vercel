# ADR-011: Account Number aleatorio y Alias Directory que no autentica

- Estado: **PROPUESTA** (la numeración universal ya está adoptada en `DECISIONES-SFSP.json`; el Alias Directory está bloqueado por D17)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-130 Account & Key Management
- Decisiones Dxx que lo bloquean: **D17** (política de alias: nombres reservados, disputas, cambio y recuperación). Relacionada: D13 para jurisdicción y elegibilidad.

## 1. Contexto

El modelo canónico separa cuatro cosas que suelen confundirse:

```
SFSP Account != Genesis ID != Wallet Address != Private Key/Seed
```

La cuenta necesita un identificador público que sirva como destino de pagos y que dure más que cualquier dirección concreta. Necesita además un identificador legible por humanos, opcional.

## 2. Decisión

### 2.1 El número es aleatorio y no codifica nada

Formato visible: `SF-XXXX-XXXX-XXXX-C`. Los doce dígitos centrales se generan con un generador criptográficamente seguro. **No son un contador.**

El número **no codifica** país, jurisdicción, tipo de persona, nivel de verificación, antigüedad, producto ni ninguna característica de su titular. Razones:

1. **No filtra métricas.** Un número secuencial revela cuántos clientes hay y a qué ritmo crecen, a cualquiera que reciba dos pagos.
2. **No filtra datos de la persona.** Un prefijo de país es un dato personal impreso en un identificador que el usuario reparte en público.
3. **La clasificación cambia; el identificador no.** Un residente cambia de país, un usuario cambia de tipo. Si esos datos están dentro del número, o el número miente o el número cambia. Ambas opciones son inaceptables.
4. **Jurisdicción y elegibilidad se consultan por propósito** en la capa de identidad y cumplimiento, no se leen del número.

Propiedades adicionales:

- **Único** e **inmutable** mientras la cuenta exista.
- **Nunca se recicla**, ni siquiera tras cerrar una cuenta.
- `C` es un dígito de control que detecta errores de digitación. Algoritmo propuesto: Luhn sobre los doce dígitos. `checkDigitCongelado` es **`false`**: se congela en SFSP-130 tras la prueba T58.
- Existe un `accountId` interno aleatorio de alta entropía que **nunca deriva de datos personales**.
- **El número no concede acceso.** Es un identificador de destino y enrutamiento. Conocerlo no permite mover nada.
- Conocer un Account Number **no** permite enumerar públicamente todas las direcciones del mismo titular.

Pruebas asociadas: T57 (generación masiva sin colisiones tras restricción y reintento), T58 (dígito de control), T59 (no secuencialidad y ausencia de datos personales).

### 2.2 El alias no autentica

Un alias es opcional, con la forma `@nombre`, de 3 a 30 caracteres.

**Lo que un alias no hace:**

- **No firma.** No participa en ninguna autorización.
- **No autentica.** No es un factor de acceso, ni parcial ni combinado.
- **No titula.** No prueba propiedad de la cuenta ni de sus activos.
- **No sustituye la verificación de identidad.**
- **No recupera cuentas.**

La razón es simple: un alias es un nombre elegido, cambiable, disputable y suplantable por semejanza visual. Todo lo que se derive de él hereda esa debilidad.

**Lo que sí hace:** resuelve a una cuenta a través de un servicio autenticado y con límite de tasa. El registro mantiene forma mostrada, forma normalizada para unicidad y forma anti confundibles, además de historial. Cambiar el alias **no cambia el `accountNumber`** (T61). Prueba T60: confundibles y nombres reservados.

### 2.3 Orden de resolución de un destino

1. Account Number exacto.
2. Alias confirmado por el usuario.
3. Dirección explícita, en vista avanzada.

Antes de firmar se muestran el nombre o alias y los últimos cuatro dígitos del Account Number. **Nunca se autoriza sólo por nombre.**

Si el receptor necesita una ruta on-chain, el directorio devuelve el binding válido para esa acción y esa red, con vigencia corta e integridad firmada, y **se revalida al ejecutar** para impedir una carrera con un cambio de binding.

### 2.4 El código QR

Contiene versión, `accountNumber` y suma de verificación. **No contiene datos personales.**

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Número secuencial | Filtra volumen y ritmo de altas, permite enumerar cuentas y adivinar destinos. Rechazada. |
| Número con prefijo de país o de tipo de usuario | Imprime un dato personal en un identificador público, y obliga a reemitirlo cuando ese dato cambia. Rechazada. |
| Derivar el número de un hash de datos personales | Correlaciona a la persona entre contextos y es reversible por fuerza bruta sobre un espacio pequeño. Rechazada. |
| Usar la dirección como identificador público | Ata la identidad financiera a una ruta criptográfica que puede perderse o rotarse, y publica el grafo de transacciones. Rechazada. |
| Alias como identificador principal | Cambiable y suplantable; convierte una confusión visual en una pérdida de fondos. Rechazada. |
| Número aleatorio con dígito de control más alias opcional sin valor probatorio (elegida) | El usuario memoriza algo que no significa nada, y hace falta un servicio de resolución disponible y protegido contra enumeración. Coste aceptado. |

## 4. Consecuencias

- Hace falta un servicio de directorio con alta disponibilidad, protección contra enumeración y límite de tasa. Si no responde, la resolución falla con `UNKNOWN_SOURCE`, no con un destino adivinado.
- Hay que manejar colisiones en la generación mediante restricción única y reintento.
- Los números retirados se conservan en una lista de no reutilización, para siempre.
- La pantalla principal muestra el Account Number. La dirección on-chain vive en detalles técnicos.
- El vínculo cuenta a dirección es privado por defecto; exponer una dirección exige propósito explícito.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| Luhn detecta errores de un solo dígito y la mayoría de las transposiciones, pero no todos los errores. | Se acepta como compromiso entre usabilidad y detección. | Con la prueba T58 ejecutada y el algoritmo congelado en SFSP-130, antes de producción. |
| El servicio de resolución es un punto central de disponibilidad y un objetivo de enumeración. | Se acepta con límite de tasa, autenticación y monitoreo. | Al cierre de P5 con pruebas de enumeración. |
| Sin D17, no hay política de nombres reservados ni de disputas. | Se acepta mantener el registro de alias **desactivado públicamente**. | Con D17 aprobada. |

## 6. Bloqueo por decisión Dxx

**D17** bloquea la activación pública de los alias. La numeración no está bloqueada por ninguna decisión pendiente, pero `checkDigitCongelado` es `false` hasta T58.

## 7. Estado

**PROPUESTA** como conjunto, porque incluye el Alias Directory. La parte de numeración universal ya figura entre las decisiones adoptadas y puede implementarse.
