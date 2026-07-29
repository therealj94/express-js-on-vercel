import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, Card, hap, useToast, useAccount } from '../ui';
import { mergePassport, passportFromText, genesis } from '../genesis';
import { setPassport } from '../accounts';
import { ScanModal } from './Scan';
import { useT } from '../i18n';

// ============================================================
// Importar el pasaporte descargado desde genesisid.online.
// Tres vías, por si una no está disponible:
//   1. Archivo  → el .json que descargas del portal
//   2. QR       → el código que muestra el portal
//   3. Pegar    → pegar el contenido/código
// Todas terminan en el mismo sitio: se normaliza (passportFromText, en
// genesis.js) y se guarda en la cuenta, rellenando el perfil.
// ============================================================

export default function ImportPassport({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account, login } = useAccount();
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  const [err, setErr] = useState(null);
  const [scan, setScan] = useState(false);

  async function apply(p) {
    if (!p) { setErr(t('imp.errRead')); return; }
    if (!account?.email) { setErr(t('auth.errGeneric')); return; }
    // El archivo que trae el usuario MANDA (por eso lo importa); lo que sepa
    // el motor solo rellena los huecos.
    let full = p;
    try {
      const remoto = await genesis.status(account.email, account.addr);
      full = mergePassport(remoto, p);
    } catch (e) {}
    full.email = full.email || account.email;
    full.walletAddress = full.walletAddress || account.addr;
    await genesis.save(full);
    const updated = await setPassport(account.email, full);
    if (updated) login(updated);
    hap();
    toast(t('imp.ok'));
    nav.go('passport');
  }

  // ---- 1. Archivo descargado del portal ----
  async function fromFile() {
    hap(); setErr(null); setBusy(true);
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (r.canceled || !r.assets?.length) { setBusy(false); return; }
      const txt = await FileSystem.readAsStringAsync(r.assets[0].uri);
      await apply(passportFromText(txt));
    } catch (e) {
      setErr(t('imp.errRead'));
    } finally { setBusy(false); }
  }

  // ---- 2. Código QR del portal ----
  async function fromQr(data) {
    setBusy(true);
    await apply(passportFromText(data));
    setBusy(false);
  }

  // ---- 3. Pegar el código ----
  async function fromPaste() {
    hap(); setErr(null);
    let txt = pasted;
    if (!txt.trim()) {
      try { txt = await Clipboard.getStringAsync(); setPasted(txt); } catch (e) {}
    }
    if (!txt?.trim()) { setErr(t('imp.errEmpty')); return; }
    setBusy(true);
    await apply(passportFromText(txt));
    setBusy(false);
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('imp.title')} sub={t('imp.sub')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={st.heroIcon}><Icon name="shield-checkmark" size={30} color={C.gold} /></View>
        <Text style={st.h1}>{t('imp.h1')}</Text>
        <Text style={st.body}>{t('imp.p')}</Text>

        <Card style={{ padding: 16, marginBottom: 18 }}>
          <Text style={st.cardT}>{t('imp.howT')}</Text>
          <Step n="1" txt={t('imp.how1')} />
          <Step n="2" txt={t('imp.how2')} />
          <Step n="3" txt={t('imp.how3')} />
        </Card>

        {busy && <ActivityIndicator color={C.gold} style={{ marginBottom: 16 }} size="large" />}
        {err && <Text style={st.err}>{err}</Text>}

        <Button3D title={t('imp.file')} icon="cloud-upload" onPress={busy ? () => {} : fromFile} />
        <View style={{ height: 10 }} />
        <Button3D title={t('imp.qr')} icon="qr-code" variant="teal" onPress={busy ? () => {} : () => { hap(); setErr(null); setScan(true); }} />

        <View style={st.divider}><View style={st.dline} /><Text style={st.dtxt}>{t('imp.or')}</Text><View style={st.dline} /></View>

        <Text style={st.label}>{t('imp.paste')}</Text>
        <TextInput
          value={pasted}
          onChangeText={setPasted}
          placeholder={t('imp.pastePh')}
          placeholderTextColor="#6f938f"
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={st.area}
        />
        <Button3D title={t('imp.pasteBtn')} icon="copy" variant="teal" onPress={busy ? () => {} : fromPaste} style={{ marginTop: 12 }} />

        <Text style={st.foot}>{t('imp.foot')}</Text>
      </ScrollView>
      <ScanModal visible={scan} mode="text" onResult={fromQr} onClose={() => setScan(false)} />
    </View>
  );
}

function Step({ n, txt }) {
  return (
    <View style={st.step}>
      <View style={st.stepN}><Text style={st.stepNTxt}>{n}</Text></View>
      <Text style={st.stepTxt}>{txt}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  heroIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  h1: { color: C.txt, fontWeight: '800', fontSize: 21, lineHeight: 27, marginBottom: 8, textAlign: 'center' },
  body: { color: C.txt2, fontSize: 13, lineHeight: 19, marginBottom: 18, textAlign: 'center' },
  cardT: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 9 },
  stepN: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(201,169,97,0.15)', alignItems: 'center', justifyContent: 'center' },
  stepNTxt: { color: C.gold, fontWeight: '800', fontSize: 12 },
  stepTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  err: { color: C.down, fontSize: 12.5, marginBottom: 12, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dline: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dtxt: { color: C.txt3, fontSize: 12 },
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  area: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, padding: 14, color: C.txt, fontSize: 13, minHeight: 96, textAlignVertical: 'top' },
  foot: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 18, lineHeight: 17 },
});
