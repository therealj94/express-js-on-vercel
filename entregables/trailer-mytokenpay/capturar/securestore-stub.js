const k = key => 'ss.' + key
export async function getItemAsync(key) { try { return localStorage.getItem(k(key)) } catch { return null } }
export async function setItemAsync(key, v) { try { localStorage.setItem(k(key), v) } catch {} }
export async function deleteItemAsync(key) { try { localStorage.removeItem(k(key)) } catch {} }
export const isAvailableAsync = async () => true
export const WHEN_UNLOCKED = 0
export default { getItemAsync, setItemAsync, deleteItemAsync, isAvailableAsync, WHEN_UNLOCKED }
