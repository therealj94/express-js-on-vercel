// ================= AU-RA FP · ENTRAR CON EL GENESIS ID DE ESTA CUENTA =================
//
// AU-RA abre `vetawallet://sso?destino=aura&reto=…&estado=…` cuando alguien
// toca «Entrar con Genesis ID» allá. Esta pantalla es la única puerta de ese
// viaje, y por eso NO se dispara sola como la de MyTokenPay: un enlace lo puede
// abrir cualquier app del teléfono, el consentimiento solo lo da la persona.
//
// Lo que se lleva AU-RA es un PASE de Genesis ID, no la sesión de esta app:
//   · vale solo en AU-RA y en el chat (aud), una vez en cada uno;
//   · lleva el `reto` que mandó AU-RA — solo AU-RA tiene el verificador, así
//     que si otra app se quedara con el enlace de vuelta, no le serviría.
// La contraseña, la frase semilla, el Bearer de esta sesión y los fondos no
// salen de aquí jamás.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, Glass, useToast, useAccount } from '../ui';
import { genesis } from '../genesis';
import { useT } from '../i18n';

const RETO = /^[A-Za-z0-9_-]{43}$/;
const ESTADO = /^[A-Za-z0-9_-]{8,64}$/;
const VUELTA = 'ultronfp://sso';

/** El enlace de vuelta a AU-RA. Solo parámetros que AU-RA espera. */
export function enlaceDeVuelta({ pase, error, estado }) {
  const q = [];
  if (pase) q.push('pase=' + encodeURIComponent(pase));
  if (error) q.push('error=' + encodeURIComponent(error));
  q.push('estado=' + encodeURIComponent(estado || ''));
  return `${VUELTA}?${q.join('&')}`;
}

/** ¿El pedido que llegó por el enlace tiene la forma que manda AU-RA? */
export const pedidoValido = (p) => RETO.test(String(p?.reto || '')) && ESTADO.test(String(p?.estado || ''));

export default function PaseAura({ nav, params }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();
  const [pidiendo, setPidiendo] = useState(false);
  const valido = pedidoValido(params);

  const volver = async (datos) => {
    try {
      await Linking.openURL(enlaceDeVuelta({ ...datos, estado: params?.estado }));
    } catch {
      toast(t('aura.sinApp'));
    }
  };

  const permitir = async () => {
    if (!valido || !account) return;
    setPidiendo(true);
    try {
      const r = await genesis.paseConDestino({ aud: ['aura', 'pulse2chat'], reto: params.reto });
      if (!r.token) {
        // Sin identidad verificada no hay pase: el camino es hacer el KYC.
        // Se le avisa también a AU-RA, para que no se quede esperando.
        toast(t('mtp.sinGid'));
        await volver({ error: 'sin-gid' });
        nav.go('kyc');
        return;
      }
      await volver({ pase: r.token });
      nav.back();
    } catch {
      await volver({ error: 'fallo' });
    } finally {
      setPidiendo(false);
    }
  };

  const rechazar = async () => {
    if (valido) await volver({ error: 'cancelado' });
    nav.back();
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('aura.title')} onBack={rechazar} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <LinearGradient colors={G.gold} style={s.heroIc}><Icon name="finger-print" size={24} color={C.darkText} /></LinearGradient>
          <Text style={s.heroT}>{t('aura.h')}</Text>
          <Text style={s.heroP}>{valido ? t('aura.p') : t('aura.malo')}</Text>
        </LinearGradient>
        {valido && (
          <>
            <Glass style={s.grupo}>
              <Fila icon="person" t={t('aura.f1')} s={t('aura.f1s')} first />
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
        <Button3D title={t('aura.no')} onPress={rechazar} disabled={pidiendo} variant="ghost" style={{ marginTop: 10 }} />
        <Text style={s.nota}>{t('aura.nota')}</Text>
      </ScrollView>
    </View>
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
});
