/* El registro de alias: @medardo, @empresa.
 *
 * Un alias es una comodidad para escribir un destino. NO es una credencial, NO
 * prueba titularidad y NO recupera una cuenta. Todo lo que hace es resolver a
 * un número de cuenta, y esa resolución se vuelve a comprobar al ejecutar.
 *
 * El riesgo real de los alias no es técnico, es visual: @medardo y @medardo
 * escritos con una «o» cirílica se ven idénticos en pantalla y son cadenas
 * distintas. Quien registre el segundo cobra los pagos del primero. Por eso
 * aquí hay tres formas de cada alias:
 *
 *   · la mostrada, tal como la eligió la persona;
 *   · la normalizada, que decide la unicidad exacta;
 *   · el esqueleto, que colapsa los caracteres que se confunden a la vista y
 *     que decide si un alias nuevo se parece demasiado a uno que ya existe.
 *
 * La política de nombres reservados, disputas y cambio la fija D17. Mientras
 * esté pendiente, el registro funciona pero no se activa de cara al público. */

import { ErrorSFSP } from './codigos.js';

const LARGO_MIN = 3;
const LARGO_MAX = 30;

/* Caracteres invisibles que no cambian lo que se ve pero sí la cadena. */
const INVISIBLES = /[​-‏⁠-⁯﻿­]/g;

/* Rangos de escritura. Un alias no puede mezclar alfabetos: es la forma más
   común de fabricar un nombre que se ve igual que otro. */
const CIRILICO = /[Ѐ-ӿ]/;
const GRIEGO = /[Ͱ-Ͽ]/;
const LATINO = /[a-z]/;

const PERMITIDOS = /^[a-z0-9_.]+$/;

/* Confusables: se colapsan al calcular el esqueleto. No cambia el alias que la
   persona ve, sólo impide que dos alias indistinguibles convivan. */
const CONFUSABLES: Array<[RegExp, string]> = [
  [/[0оo°]/g, 'o'],
  [/[1lI¡|]/g, 'l'],
  [/[3е]/g, 'e'],
  [/[4а]/g, 'a'],
  [/[5ѕs]/g, 's'],
  [/[6b]/g, 'b'],
  [/[8]/g, 'b'],
  [/[9g]/g, 'g'],
  [/[2z]/g, 'z'],
  [/[7t]/g, 't'],
  [/rn/g, 'm'],
  [/vv/g, 'w'],
  [/cl/g, 'd'],
  [/[_.]/g, ''],
];

/* Nombres que nunca se entregan a un particular. La lista definitiva es D17;
   ésta es la mínima defendible: marcas del ecosistema y palabras que alguien
   podría confundir con un canal oficial. */
export const RESERVADOS = new Set([
  'admin', 'administrador', 'soporte', 'support', 'ayuda', 'help', 'oficial', 'official',
  'ordenglobal', 'orden', 'sfsp', 'veta', 'vetawallet', 'genesis', 'genesisid', 'dbnx',
  'ordenledger', 'ordenmarkets', 'ordenex', 'ordenscan', 'aucorp', 'mytokenpay', 'pulse2chat',
  'origen', 'auka', 'agk', 'agka', 'ondk', 'ultron', 'aura', 'root', 'system', 'sistema',
  'seguridad', 'security', 'tesoreria', 'treasury', 'junta', 'banco', 'bank',
]);

export interface AliasNormalizado {
  alias: string;
  normalized: string;
  skeleton: string;
}

/**
 * Normaliza un alias o explica por qué no se puede.
 *
 * NFKC junta las formas compuestas y traduce los caracteres de ancho completo,
 * para que ＠ｍｅｄａｒｄｏ no sea un alias distinto de @medardo.
 */
export function normalizarAlias(entrada: string): AliasNormalizado {
  const limpio = entrada.trim().replace(INVISIBLES, '');
  if (!limpio.startsWith('@')) {
    throw new ErrorSFSP('DENY_POLICY', 'un alias empieza con arroba');
  }
  const cuerpo = limpio.slice(1).normalize('NFKC').toLowerCase();

  if (cuerpo.length < LARGO_MIN || cuerpo.length > LARGO_MAX) {
    throw new ErrorSFSP('DENY_POLICY', `el alias debe tener entre ${LARGO_MIN} y ${LARGO_MAX} caracteres`);
  }

  const tieneLatino = LATINO.test(cuerpo);
  const tieneCirilico = CIRILICO.test(cuerpo);
  const tieneGriego = GRIEGO.test(cuerpo);
  if ([tieneLatino, tieneCirilico, tieneGriego].filter(Boolean).length > 1) {
    throw new ErrorSFSP('DENY_POLICY', 'un alias no puede mezclar alfabetos');
  }
  if (tieneCirilico || tieneGriego) {
    throw new ErrorSFSP('DENY_POLICY', 'por ahora el registro de alias sólo admite alfabeto latino');
  }
  if (!PERMITIDOS.test(cuerpo)) {
    throw new ErrorSFSP('DENY_POLICY', 'sólo se admiten letras, dígitos, guion bajo y punto');
  }
  if (cuerpo.startsWith('.') || cuerpo.endsWith('.') || cuerpo.includes('..')) {
    throw new ErrorSFSP('DENY_POLICY', 'el punto no puede ir al principio, al final ni repetido');
  }

  return { alias: `@${cuerpo}`, normalized: cuerpo, skeleton: esqueleto(cuerpo) };
}

/** Forma colapsada que decide si dos alias se ven demasiado parecidos. */
export function esqueleto(normalizado: string): string {
  let s = normalizado;
  for (const [patron, reemplazo] of CONFUSABLES) s = s.replace(patron, reemplazo);
  return s;
}

export function esReservado(normalizado: string): boolean {
  if (RESERVADOS.has(normalizado)) return true;
  /* También se reserva el esqueleto: @0rden no puede existir si @orden está
     reservado, porque en pantalla son lo mismo. */
  const sk = esqueleto(normalizado);
  for (const r of RESERVADOS) if (esqueleto(r) === sk) return true;
  return false;
}
