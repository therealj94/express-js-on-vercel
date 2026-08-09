// Same admiralty-chart language as the web app, rebuilt for a phone: monospace
// carries the data, the serif is rationed, magenta is the only loud colour.
import { Platform } from 'react-native'

export const light = {
  chart: '#E4E9E3',
  plate: '#F3F5F1',
  sunk: '#DAE1DB',
  ink: '#082830',
  inkSoft: '#3B5559',
  inkFaint: '#6B8388',
  rule: '#C3CFC8',
  deep: '#072A38',
  shoal: '#17607E',
  signal: '#B4246B',
  signalSoft: '#F6DDE9',
  ok: '#1F6B4F',
  onDeep: '#E4EDEC',
  onDeepSoft: '#8DAAB0',
}

export const dark = {
  chart: '#04161D',
  plate: '#08242E',
  sunk: '#0C2E3A',
  ink: '#DFEBE9',
  inkSoft: '#9FBBBE',
  inkFaint: '#718D93',
  rule: '#1B3F4B',
  deep: '#020D12',
  shoal: '#3E93AE',
  signal: '#F0619E',
  signalSoft: '#3B1226',
  ok: '#4CAE86',
  onDeep: '#DFEBE9',
  onDeepSoft: '#86A2A8',
}

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })

export const money = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0)

export const label = (c) => ({
  fontFamily: mono,
  fontSize: 10,
  letterSpacing: 1.8,
  textTransform: 'uppercase',
  color: c.inkFaint,
})
