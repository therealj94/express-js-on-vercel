// ─────────────────────────────────────────────────────────────────────────────
// El saldo del comercio y el retiro a lempiras.
//
// Todo lo que el negocio necesita saber sobre su dinero en una pantalla: cuánto
// tiene, cuánto puede sacar hoy, qué entró y qué salió, y el botón para pedir
// que se lo depositen.
//
// La distinción entre «total» y «disponible» está a la vista y explicada. Es la
// que genera todas las llamadas de soporte cuando se omite: el comercio ve un
// número, pide retirar ese número, le dicen que no, y nadie le explicó que ya
// tenía otro retiro en cola.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowDownLeft, ArrowUpRight, Banknote, Clock, Info, ShieldAlert } from 'lucide-react-native'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { TopBar } from '../../src/components/TopBar'
import { pos, lempiras, origen, type Movimiento, type Retiro, type Saldo } from '../../src/lib/pos'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

const ETIQUETA_RETIRO: Record<Retiro['estado'], string> = {
  solicitado: 'Esperando revisión',
  en_proceso: 'Transferencia en camino',
  pagado: 'Depositado',
  rechazado: 'Rechazado',
}

export default function SaldoComercio() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  const [datos, setDatos] = useState<Saldo | null>(null)
  const [retiros, setRetiros] = useState<Retiro[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([pos.saldo(), pos.misRetiros()])
      setDatos(s)
      setRetiros(r.retiros)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el saldo')
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!datos) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TopBar title="Mi dinero" />
        <View style={styles.centro}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.violet} />}
        </View>
      </SafeAreaView>
    )
  }

  const { saldo, enLempiras, movimientos } = datos
  const enCola = retiros.filter((r) => r.estado === 'solicitado' || r.estado === 'en_proceso')

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Mi dinero" />
      <AnimatedScreen style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.cuerpo}
          showsVerticalScrollIndicator={false}
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
          <View style={styles.tarjeta}>
            <Text style={styles.etq}>Disponible para retirar</Text>
            <Text style={styles.grande}>
              {enLempiras ? lempiras(enLempiras.disponible) : origen(saldo.disponible)}
            </Text>
            <Text style={styles.enOrigen}>{origen(saldo.disponible)}</Text>

            {saldo.porConfirmar > 0 && (
              <View style={styles.porConfirmar}>
                <ShieldAlert size={14} color={colors.warn} />
                <Text style={styles.porConfirmarTexto}>
                  {origen(saldo.porConfirmar)}
                  {enLempiras ? ` (${lempiras(enLempiras.porConfirmar)})` : ''} por confirmar: son
                  pagos que la cadena todavía no respalda. Aparecen acá, pero no se pueden retirar
                  hasta que el depósito esté en tu billetera. Usá «Verificar pago» en el cobro.
                </Text>
              </View>
            )}

            {saldo.retenido > 0 && (
              <View style={styles.retenido}>
                <Info size={14} color={colors.warn} />
                <Text style={styles.retenidoTexto}>
                  {origen(saldo.retenido)} están apartados por retiros que todavía no se resuelven.
                </Text>
              </View>
            )}

            {enLempiras && (
              <Text style={styles.fuente}>
                1 ORIGEN = {lempiras(enLempiras.tasaHnlPorOrigen)} · {enLempiras.fuente}
              </Text>
            )}
          </View>

          <GradientButton
            label="Retirar a mi cuenta"
            onPress={() => router.push('/pos/retirar')}
            disabled={saldo.disponible <= 0}
            style={{ marginTop: 16 }}
            icon={<Banknote size={18} color="#fff" />}
          />

          {enCola.length > 0 && (
            <>
              <Text style={styles.seccion}>Retiros en curso</Text>
              {enCola.map((r) => (
                <View key={r.id} style={styles.retiro}>
                  <Clock size={16} color={colors.warn} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.retiroMonto}>{lempiras(r.montoHnl)}</Text>
                    <Text style={styles.retiroPie}>
                      {ETIQUETA_RETIRO[r.estado]} · {r.banco.banco} {r.banco.numeroCuenta}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <Text style={styles.seccion}>Movimientos</Text>
          {movimientos.length === 0 ? (
            <Text style={styles.vacio}>Todavía no hay movimientos. Cobrá tu primera venta desde la caja.</Text>
          ) : (
            movimientos.map((m: Movimiento) => {
              const entra = m.montoOrigen > 0
              return (
                <View key={m.id} style={styles.mov}>
                  <View style={[styles.movIcono, { backgroundColor: entra ? colors.surfaceHi : colors.surface }]}>
                    {entra ? (
                      <ArrowDownLeft size={16} color={colors.ok} />
                    ) : (
                      <ArrowUpRight size={16} color={colors.muted} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.movConcepto} numberOfLines={1}>
                      {m.concepto}
                    </Text>
                    <Text style={styles.movFecha}>
                      {new Date(m.creadoEn).toLocaleString('es-HN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.movMonto, { color: entra ? colors.ok : colors.muted }]}>
                    {entra ? '+' : ''}
                    {origen(Math.abs(m.montoOrigen))}
                  </Text>
                </View>
              )
            })
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    cuerpo: { padding: 20, paddingBottom: 40 },

    tarjeta: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      alignItems: 'center',
    },
    etq: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
    grande: { fontFamily: fonts.displayBold, fontSize: 40, color: colors.text, marginTop: 4, letterSpacing: -1 },
    enOrigen: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.violet, marginTop: 2 },
    porConfirmar: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
    },
    porConfirmarTexto: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, flex: 1 },
    retenido: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      backgroundColor: colors.bgSoft,
      borderRadius: radius.md,
      padding: 10,
      marginTop: 14,
    },
    retenidoTexto: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.muted },
    fuente: { fontFamily: fonts.body, fontSize: 11, color: colors.muted2, marginTop: 12, textAlign: 'center' },

    seccion: { fontFamily: fonts.display, fontSize: 15, color: colors.text, marginTop: 24, marginBottom: 10 },
    vacio: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19 },

    retiro: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 8,
    },
    retiroMonto: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.text },
    retiroPie: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 1 },

    mov: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    movIcono: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    movConcepto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    movFecha: { fontFamily: fonts.body, fontSize: 11, color: colors.muted2, marginTop: 1 },
    movMonto: { fontFamily: fonts.bodyMedium, fontSize: 13 },

    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, textAlign: 'center', marginTop: 16 },
  })
}
