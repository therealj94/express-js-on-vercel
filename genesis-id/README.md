# Genesis ID

Motor de identidad del ecosistema Orden Global: KYC de personas, KYB de
empresas, tamizado contra listas de sanciones, monitoreo AML de transacciones e
inicio de sesión único entre las apps.

El ecosistema son cinco piezas —**Veta Wallet**, **MyTokenPay**, **OrdenEx**,
**AuCorp** y este **Genesis ID**— sobre la Layer 1 propia (cadena **5550**),
con **ORIGEN** como cripto nativa y **AUKA**, **AGKA** y **ONDK** como monedas
del sistema. El respaldo son las minas propias: oro certificado NI 43-101 en
bóveda.

> Hoy Genesis ID tiene emitida clave de API y sesión única para Veta Wallet,
> MyTokenPay y ordenscan (el explorador). **OrdenEx y AuCorp todavía no están
> conectados** — no hay código suyo en este repositorio. Cuando lleguen, entran
> por la misma puerta que las demás: clave propia, alcances propios.

---

## De dónde viene esto

La versión anterior de Genesis ID estaba **abierta a internet sin ninguna
credencial**. Comprobado desde fuera, sin contraseña:

| Ruta | Qué permitía |
| --- | --- |
| `GET /api/admin/identities` | volcar todas las personas con nombre, documento y nacionalidad |
| `GET /api/admin/stats` | recuento completo del sistema |
| `POST /api/identities/:id/process` | **emitir un UID verificado sin verificar nada** |
| `POST /api/identities/passport` | inyectar un pasaporte —nombre legal, documento, foto— a cualquier correo |
| `POST /api/admin/reset` | borrar la base entera |

MyTokenPay llamaba a `process` directamente desde el teléfono, así que cada
identidad "verificada" del sistema lo estaba sin comprobación alguna.

Por suerte no había datos de nadie: los cinco registros eran los de demostración
(`@mytokenpay.demo`), y el almacén era un JSON sobre el disco efímero de Render.
Era un arma cargada sin nadie enfrente.

---

## La idea que sostiene el diseño

> **Ninguna identidad se verifica sola.**

`verificada` tiene una única puerta, y esa puerta exige:

1. un **operador identificado** con permiso `identidad.aprobar`;
2. que **no queden bloqueos** — documento válido, tamizado hecho contra listas
   realmente cargadas, biometría resuelta;
3. si el operador aprueba **a pesar** de un bloqueo, una justificación escrita
   que queda marcada para siempre en el expediente y en la bitácora.

El GID no existe antes de esa decisión. Ninguna clave de API, por válida que
sea, puede aprobar a nadie.

### Y la que evita el falso verde

Un sistema que dice "sin coincidencias" cuando en realidad no tiene listas
cargadas es peor que uno que no tamiza: el equipo ve verde y cree estar
cumpliendo. Por eso las listas **vienen vacías de fábrica** y el motor
distingue *sin coincidencias* de **sin tamizar**. Sin listas, nadie se aprueba
sin anulación expresa.

Lo mismo con la biometría: sin proveedor configurado el estado es
`no-configurada`, no "correcta", y obliga a que una persona coteje el rostro y
lo firme.

### Y la diligencia es proporcional al volumen

Por debajo del umbral de reporte (`GENESIS_UMBRAL_USD`, 10 000 USD por
defecto) rige la **diligencia simplificada**: si la persona declara mover
menos que eso al año, un perfil de cumplimiento incompleto (ocupación, origen
de fondos) cuenta como factor de riesgo visible, no como bloqueo. Por encima
del umbral —o si no declara volumen— el perfil completo es obligatorio, como
siempre. La trampa de declarar poco y mover mucho no funciona: el monitoreo
abre caso en cuanto los movimientos reales cruzan el umbral, y ese caso exige
documentar el origen de los fondos.

---

## Qué verifica de verdad, y qué no

Esto importa más que la lista de funciones.

### Comprobado de forma real, aquí, sin depender de nadie

- **MRZ del documento** (ICAO 9303, formatos TD1/TD2/TD3): se recalculan
  **todos** los dígitos de control, incluido el compuesto. Cambiar una fecha de
  nacimiento para aparentar otra edad rompe la aritmética y se detecta.
  Verificado contra los ejemplos oficiales del estándar.
- **Vigencia, edad mínima, país emisor** y coherencia entre el nombre declarado
  y el del documento.
- **Tamizado de sanciones** con comparación de nombres tolerante a orden,
  tildes, errores de escritura, alias y variantes de transliteración
  (`Mohammed`/`Muhammad`/`Mohamed`), ajustada por fecha de nacimiento.
- **Direcciones de criptomonedas sancionadas**, cotejo exacto. Es el control
  más directo del ecosistema: se puede aplicar a cada envío de Veta Wallet
  antes de firmarlo.
- **Identificadores fiscales**: NIF/NIE/CIF español, NIT guatemalteco, CUIT
  argentino y RUT chileno se validan por su dígito verificador. Los demás solo
  por forma, y el resultado lo dice (`comprobacion: "formato"`), para que nadie
  confunda "bien escrito" con "existe".
- **Reglas AML** sobre transacciones: umbral único, acumulado, fraccionamiento,
  velocidad, contraparte sancionada, jurisdicción de riesgo, cuenta de paso y
  cuenta nueva con volumen alto.
- **Que el rostro sea el del documento**, con AWS Rekognition. Comprobado con
  dos retratos distintos de la misma persona (100 %) y con dos personas
  distintas (1 %), muy lejos del umbral de 88 %.
- **Que haya alguien delante de la cámara** y no una fotografía: el servidor
  sortea una secuencia de gestos —de frente, sonreír, abrir la boca, cerrar los
  ojos, girar la cabeza—, la manda al teléfono con dos minutos de caducidad y
  comprueba gesto a gesto que se cumplió, en orden. Además rechaza el mismo
  fotograma repetido y la postura que no cambia entre tomas.

### Lo que NO puede afirmar

- **Que el documento sea auténtico.** Que la MRZ cuadre prueba que está bien
  formado, no que lo emitiera un país. Para eso hay que leer el chip NFC y
  validar su firma contra el directorio de claves de la OACI.
- **Que sea imposible engañar a la prueba de vida.** El reto detiene una foto
  impresa, una foto en una pantalla y un vídeo grabado de antemano. No detiene
  a quien genere vídeo en tiempo real con el rostro de la víctima y lo inyecte
  en la cámara: contra eso hacen falta señales del propio dispositivo, y
  ninguna biblioteca del lado del servidor las sustituye. Por eso el resultado
  es una puntuación que queda en el expediente, y todo lo que no llega al
  umbral cae en la cola de revisión de una persona.
- **Nada de lo anterior, si no hay proveedor configurado.** Sin credenciales de
  Rekognition ni proveedor externo, el cotejo lo hace una persona y el estado
  queda en `no-configurada`, que no es `ok`.
- **Que un identificador fiscal esté dado de alta.** Eso solo lo dice el
  registro de cada país.

---

## Cómo se pone en marcha

```sh
npm install
npm start          # http://localhost:4000  → panel en /admin
npm run prueba     # 80 pruebas
npm run typecheck
```

Al arrancar por primera vez crea el administrador e imprime su contraseña **una
sola vez**, junto con la clave de API de cada app del ecosistema. Cópielas en
ese momento: de las claves solo se guarda el hash.

### Variables de entorno

| Variable | Para qué |
| --- | --- |
| `GENESIS_MONGO_URL` | **Imprescindible en producción.** Sin ella los datos viven en un archivo, y en Render el disco se borra en cada despliegue |
| `GENESIS_ADMIN_EMAIL` / `GENESIS_ADMIN_PASSWORD` | Primer administrador |
| `GENESIS_SSO_SECRETO` | Firma los tokens de sesión única. Sin él, el SSO queda desactivado |
| `GENESIS_LISTAS_DIR` | Carpeta con las listas de sanciones. **Sin ella no se tamiza a nadie** |
| `GENESIS_AWS_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_REGION` | Credenciales de AWS Rekognition: activan el cotejo de rostro y la prueba de vida. Bastan dos permisos, `rekognition:CompareFaces` y `rekognition:DetectFaces` |
| `GENESIS_BIOMETRIA_URL` / `_KEY` | Proveedor externo de biometría, alternativa a Rekognition. Si está definida, manda sobre él |
| `GENESIS_UMBRAL_PARECIDO` / `GENESIS_UMBRAL_VIVACIDAD` | Umbrales de aceptación. 0,88 y 0,90 por defecto |
| `GENESIS_EDAD_MINIMA` | 18 por defecto |
| `GENESIS_UMBRAL_USD` | Umbral de reporte por operación. 10 000 por defecto |

`GET /healthz` responde `degradado` mientras falte algo de lo esencial, y el
panel muestra cada carencia en la primera pantalla.

### Cargar las listas de sanciones

En la carpeta de `GENESIS_LISTAS_DIR`:

- `SDN.CSV` y `ALT.CSV` — formato oficial de la OFAC, tal cual se descargan de
  <https://sanctionslist.ofac.treas.gov/Home/SdnList>
- cualquier `*.json` con el formato de `RegistroSancion` — para listas locales,
  PEP nacionales o la lista consolidada de la UE ya convertida
- `meta.json` con `{"fechaDescarga":"2026-08-05"}` — si pasa de 30 días, el
  panel avisa

Después, **Listas → Recargar**: vuelve a tamizar a todas las identidades ya
registradas y abre casos por lo que aparezca.

---

## La API

Tres superficies, con credenciales distintas que no se mezclan.

### `/api/sesion/*` — operadores del panel

`entrar`, `salir`, `yo`, `contrasena`. Diez intentos por minuto y bloqueo de
15 minutos tras cinco fallos.

### `/api/v1/*` — apps del ecosistema (`X-API-Key`)

| Ruta | Alcance |
| --- | --- |
| `POST /identidades` | `identidad.crear` |
| `POST /identidades/:id/datos` | `identidad.crear` |
| `POST /identidades/:id/documento` | `identidad.documento` |
| `POST /identidades/:id/vivacidad` | `identidad.documento` — sortea el reto de gestos |
| `POST /identidades/:id/biometria` | `identidad.documento` — recibe los fotogramas del reto |
| `GET /identidades/:id`, `/por-email/:email` | `identidad.leer` |
| `POST /vinculos` | `vinculo.crear` |
| `GET /gid/:gid`, `/direccion/:dir` | `gid.verificar` |
| `GET /tamiz/direccion/:dir` | `tamiz.direccion` |
| `POST /sso/token`, `/sso/verificar` | `gid.verificar` |
| `POST /negocios`, `/negocios/:id/beneficiarios` | `negocio.crear` |
| `POST /movimientos` | `movimiento.enviar` |

Cada app tiene los suyos: ordenscan solo puede preguntar si un GID está
verificado, nunca crear identidades ni leer datos personales.

**Ninguna de estas rutas aprueba nada.**

### `/api/panel/*` — cumplimiento (sesión de operador)

Identidades, negocios, casos, listas, bitácora, operadores y aplicaciones.

| Rol | Puede |
| --- | --- |
| `admin` | todo, incluidos operadores y claves de API |
| `cumplimiento` | decidir sobre identidades, negocios y casos |
| `revisor` | preparar y recomendar, **no** aprobar |
| `auditor` | leerlo todo, no tocar nada |

---

## Integración con el ecosistema

La clave de API **no puede ir dentro de las apps móviles**: un APK se
descomprime y cualquiera la extraería. Por eso cada backend monta el puente de
`infra/genesis-proxy/genesis.router.js`:

```
teléfono ──▶ backend de la app (/genesis/*) ──X-API-Key──▶ Genesis ID
```

El router fija la cuenta a partir de la sesión del usuario, nunca del cuerpo de
la petición: si viniera del cliente, alguien podría atar su GID a la cuenta de
otro.

### Sesión única

Un GID vale en las tres apps. La app que ya autenticó al usuario pide un token
(`POST /api/v1/sso/token`) y cualquier otra lo valida
(`POST /api/v1/sso/verificar`). Si la identidad se suspende, los tokens vivos
dejan de valer en el acto.

Es un modelo de **cliente de confianza**: Genesis ID comprueba que la cuenta
esté atada a ese GID, pero no vuelve a autenticar a la persona — de eso responde
la app con su clave. Vale porque las tres son del mismo ecosistema; no sería
aceptable para aplicaciones de terceros.

---

## KYB: por qué se insiste tanto en los beneficiarios

Una empresa no se puede "mirar a la cara". Una sociedad se constituye en un día
y sirve perfectamente de pantalla, así que verificar la empresa sin saber quién
está detrás no verifica nada.

Por eso no se aprueba un negocio si:

- falta alguno de los seis documentos exigidos;
- no hay beneficiarios declarados, o no cubren al menos el 75 % de la propiedad;
- alguien con **≥ 25 %** no tiene su propia identidad personal verificada;
- un beneficiario tiene coincidencia fuerte en listas;
- el representante legal no está verificado.

Si nadie llega al 25 %, hay que identificar a quien controle por otra vía o a la
administración — es lo que exige la normativa, y el motor lo pide.

---

## Bitácora

Cada entrada lleva el hash de la anterior. Alterar o borrar una vieja rompe
todos los hashes posteriores, y `verificarCadena()` señala dónde. El panel lo
muestra en cada carga.

No impide la manipulación a quien controle la base —podría recalcular la cadena
entera— pero sí la hace evidente. Para hacerla irreversible habría que anclar el
último hash fuera del sistema; `anclaje()` lo devuelve listo para publicarlo en
la propia cadena de Orden Global, que es lo natural aquí.

De la bitácora se omiten siempre contraseñas, tokens, claves y fotos: se lee, se
exporta y se enseña a auditores externos, y un descuido ahí convierte el
registro de seguridad en una filtración.

---

## Analítica del ecosistema

Genesis ID es también el punto donde convergen las señales de todas las apps.
El panel vive en **`/analitica`** y se entra con la misma cuenta de operador.

### Por qué aquí y no en un servicio aparte

Levantar un segundo servicio significaba otra base, otro panel, otra contraseña
y otro sitio del que acordarse. Genesis ID ya sabe qué aplicaciones existen y ya
tiene claves de API por app, roles y una bitácora encadenada. La analítica se
monta encima de todo eso sin inventar nada.

### Qué se ve

| Pestaña | Qué responde |
| --- | --- |
| **Resumen** | Registrados, activos hoy / 7 d / 30 d, altas, eventos, errores y tasa por mil |
| **Apps** | La misma tabla comparada entre Veta Wallet, MyTokenPay, ordenscan y las que vengan |
| **Usuarios** | Altas por día, retención por cohorte semanal y qué versión tiene la gente instalada |
| **Países** | Dónde está la base, por usuarios y por uso |
| **Verificación** | El embudo del KYC: en qué paso exacto se cae la gente |
| **Errores** | Fallos agrupados por patrón, con pila, muestras, versiones afectadas y resolución |
| **Seguridad** | Movimientos sensibles de la bitácora, claves de API y operadores |
| **Salud** | Estado en vivo de todos los servicios del ecosistema |

### Tres decisiones de diseño

**No se guarda la IP ni el identificador del usuario.** De la IP se saca el país
y se descarta en el acto. Del identificador se guarda una huella HMAC con una
sal del servidor **y la clave de la app**: la misma persona se cuenta dos días
seguidos dentro de una app, pero la huella no se puede revertir ni cruzar entre
apps. Un panel de métricas no necesita saber quién es nadie, y este servicio
guarda documentos de identidad.

**Los eventos crudos no van en el documento de estado.** Todo Genesis ID cabe en
un documento de Mongo porque son miles de registros; la telemetría son millones.
Va en colecciones propias (`telemetria_*`) con caducidad automática a 90 días.

**Las cuentas se hacen al escribir, no al mirar.** Cada evento actualiza de paso
su resumen del día, así que el panel abre instantáneo aunque haya cien millones
de eventos guardados: nunca los recorre.

### Agrupación de errores

Los fallos se agrupan por **patrón**, no por texto exacto. «No se encontró el
cobro 8f2a-41bc-9d10» y «…3c91-77de-2a04» son el mismo fallo visto dos veces, y
salen como una fila que dice «3 veces, 3 personas» en vez de tres filas
distintas. Se normalizan UUID, identificadores cortos con guiones, direcciones
`0x…`, cadenas entre comillas y números — incluidos los pegados a su unidad,
como `15000ms`.

Un error dado por resuelto que reaparece **en una versión posterior** a la que se
declaró arreglada se marca `reabierto` solo. Si vuelve en una versión anterior,
es alguien con la app vieja y no molesta a nadie.

### Cómo reporta una app

```js
import { telemetria } from './telemetria.js'   // clientes/telemetria.js

telemetria.iniciar({
  url: 'https://genesis-id.onrender.com',
  clave: process.env.GENESIS_API_KEY,          // en el móvil, vía TU backend
  app: 'mytokenpay',
  version: '1.0.0',
  plataforma: 'android',
})

telemetria.identificar(usuario.id)
telemetria.accion('cobrar', { ruta: '/pos/cobro' })
telemetria.error(e, { ruta: '/pagar' })
```

En un backend Express:

```js
app.use(telemetria.express())          // antes de las rutas
app.use(telemetria.expressErrores())   // después
```

El cliente acumula por lotes, nunca lanza, nunca reintenta sin freno y engancha
solo los errores que nadie atrapó — que son justamente los que dejan la app en
negro.

> ⚠ **La clave no va dentro del APK.** Un APK se descomprime en diez segundos.
> Ponela en tu backend y que la app reporte contra un endpoint tuyo que
> reenvíe, igual que ya hace el puente de identidad de Veta Wallet.

### API

| Ruta | Quién | Para qué |
| --- | --- | --- |
| `POST /api/v1/telemetria/eventos` | App (`X-API-Key`, alcance `telemetria.enviar`) | Mandar un lote de hasta 200 eventos |
| `GET /api/v1/telemetria/esquema` | App | Qué campos acepta la puerta |
| `GET /api/panel/analitica/*` | Operador con `analitica.ver` | Todo lo del panel |
| `POST /api/panel/analitica/errores/:huella/estado` | Operador con `analitica.gestionar` | Resolver o ignorar un fallo (queda en la bitácora) |

### Variables de entorno

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `GENESIS_TELEMETRIA_DIAS` | `90` | Días que se guardan los eventos crudos |
| `GENESIS_TELEMETRIA_ATRASO_H` | `72` | Cuánto atraso se le acepta a un evento. Subir solo para importar historial |
| `GENESIS_TELEMETRIA_SAL` | el secreto de SSO | Sal de las huellas de usuario |
| `GENESIS_SERVICIOS` | los cinco del ecosistema | Qué vigila la pestaña Salud: `clave\|nombre\|url,…` |

---

## Pruebas

```sh
npm run prueba
```

**80 pruebas**, en dos bloques:

- `nucleo.test.ts` (53) — MRZ contra los ejemplos del estándar y contra
  manipulaciones, comparación de nombres, criptografía (incluido el rechazo de
  tokens `alg: none`), tamizado, riesgo, reglas AML e identificadores fiscales.
- `flujo.test.ts` (27) — el servidor real de punta a punta. La mitad comprueba
  **lo que ya no se puede hacer**: que las rutas viejas devuelvan 404, que una
  clave de API no apruebe, que un operador no apruebe con bloqueos, que un GID
  suspendido invalide sus tokens.

Una de las pruebas encontró un fallo de diseño durante el desarrollo: con el
nombre exacto de un sancionado pero otra fecha de nacimiento, la coincidencia
desaparecía del todo. Como usar una fecha falsa es justamente una forma de
esquivar el tamizado, ahora se mantiene visible para el analista aunque deje de
contar como coincidencia fuerte.

---

## Qué falta

- **Montar el puente en el backend de Veta Wallet.** El router está listo y
  probado en `infra/genesis-proxy/`, y el cliente móvil ya apunta a él, pero
  añadirlo al backend exige un despliegue en Heroku — bloqueado por el mismo
  token vencido que la rotación de `PASS_ADM`. Hasta entonces la app enseña
  "el servidor todavía no tiene activada la conexión", que es la verdad.
- **Probar el flujo en un teléfono.** La lógica está verificada de punta a
  punta contra el servidor real, pero la cámara y el teclado solo se pueden
  comprobar ejecutando la app.
- **Cargar las listas reales** y montar el disco en Render.
- **Crear el usuario de IAM para Rekognition** y poner sus dos claves en Render.
  El código está listo y probado contra AWS, pero hace falta una credencial
  permanente con `rekognition:CompareFaces` y `rekognition:DetectFaces`, y eso
  se crea desde la consola de IAM.
- **Mover los retos de vivacidad a Mongo** si algún día Genesis ID corre en más
  de una instancia. Hoy viven en memoria, que es correcto con una sola.
- **Anclar el hash de la bitácora** en la cadena 5550.
