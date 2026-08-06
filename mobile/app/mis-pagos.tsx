// ─────────────────────────────────────────────────────────────────────────────
// Mis pagos: dónde fue mi dinero.
//
// No es una lista de montos: es la memoria de dónde estuvo la persona y qué se
// llevó. Por eso cada pago se abre y cuenta la historia entera —el comercio, lo
// que se pidió, la hora, la tasa del día, el comprobante en la cadena— y por eso
// esta pantalla solo la ve su dueño.
//
// El sello de la cadena está a la vista en cada línea: verde cuando el depósito
// está confirmado, ámbar mientras la red todavía no lo respalda. Quien pagó
// tiene derecho a saber en cuál de los dos estados está su plata.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import {
  Check, ChevronDown, Copy, Receipt, ShieldAlert, ShieldCheck, Store, Users,
} from 'lucide-react-native'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { TopBar } from '../src/components/TopBar'
import { pos, lempiras, origen, type MisPagos, type PagoMio } from '../src/lib/pos'
import { compartirRecibo } from '../src/lib/recibo'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'
import { PantallaError } from '../src/components/PantallaError'

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <PantallaError error={error} retry={retry} />
}

const fecha = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
}

const fechaLarga = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-HN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function MisPagosPantalla() {
  const { colors } = useTheme()
  const styles = crearEstilos(colors)
  const [datos, setDatos] = useState<MisPagos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setDatos(await pos.misPagos())
      setError(null)
    } catch {
      setError('No se pudieron cargar tus pagos. Revisá tu conexión.')
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!datos) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TopBar title="Mis pagos" />
        <View style={styles.centro}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.violet} />}
        </View>
      </SafeAreaView>
    )
  }

  const { pagos, resumen } = datos

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Mis pagos" />
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
        {pagos.length === 0 ? (
          <View style={styles.vacio}>
            <Receipt size={32} color={colors.muted2} />
            <Text style={styles.vacioTitulo}>Todavía no has pagado nada</Text>
            <Text style={styles.vacioTexto}>
              Cuando pagues en un comercio con ORIGEN, acá vas a ver el detalle completo: qué
              pediste, dónde, a qué hora y el comprobante en la cadena.
            </Text>
          </View>
        ) : (
          <>
            {/* Resumen */}
            <View style={styles.resumen}>
              <View style={styles.resumenPrincipal}>
                <Text style={styles.resumenEtq}>Total pagado</Text>
                <Text style={styles.resumenMonto}>{lempiras(resumen.totalHnl)}</Text>
                <Text style={styles.resumenOrigen}>{origen(resumen.totalOrigen)}</Text>
              </View>
              <View style={styles.resumenFila}>
                <Dato etiqueta="Pagos" valor={String(resumen.pagos)} colors={colors} />
                <Dato etiqueta="Comercios" valor={String(resumen.comercios)} colors={colors} />
                <Dato etiqueta="Promedio" valor={lempiras(resumen.ticketPromedioHnl)} colors={colors} />
              </View>
            </View>

            {pagos.map((p, i) => (
              <Animated.View key={`${p.codigo}-${i}`} entering={FadeInDown.delay(Math.min(i, 8) * 45).springify().damping(16)}>
                <PagoTarjeta
                  pago={p}
                  abierto={abierto === `${p.codigo}-${i}`}
                  onToggle={() => {
                    Haptics.selectionAsync().catch(() => {})
                    setAbierto((a) => (a === `${p.codigo}-${i}` ? null : `${p.codigo}-${i}`))
                  }}
                  colors={colors}
                />
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Dato({ etiqueta, valor, colors }: { etiqueta: string; valor: string; colors: ThemeColors }) {
  const styles = crearEstilos(colors)
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.datoValor}>{valor}</Text>
      <Text style={styles.datoEtq}>{etiqueta}</Text>
    </View>
  )
}

function PagoTarjeta({
  pago, abierto, onToggle, colors,
}: { pago: PagoMio; abierto: boolean; onToggle: () => void; colors: ThemeColors }) {
  const styles = crearEstilos(colors)
  const [copiado, setCopiado] = useState(false)
  const [generando, setGenerando] = useState(false)
  const confirmado = pago.verificacionCadena === 'confirmada'

  return (
    <View style={styles.tarjeta}>
      <AnimatedPressable onPress={onToggle} style={styles.cabecera} scaleTo={0.985}>
        <View style={styles.logo}>
          {pago.negocio?.logo ? (
            <Image source={{ uri: pago.negocio.logo }} style={styles.logoImg} />
          ) : (
            <Store size={17} color={colors.violet} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.negocio} numberOfLines={1}>{pago.negocio?.nombre ?? 'Comercio'}</Text>
          <Text style={styles.subtitulo} numberOfLines={1}>
            {fecha(pago.pagadaEn)}
            {pago.dividida ? ` · dividida entre ${pago.partesTotales}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.monto}>{lempiras(pago.montoHnl)}</Text>
          <View style={styles.selloFila}>
            {confirmado ? (
              <ShieldCheck size={11} color={colors.ok} />
            ) : (
              <ShieldAlert size={11} color={colors.warn} />
            )}
            <Text style={[styles.selloTexto, { color: confirmado ? colors.ok : colors.warn }]}>
              {confirmado ? 'en la cadena' : 'por confirmar'}
            </Text>
          </View>
        </View>
        <ChevronDown
          size={16}
          color={colors.muted2}
          style={{ transform: [{ rotate: abierto ? '180deg' : '0deg' }] }}
        />
      </AnimatedPressable>

      {abierto && (
        <Animated.View entering={FadeInDown.duration(180)} style={styles.detalle}>
          {pago.articulos.length > 0 && (
            <View style={styles.bloque}>
              <Text style={styles.bloqueTitulo}>Lo que pediste</Text>
              {pago.articulos.map((a, i) => (
                <View key={`${a.nombre}-${i}`} style={styles.articulo}>
                  <Text style={styles.articuloCant}>{a.cantidad}×</Text>
                  <Text style={styles.articuloNombre}>{a.nombre}</Text>
                  {a.precioUnitarioHnl > 0 && (
                    <Text style={styles.articuloPrecio}>{lempiras(a.cantidad * a.precioUnitarioHnl)}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <View style={styles.bloque}>
            <Fila k="Cuándo" v={fechaLarga(pago.pagadaEn)} colors={colors} />
            {pago.negocio && <Fila k="Dónde" v={pago.negocio.direccion} colors={colors} />}
            <Fila k="Código" v={pago.codigo} colors={colors} />
            {pago.dividida && (
              <>
                <Fila k="Total de la cuenta" v={lempiras(pago.totalCuentaHnl)} colors={colors} />
                <Fila
                  k="Tu parte"
                  v={`${lempiras(pago.montoHnl)} de ${pago.partesTotales}`}
                  colors={colors}
                  icono={<Users size={12} color={colors.muted2} />}
                />
              </>
            )}
            <Fila k="En ORIGEN" v={origen(pago.montoOrigen)} colors={colors} />
            <Fila k="Tasa del día" v={`1 ORIGEN = ${lempiras(pago.tasaHnlPorOrigen)}`} colors={colors} />
          </View>

          {pago.txHash && (
            <AnimatedPressable
              onPress={async () => {
                await Clipboard.setStringAsync(pago.txHash!)
                setCopiado(true)
                Haptics.selectionAsync().catch(() => {})
                setTimeout(() => setCopiado(false), 1500)
              }}
              style={styles.hashCaja}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.hashEtq}>Comprobante en la cadena 8532</Text>
                <Text style={styles.hashTexto} numberOfLines={1}>{pago.txHash}</Text>
              </View>
              {copiado ? <Check size={15} color={colors.ok} /> : <Copy size={15} color={colors.muted} />}
            </AnimatedPressable>
          )}

          <AnimatedPressable
            onPress={async () => {
              if (generando) return
              setGenerando(true)
              await compartirRecibo({
                codigo: pago.codigo,
                concepto: pago.concepto,
                negocio: pago.negocio?.nombre ?? 'Comercio',
                montoHnl: pago.montoHnl,
                montoOrigen: pago.montoOrigen,
                tasaHnlPorOrigen: pago.tasaHnlPorOrigen,
                txHash: pago.txHash,
                fecha: pago.pagadaEn ?? new Date().toISOString(),
                tipo: 'pago',
              })
              setGenerando(false)
            }}
            style={styles.recibo}
          >
            <Receipt size={15} color={colors.violet} />
            <Text style={styles.reciboTexto}>{generando ? 'Generando…' : 'Descargar recibo'}</Text>
          </AnimatedPressable>
        </Animated.View>
      )}
    </View>
  )
}

function Fila({ k, v, colors, icono }: { k: string; v: string; colors: ThemeColors; icono?: React.ReactNode }) {
  const styles = crearEstilos(colors)
  return (
    <View style={styles.fila}>
      <Text style={styles.filaK}>{k}</Text>
      <View style={styles.filaVWrap}>
        {icono}
        <Text style={styles.filaV} numberOfLines={2}>{v}</Text>
      </View>
    </View>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    cuerpo: { padding: 20, paddingBottom: 40, gap: 10 },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
    error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },

    vacio: { alignItems: 'center', paddingTop: 70, gap: 10, paddingHorizontal: 20 },
    vacioTitulo: { color: colors.text, fontFamily: fonts.display, fontSize: 16, textAlign: 'center' },
    vacioTexto: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },

    resumen: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      padding: 18,
      marginBottom: 6,
    },
    resumenPrincipal: { alignItems: 'center' },
    resumenEtq: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
    resumenMonto: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 32, marginTop: 3 },
    resumenOrigen: { color: colors.violet, fontFamily: fonts.bodySemiBold, fontSize: 12.5, marginTop: 2 },
    resumenFila: {
      flexDirection: 'row',
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    datoValor: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 15, textAlign: 'center' },
    datoEtq: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, textAlign: 'center', marginTop: 2 },

    tarjeta: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    cabecera: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
    logo: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: colors.violet + '1c',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoImg: { width: '100%', height: '100%' },
    negocio: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 },
    subtitulo: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, marginTop: 2 },
    monto: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 15 },
    selloFila: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    selloTexto: { fontFamily: fonts.body, fontSize: 10 },

    detalle: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      padding: 14,
      gap: 14,
      backgroundColor: colors.bgSoft,
    },
    bloque: { gap: 7 },
    bloqueTitulo: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 },
    articulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    articuloCant: { color: colors.violet, fontFamily: fonts.displayBold, fontSize: 13, minWidth: 26 },
    articuloNombre: { color: colors.text, fontFamily: fonts.body, fontSize: 13, flex: 1 },
    articuloPrecio: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },

    fila: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
    filaK: { color: colors.muted2, fontFamily: fonts.body, fontSize: 12, flexShrink: 0 },
    filaVWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'flex-end' },
    filaV: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 12.5, textAlign: 'right' },

    hashCaja: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 11,
      backgroundColor: colors.surface,
    },
    hashEtq: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10.5 },
    hashTexto: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },

    recibo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: colors.violet + '55',
      borderRadius: radius.md,
      paddingVertical: 11,
    },
    reciboTexto: { color: colors.violet, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  })
}
