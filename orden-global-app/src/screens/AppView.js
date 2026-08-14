// Una app del ecosistema, DENTRO de Orden Global, con su propio diseño: la
// versión web real (apps-web/) en un WebView. La frontera de seguridad es la
// del plan: nada que vea una clave privada vive aquí — la web de Veta Wallet
// firma en su propio contexto, igual que en el navegador.
//
// El candado: MyTokenPay (y quien lleve gid:true en el mapa) exige Genesis
// ID completo. Se pregunta al puente /genesis del backend; una falla de RED
// no bloquea a nadie — la que bloquea es la respuesta "no está completo".
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { useT } from '../i18n';
import { WEBS, genesisCompleto, inyeccionSesion } from '../api';
import { BotonOro, Tarjeta, Entra } from '../ui';

const URLDE = {
  veta: () => WEBS.veta,
  pay: () => WEBS.pay,
  gid: () => WEBS.genesis,
  scan: () => WEBS.scan,
  cerebroWeb: () => WEBS.cerebro,
};

export default function AppView({ vista, params, entrada, abrir, volver }) {
  const t = useT();
  const [puerta, setPuerta] = useState(entrada?.gid ? 'mirando' : 'abierta');
  const web = useRef(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    if (entrada?.gid) {
      genesisCompleto().then((g) => { if (vivo) setPuerta(g.completo ? 'abierta' : 'falta'); });
    }
    return () => { vivo = false; };
  }, [vista]);

  // El envío preparado: GENESIS no puede rellenar un formulario dentro de la
  // web de la wallet (y no debe intentarlo a ciegas), así que hace lo honesto:
  // copia la dirección al portapapeles y lo dice en pantalla. La persona pega
  // y firma — el asistente preparó, el dedo decide.
  const [nota, setNota] = useState(null);
  useEffect(() => {
    if (vista === 'veta' && params?.to) {
      Clipboard.setStringAsync(params.to).catch(() => {});
      setNota({ to: params.nombre || params.to, monto: params.monto });
    } else setNota(null);
  }, [vista, params?.to]);

  if (puerta === 'mirando') {
    return <View style={s.centro}><ActivityIndicator color={C.gold} /><Text style={s.espera}>{t('cargando')}</Text></View>;
  }
  if (puerta === 'falta') {
    return (
      <View style={s.centro}>
        <Entra>
          <Tarjeta style={{ margin: 22 }}>
            <Text style={s.gateTit}>{t('gate.titulo')}</Text>
            <Text style={s.gateTxt}>{t('gate.texto')}</Text>
            <BotonOro onPress={() => abrir('og://id/abrir')}>{t('gate.boton')}</BotonOro>
            <Pressable onPress={volver} style={{ marginTop: 12, alignSelf: 'center' }}>
              <Text style={{ color: C.txt3, fontSize: 12 }}>{t('gate.luego')}</Text>
            </Pressable>
          </Tarjeta>
        </Entra>
      </View>
    );
  }

  const url = (URLDE[vista] || URLDE.veta)();
  return (
    <View style={{ flex: 1, backgroundColor: C.negro }}>
      {nota && (
        <View style={s.nota}>
          <Text style={s.notaTxt}>
            {nota.monto ? `→ ${nota.monto} ORIGEN · ` : ''}{nota.to} — {t('chat.origenNota')}
          </Text>
        </View>
      )}
      {cargando && <View style={s.velo}><ActivityIndicator color={C.gold} size="large" /></View>}
      <WebView
        ref={web}
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: C.negro }}
        // La sesión de Orden Global entra ANTES de que la web cargue: al
        // abrirse Veta Wallet o MyTokenPay, ya estás dentro. Un solo login.
        injectedJavaScriptBeforeContentLoaded={inyeccionSesion(vista) || undefined}
        onLoadEnd={() => setCargando(false)}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        // Un enlace og:// dentro de la web vuelve al contenedor: las webs
        // pueden hablarle a la app con el mismo mapa que todo lo demás.
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.startsWith('og://')) { abrir(req.url); return false; }
          return true;
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center' },
  espera: { color: C.txt3, textAlign: 'center', marginTop: 10, fontSize: 12 },
  gateTit: { color: C.goldLt, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  gateTxt: { color: C.txt2, fontSize: 13.5, lineHeight: 20, marginBottom: 16 },
  nota: { backgroundColor: 'rgba(201,169,97,0.12)', borderBottomWidth: 1, borderBottomColor: C.line2, paddingHorizontal: 14, paddingVertical: 9 },
  notaTxt: { color: C.goldLt, fontSize: 12 },
  velo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
});
