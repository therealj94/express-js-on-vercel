// Quién entró, cuándo y desde dónde.
//
// La app del teléfono y la web se ven POR SEPARADO a propósito: alguien que
// dejó de abrir la app pero sigue entrando por el navegador no está perdido,
// y con un solo «último acceso» esa diferencia no se ve — la plataforma que
// quedaba era la del último toque y tapaba a la otra.
//
// El nombre sale de cruzar el padrón con la huella de telemetría. Quien no
// esté en el padrón aparece como anónimo, no con un nombre inventado.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C, SERIES } from '../theme';
import { Card, Vacio, Pastilla, hap } from '../ui';
import { bonito } from '../filtros';
import * as api from '../api';

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('es') : '—');

function hace(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const reloj = (iso) => (iso ? new Date(iso).toLocaleString('es', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—');

const DONDE = [
  { clave: 'todas', nombre: 'Todo' },
  { clave: 'android', nombre: 'App' },
  { clave: 'web', nombre: 'Web' },
];

export function Sesiones({ avisar }) {
  const [plataforma, setPlataforma] = useState('todas');
  const [app, setApp] = useState('todas');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async (p = plataforma, a = app) => {
    setCargando(true);
    const r = await api.sesiones({ plataforma: p, app: a, limite: 80 });
    setCargando(false);
    if (r.error) { if (!r.sesionVencida) avisar(r.error, true); return; }
    setDatos(r);
  }, [avisar, plataforma, app]);

  useEffect(() => { cargar(); }, []);

  const cambiar = (p, a) => {
    hap(); setPlataforma(p); setApp(a); cargar(p, a);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={st.filtros}>
        {DONDE.map((d) => (
          <Pressable key={d.clave} onPress={() => cambiar(d.clave, app)}
            style={[st.chip, plataforma === d.clave && st.chipSel]}>
            <Text style={[st.chipTxt, plataforma === d.clave && st.chipTxtSel]}>{d.nombre}</Text>
          </Pressable>
        ))}
        <View style={{ width: 1, height: 20, backgroundColor: C.line2, marginHorizontal: 4 }} />
        {['todas', 'veta-wallet', 'mytokenpay'].map((a) => (
          <Pressable key={a} onPress={() => cambiar(plataforma, a)}
            style={[st.chip, app === a && st.chipSel]}>
            <Text style={[st.chipTxt, app === a && st.chipTxtSel]}>
              {a === 'todas' ? 'Ambas' : bonito(a)}
            </Text>
          </Pressable>
        ))}
      </View>

      {datos ? (
        <Text style={st.cuenta}>
          <Text style={{ color: SERIES[0], fontWeight: '800' }}>{nf(datos.total)}</Text>
          {' '}personas
          {plataforma !== 'todas' ? ` con ingreso desde ${plataforma === 'web' ? 'la web' : 'la app'}` : ''}
          {' · '}
          {nf(datos.sesiones.filter((s) => s.identificado).length)} con nombre
        </Text>
      ) : null}

      <FlatList
        data={datos?.sesiones || []}
        keyExtractor={(s, i) => `${s.app}-${s.email ?? i}-${i}`}
        contentContainerStyle={{ padding: 18, paddingTop: 6, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => cargar()} tintColor={C.gold} />}
        ListEmptyComponent={datos ? (
          <Vacio icon="people" texto={plataforma === 'todas'
            ? 'Todavía nadie entró — o las apps aún no reportan telemetría.'
            : `Nadie ha entrado desde ${plataforma === 'web' ? 'la web' : 'la app'} todavía.`} />
        ) : <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} />}
        renderItem={({ item: s }) => {
          const enApp = s.ultimaEn?.android || s.ultimaEn?.ios;
          const enWeb = s.ultimaEn?.web;
          return (
            <Card style={{ padding: 13 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.nombre, !s.identificado && { color: C.txt3, fontStyle: 'italic' }]}
                    numberOfLines={1}>
                    {s.nombre || s.email || 'Sin identificar'}
                  </Text>
                  <Text style={st.meta} numberOfLines={1}>
                    {s.email ? `${s.email} · ` : ''}{bonito(s.app)} · {s.pais}
                    {s.version ? ` · v${s.version}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.cuando}>{hace(s.ultima)}</Text>
                  <Text style={st.fecha}>{reloj(s.ultima)}</Text>
                </View>
              </View>

              {/* Las dos plataformas, siempre las dos: ver que una está vacía
                  es tan informativo como ver la fecha de la otra. */}
              <View style={st.plataformas}>
                <Marca icono="phone" nombre="App" cuando={enApp} />
                <Marca icono="globe" nombre="Web" cuando={enWeb} />
                {s.gid ? <Pastilla texto={s.gid} color={C.gold} /> : null}
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

function Marca({ icono, nombre, cuando }) {
  const hay = Boolean(cuando);
  return (
    <View style={[st.marca, hay && st.marcaViva]}>
      <Icon name={icono === 'globe' ? 'globe' : 'wallet'} size={12}
        color={hay ? SERIES[1] : C.txt3} />
      <Text style={[st.marcaTxt, hay && { color: C.txt }]}>{nombre}</Text>
      <Text style={[st.marcaCuando, hay && { color: SERIES[1] }]}>
        {hay ? hace(cuando) : 'nunca'}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 18, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  chipSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.16)' },
  chipTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  chipTxtSel: { color: C.gold },
  cuenta: { color: C.txt3, fontSize: 12, paddingHorizontal: 18, paddingTop: 10 },

  nombre: { color: C.txt, fontSize: 14, fontWeight: '700' },
  meta: { color: C.txt3, fontSize: 11, marginTop: 2 },
  cuando: { color: C.txt2, fontSize: 12, fontWeight: '700' },
  fecha: { color: C.txt3, fontSize: 10, marginTop: 1, fontVariant: ['tabular-nums'] },

  plataformas: { flexDirection: 'row', gap: 7, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' },
  marca: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  marcaViva: { borderColor: 'rgba(58,175,198,0.4)', backgroundColor: 'rgba(58,175,198,0.08)' },
  marcaTxt: { color: C.txt3, fontSize: 11, fontWeight: '700' },
  marcaCuando: { color: C.txt3, fontSize: 10.5, fontVariant: ['tabular-nums'] },
});
