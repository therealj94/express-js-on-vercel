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
  /* Tres regiones que faltaban, y no por olvido: el mapa nació describiendo lo
     que CORRE —máquinas, apps, cadenas— y el ecosistema es más que eso. Lo
     legal, lo minero y lo que espera firma de la Junta pesan tanto como un
     servidor, y hasta ahora no estaban en ninguna parte del cerebro. */
  legal:      { nombre: 'Legal',            color: '#E8A0C0' },
  mina:       { nombre: 'Minería',          color: '#D4A574' },
  junta:      { nombre: 'Junta Directiva',  color: '#F2D06B' },
};

/**
 * Cada nodo: `id`, `n` (nombre), `g` (grupo), `d` (qué es, en una línea),
 * `peso` (tamaño relativo, 1 por defecto) y `vivo` (clave del dato en vivo
 * que le corresponde, si lo hay).
 */
export const NODOS = [
  // ── La cadena ────────────────────────────────────────────────────────────
  { id: 'cadena', n: 'Cadena 8532', g: 'cadena', peso: 4, vivo: 'cadena',
    d: 'Blockchain propia del ecosistema, respaldada en oro físico certificado (NI 43-101). 1 ORIGEN = 1 gramín = 1/55 g de oro en bóveda.' },
  { id: 'rpc', n: 'RPC público', g: 'cadena', peso: 2, vivo: 'rpc',
    d: 'rpc.ordenglobal-rpc.com — la puerta por la que todo el ecosistema lee y escribe en la cadena.' },
  // Es una pieza de la cadena, no un problema: el problema abierto está aparte
  // en 'a-validador'. Tenerlo en rojo hacía que un solo asunto pintara DOS
  // puntos rojos e inflara la cuenta de «sin resolver».
  { id: 'validador', n: 'Conjunto validador', g: 'cadena', peso: 3, vivo: 'validadores',
    d: 'Quién firma los bloques de verdad. Se lee del extraData de cada bloque, no de una lista escrita a mano.' },

  // Los seis nodos, con su IP elástica real.
  { id: 'node1', n: 'node1', g: 'nodo', d: 'EC2 · us-east-1 · IP elástica 23.23.205.33' },
  { id: 'node2', n: 'node2', g: 'nodo', d: 'EC2 · us-east-2 · IP elástica 18.190.14.28' },
  { id: 'node3', n: 'node3', g: 'nodo', d: 'EC2 · us-east-1 · IP elástica 54.205.125.99' },
  { id: 'node4', n: 'node4', g: 'nodo', d: 'EC2 · us-east-2 · IP elástica 18.226.95.184' },
  { id: 'node5', n: 'node5', g: 'nodo', d: 'EC2 · us-east-1 · IP elástica 18.211.40.149' },
  { id: 'node6', n: 'node6', g: 'nodo', d: 'EC2 · us-east-1 · IP elástica 3.224.143.231' },
  { id: 'watchdog', n: 'Vigilante', g: 'infra', peso: 2,
    d: 'ogb-watchdog.timer, cada 3 minutos en los 6 nodos. El bucle del syncer se bloqueaba en un canal sin buffer y se quedaba estancado sin avisar; esto lo detecta y reinicia el nodo solo.' },

  // ── Tokens ───────────────────────────────────────────────────────────────
  { id: 'ORIGEN', n: 'ORIGEN', g: 'token', peso: 2.5, d: 'Nativo de la cadena. 1 gramín = 1/55 g de oro.' },
  { id: 'AUKA', n: 'AUKA', g: 'token', peso: 1.6, d: 'Respaldado en oro — sigue una onza.' },
  { id: 'AGKA', n: 'AGKA', g: 'token', peso: 1.6, d: 'Respaldado en plata — sigue una onza.' },
  { id: 'ONDK', n: 'ONDK', g: 'token', peso: 1.6, d: 'Gobernanza y utilidad del ecosistema.' },
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
  { id: 'vw-app', n: 'Veta Wallet · app', g: 'app', peso: 3, w: 'https://app.vetawallet.com',
    d: 'La billetera en Android. 15 tokens, tarjeta con emisión y congelado, remesas (calculadora, no ejecuta), lector QR, y la verificación de identidad con cámara que lee sola.' },
  { id: 'vw-web', n: 'Veta Wallet · web', g: 'app', peso: 2.4, vivo: 'dom-app', w: 'https://www.vetawallet.com',
    d: 'app.vetawallet.com — las mismas cinco pestañas que la app. HTML y JS a mano, sin framework, a propósito.' },
  { id: 'vw-back', n: 'Backend Veta Wallet', g: 'backend', peso: 2.6,
    d: 'Node sobre Heroku con MongoDB. Firma y emite las transacciones. Aquí viven la idempotencia de los envíos y el cifrado de las semillas.' },
  { id: 'mtp-app', n: 'MyTokenPay · app', g: 'app', peso: 2,
    d: 'Cobros en 30 comercios reales, en Android.' },
  { id: 'mtp-web', n: 'MyTokenPay · web', g: 'app', peso: 1.6,
    d: 'Generada desde la app, no del sitio viejo. Hoy corre con datos de prueba porque su backend está caído.' },
  { id: 'mtp-back', n: 'Backend MyTokenPay', g: 'abierto', peso: 2,
    d: 'Caído — responde 503. Bloqueado para desplegar por un repositorio de GitLab de terceros.' },
  { id: 'ordenscan', n: 'ordenscan', g: 'app', peso: 2, w: 'https://ordenscan.com',
    d: 'El explorador de la cadena. La ficha de cada persona trae su historial completo: cuentas, identidad y movimiento de los 15 tokens.' },
  { id: 'og-web', n: 'ordenglobal.org', g: 'app', peso: 1.6,
    d: 'El sitio corporativo. Sin conexión de datos con el resto: es la cara pública.' },

  // ── Identidad ────────────────────────────────────────────────────────────
  { id: 'genesis', n: 'Genesis ID', g: 'identidad', peso: 3.4, vivo: 'genesis', w: 'https://genesis-id.onrender.com',
    d: 'El motor de identidad: KYC de personas, KYB de empresas, tamizado contra listas de sanciones, monitoreo AML y sesión única entre las apps. Ninguna identidad se verifica sola — cada aprobación la firma un operador.' },
  { id: 'gid-app', n: 'Genesis ID · app', g: 'identidad', peso: 2,
    d: 'El panel de cumplimiento en Android. Cola de identidades, decisión con motivo firmado, casos AML y analítica con filtros.' },
  { id: 'gid-panel', n: 'Panel web', g: 'identidad', peso: 2, w: 'https://genesis-id.onrender.com',
    d: '/admin para cumplimiento, /analitica para métricas, /cerebro para esto que estás mirando.' },
  { id: 'gid-portal', n: 'genesisid.online', g: 'identidad',
    d: 'El portal externo de identidad. El puente con él no funcionaba y se reconstruyó. NO RESPONDE hoy: comprobado el 18/08/2026 y la conexión no llega. Por eso no lleva enlace — un botón que abre una página muerta delante de la Junta es peor que no tener botón.' },
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
  { id: 'd-app', n: 'app.vetawallet.com', g: 'dominio', vivo: 'dom-app', w: 'https://app.vetawallet.com', d: 'Amplify d264zjawew1yea · control total.' },
  { id: 'd-legal', n: 'legal.vetawallet.com', g: 'dominio', vivo: 'dom-legal', w: 'https://legal.vetawallet.com', d: 'Política de privacidad y términos, sin pedir sesión — lo exigen las tiendas.' },
  { id: 'd-www', n: 'www.vetawallet.com', g: 'dominio', vivo: 'dom-www', w: 'https://www.vetawallet.com', d: 'CloudFront de otra cuenta, con origen propio. Control parcial.' },
  { id: 'd-rpc', n: 'rpc.ordenglobal-rpc.com', g: 'dominio', vivo: 'rpc', d: 'El RPC de la cadena.' },
  { id: 'd-genesis', n: 'genesis-id.onrender.com', g: 'dominio', vivo: 'genesis-salud', w: 'https://genesis-id.onrender.com', d: 'Genesis ID.' },
  { id: 'd-og', n: 'ordenglobal.org', g: 'dominio', w: 'https://ordenglobal.org', d: 'DNS en NameSilo, servidor cPanel viejo con WordPress intacto debajo.' },

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
  { id: 'a-validador', n: 'Un solo validador', g: 'abierto', peso: 2.6,
    d: 'De los 6 nodos, el conjunto validador de la cadena tiene UNA dirección. Los demás sincronizan y sirven RPC, pero no firman. Es centralización real, no de papel. Fondear y poner en staking al resto mueve tesorería: necesita la Junta.' },
  { id: 'a-cred', n: 'Credenciales sin rotar', g: 'abierto', peso: 2.4,
    d: 'cPanel, una clave de AWS (las AKIA no expiran solas), un token de Expo, un hook de Render y una API key de Heroku pasaron por el chat. Los valores no se escriben en ningún sitio; lo que hay que hacer es rotarlos.' },
  { id: 'a-corruptos', n: '2 registros corruptos', g: 'abierto',
    d: 'Dos campos cifrados de una cuenta ya estaban rotos antes de la migración. Verificado contra la cadena: nonce 0 y saldo 0 en los cuatro tokens principales, así que no hay fondos en riesgo. La causa sigue sin saberse.' },
  { id: 'a-reporte', n: 'Apps sin reportar', g: 'abierto', peso: 2,
    d: 'Ya reportan los DOS clientes de Veta Wallet: la app Android (le faltaba identificar a la persona, por eso llegaban eventos sin dueño) y la web. El alta en el padrón se prueba con la propia sesión del usuario, sin claves secretas en el cliente. Queda: DESPLEGAR la web para que empiece a llegar, y montar el padrón completo en el backend —que sigue fuera de alcance por el token de Heroku— para ver también a quien no abre la app.' },

  // ── Decisiones que solo puede tomar Orden Global ─────────────────────────
  { id: 'dec-staking', n: 'Autorizar staking', g: 'decision', peso: 2,
    d: 'Fondear y poner en staking los otros nodos. Mueve tesorería: solo con instrucción escrita de la Junta.' },
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

  /* ══════════════════════════════════════════════════════════════════════════
     LO QUE FALTABA DEL ECOSISTEMA

     Todo lo de aquí abajo sale de fuentes que ya existían en la casa y que el
     mapa no miraba:

       · `infra/cerebro/conocimiento/saber.json`    — 31 fichas revisadas
       · `infra/cerebro/conocimiento/legal.json`    — 11 bloques + 10 puntos
         para la Junta · Melany Ordóñez, Secretaria · 14/08/2026
       · `infra/cerebro/conocimiento/portafolio-minero.md` — 14/08/2026

     Ni una cifra de aquí está escrita de memoria. Y donde la fuente pone un
     aviso —«no constituye reserva certificada»— el aviso viaja con el número,
     que es la mitad del dato. Un potencial minero sin esa coletilla es otra
     cosa distinta de lo que dice el documento.
     ══════════════════════════════════════════════════════════════════════════ */

  // ── La cadena nueva ───────────────────────────────────────────────────────
  { id: 'cadena5550', n: 'Cadena 5550', g: 'cadena', peso: 4,
    d: 'La cadena nueva, con su génesis construido y juzgado. Sustituye a la 8532, que queda congelada y cerrada.' },
  { id: 'cadena5534', n: 'Cadena 5534', g: 'cadena', peso: 2, w: 'https://testnet.ordenscan.com',
    d: 'La red de pruebas. Sirve el RPC de pruebas desde tres máquinas pequeñas.' },

  // ── Productos que no estaban ──────────────────────────────────────────────
  { id: 'pulsechat', n: 'PULSE CHAT', g: 'app', peso: 3,
    d: 'El chat del ecosistema dentro de la billetera: hablar y pagar en el mismo sitio, sin salir de la conversación.' },
  { id: 'aura', n: 'AU-RA', g: 'agente', peso: 3,
    d: 'La asistente que vive dentro de la billetera y habla con cualquiera. Solo sabe lo que Genesis Core dejó salir: el saber público, nunca lo interno.' },
  { id: 'ordenex', n: 'Ordenex', g: 'app', peso: 3,
    d: 'La casa de cambio del ecosistema: el mercado donde ORIGEN y los tokens se compran y se venden.' },
  { id: 'aucorp', n: 'AuCorp', g: 'app', peso: 3,
    d: 'La plataforma de banca fiat: cuentas en dólares y monedas de Latinoamérica, Canadá y euro, conectada a Genesis ID.' },
  { id: 'tarjeta', n: 'Tarjeta Visa', g: 'app', peso: 2,
    d: 'La tarjeta virtual, por donde entra dinero de fuera al ecosistema. 24 emitidas.' },

  // ── Legal · fuente: legal.json, Secretaría de la Junta, 14/08/2026 ────────
  { id: 'l-sociedad', n: 'Orden Global Corp', g: 'legal', peso: 4,
    d: 'La sociedad responsable de todo el ecosistema. Próspera ZEDE, Roatán, Honduras. Permiso 88501978376475, registrada el 23/07/2026.' },
  { id: 'l-licencias', n: 'Licencias', g: 'legal', peso: 3,
    d: 'Hoy no hay ninguna licencia emitida: las cuatro están en preparación ante la RFSA de Próspera. La operación ya está viva.' },
  { id: 'l-tokens', n: 'Figura de los tokens', g: 'legal', peso: 3,
    d: 'ORIGEN es REFERENCIADO al oro, nunca respaldado. ONDK es el único respaldado, y es un valor negociable bajo Próspera.' },
  { id: 'l-tesoreria', n: 'Tesorería', g: 'legal', peso: 3,
    d: 'La emisión total vive en cuatro billeteras madre de 250 mil millones de ORIGEN cada una. Moverlas exige acta de Junta.' },
  { id: 'l-cumplimiento', n: 'Cumplimiento', g: 'legal', peso: 2,
    d: 'Genesis ID hace KYC, KYB y AML. El manual de prevención de blanqueo está en proceso y no hay oficial de cumplimiento nombrado.' },
  { id: 'l-contratos', n: 'Contratos de usuario', g: 'legal', peso: 2,
    d: 'No hay términos, ni política de privacidad, ni contrato de usuario. 435 personas usan el producto sin ninguno de los tres.' },
  { id: 'l-pi', n: 'Propiedad intelectual', g: 'legal', peso: 2,
    d: 'Ninguna marca registrada. Los dominios están a nombre personal de una socia y no hay cesión de derechos del software.' },
  { id: 'l-gobernanza', n: 'Gobernanza', g: 'legal', peso: 2,
    d: 'Junta de cinco miembros, quórum de tres, reuniones trimestrales. El CEO puede firmar solo hasta 100.000 dólares.' },
  { id: 'l-fiscal', n: 'Fiscalidad', g: 'legal', peso: 1,
    d: 'Régimen de Próspera, obligaciones al día y sin hecho gravable a la fecha. El tratamiento fiscal de la emisión está sin analizar.' },

  // ── Minería · fuente: portafolio-minero.md, 14/08/2026 ────────────────────
  { id: 'm-indexsa', n: 'INDEXSA', g: 'mina', peso: 4,
    d: 'Minera junior hondureña de la que Orden Global tiene el 60%. Lo valioso no es una mina: es una base de datos geológica regional de la que salen prospectos nuevos.' },
  { id: 'm-pantaleona', n: 'Pantaleona', g: 'mina', peso: 3,
    d: 'San Marcos de Colón, Choluteca. Exploración avanzada camino a listado en la TSX-V. Potencial estimado ~655.000 oz de oro — estimación geológica, NO reserva certificada.' },
  { id: 'm-monarka', n: 'Buena Vista · Monarka', g: 'mina', peso: 3,
    d: 'Danlí, El Paraíso. 436.960 oz cuantificadas entre Indicado e Inferido, con potencial adicional hasta ~1.500.000 oz. Recursos, NO reservas certificadas.' },
  { id: 'm-travesia', n: 'Travesía', g: 'mina', peso: 1,
    d: 'Exploración temprana. ~400.000 oz es un dato preliminar aportado por la compañía y SIN informe técnico en el expediente. Falta el reporte geológico.' },
  { id: 'm-zonasur', n: 'Zona sur · 138 vetas', g: 'mina', peso: 2,
    d: '138 vetas medidas por INDEXSA en cuatro proyectos, con potencial preliminar agregado de 34,6 millones de oz. Estimación de campo, requiere exploración formal.' },

  // ── Lo que espera a la Junta · fuente: legal.json → paraLaJunta ───────────
  { id: 'j-licencias', n: 'Plan de licencias', g: 'junta', peso: 3,
    d: 'Decidir el plan y los tiempos de las licencias. Es la primera y la más urgente: hay usuarios reales y ninguna licencia emitida.' },
  { id: 'j-pi', n: 'Formalizar la marca', g: 'junta', peso: 2,
    d: 'Registrar marcas, pasar los dominios a la sociedad y firmar la cesión de derechos del software.' },
  { id: 'j-contratos', n: 'Contratos de usuario', g: 'junta', peso: 2,
    d: 'Crear y publicar términos, política de privacidad y contrato de usuario, con un punto de aceptación que quede registrado.' },
  { id: 'j-figura', n: 'Dictamen sobre ORIGEN', g: 'junta', peso: 2,
    d: 'Definir por escrito, con dictamen, qué es ORIGEN en derecho.' },
  { id: 'j-aml', n: 'Manual AML', g: 'junta', peso: 2,
    d: 'Aprobar el manual de prevención de blanqueo y nombrar al oficial de cumplimiento.' },
  { id: 'j-acuerdo1', n: 'Acuerdo uno a acta', g: 'junta', peso: 1,
    d: 'Llevar a acta el llamado acuerdo uno, que mantiene la cadena vieja como respaldo. Hoy está dicho y sin acta a la vista.' },
];

/** `[origen, destino, etiqueta, fuerte?]`. La etiqueta dice QUÉ pasa entre los dos. */
export const ENLACES = [
  // La cadena y sus nodos
  ['cadena', 'rpc', 'se consulta por'],
  // Todos los demás dominios cuelgan de lo que sirven; a este se le había
  // olvidado, y quedaba flotando solo en un rincón del cerebro sin decir de
  // qué era el dominio.
  ['d-rpc', 'rpc', 'sirve'],
  ['cadena', 'validador', 'la firman', true],
  ...['node1','node2','node3','node4','node5','node6'].map((n) => [n, 'cadena', 'sincronizan']),
  ['validador', 'node1', 'una sola dirección firma', true],
  ...['node1','node2','node3','node4','node5','node6'].map((n) => ['watchdog', n, 'vigila y reinicia']),
  ...['node1','node2','node3','node4','node5','node6'].map((n) => [n, 'aws', 'corren en EC2']),
  ['a-validador', 'validador', 'el problema es este', true],
  ['a-validador', 'dec-staking', 'se resuelve con', true],

  // Los tokens viven en la cadena
  ...['ORIGEN','AUKA','AGKA','ONDK','MNKA','IBS','HARV','AUBEX','ASL','LOVE','REST','SOL','AIT','AGRO','POLITICAL']
    .map((t) => [t, 'cadena', 'vive en']),

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

  /* ── Lo nuevo, cosido al resto ──────────────────────────────────────────
     Un mapa donde las piezas nuevas flotan sueltas no es un mapa: es una
     lista con colores. Lo que hace que el cerebro se lea como UN ecosistema
     es que cada pieza esté atada a lo que la sostiene y a lo que la usa. */

  // la cadena nueva y la de pruebas
  ['cadena5550', 'cadena', 'sustituye a'],
  ['cadena5550', 'ORIGEN', 'lleva'],
  ['cadena5534', 'cadena5550', 'ensaya para'],

  // los productos entre ellos
  ['pulsechat', 'vw-app', 'vive dentro de'],
  ['aura', 'vw-app', 'vive dentro de'],
  ['aura', 'genesis', 'solo dice lo que el saber deja salir'],
  ['ordenex', 'ORIGEN', 'da mercado a'],
  ['ordenex', 'ONDK', 'da mercado a'],
  ['ordenex', 'genesis', 'verifica con'],
  ['aucorp', 'genesis', 'verifica con'],
  ['aucorp', 'vw-back', 'se apoya en'],
  ['tarjeta', 'vw-app', 'se recarga desde'],
  ['tarjeta', 'aucorp', 'entra dinero de fuera por'],

  // legal: todo cuelga de la sociedad
  ['l-licencias', 'l-sociedad', 'las pide'],
  ['l-tokens', 'l-sociedad', 'los emite'],
  ['l-tesoreria', 'l-sociedad', 'la custodia'],
  ['l-cumplimiento', 'l-sociedad', 'responde'],
  ['l-contratos', 'l-sociedad', 'los firma'],
  ['l-pi', 'l-sociedad', 'deberían ser de'],
  ['l-gobernanza', 'l-sociedad', 'la gobierna'],
  ['l-fiscal', 'l-sociedad', 'tributa'],
  ['l-tokens', 'ORIGEN', 'define qué es'],
  ['l-tokens', 'ONDK', 'define qué es'],
  ['l-cumplimiento', 'genesis', 'se hace con'],
  ['l-tesoreria', 'ORIGEN', 'guarda la emisión de'],

  // minería: el respaldo en construcción
  ['m-indexsa', 'l-sociedad', '60% de'],
  ['m-pantaleona', 'm-indexsa', 'sale de'],
  ['m-monarka', 'm-indexsa', 'sale de'],
  ['m-travesia', 'm-indexsa', 'sale de'],
  ['m-zonasur', 'm-indexsa', 'sale de la base geológica de'],
  ['m-indexsa', 'ORIGEN', 'construye el respaldo de'],

  // lo que espera firma
  ['j-licencias', 'l-licencias', 'resuelve', true],
  ['j-pi', 'l-pi', 'resuelve', true],
  ['j-contratos', 'l-contratos', 'resuelve', true],
  ['j-figura', 'l-tokens', 'resuelve', true],
  ['j-aml', 'l-cumplimiento', 'resuelve', true],
  ['j-acuerdo1', 'l-gobernanza', 'resuelve', true],
];
