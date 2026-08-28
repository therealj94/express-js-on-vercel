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
        /* El relevo dice POR QUE, y hasta ahora se tiraba. El 409 tenia dos
           causas que se veian iguales: otro aparato con la llave, o una sesion
           que no valia —casi siempre vencida—. La pantalla mandaba a todo el
           mundo a buscar un telefono viejo, incluida la mitad a la que solo le
           hacia falta volver a entrar. */
        e.motivo = d.motivo || '';
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

  /* ── EL CANDADO ────────────────────────────────────────────────────────
   *
   * Todo lo de aquí abajo existe para una sola cosa: que el relevo no pueda
   * leer lo que la gente escribe. La app dice «ni nosotros podemos leerlos»,
   * y esa frase solo se puede decir si es esto lo que pasa de verdad.
   *
   * El reparto de trabajo es: `candado.js` sabe de criptografía y no sabe de
   * red; este archivo sabe de red y no sabe de criptografía. Aquí solo se
   * pide la llave pública del otro, se manda el bulto a cerrar, y se entrega.
   */

  /* Las llaves públicas ajenas se piden una vez y se guardan un rato. Pedirlas
     en cada mensaje sería una vuelta al servidor por tecla enviada; no
     guardarlas nunca haría el chat lento en el móvil. Cinco minutos es corto
     para que un aparato nuevo del otro lado empiece a recibir enseguida, y
     largo para que una conversación normal no vuelva a preguntar. */
  const VIDA_LLAVES = 5 * 60 * 1000;
  const llavero = new Map();   // correo -> { aparatos, en }
  let publicada = false;

  async function publicarMiLlave() {
    if (publicada || !CANDADO?.hay()) return;
    const mia = await CANDADO.miLlave();
    if (!mia) return;
    try {
      await pedir('/llaves/publicar', firmado({ id: mia.id, pub: mia.pub, fir: mia.fir || '' }));
      publicada = true;
    } catch { /* se reintenta en el siguiente envío */ }
  }

  /* Trae al llavero lo que falte y devuelve el mapa correo → aparatos. */
  async function llaveroDe(correos) {
    const ahora = Date.now();
    const faltan = correos.filter(c => {
      const g = llavero.get(c);
      return !g || ahora - g.en > VIDA_LLAVES;
    });
    if (faltan.length) {
      const r = await pedir('/llaves/de', firmado({ correos: faltan }));
      for (const c of faltan) llavero.set(c, { aparatos: r.llaves?.[c] || [], en: ahora });
    }
    const mapa = {};
    for (const c of correos) mapa[c] = llavero.get(c)?.aparatos || [];
    return mapa;
  }

  /* ══ DOS FORMAS, PORQUE SON DOS PREGUNTAS ══════════════════════════════
   * CERRAR necesita TODOS los aparatos juntos: se le hace un sobre a cada uno
   * y da igual de quién sea cada cual.
   * VERIFICAR necesita saber DE QUIÉN es cada llave: la firma de un bulto vale
   * si está entre las que publicó QUIEN LO ESCRIBIÓ, y no entre las de
   * cualquiera de la conversación.
   *
   * Aquí había una sola función que devolvía la lista aplanada, y `abrirTodos`
   * la leía como si fuera un diccionario: `llaves[correo]` sobre un array da
   * `undefined`, o sea que a `abrir()` le llegaba SIEMPRE la lista vacía. Con
   * la lista vacía, la firma no se puede contrastar contra nada y todos los
   * mensajes salían marcados «sin-llaves-del-remitente». La verificación
   * existía entera y no verificaba nunca — y desde fuera se veía como un sello
   * que simplemente no aparecía. */
  async function llavesDe(correos) {
    const mapa = await llaveroDe(correos);
    return correos.flatMap(c => mapa[c] || []);
  }

  /** ¿A quién hay que cerrarle el sobre? En un grupo, a todos sus miembros. */
  async function destinatarios(para) {
    if (!esGrupo(para)) return [para];
    const info = await grupoInfo(para);
    return (info?.miembros || []).map(m => m.correo).filter(Boolean);
  }

  /* Devuelve también `enLinea`: el relevo sabe si la otra persona está con el
     chat de pie —escuchando su buzón de señales— y esa es exactamente la
     diferencia entre «llamala» y «esperá». */
  const bandeja = desde => pedir('/bandeja', firmado({ desde }))
    .then(async d => ({ mensajes: await abrirTodos(d.mensajes || []),
                        enLinea: d.enLinea === true }));

  /**
   * Abre lo que venga cerrado y deja lo demás como está.
   *
   * Un mensaje que este aparato no puede abrir NO se esconde ni se convierte
   * en un renglón vacío: se marca con `cerrado:true` y la app lo dice —«esto
   * llegó cifrado para otro de tus aparatos»—. Un hueco mudo haría pensar que
   * el chat perdió mensajes, que es lo contrario de lo que pasa.
   */
  async function abrirTodos(msgs) {
    if (!CANDADO?.hay()) return msgs;

    /* SE PIDEN LAS LLAVES DE TODOS LOS REMITENTES ANTES DE ABRIR NADA.
       No es una optimización: es lo que hace posible verificar la firma. Sin
       las llaves PUBLICADAS de quien escribió, lo único que se puede hacer es
       creerle al bulto, que es exactamente el agujero que la firma cierra.
       Va en una sola petición para todos, con la caché de cinco minutos que ya
       existía. */
    const deQuienes = [...new Set(msgs.filter(m => m.cif && m.de).map(m => m.de))];
    let llaves = {};
    if (deQuienes.length) {
      try { llaves = (await llaveroDe(deQuienes)) || {}; } catch { llaves = {}; }
    }

    return Promise.all(msgs.map(async m => {
      if (!m.cif) return m;
      const r = await CANDADO.abrir(m.cif, llaves[m.de] || []);
      if (r == null) return { ...m, texto: '', cerrado: true, e2e: true };
      const claro = r.texto;
      /* El texto puede traer pegada la llave de un adjunto: viaja DENTRO del
         cifrado, nunca al lado, que es lo que hace que el relevo guarde un
         archivo que no puede abrir. */
      let texto = claro, extra = null;
      if (claro.startsWith('{')) {
        try {
          const j = JSON.parse(claro.slice(1));
          texto = j.t || '';
          extra = { llaveArchivo: j.k, ivArchivo: j.iv };
        } catch { /* si no parsea es texto normal que empieza raro */ }
      }
      /* `verificado` viaja hasta la burbuja. Un mensaje que no se pudo
         verificar NO se esconde: se enseña con su marca, porque esconderlo
         sería perder información y enseñarlo callado sería mentir. */
      return {
        ...m, texto, e2e: true,
        verificado: r.verificado, motivoFirma: r.motivo,
        ...(extra || {}),
      };
    }));
  }

  /**
   * Mandar. `cita` es el id del mensaje al que se responde, si se responde.
   *
   * Se intenta cerrar SIEMPRE. Si no se puede —porque quien recibe todavía no
   * ha abierto la versión nueva y no tiene ninguna llave publicada— se manda
   * en claro y se DEVUELVE `e2e:false`, para que la app lo enseñe en ese
   * mensaje. Mandarlo en claro sin decirlo sería exactamente la mentira que
   * este trabajo vino a quitar.
   */
  async function enviar(para, texto, cita) {
    const base = { para, ...(cita ? { cita } : {}) };
    const cerrado = await cerrarPara(para, texto);
    if (cerrado) {
      await pedir('/enviar', firmado({ ...base, cif: cerrado }));
      return { ok: true, e2e: true };
    }
    await pedir('/enviar', firmado({ ...base, texto }));
    return { ok: true, e2e: false };
  }

  /** Devuelve el bulto cerrado, o null si no hay a quién cerrárselo. */
  async function cerrarPara(para, texto) {
    if (!CANDADO?.hay()) return null;
    try {
      await publicarMiLlave();
      const aparatos = await llavesDe(await destinatarios(para));
      if (!aparatos.length) return null;
      return await CANDADO.cerrar(texto, aparatos);
    } catch {
      return null;
    }
  }

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

  /* ══ UN ADJUNTO TAMBIÉN SE CIERRA ═════════════════════════════════════
   *
   * Hasta hoy no. El texto viajaba cifrado de punta a punta y la FOTO iba en
   * claro: se subía tal cual, el relevo la guardaba tal cual y la podía abrir
   * quien tuviera acceso al disco. Una app que promete que ni nosotros podemos
   * leer los mensajes no puede tener la mitad de la conversación al aire —y en
   * un chat, las fotos suelen ser la mitad que más importa.
   *
   * El candado ya sabía hacerlo (`cerrarBytes`) y el lado que recibe ya sabía
   * leer la llave del archivo desde dentro del mensaje. Faltaba justo esto:
   * que alguien lo llamara.
   *
   * CÓMO VIAJA LA LLAVE. Dentro del texto CIFRADO del mensaje, nunca al lado.
   * Por eso el relevo guarda un archivo que no puede abrir: tiene los bytes,
   * y la llave está en un sobre que no es suyo.
   *
   * QUÉ SIGUE EN CLARO, a propósito: el tipo y el nombre. La lista de
   * conversaciones tiene que poder decir «📷 Imagen» sin abrir nada, y el
   * relevo necesita el tipo para servir el archivo. Es metadato, no contenido
   * — y los metadatos ya estaban declarados como lo que el servidor ve. */
  async function subir(fichero) {
    if (fichero.size > TOPE) { const e = new Error('más de 8MB'); e.code = 413; throw e; }
    const crudos = new Uint8Array(await fichero.arrayBuffer());
    const tipo = tipoDe(fichero.type);
    let datos;
    let llave = null;
    let iv = null;
    if (CANDADO?.hay()) {
      const c = await CANDADO.cerrarBytes(crudos);
      datos = aB64Simple(c.bytes);
      llave = c.llave;
      iv = c.iv;
    } else {
      /* Sin candado —navegación privada con el cajón bloqueado— se sube en
         claro, igual que el texto. No se disimula: el mensaje sale marcado
         `e2e:false` y la burbuja lo dice. */
      datos = aB64Simple(crudos);
    }
    const d = await pedir('/subir', firmado({
      tipo, datos, mime: fichero.type || '', nombre: fichero.name || '',
    }), 120000);
    return { id: d.id, tipo, nombre: fichero.name || '', llave, iv };
  }

  /* base64 CLÁSICO (con + / y relleno), que es lo que el relevo espera en
     `/subir`. No es el mismo que el base64url del candado: mezclarlos sube un
     archivo que después no se puede volver a armar. */
  function aB64Simple(bytes) {
    let s = '';
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const paso = 0x8000;   // en trozos: `apply` con 8 MB de golpe revienta la pila
    for (let i = 0; i < b.length; i += paso) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + paso));
    }
    return btoa(s);
  }

  /* El archivo, ABIERTO. Se baja del relevo, se abre con la llave que venía
     dentro del mensaje y se devuelve una dirección local que el navegador sabe
     pintar. Sin llave se devuelve la del relevo tal cual: son los adjuntos de
     antes de este cambio, que están en claro y se siguen viendo. */
  const abiertos = new Map();     // id → blob: URL ya resuelta

  async function archivoAbierto(id, llaveB64, ivB64) {
    if (!llaveB64 || !ivB64 || !CANDADO?.hay()) return urlArchivo(id);
    const ya = abiertos.get(id);
    if (ya) return ya;
    try {
      const r = await fetch(urlArchivo(id));
      if (!r.ok) throw new Error('no está');
      const cerrados = new Uint8Array(await r.arrayBuffer());
      const claros = await CANDADO.abrirBytes(cerrados, llaveB64, ivB64);
      const url = URL.createObjectURL(new Blob([claros]));
      abiertos.set(id, url);
      return url;
    } catch {
      /* Si no se puede abrir, NO se devuelve la del relevo: eso pintaría los
         bytes cifrados y saldría una imagen rota sin explicación. Se devuelve
         nulo y la burbuja dice que ese adjunto no se pudo abrir. */
      return null;
    }
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

  /* El mensaje que acompaña a un adjunto va por el MISMO camino que cualquier
     otro: cerrado. Y si el archivo se cifró, su llave viaja DENTRO de ese
     texto — es lo que hace que el relevo tenga los bytes y no pueda abrirlos.
     El tipo, el archivo y el nombre van en claro porque son metadatos: la
     lista los necesita para decir «📷 Imagen» sin abrir nada. */
  async function enviarAdjunto(para, adj, texto) {
    const meta = { para, tipo: adj.tipo, archivo: adj.id, nombre: adj.nombre };
    const carga = adj.llave
      ? '{' + JSON.stringify({ t: texto || '', k: adj.llave, iv: adj.iv })
      : (texto || '');
    const cerrado = adj.llave || carga ? await cerrarPara(para, carga) : null;
    if (cerrado) {
      await pedir('/enviar', firmado({ ...meta, cif: cerrado }));
      return { ok: true, e2e: true };
    }
    /* Sin poder cerrar, la llave del archivo NO se manda: iría en claro al
       lado de los bytes cifrados, que es exactamente lo mismo que no cifrar
       pero con más pasos y aparentando lo contrario. El archivo se queda
       ilegible y el mensaje sale marcado sin cifrar. */
    await pedir('/enviar', firmado({ ...meta, texto: texto || '' }));
    return { ok: true, e2e: false };
  }
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

  /* ── el circulo ────────────────────────────────────────────────────────
     Pedir, aceptar, rechazar y quitar. La regla de verdad esta en el relevo:
     esto es solo la puerta bonita. Si alguien se saltara la app y hablara
     directo con el servidor, seguiria recibiendo un 403. */
  const circulo = () => pedir('/amistad/lista', firmado({}));
  /* Bloquear. La solicitud protege de quien todavia no entro; esto, de quien ya
     esta dentro. Sin la segunda mitad, aceptar a alguien seria una puerta que
     no se puede volver a cerrar — y eso hace que la gente no acepte a nadie. */
  const bloquear = (a, si = true) => pedir('/bloquear', firmado({ a, bloquear: !!si }));
  const bloqueados = () => pedir('/bloqueados', firmado({})).then(d => d.gente || []);
  /* Borrar un mensaje. `paraTodos` solo lo puede hacer quien lo escribio, y el
     relevo lo comprueba: aqui no se decide nada, solo se pide. */
  const borrarMsg = (id, paraTodos = false) => pedir('/borrar', firmado({ id, paraTodos }));
  const pedirAmistad = (para, nota) => pedir('/amistad/pedir', firmado({ para, nota: nota || '' }));
  const responderAmistad = (de, aceptar) =>
    pedir('/amistad/responder', firmado({ de, aceptar: !!aceptar }));
  const quitarAmigo = con => pedir('/amistad/quitar', firmado({ con }));

  /* ── los estados ───────────────────────────────────────────────────────
     Se piden agrupados por persona, que es como se miran. Al pedirlos, el
     llavero se vacia de esa persona: alguien a quien se acaba de aceptar
     tiene que poder recibir cifrado sin esperar cinco minutos. */
  const estados = () => pedir('/estados', firmado({})).then(d => {
    for (const g of d.gente || []) llavero.delete(g.correo);
    return d.gente || [];
  });
  const subirEstado = ({ texto, archivo, fondo }) =>
    pedir('/estado/subir', firmado({ texto: texto || '', archivo: archivo || '', fondo }));
  const borrarEstado = id => pedir('/estado/borrar', firmado({ id }));
  const estadoVisto = id => pedir('/estado/visto', firmado({ id })).catch(() => null);

  /** El codigo de seguridad de una conversacion, para comparar en voz alta. */
  async function codigoCon(correo) {
    if (!CANDADO?.hay()) return null;
    const mio = yo?.correo;
    if (!mio) return null;

    /* SE PIDEN LOS APARATOS DE LOS DOS LADOS, y ahí estaba el fallo.
       Antes se pasaba UN aparato propio —el actual— contra TODOS los del otro.
       Los dos lados calculaban sobre conjuntos distintos, así que el número no
       coincidía salvo que ambos tuvieran exactamente un aparato. Con teléfono y
       computadora, que es lo normal, discrepaba siempre.

       Y eso no era un detalle cosmético: esta pantalla existe justamente para
       detectar que alguien se metió en medio. Si le enseña discrepancia a gente
       honesta todos los días, la gente deja de mirarla, y con ella se cae la
       única defensa que teníamos. Un aviso que siempre suena no es un aviso.

       El servidor ya permitía pedir las llaves propias, así que no hizo falta
       tocarlo. */
    const r = await pedir('/llaves/de', firmado({ correos: [mio, correo] }));
    const mias = (r.llaves?.[mio] || []).map(a => a.pub);
    const suyas = (r.llaves?.[correo] || []).map(a => a.pub);
    if (!mias.length || !suyas.length) return null;
    return CANDADO.codigoDeSeguridad(mias, suyas);
  }

  const esGrupo = id => /^g:[0-9a-f]{16}$/.test(String(id || ''));
  const urlArchivo = id => BASE + '/archivo/' + id;

  /* ── LA VOZ EN VIVO ───────────────────────────────────────────────────────
   *
   * Le pide al nodo que diga un texto y va entregando el audio POR TROZOS,
   * segun se va fabricando, en vez de esperar el archivo entero. Es la
   * diferencia entre oir la primera palabra a los tres segundos u oirla a
   * los veinte.
   *
   * Vive aca y no en la app por una sola razon: la llave. Esta es la casa de
   * la llave, y la unica manera de que no ande dando vueltas por el resto del
   * codigo es que quien la tiene haga la llamada. Afuera se pide «deci esto»
   * y se reciben trozos de sonido; la credencial no sale de este archivo.
   *
   * `alTrozo` se llama con cada MP3 (un ArrayBuffer) apenas llega. Devuelve
   * cuando ya no queda nada por decir. Si algo falla, LANZA: quien llama
   * tiene una nota de voz con la que arreglarselas, y un fallo callado lo
   * dejaria esperando un sonido que no viene.
   */
  const FORMATO_VOZ = 'trozos-mp3-v1';
  const RAIZ = BASE.replace(/\/mensajes$/, '');

  /* ── EL OÍDO DE LA CASA ─────────────────────────────────────────────────
   *
   * Audio grabado en el navegador → texto, transcrito por NUESTRO nodo
   * (Whisper en la GPU). Existe para dos cosas: los navegadores que no traen
   * reconocedor (Firefox, iOS viejo), y que escuchar también sea de la casa.
   *
   * La credencial va en CABECERAS y no en el cuerpo: el cuerpo es el audio
   * crudo, y envolver dos megas de opus en JSON sería pagar un tercio más de
   * subida en base64. Vive acá por la misma regla que vozEnVivo: la llave no
   * sale de este archivo.
   */
  async function oir(audio, idioma) {
    const res = await fetch(RAIZ + '/oir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream',
                 'X-Correo': yo?.correo || '', 'X-Llave': llave || '',
                 'X-Idioma': idioma === 'en' ? 'en' : 'es' },
      body: audio,
    });
    if (!res.ok) {
      const e = new Error('oír http ' + res.status);
      e.code = res.status;
      throw e;
    }
    const d = await res.json().catch(() => ({}));
    return (d.texto || '').trim();
  }

  async function vozEnVivo({ texto, voz, idioma, alTrozo, senal }) {
    /* Cuelga del MISMO sitio que el relevo, no de un dominio propio del nodo.
       Asi no hay CORS que arreglar, ni certificado nuevo que renovar, ni un
       nombre mas que cuidar — y sobre todo: el nodo con la GPU no recibe nada
       de internet, contesta solo por dentro. */
    const res = await fetch(RAIZ + '/hablar', {
      method: 'POST', signal: senal,
      headers: { 'Content-Type': 'application/json' },
      // el idioma viaja: sin él, una respuesta en inglés salía dicha con la
      // fonética del español — acento de doblaje en la propia asistente
      body: JSON.stringify({ correo: yo?.correo, llave, texto, voz,
                             idioma: idioma === 'en' ? 'en' : 'es' }),
    });
    if (!res.ok) {
      const e = new Error('voz http ' + res.status);
      e.code = res.status;
      throw e;
    }
    /* Se comprueba el formato en vez de suponerlo. Una app vieja contra un
       nodo nuevo tiene que darse cuenta y volver a la nota de voz; sin esto
       se pondria a tocar bytes que no son audio. */
    if (res.headers.get('X-Formato') !== FORMATO_VOZ) {
      throw new Error('formato de voz desconocido');
    }
    if (!res.body) throw new Error('sin cuerpo');

    /* El lector entrega los bytes como quiere —a veces medio trozo, a veces
       dos juntos—, asi que hay que ir juntando hasta tener uno entero. Por
       eso cada trozo trae su largo delante: el corte es exacto. */
    const lector = res.body.getReader();
    let resto = new Uint8Array(0);
    const pegar = (a, b) => {
      const j = new Uint8Array(a.length + b.length);
      j.set(a); j.set(b, a.length);
      return j;
    };
    const CABEZA = 8;   // ocho digitos hexadecimales con el tamaño del mp3
    for (;;) {
      const { done, value } = await lector.read();
      if (value) resto = pegar(resto, value);
      // Se sacan TODOS los trozos completos que haya, no solo uno: una
      // lectura puede traer dos, y devolver el segundo recien con la lectura
      // siguiente lo retrasaria sin motivo.
      for (;;) {
        if (resto.length < CABEZA) break;
        const largo = parseInt(
          new TextDecoder().decode(resto.subarray(0, CABEZA)), 16);
        if (!Number.isFinite(largo) || largo <= 0) throw new Error('trozo ilegible');
        if (resto.length < CABEZA + largo) break;
        const mp3 = resto.slice(CABEZA, CABEZA + largo);
        resto = resto.subarray(CABEZA + largo);
        await alTrozo(mp3.buffer);
      }
      if (done) break;
    }
  }

  /* La llave publica de los avisos, del propio relevo. Sin llave (el servidor
     aun no la tiene) devuelve null y la app ofrece los avisos como «no
     disponibles» en vez de fallar al suscribir. */
  const llaveAvisos = () =>
    fetch(BASE + '/llave-avisos').then(r => r.json())
      .then(d => d?.llave || null).catch(() => null);

  return { alta, rehacerAlta, listo, quienSoy, olvidarLlave, archivoAbierto,
           conversaciones, bandeja, enviar, subir, enviarAdjunto, leido, olvidar,
           buscar, ficha, perfil, pago,
           circulo, pedirAmistad, responderAmistad, quitarAmigo,
           bloquear, bloqueados, borrarMsg,
           estados, subirEstado, borrarEstado, estadoVisto,
           publicarMiLlave, codigoCon,
           grupoCrear, grupoInfo, grupoEditar, grupoInvitar, grupoSalir, grupoUnirse,
           esGrupo, urlArchivo, vozEnVivo, oir,
           puedeGrabar, grabarInicio, grabarFin, subirVoz, segundosDeVoz,
           escuchar, dejarDeEscuchar, senalar, turno,
           reaccionar, escribiendo,
           puedeAvisar, iphoneSinInstalar, registrarObrero, pedirAvisos, llaveAvisos };
})();
