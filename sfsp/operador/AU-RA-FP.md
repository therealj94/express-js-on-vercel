# AU-RA FP · el operador del protocolo

| Campo | Valor |
|---|---|
| Estado | `draft-0.3` · diseño + implementación de referencia en `sdk/src/operador/` |
| Nombre anterior | **ULTRON FP**. Se cambia porque «Ultron» es una marca de un tercero. |
| FP | *Financial Protocol* |
| Decisiones que lo bloquean | **D20** (marca AU-RA FP), **D21** (estructura societaria y contratos de servicio), D07, D11, D12 |
| ADR | `adr/ADR-014-au-ra-fp-operador-del-protocolo.md` |

**Qué NO afirma este documento:** no afirma que AU-RA FP exista como sociedad, que tenga contratos firmados con ninguna empresa, que el nombre esté libre como marca, ni que ninguna app del ecosistema esté conectada a él. Todo eso está pendiente y así se marca.

---

## 1 · En una frase

**AU-RA FP es quien opera el protocolo SFSP para todas las empresas del ecosistema:** les presta los servicios (directorio, portero, pasaportes, liquidación, conciliación…) y comprueba que cada una cumpla las reglas. **Opera y comprueba; no aprueba nada monetario.**

Esa última parte no es un detalle. Es la regla de SFSP-800 que ya existía para Ultron, y es lo que permite que el operador sea el mismo para todos sin convertirse en juez y parte.

---

## 2 · Quién es dueño de qué

| Empresa | Es dueña de | Papel en SFSP |
|---|---|---|
| **Orden Global** | Veta Wallet · la cadena 5550 · la tesorería de ORIGEN | Cliente de AU-RA FP. Su Junta aprueba lo que es suyo (p. ej. liberar tesorería). Opera sus nodos. |
| **AuCorp** | Ordenex · la plataforma fiat AuCorp | Cliente de AU-RA FP. Lista y liquida; concilia fiat contra la cadena. |
| **DBNX** | — (empresa aparte) | **Auditor y fuente de datos**, al estilo de CoinMarketCap: admite activos, emite pasaportes, califica riesgo, verifica suministro y reservas, publica los datos. |
| **AU-RA FP** | los servicios del protocolo · los canales de la asistente AU-RA | **Operador.** Presta los servicios a todos y vigila el cumplimiento. |

**Por confirmar (D21):** quién es dueño de AU-RA FP, de Genesis ID, de MyTokenPay, de ordenscan.com, de PULSE2CHAT y de la cadena 8532. En el código figuran como `POR_CONFIRMAR` y ningún servicio depende de adivinarlo.

### 2.1 Por qué importa quién es dueño

Porque decide quién no puede hacer qué. Si AuCorp es dueña de Ordenex, AuCorp no puede decidir qué activos son aptos para listarse en Ordenex: eso lo hace DBNX. Si Orden Global es dueña de la tesorería, Orden Global no puede certificar sus propias reservas: eso lo hace DBNX o un custodio. Y si el día de mañana AU-RA FP fuera de la misma sociedad que alguna de ellas, sus informes de cumplimiento sobre esa empresa los tiene que revisar alguien de fuera.

---

## 3 · Cómo entra una empresa (alta)

```
 1. Genesis ID corporativo        la empresa se identifica; sus datos no salen de Genesis ID
 2. Contrato de servicio          qué servicios usa, con qué alcance, con qué niveles de servicio
 3. Cuentas SFSP operativas       cuentas SF- de la empresa, que nacen PENDING
 4. Firmantes                     quién firma por ella en las acciones de doble firma (D07)
 5. Credenciales por servicio     una por servicio y por entorno; alcance mínimo; rotables
 6. Primer informe de cumplimiento  todo NO_VERIFICABLE hasta que haya evidencia
 7. Alta aprobada                 las cuentas pasan a ACTIVE; empieza a operar
```

Una empresa **sólo** puede llamar a los servicios que tiene contratados. Llamar a otro no es un error de configuración: es un `DENY_AUTHORIZATION`.

---

## 4 · Los servicios

| # | Servicio | Qué hace | Gobierna | Quién lo usa |
|---|---|---|---|---|
| S01 | Directorio de cuentas | Alta, número, alias, rutas, resolución que caduca | SFSP-130 | Veta Wallet, Ordenex, MyTokenPay, PULSE2CHAT |
| S02 | Portero | Decide cada operación y dice por qué | SFSP-120 | Veta Wallet, Ordenex, MyTokenPay |
| S03 | Registro de pasaportes | Lectura para todos; **escritura sólo DBNX** | SFSP-100 | todos leen · DBNX escribe |
| S04 | Liquidación entrega contra pago | Las dos partes o ninguna | SFSP-500 | Ordenex |
| S05 | Comisiones | Cotización con fecha y versión; asiento aparte del pago | SFSP-500 §5–7 | Veta Wallet, Ordenex, MyTokenPay |
| S06 | Suministro y tesorería | Calcula lo liberable; **la Junta dueña aprueba** | SFSP-400 | Orden Global |
| S07 | Reservas y cobertura | Calcula la cobertura; **las atestaciones las da DBNX o un custodio** | SFSP-300/400 | Orden Global, DBNX |
| S08 | Lector de la cadena | Índice de eventos, con reorganizaciones | indexer | ordenscan, DBNX |
| S09 | Migración y conciliación | Registrar sin mover; la balanza | SFSP-700 | Orden Global, AuCorp |
| S10 | Registro de autorizaciones | El «sobre sellado» de la doble firma; **no firma** | SFSP-800 | todas |
| S11 | Conciliación de pagos externos | Fiat y tarjeta contra la cadena; aviso doble = un asiento | SFSP-500 §9 · SFSP-900 | AuCorp, MyTokenPay |
| S12 | Monitor de cumplimiento | Informe por empresa: cumple, incumple, no verificable | este documento | todas · lo revisa DBNX |
| S13 | Asistente AU-RA | Explica, alerta, prepara análisis. **Nunca aprueba.** | SFSP-800 | Juntas, clientes (WhatsApp y app) |
| S14 | Copiloto de admisión | Revisa expedientes y señala inconsistencias. **Nunca aprueba.** | SFSP-800 | DBNX |

### 4.1 Qué recibe cada empresa

**Orden Global**
- *Veta Wallet* → S01, S02, S05, S13. Los usuarios mandan a `SF-…` o `@alias`; el portero decide antes de firmar.
- *Tesorería* → S06, S07, S10. AU-RA FP calcula cuánto se puede liberar; la **Junta de Orden Global** lo aprueba; DBNX o el custodio dan fe de las reservas. Tres partes distintas.
- *Cadena 5550* → S08, S09. Orden Global opera sus nodos; AU-RA FP **no toca** los nodos.

**AuCorp**
- *Ordenex* → S02, S03 (lectura), S04, S05. Sólo lista lo que el pasaporte permite; toda operación liquida entrega contra pago.
- *Plataforma fiat* → S11, S09. Cada entrada y salida de fiat se concilia con la cadena antes de darse por hecha.

**DBNX**
- S03 (escritura), S07 (atestaciones), S08, S14, y la revisión de S12.
- Publica los datos públicos de cada activo —estado, suministro verificado, riesgo— al estilo de CoinMarketCap. **El dato público de un activo no lo publica quien lo emite ni quien lo lista.**

---

## 5 · Cómo asegura que se cumpla SFSP

Tres capas, de la más fuerte a la más débil:

1. **Por construcción.** Los servicios mismos se niegan: el directorio no resuelve una cuenta PENDING, el portero no deja pasar un «no sé», Ordenex no puede escribir un pasaporte. Aquí no hay nada que vigilar porque no hay nada que saltarse.
2. **Por separación de funciones.** Reglas del §6, comprobadas en código (`operador/separacion.ts`) antes de conceder un permiso.
3. **Por vigilancia.** Lo que no se puede impedir por construcción se comprueba con evidencia (`operador/cumplimiento.ts`) y queda en un informe por empresa.

### 5.1 El informe de cumplimiento

Cada comprobación declara **qué evidencia necesita**. Resultado:

| Estado | Cuándo |
|---|---|
| `CUMPLE` | La evidencia está, está vigente, y cumple. |
| `INCUMPLE` | La evidencia está y muestra el incumplimiento. |
| `NO_VERIFICABLE` | Falta la evidencia, o está vencida. **Nunca se convierte en `CUMPLE`.** |

El informe de una empresa es `INCUMPLE` si alguna comprobación incumple; si no, `NO_VERIFICABLE` si falta alguna; y sólo si todas cumplen, `CUMPLE`. Un informe de hoy sin evidencia sale entero `NO_VERIFICABLE`, que es lo honesto.

---

## 6 · Reglas de separación

| # | Regla | Por qué |
|---|---|---|
| R1 | AU-RA FP y sus asistentes **no aprueban nada monetario** | SFSP-800. Operar y aprobar en la misma mano es no tener control. |
| R2 | **Sólo DBNX escribe pasaportes** | Quien lista o emite no decide si su activo es apto. |
| R3 | **Quien emite un activo no lo admite ni lo audita** | Conflicto de interés directo. |
| R4 | **Quien opera no se audita a sí mismo** | El informe de cumplimiento de AU-RA FP lo revisa DBNX o un auditor independiente. |
| R5 | **La tesorería necesita tres partes distintas**: aprueba la dueña, calcula y ejecuta el operador, da fe de las reservas un tercero | Nadie se autoriza, se calcula y se certifica a sí mismo. |
| R6 | **Una empresa sólo usa lo que contrató**, con credenciales propias y alcance mínimo | Un servicio no contratado es `DENY_AUTHORIZATION`. |
| R7 | **Ninguna empresa ve datos de clientes de otra** | Entre Veta Wallet y Ordenex sólo viaja un número de cuenta SFSP, nunca el Genesis ID. |
| R8 | **Sin evidencia, no se cumple** | `NO_VERIFICABLE` nunca es `CUMPLE`. |

---

## 7 · Lo que queda fuera, dicho

- **El nombre AU-RA choca consigo mismo.** Ya existe *AU-RA, la asistente* de WhatsApp y de la app. Se asume que pasa a ser el canal público de AU-RA FP (servicio S13), no un producto aparte. Si no es así, hay que elegir otro nombre para uno de los dos.
- **«AU-RA» también necesita revisión de marca** (D20), igual que SFSP (D00). Cambiar de un nombre ajeno a otro sin revisar es repetir el problema.
- **Ninguna empresa está dada de alta.** El registro del código es un modelo con la estructura que dio la dirección, no un contrato.
- **La infraestructura sigue llamándose Ultron** (variables `ULTRON_*`, dominio, servicio de Render, paquete de la APK). Renombrarla es una migración aparte: ver `ULTRON-APP/docs/RENOMBRE-AU-RA-FP.md`.
