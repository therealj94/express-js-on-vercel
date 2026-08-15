// ═══ LA LIBRETA DE AURO CHAT ════════════════════════════════════════════
// Vivía dentro de AuroChat.js y solo se ESCRIBÍA: ninguna pantalla la leía,
// así que «Guardado en tus contactos» prometía una lista que no existía.
// Ahora vive aquí para que la lean todos los que la necesitan: AuroChat
// pinta estos nombres por encima de los del relevo (el nombre que TÚ le
// pusiste a alguien manda sobre el que esa persona se puso a sí misma), y
// Enviar puede renombrar al contacto cuando el pago nació de una charla.
//
// Va en SecureStore por encargo. Los valores de SecureStore se pueden quedar
// cortos pasados unos 2 KB, así que cada contacto guarda solo lo necesario
// para escribirle o pagarle y la lista se queda con los 30 más recientes:
// mejor una libreta que siempre escribe que una que un día falla en silencio.
// La dirección de cadena, además, se copia a la libreta del teléfono
// (addressBook), que es la que pone nombre a un 0x en Enviar y en Actividad.
import * as SecureStore from 'expo-secure-store';
import { addContact, removeContact, listContacts, isAddress } from '../addressBook';

const LIBRETA = 'og.contactos';
const TOPE_LIBRETA = 30;

/** La libreta cruda: [{nombre, correo, addr}] — nunca lanza. */
export async function leerLibreta() {
  const crudo = await SecureStore.getItemAsync(LIBRETA).catch(() => null);
  try {
    const p = JSON.parse(crudo || '[]');
    return Array.isArray(p) ? p : [];
  } catch (e) { return []; }
}

/** correo (en minúsculas) → ficha. Para buscar un nombre en O(1) al pintar. */
export function comoMapa(lista) {
  const m = {};
  for (const c of lista || []) {
    const k = String((c && c.correo) || '').toLowerCase();
    if (k) m[k] = c;
  }
  return m;
}

async function escribir(lista) {
  await SecureStore.setItemAsync(LIBRETA, JSON.stringify(lista.slice(-TOPE_LIBRETA)));
}

// Guardar (o renombrar) a alguien. Idempotente por correo: escanear dos
// veces al mismo, o renombrarlo, actualiza su ficha en vez de duplicarla.
// `addr` vacío NO borra la dirección ya guardada: renombrar desde una
// pantalla que no la conoce no debe costarle la cadena al contacto.
export async function guardarContacto(correoCrudo, nombre, addr, emailCuenta) {
  const correo = String(correoCrudo || '').toLowerCase();
  if (!correo) return;
  const lista = await leerLibreta();
  const rec = { nombre: nombre || correo.split('@')[0], correo };
  if (addr) rec.addr = addr;
  const i = lista.findIndex((x) => String((x && x.correo) || '').toLowerCase() === correo);
  const final = i >= 0 ? { ...lista[i], ...rec } : { addr: '', ...rec };
  if (i >= 0) lista[i] = final; else lista.push(final);
  await escribir(lista);
  // si además sabemos su dirección de cadena, entra en la libreta del
  // teléfono y su nombre aparece en Enviar y en Actividad, no solo aquí
  if (isAddress(final.addr)) {
    await addContact(emailCuenta, { name: final.nombre, address: final.addr }).catch(() => {});
  }
}

// Renombrar ES guardar: mismo camino, para que las dos libretas (la del chat
// y la del teléfono) nunca cuenten historias distintas sobre la misma persona.
export const renombrarContacto = guardarContacto;

/** Quitar a alguien de la libreta — de las DOS, si le conocíamos la cadena:
 *  dejarlo con nombre en Enviar después de «eliminarlo» sería mentirle al
 *  usuario sobre lo que acaba de hacer. */
export async function eliminarContacto(correoCrudo, emailCuenta) {
  const correo = String(correoCrudo || '').toLowerCase();
  if (!correo) return;
  const lista = await leerLibreta();
  const fuera = lista.find((x) => String((x && x.correo) || '').toLowerCase() === correo);
  await escribir(lista.filter((x) => String((x && x.correo) || '').toLowerCase() !== correo));
  if (fuera && isAddress(fuera.addr)) {
    const arr = await listContacts(emailCuenta).catch(() => []);
    const c = arr.find((x) => x.address.toLowerCase() === fuera.addr.toLowerCase());
    if (c) await removeContact(emailCuenta, c.id).catch(() => {});
  }
}
