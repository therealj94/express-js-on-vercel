# Genesis ID — crítica total

Fecha: 2026-09-02. Ámbito: el motor (`genesis-id/`), el puente
(`infra/genesis-proxy/`), la app (`veta-wallet-app/`) y la web
(`apps-web/veta-wallet/`). Concreta, con rutas de archivo. Lo que se arregló en
esta misma entrega va marcado con **[hecho]**; lo demás es propuesta.

---

## 1. Mapa de carpetas: cuál es la real

| Carpeta | Qué es | Estado |
| --- | --- | --- |
| **`genesis-id/`** | **El motor que corre en Render** (`genesis-id.onrender.com`). Lo prueba `render.yaml` (`rootDir: genesis-id`, `npm start` → `tsx src/index.ts`, `healthCheckPath: /healthz`). TypeScript, 4 dependencias, 181 pruebas. | **Producción. La única fuente de verdad.** |
| `infra/genesis-proxy/` | El puente Express que monta cada backend (Heroku de Veta Wallet) para hablar con Genesis con la clave de API sin que salga del servidor. Es lo que en el encargo se llamaba `infra/veta-wallet-backend/lib/genesisPuente.js` — ese archivo no existe en este repositorio; el puente real es `genesis.router.js`. | Producción (se copia al backend). |
| `genesis-id-app/` | App Expo del **panel de cumplimiento** (operadores), no del usuario final. Se compila con `.github/workflows/genesis-build.yml`. | Producción, distinta cosa. |
| `genesis-admin.html` (raíz) | Panel de administración de la **versión anterior** del motor (la que estaba abierta sin credenciales). Llama a `/api/admin/*`, rutas que hoy devuelven 404 a propósito. | **Vieja. No usar.** |
| `GENESIS_ID_INTEGRACION.md` (raíz) | Describe el puente con el portal `genesisid.online` (`/api/portal/*`) que se retiró. Nada de eso existe ya en el código. | **Obsoleto.** |
| `ogscan-backend/src/lib/genesis.js` | Cliente del explorador: solo `gid.verificar` y `tamiz.direccion`. | Producción (ordenscan). |
| `veta-wallet-app/src/genesis.js` + `screens/Onboard.js` | Cliente del usuario final en el teléfono. Es lo que el encargo llamaba `orden-global-app/src/screens/` — esa carpeta no existe; la app se llama `veta-wallet-app`. | Producción. |
| `apps-web/veta-wallet/app.js` | Cliente web. Hasta hoy solo enlazaba a `genesis-id.onrender.com`; no registraba a nadie. | Producción (Amplify). |

Plan de consolidación (sin borrar nada todavía):

1. **[hecho]** `LEEME.md` en la raíz diciendo cuál es la real y qué es cada copia.
2. **[hecho]** Nota de obsoleto al principio de `GENESIS_ID_INTEGRACION.md`.
3. Mover `genesis-admin.html` y `GENESIS_ID_INTEGRACION.md` a `documentos/archivo/` en un commit propio, cuando José confirme que nadie los abre desde un marcador.
4. Que el puente viva en el repositorio del backend de Heroku como dependencia
   copiada con su prueba, y que `infra/genesis-proxy/README.md` diga en qué
   commit del backend se copió por última vez. Hoy no hay forma de saber si el
   backend desplegado tiene la misma versión del router que este repositorio.

---

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
  (`veta-wallet-app/src/mrzOcr.js`) solo cambia letra→cifra donde la norma no
  admite letras y se rinde ante la ambigüedad: no inventa documentos.
- **Prueba de vida por reto sorteado en el servidor** (`src/kyc/vivacidad.ts`):
  secuencia al azar, dos minutos, un solo uso, gesto a gesto, fotograma
  repetido rechazado, postura que no cambia penalizada. Y el README dice con
  honestidad lo que NO detiene (inyección de vídeo en tiempo real).
- **Separación de credenciales** (`src/middleware/proteger.ts`): operador con
  sesión, app con clave y alcances mínimos. Ordenscan no puede leer nombres.
- **Tokens sin `alg` del cliente** (`src/lib/cripto.ts`): la firma la decide el
  servidor. Contraseñas con scrypt y comparación en tiempo constante.
- **La cuenta la fija el servidor** en el puente (`genesis.router.js:
  /vincular`), nunca el cuerpo. La prueba `puente.test.mjs` lo comprueba.
- **Bitácora encadenada** y, desde hoy, **firmada** (ver §5).
- **Cuatro dependencias.** Cada línea que decide se puede leer.

---

## 3. Qué falta para que el registro sea «top» (Veriff / Onfido / Persona)

Lo que hace bien un proveedor de primera línea y dónde estaba Genesis:

| Lo mejor del sector | Genesis antes | Ahora |
| --- | --- | --- |
| Cámara primero: el documento se lee y la persona **confirma**, no teclea | Nombre y fecha tecleados ANTES del documento; luego el documento fallaba por «no coincide» y había que volver | **[hecho]** documento → rostro → confirmar (prellenado con `documentoDatos`) → perfil → revisión, en app y web (`veta-wallet-app/src/screens/Onboard.js`, `apps-web/veta-wallet/app.js: verificar()`) |
| Progreso visible con nombre de cada tramo | Barra de cinco tramos sin nombres | **[hecho]** tramos con nombre (`Pasos`, `verPasos()`) |
| Errores que dicen qué hacer (acercá, alejá, luz) | Ya existía en la app (`gen.scanCut`, `autoHints`) | **[hecho]** también en la web (`ver.cortadas`, `ver.noSeVe`, `ver.leidoParcial`) y para el lector del servidor |
| Retomar sin perder nada | `siguientePaso` presuponía el orden viejo | **[hecho]** `hecho: {datos, documento, rostro}` en `estadoParaUsuario()`; el cliente deduce el paso de lo hecho, no del estado |
| Registro en la web con cámara | La web solo enlazaba a Render | **[hecho]** flujo completo con `getUserMedia`, `<input capture>` de respaldo, y lectura de la MRZ en el servidor (`src/kyc/lectura.ts`, `POST /identidades/:id/documento/leer`) |
| Credencial final con QR verificable por terceros | Pasaporte con filas de texto, «Compartir» que no hacía nada | **[hecho]** `TarjetaGid` (app) y `tarjetaGid()` (web) con QR → `/gid/<GID>`; página pública `apps-web/veta-wallet` + `GET /api/publico/gid/:gid` |
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

1. **Bitácora sin firmar** (`src/audit/bitacora.ts`). Quien controle Mongo podía
   borrar una entrada y recalcular todos los hashes siguientes: la cadena
   volvía a cuadrar. **[hecho]** HMAC-SHA256 por eslabón con
   `GENESIS_BITACORA_LLAVE`, verificación en `verificarCadena()`, anclaje
   firmado, prueba `bitacora.test.ts` que reproduce exactamente ese ataque.
   Pendiente: **poner la llave en Render** y **anclar** el hash en la cadena
   8532 (el anclaje ya sale firmado y listo).
2. **Sin 2FA para operadores** (`src/auth/operadores.ts`). Una contraseña
   filtrada del rol `cumplimiento` fabrica identidades verificadas con GID
   real. Hay bloqueo por intentos y scrypt, pero no hay segundo factor.
   Propuesta: TOTP (RFC 6238, `node:crypto` alcanza, sin dependencias) con
   secreto por operador guardado cifrado, obligatorio para `identidad.aprobar`
   y `*`; códigos de respaldo; registro en bitácora del alta del segundo
   factor. Mientras tanto: sesiones de 8 h → 2 h para `admin`.
3. **GID declarado por el cliente en algunos sitios.**
   - `POST /api/v1/negocios/:id/beneficiarios` acepta `gid` del cuerpo
     (`src/routes/apps.ts`): una app puede atar a un beneficiario el GID de
     otra persona verificada y saltarse el KYC del UBO. Debe resolverse por
     correo/identidad y comprobar que el GID pertenezca a quien la app dice.
   - `POST /api/v1/movimientos` recibe `gid` del cuerpo; el puente lo toma de
     la sesión, pero cualquier app con `movimiento.enviar` podría atribuir
     movimientos a un GID ajeno. Resolver por vínculo `app+cuenta` → GID en
     el servidor.
   - En `veta-wallet-app/src/accounts.js` el `genesisUid` vive en la caché
     local; la pantalla `Passport` ya lo reconsulta al abrir **[hecho: la
     tarjeta se pinta con el estado del servidor]**, pero `Home.js`/`More.js`
     siguen leyendo `acc.genesisUid` sin fecha de frescura.
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

## 5. La firma de la bitácora, en detalle

`src/audit/bitacora.ts`:

- `registrar()` calcula el hash como antes y añade `firma = HMAC-SHA256(llave, hash)`.
  Se firma el hash y no el contenido porque el hash ya ata contenido + eslabón anterior.
- `verificarCadena()` devuelve además `firmada`, `firmadas`, `sinFirma`,
  `firmaRotaEn` y `confiable` (= cadena íntegra y ninguna firma rota). Las
  entradas anteriores a la llave cuentan como `sinFirma`, no rompen nada.
- `anclaje()` firma `hash|entradas|fecha`, y `anclajeValido()` lo comprueba.
- Sin `GENESIS_BITACORA_LLAVE` el servicio arranca, avisa en consola y en
  `/healthz` (`bitacoraFirmada:false`), y el panel enseña «Bitácora sin firmar».
- Llave corta (< 32) firma igual y avisa.
- La llave nunca entra al detalle de una entrada (`PROHIBIDOS` incluye `llave`).

Por qué HMAC y no Ed25519: la verificación la hace el propio servidor y la
llave vive en el entorno; HMAC es una línea de `node:crypto` y no exige
manejar PEM en variables de entorno. El día que un auditor externo tenga que
verificar sin la llave, se cambia `firmarEslabon()` por `crypto.sign(null, …)`
con Ed25519 y se publica la clave pública: la interfaz ya lo permite.

---

## 6. Lo que necesita despliegue o variable (lo hace José)

| Dónde | Qué |
| --- | --- |
| **Render (Genesis)** | Desplegar este commit. Variable nueva **`GENESIS_BITACORA_LLAVE`** (32+ caracteres al azar; no cambiarla después). Para el lector de documentos de la web: las mismas credenciales de Rekognition **más el permiso IAM `rekognition:DetectText`**. |
| **Heroku (backend Veta Wallet)** | Copiar `infra/genesis-proxy/genesis.router.js` y montar `parserRostro` también en `/genesis/documento/leer` (ver README del puente). |
| **Amplify (web)** | Subir la carpeta entera (`subir.py`) y la versión de un archivo para `www` (`unificar.py`). La ruta `/gid/<GID>` cae en el index por la regla comodín: no hace falta configurar nada más. |
| **OTA (app)** | Cambios solo de JavaScript: llegan por aire. No hay dependencia nativa nueva (`react-native-qrcode-svg` ya estaba). |
