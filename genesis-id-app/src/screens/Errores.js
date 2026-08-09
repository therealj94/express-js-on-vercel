// Los errores agrupados, y —lo que faltaba— a quién le pasaron.
//
// Un panel de errores que solo dice «esto falló 6 veces» sirve para saber que
// algo anda mal. Saber que le pasó a María y a Carlos, en la web, anoche,
// sirve para llamarlos. Esa es la diferencia entre vigilar y atender.
//
// El nombre no está guardado en ningún lado: la telemetría solo tiene una
// huella irreversible. Se resuelve cruzando el padrón —a cada persona se le
// calcula la misma huella— y por eso el servidor lo anota en la bitácora.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, ScrollView, RefreshControl, Pressable,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { Icon } from '../icons';
import { C, SERIES } from '../theme';
import { Card, Vacio, Pastilla, Cabecera, BotonPlano, hap, useToast } from '../ui';
import { bonito } from '../filtros';
import * as api from '../api';

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('es') : '—');
const reloj = (iso) => (iso ? new Date(iso).toLocaleString('es', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—');

const COLOR_ESTADO = {
  nuevo: C.bad, reabierto: C.crit, visto: C.warn, resuelto: C.ok, ignorado: C.txt3,
};

export function Errores({ avisar, abrirGrupo }) {
  const [estado, setEstado] = useState('');
  const [lista, setLista] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async (e = estado) => {
    setCargando(true);
    const r = await api.erroresLista({ estado: e || undefined, limite: 100 });
    setCargando(false);
    if (r.error) { if (!r.sesionVencida) avisar(r.error, true); return; }
    setLista(r.errores || []);
  }, [avisar, estado]);

  useEffect(() => { cargar(); }, []);

  return (
    <View style={{ flex: 1 }}>
      <View style={st.filtros}>
        {[
          { c: '', n: 'Todos' }, { c: 'nuevo', n: 'Nuevos' },
          { c: 'visto', n: 'Vistos' }, { c: 'resuelto', n: 'Resueltos' },
        ].map((f) => (
          <Pressable key={f.c} onPress={() => { hap(); setEstado(f.c); cargar(f.c); }}
            style={[st.chip, estado === f.c && st.chipSel]}>
            <Text style={[st.chipTxt, estado === f.c && st.chipTxtSel]}>{f.n}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={lista || []}
        keyExtractor={(g) => g.huella}
        contentContainerStyle={{ padding: 18, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => cargar()} tintColor={C.gold} />}
        ListEmptyComponent={lista ? (
          <Vacio icon="checkmark-circle" texto="Ningún error registrado. O nada se rompió, o las apps todavía no reportan." />
        ) : <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} />}
        renderItem={({ item: g }) => (
          <Pressable onPress={() => { hap(); abrirGrupo(g.huella); }}>
            <Card style={{ padding: 13 }}>
              <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
                <Icon name={g.gravedad === 'critico' ? 'alert-circle' : 'warning'} size={17}
                  color={g.gravedad === 'critico' ? C.crit : C.bad} />
                <View style={{ flex: 1 }}>
                  <Text style={st.titulo} numberOfLines={2}>{g.titulo}</Text>
                  <Text style={st.meta}>
                    {bonito(g.app)} · {(g.plataformas || []).map(bonito).join(', ')}
                    {(g.versiones || []).length ? ` · v${g.versiones.join(', v')}` : ''}
                  </Text>
                  <View style={st.cifras}>
                    <Text style={st.cifra}>{nf(g.total)} veces</Text>
                    <Text style={st.cifraSep}>·</Text>
                    <Text style={[st.cifra, g.usuarios > 0 && { color: SERIES[1] }]}>
                      {nf(g.usuarios)} {g.usuarios === 1 ? 'persona' : 'personas'}
                    </Text>
                    <Text style={st.cifraSep}>·</Text>
                    <Text style={st.cifraD}>{reloj(g.ultima)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Pastilla texto={g.estado} color={COLOR_ESTADO[g.estado] ?? C.txt3} />
                  <Icon name="chevron-forward" size={14} color={C.txt3} />
                </View>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────── ficha del error ────

export function FichaError({ huella, volver, avisar }) {
  const toast = useToast();
  const [detalle, setDetalle] = useState(null);
  const [afectados, setAfectados] = useState(null);
  const [cargandoQuien, setCargandoQuien] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api.errorDetalle(huella).then((r) => {
      if (r.error) { avisar(r.error, true); return; }
      setDetalle(r);
    });
  }, [huella, avisar]);

  async function verQuien() {
    hap(); setCargandoQuien(true);
    const r = await api.errorAfectados(huella);
    setCargandoQuien(false);
    if (r.error) { toast(r.error, true); return; }
    setAfectados(r);
  }

  async function marcar(estado) {
    hap(); setOcupado(true);
    const r = await api.marcarError(huella, estado);
    setOcupado(false);
    if (r.error) { toast(r.error, true); return; }
    toast(`Marcado como ${estado}.`);
    setDetalle((d) => (d ? { ...d, grupo: { ...(d.grupo || {}), estado } } : d));
  }

  if (!detalle) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecera titulo="Error" onAtras={volver} />
        <ActivityIndicator color={C.gold} size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const g = detalle.grupo ?? detalle;
  const ultimos = detalle.ultimos || detalle.eventos || [];

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Error" sub={bonito(g.app)} onAtras={volver} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: 40 }}>
        <Card>
          <Text style={st.tituloGrande}>{g.titulo}</Text>
          <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
            <Pastilla texto={g.estado} color={COLOR_ESTADO[g.estado] ?? C.txt3} />
            <Pastilla texto={g.gravedad} color={g.gravedad === 'critico' ? C.crit : C.bad} />
            {(g.plataformas || []).map((p) => <Pastilla key={p} texto={bonito(p)} color={SERIES[1]} />)}
          </View>
          <View style={st.cifras}>
            <Text style={st.cifra}>{nf(g.total)} veces</Text>
            <Text style={st.cifraSep}>·</Text>
            <Text style={st.cifra}>{nf(g.usuarios)} personas</Text>
          </View>
          <Text style={st.meta}>
            Primera vez: {reloj(g.primera)}{'\n'}Última: {reloj(g.ultima)}
          </Text>
        </Card>

        {/* Quién lo sufrió — la razón de ser de esta pantalla. */}
        <Card>
          <Text style={st.seccion}>A quién le pasó</Text>
          {!afectados ? (
            <>
              <Text style={st.pista}>
                La telemetría no guarda quién es nadie: guarda una huella que no
                se puede revertir. Para poner nombre se cruza con el padrón, y
                esa consulta queda anotada en la bitácora con tu firma.
              </Text>
              <BotonPlano
                title={cargandoQuien ? 'Buscando…' : 'Ver a quién le pasó'}
                icon="people" onPress={verQuien} disabled={cargandoQuien}
                style={{ alignSelf: 'flex-start' }} />
            </>
          ) : afectados.total === 0 ? (
            <Text style={st.pista}>
              Ninguno de estos errores traía usuario detrás — pasaron antes de
              iniciar sesión, o la app no manda el identificador en ese punto.
            </Text>
          ) : (
            <>
              <Text style={st.pista}>
                {nf(afectados.total)} {afectados.total === 1 ? 'persona afectada' : 'personas afectadas'}
                {' · '}{nf(afectados.identificados)} con nombre en el padrón.
              </Text>
              {afectados.afectados.map((a, i) => (
                <View key={i} style={st.persona}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.personaN, !a.identificado && { color: C.txt3, fontStyle: 'italic' }]}
                      numberOfLines={1}>
                      {a.nombre || a.email || 'Fuera del padrón'}
                    </Text>
                    <Text style={st.meta} numberOfLines={1}>
                      {a.email ? `${a.email} · ` : ''}{a.pais} · {bonito(a.plataforma)}
                      {a.version ? ` · v${a.version}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={st.veces}>{a.veces}×</Text>
                    <Text style={st.fecha}>{reloj(a.ultima)}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </Card>

        {g.mensaje ? (
          <Card>
            <Text style={st.seccion}>Mensaje</Text>
            <Text style={st.codigo} selectable>{g.mensaje}</Text>
            {g.pila ? (
              <>
                <Text style={[st.seccion, { marginTop: 12 }]}>Dónde se rompió</Text>
                <Text style={st.codigo} selectable>{g.pila}</Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {ultimos.length ? (
          <Card>
            <Text style={st.seccion}>Últimas veces ({ultimos.length})</Text>
            {ultimos.slice(0, 12).map((e, i) => (
              <View key={i} style={st.evento}>
                <Text style={st.meta}>
                  {reloj(e.ts)} · {e.pais} · {bonito(e.plataforma)}
                  {e.ruta ? ` · ${e.ruta}` : ''}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <Text style={st.seccion}>Marcar</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {['visto', 'resuelto', 'ignorado'].map((e) => (
              <Pressable key={e} onPress={() => marcar(e)} disabled={ocupado}
                style={[st.chip, g.estado === e && st.chipSel]}>
                <Text style={[st.chipTxt, g.estado === e && st.chipTxtSel]}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  filtros: { flexDirection: 'row', gap: 6, paddingHorizontal: 18 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  chipSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.16)' },
  chipTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  chipTxtSel: { color: C.gold },

  titulo: { color: C.txt, fontSize: 13.5, fontWeight: '700', lineHeight: 18.5 },
  tituloGrande: { color: C.txt, fontSize: 15.5, fontWeight: '700', lineHeight: 21 },
  meta: { color: C.txt3, fontSize: 11, marginTop: 3, lineHeight: 15.5 },
  cifras: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 },
  cifra: { color: C.txt2, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cifraSep: { color: C.txt3, fontSize: 11 },
  cifraD: { color: C.txt3, fontSize: 11, fontVariant: ['tabular-nums'] },

  seccion: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 8 },
  pista: { color: C.txt3, fontSize: 11.5, lineHeight: 16.5, marginBottom: 10 },
  persona: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  personaN: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  veces: { color: C.bad, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  fecha: { color: C.txt3, fontSize: 10, fontVariant: ['tabular-nums'] },
  codigo: {
    color: C.txt2, fontSize: 11.5, lineHeight: 17,
    backgroundColor: C.input, borderRadius: 9, padding: 11,
  },
  evento: { paddingVertical: 5, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
});
