// ═══ UNA CASA DEL ECOSISTEMA, ABIERTA DENTRO DE LA APP ═══════════════════════
//
// ══ POR QUE ESTA PANTALLA EXISTE ═════════════════════════════════════════════
//
// Hay partes del ecosistema que viven en la web y que estan MUY por delante de
// lo que esta app tiene escrito en React Native: el Inicio con la galaxia y la
// pelicula del origen, PULSE2CHAT con su cifrado de punta a punta y sus
// llamadas, y Ordenex. Reescribir todo eso en nativo son semanas — y mientras
// tanto el telefono enseñaria una version vieja de cosas que en la web ya estan
// terminadas y probadas.
//
// Asi que se abren aqui dentro. Y no es un parche: es la decision correcta para
// ESTAS partes en concreto, por dos razones que se sostienen solas.
//
//   1. LO QUE SE ACTUALIZA SOLO. Cada despliegue de la web llega al telefono en
//      el momento, sin tienda, sin APK y sin actualizacion por aire. Una
//      correccion de texto a las once de la noche la ve todo el mundo a las
//      once y un minuto.
//   2. LO QUE NO SE DUPLICA. Un cifrado de punta a punta escrito dos veces son
//      dos implementaciones que se tienen que poner de acuerdo en el formato
//      del sobre, la firma y el orden de las llaves. Ahi no hay «casi»: si se
//      separan un milimetro, los mensajes dejan de abrirse.
//
// Lo que NO se abre aqui es el dinero. Las llaves, la firma de una transaccion
// y la huella siguen siendo nativas, donde el sistema operativo las protege de
// verdad. Esa frontera no se mueve.
//
// ══ LA SESION VIAJA, LA PERSONA NO VUELVE A ENTRAR ═══════════════════════════
//
// La app y la web hablan con la MISMA API y usan el MISMO JWT. Asi que antes de
// que la pagina cargue una sola linea, se le deja la sesion puesta en su
// almacen, exactamente con la forma que la web espera. Sin esto, tocar «chat»
// dentro de la app pediria correo y contraseña otra vez — y una app que te hace
// entrar dos veces no se siente como una app, se siente como dos.
//
// Se inyecta ANTES del contenido (`injectedJavaScriptBeforeContentLoaded`) y no
// despues: la web lee su sesion en el arranque, y llegar tarde es no llegar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, StyleSheet, BackHandler, Platform,
} from 'react-native';
import { C } from '../theme';
import { Icon } from '../icons';
import { hap } from '../ui';
import { getToken } from '../api';
import { loadSession } from '../accounts';

let WebViewNativo = null;
try {
  // eslint-disable-next-line global-require
  WebViewNativo = require('react-native-webview').WebView;
} catch (e) { WebViewNativo = null; }

// De donde sale cada casa. Se puede apuntar a un ensayo con una variable de
// entorno, igual que el resto de la app, para probar el circuito entero sin
// tocar lo que usa la gente.
const WEB = String(process.env.EXPO_PUBLIC_WEB_URL || 'https://app.vetawallet.com')
  .replace(/\/$/, '');

export const CASAS = {
  inicio: { titulo: 'Inicio', ruta: '/#nucleo', icono: 'planet' },
  chat: { titulo: 'PULSE2CHAT', ruta: '/#chat', icono: 'chatbubbles' },
  ordenex: { titulo: 'Ordenex', ruta: '/#ordenex', icono: 'swap-horizontal' },
  aucorp: { titulo: 'AuCorp', ruta: '/#aucorp', icono: 'card' },
};

export default function CasaWeb({ nav, params }) {
  const cual = CASAS[params?.casa] ? params.casa : 'inicio';
  const casa = CASAS[cual];
  const ref = useRef(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [puedeAtras, setPuedeAtras] = useState(false);
  const [sesion, setSesion] = useState(undefined);   // undefined = todavia no se leyo

  /* La sesion se lee del llavero al entrar. Es asincrona, asi que hasta que no
     llega no se monta la vista: montarla antes cargaria la pagina SIN sesion y
     la persona veria el formulario de entrar un instante antes de que todo se
     recolocara. Ese parpadeo es exactamente lo que rompe la ilusion de que es
     una sola app. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [token, cuenta] = await Promise.all([getToken(), loadSession()]);
        /* Se manda TODO lo que la cuenta ya sabe. La web puede recuperar el
           nombre y la direccion preguntandole a la API con el token, pero
           hacerlo es una llamada mas y un instante de pantalla a medio pintar:
           si el dato esta aqui, viaja. */
        if (vivo) {
          setSesion(token ? {
            token,
            correo: cuenta?.email || '',
            nombre: cuenta?.name || '',
            direccion: cuenta?.address || cuenta?.addr || '',
          } : null);
        }
      } catch (e) { if (vivo) setSesion(null); }
    })();
    return () => { vivo = false; };
  }, []);

  /* ATRAS SIGNIFICA ATRAS DENTRO DE LA CASA. Si la persona entro a una
     conversacion y aprieta el boton del telefono, espera volver a la lista de
     conversaciones — no salirse de la casa entera. Solo cuando ya no hay
     historia dentro, atras sale. */
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    /* `sub` y no `s`: ahi abajo `s` son los estilos, y una variable que tapa a
       otra dentro de un efecto es de las cosas que se leen mal a las dos de la
       mañana. */
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (puedeAtras && ref.current) { ref.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [puedeAtras]);

  const inyectar = useMemo(() => {
    if (!sesion) return '';
    /* Se serializa con JSON.stringify DOS veces a proposito: una para armar el
       objeto y otra para meterlo dentro de una cadena de JavaScript sin que un
       apostrofo en un nombre rompa el guion. */
    const dato = JSON.stringify(JSON.stringify({
      token: sesion.token,
      correo: sesion.correo,
      nombre: sesion.nombre,
      direccion: sesion.direccion,
    }));
    return `(function () {
      try {
        var s = JSON.parse(${dato});
        var hay = null;
        try { hay = JSON.parse(localStorage.getItem('veta.sesion') || 'null'); } catch (e) {}
        /* NO SE PISA UNA SESION QUE YA ESTA. Si la web ya tiene la de esta
           misma persona —con su nombre y su direccion, que la app no siempre
           conoce— reescribirla con menos datos seria empeorarla. Solo se pone
           cuando no hay ninguna, o cuando la que hay es de OTRA cuenta. */
        if (!hay || !hay.token || (s.correo && hay.correo &&
            String(hay.correo).toLowerCase() !== String(s.correo).toLowerCase())) {
          localStorage.setItem('veta.sesion', JSON.stringify(s));
        }
        /* Y se avisa de que esto va DENTRO de la app: la web esconde lo que
           aqui sobra —su propio boton de pantalla completa, su instalador— y
           puede mandar mensajes de vuelta. */
        localStorage.setItem('veta.enApp', '1');
        window.__EN_APP_NATIVA = true;
      } catch (e) {}
      true;
    })();`;
  }, [sesion]);

  const alMensaje = useCallback((ev) => {
    let d = null;
    try { d = JSON.parse(ev?.nativeEvent?.data || '{}'); } catch (e) { return; }
    /* La casa puede pedir volver —su boton de «atras» propio— y puede pedir
       abrir una pantalla NATIVA: tocar «enviar» en el Inicio tiene que llevar a
       la pantalla de enviar de verdad, con el llavero y la huella, no a la web
       moviendo dinero. Esa es la frontera de la que habla el encabezado. */
    if (d.og === 'volver') { hap(); nav.back(); }
    else if (d.og === 'nativo' && d.pantalla) { hap(); nav.go(d.pantalla, d.params || {}); }
  }, [nav]);

  if (!WebViewNativo) {
    return (
      <Aviso
        titulo="Esta vista previa no puede abrir la casa"
        texto="Expo Go no trae el visor web. Con el APK instalado se abre sin problema."
        nav={nav}
      />
    );
  }

  return (
    <View style={s.raiz}>
      <View style={s.cab}>
        <Pressable
          onPress={() => { hap(); nav.back(); }}
          hitSlop={12}
          style={s.atras}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Icon name="chevron-back" size={22} color={C.txt} />
        </Pressable>
        <Icon name={casa.icono} size={16} color={C.gold} />
        <Text style={s.titulo} numberOfLines={1}>{casa.titulo}</Text>
      </View>

      {sesion === undefined ? (
        <View style={s.centro}><ActivityIndicator color={C.gold} /></View>
      ) : fallo ? (
        <Aviso
          titulo="No se pudo abrir"
          texto="Revisá la conexión y volvé a intentarlo."
          nav={nav}
          alReintentar={() => { setFallo(false); setCargando(true); ref.current?.reload(); }}
        />
      ) : (
        <>
          <WebViewNativo
            ref={ref}
            source={{ uri: WEB + casa.ruta }}
            injectedJavaScriptBeforeContentLoaded={inyectar}
            onMessage={alMensaje}
            onLoadEnd={() => setCargando(false)}
            onError={() => { setCargando(false); setFallo(true); }}
            onHttpError={(e) => {
              /* Un 404 o un 500 dejan una pagina en blanco que parece la app
                 rota. Se dice, y con un boton de reintentar. */
              if ((e?.nativeEvent?.statusCode || 0) >= 400) { setCargando(false); setFallo(true); }
            }}
            onNavigationStateChange={(st) => setPuedeAtras(!!st.canGoBack)}
            // El chat y las llamadas piden micrófono y cámara sin volver a
            // preguntar: el permiso ya se lo dio a la app el sistema.
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            // La galaxia es WebGL: sin aceleración por hardware va a tirones.
            androidLayerType="hardware"
            // Que la web NO se lleve a la persona fuera del ecosistema.
            originWhitelist={['https://*.vetawallet.com', 'https://*.ordenexchange.link',
              'https://*.amplifyapp.com']}
            style={s.web}
          />
          {cargando && (
            <View style={s.velo} pointerEvents="none">
              <ActivityIndicator color={C.gold} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Aviso({ titulo, texto, nav, alReintentar }) {
  return (
    <View style={s.centro}>
      <Icon name="cloud-offline" size={34} color={C.txt3} />
      <Text style={s.avisoT}>{titulo}</Text>
      <Text style={s.avisoP}>{texto}</Text>
      <View style={s.avisoBtns}>
        {alReintentar && (
          <Pressable style={s.btn} onPress={() => { hap(); alReintentar(); }}>
            <Text style={s.btnT}>Reintentar</Text>
          </Pressable>
        )}
        <Pressable style={[s.btn, s.btnLinea]} onPress={() => { hap(); nav.back(); }}>
          <Text style={[s.btnT, s.btnLineaT]}>Volver</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.bg },
  cab: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  atras: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  titulo: { flex: 1, color: C.txt, fontSize: 15, fontWeight: '600' },
  web: { flex: 1, backgroundColor: C.bg },
  velo: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bg,
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26, gap: 10 },
  avisoT: { color: C.txt, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  avisoP: { color: C.txt3, fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  avisoBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    backgroundColor: C.gold,
  },
  btnT: { color: C.darkText, fontWeight: '700', fontSize: 13.5 },
  btnLinea: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  btnLineaT: { color: C.txt },
});
