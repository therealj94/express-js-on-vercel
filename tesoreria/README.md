# Tesorería de Orden Global

Tres plataformas web, un servidor y una sola regla:
**ningún token sale al mercado sin respaldo certificado detrás.**

| Pieza | Qué es |
|---|---|
| `index.html` | Portal de entrada y explicación del flujo |
| `origen.html` | **Autoridad de Emisión de ORIGEN** — la que decide |
| `security.html` | Tesorería de Security Tokens (ONDK, MPLE, VTRE) |
| `utility.html` | Tesorería de Utility Tokens (VETA, OGS, MTP) |
| `app/reglas.js` | **Las reglas del negocio y los comandos.** Corre igual en el navegador y en el servidor |
| `app/datos.js` | La semilla de datos: el contrato de la API |
| `servidor/` | El backend: sesiones, firmas Ed25519, libro SHA-256, almacén, cadena 5550, Genesis ID |

El front funciona solo (abre `index.html`, o la copia estática en `/tesoreria` del Express del repo):
en ese caso corre en **modo demostración local**, con el estado en `localStorage`.
Servido desde `servidor/`, corre en **modo servidor**: pide sesión, cada comando viaja al API
y vuelve con el estado sellado. Las vistas no distinguen el modo.

---

## 1. El modelo: por qué esto no es cripto

En una cripto normal el token nace primero y el mercado le busca precio. Aquí es al revés:

```
Activo real → certificación de un tercero → aforo por riesgo → ORIGEN → autorización → token
```

1. **Activo real.** Un bien que existe: mineral, inmueble, caja, cuenta por cobrar.
2. **Certificación.** Un auditor o valuador independiente lo certifica con folio y vigencia.
3. **Aforo (haircut).** Descuento por riesgo de realización. Solo el valor *después* del aforo respalda.
4. **ORIGEN.** La cripto nativa de la cadena 5550: `1 ORIGEN = 1 gramín = 1/55 g de oro certificado en bóveda`.
   El ORIGEN en circulación se valora al precio de referencia del oro que fija el Consejo
   (`politica.oroUsdPorGramo`, con fuente y fecha; si pasa de 30 días, el panel avisa).
5. **Autorización.** La tesorería pide emitir con causa, evidencia y firmas. Sin ORIGEN libre, se niega.
6. **Emisión.** Salen solo los tokens que el valor certificado aguanta, al precio establecido.

### Las invariantes que el sistema hace cumplir

Están en `app/reglas.js` y se evalúan en cada render en el navegador **y en cada comando en el servidor**:

| Invariante | Dónde |
|---|---|
| `valor del ORIGEN emitido ≤ Σ reservas certificadas × (1 − aforo)` | `respaldo()` |
| Un certificado vencido o en revisión vale **cero** | `valorAdmisible()` |
| `ORIGEN comprometido ≤ ORIGEN emitido` → el resto es *libre* | `respaldo()` |
| No se aprueba emisión si `origenRequerido > libre` o el ratio cae bajo el mínimo | `puedeEmitir()` / `solicitud.aprobar` |
| Security: `autorizado × precio ≤ valuación certificada`; el precio es el del Comité, no el del solicitante | `solicitud.crear`, `valuacion.asentar` |
| Utility: `circulante ≤ capacidad de servicio` y `pasivo redimible ≤ ORIGEN asignado` | `saludUtility()`, `capacidad.actualizar` |
| Emitir exige cabecera autorizada **y** respaldo, valuación y capacidad suficientes | `token.emitir` |
| El secundario solo admite órdenes dentro de la banda sobre el precio certificado | `orden.colocar` |
| El transfer agent bloquea lock-up y destinatarios sin Genesis ID | `token.transferir` |
| Quemar libera el ORIGEN proporcional y lo devuelve al pozo libre | `token.quemar` |
| El ratio mínimo nunca baja de 100 % ni se exigen más firmas que consejeros | `politica.modificar` |
| Toda mutación es un comando con permiso y se asienta en un libro encadenado por hash | `ejecutar()` / `verificarLibro()` |

### Security vs Utility

| | Utility | Security |
|---|---|---|
| Qué entrega | Acceso a un servicio | Derecho patrimonial |
| Precio | Anclado al costo del servicio | Valuación independiente certificada |
| Por qué se emite | Hay capacidad contratada y consumo | Hay activo certificado |
| Rendimiento | Ninguno | Dividendo o participación |
| Secundario | Libre entre usuarios | Ventanas, banda de precio y acreditados |
| Respaldo ORIGEN | Solo la parte redimible | El total del valor emitido |

---

## 2. Cómo está construido

### Una sola fuente de verdad: `app/reglas.js`

Es un archivo UMD: el navegador lo carga con `<script>` y el servidor con `require()`.
Contiene las reglas (`respaldo`, `puedeEmitir`, `saludSecurity`, `saludUtility`, `avisos`),
los catálogos (causas de emisión, roles y permisos) y **los comandos**: cada cambio de estado
tiene nombre, permiso y validación.

```js
R.ejecutar(estado, 'solicitud.aprobar', { id: 'SOL-0001' }, { actor, rol, hash, firmar })
// → { estado: <copia con el cambio>, evento: <asiento sellado>, resultado }
```

Si el comando lanza, el estado no cambia. El navegador lo usa para **explicar** (dictamen
anticipado, techos, alertas); el servidor lo usa para **impedir**.

### El navegador: `app/nucleo.js`

Cliente de estado con dos modos. Al arrancar prueba `api/salud`: si responde, modo servidor
(y pantalla de entrada si no hay sesión); si no, modo local. `T.ejecutar(nombre, datos)` corre
el comando localmente o lo manda a `POST api/comandos`; `T.correr(...)` además avisa con un toast.

### El servidor: `servidor/`

Express + TypeScript, con las mismas convenciones que Genesis ID.

| Archivo | Qué hace |
|---|---|
| `src/reglas.ts` | Carga `../app/reglas.js` y `../app/datos.js` con `createRequire` |
| `src/store.ts` | Almacén en archivo (dev) o MongoDB (`TESORERIA_MONGO_URL`), un documento, escritura atómica |
| `src/cripto.ts` | scrypt para contraseñas, SHA-256 para el libro, **Ed25519** para las firmas del Consejo |
| `src/operadores.ts` | Operadores, roles, sesiones, primer presidente, bloqueo por fuerza bruta |
| `src/rutas.ts` | El API. Una sola puerta de escritura: `POST /api/comandos` |
| `src/cadena.ts` | Lee `totalSupply()` de los contratos en la cadena 5550 y lo concilia con lo autorizado |
| `src/genesis.ts` | Verifica tokens de sesión única de Genesis ID (`/api/v1/sso/verificar`) |
| `src/pruebas/` | 26 pruebas con `node:test`: reglas y flujo completo contra un servidor real |

**Roles** (de `reglas.js`, los mismos en los dos lados):

| Rol | Puede |
|---|---|
| `presidente` | Todo: política, operadores, freno, dictaminar, firmar |
| `consejero` | Firmar, dictaminar, objetar, solicitar, operar tesorerías, reservas, emitir/quemar ORIGEN, freno |
| `tesorero` | Solicitar, operar tesorerías, reservas |
| `auditor` | Ver todo, no tocar nada |

**Firmas.** Cada operador nace con un par Ed25519. `solicitud.firmar` en el servidor firma el
texto canónico de la solicitud (id, token, cantidad, precio, respaldo, fecha) con la llave del
consejero en sesión; `GET /api/solicitudes/:id/firmas` las verifica contra su llave pública.
La llave privada la custodia hoy el servidor; el siguiente paso es llevarla al dispositivo
(WebAuthn / llave de hardware) sin cambiar el formato de la firma.

**Libro.** SHA-256 encadenado. `GET /api/libro/verificar` recorre la cadena;
`GET /api/libro/ancla` da el sello listo para publicarlo en la cadena 5550.

**Contraseña provisional.** Un operador recién creado puede entrar y mirar, pero no operar
hasta cambiarla (`POST /api/sesion/contrasena`).

### API

| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| `GET` | `/api/salud` · `/healthz` | no | Estado del servicio, almacén, sello del libro |
| `GET` | `/api/prueba-de-reservas` · `/api/respaldo` | no | El documento público de respaldo |
| `GET` | `/api/libro/verificar` · `/api/libro/ancla` | no | Integridad y sello del libro |
| `GET` | `/api/solicitudes/:id/firmas` | no | Verificación Ed25519 de las firmas |
| `POST` | `/api/sesion/entrar` · `/genesis` · `/salir` · `/contrasena` | — | Sesión por contraseña o por token de Genesis ID |
| `GET` | `/api/estado` | sí | El estado completo, con la sesión y el Consejo real |
| `GET` | `/api/comandos` | sí | Catálogo de comandos y cuáles permite el rol |
| `POST` | `/api/comandos` `{nombre, datos}` | sí + permiso | **La única puerta de escritura** |
| `GET` | `/api/libro?desde=&cuantos=` | sí | Asientos paginados |
| `GET` | `/api/cadena/conciliacion` | sí | Supply en cadena vs. autorizado, por token |
| `GET/POST` | `/api/operadores` · `POST /:id/baja` | presidente | Alta y baja de operadores |
| `POST` | `/api/estado/reiniciar` | presidente | Volver a la semilla (queda asentado) |

---

## 3. Correr en local

```bash
cd tesoreria/servidor
npm install
TESORERIA_ADMIN_PASSWORD='una-contrasena-larga' npm start
# → http://localhost:4100  (front + API)
npm run prueba      # 26 pruebas
npm run typecheck
```

Sin `TESORERIA_ADMIN_PASSWORD` el servidor genera una y la imprime **una sola vez** al arrancar.
Entra con `tesoreria@ordenglobal.org` (o `TESORERIA_ADMIN_EMAIL`).

Solo el front, sin servidor (modo demostración local):

```bash
npx http-server tesoreria -p 8080
```

## 4. Desplegar

`render.yaml` en la raíz del repo ya trae el servicio `tesoreria` (rootDir `tesoreria/servidor`).
Variables:

| Variable | Para qué |
|---|---|
| `TESORERIA_MONGO_URL` / `TESORERIA_MONGO_DB` | **Obligatoria para operar de verdad.** Sin Mongo, el libro se pierde en cada despliegue |
| `TESORERIA_ADMIN_EMAIL` / `_PASSWORD` / `_NOMBRE` | El primer presidente del Consejo |
| `TESORERIA_GENESIS_URL` / `TESORERIA_GENESIS_API_KEY` | Entrada con la sesión única de Genesis ID. La clave se emite en el panel de Genesis para la app `tesoreria` con alcance `gid.verificar` |
| `RPC_ORDEN_URL` | RPC de la cadena 5550 (por defecto `https://rpc.ordenglobal-rpc.com/`) |
| `TESORERIA_CORS` | Orígenes adicionales que pueden llamar al API (la copia estática en Vercel) |
| `TESORERIA_SESION_HORAS` | Duración de la sesión (8 por defecto) |

**Entrar con Genesis ID.** Un consejero con identidad verificada se da de alta en la Tesorería
con su GID. Genesis emite un token de sesión única (`/api/v1/sso/token`); la Tesorería lo
recibe en `POST /api/sesion/genesis` (o en la URL como `?gid_token=`), lo verifica con su clave
de API y abre sesión. La Tesorería nunca ve contraseñas ni documentos de nadie.

**Conciliación con la cadena.** `origen.html#cadena` lee el `totalSupply()` real de cada contrato
(ONDK en `0xfb83…19c1`) y lo compara con lo autorizado. Si la cadena tiene más de lo autorizado,
hay supply sin expediente y se marca en rojo. La semilla de ONDK parte de los 555 M que la
cadena reporta, para que el registro y la cadena cuadren desde el primer día.

---

## 5. Lo que queda por decidir (no por programar)

- **Custodia de llaves.** Hoy las llaves Ed25519 del Consejo las guarda el servidor. Pasarlas a
  llaves de hardware o WebAuthn es un cambio de custodia, no de formato.
- **Anclaje en cadena.** `GET /api/libro/ancla` ya da el sello; publicarlo en la 5550 requiere una
  cuenta con ORIGEN para pagar (hoy baseFee 0) y decidir cada cuánto se ancla.
- **Emisión on-chain.** La Tesorería autoriza; ejecutar el `mint` en el contrato sigue siendo un
  acto del operador de la cadena. La conciliación es lo que cierra el círculo mientras tanto.
- **Fuente del precio del oro.** Se fija a mano con fuente y fecha; puede automatizarse contra un
  fix público, pero conviene que siga siendo un acto del Consejo que queda en el libro.
