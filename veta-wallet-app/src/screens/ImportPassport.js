import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, Card, hap, useToast, useAccount } from '../ui';
import { mergePassport, passportFromText, genesis } from '../genesis';
import { setPassport } from '../accounts';
import { ScanModal } from './Scan';
import { tipoDeArchivo, guardarImagen, limpiarAnteriores, leerTexto, TIPOS } from '../passportFile';
import { useT } from '../i18n';

// ============================================================
// Traer el pasaporte Genesis ID a la app.
//
// El portal no siempre da un .json: lo normal es que lo que se descargue sea
// una IMAGEN o un PDF del pasaporte. Por eso hay dos caminos:
//
//   Automático → archivo .json, QR o código pegado: rellena todo solo.
//   Manual     → subes la imagen del pasaporte y escribes los datos.
//
// El manual es el que garantiza que nadie se quede con el titular en blanco
// esperando a que el portal publique su API.
// ============================================================

const vacio = { genesisUid: '', fullName: '', documentId: '', nationality: '', birthDate: '', photoUrl: '' };

export default function ImportPassport({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account, login } = useAccount();
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  const [err, setErr] = useState(null);
  const [scan, setScan] = useState(false);
  const [form, setForm] = useState(vacio);
  const [manual, setManual] = useState(false);

  // Arranca con lo que ya se sepa: así el formulario corrige un pasaporte
  // incompleto en vez de pedir todo otra vez.
  useEffect(() => {
    const p = account?.passport;
    setForm({
      genesisUid: p?.genesisUid || account?.genesisUid || '',
      fullName: p?.fullName && p.fullName !== account?.name ? p.fullName : (p?.fullName || ''),
      documentId: p?.documentId || '',
      nationality: p?.nationality || '',
      birthDate: p?.birthDate || '',
      photoUrl: p?.photoUrl || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email, account?.passport?.genesisUid]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function guardar(p) {
    if (!account?.email) { setErr(t('auth.errGeneric')); return; }
    let full = p;
    try {
      const remoto = await genesis.status(account.email, account.addr);
      full = mergePassport(remoto, p); // lo que trae el usuario manda
    } catch (e) {}
    full.email = full.email || account.email;
    full.walletAddress = full.walletAddress || account.addr;
    if (!full.status) full.status = 'verified';
    await genesis.save(full);
    const updated = await setPassport(account.email, full);
    if (updated) login(updated);
    hap();
    toast(t('imp.ok'));
    nav.go('passport');
  }

  // ---- 1. Archivo descargado del portal (json, imagen o PDF) ----
  async function fromFile() {
    hap(); setErr(null); setBusy(true);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.length) { setBusy(false); return; }
      const a = r.assets[0];
      const tipo = tipoDeArchivo(a.name, a.mimeType);

      if (tipo === TIPOS.IMAGEN) {
        // Es la foto del pasaporte: se guarda y se piden los datos.
        const ruta = await guardarImagen(a.uri, (a.name || 'jpg').split('.').pop());
        await limpiarAnteriores(ruta);
        setForm((f) => ({ ...f, photoUrl: ruta }));
        setManual(true);
        setErr(null);
        toast(t('imp.imgOk'));
        setBusy(false);
        return;
      }
      if (tipo === TIPOS.PDF) {
        // De un PDF no se puede sacar la foto ni los campos en el teléfono.
        setManual(true);
        setErr(t('imp.errPdf'));
        setBusy(false);
        return;
      }

      const txt = await leerTexto(a.uri);
      const p = txt ? passportFromText(txt) : null;
      if (!p) { setManual(true); setErr(t('imp.errRead')); setBusy(false); return; }
      await guardar(p);
    } catch (e) {
      setManual(true);
      setErr(t('imp.errRead'));
    } finally { setBusy(false); }
  }

  // ---- 2. Foto del pasaporte desde la galería ----
  async function fromGallery() {
    hap(); setErr(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setErr(t('imp.errPerm')); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (r.canceled || !r.assets?.length) return;
      const ruta = await guardarImagen(r.assets[0].uri, 'jpg');
      await limpiarAnteriores(ruta);
      setForm((f) => ({ ...f, photoUrl: ruta }));
      setManual(true);
      toast(t('imp.imgOk'));
    } catch (e) { setErr(t('imp.errRead')); }
  }

  // ---- 3. QR del portal ----
  async function fromQr(data) {
    setBusy(true);
    const p = passportFromText(data);
    if (p) await guardar(p); else { setManual(true); setErr(t('imp.errRead')); }
    setBusy(false);
  }

  // ---- 4. Pegar el código ----
  async function fromPaste() {
    hap(); setErr(null);
    let txt = pasted;
    if (!txt.trim()) {
      try { txt = await Clipboard.getStringAsync(); setPasted(txt); } catch (e) {}
    }
    if (!txt?.trim()) { setErr(t('imp.errEmpty')); return; }
    setBusy(true);
    const p = passportFromText(txt);
    if (p) await guardar(p); else { setManual(true); setErr(t('imp.errRead')); }
    setBusy(false);
  }

  // ---- 5. A mano ----
  async function guardarManual() {
    if (!form.fullName.trim()) { setErr(t('imp.errName')); return; }
    const gid = form.genesisUid.trim() || account?.genesisUid || account?.passport?.genesisUid;
    if (!gid) { setErr(t('imp.errGid')); return; }
    setErr(null); setBusy(true);
    await guardar({
      genesisUid: gid,
      fullName: form.fullName.trim(),
      documentId: form.documentId.trim() || null,
      nationality: form.nationality.trim() || null,
      birthDate: form.birthDate.trim() || null,
      photoUrl: form.photoUrl || null,
      status: 'verified',
    });
    setBusy(false);
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('imp.title')} sub={t('imp.sub')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {!manual ? (
          <>
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
            <Button3D title={t('imp.photo')} icon="image" variant="teal" onPress={busy ? () => {} : fromGallery} />
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

            {/* Salida siempre disponible: escribir los datos a mano. */}
            <Pressable onPress={() => { hap(); setErr(null); setManual(true); }} style={st.manualLink}>
              <Icon name="create" size={15} color={C.gold} />
              <Text style={st.manualTxt}>{t('imp.manual')}</Text>
            </Pressable>

            <Text style={st.foot}>{t('imp.foot')}</Text>
          </>
        ) : (
          <>
            <Text style={st.h1}>{t('imp.manualT')}</Text>
            <Text style={st.body}>{t('imp.manualP')}</Text>
            {err && <Text style={st.err}>{err}</Text>}

            {/* Foto del titular */}
            <Pressable onPress={fromGallery} style={st.fotoWrap}>
              {form.photoUrl ? (
                <Image source={{ uri: form.photoUrl }} style={st.foto} />
              ) : (
                <View style={[st.foto, st.fotoVacia]}>
                  <Icon name="image" size={26} color={C.txt3} />
                  <Text style={st.fotoTxt}>{t('imp.addPhoto')}</Text>
                </View>
              )}
              <Text style={st.fotoHint}>{form.photoUrl ? t('imp.changePhoto') : t('imp.photoHint')}</Text>
            </Pressable>

            <Campo label={t('prof.name')} value={form.fullName} onChangeText={set('fullName')} placeholder="José Enamorado" />
            <Campo label={t('pass.uid')} value={form.genesisUid} onChangeText={set('genesisUid')} placeholder="GID-98y242-HND" autoCapitalize="characters" />
            <Campo label={t('pass.doc')} value={form.documentId} onChangeText={set('documentId')} placeholder="0801-1994-01234" />
            <Campo label={t('pass.nat')} value={form.nationality} onChangeText={set('nationality')} placeholder="Honduras" />
            <Campo label={t('pass.dob')} value={form.birthDate} onChangeText={set('birthDate')} placeholder="1994-03-12" />

            {busy && <ActivityIndicator color={C.gold} style={{ marginBottom: 14 }} />}
            <Button3D title={t('prof.save')} icon="checkmark" onPress={busy ? () => {} : guardarManual} />
            <Pressable onPress={() => { hap(); setManual(false); setErr(null); }} style={st.manualLink}>
              <Text style={[st.manualTxt, { color: C.txt3 }]}>{t('imp.backAuto')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <ScanModal visible={scan} mode="text" onResult={fromQr} onClose={() => setScan(false)} />
    </View>
  );
}

function Campo({ label, ...props }) {
  return (
    <View style={{ marginBottom: 13 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput placeholderTextColor="#6f938f" autoCorrect={false} style={st.input} {...props} />
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
  err: { color: C.down, fontSize: 12.5, marginBottom: 12, textAlign: 'center', lineHeight: 18 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dline: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dtxt: { color: C.txt3, fontSize: 12 },
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 15 },
  area: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, padding: 14, color: C.txt, fontSize: 13, minHeight: 96, textAlignVertical: 'top' },
  foot: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 18, lineHeight: 17 },
  manualLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18, paddingVertical: 8 },
  manualTxt: { color: C.gold, fontSize: 13, fontWeight: '600' },
  fotoWrap: { alignItems: 'center', marginBottom: 20 },
  foto: { width: 116, height: 116, borderRadius: 58, borderWidth: 2, borderColor: C.gold },
  fotoVacia: { backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: 'rgba(201,169,97,0.5)', gap: 5 },
  fotoTxt: { color: C.txt3, fontSize: 10.5 },
  fotoHint: { color: C.gold, fontSize: 12, fontWeight: '600', marginTop: 10 },
});
