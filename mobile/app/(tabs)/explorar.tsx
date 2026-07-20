import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Heart, LayoutGrid, MapIcon, Search, SlidersHorizontal, X } from 'lucide-react-native'
import { Screen } from '../../src/components/Screen'
import { TopBar } from '../../src/components/TopBar'
import { CompanyCard } from '../../src/components/CompanyCard'
import { CompanyCardSkeleton } from '../../src/components/CompanyCardSkeleton'
import { CompanyMap } from '../../src/components/CompanyMap'
import { CategoryIcon } from '../../src/components/CategoryIcon'
import { TextField } from '../../src/components/ui/TextField'
import { SelectField } from '../../src/components/ui/SelectField'
import { AnimatedText } from '../../src/components/AnimatedText'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { useMetaStore } from '../../src/store/meta'
import { useFavoritesStore } from '../../src/store/favorites'
import { api } from '../../src/lib/api'
import type { Company } from '../../src/lib/types'
import { fonts, radius } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

const SEARCH_DEBOUNCE_MS = 350

export default function Explore() {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const params = useLocalSearchParams<{ q?: string; category?: string }>()
  const { categories, countries, load } = useMetaStore()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [favOnly, setFavOnly] = useState(false)
  const favIds = useFavoritesStore((s) => s.ids)

  const [qInput, setQInput] = useState(params.q ?? '')
  const [q, setQ] = useState(params.q ?? '')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState(params.category ?? '')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQ(qInput), SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [qInput])

  useEffect(() => {
    setLoading(true)
    api
      .listCompanies({ country, city, category, q })
      .then(({ companies }) => setCompanies(companies))
      .finally(() => setLoading(false))
  }, [country, city, category, q])

  const cities = useMemo(() => countries.find((c) => c.slug === country)?.cities ?? [], [countries, country])
  const visible = useMemo(
    () => (favOnly ? companies.filter((c) => favIds.includes(c.id)) : companies),
    [companies, favOnly, favIds],
  )
  const hasFilters = Boolean(country || city || category || qInput || favOnly)

  function clearAll() {
    setQInput('')
    setQ('')
    setCountry('')
    setCity('')
    setCategory('')
    setFavOnly(false)
  }

  const mapCenter = country
    ? {
        latitude: countries.find((c) => c.slug === country)?.lat ?? 13.5,
        longitude: countries.find((c) => c.slug === country)?.lng ?? -86.5,
      }
    : { latitude: 13.5, longitude: -86.5 }

  return (
    <Screen scroll={view === 'list'} edges={['top']}>
      <TopBar title="Directorio" />

      <View style={styles.searchRow}>
        <TextField
          value={qInput}
          onChangeText={setQInput}
          placeholder="Busca por nombre, comida, servicio…"
          icon={<Search size={14} color={colors.muted2} />}
          rightElement={
            qInput.length > 0 ? (
              <Pressable onPress={() => setQInput('')} hitSlop={10}>
                <X size={14} color={colors.muted2} />
              </Pressable>
            ) : undefined
          }
          returnKeyType="search"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCats}>
        {categories.map((cat) => {
          const active = category === cat.slug
          return (
            <AnimatedPressable
              key={cat.slug}
              onPress={() => setCategory(active ? '' : cat.slug)}
              scaleTo={0.94}
              style={[styles.quickChip, active && styles.quickChipActive]}
            >
              <CategoryIcon name={cat.icon} size={13} color={active ? colors.bg : colors.muted} />
              <Text style={[styles.quickChipText, active && { color: colors.bg }]}>{cat.label}</Text>
            </AnimatedPressable>
          )
        })}
      </ScrollView>

      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {loading ? 'Buscando…' : `${visible.length} comercio${visible.length === 1 ? '' : 's'}`}
        </Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setFavOnly((v) => !v)} style={[styles.iconBtn, favOnly && styles.iconBtnActive]}>
            <Heart size={15} color={favOnly ? colors.danger : colors.text} fill={favOnly ? colors.danger : 'transparent'} />
          </Pressable>
          <Pressable onPress={() => setFiltersOpen((v) => !v)} style={[styles.iconBtn, Boolean(country || city) && styles.iconBtnActive]}>
            <SlidersHorizontal size={15} color={country || city ? colors.blue : colors.text} />
          </Pressable>
          <View style={styles.toggle}>
            <Pressable onPress={() => setView('list')} style={[styles.toggleBtn, view === 'list' && styles.toggleActive]}>
              <LayoutGrid size={13} color={view === 'list' ? colors.text : colors.muted} />
            </Pressable>
            <Pressable onPress={() => setView('map')} style={[styles.toggleBtn, view === 'map' && styles.toggleActive]}>
              <MapIcon size={13} color={view === 'map' ? colors.text : colors.muted} />
            </Pressable>
          </View>
        </View>
      </View>

      {filtersOpen && (
        <AnimatedScreen animKey="filters" fill={false} distance={8} style={styles.filters}>
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <SelectField
                label="País"
                value={country}
                onChange={(v) => {
                  setCountry(v)
                  setCity('')
                }}
                placeholder="Todos"
                options={countries.map((c) => ({ value: c.slug, label: `${c.flag} ${c.label}` }))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SelectField
                label="Ciudad"
                value={city}
                onChange={setCity}
                placeholder="Todas"
                disabled={!country}
                options={cities.map((c) => ({ value: c.slug, label: c.label }))}
              />
            </View>
          </View>

          {hasFilters && (
            <Pressable onPress={clearAll} style={styles.clearBtn}>
              <X size={12} color={colors.muted} />
              <Text style={styles.clearText}>Limpiar filtros</Text>
            </Pressable>
          )}
        </AnimatedScreen>
      )}

      {loading ? (
        <View style={styles.list}>
          <CompanyCardSkeleton />
          <CompanyCardSkeleton />
          <CompanyCardSkeleton />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <AnimatedText style={styles.emptyTitle}>{favOnly ? 'Sin favoritos aún' : 'Sin resultados'}</AnimatedText>
          <Text style={styles.emptyBody}>
            {favOnly ? 'Toca el corazón en un comercio para guardarlo aquí.' : 'Prueba con otros términos, país o categoría.'}
          </Text>
          {hasFilters && (
            <Pressable onPress={clearAll} style={[styles.clearBtn, { marginTop: 6 }]}>
              <X size={12} color={colors.muted} />
              <Text style={styles.clearText}>Limpiar filtros</Text>
            </Pressable>
          )}
        </View>
      ) : view === 'map' ? (
        <AnimatedScreen animKey="map" distance={6} style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
          <CompanyMap companies={visible} center={mapCenter} zoomDelta={country ? 3 : 8} />
        </AnimatedScreen>
      ) : (
        <AnimatedScreen animKey="list" fill={false} distance={6} style={styles.list}>
          {visible.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </AnimatedScreen>
      )}
    </Screen>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  searchRow: { paddingHorizontal: 20, marginTop: 6 },
  quickCats: { paddingHorizontal: 20, gap: 8, marginTop: 12 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  quickChipText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 11.5 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 14,
  },
  count: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { borderColor: colors.blue, backgroundColor: colors.blue + '18' },
  toggle: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 3 },
  toggleBtn: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: colors.surfaceHi },
  filters: { paddingHorizontal: 20, marginTop: 14, gap: 12 },
  filterRow: { flexDirection: 'row', gap: 10 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  clearText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  loading: { paddingTop: 60, alignItems: 'center' },
  empty: { paddingHorizontal: 20, paddingTop: 60, alignItems: 'center', gap: 6 },
  emptyTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 16 },
  emptyBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  list: { paddingHorizontal: 20, marginTop: 16, gap: 12 },
  })
}
