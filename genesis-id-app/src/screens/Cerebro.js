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
// LO QUE SI HACE FALTA HACER AQUI
//
// La página lee la sesión del operador de `localStorage`, y la vista web tiene
// el suyo propio, vacío. Se inyecta la sesión ANTES de que cargue la página
// para que el cerebro pueda enseñar también los datos del panel —cuánta gente
// hay, cuántas billeteras— y no solo lo público de la cadena.

import React, { useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { Icon } from '../icons';
import { C } from '../theme';
import { Cabecera, BotonPlano, hap } from '../ui';
import * as api from '../api';

export function Cerebro({ avisar }) {
  const vista = useRef(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [inyeccion, setInyeccion] = useState(null);
  const [listo, setListo] = useState(false);

  // La sesión se pasa una sola vez, al montar. Se lee de SecureStore —donde
  // vive de verdad— y se planta en el localStorage de la vista web con la
  // misma clave que usa el panel, que es lo que el cerebro busca.
  React.useEffect(() => {
    (async () => {
      let token = null;
      try { token = await SecureStore.getItemAsync('genesis.sesion'); } catch (e) {}
      const js = token
        ? `try{localStorage.setItem('gid.sesion', ${JSON.stringify(token)})}catch(e){};true;`
        : 'true;';
      setInyeccion(js);
      setListo(true);
    })();
  }, []);

  const url = `${api.servidor()}/cerebro`;

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
        titulo="El cerebro"
        sub="todo el ecosistema, en vivo"
        derecha={
          <Pressable onPress={() => { hap(); vista.current?.reload(); setError(null); }}
            style={st.recargar} hitSlop={8}>
            <Icon name="refresh" size={17} color={C.gold} />
          </Pressable>
        } />

      <View style={{ flex: 1, position: 'relative' }}>
        {error ? (
          <View style={st.centro}>
            <Icon name="cloud-offline" size={30} color={C.bad} />
            <Text style={st.errorT}>No se pudo abrir el cerebro</Text>
            <Text style={st.errorD}>{error}</Text>
            <Text style={st.errorD}>{url}</Text>
            <BotonPlano title="Reintentar" icon="refresh"
              onPress={() => { setError(null); setCargando(true); vista.current?.reload(); }} />
          </View>
        ) : (
          <WebView
            ref={vista}
            source={{ uri: url }}
            injectedJavaScriptBeforeContentLoaded={inyeccion}
            // El grafo se mueve con el dedo y hace su propio pellizco: si la
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
              if (s === 404) setError('El servidor todavía no tiene /cerebro desplegado.');
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

      <Text style={st.pie}>
        Gira con el dedo · pellizcá para acercar · tocá un nodo para abrirlo
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  recargar: { padding: 6 },
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
