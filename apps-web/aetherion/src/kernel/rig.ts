import * as THREE from 'three'
import { clamp, damp } from './sim'

export const UP = new THREE.Vector3(0, 1, 0)

class Rig {
  theta = 0.65
  phi = 1.12
  radius = 64
  tTheta = 0.65
  tPhi = 1.12
  tRadius = 26
  enabled = true

  orbit(dx: number, dy: number) {
    this.tTheta -= dx * 0.005
    this.tPhi = clamp(this.tPhi - dy * 0.005, 0.35, 1.45)
  }

  zoomBy(factor: number) {
    this.tRadius = clamp(this.tRadius * factor, 5.5, 46)
  }

  resync(cam: THREE.Camera) {
    const p = cam.position
    this.radius = this.tRadius = Math.max(5.5, Math.min(46, p.length()))
    this.theta = this.tTheta = Math.atan2(p.x, p.z)
    this.phi = this.tPhi = clamp(Math.acos(clamp(p.y / Math.max(0.001, p.length()), -1, 1)), 0.35, 1.45)
  }

  update(cam: THREE.Camera, dt: number) {
    if (!this.enabled) return
    this.theta = damp(this.theta, this.tTheta, 6, dt)
    this.phi = damp(this.phi, this.tPhi, 6, dt)
    this.radius = damp(this.radius, this.tRadius, 3.2, dt)
    const sp = Math.sin(this.phi)
    cam.position.set(
      this.radius * sp * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * sp * Math.cos(this.theta)
    )
    cam.lookAt(0, 0.4, 0)
  }

  altitudeLabel(): string {
    const en = typeof window !== 'undefined' && (window as any).__AE_LANG === 'en'
    if (this.radius > 20) return en ? 'SKY' : 'CIELO'
    if (this.radius > 11) return en ? 'CONSTELLATION' : 'CONSTELACIÓN'
    return en ? 'ORBIT' : 'ÓRBITA'
  }
}

export const rig = new Rig()
