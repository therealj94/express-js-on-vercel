import type { Country } from '../types.js'

export const countries: Country[] = [
  {
    slug: 'honduras',
    label: 'Honduras',
    flag: '🇭🇳',
    lat: 14.8,
    lng: -86.6,
    zoom: 7,
    cities: [
      { slug: 'tegucigalpa', label: 'Tegucigalpa', lat: 14.0723, lng: -87.1921 },
      { slug: 'san-pedro-sula', label: 'San Pedro Sula', lat: 15.5049, lng: -88.0253 },
      { slug: 'la-ceiba', label: 'La Ceiba', lat: 15.7597, lng: -86.7822 },
      { slug: 'roatan', label: 'Roatán', lat: 16.325, lng: -86.5335 },
    ],
  },
  {
    slug: 'guatemala',
    label: 'Guatemala',
    flag: '🇬🇹',
    lat: 15.6,
    lng: -90.3,
    zoom: 7,
    cities: [
      { slug: 'ciudad-de-guatemala', label: 'Ciudad de Guatemala', lat: 14.6349, lng: -90.5069 },
      { slug: 'antigua', label: 'Antigua Guatemala', lat: 14.5586, lng: -90.7295 },
      { slug: 'quetzaltenango', label: 'Quetzaltenango', lat: 14.8508, lng: -91.5186 },
    ],
  },
  {
    slug: 'el-salvador',
    label: 'El Salvador',
    flag: '🇸🇻',
    lat: 13.8,
    lng: -88.9,
    zoom: 8,
    cities: [
      { slug: 'san-salvador', label: 'San Salvador', lat: 13.6929, lng: -89.2182 },
      { slug: 'santa-ana', label: 'Santa Ana', lat: 13.994, lng: -89.5597 },
      { slug: 'la-libertad', label: 'La Libertad', lat: 13.4883, lng: -89.3223 },
    ],
  },
  {
    slug: 'nicaragua',
    label: 'Nicaragua',
    flag: '🇳🇮',
    lat: 12.8,
    lng: -85.6,
    zoom: 7,
    cities: [
      { slug: 'managua', label: 'Managua', lat: 12.1364, lng: -86.2514 },
      { slug: 'granada', label: 'Granada', lat: 11.9344, lng: -85.9560 },
      { slug: 'leon', label: 'León', lat: 12.4340, lng: -86.8780 },
    ],
  },
  {
    slug: 'costa-rica',
    label: 'Costa Rica',
    flag: '🇨🇷',
    lat: 9.7,
    lng: -84.0,
    zoom: 8,
    cities: [
      { slug: 'san-jose', label: 'San José', lat: 9.9281, lng: -84.0907 },
      { slug: 'tamarindo', label: 'Tamarindo', lat: 10.2996, lng: -85.8372 },
      { slug: 'liberia', label: 'Liberia', lat: 10.6346, lng: -85.4406 },
    ],
  },
  {
    slug: 'panama',
    label: 'Panamá',
    flag: '🇵🇦',
    lat: 8.9,
    lng: -79.6,
    zoom: 8,
    cities: [
      { slug: 'ciudad-de-panama', label: 'Ciudad de Panamá', lat: 8.9824, lng: -79.5199 },
      { slug: 'bocas-del-toro', label: 'Bocas del Toro', lat: 9.3400, lng: -82.2400 },
    ],
  },
]

export const countryBySlug = new Map(countries.map((c) => [c.slug, c]))
