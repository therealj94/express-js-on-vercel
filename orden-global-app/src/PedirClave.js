import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, TextInput, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { useTeclado } from './og/Teclado';
import { Icon } from './icons';
import { C } from './theme';
import { Button3D, hap } from './ui';
import { useT } from './i18n';
import { capacidadBiometrica, desbloqueoActivo, desbloquearClave, activarDesbloqueo, TIPO } from './unlock';

// ============================================================
// Ficha única para autorizar una operación sensible.
//
// Se usa en todos los sitios donde el backend exige la contraseña: enviar
// dinero, ver el número o el PIN de la tarjeta, ver la semilla, eliminar la
// cuenta. Antes cada pantalla tenía su propio campo, con textos y
// comportamientos distintos.
//
// Cómo se comporta:
//   · Con el desbloqueo activo, intenta la biometría SOLA al abrirse. En el
//     caso normal el usuario ve el diálogo del sistema y nunca teclea nada.
//   · Si cancela o falla, cae al campo de contraseña sin drama, con el botón
//     para reintentar la biometría a la vista.
//   · Sin desbloqueo activo, muestra el campo y ofrece activarlo. La casilla
//     solo aparece si el teléfono tiene biometría configurada, y la
//     contraseña se guarda únicamente cuando el servidor la aceptó.
//
// `onSubmit(password)` debe devolver { ok } — o lanzar. Si resuelve bien y el
// usuario pidió activar el desbloqueo, se guarda ahí, no antes: guardar una
// contraseña que el servidor rechaza dejaría un desbloqueo inservible.
// ============================================================

export function nombreBiometria(tipo, t) {
  if (tipo === TIPO.FACE) return t('bio.face');
  if (tipo === TIPO.IRIS) return t('bio.iris');
  return t('bio.huella');
}

export default function PedirClave({ visible, titulo, subtitulo, ctaTexto, onCancel, onSubmit }) {
  const t = useT();
  const [pw, setPw] = useState('');
  const [ver, setVer] = useState(false);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState(null);

  const [bio, setBio] = useState({ disponible: false, tipo: TIPO.HUELLA });
  const [activo, setActivo] = useState(false);
  const [intentandoBio, setIntentandoBio] = useState(false);
  const [quiereActivar, setQuiereActivar] = useState(false);
  const [modoManual, setModoManual] = useState(false);
  const enVuelo = useRef(false);   // candado contra doble disparo (botón + teclado)

  const nombre = nombreBiometria(bio.tipo, t);

  // Envía la contraseña y, si corresponde, deja el desbloqueo activado.
  const enviar = useCallback(async (password, { veniaDeBio = false } = {}) => {
    if (!password) return;
    // `yendo` es estado y no frena un segundo disparo en el mismo frame: el
    // botón está protegido con disabled, pero onSubmitEditing del teclado no.
    // Sin esto, "go" en el teclado + toque al botón mandaba la operación dos
    // veces (recargar tarjeta, reemitir, cancelar…).
    if (enVuelo.current) return;
    enVuelo.current = true;
    setYendo(true);
    setError(null);
    try {
      const r = await onSubmit(password);
      if (r && r.ok === false) {
        setError(r.msg || t('clave.mal'));
        // Si la contraseña guardada dejó de servir (el usuario la cambió en
        // otro dispositivo), no tiene sentido seguir ofreciendo la biometría
        // con un valor viejo: se pasa a manual y se avisa.
        if (veniaDeBio) { setModoManual(true); setError(t('clave.guardadaVieja')); }
        return;
      }
      if (quiereActivar && !veniaDeBio) await activarDesbloqueo(password);
    } catch (e) {
      setError(e?.message || t('clave.mal'));
    } finally {
      enVuelo.current = false;
      setYendo(false);
      setPw('');
    }
  }, [onSubmit, quiereActivar, t]);

  const usarBiometria = useCallback(async () => {
    setIntentandoBio(true);
    setError(null);
    const clave = await desbloquearClave();
    setIntentandoBio(false);
    if (!clave) { setModoManual(true); return; }
    await enviar(clave, { veniaDeBio: true });
  }, [enviar]);

  // Al abrirse: estado limpio y, si hay desbloqueo, biometría de una.
  useEffect(() => {
    if (!visible) {
      setPw(''); setVer(false); setYendo(false); setError(null);
      setModoManual(false); setQuiereActivar(false); setIntentandoBio(false);
      return;
    }
    let vivo = true;
    (async () => {
      const [cap, act] = await Promise.all([capacidadBiometrica(), desbloqueoActivo()]);
      if (!vivo) return;
      setBio(cap);
      setActivo(act && cap.disponible);
      if (act && cap.disponible) {
        setIntentandoBio(true);
        const clave = await desbloquearClave();
        if (!vivo) return;
        setIntentandoBio(false);
        if (clave) { await enviar(clave, { veniaDeBio: true }); return; }
        setModoManual(true);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const mostrandoBio = activo && !modoManual;
  // La altura que anuncia el propio teclado: es el único dato fiable dentro
  // de un Modal en Android (ver el comentario de abajo).
  const tec = useTeclado();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {/* EL TECLADO TAPABA LA CONTRASEÑA, y se firmaba a ciegas.
          Aquí vivía un KeyboardAvoidingView con behavior 'height' en Android.
          No funciona DENTRO de un Modal: el modal es una ventana aparte del
          sistema, no la redimensiona el adjustResize de la actividad, y
          'height' mide una pantalla que para él nunca encoge. Da igual lo
          bien puesto que esté: no se entera de que el teclado subió.
          Se sustituye por la altura REAL que anuncia el propio teclado
          (useTeclado escucha keyboardDidShow) empujando la hoja hacia arriba
          exactamente eso. Funciona igual en modal y fuera de él. */}
      <View style={{ flex: 1 }}>
      <Pressable style={st.bg} onPress={yendo ? undefined : onCancel}>
        <Pressable style={[st.sheet, { paddingBottom: 28 + tec.alto }]} onPress={() => {}}>
          <View style={st.grab} />
          <Text style={st.titulo}>{titulo}</Text>
          <Text style={st.sub}>{subtitulo || t('clave.por')}</Text>

          {/* --- camino biométrico --- */}
          {mostrandoBio ? (
            <View style={st.bioZona}>
              <View style={st.bioCirculo}>
                {intentandoBio || yendo
                  ? <ActivityIndicator size="large" color={C.gold} />
                  : <Icon name={bio.tipo === TIPO.FACE ? 'person' : 'finger-print'} size={40} color={C.gold} />}
              </View>
              <Text style={st.bioTxt}>
                {yendo ? t('clave.verificando') : t('clave.usaBio', { m: nombre })}
              </Text>
              {!!error && <Text style={st.err}>{error}</Text>}
              {!intentandoBio && !yendo && (
                <Button3D title={t('clave.reintentarBio', { m: nombre })} onPress={() => { hap(); usarBiometria(); }} />
              )}
              <Pressable onPress={() => { hap(); setModoManual(true); setError(null); }} style={st.enlace}>
                <Text style={st.enlaceTxt}>{t('clave.usarClave')}</Text>
              </Pressable>
            </View>
          ) : (
            /* --- camino con contraseña escrita --- */
            <>
              <View style={{ position: 'relative', marginTop: 16 }}>
                <TextInput
                  value={pw}
                  onChangeText={(v) => { setPw(v); if (error) setError(null); }}
                  secureTextEntry={!ver}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={!activo}
                  placeholder={t('auth.password')}
                  placeholderTextColor="#6f938f"
                  style={[st.input, !!error && { borderColor: C.down }]}
                  accessibilityLabel={t('auth.password')}
                  onSubmitEditing={() => enviar(pw)}
                  returnKeyType="go"
                />
                <Pressable
                  onPress={() => { hap(); setVer(!ver); }}
                  style={st.ojito}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t(ver ? 'clave.ocultar' : 'clave.mostrar')}
                >
                  <Icon name={ver ? 'eye-off' : 'eye'} size={19} color={C.txt3} />
                </Pressable>
              </View>
              {!!error && <Text style={st.err}>{error}</Text>}

              {/* Ofrecer activar el desbloqueo solo si el teléfono puede. */}
              {bio.disponible && !activo && (
                <Pressable
                  onPress={() => { hap(); setQuiereActivar(!quiereActivar); }}
                  style={st.activarFila}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: quiereActivar }}
                  accessibilityLabel={t('clave.activar', { m: nombre })}
                >
                  <View style={[st.casilla, quiereActivar && { backgroundColor: C.gold, borderColor: C.gold }]}>
                    {quiereActivar && <Icon name="checkmark" size={13} color={C.darkText} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.activarT}>{t('clave.activar', { m: nombre })}</Text>
                    <Text style={st.activarP}>{t('clave.activarP')}</Text>
                  </View>
                </Pressable>
              )}

              <View style={{ height: 16 }} />
              <Button3D
                title={yendo ? t('clave.verificando') : (ctaTexto || t('clave.autorizar'))}
                disabled={!pw || yendo}
                onPress={() => { hap(); enviar(pw); }}
              />

              {/* Si hay desbloqueo activo y se cayó a manual, se puede volver. */}
              {activo && (
                <Pressable onPress={() => { hap(); setModoManual(false); setError(null); usarBiometria(); }} style={st.enlace}>
                  <Text style={st.enlaceTxt}>{t('clave.reintentarBio', { m: nombre })}</Text>
                </Pressable>
              )}
            </>
          )}

          <Pressable onPress={onCancel} disabled={yendo} style={st.cancelar}>
            <Text style={[st.cancelarTxt, yendo && { opacity: 0.4 }]}>{t('card.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#06282B', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 28 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2, alignSelf: 'center', marginBottom: 16 },
  titulo: { color: C.txt, fontSize: 17.5, fontWeight: '800' },
  sub: { color: C.txt3, fontSize: 12.5, marginTop: 5, lineHeight: 18 },

  bioZona: { alignItems: 'center', paddingTop: 22 },
  bioCirculo: {
    width: 96, height: 96, borderRadius: 32,
    backgroundColor: 'rgba(201,169,97,0.12)',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.32)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  bioTxt: { color: C.txt2, fontSize: 13.5, textAlign: 'center', marginBottom: 18, lineHeight: 19 },

  input: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, paddingRight: 46, color: C.txt, fontSize: 15 },
  ojito: { position: 'absolute', right: 6, top: 0, bottom: 0, width: 40, alignItems: 'center', justifyContent: 'center' },
  err: { color: C.down, fontSize: 12.5, marginTop: 9, textAlign: 'center' },

  activarFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 16 },
  casilla: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  activarT: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  activarP: { color: C.txt3, fontSize: 11.5, marginTop: 2, lineHeight: 16 },

  enlace: { paddingVertical: 13, alignItems: 'center' },
  enlaceTxt: { color: C.gold, fontSize: 13.5, fontWeight: '600' },
  cancelar: { paddingTop: 10, paddingBottom: 4, alignItems: 'center' },
  cancelarTxt: { color: C.txt3, fontSize: 13.5 },
});
