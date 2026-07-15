import { useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { Company } from '../types'
import { useMetaStore } from '../store/meta'
import { brandPinIcon } from '../lib/mapIcon'

interface MapViewProps {
  companies: Company[]
  center: [number, number]
  zoom: number
}

export function MapView({ companies, center, zoom }: MapViewProps) {
  const icon = useMemo(() => brandPinIcon(), [])
  const { categories } = useMetaStore()

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-[32rem] w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {companies.map((company) => (
          <Marker key={company.id} position={[company.lat, company.lng]} icon={icon}>
            <Popup>
              <div className="min-w-40">
                <p className="font-display text-sm font-semibold text-text">{company.tradeName}</p>
                <p className="text-xs text-muted">
                  {categories.find((c) => c.slug === company.categorySlug)?.label}
                </p>
                <Link to={`/negocio/${company.id}`} className="mt-2 inline-block text-xs font-semibold text-blue">
                  Ver ficha →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
