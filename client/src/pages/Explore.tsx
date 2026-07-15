import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutGrid, MapIcon, Search, SlidersHorizontal, X } from 'lucide-react'
import { api } from '../lib/api'
import type { Company } from '../types'
import { useMetaStore } from '../store/meta'
import { CategoryIcon } from '../components/CategoryIcon'
import { CompanyCard } from '../components/CompanyCard'
import { MapView } from '../components/MapView'

export function Explore() {
  const [params, setParams] = useSearchParams()
  const { categories, countries, load } = useMetaStore()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const view = params.get('view') === 'map' ? 'map' : 'grid'
  const country = params.get('country') ?? ''
  const city = params.get('city') ?? ''
  const category = params.get('category') ?? ''
  const q = params.get('q') ?? ''

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

  const cities = useMemo(
    () => countries.find((c) => c.slug === country)?.cities ?? [],
    [countries, country],
  )

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'country') next.delete('city')
    setParams(next, { replace: true })
  }

  function setView(next: 'grid' | 'map') {
    const p = new URLSearchParams(params)
    p.set('view', next)
    setParams(p, { replace: true })
  }

  const mapCenter: [number, number] = country
    ? [countries.find((c) => c.slug === country)?.lat ?? 13.5, countries.find((c) => c.slug === country)?.lng ?? -86.5]
    : [13.5, -86.5]
  const mapZoom = country ? countries.find((c) => c.slug === country)?.zoom ?? 7 : 5

  const hasFilters = Boolean(country || city || category || q)

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Directorio de comercios</h1>
          <p className="mt-1 text-sm text-muted">
            {loading ? 'Buscando…' : `${companies.length} comercio${companies.length === 1 ? '' : 's'} encontrados`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="btn-ghost !py-2 !px-3.5 text-sm lg:hidden"
          >
            <SlidersHorizontal size={15} />
            Filtros
          </button>
          <div className="flex rounded-xl border border-border p-1">
            <button
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'grid' ? 'bg-surface-hi text-text' : 'text-muted'}`}
            >
              <LayoutGrid size={14} />
              Lista
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'map' ? 'bg-surface-hi text-text' : 'text-muted'}`}
            >
              <MapIcon size={14} />
              Mapa
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>
          <div className="bento-card space-y-5 p-5">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2" />
              <input
                value={q}
                onChange={(e) => updateParam('q', e.target.value)}
                placeholder="Buscar comercio…"
                className="input-field !pl-10 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-2">País</label>
              <select
                value={country}
                onChange={(e) => updateParam('country', e.target.value)}
                className="input-field mt-2 text-sm"
              >
                <option value="">Todos los países</option>
                {countries.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.flag} {c.label}
                  </option>
                ))}
              </select>
            </div>

            {country && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-2">Ciudad</label>
                <select
                  value={city}
                  onChange={(e) => updateParam('city', e.target.value)}
                  className="input-field mt-2 text-sm"
                >
                  <option value="">Todas las ciudades</option>
                  {cities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-2">Categoría</label>
              <div className="mt-2 flex flex-col gap-1">
                {categories.map((cat) => (
                  <button
                    key={cat.slug}
                    onClick={() => updateParam('category', category === cat.slug ? '' : cat.slug)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${category === cat.slug ? 'bg-surface-hi text-text' : 'text-muted hover:text-text'}`}
                  >
                    <CategoryIcon name={cat.icon} className="h-4 w-4" />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {hasFilters && (
              <button
                onClick={() => setParams(new URLSearchParams({ view }), { replace: true })}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-semibold text-muted hover:text-text"
              >
                <X size={13} />
                Limpiar filtros
              </button>
            )}
          </div>
        </aside>

        <div>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-52 rounded-3xl" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <div className="bento-card flex flex-col items-center gap-2 p-16 text-center">
              <p className="font-display text-lg font-semibold">Sin resultados</p>
              <p className="text-sm text-muted">Prueba con otros filtros o busca otra categoría.</p>
            </div>
          ) : view === 'map' ? (
            <MapView companies={companies} center={mapCenter} zoom={mapZoom} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {companies.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
