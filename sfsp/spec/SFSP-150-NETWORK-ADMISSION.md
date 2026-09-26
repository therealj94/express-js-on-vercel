# SFSP-150 · Network Admission (red cerrada)

| Campo | Valor |
|---|---|
| Serie | SFSP-150 · Network Admission |
| Estado | `draft-0.4` (serie nueva, nace del borrador SFSP v0.2 §2.1) |
| Fuente de tipos | Este documento |
| Parte del plan maestro | Fase 3 (prueba en la 5534) y fase 4 (encendido en la 5550) de `../PLAN-SFSP-v0.2-2026-09-23.md` |
| Decisiones que la bloquean | **D07 (firmantes)**, D12 (staging en la 5534), D11 (fuente de release), el manifiesto de despliegue (SFSP-900 §0.2), y la **confirmación del mecanismo que soporta la versión de Besu en operación** |

**Qué NO afirma este documento:** no afirma que la red tenga hoy ningún permiso ni filtro. **No los tiene**: la interfaz de permisos está apagada, el arranque no los configura y cualquier cuenta puede desplegar (aunque desde el génesis no se ha desplegado ningún contrato). No afirma tampoco cuál de los mecanismos de Besu se usará: eso se confirma antes de escribir una línea.

---

## 1 · La regla

**Ningún contrato puede desplegarse en la 5550 sin implementar SFSP.** El protocolo es una condición de la red, no un estándar que se adopta si se quiere.

Consecuencia estratégica, aceptada por el v0.2: **no habrá desarrollo de terceros en la red sin autorización previa.** El sistema gana control y trazabilidad, y renuncia al crecimiento orgánico sin supervisión.

---

## 2 · Dos niveles

| Nivel | Qué controla | Por qué hace falta |
|---|---|---|
| **1 · Lista de cuentas que pueden desplegar** | Quién puede crear contratos | Impide contratos nuevos fuera del protocolo |
| **2 · Filtro de transacciones por destino** | La red acepta solo transacciones dirigidas a (a) contratos registrados en el protocolo, con su clase, serie y Asset Passport, o (b) cuentas y funciones de sistema que el registro habilite expresamente | **Es el que da contenido real al cierre.** El génesis de la 5550 copió 172 contratos de la cadena anterior, y su código sigue en el estado porque en una red Besu en marcha no se puede retirar. Un ERC-20 heredado mueve saldos sin consultar al protocolo: esconderlo en las aplicaciones no impide que se mueva. El filtro lo deja en el estado **sin capacidad de operar**, sin necesidad de un génesis nuevo |

El nivel 1 sin el nivel 2 no cierra nada que ya exista.

---

## 3 · Qué entra al filtro

La lista de destinos admitidos **se deriva del registro de activos** (SFSP-100). No se mantiene una lista a mano:

| Destino | Admitido si… |
|---|---|
| Contrato de un activo | Está registrado con clase, serie y Asset Passport, y su `codehash` coincide con el registrado |
| Contrato heredado en registro transitorio (SFSP-700 §0.2) | Figura en el catálogo publicado por la Junta **y** no ha pasado su bloque de corte |
| Contrato heredado después del bloque de corte | **No admitido**: es así como se bloquea en la migración (SFSP-700 §0.3) |
| Contrato fuera del catálogo | **No admitido** (inactivación) |
| Transferencia simple de ORIGEN entre cuentas | Admitida: ORIGEN es nativo y no tiene contrato |
| Cuentas y funciones de sistema | Solo las que el registro habilite expresamente, con motivo |

---

## 4 · Mecanismo: pendiente de confirmar

> **Confirmado el 26-sep-2026 (falta el ADR):** Besu 26.7.1 ya no tiene permisos
> por contrato, porque se retiraron en 25.6.0. El filtro es un complemento
> (`PermissioningService` / `TransactionPermissioningProvider`). Rige en el pool,
> en la producción y en la importación de bloques. Consulta
> `SFSPNetworkPermissions.transactionAllowed(...)`, la misma interfaz de la opción
> retirada. Detalle, fuentes, ensayo y plan: `../red/RED-CERRADA.md`.

Antes de escribir código, el equipo técnico confirma qué soporta la versión de Besu en operación: el **sistema de permisos del cliente** (por cuenta y, si lo admite, por destino) o un **complemento de validación de transacciones**. La elección se registra en un ADR. Hasta entonces, esta serie describe **qué** debe cumplirse, no **cómo**.

---

## 5 · Orden de encendido

1. **El manifiesto de despliegue completo** (SFSP-900 §0.2): saber qué está desplegado y en qué versión. Sin eso no se puede decidir qué admitir.
2. El catálogo de los 172 contratos con su salida (SFSP-700 §0.2), publicado por la Junta.
3. Prueba completa en la **5534**, incluidos: un ERC-20 heredado que deja de mover saldos, un contrato registrado que sigue operando, ORIGEN nativo que sigue fluyendo y una reversión de emergencia.
4. **Firmantes cargados** (D07).
5. Encendido en la 5550 con el nivel 1. Después, el nivel 2 contrato por contrato, empezando por los que van a inactivación.

---

## 6 · Gobierno

Cambiar la lista de despliegue o el filtro es una **acción de gobernanza**: firma múltiple, código de motivo y registro público (SFSP-800 §0.2). **Un cierre que un solo administrador puede revertir desde una consola no es un cierre.** Todo cambio emite `NetworkPermissionChanged`.

---

## 7 · Pruebas de aceptación de la serie

1. **T-150-01**: Una cuenta fuera de la lista no puede desplegar un contrato.
2. **T-150-02**: Una transferencia de un ERC-20 heredado fuera del catálogo se rechaza en la red.
3. **T-150-03**: Un contrato registrado cuyo `codehash` no coincide con el del registro no es admitido.
4. **T-150-04**: Tras el bloque de corte de una migración, el contrato heredado deja de ser admitido y el conforme sí lo es.
5. **T-150-05**: Una transferencia simple de ORIGEN nativo sigue funcionando con el filtro encendido.
6. **T-150-06**: Un cambio en la lista o en el filtro firmado por una sola llave se rechaza.
7. **T-150-07**: Todo cambio aceptado emite `NetworkPermissionChanged` con su código de motivo.
