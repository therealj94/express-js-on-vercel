import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Animated, Easing, Modal, TextInput, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { C, G } from '../theme';
import { LOGO_ORDEN, Button3D, ListRow, Toggle, SectionHead, Skeleton, useToast, useAccount, hap } from '../ui';
import { qtyFmt, money } from '../data';
import { cardApi, depositApi, sinTarjeta } from '../api';
import { useT } from '../i18n';
import PedirClave from '../PedirClave';

// ============================================================
// Tarjeta Visa · pantalla conectada al backend
//
// La tarjeta es un producto REAL emitido contra CryptoMate. Todo lo que se
// ve acá viene del servidor: los últimos 4 dígitos, el estado, el saldo, los
// límites y los movimientos. Nada se inventa ni se deriva localmente.
//
// Dos reglas que se respetan a lo largo del archivo:
//
//   1. Los controles hacen lo que dicen. El interruptor de congelar llama a
//      /cards/freeze y, si el servidor falla, vuelve atrás y lo dice. Antes
//      era un booleano local con un aviso de confirmación: el usuario creía
//      haber congelado una tarjeta que seguía gastando.
//
//   2. Los datos sensibles (número completo, CVV, PIN) se piden con la
//      contraseña cada vez, se muestran un momento y NUNCA se guardan en el
//      dispositivo ni quedan en el estado más de lo necesario.
// ============================================================

// Segundos que los datos sensibles quedan visibles antes de ocultarse solos.
const OCULTAR_TRAS = 45;

const estadoTarjeta = (s) => String(s || '').toUpperCase();
const estaCongelada = (s) => estadoTarjeta(s) === 'FROZEN';

export default function CardScreen({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account } = useAccount();

  const [fase, setFase] = useState('cargando');   // cargando · error · sinTarjeta · lista
  const [card, setCard] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setFase('cargando');
    try {
      const d = await cardApi.mine();
      setCard(d);
      setFase('lista');
    } catch (e) {
      // 404 no es un fallo: es "todavía no tenés tarjeta". Se distingue para
      // no mostrarle un error a alguien que simplemente no la ha pedido.
      if (sinTarjeta(e)) { setCard(null); setFase('sinTarjeta'); return; }
      setErrMsg(mensajeDeError(e, t));
      setFase('error');
    }
  }, [t]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => nav.go('home')}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('card.back')}
        >
          <Icon name="chevron-back" size={20} color={C.txt} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>{t('card.title')}</Text>
        </View>
        <Pressable
          onPress={() => { hap(); cargar({ silencioso: true }); }}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('card.refresh')}
        >
          <Icon name="sync" size={19} color={C.txt} />
        </Pressable>
      </View>

      {fase === 'cargando' && <Cargando t={t} />}
      {fase === 'error' && <ErrorEstado msg={errMsg} onRetry={() => cargar()} t={t} />}
      {fase === 'sinTarjeta' && <SolicitarTarjeta nav={nav} onEmitida={() => cargar()} t={t} toast={toast} />}
      {fase === 'lista' && card && (
        <TarjetaViva
          card={card}
          account={account}
          nav={nav}
          t={t}
          toast={toast}
          onCambio={(parcial) => setCard((c) => ({ ...c, ...parcial }))}
        />
      )}
    </View>
  );
}

// Traduce el código de error de la capa de red a algo que se pueda leer.
function mensajeDeError(e, t) {
  const porCodigo = {
    timeout: t('card.errTimeout'),
    red: t('card.errNet'),
    auth: t('card.errAuth'),
    servidor: t('card.errServer'),
    config: t('auth.errServer'),
  };
  return porCodigo[e?.code] || e?.message || t('card.errGeneric');
}

// ---------- estado de carga ----------
//
// Consultar la tarjeta tarda unos tres segundos de verdad: el backend pregunta
// al emisor por el estado, por el saldo y por el precio de ORIGEN. En vez de
// barras grises, se dibuja la propia tarjeta con un destello recorriéndola y
// se aprovechan esos segundos para contar algo del ecosistema.
const FRASES_CARGA = ['card.load1', 'card.load2', 'card.load3', 'card.load4'];

function Cargando({ t }) {
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const barrido = useRef(new Animated.Value(0)).current;

  // Destello que recorre la tarjeta, como la luz sobre el metal.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(barrido, { toValue: 1, duration: 1700, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [barrido]);

  // Las frases entran y salen con desvanecido; al terminar cada ciclo pasa
  // a la siguiente. El guard evita seguir animando tras desmontar.
  useEffect(() => {
    let vivo = true;
    const ciclo = () => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.delay(1850),
        Animated.timing(fade, { toValue: 0, duration: 360, useNativeDriver: true }),
      ]).start(() => {
        if (!vivo) return;
        setI((n) => (n + 1) % FRASES_CARGA.length);
        ciclo();
      });
    };
    ciclo();
    return () => { vivo = false; };
  }, [fade]);

  const desplazo = barrido.interpolate({ inputRange: [0, 1], outputRange: [-260, 400] });

  return (
    <View style={{ paddingHorizontal: 22 }}>
      <View style={styles.cargaCard}>
        <LinearGradient colors={G.blackCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
          <Circuito />
          <Image source={LOGO_ORDEN} resizeMode="contain" style={[styles.monograma, { opacity: 0.4 }]} />
          <View style={styles.cardIn}>
            <View style={styles.cardTop}>
              <Text style={styles.premium}>PREMIUM</Text>
              <Text style={[styles.visa, { opacity: 0.55 }]}>VISA</Text>
            </View>
          </View>
          <Animated.View style={[styles.destello, { transform: [{ translateX: desplazo }, { rotate: '18deg' }] }]}>
            <LinearGradient
              colors={['rgba(201,169,97,0)', 'rgba(234,215,156,0.16)', 'rgba(201,169,97,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </LinearGradient>
      </View>

      <Animated.Text style={[styles.cargaFrase, { opacity: fade }]}>
        {t(FRASES_CARGA[i])}
      </Animated.Text>

      <View style={styles.cargaPuntos}>
        {FRASES_CARGA.map((_, n) => (
          <View key={n} style={[styles.cargaPunto, n === i && styles.cargaPuntoOn]} />
        ))}
      </View>
    </View>
  );
}

// ---------- estado de error ----------

function ErrorEstado({ msg, onRetry, t }) {
  return (
    <View style={styles.centro}>
      <Icon name="cloud-offline" size={34} color={C.txt3} />
      <Text style={styles.centroT}>{t('card.errTitle')}</Text>
      <Text style={styles.centroP}>{msg}</Text>
      <View style={{ height: 16 }} />
      <Button3D title={t('card.retry')} onPress={() => { hap(); onRetry(); }} />
    </View>
  );
}

// ---------- todavía sin tarjeta: flujo de solicitud ----------
function SolicitarTarjeta({ nav, onEmitida, t, toast }) {
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [faltaKyc, setFaltaKyc] = useState(false);
  const [pedirClave, setPedirClave] = useState(false);
  /* Cuánto cuesta emitir y si se está emitiendo. `null` mientras se pregunta:
     no se enseña un precio inventado ni se da por abierta la emisión. El
     servidor NO dice cuántas quedan —es interno— así que acá no hay nada de
     más que enseñar. */
  const [emision, setEmision] = useState(null);

  useEffect(() => {
    let vivo = true;
    cardApi.emision()
      .then((d) => { if (vivo) setEmision(d); })
      .catch(() => { if (vivo) setEmision({ error: true }); });
    return () => { vivo = false; };
  }, []);

  /* Emitir cuesta dinero, así que se firma con la contraseña — el mismo gesto
     que ya pide ver el PIN o mandar ORIGEN. Se abre DESPUÉS de aceptar los
     términos: pedir la clave antes de que la persona haya dicho que sí es
     pedirla para nada. */
  const continuar = () => {
    if (!acepta) { toast(t('card.reqNeedTerms'), 'error'); return; }
    if (emision && emision.abierta === false) { toast(t('card.cerrada'), 'error'); return; }
    hap();
    setPedirClave(true);
  };

  const pedir = async (password) => {
    setEnviando(true);
    try {
      await cardApi.request({ acceptedTerms: true, password });
      setPedirClave(false);
      toast(t('card.reqOk'), 'success');
      onEmitida();
      return { ok: true };
    } catch (e) {
      /* Cada final tiene su texto, porque lo que hay que hacer en cada uno es
         distinto — y porque después de un cobro, «error» a secas se lee como
         «perdí el dinero», que es justo lo que no pasó. */
      const porMotivo = {
        EMISION_CERRADA: t('card.cerrada'),
        PAGADA_SIN_EMITIR: t('card.pagadaSinEmitir'),
        PAGO_EN_CURSO: t('card.pagoEnCurso'),
        COMPRA_EN_CURSO: t('card.pagoEnCurso'),
        CLAVE_MALA: t('card.badPw'),
        FALTA_CLAVE: t('card.badPw'),
      };
      if (e?.motivo === 'CLAVE_MALA' || e?.motivo === 'FALTA_CLAVE') {
        return { ok: false, msg: t('card.badPw') };
      }
      setPedirClave(false);
      if (e?.motivo && porMotivo[e.motivo]) toast(porMotivo[e.motivo], 'error');
      // 403 = el backend exige Genesis ID aprobado antes de emitir.
      else if (e?.status === 403) { setFaltaKyc(true); toast(t('card.reqNeedKyc'), 'error'); }
      else toast(e?.message || mensajeDeError(e, t), 'error');
      // El precio y el cupo pueden haber cambiado mientras tanto.
      cardApi.emision().then(setEmision).catch(() => {});
      return { ok: true };
    } finally { setEnviando(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }}>
      <View style={styles.pitchCard}>
        <LinearGradient colors={G.blackCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pitchBg}>
          <Circuito />
          <Image source={LOGO_ORDEN} resizeMode="contain" style={styles.monogramaPitch} />
          <View style={styles.pitchIn}>
            <View style={styles.cardTop}>
              <Text style={styles.premium}>PREMIUM</Text>
              <Text style={styles.visa}>VISA</Text>
            </View>
            <Text style={styles.pitchT}>{t('card.pitchT')}</Text>
          </View>
        </LinearGradient>
      </View>

      <Text style={styles.pitchP}>{t('card.pitchP')}</Text>

      {faltaKyc && (
        <View style={styles.kycBox}>
          <Icon name="shield-checkmark" size={20} color={C.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.kycT}>{t('card.kycT')}</Text>
            <Text style={styles.kycP}>{t('card.kycP')}</Text>
          </View>
        </View>
      )}
      {faltaKyc && (
        <>
          <View style={{ height: 12 }} />
          <Button3D title={t('card.kycCta')} onPress={() => { hap(); nav.go('kyc'); }} />
          <View style={{ height: 10 }} />
        </>
      )}

      <Pressable
        onPress={() => { hap(); setAcepta(!acepta); }}
        style={styles.termsRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acepta }}
        accessibilityLabel={t('card.terms')}
      >
        <View style={[styles.checkbox, acepta && { backgroundColor: C.gold, borderColor: C.gold }]}>
          {acepta && <Icon name="checkmark" size={13} color={C.darkText} />}
        </View>
        <Text style={styles.termsTxt}>{t('card.terms')}</Text>
      </Pressable>

      {/* EL PRECIO, ANTES DEL BOTÓN. Emitir cuesta 5 USD y se pagan en ORIGEN;
          enterarse de eso después de aceptar los términos es la peor forma de
          enterarse. Las dos cifras, porque la persona piensa en dólares y
          paga en ORIGEN. */}
      <View style={styles.precioBox}>
        {!emision ? (
          <Text style={styles.precioCargando}>{t('card.leyendoPrecio')}</Text>
        ) : emision.error ? (
          <Text style={styles.precioCargando}>{t('card.precioNo')}</Text>
        ) : (
          <>
            <View style={styles.precioFila}>
              <Text style={styles.precioK}>{t('card.cuesta')}</Text>
              <Text style={styles.precioV}>{money(emision.precioUsd)} USD</Text>
            </View>
            <View style={styles.precioFila}>
              <Text style={styles.precioK}>{t('card.seCobra')}</Text>
              <Text style={styles.precioV}>{qtyFmt(emision.precioOrigen)} ORIGEN</Text>
            </View>
            <Text style={styles.precioP}>{t('card.precioP')}</Text>
          </>
        )}
      </View>

      {emision?.abierta === false && (
        <View style={styles.kycBox}>
          <Icon name="information-circle" size={20} color={C.gold} />
          <Text style={[styles.kycP, { flex: 1 }]}>{t('card.cerrada')}</Text>
        </View>
      )}

      <View style={{ height: 14 }} />
      {/* El botón dice lo que va a pagar — la misma regla que la casa ya
          escribió para vender. «Solicitar mi tarjeta» era verdad cuando era
          gratis; ahora cobra, y callarlo justo en el botón es donde peor se
          ve. Sin precio leído, se queda el texto de siempre en vez de
          inventar una cifra. */}
      <Button3D
        title={enviando ? t('card.reqSending')
          : emision?.precioUsd != null ? t('card.reqCtaCon', { u: `${money(emision.precioUsd)} USD` })
          : t('card.reqCta')}
        disabled={enviando || !acepta || emision?.abierta === false}
        onPress={continuar}
      />
      {enviando && <Text style={styles.slowHint}>{t('card.reqSlow')}</Text>}

      <PedirClave
        visible={pedirClave}
        titulo={t('card.pagarTitulo')}
        subtitulo={emision
          ? t('card.pagarSub', { q: `${qtyFmt(emision.precioOrigen)} ORIGEN`, u: `${money(emision.precioUsd)} USD` })
          : ''}
        ctaTexto={t('card.reqCta')}
        onCancel={() => setPedirClave(false)}
        onSubmit={pedir}
      />
    </ScrollView>
  );
}

// ---------- tarjeta emitida ----------
function TarjetaViva({ card, account, nav, t, toast, onCambio }) {
  const rot = useRef(new Animated.Value(0)).current;
  const [volteada, setVolteada] = useState(false);
  const [congelando, setCongelando] = useState(false);

  // Datos sensibles: viven solo en memoria y se borran solos.
  const [secreto, setSecreto] = useState(null);   // { pan, cvv, expiry, panUrl }
  const [pin, setPin] = useState(null);
  const copiadoRef = useRef(null);                // último dato sensible copiado
  const [pedirPw, setPedirPw] = useState(null);   // 'pan' | 'pin' | 'crearPin' | null
  // El emisor responde 409 cuando la tarjeta todavía no tiene un PIN asignado.
  // No es que el producto no lo soporte: es que nunca se creó. En ese caso la
  // fila cambia de "Ver PIN" a "Crear PIN".
  const [sinPin, setSinPin] = useState(false);
  const [eligiendoPin, setEligiendoPin] = useState(false);
  const [pinNuevo, setPinNuevo] = useState(null);   // elegido, pendiente de autorizar

  const [movs, setMovs] = useState(null);         // null = cargando, [] = vacío
  const [movsErr, setMovsErr] = useState(false);
  const [detalle, setDetalle] = useState(null);   // movimiento abierto en la ficha
  const [avisos, setAvisos] = useState([]);       // notificaciones sin leer del emisor

  const congelada = estaCongelada(card.status);

  // Los secretos se ocultan solos: si alguien deja el teléfono abierto en
  // esta pantalla, el número completo no se queda a la vista.
  //
  // Y con ellos se limpia el portapapeles. Ocultar la pantalla no servía de
  // nada si el número o el CVV seguían pegados en el portapapeles: cualquier
  // app en primer plano puede leerlo, iOS lo sincroniza al Mac y al iPad por
  // Universal Clipboard, y en Android queda en el historial del teclado.
  // Solo se borra si lo último copiado fue nuestro, para no pisarle al
  // usuario algo que copió él por su cuenta.
  useEffect(() => {
    if (!secreto && !pin) return;
    const id = setTimeout(async () => {
      setSecreto(null); setPin(null); setVolteada(false); rot.setValue(0);
      try {
        if (copiadoRef.current) {
          const actual = await Clipboard.getStringAsync();
          if (actual && actual === copiadoRef.current) await Clipboard.setStringAsync('');
          copiadoRef.current = null;
        }
      } catch (e) {}
    }, OCULTAR_TRAS * 1000);
    return () => clearTimeout(id);
  }, [secreto, pin, rot]);

  useEffect(() => {
    let vivo = true;
    cardApi.transactions({ page: 1 })
      .then((d) => { if (vivo) setMovs(Array.isArray(d?.transactions) ? d.transactions : []); })
      .catch(() => { if (vivo) { setMovs([]); setMovsErr(true); } });
    // Los avisos son complementarios: si fallan, la pantalla sigue sirviendo.
    cardApi.notifications()
      .then((d) => { if (vivo) setAvisos(Array.isArray(d?.notifications) ? d.notifications : []); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const marcarLeidos = async () => {
    hap();
    const previos = avisos;
    setAvisos([]);                       // respuesta inmediata
    try { await cardApi.markNotificationsRead(); }
    catch (e) { setAvisos(previos); toast(mensajeDeError(e, t), 'error'); }
  };

  const voltear = () => {
    hap();
    const to = volteada ? 0 : 1;
    Animated.spring(rot, { toValue: to, useNativeDriver: true, friction: 8, tension: 10 }).start();
    setVolteada(!volteada);
  };
  const frontRot = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRot = rot.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  // Congelar de verdad. Se actualiza la UI al instante para que responda,
  // pero si el servidor rechaza se vuelve atrás y se avisa: es preferible
  // que el usuario vea el estado real a que crea que hizo algo que no pasó.
  const cambiarCongelado = async (v) => {
    if (congelando) return;
    hap();
    const previo = card.status;
    setCongelando(true);
    onCambio({ status: v ? 'FROZEN' : 'ACTIVE' });
    try {
      const r = await cardApi.setFrozen(v);
      onCambio({ status: r?.status || (v ? 'FROZEN' : 'ACTIVE') });
      toast(v ? t('card.frozenT') : t('card.activeT'), 'success');
    } catch (e) {
      onCambio({ status: previo });
      toast(t('card.freezeErr', { m: mensajeDeError(e, t) }), 'error');
    } finally { setCongelando(false); }
  };

  // La ficha se cierra sola cuando la operación termina bien. Si la
  // contraseña es incorrecta se devuelve { ok:false } para que la ficha siga
  // abierta con el error a la vista, en vez de cerrarse y obligar a empezar
  // de nuevo. Pedir el número tarda varios segundos: pasa por el emisor.
  const revelar = async (password) => {
    const tipo = pedirPw;
    try {
      if (tipo === 'crearPin') {
        await cardApi.setPin({ pin: pinNuevo, password });
        setPin(pinNuevo);           // se muestra recién creado, y se oculta solo
        setPinNuevo(null);
        setSinPin(false);
        toast(t('card.pinCreado'), 'success');
      } else if (tipo === 'pan') {
        const d = await cardApi.pan(password);
        setSecreto(d);
        if (!d?.pan && d?.panUrl) toast(t('card.panFallback'), 'info');
        else { setVolteada(true); Animated.spring(rot, { toValue: 1, useNativeDriver: true, friction: 8, tension: 10 }).start(); }
      } else {
        const d = await cardApi.pin(password);
        setPin(d?.pin || null);
        if (!d?.pin) toast(t('card.pinFallback'), 'info');
      }
      setPedirPw(null);
      return { ok: true };
    } catch (e) {
      // Contraseña incorrecta: la ficha se queda abierta y lo muestra.
      if (e?.status === 401) return { ok: false, msg: t('card.badPw') };
      // El emisor rechazó el PIN elegido: es corregible, la ficha se cierra y
      // se vuelve al selector para que elija otro.
      if (e?.status === 400 && tipo === 'crearPin') {
        setPedirPw(null);
        setEligiendoPin(true);
        toast(e?.message || t('card.pinRechazado'), 'error');
        return { ok: true };
      }
      // 409 al CONSULTAR el PIN significa que la tarjeta no tiene uno todavía.
      // No es un fallo: se ofrece crearlo.
      if (e?.status === 409) {
        if (tipo === 'pin') { setSinPin(true); toast(t('card.noPin'), 'info'); }
        else toast(t('card.noPan'), 'info');
      } else {
        toast(mensajeDeError(e, t), 'error');
      }
      setPedirPw(null);
      return { ok: true };   // cerrada a propósito: reintentar no cambia nada
    }
  };

  // Se recuerda lo último copiado para poder limpiarlo cuando venza el
  // temporizador de ocultar (ver el efecto de arriba).
  const copiar = async (valor, aviso) => {
    try {
      await Clipboard.setStringAsync(String(valor));
      copiadoRef.current = String(valor);
      hap();
      toast(aviso, 'success');
    } catch (e) {}
  };

  const titular = (card.cardHolderName || account?.name || '').toUpperCase();

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
      <Pressable onPress={voltear} style={{ height: 224 }} accessibilityRole="button" accessibilityLabel={t('card.flip')}>
        {/* ---------- frente ---------- */}
        <Animated.View style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: frontRot }] }]}>
          <LinearGradient colors={G.blackCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
            <Circuito />
            {/* El monograma es el protagonista de la tarjeta, no una marca de
                agua: va grande, centrado y a plena opacidad, ocupando la banda
                superior. Los datos se apoyan debajo para no pisarlo. */}
            <Image source={LOGO_ORDEN} resizeMode="contain" style={styles.monograma} />
            {congelada && <View style={styles.frozenVeil} />}
            <View style={styles.cardIn}>
              <View style={styles.cardTop}>
                <Text style={styles.premium}>PREMIUM</Text>
                <Text style={styles.visa}>VISA</Text>
              </View>

              <View style={styles.cardDatos}>
                <Chip />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {secreto?.pan ? formatearPan(secreto.pan) : `••••  ••••  ••••  ${card.last4 || '••••'}`}
                  </Text>
                  <View style={styles.cardBot}>
                    <View style={styles.validBloque}>
                      <Text style={styles.validK}>VALID{'\n'}THRU</Text>
                      <Text style={styles.validV}>{secreto?.expiry || '••/••'}</Text>
                    </View>
                  </View>
                  <Text style={styles.holder} numberOfLines={1}>{titular || '—'}</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ---------- reverso ---------- */}
        <Animated.View style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: backRot }] }]}>
          <LinearGradient colors={G.blackCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
            <Circuito />
            <View style={styles.magstripe} />
            <View style={styles.sigRow}>
              <View style={styles.sig} />
              {/* El CVV es lo que la gente viene a buscar acá: caja blanca,
                  dígitos negros y grandes. Solo tiene valor real si se pidió
                  con la contraseña; si no, van los puntos. */}
              <View style={styles.cvvBox}>
                <Text style={styles.cvvK}>CVV</Text>
                <Text style={styles.cvv}>{secreto?.cvv || '•••'}</Text>
              </View>
            </View>
            <View style={styles.backFoot}>
              <Text style={styles.backTxt}>{t('card.backNote')}</Text>
              <Text style={[styles.visa, { fontSize: 17 }]}>VISA</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>

      <View style={styles.hint}>
        <Icon name="sync" size={13} color={C.txt3} />
        <Text style={styles.hintTxt}>{t('card.hint')}</Text>
      </View>

      {/* Estado real que reporta el emisor, no un booleano local. */}
      <View style={styles.stateRow}>
        <View style={[styles.stateBadge, { backgroundColor: congelada ? 'rgba(240,119,107,0.13)' : 'rgba(62,217,160,0.13)' }]}>
          <Icon name={congelada ? 'snow' : 'checkmark-circle'} size={13} color={congelada ? C.down : C.up} />
          <Text style={[styles.stateTxt, { color: congelada ? C.down : C.up }]}>
            {congelada ? t('card.frozen') : t('card.active')}
          </Text>
        </View>
      </View>

      {/* Saldo — siempre en ORIGEN, nunca en dólares (regla del backend). */}
      <View style={styles.saldoBox}>
        <Text style={styles.saldoK}>{t('card.balance')}</Text>
        <Text style={styles.saldoV}>
          {card.availableOrigen != null ? `${qtyFmt(card.availableOrigen)} ORIGEN` : '—'}
        </Text>
        {card.availableOrigen == null && <Text style={styles.saldoHint}>{t('card.balanceUnknown')}</Text>}
        <Pressable onPress={() => { hap(); nav.go('fundCard'); }} style={styles.recargarBtn} accessibilityRole="button">
          <Icon name="arrow-up" size={16} color={C.darkText} />
          <Text style={styles.recargarTxt}>{t('card.recargar')}</Text>
        </Pressable>
      </View>

      {/* Comprar ORIGEN depositando USDT.
          Va aquí y no en Inicio porque es lo que se hace justo antes de
          recargar: si no te alcanza el ORIGEN, este es el camino para
          conseguir más sin salir de la sección. */}
      <ComprarOrigen nav={nav} t={t} />

      <View style={styles.group}>
        <ListRow
          first
          icon="snow"
          title={t('card.freeze')}
          sub={t('card.freezeSub')}
          onPress={() => cambiarCongelado(!congelada)}
          right={
            congelando
              ? <ActivityIndicator size="small" color={C.gold} />
              : <Toggle value={congelada} onValueChange={cambiarCongelado} />
          }
        />
        <ListRow
          icon="eye"
          title={t('card.showPan')}
          sub={t('card.showPanSub')}
          onPress={() => { hap(); setPedirPw('pan'); }}
        />
        <ListRow
          icon="lock-closed"
          title={sinPin ? t('card.crearPin') : t('card.showPin')}
          sub={pin ? `PIN · ${pin}` : (sinPin ? t('card.crearPinSub') : t('card.showPinSub'))}
          onPress={() => { hap(); if (sinPin) setEligiendoPin(true); else setPedirPw('pin'); }}
        />
        {!!pin && (
          <ListRow
            icon="create"
            title={t('card.cambiarPin')}
            sub={t('card.cambiarPinSub')}
            onPress={() => { hap(); setEligiendoPin(true); }}
          />
        )}
      </View>

      {/* Con los datos ya revelados, lo que sigue casi siempre es pegarlos en
          una tienda. Cada dato se copia por separado: pegar el número entero
          con el CVV pegado atrás no sirve en ningún formulario. */}
      {secreto?.pan && (
        <View style={styles.copiarFila}>
          <ChipCopiar icono="copy" texto={t('card.copyPan')} onPress={() => copiar(secreto.pan.replace(/\s/g, ''), t('card.copiedPan'))} />
          {!!secreto.cvv && (
            <ChipCopiar icono="copy" texto={t('card.copyCvv')} onPress={() => copiar(secreto.cvv, t('card.copiedCvv'))} />
          )}
          {!!secreto.expiry && (
            <ChipCopiar icono="copy" texto={t('card.copyExp')} onPress={() => copiar(secreto.expiry, t('card.copiedExp'))} />
          )}
        </View>
      )}
      {!!pin && (
        <View style={styles.copiarFila}>
          <ChipCopiar icono="copy" texto={t('card.copyPin')} onPress={() => copiar(pin, t('card.copiedPin'))} />
        </View>
      )}
      {(secreto || pin) && <Text style={styles.autoHide}>{t('card.autoHide', { s: OCULTAR_TRAS })}</Text>}

      {/* Límites, tal como los reporta el emisor (convertidos a ORIGEN). */}
      {(card.dailyLimit != null || card.monthlyLimit != null) && (
        <>
          <SectionHead title={t('card.limits')} />
          <View style={styles.limitBox}>
            {card.dailyLimit != null && <FilaLim k={t('card.limDaily')} v={`${qtyFmt(card.dailyLimit)} ORIGEN`} />}
            {card.weeklyLimit != null && <FilaLim k={t('card.limWeekly')} v={`${qtyFmt(card.weeklyLimit)} ORIGEN`} />}
            {card.monthlyLimit != null && <FilaLim k={t('card.limMonthly')} v={`${qtyFmt(card.monthlyLimit)} ORIGEN`} />}
          </View>
        </>
      )}

      {/* Avisos del emisor: bloqueos por velocidad, cargos declinados. El
          webhook ya los guardaba en el backend y nadie los veía nunca. */}
      {avisos.length > 0 && (
        <View style={styles.avisos}>
          {avisos.slice(0, 4).map((a, i) => (
            <View key={a._id || i} style={[styles.avisoFila, i > 0 && styles.avisoLinea]}>
              <Icon name="alert-circle" size={17} color={C.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.avisoTxt}>{a.message || a.type}</Text>
                {!!a.merchant && <Text style={styles.avisoSub}>{a.merchant}</Text>}
              </View>
            </View>
          ))}
          <Pressable onPress={marcarLeidos} style={styles.avisoBtn}>
            <Text style={styles.avisoBtnTxt}>{t('card.avisosLeidos')}</Text>
          </Pressable>
        </View>
      )}

      <SectionHead title={t('card.movs')} action={t('act.title')} onAction={() => nav.go('activity')} />
      {movs === null && <Skeleton width="100%" height={90} radius={16} />}
      {movs !== null && movs.length === 0 && (
        <View style={styles.emptyBox}>
          <Icon name="card" size={26} color={C.txt3} />
          <Text style={styles.emptyTxt}>{movsErr ? t('card.movsErr') : t('card.empty')}</Text>
        </View>
      )}
      {movs !== null && movs.length > 0 && (
        <View style={styles.group}>
          {movs.slice(0, 12).map((m, i) => (
            <Pressable
              key={m.id || i}
              onPress={() => { hap(); setDetalle(m); }}
              style={({ pressed }) => [styles.txn, i > 0 && styles.txnLine, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
              accessibilityRole="button"
              accessibilityLabel={`${m.merchant || '—'} · ${m.origenAmount != null ? qtyFmt(m.origenAmount) : ''} ORIGEN`}
            >
              <View style={styles.txnIc}><Icon name="card" size={17} color={C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnT} numberOfLines={1}>{m.merchant || '—'}</Text>
                <Text style={styles.txnD}>{fmtFecha(m.date)}{m.status ? ` · ${m.status}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.txnV}>{m.origenAmount != null ? `${qtyFmt(m.origenAmount)} ORIGEN` : '—'}</Text>
                {/* El dolar es referencia de lo que costo, no la unidad. */}
                {m.amount != null && <Text style={styles.txnUsd}>{money(m.amount)} USD</Text>}
              </View>
              <Icon name="chevron-forward" size={16} color={C.txt3} />
            </Pressable>
          ))}
        </View>
      )}

      <Pressable onPress={() => { hap(); nav.go('cardSettings'); }} style={styles.ajustesBtn}>
        <Icon name="settings-sharp" size={17} color={C.gold} />
        <Text style={styles.ajustesTxt}>{t('cset.title')}</Text>
        <Icon name="chevron-forward" size={16} color={C.txt3} />
      </Pressable>

      <DetalleMovimiento
        mov={detalle}
        t={t}
        toast={toast}
        onCerrar={() => setDetalle(null)}
      />

      <ElegirPin
        visible={eligiendoPin}
        t={t}
        onCancel={() => setEligiendoPin(false)}
        onListo={(elegido) => { setPinNuevo(elegido); setEligiendoPin(false); setPedirPw('crearPin'); }}
      />

      <PedirClave
        visible={!!pedirPw}
        titulo={
          pedirPw === 'crearPin' ? t('card.pwCrearPin')
            : pedirPw === 'pin' ? t('card.pwPin')
              : t('card.pwPan')
        }
        subtitulo={t('card.pwWhy')}
        ctaTexto={pedirPw === 'crearPin' ? t('card.pinGuardar') : t('card.reveal')}
        onCancel={() => { setPedirPw(null); setPinNuevo(null); }}
        onSubmit={revelar}
      />
    </ScrollView>
  );
}

function FilaLim({ k, v }) {
  return (
    <View style={styles.limRow}>
      <Text style={styles.limK}>{k}</Text>
      <Text style={styles.limV}>{v}</Text>
    </View>
  );
}

// ---------- detalle de un movimiento ----------
//
// La lista muestra comercio, fecha y monto. Acá se pide el detalle completo al
// emisor —divisa original, tipo de cambio, saldo antes y después— y se ofrece
// disputar el cargo, que es lo que uno busca cuando abre un movimiento que no
// reconoce.
// ---------- comprar ORIGEN con USDT ----------
// Se pide su propio saldo en vez de recibirlo por props: es una fuente
// distinta a la de la tarjeta (backend propio, no CryptoMate) y si falla no
// debe arrastrar a la pantalla entera — simplemente no se pinta el número.
function ComprarOrigen({ nav, t }) {
  const [saldo, setSaldo] = useState(null);

  useEffect(() => {
    let vivo = true;
    depositApi.balance()
      .then((d) => { if (vivo) setSaldo(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const tiene = saldo && saldo.origen > 0;

  return (
    <Pressable
      onPress={() => { hap(); nav.go('deposit'); }}
      accessibilityRole="button"
      accessibilityLabel={t('card.depA11y')}
      style={styles.depCard}>
      <View style={styles.depIc}>
        <Icon name="arrow-down" size={20} color={C.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.depT}>{t('card.depT')}</Text>
        {tiene ? (
          <>
            <Text style={styles.depV}>{qtyFmt(saldo.origen)} ORIGEN</Text>
            {saldo.usdValue != null && (
              <Text style={styles.depU}>≈ {money(saldo.usdValue)} USD</Text>
            )}
          </>
        ) : (
          <Text style={styles.depP}>{t('card.depP')}</Text>
        )}
      </View>
      <Icon name="chevron-forward" size={18} color={C.txt3} />
    </Pressable>
  );
}

function DetalleMovimiento({ mov, t, toast, onCerrar }) {
  const [full, setFull] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [disputando, setDisputando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!mov) { setFull(null); setDisputando(false); setMotivo(''); return; }
    let vivo = true;
    setCargando(true);
    cardApi.transaction(mov.id)
      .then((d) => { if (vivo) setFull(d); })
      .catch(() => {})   // el resumen de la lista alcanza si el detalle falla
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [mov]);

  const enviarDisputa = async () => {
    if (!motivo.trim()) { toast(t('mov.motivoFalta'), 'error'); return; }
    hap();
    setEnviando(true);
    try {
      await cardApi.dispute({
        transactionId: mov.id,
        reason: motivo.trim(),
        merchant: mov.merchant,
        amount: mov.origenAmount,
        date: mov.date,
      });
      toast(t('mov.disputaOk'), 'success');
      onCerrar();
    } catch (e) {
      toast(e?.message || t('card.errGeneric'), 'error');
    } finally { setEnviando(false); }
  };

  if (!mov) return null;
  const d = full || {};

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <Pressable style={styles.pinBg} onPress={enviando ? undefined : onCerrar}>
        <Pressable style={styles.pinSheet} onPress={() => {}}>
          <View style={styles.pinGrab} />

          {!disputando ? (
            <>
              <Text style={styles.movComercio} numberOfLines={2}>{mov.merchant || '—'}</Text>
              <Text style={styles.movMonto}>
                {mov.origenAmount != null ? `${qtyFmt(mov.origenAmount)} ORIGEN` : '—'}
              </Text>
              {(d.billAmountUsd ?? mov.amount) != null && (
                <Text style={styles.movEquiv}>≈ {money(d.billAmountUsd ?? mov.amount)} USD</Text>
              )}
              {cargando && <ActivityIndicator size="small" color={C.gold} style={{ marginTop: 12 }} />}

              <View style={styles.movFilas}>
                <FilaMov k={t('mov.fecha')} v={fmtFechaLarga(d.datetime || mov.date)} />
                {!!(d.status || mov.status) && <FilaMov k={t('mov.estado')} v={d.status || mov.status} />}
                {!!d.operation && <FilaMov k={t('mov.tipo')} v={d.operation} />}
                {d.transactionAmount != null && d.transactionCurrency && d.transactionCurrency !== 'ORIGEN' && (
                  <FilaMov k={t('mov.original')} v={`${d.transactionAmount} ${d.transactionCurrency}`} />
                )}
                {d.exchangeRate != null && <FilaMov k={t('mov.cambio')} v={String(d.exchangeRate)} />}
                {d.newBalance != null && <FilaMov k={t('mov.saldoDespues')} v={`${qtyFmt(d.newBalance)} ORIGEN`} />}
              </View>

              <View style={{ height: 14 }} />
              <Pressable onPress={() => { hap(); setDisputando(true); }} style={styles.disputaBtn}>
                <Icon name="alert-circle" size={16} color={C.down} />
                <Text style={styles.disputaTxt}>{t('mov.disputar')}</Text>
              </Pressable>
              <Pressable onPress={onCerrar} style={{ paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ color: C.txt3, fontSize: 13.5 }}>{t('mov.cerrar')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.pinTitulo}>{t('mov.disputarT')}</Text>
              <Text style={styles.pinSub}>{t('mov.disputarP')}</Text>
              <TextInput
                value={motivo}
                onChangeText={setMotivo}
                placeholder={t('mov.motivoPh')}
                placeholderTextColor="#6f938f"
                multiline
                numberOfLines={4}
                style={styles.motivo}
                accessibilityLabel={t('mov.motivoPh')}
              />
              <View style={{ height: 14 }} />
              <Button3D
                title={enviando ? t('clave.verificando') : t('mov.enviarDisputa')}
                disabled={enviando || !motivo.trim()}
                onPress={enviarDisputa}
              />
              <Pressable onPress={() => setDisputando(false)} style={{ paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ color: C.txt3, fontSize: 13.5 }}>{t('card.cancel')}</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilaMov({ k, v }) {
  return (
    <View style={styles.movFila}>
      <Text style={styles.movK}>{k}</Text>
      <Text style={styles.movV} numberOfLines={1}>{v}</Text>
    </View>
  );
}

function fmtFechaLarga(v) {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return '—'; }
}

// ---------- elegir un PIN ----------
//
// Solo recoge y valida el PIN. La autorización con contraseña o biometría la
// hace después PedirClave, para no duplicar ese flujo ni pedir dos cosas en la
// misma pantalla.
function ElegirPin({ visible, t, onCancel, onListo }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => { if (!visible) { setA(''); setB(''); setError(null); } }, [visible]);

  const soloDigitos = (v) => String(v).replace(/\D/g, '').slice(0, 12);

  const continuar = () => {
    if (!/^\d{4,12}$/.test(a)) { setError(t('card.pinLargo')); return; }
    if (a !== b) { setError(t('card.pinNoCoincide')); return; }
    // Secuencias y repeticiones obvias: el emisor las suele rechazar y es
    // mejor decirlo antes de gastar una llamada y la contraseña del usuario.
    if (/^(\d)\1+$/.test(a)) { setError(t('card.pinDebil')); return; }
    hap();
    onListo(a);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.pinBg} onPress={onCancel}>
        <Pressable style={styles.pinSheet} onPress={() => {}}>
          <View style={styles.pinGrab} />
          <Text style={styles.pinTitulo}>{t('card.pinTitulo')}</Text>
          <Text style={styles.pinSub}>{t('card.pinSub')}</Text>

          <Text style={styles.pinLabel}>{t('card.pinNuevo')}</Text>
          <TextInput
            value={a}
            onChangeText={(v) => { setA(soloDigitos(v)); if (error) setError(null); }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={12}
            placeholder="••••"
            placeholderTextColor="#6f938f"
            style={styles.pinInput}
            accessibilityLabel={t('card.pinNuevo')}
          />

          <Text style={styles.pinLabel}>{t('card.pinRepetir')}</Text>
          <TextInput
            value={b}
            onChangeText={(v) => { setB(soloDigitos(v)); if (error) setError(null); }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={12}
            placeholder="••••"
            placeholderTextColor="#6f938f"
            style={styles.pinInput}
            accessibilityLabel={t('card.pinRepetir')}
            onSubmitEditing={continuar}
            returnKeyType="go"
          />

          {!!error && <Text style={styles.pinErr}>{error}</Text>}

          <View style={{ height: 16 }} />
          <Button3D title={t('card.pinContinuar')} disabled={!a || !b} onPress={continuar} />
          <Pressable onPress={onCancel} style={{ paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: C.txt3, fontSize: 13.5 }}>{t('card.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- helpers ----------
const formatearPan = (pan) => String(pan).replace(/\s/g, '').replace(/(.{4})/g, '$1  ').trim();

function fmtFecha(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  } catch (e) { return ''; }
}

// Grabado de circuito en oro, como la tarjeta física: buses que entran desde
// los bordes, giran en ángulo recto y terminan en una vía. Se dibujan en dos
// intensidades — unas pocas líneas marcadas y muchas tenues — porque un patrón
// de una sola opacidad se lee como trama de fondo, no como grabado.
const BUSES = [
  'M0 30h44l18 18h58', 'M320 40h-46l-18 18h-52', 'M0 84h26l20-20h46l16 16h34',
  'M320 104h-58l-18-18h-50', 'M0 148h38l22 22h52', 'M320 162h-34l-20-20h-46',
];
const TRAZAS = [
  'M0 16h68l14 14h40', 'M320 18h-40l-16 16h-58', 'M0 50h20l16 16h54l12 12',
  'M320 66h-30l-14 14h-40', 'M0 106h34l16-16h40', 'M320 130h-52l-16 16h-30',
  'M0 172h56l16-16h36', 'M320 184h-44l-18-18h-38',
  'M82 0v18l12 12v28', 'M118 0v10l14 14', 'M206 0v24l-14 14v22',
  'M242 0v14l16 16', 'M100 200v-22l14-14v-24', 'M172 200v-14l-16-16',
  'M228 200v-30l16-16', 'M282 200v-18l-14-14v-26',
  'M46 66v46l14 14v40', 'M274 58v54l-16 16v34',
];
const VIAS = [
  [44, 30], [120, 48], [274, 40], [26, 84], [142, 80], [262, 104], [38, 148], [112, 170], [286, 162],
  [82, 18], [206, 24], [242, 14], [68, 16], [280, 18], [46, 66], [274, 58], [156, 184], [100, 178],
];

function Circuito() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 320 200" preserveAspectRatio="none">
      {TRAZAS.map((d, i) => (
        <Path key={`t${i}`} d={d} stroke="rgba(201,169,97,0.22)" strokeWidth={0.8} fill="none" />
      ))}
      {BUSES.map((d, i) => (
        <Path key={`b${i}`} d={d} stroke="rgba(223,192,120,0.52)" strokeWidth={1.3} fill="none" />
      ))}
      {VIAS.map(([cx, cy], i) => (
        <Circle key={`v${i}`} cx={cx} cy={cy} r={2.4} stroke="rgba(223,192,120,0.6)" strokeWidth={1} fill="none" />
      ))}
    </Svg>
  );
}

// El chip lleva un halo: en la tarjeta física el oro pulido rebota luz sobre
// el fondo negro. React Native no tiene degradado radial, así que se apilan
// tres capas doradas cada vez más grandes y transparentes.
function Chip() {
  return (
    <View style={styles.chipWrap}>
      <View style={[styles.halo, styles.halo3]} />
      <View style={[styles.halo, styles.halo2]} />
      <View style={[styles.halo, styles.halo1]} />
      <LinearGradient colors={['#FBF3D6', '#DEC078', '#8F7236']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chip}>
        <View style={styles.chipLine} />
        <View style={[styles.chipLine, { top: 20 }]} />
        <View style={styles.chipCol} />
      </LinearGradient>
    </View>
  );
}

// Botón de copiar un dato sensible ya revelado.
function ChipCopiar({ icono, texto, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.chipCopiar} accessibilityRole="button" accessibilityLabel={texto}>
      <Icon name={icono} size={14} color={C.gold} />
      <Text style={styles.chipCopiarTxt}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingBottom: 14, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center', fontSize: 19, fontWeight: '800', color: C.txt },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  centroT: { color: C.txt, fontSize: 16, fontWeight: '700', marginTop: 6 },
  centroP: { color: C.txt3, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  face: { position: 'absolute', top: 0, left: 0, right: 0, height: 224, borderRadius: 20, backfaceVisibility: 'hidden' },
  cardBg: { flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,169,97,0.34)' },
  cardIn: { flex: 1, paddingHorizontal: 19, paddingTop: 16, paddingBottom: 17, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  premium: { fontSize: 10.5, letterSpacing: 4.5, color: 'rgba(234,215,156,0.85)', fontWeight: '600' },
  visa: { fontSize: 21, fontWeight: '800', fontStyle: 'italic', color: C.goldHi, letterSpacing: 0.5 },
  // Protagonista: banda superior completa, a plena opacidad.
  monograma: { position: 'absolute', alignSelf: 'center', top: 36, width: '64%', height: 92, opacity: 0.95 },

  cardDatos: { flexDirection: 'row', alignItems: 'flex-end', gap: 13 },
  chipWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  halo: { position: 'absolute', borderRadius: 14 },
  halo1: { width: 56, height: 46, backgroundColor: 'rgba(223,192,120,0.20)' },
  halo2: { width: 70, height: 58, backgroundColor: 'rgba(223,192,120,0.11)' },
  halo3: { width: 86, height: 72, backgroundColor: 'rgba(223,192,120,0.06)' },
  chip: { width: 42, height: 32, borderRadius: 6, overflow: 'hidden' },
  chipLine: { position: 'absolute', left: 0, right: 0, top: 11, height: 1, backgroundColor: 'rgba(90,70,25,0.55)' },
  chipCol: { position: 'absolute', top: 0, bottom: 0, left: 15, width: 1, backgroundColor: 'rgba(90,70,25,0.55)' },

  // Relieve: una sombra oscura desplazada imita el grabado sobre el negro.
  cardNum: { fontSize: 20.5, letterSpacing: 2.4, color: C.goldHi, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 2.5 },
  cardBot: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 7 },
  validBloque: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  validK: { fontSize: 6.5, lineHeight: 8, letterSpacing: 1.2, color: 'rgba(234,215,156,0.7)', fontWeight: '700' },
  validV: { fontSize: 14, color: C.goldLt, fontWeight: '700', letterSpacing: 1.6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  k: { fontSize: 8, letterSpacing: 1.6, color: 'rgba(234,215,156,0.62)', fontWeight: '600' },
  // El titular antes iba en 12.5 y se perdía sobre el fondo. Ahora es del
  // tamaño de un dato, no de un pie de página.
  holder: { fontSize: 15, color: C.goldLt, fontWeight: '700', marginTop: 6, letterSpacing: 1.8, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  frozenVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.58)', zIndex: 2 },

  magstripe: { position: 'absolute', top: 20, left: 0, right: 0, height: 44, backgroundColor: '#080705' },
  sigRow: { position: 'absolute', top: 82, left: 19, right: 19, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sig: { flex: 1, height: 34, backgroundColor: '#EFEAE0', borderRadius: 3 },
  // Caja blanca con dígitos negros y grandes, como en la tarjeta física.
  cvvBox: { backgroundColor: '#FFFFFF', borderRadius: 4, paddingHorizontal: 11, paddingVertical: 4, alignItems: 'center', minWidth: 66 },
  cvvK: { color: '#5A5A5A', fontSize: 7.5, letterSpacing: 1.6, fontWeight: '800' },
  cvv: { color: '#0B0B0B', fontWeight: '800', letterSpacing: 2.5, fontSize: 20, lineHeight: 24 },
  backFoot: { position: 'absolute', bottom: 14, left: 19, right: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  backTxt: { fontSize: 8.5, color: 'rgba(234,215,156,0.55)', lineHeight: 12.5, flex: 1, marginRight: 10 },

  copiarFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 10, marginBottom: 4 },
  chipCopiar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipCopiarTxt: { color: C.gold, fontSize: 12.5, fontWeight: '600' },

  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, marginBottom: 14 },
  hintTxt: { fontSize: 11, color: C.txt3 },
  stateRow: { alignItems: 'center', marginBottom: 14 },
  stateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  stateTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  saldoBox: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 18, alignItems: 'center', marginBottom: 12 },
  saldoK: { fontSize: 10, letterSpacing: 1.4, color: C.txt3, fontWeight: '700' },
  saldoV: { fontSize: 26, color: C.gold, fontWeight: '800', marginTop: 6 },
  depCard: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(201,169,97,0.22)', borderRadius: 18, padding: 16 },
  depIc: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.13)', alignItems: 'center', justifyContent: 'center' },
  depT: { color: C.txt3, fontSize: 10.5, letterSpacing: 1.2, fontWeight: '700' },
  depV: { color: C.gold, fontSize: 18, fontWeight: '800', marginTop: 4 },
  depU: { color: C.txt3, fontSize: 11.5, marginTop: 2 },
  depP: { color: C.txt2, fontSize: 12.5, marginTop: 4, lineHeight: 17 },

  recargarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.gold, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 14 },
  recargarTxt: { color: C.darkText, fontSize: 13.5, fontWeight: '800' },
  txnUsd: { fontSize: 11, color: C.txt3, marginTop: 2 },
  movEquiv: { color: C.txt3, fontSize: 13.5, textAlign: 'center', marginTop: 5 },
  saldoHint: { fontSize: 11, color: C.txt3, marginTop: 5, textAlign: 'center' },

  group: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, overflow: 'hidden', marginBottom: 8 },
  autoHide: { color: C.txt3, fontSize: 11, textAlign: 'center', marginBottom: 8 },

  limitBox: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 16, marginBottom: 6 },
  limRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  limK: { color: C.txt3, fontSize: 12.5 },
  limV: { color: C.txt, fontSize: 13, fontWeight: '600' },

  emptyBox: { alignItems: 'center', gap: 8, backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 22 },
  emptyTxt: { color: C.txt3, fontSize: 12.5, textAlign: 'center' },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
  txnLine: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  txnIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  txnT: { fontSize: 14, fontWeight: '600', color: C.txt },
  txnD: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  txnV: { fontSize: 13.5, fontWeight: '600', color: C.txt },

  avisos: { backgroundColor: 'rgba(201,169,97,0.08)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.28)', borderRadius: 18, paddingHorizontal: 14, marginBottom: 14, marginTop: 4 },
  avisoFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 12 },
  avisoLinea: { borderTopWidth: 1, borderTopColor: 'rgba(201,169,97,0.18)' },
  avisoTxt: { color: C.txt, fontSize: 13, lineHeight: 18 },
  avisoSub: { color: C.txt3, fontSize: 11.5, marginTop: 2 },
  avisoBtn: { alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(201,169,97,0.18)' },
  avisoBtnTxt: { color: C.gold, fontSize: 12.5, fontWeight: '700' },

  ajustesBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 15, marginTop: 14 },
  ajustesTxt: { flex: 1, color: C.txt, fontSize: 14.5, fontWeight: '600' },

  movComercio: { color: C.txt, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  movMonto: { color: C.gold, fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  movFilas: { marginTop: 18, backgroundColor: C.panel2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  movFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  movK: { color: C.txt3, fontSize: 12.5 },
  movV: { color: C.txt, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  disputaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(240,119,107,0.35)', borderRadius: 14, paddingVertical: 13 },
  disputaTxt: { color: C.down, fontSize: 13.5, fontWeight: '700' },
  motivo: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 14.5, marginTop: 14, minHeight: 96, textAlignVertical: 'top' },

  pinBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pinSheet: { backgroundColor: '#06282B', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 28 },
  pinGrab: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2, alignSelf: 'center', marginBottom: 16 },
  pinTitulo: { color: C.txt, fontSize: 17.5, fontWeight: '800' },
  pinSub: { color: C.txt3, fontSize: 12.5, marginTop: 5, lineHeight: 18 },
  pinLabel: { color: C.txt3, fontSize: 10.5, letterSpacing: 1.4, fontWeight: '700', marginTop: 16, marginBottom: 7 },
  pinInput: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 20, letterSpacing: 6, textAlign: 'center' },
  pinErr: { color: C.down, fontSize: 12.5, marginTop: 11, textAlign: 'center' },

  cargaCard: { height: 224, marginBottom: 22 },
  destello: { position: 'absolute', top: -40, bottom: -40, width: 110 },
  cargaFrase: { color: C.goldLt, fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22, minHeight: 66, paddingHorizontal: 14 },
  cargaPuntos: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  cargaPunto: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.line2 },
  cargaPuntoOn: { backgroundColor: C.gold, width: 16 },

  pitchCard: { height: 168, marginBottom: 18 },
  pitchBg: { flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,169,97,0.28)' },
  monogramaPitch: { position: 'absolute', alignSelf: 'center', top: 30, width: '52%', height: 88, opacity: 0.17 },
  pitchIn: { flex: 1, padding: 20, justifyContent: 'space-between' },
  pitchT: { color: '#F3ECD9', fontSize: 17, fontWeight: '700', maxWidth: '85%' },
  pitchP: { color: C.txt2, fontSize: 13.5, lineHeight: 20, marginBottom: 16 },
  precioBox: {
    marginTop: 18, padding: 15, borderRadius: 16,
    backgroundColor: 'rgba(201,169,97,0.07)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.28)',
  },
  precioFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 3 },
  precioK: { color: C.txt3, fontSize: 12.5 },
  precioV: { color: C.gold, fontSize: 14, fontWeight: '700' },
  precioP: { color: C.txt3, fontSize: 11.5, lineHeight: 17, marginTop: 8 },
  precioCargando: { color: C.txt3, fontSize: 12.5, textAlign: 'center' },

  kycBox: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(201,169,97,0.25)', borderRadius: 16, padding: 15 },
  kycT: { color: C.txt, fontSize: 14, fontWeight: '700' },
  kycP: { color: C.txt3, fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  checkbox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  termsTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  slowHint: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 10 },

});
