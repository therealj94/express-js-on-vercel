// utils/chamfer.ts
/** Puntos de un polígono rectangular con esquinas cortadas a 45° (chamfer), estética HUD/panel técnico. */
export function chamferPoints(w: number, h: number, cut: number): string {
  const c = Math.max(0, Math.min(cut, w / 2, h / 2));
  return [
    `${c},0`, `${w - c},0`, `${w},${c}`,
    `${w},${h - c}`, `${w - c},${h}`, `${c},${h}`,
    `0,${h - c}`, `0,${c}`,
  ].join(' ');
}
