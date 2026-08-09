// Quién puede entrar al panel, y con qué permisos.
//
// El servidor exige rol '*' para esto. La app no esconde la pantalla a nadie:
// si no tenés el rol, el servidor responde 403 y se dice. Esconder un botón
// nunca fue un control de acceso, y quien sí tiene el rol necesita poder
// desactivar a alguien desde el teléfono un domingo.
//
// DESACTIVAR CIERRA SUS SESIONES EN EL ACTO
//
// Lo hace el servidor. Se avisa aquí porque es justo lo que se quiere cuando
// se desactiva a alguien con prisa —que deje de tener acceso YA, no cuando le
// caduque el token— y no se puede adivinar mirando el botón.

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

export function Operadores({ operador, volver, avisar }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ email: '', nombre: '', rol: '', contrasena: '' });

  async function traer() {
    const r = await api.operadores();
    setCargando(false);
    if (r.error) { setError(r.error); return; }
    setError(null);
    setDatos(r);
  }

  useEffect(() => { traer(); }, []);

  async function alternar(o) {
    hap();
    setOcupado(true);
    const r = await api.activarOperador(o.id, !o.activo);
    setOcupado(false);
    if (r.error) { avisar(r.error, true); return; }
    avisar(o.activo ? `${o.email} desactivado — sus sesiones se cerraron` : `${o.email} activado`);
    traer();
  }

  async function crear() {
    const { email, nombre, rol, contrasena } = nuevo;
    if (!email || !nombre || !rol || !contrasena) {
      avisar('Faltan correo, nombre, rol y contraseña.', true); return;
    }
    if (contrasena.length < 12) {
      avisar('La contraseña debe tener al menos 12 caracteres.', true); return;
    }
    hap();
    setOcupado(true);
    const r = await api.crearOperador({ email, nombre, rol, contrasena });
    setOcupado(false);
    if (r.error) { avisar(r.error, true); return; }
    avisar(`${email} creado con rol ${rol}`);
    setNuevo({ email: '', nombre: '', rol: '', contrasena: '' });
    setCreando(false);
    traer();
  }

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Operadores" sub="quién entra al panel" onAtras={volver} />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 34 }}
        keyboardShouldPersistTaps="handled">

        {cargando ? (
          <ActivityIndicator color={C.gold} style={{ marginTop: 30 }} />
        ) : error ? (
          <Vacio icon="lock-closed" titulo="No tenés permiso"
            detalle={`${error}\n\nEsta sección la maneja quien tiene el rol de administración.`} />
        ) : (
          <>
            {datos.operadores.map((o) => (
              <View key={o.id} style={st.fila}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={st.nombre}>{o.nombre}</Text>
                  <Text style={st.correo}>{o.email}</Text>
                  <View style={st.etiquetas}>
                    <Pastilla texto={o.rol} color={C.cyan} />
                    <Pastilla texto={o.activo ? 'activo' : 'desactivado'}
                      color={o.activo ? C.ok : C.txt3} />
                    {o.debeCambiarContrasena ? (
                      <Pastilla texto="debe cambiar clave" color={C.warn} />
                    ) : null}
                    {o.id === operador?.id ? <Pastilla texto="sos vos" color={C.gold} /> : null}
                  </View>
                  <Text style={st.ultimo}>
                    {o.ultimoAcceso ? `último acceso ${fecha(o.ultimoAcceso)}` : 'nunca entró'}
                  </Text>
                </View>
                {/* A uno mismo no se puede desactivar: lo impide el servidor, y
                    enseñar un botón que siempre falla es una trampa. */}
                {o.id !== operador?.id ? (
                  <Pressable onPress={() => alternar(o)} disabled={ocupado} hitSlop={8}
                    style={st.boton}>
                    <Icon name={o.activo ? 'person-remove' : 'person-add'} size={17}
                      color={o.activo ? C.bad : C.ok} />
                  </Pressable>
                ) : null}
              </View>
            ))}

            {!creando ? (
              <Boton title="Crear operador" icon="person-add" tono="neutro"
                onPress={() => { hap(); setCreando(true); }} />
            ) : (
              <Card style={{ marginTop: 12 }}>
                <Text style={st.h}>Operador nuevo</Text>
                <Campo label="Correo" value={nuevo.email} autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={(v) => setNuevo({ ...nuevo, email: v })} />
                <Campo label="Nombre" value={nuevo.nombre}
                  onChangeText={(v) => setNuevo({ ...nuevo, nombre: v })} />

                <Text style={st.etiqueta}>Rol</Text>
                <View style={st.roles}>
                  {(datos.roles || []).map((r) => (
                    <Pressable key={r} onPress={() => { hap(); setNuevo({ ...nuevo, rol: r }); }}>
                      <Pastilla texto={r} color={nuevo.rol === r ? C.gold : C.txt3} />
                    </Pressable>
                  ))}
                </View>
                {nuevo.rol && datos.permisos?.[nuevo.rol] ? (
                  <Text style={st.permisos}>
                    Podrá: {datos.permisos[nuevo.rol].join(' · ')}
                  </Text>
                ) : null}

                <Campo label="Contraseña (mínimo 12 caracteres)" value={nuevo.contrasena}
                  secureTextEntry autoCapitalize="none"
                  onChangeText={(v) => setNuevo({ ...nuevo, contrasena: v })} />

                <View style={{ gap: 8, marginTop: 6 }}>
                  <Boton title="Crear" icon="checkmark-circle" disabled={ocupado} onPress={crear} />
                  <Boton title="Cancelar" tono="neutro" disabled={ocupado}
                    onPress={() => { hap(); setCreando(false); }} />
                </View>
              </Card>
            )}

            <Text style={st.pie}>
              Desactivar a alguien cierra sus sesiones en el acto: deja de tener
              acceso ya mismo, no cuando le caduque el token.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: C.line2,
  },
  nombre: { color: C.txt, fontSize: 14, fontWeight: '700' },
  correo: { color: C.txt3, fontSize: 11.5 },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  ultimo: { color: C.txt3, fontSize: 10.5, marginTop: 2 },
  boton: { padding: 8 },
  h: { color: C.gold, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8 },
  etiqueta: { color: C.txt2, fontSize: 12, marginBottom: 6, marginTop: 4 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  permisos: { color: C.txt3, fontSize: 11, lineHeight: 16, marginTop: 6 },
  pie: { color: C.txt3, fontSize: 11, lineHeight: 16, marginTop: 20 },
});
