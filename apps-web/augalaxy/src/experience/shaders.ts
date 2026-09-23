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

/* ── LOS MUNDOS DE ORDEN GLOBAL ───────────────────────────────────────────
   Antes eran la Tierra, Marte, Júpiter, Saturno y la Luna con otro nombre:
   dos Tierras, tres Lunas, un sistema solar de libro de escuela. Estos son de
   la casa: la misma familia —oro, obsidiana, verde veta— y cada uno con un
   rasgo que dice qué hace. Sus líneas brillan por sí solas, así que también se
   leen en la cara de noche: eso es lo que los hace sentir vivos.
     0 wallet  gigante de oro con bandas e hilos
     1 gid     obsidiana con retícula hexagonal que late (la identidad)
     2 chat    océano profundo con corrientes de luz (la conversación)
     3 pay     esmeralda con vetas de oro como circuito (el comercio)
     4 scan    hielo con una franja de lectura que recorre el mundo (la cadena a la vista)
     5 oxch    hierro con grietas de brasa (la forja del cambio)
     6 aucorp  bronce con anillos de bóveda (la casa de cuentas)
     7 minas   roca con vetas de oro vivo (el metal en la piedra)
     8 dbnx    acero con cuadrícula (la norma) */
export const brandFragment=`
precision highp float;
uniform vec3 uColor;uniform float uNat;uniform float uSeed;uniform float uTime;uniform float uPulse;
varying vec3 vP;varying vec3 vN;varying vec3 vWorld;varying vec2 vUv;
${noiseGLSL}
float hexLine(vec2 p){vec2 r=vec2(1.,1.7320508),h=r*.5;vec2 a=mod(p,r)-h,b=mod(p-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;vec2 q=abs(g);float d=max(dot(q,vec2(.8660254,.5)),q.x);return 1.-smoothstep(.0,.06,.5-d);}
float gridLine(vec2 p,float w){vec2 f=abs(fract(p)-.5);return 1.-smoothstep(.5-w,.5,max(f.x,f.y));}
void main(){
 vec3 p=vP;float n=fbm(p*4.+uSeed);float fine=fbm(p*48.+uSeed);
 vec2 sph=vec2(atan(p.z,p.x)/6.2831853,asin(clamp(p.y,-1.,1.))/3.1415927);
 vec3 col;vec3 emis=vec3(0.);float gloss=0.;
 if(uNat<.5){ // oro
  float curl=fbm(vec3(p.x*4.,p.y*14.,p.z*4.)+uSeed+uTime*.004);
  float bands=sin(p.y*46.+curl*8.)*.5+.5;float thread=pow(sin(p.y*230.+curl*22.)*.5+.5,9.);
  col=mix(vec3(.25,.16,.06),vec3(.93,.74,.38),.18+.82*bands);col=mix(col,vec3(1.,.9,.62),thread*.35);col*=.82+fine*.3;
  emis=vec3(1.,.78,.4)*thread*.08;gloss=.25;
 }else if(uNat<1.5){ // obsidiana + retícula
  col=vec3(.035,.06,.06)*(.7+fine*.7);
  float l=hexLine(sph*vec2(22.,11.));float wave=.55+.45*sin(uTime*1.6-length(p.xz)*6.+p.y*5.);
  emis=vec3(.33,.86,.76)*l*wave*.9;col+=vec3(.12,.3,.28)*l*.4;gloss=.6;
 }else if(uNat<2.5){ // océano de corrientes
  vec3 q=p*3.;q.x+=uTime*.02;float w=fbm(q+fbm(q*1.7+uSeed));
  float c=pow(1.-abs(sin(w*18.+p.y*6.)),10.);
  col=mix(vec3(.01,.08,.11),vec3(.03,.24,.29),n);emis=vec3(.25,.85,.95)*c*.55;gloss=.8;
 }else if(uNat<3.5){ // esmeralda con vetas de oro
  col=mix(vec3(.02,.13,.09),vec3(.08,.36,.25),smoothstep(.3,.75,n))*(.75+fine*.5);
  float v=1.-smoothstep(.0,.035,abs(fbm(p*6.+uSeed)-.5));float v2=1.-smoothstep(.0,.02,abs(fbm(p*15.+uSeed+3.)-.5));
  float vena=max(v,v2*.6);col=mix(col,vec3(.85,.66,.3),vena*.5);emis=vec3(1.,.76,.35)*vena*(.35+.25*sin(uTime*1.3+n*9.));gloss=.4;
 }else if(uNat<4.5){ // hielo con lectura
  col=mix(vec3(.55,.68,.76),vec3(.9,.96,.99),smoothstep(.25,.8,n))*(.85+fine*.25);
  float lat=gridLine(vec2(sph.x*36.,sph.y*18.),.03);col=mix(col,vec3(.4,.6,.75),lat*.35);
  float franja=exp(-pow((sph.y-(fract(uTime*.05)*1.2-.6))*14.,2.));
  emis=vec3(.55,.85,1.)*(franja*.7+lat*franja*1.2);gloss=.9;
 }else if(uNat<5.5){ // hierro y brasa
  col=vec3(.09,.07,.065)*(.6+fine*.9);
  float grieta=1.-smoothstep(.0,.04,abs(fbm(p*5.+uSeed)-.5));float g2=1.-smoothstep(.0,.025,abs(fbm(p*12.+uSeed+1.)-.5));
  float brasa=max(grieta,g2*.7)*(.7+.3*sin(uTime*2.+n*12.));emis=vec3(1.,.38,.08)*brasa*.9;gloss=.2;
 }else if(uNat<6.5){ // bronce de bóveda
  float anillos=sin(abs(sph.y)*120.)*.5+.5;
  col=mix(vec3(.28,.2,.1),vec3(.74,.58,.32),smoothstep(.2,.8,n)*.6+anillos*.4)*(.8+fine*.35);
  float grabado=pow(anillos,14.);emis=vec3(1.,.8,.45)*grabado*.12;gloss=.55;
 }else if(uNat<7.5){ // roca con oro vivo
  col=mix(vec3(.08,.07,.06),vec3(.26,.22,.18),fbm(p*7.+uSeed))*(.6+fine*.8);
  float vena=1.-smoothstep(.0,.03,abs(fbm(p*9.+uSeed)-.5));float pepita=smoothstep(.78,.86,fbm(p*30.+uSeed));
  col=mix(col,vec3(.95,.74,.32),vena*.7);emis=vec3(1.,.75,.3)*(vena*.55+pepita*.8);gloss=.35;
 }else{ // acero con cuadrícula
  col=mix(vec3(.08,.11,.17),vec3(.25,.32,.44),n)*(.8+fine*.4);
  float l=gridLine(vec2(sph.x*28.,sph.y*14.),.04);float on=step(.72,hash(floor(vec3(sph.x*28.,sph.y*14.,uSeed))));
  emis=vec3(.62,.75,.95)*(l*.35+on*(1.-l)*.25*(.5+.5*sin(uTime*2.+sph.x*40.)));gloss=.7;
 }
 vec3 N=normalize(vN);vec3 L=normalize(-vWorld);float light=dot(N,L);
 float diffuse=smoothstep(-.13,.86,light+(fine-.5)*.18);
 col*=.10+diffuse*1.55;
 vec3 V=normalize(cameraPosition-vWorld);
 col+=vec3(1.,.93,.8)*pow(max(0.,dot(reflect(-L,N),V)),48.)*gloss*.5;
 float rim=pow(1.-max(0.,dot(N,V)),3.5);
 col+=uColor*rim*(.22+.25*uPulse)*max(.25,light);
 col+=emis*(1.+uPulse*.8);
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const NATURA:Record<string,number>={wallet:0,gid:1,chat:2,pay:3,scan:4,oxch:5,aucorp:6,minas:7,dbnx:8,ajustes:4};
