import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Animated, ActivityIndicator, KeyboardAvoidingView, Platform, Share, StyleSheet } from 'react-native';
import { PantallaConTeclado } from '../og/Teclado';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Icon } from '../icons';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { Header, TokenIcon, Button3D, Card, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt, qtyExacto, tokensFromBalances, parseAmt, normalizeAmtInput } from '../data';
import { apiSend, apiSendToken, apiPortfolio, estimateNetworkFee, NETWORK_FEE_ORIGEN, CHAIN_ID } from '../api';
import { updateAccount } from '../accounts';
import { listContacts, touchContact, addContact, parseAddress } from '../addressBook';
import { ScanModal } from './Scan';
import { useT } from '../i18n';
import { capacidadBiometrica, desbloqueoActivo, desbloquearClave, activarDesbloqueo, TIPO } from '../unlock';
import { nombreBiometria } from '../PedirClave';

function useTokens() {
  const { account } = useAccount();
  return tokensFromBalances(account?.balances || []);
}

// -------- selector de activo --------
function TokenPicker({ visible, tokens, onClose, onPick }) {
  const tr = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <Text style={styles.sheetTitle}>{tr('picker.title')}</Text>
          {/* La lista va dentro de un ScrollView y con altura tope.
              Sin esto la hoja crecía tanto como tokens hubiera: con dieciséis
              en la red, los de abajo quedaban fuera de la pantalla y no había
              forma de llegar a ellos. ONDK era uno de esos. */}
          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator
          >
            {tokens.map((t) => (
              <Pressable key={t.s} onPress={() => { hap(); onPick(t); onClose(); }} style={styles.pick}>
                <TokenIcon t={t} size={40} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pickName}>{t.n}</Text>
                  <Text style={styles.pickSub}>{qtyFmt(t.qty)} {t.s}</Text>
                </View>
                <Text style={{ color: C.gold, fontWeight: '600' }}>{money(t.qty * t.price)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Selector({ token, label, onPress }) {
  const tr = useT();
  return (
    <Pressable onPress={() => { hap(); onPress(); }} style={styles.selector}>
      <TokenIcon t={token} size={38} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.selName}>{label || token.n}</Text>
        <Text style={styles.selSub}>{tr('send.available')}: {qtyFmt(token.qty)} {token.s}</Text>
      </View>
      <Icon name="chevron-forward" size={20} color={C.txt3} />
    </Pressable>
  );
}

// ================= ENVIAR =================
// Acepta pre-relleno via `params` cuando llega desde una solicitud de pago
// (deep link vetawallet://pay?to=...&amount=...&memo=...). En ese caso el
// destinatario y el monto quedan puestos y el memo queda como saveAs
// sugerido (por si el usuario quiere guardar al contacto).
export function Send({ nav, params }) {
  const tokens = useTokens();
  const origen = tokens.find((t) => t.s === 'ORIGEN') || tokens[0] || { s: 'ORIGEN', n: 'ORIGEN', qty: 0, price: 0, logo: true };
  const [tok, setTok] = useState(origen);
  // El monto puede llegar de fuera (deep link de pago, salto desde Remesas):
  // se normaliza igual que si se hubiera tecleado, para que el campo nunca
  // muestre algo que parseAmt vaya a rechazar.
  const [amt, setAmt] = useState(params?.amount ? normalizeAmtInput(String(params.amount)) : '');
  const [to, setTo] = useState(params?.to || '');
  const [pick, setPick] = useState(false);
  const [review, setReview] = useState(null);  // ficha de revisión antes de firmar
  const [sending, setSending] = useState(false);
  const enviando = useRef(false);             // candado inmediato contra doble envío
  const [contacts, setContacts] = useState([]);
  const [saveAs, setSaveAs] = useState('');   // nombre para guardar el destino
  const [scan, setScan] = useState(false);    // cámara abierta
  const [book, setBook] = useState(false);    // libreta de contactos abierta
  const [done, setDone] = useState(null);     // comprobante del envío
  const toast = useToast();
  const t = useT();
  const { account, login } = useAccount();

  // Contactos guardados: acceso rápido a las direcciones frecuentes.
  useEffect(() => {
    if (account?.email) listContacts(account.email).then(setContacts);
  }, [account?.email]);

  // Si vengo con params de deep link (solicitud de pago), aviso al usuario
  // que los campos ya vienen puestos para que sepa que no los tipeó él.
  useEffect(() => {
    if (params?.to || params?.amount) {
      toast(params?.memo ? t('send.reqFilled', { memo: params.memo }) : t('send.reqFilledPlain'), 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.to, params?.amount]);

  // Fee real leído del RPC. Antes vivía hardcodeado (0.0084) y si la red
  // subía el gasPrice el envío fallaba en silencio. Se refresca al montar
  // la pantalla y usa el respaldo si el RPC no responde.
  const [fee, setFee] = useState(NETWORK_FEE_ORIGEN);
  const isNative = tok.s === 'ORIGEN';
  useEffect(() => {
    let vivo = true;
    // Un envío de token gasta bastante más gas que uno nativo: 21.000 contra
    // unos 52.500 medidos en la red. Estimar siempre con 21.000 dejaba corta
    // la comisión que se le enseña al usuario justo en el caso caro.
    estimateNetworkFee(isNative ? 21000 : 65000).then((f) => { if (vivo) setFee(f); }).catch(() => {});
    return () => { vivo = false; };
  }, [isNative]);

  const amount = parseAmt(amt);
  const usd = amount * (tok.price || 0);
  // La comisión SIEMPRE se paga en ORIGEN, también al mover un token. Así que
  // hay dos saldos que comprobar y no uno: que alcance el token que se envía,
  // y que quede ORIGEN para pagar el viaje.
  const origenDisponible = (tokens.find((x) => x.s === 'ORIGEN') || { qty: 0 }).qty;
  const insufficient = amount > 0 && (isNative ? amount + fee > tok.qty : amount > tok.qty);
  const sinGas = amount > 0 && !isNative && fee > origenDisponible;

  // Paso 1: revisar. Solo comprueba los datos y abre la ficha de revisión;
  // la contraseña se pide allí, junto al resumen de lo que se va a firmar.
  function revisar() {
    if (!/^0x[a-fA-F0-9]{40}$/.test(to.trim())) { toast(t('send.errAddr'), 'error'); return; }
    if (!(amount > 0)) { toast(t('send.errAmt'), 'error'); return; }
    if (insufficient) { toast(t('send.errBal'), 'error'); return; }
    // Un token sin ORIGEN para el gas se queda a medias en la cadena, no en la
    // app: se firma, se manda y muere sin minarse. Mejor pararlo aquí.
    if (sinGas) { toast(t('send.errGas', { fee: fee.toFixed(6) }), 'error'); return; }
    if (!isNative && !tok.contract) { toast(t('send.errContrato', { s: tok.s }), 'error'); return; }
    hap();
    setReview({
      amount,
      usd,
      symbol: tok.s,
      to: to.trim(),
      // La comisión se muestra siempre: en un envío de token también se paga,
      // solo que en ORIGEN. Lo que NO se hace es sumarla al total del token.
      fee,
      contract: isNative ? null : tok.contract,
      total: amount + (isNative ? fee : 0),
      saldoAntes: tok.qty,
      contacto: contacts.find((c) => c.address.toLowerCase() === to.trim().toLowerCase())?.name || null,
      // Sello de idempotencia: nace con la ficha de revisión y NO cambia si el
      // usuario reintenta. Así el backend puede reconocer que es el mismo envío
      // y no cobrarlo dos veces. Igual que el que ya usa la recarga de tarjeta.
      idem: `snd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`,
    });
  }

  // Paso 2: enviar de verdad, con la contraseña escrita en la revisión.
  //
  // Se firma EXACTAMENTE lo que dice la ficha de revisión (`tx`), no el estado
  // vivo del formulario. Antes se leían las variables `to` y `amount` del
  // componente, así que cualquier cosa que las cambiara mientras la ficha
  // estaba abierta — un deep link vetawallet://pay entrante, el resultado del
  // escáner (que sigue montado detrás), un remontaje por cambio de idioma —
  // hacía que saliera un envío distinto del que el usuario aprobó.
  async function confirmar(password) {
    const tx = review;
    if (!tx) return { ok: false, msg: t('send.notConfirmed') };
    // Candado de reentrada: `sending` es estado de React y no se ve hasta el
    // siguiente render, así que dos toques dentro del mismo frame pasaban los
    // dos. El ref se ve al instante.
    if (enviando.current) return { ok: false, msg: t('send.enCurso') };
    enviando.current = true;
    setSending(true);
    try {
      // El camino depende del activo: la moneda nativa va por /transaction/send
      // y un token por /transaction/sendToken, que además necesita el contrato.
      // Se toma de la ficha de revisión, no del formulario vivo, por lo mismo
      // que todo lo demás: se firma lo que el usuario aprobó.
      const r = tx.contract
        ? await apiSendToken({ to: tx.to, amount: tx.amount, password, contract: tx.contract, idem: tx.idem })
        : await apiSend({ to: tx.to, amount: tx.amount, password, idem: tx.idem });
      if (r.ok) {
        touchContact(account?.email, tx.to);
        if (saveAs.trim()) addContact(account?.email, { name: saveAs.trim(), address: tx.to }).catch(() => {});
        hap();
        setReview(null);

        // Añade el envío al historial LOCAL al instante para que aparezca en
        // Actividad ya, sin esperar a que la red lo indexe. Después el
        // portafolio real lo reemplaza — usamos el hash como identificador.
        if (account?.email) {
          const nueva = {
            hash: r.hash || `local_${Date.now()}`,
            timeStamp: Math.floor(Date.now() / 1000),
            value: String(tx.amount),
            symbol: tx.symbol,
            type: 'send',
            from: account.addr,
            to: tx.to,
            gasUsed: r.receipt?.gasUsed ?? null,
            blockNumber: r.receipt?.blockNumber ?? null,
            fee: tx.fee,
            localPending: !r.hash,
          };
          const yaEsta = (account.transfers || []).some((x) => x.hash === nueva.hash);
          const transfers = yaEsta ? account.transfers : [nueva, ...(account.transfers || [])];
          const upd = await updateAccount(account.email, { transfers });
          if (upd) login(upd);
          // Y en segundo plano refresca de la red, para traer saldo y hash reales.
          apiPortfolio()
            .then(async (p) => {
              const u2 = await updateAccount(account.email, { balances: p.balances, transfers: p.transfers });
              if (u2) login(u2);
            })
            .catch(() => {});
        }

        // Si el envío nació de una conversación de AURO CHAT, el comprobante
        // se publica ALLÍ, y solo ahora: cuando la cadena ya confirmó. Antes
        // sería prometer un pago que todavía puede fallar. Que no se pueda
        // avisar --sin red, por ejemplo-- no invalida el envío: el dinero ya
        // se movió, así que el fallo se traga en silencio y el comprobante
        // de esta pantalla sigue siendo la verdad.
        if (params?.avisarChat) {
          import('../og/mensajes')
            .then((M) => M.pago(params.avisarChat, String(tx.amount), {
              moneda: tx.symbol || 'ORIGEN', hash: r.hash || null,
            }))
            .catch(() => {});
        }

        setDone({
          ...tx,
          hash: r.hash || null,
          bloque: r.receipt?.blockNumber ?? null,
          gas: r.receipt?.gasUsed ?? null,
          fecha: Date.now(),
          // Si el pago lo pidió MyTokenPay, el comprobante ofrece volver con
          // el hash para que el cobro se confirme allá.
          volver: params?.volver || null,
          // …y si nació de un chat, el comprobante ofrece volver a la charla.
          alChat: params?.avisarChat || null,
        });
        return { ok: true };
      }
      return { ok: false, msg: t('send.notConfirmed') };
    } catch (e) {
      // Antes se mostraba e.message tal cual y salía un "Aborted" que no
      // explicaba nada. Ahora cada fallo tiene su propio mensaje, y el de
      // tiempo agotado avisa de que la transacción puede haber salido igual.
      const porCodigo = {
        timeout: t('send.errTimeout'),
        red: t('send.errNet'),
        auth: t('send.errAuth'),
        rechazado: e.message || t('send.errRejected'),
        servidor: t('send.errServer'),
        config: t('auth.errServer'),
      };
      // Timeout y caída de red dejan el resultado EN DUDA: la transacción pudo
      // haber salido igual. Antes se ofrecía "Intentar de nuevo" justo debajo
      // de ese aviso, que es la receta del doble gasto. Ahora se refresca el
      // historial de verdad y se manda al usuario a mirarlo, en vez de a
      // reenviar a ciegas.
      const enDuda = e?.code === 'timeout' || e?.code === 'red';
      if (enDuda && account?.email) {
        apiPortfolio()
          .then(async (p) => {
            const u = await updateAccount(account.email, { balances: p.balances, transfers: p.transfers });
            if (u) login({ ...u });
          })
          .catch(() => {});
      }
      return { ok: false, msg: porCodigo[e?.code] || e?.message || t('auth.errGeneric'), enDuda };
    } finally {
      enviando.current = false;
      setSending(false);
    }
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('send.title')} onBack={() => nav.back()} />
      {/* Con el teclado abierto, los campos de abajo —la dirección, el memo—
          quedaban tapados y uno escribía a ciegas. En Android hace falta
          `height`: sin `behavior` no hace nada cuando la app dibuja de borde a
          borde, que es lo normal desde Android 15. */}
      <PantallaConTeclado
        contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
        keyboardDismissMode="on-drag"
      >
        <Selector token={tok} onPress={() => setPick(true)} />

        {/* Al mover un token, la comisión no sale del token: sale del ORIGEN.
            Se dice aquí y no en la ficha de revisión, porque el momento de
            enterarse es antes de escribir el monto, no después. */}
        {!isNative && (
          <View style={styles.notice}>
            <Icon name="information-circle" size={18} color={C.gold} />
            <Text style={styles.noticeTxt}>
              {t('send.feeEnOrigen', { s: tok.s, saldo: qtyFmt(origenDisponible) })}
            </Text>
          </View>
        )}

        <View style={styles.bigInput}>
          <TextInput value={amt} onChangeText={(v) => setAmt(normalizeAmtInput(v))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#3a5c58" style={styles.amtIn} />
          <Text style={styles.cur}>≈ {money(usd)} USD</Text>
        </View>

        {/* Viene de Remesas, donde el monto se escribió en dólares. Se muestra
            la cifra original para que se pueda verificar la conversión: es la
            única forma de que el usuario note si el precio usado no era el que
            esperaba antes de firmar. */}
        {params?.fiatUsd > 0 && (
          <View style={styles.notice}>
            <Icon name="swap-horizontal" size={18} color={C.gold} />
            <Text style={styles.noticeTxt}>{t('send.fromRemesa', { usd: money(params.fiatUsd) })}</Text>
          </View>
        )}

        {/* Cámara, libreta y contactos guardados: toca uno y se rellena la dirección */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactsRow}>
          <Pressable onPress={() => { hap(); setScan(true); }} style={styles.contactItem}>
            <View style={[styles.contactAv, styles.contactScan]}><Icon name="qr-code" size={21} color={C.darkText} /></View>
            <Text style={styles.contactName} numberOfLines={1}>{t('send.scan')}</Text>
          </Pressable>
          <Pressable onPress={() => { hap(); setBook(true); }} style={styles.contactItem}>
            <View style={styles.contactAv}><Icon name="people" size={20} color={C.gold} /></View>
            <Text style={styles.contactName} numberOfLines={1}>{t('send.contacts')}</Text>
          </Pressable>
          {contacts.slice(0, 6).map((c) => (
            <Pressable key={c.id} onPress={() => { hap(); setTo(c.address); }} style={styles.contactItem}>
              <View style={[styles.contactAv, c.fav && styles.contactFav]}><Text style={styles.contactIni}>{c.initials}</Text></View>
              <Text style={styles.contactName} numberOfLines={1}>{c.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>{t('send.to')}</Text>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <TextInput value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} placeholder="0x…" placeholderTextColor="#6f938f" style={[styles.input, { flex: 1 }]} />
          <Pressable onPress={() => { hap(); setScan(true); }} style={styles.scanBtn}>
            <Icon name="qr-code" size={21} color={C.darkText} />
          </Pressable>
        </View>
        {/* Guardar el destino como contacto (solo si no lo tenemos ya) */}
        {parseAddress(to) && !contacts.some((c) => c.address.toLowerCase() === (parseAddress(to) || '').toLowerCase()) && (
          <TextInput
            value={saveAs}
            onChangeText={setSaveAs}
            placeholder={t('send.saveAs')}
            placeholderTextColor="#6f938f"
            style={[styles.input, { marginTop: 9, fontSize: 13.5 }]}
          />
        )}

        <View style={{ height: 14 }} />
        <Card style={{ padding: 14, marginBottom: 16 }}>
          <Row k={t('send.fee')} v={`${fee.toFixed(6)} ORIGEN`} />
          <Row k={t('send.network')} v="Orden Global · 8532" />
          <Row k={t('send.total')} v={`${amount ? (amount + (isNative ? fee : 0)).toFixed(4) : '—'} ${tok.s}`} />
          <Row k={t('send.after')} v={`${amount ? Math.max(0, tok.qty - amount - (isNative ? fee : 0)).toFixed(4) : qtyFmt(tok.qty)} ${tok.s}`} />
        </Card>
        {insufficient && <Text style={styles.errTxt}>{t('send.insufficient', { q: qtyFmt(tok.qty), s: tok.s })}</Text>}

        <Button3D title={t('send.review')} onPress={revisar} />
      </PantallaConTeclado>
      <TokenPicker visible={pick} tokens={tokens} onClose={() => setPick(false)} onPick={setTok} />
      {/* La cámara va en modal: así el formulario sigue montado y la
          dirección leída se escribe directamente en el campo. */}
      <ScanModal
        visible={scan}
        onResult={(raw) => {
          // El QR puede ser una dirección pelada o un link vetawallet://pay
          // con monto y memo. Si viene con monto, lo pre-rellenamos también.
          if (/^vetawallet:\/\/pay\?/i.test(raw)) {
            try {
              const q = raw.split('?')[1] || '';
              const parts = {};
              for (const kv of q.split('&')) {
                const [k, v] = kv.split('=');
                if (k) parts[k] = v ? decodeURIComponent(v) : '';
              }
              if (parts.to) setTo(parts.to);
              if (parts.amount) setAmt(normalizeAmtInput(String(parts.amount)));
              if (parts.memo) setSaveAs(parts.memo);
              return;
            } catch (e) {}
          }
          setTo(raw);
        }}
        onClose={() => setScan(false)}
      />
      <ContactPicker
        visible={book}
        contacts={contacts}
        onClose={() => setBook(false)}
        onPick={(a) => { setTo(a); setBook(false); }}
        onManage={() => { setBook(false); nav.go('contacts'); }}
      />
      <ReviewSheet
        data={review}
        token={tok}
        onCancel={() => setReview(null)}
        onConfirm={confirmar}
      />
      <SentReceipt
        data={done}
        contacts={contacts}
        onClose={() => { setDone(null); nav.go('home'); }}
      />
    </View>
  );
}

// -------- paso 2: revisar, firmar y ver el avance --------
// Todo ocurre en la misma ficha: se revisa, se escribe la contraseña, y al
// confirmar la ficha se convierte en el indicador de progreso. Así el usuario
// nunca se queda mirando una pantalla quieta sin saber qué pasa.
function ReviewSheet({ data, token, onCancel, onConfirm }) {
  const t = useT();
  const [pw, setPw] = useState('');
  const [verPw, setVerPw] = useState(false);
  const [fase, setFase] = useState(0);   // 0 revisando · 1..3 enviando · -1 error
  // Desbloqueo biométrico: con la contraseña ya guardada, firmar es una cara
  // o un dedo. El teclado sigue disponible siempre como alternativa.
  const [bio, setBio] = useState({ disponible: false, tipo: TIPO.HUELLA });
  const [bioActivo, setBioActivo] = useState(false);
  const [pidiendoBio, setPidiendoBio] = useState(false);
  const [modoManual, setModoManual] = useState(false);
  const [quiereActivar, setQuiereActivar] = useState(false);
  const [error, setError] = useState(null);
  const [enDuda, setEnDuda] = useState(false);   // el envío pudo haber salido igual
  const firmando = useRef(false);                // candado contra doble toque
  const prog = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const fases = [t('send.step1'), t('send.step2'), t('send.step3')];

  useEffect(() => {
    if (!data) {
      setPw(''); setVerPw(false); setFase(0); setError(null); prog.setValue(0); shake.setValue(0);
      setModoManual(false); setQuiereActivar(false); setPidiendoBio(false);
    }
  }, [data]);

  // Al abrirse la ficha se consulta qué ofrece el teléfono. A diferencia de
  // otras pantallas, acá NO se dispara la biometría sola: el usuario tiene que
  // poder leer el monto y el destino antes de autorizar nada.
  useEffect(() => {
    if (!data) return;
    let vivo = true;
    (async () => {
      const [cap, act] = await Promise.all([capacidadBiometrica(), desbloqueoActivo()]);
      if (!vivo) return;
      setBio(cap);
      setBioActivo(act && cap.disponible);
    })();
    return () => { vivo = false; };
  }, [data]);

  // Las fases avanzan solas mientras la red trabaja: no podemos saber el
  // progreso real de un bloque, pero sí reflejar en qué punto va el proceso.
  useEffect(() => {
    if (fase < 1) return;
    Animated.timing(prog, { toValue: fase / 3, duration: 600, useNativeDriver: false }).start();
    if (fase >= 3) return;
    const id = setTimeout(() => setFase((f) => (f > 0 && f < 3 ? f + 1 : f)), fase === 1 ? 1800 : 6000);
    return () => clearTimeout(id);
  }, [fase]);

  // Sacudida horizontal cuando el envío falla o la contraseña queda vacía.
  // Es la señal universal de "eso está mal, arréglalo" y se combina con
  // haptic Error para reforzar sin depender solo del color.
  const shakeAnim = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // Firma con la contraseña, venga de la biometría o del teclado. Si el envío
  // sale bien y el usuario pidió activar el desbloqueo, se guarda recién ahí:
  // guardar una contraseña que el servidor rechaza dejaría un desbloqueo que
  // falla siempre.
  async function enviar(clave, { deBio = false } = {}) {
    const password = clave ?? pw;
    if (!password) { setError(t('send.errPw')); shakeAnim(); return; }
    // Mismo motivo que en confirmar(): `fase` es estado y no frena un segundo
    // toque disparado en el mismo frame. Este ref sí.
    if (firmando.current) return;
    firmando.current = true;
    setError(null);
    setEnDuda(false);
    setFase(1);
    try {
      const r = await onConfirm(password);
      if (!r.ok) {
        setFase(-1); setError(r.msg); setEnDuda(!!r.enDuda); prog.setValue(0); shakeAnim();
        // Si la clave guardada dejó de servir, se vuelve al teclado.
        if (deBio) setModoManual(true);
      } else {
        if (quiereActivar && !deBio) activarDesbloqueo(password).catch(() => {});
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } finally {
      firmando.current = false;
    }
  }

  async function autorizarConBio() {
    setError(null);
    setPidiendoBio(true);
    const clave = await desbloquearClave();
    setPidiendoBio(false);
    if (!clave) { setModoManual(true); return; }
    await enviar(clave, { deBio: true });
  }

  if (!data) return null;
  const enviando = fase > 0;
  const destino = data.contacto || `${data.to.slice(0, 12)}…${data.to.slice(-10)}`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={enviando ? () => {} : onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.revBg}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.revCard, { transform: [{ translateX: shake }] }]}>
          <View style={styles.grab} />
          <Text style={styles.revT}>{enviando ? t('send.sendingT') : t('send.reviewT')}</Text>

          {/* Lo que se va a mover, bien grande */}
          <View style={styles.revMonto}>
            <TokenIcon t={token} size={44} />
            <Text style={styles.revAmt}>{qtyExacto(data.amount)} {data.symbol}</Text>
            <Text style={styles.revUsd}>≈ {money(data.usd)} USD</Text>
          </View>

          <View style={styles.revRows}>
            <Row k={t('send.to')} v={destino} />
            <Row k={t('send.fee')} v={`${qtyExacto(data.fee)} ORIGEN`} />
            <Row k={t('send.total')} v={`${data.total.toFixed(4)} ${data.symbol}`} />
            <Row k={t('send.after')} v={`${Math.max(0, data.saldoAntes - data.total).toFixed(4)} ${data.symbol}`} />
            <Row k={t('send.network')} v="Orden Global · 8532" />
          </View>

          {fase === 0 ? (
            bioActivo && !modoManual ? (
              /* Con el desbloqueo activo, firmar es una cara o un dedo. */
              <View style={{ marginTop: 18, alignItems: 'center' }}>
                <View style={styles.bioCirc}>
                  {pidiendoBio
                    ? <ActivityIndicator size="large" color={C.gold} />
                    : <Icon name={bio.tipo === TIPO.FACE ? 'person' : 'finger-print'} size={38} color={C.gold} />}
                </View>
                <Text style={styles.bioHint}>{t('send.bioHint', { m: nombreBiometria(bio.tipo, t) })}</Text>
                {error && <Text style={styles.revErr}>{error}</Text>}
                <Button3D
                  title={t('send.bioCta', { m: nombreBiometria(bio.tipo, t) })}
                  icon="finger-print"
                  onPress={() => { hap(); autorizarConBio(); }}
                  style={{ marginTop: 4, alignSelf: 'stretch' }}
                />
                <Pressable onPress={() => { hap(); setModoManual(true); setError(null); }} style={styles.revCancel}>
                  <Text style={styles.bioAlt}>{t('clave.usarClave')}</Text>
                </Pressable>
                <Pressable onPress={onCancel} style={{ paddingBottom: 6 }}>
                  <Text style={styles.revCancelTxt}>{t('send.cancel')}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={[styles.label, { marginTop: 16 }]}>{t('send.pw')}</Text>
                {/* Ojito para mostrar la contraseña: verla evita escribir una
                    clave mal y que se agote el intento con la red. */}
                <View style={{ position: 'relative' }}>
                  <TextInput
                    value={pw}
                    onChangeText={(v) => { setPw(v); setError(null); }}
                    secureTextEntry={!verPw}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="••••••••"
                    placeholderTextColor="#6f938f"
                    style={[styles.input, { paddingRight: 46 }]}
                    autoFocus
                  />
                  <Pressable onPress={() => setVerPw((v) => !v)} style={styles.ojito}>
                    <Icon name={verPw ? 'eye-off' : 'eye'} size={19} color={C.txt2} />
                  </Pressable>
                </View>
                {error && <Text style={styles.revErr}>{error}</Text>}

                {/* Ofrecer el desbloqueo solo si el teléfono lo soporta y aún
                    no está activo. Se guarda tras un envío exitoso. */}
                {bio.disponible && !bioActivo && (
                  <Pressable
                    onPress={() => { hap(); setQuiereActivar(!quiereActivar); }}
                    style={styles.activarFila}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: quiereActivar }}
                    accessibilityLabel={t('clave.activar', { m: nombreBiometria(bio.tipo, t) })}
                  >
                    <View style={[styles.casilla, quiereActivar && { backgroundColor: C.gold, borderColor: C.gold }]}>
                      {quiereActivar && <Icon name="checkmark" size={13} color={C.darkText} />}
                    </View>
                    <Text style={styles.activarTxt}>{t('clave.activar', { m: nombreBiometria(bio.tipo, t) })}</Text>
                  </Pressable>
                )}

                <Button3D title={t('send.confirm')} icon="arrow-up" onPress={() => enviar()} style={{ marginTop: 14 }} />
                {bioActivo && (
                  <Pressable onPress={() => { hap(); setModoManual(false); setError(null); }} style={styles.revCancel}>
                    <Text style={styles.bioAlt}>{t('clave.reintentarBio', { m: nombreBiometria(bio.tipo, t) })}</Text>
                  </Pressable>
                )}
                <Pressable onPress={onCancel} style={bioActivo ? { paddingBottom: 6, alignItems: 'center' } : styles.revCancel}>
                  <Text style={styles.revCancelTxt}>{t('send.cancel')}</Text>
                </Pressable>
              </>
            )
          ) : fase > 0 ? (
            <View style={{ marginTop: 20 }}>
              {/* Barra de avance + la fase en la que va */}
              <View style={styles.barBg}>
                <Animated.View
                  style={[styles.barFill, { width: prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
                />
              </View>
              <View style={styles.pasos}>
                {fases.map((f, i) => {
                  const hecho = fase > i + 1;
                  const actual = fase === i + 1;
                  return (
                    <View key={f} style={styles.paso}>
                      <View style={[styles.pasoIc, hecho && styles.pasoOk, actual && styles.pasoNow]}>
                        {hecho ? <Icon name="checkmark" size={12} color={C.darkText} />
                          : actual ? <ActivityIndicator size="small" color={C.gold} />
                            : <View style={styles.pasoDot} />}
                      </View>
                      <Text style={[styles.pasoTxt, (hecho || actual) && { color: C.txt }]}>{f}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.revEspera}>{t('send.wait')}</Text>
            </View>
          ) : (
            /* fase === -1: falló. Si el resultado quedó EN DUDA (tiempo agotado
               o caída de red) NO se ofrece reenviar: la transacción pudo haber
               salido igual y reintentar sería pagar dos veces. Se manda a
               Actividad, que ya viene refrescada de la red. */
            <View style={{ marginTop: 16 }}>
              <View style={styles.errBox}>
                <Icon name="warning" size={18} color={C.down} />
                <Text style={styles.errBoxTxt}>{error}</Text>
              </View>
              {enDuda ? (
                <>
                  <Button3D title={t('send.verActividad')} icon="time" onPress={onCancel} style={{ marginTop: 12 }} />
                  <Text style={styles.revEspera}>{t('send.dudaNota')}</Text>
                </>
              ) : (
                <Button3D title={t('send.retry')} icon="refresh" onPress={() => { setFase(0); setError(null); }} style={{ marginTop: 12 }} />
              )}
              <Pressable onPress={onCancel} style={styles.revCancel}>
                <Text style={styles.revCancelTxt}>{t('send.cancel')}</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// -------- comprobante de envío --------
// Aparece al confirmarse la transacción: monto, destino, comisión y hash.
// No se cierra solo — el usuario lee y da OK.
function SentReceipt({ data, contacts, onClose }) {
  const t = useT();
  const toast = useToast();
  const check = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!data) { check.setValue(0); return; }
    Animated.spring(check, { toValue: 1, useNativeDriver: true, friction: 5, tension: 90 }).start();
  }, [data]);

  if (!data) return null;
  const guardado = contacts.find((c) => c.address.toLowerCase() === data.to.toLowerCase());
  const destino = guardado ? guardado.name : `${data.to.slice(0, 10)}…${data.to.slice(-8)}`;

  const copiar = async (v) => { hap(); try { await Clipboard.setStringAsync(v); toast(t('recv.copied')); } catch (e) {} };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.doneBg}>
        <View style={styles.doneCard}>
          <Animated.View style={[styles.doneIc, { transform: [{ scale: check }] }]}>
            <Icon name="checkmark" size={38} color={C.darkText} />
          </Animated.View>
          <Text style={styles.doneT}>{t('send.doneT')}</Text>
          <Text style={styles.doneAmt}>{qtyExacto(data.amount)} {data.symbol}</Text>
          <Text style={styles.doneP}>{t('send.doneP')}</Text>

          {data.usd ? <Text style={styles.doneUsd}>≈ {money(data.usd)} USD</Text> : null}

          <View style={styles.doneRows}>
            <DoneRow first k={t('send.to')} v={destino} onPress={() => copiar(data.to)} />
            {data.fee ? <DoneRow k={t('send.fee')} v={`${qtyExacto(data.fee)} ORIGEN`} /> : null}
            {data.total ? <DoneRow k={t('send.total')} v={`${data.total.toFixed(4)} ${data.symbol}`} /> : null}
            {data.saldoAntes != null ? (
              <DoneRow k={t('send.after')} v={`${Math.max(0, data.saldoAntes - (data.total || 0)).toFixed(4)} ${data.symbol}`} />
            ) : null}
            <DoneRow k={t('send.network')} v="Orden Global · 8532" />
            {data.bloque != null ? <DoneRow k={t('send.block')} v={`#${data.bloque}`} /> : null}
            {data.gas != null ? <DoneRow k={t('send.gas')} v={String(data.gas)} /> : null}
            <DoneRow k={t('send.date')} v={new Date(data.fecha || Date.now()).toLocaleString()} />
            {data.hash ? (
              <DoneRow k={t('send.hash')} v={`${String(data.hash).slice(0, 10)}…${String(data.hash).slice(-8)}`} onPress={() => copiar(data.hash)} />
            ) : null}
          </View>

          {data.volver && data.hash ? (
            <Button3D
              title={t('send.volverMtp')}
              icon="arrow-redo"
              onPress={() => {
                const enlace = `${data.volver}${data.volver.includes('?') ? '&' : '?'}tx=${data.hash}`;
                Linking.openURL(enlace).catch(() => {});
                onClose();
              }}
              style={{ alignSelf: 'stretch', marginTop: 18 }}
            />
          ) : null}
          <Button3D title={t('send.ok')} icon="checkmark" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: data.volver && data.hash ? 10 : 18 }} />
        </View>
      </View>
    </Modal>
  );
}

function DoneRow({ k, v, onPress, first }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.doneRow, first && { borderTopWidth: 0 }]}>
      <Text style={styles.doneK}>{k}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
        <Text style={styles.doneV} numberOfLines={1}>{v}</Text>
        {onPress ? <Icon name="copy" size={13} color={C.gold} /> : null}
      </View>
    </Pressable>
  );
}

// -------- libreta de contactos (elegir destino) --------
function ContactPicker({ visible, contacts, onClose, onPick, onManage }) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <Text style={styles.sheetTitle}>{t('con.title')}</Text>
          <ScrollView style={{ maxHeight: 340 }}>
            {contacts.length === 0 && <Text style={styles.emptyPick}>{t('con.emptyP')}</Text>}
            {contacts.map((c) => (
              <Pressable key={c.id} onPress={() => { hap(); onPick(c.address); }} style={styles.pick}>
                <View style={[styles.contactAv, c.fav && styles.contactFav]}><Text style={styles.contactIni}>{c.initials}</Text></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pickName}>{c.name}</Text>
                  <Text style={styles.pickSub}>{`${c.address.slice(0, 10)}…${c.address.slice(-6)}`}</Text>
                </View>
                {c.fav ? <Icon name="star" size={16} color={C.gold} /> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Button3D title={t('con.manage')} icon="people" variant="teal" onPress={onManage} style={{ marginTop: 14 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ k, v }) {
  return <View style={styles.rr}><Text style={styles.rrK}>{k}</Text><Text style={styles.rrV}>{v}</Text></View>;
}

// ================= RECIBIR =================
//
// Recibir sirve dos casos: (1) enseñar mi dirección para que me manden
// cualquier cantidad, o (2) generar una SOLICITUD DE PAGO concreta con
// monto y opcionalmente un memo. Cuando el usuario escribe un monto, el
// QR y el link "vetawallet://pay?..." dejan de ser la dirección pelada y
// pasan a ser un link pagable. Quien lo escanea desde Veta Wallet cae
// directo en Enviar con los campos rellenos.
function buildPayLink({ to, amount, memo, sym = 'ORIGEN' }) {
  const enc = encodeURIComponent;
  const q = [`to=${enc(to)}`];
  if (amount != null && amount !== '' && Number(amount) > 0) q.push(`amount=${enc(String(amount))}`);
  if (sym) q.push(`sym=${enc(sym)}`);
  if (memo) q.push(`memo=${enc(memo)}`);
  return `vetawallet://pay?${q.join('&')}`;
}

export function Receive({ nav }) {
  const toast = useToast();
  const t = useT();
  const { account } = useAccount();
  const address = account?.addr || '';

  const [amt, setAmt] = useState('');
  const [memo, setMemo] = useState('');
  const isRequest = !!amt && Number(amt) > 0;
  const link = address ? buildPayLink({ to: address, amount: isRequest ? amt : null, memo: memo.trim() || null }) : '';
  const qrValue = isRequest ? link : address;

  const copyAddr = async () => {
    hap();
    try { await Clipboard.setStringAsync(address); toast(t('recv.copied')); }
    catch (e) { toast(t('recv.copyErr'), 'error'); }
  };
  const copyLink = async () => {
    hap();
    try { await Clipboard.setStringAsync(link); toast(t('recv.linkCopied')); }
    catch (e) { toast(t('recv.copyErr'), 'error'); }
  };
  const share = async () => {
    hap();
    try {
      const message = isRequest
        ? (memo.trim()
            ? t('recv.shareMsg', { amount: amt, sym: 'ORIGEN', memo: memo.trim() })
            : t('recv.shareMsgNoMemo', { amount: amt, sym: 'ORIGEN' })) + `\n\n${link}`
        : `${t('recv.shareAddr')}\n\n${address}`;
      await Share.share({ message });
    } catch (e) {}
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('recv.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, alignItems: 'center', paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={styles.qrBox}>
          {address
            ? <QRCode value={qrValue || address} size={224} color="#04211d" backgroundColor="#ffffff" ecl="M" />
            : <Text style={{ color: '#04211d' }}>Sin dirección</Text>}
        </View>

        <Text style={{ color: C.txt2, fontSize: 12.5, marginBottom: 14, textAlign: 'center' }}>
          {isRequest ? t('recv.scanReq', { amount: amt }) : t('recv.scan')}
        </Text>

        <View style={styles.addrBox}>
          <Text style={styles.addr} numberOfLines={1}>{address || '—'}</Text>
          <Pressable onPress={copyAddr} accessibilityRole="button" accessibilityLabel={t('recv.copy')}><Icon name="copy" size={22} color={C.gold} /></Pressable>
        </View>

        {/* Solicitud de pago: monto y memo opcionales. */}
        <View style={styles.reqCard}>
          <Text style={styles.reqTitle}>{t('recv.reqTitle')}</Text>
          <Text style={styles.reqHint}>{t('recv.reqHint')}</Text>

          <Text style={styles.label}>{t('recv.reqAmt')}</Text>
          <View style={{ position: 'relative' }}>
            <TextInput
              value={amt}
              onChangeText={(v) => setAmt(normalizeAmtInput(v))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#6f938f"
              style={[styles.input, { paddingRight: 74 }]}
            />
            <Text style={styles.reqSym}>ORIGEN</Text>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>{t('recv.reqMemo')}</Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            placeholder={t('recv.reqMemoPh')}
            placeholderTextColor="#6f938f"
            maxLength={60}
            style={styles.input}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' }}>
          <Button3D
            title={t('recv.share')}
            icon="share-social"
            onPress={share}
            style={{ flex: 1 }}
          />
          {isRequest && (
            <Button3D
              title={t('recv.copyLink')}
              icon="link"
              variant="teal"
              onPress={copyLink}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ================= COMPRAR =================
// ================= COMPRAR =================
// La pasarela USDT → ORIGEN vive en el backend (endpoints /api/buy/* y
// pollers de TRC-20/BEP-20). Mientras eso no exista, la pantalla NO
// muestra direcciones reales de tesorería para evitar que un usuario
// mande USDT y no reciba nada. En su lugar aparece un aviso "en
// preparación" con la opción de que le avisemos cuando esté lista.
//
// El interruptor está aquí para volver a abrir la pantalla en una línea
// cuando el backend confirme detección de pagos.
const BUY_ENABLED = false;
const BUYABLE = ['ORIGEN'];
const PAY_CHAINS = [
  { id: 'TRC20', short: 'TRC-20', tone: '#EF4444', net: 'Tron',            addr: 'TGxSQXLJKnWUzHNyvBzzWJZHDNrbfobvSg' },
  { id: 'BEP20', short: 'BEP-20', tone: '#F0B90B', net: 'BNB Smart Chain', addr: '0xa8e20f3c6ee078bd20325693acda5047f8f6ced7' },
];

export function Buy({ nav }) {
  const t = useT();
  const toast = useToast();
  const tokens = useTokens();
  const buyable = tokens.filter((x) => BUYABLE.includes(x.s));
  const first = buyable.find((x) => x.s === 'ORIGEN') || buyable[0] || { s: 'ORIGEN', n: 'ORIGEN', price: 0 };

  // La pasarela está apagada hasta que el backend detecte pagos. Vista
  // de "en preparación" para que la tarjeta no muestre direcciones reales
  // por accidente (evitar que alguien mande USDT sin que se acredite).
  if (!BUY_ENABLED) {
    return (
      <View style={{ flex: 1, paddingTop: 6 }}>
        <Header title={t('buy.title')} onBack={() => nav.back()} />
        <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 60 }}>
          <View style={styles.soonWrap}>
            <View style={styles.soonIcon}><Icon name="construct" size={34} color={C.gold} /></View>
            <Text style={styles.soonTitle}>{t('buy.wipT')}</Text>
            <Text style={styles.soonBody}>{t('buy.wipP')}</Text>
            <View style={{ height: 20 }} />
            <Button3D title={t('buy.wipCta')} icon="qr-code" onPress={() => nav.go('receive')} style={{ alignSelf: 'stretch' }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  const [step, setStep] = useState('choose'); // 'choose' | 'pay' | 'status'
  const [tok] = useState(first); // por ahora fijo en ORIGEN
  const [amt, setAmt] = useState('');
  const [chain, setChain] = useState(PAY_CHAINS[0]);
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState('waiting'); // waiting | detected | sending | done
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Reloj para el contador de expiración (30 min).
  useEffect(() => {
    if (step === 'choose') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const usd = parseAmt(amt);
  const priced = tok.price > 0;
  const qty = priced ? usd / tok.price : 0;
  const canGo = priced && usd >= 5;

  function buildOrder() {
    if (!canGo) return;
    // El "código" de la orden son 4 decimales aleatorios sumados al monto.
    // Ej: 100 USDT → 100.0342. Así el backend reconoce la orden al llegar
    // el pago aunque la red no soporte memo/tag.
    const tag = Math.floor(1000 + Math.random() * 8999);
    const exact = (usd + tag / 10000).toFixed(4);
    const id = `VW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    setOrder({ id, exact, qty, tokenSym: tok.s, tokenName: tok.n, chain, createdAt: Date.now() });
    setExpiresAt(Date.now() + 30 * 60 * 1000);
    setStatus('waiting');
    setStep('pay');
  }

  function markPaid() {
    hap();
    setStatus('detected');
    setStep('status');
    // Simulación visual del avance: cuando el backend esté conectado
    // este bloque se reemplaza por polling real al endpoint de estado.
    setTimeout(() => setStatus('sending'), 2500);
    setTimeout(() => setStatus('done'), 6000);
  }

  function cancelOrder() {
    setOrder(null);
    setStep('choose');
    setStatus('waiting');
  }

  async function copyAddr() {
    hap();
    try { await Clipboard.setStringAsync(chain.addr); toast(t('buy.addrCopied')); } catch { toast(t('recv.copyErr'), 'error'); }
  }
  async function copyAmt() {
    hap();
    try { await Clipboard.setStringAsync(order.exact); toast(t('buy.amtCopied')); } catch {}
  }

  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  // ---------- Paso 1: elegir ----------
  if (step === 'choose') {
    return (
      <View style={{ flex: 1, paddingTop: 6 }}>
        <Header title={t('buy.title')} onBack={() => nav.back()} />
        <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
          <View style={styles.testBanner}>
            <Icon name="construct" size={18} color={C.gold} />
            <Text style={styles.testBannerTxt}>{t('buy.testBanner')}</Text>
          </View>

          <Text style={styles.label}>{t('buy.tokenLbl')}</Text>
          <View style={styles.tokenFixed}>
            <TokenIcon t={tok} size={44} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.selName}>{tok.n}</Text>
              {tok.price > 0 && <Text style={styles.selSub}>{money(tok.price)} / {tok.s}</Text>}
            </View>
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenBadgeTxt}>{t('buy.onlyOrigen')}</Text>
            </View>
          </View>
          <Text style={styles.tokenNote}>{t('buy.origenFirst')}</Text>

          <Text style={styles.label}>{t('buy.amtLbl')}</Text>
          <View style={styles.bigInput}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{ color: C.txt3, fontSize: 22, fontWeight: '700' }}>$</Text>
              <TextInput value={amt} onChangeText={(v) => setAmt(normalizeAmtInput(v))} placeholder="0" placeholderTextColor={C.txt3} keyboardType="decimal-pad" style={styles.amtIn} />
            </View>
            <Text style={styles.cur}>USDT</Text>
            {priced && usd > 0 && (
              <Text style={{ color: C.txt2, fontSize: 12.5, marginTop: 6, textAlign: 'center' }}>
                ≈ {qtyFmt(qty)} {tok.s}   ·   {money(tok.price)} / {tok.s}
              </Text>
            )}
            {!priced && (
              <Text style={{ color: C.down, fontSize: 12, marginTop: 6, textAlign: 'center' }}>{t('buy.noPrice')}</Text>
            )}
          </View>

          <Text style={styles.label}>{t('buy.chainLbl')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
            {PAY_CHAINS.map((c) => {
              const on = chain.id === c.id;
              return (
                <Pressable key={c.id} onPress={() => { hap(); setChain(c); }} style={[styles.chainPill, on && { borderColor: c.tone, backgroundColor: 'rgba(201,169,97,0.08)' }]}>
                  <View style={[styles.chainDot, { backgroundColor: c.tone }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.chainTxt, on && { color: C.txt }]}>{c.short}</Text>
                    <Text style={styles.chainSub}>{c.net}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: C.txt3, fontSize: 11.5, marginBottom: 16, lineHeight: 16 }}>
            {t('buy.chainHint')}
          </Text>

          <View style={styles.summary}>
            <Row k={t('buy.recibes')} v={priced && usd ? `${qtyFmt(qty)} ${tok.s}` : '—'} />
            <Row k={t('buy.pagas')} v={usd ? `${usd.toFixed(2)} USDT` : '—'} />
            <Row k={t('buy.tarifa')} v={t('buy.tarifaFree')} />
          </View>

          <Button3D title={t('buy.next')} icon="arrow-forward" disabled={!canGo} onPress={() => { hap(); buildOrder(); }} />
          {usd > 0 && usd < 5 && (
            <Text style={{ color: C.down, fontSize: 12, marginTop: 10, textAlign: 'center' }}>{t('buy.min')}</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ---------- Paso 2: pagar ----------
  if (step === 'pay') {
    return (
      <View style={{ flex: 1, paddingTop: 6 }}>
        <Header title={t('buy.payTitle')} onBack={cancelOrder} />
        <ScrollView contentContainerStyle={{ padding: 22, alignItems: 'center', paddingBottom: 40 }}>
          <View style={styles.testBanner}>
            <Icon name="construct" size={18} color={C.gold} />
            <Text style={styles.testBannerTxt}>{t('buy.testBanner')}</Text>
          </View>

          <View style={styles.orderTag}>
            <Text style={styles.orderTagK}>{t('buy.orderId')}</Text>
            <Text style={styles.orderTagV}>{order.id}</Text>
          </View>

          <View style={styles.qrBox}>
            <QRCode value={chain.addr} size={224} color="#04211d" backgroundColor="#ffffff" ecl="M" />
          </View>

          <Text style={styles.payHead}>{t('buy.payHead', { chain: chain.short, net: chain.net })}</Text>

          <View style={styles.payAmtBox}>
            <Text style={styles.payAmtK}>{t('buy.payAmt')}</Text>
            <Pressable onPress={copyAmt} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text style={styles.payAmtV}>{order.exact}</Text>
              <Text style={styles.payAmtCur}>USDT</Text>
              <Icon name="copy" size={18} color={C.gold} />
            </Pressable>
            <Text style={styles.payAmtHint}>{t('buy.payAmtHint')}</Text>
          </View>

          <View style={styles.addrBox}>
            <View style={[styles.chainDot, { backgroundColor: chain.tone, marginRight: 4 }]} />
            <Text style={styles.addr} numberOfLines={1}>{chain.addr}</Text>
            <Pressable onPress={copyAddr}><Icon name="copy" size={22} color={C.gold} /></Pressable>
          </View>

          <View style={styles.timer}>
            <Icon name="time" size={16} color={C.gold} />
            <Text style={styles.timerTxt}>{t('buy.expiresIn', { mm, ss })}</Text>
          </View>

          <Button3D title={t('buy.paid')} icon="checkmark-circle" onPress={markPaid} style={{ alignSelf: 'stretch', marginTop: 20 }} />
          <Pressable onPress={cancelOrder} style={{ paddingVertical: 14, alignSelf: 'center' }}>
            <Text style={{ color: C.txt3, fontWeight: '600' }}>{t('buy.cancel')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ---------- Paso 3: estado ----------
  const steps = [
    { s: 'waiting',  label: t('buy.st.waiting')  },
    { s: 'detected', label: t('buy.st.detected') },
    { s: 'sending',  label: t('buy.st.sending')  },
    { s: 'done',     label: t('buy.st.done')     },
  ];
  const curIdx = steps.findIndex((x) => x.s === status);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('buy.statusTitle')} onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <View style={styles.testBanner}>
          <Icon name="construct" size={18} color={C.gold} />
          <Text style={styles.testBannerTxt}>{t('buy.testBanner')}</Text>
        </View>

        <View style={{ alignItems: 'center', marginVertical: 20 }}>
          {status !== 'done' ? (
            <ActivityIndicator size="large" color={C.gold} />
          ) : (
            <View style={styles.doneIc}><Icon name="checkmark" size={40} color={C.darkText} /></View>
          )}
          <Text style={{ color: C.gold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: 18 }}>
            {status === 'done' ? t('buy.doneKicker') : t('buy.progKicker')}
          </Text>
          <Text style={{ color: C.txt, fontSize: 24, fontWeight: '800', marginTop: 6 }}>
            {qtyFmt(order.qty)} {order.tokenSym}
          </Text>
          <Text style={{ color: C.txt2, fontSize: 13, marginTop: 2 }}>
            {order.exact} USDT · {order.chain.short}
          </Text>
        </View>

        <View style={styles.pasos}>
          {steps.map((sd, i) => {
            const done = i < curIdx || status === 'done';
            const nowStep = i === curIdx && status !== 'done';
            return (
              <View key={sd.s} style={styles.paso}>
                <View style={[styles.pasoIc, done && styles.pasoOk, nowStep && styles.pasoNow]}>
                  {done ? <Icon name="checkmark" size={14} color={C.darkText} /> : <View style={styles.pasoDot} />}
                </View>
                <Text style={[styles.pasoTxt, (done || nowStep) && { color: C.txt }]}>{sd.label}</Text>
              </View>
            );
          })}
        </View>

        {status === 'done' && (
          <Button3D title={t('buy.goHome')} icon="wallet" onPress={() => nav.go('home')} style={{ marginTop: 22 }} />
        )}
      </ScrollView>
    </View>
  );
}

// ================= SWAP =================
// Regla: SIEMPRE se intercambia desde ORIGEN hacia otro token. Nunca al
// revés (ni ONDK→ORIGEN, ni AUKA→ORIGEN, etc.). ORIGEN es la puerta de
// entrada al ecosistema: se compra con USDT y desde allí se convierte a
// los demás. Por eso el origen del swap está fijo (no se puede cambiar)
// y el selector del destino oculta ORIGEN.
export function Swap({ nav }) {
  const tokens = useTokens();
  const t = useT();
  const origen = tokens.find((x) => x.s === 'ORIGEN') || { s: 'ORIGEN', n: 'ORIGEN', qty: 0, price: 0, logo: true };
  const destinos = tokens.filter((x) => x.s !== 'ORIGEN');
  const destPref = destinos.find((x) => x.s === 'ONDK') || destinos[0] || origen;
  const [to, setTo] = useState(destPref);
  const [amt, setAmt] = useState('');
  const [pick, setPick] = useState(false);
  const rate = origen.price && to.price ? origen.price / to.price : 0;
  const out = (parseAmt(amt) * rate);
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('swap.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <SwapBox label={t('swap.from')} balance={qtyFmt(origen.qty)} token={origen} value={amt} onChange={setAmt} locked />
        <View style={styles.flipStatic}><Icon name="arrow-down" size={20} color={C.gold} /></View>
        <SwapBox label={t('swap.toLbl')} balance={qtyFmt(to.qty)} token={to} value={out ? out.toFixed(4) : ''} readOnly onPickToken={() => setPick(true)} />
        <Card style={{ padding: 14, marginTop: 16 }}>
          <Row k={t('swap.rate')} v={rate ? `1 ${origen.s} = ${rate.toFixed(4)} ${to.s}` : '—'} />
          <Row k={`${t('swap.price')} ${origen.s}`} v={money(origen.price)} />
          <Row k={`${t('swap.price')} ${to.s}`} v={money(to.price)} />
        </Card>
        <View style={styles.notice}>
          <Icon name="information-circle" size={18} color={C.gold} />
          <Text style={styles.noticeTxt}>{t('swap.onlyOrigen')}</Text>
        </View>
        <View style={styles.notice}>
          <Icon name="information-circle" size={18} color={C.gold} />
          <Text style={styles.noticeTxt}>{t('swap.soon')}</Text>
        </View>
        <Button3D title={t('swap.cta')} icon="swap-horizontal" disabled onPress={() => {}} />
      </ScrollView>
      <TokenPicker visible={pick} tokens={destinos.length ? destinos : [destPref]} onClose={() => setPick(false)} onPick={setTo} />
    </View>
  );
}

function SwapBox({ label, balance, token, value, onChange, readOnly, onPickToken, locked }) {
  const tr = useT();
  const TokenChip = locked ? View : Pressable;
  return (
    <Card style={{ padding: 17 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: C.txt3, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: C.txt3, fontSize: 12 }}>{tr('swap.balance')}: {balance}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TextInput value={value} onChangeText={onChange ? (v) => onChange(normalizeAmtInput(v)) : undefined} editable={!readOnly} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#3a5c58" style={styles.swapIn} />
        <TokenChip onPress={onPickToken ? () => { hap(); onPickToken(); } : undefined} style={styles.swapTok}>
          <TokenIcon t={token} size={28} />
          <Text style={{ color: C.txt, fontWeight: '700', marginLeft: 7 }}>{token.s}</Text>
          {!locked && <Icon name="chevron-down" size={16} color={C.txt2} style={{ marginLeft: 3 }} />}
        </TokenChip>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  contactsRow: { flexDirection: 'row', gap: 12, paddingBottom: 16, paddingRight: 4 },
  emptyPick: { color: C.txt3, fontSize: 12.5, textAlign: 'center', paddingVertical: 26, lineHeight: 18 },
  // ---- ficha de revisión / envío ----
  revBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  revCard: { backgroundColor: '#06282B', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line, padding: 22, paddingBottom: 32 },
  revT: { fontSize: 17, fontWeight: '800', color: C.txt, textAlign: 'center', marginBottom: 16 },
  revMonto: { alignItems: 'center', marginBottom: 18, gap: 4 },
  revAmt: { color: C.txt, fontSize: 28, fontWeight: '800', marginTop: 8 },
  revUsd: { color: C.txt2, fontSize: 13 },
  revRows: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4 },
  revErr: { color: C.down, fontSize: 12.5, marginTop: 9, lineHeight: 18 },
  revCancel: { alignItems: 'center', paddingVertical: 13, marginTop: 4 },
  revCancelTxt: { color: C.txt3, fontSize: 13.5, fontWeight: '600' },
  revEspera: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 18, lineHeight: 17 },
  // Autorización biométrica dentro de la ficha de revisión.
  bioCirc: {
    width: 88, height: 88, borderRadius: 30,
    backgroundColor: 'rgba(201,169,97,0.12)',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.32)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 15,
  },
  bioHint: { color: C.txt2, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16, paddingHorizontal: 10 },
  bioAlt: { color: C.gold, fontSize: 13.5, fontWeight: '600' },
  activarFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  casilla: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  activarTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  // Faltaban desde antes: los Text que las referencian se dibujaban sin estilo.
  rrV: { color: C.txt, fontSize: 13, fontWeight: '600' },
  barBg: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: C.gold },
  pasos: { marginTop: 18, gap: 13 },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pasoIc: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  pasoOk: { backgroundColor: C.up },
  pasoNow: { backgroundColor: 'rgba(201,169,97,0.16)' },
  pasoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.txt3 },
  pasoTxt: { color: C.txt3, fontSize: 13.5, fontWeight: '600' },
  errBox: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: 'rgba(240,119,107,0.10)', borderWidth: 1, borderColor: 'rgba(240,119,107,0.32)', borderRadius: 16, padding: 14 },
  errBoxTxt: { color: C.txt, fontSize: 12.5, lineHeight: 18, flex: 1 },
  doneBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  doneCard: { width: '100%', backgroundColor: '#06282B', borderRadius: 26, borderWidth: 1, borderColor: C.line, padding: 24, alignItems: 'center' },
  doneIc: { width: 74, height: 74, borderRadius: 37, backgroundColor: C.up, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: C.up, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  doneT: { color: C.txt, fontSize: 19, fontWeight: '800' },
  doneAmt: { color: C.gold, fontSize: 27, fontWeight: '800', marginTop: 8 },
  doneUsd: { color: C.txt2, fontSize: 13, marginTop: 2 },
  doneP: { color: C.txt2, fontSize: 12.5, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  doneRows: { alignSelf: 'stretch', marginTop: 18, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, paddingHorizontal: 14 },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  doneK: { color: C.txt3, fontSize: 12 },
  doneV: { color: C.txt, fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  contactItem: { alignItems: 'center', gap: 6, width: 58 },
  contactAv: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  contactScan: { backgroundColor: C.gold, borderColor: 'transparent' },
  contactFav: { backgroundColor: 'rgba(201,169,97,0.16)' },
  contactIni: { color: C.gold, fontWeight: '800', fontSize: 15 },
  contactName: { fontSize: 10.5, color: C.txt2, textAlign: 'center' },
  scanBtn: { width: 52, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  ojito: { position: 'absolute', right: 12, top: 0, bottom: 0, width: 34, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },
  selector: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 12, marginBottom: 13 },
  selName: { fontSize: 14, fontWeight: '600', color: C.txt },
  selSub: { fontSize: 12, color: C.txt3 },
  bigInput: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 14 },
  amtIn: { color: C.txt, fontWeight: '800', fontSize: 42, textAlign: 'center', minWidth: 120, padding: 0 },
  cur: { color: C.gold, fontWeight: '600', fontSize: 14, marginTop: 4 },
  rr: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rrK: { color: C.txt2, fontSize: 12.5 }, rrV: { color: C.txt, fontSize: 12.5, fontWeight: '600' },
  errTxt: { color: C.down, fontSize: 12.5, marginBottom: 12 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'rgba(201,169,97,0.08)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 14, padding: 12, marginVertical: 14 },
  noticeTxt: { flex: 1, color: C.txt2, fontSize: 12, lineHeight: 17 },
  qrBox: { width: 276, height: 276, backgroundColor: '#fff', borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginVertical: 16, padding: 16 },
  addrBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 15, marginBottom: 16, width: '100%' },
  addr: { flex: 1, color: C.txt, fontSize: 13 },
  soonWrap: { alignItems: 'center', paddingTop: 40 },
  soonIcon: { width: 84, height: 84, borderRadius: 26, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  soonTitle: { color: C.txt, fontWeight: '800', fontSize: 20, marginBottom: 10, textAlign: 'center' },
  soonBody: { color: C.txt2, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  flip: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.panel3, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: -14, zIndex: 3 },
  swapIn: { flex: 1, color: C.txt, fontWeight: '800', fontSize: 28, padding: 0 },
  swapTok: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel2, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line2, padding: 22, paddingBottom: 34 },
  grab: { width: 40, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.txt, textAlign: 'center', marginBottom: 14 },
  pick: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 15, padding: 12, marginBottom: 8 },
  pickName: { fontSize: 14, fontWeight: '600', color: C.txt }, pickSub: { fontSize: 11.5, color: C.txt3 },
  // ---- pasarela de compra ----
  testBanner: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'rgba(201,169,97,0.10)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', borderRadius: 14, padding: 12, marginBottom: 18, width: '100%' },
  testBannerTxt: { flex: 1, color: C.txt2, fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  chainPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  chainDot: { width: 10, height: 10, borderRadius: 5 },
  chainTxt: { color: C.txt2, fontWeight: '700', fontSize: 13 },
  chainSub: { color: C.txt3, fontSize: 10.5, marginTop: 1 },
  summary: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 },
  orderTag: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 12, marginBottom: 4 },
  orderTagK: { color: C.txt3, fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  orderTagV: { color: C.gold, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  payHead: { color: C.txt2, fontSize: 13, textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  payAmtBox: { alignSelf: 'stretch', backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 18, padding: 16, alignItems: 'center', marginBottom: 14 },
  payAmtK: { color: C.txt3, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  payAmtV: { color: C.gold, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  payAmtCur: { color: C.gold, fontSize: 14, fontWeight: '700' },
  payAmtHint: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 8, lineHeight: 16 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  timerTxt: { color: C.txt2, fontSize: 12.5, fontWeight: '600' },
  tokenFixed: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 12, marginBottom: 6 },
  tokenBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(201,169,97,0.14)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.35)' },
  tokenBadgeTxt: { color: C.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  tokenNote: { color: C.txt3, fontSize: 11, lineHeight: 15, marginBottom: 14, paddingHorizontal: 2 },
  flipStatic: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.panel3, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: -14, zIndex: 3 },
  // Solicitar pago
  reqCard: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(6,40,42,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(201,169,97,0.32)',
    borderRadius: 18,
    padding: 16,
    marginTop: 6,
  },
  reqTitle: { color: C.txt, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  reqHint: { color: C.txt3, fontSize: 11.5, lineHeight: 16, marginBottom: 12 },
  reqSym: { position: 'absolute', right: 15, top: 15, color: C.gold, fontWeight: '800', fontSize: 12.5, letterSpacing: 1 },
});
