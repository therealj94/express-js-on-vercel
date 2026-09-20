import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, Animated, Easing, Linking, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Button3D, useToast, hap } from '../ui';
import { qtyFmt } from '../data';
import { cardApi } from '../api';
import { useT } from '../i18n';
import * as wallet from '../googleWallet';

// ============================================================
// MODO PAGO · acercá el teléfono y volvé con el comprobante
//
// ── QUÉ RESUELVE ────────────────────────────────────────────────────────────
//
// La tarjeta vive en Google Wallet y el NFC lo maneja Android. Eso no se puede
// cambiar: la credencial de pago es de Google y presentarla al datáfono exige
// certificaciones que no tenemos. Pero el RECORRIDO de la persona sí es
// nuestro, y era el que faltaba.
//
// Antes, pagar con la tarjeta era: salir de Veta Wallet, acordarse de que la
// tarjeta está en Google Wallet, acercar el teléfono, y no enterarse de nada
// hasta volver a abrir la app y refrescar. La app no participaba del momento
// en que se usa la tarjeta, que es justo el momento que importa.
//
// Ahora: se toca «Pagar», la app se queda esperando con el saldo a la vista,
// la persona acerca el teléfono, y en cuanto el emisor nos avisa —un segundo
// después— la pantalla se convierte en el comprobante. No hace falta salir ni
// volver: la app estuvo ahí todo el rato.
//
// ── POR QUÉ FUNCIONA SIN NADA DE GOOGLE ─────────────────────────────────────
//
// Esta pantalla NO necesita el SDK de Google, ni el alta de push provisioning,
// ni un módulo nativo, ni notificaciones push. Solo necesita que la tarjeta
// esté en Google Wallet, y eso se consigue igual si la persona la añadió a
// mano tecleando el número.
//
// Lo que la hace posible ya estaba construido y no se estaba usando: CryptoMate
// nos manda un aviso por webhook cuando se autoriza una compra, el backend lo
// guarda como CardEvent, y `/cards/notifications` lo devuelve. Aquí
// sencillamente se pregunta mientras la persona está de pie en la caja.
//
// ── POR QUÉ SE PREGUNTA Y NO SE ESPERA UN PUSH ──────────────────────────────
//
// Porque la app está abierta y en la mano. Un push serviría para avisar de un
// cobro cuando la app está cerrada —y hace falta, pero es otro trabajo: hoy no
// hay ni registro de tokens en el backend ni envío—. Para ESTE momento,
// preguntar cada dos segundos y medio durante minuto y medio es más simple,
// no depende de Google ni de Apple, y llega igual de rápido.
// ============================================================

const CADA_MS = 2500;          // cada cuánto se pregunta
const CADA_LENTO_MS = 5000;    // después de medio minuto, más espaciado
const RELAJAR_TRAS_MS = 30000;
const RENDIRSE_TRAS_MS = 100000;

/* El paquete de Google Wallet en Android. Abrirlo es opcional —en Android se
   paga desbloqueando y acercando, sin abrir nada— pero hay gente que necesita
   VER la tarjeta antes de confiar, y ese botón se lo da. */
const GOOGLE_WALLET = 'com.google.android.apps.walletnfcrel';

export default function Pagar({ nav, params }) {
  const t = useT();
  const toast = useToast();
  const card = params?.card || null;

  // 'esperando' | 'listo' | 'rechazado' | 'sinRespuesta'
  const [fase, setFase] = useState('esperando');
  const [mov, setMov] = useState(null);       // el evento que cerró la espera
  const desde = useRef(Date.now());
  const vivo = useRef(true);
  const pulso = useRef(new Animated.Value(0)).current;

  /* `null` mientras no se sabe, y se queda en `null` para siempre si el módulo
     nativo no está: no se puede avisar de algo que no se puede comprobar. */
  const [googleContesta, setGoogleContesta] = useState(null);
  const [puedeElegirTarjeta, setPuedeElegirTarjeta] = useState(false);

  /* Dos preguntas al sistema, una sola vez, antes de que la persona esté de pie
     en la caja con el brazo estirado. Si el teléfono no tiene a Google Wallet
     como la app que contesta al datáfono, el tap no va a hacer absolutamente
     nada y el mejor momento para decirlo es ahora, no después. */
  useEffect(() => {
    let sigo = true;
    (async () => {
      const contesta = await wallet.googleEsLaAppDePago();
      if (sigo) setGoogleContesta(contesta);
      const elegir = await wallet.sePuedeElegirTarjeta();
      if (sigo) setPuedeElegirTarjeta(elegir);
    })();
    return () => { sigo = false; };
  }, []);

  /* El latido. Es lo único que se mueve en la pantalla, y se mueve porque una
     pantalla de espera sin nada vivo se lee como una pantalla colgada. */
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    if (fase === 'esperando') anim.start();
    return () => anim.stop();
  }, [fase, pulso]);

  /* La espera. Se pregunta por avisos de tarjeta y se mira solo lo que llegó
     DESPUÉS de entrar aquí: un aviso viejo sin leer no es este pago, y
     enseñarlo como comprobante sería mentir con un cobro de la semana pasada. */
  useEffect(() => {
    if (fase !== 'esperando') return undefined;
    vivo.current = true;
    let reloj = null;

    const preguntar = async () => {
      if (!vivo.current) return;
      const transcurrido = Date.now() - desde.current;
      if (transcurrido > RENDIRSE_TRAS_MS) {
        setFase('sinRespuesta');
        return;
      }
      try {
        const d = await cardApi.notifications();
        const lista = Array.isArray(d?.notifications) ? d.notifications : [];
        const nuevo = lista.find((n) => {
          const cuando = new Date(n.createdAt || 0).getTime();
          return cuando >= desde.current && (n.type === 'APPROVED' || n.type === 'DECLINED');
        });
        if (nuevo && vivo.current) {
          hap();
          setMov(nuevo);
          setFase(nuevo.type === 'APPROVED' ? 'listo' : 'rechazado');
          // Se marca leído: este aviso ya se entregó, aquí y ahora.
          cardApi.markNotificationsRead().catch(() => {});
          return;
        }
      } catch (e) {
        // Un fallo suelto de red no cancela la espera: se vuelve a preguntar.
      }
      if (!vivo.current) return;
      const espera = transcurrido > RELAJAR_TRAS_MS ? CADA_LENTO_MS : CADA_MS;
      reloj = setTimeout(preguntar, espera);
    };

    reloj = setTimeout(preguntar, 1200);   // un respiro antes de la primera
    return () => { vivo.current = false; if (reloj) clearTimeout(reloj); };
  }, [fase]);

  const abrirWallet = useCallback(async () => {
    hap();
    /* Lo mejor que se puede hacer: abrir Google Wallet YA EN nuestra tarjeta,
       sin que haya que buscarla entre las demás. Solo funciona si la metimos
       nosotros con el SDK —no se puede fisgonear la tarjeta de nadie— así que
       si no, se abre la app a secas, que sigue siendo mejor que nada. */
    if (await wallet.abrirEnWallet(card?.last4)) return;
    try {
      const url = `intent://#Intent;package=${GOOGLE_WALLET};scheme=android-app;end`;
      const puede = await Linking.canOpenURL(url);
      if (puede) { await Linking.openURL(url); return; }
    } catch (e) { /* se prueba el camino de abajo */ }
    try {
      await Linking.openURL('https://wallet.google.com/');
    } catch (e) {
      toast(t('pagar.sinWallet'), 'error');
    }
  }, [t, toast, card]);

  /* Pedirle al sistema que Veta sea la tarjeta con la que se paga al acercar el
     teléfono. Decide la persona en un diálogo de Android: no se puede imponer,
     y está bien que no se pueda. */
  const serLaQuePaga = useCallback(async () => {
    hap();
    const ok = await wallet.pedirSerLaPredeterminada(card?.last4);
    toast(t(ok ? 'pagar.serDefectoOk' : 'pagar.serDefectoNo'), ok ? 'ok' : 'error');
  }, [t, toast, card]);

  const reintentar = () => {
    hap();
    desde.current = Date.now();
    setMov(null);
    setFase('esperando');
  };

  const salir = () => { hap(); nav.go('card'); };

  // ── el comprobante ───────────────────────────────────────────────────────
  if (fase === 'listo' || fase === 'rechazado') {
    const bien = fase === 'listo';
    return (
      <View style={{ flex: 1 }}>
        <Header title={t(bien ? 'pagar.listoT' : 'pagar.rechazadoT')} onBack={salir} />
        <View style={s.centro}>
          <View style={[s.sello, bien ? s.selloBien : s.selloMal]}>
            <Icon name={bien ? 'checkmark-circle' : 'close-circle'} size={44} color={bien ? C.up : C.down} />
          </View>

          <Text style={s.monto}>
            {mov?.origenAmount != null ? `${qtyFmt(mov.origenAmount)} ORIGEN` : '—'}
          </Text>
          {!!mov?.merchant && <Text style={s.comercio}>{mov.merchant}</Text>}
          {!bien && <Text style={s.motivo}>{mov?.message || t('pagar.rechazadoP')}</Text>}

          <View style={{ height: 30 }} />
          <View style={s.acciones}>
            <Button3D title={t('pagar.verMovs')} onPress={() => { hap(); nav.go('card'); }} />
            <View style={{ height: 10 }} />
            <Pressable onPress={bien ? reintentar : reintentar} style={s.linea}>
              <Text style={s.lineaTxt}>{t(bien ? 'pagar.otro' : 'pagar.reintentar')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── no llegó ninguna noticia ─────────────────────────────────────────────
  if (fase === 'sinRespuesta') {
    return (
      <View style={{ flex: 1 }}>
        <Header title={t('pagar.t')} onBack={salir} />
        <View style={s.centro}>
          <View style={[s.sello, s.selloEspera]}>
            <Icon name="time-outline" size={40} color={C.gold} />
          </View>
          <Text style={s.tituloEspera}>{t('pagar.sinRespuestaT')}</Text>
          <Text style={s.pie}>{t('pagar.sinRespuestaP')}</Text>
          <View style={{ height: 26 }} />
          <View style={s.acciones}>
            <Button3D title={t('pagar.reintentar')} onPress={reintentar} />
            <View style={{ height: 10 }} />
            <Pressable onPress={salir} style={s.linea}>
              <Text style={s.lineaTxt}>{t('pagar.verMovs')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── esperando el tap ─────────────────────────────────────────────────────
  const escala = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const opaco = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={{ flex: 1 }}>
      <Header title={t('pagar.t')} onBack={salir} />
      <View style={s.centro}>
        {/* El saldo, arriba y grande: es lo que la persona quiere confirmar
            justo antes de acercar el teléfono. */}
        <Text style={s.saldoK}>{t('pagar.saldo')}</Text>
        <Text style={s.saldo}>
          {card?.availableOrigen != null ? `${qtyFmt(card.availableOrigen)} ORIGEN` : '—'}
        </Text>
        {!!card?.last4 && <Text style={s.last4}>•••• {card.last4}</Text>}

        <View style={s.ondaCaja}>
          <Animated.View style={[s.onda, { transform: [{ scale: escala }], opacity: opaco }]} />
          <LinearGradient colors={G.blackCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.disco}>
            <Icon name="contactless" size={44} color={C.gold} />
          </LinearGradient>
        </View>

        <Text style={s.instruccion}>{t('pagar.acerca')}</Text>
        <Text style={s.pie}>{t('pagar.acercaP')}</Text>

        {/* Solo cuando se sabe con certeza que NO. La duda no se enseña: un
            aviso a medias delante de la caja es peor que ningún aviso. */}
        {googleContesta === false && (
          <View style={s.aviso}>
            <Icon name="alert-circle" size={15} color={C.down} />
            <Text style={s.avisoTxt}>{t('pagar.nfcApagado')}</Text>
          </View>
        )}

        <View style={{ height: 28 }} />
        <View style={s.acciones}>
          <Pressable onPress={abrirWallet} style={s.linea} accessibilityRole="button">
            <Icon name="open-outline" size={15} color={C.gold} />
            <Text style={s.lineaTxt}>{t('pagar.abrirWallet')}</Text>
          </Pressable>
          {puedeElegirTarjeta && (
            <Pressable onPress={serLaQuePaga} style={s.linea} accessibilityRole="button">
              <Icon name="contactless" size={15} color={C.gold} />
              <Text style={s.lineaTxt}>{t('pagar.serDefecto')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** ¿Tiene sentido enseñar el botón de pagar? Solo si la tarjeta está activa y
 *  el teléfono es Android: en iPhone la tarjeta no puede estar en la billetera
 *  todavía, y ofrecer un modo pago que no puede terminar es peor que no
 *  ofrecerlo. */
export function sePuedePagar(card) {
  if (!wallet.esAndroid()) return false;
  return String(card?.status || '').toUpperCase() === 'ACTIVE';
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', paddingHorizontal: 26, paddingTop: 18 },
  saldoK: { fontSize: 11, letterSpacing: 2, color: C.txt3, fontWeight: '700' },
  saldo: { fontSize: 30, color: C.gold, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
  last4: { fontSize: 13, color: C.txt3, marginTop: 4, letterSpacing: 1.5 },

  ondaCaja: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center', marginTop: 26 },
  onda: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: C.gold },
  disco: {
    width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.35)',
  },

  instruccion: { fontSize: 19, color: C.txt, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  pie: { fontSize: 14, color: C.txt3, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 320 },

  sello: {
    width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
    marginTop: 34, borderWidth: 1,
  },
  selloBien: { backgroundColor: 'rgba(80,190,140,0.10)', borderColor: 'rgba(80,190,140,0.45)' },
  selloMal: { backgroundColor: 'rgba(224,147,122,0.10)', borderColor: 'rgba(224,147,122,0.45)' },
  selloEspera: { backgroundColor: 'rgba(201,169,97,0.08)', borderColor: 'rgba(201,169,97,0.35)' },

  monto: { fontSize: 34, color: C.txt, fontWeight: '800', marginTop: 22, letterSpacing: -0.6 },
  comercio: { fontSize: 15, color: C.txt2, marginTop: 6 },
  motivo: { fontSize: 14, color: C.txt3, marginTop: 12, textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  tituloEspera: { fontSize: 19, color: C.txt, fontWeight: '700', marginTop: 22, textAlign: 'center' },

  aviso: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16,
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 11, maxWidth: 330,
    backgroundColor: 'rgba(224,147,122,0.10)', borderWidth: 1, borderColor: 'rgba(224,147,122,0.32)',
  },
  avisoTxt: { color: C.txt2, fontSize: 12.5, flexShrink: 1, lineHeight: 17 },

  acciones: { width: '100%', maxWidth: 360 },
  linea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13 },
  lineaTxt: { color: C.gold, fontSize: 14.5, fontWeight: '700' },
});
