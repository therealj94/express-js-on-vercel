// La cola de identidades. Filtros arriba, lista abajo, ficha al tocar.
//
// El filtro por defecto es «en revisión»: es la cola de trabajo real. Ver
// todo mezclado obliga a buscar entre cientos de verificadas lo que espera
// una decisión — que es exactamente al revés de lo útil.

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, FlatList, RefreshControl, Pressable, TextInput, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C, SEMAFORO } from '../theme';
import { Card, Pastilla, Vacio, Cabecera, hap } from '../ui';
import * as api from '../api';

const FILTROS = [
  { clave: '', nombre: 'Todas' },
  { clave: 'en-revision', nombre: 'En revisión' },
  { clave: 'biometria', nombre: 'Biometría' },
  { clave: 'documento', nombre: 'Documento' },
  { clave: 'verificada', nombre: 'Verificadas' },
  { clave: 'rechazada', nombre: 'Rechazadas' },
  { clave: 'suspendida', nombre: 'Suspendidas' },
];

export function Identidades({ abrirFicha, avisar }) {
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState('en-revision');
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const retraso = useRef(null);

  async function cargar(estado = filtro, busqueda = texto) {
    setCargando(true);
    const r = await api.identidades({ estado: estado || undefined, texto: busqueda || undefined });
    setCargando(false);
    if (r.error) { avisar(r.error, true); return; }
    setLista(r.identidades || []);
  }

  useEffect(() => { cargar(); }, []);

  // La búsqueda espera 350 ms de silencio antes de pegarle al servidor.
  function buscar(v) {
    setTexto(v);
    clearTimeout(retraso.current);
    retraso.current = setTimeout(() => cargar(filtro, v), 350);
  }

  function cambiarFiltro(f) {
    hap(); setFiltro(f); cargar(f, texto);
  }

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Identidades" sub={lista ? `${lista.length} en esta vista` : ''} />

      <View style={st.busca}>
        <Icon name="search" size={16} color={C.txt3} />
        <TextInput style={st.buscaInput} value={texto} onChangeText={buscar}
          placeholder="Nombre, correo o GID…" placeholderTextColor={C.txt3}
          autoCapitalize="none" autoCorrect={false} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
        contentContainerStyle={st.filtros}>
        {FILTROS.map((f) => (
          <Pressable key={f.clave} onPress={() => cambiarFiltro(f.clave)}
            style={[st.chip, filtro === f.clave && st.chipSel]}>
            <Text style={[st.chipTxt, filtro === f.clave && st.chipTxtSel]}>{f.nombre}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* FlatList: la vista «Todas» puede traer 300 expedientes y una lista
          virtualizada es la diferencia entre deslizar suave y trabarse. */}
      <FlatList
        data={lista || []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 18, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => cargar()} tintColor={C.gold} />}
        ListEmptyComponent={lista ? (
          <Vacio icon="people" texto={filtro === 'en-revision'
            ? 'No hay identidades esperando revisión. La cola está limpia.'
            : 'No hay identidades que cumplan el filtro.'} />
        ) : null}
        renderItem={({ item: i }) => (
          <Pressable onPress={() => { hap(); abrirFicha(i.id); }}>
            <Card style={st.fila}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={st.nombre} numberOfLines={1}>{i.nombre || i.email}</Text>
                <Text style={st.correo} numberOfLines={1}>
                  {i.email}{i.gid ? ` · ${i.gid}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  <Pastilla texto={i.estado} />
                  {i.riesgo ? <Pastilla texto={i.riesgo} color={SEMAFORO[i.riesgo]} /> : null}
                  {i.pep ? <Pastilla texto="PEP" color={C.warn} /> : null}
                  {i.coincidencias > 0 ? <Pastilla texto={`${i.coincidencias} en listas`} color={C.crit} /> : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {i.bloqueos > 0 ? (
                  <Text style={st.bloqueos}>{i.bloqueos} bloqueo{i.bloqueos > 1 ? 's' : ''}</Text>
                ) : <Icon name="chevron-forward" size={16} color={C.txt3} />}
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  busca: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 18,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2,
    borderRadius: 12, paddingHorizontal: 13,
  },
  buscaInput: { flex: 1, color: C.txt, paddingVertical: 10, fontSize: 14 },
  filtros: { gap: 7, paddingHorizontal: 18, paddingVertical: 10 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  chipSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.14)' },
  chipTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  chipTxtSel: { color: C.gold },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nombre: { color: C.txt, fontSize: 14.5, fontWeight: '700' },
  correo: { color: C.txt3, fontSize: 11.5 },
  bloqueos: { color: C.bad, fontSize: 11, fontWeight: '700' },
});
