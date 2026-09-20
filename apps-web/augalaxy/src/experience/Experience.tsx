import {Component,ReactNode,useEffect,useRef,useState} from 'react';
import Universe,{PlanetLabels} from './Universe';
import {useExperience,navigation} from './navigation';
import {usePreferences} from './preferences';
import {worlds,worldName,word,externalGalaxies} from './catalog';
import {Icon} from './Icon';
import {Settings,Directory,Modal,HandControls,AppWindow,useHandStatus} from './Overlays';
import {airtouch} from './airtouch';
import {sound} from './sound';
import './experience.css';
import {registerExperienceTools} from './webmcp';

class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return{failed:true};}
 componentDidCatch(){useExperience.getState().set({unsupported:true,ready:true});}
 render(){return this.state.failed?<div className="scene-unavailable">Orden Global</div>:this.props.children;}
}
function Brand(){return <span className="brand"><span className="brand-mark"><Icon name="galaxy" size={32}/></span><span>ORDEN GLOBAL<small>GALAXY OS</small></span></span>;}
export default function Experience({embedded=false}:{embedded?:boolean}){
 const state=useExperience(),{prefs,set}=usePreferences(),es=prefs.lang==='es';
 const [airOpen,setAirOpen]=useState(false),[clock,setClock]=useState(''),[notice,setNotice]=useState(''),[pageVisible,setPageVisible]=useState(!document.hidden);
 const [systemReduced,setSystemReduced]=useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
 const reduced=prefs.motion==='reduced'||(prefs.motion==='system'&&systemReduced);
 const cursor=useRef<HTMLDivElement>(null),handStatus=useHandStatus();
 const mainRef=useRef<HTMLDivElement>(null),introTimer=useRef<number>(0);
 const selected=worlds.find(w=>w.id===state.selected);
 const isGate=state.stage==='gate',intro=state.stage==='intro',galaxies=state.stage==='galaxies';
 useEffect(registerExperienceTools,[]);
 function enter(){sound.cue('intro');navigation.home();state.set({stage:prefs.intro&&!reduced?'intro':'system',selected:null});}
 function launch(id:string){sound.cue('open');state.set(id==='ajustes'?{settings:true}:{windowId:id});}
 useEffect(()=>{
  const mq=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setSystemReduced(mq.matches);mq.addEventListener('change',update);
  const visibility=()=>{setPageVisible(!document.hidden);if(document.hidden){airtouch.stop();sound.suspend();}else if(prefs.sound)void sound.enable(true,prefs.volume,prefs.ambient);};
  const unload=()=>airtouch.stop();document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',unload);
  return()=>{mq.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',unload);};
 },[prefs.sound,prefs.volume,prefs.ambient]);
 useEffect(()=>{document.documentElement.lang=prefs.lang;document.documentElement.dataset.motion=reduced?'reduced':'full';document.documentElement.dataset.contrast=prefs.contrast?'high':'normal';document.documentElement.style.setProperty('--text-scale',String(prefs.textScale));},[prefs.lang,prefs.contrast,prefs.textScale,reduced]);
 useEffect(()=>{void sound.enable(prefs.sound,prefs.volume,prefs.ambient);},[prefs.sound,prefs.volume,prefs.ambient]);
 useEffect(()=>{if(!intro)return;introTimer.current=window.setTimeout(()=>state.set({stage:'system'}),reduced?100:4800);return()=>clearTimeout(introTimer.current);},[intro,reduced]);
 useEffect(()=>{const update=()=>setClock(new Date().toLocaleTimeString(prefs.lang,{hour:'2-digit',minute:'2-digit',hour12:false}));update();const t=window.setInterval(update,15000);return()=>clearInterval(t);},[prefs.lang]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(t);},[notice]);
 useEffect(()=>{
  const handle=(e:KeyboardEvent)=>{if(document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName))return;
   if(e.key==='Escape'){if(intro)state.set({stage:'system'});else navigation.home();}
   if(!isGate&&!intro){
    if(e.key==='+'||e.key==='='){e.preventDefault();navigation.dolly(.82);}
    if(e.key==='-'){e.preventDefault();navigation.dolly(1.22);}
    if(e.key==='ArrowLeft'){e.preventDefault();navigation.orbit(-24,0);}
    if(e.key==='ArrowRight'){e.preventDefault();navigation.orbit(24,0);}
    if(e.key==='ArrowUp'){e.preventDefault();navigation.orbit(0,-24);}
    if(e.key==='ArrowDown'){e.preventDefault();navigation.orbit(0,24);}
   }
  };window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
 },[isGate,intro]);
 useEffect(()=>{let raf=0;const animate=()=>{const el=cursor.current,c=airtouch.cursor;if(el){el.style.transform='translate('+c.x+'px,'+c.y+'px)';el.style.opacity=c.visible?'1':'0';el.classList.toggle('pinched',c.pinched);}raf=requestAnimationFrame(animate);};raf=requestAnimationFrame(animate);return()=>{cancelAnimationFrame(raf);airtouch.stop();sound.dispose();};},[]);
 useEffect(()=>{if(embedded)state.set({stage:(window as any).__AE_PUERTA?'gate':'system'});},[embedded]);
 const fullScreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(mainRef.current?.requestFullscreen)await mainRef.current.requestFullscreen();else setNotice(es?'Pantalla completa no disponible en este navegador.':'Fullscreen is unavailable in this browser.');}catch{setNotice(es?'No se pudo abrir pantalla completa.':'Fullscreen could not be opened.');}};
 const openGalaxy=()=>{navigation.zoom=1;navigation.yaw=0;navigation.pitch=0;state.set({stage:'galaxies',selected:null});sound.cue('open');};
 return <main className={'galaxy-os '+(isGate?'at-gate':'')+(intro?' in-intro':'')} ref={mainRef}>
 <SceneBoundary><Universe paused={!pageVisible}/></SceneBoundary><div className="edge-shade" aria-hidden="true"/>
 {!intro&&<header className="os-header"><button className="brand-button" aria-label={es?'Inicio Orden Global':'Orden Global home'} onClick={()=>!isGate&&navigation.home()}><Brand/></button>
 {!isGate&&<nav className="scale-tabs" aria-label={es?'Escala del universo':'Universe scale'}><button className={!galaxies?'active':''} onClick={()=>navigation.home()}>{es?'Mi sistema':'My system'}</button><button className={galaxies?'active':''} onClick={openGalaxy}>{es?'Galaxias':'Galaxies'}<Icon name="galaxy" size={16}/></button></nav>}
 <div className="header-tools"><span className="private-tag"><Icon name="lock" size={12}/>{es?'VISTA PRIVADA':'PRIVATE PREVIEW'}</span><button className="language-button" onClick={()=>set({lang:es?'en':'es'})} aria-label={es?'Switch to English':'Cambiar a español'}>{es?'EN':'ES'}</button><button className="icon-button" aria-label={prefs.sound?(es?'Silenciar sonido':'Mute sound'):(es?'Activar sonido':'Enable sound')} onClick={()=>{set({sound:!prefs.sound});void sound.enable(!prefs.sound,prefs.volume,prefs.ambient);}}><Icon name={prefs.sound?'sound':'muted'}/></button>{!isGate&&<button className="icon-button" aria-label={es?'Abrir ajustes':'Open settings'} onClick={()=>state.set({settings:true})}><Icon name="settings"/></button>}</div></header>}
 {isGate&&!embedded&&<section className="entry-layout">
 <div className="entry-caption"><span className="coordinate">01 / ORDEN GLOBAL</span><h1>{es?'El futuro está en':'The future is in'}<br/><em>Orden Global.</em></h1><p>{es?'Tecnología. Finanzas. Un universo de posibilidades.':'Technology. Finance. A universe of possibilities.'}</p><span className="entry-line"/><small>{es?'Tu ecosistema, en otra dimensión.':'Your ecosystem, in another dimension.'}</small></div>
 <div className="entry-card"><div className="entry-symbol"><Icon name="galaxy" size={36}/></div><p className="eyebrow">{es?'BIENVENIDO A TU UNIVERSO':'WELCOME TO YOUR UNIVERSE'}</p><h2>{es?'Todo empieza aquí.':'It all begins here.'}</h2><p>{es?'Cruza el umbral. Cada mundo abre una nueva posibilidad.':'Cross the threshold. Every world opens a new possibility.'}</p>
 <div className="visitor-profile"><span>OG</span><div><strong>{es?'Explorador':'Explorer'}</strong><small>{es?'Acceso de demostración':'Demonstration access'}</small></div><Icon name="lock" size={17}/></div>
 <button className="primary enter-button" onClick={enter}>{es?'Entrar al universo':'Enter the universe'}<Icon name="arrow"/></button>
 <button className="text-button entry-audio" onClick={()=>{set({sound:!prefs.sound});void sound.enable(!prefs.sound,prefs.volume,prefs.ambient);}}><Icon name={prefs.sound?'sound':'muted'} size={17}/>{prefs.sound?(es?'Experiencia sonora activada':'Sound experience enabled'):(es?'Activar experiencia sonora':'Enable sound experience')}</button>
 <div className="entry-safety">{es?'Vista de diseño. No introduzcas contraseñas ni claves de billeteras. No se conectan cuentas reales.':'Design preview. Do not enter passwords or wallet keys. No real accounts are connected.'}</div></div>
 <footer className="entry-footer"><span>ORDEN GLOBAL / {es?'TECNOLOGÍA SIN FRONTERAS':'TECHNOLOGY WITHOUT BORDERS'}</span><button onClick={()=>setAirOpen(true)}><Icon name="hand" size={18}/>AirTouch<small>{es?'Explora con tus manos':'Explore with your hands'}</small></button></footer></section>}
 {intro&&<div className="intro-sequence" role="status" aria-live="polite"><div className="intro-copy"><span className="intro-kicker">{es?'EL FUTURO ESTÁ EN':'THE FUTURE IS IN'}</span><h1>Orden Global</h1><div className="intro-divider"/><p>{es?'Tu universo está listo.':'Your universe awaits.'}</p></div><button className="skip-intro" onClick={()=>state.set({stage:'system'})}>{es?'Saltar intro':'Skip intro'}<Icon name="arrow" size={17}/></button><span className="intro-caption">GALAXY OS / {es?'INICIANDO EXPERIENCIA':'ENTERING EXPERIENCE'}</span></div>}
 {!isGate&&!intro&&<>
 <PlanetLabels/>
 <div className="system-heading"><p className="eyebrow">{galaxies?(es?'MÁS ALLÁ DEL HORIZONTE':'BEYOND THE HORIZON'):'ORDEN GLOBAL / 01'}</p><h1>{galaxies?(es?'Un universo abierto.':'An open universe.'):(es?'Tu galaxia.':'Your galaxy.')}</h1><p>{galaxies?(es?'Nuevos mundos. Nuevas conexiones.':'New worlds. New connections.'):(es?'Todo tu ecosistema, conectado.':'Your entire ecosystem, connected.')}</p></div>
 {galaxies&&<section className="galaxy-index" aria-label={es?'Galaxias futuras':'Future galaxies'}><div className="current-galaxy"><span>01</span><div><strong>Orden Global</strong><small>{es?'Tu ecosistema':'Your ecosystem'}</small></div><button className="icon-button" aria-label={es?'Regresar a Orden Global':'Return to Orden Global'} onClick={()=>navigation.home()}><Icon name="arrow"/></button></div>{externalGalaxies.map((g,i)=><div key={g.name}><span>0{i+2}</span><div><strong>{es?g.name:g.en}</strong><small>{es?'Espacio para futuras integraciones':'Space for future integrations'}</small></div><Icon name="lock" size={15}/></div>)}<p>{es?'Galaxias conceptuales; aún no hay conexiones externas.':'Conceptual galaxies; no external connections yet.'}</p></section>}
 {selected&&!galaxies&&<aside className="selection-card" aria-label={worldName(selected,prefs.lang)}><button className="selection-close icon-button" aria-label={es?'Volver al sistema':'Back to system'} onClick={()=>navigation.focus(null)}><Icon name="close" size={17}/></button><p className="eyebrow">{word(selected.category,prefs.lang)} / {String(worlds.indexOf(selected)+1).padStart(2,'0')}</p><h2>{worldName(selected,prefs.lang)}</h2><p>{word(selected.description,prefs.lang)}</p><button className="primary" onClick={()=>launch(selected.id)}>{selected.id==='ajustes'?(es?'Abrir ajustes':'Open settings'):(es?'Abrir mundo':'Open world')}<Icon name="arrow"/></button></aside>}
 <div className="orbit-tools" aria-label={es?'Controles de navegación':'Navigation controls'}><button className="icon-button" aria-label={es?'Acercar':'Zoom in'} onClick={()=>navigation.dolly(.78)}><Icon name="plus"/></button><button className="icon-button" aria-label={es?'Alejar':'Zoom out'} onClick={()=>navigation.dolly(1.28)}><Icon name="minus"/></button><i/><button className="icon-button" aria-label={es?'Centrar sistema':'Center system'} onClick={()=>navigation.home()}><Icon name="home"/></button><button className="icon-button" aria-label={es?'Pantalla completa':'Fullscreen'} onClick={()=>void fullScreen()}><Icon name="expand"/></button></div>
 <footer className="os-footer"><div className="location-caption"><Icon name="galaxy" size={16}/><span>{galaxies?(es?'ESPACIO PROFUNDO':'DEEP SPACE'):'ORDEN GLOBAL'}<small>{clock} · {es?'Vista privada':'Private preview'}</small></span></div>
 <nav className="app-dock" aria-label={es?'Acceso rápido a apps':'Quick app access'}><button className="dock-button all-apps" aria-label={es?'Todas las aplicaciones':'All applications'} onClick={()=>state.set({directory:true})}><Icon name="grid"/><span>{es?'Apps':'Apps'}</span></button><i/>{worlds.slice(0,5).map(w=><button className={'dock-button '+(selected?.id===w.id?'selected':'')} key={w.id} aria-label={worldName(w,prefs.lang)} title={worldName(w,prefs.lang)} onClick={()=>{state.set({stage:'system'});navigation.focus(w.id);sound.cue();}}><span className="dock-icon" style={{color:w.color}}>{w.id==='wallet'?'V':w.id==='chat'?'P':w.id==='gid'?'G':w.id==='pay'?'M':'C'}</span><span className="dock-label">{w.id==='wallet'?'Wallet':w.id==='chat'?'Chat':w.id==='gid'?'ID':w.id==='pay'?'Pay':'Core'}</span></button>)}<i/><button className="dock-button" aria-label="AU-RA" onClick={()=>state.set({help:true})}><span className="aura-icon">A</span><span>AU-RA</span></button></nav>
 <button className={'air-button '+(handStatus==='tracking'||handStatus==='searching'?'on':'')} onClick={()=>setAirOpen(true)}><Icon name="hand"/><span>AirTouch<small>{handStatus==='tracking'?(es?'Mano detectada':'Hand detected'):handStatus==='searching'?(es?'Buscando mano':'Looking for hand'):(es?'Control por gestos':'Gesture control')}</small></span></button></footer>
 {!selected&&!galaxies&&<div className="gesture-hint">{es?'Arrastra para girar · Rueda o pellizco para acercar · Elige un planeta':'Drag to orbit · Scroll or pinch to zoom · Choose a planet'}</div>}
 </>}
 {state.unsupported&&<button className="fallback-apps primary" onClick={()=>state.set({directory:true})}>{es?'Abrir aplicaciones sin 3D':'Open applications without 3D'}</button>}
 {state.settings&&<Settings onClose={()=>state.set({settings:false})}/>}
 {state.directory&&<Directory onClose={()=>state.set({directory:false})}/>}
 {state.windowId&&<AppWindow id={state.windowId} onClose={()=>state.set({windowId:null})} embedded={embedded}/>}
 {airOpen&&<Modal title="AirTouch" onClose={()=>setAirOpen(false)} className="air-dialog"><HandControls/></Modal>}
 {state.help&&<Modal title="AU-RA · Navigator" onClose={()=>state.set({help:false})} className="help-dialog"><p className="eyebrow">{es?'GUÍA DEL UNIVERSO':'UNIVERSE GUIDE'}</p><h2>{es?'¿Adónde quieres ir?':'Where would you like to go?'}</h2><p>{es?'Selecciona un destino. Esta guía es local y no envía tus datos a una inteligencia artificial.':'Choose a destination. This guide is local and does not send your data to an AI.'}</p><div className="guide-actions"><button onClick={()=>{state.set({help:false,directory:true});}}><Icon name="grid"/>{es?'Encontrar una aplicación':'Find an application'}<Icon name="arrow"/></button><button onClick={()=>{state.set({help:false});openGalaxy();}}><Icon name="galaxy"/>{es?'Explorar las galaxias':'Explore galaxies'}<Icon name="arrow"/></button><button onClick={()=>{state.set({help:false});setAirOpen(true);}}><Icon name="hand"/>{es?'Aprender AirTouch':'Learn AirTouch'}<Icon name="arrow"/></button><button onClick={()=>{state.set({help:false,settings:true});}}><Icon name="settings"/>{es?'Personalizar mi experiencia':'Personalize my experience'}<Icon name="arrow"/></button></div></Modal>}
 {notice&&<div className="os-toast" role="status">{notice}</div>}
 <div className="hand-cursor" ref={cursor} aria-hidden="true"><span/></div>
 </main>;
}
