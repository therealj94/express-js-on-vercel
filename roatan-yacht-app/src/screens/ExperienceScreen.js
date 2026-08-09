import React, { useMemo, useRef, useState, useEffect } from 'react'
import {
  View, Text, Pressable, StyleSheet, Animated, PanResponder, Modal, ScrollView, Dimensions,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { mono, serif, sans, money, catColor, shadow } from '../theme'
import { quipFor, MILESTONES, EMPTY_HINTS } from '../fun'

// The screen the whole app exists for. Services are icons; you pick one up
// with your finger and drop it into your experience. No lists, no forms —
// packing for a trip, because that is what it is.

const BUBBLE = 64
const { height: SCREEN_H } = Dimensions.get('window')

const TABS = [
  { id: 'bundles', label: 'Packages', emoji: '⭐' },
  { id: 'celebrate', label: 'Celebrate', emoji: '💍' },
  { id: 'eat_drink', label: 'Eat & Drink', emoji: '🦞' },
  { id: 'adventure', label: 'Adventure', emoji: '🤿' },
  { id: 'comfort', label: 'Comfort', emoji: '🌴' },
]

export default function ExperienceScreen({
  c, catalog, cart, vessel, insets, runningTotal,
  onToggleExtra, onToggleBundle, onContinue, onBack,
}) {
  const [tab, setTab] = useState('bundles')
  const [detail, setDetail] = useState(null) // { kind, item }
  const [quip, setQuip] = useState(null)

  // Drag state: which item is under the finger, and where the finger is. The
  // clone follows on the native driver; the drop test uses the tray's top.
  const [dragging, setDragging] = useState(null)
  const dragPos = useRef(new Animated.ValueXY()).current
  const dragScale = useRef(new Animated.Value(1)).current
  const trayTop = useRef(SCREEN_H - 160)
  const trayPulse = useRef(new Animated.Value(0)).current
  const overTray = useRef(false)

  const aboardIds = new Set([
    ...cart.items.map((i) => i.extraId),
    ...cart.bundleIds,
  ])
  const aboardCount = cart.items.length + cart.bundleIds.length

  useEffect(() => {
    if (!quip) return
    const t = setTimeout(() => setQuip(null), 2400)
    return () => clearTimeout(t)
  }, [quip])

  const celebrate = (category) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const next = aboardCount + 1
    setQuip(MILESTONES[next] || quipFor(category, next))
    trayPulse.setValue(0)
    Animated.sequence([
      Animated.timing(trayPulse, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(trayPulse, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start()
  }

  const addItem = (entry) => {
    const already = aboardIds.has(entry.item.id)
    if (!already) celebrate(entry.kind === 'bundle' ? 'celebrate' : entry.item.category)
    if (entry.kind === 'bundle') onToggleBundle(entry.item.id)
    else onToggleExtra(entry.item.id)
  }

  const removeItem = (entry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (entry.kind === 'bundle') onToggleBundle(entry.item.id)
    else onToggleExtra(entry.item.id)
  }

  // Hold an icon and it lifts off the shelf, exactly like rearranging apps on
  // a home screen. From the moment it lifts, the root owns every touch — the
  // ScrollView cannot steal the gesture halfway to the tray.
  const draggingRef = useRef(null)
  const grantedRef = useRef(false)

  const startDrag = (entry, pageX, pageY) => {
    draggingRef.current = entry
    grantedRef.current = false
    dragPos.setValue({ x: pageX - BUBBLE / 2, y: pageY - BUBBLE / 2 - 24 })
    setDragging(entry)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    dragScale.setValue(0.8)
    Animated.spring(dragScale, { toValue: 1.25, friction: 5, useNativeDriver: true }).start()
  }

  const endDrag = (pageY) => {
    const entry = draggingRef.current
    draggingRef.current = null
    grantedRef.current = false
    overTray.current = false
    setDragging(null)
    if (entry && pageY != null && pageY > trayTop.current) addItem(entry)
  }

  const rootPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: () => Boolean(draggingRef.current),
        onPanResponderGrant: () => { grantedRef.current = true },
        onPanResponderMove: (e) => {
          const { pageX, pageY } = e.nativeEvent
          dragPos.setValue({ x: pageX - BUBBLE / 2, y: pageY - BUBBLE / 2 - 24 })
          const over = pageY > trayTop.current
          if (over !== overTray.current) {
            overTray.current = over
            if (over) Haptics.selectionAsync()
            Animated.spring(dragScale, { toValue: over ? 0.95 : 1.25, friction: 5, useNativeDriver: true }).start()
          }
        },
        onPanResponderRelease: (e) => endDrag(e.nativeEvent.pageY),
        onPanResponderTerminate: () => endDrag(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aboardCount],
  )

  // Everything the current tab shows, bundles included as golden stars.
  const entries = useMemo(() => {
    if (tab === 'bundles') return catalog.bundles.map((b) => ({ kind: 'bundle', item: b }))
    return catalog.extras
      .filter((e) => e.category === tab)
      .map((e) => ({ kind: 'extra', item: e }))
  }, [catalog, tab])

  const aboardEntries = [
    ...cart.bundleIds
      .map((id) => catalog.bundles.find((b) => b.id === id))
      .filter(Boolean)
      .map((b) => ({ kind: 'bundle', item: b })),
    ...cart.items
      .map((i) => catalog.extras.find((e) => e.id === i.extraId))
      .filter(Boolean)
      .map((e) => ({ kind: 'extra', item: e })),
  ]

  const trayScale = trayPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] })

  return (
    <View style={[styles.root, { backgroundColor: c.chart }]} {...rootPan.panHandlers}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={[styles.roundBtn, { backgroundColor: c.plate, ...shadow }]}>
          <Text style={{ fontSize: 17, color: c.ink }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerKicker, { color: c.signal }]}>BUILD YOUR DAY</Text>
          <Text style={[styles.headerTitle, { color: c.ink }]} numberOfLines={1}>
            {vessel?.boatName || vessel?.name}
          </Text>
        </View>
        <View style={[styles.countPill, { backgroundColor: c.deep }]}>
          <Text style={{ fontFamily: sans, fontSize: 13, fontWeight: '700', color: c.onDeep }}>
            {aboardCount}
          </Text>
        </View>
      </View>

      <Text style={[styles.hint, { color: c.inkFaint }]}>
        Hold an icon to pick it up, drop it into your day — tap to peek inside
      </Text>

      {/* category tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const on = tab === t.id
          return (
            <Pressable
              key={t.id}
              onPress={() => { Haptics.selectionAsync(); setTab(t.id) }}
              style={[
                styles.tab,
                { backgroundColor: on ? catColor[t.id] : c.plate, ...(on ? shadow : null) },
              ]}
            >
              <Text style={{ fontSize: 18 }}>{t.emoji}</Text>
              <Text style={[styles.tabLabel, { color: on ? '#fff' : c.inkSoft }]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {/* icon grid */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.grid}
        scrollEnabled={!dragging}
        showsVerticalScrollIndicator={false}
      >
        {entries.map((en) => {
          const on = aboardIds.has(en.item.id)
          const color = en.kind === 'bundle' ? catColor.bundles : catColor[en.item.category]
          return (
            <View key={en.item.id} style={styles.cell}>
              <Pressable
                delayLongPress={160}
                onLongPress={(e) => startDrag(en, e.nativeEvent.pageX, e.nativeEvent.pageY)}
                onPressOut={() => {
                  // Lifted but never moved: the root pan was never granted, so
                  // its release will not fire. Drop the ghost here.
                  setTimeout(() => { if (draggingRef.current && !grantedRef.current) endDrag(null) }, 60)
                }}
                onPress={() => { Haptics.selectionAsync(); setDetail(en) }}
                style={({ pressed }) => [
                  styles.bubble,
                  {
                    backgroundColor: on ? color : c.plate,
                    borderColor: on ? color : 'transparent',
                    transform: [{ scale: pressed ? 0.93 : 1 }],
                    opacity: dragging?.item.id === en.item.id ? 0.3 : 1,
                    ...shadow,
                  },
                ]}
              >
                <Text style={{ fontSize: 26 }}>{en.item.emoji}</Text>
                {on ? (
                  <View style={[styles.tick, { backgroundColor: c.ok }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓</Text>
                  </View>
                ) : null}
              </Pressable>
              <Text style={[styles.bubbleName, { color: on ? c.ink : c.inkSoft }]} numberOfLines={2}>
                {en.item.name}
              </Text>
              <Text style={[styles.bubblePrice, { color }]}>
                {en.kind === 'bundle'
                  ? `save ${en.item.discountPct}%`
                  : en.item.price === 0 ? 'FREE' : money(en.item.price)}
              </Text>
            </View>
          )
        })}
        <View style={{ height: 24 }} />
      </ScrollView>

      {quip ? (
        <View style={[styles.quip, { backgroundColor: c.deep }]} pointerEvents="none">
          <Text style={{ fontFamily: sans, fontSize: 13, color: c.onDeep, textAlign: 'center' }}>{quip}</Text>
        </View>
      ) : null}

      {/* the tray — your experience */}
      <Animated.View
        onLayout={(e) => {
          // measure in window: layout y is within parent; use a ref measure
        }}
        ref={(ref) => {
          if (ref) {
            ref.measureInWindow?.((x, y) => { if (y) trayTop.current = y })
            setTimeout(() => ref.measureInWindow?.((x, y) => { if (y) trayTop.current = y }), 300)
          }
        }}
        style={[
          styles.tray,
          {
            backgroundColor: c.deep,
            paddingBottom: insets.bottom + 12,
            transform: [{ scale: trayScale }],
            borderColor: dragging ? c.signal : 'transparent',
          },
        ]}
      >
        <View style={styles.trayHead}>
          <Text style={[styles.trayTitle, { color: c.onDeep }]}>
            {dragging ? 'Drop it right here 👇' : 'Your experience'}
          </Text>
          <Text style={[styles.trayTotal, { color: c.onDeep }]}>{money(runningTotal)}</Text>
        </View>

        {aboardEntries.length ? (
          <ScrollView horizontal showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {aboardEntries.map((en) => (
              <Pressable
                key={en.item.id}
                onPress={() => { Haptics.selectionAsync(); setDetail(en) }}
                onLongPress={() => removeItem(en)}
                style={[styles.trayBubble, { backgroundColor: en.kind === 'bundle' ? catColor.bundles : catColor[en.item.category] }]}
              >
                <Text style={{ fontSize: 20 }}>{en.item.emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.trayEmpty, { color: c.onDeepSoft }]}>
            {EMPTY_HINTS[cart.occasion] || 'Drag something good down here'}
          </Text>
        )}

        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onContinue() }}
          style={({ pressed }) => [
            styles.continueBtn,
            { backgroundColor: c.signal, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.continueText}>Continue — pick your date</Text>
        </Pressable>
      </Animated.View>

      {/* the floating clone under the finger */}
      {dragging ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.clone,
            {
              backgroundColor: dragging.kind === 'bundle' ? catColor.bundles : catColor[dragging.item.category],
              transform: [
                { translateX: dragPos.x },
                { translateY: dragPos.y },
                { scale: dragScale },
              ],
            },
          ]}
        >
          <Text style={{ fontSize: 28 }}>{dragging.item.emoji}</Text>
        </Animated.View>
      ) : null}

      {/* detail sheet */}
      <Modal visible={Boolean(detail)} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.sheetBack} onPress={() => setDetail(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.plate, paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
            {detail ? (
              <>
                <View style={[styles.sheetHandle, { backgroundColor: c.rule }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={[styles.sheetIcon, { backgroundColor: detail.kind === 'bundle' ? catColor.bundles : catColor[detail.item.category] }]}>
                    <Text style={{ fontSize: 30 }}>{detail.item.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sheetTitle, { color: c.ink }]}>{detail.item.name}</Text>
                    <Text style={[styles.sheetPrice, { color: c.signal }]}>
                      {detail.kind === 'bundle'
                        ? `Bundle — save ${detail.item.discountPct}%`
                        : detail.item.price === 0 ? 'FREE' : `${money(detail.item.price)}${detail.item.unit === 'per_person' ? ' per guest' : ''}`}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.sheetDesc, { color: c.inkSoft }]}>
                  {detail.kind === 'bundle' ? detail.item.tagline : detail.item.description}
                </Text>

                {detail.kind === 'bundle' ? (
                  <View style={{ gap: 6 }}>
                    <Text style={[styles.sheetSub, { color: c.inkFaint }]}>WHAT'S INSIDE</Text>
                    {detail.item.extraIds.map((id) => {
                      const e = catalog.extras.find((x) => x.id === id)
                      return e ? (
                        <Text key={id} style={{ fontFamily: sans, fontSize: 14, color: c.inkSoft }}>
                          {e.emoji}  {e.name}
                        </Text>
                      ) : null
                    })}
                  </View>
                ) : null}

                <Pressable
                  onPress={() => {
                    const was = aboardIds.has(detail.item.id)
                    if (was) removeItem(detail)
                    else addItem(detail)
                    setDetail(null)
                  }}
                  style={({ pressed }) => [
                    styles.sheetBtn,
                    {
                      backgroundColor: aboardIds.has(detail.item.id) ? c.sunk : c.signal,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.sheetBtnText, { color: aboardIds.has(detail.item.id) ? c.ink : '#fff' }]}>
                    {aboardIds.has(detail.item.id) ? 'Take it off the boat' : 'Add to my experience'}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerKicker: { fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  headerTitle: { fontFamily: serif, fontSize: 21, letterSpacing: -0.4 },
  countPill: { minWidth: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  hint: { fontFamily: sans, fontSize: 12.5, paddingHorizontal: 16, paddingBottom: 8 },
  tabs: { flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingBottom: 10 },
  tab: { flex: 1, borderRadius: 16, alignItems: 'center', paddingVertical: 8, gap: 2 },
  tabLabel: { fontFamily: sans, fontSize: 8.5, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingTop: 6 },
  cell: { width: '25%', alignItems: 'center', marginBottom: 14, paddingHorizontal: 3 },
  bubble: {
    width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  tick: {
    position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  bubbleName: { fontFamily: sans, fontSize: 10.5, textAlign: 'center', marginTop: 5, lineHeight: 13 },
  bubblePrice: { fontFamily: sans, fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  quip: {
    position: 'absolute', left: 20, right: 20, bottom: 210, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, ...shadow,
  },
  tray: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 2,
    paddingHorizontal: 18, paddingTop: 14, gap: 8,
  },
  trayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trayTitle: { fontFamily: sans, fontSize: 14, fontWeight: '700' },
  trayTotal: { fontFamily: sans, fontSize: 18, fontWeight: '800' },
  trayBubble: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  trayEmpty: { fontFamily: sans, fontSize: 12.5, paddingVertical: 8 },
  continueBtn: { borderRadius: 999, alignItems: 'center', paddingVertical: 15, marginTop: 4 },
  continueText: { fontFamily: sans, fontSize: 15, fontWeight: '800', color: '#fff' },
  clone: {
    position: 'absolute', width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2,
    alignItems: 'center', justifyContent: 'center', ...shadow,
  },
  sheetBack: { flex: 1, backgroundColor: 'rgba(2,13,18,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 16 },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 2 },
  sheetIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: serif, fontSize: 20, letterSpacing: -0.3 },
  sheetPrice: { fontFamily: sans, fontSize: 14, fontWeight: '700', marginTop: 2 },
  sheetDesc: { fontFamily: sans, fontSize: 14.5, lineHeight: 22 },
  sheetSub: { fontFamily: sans, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.6 },
  sheetBtn: { borderRadius: 999, alignItems: 'center', paddingVertical: 15 },
  sheetBtnText: { fontFamily: sans, fontSize: 15, fontWeight: '800' },
})
