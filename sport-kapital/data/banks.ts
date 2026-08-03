// data/banks.ts
// Bancos principales por país LATAM (+ EE.UU.) para los flujos de la wallet:
// selección rápida del banco de destino en retiros SWIFT, y cuenta recaudadora
// local de Sport Kapital para depósitos por transferencia.

export const BANKS: Record<string, string[]> = {
  HN: ['BAC Credomatic', 'Banco Atlántida', 'Banco Ficohsa', 'Banco de Occidente'],
  MX: ['BBVA México', 'Banorte', 'Santander México', 'Citibanamex'],
  GT: ['Banco Industrial', 'Banrural', 'BAM'],
  SV: ['Banco Agrícola', 'Banco Cuscatlán', 'Banco Hipotecario'],
  CR: ['BAC Credomatic', 'Banco Nacional', 'Banco de Costa Rica'],
  NI: ['Banpro', 'Lafise Bancentro', 'BAC Credomatic'],
  PA: ['Banco General', 'Banistmo', 'BAC Credomatic'],
  CO: ['Bancolombia', 'Davivienda', 'BBVA Colombia'],
  VE: ['Banesco', 'Banco Mercantil', 'BBVA Provincial'],
  EC: ['Banco Pichincha', 'Banco Guayaquil', 'Produbanco'],
  PE: ['BCP', 'Interbank', 'BBVA Perú', 'Scotiabank Perú'],
  BO: ['Banco Unión', 'Banco Nacional de Bolivia', 'Mercantil Santa Cruz'],
  CL: ['BancoEstado', 'Banco Santander', 'BCI'],
  AR: ['Banco Nación', 'Banco Galicia', 'Santander Río'],
  PY: ['Itaú Paraguay', 'Banco Continental', 'Banco Familiar'],
  UY: ['BROU', 'Itaú Uruguay', 'Santander Uruguay'],
  BR: ['Itaú', 'Bradesco', 'Banco do Brasil', 'Nubank'],
  DO: ['Banreservas', 'Banco Popular', 'Banco BHD'],
  US: ['Bank of America', 'Chase', 'Wells Fargo'],
};

export function banksFor(countryCode: string): string[] {
  return BANKS[countryCode] ?? BANKS.US;
}

/** Cuenta recaudadora ficticia de Sport Kapital en el país (para depósitos). */
export function collectionAccount(countryCode: string): { bank: string; account: string; beneficiary: string } {
  const bank = banksFor(countryCode)[0];
  // número determinista por país, con formato bancario creíble
  let h = 0;
  for (const ch of countryCode) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const acct = `${(h % 90 + 10)}01-${(h % 9000 + 1000)}-${(h % 900000 + 100000)}`;
  return { bank, account: acct, beneficiary: 'Sport Kapital S.A.' };
}

/** Dirección TRC20 de depósito ficticia y estable por usuario. */
export function depositAddress(seed: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
  let h = 7;
  for (const ch of seed || 'sportkapital') h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  let out = 'T';
  for (let i = 0; i < 33; i++) {
    h = (h * 16807) % 2147483647;
    out += chars[h % chars.length];
  }
  return out;
}
