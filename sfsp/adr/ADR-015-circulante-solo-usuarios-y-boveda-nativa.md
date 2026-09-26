# ADR-015: El circulante es lo que tienen los usuarios; ORIGEN se sella en una bóveda

- Estado: **PROPUESTA**
- Fecha: 2026-09-26 (UTC)
- Serie relacionada: SFSP-410 · enmienda SFSP-200, SFSP-300, SFSP-400, SFSP-800
- Decisiones que lo bloquean: **D23** (adoptar), **D24** (cupos), **D25** (cuentas internas y direcciones del 14-sep), **D26** (migración), **D07** (quórums)

## 1. Contexto

La dirección fija una política nueva: no habrá suministro de tokens ni de ORIGEN
más allá del que está en manos de usuarios; lo demás se emite y se quema desde un
panel controlado.

El estado de partida la hace necesaria:

- Los ERC-20 de la cadena 5550 (AUKA, AGKA, ONDK…) se copiaron al génesis con todo su suministro acuñado. Nadie puede leer quién es su dueño, AUKA/AGKA/ONDK no tienen quema, y no hay topes, roles ni pausa.
- El ORIGEN de las cuatro billeteras madre salió el 14-sep hacia seis direcciones que ningún documento explica.
- Las llaves que mueven fondos viven en variables de entorno.
- SFSP ya tenía el control fino (autorización ligada al contenido, doble control, topes), pero con un supuesto distinto: inventario acuñado en tesorería y liberado por etapas.

## 2. Decisión

1. **Circulante = usuarios.** No se acuña hacia cuentas internas (R1). El pasaporte deja de distinguir "emitido" y "en circulación".
2. **Emisión bajo demanda dentro de un cupo.** La Junta aprueba, con doble control y espera, un cupo por activo (por periodo, por operación, con vigencia). Cada pago confirmado de un usuario se convierte en una emisión exacta a ese usuario, ligada a la referencia del pago. Fuera del cupo, orden de gobierno por operación.
3. **Quema al devolver**, con consentimiento del titular sobre el digest exacto.
4. **ORIGEN: bóveda sellada** (D03-b). Todo el ORIGEN no de usuarios vive en `SFSPNativeVault`, sin dueño ni retiro de administrador. Liberar es emitir; reabsorber es quemar.
5. **Los tokens actuales se reemplazan** por activos SFSP; la migración (SFSP-700) re-acuña sólo saldos de usuarios.

## 3. Alternativas consideradas y su coste

| Alternativa | Coste |
|---|---|
| Mantener inventario acuñado en tesorería y "liberar" (modelo v0.2) | Es lo que la política quiere eliminar: el inventario es riesgo de custodia y de comunicación, y hoy ni siquiera se sabe quién lo controla. Rechazada. |
| Un botón de acuñar con una sola llave | Viola SFSP-800 ("ninguna llave individual crea oferta monetaria") e I-62. Rechazada. |
| Orden de gobierno por cada compra | Correcto pero inviable para compras de usuarios: cada compra esperaría a varios firmantes. Se conserva para lo que sale del cupo. |
| Acuñar/quemar ORIGEN cambiando el cliente Besu | Meses, riesgo de consenso, y cambia la naturaleza de la moneda. Rechazada por ahora (D03-c). |
| ORIGEN como ERC-20 envuelto | Ya rechazada en ADR-006: dos ORIGEN que conviven. |
| Enviar el ORIGEN sobrante a una dirección sin llave ("quemar") | SFSP-400 no lo acepta como quema (no se puede probar que no haya llave) y es irreversible. La bóveda es verificable y reversible sólo por gobierno. |

## 4. Consecuencias

- `SFSPIssuanceController` gana `setInternalAccount`, `setMintBudget`, `revokeMintBudget`, `mintOnDemand`; la regla R1 se aplica también al camino `mint` existente. Tamaño desplegado: 15,5 KB (límite 24 KB).
- Nuevo contrato `SFSPNativeVault`.
- `SFSPGovernanceController` expone `authorizationActionOf` para que los ejecutores exijan la acción correcta.
- Nueve eventos nuevos en `spec/eventos.json` (draft-0.5); el indexador se regenera.
- SFSP-300 recupera su regla original (sin suministro por adelantado).
- El ISSUER de servicio que ejecuta `mintOnDemand` no aprueba nada: su peor caso es agotar el cupo vigente hacia usuarios elegibles, y un solo firmante lo corta.
- El aligerado de periodos (`block.timestamp / period`) permite consumir hasta dos cupos seguidos en el borde entre periodos. Se acepta y se documenta; si la Junta lo quiere más fino, se fija un periodo más corto con cupo proporcional.
