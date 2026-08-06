// ─────────────────────────────────────────────────────────────────────────────
// Estadísticas del comercio: qué se vendió, cuándo y qué se mueve.
//
// Está pensada para el dueño mirando el teléfono al cerrar la caja, no para un
// analista. De ahí tres decisiones:
//
//   · Lo de hoy primero y grande. Es lo único que se mira todos los días.
//   · Las barras son barras de verdad, dibujadas a escala del mejor día. Un
//     gráfico que no respeta la proporción miente con elegancia.
//   · Lo que la cadena todavía no respalda va aparte y en ámbar. Un comercio
//     que celebra ventas que aún no son dinero suyo toma malas decisiones.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { CalendarDays, Clock, Crown, ShieldAlert, TrendingUp } from 'lucide-react-native'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { TopBar } from '../../src/components/TopBar'
import { pos, lempiras, type Estadisticas } from '../../src/lib/pos'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'
import { PantallaError } from '../../src/components/PantallaError'

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <PantallaError error={error} retry={retry} />
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** '2026-08-06' → '6 ago'. Se parte el texto en vez de usar Date: una fecha
 *  sin hora la zona horaria la corre un día para atrás. */
const diaCorto = (d: string) => {
  const [, m, dd] = d.split('-')
  return `${Number(dd)} ${MESES[Number(m) - 1] ?? ''}`
}
const mesCorto = (m: string) => {
  const [a, mm] = m.split('-')
  return `${MESES[Number(mm) - 1] ?? ''} ${a.slice(2)}`
}

export default function EstadisticasPantalla() {
  const { colors } = useTheme()
  const styles = crearEstilos(colors)
  const [datos, setDatos] = useState<Estadisticas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [vista, setVista] = useState<'diario' | 'mensual'>('diario')

  const cargar = useCallback(async () => {
    try {
      setDatos(await pos.estadisticas())
      setError(null)
    } catch {
      setError('No se pudieron cargar las estadísticas.')
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!datos) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TopBar title="Estadísticas" />
        <View style={styles.centro}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.violet} />}
        </View>
      </SafeAreaView>
    )
  }

  const serie = vista === 'diario'
    ? datos.diario.map((d) => ({ etiqueta: diaCorto(d.dia), hnl: d.hnl, ventas: d.ventas }))
    : datos.mensual.map((m) => ({ etiqueta: mesCorto(m.mes), hnl: m.hnl, ventas: m.ventas }))
  const techo = Math.max(1, ...serie.map((s) => s.hnl))
  const maxProducto = Math.max(1, ...datos.productos.map((p) => p.cantidad))
  const maxHora = Math.max(1, ...datos.horas.map((h) => h.ventas))

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Estadísticas" />
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true)
              await cargar()
              setRefrescando(false)
            }}
            tintColor={colors.violet}
          />
        }
      >
        {/* Hoy, grande */}
        <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.hoy}>
          <Text style={styles.hoyEtq}>Vendido hoy</Text>
          <Text style={styles.hoyMonto}>{lempiras(datos.hoy.hnl)}</Text>
          <Text style={styles.hoyVentas}>
            {datos.hoy.ventas} {datos.hoy.ventas === 1 ? 'venta' : 'ventas'}
          </Text>
        </Animated.View>

        {/* Tres números que importan */}
        <View style={styles.tarjetasFila}>
          <Mini titulo="Este mes" valor={lempiras(datos.mes.hnl)} pie={`${datos.mes.ventas} ventas`} colors={colors} />
          <Mini titulo="Ticket promedio" valor={lempiras(datos.ticketPromedioHnl)} pie="por venta" colors={colors} />
        </View>
        <View style={styles.tarjetasFila}>
          <Mini titulo="Histórico" valor={lempiras(datos.total.hnl)} pie={`${datos.total.ventas} ventas`} colors={colors} />
          <Mini
            titulo="Mejor día"
            valor={datos.mejorDia.hnl > 0 ? lempiras(datos.mejorDia.hnl) : '—'}
            pie={datos.mejorDia.dia ? diaCorto(datos.mejorDia.dia) : 'sin ventas aún'}
            colors={colors}
          />
        </View>

        {datos.porConfirmar.ventas > 0 && (
          <View style={styles.aviso}>
            <ShieldAlert size={15} color={colors.warn} />
            <Text style={styles.avisoTexto}>
              {lempiras(datos.porConfirmar.hnl)} en {datos.porConfirmar.ventas}{' '}
              {datos.porConfirmar.ventas === 1 ? 'venta' : 'ventas'} que la cadena todavía no
              respalda. Aparecen en estos números, pero no se pueden retirar.
            </Text>
          </View>
        )}

        {/* Gráfico */}
        <View style={styles.bloque}>
          <View style={styles.bloqueCabecera}>
            <View style={styles.bloqueTituloFila}>
              <TrendingUp size={15} color={colors.violet} />
              <Text style={styles.bloqueTitulo}>Ventas</Text>
            </View>
            <View style={styles.tabs}>
              {(['diario', 'mensual'] as const).map((v) => (
                <AnimatedPressable
                  key={v}
                  onPress={() => setVista(v)}
                  style={[styles.tab, vista === v && styles.tabActiva]}
                  scaleTo={0.97}
                >
                  <Text style={[styles.tabTexto, vista === v && styles.tabTextoActivo]}>
                    {v === 'diario' ? '30 días' : '12 meses'}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>

          {serie.every((s) => s.hnl === 0) ? (
            <Text style={styles.sinDatos}>Todavía no hay ventas en este período.</Text>
          ) : (
            <>
              <Text style={styles.techo}>{lempiras(techo)}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barras}>
                {serie.map((s, i) => (
                  <View key={`${s.etiqueta}-${i}`} style={styles.barraCol}>
                    <View style={styles.barraPista}>
                      <View
                        style={[
                          styles.barra,
                          {
                            height: `${Math.max(s.hnl > 0 ? 4 : 0, (s.hnl / techo) * 100)}%`,
                            backgroundColor: s.hnl > 0 ? colors.violet : 'transparent',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barraEtq} numberOfLines={1}>{s.etiqueta}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </View>

        {/* Productos más vendidos */}
        <View style={styles.bloque}>
          <View style={styles.bloqueTituloFila}>
            <Crown size={15} color="#E8B84B" />
            <Text style={styles.bloqueTitulo}>Lo que más se vende</Text>
          </View>
          {datos.productos.length === 0 ? (
            <Text style={styles.sinDatos}>
              Cuando cobres tomando la orden del menú, acá vas a ver qué platos mueven tu negocio.
            </Text>
          ) : (
            <View style={{ gap: 10, marginTop: 4 }}>
              {datos.productos.map((p, i) => (
                <View key={p.nombre} style={styles.producto}>
                  <Text style={[styles.puesto, i === 0 && { color: '#E8B84B' }]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.productoFila}>
                      <Text style={styles.productoNombre} numberOfLines={1}>{p.nombre}</Text>
                      <Text style={styles.productoCant}>{p.cantidad}</Text>
                    </View>
                    <View style={styles.productoPista}>
                      <View
                        style={[
                          styles.productoBarra,
                          {
                            width: `${(p.cantidad / maxProducto) * 100}%`,
                            backgroundColor: i === 0 ? '#E8B84B' : colors.violet,
                          },
                        ]}
                      />
                    </View>
                    {p.hnl > 0 && <Text style={styles.productoHnl}>{lempiras(p.hnl)} vendidos</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Horas con más movimiento */}
        <View style={styles.bloque}>
          <View style={styles.bloqueTituloFila}>
            <Clock size={15} color={colors.cyan} />
            <Text style={styles.bloqueTitulo}>A qué hora entra la plata</Text>
          </View>
          {datos.horas.every((h) => h.ventas === 0) ? (
            <Text style={styles.sinDatos}>Sin ventas todavía.</Text>
          ) : (
            <View style={styles.horas}>
              {datos.horas.map((h) => (
                <View key={h.hora} style={styles.horaCol}>
                  <View style={styles.horaPista}>
                    <View
                      style={[
                        styles.horaBarra,
                        {
                          height: `${Math.max(h.ventas > 0 ? 8 : 0, (h.ventas / maxHora) * 100)}%`,
                          backgroundColor: h.ventas > 0 ? colors.cyan : 'transparent',
                        },
                      ]}
                    />
                  </View>
                  {h.hora % 6 === 0 && <Text style={styles.horaEtq}>{h.hora}</Text>}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.pie}>
          <CalendarDays size={12} color={colors.muted2} />
          <Text style={styles.pieTexto}>
            Solo cuenta lo que se pagó de verdad, parte por parte. Una cuenta a medias vendió lo
            que le pagaron.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Mini({ titulo, valor, pie, colors }: { titulo: string; valor: string; pie: string; colors: ThemeColors }) {
  const styles = crearEstilos(colors)
  return (
    <View style={styles.mini}>
      <Text style={styles.miniTitulo}>{titulo}</Text>
      <Text style={styles.miniValor} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      <Text style={styles.miniPie}>{pie}</Text>
    </View>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    cuerpo: { padding: 20, paddingBottom: 40, gap: 12 },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
    error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },

    hoy: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.violet + '55',
      borderRadius: radius.xl,
      padding: 22,
      alignItems: 'center',
    },
    hoyEtq: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 },
    hoyMonto: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 38, marginTop: 4 },
    hoyVentas: { color: colors.violet, fontFamily: fonts.bodySemiBold, fontSize: 12.5, marginTop: 2 },

    tarjetasFila: { flexDirection: 'row', gap: 10 },
    mini: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: 14,
    },
    miniTitulo: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11 },
    miniValor: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 18, marginTop: 4 },
    miniPie: { color: colors.muted, fontFamily: fonts.body, fontSize: 10.5, marginTop: 2 },

    aviso: {
      flexDirection: 'row',
      gap: 9,
      alignItems: 'flex-start',
      borderWidth: 1,
      borderColor: colors.warn + '44',
      backgroundColor: colors.warn + '12',
      borderRadius: radius.md,
      padding: 12,
    },
    avisoTexto: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, flex: 1 },

    bloque: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: 16,
      gap: 8,
    },
    bloqueCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bloqueTituloFila: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    bloqueTitulo: { color: colors.text, fontFamily: fonts.display, fontSize: 14.5 },
    sinDatos: { color: colors.muted2, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 4 },

    tabs: { flexDirection: 'row', gap: 4, backgroundColor: colors.bgSoft, borderRadius: radius.sm, padding: 3 },
    tab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm - 2 },
    tabActiva: { backgroundColor: colors.surfaceHi },
    tabTexto: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 11 },
    tabTextoActivo: { color: colors.text },

    techo: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10.5 },
    barras: { gap: 5, paddingTop: 2, alignItems: 'flex-end' },
    barraCol: { alignItems: 'center', width: 26 },
    barraPista: { height: 96, width: 12, backgroundColor: colors.bgSoft, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
    barra: { width: '100%', borderRadius: 6 },
    barraEtq: { color: colors.muted2, fontFamily: fonts.body, fontSize: 9, marginTop: 5 },

    producto: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    puesto: { color: colors.muted2, fontFamily: fonts.displayBold, fontSize: 14, width: 18, textAlign: 'center' },
    productoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    productoNombre: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13, flex: 1 },
    productoCant: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 13 },
    productoPista: { height: 5, backgroundColor: colors.bgSoft, borderRadius: 3, marginTop: 5, overflow: 'hidden' },
    productoBarra: { height: '100%', borderRadius: 3 },
    productoHnl: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10.5, marginTop: 3 },

    horas: { flexDirection: 'row', gap: 2, alignItems: 'flex-end', marginTop: 4 },
    horaCol: { flex: 1, alignItems: 'center' },
    horaPista: { height: 52, width: '100%', backgroundColor: colors.bgSoft, borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' },
    horaBarra: { width: '100%', borderRadius: 3 },
    horaEtq: { color: colors.muted2, fontFamily: fonts.body, fontSize: 9, marginTop: 4 },

    pie: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', paddingHorizontal: 4, marginTop: 2 },
    pieTexto: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, flex: 1 },
  })
}
