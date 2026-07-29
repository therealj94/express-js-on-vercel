import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, hap, useToast, useAccount } from '../ui';
import { listContacts, addContact, removeContact, toggleFav, isAddress, parseAddress } from '../addressBook';
import { ScanModal } from './Scan';
import { useT } from '../i18n';

const short = (a) => (a && a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a || '');

/** Libreta de direcciones: contactos guardados para enviar más rápido. */
export default function Contacts({ nav, params }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();
  const email = account?.email;
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null); // { name, address } cuando el modal está abierto
  const [scan, setScan] = useState(false);

  const load = useCallback(() => {
    if (email) listContacts(email).then(setList);
  }, [email]);
  useEffect(load, [load]);

  // Al elegir un contacto: si venimos desde Enviar, devuelve la dirección.
  function choose(c) {
    hap();
    if (params?.onPick) { params.onPick(c.address); nav.back(); return; }
    Clipboard.setStringAsync(c.address).then(() => toast(t('recv.copied'))).catch(() => {});
  }

  async function guardar() {
    const addr = parseAddress(edit.address);
    if (!addr) { toast(t('send.errAddr')); return; }
    try {
      await addContact(email, { name: edit.name, address: addr, fav: edit.fav });
      setEdit(null); load(); toast(t('con.saved'));
    } catch (e) { toast(t('send.errAddr')); }
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header
        title={t('con.title')}
        onBack={() => nav.back()}
        right={
          <Pressable onPress={() => { hap(); setEdit({ name: '', address: '', fav: false }); }} style={st.addBtn}>
            <Icon name="person-add" size={18} color={C.darkText} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110 }}>
        {list.length === 0 && (
          <View style={st.empty}>
            <View style={st.emptyIc}><Icon name="people" size={30} color={C.txt3} /></View>
            <Text style={st.emptyT}>{t('con.emptyT')}</Text>
            <Text style={st.emptyP}>{t('con.emptyP')}</Text>
          </View>
        )}

        {list.map((c) => (
          <Pressable key={c.id} onPress={() => choose(c)} style={st.row}>
            <LinearGradient colors={G.gold} style={st.av}>
              <Text style={st.avTxt}>{c.initials}</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={st.name} numberOfLines={1}>{c.name}</Text>
              <Text style={st.addr} numberOfLines={1}>{short(c.address)}</Text>
            </View>
            <Pressable onPress={async () => { hap(); await toggleFav(email, c.id); load(); }} style={st.iconBtn}>
              <Icon name="star" size={18} color={c.fav ? C.gold : C.txt3} />
            </Pressable>
            <Pressable onPress={async () => { hap(); await removeContact(email, c.id); load(); toast(t('con.removed')); }} style={st.iconBtn}>
              <Icon name="trash" size={18} color={C.txt3} />
            </Pressable>
          </Pressable>
        ))}

        <Button3D
          title={t('con.add')}
          icon="person-add"
          onPress={() => { hap(); setEdit({ name: '', address: '', fav: false }); }}
          style={{ marginTop: 18 }}
        />
      </ScrollView>

      {/* alta / edición */}
      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <Pressable style={st.sheetBg} onPress={() => setEdit(null)}>
          <Pressable style={st.sheet} onPress={() => {}}>
            <View style={st.grab} />
            <Text style={st.sheetT}>{t('con.newT')}</Text>

            <Text style={st.label}>{t('con.name')}</Text>
            <TextInput
              value={edit?.name}
              onChangeText={(v) => setEdit((e) => ({ ...e, name: v }))}
              placeholder={t('con.namePh')}
              placeholderTextColor="#6f938f"
              style={st.input}
            />

            <Text style={[st.label, { marginTop: 14 }]}>{t('send.to')}</Text>
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <TextInput
                value={edit?.address}
                onChangeText={(v) => setEdit((e) => ({ ...e, address: v }))}
                placeholder="0x…"
                placeholderTextColor="#6f938f"
                autoCapitalize="none"
                autoCorrect={false}
                style={[st.input, { flex: 1 }]}
              />
              <Pressable onPress={() => { hap(); setScan(true); }} style={st.scanBtn}>
                <Icon name="qr-code" size={20} color={C.darkText} />
              </Pressable>
            </View>
            {edit?.address ? (
              <Text style={[st.hint, { color: isAddress(parseAddress(edit.address) || '') ? C.up : C.down }]}>
                {isAddress(parseAddress(edit.address) || '') ? t('con.valid') : t('send.errAddr')}
              </Text>
            ) : null}

            <Pressable onPress={() => { hap(); setEdit((e) => ({ ...e, fav: !e.fav })); }} style={st.favRow}>
              <View style={[st.check, edit?.fav && { backgroundColor: C.gold, borderColor: C.gold }]}>
                {edit?.fav && <Icon name="checkmark" size={13} color={C.darkText} />}
              </View>
              <Text style={st.favTxt}>{t('con.fav')}</Text>
            </Pressable>

            <Button3D title={t('prof.save')} icon="checkmark" onPress={guardar} style={{ marginTop: 16 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cámara sobre la ficha: al leer el QR rellena la dirección sin perder el nombre. */}
      <ScanModal
        visible={scan}
        onResult={(a) => setEdit((e) => ({ ...(e || { name: '', fav: false }), address: a }))}
        onClose={() => setScan(false)}
      />
    </View>
  );
}

const st = StyleSheet.create({
  addBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 12, marginBottom: 9 },
  av: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avTxt: { color: C.darkText, fontWeight: '800', fontSize: 14 },
  name: { color: C.txt, fontWeight: '700', fontSize: 14.5 },
  addr: { color: C.txt3, fontSize: 11.5, marginTop: 2 },
  iconBtn: { padding: 7 },
  empty: { alignItems: 'center', marginTop: 50, marginBottom: 20 },
  emptyIc: { width: 78, height: 78, borderRadius: 39, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  emptyT: { color: C.txt, fontWeight: '700', fontSize: 16, marginTop: 16 },
  emptyP: { color: C.txt3, fontSize: 12.5, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#062A2C', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line, padding: 22, paddingBottom: 34 },
  grab: { width: 40, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  sheetT: { fontSize: 17, fontWeight: '700', color: C.txt, textAlign: 'center', marginBottom: 18 },
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 15 },
  scanBtn: { width: 52, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11.5, marginTop: 6 },
  favRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(201,169,97,0.5)', alignItems: 'center', justifyContent: 'center' },
  favTxt: { color: C.txt2, fontSize: 12.5 },
});
