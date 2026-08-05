import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, TextInput, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, Card, Field, hap, useToast, useAccount } from '../ui';
import { genesis, revisarFormaMrz } from '../genesis';
import { leerDeFoto, puedeEscanear } from '../mrzOcr';
import { FRECUENTES, buscarPaises, nombrePais } from '../paises';
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

export function Kyc({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account, login: loginAccount } = useAccount();

  const [paso, setPaso] = useState('cargando');
  const [estado, setEstado] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // Paso 1 — datos declarados
  //
  // La fecha se pide en tres casillas y no en un campo con formato. Tenía que
  // escribirse exactamente «1990-05-23»: un guion de menos y el servidor
  // respondía que no coincidía con el documento, sin forma de volver atrás a
  // corregirlo. Tres números con teclado numérico no se pueden escribir mal.
  const [nombre, setNombre] = useState(account?.name || '');
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');
  const [pais, setPais] = useState(account?.country || 'HND');
  const [buscaPais, setBuscaPais] = useState('');
  const [eligiendoPais, setEligiendoPais] = useState(false);
  const refMes = useRef(null);
  const refAnio = useRef(null);

  const nacimiento = (dia && mes && anio)
    ? `${anio.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
    : '';

  /** ¿Es una fecha que existe de verdad? El 31 de febrero no. */
  const fechaValida = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) return false;
    const [a, m, d] = nacimiento.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return false;
    const edad = (Date.now() - f.getTime()) / 31557600000;
    return edad >= 18 && edad <= 120;
  })();

  // Paso 2 — documento
  const [mrz, setMrz] = useState('');
  const [problemas, setProblemas] = useState([]);
  const [escaneando, setEscaneando] = useState(false);
  const camaraDoc = useRef(null);

  // Paso 3 — rostro y prueba de vida
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camara = useRef(null);
  const [reto, setReto] = useState(null);
  const [gesto, setGesto] = useState(0);
  const [fotogramas, setFotogramas] = useState([]);

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
    if (!fechaValida) { toast(t('gen.needDob')); return; }
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

  // ---- paso 2: leer la MRZ con la cámara ----
  //
  // La foto NO sale del teléfono: el reconocimiento es local y lo único que
  // viaja es el texto. Es lo que permite que la pantalla prometa «nunca la foto
  // de tu documento» y sea verdad.

  async function abrirEscaner() {
    if (!permiso?.granted) { const p = await pedirPermiso(); if (!p?.granted) return; }
    hap(); setProblemas([]); setEscaneando(true);
  }

  async function escanearDocumento() {
    hap(); setOcupado(true);
    try {
      const foto = await camaraDoc.current?.takePictureAsync({ quality: 1, skipProcessing: true });
      if (!foto?.uri) { toast(t('gen.errPhoto')); setOcupado(false); return; }

      const r = await leerDeFoto(foto.uri);
      setOcupado(false);

      if (r.ok) {
        setMrz(r.mrz);
        setEscaneando(false);
        toast(r.corregida ? t('gen.scanFixed') : t('gen.scanOk'));
        return;
      }
      // Si se leyó algo con forma de MRZ pero los dígitos no cuadran, se deja
      // en el cuadro de texto: corregir dos caracteres es mucho mejor que
      // teclear ochenta y ocho.
      if (r.mrz) {
        setMrz(r.mrz);
        setEscaneando(false);
        toast(t('gen.scanPartial'));
        return;
      }
      // «Cortadas» no es «no se ve nada»: se leyeron las lineas pero el
      // telefono estaba demasiado cerca. Decirle a alguien que busque mas luz
      // cuando lo que sobra es cercania es mandarlo a perder el tiempo.
      if (r.motivo === 'cortadas') { toast(t('gen.scanCut')); return; }
      toast(r.motivo === 'sin-lector' ? t('gen.scanNoReader') : t('gen.scanRetry'));
    } catch (e) { setOcupado(false); toast(t('gen.errPhoto')); }
  }

  /**
   * Leer desde una foto ya tomada.
   *
   * Con la camara de la app no se puede enfocar ni acercar a voluntad. La
   * camara del telefono si, y para un documento gastado eso es la diferencia
   * entre leerlo y no leerlo. La imagen tampoco sale del telefono.
   */
  async function elegirFoto() {
    hap();
    try {
      const ImagePicker = require('expo-image-picker');
      const permisoGaleria = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permisoGaleria?.granted) { toast(t('gen.scanNoGallery')); return; }
      const sel = await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ['images'] });
      if (sel?.canceled || !sel?.assets?.[0]?.uri) return;

      setOcupado(true);
      const r = await leerDeFoto(sel.assets[0].uri);
      setOcupado(false);
      if (r.ok || r.mrz) {
        setMrz(r.mrz); setEscaneando(false);
        toast(r.ok ? (r.corregida ? t('gen.scanFixed') : t('gen.scanOk')) : t('gen.scanPartial'));
        return;
      }
      toast(r.motivo === 'cortadas' ? t('gen.scanCut') : t('gen.scanRetry'));
    } catch (e) { setOcupado(false); toast(t('gen.scanRetry')); }
  }

  async function enviarDocumento() {
    hap(); setOcupado(true); setProblemas([]);
    const r = await genesis.enviarDocumento(mrz);
    setOcupado(false);
    if (r.aceptable) { setEstado(r.estado); setProblemas([]); setPaso('rostro'); return; }
    // Los dígitos de control detectan al instante un error de transcripción,
    // así que se dice exactamente qué falla en vez de "inténtelo de nuevo".
    setProblemas(r.problemas?.length ? r.problemas : [t('gen.docBad')]);
  }

  // ---- paso 3: rostro con prueba de vida ----
  //
  // La secuencia de gestos la sortea el servidor y viene con caducidad. La app
  // solo la muestra, graba un fotograma por gesto y los devuelve en ese orden;
  // no decide nada ni puntúa nada, porque cualquier comprobación hecha en el
  // teléfono la desactiva quien controla el teléfono.

  async function comenzarReto() {
    if (!permiso?.granted) { const p = await pedirPermiso(); if (!p?.granted) return; }
    hap(); setOcupado(true);
    const r = await genesis.pedirReto();
    setOcupado(false);
    if (!r || r.error) { toast(r?.error || t('gen.errNetT')); return; }
    setReto(r); setGesto(0); setFotogramas([]);
  }

  async function capturarGesto() {
    if (!reto) return;
    hap(); setOcupado(true);
    try {
      const foto = await camara.current?.takePictureAsync({ base64: true, quality: 0.5, skipProcessing: true });
      if (!foto?.base64) { toast(t('gen.errPhoto')); setOcupado(false); return; }
      const tomados = [...fotogramas, `data:image/jpeg;base64,${foto.base64}`];
      setFotogramas(tomados);

      if (tomados.length < reto.gestos.length) {
        setGesto(tomados.length);
        setOcupado(false);
        return;
      }

      const r = await genesis.enviarRostro({ reto: reto.id, fotogramas: tomados });
      setOcupado(false);
      if (!r || r.error) { toast(r?.error || t('gen.errNetT')); reiniciarReto(); return; }

      setEstado(r.estado);
      reiniciarReto();

      // Una prueba de vida fallida NO puede acabar en la cola de revisión sin
      // más: casi siempre es mala luz o un gesto a medias, y mandar a alguien a
      // esperar días por eso —sin ofrecerle repetir— es perder la verificación.
      // Se queda en el paso del rostro con el motivo concreto delante.
      const bio = r.biometria;
      if (bio?.estado === 'fallida') {
        const falló = (bio.gestos || []).find((g) => !g.ok);
        toast(falló?.motivo ? `${t('gesto.' + falló.gesto)}: ${falló.motivo}` : t('gen.liveFailed'));
        return; // sigue en 'rostro', con el botón de empezar de nuevo
      }
      if (bio?.estado === 'dudosa') toast(t('gen.liveDoubt'));
      setPaso('revision');
    } catch (e) { setOcupado(false); toast(t('gen.errPhoto')); }
  }

  function reiniciarReto() { setReto(null); setGesto(0); setFotogramas([]); }

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
            <Text style={st.foot2}>{t('gen.nameAsDoc')}</Text>

            {/* Tres casillas y salto automático: se teclea sin pensar en formatos. */}
            <Text style={st.label}>{t('gen.dob')}</Text>
            <View style={st.fecha}>
              <TextInput style={st.fechaCaja} value={dia} placeholder={t('gen.dobD')}
                placeholderTextColor="#6f938f" keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => {
                  const n = v.replace(/\D/g, ''); setDia(n);
                  if (n.length === 2) refMes.current?.focus();
                }} />
              <Text style={st.fechaSep}>/</Text>
              <TextInput ref={refMes} style={st.fechaCaja} value={mes} placeholder={t('gen.dobM')}
                placeholderTextColor="#6f938f" keyboardType="number-pad" maxLength={2}
                onChangeText={(v) => {
                  const n = v.replace(/\D/g, ''); setMes(n);
                  if (n.length === 2) refAnio.current?.focus();
                }} />
              <Text style={st.fechaSep}>/</Text>
              <TextInput ref={refAnio} style={[st.fechaCaja, { flex: 1.5 }]} value={anio}
                placeholder={t('gen.dobY')} placeholderTextColor="#6f938f"
                keyboardType="number-pad" maxLength={4}
                onChangeText={(v) => setAnio(v.replace(/\D/g, ''))} />
            </View>
            {dia && mes && anio.length === 4 && !fechaValida && (
              <Text style={st.mrzPista}>{t('gen.dobBad')}</Text>
            )}

            <Text style={st.label}>{t('gen.country')}</Text>
            <View style={st.paises}>
              {FRECUENTES.map((p) => (
                <Pressable key={p} onPress={() => { hap(); setPais(p); setEligiendoPais(false); }}
                  style={[st.pais, pais === p && st.paisSel]}>
                  <Text style={[st.paisTxt, pais === p && st.paisTxtSel]}>{p}</Text>
                </Pressable>
              ))}
              {/* Sin esto, quien no viva en uno de los diez de arriba no podía
                  terminar la verificación, o declaraba un país que no es el suyo. */}
              <Pressable onPress={() => { hap(); setEligiendoPais(!eligiendoPais); }}
                style={[st.pais, !FRECUENTES.includes(pais) && st.paisSel]}>
                <Text style={[st.paisTxt, !FRECUENTES.includes(pais) && st.paisTxtSel]}>
                  {FRECUENTES.includes(pais) ? t('gen.otherCountry') : pais}
                </Text>
              </Pressable>
            </View>
            <Text style={st.foot2}>{nombrePais(pais)}</Text>

            {eligiendoPais && (
              <View style={{ marginTop: 10 }}>
                <TextInput style={st.buscaPais} value={buscaPais} onChangeText={setBuscaPais}
                  placeholder={t('gen.searchCountry')} placeholderTextColor="#6f938f"
                  autoCorrect={false} />
                <View style={st.listaPaises}>
                  {buscarPaises(buscaPais).slice(0, 40).map(([codigo, nombrePs]) => (
                    <Pressable key={codigo} style={st.filaPais}
                      onPress={() => { hap(); setPais(codigo); setEligiendoPais(false); setBuscaPais(''); }}>
                      <Text style={st.filaPaisTxt}>{nombrePs}</Text>
                      <Text style={st.filaPaisCod}>{codigo}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <Button3D title={t('gen.continue')} icon="arrow-forward" onPress={enviarDatos}
              disabled={ocupado || !nombre.trim() || !fechaValida} style={{ marginTop: 18 }} />
            <Text style={st.foot}>{t('gen.dataFoot')}</Text>
          </>
        )}

        {/* ---- 2. documento ---- */}
        {paso === 'documento' && (
          <>
            <View style={st.heroIcon}><Icon name="card" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepDocT')}</Text>
            <Text style={st.body}>{t('gen.stepDocP')}</Text>

            {/* La cámara va primero y a mano queda como salida de emergencia:
                teclear 88 caracteres llenos de «<» es donde la gente abandona. */}
            {escaneando ? (
              <>
                <View style={st.camaraCaja}>
                  <CameraView ref={camaraDoc} style={{ flex: 1 }} facing="back" />
                  <View style={st.guia} pointerEvents="none" />
                </View>
                <Text style={st.mrzPista}>{t('gen.scanAim')}</Text>
                <Button3D title={ocupado ? t('gen.scanReading') : t('gen.scanShot')}
                  icon="card" onPress={escanearDocumento} disabled={ocupado}
                  style={{ marginTop: 12 }} />
                <Pressable onPress={elegirFoto} style={st.retry} disabled={ocupado}>
                  <Text style={st.retryTxt}>{t('gen.scanGallery')}</Text>
                </Pressable>
                <Pressable onPress={() => setEscaneando(false)} style={st.retry} disabled={ocupado}>
                  <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.scanManual')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                {puedeEscanear() ? (
                  <Button3D title={t('gen.scanStart')} icon="card"
                    onPress={abrirEscaner} disabled={ocupado} style={{ marginBottom: 14 }} />
                ) : (
                  // En Expo Go el lector no existe —es un modulo nativo— y el
                  // boton desaparecia sin mas. Callarselo parece un fallo de la
                  // app; decirlo convierte una ausencia en una explicacion.
                  <View style={st.warn}>
                    <Icon name="information-circle" size={20} color={C.gold} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.warnTxt}>{t('gen.scanNeedsApk')}</Text>
                    </View>
                  </View>
                )}

                <Card style={{ padding: 14, marginBottom: 14 }}>
                  <Text style={st.cardTitle}>{t('gen.mrzWhere')}</Text>
                  <Text style={st.mrzEjemplo} numberOfLines={2}>
                    P&lt;HNDPEREZ&lt;&lt;JUAN&lt;CARLOS&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;{'\n'}
                    A123456781HND9005236M3012159&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;06
                  </Text>
                </Card>
              </>
            )}

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

            {/* Si lo que falla es el nombre o la fecha que declaró, el problema
                no está en el documento sino en el paso anterior — y hasta ahora
                no había manera de volver: la verificación se quedaba muerta ahí. */}
            {problemas.some((p) => /declarad|coincid/i.test(p)) && (
              <Pressable onPress={() => { hap(); setProblemas([]); setPaso('datos'); }} style={st.retry}>
                <Text style={st.retryTxt}>{t('gen.fixData')}</Text>
              </Pressable>
            )}

            <Button3D title={t('gen.sendDoc')} icon="shield-checkmark" onPress={enviarDocumento}
              disabled={ocupado || !forma.ok} style={{ marginTop: 16 }} />
            <Text style={st.foot}>{t('gen.docFoot')}</Text>
          </>
        )}

        {/* ---- 3. rostro ---- */}
        {paso === 'rostro' && (
          <>
            <View style={st.heroIcon}><Icon name="person" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.stepFaceT')}</Text>
            <Text style={st.body}>{t('gen.stepFaceP')}</Text>

            {!permiso?.granted ? (
              <Button3D title={t('gen.allowCam')} icon="eye" onPress={pedirPermiso} />
            ) : !reto ? (
              <>
                <Text style={st.body}>{t('gen.liveIntro')}</Text>
                <Button3D title={t('gen.liveStart')} icon="finger-print" onPress={comenzarReto}
                  disabled={ocupado} style={{ marginTop: 16 }} />
              </>
            ) : (
              <>
                <Text style={st.gestoPaso}>
                  {t('gen.liveStep', { n: gesto + 1, total: reto.gestos.length })}
                </Text>
                {/* La instrucción va grande y sola: la persona la lee de un
                    vistazo mientras se mira en la cámara. */}
                <Text style={st.gestoTxt}>
                  {t(`gesto.${reto.gestos[gesto]}`) !== `gesto.${reto.gestos[gesto]}`
                    ? t(`gesto.${reto.gestos[gesto]}`)
                    : reto.instrucciones[gesto]}
                </Text>
                <View style={st.camaraCaja}>
                  <CameraView ref={camara} style={{ flex: 1 }} facing="front" />
                </View>
                <View style={st.puntos}>
                  {reto.gestos.map((g, k) => (
                    <View key={g + k} style={[st.punto, k < fotogramas.length && st.puntoHecho]} />
                  ))}
                </View>
                <Button3D
                  title={ocupado ? t('gen.liveSending') : t('gen.liveShot')}
                  icon="eye" onPress={capturarGesto}
                  disabled={ocupado} style={{ marginTop: 12 }} />
                <Pressable onPress={reiniciarReto} style={st.retry} disabled={ocupado}>
                  <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.liveRetry')}</Text>
                </Pressable>
              </>
            )}
            <Text style={st.foot}>{reto ? t('gen.liveFoot') : t('gen.faceFoot')}</Text>
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
              <Icon name="help-buoy" size={14} color={C.gold} />
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

  // La instrucción del gesto tiene que leerse de reojo, mirando a la cámara.
  foot2: { color: C.txt3, fontSize: 11.5, marginTop: -8, marginBottom: 12 },
  fecha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fechaCaja: {
    flex: 1, backgroundColor: '#06282a', borderWidth: 1, borderColor: C.line2,
    borderRadius: 12, paddingVertical: 12, color: C.txt, fontSize: 17,
    textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  fechaSep: { color: C.txt3, fontSize: 17 },
  buscaPais: {
    backgroundColor: '#06282a', borderWidth: 1, borderColor: C.line2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: C.txt,
  },
  listaPaises: { marginTop: 8, maxHeight: 260, borderRadius: 12, overflow: 'hidden' },
  filaPais: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line2,
  },
  filaPaisTxt: { color: C.txt, fontSize: 14, flex: 1 },
  filaPaisCod: { color: C.txt3, fontSize: 12, fontVariant: ['tabular-nums'] },

  // Franja que marca dónde poner el pie del documento. Encuadrar bien es la
  // diferencia entre leerlo a la primera y tres intentos.
  // La franja va de lado a lado y en el centro. La version anterior era un
  // recuadro pequeño abajo: la gente ponia el documento arriba, fuera de el, y
  // sobre todo lo acercaba tanto que las lineas salian cortadas por los lados.
  // Lo que hay que encuadrar es el ANCHO entero.
  guia: {
    position: 'absolute', left: 8, right: 8, top: '32%', height: 108,
    borderWidth: 2, borderColor: C.gold, borderRadius: 8, opacity: 0.8,
  },
  gestoPaso: { color: C.txt3, fontSize: 12, letterSpacing: 1, marginTop: 14, textTransform: 'uppercase' },
  gestoTxt: { color: C.gold, fontSize: 22, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 },
  punto: { width: 26, height: 4, borderRadius: 2, backgroundColor: C.line2 },
  puntoHecho: { backgroundColor: C.gold },

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
