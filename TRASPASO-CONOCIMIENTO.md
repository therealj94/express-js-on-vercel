# Traspaso de conocimiento · ecosistema Orden Global

**Para quien llegue después —persona o IA— y tenga que entender cómo está todo
sin haber estado aquí.**

Fecha de corte: **18 de agosto de 2026**. Todo lo que sigue se comprobó leyendo
el repositorio y consultando producción ese día, o sale de documentos firmados
que se citan por nombre. Lo que no se pudo comprobar está marcado como tal.

---

## 0. Cómo leer este documento

Tres cosas antes que nada:

1. **Este documento no es la fuente.** Las fuentes son
   `infra/cerebro/conocimiento/` y el código. Si algo aquí choca con ellas,
   ganan ellas y hay que corregir esto.
2. **Hay contradicciones abiertas y están señaladas.** No son descuidos: son
   frentes que la Junta todavía no cerró. Repetir una afirmación contradicha
   hace daño. La sección 6 las lista.
3. **Ningún secreto se escribe aquí.** Ni llaves, ni contraseñas, ni
   direcciones de tesoro. Se dice dónde viven y quién los tiene.

---

## 1. Las reglas de la casa

Son de obligado cumplimiento y salen de errores ya cometidos. Quien las rompa
va a repetir un incidente que ya costó caro.

| Regla | Por qué existe |
|---|---|
| **Ni un dato inventado** | Ninguna cifra, precio o fecha sin fuente medida. Si no se pudo comprobar, se dice «no se pudo comprobar», nunca un número plausible. |
| **Nunca escribir el valor de un secreto** | Ni en un documento, ni en un commit, ni en un archivo de configuración. Solo se describe que hay que rotarlo. Los secretos viven en `scratchpad/` con `chmod 600`, **jamás en el repositorio**. |
| **No revocar tokens** | Instrucción explícita del presidente: *«menos revocar porque aún lo ocupamos»*. |
| **No mover fondos del tesoro sin acta escrita de la Junta** | Mover de una billetera madre exige acta. |
| **No borrar llaves AKIA de AWS** | Instrucción explícita. |
| **El WordPress viejo de cPanel no se toca** | Se despliega aparte y el dominio se apunta cuando la Junta lo decida. |
| **La contraseña de la billetera nunca sale de su origen** | No se pide ni se acepta fuera de la propia billetera. |
| **Genesis Core no se fotografía** | El panel interno del cerebro se explica, nunca se enseña en documentos que circulan. |
| **Despliegue de backend: siempre `git push heroku`, nunca un paquete** | |
| **Rama de trabajo: `claude/veta-wallet-phantom-design-7syah8`** | Nunca empujar a otra sin permiso explícito. |

---

## 2. La empresa

**Orden Global Corp** — Próspera ZEDE, Roatán, Honduras. Permiso
`88501978376475`, primer registro 23/07/2026. De ella dependen la cadena,
ORIGEN y todas las plataformas. Es el eje operativo del Pilar 2 del «Sistema
Financiero Social».

- **Accionista único hoy:** José Medardo Ordóñez Martínez.
- **Decidido, no ejecutado:** reestructurar en series de acciones, con acciones
  fundadoras de voto reforzado, y llevar el control a una tenedora en Emiratos
  Árabes. Los documentos se están preparando.
- **Junta de cinco:** presidente José Medardo Ordóñez; vicepresidente Carlos
  Leonardo Paguada; secretaria Melany Johan Ordóñez; vocales Mayra Carolina
  Enamorado y Vanesa Carolina Pinto. Quórum de tres, reuniones trimestrales,
  mayoría simple. **El CEO firma solo hasta cien mil dólares.**
- **Orden Global Blockchain Corp (Canadá):** existe, **sin rol operativo**.
- **AuCorp:** sociedad aliada, **dueña de Ordenex**. Hoy es una marca y un sitio
  web, no una institución licenciada.

### Licencias: ninguna

**Orden Global Corp no tiene NINGUNA licencia emitida.** El paquete está en
preparación ante la **RFSA de Próspera**. Primera ola, cuatro trámites:

1. FinTech ATS Clase B — para GoldeX Swap
2. Aviso de Oferta Exenta — para ORIGEN, AUKA, AGKA y ONDK
3. Licencia de Compañía de Inversión — cien mil dólares de capital
4. Prestamista No Bancario

**Prerrequisito de los cuatro:** formalizar la estructura accionaria ante
Próspera, porque los expedientes exigen identificar beneficiarios finales.

> **Esto es el riesgo número uno del expediente:** la operación está viva sobre
> base regulatoria incompleta.

---

## 3. Los activos digitales

### ORIGEN — la moneda

- 1 ORIGEN = 1 **gramin** = **1/55 de gramo** de oro.
  *(Cuidado: `portafolio-minero.md` dice lo contrario y está mal. Ver §6.)*
- **Figura jurídica: REFERENCIADO, nunca respaldado.** Terminología no
  negociable. Quien obtiene tokens es **adquirente**, no inversionista.
- **No existe oro físico extraído ni custodiado en bóveda.** El oro está en
  etapa de recurso o potencial minero, dentro de concesiones sin formalizar.
- **NI 43-101 es un estándar canadiense de reporte de recursos mineros**, NO una
  certificación de barras en bóveda. Eso lo hacen estándares de refinería tipo
  **LBMA Good Delivery**.
- **No hay dictamen jurídico externo escrito.** La definición se construyó en
  casa.
- Bóveda: la presidencia dijo el 16/08/2026 que se está montando en Próspera.
  Falta saber qué sociedad custodia, en qué etapa está el trámite, si es para
  ORIGEN o para AUKA, y con qué estándar se certificará.

### ONDK — la excepción

- **Security token / instrumento patrimonial digital.** Representa valor
  económico del ecosistema: minería, infraestructura y participación en las
  compañías del grupo.
- **Es el único que SÍ se declara RESPALDADO**, porque en Próspera se estructura
  como valor negociable y tiene otra naturaleza jurídica.
- **No es una acción:** da derechos económicos por contrato, sin voto ni
  condición de socio.
- El titular gana por apreciación y, secundariamente, por **ventanas de
  recompra** que Orden Global abre cada cierto tiempo — **no son un derecho
  permanente de rescate**, y eso es deliberado: evita crear una obligación de
  liquidez permanente.
- Cobertura: Licencia de Compañía de Inversión de la RFSA. **No puede
  mercadearse en Estados Unidos.**
- **Precio declarado** (cada cifra con acta):
  | Fecha | Precio | Acta |
  |---|---:|---|
  | 01/07/2024 | $1.00 | JD-2024-11 |
  | 01/12/2024 | $1.50 | JD-2024-12-01 |
  | 01/07/2025 | $1.70 | JD-2025-07-01 |
  | 01/01/2026 | $2.10 | JD-2026-01-01 |
  | 16/08/2026 | **$2.15** | JD-2026-08-16 |
- Verificable en `https://ordenex-api-ba4b27b8b51a.herokuapp.com/precio-declarado/ONDK`
- Un precio declarado **es el hecho de que la Junta lo resolvió en acta**. No
  predice el precio de mercado y no se mueve entre resoluciones.

### El resto de tokens de la cadena 5550

`AUKA`, `AGKA`, `MNKA`, `IBS`, `HARV`, `AUBEX`, `ASL`, `LOVE`, `REST`, `SOL`,
`AIT`, `AGRO`, `POLITICAL`. La tabla canónica con los contratos está en
**`infra/veta-wallet-backend/lib/saldos.js`** (`TOKENS_5550`) y debe coincidir
con `apps-web/veta-wallet/cadena.js`. **Si se añade uno en un sitio y no en el
otro, una cuenta con ese token pasa por vacía.**

### El tesoro

**Son CUATRO billeteras madre**, con 250.000 millones de ORIGEN cada una — un
billón en total, que es la emisión entera. De las madres se reparte a
operativas según el tokenomics; las operativas liberan según la referencia del
oro.

**Mover fondos de una madre exige acta de la Junta Directiva.** Las direcciones
no se divulgan por decisión del Protocolo de Seguridad de Accesos y
Credenciales, que gobierna también las llaves. **Ni direcciones ni llaves se
escriben en ningún documento.**

---

## 4. Las cadenas

| Cadena | Qué es | Estado |
|---|---|---|
| **5550** | La cadena nueva, con génesis construido y juzgado | Activa. Cuatro validadores QBFT en AWS, quórum de tres: tolera la caída de uno solo |
| **8532** | La cadena vieja | **Congelada y cerrada.** Se sustituye por la 5550 |
| **5534** | Red de pruebas | Sirve el RPC de pruebas desde tres máquinas pequeñas. `testnet.ordenscan.com` |

- **RPC de producción:** `rpc.ordenglobal-rpc.com` — la puerta por la que todo
  el ecosistema lee y escribe.
- El **validador real** se lee del `extraData` de cada bloque, **no** de una
  lista escrita a mano.

### Los seis nodos de la 8532 (EC2, con IP elástica)

| Nodo | Región | IP elástica | Instancia |
|---|---|---|---|
| node1 | us-east-1 | 23.23.205.33 | — |
| node2 | us-east-2 | 18.190.14.28 | `i-095947b80eea9d321` |
| node3 | us-east-1 | 54.205.125.99 | `i-0d13f09e3fcce722a` |
| node4 | us-east-2 | 18.226.95.184 | `i-0e9e55a9df0cd6ce7` |
| node5 | us-east-1 | 18.211.40.149 | `i-0fddf5712376e5b2e` |
| node6 | us-east-1 | 3.224.143.231 | `i-0bf474425fe5e635b` |

**Se accede por AWS SSM, no por SSH.** Leer la altura:

```sh
/usr/local/bin/polygon-edge status --grpc-address localhost:10000 \
  | grep 'Current Block Number' | grep -oE '[0-9]+$'
```

> **Cuidado:** `grep -oE '[0-9]+$' | head -1` a secas agarra el Chain ID (8532)
> en vez del bloque.

**Watchdog instalado en cinco nodos:** `/usr/local/bin/ogb-watchdog.sh` +
`ogb-watchdog.timer`, cada 3 minutos. Repara solo el estancamiento del syncer.
Ver con `journalctl -t ogb-watchdog -n 4 --no-pager`.

**Causa raíz ya diagnosticada del estancamiento:** el bucle del syncer se
bloquea en `<-s.newStatusCh`, y los avisos que llegan durante
`bulkSyncWithPeer` se descartan por ser un canal sin búfer con `default:`.

### Problema abierto y crítico de la cadena

> **La cadena tiene 1 solo validador, no 6.** El contrato de staking **no tiene
> dueño, no tiene lista blanca, no tiene límite de validadores y pide un solo
> ORIGEN para entrar**. Nadie puede corregirlo desde fuera: exige un cambio
> coordinado de las reglas. Toda la garantía económica de la cadena son
> **10 ORIGEN**. (Tarea #17, abierta.)

---

## 5. El cerebro: dónde vive el conocimiento

**Hay dos cerebros y una puerta entre ellos.** Esto es la pieza conceptual más
importante de todo el sistema.

| | **Genesis Core** | **AU-RA** |
|---|---|---|
| Dónde | `cerebro.ordenscan.com` · con contraseña | dentro de la billetera · público |
| Con quién habla | con nosotros | con cualquiera |
| Qué sabe | **todo** el ecosistema | solo lo que Genesis Core dejó salir |
| Para qué | revisar, vigilar y entrenar | asistir a quien usa el producto |

**Nada de lo interno puede llegar a lo público por accidente**, y no se confía
en que nadie se acuerde: se confía en un programa y una prueba.

### El único sitio donde se escribe

`infra/cerebro/conocimiento/saber.json` — **31 fichas: 15 públicas, 16
internas.** Cada ficha lleva `id`, `tema`, `publico`, `revisadoPor`,
`revisadoEn`, `palabras` (las formas en que alguien pediría eso), `es` y `en`.

Gana la ficha que comparta más palabras con la pregunta.

### Los documentos largos que la acompañan

| Archivo | Qué es | De quién |
|---|---|---|
| `legal.json` | **11 bloques** legales y **10 decisiones** para la Junta | Melany Ordóñez, Secretaria · 14/08/2026 |
| `legal-detalle.md` | el respaldo largo de lo anterior | ídem |
| `portafolio-minero.md` | portafolio de inversiones mineras | la compañía · 14/08/2026 |
| `mineria-pendiente-legal.md` | papeles que faltan para dar por buena la minería | la casa |
| `legal-contradicciones.md` | **dónde estos documentos chocan entre sí y con lo publicado** | la casa |

> **Ojo con el propio LEEME:** dice «12 bloques legales y las 8 decisiones».
> Contado el 18/08/2026, `legal.json` tiene **11 bloques y 10 decisiones**. El
> LEEME está desfasado; manda el JSON.

> **`legal-contradicciones.md` manda sobre los otros.** Un documento entregado
> **no se corrige por dentro**: se deja como está y el choque se anota aparte,
> con las dos versiones y la fecha en que se comprobó.

### Cómo sale a AU-RA

```sh
node infra/cerebro/publicar-saber.mjs           # publica
node infra/cerebro/publicar-saber.mjs --probar  # solo comprueba
```

Genera `apps-web/veta-wallet/saber.js`. **Ese archivo no se edita a mano**: se
regenera entero. Sin correr el publicador, AU-RA no se entera de nada — es a
propósito.

### Genesis Core, la proyección 3D

- `genesis-id/public/cerebro-3d.html` + `cerebro-3d.js` + `cara-3d.js` +
  `voz-core.js` + `guion-core.js` + `fichas-core.js` + `ambiente.js`
- **101 piezas · 136 conexiones · 16 regiones**, en `cerebro-datos.js`
- Se sirve en `https://genesis-id.onrender.com/genesis-core` (también
  `/cerebro-3d` y `/core`)
- **`fichas-core.js` es GENERADO — no se edita a mano.** Lo produce
  `infra/cerebro/armar-fichas-core.py` leyendo `legal.json`, `saber.json` y
  `portafolio-minero.md`. Hoy: 26 piezas con ficha · 31 secciones · 117
  párrafos · 100 datos · **16 fichas internas NO publicadas**.

**Las 16 regiones del mapa:**

| Región | Piezas | Región | Piezas |
|---|---:|---|---:|
| La cadena | 5 | Dominios | 6 |
| Nodos | 6 | Seguridad | 7 |
| Tokens | 15 | Sin resolver | 5 |
| Apps y webs | 10 | Tu decisión | 5 |
| Servidores | 1 | Equipo IA | 6 |
| Identidad | 6 | Código | 2 |
| Infraestructura | 7 | Legal | 9 |
| Minería | 5 | Junta Directiva | 6 |

**Decisión pendiente:** las 16 fichas internas no se publican. Hay que decidir
si se cierran tras sesión de operador o si se confirma que Genesis Core entero
es interno.

---

## 6. LAS CONTRADICCIONES ABIERTAS

**Esta es la sección que más importa.** Son afirmaciones vivas que el expediente
legal desmiente. Repetirlas hace daño.

### 6.1 Respaldo, bóveda y NI 43-101 — ALERTA ABIERTA

El expediente legal dice que **las tres afirmaciones son incorrectas**: respaldo
uno a uno, custodia en bóveda y certificación NI 43-101.

Sitios vivos que las siguen afirmando:

1. Fichas públicas `origen` y `boveda` de `saber.json`
2. El texto de portada en `apps-web/veta-wallet/i18n.js`
3. El PDF para inversionistas de `armar-dossier.py`
4. **`genesis-id/public/cerebro-datos.js`** — la pieza `cadena` dice literal:
   *«respaldada en oro físico certificado (NI 43-101). 1 ORIGEN = 1 gramín =
   1/55 g de oro en bóveda»*. **Encontrado el 18/08/2026 y no estaba en la
   lista anterior de la alerta. Súmalo.**

Es la **Decisión 4 de la Junta**. **No se corrige por mantenimiento**, porque el
expediente pide dictamen. **Mientras tanto, el PDF para inversionistas NO debe
circular.**

### 6.2 El documento minero se contradice con lo legal

`portafolio-minero.md`, entregado por la compañía el 14/08, choca en tres
puntos:

1. Escribe **ORIEGEN**; la moneda es **ORIGEN**.
2. Dice «tokens respaldados en metales preciosos» y «anclados a activos físicos
   reales», contra el **referenciado** no negociable.
3. **El que más daño hace citado suelto:** dice que un gramín es un gramo de oro
   y un ORIEGEN un cincuentaicincoavo de gramín. Es al revés: **un ORIGEN es un
   gramin, y un gramin es 1/55 de gramo**. Quien cite esa frase estará diciendo
   que la unidad vale **55 veces** lo que vale.

El documento se conserva tal cual lo entregó la compañía. **El cerebro no
repite esas tres cosas.**

### 6.3 Política de privacidad — corregido el 18/08/2026

Estaba publicada diciendo que **Veriff** recibe el documento y el selfie.
**Veriff nunca se conectó**: producción responde
`proveedorBiometria: "aws-rekognition:us-east-1"`. Y decía que los datos están
«en la Unión Europea y Estados Unidos» — no hay nada verificable en la UE.

**Ya corregido y desplegado** en `legal.vetawallet.com` y `app.vetawallet.com`.
**`www.vetawallet.com` sigue con el texto viejo** (ver §10).

### 6.4 Marcas y software no son de la empresa

**Ninguna marca del ecosistema está registrada:** ni Orden Global, ni Veta
Wallet, ni Genesis ID, ni MyTokenPay, ni Ordenscan, ni ORIGEN.

Los **dominios están a nombre personal de una socia**, aunque dentro de cuentas
de la sociedad. El software está alojado a nombre de la sociedad y bajo su
control, pero **no hay cesión de derechos firmada**.

> La precisión jurídica que importa: **controlar una cuenta no es ser
> titular.** Sin cesión, la titularidad legal del software sigue en quien lo
> desarrolló, y los dominios son de la persona natural.

Riesgo número dos del expediente. Decisión 2 de la Junta.

### 6.5 435 usuarios sin contrato

No hubo **punto de aceptación registrable** cuando los 435 usuarios abrieron
cuenta. 24 tarjetas emitidas. No hay garantía ni recompra hacia el usuario común
si ORIGEN cae. Ley aplicable y reclamaciones: se asume Próspera y arbitraje,
pero **no se ha definido**.

*(Nota del 18/08/2026: los términos y la política **sí** están publicados ahora
— las cuatro páginas responden 200. Lo que sigue faltando es la **prueba de
aceptación por usuario**.)*

Riesgo número tres. Decisión 3 de la Junta.

### 6.6 La comisión: dos cobros que se confunden

Comprobado el 16/08/2026:

- **La comisión de la casa está APAGADA.** `lib/comision.js` solo cobra si
  existe `OG_COMISION_ORIGEN`, y esa variable **no está puesta** en la
  aplicación `vetawallet` de Heroku.
- **Lo que sí está activo es el suelo de gas de la red:** `eth_gasPrice`
  devuelve 93 gwei, que a 21.000 de gas son **0,001953 ORIGEN** por envío
  nativo.

Se parecen en la cifra y se confunden con facilidad, pero **tienen distinto
cobrador** (el validador, no el tesoro) y por tanto **distinto tratamiento
fiscal**.

### 6.7 Migrar la cadena mueve el registro de 435 personas

Arrancar la 5550 sustituye a la cadena anterior como registro de saldos. En
términos legales, eso es **migrar el registro contable de 435 personas reales**,
y está por determinar si exige aviso o consentimiento previo. **Hay que
resolverlo ANTES de ejecutarla.** Decisión 8 de la Junta.

Enlaza con el «acuerdo uno», que mantiene viva la cadena vieja como respaldo —
**dicho, pero sin acta a la vista**.

---

## 7. Genesis ID — el activo más valioso

`genesis-id/` · TypeScript + Express · desplegado en **Render**
(`https://genesis-id.onrender.com`) · blueprint en `render.yaml` con
`autoDeploy: true`.

**Es lo único que ningún competidor de la región tiene:** identidad, KYB,
tamizado GAFI, monitoreo AML y bitácora encadenada.

### Arquitectura

- **Front sin compilar**, módulos ES servidos **una ruta por módulo**, nunca
  `express.static` sobre `public/` — *una carpeta servida reparte todo lo que
  alguien deje ahí dentro algún día*.
- Estado en **MongoDB**, un solo documento `estado/genesis`.
  **`almacenPersistente: true`** hoy porque `GENESIS_MONGO_URL` está puesta. Sin
  ella, el disco de Render es efímero y cada despliegue borraría las
  identidades.
- **Las imágenes NO viven en el documento de estado.** Reventaban el límite de
  16 MB de MongoDB, y al pasarlo fallaba `volcar()` — o sea el guardado de
  TODO — en silencio. Viven en colecciones aparte:
  `documentosPendientes` (anverso/reverso) y el almacén del retrato.

### API por alcances

`identidad.crear` · `identidad.leer` · `identidad.documento` · `gid.verificar` ·
`gid.perfil` · `vinculo.crear` · `negocio.crear` · **`movimiento.enviar`** ·
`tamiz.direccion` · `telemetria.enviar` · `directorio.enviar`

> **`movimiento.enviar` es la pieza clave para cualquier producto de dinero.**
> Su modelo ya lleva `gid`, `direccion` (entrada/salida), `contraparte`,
> `monto`, `montoUsd`, `paisContraparte` y `hash`.

### Biometría

**AWS Rekognition, región us-east-1.** `GENESIS_BIOMETRIA_URL` está comentada en
`render.yaml`, así que el proveedor activo es Rekognition vía credenciales AWS.

> **El selfie NUNCA se guarda.** Se coteja contra la foto del documento y se
> descarta, «para que Genesis ID no se convierta en un depósito de fotos de
> documentos, que es el peor dato que se puede acumular». Lo que queda es el
> veredicto, la puntuación y el reto de vivacidad.

### La bitácora encadenada

Cada entrada lleva el hash de la anterior. **Un eslabón roto no se arregla:**
recalcular destruiría justo lo que aporta. Lo que se hace es **sellar** —
`sellar()` cierra el tramo roto dejando escrito dónde se rompió, y a partir de
ahí una manipulación nueva se vuelve a notar.

**Estado hoy en producción:**
```
bitacoraIntegra: false · bitacoraRotaEn: 767 · bitacoraEntradas: 930 · bitacoraSellos: 0
```

**La causa ya está arreglada** (commit `806c290`): `JSON.stringify` borra las
claves con valor `undefined`, pero el driver de MongoDB las guarda como `null`.
Sitios como `riesgo: identidad.riesgo?.nivel` metían `undefined` sin querer, así
que el hash se calculaba sobre `{}` al escribir y sobre `{"riesgo":null}` al
releer tras un reinicio. **Solo aparecía después de reiniciar.** Cortado en
`limpiar()`, el único sitio por el que pasan todas las entradas.

> **PENDIENTE:** sellar el tramo desde el panel (`POST /panel/bitacora/sellar`,
> exige permiso `*`).

### Conservación de documentos — PENDIENTE CRÍTICO

La política publicada promete **5 años** de conservación. El código los borraba
al decidir. Se resolvió por conservar:

- Cifradas con **AES-256-GCM**, llave desde el entorno (`GENESIS_ARCHIVO_CLAVE`)
- **Cada lectura queda registrada** con el nombre de quien la hizo
- **Caducidad automática** con índice TTL de MongoDB — no una tarea que alguien
  deba recordar
- **Sin llave no se conserva nada:** se borra como antes, porque un depósito de
  cédulas en claro es peor que no tener archivo

**Estado hoy: `conservacionDocumentos: false`.** Falta poner
`GENESIS_ARCHIVO_CLAVE` en el panel de Render. **Mientras falte, el servicio
sigue borrando y por tanto incumpliendo su propia política publicada.**

### La app móvil de Genesis ID

`genesis-id-app/` · Expo/EAS · `runtimeVersion.policy: "fingerprint"`.

**Regla crítica:** los updates por aire (OTA) solo llegan a APKs cuya huella
coincida. Medido:

- Huella actual (la de los APK instalados): `94c7667c6ac51d05019ee458250ee190bbe93b01`
- Huellas EAS por plataforma: android `b6716dbc5ab2e6008a7709a5e7e78c7df3c8c687`,
  ios `632cb9a67be7187cdd80dc61b4c96ade565575af`
- **Ningún fichero de `src/` entra en la huella** — por eso los cambios de
  pantalla sí viajan por aire.
- **`package.json` SÍ entra.** Añadir una dependencia (incluso de desarrollo)
  cambia la huella y **corta los updates a todos los teléfonos instalados**.

Por eso hay tres parches de Expo deliberadamente sin alinear
(`expo 54.0.36→54.0.37`, `expo-constants 18.0.13→18.0.14`,
`expo-updates 29.0.19→29.0.20`): alinearlos cambia la huella a
`049f6a4978673d5888f8a43ef832ab8708442fee`. **Se alinean en la próxima
compilación de APK, no antes.**

`scripts/verificar.js` corre antes de publicar. `scripts/probar-ficha.js`
renderiza la pantalla de verdad — **no está enganchado a `verificar` a propósito**,
porque necesita `react-test-renderer` y eso cambiaría la huella.

---

## 8. Veta Wallet

- **Backend:** `infra/veta-wallet-backend/` — Node + Express + Mongoose,
  desplegado en **Heroku**, app `vetawallet`
  (`https://vetawallet-1a2e38ac52b1.herokuapp.com`). Owner de la cuenta:
  `ordenglobalcorp@gmail.com`.
- **Base:** MongoDB Atlas, base `wallet`. Cadena de conexión y usuario en las
  variables de Heroku (`MONGO_PASSWORD`); no se escriben aquí.
- **Front web:** `apps-web/veta-wallet/` — **es también lo que sirve las páginas
  legales** (ver §10).
- **App móvil:** `veta-wallet-app/`.

### Piezas importantes del backend

| Ruta | Qué hace |
|---|---|
| `POST /auth/login` | Devuelve `token` (40 min) y `refreshToken` (30 días) |
| `GET /api/users/admin/saldo?email=` | **Correo → dirección + todos los saldos**, incluido ONDK. Exige `isAdmin` |
| `GET /wallet/deposit-info` | Dirección y saldo |
| `POST /cards/fund` | Fondeo de tarjeta |
| `GET /cards/my-card` | Datos de la tarjeta |

`lib/saldos.js` — **ninguna función devuelve «cero» cuando el nodo no
responde.** Devuelve que no se pudo comprobar, y quien llama debe negarse a
seguir. *«Un cero por avería de red, en la puerta de un borrado, es exactamente
la clase de dato tranquilizador y falso que hace perder el dinero de alguien.»*

`isAdmin` no solo verifica la firma del JWT: **compara el token contra una copia
cifrada guardada en la cuenta del admin**. No se puede fabricar uno sin un login
real.

### Tarjetas

Emisor **CryptoMate**. Modelos `Card`, `CardEvent`, `CardFunding`, `Deposit`,
`Tx`, `Idempotencia`, `OrigenBalance`.

---

## 9. Ordenex y AuCorp

### Ordenex — `apps-web/ordenex/`

Casa de cambio. `www.ordenexchange.link`. **ONDK abre a mercado el 28 de
agosto.**

**La decisión de arquitectura más importante de todo el ecosistema está aquí**,
escrita en `fiat.js`:

> **«LA CASA NO TOCA FIAT. El dinero de banco viaja entre las personas; Ordenex
> custodia la garantía en ORIGEN y arbitra.»**

El flujo está cerrado con candado:
`abierta → tomada → fiat-avisado → liquidada | cancelada | disputa`.
Los números de cuenta del agente **solo se entregan cuando la solicitud ya está
tomada**, y los manda el servidor recién ahí.

> **Esto mantiene a la sociedad fuera de la definición de transmisor de dinero
> en casi todas partes, porque la casa nunca tiene el dinero de nadie.**
> Cualquier plan de «cash in / cash out con bancos propios» **invierte esta
> decisión** y convierte la operación en captación y transmisión de dinero, que
> es actividad licenciada por definición. Ver `AuCorp-Ruta-Moneda-LATAM.pdf`.

### AuCorp — `apps-web/aucorp/`

Hoy: **una marca y un sitio web**, no una institución. Sustituye al WordPress de
`www.aucorp.io` (tema comprado `cyberbank`), que **no se toca**.

**Sistema de diseño propio y deliberadamente distinto** del resto del
ecosistema, porque AuCorp es una contraparte, no una sección:

| | Orden Global | AuCorp |
|---|---|---|
| fondo | oscuro | **claro**, hueso cálido `#F6F2E9` |
| serif | Cinzel | **Fraunces** |
| palo seco | Archivo | **IBM Plex Sans** |
| metales | oro sobre verde | **oro `#A67C1A` y acero `#5F6E7C`** |

**Los dos metales significan:** oro para lo que tiene respaldo real; acero para
lo que viene de la banca tradicional —regulación, cumplimiento,
infraestructura—. *Si algún día se usan al revés, el sistema deja de significar
y pasa a ser adorno.*

---

## 10. Dominios y despliegues — MAPA REAL

**Esta sección salva horas.** Lo que parece obvio aquí no lo es.

| Dominio | Sale de | Cómo se despliega |
|---|---|---|
| `genesis-id.onrender.com` | `genesis-id/` | **Render, `autoDeploy: true`** — empujar a la rama despliega |
| `legal.vetawallet.com` | **`apps-web/veta-wallet/`** | **Amplify manual**, app `vetawallet-legal`, appId `d264zjawew1yea`, rama `main`. Zip vía `create_deployment` + `start_deployment` |
| `app.vetawallet.com` | ídem, misma app de Amplify | ídem |
| `www.vetawallet.com` | **desconocido** | Distribución CloudFront `d1ceoywtt4iywx`, **NO está en la cuenta AWS 548380372606**. Caché de un año en el borde |
| `vetawallet-...herokuapp.com` | `infra/veta-wallet-backend/` | `git push heroku` |
| `ordenexchange.link` | `apps-web/ordenex/` | Amplify, app `ordenex` |
| `ordenglobal.org` | `sitio-ordenglobal/` | Amplify, app `orden-global-web` |
| `ordenscan.com` | `ogscan-frontend/` | Amplify, app `ordenscan-explorador` |

### Trampa documentada

> **`veta-wallet-legal/` en el repositorio NO es lo que se publica.**
> Lo publicado sale de `apps-web/veta-wallet/`. Comprobado byte a byte el
> 18/08/2026. Quien edite la carpeta que lleva «legal» en el nombre creerá que
> corrigió la política y el documento público seguirá igual.
> Hay un aviso escrito en `veta-wallet-legal/LEEME-ESTA-CARPETA-NO-SE-PUBLICA.md`.

### Cuenta AWS

`548380372606`, usuario `jose`. Buckets: `ordenex-web`, `ordenex-media`,
`ordenex-backups`, `ordenglobal-cadena-8532-respaldo`, `costosogb`,
`ordenkapital-cloudtrail-logs-548380372606`, y tres de despliegue de Amplify.

---

## 11. Estado de producción hoy (18/08/2026)

```
genesis-id.onrender.com/healthz
  commit: 806c290a96e9  ·  rama: claude/veta-wallet-phantom-design-7syah8
  estado: degradado
  almacenPersistente: true      guardadoOk: true
  listasCargadas: true          listasVencidas: false
  biometria: true               proveedorBiometria: aws-rekognition:us-east-1
  conservacionDocumentos: FALSE     <-- falta GENESIS_ARCHIVO_CLAVE
  ssoConfigurado: true
  bitacoraIntegra: FALSE  rotaEn: 767  de 930 entradas  sellos: 0
  telemetriaPersistente: true
```

`/healthz` publica **qué commit corre**. Sin eso, cuando una página nueva
devuelve 404 no hay forma de distinguir «el código está mal» de «el despliegue
no se disparó». Se ha perdido más de una hora en esa duda.

---

## 12. Pendientes, por orden de urgencia

### Bloquean cumplimiento

1. **Poner `GENESIS_ARCHIVO_CLAVE` en Render.** Mientras falte, se borran las
   imágenes al decidir y se incumple la política publicada.
2. **Sellar la bitácora** desde el panel. Rota en la entrada 767, sin sellar.
3. **Nombrar oficial de cumplimiento y aprobar el manual AML/CFT.** Bloquea
   cualquier conversación con socios regulados y no cuesta capital.

### Críticos de seguridad

4. **`PASS_TOKEN` de 7 caracteres firma TODAS las sesiones de la wallet.**
   (Tarea #27, abierta.)
5. **La cadena tiene 1 validador, no 6**, y el contrato de staking no tiene
   dueño ni límite. (Tarea #17, abierta.)

### De producto

6. `www.vetawallet.com` sirve la política de privacidad vieja. Hace falta saber
   quién administra la distribución CloudFront `d1ceoywtt4iywx`.
7. Los 16 fichas internas de Genesis Core no están publicadas — decidir si se
   cierran tras sesión o si el cerebro entero es interno.
8. Piezas del mapa que faltan: `aucorp.io`, `ordenex`, `nexuscoder`,
   `cerebro.ordenscan.com`, `testnet.ordenscan.com`.
9. `gid-portal` **no responde** — comprobado el 18/08/2026, la conexión no
   llega. Está anotado en su ficha, sin enlace.

### De la Junta (del expediente legal)

Decisión 2 (propiedad intelectual) · Decisión 3 (contratos de usuario) ·
Decisión 4 (naturaleza de ORIGEN) · Decisión 5 (cumplimiento y datos) ·
Decisión 6 (fiscalidad) · Decisión 8 (migración de saldos).

---

## 13. Dónde están las credenciales

**Ninguna se escribe aquí.** Solo dónde viven.

| Qué | Dónde |
|---|---|
| Variables del backend de la wallet | Heroku, app `vetawallet` — y copia en `scratchpad/config_vars.json` (chmod 600, **fuera del repo**) |
| `GENESIS_MONGO_URL`, `GENESIS_ADMIN_PASSWORD`, `GENESIS_SSO_SECRETO`, `GENESIS_ARCHIVO_CLAVE` | Panel de Render, todas `sync: false` |
| Llaves AWS | `scratchpad/aws_llaves.json` (chmod 600) |
| Llaves de validador | **No están escritas en ninguna parte.** Falta fijar por escrito quién las custodia |
| Direcciones del tesoro | **No se divulgan**, por el Protocolo de Seguridad de Accesos y Credenciales |

**Pendiente declarado en `interno-pendientes`:** rotar las claves de Expo,
Heroku y Render; borrar las cuatro cuentas de prueba.

> El token de Heroku guardado **está vencido** (comprobado 18/08/2026:
> `Invalid credentials provided`).

---

## 14. Errores ya cometidos y su lección

Están aquí para que no se repitan. Cada uno costó tiempo real.

| Error | Lección |
|---|---|
| Un clon desfasado borró funciones de producción el 12-ago | Comprobar siempre que lo desplegado es lo del repositorio |
| Doble pago en la wallet por un reintento de red | **Sello de idempotencia en toda operación de dinero.** En un sistema que emite moneda, un doble pago es emisión sin respaldo |
| Se borró `piezaEn()` y tocar el cerebro dejó de abrir nada | **Un parser no ve una pantalla que no dibuja lo que debe.** Hay que renderizar y mirar el árbol |
| El panel pedía firmar «el rostro coincide» **sin enseñar ninguna cara** | Nunca pedir una decisión sin enseñar lo que hace falta para tomarla |
| `verificar.js` decía «hay 1 problema» y la lista salía vacía | `expo install --check` escribe en **stderr**. **Una alarma que no dice qué pasa es peor que no tenerla** |
| `/healthz` decía «bitácora rota» sin decir dónde | Mismo fallo, misma lección. Ahora publica `bitacoraRotaEn` |
| Un servidor viejo en el puerto 8801 servía código antiguo | Matar antes de arrancar |
| Se editó `veta-wallet-legal/` creyendo que era lo publicado | Comprobar contra lo vivo, byte a byte, antes de dar por hecho un despliegue |
| El contenedor de trabajo se reinició tres veces y perdió el árbol local | **Empujar seguido.** Se recupera con `git fetch origin <rama> && git checkout -B <rama> origin/<rama>` |

---

## 15. Marco regulatorio externo, para lo que viene

Consultado el 18/08/2026. Detalle completo en
**`AuCorp-Ruta-Moneda-LATAM.pdf`**.

- **GENIUS Act (EE.UU.): ya es ley.** Define `monetary value` como **una moneda
  nacional cualquiera**, no solo el dólar — así que una moneda estable atada al
  peso o al real, ofrecida a personas en EE.UU., cae bajo la ley. Su sección
  **4(a)(11) prohíbe pagar interés o rendimiento** al tenedor, a emisores
  nacionales **y extranjeros**.
- **CLARITY Act: NO es ley.** Moción de clausura el 8/08/2026; votación
  agendada para el **15/09/2026**. **La ley que diría qué es ORIGEN a ojos de la
  SEC y la CFTC no existe todavía.**
- **Brasil:** resoluciones 519/520/521 del Banco Central en vigor desde el
  2/02/2026. La 521 clasifica las monedas estables referenciadas a divisa como
  **operaciones de cambio**. **La ventana para pedir licencia VASP cierra el
  29/10/2026 y no se reabre.**
- **México:** la iniciativa del 6/05/2026 reserva la emisión a IFPE y bancos con
  permiso de Banxico, con **5 a 15 años de prisión** por emitir sin
  autorización.

---

## 16. Fuentes

**Del ecosistema:** `infra/cerebro/conocimiento/` (`saber.json` 31 fichas,
`legal.json` de la Secretaria de la Junta 14/08/2026, `legal-contradicciones.md`,
`portafolio-minero.md`), el código de `genesis-id/`, `infra/veta-wallet-backend/`
y `apps-web/`, y consultas en vivo a `genesis-id.onrender.com/healthz`,
`legal.vetawallet.com`, `www.vetawallet.com` y la API de AWS el 18/08/2026.

**Externas:** las once fuentes listadas al final de
`AuCorp-Ruta-Moneda-LATAM.pdf`.

---

## 17. Lo primero que haría quien llegue

1. Leer `infra/cerebro/conocimiento/legal-contradicciones.md` **entero**. Manda
   sobre todo lo demás.
2. Abrir `https://genesis-id.onrender.com/healthz` y comparar con §11. Lo que
   haya cambiado es lo que pasó desde este corte.
3. Abrir Genesis Core en `/genesis-core` y recorrer las 16 regiones.
4. **No repetir ninguna afirmación de la §6 sin comprobar antes si la Junta ya
   decidió.**
5. Antes de tocar un despliegue, leer §10. El mapa no es el que parece.
