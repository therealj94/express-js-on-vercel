// El reporte de la wallet: lo que José pidió poder ordenar con la voz
// («hazme un reporte de mi veta wallet»). Una sola pantalla que cuenta claro
// tres cosas de la cuenta viva (useAccount): el saldo por token, los últimos
// cinco movimientos y el estado del Genesis ID. Y un botón LÉEMELO que lo
// narra con la voz del asistente — el reporte se puede OÍR sin mirar la
// pantalla, que es la mitad del pedido.
// Datos: solo los reales de account.balances / account.transfers. Si algo no
// está (precio caído, cuenta nueva), se dice — nunca se rellena.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { Header, useAccount, hap } from '../ui';
import { useLang } from '../i18n';
import { tokensFromBalances, money, qtyFmt } from '../data';
import { decir, callar } from '../voz';

const TXT = {
  es: {
    titulo: 'Reporte', sub: 'Tu billetera, contada claro',
    saldo: 'SALDO', movs: 'ÚLTIMOS 5 MOVIMIENTOS', gid: 'GENESIS ID',
    total: 'Valor total estimado', sinPrecio: 'Algún precio no está disponible: el total no lo incluye.',
    sinSaldo: 'Sin saldos todavía. Cuando recibas tokens, aparecen aquí.',
    sinMovs: 'Sin movimientos todavía.',
    entro: 'Recibido', salio: 'Enviado',
    gidOk: 'Verificado', gidNo: 'Sin vincular',
    gidOkSub: 'Tu identidad vale en todo el ecosistema.',
    gidNoSub: 'Verifícate una vez y vale en todo el ecosistema.',
    gidIr: 'COMPLETAR MI GENESIS ID',
    leeme: 'LÉEMELO', callar: 'CALLAR',
    vIntro: 'Este es el reporte de tu billetera.',
    vTotal: (n) => `Tienes un valor total aproximado de ${n} dólares.`,
    vSinSaldo: 'Todavía no tienes saldo en ningún token.',
    vTokens: (l) => 'Tus saldos: ' + l + '.',
    vSinMovs: 'Todavía no hay movimientos.',
    vMovs: (n, e, s) => `De tus últimos ${n} movimientos, ${e} fueron recibidos y ${s} enviados.`,
    vUltimo: (dir, q, sym) => `El más reciente: ${dir === 'in' ? 'recibiste' : 'enviaste'} ${q} ${sym}.`,
    vGidOk: 'Tu Genesis ID está verificado.',
    vGidNo: 'Aún no vinculas tu Genesis ID.',
  },
  en: {
    titulo: 'Report', sub: 'Your wallet, told straight',
    saldo: 'BALANCE', movs: 'LAST 5 MOVEMENTS', gid: 'GENESIS ID',
    total: 'Estimated total value', sinPrecio: 'Some price is unavailable: the total does not include it.',
    sinSaldo: 'No balances yet. When you receive tokens, they show up here.',
    sinMovs: 'No movements yet.',
    entro: 'Received', salio: 'Sent',
    gidOk: 'Verified', gidNo: 'Not linked',
    gidOkSub: 'Your identity is valid across the ecosystem.',
    gidNoSub: 'Verify once and it is valid across the ecosystem.',
    gidIr: 'COMPLETE MY GENESIS ID',
    leeme: 'READ IT TO ME', callar: 'STOP',
    vIntro: 'This is your wallet report.',
    vTotal: (n) => `Your total value is about ${n} dollars.`,
    vSinSaldo: 'You have no token balance yet.',
    vTokens: (l) => 'Your balances: ' + l + '.',
    vSinMovs: 'There are no movements yet.',
    vMovs: (n, e, s) => `Of your last ${n} movements, ${e} came in and ${s} went out.`,
    vUltimo: (dir, q, sym) => `The most recent: you ${dir === 'in' ? 'received' : 'sent'} ${q} ${sym}.`,
    vGidOk: 'Your Genesis ID is verified.',
    vGidNo: 'You have not linked your Genesis ID yet.',
  },
};

// la misma convención del resto de la app: el backend escribe 'recive'
const esEntrada = (x) => x.type === 'recive' || x.type === 'receive' || x.type === 'in';

const fecha = (ts, lang) => {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);   // timeStamp viaja en SEGUNDOS
  const loc = lang === 'en' ? 'en-US' : 'es-HN';
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + ' · ' +
    d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
};

export default function ReporteOG({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const [leyendo, setLeyendo] = useState(false);
  const reloj = useRef(null);

  // si la persona sale de la pantalla, la voz no se queda hablando sola
  useEffect(() => () => { callar(); if (reloj.current) clearTimeout(reloj.current); }, []);

  const tokens = tokensFromBalances(account?.balances || []);
  const conSaldo = tokens.filter((x) => x.qty > 0);
  const total = tokens.reduce((a, x) => a + (x.hasPrice ? x.qty * x.price : 0), 0);
  const faltaPrecio = tokens.some((x) => x.qty > 0 && !x.hasPrice);
  const movs = [...(account?.transfers || [])]
    .sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0))
    .slice(0, 5);

  // ── la narración: se arma con los MISMOS datos que pinta la pantalla ──
  const narracion = () => {
    const p = [t.vIntro];
    if (conSaldo.length === 0) p.push(t.vSinSaldo);
    else {
      if (total > 0) p.push(t.vTotal(total.toFixed(2)));
      p.push(t.vTokens(conSaldo.map((x) => `${qtyFmt(x.qty)} ${x.s}`).join(', ')));
    }
    if (movs.length === 0) p.push(t.vSinMovs);
    else {
      const entradas = movs.filter(esEntrada).length;
      p.push(t.vMovs(movs.length, entradas, movs.length - entradas));
      const u = movs[0];
      p.push(t.vUltimo(esEntrada(u) ? 'in' : 'out', qtyFmt(Number(u.value) || 0), u.symbol || 'ORIGEN'));
    }
    p.push(account?.genesisUid ? t.vGidOk : t.vGidNo);
    return p.join(' ');
  };

  const leer = () => {
    hap();
    if (leyendo) { callar(); setLeyendo(false); if (reloj.current) clearTimeout(reloj.current); return; }
    const texto = narracion();
    decir(texto, lang);
    setLeyendo(true);
    // decir() no avisa cuándo termina; se estima por longitud para que el
    // botón vuelva solo a LÉEMELO (~80 ms por carácter al ritmo 0.92)
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setLeyendo(false), texto.length * 80);
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <ScrollView contentContainerStyle={st.dentro} showsVerticalScrollIndicator={false}>

        {/* ── saldo ── */}
        <Text style={st.kicker}>{t.saldo}</Text>
        <View style={st.tarjeta}>
          <Text style={st.totalLbl}>{t.total}</Text>
          <Text style={st.total}>{total > 0 ? money(total) : '—'}</Text>
          {faltaPrecio && <Text style={st.nota}>{t.sinPrecio}</Text>}
          {conSaldo.length === 0 ? (
            <Text style={st.vacio}>{t.sinSaldo}</Text>
          ) : conSaldo.map((x) => (
            <View key={x.s} style={st.fila}>
              <Text style={st.sym}>{x.s}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={st.qty}>{qtyFmt(x.qty)}</Text>
                <Text style={st.usd}>{x.hasPrice ? money(x.qty * x.price) : '—'}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── últimos 5 movimientos ── */}
        <Text style={st.kicker}>{t.movs}</Text>
        <View style={st.tarjeta}>
          {movs.length === 0 ? (
            <Text style={st.vacio}>{t.sinMovs}</Text>
          ) : movs.map((x, i) => {
            const dentro = esEntrada(x);
            return (
              <View key={x.hash || i} style={[st.fila, i === 0 && { borderTopWidth: 0 }]}>
                <View style={[st.punto, { backgroundColor: dentro ? 'rgba(62,217,160,0.16)' : 'rgba(201,169,97,0.16)' }]}>
                  <Text style={{ color: dentro ? C.up : C.gold, fontSize: 15, fontWeight: '800' }}>{dentro ? '↓' : '↑'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.movT}>{dentro ? t.entro : t.salio} {x.symbol || 'ORIGEN'}</Text>
                  <Text style={st.movF}>{fecha(x.timeStamp, lang)}</Text>
                </View>
                <Text style={[st.movV, dentro && { color: C.up }]}>
                  {dentro ? '+' : '-'}{qtyFmt(Number(x.value) || 0)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── genesis id ── */}
        <Text style={st.kicker}>{t.gid}</Text>
        <View style={st.tarjeta}>
          <View style={[st.fila, { borderTopWidth: 0 }]}>
            <View style={[st.punto, { backgroundColor: account?.genesisUid ? 'rgba(62,217,160,0.16)' : 'rgba(110,147,143,0.16)' }]}>
              <Text style={{ color: account?.genesisUid ? C.up : C.txt3, fontSize: 15, fontWeight: '800' }}>
                {account?.genesisUid ? '✓' : '·'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.movT}>{account?.genesisUid ? t.gidOk : t.gidNo}</Text>
              <Text style={st.movF}>{account?.genesisUid ? account.genesisUid : t.gidNoSub}</Text>
            </View>
          </View>
          {!account?.genesisUid && (
            <Pressable onPress={() => { hap(); nav.go('kyc'); }} style={st.gidBtn}>
              <Text style={st.gidBtnTxt}>{t.gidIr}</Text>
            </Pressable>
          )}
        </View>

        {/* ── léemelo ── */}
        <Pressable onPress={leer} style={{ marginTop: 20 }}>
          <LinearGradient colors={G.gold} style={st.leeme} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={st.leemeTxt}>{leyendo ? '■ ' + t.callar : '🔊 ' + t.leeme}</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },
  kicker: { color: C.txt3, fontSize: 10.5, fontWeight: '800', letterSpacing: 3, marginTop: 18, marginBottom: 8 },
  tarjeta: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  totalLbl: { color: C.txt3, fontSize: 11, marginTop: 8 },
  total: { color: C.txt, fontSize: 30, fontWeight: '800', marginTop: 2, marginBottom: 4 },
  nota: { color: C.txt3, fontSize: 11.5, marginBottom: 4, lineHeight: 16 },
  vacio: { color: C.txt3, fontSize: 13, lineHeight: 19, paddingVertical: 12 },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  sym: { color: C.txt, fontSize: 14.5, fontWeight: '700', flex: 1 },
  qty: { color: C.txt, fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  usd: { color: C.txt3, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  punto: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  movT: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  movF: { color: C.txt3, fontSize: 11, marginTop: 2 },
  movV: { color: C.gold, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  gidBtn: { borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginVertical: 10 },
  gidBtnTxt: { color: C.goldLt, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  leeme: { borderRadius: 15, paddingVertical: 15, alignItems: 'center' },
  leemeTxt: { color: '#3A2C08', fontWeight: '800', fontSize: 13, letterSpacing: 1.5 },
});
