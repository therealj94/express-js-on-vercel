// NegocioPanel — el panel de administración del negocio.
//
// Port de `mobile/app/negocio-panel.tsx` del mytokenpay-app (Expo 51) con
// todo lo que traía: el saldo del comercio arriba, la credencial Genesis del
// negocio, las tres métricas (ORIGEN de hoy, cobros totales, ticket
// promedio), el botón de retirar al banco, el atajo a editar el perfil, la
// lista de cobros recibidos, la lista de retiros, el formulario de retiro con
// su conversión a moneda local y su selector de banco, y la pantalla de
// confirmación. Sus textos son suyos.
//
// TRES DIFERENCIAS DE FONDO, Y SU PORQUÉ
//
// 1. EL SALDO ES EL DE VERDAD. Allá el saldo y las ventas salían de
//    `useBusinessStore`, un almacén en memoria que se llenaba con los botones
//    de "simular pago". Aquí el saldo es el ORIGEN real de la billetera y los
//    cobros son las transferencias ENTRANTES de la cadena — el mismo dato que
//    ven Cobros y el panel. Un negocio no puede mirar un saldo inventado.
//
// 2. EL RETIRO NO MUEVE DINERO, Y LO DICE. En el original `requestCashout`
//    descontaba del almacén simulado y pintaba "retiro en proceso". Aquí NO
//    hay ninguna pasarela bancaria conectada: descontar del saldo o decir "en
//    proceso" haría creer que el dinero salió. Así que el formulario entero se
//    conserva —monto, conversión con la tasa del país, banco, cuenta— y lo que
//    se hace con él es registrar la SOLICITUD en este teléfono, marcada como
//    pendiente y sin tocar el saldo. El día que exista la pasarela, lo único
//    que cambia es qué se hace al pulsar el botón.
//
// 3. LA CREDENCIAL GENESIS ES LA REAL. El original llevaba un diccionario
//    `GENESIS_CREDS` con cuatro pares GEN-…/GNB-… escritos a mano para sus
//    comercios demo. Aquí la credencial es el Genesis ID de la cuenta, que
//    existe de verdad; si está pendiente, la tarjeta lleva al KYC.
//
// Del número de cuenta bancaria solo se guardan los cuatro últimos dígitos:
// no hay a quién mandárselo, así que conservarlo entero sería guardar un dato
// sensible sin ninguna razón.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, Animated,
  RefreshControl, BackHandler, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { C, G } from '../../theme';
import { Header, Button3D, IconBtn, Card, Skeleton, useAccount, useToast, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import { qtyFmt, money, normalizeAmtInput, parseAmt, tokensFromBalances } from '../../data';
import { apiPortfolio } from '../../api';
import { upsertApiAccount } from '../../accounts';
import { listContacts, nameFor } from '../../addressBook';
import { leerFicha, PAISES, RUBROS } from './MiNegocio';

const TXT = {
  es: {
    titulo: 'Panel del negocio', tituloRetiro: 'Retirar fondos', sinNombre: 'Tu negocio',
    leyendo: 'Buscando tu negocio…',
    sinFichaT: 'Aún no tienes una empresa registrada',
    sinFichaP: 'Regístrala una vez y este panel se llena con su saldo, sus cobros y sus retiros.',
    sinFichaBtn: 'REGISTRAR MI EMPRESA',
    walletChip: 'Veta Wallet del negocio · sincronizada',
    saldoNota: 'Es el saldo real de tu billetera en la cadena. En Orden Global el negocio y la persona cobran a la misma dirección: no hay dos bolsas.',
    sinPrecio: 'El precio de ORIGEN no llegó del feed, así que no se convierte a moneda local: preferimos no enseñarte una cifra congelada.',
    credT: 'Genesis ID · negocio verificado', credPend: 'Genesis ID pendiente',
    credPendP: 'Tu comercio aparece SIN VERIFICAR hasta que tu Genesis ID esté aprobado. Toca para continuar.',
    titular: 'Titular',
    hoy: 'ORIGEN hoy', cobros: 'Cobros totales', ticket: 'Ticket promedio',
    retirarBtn: 'RETIRAR A MI BANCO', editar: 'Editar perfil',
    cobrosT: 'COBROS RECIBIDOS',
    cobrosVacio: 'Todavía no hay cobros. Genera tu QR y el primer cobro aparece aquí.',
    sinDatos: 'La cadena no devolvió movimientos: puede que tu cuenta sea nueva o que no hubiera conexión. Desliza hacia abajo para reintentar.',
    de: 'De', retirosT: 'RETIROS',
    disponible: 'SALDO DISPONIBLE', montoLbl: 'Monto a retirar (ORIGEN)', todo: 'Todo',
    recibiras: 'Recibirás ≈ {l}', tasa: '(tasa: 1 ORIGEN = {r})',
    bancoLbl: 'Banco de destino ({m})', elegir: 'Elegir…',
    cuentaLbl: 'Número de cuenta', cuentaPh: 'Ej. 01-234-567890',
    eSaldo: 'No tienes tanto ORIGEN disponible.',
    eMonto: 'Escribe un monto mayor que cero.',
    eGuardar: 'No se pudo guardar la solicitud en este teléfono.',
    registrarBtn: 'REGISTRAR SOLICITUD DE {n} ORIGEN', registrarBtnVacio: 'REGISTRAR SOLICITUD',
    retiroNota: 'ATENCIÓN: esta solicitud NO mueve dinero. Orden Global todavía no tiene ninguna pasarela bancaria conectada, así que tu saldo no se descuenta y nadie recibe la orden. La solicitud queda guardada cifrada en este teléfono para que tengas el registro de lo que pediste y cuándo.',
    hechoT: 'Solicitud registrada', hechoP: 'Queda pendiente: no se movió nada de tu saldo.',
    rBanco: 'Banco', rCuenta: 'Cuenta', rRef: 'Referencia', rMonto: 'Monto', rLocal: 'Equivale a', rEstado: 'Estado',
    pendiente: 'Pendiente · sin pasarela', volverBtn: 'VOLVER AL PANEL',
    verFicha: 'Ver ficha pública', refrescado: 'Panel actualizado',
    sinBancos: 'Banco internacional (SWIFT)',
  },
  en: {
    titulo: 'Business panel', tituloRetiro: 'Withdraw funds', sinNombre: 'Your business',
    leyendo: 'Looking for your business…',
    sinFichaT: 'You have no registered company yet',
    sinFichaP: 'Register it once and this panel fills with its balance, its payments and its payouts.',
    sinFichaBtn: 'REGISTER MY COMPANY',
    walletChip: 'Business Veta Wallet · synced',
    saldoNota: 'This is the real balance of your wallet on chain. In Orden Global the business and the person charge to the same address: there are no two pockets.',
    sinPrecio: 'The ORIGEN price did not arrive from the feed, so it is not converted to local currency: we would rather not show you a frozen figure.',
    credT: 'Genesis ID · verified business', credPend: 'Genesis ID pending',
    credPendP: 'Your business shows as UNVERIFIED until your Genesis ID is approved. Tap to continue.',
    titular: 'Holder',
    hoy: 'ORIGEN today', cobros: 'Total payments', ticket: 'Average ticket',
    retirarBtn: 'WITHDRAW TO MY BANK', editar: 'Edit profile',
    cobrosT: 'PAYMENTS RECEIVED',
    cobrosVacio: 'No payments yet. Generate your QR and the first payment appears here.',
    sinDatos: 'The chain returned no movements: your account may be new, or the connection failed. Pull down to retry.',
    de: 'From', retirosT: 'WITHDRAWALS',
    disponible: 'AVAILABLE BALANCE', montoLbl: 'Amount to withdraw (ORIGEN)', todo: 'All',
    recibiras: 'You will receive ≈ {l}', tasa: '(rate: 1 ORIGEN = {r})',
    bancoLbl: 'Destination bank ({m})', elegir: 'Choose…',
    cuentaLbl: 'Account number', cuentaPh: 'e.g. 01-234-567890',
    eSaldo: 'You do not have that much ORIGEN available.',
    eMonto: 'Enter an amount greater than zero.',
    eGuardar: 'The request could not be saved on this phone.',
    registrarBtn: 'REGISTER REQUEST FOR {n} ORIGEN', registrarBtnVacio: 'REGISTER REQUEST',
    retiroNota: 'HEADS UP: this request does NOT move money. Orden Global has no banking rail connected yet, so your balance is not debited and nobody receives the order. The request is stored encrypted on this phone so you keep a record of what you asked for and when.',
    hechoT: 'Request registered', hechoP: 'It stays pending: nothing was moved from your balance.',
    rBanco: 'Bank', rCuenta: 'Account', rRef: 'Reference', rMonto: 'Amount', rLocal: 'Equals', rEstado: 'Status',
    pendiente: 'Pending · no rail', volverBtn: 'BACK TO PANEL',
    verFicha: 'See public listing', refrescado: 'Panel refreshed',
    sinBancos: 'International bank (SWIFT)',
  },
};

// La tabla de retiro del original (`src/lib/commerce.ts`): moneda, símbolo,
// unidades por dólar y los bancos de cada país. Se copia tal cual porque es
// SU dato de producto; los países que su tabla no cubría caen en el envío
// internacional, igual que allá.
const PAGOS = {
  honduras: { moneda: 'HNL', simbolo: 'L', porUsd: 24.75, bancos: ['Banco Atlántida', 'BAC Credomatic', 'Banpaís', 'Ficohsa', 'Banco de Occidente'] },
  guatemala: { moneda: 'GTQ', simbolo: 'Q', porUsd: 7.75, bancos: ['Banco Industrial', 'Banrural', 'BAM', 'G&T Continental'] },
  'el-salvador': { moneda: 'USD', simbolo: '$', porUsd: 1, bancos: ['Banco Agrícola', 'Banco Cuscatlán', 'BAC Credomatic', 'Davivienda'] },
  nicaragua: { moneda: 'NIO', simbolo: 'C$', porUsd: 36.8, bancos: ['Banpro', 'BAC Credomatic', 'Lafise Bancentro', 'BDF'] },
  'costa-rica': { moneda: 'CRC', simbolo: '₡', porUsd: 512, bancos: ['Banco Nacional', 'Banco de Costa Rica', 'BAC Credomatic', 'Scotiabank'] },
  panama: { moneda: 'USD', simbolo: '$', porUsd: 1, bancos: ['Banco General', 'Banistmo', 'BAC Credomatic', 'Global Bank'] },
  mexico: { moneda: 'MXN', simbolo: '$', porUsd: 17.1, bancos: ['BBVA', 'Banorte', 'Santander', 'Citibanamex'] },
};
const pagoDe = (paisSlug, sinBancos) =>
  PAGOS[paisSlug] || { moneda: 'USD', simbolo: '$', porUsd: 1, bancos: [sinBancos] };

const fmtLocal = (n, p) =>
  `${p.simbolo}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.moneda}`;

// Las solicitudes de retiro viven cifradas en el teléfono, junto a la ficha.
// Se guardan las doce últimas: SecureStore avisa (y en Android puede fallar)
// pasando de unos 2 KB, y doce registros caben de sobra ahí.
const LLAVE_RETIROS = 'og.retiros';
const TOPE_RETIROS = 12;
async function leerRetiros() {
  try {
    const crudo = await SecureStore.getItemAsync(LLAVE_RETIROS);
    const l = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(l) ? l : [];
  } catch (e) { return []; }
}
async function guardarRetiros(lista) {
  await SecureStore.setItemAsync(LLAVE_RETIROS, JSON.stringify(lista.slice(0, TOPE_RETIROS)));
}
// Del número de cuenta solo sobreviven los cuatro últimos dígitos: sirve para
// reconocer a cuál se pidió y no deja el número entero guardado por nada.
const enmascara = (cuenta) => {
  const d = String(cuenta || '').replace(/\D/g, '');
  return d.length > 4 ? '•••• ' + d.slice(-4) : '•••• ' + d;
};

const esEntrante = (x) => x.type === 'recive' || x.type === 'receive' || x.type === 'in';
const esOrigen = (x) => (x.symbol || 'ORIGEN') === 'ORIGEN';
const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');
const rellena = (s, vals) => Object.keys(vals).reduce((a, k) => a.replace('{' + k + '}', vals[k]), s);

function Entrada({ llave, delay = 0, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    op.setValue(0); y.setValue(14);
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, speed: 12, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [llave, op, y, delay]);
  return <Animated.View style={{ opacity: op, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

// El SelectField del original: campo que abre la lista completa. Con hasta
// cinco bancos por país un desplegable nativo tampoco existe en Android.
function Selector({ label, valor, ph, opciones, onElegir }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={st.rotulo}>{label}</Text>
      <Pressable
        onPress={() => { hap(); setAbierto(true); }}
        accessibilityRole="button" accessibilityLabel={label}
        style={st.select}>
        <Text style={[st.selectTxt, !valor && { color: C.txt3 }]} numberOfLines={1}>{valor || ph}</Text>
        <Icon name="chevron-down" size={16} color={C.gold} />
      </Pressable>
      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={st.velo} onPress={() => setAbierto(false)}>
          <View style={st.hoja}>
            <Text style={st.hojaTit}>{label}</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {opciones.map((o) => (
                <Pressable key={o} style={st.opcion} onPress={() => { hap(); onElegir(o); setAbierto(false); }}>
                  <Text style={[st.opcionTxt, o === valor && { color: C.goldLt, fontWeight: '700' }]}>{o}</Text>
                  {o === valor ? <Icon name="checkmark" size={16} color={C.gold} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function FilaKV({ k, v }) {
  return (
    <View style={st.kvFila}>
      <Text style={st.kvK}>{k}</Text>
      <Text style={st.kvV} numberOfLines={1}>{v}</Text>
    </View>
  );
}

export default function NegocioPanel({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account, login } = useAccount();
  const toast = useToast();

  // undefined ⇒ todavía no se leyó el teléfono; null ⇒ no hay negocio.
  const [ficha, setFicha] = useState(undefined);
  const [retiros, setRetiros] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [etapa, setEtapa] = useState('panel');   // panel | retiro | hecho
  const [monto, setMonto] = useState('');
  const [banco, setBanco] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [error, setError] = useState(null);
  const [ultimo, setUltimo] = useState(null);
  const [refrescando, setRefrescando] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerFicha().then((f) => { if (vivo) setFicha(f); });
    leerRetiros().then((l) => { if (vivo) setRetiros(l); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (account?.email) listContacts(account.email).then(setContactos).catch(() => {});
  }, [account?.email]);
  const etiqueta = (addr) => nameFor(contactos, addr) || shortAddr(addr);

  const refrescar = useCallback(async (avisar) => {
    if (!account?.email) return;
    try {
      const p = await apiPortfolio();
      const upd = await upsertApiAccount({ email: account.email, name: account.name }, account.addr, p);
      if (upd) login(upd);
      if (avisar) toast(t.refrescado);
    } catch (e) {}
  }, [account?.email, account?.name, account?.addr]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refrescar(false); }, [refrescar]);

  // El botón físico de Android tiene que cerrar la etapa, no la pantalla:
  // quien está a medio retiro espera volver al panel, no salir del negocio.
  useEffect(() => {
    if (Platform.OS !== 'android' || etapa === 'panel') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setEtapa('panel'); return true; });
    return () => sub.remove();
  }, [etapa]);

  // El saldo y el precio salen de los balances reales de la billetera.
  const origen = useMemo(
    () => tokensFromBalances(account?.balances).find((x) => x.s === 'ORIGEN') || null,
    [account?.balances],
  );
  const saldo = origen ? origen.qty : 0;
  const precio = origen && origen.hasPrice ? origen.price : null;

  const transfers = account?.transfers;
  const entrantes = useMemo(() => (transfers || [])
    .filter(esEntrante)
    .slice()
    .sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0)), [transfers]);

  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
  const deHoy = entrantes.filter((x) => (Number(x.timeStamp) || 0) * 1000 >= inicioHoy.getTime());
  const origenHoy = deHoy.filter(esOrigen).reduce((a, x) => a + (Number(x.value) || 0), 0);
  // El ticket promedio del original, calculado solo sobre cobros en ORIGEN:
  // promediar símbolos distintos daría un número sin significado.
  const enOrigen = entrantes.filter(esOrigen);
  const ticket = enOrigen.length ? enOrigen.reduce((a, x) => a + (Number(x.value) || 0), 0) / enOrigen.length : 0;

  const pago = pagoDe(ficha?.pais, t.sinBancos);
  const aLocal = (o) => (precio == null ? null : Math.round(o * precio * pago.porUsd * 100) / 100);
  const montoNum = parseAmt(monto);
  const montoLocal = aLocal(montoNum);

  const fmtCuando = (ts) => {
    const d = new Date((Number(ts) || 0) * 1000);
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-HN', { day: 'numeric', month: 'short' })
      + ' · ' + d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-HN', { hour: '2-digit', minute: '2-digit' });
  };

  const registrar = async () => {
    if (montoNum <= 0) { setError(t.eMonto); return; }
    if (montoNum > saldo) { setError(t.eSaldo); return; }
    const rec = {
      id: 'RET-' + Date.now().toString(36).toUpperCase(),
      ts: Date.now(),
      origen: montoNum,
      local: montoLocal,
      moneda: pago.moneda,
      simbolo: pago.simbolo,
      banco,
      cuenta: enmascara(cuenta),
      estado: 'pendiente',
    };
    try {
      const lista = [rec, ...retiros];
      await guardarRetiros(lista);
      setRetiros(lista.slice(0, TOPE_RETIROS));
      setUltimo(rec);
      setError(null);
      hap();
      setEtapa('hecho');
    } catch (e) {
      setError(t.eGuardar);
    }
  };

  const nombre = ficha?.nombreComercial || ficha?.nombreLegal || t.sinNombre;
  const rubro = RUBROS.find((r) => r.slug === ficha?.rubro) || null;
  const pais = PAISES.find((p) => p.slug === ficha?.pais) || null;

  // ════ leyendo el teléfono ════════════════════════════════════════════
  if (ficha === undefined) {
    return (
      <View style={st.screen}>
        <Header title={t.titulo} onBack={nav.back} />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Skeleton width="100%" height={110} radius={22} />
          <Skeleton width="100%" height={74} radius={18} />
          <Skeleton width="100%" height={58} radius={16} />
          <Text style={st.nota}>{t.leyendo}</Text>
        </View>
      </View>
    );
  }

  // ════ sin negocio: el mismo desvío del original ══════════════════════
  if (ficha === null) {
    return (
      <View style={st.screen}>
        <Header title={t.titulo} onBack={nav.back} />
        <View style={st.vacioPantalla}>
          <View style={st.vacioIc}><Icon name="storefront" size={28} color={C.txt3} /></View>
          <Text style={st.vacioT}>{t.sinFichaT}</Text>
          <Text style={st.vacioP}>{t.sinFichaP}</Text>
          <Button3D title={t.sinFichaBtn} icon="storefront" onPress={() => nav.go('pay-negocio')} style={{ marginTop: 18, alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  return (
    <View style={st.screen}>
      <Header
        title={etapa === 'retiro' ? t.tituloRetiro : t.titulo}
        sub={nombre}
        onBack={() => (etapa === 'panel' ? nav.back() : setEtapa('panel'))}
        right={etapa === 'panel'
          ? <IconBtn icon="open-outline" label={t.verFicha} onPress={() => nav.go('pay-negocio-detalle', { id: 'mio' })} />
          : undefined}
      />
      <ScrollView
        contentContainerStyle={st.dentro}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando} tintColor={C.gold} colors={[C.gold]}
            onRefresh={async () => { setRefrescando(true); await refrescar(true); setRefrescando(false); }}
          />
        }>

        {/* ═══════════════ PANEL ═══════════════════════════════════════ */}
        {etapa === 'panel' ? (
          <>
            <Entrada llave="panel" delay={0}>
              <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.saldoCard}>
                <View style={st.chip}>
                  <Icon name="wallet" size={11} color={C.goldLt} />
                  <Text style={st.chipTxt}>{t.walletChip}</Text>
                </View>
                <Text style={st.saldoNum}>{qtyFmt(saldo)} <Text style={st.saldoMon}>ORIGEN</Text></Text>
                <Text style={st.saldoSub}>
                  {precio == null ? '—' : `≈ ${fmtLocal(aLocal(saldo), pago)} · ${money(saldo * precio)}`}
                </Text>
              </LinearGradient>
              <Text style={st.nota}>{precio == null ? t.sinPrecio : t.saldoNota}</Text>
            </Entrada>

            {/* credencial Genesis: la de verdad, no un GEN-… de ejemplo */}
            <Entrada llave="panel" delay={80}>
              {account?.genesisUid ? (
                <View style={st.cred}>
                  <View style={st.credIc}><Icon name="finger-print" size={18} color={C.gold} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={st.credT}>{t.credT}</Text>
                      <Icon name="shield-checkmark" size={13} color={C.up} />
                    </View>
                    <Text style={st.credUid}>{account.genesisUid}</Text>
                    <Text style={st.credOwner}>{t.titular}: {account?.name || account?.email}</Text>
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => { hap(); nav.go('kyc'); }}
                  accessibilityRole="button" accessibilityLabel={t.credPend}
                  style={[st.cred, st.credPend]}>
                  <View style={[st.credIc, { backgroundColor: 'rgba(251,191,36,0.13)' }]}>
                    <Icon name="time" size={18} color="#FBBF24" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.credT}>{t.credPend}</Text>
                    <Text style={st.credOwner}>{t.credPendP}</Text>
                  </View>
                  <Icon name="chevron-forward" size={15} color={C.txt3} />
                </Pressable>
              )}
            </Entrada>

            <Entrada llave="panel" delay={140}>
              <View style={st.metricas}>
                <View style={st.metrica}>
                  <Icon name="trending-up" size={16} color={C.up} />
                  <Text style={st.metNum}>{qtyFmt(origenHoy)}</Text>
                  <Text style={st.metLbl}>{t.hoy}</Text>
                </View>
                <View style={[st.metrica, st.metMedio]}>
                  <Icon name="document-text" size={16} color={C.goldLt} />
                  <Text style={st.metNum}>{entrantes.length}</Text>
                  <Text style={st.metLbl}>{t.cobros}</Text>
                </View>
                <View style={st.metrica}>
                  <Icon name="cash" size={16} color={C.gold} />
                  <Text style={st.metNum}>{qtyFmt(ticket)}</Text>
                  <Text style={st.metLbl}>{t.ticket}</Text>
                </View>
              </View>
            </Entrada>

            <Entrada llave="panel" delay={200}>
              <Button3D
                title={t.retirarBtn} icon="send"
                onPress={() => { setMonto(''); setBanco(''); setCuenta(''); setError(null); setEtapa('retiro'); }}
                style={{ marginTop: 16 }}
              />
              <Pressable onPress={() => { hap(); nav.go('pay-negocio'); }}
                accessibilityRole="button" accessibilityLabel={t.editar}
                style={st.fila}>
                <View style={st.filaIc}><Icon name="create" size={17} color={C.gold} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.filaTit}>{t.editar}</Text>
                  <Text style={st.filaSub}>
                    {[rubro ? (rubro[lang] || rubro.es) : null, pais ? pais.label : null].filter(Boolean).join(' · ') || nombre}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={15} color={C.txt3} />
              </Pressable>
            </Entrada>

            <Entrada llave="panel" delay={260}>
              <Text style={st.grupo}>{t.cobrosT}</Text>
              {transfers === undefined ? (
                <View style={{ gap: 9 }}>
                  <Skeleton width="100%" height={58} radius={16} />
                  <Skeleton width="100%" height={58} radius={16} />
                </View>
              ) : entrantes.length === 0 ? (
                <Card style={st.bloque}>
                  <Text style={st.cuerpo}>{transfers.length === 0 ? t.sinDatos : t.cobrosVacio}</Text>
                </Card>
              ) : (
                entrantes.slice(0, 8).map((x, i) => (
                  <View key={x.hash || i} style={st.cobro}>
                    <View style={st.cobroIc}><Icon name="arrow-down" size={17} color={C.up} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.cobroDe} numberOfLines={1}>{t.de}: {etiqueta(x.from)}</Text>
                      <Text style={st.cobroCuando}>{fmtCuando(x.timeStamp)}</Text>
                    </View>
                    <Text style={st.cobroMonto}>+{qtyFmt(Number(x.value) || 0)} {x.symbol || 'ORIGEN'}</Text>
                  </View>
                ))
              )}
            </Entrada>

            {retiros.length > 0 ? (
              <Entrada llave="panel" delay={320}>
                <Text style={st.grupo}>{t.retirosT}</Text>
                {retiros.map((r) => (
                  <View key={r.id} style={st.cobro}>
                    <View style={[st.cobroIc, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
                      <Icon name="paper-plane" size={16} color="#FBBF24" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.cobroDe} numberOfLines={1}>{r.banco} · {r.cuenta}</Text>
                      <Text style={st.cobroCuando}>
                        {new Date(r.ts).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-HN', { day: 'numeric', month: 'short' })} · {r.id} · {t.pendiente}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[st.cobroMonto, { color: '#FBBF24' }]}>{qtyFmt(r.origen)}</Text>
                      {r.local != null ? (
                        <Text style={st.cobroCuando}>{fmtLocal(r.local, { simbolo: r.simbolo, moneda: r.moneda })}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Entrada>
            ) : null}
          </>
        ) : null}

        {/* ═══════════════ RETIRO ══════════════════════════════════════ */}
        {etapa === 'retiro' ? (
          <Entrada llave="retiro">
            <Card style={st.bloque}>
              <Text style={st.rotuloAlto}>{t.disponible}</Text>
              <Text style={st.dispNum}>{qtyFmt(saldo)} ORIGEN</Text>
              {precio != null ? <Text style={st.dispSub}>≈ {fmtLocal(aLocal(saldo), pago)}</Text> : null}
            </Card>

            <View style={{ marginTop: 16 }}>
              <Text style={st.rotulo}>{t.montoLbl}</Text>
              <View style={st.montoFila}>
                <TextInput
                  value={monto}
                  onChangeText={(v) => { setMonto(normalizeAmtInput(v)); setError(null); }}
                  placeholder="0.00" placeholderTextColor={C.txt3}
                  keyboardType="decimal-pad" style={st.montoInput}
                  accessibilityLabel={t.montoLbl}
                />
                <Pressable onPress={() => { hap(); setMonto(String(saldo)); setError(null); }}
                  accessibilityRole="button" accessibilityLabel={t.todo} style={st.todo}>
                  <Text style={st.todoTxt}>{t.todo}</Text>
                </Pressable>
              </View>
              {precio == null ? (
                <Text style={st.nota}>{t.sinPrecio}</Text>
              ) : (
                <Text style={st.nota}>
                  {rellena(t.recibiras, { l: fmtLocal(montoLocal || 0, pago) })}
                  {'  '}
                  {rellena(t.tasa, { r: fmtLocal(aLocal(1), pago) })}
                </Text>
              )}
            </View>

            <View style={{ marginTop: 16 }}>
              <Selector
                label={rellena(t.bancoLbl, { m: pago.moneda })}
                valor={banco} ph={t.elegir} opciones={pago.bancos}
                onElegir={(b) => { setBanco(b); setError(null); }}
              />
              <Text style={st.rotulo}>{t.cuentaLbl}</Text>
              <TextInput
                value={cuenta}
                onChangeText={(v) => { setCuenta(v); setError(null); }}
                placeholder={t.cuentaPh} placeholderTextColor={C.txt3}
                keyboardType="number-pad" style={st.cuentaInput}
                accessibilityLabel={t.cuentaLbl}
              />
            </View>

            {error ? (
              <View style={st.errorCaja}>
                <Icon name="alert-circle" size={15} color={C.down} />
                <Text style={st.errorTxt}>{error}</Text>
              </View>
            ) : null}

            <Button3D
              title={montoNum > 0 ? rellena(t.registrarBtn, { n: qtyFmt(montoNum) }) : t.registrarBtnVacio}
              icon="paper-plane"
              onPress={registrar}
              disabled={montoNum <= 0 || !banco || cuenta.trim().length === 0}
              style={{ marginTop: 18 }}
            />
            <Text style={st.aviso}>{t.retiroNota}</Text>
          </Entrada>
        ) : null}

        {/* ═══════════════ HECHO ═══════════════════════════════════════ */}
        {etapa === 'hecho' && ultimo ? (
          <Entrada llave="hecho">
            <View style={{ alignItems: 'center' }}>
              <View style={st.okIc}><Icon name="checkmark-circle" size={40} color={C.gold} /></View>
              <Text style={st.okT}>{t.hechoT}</Text>
              <Text style={st.okP}>{t.hechoP}</Text>
            </View>
            <Card style={[st.bloque, { marginTop: 16 }]}>
              <FilaKV k={t.rMonto} v={`${qtyFmt(ultimo.origen)} ORIGEN`} />
              {ultimo.local != null
                ? <FilaKV k={t.rLocal} v={fmtLocal(ultimo.local, { simbolo: ultimo.simbolo, moneda: ultimo.moneda })} />
                : null}
              <FilaKV k={t.rBanco} v={ultimo.banco} />
              <FilaKV k={t.rCuenta} v={ultimo.cuenta} />
              <FilaKV k={t.rRef} v={ultimo.id} />
              <FilaKV k={t.rEstado} v={t.pendiente} />
            </Card>
            <Text style={st.aviso}>{t.retiroNota}</Text>
            <Button3D title={t.volverBtn} icon="chevron-back" onPress={() => setEtapa('panel')} style={{ marginTop: 16 }} />
          </Entrada>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 6 },
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },

  saldoCard: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.20)', borderWidth: 1, borderColor: C.line2,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  chipTxt: { color: C.goldLt, fontSize: 10, fontWeight: '700' },
  saldoNum: { color: C.goldLt, fontSize: 32, fontWeight: '300', marginTop: 14, fontVariant: ['tabular-nums'] },
  saldoMon: { fontSize: 15, color: C.gold, fontWeight: '700' },
  saldoSub: { color: C.txt2, fontSize: 12.5, marginTop: 4 },
  nota: { color: C.txt3, fontSize: 11.5, lineHeight: 17.5, marginTop: 10 },

  cred: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 14, marginTop: 14,
  },
  credPend: { borderColor: 'rgba(251,191,36,0.35)', backgroundColor: 'rgba(251,191,36,0.07)' },
  credIc: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  credT: { color: C.txt, fontSize: 12.5, fontWeight: '700' },
  credUid: { color: C.gold, fontSize: 16, fontWeight: '800', letterSpacing: 0.5, marginTop: 3 },
  credOwner: { color: C.txt3, fontSize: 11, lineHeight: 16, marginTop: 3 },

  metricas: {
    flexDirection: 'row', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 20, paddingVertical: 15, marginTop: 14,
  },
  metrica: { flex: 1, alignItems: 'center', gap: 5 },
  metMedio: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  metNum: { color: C.txt, fontSize: 15.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metLbl: { color: C.txt3, fontSize: 10, textAlign: 'center' },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginTop: 11,
  },
  filaIc: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  filaTit: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  filaSub: { color: C.txt3, fontSize: 11, marginTop: 2 },

  grupo: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginTop: 24, marginBottom: 11 },
  bloque: { padding: 15, borderWidth: 1, borderColor: C.line2 },
  cuerpo: { color: C.txt2, fontSize: 12.5, lineHeight: 19 },

  cobro: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginBottom: 9,
  },
  cobroIc: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(62,217,160,0.12)', alignItems: 'center', justifyContent: 'center' },
  cobroDe: { color: C.txt, fontSize: 13, fontWeight: '600' },
  cobroCuando: { color: C.txt3, fontSize: 10.5, marginTop: 2 },
  cobroMonto: { color: C.up, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] },

  rotulo: { color: C.txt2, fontSize: 12, fontWeight: '600', marginBottom: 7 },
  rotuloAlto: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.2 },
  dispNum: { color: C.txt, fontSize: 24, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] },
  dispSub: { color: C.txt2, fontSize: 12.5, marginTop: 3 },
  montoFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  montoInput: {
    flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13, color: C.txt, fontSize: 19, fontWeight: '700',
  },
  todo: {
    borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(201,169,97,0.12)',
    borderRadius: 12, paddingHorizontal: 15, paddingVertical: 13,
  },
  todoTxt: { color: C.gold, fontSize: 12.5, fontWeight: '700' },
  cuentaInput: {
    backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13, color: C.txt, fontSize: 14.5,
  },

  select: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  selectTxt: { flex: 1, color: C.txt, fontSize: 14 },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', paddingHorizontal: 22 },
  hoja: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16 },
  hojaTit: { color: C.goldLt, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
  opcion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingVertical: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  opcionTxt: { flex: 1, color: C.txt, fontSize: 14 },

  errorCaja: {
    flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(240,119,107,0.12)',
    borderWidth: 1, borderColor: 'rgba(240,119,107,0.35)', borderRadius: 14, padding: 12, marginTop: 14,
  },
  errorTxt: { flex: 1, color: C.down, fontSize: 12, lineHeight: 17 },
  aviso: {
    color: C.txt3, fontSize: 11.5, lineHeight: 17.5, marginTop: 14,
    backgroundColor: 'rgba(201,169,97,0.10)', borderWidth: 1, borderColor: C.line2,
    borderRadius: 14, padding: 13,
  },

  okIc: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(201,169,97,0.12)',
    borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  okT: { color: C.txt, fontSize: 20, fontWeight: '800', marginTop: 14 },
  okP: { color: C.txt2, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  kvFila: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 7 },
  kvK: { color: C.txt3, fontSize: 12.5 },
  kvV: { flex: 1, color: C.txt, fontSize: 12.5, fontWeight: '600', textAlign: 'right' },

  vacioPantalla: { paddingHorizontal: 20, marginTop: 40, alignItems: 'center' },
  vacioIc: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: C.panel2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  vacioT: { color: C.txt, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  vacioP: { color: C.txt3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 8 },
});
