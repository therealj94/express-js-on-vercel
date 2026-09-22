# BASELINE-SFSP · línea base observada

**Corte:** 22 de septiembre de 2026 · **Estado de la entrega:** lectura de código, sin accesos.

Este documento es el paso 2 del Anexo E del plan maestro: qué se pudo leer, qué
no, y qué discrepancias hay que resolver antes de construir encima.

**Lo que NO se hizo, y hay que decirlo primero:** en este entorno no hubo acceso
a la red 5550, ni a los nodos, ni a consolas de proveedor, ni a ninguna base de
datos, ni a cuentas de usuarios. Nada de lo que sigue está en estado
`VERIFICADO_RUNTIME`. Todo lo que se afirma sale de leer archivos del
repositorio en un commit concreto, y por eso está en `CODIGO_LEIDO` o, cuando
sale de un documento, en `DECLARADO`.

---

## 1 · Qué se leyó

| Fuente | Referencia | Estado |
|---|---|---|
| Monorepo | rama `claude/galaxy-web-review-260wt4` | `CODIGO_LEIDO` |
| Lista de activos de la billetera | `infra/veta-wallet-backend/lib/saldos.js` | `CODIGO_LEIDO` |
| Custodia de llaves | `infra/veta-wallet-backend/lib/cripto.js` y su README | `CODIGO_LEIDO` |
| Comisión y gas | `infra/veta-wallet-gas-y-precio/` | `CODIGO_LEIDO` |
| Venta multired | `infra/contratos-venta/` | `CODIGO_LEIDO` |
| Migración de cadena | `infra/migracion-cadena/` | `CODIGO_LEIDO` |
| Identidad | `genesis-id/`, `genesis-id-app/` | `CODIGO_LEIDO` |
| Explorador y mercado | `ogscan-*`, `apps-web/ordenex/`, `infra/ordenex-api/` | `CODIGO_LEIDO` |
| Estado del ecosistema | `ECOSISTEMA-ORDEN-GLOBAL.md`, `POR-HACER.md` | `DECLARADO` |
| Revisión independiente | informe del 21-sep-2026 | `DECLARADO` |
| Especificación previa | OGFP v0.1 y el plan maestro SFSP v3.0 | `DECLARADO` |

---

## 2 · Activos encontrados en el código

`saldos.js` enumera **catorce contratos** más la unidad nativa. Esta lista es el
punto de partida del inventario de SFSP-700, **no** el inventario completo: un
barrido real puede encontrar envoltorios, wallets de contrato, puentes o
derechos que no están en este archivo.

| Símbolo en código | Nota |
|---|---|
| ORIGEN | Unidad **nativa** de la 5550. No es un ERC-20. `assetKind = NATIVE`. |
| ONDK | Declarado valor negociable. Clasificación jurídica pendiente D08. |
| AUKA | Metal. Cobertura y derechos pendientes D05. |
| AGKA | Símbolo legacy. **AGK es nombre de producto, AGKA el símbolo observado.** Se trata como alias, no como token nuevo. |
| MNKA, IBS, HARV, AUBEX, ASL, LOVE, REST, SOL, AGRO, AIT, POLITICAL | Once activos más. Clasificación, derechos y estado pendientes D08. |

Excluidos ONDK, AUKA y AGKA, quedan **once**, no doce. El conteo importa porque
una tabla que dice doce hace pensar que falta uno.

---

## 3 · Discrepancias que hay que resolver antes de construir encima

| # | Discrepancia | Qué la resuelve |
|---|---|---|
| B01 | Dos árboles del backend de la billetera: `infra/veta-wallet-backend/` en el monorepo y el repositorio `veta-wallet-backend-`. No está demostrado cuál compila y publica lo que corre. | D11 |
| B02 | `main` del monorepo está muy por detrás de la rama de trabajo. Una rama llamada `main` no es por sí sola la verdad de producción. | D11 |
| B03 | Dos implementaciones de identidad. La del monorepo tiene la regla de aprobación por operador; la alternativa no se demostró retirada. | P5 + D11 |
| B04 | El precio de ORIGEN tiene modo fijo y modo oro. Cuál está efectivamente configurado en cada consumidor no se pudo comprobar sin accesos. | D01 |
| B05 | La comisión documentada es de 0,01 ORIGEN por envío. El objetivo comercial es USD 0,01. No son lo mismo y hoy difieren en dos órdenes de magnitud. | D02 |
| B06 | La custodia cifra llave y semilla con una clave de aplicación. El diseño objetivo no mantiene todas las semillas descifrables con una sola contraseña. | D18 |
| B07 | El conteo histórico de cuentas y tenedores viene de documentos, no de una lectura autorizada. Se sustituye por **N/N de un censo fechado**. | P5, con acceso |
| B08 | La 8532 se declara congelada. Que nadie la use no está demostrado, y puede haber derechos o vías de cobro. | D14 |
| B09 | La especificación OGFP v1.0 referida no se localizó íntegra. O se recupera o se aprueba formalmente que SFSP la sustituye. | D16 |
| B10 | Una credencial administrativa apareció en documentación pública. Borrar el texto no la revoca. | P0, responsable de seguridad |

---

## 4 · Lo que este árbol asume, y qué pasa si el supuesto falla

| Supuesto | Si falla |
|---|---|
| La EVM de la 5550 acepta el objetivo `paris` del compilador. | Los contratos se recompilan con otro objetivo. No cambia la lógica. |
| ORIGEN es la unidad nativa y no un ERC-20. | Cambia el diseño de `SFSP-400` y del vault. Es la razón de ADR-006. |
| Las direcciones de `saldos.js` corresponden a contratos vivos en la 5550. | El inventario de P9a lo comprueba con `codehash`. `eth_getCode != 0x` no basta. |
| El censo de cuentas se puede leer sin exportar material criptográfico. | La migración de cuentas se detiene. No se exportan semillas por conveniencia. |

---

## 5 · Estado de evidencia de este árbol

Lo único que está en `PROBADO_AISLADO` es lo que tiene una prueba que se vuelve
a correr con `node scripts/verificar-todo.mjs`. Nada está en
`VERIFICADO_RUNTIME`, porque para eso hacen falta accesos que esta sesión no
tuvo y aprobaciones que todavía no existen.
