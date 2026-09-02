import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { PantallaConTeclado, useCampoAuto } from '../og/Teclado';
import { Icon } from '../icons';
import { C, T } from '../theme';
import { Header, Button3D, Glass, hap, useAccount, useToast } from '../ui';
import { apiChangePassword, loadCreds, saveCreds } from '../api';
import { desbloqueoActivo, activarDesbloqueo } from '../unlock';
import { passwordStrength } from './Auth';
import { useT } from '../i18n';

// ============================================================
// Cambiar la contraseña.
//
// No existía. La ruta del backend (POST /users/changePassword) estaba desde el
// primer día y ninguna pantalla la llamaba: quien sospechaba que le habían
// entrado solo tenía «olvidé mi contraseña» y el correo. Es la pantalla que
// un banco pone primero en Seguridad, y aquí faltaba.
//
// Lo que pasa al cambiarla, y por qué:
//   · El backend verifica la actual y exige ocho o más. Aquí se comprueba lo
//     mismo ANTES de mandar nada: la ruta tiene un limitador de cinco intentos
//     cada quince minutos y un error de tipeo no tiene por qué gastar uno.
//   · Cierra las demás sesiones abiertas con la cuenta. La de este teléfono
//     sigue viva porque el servidor devuelve un par nuevo (token y refresco).
//     Si el servidor todavía es el anterior y no lo devuelve, la sesión de
//     aquí también murió: se dice y se manda a entrar de nuevo, en vez de
//     dejar que la siguiente pantalla falle con «sesión vencida».
//   · Lo que el teléfono guardaba con la contraseña VIEJA se actualiza:
//     «Recordarme» y el desbloqueo biométrico. Sin esto, la próxima
//     renovación silenciosa fallaría con la clave de antes y el desbloqueo
//     con huella diría «la contraseña guardada ya no sirve».
// ============================================================

export default function ChangePassword({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account, logout } = useAccount();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repite, setRepite] = useState('');
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Cada campo se sube por encima del teclado al enfocarlo (ver og/Teclado).
  const cActual = useCampoAuto();
  const cNueva = useCampoAuto();
  const cRepite = useCampoAuto();

  const fuerza = passwordStrength(nueva, t);
  // Lo que se le puede decir antes de tocar el servidor.
  const aviso = !nueva ? null
    : nueva.length < 8 ? t('cp.errCorta')
      : nueva === actual ? t('cp.errMisma')
        : repite && repite !== nueva ? t('cp.errNoCoincide')
          : null;
  const lista = !!actual && nueva.length >= 8 && nueva === repite && nueva !== actual && !busy;

  async function cambiar() {
    if (!lista) { setErr(aviso || t('cp.errCorta')); return; }
    hap();
    setBusy(true); setErr(null);
    try {
      const r = await apiChangePassword({ actual, nueva });

      // Lo que este teléfono guardaba con la contraseña vieja.
      try {
        const creds = await loadCreds();
        if (creds?.email && account?.email && creds.email.toLowerCase() === account.email.toLowerCase()) {
          await saveCreds(creds.email, nueva);
        }
        if (await desbloqueoActivo()) await activarDesbloqueo(nueva);
      } catch (e) {}

      if (r.token) {
        toast(t('cp.listo'));
        nav.back();
      } else {
        // Servidor anterior: revocó también esta sesión. Se dice y se entra
        // de nuevo con la contraseña nueva; no se deja que lo descubra la
        // siguiente pantalla con un error de sesión.
        toast(t('cp.listoEntrar'), 'info');
        logout();
        nav.go('auth');
      }
    } catch (e) {
      const s = e?.status;
      setErr(
        s === 401 ? t('cp.errActual')
          : s === 429 ? t('cp.errMuchos')
            : e?.code === 'red' || e?.code === 'timeout' ? t('auth.errNet')
              : (e?.message || t('auth.errGeneric')),
      );
    } finally {
      setBusy(false);
    }
  }

  const campo = (label, value, onChange, auto, extra = {}) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.label}>{label}</Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={auto.ref}
          onFocus={auto.onFocus}
          value={value}
          onChangeText={(v) => { onChange(v); if (err) setErr(null); }}
          secureTextEntry={!ver}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="••••••••"
          placeholderTextColor="#6f938f"
          style={st.input}
          accessibilityLabel={label}
          {...extra}
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('cp.title')} onBack={() => nav.back()} />
      <PantallaConTeclado contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <View style={st.intro}>
          <View style={st.introIc}><Icon name="lock-closed" size={22} color={C.gold} /></View>
          <Text style={st.introTxt}>{t('cp.intro')}</Text>
        </View>

        <Glass style={st.card}>
          {campo(t('cp.actual'), actual, setActual, cActual, { textContentType: 'password', autoFocus: true })}
          {campo(t('cp.nueva'), nueva, setNueva, cNueva, { textContentType: 'newPassword' })}
          {nueva.length > 0 ? (
            <View style={{ marginTop: -6, marginBottom: 12 }}>
              <View style={st.meter}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[st.meterSeg, { backgroundColor: i < fuerza.score ? fuerza.color : 'rgba(255,255,255,0.08)' }]} />
                ))}
              </View>
              <Text style={[st.meterLbl, { color: fuerza.color }]}>{fuerza.label}</Text>
            </View>
          ) : null}
          {campo(t('cp.repetir'), repite, setRepite, cRepite, { textContentType: 'newPassword', onSubmitEditing: cambiar, returnKeyType: 'go' })}

          <Pressable onPress={() => { hap(); setVer(!ver); }} style={st.verFila} accessibilityRole="button" accessibilityLabel={t(ver ? 'clave.ocultar' : 'clave.mostrar')}>
            <Icon name={ver ? 'eye-off' : 'eye'} size={17} color={C.txt2} />
            <Text style={st.verTxt}>{t(ver ? 'clave.ocultar' : 'clave.mostrar')}</Text>
          </Pressable>

          {(err || aviso) ? <Text style={st.err}>{err || aviso}</Text> : null}

          <Button3D
            title={busy ? t('cp.enviando') : t('cp.cta')}
            icon="lock-closed"
            disabled={!lista}
            onPress={cambiar}
            style={{ marginTop: 16 }}
          />
        </Glass>

        <Text style={st.nota}>{t('cp.nota')}</Text>
      </PantallaConTeclado>
    </View>
  );
}

const st = StyleSheet.create({
  intro: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', backgroundColor: 'rgba(201,169,97,0.10)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.38)', borderRadius: 18, padding: 15, marginBottom: 16 },
  introIc: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(201,169,97,0.16)', alignItems: 'center', justifyContent: 'center' },
  introTxt: { ...T.cuerpo2, flex: 1 },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16 },
  label: { ...T.nota, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },
  meter: { flexDirection: 'row', gap: 5, marginTop: 2 },
  meterSeg: { flex: 1, height: 4, borderRadius: 2 },
  meterLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 6 },
  verFila: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 4 },
  verTxt: { ...T.cuerpo2, fontWeight: '600' },
  err: { color: C.down, fontSize: 12.5, marginTop: 10, lineHeight: 18 },
  nota: { ...T.nota, textAlign: 'center', marginTop: 18, paddingHorizontal: 8 },
});
