// El mapa del ecosistema Orden Global.
//
// POR QUE ESTE ARCHIVO EXISTE APARTE
//
// Es lo único de todo el cerebro que hay que editar a mano cuando el
// ecosistema cambia: una app nueva, un nodo más, una decisión que se toma. El
// resto —la física, el dibujo, la interacción— no se toca nunca. Separarlo
// significa que añadir una pieza es escribir cinco líneas aquí, no bucear en
// mil de motor gráfico.
//
// QUE ES ESTATICO Y QUE ES VIVO
//
// Aquí va la ESTRUCTURA: qué existe y cómo se conecta. Eso cambia cada pocas
// semanas y sale de lo que se ha verificado trabajando, no de una suposición.
// El ESTADO —altura de la cadena, validadores, si un dominio responde, cuánta
// gente hay— lo trae el cerebro en vivo al abrirse y lo pega encima. Un nodo
// que dice «6 nodos» cuando hay 5 es peor que uno que no dice nada, así que
// ninguna cifra que pueda mirarse en vivo está escrita aquí.

export const GRUPOS = {
  respaldo:   { nombre: 'El respaldo',      color: '#D4AF37' },
  cadena:     { nombre: 'La cadena',        color: '#C9A961' },
  nodo:       { nombre: 'Nodos',            color: '#EAD79C' },
  token:      { nombre: 'Tokens',           color: '#F0C674' },
  app:        { nombre: 'Apps y webs',      color: '#4FD8E0' },
  backend:    { nombre: 'Servidores',       color: '#3AAFC6' },
  identidad:  { nombre: 'Identidad',        color: '#7BE0C0' },
  infra:      { nombre: 'Infraestructura',  color: '#9B8FD8' },
  dominio:    { nombre: 'Dominios',         color: '#6FA8DC' },
  seguridad:  { nombre: 'Seguridad',        color: '#3ED9A0' },
  abierto:    { nombre: 'Sin resolver',     color: '#F0776B' },
  decision:   { nombre: 'Tu decisión',      color: '#F5B62E' },
  agente:     { nombre: 'Equipo IA',        color: '#D88FD0' },
  repo:       { nombre: 'Código',           color: '#8FA0B8' },
};

/**
 * Cada nodo: `id`, `n` (nombre), `g` (grupo), `d` (qué es, en una línea),
 * `peso` (tamaño relativo, 1 por defecto) y `vivo` (clave del dato en vivo
 * que le corresponde, si lo hay).
 */
export const NODOS = [
  // ── El respaldo ──────────────────────────────────────────────────────────
  //
  // Va PRIMERO a propósito. Es de donde sale el valor de todo lo demás: sin
  // metal en bóveda, ORIGEN es un número. El mapa empezaba en la cadena y eso
  // contaba la historia al revés — como si el ecosistema naciera del software.
  { id: 'minas', n: 'Las minas', g: 'respaldo', peso: 3,
    d: 'Concesiones mineras propias. El oro se extrae aquí, no se compra en mercado: es lo que hace que el respaldo sea nuestro y no un depósito en la cuenta de otro.' },
  { id: 'boveda', n: 'Bóveda', g: 'respaldo', peso: 2.4,
    d: 'Custodia del metal certificado bajo el estándar internacional NI 43-101 y anclado 1:1. Antes de existir como saldo, existe como barra.' },

  // ── La cadena ────────────────────────────────────────────────────────────
  { id: 'cadena', n: 'Cadena 5550', g: 'cadena', peso: 4, vivo: 'cadena',
    d: 'La Layer 1 propia del ecosistema, respaldada en oro físico certificado (NI 43-101). 1 ORIGEN = 1 gramín = 1/55 g de oro en bóveda. Corre sobre Hyperledger Besu con consenso QBFT, un bloque cada 10 s y baseFee 0.' },
  { id: 'rpc', n: 'RPC público', g: 'cadena', peso: 2, vivo: 'rpc',
    d: 'rpc.ordenglobal-rpc.com — la puerta por la que todo el ecosistema lee y escribe en la cadena.' },
  // Es una pieza de la cadena, no un problema: el problema abierto está aparte
  // en 'a-validador'. Tenerlo en rojo hacía que un solo asunto pintara DOS
  // puntos rojos e inflara la cuenta de «sin resolver».
  { id: 'validador', n: 'Conjunto validador', g: 'cadena', peso: 3, vivo: 'validadores',
    d: 'Quién firma los bloques de verdad. Se lee del extraData de cada bloque, no de una lista escrita a mano. Hoy son 7 direcciones turnándose.' },

  // Los siete nodos de la red. El conteo sale de net_peerCount (6 pares + el
  // propio) y los siete validadores, de qbft_getValidatorsByBlockNumber.
  //
  // Las IP son las de las máquinas de la 8532 y NO se han vuelto a comprobar
  // desde la migración a Besu: hace falta una credencial de AWS para eso. Se
  // dejan anotadas como lo que son —el último dato verificado— en vez de
  // borrarlas o de darlas por buenas.
  { id: 'node1', n: 'node1', g: 'nodo', d: 'EC2 · us-east-1 · IP elástica 23.23.205.33 (sin verificar desde la migración)' },
  { id: 'node2', n: 'node2', g: 'nodo', d: 'EC2 · us-east-2 · IP elástica 18.190.14.28 (sin verificar desde la migración)' },
  { id: 'node3', n: 'node3', g: 'nodo', d: 'EC2 · us-east-1 · IP elástica 54.205.125.99 (sin verificar desde la migración)' },
  { id: 'node4', n: 'node4', g: 'nodo', d: 'EC2 · us-east-2 · IP elástica 18.226.95.184 (sin verificar desde la migración)' },
  { id: 'node5', n: 'node5', g: 'nodo', d: 'EC2 · us-east-1 · IP elástica 18.211.40.149 (sin verificar desde la migración)' },
  { id: 'node6', n: 'node6', g: 'nodo', d: 'EC2 · us-east-1 · IP elástica 3.224.143.231 (sin verificar desde la migración)' },
  { id: 'node7', n: 'node7', g: 'nodo', d: 'El séptimo nodo, sumado en la migración. La cadena lo cuenta y firma bloques; su IP no está verificada desde aquí.' },
  { id: 'watchdog', n: 'Vigilante', g: 'infra', peso: 2,
    d: 'ogb-watchdog.timer, cada 3 minutos en los nodos. Nació para el syncer de Polygon Edge, que se bloqueaba en un canal sin buffer y se quedaba estancado sin avisar. Con Besu esa falla concreta ya no existe; el vigilante se mantiene como red de seguridad.' },

  // ── Tokens ───────────────────────────────────────────────────────────────
  //
  // Cuatro llevan el peso —ORIGEN, AUKA, AGKA y ONDK— y once son de sector. La
  // lista salía plana y hacía parecer que las quince pesan lo mismo; el `peso`
  // de las cuatro primeras es lo que marca la diferencia en el mapa.
  { id: 'ORIGEN', n: 'ORIGEN', g: 'token', peso: 3,
    d: 'La cripto NATIVA de la cadena. No es un contrato: es la moneda de la red. 1 ORIGEN = 1 gramín = 1/55 g de oro certificado en bóveda.' },
  { id: 'AUKA', n: 'AUKA', g: 'token', peso: 2, d: 'Moneda respaldada en oro — sigue una onza. 55.000.000 emitidos.' },
  { id: 'AGKA', n: 'AGKA', g: 'token', peso: 2, d: 'Moneda respaldada en plata — sigue una onza. 500.000.000 emitidos.' },
  { id: 'ONDK', n: 'ONDK', g: 'token', peso: 2, d: 'Orden Kapital: gobernanza y utilidad del ecosistema. 555.000.000 emitidos.' },
  { id: 'MNKA', n: 'MNKA', g: 'token', d: 'Comunidad e innovación.' },
  { id: 'IBS', n: 'IBS', g: 'token', d: 'Token de sector.' },
  { id: 'HARV', n: 'HARV', g: 'token', d: 'Harvi — token de sector agrícola.' },
  { id: 'AUBEX', n: 'AUBEX', g: 'token', d: 'Token de sector.' },
  { id: 'ASL', n: 'ASL', g: 'token', d: 'Token de sector.' },
  { id: 'LOVE', n: 'LOVE', g: 'token', d: 'Token de sector.' },
  { id: 'REST', n: 'REST', g: 'token', d: 'Token de sector.' },
  { id: 'SOL', n: 'SOL', g: 'token', d: 'Token de sector.' },
  { id: 'AIT', n: 'AIT', g: 'token', d: 'Sector de inteligencia artificial.' },
  { id: 'AGRO', n: 'AGRO', g: 'token', d: 'Sector agropecuario.' },
  { id: 'POLITICAL', n: 'POLITICAL', g: 'token', d: 'Token de sector.' },

  // ── Apps ─────────────────────────────────────────────────────────────────
  { id: 'vw-app', n: 'Veta Wallet · app', g: 'app', peso: 3,
    d: 'La billetera en Android. 15 tokens, tarjeta con emisión y congelado, remesas (calculadora, no ejecuta), lector QR, y la verificación de identidad con cámara que lee sola.' },
  { id: 'vw-web', n: 'Veta Wallet · web', g: 'app', peso: 2.4, vivo: 'dom-app',
    d: 'app.vetawallet.com — las mismas cinco pestañas que la app. HTML y JS a mano, sin framework, a propósito.' },
  { id: 'vw-back', n: 'Backend Veta Wallet', g: 'backend', peso: 2.6,
    d: 'Node sobre Heroku con MongoDB. Firma y emite las transacciones. Aquí viven la idempotencia de los envíos y el cifrado de las semillas.' },
  { id: 'mtp-app', n: 'MyTokenPay · app', g: 'app', peso: 2,
    d: 'Cobros en 30 comercios reales, en Android.' },
  { id: 'mtp-web', n: 'MyTokenPay · web', g: 'app', peso: 1.6,
    d: 'Generada desde la app, no del sitio viejo. Hoy corre con datos de prueba porque su backend está caído.' },
  { id: 'mtp-back', n: 'Backend MyTokenPay', g: 'abierto', peso: 2,
    d: 'Caído — responde 503. Bloqueado para desplegar por un repositorio de GitLab de terceros.' },
  // OrdenEx y AuCorp son piezas del ecosistema y faltaban enteras en el mapa.
  // Van con lo único que consta, y dicho como lo que es: no hay código suyo en
  // este repositorio, ni dominio que responda, ni nada verificado desde aquí.
  // Inventarles una descripción sería peor que dejarlas fuera — un mapa que se
  // adorna deja de servir para decidir.
  { id: 'ordenex', n: 'OrdenEx', g: 'app', peso: 2.4,
    d: 'Pieza del ecosistema. PENDIENTE DE DOCUMENTAR: no hay código suyo en este repositorio ni dominio comprobado. Falta qué hace, dónde corre y cómo habla con la cadena y con Genesis ID.' },
  { id: 'aucorp', n: 'AuCorp', g: 'app', peso: 2.4,
    d: 'Pieza del ecosistema. Lo único que consta en el repo es una línea del README de MyTokenPay: «Red de comercios afiliados del Sistema Financiero Social (Orden Global · AuCorp · DBNX)». PENDIENTE DE DOCUMENTAR.' },
  { id: 'ordenscan', n: 'ordenscan', g: 'app', peso: 2,
    d: 'El explorador de la cadena. No es una app del ecosistema sino su cara auditable: la ficha de cada persona trae cuentas, identidad y movimiento de los 15 tokens.' },
  { id: 'og-web', n: 'ordenglobal.org', g: 'app', peso: 1.6,
    d: 'El sitio corporativo. Sin conexión de datos con el resto: es la cara pública.' },

  // ── Identidad ────────────────────────────────────────────────────────────
  { id: 'genesis', n: 'Genesis ID', g: 'identidad', peso: 3.4, vivo: 'genesis',
    d: 'El motor de identidad: KYC de personas, KYB de empresas, tamizado contra listas de sanciones, monitoreo AML y sesión única entre las apps. Ninguna identidad se verifica sola — cada aprobación la firma un operador.' },
  { id: 'gid-app', n: 'Genesis ID · app', g: 'identidad', peso: 2,
    d: 'El panel de cumplimiento en Android. Cola de identidades, decisión con motivo firmado, casos AML y analítica con filtros.' },
  { id: 'gid-panel', n: 'Panel web', g: 'identidad', peso: 2,
    d: '/admin para cumplimiento, /analitica para métricas, /cerebro para esto que estás mirando.' },
  { id: 'gid-portal', n: 'genesisid.online', g: 'identidad',
    d: 'El portal externo de identidad. El puente con él no funcionaba y se reconstruyó.' },
  { id: 'telemetria', n: 'Telemetría', g: 'identidad', peso: 2, vivo: 'telemetria',
    d: 'Lo que cada app reporta: quién entró, qué movió, qué se rompió. Nunca guarda quién es nadie — solo una huella irreversible que el panel puede volver a cruzar con el padrón.' },
  { id: 'padron', n: 'Padrón', g: 'identidad', peso: 2, vivo: 'padron',
    d: 'El listado de gente de cada app, con su billetera. Es lo que permite ponerle nombre a un error y ver dónde está cada dirección.' },

  // ── Infraestructura ──────────────────────────────────────────────────────
  { id: 'aws', n: 'AWS', g: 'infra', peso: 2.4, d: 'EC2 para los nodos, Amplify para las webs, Rekognition para el cotejo de rostro, Route 53, S3, CloudTrail y GuardDuty encendidos.' },
  { id: 'render', n: 'Render', g: 'infra', peso: 2, d: 'Donde vive Genesis ID, con MongoDB persistente.' },
  { id: 'heroku', n: 'Heroku', g: 'infra', peso: 2, d: 'El backend de Veta Wallet y el de ordenscan.' },
  { id: 'amplify', n: 'Amplify', g: 'infra', d: 'Las webs estáticas. Reemplaza el manifiesto entero en cada despliegue: siempre se sube la carpeta completa.' },
  { id: 'mongo', n: 'MongoDB', g: 'infra', peso: 2, d: 'La base de Genesis ID y la del backend de Veta Wallet.' },
  { id: 'eas', n: 'EAS · Expo', g: 'infra', d: 'Compila los APK y publica las actualizaciones por aire, sin reinstalar.' },

  // ── Dominios ─────────────────────────────────────────────────────────────
  { id: 'd-app', n: 'app.vetawallet.com', g: 'dominio', vivo: 'dom-app', d: 'Amplify d264zjawew1yea · control total.' },
  { id: 'd-legal', n: 'legal.vetawallet.com', g: 'dominio', vivo: 'dom-legal', d: 'Política de privacidad y términos, sin pedir sesión — lo exigen las tiendas.' },
  { id: 'd-www', n: 'www.vetawallet.com', g: 'dominio', vivo: 'dom-www', d: 'CloudFront de otra cuenta, con origen propio. Control parcial.' },
  { id: 'd-rpc', n: 'rpc.ordenglobal-rpc.com', g: 'dominio', vivo: 'rpc', d: 'El RPC de la cadena.' },
  { id: 'd-genesis', n: 'genesis-id.onrender.com', g: 'dominio', vivo: 'genesis-salud', d: 'Genesis ID.' },
  { id: 'd-og', n: 'ordenglobal.org', g: 'dominio', d: 'DNS en NameSilo, servidor cPanel viejo con WordPress intacto debajo.' },

  // ── Seguridad cerrada ────────────────────────────────────────────────────
  { id: 's-passadm', n: 'PASS_ADM rotado', g: 'seguridad', peso: 1.8,
    d: 'Una clave de 7 caracteres cifraba todas las semillas y llaves privadas. Rotada el 5 de agosto en tres etapas sin downtime: 804 de 806 campos recifrados y verificados uno por uno, y —lo que de verdad cerró el riesgo— los respaldos con la clave vieja, borrados.' },
  { id: 's-idem', n: 'Doble pago cerrado', g: 'seguridad', peso: 1.8,
    d: 'El sello de idempotencia se reserva ANTES de firmar, con un índice único en Mongo: dos peticiones simultáneas, pasa exactamente una. Un reintento recibe el mismo hash, no una segunda transferencia.' },
  { id: 's-genesis', n: 'Genesis ID cerrado', g: 'seguridad', peso: 1.8,
    d: 'La versión anterior emitía identidades verificadas sin autenticación y dejaba volcar los datos de todos. Hoy la aprobación tiene una sola puerta y la firma un operador.' },
  { id: 's-seed', n: 'Semilla protegida', g: 'seguridad',
    d: 'Ver la semilla o la llave privada pide la contraseña.' },
  { id: 's-legal', n: 'Legales abiertos', g: 'seguridad',
    d: '/privacidad y /terminos dejaron de pedir sesión — bloqueaban la revisión de las tiendas.' },
  { id: 's-puente', n: 'Puente reconstruido', g: 'seguridad',
    d: 'El puente con genesisid.online nunca había funcionado.' },
  { id: 's-aws', n: 'AWS asegurado', g: 'seguridad',
    d: 'CloudTrail y GuardDuty encendidos, el bucket S3 expuesto cerrado, perfiles de instancia auditados.' },

  // ── Lo que sigue abierto ─────────────────────────────────────────────────
  { id: 'a-validador', n: 'Validadores repartidos', g: 'seguridad', peso: 2.6,
    d: 'Cerrado con la migración. El conjunto validador tiene 7 direcciones que se turnan para firmar, en vez de una sola. QBFT aguanta 2 caídos sin detener la cadena. El texto exacto lo trae el cerebro leyendo el extraData del último bloque, no de aquí.' },
  { id: 'a-cred', n: 'Credenciales sin rotar', g: 'abierto', peso: 2.4,
    d: 'cPanel, una clave de AWS (las AKIA no expiran solas), un token de Expo, un hook de Render y una API key de Heroku pasaron por el chat. Los valores no se escriben en ningún sitio; lo que hay que hacer es rotarlos.' },
  { id: 'a-corruptos', n: '2 registros corruptos', g: 'abierto',
    d: 'Dos campos cifrados de una cuenta ya estaban rotos antes de la migración. Verificado contra la cadena: nonce 0 y saldo 0 en los cuatro tokens principales, así que no hay fondos en riesgo. La causa sigue sin saberse.' },
  { id: 'a-reporte', n: 'Apps sin reportar', g: 'abierto', peso: 2,
    d: 'Ya reportan los DOS clientes de Veta Wallet: la app Android (le faltaba identificar a la persona, por eso llegaban eventos sin dueño) y la web. El alta en el padrón se prueba con la propia sesión del usuario, sin claves secretas en el cliente. Queda: DESPLEGAR la web para que empiece a llegar, y montar el padrón completo en el backend —que sigue fuera de alcance por el token de Heroku— para ver también a quien no abre la app.' },

  // ── Decisiones que solo puede tomar Orden Global ─────────────────────────
  // La decisión de staking desapareció con la migración: el contrato de
  // garantía propietario de Polygon Edge ya no existe y QBFT gestiona el
  // conjunto validador sin depósito. Lo que queda de aquella conversación es la
  // política de comisiones, que sigue sin decidirse.
  { id: 'dec-comisiones', n: 'Política de comisiones', g: 'decision', peso: 2,
    d: 'Hoy la cadena tiene baseFee 0: usarla no cuesta nada. Es viable mientras los 7 validadores sean propios. Admitir validadores de terceros exige decidir antes cómo se les remunera — sin comisión ni recompensa, nadie externo tiene motivo para sostener un nodo.' },
  { id: 'dec-remesas', n: 'Decidir Remesas', g: 'decision',
    d: 'Licencia por país, o dejarlo como calculadora sin ejecución, que es lo que es hoy.' },
  { id: 'dec-tiendas', n: 'Cuentas de tiendas', g: 'decision', peso: 2,
    d: 'Play Console (Individual evita el D-U-N-S) y Apple Developer (Organización + D-U-N-S), en paralelo.' },
  { id: 'dec-gitlab', n: 'GitLab MyTokenPay', g: 'decision',
    d: 'Empujar el código al repositorio de terceros, o desconectarlo de Amplify.' },
  { id: 'dec-dns', n: 'DNS a Route 53', g: 'decision',
    d: 'Mover ordenglobal.org. Bloqueado sin acceso a NameSilo.' },

  // ── El equipo de IA ──────────────────────────────────────────────────────
  { id: 'ag-arq', n: 'Arquitecto', g: 'agente', d: 'Diseño entre apps. Sabe que la web lee la cadena directo y que las webs van sin framework a propósito.' },
  { id: 'ag-prod', n: 'Producto', g: 'agente', d: 'Prioriza entre apps. Lleva las decisiones que tienen dueño.' },
  { id: 'ag-ing', n: 'Ingeniero', g: 'agente', d: 'Implementa. Prueba contra un navegador real antes de dar nada por terminado.' },
  { id: 'ag-seg', n: 'Seguridad', g: 'agente', peso: 1.6, d: 'Lleva el registro de lo cerrado y lo abierto. Encontró que PASS_ADM ya estaba resuelto al ir a investigarlo, y dejó la nota para no repetir el error.' },
  { id: 'ag-doc', n: 'Redacción', g: 'agente', d: 'Mantiene la documentación al día. Regla del equipo: nunca escribir el valor de un secreto, ni para anotar que hay que rotarlo.' },

  // ── Código ───────────────────────────────────────────────────────────────
  { id: 'repo', n: 'express-js-on-vercel', g: 'repo', peso: 2,
    d: 'El repositorio donde vive todo: Genesis ID, las apps, las webs y los módulos de infraestructura listos para pegar en los backends.' },
  { id: 'infra-mod', n: 'Módulos infra/', g: 'repo',
    d: 'Piezas probadas para pegar en los backends: el puente a Genesis ID, la idempotencia, la migración de claves y la telemetría.' },
];

/** Los nodos de la red, en un solo sitio: se repiten en cuatro relaciones. */
const NODOS_RED = ['node1', 'node2', 'node3', 'node4', 'node5', 'node6', 'node7'];

/** `[origen, destino, etiqueta, fuerte?]`. La etiqueta dice QUÉ pasa entre los dos. */
export const ENLACES = [
  // La cadena y sus nodos
  ['cadena', 'rpc', 'se consulta por'],
  // Todos los demás dominios cuelgan de lo que sirven; a este se le había
  // olvidado, y quedaba flotando solo en un rincón del cerebro sin decir de
  // qué era el dominio.
  ['d-rpc', 'rpc', 'sirve'],
  ['cadena', 'validador', 'la firman', true],
  ...NODOS_RED.map((n) => [n, 'cadena', 'sincronizan']),
  ...NODOS_RED.map((n) => ['validador', n, 'firma por turnos']),
  ...NODOS_RED.map((n) => ['watchdog', n, 'vigila y reinicia']),
  ...NODOS_RED.map((n) => [n, 'aws', 'corren en EC2']),
  ['a-validador', 'validador', 'esto es lo que se cerró', true],

  // De dónde sale el valor: metal antes que software.
  ['minas', 'boveda', 'el oro extraído se custodia en', true],
  ['boveda', 'ORIGEN', 'lo respalda 1:1', true],
  ['boveda', 'AUKA', 'lo respalda en oro', true],
  ['boveda', 'AGKA', 'lo respalda en plata', true],

  // Los tokens viven en la cadena
  ...['ORIGEN','AUKA','AGKA','ONDK','MNKA','IBS','HARV','AUBEX','ASL','LOVE','REST','SOL','AIT','AGRO','POLITICAL']
    .map((t) => [t, 'cadena', 'vive en']),

  // Las dos piezas que faltaban. Solo se dibuja lo que se sabe: que pertenecen
  // al ecosistema. En cuanto se documenten, aquí van sus relaciones reales.
  ['ordenex', 'cadena', 'pieza del ecosistema · relación por documentar'],
  ['aucorp', 'cadena', 'pieza del ecosistema · relación por documentar'],

  // Veta Wallet
  ['vw-app', 'vw-back', 'login · enviar · tarjeta'],
  ['vw-back', 'cadena', 'firma y emite', true],
  ['vw-web', 'rpc', 'lee saldos directo, sin backend', true],
  ['vw-app', 'genesis', 'verifica identidad'],
  ['vw-back', 'mongo', 'guarda cuentas'],
  ['vw-back', 'heroku', 'desplegado en'],
  ['vw-web', 'amplify', 'desplegada en'],
  ['vw-app', 'eas', 'se compila con'],
  ['d-app', 'vw-web', 'sirve'],
  ['d-legal', 'vw-web', 'legales de'],
  ['d-www', 'vw-web', 'apunta a'],

  // MyTokenPay
  ['mtp-app', 'mtp-back', 'cobros'],
  ['mtp-app', 'genesis', 'pase de sesión única'],
  ['mtp-app', 'vw-app', 'vetawallet://pagar, vuelve con el hash', true],
  ['mtp-web', 'mtp-back', 'datos de prueba mientras esté caído'],
  ['dec-gitlab', 'mtp-back', 'bloquea el despliegue', true],

  // Genesis ID
  ['genesis', 'mongo', 'guarda expedientes'],
  ['genesis', 'render', 'desplegado en'],
  ['genesis', 'aws', 'Rekognition para el rostro'],
  ['gid-app', 'genesis', 'panel en el bolsillo'],
  ['gid-panel', 'genesis', 'panel web'],
  ['genesis', 'gid-portal', 'puente de identidad'],
  ['ordenscan', 'genesis', 'resuelve identidades'],
  ['ordenscan', 'rpc', 'lee bloques'],
  ['ordenscan', 'heroku', 'desplegado en'],
  ['telemetria', 'genesis', 'llega a'],
  ['padron', 'genesis', 'llega a'],
  ['padron', 'telemetria', 'le pone nombre a la huella', true],
  ['vw-back', 'telemetria', 'debería reportar'],
  ['vw-back', 'padron', 'debería sincronizar'],
  ['a-reporte', 'telemetria', 'falta montarlo', true],
  ['a-reporte', 'padron', 'falta montarlo', true],
  ['d-genesis', 'genesis', 'sirve'],

  // Seguridad
  ['s-passadm', 'vw-back', 'era de'],
  ['s-idem', 'vw-back', 'era de'],
  ['s-genesis', 'genesis', 'era de'],
  ['s-seed', 'vw-app', 'era de'],
  ['s-legal', 'vw-web', 'era de'],
  ['s-puente', 'gid-portal', 'era de'],
  ['s-aws', 'aws', 'era de'],
  ['a-corruptos', 's-passadm', 'apareció durante'],
  ['a-cred', 'aws', 'afecta a'],
  ['a-cred', 'heroku', 'afecta a'],
  ['a-cred', 'render', 'afecta a'],

  // Decisiones
  ['dec-remesas', 'vw-app', 'afecta a'],
  ['dec-tiendas', 'vw-app', 'bloquea publicar'],
  ['dec-tiendas', 'mtp-app', 'bloquea publicar'],
  ['dec-dns', 'd-og', 'afecta a'],
  ['og-web', 'amplify', 'desplegada en'],
  ['d-og', 'og-web', 'sirve'],

  // Equipo y código
  ...['ag-arq','ag-prod','ag-ing','ag-seg','ag-doc'].map((a) => [a, 'repo', 'trabaja en']),
  ['ag-seg', 's-passadm', 'lo verificó'],
  ['repo', 'infra-mod', 'contiene'],
  ['infra-mod', 'vw-back', 'listo para pegar en'],
  ['repo', 'eas', 'compila con'],
  ['repo', 'amplify', 'despliega en'],
];
