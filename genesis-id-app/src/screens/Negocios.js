// Negocios (KYB): las empresas del ecosistema y en qué punto está su carpeta.
//
// La web tenía esta sección y el teléfono no, así que un negocio no se podía
// ni mirar fuera del escritorio. La lista se ordena por lo último tocado
// —igual que en la web— porque quien abre esto viene a seguir donde lo dejó.
//
// Lo que se enseña en cada fila está elegido para poder decidir SIN entrar:
// cuántos documentos faltan y cuántos bloqueos tiene. Si las dos están en
// cero, es un expediente que ya se puede aprobar.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Cabecera, Pastilla, Vacio, hap } from '../ui';
import * as api from '../api';

const ESTADOS = [
  { v: '', t: 'Todos' },
  { v: 'pendiente', t: 'Pendientes' },
  { v: 'en_revision', t: 'En revisión' },
  { v: 'aprobado', t: 'Aprobados' },
  { v: 'rechazado', t: 'Rechazados' },
];

export const COLOR_ESTADO = {
  aprobado: C.ok,
  rechazado: C.bad,
  en_revision: C.warn,
  pendiente: C.cyan,
  suspendido: C.bad,
};

export const COLOR_RIESGO = { alto: C.bad, medio: C.warn, bajo: C.ok };

export function Negocios({ avisar, abrirNegocio, volver }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState('');

  const traer = useCallback(async (e) => {
    setCargando(true);
    const r = await api.negocios({ estado: e || undefined });
    setCargando(false);
    if (r.error) { avisar(r.error, true); return; }
    setDatos(r);
  }, [avisar]);

  useEffect(() => { traer(estado); }, [estado, traer]);

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Negocios" sub="verificación de empresas (KYB)"
        onAtras={volver}
        derecha={
          <Pressable onPress={() => { hap(); traer(estado); }} hitSlop={8} style={{ padding: 6 }}>
            <Icon name="sync" size={17} color={C.gold} />
          </Pressable>
        } />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }} contentContainerStyle={st.filtros}>
        {ESTADOS.map((e) => (
          <Pressable key={e.v} onPress={() => { hap(); setEstado(e.v); }}>
            <Pastilla texto={e.t} color={estado === e.v ? C.gold : C.txt3} />
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
        {cargando && !datos ? (
          <ActivityIndicator color={C.gold} style={{ marginTop: 30 }} />
        ) : !datos?.negocios?.length ? (
          <Vacio icon="storefront" titulo="No hay negocios"
            detalle={estado
              ? 'Ninguno en este estado. Probá con «Todos».'
              : 'Todavía no se registró ninguna empresa. Las apps las crean con POST /api/v1/negocios.'} />
        ) : (
          datos.negocios.map((neg) => (
            <Pressable key={neg.id} onPress={() => { hap(); abrirNegocio(neg.id); }}
              style={st.fila}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={st.nombre} numberOfLines={1}>
                  {neg.nombreComercial || neg.razonSocial}
                </Text>
                {neg.nombreComercial && neg.razonSocial !== neg.nombreComercial ? (
                  <Text style={st.razon} numberOfLines={1}>{neg.razonSocial}</Text>
                ) : null}
                <View style={st.etiquetas}>
                  <Pastilla texto={String(neg.estado).replace('_', ' ')}
                    color={COLOR_ESTADO[neg.estado] || C.txt3} />
                  {neg.riesgo ? (
                    <Pastilla texto={`riesgo ${neg.riesgo}`}
                      color={COLOR_RIESGO[neg.riesgo] || C.txt3} />
                  ) : null}
                  {neg.pais ? <Pastilla texto={neg.pais} color={C.txt3} /> : null}
                  {neg.gid ? <Pastilla texto={neg.gid} color={C.ok} /> : null}
                </View>
                <Text style={st.detalle}>
                  {neg.beneficiarios} beneficiario{neg.beneficiarios === 1 ? '' : 's'}
                  {neg.documentosPendientes
                    ? ` · faltan ${neg.documentosPendientes} documento${neg.documentosPendientes === 1 ? '' : 's'}`
                    : ' · papeles completos'}
                  {neg.bloqueos ? ` · ${neg.bloqueos} bloqueo${neg.bloqueos === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
              <Icon name="chevron-forward" size={16} color={C.txt3} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  filtros: { gap: 7, paddingHorizontal: 14, paddingVertical: 10 },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.line2,
  },
  nombre: { color: C.txt, fontSize: 14.5, fontWeight: '700' },
  razon: { color: C.txt3, fontSize: 11.5 },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  detalle: { color: C.txt2, fontSize: 11.5, marginTop: 2 },
});
