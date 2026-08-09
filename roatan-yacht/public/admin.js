// The bridge — everything the crew edits without touching code.

const $ = (id) => document.getElementById(id)
const money = (n, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n || 0)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

let token = sessionStorage.getItem('lc_admin_token') || ''
let data = null
let stats = null
let tab = 'today'

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const body = await res.json().catch(() => ({ ok: false, error: 'Unexpected response.' }))
  if (res.status === 401) { signOut(); throw new Error(body.error || 'Session expired.') }
  if (!body.ok) throw new Error(body.error || 'Request failed')
  return body
}

/* ------------------------------------------------------------------ auth */

function signOut() {
  token = ''
  sessionStorage.removeItem('lc_admin_token')
  $('app').classList.add('hidden')
  $('signOut').classList.add('hidden')
  $('login').classList.remove('hidden')
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('loginError').innerHTML = ''
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('password').value }),
    })
    const body = await res.json()
    if (!body.ok) throw new Error(body.error)
    token = body.token
    sessionStorage.setItem('lc_admin_token', token)
    await start()
  } catch (err) {
    $('loginError').innerHTML = `<div class="notice">${esc(err.message)}</div>`
  }
})

$('signOut').addEventListener('click', signOut)

/* --------------------------------------------------------------- reload */

async function refresh() {
  const [d, s] = await Promise.all([api('/api/admin/data'), api('/api/admin/stats')])
  data = d
  stats = s.stats
}

async function start() {
  await refresh()
  $('login').classList.add('hidden')
  $('app').classList.remove('hidden')
  $('signOut').classList.remove('hidden')

  const notes = []
  if (!data.system.writable) {
    notes.push('<div class="notice"><strong>Changes are not being saved to disk.</strong><span class="small">This server has a read-only filesystem, so edits disappear when it restarts. Point DATA_DIR at a writable folder, or connect a database.</span></div>')
  }
  if (data.system.emailMode !== 'resend') {
    notes.push('<div class="notice"><strong>Emails are not going out.</strong><span class="small">No RESEND_API_KEY is set, so confirmations are written to the server log instead of sent. Bookings still work — nobody gets a receipt.</span></div>')
  }
  if (data.system.paymentMode !== 'stripe') {
    notes.push('<div class="notice"><strong>Card payments are off.</strong><span class="small">No STRIPE_SECRET_KEY is set, so bookings are confirmed and invoiced by hand instead of charged. Everything else works.</span></div>')
  }
  $('systemNote').innerHTML = notes.join('')

  renderTabs()
  render()
}

function renderTabs() {
  const tabs = [
    ['today', 'Today'],
    ['bookings', 'Bookings'],
    ['catalog', 'Boats & extras'],
    ['promos', 'Promos'],
    ['calendar', 'Calendar'],
    ['invoices', 'Invoices'],
    ['numbers', 'Numbers'],
    ['settings', 'Settings'],
  ]
  $('tabs').replaceChildren(
    ...tabs.map(([id, label]) => {
      const b = document.createElement('button')
      b.className = 'tab'
      b.type = 'button'
      b.textContent = label
      b.setAttribute('aria-current', String(tab === id))
      b.addEventListener('click', () => { tab = id; renderTabs(); render() })
      return b
    }),
  )
}

/* ---------------------------------------------------------------- editor */

const SCHEMAS = {
  vessels: [
    ['name', 'Name', 'text'],
    ['tagline', 'Tagline', 'text'],
    ['description', 'Description', 'textarea'],
    ['type', 'Type', 'select', ['day', 'multiday']],
    ['durationLabel', 'Duration shown to guests', 'text'],
    ['basePrice', 'Base price', 'number'],
    ['priceUnit', 'Price unit', 'select', ['flat', 'per_night']],
    ['minNights', 'Minimum nights', 'number'],
    ['capacityMin', 'Minimum guests', 'number'],
    ['capacityMax', 'Maximum guests', 'number'],
    ['photo', 'Photo (path under /media, no extension)', 'text'],
    ['boatName', 'Boat name', 'text'],
    ['heroEmoji', 'Icon (fallback when there is no photo)', 'text'],
    ['accent', 'Accent colour', 'text'],
    ['includes', 'What it includes (one per line)', 'lines'],
    ['sortOrder', 'Order on the page', 'number'],
    ['active', 'Visible to guests', 'bool'],
  ],
  extras: [
    ['name', 'Name', 'text'],
    ['emoji', 'Icon', 'text'],
    ['category', 'Category', 'select', ['celebrate', 'eat_drink', 'adventure', 'comfort']],
    ['description', 'Description', 'textarea'],
    ['price', 'Price', 'number'],
    ['unit', 'Charged', 'select', ['flat', 'per_person']],
    ['leadTimeHours', 'Hours of notice needed', 'number'],
    ['maxQty', 'Max quantity', 'number'],
    ['active', 'Visible to guests', 'bool'],
  ],
  bundles: [
    ['name', 'Name', 'text'],
    ['emoji', 'Icon', 'text'],
    ['photo', 'Photo (path under /media, no extension)', 'text'],
    ['tagline', 'Tagline', 'text'],
    ['extraIds', 'Extras included', 'extras'],
    ['discountPct', 'Discount %', 'number'],
    ['active', 'Visible to guests', 'bool'],
  ],
  coupons: [
    ['code', 'Code', 'text'],
    ['type', 'Type', 'select', ['percent', 'fixed']],
    ['value', 'Value', 'number'],
    ['minTotal', 'Minimum trip total', 'number'],
    ['maxRedemptions', 'Max uses (0 = unlimited)', 'number'],
    ['expiresAt', 'Expires', 'date'],
    ['active', 'Active', 'bool'],
  ],
  blackouts: [
    ['vesselId', 'Boat', 'vessel'],
    ['date', 'Date', 'date'],
    ['reason', 'Reason', 'text'],
  ],
}

function openEditor(collection, row) {
  const fields = SCHEMAS[collection]
  const isNew = !row
  const values = row ? { ...row } : {}

  const back = document.createElement('div')
  back.className = 'modal-back'
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="plate-head">
        <h3>${isNew ? 'New' : 'Edit'} ${collection.replace(/s$/, '')}</h3>
        <button class="btn btn-ghost btn-sm" type="button" data-close>Close</button>
      </div>
      <div class="plate-body" id="editorFields"></div>
      <div class="plate-body" style="border-top:1px solid var(--rule); flex-direction:row; justify-content:space-between">
        ${isNew ? '<span></span>' : '<button class="btn btn-danger btn-sm" type="button" data-delete>Delete</button>'}
        <button class="btn btn-primary" type="button" data-save>Save</button>
      </div>
    </div>`

  const host = back.querySelector('#editorFields')
  for (const [key, label, kind, options] of fields) {
    const wrap = document.createElement('label')
    wrap.className = 'field'
    const value = values[key]
    let control = ''
    if (kind === 'textarea') control = `<textarea data-k="${key}">${esc(value || '')}</textarea>`
    else if (kind === 'lines') control = `<textarea data-k="${key}" data-lines="1">${esc((value || []).join('\n'))}</textarea>`
    else if (kind === 'number') control = `<input type="number" step="any" data-k="${key}" value="${value ?? 0}">`
    else if (kind === 'date') control = `<input type="date" data-k="${key}" value="${(value || '').slice(0, 10)}">`
    else if (kind === 'bool')
      control = `<select data-k="${key}" data-bool="1"><option value="1"${value !== false ? ' selected' : ''}>Yes</option><option value="0"${value === false ? ' selected' : ''}>No</option></select>`
    else if (kind === 'select')
      control = `<select data-k="${key}">${options.map((o) => `<option${value === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
    else if (kind === 'vessel')
      control = `<select data-k="${key}">${data.vessels.map((v) => `<option value="${v.id}"${value === v.id ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`
    else if (kind === 'extras')
      control = `<select data-k="${key}" data-multi="1" multiple size="8">${data.extras.map((e) => `<option value="${e.id}"${(value || []).includes(e.id) ? ' selected' : ''}>${e.emoji} ${esc(e.name)}</option>`).join('')}</select>`
    else control = `<input type="text" data-k="${key}" value="${esc(value ?? '')}">`
    wrap.innerHTML = `<span>${label}</span>${control}`
    host.appendChild(wrap)
  }

  const collect = () => {
    const patch = {}
    host.querySelectorAll('[data-k]').forEach((el) => {
      const key = el.dataset.k
      if (el.dataset.bool) patch[key] = el.value === '1'
      else if (el.dataset.multi) patch[key] = [...el.selectedOptions].map((o) => o.value)
      else if (el.dataset.lines) patch[key] = el.value.split('\n').map((s) => s.trim()).filter(Boolean)
      else if (el.type === 'number') patch[key] = Number(el.value) || 0
      else patch[key] = el.value
    })
    return patch
  }

  back.querySelector('[data-close]').addEventListener('click', () => back.remove())
  back.addEventListener('click', (e) => { if (e.target === back) back.remove() })
  back.querySelector('[data-save]').addEventListener('click', async () => {
    try {
      if (isNew) await api(`/api/admin/${collection}`, { method: 'POST', body: collect() })
      else await api(`/api/admin/${collection}/${row.id}`, { method: 'PATCH', body: collect() })
      back.remove()
      await refresh()
      render()
    } catch (err) { alert(err.message) }
  })
  back.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${row.name || row.code || row.date}"? Guests will stop seeing it immediately.`)) return
    await api(`/api/admin/${collection}/${row.id}`, { method: 'DELETE' })
    back.remove()
    await refresh()
    render()
  })

  document.body.appendChild(back)
}

/* ----------------------------------------------------------------- views */

const views = {}

views.today = () => {
  const today = new Date().toISOString().slice(0, 10)
  const sailing = data.bookings.filter((b) => b.status !== 'cancelled' && b.date === today)
  const soon = stats.upcoming.filter((b) => b.date > today).slice(0, 6)

  return `
    <div class="grid cols-4">
      <div class="stat"><span class="k">Sailing today</span><span class="v">${sailing.length}</span></div>
      <div class="stat"><span class="k">Booked all time</span><span class="v">${stats.bookings}</span></div>
      <div class="stat"><span class="k">Collected</span><span class="v">${money(stats.collected)}</span></div>
      <div class="stat"><span class="k">Outstanding</span><span class="v" style="color:var(--flag)">${money(stats.outstanding)}</span></div>
    </div>

    <div class="plate" style="margin-top:18px">
      <div class="plate-head"><h3>Today's departures</h3><span class="small faint">${today}</span></div>
      <div class="plate-body">
        ${sailing.length ? sailing.map(bookingRow).join('') : '<p class="small faint">No boats out today.</p>'}
      </div>
    </div>

    <div class="plate" style="margin-top:18px">
      <div class="plate-head"><h3>Coming up</h3></div>
      <div class="plate-body">
        ${soon.length ? soon.map(bookingRow).join('') : '<p class="small faint">Nothing on the calendar yet.</p>'}
      </div>
    </div>`
}

function bookingRow(b) {
  const extras = b.lines.filter((l) => l.kind !== 'vessel')
  return `
    <div class="mline" style="border-bottom:1px solid var(--rule); padding-bottom:10px">
      <span class="lbl">
        <span><strong>${esc(b.customer.name)}</strong> · ${esc(b.vesselName)}</span>
        <span class="det">${b.date} · ${b.guests} guests · ${b.ref}${extras.length ? ` · ${extras.map((e) => esc(e.label)).join(', ')}` : ''}</span>
        ${b.customer.notes ? `<span class="det">Note: ${esc(b.customer.notes)}</span>` : ''}
      </span>
      <span class="amt">${money(b.total)}</span>
    </div>`
}

views.bookings = () => `
  <div class="tablewrap">
    <table>
      <thead><tr><th>Ref</th><th>Guest</th><th>Boat</th><th>Date</th><th>Guests</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${data.bookings.length ? data.bookings.map((b) => `
          <tr>
            <td class="num">${b.ref}</td>
            <td><strong>${esc(b.customer.name)}</strong><br><span class="small faint">${esc(b.customer.email)}${b.customer.phone ? ` · ${esc(b.customer.phone)}` : ''}</span></td>
            <td>${esc(b.vesselName)}</td>
            <td class="num">${b.date}</td>
            <td class="num">${b.guests}</td>
            <td class="num">${money(b.total)}</td>
            <td class="num">${money(b.amountPaid)}</td>
            <td><span class="chip ${b.status === 'cancelled' ? 'signal' : b.paymentStatus === 'paid' ? 'ok' : 'signal'}">${b.status === 'cancelled' ? 'cancelled' : b.paymentStatus.replace('_', ' ')}</span></td>
            <td>
              <button class="btn btn-ghost btn-sm" data-mark="${b.id}">Mark paid</button>
              <button class="btn btn-ghost btn-sm" data-cancel="${b.id}">Cancel</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="9" class="small faint">No bookings yet. They will land here the moment someone checks out.</td></tr>'}
      </tbody>
    </table>
  </div>`

views.catalog = () => `
  <div class="stack" style="gap:22px">
    <div class="plate">
      <div class="plate-head"><h3>Boats and packages</h3><button class="btn btn-primary btn-sm" data-new="vessels">Add a boat</button></div>
      <div class="plate-body">
        <div class="tablewrap">
          <table>
            <thead><tr><th></th><th>Name</th><th>Duration</th><th>Price</th><th>Guests</th><th>Live</th><th></th></tr></thead>
            <tbody>${data.vessels.map((v) => `
              <tr>
                <td>${v.heroEmoji}</td>
                <td><strong>${esc(v.name)}</strong><br><span class="small faint">${esc(v.tagline)}</span></td>
                <td>${esc(v.durationLabel)}</td>
                <td class="num">${money(v.basePrice)}${v.priceUnit === 'per_night' ? '/night' : ''}</td>
                <td class="num">${v.capacityMin}–${v.capacityMax}</td>
                <td><span class="chip ${v.active ? 'ok' : 'signal'}">${v.active ? 'live' : 'hidden'}</span></td>
                <td><button class="btn btn-ghost btn-sm" data-edit="vessels:${v.id}">Edit</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="plate">
      <div class="plate-head"><h3>Extras</h3><button class="btn btn-primary btn-sm" data-new="extras">Add an extra</button></div>
      <div class="plate-body">
        <div class="tablewrap">
          <table>
            <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Charged</th><th>Notice</th><th>Live</th><th></th></tr></thead>
            <tbody>${data.extras.map((e) => `
              <tr>
                <td>${e.emoji}</td>
                <td><strong>${esc(e.name)}</strong><br><span class="small faint">${esc(e.description)}</span></td>
                <td>${esc(data.categories.find((c) => c.id === e.category)?.label || e.category)}</td>
                <td class="num">${money(e.price)}</td>
                <td>${e.unit === 'per_person' ? 'per guest' : 'flat'}</td>
                <td class="num">${e.leadTimeHours} h</td>
                <td><span class="chip ${e.active ? 'ok' : 'signal'}">${e.active ? 'live' : 'hidden'}</span></td>
                <td><button class="btn btn-ghost btn-sm" data-edit="extras:${e.id}">Edit</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="plate">
      <div class="plate-head"><h3>Packages</h3><button class="btn btn-primary btn-sm" data-new="bundles">Add a package</button></div>
      <div class="plate-body">
        <div class="grid cols-3">${data.bundles.map((b) => `
          <div class="stat">
            <span class="k">${b.discountPct}% off</span>
            <strong>${b.emoji} ${esc(b.name)}</strong>
            <span class="small">${b.extraIds.map((id) => esc(data.extras.find((e) => e.id === id)?.name || '')).filter(Boolean).join(' · ')}</span>
            <button class="btn btn-ghost btn-sm" style="margin-top:8px" data-edit="bundles:${b.id}">Edit</button>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`

views.promos = () => `
  <div class="plate">
    <div class="plate-head"><h3>Promo codes</h3><button class="btn btn-primary btn-sm" data-new="coupons">New code</button></div>
    <div class="plate-body">
      <div class="tablewrap">
        <table>
          <thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Used</th><th>Expires</th><th>Active</th><th></th></tr></thead>
          <tbody>${data.coupons.length ? data.coupons.map((c) => `
            <tr>
              <td class="num"><strong>${esc(c.code)}</strong></td>
              <td class="num">${c.type === 'percent' ? `${c.value}%` : money(c.value)}</td>
              <td class="num">${c.minTotal ? money(c.minTotal) : '—'}</td>
              <td class="num">${c.redemptions || 0}${c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}</td>
              <td class="num">${c.expiresAt ? c.expiresAt.slice(0, 10) : 'never'}</td>
              <td><span class="chip ${c.active ? 'ok' : 'signal'}">${c.active ? 'on' : 'off'}</span></td>
              <td><button class="btn btn-ghost btn-sm" data-edit="coupons:${c.id}">Edit</button></td>
            </tr>`).join('') : '<tr><td colspan="7" class="small faint">No codes yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`

views.calendar = () => {
  const byVessel = data.vessels.map((v) => {
    const booked = data.bookings.filter((b) => b.vesselId === v.id && b.status !== 'cancelled')
    const blocked = data.blackouts.filter((b) => b.vesselId === v.id)
    return `
      <div class="plate">
        <div class="plate-head"><h3>${v.heroEmoji} ${esc(v.name)}</h3><span class="small faint">${booked.length} booked · ${blocked.length} blocked</span></div>
        <div class="plate-body">
          ${booked.length ? booked.map((b) => `<div class="mline"><span class="lbl"><span>${b.date}</span><span class="det">${esc(b.customer.name)} · ${b.ref}</span></span><span class="chip shoal">booked</span></div>`).join('') : ''}
          ${blocked.map((b) => `<div class="mline"><span class="lbl"><span>${b.date}</span><span class="det">${esc(b.reason || 'Blocked')}</span></span><button class="btn btn-ghost btn-sm" data-unblock="${b.id}">Unblock</button></div>`).join('')}
          ${!booked.length && !blocked.length ? '<p class="small faint">Wide open.</p>' : ''}
        </div>
      </div>`
  })
  return `<div class="stack" style="gap:18px">
    <div><button class="btn btn-primary btn-sm" data-new="blackouts">Block a date</button></div>
    ${byVessel.join('')}
  </div>`
}

views.invoices = () => `
  <div class="stack" style="gap:18px">
    <div><button class="btn btn-primary btn-sm" id="newInvoice">New invoice</button></div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Number</th><th>Customer</th><th>Total</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>${data.invoices.length ? data.invoices.map((i) => `
          <tr>
            <td class="num">${i.number}</td>
            <td>${esc(i.customer.name || '')}<br><span class="small faint">${esc(i.customer.email)}</span></td>
            <td class="num">${money(i.total)}</td>
            <td><span class="chip ${i.status === 'paid' ? 'ok' : 'signal'}">${i.status}</span></td>
            <td class="num">${i.createdAt.slice(0, 10)}</td>
            <td>
              <a class="btn btn-ghost btn-sm" href="/invoice.html?n=${i.number}" target="_blank" rel="noopener">Open</a>
              <button class="btn btn-ghost btn-sm" data-copy="/invoice.html?n=${i.number}">Copy link</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="6" class="small faint">No invoices yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`

views.numbers = () => `
  <div class="stack" style="gap:20px">
    <div class="grid cols-4">
      <div class="stat"><span class="k">Booked</span><span class="v">${money(stats.revenue)}</span></div>
      <div class="stat"><span class="k">Collected</span><span class="v">${money(stats.collected)}</span></div>
      <div class="stat"><span class="k">Outstanding</span><span class="v">${money(stats.outstanding)}</span></div>
      <div class="stat"><span class="k">Average trip</span><span class="v">${money(stats.averageTicket)}</span></div>
    </div>
    <div class="grid cols-2">
      <div class="plate">
        <div class="plate-head"><h3>Best-selling extras</h3></div>
        <div class="plate-body">
          ${stats.topExtras.length ? stats.topExtras.map((e) => `<div class="mline"><span class="lbl"><span>${esc(e.label)}</span><span class="det">sold ${e.count}×</span></span><span class="amt">${money(e.revenue)}</span></div>`).join('') : '<p class="small faint">Nothing sold yet.</p>'}
        </div>
      </div>
      <div class="plate">
        <div class="plate-head"><h3>By boat</h3></div>
        <div class="plate-body">
          ${stats.byVessel.length ? stats.byVessel.map((v) => `<div class="mline"><span class="lbl"><span>${esc(v.name)}</span><span class="det">${v.trips} trip${v.trips === 1 ? '' : 's'}</span></span><span class="amt">${money(v.revenue)}</span></div>`).join('') : '<p class="small faint">No trips yet.</p>'}
        </div>
      </div>
    </div>
  </div>`

views.settings = () => {
  const s = data.settings
  const row = (key, label, type = 'text') =>
    `<label class="field"><span>${label}</span><input type="${type}" data-s="${key}" value="${esc(s[key] ?? '')}"></label>`
  return `
    <div class="plate">
      <div class="plate-head"><h3>Business settings</h3><button class="btn btn-primary btn-sm" id="saveSettings">Save</button></div>
      <div class="plate-body">
        <div class="grid cols-2">
          ${row('brand', 'Brand name')}
          ${row('productLine', 'Product line')}
          ${row('contactEmail', 'Contact email', 'email')}
          ${row('contactPhone', 'Phone')}
          ${row('whatsapp', 'WhatsApp')}
          ${row('depositPct', 'Deposit %', 'number')}
        </div>
        <label class="field"><span>Departure point</span><input type="text" data-s="departurePoint" value="${esc(s.departurePoint)}"></label>
        <label class="field"><span>Cancellation policy</span><textarea data-s="cancellationPolicy">${esc(s.cancellationPolicy)}</textarea></label>
      </div>
    </div>`
}

/* ---------------------------------------------------------------- wiring */

function render() {
  $('view').innerHTML = views[tab]()

  $('view').querySelectorAll('[data-new]').forEach((b) =>
    b.addEventListener('click', () => openEditor(b.dataset.new, null)))

  $('view').querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const [collection, id] = b.dataset.edit.split(':')
      openEditor(collection, data[collection].find((r) => r.id === id))
    }))

  $('view').querySelectorAll('[data-unblock]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api(`/api/admin/blackouts/${b.dataset.unblock}`, { method: 'DELETE' })
      await refresh(); render()
    }))

  $('view').querySelectorAll('[data-mark]').forEach((b) =>
    b.addEventListener('click', async () => {
      const booking = data.bookings.find((x) => x.id === b.dataset.mark)
      await api(`/api/admin/bookings/${b.dataset.mark}`, {
        method: 'PATCH',
        body: { paymentStatus: 'paid', amountPaid: booking.total },
      })
      await refresh(); render()
    }))

  $('view').querySelectorAll('[data-cancel]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Cancel this booking? The date frees up right away.')) return
      await api(`/api/admin/bookings/${b.dataset.cancel}`, { method: 'PATCH', body: { status: 'cancelled' } })
      await refresh(); render()
    }))

  $('view').querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => {
      navigator.clipboard.writeText(location.origin + b.dataset.copy)
      b.textContent = 'Copied'
      setTimeout(() => (b.textContent = 'Copy link'), 1500)
    }))

  $('newInvoice')?.addEventListener('click', openInvoiceBuilder)

  $('saveSettings')?.addEventListener('click', async () => {
    const patch = {}
    $('view').querySelectorAll('[data-s]').forEach((el) => {
      patch[el.dataset.s] = el.type === 'number' ? Number(el.value) : el.value
    })
    await api('/api/admin/settings', { method: 'PATCH', body: patch })
    await refresh(); render()
  })
}

function openInvoiceBuilder() {
  const back = document.createElement('div')
  back.className = 'modal-back'
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="plate-head"><h3>New invoice</h3><button class="btn btn-ghost btn-sm" type="button" data-close>Close</button></div>
      <div class="plate-body">
        <div class="grid cols-2">
          <label class="field"><span>Customer name</span><input type="text" id="invName"></label>
          <label class="field"><span>Email</span><input type="email" id="invEmail"></label>
          <label class="field"><span>Phone</span><input type="tel" id="invPhone"></label>
          <label class="field"><span>Due date</span><input type="date" id="invDue"></label>
        </div>
        <div class="stack" style="gap:8px" id="invLines"></div>
        <button class="btn btn-ghost btn-sm" type="button" id="addLine" style="align-self:flex-start">Add a line</button>
        <label class="field"><span>Notes on the invoice</span><textarea id="invNotes"></textarea></label>
        <div id="invError"></div>
        <button class="btn btn-primary btn-block" type="button" id="invSave">Create and get the payment link</button>
      </div>
    </div>`

  const lines = back.querySelector('#invLines')
  const addLine = (label = '', unitPrice = '', qty = 1) => {
    const row = document.createElement('div')
    row.className = 'grid'
    row.style.gridTemplateColumns = '1fr 84px 110px 34px'
    row.style.gap = '8px'
    row.innerHTML = `
      <input type="text" placeholder="Private charter — March 14" data-l="label" value="${esc(label)}">
      <input type="number" min="1" data-l="qty" value="${qty}">
      <input type="number" step="0.01" placeholder="0.00" data-l="unitPrice" value="${unitPrice}">
      <button class="btn btn-ghost btn-sm" type="button" data-remove aria-label="Remove line">×</button>`
    row.querySelector('[data-remove]').addEventListener('click', () => row.remove())
    lines.appendChild(row)
  }
  addLine()

  back.querySelector('#addLine').addEventListener('click', () => addLine())
  back.querySelector('[data-close]').addEventListener('click', () => back.remove())
  back.addEventListener('click', (e) => { if (e.target === back) back.remove() })

  back.querySelector('#invSave').addEventListener('click', async () => {
    const body = {
      customer: {
        name: back.querySelector('#invName').value,
        email: back.querySelector('#invEmail').value,
        phone: back.querySelector('#invPhone').value,
      },
      dueDate: back.querySelector('#invDue').value || null,
      notes: back.querySelector('#invNotes').value,
      lines: [...lines.children].map((row) => ({
        label: row.querySelector('[data-l="label"]').value,
        qty: Number(row.querySelector('[data-l="qty"]').value) || 1,
        unitPrice: Number(row.querySelector('[data-l="unitPrice"]').value) || 0,
      })).filter((l) => l.label && l.unitPrice > 0),
    }
    try {
      const res = await api('/api/admin/invoices', { method: 'POST', body })
      back.remove()
      await refresh(); render()
      const wa = res.whatsappUrl ? `\n\nOr send it on WhatsApp:\n${res.whatsappUrl}` : ''
      prompt(`Invoice created and emailed to ${body.customer.email}. Link:${wa}`, res.shareUrl)
    } catch (err) {
      back.querySelector('#invError').innerHTML = `<div class="notice">${esc(err.message)}</div>`
    }
  })

  document.body.appendChild(back)
}

if (token) start().catch(signOut)
