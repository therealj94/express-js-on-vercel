import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, Modal, StyleSheet } from 'react-native';
import { PantallaConTeclado, CuerpoDesplazable, useCampoAuto } from '../og/Teclado';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Icon } from '../icons';
import * as Clipboard from 'expo-clipboard';
import { C, G } from '../theme';
import { Header, Button3D, ListRow, Toggle, Glass, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt } from '../data';
import { getPrivateKey } from '../api';
import PedirClave from '../PedirClave';
import { genesis } from '../genesis';
import { setPassport } from '../accounts';
import { updateAccount } from '../accounts';
import { activarAvisos, desactivarAvisos, avisosActivos, enExpoGo } from '../notify';
import { listContacts, nameFor } from '../addressBook';
import { versionLabel } from '../version';
import { useT, useLang } from '../i18n';

const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');
// El locale sigue al idioma elegido, como ya hace AuroChat: con la app en
// inglés las fechas no pueden salir en formato hondureño en español.
const localeDe = (lang) => (lang === 'en' ? 'en-US' : 'es-HN');
const fmtDate = (ts, loc = 'es-HN') => {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
};

// ================= ACTIVIDAD (historial real de la blockchain) =================
export function Activity({ nav }) {
  const [f, setF] = useState('all');
  const [detalle, setDetalle] = useState(null);      // tx que se está mirando
  const [contactos, setContactos] = useState([]);    // libreta para nombrar direcciones
  const toast = useToast();
  const t = useT();
  const { lang } = useLang();
  const loc = localeDe(lang);
  const { account } = useAccount();
  const txns = account?.transfers || [];
  const filters = [['all', t('act.all')], ['in', t('act.in')], ['out', t('act.out')]];
  const isIn = (t) => t.type === 'recive' || t.type === 'receive' || t.type === 'in';
  const list = f === 'all' ? txns : txns.filter((t) => (f === 'in' ? isIn(t) : !isIn(t)));

  // Contactos guardados: si el remitente/destinatario está en la libreta,
  // en la lista aparece SU NOMBRE en vez de la dirección cortada.
  useEffect(() => { if (account?.email) listContacts(account.email).then(setContactos); }, [account?.email]);
  const etiqueta = (addr) => nameFor(contactos, addr) || shortAddr(addr);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      {/* Actividad es PESTAÑA de la barra veta: sin flecha de atrás — la
          heredada del apilado pre-fusión teletransportaba a la billetera. */}
      <Header title={t('act.title')} sub={t('act.sub')} />
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
          const otra = inbound ? x.from : x.to;
          return (
            <Pressable key={x.hash || i} onPress={() => { hap(); setDetalle({ ...x, inbound }); }} style={styles.txn}>
              <View style={styles.txnIc}><Icon name={inbound ? 'arrow-down' : 'arrow-up'} size={19} color={inbound ? C.up : C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnT}>{inbound ? t('act.in') : t('act.out')} {x.symbol || 'ORIGEN'}</Text>
                <Text style={styles.txnD}>{fmtDate(x.timeStamp, loc)}</Text>
                <Text style={styles.txnD}>{inbound ? t('act.from') : t('act.to')}: {etiqueta(otra)}</Text>
              </View>
              <Text style={[styles.txnV, inbound && { color: C.up }]}>{inbound ? '+' : '-'}{qtyFmt(Number(x.value) || 0)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <TxDetail data={detalle} etiqueta={etiqueta} onClose={() => setDetalle(null)} onToast={toast} />
    </View>
  );
}

// Ficha de una transacción — hash, bloque, gas, importe, contraparte y fecha.
// Es lo que antes salía solo como un toast con el hash cortado.
function TxDetail({ data, etiqueta, onClose, onToast }) {
  const t = useT();
  const { lang } = useLang();
  if (!data) return null;
  const inbound = data.inbound;
  const otra = inbound ? data.from : data.to;
  const copiar = async (v) => { if (!v) return; hap(); try { await Clipboard.setStringAsync(String(v)); onToast(t('recv.copied')); } catch (e) {} };
  const filas = [
    [inbound ? t('act.from') : t('act.to'), etiqueta(otra), otra],
    [t('send.date'), fmtDate(data.timeStamp, localeDe(lang))],
    [t('send.network'), 'Orden Global · 8532'],
    data.blockNumber != null ? [t('send.block'), `#${data.blockNumber}`] : null,
    data.gasUsed != null ? [t('send.gas'), String(data.gasUsed)] : null,
    data.fee ? [t('send.fee'), `${data.fee} ORIGEN`] : null,
    data.hash && !data.localPending ? [t('send.hash'), `${String(data.hash).slice(0, 10)}…${String(data.hash).slice(-8)}`, data.hash] : null,
  ].filter(Boolean);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={[styles.txDetIc, { backgroundColor: inbound ? 'rgba(62,217,160,0.14)' : 'rgba(201,169,97,0.14)' }]}>
              <Icon name={inbound ? 'arrow-down' : 'arrow-up'} size={26} color={inbound ? C.up : C.gold} />
            </View>
            <Text style={styles.txDetT}>{inbound ? t('act.in') : t('act.out')}</Text>
            <Text style={[styles.txDetAmt, { color: inbound ? C.up : C.gold }]}>
              {inbound ? '+' : '-'}{qtyFmt(Number(data.value) || 0)} {data.symbol || 'ORIGEN'}
            </Text>
            {data.localPending ? <Text style={styles.txDetPend}>{t('act.pending')}</Text> : null}
          </View>
          <View style={styles.txDetRows}>
            {filas.map(([k, v, full], i) => (
              <Pressable key={k} onPress={full ? () => copiar(full) : undefined} disabled={!full} style={[styles.txDetRow, i === 0 && { borderTopWidth: 0 }]}>
                <Text style={styles.txDetK}>{k}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                  <Text style={styles.txDetV} numberOfLines={1}>{v}</Text>
                  {full ? <Icon name="copy" size={13} color={C.gold} /> : null}
                </View>
              </Pressable>
            ))}
          </View>
          <Button3D title={t('send.ok')} icon="checkmark" onPress={onClose} style={{ marginTop: 16 }} />
        </Pressable>
      </Pressable>
    </Modal>
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
// Abre un enlace en el navegador del sistema. Si falla —sin navegador, URL
// mal formada— no se rompe la pantalla: simplemente no pasa nada.
async function abrir(url) {
  try { await WebBrowser.openBrowserAsync(url); } catch (e) {}
}

export function Settings({ nav }) {
  const [notif, setNotif] = useState(true);
  useEffect(() => { avisosActivos().then(setNotif).catch(() => {}); }, []);
  const toast = useToast();
  const t = useT();
  const { lang, setLang } = useLang();
  const { account, logout } = useAccount();
  const acc = account || { name: 'Cuenta', email: '', initials: 'OG', addr: '', genesisUid: null };
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      {/* Ajustes es PESTAÑA de la sección og: sin flecha de atrás. La que
          había mandaba nav.go('home') y desde el hub «atrás» te
          teletransportaba a la billetera. */}
      <Header title={t('set.title')} />
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
        <Glass style={styles.group}>
          {acc.genesisUid ? (
            <>
              <ListRow first icon="finger-print" title={t('set.passport')} sub={acc.genesisUid} onPress={() => nav.go('passport')} />
              <ListRow icon="refresh" title={t('set.reverify')} sub={t('set.reverifySub')} onPress={() => nav.go('kyc')} />
            </>
          ) : (
            <>
              <ListRow first icon="finger-print" title={t('set.link')} sub={t('set.linkSub')} onPress={() => nav.go('kyc')} />
            </>
          )}
        </Glass>

        {/* CUENTA: aquí vive todo lo que es "mis datos". El perfil está una
            sola vez (antes aparecía también en Privacidad, y por eso parecía
            que la app pedía llenar la información dos veces). */}
        <Text style={styles.grpTitle}>{t('set.account')}</Text>
        <Glass style={styles.group}>
          <ListRow first icon="person" title={t('set.profile')} sub={t('set.profileSub')} onPress={() => nav.go('profile')} />
          <ListRow icon="people" title={t('set.contacts')} sub={t('set.contactsSub')} onPress={() => nav.go('contacts')} />
          <ListRow icon="eye" title={t('set.watchLbl')} onPress={() => nav.go('watchOnly')} />
          <ListRow icon="card" title={t('set.card')} onPress={() => nav.go('card')} />
          <ListRow icon="qr-code" title={t('set.addr')} sub={shortAddr(acc.addr)} onPress={() => nav.go('receive')} />
          <ListRow icon="storefront" title={t('set.mtp')} sub={t('set.mtpSub')} onPress={() => nav.go('mytokenpay')} />
        </Glass>

        {/* "Cuenta privada" se quitó: era un interruptor que no llamaba al
            backend ni guardaba nada — se reseteaba al volver a entrar — pero
            decía "Cuenta privada activada" y prometía "solo cuentas aprobadas
            te ven". Prometer una protección de privacidad que no existe es
            peor que no ofrecerla. Vuelve cuando el backend la soporte. */}
        <Text style={styles.grpTitle}>{t('set.privacy')}</Text>
        <Glass style={styles.group}>
          <ListRow first icon="person-remove" title={t('set.blocked')} onPress={() => nav.go('blocked')} />
        </Glass>

        <Text style={styles.grpTitle}>{t('set.security')}</Text>
        <Glass style={styles.group}>
          <ListRow first icon="key" title={t('set.seed')} onPress={() => nav.go('seedview')} />
          <ListRow icon="finger-print" title={t('set.pk')} onPress={() => nav.go('privatekey')} />
          <ListRow icon="time" title={t('sess.title')} sub={t('sess.subtitle')} onPress={() => nav.go('sessions')} />
          {/* El interruptor enciende de verdad los avisos: pide permiso y
              registra la tarea que revisa la red con la app cerrada. */}
          <ListRow
            icon="notifications"
            title={t('set.notifs')}
            sub={enExpoGo ? t('set.notifsGo') : t('set.notifsSub')}
            onPress={() => {}}
            right={
              <Toggle
                value={notif}
                onValueChange={async (v) => {
                  setNotif(v);
                  if (v) {
                    const ok = await activarAvisos(acc.email);
                    if (!ok) { setNotif(false); toast(t('set.notifsDenied')); return; }
                    toast(t('set.notifsOn'));
                  } else {
                    await desactivarAvisos();
                    toast(t('set.notifsOff'));
                  }
                }}
              />
            }
          />
        </Glass>

        <Text style={styles.grpTitle}>{t('set.general')}</Text>
        <Glass style={styles.group}>
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
          <ListRow
            icon="help-buoy"
            title={t('help.title')}
            sub={t('help.subtitle')}
            onPress={() => nav.go('help')}
          />
          <ListRow
            icon="information-circle"
            title={t('set.about')}
            sub={versionLabel()}
            onPress={() => nav.go('about')}
          />
          {/* Ambas tiendas exigen que la política de privacidad sea accesible
              desde dentro de la app, no solo desde la ficha de la tienda.

              Van a legal.vetawallet.com, no al dominio raíz: vetawallet.com
              redirige CUALQUIER ruta a /login, así que /privacidad y /terminos
              nunca fueron accesibles sin cuenta — que es justo lo que las
              tiendas rechazan. El subdominio sirve los documentos como HTML
              público, sin sesión. */}
          <ListRow
            icon="shield-checkmark"
            title={t('set.privacy')}
            onPress={() => { hap(); abrir('https://legal.vetawallet.com/privacidad'); }}
          />
          <ListRow
            icon="document-text"
            title={t('set.terms')}
            onPress={() => { hap(); abrir('https://legal.vetawallet.com/terminos'); }}
          />
        </Glass>

        <View style={{ height: 10 }} />
        <Pressable onPress={() => { hap(); logout(); nav.go('auth'); }} style={styles.logout}>
          <Icon name="power" size={18} color="#fff" />
          <Text style={styles.logoutTxt}>{t('set.logout')}</Text>
        </Pressable>

        {/* Zona peligrosa: eliminar cuenta. Requisito de tiendas y del
            usuario poder pedir la eliminación desde la app misma. */}
        <Text style={[styles.grpTitle, { color: '#8E1F2F', marginTop: 26 }]}>{t('delAcc.dangerGrp')}</Text>
        <Pressable
          onPress={() => { hap(); nav.go('deleteAccount'); }}
          accessibilityRole="button"
          accessibilityLabel={t('delAcc.title')}
          style={styles.dangerRow}>
          <View style={styles.dangerIc}><Icon name="trash" size={18} color="#F0776B" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dangerT}>{t('delAcc.title')}</Text>
            <Text style={styles.dangerP}>{t('delAcc.rowSub')}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color="#F0776B" />
        </Pressable>

        <Text style={styles.foot}>{t('set.foot')}{'\n'}{versionLabel()}</Text>
      </ScrollView>
    </View>
  );
}

// ================= PASAPORTE GENESIS ID =================
export function Passport({ nav }) {
  const { account, login } = useAccount();
  const toast = useToast();
  const t = useT();
  const { lang } = useLang();
  const acc = account || {};

  /**
   * La foto de la credencial.
   *
   * La pantalla decia «subelos tu» y no ofrecia ningun sitio donde hacerlo.
   * Ahora se elige de la galeria o se toma con la camara, se recorta a un
   * cuadrado pequeño y se guarda SOLO en este telefono: no viaja a ningun
   * servidor, porque la credencial se dibuja aqui.
   */
  async function elegirFotoCredencial(origen) {
    hap();
    try {
      const ImagePicker = require('expo-image-picker');
      const ImageManipulator = require('expo-image-manipulator');

      const permiso = origen === 'camara'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso?.granted) { toast(t('pass.photoNoPerm')); return; }

      const sel = origen === 'camara'
        ? await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'] });
      if (sel?.canceled || !sel?.assets?.[0]?.uri) return;

      // 320 px de lado basta para una credencial y deja el dato pequeño: se
      // guarda dentro de la cuenta, en el propio telefono.
      const chica = await ImageManipulator.manipulateAsync(
        sel.assets[0].uri, [{ resize: { width: 320, height: 320 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!chica?.base64) { toast(t('pass.photoFail')); return; }

      const uri = `data:image/jpeg;base64,${chica.base64}`;

      // Se guarda en el telefono Y en Genesis ID. Lo segundo importa: el GID
      // vale en todas las apps del ecosistema, y una credencial que solo se ve
      // completa en el movil que subio la foto no sirve para eso.
      const actualizada = await setPassport(acc.email, { photoUrl: uri });
      if (actualizada) login(actualizada);

      const r = await genesis.guardarFoto(uri);
      if (r?.error) toast(t('pass.photoLocalOnly'));
      else toast(t('pass.photoOk'));
    } catch (e) {
      toast(t('pass.photoFail'));
    }
  }

  // Al abrir el pasaporte se vuelve a consultar el estado real en el servidor.
  // Sirve para dos cosas: completar la credencial cuando cumplimiento acaba de
  // aprobarla, y RETIRARLA si la identidad fue suspendida. Lo segundo importa
  // tanto como lo primero: una credencial que solo se actualiza cuando trae
  // buenas noticias sigue enseñando "verificado" a quien ya no lo está.
  useEffect(() => {
    if (!acc.email || !acc.genesisUid) return;
    let vivo = true;
    genesis.estado()
      .then(async (e) => {
        if (!vivo || !e || e.error) return;
        const actualizada = await setPassport(acc.email, {
          genesisUid: e.verificada ? e.genesisUid : null,
          fullName: e.fullName || acc.name,
          email: acc.email,
          walletAddress: acc.addr,
          status: e.verificada ? 'verified' : e.estado === 'suspendida' ? 'suspended' : 'review',
          issuedAt: e.actualizadaEn,
        });
        if (vivo && actualizada) login(actualizada);
      })
      .catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acc.email]);
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
    [t('pass.issued'), fmtIssued(p?.issuedAt, localeDe(lang)) || acc.since || '—'],
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
                <Text style={{ color: C.darkText, fontWeight: '800', fontSize: 26 }}>{acc.initials || 'OG'}</Text>
              </LinearGradient>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.passLabel}>{t('pass.holder')}</Text>
              <Text style={styles.passName} numberOfLines={2}>{p?.fullName || acc.name}</Text>
              <Text style={styles.passLabel2}>{t('pass.uid')}</Text>
              {/* El GID viaja por el chat: tocarlo lo copia — el mismo gesto
                  que en los ajustes de AURO CHAT, para que la seña se aprenda
                  una sola vez en toda la app. */}
              <Pressable onPress={async () => {
                hap();
                try { await Clipboard.setStringAsync(String(p?.genesisUid || acc.genesisUid || '')); toast(t('pass.gidCopied')); } catch (e) {}
              }} hitSlop={8}>
                <Text style={styles.passUid}>{p?.genesisUid || acc.genesisUid}</Text>
              </Pressable>
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

        {/* Mientras cumplimiento no haya aprobado, la credencial se ve a
            medias (sin nombre legal ni foto). Se dice aquí en vez de dejar al
            usuario adivinando por qué le falta información. */}
        {/* El aviso decia «subelos tu» y no habia ningun sitio donde hacerlo.
            Ahora el boton esta aqui mismo: la foto se elige de la galeria o se
            toma con la camara, se reduce y se guarda SOLO en este telefono. */}
        {!p?.photoUrl && (
          <View style={styles.incompleto}>
            <Icon name="information-circle" size={18} color="#FBBF24" />
            <View style={{ flex: 1 }}>
              <Text style={styles.incT}>{t('pass.incompleteT')}</Text>
              <Text style={styles.incP}>{t('pass.incompleteP')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Pressable onPress={() => elegirFotoCredencial('galeria')} style={styles.miniBtn}>
                  <Icon name="image" size={15} color={C.gold} />
                  <Text style={styles.miniBtnTxt}>{t('pass.fromGallery')}</Text>
                </Pressable>
                <Pressable onPress={() => elegirFotoCredencial('camara')} style={styles.miniBtn}>
                  <Icon name="eye" size={15} color={C.gold} />
                  <Text style={styles.miniBtnTxt}>{t('pass.fromCamera')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {p?.photoUrl && (
          <Pressable onPress={() => elegirFotoCredencial('galeria')} style={styles.cambiarFoto}>
            <Icon name="refresh" size={15} color={C.txt3} />
            <Text style={styles.cambiarFotoTxt}>{t('pass.changePhoto')}</Text>
          </Pressable>
        )}

        <Text style={styles.passNote}>{t('pass.note')}</Text>
        <Button3D variant="ghost" title={t('pass.share')} icon="share-social" onPress={() => { hap(); toast(t('pass.sharing')); }} />
      </ScrollView>
    </View>
  );
}

function fmtIssued(iso, loc = 'es-HN') {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' });
}

// ================= PERFIL (datos reales de la cuenta) =================
//
// El perfil NO vuelve a pedir lo que Genesis ID ya verificó: nombre legal,
// documento, nacionalidad y fecha de nacimiento se muestran en una ficha de
// solo lectura con el sello del pasaporte. Solo se escribe lo que Genesis no
// entrega (teléfono, país de residencia y dirección) — y si el pasaporte los
// trae, llegan ya rellenos. Así se acaba la sensación de "información
// duplicada" entre Ajustes y esta pantalla.
export function Profile({ nav }) {
  const toast = useToast();
  const t = useT();
  const { account, login } = useAccount();
  const acc = account || { name: '', email: '', phone: '', country: '', address2: '' };
  const p = acc.passport || null;
  const verificado = !!p?.genesisUid;

  const [name, setName] = useState(acc.name || '');
  const [phone, setPhone] = useState(acc.phone || '');
  const [country, setCountry] = useState(acc.country || '');
  const [addr2, setAddr2] = useState(acc.address2 || '');

  // Si el pasaporte llega o se actualiza, el perfil se rellena solo.
  useEffect(() => {
    setName(acc.name || '');
    if (!acc.phone && p?.phone) setPhone(p.phone);
    if (!acc.country && p?.nationality) setCountry(p.nationality);
    if (!acc.address2 && p?.address) setAddr2(p.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.genesisUid, acc.name]);

  async function save() {
    if (!account) return;
    const patch = { phone, country, address2: addr2 };
    // El nombre legal manda si viene verificado: no se sobreescribe a mano.
    if (!p?.fullName) patch.name = name.trim() || account.name;
    const updated = await updateAccount(account.email, patch);
    if (updated) { login(updated); toast(t('prof.saved')); setTimeout(() => nav.back(), 600); }
  }

  // Identidad: lo que ya está confirmado, en solo lectura.
  const identidad = [
    [t('prof.name'), p?.fullName || acc.name || '—'],
    [t('prof.email'), acc.email || '—'],
    p?.documentId ? [t('pass.doc'), p.documentId] : null,
    p?.nationality ? [t('pass.nat'), p.nationality] : null,
    p?.birthDate ? [t('pass.dob'), p.birthDate] : null,
    [t('prof.wallet'), acc.addr || '—'],
  ].filter(Boolean);

  return (
    // Cabecera fija y cuerpo desplazable: al enfocar un campo la pantalla
    // lo sube por encima del teclado (ver src/og/Teclado.js).
    <PantallaConTeclado desplaza={false} style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('prof.title')} onBack={() => nav.back()} />
      <CuerpoDesplazable contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          {p?.photoUrl ? (
            <Image source={{ uri: p.photoUrl }} style={styles.profAvBig} />
          ) : (
            <LinearGradient colors={G.gold} style={styles.profAvBig}><Text style={{ color: C.darkText, fontWeight: '800', fontSize: 26 }}>{acc.initials || 'OG'}</Text></LinearGradient>
          )}
          {verificado ? (
            <View style={styles.verifPill}>
              <Icon name="shield-checkmark" size={12} color={C.up} />
              <Text style={styles.verifTxt}>{t('prof.fromGenesis')}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.grpTitle}>{t('prof.identity')}</Text>
        {verificado ? (
          <>
            <Glass style={styles.group}>
              {identidad.map(([k, v], i) => (
                <View key={k} style={[styles.idRow, i === 0 && { borderTopWidth: 0 }]}>
                  <Text style={styles.idK}>{k}</Text>
                  <Text style={styles.idV} numberOfLines={1}>{v}</Text>
                </View>
              ))}
            </Glass>
            <Text style={styles.lockedNote}>{t('prof.locked')}</Text>
          </>
        ) : (
          <Glass style={[styles.group, { padding: 16 }]}>
            <Text style={styles.noPassT}>{t('prof.noPassT')}</Text>
            <Text style={styles.noPassP}>{t('prof.noPassP')}</Text>
            <View style={{ height: 12 }} />
            <Field label={t('prof.name')} value={name} onChangeText={setName} placeholder={t('auth.namePh')} />
            <Field label={t('prof.email')} value={acc.email} editable={false} />
            <Field label={t('prof.wallet')} value={acc.addr || ''} editable={false} />
          </Glass>
        )}

        <Text style={styles.grpTitle}>{t('prof.extra')}</Text>
        <Field label={t('prof.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+504 …" />
        <Field label={t('prof.country')} value={country} onChangeText={setCountry} placeholder="—" />
        <Field label={t('prof.addr')} value={addr2} onChangeText={setAddr2} placeholder="—" />
        <View style={{ height: 8 }} />
        <Button3D title={t('prof.save')} icon="checkmark" onPress={save} />
      </CuerpoDesplazable>
    </PantallaConTeclado>
  );
}

// El Field local del Perfil. Igual que el compartido de ui.js: al enfocarse
// avisa a su <PantallaConTeclado> y ésta lo sube por encima del teclado.
function Field({ label, editable = true, onFocus, ...props }) {
  const campo = useCampoAuto();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#6f938f" editable={editable}
        style={[styles.input, !editable && { opacity: 0.6 }]}
        {...props}
        ref={campo.ref}
        onFocus={(e) => { campo.onFocus(); if (onFocus) onFocus(e); }}
      />
    </View>
  );
}

// ================= MYTOKENPAY =================
export function MyTokenPay({ nav, params }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();
  const [abriendo, setAbriendo] = useState(false);

  // El puente al ecosistema: Genesis ID firma un pase de sesión única y
  // MyTokenPay lo canjea por una sesión propia. El KYC no se repite jamás.
  //
  // El correo viaja en el enlace solo como pista de a qué cuenta entrar; el
  // backend de MyTokenPay NO se lo cree: comprueba contra Genesis ID que ese
  // correo pertenezca exactamente al GID del pase.
  const abrirMyTokenPay = React.useCallback(async () => {
    if (!account?.email) return;
    setAbriendo(true);
    try {
      // La dirección de esta billetera queda registrada en Genesis ID (si aún
      // no lo estaba) y viaja también en el enlace: así MyTokenPay conecta la
      // billetera solo, sin pedirle a la persona teclear su propia dirección.
      const direccion = /^0x[a-fA-F0-9]{40}$/.test(account.addr || '') ? account.addr : null;
      if (direccion) genesis.vincular(direccion).catch(() => {});
      const r = await genesis.paseParaMyTokenPay();
      if (!r.token) {
        // Sin identidad verificada no hay pase: el camino es hacer el KYC.
        toast(t('mtp.sinGid'));
        nav.go('kyc');
        return;
      }
      const enlace = `mytokenpay://sso?token=${encodeURIComponent(r.token)}&email=${encodeURIComponent(account.email)}`
        + (direccion ? `&direccion=${direccion}` : '');
      await Linking.openURL(enlace);
    } catch (e) {
      toast(t('mtp.sinApp'));
    } finally {
      setAbriendo(false);
    }
  }, [account, nav, t, toast]);

  // Si venimos del enlace vetawallet://sso?destino=mytokenpay (el botón
  // «Entrar con Genesis ID» de la otra app), se dispara solo.
  useEffect(() => {
    if (params?.auto) abrirMyTokenPay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('mtp.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <LinearGradient colors={G.gold} style={styles.heroIc}><Icon name="qr-code" size={24} color={C.darkText} /></LinearGradient>
          <Text style={styles.heroT}>{t('mtp.h')}</Text>
          <Text style={styles.heroP}>{t('mtp.p')}</Text>
        </LinearGradient>
        <Glass style={styles.group}>
          <PayFeature icon="storefront" t={t('mtp.f1')} s={t('mtp.f1s')} first />
          <PayFeature icon="cash" t={t('mtp.f2')} s={t('mtp.f2s')} />
          <PayFeature icon="finger-print" t={t('mtp.f3')} s={t('mtp.f3s')} />
        </Glass>
        <Button3D
          title={abriendo ? t('mtp.abriendo') : t('mtp.abrir')}
          onPress={abrirMyTokenPay}
          disabled={abriendo || !account}
          style={{ marginTop: 16 }}
        />
        <Text style={{ color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 10, lineHeight: 16 }}>
          {t('mtp.abrirNota')}
        </Text>
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
  const [state, setState] = useState('hidden'); // hidden | shown | unavailable
  const [pk, setPk] = useState(null);
  const [pedirPw, setPedirPw] = useState(false);
  const { account } = useAccount();
  const toast = useToast();
  const t = useT();
  const acc = account || { addr: '' };

  // Se oculta sola a los 45 s, igual que el número de la tarjeta: si alguien
  // deja el teléfono abierto en esta pantalla, la llave no se queda a la vista.
  useEffect(() => {
    if (state !== 'shown') return;
    const id = setTimeout(() => { setPk(null); setState('hidden'); }, 45000);
    return () => clearTimeout(id);
  }, [state]);

  // Igual que ver el PIN/número de la tarjeta: la contraseña se pide justo
  // antes de mostrar el dato, no alcanza con haber entrado a la sesión.
  const revelar = async (password) => {
    try {
      const key = await getPrivateKey(password);
      if (key) { setPk(key); setState('shown'); }
      else setState('unavailable');
      setPedirPw(false);
      return { ok: true };
    } catch (e) {
      if (e?.status === 401) return { ok: false, msg: t('card.badPw') };
      setState('unavailable');
      setPedirPw(false);
      return { ok: true };
    }
  };

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
            <Text style={{ color: C.txt3, fontSize: 13 }}>•••• •••• •••• •••• •••• •••• •••• ••••</Text>
          )}
        </View>
        {state !== 'shown' && (
          <Button3D title={t('pk.reveal')} icon="eye" onPress={() => { hap(); setPedirPw(true); }} style={{ marginTop: 14 }} />
        )}
      </ScrollView>

      <PedirClave
        visible={pedirPw}
        titulo={t('pk.pwTitle')}
        subtitulo={t('card.pwWhy')}
        ctaTexto={t('card.reveal')}
        onCancel={() => setPedirPw(false)}
        onSubmit={revelar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },

  chip: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 10 },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipTxt: { color: C.txt2, fontWeight: '600', fontSize: 12.5 },

  txn: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 13, marginBottom: 9 },
  txnIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  txnT: { fontSize: 14, fontWeight: '600', color: C.txt },
  txnD: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  txnV: { fontSize: 14, fontWeight: '700', color: C.txt },
  // ---- ficha de detalle de transacción ----
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#06282B', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line, padding: 22, paddingBottom: 32 },
  grab: { width: 40, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  txDetIc: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  txDetT: { color: C.txt2, fontSize: 12.5, fontWeight: '600', letterSpacing: 1 },
  txDetAmt: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  txDetPend: { color: '#FBBF24', fontSize: 11.5, marginTop: 6, fontWeight: '600' },
  txDetRows: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, paddingHorizontal: 14 },
  txDetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  txDetK: { color: C.txt3, fontSize: 12 },
  txDetV: { color: C.txt, fontSize: 12.5, fontWeight: '600', flexShrink: 1 },

  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: 10 },
  emptyIcon: { width: 78, height: 78, borderRadius: 39, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  emptyTitle: { color: C.txt, fontWeight: '700', fontSize: 16, marginTop: 16 },
  emptyBody: { color: C.txt3, fontSize: 12.5, marginTop: 6, textAlign: 'center', lineHeight: 18 },

  prof: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line, marginBottom: 8 },
  profAv: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  profAvBig: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  verifPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(52,211,153,0.13)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)' },
  verifTxt: { color: C.up, fontSize: 11, fontWeight: '700' },
  idRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 13, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  idK: { color: C.txt3, fontSize: 12.5 },
  idV: { color: C.txt, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  lockedNote: { color: C.txt3, fontSize: 11.5, lineHeight: 17, marginTop: 9, paddingHorizontal: 2 },
  noPassT: { color: C.txt, fontWeight: '700', fontSize: 15 },
  noPassP: { color: C.txt3, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  profName: { fontSize: 16.5, fontWeight: '700', color: C.txt },
  profMail: { fontSize: 12, color: C.txt2, marginTop: 2 },
  kycBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(62,217,160,0.13)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  kycTxt: { color: C.up, fontSize: 11, fontWeight: '700' },

  grpTitle: { fontSize: 11, letterSpacing: 2, color: C.txt3, fontWeight: '700', marginTop: 20, marginBottom: 9, paddingHorizontal: 2 },
  group: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, overflow: 'hidden' },

  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#8E1F2F', borderRadius: 16, paddingVertical: 15, marginTop: 8 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15 },
  langSeg: { flexDirection: 'row', backgroundColor: 'rgba(6,34,35,0.6)', borderRadius: 11, padding: 3, borderWidth: 1, borderColor: 'rgba(46,116,119,0.4)' },
  langBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8 },
  langOn: { backgroundColor: C.gold },
  langTxt: { color: C.txt2, fontWeight: '700', fontSize: 12.5 },
  logoutTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: 'rgba(240,119,107,0.08)', borderWidth: 1, borderColor: 'rgba(240,119,107,0.30)', borderRadius: 16, padding: 14 },
  dangerIc: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(240,119,107,0.12)', alignItems: 'center', justifyContent: 'center' },
  dangerT: { color: '#F0776B', fontWeight: '700', fontSize: 14 },
  dangerP: { color: C.txt3, fontSize: 11.5, marginTop: 2 },
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
  incompleto: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: 'rgba(251,191,36,0.10)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)', borderRadius: 16, padding: 14, marginTop: 14, marginBottom: 12 },
  miniBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', borderRadius: 10,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  miniBtnTxt: { color: C.gold, fontSize: 12, fontWeight: '700' },
  cambiarFoto: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 10 },
  cambiarFotoTxt: { color: C.txt3, fontSize: 12.5 },
  incT: { color: '#FBBF24', fontWeight: '700', fontSize: 13 },
  incP: { color: C.txt2, fontSize: 12, lineHeight: 17.5, marginTop: 3 },
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
