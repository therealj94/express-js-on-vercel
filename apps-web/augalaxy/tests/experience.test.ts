import test from 'node:test';
import assert from 'node:assert/strict';
import {measureHand} from '../src/experience/airtouch';
import {usePreferences} from '../src/experience/preferences';
import {navigation,useExperience} from '../src/experience/navigation';
import {readExperience,navigateExperience} from '../src/experience/webmcp';
import {lookAtWorld,highlightWorld,touchWorld,transitionState,viewControls,entryTiming,FLIGHT_MS} from '../src/experience/hostBridge';
import {updateOrbits,orbitPositions,CameraDirector} from '../src/experience/cosmos';
test('Incomplete or degenerate hand landmarks are rejected',()=>{assert.equal(measureHand([]),null);assert.equal(measureHand(Array.from({length:21},()=>({x:0,y:0}))),null);});
test('Pinch measurement is independent of hand scale',()=>{const p=Array.from({length:21},()=>({x:.3,y:.3}));p[17]={x:.5,y:.3};p[4]={x:.4,y:.3};p[8]={x:.42,y:.3};const h=measureHand(p)!;assert.ok(Math.abs(h.pinch-.1)<1e-6);assert.ok(Math.abs(measureHand(p.map(v=>({x:v.x*2,y:v.y*2})))!.pinch-h.pinch)<1e-6);});
test('Preferences clamp values and reject invalid enums',()=>{usePreferences.getState().set({volume:99,textScale:-9,lang:'invalid' as never});const p=usePreferences.getState().prefs;assert.ok(p.volume<=.7);assert.ok(p.textScale>=1);assert.equal(p.lang,'es');usePreferences.getState().reset();});
test('Zoom and orbit stay bounded; overview zoom opens deep space',()=>{navigation.home();navigation.dolly(100000);assert.equal(useExperience.getState().stage,'galaxies');navigation.dolly(100000);assert.equal(navigation.zoom,3);navigation.dolly(.0000001);assert.equal(navigation.zoom,.6);navigation.orbit(0,99999);assert.equal(navigation.pitch,1.18);navigation.home();});
test('Navigation uses the visible preview state',()=>{navigateExperience({destination:'chat'});assert.equal(useExperience.getState().selected,'chat');navigateExperience({destination:'settings'});assert.equal(useExperience.getState().settings,true);assert.equal(readExperience({}).accountsConnected,false);});
test('Invalid navigation does not mutate state',()=>{const before=useExperience.getState();assert.throws(()=>navigateExperience({destination:'withdraw'}));assert.equal(useExperience.getState(),before);assert.throws(()=>readExperience({token:'not-used'}));});
test('Focusing never opens an app; completion opens only the current journey',()=>{useExperience.getState().set({settings:false});navigation.focus('chat');assert.equal(useExperience.getState().windowId,null);navigation.enter('chat');const first=useExperience.getState().journey!;assert.equal(transitionState().active,true);navigation.focus('gid');navigation.complete(first.token);assert.equal(useExperience.getState().windowId,null);navigation.enter('gid');const second=useExperience.getState().journey!;navigation.complete(first.token);assert.equal(useExperience.getState().stage,'transit');navigation.complete(second.token);assert.equal(useExperience.getState().windowId,'gid');navigation.home();});
test('Reduced motion preserves destination and settings enter through the same flight',()=>{usePreferences.getState().set({motion:'reduced'});navigation.enter('ajustes');assert.equal(useExperience.getState().journey!.duration,120);navigation.complete(useExperience.getState().journey!.token);assert.equal(useExperience.getState().settings,true);assert.equal(useExperience.getState().windowId,null);useExperience.getState().set({settings:false});navigation.home();usePreferences.getState().reset();});
test('Renderer and orbit preferences survive validation; invalid renderer defaults to Pro',()=>{usePreferences.getState().set({defaultRenderer:'lite',autoOrbit:false});assert.equal(usePreferences.getState().prefs.defaultRenderer,'lite');assert.equal(usePreferences.getState().prefs.autoOrbit,false);usePreferences.getState().set({defaultRenderer:'unknown' as never});assert.equal(usePreferences.getState().prefs.defaultRenderer,'pro');usePreferences.getState().reset();});
test('Legacy gesture bridge returns the host shape and respects visible state',()=>{navigation.home();navigation.hitTest=()=> 'chat';assert.deepEqual(lookAtWorld(20,20),{key:'chat',nombre:'PULSE2CHAT'});highlightWorld('chat');assert.equal(useExperience.getState().hovered,'chat');touchWorld('chat');assert.equal(transitionState().wid,'chat');assert.equal(lookAtWorld(20,20),null);navigation.home();viewControls.zoom(.8);assert.equal(navigation.zoom,.8);viewControls.zoom(NaN);assert.equal(navigation.zoom,.8);viewControls.girar(NaN,3);assert.equal(navigation.yaw,0);navigation.hitTest=()=>null;navigation.home();});
test('GENESIS CORE remains the center while apps orbit it',()=>{navigation.home();usePreferences.getState().set({motion:'full',autoOrbit:true});navigation.lastInteraction=0;updateOrbits(10000,.03);const p=orbitPositions.get('chat')!.clone();updateOrbits(10040,.03);assert.deepEqual(orbitPositions.get('genesis')!.toArray(),[0,0,0]);assert.ok(p.distanceTo(orbitPositions.get('chat')!)>0);navigation.focus('chat');const frozen=orbitPositions.get('chat')!.clone();updateOrbits(10080,.03);assert.equal(frozen.distanceTo(orbitPositions.get('chat')!),0);navigation.home();usePreferences.getState().reset();});
test('Drag follows the hand and sensitivity has safe bounds',()=>{navigation.home();navigation.orbit(100,0);assert.ok(navigation.yaw<0);assert.ok(Math.abs(navigation.yaw-.0+.42)<.00001);usePreferences.getState().set({orbitSensitivity:99});assert.equal(usePreferences.getState().prefs.orbitSensitivity,1.4);navigation.home();usePreferences.getState().reset();});

import {PerspectiveCamera} from 'three';
test('Selecting an app preserves the overview camera and orbit controls',()=>{navigation.home();usePreferences.getState().set({motion:'reduced'});navigation.orbit(40,15);navigation.zoom=.9;const director=new CameraDirector(),camera=new PerspectiveCamera(48,390/690,.1,2000);director.update(camera,390,690,10000,.016);const position=camera.position.clone(),quaternion=camera.quaternion.clone(),yaw=navigation.yaw,pitch=navigation.pitch;navigation.focus('chat');director.update(camera,390,690,10016,.016);assert.equal(position.distanceTo(camera.position),0);assert.ok(quaternion.angleTo(camera.quaternion)<1e-7);assert.equal(navigation.yaw,yaw);assert.equal(navigation.pitch,pitch);assert.equal(navigation.zoom,.9);navigation.home();usePreferences.getState().reset();});

import {labelNodes,labelAnchors,updateLabels} from '../src/experience/cosmos';
import {worlds} from '../src/experience/catalog';
test('Labels retain their anchors across orbit frames, hover and selection',()=>{
 navigation.home();usePreferences.getState().set({motion:'reduced'});
 const camera=new PerspectiveCamera(48,390/690,.1,2000),director=new CameraDirector();
 const nodes=new Map(worlds.map(w=>[w.id,{style:{transform:'',width:'',visibility:'',opacity:''},dataset:{},tabIndex:0}]));
 for(const [id,node] of nodes)labelNodes.set(id,node as unknown as HTMLButtonElement);
 labelAnchors.clear();updateOrbits(30000,.016,390);director.update(camera,390,690,30000,.016);updateLabels(camera,390,690);
 const anchors=JSON.stringify([...labelAnchors]),initial=nodes.get('chat')!.style.transform;
 navigation.focus('chat');updateLabels(camera,390,690);assert.equal(nodes.get('chat')!.style.transform,initial);
 navigation.focus(null);usePreferences.getState().set({motion:'full'});navigation.lastInteraction=0;
 const xy=(s:string)=>s.match(/translate\(([-\d.]+)px,([-\d.]+)px\)/)!.slice(1).map(Number);
 let previous=new Map([...nodes].map(([id,n])=>[id,xy(n.style.transform)]));
 for(let frame=1;frame<=3600;frame++){
  updateOrbits(30000+frame*16.667,1/60,390);updateLabels(camera,390,690);
  assert.equal(JSON.stringify([...labelAnchors]),anchors);
  for(const [id,node] of nodes){const next=xy(node.style.transform),old=previous.get(id)!;assert.ok(Math.hypot(next[0]-old[0],next[1]-old[1])<1,`${id} jumped`);previous.set(id,next);}
 }
 labelNodes.clear();labelAnchors.clear();navigation.home();usePreferences.getState().reset();
});

import {sceneBlocked,openHostChat} from '../src/experience/hostBridge';
test('Host gestures cannot launch through an open overlay',()=>{
 navigation.home();navigation.hitTest=()=> 'chat';
 for(const field of ['directory','settings','help','tutorial'] as const){
  useExperience.getState().set({[field]:true});assert.equal(sceneBlocked(),true);assert.equal(lookAtWorld(1,1),null);touchWorld('chat');assert.equal(useExperience.getState().journey,null);highlightWorld('chat');assert.equal(useExperience.getState().hovered,null);useExperience.getState().set({[field]:false});
 }
 navigation.hitTest=()=>null;navigation.home();
});
test('Chat handoff reports missing, rejected and failed hosts without exposing other destinations',async()=>{
 assert.equal(await openHostChat(undefined),false);assert.equal(await openHostChat(()=>false),false);assert.equal(await openHostChat(()=>{throw Error('offline')}),false);assert.equal(await openHostChat(async()=>{throw Error('offline')}),false);
 const calls:string[]=[];assert.equal(await openHostChat((id:string)=>{calls.push(id)}),true);assert.deepEqual(calls,['chat']);
});

import {immersive} from '../src/experience/immersive';
test('360 rejects unsupported modes and restores normal navigation on exit',async()=>{
 navigation.home();useExperience.getState().set({ready:true});
 await assert.rejects(immersive.entrar('xr'),/unsupported/);await assert.rejects(immersive.entrar('carton'),/unsupported/);assert.equal(immersive.estado().activo,false);
 await immersive.entrar('trescientos60');assert.equal(immersive.estado().activo,true);assert.equal(immersive.estado().cabeza,false);
 const camera=new PerspectiveCamera(48,1,.1,2000),director=new CameraDirector();director.update(camera,900,900,10000,.016);const position=camera.position.clone(),direction=camera.quaternion.clone();navigation.orbit(100,0);director.update(camera,900,900,10016,.016);assert.equal(position.distanceTo(camera.position),0);assert.ok(direction.angleTo(camera.quaternion)>.1);
 immersive.salir();assert.equal(immersive.estado().activo,false);assert.equal(navigation.yaw,0);assert.equal(navigation.pitch,.6);
 useExperience.getState().set({ready:false});await assert.rejects(immersive.entrar('trescientos60'),/not-ready/);
});

import {registerViewerDriver,useViewer} from '../src/experience/immersive';
test('Headset start cancellation cleans late sessions and does not resurrect the viewer',async()=>{
 useExperience.getState().set({ready:true});let release!:()=>void,stops=0;
 const unregister=registerViewerDriver({start:()=>new Promise<void>(r=>{release=r}),stop:()=>{stops++},recenter:()=>{},tracking:()=>false});
 const pending=immersive.entrar('xr');assert.equal(useViewer.getState().opening,true);immersive.salir();release();await assert.rejects(pending,/cancelled/);assert.equal(useExperience.getState().immersive,false);assert.equal(useViewer.getState().mode,null);assert.equal(useViewer.getState().opening,false);assert.ok(stops>0);unregister();useExperience.getState().set({ready:false});
});
test('Headset driver failure restores the system and exposes an actionable error',async()=>{
 useExperience.getState().set({ready:true});const unregister=registerViewerDriver({start:async()=>{throw Error('Permission denied')},stop:()=>{},recenter:()=>{},tracking:()=>false});
 await assert.rejects(immersive.entrar('carton'),/Permission/);assert.equal(useExperience.getState().immersive,false);assert.equal(useViewer.getState().mode,null);assert.equal(useViewer.getState().error,'Permission denied');unregister();useExperience.getState().set({ready:false});
});

test('Entry timing honours the host flight contract instead of a fixed delay',()=>{
 assert.equal(FLIGHT_MS.directo,1100);assert.equal(FLIGHT_MS.descubrir,2300);
 const direct=entryTiming('directo',false),discover=entryTiming('descubrir',false);
 assert.equal(direct.duration,1100);assert.equal(direct.callbackAt,880);
 assert.equal(discover.duration,2300);assert.equal(discover.callbackAt,1840);
 assert.ok(discover.callbackAt>direct.callbackAt,'the two entries must not behave alike');
 // Unknown types fall back to the short flight, never to an instant callback.
 assert.deepEqual(entryTiming('cualquier-cosa',false),direct);
 // Reduced motion shortens the flight and the handoff with it.
 const quiet=entryTiming('descubrir',true);assert.equal(quiet.visible,100);assert.equal(quiet.callbackAt,80);
});

import {visorUI,useVisorUI,escenaTomada} from '../src/experience/visorUI';
import {dentro} from '../src/experience/visorPaint';
import {genesis,guion} from '../src/experience/genesis';
import {pelicula} from '../src/experience/navigation';

/* La casa vive en un navegador; estas pruebas no. Se le pone lo mínimo que el
   motor toca —despachar un evento, dos relojes— y se mira qué sale. */
function casaDePrueba(){
 const eventos:CustomEvent[]=[];
 let frame=0;const frames=new Map<number,()=>void>();
 (globalThis as any).window={
  dispatchEvent:(e:CustomEvent)=>{eventos.push(e);return true;},
  setTimeout:(fn:()=>void,ms:number)=>setTimeout(fn,ms),
  clearTimeout:(id:number)=>clearTimeout(id),
  __AE_BLINDADO:false,
 };
 (globalThis as any).requestAnimationFrame=(fn:()=>void)=>{frames.set(++frame,fn);return frame;};
 (globalThis as any).cancelAnimationFrame=(id:number)=>{frames.delete(id);};
 return {eventos,correrFrames:()=>{const pendientes=[...frames.values()];frames.clear();pendientes.forEach(fn=>fn());}};
}

test('The headset portal reaches the host with the shape it already listens for',()=>{
 const {eventos}=casaDePrueba();
 visorUI.portico('inicio','ENTRAR','Sostené la mirada');
 assert.equal(useVisorUI.getState().portico?.boton,'ENTRAR');
 assert.equal(escenaTomada(),true,'with a panel in front, gaze must not pick planets');
 visorUI.aprietaPortico();
 assert.equal(useVisorUI.getState().portico,null,'pressing closes the portal');
 assert.equal(eventos.at(-1)?.type,'ae-portico');
 assert.deepEqual((eventos.at(-1) as CustomEvent).detail,{modo:'inicio'});
 // Pressing twice must not send a second event: the door was already opened.
 visorUI.aprietaPortico();
 assert.equal(eventos.length,1);
 visorUI.portico(null);
 assert.equal(escenaTomada(),false);
});

test('The in-scene house panel reports its button and refuses malformed data',()=>{
 const {eventos}=casaDePrueba();
 visorUI.casa({key:'wallet',titulo:'Veta Wallet',botones:[{id:'abrir',texto:'Abrir'},{id:'volver',texto:'Volver'}]});
 assert.equal(useVisorUI.getState().casa?.botones.length,2);
 visorUI.aprietaCasa('volver');
 assert.deepEqual((eventos.at(-1) as CustomEvent).detail,{accion:'volver',key:'wallet'});
 // A panel with no usable buttons is no panel: it would trap the gaze.
 visorUI.casa({key:'x',titulo:'X',botones:[]});
 assert.equal(useVisorUI.getState().casa,null);
 visorUI.casa(null);
 assert.equal(useVisorUI.getState().casa,null);
});

test('The host shield alone blocks gaze selection',()=>{
 casaDePrueba();
 visorUI.limpiar();
 assert.equal(escenaTomada(),false);
 (globalThis as any).window.__AE_BLINDADO=true;
 assert.equal(escenaTomada(),true);
 (globalThis as any).window.__AE_BLINDADO=false;
});

test('Spoken lines are bounded and keep the two voices apart',()=>{
 casaDePrueba();
 visorUI.decir('En el principio','escritura');
 assert.equal(useVisorUI.getState().dicho?.peso,'escritura');
 visorUI.decir('x'.repeat(400),'inventado');
 assert.equal(useVisorUI.getState().dicho?.texto.length,220);
 assert.equal(useVisorUI.getState().dicho?.peso,'normal');
 visorUI.decir(null);
 assert.equal(useVisorUI.getState().dicho,null);
});

test('Panel hit zones are exclusive',()=>{
 const a={id:'a',x:0,y:.8,w:.45,h:.15},b={id:'b',x:.55,y:.8,w:.45,h:.15};
 assert.equal(dentro(a,.2,.85),true);
 assert.equal(dentro(b,.2,.85),false);
 assert.equal(dentro(a,.5,.85),false,'the gap between buttons belongs to neither');
});

test('The origin story runs the real act list and can always be cut short',()=>{
 const {correrFrames}=casaDePrueba();
 const libreto=guion(['gid','wallet','noexiste']);
 assert.equal(libreto[0].clave,'titulo');
 assert.deepEqual(libreto.slice(4,6).map(a=>a.clave),['casa:gid','casa:wallet'],'unknown worlds never become acts');
 assert.ok(libreto.some(a=>a.clave==='casa:minas')&&libreto.some(a=>a.clave==='cierre'));
 assert.equal(libreto.reduce((total,a)=>total+a.dura,0)>90000,true,'the act timings match the music the host starts');

 const actos:string[]=[];let final:boolean|null=null;
 genesis.empezar({casas:['gid'],alActo:c=>actos.push(c),alFin:s=>{final=s;}});
 assert.equal(genesis.vivo(),true);
 assert.equal(useExperience.getState().cinema,true,'the shell gets out of the way while the story runs');
 assert.equal(pelicula.activo,true);
 assert.deepEqual(actos,['titulo'],'the host writes act by act, not all at once');
 correrFrames();
 genesis.saltar();
 assert.equal(genesis.vivo(),false);
 assert.equal(final,true,'skipping tells the host it was skipped');
 assert.equal(pelicula.activo,false,'the camera goes back to the person');
 assert.equal(useExperience.getState().cinema,false);
 genesis.saltar();
 assert.equal(final,true);
});

test('Host gestures stand down behind a headset panel and during the story',()=>{
 casaDePrueba();
 navigation.home();navigation.hitTest=()=>'chat';
 assert.deepEqual(lookAtWorld(20,20),{key:'chat',nombre:'PULSE2CHAT'});
 visorUI.casa({key:'wallet',titulo:'Veta Wallet',botones:[{id:'volver',texto:'Volver'}]});
 assert.equal(lookAtWorld(20,20),null,'a panel covers whatever is behind it');
 touchWorld('chat');
 assert.equal(useExperience.getState().stage,'system','and no flight starts behind it');
 visorUI.limpiar();
 useExperience.getState().set({cinema:true});
 assert.equal(lookAtWorld(20,20),null,'while the story runs, the script owns the camera');
 useExperience.getState().set({cinema:false});
 navigation.hitTest=()=>null;navigation.home();
});

test('With the house behind it, arriving opens the real app instead of a preview panel',()=>{
 const {correrFrames}=casaDePrueba();
 const abiertos:string[]=[];
 (globalThis as any).window.__AE_ABRIR=(k:string)=>{abiertos.push(k);return true;};
 useExperience.getState().set({settings:false,windowId:null});
 navigation.enter('wallet');
 const viaje=useExperience.getState().journey!;
 navigation.complete(viaje.token);
 assert.equal(useExperience.getState().windowId,null,'no preview panel when the house can open its own app');
 assert.deepEqual(abiertos,[],'and not before the landing has been seen');
 correrFrames();
 delete (globalThis as any).window.__AE_ABRIR;
 // Sin casa detrás, el motor sigue siendo el de la vista previa.
 navigation.enter('wallet');
 navigation.complete(useExperience.getState().journey!.token);
 assert.equal(useExperience.getState().windowId,'wallet','standalone keeps its own panel');
 useExperience.getState().set({windowId:null});navigation.home();
});

test('Settings stay the engine own panel even with the house behind',()=>{
 casaDePrueba();
 (globalThis as any).window.__AE_ABRIR=()=>true;
 useExperience.getState().set({settings:false,windowId:null});
 navigation.enter('ajustes');
 navigation.complete(useExperience.getState().journey!.token);
 assert.equal(useExperience.getState().settings,true,'the house has no screen for the engine own settings');
 useExperience.getState().set({settings:false});
 delete (globalThis as any).window.__AE_ABRIR;
 navigation.home();
});
