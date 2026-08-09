// Ficha de un caso AML: las alertas con su detalle completo, las notas del
// análisis, y el cierre — que exige conclusión escrita y decide si se
// presenta reporte o no. Todo firmado.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { C, SEMAFORO } from '../theme';
import { Card, Boton, BotonPlano, Campo, Pastilla, Cabecera, hap, useToast } from '../ui';
import { Icon } from '../icons';
import * as api from '../api';

const usd = (n) => '$' + Math.round(n || 0).toLocaleString('es');

export function FichaCaso({ id, volver, operador, abrirIdentidad }) {
  const toast = useToast();
  const [caso, setCaso] = useState(null);
  const [error, setError] = useState(null);
  const [nota, setNota] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [conReporte, setConReporte] = useState(false);
  const [conclusion, setConclusion] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const puede = (p) => (operador?.permisos || []).includes('*') || (operador?.permisos || []).includes(p);

  async function cargar() {
    const r = await api.caso(id);
    if (r.error) { setError(r.error); return; }
    setCaso(r.caso);
  }
  useEffect(() => { cargar(); }, [id]);

  async function agregarNota() {
    if (!nota.trim()) return;
    hap(); setOcupado(true);
    const r = await api.anotarCaso(id, nota.trim());
    setOcupado(false);
    if (r.error) { toast(r.error, true); return; }
    setNota(''); setCaso(r.caso);
  }

  async function tomar() {
    hap(); setOcupado(true);
    const r = await api.asignarCaso(id, operador.email);
    setOcupado(false);
    if (r.error) { toast(r.error, true); return; }
    toast('Caso asignado a tu nombre.');
    setCaso(r.caso);
  }

  async function cerrar() {
    if (conclusion.trim().length < 12) {
      toast('La conclusión necesita al menos 12 caracteres: es lo que queda en el expediente.', true);
      return;
    }
    hap(); setOcupado(true);
    const r = await api.cerrarCaso(id, conReporte, conclusion.trim());
    setOcupado(false);
    if (r.error) { toast(r.error, true); return; }
    toast(conReporte ? 'Cerrado con reporte.' : 'Cerrado sin reporte.');
    setCerrando(false); setCaso(r.caso);
  }

  if (error) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecera titulo="Caso" onAtras={volver} />
        <Text style={{ color: C.bad, padding: 20 }}>{error}</Text>
      </View>
    );
  }
  if (!caso) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  const abierto = !caso.cerradoEn;

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo={caso.titulo} sub={`${caso.origen} · abierto ${new Date(caso.abiertoEn).toLocaleString('es')}`} onAtras={volver} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: 40 }}>

        <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
          <Pastilla texto={caso.gravedad} color={SEMAFORO[caso.gravedad]} />
          <Pastilla texto={caso.estado} color={SEMAFORO[caso.estado] || C.txt3} />
          {caso.asignadoA ? <Pastilla texto={caso.asignadoA} color={C.cyan} /> : null}
        </View>

        {caso.identidadId && (
          <BotonPlano title="Abrir la identidad de este caso" icon="person"
            onPress={() => abrirIdentidad(caso.identidadId)} style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
        )}

        <Card>
          <Text style={st.cardT}>Alertas ({caso.alertas.length})</Text>
          {caso.alertas.map((a, i) => (
            <View key={i} style={st.alerta}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="warning" size={14} color={SEMAFORO[a.gravedad] || C.warn} />
                <Text style={[st.alertaT, { color: SEMAFORO[a.gravedad] || C.warn }]} numberOfLines={2}>
                  {a.titulo}
                </Text>
              </View>
              <Text style={st.alertaD}>{a.detalle}</Text>
              {a.montoUsd ? <Text style={st.monto}>{usd(a.montoUsd)}</Text> : null}
            </View>
          ))}
        </Card>

        <Card>
          <Text style={st.cardT}>Notas del análisis ({caso.notas.length})</Text>
          {caso.notas.length === 0 && <Text style={st.mut}>Sin notas todavía.</Text>}
          {caso.notas.map((n, i) => (
            <View key={i} style={st.nota}>
              <Text style={st.notaQuien}>{n.operador} · {new Date(n.fecha).toLocaleString('es')}</Text>
              <Text style={st.notaTxt}>{n.texto}</Text>
            </View>
          ))}
          {abierto && puede('caso.gestionar') && (
            <View style={{ marginTop: 10 }}>
              <Campo value={nota} onChangeText={setNota} placeholder="Agregar una nota firmada…"
                multiline style={{ minHeight: 60, textAlignVertical: 'top' }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <BotonPlano title="Guardar nota" icon="create" onPress={agregarNota} disabled={ocupado || !nota.trim()} />
                {!caso.asignadoA || caso.asignadoA !== operador.email ? (
                  <BotonPlano title="Tomar el caso" icon="person-add" onPress={tomar} disabled={ocupado} />
                ) : null}
              </View>
            </View>
          )}
        </Card>

        {abierto && puede('caso.reportar') && (
          <Card style={{ borderColor: C.line }}>
            <Text style={st.cardT}>Cerrar el caso</Text>
            {!cerrando ? (
              <Boton title="Cerrar…" icon="checkmark-circle" onPress={() => { hap(); setCerrando(true); }} />
            ) : (
              <View>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <Pressable onPress={() => { hap(); setConReporte(false); }}
                    style={[st.opcion, !conReporte && st.opcionSel]}>
                    <Text style={[st.opcionTxt, !conReporte && { color: C.gold }]}>Sin reporte</Text>
                    <Text style={st.opcionSub}>actividad explicada, sin sospecha</Text>
                  </Pressable>
                  <Pressable onPress={() => { hap(); setConReporte(true); }}
                    style={[st.opcion, conReporte && st.opcionSel]}>
                    <Text style={[st.opcionTxt, conReporte && { color: C.gold }]}>Con reporte</Text>
                    <Text style={st.opcionSub}>se presenta al supervisor</Text>
                  </Pressable>
                </View>
                <Campo label="Conclusión (queda en el expediente)" value={conclusion}
                  onChangeText={setConclusion} multiline
                  placeholder="Qué se revisó, qué se encontró y por qué se cierra así…"
                  style={{ minHeight: 80, textAlignVertical: 'top' }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Boton title={ocupado ? 'Cerrando…' : 'Confirmar cierre'} tono={conReporte ? 'mal' : 'ok'}
                    onPress={cerrar} disabled={ocupado} style={{ flex: 1 }} />
                  <BotonPlano title="Cancelar" color={C.txt3} onPress={() => setCerrando(false)} />
                </View>
              </View>
            )}
          </Card>
        )}

        {!abierto && (
          <Card>
            <Text style={st.cardT}>Cerrado</Text>
            <Text style={st.mut}>
              {new Date(caso.cerradoEn).toLocaleString('es')}
              {caso.referenciaReporte ? ` · reporte: ${caso.referenciaReporte}` : ' · sin reporte'}
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  cardT: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 8 },
  mut: { color: C.txt3, fontSize: 12, lineHeight: 17 },
  alerta: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  alertaT: { fontSize: 13, fontWeight: '700', flex: 1 },
  alertaD: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  monto: { color: C.cyan, fontSize: 12.5, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  nota: { paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  notaQuien: { color: C.txt3, fontSize: 10.5, marginBottom: 2 },
  notaTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 18 },
  opcion: {
    flex: 1, borderWidth: 1, borderColor: C.line2, borderRadius: 11, padding: 11,
    backgroundColor: C.panel2,
  },
  opcionSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.1)' },
  opcionTxt: { color: C.txt, fontSize: 13, fontWeight: '700' },
  opcionSub: { color: C.txt3, fontSize: 10.5, marginTop: 2 },
});
