import { Linking, Platform, Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { Company } from './types'

export async function shareCompany(company: Company) {
  await Share.share({
    message: `${company.tradeName} — ${company.description}\n\n${company.address}\n\nEncuéntralo en MyTokenPay.`,
    title: company.tradeName,
  })
}

export function openDirections(company: Company) {
  const label = encodeURIComponent(company.tradeName)
  const url = Platform.select({
    ios: `maps:0,0?q=${label}@${company.lat},${company.lng}`,
    android: `geo:0,0?q=${company.lat},${company.lng}(${label})`,
    default: `https://www.google.com/maps/search/?api=1&query=${company.lat},${company.lng}`,
  })
  if (url) Linking.openURL(url).catch(() => {})
}

export async function copyAddress(company: Company) {
  await Clipboard.setStringAsync(company.address)
}
