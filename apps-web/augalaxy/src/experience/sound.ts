// All sounds are synthesized locally. No music recordings or network requests.
class Soundscape {
 private context:AudioContext|null=null;private master:GainNode|null=null;
 private bed:GainNode|null=null;private nodes:OscillatorNode[]=[];private enabled=false;private volume=.36;
 async enable(enabled:boolean,volume=this.volume,ambient=true){
  this.enabled=enabled;this.volume=volume;
  if(!enabled){if(this.context&&this.master)this.master.gain.setTargetAtTime(0,this.context.currentTime,.18);return;}
  if(!this.context){const AC=window.AudioContext||(window as any).webkitAudioContext;if(!AC)return;
   const c=this.context=new AC();const m=this.master=c.createGain();m.gain.value=0;
   const limit=c.createDynamicsCompressor();limit.threshold.value=-12;limit.knee.value=8;limit.ratio.value=12;limit.attack.value=.008;limit.release.value=.3;m.connect(limit);limit.connect(c.destination);
   this.bed=c.createGain();this.bed.gain.value=0;this.bed.connect(m);
   [55,82.4069,110.15,164.81,220.2].forEach((freq,i)=>{const o=c.createOscillator(),g=c.createGain(),pan=c.createStereoPanner();o.type='sine';o.frequency.value=freq;g.gain.value=.024/(1+i*.35);pan.pan.value=(i-2)*.35;o.connect(g);g.connect(pan);pan.connect(this.bed!);o.start();this.nodes.push(o);});
  }
  try{await this.context.resume();}catch{return;}
  this.master!.gain.setTargetAtTime(volume,this.context.currentTime,.3);
  this.bed!.gain.setTargetAtTime(ambient?1:0,this.context.currentTime,1.2);
 }
 cue(kind:'select'|'open'|'intro'|'close'='select'){
  const c=this.context,m=this.master;if(!this.enabled||!c||!m||c.state!=='running')return;
  const notes=kind==='intro'?[110,164.81,220,329.63]:kind==='open'?[220,329.63]:kind==='close'?[164.81]:[440,660];
  notes.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner();const t=c.currentTime+i*(kind==='intro'?.35:.04);const length=kind==='intro'?3:kind==='open'?.9:.25;
   o.type='sine';o.frequency.value=f;o.detune.value=i*.9;p.pan.value=(i-(notes.length-1)/2)*.25;
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(kind==='intro'?.07:.036,t+.06);g.gain.exponentialRampToValueAtTime(.0001,t+length);g.gain.linearRampToValueAtTime(0,t+length+.1);
   o.connect(g);g.connect(p);p.connect(m);o.start(t);o.stop(t+length+.12);o.onended=()=>{o.disconnect();g.disconnect();p.disconnect();};
  });
 }
 suspend(){void this.context?.suspend();}
 dispose(){this.nodes.forEach(n=>{try{n.stop();}catch{}});this.nodes=[];void this.context?.close();this.context=null;this.master=null;this.bed=null;}
}
export const sound=new Soundscape();
