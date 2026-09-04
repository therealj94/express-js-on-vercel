/* ORDENEX, DESDE LA APP.
 *
 * ══ QUÉ ES ESTO Y QUÉ NO ═════════════════════════════════════════════════════
 *
 * NO es Ordenex reescrita en React Native. Es la puerta: explica qué hay del
 * otro lado, enseña el estado DE VERDAD —el precio del ORIGEN y si la compra
 * con USDT está abierta— y abre la casa con la sesión ya iniciada.
 *
 * Es la misma decisión que ya tomó MyTokenPay en `More.js` y por el mismo
 * motivo: Genesis ID firma un pase de un solo uso, la otra casa lo canjea, y
 * nadie repite el KYC ni teclea una contraseña más. Lo que cambia es el
 * destino: MyTokenPay es una app y se abre con `mytokenpay://`; Ordenex es una
 * web y se abre con `https://ordenexchange.link/#sso=<pase>`, que es
 * exactamente el circuito que ya usa la Veta Wallet del navegador
 * (`apps-web/veta-wallet/app.js`, volverConLlave).
 *
 * ── POR QUÉ NO ES UN ENLACE PELADO ──────────────────────────────────────────
 *
 * Un botón que dice «Ordenex» y abre el navegador deja a la persona sola con
 * dos preguntas que la app SÍ puede contestar antes de que salga:
 *
 *   1. ¿A cuánto está el ORIGEN? Es el número por el que se entra, y sale de
 *      la misma referencia que usa la casa: la onza de oro entre 31,1035 y
 *      entre 55. Se lee del API, no se calcula acá — dos copias de una regla
 *      de dinero es la casa diciendo una cifra y cobrando otra.
 *
 *   2. ¿Puedo comprar ORIGEN con USDT ahora? El circuito de entrada tiene un
 *      interruptor (COMPRAS) que se enciende a mano, y con él apagado NADIE
 *      entrega: se puede congelar un precio y mandar dinero que se queda
 *      esperando. El servidor ya se niega —contesta ENTREGA_APAGADA— pero
 *      enterarse al llegar es tarde. Acá se dice ANTES de salir de la app.
 *
 * Ese es el «detalle claro»: no adornos, sino las dos cosas que cambian lo que
 * la persona va a hacer.
 *
 * ── LO QUE SE HACE SI EL API NO CONTESTA ────────────────────────────────────
 *
 * Se entra igual. La pantalla no inventa un estado ni bloquea la puerta por no
 * poder preguntar: dice que no pudo leerlo y deja pasar. Quien manda es el
 * servidor de Ordenex cuando la persona llegue — fingir acá una casa cerrada
 * sería tan malo como fingirla abierta.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, Glass, useToast, useAccount } from '../ui';
import { useT } from '../i18n';
import genesis from '../genesis';

/* La casa de cambio. Se puede pisar desde fuera —igual que el API de la
   billetera— para ensayar contra una Ordenex de pruebas sin tocar la de
   verdad. El APEX y no el `www`: es el dominio que la app de Amplify tiene
   asociado, y el `www` es un salto de más. */
export const ORDENEX_URL =
  (process.env.EXPO_PUBLIC_ORDENEX_URL || 'https://ordenexchange.link').replace(/\/$/, '');
export const ORDENEX_API =
  (process.env.EXPO_PUBLIC_ORDENEX_API || 'https://ordenex-api-ba4b27b8b51a.herokuapp.com').replace(/\/$/, '');

/** El precio del ORIGEN en dólares, de la MISMA referencia que usa la casa. */
function precioOrigen(mercados) {
  for (const m of mercados || []) {
    const n = Number(m?.referencia?.origenUsd);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** El oro por onza, que es de donde sale todo lo demás. */
function precioOro(mercados) {
  for (const m of mercados || []) {
    if (/^AUKA-/.test(m?.mercado || '')) {
      const n = Number(m?.referencia?.usd);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

const dolares = (n, dec = 2) =>
  n == null ? null : '$' + n.toLocaleString('es-HN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default function Ordenex({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();
  const [abriendo, setAbriendo] = useState(false);
  const [estado, setEstado] = useState({ cargando: true });

  /* Se pregunta al API de Ordenex, no al de la billetera: el precio y el
     interruptor de la compra viven ahí, y pasarlos por un tercero sería una
     copia más que mantener al día. Las dos rutas son públicas y sin sesión. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      const corte = AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined;
      try {
        const [salud, mercados] = await Promise.all([
          fetch(`${ORDENEX_API}/salud`, { signal: corte }).then((r) => r.json()),
          fetch(`${ORDENEX_API}/mercados`, { signal: corte }).then((r) => r.json()),
        ]);
        if (!vivo) return;
        setEstado({
          cargando: false,
          // `=== true` y no truthy: un API viejo que no manda el campo tiene
          // que contar como «no sé», no como «sí».
          entrega: salud?.entrega === true,
          sabeEntrega: typeof salud?.entrega === 'boolean',
          origenUsd: precioOrigen(mercados),
          oroUsd: precioOro(mercados),
          mercados: Array.isArray(mercados) ? mercados.length : null,
        });
      } catch {
        // Sin respuesta no se inventa nada y no se bloquea la puerta.
        if (vivo) setEstado({ cargando: false, error: true });
      }
    })();
    return () => { vivo = false; };
  }, []);

  const entrar = useCallback(async () => {
    setAbriendo(true);
    try {
      /* La dirección de esta billetera queda atada al GID si aún no lo estaba.
         Ordenex la necesita para poder ENTREGAR el ORIGEN de una compra: sin
         ella la orden ni nace, y es mejor resolverlo acá que hacer que alguien
         teclee su propia dirección del otro lado. */
      const direccion = /^0x[a-fA-F0-9]{40}$/.test(account?.addr || '') ? account.addr : null;
      if (direccion) genesis.vincular(direccion).catch(() => {});

      const token = await genesis.tokenEcosistema();
      if (!token) {
        // Sin identidad verificada Genesis no firma el pase, y hace bien: el
        // camino no es reintentar, es completar el KYC.
        toast(t('onx.sinGid'));
        nav.go('kyc');
        return;
      }
      await Linking.openURL(`${ORDENEX_URL}/#sso=${encodeURIComponent(token)}`);
    } catch (e) {
      toast(t('onx.noAbrio'));
    } finally {
      setAbriendo(false);
    }
  }, [account, nav, t, toast]);

  const cerrada = estado.sabeEntrega && estado.entrega === false;

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('onx.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>

        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <LinearGradient colors={G.gold} style={styles.heroIc}>
            <Icon name="swap-horizontal" size={24} color={C.darkText} />
          </LinearGradient>
          <Text style={styles.heroT}>{t('onx.h')}</Text>
          <Text style={styles.heroP}>{t('onx.p')}</Text>
        </LinearGradient>

        {/* ── EL PRECIO, QUE ES POR LO QUE SE ENTRA ─────────────────────────
            Con la cuenta a la vista y no solo el resultado: ORIGEN es el gramo
            de oro entre 55, y quien lo ve escrito entiende de dónde sale el
            número en vez de tener que creérselo. */}
        <Glass style={styles.group}>
          {estado.cargando ? (
            <View style={styles.cargando}>
              <ActivityIndicator color={C.gold} />
              <Text style={styles.cargandoT}>{t('onx.leyendo')}</Text>
            </View>
          ) : estado.error ? (
            <View style={styles.fila}>
              <View style={styles.filaIc}><Icon name="cloud-offline" size={19} color={C.txt3} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filaT}>{t('onx.sinDatos')}</Text>
                <Text style={styles.filaS}>{t('onx.sinDatosS')}</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={[styles.fila, { borderTopWidth: 0 }]}>
                <View style={styles.filaIc}><Icon name="pricetag" size={19} color={C.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filaT}>{t('onx.origen')}</Text>
                  <Text style={styles.filaS}>{t('onx.origenS')}</Text>
                </View>
                <Text style={styles.cifra}>{dolares(estado.origenUsd, 6) || '—'}</Text>
              </View>
              <View style={styles.fila}>
                <View style={styles.filaIc}><Icon name="trending-up" size={19} color={C.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filaT}>{t('onx.oro')}</Text>
                  <Text style={styles.filaS}>{t('onx.oroS')}</Text>
                </View>
                <Text style={styles.cifra}>{dolares(estado.oroUsd) || '—'}</Text>
              </View>
              {estado.mercados != null && (
                <View style={styles.fila}>
                  <View style={styles.filaIc}><Icon name="list" size={19} color={C.gold} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.filaT}>{t('onx.mercados')}</Text>
                    <Text style={styles.filaS}>{t('onx.mercadosS')}</Text>
                  </View>
                  <Text style={styles.cifra}>{String(estado.mercados)}</Text>
                </View>
              )}
            </>
          )}
        </Glass>

        {/* ── LO QUE SE PUEDE HACER ALLÁ ────────────────────────────────────── */}
        <Glass style={styles.group}>
          <Rasgo icon="swap-horizontal" t={t('onx.f1')} s={t('onx.f1s')} first />
          <Rasgo icon="wallet" t={t('onx.f2')} s={t('onx.f2s')} />
          <Rasgo icon="finger-print" t={t('onx.f3')} s={t('onx.f3s')} />
        </Glass>

        {/* ── EL AVISO QUE EVITA QUE ALGUIEN MANDE DINERO ───────────────────
            Solo cuando el servidor lo dice con todas las letras. Si no se pudo
            preguntar, no sale: un aviso de «cerrado» pintado por no tener
            respuesta es tan mentira como uno de «abierto». */}
        {cerrada && (
          <View style={styles.cerrada}>
            <Icon name="alert-circle" size={18} color={C.down} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.cerradaT}>{t('onx.cerradaT')}</Text>
              <Text style={styles.cerradaP}>{t('onx.cerradaP')}</Text>
            </View>
          </View>
        )}

        <Button3D
          title={abriendo ? t('onx.abriendo') : t('onx.abrir')}
          onPress={entrar}
          disabled={abriendo || !account}
          style={{ marginTop: 16 }}
        />
        <Text style={styles.nota}>{t('onx.nota')}</Text>
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

  group: { marginTop: 16, borderRadius: 18, overflow: 'hidden' },
  fila: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
          borderTopWidth: 1, borderTopColor: C.line2 },
  filaIc: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
            backgroundColor: C.panel3 },
  filaT: { color: C.txt, fontWeight: '600', fontSize: 14 },
  filaS: { color: C.txt3, fontSize: 11.5, marginTop: 2 },
  // Tabulares para que el precio no baile entre lecturas.
  cifra: { color: C.goldLt, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },

  cargando: { padding: 22, alignItems: 'center', gap: 10 },
  cargandoT: { color: C.txt3, fontSize: 12 },

  cerrada: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16, padding: 14,
             borderRadius: 14, borderWidth: 1, borderColor: 'rgba(240,119,107,0.45)',
             backgroundColor: 'rgba(240,119,107,0.10)' },
  cerradaT: { color: C.txt, fontWeight: '700', fontSize: 13.5 },
  cerradaP: { color: C.txt2, fontSize: 12, lineHeight: 17, marginTop: 3 },

  nota: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 10, lineHeight: 16 },
});
