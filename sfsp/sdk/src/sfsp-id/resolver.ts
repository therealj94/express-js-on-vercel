/* Un solo punto para resolver cualquier identificador que acepte SFSP.
 *
 *   did:sfsp:<red>:p:…    persona: se autocertifica, sin red
 *   did:sfsp:<red>:org:…  organización: desde SFSPDidRegistry en la 5550
 *   did:key:…             persona de fuera (interoperabilidad)
 *   did:web:…             emisor de fuera (interoperabilidad)
 *
 * Lo nuestro es did:sfsp. Los otros dos se aceptan para que una billetera o un
 * emisor ajeno pueda hablar con SFSP, no para que lo nuestro dependa de ellos. */

import { ErrorSFSP } from '../codigos.js';
import { documentoOrganizacion, documentoPersona, type LectorRegistro } from './did-sfsp.js';
import { type DocumentoDid, type Obtener, resolverDid } from './did.js';

export interface Fuentes {
  /** Para did:web: cómo traer el documento por HTTPS. */
  obtener?: Obtener;
  /** Para did:sfsp:…:org: el registro en la cadena. */
  registro?: LectorRegistro;
}

export async function resolver(did: string, f: Fuentes = {}): Promise<DocumentoDid> {
  if (/^did:sfsp:\d+:p:/.test(did)) return documentoPersona(did);
  if (/^did:sfsp:\d+:org:/.test(did)) {
    if (!f.registro) throw new ErrorSFSP('UNKNOWN_SOURCE', 'identificador de organización sin lector del registro');
    return documentoOrganizacion(did, f.registro);
  }
  if (did.startsWith('did:sfsp:')) throw new ErrorSFSP('DENY_POLICY', 'tipo de did:sfsp desconocido');
  return resolverDid(did, f.obtener);
}
