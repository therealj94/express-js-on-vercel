// El tablero: los números del sistema y su salud, de un vistazo.
//
// El orden es deliberado: primero LO QUE ESPERA UNA DECISIÓN (revisión y
// casos abiertos, que es a lo que un operador viene), después el estado del
// motor, y al final los totales. Un tablero que abre con los totales se ve
// bonito y no ayuda a nadie a decidir qué hacer ahora.

import React from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Pressable } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Card, Kpi, Pastilla, Cabecera, hap } from '../ui';

const usd = (n) => '$' + Math.round(n || 0).toLocaleString('es');

export function Resumen({ datos, cargando, refrescar, operador, irA }) {
  const d = datos;
  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Resumen" sub={`${operador?.nombre || ''} · ${operador?.rol || ''}`} />
      <ScrollView
        contentContainerStyle={st.lienzo}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={refrescar} tintColor={C.gold} />}>

        {!d ? null : (
          <>
            {/* ── lo que espera una decisión ────────────────────────────── */}
            <Text style={st.seccion}>Esperando decisión</Text>
            <View style={st.grilla}>
              <Pressable style={{ flex: 1, minWidth: '44%' }} onPress={() => { hap(); irA('identidades'); }}>
                <Kpi valor={d.identidades.enRevision} etiqueta="Identidades en revisión"
                  color={d.identidades.enRevision > 0 ? C.warn : C.ok} nota="tocá para ir a la cola" />
              </Pressable>
              <Pressable style={{ flex: 1, minWidth: '44%' }} onPress={() => { hap(); irA('casos'); }}>
                <Kpi valor={d.casos.abiertos ?? d.casos.total ?? 0} etiqueta="Casos AML abiertos"
                  color={(d.casos.abiertos ?? 0) > 0 ? C.warn : C.ok} nota="tocá para verlos" />
              </Pressable>
            </View>

            {/* ── salud del motor ───────────────────────────────────────── */}
            <Text style={st.seccion}>Salud del sistema</Text>
            <Card>
              <Salud ok={!d.salud.almacen?.efimero}
                bien={`Datos en ${d.salud.almacen?.motor || 'almacén persistente'}`}
                mal="Almacén EFÍMERO (archivo): sin Mongo, todo se pierde en el próximo despliegue" />
              <Salud ok={(d.salud.listas?.registros ?? 0) > 0}
                bien={`Listas de sanciones: ${d.salud.listas?.registros?.toLocaleString('es')} registros`}
                mal="SIN listas de sanciones — nadie está siendo tamizado" />
              <Salud ok={d.salud.biometria && d.salud.biometria !== 'sin proveedor'}
                bien={`Biometría: ${d.salud.biometria}`}
                mal="Sin proveedor de biometría — el cotejo de rostro es manual" />
              <Salud ok={d.salud.bitacora?.integra !== false}
                bien="Bitácora íntegra (cadena de hashes verificada)"
                mal="LA BITÁCORA NO CUADRA — alguien tocó el registro" />
              <Salud ok={Boolean(d.salud.sso)}
                bien="SSO del ecosistema activo"
                mal="SSO apagado (falta GENESIS_SSO_SECRETO)" />
            </Card>

            {/* ── analítica ─────────────────────────────────────────────── */}
            <Text style={st.seccion}>Identidades</Text>
            <View style={st.grilla}>
              <Kpi valor={d.identidades.total} etiqueta="Registradas" />
              <Kpi valor={d.identidades.verificadas} etiqueta="Verificadas" color={C.ok} />
              <Kpi valor={d.identidades.rechazadas + d.identidades.suspendidas}
                etiqueta="Rechazadas + suspendidas" color={C.bad} />
              <Kpi valor={d.identidades.riesgoAlto} etiqueta="Riesgo alto"
                color={d.identidades.riesgoAlto > 0 ? C.bad : C.ok} />
              <Kpi valor={d.identidades.pep} etiqueta="PEP" color={C.warn} />
              <Kpi valor={d.identidades.sinTerminar} etiqueta="Sin terminar" color={C.txt3}
                nota="empezaron y no acabaron" />
            </View>

            {/* Distribución en barra: proporción de estados, sin librería. */}
            <Card>
              <Text style={st.cardT}>Distribución</Text>
              <Barra partes={[
                { n: d.identidades.verificadas, color: C.ok },
                { n: d.identidades.enRevision, color: C.warn },
                { n: d.identidades.sinTerminar, color: C.txt3 },
                { n: d.identidades.rechazadas + d.identidades.suspendidas, color: C.bad },
              ]} />
              <View style={st.leyenda}>
                <Ley color={C.ok} t="verificadas" />
                <Ley color={C.warn} t="en revisión" />
                <Ley color={C.txt3} t="sin terminar" />
                <Ley color={C.bad} t="rechazadas" />
              </View>
            </Card>

            <Text style={st.seccion}>Movimiento</Text>
            <View style={st.grilla}>
              <Kpi valor={d.movimientos.total} etiqueta="Transacciones monitoreadas" />
              <Kpi valor={usd(d.movimientos.volumenUsd)} etiqueta="Volumen total (USD)" color={C.cyan} />
              <Kpi valor={d.negocios.total} etiqueta="Negocios (KYB)" />
              <Kpi valor={d.casos.total ?? 0} etiqueta="Casos históricos" />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Salud({ ok, bien, mal }) {
  return (
    <View style={st.salud}>
      <Icon name={ok ? 'checkmark-circle' : 'warning'} size={17} color={ok ? C.ok : C.warn} />
      <Text style={[st.saludTxt, !ok && { color: C.warn }]}>{ok ? bien : mal}</Text>
    </View>
  );
}

function Barra({ partes }) {
  const total = partes.reduce((s, p) => s + p.n, 0) || 1;
  return (
    <View style={st.barra}>
      {partes.filter((p) => p.n > 0).map((p, i) => (
        <View key={i} style={{ flex: p.n / total, backgroundColor: p.color }} />
      ))}
    </View>
  );
}

const Ley = ({ color, t }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    <Text style={{ color: C.txt3, fontSize: 10.5 }}>{t}</Text>
  </View>
);

const st = StyleSheet.create({
  lienzo: { padding: 18, paddingBottom: 40 },
  seccion: {
    color: C.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
    textTransform: 'uppercase', marginBottom: 10, marginTop: 8,
  },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  salud: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  saludTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  cardT: { color: C.txt, fontWeight: '700', fontSize: 13, marginBottom: 10 },
  barra: { flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', backgroundColor: C.input },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
});
