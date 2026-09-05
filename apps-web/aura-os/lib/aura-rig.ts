// EL RIG DE AURA: qué hace la cara y el cuerpo en cada modo, en números.
//
// Todo amortiguado. Ningún valor salta: cada cuadro se acerca a su objetivo
// con un resorte crítico, y el objetivo lo pone el modo. La identidad no
// cambia —es la misma figura de la imagen— cambia lo que hace.
import type { Mode } from './os-store';

export interface Pose {
  cabezaInclina: number;   // grados, + a la derecha (pensar)
  cabezaBaja: number;      // grados, + barbilla arriba (escuchar)
  parpados: number;        // 1 abiertos · 0.55 entrecerrados (pensar)
  sienes: number;          // velocidad de las partículas de las sienes
  cintaEnrolla: number;    // 0 sueltas · 1 una cinta se enrolla (pensar)
  cintasAbren: number;     // 0 normal · 1 abiertas (escuchar)
  pecho: number;           // brillo del núcleo
  ojosCalidos: number;     // 0 cian · 1 más blanco-cálido (éxito)
  densidad: number;        // 0..1, cuánto cuerpo se ve (boot)
}

export const POSES: Record<Mode, Pose> = {
  boot:   { cabezaInclina: 0, cabezaBaja: 0, parpados: 0, sienes: 0.4, cintaEnrolla: 0, cintasAbren: 0, pecho: 0.2, ojosCalidos: 0, densidad: 0 },
  idle:   { cabezaInclina: 0, cabezaBaja: 0, parpados: 1, sienes: 1, cintaEnrolla: 0, cintasAbren: 0, pecho: 1, ojosCalidos: 0, densidad: 1 },
  listen: { cabezaInclina: -2, cabezaBaja: 3, parpados: 0.92, sienes: 1.2, cintaEnrolla: 0, cintasAbren: 1, pecho: 1.05, ojosCalidos: 0.15, densidad: 1 },
  think:  { cabezaInclina: 6, cabezaBaja: -1, parpados: 0.6, sienes: 2.6, cintaEnrolla: 1, cintasAbren: 0, pecho: 1.15, ojosCalidos: 0, densidad: 1 },
  speak:  { cabezaInclina: 0, cabezaBaja: 1, parpados: 1, sienes: 1.4, cintaEnrolla: 0, cintasAbren: 0.3, pecho: 1.3, ojosCalidos: 0.1, densidad: 1 },
  focus:  { cabezaInclina: 3, cabezaBaja: 0, parpados: 0.95, sienes: 1, cintaEnrolla: 0, cintasAbren: 0.2, pecho: 1, ojosCalidos: 0, densidad: 1 },
};

/** Resorte crítico: se acerca sin pasarse. `lambda` ≈ velocidad. */
export function amortiguar(actual: number, objetivo: number, lambda: number, dt: number): number {
  return actual + (objetivo - actual) * (1 - Math.exp(-lambda * dt));
}

export function crearPose(): Pose { return { ...POSES.boot }; }

/** Un paso del rig: acerca `pose` al modo, con la respiración y la voz encima. */
export function pasoRig(pose: Pose, mode: Mode, dt: number, lambda = 4): Pose {
  const o = POSES[mode];
  const k = pose as unknown as Record<string, number>; const t = o as unknown as Record<string, number>;
  for (const c of Object.keys(t)) k[c] = amortiguar(k[c], t[c], c === 'densidad' ? 1.6 : lambda, dt);
  return pose;
}

/** La respiración del pecho: 4,2 s, escala Y 1,000 → 1,012. */
export const respiracion = (t: number) => 1 + 0.012 * (0.5 + 0.5 * Math.sin((t / 4.2) * Math.PI * 2));

/** El parpadeo: cada ~4,5 s, 140 ms cerrados. Devuelve 0..1 de apertura. */
export function parpadeo(t: number): number {
  const ciclo = t % 4.5;
  if (ciclo < 0.14) return 1 - Math.sin((ciclo / 0.14) * Math.PI);
  return 1;
}
