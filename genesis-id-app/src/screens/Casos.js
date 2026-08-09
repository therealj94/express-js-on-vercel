// Casos AML: lo que el motor abrió solo (tamizado o monitoreo) y espera que
// una persona analice, anote y cierre — con o sin reporte al supervisor.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C, SEMAFORO } from '../theme';
import { Card, Pastilla, Vacio, Cabecera, hap } from '../ui';
import * as api from '../api';

const FILTROS = [
  { clave: 'abierto', nombre: 'Abiertos' },
  { clave: 'en-analisis', nombre: 'En análisis' },
  { clave: '', nombre: 'Todos' },
];

export function Casos({ abrirCaso, avisar }) {
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState('abierto');
  const [cargando, setCargando] = useState(false);

  async function cargar(estado = filtro) {
    setCargando(true);
    const r = await api.casos({ estado: estado || undefined });
    setCargando(false);
    if (r.error) { avisar(r.error, true); return; }
    setLista(r.casos || []);
  }
  useEffect(() => { cargar(); }, []);

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Casos AML" sub={lista ? `${lista.length} en esta vista` : ''} />

      <View style={st.filtros}>
        {FILTROS.map((f) => (
          <Pressable key={f.clave} onPress={() => { hap(); setFiltro(f.clave); cargar(f.clave); }}
            style={[st.chip, filtro === f.clave && st.chipSel]}>
            <Text style={[st.chipTxt, filtro === f.clave && st.chipTxtSel]}>{f.nombre}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => cargar()} tintColor={C.gold} />}>
        {lista && lista.length === 0 && (
          <Vacio icon="shield-checkmark" texto={filtro === 'abierto'
            ? 'No hay casos abiertos. Cuando el tamizado o el monitoreo detecten algo, aparece acá.'
            : 'No hay casos que cumplan el filtro.'} />
        )}
        {(lista || []).map((c) => (
          <Pressable key={c.id} onPress={() => { hap(); abrirCaso(c.id); }}>
            <Card style={st.fila}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={st.titulo} numberOfLines={2}>{c.titulo}</Text>
                <Text style={st.detalle} numberOfLines={1}>
                  {c.origen} · {new Date(c.abiertoEn).toLocaleDateString('es')} ·{' '}
                  {c.alertas?.length || 0} alerta{(c.alertas?.length || 0) !== 1 ? 's' : ''}
                  {c.asignadoA ? ` · ${c.asignadoA}` : ' · sin asignar'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                  <Pastilla texto={c.gravedad} color={SEMAFORO[c.gravedad]} />
                  <Pastilla texto={c.estado} color={SEMAFORO[c.estado] || C.txt3} />
                </View>
              </View>
              <Icon name="chevron-forward" size={16} color={C.txt3} />
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  filtros: { flexDirection: 'row', gap: 7, paddingHorizontal: 18, paddingBottom: 10 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  chipSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.14)' },
  chipTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  chipTxtSel: { color: C.gold },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titulo: { color: C.txt, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  detalle: { color: C.txt3, fontSize: 11.5 },
});
