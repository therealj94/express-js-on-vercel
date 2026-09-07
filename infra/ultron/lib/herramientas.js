// LAS HERRAMIENTAS DE ULTRON: lo que puede HACER, con nombre, y un solo sitio
// donde se ejecutan. Las usan los dos cerebros —el del nodo y Claude— porque
// un asistente cuyas manos cambian según el cerebro que lleve no es un
// asistente, son dos.
//
// ── LAS QUE VEN Y ABREN ─────────────────────────────────────────────────────
//
//   buscar_web / leer_pagina   internet sin depender de nadie: el nodo no tiene
//                              buscador y la junta pidió que ULTRON esté
//                              conectado. DuckDuckGo sin llave; si algún día
//                              hay llave de Brave (ULTRON_BRAVE), se usa esa.
//   abrir                      le pone a la persona un botón para ABRIR una casa
//                              o un documento. No abre nada solo: un navegador
//                              no deja abrir pestañas sin que alguien toque, y
//                              está bien que sea así. Solo sitios de la casa.
//   estado_vivo                mira cómo están las casas ahora mismo.
//
// ── LAS QUE RECUERDAN Y ESCRIBEN ────────────────────────────────────────────
//
//   buscar_saber, recordar, anotar_pendiente, cerrar_pendiente, crear_documento
//
// ── LAS QUE PREPARAN Y NO MANDAN ────────────────────────────────────────────
//
//   proponer_envio             deja listo un WhatsApp o correo. La persona lo
//                              manda desde el panel. Nunca sale solo.
//   exportar_pdf               deja un documento listo para bajar en PDF, con
//                              la cara de la casa. Es el formato con el que un
//                              escrito SALE: se adjunta, se imprime, se
//                              entrega. Tampoco lo manda.
//   quien_es_quien             la lista de la junta con sus vías. Va antes de
//                              proponer un envío, no después de que falle.
//
// Ninguna llega a una billetera ni a una llave. Ni tiene con qué.

const saber = require('./saber');
const vivo = require('./vivo');
const memoria = require('./memoria');
const permisos = require('./permisos');
const boveda = require('./boveda');
const taller = require('./taller');
const caja = require('./caja');
const aprender = require('./aprender');
const equipo = require('./equipo');
const operaciones = require('./operaciones');
const salud = require('./salud');
const bitacora = require('./bitacora');
const mundo = require('./mundo');
const avisos = require('./avisos');

// Adónde puede mandar a abrir. Cerrado a la casa a propósito: «abrí» con una
// URL cualquiera es la forma más fácil de que un modelo lleve a alguien a un
// sitio que no es nuestro.
const CASAS = {
  ordenex: { nombre: 'Ordenex', url: 'https://ordenexchange.link/' },
  ordenscan: { nombre: 'OrdenScan', url: 'https://ordenscan.com/' },
  aucorp: { nombre: 'AuCorp', url: 'https://main.d2e55u6ls6v9xt.amplifyapp.com/banca/' },
  wallet: { nombre: 'Veta Wallet', url: 'https://app.vetawallet.com/' },
  ordenglobal: { nombre: 'Orden Global', url: 'https://ordenglobal.org/' },
  aura: { nombre: 'AU-RA', url: 'https://ordenglobal.org/aura' },
};

const DEFINICIONES = [
  {
    name: 'buscar_saber',
    description: 'Busca en lo que Orden Global tiene escrito (documentos, dosieres de la junta, fichas legales) más secciones sobre un tema.',
    input_schema: { type: 'object', properties: { pregunta: { type: 'string', description: 'De qué querés más secciones' } }, required: ['pregunta'] },
  },
  {
    name: 'estado_vivo',
    description: 'Lee ahora mismo cómo están Ordenex, AuCorp, Veta Wallet, Genesis ID, OrdenScan y el precio del ORIGEN.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_web',
    description: 'Busca en internet. Para lo de hoy o de fuera de la casa: precio del oro, una ley, una noticia, un competidor. Devuelve títulos, enlaces y resúmenes.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'Qué buscar, en pocas palabras' } }, required: ['consulta'] },
  },
  {
    name: 'leer_pagina',
    description: 'Lee el texto de una página de internet (una URL que salió en buscar_web o que la persona dio).',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  {
    name: 'abrir',
    description: 'Le pone a la persona un botón para abrir una casa (ordenex, ordenscan, aucorp, wallet, ordenglobal, aura) o un documento de la biblioteca (documento:<id>). No abre nada solo.',
    input_schema: { type: 'object', properties: { que: { type: 'string', description: 'ordenex · ordenscan · aucorp · wallet · ordenglobal · aura · documento:<id>' }, porQue: { type: 'string', description: 'Para qué, en una frase' } }, required: ['que'] },
  },
  {
    name: 'recordar',
    description: 'Guarda en la memoria algo que conviene no olvidar: una decisión, una preferencia, un dato. Alcance «junta» si es de todos, «miembro» si es de esta persona.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' }, alcance: { type: 'string', enum: ['junta', 'miembro'] }, tema: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'anotar_pendiente',
    description: 'Anota algo que la junta tiene que HACER. Distinto de recordar: esto se cierra cuando se hace.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' }, quien: { type: 'string', description: 'A quién le toca; vacío si es de la junta' }, tema: { type: 'string' }, vence: { type: 'string', description: 'Cuándo vence, AAAA-MM-DD (opcional). «el martes» se convierte a fecha antes de llamar.' } }, required: ['texto'] },
  },
  {
    name: 'cerrar_pendiente',
    description: 'Marca un pendiente como hecho, por su id. Solo cuando alguien de la junta dice que ya se hizo.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'crear_documento',
    description: 'Escribe y guarda un documento completo en markdown: memo, acta, análisis, carta o plan. Queda en la biblioteca.',
    input_schema: { type: 'object', properties: { titulo: { type: 'string' }, tipo: { type: 'string', enum: ['memo', 'acta', 'analisis', 'carta', 'plan', 'otro'] }, markdown: { type: 'string' }, para: { type: 'string', enum: ['junta', 'fuera'] } }, required: ['titulo', 'markdown'] },
  },
  // ── Las manos sobre el ecosistema: leen las APIs de verdad de cada casa ───
  {
    name: 'ordenex_mercado',
    description: 'Lee un mercado de Ordenex ahora mismo: libro (compras y ventas), últimos tratos y la referencia del oro. Mercados: AUKA-ORIGEN, ONDK-ORIGEN, USDT-ORIGEN (o los que devuelva estado_vivo).',
    input_schema: { type: 'object', properties: { mercado: { type: 'string', description: 'Par, p. ej. AUKA-ORIGEN' } }, required: ['mercado'] },
  },
  {
    name: 'cadena_direccion',
    description: 'Consulta una dirección en la cadena 5550 vía OrdenScan: saldo, tokens (ONDK, AUKA, ORIGEN…) y últimas transacciones.',
    input_schema: { type: 'object', properties: { direccion: { type: 'string', description: '0x… de 42 caracteres' } }, required: ['direccion'] },
  },
  {
    name: 'ordenex_caja',
    description: 'Las billeteras de Ordenex ahora mismo: cuánto ORIGEN queda en la caliente (la que entrega), cuántos USDT en la pagadora de cada red (la que paga las ventas), el gas que le queda a cada una medido en operaciones, la comisión que lleva ganada la casa, y qué órdenes y retiros están en pie. Solo lee. Para «cómo está la caja», «cuánto USDT nos queda», «actualizá los saldos».',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cadena_altura',
    description: 'La altura actual de la cadena 5550, leída por dos sitios distintos: OrdenScan (el explorador) y Ordenex. Si se separan, el explorador se quedó atrás.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'aucorp_monedas',
    description: 'Las monedas que maneja AuCorp y si las tasas están al día. AuCorp es una FinTech con cuentas en moneda local, NO un banco.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'genesis_salud',
    description: 'Cómo está Genesis ID (identidad): estado del servicio y qué le falta para el cumplimiento.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'nodo_salud',
    description: 'Cómo está nuestro nodo de inteligencia (el motor donde pensás): modelo cargado, contexto, pedidos atendidos y rechazados.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'listar_documentos',
    description: 'Lista los documentos de la biblioteca de la junta (memos, actas, análisis) con su id, para leerlos o abrirlos.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'leer_documento',
    description: 'Lee entero un documento de la biblioteca por su id (de listar_documentos).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'listar_pendientes',
    description: 'Lista los pendientes abiertos de la junta con su id, a quién le tocan, desde cuándo y cuándo vencen (los vencidos y los de hoy primero).',
    input_schema: { type: 'object', properties: { conHechos: { type: 'boolean', description: 'true para ver también los ya hechos' } } },
  },
  {
    name: 'calcular',
    description: 'Calcula una expresión aritmética exacta (+ - * / % ^ y paréntesis). Usala para cualquier cuenta: no hagas aritmética de cabeza.',
    input_schema: { type: 'object', properties: { expresion: { type: 'string', description: 'p. ej. 4467.53 / 31.1035 / 55' } }, required: ['expresion'] },
  },
  {
    name: 'gasto',
    description: 'Lo gastado en pensar hoy y en el mes: turnos, fichas y dólares.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cadena_5550_saldo',
    description: 'Lee en la cadena 5550 (la de ORIGEN) el saldo de una dirección: ORIGEN nativo y los tokens de la casa (AUKA, AGKA, ONDK…).',
    input_schema: { type: 'object', properties: { direccion: { type: 'string', description: '0x… de 42 caracteres' } }, required: ['direccion'] },
  },
  {
    name: 'cotizar',
    description: 'Cotiza con el precio de AHORA: cuánto ORIGEN dan N USDT (sentido «compra») o cuántos USDT dan N ORIGEN con la comisión de salida del 1 % (sentido «venta»).',
    input_schema: { type: 'object', properties: { monto: { type: 'number', description: 'La cantidad' }, sentido: { type: 'string', enum: ['compra', 'venta'] } }, required: ['monto', 'sentido'] },
  },
  {
    name: 'parte_del_dia',
    description: 'Arma el parte del día para la junta: estado de cada casa, precio, bloques, pendientes abiertos, documentos recientes y gasto. Úsalo cuando pidan «el parte», «cómo estamos» o un resumen general.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_conversaciones',
    description: 'Busca en las conversaciones anteriores de esta persona con ULTRON por una palabra o tema, y devuelve los fragmentos que coinciden con su fecha.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] },
  },
  {
    name: 'olvidar',
    description: 'Borra una memoria guardada, por su id, cuando la persona dice que ya no aplica o que estaba mal.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'nube_estado',
    description: 'Lee en AWS cómo están las máquinas de la casa: el nodo de inteligencia y los nodos de la cadena (encendidas, apagadas, su IP). Solo lee.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'proponer_envio',
    description: 'Prepara un WhatsApp o un correo para un miembro de la junta. NO lo manda: la persona lo confirma en el panel.',
    input_schema: { type: 'object', properties: { canal: { type: 'string', enum: ['whatsapp', 'correo'] }, destinatario: { type: 'string', description: 'Nombre o correo del miembro' }, asunto: { type: 'string' }, texto: { type: 'string' } }, required: ['canal', 'destinatario', 'texto'] },
  },
  {
    name: 'listar_archivos',
    description: 'Los archivos que la junta le subió a ULTRON (PDF, Word, texto, CSV, imágenes) con su id y su tamaño. Mirá esto cuando alguien mencione «el informe», «el contrato», «la foto» o «lo que te mandé». Una IMAGEN no tiene texto que extraer y aun así se puede leer: `leer_archivo` se la da al cerebro para que la MIRE y describa lo que hay. Nunca digas que no podés ver una imagen sin haberlo intentado.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'leer_archivo',
    description: 'Lee un archivo subido, por su id: el texto de un PDF, Word o texto; y si es una IMAGEN (foto, captura, factura, mockup) la MIRA y describe lo que hay, con las cifras y palabras que se lean. Un PDF escaneado no tiene texto y lo dice.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'El id que da listar_archivos' }, pregunta: { type: 'string', description: 'Si es una IMAGEN: qué mirar en ella (opcional)' }, desde: { type: 'number', description: 'Desde qué letra seguir leyendo, si el archivo es largo y ya leíste un trozo' } }, required: ['id'] },
  },
  {
    name: 'quien_es_quien',
    description: 'La lista de la Junta Directiva: nombre, rol, y por qué vías se le puede escribir (correo, WhatsApp). Úsala antes de proponer un envío para saber a quién se le puede mandar y cómo.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'exportar_pdf',
    description: 'Deja un documento de la biblioteca listo para bajar en PDF, con la cara de Orden Global. Es el formato para mandar por correo, imprimir o entregar fuera. Le pone un botón a la persona; no manda nada.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'El id del documento' }, porQue: { type: 'string', description: 'En una frase, para qué se lo dejás' } }, required: ['id'] },
  },
  /* ── LA MANO DERECHA ────────────────────────────────────────────────────────
     Lo que José pidió: entrar al repositorio, correr comandos, guardar secretos,
     aprender, tener un equipo. Cada una lleva su nivel en lib/permisos.js; las
     peligrosas piden autorización al dueño antes de correr, y la herramienta
     lo dice cuando pasa. */
  {
    name: 'repo_llave',
    description: 'Dice QUÉ llave de GitHub tiene la casa y qué le falta: de qué cuenta es, de qué clase, qué permisos lleva marcados y si con ellos ve el repositorio. Nunca enseña la llave. Se usa cuando repo_arbol, repo_leer o repo_buscar fallan con 404 o 401, en vez de adivinar.',
    input_schema: { type: 'object', properties: { repo: { type: 'string', description: 'dueño/repo a comprobar; por omisión el de la casa' } } },
  },
  {
    name: 'repo_arbol',
    description: 'Lista una carpeta del repositorio de la casa (GitHub). Sin ruta, la raíz. Sin rama, la que ULTRON está corriendo —que NO es la principal—. Para ubicarse antes de leer o cambiar algo.',
    input_schema: { type: 'object', properties: { repo: { type: 'string', description: 'dueño/repo; por omisión el de la casa' }, ruta: { type: 'string' }, rama: { type: 'string' } } },
  },
  {
    name: 'repo_leer',
    description: 'Lee un archivo ENTERO del repositorio, de la rama que ULTRON está corriendo. Leer antes de tocar: un cambio sobre un archivo que no se leyó completo rompe algo diez líneas más abajo.',
    input_schema: { type: 'object', properties: { repo: { type: 'string' }, ruta: { type: 'string' }, rama: { type: 'string' } }, required: ['ruta'] },
  },
  {
    name: 'repo_buscar',
    description: 'Busca texto o código en el repositorio: una función, un campo, un nombre. OJO: GitHub solo busca en la rama PRINCIPAL, y el código de ULTRON vive en otra; si no sale nada, no quiere decir que no exista — mírelo con repo_arbol y repo_leer.',
    input_schema: { type: 'object', properties: { repo: { type: 'string' }, consulta: { type: 'string' } }, required: ['consulta'] },
  },
  {
    name: 'repo_proponer_cambio',
    description: 'PELIGROSA (pide autorización al dueño). Propone un cambio de código: crea una rama ultron/…, escribe los archivos ENTEROS y abre un pull request. Nunca escribe en la rama principal. Cada archivo lleva ruta y contenido completo.',
    input_schema: { type: 'object', properties: {
      repo: { type: 'string' }, base: { type: 'string', description: 'rama base; por omisión la principal' },
      titulo: { type: 'string' }, descripcion: { type: 'string', description: 'qué cambia y por qué, con el síntoma' },
      archivos: { type: 'array', items: { type: 'object', properties: { ruta: { type: 'string' }, contenido: { type: 'string' } }, required: ['ruta', 'contenido'] } },
    }, required: ['titulo', 'archivos'] },
  },
  {
    name: 'terminal',
    description: 'PELIGROSA (pide autorización al dueño). Corre UN comando de shell en el servidor de ULTRON, con plazo de 60 s, salida acotada y sin ninguna variable de entorno de la casa. El dueño ve el comando exacto antes de aprobarlo.',
    input_schema: { type: 'object', properties: { comando: { type: 'string' }, motivo: { type: 'string', description: 'para qué, en una línea: lo lee el dueño' } }, required: ['comando'] },
  },
  {
    name: 'desplegarse',
    description: 'PELIGROSA (pide autorización al dueño). Despliega ULTRON a Heroku desde una rama del repositorio, desde el propio servidor. No corre las pruebas del navegador antes: es para una rama que ya pasó por una persona.',
    input_schema: { type: 'object', properties: { rama: { type: 'string' }, repo: { type: 'string' }, motivo: { type: 'string' } }, required: ['rama'] },
  },
  {
    name: 'boveda_listar',
    description: 'La bóveda de secretos: qué hay, cuántos días tiene cada uno, si es corto, en qué apps está puesto. NUNCA los valores: no existen para vos.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'boveda_aplicar',
    description: 'PELIGROSA (pide autorización al dueño). Pone un secreto de la bóveda como variable de entorno de una app en Heroku. El valor viaja de la bóveda a Heroku sin pasar por vos.',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' }, app: { type: 'string' }, variable: { type: 'string', description: 'nombre de la variable; por omisión el del secreto' } }, required: ['nombre', 'app'] },
  },
  {
    name: 'aprender',
    description: 'Guarda una LECCIÓN: una corrección de la junta que manda sobre las fichas viejas («la cadena viva es la 5550, no la 8532»). Usala cuando alguien te corrija un hecho, para no repetir el error.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'habilidad_usar',
    description: 'Carga una habilidad (un procedimiento escrito) para hacer una tarea como se hace en la casa. Las que hay están listadas en tu contexto con su nombre y cuándo se usan.',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] },
  },
  {
    name: 'habilidad_crear',
    description: 'Escribe o mejora una habilidad: el procedimiento de algo que salió bien, para hacerlo igual la próxima vez. Con nombre, CUÁNDO se usa y el contenido en markdown.',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' }, cuando: { type: 'string' }, contenido: { type: 'string' } }, required: ['nombre', 'cuando', 'contenido'] },
  },
  {
    name: 'habilidad_publicar',
    description: 'PELIGROSA (pide autorización al dueño). Publica una habilidad aprendida en el repositorio como pull request, para que quede versionada y la lea alguien.',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] },
  },
  {
    name: 'equipo_estado',
    description: 'El equipo de bots de ULTRON: cuáles hay, cada cuánto corren, si el reloj está encendido, cuándo corrió cada uno.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'equipo_partes',
    description: 'Los partes que escribieron los bots (centinela, cerrajero, contador, cronista). Con bot y límite; sin bot, los últimos de todos.',
    input_schema: { type: 'object', properties: { bot: { type: 'string' }, limite: { type: 'integer' }, horas: { type: 'integer', description: 'solo los de las últimas N horas' } } },
  },
  {
    name: 'equipo_correr',
    description: 'PELIGROSA (pide autorización al dueño: cuesta fichas). Corre un bot del equipo ahora y devuelve su parte.',
    input_schema: { type: 'object', properties: { bot: { type: 'string' } }, required: ['bot'] },
  },
  {
    name: 'auditar_dependencias',
    description: 'Fallos conocidos en los paquetes de ULTRON (npm audit). Solo lee; no cambia nada.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'heroku_apps',
    description: 'Las apps de la casa en Heroku: dynos y su estado, última versión desplegada y cuándo.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'heroku_registro',
    description: 'Las últimas líneas del registro (logs) de una app de Heroku. Para diagnosticar una casa caída o un error: primero el registro, después el reinicio.',
    input_schema: { type: 'object', properties: { app: { type: 'string' }, lineas: { type: 'integer', description: '20 a 1500; por omisión 120' } }, required: ['app'] },
  },
  {
    name: 'heroku_variables',
    description: 'Los NOMBRES de las variables de entorno de una app de Heroku y su largo. Nunca los valores.',
    input_schema: { type: 'object', properties: { app: { type: 'string' } }, required: ['app'] },
  },
  {
    name: 'heroku_reiniciar',
    description: 'PELIGROSA (pide autorización al dueño). Reinicia los dynos de una app de Heroku. Solo después de leer el registro y saber por qué.',
    input_schema: { type: 'object', properties: { app: { type: 'string' }, motivo: { type: 'string' } }, required: ['app'] },
  },
  {
    name: 'nodos',
    description: 'Los nodos de la cadena y las máquinas de la casa en AWS: nombre, id, región, estado, tipo e IP.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'nodo_comando',
    description: 'PELIGROSA (pide autorización al dueño). Corre un comando en un nodo de la cadena por SSM (node1…node7 por su nombre). Plazo 90 s. Para mirar la altura, el servicio, el disco; el dueño ve el comando exacto.',
    input_schema: { type: 'object', properties: { nodo: { type: 'string', description: 'node3, o el id i-…' }, comando: { type: 'string' }, motivo: { type: 'string' } }, required: ['nodo', 'comando'] },
  },
  {
    name: 'mongo_consultar',
    description: 'Lee una colección de una base de la casa (ordenex-api, aucorp-api, vetawallet, orden-global-scan o ultron), SOLO LECTURA, con filtro JSON y límite. Los campos sensibles llegan tapados. Para contar usuarios, ver los últimos registros, comprobar un dato.',
    input_schema: { type: 'object', properties: { app: { type: 'string' }, coleccion: { type: 'string' }, filtro: { type: 'string', description: 'JSON de Mongo, p. ej. {"estado":"abierto"}' }, limite: { type: 'integer' } }, required: ['app', 'coleccion'] },
  },
  {
    name: 'autorizaciones',
    description: 'Los pedidos de autorización: pendientes de que el dueño apruebe, aprobados, negados. Para decirle a la persona qué está esperando su clic.',
    input_schema: { type: 'object', properties: { estado: { type: 'string', enum: ['pendiente', 'aprobado', 'negado', 'usado', 'vencido'] } } },
  },
  {
    name: 'avisar_junta',
    description: 'SALE DE LA CASA (pide autorización al dueño). Manda un aviso a la junta por los canales de ULTRON: lo grave por WhatsApp y correo, lo leve solo por correo. Para «avisale a la junta que…». Los avisos automáticos (casa caída, salud) no pasan por aquí: salen solos.',
    input_schema: { type: 'object', properties: { titulo: { type: 'string' }, texto: { type: 'string' }, gravedad: { type: 'string', enum: ['grave', 'leve'] }, motivo: { type: 'string' } }, required: ['titulo', 'texto'] },
  },
  {
    name: 'bitacora',
    description: 'La bitácora de ULTRON: qué herramientas que escriben o tocan algo se corrieron, quién las pidió, por qué canal, si salieron bien y cuánto tardaron. Para «¿quién reinició Ordenex el lunes?» o «¿qué hiciste hoy?». Solo se añade; no se edita nunca.',
    input_schema: { type: 'object', properties: { limite: { type: 'integer' }, herramienta: { type: 'string' }, quien: { type: 'string' }, desde: { type: 'string', description: 'fecha ISO' } } },
  },
  {
    name: 'clima',
    description: 'El tiempo de un lugar: cómo está AHORA y el pronóstico de los próximos días. Sabe de memoria los sitios de la casa (Roatán, Tegucigalpa, San Pedro Sula, La Ceiba, Utila, Guanaja) y busca cualquier otro por su nombre. Úsala cuando pregunten por el clima, si va a llover, la temperatura o si se puede viajar.',
    input_schema: { type: 'object', properties: { lugar: { type: 'string', description: 'Roatán, Tegucigalpa, Miami…' }, dias: { type: 'integer', description: '1 a 7; por omisión 3' } } },
  },
  {
    name: 'hora',
    description: 'La hora exacta de Honduras ahora mismo, y la de otro lugar si se pide. Úsala cuando pregunten la hora, cuánto falta para algo, o al coordinar con alguien de otro país. La fecha del encabezado es la del arranque del turno; esta es del segundo en que se pregunta.',
    input_schema: { type: 'object', properties: { lugar: { type: 'string', description: 'Otro sitio: Madrid, Miami, Dubái…' } } },
  },
  {
    name: 'salud_revisar',
    description: 'La salud del PROPIO ULTRON, signo por signo: memoria del proceso, bucle de eventos, base de datos, cerebro (y si está de relevo), vigía, equipo, puerta, autorizaciones olvidadas y fallos de la última hora. Da una nota de 0 a 100. Es lo primero que hay que mirar cuando ULTRON va lento, no contesta o se comporta raro.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'salud_reparar',
    description: 'Arregla solo lo que se puede arreglar sin riesgo: reconectar la base, relevar el cerebro al respaldo cuando el nodo no contesta, rearrancar el vigía o el equipo, soltar cachés cuando aprieta la memoria, cerrar autorizaciones que nadie contestó. No reinicia dynos, no borra archivos, no toca secretos: eso se anota como pendiente. Sin argumentos arregla todo lo que la revisión encontró.',
    input_schema: { type: 'object', properties: { arreglos: { type: 'array', items: { type: 'string' }, description: 'Opcional: soltar_cache, reconectar_base, relevar_cerebro, rearrancar_vigia, rearrancar_equipo, cerrar_vencidos' } } },
  },
  {
    name: 'salud_historial',
    description: 'Las últimas rondas de salud con su nota y qué se reparó en cada una. Para ver si algo viene empeorando desde hace días en vez de mirar solo el momento.',
    input_schema: { type: 'object', properties: { limite: { type: 'integer', description: '1 a 60; por omisión 12' } } },
  },
];

// ── Internet ────────────────────────────────────────────────────────────────

const PLAZO_WEB_MS = 12_000;
const TOPE_PAGINA = 9_000;

function limpiarHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/* ── LOS NOMBRES DE LA CASA NO SE BUSCAN SOLOS ────────────────────────────────
 *
 * «Orden Global», a secas, le devuelve al buscador seis artículos sobre el
 * orden internacional y ni una línea de la casa; con eso delante el modelo
 * contesta que la organización no existe en internet. Decírselo en el prompt no
 * alcanzó —qwen propone la búsqueda buena y sigue mandando la mala—, así que la
 * afina la herramienta, que no se olvida.
 *
 * Solo cuando la consulta es el nombre PELADO: si alguien pregunta «Orden
 * Global demanda 2026» esa consulta es suya y se manda tal cual.
 */
const NOMBRES_DE_LA_CASA = [
  { re: /\borden\s*global\b/i, como: '"Orden Global" ordenglobal.org Honduras' },
  { re: /\bordenex\b/i, como: '"Ordenex" ordenexchange.link ORIGEN' },
  { re: /\borden\s*scan\b/i, como: '"OrdenScan" ordenscan.com' },
  { re: /\bau\s*corp\b/i, como: '"AuCorp" "Orden Global" Honduras' },
  { re: /\bveta\s*wallet\b/i, como: '"Veta Wallet" "Orden Global" ORIGEN' },
  { re: /\bgenesis\s*id\b/i, como: '"Genesis ID" "Orden Global" identidad' },
  { re: /\b(auka|agka)\b/i, como: '"Orden Global" AUKA AGKA plata oro' },
];
// Lo que no cuenta como «pregunta»: el relleno con el que se pide una búsqueda.
const RELLENO = /\b(informacion|información|info|datos?|sobre|acerca|de|del|la|el|los|las|un|una|que|qué|se|dice|dicen|en|internet|web|busca|busque|buscar|buscame|y|o|empresa|organizacion|organización|compania|compañia|compañía|proyecto|plataforma|ecosistema)\b/gi;

function afinarConsulta(q) {
  for (const n of NOMBRES_DE_LA_CASA) {
    if (!n.re.test(q)) continue;
    const resto = q.replace(n.re, ' ').replace(RELLENO, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    // Una palabra suelta todavía es el nombre pelado; dos ya son una pregunta.
    if (resto.split(/\s+/).filter(Boolean).length <= 1) return n.como;
  }
  return null;
}

/** DuckDuckGo (sin llave) o Brave (con ULTRON_BRAVE). Devuelve texto para el modelo. */
async function buscarWeb(consulta) {
  let q = String(consulta || '').trim().slice(0, 200);
  if (!q) return 'Consulta vacía.';
  const afinada = afinarConsulta(q);
  // El aviso va CON los resultados: el modelo tiene que poder decir con qué se
  // buscó de verdad, y que lo de internet es lo que se dice afuera de la casa.
  const nota = afinada
    ? `(La consulta «${q}» trae artículos de geopolítica, no a la casa: se buscó «${afinada}». Lo que sigue es lo que se dice AFUERA de Orden Global; lo que la casa ES sale de las fichas y del estado vivo, no de aquí. Si un titular dice «respaldado en oro», esa es la palabra de esa fuente: se cita como está y, al comentarlo, la palabra de la casa es «referenciado».)\n\n`
    : '';
  if (afinada) q = afinada;
  const brave = (process.env.ULTRON_BRAVE || '').trim();
  try {
    if (brave) {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6&search_lang=es`,
        { headers: { 'X-Subscription-Token': brave, Accept: 'application/json' }, signal: AbortSignal.timeout(PLAZO_WEB_MS) });
      const j = await r.json();
      const res = (j.web?.results || []).slice(0, 6);
      if (!res.length) return `${nota}Sin resultados para «${q}».`;
      return nota + res.map((x, i) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.description || ''}`).join('\n');
    }
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=es-es`,
      { headers: { 'User-Agent': 'Mozilla/5.0 ULTRON/1' }, signal: AbortSignal.timeout(PLAZO_WEB_MS) });
    const html = await r.text();
    const res = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m;
    while ((m = re.exec(html)) && res.length < 6) {
      let url = m[1];
      const uddg = /uddg=([^&]+)/.exec(url); if (uddg) url = decodeURIComponent(uddg[1]);
      res.push({ url, titulo: limpiarHtml(m[2]), resumen: limpiarHtml(m[3] || '') });
    }
    if (!res.length) return `${nota}Sin resultados para «${q}» (o el buscador no contestó bien).`;
    return nota + res.map((x, i) => `${i + 1}. ${x.titulo}\n   ${x.url}\n   ${x.resumen}`).join('\n');
  } catch (e) {
    return `No pude buscar «${q}»: ${e?.name === 'TimeoutError' ? 'el buscador tardó demasiado' : String(e?.message || e).slice(0, 120)}.`;
  }
}

async function leerPagina(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { return 'La URL no es válida.'; }
  if (!/^https?:$/.test(u.protocol)) return 'Solo http o https.';
  // Ni redes privadas ni localhost: una herramienta que lee URLs es una puerta
  // hacia adentro si no se le cierra.
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/.test(u.hostname)) return 'Esa dirección no se lee.';
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 ULTRON/1', Accept: 'text/html,text/plain,application/json' }, signal: AbortSignal.timeout(PLAZO_WEB_MS), redirect: 'follow' });
    const tipo = r.headers.get('content-type') || '';
    const cuerpo = await r.text();
    const texto = /html/.test(tipo) ? limpiarHtml(cuerpo) : cuerpo;
    if (!texto.trim()) return `La página contestó ${r.status} pero sin texto legible.`;
    return `(${u.hostname} · ${r.status} · ${texto.length > TOPE_PAGINA ? 'recortado' : 'entero'})\n${texto.slice(0, TOPE_PAGINA)}`;
  } catch (e) {
    return `No pude leer ${u.hostname}: ${e?.name === 'TimeoutError' ? 'tardó demasiado' : String(e?.message || e).slice(0, 120)}.`;
  }
}

// ── Ejecutar ────────────────────────────────────────────────────────────────

/**
 * Corre una herramienta y devuelve TEXTO para el modelo. Nunca lanza: un
 * fallo es texto también, para que el modelo lo lea y se corrija. `ctx`
 * acumula lo que el panel tiene que pintar (fuentes, documentos, envíos,
 * pendientes, acciones).
 */
/* LAS QUE ESCRIBEN. Importa para dos cosas: el panel las pinta distinto, y en
   un lote de herramientas van en fila india mientras las de leer van todas a
   la vez. Guardar una memoria y cerrar un pendiente tienen un orden que el
   modelo pidió; leer el mercado y leer la altura de la cadena, no. */
const ESCRIBEN = new Set(['recordar', 'olvidar', 'anotar_pendiente', 'cerrar_pendiente', 'crear_documento', 'proponer_envio',
  'aprender', 'habilidad_crear', 'habilidad_publicar', 'repo_proponer_cambio', 'terminal', 'desplegarse', 'boveda_aplicar', 'equipo_correr', 'heroku_reiniciar', 'nodo_comando', 'salud_reparar', 'avisar_junta']);

/* ── UN LOTE DE HERRAMIENTAS, NO UNA FILA ────────────────────────────────────
 *
 * Cuando el modelo pide tres cosas en la misma vuelta —«mirá el mercado, la
 * altura de la cadena y qué dice AuCorp»— las tres son viajes por internet que
 * no dependen entre sí. Corrertas una tras otra suma sus esperas: tres
 * lecturas de dos segundos son seis segundos de la junta mirando el punto que
 * parpadea. En paralelo son dos.
 *
 * Tres reglas hacen que eso sea seguro:
 *
 *   · Las que ESCRIBEN van en fila india y en el orden en que se pidieron. Si
 *     el modelo anota un pendiente y cierra otro en la misma vuelta, ese orden
 *     es el que quiso; ejecutarlas a la vez es dejar el resultado al azar.
 *   · La misma llamada con la misma entrada se corre UNA vez, aunque venga
 *     repetida en el lote o ya se haya corrido antes en el turno. El modelo
 *     chico repite, y cada repetición es una lectura más a la casa.
 *   · Los resultados vuelven EN EL ORDEN EN QUE SE PIDIERON, pase lo que pase.
 *     El modelo empareja cada resultado con su llamada por posición: si
 *     devolvés el que terminó primero, le estás dando la altura de la cadena
 *     donde esperaba el precio del mercado.
 */
async function correrLote(llamadas, { ctx, usadas = [], emitir = () => {}, correr: unaHerramienta = null } = {}) {
  /* Quién ejecuta cada herramienta entra por la puerta, con `correr` de fábrica.
     No es un adorno para las pruebas: lo que se prueba acá —quién corre a la
     vez, quién en fila, en qué orden vuelve— no se puede ver con las de
     verdad sin internet y sin la casa en pie. Y un parche desde fuera no
     funcionaría: `correr` se llama por cierre, no por el objeto exportado. */
  const ejecutar = unaHerramienta || correr;
  const normal = llamadas.map((tc) => {
    const nombre = tc.function?.name;
    let entrada = tc.function?.arguments;
    if (typeof entrada === 'string') { try { entrada = JSON.parse(entrada); } catch { entrada = {}; } }
    return { nombre, entrada: entrada && typeof entrada === 'object' ? entrada : {} };
  });
  for (const n of normal) emitir('herramienta', { nombre: n.nombre, entrada: n.entrada });

  const clave = (n) => `${n.nombre}:${JSON.stringify(n.entrada)}`;
  const salidas = new Array(normal.length);
  const nuevas = new Array(normal.length).fill(false);
  const enMarcha = new Map();
  const espera = [];
  let fila = Promise.resolve();   // la cola de las que escriben

  normal.forEach((n, i) => {
    const repetida = usadas.find((u) => u.nombre === n.nombre
      && JSON.stringify(u.entrada || {}) === JSON.stringify(n.entrada));
    if (repetida) { salidas[i] = `(ya consultado en este turno; el resultado es el mismo)\n${repetida.salida}`; return; }
    const k = clave(n);
    if (!enMarcha.has(k)) {
      nuevas[i] = true;
      const lanzar = () => ejecutar(n.nombre, n.entrada, ctx).catch((e) => `La herramienta ${n.nombre} falló: ${String(e?.message || e).slice(0, 200)}`);
      enMarcha.set(k, ESCRIBEN.has(n.nombre) ? (fila = fila.then(lanzar)) : lanzar());
    }
    espera.push(enMarcha.get(k).then((s) => { salidas[i] = s; }));
  });
  await Promise.all(espera);

  return normal.map((n, i) => {
    const salida = String(salidas[i] ?? '');
    if (nuevas[i]) usadas.push({ nombre: n.nombre, entrada: n.entrada, salida: salida.slice(0, 2000) });
    emitir('herramienta-lista', { nombre: n.nombre, salida: salida.slice(0, 600) });
    return { nombre: n.nombre, entrada: n.entrada, salida };
  });
}

async function correr(nombre, entrada, ctx) {
  entrada = entrada && typeof entrada === 'object' ? entrada : {};
  ctx.acciones = ctx.acciones || [];
  const t0 = Date.now();
  const salida = await correrAdentro(nombre, entrada, ctx);
  /* La bitácora: lo que escribe, lo peligroso, lo de fuera, y cualquier fallo.
     Lo de leer no se anota — son cientos al día y no cambian nada. */
  const nivel = permisos.nivelDe(nombre);
  const fallo = typeof salida === 'string' && /^La herramienta \S+ falló:/.test(salida);
  if (nivel !== 'leer' || fallo) {
    bitacora.anotar({ herramienta: nombre, quien: ctx.miembro?.correo, rol: permisos.rolDe(ctx.miembro, ctx.junta || []), canal: ctx.canal || (ctx.miembro?.rol === 'bot' ? 'reloj' : 'panel'),
      entrada, ok: !fallo, motivo: fallo ? salida : (entrada.motivo || null), ms: Date.now() - t0 }).catch(() => {});
  }
  return salida;
}

async function correrAdentro(nombre, entrada, ctx) {
  try {
    /* ── LA PUERTA DE CADA HERRAMIENTA ─────────────────────────────────────
       Antes de correr nada se mira quién pide y qué nivel tiene lo pedido
       (lib/permisos.js). Lo de leer pasa. Lo de escribir pasa para la junta
       y solo memorias/pendientes para un bot. Lo PELIGROSO y lo que sale
       FUERA no corre sin una aprobación del dueño con la huella exacta de
       esta llamada: si la hay, se consume y se corre; si no, se crea el
       pedido y se le dice al modelo que está esperando el clic. */
    const ojo = permisos.puede(ctx.miembro, nombre, ctx.junta || []);
    if (!ojo.ok) {
      if (!ojo.autorizable) return `No se puede: ${ojo.motivo}`;
      const { motivo: motivoPedido, ...entradaLimpia } = entrada;
      const aprob = await permisos.consumirAprobacion(nombre, entradaLimpia);
      if (!aprob) {
        const p = await permisos.pedir({ actor: ctx.miembro, herramienta: nombre, entrada: entradaLimpia, motivo: motivoPedido || '' });
        ctx.acciones.push({ tipo: 'autorizacion', id: String(p._id), resumen: p.resumen });
        return `ESPERANDO AUTORIZACIÓN DEL DUEÑO. Pedido ${String(p._id).slice(-6)}: «${p.resumen}». ${p.repetido ? 'Ya estaba pedido.' : 'Quedó en el panel, en AUTORIZACIONES.'} No lo repitas: cuando el dueño lo apruebe, volvé a llamar a ${nombre} con la MISMA entrada y correrá. Decile a la persona qué está esperando su aprobación.`;
      }
      entrada = entradaLimpia;
      ctx.acciones.push({ tipo: 'autorizado', id: String(aprob._id), resumen: aprob.resumen });
    }
    /* Un bot solo ve las herramientas de su encabezado, además de las de
       todos. Si pide otra, no es que falle: es que no la tiene. */
    if (ctx.miembro?.rol === 'bot' && Array.isArray(ctx.miembro.herramientas) && ctx.miembro.herramientas.length
        && !ctx.miembro.herramientas.includes(nombre) && !SIEMPRE_PARA_BOTS.has(nombre)) {
      return `El bot ${ctx.miembro.nombre} no tiene la herramienta ${nombre}. Tiene: ${ctx.miembro.herramientas.join(', ')}.`;
    }
    switch (nombre) {
      case 'buscar_saber': {
        const s = saber.buscar(String(entrada.pregunta || ''), { maximo: ctx.chico ? 5 : 8, maxBytes: ctx.chico ? 12_000 : 40_000 });
        ctx.fuentes.push(...s.map((x) => ({ id: x.id, titulo: x.titulo, fuente: x.fuente })));
        return s.length
          ? s.map((x) => `### [${x.id}] ${x.titulo}\n(fuente: ${x.fuente})\n${x.texto}`).join('\n\n')
          : 'No hay secciones del saber sobre eso.';
      }
      /* La puerta a las demás cajas. No corre nada: dice qué quedó a la vista.
         Quien la mira de verdad es el bucle del cerebro, que a partir de aquí
         le manda al modelo las definiciones de esa caja. */
      case 'mas_herramientas': {
        const caja = String(entrada.caja || '').trim();
        if (!CAJAS[caja]) return `No existe la caja «${caja}». Las que hay: ${CAJAS_UTILES.join(', ')}.`;
        const dentro = enCaja(caja).filter((n) => !NUCLEO.has(n));
        if (!dentro.length) return `La caja «${caja}» ya la tenías entera a la vista.`;
        return `Caja «${caja}» abierta. Ya podés usar: ${dentro.join(', ')}. Seguí con lo que ibas.`;
      }
      case 'estado_vivo': {
        const v = await vivo.leer();
        return vivo.paraElModelo(v);
      }
      case 'buscar_web': {
        const t = await buscarWeb(entrada.consulta || entrada.query || entrada.q);
        ctx.fuentes.push({ id: 'web:' + String(entrada.consulta || '').slice(0, 40), titulo: `Búsqueda: ${entrada.consulta || ''}`, fuente: 'internet' });
        return t;
      }
      case 'leer_pagina': {
        const t = await leerPagina(entrada.url);
        try { ctx.fuentes.push({ id: 'url:' + new URL(entrada.url).hostname, titulo: new URL(entrada.url).hostname, fuente: String(entrada.url) }); } catch { /* url mala */ }
        return t;
      }
      case 'abrir': {
        const que = String(entrada.que || '').trim().toLowerCase();
        let accion = null;
        if (que.startsWith('documento:')) {
          const id = que.slice('documento:'.length).trim();
          const d = await memoria.documento(id);
          if (!d) return `No hay un documento con id ${id}.`;
          accion = { tipo: 'abrir', nombre: d.titulo, url: `/documentos/${d._id}/descargar?formato=html`, porQue: entrada.porQue || null };
        } else if (CASAS[que]) {
          accion = { tipo: 'abrir', nombre: CASAS[que].nombre, url: CASAS[que].url, porQue: entrada.porQue || null };
        } else {
          return `No puedo abrir «${que}». Solo: ${Object.keys(CASAS).join(', ')} o documento:<id>.`;
        }
        ctx.acciones.push(accion);
        return `Le puse a la persona un botón para abrir ${accion.nombre}.`;
      }
      case 'recordar': {
        const m = await memoria.recordar({
          texto: entrada.texto, alcance: entrada.alcance === 'junta' ? 'junta' : 'miembro',
          miembro: ctx.miembro.correo, dichoPor: ctx.miembro.nombre, tema: entrada.tema, origen: 'deducido',
        });
        if (m) ctx.memorias.push(m);
        return m ? `Guardado (${m.alcance}): ${m.texto}` : 'No se guardó: texto vacío.';
      }
      case 'anotar_pendiente': {
        const p = await memoria.anotarPendiente({
          texto: entrada.texto, quien: entrada.quien, tema: entrada.tema, creadoPor: ctx.miembro.correo, vence: entrada.vence || null,
        });
        if (p && !p.repetido) ctx.pendientes.push({ _id: p._id, texto: p.texto, quien: p.quien });
        if (p?.repetido) return `Ya estaba anotado (id ${p._id}): «${p.texto}». No lo repetí.`;
        return p ? `Anotado como pendiente (id ${p._id}): ${p.texto}${p.vence ? ` · vence ${new Date(p.vence).toISOString().slice(0, 10)}` : ''}` : 'No se anotó: texto vacío.';
      }
      case 'cerrar_pendiente': {
        const p = await memoria.cerrarPendiente(String(entrada.id || ''), ctx.miembro.correo);
        return p ? `Cerrado: ${p.texto}` : 'No existe un pendiente con ese id.';
      }
      case 'crear_documento': {
        if (!entrada.titulo || !entrada.markdown) return 'Faltan titulo o markdown.';
        const d = await memoria.guardarDocumento({
          titulo: entrada.titulo, tipo: entrada.tipo || 'otro', markdown: entrada.markdown,
          miembro: ctx.miembro.correo, conversacion: ctx.conversacionId, para: entrada.para || 'junta',
        });
        ctx.documentos.push({ _id: d._id, titulo: d.titulo, tipo: d.tipo });
        return `Documento guardado con id ${d._id}: «${d.titulo}». La persona puede bajarlo desde el panel.`;
      }
      case 'proponer_envio': {
        const quien = ctx.junta.find((j) =>
          j.correo.toLowerCase() === String(entrada.destinatario || '').toLowerCase()
          || j.nombre.toLowerCase().includes(String(entrada.destinatario || '').toLowerCase()));
        if (!quien) return `No hay ningún miembro de la junta que se llame «${entrada.destinatario}». Los miembros son: ${ctx.junta.map((j) => j.nombre).join(', ')}.`;
        if (entrada.canal === 'whatsapp' && !quien.whatsapp) return `${quien.nombre} no tiene WhatsApp registrado en la junta.`;
        if (!entrada.texto) return 'Falta el texto del mensaje.';
        const p = { id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, canal: entrada.canal === 'correo' ? 'correo' : 'whatsapp',
          a: { nombre: quien.nombre, correo: quien.correo, whatsapp: quien.whatsapp || null },
          asunto: entrada.asunto || null, texto: entrada.texto, propuestoPor: ctx.miembro.correo };
        ctx.envios.push(p);
        return `Envío preparado (${p.id}) por ${p.canal} a ${quien.nombre}. NO se ha mandado: la persona lo confirma en el panel.`;
      }
      case 'ordenex_mercado': {
        const par = String(entrada.mercado || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (!par) return 'Falta el mercado.';
        const base = vivo.CASAS.ordenex.api;
        const [mercados, libro, tratos, ref] = await Promise.all([
          leerJson(base + '/mercados'), leerJson(`${base}/mercados/${par}/libro`), leerJson(`${base}/mercados/${par}/tratos`), leerJson(`${base}/mercados/${par}/referencia`),
        ]);
        const m = Array.isArray(mercados) ? mercados.find((x) => x.mercado === par) : null;
        if (!m) return `Ordenex no tiene el mercado ${par}. Los que hay: ${Array.isArray(mercados) ? mercados.map((x) => x.mercado).join(', ') : 'no se pudieron leer'}.`;
        const l = [`Mercado ${par} (Ordenex, leído ahora):`];
        l.push(`- último trato: ${m.ultimo ? ori(m.ultimo) : 'ninguno'} · volumen 24 h: ${ori(m.vol24h || '0')} · mejor compra: ${m.mejorCompra ? ori(m.mejorCompra) : '—'} · mejor venta: ${m.mejorVenta ? ori(m.mejorVenta) : '—'}`);
        if (libro && !libro.error) {
          l.push(`- libro: ${(libro.compras || []).length} compras, ${(libro.ventas || []).length} ventas`);
          for (const [p, c] of (libro.compras || []).slice(0, 5)) l.push(`  · compra ${ori(p)} × ${ori(c)}`);
          for (const [p, c] of (libro.ventas || []).slice(0, 5)) l.push(`  · venta ${ori(p)} × ${ori(c)}`);
        }
        if (Array.isArray(tratos)) l.push(`- tratos recientes: ${tratos.length}${tratos.slice(0, 5).map((t) => `\n  · ${t.precio ? ori(t.precio) : '?'} × ${t.cantidad ? ori(t.cantidad) : '?'} ${t.en ? new Date(t.en).toISOString() : ''}`).join('')}`);
        if (ref && !ref.error) { const v = Array.isArray(ref.velas) && ref.velas.length ? ref.velas[ref.velas.length - 1] : null; l.push(`- referencia: ${ref.rotulo || ''} (${ref.fuente || '?'})${v ? ` · último cierre ${v[4]} ${ref.unidad || ''}` : ''}`); }
        l.push('Precios en ORIGEN; las cantidades en unidades del activo. Los 18 decimales ya están convertidos.');
        return l.join('\n');
      }
      case 'cadena_direccion': {
        const d = String(entrada.direccion || '').trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(d)) return 'Dirección inválida: tiene que ser 0x seguido de 40 caracteres hexadecimales.';
        const j = await leerJson(`${vivo.CASAS.ordenscan.api}/address/${d}`);
        if (!j || j.error) return `OrdenScan no contestó por esa dirección${j?.error ? ': ' + j.error : ''}.`;
        const l = [`Dirección ${d} en la cadena 5550 (vía OrdenScan):`, `- saldo nativo: ${ori(j.balance || '0')}`];
        for (const [sym, t] of Object.entries(j.tokensBalance || {})) l.push(`- ${sym} (${t.name || sym}): ${ori(t.balance || '0')}${t.contractAddress ? ' · contrato ' + t.contractAddress : ''}`);
        const tx = Array.isArray(j.transactions) ? j.transactions : [];
        l.push(`- transacciones: ${tx.length}`);
        for (const t of tx.slice(0, 5)) l.push(`  · ${t.hash || t.transactionHash || '?'} ${t.from ? 'de ' + t.from : ''} ${t.to ? 'a ' + t.to : ''} ${t.value ? ori(t.value) : ''}`.trim());
        return l.join('\n');
      }
      case 'ordenex_caja': return caja.contar(await caja.leer());
      case 'cadena_altura': {
        const [scan, v] = await Promise.all([leerJson(`${vivo.CASAS.ordenscan.api}/block/totalBlock`), vivo.leerConCache()]);
        return `Cadena 5550 · bloque ${v?.ordenex?.bloque5550 ?? 'no leído'} según Ordenex, ${scan?.blockTotal ?? 'no leído'} según OrdenScan (el explorador). Leído ahora. La 8532 es la cadena vieja, congelada desde el 10 de agosto: no se lee.`;
      }
      case 'aucorp_monedas': {
        const base = vivo.CASAS.aucorp.api;
        /* `sal`, no `salud`: arriba hay un módulo que se llama así y tapar su
           nombre aquí dentro es una trampa esperando a la próxima edición. */
        const [sal, mon] = await Promise.all([leerJson(base + '/salud'), leerJson(base + '/monedas')]);
        if (!sal) return 'AuCorp no contesta.';
        const l = [`AuCorp: ${sal.ok ? 'viva' : 'con problemas'} · tasas ${sal.tasas ? 'al día' : 'sin tasas'}${sal.tasasCuando ? ' (' + sal.tasasCuando + ')' : ''} · Genesis ${sal.genesis ? 'conectado' : 'no'} · sanciones cargadas: ${sal.sanciones?.registros ?? '?'} registros`];
        for (const m of mon?.monedas || []) l.push(`- ${m.codigo} ${m.nombre} (${m.pais})`);
        l.push('AuCorp es una FinTech: cuentas en moneda local. No es un banco y no hay «depósito asegurado».');
        return l.join('\n');
      }
      case 'genesis_salud': {
        const j = await leerJson(`${vivo.CASAS.genesis.api}/healthz`);
        if (!j) return 'Genesis ID no contesta.';
        const falta = j.cumplimiento?.falta || [];
        return `Genesis ID: ${j.estado || '?'} (${j.en || ''}). Cumplimiento ${j.cumplimiento?.completo ? 'completo' : 'incompleto'}${falta.length ? ':\n- ' + falta.join('\n- ') : '.'}`;
      }
      case 'nodo_salud': {
        const nodo = require('./cerebros/nodo');
        const s = await nodo.salud();
        if (!s?.vivo) return `El nodo no contesta${s?.porQue ? ': ' + s.porQue : ''}.`;
        return `Nodo vivo: modelo ${s.modelo || '?'} · contexto ${s.ctx || '?'} fichas · modelos cargados: ${(s.ollama?.modelos || []).join(', ') || '?'} · pedidos ${s.pedidos ?? '?'} · rechazados ${s.rechazados ?? '?'}.`;
      }
      case 'listar_documentos': {
        const docs = await memoria.documentos({ limite: 30 });
        if (!docs.length) return 'La biblioteca está vacía.';
        return docs.map((d) => `- [${d._id}] ${d.titulo} (${d.tipo || 'otro'}, ${d.miembro || '?'}, ${d.en ? new Date(d.en).toISOString().slice(0, 10) : ''})`).join('\n');
      }
      case 'leer_documento': {
        const d = await memoria.documento(String(entrada.id || '').trim());
        if (!d) return 'No hay un documento con ese id.';
        return `# ${d.titulo}\n(${d.tipo || 'otro'} · ${d.en ? new Date(d.en).toISOString().slice(0, 10) : ''})\n\n${String(d.markdown || '').slice(0, ctx.chico ? 6000 : 20000)}`;
      }
      case 'listar_pendientes': {
        const ps = await memoria.pendientes({ conHechos: entrada.conHechos === true, limite: 40 });
        if (!ps.length) return 'No hay pendientes.';
        return ps.map((p) => `- [${p._id}] ${p.estado === 'hecho' ? '(hecho) ' : ''}${memoria.rotuloVence(p)}${p.texto}${p.quien ? ' · le toca a ' + p.quien : ''}${p.tema ? ' · ' + p.tema : ''}${p.en ? ' · desde ' + new Date(p.en).toISOString().slice(0, 10) : ''}`).join('\n');
      }
      case 'cadena_5550_saldo': {
        const d = String(entrada.direccion || '').trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(d)) return 'Dirección inválida: tiene que ser 0x seguido de 40 caracteres hexadecimales.';
        const rpc = process.env.OG_CHAIN_PROVIDER || 'https://rpc.ordenglobal-rpc.com';
        const llamar = async (method, params) => {
          const r = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12_000) });
          const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
        };
        const nativo = BigInt(await llamar('eth_getBalance', [d, 'latest']));
        const l = [`Dirección ${d} en la cadena 5550 (leído ahora):`, `- ORIGEN: ${ori(nativo.toString())}`];
        const dato = '0x70a08231' + d.slice(2).toLowerCase().padStart(64, '0');
        for (const [sym, contrato] of Object.entries(TOKENS_5550)) {
          try { const v = BigInt(await llamar('eth_call', [{ to: contrato, data: dato }, 'latest']) || '0x0'); if (v > 0n) l.push(`- ${sym}: ${ori(v.toString())}`); } catch { /* un token que no contesta no tumba la lectura */ }
        }
        const n = parseInt(await llamar('eth_getTransactionCount', [d, 'latest']), 16);
        l.push(`- transacciones enviadas: ${n}`);
        return l.join('\n');
      }
      case 'cotizar': {
        const monto = Number(entrada.monto);
        if (!(monto > 0)) return 'El monto tiene que ser un número mayor que cero.';
        const v = await vivo.leerConCache();
        const precio = v?.origen?.origenUsd;
        if (!precio) return 'No hay precio de referencia ahora mismo.';
        if (entrada.sentido === 'venta') {
          const bruto = monto * precio, comision = bruto * 0.01;
          return `Venta de ${monto} ORIGEN a ${precio.toFixed(6)} USD: bruto ${bruto.toFixed(4)} USDT, comisión de salida del 1 % ${comision.toFixed(4)} USDT, recibe ${(bruto - comision).toFixed(4)} USDT. Precio de referencia leído ${v.leidoEn}.`;
        }
        return `Compra con ${monto} USDT a ${precio.toFixed(6)} USD por ORIGEN: recibe ${(monto / precio).toFixed(6)} ORIGEN (sin comisión de entrada). Precio de referencia leído ${v.leidoEn}.`;
      }
      case 'parte_del_dia': {
        const [v, pend, docs, g] = await Promise.all([vivo.leer(), memoria.pendientes({ limite: 40 }), memoria.documentos({ limite: 5 }), memoria.gasto()]);
        const l = [`PARTE DEL DÍA · ${fecha()}`, '', 'Casas:', vivo.paraElModelo(v)];
        l.push('', `Pendientes abiertos: ${pend.length}`);
        for (const p of pend.slice(0, 12)) l.push(`- [${p._id}] ${memoria.rotuloVence(p)}${p.texto}${p.quien ? ' · ' + p.quien : ''}`);
        l.push('', `Documentos recientes: ${docs.length}`);
        for (const d of docs) l.push(`- [${d._id}] ${d.titulo} (${d.tipo || 'otro'}, ${d.en ? new Date(d.en).toISOString().slice(0, 10) : ''})`);
        l.push('', `Gasto: hoy ${g.hoy.turnos} turnos · mes ${g.mes.turnos} turnos${g.mes.conPrecio ? ` · $${g.mes.dolares.toFixed(2)}` : ''}.`);
        return l.join('\n');
      }
      case 'buscar_conversaciones': {
        const q = String(entrada.consulta || '').trim().toLowerCase();
        if (q.length < 2) return 'Consulta demasiado corta.';
        const lista = await memoria.conversacionesDe(ctx.miembro.correo, { limite: 40 });
        const hallazgos = [];
        for (const c of lista) {
          const conv = await memoria.conversacion(c._id, ctx.miembro.correo);
          for (const t of conv?.turnos || []) {
            const tx = String(t.texto || '');
            const i = tx.toLowerCase().indexOf(q);
            if (i >= 0) { hallazgos.push(`- ${new Date(t.en || conv.tocado || conv.en).toISOString().slice(0, 10)} · ${t.rol === 'miembro' ? ctx.miembro.nombre : 'ULTRON'} en «${conv.titulo || 'sin título'}»: …${tx.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, ' ')}…`); }
            if (hallazgos.length >= 12) break;
          }
          if (hallazgos.length >= 12) break;
        }
        return hallazgos.length ? `Fragmentos que mencionan «${q}»:\n${hallazgos.join('\n')}` : `Ninguna conversación anterior menciona «${q}».`;
      }
      case 'olvidar': {
        const ok = await memoria.olvidar(String(entrada.id || ''), ctx.miembro.correo);
        return ok ? 'Memoria borrada.' : 'No hay una memoria con ese id que esta persona pueda borrar.';
      }
      case 'nube_estado': {
        if (!process.env.AWS_ACCESS_KEY_ID) return 'No hay credenciales de AWS configuradas: no puedo leer la nube.';
        const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
        const l = ['Máquinas de la casa en AWS (leído ahora):'];
        for (const region of ['us-east-1', 'us-east-2']) {
          try {
            const r = await new EC2Client({ region }).send(new DescribeInstancesCommand({}));
            for (const res of r.Reservations || []) for (const i of res.Instances || []) {
              const nombre = (i.Tags || []).find((t) => t.Key === 'Name')?.Value || i.InstanceId;
              l.push(`- ${nombre} (${i.InstanceId}, ${region}, ${i.InstanceType}): ${i.State?.Name}${i.PublicIpAddress ? ' · ' + i.PublicIpAddress : ''}`);
            }
          } catch (e) { l.push(`- ${region}: no se pudo leer (${String(e.message).slice(0, 80)})`); }
        }
        return l.length > 1 ? l.join('\n') : 'No hay máquinas visibles en us-east-1 ni us-east-2.';
      }
      case 'listar_archivos': {
        const arch = require('./archivos');
        const l = await arch.lista({ limite: 30 });
        if (!l.length) return 'Nadie ha subido ningún archivo todavía. En el panel se arrastra encima o se toca el clip.';
        return l.map((a) => {
          const kb = a.bytes > 1e6 ? `${(a.bytes / 1e6).toFixed(1)} MB` : `${Math.round(a.bytes / 1024)} KB`;
          /* Para una IMAGEN el rótulo se calcula aquí y no se saca del `porQue`
             guardado: los archivos que ya estaban en la base traen el aviso
             viejo —«no lleva texto que se pueda leer»—, y ese aviso es lo que
             hacía que el modelo ni lo intentara. Recalcularlo arregla también
             lo que se subió antes, sin tocar la base. */
          const esImagen = /^image\//.test(a.tipo || '');
          const leible = a.texto
            ? `${a.texto.length} letras de texto${a.recortado ? ' (recortado)' : ''}${esImagen ? ' (ya mirada)' : ''}`
            : esImagen
              ? 'IMAGEN — no tiene texto que extraer, pero SÍ se puede mirar: leer_archivo con este id y el cerebro describe lo que hay'
              : `SIN TEXTO — ${a.porQue}`;
          return `- [${a._id}] ${a.nombre} · ${kb} · subido por ${a.miembro || '?'} el ${a.en ? new Date(a.en).toISOString().slice(0, 10) : ''} · ${leible}`;
        }).join('\n');
      }
      case 'leer_archivo': {
        const arch = require('./archivos');
        const a = await arch.uno(String(entrada.id || '').trim());
        if (!a) return `No hay un archivo con id ${entrada.id}. Mirá cuáles hay con listar_archivos.`;
        if (!a.texto && /^image\//.test(a.tipo || '')) {
          /* VISIÓN. Una foto de una factura, una captura de pantalla, un
             mockup: hasta hoy «no tiene texto que leer» y ahí moría. Se le
             pide al cerebro que la mire y lo que dijo queda guardado con el
             archivo, así se mira una sola vez. */
          const d = await arch.describir(a._id, { pregunta: entrada.pregunta || null });
          return d ? `«${a.nombre}» (${a.tipo}) — lo que se ve:\n${d}` : `«${a.nombre}» es una imagen y no hay cerebro que la mire ahora mismo.`;
        }
        if (!a.texto) return `«${a.nombre}» no tiene texto que leer: ${a.porQue}`;
        /* Un archivo largo no entra de una en el contexto de un modelo chico.
           Se entrega por trozos y se DICE dónde se cortó, para que el modelo
           pueda pedir el siguiente en vez de dar por terminado el documento a
           la mitad — que es como se resume mal un contrato. */
        const tope = ctx.chico ? 6000 : 20000;
        const desde = Math.max(0, Number(entrada.desde) || 0);
        const trozo = a.texto.slice(desde, desde + tope);
        const queda = a.texto.length - (desde + trozo.length);
        ctx.fuentes.push({ id: 'archivo:' + a._id, titulo: a.nombre, fuente: 'archivo subido por la junta' });
        return `# ${a.nombre}\n(${a.tipo} · subido por ${a.miembro || '?'}${desde ? ` · desde la letra ${desde}` : ''})\n\n${trozo}`
          + (queda > 0 ? `\n\n[Quedan ${queda} letras. Para seguir: leer_archivo con desde=${desde + trozo.length}.]` : '');
      }
      case 'quien_es_quien': {
        /* Sin esto, «mandale el memo a Ramírez» terminaba en un intento a
           ciegas: proponer_envio buscaba el nombre, no lo encontraba y recién
           ahí devolvía la lista. Una herramienta que solo enseña la lista
           cuando ya fallaste es una lista que llega tarde. */
        const j = ctx.junta || [];
        if (!j.length) return 'La junta no está cargada en este momento.';
        return [`La Junta Directiva son ${j.length} personas:`,
          ...j.map((m) => `- ${m.nombre}${m.rol ? ` · ${m.rol}` : ''} · correo ${m.correo}${m.whatsapp ? ` · WhatsApp ${m.whatsapp}` : ' · sin WhatsApp registrado'}${m.correo === ctx.miembro?.correo ? ' · (es con quien estás hablando ahora)' : ''}`),
          'Solo se le puede proponer un envío a alguien de esta lista, y por una vía que tenga registrada.'].join('\n');
      }
      case 'exportar_pdf': {
        const d = await memoria.documento(String(entrada.id || '').trim());
        if (!d) return `No hay un documento con id ${entrada.id}. Mirá cuáles hay con listar_documentos.`;
        ctx.acciones.push({ tipo: 'abrir', nombre: `${d.titulo} (PDF)`,
          url: `/documentos/${d._id}/descargar?formato=pdf`, porQue: entrada.porQue || null });
        return `Le puse a la persona un botón para bajar «${d.titulo}» en PDF, con la cabecera de Orden Global, la fecha, el sello de ${d.para === 'fuera' ? 'para fuera de la junta' : 'uso interno'} y el pie numerado. Sirve para adjuntar a un correo o imprimir.`;
      }
      case 'calcular': {
        return calcular(String(entrada.expresion || ''));
      }
      case 'gasto': {
        const g = await memoria.gasto();
        const f = (c) => `${c.turnos} turnos · ${c.entrada + c.salida} fichas · ${c.conPrecio ? '$' + c.dolares.toFixed(4) : 'dólares incompletos'}`;
        return `Hoy: ${f(g.hoy)}. Últimos 30 días: ${f(g.mes)}. En el nodo propio el pensar no cuesta por pregunta.`;
      }
      // ── la mano derecha ─────────────────────────────────────────────────
      case 'repo_llave': return await taller.llave(entrada);
      case 'repo_arbol': return await taller.arbol(entrada);
      case 'repo_leer': return await taller.leer(entrada);
      case 'repo_buscar': return await taller.buscar(entrada);
      case 'repo_proponer_cambio': {
        const r = await taller.proponerCambio({ ...entrada, por: ctx.miembro?.nombre || ctx.miembro?.correo });
        ctx.acciones.push({ tipo: 'pr', url: r.pr, rama: r.rama });
        return `Cambio propuesto: rama ${r.rama}, pull request #${r.numero} → ${r.pr}. Archivos: ${r.archivos.join(', ')}. Lo mezcla una persona después de leerlo.`;
      }
      case 'terminal': return await taller.terminal(entrada);
      case 'desplegarse': {
        const pasos = [];
        const r = await taller.desplegarse({ ...entrada, avisar: (m) => pasos.push(m) });
        ctx.acciones.push({ tipo: 'despliegue', ...r });
        return `Desplegado ${r.app} desde ${r.rama} (${r.commit}). ${pasos.join(' · ')}. El servidor se reinicia solo con la versión nueva.`;
      }
      case 'boveda_listar': {
        const l = await boveda.listar();
        if (!boveda.encendida()) return 'La bóveda está APAGADA: falta ULTRON_BOVEDA_LLAVE en el entorno (32 bytes en hex). Hasta que se ponga no se puede guardar ningún secreto.';
        if (!l.length) return 'La bóveda está vacía. Los secretos se guardan desde el panel (el dueño, con el formulario de la bóveda), nunca por aquí.';
        return l.map((x) => `- ${x.nombre}: ${x.largo} caracteres${x.corto ? ' (CORTO)' : ''} · ${x.dias} días desde la última rotación${x.aplicadoEn.length ? ' · en ' + x.aplicadoEn.map((a) => `${a.app}:${a.variable}`).join(', ') : ' · sin aplicar en ninguna app'}${x.nota ? ' · ' + x.nota : ''}`).join('\n');
      }
      case 'boveda_aplicar': {
        const r = await boveda.aplicarEnHeroku(entrada);
        ctx.acciones.push({ tipo: 'secreto_aplicado', app: r.app, variable: r.variable });
        return `Puesto: ${r.variable} en ${r.app} desde la bóveda. La app se reinicia sola con la variable nueva.`;
      }
      case 'aprender': {
        const m = await aprender.aprender({ texto: entrada.texto, dichoPor: ctx.miembro?.nombre || ctx.miembro?.correo, miembro: ctx.miembro?.correo });
        ctx.memorias.push(m);
        return `Aprendido: «${m.texto}». Manda sobre las fichas viejas desde ahora.`;
      }
      case 'habilidad_usar': {
        const h = await aprender.usar(entrada.nombre);
        return `## Habilidad «${h.nombre}»${h.origen === 'aprendida' ? ' (aprendida, v' + h.version + ')' : ''}\nCuándo: ${h.cuando}\n\n${h.contenido}`;
      }
      case 'habilidad_crear': {
        const h = await aprender.crear({ ...entrada, por: ctx.miembro?.correo });
        return `Habilidad «${h.nombre}» guardada (versión ${h.version}). Queda en la base; para que vaya al repositorio y la lea alguien, habilidad_publicar.`;
      }
      case 'habilidad_publicar': {
        const h = await aprender.usar(entrada.nombre);
        const r = await taller.proponerCambio({
          titulo: `Habilidad de ULTRON: ${h.nombre}`, descripcion: `Cuándo se usa: ${h.cuando}\n\nEscrita por ULTRON y aprobada por el dueño.`,
          archivos: [{ ruta: `infra/ultron/habilidades/${h.nombre}.md`, contenido: aprender.comoArchivo(h) }], por: ctx.miembro?.nombre || ctx.miembro?.correo,
        });
        await aprender.marcarPublicada(h.nombre);
        return `Habilidad «${h.nombre}» publicada como pull request: ${r.pr}.`;
      }
      case 'equipo_estado': {
        const e = equipo.estado();
        return `Equipo ${e.encendido ? 'ENCENDIDO' : 'apagado (ULTRON_EQUIPO no está en «on»; se corren a mano)'} · ${e.vueltasHoy}/${e.tope} vueltas hoy\n`
          + e.bots.map((b) => `- ${b.nombre}: ${b.descripcion} · ${b.cada ? `cada ${b.cada} h` : 'solo a mano'}${b.ultimaVuelta ? ` · última ${new Date(b.ultimaVuelta).toISOString()}` : ''}${b.corriendo ? ' · CORRIENDO' : ''}`).join('\n');
      }
      case 'equipo_partes': {
        const desde = entrada.horas ? new Date(Date.now() - Number(entrada.horas) * 3600_000) : null;
        const l = await equipo.partes({ bot: entrada.bot || null, limite: Math.min(20, Number(entrada.limite) || 6), desde });
        if (!l.length) return 'No hay partes todavía.';
        return l.map((p) => `### ${p.bot} · ${new Date(p.en).toISOString()}${p.fallo ? ' · FALLÓ' : ''}\n${p.texto}`).join('\n\n');
      }
      case 'equipo_correr': {
        const p = await equipo.correr(entrada.bot, { pensar: ctx.pensar, junta: ctx.junta || [], pedidoPor: ctx.miembro?.correo || 'panel' });
        return `Parte de ${p.bot} (${p.ms} ms${p.dolares ? `, ${p.dolares.toFixed(4)} USD` : ''}):\n${p.texto}`;
      }
      case 'auditar_dependencias': return await auditarDependencias();
      // ── operaciones: Heroku, nodos, bases ───────────────────────────────
      case 'heroku_apps': return await operaciones.herokuApps();
      case 'heroku_registro': return await operaciones.herokuRegistro(entrada);
      case 'heroku_variables': return await operaciones.herokuVariables(entrada);
      case 'heroku_reiniciar': {
        const r = await operaciones.herokuReiniciar(entrada);
        ctx.acciones.push({ tipo: 'reinicio', app: r.app });
        return `Reiniciados los dynos de ${r.app} (${r.en}). En un minuto conviene mirar estado_vivo para confirmar que levantó.`;
      }
      case 'nodos': {
        const l = await operaciones.nodos({ fresco: !!entrada.fresco });
        return l.map((n) => `- ${n.corto ? n.corto + ' · ' : ''}${n.nombre} · ${n.id || '?'} · ${n.region} · ${n.estado}${n.tipo ? ' · ' + n.tipo : ''}${n.ip ? ' · ' + n.ip : ''}`).join('\n');
      }
      case 'nodo_comando': return await operaciones.nodoComando(entrada);
      case 'mongo_consultar': return await operaciones.mongoConsultar(entrada);
      case 'clima': return await mundo.clima(entrada);
      case 'hora': return mundo.hora(entrada);
      case 'avisar_junta': {
        const r = await avisos.avisar({ clave: `pedido:${Date.now()}`, gravedad: entrada.gravedad === 'grave' ? 'grave' : 'leve', titulo: String(entrada.titulo || '').slice(0, 120),
          lineas: [String(entrada.texto || '').slice(0, 2000), '', `— pedido por ${ctx.miembro?.nombre || ctx.miembro?.correo}`], forzar: true });
        ctx.acciones.push({ tipo: 'aviso', canales: r.canales });
        return r.enviado ? `Avisado por ${r.canales.join(', ')}.` : `No salió: ${r.motivo || 'sin canal'}. Los avisos están en modo «${avisos.MODO()}».`;
      }
      case 'bitacora': {
        const l = await bitacora.leer({ limite: Math.min(100, Math.max(1, Number(entrada.limite) || 30)), herramienta: entrada.herramienta || null, quien: entrada.quien || null, desde: entrada.desde || null });
        if (!l.length) return 'La bitácora está vacía para ese filtro.';
        return l.map((a) => `- ${new Date(a.cuando).toISOString().slice(0, 16).replace('T', ' ')} · ${a.ok ? 'ok' : 'FALLÓ'} · ${a.herramienta} · ${a.quien}${a.canal ? ' (' + a.canal + ')' : ''}${a.entrada ? ' · ' + a.entrada : ''}${a.motivo ? ' · ' + a.motivo.slice(0, 120) : ''}${a.ms ? ' · ' + a.ms + ' ms' : ''}`).join('\n');
      }
      // ── la salud del propio ULTRON ──────────────────────────────────────
      case 'salud_revisar': {
        const r = await salud.revisar();
        const linea = (s) => `${s.estado === 'bien' ? '·' : s.estado === 'ojo' ? '!' : '✗'} ${s.que}: ${s.dato}${s.detalle ? ` — ${s.detalle}` : ''}`;
        return `NOTA ${r.puntaje}/100 (${r.estado})\n${r.signos.map(linea).join('\n')}`
          + (r.arreglos.length ? `\n\nSe puede arreglar solo: ${r.arreglos.join(', ')} (salud_reparar).` : '\n\nNo hay nada que reparar.');
      }
      case 'salud_reparar': {
        const r = await salud.reparar(Array.isArray(entrada.arreglos) ? entrada.arreglos : null);
        ctx.acciones.push({ tipo: 'salud', antes: r.antes, despues: r.despues });
        if (!r.hechos.length) return `No hacía falta reparar nada. Nota ${r.despues}/100.`;
        return `Nota ${r.antes} → ${r.despues}/100.\n${r.hechos.map((h) => `- ${h}`).join('\n')}`;
      }
      case 'salud_historial': {
        const l = await salud.historial({ limite: Math.min(60, Math.max(1, Number(entrada.limite) || 12)) });
        if (!l.length) return 'Todavía no hay rondas de salud guardadas.';
        return l.map((r) => `- ${new Date(r.cuando).toISOString().slice(0, 16).replace('T', ' ')} · ${r.puntaje}/100 (${r.estado})`
          + (r.reparado?.length ? ` · reparado: ${r.reparado.join('; ')}` : '')).join('\n');
      }
      case 'autorizaciones': {
        const l = await permisos.lista({ estado: entrada.estado || null, limite: 20 });
        if (!l.length) return 'No hay pedidos de autorización.';
        return l.map((p) => `- [${p.estado}] ${String(p._id).slice(-6)} · ${p.resumen} · pedido por ${p.pedidoPor} · ${new Date(p.en).toISOString()}${p.motivo ? ' · ' + p.motivo : ''}`).join('\n');
      }
      default:
        return `No existe la herramienta ${nombre}. Las que hay: ${DEFINICIONES.map((d) => d.name).join(', ')}.`;
    }
  } catch (e) {
    return `La herramienta ${nombre} falló: ${String(e?.message || e).slice(0, 200)}`;
  }
}

// ── Auxiliares de las manos sobre el ecosistema ─────────────────────────────

/* Lo que cualquier bot tiene aunque su encabezado no lo diga: mirar sus
   propios partes y anotar. Sin esto habría que repetirlas en cada archivo. */
const SIEMPRE_PARA_BOTS = new Set(['equipo_partes', 'anotar_pendiente', 'recordar', 'buscar_saber', 'habilidad_usar']);

/* npm audit sobre el propio paquete de ULTRON. Solo lee. Corre con el
   entorno mínimo y sin red hacia la casa: npm consulta su registro y nada más. */
async function auditarDependencias() {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const { join } = require('node:path');
  try {
    const { stdout } = await promisify(execFile)('npm', ['audit', '--json', '--omit=dev'], {
      cwd: join(__dirname, '..'), timeout: 90_000, maxBuffer: 4_000_000, env: { PATH: process.env.PATH, HOME: process.env.HOME || '/tmp' },
    });
    return resumirAudit(stdout);
  } catch (e) {
    if (e.stdout) return resumirAudit(e.stdout);   // npm audit sale con 1 cuando hay fallos: la salida sigue siendo válida
    return `No se pudo auditar: ${String(e.message).slice(0, 200)}`;
  }
}
function resumirAudit(json) {
  let d; try { d = JSON.parse(json); } catch { return 'npm audit no devolvió JSON legible.'; }
  const v = d.metadata?.vulnerabilities || {};
  const total = Object.values(v).reduce((a, b) => a + (b || 0), 0);
  if (!total) return 'Sin fallos conocidos en las dependencias de ULTRON.';
  const lista = Object.entries(d.vulnerabilities || {}).filter(([, x]) => ['critical', 'high', 'moderate'].includes(x.severity)).slice(0, 15)
    .map(([n, x]) => `- ${n} · ${x.severity}${x.fixAvailable ? ' · arreglo disponible' + (x.fixAvailable.version ? ' (' + x.fixAvailable.name + '@' + x.fixAvailable.version + ')' : '') : ' · sin arreglo publicado'}`);
  return `Fallos conocidos: ${total} (críticos ${v.critical || 0}, altos ${v.high || 0}, moderados ${v.moderate || 0}, bajos ${v.low || 0}).\n${lista.join('\n')}`;
}

/** Los tokens de la casa en la 5550, para leer saldos. Contratos públicos. */
const TOKENS_5550 = {
  AUKA: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B', AGKA: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B',
  ONDK: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1', MNKA: '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead',
};
const fecha = () => new Date().toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Tegucigalpa' });

/** GET JSON con plazo; null si no contesta o no es JSON. */
async function leerJson(url) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return r.ok ? null : { error: `HTTP ${r.status}` }; }
  } catch (e) { return { error: String(e?.message || e).slice(0, 80) }; }
}

/** Un entero de 18 decimales (wei) a número legible. Acepta números normales. */
function ori(v) {
  const s = String(v ?? '0').trim();
  if (!/^\d+$/.test(s)) return s;
  if (s.length <= 12) return s;                            // ya viene en unidades
  const ent = s.slice(0, -18) || '0', dec = s.slice(-18).padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return Number(ent).toLocaleString('en-US') + (dec ? '.' + dec : '');
}

/** Aritmética exacta y nada más: sin nombres, sin llamadas, sin trucos. */
function calcular(expresion) {
  const e = expresion.replace(/,/g, '').replace(/\s+/g, '').replace(/\^/g, '**').replace(/×/g, '*').replace(/÷/g, '/');
  if (!e) return 'Expresión vacía.';
  if (!/^[0-9.+\-*/%()]+$/.test(e) || /[a-zA-Z_$]/.test(e)) return 'Solo números y + - * / % ^ ( ).';
  if (e.length > 200) return 'Expresión demasiado larga.';
  try {
    const r = Function(`"use strict"; return (${e});`)();
    if (typeof r !== 'number' || !Number.isFinite(r)) return 'No da un número.';
    return `${expresion.trim()} = ${Number.isInteger(r) ? r : r.toPrecision(10).replace(/\.?0+$/, '')}`;
  } catch { return 'No pude calcular eso.'; }
}

/** Cómo se agrupan en la consola: la persona ve las manos por lo que tocan. */
const GRUPOS = {
  'La casa, en vivo': ['estado_vivo', 'parte_del_dia', 'cotizar', 'nodo_salud', 'nube_estado'],
  'El mundo de afuera': ['clima', 'hora'],
  'Ordenex y las cadenas': ['ordenex_caja', 'ordenex_mercado', 'cadena_altura', 'cadena_direccion', 'cadena_5550_saldo'],
  'Las otras casas': ['aucorp_monedas', 'genesis_salud'],
  'El saber y la memoria': ['buscar_saber', 'buscar_conversaciones', 'recordar', 'olvidar'],
  /* `exportar_pdf` estaba en «Acciones que confirma la persona», o sea en OTRA
     caja que la de crear el documento. Hacer un PDF pedía entonces cuatro
     vueltas: abrir la caja de documentos, crearlo, abrir la caja de acciones,
     exportarlo. El 7-sep se vio lo que pasa de verdad: ULTRON abrió DOS cajas,
     se quedó sin vueltas y contestó «Listo, le dejo el PDF en el chat» sin
     haber creado nada. Crear un documento y dejarlo en PDF son el mismo
     trabajo y ahora viven en la misma caja: una sola vuelta los trae. */
  'Pendientes y documentos': ['listar_pendientes', 'anotar_pendiente', 'cerrar_pendiente', 'listar_documentos', 'leer_documento', 'crear_documento', 'exportar_pdf'],
  'Internet': ['buscar_web', 'leer_pagina'],
  'La junta': ['quien_es_quien'],
  'Lo que le mandan': ['listar_archivos', 'leer_archivo'],
  'Acciones que confirma la persona': ['abrir', 'proponer_envio'],
  'Cuentas': ['calcular', 'gasto'],
  'El taller (repositorio, terminal, despliegue)': ['repo_llave', 'repo_arbol', 'repo_leer', 'repo_buscar', 'repo_proponer_cambio', 'terminal', 'desplegarse'],
  'La bóveda': ['boveda_listar', 'boveda_aplicar'],
  'Aprender': ['aprender', 'habilidad_usar', 'habilidad_crear', 'habilidad_publicar'],
  'El equipo': ['equipo_estado', 'equipo_partes', 'equipo_correr', 'auditar_dependencias', 'autorizaciones'],
  'Operaciones (Heroku, nodos, bases)': ['heroku_apps', 'heroku_registro', 'heroku_variables', 'heroku_reiniciar', 'nodos', 'nodo_comando', 'mongo_consultar'],
  'Su propia salud': ['salud_revisar', 'salud_reparar', 'salud_historial', 'bitacora'],
  'Hacia fuera': ['avisar_junta'],
};

/* ══ LAS DOCE A LA MANO, Y UNA PUERTA PARA EL RESTO ══════════════════════════
 * ── EL PROBLEMA, MEDIDO ─────────────────────────────────────────────────────
 * Las 64 herramientas se le mandaban al modelo EN CADA PREGUNTA. Medido el
 * 6-sep: 6 622 fichas de catálogo, de un presupuesto total de 8 188. El 81 %
 * de lo que el modelo leía antes de leer la pregunta eran herramientas que esa
 * pregunta no iba a usar. Para decir «hola» leía cómo desplegarse a Heroku.
 * Eso son los quince segundos que José veía: «se traba, no analiza a tiempo».
 *
 * ── LA DECISIÓN, QUE ES SUYA ────────────────────────────────────────────────
 * «Las 12 herramientas siempre y las demás cuando se ocupen.» Doce a la mano,
 * y el resto en cajas que se abren pidiéndolas.
 *
 * ── POR QUÉ ASÍ Y NO ADIVINANDO ─────────────────────────────────────────────
 * La manera fácil habría sido mirar la pregunta con unas palabras clave y
 * cargar las cajas que peguen. No se hace, y por un motivo: cuando falla, falla
 * EN SILENCIO. ULTRON contestaría «no puedo hacer eso» de algo que sí puede, y
 * ni él ni nadie sabría por qué. Un asistente que a veces miente sobre lo que
 * sabe hacer es peor que uno lento.
 *
 * Así que decide el modelo, no una lista de palabras: lleva escrito qué cajas
 * existen y qué hay en cada una, y cuando le falta algo pide la caja con
 * `mas_herramientas` y sigue en el mismo turno. Cuesta una vuelta más —sobre un
 * encabezado corto, o sea rápida— y a cambio nunca se pierde una capacidad sin
 * que se note.
 *
 * ── QUÉ ENTRA EN LAS DOCE ───────────────────────────────────────────────────
 * Lo de todos los días, sacado de lo que José pregunta de verdad: cómo está la
 * casa, el tiempo y la hora, buscar en el saber y en internet, los pendientes,
 * recordar, la caja de Ordenex y los documentos que sube. Se cambia sin tocar
 * código con ULTRON_NUCLEO, por si con el uso resulta que sobra una y falta
 * otra. */
const NUCLEO_DE_FABRICA = [
  'estado_vivo',                                      // cómo está la casa
  'clima', 'hora',                                    // lo que pidió para el saludo
  'buscar_saber', 'buscar_web',                       // dónde se buscan las respuestas
  'listar_pendientes', 'anotar_pendiente', 'cerrar_pendiente',
  'recordar',                                         // la memoria de la junta
  'ordenex_caja',                                     // los saldos, que mira a diario
  'listar_archivos', 'leer_archivo',                  // lo que sube a la pantalla
];
const NUCLEO = new Set((process.env.ULTRON_NUCLEO || '').trim()
  ? process.env.ULTRON_NUCLEO.split(',').map((x) => x.trim()).filter(Boolean)
  : NUCLEO_DE_FABRICA);

/* Las cajas. El nombre corto es lo que el modelo escribe para pedirla; el texto
   es lo que lee para saber si es la que necesita, así que dice QUÉ SE PUEDE
   HACER, no cómo se llama el grupo. */
const CAJAS = {
  cadenas: { grupos: ['Ordenex y las cadenas', 'Las otras casas'], que: 'mercados de Ordenex, altura de la cadena, saldo de una dirección, monedas de AuCorp, salud de Genesis' },
  documentos: { grupos: ['Pendientes y documentos'], que: 'listar, leer y CREAR documentos de la biblioteca de la junta' },
  taller: { grupos: ['El taller (repositorio, terminal, despliegue)'], que: 'leer el repositorio, buscar en el código, proponer un cambio, la terminal, desplegarse' },
  operaciones: { grupos: ['Operaciones (Heroku, nodos, bases)'], que: 'Heroku (apps, registro, variables, reiniciar), las máquinas de AWS, consultar una base' },
  equipo: { grupos: ['El equipo'], que: 'los bots de la casa, sus partes, correrlos, auditar dependencias, ver autorizaciones' },
  salud: { grupos: ['Su propia salud'], que: 'la salud de ULTRON, repararla, su historial y la bitácora de lo que hizo' },
  boveda: { grupos: ['La bóveda'], que: 'listar las llaves guardadas y aplicarlas en Heroku (nunca enseña un valor)' },
  aprender: { grupos: ['Aprender'], que: 'aprender una lección, usar, crear o publicar una habilidad' },
  memoria: { grupos: ['El saber y la memoria'], que: 'buscar en conversaciones viejas y olvidar una memoria' },
  /* `buscar_web` va en las doce, pero `leer_pagina` no cabía, y sin caja se
     quedaba inalcanzable: buscar y no poder abrir lo que se encuentra es media
     herramienta. Lo cazó la prueba que comprueba que se llega a las 64. */
  internet: { grupos: ['Internet'], que: 'abrir y leer una página web entera, cuando el resumen de la búsqueda no alcanza' },
  cuentas: { grupos: ['Cuentas', 'La casa, en vivo'], que: 'calcular, el gasto en fichas, cotizar ORIGEN, el parte del día, la salud del nodo y de la nube' },
  personas: { grupos: ['La junta'], que: 'quién es quién en la junta directiva' },
  acciones: { grupos: ['Acciones que confirma la persona'], que: 'ponerle un botón para abrir una casa o un documento, exportar un PDF, proponer un envío' },
  avisar: { grupos: ['Hacia fuera'], que: 'avisar a la junta por WhatsApp o correo (sale de la casa; pide autorización)' },
};

const enCaja = (caja) => (CAJAS[caja]?.grupos || []).flatMap((g) => GRUPOS[g] || []);
/** Las cajas que valen la pena ofrecer: las que tienen algo fuera del núcleo. */
const CAJAS_UTILES = Object.keys(CAJAS).filter((c) => enCaja(c).some((n) => !NUCLEO.has(n)));
/** El índice que lee el modelo para saber qué puede pedir. */
const indiceDeCajas = () => CAJAS_UTILES.map((c) => `${c} (${CAJAS[c].que})`).join('; ');

const ABRIR = {
  name: 'mas_herramientas',
  get description() {
    return 'Abre una caja de herramientas que ahora mismo no tenés a la vista, y quedan usables EN ESTE MISMO TURNO. '
      + 'Llevás a mano solo las doce de todos los días; todo lo demás está en cajas. '
      + 'REGLA: si para contestar hace falta algo que no ves en tu lista, NO contestás que no podés — pedís la caja y seguís. '
      + `Las cajas son: ${indiceDeCajas()}.`;
  },
  input_schema: {
    type: 'object',
    properties: { caja: { type: 'string', enum: CAJAS_UTILES, description: 'cuál se abre' } },
    required: ['caja'],
  },
};

/** El catálogo para la consola: definición, grupo y si escribe algo. */
function catalogo() {
  const grupoDe = (n) => Object.entries(GRUPOS).find(([, l]) => l.includes(n))?.[0] || 'Otras';
  return DEFINICIONES.map((d) => ({ nombre: d.name, descripcion: d.description, entrada: d.input_schema, grupo: grupoDe(d.name), escribe: ESCRIBEN.has(d.name) }));
}

/**
 * Las definiciones en el formato de Ollama: el núcleo, lo de las cajas ya
 * abiertas en este turno, y la puerta para abrir las que falten.
 * Sin `cajas`, van solo las doce y la puerta — que es el caso de siempre.
 */
function paraOllama({ cajas = [] } = {}) {
  const abiertas = new Set();
  for (const c of cajas) for (const n of enCaja(c)) abiertas.add(n);
  const quedan = CAJAS_UTILES.filter((c) => !cajas.includes(c));
  const lista = DEFINICIONES.filter((d) => NUCLEO.has(d.name) || abiertas.has(d.name));
  /* La puerta solo se ofrece si queda algo detrás: enseñarla con todo abierto
     es invitar a una vuelta que no lleva a ningún sitio. */
  if (quedan.length) lista.push(ABRIR);
  return lista.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.input_schema } }));
}

/** Las definiciones que ve un actor: un bot solo las de su encabezado (más las de todos). */
function definicionesPara(actor) {
  if (actor?.rol === 'bot' && Array.isArray(actor.herramientas) && actor.herramientas.length) {
    return DEFINICIONES.filter((d) => actor.herramientas.includes(d.name) || SIEMPRE_PARA_BOTS.has(d.name));
  }
  return DEFINICIONES;
}

module.exports = { DEFINICIONES, CASAS, GRUPOS, ESCRIBEN, SIEMPRE_PARA_BOTS, catalogo, correr, correrLote, paraOllama, definicionesPara, buscarWeb, leerPagina,
  NUCLEO, CAJAS, CAJAS_UTILES, enCaja, indiceDeCajas, ABRIR,
  _adentro: { limpiarHtml, ori, calcular, leerJson, afinarConsulta, resumirAudit } };
