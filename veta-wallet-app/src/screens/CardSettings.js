import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, ActivityIndicator, Share, Alert, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, ListRow, SectionHead, useToast, useAccount, hap } from '../ui';
import { qtyFmt } from '../data';
import { cardApi, sinTarjeta } from '../api';
import { useT } from '../i18n';
import PedirClave from '../PedirClave';

// ============================================================
// Ajustes de la tarjeta.
//
// Todo lo que no es "ver y pagar" vive acá para que la pantalla principal
// siga siendo la tarjeta y sus movimientos: límites de gasto, teléfono de los
// códigos de compras online, reemitir, desbloquear, estado de cuenta y
// cancelar.
//
// Las acciones destructivas —reemitir y cancelar— piden autorización con
// biometría o contraseña a través de PedirClave, igual que ver el número.
// ============================================================

export default function CardSettings({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();

  const [card, setCard] = useState(null);
  const [gasto, setGasto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [editandoLimites, setEditandoLimites] = useState(false);
  const [editandoTel, setEditandoTel] = useState(false);
  const [pedir, setPedir] = useState(null);   // 'reemitir' | 'cancelar' | null
  const [ocupado, setOcupado] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const d = await cardApi.mine();
      setCard(d);
      // El gasto acumulado es complementario: si falla, la pantalla sigue
      // sirviendo para todo lo demás.
      cardApi.spending().then(setGasto).catch(() => setGasto(null));
    } catch (e) {
      setError(sinTarjeta(e) ? t('cset.sinTarjeta') : (e?.message || t('card.errGeneric')));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => { cargar(); }, [cargar]);

  const bloqueada = String(card?.status || '').toUpperCase() === 'BLOCKED';

  const desbloquear = async () => {
    hap();
    setOcupado('unblock');
    try {
      const r = await cardApi.unblock();
      setCard((c) => ({ ...c, status: r?.status || 'ACTIVE' }));
      toast(t('cset.desbloqueada'), 'success');
    } catch (e) {
      toast(e?.message || t('card.errGeneric'), 'error');
    } finally { setOcupado(null); }
  };

  const activar3ds = async () => {
    hap();
    setOcupado('3ds');
    try {
      await cardApi.set3ds('SMS');
      toast(t('cset.tresDsOk'), 'success');
    } catch (e) {
      // 409 = falta el teléfono, que es exactamente lo que hay que arreglar.
      if (e?.status === 409) { toast(t('cset.tresDsFaltaTel'), 'error'); setEditandoTel(true); }
      else toast(e?.message || t('card.errGeneric'), 'error');
    } finally { setOcupado(null); }
  };

  const compartirEstado = async () => {
    hap();
    setOcupado('statement');
    try {
      const csv = await cardApi.statementCsv();
      if (!csv || csv.trim().split('\n').length < 2) { toast(t('cset.estadoVacio'), 'info'); return; }
      await Share.share({ message: csv, title: t('cset.estado') });
    } catch (e) {
      toast(e?.message || t('card.errGeneric'), 'error');
    } finally { setOcupado(null); }
  };

  // Autorización con biometría/contraseña para lo destructivo.
  const autorizar = async (password) => {
    const accion = pedir;
    try {
      if (accion === 'reemitir') {
        const r = await cardApi.reissue(password);
        setCard((c) => ({ ...c, last4: r?.last4 || c?.last4, status: r?.status || c?.status }));
        toast(t('cset.reemitidaOk', { n: r?.last4 || '' }), 'success');
      } else {
        await cardApi.cancel(password);
        toast(t('cset.canceladaOk'), 'success');
        nav.go('home');
      }
      setPedir(null);
      return { ok: true };
    } catch (e) {
      if (e?.status === 401) return { ok: false, msg: t('card.badPw') };
      toast(e?.message || t('card.errGeneric'), 'error');
      setPedir(null);
      return { ok: true };
    }
  };

  const confirmarReemitir = () => {
    hap();
    Alert.alert(t('cset.reemitirT'), t('cset.reemitirP'), [
      { text: t('card.cancel'), style: 'cancel' },
      { text: t('cset.reemitirSi'), style: 'destructive', onPress: () => setPedir('reemitir') },
    ]);
  };

  const confirmarCancelar = () => {
    hap();
    Alert.alert(t('cset.cancelarT'), t('cset.cancelarP'), [
      { text: t('card.cancel'), style: 'cancel' },
      { text: t('cset.cancelarSi'), style: 'destructive', onPress: () => setPedir('cancelar') },
    ]);
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('cset.title')} onBack={() => nav.back()} />

      {cargando ? (
        <View style={st.centro}><ActivityIndicator size="large" color={C.gold} /></View>
      ) : error ? (
        <View style={st.centro}>
          <Icon name="cloud-offline" size={32} color={C.txt3} />
          <Text style={st.centroP}>{error}</Text>
          <View style={{ height: 14 }} />
          <Button3D title={t('card.retry')} onPress={() => { hap(); cargar(); }} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 60 }}>

          {/* Bloqueada por el emisor: es lo primero que hay que resolver */}
          {bloqueada && (
            <View style={st.avisoBloqueo}>
              <Icon name="alert-circle" size={20} color={C.down} />
              <View style={{ flex: 1 }}>
                <Text style={st.avisoT}>{t('cset.bloqueadaT')}</Text>
                <Text style={st.avisoP}>{t('cset.bloqueadaP')}</Text>
              </View>
            </View>
          )}
          {bloqueada && (
            <>
              <View style={{ height: 12 }} />
              <Button3D
                title={ocupado === 'unblock' ? t('clave.verificando') : t('cset.desbloquear')}
                disabled={ocupado === 'unblock'}
                onPress={desbloquear}
              />
              <View style={{ height: 18 }} />
            </>
          )}

          {/* ---- gasto contra los límites ---- */}
          <SectionHead title={t('cset.limites')} />
          <View style={st.caja}>
            <Barra
              k={t('card.limDaily')}
              usado={gasto?.dailySpending}
              tope={gasto?.dailyLimit ?? card?.dailyLimit}
              t={t}
            />
            <Barra
              k={t('card.limWeekly')}
              usado={gasto?.weeklySpending}
              tope={gasto?.weeklyLimit ?? card?.weeklyLimit}
              t={t}
            />
            <Barra
              k={t('card.limMonthly')}
              usado={gasto?.monthlySpending}
              tope={gasto?.monthlyLimit ?? card?.monthlyLimit}
              t={t}
              ultima
            />
          </View>
          <Pressable onPress={() => { hap(); setEditandoLimites(true); }} style={st.enlace}>
            <Icon name="create" size={15} color={C.gold} />
            <Text style={st.enlaceTxt}>{t('cset.editarLimites')}</Text>
          </Pressable>

          {/* ---- compras online ---- */}
          <SectionHead title={t('cset.online')} />
          <View style={st.grupo}>
            <ListRow
              first
              icon="notifications"
              title={t('cset.telefono')}
              sub={account?.phone_number ? `+${account?.phone_country_code || ''} ${account.phone_number}` : t('cset.telefonoVacio')}
              onPress={() => { hap(); setEditandoTel(true); }}
            />
            <ListRow
              icon="shield-checkmark"
              title={t('cset.tresDs')}
              sub={t('cset.tresDsSub')}
              onPress={activar3ds}
              right={ocupado === '3ds' ? <ActivityIndicator size="small" color={C.gold} /> : null}
            />
          </View>

          {/* ---- documentos ---- */}
          <SectionHead title={t('cset.docs')} />
          <View style={st.grupo}>
            <ListRow
              first
              icon="document-text"
              title={t('cset.estado')}
              sub={t('cset.estadoSub')}
              onPress={compartirEstado}
              right={ocupado === 'statement' ? <ActivityIndicator size="small" color={C.gold} /> : null}
            />
          </View>

          {/* ---- acciones delicadas ---- */}
          <SectionHead title={t('cset.seguridad')} />
          <View style={st.grupo}>
            <ListRow
              first
              icon="refresh"
              title={t('cset.reemitir')}
              sub={t('cset.reemitirSub')}
              onPress={confirmarReemitir}
            />
            <ListRow
              icon="trash"
              title={t('cset.cancelar')}
              sub={t('cset.cancelarSub')}
              onPress={confirmarCancelar}
            />
          </View>
          <Text style={st.nota}>{t('cset.nota')}</Text>
        </ScrollView>
      )}

      <EditarLimites
        visible={editandoLimites}
        card={card}
        t={t}
        onCancel={() => setEditandoLimites(false)}
        onGuardado={(nuevos) => {
          setCard((c) => ({ ...c, ...nuevos }));
          setEditandoLimites(false);
          toast(t('cset.limitesOk'), 'success');
          cardApi.spending().then(setGasto).catch(() => {});
        }}
        onError={(m) => toast(m, 'error')}
      />

      <EditarTelefono
        visible={editandoTel}
        account={account}
        t={t}
        onCancel={() => setEditandoTel(false)}
        onGuardado={() => { setEditandoTel(false); toast(t('cset.telefonoOk'), 'success'); }}
        onError={(m) => toast(m, 'error')}
      />

      <PedirClave
        visible={!!pedir}
        titulo={pedir === 'reemitir' ? t('cset.pwReemitir') : t('cset.pwCancelar')}
        subtitulo={t('card.pwWhy')}
        ctaTexto={pedir === 'reemitir' ? t('cset.reemitirSi') : t('cset.cancelarSi')}
        onCancel={() => setPedir(null)}
        onSubmit={autorizar}
      />
    </View>
  );
}

// Barra de gasto contra el tope. Sin dato de gasto se muestra solo el tope,
// para no inventar un progreso que no conocemos.
function Barra({ k, usado, tope, t, ultima }) {
  const hayTope = tope != null && tope > 0;
  const hayUso = usado != null;
  const pct = hayTope && hayUso ? Math.min(1, usado / tope) : 0;
  const alto = pct >= 0.85;

  return (
    <View style={[st.barraFila, !ultima && st.barraLinea]}>
      <View style={st.barraTop}>
        <Text style={st.barraK}>{k}</Text>
        <Text style={st.barraV}>
          {hayUso ? `${qtyFmt(usado)} / ` : ''}{hayTope ? `${qtyFmt(tope)} ORIGEN` : t('cset.sinTope')}
        </Text>
      </View>
      {hayTope && (
        <View style={st.barraBg}>
          <View style={[st.barraOn, { width: `${Math.round(pct * 100)}%` }, alto && { backgroundColor: C.down }]} />
        </View>
      )}
      {!hayUso && hayTope && <Text style={st.barraNota}>{t('cset.sinGasto')}</Text>}
    </View>
  );
}

// ---------- editar límites ----------
function EditarLimites({ visible, card, t, onCancel, onGuardado, onError }) {
  const [d, setD] = useState('');
  const [s, setS] = useState('');
  const [m, setM] = useState('');
  const [yendo, setYendo] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setD(card?.dailyLimit != null ? String(Math.round(card.dailyLimit)) : '');
    setS(card?.weeklyLimit != null ? String(Math.round(card.weeklyLimit)) : '');
    setM(card?.monthlyLimit != null ? String(Math.round(card.monthlyLimit)) : '');
  }, [visible, card]);

  const num = (v) => String(v).replace(/\D/g, '').slice(0, 9);

  const guardar = async () => {
    hap();
    setYendo(true);
    try {
      const cuerpo = {};
      if (d) cuerpo.daily = Number(d);
      if (s) cuerpo.weekly = Number(s);
      if (m) cuerpo.monthly = Number(m);
      await cardApi.limits(cuerpo);
      onGuardado({
        dailyLimit: cuerpo.daily ?? card?.dailyLimit,
        weeklyLimit: cuerpo.weekly ?? card?.weeklyLimit,
        monthlyLimit: cuerpo.monthly ?? card?.monthlyLimit,
      });
    } catch (e) {
      onError(e?.message || t('card.errGeneric'));
    } finally { setYendo(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={st.hojaBg} onPress={onCancel}>
        <Pressable style={st.hoja} onPress={() => {}}>
          <View style={st.agarre} />
          <Text style={st.hojaT}>{t('cset.editarLimites')}</Text>
          <Text style={st.hojaSub}>{t('cset.limitesSub')}</Text>

          <Campo label={t('card.limDaily')} value={d} onChange={(v) => setD(num(v))} />
          <Campo label={t('card.limWeekly')} value={s} onChange={(v) => setS(num(v))} />
          <Campo label={t('card.limMonthly')} value={m} onChange={(v) => setM(num(v))} />

          <View style={{ height: 16 }} />
          <Button3D title={yendo ? t('clave.verificando') : t('cset.guardar')} disabled={yendo} onPress={guardar} />
          <Pressable onPress={onCancel} style={st.cancelar}><Text style={st.cancelarTxt}>{t('card.cancel')}</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- editar teléfono OTP ----------
function EditarTelefono({ visible, account, t, onCancel, onGuardado, onError }) {
  const [cc, setCc] = useState('');
  const [tel, setTel] = useState('');
  const [yendo, setYendo] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCc(account?.phone_country_code ? String(account.phone_country_code) : '504');
    setTel(account?.phone_number ? String(account.phone_number) : '');
  }, [visible, account]);

  const guardar = async () => {
    if (!tel) { onError(t('cset.telefonoFalta')); return; }
    hap();
    setYendo(true);
    try {
      await cardApi.setOtpPhone({ countryCode: cc || 504, phone: tel });
      onGuardado();
    } catch (e) {
      onError(e?.message || t('card.errGeneric'));
    } finally { setYendo(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={st.hojaBg} onPress={onCancel}>
        <Pressable style={st.hoja} onPress={() => {}}>
          <View style={st.agarre} />
          <Text style={st.hojaT}>{t('cset.telefono')}</Text>
          <Text style={st.hojaSub}>{t('cset.telefonoP')}</Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 92 }}>
              <Campo label={t('cset.pais')} value={cc} onChange={(v) => setCc(String(v).replace(/\D/g, '').slice(0, 4))} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo label={t('cset.numero')} value={tel} onChange={(v) => setTel(String(v).replace(/\D/g, '').slice(0, 15))} />
            </View>
          </View>

          <View style={{ height: 16 }} />
          <Button3D title={yendo ? t('clave.verificando') : t('cset.guardar')} disabled={yendo || !tel} onPress={guardar} />
          <Pressable onPress={onCancel} style={st.cancelar}><Text style={st.cancelarTxt}>{t('card.cancel')}</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Campo({ label, value, onChange }) {
  return (
    <>
      <Text style={st.campoK}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder="—"
        placeholderTextColor="#6f938f"
        style={st.campo}
        accessibilityLabel={label}
      />
    </>
  );
}

const st = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  centroP: { color: C.txt3, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6 },

  avisoBloqueo: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: 'rgba(240,119,107,0.10)', borderWidth: 1, borderColor: 'rgba(240,119,107,0.3)',
    borderRadius: 16, padding: 15,
  },
  avisoT: { color: C.txt, fontSize: 14, fontWeight: '700' },
  avisoP: { color: C.txt3, fontSize: 12.5, marginTop: 3, lineHeight: 18 },

  caja: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 16 },
  barraFila: { paddingVertical: 11 },
  barraLinea: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  barraTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  barraK: { color: C.txt3, fontSize: 12.5 },
  barraV: { color: C.txt, fontSize: 13, fontWeight: '600' },
  barraBg: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barraOn: { height: 6, borderRadius: 3, backgroundColor: C.gold },
  barraNota: { color: C.txt3, fontSize: 11, marginTop: 6 },

  grupo: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, overflow: 'hidden' },
  enlace: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13 },
  enlaceTxt: { color: C.gold, fontSize: 13.5, fontWeight: '600' },
  nota: { color: C.txt3, fontSize: 11.5, lineHeight: 17, marginTop: 14, textAlign: 'center' },

  hojaBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: '#06282B', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 28 },
  agarre: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2, alignSelf: 'center', marginBottom: 16 },
  hojaT: { color: C.txt, fontSize: 17.5, fontWeight: '800' },
  hojaSub: { color: C.txt3, fontSize: 12.5, marginTop: 5, lineHeight: 18, marginBottom: 6 },
  campoK: { color: C.txt3, fontSize: 10.5, letterSpacing: 1.4, fontWeight: '700', marginTop: 14, marginBottom: 7 },
  campo: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 16 },
  cancelar: { paddingVertical: 14, alignItems: 'center' },
  cancelarTxt: { color: C.txt3, fontSize: 13.5 },
});
