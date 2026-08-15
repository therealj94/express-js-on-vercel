// ═══ EL VIGÍA DE MENSAJES ═══════════════════════════════════════════════
// App.js lo monta junto al vigilante de transferencias: consulta las
// conversaciones del relevo y avisa cuando aparecen mensajes sin leer que
// antes no estaban. Él solo DETECTA; qué hacer con lo nuevo (notificación
// local en segundo plano, toast + sonido en primero) lo decide App.js, que
// es quien sabe qué pantalla está a la vista.
//
// No registra a nadie: si en este teléfono nunca se entró a PULSE CHAT no hay
// llave guardada y el vigía se queda quieto — dar de alta un buzón de chat
// solo para vigilarlo sería crear identidades que el usuario no pidió.
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as M from './mensajes';
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
        const llave = await SecureStore.getItemAsync('og.llaveChat').catch(() => null);
        if (!llave) return; // nunca entró al chat: nada que vigilar (aún)
        await M.alta(account); // reusa esa llave y deja el módulo firmando
        listo = true;
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
