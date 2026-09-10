// Entrada de operadores. El servidor limita a 10 intentos por minuto y
// bloquea 15 minutos tras 5 fallos — el mensaje del servidor ya lo dice y
// aquí solo se muestra tal cual, sin suavizarlo.

import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { Marca } from '../marca';
import { C } from '../theme';
import { Boton, BotonPlano, Campo, Card, hap } from '../ui';
import * as api from '../api';

export function Entrar({ alEntrar }) {
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [url, setUrl] = useState(api.servidor());

  async function enviar() {
    if (!email.trim() || !contrasena) { setError('Escribí tu correo y tu contraseña.'); return; }
    hap(); setOcupado(true); setError(null);
    const r = await api.entrar(email.trim().toLowerCase(), contrasena);
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    alEntrar(r.operador);
  }

  async function guardarUrl() {
    const r = await api.cambiarServidor(url);
    if (r.error) { setError(r.error); return; }
    setError(null); setAjustes(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.lienzo} keyboardShouldPersistTaps="handled">
        {/* La marca oficial, y no el icono del launcher: es la primera
            pantalla que ve un operador y tiene que ser la casa. Mientras se
            comprueba la contraseña, late — la espera se ve, no se adivina. */}
        <Marca size={96} latiendo={ocupado} style={st.sello} />
        <Text style={st.titulo}>Genesis <Text style={{ color: '#F5B32B' }}>ID</Text></Text>
        <Text style={st.sub}>Panel de cumplimiento · Orden Global</Text>

        <Card style={{ alignSelf: 'stretch', padding: 18, marginTop: 26 }}>
          <Campo label="Correo" value={email} onChangeText={setEmail}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            placeholder="operador@ordenglobal.link" />
          <Campo label="Contraseña" value={contrasena} onChangeText={setContrasena}
            secureTextEntry={!verClave} placeholder="••••••••••••" />
          <BotonPlano title={verClave ? 'Ocultar contraseña' : 'Ver contraseña'}
            icon={verClave ? 'eye-off' : 'eye'} color={C.txt3}
            onPress={() => setVerClave(!verClave)} style={{ alignSelf: 'flex-start', marginTop: -8 }} />

          {error ? (
            <View style={st.error}>
              <Icon name="alert-circle" size={17} color={C.bad} />
              <Text style={st.errorTxt}>{error}</Text>
            </View>
          ) : null}

          <Boton title={ocupado ? 'Entrando…' : 'Entrar'} icon="finger-print"
            onPress={enviar} disabled={ocupado} style={{ marginTop: 6 }} />
        </Card>

        <BotonPlano title={ajustes ? 'Cerrar ajustes' : 'Cambiar servidor'} icon="construct"
          color={C.txt3} onPress={() => setAjustes(!ajustes)} />
        {ajustes && (
          <Card style={{ alignSelf: 'stretch', padding: 16 }}>
            <Campo label="URL del servidor Genesis ID" value={url} onChangeText={setUrl}
              autoCapitalize="none" autoCorrect={false} placeholder="https://genesis-id.onrender.com" />
            <Boton title="Guardar" tono="neutro" onPress={guardarUrl} />
          </Card>
        )}

        <Text style={st.pie}>
          Cada decisión que tomes acá queda firmada con tu nombre en la bitácora.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  lienzo: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 26 },
  sello: { marginBottom: 2 },
  titulo: { color: C.txt, fontSize: 26, fontWeight: '800', marginTop: 14 },
  sub: { color: C.txt3, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 4 },
  error: {
    flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: 'rgba(240,119,107,0.1)',
    borderWidth: 1, borderColor: 'rgba(240,119,107,0.35)', borderRadius: 11,
    padding: 11, marginBottom: 12,
  },
  errorTxt: { color: '#f4b4ac', fontSize: 12.5, flex: 1, lineHeight: 17 },
  pie: { color: C.txt3, fontSize: 11, textAlign: 'center', marginTop: 18, lineHeight: 16, maxWidth: 300 },
});
