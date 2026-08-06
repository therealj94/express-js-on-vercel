// ─────────────────────────────────────────────────────────────────────────────
// Pagar una cuenta.
//
// Lo que el cliente ve al escanear el QR: cuánto es, de quién, y —si la cuenta
// va dividida— qué porciones quedan libres para tomar las suyas.
//
// El orden de las cosas importa y no es casual:
//
//   1. Reservar  → bloquea las porciones unos minutos, para que su amigo no
//                  pague la misma mientras él saca el teléfono
//   2. Firmar    → salta a Veta Wallet, que es quien tiene las llaves
//   3. Confirmar → vuelve con el hash y se cierra el pago
//
// Si el usuario abandona a medias, la reserva caduca sola y la porción vuelve a
// quedar libre. Nada queda trabado esperando a alguien que ya se fue.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { BadgeCheck, Check, Store, TriangleAlert, Wallet } from 'lucide-react-native'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { TextField } from '../../src/components/ui/TextField'
import { TopBar } from '../../src/components/TopBar'
import { pos, lempiras, origen, nuevoSello, type CobroPublico, type Parte } from '../../src/lib/pos'
import { abrirTienda, abrirVeta, hashValido, vetaInstalada } from '../../src/lib/veta'
import { ApiError } from '../../src/lib/apiError'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

type Fase = 'eligiendo' | 'firmando' | 'confirmando' | 'listo'

export default function Pagar() {
  const { codigo, sello: selloDeVuelta, tx } = useLocalSearchParams<{
    codigo: string
    sello?: string
    tx?: string
  }>()
  const router = useRouter()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  const [cobro, setCobro] = useState<CobroPublico | null>(null)
  const [elegidas, setElegidas] = useState<string[]>([])
  const [fase, setFase] = useState<Fase>('eligiendo')
  const [error, setError] = useState<string | null>(null)
  const [hashManual, setHashManual] = useState('')
  const [pedirHash, setPedirHash] = useState(false)

  // El sello se fija UNA vez por intento. Si se regenerara en cada envío, el
  // reintento parecería un pago nuevo y el cliente pagaría dos veces.
  const sello = useRef<string>(selloDeVuelta ?? nuevoSello())

  const cargar = useCallback(async () => {
    try {
      const { cobro: c } = await pos.verCobro(String(codigo))
      setCobro(c)
      setError(null)
      return c
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No encontramos ese cobro')
      return null
    }
  }, [codigo])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Vuelta desde Veta Wallet con el comprobante en la mano.
  useEffect(() => {
    if (tx && hashValido(String(tx)) && fase !== 'listo') {
      confirmar(String(tx))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx])

  const libres = useMemo(
    () => cobro?.partes.filter((p) => p.estado === 'libre') ?? [],
    [cobro],
  )
  const dividida = (cobro?.partes.length ?? 1) > 1
  const total = useMemo(() => {
    if (!cobro) return { origen: 0, hnl: 0 }
    const ps = cobro.partes.filter((p) => elegidas.includes(p.id))
    return {
      origen: ps.reduce((s, p) => s + p.montoOrigen, 0),
      hnl: ps.reduce((s, p) => s + (p.montoHnl ?? p.montoOrigen * cobro.tasaHnlPorOrigen), 0),
    }
  }, [cobro, elegidas])

  function alternar(p: Parte) {
    if (p.estado !== 'libre') return
    Haptics.selectionAsync().catch(() => {})
    setElegidas((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
  }

  async function firmar() {
    if (!cobro || elegidas.length === 0) return
    if (!cobro.negocio?.direccion) {
      setError('Este comercio todavía no configuró dónde recibir los pagos.')
      return
    }
    setError(null)
    setFase('firmando')

    try {
      // Se reserva ANTES de mandar a firmar. Al revés, dos personas firmarían
      // la misma porción y una de las dos pagaría de más.
      await pos.reservar(cobro.codigo, elegidas)
    } catch (e) {
      setFase('eligiendo')
      setError(e instanceof ApiError ? e.message : 'No se pudieron apartar esas partes')
      await cargar()
      return
    }

    const abrio = await abrirVeta({
      destino: cobro.negocio.direccion,
      montoOrigen: total.origen,
      referencia: cobro.codigo,
      concepto: cobro.concepto,
      sello: sello.current,
    })

    if (!abrio) {
      setFase('eligiendo')
      if (!(await vetaInstalada())) {
        setError('Necesitás Veta Wallet para pagar con ORIGEN.')
      } else {
        setError('No se pudo abrir Veta Wallet. Probá pegando el comprobante a mano.')
        setPedirHash(true)
      }
    }
  }

  async function confirmar(txHash: string) {
    if (!cobro) return
    setFase('confirmando')
    setError(null)
    try {
      const r = await pos.pagar(cobro.codigo, {
        parteIds: elegidas.length ? elegidas : libres.slice(0, 1).map((p) => p.id),
        txHash,
        sello: sello.current,
      })
      setCobro(r.cobro)
      setFase('listo')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (e) {
      setFase('eligiendo')
      setError(e instanceof ApiError ? e.message : 'No se pudo confirmar el pago')
      await cargar()
    }
  }

  async function cancelar() {
    if (cobro && elegidas.length) await pos.liberar(cobro.codigo, elegidas).catch(() => {})
    router.back()
  }

  if (!cobro) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Pagar" />
        <View style={styles.centro}>
          {error ? (
            <>
              <TriangleAlert size={34} color={colors.warn} />
              <Text style={styles.error}>{error}</Text>
            </>
          ) : (
            <ActivityIndicator color={colors.violet} />
          )}
        </View>
      </SafeAreaView>
    )
  }

  if (fase === 'listo') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Pago hecho" />
        <View style={styles.centro}>
          <View style={styles.exitoCirculo}>
            <Check size={44} color="#fff" strokeWidth={3} />
          </View>
          <Text style={styles.exitoTitulo}>Listo</Text>
          <Text style={styles.exitoMonto}>{lempiras(total.hnl)}</Text>
          <Text style={styles.exitoPie}>
            {cobro.estado === 'pagado'
              ? 'La cuenta quedó saldada.'
              : `Faltan ${cobro.partes.filter((p) => p.estado !== 'pagada').length} partes por pagar.`}
          </Text>
          <GradientButton label="Volver" onPress={() => router.replace('/(tabs)')} style={styles.ctaVolver} />
        </View>
      </SafeAreaView>
    )
  }

  const cerrado = cobro.estado !== 'abierto'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Pagar" />
      <AnimatedScreen style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.cuerpo} showsVerticalScrollIndicator={false}>
          <View style={styles.negocio}>
            <View style={styles.negocioIcono}>
              <Store size={20} color={colors.violet} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.negocioFila}>
                <Text style={styles.negocioNombre} numberOfLines={1}>
                  {cobro.negocio?.nombre ?? 'Comercio'}
                </Text>
                {cobro.negocio?.verificado && <BadgeCheck size={15} color={colors.ok} />}
              </View>
              {!!cobro.concepto && <Text style={styles.concepto}>{cobro.concepto}</Text>}
            </View>
          </View>

          <View style={styles.montoCaja}>
            <Text style={styles.montoEtq}>Total de la cuenta</Text>
            <Text style={styles.montoGrande}>{lempiras(cobro.montoHnl)}</Text>
            <Text style={styles.montoOrigen}>{origen(cobro.montoOrigen)}</Text>
          </View>

          {cerrado ? (
            <View style={styles.aviso}>
              <TriangleAlert size={18} color={colors.warn} />
              <Text style={styles.avisoTexto}>
                {cobro.estado === 'pagado'
                  ? 'Esta cuenta ya está pagada.'
                  : `Este cobro está ${cobro.estado}. Pedile al comercio uno nuevo.`}
              </Text>
            </View>
          ) : dividida ? (
            <>
              <Text style={styles.seccion}>Elegí qué pagás</Text>
              <View style={styles.partes}>
                {cobro.partes.map((p) => {
                  const elegida = elegidas.includes(p.id)
                  const libre = p.estado === 'libre'
                  return (
                    <AnimatedPressable
                      key={p.id}
                      onPress={() => alternar(p)}
                      disabled={!libre}
                      style={[
                        styles.parte,
                        elegida && { borderColor: colors.violet, backgroundColor: colors.surfaceHi },
                        !libre && styles.parteTomada,
                      ]}
                    >
                      <View style={[styles.marca, elegida && { backgroundColor: colors.violet }]}>
                        {elegida && <Check size={13} color="#fff" strokeWidth={3} />}
                        {p.estado === 'pagada' && <Check size={13} color={colors.ok} strokeWidth={3} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.parteMonto}>
                          {lempiras(p.montoHnl ?? p.montoOrigen * cobro.tasaHnlPorOrigen)}
                        </Text>
                        <Text style={styles.parteEstado}>
                          {p.estado === 'pagada'
                            ? `Pagó ${p.pagadorNombre ?? 'alguien'}`
                            : p.estado === 'reservada'
                              ? `${p.pagadorNombre ?? 'Alguien'} está pagando…`
                              : `Parte ${p.indice + 1}`}
                        </Text>
                      </View>
                    </AnimatedPressable>
                  )
                })}
              </View>
            </>
          ) : (
            // Sin división no hay nada que elegir: se toma la única parte.
            <Text style={styles.seccion}>Vas a pagar la cuenta completa</Text>
          )}

          {pedirHash && (
            <View style={styles.manual}>
              <Text style={styles.manualTitulo}>Pegá el comprobante</Text>
              <Text style={styles.manualPie}>
                Copialo desde Veta Wallet cuando termine el envío. Empieza con 0x.
              </Text>
              <TextField
                value={hashManual}
                onChangeText={setHashManual}
                placeholder="0x…"
                autoCapitalize="none"
              />
              <GradientButton
                label="Confirmar pago"
                onPress={() => confirmar(hashManual.trim())}
                disabled={!hashValido(hashManual)}
                style={{ marginTop: 10 }}
              />
            </View>
          )}

          {error && (
            <View style={styles.errorCaja}>
              <Text style={styles.error}>{error}</Text>
              {error.includes('Veta Wallet') && (
                <AnimatedPressable onPress={abrirTienda} style={styles.instalar}>
                  <Text style={styles.instalarTexto}>Instalar Veta Wallet</Text>
                </AnimatedPressable>
              )}
            </View>
          )}
        </ScrollView>

        {!cerrado && !pedirHash && (
          <View style={styles.pie}>
            {(dividida ? elegidas.length > 0 : true) && (
              <Text style={styles.pieTotal}>
                Pagás {lempiras(dividida ? total.hnl : cobro.montoHnl)}
              </Text>
            )}
            <GradientButton
              label={fase === 'firmando' ? 'Abriendo Veta Wallet…' : 'Pagar con Veta Wallet'}
              onPress={() => {
                if (!dividida && elegidas.length === 0 && libres[0]) {
                  setElegidas([libres[0].id])
                  setTimeout(firmar, 0)
                } else {
                  firmar()
                }
              }}
              disabled={
                fase !== 'eligiendo' || (dividida && elegidas.length === 0) || libres.length === 0
              }
              loading={fase === 'firmando' || fase === 'confirmando'}
              icon={<Wallet size={18} color="#fff" />}
            />
            <AnimatedPressable onPress={cancelar} style={styles.cancelar}>
              <Text style={styles.cancelarTexto}>Cancelar</Text>
            </AnimatedPressable>
          </View>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
    cuerpo: { padding: 20, paddingBottom: 24 },

    negocio: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    negocioIcono: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    negocioFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    negocioNombre: { fontFamily: fonts.display, fontSize: 16, color: colors.text, flexShrink: 1 },
    concepto: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },

    montoCaja: { alignItems: 'center', paddingVertical: 26 },
    montoEtq: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
    montoGrande: { fontFamily: fonts.displayBold, fontSize: 44, color: colors.text, marginTop: 4, letterSpacing: -1 },
    montoOrigen: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.violet, marginTop: 2 },

    seccion: { fontFamily: fonts.display, fontSize: 15, color: colors.text, marginBottom: 10 },
    partes: { gap: 8 },
    parte: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    parteTomada: { opacity: 0.45 },
    marca: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    parteMonto: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.text },
    parteEstado: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 1 },

    aviso: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    avisoTexto: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },

    manual: { marginTop: 22, gap: 6 },
    manualTitulo: { fontFamily: fonts.display, fontSize: 15, color: colors.text },
    manualPie: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginBottom: 6 },

    errorCaja: { marginTop: 16, alignItems: 'center', gap: 10 },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, textAlign: 'center' },
    instalar: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.violet,
    },
    instalarTexto: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.violet },

    pie: { padding: 20, paddingTop: 8, gap: 8 },
    pieTotal: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.muted, textAlign: 'center' },
    cancelar: { alignSelf: 'center', padding: 10 },
    cancelarTexto: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },

    exitoCirculo: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: colors.ok,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exitoTitulo: { fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 8 },
    exitoMonto: { fontFamily: fonts.displayBold, fontSize: 36, color: colors.ok },
    exitoPie: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
    ctaVolver: { marginTop: 20, alignSelf: 'stretch' },
  })
}
