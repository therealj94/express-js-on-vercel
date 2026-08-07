// Los dos idiomas de Veta Wallet, uno junto al otro.
//
// El idioma se decide antes de leer: se toma del navegador en la primera
// visita, se puede cambiar desde cualquier pantalla, y lo elegido se recuerda.
// Las claves cortas ("saldo.lbl") nombran el LUGAR del texto, no su contenido:
// asi el mismo codigo pinta cualquiera de los dos sin enterarse de cual.

const I18N = {
es: {
  'bv.t1': 'Tu oro,', 'bv.t2': 'en tu bolsillo.',
  'bv.p': 'ORIGEN es oro real, certificado y guardado, que viaja a la velocidad de un mensaje. Guardalo, enviálo, pagá con él.',
  'bv.crear': 'Crear mi cuenta', 'bv.entrar': 'Ya tengo cuenta',
  'bv.h1': 'respaldo en oro físico', 'bv.h2': 'nuestra propia cadena', 'bv.h3': 'identidad para todo el ecosistema',
  'bv.eq': 'Un gramin: la división exacta del gramo de oro certificado.',
  'bv.qr': 'Escanealo y abrí Veta Wallet en tu teléfono.',
  'acc.pt1': 'El oro entra', 'acc.pt2': 'a tu nombre.',
  'acc.p': 'Una cuenta, tu billetera en la cadena de Orden Global y tu identidad Genesis ID. Todo empieza aquí.',
  'acc.gid': 'Con Genesis ID te verificás una sola vez y quedás verificado en todo el ecosistema.',
  'acc.tEntrar': 'Entrar', 'acc.tCrear': 'Crear cuenta',
  'acc.nombre': 'Nombre completo', 'acc.nombrePh': 'Como aparece en tu documento',
  'acc.correo': 'Correo', 'acc.clave': 'Contraseña',
  'acc.btnEntrar': 'Entrar', 'acc.btnCrear': 'Crear mi cuenta',
  'acc.entrando': 'Entrando…', 'acc.creando': 'Creando tu cuenta…',
  'acc.legal': 'Al crear tu cuenta aceptás los <a href="/terminos">términos</a> y la <a href="/privacidad">política de privacidad</a>.',
  'acc.volver': 'Volver',
  'nav.inicio': 'Inicio', 'nav.enviar': 'Enviar', 'nav.recibir': 'Recibir',
  'nav.actividad': 'Actividad', 'nav.cuenta': 'Mi cuenta', 'nav.id': 'Identidad',
  'pie.term': 'Términos', 'pie.priv': 'Privacidad',
  'saldo.lbl': 'Tu saldo', 'saldo.err': 'No pudimos leer tu saldo.', 'saldo.re': 'Reintentar',
  'a.enviar': 'Enviar', 'a.recibir': 'Recibir', 'a.comprar': 'Comprar', 'a.cambiar': 'Cambiar',
  'a.compraPronto': 'La compra con tarjeta llega en la próxima versión.',
  'a.cambioPronto': 'El cambio entre monedas llega en la próxima versión.',
  'ini.hola': 'Hola', 'ini.act': 'Actualizar', 'ini.movs': 'Movimientos', 'ini.verTodos': 'Ver todos',
  'ini.vacioT': 'Todavía no hay movimientos', 'ini.vacioP': 'Cuando recibas o envíes ORIGEN, todo va a aparecer acá.',
  'gid.ok': 'Verificada', 'gid.rev': 'En revisión', 'gid.no': 'Sin verificar', 'gid.mal': 'Rechazada', 'gid.sus': 'Suspendida',
  'gid.okP': 'Tu Genesis ID está activa. Vale en Veta Wallet, MyTokenPay y todo el ecosistema.',
  'gid.revP': 'Un operador de cumplimiento está revisando tus datos. Suele tardar menos de 24 horas.',
  'gid.noP': 'Verificá tu identidad una sola vez y quedás verificado en todo el ecosistema.',
  'gid.malP': 'La verificación no pasó. Escribinos y lo revisamos con vos.',
  'gid.susP': 'Tu identidad quedó suspendida. Escribinos para reactivarla.',
  'gid.btn': 'Verificar mi identidad',
  'env.t': 'Enviar ORIGEN', 'env.tenes': 'Tenés', 'env.disp': 'ORIGEN disponibles',
  'env.dir': 'Dirección de destino', 'env.cant': 'Cantidad', 'env.clave': 'Tu contraseña',
  'env.revisar': 'Revisar el envío', 'env.confirmar': 'Confirmar y enviar', 'env.enviando': 'Enviando…',
  'env.nota': 'Los envíos en la cadena de Orden Global no se pueden deshacer. Revisá la dirección antes de confirmar.',
  'env.eDir': 'Esa no parece una dirección de la cadena. Tiene que empezar con 0x y llevar 40 caracteres.',
  'env.eCant': 'Escribí una cantidad mayor que cero.', 'env.eAlcanza': 'No te alcanza: tenés',
  'env.eClave': 'Necesitamos tu contraseña para firmar el envío.',
  'env.vas': 'Vas a enviar', 'env.a': 'a', 'env.toca': 'Tocá otra vez para confirmar.',
  'env.hecho': 'Enviaste', 'env.avHecho': 'Envío hecho',
  'env.eMalClave': 'La contraseña no coincide.', 'env.eDuda': 'Revisá tu actividad antes de volver a intentarlo.',
  'rec.t': 'Recibir ORIGEN', 'rec.sub': 'Mostrá este código o compartí tu dirección',
  'rec.sinT': 'Todavía no tenemos tu dirección', 'rec.sinP': 'Actualizá para traerla del servidor.',
  'rec.copiar': 'Copiar dirección', 'rec.compartir': 'Compartir',
  'rec.nota': 'Solo enviá ORIGEN de la cadena de Orden Global a esta dirección. Otras monedas se pierden.',
  'rec.copiada': 'Dirección copiada', 'rec.noCopia': 'No pudimos copiar. Seleccioná la dirección a mano.',
  'act.t': 'Actividad', 'act.sub': 'Todo lo que entró y salió de tu billetera',
  'act.entra': 'Recibiste', 'act.sale': 'Enviaste',
  'id.t': 'Genesis ID', 'id.sub': 'Tu identidad digital en el ecosistema Orden Global',
  'id.unaT': 'Una verificación, todo el ecosistema',
  'id.unaP': 'Con una sola verificación de Genesis ID quedás verificado en Veta Wallet, en MyTokenPay y en el resto de los servicios de Orden Global. No hay que repetir el trámite en cada uno.',
  'id.r1': 'Enviar y recibir sin límites de cuenta no verificada',
  'id.r2': 'Pagar en comercios afiliados y cobrar como negocio',
  'id.r3': 'La misma identidad, en cualquier servicio del grupo',
  'id.todo': 'Todo Orden Global',
  'cta.t': 'Mi cuenta', 'cta.nombre': 'Nombre', 'cta.correo': 'Correo', 'cta.dir': 'Dirección de la billetera',
  'cta.sinDir': 'todavía sin asignar',
  'cta.appT': 'La aplicación del teléfono',
  'cta.appP': 'La misma cuenta funciona en Android y iPhone, y ahí además tenés la tarjeta, los contactos y el lector de códigos.',
  'cta.salirT': 'Cerrar sesión', 'cta.salirP': 'Se borra la sesión de este navegador. Tu dinero y tu cuenta no se tocan.',
  'err.tarda': 'El servidor tardó demasiado. Probá de nuevo.',
  'err.red': 'No hay conexión con el servidor. Revisá tu internet.',
  'err.completa': 'Completá el correo y la contraseña.', 'err.corta': 'La contraseña necesita al menos 8 caracteres.',
  'err.nombre': 'Escribí tu nombre completo.',
  'err.cred': 'El correo o la contraseña no coinciden. Revisá los dos.',
  'err.existe': 'Ya hay una cuenta con ese correo. Probá entrando.',
  'err.sesion': 'El servidor no devolvió una sesión válida.',
  'ok.creada': 'Tu cuenta está lista', 'ok.hola': 'Hola de nuevo',
  'ok.act': 'Actualizando…',
  'x.precio': '1 ORIGEN =', 'x.hoy': 'hoy',
  'q.sello': 'Qué es ORIGEN', 'q.t1': 'Oro que se mueve', 'q.t2': 'como un mensaje.',
  'q.p': 'Cada ORIGEN es un gramin: una fracción exacta de un gramo de oro certificado, guardado en bóveda y anclado uno a uno. No es una promesa de oro. Es el oro, con otra forma de viajar.',
  'q.1t': 'Sale de la tierra',
  'q.1p': 'Oro extraído de concesiones propias y certificado bajo estándar internacional NI 43-101. Antes de existir como saldo, existe como metal.',
  'q.2t': 'Entra en la bóveda',
  'q.2p': 'Cada barra se custodia y se ancla uno a uno. Lo que entra, queda: por cada ORIGEN en circulación hay un gramin de oro guardado.',
  'q.3t': 'Se vuelve dinero',
  'q.3p': 'Sobre la cadena 8532, la Layer 1 de Orden Global. Se envía en segundos, se paga en comercios y cruza fronteras sin pedir permiso.',
  'b.sello': 'La bóveda', 'b.t1': 'El metal no', 'b.t2': 'se mueve de ahí.',
  'b.p': 'La diferencia entre una moneda respaldada y una que dice estarlo es si alguien puede comprobarlo. Acá se puede, a cualquier hora.',
  'b.cifra': 'un gramin guardado por cada ORIGEN',
  'b.g1t': 'Certificado NI 43-101',
  'b.g1p': 'El estándar internacional para declarar reservas minerales. Lo firma un tercero, no nosotros.',
  'b.g2t': 'Custodia en bóveda',
  'b.g2p': 'El metal físico permanece guardado y asegurado. Emitir más ORIGEN exige meter más oro primero.',
  'b.g3t': 'Auditable 24/7',
  'b.g3p': 'La emisión y cada movimiento quedan en una cadena pública. Se revisa en ordenscan sin pedirnos nada.',
  'e.sello': 'El ecosistema', 'e.t1': 'Una cuenta.', 'e.t2': 'Todo Orden Global.',
  'e.p': 'Veta Wallet no viene sola. Tu identidad, los comercios donde gastás y el registro público de la cadena son piezas del mismo sistema.',
  'e.gid': 'Tu identidad digital. Verificate una sola vez y quedás verificado en todos los servicios del grupo.',
  'e.mtp': 'La capa de comercio. Encontrá negocios que aceptan ORIGEN y pagá desde esta misma billetera.',
  'e.scan': 'El explorador de la cadena 8532. Cada bloque y cada transacción, a la vista de cualquiera.',
  'e.ver': 'Abrir',
  'c.t1': 'Tu oro empieza', 'c.t2': 'con una cuenta.',
  'pw.0': 'Muy corta', 'pw.1': 'Débil', 'pw.2': 'Aceptable', 'pw.3': 'Buena', 'pw.4': 'Fuerte',
},
en: {
  'bv.t1': 'Your gold,', 'bv.t2': 'in your pocket.',
  'bv.p': 'ORIGEN is real, certified, vaulted gold that travels at the speed of a message. Hold it, send it, pay with it.',
  'bv.crear': 'Create my account', 'bv.entrar': 'I have an account',
  'bv.h1': 'backed by physical gold', 'bv.h2': 'our own chain', 'bv.h3': 'one identity for the whole ecosystem',
  'bv.eq': 'One gramin: the exact division of a certified gram of gold.',
  'bv.qr': 'Scan it to open Veta Wallet on your phone.',
  'acc.pt1': 'The gold arrives', 'acc.pt2': 'in your name.',
  'acc.p': 'One account, your wallet on the Orden Global chain, and your Genesis ID. Everything starts here.',
  'acc.gid': 'With Genesis ID you verify once and stay verified across the whole ecosystem.',
  'acc.tEntrar': 'Sign in', 'acc.tCrear': 'Create account',
  'acc.nombre': 'Full name', 'acc.nombrePh': 'As it appears on your ID',
  'acc.correo': 'Email', 'acc.clave': 'Password',
  'acc.btnEntrar': 'Sign in', 'acc.btnCrear': 'Create my account',
  'acc.entrando': 'Signing in…', 'acc.creando': 'Creating your account…',
  'acc.legal': 'By creating your account you accept the <a href="/terminos">terms</a> and the <a href="/privacidad">privacy policy</a>.',
  'acc.volver': 'Back',
  'nav.inicio': 'Home', 'nav.enviar': 'Send', 'nav.recibir': 'Receive',
  'nav.actividad': 'Activity', 'nav.cuenta': 'My account', 'nav.id': 'Identity',
  'pie.term': 'Terms', 'pie.priv': 'Privacy',
  'saldo.lbl': 'Your balance', 'saldo.err': 'We could not read your balance.', 'saldo.re': 'Retry',
  'a.enviar': 'Send', 'a.recibir': 'Receive', 'a.comprar': 'Buy', 'a.cambiar': 'Swap',
  'a.compraPronto': 'Card purchases arrive in the next release.',
  'a.cambioPronto': 'Swapping between currencies arrives in the next release.',
  'ini.hola': 'Hello', 'ini.act': 'Refresh', 'ini.movs': 'Transactions', 'ini.verTodos': 'See all',
  'ini.vacioT': 'No transactions yet', 'ini.vacioP': 'When you receive or send ORIGEN, everything shows up here.',
  'gid.ok': 'Verified', 'gid.rev': 'Under review', 'gid.no': 'Not verified', 'gid.mal': 'Rejected', 'gid.sus': 'Suspended',
  'gid.okP': 'Your Genesis ID is active. It works in Veta Wallet, MyTokenPay and the whole ecosystem.',
  'gid.revP': 'A compliance officer is reviewing your data. It usually takes less than 24 hours.',
  'gid.noP': 'Verify your identity once and you are verified across the whole ecosystem.',
  'gid.malP': 'Verification did not pass. Write to us and we will review it with you.',
  'gid.susP': 'Your identity was suspended. Write to us to reactivate it.',
  'gid.btn': 'Verify my identity',
  'env.t': 'Send ORIGEN', 'env.tenes': 'You have', 'env.disp': 'ORIGEN available',
  'env.dir': 'Destination address', 'env.cant': 'Amount', 'env.clave': 'Your password',
  'env.revisar': 'Review the transfer', 'env.confirmar': 'Confirm and send', 'env.enviando': 'Sending…',
  'env.nota': 'Transfers on the Orden Global chain cannot be undone. Check the address before confirming.',
  'env.eDir': 'That does not look like a chain address. It starts with 0x and has 40 characters.',
  'env.eCant': 'Enter an amount greater than zero.', 'env.eAlcanza': 'Not enough: you have',
  'env.eClave': 'We need your password to sign the transfer.',
  'env.vas': 'You are about to send', 'env.a': 'to', 'env.toca': 'Tap again to confirm.',
  'env.hecho': 'You sent', 'env.avHecho': 'Transfer sent',
  'env.eMalClave': 'The password does not match.', 'env.eDuda': 'Check your activity before trying again.',
  'rec.t': 'Receive ORIGEN', 'rec.sub': 'Show this code or share your address',
  'rec.sinT': 'We do not have your address yet', 'rec.sinP': 'Refresh to fetch it from the server.',
  'rec.copiar': 'Copy address', 'rec.compartir': 'Share',
  'rec.nota': 'Only send ORIGEN from the Orden Global chain to this address. Other coins are lost.',
  'rec.copiada': 'Address copied', 'rec.noCopia': 'We could not copy. Select the address by hand.',
  'act.t': 'Activity', 'act.sub': 'Everything that came in and out of your wallet',
  'act.entra': 'Received', 'act.sale': 'Sent',
  'id.t': 'Genesis ID', 'id.sub': 'Your digital identity across the Orden Global ecosystem',
  'id.unaT': 'One verification, the whole ecosystem',
  'id.unaP': 'With a single Genesis ID verification you are verified in Veta Wallet, MyTokenPay and the rest of the Orden Global services. No repeating the process in each one.',
  'id.r1': 'Send and receive without unverified-account limits',
  'id.r2': 'Pay at partner merchants and charge as a business',
  'id.r3': 'The same identity, in any service of the group',
  'id.todo': 'All of Orden Global',
  'cta.t': 'My account', 'cta.nombre': 'Name', 'cta.correo': 'Email', 'cta.dir': 'Wallet address',
  'cta.sinDir': 'not assigned yet',
  'cta.appT': 'The phone app',
  'cta.appP': 'The same account works on Android and iPhone, where you also get the card, contacts and the code scanner.',
  'cta.salirT': 'Sign out', 'cta.salirP': 'Clears the session from this browser. Your money and your account are untouched.',
  'err.tarda': 'The server took too long. Try again.',
  'err.red': 'No connection to the server. Check your internet.',
  'err.completa': 'Fill in the email and the password.', 'err.corta': 'The password needs at least 8 characters.',
  'err.nombre': 'Write your full name.',
  'err.cred': 'The email or the password do not match. Check both.',
  'err.existe': 'There is already an account with that email. Try signing in.',
  'err.sesion': 'The server did not return a valid session.',
  'ok.creada': 'Your account is ready', 'ok.hola': 'Welcome back',
  'ok.act': 'Refreshing…',
  'x.precio': '1 ORIGEN =', 'x.hoy': 'today',
  'q.sello': 'What ORIGEN is', 'q.t1': 'Gold that moves', 'q.t2': 'like a message.',
  'q.p': 'Each ORIGEN is one gramin: an exact fraction of a certified gram of gold, held in a vault and anchored one to one. It is not a promise of gold. It is the gold, with another way to travel.',
  'q.1t': 'It comes out of the ground',
  'q.1p': 'Gold mined from our own concessions and certified under the NI 43-101 international standard. Before it exists as a balance, it exists as metal.',
  'q.2t': 'It goes into the vault',
  'q.2p': 'Every bar is held in custody and anchored one to one. What goes in, stays: for every ORIGEN in circulation there is a gramin of gold stored.',
  'q.3t': 'It becomes money',
  'q.3p': 'On chain 8532, the Orden Global Layer 1. It sends in seconds, pays at merchants and crosses borders without asking permission.',
  'b.sello': 'The vault', 'b.t1': 'The metal does not', 'b.t2': 'move from there.',
  'b.p': 'The difference between a backed currency and one that claims to be backed is whether anyone can check. Here they can, at any hour.',
  'b.cifra': 'one gramin stored per ORIGEN',
  'b.g1t': 'NI 43-101 certified',
  'b.g1p': 'The international standard for declaring mineral reserves. A third party signs it, not us.',
  'b.g2t': 'Vault custody',
  'b.g2p': 'The physical metal stays stored and insured. Issuing more ORIGEN requires putting in more gold first.',
  'b.g3t': 'Auditable 24/7',
  'b.g3p': 'Issuance and every movement are recorded on a public chain. Check it on ordenscan without asking us for anything.',
  'e.sello': 'The ecosystem', 'e.t1': 'One account.', 'e.t2': 'All of Orden Global.',
  'e.p': 'Veta Wallet does not come alone. Your identity, the merchants where you spend and the public record of the chain are parts of the same system.',
  'e.gid': 'Your digital identity. Verify once and stay verified across every service of the group.',
  'e.mtp': 'The commerce layer. Find businesses that accept ORIGEN and pay from this same wallet.',
  'e.scan': 'The chain 8532 explorer. Every block and every transaction, in plain sight.',
  'e.ver': 'Open',
  'c.t1': 'Your gold starts', 'c.t2': 'with an account.',
  'pw.0': 'Too short', 'pw.1': 'Weak', 'pw.2': 'Acceptable', 'pw.3': 'Good', 'pw.4': 'Strong',
},
};

// ── el motor ─────────────────────────────────────────────────────────────────
let idiomaActual = (() => {
  try { const g = localStorage.getItem('veta.idioma'); if (g === 'es' || g === 'en') return g; } catch {}
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
})();

function t(clave) {
  return I18N[idiomaActual][clave] ?? I18N.es[clave] ?? clave;
}

/* Pinta todos los textos estaticos (data-t / data-tp) y los que se componen:
   el titular palabra a palabra, la promesa del acceso, el pie legal. */
function pintarIdioma() {
  document.documentElement.lang = idiomaActual;
  document.querySelectorAll('[data-t]').forEach(el => { el.innerHTML = t(el.dataset.t); });
  document.querySelectorAll('[data-tp]').forEach(el => { el.placeholder = t(el.dataset.tp); });
  document.querySelectorAll('[data-lang]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === idiomaActual));
  });
  // El titular de la portada, palabra a palabra: cada una sube desde detras de
  // su renglon, en orden. Se reconstruye al cambiar de idioma para que la
  // entrada se repita: cambiar de idioma ES volver a abrir la pagina.
  const h = document.getElementById('bv-titulo');
  if (h) {
    const linea = (texto, italica, base) => '<span class="renglon">' +
      texto.split(' ').map((p, i) =>
        `<span class="palabra" style="animation-delay:${(base + i) * 90 + 250}ms">${italica ? '<i>' + p + '</i>' : p}&nbsp;</span>`
      ).join('') + '</span>';
    h.innerHTML = linea(t('bv.t1'), false, 0) + linea(t('bv.t2'), true, t('bv.t1').split(' ').length);
  }
  [['q-titulo', 'q'], ['b-titulo', 'b'], ['e-titulo', 'e'], ['c-titulo', 'c']].forEach(([id, k]) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `${t(k + '.t1')}<br><i>${t(k + '.t2')}</i>`;
  });
  const pr = document.getElementById('acc-promesa');
  if (pr) pr.innerHTML = `${t('acc.pt1')}<br><i>${t('acc.pt2')}</i>`;
  const lg = document.getElementById('acc-legal');
  if (lg) lg.innerHTML = t('acc.legal');
}
