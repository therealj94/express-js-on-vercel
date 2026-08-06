// ─────────────────────────────────────────────────────────────────────────────
// El cobro en vivo: el QR que el cliente escanea y la cuenta llenándose sola.
//
// Esta pantalla es la que el comercio le pone delante al cliente, así que manda
// la legibilidad a un brazo de distancia: QR grande, código en letra enorme por
// si la cámara no coopera, y las partes pagándose una a una para que el mesero
// vea de un vistazo cuánto falta.
//
// Se refresca sola cada dos segundos. Es tosco comparado con una conexión
// permanente, pero sobrevive a que el teléfono se bloquee, a que se pierda la
// señal un momento y a que la app pase a segundo plano — y en un comedor eso
// pasa todo el tiempo.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import QRCode from 'react-native-qrcode-svg'
import { Check, Copy, Download, Hourglass, X } from 'lucide-react-native'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { AnimatedScreen } from '../../../src/components/AnimatedScreen'
import { ConfirmDialog } from '../../../src/components/ConfirmDialog'
import { TopBar } from '../../../src/components/TopBar'
import { pos, lempiras, origen, enlaceCobro, type Cobro } from '../../../src/lib/pos'
import { compartirRecibo } from '../../../src/lib/recibo'
import { fonts, radius } from '../../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../../src/hooks/useTheme'

const REFRESCO_MS = 2000

export default function CobroEnVivo() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  const [cobro, setCobro] = useState<Cobro | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmarAnular, setConfirmarAnular] = useState(false)
  const [generandoRecibo, setGenerandoRecibo] = useState(false)
  const pagadasPrevias = useRef(0)

  const cargar = useCallback(async () => {
    try {
      const { cobro: c } = await pos.miCobro(String(id))
      const pagadas = c.partes.filter((p) => p.estado === 'pagada').length
      // Un toque cuando entra un pago: el mesero no está mirando la pantalla,
      // está atendiendo otra mesa.
      if (pagadas > pagadasPrevias.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      }
      pagadasPrevias.current = pagadas
      setCobro(c)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el cobro')
    }
  }, [id])

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  // Cuando ya no puede cambiar nada, se deja de preguntar.
  useEffect(() => {
    if (cobro && cobro.estado !== 'abierto') pagadasPrevias.current = -1
  }, [cobro])

  async function copiar() {
    if (!cobro) return
    await Clipboard.setStringAsync(cobro.codigo)
    setCopiado(true)
    Haptics.selectionAsync().catch(() => {})
    setTimeout(() => setCopiado(false), 1800)
  }

  async function anular() {
    if (!cobro) return
    try {
      await pos.anularCobro(cobro.id)
      setConfirmarAnular(false)
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular')
      setConfirmarAnular(false)
    }
  }

  if (!cobro) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Cobro" />
        <View style={styles.centro}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.violet} />}
        </View>
      </SafeAreaView>
    )
  }

  const pagadas = cobro.partes.filter((p) => p.estado === 'pagada')
  const faltan = cobro.partes.length - pagadas.length
  const cobrado = pagadas.reduce((s, p) => s + p.montoOrigen, 0) * cobro.tasaHnlPorOrigen
  const cerrado = cobro.estado !== 'abierto'
  const pagado = cobro.estado === 'pagado'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title={cobro.concepto || 'Cobro'} />
      <AnimatedScreen style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.cuerpo} showsVerticalScrollIndicator={false}>
          {pagado ? (
            <View style={styles.exito}>
              <View style={styles.exitoCirculo}>
                <Check size={40} color="#fff" strokeWidth={3} />
              </View>
              <Text style={styles.exitoTitulo}>Cobro completo</Text>
              <Text style={styles.exitoMonto}>{lempiras(cobro.montoHnl)}</Text>
              <AnimatedPressable
                onPress={async () => {
                  if (generandoRecibo) return
                  setGenerandoRecibo(true)
                  await compartirRecibo({
                    codigo: cobro.codigo,
                    concepto: cobro.concepto,
                    negocio: 'Tu comercio',
                    montoHnl: cobro.montoHnl,
                    montoOrigen: cobro.montoOrigen,
                    tasaHnlPorOrigen: cobro.tasaHnlPorOrigen,
                    txHash: cobro.partes.find((p) => p.txHash)?.txHash ?? null,
                    fecha: cobro.pagadoEn ?? new Date().toISOString(),
                    tipo: 'cobro',
                  })
                  setGenerandoRecibo(false)
                }}
                style={styles.recibo}
              >
                <Download size={17} color={colors.violet} />
                <Text style={styles.reciboTexto}>{generandoRecibo ? 'Generando…' : 'Descargar recibo'}</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <>
              <View style={styles.qrCaja}>
                {/* El QR va sobre blanco siempre: sobre fondo oscuro muchos
                    lectores baratos no enganchan. */}
                <QRCode value={enlaceCobro(cobro.codigo)} size={196} backgroundColor="#fff" color="#000" />
              </View>

              <Text style={styles.instruccion}>Escaneá con MyTokenPay o escribí el código</Text>

              <AnimatedPressable onPress={copiar} style={styles.codigoCaja}>
                <Text style={styles.codigo}>{cobro.codigo}</Text>
                {copiado ? <Check size={18} color={colors.ok} /> : <Copy size={18} color={colors.muted} />}
              </AnimatedPressable>
            </>
          )}

          <View style={styles.resumen}>
            <View style={styles.resumenFila}>
              <Text style={styles.resumenEtq}>Total</Text>
              <Text style={styles.resumenVal}>{lempiras(cobro.montoHnl)}</Text>
            </View>
            <View style={styles.resumenFila}>
              <Text style={styles.resumenEtq}>En ORIGEN</Text>
              <Text style={styles.resumenValSuave}>{origen(cobro.montoOrigen)}</Text>
            </View>
            {!pagado && pagadas.length > 0 && (
              <View style={styles.resumenFila}>
                <Text style={styles.resumenEtq}>Cobrado</Text>
                <Text style={[styles.resumenVal, { color: colors.ok }]}>{lempiras(cobrado)}</Text>
              </View>
            )}
          </View>

          {cobro.partes.length > 1 && (
            <View style={styles.partes}>
              <Text style={styles.partesTitulo}>
                {pagado ? 'Todos pagaron' : `Faltan ${faltan} de ${cobro.partes.length}`}
              </Text>
              {cobro.partes.map((p) => (
                <View key={p.id} style={styles.parte}>
                  <View
                    style={[
                      styles.parteIcono,
                      p.estado === 'pagada' && { backgroundColor: colors.ok },
                      p.estado === 'reservada' && { backgroundColor: colors.warn },
                    ]}
                  >
                    {p.estado === 'pagada' ? (
                      <Check size={13} color="#fff" strokeWidth={3} />
                    ) : p.estado === 'reservada' ? (
                      <Hourglass size={12} color="#fff" />
                    ) : (
                      <Text style={styles.parteNum}>{p.indice + 1}</Text>
                    )}
                  </View>
                  <Text style={styles.parteTexto} numberOfLines={1}>
                    {p.estado === 'pagada'
                      ? `${p.pagadorNombre ?? 'Alguien'} pagó`
                      : p.estado === 'reservada'
                        ? `${p.pagadorNombre ?? 'Alguien'} está pagando…`
                        : 'Sin pagar'}
                  </Text>
                  <Text style={styles.parteMonto}>
                    {lempiras(p.montoOrigen * cobro.tasaHnlPorOrigen)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {cerrado && !pagado && (
            <Text style={styles.cerrado}>
              Este cobro está {cobro.estado}. Creá uno nuevo desde la caja.
            </Text>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {!cerrado && pagadas.length === 0 && (
            <AnimatedPressable onPress={() => setConfirmarAnular(true)} style={styles.anular}>
              <X size={16} color={colors.danger} />
              <Text style={styles.anularTexto}>Anular cobro</Text>
            </AnimatedPressable>
          )}
        </ScrollView>
      </AnimatedScreen>

      <ConfirmDialog
        visible={confirmarAnular}
        title="¿Anular este cobro?"
        message="El código dejará de funcionar. Podés crear otro en la caja."
        confirmLabel="Anular"
        danger
        onConfirm={anular}
        onCancel={() => setConfirmarAnular(false)}
      />
    </SafeAreaView>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    cuerpo: { padding: 20, paddingBottom: 40, alignItems: 'center' },

    qrCaja: { backgroundColor: '#fff', padding: 18, borderRadius: radius.xl },
    instruccion: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.muted,
      marginTop: 14,
      textAlign: 'center',
    },
    codigoCaja: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: 20,
      paddingVertical: 12,
      marginTop: 10,
    },
    codigo: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.text, letterSpacing: 3 },

    exito: { alignItems: 'center', paddingVertical: 18 },
    exitoCirculo: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.ok,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exitoTitulo: { fontFamily: fonts.display, fontSize: 20, color: colors.text, marginTop: 14 },
    exitoMonto: { fontFamily: fonts.displayBold, fontSize: 34, color: colors.ok, marginTop: 4 },
    recibo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 18,
      paddingHorizontal: 20,
      paddingVertical: 11,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.violet,
    },
    reciboTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.violet },

    resumen: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginTop: 20,
      gap: 10,
    },
    resumenFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resumenEtq: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
    resumenVal: { fontFamily: fonts.displayBold, fontSize: 17, color: colors.text },
    resumenValSuave: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },

    partes: { width: '100%', marginTop: 18, gap: 8 },
    partesTitulo: { fontFamily: fonts.display, fontSize: 15, color: colors.text, marginBottom: 4 },
    parte: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    parteIcono: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceHi,
    },
    parteNum: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted },
    parteTexto: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
    parteMonto: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },

    cerrado: { fontFamily: fonts.body, fontSize: 13, color: colors.warn, marginTop: 18, textAlign: 'center' },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: 16, textAlign: 'center' },

    anular: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, padding: 10 },
    anularTexto: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger },
  })
}
