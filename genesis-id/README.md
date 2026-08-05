# Genesis ID

Motor de identidad del ecosistema Orden Global: KYC de personas, KYB de
empresas, tamizado contra listas de sanciones, monitoreo AML de transacciones e
inicio de sesión único entre Veta Wallet, MyTokenPay y ordenscan.

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

### Lo que NO puede afirmar

- **Que el documento sea auténtico.** Que la MRZ cuadre prueba que está bien
  formado, no que lo emitiera un país. Para eso hay que leer el chip NFC y
  validar su firma contra el directorio de claves de la OACI.
- **Que la persona sea la del documento.** Eso es biometría, y hace falta un
  proveedor que responda por su tasa de error. `kyc/biometria.ts` define el
  hueco; sin proveedor, el cotejo lo hace una persona.
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
| `GENESIS_BIOMETRIA_URL` / `_KEY` | Proveedor de cotejo de rostro y prueba de vida |
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
| `POST /identidades/:id/biometria` | `identidad.documento` |
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
- **Contratar el proveedor de biometría**, o asumir el cotejo manual.
- **Anclar el hash de la bitácora** en la cadena 8532.
