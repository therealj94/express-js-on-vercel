// Photographs ship inside the APK so the fleet looks right on first launch,
// before the phone has talked to any server. Anything the admin adds later is
// not bundled, so it falls back to fetching from the API host.
const BUNDLED = {
  '/media/knotty-stern': require('../assets/boats/knotty-stern-card.jpg'),
  '/media/knotty-cockpit-wide': require('../assets/boats/knotty-cockpit-wide-card.jpg'),
  '/media/knotty-cockpit-table': require('../assets/boats/knotty-cockpit-table-card.jpg'),
  '/media/knotty-helm': require('../assets/boats/knotty-helm-card.jpg'),
  '/media/knotty-dinner-night': require('../assets/boats/knotty-dinner-night-card.jpg'),
  '/media/knotty-cabin-night': require('../assets/boats/knotty-cabin-night-card.jpg'),
  '/media/lilknotty-running': require('../assets/boats/lilknotty-running-card.jpg'),
  '/media/lilknotty-running-wide': require('../assets/boats/lilknotty-running-wide-card.jpg'),
  '/media/lilknotty-marina': require('../assets/boats/lilknotty-marina-card.jpg'),
  '/media/lilknotty-dusk': require('../assets/boats/lilknotty-dusk-card.jpg'),
}

export function photo(path, apiUrl) {
  if (!path) return null
  return BUNDLED[path] || { uri: `${apiUrl}${path}-card.jpg` }
}
