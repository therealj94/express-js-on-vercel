import * as FileSystem from 'expo-file-system/legacy';

// ============================================================
// Archivos del pasaporte Genesis ID.
//
// El portal no siempre entrega un .json: muchas veces lo que se descarga es
// una IMAGEN o un PDF del pasaporte. Leer eso como texto devolvía basura y la
// importación fallaba con "no pudimos leer ese pasaporte" — que es cierto,
// pero inútil. Aquí se separa qué tipo de archivo llegó y, si es una imagen,
// se guarda dentro de la app para que sobreviva a reinicios (la ruta que da
// el selector es temporal y el sistema la borra).
// ============================================================

const DIR = `${FileSystem.documentDirectory}passport/`;

export const TIPOS = { TEXTO: 'texto', IMAGEN: 'imagen', PDF: 'pdf' };

/** Adivina el tipo por extensión y mimeType. */
export function tipoDeArchivo(nombre, mime) {
  const n = String(nombre || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/.test(n)) return TIPOS.IMAGEN;
  if (m.includes('pdf') || /\.pdf$/.test(n)) return TIPOS.PDF;
  return TIPOS.TEXTO;
}

async function asegurarDir() {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  } catch (e) {}
}

/**
 * Copia la imagen elegida a la carpeta de la app y devuelve su ruta estable.
 * Sin esto, la foto se veía al momento y desaparecía al reabrir la app.
 */
export async function guardarImagen(uri, sufijo = 'jpg') {
  if (!uri) return null;
  try {
    await asegurarDir();
    const destino = `${DIR}pass_${Date.now()}.${sufijo}`;
    await FileSystem.copyAsync({ from: uri, to: destino });
    return destino;
  } catch (e) {
    return uri; // si no se pudo copiar, al menos que se vea ahora
  }
}

/** Borra las imágenes anteriores para no acumular copias. */
export async function limpiarAnteriores(conservar) {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(DIR);
    for (const f of files) {
      const ruta = `${DIR}${f}`;
      if (ruta !== conservar) await FileSystem.deleteAsync(ruta, { idempotent: true });
    }
  } catch (e) {}
}

/** Lee un archivo de texto. Devuelve null si no parece texto legible. */
export async function leerTexto(uri) {
  try {
    const txt = await FileSystem.readAsStringAsync(uri);
    // Un binario leído como texto viene lleno de caracteres de control.
    const raros = (txt.slice(0, 400).match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
    if (raros > 8) return null;
    return txt;
  } catch (e) {
    return null;
  }
}
