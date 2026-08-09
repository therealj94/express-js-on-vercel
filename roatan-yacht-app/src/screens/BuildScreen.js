import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Image } from 'react-native'
import * as Haptics from 'expo-haptics'
import { mono, serif, money } from '../theme'
import { photo } from '../images'
import { API } from '../api'
import { Plate, Label, Chip, Button, Notice, Serif } from '../components/ui'
import DeckPlan, { ZONES, zoneFor } from '../components/DeckPlan'
import Calendar, { spanDates } from '../components/Calendar'
import { quipFor, MILESTONES, EMPTY_HINTS } from '../fun'

const SHELF_PREVIEW = 4

export default function BuildScreen({
  c, catalog, cart, quote, quoteError, unavailable, vessel, insets,
  onPickDate, onGuests, onNights, onToggleExtra, onToggleBundle, onQty, onCoupon, onCheckout,
}) {
  const [open, setOpen] = useState({})
  const [lastZone, setLastZone] = useState(null)
  const [code, setCode] = useState(cart.couponCode || '')
  const [quip, setQuip] = useState(null)

  const ready = Boolean(cart.vesselId && cart.date && cart.guests)

  // What is loaded where. Bundles put their members on the boat too, so the
  // plan shows the whole picture and not just the à-la-carte pieces.
  const counts = {}
  for (const z of ZONES) counts[z.id] = 0
  const tally = (extraId) => {
    const e = catalog.extras.find((x) => x.id === extraId)
    if (e) counts[zoneFor(e.category).id] += 1
  }
  cart.items.forEach((i) => tally(i.extraId))
  cart.bundleIds.forEach((bid) => {
    const b = catalog.bundles.find((x) => x.id === bid)
    b?.extraIds.forEach(tally)
  })

  const aboardCount = cart.items.length + cart.bundleIds.length

  const loadExtra = (e) => {
    const already = cart.items.some((i) => i.extraId === e.id)
    Haptics.impactAsync(already ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium)
    if (!already) {
      setLastZone(zoneFor(e.category).id)
      // A little voice from the crew. Milestones outrank category quips, and
      // each one shows once because the count only passes each number once.
      const next = aboardCount + 1
      setQuip(MILESTONES[next] || quipFor(e.category, next))
    }
    onToggleExtra(e.id)
  }

  // The quip fades on its own; lingering jokes stop being jokes.
  React.useEffect(() => {
    if (!quip) return
    const t = setTimeout(() => setQuip(null), 2600)
    return () => clearTimeout(t)
  }, [quip])

  const fmt = (d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    })

  const span = cart.date ? spanDates(cart.date, cart.nights) : []

  return (
    <View style={{ flex: 1, backgroundColor: c.chart }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Label c={c} signal>Plate 02 — Loading</Label>
          <Serif c={c} size={21}>Load the boat</Serif>
          <Text style={[styles.prose, { color: c.inkSoft }]}>
            Tap anything to send it aboard and it stows where it actually happens — roses in the
            cabin, lobster at the galley table, snorkel gear on the swim platform.
          </Text>
        </View>

        <Plate c={c} title={vessel ? vessel.name : 'Pick a vessel'} right={<Chip c={c}>{vessel?.durationLabel || '—'}</Chip>}>
          <Calendar
            c={c}
            unavailable={unavailable}
            value={cart.date}
            nights={cart.nights}
            onPick={(d) => {
              Haptics.selectionAsync()
              onPickDate(d)
            }}
          />
          <Text style={[styles.small, { color: c.inkFaint }]}>
            {cart.nights
              ? `Hatched days are taken. A ${cart.nights}-night package needs ${cart.nights} clear days in a row.`
              : `Hatched days are taken. ${unavailable.size} booked in the year ahead.`}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 5 }}>
              <Label c={c}>Guests</Label>
              <Stepper
                c={c}
                value={cart.guests}
                min={vessel?.capacityMin || 1}
                max={vessel?.capacityMax || 12}
                onChange={onGuests}
              />
            </View>
            {vessel?.priceUnit === 'per_night' ? (
              <View style={{ flex: 1, gap: 5 }}>
                <Label c={c}>Nights aboard</Label>
                <Stepper c={c} value={cart.nights} min={vessel.minNights} max={14} onChange={onNights} />
              </View>
            ) : null}
          </View>

          {cart.date ? (
            <Notice c={c} tone="shoal">
              <Text style={{ fontFamily: serif, fontSize: 15, color: c.ink }}>{vessel?.name}</Text>
              <Text style={[styles.small, { color: c.inkSoft }]}>
                {cart.nights
                  ? `${fmt(span[0])} → ${fmt(span[span.length - 1])} · ${cart.nights} nights · ${cart.guests} guests`
                  : `${fmt(cart.date)} · ${vessel?.durationLabel} · ${cart.guests} guests`}
              </Text>
            </Notice>
          ) : (
            <Notice c={c} tone="shoal">Pick a date on the calendar to see the trip.</Notice>
          )}

          {vessel ? (
            <View style={{ gap: 4 }}>
              <Label c={c}>Already aboard, at no extra cost</Label>
              {vessel.includes.map((i) => (
                <Text key={i} style={[styles.small, { color: c.inkSoft }]}>· {i}</Text>
              ))}
            </View>
          ) : null}
        </Plate>

        <Plate c={c} title="The deck plan" right={<Label c={c}>{Object.values(counts).reduce((a, b) => a + b, 0)} aboard</Label>}>
          {ready ? (
            <>
              <DeckPlan c={c} counts={counts} lastZone={lastZone} />
              {Object.values(counts).every((n) => !n) ? (
                <Text style={[styles.small, { color: c.inkFaint }]}>
                  {EMPTY_HINTS[cart.occasion] || EMPTY_HINTS.default}
                </Text>
              ) : null}
              <ZoneShot c={c} counts={counts} lastZone={lastZone} catalog={catalog} />
            </>
          ) : (
            <Notice c={c}>Pick a vessel and a date first — then the boat opens up.</Notice>
          )}
        </Plate>

        {ready ? (
          <>
            <Plate c={c} title="Packages" right={<Label c={c}>~10% under the pieces</Label>}>
              {catalog.bundles.map((b) => {
                const on = cart.bundleIds.includes(b.id)
                const names = b.extraIds
                  .map((id) => catalog.extras.find((e) => e.id === id)?.name)
                  .filter(Boolean)
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                      onToggleBundle(b.id)
                    }}
                    style={[
                      styles.package,
                      { borderColor: on ? c.ok : c.signal, backgroundColor: on ? c.sunk : c.signalSoft },
                    ]}
                  >
                    {b.photo ? (
                      <Image source={photo(b.photo, API)} style={styles.packageImg} resizeMode="cover" />
                    ) : null}
                    <View style={{ padding: 12, gap: 5 }}>
                      <Text style={{ fontFamily: serif, fontSize: 15, color: c.ink }}>
                        {b.emoji} {b.name}
                      </Text>
                      <Text style={[styles.small, { color: c.inkSoft }]}>{b.tagline}</Text>
                      <Text style={[styles.small, { color: c.inkFaint }]}>{names.join(' · ')}</Text>
                      <View style={{ alignSelf: 'flex-start', marginTop: 3 }}>
                        <Chip c={c} tone={on ? 'ok' : 'signal'}>
                          {on ? 'Aboard' : `Save ${b.discountPct}%`}
                        </Chip>
                      </View>
                    </View>
                  </Pressable>
                )
              })}
            </Plate>

            {catalog.categories.map((cat) => {
              const all = catalog.extras.filter((e) => e.category === cat.id)
              const isOpen = open[cat.id]
              const shown = isOpen ? all : all.slice(0, SHELF_PREVIEW)
              return (
                <Plate
                  key={cat.id}
                  c={c}
                  title={cat.label}
                  right={<Label c={c}>Stows: {zoneFor(cat.id).label}</Label>}
                >
                  {shown.map((e) => {
                    const item = cart.items.find((i) => i.extraId === e.id)
                    const steppable = item && e.unit !== 'per_person' && (e.maxQty || 5) > 1
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => loadExtra(e)}
                        style={[
                          styles.extra,
                          { borderColor: item ? c.ok : c.rule, backgroundColor: item ? c.sunk : c.plate },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 16 }}>{e.emoji}</Text>
                          <Text style={[styles.extraName, { color: c.ink }]}>{e.name}</Text>
                        </View>
                        <Text style={[styles.small, { color: c.inkFaint }]}>{e.description}</Text>
                        <View style={styles.extraFoot}>
                          <Text style={[styles.extraRate, { color: item ? c.ok : c.signal }]}>
                            {e.price === 0 ? 'FREE' : `${money(e.price)}${e.unit === 'per_person' ? ' per guest' : ''}`}
                          </Text>
                          {steppable ? (
                            <Stepper
                              c={c}
                              small
                              value={item.qty}
                              min={1}
                              max={e.maxQty || 5}
                              onChange={(q) => onQty(e.id, q)}
                            />
                          ) : null}
                        </View>
                      </Pressable>
                    )
                  })}
                  {all.length > SHELF_PREVIEW ? (
                    <Pressable onPress={() => setOpen({ ...open, [cat.id]: !isOpen })}>
                      <Text style={[styles.more, { color: c.shoal }]}>
                        {isOpen ? '− Show fewer' : `+ ${all.length - SHELF_PREVIEW} more in ${cat.label.toLowerCase()}`}
                      </Text>
                    </Pressable>
                  ) : null}
                </Plate>
              )
            })}

            <Plate c={c} title="Manifest" right={<Chip c={c} tone="signal">{quote ? `${quote.lines.length - 1} items` : 'Empty'}</Chip>}>
              {quote ? (
                <>
                  {quote.lines.map((l, i) => (
                    <View key={`${l.id}-${i}`} style={styles.mline}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.mlabel, { color: c.ink }]}>{l.label}</Text>
                        {l.detail ? (
                          <Text style={[styles.mdetail, { color: c.inkFaint }]}>{l.detail}</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.mamt, { color: c.ink }]}>{money(l.amount, quote.currency)}</Text>
                    </View>
                  ))}
                  <View style={[styles.totals, { borderTopColor: c.rule }]}>
                    <View style={styles.mline}>
                      <Text style={[styles.mlabel, { color: c.inkSoft }]}>Subtotal</Text>
                      <Text style={[styles.mamt, { color: c.inkSoft }]}>{money(quote.subtotal, quote.currency)}</Text>
                    </View>
                    {quote.discount ? (
                      <View style={styles.mline}>
                        <Text style={[styles.mlabel, { color: c.ok }]}>Promo {quote.couponCode}</Text>
                        <Text style={[styles.mamt, { color: c.ok }]}>−{money(quote.discount, quote.currency)}</Text>
                      </View>
                    ) : null}
                    <View style={styles.mline}>
                      <Text style={[styles.grand, { color: c.ink }]}>Total</Text>
                      <Text style={[styles.grand, { color: c.ink }]}>{money(quote.total, quote.currency)}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <Text style={[styles.small, { color: c.inkFaint }]}>Nothing loaded yet.</Text>
              )}

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="Promo code"
                  placeholderTextColor={c.inkFaint}
                  autoCapitalize="characters"
                  style={[styles.input, { flex: 1, color: c.ink, borderColor: c.rule, backgroundColor: c.plate }]}
                />
                <Button c={c} ghost onPress={() => onCoupon(code.trim())} style={{ paddingVertical: 9 }}>
                  Apply
                </Button>
              </View>
              {quoteError ? <Notice c={c}>{quoteError}</Notice> : null}
            </Plate>
          </>
        ) : null}
      </ScrollView>

      {quip ? (
        <View style={[styles.quip, { backgroundColor: c.deep, bottom: (quote ? 96 : 20) + insets.bottom }]} pointerEvents="none">
          <Text style={[styles.quipText, { color: c.onDeep }]}>{quip}</Text>
        </View>
      ) : null}

      {/* The total follows you down the page: on a phone the manifest cannot
          sit in a sticky column, so it becomes the bar you always see. */}
      {quote ? (
        <View style={[styles.bar, { backgroundColor: c.deep, paddingBottom: insets.bottom + 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.barTotal, { color: c.onDeep }]}>{money(quote.total, quote.currency)}</Text>
            <Text style={[styles.small, { color: c.onDeepSoft }]}>
              {money(quote.deposit, quote.currency)} holds the date · {quote.lines.length - 1} aboard
            </Text>
          </View>
          <Button c={c} onPress={onCheckout} style={{ paddingHorizontal: 20 }}>Review</Button>
        </View>
      ) : null}
    </View>
  )
}

/** The photo of whichever corner of the boat is carrying the most right now. */
function ZoneShot({ c, counts, lastZone, catalog }) {
  const busiest =
    ZONES.find((z) => z.id === lastZone && counts[z.id]) ||
    [...ZONES].sort((a, b) => counts[b.id] - counts[a.id])[0]
  if (!busiest || !counts[busiest.id]) return null
  const cat = catalog.categories.find((x) => x.id === busiest.category)
  if (!cat?.photo) return null
  return (
    <View style={[styles.zoneShot, { borderColor: c.rule }]}>
      <Image source={photo(cat.photo, API)} style={styles.zoneImg} resizeMode="cover" />
      <View style={styles.zoneCap}>
        <Text style={styles.zoneCapText}>
          {busiest.label} — {counts[busiest.id]} aboard
        </Text>
      </View>
    </View>
  )
}

function Stepper({ c, value, min, max, onChange, small }) {
  const btn = (txt, next, disabled) => (
    <Pressable
      onPress={() => {
        if (disabled) return
        Haptics.selectionAsync()
        onChange(next)
      }}
      disabled={disabled}
      style={[
        styles.stepBtn,
        small && { width: 26, height: 26 },
        { borderColor: c.rule, backgroundColor: c.plate, opacity: disabled ? 0.35 : 1 },
      ]}
    >
      <Text style={{ color: c.ink, fontFamily: mono, fontSize: small ? 13 : 16 }}>{txt}</Text>
    </Pressable>
  )
  return (
    <View style={[styles.stepper, { borderColor: c.rule }]}>
      {btn('−', value - 1, value <= min)}
      <Text style={[styles.stepVal, { color: c.ink }, small && { fontSize: 12, minWidth: 22 }]}>{value}</Text>
      {btn('+', value + 1, value >= max)}
    </View>
  )
}

const styles = StyleSheet.create({
  prose: { fontFamily: mono, fontSize: 12, lineHeight: 19 },
  small: { fontFamily: mono, fontSize: 11.5, lineHeight: 17 },
  package: { borderWidth: 1, borderRadius: 2, overflow: 'hidden' },
  packageImg: { width: '100%', height: 110 },
  extra: { borderWidth: 1, borderRadius: 2, padding: 11, gap: 5 },
  extraName: { fontFamily: mono, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  extraFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  extraRate: { fontFamily: mono, fontSize: 12 },
  more: { fontFamily: mono, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', paddingVertical: 4 },
  mline: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  mlabel: { fontFamily: mono, fontSize: 12 },
  mdetail: { fontFamily: mono, fontSize: 10.5, lineHeight: 15 },
  mamt: { fontFamily: mono, fontSize: 12 },
  totals: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  grand: { fontFamily: mono, fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 10, paddingVertical: 9, fontFamily: mono, fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 2, alignSelf: 'flex-start' },
  stepBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  stepVal: { fontFamily: mono, fontSize: 14, minWidth: 30, textAlign: 'center' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 10,
  },
  barTotal: { fontFamily: mono, fontSize: 19, fontWeight: '700' },
  quip: {
    position: 'absolute', left: 16, right: 16, borderRadius: 2,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  quipText: { fontFamily: mono, fontSize: 12.5, textAlign: 'center' },
  zoneShot: { borderWidth: 1, borderRadius: 2, overflow: 'hidden' },
  zoneImg: { width: '100%', height: 96 },
  zoneCap: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,20,27,0.82)', paddingHorizontal: 9, paddingVertical: 5 },
  zoneCapText: { fontFamily: mono, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: '#E4EDEC' },
})
