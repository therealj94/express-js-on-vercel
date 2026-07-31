import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Animated, Modal, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import Svg, { Path } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { C, G } from '../theme';
import { Logo, Button3D, ListRow, Toggle, SectionHead, Skeleton, useToast, useAccount, hap } from '../ui';
import { qtyFmt } from '../data';
import { cardApi, sinTarjeta } from '../api';
import { useT } from '../i18n';

// ============================================================
// Tarjeta Visa · pantalla conectada al backend
//
// La tarjeta es un producto REAL emitido contra CryptoMate. Todo lo que se
// ve acá viene del servidor: los últimos 4 dígitos, el estado, el saldo, los
// límites y los movimientos. Nada se inventa ni se deriva localmente.
//
// Dos reglas que se respetan a lo largo del archivo:
//
//   1. Los controles hacen lo que dicen. El interruptor de congelar llama a
//      /cards/freeze y, si el servidor falla, vuelve atrás y lo dice. Antes
//      era un booleano local con un aviso de confirmación: el usuario creía
//      haber congelado una tarjeta que seguía gastando.
//
//   2. Los datos sensibles (número completo, CVV, PIN) se piden con la
//      contraseña cada vez, se muestran un momento y NUNCA se guardan en el
//      dispositivo ni quedan en el estado más de lo necesario.
// ============================================================

// Segundos que los datos sensibles quedan visibles antes de ocultarse solos.
const OCULTAR_TRAS = 45;

const estadoTarjeta = (s) => String(s || '').toUpperCase();
const estaCongelada = (s) => estadoTarjeta(s) === 'FROZEN';

export default function CardScreen({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();

  const [fase, setFase] = useState('cargando');   // cargando · error · sinTarjeta · lista
  const [card, setCard] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setFase('cargando');
    try {
      const d = await cardApi.mine();
      setCard(d);
      setFase('lista');
    } catch (e) {
      // 404 no es un fallo: es "todavía no tenés tarjeta". Se distingue para
      // no mostrarle un error a alguien que simplemente no la ha pedido.
      if (sinTarjeta(e)) { setCard(null); setFase('sinTarjeta'); return; }
      setErrMsg(mensajeDeError(e, t));
      setFase('error');
    }
  }, [t]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => nav.go('home')}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('card.back')}
        >
          <Icon name="chevron-back" size={20} color={C.txt} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>{t('card.title')}</Text>
        </View>
        <Pressable
          onPress={() => { hap(); cargar({ silencioso: true }); }}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('card.refresh')}
        >
          <Icon name="sync" size={19} color={C.txt} />
        </Pressable>
      </View>

      {fase === 'cargando' && <Cargando />}
      {fase === 'error' && <ErrorEstado msg={errMsg} onRetry={() => cargar()} t={t} />}
      {fase === 'sinTarjeta' && <SolicitarTarjeta nav={nav} onEmitida={() => cargar()} t={t} toast={toast} />}
      {fase === 'lista' && card && (
        <TarjetaViva
          card={card}
          account={account}
          nav={nav}
          t={t}
          toast={toast}
          onCambio={(parcial) => setCard((c) => ({ ...c, ...parcial }))}
        />
      )}
    </View>
  );
}

// Traduce el código de error de la capa de red a algo que se pueda leer.
function mensajeDeError(e, t) {
  const porCodigo = {
    timeout: t('card.errTimeout'),
    red: t('card.errNet'),
    auth: t('card.errAuth'),
    servidor: t('card.errServer'),
    config: t('auth.errServer'),
  };
  return porCodigo[e?.code] || e?.message || t('card.errGeneric');
}

// ---------- estados de carga y error ----------
function Cargando() {
  return (
    <View style={{ paddingHorizontal: 22 }}>
      <Skeleton width="100%" height={210} radius={22} />
      <View style={{ height: 18 }} />
      <Skeleton width="100%" height={54} radius={16} />
      <View style={{ height: 10 }} />
      <Skeleton width="100%" height={120} radius={18} />
    </View>
  );
}

function ErrorEstado({ msg, onRetry, t }) {
  return (
    <View style={styles.centro}>
      <Icon name="cloud-offline" size={34} color={C.txt3} />
      <Text style={styles.centroT}>{t('card.errTitle')}</Text>
      <Text style={styles.centroP}>{msg}</Text>
      <View style={{ height: 16 }} />
      <Button3D title={t('card.retry')} onPress={() => { hap(); onRetry(); }} />
    </View>
  );
}

// ---------- todavía sin tarjeta: flujo de solicitud ----------
function SolicitarTarjeta({ nav, onEmitida, t, toast }) {
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [faltaKyc, setFaltaKyc] = useState(false);

  const pedir = async () => {
    if (!acepta) { toast(t('card.reqNeedTerms'), 'error'); return; }
    hap();
    setEnviando(true);
    try {
      await cardApi.request({ acceptedTerms: true });
      toast(t('card.reqOk'), 'success');
      onEmitida();
    } catch (e) {
      // 403 = el backend exige KYC aprobado antes de emitir.
      if (e?.status === 403) { setFaltaKyc(true); toast(t('card.reqNeedKyc'), 'error'); }
      else toast(mensajeDeError(e, t), 'error');
    } finally { setEnviando(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }}>
      <View style={styles.pitchCard}>
        <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pitchBg}>
          <Waves />
          <View style={styles.pitchIn}>
            <View style={styles.cardTop}><Logo size={38} /><Text style={styles.visa}>VISA</Text></View>
            <Text style={styles.pitchT}>{t('card.pitchT')}</Text>
          </View>
        </LinearGradient>
      </View>

      <Text style={styles.pitchP}>{t('card.pitchP')}</Text>

      {faltaKyc && (
        <View style={styles.kycBox}>
          <Icon name="shield-checkmark" size={20} color={C.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.kycT}>{t('card.kycT')}</Text>
            <Text style={styles.kycP}>{t('card.kycP')}</Text>
          </View>
        </View>
      )}
      {faltaKyc && (
        <>
          <View style={{ height: 12 }} />
          <Button3D title={t('card.kycCta')} onPress={() => { hap(); nav.go('kyc'); }} />
          <View style={{ height: 10 }} />
        </>
      )}

      <Pressable
        onPress={() => { hap(); setAcepta(!acepta); }}
        style={styles.termsRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acepta }}
        accessibilityLabel={t('card.terms')}
      >
        <View style={[styles.checkbox, acepta && { backgroundColor: C.gold, borderColor: C.gold }]}>
          {acepta && <Icon name="checkmark" size={13} color={C.darkText} />}
        </View>
        <Text style={styles.termsTxt}>{t('card.terms')}</Text>
      </Pressable>

      <View style={{ height: 14 }} />
      <Button3D
        title={enviando ? t('card.reqSending') : t('card.reqCta')}
        disabled={enviando || !acepta}
        onPress={pedir}
      />
      {enviando && <Text style={styles.slowHint}>{t('card.reqSlow')}</Text>}
    </ScrollView>
  );
}

// ---------- tarjeta emitida ----------
function TarjetaViva({ card, account, nav, t, toast, onCambio }) {
  const rot = useRef(new Animated.Value(0)).current;
  const [volteada, setVolteada] = useState(false);
  const [congelando, setCongelando] = useState(false);

  // Datos sensibles: viven solo en memoria y se borran solos.
  const [secreto, setSecreto] = useState(null);   // { pan, cvv, expiry, panUrl }
  const [pin, setPin] = useState(null);
  const [pedirPw, setPedirPw] = useState(null);   // 'pan' | 'pin' | null

  const [movs, setMovs] = useState(null);         // null = cargando, [] = vacío
  const [movsErr, setMovsErr] = useState(false);

  const congelada = estaCongelada(card.status);

  // Los secretos se ocultan solos: si alguien deja el teléfono abierto en
  // esta pantalla, el número completo no se queda a la vista.
  useEffect(() => {
    if (!secreto && !pin) return;
    const id = setTimeout(() => { setSecreto(null); setPin(null); setVolteada(false); rot.setValue(0); }, OCULTAR_TRAS * 1000);
    return () => clearTimeout(id);
  }, [secreto, pin, rot]);

  useEffect(() => {
    let vivo = true;
    cardApi.transactions({ page: 1 })
      .then((d) => { if (vivo) setMovs(Array.isArray(d?.transactions) ? d.transactions : []); })
      .catch(() => { if (vivo) { setMovs([]); setMovsErr(true); } });
    return () => { vivo = false; };
  }, []);

  const voltear = () => {
    hap();
    const to = volteada ? 0 : 1;
    Animated.spring(rot, { toValue: to, useNativeDriver: true, friction: 8, tension: 10 }).start();
    setVolteada(!volteada);
  };
  const frontRot = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRot = rot.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  // Congelar de verdad. Se actualiza la UI al instante para que responda,
  // pero si el servidor rechaza se vuelve atrás y se avisa: es preferible
  // que el usuario vea el estado real a que crea que hizo algo que no pasó.
  const cambiarCongelado = async (v) => {
    if (congelando) return;
    hap();
    const previo = card.status;
    setCongelando(true);
    onCambio({ status: v ? 'FROZEN' : 'ACTIVE' });
    try {
      const r = await cardApi.setFrozen(v);
      onCambio({ status: r?.status || (v ? 'FROZEN' : 'ACTIVE') });
      toast(v ? t('card.frozenT') : t('card.activeT'), 'success');
    } catch (e) {
      onCambio({ status: previo });
      toast(t('card.freezeErr', { m: mensajeDeError(e, t) }), 'error');
    } finally { setCongelando(false); }
  };

  // La ficha de contraseña se cierra cuando la consulta TERMINA, no cuando se
  // envía: pedir el número puede tardar varios segundos (pasa por el emisor) y
  // cerrarla antes dejaba la pantalla quieta sin explicar que algo iba en curso.
  const revelar = async (password) => {
    const tipo = pedirPw;
    try {
      if (tipo === 'pan') {
        const d = await cardApi.pan(password);
        setSecreto(d);
        if (!d?.pan && d?.panUrl) toast(t('card.panFallback'), 'info');
        else { setVolteada(true); Animated.spring(rot, { toValue: 1, useNativeDriver: true, friction: 8, tension: 10 }).start(); }
      } else {
        const d = await cardApi.pin(password);
        setPin(d?.pin || null);
        if (!d?.pin) toast(t('card.pinFallback'), 'info');
      }
    } catch (e) {
      toast(e?.status === 401 ? t('card.badPw') : mensajeDeError(e, t), 'error');
    } finally {
      setPedirPw(null);
    }
  };

  const copiar = async (valor, aviso) => {
    try { await Clipboard.setStringAsync(String(valor)); hap(); toast(aviso, 'success'); } catch (e) {}
  };

  const titular = (card.cardHolderName || account?.name || '').toUpperCase();

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
      <Pressable onPress={voltear} style={{ height: 210 }} accessibilityRole="button" accessibilityLabel={t('card.flip')}>
        <Animated.View style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: frontRot }] }]}>
          <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
            <Waves />
            {congelada && <View style={styles.frozenVeil} />}
            <View style={styles.cardIn}>
              <View style={styles.cardTop}><Logo size={42} /><Text style={styles.visa}>VISA</Text></View>
              <LinearGradient colors={['#F8EFCF', '#C9A961', '#96793F']} style={styles.chip} />
              <Text style={styles.cardNum}>
                {secreto?.pan ? formatearPan(secreto.pan) : `••••  ••••  ••••  ${card.last4 || '••••'}`}
              </Text>
              <View style={styles.cardBot}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.k}>{t('card.holder')}</Text>
                  <Text style={styles.v} numberOfLines={1}>{titular || '—'}</Text>
                </View>
                <View>
                  <Text style={[styles.k, { textAlign: 'right' }]}>{t('card.expiry')}</Text>
                  <Text style={[styles.v, { textAlign: 'right' }]}>{secreto?.expiry || '••/••'}</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: backRot }] }]}>
          <LinearGradient colors={['#0B4A42', '#052824']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
            <View style={styles.magstripe} />
            <View style={styles.sig} />
            {/* El CVV solo existe acá si el usuario lo pidió con su contraseña.
                Antes había un número fijo escrito en el código que no era el
                de ninguna tarjeta. */}
            <View style={styles.cvvBox}>
              <Text style={styles.cvv}>{secreto?.cvv || '•••'}</Text>
            </View>
            <View style={styles.backFoot}>
              <Text style={styles.backTxt}>{t('card.backNote')}</Text>
              <Text style={styles.visa}>VISA</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>

      <View style={styles.hint}>
        <Icon name="sync" size={13} color={C.txt3} />
        <Text style={styles.hintTxt}>{t('card.hint')}</Text>
      </View>

      {/* Estado real que reporta el emisor, no un booleano local. */}
      <View style={styles.stateRow}>
        <View style={[styles.stateBadge, { backgroundColor: congelada ? 'rgba(240,119,107,0.13)' : 'rgba(62,217,160,0.13)' }]}>
          <Icon name={congelada ? 'snow' : 'checkmark-circle'} size={13} color={congelada ? C.down : C.up} />
          <Text style={[styles.stateTxt, { color: congelada ? C.down : C.up }]}>
            {congelada ? t('card.frozen') : t('card.active')}
          </Text>
        </View>
      </View>

      {/* Saldo — siempre en ORIGEN, nunca en dólares (regla del backend). */}
      <View style={styles.saldoBox}>
        <Text style={styles.saldoK}>{t('card.balance')}</Text>
        <Text style={styles.saldoV}>
          {card.availableOrigen != null ? `${qtyFmt(card.availableOrigen)} ORIGEN` : '—'}
        </Text>
        {card.availableOrigen == null && <Text style={styles.saldoHint}>{t('card.balanceUnknown')}</Text>}
      </View>

      <View style={styles.group}>
        <ListRow
          first
          icon="snow"
          title={t('card.freeze')}
          sub={t('card.freezeSub')}
          onPress={() => cambiarCongelado(!congelada)}
          right={
            congelando
              ? <ActivityIndicator size="small" color={C.gold} />
              : <Toggle value={congelada} onValueChange={cambiarCongelado} />
          }
        />
        <ListRow
          icon="eye"
          title={t('card.showPan')}
          sub={t('card.showPanSub')}
          onPress={() => { hap(); setPedirPw('pan'); }}
        />
        <ListRow
          icon="lock-closed"
          title={t('card.showPin')}
          sub={pin ? `PIN · ${pin}` : t('card.showPinSub')}
          onPress={() => { hap(); setPedirPw('pin'); }}
        />
      </View>

      {secreto?.pan && (
        <Pressable onPress={() => copiar(secreto.pan.replace(/\s/g, ''), t('card.copied'))} style={styles.copyRow}>
          <Icon name="copy" size={15} color={C.gold} />
          <Text style={styles.copyTxt}>{t('card.copyPan')}</Text>
        </Pressable>
      )}
      {(secreto || pin) && <Text style={styles.autoHide}>{t('card.autoHide', { s: OCULTAR_TRAS })}</Text>}

      {/* Límites, tal como los reporta el emisor (convertidos a ORIGEN). */}
      {(card.dailyLimit != null || card.monthlyLimit != null) && (
        <>
          <SectionHead title={t('card.limits')} />
          <View style={styles.limitBox}>
            {card.dailyLimit != null && <FilaLim k={t('card.limDaily')} v={`${qtyFmt(card.dailyLimit)} ORIGEN`} />}
            {card.weeklyLimit != null && <FilaLim k={t('card.limWeekly')} v={`${qtyFmt(card.weeklyLimit)} ORIGEN`} />}
            {card.monthlyLimit != null && <FilaLim k={t('card.limMonthly')} v={`${qtyFmt(card.monthlyLimit)} ORIGEN`} />}
          </View>
        </>
      )}

      <SectionHead title={t('card.movs')} action={t('act.title')} onAction={() => nav.go('activity')} />
      {movs === null && <Skeleton width="100%" height={90} radius={16} />}
      {movs !== null && movs.length === 0 && (
        <View style={styles.emptyBox}>
          <Icon name="card" size={26} color={C.txt3} />
          <Text style={styles.emptyTxt}>{movsErr ? t('card.movsErr') : t('card.empty')}</Text>
        </View>
      )}
      {movs !== null && movs.length > 0 && (
        <View style={styles.group}>
          {movs.slice(0, 12).map((m, i) => (
            <View key={m.id || i} style={[styles.txn, i > 0 && styles.txnLine]}>
              <View style={styles.txnIc}><Icon name="card" size={17} color={C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnT} numberOfLines={1}>{m.merchant || '—'}</Text>
                <Text style={styles.txnD}>{fmtFecha(m.date)}{m.status ? ` · ${m.status}` : ''}</Text>
              </View>
              <Text style={styles.txnV}>{m.origenAmount != null ? `${qtyFmt(m.origenAmount)} ORIGEN` : '—'}</Text>
            </View>
          ))}
        </View>
      )}

      <PasswordSheet
        visible={!!pedirPw}
        titulo={pedirPw === 'pin' ? t('card.pwPin') : t('card.pwPan')}
        t={t}
        onCancel={() => setPedirPw(null)}
        onSubmit={revelar}
      />
    </ScrollView>
  );
}

function FilaLim({ k, v }) {
  return (
    <View style={styles.limRow}>
      <Text style={styles.limK}>{k}</Text>
      <Text style={styles.limV}>{v}</Text>
    </View>
  );
}

// ---------- contraseña para datos sensibles ----------
function PasswordSheet({ visible, titulo, t, onCancel, onSubmit }) {
  const [pw, setPw] = useState('');
  const [ver, setVer] = useState(false);
  const [yendo, setYendo] = useState(false);

  useEffect(() => { if (!visible) { setPw(''); setVer(false); setYendo(false); } }, [visible]);

  const enviar = async () => {
    if (!pw) return;
    setYendo(true);
    const v = pw;
    setPw('');
    await onSubmit(v);
    setYendo(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.sheetBg} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <Text style={styles.sheetTitle}>{titulo}</Text>
          <Text style={styles.sheetSub}>{t('card.pwWhy')}</Text>
          <View style={{ position: 'relative', marginTop: 14 }}>
            <TextInput
              value={pw}
              onChangeText={setPw}
              secureTextEntry={!ver}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('auth.password')}
              placeholderTextColor="#6f938f"
              style={[styles.input, { paddingRight: 46 }]}
              accessibilityLabel={t('auth.password')}
            />
            <Pressable
              onPress={() => { hap(); setVer(!ver); }}
              style={styles.ojito}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t(ver ? 'card.hidePw' : 'card.showPw')}
            >
              <Icon name={ver ? 'eye-off' : 'eye'} size={19} color={C.txt3} />
            </Pressable>
          </View>
          <View style={{ height: 16 }} />
          <Button3D title={yendo ? t('card.checking') : t('card.reveal')} disabled={!pw || yendo} onPress={enviar} />
          <Pressable onPress={onCancel} style={{ paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: C.txt3, fontSize: 13.5 }}>{t('card.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- helpers ----------
const formatearPan = (pan) => String(pan).replace(/\s/g, '').replace(/(.{4})/g, '$1  ').trim();

function fmtFecha(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  } catch (e) { return ''; }
}

function Waves() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 320 200" preserveAspectRatio="none">
      {[132, 147, 162, 117].map((y, i) => (
        <Path key={i} d={`M-20 ${y} Q 80 ${y - 40} 160 ${y - 10} T 340 ${y - 20}`} stroke="rgba(201,169,97,0.4)" strokeWidth={1.3} fill="none" />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingBottom: 14, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center', fontSize: 19, fontWeight: '800', color: C.txt },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  centroT: { color: C.txt, fontSize: 16, fontWeight: '700', marginTop: 6 },
  centroP: { color: C.txt3, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  face: { position: 'absolute', top: 0, left: 0, right: 0, height: 210, borderRadius: 22, backfaceVisibility: 'hidden' },
  cardBg: { flex: 1, borderRadius: 22, overflow: 'hidden' },
  cardIn: { flex: 1, padding: 20, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  visa: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: '#F3ECD9' },
  chip: { width: 44, height: 34, borderRadius: 7 },
  cardNum: { fontSize: 19, letterSpacing: 2, color: '#F3ECD9', fontWeight: '600' },
  cardBot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  k: { fontSize: 8, letterSpacing: 1.2, color: 'rgba(243,236,217,0.6)' },
  v: { fontSize: 12.5, color: '#F3ECD9', fontWeight: '600', marginTop: 3 },
  frozenVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,27,28,0.45)', zIndex: 2 },
  magstripe: { position: 'absolute', top: 22, left: 0, right: 0, height: 42, backgroundColor: '#04211d' },
  sig: { position: 'absolute', top: 80, left: 21, right: 70, height: 28, backgroundColor: '#e8e0cf', borderRadius: 4 },
  cvvBox: { position: 'absolute', top: 82, right: 21, backgroundColor: '#e8e0cf', borderRadius: 5, paddingHorizontal: 12, paddingVertical: 5 },
  cvv: { color: '#1a1a1a', fontWeight: '700', letterSpacing: 1 },
  backFoot: { position: 'absolute', bottom: 16, left: 21, right: 21, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  backTxt: { fontSize: 9, color: 'rgba(243,236,217,0.6)', lineHeight: 13, flex: 1, marginRight: 10 },

  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, marginBottom: 14 },
  hintTxt: { fontSize: 11, color: C.txt3 },
  stateRow: { alignItems: 'center', marginBottom: 14 },
  stateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  stateTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  saldoBox: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 18, alignItems: 'center', marginBottom: 12 },
  saldoK: { fontSize: 10, letterSpacing: 1.4, color: C.txt3, fontWeight: '700' },
  saldoV: { fontSize: 26, color: C.gold, fontWeight: '800', marginTop: 6 },
  saldoHint: { fontSize: 11, color: C.txt3, marginTop: 5, textAlign: 'center' },

  group: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, overflow: 'hidden', marginBottom: 8 },
  copyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11 },
  copyTxt: { color: C.gold, fontSize: 13, fontWeight: '600' },
  autoHide: { color: C.txt3, fontSize: 11, textAlign: 'center', marginBottom: 8 },

  limitBox: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 16, marginBottom: 6 },
  limRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  limK: { color: C.txt3, fontSize: 12.5 },
  limV: { color: C.txt, fontSize: 13, fontWeight: '600' },

  emptyBox: { alignItems: 'center', gap: 8, backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 22 },
  emptyTxt: { color: C.txt3, fontSize: 12.5, textAlign: 'center' },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  txnLine: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  txnIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  txnT: { fontSize: 14, fontWeight: '600', color: C.txt },
  txnD: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  txnV: { fontSize: 13.5, fontWeight: '600', color: C.txt },

  pitchCard: { height: 168, marginBottom: 18 },
  pitchBg: { flex: 1, borderRadius: 22, overflow: 'hidden' },
  pitchIn: { flex: 1, padding: 20, justifyContent: 'space-between' },
  pitchT: { color: '#F3ECD9', fontSize: 17, fontWeight: '700', maxWidth: '85%' },
  pitchP: { color: C.txt2, fontSize: 13.5, lineHeight: 20, marginBottom: 16 },
  kycBox: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(201,169,97,0.25)', borderRadius: 16, padding: 15 },
  kycT: { color: C.txt, fontSize: 14, fontWeight: '700' },
  kycP: { color: C.txt3, fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  checkbox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  termsTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  slowHint: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 10 },

  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#06282B', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 30 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: C.txt, fontSize: 17, fontWeight: '800' },
  sheetSub: { color: C.txt3, fontSize: 12.5, marginTop: 5, lineHeight: 18 },
  input: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 15 },
  ojito: { position: 'absolute', right: 6, top: 0, bottom: 0, width: 40, alignItems: 'center', justifyContent: 'center' },
});
