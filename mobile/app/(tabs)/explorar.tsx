import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { LayoutGrid, MapIcon, Search, SlidersHorizontal, X } from 'lucide-react-native'
import { Screen } from '../../src/components/Screen'
import { TopBar } from '../../src/components/TopBar'
import { CompanyCard } from '../../src/components/CompanyCard'
import { CompanyMap } from '../../src/components/CompanyMap'
import { CategoryIcon } from '../../src/components/CategoryIcon'
import { TextField } from '../../src/components/ui/TextField'
import { SelectField } from '../../src/components/ui/SelectField'
import { useMetaStore } from '../../src/store/meta'
import { api } from '../../src/lib/api'
import type { Company } from '../../src/lib/types'
import { colors, fonts, radius } from '../../src/lib/theme'

export default function Explore() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>()
  const { categories, countries, load } = useMetaStore()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [q, setQ] = useState(params.q ?? '')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState(params.category ?? '')

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setLoading(true)
    api
      .listCompanies({ country, city, category, q })
      .then(({ companies }) => setCompanies(companies))
      .finally(() => setLoading(false))
  }, [country, city, category, q])

  const cities = useMemo(() => countries.find((c) => c.slug === country)?.cities ?? [], [countries, country])
  const hasFilters = Boolean(country || city || category || q)

  const mapCenter = country
    ? {
        latitude: countries.find((c) => c.slug === country)?.lat ?? 13.5,
        longitude: countries.find((c) => c.slug === country)?.lng ?? -86.5,
      }
    : { latitude: 13.5, longitude: -86.5 }

  return (
    <Screen scroll={view === 'list'} edges={['top']}>
      <TopBar title="Directorio" />

      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {loading ? 'Buscando…' : `${companies.length} comercio${companies.length === 1 ? '' : 's'}`}
        </Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setFiltersOpen((v) => !v)} style={styles.iconBtn}>
            <SlidersHorizontal size={15} color={colors.text} />
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
        <View style={styles.filters}>
          <TextField
            value={q}
            onChangeText={setQ}
            placeholder="Buscar comercio…"
            icon={<Search size={14} color={colors.muted2} />}
          />
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

          <View>
            <Text style={styles.filterLabel}>Categoría</Text>
            <View style={styles.categoryWrap}>
              {categories.map((cat) => {
                const active = category === cat.slug
                return (
                  <Pressable
                    key={cat.slug}
                    onPress={() => setCategory(active ? '' : cat.slug)}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                  >
                    <CategoryIcon name={cat.icon} size={13} color={active ? colors.text : colors.muted} />
                    <Text style={[styles.categoryChipText, active && { color: colors.text }]}>{cat.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {hasFilters && (
            <Pressable
              onPress={() => {
                setQ('')
                setCountry('')
                setCity('')
                setCategory('')
              }}
              style={styles.clearBtn}
            >
              <X size={12} color={colors.muted} />
              <Text style={styles.clearText}>Limpiar filtros</Text>
            </Pressable>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : companies.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptyBody}>Prueba con otros filtros o busca otra categoría.</Text>
        </View>
      ) : view === 'map' ? (
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
          <CompanyMap companies={companies} center={mapCenter} zoomDelta={country ? 3 : 8} />
        </View>
      ) : (
        <View style={styles.list}>
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 4,
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
  toggle: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 3 },
  toggleBtn: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: colors.surfaceHi },
  filters: { paddingHorizontal: 20, marginTop: 16, gap: 14 },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterLabel: {
    color: colors.muted2,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  categoryChipActive: { borderColor: colors.blue, backgroundColor: colors.surfaceHi },
  categoryChipText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 11.5 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  clearText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  loading: { paddingTop: 60, alignItems: 'center' },
  empty: { paddingHorizontal: 20, paddingTop: 60, alignItems: 'center', gap: 6 },
  emptyTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 16 },
  emptyBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  list: { paddingHorizontal: 20, marginTop: 16, gap: 12 },
})
