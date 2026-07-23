function block(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

/** UID de identidad personal: GEN-1234-5678 */
export function personalUid(): string {
  return `GEN-${block()}-${block()}`
}

/** UID de identidad de negocio: GNB-1234-5678 */
export function businessUid(): string {
  return `GNB-${block()}-${block()}`
}

export function id(prefix = 'idn'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
