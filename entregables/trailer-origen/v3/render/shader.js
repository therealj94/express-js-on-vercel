window.FS=`#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT, uTopY, uR, uPlanet, uDawn, uFlash, uSeed, uSpeed, uScale;
uniform int uMat;
uniform int uMode;
uniform float uDiscY, uDiscR;
out vec4 o;

float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n=h21(p); return vec2(n,h21(p+n)); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float a=.5,s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){ s+=a*noise(p); p=m*p; a*=.5; } return s; }
// x: distancia al centro de la celda, y: distancia al borde, z: id de celda
vec3 voro(vec2 x){
  vec2 n=floor(x), f=fract(x), mg=vec2(0), mr=vec2(0); float md=8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g=vec2(i,j); vec2 r=g+h22(n+g)-f; float d=dot(r,r);
    if(d<md){ md=d; mr=r; mg=g; } }
  float me=8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g=mg+vec2(i,j); vec2 r=g+h22(n+g)-f;
    if(dot(mr-r,mr-r)>1e-5) me=min(me, dot(.5*(mr+r), normalize(r-mr))); }
  return vec3(length(mr), me, h21(n+mg));
}

struct M { vec3 c; float h; float e; float g; };

vec3 aguayoPal(float i){
  i=mod(i,7.);
  if(i<1.) return vec3(.86,.08,.42);
  if(i<2.) return vec3(.97,.45,.05);
  if(i<3.) return vec3(.98,.80,.12);
  if(i<4.) return vec3(.06,.52,.28);
  if(i<5.) return vec3(.10,.16,.55);
  if(i<6.) return vec3(.78,.06,.10);
  return vec3(.05,.03,.05);
}
vec3 strataPal(float i){
  i=mod(i,6.);
  if(i<1.) return vec3(.60,.18,.12);
  if(i<2.) return vec3(.86,.55,.20);
  if(i<3.) return vec3(.90,.80,.58);
  if(i<4.) return vec3(.30,.50,.42);
  if(i<5.) return vec3(.55,.33,.45);
  return vec3(.74,.34,.17);
}

M material(int id, vec2 uv, float t){
  M m; m.e=0.; m.g=.3;
  if(id==0){ // oro fundido
    vec2 q=uv*1.1; float w=fbm(q+vec2(0.,t*.07));
    float f=fbm(q*1.3+w*2.3+vec2(t*.04,0.));
    m.h=f;
    m.c=mix(vec3(.30,.14,.02), vec3(.95,.64,.20), smoothstep(.25,.72,f));
    m.c=mix(m.c, vec3(1.,.88,.58), smoothstep(.68,.92,f));
    m.g=1.2;
  } else if(id==1){ // sal · Uyuni
    vec3 v=voro(uv*2.6);
    float ridge=1.-smoothstep(0.,.07,v.y);
    m.h=ridge*.7+fbm(uv*18.)*.12;
    m.c=mix(vec3(.74,.77,.86), vec3(.99,.97,.94), ridge*.8+.25*fbm(uv*7.));
    m.c*= .92+.08*v.z; m.g=.35;
  } else if(id==2){ // mar Caribe
    vec2 w=uv*3.+vec2(fbm(uv*1.7+t*.25), fbm(uv*1.7-t*.21))*1.3;
    vec3 v=voro(w);
    float l=pow(1.-smoothstep(0.,.16,v.y),2.2);
    m.c=mix(vec3(0.,.20,.30), vec3(.02,.58,.64), fbm(uv*1.2+t*.05))+l*vec3(.55,1.,.92)*.8;
    m.h=l*.35; m.g=1.;
  } else if(id==3){ // estratos · Vinicunca
    float y=uv.y*2.6+uv.x*.5+fbm(uv*1.1)*1.7;
    float id2=floor(y); float b=fract(y);
    m.c=strataPal(id2)*(.78+.35*fbm(uv*9.));
    m.h=b*.35+fbm(uv*7.)*.45; m.g=.08;
  } else if(id==4){ // hoja · Amazonía
    vec2 r=vec2(uv.x, mod(uv.y,1.6)-.8);
    float mid=abs(r.y-.05*sin(r.x*2.));
    float side=abs(fract(r.x*1.4+abs(r.y)*1.3)-.5);
    float vein=smoothstep(.035,0.,mid)+smoothstep(.028,0.,side)*.8*smoothstep(0.,.08,abs(r.y));
    vec3 v=voro(uv*8.); float micro=1.-smoothstep(0.,.045,v.y);
    m.c=mix(vec3(.03,.20,.05), vec3(.22,.52,.10), fbm(uv*2.5));
    m.c=mix(m.c, vec3(.70,.88,.32), clamp(max(vein,micro*.35),0.,1.));
    m.h=vein*.5+micro*.2; m.g=.6; m.e=vein*.12;
  } else if(id==5){ // aguayo · Andes
    float y=uv.y*7.; float id2=floor(y); float fy=fract(y);
    float band=floor(h21(vec2(id2,3.))*7.);
    vec3 c=aguayoPal(band);
    float d=abs(fract(uv.x*2.2)-.5)+abs(fy-.5);
    float motif=step(.5,h21(vec2(id2,9.)))*(step(d,.34)-step(d,.2));
    c=mix(c, aguayoPal(band+3.), motif);
    float weave=.82+.18*sin(uv.x*140.)*sin(uv.y*140.);
    m.c=c*weave*(.85+.2*fbm(uv*5.)); m.h=weave*.25+motif*.2; m.g=.1;
  } else if(id==6){ // basalto y lava
    vec3 v=voro(uv*2.2);
    float crack=1.-smoothstep(0.,.05,v.y);
    m.c=vec3(.07,.065,.065)*(.55+.9*fbm(uv*11.));
    float pulse=.75+.25*sin(t*3.+v.z*6.28);
    m.e=(crack+exp(-v.y*22.)*.5)*pulse;
    m.h=smoothstep(0.,.12,v.y)*.6+fbm(uv*9.)*.25; m.g=.5;
  } else if(id==7){ // piedra escalonada · Mitla
    vec2 g=floor(uv*9.);
    float k=mod(g.x+abs(mod(g.y,14.)-7.),7.);
    float bit=step(k,1.5);
    vec3 stone=vec3(.74,.63,.48)*(.68+.5*fbm(uv*6.));
    m.c=mix(stone*.42, stone, bit); m.h=bit*.9+fbm(uv*14.)*.15; m.g=.08;
  } else { // cacao
    float f=fbm(uv*1.4+fbm(uv*1.4+vec2(t*.09,0.))*1.9);
    m.c=mix(vec3(.06,.018,.01), vec3(.36,.12,.05), smoothstep(.3,.72,f));
    m.c=mix(m.c, vec3(.55,.25,.14), smoothstep(.75,.95,f)*.6);
    m.h=f; m.g=1.4;
  }
  return m;
}

void main(){
  float s=uScale;
  vec2 p=vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y)/s;   // píxeles del lienzo final
  if(uMode==1){
    vec2 dd=(p-vec2(540.,uDiscY))/uDiscR; float r=length(dd);
    float a=1.-smoothstep(.994,1.,r);
    if(a<=0.){ o=vec4(0.); return; }
    vec2 uv=dd*1.5+vec2(uT*.02,uT*.01);
    M m=material(0,uv,uT);
    float bev=smoothstep(.84,.995,r);
    float h=m.h*.35+bev*.9;
    vec3 n=normalize(vec3(-dFdx(h)*60., dFdy(h)*60., 1.));
    vec3 L=normalize(vec3(-.45,.6,.65));
    float dif=.35+.85*max(dot(n,L),0.);
    vec3 Hh=normalize(L+vec3(0.,0.,1.));
    float sp=pow(max(dot(n,Hh),0.),48.)*1.3;
    vec3 c=mix(vec3(.95,.66,.22),m.c,.55)*dif+sp*vec3(1.,.92,.75);
    float sweep=exp(-pow((dd.x+dd.y*.6)-(mod(uT*.35,3.)-1.5),2.)*18.)*.35;
    c+=sweep*vec3(1.,.9,.7);
    c=1.-exp(-c*1.25);
    o=vec4(c*a,a); return;
  }
  vec2 c=vec2(540., uTopY+uR);
  vec2 q=p-c; float d=length(q); float edge=uR-d;
  float yh=c.y-sqrt(max(uR*uR-q.x*q.x,0.));

  // cielo
  vec3 col=mix(vec3(.008,.010,.022), vec3(.028,.030,.052), p.y/1920.);
  float above=max(-edge,0.);
  col+=uDawn*vec3(1.,.50,.16)*exp(-above/260.)*.55;
  col+=uDawn*vec3(1.,.78,.45)*exp(-above/30.)*.65;
  float st=step(.9975,h21(floor(p/3.)+uSeed*.0))*smoothstep(0.,400.,above)*.5;
  col+=st*vec3(.9,.9,1.)*(1.-uDawn*.6);

  if(uPlanet>0.001){
    float dy=max(p.y-yh,0.);
    float dist=230./(dy+7.);
    vec2 uv=vec2((p.x-540.)/540.*dist*.85, dist+uT*uSpeed)+vec2(uSeed*3.7,uSeed*1.3);
    M m=material(uMat, uv, uT);
    float bump=55.*smoothstep(25.,260.,dy);
    vec3 n=normalize(vec3(-dFdx(m.h)*bump, dFdy(m.h)*bump, 1.));
    vec3 L=normalize(vec3(.25,.75,.55));
    float dif=.32+.8*max(dot(n,L),0.);
    vec3 Hh=normalize(L+vec3(0.,0.,1.));
    float sp=pow(max(dot(n,Hh),0.),36.)*m.g*smoothstep(15.,200.,dy);
    vec3 g=m.c*dif+sp*vec3(1.,.9,.72)+m.e*vec3(1.,.36,.06)*1.6;
    float fog=exp(-dy/105.);
    vec3 fogc=mix(vec3(.55,.34,.14), vec3(1.,.74,.38), uDawn);
    g=mix(g, fogc, fog*.92);
    g*=mix(1., smoothstep(1.35,.15,dy/800.), .55);
    float inside=smoothstep(-1.2,1.2,edge);
    float rim=exp(-abs(edge)/1.6)*1.1+exp(-abs(edge)/9.)*.35;
    col=mix(col, g, inside*uPlanet);
    col+=rim*vec3(1.,.84,.55)*uPlanet;
  }
  col+=uFlash*vec3(1.,.86,.62)*.45;
  col=1.-exp(-col*1.25);
  o=vec4(col,1.);
}`;
