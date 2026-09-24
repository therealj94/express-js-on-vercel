# Plan SFSP · de lo que tenemos a la red en operación

**23 de septiembre de 2026.** Este plan cruza el borrador **SFSP v0.2** (documento de José, 23-sep) con lo que existe hoy en los repositorios y en producción.

Todo lo que dice «existe» se comprobó en el árbol, y las pruebas se corrieron donde se indica. No contiene ningún secreto: donde hay uno, solo dice dónde está.

---

## 0 · En una página

| | Estado |
|---|---|
| **Especificación** | `sfsp/spec/` tiene 13 series, en *draft-0.3*. Va por delante del v0.2 en lo técnico (SFSP-130 cuentas, SFSP-AUTH-v1) y **por detrás en lo nuevo del v0.2**: registro de licencias, matriz de países, segmentos, límite de exposición, tesorería cotizadora y red cerrada. |
| **Código del protocolo** | 9 contratos Solidity, SDK, indexador y API de DBNX. La última corrida completa tiene **509 pruebas en verde**. Hoy se volvieron a correr el indexador (67/67) y el SDK (164/164). |
| **Desplegado en alguna red** | **Nada.** Son 0 contratos, 0 direcciones y 0 transacciones (`sfsp/deploy/MANIFIESTO.md`). |
| **Auditoría** | Hay 46 puntos y el autor da **45 por cerrados**. Queda abierto **P11**: que un tercero reproduzca las pruebas desde cero. |
| **Decisiones** | Las **22 (D00–D21) están PENDIENTES** en `sfsp/DECISIONES-SFSP.json`, y todos los parámetros económicos están en `null`. |
| **Dónde vive** | `sfsp/` existe **solo** en la rama `claude/galaxy-web-review-260wt4`. No está en `main`. |
| **Condiciones de arranque (§16 del v0.2)** | Las 10 siguen abiertas. Hay 3 críticas: la credencial en texto plano, las pruebas destructivas sin barrera y el modo de precio de ORIGEN sin verificar. |

**Veredicto.** El protocolo está bien diseñado y probado en aislamiento, pero todavía no toca la realidad. Lo que falta para que la toque no es sobre todo código: son **decisiones de la Junta, credenciales y seguridad de base**. El código que falta está acotado y se lista en la fase 3.

---

## 1 · El documento v0.2 contra el repositorio, serie por serie

| Serie (v0.2) | Qué pide el documento | Qué hay en el repo | Qué falta |
|---|---|---|---|
| **§2.1 Red cerrada** | Una lista de quién puede desplegar y un **filtro de transacciones por destino** que deje los 172 contratos heredados sin operar | Nada. La interfaz de permisos de Besu está apagada y no hay ningún documento de *permissioning* | Confirmar qué mecanismo soporta la versión de Besu (permisos del cliente o un complemento). Después, especificarlo, probarlo en la 5534 y solo entonces encenderlo en la 5550, con firma múltiple |
| **SFSP-100 Core y Asset Passport** | El pasaporte con unos 25 campos, versionado y con vencimiento por campo | `SFSPAssetRegistry.sol` con pasaporte, ejes de estado, política con *digest* y 10 pruebas | **Cotejar campo por campo** contra el §4.2: valuador, custodio, cobertura, segmento, licencias, calendario, redención y «campo vencido se muestra como vencido». También el formato jerárquico del identificador |
| **§4.3 Vocabulario** | Acuñar, asignar, colocar y circular. Tesorería = acuñado sin colocar | El SDK usa `S_native`, `R_released` y `U_unactivated` | Alinear los nombres en la especificación y en la interfaz |
| **§6 Registro de licencias** | Licencias por entidad, jurisdicción, estado y vigencia. Un módulo sin su licencia se rechaza en el código | **No existe** | Una serie nueva, con contrato y pruebas. Debe resolver la dependencia **por titular**, no por operador |
| **SFSP-110 Identidad** | Genesis ID, un puente único con la billetera y el límite calculado por identidad | `SFSPIdentityAdapter.sol` con 17 pruebas | Un emisor EIP-712 en Genesis ID real. **Unificar los dos puentes** (`infra/genesis-proxy/genesis.router.js` y `infra/veta-wallet-backend/lib/genesisPuente.js`). Registrar la billetera en cada vínculo |
| **SFSP-120 Jurisdicción** | Acceso abierto por defecto. Matriz de países con 4 estados («solo entrante» por defecto). Regla de promoción | `SFSPEligibilityEngine.sol`, con lista blanca por activo. **Sin política, bloquea** | **La matriz como dato y como máquina de estados**, con el estado por defecto «solo entrante» (el contrato hoy hace lo contrario: bloquea). Primera ola de países |
| **SFSP-200 Securities** | Supply = capital ÷ precio. Colocación o división con prueba de neutralidad. Expediente de 8 bloques. **Segmentos** Principal y Crecimiento. **Límite de exposición por Genesis ID**. Motor de pagos. Acciones corporativas | `SFSPIssuanceController.sol`, `SFSPRegulatedAsset.sol` y `dbnx-api` (casos, plantillas, riesgo R1–R5, reporte), con 86 pruebas | **Segmentos, límite de exposición, prueba de neutralidad en las ampliaciones, motor de pagos y acciones corporativas: no existen** |
| **SFSP-300 Commodities** | Lotes en onzas finas, custodia distribuida, prueba de reservas, redención (envío, retiro presencial u ORIGEN) y no doble cómputo | **Solo la especificación**. Los eventos de reservas y redención están definidos, pero ningún contrato los emite | **Todo el código**: lotes, capacidad de colocación, cobertura, redención y quema antes de entregar. Hoy hay 0 onzas en custodia |
| **SFSP-400 Monetario** | ORIGEN con supply fijo de un billón y sin emisión. Oráculo único. Comisión de USD 0,01. Tesorería que cotiza con 5 controles | `SFSPFeeController.sol` (sin parámetro, bloquea), `SFSPCashVault.sol`, y `supply.ts` y `reservas.ts` en el SDK | **El oráculo único y la tesorería cotizadora no existen.** La especificación todavía describe la emisión contra reservas, que el v0.2 **descarta**: hay que reescribirla |
| **SFSP-500 Mercados** | Calce fuera de la cadena y liquidación con entrega contra pago en el protocolo | `SFSPSettlementEngine.sol`, con entrega contra pago atómica y 7 pruebas | El modelo de órdenes, los interruptores de circuito y la vigilancia. Ordenex tiene 0 operaciones |
| **SFSP-600 Privacidad** | Un dominio de estado privado o compromisos, sin apoyarse en la privacidad de Besu | Amenazas, clasificación y 2 prototipos (evaluados, sin implementar), y el filtro del indexador | Elegir la tecnología (D06) |
| **SFSP-700 Migración** | Migración **dentro de la misma cadena**: instantánea, raíz de Merkle, bloqueo por filtro y acuñación equivalente | `SFSPMigrationRegistry.sol` con 12 pruebas y el inventario de los 172 contratos en `respuestas/` | El filtro de transacciones (ver §2.1). Un guion de instantánea reproducible. **Conciliar los 9.823,01 AUKA y 792,5 ONDK sin ubicar** antes de migrar |
| **SFSP-800 Gobernanza** | Firmantes y umbrales por acción | `SFSPGovernanceController.sol` con *timelock*, pausa que caduca y roles | **Firmantes y umbrales reales (D07)** |
| **SFSP-900 Operación** | Manifiesto por servicio, conciliación diaria e incidentes | El manifiesto (todo en `null`), 13 guías de procedimiento y `reconcile.ts` | Guiones de despliegue, la conciliación diaria contra la cadena real y la observabilidad |
| **Apéndice A · Estados** | 15 objetos con su máquina de estados | Repartidos entre `CONTRATO-INTERNO.md` y `sdk/src/maquinas.ts` | Juntarlos en una sola tabla normativa. Faltan los de **licencia, país en la matriz y caso de admisión** tal como los nombra el v0.2 |
| **Apéndice B · Eventos** | Unos 28 eventos | `spec/eventos.json` tiene 15 | Faltan: licencia modificada, módulo habilitado, país modificado, permiso de red modificado, ampliación declarada, división, límite de exposición registrado, declaración del adquirente, vínculo de identidad y conciliación registrada. **Ojo:** el repo eliminó a propósito «Elegibilidad evaluada» y el v0.2 lo pide (ver §4) |

---

## 2 · Hecho y NO subido

| Qué | Dónde | Qué falta para subirlo |
|---|---|---|
| **Veta Wallet web**: vuelta a la galaxia de los logos, arreglo del teléfono chico, pantallas sin bucle, Genesis ID con una credencial, texto del login | `apps-web/veta-wallet/` (commit `f07343bd`) | **La facturación de AWS** (Amplify rechazó la subida del 22-sep). Después: `subir.py` al ensayo `d289v5ffkexk23`, luego a `d264zjawew1yea`, y `comparar-publicado.py` con 0 diferencias. En vivo sigue la galaxia de texturas del 20-sep |
| **Protocolo SFSP** completo | `sfsp/` | La decisión D11 (repo propio con `git subtree split`), D12 (*staging*) y P11 (reproducción por un tercero) |
| **Renombre a AU-RA FP** en la app de la Junta | ULTRON-APP `5088024` | Su `main` es una historia aparte: hay que aplicarlo con *cherry-pick*. Primero D20 (marca «AU-RA») |
| **MyTokenPay web** | `apps-web/mytokenpay/` | Subirla (Amplify `dd486t2t5w516`) |
| **API de AuCorp** | `infra/aucorp-api/` | Crear la app en Heroku y hacer `subtree push`. Falta también el puente con moneda fiduciaria |
| **Contrato VentaOrigen** | `infra/contratos-venta/` | Acta para fondear la pagadora (unos 20,96 ORIGEN), BNB, dueño y operador |
| **Apps móviles** | `orden-global-app` (v1.34.0), `genesis-id-app` | Cuentas de tienda (Apple de organización con D-U-N-S, Play Console) y el despliegue del backend. **MyTokenPay móvil tiene `USE_MOCK_API = true`: no publicar así** |
| **Tráileres de ORIGEN** v1, v2 y v3 | `entregables/trailer-origen/` | La licencia comercial de la voz de ElevenLabs. Revisar las cifras marcadas como «ejemplo» |
| **Guion «ORDEN»** | `entregables/video-orden-global/` | Producir el video |
| **Respuesta a la solicitud de información v0.2** | `sfsp/respuestas/` (PDF, HTML y hoja de cálculo) | Ya entregada. Sirve de base para las secciones 14 y 16 del v0.2 |

**Guía de subida desactualizada.** `rescate-produccion/SUBIR.md` describe como pendiente una subida que ya ocurrió el 20-sep. Hay que reescribirla con el estado actual (tarea de la fase 1).

---

## 3 · Bloqueado por personas o credenciales

| # | Qué | Quién | Por qué importa |
|---|---|---|---|
| B1 | **H01**: una contraseña de administrador en texto plano en `infra/mytokenpay-api/ENTREGA.md` | José: rotarla | Condición crítica del §16. Sigue en el historial de git: borrarla del archivo no basta |
| B2 | **H02**: pruebas destructivas (`TRUNCATE CASCADE`) sin barrera en ULTRON-APP | Técnico | Condición crítica del §16 |
| B3 | **El modo de precio de ORIGEN en producción** | Quien tenga acceso a Heroku | El código usa **0,01 USD fijo por defecto**; el modo oro solo corre con `OG_PRECIO_MODO=oro`. Los documentos se contradicen sobre qué corre hoy. Afecta depósitos y fondeo de tarjetas |
| B4 | Facturación de AWS | José | Frena toda subida web |
| B5 | Rotar Zernio, la llave vieja de AWS con permisos de administrador (sigue activa), cPanel, `info@`, Expo, Heroku y Render | José | Credenciales comprometidas |
| B6 | Copia fría de las llaves de validador: no cubre los 2 validadores del 20-ago, y 6 de los 7 discos no están cifrados | José genera su par de llaves | Condición alta del §16 |
| B7 | Los 7 validadores en una sola cuenta de nube | Junta y técnico | Condición alta del §16: un solo punto de falla |
| B8 | **Acta de la tesorería del 11 y 14-sep**: el ORIGEN está en 6 direcciones y el ONDK en 9, sin documentar | Quien firmó | Sin esto no se cierra la sección 14.5 ni la conciliación |
| B9 | La 8532: node1 sigue produciendo bloques con el RPC abierto | Técnico (D14) | Contradice el §14.1 («la 8532 está detenida») |
| B10 | Mensajería: degradación a texto en claro frente a la promesa de cifrado | Producto y legal | Condición media del §16. El lema de PULSE2CHAT dice «cifrado de punta a punta» |

---

## 4 · Contradicciones que hay que resolver antes de seguir

1. **«AUKA y AGKA están respaldadas» (§9.1)** frente a la regla de la Junta del 14-ago («ORIGEN, AUKA y AGKA NO están respaldadas… no hay oro en bóveda») y el propio §9.2 («no hay metal custodiado»). El §9.1 describe el **diseño objetivo**.
   - **Propuesta:** redactarlo como «quedarán respaldadas desde su primera colocación» y mantener la regla de la Junta en todo material público hasta que haya metal custodiado y atestado.
   - ORIGEN sigue «referenciado, nunca respaldado» (el §10.1 ya lo dice bien).
2. **«Ultron» en el §5** debe decir **AU-RA FP** (renombrado el 22-sep; decisión D20 pendiente de marca).
3. **Evento «Elegibilidad evaluada».** El v0.2 lo pide y el repo lo eliminó a propósito (para no publicar evaluaciones que permitan correlacionar identidades). **Propuesta:** que el evento solo publique una referencia o *hash* sin datos, o que viva en el dominio privado.
4. **El estado por defecto de un país.** El v0.2 dice «solo entrante» (acceso abierto). *(Corregido el 24-sep.)* No es una contradicción de principio: el motor bloquea **cuando no hay política**, y eso se conserva. Lo que falta es la **matriz de países como política**, que resuelve un país no evaluado a `SOLO_ENTRANTE` (`spec/SFSP-120` §0.2).
5. **La emisión de ORIGEN contra reservas.** El v0.2 la descarta (supply fijo de un billón). `SFSP-400` y el SDK aún la modelan. Esto **cierra D03** si la Junta firma el v0.2.
6. **La comisión.** El código cobra 0,001 ORIGEN (apagada). El plan maestro dice «0,01 ORIGEN». El v0.2 dice **USD 0,01 pagados en ORIGEN**. Queda un solo valor: el del v0.2, que depende de D02 y del acta.
7. **El precio de ORIGEN.** La billetera usa 0,01 USD por defecto y Ordenex unos 2,55 USD. El v0.2 exige una sola fuente (§10.5). **Mientras no se verifique el modo de producción, ningún material debe mostrar el precio en pantalla.**
8. **La 8532.** El §14.1 la da por detenida, pero `LA-8532-SIGUE-VIVA.md` documenta un nodo produciendo bloques.
9. **Nombre OGFP → SFSP.** El v0.2 adopta SFSP. `COMO-FUSIONAR.md` **prohíbe** renombrar dentro de los bytes firmados (dominios EIP-712 «OGFP»): el nombre visible cambia, los dominios de firma no. Hay que dejarlo escrito.
10. **Acuñar AUKA y AGKA por adelantado** *(encontrado el 24-sep).* La norma del repo lo prohibía (exigía metal para acuñar). El v0.2 lo permite y pone el control en la **colocación**. Se adopta la del v0.2, con salvaguardas en la frontera de la tesorería (`spec/SFSP-300` §0.2).

---

## 5 · El plan por fases

> **Actualización del 24-sep.** La construcción de las fases 3 a 5 (código, servicios, conexión con los productos, ensayo y encendido) se detalla en `PLAN-DE-CONSTRUCCION-2026-09-24.md`, que manda sobre lo que aquí se dice de esas fases.

Cada fase tiene una **condición de salida verificable**. No se pasa a la siguiente sin cumplirla.

### Fase 0 · Seguridad y verdad de base (semana 1)

*Todo esto lo hacen personas; yo preparo las guías y compruebo.*

| Tarea | Responsable | Salida verificable |
|---|---|---|
| Rotar H01 y todas las credenciales de B5. Reescribir `ENTREGA.md` sin el valor. Activar gitleaks | José | Una llamada con la credencial vieja falla, y gitleaks no encuentra nada |
| Poner la barrera H02 en las pruebas destructivas | Técnico | La prueba se niega a correr contra una base que no sea de prueba |
| **Verificar el modo de precio de ORIGEN en producción** | Técnico con acceso a Heroku | Queda anotado qué valor tiene `OG_PRECIO_MODO` y con qué fecha |
| Resolver la facturación de AWS | José | Amplify acepta un despliegue de prueba |
| Acta de la tesorería del 11 y 14-sep, con la lista oficial de billeteras | Firmantes | Un acta firmada en `documentos-junta/` |
| Copia fría de las 7 llaves y discos cifrados | José y técnico | Una constancia con la fecha y el alcance |
| Aclarar la 8532: comprobar, respaldar y cerrar el RPC | Técnico (D14) | El RPC no responde y hay una copia del estado fuera del nodo |

### Fase 1 · Subir lo que ya está hecho (semanas 1 y 2)

| Tarea | Condición |
|---|---|
| Subir Veta Wallet (primero al ensayo, después a producción) y comparar | Tras B4. `comparar-publicado.py` da 0 diferencias |
| Reescribir `rescate-produccion/SUBIR.md` con el estado real | Ninguna |
| **Decisión de ramas.** La rama de trabajo va 1.195 commits por delante de `main`. Propuesta: PR de la rama a `main` y `main` pasa a ser la verdad (decisión 3 del plan maestro) | La Junta o José |
| Sacar `sfsp/` a su repo propio (`git subtree split`) | D11 |
| Aplicar el renombre de AU-RA FP en el `main` de ULTRON-APP | D20 |
| Subir MyTokenPay web y la API de AuCorp | Tras B4 y B5 |
| Unificar el puente Genesis ↔ Veta en una sola copia | Técnico |

### Fase 2 · Llevar el v0.2 a la especificación (semanas 2 y 3) · ✅ hecha el 24-sep

Resultado: la especificación pasa a `draft-0.4`. Las series nuevas son SFSP-140 (licencias) y SFSP-150 (red cerrada). Los estados y eventos están unificados en `spec/ESTADOS-Y-EVENTOS.md`, con 29 eventos. La trazabilidad está en `TRAZABILIDAD-SFSP-v0.2.md`. El documento corregido con control de cambios está en `fuente/`.

*Esto lo puedo hacer yo en cuanto José lo pida.* Es texto y pruebas, sin tocar ninguna red.

1. Resolver las 9 contradicciones del §4 en el documento y en el repo.
2. Actualizar las series existentes al v0.2:
   - SFSP-400: supply fijo, oráculo único, tesorería con 5 controles;
   - SFSP-120: matriz de países, «solo entrante» por defecto, regla de promoción;
   - SFSP-200: segmentos, límite de exposición, prueba de neutralidad;
   - SFSP-700: migración dentro de la cadena con el filtro.
3. **Series y anexos nuevos:**
   - Registro de licencias (una serie nueva o dentro de la SFSP-100);
   - la especificación de la red cerrada (§2.1);
   - el Apéndice A unificado;
   - el Apéndice B con los eventos que faltan y su catálogo de códigos de motivo.
4. Cotejar el Asset Passport campo por campo contra el §4.2.
5. Hacer que `DECISIONES-SFSP.json` diga qué decisiones **propone cerrar** el v0.2: D00 (nombre SFSP), D03 (supply fijo), D16 (SFSP en lugar de OGFP 1.0) y el nombre de Ordenex. Siguen pendientes hasta que la Junta firme.

**Salida:** la especificación en *draft-0.4* coincide con el v0.2, `verificar-todo.mjs` está en verde y hay una tabla de trazabilidad entre cada sección del v0.2 y el archivo del repo que la cubre.

### Fase 3 · El código que falta, solo en la red de ensayo 5534 (semanas 3 a 8)

En orden de dependencia:

1. **Oráculo único de oro** (alimenta ORIGEN y AUKA), con la regla de frescura: si el dato está viejo, muestra un guion y no un valor.
2. **Tesorería cotizadora** con sus 5 controles. Espera los parámetros de D01 y D02.
3. **Registro de licencias** y bloqueo de módulos por dependencia.
4. **Matriz de jurisdicciones y límite de exposición por Genesis ID**. Espera los umbrales.
5. **SFSP-300 completo**: lotes, capacidad de colocación, cobertura, redención y no doble cómputo.
6. **Motor de pagos y acciones corporativas.** Solo es necesario antes de admitir deuda o participación en ingresos.
7. **Filtro de transacciones** con el mecanismo que confirme Besu, probado en la 5534.
8. Guiones de despliegue y conciliación diaria contra la 5534.
9. **P11:** un tercero reproduce todas las pruebas (`sfsp/auditoria/REPRODUCIR.md` y `PROMPT-REAUDITORIA.md`).

**Salida:** todo desplegado en la 5534, la conciliación diaria en verde durante 7 días seguidos y P11 cerrado con un informe externo.

### Fase 4 · Arranque en la 5550 (después de la fase 3)

1. **Las 10 condiciones del §16 cerradas**, con evidencia.
2. El manifiesto de despliegue completo: saber qué está desplegado y en qué versión. Es condición previa para cerrar la red.
3. Encender la red cerrada: la lista de quién despliega y el filtro, con firma múltiple (D07).
4. Registro transitorio de AUKA, AGKA y ONDK. Inactivar los heredados fuera del catálogo (§14.4).
5. **Conciliar los 9.823,01 AUKA y 792,5 ONDK** con el respaldo del 25-ago (necesita las credenciales rotadas). Decidir qué pasa con los adquirentes tempranos de ONDK.
6. Migrar cada activo a su contrato conforme: instantánea, raíz de Merkle, bloqueo, acuñación y conciliación.
7. La conciliación diaria en producción.

### Fase 5 · Colocación y mercado (depende de licencias y de custodia)

- **AUKA y AGKA** solo se colocan con **metal custodiado y atestado** (hoy hay 0 onzas). Antes hay que contratar custodios independientes.
- La redención física se habilita solo con la **licencia de custodia Clase G** otorgada. Mientras tanto, se liquida en ORIGEN.
- **Securities:**
  - el primer expediente de admisión es **ONDK**, con un valuador independiente;
  - hay que elegir la primera ola de países.
- **Ordenex** opera con la licencia **ATS Clase B**, y **nada se anuncia como disponible antes de tener la licencia** (§6).

---

## 6 · Decisiones que necesita la Junta, en el orden en que desbloquean

| Prioridad | Decisión | Qué desbloquea |
|---|---|---|
| 1 | **Firmar el v0.2 como base** y cerrar D00, D03 y D16 | Toda la fase 2 |
| 2 | **D01 precio de ORIGEN** y **D02 comisión** (con su acta) | La tesorería, el controlador de comisiones y el precio en la billetera y los videos |
| 3 | **D11 repositorios** y **la rama a `main`** | Subir y ordenar el código |
| 4 | **D07 firmantes y umbrales** | La red cerrada y la gobernanza |
| 5 | **D12 staging (5534)** | La fase 3 |
| 6 | D08 clasificación de HARV, IBS y los tokens menores. **D09 migración por activo** | La fase 4 |
| 7 | D05 custodia de AUKA y AGKA, y el límite de custodia interna | La fase 5 |
| 8 | La jurisdicción de DBNX (Nueva Zelanda o Próspera), la titularidad de las licencias compartidas (ATS Clase B y Non-Banking Lender) y la oponibilidad de los deslindes | Lo legal: necesita un abogado |
| 9 | D20 y D21: la marca AU-RA y la sociedad de AU-RA FP | Conectar AU-RA FP a las empresas |

---

## 7 · Qué puedo hacer yo ya, sin esperar a nadie

- [ ] **Fase 2 entera:** llevar el v0.2 a la especificación, con la trazabilidad y los eventos.
- [ ] Redactar las correcciones al documento v0.2 que salen del §4 (respaldo, AU-RA FP, evento de elegibilidad, 8532, OGFP/SFSP).
- [ ] Reescribir `rescate-produccion/SUBIR.md`.
- [ ] Preparar la guía de verificación del modo de precio (qué mirar en Heroku, sin tocar nada).
- [ ] Preparar el PR de la rama a `main`, para que alguien lo revise (sin fusionarlo).
- [ ] Empezar la fase 3 en código y pruebas locales: el oráculo, el registro de licencias, la matriz y la SFSP-300. **Sin desplegar**, con los parámetros en `BLOCKED_DECISION` hasta que la Junta decida.

**Lo que NO haré sin permiso expreso:** desplegar en cualquier red, subir a producción, tocar credenciales o fusionar en `main`.
