# Runbook: recuperación de cuenta, tres casos separados

**Regla base:** "recuperar" no es una sola operación (ADR-005). Antes de hacer nada se determina **cuál de los tres casos** es, porque tienen autoridad, procedimiento y resultado distintos. El resultado posible depende del par **(activo, perfil de custodia)**, nunca de uno solo de los dos.

**Advertencia transversal: congelar un binding no detiene a quien conserva una llave externa.** El freeze afecta a la ruta de SFSP. Un ERC-20 sin restricciones se transfiere llamando directamente al contrato, y ese camino no pasa por ningún componente propio (`directTransferBypass = true`).

---

## 1. Disparador

Un titular declara que perdió el acceso, que su llave o su dirección están comprometidas, o que no puede usar sus fondos.

## 2. Precondiciones (comunes a los tres casos)

1. La cuenta existe y tiene `accountId`, `accountNumber` y perfil de custodia clasificado explícitamente, no inferido.
2. Se abre un `caseId` antes de cualquier acción.
3. Existe la matriz `recoveryCapability` por (activo, perfil) con su evidencia y su autoridad.
4. Hay canales de contacto registrados **con anterioridad** al incidente.
5. Están disponibles la aprobación dual con separación de funciones y el tiempo de espera proporcional al riesgo.
6. **D10, D18 y D19 están pendientes.** Mientras lo estén: se puede restaurar acceso según el procedimiento vigente, y **no se promete ni se ejecuta recuperación de activos**.

## 3. Pasos comunes antes de clasificar

1. Abrir `caseId` y registrar la declaración del titular sin datos sensibles innecesarios.
2. Verificar la identidad por el procedimiento aprobado, con **desafío independiente** del canal por el que llegó la solicitud.
3. Avisar por los canales previamente registrados. Si un atacante inició el caso, el titular legítimo debe enterarse.
4. **Clasificar el caso** en uno de los tres siguientes. Si hay dudas, se trata como caso 2, que es el más restrictivo.
5. Calcular y mostrar la capacidad real por activo antes de prometer nada.

---

## 4. Caso 1: acceso perdido, cuenta custodial (MANAGED)

**Qué es:** el titular no puede entrar. La llave sigue disponible en custodia.

**Qué se puede hacer:** restaurar la sesión y el acceso tras verificación.

**Pasos:**
1. Verificar identidad con el nivel exigido por el riesgo de la cuenta.
2. Esperar el tiempo definido, con aviso enviado y ventana de disputa abierta.
3. Aprobación dual con separación de funciones.
4. Restaurar credenciales de acceso. **La dirección no cambia si la clave sigue disponible.**
5. Registrar el caso y notificar la conclusión.

**Qué NO cambia:** titularidad, `accountNumber`, dirección, saldos.

**Qué NUNCA se hace:** **no se exporta la semilla** (T66). Ni al titular, ni al soporte, ni al expediente.

**Verificación:** el titular accede; no hubo cambio de binding ni de saldos; el expediente está completo.

---

## 5. Caso 2: llave o dirección comprometida

**Qué es:** un tercero tiene o pudo tener control de la llave.

**Qué se puede hacer:** revocar sesiones, y mover activos a una nueva dirección controlada **sólo mediante capacidades que realmente existan**.

**Pasos:**
1. Revocar sesiones y accesos de inmediato. Suspender el binding afectado (`SUSPENDED` o `RECOVERY_PENDING`).
2. **Asumir que el atacante puede transferir todo lo que esté en esa dirección y que no tenga restricciones de contrato.** La suspensión del binding no lo impide.
3. Enumerar los activos alcanzables desde esa dirección y su `recoveryCapability` por activo:
   - `CUSTODIAL_KEY_RECOVERY`: el custodio firma el traslado bajo procedimiento.
   - `CONTRACT_RECOVERY`: se usa el mecanismo reglado del contrato.
   - `ADMIN_FORCED_TRANSFER`: sólo con el poder documentado y su autoridad aprobada.
   - `NONE`: **no hay ruta.** Se comunica con claridad y se documenta.
4. Crear la nueva dirección bajo control verificado y hacer el **rebinding**. El `accountNumber` no cambia (T62).
5. Mover lo que sea movible, en orden de exposición, con aprobación y límites por acción.
6. Aplicar `compromiso-de-llaves.md` si la llave es de custodia o de gobierno.
7. Registrar qué se movió, qué no se pudo mover y por qué.

**Qué NUNCA se hace:** no se crea un saldo nuevo para compensar lo que no se pudo mover. Cualquier compensación es un procedimiento financiero separado y aprobado.

**Verificación:** binding antiguo revocado; nuevo binding activo; inventario de activos con su estado final; lo irrecuperable declarado como tal.

---

## 6. Caso 3: wallet externa sin llave

**Qué es:** el titular perdió la llave de una dirección que él controlaba (perfil `PERSONAL`) y esa dirección contiene activos.

**Qué se puede hacer:** sólo lo que permitan mecanismos ya existentes y legales.

**Pasos:**
1. Confirmar el perfil y que no hay custodia de esa llave por parte de la plataforma.
2. Calcular `recoveryCapability` por activo. Para la unidad nativa y para un ERC-20 legacy sin poderes, en perfil `PERSONAL`, el resultado es **`NONE`** y así se muestra (T65).
3. Si algún activo tiene `CONTRACT_RECOVERY` o `ADMIN_FORCED_TRANSFER`, evaluarlo con su autoridad, evidencia y aprobación. **No se ejecuta mientras D19 esté pendiente.**
4. Se puede recuperar la **relación de identidad** y el acceso a la cuenta SFSP, y se puede hacer rebinding hacia una dirección nueva. **El rebinding no mueve los activos que quedaron en la dirección anterior** (T64).
5. Comunicar con exactitud: qué se recuperó (identidad y cuenta) y qué no (los fondos de esa dirección).
6. Registrar el caso y dejar el expediente abierto por si una migración futura del activo a un instrumento recuperable cambia la situación.

**Qué NUNCA se hace:** **no se crea otro saldo** para representar lo perdido. Crear una posición nueva sin extinguir la anterior es doble derecho (ADR-008).

**Verificación:** el titular accede a su cuenta; el inventario de lo irrecuperable está escrito y comunicado; no se creó ninguna posición nueva.

---

## 7. Criterio de parada (los tres casos)

Se detiene y se escala si:

- La verificación de identidad no alcanza el nivel exigido.
- Hay disputa entre dos personas sobre la misma cuenta.
- El caso exigiría usar un poder administrativo no documentado o sin autoridad aprobada.
- El caso exigiría crear una posición sin extinguir otra.
- Hay indicios de que quien solicita es el atacante.

## 8. Qué NO hacer (los tres casos)

- No prometer recuperación de fondos antes de calcular la capacidad por (activo, perfil).
- No llamar "recuperación" a un rebinding.
- **No decir al titular que congelar su cuenta protege sus fondos externos.** No los protege.
- No exportar semillas en ningún caso.
- No omitir el aviso por canales previos ni el tiempo de espera.
- No resolver un caso con un solo aprobador.
- No cerrar un caso sin escribir qué quedó irrecuperable.
