import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, TextInput, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, Card, Field, hap, useToast, useAccount } from '../ui';
import { genesis, revisarFormaMrz } from '../genesis';
import { setPassport } from '../accounts';
import { getSeed } from '../api';
import PedirClave from '../PedirClave';
import { useT } from '../i18n';

// ---------------- GENESIS ID: verificación de identidad ----------------
//
// La app NO verifica a nadie: aporta los datos y espera la decisión de una
// persona del equipo de cumplimiento. El GID solo aparece cuando esa decisión
// existe.
//
// Cuatro pasos: datos → documento → rostro → revisión.

const PAISES_FRECUENTES = ['HND', 'GTM', 'SLV', 'NIC', 'CRI', 'PAN', 'MEX', 'USA', 'ESP', 'COL'];

export function Kyc({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account, login: loginAccount } = useAccount();

  const [paso, setPaso] = useState('cargando');
  const [estado, setEstado] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // Paso 1 — datos declarados
  const [nombre, setNombre] = useState(account?.name || '');
  const [nacimiento, setNacimiento] = useState('');
  const [pais, setPais] = useState(account?.country || 'HND');

  // Paso 2 — documento
  const [mrz, setMrz] = useState('');
  const [problemas, setProblemas] = useState([]);

  // Paso 3 — rostro
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camara = useRef(null);

  async function guardarEnCuenta(vista) {
    if (!account || !vista?.genesisUid) return;
    const actualizada = await setPassport(account.email, {
      genesisUid: vista.genesisUid,
      fullName: vista.fullName,
      email: vista.email,
      walletAddress: account.addr,
      status: 'verified',
      issuedAt: vista.actualizadaEn,
    });
    if (actualizada) loginAccount(actualizada);
  }

  async function refrescar(avisar) {
    const e = await genesis.estado();
    if (!e || e.error) {
      // 'sin-puente' (el backend no tiene la ruta) y 'sin-clave' (la tiene
      // pero sin GENESIS_API_KEY) son el mismo problema visto por el usuario:
      // falta terminar de configurar el servidor. Se dice, en vez de dejarle
      // creer que es su conexión.
      const faltaConfig = e?.code === 'sin-puente' || e?.code === 'sin-clave';
      setFallo(faltaConfig
        ? { code: 'config', detail: t('gen.errBridge') }
        : { code: e?.code || 'red', detail: e?.error });
      setPaso('fallo');
      return null;
    }
    setFallo(null);
    setEstado(e);
    if (e.verificada) {
      await guardarEnCuenta(e);
      // Ata esta cuenta al GID para que valga en el resto del ecosistema.
      genesis.vincular().catch(() => {});
      setPaso('listo');
    } else {
      setPaso(e.paso);
      if (avisar && e.paso === 'revision') toast(t('gen.stillPending'));
    }
    return e;
  }

  useEffect(() => { refrescar(false); }, []);

  // ---- paso 1 ----
  async function enviarDatos() {
    if (!nombre.trim()) { toast(t('gen.needName')); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) { toast(t('gen.needDob')); return; }
    hap(); setOcupado(true);
    const r = await genesis.declararDatos({
      nombreCompleto: nombre.trim(),
      fechaNacimiento: nacimiento,
      paisResidencia: pais,
    });
    setOcupado(false);
    if (!r || r.error) { toast(r?.error || t('gen.errNetT')); return; }
    setEstado(r); setPaso('documento');
  }

  // ---- paso 2 ----
  async function enviarDocumento() {
    hap(); setOcupado(true); setProblemas([]);
    const r = await genesis.enviarDocumento(mrz);
    setOcupado(false);
    if (r.aceptable) { setEstado(r.estado); setProblemas([]); setPaso('rostro'); return; }
    // Los dígitos de control detectan al instante un error de transcripción,
    // así que se dice exactamente qué falla en vez de "inténtelo de nuevo".
    setProblemas(r.problemas?.length ? r.problemas : [t('gen.docBad')]);
  }

  // ---- paso 3 ----
  async function tomarFoto() {
    if (!permiso?.granted) { const p = await pedirPermiso(); if (!p?.granted) return; }
    hap(); setOcupado(true);
    try {
      const foto = await camara.current?.takePictureAsync({ base64: true, quality: 0.5, skipProcessing: true });
      if (!foto?.base64) { toast(t('gen.errPhoto')); setOcupado(false); return; }
      const r = await genesis.enviarSelfie(`data:image/jpeg;base64,${foto.base64}`);
      setOcupado(false);
      if (!r || r.error) { toast(r?.error || t('gen.errNetT')); return; }
      setEstado(r); setPaso('revision');
    } catch (e) { setOcupado(false); toast(t('gen.errPhoto')); }
  }

  useEffect(() => {
    if (paso !== 'listo') return;
    const timer = setTimeout(() => nav.go('passport'), 2400);
    return () => clearTimeout(timer);
  }, [paso]);

  const forma = revisarFormaMrz(mrz);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('gen.title')} sub={t('gen.sub')} onBack={() => nav.go(account ? 'settings' : 'auth')} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {paso !== 'cargando' && paso !== 'listo' && paso !== 'fallo' && (
          <Pasos actual={paso} />
        )}

        {paso === 'cargando' && (
          <View style={st.center}>
            <ActivityIndicator size="large" color={C.gold} />
            <Text style={[st.body, { textAlign: 'center', marginTop: 18 }]}>{t('gen.processing')}</Text>
          </View>
        )}

        {/* ---- 1. datos ---- */}
        {paso === 'datos' && (
          <>
            <View style={st.heroIcon}><Icon name="person" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepDataT')}</Text>
            <Text style={st.body}>{t('gen.stepDataP')}</Text>
            <Field label={t('prof.name')} value={nombre} onChangeText={setNombre}
              placeholder={t('gen.nameHint')} autoCapitalize="words" />
            <Field label={t('gen.dob')} value={nacimiento} onChangeText={setNacimiento}
              placeholder="1990-05-23" keyboardType="numbers-and-punctuation" maxLength={10} />
            <Text style={st.label}>{t('gen.country')}</Text>
            <View style={st.paises}>
              {PAISES_FRECUENTES.map((p) => (
                <Pressable key={p} onPress={() => { hap(); setPais(p); }}
                  style={[st.pais, pais === p && st.paisSel]}>
                  <Text style={[st.paisTxt, pais === p && st.paisTxtSel]}>{p}</Text>
                </Pressable>
              ))}
            </View>
            <Button3D title={t('gen.continue')} icon="arrow-forward" onPress={enviarDatos}
              disabled={ocupado} style={{ marginTop: 18 }} />
            <Text style={st.foot}>{t('gen.dataFoot')}</Text>
          </>
        )}

        {/* ---- 2. documento ---- */}
        {paso === 'documento' && (
          <>
            <View style={st.heroIcon}><Icon name="card" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepDocT')}</Text>
            <Text style={st.body}>{t('gen.stepDocP')}</Text>

            <Card style={{ padding: 14, marginBottom: 14 }}>
              <Text style={st.cardTitle}>{t('gen.mrzWhere')}</Text>
              <Text style={st.mrzEjemplo} numberOfLines={2}>
                P&lt;HNDPEREZ&lt;&lt;JUAN&lt;CARLOS&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;{'\n'}
                A123456781HND9005236M3012159&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;06
              </Text>
            </Card>

            <Text style={st.label}>{t('gen.mrzLabel')}</Text>
            <TextInput
              value={mrz}
              onChangeText={setMrz}
              multiline
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              placeholder={'P<HND...\nA12345678...'}
              placeholderTextColor="#6f938f"
              style={st.mrzInput}
            />
            {mrz.trim().length > 0 && (
              <Text style={[st.mrzPista, forma.ok && { color: C.up }]}>
                {forma.ok ? t('gen.mrzOk', { f: forma.formato }) : forma.motivo}
              </Text>
            )}

            {problemas.length > 0 && (
              <View style={st.warn}>
                <Icon name="alert-circle" size={20} color="#F0776B" />
                <View style={{ flex: 1 }}>
                  {problemas.map((p, i) => <Text key={i} style={st.warnTxt}>{p}</Text>)}
                </View>
              </View>
            )}

            <Button3D title={t('gen.sendDoc')} icon="shield-checkmark" onPress={enviarDocumento}
              disabled={ocupado || !forma.ok} style={{ marginTop: 16 }} />
            <Text style={st.foot}>{t('gen.docFoot')}</Text>
          </>
        )}

        {/* ---- 3. rostro ---- */}
        {paso === 'rostro' && (
          <>
            <View style={st.heroIcon}><Icon name="happy" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepFaceT')}</Text>
            <Text style={st.body}>{t('gen.stepFaceP')}</Text>

            {!permiso?.granted ? (
              <Button3D title={t('gen.allowCam')} icon="camera" onPress={pedirPermiso} />
            ) : (
              <>
                <View style={st.camaraCaja}>
                  <CameraView ref={camara} style={{ flex: 1 }} facing="front" />
                </View>
                <Button3D title={t('gen.takePhoto')} icon="camera" onPress={tomarFoto}
                  disabled={ocupado} style={{ marginTop: 16 }} />
              </>
            )}
            <Text style={st.foot}>{t('gen.faceFoot')}</Text>
          </>
        )}

        {/* ---- 4. revisión ---- */}
        {paso === 'revision' && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
              <Icon name="time" size={30} color="#FBBF24" />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.reviewT')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.reviewP')}</Text>
            <Button3D title={t('gen.recheck')} icon="refresh" onPress={() => refrescar(true)}
              style={{ alignSelf: 'stretch', marginTop: 10 }} />
            <Pressable onPress={() => nav.go(account ? 'home' : 'auth')} style={st.retry}>
              <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.back')}</Text>
            </Pressable>
          </View>
        )}

        {/* ---- rechazada / suspendida ---- */}
        {(paso === 'rechazada' || paso === 'suspendida') && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(240,119,107,0.12)' }]}>
              <Icon name="close-circle" size={30} color="#F0776B" />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>
              {paso === 'rechazada' ? t('gen.rejectedT') : t('gen.suspendedT')}
            </Text>
            <Text style={[st.body, { textAlign: 'center' }]}>
              {paso === 'rechazada' ? t('gen.rejectedP') : t('gen.suspendedP')}
            </Text>
            <Pressable onPress={() => nav.go('help')} style={st.retry}>
              <Icon name="help-circle" size={14} color={C.gold} />
              <Text style={st.retryTxt}>{t('gen.contact')}</Text>
            </Pressable>
          </View>
        )}

        {/* ---- fallo de comunicación ---- */}
        {paso === 'fallo' && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(240,119,107,0.12)' }]}>
              <Icon name="cloud-offline" size={30} color="#F0776B" />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>
              {fallo?.code === 'auth' ? t('gen.errAuthT') : t('gen.errNetT')}
            </Text>
            <Text style={[st.body, { textAlign: 'center' }]}>
              {fallo?.code === 'auth' ? t('gen.errAuthP') : t('gen.errNetP')}
            </Text>
            {fallo?.detail ? <Text style={st.detail}>{fallo.detail}</Text> : null}
            <Button3D title={t('gen.recheck')} icon="refresh" onPress={() => { setPaso('cargando'); refrescar(false); }}
              style={{ alignSelf: 'stretch', marginTop: 16 }} />
            <Pressable onPress={() => nav.go(account ? 'home' : 'auth')} style={st.retry}>
              <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.back')}</Text>
            </Pressable>
          </View>
        )}

        {/* ---- verificada ---- */}
        {paso === 'listo' && (
          <View style={st.center}>
            <View style={st.doneBadge}><Icon name="checkmark" size={46} color={C.up} /></View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.doneT')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.doneP')}</Text>
            {estado?.genesisUid && (
              <View style={st.uidChip}>
                <Icon name="finger-print" size={14} color={C.gold} />
                <Text style={st.uidTxt}>{estado.genesisUid}</Text>
              </View>
            )}
            <Button3D title={t('gen.seePass')} icon="arrow-forward" onPress={() => nav.go('passport')}
              style={{ alignSelf: 'stretch', marginTop: 20 }} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const ORDEN = ['datos', 'documento', 'rostro', 'revision'];

function Pasos({ actual }) {
  const i = ORDEN.indexOf(actual);
  return (
    <View style={st.barra}>
      {ORDEN.map((p, n) => (
        <View key={p} style={[st.tramo, n <= i && st.tramoHecho]} />
      ))}
    </View>
  );
}



// ---------------- Oferta de emparejamiento tras crear la cuenta ----------------
export function GenesisOffer({ nav }) {
  const t = useT();
  const { account } = useAccount();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('gen.title')} sub={t('gen.sub')} onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ padding: 22, flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center' }}>
          <LinearGradient colors={G.gold} style={st.offerIcon}>
            <Icon name="checkmark" size={38} color={C.darkText} />
          </LinearGradient>
          <Text style={[st.h1, { textAlign: 'center' }]}>{t('offer.title')}</Text>
          <Text style={[st.body, { textAlign: 'center' }]}>{t('offer.p')}</Text>
          {account?.addr ? (
            <View style={st.uidChip}>
              <Icon name="wallet" size={14} color={C.gold} />
              <Text style={st.uidTxt}>{account.addr.slice(0, 8)}…{account.addr.slice(-6)}</Text>
            </View>
          ) : null}
          <Button3D title={t('offer.now')} icon="finger-print" onPress={() => nav.go('kyc')} style={{ alignSelf: 'stretch', marginTop: 22 }} />
          <Pressable onPress={() => { hap(); nav.go('home'); }} style={st.retry}>
            <Text style={st.retryTxt}>{t('offer.later')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------- Frase semilla (real, desde el backend) ----------------
export function SeedView({ nav }) {
  const t = useT();
  const [state, setState] = useState('hidden'); // hidden | shown | unavailable
  const [words, setWords] = useState([]);
  const [pedirPw, setPedirPw] = useState(false);

  // Se oculta sola a los 45 s, igual que el número de la tarjeta.
  useEffect(() => {
    if (state !== 'shown') return;
    const id = setTimeout(() => { setWords([]); setState('hidden'); }, 45000);
    return () => clearTimeout(id);
  }, [state]);

  // Misma contraseña que se pide para ver el PIN/número de la tarjeta: la
  // seed es lo más sensible que tiene la app, no puede quedar a un solo
  // toque de distancia si alguien agarra el teléfono desbloqueado.
  const revelar = async (password) => {
    try {
      const phrase = await getSeed(password);
      if (phrase) {
        setWords(phrase.split(/\s+/));
        setState('shown');
        // El usuario vio la seed: no hace falta seguirle recordando que la respalde.
        try { const { marcarSeedVista } = await import('../backupNudge'); marcarSeedVista(); } catch (e) {}
      } else {
        setState('unavailable');
      }
      setPedirPw(false);
      return { ok: true };
    } catch (e) {
      if (e?.status === 401) return { ok: false, msg: t('card.badPw') };
      setState('unavailable');
      setPedirPw(false);
      return { ok: true };
    }
  };

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('seed.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={st.warn}>
          <Icon name="warning" size={20} color={C.down} />
          <Text style={st.warnTxt}>{t('seed.warn')}</Text>
        </View>

        {state === 'shown' ? (
          <View style={[st.grid, { marginTop: 16, marginBottom: 18 }]}>
            {words.map((w, i) => (
              <View key={i} style={st.cell}>
                <Text style={st.cellNo}>{i + 1}</Text>
                <Text style={st.cellWord}>{w}</Text>
              </View>
            ))}
          </View>
        ) : state === 'unavailable' ? (
          <Card style={{ padding: 18, marginVertical: 16 }}>
            <Text style={{ color: C.txt, fontWeight: '700', fontSize: 15, marginBottom: 8 }}>{t('seed.webT')}</Text>
            <Text style={{ color: C.txt2, fontSize: 12.5, lineHeight: 19 }}>{t('seed.webP')}</Text>
          </Card>
        ) : (
          <View style={[st.grid, { marginTop: 16, marginBottom: 18 }]}>
            {Array.from({ length: 12 }).map((_, i) => (
              <View key={i} style={st.cell}>
                <Text style={st.cellNo}>{i + 1}</Text>
                <Text style={st.cellWord}>••••••</Text>
              </View>
            ))}
          </View>
        )}

        {state !== 'shown' && (
          <Button3D
            title={t('seed.reveal')}
            icon="eye"
            onPress={() => { hap(); setPedirPw(true); }}
          />
        )}
      </ScrollView>

      <PedirClave
        visible={pedirPw}
        titulo={t('seed.pwTitle')}
        subtitulo={t('card.pwWhy')}
        ctaTexto={t('card.reveal')}
        onCancel={() => setPedirPw(false)}
        onSubmit={revelar}
      />
    </View>
  );
}

const st = StyleSheet.create({
  label: { color: C.txt3, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3, marginBottom: 8, textTransform: 'uppercase' },

  barra: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  tramo: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.09)' },
  tramoHecho: { backgroundColor: C.gold },

  paises: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pais: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.input,
  },
  paisSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.14)' },
  paisTxt: { color: C.txt2, fontSize: 12.5, fontWeight: '600' },
  paisTxtSel: { color: C.gold },

  // La MRZ se lee y se teclea en monoespaciada: en cualquier otra tipografia
  // los '<' de relleno y los ceros se confunden y la persona se equivoca.
  mrzEjemplo: {
    color: C.txt3, fontSize: 10.5, lineHeight: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  mrzInput: {
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2, borderRadius: 13,
    color: C.txt, padding: 13, minHeight: 96, textAlignVertical: 'top',
    fontSize: 12.5, letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  mrzPista: { color: '#FBBF24', fontSize: 11.5, lineHeight: 16, marginTop: 8 },

  camaraCaja: {
    height: 320, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: C.line2, backgroundColor: '#000',
  },

  heroIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.12)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  offerIcon: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  h1: { color: C.txt, fontWeight: '800', fontSize: 22, lineHeight: 28, marginBottom: 8 },
  body: { color: C.txt2, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  cardTitle: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  rowK: { color: C.txt3, fontSize: 12.5 },
  rowV: { color: C.txt, fontSize: 12.5, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  steps: { gap: 12, marginBottom: 22 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepN: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(201,169,97,0.15)', alignItems: 'center', justifyContent: 'center' },
  stepNTxt: { color: C.gold, fontWeight: '800', fontSize: 12.5 },
  stepTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  foot: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 16 },

  center: { alignItems: 'center', paddingVertical: 30 },
  doneBadge: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(62,217,160,0.12)',
    borderWidth: 2, borderColor: C.up, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  uidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', backgroundColor: 'rgba(201,169,97,0.1)',
    borderRadius: 999, paddingHorizontal: 15, paddingVertical: 8, marginTop: 6,
  },
  uidTxt: { color: C.txt, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 12, marginTop: 4 },
  retryTxt: { color: C.gold, fontWeight: '600', fontSize: 13 },
  detail: { color: '#FBBF24', fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 10, paddingHorizontal: 6 },

  warn: {
    flexDirection: 'row', gap: 12, backgroundColor: 'rgba(240,119,107,0.08)',
    borderWidth: 1, borderColor: 'rgba(240,119,107,0.3)', borderRadius: 16, padding: 14,
    marginTop: 14, alignItems: 'center',
  },
  warnTxt: { color: '#f4b4ac', fontSize: 12.5, flex: 1, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: {
    width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2,
    borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
  },
  cellNo: { color: C.gold, fontSize: 12, opacity: 0.7, width: 16, textAlign: 'right' },
  cellWord: { color: C.txt, fontSize: 14, fontWeight: '500' },
});
