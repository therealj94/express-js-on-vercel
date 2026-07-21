import { File } from 'expo-file-system'

export async function uriToDataUrl(uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const base64 = await new File(uri).base64()
  return `data:${mimeType};base64,${base64}`
}
