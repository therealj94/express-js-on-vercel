// ═══ EL VIGÍA DE MENSAJES ═══════════════════════════════════════════════
// App.js lo monta junto al vigilante de transferencias: consulta las
// conversaciones del relevo y avisa cuando aparecen mensajes sin leer que
// antes no estaban. Él solo DETECTA; qué hacer con lo nuevo (notificación
// local en segundo plano, toast + sonido en primero) lo decide App.js, que
// es quien sabe qué pantalla está a la vista.
//
// Y da de alta el buzón él mismo, con la sesión de la wallet: antes esperaba a
// encontrar una llave guardada por el chat nativo, y desde que el planeta del
// chat abre PULSE2CHAT en la web esa llave ya no aparece nunca. Ver la nota
// larga en `tick`. De paso apunta este teléfono para el push del relevo, que
// es lo único que suena con la app cerrada.
import { AppState } from 'react-native';
import * as M from './mensajes';
import { apuntarEsteTelefono } from '../notify';
import { leerLibreta, comoMapa } from './contactos';

// El resumen corto que cabe en una notificación. Mismo criterio que la
// última línea de la lista de AuroChat, recortado a 90 letras.
function corto(u, lang) {
  const es = lang !== 'en';
  let cuerpo;
  if (u.tipo === 'pago') cuerpo = '💰 ' + (u.monto || '') + ' ' + (u.moneda || 'ORIGEN');
  else if (u.tipo === 'imagen') cuerpo = es ? '📷 Imagen' : '📷 Image';
  else if (u.tipo === 'video') cuerpo = '🎬 Video';
  else if (u.tipo === 'archivo') cuerpo = '📎 ' + (u.nombre || (es ? 'Archivo' : 'File'));
  else cuerpo = String(u.texto || '');
  return cuerpo.length > 90 ? cuerpo.slice(0, 89) + '…' : cuerpo;
}

/**
 * Arranca el sondeo. `alNuevo(avisos, estadoApp)` recibe
 * [{con, quien, texto, esGrupo}] y el AppState del momento ('active' o no).
 * Devuelve la función para pararlo todo.
 */
export function vigilarMensajes({ account, lang = 'es', alNuevo, cadaActivo = 25000, cadaFondo = 60000 }) {
  if (!account?.email) return () => {};
  const mio = String(account.email).toLowerCase();
  let vivo = true;
  let timer = null;
  let listo = false;   // ¿alta hecha con la llave ya guardada?
  let base = false;    // la primera pasada solo toma la foto: el historial
                       // viejo no se notifica, igual que marcarVisto hace
                       // con las transferencias
  const visto = {};    // id de conversación → `cuando` del último contemplado

  const tick = async () => {
    if (!vivo) return;
    try {
      if (!listo) {
        /* ══ EL ALTA YA NO ESPERA A QUE ALGUIEN ABRA EL CHAT NATIVO ═════════
         *
         * Esto exigía encontrar `og.llaveChat` en el teléfono y se quedaba
         * quieto si no estaba. La razón era buena —no crear buzones que nadie
         * pidió— y dejó de serlo el día que el planeta del chat en el Núcleo
         * pasó a abrir PULSE2CHAT en la web dentro de la app: esa pantalla
         * guarda SU llave en el navegador, no en el llavero del teléfono. O
         * sea que se podía usar el chat todos los días y el vigía no arrancaba
         * nunca. Sin vigía no hay notificación: los mensajes llegaban en
         * silencio y sólo se veían al abrir la app.
         *
         * Ahora el alta se hace aquí con la sesión de la wallet, que es la
         * prueba de que este teléfono es de quien dice. El relevo devuelve LA
         * MISMA llave que ya tuviera ese correo —no acuña otra, que mataría a
         * los demás aparatos—, así que el web, el chat nativo y el vigía
         * comparten buzón. No se crea ninguna identidad nueva: si el correo no
         * tiene buzón, esta es la primera vez y es la persona la que lo pide
         * al entrar a su cuenta.
         *
         * Ver infra/mensajes/servidor.py (correo_de_sesion) y la nota de
         * src/og/mensajes.js. */
        try {
          await M.alta(account);
        } catch {
          /* Sin red, o el relevo caído: se calla y lo reintenta en la
             siguiente pasada. Un vigía que grita cada minuto porque el wifi
             está flojo es peor que uno callado. */
          return;
        }
        listo = true;
        /* ══ Y SE APUNTA EL TELÉFONO ═══════════════════════════════════════
         * Esto es lo único que hace que suene con la app CERRADA. Todo lo de
         * este vigía son avisos locales: sondea y notifica él mismo, y eso
         * vive lo que viva el proceso — Android lo mata a los pocos minutos en
         * segundo plano, y la tarea de sistema lo reanima cada cuarto de hora.
         * Está bien para un mensaje; para una llamada es inservible.
         * Aquí y no antes, porque apuntarse exige la llave del chat: es lo que
         * le prueba al relevo de quién es este teléfono. */
        apuntarEsteTelefono(M.apuntarTelefono).catch(() => null);
      }
      const d = await M.conversaciones();
      const cs = d.conversaciones || [];
      const nuevos = [];
      for (const c of cs) {
        const id = c.id || c.correo || '';
        const u = c.ultimo;
        if (!id || !u) continue;
        const cuando = Number(u.cuando) || 0;
        const ajeno = String(u.de || '').toLowerCase() !== mio;
        if (base && ajeno && c.sinLeer > 0 && cuando > (visto[id] || 0)) {
          nuevos.push({ c, id, u, cuando });
        }
        // la foto avanza SIEMPRE, haya aviso o no: lo que el usuario ya leyó
        // (aquí o en otro teléfono) deja de contar como nuevo
        if (cuando > (visto[id] || 0)) visto[id] = cuando;
      }
      base = true;
      if (!nuevos.length || !alNuevo || !vivo) return;
      // el nombre que TÚ le pusiste en tu libreta manda sobre el del relevo
      const libreta = comoMapa(await leerLibreta().catch(() => []));
      const avisos = nuevos.map(({ c, id, u }) => {
        const esGrupo = !!(c.esGrupo || M.esGrupo(id));
        const quien = esGrupo
          ? (c.nombre || 'Grupo')
          : (libreta[id]?.nombre || c.nombre || id.split('@')[0]);
        const habla = String(u.de || '').toLowerCase();
        // en un grupo el texto lleva quién habló: sin eso es una frase sin dueño
        const prefijo = esGrupo ? (libreta[habla]?.nombre || habla.split('@')[0]).split(' ')[0] + ': ' : '';
        return { con: id, quien, texto: prefijo + corto(u, lang), esGrupo };
      });
      alNuevo(avisos, AppState.currentState);
    } catch (e) {}
  };

  const arrancar = (cada) => {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, cada);
  };
  arrancar(cadaActivo);
  tick();
  // Al irse a segundo plano no se deja de vigilar: se ESPACIA, igual que el
  // vigilante de transferencias — es justo el momento en que la notificación
  // local es la única forma de enterarse.
  const sub = AppState.addEventListener('change', (s) => {
    if (!vivo) return;
    arrancar(s === 'active' ? cadaActivo : cadaFondo);
    if (s === 'active') tick();
  });

  return () => {
    vivo = false;
    if (timer) clearInterval(timer);
    timer = null;
    sub.remove();
  };
}
