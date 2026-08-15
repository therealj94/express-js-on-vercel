import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Animated, StyleSheet } from 'react-native';
import { PantallaConTeclado, CuerpoDesplazable, useCampoAuto } from '../og/Teclado';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt, parseAmt, normalizeAmtInput, tokensFromBalances } from '../data';
import { cardApi, depositApi } from '../api';
import { useT } from '../i18n';
import PedirClave from '../PedirClave';

// ============================================================
// Recargar la tarjeta.
//
// El usuario piensa y paga en ORIGEN. Por debajo, el treasury libera el
// equivalente en USDT a la wallet de la tarjeta — ese es el mecanismo del
// emisor y no tiene por qué aparecer en pantalla. Lo único que se muestra del
// dólar es la referencia de cuánto vale lo que está cargando.
//
// La operación son dos transferencias en cadenas distintas, así que puede
// quedar a medias: el backend responde 'pending' mientras confirma el pago y
// solo libera el USDT cuando está confirmado. Esta pantalla refleja ese
// avance en vez de mentir con un "listo" prematuro.
// ============================================================

// Cada cuánto se pregunta por una recarga en curso.
const CADA_MS = 4000;
// Techo de espera antes de decirle al usuario que siga sin mirar la pantalla.
const ESPERA_MAX_MS = 3 * 60 * 1000;

export default function FundCard({ nav }) {
  // Se sube por encima del teclado al enfocarlo (ver src/og/Teclado.js).
  const campoMonto = useCampoAuto();
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();

  const [monto, setMonto] = useState('');
  const [pedir, setPedir] = useState(false);
  const [fondeo, setFondeo] = useState(null);     // respuesta del servidor
  const [esperando, setEsperando] = useState(false);
  const desde = useRef(0);

  const [comprado, setComprado] = useState(0);

  // Hay dos saldos de ORIGEN y no se suman.
  //
  // El comprado (depósitos de USDT) vive en el backend y se cobra con un
  // decremento; el de la billetera vive en la cadena 8532 y se cobra firmando
  // una transferencia. Una recarga sale entera de uno o del otro: mezclarlas
  // significa que si la segunda mitad falla hay que devolver la primera, y ese
  // camino tiene más formas de salir mal que de salir bien.
  //
  // Por eso el tope es el MAYOR de los dos, no la suma.
  const origen = tokensFromBalances(account?.balances || []).find((x) => x.s === 'ORIGEN');
  const enCadena = origen?.qty || 0;
  const saldo = Math.max(enCadena, comprado);
  const precio = origen?.hasPrice ? origen.price : 0;
  const cantidad = parseAmt(monto);
  const equivalente = cantidad * precio;
  const suficiente = cantidad > 0 && cantidad <= saldo;

  useEffect(() => {
    let vivo = true;
    depositApi.balance()
      .then((d) => { if (vivo) setComprado(d?.origen || 0); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Al entrar se comprueba si quedó una recarga a medias de otra sesión.
  useEffect(() => {
    let vivo = true;
    cardApi.fundStatus()
      .then((d) => {
        if (!vivo) return;
        if (d && (d.status === 'pending' || d.status === 'debited')) {
          setFondeo(d);
          setEsperando(true);
          desde.current = Date.now();
        }
      })
      .catch(() => {});   // 404 = nunca recargó; es lo normal
    return () => { vivo = false; };
  }, []);

  // Mientras hay algo en curso se consulta hasta que cierre.
  useEffect(() => {
    if (!esperando) return;
    let vivo = true;
    const id = setInterval(async () => {
      if (!vivo) return;
      if (Date.now() - desde.current > ESPERA_MAX_MS) {
        setEsperando(false);
        toast(t('fund.tarda'), 'info');
        return;
      }
      try {
        const d = await cardApi.fundStatus();
        if (!vivo) return;
        setFondeo(d);
        if (d?.status === 'funded') {
          setEsperando(false);
          hap();
          toast(t('fund.listo'), 'success');
        } else if (d?.status === 'failed') {
          setEsperando(false);
          toast(d?.error || t('fund.fallo'), 'error');
        }
      } catch (e) {}
    }, CADA_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [esperando, t, toast]);

  const autorizar = async (password) => {
    try {
      const d = await cardApi.fund({ amountOrigen: cantidad, password });
      setFondeo(d);
      setPedir(false);
      if (d?.status === 'funded') {
        hap();
        toast(t('fund.listo'), 'success');
      } else {
        // 'pending' o 'debited': el pago salió y falta confirmar.
        setEsperando(true);
        desde.current = Date.now();
      }
      return { ok: true };
    } catch (e) {
      if (e?.status === 401) return { ok: false, msg: t('card.badPw') };
      // Ya hay una recarga abierta: se pasa a seguirla en vez de fallar.
      if (e?.status === 409) {
        setPedir(false);
        setEsperando(true);
        desde.current = Date.now();
        toast(t('fund.yaHay'), 'info');
        return { ok: true };
      }
      setPedir(false);
      toast(e?.message || t('card.errGeneric'), 'error');
      return { ok: true };
    }
  };

  const continuar = () => {
    if (!(cantidad > 0)) { toast(t('fund.errMonto'), 'error'); return; }
    if (!precio) { toast(t('fund.errPrecio'), 'error'); return; }
    if (!suficiente) { toast(t('fund.errSaldo'), 'error'); return; }
    hap();
    setPedir(true);
  };

  // Con algo en curso, la pantalla pasa a mostrar el avance.
  if (fondeo && (esperando || fondeo.status === 'funded')) {
    return (
      <View style={{ flex: 1, paddingTop: 6 }}>
        <Header title={t('fund.title')} onBack={() => nav.back()} />
        <Progreso fondeo={fondeo} esperando={esperando} t={t} nav={nav} />
      </View>
    );
  }

  return (
    // Cabecera fija y cuerpo desplazable: al enfocar un campo la pantalla
    // lo sube por encima del teclado (ver src/og/Teclado.js).
    <PantallaConTeclado desplaza={false} style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('fund.title')} onBack={() => nav.back()} />
      <CuerpoDesplazable contentContainerStyle={{ padding: 22, paddingBottom: 60 }}>

        <Text style={st.intro}>{t('fund.intro')}</Text>

        <View style={st.montoCaja}>
          <Text style={st.montoK}>{t('fund.cuanto')}</Text>
          <View style={st.montoFila}>
            <TextInput
              value={monto}
              onChangeText={(v) => setMonto(normalizeAmtInput(v))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#3a5c58"
              style={st.montoIn}
              accessibilityLabel={t('fund.cuanto')}
              ref={campoMonto.ref}
              onFocus={campoMonto.onFocus}
            />
            <Text style={st.montoSym}>ORIGEN</Text>
          </View>
          {/* El dólar es referencia, no la unidad: va debajo y más chico. */}
          <Text style={st.equiv}>
            {precio ? `≈ ${money(equivalente)} USD` : t('fund.sinPrecio')}
          </Text>
        </View>

        <View style={st.saldoFila}>
          <Text style={st.saldoK}>{t('fund.disponible')}</Text>
          <Pressable onPress={() => { hap(); setMonto(String(Math.floor(saldo * 1e6) / 1e6)); }}>
            <Text style={st.saldoV}>{qtyFmt(saldo)} ORIGEN</Text>
          </Pressable>
        </View>
        {comprado > 0 && enCadena > 0 && (
          <Text style={st.fuentes}>
            {t('fund.fuentes', { c: qtyFmt(comprado), b: qtyFmt(enCadena) })}
          </Text>
        )}
        {cantidad > 0 && !suficiente && <Text style={st.err}>{t('fund.errSaldo')}</Text>}

        <View style={st.nota}>
          <Icon name="information-circle" size={17} color={C.gold} />
          <Text style={st.notaTxt}>{t('fund.comoP')}</Text>
        </View>

        <View style={{ height: 18 }} />
        <Button3D title={t('fund.cta')} disabled={!(cantidad > 0) || !suficiente || !precio} onPress={continuar} />
      </CuerpoDesplazable>

      <PedirClave
        visible={pedir}
        titulo={t('fund.pwTitulo')}
        subtitulo={t('fund.pwSub', { q: `${qtyFmt(cantidad)} ORIGEN` })}
        ctaTexto={t('fund.cta')}
        onCancel={() => setPedir(false)}
        onSubmit={autorizar}
      />
    </PantallaConTeclado>
  );
}

// ---------- avance de la recarga ----------
function Progreso({ fondeo, esperando, t, nav }) {
  const listo = fondeo.status === 'funded';
  const pasos = [
    { k: 'fund.paso1', hecho: true },                                        // pago emitido
    { k: 'fund.paso2', hecho: fondeo.status === 'debited' || listo },        // pago confirmado
    { k: 'fund.paso3', hecho: listo },                                       // saldo acreditado
  ];

  const pulso = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (listo) { pulso.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 0.4, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [listo, pulso]);

  return (
    <ScrollView contentContainerStyle={{ padding: 22 }}>
      <View style={st.progCirculo}>
        {listo
          ? <Icon name="checkmark-circle" size={52} color={C.up} />
          : <Animated.View style={{ opacity: pulso }}><ActivityIndicator size="large" color={C.gold} /></Animated.View>}
      </View>

      <Text style={st.progT}>{listo ? t('fund.listoT') : t('fund.enCursoT')}</Text>
      <Text style={st.progMonto}>{qtyFmt(fondeo.origenAmount)} ORIGEN</Text>
      {fondeo.usdValue != null && (
        <Text style={st.progEquiv}>≈ {money(fondeo.usdValue)} USD</Text>
      )}

      <View style={st.pasos}>
        {pasos.map((p, i) => (
          <View key={p.k} style={[st.paso, i > 0 && st.pasoLinea]}>
            <Icon
              name={p.hecho ? 'checkmark-circle' : 'time'}
              size={19}
              color={p.hecho ? C.up : C.txt3}
            />
            <Text style={[st.pasoTxt, p.hecho && { color: C.txt }]}>{t(p.k)}</Text>
          </View>
        ))}
      </View>

      {!listo && esperando && <Text style={st.progNota}>{t('fund.puedesSalir')}</Text>}
      {!!fondeo.error && <Text style={st.err}>{fondeo.error}</Text>}

      <View style={{ height: 20 }} />
      <Button3D title={listo ? t('fund.verTarjeta') : t('fund.volver')} onPress={() => { hap(); nav.go('card'); }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  intro: { color: C.txt2, fontSize: 13.5, lineHeight: 20, marginBottom: 20 },
  montoCaja: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 18 },
  montoK: { color: C.txt3, fontSize: 10.5, letterSpacing: 1.4, fontWeight: '700' },
  montoFila: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 10 },
  montoIn: { flex: 1, color: C.txt, fontSize: 38, fontWeight: '800', padding: 0 },
  montoSym: { color: C.gold, fontSize: 15, fontWeight: '700' },
  equiv: { color: C.txt3, fontSize: 13, marginTop: 8 },

  saldoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  saldoK: { color: C.txt3, fontSize: 12.5 },
  saldoV: { color: C.gold, fontSize: 13.5, fontWeight: '700' },
  fuentes: { color: C.txt3, fontSize: 11.5, marginTop: 8, lineHeight: 16 },
  err: { color: C.down, fontSize: 12.5, marginTop: 10, textAlign: 'center' },

  nota: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: C.panel2, borderRadius: 14, padding: 14, marginTop: 20 },
  notaTxt: { flex: 1, color: C.txt3, fontSize: 12.5, lineHeight: 18 },

  progCirculo: {
    width: 108, height: 108, borderRadius: 36, alignSelf: 'center',
    backgroundColor: 'rgba(201,169,97,0.10)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)',
    alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 20,
  },
  progT: { color: C.txt, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  progMonto: { color: C.gold, fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  progEquiv: { color: C.txt3, fontSize: 13, textAlign: 'center', marginTop: 4 },

  pasos: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, paddingHorizontal: 16, marginTop: 24 },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  pasoLinea: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  pasoTxt: { flex: 1, color: C.txt3, fontSize: 13.5 },
  progNota: { color: C.txt3, fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 17 },
});
