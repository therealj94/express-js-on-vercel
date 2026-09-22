# ADR-006: la unidad nativa no se acuña con un contrato ordinario

- Estado: **PROPUESTA** (bloqueada por D03; también por D01 y D04 para cualquier número)
- Fecha: 2026-09-22 (UTC)
- Serie relacionada: SFSP-400 Monetary
- Decisiones Dxx que lo bloquean: **D03** (respaldo total frente a release controlado), **D01** (precio de referencia), **D04** (reservas elegibles y metodología).

## 1. Contexto

ORIGEN se trata como moneda nativa de la cadena en el plan y en el código de saldos (DECLARADO; suministro técnico, cuentas de génesis, recompensas y política vigente: **NO_VERIFICADO**).

Hay una expectativa de comunicar respaldo. Hay también una confusión frecuente: creer que desplegando un contrato con control de emisión se controla el suministro de la unidad nativa.

## 2. Decisión

### 2.1 Un contrato ordinario no acuña moneda nativa

El suministro nativo lo determinan el génesis y las reglas de consenso:

```
S_native(b) = S_genesis + I_consensus(0..b) - B_protocol(0..b)
```

`I_consensus` incluye toda emisión permitida por las reglas efectivas y sus transiciones. `B_protocol` sólo incluye quemas reconocidas por las reglas de la cadena. Un contrato desplegado sobre la EVM no participa en ninguno de los dos términos. Por lo tanto:

- **Un `mint` de contrato no crea unidades nativas.**
- **Enviar unidades a una dirección supuestamente inaccesible no reduce `S_native`.**
- **Las transferencias entre cuentas, incluidas las de tesorería, no cambian `S_native`.** Depositar unidades de usuarios en tesorería no las vuelve "no emitidas".
- No se supone `blockreward = 0`. El destino del gas y cualquier recompensa se concilian.

Lo que sí se puede controlar con contratos es la **distribución** de unidades que ya existen, desde un vault.

### 2.2 Las tres alternativas de D03, sin elegir

Esta ADR **no elige**. Describe el coste de cada opción para que la Junta decida.

**(a) Cobertura total del suministro nativo.** Demostrar cobertura de todo el suministro al que se promete respaldo, incluido el inventario ya emitido y las cuentas fuera del control del vault.
Coste: exige valorar reservas elegibles suficientes para el total, con metodología firmada (D04), y aceptar que las emisiones de consenso futuras amplían la obligación. Las cuentas fuera de control del vault impiden prometer un límite universal si no están cubiertas. Ampliar un techo administrativo no aumenta el saldo técnico disponible.

**(b) Control de distribución por vault.** Controlar sólo las salidas adicionales desde tesorería, informando expresamente que ese control **no equivale** a emisión nativa condicionada desde génesis.
Coste: obliga a definir el perímetro `U_unactivated` (inventario efectivamente inmovilizado que todavía no adquirió estado de respaldo activado) y a aceptar que toda unidad fuera de ese perímetro cuenta como liberada, aun estando en otra cuenta de la empresa. Comunicar (b) como si fuera (a) queda prohibido.

**(c) Instrumento monetario nuevo o modificación del cliente.** Diseñar en otro proyecto un instrumento nuevo o cambiar el cliente, con migración y derechos aprobados.
Coste: fork o cadena nueva, migración de derechos, doble operación y revisión legal completa. **No se ejecuta con este plan.**

Recomendación de trabajo registrada en el plan: desarrollar (b) en prueba sin anunciarla como (a). Eso no es una elección de D03.

### 2.3 Fórmulas de release, aplicables sólo después de D03

```
R_released = S_native - U_unactivated
RAC_units  = floor(EligibleReserveUSD / ReferenceUSDperUnit * 10^decimals)
release(x) exige  R_released + x <= min(ReleaseCap, RAC_units)
```

`ReleaseCap` es un límite de distribución, no una capacidad de crear nativo. Todos sus insumos son `null` hoy: `releaseCap`, `precioOrigenReferencia`, haircuts y factores de elegibilidad.

### 2.4 Reglas del vault

El vault valida autorización, reserva vigente y capacidad en **cada** salida, incluidas transferencias a mercado o a filiales, gas y subsidios, y retiros administrativos. Un déficit de cobertura bloquea las distribuciones afectadas y activa un plan de normalización. **Nunca reduce balances de clientes para cuadrar cifras.**

## 3. Alternativas consideradas y su coste

Además de (a), (b) y (c) de D03, se consideró y descartó:

| Alternativa | Coste |
|---|---|
| Envolver la unidad nativa en un ERC-20 y aplicar reglas al wrapper | El wrapper no gobierna la unidad nativa subyacente: sigue existiendo y circulando fuera. Añade una segunda representación con riesgo de doble contabilidad. Rechazada. |
| Simular que `address(0)` es un contrato ERC-20 en el registro | Falsea `settlementLocation` y rompe toda lectura automatizada. El pasaporte usa `assetKind = NATIVE` con localización de red. Rechazada. |
| Anunciar respaldo antes de tener reservas y liquidez comprobadas | Afirmación no sustentada con consecuencias jurídicas. Rechazada sin discusión. |

## 4. Consecuencias

- Hasta D03 no se emite ninguna afirmación de respaldo ni se ejecuta un release de tesorería.
- La unidad nativa se representa con `assetKind = NATIVE`.
- La ausencia de un derecho individual de redención de la unidad nativa no elimina obligaciones contractuales de pagos, tarjetas o compraventa: son contratos separados y se documentan como tales.
- Liquidez operativa y valor de reservas son libros distintos y no se suman.
- Cualquier cambio que permita eludir el control del vault requiere un proceso excepcional visible, con auditoría de módulos, guards y upgrades.

## 5. Riesgos aceptados y vencimiento

| Riesgo | Aceptación | Vence |
|---|---|---|
| El suministro nativo real, las cuentas de génesis y las recompensas son NO_VERIFICADOS. | Se acepta trabajar con fórmulas y fixtures sintéticos etiquetados, sin cifras reales. | A la primera lectura autorizada del nodo, dentro de P8-O. |
| Puede existir inventario en cuentas fuera del control del vault. | Se acepta contarlo como liberado, que es el tratamiento conservador. | Al censo de cuentas y tesorería en P9a. |
| La expectativa pública de respaldo ya existe. | Se acepta corregir la redacción y no activar release. | Con D03 aprobada. |

## 6. Bloqueo por decisión Dxx

**D03** bloquea afirmaciones de respaldo y release de tesorería. **D01** bloquea el precio de referencia, sin el cual `RAC_units` no se calcula. **D04** bloquea cualquier capacidad de reserva distinta de cero.

## 7. Estado

**PROPUESTA.** Documenta un imposible técnico (2.1), que no requiere decisión, y deja abierta la elección de política (2.2), que sí la requiere.
