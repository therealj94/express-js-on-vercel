import L from 'leaflet'

function pinSvg(active: boolean): string {
  const gradientId = active ? 'pin-grad-active' : 'pin-grad'
  return `
    <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#8b5cf6"/>
          <stop offset="55%" stop-color="#4c8dff"/>
          <stop offset="100%" stop-color="#22d3ee"/>
        </linearGradient>
      </defs>
      <path d="M17 0C7.6 0 0 7.6 0 17c0 12.2 17 27 17 27s17-14.8 17-27C34 7.6 26.4 0 17 0z" fill="url(#${gradientId})"/>
      <circle cx="17" cy="17" r="7" fill="#07080f"/>
    </svg>
  `
}

export function brandPinIcon(active = false): L.DivIcon {
  return L.divIcon({
    html: pinSvg(active),
    className: 'mtp-pin',
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    popupAnchor: [0, -40],
  })
}
