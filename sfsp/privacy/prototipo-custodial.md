# Prototipo custodial: cuentas privadas con liquidación agregada

**Estado: NO IMPLEMENTADO.** Descripción de diseño para evaluar D06. No hay código, no hay despliegue y no hay ninguna cuenta funcionando así.

---

## 1. Qué es

Las posiciones individuales de los usuarios se llevan en un **ledger privado** operado por la plataforma. En la cadena existen unas pocas **cuentas de liquidación agregada**, que contienen el total custodiado. Los movimientos entre usuarios ocurren dentro del ledger privado. La cadena sólo ve depósitos, retiros y, si procede, liquidaciones netas entre agregados.

```
Usuario A  ─┐
Usuario B  ─┼─  ledger privado (saldos individuales)  ─── cuenta agregada on-chain
Usuario C  ─┘                                              (un único saldo visible)
```

## 2. Componentes

1. **Ledger privado de posiciones**, con asiento por operación, idempotencia por `operationId` y diario durable.
2. **Cuentas de liquidación agregada** on-chain, bajo custodia con separación de funciones (ADR-009).
3. **Motor de autorización** que aplica política antes de cada movimiento interno.
4. **Conciliación permanente** entre los pasivos con los usuarios y el activo custodiado on-chain.
5. **Depósitos y retiros consentidos**, que son los únicos momentos en que la cadena ve al usuario.

## 3. Garantías reales

Lo que este diseño **sí** consigue:

- **Frente a un observador externo de la cadena:** no ve saldos individuales, ni transferencias entre usuarios, ni su número, ni su frecuencia. Ve un agregado que se mueve en depósitos y retiros.
- **Reduce la correlación por importe y por momento** para las operaciones internas, que no tocan la cadena.
- **Coste y latencia bajos** para las operaciones internas.
- **Reversible en caso de error operativo interno**, porque es un libro contable, no una cadena.
- **Permite aplicar política antes de cada movimiento**, con enforcement real, porque nada ocurre sin pasar por el motor.

## 4. Límites, sin adornos

- **No es privacidad frente al operador.** El operador ve absolutamente todo: quién, cuánto, cuándo y a quién. Si la amenaza incluye a un insider, este diseño no la cubre.
- **No es privacidad frente al custodio** ni frente a quien tenga acceso a la base o a un respaldo.
- **No es privacidad frente a una autoridad** que requiera los libros.
- **Los depósitos y los retiros son visibles** en la cadena, con su importe y su momento. Un usuario que entra y sale queda enlazado por importe y tiempo, igual que antes (ver `amenazas.md`, 2.5 y 2.4).
- **Introduce riesgo de custodia.** El usuario deja de controlar su llave para esas posiciones. Cambia un problema de privacidad por un problema de solvencia y de confianza.
- **No crea una segunda moneda.** El saldo interno es un pasivo, no un activo nuevo. Presentarlo como una unidad distinta sería falso.
- **Exige conciliación permanente.** Si los pasivos superan al activo custodiado, hay un agujero. Ver `runbooks/conciliacion-diaria.md`.
- **Concentra fondos** en pocas direcciones, lo que las convierte en un objetivo mayor.
- **No sustituye automáticamente las cuentas actuales.** Sería un producto distinto, con su propio consentimiento.

## 5. Lo que este diseño nunca puede anunciarse como

- "Transacciones privadas". Lo son frente a la cadena, no frente al operador.
- "Privacidad criptográfica". No hay ninguna: hay control de acceso a una base de datos.
- "Sin custodia". Es exactamente lo contrario.

## 6. Requisitos previos si D06 lo eligiera

1. Marco de custodia aprobado (D10, D18) y separación de funciones.
2. Conciliación automática con bloqueo de acciones ante descuadre.
3. Consentimiento explícito del usuario, con explicación del cambio de modelo de riesgo.
4. Tratamiento jurídico del pasivo, que puede constituir una actividad regulada (D13).
5. Auditoría de solvencia y procedimiento de retiro bajo estrés.
6. Retención y purga de los libros conforme a `clasificacion-datos.md`.

## 7. Prohibiciones durante cualquier prototipo

- **No se trasladan fondos reales a la cuenta agregada para hacer una demostración.**
- No se presenta el saldo interno como un activo distinto.
- No se anuncia privacidad frente al operador.
- No se migran usuarios sin consentimiento informado y específico.

## 8. Bloqueo

**D06** decide si este diseño se desarrolla. **D10** y **D18** bloquean la custodia. **D13** puede imponer requisitos de autorización. Mientras tanto: descripción, nada más.
