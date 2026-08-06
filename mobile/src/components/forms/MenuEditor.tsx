// El editor del menú del negocio: platos con precio en lempiras o dólares.
// Vive en «Mi empresa» y alimenta la pantalla de tomar orden del POS.

import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Plus, Trash2, UtensilsCrossed } from 'lucide-react-native'
import { AnimatedPressable } from '../AnimatedPressable'
import { TextField } from '../ui/TextField'
import { GradientButton } from '../ui/GradientButton'
import { fonts, radius } from '../../lib/theme'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'
import type { PlatoMenu } from '../../lib/types'

interface Props {
  menu: PlatoMenu[]
  onChange: (menu: PlatoMenu[]) => void
}

const nuevoId = () => `plato-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function MenuEditor({ menu, onChange }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)

  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [moneda, setMoneda] = useState<'HNL' | 'USD'>('HNL')

  function agregar() {
    const p = Number(precio.replace(',', '.'))
    if (!nombre.trim() || !Number.isFinite(p) || p <= 0) return
    onChange([
      ...menu,
      { id: nuevoId(), nombre: nombre.trim(), descripcion: '', precio: Math.round(p * 100) / 100, moneda },
    ])
    setNombre('')
    setPrecio('')
  }

  function quitar(id: string) {
    onChange(menu.filter((m) => m.id !== id))
  }

  const simbolo = (m: 'HNL' | 'USD') => (m === 'USD' ? 'US$' : 'L')

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <UtensilsCrossed size={15} color={colors.violet} />
        <Text style={styles.title}>Menú del negocio</Text>
      </View>
      <Text style={styles.hint}>
        Lo que agregues aquí aparece en tu ficha del directorio y en la caja para tomar la orden.
        Cada plato en su moneda: lempiras o dólares.
      </Text>

      {menu.map((plato) => (
        <View key={plato.id} style={styles.item}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemNombre}>{plato.nombre}</Text>
            <Text style={styles.itemPrecio}>
              {simbolo(plato.moneda)} {plato.precio.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <AnimatedPressable onPress={() => quitar(plato.id)} style={styles.trash}>
            <Trash2 size={15} color={colors.danger} />
          </AnimatedPressable>
        </View>
      ))}

      <View style={styles.form}>
        <TextField label="Plato o producto" placeholder="Ej. Chow mein especial" value={nombre} onChangeText={setNombre} />
        <View style={styles.filaPrecio}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Precio"
              placeholder="0.00"
              value={precio}
              onChangeText={setPrecio}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.monedas}>
            {(['HNL', 'USD'] as const).map((m) => (
              <AnimatedPressable
                key={m}
                onPress={() => setMoneda(m)}
                style={[styles.monedaBtn, moneda === m && styles.monedaActiva]}
              >
                <Text style={[styles.monedaTexto, moneda === m && styles.monedaTextoActivo]}>{simbolo(m)}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
        <GradientButton
          label="Agregar al menú"
          variant="ghost"
          onPress={agregar}
          disabled={!nombre.trim() || !precio.trim()}
          icon={<Plus size={15} color={colors.text} />}
        />
      </View>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    itemNombre: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13.5 },
    itemPrecio: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
    trash: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.danger + '44',
      alignItems: 'center',
      justifyContent: 'center',
    },
    form: { gap: 10, marginTop: 4 },
    filaPrecio: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
    monedas: { flexDirection: 'row', gap: 6, paddingBottom: 2 },
    monedaBtn: {
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    monedaActiva: { borderColor: colors.violet, backgroundColor: colors.violet + '22' },
    monedaTexto: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    monedaTextoActivo: { color: colors.text },
  })
}
