// Guest-facing booking app.
//
// The cart lives in the URL hash, so a half-loaded boat survives a refresh and
// can be sent to whoever else is coming along.

const $ = (id) => document.getElementById(id)
const money = (n, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

let catalog = null
let unavailable = new Set()
let currentQuote = null
let quoteTimer = null
let calMonth = null // Date pinned to the 1st of the shown month
const expandedShelves = new Set()

const cart = {
  vesselId: null,
  date: '',
  nights: 0,
  guests: 2,
  items: [], // { extraId, qty }
  bundleIds: [],
  couponCode: '',
  occasion: '',
}

/* Where a thing happens on the boat. This is the whole idea: an extra is not a
   line in a cart, it is cargo that belongs somewhere. */
const ZONES = [
  { id: 'platform', category: 'adventure', label: 'Swim platform', x: 8, w: 62 },
  { id: 'cockpit', category: 'comfort', label: 'Cockpit', x: 70, w: 90 },
  { id: 'saloon', category: 'eat_drink', label: 'Galley', x: 160, w: 90 },
  { id: 'cabin', category: 'celebrate', label: 'Cabin', x: 250, w: 102 },
]
const zoneFor = (category) => ZONES.find((z) => z.category === category) || ZONES[1]

const OCCASIONS = [
  { id: 'proposal', label: 'A proposal', bundle: 'b_proposal' },
  { id: 'anniversary', label: 'An anniversary', bundle: 'b_anniversary' },
  { id: 'birthday', label: 'A birthday', extras: ['x_cake', 'x_champagne'] },
  { id: 'family', label: 'A day with the kids', bundle: 'b_family' },
  { id: 'nothing', label: 'Just the water', extras: [] },
]

const FAQ = [
  ['Where do we meet?', 'French Harbour Marina, on the south side of Roatán. Add a transfer on the deck plan and we collect you from your hotel or the cruise terminal instead.'],
  ['What if the weather turns?', 'If we call it off, you choose: a full refund or a new date. We do not argue about weather — the crew makes that call and it is always the safe one.'],
  ['Can we change the route?', 'That is the point of a private charter. Tell the captain what you want and the day bends around it. The reef, the sandbar, a very long lunch — your call.'],
  ['When do we pay the rest?', 'The deposit holds your date. The balance is charged 48 hours before departure, or you can pay the whole thing up front.'],
]

/* ------------------------------------------------------------ url state */

function saveState() {
  const compact = {
    v: cart.vesselId, d: cart.date, n: cart.nights, g: cart.guests,
    i: cart.items.map((x) => (x.qty > 1 ? `${x.extraId}*${x.qty}` : x.extraId)),
    b: cart.bundleIds, c: cart.couponCode || undefined, o: cart.occasion || undefined,
  }
  history.replaceState(null, '', `#${btoa(JSON.stringify(compact))}`)
}

function loadState() {
  if (location.hash.length < 2) return
  try {
    const raw = JSON.parse(atob(location.hash.slice(1)))
    cart.vesselId = raw.v || null
    cart.date = raw.d || ''
    cart.nights = raw.n || 0
    cart.guests = raw.g || 2
    cart.items = (raw.i || []).map((s) => {
      const [extraId, qty] = String(s).split('*')
      return { extraId, qty: Number(qty) || 1 }
    })
    cart.bundleIds = raw.b || []
    cart.couponCode = raw.c || ''
    cart.occasion = raw.o || ''
  } catch {
    /* a mangled hash just means we start fresh */
  }
}

/* ------------------------------------------------------------------ api */

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected response.' }))
  if (!data.ok) throw Object.assign(new Error(data.error || 'Request failed'), { field: data.field })
  return data
}

/* ------------------------------------------------------------- drawings */

// Two profiles, drawn as line art rather than photographed or emoji'd. Until
// real photography exists this at least says "boat" honestly.
const PROFILES = {
  speedboat: `
    <path class="hull" d="M8 44 L244 37 C251 36 253 40 249 47 C238 62 212 69 184 69 L40 69 C20 69 8 57 8 44 Z"/>
    <path class="hull" d="M92 41 L106 24 L150 24 L160 40"/>
    <path class="hull" d="M118 24 L118 12 L146 16"/>`,
  yacht: `
    <path class="hull" d="M6 50 L248 41 C255 40 257 45 252 53 C240 70 212 79 180 79 L42 79 C22 79 6 65 6 50 Z"/>
    <path class="hull" d="M64 43 L74 22 L178 22 L192 42"/>
    <path class="hull" d="M100 22 L106 9 L158 9 L166 22"/>
    <path class="hull" d="M130 9 L130 1"/>`,
}

function profileSvg(vessel) {
  const art = vessel.type === 'day' && vessel.basePrice < 1200 ? PROFILES.speedboat : PROFILES.yacht
  return `<svg class="boat" viewBox="0 0 260 84" fill="none" aria-hidden="true"
     stroke="var(--on-deep)" stroke-width="1.4" stroke-linejoin="round">${art}</svg>`
}

// Depth soundings scattered behind the boat, the way a chart marks water.
function soundings(seed) {
  const marks = []
  for (let i = 0; i < 14; i++) {
    const x = ((seed * 37 + i * 53) % 92) + 3
    const y = ((seed * 17 + i * 29) % 78) + 8
    const depth = 4 + ((seed + i * 7) % 46)
    marks.push(`<text x="${x}%" y="${y}%" fill="currentColor">${depth}</text>`)
  }
  return `<svg class="soundings" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
    style="position:absolute;inset:0;width:100%;height:100%">${marks.join('')}</svg>`
}

/* -------------------------------------------------------------- vessels */

function renderVessels() {
  $('vessels').replaceChildren(
    ...catalog.vessels.map((v, i) => {
      const el = document.createElement('button')
      el.className = 'vessel'
      el.type = 'button'
      el.setAttribute('aria-pressed', String(cart.vesselId === v.id))
      const art = v.photo
        ? `<img src="${v.photo}-card.jpg" alt="${esc(v.boatName || v.name)}" loading="lazy" width="620" height="420">
           ${v.boatName ? `<span class="stamp">${esc(v.boatName)}</span>` : ''}`
        : `${soundings(i + 1)}${profileSvg(v)}`
      el.innerHTML = `
        <span class="profile">${art}</span>
        <span class="meta">
          <span class="label">${esc(v.durationLabel)} · ${v.capacityMin}–${v.capacityMax} guests</span>
          <span class="name chart-name">${esc(v.name)}</span>
          <span class="small">${esc(v.tagline)}</span>
          <span class="foot">
            <span class="rate">${money(v.basePrice)}${v.priceUnit === 'per_night' ? '<span class="label"> / night</span>' : ''}</span>
            <span class="chip ${cart.vesselId === v.id ? 'ok' : 'shoal'}">${cart.vesselId === v.id ? 'Chosen' : 'Choose'}</span>
          </span>
        </span>`
      el.addEventListener('click', () => selectVessel(v.id))
      return el
    }),
  )
}

const currentVessel = () => catalog.vessels.find((v) => v.id === cart.vesselId) || null

async function selectVessel(id) {
  cart.vesselId = id
  const v = currentVessel()
  cart.nights = v.priceUnit === 'per_night' ? Math.max(v.minNights, cart.nights || v.minNights) : 0
  cart.guests = Math.min(Math.max(cart.guests, v.capacityMin), v.capacityMax)
  if (cart.date && !canStart(cart.date)) cart.date = ''

  renderVessels()
  renderTrip()
  await loadAvailability()
  renderCalendar()
  applyGates()
  requestQuote()
  $('builder').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function renderTrip() {
  const v = currentVessel()
  renderIncludes(v)
  $('tripTitle').textContent = v ? v.name : 'Pick a vessel to begin'
  $('tripTag').textContent = v ? v.durationLabel : '—'

  const multi = v && v.priceUnit === 'per_night'
  document.querySelectorAll('.nights-only').forEach((el) => el.classList.toggle('hidden', !multi))
  $('nights').value = cart.nights || (v ? v.minNights : 1)
  if (v) {
    $('nights').min = v.minNights
    $('guests').min = v.capacityMin
    $('guests').max = v.capacityMax
  }
  $('guests').value = cart.guests

  // Say the trip back in plain words, including the dates a package covers.
  const s = $('tripSummary')
  if (!v) { s.textContent = 'Choose a boat and a date and the trip appears here.'; return }
  if (!cart.date) { s.textContent = `${v.name}. Now pick a date on the calendar.`; return }
  const span = spanDates(cart.date, cart.nights)
  const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  s.innerHTML = cart.nights
    ? `<strong>${esc(v.name)}</strong><span class="small">${fmt(span[0])} → ${fmt(span[span.length - 1])} · ${cart.nights} nights aboard · ${cart.guests} guests</span>`
    : `<strong>${esc(v.name)}</strong><span class="small">${fmt(cart.date)} · ${v.durationLabel} · ${cart.guests} guests</span>`
}

/** What the boat already comes with, shown where the choice is being made. */
function renderIncludes(vessel) {
  const host = $('vesselIncludes')
  if (!vessel) { host.replaceChildren(); return }
  host.innerHTML = `
    <p class="label">Already aboard, at no extra cost</p>
    <ul class="small" style="margin:0; padding-left:1.1em; line-height:1.75">
      ${vessel.includes.map((i) => `<li>${esc(i)}</li>`).join('')}
    </ul>`
}

/* ------------------------------------------------------------- calendar */

function spanDates(start, nights) {
  const out = []
  const d0 = new Date(`${start}T12:00:00Z`)
  for (let i = 0; i < Math.max(1, nights || 1); i++) {
    const d = new Date(d0)
    d.setUTCDate(d.getUTCDate() + i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** A multi-night package needs its whole span clear, not just its first day. */
function canStart(dateStr) {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr < today) return false
  return spanDates(dateStr, cart.nights).every((d) => !unavailable.has(d))
}

function renderCalendar() {
  const v = currentVessel()
  if (!calMonth) calMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))

  $('calMonth').textContent = calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  $('calDow').replaceChildren(
    ...['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => {
      const el = document.createElement('div')
      el.className = 'cal-dow'
      el.textContent = d
      el.setAttribute('aria-hidden', 'true')
      el.dataset.i = i
      return el
    }),
  )

  const first = new Date(calMonth)
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const chosenSpan = new Set(cart.date ? spanDates(cart.date, cart.nights) : [])

  const cells = []
  for (let i = 0; i < first.getUTCDay(); i++) {
    const el = document.createElement('div')
    el.className = 'cal-day empty'
    cells.push(el)
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day)).toISOString().slice(0, 10)
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'cal-day'
    el.textContent = day
    el.setAttribute('aria-label', iso)

    const taken = unavailable.has(iso)
    const bookable = Boolean(v) && canStart(iso)
    if (taken) el.classList.add('taken')
    if (iso === cart.date) el.classList.add('chosen')
    else if (chosenSpan.has(iso)) el.classList.add('spanned')
    el.disabled = !bookable
    if (bookable) el.addEventListener('click', () => pickDate(iso))
    cells.push(el)
  }
  $('calDays').replaceChildren(...cells)

  const note = $('calNote')
  if (!v) note.textContent = 'Pick a vessel and the calendar fills in.'
  else if (cart.nights) note.textContent = `Hatched days are taken. A ${cart.nights}-night package needs ${cart.nights} clear days in a row.`
  else note.textContent = `Hatched days are taken. ${unavailable.size} booked in the year ahead.`
}

async function pickDate(iso) {
  cart.date = iso
  renderTrip()
  renderCalendar()
  applyGates()
  requestQuote()
}

/* ---------------------------------------------------------- the deck plan */

// Top-down hull, bow to the right. Drawn once and reused as both the outline
// and the clip for the zone floors, so the two can never drift apart.
const HULL = 'M18 12 L236 12 C288 18 326 36 348 62 C326 88 288 106 236 112 L18 112 C11 112 6 106 6 99 L6 25 C6 18 11 12 18 12 Z'

function loadedIn(zoneId) {
  const zone = ZONES.find((z) => z.id === zoneId)
  const out = []
  for (const item of cart.items) {
    const e = catalog.extras.find((x) => x.id === item.extraId)
    if (e && zoneFor(e.category).id === zone.id) out.push({ extra: e, qty: item.qty })
  }
  for (const bundleId of cart.bundleIds) {
    const b = catalog.bundles.find((x) => x.id === bundleId)
    if (!b) continue
    for (const id of b.extraIds) {
      const e = catalog.extras.find((x) => x.id === id)
      if (e && zoneFor(e.category).id === zone.id) out.push({ extra: e, qty: 1, viaBundle: b })
    }
  }
  return out
}

function renderDeckPlan() {
  const counts = Object.fromEntries(ZONES.map((z) => [z.id, loadedIn(z.id).length]))

  const bands = ZONES.map((z) => `
      <g>
        <rect class="zone-floor" data-zone="${z.id}" x="${z.x}" y="0" width="${z.w}" height="124" clip-path="url(#hull)"/>
        <line class="zone-line" x1="${z.x + z.w}" y1="6" x2="${z.x + z.w}" y2="118" clip-path="url(#hull)"/>
        ${counts[z.id] ? `
          <circle cx="${z.x + z.w / 2}" cy="62" r="13" fill="var(--signal)"/>
          <text class="zone-count" x="${z.x + z.w / 2}" y="67" text-anchor="middle">${counts[z.id]}</text>` : ''}
        <rect class="zone-hit" data-zone="${z.id}" x="${z.x}" y="0" width="${z.w}" height="124"
              fill="transparent" clip-path="url(#hull)">
          <title>${z.label} — drop ${z.category.replace('_', ' and ')} here</title>
        </rect>
      </g>`).join('')

  $('deckplan').innerHTML = `
    <svg viewBox="0 0 360 124" role="img" aria-label="Top-down deck plan. Drop extras onto a zone of the boat.">
      <defs><clipPath id="hull"><path d="${HULL}"/></clipPath></defs>
      ${bands}
      <line class="zone-line" x1="6" y1="62" x2="348" y2="62" stroke-dasharray="3 6"/>
      <path class="hull-line" d="${HULL}"/>
    </svg>
    ${zoneShot()}
    <div class="zone-strip">
      ${ZONES.map((z) => `
        <div class="zone-tab${counts[z.id] ? ' loaded' : ''}">
          <span>${z.label}</span>
          <b>${counts[z.id] ? `${counts[z.id]} aboard` : '—'}</b>
        </div>`).join('')}
    </div>`

  // Every zone accepts a drop; tapping an item does the same thing. Dragging is
  // a nicety here, never the only way in.
  $('deckplan').querySelectorAll('.zone-hit').forEach((hit) => {
    const floor = $('deckplan').querySelector(`rect.zone-floor[data-zone="${hit.dataset.zone}"]`)
    hit.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; floor.classList.add('hot') })
    hit.addEventListener('dragleave', () => floor.classList.remove('hot'))
    hit.addEventListener('drop', (e) => {
      e.preventDefault()
      floor.classList.remove('hot')
      const id = e.dataTransfer.getData('text/plain')
      if (id) addExtra(id)
    })
  })

  renderDeckLegend()
}

/**
 * A picture of the part of the boat that is currently carrying the most, so the
 * plan reads as a real vessel rather than a diagram. Falls back to the cockpit,
 * where a charter day mostly happens.
 */
function zoneShot() {
  const busiest = [...ZONES]
    .map((z) => ({ zone: z, n: loadedIn(z.id).length }))
    .sort((a, b) => b.n - a.n)[0]
  const zone = busiest.n ? busiest.zone : ZONES.find((z) => z.id === 'cockpit')
  const cat = catalog.categories.find((c) => c.id === zone.category)
  if (!cat?.photo) return ''
  return `
    <figure class="zone-shot" style="margin:0">
      <img src="${cat.photo}-card.jpg" alt="${esc(zone.label)} aboard" loading="lazy" width="620" height="200">
      <figcaption>${esc(zone.label)}${busiest.n ? ` — ${busiest.n} aboard` : ''}</figcaption>
    </figure>`
}

function renderDeckLegend() {
  const host = $('deckLegend')
  const pins = []
  for (const zone of ZONES) {
    for (const { extra, qty, viaBundle } of loadedIn(zone.id)) {
      const pin = document.createElement('span')
      pin.className = 'pin fresh'
      pin.innerHTML = `<span>${extra.emoji}</span><span>${esc(extra.name)}${qty > 1 ? ` ×${qty}` : ''}</span>`
      if (viaBundle) {
        pin.title = `Part of ${viaBundle.name}`
        pin.style.borderColor = 'var(--signal)'
      } else {
        const x = document.createElement('button')
        x.type = 'button'
        x.textContent = '×'
        x.setAttribute('aria-label', `Take ${extra.name} off the boat`)
        x.addEventListener('click', () => removeExtra(extra.id))
        pin.appendChild(x)
      }
      pins.push(pin)
    }
  }
  host.replaceChildren(...pins)
  const n = pins.length
  $('deckState').textContent = n ? `${n} aboard` : 'Nothing aboard'
}

/* ---------------------------------------------------------------- extras */

const SHELF_PREVIEW = 4

function extraCard(e) {
  const item = cart.items.find((i) => i.extraId === e.id)
  const el = document.createElement('button')
  el.className = `extra${item ? ' aboard' : ''}`
  el.type = 'button'
  el.draggable = true
  el.dataset.extraId = e.id
  el.setAttribute('aria-pressed', String(Boolean(item)))
  el.innerHTML = `
    <span class="top"><span class="glyph">${e.emoji}</span><span class="name">${esc(e.name)}</span></span>
    <span class="desc">${esc(e.description)}</span>
    <span class="rate">${money(e.price)}${e.unit === 'per_person' ? '<span class="label"> per guest</span>' : ''}</span>`

  el.addEventListener('click', () => (item ? removeExtra(e.id) : addExtra(e.id)))
  el.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('text/plain', e.id)
    ev.dataTransfer.effectAllowed = 'copy'
    el.classList.add('dragging')
  })
  el.addEventListener('dragend', () => el.classList.remove('dragging'))
  return el
}

function renderShelves() {
  const host = $('shelves')
  host.replaceChildren(
    ...catalog.categories.map((cat) => {
      const all = catalog.extras.filter((e) => e.category === cat.id)
      const open = expandedShelves.has(cat.id)
      const shown = open ? all : all.slice(0, SHELF_PREVIEW)

      const shelf = document.createElement('div')
      shelf.className = 'shelf'
      shelf.innerHTML = `
        <div class="shelf-head">
          <span class="label signal">${esc(cat.label)} — stows on the ${zoneFor(cat.id).label.toLowerCase()}</span>
          <span class="small faint">${esc(cat.blurb)}</span>
        </div>`

      const items = document.createElement('div')
      items.className = 'shelf-items'
      items.replaceChildren(...shown.map(extraCard))
      shelf.appendChild(items)

      if (all.length > SHELF_PREVIEW) {
        const more = document.createElement('button')
        more.className = 'more-btn'
        more.type = 'button'
        more.textContent = open ? '− Show fewer' : `+ ${all.length - SHELF_PREVIEW} more in ${cat.label.toLowerCase()}`
        more.addEventListener('click', () => {
          if (open) expandedShelves.delete(cat.id)
          else expandedShelves.add(cat.id)
          renderShelves()
        })
        shelf.appendChild(more)
      }
      return shelf
    }),
  )
  $('extraCount').textContent = `${catalog.extras.length} to choose from`
}

function renderBundles() {
  $('bundles').replaceChildren(
    ...catalog.bundles.map((b) => {
      const on = cart.bundleIds.includes(b.id)
      const el = document.createElement('button')
      el.className = 'package'
      el.type = 'button'
      el.setAttribute('aria-pressed', String(on))
      const names = b.extraIds.map((id) => catalog.extras.find((e) => e.id === id)?.name).filter(Boolean)
      el.innerHTML = `
        ${b.photo ? `<img src="${b.photo}-card.jpg" alt="" loading="lazy" width="620" height="300">` : ''}
        <span class="package-body">
          <span class="name">${b.emoji} ${esc(b.name)}</span>
          <span class="small">${esc(b.tagline)}</span>
          <span class="small faint">${names.map(esc).join(' · ')}</span>
          <span class="chip ${on ? 'ok' : 'signal'}" style="align-self:flex-start">${on ? 'Aboard' : `Save ${b.discountPct}%`}</span>
        </span>`
      el.addEventListener('click', () => toggleBundle(b.id))
      return el
    }),
  )
}

function renderOccasions() {
  $('occasions').replaceChildren(
    ...OCCASIONS.map((o) => {
      const el = document.createElement('button')
      el.className = 'occasion'
      el.type = 'button'
      el.setAttribute('aria-pressed', String(cart.occasion === o.id))
      el.textContent = o.label
      el.addEventListener('click', () => chooseOccasion(o))
      return el
    }),
  )
}

/** The occasion is the strongest signal a guest gives us. Use it immediately. */
function chooseOccasion(o) {
  cart.occasion = o.id
  if (o.bundle && !cart.bundleIds.includes(o.bundle)) cart.bundleIds.push(o.bundle)
  for (const id of o.extras || []) if (!cart.items.some((i) => i.extraId === id)) cart.items.push({ extraId: id, qty: 1 })

  renderOccasions()
  renderBundles()
  renderShelves()
  renderDeckPlan()
  requestQuote()
  $(cart.vesselId ? 'builder' : 'fleet').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function renderGallery() {
  const host = $('gallery')
  if (!host || !catalog.gallery?.length) return
  host.replaceChildren(
    ...catalog.gallery.map((g, i) => {
      const fig = document.createElement('figure')
      fig.className = i === 0 ? 'wide' : ''
      fig.innerHTML = `
        <img src="${g.src}-card.jpg" alt="${esc(g.caption)}" loading="lazy" width="1400" height="900">
        <figcaption>${esc(g.caption)}</figcaption>`
      return fig
    }),
  )
}

function renderFaq() {
  $('faq').replaceChildren(
    ...FAQ.map(([q, a]) => {
      const el = document.createElement('div')
      el.className = 'plate'
      el.innerHTML = `<div class="plate-body"><h3>${esc(q)}</h3><p class="small">${esc(a)}</p></div>`
      return el
    }),
  )
}

/* ------------------------------------------------------------- mutations */

function addExtra(extraId) {
  if (!cart.items.some((x) => x.extraId === extraId)) cart.items.push({ extraId, qty: 1 })
  afterCartChange()
}

function removeExtra(extraId) {
  const i = cart.items.findIndex((x) => x.extraId === extraId)
  if (i !== -1) cart.items.splice(i, 1)
  afterCartChange()
}

function setQty(extraId, qty) {
  const item = cart.items.find((x) => x.extraId === extraId)
  if (!item) return
  const e = catalog.extras.find((x) => x.id === extraId)
  item.qty = Math.min(Math.max(1, qty), e?.maxQty || 5)
  afterCartChange()
}

function toggleBundle(bundleId) {
  const i = cart.bundleIds.indexOf(bundleId)
  if (i === -1) cart.bundleIds.push(bundleId)
  else cart.bundleIds.splice(i, 1)
  afterCartChange()
}

function afterCartChange() {
  renderShelves()
  renderBundles()
  renderDeckPlan()
  requestQuote()
}

/* --------------------------------------------------------------- gating */

function applyGates() {
  const ready = Boolean(cart.vesselId && cart.date && cart.guests)
  for (const [plateId, gateId] of [['deckPlate', 'deckGate'], ['extrasPlate', 'extrasGate']]) {
    $(plateId).dataset.locked = ready ? '0' : '1'
    $(gateId).classList.toggle('hidden', ready)
  }
  const reason = !cart.vesselId ? 'Pick a vessel first — the boat decides what fits.' : 'Pick a date on the calendar.'
  $('deckGate').querySelector('span').textContent = reason
  $('extrasGate').querySelector('span').textContent = reason
}

/* -------------------------------------------------------------- manifest */

function renderManifest() {
  const host = $('manifest')
  const totals = $('totals')
  host.replaceChildren()

  if (!currentQuote) {
    $('manifestHint').classList.remove('hidden')
    $('manifestHint').textContent = cart.vesselId
      ? 'Pick a date and guest count to see the total.'
      : 'Choose a vessel to begin.'
    totals.replaceChildren()
    $('manifestCount').textContent = 'Empty'
    $('depositNote').textContent = ''
    updateBar()
    return
  }

  const q = currentQuote
  $('manifestHint').classList.toggle('hidden', q.lines.length > 1)
  if (q.lines.length <= 1) $('manifestHint').textContent = 'Nothing loaded yet — the boat alone is a fine day too.'

  for (const line of q.lines) {
    const row = document.createElement('div')
    row.className = 'mline fresh'
    const removable = line.kind !== 'vessel'
    const extra = line.kind === 'extra' ? catalog.extras.find((e) => e.id === line.id) : null
    const steppable = extra && extra.unit !== 'per_person' && (extra.maxQty || 5) > 1

    row.innerHTML = `
      <span class="lbl">
        <span>${esc(line.label)}</span>
        ${line.detail ? `<span class="det">${esc(line.detail)}</span>` : ''}
      </span>
      <span class="row" style="align-items:flex-start; gap:6px">
        ${steppable ? '<span class="qty" data-qty></span>' : ''}
        <span class="amt">${money(line.amount, q.currency)}</span>
        ${removable ? '<button class="drop" type="button" aria-label="Remove">×</button>' : ''}
      </span>`

    if (steppable) {
      const item = cart.items.find((i) => i.extraId === extra.id)
      const qtyHost = row.querySelector('[data-qty]')
      const minus = document.createElement('button')
      minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', `One less ${extra.name}`)
      minus.disabled = (item?.qty || 1) <= 1
      minus.addEventListener('click', () => setQty(extra.id, (item?.qty || 1) - 1))
      const count = document.createElement('span')
      count.textContent = item?.qty || 1
      const plus = document.createElement('button')
      plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', `One more ${extra.name}`)
      plus.disabled = (item?.qty || 1) >= (extra.maxQty || 5)
      plus.addEventListener('click', () => setQty(extra.id, (item?.qty || 1) + 1))
      qtyHost.append(minus, count, plus)
    }

    if (removable) {
      row.querySelector('.drop').addEventListener('click', () => {
        if (line.kind === 'bundle') toggleBundle(line.id)
        else removeExtra(line.id)
      })
    }
    host.appendChild(row)
  }

  totals.innerHTML = `
    <div class="mline"><span>Subtotal</span><span class="amt">${money(q.subtotal, q.currency)}</span></div>
    ${q.discount ? `<div class="mline savings"><span>Promo ${esc(q.couponCode)}</span><span class="amt">−${money(q.discount, q.currency)}</span></div>` : ''}
    <div class="mline grand"><span>Total</span><span class="amt">${money(q.total, q.currency)}</span></div>
    ${q.savings ? `<div class="savings">Saving ${money(q.savings, q.currency)} against buying it piece by piece</div>` : ''}`

  const n = q.lines.length - 1
  $('manifestCount').textContent = n ? `${n} item${n === 1 ? '' : 's'}` : 'Boat only'
  $('depositNote').textContent = `${money(q.deposit, q.currency)} now holds the date (${q.depositPct}%), or pay it all at checkout.`
  updateBar()
}

function updateBar() {
  const bar = $('cartBar')
  if (!currentQuote) {
    bar.classList.remove('on')
    document.body.classList.remove('has-bar')
    return
  }
  bar.classList.add('on')
  document.body.classList.add('has-bar')
  $('barTotal').textContent = money(currentQuote.total, currentQuote.currency)
  const n = currentQuote.lines.length - 1
  $('barDetail').textContent = n ? `${n} aboard` : 'Boat only'
}

/* ----------------------------------------------------------- quoting */

async function loadAvailability() {
  if (!cart.vesselId) return
  try {
    const { unavailable: days } = await api(`/api/availability?vesselId=${cart.vesselId}`)
    unavailable = new Set(days)
  } catch {
    unavailable = new Set()
  }
}

function requestQuote() {
  saveState()
  clearTimeout(quoteTimer)
  quoteTimer = setTimeout(runQuote, 180)
}

async function runQuote() {
  $('quoteError').replaceChildren()
  if (!cart.vesselId || !cart.date || !cart.guests) {
    currentQuote = null
    renderManifest()
    return
  }
  try {
    const { quote } = await api('/api/quote', { method: 'POST', body: cart })
    currentQuote = quote
    renderManifest()
  } catch (err) {
    // A bad promo code should not wipe the boat the guest just spent five
    // minutes loading — keep the last good manifest and flag only the code.
    if (err.field !== 'couponCode' || !currentQuote) currentQuote = null
    renderManifest()
    showError('quoteError', err.message)
  }
}

function showError(hostId, message, kind = '') {
  const el = document.createElement('div')
  el.className = `notice ${kind}`
  el.textContent = message
  $(hostId).replaceChildren(el)
}

/* --------------------------------------------------------------- checkout */

function openCheckout() {
  if (!currentQuote) {
    showError('quoteError', 'Pick a vessel, a date and how many are coming first.')
    return
  }
  const q = currentQuote
  const span = spanDates(q.date, q.nights)
  const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

  const back = document.createElement('div')
  back.className = 'modal-back'
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Review and pay">
      <div class="plate-head">
        <h3>Review &amp; pay</h3>
        <button class="btn btn-ghost btn-sm" type="button" data-close>Close</button>
      </div>
      <div class="plate-body">
        <div class="notice quiet">
          <strong class="chart-name">${esc(q.vesselName)}</strong>
          <span class="small">${q.nights ? `${fmt(span[0])} → ${fmt(span[span.length - 1])} · ${q.nights} nights` : fmt(q.date)} · ${q.guests} guests</span>
          <span class="small faint">Departing ${esc(catalog.settings.departurePoint)}</span>
        </div>

        <div class="manifest" id="coLines"></div>
        <div class="totals">
          <div class="mline"><span>Subtotal</span><span class="amt">${money(q.subtotal, q.currency)}</span></div>
          ${q.discount ? `<div class="mline savings"><span>Promo ${esc(q.couponCode)}</span><span class="amt">−${money(q.discount, q.currency)}</span></div>` : ''}
          <div class="mline grand"><span>Total</span><span class="amt">${money(q.total, q.currency)}</span></div>
        </div>

        <div class="grid cols-2" style="gap:10px">
          <label class="field"><span>Full name</span><input type="text" id="coName" autocomplete="name"></label>
          <label class="field"><span>Email</span><input type="email" id="coEmail" autocomplete="email"></label>
          <label class="field"><span>Phone or WhatsApp</span><input type="tel" id="coPhone" autocomplete="tel"></label>
          <label class="field"><span>Occasion</span>
            <select id="coOccasion">
              <option value="">Just a day out</option>
              <option>Birthday</option><option>Anniversary</option><option>Proposal</option>
              <option>Honeymoon</option><option>Wedding party</option><option>Corporate</option>
            </select>
          </label>
        </div>
        <label class="field"><span>Anything we should know — allergies, surprises, arrival time</span>
          <textarea id="coNotes"></textarea></label>

        <div class="grid cols-2" style="gap:10px">
          <button class="btn btn-primary" type="button" data-pay="deposit">Pay ${money(q.deposit, q.currency)} deposit</button>
          <button class="btn btn-ghost" type="button" data-pay="full">Pay ${money(q.total, q.currency)} in full</button>
        </div>
        <div id="coError"></div>
        <p class="small faint">${esc(catalog.settings.cancellationPolicy)}</p>
      </div>
    </div>`

  back.querySelector('[data-close]').addEventListener('click', () => back.remove())
  back.addEventListener('click', (e) => { if (e.target === back) back.remove() })

  const lines = back.querySelector('#coLines')
  for (const line of q.lines) {
    const row = document.createElement('div')
    row.className = 'mline'
    row.innerHTML = `<span class="lbl"><span>${esc(line.label)}</span>${line.detail ? `<span class="det">${esc(line.detail)}</span>` : ''}</span><span class="amt">${money(line.amount, q.currency)}</span>`
    lines.appendChild(row)
  }

  const occasionSelect = back.querySelector('#coOccasion')
  const preset = OCCASIONS.find((o) => o.id === cart.occasion)
  if (preset && preset.id !== 'nothing') {
    const match = [...occasionSelect.options].find((o) => preset.label.toLowerCase().includes(o.text.toLowerCase()))
    if (match) occasionSelect.value = match.value || match.text
  }

  back.querySelectorAll('[data-pay]').forEach((btn) =>
    btn.addEventListener('click', () => submitBooking(back, btn.dataset.pay, btn)))

  document.body.appendChild(back)
  back.querySelector('#coName').focus()
}

async function submitBooking(modal, payNow, button) {
  const pick = (id) => modal.querySelector(id)
  const errorHost = pick('#coError')
  errorHost.replaceChildren()
  modal.querySelectorAll('[data-pay]').forEach((b) => (b.disabled = true))
  const original = button.textContent
  button.textContent = 'Working…'

  try {
    const result = await api('/api/bookings', {
      method: 'POST',
      body: {
        ...cart,
        payNow,
        customer: {
          name: pick('#coName').value,
          email: pick('#coEmail').value,
          phone: pick('#coPhone').value,
          occasion: pick('#coOccasion').value,
          notes: pick('#coNotes').value,
        },
      },
    })
    window.location.href = result.checkoutUrl || `/confirmation.html?ref=${result.booking.ref}`
  } catch (err) {
    const el = document.createElement('div')
    el.className = 'notice'
    el.textContent = err.message
    errorHost.replaceChildren(el)
    modal.querySelectorAll('[data-pay]').forEach((b) => (b.disabled = false))
    button.textContent = original
    if (err.field === 'date') {
      // Someone else took it while this form was open. Refresh the calendar so
      // the guest can see what is still open instead of guessing.
      loadAvailability().then(renderCalendar)
    }
  }
}

/* ------------------------------------------------------------ hero canvas */

// Depth contours, the way a chart draws a shelving seabed. Slow enough to read
// as water rather than as an effect.
function wireSea() {
  const canvas = $('sea')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let raf = null

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', () => { resize(); if (still) draw() })

  let t = 0
  function draw() {
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    ctx.clearRect(0, 0, w, h)
    for (let layer = 0; layer < 7; layer++) {
      ctx.beginPath()
      const base = h * (0.3 + layer * 0.11)
      const amp = 6 + layer * 3.5
      const len = 300 + layer * 120
      ctx.moveTo(-20, base)
      for (let x = -20; x <= w + 20; x += 7) {
        ctx.lineTo(x, base + Math.sin((x + t * (7 + layer * 4)) / len) * amp)
      }
      ctx.strokeStyle = `rgba(110, 180, 195, ${0.3 - layer * 0.03})`
      ctx.lineWidth = layer === 3 ? 1.6 : 1
      ctx.stroke()
    }
    if (still) return
    t += 0.5
    raf = requestAnimationFrame(draw)
  }
  draw()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf)
    else if (!still) draw()
  })
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  loadState()
  catalog = await api('/api/catalog')

  $('footContact').textContent = catalog.settings.brand
  $('footDeparture').textContent = catalog.settings.departurePoint

  renderOccasions()
  renderVessels()
  renderTrip()
  renderBundles()
  renderShelves()
  renderDeckPlan()
  renderFaq()
  renderGallery()
  renderCalendar()
  applyGates()
  wireSea()

  $('calPrev').addEventListener('click', () => {
    calMonth = new Date(Date.UTC(calMonth.getUTCFullYear(), calMonth.getUTCMonth() - 1, 1))
    renderCalendar()
  })
  $('calNext').addEventListener('click', () => {
    calMonth = new Date(Date.UTC(calMonth.getUTCFullYear(), calMonth.getUTCMonth() + 1, 1))
    renderCalendar()
  })
  $('nights').addEventListener('input', (e) => {
    cart.nights = Number(e.target.value) || 0
    if (cart.date && !canStart(cart.date)) cart.date = ''
    renderTrip(); renderCalendar(); applyGates(); requestQuote()
  })
  $('guests').addEventListener('input', (e) => {
    cart.guests = Number(e.target.value) || 0
    renderTrip(); applyGates(); requestQuote()
  })
  $('applyCoupon').addEventListener('click', () => {
    cart.couponCode = $('coupon').value.trim()
    requestQuote()
  })
  $('toCheckout').addEventListener('click', openCheckout)
  $('barCta').addEventListener('click', openCheckout)
  if (cart.couponCode) $('coupon').value = cart.couponCode

  if (cart.vesselId) {
    await loadAvailability()
    if (cart.date) calMonth = new Date(`${cart.date.slice(0, 8)}01T12:00:00Z`)
    renderCalendar()
    applyGates()
    requestQuote()
  }
}

boot().catch((err) => {
  console.error(err)
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<div class="wrap" style="padding:20px"><div class="notice">We could not load the fleet. Refresh the page, or call us and we will book it by hand.</div></div>',
  )
})
