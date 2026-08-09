// Las apps del ecosistema y sus claves de API.
//
// LA CLAVE SE ENSEÑA UNA SOLA VEZ
//
// El servidor solo guarda un hash: cuando se crea o se rota una aplicación,
// devuelve la clave en claro esa única vez y después ya no existe en ninguna
// parte. Por eso aquí se queda fija en pantalla hasta que se toca «Ya la
// guardé», en vez de un aviso que se va solo — un toast de tres segundos con
// un secreto irrecuperable es una forma de perderlo.
//
// No se copia al portapapeles ni se guarda en ningún sitio del teléfono: el
// texto es seleccionable y nada más. Un secreto en el portapapeles queda a la
// vista de cualquier otra app que lo lea.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Cabecera, Card, Boton, Campo, Pastilla, Vacio, hap } from '../ui';
import * as api from '../api';

const fecha = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('es');
};

export function Aplicaciones({ volver, avisar }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState({ clave: '', nombre: '', alcances: [] });
  // La clave recién emitida, a la espera de que la guarden.
  const [secreta, setSecreta] = useState(null);

  async function traer() {
    const r = await api.aplicaciones();
    setCargando(false);
    if (r.error) { setError(r.error); return; }
    setError(null);
    setDatos(r);
  }

  useEffect(() => { traer(); }, []);

  async function crear() {
    if (!nueva.clave || !nueva.nombre || !nueva.alcances.length) {
      avisar('Faltan clave, nombre y al menos un alcance.', true); return;
    }
    hap();
    setOcupado(true);
    const r = await api.crearAplicacion(nueva.clave, nueva.nombre, nueva.alcances);
    setOcupado(false);
    if (r.error) { avisar(r.error, true); return; }
    setSecreta({ clave: r.aplicacion.clave, valor: r.clave_secreta, motivo: 'creada' });
    setNueva({ clave: '', nombre: '', alcances: [] });
    setCreando(false);
    traer();
  }

  async function rotar(a) {
    hap();
    setOcupado(true);
    const r = await api.rotarAplicacion(a.id);
    setOcupado(false);
    if (r.error) { avisar(r.error, true); return; }
    setSecreta({ clave: a.clave, valor: r.clave_secreta, motivo: 'rotada' });
    traer();
  }

  async function revocar(a) {
    hap();
    setOcupado(true);
    const r = await api.revocarAplicacion(a.id);
    setOcupado(false);
    if (r.error) { avisar(r.error, true); return; }
    avisar(`${a.clave} revocada — deja de funcionar ya`);
    traer();
  }

  // Mientras haya una clave sin guardar, esa es la pantalla entera. Cualquier
  // otra cosa arriba invita a irse sin copiarla.
  if (secreta) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecera titulo="Clave nueva" sub={`${secreta.clave} · ${secreta.motivo}`} />
        <ScrollView contentContainerStyle={{ padding: 14 }}>
          <Card style={{ borderColor: C.warn }}>
            <View style={st.filaTit}>
              <Icon name="lock-closed" size={16} color={C.warn} />
              <Text style={[st.h, { color: C.warn }]}>Se enseña una sola vez</Text>
            </View>
            <Text style={st.explica}>
              El servidor solo guarda una huella de esta clave. Si salís de aquí
              sin apuntarla, no hay forma de recuperarla — habría que rotarla otra
              vez, y la anterior dejaría de funcionar.
            </Text>
            <View style={st.caja}>
              <Text selectable style={st.clave}>{secreta.valor}</Text>
            </View>
            <Text style={st.nota}>
              Mantené el dedo sobre la clave para seleccionarla. No se copia sola
              al portapapeles a propósito: ahí queda a la vista de otras apps.
            </Text>
            <Boton title="Ya la guardé" icon="checkmark-circle"
              onPress={() => { hap(); setSecreta(null); }} />
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Aplicaciones" sub="las apps del ecosistema y sus claves" onAtras={volver} />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 34 }}
        keyboardShouldPersistTaps="handled">

        {cargando ? (
          <ActivityIndicator color={C.gold} style={{ marginTop: 30 }} />
        ) : error ? (
          <Vacio icon="lock-closed" titulo="No tenés permiso"
            detalle={`${error}\n\nLas claves de API las maneja quien tiene el rol de administración.`} />
        ) : (
          <>
            {(datos.aplicaciones || []).map((a) => (
              <Card key={a.id} style={{ marginBottom: 10 }}>
                <View style={st.cabeza}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.nombre}>{a.nombre}</Text>
                    <Text style={st.clavePub}>{a.clave}</Text>
                  </View>
                  <Pastilla texto={a.activa ? 'activa' : 'revocada'}
                    color={a.activa ? C.ok : C.txt3} />
                </View>

                <Text style={st.pista}>clave …{a.pistaClave}</Text>
                <View style={st.alcances}>
                  {(a.alcances || []).map((x) => (
                    <Pastilla key={x} texto={x} color={C.cyan} />
                  ))}
                </View>
                <Text style={st.fechas}>
                  creada {fecha(a.creadaEn) || '—'}
                  {a.ultimoUso ? ` · usada ${fecha(a.ultimoUso)}` : ' · nunca usada'}
                </Text>

                {a.activa ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Boton title="Rotar clave" icon="sync" tono="neutro"
                        disabled={ocupado} onPress={() => rotar(a)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Boton title="Revocar" icon="close-circle" tono="mal"
                        disabled={ocupado} onPress={() => revocar(a)} />
                    </View>
                  </View>
                ) : null}
              </Card>
            ))}

            {!creando ? (
              <Boton title="Registrar aplicación" icon="cloud-upload" tono="neutro"
                onPress={() => { hap(); setCreando(true); }} />
            ) : (
              <Card style={{ marginTop: 12 }}>
                <Text style={st.h}>Aplicación nueva</Text>
                <Campo label="Clave (identificador corto, sin espacios)" value={nueva.clave}
                  autoCapitalize="none"
                  onChangeText={(v) => setNueva({ ...nueva, clave: v.trim() })} />
                <Campo label="Nombre" value={nueva.nombre}
                  onChangeText={(v) => setNueva({ ...nueva, nombre: v })} />

                <Text style={st.etiqueta}>Alcances — solo lo que de verdad necesite</Text>
                <View style={st.alcances}>
                  {(datos.alcancesDisponibles || []).map((x) => {
                    const puesto = nueva.alcances.includes(x);
                    return (
                      <Pressable key={x} onPress={() => {
                        hap();
                        setNueva({
                          ...nueva,
                          alcances: puesto
                            ? nueva.alcances.filter((y) => y !== x)
                            : [...nueva.alcances, x],
                        });
                      }}>
                        <Pastilla texto={x} color={puesto ? C.gold : C.txt3} />
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ gap: 8, marginTop: 12 }}>
                  <Boton title="Crear y ver la clave" icon="checkmark-circle"
                    disabled={ocupado} onPress={crear} />
                  <Boton title="Cancelar" tono="neutro" disabled={ocupado}
                    onPress={() => { hap(); setCreando(false); }} />
                </View>
              </Card>
            )}

            <Text style={st.pie}>
              Revocar corta el acceso de esa app en el acto. Rotar emite una clave
              nueva y la anterior deja de servir: hay que cambiarla en la app antes
              de que vuelva a llamar, o se queda fuera.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  cabeza: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nombre: { color: C.txt, fontSize: 14.5, fontWeight: '700' },
  clavePub: { color: C.txt3, fontSize: 11.5 },
  pista: { color: C.txt3, fontSize: 11, marginTop: 6, fontVariant: ['tabular-nums'] },
  alcances: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  fechas: { color: C.txt3, fontSize: 10.5, marginTop: 7 },
  h: { color: C.gold, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8 },
  filaTit: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  explica: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  caja: {
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line,
    borderRadius: 10, padding: 14, marginBottom: 10,
  },
  clave: {
    color: C.goldHi, fontSize: 14, fontWeight: '600',
    fontVariant: ['tabular-nums'], lineHeight: 21,
  },
  nota: { color: C.txt3, fontSize: 11, lineHeight: 16, marginBottom: 14 },
  etiqueta: { color: C.txt2, fontSize: 12, marginTop: 4 },
  pie: { color: C.txt3, fontSize: 11, lineHeight: 16, marginTop: 20 },
});
