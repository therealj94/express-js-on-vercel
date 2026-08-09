// Guest-facing booking app.
//
// The cart lives in the URL hash, so a half-built trip survives a refresh and
// can be sent to whoever is coming along.

const $ = (id) => document.getElementById(id)
const money = (n, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)

let catalog = null
let unavailable = new Set()
let currentQuote = null
let quoteTimer = null

const cart = {
  vesselId: null,
  date: '',
  nights: 0,
  guests: 2,
  items: [], // { extraId, qty }
  bundleIds: [],
  couponCode: '',
}

/* ------------------------------------------------------------ url state */

function saveState() {
  const compact = {
    v: cart.vesselId,
    d: cart.date,
    n: cart.nights,
    g: cart.guests,
    i: cart.items.map((x) => (x.qty > 1 ? `${x.extraId}*${x.qty}` : x.extraId)),
    b: cart.bundleIds,
    c: cart.couponCode || undefined,
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

/* -------------------------------------------------------------- rendering */

function vesselCard(v) {
  const el = document.createElement('button')
  el.className = 'vessel'
  el.type = 'button'
  el.setAttribute('aria-pressed', String(cart.vesselId === v.id))
  el.innerHTML = `
    <div class="art" style="background:linear-gradient(160deg, ${v.accent}, var(--deep))">${v.heroEmoji}</div>
    <div class="body">
      <span class="tag sea">${v.type === 'day' ? v.durationLabel : v.durationLabel}</span>
      <span class="name">${v.name}</span>
      <p class="small">${v.tagline}</p>
      <div class="row">
        <span class="price">${money(v.basePrice)}${v.priceUnit === 'per_night' ? ' <span class="small faint">/night</span>' : ''}</span>
        <span class="small faint">${v.capacityMin}–${v.capacityMax} guests</span>
      </div>
    </div>`
  el.addEventListener('click', () => selectVessel(v.id))
  return el
}

function renderVessels() {
  const host = $('vessels')
  host.replaceChildren(...catalog.vessels.map(vesselCard))
}

function currentVessel() {
  return catalog.vessels.find((v) => v.id === cart.vesselId) || null
}

async function selectVessel(id) {
  cart.vesselId = id
  const v = currentVessel()
  cart.nights = v.priceUnit === 'per_night' ? Math.max(v.minNights, cart.nights || v.minNights) : 0
  cart.guests = Math.min(Math.max(cart.guests, v.capacityMin), v.capacityMax)

  renderVessels()
  renderTripPanel()
  await loadAvailability()
  requestQuote()
  $('builder').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function renderTripPanel() {
  const v = currentVessel()
  $('tripTitle').textContent = v ? v.name : 'Your trip'
  $('tripTag').textContent = v ? v.durationLabel : 'Pick a boat first'

  const multi = v && v.priceUnit === 'per_night'
  document.querySelectorAll('.nights-only').forEach((el) => el.classList.toggle('hidden', !multi))
  $('dateLabel').textContent = multi ? 'First night' : 'Departure date'

  const today = new Date().toISOString().slice(0, 10)
  $('date').min = today
  $('date').value = cart.date
  $('nights').value = cart.nights || (v ? v.minNights : 1)
  if (v) {
    $('nights').min = v.minNights
    $('guests').min = v.capacityMin
    $('guests').max = v.capacityMax
  }
  $('guests').value = cart.guests
}

function categoryButtons() {
  const host = $('cats')
  const all = [{ id: 'all', label: 'Everything' }, ...catalog.categories]
  host.replaceChildren(
    ...all.map((c) => {
      const b = document.createElement('button')
      b.className = 'cat'
      b.type = 'button'
      b.textContent = c.label
      b.setAttribute('aria-pressed', String(activeCategory === c.id))
      b.addEventListener('click', () => {
        activeCategory = c.id
        categoryButtons()
        renderExtras()
      })
      return b
    }),
  )
}

let activeCategory = 'all'

function extraCard(e) {
  const inCart = cart.items.some((i) => i.extraId === e.id)
  const el = document.createElement('button')
  el.className = `extra${inCart ? ' in-cart' : ''}`
  el.type = 'button'
  el.draggable = true
  el.dataset.extraId = e.id
  el.setAttribute('aria-pressed', String(inCart))
  el.innerHTML = `
    <span class="add">${inCart ? '✓' : '+'}</span>
    <span class="top"><span class="emoji">${e.emoji}</span><span class="name">${e.name}</span></span>
    <span class="desc">${e.description}</span>
    <span class="price">${money(e.price)}${e.unit === 'per_person' ? ' per guest' : ''}</span>`

  el.addEventListener('click', () => toggleExtra(e.id))
  el.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('text/plain', e.id)
    ev.dataTransfer.effectAllowed = 'copy'
    el.classList.add('dragging')
  })
  el.addEventListener('dragend', () => el.classList.remove('dragging'))
  return el
}

function renderExtras() {
  const list = catalog.extras.filter((e) => activeCategory === 'all' || e.category === activeCategory)
  $('extras').replaceChildren(...list.map(extraCard))
  $('extraCount').textContent = `${list.length} to choose from`
}

function renderBundles() {
  $('bundles').replaceChildren(
    ...catalog.bundles.map((b) => {
      const on = cart.bundleIds.includes(b.id)
      const el = document.createElement('button')
      el.className = 'bundle'
      el.type = 'button'
      el.setAttribute('aria-pressed', String(on))
      const names = b.extraIds
        .map((id) => catalog.extras.find((e) => e.id === id)?.name)
        .filter(Boolean)
        .join(' · ')
      el.innerHTML = `
        <span class="name">${b.emoji} ${b.name}</span>
        <span class="small">${b.tagline}</span>
        <span class="small faint">${names}</span>
        <span class="tag ${on ? 'ok' : 'brass'}" style="align-self:flex-start; margin-top:4px">${on ? 'Aboard ✓' : `Save ${b.discountPct}%`}</span>`
      el.addEventListener('click', () => toggleBundle(b.id))
      return el
    }),
  )
}

function renderManifest() {
  const host = $('manifest')
  const totals = $('totals')
  host.replaceChildren()

  if (!currentQuote) {
    $('deckHint').classList.remove('hidden')
    $('deckHint').textContent = cart.vesselId
      ? 'Pick a date and guests to see your total'
      : 'Choose a boat above to get started'
    totals.replaceChildren()
    updateBar()
    return
  }

  const q = currentQuote
  $('deckHint').classList.toggle('hidden', q.lines.length > 1)
  if (q.lines.length <= 1) $('deckHint').textContent = 'Drag anything here to load it aboard'

  for (const line of q.lines) {
    const row = document.createElement('div')
    row.className = 'mline'
    const removable = line.kind !== 'vessel'
    row.innerHTML = `
      <span class="lbl">
        <span>${line.label}</span>
        ${line.detail ? `<span class="det">${line.detail}</span>` : ''}
      </span>
      <span style="display:flex; align-items:flex-start">
        <span class="amt">${money(line.amount, q.currency)}</span>
        ${removable ? '<button class="drop" type="button" aria-label="Remove">×</button>' : ''}
      </span>`
    if (removable) {
      row.querySelector('.drop').addEventListener('click', () => {
        if (line.kind === 'bundle') toggleBundle(line.id)
        else toggleExtra(line.id)
      })
    }
    host.appendChild(row)
  }

  totals.innerHTML = `
    <div class="mline"><span>Subtotal</span><span class="amt">${money(q.subtotal, q.currency)}</span></div>
    ${q.discount ? `<div class="mline savings"><span>Promo ${q.couponCode}</span><span class="amt">−${money(q.discount, q.currency)}</span></div>` : ''}
    <div class="mline grand"><span>Total</span><span class="amt">${money(q.total, q.currency)}</span></div>
    ${q.savings ? `<div class="savings">You are saving ${money(q.savings, q.currency)}</div>` : ''}`

  $('manifestCount').textContent = `${q.lines.length - 1} extra${q.lines.length - 1 === 1 ? '' : 's'}`
  $('depositNote').textContent = `Pay ${money(q.deposit, q.currency)} now (${q.depositPct}% deposit) or the full amount at checkout.`
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
  $('barDetail').textContent = n ? `${n} extra${n === 1 ? '' : 's'} aboard` : 'Nothing added yet'
}

/* ------------------------------------------------------------ mutations */

function toggleExtra(extraId) {
  const i = cart.items.findIndex((x) => x.extraId === extraId)
  if (i === -1) cart.items.push({ extraId, qty: 1 })
  else cart.items.splice(i, 1)
  renderExtras()
  requestQuote()
}

function toggleBundle(bundleId) {
  const i = cart.bundleIds.indexOf(bundleId)
  if (i === -1) cart.bundleIds.push(bundleId)
  else cart.bundleIds.splice(i, 1)
  renderBundles()
  requestQuote()
}

async function loadAvailability() {
  if (!cart.vesselId) return
  try {
    const { unavailable: days } = await api(`/api/availability?vesselId=${cart.vesselId}`)
    unavailable = new Set(days)
  } catch {
    unavailable = new Set()
  }
  const note = $('availabilityNote')
  if (cart.date && unavailable.has(cart.date)) {
    note.innerHTML = '<span style="color:var(--flag)">That date is already taken. Try another one.</span>'
  } else {
    note.textContent = unavailable.size
      ? `${unavailable.size} date${unavailable.size === 1 ? '' : 's'} already booked in the next year.`
      : 'Every date open for the next year.'
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
    // A bad promo code should not wipe the trip the guest just spent five
    // minutes building — keep the last good manifest and only flag the code.
    if (err.field !== 'couponCode' || !currentQuote) currentQuote = null
    renderManifest()
    showError('quoteError', err.message)
  }
}

function showError(hostId, message, kind = 'bad') {
  const el = document.createElement('div')
  el.className = `notice ${kind}`
  el.textContent = message
  $(hostId).replaceChildren(el)
}

/* --------------------------------------------------------------- checkout */

function openCheckout() {
  if (!currentQuote) {
    showError('quoteError', 'Pick a boat, a date and how many are coming first.')
    return
  }
  const q = currentQuote
  const back = document.createElement('div')
  back.className = 'modal-back'
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Review and pay">
      <div class="panel-head">
        <h3>Review &amp; pay</h3>
        <button class="btn btn-ghost btn-sm" type="button" data-close>Close</button>
      </div>
      <div class="panel-body">
        <div class="notice">
          <strong>${q.vesselName}</strong>
          <span class="small">${q.date}${q.nights ? ` · ${q.nights} nights` : ''} · ${q.guests} guests · departing from ${catalog.settings.departurePoint}</span>
        </div>

        <div class="manifest" id="coLines"></div>
        <div class="totals">
          <div class="mline"><span>Subtotal</span><span class="amt">${money(q.subtotal, q.currency)}</span></div>
          ${q.discount ? `<div class="mline savings"><span>Promo ${q.couponCode}</span><span class="amt">−${money(q.discount, q.currency)}</span></div>` : ''}
          <div class="mline grand"><span>Total</span><span class="amt">${money(q.total, q.currency)}</span></div>
        </div>

        <div class="grid cols-2" style="gap:12px">
          <label class="field"><span>Full name</span><input type="text" id="coName" autocomplete="name"></label>
          <label class="field"><span>Email</span><input type="email" id="coEmail" autocomplete="email"></label>
          <label class="field"><span>Phone or WhatsApp</span><input type="tel" id="coPhone" autocomplete="tel"></label>
          <label class="field"><span>Occasion (optional)</span>
            <select id="coOccasion">
              <option value="">Just a day out</option>
              <option>Birthday</option><option>Anniversary</option><option>Proposal</option>
              <option>Honeymoon</option><option>Wedding party</option><option>Corporate</option>
            </select>
          </label>
        </div>
        <label class="field"><span>Anything we should know? Allergies, surprises, arrival time</span>
          <textarea id="coNotes"></textarea></label>

        <div class="grid cols-2" style="gap:12px">
          <button class="btn btn-primary" type="button" data-pay="deposit">Pay ${money(q.deposit, q.currency)} deposit</button>
          <button class="btn btn-ghost" type="button" data-pay="full">Pay ${money(q.total, q.currency)} in full</button>
        </div>
        <div id="coError"></div>
        <p class="small faint">${catalog.settings.cancellationPolicy}</p>
      </div>
    </div>`

  back.querySelector('[data-close]').addEventListener('click', () => back.remove())
  back.addEventListener('click', (e) => { if (e.target === back) back.remove() })

  const lines = back.querySelector('#coLines')
  for (const line of q.lines) {
    const row = document.createElement('div')
    row.className = 'mline'
    row.innerHTML = `<span class="lbl"><span>${line.label}</span>${line.detail ? `<span class="det">${line.detail}</span>` : ''}</span><span class="amt">${money(line.amount, q.currency)}</span>`
    lines.appendChild(row)
  }

  back.querySelectorAll('[data-pay]').forEach((btn) =>
    btn.addEventListener('click', () => submitBooking(back, btn.dataset.pay, btn)),
  )

  document.body.appendChild(back)
  back.querySelector('#coName').focus()
}

async function submitBooking(modal, payNow, button) {
  const q = (id) => modal.querySelector(id)
  const errorHost = q('#coError')
  errorHost.replaceChildren()
  modal.querySelectorAll('[data-pay]').forEach((b) => (b.disabled = true))
  button.textContent = 'Working…'

  try {
    const result = await api('/api/bookings', {
      method: 'POST',
      body: {
        ...cart,
        payNow,
        customer: {
          name: q('#coName').value,
          email: q('#coEmail').value,
          phone: q('#coPhone').value,
          occasion: q('#coOccasion').value,
          notes: q('#coNotes').value,
        },
      },
    })

    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl
      return
    }
    // Quote mode: no processor connected yet, so we confirm and invoice.
    window.location.href = `/confirmation.html?ref=${result.booking.ref}`
  } catch (err) {
    const el = document.createElement('div')
    el.className = 'notice bad'
    el.textContent = err.message
    errorHost.replaceChildren(el)
    modal.querySelectorAll('[data-pay]').forEach((b) => (b.disabled = false))
    button.textContent = payNow === 'full' ? 'Pay in full' : 'Pay deposit'
  }
}

/* ------------------------------------------------------------------ deck */

function wireDeck() {
  const deck = $('deck')
  deck.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    deck.classList.add('hot')
  })
  deck.addEventListener('dragleave', () => deck.classList.remove('hot'))
  deck.addEventListener('drop', (e) => {
    e.preventDefault()
    deck.classList.remove('hot')
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    if (!cart.items.some((x) => x.extraId === id)) {
      cart.items.push({ extraId: id, qty: 1 })
      renderExtras()
      requestQuote()
    }
  })
}

/* ------------------------------------------------------------ hero canvas */

function wireSea() {
  const canvas = $('sea')
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const ctx = canvas.getContext('2d')
  let raf = null

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  let t = 0
  const draw = () => {
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    ctx.clearRect(0, 0, w, h)
    // Long, slow swells. Nothing flashy — it should read as water, not as an effect.
    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath()
      const base = h * (0.55 + layer * 0.12)
      const amp = 12 + layer * 5
      const len = 260 + layer * 90
      ctx.moveTo(0, base)
      for (let x = 0; x <= w; x += 8) {
        ctx.lineTo(x, base + Math.sin((x + t * (12 + layer * 6)) / len) * amp)
      }
      ctx.strokeStyle = `rgba(120, 190, 195, ${0.12 - layer * 0.02})`
      ctx.lineWidth = 1.4
      ctx.stroke()
    }
    t += 0.16
    raf = requestAnimationFrame(draw)
  }
  draw()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf)
    else draw()
  })
}

/* ------------------------------------------------------------------ steps */

function renderSteps() {
  const done = {
    vessel: Boolean(cart.vesselId),
    when: Boolean(cart.date && cart.guests),
    extras: cart.items.length + cart.bundleIds.length > 0,
  }
  const steps = [
    { id: 'fleet', n: '01', label: 'Vessel', ok: done.vessel },
    { id: 'builder', n: '02', label: 'Date & guests', ok: done.when },
    { id: 'builder', n: '03', label: 'Extras', ok: done.extras },
    { id: 'checkout', n: '04', label: 'Review & pay', ok: false },
  ]
  $('stepsNav').replaceChildren(
    ...steps.map((s) => {
      const b = document.createElement('button')
      b.className = 'stepdot'
      b.type = 'button'
      b.textContent = `${s.n} ${s.label}${s.ok ? ' ✓' : ''}`
      b.setAttribute('aria-current', String(s.id === 'builder' && !done.when))
      b.addEventListener('click', () => {
        if (s.id === 'checkout') openCheckout()
        else $(s.id).scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return b
    }),
  )
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  loadState()
  const data = await api('/api/catalog')
  catalog = data

  $('footContact').textContent = `by ${catalog.settings.brand}`
  $('footDeparture').textContent = catalog.settings.departurePoint

  renderVessels()
  renderTripPanel()
  categoryButtons()
  renderExtras()
  renderBundles()
  wireDeck()
  wireSea()
  renderSteps()

  $('date').addEventListener('change', async (e) => {
    cart.date = e.target.value
    await loadAvailability()
    requestQuote()
    renderSteps()
  })
  $('nights').addEventListener('input', (e) => {
    cart.nights = Number(e.target.value) || 0
    requestQuote()
  })
  $('guests').addEventListener('input', (e) => {
    cart.guests = Number(e.target.value) || 0
    requestQuote()
    renderSteps()
  })
  $('applyCoupon').addEventListener('click', () => {
    cart.couponCode = $('coupon').value.trim()
    requestQuote()
  })
  $('toCheckout').addEventListener('click', openCheckout)
  $('barCta').addEventListener('click', openCheckout)

  if (cart.vesselId) {
    await loadAvailability()
    requestQuote()
  }

  // Keep the step ticks honest as the cart changes.
  const observer = new MutationObserver(renderSteps)
  observer.observe($('manifest'), { childList: true })
}

boot().catch((err) => {
  console.error(err)
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<div class="wrap" style="padding:20px"><div class="notice bad">We could not load the boats. Refresh the page, or call us and we will book it by hand.</div></div>',
  )
})
