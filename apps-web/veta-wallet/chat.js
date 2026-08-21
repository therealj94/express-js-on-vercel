/* El cliente del relevo de mensajes — PULSE2CHAT en el navegador.
 *
 * El mismo servidor que usa el telefono (infra/mensajes, en el nodo del
 * cerebro): identidad = el correo de la cuenta de la wallet, y una llave que
 * el relevo acuña en el alta y que firma cada peticion despues.
 *
 * Aqui no hay pantalla: solo hablar con el relevo. Las vistas viven en app.js,
 * igual que cadena.js no sabe dibujar una moneda.
 *
 * NO hay cifrado de punta a punta en esta version, y no se promete en ningun
 * texto de la interfaz. Decirlo aqui es mas barato que descubrirlo despues.
 */
const CHAT = (() => {
  'use strict';

  // El relevo de siempre. Se puede apuntar a otro —definiendo
  // OG_MENSAJES_API antes de este archivo— para probarlo contra un relevo
  // local sin tocar el de produccion, igual que OG_CHAIN_ID con la cadena.
  const BASE = String(window.OG_MENSAJES_API || 'https://cerebro.ordenscan.com/mensajes')
    .replace(/\/$/, '');

  // La llave va ATADA AL CORREO. Guardarla en una sola etiqueta global rompe a
  // quien entra con otra cuenta en el mismo navegador: el relevo recibe la
  // llave de la cuenta anterior, no la reconoce, y todo responde 401 para
  // siempre. En el telefono ese fallo existio; aqui no hace falta repetirlo.
  const donde = correo => 'veta.chat.llave.' + String(correo || '').toLowerCase();

  let yo = null;      // {correo, nombre, addr, gid}
  let llave = null;

  const guardar = (correo, k) => { try { localStorage.setItem(donde(correo), k); } catch {} };
  const leer = correo => { try { return localStorage.getItem(donde(correo)); } catch { return null; } };
  const olvidarLlave = correo => { try { localStorage.removeItem(donde(correo)); } catch {} };

  async function pedir(ruta, cuerpo, ms = 15000) {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(BASE + ruta, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(d.error || 'http ' + res.status);
        e.code = res.status;
        throw e;
      }
      return d;
    } finally { clearTimeout(reloj); }
  }

  /* El alta SIEMPRE se espera y SIEMPRE se lee la respuesta. Cuando el correo
     es nuevo, el relevo ignora la llave que le mandes y acuña la suya: si no
     se lee lo que devuelve, la web se queda usando una llave que el servidor
     jamas acepto — y todo contesta 401 con la conexion perfecta. */
  async function alta(cuenta) {
    const correo = String(cuenta.correo || '').toLowerCase();
    yo = { correo, nombre: cuenta.nombre || '', addr: cuenta.direccion || '' };
    if (cuenta.gid) yo.gid = cuenta.gid;
    const g = leer(correo);
    /* La sesion de la wallet viaja SIEMPRE que exista: es la prueba de
       identidad que le permite al relevo devolver la llave existente cuando
       este navegador no la tiene — el arreglo de raiz del «tu chat esta en
       otro lado». Con llave local igual se manda: no molesta y cubre el caso
       de una llave local vieja que el relevo ya no reconoce. */
    const cuerpo = { ...yo };
    if (g) cuerpo.llave = g;
    if (cuenta.sesion) cuerpo.sesion = cuenta.sesion;
    const d = await pedir('/alta', cuerpo);
    llave = (d && d.llave) || g;
    if (llave) guardar(correo, llave);
    return llave;
  }

  /* Cuando el relevo dice 401, la llave guardada ya no sirve. Se tira y se
     pide una nueva. Si el correo no tiene dueño, esto lo deja funcionando solo.
     Si YA lo tiene (otro navegador se lo quedo), el relevo responde 409: eso no
     se arregla desde aqui y hay que decirlo en pantalla, no reintentar en
     bucle. */
  async function rehacerAlta(cuenta) {
    olvidarLlave(cuenta.correo);
    llave = null;
    return alta(cuenta);
  }

  const firmado = extra => ({ correo: yo?.correo, llave, ...extra });

  const listo = () => !!(yo?.correo && llave);
  const quienSoy = () => (yo ? { ...yo } : null);

  // ── lo que se usa a diario ──────────────────────────────────────────────
  const conversaciones = () => pedir('/conversaciones', firmado({})).then(d => d.conversaciones || []);
  const bandeja = desde => pedir('/bandeja', firmado({ desde })).then(d => d.mensajes || []);
  /** Mandar. `cita` es el id del mensaje al que se responde, si se responde. */
  const enviar = (para, texto, cita) =>
    pedir('/enviar', firmado({ para, texto, ...(cita ? { cita } : {}) }));

  /** Reaccionar. Tocar la misma reacción otra vez la quita. */
  const reaccionar = (id, emoji) => pedir('/reaccion', firmado({ id, emoji }));

  /* «Está escribiendo…». No se guarda en ningún sitio: viaja por el buzón de
     señales, que vive en memoria y se vacía solo. Se avisa como mucho una vez
     cada dos segundos — una petición por tecla sería ruido para el relevo y
     no cambiaría nada en pantalla. */
  let ultimoAviso = 0;
  function escribiendo(para) {
    const ahora = Date.now();
    if (ahora - ultimoAviso < 2000) return;
    ultimoAviso = ahora;
    pedir('/escribiendo', firmado({ para })).catch(() => null);
  }

  /* Un adjunto va en dos tiempos: primero el binario sube y devuelve su id, y
     despues el mensaje referencia ese id. Asi un adjunto reintentado no
     duplica megas en el hilo. El tope es 8MB y se comprueba aqui tambien, para
     no gastar la subida entera antes de que el relevo diga que no. */
  const TOPE = 8_000_000;

  function tipoDe(mime) {
    const m = String(mime || '');
    return m.startsWith('image/') ? 'imagen' : m.startsWith('video/') ? 'video' : 'archivo';
  }

  async function subir(fichero) {
    if (fichero.size > TOPE) { const e = new Error('más de 8MB'); e.code = 413; throw e; }
    const datos = await new Promise((ok, mal) => {
      const l = new FileReader();
      // readAsDataURL da "data:mime;base64,XXXX": al relevo solo le interesa
      // lo de despues de la coma.
      l.onload = () => ok(String(l.result).split(',')[1] || '');
      l.onerror = () => mal(new Error('no se pudo leer el archivo'));
      l.readAsDataURL(fichero);
    });
    const tipo = tipoDe(fichero.type);
    const d = await pedir('/subir', firmado({
      tipo, datos, mime: fichero.type || '', nombre: fichero.name || '',
    }), 120000);
    return { id: d.id, tipo, nombre: fichero.name || '' };
  }


  /* ── NOTAS DE VOZ ─────────────────────────────────────────────────────────
   *
   * Se graba con MediaRecorder, que trae el navegador, y se sube por el mismo
   * `/subir` que ya usan las fotos. No hace falta nada nuevo del otro lado
   * salvo que el relevo acepte el tipo `voz`.
   *
   * POR QUE `voz` Y NO `archivo`
   *
   * Porque se pintan distinto: una nota de voz se oye en la burbuja, con su
   * duración a la vista; un mp3 adjuntado es una tarjeta que se baja. Meterlas
   * en el mismo saco obligaría a adivinar por el mime cuál es cuál, y un audio
   * que alguien adjunta a propósito acabaría pareciendo una nota suya.
   *
   * EL FORMATO LO ELIGE EL NAVEGADOR
   *
   * Safari graba en mp4/aac y Chrome en webm/opus. No se fuerza ninguno: se
   * pregunta cuál soporta y se usa ese. Forzar webm deja a los iPhone sin
   * poder grabar, que es la mitad de la gente.
   */
  const FORMATOS = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  const puedeGrabar = () =>
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    FORMATOS.some(f => { try { return MediaRecorder.isTypeSupported(f); } catch { return false; } });

  let grabadora = null;
  let pista = null;

  /**
   * Empieza a grabar. Devuelve el instante de arranque para poder contar los
   * segundos en pantalla; quien llama decide cómo los enseña.
   */
  async function grabarInicio() {
    if (grabadora) throw new Error('ya se está grabando');
    /* `echoCancellation` y `noiseSuppression` los hace el propio navegador y
       la diferencia se oye: sin ellos una nota grabada en la calle llega
       inservible. */
    pista = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mime = FORMATOS.find(f => { try { return MediaRecorder.isTypeSupported(f); } catch { return false; } });
    grabadora = new MediaRecorder(pista, mime ? { mimeType: mime } : undefined);
    /* Los trozos viven en una variable capturada por el manejador, NO colgados
       de `grabadora`. `ondataavailable` llega DESPUES de `stop()`, y para
       entonces `grabarFin` ya puso `grabadora` en null: leerlo desde ahi tira
       «Cannot read properties of null» y la nota se pierde entera justo al
       mandarla. Costo la primera prueba de punta a punta. */
    const trozos = [];
    grabadora._trozos = trozos;
    grabadora.ondataavailable = e => { if (e.data?.size) trozos.push(e.data); };
    grabadora.start();
    return Date.now();
  }

  /** Corta el micrófono. Se llama SIEMPRE, salga bien o mal la grabación. */
  function soltarMicrofono() {
    try { pista?.getTracks().forEach(t => t.stop()); } catch {}
    pista = null;
  }

  /**
   * Termina y devuelve la nota lista para subir, o null si no se grabó nada.
   * `cancelar` tira lo grabado: es lo que hace el gesto de deslizar para
   * arrepentirse, y no debe dejar rastro.
   */
  function grabarFin(cancelar = false) {
    return new Promise((ok) => {
      if (!grabadora) { soltarMicrofono(); return ok(null); }
      const g = grabadora;
      grabadora = null;
      g.onstop = () => {
        soltarMicrofono();
        if (cancelar || !g._trozos.length) return ok(null);
        const tipo = g.mimeType || 'audio/webm';
        const trozo = new Blob(g._trozos, { type: tipo });
        // Menos de medio segundo es un toque sin querer, no una nota.
        if (trozo.size < 1200) return ok(null);
        ok(trozo);
      };
      try { g.stop(); } catch { soltarMicrofono(); ok(null); }
    });
  }

  /** Sube la nota y devuelve su adjunto, con la duración en segundos. */
  async function subirVoz(trozo, segundos) {
    if (trozo.size > TOPE) { const e = new Error('más de 8MB'); e.code = 413; throw e; }
    const datos = await new Promise((ok, mal) => {
      const l = new FileReader();
      l.onload = () => ok(String(l.result).split(',')[1] || '');
      l.onerror = () => mal(new Error('no se pudo leer la nota'));
      l.readAsDataURL(trozo);
    });
    /* La duración viaja en el NOMBRE porque el relevo no tiene un campo para
       ella y añadirle uno obligaría a desplegar los dos lados a la vez. Es
       fea pero es honesta: se lee al pintar y si falta, se enseña sin ella. */
    const d = await pedir('/subir', firmado({
      tipo: 'voz', datos, mime: trozo.type || 'audio/webm',
      nombre: `voz-${Math.max(1, Math.round(segundos))}s`,
    }), 120000);
    return { id: d.id, tipo: 'voz', nombre: `voz-${Math.max(1, Math.round(segundos))}s` };
  }

  /** Los segundos que dice el nombre de la nota, o null si no se sabe. */
  const segundosDeVoz = (nombre) => {
    const m = /^voz-(\d+)s$/.exec(String(nombre || ''));
    return m ? Number(m[1]) : null;
  };


  /* ── EL BUZON DE SEÑALES DE LAS LLAMADAS ─────────────────────────────────
   *
   * Aparte del sondeo de mensajes, que va cada cinco segundos. Una llamada no
   * puede esperar cinco segundos por cada paso del apretón de manos: serían
   * quince o veinte segundos hasta oír a alguien.
   *
   * `escuchar()` deja una petición abierta hasta veinticinco segundos y el
   * relevo contesta EN CUANTO hay algo. Se vuelve a llamar sola, así que es
   * un bucle que gasta una petición cada veinticinco segundos en vez de una
   * cada segundo.
   *
   * Se enciende solo cuando hace falta —hay una llamada, o se está en el
   * chat— porque en un móvil un bucle abierto es batería.
   */
  let escuchando = false;
  let cortar = null;

  async function escuchar(alLlegar) {
    if (escuchando) return;
    escuchando = true;
    while (escuchando) {
      try {
        const d = await pedir('/senales', firmado({}), 40000);
        for (const s of (d.senales || [])) {
          try { alLlegar(s); } catch {}
        }
      } catch (e) {
        /* Un fallo de red no puede convertir esto en un bucle que machaca al
           relevo: se espera dos segundos antes de volver a abrir. Sin esto,
           el relevo caído significaría miles de peticiones por minuto desde
           cada teléfono. */
        if (!escuchando) break;
        await new Promise(r => { cortar = setTimeout(r, 2000); });
      }
    }
  }

  function dejarDeEscuchar() {
    escuchando = false;
    if (cortar) { clearTimeout(cortar); cortar = null; }
  }

  /* Las credenciales del relevo de video (TURN).
   *
   * Las pide el SERVIDOR a Cloudflare y las devuelve ya cortas: el token de
   * API que vale para toda la cuenta no baja nunca al navegador. Si no está
   * configurado, esto devuelve una lista vacía y las llamadas siguen andando
   * con STUN a secas — que es la mayoría. */
  const turno = () =>
    pedir('/turno', firmado({})).then(d => d.iceServers || []).catch(() => []);

  /* ── QUE SUENE CON LA APP CERRADA ────────────────────────────────────────
   *
   * Un service worker vive fuera de la pagina: el navegador lo despierta
   * cuando llega un aviso, aunque PULSE2CHAT este cerrado y el telefono
   * bloqueado. Es lo unico que hace que una llamada sirva de verdad.
   *
   * CUANDO SE PIDE EL PERMISO, Y POR QUE NO ANTES
   *
   * NO al abrir la app. Un navegador que pide permiso de avisos apenas entras
   * recibe un «no» casi siempre, y ese no es para siempre: no se puede volver
   * a preguntar. Se pide cuando la persona ya hizo algo que lo justifica
   * —mandar su primer mensaje— y ahi el permiso tiene sentido y se da.
   *
   * En iPhone solo funciona si la app se agrego a la pantalla de inicio. No
   * es una limitacion nuestra y no se puede rodear; la app lo dice en vez de
   * pedir un permiso que ese navegador no va a conceder.
   */
  const puedeAvisar = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  /** ¿Es un iPhone sin instalar? Ahí los avisos no existen. */
  const iphoneSinInstalar = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    !window.navigator.standalone;

  let obrero = null;

  async function registrarObrero() {
    if (!puedeAvisar()) return null;
    try {
      obrero = await navigator.serviceWorker.register('sw.js');
      return obrero;
    } catch { return null; }
  }

  /**
   * Pide el permiso y suscribe. Devuelve por qué no se pudo, si no se pudo,
   * para que la pantalla lo diga con nombre propio.
   */
  async function pedirAvisos(llavePublica) {
    if (!puedeAvisar()) return { ok: false, motivo: 'sin-soporte' };
    if (iphoneSinInstalar()) return { ok: false, motivo: 'iphone-sin-instalar' };
    if (Notification.permission === 'denied') return { ok: false, motivo: 'negado' };
    if (!llavePublica) return { ok: false, motivo: 'sin-llave' };

    const p = Notification.permission === 'granted'
      ? 'granted' : await Notification.requestPermission();
    if (p !== 'granted') return { ok: false, motivo: 'negado' };

    const reg = obrero || await registrarObrero();
    if (!reg) return { ok: false, motivo: 'sin-obrero' };
    try {
      const sus = await reg.pushManager.getSubscription()
        || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64aBytes(llavePublica),
        });
      await pedir('/suscribir', firmado({ suscripcion: sus.toJSON() }));
      return { ok: true };
    } catch { return { ok: false, motivo: 'fallo' }; }
  }

  /** La llave pública de VAPID viene en base64url y el navegador la quiere en bytes. */
  function base64aBytes(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...b].map((c) => c.charCodeAt(0)));
  }

  /** Deja una señal para el otro lado. Nunca lanza: una llamada no se cae
      porque un candidato ICE de veinte no llegara. */
  const senalar = (para, tipo, datos) =>
    pedir('/senal', firmado({ para, tipo, datos: datos || {} })).catch(() => null);

  const enviarAdjunto = (para, adj, texto) =>
    pedir('/enviar', firmado({ para, texto: texto || '', tipo: adj.tipo,
                               archivo: adj.id, nombre: adj.nombre }));
  const leido = de => pedir('/leido', firmado({ de })).catch(() => null);

  /* Vaciar un hilo, o quitarlo de la lista. Y hay que decirlo con todas las
     letras porque la pantalla lo dice: esto NO borra los mensajes. El hilo es
     de dos y solo se decide sobre la vista propia — el relevo guarda una fecha
     de corte y de ahí para atrás esta cuenta deja de verlo. La otra persona
     conserva su copia. Prometer otra cosa sería mentir en un sitio donde la
     gente cree que borró algo. */
  const olvidar = (con, quitar = false) => pedir('/olvidar', firmado({ con, quitar }));
  const buscar = q => pedir('/buscar', firmado({ q })).then(d => d.gente || []);
  const ficha = de => pedir('/ficha', firmado({ de }));
  const perfil = datos => pedir('/perfil', firmado(datos));

  /* El comprobante de un envio que la cadena YA confirmo. No mueve dinero:
     deja la tarjeta en el hilo con el hash para que cualquiera lo compruebe en
     el explorador. Se llama DESPUES de la confirmacion, nunca antes — un
     comprobante de algo que aun no paso seria una mentira firmada por
     nosotros. */
  const pago = ({ para, monto, moneda, hash, nota }) =>
    pedir('/pago', firmado({ para, monto, moneda, hash, nota: nota || '' }))
      .then(d => d.mensaje || null);

  /* ── grupos ────────────────────────────────────────────────────────────
     Los nombres de los campos son los que lee el relevo, ni uno más: el
     grupo se identifica con `id` (no `gid`, que allá es el Genesis ID de una
     persona) y la gente que se suma viaja en `correos`. Mandar otro nombre
     no da un error claro —el relevo simplemente no encuentra el grupo y
     contesta 403—, así que esto se comprueba contra servidor.py, no de
     memoria. */
  const grupoCrear = (nombre, correos) =>
    pedir('/grupo/crear', firmado({ nombre, miembros: correos || [] }));
  const grupoInfo = id => pedir('/grupo/info', firmado({ id }));
  const grupoEditar = (id, datos) => pedir('/grupo/editar', firmado({ id, ...datos }));
  const grupoInvitar = (id, correos) => pedir('/grupo/invitar', firmado({ id, correos }));
  const grupoSalir = id => pedir('/grupo/salir', firmado({ id }));
  // El token de la invitación ES el permiso: quien lo tiene entra. Por eso
  // regenerarlo desde la ficha cierra la puerta al instante.
  const grupoUnirse = invitacion => pedir('/grupo/unirse', firmado({ invitacion }));

  const esGrupo = id => /^g:[0-9a-f]{16}$/.test(String(id || ''));
  const urlArchivo = id => BASE + '/archivo/' + id;

  return { alta, rehacerAlta, listo, quienSoy, olvidarLlave,
           conversaciones, bandeja, enviar, subir, enviarAdjunto, leido, olvidar,
           buscar, ficha, perfil, pago,
           grupoCrear, grupoInfo, grupoEditar, grupoInvitar, grupoSalir, grupoUnirse,
           esGrupo, urlArchivo,
           puedeGrabar, grabarInicio, grabarFin, subirVoz, segundosDeVoz,
           escuchar, dejarDeEscuchar, senalar, turno,
           reaccionar, escribiendo,
           puedeAvisar, iphoneSinInstalar, registrarObrero, pedirAvisos };
})();
