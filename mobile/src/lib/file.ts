import * as FileSystem from 'expo-file-system'

export async function uriToDataUrl(uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  return `data:${mimeType};base64,${base64}`
}
