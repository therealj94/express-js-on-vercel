// CobroPay — la caja del comercio: se escribe el monto y sale el código.
//
// Es el port de `cobro.tsx` de mytokenpay-app (Expo 51, expo-router) a este
// contenedor. Se conserva SU flujo y SUS textos —factura con referencia,
// propina por porcentaje, QR de cobro, dividir la cuenta hasta entre cuatro—
// porque es su producto; lo que cambia es la piel (oro sobre verde) y, sobre
// todo, DE DÓNDE SALE EL DINERO.
//
// Dos diferencias de fondo con el original, y el porqué:
//   1. Allí la factura se armaba desde un carrito de catálogo servido por su
//      backend. Aquí no hay ese backend enchufado (su `api.ts` corre con
//      USE_MOCK_API = true), así que pedir el monto de una vez es lo único
//      honesto: no se inventa un menú con precios que nadie mantiene.
//   2. Allí había botones de "Simular pago" que acreditaban la venta en
//      memoria. Aquí el QR es og://wallet/enviar hacia la dirección REAL del
//      comercio: quien lo escanea con Orden Global cae en ENVIAR preparado y
//      firma él. Esta pantalla no transmite nada ni puede saber sola que le
//      pagaron — por eso, en vez de fingir un "cobro acreditado", manda a
//      Cobros, donde aparece el movimiento de verdad cuando llega a la cadena.
//   3. La caja se escribe EN LEMPIRAS o EN ORIGEN, con un botón para saltar
//      entre las dos. Un comercio hondureño piensa en lempiras ("son 500"),
//      no en gramos de oro; pedirle que traduzca de cabeza es pedirle que se
//      equivoque. Pero el QR SIEMPRE lleva ORIGEN: es lo que se firma en la
//      cadena, y firmar lempiras no significa nada ahí. Por eso la lempira es
//      la MÁSCARA de entrada y el ORIGEN el número de verdad: lo tecleado se
//      convierte a ORIGEN una sola vez y TODO lo demás —propina, total,
//      división de la cuenta, QR— se calcula sobre ese ORIGEN, nunca sobre la
//      lempira. Que la cadena de cálculo no vuelva a pasar por el tipo de
//      cambio es lo que garantiza que el papel del comercio y lo que firma el
//      cliente digan lo mismo; y como el cambio se fija una vez al día
//      (cambio.js), tampoco puede moverse entre que se arma la factura y se
//      enseña el código.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Animated, BackHandler, Platform,
} from 'react-native';
import { PantallaConTeclado, CuerpoDesplazable, useCampoAuto } from '../Teclado';
import QRCode from 'react-native-qrcode-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../../theme';
import { Header, Button3D, Card, useAccount, useToast, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import { money, normalizeAmtInput, parseAmt } from '../../data';
import { aUri } from '../rutas';
import {
  useCambio, aOrigen, aLempiras, precioOrigenDe,
  origenTexto, origenFmt, lempirasFmt, aPaso, PASO,
} from '../cambio';

const TXT = {
  es: {
    titulo: 'Factura', tituloQr: 'QR de cobro', tituloDiv: 'Dividir cuenta',
    sub: 'MyTokenPay · cobra en ORIGEN',
    monto: 'MONTO EN ORIGEN', concepto: 'Concepto (opcional)', conceptoK: 'Concepto',
    conceptoPh: 'Ej. Cena, habitación 204…',
    propina: 'Propina', sinPropina: 'Sin',
    subtotal: 'Subtotal', total: 'Total',
    qrBtn: 'QR DE COBRO', qrHint: 'Escanéalo con Orden Global',
    divBtn: 'DIVIDIR CUENTA', divHint: 'Hasta 4 personas, un QR cada una',
    qrNota: 'Pídele al cliente que lo escanee con Orden Global. Cae en ENVIAR ya preparado —tu dirección y el monto— y firma en su teléfono.',
    volverFactura: 'Volver a la factura',
    entreCuantos: '¿Entre cuántos dividen {t} ORIGEN?',
    iguales: 'Partes iguales', manuales: 'Montos manuales',
    persona: 'Persona', cadaQuien: 'Cada quien paga ≈ {m} ORIGEN',
    sumaDebe: 'La suma debe dar exactamente {t} ORIGEN.',
    generar: 'GENERAR CÓDIGOS QR', cambiarDiv: 'Cambiar la división',
    errCero: 'Cada persona debe pagar un monto mayor a 0.',
    errSuma: 'La suma ({s}) debe ser igual al total ({t} ORIGEN).',
    errMonto: 'Escribe primero cuánto vas a cobrar.',
    verCobros: 'Ver mis cobros',
    llega: 'Este código no cobra solo: el cobro aparece en Cobros cuando la persona firma el envío y la cadena lo confirma.',
    sinAddrT: 'Todavía no tienes dirección de cobro',
    sinAddrP: 'Tu cuenta no devolvió una dirección de billetera, y sin ella el código no puede apuntar a ningún lado. Abre tu billetera y vuelve a entrar.',
    refer: 'Referencia',
    montoL: 'MONTO EN LEMPIRAS',
    enLempiras: 'Lempiras', enOrigen: 'ORIGEN',
    cobrasEnL: 'Escribes en lempiras · el QR cobra en ORIGEN',
    cobrasEnO: 'Escribes en ORIGEN · así viaja en el QR',
    sinCambioT: 'Sin tipo de cambio',
    sinCambio: 'No pudimos traer el cambio del lempira y no vamos a inventar uno. Escribe el monto en ORIGEN y cobra igual.',
    sinPrecio: 'El precio del ORIGEN no llegó del feed, así que no se puede convertir desde lempiras. Escribe el monto en ORIGEN.',
    equivale: 'Equivale a',
  },
  en: {
    titulo: 'Invoice', tituloQr: 'Charge QR', tituloDiv: 'Split the bill',
    sub: 'MyTokenPay · charge in ORIGEN',
    monto: 'AMOUNT IN ORIGEN', concepto: 'Note (optional)', conceptoK: 'Note',
    conceptoPh: 'E.g. Dinner, room 204…',
    propina: 'Tip', sinPropina: 'None',
    subtotal: 'Subtotal', total: 'Total',
    qrBtn: 'CHARGE QR', qrHint: 'Scan it with Orden Global',
    divBtn: 'SPLIT THE BILL', divHint: 'Up to 4 people, one QR each',
    qrNota: 'Ask the customer to scan it with Orden Global. They land on SEND already prepared —your address and the amount— and sign on their phone.',
    volverFactura: 'Back to the invoice',
    entreCuantos: 'Between how many are you splitting {t} ORIGEN?',
    iguales: 'Equal parts', manuales: 'Manual amounts',
    persona: 'Person', cadaQuien: 'Each one pays ≈ {m} ORIGEN',
    sumaDebe: 'The sum must be exactly {t} ORIGEN.',
    generar: 'GENERATE QR CODES', cambiarDiv: 'Change the split',
    errCero: 'Each person must pay an amount greater than 0.',
    errSuma: 'The sum ({s}) must equal the total ({t} ORIGEN).',
    errMonto: 'Type how much you are charging first.',
    verCobros: 'See my payments',
    llega: 'This code does not charge by itself: the payment shows in Payments once the person signs the send and the chain confirms it.',
    sinAddrT: 'You have no charging address yet',
    sinAddrP: 'Your account returned no wallet address, and without it the code has nowhere to point. Open your wallet and come back.',
    refer: 'Reference',
    montoL: 'AMOUNT IN LEMPIRAS',
    enLempiras: 'Lempiras', enOrigen: 'ORIGEN',
    cobrasEnL: 'You type in lempiras · the QR charges in ORIGEN',
    cobrasEnO: 'You type in ORIGEN · that is how it travels in the QR',
    sinCambioT: 'No exchange rate',
    sinCambio: 'We could not fetch the lempira rate and we will not make one up. Type the amount in ORIGEN and charge as usual.',
    sinPrecio: 'The ORIGEN price did not arrive from the feed, so we cannot convert from lempiras. Type the amount in ORIGEN.',
    equivale: 'Equals',
  },
};

const PROPINAS = [0, 5, 10, 15];
const MAX_PERSONAS = 4;

// ── el registro local de facturas emitidas ────────────────────────────────
// La referencia INV-… no viaja por la cadena (la transferencia no lleva memo
// visible), así que sin guardarla en ningún lado el cobro llegaba sin nada
// que lo atara a la factura. Ahora cada QR emitido se apunta AQUÍ (monto,
// referencia, concepto, cuándo): es el papel del comercio para cuadrar caja,
// y el día que el backend de MyTokenPay exista, la conciliación arranca de
// este registro. AsyncStorage y no SecureStore: no es un secreto y la lista
// crece más de los ~2 KB que SecureStore aguanta bien.
const LLAVE_FACTURAS = 'og.pay.facturas';
const TOPE_FACTURAS = 50;
async function apuntarFactura(rec) {
  try {
    const crudo = await AsyncStorage.getItem(LLAVE_FACTURAS);
    const l = JSON.parse(crudo || '[]');
    const lista = [rec, ...(Array.isArray(l) ? l : [])].slice(0, TOPE_FACTURAS);
    await AsyncStorage.setItem(LLAVE_FACTURAS, JSON.stringify(lista));
  } catch (e) {
    // el registro es un apoyo, nunca la condición para poder cobrar
  }
}

// Un TextInput que se sube solo por encima del teclado al enfocarlo. Se saca
// a componente porque `useCampoAuto` es un hook y el reparto manual crea
// hasta cuatro de estos dentro de un bucle: uno por campo, no uno para todos.
function CampoTeclado(props) {
  const campo = useCampoAuto();
  return <TextInput {...props} ref={campo.ref} onFocus={campo.onFocus} />;
}

// El monto viaja por la URI y de ahí al campo de ENVIAR como texto canónico
// con punto, que es lo que parseAmt del envío entiende sin dudar. Antes se
// recortaba a 6 decimales; ahora la caja entera trabaja a 2 (cambio.js:PASO)
// porque con lempiras de por medio la sexta cifra decimal es ruido —una
// centésima de ORIGEN anda por un cuarto de lempira— y arrastrarla solo
// servía para que la cuenta dividida no cuadrara por un decimal invisible.
const enTexto = origenTexto;
const rellena = (s, vals) => Object.keys(vals).reduce((a, k) => a.replace('{' + k + '}', vals[k]), s);

// Entrada en cascada. Solo opacity/transform ⇒ useNativeDriver: la animación
// corre en el hilo nativo y no compite con el teclado ni con el dibujo del QR.
function Entrada({ delay = 0, style, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, speed: 12, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [op, y, delay]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

function Fila({ k, v, sub, fuerte }) {
  return (
    <View style={st.fila}>
      <Text style={[st.filaK, fuerte && st.filaKF]}>{k}</Text>
      <View style={st.filaDer}>
        <Text style={[st.filaV, fuerte && st.filaVF]}>{v}</Text>
        {/* La lempira va DEBAJO del ORIGEN, no al lado: el ORIGEN es lo que
            se cobra y la lempira lo que el comercio entiende — la jerarquía
            visual tiene que decir cuál de los dos manda. */}
        {sub ? <Text style={st.filaSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function CobroPay({ nav, params }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const toast = useToast();

  const [etapa, setEtapa] = useState('factura');   // factura | qr | dividir
  // «Cóbrale 200» desde NEXUS llega como params.monto: se SIEMBRA la caja
  // con ese número para no hacérselo teclear dos veces. Solo siembra — la
  // moneda queda en la de la pantalla y el comercio puede corregir antes de
  // generar el QR, igual que si lo hubiera escrito él. Un param roto (letras,
  // tres decimales) se ignora: mejor caja vacía que un cobro malformado.
  const [monto, setMonto] = useState(() => {
    const m = String(params?.monto || '').replace(',', '.');
    return /^\d+(\.\d{1,2})?$/.test(m) ? m : '';
  });
  const [moneda, setMoneda] = useState('HNL');     // HNL | ORIGEN — en qué se TECLEA
  const [concepto, setConcepto] = useState('');
  const [propina, setPropina] = useState(0);
  const [error, setError] = useState(null);

  // Dividir la cuenta: igual que en el original, hasta cuatro personas, en
  // partes iguales o con montos escritos a mano que deben cuadrar al total.
  const [personas, setPersonas] = useState(2);
  const [manual, setManual] = useState(false);
  const [manuales, setManuales] = useState(['', '', '', '']);
  const [reparto, setReparto] = useState(null);

  // La referencia de la factura se fija UNA vez por pantalla (useState con
  // función), no en cada render: si cambiara al teclear, el QR ya enseñado
  // dejaría de corresponder al papel que el comercio tiene en la mano.
  const [referencia] = useState(() => 'INV-' + Date.now().toString(36).toUpperCase().slice(-6));

  // El QR y el reparto son etapas DENTRO de esta pantalla, no rutas: sin esto
  // el botón físico de Android se llevaría al comercio fuera de la caja de un
  // salto, en vez de devolverlo a su factura. Se registra solo cuando hay algo
  // que cerrar, y el listener más reciente gana sobre el global de App.js.
  useEffect(() => {
    if (Platform.OS !== 'android' || etapa === 'factura') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEtapa('factura'); setReparto(null); setError(null);
      return true;
    });
    return () => sub.remove();
  }, [etapa]);

  // El precio sale del portafolio real de la cuenta (el mismo priceUsd que
  // alimenta el saldo). Si el feed no lo trae, NO se enseña un equivalente
  // inventado — mejor sin dólares que con un número congelado (misma regla
  // que el resto de la billetera).
  const precio = useMemo(() => precioOrigenDe(account), [account]);
  const cambio = useCambio(lang);

  // Solo se puede teclear en lempiras si los DOS tramos del puente están:
  // el cambio del día y el precio del ORIGEN. Falta uno y el campo vuelve
  // solo a ORIGEN, que siempre se puede cobrar.
  const puedeHnl = cambio.listo && precio != null;
  useEffect(() => {
    if (!puedeHnl && moneda === 'HNL') setMoneda('ORIGEN');
  }, [puedeHnl, moneda]);
  const enHnl = moneda === 'HNL' && puedeHnl;

  // ── el número de verdad ────────────────────────────────────────────────
  // Se teclee en lo que se teclee, el subtotal se fija EN ORIGEN y ya
  // cuantizado a centésimas. De aquí en adelante nadie vuelve a mirar el
  // tipo de cambio para calcular: propina, total, división y QR salen todos
  // de este mismo número, así el papel del comercio y lo que firma el
  // cliente no se pueden separar aunque el cambio se mueva a media venta.
  const tecleado = parseAmt(monto);
  const subtotal = aPaso(enHnl ? (aOrigen(tecleado, precio) ?? 0) : tecleado);
  const propinaOr = aPaso((subtotal * propina) / 100);
  const total = aPaso(subtotal + propinaOr);

  const enDolares = (n) => (precio != null ? ' ≈ ' + money(n * precio) : '');
  // La equivalencia larga que pidió José: "L 500.00 ≈ 19.65 ORIGEN ≈ $18.64".
  // Se arma siempre desde el ORIGEN ya fijado (nunca desde lo tecleado), que
  // es lo único que el cliente va a firmar.
  const equivalencia = (o) => {
    const l = aLempiras(o, precio);
    const partes = [];
    if (l != null) partes.push(lempirasFmt(l));
    partes.push(`${origenFmt(o)} ORIGEN`);
    if (precio != null) partes.push(money(o * precio));
    return partes.join(' ≈ ');
  };
  // En lempiras a secas, para las líneas donde el ORIGEN ya está a la vista.
  const enLps = (o) => {
    const l = aLempiras(o, precio);
    return l != null ? lempirasFmt(l) : null;
  };

  const addr = account?.addr || null;

  // ── sin dirección no hay cobro posible: se dice, no se disimula ────────
  if (!addr) {
    return (
      <View style={st.screen}>
        <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
        <View style={st.vacioCentro}>
          <View style={st.vacioIc}><Icon name="qr-code" size={32} color={C.gold} /></View>
          <Text style={st.vacioT}>{t.sinAddrT}</Text>
          <Text style={st.vacioP}>{t.sinAddrP}</Text>
        </View>
      </View>
    );
  }

  // La referencia y el concepto VIAJAN en el QR: og://wallet/enviar pasa
  // todos sus params a la pantalla Enviar (rutas.js:abrir), donde el memo se
  // enseña al que paga y la ref queda en el enlace para cuando el backend
  // pueda conciliar. En la cuenta dividida cada persona lleva SU referencia
  // (INV-X-1, INV-X-2…): antes los QR de partes iguales eran IDÉNTICOS y el
  // sello por persona fingía códigos distintos que no existían.
  const uriDe = (m, refExt) => aUri('wallet/enviar', {
    to: addr, amount: enTexto(m), ref: refExt || referencia, memo: concepto.trim() || undefined,
  });

  // Partes iguales: se redondea hacia abajo y la última persona carga con el
  // sobrante, para que la suma de los QR sea EXACTAMENTE el total y nadie
  // pague de más ni el comercio cobre de menos por un decimal perdido.
  function repartoIgual(n) {
    const base = Math.floor((total / n) * PASO) / PASO;
    const filas = [];
    let acumulado = 0;
    for (let i = 0; i < n; i++) {
      const m = i === n - 1 ? aPaso(total - acumulado) : base;
      acumulado = aPaso(acumulado + m);
      filas.push({ etiqueta: `${t.persona} ${i + 1}`, monto: m });
    }
    return filas;
  }

  // Cada parte del reparto entra al registro local con SU referencia (la
  // misma que viaja en su QR): así el papel del comercio y los códigos que
  // firma cada persona cuentan la misma historia.
  function apuntarReparto(filas) {
    filas.forEach((p, i) => apuntarFactura({
      ref: `${referencia}-${i + 1}`, monto: enTexto(p.monto),
      concepto: concepto.trim(), cuando: Date.now(),
    }));
  }

  function generarReparto() {
    if (total <= 0) { setError(t.errMonto); return; }
    if (!manual) {
      const filas = repartoIgual(personas);
      apuntarReparto(filas);
      setReparto(filas); setError(null); hap(); return;
    }
    // Los montos manuales se cuantizan a centésimas ANTES de sumarse y la
    // comparación se hace en centésimas enteras: comparar floats con una
    // tolerancia dejaba pasar repartos que sumaban un pelo de más, y ese pelo
    // acababa dentro de un QR firmado.
    const montos = manuales.slice(0, personas).map((v) => aPaso(parseAmt(v)));
    if (montos.some((m) => m <= 0)) { setError(t.errCero); return; }
    const suma = aPaso(montos.reduce((a, b) => a + b, 0));
    if (Math.round(suma * PASO) !== Math.round(total * PASO)) {
      setError(rellena(t.errSuma, { s: origenFmt(suma), t: origenFmt(total) }));
      return;
    }
    setError(null); hap();
    const filas = montos.map((m, i) => ({ etiqueta: `${t.persona} ${i + 1}`, monto: m }));
    apuntarReparto(filas);
    setReparto(filas);
  }

  function irA(etapaNueva) {
    if (total <= 0) { setError(t.errMonto); toast(t.errMonto); return; }
    setError(null); hap();
    setReparto(null);
    // el QR único que se va a enseñar queda apuntado en el registro local
    if (etapaNueva === 'qr') {
      apuntarFactura({ ref: referencia, monto: enTexto(total), concepto: concepto.trim(), cuando: Date.now() });
    }
    setEtapa(etapaNueva);
  }

  const titulo = etapa === 'qr' ? t.tituloQr : etapa === 'dividir' ? t.tituloDiv : t.titulo;
  const atras = etapa === 'factura' ? nav.back : () => { setEtapa('factura'); setReparto(null); setError(null); };

  return (
    // La cabecera lleva la referencia del cobro: tiene que quedarse a la
    // vista mientras se teclea el monto, así que es fija y solo se desplaza
    // el cuerpo. El monto y el concepto se suben solos al enfocarlos.
    <PantallaConTeclado desplaza={false} style={st.screen}>
      <Header title={titulo} sub={`${t.refer} ${referencia}`} onBack={atras} />
      <CuerpoDesplazable contentContainerStyle={st.dentro}>

        {/* ══ FACTURA: monto, concepto y propina ══════════════════════════ */}
        {etapa === 'factura' && (
          <>
            <Entrada delay={0}>
              <View style={st.etiFila}>
                <Text style={st.eti}>{enHnl ? t.montoL : t.monto}</Text>
                {/* El botón de moneda solo aparece cuando hay con qué
                    convertir: ofrecer "lempiras" y que al tocarlo no pase
                    nada sería peor que no ofrecerlo. */}
                {puedeHnl ? (
                  <Pressable
                    onPress={() => { hap(); setMoneda(enHnl ? 'ORIGEN' : 'HNL'); setMonto(''); setError(null); }}
                    accessibilityRole="button" style={st.swap}>
                    <Icon name="swap-horizontal" size={14} color={C.gold} />
                    <Text style={st.swapTxt}>{enHnl ? t.enOrigen : t.enLempiras}</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={st.montoCaja}>
                <Text style={st.montoSigno}>{enHnl ? 'L' : 'Ø'}</Text>
                <CampoTeclado
                  value={monto}
                  onChangeText={(v) => { setMonto(normalizeAmtInput(v)); setError(null); }}
                  keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.txt3}
                  style={st.montoInput} accessibilityLabel={enHnl ? t.montoL : t.monto}
                />
              </View>

              {/* La equivalencia va SIEMPRE debajo, no solo cuando se teclea
                  en lempiras: el comercio cobra en ORIGEN pero piensa en
                  lempiras, y necesita ver las dos caras del mismo monto sin
                  tocar nada. */}
              {subtotal > 0 ? <Text style={st.equiv}>{equivalencia(subtotal)}</Text> : null}
              <Text style={st.bajoCampo}>{enHnl ? t.cobrasEnL : t.cobrasEnO}</Text>
              {/* Sin cambio del día no se ofrece lempiras y se DICE por qué. */}
              {!puedeHnl ? (
                <Text style={st.avisoTenue}>{precio == null ? t.sinPrecio : t.sinCambio}</Text>
              ) : null}
            </Entrada>

            <Entrada delay={80}>
              <Text style={[st.eti, { marginTop: 18 }]}>{t.concepto}</Text>
              <CampoTeclado
                value={concepto} onChangeText={setConcepto}
                placeholder={t.conceptoPh} placeholderTextColor={C.txt3}
                style={st.texto} maxLength={60}
              />
            </Entrada>

            <Entrada delay={150}>
              <Text style={[st.eti, { marginTop: 18 }]}>{t.propina}</Text>
              <View style={st.chips}>
                {PROPINAS.map((p) => {
                  const on = propina === p;
                  return (
                    <Pressable key={p} onPress={() => { hap(); setPropina(p); }}
                      accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={[st.chip, on && st.chipOn]}>
                      <Text style={[st.chipTxt, on && st.chipTxtOn]}>{p === 0 ? t.sinPropina : `${p}%`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Entrada>

            <Entrada delay={220}>
              <Card style={st.resumen}>
                <Fila k={t.subtotal} v={`${origenFmt(subtotal)} ORIGEN`} sub={enLps(subtotal)} />
                <Fila k={`${t.propina} (${propina}%)`} v={`${origenFmt(propinaOr)} ORIGEN`} sub={enLps(propinaOr)} />
                {concepto.trim() ? <Fila k={t.conceptoK} v={concepto.trim()} /> : null}
                <View style={st.linea} />
                <Fila k={t.total} v={`${origenFmt(total)} ORIGEN${enDolares(total)}`} sub={enLps(total)} fuerte />
                {cambio.pie ? <Text style={st.pie}>{cambio.pie}</Text> : null}
              </Card>
            </Entrada>

            {error ? <Entrada delay={0}><Text style={st.error}>{error}</Text></Entrada> : null}

            <Entrada delay={290}>
              <Button3D title={t.qrBtn} icon="qr-code" onPress={() => irA('qr')} style={{ marginTop: 18 }} />
              <Text style={st.bajoBoton}>{t.qrHint}</Text>
              <Button3D title={t.divBtn} icon="people" variant="teal" onPress={() => irA('dividir')} style={{ marginTop: 14 }} />
              <Text style={st.bajoBoton}>{t.divHint}</Text>
            </Entrada>
          </>
        )}

        {/* ══ QR ÚNICO ════════════════════════════════════════════════════ */}
        {etapa === 'qr' && (
          <Entrada delay={0} style={{ alignItems: 'center' }}>
            {/* El titular es el ORIGEN porque es lo que va dentro del código
                y lo que el cliente va a firmar; la lempira queda debajo como
                lectura, no como la cifra que manda. */}
            <Text style={st.granMonto}>{origenFmt(total)} <Text style={st.moneda}>ORIGEN</Text></Text>
            <Text style={st.equiv}>{equivalencia(total)}</Text>
            {cambio.pie ? <Text style={st.pie}>{cambio.pie}</Text> : null}
            {concepto.trim() ? <Text style={st.conceptoQr}>{concepto.trim()}</Text> : null}

            {/* El QR va sobre blanco puro a propósito: sobre el verde de la
                casa muchos lectores fallan por falta de contraste. */}
            <View style={st.qrBlanco}>
              <QRCode value={uriDe(total)} size={228} color="#04211d" backgroundColor="#ffffff" ecl="M" />
            </View>

            <Text style={st.nota}>{t.qrNota}</Text>
            <Text style={st.notaTenue}>{t.llega}</Text>

            <Pressable onPress={() => { hap(); nav.go('pay-actividad'); }} style={st.enlace}>
              <Icon name="pulse" size={15} color={C.gold} />
              <Text style={st.enlaceTxt}>{t.verCobros}</Text>
            </Pressable>
            <Pressable onPress={() => { hap(); setEtapa('factura'); }} style={st.enlace}>
              <Icon name="chevron-back" size={15} color={C.txt2} />
              <Text style={[st.enlaceTxt, { color: C.txt2 }]}>{t.volverFactura}</Text>
            </Pressable>
          </Entrada>
        )}

        {/* ══ DIVIDIR: elegir el reparto ══════════════════════════════════ */}
        {etapa === 'dividir' && !reparto && (
          <>
            <Entrada delay={0}>
              <Card style={st.resumen}>
                <Text style={st.divTitulo}>{rellena(t.entreCuantos, { t: origenFmt(total) })}</Text>
                <Text style={st.equiv}>{equivalencia(total)}</Text>
                <View style={[st.chips, { justifyContent: 'center', marginTop: 14 }]}>
                  {[2, 3, MAX_PERSONAS].map((n) => {
                    const on = personas === n;
                    return (
                      <Pressable key={n} onPress={() => { hap(); setPersonas(n); setError(null); }}
                        accessibilityRole="button" accessibilityState={{ selected: on }}
                        style={[st.chipN, on && st.chipOn]}>
                        <Icon name="people" size={15} color={on ? C.darkText : C.txt2} />
                        <Text style={[st.chipTxt, on && st.chipTxtOn]}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={st.modos}>
                  <Pressable onPress={() => { hap(); setManual(false); setError(null); }} style={[st.modo, !manual && st.modoOn]}>
                    <Text style={[st.modoTxt, !manual && st.modoTxtOn]}>{t.iguales}</Text>
                  </Pressable>
                  <Pressable onPress={() => { hap(); setManual(true); setError(null); }} style={[st.modo, manual && st.modoOn]}>
                    <Text style={[st.modoTxt, manual && st.modoTxtOn]}>{t.manuales}</Text>
                  </Pressable>
                </View>

                {manual ? (
                  <View style={{ marginTop: 6 }}>
                    {Array.from({ length: personas }).map((_, i) => (
                      <View key={i} style={st.manualFila}>
                        <Text style={st.manualEti}>{t.persona} {i + 1}</Text>
                        <CampoTeclado
                          value={manuales[i]}
                          onChangeText={(v) => {
                            const otros = manuales.slice();
                            otros[i] = normalizeAmtInput(v);
                            setManuales(otros); setError(null);
                          }}
                          keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.txt3}
                          style={st.manualInput}
                        />
                        <Text style={st.manualUnidad}>ORIGEN</Text>
                      </View>
                    ))}
                    <Text style={st.notaTenue}>{rellena(t.sumaDebe, { t: origenFmt(total) })}</Text>
                  </View>
                ) : (
                  <>
                    <Text style={st.previo}>
                      {rellena(t.cadaQuien, { m: origenFmt(aPaso(total / personas)) })}
                    </Text>
                    <Text style={st.equiv}>{equivalencia(aPaso(total / personas))}</Text>
                  </>
                )}
                {cambio.pie ? <Text style={st.pie}>{cambio.pie}</Text> : null}
              </Card>
            </Entrada>

            {error ? <Entrada delay={0}><Text style={st.error}>{error}</Text></Entrada> : null}

            <Entrada delay={80}>
              <Button3D title={t.generar} icon="qr-code" onPress={generarReparto} style={{ marginTop: 18 }} />
            </Entrada>
          </>
        )}

        {/* ══ DIVIDIR: un QR por persona ══════════════════════════════════ */}
        {etapa === 'dividir' && reparto && (
          <>
            {reparto.map((p, i) => (
              <Entrada key={i} delay={i * 90}>
                <View style={st.persona}>
                  <View style={st.qrChico}>
                    {/* cada QR lleva SU referencia (INV-X-1, INV-X-2…): el
                        sello de abajo dice exactamente lo que hay dentro del
                        código, no un número decorativo */}
                    <QRCode value={uriDe(p.monto, `${referencia}-${i + 1}`)} size={124} color="#04211d" backgroundColor="#ffffff" ecl="M" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.personaEti}>{p.etiqueta}</Text>
                    <Text style={st.personaMonto}>{origenFmt(p.monto)} <Text style={st.moneda}>ORIGEN</Text></Text>
                    <Text style={st.usdChico}>{equivalencia(p.monto)}</Text>
                    <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.sello}>
                      <Text style={st.selloTxt}>{referencia}-{i + 1}</Text>
                    </LinearGradient>
                  </View>
                </View>
              </Entrada>
            ))}
            <Entrada delay={reparto.length * 90}>
              <Text style={st.notaTenue}>{t.llega}</Text>
              <Pressable onPress={() => { hap(); setReparto(null); }} style={st.enlace}>
                <Icon name="chevron-back" size={15} color={C.txt2} />
                <Text style={[st.enlaceTxt, { color: C.txt2 }]}>{t.cambiarDiv}</Text>
              </Pressable>
            </Entrada>
          </>
        )}
      </CuerpoDesplazable>
    </PantallaConTeclado>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },

  eti: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginBottom: 8 },
  etiFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  swap: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel,
  },
  swapTxt: { color: C.gold, fontSize: 11.5, fontWeight: '700' },
  montoCaja: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 16,
    paddingHorizontal: 16,
  },
  montoSigno: { color: C.gold, fontSize: 20, fontWeight: '700', marginRight: 8 },
  montoInput: {
    flex: 1, paddingVertical: 14, color: C.txt, fontSize: 30, textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  equiv: {
    color: C.goldLt, fontSize: 12.5, textAlign: 'center', marginTop: 9,
    fontVariant: ['tabular-nums'],
  },
  bajoCampo: { color: C.txt3, fontSize: 11, textAlign: 'center', marginTop: 6 },
  avisoTenue: { color: C.txt2, fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  // El pie del cambio va tenue a propósito: tiene que estar SIEMPRE a la
  // vista pero sin competir con el monto. Es una garantía, no un titular.
  pie: { color: C.txt3, fontSize: 10.5, textAlign: 'center', marginTop: 10 },
  texto: {
    backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, color: C.txt, fontSize: 14.5,
  },
  usdChico: { color: C.txt3, fontSize: 11.5, marginTop: 2, fontVariant: ['tabular-nums'] },

  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 13,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel,
  },
  chipN: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: 13, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel,
  },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipTxt: { color: C.txt2, fontSize: 13, fontWeight: '700' },
  chipTxtOn: { color: C.darkText },

  resumen: { padding: 16, marginTop: 18, borderWidth: 1, borderColor: C.line2 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 6 },
  filaK: { color: C.txt2, fontSize: 12.5, flexShrink: 1 },
  filaKF: { color: C.txt, fontSize: 14.5, fontWeight: '700' },
  filaDer: { flexShrink: 1, alignItems: 'flex-end' },
  filaV: { color: C.txt, fontSize: 12.5, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] },
  filaVF: { color: C.goldLt, fontSize: 15.5, fontWeight: '800' },
  filaSub: { color: C.txt3, fontSize: 11, textAlign: 'right', marginTop: 2, fontVariant: ['tabular-nums'] },
  linea: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 8 },

  error: { color: C.down, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  bajoBoton: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 7 },

  granMonto: { color: C.txt, fontSize: 34, fontWeight: '200', marginTop: 4, fontVariant: ['tabular-nums'] },
  moneda: { fontSize: 14, color: C.gold, fontWeight: '700' },
  conceptoQr: { color: C.txt2, fontSize: 13, marginTop: 6, textAlign: 'center' },
  qrBlanco: { backgroundColor: '#fff', padding: 16, borderRadius: 20, marginTop: 18 },
  qrChico: { backgroundColor: '#fff', padding: 9, borderRadius: 14 },
  nota: { color: C.txt2, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 16, maxWidth: 300 },
  notaTenue: { color: C.txt3, fontSize: 11.5, lineHeight: 18, textAlign: 'center', marginTop: 10, maxWidth: 320, alignSelf: 'center' },

  enlace: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center', paddingVertical: 12 },
  enlaceTxt: { color: C.gold, fontSize: 13, fontWeight: '600' },

  divTitulo: { color: C.txt, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  modos: {
    flexDirection: 'row', gap: 5, borderWidth: 1, borderColor: C.line2, borderRadius: 13,
    padding: 4, marginTop: 14, marginBottom: 12,
  },
  modo: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  modoOn: { backgroundColor: C.panel3 },
  modoTxt: { color: C.txt3, fontSize: 12.5, fontWeight: '600' },
  modoTxtOn: { color: C.txt },
  manualFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  manualEti: { color: C.txt2, fontSize: 12.5, width: 80 },
  manualInput: {
    flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 11,
    paddingHorizontal: 12, paddingVertical: 9, color: C.txt, fontSize: 14.5, textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  manualUnidad: { color: C.txt3, fontSize: 10.5, fontWeight: '700', width: 50 },
  previo: { color: C.txt, fontSize: 13.5, fontWeight: '600', textAlign: 'center', marginTop: 4 },

  persona: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 13, marginTop: 12,
  },
  personaEti: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  personaMonto: { color: C.txt, fontSize: 21, fontWeight: '300', marginTop: 3, fontVariant: ['tabular-nums'] },
  sello: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  selloTxt: { color: C.darkText, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  vacioCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  vacioIc: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: 'rgba(201,169,97,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  vacioT: { color: C.txt, fontWeight: '800', fontSize: 18, textAlign: 'center' },
  vacioP: { color: C.txt2, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
});
