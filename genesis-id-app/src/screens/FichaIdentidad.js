// La ficha: donde el operador decide. Va TODO — riesgo, bloqueos, hallazgos
// del documento, tamizado, biometría — porque decidir con la mitad de la
// información no es decidir, es adivinar con firma.
//
// Cada acción pide su motivo en la misma pantalla (no hay diálogo del
// sistema): el motivo queda en la bitácora y es lo que un auditor va a leer.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { C, SEMAFORO } from '../theme';
import { Card, Boton, BotonPlano, Campo, Pastilla, Cabecera, Dato, hap, useToast } from '../ui';
import { Icon } from '../icons';
import * as api from '../api';

export function FichaIdentidad({ id, volver, operador }) {
  const toast = useToast();
  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState(null);
  const [accion, setAccion] = useState(null);   // null | 'aprobar' | 'rechazar' | 'revision' | 'reiniciar' | 'suspender'
  const [motivo, setMotivo] = useState('');
  const [anulacion, setAnulacion] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const puede = (p) => (operador?.permisos || []).includes('*') || (operador?.permisos || []).includes(p);

  async function cargar() {
    const r = await api.identidad(id);
    if (r.error) { setError(r.error); return; }
    setFicha(r.identidad);
  }
  useEffect(() => { cargar(); }, [id]);

  async function ejecutar() {
    const min = accion === 'aprobar' ? 0 : 8;
    if (motivo.trim().length < min) {
      toast(`Escribí el motivo (al menos ${min} caracteres): queda en la bitácora.`, true);
      return;
    }
    hap(); setOcupado(true);
    const r =
      accion === 'aprobar' ? await api.aprobar(id, motivo.trim(), anulacion.trim() || undefined)
      : accion === 'rechazar' ? await api.rechazar(id, motivo.trim())
      : accion === 'suspender' ? await api.suspender(id, motivo.trim())
      : accion === 'reiniciar' ? await api.reiniciar(id, motivo.trim())
      : await api.aRevision(id, motivo.trim());
    setOcupado(false);
    if (r.error) {
      toast(r.error, true);
      return;
    }
    toast(accion === 'aprobar' ? `Aprobada — GID ${r.gid || r.identidad?.gid || ''}` : 'Hecho. Quedó en la bitácora.');
    setAccion(null); setMotivo(''); setAnulacion('');
    setFicha(r.identidad || null);
    if (!r.identidad) cargar();
  }

  async function resolverRostro(coincide) {
    hap(); setOcupado(true);
    const r = await api.biometriaManual(id, coincide, motivo.trim() || undefined);
    setOcupado(false);
    if (r.error) { toast(r.error, true); return; }
    toast('Cotejo registrado con tu firma.');
    setFicha(r.identidad);
  }

  if (error) {
    return (
      <View style={{ flex: 1 }}>
        <Cabecera titulo="Ficha" onAtras={volver} />
        <Text style={{ color: C.bad, padding: 20 }}>{error}</Text>
      </View>
    );
  }
  if (!ficha) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  const r = ficha.riesgo || {};
  const bloqueos = r.bloqueos || [];
  const hallazgos = (ficha.documento?.hallazgos || []).filter((h) => h.gravedad !== 'ok');
  const coincidencias = ficha.tamiz?.coincidencias || [];
  const bio = ficha.biometria;
  const decidible = ['en-revision', 'biometria', 'documento', 'datos'].includes(ficha.estado);

  return (
    <View style={{ flex: 1 }}>
      <Cabecera titulo={ficha.nombreLegal || ficha.nombreDeclarado || ficha.email}
        sub={ficha.gid || 'sin GID todavía'} onAtras={volver} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: 40 }}>

        <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
          <Pastilla texto={ficha.estado} />
          {r.nivel ? <Pastilla texto={`riesgo ${r.nivel}`} color={SEMAFORO[r.nivel]} /> : null}
          {ficha.pep ? <Pastilla texto="PEP" color={C.warn} /> : null}
        </View>

        {/* La foto de la credencial, si existe: es lo que un humano coteja. */}
        {ficha.fotoCredencial ? (
          <Card style={{ alignItems: 'center' }}>
            <Image source={{ uri: ficha.fotoCredencial.startsWith('data:') ? ficha.fotoCredencial : `data:image/jpeg;base64,${ficha.fotoCredencial}` }}
              style={st.foto} resizeMode="cover" />
          </Card>
        ) : null}

        {/* ── riesgo ─────────────────────────────────────────────────────── */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={[st.puntaje, { color: SEMAFORO[r.nivel] || C.txt }]}>{r.puntuacion ?? '—'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.cardT}>Puntuación de riesgo</Text>
              <Text style={st.mut}>recomendación del motor: {r.recomendacion || '—'}</Text>
            </View>
          </View>
          {(r.factores || []).filter((f) => f.puntos > 0).map((f, i) => (
            <View key={i} style={st.factor}>
              <Text style={st.factorPts}>+{f.puntos}</Text>
              <Text style={st.factorTxt}>{f.detalle}</Text>
            </View>
          ))}
        </Card>

        {/* ── bloqueos ───────────────────────────────────────────────────── */}
        {bloqueos.length > 0 && (
          <Card style={{ borderColor: 'rgba(255,90,122,0.4)' }}>
            <Text style={[st.cardT, { color: C.crit }]}>Bloqueos — impiden aprobar sin anulación</Text>
            {bloqueos.map((b, i) => (
              <View key={i} style={st.factor}>
                <Icon name="close-circle" size={15} color={C.crit} />
                <Text style={st.factorTxt}>{b}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* ── documento ──────────────────────────────────────────────────── */}
        <Card>
          <Text style={st.cardT}>Expediente</Text>
          <Dato k="Nombre declarado" v={ficha.nombreDeclarado} />
          <Dato k="Nombre del documento" v={ficha.nombreLegal} />
          <Dato k="Anverso" v={
            ficha.documento?.anverso?.aportado
              ? (ficha.documento.anverso.nombreConfirmado === true ? 'confirma el nombre completo'
                : ficha.documento.anverso.nombreConfirmado === false ? 'no se pudo leer el nombre'
                : 'aportado')
              : 'no aportado'} />
          <Dato k="Nacimiento" v={ficha.fechaNacimiento || ficha.fechaNacimientoDeclarada} />
          <Dato k="Documento" v={ficha.numeroDocumento ? `${ficha.numeroDocumento} (${ficha.tipoDocumento || ''})` : null} />
          <Dato k="Vence" v={ficha.vencimientoDocumento} />
          <Dato k="Nacionalidad" v={ficha.nacionalidad} />
          <Dato k="Residencia" v={ficha.paisResidencia} />
          <Dato k="Correo" v={ficha.email} />
          <Dato k="Teléfono" v={ficha.telefono} />
          <Dato k="Ocupación" v={ficha.ocupacion} />
          <Dato k="Origen de fondos" v={ficha.origenFondos} />
          <Dato k="Volumen declarado" v={ficha.volumenEsperadoUsd != null ? `$${ficha.volumenEsperadoUsd.toLocaleString('es')} USD/año` : 'sin declarar'} />
          <Dato k="Diligencia" v={ficha.volumenEsperadoUsd != null && ficha.volumenEsperadoUsd < 10000 ? 'simplificada (bajo umbral)' : 'completa'} />
          <Dato k="PEP declarado" v={ficha.pepDeclarado === null ? 'sin declarar' : ficha.pepDeclarado ? 'SÍ' : 'no'} />
          <Dato k="Apps vinculadas" v={(ficha.vinculos || []).map((v) => v.app).join(', ') || null} />
        </Card>

        {hallazgos.length > 0 && (
          <Card>
            <Text style={st.cardT}>Hallazgos del documento</Text>
            {hallazgos.map((h, i) => (
              <View key={i} style={st.factor}>
                <Icon name={h.gravedad === 'grave' ? 'close-circle' : 'warning'} size={15}
                  color={h.gravedad === 'grave' ? C.bad : C.warn} />
                <Text style={st.factorTxt}>{h.detalle}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* ── tamizado ───────────────────────────────────────────────────── */}
        {coincidencias.length > 0 && (
          <Card style={{ borderColor: 'rgba(255,90,122,0.4)' }}>
            <Text style={[st.cardT, { color: C.crit }]}>Coincidencias en listas ({coincidencias.length})</Text>
            {coincidencias.slice(0, 8).map((cz, i) => (
              <View key={i} style={st.factor}>
                <Icon name="warning" size={15} color={cz.fuerza === 'fuerte' ? C.crit : C.warn} />
                <Text style={st.factorTxt}>
                  {cz.registro?.nombre} — {cz.registro?.lista} ({cz.fuerza}, {(cz.puntuacion * 100).toFixed(0)} %)
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* ── biometría ──────────────────────────────────────────────────── */}
        <Card>
          <Text style={st.cardT}>Biometría</Text>
          <Dato k="Estado" v={bio?.estado || 'sin datos'}
            color={bio?.estado === 'ok' ? C.ok : bio?.estado === 'fallida' ? C.bad : C.warn} />
          {bio?.parecido != null ? <Dato k="Parecido con el documento" v={`${(bio.parecido * 100).toFixed(0)} %`} /> : null}
          {bio?.proveedor ? <Dato k="Proveedor" v={bio.proveedor} /> : null}
          {bio?.motivo ? <Dato k="Detalle" v={bio.motivo} /> : null}

          {/* Cotejo manual: cuando no hay proveedor, una persona compara las
              dos caras y lo firma. Solo con permiso de revisar. */}
          {puede('identidad.revisar') && bio?.estado !== 'ok' && decidible && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Boton title="El rostro coincide" tono="ok" onPress={() => resolverRostro(true)}
                disabled={ocupado} style={{ flex: 1 }} />
              <Boton title="No coincide" tono="mal" onPress={() => resolverRostro(false)}
                disabled={ocupado} style={{ flex: 1 }} />
            </View>
          )}
        </Card>

        {/* ── decisiones ─────────────────────────────────────────────────── */}
        {decidible && (
          <Card style={{ borderColor: C.line }}>
            <Text style={st.cardT}>Decisión</Text>
            {!accion ? (
              <View style={{ gap: 8 }}>
                {puede('identidad.aprobar') && (
                  <Boton title={bloqueos.length ? `Aprobar (${bloqueos.length} bloqueo${bloqueos.length > 1 ? 's' : ''} — exige anulación escrita)` : 'Aprobar y emitir GID'}
                    icon="checkmark-circle" tono="ok" onPress={() => { hap(); setAccion('aprobar'); }} />
                )}
                {puede('identidad.rechazar') && (
                  <Boton title="Rechazar" icon="close-circle" tono="mal" onPress={() => { hap(); setAccion('rechazar'); }} />
                )}
                {puede('identidad.revisar') && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <BotonPlano title="Pedir que lo rehaga" icon="refresh"
                      onPress={() => { hap(); setAccion('reiniciar'); }} style={{ flex: 1 }} />
                    <BotonPlano title="Mandar a revisión" icon="time"
                      onPress={() => { hap(); setAccion('revision'); }} style={{ flex: 1 }} />
                  </View>
                )}
                {!puede('identidad.aprobar') && !puede('identidad.rechazar') && (
                  <Text style={st.mut}>Tu rol ({operador?.rol}) prepara y recomienda; la decisión final la firma cumplimiento.</Text>
                )}
              </View>
            ) : (
              <View>
                <Text style={[st.mut, { marginBottom: 10 }]}>
                  {accion === 'aprobar' ? 'El motivo queda en la bitácora junto a tu firma.'
                    : 'Escribí el motivo: queda en la bitácora y se lo muestra al equipo.'}
                </Text>
                <Campo label="Motivo" value={motivo} onChangeText={setMotivo}
                  placeholder={accion === 'aprobar' ? 'Documento y rostro verificados…' : 'Qué está mal y qué debe pasar…'}
                  multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
                {accion === 'aprobar' && bloqueos.length > 0 && (
                  <Campo label={`Anulación de ${bloqueos.length} bloqueo(s) — obligatoria y queda marcada para siempre`}
                    value={anulacion} onChangeText={setAnulacion}
                    placeholder="Por qué se aprueba A PESAR del bloqueo…"
                    multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Boton title={ocupado ? 'Enviando…' : 'Confirmar'} icon="checkmark"
                    tono={accion === 'aprobar' ? 'ok' : accion === 'rechazar' || accion === 'suspender' ? 'mal' : 'oro'}
                    onPress={ejecutar} disabled={ocupado} style={{ flex: 1 }} />
                  <BotonPlano title="Cancelar" color={C.txt3} onPress={() => { setAccion(null); }} />
                </View>
              </View>
            )}
          </Card>
        )}

        {/* Verificada: la única salida es suspender, con motivo. */}
        {ficha.estado === 'verificada' && puede('identidad.suspender') && !accion && (
          <BotonPlano title="Suspender esta identidad" icon="close-circle" color={C.bad}
            onPress={() => { hap(); setAccion('suspender'); }} />
        )}
        {ficha.estado === 'verificada' && accion === 'suspender' && (
          <Card>
            <Campo label="Motivo de la suspensión (invalida sus sesiones al instante)"
              value={motivo} onChangeText={setMotivo} multiline
              style={{ minHeight: 70, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Boton title="Suspender" tono="mal" onPress={ejecutar} disabled={ocupado} style={{ flex: 1 }} />
              <BotonPlano title="Cancelar" color={C.txt3} onPress={() => setAccion(null)} />
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  cardT: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 8 },
  mut: { color: C.txt3, fontSize: 12, lineHeight: 17 },
  puntaje: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  factor: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingVertical: 5 },
  factorPts: { color: C.warn, fontSize: 11.5, fontWeight: '800', width: 30 },
  factorTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  foto: { width: 210, height: 140, borderRadius: 10 },
});
