// Últimas conexiones: quién entró, cuándo, desde dónde, con qué billetera.
//
// QUE PREGUNTA CONTESTA
//
// «¿Quién está entrando a Veta Wallet?» — y la respuesta útil no es un número,
// es una lista de personas con nombre, correo y billetera, ordenada por lo más
// reciente. Por eso Veta Wallet viene elegida de entrada: es la app por la que
// se pregunta, y llegar a una lista de todo el ecosistema obliga a filtrar
// antes de poder leer nada.
//
// LA APP Y LA WEB SE VEN POR SEPARADO
//
// Alguien que dejó de abrir la app pero sigue entrando por el navegador no
// está perdido, y con un solo «último acceso» esa diferencia no se ve — la
// plataforma que quedaba era la del último toque y tapaba a la otra.
//
// DE DONDE SALE EL NOMBRE
//
// De cruzar el padrón con la huella de telemetría, que es anónima. Quien no
// esté en el padrón aparece como «sin identificar», nunca con un nombre
// inventado: en una pantalla que se usa para decidir a quién llamar, adivinar
// es peor que no saber.
//
// SE ACTUALIZA SOLA
//
// Cada 30 segundos mientras la pantalla está abierta, y con el botón de
// arriba cuando no se quiere esperar. Se para al salir: una pantalla que no
// se está mirando no tiene por qué seguir consultando, y en un teléfono eso
// es batería.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, RefreshControl, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Icon } from '../icons';
import { C, SERIES } from '../theme';
import { Card, Vacio, Pastilla, hap } from '../ui';
import { bonito } from '../filtros';
import * as api from '../api';

const nf = (n) => (typeof n === 'number' ? n.toLocaleString('es') : '—');

function hace(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const reloj = (iso) => (iso ? new Date(iso).toLocaleString('es', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—');

/** La billetera entera no cabe; los extremos son lo que se compara a ojo. */
const corta = (d) => (d ? `${d.slice(0, 10)}…${d.slice(-8)}` : null);

/** Verde si entró en la última hora. Es la señal de «está dentro ahora». */
const colorDe = (iso) => {
  if (!iso) return C.txt3;
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  if (min < 60) return C.ok;
  if (min < 60 * 24) return C.cyan;
  if (min < 60 * 24 * 7) return C.goldLt;
  return C.txt3;
};

const DONDE = [
  { clave: 'todas', nombre: 'Todo' },
  { clave: 'android', nombre: 'App' },
  { clave: 'web', nombre: 'Web' },
];

const APPS = ['veta-wallet', 'mytokenpay', 'todas'];

/** Cada cuánto se refresca sola, en milisegundos. */
const CADA = 30000;

export function Sesiones({ avisar }) {
  const [plataforma, setPlataforma] = useState('todas');
  // Veta Wallet de entrada: es la app por la que se pregunta.
  const [app, setApp] = useState('veta-wallet');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [actualizado, setActualizado] = useState(null);
  // Los filtros vivos, para que el temporizador no se quede con los de hace
  // media hora: un `setInterval` captura el valor del momento en que se creó.
  const vivo = useRef({ plataforma: 'todas', app: 'veta-wallet' });

  const cargar = useCallback(async (p, a, silencioso) => {
    const pl = p ?? vivo.current.plataforma;
    const ap = a ?? vivo.current.app;
    vivo.current = { plataforma: pl, app: ap };
    if (!silencioso) setCargando(true);
    const r = await api.sesiones({ plataforma: pl, app: ap, limite: 80 });
    setCargando(false);
    if (r.error) {
      // En el refresco automático no se avisa: una alerta cada 30 segundos
      // porque se cayó la red es peor que el fallo.
      if (!r.sesionVencida && !silencioso) avisar(r.error, true);
      return;
    }
    setDatos(r);
    setActualizado(new Date());
  }, [avisar]);

  useEffect(() => { cargar(); }, [cargar]);

  // El refresco automático. Se limpia al salir de la pantalla.
  useEffect(() => {
    const t = setInterval(() => cargar(undefined, undefined, true), CADA);
    return () => clearInterval(t);
  }, [cargar]);

  const cambiar = (p, a) => { hap(); setPlataforma(p); setApp(a); cargar(p, a); };

  const conNombre = (datos?.sesiones || []).filter((s) => s.identificado).length;
  const conBilletera = (datos?.sesiones || []).filter((s) => s.direccionWallet).length;

  return (
    <View style={{ flex: 1 }}>
      {/* ── Barra de estado y actualizar ─────────────────────────────────── */}
      <View style={st.barra}>
        <View style={{ flex: 1 }}>
          <Text style={st.titulo}>Últimas conexiones</Text>
          <Text style={st.sub}>
            {actualizado
              ? `al día de ${actualizado.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'cargando…'}
            {' · se actualiza sola cada 30 s'}
          </Text>
        </View>
        <Pressable onPress={() => { hap(); cargar(); }} disabled={cargando}
          style={[st.actualizar, cargando && { opacity: 0.5 }]} hitSlop={8}>
          {cargando
            ? <ActivityIndicator color={C.gold} size="small" />
            : <Icon name="refresh" size={16} color={C.gold} />}
          <Text style={st.actualizarTxt}>{cargando ? 'Buscando' : 'Actualizar'}</Text>
        </Pressable>
      </View>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <View style={st.filtros}>
        {DONDE.map((d) => (
          <Pressable key={d.clave} onPress={() => cambiar(d.clave, app)}
            style={[st.chip, plataforma === d.clave && st.chipSel]}>
            <Text style={[st.chipTxt, plataforma === d.clave && st.chipTxtSel]}>{d.nombre}</Text>
          </Pressable>
        ))}
        <View style={st.separador} />
        {APPS.map((a) => (
          <Pressable key={a} onPress={() => cambiar(plataforma, a)}
            style={[st.chip, app === a && st.chipSel]}>
            <Text style={[st.chipTxt, app === a && st.chipTxtSel]}>
              {a === 'todas' ? 'Todas' : bonito(a)}
            </Text>
          </Pressable>
        ))}
      </View>

      {datos ? (
        <Text style={st.cuenta}>
          <Text style={{ color: SERIES[0], fontWeight: '800' }}>{nf(datos.total)}</Text>
          {' '}personas
          {plataforma !== 'todas' ? ` desde ${plataforma === 'web' ? 'la web' : 'la app'}` : ''}
          {' · '}{nf(conNombre)} con nombre
          {' · '}{nf(conBilletera)} con billetera
        </Text>
      ) : null}

      <FlatList
        data={datos?.sesiones || []}
        keyExtractor={(s, i) => `${s.app}-${s.email ?? i}-${i}`}
        contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={cargando} onRefresh={() => cargar()} tintColor={C.gold} />
        }
        ListEmptyComponent={datos ? (
          <Vacio icon="people"
            titulo="Todavía nadie"
            detalle={plataforma === 'todas'
              ? `Ninguna conexión registrada en ${app === 'todas' ? 'el ecosistema' : bonito(app)}. Si sabés que sí entra gente, lo más probable es que esa app aún no esté reportando telemetría.`
              : `Nadie ha entrado desde ${plataforma === 'web' ? 'la web' : 'la app'} todavía.`} />
        ) : <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} />}
        renderItem={({ item: s }) => {
          const enApp = s.ultimaEn?.android || s.ultimaEn?.ios;
          const enWeb = s.ultimaEn?.web;
          const color = colorDe(s.ultima);
          return (
            <Card style={st.tarjeta}>
              {/* El filo de color a la izquierda: se ve quién está dentro
                  ahora sin leer una sola fecha. */}
              <View style={[st.filo, { backgroundColor: color }]} />

              <View style={st.cuerpo}>
                <View style={st.cabeza}>
                  <Text style={[st.nombre, !s.identificado && st.anonimo]} numberOfLines={1}>
                    {s.nombre || s.email || 'Sin identificar'}
                  </Text>
                  <Text style={[st.cuando, { color }]}>{hace(s.ultima)}</Text>
                </View>

                {/* El correo, en su propia línea y entero: es el dato por el
                    que se busca a alguien, y recortado no sirve para nada. */}
                {s.email ? (
                  <Text style={st.correo} numberOfLines={1}>{s.email}</Text>
                ) : (
                  <Text style={st.sinDato}>
                    fuera del padrón — esta app no lo sincronizó
                  </Text>
                )}

                {/* La billetera. Sin ella el nombre no lleva a la cadena. */}
                {s.direccionWallet ? (
                  <View style={st.walletFila}>
                    <Icon name="wallet" size={12} color={C.cyan} />
                    <Text style={st.wallet} numberOfLines={1}>{corta(s.direccionWallet)}</Text>
                  </View>
                ) : s.identificado ? (
                  <View style={st.walletFila}>
                    <Icon name="wallet" size={12} color={C.txt3} />
                    <Text style={st.sinDato}>sin billetera</Text>
                  </View>
                ) : null}

                <Text style={st.meta} numberOfLines={1}>
                  {bonito(s.app)}
                  {s.pais ? ` · ${s.pais}` : ''}
                  {s.version ? ` · v${s.version}` : ''}
                  {' · '}{reloj(s.ultima)}
                </Text>

                {/* Las dos plataformas, siempre las dos: ver que una está
                    vacía es tan informativo como ver la fecha de la otra. */}
                <View style={st.plataformas}>
                  <Marca icono="wallet" nombre="App" cuando={enApp} />
                  <Marca icono="globe" nombre="Web" cuando={enWeb} />
                  {s.gid ? <Pastilla texto={s.gid} color={C.gold} /> : null}
                </View>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

function Marca({ icono, nombre, cuando }) {
  const hay = Boolean(cuando);
  return (
    <View style={[st.marca, hay && st.marcaViva]}>
      <Icon name={icono} size={12} color={hay ? SERIES[1] : C.txt3} />
      <Text style={[st.marcaTxt, hay && { color: C.txt }]}>{nombre}</Text>
      <Text style={[st.marcaCuando, hay && { color: SERIES[1] }]}>
        {hay ? hace(cuando) : 'nunca'}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  barra: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4,
  },
  titulo: { color: C.txt, fontSize: 15, fontWeight: '700' },
  sub: { color: C.txt3, fontSize: 10.5, marginTop: 1 },
  actualizar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.panel2,
  },
  actualizarTxt: { color: C.gold, fontSize: 12, fontWeight: '700' },

  filtros: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 18, paddingTop: 10, alignItems: 'center',
  },
  separador: { width: 1, height: 20, backgroundColor: C.line2, marginHorizontal: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  chipSel: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.16)' },
  chipTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },
  chipTxtSel: { color: C.gold },
  cuenta: { color: C.txt3, fontSize: 12, paddingHorizontal: 18, paddingTop: 10 },

  // El padding lo pone el cuerpo, no la tarjeta: el filo de color tiene que
  // llegar hasta el borde de arriba y el de abajo, y con padding en la tarjeta
  // quedaría una barrita flotando en el medio.
  tarjeta: { padding: 0, flexDirection: 'row', overflow: 'hidden' },
  filo: { width: 3 },
  cuerpo: { flex: 1, gap: 2, padding: 13 },
  cabeza: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { color: C.txt, fontSize: 14.5, fontWeight: '700', flex: 1 },
  anonimo: { color: C.txt3, fontStyle: 'italic' },
  cuando: { fontSize: 12, fontWeight: '700' },
  correo: { color: C.txt2, fontSize: 12 },
  walletFila: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  wallet: { color: C.cyan, fontSize: 11, fontVariant: ['tabular-nums'] },
  sinDato: { color: C.txt3, fontSize: 11, fontStyle: 'italic' },
  meta: { color: C.txt3, fontSize: 10.5, marginTop: 3 },

  plataformas: { flexDirection: 'row', gap: 7, marginTop: 9, alignItems: 'center', flexWrap: 'wrap' },
  marca: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7,
    borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
  },
  marcaViva: { borderColor: 'rgba(58,175,198,0.4)', backgroundColor: 'rgba(58,175,198,0.08)' },
  marcaTxt: { color: C.txt3, fontSize: 11, fontWeight: '700' },
  marcaCuando: { color: C.txt3, fontSize: 10.5, fontVariant: ['tabular-nums'] },
});
