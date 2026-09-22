# ADR-012: perfiles de custodia y recuperación de llaves

- Estado: **PROPUESTA** (bloqueada por D18, D10 y D19)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-130 Account & Key Management
- Decisiones Dxx que lo bloquean: **D18** (arquitectura final de la custodia gestionada), **D10** (custodia canónica, excepciones y recuperación), **D19** (política de recuperación por activo y perfil).

## 1. Contexto

Quién controla la llave determina qué se puede prometer. Tratar a todos los usuarios igual lleva a prometer lo mismo a quien tiene custodia y a quien no, y una de las dos promesas será falsa.

El estado observado de la custodia incluye llaves cifradas y un mecanismo de rotación de contraseña en el código (DECLARADO; topología del firmante, censo actual y excepciones: **NO_VERIFICADO**).

## 2. Decisión

### 2.1 Tres perfiles

**MANAGED.** Un custodio autorizado opera la llave bajo controles reforzados.
- Recuperar acceso a la cuenta no exige cambiar la dirección si la clave sigue disponible.
- **Recuperar acceso nunca exporta la semilla** (T66).
- La recuperación de activos es posible dentro del procedimiento del custodio, con expediente.

**PERSONAL.** El usuario controla su llave y su semilla.
- La capa de identidad puede recuperar la **relación de identidad**.
- **No puede recrear una llave perdida ni mover por sí sola la unidad nativa ni un ERC-20 legacy.**
- La recuperación de activos depende de que el usuario conserve la clave, de un mecanismo contractual autorizado o de una migración previa a un instrumento recuperable.
- Perfil `PERSONAL` con semilla perdida y capacidad `NONE` se muestra como no recuperable (T65). No se ofrece una esperanza que no existe.

**INSTITUTIONAL.** Módulo de seguridad, cómputo multiparte, multifirma y roles.
- **No depende de una frase semilla humana como control único.**
- Los poderes se reparten por rol y quórum.

El perfil **no se infiere** de que exista una semilla en una base de datos. Se clasifica explícitamente, con evidencia.

### 2.2 Por qué el diseño objetivo no mantiene todas las semillas descifrables con una sola contraseña de aplicación

El diseño objetivo de MANAGED **no** conserva indefinidamente todo el material criptográfico descifrable mediante una sola contraseña maestra de aplicación. Razones:

1. **Punto único de compromiso total.** Quien obtenga esa contraseña y una copia de la base obtiene todas las cuentas a la vez. El daño no es proporcional al error.
2. **La contraseña vive donde corre la aplicación**, es decir, en el entorno con mayor superficie de ataque: procesos, variables, volcados de memoria, respaldos, registros, integración continua. Cualquiera de esos canales la filtra.
3. **No hay separación de funciones.** Un solo operador con un solo secreto puede firmar cualquier cosa. No existe la aprobación dual.
4. **Rotar es todo o nada.** Cambiar la contraseña obliga a recifrar todo el universo, y un fallo parcial deja registros ilegibles. La rotación se vuelve tan cara que no se hace.
5. **No hay límite por política.** Un módulo de custodia aplica política de destino, monto, frecuencia y contexto de cuenta antes de firmar. Una biblioteca de descifrado no aplica ninguna.
6. **La evidencia es débil.** Descifrar y firmar en proceso no deja un registro de uso de llave independiente del propio proceso.

Diseño objetivo: llaves en módulo de seguridad o cómputo multiparte, cifrado autenticado versionado, autenticación del contexto de cuenta, firmante aislado con política de destinos y montos, separación de funciones, rotación por partes y respaldo verificado con procedimiento de restauración probado.

**Nada de esto se ejecuta hasta D18.** Y cuando se ejecute: no se mueve ni se recifra material real hasta tener aprobación, respaldo verificado, lote canario y procedimiento de reversión.

### 2.3 Migrar cifrado no es rotar una llave comprometida

Son dos operaciones con disparadores y urgencias distintas (ADR-005, 2.2). La clave de descifrado antigua **no se retira** hasta demostrar cobertura y recuperación de copias y expedientes. Un registro que no descifre conserva el acceso a sus derechos visibles y abre expediente manual. **Nunca se borra un registro para cerrar un porcentaje.**

### 2.4 Verificación de correspondencia

Una expresión regular que acepta doce palabras no acredita que una semilla corresponda a una dirección. La correspondencia se verifica derivando la dirección y comprobando la suma de control contra el esquema aprobado, **sin exponer el material**.

### 2.5 La semilla no es la cuenta

Perder o rotar una clave **no redefine la identidad financiera**. El `accountNumber` no cambia (T62). Pero un rebinding por sí solo no recupera activos legacy si la llave que los controla se perdió y no hay ruta técnica (T64).

### 2.6 Migración inicial sin rotación masiva

Los usuarios actuales conservan dirección, saldos y material criptográfico durante la primera adopción. Primero se crea el identificador de cuenta y su binding. Cualquier cambio de llave o de contrato viene después, por usuario y por activo, con conciliación. **No se exportan semillas durante la migración.**

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Todo custodial con una contraseña maestra de aplicación | Simple de operar y con un punto único de compromiso total, rotación inviable y sin política por firma. Rechazada como diseño objetivo. |
| Todo no custodial | Elimina el riesgo de custodia y traslada al usuario una pérdida irreversible; hace imposible cualquier recuperación de fondos. Rechazada como perfil único. |
| Recuperación social o por umbral entre conocidos | Reduce la dependencia del custodio y añade riesgo de colusión, complejidad de producto y dependencia de terceros no verificados. No descartada; evaluable dentro de D18. |
| Módulo de seguridad o cómputo multiparte para todo, ya | Es el objetivo y hoy es inalcanzable sin D18, presupuesto, proveedor y migración probada. Rechazada como paso inmediato. |
| Tres perfiles con capacidad declarada por par (activo, perfil) (elegida) | Producto más complejo de explicar y matriz de capacidades que mantener. Coste aceptado. |

## 4. Consecuencias

- La interfaz muestra el perfil de custodia y la capacidad de recuperación **antes** de que ocurra un problema.
- Las cuentas gestionadas nuevas a escala quedan bloqueadas hasta D18.
- El censo de custodia se levanta con métricas agregadas, sin extraer llaves. Un fallo de lectura no autoriza recifrar ni sobrescribir un registro.
- Las pruebas de custodia usan material sintético generado en el acto.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| Mientras D18 esté pendiente, el esquema de custodia vigente sigue en operación con sus limitaciones. | Se acepta no tocarlo sin aprobación, respaldo verificado y reversión, porque una migración mal hecha es peor que la situación actual. | Con D18 aprobada y la migración ejecutada por lotes con canario. |
| Existen registros posiblemente no descifrables (DECLARADO, caso histórico). | Se acepta conservarlos con expediente y acceso a derechos visibles. | Al cierre de los expedientes individuales en P5. |
| La clasificación de perfil de las cuentas existentes es NO_VERIFICADA. | Se acepta clasificar explícitamente y marcar `SIN_EVALUAR` mientras tanto, en lugar de inferir. | Al cierre del censo de P5. |

## 6. Bloqueo por decisión Dxx

**D18** bloquea la migración de material criptográfico y las cuentas gestionadas nuevas a escala. **D10** bloquea la custodia canónica, sus excepciones y la recuperación. **D19** bloquea prometer o ejecutar recuperación de activos.

## 7. Estado

**PROPUESTA.** Los tres perfiles están adoptados; su arquitectura de custodia y su política de recuperación no.
