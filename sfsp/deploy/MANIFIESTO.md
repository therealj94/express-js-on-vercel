# Manifiesto de despliegue

## 1. Ningún despliegue ocurrió

**No se ha desplegado nada, en ninguna red, desde este árbol.** No hay contratos publicados, no hay direcciones asignadas, no hay parámetros fijados y no hay una sola transacción enviada.

Esta carpeta contiene dos cosas y sólo dos:

| Archivo | Qué es |
|---|---|
| `redes.json` | Las redes **declaradas** en la documentación de origen, con su identificador declarado y la lista de lo que hay que comprobar antes de usarlas. Todas con `estadoVerificado: "NO_VERIFICADO"`. |
| `direcciones.plantilla.json` | La **forma** que tendrá el registro de despliegues. Todos los valores en `null`. |

No hay llaves, no hay endpoints, no hay credenciales y no hay direcciones. **Tampoco hay direcciones de ejemplo**: una dirección escrita en un archivo de despliegue acaba siendo tratada como real por alguna herramienta o por alguna persona.

## 2. Qué significa NO_VERIFICADO aquí

Este entorno **no tiene accesos de red**. No se leyó ningún nodo, no se consultó ningún RPC y no se comprobó ningún hash de génesis.

Por lo tanto:

- Los identificadores de cadena que figuran en `redes.json` son **DECLARADOS** por la documentación de origen. No están confirmados contra un nodo.
- `genesisHash` es `null` porque copiarlo de un documento no lo verifica. Se escribe cuando se lee del nodo.
- `rpc` es `null` porque no se publican endpoints, ni internos ni de ninguna clase.
- El estado de cada red (operativa, de pruebas, congelada) es **DECLARADO**. Que una red esté congelada no se concluye por no haber podido acceder a ella.

## 3. Las cuatro redes declaradas

| Nombre | chainId declarado | Estado | Uso hoy |
|---|---|---|---|
| principal | 5550 | NO_VERIFICADO | Ninguno desde este árbol |
| pruebas | 5534 | NO_VERIFICADO | Ninguno hasta acreditar aislamiento |
| congelada | 8532 | NO_VERIFICADO | Ninguno. No se apaga ni se descarta |
| devnet desechable | sin asignar | NO_VERIFICADO | Único destino admisible para pruebas destructivas, una vez provisionada |

Sobre la red de pruebas: el hardware compartido declarado impide usarla para pruebas de carga o de fallo hasta acreditar aislamiento efectivo. Si no se acredita, se usa una devnet desechable con identificador de cadena propio y llaves nuevas.

Sobre la red congelada: no se apagan nodos, no se reutilizan firmas y no se cuenta una copia como reserva adicional. Antes de cualquier retiro hay que revisar si existen derechos, usuarios externos o vías de cobro activas, y documentar el corte y la desactivación efectiva de toda vía de doble reclamación.

## 4. Aprobaciones necesarias antes de cualquier despliegue

Hacen falta las tres. No es una lista de preferencias.

### D11: repositorios y fuente de release por servicio

**Autoridad:** tecnología. **Estado:** PENDIENTE.

Bloquea la escritura y el despliegue sobre una copia cuya procedencia sea dudosa, y la creación del repositorio nuevo. Se observaron dos árboles capaces de compilar y publicar el mismo backend, y cuál produce el artefacto servido es NO_VERIFICADO. Desplegar antes de D11 es desplegar sin saber desde dónde. Ver `adr/ADR-003-fuente-canonica-por-servicio.md`.

### D12: recursos de staging y aislamiento efectivo

**Autoridad:** operaciones y seguridad. **Estado:** PENDIENTE.

Bloquea las pruebas integradas o destructivas. Sin aislamiento acreditado (red, credenciales, almacenamiento, facturación) una prueba puede alcanzar recursos productivos. Ningún nombre de base de datos ni variable de entorno habilita un bypass: se prueba primero que el acceso a producción está denegado, y después se limpia el recurso sintético.

### P11: compuerta obligatoria de cada release

**Estado:** no existe ninguna autorización emitida.

Aplica a cada ola y a cada artefacto, incluidos contratos, registros, banderas, APIs y parámetros financieros. Exige `releaseId`, propietario, alcance, `sourceSHA`, `artifactDigest`, `configVersion`, entorno, pruebas, artefacto de reversión **verificado**, aprobación humana con límites y caducidad, canario y cierre documentado. Ver `runbooks/release-p11.md`.

**La autorización P11 tiene alcance y caducidad. No habilita la siguiente release.**

## 5. Decisiones que además bloquean contenido, no sólo el acto de desplegar

Aunque D11, D12 y P11 se resolvieran, siguen bloqueados por contenido:

| Decisión | Qué impide desplegar o activar |
|---|---|
| D01, D02 | Precio y comisión: cualquier contrato o servicio que los consuma |
| D03 | Vault de release de la unidad nativa y toda afirmación de respaldo |
| D04 | Capacidad de reserva distinta de cero |
| D05 | Serie redimible de commodity |
| D06 | Cualquier componente del carril confidencial |
| D07 | Quórums, pausa, actualización y recuperación fuera de fixtures sintéticos |
| D08 | Clasificación y derechos por activo |
| D09 | Cada migración por activo |
| D18, D19 | Custodia gestionada a escala y recuperación de activos |

Un despliegue que dependa de un valor `null` de `DECISIONES-SFSP.json` devuelve `BLOCKED_DECISION`. **No se elige un valor por defecto para poder desplegar.**

## 6. Qué hay que verificar antes de escribir una sola entrada real

1. Versión exacta del cliente y compatibilidad con el EVM target compilado. No se asumen opcodes de una versión reciente.
2. `chainId` y `genesisHash` leídos del nodo, no copiados de un documento.
3. Reglas de emisión y de gas vigentes, incluida la recompensa por bloque. No se supone que sea cero.
4. Censo de validadores efectivamente participantes y sus dependencias compartidas.
5. El runtime bytecode leído de la cadena comparado con el de la build, considerando parámetros e inmutables. **Un SHA de fuente no es un hash de bytecode. `eth_getCode` distinto de `0x` no prueba equivalencia.**
6. Roles, poderes administrativos y ruta de actualización de cada contrato desplegado.
7. Revisión independiente de los caminos críticos, por alguien distinto del autor.

## 7. Prohibiciones de esta carpeta

- Nada de llaves, semillas, contraseñas ni credenciales.
- Nada de endpoints privados ni de topología de red interna.
- Nada de direcciones reales, ni de contratos legacy ni de personas.
- Nada de direcciones de ejemplo o inventadas.
- Nada de vínculos entre cuenta y dirección.
- Nada de valores económicos.
