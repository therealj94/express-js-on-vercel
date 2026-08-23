import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'

// The app's voice.
//
// Five short synthesised tones (roatan-yacht/scripts/make-sounds.py), all in
// the same key so they sound like one instrument rather than a pile of stock
// effects. The important one is `success`: paying should feel like something
// happened, and a rising arpeggio is what "that worked" sounds like.
//
// Two rules run through this file:
//   1. Sound is never load-bearing. Every call is wrapped, and a device that
//      refuses to play audio must not take a screen down with it.
//   2. It ducks, it does not hijack. Someone playing music while they book a
//      boat keeps their music.

const KEY = 'roatan.sound'

const FILES = {
  success: require('../assets/sound/success.m4a'),
  aboard: require('../assets/sound/aboard.m4a'),
  pop: require('../assets/sound/pop.m4a'),
  off: require('../assets/sound/off.m4a'),
  tap: require('../assets/sound/tap.m4a'),
}

// Relative loudness, mixed by ear: a button tick should be barely there, an
// approved payment should be the loudest thing the app ever does.
const VOLUME = { success: 1.0, aboard: 0.85, pop: 0.6, off: 0.5, tap: 0.28 }

const players = {}
let on = true
let ready = false

/** Called once at start-up. Never throws. */
export async function initSound() {
  try {
    const saved = await AsyncStorage.getItem(KEY)
    on = saved !== 'off'
  } catch {
    on = true
  }
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,      // the phone's silent switch wins, as it should
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
      interruptionModeAndroid: 'duckOthers',
    })
  } catch {
    // Older or stricter runtime: the defaults are fine, carry on.
  }
  try {
    for (const [name, file] of Object.entries(FILES)) {
      const p = createAudioPlayer(file)
      p.volume = VOLUME[name] ?? 0.7
      players[name] = p
    }
    ready = true
  } catch {
    ready = false
  }
}

export function soundIsOn() {
  return on
}

export async function setSoundOn(next) {
  on = Boolean(next)
  try {
    await AsyncStorage.setItem(KEY, on ? 'on' : 'off')
  } catch { /* a preference that failed to save is not worth an error */ }
}

/**
 * Play one of the five. Rewinding first is what lets the same tick fire on
 * three fast taps instead of only the first.
 */
export function play(name) {
  if (!on || !ready) return
  const p = players[name]
  if (!p) return
  try {
    p.seekTo(0)
    p.play()
  } catch { /* never let a sound take a screen down */ }
}

export const tap = () => play('tap')
