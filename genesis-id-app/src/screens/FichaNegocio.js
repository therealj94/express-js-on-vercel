// El expediente de una empresa, y la decisión sobre ella.
//
// Igual que la ficha de identidad: los BLOQUEOS van arriba del todo y en rojo,
// antes que cualquier otra cosa. Un bloqueo es la razón por la que este
// expediente no puede aprobarse, y enterrarlo debajo de la dirección fiscal es
// cómo se aprueba algo que no se debía.
//
// Aprobar con bloqueos exige escribir una ANULACIÓN, no solo un motivo. Es la
// misma regla del servidor; aquí se refleja para que el operador sepa lo que
// va a pasar antes de tocar el botón, en vez de recibir un error después.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Cabecera, Card, Dato, Boton, Campo, Pastilla, hap } from '../ui';
import { COLOR_ESTADO, COLOR_RIESGO } from './Negocios';
import * as api from '../api';

const fecha = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('es');
};

export function FichaNegocio({ id, operador, volver, avisar }) {
  const [neg, setNeg] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [anulacion, setAnulacion] = useState('');

  async function traer() {
    const r = await api.negocio(id);
    setCargando(false);
    if (r.error) { avisar(r.error, true); volver(); return; }
    setNeg(r.negocio);
  }

  useEffect(() => { traer(); }, [id]);

  async function decidir(accion) {
    if (!motivo.trim()) { avisar('Escribí el motivo: queda en la bitácora.', true); return; }
    hap();
    setOcupado(true);
    const r = accion === 'aprobar'
      ? await api.aprobarNegocio(id, motivo.trim(), anulacion.trim() || undefined)
      : await api.rechazarNegocio(id, motivo.trim());
    setOcupado(false);
    if (r.error) {
      // El servidor devuelve los bloqueos que impidieron aprobar: decirlos es
      // más útil que un «no se pudo» a secas.
      avisar(r.bloqueos?.length ? `${r.error}: ${r.bloqueos.join(' · ')}` : r.error, true);
      return;
    }
    avisar(accion === 'aprobar' ? `Aprobado — ${r.gid || ''}` : 'Rechazado');
    setMotivo(''); setAnulacion('');
    traer();
  }

  if (cargando) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecera titulo="Expediente" onAtras={volver} />
        <ActivityIndicator color={C.gold} size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }
  if (!neg) return null;

  const bloqueos = neg.riesgo?.bloqueos || [];
  const faltan = (neg.documentos || []).filter((d) => !d.recibidoEn);
  const cerrado = neg.estado === 'aprobado' || neg.estado === 'rechazado';

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo={neg.nombreComercial || neg.razonSocial}
        sub={neg.gid || String(neg.estado).replace('_', ' ')} onAtras={volver} />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 34 }}>

        <View style={st.etiquetas}>
          <Pastilla texto={String(neg.estado).replace('_', ' ')}
            color={COLOR_ESTADO[neg.estado] || C.txt3} />
          {neg.riesgo?.nivel ? (
            <Pastilla texto={`riesgo ${neg.riesgo.nivel}`}
              color={COLOR_RIESGO[neg.riesgo.nivel] || C.txt3} />
          ) : null}
          <Pastilla texto={`actividad ${neg.actividadRiesgo}`} color={C.txt3} />
        </View>

        {/* Lo que impide aprobar, primero */}
        {bloqueos.length ? (
          <Card style={{ marginBottom: 12, borderColor: C.bad }}>
            <View style={st.filaTit}>
              <Icon name="alert-circle" size={16} color={C.bad} />
              <Text style={[st.h, { color: C.bad }]}>
                {bloqueos.length} bloqueo{bloqueos.length > 1 ? 's' : ''}
              </Text>
            </View>
            {bloqueos.map((b, i) => (
              <Text key={i} style={st.bloqueo}>· {b}</Text>
            ))}
          </Card>
        ) : null}

        {/* Datos de la empresa */}
        <Card style={{ marginBottom: 12 }}>
          <Text style={st.h}>La empresa</Text>
          <Dato k="Razón social" v={neg.razonSocial} />
          {neg.nombreComercial ? <Dato k="Nombre comercial" v={neg.nombreComercial} /> : null}
          <Dato k="Identificador fiscal" v={neg.identificadorFiscal} />
          <Dato k="Categoría" v={neg.categoria} />
          <Dato k="País" v={neg.pais} />
          {neg.ciudad ? <Dato k="Ciudad" v={neg.ciudad} /> : null}
          {neg.direccion ? <Dato k="Dirección" v={neg.direccion} /> : null}
          {neg.sitioWeb ? <Dato k="Sitio web" v={neg.sitioWeb} /> : null}
          <Dato k="Dueño" v={neg.emailDueno} />
          <Dato k="GID del dueño" v={neg.gidDueno || 'sin verificar'}
            color={neg.gidDueno ? C.ok : C.warn} />
          {fecha(neg.creadoEn) ? <Dato k="Creado" v={fecha(neg.creadoEn)} /> : null}
        </Card>

        {/* Beneficiarios */}
        <Card style={{ marginBottom: 12 }}>
          <Text style={st.h}>
            Beneficiarios finales ({(neg.beneficiarios || []).length})
          </Text>
          {!(neg.beneficiarios || []).length ? (
            <Text style={st.vacio}>Ninguno declarado.</Text>
          ) : neg.beneficiarios.map((b) => (
            <View key={b.id} style={st.ubo}>
              <View style={{ flex: 1 }}>
                <Text style={st.uboN}>{b.nombreCompleto}</Text>
                <Text style={st.uboD}>
                  {b.porcentaje}% · {b.via}
                  {b.nacionalidad ? ` · ${b.nacionalidad}` : ''}
                </Text>
              </View>
              <View style={{ gap: 4, alignItems: 'flex-end' }}>
                {b.pep ? <Pastilla texto="PEP" color={C.warn} /> : null}
                <Pastilla texto={b.gid ? 'verificado' : 'sin KYC'}
                  color={b.gid ? C.ok : C.bad} />
              </View>
            </View>
          ))}
        </Card>

        {/* Documentos */}
        <Card style={{ marginBottom: 12 }}>
          <Text style={st.h}>
            Documentos {faltan.length ? `— faltan ${faltan.length}` : '— completos'}
          </Text>
          {(neg.documentos || []).map((d) => (
            <View key={d.clave} style={st.doc}>
              <Icon name={d.recibidoEn ? 'checkmark-circle' : 'close-circle'}
                size={15} color={d.recibidoEn ? C.ok : C.txt3} />
              <View style={{ flex: 1 }}>
                <Text style={[st.docN, !d.recibidoEn && { color: C.txt2 }]}>{d.nombre}</Text>
                {d.recibidoEn ? (
                  <Text style={st.docF}>recibido {fecha(d.recibidoEn)}</Text>
                ) : null}
              </View>
            </View>
          ))}
          <Text style={st.nota}>
            Los archivos se suben desde la web: aquí se ve qué falta, pero el
            teléfono no es sitio para revisar un acta constitutiva.
          </Text>
        </Card>

        {/* Decisión */}
        {cerrado ? (
          <Card>
            <Text style={st.h}>Decidido</Text>
            {(neg.decisiones || []).slice(-3).reverse().map((d, i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <Text style={st.decA}>{d.accion} · {d.operador}</Text>
                {d.motivo ? <Text style={st.decM}>{d.motivo}</Text> : null}
                <Text style={st.decF}>{fecha(d.en)}</Text>
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <Text style={st.h}>Decidir</Text>
            <Campo label="Motivo (queda en la bitácora)" value={motivo}
              onChangeText={setMotivo} multiline placeholder="Por qué se aprueba o se rechaza" />

            {bloqueos.length ? (
              <>
                <Text style={st.aviso}>
                  Este expediente tiene {bloqueos.length} bloqueo{bloqueos.length > 1 ? 's' : ''}.
                  Para aprobarlo hay que escribir una anulación, y queda a tu nombre.
                </Text>
                <Campo label="Anulación (obligatoria si hay bloqueos)" value={anulacion}
                  onChangeText={setAnulacion} multiline
                  placeholder="Por qué se aprueba a pesar de los bloqueos" />
              </>
            ) : null}

            <View style={{ gap: 8, marginTop: 6 }}>
              <Boton title="Aprobar" icon="checkmark-circle" disabled={ocupado}
                onPress={() => decidir('aprobar')} />
              <Boton title="Rechazar" icon="close-circle" tono="mal" disabled={ocupado}
                onPress={() => decidir('rechazar')} />
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  filaTit: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  h: { color: C.gold, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8 },
  bloqueo: { color: C.txt, fontSize: 12.5, lineHeight: 18 },
  vacio: { color: C.txt3, fontSize: 12.5 },
  ubo: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: C.line2,
  },
  uboN: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  uboD: { color: C.txt3, fontSize: 11.5 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  docN: { color: C.txt, fontSize: 13 },
  docF: { color: C.txt3, fontSize: 10.5 },
  nota: { color: C.txt3, fontSize: 11, lineHeight: 16, marginTop: 8 },
  aviso: { color: C.warn, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  decA: { color: C.txt, fontSize: 13, fontWeight: '600' },
  decM: { color: C.txt2, fontSize: 12, lineHeight: 17 },
  decF: { color: C.txt3, fontSize: 10.5 },
});
