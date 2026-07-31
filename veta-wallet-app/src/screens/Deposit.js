import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Animated, Share, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, useToast, hap } from '../ui';
import { money, qtyFmt } from '../data';
import { depositApi } from '../api';
import { useT } from '../i18n';

// ============================================================
// Depositar USDT y recibir ORIGEN.
//
// El usuario manda USDT por Polygon a su propia dirección y el backend le
// acredita ORIGEN al precio del momento. No hay botón de convertir: se
// detecta y se acredita solo.
//
// Lo único que puede salir mal de verdad es que mande a la red equivocada o
// el token equivocado, y eso no tiene vuelta atrás. Por eso la advertencia de
// red no es una nota al pie: va arriba, antes que la dirección.
// ============================================================

// Cada cuánto se le pregunta al backend si entró algo. Cada consulta lee el
// saldo de Polygon, así que no conviene apurarla más.
const CADA_MS = 7000;

export default function Deposit({ nav }) {
  const t = useT();
  const toast = useToast();

  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [revisando, setRevisando] = useState(false);
  const [reciente, setReciente] = useState(null);   // última acreditación detectada

  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  // `fusionar` es para las respuestas de check(), que traen el saldo pero no
  // la dirección ni la red. Se mezclan sobre lo que ya había en vez de
  // reemplazarlo, y con setState funcional para no tener que meter `info` en
  // las dependencias del sondeo — si estuviera, cada respuesta reiniciaría el
  // intervalo y el reloj nunca llegaría a completar un ciclo limpio.
  const aplicar = useCallback((d, fusionar = false) => {
    if (!montado.current || !d) return;
    setInfo((prev) => (fusionar && prev ? { ...prev, ...d } : d));
    if (d.acreditado) {
      setReciente(d.acreditado);
      hap();
      toast(t('dep.acreditado', { q: qtyFmt(d.acreditado.origenAmount) }), 'success');
    }
  }, [t, toast]);

  // Primera carga.
  useEffect(() => {
    let vivo = true;
    depositApi.info()
      .then((d) => { if (vivo) { aplicar(d); setError(null); } })
      .catch((e) => { if (vivo) setError(e?.message || t('dep.errCarga')); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [aplicar, t]);

  // Sondeo mientras la pantalla está abierta: el depósito puede tardar unos
  // minutos en confirmarse en Polygon y el usuario está mirando.
  useEffect(() => {
    if (cargando || error) return;
    const id = setInterval(async () => {
      try {
        const d = await depositApi.check();
        aplicar(d, true);
      } catch (e) {}
    }, CADA_MS);
    return () => clearInterval(id);
  }, [cargando, error, aplicar]);

  const revisarAhora = async () => {
    hap();
    setRevisando(true);
    try {
      const d = await depositApi.check();
      aplicar(d, true);
      if (!d?.acreditado) toast(t('dep.nadaNuevo'), 'info');
    } catch (e) {
      toast(e?.message || t('dep.errRevisar'), 'error');
    } finally {
      if (montado.current) setRevisando(false);
    }
  };

  const copiar = async () => {
    hap();
    try { await Clipboard.setStringAsync(info?.address || ''); toast(t('dep.copiada')); }
    catch (e) { toast(t('recv.copyErr'), 'error'); }
  };

  const compartir = async () => {
    hap();
    try {
      await Share.share({
        message: `${t('dep.compartir', { red: info?.networkName || 'Polygon' })}\n\n${info?.address || ''}`,
      });
    } catch (e) {}
  };

  if (cargando) {
    return (
      <View style={{ flex: 1, paddingTop: 6 }}>
        <Header title={t('dep.title')} onBack={() => nav.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.gold} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, paddingTop: 6 }}>
        <Header title={t('dep.title')} onBack={() => nav.back()} />
        <View style={{ padding: 22 }}>
          <Text style={st.err}>{error}</Text>
          <View style={{ height: 16 }} />
          <Button3D title={t('card.retry')} onPress={() => { setCargando(true); setError(null); depositApi.info().then(aplicar).catch((e) => setError(e?.message)).finally(() => setCargando(false)); }} />
        </View>
      </View>
    );
  }

  const saldo = info?.origen || 0;
  const precio = info?.origenPriceUsd || 0;

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('dep.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 60 }}>

        {/* Saldo comprado — la unidad es ORIGEN, el dólar va al lado */}
        <View style={st.saldoCaja}>
          <Text style={st.saldoK}>{t('dep.tuSaldo')}</Text>
          <Text style={st.saldoV}>{qtyFmt(saldo)} ORIGEN</Text>
          {precio > 0 && <Text style={st.saldoUsd}>≈ {money(saldo * precio)} USD</Text>}
        </View>

        {reciente && <Acreditado d={reciente} t={t} />}

        {/* La advertencia va ANTES de la dirección: mandar a otra red no
            tiene vuelta atrás y hay que leerla antes de copiar nada. */}
        <View style={st.aviso}>
          <Icon name="warning" size={18} color="#E8B84B" />
          <View style={{ flex: 1 }}>
            <Text style={st.avisoT}>{t('dep.avisoT', { red: info?.networkName || 'Polygon (PoS)' })}</Text>
            <Text style={st.avisoTxt}>
              {t('dep.avisoTxt', {
                red: info?.networkName || 'Polygon (PoS)',
                tokens: (info?.tokens || ['USDT']).join(' / '),
              })}
            </Text>
          </View>
        </View>

        <View style={st.qrCaja}>
          {info?.address
            ? <QRCode value={info.address} size={200} color="#04211d" backgroundColor="#ffffff" ecl="M" />
            : <Text style={{ color: '#04211d' }}>—</Text>}
        </View>

        <Text style={st.redPie}>
          {t('dep.red')}: <Text style={{ color: C.gold, fontWeight: '700' }}>{info?.networkName || 'Polygon (PoS)'}</Text>
        </Text>

        <View style={st.dirCaja}>
          <Text style={st.dir} numberOfLines={2}>{info?.address || '—'}</Text>
        </View>

        <View style={st.acciones}>
          <Pressable onPress={copiar} style={st.accion} accessibilityRole="button">
            <Icon name="copy" size={18} color={C.gold} />
            <Text style={st.accionTxt}>{t('dep.copiar')}</Text>
          </Pressable>
          <Pressable onPress={compartir} style={st.accion} accessibilityRole="button">
            <Icon name="share-social" size={18} color={C.gold} />
            <Text style={st.accionTxt}>{t('dep.compartirBtn')}</Text>
          </Pressable>
        </View>

        <View style={st.pasos}>
          <Paso n="1" txt={t('dep.paso1', { red: info?.networkName || 'Polygon (PoS)' })} />
          <Paso n="2" txt={t('dep.paso2', { min: money(info?.minUsd ?? 0.5) })} />
          <Paso n="3" txt={t('dep.paso3')} />
        </View>

        {info?.sinRed && (
          <Text style={st.sinRed}>{t('dep.sinRed')}</Text>
        )}

        <View style={{ height: 18 }} />
        <Button3D
          title={revisando ? t('dep.revisando') : t('dep.revisar')}
          disabled={revisando}
          onPress={revisarAhora}
        />
        <Text style={st.pieAuto}>{t('dep.auto')}</Text>
      </ScrollView>
    </View>
  );
}

// ---------- lo que acaba de entrar ----------
function Acreditado({ d, t }) {
  const entra = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entra, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [entra]);

  return (
    <Animated.View style={[st.nuevo, { opacity: entra, transform: [{ translateY: entra.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      <Icon name="checkmark-circle" size={22} color={C.up} />
      <View style={{ flex: 1 }}>
        <Text style={st.nuevoT}>{t('dep.nuevoT')}</Text>
        <Text style={st.nuevoV}>+{qtyFmt(d.origenAmount)} ORIGEN</Text>
        <Text style={st.nuevoD}>
          {t('dep.nuevoD', { usdt: money(d.usdtAmount), precio: money(d.origenPriceUsd) })}
        </Text>
      </View>
    </Animated.View>
  );
}

function Paso({ n, txt }) {
  return (
    <View style={st.paso}>
      <View style={st.pasoN}><Text style={st.pasoNTxt}>{n}</Text></View>
      <Text style={st.pasoTxt}>{txt}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  saldoCaja: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(201,169,97,0.22)', borderRadius: 18, padding: 18, alignItems: 'center' },
  saldoK: { color: C.txt3, fontSize: 10.5, letterSpacing: 1.4, fontWeight: '700' },
  saldoV: { color: C.gold, fontSize: 27, fontWeight: '800', marginTop: 7 },
  saldoUsd: { color: C.txt3, fontSize: 13, marginTop: 4 },

  nuevo: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'rgba(46,160,110,0.10)', borderWidth: 1, borderColor: 'rgba(46,160,110,0.32)', borderRadius: 16, padding: 15, marginTop: 14 },
  nuevoT: { color: C.txt3, fontSize: 11, letterSpacing: 1.1, fontWeight: '700' },
  nuevoV: { color: C.up, fontSize: 18, fontWeight: '800', marginTop: 3 },
  nuevoD: { color: C.txt3, fontSize: 11.5, marginTop: 3, lineHeight: 16 },

  aviso: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: 'rgba(232,184,75,0.09)', borderWidth: 1, borderColor: 'rgba(232,184,75,0.30)', borderRadius: 16, padding: 15, marginTop: 18 },
  avisoT: { color: '#E8B84B', fontSize: 13, fontWeight: '800' },
  avisoTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginTop: 4 },

  qrCaja: { backgroundColor: '#fff', borderRadius: 20, padding: 16, alignSelf: 'center', marginTop: 22 },
  redPie: { color: C.txt2, fontSize: 12.5, textAlign: 'center', marginTop: 14 },

  dirCaja: { backgroundColor: C.panel2, borderRadius: 14, padding: 14, marginTop: 12 },
  dir: { color: C.txt, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  acciones: { flexDirection: 'row', gap: 10, marginTop: 12 },
  accion: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingVertical: 13 },
  accionTxt: { color: C.gold, fontSize: 13, fontWeight: '700' },

  pasos: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, paddingHorizontal: 16, marginTop: 20 },
  paso: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', paddingVertical: 14 },
  pasoN: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(201,169,97,0.14)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  pasoNTxt: { color: C.gold, fontSize: 12, fontWeight: '800' },
  pasoTxt: { flex: 1, color: C.txt2, fontSize: 12.5, lineHeight: 18 },

  sinRed: { color: '#E8B84B', fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 17 },
  pieAuto: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 17 },
  err: { color: C.down, fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
});
