import { create } from 'zustand'
import type { Category, Country } from '../lib/types'
import { api } from '../lib/api'

interface MetaState {
  categories: Category[]
  countries: Country[]
  loaded: boolean
  load: () => Promise<void>
  categoryLabel: (slug: string) => string
  countryLabel: (slug: string) => string
  cityLabel: (countrySlug: string, citySlug: string) => string
}

export const useMetaStore = create<MetaState>((set, get) => ({
  categories: [],
  countries: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return
    const [{ categories }, { countries }] = await Promise.all([api.categories(), api.countries()])
    set({ categories, countries, loaded: true })
  },

  categoryLabel: (slug) => get().categories.find((c) => c.slug === slug)?.label ?? slug,

  countryLabel: (slug) => get().countries.find((c) => c.slug === slug)?.label ?? slug,

  cityLabel: (countrySlug, citySlug) =>
    get()
      .countries.find((c) => c.slug === countrySlug)
      ?.cities.find((c) => c.slug === citySlug)?.label ?? citySlug,
}))
