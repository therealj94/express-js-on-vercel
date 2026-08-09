import React from 'react'
import { View, Text, ScrollView, Pressable, Image, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { mono, serif, money } from '../theme'
import { photo } from '../images'
import { API } from '../api'
import { Label, Chip, Serif } from '../components/ui'

const OCCASIONS = [
  { id: 'proposal', label: 'A proposal', bundle: 'b_proposal' },
  { id: 'anniversary', label: 'An anniversary', bundle: 'b_anniversary' },
  { id: 'birthday', label: 'A birthday', extras: ['x_cake', 'x_champagne'] },
  { id: 'family', label: 'With the kids', bundle: 'b_family' },
  { id: 'nothing', label: 'Just the water', extras: [] },
]

export default function FleetScreen({ c, catalog, cart, onOccasion, onPickVessel, insets }) {
  return (
    <ScrollView
      style={{ backgroundColor: c.chart }}
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Image source={photo('/media/knotty-stern', API)} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(4,20,27,0.72)', 'rgba(4,20,27,0.88)', 'rgba(4,20,27,0.96)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.heroBody, { paddingTop: insets.top + 26 }]}>
          <Text style={[styles.coords, { color: '#8DAAB0' }]}>16°23'N 86°26'W · ROATÁN</Text>
          <Text style={styles.heroTitle}>Knotty is yours.{'\n'}So is the day.</Text>
          <Text style={styles.heroLede}>
            Private charters out of French Harbour. Pick a vessel, then load it with what you
            actually want aboard.
          </Text>

          <Text style={[styles.coords, { color: '#8DAAB0', marginTop: 6 }]}>Start with the occasion</Text>
          <View style={styles.occasions}>
            {OCCASIONS.map((o) => {
              const on = cart.occasion === o.id
              return (
                <Pressable
                  key={o.id}
                  onPress={() => {
                    Haptics.selectionAsync()
                    onOccasion(o)
                  }}
                  style={[
                    styles.occasion,
                    { borderColor: on ? c.signal : 'rgba(255,255,255,0.24)', backgroundColor: on ? c.signal : 'rgba(255,255,255,0.06)' },
                  ]}
                >
                  <Text style={[styles.occasionText, { color: '#fff' }]}>{o.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>

      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Label c={c} signal>Plate 01 — The fleet</Label>
          <Serif c={c} size={21}>Five ways to spend a day, or a week</Serif>
          <Text style={[styles.prose, { color: c.inkSoft }]}>
            Every charter is private. No strangers on your boat, no fixed schedule. Day charters run
            eight hours; the packages live aboard.
          </Text>
        </View>

        {catalog.vessels.map((v) => {
          const chosen = cart.vesselId === v.id
          return (
            <Pressable
              key={v.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                onPickVessel(v)
              }}
              style={[
                styles.vessel,
                { backgroundColor: c.plate, borderColor: chosen ? c.signal : c.rule },
              ]}
            >
              <View style={styles.vesselArt}>
                <Image source={photo(v.photo, API)} style={styles.vesselImg} resizeMode="cover" />
                {v.boatName ? (
                  <View style={[styles.stamp, { backgroundColor: c.deep }]}>
                    <Text style={[styles.stampText, { color: c.onDeep }]}>{v.boatName}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ padding: 14, gap: 7 }}>
                <Label c={c}>{v.durationLabel} · {v.capacityMin}–{v.capacityMax} guests</Label>
                <Text style={[styles.vesselName, { color: c.ink }]}>{v.name}</Text>
                <Text style={[styles.prose, { color: c.inkSoft }]}>{v.tagline}</Text>
                <View style={[styles.vesselFoot, { borderTopColor: c.rule }]}>
                  <Text style={[styles.rate, { color: c.signal }]}>
                    {money(v.basePrice)}
                    {v.priceUnit === 'per_night' ? (
                      <Text style={[styles.perNight, { color: c.inkFaint }]}> / night</Text>
                    ) : null}
                  </Text>
                  <Chip c={c} tone={chosen ? 'ok' : 'shoal'}>{chosen ? 'Chosen' : 'Choose'}</Chip>
                </View>
              </View>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  hero: { minHeight: 380, justifyContent: 'flex-end' },
  heroBody: { padding: 18, gap: 12, paddingBottom: 26 },
  coords: { fontFamily: mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
  heroTitle: { fontFamily: serif, fontSize: 34, lineHeight: 38, color: '#E4EDEC', letterSpacing: -0.8 },
  heroLede: { fontFamily: mono, fontSize: 12.5, lineHeight: 20, color: '#8DAAB0' },
  occasions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  occasion: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 8 },
  occasionText: { fontFamily: mono, fontSize: 11.5 },
  prose: { fontFamily: mono, fontSize: 12, lineHeight: 19 },
  vessel: { borderWidth: 1, borderRadius: 2, overflow: 'hidden' },
  vesselArt: { height: 168, backgroundColor: '#072A38' },
  vesselImg: { width: '100%', height: '100%' },
  stamp: { position: 'absolute', left: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 4 },
  stampText: { fontFamily: mono, fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase' },
  vesselName: { fontFamily: serif, fontSize: 17, lineHeight: 21 },
  vesselFoot: {
    borderTopWidth: 1, paddingTop: 10, marginTop: 3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  rate: { fontFamily: mono, fontSize: 16 },
  perNight: { fontFamily: mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase' },
})
