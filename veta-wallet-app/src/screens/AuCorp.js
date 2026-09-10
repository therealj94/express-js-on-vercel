/* AUCORP, DESDE LA APP.
 *
 * ══ QUÉ ES ESTO ════════════════════════════════════════════════════════════
 *
 * La puerta al lado FIAT del ecosistema, igual que `Ordenex.js` es la puerta a
 * la casa de cambio: explica qué hay del otro lado, enseña el estado de verdad
 * y abre con la sesión ya iniciada. Genesis ID firma un pase de un solo uso y
 * nadie repite el KYC.
 *
 * ── LO QUE CAMBIA RESPECTO A ORDENEX, Y NO ES UN DETALLE ────────────────────
 *
 * En Ordenex el dato que importa antes de entrar es el PRECIO. Aquí no.
 *
 * AuCorp NO es un banco con licencia bancaria: es una FinTech bajo la
 * Regulación A de Próspera. No hay seguro de depósitos ni ventanilla de último
 * recurso. Eso no es letra chica — es lo que cambia qué pasa con el dinero de
 * alguien si algo sale mal, y por eso va ARRIBA, antes que cualquier cifra, y
 * no escondido en un pie.
 *
 * Y va con las palabras de la casa, que están fijadas: se dice «cuenta en
 * moneda local», nunca «cuenta bancaria» ni «depósito asegurado». La frase se
 * lee del propio API (`/salud` → `naturaleza`) en vez de escribirse aquí:
 * dos copias de una advertencia legal es la casa diciendo una cosa en la app y
 * otra en el servidor el día que alguien cambie una sola.
 *
 * ── EL ESTADO QUE SÍ SIRVE ──────────────────────────────────────────────────
 *
 *   · Cuántas monedas maneja la plataforma, con el aviso que el propio API
 *     manda: figurar en la lista no es lo mismo que poder liquidar en ese país.
 *   · Si las tasas de cambio están al día, y de cuándo son. Una tasa vieja que
 *     parece viva es justo lo que una casa de cambio no se puede permitir.
 *
 * Si el API no contesta se entra igual y se dice que no se pudo leer. Lo único
 * que NO desaparece por no poder preguntar es el aviso de que no es un banco:
 * ese se escribe también aquí, como red, porque es lo que no puede faltar.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, Glass, useToast, useAccount } from '../ui';
import { useT } from '../i18n';
import genesis from '../genesis';

/* Apunta a /banca y no a la portada: quien llega desde la app va a SUS
   cuentas, no a leer quiénes somos. Y al dominio de Amplify, porque
   www.aucorp.io todavía sirve el WordPress viejo: mandar a la gente a una
   puerta que no existe es peor que una URL fea. El día que el dominio apunte
   a la app, esta línea cambia y nada más. */
export const AUCORP_URL =
  (process.env.EXPO_PUBLIC_AUCORP_URL || 'https://main.d2e55u6ls6v9xt.amplifyapp.com/banca').replace(/\/$/, '');
export const AUCORP_API =
  (process.env.EXPO_PUBLIC_AUCORP_API || 'https://aucorp-api-e70d3fd481ca.herokuapp.com').replace(/\/$/, '');

/** Una fecha corta, o null. Sin inventar «hoy» cuando no se sabe. */
function cuando(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AuCorp({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();
  const [abriendo, setAbriendo] = useState(false);
  const [estado, setEstado] = useState({ cargando: true });

  useEffect(() => {
    let vivo = true;
    (async () => {
      const corte = AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined;
      try {
        const [salud, mon] = await Promise.all([
          fetch(`${AUCORP_API}/salud`, { signal: corte }).then((r) => r.json()),
          fetch(`${AUCORP_API}/monedas`, { signal: corte }).then((r) => r.json()),
        ]);
        if (!vivo) return;
        setEstado({
          cargando: false,
          naturaleza: typeof salud?.naturaleza === 'string' ? salud.naturaleza : null,
          tasas: salud?.tasas === true,
          tasasCuando: cuando(salud?.tasasCuando),
          monedas: Array.isArray(mon?.monedas) ? mon.monedas.length : null,
          aviso: typeof mon?.aviso === 'string' ? mon.aviso : null,
        });
      } catch {
        if (vivo) setEstado({ cargando: false, error: true });
      }
    })();
    return () => { vivo = false; };
  }, []);

  const entrar = useCallback(async () => {
    setAbriendo(true);
    try {
      const direccion = /^0x[a-fA-F0-9]{40}$/.test(account?.addr || '') ? account.addr : null;
      if (direccion) genesis.vincular(direccion).catch(() => {});

      const token = await genesis.tokenEcosistema();
      if (!token) {
        toast(t('auc.sinGid'));
        nav.go('kyc');
        return;
      }
      /* En el HASH. Es el mismo canal que ya lee la banca cuando alguien vuelve
         de la billetera del navegador, y lo que va después de `#` no viaja al
         servidor ni queda en el registro de ningún intermediario. */
      await Linking.openURL(`${AUCORP_URL}/#sso=${encodeURIComponent(token)}`);
    } catch (e) {
      toast(t('auc.noAbrio'));
    } finally {
      setAbriendo(false);
    }
  }, [account, nav, t, toast]);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('auc.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>

        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <LinearGradient colors={G.gold} style={styles.heroIc}>
            <Icon name="cash" size={24} color={C.darkText} />
          </LinearGradient>
          <Text style={styles.heroT}>{t('auc.h')}</Text>
          <Text style={styles.heroP}>{t('auc.p')}</Text>
        </LinearGradient>

        {/* ── LO PRIMERO, Y NO EN UN PIE ────────────────────────────────────
            La frase la dice el API. Si no contestó, se dice igual con la de
            aquí: es lo único que no puede faltar por un problema de red. */}
        <View style={styles.aviso}>
          <Icon name="information-circle" size={18} color={C.goldLt} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.avisoT}>{t('auc.noBancoT')}</Text>
            <Text style={styles.avisoP}>{estado.naturaleza || t('auc.noBancoP')}</Text>
          </View>
        </View>

        <Glass style={styles.group}>
          {estado.cargando ? (
            <View style={styles.cargando}>
              <ActivityIndicator color={C.gold} />
              <Text style={styles.cargandoT}>{t('auc.leyendo')}</Text>
            </View>
          ) : estado.error ? (
            <View style={[styles.fila, { borderTopWidth: 0 }]}>
              <View style={styles.filaIc}><Icon name="cloud-offline" size={19} color={C.txt3} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filaT}>{t('auc.sinDatos')}</Text>
                <Text style={styles.filaS}>{t('auc.sinDatosS')}</Text>
              </View>
            </View>
          ) : (
            <>
              {estado.monedas != null && (
                <View style={[styles.fila, { borderTopWidth: 0 }]}>
                  <View style={styles.filaIc}><Icon name="globe" size={19} color={C.gold} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.filaT}>{t('auc.monedas')}</Text>
                    <Text style={styles.filaS}>{t('auc.monedasS')}</Text>
                  </View>
                  <Text style={styles.cifra}>{String(estado.monedas)}</Text>
                </View>
              )}
              <View style={styles.fila}>
                <View style={styles.filaIc}><Icon name="trending-up" size={19} color={C.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filaT}>{t('auc.tasas')}</Text>
                  {/* La fecha, no un «al día» a secas: una tasa vieja que parece
                      viva es lo peor que puede enseñar una casa de cambio. */}
                  <Text style={styles.filaS}>
                    {estado.tasas ? (estado.tasasCuando || t('auc.tasasSi')) : t('auc.tasasNo')}
                  </Text>
                </View>
                <Icon name={estado.tasas ? 'checkmark-circle' : 'alert-circle'} size={19}
                      color={estado.tasas ? C.up : C.down} />
              </View>
            </>
          )}
        </Glass>

        {/* El aviso del propio API sobre las monedas: figurar en la lista no es
            lo mismo que poder liquidar en ese país. Solo si el API lo mandó. */}
        {estado.aviso ? <Text style={styles.pieAviso}>{estado.aviso}</Text> : null}

        <Glass style={styles.group}>
          <Rasgo icon="cash" t={t('auc.f1')} s={t('auc.f1s')} first />
          <Rasgo icon="swap-horizontal" t={t('auc.f2')} s={t('auc.f2s')} />
          <Rasgo icon="finger-print" t={t('auc.f3')} s={t('auc.f3s')} />
        </Glass>

        <Button3D
          title={abriendo ? t('auc.abriendo') : t('auc.abrir')}
          onPress={entrar}
          disabled={abriendo || !account}
          style={{ marginTop: 16 }}
        />
        <Text style={styles.nota}>{t('auc.nota')}</Text>
      </ScrollView>
    </View>
  );
}

function Rasgo({ icon, t, s, first }) {
  return (
    <View style={[styles.fila, first && { borderTopWidth: 0 }]}>
      <View style={styles.filaIc}><Icon name={icon} size={19} color={C.gold} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.filaT}>{t}</Text>
        <Text style={styles.filaS}>{s}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.line2 },
  heroIc: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heroT: { color: C.txt, fontSize: 19, fontWeight: '700', marginTop: 14 },
  heroP: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginTop: 6 },

  aviso: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16, padding: 14,
           borderRadius: 14, borderWidth: 1, borderColor: C.line,
           backgroundColor: 'rgba(201,169,97,0.10)' },
  avisoT: { color: C.goldLt, fontWeight: '700', fontSize: 13.5 },
  avisoP: { color: C.txt2, fontSize: 12, lineHeight: 17, marginTop: 3 },

  group: { marginTop: 16, borderRadius: 18, overflow: 'hidden' },
  fila: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
          borderTopWidth: 1, borderTopColor: C.line2 },
  filaIc: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
            backgroundColor: C.panel3 },
  filaT: { color: C.txt, fontWeight: '600', fontSize: 14 },
  filaS: { color: C.txt3, fontSize: 11.5, marginTop: 2 },
  cifra: { color: C.goldLt, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },

  cargando: { padding: 22, alignItems: 'center', gap: 10 },
  cargandoT: { color: C.txt3, fontSize: 12 },

  pieAviso: { color: C.txt3, fontSize: 11.5, lineHeight: 16, marginTop: 8, paddingHorizontal: 2 },
  nota: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 10, lineHeight: 16 },
});
