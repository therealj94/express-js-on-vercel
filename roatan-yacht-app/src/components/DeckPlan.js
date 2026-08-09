import React, { useEffect, useRef } from 'react'
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native'
import Svg, { Path, Rect, Line, Circle, Defs, ClipPath, G } from 'react-native-svg'
import { mono } from '../theme'

// Fore to aft, the way the boat actually runs. An extra is not a line in a
// cart — it is cargo, and it belongs somewhere.
export const ZONES = [
  { id: 'platform', category: 'adventure', label: 'Swim platform', x: 8, w: 62 },
  { id: 'cockpit', category: 'comfort', label: 'Cockpit', x: 70, w: 90 },
  { id: 'saloon', category: 'eat_drink', label: 'Galley', x: 160, w: 90 },
  { id: 'cabin', category: 'celebrate', label: 'Cabin', x: 250, w: 102 },
]

export const zoneFor = (category) => ZONES.find((z) => z.category === category) || ZONES[1]

const HULL =
  'M18 12 L236 12 C288 18 326 36 348 62 C326 88 288 106 236 112 L18 112 C11 112 6 106 6 99 L6 25 C6 18 11 12 18 12 Z'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/**
 * @param {{counts: Record<string, number>, lastZone: string|null, c: object,
 *          onZonePress?: (zoneId: string) => void}} props
 */
export default function DeckPlan({ counts, lastZone, c, onZonePress }) {
  // A pulse on the zone that just took something, so the eye follows the cargo
  // to where it was stowed rather than hunting for what changed.
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!lastZone) return
    pulse.setValue(0)
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(pulse, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start()
  }, [lastZone, counts[lastZone], pulse])

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] })

  return (
    <View>
      <Svg viewBox="0 0 360 124" width="100%" height={124} accessibilityLabel="Deck plan">
        <Defs>
          <ClipPath id="hull">
            <Path d={HULL} />
          </ClipPath>
        </Defs>

        {ZONES.map((z) => {
          const n = counts[z.id] || 0
          return (
            <G key={z.id}>
              <Rect
                x={z.x} y={0} width={z.w} height={124}
                fill={n ? c.signalSoft : c.sunk}
                clipPath="url(#hull)"
              />
              <Line
                x1={z.x + z.w} y1={6} x2={z.x + z.w} y2={118}
                stroke={c.rule} strokeWidth={1} clipPath="url(#hull)"
              />
              {n > 0 && (
                <>
                  {z.id === lastZone ? (
                    <AnimatedCircle
                      cx={z.x + z.w / 2} cy={62} r={13} fill={c.signal}
                      style={{ transform: [{ scale }] }}
                    />
                  ) : (
                    <Circle cx={z.x + z.w / 2} cy={62} r={13} fill={c.signal} />
                  )}
                </>
              )}
            </G>
          )
        })}

        <Line x1={6} y1={62} x2={348} y2={62} stroke={c.rule} strokeWidth={1} strokeDasharray="3 6" />
        <Path d={HULL} fill="none" stroke={c.ink} strokeWidth={1.6} strokeLinejoin="round" />
      </Svg>

      {/* The counts ride above the SVG as real text so they scale with the
          system font size instead of being baked into the drawing. */}
      <View style={styles.badges} pointerEvents="none">
        {ZONES.map((z) => (
          <View key={z.id} style={[styles.badgeSlot, { flex: z.w }]}>
            {counts[z.id] ? (
              <Text style={[styles.badge, { color: '#fff' }]}>{counts[z.id]}</Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.strip}>
        {ZONES.map((z) => {
          const n = counts[z.id] || 0
          return (
            <Pressable
              key={z.id}
              onPress={() => onZonePress?.(z.id)}
              style={[styles.tab, { borderTopColor: n ? c.signal : c.rule }]}
            >
              <Text style={[styles.tabLabel, { color: n ? c.ink : c.inkFaint }]} numberOfLines={2}>
                {z.label}
              </Text>
              <Text style={[styles.tabCount, { color: n ? c.signal : c.inkFaint }]}>
                {n ? `${n} aboard` : '—'}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  badges: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 124,
    flexDirection: 'row', alignItems: 'center',
  },
  badgeSlot: { alignItems: 'center', justifyContent: 'center' },
  badge: { fontFamily: mono, fontSize: 14, fontWeight: '700' },
  strip: { flexDirection: 'row', gap: 4, marginTop: 6 },
  tab: { flex: 1, borderTopWidth: 2, paddingTop: 5, gap: 1 },
  tabLabel: { fontFamily: mono, fontSize: 9, letterSpacing: 1.1, textTransform: 'uppercase' },
  tabCount: { fontFamily: mono, fontSize: 11 },
})
