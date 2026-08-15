/* El cliente del relevo de mensajes — PULSE CHAT en el navegador.
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
  const olvidar = correo => { try { localStorage.removeItem(donde(correo)); } catch {} };

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
    olvidar(cuenta.correo);
    llave = null;
    return alta(cuenta);
  }

  const firmado = extra => ({ correo: yo?.correo, llave, ...extra });

  const listo = () => !!(yo?.correo && llave);
  const quienSoy = () => (yo ? { ...yo } : null);

  // ── lo que se usa a diario ──────────────────────────────────────────────
  const conversaciones = () => pedir('/conversaciones', firmado({})).then(d => d.conversaciones || []);
  const bandeja = desde => pedir('/bandeja', firmado({ desde })).then(d => d.mensajes || []);
  const enviar = (para, texto) => pedir('/enviar', firmado({ para, texto }));

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

  const enviarAdjunto = (para, adj, texto) =>
    pedir('/enviar', firmado({ para, texto: texto || '', tipo: adj.tipo,
                               archivo: adj.id, nombre: adj.nombre }));
  const leido = de => pedir('/leido', firmado({ de })).catch(() => null);
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

  // ── grupos ──────────────────────────────────────────────────────────────
  const grupoCrear = (nombre, correos) =>
    pedir('/grupo/crear', firmado({ nombre, miembros: correos || [] }));
  const grupoInfo = gid => pedir('/grupo/info', firmado({ gid }));
  const grupoEditar = (gid, datos) => pedir('/grupo/editar', firmado({ gid, ...datos }));
  const grupoInvitar = (gid, correos) => pedir('/grupo/invitar', firmado({ gid, miembros: correos }));
  const grupoSalir = gid => pedir('/grupo/salir', firmado({ gid }));

  const esGrupo = id => /^g:[0-9a-f]{16}$/.test(String(id || ''));
  const urlArchivo = id => BASE + '/archivo/' + id;

  return { alta, rehacerAlta, listo, quienSoy, olvidar,
           conversaciones, bandeja, enviar, subir, enviarAdjunto, leido, buscar, ficha, perfil, pago,
           grupoCrear, grupoInfo, grupoEditar, grupoInvitar, grupoSalir,
           esGrupo, urlArchivo };
})();
