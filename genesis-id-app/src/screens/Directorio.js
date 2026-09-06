// El padrón del ecosistema: quién es cada persona, en qué app y con cuánto.
//
// Es la pantalla que la web tenía y el teléfono no. La diferencia con el resto
// del panel es importante y está dicha en el pie: aquí SÍ hay datos personales
// —nombre, correo, teléfono, billetera— mientras que la analítica es anónima a
// propósito. Cada búsqueda y cada ficha quedan escritas en la bitácora con el
// nombre de quien las hizo; eso lo hace el servidor, no hace falta nada aquí.
//
// POR QUE LOS FILTROS SON PASTILLAS Y NO DESPLEGABLES
//
// La web tiene once desplegables en una fila. En un teléfono eso es una pared
// de cajas grises donde no se ve cuál está puesto. Con pastillas el estado se
// lee de un vistazo —encendida es que filtra— y se apaga tocándola otra vez,
// que es un gesto y no tres.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Cabecera, Card, Kpi, Pastilla, Vacio, BotonPlano, hap } from '../ui';
import * as api from '../api';

/** Un número grande, corto: 12 400 en vez de 12400. */
const n = (v) => (typeof v === 'number' ? v.toLocaleString('es') : '—');
const monto = (v) => Number(v).toLocaleString('es', { maximumFractionDigits: 4 });

const corta = (d) => (d ? `${d.slice(0, 8)}…${d.slice(-6)}` : null);

/**
 * Cuánto hace, en minutos si hace falta.
 *
 * La versión anterior empezaba en «hoy», y con eso no se distinguía a quien
 * está dentro AHORA MISMO de quien entró a las siete de la mañana. Para saber
 * si alguien está usando la app en este momento —que es media pregunta de las
 * que se le hacen a esta pantalla— los minutos son justamente lo que importa.
 */
function cuando(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} d`;
  if (d < 365) return `hace ${Math.floor(d / 30)} m`;
  return `hace ${Math.floor(d / 365)} a`;
}

/** Los tramos de presencia, en el orden en que se leen. */
const TRAMOS = [
  { clave: 'ahora', nombre: 'Ahora', sub: 'última hora', color: C.ok },
  { clave: 'hoy', nombre: 'Hoy', sub: '24 horas', color: C.cyan },
  { clave: 'semana', nombre: 'Semana', sub: '7 días', color: C.goldLt },
  { clave: 'mes', nombre: 'Mes', sub: '30 días', color: C.gold },
  { clave: 'dormido', nombre: 'Dormidos', sub: '+30 días', color: C.warn },
  { clave: 'nunca', nombre: 'Nunca', sub: 'sin señal', color: C.txt3 },
];

const COLOR_TRAMO = Object.fromEntries(TRAMOS.map((t) => [t.clave, t.color]));

/** Cómo se llama cada plataforma en la pantalla. */
const PLATAFORMA = { android: 'teléfono', ios: 'iPhone', web: 'web', desconocida: '—' };

/** Los filtros que caben en un teléfono sin volverse un formulario. */
const FILTROS = [
  { k: 'conWallet', v: true, t: 'Con billetera' },
  { k: 'conSaldo', v: true, t: 'Con saldo' },
  { k: 'conGid', v: true, t: 'Verificados' },
  { k: 'conGid', v: false, t: 'Sin verificar' },
  { k: 'nuncaEntro', v: true, t: 'Nunca entró' },
  { k: 'inactivosDias', v: 90, t: 'Dormidos +90 d' },
  { k: 'registradoDias', v: 30, t: 'Altas del mes' },
];

export function Directorio({ avisar, abrirPersona, volver }) {
  const [resumen, setResumen] = useState(null);
  const [lista, setLista] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState({});
  const [app, setApp] = useState('todas');
  const [moneda, setMoneda] = useState('');
  const [tramo, setTramo] = useState('');
  const [refrescando, setRefrescando] = useState(false);

  const traer = useCallback(async (busqueda, f, laApp, laMoneda, elTramo) => {
    setCargando(true);
    const [r, l] = await Promise.all([
      api.directorioResumen(),
      api.directorio({
        texto: busqueda, app: laApp, moneda: laMoneda, tramo: elTramo || undefined,
        limite: 60, ...f,
      }),
    ]);
    setCargando(false);
    if (r.error || l.error) {
      avisar((r.error || l.error), true);
      return;
    }
    setResumen(r);
    setLista(l);
  }, [avisar]);

  useEffect(() => { traer('', {}, 'todas', '', ''); }, [traer]);

  // La búsqueda espera a que se deje de escribir. Sin esto cada letra dispara
  // una consulta al padrón entero — y además una línea en la bitácora.
  useEffect(() => {
    const t = setTimeout(() => { traer(texto, filtros, app, moneda, tramo); }, texto ? 450 : 0);
    return () => clearTimeout(t);
  }, [texto, filtros, app, moneda, tramo, traer]);

  function alternar(k, v) {
    hap();
    setFiltros((f) => (f[k] === v ? (({ [k]: _, ...resto }) => resto)(f) : { ...f, [k]: v }));
  }

  async function pedirSaldos() {
    hap();
    setRefrescando(true);
    const r = await api.refrescarSaldos();
    setRefrescando(false);
    avisar(r.error || r.mensaje || 'Consultando la cadena…', Boolean(r.error));
  }

  const puestos = Object.keys(filtros).length + (app !== 'todas' ? 1 : 0)
    + (moneda ? 1 : 0) + (tramo ? 1 : 0);

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo="Directorio" sub="todas las personas del ecosistema"
        onAtras={volver}
        derecha={
          <Pressable onPress={() => traer(texto, filtros, app, moneda, tramo)} hitSlop={8} style={{ padding: 6 }}>
            <Icon name="sync" size={17} color={C.gold} />
          </Pressable>
        } />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        keyboardShouldPersistTaps="handled">

        <View style={st.buscador}>
          <Icon name="search" size={16} color={C.txt3} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Correo, nombre, billetera, GID o teléfono"
            placeholderTextColor={C.txt3}
            style={st.input}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search" />
          {texto ? (
            <Pressable onPress={() => { hap(); setTexto(''); }} hitSlop={8}>
              <Icon name="close-circle" size={16} color={C.txt3} />
            </Pressable>
          ) : null}
        </View>

        {resumen ? (
          <View style={st.kpis}>
            <Kpi valor={n(resumen.total)} etiqueta="personas" />
            <Kpi valor={n(resumen.conWallet)} etiqueta="con billetera" color={C.cyan} />
            <Kpi valor={n(resumen.conSaldo)} etiqueta="con saldo" color={C.gold} />
            <Kpi valor={n(resumen.conGid)} etiqueta="verificadas" color={C.ok} />
          </View>
        ) : null}

        {/* ── Quién anda por aquí ─────────────────────────────────────────
            La respuesta a «¿quién entró y hace cuánto?» de un vistazo. Cada
            tramo es un botón: se toca y la lista se queda con esa gente. Los
            recuentos se calculan con el resto de filtros puestos pero sin el
            de tramo, así que al elegir uno los demás siguen enseñando cuánta
            gente hay — si no, caerían a cero y no habría a dónde volver. */}
        {lista?.tramos ? (
          <Card style={{ marginBottom: 12 }}>
            <View style={st.filaTit}>
              <Text style={st.h}>Quién anda por aquí</Text>
              {tramo ? (
                <Pressable onPress={() => { hap(); setTramo(''); }} hitSlop={8}>
                  <Text style={st.quitar}>ver todos</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={st.tramos}>
              {TRAMOS.map((t) => {
                const cuantos = lista.tramos[t.clave] ?? 0;
                const puesto = tramo === t.clave;
                return (
                  <Pressable key={t.clave}
                    onPress={() => { hap(); setTramo(puesto ? '' : t.clave); }}
                    style={[st.tramo, puesto && { borderColor: t.color, backgroundColor: t.color + '1A' }]}>
                    <Text style={[st.tramoN, { color: cuantos ? t.color : C.txt3 }]}>{n(cuantos)}</Text>
                    <Text style={[st.tramoT, puesto && { color: C.txt }]}>{t.nombre}</Text>
                    <Text style={st.tramoS}>{t.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Si NADIE manda telemetría, los tramos son casi todos «nunca» y
                eso no es un dato sino un montaje a medias. Se dice, porque si
                no parece que el ecosistema está muerto. */}
            {resumen && resumen.conTelemetria === 0 ? (
              <View style={st.aviso}>
                <Icon name="alert-circle" size={15} color={C.warn} />
                <Text style={st.avisoTxt}>
                  Ninguna app está reportando todavía, así que «hace cuánto» solo
                  puede salir de lo que cada app manda al sincronizar su padrón —
                  cada seis horas, y solo si su backend escribe la fecha de
                  entrada. Con la telemetría montada esto pasa a verse al minuto.
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.filaFiltros}>
          {resumen?.porApp?.length > 1 ? (
            <Pressable onPress={() => {
              hap();
              const claves = ['todas', ...resumen.porApp.map((a) => a.clave)];
              setApp(claves[(claves.indexOf(app) + 1) % claves.length]);
            }}>
              <Pastilla texto={app === 'todas' ? 'Todas las apps' : app}
                color={app === 'todas' ? C.txt3 : C.cyan} />
            </Pressable>
          ) : null}
          {FILTROS.map((f) => (
            <Pressable key={`${f.k}-${f.v}`} onPress={() => alternar(f.k, f.v)}>
              <Pastilla texto={f.t} color={filtros[f.k] === f.v ? C.gold : C.txt3} />
            </Pressable>
          ))}
        </ScrollView>

        {puestos ? (
          <Pressable onPress={() => { hap(); setFiltros({}); setApp('todas'); setMoneda(''); setTramo(''); }}
            style={st.limpiar}>
            <Text style={st.limpiarTxt}>
              {puestos} filtro{puestos > 1 ? 's' : ''} puesto{puestos > 1 ? 's' : ''} · limpiar
            </Text>
          </Pressable>
        ) : null}

        {/* Las monedas, leídas de la cadena */}
        {resumen?.porMoneda?.length ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={st.h}>Monedas del ecosistema</Text>
            <Text style={st.sub}>leídas de la cadena 5550, no de las apps</Text>
            {resumen.porMoneda.map((m) => (
              <Pressable key={m.simbolo} disabled={!m.tenedores}
                onPress={() => { hap(); setMoneda(moneda === m.simbolo ? '' : m.simbolo); }}
                style={[st.moneda, moneda === m.simbolo && st.monedaSel]}>
                <View style={{ flex: 1 }}>
                  <Text style={st.monedaS}>{m.simbolo}</Text>
                  <Text style={st.monedaN} numberOfLines={1}>{m.nombre}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.monedaT}>
                    {m.tenedores ? `${n(m.tenedores)} personas` : 'nadie la tiene'}
                  </Text>
                  <Text style={st.monedaE}>{m.estado}</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        ) : null}

        <BotonPlano title={refrescando ? 'Consultando la cadena…' : 'Actualizar saldos'}
          icon="sync" onPress={pedirSaldos} disabled={refrescando} />

        {/* La lista */}
        {cargando && !lista ? (
          <ActivityIndicator color={C.gold} style={{ marginTop: 26 }} />
        ) : !lista?.usuarios?.length ? (
          <Vacio icon="people"
            titulo={texto || puestos ? 'Nadie coincide' : 'El directorio está vacío'}
            detalle={texto || puestos
              ? 'Probá con menos filtros o con otro texto.'
              : 'Cada app sincroniza su padrón sola cada seis horas. Si sigue vacío, falta montar el envío en el backend de la app.'} />
        ) : (
          <>
            <Text style={st.contador}>
              {n(lista.total)} {lista.total === 1 ? 'persona' : 'personas'}
              {lista.usuarios.length < lista.total ? ` · mostrando ${lista.usuarios.length}` : ''}
            </Text>
            {lista.usuarios.map((u, i) => {
              const saldos = Object.entries(u.saldos || {})
                .filter(([m, x]) => x > 0 && (!moneda || m === moneda))
                .sort((a, b) => b[1] - a[1]);
              // Las plataformas por las que entró, la más reciente primero.
              const plats = Object.entries(u.plataformas || {})
                .sort((a, b) => String(b[1]).localeCompare(String(a[1])));
              return (
                <Pressable key={`${u.email}-${u.app}-${i}`}
                  onPress={() => { hap(); abrirPersona(u.email); }}
                  style={st.fila}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={st.nombre} numberOfLines={1}>
                      {u.nombre || u.usuario || '—'}
                    </Text>
                    <Text style={st.correo} numberOfLines={1}>{u.email}</Text>
                    <View style={st.etiquetas}>
                      <Pastilla texto={u.app} color={C.txt3} />
                      {u.gid ? <Pastilla texto="verificado" color={C.ok} />
                        : <Pastilla texto="sin verificar" color={C.txt3} />}
                      {/* El país desde el que entra de verdad manda sobre el
                          que declaró al registrarse. Cuando no coinciden se
                          enseñan los dos: esa diferencia es justo lo que un
                          revisor de cumplimiento necesita ver. */}
                      {u.paisReal && u.paisReal !== u.pais ? (
                        <Pastilla texto={`entra desde ${u.paisReal}`} color={C.warn} />
                      ) : null}
                      {u.pais ? <Pastilla texto={u.pais} color={C.txt3} /> : null}
                    </View>
                    {plats.length ? (
                      <Text style={st.plats} numberOfLines={1}>
                        {plats.map(([p, t]) =>
                          `${PLATAFORMA[p] || p} ${cuando(t)}`).join('  ·  ')}
                      </Text>
                    ) : null}
                    {u.direccionWallet ? (
                      <Text style={st.wallet}>{corta(u.direccionWallet)}</Text>
                    ) : (
                      <Text style={[st.wallet, { color: C.txt3 }]}>sin billetera</Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3, maxWidth: 120 }}>
                    {saldos.length ? saldos.slice(0, 3).map(([m, x]) => (
                      <Text key={m} style={st.saldo} numberOfLines={1}>
                        {monto(x)} <Text style={{ color: C.txt3 }}>{m}</Text>
                      </Text>
                    )) : <Text style={[st.saldo, { color: C.txt3 }]}>0</Text>}
                    {saldos.length > 3 ? (
                      <Text style={st.mas}>+{saldos.length - 3} más</Text>
                    ) : null}
                    {/* El punto de color dice el tramo sin tener que leer la
                        fecha: verde es que está dentro ahora. */}
                    <View style={st.visto}>
                      <View style={[st.punto, { backgroundColor: COLOR_TRAMO[u.tramo] || C.txt3 }]} />
                      <Text style={[st.ultimo, { color: COLOR_TRAMO[u.tramo] || C.txt3 }]}>
                        {u.vistoEn ? cuando(u.vistoEn) : 'nunca entró'}
                      </Text>
                    </View>
                    {/* De dónde salió esa fecha. Importa: la del padrón puede
                        ir seis horas por detrás, la de telemetría es del
                        minuto. Sin decirlo, las dos parecen igual de fiables. */}
                    {u.vistoEn ? (
                      <Text style={st.fuente}>
                        {u.fuenteVisto === 'telemetria' ? 'en vivo' : 'según su app'}
                      </Text>
                    ) : null}
                  </View>
                  <Icon name="chevron-forward" size={15} color={C.txt3} />
                </Pressable>
              );
            })}
          </>
        )}

        <Text style={st.pie}>
          Esta pantalla muestra datos personales y, a diferencia del resto del
          panel, no es anónima. Cada búsqueda y cada ficha quedan escritas en la
          bitácora con tu nombre. Las llaves privadas y las frases de respaldo
          de los clientes nunca salen de su base original.
        </Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  buscador: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.input,
    borderWidth: 1, borderColor: C.line2, borderRadius: 11, paddingHorizontal: 12,
    height: 44, marginBottom: 12,
  },
  input: { flex: 1, color: C.txt, fontSize: 14 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filaFiltros: { gap: 7, paddingVertical: 2, paddingRight: 12 },
  limpiar: { paddingVertical: 8 },
  limpiarTxt: { color: C.gold, fontSize: 12, fontWeight: '600' },
  h: { color: C.txt, fontSize: 14, fontWeight: '700' },
  sub: { color: C.txt3, fontSize: 11.5, marginBottom: 8 },
  filaTit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quitar: { color: C.gold, fontSize: 11.5, fontWeight: '600' },
  tramos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tramo: {
    flexGrow: 1, minWidth: 84, alignItems: 'center', paddingVertical: 9,
    paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: C.line2,
  },
  tramoN: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tramoT: { color: C.txt2, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  tramoS: { color: C.txt3, fontSize: 9.5 },
  aviso: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12 },
  avisoTxt: { color: C.txt2, fontSize: 11.5, lineHeight: 16.5, flex: 1 },
  plats: { color: C.txt3, fontSize: 10.5, marginTop: 3 },
  visto: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  punto: { width: 6, height: 6, borderRadius: 3 },
  fuente: { color: C.txt3, fontSize: 9.5 },
  moneda: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: C.line2,
  },
  monedaSel: { backgroundColor: 'rgba(201,169,97,.08)' },
  monedaS: { color: C.txt, fontSize: 13.5, fontWeight: '700' },
  monedaN: { color: C.txt3, fontSize: 11 },
  monedaT: { color: C.txt2, fontSize: 12 },
  monedaE: { color: C.txt3, fontSize: 10.5 },
  contador: { color: C.txt2, fontSize: 12.5, marginTop: 16, marginBottom: 6, fontWeight: '600' },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: C.line2,
  },
  nombre: { color: C.txt, fontSize: 14, fontWeight: '700' },
  correo: { color: C.txt3, fontSize: 11.5 },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  wallet: { color: C.txt2, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  saldo: { color: C.txt, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  mas: { color: C.txt3, fontSize: 10 },
  ultimo: { color: C.txt3, fontSize: 10.5 },
  pie: { color: C.txt3, fontSize: 11, lineHeight: 16, marginTop: 22 },
});
