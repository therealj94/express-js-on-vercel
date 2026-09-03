/* La pantalla de una llamada de grupo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA REJILLA SE ARMA SOLA, Y NO CON CASOS
 *
 * Dos personas, tres, cuatro o cinco: en vez de una rama por cada número, se
 * calculan las columnas de la cuenta. Con casos, el día que el tope cambie de
 * cinco a seis hay que acordarse de agregar la rama —y nadie se acuerda—; el
 * síntoma sería una llamada de seis con la sexta persona fuera de la pantalla.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * QUIEN NO LLEGÓ TODAVÍA TIENE SU CUADRO IGUAL
 *
 * Con su inicial y su nombre, en gris. Es la diferencia entre «esa persona
 * está entrando» y «esa persona no está»: sin el cuadro, quien mira cuenta
 * tres cuando invitó a cuatro y concluye que la llamada se rompió.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { P2C } from './paletaP2C';
import { Icon } from '../icons';
import GRUPO from './llamadaGrupo';

const reloj = (seg) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

const inicialDe = (s) => String(s || '?').trim().charAt(0).toUpperCase();

export default function PantallaGrupo({ estado, nombreDe, onCerrar }) {
  const { estado: fase, gente, cuantos, micAbierto, camAbierta, conVideo,
          porAltavoz, audioListo, flujoLocal, entrante, lleno, compartiendo, TOPE } = estado;
  const [segundos, setSegundos] = useState(0);
  const arranque = useRef(null);

  useEffect(() => {
    if (fase !== 'hablando') { arranque.current = null; setSegundos(0); return; }
    arranque.current = Date.now();
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - arranque.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [fase]);

  if (fase === 'entrando') {
    const quien = nombreDe?.(entrante?.de) || entrante?.de || 'Alguien';
    return (
      <View style={st.todo}>
        <StatusBar barStyle="light-content" />
        <View style={st.centro}>
          <View style={st.circulo}><Text style={st.inicialGrande}>{inicialDe(quien)}</Text></View>
          <Text style={st.nombreGrande} numberOfLines={1}>{quien}</Text>
          <Text style={st.rotulo}>
            {entrante?.video ? 'Videollamada de grupo' : 'Llamada de grupo'}
          </Text>
        </View>
        <View style={st.abajo}>
          <View style={st.fila}>
            <Boton icono="call-off" color="#E5484D" grande etiqueta="Rechazar"
                   onPress={() => GRUPO.rechazar()} />
            <Boton icono="call" color="#2FBF71" grande etiqueta="Entrar"
                   onPress={() => GRUPO.contestar(!!entrante?.video)} />
          </View>
        </View>
      </View>
    );
  }

  /* Las columnas salen de la cuenta: 1 sola persona ocupa todo, de 2 a 4 van
     en dos columnas, y de 5 en adelante en tres. */
  const cuadros = [{ correo: null, flujo: flujoLocal, yo: true }, ...(gente || [])];
  const cols = cuadros.length <= 1 ? 1 : cuadros.length <= 4 ? 2 : 3;

  return (
    <View style={st.todo}>
      <StatusBar barStyle="light-content" />

      <View style={st.rejilla}>
        {cuadros.map((c, i) => {
          const flujo = c.yo ? flujoLocal : GRUPO.flujoDe(c.correo);
          const nombre = c.yo ? 'Vos' : (nombreDe?.(c.correo) || c.correo);
          return (
            <View key={c.correo || 'yo'} style={[st.cuadro, { width: `${100 / cols}%` }]}>
              {flujo && conVideo && (c.yo ? camAbierta : true) ? (
                <RTCView streamURL={flujo.toURL()} objectFit="cover" mirror={!!c.yo}
                         style={st.video} />
              ) : (
                <View style={st.sinVideo}>
                  <Text style={st.inicial}>{inicialDe(nombre)}</Text>
                  {/* Sin flujo todavía no es lo mismo que sin cámara: quien
                      está entrando se dice, para que nadie lo cuente como
                      ausente. */}
                  {!c.yo && !c.hayFlujo ? <Text style={st.entrando}>entrando…</Text> : null}
                </View>
              )}
              <Text style={st.etiqueta} numberOfLines={1}>{nombre}</Text>
            </View>
          );
        })}
      </View>

      <View style={st.arriba}>
        <Text style={st.rotulo}>
          {fase === 'llamando' ? 'Llamando al grupo…'
            : `${compartiendo ? 'Compartiendo pantalla · ' : ''}${cuantos} en la llamada · ${reloj(segundos)}`}
          {lleno ? `  ·  lleno (${TOPE})` : ''}
        </Text>
      </View>

      <View style={st.abajo}>
        <View style={st.fila}>
          <Boton icono={micAbierto ? 'mic' : 'mic-off'} apagado={!micAbierto}
                 etiqueta={micAbierto ? 'Silenciar' : 'Activar micrófono'}
                 onPress={() => GRUPO.micro()} />
          {audioListo ? (
            <Boton icono={porAltavoz ? 'altavoz' : 'auricular'} apagado={!porAltavoz}
                   etiqueta={porAltavoz ? 'Quitar el altavoz' : 'Altavoz'}
                   onPress={() => GRUPO.altavoz()} />
          ) : null}
          {conVideo ? (
            <Boton icono={camAbierta ? 'videocam' : 'videocam-off'} apagado={!camAbierta}
                   etiqueta={camAbierta ? 'Apagar cámara' : 'Encender cámara'}
                   onPress={() => GRUPO.camara()} />
          ) : null}
          {conVideo ? (
            <Boton icono={compartiendo ? 'pantalla-off' : 'pantalla'} apagado={!compartiendo}
                   etiqueta={compartiendo ? 'Dejar de compartir' : 'Compartir pantalla'}
                   onPress={() => GRUPO.pantalla()} />
          ) : null}
          <Boton icono="call-off" color="#E5484D" grande etiqueta="Salir de la llamada"
                 onPress={() => { GRUPO.colgar('yo'); onCerrar?.(); }} />
        </View>
      </View>
    </View>
  );
}

function Boton({ icono, etiqueta, onPress, color, grande, apagado }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta}
      style={({ pressed }) => [
        st.boton, grande && st.botonGrande,
        { backgroundColor: color || (apagado ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.18)') },
        pressed && { opacity: 0.7 },
      ]}>
      <Icon name={icono} size={grande ? 26 : 22} color="#FFFFFF" />
    </Pressable>
  );
}

const st = StyleSheet.create({
  todo: { ...StyleSheet.absoluteFillObject, backgroundColor: P2C.fondo, zIndex: 100 },
  rejilla: {
    ...StyleSheet.absoluteFillObject, flexDirection: 'row', flexWrap: 'wrap',
    alignContent: 'center', paddingTop: 78, paddingBottom: 130,
  },
  cuadro: { aspectRatio: 3 / 4, padding: 3 },
  video: { flex: 1, borderRadius: 12, backgroundColor: '#000' },
  sinVideo: {
    flex: 1, borderRadius: 12, backgroundColor: P2C.hoja,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: P2C.linea2,
  },
  inicial: { color: P2C.acentoLt, fontSize: 34, fontWeight: '700' },
  entrando: { color: P2C.texto3, fontSize: 12, marginTop: 6 },
  etiqueta: {
    position: 'absolute', left: 10, bottom: 10, right: 10,
    color: '#FFFFFF', fontSize: 12, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4,
  },
  centro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  circulo: {
    width: 148, height: 148, borderRadius: 74, backgroundColor: P2C.hoja,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P2C.linea,
  },
  inicialGrande: { color: P2C.acentoLt, fontSize: 56, fontWeight: '700' },
  nombreGrande: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginTop: 18 },
  arriba: { position: 'absolute', top: 54, left: 20, right: 20, alignItems: 'center' },
  rotulo: { color: P2C.acentoLt, fontSize: 14, marginTop: 6, fontVariant: ['tabular-nums'] },
  abajo: { position: 'absolute', left: 0, right: 0, bottom: 42, alignItems: 'center' },
  fila: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  boton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  botonGrande: { width: 64, height: 64, borderRadius: 32 },
});
