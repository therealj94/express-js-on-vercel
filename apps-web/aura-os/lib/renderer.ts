// EL RENDERER: WebGL2 por omisión, WebGPU como mejora cuando se pide.
//
// ── POR QUÉ WEBGL2 ES EL CAMINO DE PRODUCCIÓN ────────────────────────────────
//
// La post (bloom selectivo, viñeta) sale de `postprocessing`, que es WebGL. Con
// WebGPURenderer la escena pinta pero la post no compila: sin bloom, los ojos
// y el núcleo no brillan y el ser pierde la mitad de su cara. Así que WebGPU
// se intenta solo con `?webgpu=1`, y si arranca se avisa y se pinta sin post.
// El día que la post tenga camino WGSL, se cambia el orden aquí y nada más.
//
// No se llama a getContext('webgl2') fuera de Three: Three lo pide con los
// atributos que necesita, y pedirlo dos veces con atributos distintos deja el
// segundo pedido en null.
import * as THREE from 'three';

export const esMovil = () => typeof window !== 'undefined' && (window.innerWidth < 720 || /Android|iPhone|iPad/i.test(navigator.userAgent));

export function hayWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export interface OpcionesRenderer { canvas: HTMLCanvasElement; movil: boolean }

/** Crea el renderer. Devuelve también si quedó sin post (WebGPU). */
export async function crearRenderer({ canvas, movil }: OpcionesRenderer): Promise<{ gl: THREE.WebGLRenderer; sinPost: boolean; webgpu: boolean }> {
  const quiereWebGPU = typeof location !== 'undefined' && /[?&]webgpu=1/.test(location.search);
  if (quiereWebGPU && 'gpu' in navigator) {
    try {
      // Carga perezosa: el módulo WebGPU de Three pesa y casi nunca se usa.
      const mod = await import('three/webgpu');
      const r = new mod.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      await r.init();
      r.setPixelRatio(movil ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
      // Sin post: el bloom es WebGL. Se dice, no se esconde.
      return { gl: r as unknown as THREE.WebGLRenderer, sinPost: true, webgpu: true };
    } catch { /* silencio: cae a WebGL2 */ }
  }
  const gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true });
  gl.setPixelRatio(movil ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 0.95;
  gl.setClearColor(new THREE.Color('#02060f'), 1);
  return { gl, sinPost: false, webgpu: false };
}

/** Vigila el cuadro: si tarda más de 18 ms durante 2 s, baja un nivel. */
export class Vigilante {
  private lento = 0; private nivel: 0 | 1 | 2 = 0; private alBajar: (n: 0 | 1 | 2) => void;
  constructor(alBajar: (n: 0 | 1 | 2) => void) { this.alBajar = alBajar; }
  cuadro(dt: number) {
    if (dt > 0.018) this.lento += dt; else this.lento = Math.max(0, this.lento - dt * 0.5);
    if (this.lento > 2 && this.nivel < 2) { this.nivel = (this.nivel + 1) as 1 | 2; this.lento = 0; this.alBajar(this.nivel); }
  }
}
