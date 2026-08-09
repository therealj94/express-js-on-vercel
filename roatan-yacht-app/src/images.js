// Photographs ship inside the APK so the fleet looks right on first launch,
// before the phone has talked to any server. Anything the admin adds later is
// not bundled, so it falls back to fetching from the API host.
//
// These are the `-app` crops: 3:4 portrait, cut around a focal point picked by
// hand in roatan-yacht/scripts/make-photos.py. The website's landscape crops
// are the wrong shape for a phone — in a tall card they get scaled up and
// sliced, which is why boats used to lose their bows.
const BUNDLED = {
  '/media/knotty-stern': require('../assets/boats/knotty-stern-app.jpg'),
  '/media/knotty-cockpit-wide': require('../assets/boats/knotty-cockpit-wide-app.jpg'),
  '/media/knotty-cockpit-table': require('../assets/boats/knotty-cockpit-table-app.jpg'),
  '/media/knotty-helm': require('../assets/boats/knotty-helm-app.jpg'),
  '/media/knotty-dinner-night': require('../assets/boats/knotty-dinner-night-app.jpg'),
  '/media/knotty-cabin-night': require('../assets/boats/knotty-cabin-night-app.jpg'),
  '/media/lilknotty-running': require('../assets/boats/lilknotty-running-app.jpg'),
  '/media/lilknotty-running-wide': require('../assets/boats/lilknotty-running-wide-app.jpg'),
  '/media/lilknotty-marina': require('../assets/boats/lilknotty-marina-app.jpg'),
  '/media/lilknotty-dusk': require('../assets/boats/lilknotty-dusk-app.jpg'),
}

/** The drone shot the whole app opens on — intro, sign-in, and the trip card. */
export const INTRO_VIDEO = require('../assets/intro/roatan.mp4')
export const INTRO_STILL = require('../assets/intro/water.jpg')

export function photo(path, apiUrl) {
  if (!path) return null
  return BUNDLED[path] || { uri: `${apiUrl}${path}-app.jpg` }
}
