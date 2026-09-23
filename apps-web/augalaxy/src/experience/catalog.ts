export type World = {
  id: string; name: string; category: [string,string]; description: [string,string];
  color: string; secondary: string; radius: number; position: [number,number,number];
  kind: number; rings?: boolean; future?: boolean;
};
export const worlds: World[] = [
  {id:'wallet',name:'Veta Wallet',category:['Tu patrimonio','Your assets'],description:['La billetera del ecosistema. Un mundo para reunir y organizar tus activos.','The ecosystem wallet. A world to bring your assets together.'],color:'#d9b56a',secondary:'#4a3418',radius:2.15,position:[-6.5,1.1,3],kind:0,rings:true},
  {id:'chat',name:'PULSE2CHAT',category:['Conexiones','Connections'],description:['Conversaciones que acercan personas, ideas y comunidades.','Conversations that connect people, ideas and communities.'],color:'#2fb3c4',secondary:'#062a33',radius:1.55,position:[0.8,4,-1],kind:1},
  {id:'gid',name:'Genesis ID',category:['Identidad','Identity'],description:['Tu identidad dentro del ecosistema, con controles bajo tu responsabilidad.','Your identity in the ecosystem, with controls in your hands.'],color:'#5fd6c0',secondary:'#0c1716',radius:1.32,position:[6.8,1.5,1],kind:2},
  {id:'pay',name:'MyTokenPay',category:['Comercio','Commerce'],description:['El punto de encuentro entre negocios y personas.','Where businesses and people meet.'],color:'#3fbf8f',secondary:'#0d3b2e',radius:1.45,position:[3.4,-2,5],kind:1},
  {id:'genesis',name:'GENESIS CORE',category:['Cerebro del ecosistema','Ecosystem brain'],description:['El sol y cerebro de Orden Global. Coordina las conexiones de todo el ecosistema.','The sun and brain of Orden Global. It coordinates connections across the ecosystem.'],color:'#e8d3a9',secondary:'#546a66',radius:2.75,position:[0,0,0],kind:2},
  {id:'scan',name:'ORDENSCAN',category:['Exploración','Explorer'],description:['Una ventana a la actividad de la red.','A window into network activity.'],color:'#9fd3e6',secondary:'#40657a',radius:1.05,position:[-10,2.8,-9],kind:2,rings:true},
  {id:'oxch',name:'Ordenex',category:['Ecosistema','Ecosystem'],description:['Un destino del ecosistema financiero de Orden Global.','A destination in the Orden Global financial ecosystem.'],color:'#e0763a',secondary:'#2a1812',radius:1.2,position:[8,4,-9],kind:3},
  {id:'aucorp',name:'AuCorp',category:['Empresas','Business'],description:['Un espacio para los servicios corporativos del ecosistema.','A space for the ecosystem’s corporate services.'],color:'#c9a45c',secondary:'#4a3a22',radius:1.4,position:[-3.8,5,-11],kind:0,rings:true},
  {id:'minas',name:'MINAS',category:['Recursos','Resources'],description:['El origen mineral del ecosistema. Integración futura.','The mineral origins of the ecosystem. Future integration.'],color:'#d8a84a',secondary:'#2a2420',radius:1,position:[11,-2,-6],kind:3,future:true},
  {id:'dbnx',name:'DBNX',category:['Infraestructura','Infrastructure'],description:['Un mundo reservado para nuevas conexiones del ecosistema.','A world reserved for new ecosystem connections.'],color:'#8fa8cc',secondary:'#2a3852',radius:0.9,position:[-8.5,-3,-4],kind:2,future:true},
  {id:'ajustes',name:'Ajustes',category:['Sistema','System'],description:['Dale tu ritmo al universo: imagen, audio, idioma y gestos.','Set the pace of your universe: visuals, audio, language and gestures.'],color:'#b8bdcc',secondary:'#596477',radius:0.85,position:[6,-4,-1],kind:2},
];
export type Lang = 'es'|'en';
export const word=(v:[string,string],lang:Lang)=>v[lang==='en'?1:0];
export const worldName=(w:World,lang:Lang)=>w.id==='ajustes'?(lang==='en'?'Settings':'Ajustes'):w.name;
export const externalGalaxies = [
  {name:'Andrómeda',en:'Andromeda',position:[-60,18,-50] as [number,number,number],color:'#9baedc',seed:32},
  {name:'Horizonte',en:'Horizon',position:[70,-5,-75] as [number,number,number],color:'#b694c4',seed:82},
  {name:'Aurora',en:'Aurora',position:[24,35,-140] as [number,number,number],color:'#9ac6c5',seed:142},
];
