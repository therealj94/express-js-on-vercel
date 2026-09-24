# Trazabilidad · borrador SFSP v0.2 → repositorio

**24 de septiembre de 2026 · especificación `draft-0.4`.**

Cada sección del borrador SFSP v0.2 (`fuente/SFSP-v0.2-2026-09-23-original.docx`), con dónde queda escrita en el repositorio y si ya hay código.

- **Spec** · ✅ escrita · ◐ escrita en parte · ✗ falta
- **Código** · ✅ con pruebas · ◐ en parte · ✗ no hay
- **Nada de esto está desplegado en ninguna red.**

| § v0.2 | Tema | Dónde queda en el repo | Spec | Código |
|---|---|---|---|---|
| Portada, §1 | Nombre SFSP, propósito, tres pilares | `spec/SFSP-100-CORE.md` §0.1; `DECISIONES-SFSP.json` (D00, D16) | ✅ | n/a |
| §2 | Besu 5550, EVM sin bifurcar, ERC-20 deja de ser canónico | `SFSP-100` §0.1 | ✅ | ✅ (registro de activos, activo regulado) |
| §2.1 | **Red cerrada**: lista de despliegue y filtro de transacciones | `spec/SFSP-150-NETWORK-ADMISSION.md` (**nueva**) | ✅ | ✗ Falta confirmar el mecanismo de Besu |
| §2.2 | Cuándo modificar el cliente | `SFSP-150` §4 (solo con necesidad demostrada) | ◐ | n/a |
| §3, §3.1 | Capas L0 a L5 y módulos del core | `SFSP-100` §0.1; `SFSP-900` §0.3 (estado de L0) | ◐ | ◐ |
| §4 | Series por centenas | `spec/README.md` §2 (+ SFSP-130, 140 y 150) | ✅ | n/a |
| §4.1 | Clases de activo | `SFSP-100` §0.1 (`LEGACY` como clase transitoria) | ✅ | ✅ |
| §4.2 | **Asset Passport** (unos 25 campos, versionado, vencimiento por campo) | `SFSP-100` §0.2 | ✅ | ◐ El contrato no tiene todavía los campos nuevos |
| §4.3 | Vocabulario acuñar / asignar / colocar / circular | `SFSP-100` §0.1; `SFSP-300` §0.2 | ✅ | ◐ |
| §5, §5.1 | Roles, límites, denominación de DBNX | `SFSP-800` §0.1 | ✅ | ✅ (roles en `SFSPAccessControl`) |
| §5.2, §5.3 | Regla de control y firmas críticas | `SFSP-800` §0.2 | ✅ | ◐ Faltan firmantes y umbrales (D07) |
| §6 | **Registro de licencias** | `spec/SFSP-140-LICENSES.md` (**nueva**) | ✅ | ✗ |
| §7 | **Acceso abierto y matriz de países** | `SFSP-120` §0.1 y §0.2 | ✅ | ◐ Hay lista blanca por activo; faltan los 4 estados y `SOLO_ENTRANTE` |
| §7.1 | Regla de promoción | `SFSP-120` §0.3; `SFSP-900` §0.4 | ✅ | n/a (control de operación) |
| §8.1 | Supply = capital ÷ precio; colocación o división | `SFSP-200` §0.1 | ✅ | ◐ Topes de emisión sí; declaración de ampliación y división no |
| §8.2 | Colocación 51/49 | `SFSP-200` §0.2 | ◐ | ✗ |
| §8.3 | Expediente en 8 bloques; titularidad; valor admisible | `SFSP-200` §0.3 | ✅ | ◐ Máquina del caso sí (5 estados de 8); valor admisible no |
| §8.4 | **Segmentos** | `SFSP-200` §0.4 | ✅ | ✗ |
| §8.5 | **Límite de exposición por Genesis ID** | `SFSP-200` §0.5; `SFSP-120` §0.4; `SFSP-110` §0 | ✅ | ✗ |
| §8.6 | Plantillas de derechos | `SFSP-200` §0.6 | ✅ | ◐ Falta la plantilla patrimonial (canasta) |
| §8.7 | Motor de pagos | `SFSP-200` §0.7 | ◐ | ✗ |
| §8.8 | Acciones corporativas | `SFSP-200` §5 y §0.7 | ◐ | ✗ |
| §9.1 | Naturaleza de AUKA y AGKA; comunicación del respaldo | `SFSP-300` §0.1 (**corregido**: diseño a futuro) | ✅ | n/a |
| §9.2 | Custodia distribuida | `SFSP-300` §0.3 | ✅ | ✗ |
| §9.3 | Redención y canales | `SFSP-300` §0.4 | ✅ | ✗ |
| §9.4 | **Acuñar antes, colocar con metal** | `SFSP-300` §0.2 (**cambia la norma**) | ✅ | ✗ |
| §10.1 | ORIGEN: supply fijo, referenciado | `SFSP-400` §0.1; D03 | ✅ | ◐ |
| §10.2 | Unidades de liquidación autorizadas | `SFSP-400` §0.1 | ✅ | ✗ |
| §10.3 | Comisión de USD 0,01 | `SFSP-400` §0.1; `SFSP-500` §0 | ✅ | ✅ `SFSPFeeController` (sin parámetro, bloquea) |
| §10.4 | **Tesorería cotizadora** | `SFSP-400` §0.2 | ✅ | ✗ |
| §10.5 | **Oráculo único** | `SFSP-400` §0.3 | ✅ | ✗ |
| §11 | Identidad | `SFSP-110` §0 | ✅ | ✅ `SFSPIdentityAdapter` · ✗ puente único con Genesis |
| §12 | Privacidad | `SFSP-600` §0 | ✅ | ◐ Filtro del indexador sí; dominio privado no |
| §13 | Mercados | `SFSP-500` §0 | ✅ | ◐ Liquidación con entrega contra pago sí; calce y órdenes no |
| §14.1–14.3 | Migración dentro de la misma cadena | `SFSP-700` §0.1 a §0.3 | ✅ | ◐ `SFSPMigrationRegistry` sí; el bloqueo por filtro espera a SFSP-150 |
| §14.4 | Catálogo de contratos | `SFSP-700` §0.4; `respuestas/BLOQUE-1-INVENTARIO.xlsx` | ✅ | n/a |
| §14.5 | Supply sin ubicar y ONDK temprano | `SFSP-700` §0.5 | ✅ | ✗ Bloqueado: credenciales |
| §15 | Gobernanza y operación, conciliación diaria | `SFSP-800` §0.2; `SFSP-900` §0.1 | ◐ | ◐ `reconcile.ts` sí; job diario no |
| §16 | Condiciones de arranque | `SFSP-900` §0.3 (+ nodo de la 8532) | ✅ | n/a (personas) |
| §17 | Estado de las series | Esta tabla | ✅ | — |
| §18 | Decisiones abiertas | `DECISIONES-SFSP.json` (`propuestaV02` en D00–D03, D16 y D20) | ✅ | — |
| Apéndice A | Estados | `spec/ESTADOS-Y-EVENTOS.md` §A | ✅ | ◐ Ver las diferencias por objeto |
| Apéndice B | Eventos | `spec/eventos.json` (29 eventos) y `ESTADOS-Y-EVENTOS.md` §B | ✅ | ◐ 12 con contrato, 17 sin él |
| — | Códigos de motivo | `ESTADOS-Y-EVENTOS.md` §C (primer catálogo) | ◐ | ✗ |

---

## Lo que necesita una decisión humana antes de seguir

1. **Firmar el v0.2 como base.** Con eso, D00, D03 y D16 pasan a `APROBADA` con su acta.
2. **El activo: un estado o seis ejes** (`ESTADOS-Y-EVENTOS.md` §A.1). La propuesta es conservar los ejes y publicar el estado como vista derivada.
3. **El cambio de norma de SFSP-300** (acuñar antes, colocar solo con metal): el v0.2 lo decide, pero mueve el riesgo a la frontera de la tesorería. Las salvaguardas están en `SFSP-300` §0.2.
4. **Los números de serie nuevos**: SFSP-140 (licencias) y SFSP-150 (red cerrada) caben en la centena 100, que el v0.2 dejó con espacio. Si prefieres otra numeración, se cambia ahora, antes de que haya código.
5. Las decisiones de siempre: D01, D02, D07, D11 y D12 (ver `PLAN-SFSP-v0.2-2026-09-23.md` §6).

## Qué se corrigió respecto al plan del 23-sep

El plan decía que el motor de elegibilidad «bloquea, lo contrario de lo que pide el v0.2». Es más fino. El motor bloquea **cuando no hay política**, y eso es correcto y se conserva. Lo que falta es la **matriz de países como política**, que resuelve un país no evaluado a `SOLO_ENTRANTE`. No hay contradicción de principio: hay trabajo pendiente (`SFSP-120` §0.2).
