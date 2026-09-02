import * as THREE from 'three'

let radial: THREE.CanvasTexture | null = null
let flare: THREE.CanvasTexture | null = null
let ring: THREE.CanvasTexture | null = null

export function getRadialTexture(): THREE.CanvasTexture {
  if (radial) return radial
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  radial = new THREE.CanvasTexture(c)
  return radial
}

export function getFlareTexture(): THREE.CanvasTexture {
  if (flare) return flare
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,246,224,1)')
  grad.addColorStop(0.18, 'rgba(255,236,190,0.7)')
  grad.addColorStop(0.5, 'rgba(255,220,150,0.16)')
  grad.addColorStop(1, 'rgba(255,210,130,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const streak = g.createLinearGradient(0, 128, 256, 128)
  streak.addColorStop(0, 'rgba(255,240,200,0)')
  streak.addColorStop(0.5, 'rgba(255,244,214,0.5)')
  streak.addColorStop(1, 'rgba(255,240,200,0)')
  g.fillStyle = streak
  g.fillRect(0, 122, 256, 12)
  flare = new THREE.CanvasTexture(c)
  return flare
}

export function getRingTexture(): THREE.CanvasTexture {
  if (ring) return ring
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 4
  g.shadowColor = 'rgba(255,255,255,0.9)'
  g.shadowBlur = 10
  g.beginPath()
  g.arc(64, 64, 44, 0, Math.PI * 2)
  g.stroke()
  ring = new THREE.CanvasTexture(c)
  return ring
}
