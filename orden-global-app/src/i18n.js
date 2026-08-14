// Español e inglés, todo en un sitio. El idioma se elige una vez y se guarda;
// el asistente habla y escucha en el mismo idioma que la pantalla.
import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

export const D = {
  es: {
    // puerta
    'puerta.lema': 'Una identidad. Todo el ecosistema.',
    'puerta.correo': 'Correo',
    'puerta.clave': 'Contraseña',
    'puerta.entrar': 'ENTRAR',
    'puerta.entrando': 'Entrando…',
    'puerta.nota': 'Es tu misma cuenta de Veta Wallet.',
    'puerta.error.auth': 'Correo o contraseña incorrectos.',
    'puerta.error.red': 'Sin conexión. Revisa tu internet.',
    'puerta.error.servidor': 'El servidor no responde. Intenta en un momento.',
    // inicio
    'inicio.hola': 'Hola',
    'inicio.sub': 'Todo tu ecosistema, en un solo lugar.',
    'inicio.apps': 'MIS APPS',
    'inicio.eco': 'EL ECOSISTEMA VIVO',
    'inicio.cerebro': 'El cerebro',
    'inicio.cerebro.sub': 'la red, latiendo en vivo',
    'inicio.chat': 'Chat',
    'inicio.chat.sub': 'habla y envía ORIGEN',
    'inicio.salir': 'Cerrar sesión',
    'inicio.saldo': 'MI SALDO',
    'inicio.sinRed': 'Sin conexión — desliza para reintentar',
    'inicio.abrirWallet': 'Abrir Veta Wallet',
    'inicio.asistente.sub': 'tu asistente — háblale abajo',
    'app.veta': 'Veta Wallet',
    'app.veta.sub': 'tu dinero',
    'app.pay': 'MyTokenPay',
    'app.pay.sub': 'cobra en tu negocio',
    'app.gid': 'Genesis ID',
    'app.gid.sub': 'tu identidad',
    'app.scan': 'ordenscan',
    'app.scan.sub': 'la cadena, pública',
    // candado genesis
    'gate.titulo': 'Falta tu Genesis ID',
    'gate.texto': 'Para abrir esta app necesitas la identidad verificada. Se hace una sola vez y sirve para todo el ecosistema.',
    'gate.boton': 'COMPLETAR MI GENESIS ID',
    'gate.luego': 'Ahora no',
    // asistente
    'gen.nombre': 'GENESIS',
    'gen.hola': 'Dime qué quieres hacer.',
    'gen.escucho': 'Te escucho…',
    'gen.placeholder': '«envía 15 a Juan» · «abre mytokenpay»',
    'gen.si': 'SÍ, ABRE',
    'gen.no': 'NO',
    'gen.listo': 'Te la dejé lista. La firmas tú.',
    'gen.fuera': 'Eso no lo puedo hacer. Puedo abrir tus apps, preparar envíos, cobrar y mostrarte tus cosas.',
    'gen.sinContacto': 'No tengo ese contacto. Agrégalo en el chat y lo uso.',
    'gen.sinMonto': 'No entendí el monto. Dímelo con número: «envía 15 a Juan».',
    'gen.confirmaEnvio': 'Preparar envío de {monto} ORIGEN a {quien}',
    'gen.ayuda.titulo': 'Puedes decirme…',
    'gen.web3': 'Todo pasa en la cadena de Orden Global: cada movimiento queda firmado y guardado en blockchain, comprobable en el explorador público.',
    // pantalla del asistente
    'asis.titulo': 'Tu asistente',
    'asis.saludo': 'Hola. Soy {nombre}, tu asistente de Orden Global. Dime qué quieres hacer.',
    'asis.mellamo': 'Listo. Desde ahora me llamo {nombre}.',
    'asis.renombrar': 'Ponerle mi nombre',
    'asis.guardar': 'GUARDAR NOMBRE',
    'asis.texto': 'GENESIS entiende frases normales, en español o inglés. Prepara todo y tú confirmas: nunca envía dinero solo.',
    'asis.ej1': 'quiero ver veta wallet',
    'asis.ej2': 'envía 15 a Juan',
    'asis.ej3': 'abre mytokenpay',
    'asis.ej4': 'muéstrame el explorador',
    'asis.ej5': 'abre el cerebro',
    'asis.ej6': 'quiero chatear con María',
    'asis.regla1': 'Solo abre lo que existe en el mapa de la app.',
    'asis.regla2': 'Lo que toca dinero, lo confirmas tú con tu dedo.',
    'asis.regla3': 'Te enseña lo que entendió antes de hacer nada.',
    // chat
    'chat.titulo': 'Chat',
    'chat.sub': 'La gente del ecosistema, con Genesis ID',
    'chat.buscar': 'Buscar por nombre o correo…',
    'chat.directorio': 'EN EL ECOSISTEMA',
    'chat.nadie': 'Nadie con ese nombre todavía. Cuando esa persona entre a Orden Global, aparecerá aquí.',
    'chat.vacio': 'Aún no tienes conversaciones. Agrega un contacto y salúdalo.',
    'chat.nuevo': 'NUEVO CONTACTO',
    'chat.nombre': 'Nombre',
    'chat.correo': 'Correo del contacto',
    'chat.agregar': 'AGREGAR',
    'chat.escribe': 'Escribe…',
    'chat.enviarOrigen': 'ENVIAR ORIGEN',
    'chat.origenNota': 'Se abre Veta Wallet con el envío preparado. Lo firmas allí.',
    'chat.enCadena': 'guardado en la cadena',
    // cerebro
    'cer.titulo': 'El cerebro',
    'cer.sub': 'Siete agentes vigilan el ecosistema. Esto es la red, en vivo.',
    'cer.abrir': 'ABRIR EL CEREBRO COMPLETO',
    // comunes
    'volver': 'Volver',
    'cargando': 'Cargando…',
  },
  en: {
    'puerta.lema': 'One identity. The whole ecosystem.',
    'puerta.correo': 'Email',
    'puerta.clave': 'Password',
    'puerta.entrar': 'SIGN IN',
    'puerta.entrando': 'Signing in…',
    'puerta.nota': 'Same account as your Veta Wallet.',
    'puerta.error.auth': 'Wrong email or password.',
    'puerta.error.red': 'No connection. Check your internet.',
    'puerta.error.servidor': 'Server not responding. Try again shortly.',
    'inicio.hola': 'Hello',
    'inicio.sub': 'Your whole ecosystem, in one place.',
    'inicio.apps': 'MY APPS',
    'inicio.eco': 'THE LIVING ECOSYSTEM',
    'inicio.cerebro': 'The brain',
    'inicio.cerebro.sub': 'the network, live',
    'inicio.chat': 'Chat',
    'inicio.chat.sub': 'talk and send ORIGEN',
    'inicio.salir': 'Sign out',
    'inicio.saldo': 'MY BALANCE',
    'inicio.sinRed': 'No connection — pull to retry',
    'inicio.abrirWallet': 'Open Veta Wallet',
    'inicio.asistente.sub': 'your assistant — talk to it below',
    'app.veta': 'Veta Wallet',
    'app.veta.sub': 'your money',
    'app.pay': 'MyTokenPay',
    'app.pay.sub': 'charge at your business',
    'app.gid': 'Genesis ID',
    'app.gid.sub': 'your identity',
    'app.scan': 'ordenscan',
    'app.scan.sub': 'the chain, public',
    'gate.titulo': 'Your Genesis ID is missing',
    'gate.texto': 'This app needs your verified identity. You do it once and it works across the whole ecosystem.',
    'gate.boton': 'COMPLETE MY GENESIS ID',
    'gate.luego': 'Not now',
    'gen.nombre': 'GENESIS',
    'gen.hola': 'Tell me what you want to do.',
    'gen.escucho': 'Listening…',
    'gen.placeholder': '“send 15 to Juan” · “open mytokenpay”',
    'gen.si': 'YES, OPEN',
    'gen.no': 'NO',
    'gen.listo': 'It is ready for you. You sign it.',
    'gen.fuera': 'I cannot do that. I can open your apps, prepare sends, charge, and show you your things.',
    'gen.sinContacto': 'I do not have that contact. Add them in the chat and I will use it.',
    'gen.sinMonto': 'I did not catch the amount. Say it with a number: “send 15 to Juan”.',
    'gen.confirmaEnvio': 'Prepare sending {monto} ORIGEN to {quien}',
    'gen.ayuda.titulo': 'You can tell me…',
    'gen.web3': 'Everything happens on the Orden Global chain: every movement is signed and stored on blockchain, verifiable in the public explorer.',
    'asis.titulo': 'Your assistant',
    'asis.saludo': 'Hello. I am {nombre}, your Orden Global assistant. Tell me what you want to do.',
    'asis.mellamo': 'Done. From now on my name is {nombre}.',
    'asis.renombrar': 'Give it my own name',
    'asis.guardar': 'SAVE NAME',
    'asis.texto': 'GENESIS understands normal sentences, in Spanish or English. It prepares everything and you confirm: it never sends money on its own.',
    'asis.ej1': 'i want to see veta wallet',
    'asis.ej2': 'send 15 to Juan',
    'asis.ej3': 'open mytokenpay',
    'asis.ej4': 'show me the explorer',
    'asis.ej5': 'open the brain',
    'asis.ej6': 'i want to chat with María',
    'asis.regla1': 'It only opens what exists in the app map.',
    'asis.regla2': 'Anything that touches money, you confirm with your finger.',
    'asis.regla3': 'It shows you what it understood before doing anything.',
    'chat.titulo': 'Chat',
    'chat.sub': 'The people of the ecosystem, with Genesis ID',
    'chat.buscar': 'Search by name or email…',
    'chat.directorio': 'IN THE ECOSYSTEM',
    'chat.nadie': 'Nobody with that name yet. When that person joins Orden Global, they will appear here.',
    'chat.vacio': 'No conversations yet. Add a contact and say hello.',
    'chat.nuevo': 'NEW CONTACT',
    'chat.nombre': 'Name',
    'chat.correo': 'Contact email',
    'chat.agregar': 'ADD',
    'chat.escribe': 'Type…',
    'chat.enviarOrigen': 'SEND ORIGEN',
    'chat.origenNota': 'Veta Wallet opens with the send prepared. You sign it there.',
    'chat.enCadena': 'stored on chain',
    'cer.titulo': 'The brain',
    'cer.sub': 'Seven agents watch the ecosystem. This is the network, live.',
    'cer.abrir': 'OPEN THE FULL BRAIN',
    'volver': 'Back',
    'cargando': 'Loading…',
  },
};

// Almacén mínimo con suscripción: cambiar el idioma repinta todo sin
// arrastrar un contexto por cada pantalla.
let idioma = 'es';
const oyentes = new Set();
export function setIdioma(x) {
  idioma = x === 'en' ? 'en' : 'es';
  SecureStore.setItemAsync('og.idioma', idioma).catch(() => {});
  oyentes.forEach((f) => f());
}
export async function cargarIdioma() {
  const g = await SecureStore.getItemAsync('og.idioma').catch(() => null);
  if (g) idioma = g;
}
export function useT() {
  const idi = useSyncExternalStore(
    (cb) => { oyentes.add(cb); return () => oyentes.delete(cb); },
    () => idioma,
  );
  const t = (k, vars) => {
    let s = (D[idi] && D[idi][k]) || D.es[k] || k;
    if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  };
  t.idioma = idi;
  return t;
}
export const idiomaActual = () => idioma;
