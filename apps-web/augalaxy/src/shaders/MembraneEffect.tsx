import { Effect, BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import type { FC } from 'react'
import { wrapEffect } from '@react-three/postprocessing'
import { sim } from '../kernel/sim'

const frag = /* glsl */ `
uniform float uIris;
uniform float uDesat;
uniform float uDistort;
uniform float uEdge;
uniform float uTime;

void mainUv(inout vec2 uv) {
  vec2 c = uv - 0.5;
  uv += c * dot(c, c) * uDistort * 0.6;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = inputColor.rgb;

  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), clamp(uDesat, 0.0, 1.0));

  vec2 c = uv - 0.5;
  float r = length(c) * 1.4142;

  vec3 edgeCol = vec3(0.32, 0.72, 1.0);
  col += edgeCol * pow(smoothstep(0.55, 1.05, r), 2.0) * uEdge * 1.5;

  float open = 1.0 - uIris * 0.85;
  float ring = exp(-pow((r - open) * 7.0, 2.0));
  col += vec3(1.0, 0.93, 0.82) * ring * uIris * 2.4;

  float inside = smoothstep(open + 0.02, open - 0.08, r);
  col += vec3(1.0, 0.96, 0.88) * inside * uIris * 0.45;

  outputColor = vec4(col, inputColor.a);
}
`

class MembraneFx extends Effect {
  constructor() {
    super('MembraneFx', frag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uIris', new THREE.Uniform(0)],
        ['uDesat', new THREE.Uniform(0)],
        ['uDistort', new THREE.Uniform(0)],
        ['uEdge', new THREE.Uniform(0)],
        ['uTime', new THREE.Uniform(0)],
      ]),
    })
  }

  update(): void {
    const u = this.uniforms
    u.get('uIris')!.value = sim.iris
    u.get('uDesat')!.value = sim.desat
    u.get('uDistort')!.value = sim.distort
    u.get('uEdge')!.value = sim.edge
    u.get('uTime')!.value = sim.now
  }
}

export const MembranePass = wrapEffect(MembraneFx) as unknown as FC
