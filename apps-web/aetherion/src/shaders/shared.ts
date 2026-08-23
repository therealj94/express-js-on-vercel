export const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){
  float a=0.0;float w=0.5;
  for(int i=0;i<4;i++){a+=w*snoise(p);p*=2.15;w*=0.5;}
  return a;
}
`

export function atmosphereFragment(extra = '') {
  return /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uDensity;
uniform float uBoost;
varying vec3 vN;
varying vec3 vW;
${SNOISE}
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float d = dot(V, normalize(vN));
  float fr = pow(clamp(0.68 + d, 0.0, 1.0), 3.0);
  float n = fbm(normalize(vW) * 2.4 + vec3(0.0, uTime * 0.05, uTime * 0.02)) * 0.5 + 0.5;
  float alpha = fr * (0.55 + n * 0.6) * uDensity * (1.0 + uBoost * 1.7);
  vec3 col = uColor * (1.0 + uBoost * 1.3);
  ${extra}
  gl_FragColor = vec4(col, alpha);
}
`
}

export function atmosphereVertex() {
  return /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
}

export function dustVertex() {
  return /* glsl */ `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uPixelRatio;
varying float vTw;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.05 + aSeed * 17.0) * 0.6;
  p.y += cos(uTime * 0.04 + aSeed * 23.0) * 0.35;
  p.z += sin(uTime * 0.06 + aSeed * 29.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPixelRatio * (46.0 / max(1.0, -mv.z));
  vTw = 0.55 + 0.45 * sin(uTime * (0.4 + aSeed) + aSeed * 40.0);
  gl_Position = projectionMatrix * mv;
}
`
}

export function dustFragment() {
  return /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vTw;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float a = smoothstep(0.25, 0.0, r2) * vTw * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`
}
