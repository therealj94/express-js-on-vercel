// La ficha de una persona: quién es en cada app, y qué hizo en la cadena.
//
// La web abre esto en una ventana flotante; aquí ocupa la pantalla entera,
// porque en un teléfono una ventana encima de otra es una trampa: no se ve
// dónde termina una y empieza la otra, y el botón de cerrar queda lejos.
//
// Los movimientos se piden APARTE y después. Consultar el historial son varias
// llamadas al explorador y puede tardar; si fuera parte de la misma carga, la
// ficha entera se quedaría en blanco esperando por lo más lento.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Cabecera, Card, Dato, Pastilla, Vacio, BotonPlano, hap } from '../ui';
import * as api from '../api';

const monto = (v) => Number(v).toLocaleString('es', { maximumFractionDigits: 6 });
const corta = (d) => (d ? `${d.slice(0, 10)}…${d.slice(-8)}` : '—');
const fecha = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('es');
};

const COLOR_SENTIDO = { entrada: C.ok, salida: C.bad, propia: C.txt3 };
const SIGNO = { entrada: '+', salida: '−', propia: '' };

export function FichaPersona({ email, volver, avisar }) {
  const [ficha, setFicha] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [movs, setMovs] = useState(null);
  const [cargandoMovs, setCargandoMovs] = useState(true);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await api.personaDirectorio(email);
      if (!vivo) return;
      setCargando(false);
      if (r.error) { avisar(r.error, true); volver(); return; }
      setFicha(r);
    })();
    (async () => {
      const m = await api.movimientosPersona(email);
      if (!vivo) return;
      setCargandoMovs(false);
      // Que falle el historial no puede tumbar la ficha: son dos cosas
      // distintas y la de arriba ya sirve para decidir.
      if (!m.error) setMovs(m);
    })();
    return () => { vivo = false; };
  }, [email, volver, avisar]);

  if (cargando) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecera titulo="Ficha" sub={email} onAtras={volver} />
        <ActivityIndicator color={C.gold} size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (!ficha) return null;

  const g = ficha.genesis;
  const lista = (movs?.movimientos || []).filter((m) => !filtro || m.moneda === filtro);
  const monedas = [...new Set((movs?.movimientos || []).map((m) => m.moneda))];

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo={g?.nombreLegal || email} sub={g ? email : 'sin identidad en Genesis ID'}
        onAtras={volver} />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 34 }}>

        {/* Identidad en Genesis */}
        {g ? (
          <Card style={{ marginBottom: 12 }}>
            <View style={st.etiquetas}>
              <Pastilla texto={g.gid} color={C.ok} />
              <Pastilla texto={g.estado} color={C.cyan} />
              {g.riesgo ? (
                <Pastilla texto={`riesgo ${g.riesgo}`}
                  color={g.riesgo === 'alto' ? C.bad : C.txt3} />
              ) : null}
              {g.pep ? <Pastilla texto="PEP" color={C.warn} /> : null}
            </View>
            {g.nacionalidad ? <Dato k="Nacionalidad" v={g.nacionalidad} /> : null}
          </Card>
        ) : (
          <Card style={{ marginBottom: 12 }}>
            <View style={st.aviso}>
              <Icon name="alert-circle" size={16} color={C.warn} />
              <Text style={st.avisoTxt}>
                Sin identidad en Genesis ID — esta persona no completó la verificación.
              </Text>
            </View>
          </Card>
        )}

        {/* Una tarjeta por app donde tiene cuenta */}
        {ficha.cuentas.map((c, i) => (
          <Card key={`${c.app}-${i}`} style={{ marginBottom: 12 }}>
            <Text style={st.h}>{c.app}</Text>
            {[
              ['Nombre', c.nombre], ['Usuario', c.usuario], ['Teléfono', c.telefono],
              ['País', c.pais], ['Ciudad', c.ciudad], ['Rol', c.rol], ['Estado', c.estado],
              ['KYC de la app', c.kyc],
              ['Se registró', fecha(c.creadoEn)],
              ['Última conexión', fecha(c.ultimoAcceso)],
            ].filter(([, v]) => v).map(([k, v]) => <Dato key={k} k={k} v={String(v)} />)}

            {c.direccionWallet ? (
              <Dato k="Billetera" v={corta(c.direccionWallet)} />
            ) : null}

            {Object.entries(c.saldos || {}).filter(([, x]) => x > 0).map(([m, x]) => (
              <Dato key={m} k={`Saldo ${m}`} v={monto(x)} color={C.gold} />
            ))}

            {Object.entries(c.extra || {}).map(([k, v]) => (
              <Dato key={k} k={k} v={String(v)} />
            ))}
          </Card>
        ))}

        {/* Movimientos en la cadena */}
        <Text style={st.titulo}>Movimientos en la cadena</Text>

        {cargandoMovs ? (
          <View style={st.esperando}>
            <ActivityIndicator color={C.gold} />
            <Text style={st.esperandoTxt}>Consultando el explorador…</Text>
          </View>
        ) : !movs ? (
          <Text style={st.nota}>No se pudo leer el historial.</Text>
        ) : movs.sinBilletera ? (
          <Vacio icon="wallet" titulo="Sin billetera"
            detalle="Esta persona no tiene ninguna dirección, así que no hay nada que leer en la cadena." />
        ) : !movs.movimientos.length ? (
          <Vacio icon="swap-horizontal" titulo="Sin movimientos"
            detalle="Tiene billetera pero nunca movió nada." />
        ) : (
          <>
            {movs.resumen?.porMoneda?.length ? (
              <Card style={{ marginBottom: 10 }}>
                {movs.resumen.porMoneda.map((m) => (
                  <View key={m.moneda} style={st.resumenFila}>
                    <Text style={st.resumenM}>{m.moneda}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[st.resumenV, { color: C.ok }]}>+{monto(m.entradas)}</Text>
                      <Text style={[st.resumenV, { color: C.bad }]}>−{monto(m.salidas)}</Text>
                    </View>
                    <Text style={st.resumenN}>{m.veces} mov.</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {monedas.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={st.filtros}>
                <Pressable onPress={() => { hap(); setFiltro(''); }}>
                  <Pastilla texto="Todas" color={filtro ? C.txt3 : C.gold} />
                </Pressable>
                {monedas.map((m) => (
                  <Pressable key={m} onPress={() => { hap(); setFiltro(filtro === m ? '' : m); }}>
                    <Pastilla texto={m} color={filtro === m ? C.gold : C.txt3} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {lista.slice(0, 80).map((m) => (
              <View key={`${m.hash}-${m.moneda}-${m.sentido}`} style={st.mov}>
                <Icon
                  name={m.sentido === 'entrada' ? 'arrow-down'
                    : m.sentido === 'salida' ? 'arrow-up' : 'swap-horizontal'}
                  size={15} color={COLOR_SENTIDO[m.sentido] || C.txt3} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.movMonto, { color: COLOR_SENTIDO[m.sentido] || C.txt }]}>
                    {SIGNO[m.sentido]}{monto(m.monto)} <Text style={{ color: C.txt3 }}>{m.moneda}</Text>
                  </Text>
                  <Text style={st.movQuien} numberOfLines={1}>
                    {m.sentido === 'entrada' ? `de ${corta(m.de)}` : `a ${corta(m.a)}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.movFecha}>{fecha(m.en)?.split(',')[0] || `#${m.bloque}`}</Text>
                  <Text style={st.movBloque}>bloque {m.bloque}</Text>
                </View>
              </View>
            ))}

            {lista.length > 80 ? (
              <Text style={st.nota}>
                Se muestran 80 de {lista.length}. El resumen de arriba sí cuenta todo.
              </Text>
            ) : null}
            {movs.resumen?.incompleto ? (
              <Text style={st.nota}>
                El explorador no devolvió el historial completo: los totales pueden
                quedarse cortos.
              </Text>
            ) : null}
          </>
        )}

        <BotonPlano title="Volver al directorio" icon="chevron-back" onPress={volver} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  aviso: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  avisoTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 17 },
  h: { color: C.gold, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  titulo: { color: C.txt, fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  esperando: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 14 },
  esperandoTxt: { color: C.txt3, fontSize: 12.5 },
  nota: { color: C.txt3, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  resumenFila: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: C.line2,
  },
  resumenM: { color: C.txt, fontSize: 13, fontWeight: '700', flex: 1 },
  resumenV: { fontSize: 12, fontVariant: ['tabular-nums'] },
  resumenN: { color: C.txt3, fontSize: 11, width: 62, textAlign: 'right' },
  filtros: { gap: 6, paddingVertical: 6, paddingRight: 12 },
  mov: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: C.line2,
  },
  movMonto: { fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  movQuien: { color: C.txt3, fontSize: 11, fontVariant: ['tabular-nums'] },
  movFecha: { color: C.txt2, fontSize: 11 },
  movBloque: { color: C.txt3, fontSize: 10 },
});
