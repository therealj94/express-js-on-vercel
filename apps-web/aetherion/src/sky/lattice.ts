import * as THREE from 'three'
import { mulberry32 } from '../kernel/sim'

export interface GPath {
  pts: THREE.Vector3[]
  cum: Float32Array
  len: number
}

export interface WellNode {
  pos: THREE.Vector3
  pathIdx: number
  t: number
}

export interface Galaxy {
  segs: Float32Array
  cols: Float32Array
  paths: GPath[]
  wells: WellNode[]
}

function finalizePath(pts: THREE.Vector3[]): GPath {
  const cum = new Float32Array(pts.length)
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += pts[i].distanceTo(pts[i - 1])
    cum[i] = len
  }
  return { pts, cum, len }
}

export function samplePath(path: GPath, t: number, out: THREE.Vector3): THREE.Vector3 {
  const target = Math.max(0, Math.min(1, t)) * path.len
  const cum = path.cum
  let lo = 0
  let hi = cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid] < target) lo = mid + 1
    else hi = mid
  }
  const i = Math.max(1, lo)
  const segLen = cum[i] - cum[i - 1] || 1
  const f = (target - cum[i - 1]) / segLen
  return out.copy(path.pts[i - 1]).lerp(path.pts[i], f)
}

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()

export function generateGalaxy(seed = 20260823): Galaxy {
  const rnd = mulberry32(seed)
  const segs: number[] = []
  const cols: number[] = []
  const paths: GPath[] = []

  const pushSeg = (a: THREE.Vector3, b: THREE.Vector3, bright: number) => {
    segs.push(a.x, a.y, a.z, b.x, b.y, b.z)
    cols.push(bright, bright, bright, bright * 0.85, bright * 0.85, bright * 0.85)
  }

  const growBranch = (
    start: THREE.Vector3,
    dir: THREE.Vector3,
    steps: number,
    stepLen: number,
    brightBase: number
  ) => {
    let p = start.clone()
    let d = dir.clone().normalize()
    for (let s = 0; s < steps; s++) {
      const tangent = tmpA.set(-p.z, 0, p.x).normalize()
      d.addScaledVector(tangent, 0.12 + rnd() * 0.08)
        .addScaledVector(UPISH, (rnd() - 0.5) * 0.14)
        .normalize()
      const next = p.clone().addScaledVector(d, stepLen)
      pushSeg(p, next, brightBase * (0.5 + rnd() * 0.4))
      p = next
    }
  }

  const UPISH = new THREE.Vector3(0, 1, 0)

  const ROOTS = 16
  for (let r = 0; r < ROOTS; r++) {
    const dir = new THREE.Vector3(rnd() * 2 - 1, (rnd() - 0.5) * 0.35, rnd() * 2 - 1).normalize()
    let p = new THREE.Vector3(rnd() * 1.6 - 0.8, (rnd() - 0.5) * 0.5, rnd() * 1.6 - 0.8)
    const pts = [p.clone()]
    const steps = 11 + Math.floor(rnd() * 7)
    for (let s = 0; s < steps; s++) {
      const tangent = tmpB.set(-p.z, 0, p.x).normalize()
      dir.addScaledVector(tangent, 0.15 + rnd() * 0.09)
        .addScaledVector(UPISH, (rnd() - 0.5) * 0.1)
        .normalize()
      const prev = p
      p = p.clone().addScaledVector(dir, 0.9 + rnd() * 0.55)
      pts.push(p.clone())
      const rr = Math.min(1, p.length() / 24)
      const bright = (1 - rr * 0.65) * (0.75 + rnd() * 0.25)
      pushSeg(prev, p, bright)
      if (s > 2 && rnd() < 0.34 && r < 40) {
        growBranch(p, dir.clone().multiplyScalar(0.7), 3 + Math.floor(rnd() * 4), 0.6, bright * 0.6)
      }
    }
    paths.push(finalizePath(pts))
  }

  const wells: WellNode[] = []
  const minDist = 5.2
  for (let pi = 0; pi < paths.length && wells.length < 11; pi++) {
    const path = paths[pi]
    for (let k = 0; k <= 3; k++) {
      const t = 0.5 + (k / 3) * 0.48
      const idx = Math.round(t * (path.pts.length - 1))
      const pos = path.pts[idx]
      const rad = pos.length()
      if (rad < 5 || rad > 23) continue
      let ok = true
      for (const w of wells) if (w.pos.distanceTo(pos) < minDist) ok = false
      if (!ok) continue
      wells.push({ pos: pos.clone(), pathIdx: pi, t: idx / (path.pts.length - 1) })
      break
    }
  }
  while (wells.length < 11) {
    const pi = wells.length % paths.length
    const path = paths[pi]
    const idx = path.pts.length - 1
    wells.push({
      pos: path.pts[idx].clone(),
      pathIdx: pi,
      t: 1,
    })
  }

  return {
    segs: new Float32Array(segs),
    cols: new Float32Array(cols),
    paths,
    wells,
  }
}
