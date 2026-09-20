export const noiseGLSL=`
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.03+vec3(7.1,1.7,9.2);a*=.5;}return v;}
`;
export const planetVertex=`
varying vec3 vP; varying vec3 vN; varying vec3 vWorld;varying vec2 vUv;
void main(){vP=normalize(position);vN=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
export const planetFragment=`
precision highp float;
uniform vec3 uColor;uniform vec3 uSecondary;uniform float uKind;uniform float uSeed;
uniform sampler2D uMap;uniform float uHasMap;
varying vec3 vP;varying vec3 vN;varying vec3 vWorld;varying vec2 vUv;
${noiseGLSL}
void main(){
 vec3 p=vP;float n=fbm(p*4.+uSeed);float fine=fbm(p*64.+uSeed);
 vec3 col;float sea=0.;
 if(uKind<.5){
  float curl=fbm(vec3(p.x*5.,p.y*16.,p.z*5.)+uSeed);
  float bands=sin(p.y*58.+curl*9.)*.5+.5;
  float thread=sin(p.y*280.+curl*24.)*.5+.5;
  col=mix(uSecondary,uColor,.2+.8*bands);
  col=mix(col,vec3(.87,.78,.6),pow(thread,7.)*.2);
  col*=.8+fine*.3;
 }else if(uKind<1.5){
  float continent=fbm(p*3.2+vec3(uSeed,2.,1.));
  sea=1.-smoothstep(.49,.525,continent);
  vec3 ocean=mix(uSecondary,uColor,noise3(p*8.)*.45)*.8;
  vec3 land=mix(vec3(.08,.17,.12),vec3(.48,.42,.27),smoothstep(.5,.7,continent));
  land*=.7+fine*.8;
  col=mix(land,ocean,sea);
  float ice=smoothstep(.86,.98,abs(p.y)+n*.13);
  col=mix(col,vec3(.78,.88,.9),ice);
 }else if(uKind<2.5){
  float craters=pow(1.-abs(noise3(p*34.+uSeed)*2.-1.),12.);
  float ridges=pow(abs(fbm(p*13.+uSeed)-.5)*2.,.7);
  col=mix(uSecondary,uColor,smoothstep(.23,.73,n))*(.7+fine*.6);
  col*=1.-craters*.15;
  col+=ridges*.09;
 }else{
  float rock=fbm(p*8.+uSeed);
  float vein=1.-smoothstep(.025,.062,abs(fbm(p*14.+uSeed)-.5));
  col=mix(uSecondary,uColor,rock)*(.62+fine*.65);
  col+=vec3(.9,.24,.04)*pow(vein,7.)*.33;
 }
 if(uHasMap>.5){col=texture2D(uMap,vUv).rgb;if(uKind>1.5&&uKind<2.5)col*=mix(vec3(.7),uColor,.3);}
 vec3 N=normalize(vN);
 vec3 L=normalize(-vWorld);
 float light=dot(N,L);
 float grain=(fine-.5)*.18;
 float diffuse=smoothstep(-.13,.86,light+grain);
 col*=.12+diffuse*1.55;
 vec3 V=normalize(cameraPosition-vWorld);
 float spec=pow(max(0.,dot(reflect(-L,N),V)),65.)*sea*.45;
 col+=vec3(.8,.9,1.)*spec;
 float rim=pow(1.-max(0.,dot(N,V)),4.);
 col+=uColor*rim*.13*max(.2,light);
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const cloudFragment=`
uniform float uTime;uniform vec3 uTint;
varying vec3 vP;varying vec3 vN;varying vec3 vWorld;varying vec2 vUv;
${noiseGLSL}
void main(){
 float curl=fbm(vP*3.+uTime*.005);
 float cloud=fbm(vP*9.+vec3(curl*3.,uTime*.008,0.));
 float a=smoothstep(.53,.7,cloud)*.8;
 float light=smoothstep(-.1,.8,dot(normalize(vN),normalize(-vWorld)));
 gl_FragColor=vec4(mix(vec3(.18,.25,.32),uTint,light),a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const atmoFragment=`
uniform vec3 uTint;
varying vec3 vP;varying vec3 vN;varying vec3 vWorld;varying vec2 vUv;
void main(){
 vec3 V=normalize(cameraPosition-vWorld);
 float rim=pow(1.-abs(dot(normalize(vN),V)),3.8);
 float sun=max(.12,dot(normalize(vN),normalize(-vWorld)));
 gl_FragColor=vec4(uTint,rim*.65*sun);
}`;
export const pointVertex=`
attribute float aSize;attribute float aPhase;varying vec3 vColor;varying float vAlpha;
uniform float uTime;uniform float uScale;uniform float uOpacity;
void main(){vColor=color;vAlpha=(.8+.2*sin(uTime*.4+aPhase))*uOpacity;vec4 mv=modelViewMatrix*vec4(position,1.);
gl_PointSize=clamp(aSize*uScale/max(1.,-mv.z),1.,35.);gl_Position=projectionMatrix*mv;}
`;
export const pointFragment=`
varying vec3 vColor;varying float vAlpha;
void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=exp(-d*d*5.)*(1.-smoothstep(.6,1.,d));gl_FragColor=vec4(vColor,a*vAlpha);}
`;
