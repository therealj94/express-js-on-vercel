// ─────────────────────────────────────────────────────────────────────────────
// Pedir el retiro a lempiras.
//
// Aquí se dice la verdad sobre cómo funciona: hay una persona en Orden Global
// que revisa la solicitud y hace la transferencia. No es instantáneo y no
// pretendemos que lo sea — un comercio que espera el dinero en dos minutos y le
// llega mañana pierde la confianza mucho más rápido que uno al que se lo
// advirtieron desde el principio.
//
// La cuenta bancaria se pide completa cada vez y no se guarda en el teléfono.
// Es un dato que no gana nada con quedarse cacheado y pierde mucho si el
// teléfono se extravía.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Clock, Info } from 'lucide-react-native'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { SelectField } from '../../src/components/ui/SelectField'
import { TextField } from '../../src/components/ui/TextField'
import { TopBar } from '../../src/components/TopBar'
import { pos, lempiras, origen, type Saldo } from '../../src/lib/pos'
import { ApiError } from '../../src/lib/apiError'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

export default function Retirar() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  const [datos, setDatos] = useState<Saldo | null>(null)
  const [bancos, setBancos] = useState<string[]>([])
  const [monto, setMonto] = useState('')
  const [banco, setBanco] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState<'ahorro' | 'cheques'>('ahorro')
  const [numeroCuenta, setNumeroCuenta] = useState('')
  const [titular, setTitular] = useState('')
  const [identidad, setIdentidad] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    Promise.all([pos.saldo(), pos.bancos()])
      .then(([s, b]) => {
        setDatos(s)
        setBancos(b.bancos)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'))
  }, [])

  const disponible = datos?.saldo.disponible ?? 0
  const tasa = datos?.enLempiras?.tasaHnlPorOrigen ?? 0
  const cantidad = Number(monto.replace(',', '.'))
  const valido =
    Number.isFinite(cantidad) &&
    cantidad > 0 &&
    cantidad <= disponible &&
    !!banco &&
    /^\d{6,20}$/.test(numeroCuenta) &&
    titular.trim().length >= 4 &&
    /^\d{13}$/.test(identidad)

  async function enviar() {
    if (!valido || enviando) return
    setEnviando(true)
    setError(null)
    try {
      await pos.pedirRetiro({
        montoOrigen: cantidad,
        banco: { banco, tipoCuenta, numeroCuenta, titular: titular.trim(), identidad },
      })
      setListo(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo pedir el retiro')
    } finally {
      setEnviando(false)
    }
  }

  if (listo) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Retiro pedido" />
        <View style={styles.centro}>
          <View style={styles.reloj}>
            <Clock size={38} color={colors.warn} />
          </View>
          <Text style={styles.listoTitulo}>Tu retiro está en cola</Text>
          <Text style={styles.listoTexto}>
            Alguien de Orden Global lo revisa y hace la transferencia a tu cuenta. Te avisamos
            cuando esté depositado. Mientras tanto ese monto queda apartado de tu saldo.
          </Text>
          <GradientButton label="Entendido" onPress={() => router.replace('/pos/saldo')} style={styles.cta} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Retirar" />
      <AnimatedScreen style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.cuerpo} showsVerticalScrollIndicator={false}>
          <View style={styles.aviso}>
            <Info size={16} color={colors.muted} />
            <Text style={styles.avisoTexto}>
              Un administrador revisa cada retiro y hace la transferencia. No es automático:
              normalmente toma unas horas hábiles.
            </Text>
          </View>

          <Text style={styles.etq}>Cuánto querés retirar</Text>
          <TextField
            value={monto}
            onChangeText={setMonto}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <View style={styles.bajoCampo}>
            <Text style={styles.ayuda}>
              Disponible: {origen(disponible)}
              {tasa > 0 ? ` · ${lempiras(disponible * tasa)}` : ''}
            </Text>
            <AnimatedPressable onPress={() => setMonto(String(disponible))}>
              <Text style={styles.todo}>Todo</Text>
            </AnimatedPressable>
          </View>
          {cantidad > 0 && tasa > 0 && cantidad <= disponible && (
            <Text style={styles.recibe}>Recibís {lempiras(cantidad * tasa)}</Text>
          )}
          {cantidad > disponible && (
            <Text style={styles.error}>No tenés tanto disponible.</Text>
          )}

          <Text style={styles.seccion}>A qué cuenta</Text>

          <SelectField
            label="Banco"
            value={banco}
            options={bancos.map((b) => ({ value: b, label: b }))}
            onChange={setBanco}
            placeholder="Elegí tu banco"
          />

          <View style={styles.tipos}>
            {(['ahorro', 'cheques'] as const).map((t) => (
              <AnimatedPressable
                key={t}
                onPress={() => setTipoCuenta(t)}
                style={[styles.tipo, tipoCuenta === t && styles.tipoActivo]}
              >
                <Text style={[styles.tipoTexto, tipoCuenta === t && styles.tipoTextoActivo]}>
                  {t === 'ahorro' ? 'Ahorro' : 'Cheques'}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          <TextField
            label="Número de cuenta"
            value={numeroCuenta}
            onChangeText={(v) => setNumeroCuenta(v.replace(/\D/g, ''))}
            placeholder="Solo números"
            keyboardType="number-pad"
          />
          <TextField
            label="Titular de la cuenta"
            value={titular}
            onChangeText={setTitular}
            placeholder="Como aparece en el banco"
          />
          <TextField
            label="Identidad del titular"
            value={identidad}
            onChangeText={(v) => setIdentidad(v.replace(/\D/g, ''))}
            placeholder="13 dígitos"
            keyboardType="number-pad"
            maxLength={13}
          />

          <Text style={styles.nota}>
            Revisá bien el número: si está mal, el banco rechaza la transferencia y hay que
            empezar de nuevo.
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <GradientButton
            label="Pedir retiro"
            onPress={enviar}
            disabled={!valido}
            loading={enviando}
            style={{ marginTop: 18 }}
          />
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
    cuerpo: { padding: 20, paddingBottom: 44, gap: 10 },

    aviso: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 8,
    },
    avisoTexto: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, lineHeight: 18 },

    etq: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    bajoCampo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    ayuda: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
    todo: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.violet },
    recibe: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.ok, marginTop: 4 },

    seccion: { fontFamily: fonts.display, fontSize: 15, color: colors.text, marginTop: 18 },

    tipos: { flexDirection: 'row', gap: 8 },
    tipo: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    tipoActivo: { borderColor: colors.violet, backgroundColor: colors.surfaceHi },
    tipoTexto: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
    tipoTextoActivo: { color: colors.text },

    nota: { fontFamily: fonts.body, fontSize: 12, color: colors.muted2, lineHeight: 17, marginTop: 6 },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: 6 },

    reloj: {
      width: 82,
      height: 82,
      borderRadius: 41,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listoTitulo: { fontFamily: fonts.display, fontSize: 20, color: colors.text, marginTop: 6 },
    listoTexto: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, textAlign: 'center', lineHeight: 20 },
    cta: { alignSelf: 'stretch', marginTop: 18 },
  })
}
