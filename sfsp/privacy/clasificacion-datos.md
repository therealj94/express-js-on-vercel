# Clasificación de datos

**Qué es:** el inventario de qué dato existe, quién puede verlo, para qué, cuánto tiempo se conserva y cómo se revoca el acceso.

**Estado:** propuesta de clasificación. **Ninguna retención está implementada ni verificada** (NO_VERIFICADO). Las retenciones concretas dependen de D13 y de la política de datos aplicable.

**Principio:** el dato mínimo, derivado **por propósito y por audiencia**. No existe una audiencia "todos" ni un propósito "por si acaso".

---

## 1. Audiencias

| Código | Audiencia |
|---|---|
| `PUB` | Cualquiera, incluido un observador anónimo de la cadena |
| `TIT` | El titular del dato |
| `OPE` | Operador de la plataforma, por rol y con bitácora |
| `CUS` | Custodio o proveedor, dentro de su mandato contractual |
| `AUD` | Auditor, con propósito, permiso y bitácora |
| `AUT` | Autoridad competente, mediante requerimiento válido |
| `NADIE` | Ningún sistema ni persona lo ve en claro fuera de su módulo |

---

## 2. Tabla

| Dato | Audiencia | Propósito | Retención | Revocación |
|---|---|---|---|---|
| `accountNumber` | `PUB` | Destino y enrutamiento de pagos | Permanente mientras la cuenta exista; **nunca se recicla** tras cerrarla | No revocable: es público por diseño e inmutable |
| `accountId` | `OPE`, `AUD` | Clave interna del directorio | Vida de la cuenta más el período legal | No aplica; se elimina al purgar la cuenta |
| Alias | `PUB` | Resolución legible por humanos | Mientras esté activo; el historial se conserva para evitar suplantación por reutilización | El titular lo libera; pasa a `RELEASED` con período de cuarentena |
| Vínculo cuenta a dirección | `TIT`, `OPE` por rol, `AUT` por requerimiento | Resolver una ruta técnica para una acción y una red concretas | Historial inmutable de bindings, por auditoría | No se revoca el historial; se revoca el binding, que deja de resolver |
| Dirección on-chain | `PUB` (está en la cadena) | Ejecución de transacciones | Permanente, fuera de control del sistema | **No revocable.** Lo que está en la cadena no se borra |
| Saldos y transferencias on-chain | `PUB` | Funcionamiento de la cadena | Permanente | **No revocable** |
| `genesisSubjectRef` | `OPE` por rol, `AUD` con propósito | Referencia opaca a la identidad | Vida de la cuenta | No se publica **nunca** en el ledger, la API pública ni el código QR |
| Datos personales y documentos de identidad | `TIT`, `OPE` por rol estricto, `AUT` por requerimiento | Verificación de identidad y cumplimiento | Período legal aplicable, después purga | El titular ejerce sus derechos; la purga alcanza también a los respaldos |
| Biometría | `TIT`, `NADIE` más | Autenticación | Mínima; preferiblemente sólo la plantilla en el dispositivo | Revocable por el titular; **nunca en cadena ni en evidencia** |
| Semilla y llave privada | `NADIE` | Firmar | Mientras la llave esté activa | Se revoca rotando; **nunca sale del módulo de custodia** |
| Contraseñas y credenciales de servicio | `NADIE` | Autenticación entre sistemas | Hasta la rotación | Revocación inmediata ante exposición. Ver `runbooks/incidente-secreto-expuesto.md` |
| Perfil de custodia | `TIT`, `OPE` | Determinar qué se puede prometer | Vida de la cuenta | No revocable; cambia con un procedimiento |
| `recoveryCapability` por (activo, perfil) | `TIT`, `OPE` | Que el titular sepa qué es recuperable **antes** de necesitarlo | Versionada | Se actualiza con evidencia |
| Expediente de recuperación (`caseId`) | `TIT`, `OPE` por rol, `AUD` | Trazabilidad de una recuperación | Período legal | No se borra; **sin datos personales en el evento on-chain** |
| Pasaporte de activo | `PUB` | Catálogo, derechos y límites declarados | Permanente, con historial de políticas | No revocable; se versiona |
| Documentos de emisor y expediente de admisión | `OPE`, `AUD`, `AUT`; `PUB` sólo lo que la política publique | Admisión y divulgación | Período regulatorio | Lo publicado no se revoca; se corrige con una publicación nueva |
| Evidencia de reserva | `OPE`, `AUD`, `CUS` | Sostener capacidad | Con vigencia explícita; vencida deja de habilitar | Vence por fecha, automáticamente |
| Órdenes y ejecuciones | `TIT` las suyas, `OPE`, `AUD` | Operación de mercado y supervisión | Período regulatorio | No revocable; es registro de operación |
| Datos de tarjeta | `CUS` (proveedor) | Procesar un pago | **No se conservan.** Se usa la tokenización del proveedor | No aplica: no se guardan. Nunca en registros |
| Registros técnicos | `OPE` | Diagnóstico | Corta, definida y aplicada | Purga por antigüedad; **sin secretos ni datos personales dentro** |
| Analítica de uso | `OPE`, `CUS` (proveedor) | Producto | Corta | Consentimiento revocable; sin identificadores de cuenta en URL ni en eventos |
| Respaldos | `OPE` por rol estricto | Recuperación | Igual o menor que el dato que contienen | La purga del dato debe alcanzar a los respaldos; si no, la retención declarada es falsa |
| `EvidenceRecord` publicable | `AUD`, `OPE`; `PUB` la versión sanitizada | Demostrar qué se probó | Permanente | No revocable. **Sin credenciales ni vínculos entre identidad y dirección** |
| `restrictedEvidenceRef` | `AUD` con permiso | Apuntar a evidencia sensible sin exponerla | Igual que la evidencia referida | Se revoca el acceso, no la referencia |
| Censo y métricas agregadas | `OPE`, `AUD`; `PUB` si la celda no identifica | Operación y transparencia | Según política | **Un agregado pequeño identifica: no se publica sin comprobar el tamaño de celda** |

---

## 3. Reglas que atraviesan toda la tabla

1. **Nada de lo marcado `NADIE` entra jamás** en código, pruebas, registros, evidencia, integración continua, staging ni documentos.
2. **Lo que entra en la cadena no se borra.** Antes de escribir algo on-chain se decide asumiendo que es permanente y público.
3. **Un dato se deriva por propósito.** Si una consulta necesita saber si alguien es elegible, recibe un sí o un no, no el expediente.
4. **Un compromiso público lleva aleatorización.** Un compromiso determinista y global correlaciona personas entre contextos.
5. **La retención se aplica también a respaldos.** Una retención que los ignora no es una retención.
6. **La revocación de acceso no es borrado**, y el borrado no siempre es posible. Se declara cuál de los dos se ofrece por cada dato.
7. **Los datos personales, la biometría y los documentos quedan fuera** de la cadena, de los eventos, del índice público y de la evidencia publicable.
8. **El vínculo entre cuenta y dirección es privado por defecto.** Exponer una dirección exige propósito explícito, y no existe la enumeración pública.

---

## 4. Estado de implementación

| Elemento | Estado |
|---|---|
| Clasificación escrita | esta tabla |
| Retenciones implementadas | **NO_VERIFICADO**, ninguna comprobada |
| Purga que alcanza respaldos | **NO_VERIFICADO** |
| Bitácora de acceso de operador | **NO_VERIFICADO** |
| Tamaño mínimo de celda en agregados publicados | **no definido**, pendiente de D06 |
| Protección contra enumeración del directorio | diseñada, no verificada |

Nada de esta tabla asciende de estado por estar escrito aquí.
