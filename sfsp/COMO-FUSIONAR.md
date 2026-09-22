# Cómo se fusiona esto con lo que ya existe

Este árbol se construyó aparte a propósito. Aquí está el camino de vuelta: qué
se extrae, qué se conecta, en qué orden, y qué tiene que estar aprobado antes de
cada paso. Nada de esto se ejecuta con esta entrega.

## 1 · Extraer el árbol a su propio repositorio

Cuando D11 apruebe el repositorio nuevo:

```bash
git subtree split --prefix=sfsp -b sfsp-solo
# y después, con el repositorio ya creado:
git push <remoto-del-repo-nuevo> sfsp-solo:main
```

El árbol es autocontenido: no importa nada de fuera de `sfsp/`, así que el
corte no rompe ninguna referencia. Mientras D11 siga pendiente, vivir dentro del
monorepo no molesta a nadie porque no hay un solo archivo compartido.

Lo que **no** se hace: copiar el monorepo entero a otro sitio para tener un
«staging». Eso crea dos verdades, que es justo el problema que la revisión del
21 de septiembre señala.

## 2 · Conectar cada producto, uno por uno

El orden importa. Cada fila depende de que la anterior tenga evidencia.

| Orden | Producto | Qué consume de SFSP | Antes hace falta |
|---|---|---|---|
| 1 | Genesis ID | `IdentityAdapter`: emite attestations firmadas por propósito | Fuente canónica decidida (B03, D11) |
| 2 | Backend de la billetera | `AccountDirectoryService`: número de cuenta, alias y bindings | Backend canónico decidido (B01, D11) |
| 3 | Billetera, pantalla | Número de cuenta y alias como destino primario; la dirección pasa a «detalles técnicos» | Que el paso 2 tenga censo N/N en verde |
| 4 | Billetera, activos | `AssetRegistry` como origen del catálogo, en modo sombra | Registro poblado en 5534 |
| 5 | Orden Ledger | Indexador de eventos y vistas de transparencia | Contratos desplegados en 5534 |
| 6 | Orden Markets | `SettlementEngine` y `CashVault` para la liquidación | Paso 5 con reconciliación en verde |
| 7 | DBNX | Casos, autorizaciones, riesgo y reporting | D07 y D08 |
| 8 | MyTokenPay y AuCorp | La misma API de liquidación, sin ledger paralelo | D15 |

## 3 · La regla del modo sombra

Ningún producto cambia de fuente de verdad de golpe. El patrón es siempre el
mismo, y es el que hace que nadie note nada:

1. **Sombra.** El producto sigue usando su fuente actual y además consulta SFSP.
   Compara los dos resultados y registra las diferencias. No firma nada nuevo, no
   transmite nada nuevo, no cambia lo que ve el usuario.
2. **Equivalencia.** Se exige que las dos fuentes coincidan para el censo
   completo, a un bloque común, comparando cantidades base exactas. Una sola
   diferencia sin explicar detiene el avance.
3. **Conmutación.** Se cambia la fuente detrás de un flag, con el camino de
   vuelta probado y una ventana de observación.
4. **Retirada.** La fuente vieja se retira sólo cuando la nueva lleva tiempo
   conciliando sin excepciones.

`OGFP_ACTIVO` / `SFSP_ACTIVO` existe para el paso 3 y arranca apagado en
producción. Un flag encendido nunca es una autorización monetaria: son dos cosas
distintas y se aprueban por separado.

## 4 · La migración que el usuario no debe notar

La primera fase **no mueve nada**. Crea el número de cuenta y la ruta hacia la
dirección que la persona ya tiene. No cambia su dirección, no cambia su frase de
recuperación, no cambia su saldo y no le pide firmar.

Criterio de aceptación, ya implementado y probado en `sdk/src/migracionCuentas.ts`:

- tantas cuentas SFSP como cuentas de origen del censo fechado;
- cero duplicados;
- cero números reutilizados, **incluso si una corrida se deshace**;
- ninguna dirección con saldo sin dueño ni expediente;
- saldos idénticos antes y después;
- cada excepción se aísla con expediente y **no** se borra del censo para que el
  porcentaje cierre.

La segunda fase, el reemplazo técnico de un activo por otro, sólo ocurre si un
activo concreto lo necesita, va activo por activo, y cada uno tiene su propia
decisión D09. La conciliación es `S0 = A + N + P`, con `E = N + P` como
contraparte. Los claims no vencen.

## 5 · Qué tiene que estar aprobado antes de tocar producción

| Paso | Decisión o compuerta |
|---|---|
| Crear el repositorio nuevo | D11 |
| Provisionar staging aislado | D12 |
| Desplegar en la testnet 5534 | D12 y aislamiento acreditado |
| Fijar cualquier parámetro económico | D01 a D05, D07 |
| Prometer recuperación de fondos | D19 |
| Anunciar privacidad | D06 y la compuerta G4 |
| Registrar activos en la 5550 | D08, D09 y la compuerta G8 |
| Cualquier release | P11, con alcance y caducidad |

## 6 · Lo que no cambia de nombre todavía

En el código y en la documentación interna ya se usan `orden-ledger` y
`orden-markets`. De cara al público, ORDENSCAN y Ordenex conservan su nombre
hasta que el producto renombrado tenga algo distinto que mostrar (compuerta G7).
Renombrar un explorador que sigue enseñando lo mismo confunde y no aporta.

Prohibido el reemplazo global de OGFP por SFSP en bytes firmados, dominios
EIP-712 o identificadores de activo ya asignados. Los nombres viejos quedan como
alias de compatibilidad. Esto es ADR-010.
