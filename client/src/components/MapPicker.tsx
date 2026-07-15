import { useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { LocateFixed } from 'lucide-react'
import type { Map as LeafletMap } from 'leaflet'
import { brandPinIcon } from '../lib/mapIcon'

interface MapPickerProps {
  lat: number
  lng: number
  zoom?: number
  onChange: (lat: number, lng: number) => void
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export function MapPicker({ lat, lng, zoom = 13, onChange }: MapPickerProps) {
  const [map, setMap] = useState<LeafletMap | null>(null)
  const icon = useMemo(() => brandPinIcon(true), [])

  function useMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords
      onChange(latitude, longitude)
      map?.flyTo([latitude, longitude], 16, { duration: 1.1 })
    })
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        scrollWheelZoom
        className="h-72 w-full sm:h-80"
        ref={setMap}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          position={[lat, lng]}
          icon={icon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target
              const pos = marker.getLatLng()
              onChange(pos.lat, pos.lng)
            },
          }}
        />
        <ClickHandler onChange={onChange} />
      </MapContainer>

      <button
        type="button"
        onClick={useMyLocation}
        className="glass absolute right-3 top-3 z-[400] flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-text shadow-lg"
      >
        <LocateFixed size={14} />
        Usar mi ubicación
      </button>

      <div className="glass absolute bottom-3 left-3 z-[400] rounded-lg px-3 py-1.5 text-[11px] text-muted">
        Toca el mapa o arrastra el pin para ajustar la ubicación exacta
      </div>
    </div>
  )
}
