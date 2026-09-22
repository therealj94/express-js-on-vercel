/* El número de cuenta SFSP: SF-XXXX-XXXX-XXXX-C
 *
 * Doce dígitos generados con el generador criptográfico del sistema, más un
 * dígito de control. Las tres propiedades que lo definen, y por qué:
 *
 *   · NO es secuencial. Un contador revela cuántos clientes hay, cuándo entró
 *     cada uno y permite adivinar números vecinos. Un número de cuenta se
 *     comparte para cobrar: tiene que poder circular sin contar nada.
 *   · NO codifica país, tipo de persona, jurisdicción ni nivel de verificación.
 *     Esa información vive en Genesis ID y se consulta por propósito. Un número
 *     que dice de dónde es alguien es un dato personal pegado a un destino
 *     público.
 *   · NO se recicla. Un número retirado no vuelve a entregarse nunca, porque
 *     alguien podría tenerlo guardado en una agenda y pagarle al titular nuevo.
 *
 * El dígito de control detecta erratas de tecleo, no fraude: no es una firma ni
 * una prueba de titularidad. Cualquiera puede construir un número con control
 * válido; lo que no puede es acertar uno que exista.
 *
 * Algoritmo del control: Luhn sobre los doce dígitos. Queda declarado en
 * SFSP-130 y se congela tras la prueba T58; hasta entonces el campo
 * `checkDigitCongelado` de DECISIONES-SFSP.json está en false. */

import { randomBytes } from 'node:crypto';
import { ErrorSFSP } from './codigos.js';

export const DIGITOS = 12;
const PATRON = /^SF-\d{4}-\d{4}-\d{4}-\d$/;

/**
 * Doce dígitos uniformes del generador criptográfico.
 *
 * Se descartan los bytes de 250 a 255 antes de tomar el resto entre diez: sin
 * ese descarte los dígitos 0 a 5 saldrían un poco más a menudo que el resto, y
 * un número de cuenta con sesgo es un número de cuenta más fácil de adivinar.
 */
export function digitosAleatorios(cuantos: number = DIGITOS): string {
  let salida = '';
  while (salida.length < cuantos) {
    const faltan = cuantos - salida.length;
    const bytes = randomBytes(Math.ceil(faltan * 1.1) + 8);
    for (let i = 0; i < bytes.length && salida.length < cuantos; i++) {
      const b = bytes[i] as number;
      if (b < 250) salida += (b % 10).toString();
    }
  }
  return salida;
}

/** Dígito de control de Luhn para una cadena de dígitos. */
export function digitoDeControl(digitos: string): number {
  if (!/^\d+$/.test(digitos)) {
    throw new ErrorSFSP('DENY_POLICY', 'el cuerpo del número debe ser sólo dígitos');
  }
  let suma = 0;
  let doblar = true; // el dígito más a la derecha del cuerpo se dobla
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = Number(digitos[i]);
    if (doblar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    doblar = !doblar;
  }
  return (10 - (suma % 10)) % 10;
}

/** Da formato SF-XXXX-XXXX-XXXX-C a doce dígitos. */
export function formatear(digitos: string): string {
  if (!/^\d{12}$/.test(digitos)) {
    throw new ErrorSFSP('DENY_POLICY', 'hacen falta exactamente doce dígitos');
  }
  const c = digitoDeControl(digitos);
  return `SF-${digitos.slice(0, 4)}-${digitos.slice(4, 8)}-${digitos.slice(8, 12)}-${c}`;
}

/** Genera un número de cuenta completo. La unicidad la impone el directorio. */
export function generarNumeroCuenta(): string {
  return formatear(digitosAleatorios());
}

/** Quita el formato y devuelve los doce dígitos y el control, sin validar. */
export function partes(numero: string): { cuerpo: string; control: number } | null {
  if (!PATRON.test(numero)) return null;
  const sinPrefijo = numero.slice(3);
  const grupos = sinPrefijo.split('-');
  if (grupos.length !== 4) return null;
  return {
    cuerpo: `${grupos[0]}${grupos[1]}${grupos[2]}`,
    control: Number(grupos[3]),
  };
}

/** true sólo si la forma es correcta y el dígito de control cuadra. */
export function esNumeroValido(numero: string): boolean {
  const p = partes(numero);
  if (!p) return false;
  return digitoDeControl(p.cuerpo) === p.control;
}

/** Forma canónica para índices: sin guiones, sin prefijo, en mayúsculas. */
export function claveDeIndice(numero: string): string {
  const p = partes(numero);
  if (!p) throw new ErrorSFSP('DENY_POLICY', `número de cuenta mal formado: ${numero}`);
  return `${p.cuerpo}${p.control}`;
}

/** Los últimos cuatro caracteres visibles, para confirmar antes de firmar. */
export function ultimos4(numero: string): string {
  const p = partes(numero);
  if (!p) throw new ErrorSFSP('DENY_POLICY', `número de cuenta mal formado: ${numero}`);
  return `${p.cuerpo.slice(-3)}${p.control}`;
}
