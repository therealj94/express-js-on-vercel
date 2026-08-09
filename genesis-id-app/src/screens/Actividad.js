// El explorador: todo lo que pasó, filtrable por cualquier cosa.
//
// Responde la pregunta que aparece cuando algo va mal y que nadie previó:
// «los pagos que fallaron anoche, en la web, desde Honduras, de más de 500
// dólares». Se arma con fichas y se lee como una lista.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, RefreshControl, Pressable, TextInput,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { Icon } from '../icons';
import { C, SERIES } from '../theme';
import { Card, Vacio, hap } from '../ui';
import { Aplicados, PanelFiltros, bonito } from '../filtros';
import * as api from '../api';

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('es') : '—');
const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es');

/** Hace cuánto, en palabras. Un reloj absoluto obliga a restar mentalmente. */
function hace(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

const COLOR_TIPO = {
  error: C.bad, transaccion: SERIES[1], sesion: C.txt2,
  registro: C.ok, accion: SERIES[0], pantalla: C.txt3, rendimiento: C.warn,
};

export function Actividad({ avisar, verError }) {
  const [filtros, setFiltros] = useState({});
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [masCargando, setMasCargando] = useState(false);
  const [abrirPanel, setAbrirPanel] = useState(false);
  const [busca, setBusca] = useState('');
  const retraso = useRef(null);
  const peticion = useRef(0);

  const consultar = useCallback(async (f, anexar = false) => {
    const mia = ++peticion.current;
    anexar ? setMasCargando(true) : setCargando(true);
    const r = await api.eventos({ ...f, limite: 50 });
    // Si mientras tanto salió otra consulta, esta respuesta ya no sirve: sin
    // esto, una respuesta lenta pisa a una rápida y la lista muestra los
    // resultados del filtro anterior.
    if (mia !== peticion.current) return;
    setCargando(false); setMasCargando(false);
    if (r.error) { if (!r.sesionVencida) avisar(r.error, true); return; }
    setDatos((previo) => (anexar && previo
      ? { ...r, eventos: [...previo.eventos, ...r.eventos] }
      : r));
  }, [avisar]);

  useEffect(() => { consultar(filtros); }, [filtros, consultar]);

  function buscar(v) {
    setBusca(v);
    clearTimeout(retraso.current);
    retraso.current = setTimeout(() => {
      setFiltros((f) => ({ ...f, texto: v || undefined }));
    }, 350);
  }

  const hayMas = datos && datos.eventos.length < datos.total;

  return (
    <View style={{ flex: 1 }}>
      <View style={st.barra}>
        <View style={st.buscaCaja}>
          <Icon name="search" size={16} color={C.txt3} />
          <TextInput style={st.buscaInput} value={busca} onChangeText={buscar}
            placeholder="Buscar en mensajes y rutas…" placeholderTextColor={C.txt3}
            autoCapitalize="none" autoCorrect={false} />
        </View>
        <Pressable onPress={() => { hap(); setAbrirPanel(true); }} style={st.botonFiltro}>
          <Icon name="settings-sharp" size={16} color={C.gold} />
        </Pressable>
      </View>

      <Aplicados
        filtros={filtros}
        onQuitar={(k) => {
          if (k === 'texto') setBusca('');
          setFiltros((f) => { const n = { ...f }; delete n[k]; return n; });
        }}
        onLimpiar={() => { setBusca(''); setFiltros({}); }} />

      {/* La cabecera de resultados: cuántos son y cuánto dinero hay ahí. */}
      {datos ? (
        <View style={st.resumen}>
          <Text style={st.resumenN}>{nf(datos.total)}</Text>
          <Text style={st.resumenT}>eventos</Text>
          {datos.sumaValor > 0 ? (
            <>
              <View style={st.puntoSep} />
              <Text style={[st.resumenN, { color: SERIES[1] }]}>{dinero(datos.sumaValor)}</Text>
              <Text style={st.resumenT}>en juego</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {cargando && !datos ? (
        <ActivityIndicator color={C.gold} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={datos?.eventos || []}
          keyExtractor={(e, i) => `${e.ts}-${i}`}
          contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => consultar(filtros)} tintColor={C.gold} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hayMas && !masCargando) {
              consultar({ ...filtros, saltar: datos.eventos.length }, true);
            }
          }}
          ListEmptyComponent={datos ? (
            <Vacio icon="pulse" texto="Ningún evento con esos filtros. Quitá alguno para ampliar." />
          ) : null}
          ListFooterComponent={masCargando ? (
            <ActivityIndicator color={C.gold} style={{ marginVertical: 16 }} />
          ) : hayMas ? (
            <Text style={st.pie}>Deslizá para ver más ({nf(datos.total - datos.eventos.length)} restantes)</Text>
          ) : null}
          renderItem={({ item: e }) => (
            <Pressable
              onPress={() => { if (e.grupo) { hap(); verError(e.grupo); } }}
              disabled={!e.grupo}>
              <Card style={st.fila}>
                <View style={[st.marcaTipo, { backgroundColor: COLOR_TIPO[e.tipo] ?? C.txt3 }]} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={st.nombre} numberOfLines={1}>{e.nombre}</Text>
                    {e.valor ? <Text style={st.monto}>{dinero(e.valor)}</Text> : null}
                  </View>
                  {e.mensaje ? (
                    <Text style={st.mensaje} numberOfLines={2}>{e.mensaje}</Text>
                  ) : null}
                  <Text style={st.meta} numberOfLines={1}>
                    {bonito(e.app)} · {bonito(e.plataforma)} · {e.pais}
                    {e.version ? ` · v${e.version}` : ''}
                    {e.ruta ? ` · ${e.ruta}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={st.hora}>{String(e.hora).padStart(2, '0')}:00</Text>
                  <Text style={st.cuando}>{hace(e.ts)}</Text>
                  {e.grupo ? <Icon name="chevron-forward" size={14} color={C.txt3} /> : null}
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}

      <PanelFiltros
        visible={abrirPanel} cerrar={() => setAbrirPanel(false)}
        filtros={filtros} cambiar={setFiltros}
        facetas={datos?.facetas} total={datos?.total ?? 0} />
    </View>
  );
}

const st = StyleSheet.create({
  barra: { flexDirection: 'row', gap: 9, paddingHorizontal: 18, alignItems: 'center' },
  buscaCaja: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2,
    borderRadius: 12, paddingHorizontal: 13,
  },
  buscaInput: { flex: 1, color: C.txt, paddingVertical: 10, fontSize: 14 },
  botonFiltro: {
    width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', backgroundColor: 'rgba(201,169,97,0.1)',
  },
  resumen: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: 18, paddingTop: 6, paddingBottom: 2,
  },
  resumenN: { color: SERIES[0], fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resumenT: { color: C.txt3, fontSize: 12 },
  puntoSep: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.txt3, marginHorizontal: 4 },

  fila: { flexDirection: 'row', gap: 11, padding: 12, alignItems: 'flex-start' },
  marcaTipo: { width: 3, alignSelf: 'stretch', borderRadius: 2, minHeight: 34 },
  nombre: { color: C.txt, fontSize: 13.5, fontWeight: '700', flex: 1 },
  monto: { color: SERIES[1], fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  mensaje: { color: C.txt2, fontSize: 12, lineHeight: 16.5 },
  meta: { color: C.txt3, fontSize: 10.5 },
  hora: { color: C.txt2, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cuando: { color: C.txt3, fontSize: 10 },
  pie: { color: C.txt3, fontSize: 11.5, textAlign: 'center', paddingVertical: 14 },
});
