import { File } from 'expo-file-system'

export async function uriToDataUrl(uri: string, mimeType = 'image/jpeg'): Promise<string> {
  // SDK 54's expo-file-system exposes a File object with an async base64() reader.
  const base64 = await new File(uri).base64()
  return `data:${mimeType};base64,${base64}`
}
