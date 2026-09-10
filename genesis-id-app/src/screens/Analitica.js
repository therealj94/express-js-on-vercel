// Analítica del ecosistema en el teléfono.
//
// Consume EXACTAMENTE las mismas rutas que el panel web de /analitica. No hay
// un segundo cálculo aquí: dos fuentes de cifras que se contradicen es peor
// que no tener cifras en el móvil, porque nadie sabría a cuál creerle.
//
// Cuatro vistas, porque son cuatro preguntas distintas:
//   Gente       — cuántos son, de dónde, y dónde se caen en el trámite
//   Billeteras  — dónde está cada dirección y cuánto tiene en la cadena
//   Apps        — qué app trae gente y cuál la retiene
//   Monedas     — cuánto hay emitido de cada token y cuánta gente lo tiene

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, FlatList, RefreshControl, Pressable, TextInput,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { Icon } from '../icons';
import { C, SERIES } from '../theme';
import { Card, Kpi, Pastilla, Cabecera, Vacio, BotonPlano, hap, useToast } from '../ui';
import { Barras, Embudo, Serie, Reparto } from '../graficos';
import { Actividad } from './Actividad';
import { Sesiones } from './Sesiones';
import { Errores, FichaError } from './Errores';
import * as api from '../api';

// El orden no es alfabético: va de lo más consultado a lo más ocasional.
// «Actividad» y «Sesiones» son las que se abren cuando algo pasa ahora mismo.
const VISTAS = [
  { clave: 'gente', nombre: 'Gente' },
  { clave: 'actividad', nombre: 'Actividad' },
  { clave: 'sesiones', nombre: 'Ingresos' },
  { clave: 'errores', nombre: 'Errores' },
  { clave: 'billeteras', nombre: 'Billeteras' },
  { clave: 'apps', nombre: 'Apps' },
  { clave: 'monedas', nombre: 'Monedas' },
];

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('es') : '—');
const corta = (d) => (d ? `${d.slice(0, 6)}…${d.slice(-4)}` : '—');

export function Analitica({ avisar }) {
  const toast = useToast();
  const [vista, setVista] = useState('gente');
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState({});          // { resumen, embudo, apps, dir }
  const [billeteras, setBilleteras] = useState(null);
  const [busca, setBusca] = useState('');
  const [soloConSaldo, setSoloConSaldo] = useState(false);
  // El error abierto encima de la vista. Se guarda de dónde se entró para
  // devolver a la pestaña correcta: se llega desde Actividad y desde Errores.
  const [grupoError, setGrupoError] = useState(null);
  const retraso = useRef(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    // En paralelo: son cuatro consultas independientes y encadenarlas
    // multiplicaría por cuatro la espera en una conexión móvil.
    const [resumen, embudo, apps, dir] = await Promise.all([
      api.analiticaResumen(30),
      api.analiticaEmbudo(),
      api.analiticaApps(90),
      api.directorioResumen(),
    ]);
    setCargando(false);
    const fallo = [resumen, embudo, apps, dir].find((r) => r?.error && !r?.sesionVencida);
    if (fallo) avisar(fallo.error, true);
    setDatos({
      resumen: resumen?.error ? null : resumen,
      embudo: embudo?.error ? null : embudo,
      apps: apps?.error ? null : apps,
      dir: dir?.error ? null : dir,
    });
  }, [avisar]);

  useEffect(() => { cargar(); }, [cargar]);

  const cargarBilleteras = useCallback(async (texto = '') => {
    const r = await api.directorio({ texto: texto || undefined, conWallet: true, limite: 100 });
    if (r.error) { avisar(r.error, true); return; }
    setBilleteras(r);
  }, [avisar]);

  useEffect(() => {
    if (vista === 'billeteras' && billeteras === null) cargarBilleteras();
  }, [vista, billeteras, cargarBilleteras]);

  function buscar(v) {
    setBusca(v);
    clearTimeout(retraso.current);
    retraso.current = setTimeout(() => cargarBilleteras(v), 350);
  }

  async function pedirSaldos() {
    hap();
    const r = await api.refrescarSaldos();
    if (r.error) { toast(r.error, true); return; }
    // El servidor lee cientos de direcciones contra la cadena en segundo
    // plano; no tiene sentido dejar la pantalla girando esperándolo.
    toast(r.mensaje || 'Consultando la cadena. Volvé a bajar para refrescar en un minuto.');
  }

  const { resumen: R, embudo: E, apps: A, dir: D } = datos;

  // La ficha de un error se lleva la pantalla entera: es donde se decide a
  // quién llamar, y una pestaña arriba solo invitaría a perderla de vista.
  if (grupoError) {
    return <FichaError huella={grupoError} volver={() => setGrupoError(null)} avisar={avisar} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Analítica" sub="mismas cifras que el panel web" />

      {/* Siete pestañas no caben repartidas: se deslizan. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }} contentContainerStyle={st.pestanas}>
        {VISTAS.map((v) => (
          <Pressable key={v.clave} onPress={() => { hap(); setVista(v.clave); }}
            style={[st.pest, vista === v.clave && st.pestSel]}>
            <Text style={[st.pestTxt, vista === v.clave && st.pestTxtSel]}>{v.nombre}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {vista === 'actividad' ? (
        <Actividad avisar={avisar} verError={setGrupoError} />
      ) : vista === 'sesiones' ? (
        <Sesiones avisar={avisar} />
      ) : vista === 'errores' ? (
        <Errores avisar={avisar} abrirGrupo={setGrupoError} />
      ) : cargando && !R ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : vista === 'billeteras' ? (
        <VistaBilleteras
          datos={billeteras} dir={D} busca={busca} onBuscar={buscar}
          soloConSaldo={soloConSaldo} setSoloConSaldo={setSoloConSaldo}
          onRefrescar={() => cargarBilleteras(busca)} onPedirSaldos={pedirSaldos} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingTop: 6, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={C.gold} />}>
          {vista === 'gente' ? <VistaGente R={R} E={E} D={D} />
            : vista === 'apps' ? <VistaApps A={A} D={D} R={R} />
            : <VistaMonedas D={D} />}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────── gente ──────

function VistaGente({ R, E, D }) {
  const u = R?.usuarios;
  return (
    <>
      <View style={st.grilla}>
        <Kpi valor={nf(D?.total ?? u?.total)} etiqueta="Personas en el padrón"
          nota={D ? `${nf(D.conGid)} con Genesis ID` : null} />
        <Kpi valor={nf(u?.activos30)} etiqueta="Activos (30 días)" color={SERIES[1]}
          nota={u ? `${nf(u.activosHoy)} hoy` : null} />
        <Kpi valor={nf(u?.nuevosVentana)} etiqueta="Altas en 30 días"
          nota={u ? `${nf(u.nuevosHoy)} hoy · ${nf(u.nuevosAyer)} ayer` : null} />
        <Kpi valor={nf(D?.dormidos90)} etiqueta="Dormidos (90 días)" color={C.warn}
          nota="sin entrar en 3 meses" />
      </View>

      <Card>
        <Text style={st.titulo}>Altas y actividad</Text>
        <Text style={st.sub}>
          Las dos miden personas, así que comparten escala: una sube cuando entra
          gente nueva, la otra cuando la que ya está vuelve.
        </Text>
        {R?.serie ? (
          <Serie serie={R.serie} campos={[
            { campo: 'nuevos', nombre: 'Altas' },
            { campo: 'activos', nombre: 'Activos' },
          ]} />
        ) : <Text style={st.vacio}>Sin telemetría todavía.</Text>}
        {R && R.diasConDatos === 0 ? (
          <Text style={st.aviso}>
            Ningún día con datos: las apps aún no están reportando telemetría. El
            padrón y el embudo sí son reales.
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text style={st.titulo}>Embudo de verificación</Text>
        <Text style={st.sub}>
          Dónde se cae la gente. El número rojo es cuánta se perdió en ese
          escalón — es el que dice qué arreglar.
        </Text>
        <Embudo pasos={E?.pasos} />
        {E && (E.rechazadas > 0 || E.suspendidas > 0) ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {E.rechazadas > 0 ? <Pastilla texto={`${E.rechazadas} rechazadas`} color={C.bad} /> : null}
            {E.suspendidas > 0 ? <Pastilla texto={`${E.suspendidas} suspendidas`} color={C.crit} /> : null}
          </View>
        ) : null}
      </Card>

      {D?.porPais?.length ? (
        <Card>
          <Text style={st.titulo}>De dónde son</Text>
          <Barras datos={D.porPais.slice(0, 8).map((p) => ({
            clave: p.clave ?? p.pais, etiqueta: p.nombre ?? p.clave ?? p.pais ?? '—',
            valor: p.n ?? p.total ?? 0,
          }))} />
        </Card>
      ) : null}

      {D?.porKyc?.length ? (
        <Card>
          <Text style={st.titulo}>Estado de verificación en las apps</Text>
          <Barras datos={D.porKyc.map((k) => ({
            clave: k.clave, etiqueta: k.clave || 'sin declarar', valor: k.n ?? k.total ?? 0,
          }))} />
        </Card>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────── billeteras ──────

function VistaBilleteras({ datos, dir, busca, onBuscar, soloConSaldo, setSoloConSaldo, onRefrescar, onPedirSaldos }) {
  const lista = (datos?.usuarios || []).filter((u) => {
    if (!soloConSaldo) return true;
    return Object.values(u.saldos || {}).some((v) => Number(v) > 0);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={st.buscaCaja}>
        <Icon name="search" size={16} color={C.txt3} />
        <TextInput style={st.buscaInput} value={busca} onChangeText={onBuscar}
          placeholder="Dirección, correo, nombre o GID…" placeholderTextColor={C.txt3}
          autoCapitalize="none" autoCorrect={false} />
      </View>

      <View style={st.accionesFila}>
        <Pressable onPress={() => { hap(); setSoloConSaldo(!soloConSaldo); }}
          style={[st.chip, soloConSaldo && st.chipSel]}>
          <Text style={[st.chipTxt, soloConSaldo && st.chipTxtSel]}>Solo con saldo</Text>
        </Pressable>
        <BotonPlano title="Actualizar saldos" icon="sync" onPress={onPedirSaldos} />
      </View>

      {dir ? (
        <View style={st.resumenBilleteras}>
          <Text style={st.resumenTxt}>
            <Text style={{ color: SERIES[0], fontWeight: '800' }}>{nf(dir.conWallet)}</Text> billeteras
            {'  ·  '}
            <Text style={{ color: SERIES[1], fontWeight: '800' }}>{nf(dir.conSaldo)}</Text> con saldo
            {'  ·  '}
            <Text style={{ color: C.txt2 }}>{nf(dir.total)}</Text> personas
          </Text>
        </View>
      ) : null}

      <FlatList
        data={lista}
        keyExtractor={(u, i) => u._id ?? `${u.app}-${u.email}-${i}`}
        contentContainerStyle={{ padding: 18, paddingTop: 6, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefrescar} tintColor={C.gold} />}
        ListEmptyComponent={datos ? (
          <Vacio icon="wallet" texto={busca
            ? 'Ninguna billetera coincide con esa búsqueda.'
            : 'Todavía no hay billeteras en el padrón. Las apps las mandan al sincronizar.'} />
        ) : <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} />}
        renderItem={({ item: u }) => {
          const conSaldo = Object.entries(u.saldos || {}).filter(([, v]) => Number(v) > 0);
          return (
            <Card style={{ padding: 13 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={st.dir} selectable>{corta(u.direccionWallet)}</Text>
                <View style={{ flex: 1 }} />
                <Pastilla texto={u.app} color={SERIES[1]} />
              </View>
              <Text style={st.nombre} numberOfLines={1}>
                {u.nombre || u.usuario || u.email}
              </Text>
              <Text style={st.meta} numberOfLines={1}>
                {u.email}{u.pais ? ` · ${u.pais}` : ''}
                {u.gid ? ` · ${u.gid}` : ' · sin GID'}
              </Text>
              {conSaldo.length ? (
                <View style={st.saldos}>
                  {conSaldo.map(([sim, val]) => (
                    <View key={sim} style={st.saldoChip}>
                      <Text style={st.saldoSim}>{sim}</Text>
                      <Text style={st.saldoVal}>{nf(val)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={st.sinSaldo}>Sin saldo en la cadena</Text>
              )}
            </Card>
          );
        }}
      />
    </View>
  );
}

// ───────────────────────────────────────────────────────────────── apps ─────

function VistaApps({ A, D, R }) {
  const apps = A?.apps || [];
  const porApp = D?.porApp || [];

  return (
    <>
      {porApp.length ? (
        <Card>
          <Text style={st.titulo}>Personas por aplicación</Text>
          <Text style={st.sub}>Del padrón: cuánta gente tiene cuenta en cada una.</Text>
          <Barras datos={porApp.map((a) => ({
            clave: a.clave ?? a.app, etiqueta: a.clave ?? a.app ?? '—', valor: a.n ?? a.total ?? 0,
          }))} />
        </Card>
      ) : null}

      {apps.length ? (
        <Card>
          <Text style={st.titulo}>Actividad por aplicación (90 días)</Text>
          {apps.map((a) => (
            <View key={a.app ?? a.clave} style={st.filaApp}>
              <View style={{ flex: 1 }}>
                <Text style={st.appNombre}>{a.app ?? a.clave}</Text>
                <Text style={st.meta}>
                  {nf(a.eventos ?? 0)} eventos · {nf(a.usuarios ?? a.activos ?? 0)} personas
                  {a.errores != null ? ` · ${nf(a.errores)} errores` : ''}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <Text style={st.titulo}>Actividad por aplicación</Text>
          <Text style={st.vacio}>
            Ninguna app está reportando telemetría todavía. Se activa dándole a
            cada app su clave pública de ingesta desde el panel web.
          </Text>
        </Card>
      )}

      {R?.errores ? (
        <Card>
          <Text style={st.titulo}>Errores</Text>
          <View style={st.grilla}>
            <Kpi valor={nf(R.errores.hoy)} etiqueta="Hoy"
              color={R.errores.hoy > 0 ? C.bad : C.ok} nota={`ayer: ${nf(R.errores.ayer)}`} />
            <Kpi valor={nf(R.errores.criticosHoy)} etiqueta="Críticos hoy"
              color={R.errores.criticosHoy > 0 ? C.crit : C.ok} />
            <Kpi valor={nf(R.errores.ventana)} etiqueta="En 30 días" />
            <Kpi valor={`${R.errores.tasaPorMil ?? 0}‰`} etiqueta="Por mil eventos"
              color={SERIES[1]} />
          </View>
        </Card>
      ) : null}

      {R?.plataformas?.length ? (
        <Card>
          <Text style={st.titulo}>Plataformas</Text>
          <Barras datos={R.plataformas.slice(0, 6).map((p) => ({
            clave: p.clave, etiqueta: p.clave || '—', valor: p.n ?? p.total ?? 0,
          }))} />
        </Card>
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────── monedas ────

function VistaMonedas({ D }) {
  const monedas = D?.porMoneda || [];
  const conTenedores = monedas.filter((m) => (m.tenedores ?? 0) > 0);

  return (
    <>
      <Card>
        <Text style={st.titulo}>Las monedas del ecosistema</Text>
        <Text style={st.sub}>
          Lo que hay emitido en la cadena 5550 y cuánta gente del padrón tiene
          cada una. «Emitida, sin repartir» significa que existe el contrato
          pero nadie la tiene todavía.
        </Text>
        {conTenedores.length ? (
          <Barras datos={conTenedores.map((m) => ({
            clave: m.simbolo, etiqueta: `${m.simbolo} — ${m.nombre}`, valor: m.tenedores,
          }))} sufijo=" tenedores" />
        ) : (
          <Text style={st.vacio}>
            Ninguna moneda tiene tenedores en el padrón todavía.
          </Text>
        )}
      </Card>

      <Card>
        <Text style={st.titulo}>Todas las monedas ({monedas.length})</Text>
        {monedas.map((m) => (
          <View key={m.simbolo} style={st.filaMoneda}>
            <View style={{ flex: 1 }}>
              <Text style={st.monedaSim}>{m.simbolo}</Text>
              <Text style={st.meta} numberOfLines={1}>{m.nombre}</Text>
              <Text style={st.contrato} numberOfLines={1} selectable>{m.contrato}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[st.monedaTotal, { color: (m.total ?? 0) > 0 ? SERIES[0] : C.txt3 }]}>
                {nf(m.total ?? 0)}
              </Text>
              <Text style={st.meta}>{nf(m.tenedores ?? 0)} tenedores</Text>
              {m.estado ? <Text style={st.estadoMoneda}>{m.estado}</Text> : null}
            </View>
          </View>
        ))}
        {!monedas.length ? <Text style={st.vacio}>Sin datos de monedas.</Text> : null}
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  pestanas: { gap: 6, paddingHorizontal: 18, paddingBottom: 10 },
  pest: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, alignItems: 'center',
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  pestSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.14)' },
  pestTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  pestTxtSel: { color: C.gold },

  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  titulo: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 4 },
  sub: { color: C.txt3, fontSize: 11.5, lineHeight: 16.5, marginBottom: 12 },
  vacio: { color: C.txt3, fontSize: 12, lineHeight: 17, paddingVertical: 6 },
  aviso: { color: C.warn, fontSize: 11.5, lineHeight: 16.5, marginTop: 10 },
  meta: { color: C.txt3, fontSize: 11 },

  buscaCaja: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 18,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2,
    borderRadius: 12, paddingHorizontal: 13,
  },
  buscaInput: { flex: 1, color: C.txt, paddingVertical: 10, fontSize: 14 },
  accionesFila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  chipSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.14)' },
  chipTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  chipTxtSel: { color: C.gold },
  resumenBilleteras: { paddingHorizontal: 18, paddingTop: 10 },
  resumenTxt: { color: C.txt3, fontSize: 12, fontVariant: ['tabular-nums'] },

  dir: { color: C.goldLt, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  nombre: { color: C.txt, fontSize: 13.5, fontWeight: '600', marginTop: 6 },
  saldos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  saldoChip: {
    flexDirection: 'row', alignItems: 'baseline', gap: 5,
    borderWidth: 1, borderColor: 'rgba(58,175,198,0.4)', backgroundColor: 'rgba(58,175,198,0.1)',
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3,
  },
  saldoSim: { color: SERIES[1], fontSize: 10.5, fontWeight: '800' },
  saldoVal: { color: C.txt, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  sinSaldo: { color: C.txt3, fontSize: 11, marginTop: 7 },

  filaApp: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  appNombre: { color: C.txt, fontSize: 13.5, fontWeight: '700' },

  filaMoneda: {
    flexDirection: 'row', gap: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  monedaSim: { color: C.txt, fontSize: 13.5, fontWeight: '800' },
  contrato: { color: C.txt3, fontSize: 9.5, marginTop: 2 },
  monedaTotal: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  estadoMoneda: { color: C.txt3, fontSize: 9.5, marginTop: 2, textAlign: 'right', maxWidth: 110 },
});
