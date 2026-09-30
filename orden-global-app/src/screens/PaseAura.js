// ================= AU-RA FP · ENTRAR CON EL GENESIS ID DE ESTA CUENTA =================
//
// AU-RA abre `vetawallet://sso?destino=aura&reto=…&estado=…&vuelta=…` cuando
// alguien toca «Entrar con Genesis ID» allá. Esta pantalla es la única puerta
// de ese viaje, y por eso NO se dispara sola como la de MyTokenPay: un enlace
// lo puede abrir cualquier app del teléfono, el consentimiento solo lo da la
// persona.
//
// Lo que se lleva AU-RA es un PASE de Genesis ID, no la sesión de esta app.
// Al canjearlo recibe tu nombre, tu cumpleaños (mes y día, nunca el año), tu
// correo, y el chat PULSE2CHAT se conecta con el mismo pase; la pantalla lo
// lista tal cual, ni más ni menos. Y el pase:
//   · vale solo en AU-RA y en el chat (aud), una vez en cada uno;
//   · lleva el `reto` que mandó AU-RA — solo AU-RA tiene el verificador, así
//     que si otra app se quedara con el enlace de vuelta, no le serviría.
// La contraseña, la frase semilla, el Bearer de esta sesión y los fondos no
// salen de aquí jamás.
//
// Las reglas de la vuelta (lista cerrada, códigos de error, plazo del pedido)
// viven en src/auraSso.js, sin imports, para que la prueba las lea tal cual.
//
// SIN GENESIS ID NO SE LA DEVUELVE CON LAS MANOS VACÍAS. Se le ofrece sacarlo
// ahí mismo: el pedido queda guardado (media hora) y la pantalla del trámite
// (Onboard.js → Kyc) lo retoma al terminar: en revisión vuelve a AU-RA con
// `gid-pendiente`; verificado, vuelve aquí al permiso.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, Glass, useToast, useAccount } from '../ui';
import { genesis } from '../genesis';
import { useT } from '../i18n';
import {
  enlaceDeVuelta, pedidoValido, vueltaDe, codigoAura, trasSinGid, gidEmpezado,
  pedidoParaGuardar, pedidoGuardadoVivo, AURA_VIVE_MS,
} from '../auraSso';

export { enlaceDeVuelta, pedidoValido };

// ── el pedido guardado ──────────────────────────────────────────────────────
//
// En memoria y en AsyncStorage: el trámite usa la cámara, y Android puede
// matar la app mientras tanto. Un pedido contestado queda GASTADO: si el mismo
// enlace vuelve a llegar (Android reentrega el enlace de arranque tras una
// recarga), no se acuña un segundo pase con el mismo reto.
const LLAVE = 'aura.pedido';
const LLAVE_GASTADOS = 'aura.gastados';
let enMemoria = null;
const huella = (p) => `${p.estado}|${p.reto}`;

export async function guardarPedidoAura(p) {
  enMemoria = pedidoParaGuardar(p);
  try { await AsyncStorage.setItem(LLAVE, JSON.stringify(enMemoria)); } catch (e) { /* queda en memoria */ }
}

/** El pedido de AU-RA a medio camino, si sigue vivo. */
export async function pedidoAuraPendiente() {
  let p = enMemoria;
  if (!p) {
    try { p = JSON.parse((await AsyncStorage.getItem(LLAVE)) || 'null'); } catch (e) { p = null; }
  }
  const vivo = pedidoGuardadoVivo(p);
  if (!vivo || (await pedidoAuraGastado(vivo))) { await olvidar(); return null; }
  enMemoria = vivo;
  return vivo;
}

async function olvidar() {
  enMemoria = null;
  try { await AsyncStorage.removeItem(LLAVE); } catch (e) { /* nada */ }
}

async function gastados() {
  try {
    const l = JSON.parse((await AsyncStorage.getItem(LLAVE_GASTADOS)) || '[]');
    return Array.isArray(l) ? l.filter((g) => g && g.hasta > Date.now()) : [];
  } catch (e) { return []; }
}

export async function pedidoAuraGastado(p) {
  return (await gastados()).some((g) => g.h === huella(p));
}

async function soltar(p) {
  await olvidar();
  try {
    const l = (await gastados()).filter((g) => g.h !== huella(p));
    l.push({ h: huella(p), hasta: Date.now() + AURA_VIVE_MS });
    await AsyncStorage.setItem(LLAVE_GASTADOS, JSON.stringify(l.slice(-20)));
  } catch (e) { /* nada */ }
}

/**
 * Vuelve a AU-RA con `datos` ({ pase } o { error }) y suelta el pedido.
 * Devuelve false si no se pudo abrir AU-RA.
 */
export async function volverAAura(pedido, datos) {
  await soltar(pedido);
  try {
    await Linking.openURL(enlaceDeVuelta({ ...datos, estado: pedido.estado, vuelta: pedido.vuelta }));
    return true;
  } catch (e) {
    return false;
  }
}

const DICHO = {
  'correo-sin-confirmar': 'aura.eCorreo', limite: 'aura.eLimite', red: 'aura.eRed', fallo: 'aura.eFallo',
};

export default function PaseAura({ nav, params }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();
  const [pidiendo, setPidiendo] = useState(false);
  const [alta, setAlta] = useState(null);       // { error, aMedias }: ofrecer sacar el Genesis ID
  const [gastado, setGastado] = useState(false);
  const pedido = { reto: params?.reto, estado: params?.estado, vuelta: vueltaDe(params?.vuelta) };
  const valido = pedidoValido(pedido) && !gastado;

  useEffect(() => {
    if (!pedidoValido(pedido)) return;
    pedidoAuraGastado(pedido).then((g) => { if (g) setGastado(true); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.reto, params?.estado]);

  const volver = async (datos) => {
    const ok = await volverAAura(pedido, datos);
    if (!ok) toast(t('aura.sinApp'));
    return ok;
  };

  const permitir = async () => {
    if (!valido || !account) return;
    setPidiendo(true);
    try {
      const pedir = () => genesis.paseConDestino({ aud: ['aura', 'pulse2chat'], reto: pedido.reto });
      let r = await pedir();
      if (!r.token && codigoAura(r) === 'no-vinculada') {
        // Verificada pero sin atar: se ata (lo hace también el trámite al ver
        // la identidad verificada) y se pide UNA vez más.
        await genesis.vincular().catch(() => null);
        r = await pedir();
      }
      if (r.token) {
        await volver({ pase: r.token });
        nav.back();
        return;
      }
      // Solo con un backend de antes de los códigos hace falta mirar el trámite
      // para distinguir «sin Genesis ID» de «a medias».
      const viejo = r.estado === 403 && !r.codigo;
      const gid0 = viejo ? await genesis.estado().catch(() => null) : null;
      let error = codigoAura(r, gid0 && !gid0.error ? gid0 : null);
      if (error === 'sin-gid' || error === 'gid-pendiente') {
        const gid = gid0 || (await genesis.estado().catch(() => null));
        const plan = trasSinGid(gid && !gid.error ? gid : null, error);
        if (plan.hacer === 'alta') { setAlta({ error: plan.error, aMedias: plan.aMedias }); return; }
        error = plan.error;
        if (error === 'gid-pendiente') toast(t('aura.revision'));
      } else if (DICHO[error]) {
        toast(t(DICHO[error]));
      }
      await volver({ error });
      nav.back();
    } catch (e) {
      await volver({ error: 'fallo' });
    } finally {
      setPidiendo(false);
    }
  };

  // Sacar (o terminar) el Genesis ID ahora, con el pedido guardado.
  const sacarGid = async () => {
    await guardarPedidoAura({ ...pedido, fase: 'alta' });
    nav.go('kyc');
  };

  const rechazar = async () => {
    if (valido) await volver({ error: alta ? alta.error : 'cancelado' });
    nav.back();
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('aura.title')} onBack={rechazar} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <LinearGradient colors={G.gold} style={s.heroIc}><Icon name="finger-print" size={24} color={C.darkText} /></LinearGradient>
          <Text style={s.heroT}>{alta ? t('aura.altaT') : t('aura.h')}</Text>
          <Text style={s.heroP}>
            {gastado ? t('aura.gastado')
              : !valido ? t('aura.malo')
                : alta ? t(alta.aMedias ? 'aura.altaMedias' : 'aura.altaSin')
                  : t('aura.p')}
          </Text>
        </LinearGradient>
        {valido && alta && (
          <Button3D title={t(alta.aMedias ? 'aura.terminar' : 'aura.crear')} icon="finger-print"
            onPress={sacarGid} style={{ marginTop: 4 }} />
        )}
        {valido && !alta && (
          <>
            <Glass style={s.grupo}>
              {/* Exactamente lo que recibe AU-RA al canjear el pase, en ese
                  orden: nombre (perfil), cumpleaños sin año (gid.cumple),
                  correo (gid.correo) y el chat, que canjea el mismo pase. */}
              <Fila icon="person" t={t('aura.f1')} s={t('aura.f1s')} first />
              <Fila icon="gift" t={t('aura.fc')} s={t('aura.fcs')} />
              <Fila icon="mail" t={t('aura.f2')} s={t('aura.f2s')} />
              <Fila icon="chatbubbles" t={t('aura.f3')} s={t('aura.f3s')} />
            </Glass>
            <Button3D
              title={pidiendo ? t('aura.pidiendo') : t('aura.permitir')}
              onPress={permitir}
              disabled={pidiendo || !account}
              style={{ marginTop: 16 }}
            />
          </>
        )}
        <Button3D title={alta ? t('aura.ahoraNo') : t('aura.no')} onPress={rechazar} disabled={pidiendo} variant="ghost" style={{ marginTop: 10 }} />
        <Text style={s.nota}>{t('aura.nota')}</Text>
      </ScrollView>
    </View>
  );
}

/**
 * El aviso de AU-RA dentro del trámite: dice adónde vuelve la persona y le deja
 * volver cuando quiera (`sin-gid` si todavía no empezó nada, `gid-pendiente` si
 * ya hay trámite). Lo pinta Kyc mientras haya un pedido en fase de alta.
 */
export function AvisoAura({ pedido, gid, alVolver }) {
  const t = useT();
  const toast = useToast();
  if (!pedido) return null;
  return (
    <Glass style={s.aviso}>
      <Icon name="finger-print" size={18} color={C.gold} />
      <Text style={s.avisoT}>{t('aura.enAlta')}</Text>
      <Button3D title={t('aura.volver')} variant="ghost" onPress={async () => {
        const ok = await volverAAura(pedido, { error: gidEmpezado(gid) ? 'gid-pendiente' : 'sin-gid' });
        if (!ok) toast(t('aura.sinApp'));
        alVolver?.();
      }} />
    </Glass>
  );
}

function Fila({ icon, t, s: sub, first }) {
  return (
    <View style={[s.fila, first && { borderTopWidth: 0 }]}>
      <View style={s.filaIc}><Icon name={icon} size={19} color={C.gold} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.txt, fontWeight: '600', fontSize: 14 }}>{t}</Text>
        <Text style={{ color: C.txt3, fontSize: 11.5, marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 22, padding: 20, marginBottom: 16 },
  heroIc: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroT: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroP: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 6, lineHeight: 19 },
  grupo: { borderRadius: 18, paddingHorizontal: 14 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  filaIc: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(214,181,108,0.12)' },
  nota: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  avisoT: { flex: 1, color: C.txt, fontSize: 12.5, lineHeight: 17 },
});
