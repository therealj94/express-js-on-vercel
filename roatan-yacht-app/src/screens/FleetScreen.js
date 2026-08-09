import React, { useRef, useState } from 'react'
import {
  View, Text, Pressable, Image, StyleSheet, FlatList, Dimensions, Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { serif, sans, money, shadow } from '../theme'
import { photo } from '../images'
import { API } from '../api'

// Full-bleed boat cards you swipe through like a deck of postcards. One boat
// fills the screen at a time — the photograph does the selling.

const { width: W } = Dimensions.get('window')
const CARD_W = W - 48

const OCCASIONS = [
  { id: 'proposal', label: '💍 Proposal', bundle: 'b_proposal' },
  { id: 'anniversary', label: '🌹 Anniversary', bundle: 'b_anniversary' },
  { id: 'birthday', label: '🎂 Birthday', extras: ['x_cake', 'x_champagne'] },
  { id: 'family', label: '👨‍👩‍👧 Family day', bundle: 'b_family' },
  { id: 'nothing', label: '🌊 Just the sea', extras: [] },
]

export default function FleetScreen({ c, catalog, cart, insets, onOccasion, onPickVessel, onMyBooking, onSettings }) {
  const [page, setPage] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current

  return (
    <View style={[styles.root, { backgroundColor: c.deep }]}>
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={[styles.kicker, { color: c.onDeepSoft }]}>ROATÁN · BAY ISLANDS</Text>
          <Text style={[styles.title, { color: c.onDeep }]}>Pick your boat.</Text>
          <Text style={[styles.subtitle, { color: c.onDeepSoft }]}>The day is already yours.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={onMyBooking} style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Text style={{ fontSize: 16 }}>🎟️</Text>
          </Pressable>
          <Pressable onPress={onSettings} style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Text style={{ fontSize: 16 }}>⚙️</Text>
          </Pressable>
        </View>
      </View>

      {/* occasion row */}
      <FlatList
        horizontal
        data={OCCASIONS}
        keyExtractor={(o) => o.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 12 }}
        style={{ flexGrow: 0 }}
        renderItem={({ item: o }) => {
          const on = cart.occasion === o.id
          return (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); onOccasion(o) }}
              style={[
                styles.occasion,
                { backgroundColor: on ? c.signal : 'rgba(255,255,255,0.1)' },
              ]}
            >
              <Text style={{ fontFamily: sans, fontSize: 13, fontWeight: on ? '700' : '500', color: '#fff' }}>
                {o.label}
              </Text>
            </Pressable>
          )
        }}
      />

      {/* boat carousel */}
      <Animated.FlatList
        data={catalog.vessels}
        keyExtractor={(v) => v.id}
        horizontal
        snapToInterval={CARD_W + 16}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 16, alignItems: 'center' }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
          listener: (e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 16))),
        })}
        renderItem={({ item: v, index }) => {
          const inputRange = [(index - 1) * (CARD_W + 16), index * (CARD_W + 16), (index + 1) * (CARD_W + 16)]
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.93, 1, 0.93], extrapolate: 'clamp' })
          return (
            <Animated.View style={[styles.card, { transform: [{ scale }] }, shadow]}>
              <Image source={photo(v.photo, API)} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(2,13,18,0.25)', 'rgba(2,13,18,0.92)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cardBody}>
                {v.boatName ? (
                  <View style={styles.nameTag}>
                    <Text style={styles.nameTagText}>{v.boatName.toUpperCase()}</Text>
                  </View>
                ) : null}
                <Text style={styles.cardTitle}>{v.name}</Text>
                <Text style={styles.cardTag} numberOfLines={2}>{v.tagline}</Text>
                <View style={styles.cardFoot}>
                  <View>
                    <Text style={styles.cardPrice}>
                      {money(v.basePrice)}
                      <Text style={styles.cardPer}>{v.priceUnit === 'per_night' ? ' /night' : ''}</Text>
                    </Text>
                    <Text style={styles.cardMeta}>{v.durationLabel} · up to {v.capacityMax} guests</Text>
                  </View>
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPickVessel(v) }}
                    style={({ pressed }) => [styles.go, { backgroundColor: c.signal, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={styles.goText}>Let's go →</Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          )
        }}
      />

      {/* page dots */}
      <View style={[styles.dots, { paddingBottom: insets.bottom + 18 }]}>
        {catalog.vessels.map((v, i) => (
          <View
            key={v.id}
            style={[
              styles.dot,
              { backgroundColor: i === page ? c.signal : 'rgba(255,255,255,0.25)', width: i === page ? 22 : 7 },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 24 },
  kicker: { fontFamily: sans, fontSize: 10.5, fontWeight: '800', letterSpacing: 2.5 },
  title: { fontFamily: serif, fontSize: 34, letterSpacing: -0.8, marginTop: 6 },
  subtitle: { fontFamily: sans, fontSize: 14.5, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  occasion: { borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9 },
  // The photographs are cut 3:4. Letting the card stretch to whatever height
  // the screen has left made `cover` scale them up and slice most of the frame
  // away — boats lost their bows. Pinning the card to the crop's own shape is
  // what actually fixes the framing; the crop file only helps if the container
  // agrees with it.
  card: { width: CARD_W, aspectRatio: 3 / 4, borderRadius: 28, overflow: 'hidden', justifyContent: 'flex-end' },
  cardBody: { padding: 22, gap: 5 },
  nameTag: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, marginBottom: 4,
  },
  nameTagText: { fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: '#072A38' },
  cardTitle: { fontFamily: serif, fontSize: 24, lineHeight: 28, color: '#fff', letterSpacing: -0.5 },
  cardTag: { fontFamily: sans, fontSize: 13.5, lineHeight: 19, color: 'rgba(255,255,255,0.85)' },
  cardFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 },
  cardPrice: { fontFamily: sans, fontSize: 24, fontWeight: '800', color: '#fff' },
  cardPer: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  cardMeta: { fontFamily: sans, fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  go: { borderRadius: 999, paddingHorizontal: 20, paddingVertical: 13 },
  goText: { fontFamily: sans, fontSize: 14.5, fontWeight: '800', color: '#fff' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 16 },
  dot: { height: 7, borderRadius: 4 },
})
