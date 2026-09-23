// Local synthesis. Filtered noise conveys motion; no external audio.
class Soundscape {
 private context:AudioContext|null=null;private master:GainNode|null=null;private bed:GainNode|null=null;
 private generation=0;
 private nodes:OscillatorNode[]=[];private enabled=false;private volume=.36;private noise:AudioBuffer|null=null;private lastMotion=0;
 async enable(enabled:boolean,volume=this.volume,ambient=true){
  const generation=++this.generation;this.enabled=enabled;this.volume=volume;
  if(!enabled){if(this.context&&this.master)this.master.gain.setTargetAtTime(0,this.context.currentTime,.12);return;}
  if(!this.context){const AC=window.AudioContext||(window as any).webkitAudioContext;if(!AC)return;
   const c=this.context=new AC(),m=this.master=c.createGain();m.gain.value=0;
   const limiter=c.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.008;limiter.release.value=.3;m.connect(limiter);limiter.connect(c.destination);
   this.bed=c.createGain();this.bed.gain.value=0;this.bed.connect(m);
   [55,82.4069,110.15,164.81,220.2].forEach((freq,i)=>{const o=c.createOscillator(),g=c.createGain(),pan=c.createStereoPanner();o.type='sine';o.frequency.value=freq;g.gain.value=.02/(1+i*.35);pan.pan.value=(i-2)*.35;o.connect(g);g.connect(pan);pan.connect(this.bed!);o.start();this.nodes.push(o);});
   this.noise=c.createBuffer(1,c.sampleRate*3,c.sampleRate);const data=this.noise.getChannelData(0);let smooth=0;for(let i=0;i<data.length;i++){smooth=(smooth+(Math.random()*2-1)*.11)/1.11;data[i]=smooth;}
  }
  const context=this.context;try{await context.resume();}catch{return;}
  if(generation!==this.generation||context!==this.context||!this.enabled||!this.master||!this.bed)return;
  this.master!.gain.setTargetAtTime(volume,this.context.currentTime,.2);this.bed!.gain.setTargetAtTime(ambient?1:0,this.context.currentTime,1.2);
 }
 cue(kind:'select'|'open'|'intro'|'close'|'arrival'='select'){
  const c=this.context,m=this.master;if(!this.enabled||!c||!m||c.state==='closed')return;
  this.despertar();
  const notes=kind==='intro'?[110,164.81,220,329.63]:kind==='open'?[146.83,220]:kind==='arrival'?[220,329.63,440]:kind==='close'?[164.81]:[330,495];
  notes.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner(),t=c.currentTime+i*(kind==='intro'?.28:.065),length=kind==='intro'?2.8:kind==='arrival'?1.2:kind==='open'?.85:.28;
   o.type='sine';o.frequency.value=f;o.detune.value=i*.9;p.pan.value=(i-(notes.length-1)/2)*.25;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(kind==='intro'?.055:.028,t+.055);g.gain.exponentialRampToValueAtTime(.0001,t+length);o.connect(g);g.connect(p);p.connect(m);o.start(t);o.stop(t+length+.05);o.onended=()=>{o.disconnect();g.disconnect();p.disconnect();};});
 }
 private sweep(duration:number,level:number,pan:number,enter=false){
  const c=this.context;if(!this.enabled||!c||!this.master||!this.noise||c.state==='closed')return;
  this.despertar();
  const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),p=c.createStereoPanner(),t=c.currentTime;s.buffer=this.noise;f.type='bandpass';f.Q.value=.65;f.frequency.setValueAtTime(enter?150:380,t);f.frequency.exponentialRampToValueAtTime(enter?1800:620,t+duration*.65);f.frequency.exponentialRampToValueAtTime(180,t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+duration*.3);g.gain.exponentialRampToValueAtTime(.0001,t+duration);p.pan.setValueAtTime(Math.max(-.65,Math.min(.65,pan)),t);p.pan.linearRampToValueAtTime(0,t+duration);s.connect(f);f.connect(g);g.connect(p);p.connect(this.master);s.start(t);s.stop(t+duration+.02);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();p.disconnect();};
 }
 /* El navegador deja sonar solo después de un toque. Los avisos llegan justo
    DENTRO de ese toque (tocar un mundo), así que es el momento de despertar el
    audio; y si la casa tiene música, se agacha para que el aviso se oiga. */
 private despertar(){const c=this.context;if(c&&c.state==='suspended')void c.resume().catch(()=>{});try{(window as any).__AE_AGACHAR?.(900);}catch{}}
 motion(velocity:number,direction:number){const t=this.context?.currentTime||0;if(t-this.lastMotion<.12||velocity<1)return;this.lastMotion=t;this.sweep(.22,Math.min(.15,.025+velocity*.002),direction*.025);}
 travel(kind:'focus'|'enter'){this.sweep(kind==='enter'?2:.65,kind==='enter'?.3:.13,kind==='enter'?-.45:.3,kind==='enter');}
 suspend(){++this.generation;void this.context?.suspend().catch(()=>{});}
 dispose(){++this.generation;this.enabled=false;this.lastMotion=0;this.nodes.forEach(n=>{try{n.stop();}catch{}});this.nodes=[];void this.context?.close().catch(()=>{});this.context=null;this.master=null;this.bed=null;this.noise=null;}
}
export const sound=new Soundscape();
