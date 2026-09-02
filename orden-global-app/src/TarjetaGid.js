import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { Icon } from './icons';
import { C, G } from './theme';
import { enlaceComprobacion } from './genesis';
import { useT, useLang } from './i18n';

// ---------------------------------------------------------------------------
// La tarjeta de identidad Genesis ID.
//
// Es lo que la persona ve al terminar la verificación: nombre, GID, fecha,
// estado y un código QR. El QR no lleva datos personales: lleva el enlace
// público de comprobación (app.vetawallet.com/gid/<GID>), que solo dice
// «verificada» o «no verificada» y desde cuándo. Quien lo escanea sabe si la
// credencial vale; no sabe nada más de la persona.
//
// Diseño propio, no una copia de un pasaporte: veta dorada en el borde, el
// GID grande en monoespaciada —es lo que se dicta por teléfono— y el QR sobre
// crema para que cualquier lector lo tome a la primera.
// ---------------------------------------------------------------------------

const ESTADOS = {
  verificada: { icono: 'shield-checkmark', color: '#3ED9A0', fondo: 'rgba(62,217,160,0.14)' },
  revision: { icono: 'time', color: '#FBBF24', fondo: 'rgba(251,191,36,0.14)' },
  suspendida: { icono: 'close-circle', color: '#F0776B', fondo: 'rgba(240,119,107,0.14)' },
  rechazada: { icono: 'close-circle', color: '#F0776B', fondo: 'rgba(240,119,107,0.14)' },
  pendiente: { icono: 'information-circle', color: C.txt3, fondo: 'rgba(255,255,255,0.08)' },
};

function fecha(iso, idioma) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * @param nombre     nombre legal (o el declarado, mientras no haya legal)
 * @param gid        GEN-XXXX-XXXX-X, o null mientras no exista
 * @param estado     'verificada' | 'revision' | 'suspendida' | 'rechazada' | 'pendiente'
 * @param fechaIso   cuándo se verificó (o la última actualización)
 * @param foto       data URI de la foto de la credencial, opcional
 * @param iniciales  para el hueco de la foto cuando no hay
 */
export function TarjetaGid({ nombre, gid, estado = 'pendiente', fechaIso, foto, iniciales }) {
  const t = useT();
  const { lang: idioma } = useLang();
  const e = ESTADOS[estado] || ESTADOS.pendiente;
  const etiqueta = t(`gid.estado.${ESTADOS[estado] ? estado : 'pendiente'}`);
  const cuando = fecha(fechaIso, idioma);

  return (
    <LinearGradient colors={['#0f5f55', '#0a3a3d', '#06282b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[st.tarjeta, estado === 'verificada' && st.tarjetaOk]}>
      {/* La veta: la línea dorada que firma el diseño. */}
      <View style={st.veta} pointerEvents="none" />

      <View style={st.arriba}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="finger-print" size={16} color={C.gold} />
          <Text style={st.marca}>GENESIS ID</Text>
          <Text style={st.marca2}>· ORDEN GLOBAL</Text>
        </View>
        <View style={[st.pastilla, { backgroundColor: e.fondo }]}>
          <Icon name={e.icono} size={12} color={e.color} />
          <Text style={[st.pastillaTxt, { color: e.color }]}>{etiqueta}</Text>
        </View>
      </View>

      <View style={st.cuerpo}>
        {foto ? (
          <Image source={{ uri: foto }} style={st.foto} />
        ) : (
          <LinearGradient colors={G.gold} style={st.foto}>
            <Text style={{ color: C.darkText, fontWeight: '800', fontSize: 22 }}>{iniciales || 'OG'}</Text>
          </LinearGradient>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.etq}>{t('gid.tarjeta.titular')}</Text>
          <Text style={st.nombre} numberOfLines={2}>{nombre || '—'}</Text>
          <Text style={[st.etq, { marginTop: 8 }]}>GID</Text>
          <Text style={st.gid} numberOfLines={1} adjustsFontSizeToFit selectable>{gid || t('gid.tarjeta.sinGid')}</Text>
        </View>
      </View>

      <View style={st.abajo}>
        <View style={{ flex: 1 }}>
          <Text style={st.etq}>{estado === 'verificada' ? t('gid.tarjeta.verificadaEl') : t('gid.tarjeta.actualizada')}</Text>
          <Text style={st.dato}>{cuando || '—'}</Text>
          <Text style={[st.etq, { marginTop: 8 }]}>{t('gid.tarjeta.estado')}</Text>
          <Text style={[st.dato, { color: e.color }]}>{etiqueta}</Text>
          <Text style={st.pie}>{gid ? t('gid.tarjeta.qrPie') : t('gid.tarjeta.qrSin')}</Text>
        </View>
        <View style={st.qrCaja}>
          {gid ? (
            <QRCode value={enlaceComprobacion(gid)} size={92} color="#021B1C" backgroundColor="#F3ECD9" ecl="M" />
          ) : (
            <View style={st.qrVacio}><Icon name="qr-code" size={30} color="#6E938F" /></View>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

/**
 * Solo el código de comprobación, para ponerlo debajo de una credencial que
 * ya enseña el nombre y el GID a su manera (el pasaporte de Ajustes).
 */
export function QrComprobacion({ gid }) {
  const t = useT();
  if (!gid) return null;
  return (
    <View style={st.qrSuelto}>
      <View style={st.qrCaja}>
        <QRCode value={enlaceComprobacion(gid)} size={104} color="#021B1C" backgroundColor="#F3ECD9" ecl="M" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.qrSueltoT}>{t('gid.tarjeta.qrTitulo')}</Text>
        <Text style={st.qrSueltoP}>{t('gid.tarjeta.qrPie')}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  tarjeta: {
    borderRadius: 22, padding: 18, borderWidth: 1, borderColor: 'rgba(201,169,97,0.35)',
    overflow: 'hidden',
  },
  tarjetaOk: { borderColor: 'rgba(62,217,160,0.35)' },
  veta: {
    position: 'absolute', left: -40, top: 60, width: 420, height: 1.5,
    backgroundColor: 'rgba(201,169,97,0.45)', transform: [{ rotate: '-12deg' }],
  },
  arriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  marca: { color: C.txt, fontWeight: '800', letterSpacing: 2, fontSize: 11.5 },
  marca2: { color: C.txt3, fontWeight: '700', letterSpacing: 1.2, fontSize: 9.5 },
  pastilla: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pastillaTxt: { fontSize: 10.5, fontWeight: '700' },
  cuerpo: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  foto: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel2 },
  etq: { color: C.txt3, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  nombre: { color: C.txt, fontWeight: '700', fontSize: 16.5, marginTop: 2 },
  gid: { color: C.gold, fontWeight: '800', fontSize: 17, letterSpacing: 1.2, marginTop: 2, fontVariant: ['tabular-nums'] },
  abajo: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  dato: { color: C.txt, fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  pie: { color: C.txt3, fontSize: 10, lineHeight: 14, marginTop: 10 },
  qrCaja: { backgroundColor: '#F3ECD9', borderRadius: 12, padding: 6 },
  qrVacio: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  qrSuelto: {
    flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 14, padding: 14,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16,
  },
  qrSueltoT: { color: C.txt, fontWeight: '700', fontSize: 13.5 },
  qrSueltoP: { color: C.txt3, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
});
