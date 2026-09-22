# ADR-004: modelo de precio y de comisión; el objetivo de costo por operación no se promete contra el gas

- Estado: **PROPUESTA** (bloqueada por D01 y D02)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-400 Monetary, SFSP-500 Settlement/Fees
- Decisiones Dxx que lo bloquean: **D01** (política vigente de precio y sus consumidores), **D02** (alcance del objetivo de costo, mínimos y patrocinio de gas). Relacionadas: D03, D15.

## 1. Contexto

Existen dos módulos de precio que permiten un modo fijo y un modo referenciado a oro; el modo fijo es el valor por defecto del código (DECLARADO; configuración efectiva en el servicio publicado: **NO_VERIFICADO**).

La comisión es configurable y, sin variable definida, devuelve cero (DECLARADO; cobro realmente vigente: **NO_VERIFICADO**).

Existe un objetivo comercial de costo bajo y fijo por operación SFSP. El plan lo enuncia como objetivo; su alcance no está aprobado.

Ningún valor económico se escribe en este árbol. `parametrosEconomicos` en `DECISIONES-SFSP.json` está en `null` y así permanece.

## 2. Decisión

1. **Precio y comisión son libros distintos.** El precio de referencia de una unidad, la cotización de ejecución, la valuación de reservas y la liquidez disponible son cuatro magnitudes separadas y así se nombran en el oráculo. No se derivan unas de otras por comodidad.
2. **Una sola política de precio por consumidor, versionada.** Cada consumidor de dinero (depósito multired, venta, swap, tarjeta, POS, reservas, API, interfaz) declara qué política consume y en qué versión. Mientras D01 esté pendiente, no se modifica la configuración de modo ni el valor de referencia, y los consumidores que dependan de ella devuelven `BLOCKED_DECISION`.
3. **El objetivo de costo por operación no se promete contra el gas.** El gas lo fija la red y varía; el objetivo comercial sólo puede referirse a la comisión del servicio, o al total para el usuario **dentro de un carril patrocinado explícito**. Cuál de las dos cosas es, lo decide D02. Hasta entonces la interfaz no muestra una cifra de costo total.
4. **Lo que el objetivo nunca incluye**, aunque D02 elija la opción más amplia: spreads de conversión, coste de terceros, redención física, operaciones de tarjeta y cualquier transacción externa a SFSP.
5. **Cotización firmada y versionada.** Toda operación con coste produce una cotización con importe exacto en unidades base, moneda, si el gas está patrocinado y por quién, coste de terceros, mínimo, regla de redondeo, deslizamiento tolerado, destinatario, vigencia y política de fallos. Aceptada la cotización, el valor no se recalcula sin renovar el consentimiento.
6. **Recibir un txHash no es haber cobrado.** El éxito del pago, el cobro de la comisión, la reversión y el cambio de precio son estados distintos en el registro de operaciones. Un estado incierto es `UNKNOWN` y se reconcilia; no se reintenta cobrando otra vez.
7. **Presentación y exactitud.** La interfaz puede redondear lo que muestra y siempre da acceso al importe exacto. Toda cantidad viaja como entero en unidades base, en cadena o `bigint`. Nunca coma flotante.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Fijar ahora el valor de referencia por recomendación técnica | Sustituye una decisión de la Junta por una elección de agente, y contamina cada libro que lo consuma. Prohibido por la regla de decisiones no inventadas. Rechazada. |
| Anunciar el objetivo de costo como total para el usuario en todos los carriles | Requiere patrocinar gas en todos los casos, incluidos EOA legacy y `transferFrom` con allowance, sin presupuesto medido ni aprobado. Crea una obligación de precio frente a una variable de red que no se controla. Rechazada hasta D02. |
| Presentar el modo fijo del código como la política aprobada | Convierte un valor por defecto de implementación en política monetaria, sin acta. Rechazada. |
| Mantener ambos modos y bloquear los consumidores hasta D01/D02 (elegida) | Deja capacidades apagadas y obliga a explicar el bloqueo en la interfaz. Coste aceptado. |

## 4. Consecuencias

- Ninguna pantalla afirma un costo total por operación hasta D02.
- Ninguna conversión, valuación de reservas ni operación de tarjeta se habilita con un precio que no tenga política aprobada y versión.
- El presupuesto de patrocinio de gas se fija después de medir, no a partir de cifras históricas.
- Medir la fórmula vigente y el gas estimado está permitido sin cobrar. Activar un cargo nuevo no lo está.
- El objetivo de producto de referenciar la unidad nativa al oro se conserva como objetivo y no se confunde con la configuración operativa vigente, que debe comprobarse y reconciliarse.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| Mientras D01 esté pendiente, distintos consumidores pueden estar usando configuraciones distintas en producción (NO_VERIFICADO). | Se acepta operar en modo lectura y producir el mapa de flujo de precio sin modificar nada. | Con D01 aprobada, o antes si el mapa revela una inconsistencia probada que obligue a parar un consumidor. |
| El objetivo comercial ya fue comunicado y crea expectativa. | Se acepta corregir la redacción en documentación y términos, sin activar un cargo nuevo. | Con D02 aprobada. |
| El coste real del patrocinio de gas es desconocido. | Se acepta medirlo con estimaciones sin cobrar. | Antes de habilitar cualquier carril patrocinado. |

## 6. Bloqueo por decisión Dxx

**D01 bloquea:** conversión, valuación de reservas, tarjeta y cualquier esquema de comisión nuevo. **D02 bloquea:** la activación de un cobro nuevo y el enunciado público del alcance del objetivo de costo. **D15 bloquea:** el modo en vivo de tarjeta, POS y compra multired. **D03 bloquea:** toda afirmación de respaldo asociada al precio.

## 7. Estado

**PROPUESTA.** No puede aceptarse mientras `precioOrigenModo`, `precioOrigenReferencia`, `feeObjetivoUSD`, `feeAlcance` y `gasPatrocinado` sean `null`.
