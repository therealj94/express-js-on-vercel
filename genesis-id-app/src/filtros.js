// Los filtros del explorador.
//
// LA IDEA QUE LOS HACE UTILES
//
// Cada opción viene con su cuenta al lado —«Honduras 412», «web 69»— y esas
// cuentas se calculan con todos los demás filtros puestos MENOS el suyo. Eso
// significa dos cosas para quien los usa: nunca elige una opción que devuelva
// cero, y siempre ve a dónde más puede ir sin tener que borrar lo que ya
// eligió. Un filtro que se cierra sobre sí mismo obliga a empezar de nuevo en
// cada pregunta.
//
// Lo que se elige queda arriba como fichas que se quitan de a una: es la
// única forma de saber qué está aplicado cuando el panel de filtros está
// cerrado, y de deshacer sin abrir nada.

import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, StyleSheet } from 'react-native';
import { Icon } from './icons';
import { C, SERIES } from './theme';
import { hap } from './ui';

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('es') : '');

/** Nombres legibles: `veta-wallet` no es lo que nadie llama a la app. */
export const NOMBRES = {
  'veta-wallet': 'Veta Wallet',
  mytokenpay: 'MyTokenPay',
  ordenscan: 'ordenscan',
  android: 'Teléfono (app)',
  ios: 'iPhone (app)',
  web: 'Navegador (web)',
  sesion: 'Ingresos',
  registro: 'Altas',
  pantalla: 'Pantallas',
  accion: 'Acciones',
  transaccion: 'Transacciones',
  error: 'Errores',
  rendimiento: 'Rendimiento',
  info: 'Información',
  aviso: 'Avisos',
  critico: 'Críticos',
  '??': 'Sin dato',
};
export const bonito = (v) => NOMBRES[v] ?? v;

/** Una fila de fichas elegibles, con su cuenta. Scroll horizontal. */
export function FilaFacetas({ titulo, opciones, valor, onElegir }) {
  if (!opciones?.length) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={st.grupo}>{titulo}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 7, paddingRight: 18 }}>
        <Pressable onPress={() => { hap(); onElegir(undefined); }}
          style={[st.ficha, !valor && st.fichaSel]}>
          <Text style={[st.fichaTxt, !valor && st.fichaTxtSel]}>Todas</Text>
        </Pressable>
        {opciones.map((o) => {
          const sel = valor === o.clave;
          return (
            <Pressable key={o.clave} onPress={() => { hap(); onElegir(sel ? undefined : o.clave); }}
              style={[st.ficha, sel && st.fichaSel]}>
              <Text style={[st.fichaTxt, sel && st.fichaTxtSel]}>{bonito(o.clave)}</Text>
              <Text style={[st.fichaN, sel && { color: C.gold }]}>{nf(o.total)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Las fichas de lo que está aplicado ahora, cada una con su ✕. */
export function Aplicados({ filtros, onQuitar, onLimpiar }) {
  const ETIQUETAS = {
    app: 'App', plataforma: 'Dónde', tipo: 'Tipo', gravedad: 'Gravedad',
    pais: 'País', moneda: 'Moneda', version: 'Versión', texto: 'Busca',
    desde: 'Desde', hasta: 'Hasta', horaDesde: 'Desde las', horaHasta: 'Hasta las',
    montoMin: 'Mínimo', montoMax: 'Máximo',
  };
  const puestos = Object.entries(filtros).filter(
    ([k, v]) => v !== undefined && v !== '' && ETIQUETAS[k]);
  if (!puestos.length) return null;

  const comoTexto = (k, v) => {
    if (k === 'horaDesde' || k === 'horaHasta') return `${String(v).padStart(2, '0')}:00`;
    if (k === 'montoMin' || k === 'montoMax') return `$${nf(Number(v))}`;
    return bonito(String(v));
  };

  return (
    <View style={st.aplicados}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 12 }}>
        {puestos.map(([k, v]) => (
          <Pressable key={k} onPress={() => { hap(); onQuitar(k); }} style={st.aplicado}>
            <Text style={st.aplicadoTxt}>
              <Text style={{ color: C.txt3 }}>{ETIQUETAS[k]}: </Text>{comoTexto(k, v)}
            </Text>
            <Icon name="close" size={12} color={C.gold} />
          </Pressable>
        ))}
        <Pressable onPress={() => { hap(); onLimpiar(); }} style={st.limpiar}>
          <Text style={st.limpiarTxt}>Limpiar todo</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * El panel de filtros. Se abre entero en vez de ir apareciendo por partes:
 * elegir cinco cosas seguidas en una pantalla que se reacomoda sola es la
 * forma más rápida de tocar la opción equivocada.
 */
export function PanelFiltros({ visible, cerrar, filtros, cambiar, facetas, total }) {
  const f = filtros;
  const set = (k) => (v) => cambiar({ ...f, [k]: v });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cerrar}>
      <View style={st.telon}>
        <View style={st.hoja}>
          <View style={st.hojaCab}>
            <Text style={st.hojaT}>Filtros</Text>
            <Text style={st.hojaN}>{nf(total)} eventos</Text>
            <Pressable onPress={() => { hap(); cerrar(); }} style={{ padding: 6 }}>
              <Icon name="close" size={20} color={C.txt2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }}>
            <FilaFacetas titulo="Aplicación" opciones={facetas?.app} valor={f.app} onElegir={set('app')} />
            <FilaFacetas titulo="Dónde la abrieron" opciones={facetas?.plataforma}
              valor={f.plataforma} onElegir={set('plataforma')} />
            <FilaFacetas titulo="Qué pasó" opciones={facetas?.tipo} valor={f.tipo} onElegir={set('tipo')} />
            <FilaFacetas titulo="Gravedad" opciones={facetas?.gravedad} valor={f.gravedad} onElegir={set('gravedad')} />
            <FilaFacetas titulo="País" opciones={facetas?.pais} valor={f.pais} onElegir={set('pais')} />
            <FilaFacetas titulo="Versión" opciones={facetas?.version} valor={f.version} onElegir={set('version')} />
            <FilaFacetas titulo="Moneda" opciones={facetas?.moneda} valor={f.moneda} onElegir={set('moneda')} />

            <Text style={st.grupo}>Franja horaria</Text>
            <Text style={st.pista}>
              La hora del evento, 0 a 23. Sirve para «anoche»: de 20 a 23.
            </Text>
            <View style={st.par}>
              <Numero valor={f.horaDesde} onCambiar={set('horaDesde')} etiqueta="Desde las" sufijo="h" max={23} />
              <Numero valor={f.horaHasta} onCambiar={set('horaHasta')} etiqueta="Hasta las" sufijo="h" max={23} />
            </View>
            <View style={st.atajos}>
              {[
                { t: 'Mañana', d: 6, h: 11 }, { t: 'Tarde', d: 12, h: 18 },
                { t: 'Noche', d: 19, h: 23 }, { t: 'Madrugada', d: 0, h: 5 },
              ].map((a) => (
                <Pressable key={a.t} onPress={() => { hap(); cambiar({ ...f, horaDesde: a.d, horaHasta: a.h }); }}
                  style={[st.ficha, f.horaDesde === a.d && f.horaHasta === a.h && st.fichaSel]}>
                  <Text style={[st.fichaTxt, f.horaDesde === a.d && f.horaHasta === a.h && st.fichaTxtSel]}>{a.t}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={st.grupo}>Importe</Text>
            <Text style={st.pista}>Sobre el valor de la operación, en dólares.</Text>
            <View style={st.par}>
              <Numero valor={f.montoMin} onCambiar={set('montoMin')} etiqueta="Mínimo" prefijo="$" />
              <Numero valor={f.montoMax} onCambiar={set('montoMax')} etiqueta="Máximo" prefijo="$" />
            </View>
            <View style={st.atajos}>
              {[100, 500, 1000, 10000].map((m) => (
                <Pressable key={m} onPress={() => { hap(); cambiar({ ...f, montoMin: m }); }}
                  style={[st.ficha, Number(f.montoMin) === m && st.fichaSel]}>
                  <Text style={[st.fichaTxt, Number(f.montoMin) === m && st.fichaTxtSel]}>Más de ${nf(m)}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={st.grupo}>Fechas</Text>
            <Text style={st.pista}>
              Formato AAAA-MM-DD. La telemetría guarda los últimos 90 días.
            </Text>
            <View style={st.par}>
              <Texto valor={f.desde} onCambiar={set('desde')} etiqueta="Desde el día" marcador="2026-08-01" />
              <Texto valor={f.hasta} onCambiar={set('hasta')} etiqueta="Hasta el día" marcador="2026-08-09" />
            </View>

            <Pressable onPress={() => { hap(); cerrar(); }} style={st.aplicar}>
              <Text style={st.aplicarTxt}>Ver {nf(total)} eventos</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Numero({ valor, onCambiar, etiqueta, prefijo, sufijo, max }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={st.campoEt}>{etiqueta}</Text>
      <View style={st.campoCaja}>
        {prefijo ? <Text style={st.afijo}>{prefijo}</Text> : null}
        <TextInput
          style={st.campoInput}
          value={valor === undefined || valor === null ? '' : String(valor)}
          onChangeText={(v) => {
            const limpio = v.replace(/[^0-9]/g, '');
            if (!limpio) return onCambiar(undefined);
            const n = Number(limpio);
            onCambiar(max !== undefined ? Math.min(max, n) : n);
          }}
          keyboardType="number-pad" placeholder="—" placeholderTextColor={C.txt3} />
        {sufijo ? <Text style={st.afijo}>{sufijo}</Text> : null}
      </View>
    </View>
  );
}

function Texto({ valor, onCambiar, etiqueta, marcador }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={st.campoEt}>{etiqueta}</Text>
      <View style={st.campoCaja}>
        <TextInput style={st.campoInput} value={valor ?? ''}
          onChangeText={(v) => onCambiar(v || undefined)}
          placeholder={marcador} placeholderTextColor={C.txt3}
          autoCapitalize="none" autoCorrect={false} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  grupo: {
    color: C.gold, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  pista: { color: C.txt3, fontSize: 11, lineHeight: 15.5, marginTop: -4, marginBottom: 9 },
  ficha: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  fichaSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.16)' },
  fichaTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  fichaTxtSel: { color: C.gold },
  fichaN: { color: C.txt3, fontSize: 10.5, fontVariant: ['tabular-nums'] },

  aplicados: { paddingLeft: 18, paddingVertical: 8 },
  aplicado: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.45)', backgroundColor: 'rgba(201,169,97,0.1)',
  },
  aplicadoTxt: { color: C.txt, fontSize: 11.5, fontWeight: '600' },
  limpiar: { paddingHorizontal: 10, paddingVertical: 6 },
  limpiarTxt: { color: C.txt3, fontSize: 11.5, textDecorationLine: 'underline' },

  telon: { flex: 1, backgroundColor: 'rgba(2,16,18,0.7)', justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: C.line, maxHeight: '88%',
  },
  hojaCab: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.line2,
  },
  hojaT: { color: C.txt, fontSize: 17, fontWeight: '800', flex: 1 },
  hojaN: { color: SERIES[0], fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },

  par: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  campoEt: { color: C.txt3, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 5 },
  campoCaja: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2,
    borderRadius: 10, paddingHorizontal: 11,
  },
  campoInput: { flex: 1, color: C.txt, paddingVertical: 10, fontSize: 14.5, fontVariant: ['tabular-nums'] },
  afijo: { color: C.txt3, fontSize: 13 },
  atajos: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },

  aplicar: {
    backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 18,
  },
  aplicarTxt: { color: C.darkText, fontWeight: '800', fontSize: 15 },
});
