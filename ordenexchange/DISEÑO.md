# OrdenExchange · Guía para construir el frontend

## Qué es

La casa de cambio P2P del ecosistema Orden Global. Funciona **como Binance P2P**: la gente publica anuncios
para comprar o vender ORIGEN (oro digital: 1 ORIGEN = 1/55 g de oro certificado en bóveda), AUKA (1 onza de
oro) y AGKA (1 onza de plata) a cambio de la moneda de su país, pagando por transferencia bancaria o
billeteras locales (PIX, Nequi, Yape, SINPE Móvil, Tigo Money, Pago Móvil…). La plataforma **custodia el
activo** (escrow) hasta que el vendedor confirma que recibió el pago. Hay chat por orden, temporizador,
apelaciones con un operador, calificaciones y **agentes de cambio** (comerciantes verificados con insignia).
Para operar hay que tener **Genesis ID** verificado (la identidad del ecosistema).

Audiencia: personas de toda Latinoamérica, muchas desde el teléfono, que ya conocen Binance P2P o que
nunca lo usaron. El objetivo es que cualquiera entienda cómo comprar y vender **sin leer un manual**.

## Reglas técnicas (no negociables)

- **Sin compilación ni frameworks**: HTML + CSS + JavaScript moderno (ES2020), como las demás apps web del
  repo (`apps-web/veta-wallet`). Nada de React, Vite, npm ni bundlers. Sin dependencias de CDN salvo Google
  Fonts. Iconos: SVG inline.
- Archivos del frontend de usuario: `public/index.html`, `public/app.css`, `public/app.js`, `public/i18n.js`.
  El servidor Express los sirve tal cual desde `/` (`/app.js`, `/app.css`, `/i18n.js`).
- Panel de operadores: `public/admin.html` + `public/admin.js` (CSS dentro del HTML o en `public/admin.css`).
  Se sirve en `/admin`.
- API en el **mismo origen**: `fetch('/api/…')`. Contrato completo en `API.md`. Tipos en `src/types.ts`.
- Token de sesión en `localStorage` bajo la clave `ordenexchange.sesion` (`{ token, usuario }`). Un 401
  cierra la sesión y vuelve a la pantalla de entrada. Panel: `ordenexchange.panel`.
- Toda llamada `fetch` pasa por un único ayudante que pone cabeceras, mide tiempo de espera (25 s), parsea
  JSON y devuelve `{ ok, estado, datos }`; nunca lanza. Los errores se enseñan con el `error` que devuelve el
  servidor y, cuando hay `codigo`, con un texto propio traducido (ver tabla de códigos en API.md).
- **Bilingüe ES/EN** desde el primer día. Todos los textos en `i18n.js` (`I18N.es` / `I18N.en`) y una función
  `t('clave', {vars})`. Idioma: del navegador la primera vez, cambiable en cualquier pantalla, recordado en
  `localStorage`. Español neutro para toda Latinoamérica (sin voseo ni regionalismos): botones y
  etiquetas en infinitivo o imperativo neutro («Ingresar», «Crear anuncio», «Marcar como pagado»), y «tú»
  solo cuando no hay forma de evitar la persona.
- Formato de números con `Intl.NumberFormat` según la moneda (`HNL`, `MXN`…); activos con 2–8 decimales
  (nunca ceros infinitos). Fechas relativas («hace 3 min») y absolutas cortas.
- Escapar SIEMPRE lo que venga del servidor antes de meterlo en `innerHTML` (ayudante `esc`). Los mensajes de
  chat, apodos y términos son texto de otros usuarios.
- Móvil primero: funciona a 360 px de ancho sin scroll horizontal; en escritorio aprovecha el ancho con
  tablas como las de Binance. Foco visible, `prefers-reduced-motion` respetado, contraste AA.
- Sondeo (polling) como dice API.md: mensajes de la orden cada 4 s mientras está abierta; lista de órdenes
  abiertas cada 15 s; se detiene al salir de la vista. Temporizador de la orden en vivo (mm:ss).
- Sin `alert()`/`confirm()`: avisos (toasts) y diálogos propios.
- Estado en memoria en un objeto único; render por vista (`render()`), sin frameworks. Ruteo por `hash`
  (`#/mercado`, `#/orden/<id>`, `#/anuncios`, `#/anuncios/nuevo`, `#/ordenes`, `#/billetera`, `#/pagos`,
  `#/perfil`, `#/agente`, `#/usuario/<id>`, `#/entrar`, `#/registro`).

## Identidad visual

Negro y dorado, como todo Orden Global, y **bilingüe**. La casa madre usa (`sitio-ordenglobal/index.html`):
`--void:#05060a; --ink:#0b0f18; --gold:#d9b45f; --gold-lp:#f5e4ab; --gold-dp:#a07d3a; --crema:#f4efe4;
--ash:#9aa2b4; --signal:#74e6c8` (el verde-agua «señal digital»). Veta Wallet usa verde pozo + oro con una
didona. OrdenExchange tiene que **reconocerse como de la misma familia sin ser una copia**: negro profundo,
oro como acento (nunca como fondo grande), un verde para «comprar/positivo» y un rojo-coral para
«vender/negativo» como en cualquier mercado, y una tipografía propia. Cargá la skill `frontend-design`
(está en `.claude/skills/frontend-design/SKILL.md` del repo) y elegí una dirección deliberada; el elemento
firma tiene que nacer de lo que es: **una casa de cambio de oro digital para Latinoamérica**.

Logo: la palabra «OrdenExchange» compuesta en texto (marca tipográfica), con «Orden» y «Exchange» en dos
pesos. Sin imágenes externas.

## Pantallas del frontend de usuario (todas)

1. **Entrada / Registro** (`#/entrar`, `#/registro`): correo, contraseña, apodo, país (selector con banderas
   del catálogo), idioma. Botón «Entrar con Genesis ID» (pide el token SSO pegado o por `?sso=<token>` en
   la URL → `POST /api/auth/sso`). Si `catalogo.demo` es `true`: sección «Probar con una cuenta demo» con
   los usuarios de `GET /api/auth/demo/usuarios` (un clic → `POST /api/auth/demo/entrar`).
2. **Mercado P2P** (`#/mercado`, la portada, visible sin sesión): pestañas **Comprar / Vender**; selector de
   activo (ORIGEN · AUKA · AGKA); selector de moneda/país (banderas); campo «Monto» en moneda local; filtro de
   método de pago; interruptor «Solo agentes verificados»; barra con el **precio de referencia** del activo en
   esa moneda (de `/api/mercado/precios`) y el oro en USD/onza. Lista de anuncios como en Binance: avatar con
   inicial, apodo, insignia de agente, «N órdenes · 98,5 % completadas», precio grande en moneda local,
   «Disponible X ORIGEN», «Límites min – max», chips de métodos de pago, ventana de pago, y el botón
   «Comprar ORIGEN» (verde) o «Vender ORIGEN» (rojo). Al tocar el botón se abre el **panel de orden** con:
   entrada «Voy a pagar» ↔ «Voy a recibir» (conversión automática a ambos lados, respetando límites),
   selector del método de pago (del anunciante en compra; propio en venta), términos del anunciante,
   requisitos que no se cumplen (si aplica) y «Abrir orden». Sin sesión, el botón lleva a entrar.
   Los anuncios propios no aparecen en el mercado (el servidor ya los quita).
3. **Orden** (`#/orden/<id>`): cabecera con estado y **temporizador** grande; número de orden (copiable);
   resumen (monto fiat, precio, cantidad de activo, contraparte con reputación); pasos numerados a la
   Binance: 1) Transferir el pago 2) Marcar como pagado 3) Esperar liberación. Tarjeta con los datos del
   método de pago del vendedor (banco, titular, número… copiables), aviso «Pagá solo por este medio y no
   escribas “ORIGEN” ni “cripto” en la referencia». Acciones según `acciones`: «Transferido, marcar como
   pagado», «Cancelar orden», «Liberar ORIGEN» (pide contraseña), «Apelar» (motivo + detalle), «Retirar
   apelación», «Calificar». **Chat** al lado (escritorio) o abajo (móvil): burbujas, mensajes de sistema
   centrados, adjuntar imagen (comprobante) con vista previa y compresión a ≤ 1,5 MB, sondeo cada 4 s.
   Estados finales con pantalla clara (completada ✓ con cantidad recibida; cancelada con motivo; apelación con
   explicación de qué pasa ahora).
4. **Mis órdenes** (`#/ordenes`): pestañas Abiertas / Completadas / Canceladas / Apelaciones; filas con
   activo, monto, contraparte, estado, tiempo restante y no leídos.
5. **Mis anuncios** (`#/anuncios`, `#/anuncios/nuevo`, `#/anuncios/<id>`): lista con estado (activo/pausado/
   agotado/cerrado), disponible, precio efectivo, órdenes; interruptores de activar/pausar; formulario en
   pasos como Binance: (1) lado, activo, moneda; precio fijo o flotante con vista previa del precio efectivo y
   la diferencia contra la referencia; (2) cantidad total, límites min/max, métodos de pago (venta: elegir
   entre las cuentas propias; compra: elegir tipos del país), ventana de pago; (3) términos, respuesta
   automática, requisitos para la contraparte. Validaciones en vivo.
6. **Billetera** (`#/billetera`): tarjetas por activo con disponible y en custodia; historial de movimientos;
   **Depositar** (muestra la dirección de tesorería y la cadena 5550, explica que hay que enviar desde la
   dirección registrada, y un formulario para pegar el hash de la transacción → `POST /depositos`);
   **Retirar** (activo, cantidad, dirección, contraseña; lista de retiros con estado); en demo, botón de
   «Recibir ORIGEN de prueba» (faucet).
7. **Métodos de pago** (`#/pagos`): tarjetas por método con banco/titular/campos enmascarados; agregar con
   formulario dinámico según el país y el tipo elegido (los `campos` del catálogo); editar; eliminar.
8. **Perfil** (`#/perfil`): apodo, país, idioma, teléfono, dirección de la cadena (0x…), cambiar contraseña;
   bloque **Genesis ID** con estado (sin verificar / en revisión / verificada / rechazada / suspendida),
   botón «Sincronizar» (`GET /api/genesis/estado`) y, si no está verificada, un asistente compacto:
   datos personales → MRZ del documento (texto) → foto (archivo) → «Vincular». En demo, botón «Verificar
   (demo)». Reputación propia como la ve el resto.
9. **Agente de cambio** (`#/agente`): qué es, requisitos, garantía, estado de la solicitud, solicitar /
   retirar / renunciar.
10. **Perfil público** (`#/usuario/<id>`): apodo, insignias, reputación, anuncios activos.
11. Navegación: barra superior (marca, Mercado, Órdenes, Anuncios, Billetera, idioma, cuenta) y en móvil
    barra inferior con Mercado · Órdenes · Anuncios · Billetera · Yo. Contador de órdenes abiertas.
12. Ayuda: sección «¿Cómo funciona?» en tres pasos para comprar y tres para vender, en la portada.

## Panel de operadores (`/admin`)

Herramienta de trabajo, denso y claro, misma familia visual pero más sobrio. Login de operador; menú lateral:
Resumen (tarjetas + custodia + precios), Apelaciones (cola con detalle de la orden, chat completo, comprobantes,
botones Liberar al comprador / Devolver al vendedor con nota), Órdenes (búsqueda, filtros, detalle, cancelar,
escribir en el chat), Agentes (solicitudes: aprobar/rechazar; suspender agentes), Retiros (pendientes: marcar
enviado con hash / rechazar con motivo; aviso si la dirección está sancionada), Usuarios (buscar, ficha con
saldos, movimientos, órdenes, congelar/descongelar con motivo, ajuste manual de saldo solo admin), Precios
(oro, plata, tabla FX por moneda editable), Configuración (comisión, garantía, límites), Bitácora (con estado
de integridad), Operadores (crear, activar/desactivar, restablecer contraseña). Todo el panel en español con
la misma `t()` (EN opcional).

## Cómo probar sin backend

El backend se está construyendo en paralelo; hasta que exista, construí contra `API.md` y verificá el HTML
abriéndolo en Chromium (Playwright está instalado: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, ejecutable
`/opt/pw-browsers/chromium`) para revisar el render de cada vista con datos de ejemplo embebidos en un
`window.__EJEMPLO__` que **se elimina** al terminar. No inventes rutas que no estén en API.md: si algo falta,
dejá un comentario `// FALTA EN API:` y usá lo más parecido.
