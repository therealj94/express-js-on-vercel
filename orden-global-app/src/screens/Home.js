// El inicio: pantalla negra, tus apps con SUS logos sobre SUS fondos de
// marca, y el ecosistema vivo debajo. Cada ficha es una entrada del mapa —
// tocarla o pedírsela a GENESIS es exactamente el mismo camino.
import React from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { C, MARCAS } from '../theme';
import { useT, setIdioma } from '../i18n';
import { quienSoy } from '../api';
import { Etiqueta, Entra } from '../ui';

const FICHAS = [
  { ruta: 'wallet/abrir', marca: 'veta', nom: 'app.veta', sub: 'app.veta.sub' },
  { ruta: 'pay/abrir', marca: 'pay', nom: 'app.pay', sub: 'app.pay.sub', candado: true },
  { ruta: 'id/abrir', marca: 'gid', nom: 'app.gid', sub: 'app.gid.sub' },
  { ruta: 'scan/abrir', marca: 'og', nom: 'app.scan', sub: 'app.scan.sub' },
];

export default function Home({ abrir, salir }) {
  const t = useT();
  const yo = quienSoy() || {};
  return (
    <ScrollView style={s.todo} contentContainerStyle={s.dentro}>
      <Entra>
        <View style={s.cab}>
          <View style={{ flex: 1 }}>
            <Text style={s.hola}>{t('inicio.hola')}, {yo.nombre || ''}</Text>
            <Text style={s.sub}>{t('inicio.sub')}</Text>
          </View>
          <View style={s.idiomas}>
            {['es', 'en'].map((x) => (
              <Pressable key={x} onPress={() => setIdioma(x)}>
                <Text style={[s.idi, t.idioma === x && s.idiOn]}>{x.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Entra>

      <Etiqueta style={{ marginTop: 18 }}>{t('inicio.apps')}</Etiqueta>
      <View style={s.malla}>
        {FICHAS.map((f, i) => (
          <Entra key={f.ruta} delay={80 + i * 70} style={s.celda}>
            <Pressable onPress={() => abrir('og://' + f.ruta)} style={({ pressed }) => [
              s.ficha, { backgroundColor: MARCAS[f.marca].fondo },
              pressed && { transform: [{ scale: 0.97 }] },
            ]}>
              <Image source={MARCAS[f.marca].logo} style={s.logo} resizeMode="contain" />
              {f.candado && <View style={s.sello}><Text style={s.selloTxt}>GENESIS ID</Text></View>}
            </Pressable>
            <Text style={s.nom}>{t(f.nom)}</Text>
            <Text style={s.nomSub}>{t(f.sub)}</Text>
          </Entra>
        ))}
      </View>

      <Etiqueta style={{ marginTop: 20 }}>{t('inicio.eco')}</Etiqueta>
      <Entra delay={340}>
        <Pressable onPress={() => abrir('og://cerebro/abrir')} style={s.ancha}>
          <View style={s.puntoVivo} />
          <View style={{ flex: 1 }}>
            <Text style={s.anchaNom}>{t('inicio.cerebro')}</Text>
            <Text style={s.anchaSub}>{t('inicio.cerebro.sub')}</Text>
          </View>
          <Text style={s.flecha}>›</Text>
        </Pressable>
      </Entra>
      <Entra delay={400}>
        <Pressable onPress={() => abrir('og://chat/abrir')} style={s.ancha}>
          <Text style={s.emoji}>💬</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.anchaNom}>{t('inicio.chat')}</Text>
            <Text style={s.anchaSub}>{t('inicio.chat.sub')}</Text>
          </View>
          <Text style={s.flecha}>›</Text>
        </Pressable>
      </Entra>

      <Pressable onPress={salir} style={s.salir}><Text style={s.salirTxt}>{t('inicio.salir')}</Text></Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  todo: { flex: 1 },
  dentro: { padding: 18, paddingTop: 14, paddingBottom: 28 },
  cab: { flexDirection: 'row', alignItems: 'flex-start' },
  hola: { color: C.txt, fontSize: 24, fontWeight: '300' },
  sub: { color: C.txt3, fontSize: 12.5, marginTop: 3 },
  idiomas: { flexDirection: 'row', gap: 12, paddingTop: 6 },
  idi: { color: C.txt3, fontSize: 11, fontWeight: '700' },
  idiOn: { color: C.gold },
  malla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  celda: { width: '47%', flexGrow: 1 },
  ficha: { height: 108, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line2, overflow: 'hidden' },
  logo: { width: '68%', height: '68%' },
  sello: { position: 'absolute', top: 8, right: 8, backgroundColor: C.gold, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  selloTxt: { color: C.darkText, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  nom: { color: C.txt, fontSize: 13.5, fontWeight: '600', marginTop: 8 },
  nomSub: { color: C.txt3, fontSize: 11 },
  ancha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 15, marginBottom: 10 },
  puntoVivo: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.up },
  emoji: { fontSize: 18 },
  anchaNom: { color: C.txt, fontSize: 14.5, fontWeight: '600' },
  anchaSub: { color: C.txt3, fontSize: 11.5 },
  flecha: { color: C.gold, fontSize: 22, fontWeight: '300' },
  salir: { marginTop: 18, alignSelf: 'center' },
  salirTxt: { color: C.txt3, fontSize: 12 },
});
