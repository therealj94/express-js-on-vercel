/* La pantalla de una llamada de PULSE2CHAT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TRES MOMENTOS Y UNA SOLA PANTALLA
 *
 *   entrando   · alguien llama: la foto grande, y contestar o rechazar
 *   llamando   · yo llamo: la misma foto, y solo cancelar
 *   conectando · ya se contestó pero todavía no llega ni un pixel
 *   hablando   · el video del otro llenando la pantalla, o su foto si es voz
 *
 * Son estados del motor, no pantallas distintas: mantenerlas separadas
 * obligaría a montar y desmontar el video en cada paso, y el video que se
 * remonta parpadea en negro justo cuando la persona empieza a ver al otro.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * «CONECTANDO» ES UNA PALABRA HONESTA, Y HAY QUE DEFENDERLA
 *
 * El motor solo dice «hablando» cuando la conexión está de verdad en pie. Esta
 * pantalla NO se adelanta: mientras tanto dice «Conectando…», aunque los dos
 * lados ya hayan aceptado. Decirle a alguien que está en llamada cuando no
 * llega nada es la peor forma de fallar, porque no puede hacer nada con esa
 * información — se queda hablándole a un silencio creyendo que lo escuchan.
 *
 * Y cuando no se pudo, se dice POR QUÉ. `sin-camino` casi siempre significa
 * que los dos están detrás de un NAT cerrado y haría falta un relevo TURN.
 * Eso no es culpa de su internet y no se arregla intentándolo diez veces, así
 * que la pantalla lo nombra en vez de dejar un «no se pudo» que invita a
 * repetir lo mismo.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, StatusBar } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { P2C } from './paletaP2C';
import { Icon } from '../icons';
import LLAMADA from './llamada';

/* Por qué no se pudo, dicho para quien lo lee y no para quien lo programó. */
const MOTIVOS = {
  'sin-camino': 'No se pudo conectar. Revisá que los dos tengan internet y probá otra vez.',
  'no-se-pudo': 'No se pudo abrir el micrófono o la cámara.',
  'sin-permiso': 'Hace falta permiso de micrófono para llamar, y de cámara para videollamar. Se piden desde los ajustes del teléfono.',
  rechazada: 'No contestaron.',
  ocupado: 'Está en otra llamada.',
  corte: 'Se cortó la conexión.',
  'el-otro': null,   // colgó el otro: no hace falta explicar nada
  yo: null,
};

const reloj = (seg) => {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function PantallaLlamada({ estado, quien, onCerrar }) {
  const { estado: fase, flujoLocal, flujoRemoto, hayVideo, micAbierto, camAbierta,
          porAltavoz, compartiendo, flujoChico, entrante } = estado;
  const [segundos, setSegundos] = useState(0);
  const arranque = useRef(null);

  /* El cronómetro arranca cuando empieza a HABLAR, no cuando se contesta: los
     segundos que se cobran —o que se recuerdan— son los que se escucharon. */
  useEffect(() => {
    if (fase !== 'hablando') { arranque.current = null; setSegundos(0); return; }
    arranque.current = Date.now();
    const t = setInterval(() => {
      setSegundos(Math.floor((Date.now() - arranque.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [fase]);

  const esVideo = fase === 'entrando' ? !!entrante?.video : hayVideo;
  const nombre = quien?.nombre || quien?.correo || 'Alguien';
  const foto = quien?.foto;

  const rotulo = fase === 'entrando'
    ? (esVideo ? 'Videollamada entrante' : 'Llamada entrante')
    : fase === 'llamando' ? 'Llamando…'
    : fase === 'conectando' ? 'Conectando…'
    : fase === 'hablando' ? (compartiendo ? 'Compartiendo pantalla · ' + reloj(segundos) : reloj(segundos))
    : '';

  return (
    <View style={st.todo}>
      <StatusBar barStyle="light-content" />

      {/* EL VIDEO DEL OTRO, DE FONDO. Solo cuando ya está llegando: un RTCView
          sin flujo pinta un rectángulo negro que se lee como «se rompió». */}
      {flujoRemoto && esVideo ? (
        <RTCView streamURL={flujoRemoto.toURL()} objectFit="cover" style={st.remoto} />
      ) : (
        <View style={st.fondoVoz}>
          {foto ? <Image source={{ uri: foto }} style={st.fotoGrande} /> : (
            <View style={[st.fotoGrande, st.fotoVacia]}>
              <Text style={st.inicial}>{String(nombre).trim().charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
      )}

      {/* MI CÁMARA, EN CHICO. Se esconde si la apagué: dejar el recuadro con
          la última imagen congelada hace creer que se sigue viendo. */}
      {flujoChico && esVideo && (camAbierta || compartiendo) ? (
        <RTCView streamURL={flujoChico.toURL()} objectFit="cover"
                 mirror={!compartiendo} style={st.local} />
      ) : null}

      <View style={st.arriba}>
        <Text style={st.nombre} numberOfLines={1}>{nombre}</Text>
        <Text style={st.rotulo}>{rotulo}</Text>
      </View>

      <View style={st.abajo}>
        {fase === 'entrando' ? (
          <View style={st.fila}>
            <Boton icono="call-off" color="#E5484D" grande
                   etiqueta="Rechazar" onPress={() => LLAMADA.rechazar()} />
            {esVideo ? (
              <Boton icono="videocam" color="#2FBF71" grande
                     etiqueta="Contestar con video" onPress={() => LLAMADA.contestar(true)} />
            ) : null}
            <Boton icono="call" color="#2FBF71" grande
                   etiqueta="Contestar" onPress={() => LLAMADA.contestar(false)} />
          </View>
        ) : (
          <View style={st.fila}>
            <Boton icono={micAbierto ? 'mic' : 'mic-off'} apagado={!micAbierto}
                   etiqueta={micAbierto ? 'Silenciar' : 'Activar micrófono'}
                   onPress={() => LLAMADA.micro()} />
            {/* El manos libres. En videollamada arranca encendido: nadie mira
                una pantalla con el teléfono pegado a la oreja. */}
            <Boton icono={porAltavoz ? 'altavoz' : 'auricular'} apagado={!porAltavoz}
                   etiqueta={porAltavoz ? 'Quitar el altavoz' : 'Altavoz'}
                   onPress={() => LLAMADA.altavoz()} />
            {esVideo ? (
              <Boton icono={camAbierta ? 'videocam' : 'videocam-off'} apagado={!camAbierta}
                     etiqueta={camAbierta ? 'Apagar cámara' : 'Encender cámara'}
                     onPress={() => LLAMADA.camara()} />
            ) : null}
            {esVideo && camAbierta && !compartiendo ? (
              <Boton icono="camera-reverse" etiqueta="Cambiar de cámara"
                     onPress={() => LLAMADA.voltear()} />
            ) : null}
            {/* Compartir pantalla solo en videollamada: en una de voz habría
                que renegociar la conexión, y eso corta el audio. */}
            {esVideo ? (
              <Boton icono={compartiendo ? 'pantalla-off' : 'pantalla'} apagado={!compartiendo}
                     etiqueta={compartiendo ? 'Dejar de compartir' : 'Compartir pantalla'}
                     onPress={() => LLAMADA.pantalla()} />
            ) : null}
            <Boton icono="call-off" color="#E5484D" grande etiqueta="Colgar"
                   onPress={() => { LLAMADA.colgar('yo'); onCerrar?.(); }} />
          </View>
        )}
      </View>
    </View>
  );
}

/** El cartel de por qué se cortó. Se enseña fuera de la llamada, sobre el chat. */
export function razonDeCorte(motivo) {
  return MOTIVOS[motivo] ?? null;
}

function Boton({ icono, etiqueta, onPress, color, grande, apagado }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => [
        st.boton,
        grande && st.botonGrande,
        { backgroundColor: color || (apagado ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.18)') },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name={icono} size={grande ? 28 : 24} color="#FFFFFF" />
    </Pressable>
  );
}

const st = StyleSheet.create({
  todo: { ...StyleSheet.absoluteFillObject, backgroundColor: P2C.fondo, zIndex: 100 },
  remoto: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  fondoVoz: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fotoGrande: { width: 148, height: 148, borderRadius: 74, backgroundColor: P2C.hoja },
  fotoVacia: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P2C.linea },
  inicial: { color: P2C.acentoLt, fontSize: 56, fontWeight: '700' },
  local: {
    position: 'absolute', right: 16, top: 96, width: 108, height: 148,
    borderRadius: 14, backgroundColor: '#000', overflow: 'hidden',
    borderWidth: 1, borderColor: P2C.linea,
  },
  arriba: { position: 'absolute', top: 56, left: 24, right: 24, alignItems: 'center' },
  nombre: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  rotulo: { color: P2C.acentoLt, fontSize: 15, marginTop: 6, fontVariant: ['tabular-nums'] },
  abajo: { position: 'absolute', left: 0, right: 0, bottom: 46, alignItems: 'center' },
  fila: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  boton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  botonGrande: { width: 68, height: 68, borderRadius: 34 },
});
