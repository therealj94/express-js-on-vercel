/* El cliente del API de ULTRON. Todo lo que la consola le pide al servidor
 * pasa por aquí, y aquí no hay ningún dato inventado: lo que no contesta el
 * servidor no existe para la consola.
 *
 * La sesión es una cookie httpOnly que pone /entrar: no hay token que guardar
 * ni que pueda leer un script. Un 401 en cualquier llamada significa «la
 * sesión venció» y se trata igual en todas: se vuelve a la puerta.
 */
const DATOS = (() => {
  'use strict';

  class FalloApi extends Error {
    constructor(mensaje, codigo, status) { super(mensaje); this.codigo = codigo; this.status = status; }
  }

  async function pedir(ruta, { metodo = 'GET', cuerpo, plazo = 25_000 } = {}) {
    const r = await fetch(ruta, {
      method: metodo, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(plazo),
    });
    if (r.status === 401) { document.dispatchEvent(new CustomEvent('ultron:sin-sesion')); throw new FalloApi('La sesión no está vigente.', 'SIN_SESION', 401); }
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new FalloApi(d.error || `El servidor respondió ${r.status}.`, d.codigo || 'ERROR', r.status);
    }
    return r.json();
  }
  const get = (ruta) => pedir(ruta);
  const post = (ruta, cuerpo) => pedir(ruta, { metodo: 'POST', cuerpo });
  const patch = (ruta, cuerpo) => pedir(ruta, { metodo: 'PATCH', cuerpo });
  const borrar = (ruta) => pedir(ruta, { metodo: 'DELETE' });

  /**
   * Pensar, en vivo. El servidor manda Server-Sent Events y aquí se reparten:
   * inicio, texto (a trozos), pensando, herramienta (arranca), herramienta-lista
   * (terminó, con su salida), reemplazo, titulo, fin, error.
   */
  async function pensar(texto, { conversacionId, modo = 'texto' }, en) {
    const r = await fetch('/pensar', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, conversacionId, modo }),
    });
    if (r.status === 401) { document.dispatchEvent(new CustomEvent('ultron:sin-sesion')); en.error?.('La sesión no está vigente.', 'SIN_SESION'); return; }
    if (!r.ok || !r.body) {
      const d = await r.json().catch(() => ({}));
      en.error?.(d.error || `El servidor respondió ${r.status}.`, d.codigo || 'ERROR');
      return;
    }
    const lector = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await lector.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
        const evento = /^event: (.+)$/m.exec(bloque)?.[1]; const datos = /^data: (.+)$/m.exec(bloque)?.[1];
        if (!evento || !datos) continue;
        let d; try { d = JSON.parse(datos); } catch { continue; }
        (en[evento.replace('-', '_')] || (() => {}))(d);
      }
    }
  }

  /** El audio de una frase. Null si la voz no está o no pudo. */
  async function voz(texto, { rapido = true, vozId = null } = {}) {
    const r = await fetch('/voz', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, rapido, vozId: vozId || undefined }) });
    return r.ok ? r.blob() : null;
  }

  return {
    FalloApi, get, post, patch, borrar, pensar, voz,
    yo: () => get('/yo'),
    entrar: (correo, clave) => post('/entrar', { correo, clave }),
    /* El pase que trae la wallet en el hash. Se canjea contra el servidor, que
       es el único que puede preguntarle a Genesis: la clave de API no baja
       nunca al navegador. Plazo largo porque del otro lado hay un Genesis en
       Render que puede estar despertando. */
    entrarConGenesis: (token) => pedir('/entrar/genesis', { metodo: 'POST', cuerpo: { token }, plazo: 40_000 }),
    salir: () => post('/salir', {}),
    saludo: () => get('/saludo'),
    vivo: () => get('/vivo'),
    salud: () => get('/salud'),
    gasto: () => get('/gasto'),
    herramientas: () => get('/herramientas'),
    correr: (nombre, entrada) => pedir(`/herramientas/${encodeURIComponent(nombre)}`, { metodo: 'POST', cuerpo: { entrada }, plazo: 60_000 }),
    pendientes: (conHechos) => get('/pendientes' + (conHechos ? '?hechos=1' : '')),
    anotarPendiente: (texto, quien) => post('/pendientes', { texto, quien: quien || undefined }),
    cerrarPendiente: (id, reabrir) => patch(`/pendientes/${id}`, { estado: reabrir ? 'abierto' : 'hecho' }),
    borrarPendiente: (id) => borrar(`/pendientes/${id}`),
    memorias: () => get('/memorias'),
    recordar: (texto, alcance) => post('/memorias', { texto, alcance }),
    olvidar: (id) => borrar(`/memorias/${id}`),
    documentos: () => get('/documentos'),
    documento: (id) => get(`/documentos/${id}`),
    conversaciones: () => get('/conversaciones'),
    conversacion: (id) => get(`/conversaciones/${id}`),
    voces: () => get('/voces'),
    enviar: (envio) => post('/enviar', { envio }),
  };
})();
