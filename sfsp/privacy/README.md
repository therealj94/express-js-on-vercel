# privacy/

## No hay privacidad implementada

**Esta carpeta no contiene producto. Contiene evaluación.**

No hay código de privacidad, no hay carril confidencial, no hay transacciones privadas y no hay ninguna garantía activa. Lo que hay son cuatro documentos que describen el problema, los dos diseños candidatos y sus límites, para que la decisión **D06** se tome con información y no con expectativas.

| Estado | Valor |
|---|---|
| Privacidad implementada | **NO** |
| Carril confidencial | **desactivado**, no existe |
| Decisión D06 | **PENDIENTE** |
| Compuerta G4 | **abierta** |
| Lo que hay aquí | evaluación, modelo de amenazas y descripción de dos prototipos no implementados |

## Qué es cierto hoy sobre la privacidad del sistema

Marcado según el estado de evidencia del contrato interno.

1. Las transferencias de la unidad nativa y de los ERC-20 son **observables donde la red las exponga**. (DECLARADO por el diseño de la cadena; alcance exacto de la exposición actual: **NO_VERIFICADO**, no hay accesos en este entorno.)
2. **Quitar saldos de terceros de una pantalla reduce la exposición incidental. No reduce la observabilidad on-chain.** Quien tenga un RPC ve lo mismo que antes.
3. **Tessera queda descartado.** El retiro de esa funcionalidad está documentado en Besu 25.6.0 (DECLARADO). No se construye sobre una función retirada del cliente.
4. Publicar compromisos de documentos **no oculta** balances que ya están en el estado público.
5. Un hash prueba integridad del dato presentado. **No prueba veracidad externa y no aporta confidencialidad.** Un hash de un dato predecible se adivina por fuerza bruta.
6. Un compromiso determinista y global **correlaciona a la misma persona entre contextos**.
7. Los agregados pequeños también identifican personas.

## Regla de anuncio

> Una capacidad confidencial se anuncia **sólo** cuando una prueba confirma exactamente la garantía prometida, y **sólo para el alcance probado**.

Mientras exista únicamente registro legacy transparente, esa capacidad permanece apagada y **así se anuncia**. La interfaz muestra un aviso explícito para los activos legacy.

## Contenido

| Archivo | Qué es |
|---|---|
| `amenazas.md` | Modelo de amenazas de metadatos: qué puede inferir un observador por cada canal. |
| `clasificacion-datos.md` | Tabla de dato, audiencia, propósito, retención y revocación. |
| `prototipo-custodial.md` | Diseño de cuenta custodial con liquidación agregada. Garantías reales y límites. |
| `prototipo-criptografico.md` | Diseño de dominio confidencial con divulgación selectiva. Garantías reales y límites. |

Ninguno de los dos prototipos está implementado. Ninguno de los dos se implementa antes de D06.

## Lo que esta carpeta no autoriza

- No autoriza anunciar privacidad de ninguna clase.
- No autoriza mover fondos reales a un agregado de custodia para hacer una demostración.
- No autoriza inventar criptografía. Una interfaz de cifrado de documentos **no** es una prueba de saldos confidenciales.
- No autoriza publicar por defecto vínculos de identidad, ni montos o rutas que rompan un diseño confidencial futuro, ni instantáneas de clientes.
- No autoriza una llave maestra informal de lectura. Una auditoría ampliada requiere propósito, permiso y bitácora.

## Bloqueo

**D06** (alcance y diseño de privacidad; autoridad: producto, seguridad y legal) bloquea el carril confidencial y **toda promesa de privacidad**. **D13** puede añadir requisitos de tratamiento de datos.

Ver `adr/ADR-007-privacidad-alcance-y-prototipos.md`.
