// The personality lives here, in one file, so changing the app's sense of
// humour never means hunting through screens. Everything is written to sound
// like a crew that loves its job — warm, a little cheeky, never corporate.

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length]

// Shown while the fleet loads. Nobody should watch a plain spinner.
export const LOADING_LINES = [
  'Polishing the teak…',
  'Chilling the champagne…',
  'Negotiating with the dolphins…',
  'Untangling the anchor line…',
  'Checking the sunset schedule…',
  'Counting the life jackets. Twice.',
  'Waking up the captain…',
  'Icing the coconuts…',
]

// One-liners when something is loaded aboard, keyed by category. The seed is
// how many items are aboard, so the line changes as the manifest grows without
// needing randomness.
const QUIPS = {
  eat_drink: [
    'The galley approves. 🍽️',
    'Excellent taste. The crew noticed.',
    'That pairs beautifully with salt air.',
    'The captain requests you save him a bite.',
  ],
  celebrate: [
    'Someone is getting spoiled. 🥂',
    'The crew loves a celebration.',
    'This is going to be a good story.',
    'Consider the mood officially set.',
  ],
  adventure: [
    'Now we’re talking. 🌊',
    'The reef has been notified.',
    'Bold choice. The sea respects that.',
    'The tube has claimed braver souls.',
  ],
  comfort: [
    'Ah, a person of comfort. Welcome.',
    'The little things make the day.',
    'Future you says thank you.',
    'Smooth sailing, literally.',
  ],
}

export const quipFor = (category, seed) => pick(QUIPS[category] || QUIPS.comfort, seed)

// Milestones as the manifest grows. Fired once each, at these counts.
export const MILESTONES = {
  3: 'Three aboard — this trip has a personality now.',
  5: 'Five extras. The crew is starting a betting pool on your occasion.',
  8: 'Eight?! Okay captain, it’s YOUR boat now. 🫡',
}

// The moment after booking. This is the emotional peak of the whole app —
// the screen should feel like stepping onto the dock.
export const CELEBRATIONS = [
  'The boat is yours. The sea has been told to behave.',
  'Done! Somewhere in Roatán, a captain just smiled.',
  'Booked. The hardest part of your trip is now the waiting.',
  'That’s it — the horizon is officially reserved.',
]

export const celebrationFor = (ref) => {
  const seed = String(ref || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return pick(CELEBRATIONS, seed)
}

// Tip choices. Money words are hard; these keep it light without hiding the
// number, and "no tip" is a first-class, guilt-free option.
export const TIP_OPTIONS = [
  { pct: 0, label: 'Not today', note: 'All good — smiles are free' },
  { pct: 10, label: '10%', note: 'A cold one for the crew' },
  { pct: 15, label: '15%', note: 'The crew’s favourite number' },
  { pct: 20, label: '20%', note: 'Legend status at the marina' },
]

// Empty-manifest hint, by occasion, so even the blank state sells the trip.
export const EMPTY_HINTS = {
  proposal: 'The ring is your job. The moment is ours.',
  anniversary: 'Add something they’d never order for themselves.',
  birthday: 'Cake at sea beats cake anywhere else.',
  family: 'The tube. Trust us. The tube.',
  nothing: 'The boat alone is a very fine day too.',
  default: 'Tap anything below to load it aboard.',
}
