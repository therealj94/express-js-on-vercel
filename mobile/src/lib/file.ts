import { File } from 'expo-file-system'

/**
 * Convierte un archivo del teléfono en una data-URL para poder mandarlo por JSON.
 *
 * El SDK 54 reemplazó `readAsStringAsync` por la clase `File`. La API vieja
 * sigue disponible en `expo-file-system/legacy`, pero no vale la pena atarse a
 * algo que ya está marcado para desaparecer.
 */
export async function uriToDataUrl(uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const base64 = await new File(uri).base64()
  return `data:${mimeType};base64,${base64}`
}
