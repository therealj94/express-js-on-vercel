# OrdenExchange · Contrato de la API

Base: `/api`. Todo es JSON. Los montos son **cadenas decimales** («12.50»). Las fechas, ISO 8601.
Errores: `{ "error": "texto en español", "codigo"?: "clave-corta" }` con el código HTTP que corresponda
(400 datos mal, 401 sin sesión, 403 sin permiso / no puede operar, 404 no existe, 409 conflicto de estado,
413 demasiado grande, 429 demasiadas peticiones, 503 servicio externo no configurado).

Sesión de usuario: `Authorization: Bearer <token>` (JWT que devuelve `/auth/registro`, `/auth/entrar` o `/auth/sso`).
Sesión de operador (panel): `Authorization: Bearer <token de /panel/sesion/entrar>`.

Los tipos (`UsuarioPropio`, `UsuarioPublico`, `AnuncioPublico`, `Anuncio`, `Orden`, `MetodoPago`, `Saldo`,
`Movimiento`, `Retiro`, `Deposito`, `SolicitudAgente`, `Precios`, `Reputacion`…) están en `src/types.ts`.

---

## Público (sin sesión)

| Ruta | Respuesta |
| --- | --- |
| `GET /healthz` | `{ estado: 'ok'\|'degradado', en, version:{commit,rama}, comprobaciones:{ almacenPersistente, genesisConfigurado, cadenaConfigurada, tesoreriaConfigurada, demo } }` |
| `GET /api` | `{ nombre:'OrdenExchange', version:1, demo:boolean, rutas:{…} }` |
| `GET /api/mercado/catalogo` | ver abajo |
| `GET /api/mercado/precios?moneda=HNL` | `{ moneda, oroUsdOnza, plataUsdOnza, fx:number (USD→moneda), referencia: { ORIGEN:{usd:string, fiat:string}, AUKA:{…}, AGKA:{…} }, actualizadoEn, fuente }` |
| `GET /api/mercado/anuncios` | `{ anuncios: AnuncioPublico[], total, pagina, porPagina }` |
| `GET /api/mercado/anuncios/:id` | `{ anuncio: AnuncioPublico }` |
| `GET /api/usuarios/:id/perfil` | `{ usuario: UsuarioPublico, anuncios: AnuncioPublico[] }` |

### `GET /api/mercado/catalogo`

```json
{
  "activos": [ { "simbolo":"ORIGEN", "nombre":"Origen", "decimales":8, "ancla":"oro" }, … ],
  "paises": [
    { "iso2":"HN", "iso3":"HND", "nombre":"Honduras", "nombreEn":"Honduras", "bandera":"🇭🇳",
      "moneda": { "codigo":"HNL", "nombre":"Lempira", "simbolo":"L", "decimales":2 },
      "prefijoTelefono":"+504",
      "metodos": [
        { "tipo":"transferencia", "nombre":"Transferencia bancaria", "nombreEn":"Bank transfer", "categoria":"banco",
          "bancos":["Banco Atlántida","BAC Credomatic","Ficohsa",…],
          "campos":[ { "clave":"cuenta","etiqueta":"Número de cuenta","etiquetaEn":"Account number","obligatorio":true }, … ] },
        { "tipo":"tigo-money", "nombre":"Tigo Money", "categoria":"billetera", "campos":[…] }
      ] }, …
  ],
  "ventanasPago": [15,30,45,60],
  "configuracion": { "comisionPct":0, "garantiaAgente":"500", "maxOrdenesAbiertas":5, "minOrdenUsd":5, "maxOrdenUsdSinAgente":5000 },
  "demo": true
}
```

### `GET /api/mercado/anuncios` — filtros (query)

| Parámetro | Valores |
| --- | --- |
| `quiero` | `comprar` (muestra anuncios de venta) · `vender` (muestra anuncios de compra). Alternativa: `lado=venta\|compra` (lado del anunciante) |
| `activo` | `ORIGEN` (defecto) · `AUKA` · `AGKA` |
| `moneda` | código ISO 4217 (`HNL`, `MXN`…). Si falta, todas |
| `pais` | ISO2. Si falta, todos |
| `monto` | monto en moneda local: solo anuncios cuyos límites lo aceptan y con disponible suficiente |
| `metodo` | tipo de método (`transferencia`, `pix`, `nequi`…) |
| `soloAgentes` | `1` |
| `orden` | `precio` (defecto: mejor precio para quien consulta) · `completadas` · `reciente` |
| `pagina`, `porPagina` | 1…, máx 50 |

Con sesión, cada anuncio trae `cumpleRequisitos` y `motivoNoCumple` (y nunca aparecen los anuncios propios).

### Tipos y campos canónicos de los métodos de pago (`src/data/latam.ts`)

El mismo `tipo` significa lo mismo en todos los países, y los `campos` usan estas claves (el frontend
las pinta con `etiqueta`/`etiquetaEn` del catálogo; la semilla demo y las pruebas dependen de ellas):

| `tipo` | categoría | campos (obligatorio ✱) | dónde |
| --- | --- | --- | --- |
| `transferencia` | banco (lleva `bancos`) | `cuenta`✱, `tipoCuenta`, `documento` … y por país: `clabe`✱ (MX, `cuenta` opcional), `cbu`✱ + `alias` (AR), `cci`✱ (PE), `iban`✱ (CR), `rut`✱ (CL), `cpf`✱ + `agencia` (BR), `cedula` (VE, CO, DO, EC…) | todos |
| `pix` | billetera | `llave`✱, `tipoLlave` | BR |
| `mercado-pago` | billetera | `alias`✱, `cvu` (AR) · `clabe`✱ (MX) | AR, MX |
| `nequi`, `daviplata`, `movii`, `bre-b` | billetera | `telefono`✱ (`bre-b`: `llave`✱) | CO (`nequi` también PA) |
| `yape`, `plin` | billetera | `telefono`✱ | PE |
| `sinpe-movil` | billetera | `telefono`✱ | CR |
| `tigo-money` | billetera | `telefono`✱ | HN, GT, SV, BO, PY |
| `pago-movil` | billetera (lleva `bancos`) | `telefono`✱, `cedula`✱ | VE |
| `zelle` | billetera | `contacto`✱ (correo o teléfono) | VE, PR, DO, PA |
| `yappy` | billetera | `telefono`✱ | PA |
| `ath-movil` | billetera | `telefono`✱ | PR |
| `de-una` | billetera | `telefono`✱ | EC |
| `mach`, `tenpo` | billetera | `telefono`✱ o `rut` | CL |
| `prex`, `mi-dinero` | billetera | `telefono`✱ | UY |
| `personal-pay`, `zimple` | billetera | `telefono`✱ | PY |
| `moncash`, `natcash` | billetera | `telefono`✱ | HT |
| `mmg` | billetera | `telefono`✱ | GY |
| `uni5pay` | billetera | `telefono`✱ | SR |
| `digi-wallet` | billetera | `telefono`✱ | BZ |
| `efectivo` | efectivo | `ciudad`✱, `nota` | donde tenga sentido |

Bancos que la semilla demo y las pruebas dan por existentes: Honduras «Banco Atlántida», «BAC Credomatic»;
Guatemala «Banco Industrial»; México «BBVA México»; Venezuela «Banco de Venezuela» (en `pago-movil` y en
`transferencia`).

---

## Autenticación (`/api/auth`)

| Ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `POST /registro` | `{ email, contrasena (≥8), apodo (3–20, letras/números/_), pais (ISO2), idioma?:'es'\|'en' }` | 201 `{ token, usuario: UsuarioPropio, verificacionPendiente:true, correoEnviado:boolean, codigoDemo?:string }`. Se manda un código de 6 dígitos al correo; fuera de producción y sin proveedor de correo, el código vuelve en `codigoDemo` |
| `POST /verificar-correo` | `{ codigo }` (con sesión) | `{ usuario }` con `emailVerificado:true`. 400 `codigo:'codigo'` (incorrecto) o `'codigo-vencido'` |
| `POST /reenviar-codigo` | — (con sesión) | `{ ok, correoEnviado, codigoDemo? }` |
| `POST /entrar` | `{ email, contrasena }` | `{ token, usuario }` |
| `POST /sso` | `{ token (SSO de Genesis emitido por otra app), email?, apodo?, pais?, contrasena? }` | `{ token, usuario, nuevo, correoEnviado?, codigoDemo? }`. Si no hay cuenta con ese GID y faltan `email/apodo/pais/contrasena`: 409 `{ error, codigo:'necesita-registro', gid }`. La cuenta nueva nace verificada en Genesis pero con el correo por confirmar |
| `GET /yo` | — | `{ usuario: UsuarioPropio, saldos: Saldo[] }` |
| `PATCH /yo` | `{ apodo?, pais?, idioma?, telefono?, direccionCadena? }` | `{ usuario }`. Una dirección que alguna vez fue de otra cuenta se rechaza (409 `direccion-en-uso`) |
| `POST /contrasena` | `{ actual, nueva }` | `{ ok:true, token }` — cierra todas las sesiones y devuelve una nueva para esta |
| `POST /salir` | — (con sesión) | 204 — invalida los tokens de todos los dispositivos |
| `POST /demo/entrar` | `{ apodo }` (solo con `demo:true`) | `{ token, usuario }` — entra como uno de los usuarios sembrados |
| `GET /demo/usuarios` | (solo demo) | `{ usuarios:[{apodo, pais, agente, descripcion}] }` |

`UsuarioPropio.puedeOperar` es `false` (con `motivoNoOpera`) cuando: no tiene GID verificado, está congelado, o su país no está permitido.
`UsuarioPropio.emailVerificado` dice si el correo está confirmado: sin eso, todo `/api/genesis/*` (salvo `sso/token` y `tamiz`) responde 403 `codigo:'correo-no-verificado'`.

---

## Genesis ID (`/api/genesis`, con sesión) — el puente

Mismo contrato que `infra/genesis-proxy`: el servidor habla con Genesis ID con su clave; el navegador nunca la ve.

| Ruta | Para qué |
| --- | --- |
| `GET /estado` | Estado del trámite del usuario (por su correo confirmado). Crea la identidad si no existe. **Sincroniza** `gid`/`gidEstado` del usuario (nunca degrada una cuenta ya verificada por otra vía: entonces `aviso`). Devuelve `{ identidad:{ id, estado, gid, pendientes, documento, biometria, … }, usuario: UsuarioPropio, aviso: string\|null }` |
| `POST /datos` | `{ nombreCompleto, fechaNacimiento (AAAA-MM-DD), paisResidencia (ISO3), telefono?, direccion?, ocupacion?, origenFondos?, propositoCuenta?, volumenEsperadoUsd?, pepDeclarado? }` |
| `POST /documento` | `{ mrz, textoAnverso? }` → `{ identidad, documento:{ aceptable, problemas:[] } }` |
| `POST /vivacidad` | — → `{ reto }` o 503 si no hay biometría |
| `POST /biometria` | `{ selfie, fotoDocumento?, reto?, fotogramas? }` |
| `POST /vincular` | Ata la cuenta de OrdenExchange al GID (cuenta = id del usuario, dirección = `direccionCadena`) |
| `POST /sso/token` | `{ token, expiraEnSegundos }` para entrar en otra app del ecosistema |
| `GET /tamiz/:direccion` | `{ tamizado, sancionada, aviso? }` |

Sin `GENESIS_API_KEY`: 503 `{ error, codigo:'genesis-no-configurado' }`. En modo demo: `POST /api/genesis/demo/verificar` marca la cuenta como verificada con un GID de prueba.

---

## Billetera (`/api/billetera`, con sesión)

| Ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /` | — | `{ saldos: Saldo[] (siempre los 3 activos), direccionDeposito: string\|null (tesorería), direccionCadena, cadena:{ id:5550, rpc, explorador } }` |
| `GET /movimientos?activo=&pagina=` | — | `{ movimientos: Movimiento[], total }` |
| `GET /depositos` | — | `{ depositos: Deposito[] }` |
| `POST /depositos` | `{ txHash, activo }` | 201 `{ deposito }`. Comprueba en la cadena que la tx va a la tesorería, que `from` es `direccionCadena` del usuario y que tiene confirmaciones. Errores 400 con `codigo`: `tx-no-encontrada`, `tx-pendiente`, `tx-fallida`, `destino-incorrecto`, `origen-incorrecto`, `tx-ya-acreditada`, `sin-direccion` |
| `GET /retiros` | — | `{ retiros: Retiro[] }` |
| `POST /retiros` | `{ activo, cantidad, direccion, contrasena }` | 201 `{ retiro }` (queda `pendiente`, el monto pasa a congelado). 400 `codigo:'direccion-sancionada'` si el tamiz la marca |
| `POST /retiros/:id/cancelar` | — | `{ retiro }` (solo `pendiente`) |
| `POST /faucet` | `{ activo, cantidad }` (solo demo) | `{ saldos }` |

---

## Métodos de pago (`/api/metodos-pago`, con sesión)

| Ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /` | — | `{ metodos: MetodoPago[] }` |
| `POST /` | `{ pais, tipo, banco?, titular, campos:{…} }` (moneda y nombre se derivan del catálogo; se validan los campos obligatorios) | 201 `{ metodo }` |
| `PATCH /:id` | `{ titular?, banco?, campos?, activo? }` | `{ metodo }` |
| `DELETE /:id` | — | 204 (si está en un anuncio activo, 409) |

---

## Mis anuncios (`/api/anuncios`, con sesión, exige `puedeOperar`)

| Ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /` | — | `{ anuncios: Anuncio[] }` (los propios, con `precioEfectivo` añadido) |
| `POST /` | `{ lado, activo, moneda, pais, tipoPrecio, precio? (fijo), margen? (flotante, 80–120), cantidadTotal, limiteMin, limiteMax, metodosPagoIds?: string[] (venta: cuentas propias), metodosTipos?: string[] (compra: tipos que acepta), ventanaPagoMin, terminos?, respuestaAutomatica?, requisitos?:{ ordenesMin?, tasaFinalizacionMin?, diasRegistroMin?, soloAgentes? } }` | 201 `{ anuncio }` |
| `GET /:id` | — | `{ anuncio }` |
| `PATCH /:id` | mismos campos, parciales (no se cambia `lado`, `activo`, `moneda`) | `{ anuncio }` |
| `POST /:id/estado` | `{ estado: 'activo'\|'pausado'\|'cerrado' }` | `{ anuncio }` (cerrar con órdenes abiertas → 409) |

Reglas: en un anuncio de **venta** el disponible del anunciante debe cubrir `cantidadTotal` al crearlo; `limiteMin ≥ minOrdenUsd` equivalente; `limiteMax ≤ cantidadTotal × precio`; máximo 1 anuncio activo por (lado, activo, moneda).

---

## Órdenes (`/api/ordenes`, con sesión)

| Ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `POST /` | `{ anuncioId, montoFiat? \| cantidadActivo? (uno de los dos), metodoTipo?, metodoId? }` — en un anuncio de **venta** el comprador elige con `metodoTipo` uno de los `metodos[].tipo` del anuncio (ahí pagará; si el anuncio tiene uno solo, se puede omitir); en uno de **compra** el tomador manda `metodoId` de un método **propio** (donde recibirá), cuyo tipo debe estar entre los del anuncio | 201 `{ orden: OrdenDetalle }` |
| `GET /?estado=&rol=comprador\|vendedor&pagina=` | — | `{ ordenes: OrdenResumen[], total, abiertas:number }` |
| `GET /:id` | — | `{ orden: OrdenDetalle }` (marca `vistaPor`) |
| `POST /:id/pagado` | `{ referencia? }` (comprador, en `pendiente-pago`) | `{ orden }` |
| `POST /:id/liberar` | `{ contrasena }` (vendedor, en `pagado` — también en `pendiente-pago` si quiere) | `{ orden }` → `completada` |
| `POST /:id/cancelar` | `{ motivo? }` (comprador, solo en `pendiente-pago`) | `{ orden }` |
| `POST /:id/apelar` | `{ motivo: 'no-recibi-pago'\|'no-liberan'\|'monto-incorrecto'\|'otro', detalle }` (cualquiera de los dos, en `pagado`; el comprador también en `pendiente-pago` si ya pagó, y en una orden `cancelada` por vencimiento hace menos de 24 h: la custodia se vuelve a tomar del vendedor). **Una apelación por parte y orden** | `{ orden }` → `apelacion` |
| `POST /:id/apelacion/retirar` | — (quien la abrió) | `{ orden }` (vuelve al estado anterior; si la ventana de pago ya venció, la orden vence en el acto). La apelación retirada cuenta en contra en la reputación |
| `GET /:id/mensajes?desde=<id del último>` | — | `{ mensajes: Mensaje[], estado, orden: OrdenDetalle sin `mensajes` + totalMensajes }` (para sondeo cada 3–5 s) |
| `POST /:id/mensajes` | `{ texto?, imagen? (data URL ≤ 1,5 MB) }` — máximo 6 imágenes por orden; el chat cierra 24 h después de completar/cancelar | 201 `{ mensaje }`. `mensaje.imagen` vuelve como **URL firmada** (`/api/ordenes/<id>/imagenes/<img>?f=…`) para poner directo en `<img src>` |
| `GET /:id/imagenes/:img?f=<firma>` | sin sesión (la firma la conocen solo las partes) | la imagen (PNG/JPEG/WebP/GIF) |
| `POST /:id/liberar` durante una `apelacion` | el vendedor puede liberar en cualquier momento: zanja la apelación a favor del comprador | `{ orden }` → `completada` |
| `POST /:id/calificar` | `{ tipo:'positiva'\|'negativa', comentario? }` (solo `completada`, una vez por parte) | `{ orden }` |

`OrdenResumen` = `Orden` sin `mensajes` ni `metodoPago.campos`, más `{ contraparte: UsuarioPublico, miRol:'comprador'\|'vendedor', noLeidos:number }`.
`OrdenDetalle` = `Orden` completa más `{ contraparte, miRol, noLeidos, acciones: { pagar, liberar, cancelar, apelar, retirarApelacion, calificar, chatear }: boolean, segundosRestantes:number\|null }`.
`metodoPago.campos` solo se incluye si la orden está abierta (`pendiente-pago`, `pagado`, `apelacion`) o el que consulta es el vendedor.

Cuándo se congela: al crear la orden se congela `cantidadActivo` del vendedor (si no le alcanza, 409 `codigo:'sin-saldo'` y el anuncio se pausa). Al liberar: `cantidadActivo` entera pasa al disponible del comprador y la comisión la paga el **vendedor** de su disponible (si no le alcanza, se descuenta de lo entregado); la comisión va a la tesorería. Al cancelar (comprador, vencimiento, operador o apelación resuelta como `devolver`): vuelve al disponible del vendedor. Una cuenta congelada por un operador no inicia ninguna transición (403 `congelado`); la contraparte y el operador sí.

En un anuncio de venta con varios métodos del mismo tipo, el comprador puede precisar `metodoBanco` además de `metodoTipo`.

---

## Agentes de cambio (`/api/agentes`, con sesión)

| Ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /estado` | — | `{ estadoAgente, solicitud: SolicitudAgente\|null, garantiaRequerida:string, requisitos:{ gidVerificado, saldoSuficiente, ordenesMin:number, ordenesCompletadas:number }, cumple:boolean }` |
| `POST /solicitar` | `{ descripcion }` | 201 `{ solicitud }` — congela la garantía en ORIGEN |
| `POST /retirar` | — | `{ solicitud }` — retira una solicitud pendiente y devuelve la garantía |
| `POST /renunciar` | — | `{ usuario }` — deja de ser agente (sin órdenes abiertas ni anuncios activos) y recupera la garantía |

---

## Panel de operadores (`/api/panel`, sesión de operador)

| Ruta | Cuerpo / query | Respuesta |
| --- | --- | --- |
| `POST /sesion/entrar` | `{ email, contrasena }` | `{ token, operador:{ id,email,nombre,rol,debeCambiarContrasena } }` |
| `GET /sesion/yo` | — | `{ operador }` |
| `POST /sesion/salir` | — | 204 |
| `POST /sesion/contrasena` | `{ actual, nueva }` | `{ ok }` |
| `GET /resumen` | — | `{ usuarios:{ total, verificados, agentes, congelados }, ordenes:{ abiertas, pendientesPago, pagadas, apelaciones, completadas24h, completadas30d, volumenUsd30d }, retirosPendientes, solicitudesAgente, depositos24h, custodia:{ ORIGEN:string, AUKA:string, AGKA:string }, precios: Precios, almacen:{ motor, efimero } }` |
| `GET /ordenes?estado=&q=&pagina=` | `q` busca por número, apodo o correo | `{ ordenes: OrdenResumenPanel[], total }` |
| `GET /ordenes/:id` | — | `{ orden: Orden (completa), comprador: UsuarioPublico, vendedor: UsuarioPublico }` |
| `POST /ordenes/:id/resolver` | `{ resolucion:'liberar'\|'devolver', nota }` (solo en `apelacion`; `admin`/`soporte`) | `{ orden }` |
| `POST /ordenes/:id/cancelar` | `{ nota }` (en `pendiente-pago` o `pagado`) | `{ orden }` |
| `POST /ordenes/:id/mensajes` | `{ texto }` (mensaje del operador en el chat, `de:'operador:<id>'`) | `{ mensaje }` |
| `GET /apelaciones` | — | `{ ordenes: OrdenResumenPanel[] }` (estado `apelacion`, más viejas primero) |
| `GET /agentes?estado=pendiente` | — | `{ solicitudes: (SolicitudAgente & { usuario: UsuarioPublico })[] }` |
| `POST /agentes/:id/decidir` | `{ decision:'aprobar'\|'rechazar', nota }` | `{ solicitud }` |
| `POST /usuarios/:id/agente` | `{ estado:'aprobado'\|'suspendido'\|'retirado', nota }` — suspender deja la garantía en custodia y pausa sus anuncios; `retirado` la devuelve y lo saca del rol | `{ usuario }` |
| `GET /retiros?estado=pendiente` | — | `{ retiros: (Retiro & { usuario: UsuarioPublico, direccionSancionada:boolean\|null })[] }` |
| `POST /retiros/:id/decidir` | `{ decision:'enviado'\|'rechazado', txHash?, motivo? }` | `{ retiro }` |
| `GET /depositos?pagina=` | — | `{ depositos }` |
| `GET /usuarios?q=&pagina=` | — | `{ usuarios: UsuarioPanel[], total }` (`UsuarioPanel` = UsuarioPropio sin `puedeOperar` + `saldos`) |
| `GET /usuarios/:id` | — | `{ usuario: UsuarioPanel, saldos, movimientos, anuncios, ordenes: OrdenResumenPanel[], metodosPago }` |
| `POST /usuarios/:id/congelar` | `{ congelado:boolean, motivo }` | `{ usuario }` |
| `POST /usuarios/:id/ajuste` | `{ activo, cantidad (con signo), motivo }` (`admin`) | `{ saldos }` |
| `GET /precios` | — | `{ precios: Precios, monedas:[{codigo,nombre,pais}] }` |
| `PUT /precios` | `{ oroUsdOnza?, plataUsdOnza?, fx?:{ HNL:26.1, … } }` (solo `admin`) | `{ precios }` |
| `GET /configuracion` | — | `{ configuracion }` |
| `PUT /configuracion` | campos parciales de `Configuracion` (`admin`) | `{ configuracion }` |
| `GET /bitacora?pagina=&q=` | — | `{ entradas: EntradaBitacora[], total, integra:boolean }` |
| `GET /operadores` | — | `{ operadores:[…sin hash] }` |
| `POST /operadores` | `{ email, nombre, rol }` (`admin`) | 201 `{ operador, contrasenaTemporal }` |
| `POST /operadores/:id/estado` | `{ activo:boolean }` | `{ operador }` |
| `POST /operadores/:id/restablecer` | — | `{ contrasenaTemporal }` |

`OrdenResumenPanel` = `OrdenResumen` más `{ comprador:{id,apodo}, vendedor:{id,apodo} }` y sin `miRol`.

---

## Códigos de error que el frontend debe distinguir

| `codigo` | Cuándo |
| --- | --- |
| `sin-sesion` | 401 sin token, vencido o revocado (cerrar sesión, cambio de contraseña, bloqueo) |
| `correo-no-verificado` | 403 el correo de la cuenta no está confirmado (rutas de Genesis ID) |
| `no-verificado` | 403 la cuenta no tiene GID verificado |
| `congelado` | 403 la cuenta está bloqueada por un operador |
| `pais-no-permitido` | 403 |
| `sin-saldo` | 409 el vendedor no tiene disponible para congelar |
| `fuera-de-limites` | 400 monto fuera de min/max del anuncio o del disponible |
| `requisitos` | 403 no cumple los requisitos del anunciante |
| `anuncio-propio` | 409 no se puede tomar el propio anuncio |
| `estado-invalido` | 409 la acción no cabe en el estado actual de la orden |
| `ordenes-abiertas` | 409 supera el máximo de órdenes abiertas |
| `contrasena` | 403 contraseña incorrecta (liberar, retirar) |
| `genesis-no-configurado` | 503 |
| `cadena-no-configurada` | 503 |
| `demo-solamente` | 404 la ruta solo existe en modo demo |

---

## Sondeo (polling) para tiempo real

No hay WebSocket: el frontend sondea `GET /api/ordenes/:id/mensajes?desde=<último id>` cada 3–5 s
mientras la orden está abierta, y `GET /api/ordenes?estado=abiertas` cada 15 s en la lista. Un `estado`
distinto al conocido obliga a repintar la orden. `estado=abiertas` agrupa `pendiente-pago|pagado|apelacion`.
