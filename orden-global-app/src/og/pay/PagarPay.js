// PagarPay — el lado del cliente: apunta la cámara al QR del comercio y paga.
//
// Port de `(tabs)/pagar.tsx` de mytokenpay-app a este contenedor. Se conserva
// su orden —saldo arriba, las dos maneras de pagar, los pagos recientes— y
// sus textos. Lo que cambia, y es lo importante:
//
//   · Allí el escáner era DE MENTIRA: un rectángulo animado que a los 2,8 s
//     elegía un comercio al azar del catálogo. Aquí se abre la cámara de
//     verdad (expo-camera CameraView, igual que src/screens/Scan.js) y se lee
//     el QR que el comercio tiene en pantalla.
//   · Allí el pago se descontaba de un saldo en memoria. Aquí NADA se
//     transmite desde esta pantalla: el QR se traduce a og://wallet/enviar y
//     se abre ENVIAR ya preparado por el MAPA (src/og/rutas.js). La persona
//     firma. Esa es la regla de la casa y no se negocia.
//   · "Transferir" (elegir comercio de una lista y mandarle ORIGEN) no puede
//     portarse tal cual: los comercios del directorio son de ejemplo y no
//     tienen dirección en la cadena. En su lugar abre ENVIAR en blanco, donde
//     el destinatario sale de la libreta — nunca inventado.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Animated, Linking, BackHandler, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../../theme';
import { Header, Button3D, useAccount, useToast, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import { qtyFmt, money } from '../../data';
import { parseAddress, listContacts, nameFor } from '../../addressBook';
import { deUri, abrir } from '../rutas';

const TXT = {
  es: {
    titulo: 'Pagar', sub: 'MyTokenPay · paga con ORIGEN',
    saldo: 'ORIGEN disponibles para pagar', enBilletera: 'En tu billetera Orden Global',
    escanear: 'Escanear QR', escanearHint: 'Escanea el código del comercio y paga al instante',
    transferir: 'Transferir', transferirHint: 'Elige a quién le pagas desde tu libreta y envía ORIGEN',
    apunta: 'Apunta al QR de cobro del comercio',
    cancelar: 'Cancelar', encender: 'Luz',
    recientes: 'Pagos recientes',
    sinRecientes: 'Todavía no has pagado a nadie desde esta cuenta. Cuando pagues un QR, el movimiento aparece aquí.',
    permT: 'La cámara está apagada',
    permP: 'Para leer el QR del comercio esta pantalla necesita ver por la cámara. No se guarda ninguna imagen: solo se lee el código y se cierra.',
    permBtn: 'PERMITIR LA CÁMARA',
    permNoT: 'Diste "no" a la cámara',
    permNoP: 'Android no volverá a preguntar desde la app. Ábrele el permiso de cámara a Orden Global en los ajustes del teléfono y vuelve aquí.',
    permNoBtn: 'ABRIR AJUSTES DEL TELÉFONO',
    leido: 'Cobro leído: revisa y firma',
    noCobro: 'Ese código es de Orden Global pero no es un cobro.',
    noNada: 'Ese código no trae ni un cobro ni una dirección de Orden Global.',
    viejo: 'Ese QR es de la MyTokenPay antigua: lleva la factura pero no la dirección del comercio, así que no se puede pagar en la cadena. Pídele que genere el cobro desde esta app.',
    para: 'Para',
  },
  en: {
    titulo: 'Pay', sub: 'MyTokenPay · pay with ORIGEN',
    saldo: 'ORIGEN available to pay', enBilletera: 'In your Orden Global wallet',
    escanear: 'Scan QR', escanearHint: 'Scan the merchant code and pay instantly',
    transferir: 'Transfer', transferirHint: 'Pick who you are paying from your address book and send ORIGEN',
    apunta: 'Point at the merchant charge QR',
    cancelar: 'Cancel', encender: 'Light',
    recientes: 'Recent payments',
    sinRecientes: 'You have not paid anyone from this account yet. Once you pay a QR, the movement shows up here.',
    permT: 'The camera is off',
    permP: 'To read the merchant QR this screen needs to see through the camera. No image is stored: the code is read and it closes.',
    permBtn: 'ALLOW THE CAMERA',
    permNoT: 'You said no to the camera',
    permNoP: 'Android will not ask again from inside the app. Grant camera permission to Orden Global in the phone settings and come back.',
    permNoBtn: 'OPEN PHONE SETTINGS',
    leido: 'Charge read: review and sign',
    noCobro: 'That code is from Orden Global but it is not a charge.',
    noNada: 'That code carries neither a charge nor an Orden Global address.',
    viejo: 'That QR is from the old MyTokenPay: it carries the invoice but not the merchant address, so it cannot be paid on chain. Ask them to generate the charge from this app.',
    para: 'To',
  },
};

// Mismo criterio EXACTO que la Actividad de la billetera (src/screens/More.js):
// lo entrante se reconoce por lista —'recive' es el literal histórico del
// backend, con su errata— y saliente es todo lo demás. Enumerar los literales
// de salida en vez de negar la entrada dejaría fuera cualquier tipo nuevo que
// mande el backend, y un pago desaparecido de la lista se lee como un pago que
// no ocurrió.
const esEntrante = (x) => x.type === 'recive' || x.type === 'receive' || x.type === 'in';
const esSaliente = (x) => !esEntrante(x);
const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

// Entrada en cascada; opacity/transform ⇒ useNativeDriver, para no robarle
// hilo de JS a la cámara mientras arranca.
function Entrada({ delay = 0, style, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, speed: 12, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [op, y, delay]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

// La línea que barre el marco: es la única señal de que la cámara está viva
// cuando el encuadre es oscuro. Loop infinito sobre translateY ⇒ nativo.
function Barrido({ alto }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(y, { toValue: 1, duration: 1500, useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [y]);
  const mueve = y.interpolate({ inputRange: [0, 1], outputRange: [8, alto - 8] });
  return (
    <Animated.View style={[st.barrido, { transform: [{ translateY: mueve }] }]} pointerEvents="none">
      <LinearGradient colors={['transparent', C.gold, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

export default function PagarPay({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const toast = useToast();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [camara, setCamara] = useState(false);
  const [luz, setLuz] = useState(false);
  const [contactos, setContactos] = useState([]);
  const leido = useRef(false);   // un QR se procesa UNA vez: el lector dispara en ráfaga
  const avisado = useRef(0);     // reloj del último aviso, para no repetirlo en bucle

  useEffect(() => {
    if (account?.email) listContacts(account.email).then(setContactos).catch(() => {});
  }, [account?.email]);
  const etiqueta = (addr) => nameFor(contactos, addr) || shortAddr(addr);

  // Saldo y precio salen del portafolio real. Sin precio no se pinta un
  // equivalente en dólares: mejor sin cifra que con una congelada.
  const origen = useMemo(
    () => (account?.balances || []).find((x) => (x.symbol || '').toUpperCase() === 'ORIGEN') || null,
    [account?.balances],
  );
  const saldo = Number(origen?.qty) || 0;
  const precio = origen && origen.priceUsd != null && Number(origen.priceUsd) > 0 ? Number(origen.priceUsd) : null;

  const salientes = useMemo(() => (account?.transfers || [])
    .filter(esSaliente)
    .slice()
    .sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0))
    .slice(0, 6), [account?.transfers]);

  const fmtCuando = (ts) => {
    const d = new Date((Number(ts) || 0) * 1000);
    const loc = lang === 'en' ? 'en-US' : 'es-HN';
    return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' })
      + ' · ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  };

  const cerrarCamara = useCallback(() => { setCamara(false); setLuz(false); leido.current = false; }, []);

  // La cámara es una etapa DENTRO de esta pantalla, no una ruta: el botón
  // físico de Android tiene que apagarla antes de salir de Pagar. Se registra
  // solo mientras está abierta, y el listener más reciente gana al de App.js.
  useEffect(() => {
    if (Platform.OS !== 'android' || !camara) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { cerrarCamara(); return true; });
    return () => sub.remove();
  }, [camara, cerrarCamara]);

  async function abrirCamara() {
    hap();
    leido.current = false;
    if (!permiso?.granted && permiso?.canAskAgain !== false) await pedirPermiso();
    setCamara(true);
  }

  // Lo que se hace con lo leído. Tres casos y ninguno adivina:
  //   og://wallet/enviar → se abre por el MAPA, que lo traduce a ENVIAR con
  //     to y amount ya puestos (la única puerta al router, por PLAN-V3).
  //   0x… a secas → ENVIAR con el destinatario puesto y el monto en blanco.
  //   cualquier otra cosa → se dice qué era y no se navega a ningún lado.
  function alEscanear({ data }) {
    if (leido.current) return;
    const txt = String(data || '').trim();
    if (!txt) return;

    const r = deUri(txt);
    if (r) {
      if (r.ruta !== 'wallet/enviar') { leido.current = true; hap(); cerrarCamara(); toast(t.noCobro); return; }
      leido.current = true; hap();
      cerrarCamara();
      toast(t.leido);
      abrir(txt, nav);
      return;
    }

    // og:// que el MAPA no reconoce (ruta vieja o inventada): es de la casa,
    // pero no es un cobro. Se dice eso mismo, que es lo que pasó.
    if (/^og:\/\//i.test(txt)) { leido.current = true; cerrarCamara(); toast(t.noCobro); return; }

    // El QR de la MyTokenPay vieja (mtp:cobro?c=…&inv=…&a=…) trae factura
    // pero NO dirección: no hay a quién pagarle. Se explica en vez de fallar.
    if (/^mtp:/i.test(txt)) { leido.current = true; cerrarCamara(); toast(t.viejo); return; }

    const addr = parseAddress(txt);
    if (addr) {
      leido.current = true; hap();
      cerrarCamara();
      nav.go('send', { to: addr });
      return;
    }

    // Un código ilegible NO cierra la cámara: quien apunta mal quiere seguir
    // intentando. Pero el lector dispara en ráfaga (decenas por segundo), así
    // que el aviso se limita a uno cada dos segundos o la pantalla se llena.
    if (Date.now() - avisado.current > 2000) { avisado.current = Date.now(); toast(t.noNada); }
  }

  // ── la cámara, a pantalla completa dentro de la propia pantalla ────────
  if (camara) {
    const puedeVer = !!permiso?.granted;
    return (
      <View style={st.screen}>
        <Header
          title={t.escanear} onBack={cerrarCamara}
          right={puedeVer ? (
            <Pressable onPress={() => { hap(); setLuz((v) => !v); }} style={st.luz}
              accessibilityRole="button" accessibilityLabel={t.encender}>
              <Icon name={luz ? 'flashlight' : 'flashlight-outline'} size={19} color={luz ? C.gold : C.txt2} />
            </Pressable>
          ) : null}
        />
        {puedeVer ? (
          <View style={st.camWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={luz}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={alEscanear}
            />
            <View style={st.overlay} pointerEvents="none">
              <View style={st.marco}>
                <View style={[st.esquina, st.eTL]} />
                <View style={[st.esquina, st.eTR]} />
                <View style={[st.esquina, st.eBL]} />
                <View style={[st.esquina, st.eBR]} />
                <Barrido alto={230} />
              </View>
              <Text style={st.pista}>{t.apunta}</Text>
            </View>
          </View>
        ) : (
          // Estado vacío honesto: se distingue "aún no lo has dado" de "ya
          // dijiste que no", porque la salida es distinta en cada caso.
          <View style={st.vacioCentro}>
            <View style={st.vacioIc}><Icon name="qr-code" size={32} color={C.gold} /></View>
            <Text style={st.vacioT}>{permiso?.canAskAgain === false ? t.permNoT : t.permT}</Text>
            <Text style={st.vacioP}>{permiso?.canAskAgain === false ? t.permNoP : t.permP}</Text>
            <Button3D
              title={permiso?.canAskAgain === false ? t.permNoBtn : t.permBtn}
              icon="qr-code"
              onPress={() => {
                if (permiso?.canAskAgain === false) Linking.openSettings().catch(() => {});
                else pedirPermiso();
              }}
              style={{ alignSelf: 'stretch', marginTop: 20 }}
            />
            <Pressable onPress={cerrarCamara} style={st.enlace}>
              <Text style={[st.enlaceTxt, { color: C.txt2 }]}>{t.cancelar}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // ── portada: saldo, las dos maneras de pagar y lo que ya pagaste ───────
  return (
    <View style={st.screen}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <ScrollView contentContainerStyle={st.dentro} showsVerticalScrollIndicator={false}>

        <Entrada delay={0}>
          <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.saldoCard}>
            <View style={st.saldoTop}>
              <View style={st.pastilla}>
                <Icon name="wallet" size={12} color={C.gold} />
                <Text style={st.pastillaTxt}>{t.enBilletera}</Text>
              </View>
              {precio != null ? <Text style={st.saldoUsd}>{money(saldo * precio)}</Text> : null}
            </View>
            <Text style={st.saldoNum}>{qtyFmt(saldo)}</Text>
            <Text style={st.saldoLbl}>{t.saldo}</Text>
          </LinearGradient>
        </Entrada>

        <Entrada delay={90}>
          <View style={st.modos}>
            <Pressable onPress={abrirCamara} style={st.modo}
              accessibilityRole="button" accessibilityLabel={t.escanear}>
              <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.modoIc}>
                <Icon name="qr-code" size={21} color={C.darkText} />
              </LinearGradient>
              <Text style={st.modoT}>{t.escanear}</Text>
              <Text style={st.modoH}>{t.escanearHint}</Text>
            </Pressable>

            <Pressable onPress={() => { hap(); nav.go('send'); }} style={st.modo}
              accessibilityRole="button" accessibilityLabel={t.transferir}>
              <View style={[st.modoIc, { backgroundColor: C.panel3 }]}>
                <Icon name="paper-plane" size={21} color={C.gold} />
              </View>
              <Text style={st.modoT}>{t.transferir}</Text>
              <Text style={st.modoH}>{t.transferirHint}</Text>
            </Pressable>
          </View>
        </Entrada>

        <Entrada delay={180}>
          <Text style={st.grupo}>{t.recientes.toUpperCase()}</Text>
          {salientes.length === 0 ? (
            <View style={st.vacio}>
              <View style={st.vacioIcChico}><Icon name="cash" size={24} color={C.txt3} /></View>
              <Text style={st.vacioTxt}>{t.sinRecientes}</Text>
            </View>
          ) : (
            salientes.map((x, i) => (
              <View key={x.hash || i} style={st.pago}>
                <View style={st.pagoIc}><Icon name="arrow-up" size={17} color={C.gold} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.pagoA} numberOfLines={1}>{t.para}: {etiqueta(x.to)}</Text>
                  <Text style={st.pagoCuando}>{fmtCuando(x.timeStamp)}</Text>
                </View>
                <Text style={st.pagoMonto}>-{qtyFmt(Number(x.value) || 0)} {x.symbol || 'ORIGEN'}</Text>
              </View>
            ))
          )}
        </Entrada>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },

  saldoCard: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line },
  saldoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pastilla: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  pastillaTxt: { color: C.goldLt, fontSize: 10, fontWeight: '700' },
  saldoUsd: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  saldoNum: { color: C.txt, fontSize: 36, fontWeight: '200', marginTop: 12, fontVariant: ['tabular-nums'] },
  saldoLbl: { color: C.txt2, fontSize: 12, marginTop: 2 },

  modos: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modo: {
    flex: 1, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2,
    borderRadius: 18, padding: 14, gap: 8,
  },
  modoIc: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modoT: { color: C.txt, fontSize: 14.5, fontWeight: '700', marginTop: 2 },
  modoH: { color: C.txt3, fontSize: 11, lineHeight: 16 },

  grupo: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginTop: 26, marginBottom: 11 },
  pago: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginBottom: 9,
  },
  pagoIc: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  pagoA: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  pagoCuando: { color: C.txt3, fontSize: 11, marginTop: 2 },
  pagoMonto: { color: C.txt, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },

  vacio: {
    alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2,
    borderRadius: 18, padding: 22,
  },
  vacioIcChico: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: C.panel2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  vacioTxt: { color: C.txt3, fontSize: 12.5, lineHeight: 19, textAlign: 'center' },

  luz: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  camWrap: { flex: 1, margin: 22, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  marco: { width: 230, height: 230 },
  esquina: { position: 'absolute', width: 40, height: 40, borderColor: C.gold },
  eTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  eTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
  eBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
  eBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
  barrido: { position: 'absolute', left: 10, right: 10, height: 3, borderRadius: 2 },
  pista: {
    color: '#fff', fontSize: 13, marginTop: 26, textAlign: 'center', paddingHorizontal: 30,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8,
  },

  vacioCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  vacioIc: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: 'rgba(201,169,97,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  vacioT: { color: C.txt, fontWeight: '800', fontSize: 18, textAlign: 'center' },
  vacioP: { color: C.txt2, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center', paddingVertical: 14 },
  enlaceTxt: { color: C.gold, fontSize: 13, fontWeight: '600' },
});
