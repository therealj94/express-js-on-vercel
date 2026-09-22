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
   persona ve, sólo impide que dos alias indistinguibles convivan.
 *
 * ALCANCE, Y POR QUÉ ES DEFENDIBLE (P02). La norma de Unicode para esto,
 * UTS #39, trae una tabla de miles de pares que cubre todas las escrituras.
 * Aquí no hace falta, y traerla entera sería peor: como el alfabeto admitido
 * está restringido a `[a-z0-9_.]`, el espacio de confusiones posibles es
 * pequeño y **se puede enumerar**. La función `paresColapsados()` de más abajo
 * devuelve exactamente qué trata el esqueleto como idéntico, y una prueba
 * compara esa lista con la revisada. Así la cobertura es explícita y alguien
 * puede discutirla, en vez de ser el resultado accidental de una tabla que
 * nadie leyó.
 *
 * Se quitaron de la versión anterior tres reglas que no se sostienen en una
 * tipografía normal: 9 con g, 2 con z y 7 con t. Colapsar de más también hace
 * daño: le niega a alguien un alias legítimo porque se parece de lejos a otro.
 *
 * LO QUE NO CUBRE, y queda dicho: pares que dependen de la tipografía concreta
 * del dispositivo, homoglifos de escrituras que aquí no se admiten (se
 * rechazan antes, al exigir alfabeto latino), y parecidos de palabra completa
 * como «orden» y «ordenes», que son un asunto de marcas y los resuelve D17. */
const CONFUSABLES: Array<[RegExp, string]> = [
  /* Cifra y letra que comparten forma en casi cualquier tipografía. */
  [/0/g, 'o'],
  [/1/g, 'l'],
  [/[i|]/g, 'l'],
  [/5/g, 's'],
  [/6/g, 'b'],
  /* Secuencias que se leen como una sola letra. */
  [/rn/g, 'm'],
  [/vv/g, 'w'],
  [/cl/g, 'd'],
  /* Separadores: no distinguen a la vista lo suficiente como para dar un alias. */
  [/[_.]/g, ''],
];

/** El alfabeto que un alias puede contener tras normalizar. */
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789_.';

/* Nombres que nunca se entregan a un particular. La lista definitiva es D17;
   ésta es la mínima defendible: marcas del ecosistema y palabras que alguien
   podría confundir con un canal oficial. */
export const RESERVADOS = new Set([
  'admin', 'administrador', 'soporte', 'support', 'ayuda', 'help', 'oficial', 'official',
  'ordenglobal', 'orden', 'sfsp', 'veta', 'vetawallet', 'genesis', 'genesisid', 'dbnx',
  'ordenledger', 'ordenmarkets', 'ordenex', 'ordenscan', 'aucorp', 'mytokenpay', 'pulse2chat',
  'origen', 'auka', 'agk', 'agka', 'ondk', 'ultron', 'ultronfp', 'aura', 'aurafp', 'aura_fp',
  'aura.fp', 'au_ra', 'au.ra', 'root', 'system', 'sistema',
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

/**
 * Qué caracteres del alfabeto admitido trata el esqueleto como el mismo (P02).
 *
 * Devuelve los grupos de equivalencia, para que la cobertura anti-confusables
 * se pueda revisar de un vistazo y discutir. Una prueba compara esta lista con
 * la acordada: si alguien añade o quita una regla sin querer, salta.
 */
export function paresColapsados(): string[][] {
  const grupos = new Map<string, string[]>();
  for (const c of ALFABETO) {
    const k = esqueleto(c);
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  return [...grupos.values()].filter((g) => g.length > 1).map((g) => g.sort());
}

/** Secuencias de varias letras que el esqueleto colapsa en una. */
export function secuenciasColapsadas(): Array<[string, string]> {
  return [
    ['rn', 'm'],
    ['vv', 'w'],
    ['cl', 'd'],
  ];
}

export function esReservado(normalizado: string): boolean {
  if (RESERVADOS.has(normalizado)) return true;
  /* También se reserva el esqueleto: @0rden no puede existir si @orden está
     reservado, porque en pantalla son lo mismo. */
  const sk = esqueleto(normalizado);
  for (const r of RESERVADOS) if (esqueleto(r) === sk) return true;
  return false;
}
