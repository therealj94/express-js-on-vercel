// El cerebro dentro de la app.
//
// POR QUE UNA VISTA WEB Y NO DIBUJARLO OTRA VEZ EN NATIVO
//
// El cerebro ya existe, está probado y se sirve desde el propio Genesis ID.
// Rehacerlo con react-native-svg serían quinientas líneas duplicadas que
// empezarían a divergir el primer día: se arregla algo en la web y en el
// teléfono sigue mal, o al revés. Una sola implementación significa que el
// mapa que ve el operador en el móvil es EL MISMO que ve en el escritorio,
// siempre — que es justo lo que se le pide a un mapa.
//
// Además necesita hablar con la cadena 5550 en vivo, y desde la vista web eso
// funciona igual que en cualquier navegador.
//
// LAS DOS VISTAS, Y POR QUE SON DOS
//
// MAPA (`/cerebro`) es la herramienta de trabajo: panel de capas, ficha de
// cada pieza, datos en vivo. Se usa para averiguar algo.
//
// GENESIS CORE (`/genesis-core`) es la vista para ENSEÑAR: el ecosistema en
// tres dimensiones, latiendo, sin panel y sin fichas. Enseña la arquitectura
// —cuántas piezas hay, cómo se agrupan, cómo se hablan— y no el contenido de
// ninguna. Esa separación es la que respeta la regla de la casa: lo que no se
// enseña es lo que el cerebro SABE.
//
// De ahí sale la diferencia importante de este archivo: **la sesión del
// operador se inyecta solo en el MAPA**. Genesis Core no la necesita y no
// debe tenerla — es la vista que se le pone delante a gente de fuera, y una
// pantalla que se enseña no lleva encima la llave del panel.

import React, { useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { Icon } from '../icons';
import { C } from '../theme';
import { Cabecera, BotonPlano, hap } from '../ui';
import * as api from '../api';

const VISTAS = {
  mapa: {
    ruta: '/cerebro',
    titulo: 'El cerebro',
    sub: 'todo el ecosistema, en vivo',
    pie: 'Gira con el dedo · pellizcá para acercar · tocá un nodo para abrirlo',
    conSesion: true,
  },
  core: {
    ruta: '/genesis-core',
    titulo: 'Genesis Core',
    sub: 'la vista para enseñar',
    pie: 'Gira solo · arrastrá para girarlo · pellizcá para acercar · dos toques reencuadra',
    conSesion: false,
  },
};

export function Cerebro({ avisar }) {
  const vista = useRef(null);
  const [cual, setCual] = useState('mapa');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);
  const [listo, setListo] = useState(false);

  // La sesión se lee una sola vez, al montar, de SecureStore —donde vive de
  // verdad—. Se planta en el localStorage de la vista web con la misma clave
  // que usa el panel, que es lo que el mapa busca.
  React.useEffect(() => {
    (async () => {
      let t = null;
      try { t = await SecureStore.getItemAsync('genesis.sesion'); } catch (e) {}
      setToken(t);
      setListo(true);
    })();
  }, []);

  const V = VISTAS[cual];
  const url = `${api.servidor()}${V.ruta}`;

  const inyeccion = V.conSesion && token
    ? `try{localStorage.setItem('gid.sesion', ${JSON.stringify(token)})}catch(e){};true;`
    : 'true;';

  function cambiar(id) {
    if (id === cual) return;
    hap();
    setCual(id);
    setError(null);
    setCargando(true);
  }

  if (!listo) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecera titulo="El cerebro" sub="cargando…" />
        <ActivityIndicator color={C.gold} size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Cabecera
        titulo={V.titulo}
        sub={V.sub}
        derecha={
          <Pressable onPress={() => { hap(); vista.current?.reload(); setError(null); }}
            style={st.recargar} hitSlop={8}>
            <Icon name="refresh" size={17} color={C.gold} />
          </Pressable>
        } />

      {/* El selector va aquí arriba y no escondido en un menú: son dos formas
          de mirar lo mismo y la gracia es poder saltar de una a otra delante
          de alguien, sin salir de la pantalla ni explicar dónde está. */}
      <View style={st.selector}>
        {[['mapa', 'Mapa'], ['core', 'Genesis Core']].map(([id, txt]) => (
          <Pressable key={id} onPress={() => cambiar(id)}
            style={[st.opcion, cual === id && st.opcionViva]}>
            <Text style={[st.opcionT, cual === id && st.opcionTViva]}>{txt}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1, position: 'relative' }}>
        {error ? (
          <View style={st.centro}>
            <Icon name="cloud-offline" size={30} color={C.bad} />
            <Text style={st.errorT}>No se pudo abrir {V.titulo}</Text>
            <Text style={st.errorD}>{error}</Text>
            <Text style={st.errorD}>{url}</Text>
            <BotonPlano title="Reintentar" icon="refresh"
              onPress={() => { setError(null); setCargando(true); vista.current?.reload(); }} />
          </View>
        ) : (
          <WebView
            // La clave cuelga de la vista: sin esto, cambiar de una a otra
            // reutiliza la misma WebView y el lienzo de la anterior se queda
            // pintado debajo hasta que la nueva termina de cargar.
            key={cual}
            ref={vista}
            source={{ uri: url }}
            injectedJavaScriptBeforeContentLoaded={inyeccion}
            // El lienzo se mueve con el dedo y hace su propio pellizco: si la
            // vista web también acercara, cada gesto haría dos cosas a la vez.
            scalesPageToFit={false}
            setBuiltInZoomControls={false}
            // Sin rebote: es un lienzo a pantalla completa, no un documento
            // que se desplaza, y el rebote lo hace sentir roto.
            bounces={false}
            overScrollMode="never"
            javaScriptEnabled
            domStorageEnabled
            style={{ flex: 1, backgroundColor: '#02090f' }}
            onLoadEnd={() => setCargando(false)}
            onError={(e) => {
              setCargando(false);
              setError(e.nativeEvent?.description || 'sin detalle');
            }}
            onHttpError={(e) => {
              const s = e.nativeEvent?.statusCode;
              // El 404 aquí tiene una causa concreta y vale la pena decirla en
              // vez de dejar una pantalla en blanco: el servidor todavía no
              // tiene la página desplegada.
              if (s === 404) setError(`El servidor todavía no tiene ${V.ruta} desplegado.`);
              else if (s >= 400) setError(`El servidor respondió ${s}.`);
            }}
            renderLoading={() => <View />} />
        )}

        {cargando && !error ? (
          <View style={st.tapa} pointerEvents="none">
            <ActivityIndicator color={C.gold} size="large" />
            <Text style={st.cargandoT}>Armando el cerebro…</Text>
          </View>
        ) : null}
      </View>

      <Text style={st.pie}>{V.pie}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  recargar: { padding: 6 },
  selector: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 8,
    backgroundColor: C.bg,
  },
  opcion: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  opcionViva: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.12)' },
  opcionT: { color: C.txt3, fontSize: 12, fontWeight: '600' },
  opcionTViva: { color: C.goldLt },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  errorT: { color: C.txt, fontSize: 15, fontWeight: '700', marginTop: 6 },
  errorD: { color: C.txt3, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  tapa: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#02090f',
  },
  cargandoT: { color: C.txt3, fontSize: 12.5 },
  pie: {
    color: C.txt3, fontSize: 10.5, textAlign: 'center',
    paddingVertical: 8, backgroundColor: C.bg,
  },
});
