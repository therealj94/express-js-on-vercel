# Plan de construcción · todo armado, conectado y apagado

**24 de septiembre de 2026.** El pedido de José: *«llevar todo esto a producción no en vivo: dejarlo armado, diseñado y conectado, para subirlo al en vivo solo cuando yo diga»*.

Este documento dice **cómo se construye**. No ejecuta nada. Nada de lo que describe se publica, se despliega ni se enciende sin la orden expresa de José, **paso por paso**.

Se apoya en lo que ya existe:
- `PLAN-SFSP-v0.2-2026-09-23.md`: qué falta.
- `TRAZABILIDAD-SFSP-v0.2.md`: dónde queda cada sección del v0.2.
- `COMO-FUSIONAR.md`: cómo se conecta cada producto.
- `runbooks/release-p11.md`: cómo sale cada entrega.

---

## 0 · Qué quiere decir «listo pero apagado»

Cada pieza (contrato, servicio, pantalla o conexión) pasa por cuatro estados. **El último lo decides tú.**

| Estado | Qué quiere decir | Dónde vive | Quién lo decide |
|---|---|---|---|
| **Construido** | Código completo, pruebas en verde, artefacto compilado con su huella (*digest*) | Repositorio, rama de trabajo | Las pruebas |
| **Conectado en sombra** | Integrado en el producto detrás de un interruptor `SFSP_*` que en producción está **apagado**. En el ensayo se enciende en modo sombra: consulta, compara y registra, **sin cambiar nada de lo que el usuario ve o firma** | Repositorio y entorno de ensayo | La evidencia del ensayo |
| **Listo para subir** | Paquete de salida P11 completo menos tu firma: versión, huella, configuración, artefacto de reversión verificado, comandos exactos leídos y comprobados, y pruebas de humo | `releases/` | Yo lo preparo |
| **En vivo** | Se promueve **el mismo artefacto**, sin reconstruir. Primero apagado, luego en sombra, luego conmutado, producto por producto | Producción | **Tú**, con la firma P11 de cada paso |

**Tres reglas que no se negocian:**

1. **Se construye una vez y se promueve el mismo artefacto.** Lo que se probó en el ensayo es, byte a byte, lo que sube.
2. **Subir no es encender.** La primera subida a producción lleva todos los interruptores apagados, y el usuario no nota nada. Encender la sombra, conmutar y fijar parámetros son pasos separados, cada uno con tu firma.
3. **Un interruptor encendido nunca es una autorización monetaria.** Precio, comisión y cupos se cargan solo por acta de Junta.

### Lo que no haré sin tu «súbelo»

- Desplegar contratos en cualquier red real (5550, 5534 u 8532).
- Subir a las apps de producción en Amplify, Heroku o Render.
- Publicar actualizaciones OTA o builds en los canales `preview` o `production`. **`preview` usa el backend de producción.**
- Fusionar en `main`, `preview` o la rama *phantom*: **hoy esas fusiones publican solas** (anexo B).
- Encender un interruptor `SFSP_*` en producción, fijar un parámetro económico o tocar credenciales.
- Crear entornos de ensayo que cuesten dinero: se crean solo con tu visto bueno.

**Dónde se trabaja:** en la rama `claude/galaxy-web-review-260wt4`. Empujar ahí **solo corre pruebas** (`pruebas.yml` y `sfsp.yml`), comprobado en los disparadores. No se toca ningún archivo `.solicitud-de-build`, porque esos disparan builds desde cualquier rama.

---

## 1 · Cuándo está terminado

- [ ] Cada fila de `TRAZABILIDAD-SFSP-v0.2.md` tiene especificación **y código**. Lo que depende de personas (licencias, custodia, abogados) queda marcado como tal.
- [ ] `VERIFICACION_COMPLETA` en el SHA de la release: suites, tipos, conformidad entre la especificación y el código sin divergencias. Además, **todas las pruebas de aceptación de la `draft-0.4` escritas y en verde** (T-120-20…, T-140-01…, T-150-01…, T-200-20…, T-300-20…, T-400-17…).
- [ ] Revisión de seguridad interna y **reproducción externa P11** con su informe.
- [ ] **Ensayo general superado dos veces seguidas** sobre los mismos artefactos, incluida la reversión.
- [ ] Cada producto conectado en sombra, con **cero diferencias sin explicar** sobre el censo sintético completo.
- [ ] Una prueba automática confirma que **la configuración de producción tiene todos los interruptores SFSP apagados**.
- [ ] El paquete P11 listo por servicio, y el manifiesto completo: qué corre, dónde y en qué versión.
- [ ] **La prueba de que no se tocó producción:** `comparar-publicado.py` y la versión de cada servicio muestran lo mismo que antes de empezar.

---

## 2 · Los tres entornos

| Entorno | Para qué | Qué necesita | Estado |
|---|---|---|---|
| **Taller** (aquí) | Construir y probar todo con datos sintéticos: contratos en Hardhat, servicios en local, pantallas con Playwright | Nada | **Disponible.** Besu real no: Docker está instalado pero sin el servicio corriendo, y Besu 26.7.1 pide Java 25 (aquí hay 21). Lo intento; si no se puede, esas pruebas pasan al ensayo |
| **Ensayo** | Todo conectado de punta a punta, igual que producción, **sin usuarios ni dinero** | D12, tus credenciales y un presupuesto | Por crear |
| **En vivo** | La producción actual | Tu orden, paso por paso | Intacto |

**Por qué el ensayo no puede ser la 5534.** Comparte máquinas con la 5550 y la 8532, y su génesis salió del estado real. El manifiesto de despliegue exige para eso una **devnet desechable, con su propio chainId y llaves nuevas**.

**El ensayo tiene:**
- una devnet QBFT de 4 validadores con Besu 26.7.1, como producción;
- un backend de ensayo;
- un **Genesis ID de ensayo**, porque hoy el canal `ensayo` de la app habla con el Genesis ID de producción;
- la web en la app de ensayo de Amplify (`d289v5ffkexk23`, que ya existe);
- el canal EAS `ensayo` con su backend **por HTTPS** (hoy es una IP en texto plano);
- ORDENSCAN, Ordenex, MyTokenPay, DBNX y el indexador de ensayo.

Todo con datos sintéticos. La primera prueba del ensayo es demostrar que **desde él no se alcanza producción**.

---

## 3 · Las olas

| Ola | Contenido | Semanas (aprox.) | Arranca con |
|---|---|---|---|
| 0 | Cimientos: una sola verdad, nada que se publique solo, seguridad | 1 | Tu visto bueno a este plan |
| 1 | Diseño de las pantallas nuevas, para aprobar | 1–2 | En paralelo |
| 2 | Protocolo completo: contratos y herramientas de despliegue | 1–5 | Tus tres respuestas de la fase 2 |
| 3 | Servicios del protocolo | 3–6 | Ola 2 avanzada |
| 4 | Conexión con cada producto, en sombra | 4–8 | Olas 1 y 3 |
| 5 | Ensayo general y reproducción externa | 2 desde que exista el ensayo | D12 y credenciales |
| 6 | Paquete de encendido: todo listo, esperando tu orden | 1 | Ola 5 en verde |

El camino crítico **no es el código**: son las decisiones y el entorno de ensayo. Si el ensayo existe en la semana 6, el paquete de encendido está listo hacia la semana 10 u 11.

### Ola 0 · Cimientos

| # | Qué | Por qué | Necesita |
|---|---|---|---|
| 0.1 | **Un solo backend.** El que corre en Heroku (`vetawallet`) es el repo aparte `therealj94/veta-wallet-backend-`. Se declara canónico, la copia del monorepo se reemplaza por una nota que apunta a él, la integración continua pasa a probar el canónico, el guion de despliegue corre las pruebas antes y solo sale del canónico, y sus pruebas dejan de depender del monorepo | La copia del monorepo va 12 días atrás y **su guion de despliegue empaqueta esa copia vieja**: correrlo haría **retroceder producción** (se perderían las recargas atascadas y Google Wallet). Hoy la integración continua prueba la copia vieja | Tu OK (D11 para el backend) y **agregar ese repo a esta sesión** |
| 0.2 | **Nada se publica solo.** Las publicaciones (OTA, builds, autodespliegue de Render) pasan a ser manuales, con un entorno «produccion» de GitHub que exige tu aprobación. `autoDeploy: false` en `render.yaml` | Hoy una fusión publica en teléfonos reales y Genesis ID se despliega solo (anexo B) | Tu OK: cambia cómo publica tu equipo |
| 0.3 | **Seguridad.** Escáner de secretos (gitleaks) en los tres repos. Borrar la contraseña de H01 de `ENTREGA.md` **después de que la rotes**. **La clave de CoinMarketCap está escrita en el código** (`controller/chainController.js`, en las dos copias del backend): pasarla a una variable y rotarla. Confirmar que las cadenas con forma de credencial en las pruebas son sintéticas. La barrera H02 en ULTRON-APP | Tres de las condiciones de arranque del v0.2 (§16) | Tú rotas; yo hago el resto |
| 0.4 | **Una sola fuente de precio y de red**, construida y **sin cambiar todavía el comportamiento en vivo**. Un paquete de referencia único, a partir de `infra/ordenex-api/lib/referencia.js`, que es el mejor que hay (30 s de frescura y 5 min de límite; su cabecera dice 10 min, se corrige). Sin caída silenciosa a 0,01. Un RPC único. Se retiran los nombres de la 8532 | Hoy hay **cinco precios** de ORIGEN: 0,01 fijo en el backend; ≈2,57 en la web, las apps, el explorador y Ordenex; `OG_TOKEN_PRICE_USD` en el reporte AML; `|| 1` en la tarjeta; y fuentes propias en MyTokenPay y AU-RA. Los envíos usan un RPC guardado en Mongo, y hay dos servidores por defecto distintos | Nada para construir. **Encenderlo exige D01**: es un camino de dinero |
| 0.5 | **Un solo puente Genesis ↔ Veta** | Hay dos copias que ya divergen | Nada |
| 0.6 | **Saber qué corre**: una ruta `/version` con el SHA en cada backend, el manifiesto de servicios, y `rescate-produccion/SUBIR.md` reescrito | Sin esto no se puede demostrar qué está en vivo, y el v0.2 lo pone como condición antes de cerrar la red | Nada |
| 0.7 | **Empaquetar el SDK** para los productos: build doble (ESM y CommonJS) y una copia con huella dentro de cada producto | Los productos son CommonJS o babel, y un `file:` no sobrevive al despliegue | Nada |

**Se acepta cuando:**
- ninguna fusión a `main` dispara una publicación (comprobado en los disparadores);
- el escáner de secretos está limpio;
- el backend canónico tiene sus pruebas corriendo en la integración continua.

### Ola 1 · Diseño

Prototipos en HTML con la marca (oro sobre negro, Cinzel), para que los apruebes **antes** de programarlos:

1. **Veta Wallet · Ficha del activo** (Asset Passport):
   - riesgo R1–R5 con su advertencia;
   - segmento;
   - cobertura contra lo colocado;
   - campos vencidos marcados como «vencido»;
   - custodio y valuador;
   - licencias «en trámite».
2. **Veta Wallet · Antes de comprar:** la declaración del adquirente y el límite de exposición autodeclarado.
3. **Veta Wallet · Tesorería:** comprar y vender ORIGEN con el diferencial a la vista, y un guion cuando el oráculo está viejo.
4. **Veta Wallet · Redención de AUKA:** el canal ORIGEN abierto; el envío y el retiro, «en trámite».
5. **Veta Wallet · Número de cuenta SFSP y alias.**
6. **Portal DBNX:** expediente en 8 bloques, matriz de países, riesgo, licencias y autorizaciones.
7. **ORDENSCAN:** `/pasaporte/<id>` y `/transparencia` (acuñado, tesorería, colocado, cobertura, conciliación diaria y eventos).
8. **La etiqueta de disponibilidad única** en todos los productos: DISPONIBLE, BETA, PRÓXIMAMENTE, USO INTERNO.

**Se acepta cuando** apruebas las pantallas y los textos pasan las reglas de la Junta:
- «referenciado, nunca respaldado»;
- ninguna licencia insinuada;
- ninguna proyección de precio;
- y, **mientras no haya metal custodiado**, AUKA sin la palabra «respaldado».

### Ola 2 · Protocolo completo

**Contratos**, cada uno con sus pruebas de aceptación, conformidad y pruebas adversarias:

| Pieza | Serie | Qué hace |
|---|---|---|
| `SFSPLicenseRegistry` | 140 | Licencias por titular. Los demás contratos lo consultan antes de operar un módulo |
| Motor de elegibilidad, ampliado | 120 | La matriz de países con sus 4 estados, «solo entrante» por defecto, la acción `SUBSCRIBE`, `CountryStatusChanged`, el límite de exposición como dato firmado y `EligibilityRecorded` (solo un compromiso) |
| Registro de activos, ampliado | 100 | Los campos del pasaporte del v0.2 con vigencia por campo, `PassportUpdated`, `AssetStatusChanged` y la vista derivada del estado |
| Emisión, ampliada | 200 | `SupplyExpansionDeclared` con su prueba de neutralidad, y `SplitExecuted` |
| `SFSPCommodityEngine` | 300 | Lotes, billeteras de tesorería registradas, `RELEASE` con capacidad de colocación, cobertura contra lo colocado, redención completa con la quema antes de entregar, canales atados a la licencia y no doble cómputo |
| `SFSPOracleRegistry` y `SFSPTreasuryDesk` | 400 | Oráculo único con frescura; la tesorería que cotiza con sus 5 controles |
| Admisión a la red | 150 | **ADR-015**: el mecanismo que soporta Besu 26.7.1, probado sobre un Besu real |
| Motor de pagos y acciones corporativas | 200 | Solo hace falta para deuda y participación en ingresos. Va al final de la ola |

**Herramientas de despliegue:** guiones deterministas con modo de simulación, el generador del manifiesto de direcciones, un verificador posterior que compara el código desplegado con la huella del artefacto, y un cargador de parámetros que **se niega a cargar un `null`**.

**Se acepta cuando:**
- hay `VERIFICACION_COMPLETA` en el SHA de la release;
- la trazabilidad muestra código en cada fila que no dependa de personas;
- está hecha la revisión de seguridad interna;
- y la reproducción externa P11 está pedida.

### Ola 3 · Servicios del protocolo

| Servicio | Qué hace |
|---|---|
| **Indexador como servicio** | Lee la cadena, guarda y publica la API de transparencia, filtrada por privacidad |
| **API y portal de DBNX** (`infra/dbnx-api/`, `apps-web/dbnx/`) | Hoy **no existen**. Casos, riesgo, licencias y matriz, con operadores identificados por Genesis ID |
| **Referencia de precio única y publicador del oráculo** | Todos los consumidores leen de ahí. El publicador firma con su **propia** llave |
| **Conciliación diaria** | Cadena contra ledgers paralelos: `OrigenBalance` (billetera), `cuentas` y `asientos` (Ordenex), `movimientos` (MyTokenPay) y `libro` (AuCorp). `S0 = A + N + P`, con `ConciliationRecorded` y alertas |
| **Emisor de atestaciones EIP-712 en Genesis ID** | Llave y interruptor propios. **No reutiliza el ancla**, que ya escribe en la 5550 |
| **Agregador de exposición por Genesis ID** | Calcula el agregado fuera de la cadena y firma el resultado |
| **Directorio de cuentas SFSP-130** | Censo N/N de las cuentas, en simulación, sin mover nada |
| **Salud y alertas** | Oráculo viejo, descuadre, liquidaciones en `UNKNOWN` y estado de la cadena |

**Se acepta cuando** cada servicio tiene pruebas, `/salud`, `/version` y su configuración documentada (solo nombres), y corre en el taller contra Hardhat con datos sintéticos.

### Ola 4 · Conexión con cada producto, en sombra

En el orden de `COMO-FUSIONAR.md`. Cada producto recibe un módulo de interruptores con el patrón que ya usa Ordenex: **apagado salvo `'1'`**, visible en `/salud`. Las rutas exactas están en el **anexo A**.

| Orden | Producto | En sombra hace |
|---|---|---|
| 1 | Genesis ID | Emite atestaciones de prueba y registra, sin publicar |
| 2 | Backend de la billetera | Compara precio y comisión. Arma el censo N/N de cuentas SFSP **sin mover nada**. Resuelve número de cuenta y alias, y lo registra |
| 3 | Veta Wallet web y app | Pantallas nuevas tras el interruptor. Compara el catálogo del registro con **las unas 10 copias** que hay hoy del catálogo de tokens. La app, solo en el canal `ensayo` |
| 4 | ORDENSCAN | Pasaporte y transparencia desde el indexador |
| 5 | Ordenex | Tras cada trato, arma la liquidación DvP que haría el protocolo y la compara con el trato y los asientos. **No transmite nada** |
| 6 | DBNX | Opera en el ensayo con casos sintéticos |
| 7 | MyTokenPay y AuCorp | Liquidación en sombra. MyTokenPay pierde `USE_MOCK_API`, guarda el POS en base de datos y verifica en la 5550 |
| 8 | AU-RA FP | Conectado al SDK **solo para leer**: listas de verificación e inconsistencias. Nunca aprueba |

**Se acepta cuando**, en el ensayo, la sombra de cada producto da **cero diferencias sin explicar** sobre el censo sintético completo, y la prueba de «producción apagada» está en verde.

### Ola 5 · Ensayo general

1. Crear el ensayo (§2) **con tu visto bueno y tus credenciales**, y demostrar que desde él no se alcanza producción.
2. Desplegar en el ensayo **con los mismos guiones y artefactos** que se usarán en producción.
3. Correr los escenarios, todos seguidos:
   1. Registrar un activo sintético y abrir su expediente en DBNX con los 8 bloques.
   2. Publicar su pasaporte y comprobar que se ve en la billetera y en ORDENSCAN.
   3. Un país no evaluado: recibe y transfiere, pero **no suscribe**.
   4. El límite de exposición, con dos direcciones de la misma persona.
   5. Una orden en Ordenex liquidada DvP, visible en el indexador.
   6. Conciliación diaria en verde; después, un descuadre provocado que **detiene la emisión**.
   7. Un lote sintético de AUKA: sin metal no se coloca; con metal, sí.
   8. Redención en ORIGEN: 1 AUKA = 1.710,6925 ORIGEN. Los canales físicos, cerrados por licencia.
   9. El oráculo se vuelve viejo: la tesorería deja de cotizar y la pantalla muestra un guion.
   10. Una pausa de emergencia que caduca sola.
   11. La red cerrada bloquea un contrato heredado en su bloque de corte; migración de un token heredado sintético.
   12. **Reversión de cada servicio** a su artefacto anterior.
4. Corregir y repetir hasta pasar **dos veces seguidas** sobre los mismos artefactos.
5. **Reproducción externa P11** y, antes de la 5550, auditoría externa de los contratos nuevos (recomendada).

### Ola 6 · Paquete de encendido

**Por servicio,** el paquete P11 completo menos tu firma.

**El runbook de encendido,** paso por paso. Cada paso es una orden tuya:

| Paso | Qué pasa | Qué ve el usuario | Qué hace falta |
|---|---|---|---|
| 1 | **Subir apagado**: backends, webs y apps con los interruptores apagados | Nada | Firma P11, facturación de AWS y credenciales |
| 2 | Sombra en producción: compara y registra | Nada | Firma P11 |
| 3 | Equivalencia: cero diferencias sobre el censo **real**, a un bloque común | Nada | El informe |
| 4 | Conmutar, producto por producto | El cambio, con camino de vuelta | Firma P11 por producto |
| 5 | Contratos en la 5550 y registro de activos | Pasaportes públicos | Las condiciones del §16 cerradas, D07 (firmantes), D08, D09 y la auditoría |
| 6 | Red cerrada: lista de despliegue y filtro | Nada, si todo va bien | El manifiesto completo y D07 |
| 7 | Parámetros económicos por acta | Precio y comisión únicos | D01, D02, D03 (firmar el v0.2) y D04 |
| 8 | Colocar AUKA y AGKA; redención física | Compra con respaldo real | Metal custodiado y atestado, D05 y licencia Clase G |

---

## 4 · Lo ya hecho que queda empaquetado, sin subir

| Qué | Queda como | Para subirlo |
|---|---|---|
| Veta Wallet web (galaxia de los logos y sus arreglos) | Paquete P11 | Facturación de AWS y tu orden |
| MyTokenPay web | Paquete P11 | Ídem |
| API de AuCorp | Paquete P11 y la app de Heroku por crear | Tu orden |
| Contrato VentaOrigen | Paquete P11 | Acta, BNB, dueño y operador |
| `orden-global-app` v1.34 | Build en el canal `ensayo` | Cuentas de tienda y tu orden |
| Tráileres de ORIGEN | Listos | Licencia comercial de la voz |

---

## 5 · Riesgos conocidos y cómo se evitan

| Riesgo | Cómo se evita |
|---|---|
| El guion de despliegue del backend sube una copia vieja | Ola 0.1, antes de tocar nada |
| Una fusión publica en teléfonos o en Render | Ola 0.2, antes de cualquier fusión |
| Cinco precios de ORIGEN | Referencia única (0.4), encendida solo con D01 |
| La 5534 no está aislada | Devnet desechable en el ensayo |
| No hay Besu real en el taller | Las pruebas de red cerrada se hacen en el ensayo |
| El ancla de Genesis ya escribe en la 5550 | Emisor nuevo con llave e interruptor propios |
| Ramas viejas sin fusionar (el mercado P2P, la tesorería de tokens) | No se fusionan: traen servicios nuevos y revierten trabajo reciente |
| El catálogo de tokens copiado en unos 10 sitios | La sombra los compara todos contra el registro |
| Ledgers paralelos fuera de la cadena | Entran en la conciliación diaria |
| Parámetros en `null` | Por diseño: el sistema se construye completo y bloquea (`BLOCKED_DECISION`) hasta el acta |

---

## 6 · Qué necesito de ti para arrancar

1. **Aprobar este plan.**
2. **Backend canónico = `therealj94/veta-wallet-backend-`**, y agregarlo a esta sesión.
3. **Aprobar las compuertas de publicación** (ola 0.2).
4. **Las tres respuestas de la fase 2:**
   - ¿acuñar AUKA y AGKA por adelantado, con las salvaguardas?
   - ¿los seis ejes de estado con tu estado como vista derivada?
   - ¿la numeración 140 y 150 para las series nuevas?
5. **Rotar** la contraseña de H01 y la clave de CoinMarketCap.

**Más adelante:**
- D12 y el presupuesto del ensayo (ola 5);
- quién hace la reproducción externa P11;
- confirmar con quien tenga acceso a los nodos qué permite Besu 26.7.1 para la red cerrada.

---

## Anexo A · Puntos de conexión por producto

| Producto | Código en producción | Dónde se engancha |
|---|---|---|
| Backend de la billetera | Repo `veta-wallet-backend-` (Heroku `vetawallet`) | Interruptores nuevos en `lib/sfsp/`. Precio en `lib/origenPrice.js` (`getOrigenPriceUsd`), comisión en `lib/comision.js`, envíos en `controller/transactionController.js` (`send`, `sendToken`), censo en `lib/censoGenesis.js` y puente en `lib/genesisPuente.js` |
| Genesis ID | `genesis-id/` (Render, hoy con autodespliegue) | `src/credencial/atestacion712.ts` (nuevo), alcance en `src/auth/aplicaciones.ts`, ruta en `src/routes/apps.ts` y dominio en `src/routes/publico.ts` |
| Veta Wallet web | `apps-web/veta-wallet/` (Amplify) | `app.js`: `vToken()`, `vIdentidad()` y `VISTAS`; catálogo en `cadena.js`; **la CSP de `index.html` es una lista cerrada** y cada API nueva va ahí |
| App | `orden-global-app/` (EAS) | `src/screens/TokenDetail.js`, el Passport de `More.js` y `src/api.js`. Solo el canal `ensayo` |
| ORDENSCAN | `ogscan-backend/` (Heroku), `ogscan-frontend/` (Amplify) | Router nuevo en `src/app.js`, montado **antes** del 404; rutas nuevas en `pintar()` |
| Ordenex | `infra/ordenex-api/` (Heroku) | Después de `lib/motor.js` `aplicarTrato()`; liberación en `lib/p2p.js`. Interruptores con el patrón de `lib/compra.js` |
| MyTokenPay | `infra/mytokenpay-api/` (Heroku) | `src/lib/cadena.ts` (renombrar `RPC_8532_URL`) y `src/lib/caja.ts`. La app: `USE_MOCK_API` en `mobile/src/lib/api.ts` |
| AuCorp | `infra/aucorp-api/` (sin desplegar) | `lib/asientos.js` `asentar()` |
| DBNX | No existe | `infra/dbnx-api/` y `apps-web/dbnx/` nuevos, sobre `sfsp/dbnx-api` empaquetado |

## Anexo B · Qué publica solo hoy (comprobado el 24-sep)

| Disparador | Qué publica |
|---|---|
| Fusión en `main` o *phantom* que toque `genesis-id-app/**` | OTA de la app de Genesis |
| Fusión en *phantom* o `preview` que toque `orden-global-app/**` | **OTA a los teléfonos** del canal `preview`, que usa el backend de producción |
| Fusión en *phantom* o `preview` que toque `veta-wallet-app/**` | OTA de `veta-wallet-app` (que además trae la 8532 por defecto) |
| Tocar `orden-global-app/.solicitud-de-build` o `veta-wallet-app/.solicitud-de-build`, **en cualquier rama** | Un build |
| La rama conectada en Render | Autodespliegue de `genesis-id` y `aura-buzon` |
| `pruebas.yml` y `sfsp.yml` | Solo pruebas. Son los únicos que corre la rama de trabajo |
