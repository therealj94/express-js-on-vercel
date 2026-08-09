// Seed catalog. The five vessels/packages and their prices come from the live
// Rezdy catalog #639381. Extra prices are placeholders — they are meant to be
// edited from the admin, not from this file.

export const settings = {
  brand: 'Love Cloud Tours & Weddings',
  productLine: 'Roatan Private Yacht Getaways',
  currency: 'USD',
  depositPct: 30,
  balanceDueHours: 48,
  contactEmail: 'reservations@lovecloudroatan.com',
  contactPhone: '+504 0000-0000',
  whatsapp: '+504 0000-0000',
  departurePoint: 'French Harbour Marina, Roatán, Bay Islands, Honduras',
  cancellationPolicy:
    'Free cancellation up to 7 days before departure. Within 7 days the deposit is non-refundable. Trips cancelled by us for weather are fully refunded or rescheduled at no cost.',
  instantBooking: true,
}

export const vessels = [
  {
    id: 'v_speedboat_day',
    slug: 'private-speedboat-full-day',
    name: 'Private Luxury Full Day Speedboat Adventure',
    tagline: 'Your own speedboat, your own island stops, all day long.',
    description:
      'Lounge in luxury aboard your very own private speedboat adventure, tailored just for you and your group. We run the island at your pace — snorkel the reef, get pulled on the tube, and swim off the sand at Pigeon Cay.',
    type: 'day',
    durationLabel: '8 hours',
    basePrice: 995,
    priceUnit: 'flat',
    minNights: 0,
    capacityMin: 1,
    capacityMax: 10,
    includes: [
      'Private captain and crew',
      'Snorkeling gear and guided reef stop',
      'Tubing',
      'Swim stop at Pigeon Cay',
      'All-inclusive food and drinks',
      'Fuel and park fees',
    ],
    heroEmoji: '🚤',
    accent: '#1C6A72',
    active: true,
    sortOrder: 1,
  },
  {
    id: 'v_yacht_day',
    slug: 'private-yacht-full-day',
    name: "Private Luxury Full Day Yacht Charter",
    tagline: "47 feet of shade, air conditioning and open water.",
    description:
      "Lounge in luxury and enjoy proper pampering aboard your very own private 47' yacht, tailored just for you and your group. Air-conditioned cabin when the sun gets serious, a captain who knows every reef worth stopping at, and nowhere you have to be.",
    type: 'day',
    durationLabel: '8 hours',
    basePrice: 1600,
    priceUnit: 'flat',
    minNights: 0,
    capacityMin: 1,
    capacityMax: 12,
    includes: [
      "Private 47' yacht with two staterooms",
      'Captain and crew',
      'Air-conditioned interior',
      'Snorkeling and swim stops',
      'All-inclusive food and drinks',
      'Fuel and park fees',
    ],
    heroEmoji: '🛥️',
    accent: '#C2762F',
    active: true,
    sortOrder: 2,
  },
  {
    id: 'v_copper',
    slug: 'copper-package',
    name: 'Copper Package — 4 Nights, 5 Days',
    tagline: 'Live aboard for four nights. Wake up somewhere new.',
    description:
      "Escape to paradise on an all-inclusive private yacht getaway. Four nights aboard a 47' two-stateroom yacht, mixing adventure and doing absolutely nothing, in whatever proportion you like.",
    type: 'multiday',
    durationLabel: '4 nights / 5 days',
    basePrice: 2000,
    priceUnit: 'per_night',
    minNights: 4,
    capacityMin: 2,
    capacityMax: 4,
    includes: [
      "47' two-stateroom yacht, exclusively yours",
      'Captain and crew for the full stay',
      'All meals and drinks aboard',
      'Daily snorkeling and island stops',
      'Fuel, mooring and park fees',
    ],
    heroEmoji: '🌅',
    accent: '#B06A3B',
    active: true,
    sortOrder: 3,
  },
  {
    id: 'v_silver',
    slug: 'silver-package',
    name: 'Silver Package — 5 Nights, 6 Days',
    tagline: 'Two islands, five nights, one yacht that is only yours.',
    description:
      'Luxury and adventure across two islands. Five nights aboard, with the itinerary shaped around what your group actually wants to do — reefs, beaches, or a very slow lunch.',
    type: 'multiday',
    durationLabel: '5 nights / 6 days',
    basePrice: 2000,
    priceUnit: 'per_night',
    minNights: 5,
    capacityMin: 2,
    capacityMax: 4,
    includes: [
      "47' two-stateroom yacht, exclusively yours",
      'Two-island itinerary',
      'Captain and crew for the full stay',
      'All meals and drinks aboard',
      'Fuel, mooring and park fees',
    ],
    heroEmoji: '🏝️',
    accent: '#5B7F86',
    active: true,
    sortOrder: 4,
  },
  {
    id: 'v_gold',
    slug: 'gold-package',
    name: 'Gold Package — 6 Nights, 7 Days',
    tagline: 'The whole Caribbean week. Yacht, hotel, and a speedboat on the house.',
    description:
      'Experience the best of the Caribbean where opulence meets breathtaking natural beauty. Six nights split between the yacht and hotel stays, with a complimentary speedboat day included.',
    type: 'multiday',
    durationLabel: '6 nights / 7 days',
    basePrice: 2000,
    priceUnit: 'per_night',
    minNights: 6,
    capacityMin: 2,
    capacityMax: 4,
    includes: [
      "47' yacht plus hotel nights",
      'Complimentary speedboat day',
      'Captain and crew',
      'All meals and drinks aboard',
      'Fuel, mooring and park fees',
    ],
    heroEmoji: '👑',
    accent: '#C2953F',
    active: true,
    sortOrder: 5,
  },
]

export const categories = [
  { id: 'celebrate', label: 'Celebrate', blurb: 'Make the day mean something.' },
  { id: 'eat_drink', label: 'Eat & Drink', blurb: 'Everything that comes on a tray.' },
  { id: 'adventure', label: 'Adventure', blurb: 'Things to do off the back of the boat.' },
  { id: 'comfort', label: 'Comfort & Care', blurb: 'The details that make a long day easy.' },
]

const extra = (id, category, emoji, name, price, unit, description, leadTimeHours = 48) => ({
  id,
  category,
  emoji,
  name,
  price,
  unit,
  description,
  leadTimeHours,
  active: true,
  maxQty: unit === 'per_person' ? 20 : 5,
})

export const extras = [
  // Celebrate
  extra('x_champagne', 'celebrate', '🍾', 'Champagne toast', 85, 'flat', 'A chilled bottle of Moët and proper glassware, poured wherever you tell the captain to stop.'),
  extra('x_flowers', 'celebrate', '🌺', 'Fresh flower setup', 120, 'flat', 'Tropical arrangements through the cabin and deck, cut the morning of your trip.'),
  extra('x_cake', 'celebrate', '🎂', 'Custom cake', 75, 'flat', 'Your message on it. Tell us the occasion and any allergies.', 72),
  extra('x_proposal', 'celebrate', '💍', 'Proposal setup', 350, 'flat', 'Deck lettering, petals, chilled champagne and a crew that knows exactly when to disappear.', 72),
  extra('x_photographer', 'celebrate', '📸', 'Photographer (2 hours)', 250, 'flat', 'A local photographer aboard, edited gallery delivered within 72 hours.'),
  extra('x_drone', 'celebrate', '🚁', 'Drone footage', 180, 'flat', 'Aerial video of the boat, the reef and your group, edited to a short film.'),
  extra('x_music', 'celebrate', '🎶', 'Live guitar', 200, 'flat', 'A local guitarist aboard for two hours of the trip.'),

  // Eat & Drink
  extra('x_lobster', 'eat_drink', '🦞', 'Lobster lunch', 65, 'per_person', 'Caribbean lobster grilled aboard, with plantain, rice and salad.'),
  extra('x_bbq', 'eat_drink', '🔥', 'Caribbean BBQ', 45, 'per_person', 'Grilled fish, chicken and pork with island sides, served on the water.'),
  extra('x_veg', 'eat_drink', '🥗', 'Vegetarian spread', 38, 'per_person', 'Grilled vegetables, fresh cheeses, hummus, breads and island fruit.'),
  extra('x_fruit', 'eat_drink', '🍍', 'Fruit and cheese table', 90, 'flat', 'A full spread of in-season island fruit, cheeses and crackers.'),
  extra('x_wine_red', 'eat_drink', '🍷', 'Red wine (bottle)', 55, 'flat', 'Malbec or Cabernet. Ask the crew for the current list.', 24),
  extra('x_wine_white', 'eat_drink', '🥂', 'White or rosé (bottle)', 55, 'flat', 'Sauvignon Blanc, Chardonnay or Provence rosé, served properly cold.', 24),
  extra('x_premium_bar', 'eat_drink', '🥃', 'Premium open bar', 40, 'per_person', 'Top-shelf rum, whiskey, gin and mixers for the whole trip.'),
  extra('x_bartender', 'eat_drink', '🍹', 'Cocktail bartender', 220, 'flat', 'A bartender aboard making frozen and classic cocktails to order.'),

  // Adventure
  extra('x_tubing', 'adventure', '🛟', 'Tubing session', 60, 'flat', 'Towable tube and safety gear, as many runs as your group can take.', 24),
  extra('x_snorkel_extra', 'adventure', '🤿', 'Extra snorkel sets', 15, 'per_person', 'Additional masks, snorkels and fins beyond what the boat carries.', 24),
  extra('x_paddleboard', 'adventure', '🏄', 'Paddleboard', 45, 'flat', 'Inflatable SUP aboard for the day.', 24),
  extra('x_kayak', 'adventure', '🛶', 'Double kayak', 45, 'flat', 'Two-person kayak for exploring the mangroves and shallows.', 24),
  extra('x_fishing', 'adventure', '🎣', 'Fishing gear and guide', 150, 'flat', 'Rods, tackle and a crew member who knows where they are biting.'),
  extra('x_scuba', 'adventure', '🐠', 'Discover scuba (per diver)', 130, 'per_person', 'One guided dive on the reef with a certified instructor. No experience needed.', 72),
  extra('x_pigeon', 'adventure', '⛱️', 'Pigeon Cay beach stop', 120, 'flat', 'Add the sandbar and beach club stop to your route, entry included.', 24),

  // Comfort & Care
  extra('x_pickup', 'comfort', '🚐', 'Hotel or cruise pickup', 60, 'flat', 'Air-conditioned round-trip transfer between your hotel or the cruise terminal and the marina.', 24),
  extra('x_massage', 'comfort', '💆', 'Massage aboard', 110, 'per_person', 'A licensed therapist aboard, 50 minutes on the shaded deck.', 72),
  extra('x_kids', 'comfort', '🧒', 'Kids kit', 40, 'flat', 'Child-size life vests, floats, snacks and shade for the little ones.', 24),
  extra('x_towels', 'comfort', '🧺', 'Premium towels and shade', 35, 'flat', 'Oversized towels, extra umbrella and a cushioned bow setup.', 24),
  extra('x_cooler', 'comfort', '🧊', 'Extra cooler of drinks', 50, 'flat', 'A second stocked cooler of water, sodas and local beer.', 24),
  extra('x_wifi', 'comfort', '📶', 'WiFi aboard', 45, 'flat', 'Portable hotspot with island coverage for the trip.', 24),
]

export const bundles = [
  {
    id: 'b_proposal',
    name: 'Proposal at Sea',
    tagline: 'Everything you need for the question, and nothing you have to think about.',
    emoji: '💍',
    extraIds: ['x_proposal', 'x_champagne', 'x_flowers', 'x_photographer', 'x_music'],
    discountPct: 10,
    active: true,
  },
  {
    id: 'b_family',
    name: 'Family Day',
    tagline: 'Built for a boat with kids on it.',
    emoji: '👨‍👩‍👧',
    extraIds: ['x_tubing', 'x_kids', 'x_bbq', 'x_snorkel_extra'],
    discountPct: 10,
    active: true,
  },
  {
    id: 'b_anniversary',
    name: 'Anniversary Sunset',
    tagline: 'Wine, dinner and the good light.',
    emoji: '🌇',
    extraIds: ['x_wine_red', 'x_lobster', 'x_flowers', 'x_massage'],
    discountPct: 10,
    active: true,
  },
]

export const coupons = [
  {
    id: 'c_welcome',
    code: 'WELCOME10',
    type: 'percent',
    value: 10,
    minTotal: 1000,
    maxRedemptions: 100,
    redemptions: 0,
    expiresAt: null,
    active: true,
  },
]

export const blackouts = []
export const bookings = []
export const invoices = []
