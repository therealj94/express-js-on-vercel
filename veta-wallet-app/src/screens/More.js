import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import * as Clipboard from 'expo-clipboard';
import { C, G } from '../theme';
import { Header, Button3D, ListRow, Toggle, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt } from '../data';
import { getPrivateKey } from '../api';
import { updateAccount } from '../accounts';
import { useT, useLang } from '../i18n';

const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');
const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
};

// ================= ACTIVIDAD (historial real de la blockchain) =================
export function Activity({ nav }) {
  const [f, setF] = useState('all');
  const toast = useToast();
  const t = useT();
  const { account } = useAccount();
  const txns = account?.transfers || [];
  const filters = [['all', t('act.all')], ['in', t('act.in')], ['out', t('act.out')]];
  const isIn = (t) => t.type === 'recive' || t.type === 'receive' || t.type === 'in';
  const list = f === 'all' ? txns : txns.filter((t) => (f === 'in' ? isIn(t) : !isIn(t)));
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('act.title')} sub={t('act.sub')} onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
          {filters.map(([k, l]) => (
            <Pressable key={k} onPress={() => { hap(); setF(k); }} style={[styles.chip, f === k && styles.chipOn]}>
              <Text style={[styles.chipTxt, f === k && { color: C.darkText }]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {list.length === 0 && (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}><Icon name="pulse" size={30} color={C.txt3} /></View>
            <Text style={styles.emptyTitle}>{t('act.emptyT')}</Text>
            <Text style={styles.emptyBody}>{t('act.emptyP')}</Text>
          </View>
        )}
        {list.map((x, i) => {
          const inbound = isIn(x);
          return (
            <Pressable key={x.hash || i} onPress={() => { hap(); toast(x.hash ? 'Tx ' + x.hash.slice(0, 18) + '…' : 'Tx'); }} style={styles.txn}>
              <View style={styles.txnIc}><Icon name={inbound ? 'arrow-down' : 'arrow-up'} size={19} color={inbound ? C.up : C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnT}>{inbound ? t('act.in') : t('act.out')} {x.symbol || 'ORIGEN'}</Text>
                <Text style={styles.txnD}>{fmtDate(x.timeStamp)}</Text>
                <Text style={styles.txnD}>{inbound ? t('act.from') : t('act.to')}: {shortAddr(inbound ? x.from : x.to)}</Text>
              </View>
              <Text style={[styles.txnV, inbound && { color: C.up }]}>{inbound ? '+' : '-'}{qtyFmt(Number(x.value) || 0)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ================= NOTIFICACIONES =================
export function Notifications({ nav }) {
  const t = useT();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('notif.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}><Icon name="notifications" size={30} color={C.txt3} /></View>
          <Text style={styles.emptyTitle}>{t('notif.emptyT')}</Text>
          <Text style={styles.emptyBody}>{t('notif.emptyP')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ================= AJUSTES =================
export function Settings({ nav }) {
  const [notif, setNotif] = useState(true);
  const [priv, setPriv] = useState(false);
  const toast = useToast();
  const t = useT();
  const { lang, setLang } = useLang();
  const { account, logout } = useAccount();
  const acc = account || { name: 'Cuenta', email: '', initials: 'VW', addr: '', genesisUid: null };
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('set.title')} onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.prof}>
          {acc.passport?.photoUrl ? (
            <Image source={{ uri: acc.passport.photoUrl }} style={styles.profAv} />
          ) : (
            <LinearGradient colors={G.gold} style={styles.profAv}><Text style={{ color: C.darkText, fontWeight: '800', fontSize: 19 }}>{acc.initials}</Text></LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.profName} numberOfLines={1}>{acc.name}</Text>
            <Text style={styles.profMail} numberOfLines={1}>{acc.email}</Text>
            <Text style={styles.profMail} numberOfLines={1}>{shortAddr(acc.addr)}</Text>
          </View>
          {acc.genesisUid ? (
            <View style={styles.kycBadge}><Icon name="checkmark-circle" size={12} color={C.up} /><Text style={styles.kycTxt}>Genesis</Text></View>
          ) : null}
        </LinearGradient>

        <Text style={styles.grpTitle}>{t('set.genesis')}</Text>
        <View style={styles.group}>
          {acc.genesisUid ? (
            <>
              <ListRow first icon="finger-print" title={t('set.passport')} sub={acc.genesisUid} onPress={() => nav.go('passport')} />
              <ListRow icon="refresh" title={t('set.reverify')} sub={t('set.reverifySub')} onPress={() => nav.go('kyc')} />
            </>
          ) : (
            <ListRow first icon="finger-print" title={t('set.link')} sub={t('set.linkSub')} onPress={() => nav.go('kyc')} />
          )}
        </View>

        <Text style={styles.grpTitle}>{t('set.privacy')}</Text>
        <View style={styles.group}>
          <ListRow first icon="lock-closed" title={t('set.private')} sub={t('set.privateSub')} onPress={() => {}} right={<Toggle value={priv} onValueChange={(v) => { setPriv(v); toast(v ? t('set.privateOn') : t('set.privateOff')); }} />} />
          <ListRow icon="create" title={t('set.profile')} sub={t('set.profileSub')} onPress={() => nav.go('profile')} />
          <ListRow icon="person-remove" title={t('set.blocked')} onPress={() => nav.go('blocked')} />
        </View>

        <Text style={styles.grpTitle}>{t('set.account')}</Text>
        <View style={styles.group}>
          <ListRow first icon="card" title={t('set.card')} onPress={() => nav.go('card')} />
          <ListRow icon="qr-code" title={t('set.addr')} sub={shortAddr(acc.addr)} onPress={() => nav.go('receive')} />
          <ListRow icon="storefront" title={t('set.mtp')} sub={t('set.mtpSub')} onPress={() => nav.go('mytokenpay')} />
        </View>

        <Text style={styles.grpTitle}>{t('set.security')}</Text>
        <View style={styles.group}>
          <ListRow first icon="key" title={t('set.seed')} onPress={() => nav.go('seedview')} />
          <ListRow icon="finger-print" title={t('set.pk')} onPress={() => nav.go('privatekey')} />
          <ListRow icon="notifications" title={t('set.notifs')} onPress={() => {}} right={<Toggle value={notif} onValueChange={setNotif} />} />
        </View>

        <Text style={styles.grpTitle}>{t('set.general')}</Text>
        <View style={styles.group}>
          <View style={[styles.langRow]}>
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="language" size={19} color={C.gold} />
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.txt }}>{t('set.lang')}</Text>
            <View style={styles.langSeg}>
              {[['es', 'ES'], ['en', 'EN']].map(([code, label]) => (
                <Pressable key={code} onPress={() => { hap(); setLang(code); }} style={[styles.langBtn, lang === code && styles.langOn]}>
                  <Text style={[styles.langTxt, lang === code && { color: C.darkText }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={{ height: 10 }} />
        <Pressable onPress={() => { hap(); logout(); nav.go('auth'); }} style={styles.logout}>
          <Icon name="power" size={18} color="#fff" />
          <Text style={styles.logoutTxt}>{t('set.logout')}</Text>
        </Pressable>
        <Text style={styles.foot}>{t('set.foot')}</Text>
      </ScrollView>
    </View>
  );
}

// ================= PASAPORTE GENESIS ID =================
export function Passport({ nav }) {
  const { account } = useAccount();
  const toast = useToast();
  const t = useT();
  const acc = account || {};
  const p = acc.passport || null;
  const verified = p?.status === 'verified' || (!!acc.genesisUid && !p);
  const statusLbl = p?.status === 'review' ? t('pass.review') : verified ? t('pass.verified') : t('pass.pending');

  if (!acc.genesisUid && !p) {
    return (
      <View style={{ flex: 1, paddingTop: 6 }}>
        <Header title={t('pass.title')} onBack={() => nav.back()} />
        <ScrollView contentContainerStyle={{ padding: 22 }}>
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}><Icon name="finger-print" size={30} color={C.gold} /></View>
            <Text style={styles.emptyTitle}>{t('pass.emptyT')}</Text>
            <Text style={styles.emptyBody}>{t('pass.emptyP')}</Text>
            <Button3D title={t('pass.linkNow')} icon="finger-print" onPress={() => nav.go('kyc')} style={{ alignSelf: 'stretch', marginTop: 18 }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  const rows = [
    [t('pass.type'), t('pass.typeV')],
    p?.documentId ? [t('pass.doc'), p.documentId] : null,
    p?.nationality ? [t('pass.nat'), p.nationality] : null,
    p?.birthDate ? [t('pass.dob'), p.birthDate] : null,
    [t('auth.email'), p?.email || acc.email || '—'],
    [t('pass.issued'), fmtIssued(p?.issuedAt) || acc.since || '—'],
    [t('pass.status'), statusLbl],
  ].filter(Boolean);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('pass.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <LinearGradient colors={['#0f5f55', '#0a3a3d', '#06282b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.passCard}>
          <View style={styles.passTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="finger-print" size={18} color={C.gold} />
              <Text style={styles.passBrand}>GENESIS ID</Text>
            </View>
            <View style={[styles.passVerified, !verified && { backgroundColor: 'rgba(251,191,36,0.14)' }]}>
              <Icon name={verified ? 'shield-checkmark' : 'time'} size={12} color={verified ? C.up : '#FBBF24'} />
              <Text style={[styles.passVerTxt, !verified && { color: '#FBBF24' }]}>{statusLbl}</Text>
            </View>
          </View>

          <View style={styles.passBody}>
            {p?.photoUrl ? (
              <Image source={{ uri: p.photoUrl }} style={styles.passPhotoImg} />
            ) : (
              <LinearGradient colors={G.gold} style={styles.passPhoto}>
                <Text style={{ color: C.darkText, fontWeight: '800', fontSize: 26 }}>{acc.initials || 'VW'}</Text>
              </LinearGradient>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.passLabel}>{t('pass.holder')}</Text>
              <Text style={styles.passName} numberOfLines={2}>{p?.fullName || acc.name}</Text>
              <Text style={styles.passLabel2}>{t('pass.uid')}</Text>
              <Text style={styles.passUid}>{p?.genesisUid || acc.genesisUid}</Text>
            </View>
          </View>

          <View style={styles.passRows}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.passRow}>
                <Text style={styles.passRowK}>{k}</Text>
                <Text style={styles.passRowV} numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Billetera emparejada */}
        <View style={styles.pairCard}>
          <View style={styles.pairIcon}><Icon name="link" size={17} color={C.gold} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pairT}>{t('pass.linked')}</Text>
            <Text style={styles.pairV} numberOfLines={1}>{p?.walletAddress || acc.addr || '—'}</Text>
          </View>
          <Pressable onPress={async () => { hap(); try { await Clipboard.setStringAsync(p?.walletAddress || acc.addr || ''); toast(t('recv.copied')); } catch (e) {} }}>
            <Icon name="copy" size={18} color={C.gold} />
          </Pressable>
        </View>

        <Text style={styles.passNote}>{t('pass.note')}</Text>
        <Button3D variant="ghost" title={t('pass.share')} icon="share-social" onPress={() => { hap(); toast(t('pass.sharing')); }} />
      </ScrollView>
    </View>
  );
}

function fmtIssued(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ================= PERFIL (datos reales de la cuenta) =================
export function Profile({ nav }) {
  const toast = useToast();
  const t = useT();
  const { account, login } = useAccount();
  const acc = account || { name: '', email: '', phone: '', country: '', address2: '' };
  const [name, setName] = useState(acc.name || '');
  const [phone, setPhone] = useState(acc.phone || '');
  const [country, setCountry] = useState(acc.country || '');
  const [addr2, setAddr2] = useState(acc.address2 || '');

  async function save() {
    if (!account) return;
    const updated = await updateAccount(account.email, { name: name.trim() || account.name, phone, country, address2: addr2 });
    if (updated) { login(updated); toast(t('prof.saved')); setTimeout(() => nav.back(), 600); }
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('prof.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <LinearGradient colors={G.gold} style={styles.profAvBig}><Text style={{ color: C.darkText, fontWeight: '800', fontSize: 26 }}>{acc.initials || 'VW'}</Text></LinearGradient>
        </View>
        <Field label={t('prof.name')} value={name} onChangeText={setName} placeholder={t('auth.namePh')} />
        <Field label={t('prof.email')} value={acc.email} editable={false} />
        <Field label={t('prof.wallet')} value={acc.addr || ''} editable={false} />
        <Field label={t('prof.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+504 …" />
        <Field label={t('prof.country')} value={country} onChangeText={setCountry} placeholder="—" />
        <Field label={t('prof.addr')} value={addr2} onChangeText={setAddr2} placeholder="—" />
        <View style={{ height: 8 }} />
        <Button3D title={t('prof.save')} icon="checkmark" onPress={save} />
      </ScrollView>
    </View>
  );
}

function Field({ label, editable = true, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#6f938f" editable={editable} style={[styles.input, !editable && { opacity: 0.6 }]} {...props} />
    </View>
  );
}

// ================= MYTOKENPAY =================
export function MyTokenPay({ nav }) {
  const t = useT();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('mtp.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <LinearGradient colors={G.gold} style={styles.heroIc}><Icon name="qr-code" size={24} color={C.darkText} /></LinearGradient>
          <Text style={styles.heroT}>{t('mtp.h')}</Text>
          <Text style={styles.heroP}>{t('mtp.p')}</Text>
        </LinearGradient>
        <View style={styles.group}>
          <PayFeature icon="storefront" t={t('mtp.f1')} s={t('mtp.f1s')} first />
          <PayFeature icon="cash" t={t('mtp.f2')} s={t('mtp.f2s')} />
          <PayFeature icon="finger-print" t={t('mtp.f3')} s={t('mtp.f3s')} />
        </View>
      </ScrollView>
    </View>
  );
}
function PayFeature({ icon, t, s, first }) {
  return (
    <View style={[styles.payFeat, first && { borderTopWidth: 0 }]}>
      <View style={styles.notifIc}><Icon name={icon} size={19} color={C.gold} /></View>
      <View style={{ flex: 1 }}><Text style={{ color: C.txt, fontWeight: '600', fontSize: 14 }}>{t}</Text><Text style={{ color: C.txt3, fontSize: 11.5, marginTop: 2 }}>{s}</Text></View>
    </View>
  );
}

// ================= CUENTAS BLOQUEADAS =================
export function Blocked({ nav }) {
  const t = useT();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('blk.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}><Icon name="person-remove" size={30} color={C.txt3} /></View>
          <Text style={styles.emptyTitle}>{t('blk.emptyT')}</Text>
          <Text style={styles.emptyBody}>{t('blk.emptyP')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ================= LLAVE PRIVADA =================
export function PrivateKey({ nav }) {
  const [state, setState] = useState('hidden'); // hidden | loading | shown | unavailable
  const [pk, setPk] = useState(null);
  const { account } = useAccount();
  const toast = useToast();
  const t = useT();
  const acc = account || { addr: '' };

  async function reveal() {
    hap();
    setState('loading');
    const key = await getPrivateKey();
    if (key) { setPk(key); setState('shown'); }
    else setState('unavailable');
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('pk.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.warnBox}>
          <Icon name="warning" size={22} color="#E05A5A" />
          <Text style={styles.warnTxt}>{t('pk.warn')}</Text>
        </View>

        <Text style={styles.label}>{t('pk.pub')}</Text>
        <View style={styles.pkBox}>
          <Text style={styles.pkTxt} numberOfLines={1}>{acc.addr || '—'}</Text>
          <Pressable onPress={async () => { hap(); try { await Clipboard.setStringAsync(acc.addr || ''); toast(t('recv.copied')); } catch (e) {} }}>
            <Icon name="copy" size={20} color={C.gold} />
          </Pressable>
        </View>

        <Text style={[styles.label, { marginTop: 18 }]}>{t('pk.key')}</Text>
        <View style={styles.pkReveal}>
          {state === 'shown' ? (
            <Text style={{ color: C.txt, fontSize: 13, lineHeight: 20 }} selectable>{pk}</Text>
          ) : state === 'unavailable' ? (
            <Text style={{ color: C.txt2, fontSize: 13, lineHeight: 20 }}>
              {t('pk.unavailable')}
            </Text>
          ) : (
            <Text style={{ color: C.txt3, fontSize: 13 }}>{state === 'loading' ? t('pk.checking') : '•••• •••• •••• •••• •••• •••• •••• ••••'}</Text>
          )}
        </View>
        {state !== 'shown' && (
          <Button3D title={state === 'loading' ? t('pk.loading') : t('pk.reveal')} icon="eye" onPress={state === 'loading' ? () => {} : reveal} style={{ marginTop: 14 }} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },

  chip: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 10 },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipTxt: { color: C.txt2, fontWeight: '600', fontSize: 12.5 },

  txn: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 13, marginBottom: 9 },
  txnIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  txnT: { fontSize: 14, fontWeight: '600', color: C.txt },
  txnD: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  txnV: { fontSize: 14, fontWeight: '700', color: C.txt },

  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: 10 },
  emptyIcon: { width: 78, height: 78, borderRadius: 39, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  emptyTitle: { color: C.txt, fontWeight: '700', fontSize: 16, marginTop: 16 },
  emptyBody: { color: C.txt3, fontSize: 12.5, marginTop: 6, textAlign: 'center', lineHeight: 18 },

  prof: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line, marginBottom: 8 },
  profAv: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  profAvBig: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  profName: { fontSize: 16.5, fontWeight: '700', color: C.txt },
  profMail: { fontSize: 12, color: C.txt2, marginTop: 2 },
  kycBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(62,217,160,0.13)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  kycTxt: { color: C.up, fontSize: 11, fontWeight: '700' },

  grpTitle: { fontSize: 11, letterSpacing: 2, color: C.txt3, fontWeight: '700', marginTop: 20, marginBottom: 9, paddingHorizontal: 2 },
  group: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, overflow: 'hidden' },

  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#8E1F2F', borderRadius: 16, paddingVertical: 15, marginTop: 8 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15 },
  langSeg: { flexDirection: 'row', backgroundColor: 'rgba(6,34,35,0.6)', borderRadius: 11, padding: 3, borderWidth: 1, borderColor: 'rgba(46,116,119,0.4)' },
  langBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8 },
  langOn: { backgroundColor: C.gold },
  langTxt: { color: C.txt2, fontWeight: '700', fontSize: 12.5 },
  logoutTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  foot: { textAlign: 'center', color: C.txt3, fontSize: 11, lineHeight: 16, marginTop: 18 },

  passCard: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: 'rgba(62,217,160,0.25)' },
  passTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  passBrand: { color: C.txt, fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  passVerified: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(62,217,160,0.13)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  passVerTxt: { color: C.up, fontSize: 10.5, fontWeight: '700' },
  passBody: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  passPhoto: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  passLabel: { color: C.txt3, fontSize: 9.5, letterSpacing: 1.4 },
  passLabel2: { color: C.txt3, fontSize: 9.5, letterSpacing: 1.4, marginTop: 8 },
  passName: { color: C.txt, fontWeight: '700', fontSize: 16.5, marginTop: 2 },
  passUid: { color: C.gold, fontWeight: '800', fontSize: 15, letterSpacing: 1, marginTop: 2 },
  passFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  passMeta: { color: C.txt, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  passNote: { color: C.txt3, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginVertical: 14 },
  passPhotoImg: { width: 64, height: 64, borderRadius: 18, backgroundColor: C.panel2 },
  passRows: { marginTop: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  passRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 6 },
  passRowK: { color: C.txt3, fontSize: 11.5 },
  passRowV: { color: C.txt, fontSize: 11.5, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  pairCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 14, marginTop: 14 },
  pairIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  pairT: { color: C.txt3, fontSize: 11, letterSpacing: 0.5 },
  pairV: { color: C.txt, fontSize: 12.5, fontWeight: '600', marginTop: 2 },

  hero: { borderRadius: 22, padding: 20, borderWidth: 1, borderColor: C.line, marginBottom: 16, alignItems: 'center' },
  heroIc: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroT: { fontSize: 17, fontWeight: '800', color: C.txt, textAlign: 'center' },
  heroP: { fontSize: 12.5, color: C.txt2, textAlign: 'center', lineHeight: 18, marginTop: 6 },
  payFeat: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  notifIc: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },

  warnBox: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(224,90,90,0.12)', borderWidth: 1, borderColor: 'rgba(224,90,90,0.4)', borderRadius: 16, padding: 15, marginBottom: 18 },
  warnTxt: { flex: 1, color: '#f3c9c9', fontSize: 12.5, lineHeight: 18 },
  pkBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 14, padding: 15 },
  pkTxt: { flex: 1, color: C.txt, fontSize: 13 },
  pkReveal: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 14, padding: 16, minHeight: 64 },
});
