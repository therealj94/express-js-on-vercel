// ─────────────────────────────────────────────────────────────────────────────
// El vocabulario de movimiento de MyTokenPay.
//
// Una app se siente cara o barata en los detalles del movimiento, y esos
// detalles tienen que ser los MISMOS en todas partes. Un botón que rebota con
// una física y una tarjeta que rebota con otra se leen como dos apps pegadas.
// Aquí viven las curvas, y todo el resto las importa.
//
// La regla: los resortes para cosas que aparecen y responden al tacto (se
// sienten vivos), las curvas suaves para transiciones de pantalla (se sienten
// intencionales). Nada lineal — nada en el mundo real se mueve a velocidad
// constante.
// ─────────────────────────────────────────────────────────────────────────────

import { Easing, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated'

/** Resorte estándar: para casi todo lo que aparece o responde al tacto. */
export const resorte: WithSpringConfig = {
  damping: 15,
  stiffness: 180,
  mass: 1,
}

/** Resorte con más rebote: para el momento de éxito, cuando queremos celebrar. */
export const resorteAlegre: WithSpringConfig = {
  damping: 10,
  stiffness: 170,
  mass: 0.9,
}

/** Resorte firme, sin rebote: para lo que debe sentirse preciso, no juguetón. */
export const resorteFirme: WithSpringConfig = {
  damping: 22,
  stiffness: 240,
  mass: 1,
}

/** Suave y con carácter: la curva de las transiciones de pantalla. */
export const suave: WithTimingConfig = {
  duration: 420,
  easing: Easing.bezier(0.22, 1, 0.36, 1), // easeOutQuint: arranca rápido, aterriza suave
}

export const rapido: WithTimingConfig = {
  duration: 220,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
}

export const lento: WithTimingConfig = {
  duration: 700,
  easing: Easing.bezier(0.16, 1, 0.3, 1),
}

/** Escalonar la aparición de una lista: cada ítem entra un pelín después. */
export const escalon = (indice: number, base = 60) => indice * base
