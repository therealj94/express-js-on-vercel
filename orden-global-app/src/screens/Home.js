// El inicio: el saldo REAL arriba --del mismo endpoint que usa la wallet--,
// las apps con sus logos sobre sus fondos de marca, y el ecosistema vivo.
// Nada de ceros falsos: si el backend no contesta, se dice «sin conexión».
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet, Animated, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G, MARCAS } from '../theme';
import { useT, setIdioma } from '../i18n';
import { quienSoy, saldoOrigen, precioOrigen, elAsistente } from '../api';
import { Etiqueta, Entra } from '../ui';

const FICHAS = [
  { ruta: 'wallet/abrir', marca: 'veta', nom: 'app.veta', sub: 'app.veta.sub' },
  { ruta: 'pay/abrir', marca: 'pay', nom: 'app.pay', sub: 'app.pay.sub', candado: true },
  { ruta: 'id/abrir', marca: 'gid', nom: 'app.gid', sub: 'app.gid.sub' },
  { ruta: 'scan/abrir', marca: 'og', nom: 'app.scan', sub: 'app.scan.sub' },
];

function nf(x) {
  return Number(x).toLocaleString('es-HN', { maximumFractionDigits: 2 });
}

export default function Home({ abrir, salir }) {
  const t = useT();
  const yo = quienSoy() || {};
  const [saldo, setSaldo] = useState(undefined);   // undefined=cargando, null=sin red
  const [precio, setPrecio] = useState(null);
  const [refrescando, setRefrescando] = useState(false);
  const brillo = useRef(new Animated.Value(0)).current;

  const traer = useCallback(async () => {
    const [s, p] = await Promise.all([saldoOrigen(), precioOrigen()]);
    setSaldo(s); setPrecio(p);
  }, []);
  useEffect(() => { traer(); }, [traer]);
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(brillo, { toValue: 1, duration: 2600, useNativeDriver: true }),
      Animated.timing(brillo, { toValue: 0, duration: 2600, useNativeDriver: true }),
    ])).start();
  }, []);

  const usd = saldo != null && precio != null ? saldo * precio : null;
  const nombrePila = String(yo.nombre || '').split(' ')[0];

  return (
    <ScrollView
      style={s.todo} contentContainerStyle={s.dentro}
      refreshControl={<RefreshControl refreshing={refrescando} tintColor={C.gold}
        onRefresh={async () => { setRefrescando(true); await traer(); setRefrescando(false); }} />}>
      <Entra>
        <View style={s.cab}>
          <View style={{ flex: 1 }}>
            <Text style={s.hola}>{t('inicio.hola')}, <Text style={s.holaNom}>{nombrePila}</Text></Text>
            <Text style={s.sub}>{t('inicio.sub')}</Text>
          </View>
          <View style={s.idiomas}>
            {['es', 'en'].map((x) => (
              <Pressable key={x} onPress={() => setIdioma(x)} hitSlop={8}>
                <Text style={[s.idi, t.idioma === x && s.idiOn]}>{x.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Entra>

      {/* ── el saldo, de verdad ─────────────────────────────────────── */}
      <Entra delay={70}>
        <Pressable onPress={() => abrir('og://wallet/abrir')}>
          <LinearGradient colors={['rgba(14,97,85,0.55)', 'rgba(6,40,42,0.9)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.saldoCaja}>
            <Animated.View style={[s.brillo, {
              opacity: brillo.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.18] }),
            }]} />
            <Etiqueta>{t('inicio.saldo')}</Etiqueta>
            {saldo === undefined ? (
              <Text style={s.saldoTxt}>—</Text>
            ) : saldo === null ? (
              <Text style={s.sinRed}>{t('inicio.sinRed')}</Text>
            ) : (
              <>
                <Text style={s.saldoTxt}>{nf(saldo)} <Text style={s.moneda}>ORIGEN</Text></Text>
                {usd != null && <Text style={s.usd}>≈ {nf(usd)} USD · 1 ORIGEN = {nf(precio)} USD</Text>}
              </>
            )}
            <View style={s.abrirFila}><Text style={s.abrirTxt}>{t('inicio.abrirWallet')} ›</Text></View>
          </LinearGradient>
        </Pressable>
      </Entra>

      <Etiqueta style={{ marginTop: 20 }}>{t('inicio.apps')}</Etiqueta>
      <View style={s.malla}>
        {FICHAS.map((f, i) => (
          <Entra key={f.ruta} delay={120 + i * 70} style={s.celda}>
            <Pressable onPress={() => abrir('og://' + f.ruta)} style={({ pressed }) => [
              s.ficha, { backgroundColor: MARCAS[f.marca].fondo },
              pressed && { transform: [{ scale: 0.97 }] },
            ]}>
              <Image source={MARCAS[f.marca].logo} style={s.logo} resizeMode="contain" />
              {f.candado && <View style={s.sello}><Text style={s.selloTxt}>GENESIS ID</Text></View>}
            </Pressable>
            <Text style={s.nom}>{t(f.nom)}</Text>
            <Text style={s.nomSub}>{t(f.sub)}</Text>
          </Entra>
        ))}
      </View>

      <Etiqueta style={{ marginTop: 20 }}>{t('inicio.eco')}</Etiqueta>
      <Entra delay={380}>
        <Pressable onPress={() => abrir('og://chat/abrir')} style={s.ancha}>
          <View style={[s.icono, { backgroundColor: 'rgba(201,169,97,0.16)' }]}><Text style={s.iconoTxt}>💬</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.anchaNom}>{t('inicio.chat')}</Text>
            <Text style={s.anchaSub}>{t('inicio.chat.sub')}</Text>
          </View>
          <Text style={s.flecha}>›</Text>
        </Pressable>
      </Entra>
      <Entra delay={440}>
        <Pressable onPress={() => abrir('og://cerebro/abrir')} style={s.ancha}>
          <View style={s.icono}><View style={s.puntoVivo} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.anchaNom}>{t('inicio.cerebro')}</Text>
            <Text style={s.anchaSub}>{t('inicio.cerebro.sub')}</Text>
          </View>
          <Text style={s.flecha}>›</Text>
        </Pressable>
      </Entra>
      <Entra delay={500}>
        <Pressable onPress={() => abrir('og://asistente/abrir')} style={s.ancha}>
          <LinearGradient colors={G.gold} style={s.icono} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={[s.iconoTxt, { color: C.darkText, fontWeight: '900' }]}>{elAsistente()[0]}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={s.anchaNom}>{elAsistente()}</Text>
            <Text style={s.anchaSub}>{t('inicio.asistente.sub')}</Text>
          </View>
          <Text style={s.flecha}>›</Text>
        </Pressable>
      </Entra>

      <Pressable onPress={salir} style={s.salir}><Text style={s.salirTxt}>{t('inicio.salir')}</Text></Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  todo: { flex: 1 },
  dentro: { padding: 18, paddingTop: 12, paddingBottom: 28 },
  cab: { flexDirection: 'row', alignItems: 'flex-start' },
  hola: { color: C.txt2, fontSize: 24, fontWeight: '300' },
  holaNom: { color: C.txt, fontWeight: '500' },
  sub: { color: C.txt3, fontSize: 12.5, marginTop: 3 },
  idiomas: { flexDirection: 'row', gap: 12, paddingTop: 8 },
  idi: { color: C.txt3, fontSize: 11, fontWeight: '700' },
  idiOn: { color: C.gold },
  saldoCaja: { borderRadius: 20, borderWidth: 1, borderColor: C.line2, padding: 18, marginTop: 14, overflow: 'hidden' },
  brillo: { position: 'absolute', top: -60, right: -40, width: 190, height: 190, borderRadius: 95, backgroundColor: C.goldLt },
  saldoTxt: { color: C.txt, fontSize: 34, fontWeight: '200', letterSpacing: 0.5 },
  moneda: { fontSize: 15, color: C.gold, fontWeight: '600' },
  usd: { color: C.txt2, fontSize: 12.5, marginTop: 4 },
  sinRed: { color: C.txt3, fontSize: 14, fontStyle: 'italic' },
  abrirFila: { marginTop: 12, alignSelf: 'flex-start' },
  abrirTxt: { color: C.goldLt, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  malla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  celda: { width: '47%', flexGrow: 1 },
  ficha: { height: 106, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line2, overflow: 'hidden' },
  logo: { width: '64%', height: '64%' },
  sello: { position: 'absolute', top: 8, right: 8, backgroundColor: C.gold, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  selloTxt: { color: C.darkText, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  nom: { color: C.txt, fontSize: 13.5, fontWeight: '600', marginTop: 8 },
  nomSub: { color: C.txt3, fontSize: 11 },
  ancha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 14, marginBottom: 10 },
  icono: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(62,217,160,0.12)' },
  iconoTxt: { fontSize: 17 },
  puntoVivo: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.up },
  anchaNom: { color: C.txt, fontSize: 14.5, fontWeight: '600' },
  anchaSub: { color: C.txt3, fontSize: 11.5 },
  flecha: { color: C.gold, fontSize: 22, fontWeight: '300' },
  salir: { marginTop: 16, alignSelf: 'center' },
  salirTxt: { color: C.txt3, fontSize: 12 },
});
