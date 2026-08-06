// ─────────────────────────────────────────────────────────────────────────────
// Tomar la orden: la cuenta se arma desde el menú, no tecleando un monto.
//
// El mesero marca los platos, la app suma —convirtiendo los precios en dólares
// a lempiras con la cotización del día— y al finalizar se crea el cobro con el
// detalle de la orden como concepto. De ahí en adelante el flujo es el mismo de
// siempre: QR, dividir entre varios, pagar desde Veta Wallet, recibo.
//
// La conversión pasa UNA sola vez, al finalizar: el cobro queda en lempiras y
// en ORIGEN con la tasa de ese momento, que es la que rige. Un menú no puede
// re-cotizarse a mitad de la cena.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Minus, Plus, Users, UtensilsCrossed } from 'lucide-react-native'
import { api } from '../../src/lib/api'
import { pos, lempiras } from '../../src/lib/pos'
import { ApiError } from '../../src/lib/apiError'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { TopBar } from '../../src/components/TopBar'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'
import type { PlatoMenu } from '../../src/lib/types'

const MAX_PARTES = 20

export default function TomarOrden() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  const [menu, setMenu] = useState<PlatoMenu[] | null>(null)
  const [hnlPorUsd, setHnlPorUsd] = useState<number | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [partes, setPartes] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.myCompany()
      .then(({ company }) => setMenu(company?.menu ?? []))
      .catch(() => setMenu([]))
    api.tasa()
      .then(({ tasa }) => setHnlPorUsd(tasa.hnlPorUsd))
      .catch(() => setHnlPorUsd(null))
  }, [])

  const enLempiras = (p: PlatoMenu): number | null => {
    if (p.moneda === 'HNL') return p.precio
    if (hnlPorUsd == null) return null
    return Math.round(p.precio * hnlPorUsd * 100) / 100
  }

  const orden = useMemo(
    () => (menu ?? []).filter((p) => (cantidades[p.id] ?? 0) > 0),
    [menu, cantidades],
  )

  const total = useMemo(() => {
    let suma = 0
    for (const p of orden) {
      const precio = enLempiras(p)
      if (precio == null) return null // hay platos en dólares y no hay tasa
      suma += precio * (cantidades[p.id] ?? 0)
    }
    return Math.round(suma * 100) / 100
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden, cantidades, hnlPorUsd])

  function cambiar(id: string, delta: number) {
    Haptics.selectionAsync().catch(() => {})
    setError(null)
    setCantidades((c) => {
      const n = Math.max(0, Math.min(99, (c[id] ?? 0) + delta))
      return { ...c, [id]: n }
    })
  }

  async function finalizar() {
    if (!total || total <= 0 || enviando) return
    setEnviando(true)
    setError(null)
    try {
      // El detalle de la orden ES el concepto: así el recibo cuenta qué se
      // comió, no solo cuánto costó.
      const detalle = orden
        .map((p) => `${cantidades[p.id]}× ${p.nombre}`)
        .join(', ')
        .slice(0, 120)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      // El desglose viaja aparte del texto: es lo que después alimenta «los
      // más vendidos». Un concepto no se puede sumar.
      const articulos = orden.map((p) => ({
        nombre: p.nombre,
        cantidad: cantidades[p.id] ?? 0,
        precioUnitarioHnl: enLempiras(p) ?? 0,
      }))
      const { cobro } = await pos.crearCobro({ montoHnl: total, concepto: detalle, partes, articulos })
      router.replace(`/pos/cobro/${cobro.id}`)
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el cobro')
    } finally {
      setEnviando(false)
    }
  }

  const simbolo = (m: 'HNL' | 'USD') => (m === 'USD' ? 'US$' : 'L')
  const articulos = orden.reduce((s, p) => s + (cantidades[p.id] ?? 0), 0)

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Tomar orden" />
      <AnimatedScreen style={{ flex: 1 }}>
        {menu === null ? (
          <View style={styles.centro}>
            <ActivityIndicator color={colors.violet} />
          </View>
        ) : menu.length === 0 ? (
          <View style={styles.centro}>
            <UtensilsCrossed size={30} color={colors.muted2} />
            <Text style={styles.vacioTitulo}>Tu menú está vacío</Text>
            <Text style={styles.vacioTexto}>
              Agregá tus platos en «Mi empresa» y desde aquí armás la cuenta tocando lo que pidió la
              mesa.
            </Text>
            <GradientButton label="Ir a Mi empresa" onPress={() => router.push('/mi-empresa')} style={{ marginTop: 10 }} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.lista}>
              {menu.map((p) => {
                const n = cantidades[p.id] ?? 0
                const precioL = enLempiras(p)
                return (
                  <View key={p.id} style={[styles.plato, n > 0 && styles.platoActivo]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.platoNombre}>{p.nombre}</Text>
                      <Text style={styles.platoPrecio}>
                        {simbolo(p.moneda)} {p.precio.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                        {p.moneda === 'USD' && precioL != null && (
                          <Text style={styles.platoConvertido}>  ≈ {lempiras(precioL)}</Text>
                        )}
                      </Text>
                    </View>
                    <View style={styles.stepper}>
                      <AnimatedPressable
                        onPress={() => cambiar(p.id, -1)}
                        style={[styles.paso, n === 0 && styles.pasoApagado]}
                        disabled={n === 0}
                      >
                        <Minus size={16} color={n === 0 ? colors.muted2 : colors.text} />
                      </AnimatedPressable>
                      <Text style={[styles.cantidad, n > 0 && { color: colors.text }]}>{n}</Text>
                      <AnimatedPressable onPress={() => cambiar(p.id, 1)} style={styles.paso}>
                        <Plus size={16} color={colors.text} />
                      </AnimatedPressable>
                    </View>
                  </View>
                )
              })}
            </ScrollView>

            <View style={styles.pie}>
              <View style={styles.division}>
                <View style={styles.divisionIzq}>
                  <Users size={15} color={colors.muted} />
                  <Text style={styles.divisionTexto}>
                    {partes === 1 ? 'Sin dividir' : `Entre ${partes}`}
                  </Text>
                </View>
                <View style={styles.divisionCtrl}>
                  <AnimatedPressable
                    onPress={() => setPartes((x) => Math.max(1, x - 1))}
                    style={[styles.paso, partes === 1 && styles.pasoApagado]}
                    disabled={partes === 1}
                  >
                    <Minus size={16} color={partes === 1 ? colors.muted2 : colors.text} />
                  </AnimatedPressable>
                  <Text style={styles.cantidad}>{partes}</Text>
                  <AnimatedPressable
                    onPress={() => setPartes((x) => Math.min(MAX_PARTES, x + 1))}
                    style={styles.paso}
                  >
                    <Plus size={16} color={colors.text} />
                  </AnimatedPressable>
                </View>
              </View>

              {total != null && total > 0 && partes > 1 && (
                <Text style={styles.porPersona}>{lempiras(total / partes)} cada uno</Text>
              )}
              {total == null && (
                <Text style={styles.aviso}>
                  Hay platos en dólares y la cotización no respondió. Reintentá en unos segundos.
                </Text>
              )}
              {error && <Text style={styles.error}>{error}</Text>}

              <GradientButton
                label={
                  total && total > 0
                    ? `Finalizar y cobrar ${lempiras(total)}${articulos ? ` · ${articulos} art.` : ''}`
                    : 'Marcá lo que pidió la mesa'
                }
                onPress={finalizar}
                disabled={!total || total <= 0}
                loading={enviando}
              />
            </View>
          </>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 36 },
    vacioTitulo: { color: colors.text, fontFamily: fonts.display, fontSize: 16, textAlign: 'center' },
    vacioTexto: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    lista: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 8 },
    plato: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    platoActivo: { borderColor: colors.violet + '88', backgroundColor: colors.violet + '12' },
    platoNombre: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 },
    platoPrecio: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
    platoConvertido: { color: colors.muted2, fontSize: 11.5 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    paso: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceHi,
    },
    pasoApagado: { opacity: 0.4 },
    cantidad: { color: colors.muted, fontFamily: fonts.displayBold, fontSize: 16, minWidth: 20, textAlign: 'center' },
    pie: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
      gap: 10,
    },
    division: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    divisionIzq: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    divisionTexto: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.text },
    divisionCtrl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    porPersona: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, textAlign: 'center' },
    aviso: { fontFamily: fonts.body, fontSize: 12.5, color: colors.warn, textAlign: 'center' },
    error: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger, textAlign: 'center' },
  })
}
