/* El timbre: las llamadas viven en TODA la app, no dentro del chat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * EL FALLO QUE ESTO ARREGLA
 *
 * El buzón de señales se encendía al abrir una conversación y se apagaba al
 * salir. O sea que con la app ABIERTA, mirando la billetera, una llamada
 * entrante se quedaba en el relevo hasta que caducaba a los sesenta segundos.
 * Nadie sonaba, nadie se enteraba, y del otro lado se veía «llamando…» hasta
 * rendirse. Una llamada que solo entra si estabas mirando la conversación
 * correcta no es una llamada.
 *
 * Ahora el buzón vive acá arriba y la pantalla de llamada se pinta sobre lo
 * que sea que estuvieras haciendo — que es lo que hace un teléfono cuando
 * suena.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ENCENDIDO SOLO EN PRIMER PLANO, Y NO ES UN ATAJO
 *
 * `escuchar()` deja una petición abierta veinticinco segundos y vuelve a
 * abrirla. Con la app en segundo plano eso es batería quemada por nada:
 * Android congela el proceso y la petición muere igual.
 *
 * El reparto queda así, y cubre los dos casos:
 *
 *   app abierta   →  el buzón, que entrega la llamada al instante
 *   app cerrada   →  el push del relevo, que hace sonar el teléfono
 *
 * El relevo ya empuja el `llamo` con urgencia alta y por su propio canal, y
 * SOLO si la persona no está escuchando el buzón: quien escucha recibe la
 * llamada directa, y el push sería un segundo aviso por lo mismo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA SEÑAL VIVE SESENTA SEGUNDOS
 *
 * Quien toca el aviso pasado ese minuto abre la app y no encuentra nada: la
 * señal ya caducó en el relevo y del otro lado ya se rindieron. Lo que queda
 * es el aviso en la barra, que sí dice que alguien llamó. Falta la lista de
 * llamadas perdidas dentro de la app, y hasta que exista esto es lo que hay.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import * as M from './mensajes';
import LLAMADA from './llamada';
import GRUPO from './llamadaGrupo';
import PantallaLlamada, { razonDeCorte } from './PantallaLlamada';
import PantallaGrupo from './PantallaGrupo';
import { leerLibreta, comoMapa } from './contactos';
import { notificarPerdida } from '../notify';

/* Las señales de una llamada cara a cara. Las de grupo empiezan todas por «g»
   y se comprueban ANTES: `ice` y `gice` son distintas, y confundirlas metería
   un candidato de una llamada de grupo en una conexión de dos. */
const SENALES_LLAMADA = ['llamo', 'respuesta', 'ice', 'cuelgo', 'rechazo', 'ocupado'];
const ES_DE_GRUPO = (t) => typeof t === 'string' && t.startsWith('g');

/* El «está escribiendo…» sigue siendo del chat, pero ya no es el chat quien
   abre el buzón. Se reparte desde acá a quien esté mirando. */
const oyentes = new Set();
export function alLlegarSenal(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export default function Timbre({ correo, toast }) {
  const [llam, setLlam] = useState(() => LLAMADA.cuento());
  const [gru, setGru] = useState(() => GRUPO.cuento());
  const [libreta, setLibreta] = useState({});

  useEffect(() => {
    let vivo = true;
    leerLibreta()
      .then((l) => { if (vivo) setLibreta(comoMapa(l)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [correo]);

  /* El nombre con el que se pinta a alguien: primero mi libreta, y si no, lo
     que va antes de la arroba. Es la misma regla del chat; acá no hay acceso
     a los nombres que manda el relevo, y poner el correo entero en una
     pantalla de llamada se lee peor que un nombre a medias. */
  const nombreDe = useCallback((c) => {
    const k = String(c || '').toLowerCase();
    return (libreta[k] && libreta[k].nombre) || k.split('@')[0] || '?';
  }, [libreta]);

  /* LA LLAMADA QUE SONÓ Y NADIE ATENDIÓ.
   *
   * Se mira la transición, no el estado: pasar de «entrando» a «libre» porque
   * el otro se cansó (`el-otro`) es una llamada perdida. Si fui yo quien
   * rechazó, no lo es —eso fue una decisión— y avisar de ella sería ruido.
   *
   * Hace falta porque cuando la app está abierta el relevo no manda push: la
   * pantalla de llamada aparece, suena, y si nadie llega desaparece sin dejar
   * NADA. Sin este aviso, la única señal de que alguien te llamó es que no hay
   * ninguna.
   */
  const fasePrevia = useRef({ fase: 'libre', con: null, video: false });
  const mirarPerdida = useCallback((c) => {
    const antes = fasePrevia.current;
    const ahora = c?.estado || 'libre';
    if (antes.fase === 'entrando' && ahora === 'libre' && c?.motivo === 'el-otro' && antes.con) {
      notificarPerdida({
        quien: nombreDe(antes.con), con: antes.con, video: antes.video,
      }).catch(() => {});
    }
    fasePrevia.current = {
      fase: ahora,
      con: c?.conQuien || c?.entrante?.de || (ahora === 'libre' ? null : antes.con),
      video: ahora === 'entrando' ? !!c?.entrante?.video : antes.video,
    };
  }, [nombreDe]);

  /* Los dos motores, enchufados una vez. Mandan por el mismo buzón del chat y
     sacan el relevo de video del mismo sitio. */
  useEffect(() => {
    if (!correo) return undefined;

    LLAMADA.arrancar({
      mandar: M.senalar,
      traerTurno: M.turno,
      alCambiar: (c) => {
        mirarPerdida(c);
        setLlam(c);
        const razon = c?.motivo ? razonDeCorte(c.motivo) : null;
        if (razon) toast?.(razon, 'error');
      },
    });

    GRUPO.arrancar({
      correo: String(correo).toLowerCase(),
      mandar: M.senalar,
      turno: M.turno,
      alCambiar: setGru,
    });

    return () => {
      if (LLAMADA.enLlamada()) LLAMADA.colgar('yo');
      if (GRUPO.enLlamada()) GRUPO.colgar('yo');
    };
  }, [correo, toast, mirarPerdida]);

  /* EL BUZÓN. Se enciende con la app en primer plano y se apaga al irse. */
  const enPie = useRef(false);
  useEffect(() => {
    if (!correo) return undefined;

    const repartir = (s) => {
      const de = String(s?.de || '').toLowerCase();

      /* OCUPADO ENTRE LOS DOS MOTORES.
         Son independientes: el de dos no sabe del de grupo ni al revés. Sin
         esto, una llamada de una persona entrando mientras estás en una de
         grupo pintaba su pantalla ENCIMA de la del grupo — y quien llamaba se
         quedaba esperando a alguien que ni la vio. Se contesta que no y no se
         pasa al motor. */
      if (s?.tipo === 'llamo' && GRUPO.enLlamada()) {
        M.senalar(de, 'ocupado', {});
        return;
      }
      if (s?.tipo === 'gllamo' && LLAMADA.enLlamada()) {
        M.senalar(de, 'grechazo', { grupo: s?.datos?.grupo });
        return;
      }

      if (ES_DE_GRUPO(s?.tipo)) { GRUPO.recibir(s); return; }
      if (SENALES_LLAMADA.includes(s?.tipo)) {
        LLAMADA.recibir(s);
        return;
      }
      // Lo que no es de llamada —«está escribiendo…»— va a quien lo mire.
      for (const fn of oyentes) { try { fn(s); } catch {} }
    };

    const encender = () => {
      if (enPie.current) return;
      enPie.current = true;
      M.escuchar(repartir);
    };
    const apagar = () => {
      if (!enPie.current) return;
      enPie.current = false;
      /* No se corta si hay una llamada en pie: los `ice` que faltan por
         llegar viajan por este mismo buzón, y cerrarlo a mitad de una llamada
         la deja sin los últimos caminos. */
      if (LLAMADA.enLlamada() || GRUPO.enLlamada()) { enPie.current = true; return; }
      M.dejarDeEscuchar();
    };

    encender();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') encender(); else apagar();
    });
    return () => { sub.remove(); enPie.current = false; M.dejarDeEscuchar(); };
  }, [correo, nombreDe]);

  if (gru.estado !== 'libre') {
    return <PantallaGrupo estado={gru} nombreDe={nombreDe} onCerrar={() => {}} />;
  }
  if (llam.estado !== 'libre') {
    /* Con quién es la llamada lo sabe el motor, en los dos sentidos: cuando
       llamo y cuando me llaman. Un estado paralelo acá solo podría quedarse
       viejo y poner el nombre equivocado sobre una cara. */
    const con = llam.conQuien || llam.entrante?.de;
    return (
      <PantallaLlamada
        estado={llam}
        quien={con ? { correo: con, nombre: nombreDe(con) } : null}
        onCerrar={() => {}}
      />
    );
  }
  return null;
}
