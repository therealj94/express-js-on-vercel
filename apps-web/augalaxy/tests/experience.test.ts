import test from 'node:test';
import assert from 'node:assert/strict';
import {measureHand} from '../src/experience/airtouch';
import {usePreferences} from '../src/experience/preferences';
import {navigation,useExperience} from '../src/experience/navigation';
import {readExperience,navigateExperience} from '../src/experience/webmcp';
import {lookAtWorld,highlightWorld,touchWorld,transitionState,viewControls} from '../src/experience/hostBridge';
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
