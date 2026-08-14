import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, hap, useToast } from '../ui';
import { parseAddress } from '../addressBook';
import { abrir as abrirOG } from '../og/rutas';
import { useT } from '../i18n';

const { width: W } = Dimensions.get('window');
const BOX = Math.min(W - 90, 300);

/**
 * Escáner de códigos QR.
 *
 * Se usa como MODAL (`<ScanModal visible … onResult … onClose … />`) y no como
 * pantalla apilada: el navegador de la app desmonta la pantalla anterior al
 * apilar otra, así que un `onResult` que escribiera en el formulario de Enviar
 * se perdería. Con el modal, quien abre la cámara sigue montado y recibe la
 * dirección al instante.
 *
 * mode: 'address' (por defecto) exige una dirección 0x…; 'text' devuelve el
 * contenido tal cual (se usa para el QR del pasaporte de Genesis ID).
 */
export function Scanner({ mode = 'address', onResult, onClose }) {
  const t = useT();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const done = useRef(false); // evita leer el mismo QR varias veces

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  function onScan({ data }) {
    if (done.current) return;
    // Un QR de Orden Global --un cobro, un chat-- navega por el mapa: el
    // cobro cae en ENVIAR ya preparado, el chat abre el hilo.
    if (/^og:\/\//.test(String(data || ''))) {
      done.current = true;
      hap();
      onClose && onClose();
      abrirOG(String(data).trim(), nav);
      return;
    }
    const value = mode === 'text' ? String(data || '').trim() : parseAddress(data);
    if (!value) { toast(t('scan.invalid')); return; }
    done.current = true;
    hap();
    onResult && onResult(value);
    onClose && onClose();
  }

  // ---- permiso aún no resuelto ----
  if (!permission) {
    return (
      <View style={st.screen}>
        <Header title={t('scan.title')} onBack={onClose} />
        <View style={st.center}><ActivityIndicator color={C.gold} size="large" /></View>
      </View>
    );
  }

  // ---- permiso denegado ----
  if (!permission.granted) {
    return (
      <View style={st.screen}>
        <Header title={t('scan.title')} onBack={onClose} />
        <View style={st.center}>
          <View style={st.denyIcon}><Icon name="qr-code" size={34} color={C.gold} /></View>
          <Text style={st.denyT}>{t('scan.permT')}</Text>
          <Text style={st.denyP}>{t('scan.permP')}</Text>
          <Button3D title={t('scan.allow')} icon="qr-code" onPress={requestPermission} style={{ alignSelf: 'stretch', marginTop: 18 }} />
        </View>
      </View>
    );
  }

  // ---- cámara activa ----
  return (
    <View style={st.screen}>
      <Header
        title={t('scan.title')}
        onBack={onClose}
        right={
          <Pressable onPress={() => { hap(); setTorch((v) => !v); }} style={st.torch}>
            <Icon name={torch ? 'eye' : 'eye-off'} size={19} color={torch ? C.gold : C.txt2} />
          </Pressable>
        }
      />
      <View style={st.camWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
        {/* marco de enfoque */}
        <View style={st.overlay} pointerEvents="none">
          <View style={st.box}>
            <View style={[st.corner, st.tl]} />
            <View style={[st.corner, st.tr]} />
            <View style={[st.corner, st.bl]} />
            <View style={[st.corner, st.br]} />
          </View>
          <Text style={st.hint}>{mode === 'text' ? t('scan.hintPass') : t('scan.hint')}</Text>
        </View>
      </View>
    </View>
  );
}

/** La cámara a pantalla completa sobre la pantalla que la abre. */
export function ScanModal({ visible, mode, onResult, onClose }) {
  return (
    <Modal visible={!!visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {visible ? <Scanner mode={mode} onResult={onResult} onClose={onClose} /> : null}
    </Modal>
  );
}

/** Versión pantalla (ruta 'scan'), por si se navega a ella directamente. */
export default function Scan({ nav, params }) {
  return (
    <Scanner
      mode={params?.mode}
      onResult={params?.onResult}
      onClose={() => nav.back()}
    />
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 46, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  denyIcon: { width: 84, height: 84, borderRadius: 26, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  denyT: { color: C.txt, fontWeight: '800', fontSize: 19, textAlign: 'center' },
  denyP: { color: C.txt2, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  torch: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  camWrap: { flex: 1, margin: 22, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  box: { width: BOX, height: BOX },
  corner: { position: 'absolute', width: 42, height: 42, borderColor: C.gold },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
  hint: { color: '#fff', fontSize: 13, marginTop: 26, textAlign: 'center', paddingHorizontal: 30, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
});
