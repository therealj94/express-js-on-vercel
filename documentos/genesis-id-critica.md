# Genesis ID — crítica total

Fecha: 2026-09-02. Ámbito: el motor (`genesis-id/`), el puente
(`infra/veta-wallet-backend/lib/genesisPuente.js` e `infra/genesis-proxy/`), la app (`orden-global-app/`) y la web
(`apps-web/veta-wallet/`). Concreta, con rutas de archivo. Lo que se arregló en
esta misma entrega va marcado con **[hecho]**; lo demás es propuesta.

---

## 1. Mapa de carpetas: cuál es la real

| Carpeta | Qué es | Estado |
| --- | --- | --- |
| **`genesis-id/`** | **El motor que corre en Render** (`genesis-id.onrender.com`). Lo prueba `render.yaml` (`rootDir: genesis-id`, `npm start` → `tsx src/index.ts`, `healthCheckPath: /healthz`). TypeScript, 6 dependencias, ~500 pruebas. | **Producción. La única fuente de verdad.** |
| **`infra/veta-wallet-backend/`** | El backend de Veta Wallet (Heroku). Su puente con Genesis es **`lib/genesisPuente.js`**: la clave de API vive ahí. | Producción. |
| `infra/genesis-proxy/` | El mismo puente como router suelto con su prueba (`puente.test.mjs`). Referencia; `genesisPuente.js` es la copia montada, y hoy nada garantiza que las dos estén a la par. | Referencia. |
| **`orden-global-app/`** | **La app que se distribuye** (`com.ordenglobal.app`, 1.33.x). Registro: `src/screens/Onboard.js` + `src/genesis.js`; pasaporte: `src/screens/More.js`; tarjeta con QR: `src/TarjetaGid.js`. | **Producción.** |
| `veta-wallet-app/` | La app **vieja** (`com.ordenglobal.vetawallet`, 1.33.0). | Vieja. No se toca. |
| `apps-web/veta-wallet/app.js` | Cliente web (Amplify): registro con fotos (`verificar()`), tarjeta con QR y página pública `/gid/<GID>`. | Producción. |
| `genesis-id-app/` | App Expo del **panel de cumplimiento** (operadores), no del usuario final. Se compila con `.github/workflows/genesis-build.yml`. | Producción, distinta cosa. |
| `genesis-admin.html` (raíz) | Panel de administración de la **versión anterior** del motor (la que estaba abierta sin credenciales). Llama a `/api/admin/*`, rutas que hoy devuelven 404 a propósito. | **Vieja. No usar.** |
| `GENESIS_ID_INTEGRACION.md` (raíz) | Describe el puente con el portal `genesisid.online` (`/api/portal/*`) que se retiró. Nada de eso existe ya en el código. | **Obsoleto.** |
| `ogscan-backend/src/lib/genesis.js` | Cliente del explorador: solo `gid.verificar` y `tamiz.direccion`. | Producción (ordenscan). |

Plan de consolidación (sin borrar nada todavía):

1. **[hecho]** `LEEME.md` en la raíz diciendo cuál es la real y qué es cada copia.
2. **[hecho]** Nota de obsoleto al principio de `GENESIS_ID_INTEGRACION.md`.
3. Mover `genesis-admin.html` y `GENESIS_ID_INTEGRACION.md` a `documentos/archivo/` en un commit propio, cuando José confirme que nadie los abre desde un marcador.
4. Un solo puente: `infra/genesis-proxy/genesis.router.js` y
   `infra/veta-wallet-backend/lib/genesisPuente.js` son el mismo código
   divergiendo (el segundo tiene `/gid` y `/documento-fotos`; el primero tiene
   `/status`). Que el backend importe el router de `genesis-proxy` (o al revés)
   y que la prueba `puente.test.mjs` corra contra el que se despliega.
5. Retirar `veta-wallet-app/` a `documentos/archivo/` cuando la 1.33.2 esté en
   todos los teléfonos: dos apps con el mismo código a medias es el error de
   mapa que ya pasó una vez.

---

### Nota sobre esta entrega

La rama real (`claude/veta-wallet-phantom-design-7syah8`) ya traía mucho de lo
que este documento pide: bitácora firmada (HMAC con `GENESIS_BITACORA_CLAVE`,
detección de firmas quitadas, sellos), **ancla diaria en la cadena** con lista
pública, credenciales firmadas con secp256k1 y página de comprobación,
segundo factor TOTP para operadores, `documento-fotos` para la web con lectura
del frente por Rekognition, y un `verificar()` web de tres pasos. Lo hecho aquí
se sumó encima sin duplicar nada: lectura automática de la MRZ del reverso
(`kyc/lectura.ts`), `hecho`/`documentoDatos`, `GET /api/publico/gid/:gid`, la
tarjeta con QR en app y web, la página `/gid/<GID>`, y el alias
`GENESIS_BITACORA_LLAVE`. Donde el texto de abajo dice «[hecho]» se refiere a
esta entrega; donde dice «ya en la rama», a lo que había.

## 2. Qué está bien del motor

Hay que decirlo con la misma claridad que lo que falta: el núcleo es serio.

- **Una sola puerta para «verificada»** (`src/motor/identidades.ts: aprobar()`):
  operador con permiso, sin bloqueos, o anulación escrita que queda para
  siempre. Ninguna clave de API aprueba. Las pruebas de `flujo.test.ts`
  comprueban que las rutas viejas den 404 y que una app no pueda aprobar.
- **Sin falso verde**: listas vacías = «sin tamizar», no «sin coincidencias»
  (`src/aml/riesgo.ts`); biometría sin proveedor = `no-configurada`, no `ok`
  (`src/kyc/biometria.ts: sinProveedor()`). Es la decisión de diseño más
  valiosa del sistema.
- **MRZ con aritmética real** (`src/kyc/mrz.ts`): todos los dígitos de control,
  contra los ejemplos del estándar. La corrección OCR del cliente
  (`orden-global-app/src/mrzOcr.js`, y ahora también `genesis-id/src/kyc/lectura.ts`) solo cambia letra→cifra donde la norma no
  admite letras y se rinde ante la ambigüedad: no inventa documentos.
- **Prueba de vida por reto sorteado en el servidor** (`src/kyc/vivacidad.ts`):
  secuencia al azar, dos minutos, un solo uso, gesto a gesto, fotograma
  repetido rechazado, postura que no cambia penalizada. Y el README dice con
  honestidad lo que NO detiene (inyección de vídeo en tiempo real).
- **Separación de credenciales** (`src/middleware/proteger.ts`): operador con
  sesión, app con clave y alcances mínimos. Ordenscan no puede leer nombres.
- **Tokens sin `alg` del cliente** (`src/lib/cripto.ts`): la firma la decide el
  servidor. Contraseñas con scrypt y comparación en tiempo constante.
- **La cuenta la fija el servidor** en el puente (`genesisPuente.js` y `genesis.router.js:
  /vincular`), nunca el cuerpo. La prueba `puente.test.mjs` lo comprueba.
- **Bitácora encadenada** y, desde hoy, **firmada** (ver §5).
- **Cuatro dependencias.** Cada línea que decide se puede leer.

---

## 3. Qué falta para que el registro sea «top» (Veriff / Onfido / Persona)

Lo que hace bien un proveedor de primera línea y dónde estaba Genesis:

| Lo mejor del sector | Genesis antes | Ahora |
| --- | --- | --- |
| Cámara primero: el documento se lee y la persona **confirma**, no teclea | En la app (`orden-global-app/src/screens/Onboard.js`) el paso «datos» ya abre la cámara sobre el frente y precarga nombre y fecha (`nombreDeAnverso`, `datosDeMrz`); teclear es la salida. En la web, `verificar()` pide datos y luego las dos fotos. | **[hecho]** el servidor devuelve `documentoDatos` y la app precarga con ello al retomar; lo leído por fotos vuelve en `documento.datos`. **Pendiente**: invertir el orden en la web (fotos → cara → confirmar) — el estado y `hecho` ya lo permiten. |
| Progreso visible con nombre de cada tramo | App: barra de cinco tramos; web: riel «Paso n de 3» con nombre | Ya en la rama. |
| Errores que dicen qué hacer (acercá, alejá, luz) | App: `gen.scanCut`, `autoHints`, `lowLight`, `frontFallback`; web: `lectura` inmediata del frente | **[hecho]** el lector del reverso devuelve `cortadas` / `no-encontrada` / `digitos` para decirlo con palabras |
| Retomar sin perder nada | `siguientePaso` presuponía un orden fijo | **[hecho]** `hecho: {datos, documento, rostro}` en `estadoParaUsuario()`; app (`pasoDe`) deduce el paso de lo hecho; el estado no retrocede al reenviar el documento |
| Registro en la web con cámara | `verificar()` con `<input capture>` y `documento-fotos`, leído por un operador | **[hecho]** la MRZ del reverso se lee sola (`kyc/lectura.ts`) dentro de `documento-fotos` y en `POST /identidades/:id/documento/leer`: si cuadra, el documento se comprueba al instante en vez de esperar días |
| Credencial final con QR verificable por terceros | Credencial firmada (secp256k1) y página `/credencial` en Genesis — fuerte, pero exige entender firmas; en la app, pasaporte de texto | **[hecho]** `TarjetaGid` (app) y `tarjetaGid()` (web) con QR → `app.vetawallet.com/gid/<GID>`, que consulta `GET /api/publico/gid/:gid`: sí/no y fecha, sin datos |
| **Autenticidad del documento** (NFC / chip, hologramas, plantillas por país) | No (lo dice el README) | **Falta.** Es la brecha más grande frente a Veriff/Onfido. Camino: `react-native-nfc-manager` en la app para leer el chip ICAO (DG1/DG2/SOD) y validar la firma contra el CSCA del país; sin chip, al menos plantillas de las cédulas de HND/GTM/SLV (posición de campos, tipografías) para detectar documentos impresos en casa. |
| **Vivacidad pasiva + señales del dispositivo** (profundidad, integridad de la app) | Solo reto activo con Rekognition `DetectFaces` | **Falta.** Rekognition Face Liveness (sesión con SDK) o `expo-face-detector` + Play Integrity / App Attest para saber que la cámara es real. Sin eso la inyección de vídeo pasa. |
| **Detección de reintentos y fraude cruzado** (misma cara en dos correos, mismo documento en dos cuentas) | `numeroDocumento` se guarda pero no se indexa ni se cruza | **Falta.** Índice único por `numeroDocumento+paisEmisor` con caso automático al chocar; `IndexFaces` de Rekognition para buscar la misma cara en identidades anteriores (con retención justificada). |
| Comprobación de correo/teléfono (OTP) | Nada: el correo lo afirma el backend de la app | Aceptable en el modelo de cliente de confianza, pero un OTP al teléfono declarado subiría el nivel y daría un segundo factor gratis. |
| Comprobación contra registros oficiales (RNP en Honduras, RENAP en Guatemala) | No | Falta; depende de convenios, no de código. |
| Tiempo de decisión | Manual, «menos de 24 h» | Sin proveedor de biometría configurado en Render todo cae en cola manual. Poner las credenciales de Rekognition (§6) es lo que más acorta el tiempo hoy. |
| Un solo SDK para las tres apps | Cada cliente reimplementa el flujo | Falta: el flujo web (`verificar()`) es un buen candidato a paquete compartido para MyTokenPay web. |

---

## 4. Riesgos concretos

Ordenados por gravedad, con la ruta donde está cada uno.

### Graves

1. **Bitácora firmada, pero solo si la llave está puesta** (`src/audit/bitacora.ts`,
   `src/lib/cripto.ts`). Ya en la rama: HMAC por eslabón con
   `GENESIS_BITACORA_CLAVE` (derivada con scrypt), detección de firmas
   quitadas (`degradadaEn`), sellos, ancla diaria en la cadena y lista pública
   de anclas. **[hecho]** el motor acepta también `GENESIS_BITACORA_LLAVE`, con
   prueba. Pendiente y urgente: **confirmar que la variable está en Render**
   (`/healthz → bitacoraFirmada`); sin ella todo lo anterior es decorado.
2. **2FA de operadores**: ya en la rama (`segundo-factor.test.ts`, `totp.test.ts`).
   Verificar que sea **obligatorio** para `identidad.aprobar` y `*`, no
   opcional por operador.
3. **GID declarado por el cliente en algunos sitios.**
   - `POST /api/v1/negocios/:id/beneficiarios` acepta `gid` del cuerpo
     (`src/routes/apps.ts`): una app puede atar a un beneficiario el GID de
     otra persona verificada y saltarse el KYC del UBO. Debe resolverse por
     correo/identidad y comprobar que el GID pertenezca a quien la app dice.
   - `POST /api/v1/movimientos` recibe `gid` del cuerpo; el puente lo toma de
     la sesión, pero cualquier app con `movimiento.enviar` podría atribuir
     movimientos a un GID ajeno. Resolver por vínculo `app+cuenta` → GID en
     el servidor.
   - En `orden-global-app/src/accounts.js` el `genesisUid` vive en la caché
     local; la pantalla `Passport` lo reconsulta al abrir, pero `Home.js`
     sigue leyendo `acc.genesisUid` sin fecha de frescura.
4. **Retos de vivacidad en memoria** (`src/kyc/vivacidad.ts`): con dos
   instancias en Render, la mitad de los retos «no existe». Hoy hay una sola;
   anotado. Mover a Mongo con TTL cuando se escale.
5. **Rate limit por IP en memoria y sin confianza en `X-Forwarded-For`**
   (`src/middleware/proteger.ts`): detrás del proxy de Render `req.ip` es el
   del proxy salvo `app.set('trust proxy', 1)`. Hay que comprobarlo en
   `/healthz` (imprimir `req.ip`) y fijarlo; si no, todos los usuarios
   comparten un cubo y el barrido de GIDs no se limita por atacante.

### Medios

6. **Todo el estado en un documento de Mongo** (`src/store.ts`): 16 MB de
   tope, escritura completa en cada cambio. Con `fotoCredencial` en base64
   (hasta 400 kB por persona) el documento revienta en ~40 identidades con
   foto. Sacar `fotoCredencial` a su colección ya, y las identidades a una
   colección por documento antes de las mil.
7. **Escritura diferida de 100 ms** (`store.guardar()`): un reinicio del
   contenedor pierde los últimos cambios salvo `guardarYa()` (solo en
   aprobar/rechazar/suspender). El documento y la biometría de una persona
   pueden perderse en un despliegue.
8. **La foto del anverso viaja al servidor** para el cotejo (`/biometria`) y
   ahora también para leerla desde la web (`/documento/leer`). Se descarta,
   y así lo dice el código, pero el README del motor promete «nunca la foto
   de la cédula»: hay que actualizar la promesa a «no se guarda». **[hecho
   en README]**.
9. **`GENESIS_SSO_SECRETO` no configurado** en Render (aviso en el arranque):
   el SSO con MyTokenPay está apagado.
10. **`CORS` abierto** (`src/index.ts: app.use(cors())`). Correcto para
    `/api/v1` (clave de API) y para `/api/publico`, pero el panel
    `/api/panel/*` con sesión Bearer también responde a cualquier origen.
    Restringir el panel al propio origen.
11. **Sin cabecera CSP** en el panel; el panel mete HTML con datos de
    personas vía `innerHTML` (`public/admin.html`). Hay `esc()`, pero una
    CSP sin `unsafe-inline` cerraría la clase entera.
12. **Datos de documento en la bitácora**: `identidad.documento` registra
    `hallazgos` (claves) y no datos, bien; pero `identidad.datos` registra
    `nombreDeclarado`. Es un dato personal en un registro que «se exporta y se
    enseña a auditores». Sustituir por una huella.

### Menores

13. Pruebas con rutas absolutas a una máquina (`puente.test.mjs`,
    `mrz-ocr.test.mjs`, `ogscan-backend/pruebas/genesis.test.mjs`).
    **[hecho en las dos primeras]**; la de ogscan sigue igual.
14. `genesis-id/app.json` con `{"expo":{}}` no pinta nada en un servidor
    Express. Borrarlo.
15. La web llamaba a `/genesis/status` y el puente sirve `/genesis/estado`:
    en producción la web nunca vio el estado real. **[hecho]** el puente
    responde a los dos nombres y la web prueba los dos.
16. El README del motor dice «80 pruebas»; son 181.

---

## 5. La firma de la bitácora, tal como está en la rama

`src/lib/cripto.ts` + `src/audit/bitacora.ts`:

- `registrar()` añade `firma = HMAC-SHA256(k, hash)` con `k` derivada por
  scrypt de `GENESIS_BITACORA_CLAVE` (**o `GENESIS_BITACORA_LLAVE`, [hecho]**).
  Menos de 32 caracteres no cuenta como llave.
- `verificarCadena()` devuelve `firmas: { hayLlave, firmadas, sinFirmar,
  firmaRotaEn, degradadaEn }`; una firma rota o una entrada sin firma detrás
  de una firmada dejan `integra: false`.
- El ancla diaria (`src/audit/ancla.ts`) publica hash y recuento en la cadena
  5550 y `GET /api/publico/anclas` los lista para que cualquiera los compare.
- Sin llave el servicio arranca y `/healthz` dice `bitacoraFirmada: false`.

Por qué HMAC y no Ed25519: la verificación la hace el propio servidor. Para
verificación por terceros sin la llave ya existe el ancla en cadena, que es
mejor que publicar una clave pública.

---

## 6. Lo que necesita despliegue o variable (lo hace José)

| Dónde | Qué |
| --- | --- |
| **Render (Genesis)** | Desplegar este commit. Confirmar que existe **`GENESIS_BITACORA_CLAVE`** (o `_LLAVE`; 32+ caracteres al azar; no cambiarla después). El lector de la MRZ usa las credenciales de Rekognition ya puestas; el usuario IAM necesita **`rekognition:DetectText`** (ya lo usa la lectura del frente). |
| **Heroku (backend Veta Wallet)** | Desplegar `infra/veta-wallet-backend/lib/genesisPuente.js` (ruta nueva `/genesis/documento/leer`) y montar `parserRostro` también en esa ruta en `app.js`. |
| **Amplify (web)** | Subir la carpeta entera (`subir.py`) y la versión de un archivo para `www` (`unificar.py`). La ruta `/gid/<GID>` cae en el index por la regla comodín: no hace falta configurar nada más. |
| **OTA (app `orden-global-app`)** | Cambios solo de JavaScript: llegan por aire. No hay dependencia nativa nueva (`react-native-qrcode-svg` ya estaba). |
