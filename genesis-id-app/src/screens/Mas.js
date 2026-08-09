// Todo lo que no es la cola diaria: listas de sanciones, bitácora, cuenta,
// servidor y actualizaciones de la app.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { C } from '../theme';
import { Card, Boton, BotonPlano, Campo, Cabecera, Dato, hap, useToast } from '../ui';
import { Icon } from '../icons';
import * as api from '../api';
import { puedeActualizar, buscarActualizacion, aplicarActualizacion, updateEnUso } from '../updates';

export function Mas({ operador, salir, avisar }) {
  const toast = useToast();
  const [listas, setListas] = useState(null);
  const [bitacora, setBitacora] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [verBitacora, setVerBitacora] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [update, setUpdate] = useState(null); // null | 'buscando' | 'lista' | 'aldia'

  const esAdmin = (operador?.permisos || []).includes('*');

  useEffect(() => {
    api.listas().then((r) => { if (!r.error) setListas(r); });
  }, []);

  async function cargarBitacora() {
    hap();
    if (verBitacora) { setVerBitacora(false); return; }
    const r = await api.bitacora(60);
    if (r.error) { avisar(r.error, true); return; }
    setBitacora(r); setVerBitacora(true);
  }

  async function traerOfac() {
    hap(); setOcupado(true);
    toast('Bajando la lista de la OFAC… puede tardar un minuto.');
    const r = await api.importarOfac();
    setOcupado(false);
    if (r.error) { toast(r.error, true); return; }
    toast(`Listas cargadas: ${r.registros?.toLocaleString('es') || ''} registros. Se retamizó a todo el mundo.`);
    api.listas().then((x) => { if (!x.error) setListas(x); });
  }

  async function cambiarClave() {
    if (claveNueva.length < 12) { toast('La contraseña nueva necesita al menos 12 caracteres.', true); return; }
    hap(); setOcupado(true);
    const r = await api.cambiarContrasena(claveActual, claveNueva);
    setOcupado(false);
    if (r.error) { toast(r.error, true); return; }
    toast('Contraseña cambiada. Se cerraron todas las sesiones.');
    salir();
  }

  async function revisarUpdate() {
    hap(); setUpdate('buscando');
    const hay = await buscarActualizacion();
    setUpdate(hay ? 'lista' : 'aldia');
    if (hay) toast('Actualización descargada. Tocá «Reiniciar» para aplicarla.');
  }

  const enUso = updateEnUso();

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Más" sub="listas · bitácora · cuenta" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: 40 }}>

        {/* ── operador ───────────────────────────────────────────────────── */}
        <Card>
          <Text style={st.cardT}>Tu sesión</Text>
          <Dato k="Operador" v={operador?.nombre} />
          <Dato k="Correo" v={operador?.email} />
          <Dato k="Rol" v={operador?.rol} color={C.gold} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <BotonPlano title="Cambiar contraseña" icon="key"
              onPress={() => { hap(); setCambiandoClave(!cambiandoClave); }} />
            <BotonPlano title="Salir" icon="power" color={C.bad} onPress={() => { hap(); salir(); }} />
          </View>
          {cambiandoClave && (
            <View style={{ marginTop: 8 }}>
              <Campo label="Contraseña actual" value={claveActual} onChangeText={setClaveActual} secureTextEntry />
              <Campo label="Nueva (mínimo 12 caracteres)" value={claveNueva} onChangeText={setClaveNueva} secureTextEntry />
              <Boton title="Cambiar y cerrar sesiones" tono="neutro" onPress={cambiarClave} disabled={ocupado} />
            </View>
          )}
        </Card>

        {/* ── listas de sanciones ────────────────────────────────────────── */}
        <Card>
          <Text style={st.cardT}>Listas de sanciones</Text>
          {listas ? (
            <>
              <Dato k="Registros cargados" v={(listas.estado?.registros ?? 0).toLocaleString('es')}
                color={(listas.estado?.registros ?? 0) > 0 ? C.ok : C.bad} />
              <Dato k="Fuentes" v={(listas.estado?.fuentes || []).join(', ') || 'ninguna'} />
              <Dato k="Descargadas hace" v={listas.estado?.diasDesdeDescarga != null ? `${listas.estado.diasDesdeDescarga} días` : '—'}
                color={listas.estado?.vencidas ? C.warn : undefined} />
              <Dato k="GAFI" v={listas.gafi?.fecha ? `plenaria del ${listas.gafi.fecha}` : 'sin cargar'} />
            </>
          ) : <Text style={st.mut}>Cargando…</Text>}
          {esAdmin && (
            <View style={{ marginTop: 10 }}>
              <Boton title={ocupado ? 'Trabajando…' : 'Actualizar desde la OFAC y retamizar'}
                icon="sync" tono="neutro" onPress={traerOfac} disabled={ocupado} />
              <Text style={[st.mut, { marginTop: 8 }]}>
                Baja la lista SDN oficial, la guarda y vuelve a tamizar todas las
                identidades. Lo que aparezca abre caso solo.
              </Text>
            </View>
          )}
        </Card>

        {/* ── bitácora ───────────────────────────────────────────────────── */}
        <Card>
          <Text style={st.cardT}>Bitácora</Text>
          <BotonPlano title={verBitacora ? 'Ocultar' : 'Ver las últimas 60 entradas'}
            icon="document-text" onPress={cargarBitacora} style={{ alignSelf: 'flex-start' }} />
          {verBitacora && bitacora && (
            <>
              <View style={st.cadena}>
                <Icon name={bitacora.cadena?.integra ? 'checkmark-circle' : 'warning'} size={16}
                  color={bitacora.cadena?.integra ? C.ok : C.crit} />
                <Text style={[st.mut, !bitacora.cadena?.integra && { color: C.crit, fontWeight: '700' }]}>
                  {bitacora.cadena?.integra
                    ? `Cadena íntegra: ${bitacora.cadena.total} entradas, ninguna alterada`
                    : `LA CADENA ESTÁ ROTA en la entrada ${bitacora.cadena?.rotaEn} — alguien tocó el registro`}
                </Text>
              </View>
              {(bitacora.entradas || []).slice(0, 60).map((e) => (
                <View key={e.id} style={st.entrada}>
                  <Text style={st.entradaQue}>{e.accion} → {e.objeto}</Text>
                  <Text style={st.entradaQuien}>{e.actor} · {new Date(e.fecha).toLocaleString('es')}</Text>
                </View>
              ))}
            </>
          )}
        </Card>

        {/* ── la app ─────────────────────────────────────────────────────── */}
        <Card>
          <Text style={st.cardT}>Esta app</Text>
          <Dato k="Servidor" v={api.servidor()} />
          <Dato k="Canal de updates" v={enUso.canal || 'desarrollo'} />
          <Dato k="Paquete en uso" v={enUso.esDelBinario ? 'el del APK original' : (enUso.id || '').slice(0, 8) || '—'} />
          {puedeActualizar() ? (
            <View style={{ marginTop: 10 }}>
              {update === 'lista' ? (
                <Boton title="Reiniciar y aplicar la actualización" icon="refresh" onPress={aplicarActualizacion} />
              ) : (
                <BotonPlano title={update === 'buscando' ? 'Buscando…' : update === 'aldia' ? 'Al día ✓ — buscar otra vez' : 'Buscar actualización por aire'}
                  icon="sync" onPress={revisarUpdate} disabled={update === 'buscando'} />
              )}
            </View>
          ) : (
            <Text style={[st.mut, { marginTop: 8 }]}>
              Corriendo en desarrollo: los updates por aire llegan solo en el APK instalado.
            </Text>
          )}
        </Card>

        <Text style={st.pie}>Genesis ID · Orden Global{'\n'}Cada acción queda firmada en la bitácora.</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  cardT: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 8 },
  mut: { color: C.txt3, fontSize: 12, lineHeight: 17, flex: 1 },
  cadena: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, marginBottom: 6 },
  entrada: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  entradaQue: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  entradaQuien: { color: C.txt3, fontSize: 10.5, marginTop: 1 },
  pie: { color: C.txt3, fontSize: 10.5, textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
