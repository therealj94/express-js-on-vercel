// Genesis ID — el panel de cumplimiento en el bolsillo.
//
// Una sola pila de navegación hecha a mano (sin react-navigation): cuatro
// pestañas y dos fichas. Para una herramienta de este tamaño, una librería
// de navegación es más código del que reemplaza.
//
// La sesión vive en SecureStore. Si cualquier llamada devuelve 401, el
// cliente la limpia y esta pantalla vuelve sola al login — no hay estado
// intermedio de "parece que estoy adentro pero todo falla".

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, AppState, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from './src/icons';
import { C } from './src/theme';
import { ToastHost, useToast, hap } from './src/ui';
import * as api from './src/api';
import { buscarActualizacion } from './src/updates';
import { Entrar } from './src/screens/Entrar';
import { Resumen } from './src/screens/Resumen';
import { Analitica } from './src/screens/Analitica';
import { Cerebro } from './src/screens/Cerebro';
import { Identidades } from './src/screens/Identidades';
import { FichaIdentidad } from './src/screens/FichaIdentidad';
import { Casos } from './src/screens/Casos';
import { FichaCaso } from './src/screens/FichaCaso';
import { Mas } from './src/screens/Mas';

const PESTANAS = [
  { clave: 'resumen', nombre: 'Resumen', icono: 'pulse' },
  { clave: 'identidades', nombre: 'Identidades', icono: 'people' },
  { clave: 'analitica', nombre: 'Analítica', icono: 'trending-up' },
  { clave: 'cerebro', nombre: 'Cerebro', icono: 'cerebro' },
  { clave: 'casos', nombre: 'Casos', icono: 'shield-checkmark' },
  { clave: 'mas', nombre: 'Más', icono: 'settings-sharp' },
];

function Cuerpo() {
  const toast = useToast();
  const [listo, setListo] = useState(false);
  const [operador, setOperador] = useState(null);
  const [pestana, setPestana] = useState('resumen');
  // La ficha abierta encima de la pestaña: { tipo: 'identidad'|'caso', id }
  const [ficha, setFicha] = useState(null);
  const [datosResumen, setDatosResumen] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  const avisar = useCallback((msg, mal) => toast(msg, mal), [toast]);

  // Al arrancar: restaurar sesión si la hay, y buscar update en segundo plano.
  useEffect(() => {
    // Cualquier 401 en cualquier pantalla trae a la app de vuelta al login.
    api.enSesionVencida(() => { setOperador(null); setFicha(null); setPestana('resumen'); });
    (async () => {
      const haySesion = await api.cargarSesion();
      if (haySesion) {
        const r = await api.quienSoy();
        if (!r.error) setOperador(r.operador);
      }
      setListo(true);
      buscarActualizacion(); // descarga en silencio; se aplica desde Más
    })();
  }, []);

  const refrescarResumen = useCallback(async () => {
    setCargandoResumen(true);
    const r = await api.resumen();
    setCargandoResumen(false);
    if (r.error) {
      if (r.sesionVencida) setOperador(null);
      else avisar(r.error, true);
      return;
    }
    setDatosResumen(r);
  }, [avisar]);

  // El resumen se refresca al entrar y cada vez que la app vuelve del fondo:
  // un tablero viejo miente, y quien lo mira decide con eso.
  useEffect(() => {
    if (!operador) return;
    refrescarResumen();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refrescarResumen();
    });
    return () => sub.remove();
  }, [operador, refrescarResumen]);

  async function cerrarSesion() {
    await api.salir();
    setOperador(null); setFicha(null); setPestana('resumen'); setDatosResumen(null);
  }

  if (!listo) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  if (!operador) {
    return <Entrar alEntrar={(o) => { setOperador(o); }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {ficha?.tipo === 'identidad' ? (
          <FichaIdentidad id={ficha.id} operador={operador}
            volver={() => { setFicha(ficha.desde ? { tipo: 'caso', id: ficha.desde } : null); refrescarResumen(); }} />
        ) : ficha?.tipo === 'caso' ? (
          <FichaCaso id={ficha.id} operador={operador}
            volver={() => { setFicha(null); refrescarResumen(); }}
            abrirIdentidad={(idn) => setFicha({ tipo: 'identidad', id: idn, desde: ficha.id })} />
        ) : pestana === 'resumen' ? (
          <Resumen datos={datosResumen} cargando={cargandoResumen}
            refrescar={refrescarResumen} operador={operador}
            irA={(p) => setPestana(p)} />
        ) : pestana === 'identidades' ? (
          <Identidades avisar={avisar} abrirFicha={(id) => setFicha({ tipo: 'identidad', id })} />
        ) : pestana === 'analitica' ? (
          <Analitica avisar={avisar} />
        ) : pestana === 'cerebro' ? (
          <Cerebro avisar={avisar} />
        ) : pestana === 'casos' ? (
          <Casos avisar={avisar} abrirCaso={(id) => setFicha({ tipo: 'caso', id })} />
        ) : (
          <Mas operador={operador} salir={cerrarSesion} avisar={avisar} />
        )}
      </View>

      {/* La barra se esconde cuando hay una ficha abierta: ahí la decisión
          merece la pantalla entera y el camino de vuelta es el botón Atrás. */}
      {!ficha && (
        <View style={st.barra}>
          {PESTANAS.map((p) => {
            const activa = pestana === p.clave;
            return (
              <Pressable key={p.clave} style={st.pestana}
                onPress={() => { hap(); setPestana(p.clave); }}>
                <Icon name={p.icono} size={21} color={activa ? C.gold : C.txt3} />
                <Text style={[st.pestanaTxt, activa && { color: C.gold }]}
                  numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{p.nombre}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
        <StatusBar style="light" backgroundColor={C.bg} />
        <ToastHost>
          <Cuerpo />
        </ToastHost>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  barra: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line2,
    backgroundColor: C.bg, paddingTop: 6, paddingBottom: 4,
  },
  // Con seis pestañas cada una tiene unos 65 px en un teléfono estrecho:
  // «Identidades» justo cabe, y el ajuste de fuente evita que se parta en dos
  // líneas y descuadre la barra entera.
  pestana: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 2 },
  pestanaTxt: { color: C.txt3, fontSize: 9.5, fontWeight: '600', textAlign: 'center' },
});
