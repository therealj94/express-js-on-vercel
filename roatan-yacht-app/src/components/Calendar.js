import React, { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { mono } from '../theme'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const iso = (d) => d.toISOString().slice(0, 10)

export function spanDates(start, nights) {
  const out = []
  const d0 = new Date(`${start}T12:00:00Z`)
  for (let i = 0; i < Math.max(1, nights || 1); i++) {
    const d = new Date(d0)
    d.setUTCDate(d.getUTCDate() + i)
    out.push(iso(d))
  }
  return out
}

/**
 * @param {{unavailable: Set<string>, value: string, nights: number, c: object,
 *          onPick: (date: string) => void}} props
 */
export default function Calendar({ unavailable, value, nights, c, onPick }) {
  const today = iso(new Date())
  const [month, setMonth] = useState(() => {
    const base = value ? new Date(`${value}T12:00:00Z`) : new Date()
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1))
  })

  // A multi-night package needs its whole span clear, not just its first day.
  const canStart = (day) => {
    if (day < today) return false
    return spanDates(day, nights).every((d) => !unavailable.has(d))
  }

  const cells = useMemo(() => {
    const first = new Date(month)
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    const out = []
    for (let i = 0; i < first.getUTCDay(); i++) out.push(null)
    for (let day = 1; day <= days; day++) {
      out.push(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day))))
    }
    return out
  }, [month])

  const chosen = new Set(value ? spanDates(value, nights) : [])

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Text style={[styles.month, { color: c.inkFaint }]}>
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[-1, 1].map((step) => (
            <Pressable
              key={step}
              accessibilityLabel={step < 0 ? 'Previous month' : 'Next month'}
              onPress={() =>
                setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + step, 1)))
              }
              style={[styles.nav, { borderColor: c.rule }]}
            >
              <Text style={{ color: c.ink, fontFamily: mono }}>{step < 0 ? '←' : '→'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.grid}>
        {DOW.map((d, i) => (
          <Text key={i} style={[styles.dow, { color: c.inkFaint }]}>{d}</Text>
        ))}
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.cell} />
          const taken = unavailable.has(day)
          const open = canStart(day)
          const isChosen = day === value
          const spanned = !isChosen && chosen.has(day)
          return (
            <Pressable
              key={day}
              disabled={!open}
              onPress={() => onPick(day)}
              accessibilityLabel={day}
              style={[
                styles.cell,
                {
                  backgroundColor: isChosen
                    ? c.signal
                    : spanned
                      ? c.signalSoft
                      : open
                        ? c.sunk
                        : 'transparent',
                  opacity: open ? 1 : 0.45,
                },
              ]}
            >
              <Text
                style={[
                  styles.day,
                  {
                    color: isChosen ? '#fff' : taken ? c.inkFaint : c.ink,
                    textDecorationLine: taken ? 'line-through' : 'none',
                  },
                ]}
              >
                {Number(day.slice(8))}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontFamily: mono, fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase' },
  nav: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 10, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: {
    width: `${100 / 7}%`, textAlign: 'center', fontFamily: mono, fontSize: 9,
    letterSpacing: 1, textTransform: 'uppercase', paddingVertical: 4,
  },
  cell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 2, borderWidth: 1, borderColor: 'transparent',
  },
  day: { fontFamily: mono, fontSize: 13 },
})
