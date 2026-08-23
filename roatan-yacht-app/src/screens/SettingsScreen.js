import React, { useState } from 'react'
import { View, Text, ScrollView, TextInput, StyleSheet, Alert, Switch } from 'react-native'
import * as Updates from 'expo-updates'
import { mono } from '../theme'
import { apiUrl, builtInUrl, setApiUrl, testConnection } from '../api'
import { Plate, Label, Button, Notice, Serif } from '../components/ui'
import { soundIsOn, setSoundOn, play } from '../sound'

export default function SettingsScreen({ c, catalog, account, onSaved, onReplayIntro, onSignOut, insets }) {
  const goBack = () => onSaved()
  const [url, setUrl] = useState(apiUrl())
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [sound, setSound] = useState(soundIsOn())

  async function test() {
    setBusy(true)
    setResult(await testConnection(url))
    setBusy(false)
  }

  async function save() {
    await setApiUrl(url)
    onSaved()
  }

  // Over-the-air updates only do anything once the project has been linked to
  // an Expo account and an update published. Say which of those is missing
  // rather than spinning forever.
  async function checkForUpdate() {
    if (__DEV__ || !Updates.isEnabled) {
      Alert.alert('Updates are off', 'This build was not configured for over-the-air updates.')
      return
    }
    setChecking(true)
    try {
      const check = await Updates.checkForUpdateAsync()
      if (!check.isAvailable) {
        Alert.alert('Up to date', 'This phone already has the newest version.')
        return
      }
      await Updates.fetchUpdateAsync()
      Alert.alert('Update ready', 'Restart the app to use it?', [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart', onPress: () => Updates.reloadAsync() },
      ])
    } catch (err) {
      Alert.alert('Could not check', err.message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.chart }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40, gap: 14 }}
    >
      <View style={{ gap: 6 }}>
        <Label c={c} signal>Settings</Label>
        <Serif c={c} size={21}>Where the app books</Serif>
      </View>

      <Plate c={c} title="Sound">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.small, { color: c.inkSoft }]}>
              Ticks when you press, a chime when a payment goes through. It ducks under your music
              and obeys the phone's silent switch.
            </Text>
          </View>
          <Switch
            value={sound}
            onValueChange={async (v) => {
              setSound(v)
              await setSoundOn(v)
              // Turning it on should prove it works.
              if (v) play('success')
            }}
            trackColor={{ true: c.signal, false: c.rule }}
            thumbColor={c.plate}
          />
        </View>
      </Plate>

      <Plate c={c} title="You">
        <Text style={[styles.small, { color: c.inkSoft }]}>
          {account?.guest || !account?.email
            ? 'Looking around as a guest. Sign in and the checkout fills itself in.'
            : `Signed in as ${account.name || account.email}${account.name ? ` · ${account.email}` : ''}.`}
        </Text>
        <Button c={c} ghost onPress={onReplayIntro}>Watch the intro again</Button>
        <Button c={c} ghost onPress={onSignOut}>
          {account?.guest || !account?.email ? 'Sign in or create an account' : 'Sign out'}
        </Button>
      </Plate>

      <Plate c={c} title="Booking server">
        <Text style={[styles.small, { color: c.inkSoft }]}>
          The address of your booking site. Change it here when the site moves and every phone
          follows — no new APK, no reinstalling.
        </Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://your-site.com"
          placeholderTextColor={c.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, { color: c.ink, borderColor: c.rule, backgroundColor: c.plate }]}
        />
        <Text style={[styles.small, { color: c.inkFaint }]}>
          Built into this APK: {builtInUrl() || 'nothing'}
        </Text>

        {result ? <Notice c={c} tone={result.ok ? 'ok' : 'signal'}>{result.message}</Notice> : null}

        <Button c={c} ghost busy={busy} onPress={test}>Test the connection</Button>
        <Button c={c} onPress={save}>Save and reload</Button>
      </Plate>

      <Plate c={c} title="Catalogue">
        <Notice c={c} tone={catalog.source === 'live' ? 'ok' : 'shoal'}>
          {catalog.source === 'live'
            ? 'Live from the server — prices and availability are current.'
            : `Using the copy that shipped with the app (captured ${catalog.capturedAt}). Boats, extras and prices show fine; dates and payment need the server.`}
        </Notice>
      </Plate>

      <Plate c={c} title="App version">
        <Text style={[styles.small, { color: c.inkSoft }]}>
          {Updates.isEnabled
            ? 'This build receives updates over the air. New versions arrive without reinstalling.'
            : 'This build does not receive over-the-air updates — a new APK is needed to change it.'}
        </Text>
        {Updates.updateId ? (
          <Text style={[styles.small, { color: c.inkFaint }]}>Update {Updates.updateId.slice(0, 8)}</Text>
        ) : null}
        <Button c={c} ghost busy={checking} onPress={checkForUpdate}>Check for updates</Button>
      </Plate>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  small: { fontFamily: mono, fontSize: 11.5, lineHeight: 17 },
  input: {
    borderWidth: 1, borderRadius: 2, paddingHorizontal: 11, paddingVertical: 10,
    fontFamily: mono, fontSize: 13,
  },
})
