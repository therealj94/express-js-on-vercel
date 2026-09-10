// Los avisos de MyTokenPay: de dónde salen y por qué no hay promociones.
//
// El original (`app/notificaciones.tsx` + `src/store/notifications.ts` del
// mytokenpay-app) abre la bandeja con cuatro avisos ya escritos en el código:
// una bienvenida con "480 puntos de regalo", un 2x1 en un rooftop, un premio
// canjeable y un café gratis. Son SEMILLA de demostración — el propio store
// los declara como `SEED` — y hablan de comercios de ejemplo y de puntos que
// ningún servidor lleva. Copiarlos aquí sería prometerle a José un 2x1 que
// nadie le va a servir.
//
// Así que la bandeja se porta entera —tipos de aviso, no leídos, "hace 2 h",
// marcar todo como leído— pero alimentada con lo ÚNICO que en esta app es
// verdad y tiene fecha: los cobros que entraron a la cadena (las mismas
// transferencias entrantes que ven Cobros y el panel) y el estado real del
// Genesis ID. Cuando el servidor de MyTokenPay entre, sus promociones y sus
// premios se suman aquí sin tocar la pantalla: solo crece `avisosDe`.
//
// Este fichero guarda DATOS, nunca textos: los textos viven en la pantalla
// con su es/en, como en el resto de la casa.
import AsyncStorage from '@react-native-async-storage/async-storage';

// El mismo criterio de "entrante" que usan Actividad, el panel y los avisos
// del sistema: el backend histórico escribe 'recive' (sic) y no se corrige
// aquí para no perder movimientos viejos.
export const esEntrante = (x) => x.type === 'recive' || x.type === 'receive' || x.type === 'in';

// Lo leído se guarda POR CUENTA y en AsyncStorage, no en SecureStore: es una
// preferencia de lectura, no un secreto, y meterla en el almacén cifrado
// gastaría una ranura del sistema por nada.
const LLAVE_VISTO = (email) => 'og.pay.avisos.visto.' + String(email || 'anon').toLowerCase();

// Construye la bandeja a partir de la cuenta.
//   null ⇒ la cadena todavía no se ha leído nunca (la pantalla pone esqueleto)
//   []   ⇒ leída y sin nada que contar (estado vacío honesto)
// El id es el hash de la transacción: es único de verdad y sobrevive a que la
// lista se reordene o se recargue, así que "leído" no se descoloca.
export function avisosDe(account) {
  const transfers = account?.transfers;
  if (!Array.isArray(transfers)) return null;
  return transfers
    .filter(esEntrante)
    .map((x, i) => ({
      id: x.hash || ('cobro-' + i),
      tipo: 'cobro',
      ts: (Number(x.timeStamp) || 0) * 1000,   // la cadena da SEGUNDOS
      valor: Number(x.value) || 0,
      simbolo: x.symbol || 'ORIGEN',
      de: x.from || '',
      hash: x.hash || null,
    }))
    .sort((a, b) => b.ts - a.ts);
}

export async function leerVisto(email) {
  try {
    const v = await AsyncStorage.getItem(LLAVE_VISTO(email));
    return v ? Number(v) || 0 : 0;
  } catch (e) { return 0; }
}

// Se guarda la FECHA del aviso más nuevo, no una lista de ids leídos: la
// bandeja crece sola con la cadena y una lista de ids crecería para siempre
// en el teléfono. Todo lo anterior a esa fecha queda leído, que es justo lo
// que hacía `markAllRead` del original.
export async function guardarVisto(email, ts) {
  try { await AsyncStorage.setItem(LLAVE_VISTO(email), String(Math.floor(ts) || 0)); } catch (e) {}
}

export function noLeidos(avisos, visto) {
  if (!Array.isArray(avisos)) return 0;
  return avisos.filter((a) => a.ts > (visto || 0)).length;
}

// "hace 2 h", igual que el `timeAgo` del original (ahora / min / h / d).
export function haceCuanto(ts, lang) {
  const es = lang !== 'en';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return es ? 'ahora' : 'now';
  if (min < 60) return es ? `hace ${min} min` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return es ? `hace ${h} h` : `${h} h ago`;
  const d = Math.round(h / 24);
  return es ? `hace ${d} d` : `${d} d ago`;
}
