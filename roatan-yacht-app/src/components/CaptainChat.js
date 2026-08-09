import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native'
import * as Haptics from 'expo-haptics'
import { sans, serif } from '../theme'

// Captain Milton, in the app.
//
// A booking confirmation that only shows a receipt leaves people wondering
// whether a human saw it. So the last screen is a conversation: the captain
// says hello by name, and every question a guest actually asks — what to
// bring, can we start earlier, do you have a ride — is one tap away with a
// real answer underneath it.
//
// The replies are scripted rather than live. That is stated on the screen, and
// the WhatsApp button is right there for anything the script does not cover.

const REPLIES = {
  bring: {
    ask: 'What should we bring? 🎒',
    say: (b) => [
      'Almost nothing, honestly.',
      'Swimsuit, a towel you like, reef-safe sunscreen (the reef is picky), and sunglasses you can afford to lose overboard.',
      `Water, ice, towels and the shade are already aboard. So is everything you added to ${b.vesselName}.`,
    ],
  },
  early: {
    ask: 'Can we start earlier? ⏰',
    say: () => [
      'We can usually push to 8:00 am.',
      'Morning water is glass — best snorkelling and best photographs of the day.',
      'Send me a message the night before and I will have the coffee on.',
    ],
  },
  ride: {
    ask: 'We might need a ride 🚐',
    say: () => [
      'Say no more — the van is part of what we do.',
      'Tell me where you are staying with the buttons above and I will put you on the list. Hotel, Airbnb or the cruise terminal, all the same to us.',
    ],
  },
  surprise: {
    ask: 'It is a surprise — help me 🤫',
    say: () => [
      'My favourite kind of charter.',
      'Tell me the moment you want and I will set it up: flowers already on the table, music cued, or the whole crew disappearing to the bow for ten minutes.',
      'Nobody has ever said no out there. Statistically speaking, you are fine.',
    ],
  },
  seaSick: {
    ask: 'One of us gets seasick 🤢',
    say: () => [
      'Very common, very fixable.',
      'We keep ginger chews and wristbands aboard, and inside the reef the water is flat — most people forget they were worried.',
      'Sit them at the back, looking at the island. Works every time.',
    ],
  },
  thanks: {
    ask: 'Perfect. See you there! 👋',
    say: (b) => [
      `See you at the dock, ${b.customer?.name?.split(' ')[0] || 'friend'}.`,
      'I will be the one in the hat pretending the boat is not already spotless.',
    ],
  },
}

const ORDER = ['bring', 'ride', 'early', 'surprise', 'seaSick', 'thanks']

export default function CaptainChat({ c, booking }) {
  const [log, setLog] = useState([])
  const [used, setUsed] = useState([])
  const [typing, setTyping] = useState(true)
  const queue = useRef([])
  const timer = useRef(null)

  const first = booking.customer?.name?.split(' ')[0] || 'friend'
  const when = booking.date
    ? new Date(`${booking.date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
      })
    : 'your day'

  // The captain gets in first, unprompted. Nobody should have to open a
  // conversation with the person they just paid.
  useEffect(() => {
    push([
      `Hola ${first} — Captain Milton here. I have you on ${booking.vesselName} for ${when}. 🧭`,
      'Everything you added is already on my list. Ask me anything before the day — I read these between charters.',
    ])
    return () => clearTimeout(timer.current)
  }, [])

  /** Queue captain lines and let them arrive one at a time, with a pause. */
  function push(lines) {
    queue.current = [...queue.current, ...lines]
    if (!timer.current) drain()
  }

  function drain() {
    const next = queue.current.shift()
    if (next === undefined) { setTyping(false); timer.current = null; return }
    setTyping(true)
    timer.current = setTimeout(() => {
      setLog((l) => [...l, { from: 'captain', text: next }])
      Haptics.selectionAsync()
      drain()
    }, Math.min(1400, 420 + next.length * 11))
  }

  function ask(id) {
    const r = REPLIES[id]
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setLog((l) => [...l, { from: 'me', text: r.ask }])
    setUsed((u) => [...u, id])
    push(r.say(booking))
  }

  const left = ORDER.filter((id) => !used.includes(id))

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.head}>
        <View style={[styles.avatar, { backgroundColor: c.deep }]}>
          <Text style={{ fontSize: 20 }}>🧑‍✈️</Text>
          <View style={[styles.online, { backgroundColor: c.ok, borderColor: c.plate }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.ink }]}>Captain Milton</Text>
          <Text style={[styles.status, { color: c.ok }]}>
            {typing ? 'typing…' : 'aboard · usually replies in an hour'}
          </Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        {log.map((m, i) => (
          <Bubble key={i} c={c} mine={m.from === 'me'} text={m.text} />
        ))}
        {typing ? <Typing c={c} /> : null}
      </View>

      {left.length && !typing ? (
        <View style={styles.chips}>
          {left.map((id) => (
            <Pressable
              key={id}
              onPress={() => ask(id)}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: c.signal, backgroundColor: pressed ? c.signalSoft : 'transparent' },
              ]}
            >
              <Text style={[styles.chipText, { color: c.signal }]}>{REPLIES[id].ask}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!left.length && !typing ? (
        <Text style={[styles.exhausted, { color: c.inkFaint }]}>
          That is everything the captain keeps a canned answer for. Anything else, WhatsApp him
          below — that one reaches a real phone.
        </Text>
      ) : null}
    </View>
  )
}

function Bubble({ c, mine, text }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start()
  }, [a])
  return (
    <Animated.View
      style={{
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
      }}
    >
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: c.signal, borderBottomRightRadius: 6 }
            : { backgroundColor: c.sunk, borderBottomLeftRadius: 6 },
        ]}
      >
        <Text style={[styles.bubbleText, { color: mine ? '#fff' : c.ink }]}>{text}</Text>
      </View>
    </Animated.View>
  )
}

function Typing({ c }) {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current]
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 320, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 320, easing: Easing.ease, useNativeDriver: true }),
          Animated.delay(320 - i * 160),
        ]),
      ),
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [])
  return (
    <View style={[styles.bubble, { backgroundColor: c.sunk, alignSelf: 'flex-start', flexDirection: 'row', gap: 5 }]}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.inkFaint, opacity: d }} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  online: {
    position: 'absolute', right: -1, bottom: -1, width: 13, height: 13,
    borderRadius: 7, borderWidth: 2.5,
  },
  name: { fontFamily: serif, fontSize: 17, letterSpacing: -0.3 },
  status: { fontFamily: sans, fontSize: 11.5, marginTop: 1 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleText: { fontFamily: sans, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
  chip: { borderWidth: 1.3, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  chipText: { fontFamily: sans, fontSize: 12.5, fontWeight: '600' },
  exhausted: { fontFamily: sans, fontSize: 12, lineHeight: 17 },
})
