import {useEffect,useState} from 'react';
import {navigation,useExperience} from './navigation';
import {usePreferences} from './preferences';
import {Icon} from './Icon';

export default function Tutorial(){
 const [step,setStep]=useState(0),{prefs,set}=usePreferences(),es=prefs.lang==='es';
 const steps=es?[
  ['GENESIS CORE: el cerebro','El sol es el núcleo de Orden Global. Las órbitas reúnen las apps alrededor del núcleo. Al seleccionar una app se destaca su conexión.'],
  ['Cada planeta es una app','Los nombres permanecen visibles. Toca el nombre, el planeta o su icono del dock para enfocarlo. Las órbitas se pausan mientras eliges.'],
  ['Muévete con precisión','Arrastra el espacio: acompaña tu mano. En móvil, usa un dedo para girar y dos para acercar o alejar. También tienes botones + y −.'],
  ['Primero eliges, después entras','PULSE2CHAT está seleccionada, sin mover el sistema. «Entrar» inicia el viaje. Puedes cancelarlo durante el vuelo; cerrar la ventana te devuelve al planeta.'],
  ['Tu sistema tiene un universo alrededor','«Galaxias» o alejar el zoom revela el espacio profundo. «Mi sistema» regresa a GENESIS CORE. Las conexiones externas son espacios futuros.'],
  ['Hazlo tuyo','En Ajustes eliges Pro o Lite, sensibilidad, movimiento, sonido e idioma. AirTouch es opcional y necesita tu permiso de cámara. Puedes repetir esta guía desde el botón ?.'],
 ]:[
  ['GENESIS CORE: the brain','The sun is the core of Orden Global. The orbits gather apps around the core. Selecting an app highlights its connection.'],
  ['Every planet is an app','Names remain visible. Select a name, planet or dock icon to focus it. Orbits pause while you choose.'],
  ['Move with precision','Drag space: it follows your hand. On mobile, use one finger to orbit and two to zoom. The + and − controls are always available.'],
  ['Choose first, then enter','PULSE2CHAT is selected, without moving the system. Enter starts the journey. You can cancel during the flight; closing its window returns you to the planet.'],
  ['Explore beyond your system','Galaxies or zooming out reveals deep space. My system returns to GENESIS CORE. External connections are future spaces.'],
  ['Make it yours','Settings offers Pro or Lite, sensitivity, motion, sound and language. AirTouch is optional and requires camera permission. Replay this guide with the ? button.'],
 ];
 function finish(){set({tutorialSeen:true});useExperience.getState().set({tutorial:false});navigation.home();}
 useEffect(()=>{if(step===3)navigation.focus('chat');else if(step===4)navigation.galaxies();else navigation.home();},[step]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();finish();}};window.addEventListener('keydown',onKey,true);return()=>window.removeEventListener('keydown',onKey,true);},[]);
 return <aside className="system-tutorial" role="dialog" aria-label={es?'Tutorial del sistema':'System tutorial'} aria-describedby="tutorial-body">
 <div className="tutorial-top"><span>ORDEN GLOBAL / {es?'GUÍA':'GUIDE'} {step+1} / {steps.length}</span><button className="icon-button" aria-label={es?'Cerrar tutorial':'Close tutorial'} onClick={finish}><Icon name="close"/></button></div>
 <div aria-live="polite"><h2>{steps[step][0]}</h2><p id="tutorial-body">{steps[step][1]}</p></div>
 {step===3&&<button className="text-button" onClick={()=>{set({tutorialSeen:true});useExperience.getState().set({tutorial:false});navigation.enter('chat');}}>{es?'Probar el viaje ahora':'Try the journey now'}<Icon name="play" size={17}/></button>}
 <div className="tutorial-progress" aria-hidden="true">{steps.map((_,i)=><i key={i} className={i<=step?'done':''}/>)}</div>
 <footer><button className="text-button" onClick={()=>step?setStep(step-1):finish()}>{step?(es?'Anterior':'Previous'):(es?'Ahora no':'Not now')}</button><button className="primary" onClick={()=>step===steps.length-1?finish():setStep(step+1)}>{step===steps.length-1?(es?'Empezar a explorar':'Start exploring'):(es?'Siguiente':'Next')}<Icon name="arrow" size={18}/></button></footer>
 </aside>;
}
