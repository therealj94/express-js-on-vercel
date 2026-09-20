/* OrdenExchange · Panel de operadores (/admin)
   HTML + CSS + JS sin compilación. Estado en memoria (S), ruteo por hash, render por vista.
   Contrato: API.md → «Panel de operadores (/api/panel…)». Tipos: src/types.ts.
   Todo lo que viene del servidor (apodos, mensajes, notas) pasa por esc() antes de innerHTML. */
(() => {
'use strict';

const CLAVE_SESION = 'ordenexchange.panel';
const CLAVE_IDIOMA = 'ordenexchange.panel.idioma';
const BASE = '/api/panel';
const SONDEO_MS = 20000;
/** La orden abierta se vuelve a pedir cada 5 s: API.md no da al panel mensajes incrementales. */
const SONDEO_ORDEN_MS = 5000;
const ESPERA_MS = 25000;
/** El servidor exige notas/motivos de al menos 5 caracteres y contraseñas de operador de 10 (FALTA EN API). */
const MIN_NOTA = 5;
const MIN_CONTRASENA = 10;
const ACTIVOS = ['ORIGEN', 'AUKA', 'AGKA'];
const ABIERTOS = ['pendiente-pago', 'pagado', 'apelacion'];
/** 1 ORIGEN = 1/55 g de oro; 1 onza troy = 31.1034768 g. */
const ONZAS_ORIGEN = (1 / 55) / 31.1034768;
const RE_IMAGEN = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const RE_HASH = /^0x[0-9a-f]{64}$/i;
const RE_DIRECCION = /^0x[0-9a-f]{40}$/i;

// ── Estado único ─────────────────────────────────────────────
const S = {
  token: null,
  operador: null,
  idioma: 'es',
  ruta: { vista: 'resumen', id: null, query: {} },
  cola: { apelaciones: null, retiros: null, agentes: null },
  sondeo: { timer: null, ultimo: null, error: false, vivoTimer: null },
  filtros: {
    ordenes: { estado: '', q: '', pagina: 1, tam: 0 },
    usuarios: { q: '', pagina: 1, tam: 0 },
    retiros: { estado: 'pendiente' },
    agentes: { estado: 'pendiente', q: '' },
    depositos: { pagina: 1, tam: 0 },
    bitacora: { q: '', pagina: 1, tam: 0 },
  },
  acciones: {},
  refrescar: {},
  ordenActual: null,
  temporizador: null,
  sondeoOrden: null,
  /** Lista de agentes aprobados/suspendidos que GET /agentes devuelve además de las solicitudes. */
  agentesLista: null,
  menuAbierto: false,
  shellIdioma: null,
};

// ── Textos (ES / EN) ─────────────────────────────────────────
const TEXTOS = {
  'panel': ['Panel de operadores', 'Operator panel'],
  'entrar': ['Entrar', 'Sign in'],
  'salir': ['Salir', 'Sign out'],
  'correo': ['Correo', 'Email'],
  'contrasena': ['Contraseña', 'Password'],
  'entrar.intro': ['Acceso restringido a operadores de OrdenExchange.', 'Restricted to OrdenExchange operators.'],
  'entrar.entrando': ['Entrando…', 'Signing in…'],
  'contrasena.titulo': ['Cambiar contraseña', 'Change password'],
  'contrasena.obligatoria': ['La contraseña es temporal. Elige una nueva para continuar.', 'Your password is temporary. Choose a new one to continue.'],
  'contrasena.actual': ['Contraseña actual', 'Current password'],
  'contrasena.nueva': ['Contraseña nueva (mínimo 10 caracteres)', 'New password (at least 10 characters)'],
  'contrasena.repetir': ['Repetir contraseña nueva', 'Repeat new password'],
  'contrasena.noCoincide': ['Las contraseñas no coinciden.', 'Passwords do not match.'],
  'contrasena.corta': ['Mínimo 10 caracteres.', 'At least 10 characters.'],
  'contrasena.cambiada': ['Contraseña actualizada.', 'Password updated.'],
  'guardar': ['Guardar', 'Save'],
  'cancelar': ['Cancelar', 'Cancel'],
  'confirmar': ['Confirmar', 'Confirm'],
  'cerrar': ['Cerrar', 'Close'],
  'copiar': ['Copiar', 'Copy'],
  'copiado': ['Copiado.', 'Copied.'],
  'buscar': ['Buscar', 'Search'],
  'cargando': ['Cargando…', 'Loading…'],
  'sinDatos': ['Nada que mostrar.', 'Nothing to show.'],
  'pagina': ['Página {n}', 'Page {n}'],
  'de.total': ['{n} en total', '{n} in total'],
  'anterior': ['Anterior', 'Previous'],
  'siguiente': ['Siguiente', 'Next'],
  'soloLectura': ['Solo lectura: este rol no permite cambios aquí.', 'Read only: this role cannot make changes here.'],
  'sinPermiso': ['Este rol no permite esa acción.', 'This role cannot perform that action.'],
  'nota': ['Nota', 'Note'],
  'motivo': ['Motivo', 'Reason'],
  'obligatorio': ['Este campo es obligatorio.', 'This field is required.'],
  'minimo': ['Mínimo {n} caracteres.', 'At least {n} characters.'],
  'error.red': ['No se pudo conectar con el servidor.', 'Could not reach the server.'],
  'error.tiempo': ['El servidor tardó demasiado en responder.', 'The server took too long to respond.'],
  'error.generico': ['Algo salió mal.', 'Something went wrong.'],
  'reintentar': ['Reintentar', 'Retry'],
  'vivo': ['En vivo', 'Live'],
  'vivo.hace': ['Sondeo {hace}', 'Polled {hace}'],
  'vivo.error': ['Sin conexión con el sondeo', 'Polling failed'],
  'vivo.pausa': ['Sondeo en pausa', 'Polling paused'],
  'menu': ['Menú', 'Menu'],
  'sesion.vencida': ['La sesión venció. Vuelve a entrar.', 'Session expired. Sign in again.'],
  'nueva.apelacion': ['Nueva apelación en la cola.', 'New appeal in the queue.'],
  'nuevo.retiro': ['Nuevo retiro pendiente.', 'New pending withdrawal.'],
  'nueva.solicitud': ['Nueva solicitud de agente.', 'New agent request.'],
  'v.resumen': ['Resumen', 'Overview'],
  'v.apelaciones': ['Apelaciones', 'Appeals'],
  'v.ordenes': ['Órdenes', 'Orders'],
  'v.agentes': ['Agentes', 'Agents'],
  'v.retiros': ['Retiros', 'Withdrawals'],
  'v.depositos': ['Depósitos', 'Deposits'],
  'v.usuarios': ['Usuarios', 'Users'],
  'v.precios': ['Precios', 'Prices'],
  'v.configuracion': ['Configuración', 'Settings'],
  'v.bitacora': ['Bitácora', 'Audit log'],
  'v.operadores': ['Operadores', 'Operators'],
  'v.contrasena': ['Cambiar contraseña', 'Change password'],
  'rol.admin': ['Administrador', 'Admin'],
  'rol.soporte': ['Soporte', 'Support'],
  'rol.auditor': ['Auditor', 'Auditor'],
  'eo.pendiente-pago': ['Pendiente de pago', 'Awaiting payment'],
  'eo.pagado': ['Pagado', 'Paid'],
  'eo.apelacion': ['En apelación', 'Under appeal'],
  'eo.completada': ['Completada', 'Completed'],
  'eo.cancelada': ['Cancelada', 'Cancelled'],
  'eo.todas': ['Todas', 'All'],
  'eo.abiertas': ['Abiertas', 'Open'],
  'ma.no-recibi-pago': ['No recibí el pago', 'Payment not received'],
  'ma.no-liberan': ['No liberan el activo', 'Asset not released'],
  'ma.monto-incorrecto': ['Monto incorrecto', 'Wrong amount'],
  'ma.otro': ['Otro', 'Other'],
  'si': ['Sí', 'Yes'],
  'no': ['No', 'No'],
  'r.colas': ['Colas de trabajo', 'Work queues'],
  'r.apelacionesAbiertas': ['Apelaciones abiertas', 'Open appeals'],
  'r.retirosPendientes': ['Retiros pendientes', 'Pending withdrawals'],
  'r.solicitudesAgente': ['Solicitudes de agente', 'Agent requests'],
  'r.pagadas': ['Pagadas, esperan liberación', 'Paid, awaiting release'],
  'r.ordenes': ['Órdenes', 'Orders'],
  'r.abiertas': ['Abiertas', 'Open'],
  'r.pendientesPago': ['Pendientes de pago', 'Awaiting payment'],
  'r.enApelacion': ['En apelación', 'Under appeal'],
  'r.completadas24h': ['Completadas 24 h', 'Completed 24h'],
  'r.completadas30d': ['Completadas 30 d', 'Completed 30d'],
  'r.volumen30d': ['Volumen 30 d', 'Volume 30d'],
  'r.usuarios': ['Usuarios', 'Users'],
  'r.total': ['Total', 'Total'],
  'r.verificados': ['Verificados', 'Verified'],
  'r.agentes': ['Agentes', 'Agents'],
  'r.congelados': ['Congelados', 'Frozen'],
  'r.custodia': ['Custodia (bóveda)', 'Custody (vault)'],
  'r.custodia.nota': ['Activo retenido por órdenes abiertas, retiros pendientes y garantías de agente.', 'Assets held for open orders, pending withdrawals and agent bonds.'],
  'r.tesoreria': ['Tesorería (comisiones cobradas)', 'Treasury (collected fees)'],
  'r.anunciosActivos': ['Anuncios activos', 'Active ads'],
  'r.sinGenesis': ['Genesis ID no está configurado: el tamiz de direcciones de los retiros no está disponible.', 'Genesis ID is not configured: withdrawal address screening is unavailable.'],
  'r.depositos24h': ['Depósitos 24 h', 'Deposits 24h'],
  'r.precios': ['Precios de referencia', 'Reference prices'],
  'r.oro': ['Oro USD/oz', 'Gold USD/oz'],
  'r.plata': ['Plata USD/oz', 'Silver USD/oz'],
  'r.fuente': ['Fuente', 'Source'],
  'r.actualizado': ['Actualizado', 'Updated'],
  'r.monedas': ['{n} monedas', '{n} currencies'],
  'r.almacen': ['Almacén', 'Storage'],
  'r.motor': ['Motor', 'Engine'],
  'r.efimero': ['Almacén efímero ({motor}): los datos se pierden al reiniciar el servidor.', 'Ephemeral storage ({motor}): data is lost when the server restarts.'],
  'r.persistente': ['Persistente', 'Persistent'],
  'r.efimeroCorto': ['Efímero', 'Ephemeral'],
  'r.editarPrecios': ['Editar precios', 'Edit prices'],
  'o.numero': ['Número', 'Number'],
  'o.estado': ['Estado', 'Status'],
  'o.activo': ['Activo', 'Asset'],
  'o.cantidad': ['Cantidad', 'Amount'],
  'o.monto': ['Monto', 'Fiat amount'],
  'o.precio': ['Precio', 'Price'],
  'o.comision': ['Comisión', 'Fee'],
  'o.comprador': ['Comprador', 'Buyer'],
  'o.vendedor': ['Vendedor', 'Seller'],
  'o.creada': ['Creada', 'Created'],
  'o.vence': ['Vence', 'Expires'],
  'o.vencida': ['Vencida', 'Expired'],
  'o.anuncio': ['Anuncio', 'Ad'],
  'o.ladoAnuncio': ['Lado del anuncio', 'Ad side'],
  'lado.compra': ['Compra', 'Buy'],
  'lado.venta': ['Venta', 'Sell'],
  'o.ventana': ['Ventana de pago', 'Payment window'],
  'o.min': ['{n} min', '{n} min'],
  'o.custodia': ['En custodia', 'In escrow'],
  'o.operacion': ['Operación', 'Trade'],
  'o.partes': ['Partes', 'Parties'],
  'o.metodo': ['Método de pago del vendedor', 'Seller payment method'],
  'o.metodoTipo': ['Método', 'Method'],
  'u.apelacionesPerdidas': ['Apelaciones perdidas', 'Appeals lost'],
  'u.tLiberacion': ['Tiempo medio de liberación', 'Avg. release time'],
  'u.tPago': ['Tiempo medio de pago', 'Avg. payment time'],
  'o.banco': ['Banco', 'Bank'],
  'o.titular': ['Titular', 'Account holder'],
  'o.camposOcultos': ['Los datos de la cuenta no vienen en esta vista.', 'Account details are not included in this view.'],
  'o.apelacion': ['Apelación', 'Appeal'],
  'o.abiertaPor': ['Abierta por', 'Opened by'],
  'o.detalle': ['Detalle', 'Details'],
  'o.abiertaEn': ['Abierta', 'Opened'],
  'o.resolucion': ['Resolución', 'Resolution'],
  'o.resueltaPor': ['Resuelta por', 'Resolved by'],
  'o.resueltaEn': ['Resuelta', 'Resolved'],
  'ea.abierta': ['Abierta', 'Open'],
  'ea.resuelta': ['Resuelta', 'Resolved'],
  'ea.retirada': ['Retirada', 'Withdrawn'],
  'res.liberar': ['Liberado al comprador', 'Released to buyer'],
  'res.devolver': ['Devuelto al vendedor', 'Returned to seller'],
  'o.lineaTiempo': ['Línea de tiempo', 'Timeline'],
  'o.pagada': ['Marcada como pagada', 'Marked as paid'],
  'o.referencia': ['Referencia', 'Reference'],
  'o.completada': ['Completada', 'Completed'],
  'o.cancelada': ['Cancelada', 'Cancelled'],
  'o.canceladaPor': ['por {quien}', 'by {quien}'],
  'cp.comprador': ['el comprador', 'the buyer'],
  'cp.sistema': ['el sistema (vencimiento)', 'the system (expired)'],
  'cp.operador': ['un operador', 'an operator'],
  'o.calificaciones': ['Calificaciones', 'Ratings'],
  'o.delComprador': ['Del comprador', 'From buyer'],
  'o.delVendedor': ['Del vendedor', 'From seller'],
  'cal.positiva': ['Positiva', 'Positive'],
  'cal.negativa': ['Negativa', 'Negative'],
  'o.sinCalificar': ['Sin calificar', 'Not rated'],
  'o.liberar': ['Liberar al comprador', 'Release to buyer'],
  'o.devolver': ['Devolver al vendedor', 'Return to seller'],
  'o.cancelarOrden': ['Cancelar orden', 'Cancel order'],
  'o.liberar.desc': ['El activo en custodia pasará al comprador. Explica por qué en la nota: queda en la bitácora y las partes la verán.', 'Escrowed assets go to the buyer. Explain why in the note: it is logged and both parties will see it.'],
  'o.devolver.desc': ['El activo en custodia volverá al vendedor. Explica por qué en la nota: queda en la bitácora y las partes la verán.', 'Escrowed assets go back to the seller. Explain why in the note: it is logged and both parties will see it.'],
  'o.cancelar.desc': ['La orden se cancelará y el activo en custodia volverá al vendedor.', 'The order will be cancelled and escrowed assets returned to the seller.'],
  'o.resuelta': ['Apelación resuelta.', 'Appeal resolved.'],
  'o.canceladaOk': ['Orden cancelada.', 'Order cancelled.'],
  'o.chat': ['Chat de la orden', 'Order chat'],
  'o.escribir': ['Escribir como operador…', 'Write as operator…'],
  'o.enviar': ['Enviar', 'Send'],
  'o.chat.nota': ['Ambas partes ven este mensaje firmado como operador.', 'Both parties see this message signed as operator.'],
  'o.sinMensajes': ['Sin mensajes todavía.', 'No messages yet.'],
  'o.sistema': ['Sistema', 'System'],
  'o.operador': ['Operador', 'Operator'],
  'o.verFicha': ['Ver ficha', 'View profile'],
  'o.reputacion': ['{c}/{t} completadas · {tasa} % en 30 d · +{p} −{n}', '{c}/{t} completed · {tasa}% in 30d · +{p} −{n}'],
  'o.restante': ['Restante', 'Remaining'],
  'o.imagen': ['Comprobante adjunto', 'Attached receipt'],
  'o.verificado': ['Verificado', 'Verified'],
  'o.agente': ['Agente', 'Agent'],
  'o.enLinea': ['En línea', 'Online'],
  'o.registrado': ['Registrado hace {d} d', 'Registered {d}d ago'],
  'o.apelacionesPerdidas': ['{n} apelaciones perdidas', '{n} appeals lost'],
  'o.volver': ['Volver', 'Back'],
  'ol.buscar': ['Buscar por número, apodo o correo', 'Search by number, nickname or email'],
  'ol.total': ['{n} órdenes', '{n} orders'],
  'ap.cola': ['Cola de apelaciones · más antiguas primero', 'Appeals queue · oldest first'],
  'ap.vacia': ['No hay apelaciones abiertas.', 'No open appeals.'],
  'ap.abiertaHace': ['Abierta {hace}', 'Opened {hace}'],
  'ap.atender': ['Atender', 'Handle'],
  'ap.esperando': ['Esperando', 'Waiting'],
  'ag.solicitudes': ['Solicitudes de agente', 'Agent requests'],
  'ag.pendientes': ['Pendientes', 'Pending'],
  'ag.aprobadas': ['Aprobadas', 'Approved'],
  'ag.rechazadas': ['Rechazadas', 'Rejected'],
  'ag.retiradas': ['Retiradas', 'Withdrawn'],
  'ag.usuario': ['Usuario', 'User'],
  'ag.garantia': ['Garantía', 'Bond'],
  'ag.descripcion': ['Descripción', 'Description'],
  'ag.solicitada': ['Solicitada', 'Requested'],
  'ag.resuelta': ['Resuelta', 'Resolved'],
  'ag.aprobar': ['Aprobar', 'Approve'],
  'ag.rechazar': ['Rechazar', 'Reject'],
  'ag.aprobar.desc': ['El usuario pasa a ser agente de cambio con insignia; su garantía queda en custodia.', 'The user becomes a verified agent; the bond stays in custody.'],
  'ag.rechazar.desc': ['La garantía vuelve al usuario. Indica el motivo; el usuario lo verá.', 'The bond goes back to the user. State the reason; the user will see it.'],
  'ag.aprobada.ok': ['Solicitud aprobada.', 'Request approved.'],
  'ag.rechazada.ok': ['Solicitud rechazada.', 'Request rejected.'],
  'ag.vacia': ['No hay solicitudes en este estado.', 'No requests in this state.'],
  'ag.activos': ['Agentes activos y suspendidos', 'Active and suspended agents'],
  'ag.buscar': ['Buscar agente por apodo o correo', 'Search agent by nickname or email'],
  'ag.suspender': ['Suspender', 'Suspend'],
  'ag.reactivar': ['Reactivar', 'Reactivate'],
  'ag.suspender.desc': ['El agente pierde la insignia y sus anuncios se pausan hasta que se reactive.', 'The agent loses the badge and their ads are paused until reactivated.'],
  'ag.reactivar.desc': ['El usuario recupera la insignia de agente.', 'The user gets the agent badge back.'],
  'ag.estadoCambiado': ['Estado de agente actualizado.', 'Agent status updated.'],
  'ag.sinResultados': ['Ningún agente coincide con la búsqueda.', 'No agent matches the search.'],
  'ag.buscaPrimero': ['Busca por apodo o correo para ver agentes y suspenderlos o reactivarlos.', 'Search by nickname or email to see agents and suspend or reactivate them.'],
  'ea2.aprobado': ['Agente', 'Agent'],
  'ea2.suspendido': ['Suspendido', 'Suspended'],
  'ea2.solicitado': ['Solicitado', 'Requested'],
  'ea2.no': ['No es agente', 'Not an agent'],
  'es.pendiente': ['Pendiente', 'Pending'],
  'es.aprobada': ['Aprobada', 'Approved'],
  'es.rechazada': ['Rechazada', 'Rejected'],
  'es.retirada': ['Retirada', 'Withdrawn'],
  'rt.pendiente': ['Pendientes', 'Pending'],
  'rt.enviado': ['Enviados', 'Sent'],
  'rt.rechazado': ['Rechazados', 'Rejected'],
  'rt.cancelado': ['Cancelados', 'Cancelled'],
  'rt.direccion': ['Dirección', 'Address'],
  'rt.tamiz': ['Tamiz', 'Screening'],
  'rt.sancionada': ['Dirección sancionada', 'Sanctioned address'],
  'rt.limpia': ['Sin alertas', 'Clean'],
  'rt.sinTamiz': ['Sin tamizar', 'Not screened'],
  'rt.solicitado': ['Solicitado', 'Requested'],
  'rt.resuelto': ['Resuelto', 'Resolved'],
  'rt.marcarEnviado': ['Marcar enviado', 'Mark as sent'],
  'rt.rechazar': ['Rechazar', 'Reject'],
  'rt.enviado.desc': ['Pega el hash de la transacción con la que enviaste {cantidad} {activo} a la dirección del usuario.', 'Paste the hash of the transaction that sent {cantidad} {activo} to the user address.'],
  'rt.enviado.aviso': ['El tamiz marca esta dirección como sancionada. No envíes fondos salvo autorización expresa de un administrador.', 'Screening flags this address as sanctioned. Do not send funds without explicit admin authorization.'],
  'rt.rechazar.desc': ['El monto vuelve al disponible del usuario. Indica el motivo; el usuario lo verá.', 'The amount returns to the user balance. State the reason; the user will see it.'],
  'rt.txHash': ['Hash de la transacción', 'Transaction hash'],
  'rt.enviadoOk': ['Retiro marcado como enviado.', 'Withdrawal marked as sent.'],
  'rt.rechazadoOk': ['Retiro rechazado.', 'Withdrawal rejected.'],
  'rt.vacio': ['No hay retiros en este estado.', 'No withdrawals in this state.'],
  'rt.hashInvalido': ['El hash debe empezar por 0x y tener 66 caracteres.', 'Hash must start with 0x and be 66 characters long.'],
  'er.pendiente': ['Pendiente', 'Pending'],
  'er.enviado': ['Enviado', 'Sent'],
  'er.rechazado': ['Rechazado', 'Rejected'],
  'er.cancelado': ['Cancelado', 'Cancelled'],
  'dp.cuando': ['Cuándo', 'When'],
  'dp.desde': ['Desde', 'From'],
  'dp.bloque': ['Bloque', 'Block'],
  'dp.conf': ['Conf.', 'Conf.'],
  'dp.vacio': ['No hay depósitos.', 'No deposits.'],
  'dp.usuario': ['Usuario', 'User'],
  'ed.acreditado': ['Acreditado', 'Credited'],
  'ed.rechazado': ['Rechazado', 'Rejected'],
  'u.buscar': ['Buscar por apodo, correo o GID', 'Search by nickname, email or GID'],
  'u.apodo': ['Apodo', 'Nickname'],
  'u.pais': ['País', 'Country'],
  'u.gid': ['Genesis ID', 'Genesis ID'],
  'u.agente': ['Agente', 'Agent'],
  'u.congelado': ['Congelado', 'Frozen'],
  'u.registro': ['Registro', 'Joined'],
  'u.vacio': ['Ningún usuario coincide.', 'No user matches.'],
  'u.buscaPrimero': ['Escribe para buscar, o deja vacío para ver los más recientes.', 'Type to search, or leave empty to see the latest.'],
  'u.datos': ['Datos', 'Details'],
  'u.nombreLegal': ['Nombre legal', 'Legal name'],
  'u.idioma': ['Idioma', 'Language'],
  'u.telefono': ['Teléfono', 'Phone'],
  'u.direccionCadena': ['Dirección en la cadena', 'Chain address'],
  'u.moneda': ['Moneda', 'Currency'],
  'u.saldos': ['Saldos', 'Balances'],
  'u.disponible': ['Disponible', 'Available'],
  'u.enCustodia': ['En custodia', 'Frozen'],
  'u.reputacion': ['Reputación', 'Reputation'],
  'u.movimientos': ['Movimientos', 'Ledger'],
  'u.ordenes': ['Órdenes', 'Orders'],
  'u.anuncios': ['Anuncios', 'Ads'],
  'u.metodos': ['Métodos de pago', 'Payment methods'],
  'u.congelar': ['Congelar', 'Freeze'],
  'u.descongelar': ['Descongelar', 'Unfreeze'],
  'u.congelar.desc': ['El usuario no podrá operar ni retirar. El motivo queda en la bitácora.', 'The user will not be able to trade or withdraw. The reason is logged.'],
  'u.descongelar.desc': ['El usuario vuelve a poder operar y retirar.', 'The user can trade and withdraw again.'],
  'u.congeladoOk': ['Usuario congelado.', 'User frozen.'],
  'u.descongeladoOk': ['Usuario descongelado.', 'User unfrozen.'],
  'u.ajuste': ['Ajuste manual', 'Manual adjustment'],
  'u.ajuste.desc': ['Suma o resta al disponible. Usa signo negativo para restar. Solo administradores; queda en la bitácora.', 'Adds to or subtracts from the available balance. Use a negative sign to subtract. Admins only; it is logged.'],
  'u.ajuste.cantidad': ['Cantidad (con signo)', 'Amount (signed)'],
  'u.ajuste.invalida': ['Escribe un número distinto de cero, con punto decimal.', 'Enter a non-zero number with a decimal point.'],
  'u.ajusteOk': ['Saldo ajustado.', 'Balance adjusted.'],
  'u.motivoCongelado': ['Motivo del congelamiento', 'Freeze reason'],
  'u.sinMovimientos': ['Sin movimientos.', 'No ledger entries.'],
  'u.sinOrdenes': ['Sin órdenes.', 'No orders.'],
  'u.sinAnuncios': ['Sin anuncios.', 'No ads.'],
  'u.sinMetodos': ['Sin métodos de pago.', 'No payment methods.'],
  'u.retiros': ['Retiros', 'Withdrawals'],
  'u.depositos': ['Depósitos', 'Deposits'],
  'u.sinRetiros': ['Sin retiros.', 'No withdrawals.'],
  'u.sinDepositos': ['Sin depósitos.', 'No deposits.'],
  'u.solicitudAgente': ['Solicitud de agente', 'Agent request'],
  'u.registradoHace': ['hace {d} d', '{d}d ago'],
  'gid.sin-verificar': ['Sin verificar', 'Unverified'],
  'gid.en-revision': ['En revisión', 'In review'],
  'gid.verificada': ['Verificada', 'Verified'],
  'gid.rechazada': ['Rechazada', 'Rejected'],
  'gid.suspendida': ['Suspendida', 'Suspended'],
  'mv.tipo': ['Tipo', 'Type'],
  'mv.disponible': ['Δ disponible', 'Δ available'],
  'mv.congelado': ['Δ custodia', 'Δ frozen'],
  'mv.referencia': ['Referencia', 'Reference'],
  'mv.detalle': ['Detalle', 'Details'],
  'mv.deposito': ['Depósito', 'Deposit'],
  'mv.retiro-solicitado': ['Retiro solicitado', 'Withdrawal requested'],
  'mv.retiro-enviado': ['Retiro enviado', 'Withdrawal sent'],
  'mv.retiro-rechazado': ['Retiro rechazado', 'Withdrawal rejected'],
  'mv.orden-congelar': ['Custodia de orden', 'Order escrow'],
  'mv.orden-descongelar': ['Custodia devuelta', 'Escrow returned'],
  'mv.orden-liberar': ['Orden liberada', 'Order released'],
  'mv.orden-recibir': ['Orden recibida', 'Order received'],
  'mv.comision': ['Comisión', 'Fee'],
  'mv.garantia-agente': ['Garantía de agente', 'Agent bond'],
  'mv.garantia-devuelta': ['Garantía devuelta', 'Bond returned'],
  'mv.ajuste': ['Ajuste', 'Adjustment'],
  'mv.faucet': ['Faucet (demo)', 'Faucet (demo)'],
  'an.lado': ['Lado', 'Side'],
  'an.disponible': ['Disponible', 'Available'],
  'an.limites': ['Límites', 'Limits'],
  'an.estado': ['Estado', 'Status'],
  'an.margen': ['Margen', 'Margin'],
  'ean.activo': ['Activo', 'Active'],
  'ean.pausado': ['Pausado', 'Paused'],
  'ean.agotado': ['Agotado', 'Sold out'],
  'ean.cerrado': ['Cerrado', 'Closed'],
  'mp.inactivo': ['Inactivo', 'Inactive'],
  'p.metales': ['Metales · USD por onza troy', 'Metals · USD per troy ounce'],
  'p.fx': ['Tasas de cambio · USD → moneda local', 'Exchange rates · USD → local currency'],
  'p.moneda': ['Moneda', 'Currency'],
  'p.nombre': ['Nombre', 'Name'],
  'p.tasa': ['Tasa', 'Rate'],
  'p.referencia': ['Referencia resultante', 'Resulting reference'],
  'p.origenNota': ['1 ORIGEN = 1/55 g de oro · 1 AUKA = 1 oz de oro · 1 AGKA = 1 oz de plata. Los anuncios de precio flotante se calculan sobre estas referencias.', '1 ORIGEN = 1/55 g gold · 1 AUKA = 1 oz gold · 1 AGKA = 1 oz silver. Floating-price ads are computed from these references.'],
  'p.guardado': ['Precios guardados.', 'Prices saved.'],
  'p.sinCambios': ['No hay cambios que guardar.', 'No changes to save.'],
  'p.cambios': ['{n} cambios sin guardar', '{n} unsaved changes'],
  'p.actualizadoPor': ['por {quien}', 'by {quien}'],
  'p.invalido': ['Valor inválido en {campo}.', 'Invalid value in {campo}.'],
  'p.guardarCambios': ['Guardar cambios', 'Save changes'],
  'fuente.manual': ['Manual', 'Manual'],
  'fuente.env': ['Variable de entorno', 'Environment'],
  'fuente.auto': ['Automática', 'Automatic'],
  'fuente.semilla': ['Semilla', 'Seed'],
  'c.titulo': ['Parámetros de la plataforma', 'Platform parameters'],
  'c.comisionPct': ['Comisión (%) sobre el activo, cobrada al vendedor al liberar', 'Fee (%) on the asset, charged to the seller at release'],
  'c.garantiaAgente': ['Garantía de agente (ORIGEN)', 'Agent bond (ORIGEN)'],
  'c.maxOrdenesAbiertas': ['Máximo de órdenes abiertas por usuario', 'Max open orders per user'],
  'c.minOrdenUsd': ['Mínimo por orden (USD)', 'Minimum per order (USD)'],
  'c.maxOrdenUsdSinAgente': ['Máximo por orden sin ser agente (USD)', 'Max per order for non-agents (USD)'],
  'c.confirmacionesDeposito': ['Confirmaciones exigidas a un depósito', 'Confirmations required for deposits'],
  'c.tesoreria': ['Cuenta tesorería en la cadena 5550', 'Treasury account on chain 5550'],
  'c.guardada': ['Configuración guardada.', 'Settings saved.'],
  'c.aviso': ['Estos valores afectan a todas las órdenes nuevas de inmediato.', 'These values affect all new orders immediately.'],
  'c.rango': ['{campo}: debe estar entre {min} y {max}.', '{campo}: must be between {min} and {max}.'],
  'c.garantiaInvalida': ['La garantía debe ser un número decimal mayor o igual que cero (hasta 8 decimales).', 'The bond must be a decimal number of zero or more (up to 8 decimals).'],
  'c.tesoreriaInvalida': ['La tesorería debe ser una dirección 0x de 40 caracteres hexadecimales, o quedar vacía.', 'The treasury must be a 0x address of 40 hex characters, or be left empty.'],
  'b.integra': ['Cadena de hashes íntegra', 'Hash chain intact'],
  'b.rota': ['Integridad comprometida: alguna entrada fue alterada', 'Integrity compromised: an entry was altered'],
  'b.buscar': ['Buscar por actor, acción u objeto', 'Search by actor, action or object'],
  'b.n': ['N.º', 'No.'],
  'b.actor': ['Actor', 'Actor'],
  'b.accion': ['Acción', 'Action'],
  'b.objeto': ['Objeto', 'Object'],
  'b.detalle': ['Detalle', 'Details'],
  'b.hash': ['Hash', 'Hash'],
  'b.vacia': ['Sin entradas.', 'No entries.'],
  'b.verDetalle': ['Ver detalle', 'Show details'],
  'b.nota': ['Cada entrada lleva el hash de la anterior: alterar una vieja rompe la cadena.', 'Each entry carries the previous hash: altering an old one breaks the chain.'],
  'op.nuevo': ['Nuevo operador', 'New operator'],
  'op.nombre': ['Nombre', 'Name'],
  'op.rol': ['Rol', 'Role'],
  'op.estado': ['Estado', 'Status'],
  'op.activo': ['Activo', 'Active'],
  'op.inactivo': ['Inactivo', 'Inactive'],
  'op.creado': ['Creado', 'Created'],
  'op.ultimoAcceso': ['Último acceso', 'Last access'],
  'op.nunca': ['Nunca', 'Never'],
  'op.activar': ['Activar', 'Activate'],
  'op.desactivar': ['Desactivar', 'Deactivate'],
  'op.restablecer': ['Restablecer contraseña', 'Reset password'],
  'op.restablecerCorto': ['Restablecer', 'Reset'],
  'op.crear.desc': ['Se generará una contraseña temporal que deberá cambiar al entrar.', 'A temporary password will be generated; they must change it at first sign-in.'],
  'op.restablecer.desc': ['Se generará una contraseña temporal nueva para {nombre}. La actual dejará de funcionar.', 'A new temporary password will be generated for {nombre}. The current one stops working.'],
  'op.desactivar.desc': ['{nombre} no podrá entrar al panel hasta que se active de nuevo.', '{nombre} will not be able to sign in until reactivated.'],
  'op.secreto.titulo': ['Contraseña temporal de {nombre}', 'Temporary password for {nombre}'],
  'op.secreto.desc': ['Se muestra una sola vez. Cópiala y entrégala por un canal seguro.', 'Shown only once. Copy it and hand it over through a secure channel.'],
  'op.creadoOk': ['Operador creado.', 'Operator created.'],
  'op.estadoOk': ['Estado del operador actualizado.', 'Operator status updated.'],
  'op.tu': ['tú', 'you'],
  'op.debeCambiar': ['Debe cambiar contraseña', 'Must change password'],
  'op.correoInvalido': ['Escribe un correo válido.', 'Enter a valid email.'],
  'hace.ahora': ['ahora mismo', 'just now'],
  'hace.min': ['hace {n} min', '{n} min ago'],
  'hace.h': ['hace {n} h', '{n} h ago'],
  'hace.d': ['hace {n} d', '{n} d ago'],
  'en.seg': ['en {n} s', 'in {n} s'],
  'en.min': ['en {n} min', 'in {n} min'],
  'en.h': ['en {n} h', 'in {n} h'],
  'en.d': ['en {n} d', 'in {n} d'],
  'cod.sin-sesion': ['La sesión no es válida o venció.', 'The session is invalid or expired.'],
  'cod.estado-invalido': ['La acción no cabe en el estado actual.', 'The action does not fit the current state.'],
  'cod.contrasena': ['Contraseña incorrecta.', 'Wrong password.'],
  'cod.direccion-sancionada': ['La dirección está sancionada.', 'The address is sanctioned.'],
  'cod.sin-saldo': ['Saldo insuficiente.', 'Insufficient balance.'],
  'cod.congelado': ['La cuenta está congelada.', 'The account is frozen.'],
  'cod.no-verificado': ['La cuenta no tiene Genesis ID verificado.', 'The account has no verified Genesis ID.'],
  'cod.ordenes-abiertas': ['Tiene órdenes abiertas.', 'There are open orders.'],
  'cod.sin-permiso': ['Este rol no tiene permiso para esa acción.', 'This role has no permission for that action.'],
  'cod.credenciales': ['Correo o contraseña incorrectos.', 'Wrong email or password.'],
  'cod.bloqueado': ['Demasiados intentos fallidos. Espera 15 minutos.', 'Too many failed attempts. Wait 15 minutes.'],
  'cod.limite': ['Demasiadas peticiones. Espera un momento.', 'Too many requests. Wait a moment.'],
  'cod.nota': ['La nota es obligatoria (mínimo 5 caracteres).', 'A note is required (at least 5 characters).'],
  'cod.motivo': ['El motivo es obligatorio (mínimo 5 caracteres).', 'A reason is required (at least 5 characters).'],
  'cod.tx-hash': ['El hash de la transacción no es válido.', 'The transaction hash is not valid.'],
  'cod.cantidad': ['La cantidad no es válida.', 'The amount is not valid.'],
  'cod.mensaje': ['Escribe un mensaje.', 'Write a message.'],
  'cod.pais-no-permitido': ['El país del usuario no está permitido.', 'The user country is not allowed.'],
  'cod.genesis-no-configurado': ['Genesis ID no está configurado en el servidor.', 'Genesis ID is not configured on the server.'],
  'cod.cadena-no-configurada': ['La cadena 5550 no está configurada en el servidor.', 'Chain 5550 is not configured on the server.'],
  'cod.demo-solamente': ['Esa función solo existe en modo demo.', 'That feature only exists in demo mode.'],
  'cod.fuera-de-limites': ['Monto fuera de los límites.', 'Amount out of limits.'],
  'cod.requisitos': ['No cumple los requisitos.', 'Requirements not met.'],
  'cod.anuncio-propio': ['No se puede tomar el propio anuncio.', 'Cannot take your own ad.'],
};

function t(k, vars) {
  const par = TEXTOS[k];
  let s = par ? (S.idioma === 'en' ? (par[1] ?? par[0]) : par[0]) : k;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, v) => (v in vars ? String(vars[v]) : m));
  return s;
}
/** Traduce una clave con prefijo si existe; si no, devuelve el valor crudo. Siempre escapado. */
function tv(prefijo, valor, alternativo) {
  const k = prefijo + valor;
  return esc(TEXTOS[k] ? t(k) : (alternativo ?? valor ?? ''));
}

// ── Utilidades ───────────────────────────────────────────────
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function locale() { return S.idioma === 'en' ? 'en-US' : 'es-419'; }
function fmtNum(n, min = 0, max = 2) {
  const x = Number(n);
  if (!isFinite(x)) return esc(n);
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: min, maximumFractionDigits: max }).format(x);
}
/** Activos: 2 a 8 decimales, sin ceros infinitos. */
function fmtActivo(v, activo) {
  const x = Number(v);
  if (!isFinite(x)) return esc(v);
  return fmtNum(x, 2, 8) + (activo ? ' ' + esc(activo) : '');
}
function decimalesMoneda(moneda) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: moneda }).resolvedOptions().maximumFractionDigits; } catch { return 2; }
}
function fmtFiat(v, moneda) {
  const x = Number(v);
  if (!isFinite(x)) return esc(v) + ' ' + esc(moneda);
  const d = decimalesMoneda(moneda);
  return fmtNum(x, d, d) + ' ' + esc(moneda);
}
function fmtFecha(iso, conHora = true) {
  if (!iso) return '—';
  const f = new Date(iso);
  if (isNaN(f)) return esc(iso);
  const op = conHora ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' };
  if (conHora && f.getFullYear() !== new Date().getFullYear()) op.year = 'numeric';
  return new Intl.DateTimeFormat(locale(), op).format(f);
}
function hace(iso) {
  if (!iso) return '—';
  const f = new Date(iso);
  if (isNaN(f)) return esc(iso);
  const dif = Math.round((Date.now() - f.getTime()) / 1000);
  const a = Math.abs(dif);
  const p = dif >= 0 ? 'hace' : 'en';
  if (a < 45) return dif >= 0 ? t('hace.ahora') : t('en.seg', { n: a });
  if (a < 3600) return t(p + '.min', { n: Math.round(a / 60) });
  if (a < 86400) return t(p + '.h', { n: Math.round(a / 3600) });
  return t(p + '.d', { n: Math.round(a / 86400) });
}
function mmss(seg) {
  const m = Math.floor(seg / 60), s = seg % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function corto(h, ini = 8, fin = 6) {
  const s = String(h ?? '');
  return s.length > ini + fin + 1 ? s.slice(0, ini) + '…' + s.slice(-fin) : s;
}
function copiar(texto) {
  const listo = () => aviso(t('copiado'), 'ok');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, () => copiarViejo(texto, listo));
  else copiarViejo(texto, listo);
}
function copiarViejo(texto, listo) {
  const ta = document.createElement('textarea');
  ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); listo(); } catch { /* sin portapapeles */ }
  ta.remove();
}
function aviso(texto, tipo = 'info', ms = 4200) {
  const caja = document.getElementById('avisos');
  if (!caja) return;
  const el = document.createElement('div');
  el.className = 'aviso ' + tipo;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.textContent = texto;
  caja.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ── Iconos (SVG inline, 16×16, trazo) ────────────────────────
const ICONOS = {
  resumen: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  apelaciones: '<path d="M8 2.5v11M5 13.5h6M3 5h10"/><path d="M4.5 5l-2 4.5a2.3 2.3 0 0 0 4 0L4.5 5zM11.5 5l-2 4.5a2.3 2.3 0 0 0 4 0L11.5 5z"/>',
  ordenes: '<path d="M3 4h10M3 8h10M3 12h6"/>',
  agentes: '<path d="M8 2l5 1.8v4.2c0 3-2.1 5.1-5 6-2.9-.9-5-3-5-6V3.8L8 2z"/><path d="M5.8 8.2l1.5 1.5 3-3"/>',
  retiros: '<path d="M8 11V3M5 6l3-3 3 3M3 13.5h10"/>',
  depositos: '<path d="M8 3v8M5 8l3 3 3-3M3 13.5h10"/>',
  usuarios: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c0-3 2.2-4.5 5-4.5s5 1.5 5 4.5"/>',
  precios: '<path d="M2 12l3.5-4 3 2.5L14 4"/><path d="M10.5 4H14v3.5"/>',
  configuracion: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/><circle cx="6" cy="4.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="10.5" cy="8" r="1.4" fill="currentColor" stroke="none"/><circle cx="7" cy="11.5" r="1.4" fill="currentColor" stroke="none"/>',
  bitacora: '<path d="M4 2h8v12H4z"/><path d="M6.3 5h3.4M6.3 8h3.4M6.3 11h1.8"/>',
  operadores: '<circle cx="6" cy="10" r="3"/><path d="M8.2 7.8L14 2M11 5l1.6 1.6M12.6 3.4L14 4.8"/>',
  copiar: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3 10.5V3h7.5"/>',
  buscar: '<circle cx="7" cy="7" r="4.3"/><path d="M10.3 10.3L14 14"/>',
  alerta: '<path d="M8 2.2l6.3 11H1.7L8 2.2z"/><path d="M8 6.5v3M8 11.3v.4"/>',
  ok: '<path d="M3 8.5l3 3 7-7"/>',
  eslabon: '<path d="M6.5 9.5l3-3"/><path d="M7.2 11.2l-1.4 1.4a2.2 2.2 0 0 1-3.1-3.1l1.4-1.4M8.8 4.8l1.4-1.4a2.2 2.2 0 0 1 3.1 3.1l-1.4 1.4"/>',
  menu: '<path d="M2 4h12M2 8h12M2 12h12"/>',
  cerrar: '<path d="M4 4l8 8M12 4l-8 8"/>',
  candado: '<rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>',
  atras: '<path d="M10 3L5 8l5 5"/>',
  enviar: '<path d="M2 8l12-5.5L10.5 14 8 9 2 8z"/>',
  imagen: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 11l3.5-3.5 3 3 2-2L14 12"/><circle cx="10.5" cy="6" r="1"/>',
  vivo: '<circle cx="8" cy="8" r="2"/><path d="M4.5 4.5a5 5 0 0 0 0 7M11.5 4.5a5 5 0 0 1 0 7"/>',
};
function icono(n, clase = 'svg') {
  return `<svg class="${clase}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ''}</svg>`;
}

// ── Piezas de HTML reutilizables ─────────────────────────────
function cargando() { return `<div class="cargando">${t('cargando')}</div>`; }
function vacio(texto) { return `<div class="vacio">${esc(texto)}</div>`; }
function errorHtml(r, reintento) {
  return `<div class="vacio"><span class="coral">${esc(mensajeError(r))}</span>${reintento ? ` <button class="boton chico" data-accion="${esc(reintento)}" style="margin-left:8px">${t('reintentar')}</button>` : ''}</div>`;
}
function banda(tipo, texto) {
  return `<div class="aviso-banda ${tipo}">${icono('alerta')}<div>${texto}</div></div>`;
}
function copiable(texto, mostrado) {
  const v = String(texto ?? '');
  if (!v) return '—';
  return `<span class="copiable"><span class="mono">${esc(mostrado ?? v)}</span><button type="button" class="boton icono fantasma" data-copiar="${esc(v)}" title="${t('copiar')}" aria-label="${t('copiar')}">${icono('copiar')}</button></span>`;
}
function chip(texto, clase = '') { return `<span class="chip ${clase}">${texto}</span>`; }
function chipEstadoOrden(e) {
  const c = { 'pendiente-pago': 'ambar', pagado: 'senal', apelacion: 'coral', completada: 'verde', cancelada: 'gris' }[e] || '';
  return chip(tv('eo.', e), c);
}
function chipRetiro(e) {
  const c = { pendiente: 'ambar', enviado: 'verde', rechazado: 'coral', cancelado: 'gris' }[e] || '';
  return chip(tv('er.', e), c);
}
function chipGid(e) {
  const c = { verificada: 'verde', 'en-revision': 'ambar', rechazada: 'coral', suspendida: 'coral', 'sin-verificar': 'gris' }[e] || '';
  return chip(tv('gid.', e), c);
}
function chipAgente(e) {
  const c = { aprobado: 'oro', suspendido: 'coral', solicitado: 'ambar', no: 'gris' }[e] || '';
  return chip(tv('ea2.', e), c);
}
function insignias(u, todo) {
  let h = '';
  if (u.verificado) h += chip(t('o.verificado'), 'verde');
  if (u.agente) h += chip(t('o.agente'), 'oro');
  if (todo && u.enLinea) h += chip(t('o.enLinea'), 'senal');
  return h;
}
function reputacionLinea(rep) {
  if (!rep) return '';
  return esc(t('o.reputacion', { c: rep.ordenesCompletadas ?? 0, t: rep.ordenesTotales ?? 0, tasa: fmtNum(rep.tasaFinalizacion30d ?? 0, 0, 1), p: rep.positivas ?? 0, n: rep.negativas ?? 0 }))
    + ((rep.apelacionesPerdidas || 0) > 0 ? ` · <span class="coral">${esc(t('o.apelacionesPerdidas', { n: rep.apelacionesPerdidas }))}</span>` : '');
}
function enlaceUsuario(id, apodo) {
  if (!id) return esc(apodo || '—');
  return `<a class="enlace" href="#/usuarios/${encodeURIComponent(id)}">${esc(apodo || id)}</a>`;
}
function paginacionHtml(clave, pagina, mostrados, total) {
  const f = S.filtros[clave];
  if (mostrados && !f.tam) f.tam = mostrados;
  const tam = f.tam || mostrados || 1;
  // FALTA EN API: ninguna ruta del panel documenta `porPagina`; sin `total` se asume que una página
  // llena puede tener continuación.
  const hayMas = mostrados > 0 && (total != null ? (pagina - 1) * tam + mostrados < total : mostrados >= tam);
  return `<div class="paginacion">
    <span>${esc(t('pagina', { n: pagina }))}</span>
    ${total != null ? `<span class="tenue2">· ${esc(t('de.total', { n: fmtNum(total) }))}</span>` : ''}
    <span class="espacio"></span>
    <button class="boton chico" data-accion="pag-${esc(clave)}" data-ir="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>${t('anterior')}</button>
    <button class="boton chico" data-accion="pag-${esc(clave)}" data-ir="${pagina + 1}" ${hayMas ? '' : 'disabled'}>${t('siguiente')}</button>
  </div>`;
}
function soloLecturaHtml() {
  return `<span class="solo-lectura">${icono('candado')} ${esc(t('soloLectura'))}</span>`;
}
/** Campo de nota/motivo para los diálogos; con `minimo` aplica el largo mínimo que exige el servidor. */
function campoNota(nombre, etiqueta, requerido = true, minimo = 0) {
  return { nombre, etiqueta: etiqueta || t('nota'), tipo: 'textarea', requerido, min: minimo };
}
function campoHtml(c) {
  const id = 'd-' + c.nombre;
  const attrs = `id="${id}" name="${esc(c.nombre)}" ${c.requerido ? 'required' : ''} ${c.autocompletar ? `autocomplete="${esc(c.autocompletar)}"` : ''} ${c.marcador ? `placeholder="${esc(c.marcador)}"` : ''}`;
  let control;
  if (c.tipo === 'textarea') control = `<textarea ${attrs} rows="${c.filas || 3}">${esc(c.valor ?? '')}</textarea>`;
  else if (c.tipo === 'select') control = `<select ${attrs}>${(c.opciones || []).map(o => `<option value="${esc(o[0])}" ${o[0] === c.valor ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  else control = `<input ${attrs} type="${esc(c.tipo || 'text')}" class="${c.mono ? 'mono' : ''}" value="${esc(c.valor ?? '')}" ${c.paso ? `step="${esc(c.paso)}"` : ''} ${c.tipo === 'number' ? 'inputmode="decimal"' : ''}>`;
  return `<div class="campo"><label for="${id}">${esc(c.etiqueta)}</label>${control}${c.ayuda ? `<span class="ayuda">${esc(c.ayuda)}</span>` : ''}<span class="error" aria-live="polite"></span></div>`;
}

// ── Diálogos propios (sin alert/confirm) ─────────────────────
function dialogo(op) {
  return new Promise(resolve => {
    const d = document.getElementById('dialogo');
    const campos = (op.campos || []).map(campoHtml).join('');
    d.innerHTML = `<form method="dialog" novalidate>
      <h3>${esc(op.titulo)}</h3>
      ${op.descripcion ? `<p class="descripcion">${esc(op.descripcion)}</p>` : ''}
      ${op.html || ''}
      ${campos}
      <div class="acciones">
        ${op.soloCerrar ? '' : `<button type="button" class="boton fantasma" data-cancelar>${t('cancelar')}</button>`}
        <button type="submit" class="boton ${op.peligro ? 'coral' : (op.clase || 'primario')}">${esc(op.confirmar || t('confirmar'))}</button>
      </div></form>`;
    const form = d.querySelector('form');
    let resultado = null;
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const valores = {};
      let valido = true;
      for (const c of (op.campos || [])) {
        const inp = form.elements[c.nombre];
        const v = (inp && inp.value != null ? inp.value : '').trim();
        const caja = inp ? inp.closest('.campo') : null;
        const err = caja ? caja.querySelector('.error') : null;
        if (caja) caja.classList.remove('invalido');
        if (err) err.textContent = '';
        let msg = '';
        if (c.requerido && !v) msg = t('obligatorio');
        else if (v && c.min && v.length < c.min) msg = t('minimo', { n: c.min });
        else if (v && c.validar) msg = c.validar(v, valores) || '';
        if (msg) { valido = false; if (caja) caja.classList.add('invalido'); if (err) err.textContent = msg; }
        valores[c.nombre] = v;
      }
      if (!valido) return;
      resultado = valores;
      d.close();
    });
    const btnCancelar = d.querySelector('[data-cancelar]');
    if (btnCancelar) btnCancelar.addEventListener('click', () => { resultado = null; d.close(); });
    d.addEventListener('close', () => resolve(resultado), { once: true });
    d.showModal();
    const primero = form.querySelector('input:not([type=hidden]),textarea,select');
    if (primero) primero.focus();
  });
}
function verImagen(src) {
  if (!RE_IMAGEN.test(src)) return;
  const v = document.getElementById('visor');
  v.innerHTML = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = t('o.imagen');
  v.appendChild(img);
  v.onclick = () => v.close();
  v.showModal();
}

// ── Único ayudante de red: nunca lanza ───────────────────────
async function api(ruta, op = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ESPERA_MS);
  const cab = { Accept: 'application/json' };
  if (op.cuerpo !== undefined) cab['Content-Type'] = 'application/json';
  if (S.token && !op.sinSesion) cab.Authorization = 'Bearer ' + S.token;
  let res, datos = null;
  try {
    res = await fetch(BASE + ruta, { method: op.metodo || 'GET', headers: cab, body: op.cuerpo !== undefined ? JSON.stringify(op.cuerpo) : undefined, signal: ctrl.signal, cache: 'no-store' });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, estado: 0, datos: { error: t(e && e.name === 'AbortError' ? 'error.tiempo' : 'error.red') } };
  }
  clearTimeout(timer);
  if (res.status !== 204) { try { datos = await res.json(); } catch { datos = null; } }
  if (res.status === 401 && !op.sinSesion && S.token) cerrarSesion(true);
  if (!res.ok && (!datos || typeof datos !== 'object')) datos = { error: t('error.generico') };
  return { ok: res.ok, estado: res.status, datos: datos || {} };
}
function mensajeError(r) {
  const d = (r && r.datos) || {};
  if (d.codigo && TEXTOS['cod.' + d.codigo]) return t('cod.' + d.codigo);
  return d.error || t('error.generico');
}

// ── Sesión y roles ───────────────────────────────────────────
function cargarSesion() {
  try {
    const j = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null');
    if (j && j.token) { S.token = j.token; S.operador = j.operador || null; }
  } catch { /* sin almacenamiento */ }
  try { const i = localStorage.getItem(CLAVE_IDIOMA); if (i === 'es' || i === 'en') S.idioma = i; else S.idioma = (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'; } catch { /* sin almacenamiento */ }
}
function guardarSesion() {
  try { localStorage.setItem(CLAVE_SESION, JSON.stringify({ token: S.token, operador: S.operador })); } catch { /* sin almacenamiento */ }
}
function cerrarSesion(vencida) {
  const habia = !!S.token;
  S.token = null; S.operador = null; S.ordenActual = null; S.agentesLista = null;
  S.cola = { apelaciones: null, retiros: null, agentes: null };
  S.sondeo.ultimo = null; S.sondeo.error = false;
  try { localStorage.removeItem(CLAVE_SESION); } catch { /* sin almacenamiento */ }
  detenerSondeo(); detenerTemporizador(); detenerSondeoOrden();
  const d = document.getElementById('dialogo');
  if (d && d.open) d.close();
  if (vencida && habia) aviso(t('sesion.vencida'), 'error');
  if (location.hash !== '#/entrar') location.hash = '#/entrar'; else render();
}
/** Permisos de ESCRITURA por rol (src/types.ts: admin todo; soporte apelaciones, retiros, agentes; auditor solo lee).
 *  Toda vista se puede LEER con cualquier rol: el auditor «lo lee todo», así que Configuración y Operadores
 *  se muestran a todos y solo se bloquean los cambios. */
const PERMISOS = {
  resolver: ['admin', 'soporte'], cancelar: ['admin', 'soporte'], chatear: ['admin', 'soporte'],
  agentes: ['admin', 'soporte'], retiros: ['admin', 'soporte'], congelar: ['admin', 'soporte'],
  precios: ['admin', 'soporte'], ajuste: ['admin'], configuracion: ['admin'], operadores: ['admin'],
};
function puede(a) { return !!S.operador && (PERMISOS[a] || []).includes(S.operador.rol); }
function esAuditor() { return !!S.operador && S.operador.rol === 'auditor'; }

// ── Ruteo por hash ───────────────────────────────────────────
const MENU = [
  { vista: 'resumen' }, { vista: 'apelaciones', cola: 'apelaciones' }, { vista: 'ordenes' },
  { vista: 'agentes', cola: 'agentes' }, { vista: 'retiros', cola: 'retiros' }, { vista: 'depositos' },
  { vista: 'usuarios' }, { vista: 'precios' }, { vista: 'configuracion' },
  { vista: 'bitacora' }, { vista: 'operadores' },
];
function leerRuta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [camino, qs] = h.split('?');
  const partes = camino.split('/').filter(Boolean);
  let id = null;
  try { id = partes[1] ? decodeURIComponent(partes[1]) : null; } catch { id = partes[1] || null; }
  return { vista: partes[0] || 'resumen', id, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
function ir(hash) { location.hash = hash; }

// ── Render ───────────────────────────────────────────────────
function render() {
  S.ruta = leerRuta();
  detenerTemporizador(); detenerSondeoOrden();
  S.acciones = {}; S.refrescar = {};
  const app = document.getElementById('app');
  if (!S.token) {
    S.shellIdioma = null;
    app.className = '';
    app.innerHTML = htmlEntrar();
    bindEntrar(app);
    return;
  }
  if (S.operador && S.operador.debeCambiarContrasena) {
    S.shellIdioma = null;
    app.className = '';
    app.innerHTML = `<div class="portada"><div class="portada-caja">${marcaHtml()}${htmlCambioContrasena(true)}</div></div>`;
    bindCambioContrasena(app, true);
    return;
  }
  const item = MENU.find(m => m.vista === S.ruta.vista);
  if (S.ruta.vista !== 'contrasena' && !item) { ir('#/resumen'); return; }
  if (S.shellIdioma !== S.idioma || !document.getElementById('lateral')) {
    app.className = 'app';
    app.innerHTML = htmlShell();
    bindShell(app);
    S.shellIdioma = S.idioma;
  }
  app.querySelectorAll('.menu a').forEach(a => {
    const act = a.dataset.vista === S.ruta.vista;
    a.classList.toggle('act', act);
    if (act) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  pintarContadores();
  cerrarMenu();
  pintarTitulo(t('v.' + S.ruta.vista));
  const vista = document.getElementById('vista');
  vista.scrollTop = 0;
  window.scrollTo(0, 0);
  const V = {
    resumen: vistaResumen, apelaciones: vistaApelaciones, ordenes: vistaOrdenes, agentes: vistaAgentes,
    retiros: vistaRetiros, depositos: vistaDepositos, usuarios: vistaUsuarios, precios: vistaPrecios,
    configuracion: vistaConfiguracion, bitacora: vistaBitacora, operadores: vistaOperadores, contrasena: vistaContrasena,
  };
  V[S.ruta.vista](vista);
  if (!S.sondeo.timer) iniciarSondeo();
}
function marcaHtml() {
  return `<a class="marca" href="#/resumen"><span class="marca-orden">Orden</span><span class="marca-exchange">Exchange</span><span class="marca-sub">${t('panel')}</span></a>`;
}
function htmlShell() {
  const o = S.operador || {};
  return `<aside class="lateral" id="lateral" aria-label="${t('menu')}">
    ${marcaHtml()}
    <nav class="menu">
      ${MENU.map(m => `<a href="#/${m.vista}" data-vista="${m.vista}">${icono(m.vista)}<span>${t('v.' + m.vista)}</span>${m.cola ? `<b class="cuenta" data-cola="${m.cola}">–</b>` : ''}</a>`).join('')}
    </nav>
    <div class="lateral-pie">
      <div class="operador-caja"><b>${esc(o.nombre || o.email || '')}</b><span>${esc(o.email || '')}</span><span style="margin-top:4px"><span class="rol ${esc(o.rol || '')}">${tv('rol.', o.rol)}</span></span></div>
      <div class="lateral-acciones">
        <button type="button" class="boton chico" data-idioma title="Español / English">${S.idioma === 'es' ? 'EN' : 'ES'}</button>
        <a class="boton chico" href="#/contrasena" title="${t('contrasena.titulo')}">${icono('candado')}</a>
        <button type="button" class="boton chico" data-salir>${t('salir')}</button>
      </div>
    </div>
  </aside>
  <div class="telon oculto" id="telon"></div>
  <div class="principal">
    <header class="barra">
      <button type="button" class="boton icono fantasma menu-boton" data-menu aria-label="${t('menu')}" aria-controls="lateral" aria-expanded="false">${icono('menu')}</button>
      <h1 id="titulo"></h1>
      <span class="espacio"></span>
      <span class="vivo pausa" id="vivo" title="${t('vivo')}"><i></i><span>${t('vivo')}</span></span>
    </header>
    <main id="vista" class="vista"></main>
  </div>`;
}
function bindShell(app) {
  app.querySelector('[data-salir]').addEventListener('click', async () => { await api('/sesion/salir', { metodo: 'POST' }); cerrarSesion(false); });
  app.querySelector('[data-idioma]').addEventListener('click', cambiarIdioma);
  app.querySelector('[data-menu]').addEventListener('click', () => (S.menuAbierto ? cerrarMenu() : abrirMenu()));
  app.querySelector('#telon').addEventListener('click', cerrarMenu);
  app.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', cerrarMenu));
}
function abrirMenu() { S.menuAbierto = true; const l = document.getElementById('lateral'); if (l) l.classList.add('abierto'); const tl = document.getElementById('telon'); if (tl) tl.classList.remove('oculto'); const b = document.querySelector('[data-menu]'); if (b) b.setAttribute('aria-expanded', 'true'); }
function cerrarMenu() { S.menuAbierto = false; const l = document.getElementById('lateral'); if (l) l.classList.remove('abierto'); const tl = document.getElementById('telon'); if (tl) tl.classList.add('oculto'); const b = document.querySelector('[data-menu]'); if (b) b.setAttribute('aria-expanded', 'false'); }
function cambiarIdioma() {
  S.idioma = S.idioma === 'es' ? 'en' : 'es';
  try { localStorage.setItem(CLAVE_IDIOMA, S.idioma); } catch { /* sin almacenamiento */ }
  document.documentElement.lang = S.idioma;
  render();
}
function pintarTitulo(txt) { const h = document.getElementById('titulo'); if (h) h.textContent = txt; document.title = txt + ' · OrdenExchange'; }
function pintarContadores() {
  document.querySelectorAll('[data-cola]').forEach(b => {
    const n = S.cola[b.dataset.cola];
    b.textContent = n == null ? '–' : String(n);
    b.classList.toggle('hay', typeof n === 'number' && n > 0);
  });
}

// ── Entrar ───────────────────────────────────────────────────
function htmlEntrar() {
  return `<div class="portada"><div class="portada-caja">
    ${marcaHtml()}
    <h1>${t('entrar')}</h1>
    <p class="intro">${t('entrar.intro')}</p>
    <form id="form-entrar" novalidate>
      <div class="campo"><label for="f-email">${t('correo')}</label><input id="f-email" name="email" type="email" autocomplete="username" required autofocus></div>
      <div class="campo"><label for="f-pass">${t('contrasena')}</label><input id="f-pass" name="contrasena" type="password" autocomplete="current-password" required></div>
      <div id="entrar-error"></div>
      <div class="formulario-acciones"><button class="boton primario" type="submit">${t('entrar')}</button></div>
    </form>
    <div class="portada-pie"><button type="button" data-idioma>${S.idioma === 'es' ? 'English' : 'Español'}</button></div>
  </div></div>`;
}
function bindEntrar(app) {
  app.querySelector('[data-idioma]').addEventListener('click', cambiarIdioma);
  const form = app.querySelector('#form-entrar');
  if (form.elements.email && !form.elements.email.value) form.elements.email.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = form.elements.email.value.trim();
    const contrasena = form.elements.contrasena.value;
    const err = form.querySelector('#entrar-error');
    err.innerHTML = '';
    if (!email || !contrasena) { err.innerHTML = `<div class="mensaje-error">${t('obligatorio')}</div>`; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = t('entrar.entrando');
    const r = await api('/sesion/entrar', { metodo: 'POST', cuerpo: { email, contrasena }, sinSesion: true });
    btn.disabled = false; btn.textContent = t('entrar');
    if (!r.ok || !r.datos.token) { err.innerHTML = `<div class="mensaje-error">${esc(mensajeError(r))}</div>`; return; }
    S.token = r.datos.token; S.operador = r.datos.operador || null;
    guardarSesion();
    if (!S.ruta.vista || S.ruta.vista === 'entrar') ir('#/resumen'); else render();
  });
}

// ── Cambio de contraseña (obligatorio o voluntario) ──────────
function htmlCambioContrasena(forzado) {
  return `<h1 style="font-size:15px;font-weight:600;margin-bottom:4px">${t('contrasena.titulo')}</h1>
    ${forzado ? banda('ambar', esc(t('contrasena.obligatoria'))) : ''}
    <form id="form-contrasena" novalidate>
      <div class="campo"><label for="c-actual">${t('contrasena.actual')}</label><input id="c-actual" name="actual" type="password" autocomplete="current-password" required></div>
      <div class="campo"><label for="c-nueva">${t('contrasena.nueva')}</label><input id="c-nueva" name="nueva" type="password" autocomplete="new-password" required minlength="${MIN_CONTRASENA}"></div>
      <div class="campo"><label for="c-repetir">${t('contrasena.repetir')}</label><input id="c-repetir" name="repetir" type="password" autocomplete="new-password" required></div>
      <div id="contrasena-error"></div>
      <div class="formulario-acciones"><button class="boton primario" type="submit">${t('guardar')}</button>${forzado ? `<button type="button" class="boton fantasma" data-salir-forzado>${t('salir')}</button>` : ''}</div>
    </form>`;
}
function bindCambioContrasena(raiz, forzado) {
  const form = raiz.querySelector('#form-contrasena');
  const salir = raiz.querySelector('[data-salir-forzado]');
  if (salir) salir.addEventListener('click', async () => { salir.disabled = true; await api('/sesion/salir', { metodo: 'POST' }); cerrarSesion(false); });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const actual = form.elements.actual.value, nueva = form.elements.nueva.value, repetir = form.elements.repetir.value;
    const err = form.querySelector('#contrasena-error');
    err.innerHTML = '';
    let msg = '';
    if (!actual || !nueva || !repetir) msg = t('obligatorio');
    else if (nueva.length < MIN_CONTRASENA) msg = t('contrasena.corta');
    else if (nueva !== repetir) msg = t('contrasena.noCoincide');
    if (msg) { err.innerHTML = `<div class="mensaje-error">${esc(msg)}</div>`; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const r = await api('/sesion/contrasena', { metodo: 'POST', cuerpo: { actual, nueva } });
    btn.disabled = false;
    if (!r.ok) { err.innerHTML = `<div class="mensaje-error">${esc(mensajeError(r))}</div>`; return; }
    aviso(t('contrasena.cambiada'), 'ok');
    if (S.operador) { S.operador.debeCambiarContrasena = false; guardarSesion(); }
    if (location.hash === '#/resumen') render(); else ir('#/resumen');
  });
}
function vistaContrasena(el) {
  el.innerHTML = `<div class="tarjeta" style="max-width:420px">${htmlCambioContrasena(false)}</div>`;
  bindCambioContrasena(el, false);
}

// ── Resumen ──────────────────────────────────────────────────
async function vistaResumen(el) {
  el.innerHTML = cargando();
  const r = await api('/resumen');
  if (S.ruta.vista !== 'resumen') return;
  if (!r.ok) { el.innerHTML = errorHtml(r, 'reintentar'); S.acciones.reintentar = () => vistaResumen(el); return; }
  const d = r.datos || {};
  const u = d.usuarios || {}, o = d.ordenes || {}, c = d.custodia || {}, p = d.precios || {}, al = d.almacen || {};
  // FALTA EN API: el servidor añade `tesoreria` (saldo de comisiones por activo), `anunciosActivos` y
  // `genesisConfigurado`; se muestran solo si vienen.
  const tes = d.tesoreria && typeof d.tesoreria === 'object' ? d.tesoreria : null;
  actualizarCola({ apelaciones: o.apelaciones, retiros: d.retirosPendientes, agentes: d.solicitudesAgente });
  const cifra = (href, etiqueta, valor, cola) => `<a class="cifra ${cola ? 'cola' : ''} ${cola && Number(valor) > 0 ? 'hay' : ''}" href="${href}"><div class="etiqueta">${etiqueta}</div><div class="valor">${fmtNum(valor ?? 0)}</div></a>`;
  const def = pares => `<dl class="def">${pares.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  el.innerHTML = `
    ${al.efimero ? banda('ambar', esc(t('r.efimero', { motor: al.motor || '?' }))) : ''}
    ${d.genesisConfigurado === false ? banda('ambar', esc(t('r.sinGenesis'))) : ''}
    <div class="seccion-titulo">${t('r.colas')}</div>
    <div class="rejilla c4">
      ${cifra('#/apelaciones', t('r.apelacionesAbiertas'), o.apelaciones, true)}
      ${cifra('#/retiros', t('r.retirosPendientes'), d.retirosPendientes, true)}
      ${cifra('#/agentes', t('r.solicitudesAgente'), d.solicitudesAgente, true)}
      ${cifra('#/ordenes?estado=pagado', t('r.pagadas'), o.pagadas, false)}
    </div>
    <div class="rejilla c3" style="margin-top:14px">
      <div class="tarjeta"><h2>${t('r.ordenes')}</h2>${def([
        [t('r.abiertas'), `<b class="num">${fmtNum(o.abiertas ?? 0)}</b>`],
        [t('r.pendientesPago'), `<span class="num">${fmtNum(o.pendientesPago ?? 0)}</span>`],
        [t('eo.pagado'), `<span class="num">${fmtNum(o.pagadas ?? 0)}</span>`],
        [t('r.enApelacion'), `<span class="num ${Number(o.apelaciones) > 0 ? 'coral' : ''}">${fmtNum(o.apelaciones ?? 0)}</span>`],
        [t('r.completadas24h'), `<span class="num">${fmtNum(o.completadas24h ?? 0)}</span>`],
        [t('r.completadas30d'), `<span class="num">${fmtNum(o.completadas30d ?? 0)}</span>`],
        [t('r.volumen30d'), `<span class="mono">${fmtNum(o.volumenUsd30d ?? 0, 0, 0)} USD</span>`],
        d.anunciosActivos != null ? [t('r.anunciosActivos'), `<span class="num">${fmtNum(d.anunciosActivos)}</span>`] : null,
      ])}</div>
      <div class="tarjeta"><h2>${t('r.usuarios')}</h2>${def([
        [t('r.total'), `<b class="num">${fmtNum(u.total ?? 0)}</b>`],
        [t('r.verificados'), `<span class="num">${fmtNum(u.verificados ?? 0)}</span>`],
        [t('r.agentes'), `<span class="num">${fmtNum(u.agentes ?? 0)}</span>`],
        [t('r.congelados'), `<span class="num ${Number(u.congelados) > 0 ? 'coral' : ''}">${fmtNum(u.congelados ?? 0)}</span>`],
        [t('r.depositos24h'), `<span class="num">${fmtNum(d.depositos24h ?? 0)}</span>`],
      ])}</div>
      <div class="tarjeta"><h2>${t('r.custodia')}</h2>${def(ACTIVOS.map(a => [a, `<span class="mono oro">${fmtActivo(c[a] ?? '0')}</span>${tes && tes[a] != null ? `<div class="pequeno tenue">${esc(t('r.tesoreria'))}: <span class="mono">${fmtActivo(tes[a])}</span></div>` : ''}`]))}<p class="pequeno tenue2" style="margin-top:8px">${t('r.custodia.nota')}</p></div>
    </div>
    <div class="rejilla c2" style="margin-top:12px">
      <div class="tarjeta"><h2>${t('r.precios')}<span class="espacio"></span><a class="boton chico" href="#/precios">${puede('precios') ? t('r.editarPrecios') : t('v.precios')}</a></h2>${def([
        [t('r.oro'), `<span class="mono">${fmtNum(p.oroUsdOnza, 2, 2)}</span>`],
        [t('r.plata'), `<span class="mono">${fmtNum(p.plataUsdOnza, 2, 2)}</span>`],
        ['ORIGEN', `<span class="mono">${fmtNum((p.oroUsdOnza || 0) * ONZAS_ORIGEN, 4, 4)} USD</span>`],
        [t('r.fuente'), `${tv('fuente.', p.fuente)}${p.actualizadoPor ? ` <span class="tenue">· ${esc(t('p.actualizadoPor', { quien: p.actualizadoPor }))}</span>` : ''}`],
        [t('r.actualizado'), `${fmtFecha(p.actualizadoEn)} <span class="tenue">· ${esc(hace(p.actualizadoEn))}</span>`],
        [t('p.fx'), esc(t('r.monedas', { n: Object.keys(p.fx || {}).length }))],
      ])}</div>
      <div class="tarjeta"><h2>${t('r.almacen')}</h2>${def([
        [t('r.motor'), `<span class="mono">${esc(al.motor || '—')}</span>`],
        [t('r.almacen'), al.efimero ? chip(t('r.efimeroCorto'), 'ambar') : chip(t('r.persistente'), 'verde')],
      ])}</div>
    </div>`;
}

// ── Detalle de orden (compartido por Apelaciones y Órdenes) ──
const esAbierta = o => !!o && ABIERTOS.includes(o.estado);
/** Mientras la orden está abierta se vuelve a pedir cada 5 s (chat y estado); se detiene al cerrarse o al salir. */
function iniciarSondeoOrden() {
  detenerSondeoOrden();
  S.sondeoOrden = setInterval(() => { if (!document.hidden && S.token && S.refrescar.orden) S.refrescar.orden(); }, SONDEO_ORDEN_MS);
}
function detenerSondeoOrden() { if (S.sondeoOrden) { clearInterval(S.sondeoOrden); S.sondeoOrden = null; } }
async function vistaOrdenDetalle(el, id, modo) {
  el.innerHTML = cargando();
  detenerSondeoOrden();
  const r = await api('/ordenes/' + encodeURIComponent(id));
  if (S.ruta.id !== id || S.ruta.vista !== modo) return;
  if (!r.ok) { el.innerHTML = errorHtml(r, 'reintentar'); S.acciones.reintentar = () => vistaOrdenDetalle(el, id, modo); return; }
  S.ordenActual = r.datos;
  pintarOrden(el, modo);
  let refrescando = false;
  S.refrescar.orden = async () => {
    if (refrescando) return;
    refrescando = true;
    const rr = await api('/ordenes/' + encodeURIComponent(id));
    refrescando = false;
    if (!rr.ok || S.ruta.id !== id || S.ruta.vista !== modo) return;
    const antes = S.ordenActual && S.ordenActual.orden;
    S.ordenActual = rr.datos;
    const ahora = rr.datos.orden || {};
    if (!antes || antes.estado !== ahora.estado) pintarOrden(el, modo);
    else if ((antes.mensajes || []).length !== (ahora.mensajes || []).length) pintarChat();
    if (!esAbierta(ahora)) detenerSondeoOrden();
  };
  if (esAbierta(r.datos.orden)) iniciarSondeoOrden();
}
function quienEs(id) {
  const d = S.ordenActual || {};
  const o = d.orden || {};
  if (id === 'sistema') return { clase: 'sistema', nombre: t('o.sistema') };
  if (id === o.compradorId) return { clase: 'comprador', nombre: (d.comprador && d.comprador.apodo) || t('o.comprador'), rol: t('o.comprador') };
  if (id === o.vendedorId) return { clase: 'vendedor', nombre: (d.vendedor && d.vendedor.apodo) || t('o.vendedor'), rol: t('o.vendedor') };
  if (typeof id === 'string' && id.startsWith('operador:')) {
    const oid = id.slice(9);
    return { clase: 'operador', nombre: t('o.operador'), rol: S.operador && S.operador.id === oid ? t('op.tu') : corto(oid, 6, 4) };
  }
  return { clase: 'sistema', nombre: corto(id, 6, 4) };
}
function pintarOrden(el, modo) {
  const d = S.ordenActual || {};
  const o = d.orden || {};
  const comprador = d.comprador || { id: o.compradorId, apodo: '—' };
  const vendedor = d.vendedor || { id: o.vendedorId, apodo: '—' };
  const abierta = esAbierta(o);
  const ap = o.apelacion;
  const mp = o.metodoPago || {};
  const lectura = esAuditor();
  pintarTitulo((modo === 'apelaciones' ? t('o.apelacion') : t('v.ordenes')) + ' · ' + (o.numero || ''));

  const parte = (clase, quien, u) => `<div class="parte-caja ${clase}">
      <div class="quien">${quien}</div>
      <div class="apodo">${enlaceUsuario(u.id, u.apodo)} ${insignias(u, true)}</div>
      <div class="rep">${reputacionLinea(u.reputacion)}${u.pais ? ` · ${esc(u.pais)}` : ''}${u.registradoHaceDias != null ? ` · ${esc(t('o.registrado', { d: u.registradoHaceDias }))}` : ''}</div>
    </div>`;
  const acciones = [];
  if (o.estado === 'apelacion' && puede('resolver')) {
    acciones.push(`<button class="boton verde" data-accion="resolver" data-res="liberar">${icono('ok')} ${t('o.liberar')}</button>`);
    acciones.push(`<button class="boton coral" data-accion="resolver" data-res="devolver">${t('o.devolver')}</button>`);
  }
  if ((o.estado === 'pendiente-pago' || o.estado === 'pagado') && puede('cancelar')) {
    acciones.push(`<button class="boton" data-accion="cancelar-orden">${t('o.cancelarOrden')}</button>`);
  }
  const camposMp = mp.campos && typeof mp.campos === 'object' ? Object.entries(mp.campos) : null;
  const tiempo = [];
  tiempo.push([o.creadaEn, t('o.creada')]);
  if (o.pagadaEn) tiempo.push([o.pagadaEn, `${t('o.pagada')}${o.referenciaPago ? ` · ${t('o.referencia')}: <span class="mono">${esc(o.referenciaPago)}</span>` : ''}`]);
  if (ap && ap.abiertaEn) tiempo.push([ap.abiertaEn, `${t('o.apelacion')} · ${tv('ma.', ap.motivo)}`]);
  if (ap && ap.resueltaEn) tiempo.push([ap.resueltaEn, `${t('o.resueltaEn')} · ${tv('res.', ap.resolucion)}`]);
  if (o.completadaEn) tiempo.push([o.completadaEn, t('o.completada')]);
  if (o.canceladaEn) tiempo.push([o.canceladaEn, `${t('o.cancelada')}${o.canceladaPor ? ' ' + esc(t('o.canceladaPor', { quien: TEXTOS['cp.' + o.canceladaPor] ? t('cp.' + o.canceladaPor) : o.canceladaPor })) : ''}${o.motivoCancelacion ? ` · ${esc(o.motivoCancelacion)}` : ''}`]);
  const cal = o.calificaciones || {};
  const calHtml = (c) => c ? `${chip(tv('cal.', c.tipo), c.tipo === 'positiva' ? 'verde' : 'coral')}${c.comentario ? ` <span class="tenue">${esc(c.comentario)}</span>` : ''}` : `<span class="tenue2">${t('o.sinCalificar')}</span>`;

  el.innerHTML = `
    <div class="cabecera-detalle">
      <div>
        <h2><a class="boton icono fantasma" href="#/${modo}" aria-label="${t('o.volver')}">${icono('atras')}</a>${copiable(o.numero)} ${chipEstadoOrden(o.estado)}${o.enCustodia ? chip(t('o.custodia'), 'oro') : ''}</h2>
        <div class="sub">${esc(t('o.creada'))} ${fmtFecha(o.creadaEn)} · ${esc(hace(o.creadaEn))}${o.estado === 'pendiente-pago' ? ` · ${esc(t('o.restante'))} <b class="temporizador" id="temporizador">—</b>` : ''}</div>
      </div>
      <span class="espacio"></span>
      <div class="acciones">${acciones.join('')}${lectura && (abierta) ? soloLecturaHtml() : ''}</div>
    </div>
    <div class="detalle">
      <div class="apilar">
        <div class="tarjeta"><h2>${t('o.operacion')}</h2>
          <div class="rejilla c3">
            <div><div class="pequeno tenue">${t('o.cantidad')}</div><div class="mono" style="font-size:16px">${fmtActivo(o.cantidadActivo, o.activo)}</div></div>
            <div><div class="pequeno tenue">${t('o.monto')}</div><div class="mono" style="font-size:16px">${fmtFiat(o.montoFiat, o.moneda)}</div></div>
            <div><div class="pequeno tenue">${t('o.precio')}</div><div class="mono" style="font-size:16px">${fmtFiat(o.precio, o.moneda)}</div></div>
          </div>
          <dl class="def" style="margin-top:10px">
            <dt>${t('o.comision')}</dt><dd class="mono">${fmtActivo(o.comision, o.activo)}</dd>
            <dt>${t('o.anuncio')}</dt><dd>${copiable(o.anuncioNumero)} · ${tv('lado.', o.ladoAnuncio)}</dd>
            <dt>${t('o.ventana')}</dt><dd>${esc(t('o.min', { n: o.ventanaPagoMin }))} · ${t('o.vence')} ${fmtFecha(o.venceEn)}</dd>
            <dt>${t('u.pais')}</dt><dd>${esc(o.pais)} · ${esc(o.moneda)}</dd>
          </dl>
        </div>
        <div class="tarjeta"><h2>${t('o.partes')}</h2><div class="parte">${parte('comprador', t('o.comprador'), comprador)}${parte('vendedor', t('o.vendedor'), vendedor)}</div></div>
        ${ap ? `<div class="tarjeta" style="border-color:rgba(240,119,107,.35)"><h2 class="coral">${t('o.apelacion')} <span class="espacio"></span>${chip(tv('ea.', ap.estado), ap.estado === 'abierta' ? 'coral' : 'gris')}</h2>
          <dl class="def">
            <dt>${t('o.abiertaPor')}</dt><dd>${(() => { const q = quienEs(ap.abiertaPor); return `<span class="${q.clase}">${esc(q.rol || q.nombre)}</span> · ${esc(q.nombre)}`; })()}</dd>
            <dt>${t('motivo')}</dt><dd><b>${tv('ma.', ap.motivo)}</b></dd>
            <dt>${t('o.detalle')}</dt><dd style="white-space:pre-wrap">${esc(ap.detalle)}</dd>
            <dt>${t('o.abiertaEn')}</dt><dd>${fmtFecha(ap.abiertaEn)} · ${esc(hace(ap.abiertaEn))}</dd>
            ${ap.resolucion ? `<dt>${t('o.resolucion')}</dt><dd>${chip(tv('res.', ap.resolucion), ap.resolucion === 'liberar' ? 'verde' : 'coral')}</dd>
            <dt>${t('o.resueltaPor')}</dt><dd>${esc(ap.resueltaPor || '—')} · ${fmtFecha(ap.resueltaEn)}</dd>` : ''}
            ${ap.nota ? `<dt>${t('nota')}</dt><dd style="white-space:pre-wrap">${esc(ap.nota)}</dd>` : ''}
          </dl></div>` : ''}
        <div class="tarjeta"><h2>${t('o.metodo')}</h2>
          <dl class="def">
            <dt>${t('o.metodoTipo')}</dt><dd>${esc(mp.nombreMetodo || mp.tipo || '—')}${mp.categoria ? ` <span class="tenue">· ${esc(mp.categoria)}</span>` : ''}</dd>
            ${mp.banco ? `<dt>${t('o.banco')}</dt><dd>${esc(mp.banco)}</dd>` : ''}
            <dt>${t('o.titular')}</dt><dd>${esc(mp.titular || '—')}</dd>
            ${camposMp ? camposMp.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${copiable(v)}</dd>`).join('') : `<dt></dt><dd class="tenue2 pequeno">${t('o.camposOcultos')}</dd>`}
          </dl></div>
        <div class="tarjeta"><h2>${t('o.lineaTiempo')}</h2>
          <ul class="linea-tiempo">${tiempo.map(([f, txt]) => `<li><span class="cuando">${fmtFecha(f)}</span><span>${txt}</span></li>`).join('')}</ul>
        </div>
        ${o.estado === 'completada' ? `<div class="tarjeta"><h2>${t('o.calificaciones')}</h2><dl class="def"><dt>${t('o.delComprador')}</dt><dd>${calHtml(cal.delComprador)}</dd><dt>${t('o.delVendedor')}</dt><dd>${calHtml(cal.delVendedor)}</dd></dl></div>` : ''}
      </div>
      <div class="tarjeta chat">
        <h2>${t('o.chat')} <span class="espacio"></span><span class="tenue2 pequeno num" id="chat-n"></span></h2>
        <div class="chat-lista" id="chat-lista"></div>
        ${puede('chatear') ? `<form class="chat-form" id="chat-form"><input class="entrada" name="texto" maxlength="2000" placeholder="${t('o.escribir')}" autocomplete="off" required><button class="boton primario" type="submit" aria-label="${t('o.enviar')}">${icono('enviar')}</button></form><div class="chat-nota">${t('o.chat.nota')}</div>` : ''}
      </div>
    </div>`;
  pintarChat();
  if (o.estado === 'pendiente-pago' && o.venceEn) iniciarTemporizador(o.venceEn);

  S.acciones.resolver = async ds => {
    const res = ds.res === 'liberar' ? 'liberar' : 'devolver';
    const v = await dialogo({
      titulo: t(res === 'liberar' ? 'o.liberar' : 'o.devolver') + ' · ' + (o.numero || ''),
      descripcion: t(res === 'liberar' ? 'o.liberar.desc' : 'o.devolver.desc'),
      campos: [campoNota('nota', t('nota'), true, MIN_NOTA)],
      confirmar: t(res === 'liberar' ? 'o.liberar' : 'o.devolver'), peligro: res === 'devolver', clase: 'verde',
    });
    if (!v) return;
    const rr = await api(`/ordenes/${encodeURIComponent(o.id)}/resolver`, { metodo: 'POST', cuerpo: { resolucion: res, nota: v.nota } });
    if (!rr.ok) { aviso(mensajeError(rr), 'error'); return; }
    aviso(t('o.resuelta'), 'ok');
    sondear();
    vistaOrdenDetalle(el, o.id, modo);
  };
  S.acciones['cancelar-orden'] = async () => {
    const v = await dialogo({ titulo: t('o.cancelarOrden') + ' · ' + (o.numero || ''), descripcion: t('o.cancelar.desc'), campos: [campoNota('nota', t('nota'), true, MIN_NOTA)], confirmar: t('o.cancelarOrden'), peligro: true });
    if (!v) return;
    const rr = await api(`/ordenes/${encodeURIComponent(o.id)}/cancelar`, { metodo: 'POST', cuerpo: { nota: v.nota } });
    if (!rr.ok) { aviso(mensajeError(rr), 'error'); return; }
    aviso(t('o.canceladaOk'), 'ok');
    vistaOrdenDetalle(el, o.id, modo);
  };
  const form = el.querySelector('#chat-form');
  if (form) form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const inp = form.elements.texto;
    const texto = inp.value.trim();
    if (!texto) return;
    const btn = form.querySelector('button');
    btn.disabled = true;
    const rr = await api(`/ordenes/${encodeURIComponent(o.id)}/mensajes`, { metodo: 'POST', cuerpo: { texto } });
    btn.disabled = false;
    if (!rr.ok) { aviso(mensajeError(rr), 'error'); return; }
    inp.value = '';
    if (rr.datos.mensaje && S.ordenActual && S.ordenActual.orden) { (S.ordenActual.orden.mensajes = S.ordenActual.orden.mensajes || []).push(rr.datos.mensaje); pintarChat(); }
    else if (S.refrescar.orden) S.refrescar.orden();
  });
  el.querySelector('#chat-lista').addEventListener('click', ev => {
    const img = ev.target.closest('img[data-ver]');
    if (img) verImagen(img.getAttribute('src'));
  });
}
function pintarChat() {
  const lista = document.getElementById('chat-lista');
  if (!lista || !S.ordenActual) return;
  const msgs = (S.ordenActual.orden && S.ordenActual.orden.mensajes) || [];
  const n = document.getElementById('chat-n');
  if (n) n.textContent = msgs.length ? String(msgs.length) : '';
  if (!msgs.length) { lista.innerHTML = vacio(t('o.sinMensajes')); return; }
  const abajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40;
  lista.innerHTML = msgs.map(m => {
    const q = quienEs(m.de);
    const img = m.imagen && RE_IMAGEN.test(m.imagen) ? `<img src="${m.imagen}" alt="${t('o.imagen')}" data-ver loading="lazy">` : '';
    if (q.clase === 'sistema') return `<div class="burbuja sistema">${esc(m.texto)}${img}<div class="cuando">${fmtFecha(m.en)}</div></div>`;
    return `<div class="burbuja ${q.clase}"><div class="de">${esc(q.rol || '')}${q.rol ? ' · ' : ''}${esc(q.nombre)}</div><div style="white-space:pre-wrap">${esc(m.texto)}</div>${img}<div class="cuando">${fmtFecha(m.en)}</div></div>`;
  }).join('');
  if (abajo || lista.dataset.inicial !== '1') { lista.scrollTop = lista.scrollHeight; lista.dataset.inicial = '1'; }
}
function iniciarTemporizador(venceEn) {
  detenerTemporizador();
  const vence = new Date(venceEn).getTime();
  if (isNaN(vence)) return;
  const f = () => {
    const el = document.getElementById('temporizador');
    if (!el) { detenerTemporizador(); return false; }
    const s = Math.floor((vence - Date.now()) / 1000);
    el.textContent = s <= 0 ? t('o.vencida') : mmss(s);
    el.classList.toggle('urgente', s <= 300);
    if (s <= 0) {
      // Vencida: el temporizador se detiene y se vuelve a pedir la orden (el servidor la cancela al leerla).
      detenerTemporizador();
      if (S.refrescar.orden) S.refrescar.orden();
      return false;
    }
    return true;
  };
  if (f()) S.temporizador = setInterval(f, 1000);
}
function detenerTemporizador() { if (S.temporizador) { clearInterval(S.temporizador); S.temporizador = null; } }

// ── Órdenes: lista con búsqueda y filtros ────────────────────
// `estado=abiertas` agrupa pendiente-pago|pagado|apelacion (API.md lo documenta para /api/ordenes;
// FALTA EN API: confirmarlo para /panel/ordenes, el servidor actual lo acepta).
const ESTADOS_ORDEN = ['', 'abiertas', 'pendiente-pago', 'pagado', 'apelacion', 'completada', 'cancelada'];
function vistaOrdenes(el) {
  if (S.ruta.id) return vistaOrdenDetalle(el, S.ruta.id, 'ordenes');
  const f = S.filtros.ordenes;
  if (S.ruta.query.estado != null && ESTADOS_ORDEN.includes(S.ruta.query.estado)) { f.estado = S.ruta.query.estado; f.pagina = 1; }
  if (S.ruta.query.q != null) { f.q = S.ruta.query.q; f.pagina = 1; }
  el.innerHTML = `<div class="filtros">
      <div class="buscador">${icono('buscar')}<input class="entrada" id="ordenes-q" type="search" value="${esc(f.q)}" placeholder="${t('ol.buscar')}" aria-label="${t('buscar')}"></div>
      <div class="pestanas" id="ordenes-estados">${ESTADOS_ORDEN.map(e => `<button type="button" data-accion="ordenes-estado" data-estado="${e}" class="${f.estado === e ? 'act' : ''}">${e ? tv('eo.', e) : t('eo.todas')}</button>`).join('')}</div>
    </div>
    <div id="tabla-ordenes">${cargando()}</div>`;
  let debounce = null;
  el.querySelector('#ordenes-q').addEventListener('input', ev => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { f.q = ev.target.value.trim(); f.pagina = 1; f.tam = 0; cargarOrdenes(); }, 350);
  });
  S.acciones['ordenes-estado'] = ds => { f.estado = ds.estado || ''; f.pagina = 1; f.tam = 0; el.querySelectorAll('#ordenes-estados button').forEach(b => b.classList.toggle('act', b.dataset.estado === f.estado)); cargarOrdenes(); };
  S.acciones['pag-ordenes'] = ds => { f.pagina = Math.max(1, Number(ds.ir) || 1); cargarOrdenes(); };
  S.acciones.reintentar = cargarOrdenes;
  cargarOrdenes();
}
async function cargarOrdenes() {
  const caja = document.getElementById('tabla-ordenes');
  if (!caja) return;
  const f = S.filtros.ordenes;
  caja.innerHTML = cargando();
  const qs = new URLSearchParams();
  if (f.estado) qs.set('estado', f.estado);
  if (f.q) qs.set('q', f.q);
  qs.set('pagina', String(f.pagina));
  const r = await api('/ordenes?' + qs.toString());
  const caja2 = document.getElementById('tabla-ordenes');
  if (!caja2) return;
  if (!r.ok) { caja2.innerHTML = errorHtml(r, 'reintentar'); return; }
  const lista = r.datos.ordenes || [];
  caja2.innerHTML = tablaOrdenes(lista, 'ordenes') + paginacionHtml('ordenes', f.pagina, lista.length, r.datos.total);
}
function tablaOrdenes(lista, modo) {
  if (!lista.length) return vacio(t('sinDatos'));
  return `<div class="tabla-envoltura"><table class="tabla"><thead><tr>
      <th>${t('o.numero')}</th><th>${t('o.estado')}</th><th class="derecha">${t('o.cantidad')}</th><th class="derecha">${t('o.monto')}</th><th class="derecha">${t('o.precio')}</th><th>${t('o.comprador')}</th><th>${t('o.vendedor')}</th><th>${t('o.creada')}</th><th>${t('o.vence')}</th>
    </tr></thead><tbody>${lista.map(o => `<tr class="clic" data-ir="#/${modo}/${encodeURIComponent(o.id)}">
      <td><a class="enlace mono" href="#/${modo}/${encodeURIComponent(o.id)}">${esc(o.numero)}</a></td>
      <td>${chipEstadoOrden(o.estado)}${o.apelacion && o.estado !== 'apelacion' && o.apelacion.estado === 'abierta' ? ' ' + chip(t('o.apelacion'), 'coral') : ''}</td>
      <td class="derecha mono">${fmtActivo(o.cantidadActivo, o.activo)}</td>
      <td class="derecha mono">${fmtFiat(o.montoFiat, o.moneda)}</td>
      <td class="derecha mono tenue">${fmtFiat(o.precio, o.moneda)}</td>
      <td class="verde">${esc((o.comprador && o.comprador.apodo) || o.compradorId || '—')}</td>
      <td class="coral">${esc((o.vendedor && o.vendedor.apodo) || o.vendedorId || '—')}</td>
      <td class="tenue" title="${fmtFecha(o.creadaEn)}">${esc(hace(o.creadaEn))}</td>
      <td class="tenue">${o.estado === 'pendiente-pago' ? esc(hace(o.venceEn)) : '—'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

// ── Apelaciones: cola + detalle ──────────────────────────────
function vistaApelaciones(el) {
  if (S.ruta.id) return vistaOrdenDetalle(el, S.ruta.id, 'apelaciones');
  el.innerHTML = `<div class="seccion-titulo">${t('ap.cola')}</div><div id="tabla-apelaciones">${cargando()}</div>`;
  S.refrescar.apelaciones = pintarApelaciones;
  S.acciones.reintentar = cargarApelaciones;
  cargarApelaciones();
}
async function cargarApelaciones() {
  const r = await api('/apelaciones');
  const caja = document.getElementById('tabla-apelaciones');
  if (!caja) return;
  if (!r.ok) { caja.innerHTML = errorHtml(r, 'reintentar'); return; }
  const lista = r.datos.ordenes || [];
  actualizarCola({ apelaciones: lista.length });
  pintarApelaciones(lista);
}
function pintarApelaciones(lista) {
  const caja = document.getElementById('tabla-apelaciones');
  if (!caja) return;
  if (!lista.length) { caja.innerHTML = vacio(t('ap.vacia')); return; }
  caja.innerHTML = `<div class="tabla-envoltura"><table class="tabla"><thead><tr>
      <th>${t('ap.esperando')}</th><th>${t('o.numero')}</th><th>${t('motivo')}</th><th>${t('o.abiertaPor')}</th><th class="derecha">${t('o.cantidad')}</th><th class="derecha">${t('o.monto')}</th><th>${t('o.comprador')}</th><th>${t('o.vendedor')}</th><th></th>
    </tr></thead><tbody>${lista.map(o => {
      const ap = o.apelacion || {};
      const por = ap.abiertaPor === o.compradorId ? `<span class="verde">${t('o.comprador')}</span>` : ap.abiertaPor === o.vendedorId ? `<span class="coral">${t('o.vendedor')}</span>` : esc(ap.abiertaPor || '—');
      const seg = ap.abiertaEn ? (Date.now() - new Date(ap.abiertaEn).getTime()) / 1000 : 0;
      return `<tr class="clic" data-ir="#/apelaciones/${encodeURIComponent(o.id)}">
        <td class="${seg > 3600 * 6 ? 'coral' : seg > 3600 ? 'ambar' : ''}" title="${fmtFecha(ap.abiertaEn)}"><b>${esc(hace(ap.abiertaEn))}</b></td>
        <td class="mono">${esc(o.numero)}</td>
        <td>${tv('ma.', ap.motivo)}</td>
        <td>${por}</td>
        <td class="derecha mono">${fmtActivo(o.cantidadActivo, o.activo)}</td>
        <td class="derecha mono">${fmtFiat(o.montoFiat, o.moneda)}</td>
        <td class="verde">${esc((o.comprador && o.comprador.apodo) || '—')}</td>
        <td class="coral">${esc((o.vendedor && o.vendedor.apodo) || '—')}</td>
        <td class="acciones"><a class="boton chico primario" href="#/apelaciones/${encodeURIComponent(o.id)}">${t('ap.atender')}</a></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ── Agentes: solicitudes + suspender/reactivar ───────────────
// API.md solo documenta `GET /agentes?estado=pendiente`; las otras pestañas usan el mismo parámetro
// con los estados de SolicitudAgente (FALTA EN API: confirmar que acepta aprobada/rechazada/retirada).
const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'rechazada', 'retirada'];
function vistaAgentes(el) {
  const f = S.filtros.agentes;
  const lectura = !puede('agentes');
  el.innerHTML = `<div class="seccion-titulo">${t('ag.solicitudes')}</div>
    <div class="filtros"><div class="pestanas" id="agentes-estados">${ESTADOS_SOLICITUD.map(e => `<button type="button" data-accion="agentes-estado" data-estado="${e}" class="${f.estado === e ? 'act' : ''}">${t('ag.' + ({ pendiente: 'pendientes', aprobada: 'aprobadas', rechazada: 'rechazadas', retirada: 'retiradas' })[e])}</button>`).join('')}</div>${lectura ? soloLecturaHtml() : ''}</div>
    <div id="tabla-agentes">${cargando()}</div>
    <div class="tarjeta" style="margin-top:20px"><h2>${t('ag.activos')} <span class="tenue2 num" id="agentes-n"></span></h2>
      <div class="filtros"><div class="buscador">${icono('buscar')}<input class="entrada" id="agentes-q" type="search" value="${esc(f.q)}" placeholder="${t('ag.buscar')}" aria-label="${t('buscar')}"></div></div>
      <div id="tabla-agentes-activos">${cargando()}</div>
    </div>`;
  S.acciones['agentes-estado'] = ds => { f.estado = ESTADOS_SOLICITUD.includes(ds.estado) ? ds.estado : 'pendiente'; el.querySelectorAll('#agentes-estados button').forEach(b => b.classList.toggle('act', b.dataset.estado === f.estado)); cargarSolicitudes(); };
  S.acciones.reintentar = cargarSolicitudes;
  S.acciones['decidir-agente'] = async ds => {
    const aprobar = ds.decision === 'aprobar';
    const v = await dialogo({ titulo: `${t(aprobar ? 'ag.aprobar' : 'ag.rechazar')} · ${ds.apodo || ''}`, descripcion: t(aprobar ? 'ag.aprobar.desc' : 'ag.rechazar.desc'), campos: [{ nombre: 'nota', etiqueta: t('nota'), tipo: 'textarea', requerido: !aprobar }], confirmar: t(aprobar ? 'ag.aprobar' : 'ag.rechazar'), peligro: !aprobar, clase: 'verde' });
    if (!v) return;
    const r = await api(`/agentes/${encodeURIComponent(ds.id)}/decidir`, { metodo: 'POST', cuerpo: { decision: aprobar ? 'aprobar' : 'rechazar', nota: v.nota } });
    if (!r.ok) { aviso(mensajeError(r), 'error'); return; }
    aviso(t(aprobar ? 'ag.aprobada.ok' : 'ag.rechazada.ok'), 'ok');
    cargarSolicitudes();
  };
  S.acciones['estado-agente'] = async ds => {
    const suspender = ds.estado === 'suspendido';
    const v = await dialogo({ titulo: `${t(suspender ? 'ag.suspender' : 'ag.reactivar')} · ${ds.apodo || ''}`, descripcion: t(suspender ? 'ag.suspender.desc' : 'ag.reactivar.desc'), campos: [{ nombre: 'nota', etiqueta: t('nota'), tipo: 'textarea', requerido: true }], confirmar: t(suspender ? 'ag.suspender' : 'ag.reactivar'), peligro: suspender, clase: 'verde' });
    if (!v) return;
    const r = await api(`/usuarios/${encodeURIComponent(ds.id)}/agente`, { metodo: 'POST', cuerpo: { estado: suspender ? 'suspendido' : 'aprobado', nota: v.nota } });
    if (!r.ok) { aviso(mensajeError(r), 'error'); return; }
    aviso(t('ag.estadoCambiado'), 'ok');
    cargarSolicitudes();
  };
  let debounce = null;
  el.querySelector('#agentes-q').addEventListener('input', ev => { clearTimeout(debounce); debounce = setTimeout(() => { f.q = ev.target.value.trim(); cargarAgentesActivos(); }, 350); });
  S.refrescar.solicitudes = lista => { if (f.estado === 'pendiente') pintarSolicitudes(lista); };
  cargarSolicitudes();
}
async function cargarSolicitudes() {
  const f = S.filtros.agentes;
  const caja = document.getElementById('tabla-agentes');
  if (!caja) return;
  caja.innerHTML = cargando();
  const r = await api('/agentes?estado=' + encodeURIComponent(f.estado));
  const caja2 = document.getElementById('tabla-agentes');
  if (!caja2) return;
  if (!r.ok) { caja2.innerHTML = errorHtml(r, 'reintentar'); return; }
  const lista = r.datos.solicitudes || [];
  if (f.estado === 'pendiente') actualizarCola({ agentes: lista.length });
  pintarSolicitudes(lista);
  // FALTA EN API: la respuesta trae además `agentes` (usuarios aprobados/suspendidos); si viene se usa
  // para la sección de agentes activos sin obligar a buscar.
  S.agentesLista = Array.isArray(r.datos.agentes) ? r.datos.agentes : null;
  cargarAgentesActivos();
}
function pintarSolicitudes(lista) {
  const f = S.filtros.agentes;
  const caja2 = document.getElementById('tabla-agentes');
  if (!caja2) return;
  if (!lista.length) { caja2.innerHTML = vacio(t('ag.vacia')); return; }
  const pend = f.estado === 'pendiente';
  caja2.innerHTML = `<div class="tabla-envoltura"><table class="tabla"><thead><tr>
      <th>${t('ag.usuario')}</th><th>${t('u.reputacion')}</th><th class="derecha">${t('ag.garantia')}</th><th>${t('ag.descripcion')}</th><th>${t('ag.solicitada')}</th>${pend ? '<th></th>' : `<th>${t('ag.resuelta')}</th><th>${t('nota')}</th>`}
    </tr></thead><tbody>${lista.map(s => {
      const u = s.usuario || { id: s.usuarioId, apodo: s.usuarioId };
      return `<tr>
        <td>${enlaceUsuario(u.id, u.apodo)} ${insignias(u)}<div class="pequeno tenue">${esc(u.pais || '')}${s.email ? ` · ${esc(s.email)}` : ''}${u.registradoHaceDias != null ? ` · ${esc(t('o.registrado', { d: u.registradoHaceDias }))}` : ''}</div></td>
        <td class="pequeno tenue envolver">${reputacionLinea(u.reputacion)}</td>
        <td class="derecha mono">${fmtActivo(s.garantia, 'ORIGEN')}</td>
        <td class="envolver" style="max-width:360px">${esc(s.descripcion)}</td>
        <td class="tenue" title="${fmtFecha(s.solicitadaEn)}">${esc(hace(s.solicitadaEn))}</td>
        ${pend ? `<td class="acciones">${puede('agentes') ? `<button class="boton chico verde" data-accion="decidir-agente" data-decision="aprobar" data-id="${esc(s.id)}" data-apodo="${esc(u.apodo)}">${t('ag.aprobar')}</button><button class="boton chico coral" data-accion="decidir-agente" data-decision="rechazar" data-id="${esc(s.id)}" data-apodo="${esc(u.apodo)}">${t('ag.rechazar')}</button>` : ''}</td>`
          : `<td class="tenue">${fmtFecha(s.resueltaEn)}${s.resueltaPor ? `<div class="pequeno">${esc(s.resueltaPor)}</div>` : ''}</td><td class="envolver tenue" style="max-width:280px">${esc(s.nota || '—')}</td>`}
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
async function cargarAgentesActivos() {
  const f = S.filtros.agentes;
  const caja = document.getElementById('tabla-agentes-activos');
  if (!caja) return;
  if (S.agentesLista) {
    const q = f.q.toLowerCase();
    pintarAgentesActivos(S.agentesLista.filter(u => !q || String(u.apodo || '').toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q)), S.agentesLista.length);
    return;
  }
  if (!f.q) { caja.innerHTML = `<div class="vacio">${t('ag.buscaPrimero')}</div>`; return; }
  caja.innerHTML = cargando();
  // FALTA EN API: no hay filtro por estadoAgente en GET /usuarios; se busca por q y se filtra aquí.
  const r = await api('/usuarios?q=' + encodeURIComponent(f.q));
  if (!document.getElementById('tabla-agentes-activos')) return;
  if (!r.ok) { document.getElementById('tabla-agentes-activos').innerHTML = errorHtml(r); return; }
  pintarAgentesActivos((r.datos.usuarios || []).filter(u => u.estadoAgente === 'aprobado' || u.estadoAgente === 'suspendido'), null);
}
function pintarAgentesActivos(lista, total) {
  const caja = document.getElementById('tabla-agentes-activos');
  if (!caja) return;
  const n = document.getElementById('agentes-n');
  if (n) n.textContent = total != null ? String(total) : '';
  if (!lista.length) { caja.innerHTML = vacio(t('ag.sinResultados')); return; }
  caja.innerHTML = `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>${t('u.apodo')}</th><th>${t('correo')}</th><th>${t('u.pais')}</th><th>${t('u.agente')}</th><th>${t('u.reputacion')}</th><th></th></tr></thead><tbody>${lista.map(u => `<tr>
      <td>${enlaceUsuario(u.id, u.apodo)}</td><td class="tenue">${esc(u.email)}</td><td>${esc(u.pais)}</td><td>${chipAgente(u.estadoAgente)}</td><td class="pequeno tenue envolver">${reputacionLinea(u.reputacion)}</td>
      <td class="acciones">${puede('agentes') ? botonEstadoAgente(u) : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function botonEstadoAgente(u) {
  if (u.estadoAgente === 'aprobado') return `<button class="boton chico coral" data-accion="estado-agente" data-estado="suspendido" data-id="${esc(u.id)}" data-apodo="${esc(u.apodo)}">${t('ag.suspender')}</button>`;
  if (u.estadoAgente === 'suspendido') return `<button class="boton chico verde" data-accion="estado-agente" data-estado="aprobado" data-id="${esc(u.id)}" data-apodo="${esc(u.apodo)}">${t('ag.reactivar')}</button>`;
  return '';
}

// ── Retiros ──────────────────────────────────────────────────
// API.md documenta `GET /retiros?estado=pendiente`; las demás pestañas reutilizan el parámetro con
// los valores de EstadoRetiro (FALTA EN API: confirmar enviado/rechazado/cancelado).
const ESTADOS_RETIRO = ['pendiente', 'enviado', 'rechazado', 'cancelado'];
function vistaRetiros(el) {
  const f = S.filtros.retiros;
  el.innerHTML = `<div class="filtros"><div class="pestanas" id="retiros-estados">${ESTADOS_RETIRO.map(e => `<button type="button" data-accion="retiros-estado" data-estado="${e}" class="${f.estado === e ? 'act' : ''}">${t('rt.' + e)}</button>`).join('')}</div>${!puede('retiros') ? soloLecturaHtml() : ''}</div>
    <div id="tabla-retiros">${cargando()}</div>`;
  S.acciones['retiros-estado'] = ds => { f.estado = ESTADOS_RETIRO.includes(ds.estado) ? ds.estado : 'pendiente'; el.querySelectorAll('#retiros-estados button').forEach(b => b.classList.toggle('act', b.dataset.estado === f.estado)); cargarRetiros(); };
  S.acciones.reintentar = cargarRetiros;
  S.acciones['decidir-retiro'] = async ds => {
    const enviado = ds.decision === 'enviado';
    const sancionada = ds.sancionada === '1';
    const campos = enviado
      ? [{ nombre: 'txHash', etiqueta: t('rt.txHash'), mono: true, requerido: true, marcador: '0x…', validar: v => (RE_HASH.test(v) ? '' : t('rt.hashInvalido')) }]
      : [{ nombre: 'motivo', etiqueta: t('motivo'), tipo: 'textarea', requerido: true }];
    const v = await dialogo({
      titulo: `${t(enviado ? 'rt.marcarEnviado' : 'rt.rechazar')} · ${ds.apodo || ''}`,
      descripcion: enviado ? t('rt.enviado.desc', { cantidad: fmtActivo(ds.cantidad), activo: ds.activo }) : t('rt.rechazar.desc'),
      html: enviado && sancionada ? banda('coral', esc(t('rt.enviado.aviso'))) : (enviado ? `<dl class="def" style="margin-bottom:10px"><dt>${t('rt.direccion')}</dt><dd class="mono">${esc(ds.direccion)}</dd></dl>` : ''),
      campos, confirmar: t(enviado ? 'rt.marcarEnviado' : 'rt.rechazar'), peligro: !enviado || sancionada, clase: 'verde',
    });
    if (!v) return;
    const cuerpo = enviado ? { decision: 'enviado', txHash: v.txHash } : { decision: 'rechazado', motivo: v.motivo };
    const r = await api(`/retiros/${encodeURIComponent(ds.id)}/decidir`, { metodo: 'POST', cuerpo });
    if (!r.ok) { aviso(mensajeError(r), 'error'); return; }
    aviso(t(enviado ? 'rt.enviadoOk' : 'rt.rechazadoOk'), 'ok');
    cargarRetiros();
    sondear();
  };
  S.refrescar.retirosPendientes = lista => { if (S.filtros.retiros.estado === 'pendiente') pintarRetiros(lista); };
  cargarRetiros();
}
async function cargarRetiros() {
  const f = S.filtros.retiros;
  const caja = document.getElementById('tabla-retiros');
  if (!caja) return;
  caja.innerHTML = cargando();
  const r = await api('/retiros?estado=' + encodeURIComponent(f.estado));
  if (!document.getElementById('tabla-retiros')) return;
  if (!r.ok) { document.getElementById('tabla-retiros').innerHTML = errorHtml(r, 'reintentar'); return; }
  const lista = r.datos.retiros || [];
  if (f.estado === 'pendiente') actualizarCola({ retiros: lista.length });
  pintarRetiros(lista);
}
function pintarRetiros(lista) {
  const caja = document.getElementById('tabla-retiros');
  if (!caja) return;
  const pend = S.filtros.retiros.estado === 'pendiente';
  caja.innerHTML = tablaRetirosHtml(lista, { pendientes: pend, conUsuario: true, vacioTexto: t('rt.vacio') });
}
/** Tabla de retiros: en la cola de pendientes lleva tamiz y acciones; en el resto, estado y resolución. */
function tablaRetirosHtml(lista, op) {
  if (!lista.length) return vacio(op.vacioTexto || t('rt.vacio'));
  const pend = !!op.pendientes;
  const tamiz = s => s === true ? chip(`${icono('alerta')} ${t('rt.sancionada')}`, 'coral') : s === false ? chip(t('rt.limpia'), 'verde') : chip(t('rt.sinTamiz'), 'gris');
  return `<div class="tabla-envoltura"><table class="tabla"><thead><tr>
      <th>${t('rt.solicitado')}</th>${op.conUsuario ? `<th>${t('ag.usuario')}</th>` : ''}<th class="derecha">${t('o.cantidad')}</th><th>${t('rt.direccion')}</th>${pend ? `<th>${t('rt.tamiz')}</th><th></th>` : `<th>${t('o.estado')}</th><th>${t('rt.resuelto')}</th><th>${t('rt.txHash')} / ${t('motivo')}</th>`}
    </tr></thead><tbody>${lista.map(rt => {
      const u = rt.usuario || { id: rt.usuarioId, apodo: rt.usuarioId };
      return `<tr class="${rt.direccionSancionada === true ? 'marcada' : ''}">
        <td class="tenue" title="${fmtFecha(rt.solicitadoEn)}">${esc(hace(rt.solicitadoEn))}</td>
        ${op.conUsuario ? `<td>${enlaceUsuario(u.id, u.apodo)} ${insignias(u)}</td>` : ''}
        <td class="derecha mono">${fmtActivo(rt.cantidad, rt.activo)}</td>
        <td>${copiable(rt.direccion, corto(rt.direccion, 10, 8))}</td>
        ${pend ? `<td>${tamiz(rt.direccionSancionada)}</td><td class="acciones">${puede('retiros') ? `<button class="boton chico verde" data-accion="decidir-retiro" data-decision="enviado" data-id="${esc(rt.id)}" data-apodo="${esc(u.apodo)}" data-cantidad="${esc(rt.cantidad)}" data-activo="${esc(rt.activo)}" data-direccion="${esc(rt.direccion)}" data-sancionada="${rt.direccionSancionada === true ? '1' : '0'}">${t('rt.marcarEnviado')}</button><button class="boton chico coral" data-accion="decidir-retiro" data-decision="rechazado" data-id="${esc(rt.id)}" data-apodo="${esc(u.apodo)}">${t('rt.rechazar')}</button>` : ''}</td>`
          : `<td>${chipRetiro(rt.estado)}</td><td class="tenue">${fmtFecha(rt.resueltoEn)}${rt.resueltoPor ? `<div class="pequeno">${esc(rt.resueltoPor)}</div>` : ''}</td><td class="envolver" style="max-width:280px">${rt.txHash ? copiable(rt.txHash, corto(rt.txHash, 10, 8)) : `<span class="tenue">${esc(rt.motivo || '—')}</span>`}</td>`}
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ── Depósitos ────────────────────────────────────────────────
function vistaDepositos(el) {
  const f = S.filtros.depositos;
  el.innerHTML = `<div id="tabla-depositos">${cargando()}</div>`;
  S.acciones['pag-depositos'] = ds => { f.pagina = Math.max(1, Number(ds.ir) || 1); cargarDepositos(); };
  S.acciones.reintentar = cargarDepositos;
  cargarDepositos();
}
async function cargarDepositos() {
  const f = S.filtros.depositos;
  const caja = document.getElementById('tabla-depositos');
  if (!caja) return;
  caja.innerHTML = cargando();
  const r = await api('/depositos?pagina=' + f.pagina);
  const caja2 = document.getElementById('tabla-depositos');
  if (!caja2) return;
  if (!r.ok) { caja2.innerHTML = errorHtml(r, 'reintentar'); return; }
  const lista = r.datos.depositos || [];
  if (!lista.length && f.pagina === 1) { caja2.innerHTML = vacio(t('dp.vacio')); return; }
  // FALTA EN API: `GET /depositos` no documenta `total`; el servidor lo devuelve y la paginación lo usa si viene.
  caja2.innerHTML = tablaDepositosHtml(lista, true) + paginacionHtml('depositos', f.pagina, lista.length, r.datos.total);
}
function tablaDepositosHtml(lista, conUsuario) {
  if (!lista.length) return vacio(t('dp.vacio'));
  // FALTA EN API: Deposito solo trae usuarioId; el servidor añade `apodo` (o `usuario.apodo`) y se usa si viene.
  const apodoDe = d => d.apodo || (d.usuario && d.usuario.apodo) || corto(d.usuarioId, 8, 4);
  return `<div class="tabla-envoltura"><table class="tabla"><thead><tr>
      <th>${t('dp.cuando')}</th>${conUsuario ? `<th>${t('dp.usuario')}</th>` : ''}<th class="derecha">${t('o.cantidad')}</th><th>${t('rt.txHash')}</th><th>${t('dp.desde')}</th><th class="derecha">${t('dp.bloque')}</th><th class="derecha">${t('dp.conf')}</th><th>${t('o.estado')}</th><th>${t('motivo')}</th>
    </tr></thead><tbody>${lista.map(d => `<tr>
      <td class="tenue" title="${fmtFecha(d.en)}">${fmtFecha(d.en)}</td>
      ${conUsuario ? `<td>${enlaceUsuario(d.usuarioId, apodoDe(d))}</td>` : ''}
      <td class="derecha mono">${fmtActivo(d.cantidad, d.activo)}</td>
      <td>${copiable(d.txHash, corto(d.txHash, 8, 4))}</td>
      <td>${copiable(d.desde, corto(d.desde, 6, 4))}</td>
      <td class="derecha mono">${fmtNum(d.bloque)}</td>
      <td class="derecha mono">${fmtNum(d.confirmaciones)}</td>
      <td>${chip(tv('ed.', d.estado), d.estado === 'acreditado' ? 'verde' : 'coral')}</td>
      <td class="tenue envolver" style="max-width:240px">${esc(d.motivo || '—')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

// ── Usuarios: búsqueda + ficha ───────────────────────────────
function vistaUsuarios(el) {
  if (S.ruta.id) return vistaUsuarioFicha(el, S.ruta.id);
  const f = S.filtros.usuarios;
  if (S.ruta.query.q != null) { f.q = S.ruta.query.q; f.pagina = 1; }
  el.innerHTML = `<div class="filtros"><div class="buscador">${icono('buscar')}<input class="entrada" id="usuarios-q" type="search" value="${esc(f.q)}" placeholder="${t('u.buscar')}" aria-label="${t('buscar')}"></div><span class="pequeno tenue2">${t('u.buscaPrimero')}</span></div>
    <div id="tabla-usuarios">${cargando()}</div>`;
  let debounce = null;
  el.querySelector('#usuarios-q').addEventListener('input', ev => { clearTimeout(debounce); debounce = setTimeout(() => { f.q = ev.target.value.trim(); f.pagina = 1; f.tam = 0; cargarUsuarios(); }, 350); });
  S.acciones['pag-usuarios'] = ds => { f.pagina = Math.max(1, Number(ds.ir) || 1); cargarUsuarios(); };
  S.acciones.reintentar = cargarUsuarios;
  cargarUsuarios();
}
async function cargarUsuarios() {
  const f = S.filtros.usuarios;
  const caja = document.getElementById('tabla-usuarios');
  if (!caja) return;
  caja.innerHTML = cargando();
  const r = await api(`/usuarios?q=${encodeURIComponent(f.q)}&pagina=${f.pagina}`);
  const caja2 = document.getElementById('tabla-usuarios');
  if (!caja2) return;
  if (!r.ok) { caja2.innerHTML = errorHtml(r, 'reintentar'); return; }
  const lista = r.datos.usuarios || [];
  if (!lista.length) { caja2.innerHTML = vacio(t('u.vacio')); return; }
  const saldo = (u, a) => { const s = (u.saldos || []).find(x => x.activo === a); return s ? `<span class="mono">${fmtActivo(s.disponible)}</span>${Number(s.congelado) > 0 ? ` <span class="tenue pequeno mono">(+${fmtActivo(s.congelado)})</span>` : ''}` : '—'; };
  caja2.innerHTML = `<div class="tabla-envoltura"><table class="tabla"><thead><tr>
      <th>${t('u.apodo')}</th><th>${t('correo')}</th><th>${t('u.pais')}</th><th>${t('u.gid')}</th><th>${t('u.agente')}</th><th>${t('u.congelado')}</th><th class="derecha">ORIGEN</th><th class="derecha">AUKA</th><th class="derecha">AGKA</th><th>${t('u.registro')}</th>
    </tr></thead><tbody>${lista.map(u => `<tr class="clic" data-ir="#/usuarios/${encodeURIComponent(u.id)}">
      <td><a class="enlace" href="#/usuarios/${encodeURIComponent(u.id)}">${esc(u.apodo)}</a></td>
      <td class="tenue">${esc(u.email)}</td>
      <td>${esc(u.pais)} <span class="tenue2">${esc(u.moneda || '')}</span></td>
      <td>${chipGid(u.gidEstado)}</td>
      <td>${u.estadoAgente && u.estadoAgente !== 'no' ? chipAgente(u.estadoAgente) : '<span class="tenue2">—</span>'}</td>
      <td>${u.congelado ? chip(t('u.congelado'), 'coral') : '<span class="tenue2">—</span>'}</td>
      <td class="derecha">${saldo(u, 'ORIGEN')}</td><td class="derecha">${saldo(u, 'AUKA')}</td><td class="derecha">${saldo(u, 'AGKA')}</td>
      <td class="tenue" title="${fmtFecha(u.creadoEn)}">${fmtFecha(u.creadoEn, false)}</td>
    </tr>`).join('')}</tbody></table></div>` + paginacionHtml('usuarios', f.pagina, lista.length, r.datos.total);
}
async function vistaUsuarioFicha(el, id) {
  el.innerHTML = cargando();
  const r = await api('/usuarios/' + encodeURIComponent(id));
  if (S.ruta.vista !== 'usuarios' || S.ruta.id !== id) return;
  if (!r.ok) { el.innerHTML = errorHtml(r, 'reintentar'); S.acciones.reintentar = () => vistaUsuarioFicha(el, id); return; }
  const d = r.datos || {};
  const u = d.usuario || {};
  const saldos = d.saldos || u.saldos || [];
  const rep = u.reputacion || {};
  pintarTitulo(t('v.usuarios') + ' · ' + (u.apodo || ''));
  const acciones = [];
  if (puede('congelar')) acciones.push(u.congelado ? `<button class="boton verde" data-accion="congelar" data-congelar="0">${t('u.descongelar')}</button>` : `<button class="boton coral" data-accion="congelar" data-congelar="1">${t('u.congelar')}</button>`);
  if (puede('agentes')) acciones.push(botonEstadoAgente(u).replace('boton chico', 'boton'));
  if (puede('ajuste')) acciones.push(`<button class="boton" data-accion="ajuste">${t('u.ajuste')}</button>`);
  const saldoCaja = a => { const s = saldos.find(x => x.activo === a) || { disponible: '0', congelado: '0' }; return `<div class="cifra"><div class="etiqueta">${a}</div><div class="valor" style="font-size:18px">${fmtActivo(s.disponible)}</div><div class="nota">${t('u.enCustodia')}: <span class="mono">${fmtActivo(s.congelado)}</span></div></div>`; };
  el.innerHTML = `
    <div class="cabecera-detalle">
      <div>
        <h2><a class="boton icono fantasma" href="#/usuarios" aria-label="${t('o.volver')}">${icono('atras')}</a>${esc(u.apodo)} ${insignias(u, true)}${u.congelado ? chip(t('u.congelado'), 'coral') : ''}${u.estadoAgente === 'suspendido' ? chipAgente('suspendido') : ''}</h2>
        <div class="sub">${esc(u.email)} · ${esc(u.pais)} · ${copiable(u.id, corto(u.id, 10, 6))}</div>
      </div>
      <span class="espacio"></span>
      <div class="acciones">${acciones.join('')}${esAuditor() ? soloLecturaHtml() : ''}</div>
    </div>
    ${u.congelado ? banda('coral', `<b>${t('u.motivoCongelado')}:</b> ${esc(u.motivoCongelado || '—')}`) : ''}
    <div class="rejilla c3">${ACTIVOS.map(saldoCaja).join('')}</div>
    <div class="rejilla c2" style="margin-top:12px">
      <div class="tarjeta"><h2>${t('u.datos')}</h2><dl class="def">
        <dt>${t('u.nombreLegal')}</dt><dd>${esc(u.nombreLegal || u.nombreAbreviado || '—')}</dd>
        <dt>${t('u.gid')}</dt><dd>${chipGid(u.gidEstado)} ${u.gid ? copiable(u.gid) : ''}</dd>
        <dt>${t('u.agente')}</dt><dd>${chipAgente(u.estadoAgente || 'no')}</dd>
        <dt>${t('u.moneda')}</dt><dd>${esc(u.moneda || '—')}</dd>
        <dt>${t('u.idioma')}</dt><dd>${esc((u.idioma || '').toUpperCase() || '—')}</dd>
        <dt>${t('u.telefono')}</dt><dd>${esc(u.telefono || '—')}</dd>
        <dt>${t('u.direccionCadena')}</dt><dd>${u.direccionCadena ? copiable(u.direccionCadena) : '—'}</dd>
        <dt>${t('u.registro')}</dt><dd>${fmtFecha(u.creadoEn)}${u.registradoHaceDias != null ? ` <span class="tenue">· ${esc(t('u.registradoHace', { d: u.registradoHaceDias }))}</span>` : ''}</dd>
      </dl></div>
      <div class="tarjeta"><h2>${t('u.reputacion')}</h2><dl class="def">
        <dt>${t('r.ordenes')}</dt><dd class="num">${fmtNum(rep.ordenesCompletadas ?? 0)} / ${fmtNum(rep.ordenesTotales ?? 0)}</dd>
        <dt>30 d</dt><dd class="num">${fmtNum(rep.completadas30d ?? 0)} / ${fmtNum(rep.ordenes30d ?? 0)} · ${fmtNum(rep.tasaFinalizacion30d ?? 0, 0, 1)} %</dd>
        <dt>+ / −</dt><dd><span class="verde num">+${fmtNum(rep.positivas ?? 0)}</span> · <span class="coral num">−${fmtNum(rep.negativas ?? 0)}</span></dd>
        <dt>${t('u.apelacionesPerdidas')}</dt><dd class="num ${Number(rep.apelacionesPerdidas) > 0 ? 'coral' : ''}">${fmtNum(rep.apelacionesPerdidas ?? 0)}</dd>
        <dt>${t('u.tLiberacion')}</dt><dd class="num">${rep.tiempoPromedioLiberacionSeg != null ? mmss(Math.round(rep.tiempoPromedioLiberacionSeg)) : '—'}</dd>
        <dt>${t('u.tPago')}</dt><dd class="num">${rep.tiempoPromedioPagoSeg != null ? mmss(Math.round(rep.tiempoPromedioPagoSeg)) : '—'}</dd>
      </dl></div>
    </div>
    <div class="tarjeta" style="margin-top:12px"><h2>${t('u.ordenes')} <span class="tenue2 num">${(d.ordenes || []).length}</span></h2>${(d.ordenes || []).length ? tablaOrdenes(d.ordenes, 'ordenes') : vacio(t('u.sinOrdenes'))}</div>
    <div class="tarjeta"><h2>${t('u.movimientos')} <span class="tenue2 num">${(d.movimientos || []).length}</span></h2>${tablaMovimientos(d.movimientos || [])}</div>
    ${Array.isArray(d.retiros) || Array.isArray(d.depositos) ? `<div class="rejilla c2" style="margin-top:12px">
      ${Array.isArray(d.retiros) ? `<div class="tarjeta"><h2>${t('u.retiros')} <span class="tenue2 num">${d.retiros.length}</span></h2>${tablaRetirosHtml(d.retiros, { pendientes: false, conUsuario: false, vacioTexto: t('u.sinRetiros') })}</div>` : ''}
      ${Array.isArray(d.depositos) ? `<div class="tarjeta"><h2>${t('u.depositos')} <span class="tenue2 num">${d.depositos.length}</span></h2>${d.depositos.length ? tablaDepositosHtml(d.depositos, false) : vacio(t('u.sinDepositos'))}</div>` : ''}
    </div>` : ''}
    <div class="rejilla c2" style="margin-top:12px">
      <div class="tarjeta"><h2>${t('u.anuncios')} <span class="tenue2 num">${(d.anuncios || []).length}</span></h2>${tablaAnuncios(d.anuncios || [])}</div>
      <div class="tarjeta"><h2>${t('u.metodos')} <span class="tenue2 num">${(d.metodosPago || []).length}</span></h2>${metodosHtml(d.metodosPago || [])}</div>
    </div>`;
  S.acciones.congelar = async ds => {
    const congelar = ds.congelar === '1';
    const v = await dialogo({ titulo: `${t(congelar ? 'u.congelar' : 'u.descongelar')} · ${u.apodo}`, descripcion: t(congelar ? 'u.congelar.desc' : 'u.descongelar.desc'), campos: [campoNota('motivo', t('motivo'), true, congelar ? MIN_NOTA : 0)], confirmar: t(congelar ? 'u.congelar' : 'u.descongelar'), peligro: congelar, clase: 'verde' });
    if (!v) return;
    const rr = await api(`/usuarios/${encodeURIComponent(u.id)}/congelar`, { metodo: 'POST', cuerpo: { congelado: congelar, motivo: v.motivo } });
    if (!rr.ok) { aviso(mensajeError(rr), 'error'); return; }
    aviso(t(congelar ? 'u.congeladoOk' : 'u.descongeladoOk'), 'ok');
    vistaUsuarioFicha(el, id);
  };
  S.acciones['estado-agente'] = async ds => {
    const suspender = ds.estado === 'suspendido';
    const v = await dialogo({ titulo: `${t(suspender ? 'ag.suspender' : 'ag.reactivar')} · ${u.apodo}`, descripcion: t(suspender ? 'ag.suspender.desc' : 'ag.reactivar.desc'), campos: [{ nombre: 'nota', etiqueta: t('nota'), tipo: 'textarea', requerido: true }], confirmar: t(suspender ? 'ag.suspender' : 'ag.reactivar'), peligro: suspender, clase: 'verde' });
    if (!v) return;
    const rr = await api(`/usuarios/${encodeURIComponent(u.id)}/agente`, { metodo: 'POST', cuerpo: { estado: suspender ? 'suspendido' : 'aprobado', nota: v.nota } });
    if (!rr.ok) { aviso(mensajeError(rr), 'error'); return; }
    aviso(t('ag.estadoCambiado'), 'ok');
    vistaUsuarioFicha(el, id);
  };
  S.acciones.ajuste = async () => {
    const v = await dialogo({ titulo: `${t('u.ajuste')} · ${u.apodo}`, descripcion: t('u.ajuste.desc'), campos: [
      { nombre: 'activo', etiqueta: t('o.activo'), tipo: 'select', opciones: ACTIVOS.map(a => [a, a]), valor: 'ORIGEN' },
      { nombre: 'cantidad', etiqueta: t('u.ajuste.cantidad'), mono: true, requerido: true, marcador: '-1.25', validar: x => (/^-?\d+(\.\d{1,8})?$/.test(x) && Number(x) !== 0 ? '' : t('u.ajuste.invalida')) },
      campoNota('motivo', t('motivo'), true, MIN_NOTA),
    ], confirmar: t('u.ajuste'), peligro: true });
    if (!v) return;
    const rr = await api(`/usuarios/${encodeURIComponent(u.id)}/ajuste`, { metodo: 'POST', cuerpo: { activo: v.activo, cantidad: v.cantidad, motivo: v.motivo } });
    if (!rr.ok) { aviso(mensajeError(rr), 'error'); return; }
    aviso(t('u.ajusteOk'), 'ok');
    vistaUsuarioFicha(el, id);
  };
}
function tablaMovimientos(lista) {
  if (!lista.length) return vacio(t('u.sinMovimientos'));
  const delta = v => { const n = Number(v); if (!n) return `<span class="tenue2 mono">0</span>`; return `<span class="mono ${n > 0 ? 'verde' : 'coral'}">${n > 0 ? '+' : ''}${fmtActivo(v)}</span>`; };
  return `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>${t('dp.cuando')}</th><th>${t('mv.tipo')}</th><th>${t('o.activo')}</th><th class="derecha">${t('mv.disponible')}</th><th class="derecha">${t('mv.congelado')}</th><th>${t('mv.referencia')}</th><th>${t('mv.detalle')}</th></tr></thead><tbody>${lista.map(m => `<tr>
    <td class="tenue">${fmtFecha(m.en)}</td><td>${tv('mv.', m.tipo)}</td><td>${esc(m.activo)}</td><td class="derecha">${delta(m.disponibleDelta)}</td><td class="derecha">${delta(m.congeladoDelta)}</td><td>${m.referencia ? copiable(m.referencia, corto(m.referencia, 10, 4)) : '—'}</td><td class="tenue envolver" style="max-width:320px">${esc(m.detalle || '')}</td></tr>`).join('')}</tbody></table></div>`;
}
function tablaAnuncios(lista) {
  if (!lista.length) return vacio(t('u.sinAnuncios'));
  const cEstado = { activo: 'verde', pausado: 'ambar', agotado: 'gris', cerrado: 'gris' };
  return `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>${t('o.numero')}</th><th>${t('an.lado')}</th><th>${t('o.activo')}</th><th class="derecha">${t('o.precio')}</th><th class="derecha">${t('an.disponible')}</th><th>${t('an.limites')}</th><th>${t('an.estado')}</th></tr></thead><tbody>${lista.map(a => `<tr>
    <td class="mono">${esc(a.numero)}</td><td class="${a.lado === 'venta' ? 'coral' : 'verde'}">${tv('lado.', a.lado)}</td><td>${esc(a.activo)}</td>
    <td class="derecha mono">${a.tipoPrecio === 'fijo' ? fmtFiat(a.precio, a.moneda) : `${esc(t('an.margen'))} ${fmtNum(a.margen, 0, 2)} %${a.precioEfectivo ? `<div class="pequeno tenue">${fmtFiat(a.precioEfectivo, a.moneda)}</div>` : ''}`}</td>
    <td class="derecha mono">${fmtActivo(a.cantidadDisponible)} / ${fmtActivo(a.cantidadTotal)}</td><td class="mono pequeno">${fmtNum(a.limiteMin, 0, 2)} – ${fmtNum(a.limiteMax, 0, 2)} ${esc(a.moneda)}</td><td>${chip(tv('ean.', a.estado), cEstado[a.estado] || '')}</td></tr>`).join('')}</tbody></table></div>`;
}
function metodosHtml(lista) {
  if (!lista.length) return vacio(t('u.sinMetodos'));
  return `<div class="apilar">${lista.map(m => `<div class="parte-caja">
    <div class="fila entre"><b>${esc(m.nombreMetodo || m.tipo)}</b><span>${esc(m.pais)} · ${esc(m.moneda)} ${m.activo === false ? chip(t('mp.inactivo'), 'gris') : ''}</span></div>
    <dl class="def pequeno" style="margin-top:6px">${m.banco ? `<dt>${t('o.banco')}</dt><dd>${esc(m.banco)}</dd>` : ''}<dt>${t('o.titular')}</dt><dd>${esc(m.titular)}</dd>${Object.entries(m.campos || {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${copiable(v)}</dd>`).join('')}</dl>
  </div>`).join('')}</div>`;
}

// ── Precios ──────────────────────────────────────────────────
async function vistaPrecios(el) {
  el.innerHTML = cargando();
  const r = await api('/precios');
  if (S.ruta.vista !== 'precios') return;
  if (!r.ok) { el.innerHTML = errorHtml(r, 'reintentar'); S.acciones.reintentar = () => vistaPrecios(el); return; }
  const p = r.datos.precios || {};
  const monedas = r.datos.monedas || Object.keys(p.fx || {}).map(c => ({ codigo: c, nombre: c, pais: '' }));
  const editable = puede('precios');
  const fx = p.fx || {};
  const oro = Number(p.oroUsdOnza) || 0, plata = Number(p.plataUsdOnza) || 0;
  const refUsd = { ORIGEN: oro * ONZAS_ORIGEN, AUKA: oro, AGKA: plata };
  el.innerHTML = `<form id="form-precios" novalidate>
    <div class="rejilla c2">
      <div class="tarjeta"><h2>${t('p.metales')}<span class="espacio"></span><span class="pequeno tenue" style="text-transform:none;letter-spacing:0;font-weight:400">${tv('fuente.', p.fuente)} · ${esc(hace(p.actualizadoEn))}${p.actualizadoPor ? ` · ${esc(t('p.actualizadoPor', { quien: p.actualizadoPor }))}` : ''}</span></h2>
        <div class="formulario-fila">
          <div class="campo"><label for="p-oro">${t('r.oro')}</label><input id="p-oro" name="oroUsdOnza" class="mono" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(p.oroUsdOnza ?? '')}" ${editable ? '' : 'disabled'}></div>
          <div class="campo"><label for="p-plata">${t('r.plata')}</label><input id="p-plata" name="plataUsdOnza" class="mono" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(p.plataUsdOnza ?? '')}" ${editable ? '' : 'disabled'}></div>
        </div>
      </div>
      <div class="tarjeta"><h2>${t('p.referencia')}</h2>
        <div class="rejilla c3">${ACTIVOS.map(a => `<div><div class="pequeno tenue">${a}</div><div class="mono" style="font-size:16px" data-ref="${a}">${fmtNum(refUsd[a], a === 'ORIGEN' ? 4 : 2, a === 'ORIGEN' ? 4 : 2)} <span class="tenue pequeno">USD</span></div></div>`).join('')}</div>
        <p class="pequeno tenue2" style="margin-top:8px">${t('p.origenNota')}</p>
      </div>
    </div>
    <div class="tarjeta" style="margin-top:12px"><h2>${t('p.fx')}<span class="espacio"></span><span class="pequeno" id="precios-cambios" style="text-transform:none;letter-spacing:0"></span></h2>
      <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>${t('p.moneda')}</th><th>${t('p.nombre')}</th><th>${t('u.pais')}</th><th class="derecha">${t('p.tasa')}</th><th class="derecha">ORIGEN</th><th class="derecha">AUKA</th><th class="derecha">AGKA</th></tr></thead><tbody>
        ${monedas.map(m => { const c = m.codigo; const v = fx[c]; const paises = m.pais || (Array.isArray(m.paises) ? m.paises.join(', ') : ''); return `<tr data-moneda="${esc(c)}">
          <td class="mono"><b>${esc(c)}</b></td><td>${esc(m.nombre || '')}</td><td class="tenue">${esc(paises)}</td>
          <td class="derecha"><input class="fx" name="fx:${esc(c)}" type="number" step="0.0001" min="0" inputmode="decimal" value="${esc(v ?? '')}" data-original="${esc(v ?? '')}" aria-label="${esc(c)}" ${editable && c !== 'USD' ? '' : 'disabled'}></td>
          <td class="derecha mono" data-ref-fx="ORIGEN">${fmtNum(refUsd.ORIGEN * (Number(v) || 0), 2, 4)}</td><td class="derecha mono" data-ref-fx="AUKA">${fmtNum(refUsd.AUKA * (Number(v) || 0), 2, 2)}</td><td class="derecha mono" data-ref-fx="AGKA">${fmtNum(refUsd.AGKA * (Number(v) || 0), 2, 2)}</td>
        </tr>`; }).join('')}
      </tbody></table></div>
      <div class="formulario-acciones">${editable ? `<button class="boton primario" type="submit">${t('p.guardarCambios')}</button>` : soloLecturaHtml()}</div>
    </div></form>`;
  const form = el.querySelector('#form-precios');
  const recalcular = () => {
    const o = Number(form.elements.oroUsdOnza.value) || 0, pl = Number(form.elements.plataUsdOnza.value) || 0;
    const ref = { ORIGEN: o * ONZAS_ORIGEN, AUKA: o, AGKA: pl };
    form.querySelectorAll('[data-ref]').forEach(x => { const a = x.dataset.ref; x.innerHTML = `${fmtNum(ref[a], a === 'ORIGEN' ? 4 : 2, a === 'ORIGEN' ? 4 : 2)} <span class="tenue pequeno">USD</span>`; });
    let cambios = 0;
    if (String(form.elements.oroUsdOnza.value) !== String(p.oroUsdOnza ?? '')) cambios++;
    if (String(form.elements.plataUsdOnza.value) !== String(p.plataUsdOnza ?? '')) cambios++;
    form.querySelectorAll('tr[data-moneda]').forEach(tr => {
      const inp = tr.querySelector('input.fx');
      const v = Number(inp.value) || 0;
      const cambiado = inp.value !== inp.dataset.original;
      inp.classList.toggle('cambiado', cambiado);
      if (cambiado) cambios++;
      tr.querySelector('[data-ref-fx="ORIGEN"]').textContent = fmtNum(ref.ORIGEN * v, 2, 4);
      tr.querySelector('[data-ref-fx="AUKA"]').textContent = fmtNum(ref.AUKA * v, 2, 2);
      tr.querySelector('[data-ref-fx="AGKA"]').textContent = fmtNum(ref.AGKA * v, 2, 2);
    });
    const c = el.querySelector('#precios-cambios');
    if (c) { c.textContent = cambios ? t('p.cambios', { n: cambios }) : ''; c.className = 'pequeno ' + (cambios ? 'oro' : ''); }
  };
  form.addEventListener('input', recalcular);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!editable) return;
    const cuerpo = {};
    const oroV = form.elements.oroUsdOnza.value, plataV = form.elements.plataUsdOnza.value;
    if (String(oroV) !== String(p.oroUsdOnza ?? '')) { if (!(Number(oroV) > 0)) { aviso(t('p.invalido', { campo: t('r.oro') }), 'error'); return; } cuerpo.oroUsdOnza = Number(oroV); }
    if (String(plataV) !== String(p.plataUsdOnza ?? '')) { if (!(Number(plataV) > 0)) { aviso(t('p.invalido', { campo: t('r.plata') }), 'error'); return; } cuerpo.plataUsdOnza = Number(plataV); }
    const fxNuevo = {};
    let hayFx = false;
    for (const inp of form.querySelectorAll('input.fx')) {
      if (inp.value === inp.dataset.original) continue;
      const c = inp.closest('tr').dataset.moneda;
      if (!(Number(inp.value) > 0)) { aviso(t('p.invalido', { campo: c }), 'error'); inp.focus(); return; }
      fxNuevo[c] = Number(inp.value); hayFx = true;
    }
    if (hayFx) cuerpo.fx = fxNuevo;
    if (!Object.keys(cuerpo).length) { aviso(t('p.sinCambios')); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const rr = await api('/precios', { metodo: 'PUT', cuerpo });
    btn.disabled = false;
    if (!rr.ok) { aviso(mensajeError(rr), 'error'); return; }
    aviso(t('p.guardado'), 'ok');
    vistaPrecios(el);
  });
}

// ── Configuración (solo admin) ───────────────────────────────
// [clave, tipo, paso, mín, máx]. Los rangos son los que aplica el servidor (FALTA EN API: no están documentados).
const CAMPOS_CONFIG = [
  ['comisionPct', 'number', '0.01', 0, 5], ['garantiaAgente', 'text', null], ['maxOrdenesAbiertas', 'number', '1', 1, 50],
  ['minOrdenUsd', 'number', '1', 0, 10000], ['maxOrdenUsdSinAgente', 'number', '1', 10, 10000000], ['confirmacionesDeposito', 'number', '1', 1, 100], ['tesoreria', 'text', null],
];
async function vistaConfiguracion(el) {
  el.innerHTML = cargando();
  const r = await api('/configuracion');
  if (S.ruta.vista !== 'configuracion') return;
  if (!r.ok) { el.innerHTML = errorHtml(r, 'reintentar'); S.acciones.reintentar = () => vistaConfiguracion(el); return; }
  const c = r.datos.configuracion || {};
  const editable = puede('configuracion');
  el.innerHTML = `<form id="form-config" class="tarjeta" style="max-width:720px" novalidate><h2>${t('c.titulo')}</h2>
    ${banda('ambar', esc(t('c.aviso')))}
    <div class="formulario-fila">${CAMPOS_CONFIG.map(([k, tipo, paso, min, max]) => `<div class="campo" ${k === 'tesoreria' ? 'style="grid-column:1/-1"' : ''}><label for="cfg-${k}">${t('c.' + k)}</label><input id="cfg-${k}" name="${k}" type="${tipo}" ${paso ? `step="${paso}"` : ''} ${tipo === 'number' ? `min="${min}" max="${max}" inputmode="decimal"` : ''} ${k === 'tesoreria' ? 'placeholder="0x…" spellcheck="false"' : ''} class="mono" value="${esc(c[k] ?? '')}" data-original="${esc(c[k] ?? '')}" ${editable ? '' : 'disabled'}></div>`).join('')}</div>
    <div class="formulario-acciones">${editable ? `<button class="boton primario" type="submit">${t('guardar')}</button>` : soloLecturaHtml()}</div>
  </form>`;
  const form = el.querySelector('#form-config');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!editable) return;
    const cuerpo = {};
    for (const [k, tipo, , min, max] of CAMPOS_CONFIG) {
      const inp = form.elements[k];
      if (inp.value === inp.dataset.original) continue;
      const v = inp.value.trim();
      if (tipo === 'number') {
        const n = Number(v);
        if (v === '' || !isFinite(n) || n < min || n > max) { aviso(t('c.rango', { campo: t('c.' + k), min, max }), 'error'); inp.focus(); return; }
        cuerpo[k] = n;
      } else if (k === 'garantiaAgente') {
        if (!/^\d+(\.\d{1,8})?$/.test(v)) { aviso(t('c.garantiaInvalida'), 'error'); inp.focus(); return; }
        cuerpo[k] = v;
      } else if (k === 'tesoreria') {
        if (v && !RE_DIRECCION.test(v)) { aviso(t('c.tesoreriaInvalida'), 'error'); inp.focus(); return; }
        cuerpo[k] = v || null;
      } else cuerpo[k] = v || null;
    }
    if (!Object.keys(cuerpo).length) { aviso(t('p.sinCambios')); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const rr = await api('/configuracion', { metodo: 'PUT', cuerpo });
    btn.disabled = false;
    if (!rr.ok) { aviso(mensajeError(rr), 'error'); return; }
    aviso(t('c.guardada'), 'ok');
    vistaConfiguracion(el);
  });
}

// ── Bitácora (cadena de hashes) ──────────────────────────────
function vistaBitacora(el) {
  const f = S.filtros.bitacora;
  el.innerHTML = `<div class="filtros">
      <div class="buscador">${icono('buscar')}<input class="entrada" id="bitacora-q" type="search" value="${esc(f.q)}" placeholder="${t('b.buscar')}" aria-label="${t('buscar')}"></div>
      <span class="espacio"></span><span id="bitacora-integridad"></span>
    </div>
    <div id="tabla-bitacora">${cargando()}</div>`;
  let debounce = null;
  el.querySelector('#bitacora-q').addEventListener('input', ev => { clearTimeout(debounce); debounce = setTimeout(() => { f.q = ev.target.value.trim(); f.pagina = 1; f.tam = 0; cargarBitacora(); }, 350); });
  S.acciones['pag-bitacora'] = ds => { f.pagina = Math.max(1, Number(ds.ir) || 1); cargarBitacora(); };
  S.acciones.reintentar = cargarBitacora;
  cargarBitacora();
}
async function cargarBitacora() {
  const f = S.filtros.bitacora;
  const caja = document.getElementById('tabla-bitacora');
  if (!caja) return;
  caja.innerHTML = cargando();
  const r = await api(`/bitacora?pagina=${f.pagina}&q=${encodeURIComponent(f.q)}`);
  const caja2 = document.getElementById('tabla-bitacora');
  if (!caja2) return;
  if (!r.ok) { caja2.innerHTML = errorHtml(r, 'reintentar'); return; }
  const integ = document.getElementById('bitacora-integridad');
  if (integ) integ.innerHTML = r.datos.integra === false
    ? `<span class="integridad mal">${icono('alerta')} ${t('b.rota')}</span>`
    : `<span class="integridad ok" title="${t('b.nota')}">${icono('eslabon')} ${t('b.integra')}</span>`;
  const lista = r.datos.entradas || [];
  if (!lista.length) { caja2.innerHTML = vacio(t('b.vacia')); return; }
  const detalleHtml = d => {
    if (d == null) return '—';
    let s;
    try { s = typeof d === 'string' ? d : JSON.stringify(d, null, 1); } catch { s = String(d); }
    if (s.length <= 90 && !s.includes('\n')) return `<span class="mono pequeno tenue">${esc(s)}</span>`;
    return `<details class="plegable"><summary>${t('b.verDetalle')}</summary><pre class="detalle-json">${esc(s)}</pre></details>`;
  };
  caja2.innerHTML = `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th class="derecha">${t('b.n')}</th><th>${t('dp.cuando')}</th><th>${t('b.actor')}</th><th>${t('b.accion')}</th><th>${t('b.objeto')}</th><th>${t('b.detalle')}</th><th>${t('b.hash')}</th></tr></thead><tbody>${lista.map(e => `<tr>
    <td class="derecha mono tenue">${fmtNum(e.n)}</td>
    <td class="tenue nowrap">${fmtFecha(e.en)}</td>
    <td>${esc(e.actor)}</td>
    <td><span class="chip">${esc(e.accion)}</span></td>
    <td class="mono pequeno">${esc(e.objeto)}</td>
    <td class="envolver">${detalleHtml(e.detalle)}</td>
    <td><span class="eslabon hash" title="${esc(e.hash)}\n← ${esc(e.hashAnterior)}">${icono('eslabon')}<b>${esc(corto(e.hash, 6, 4))}</b><span class="tenue2">←${esc(corto(e.hashAnterior, 4, 3))}</span></span></td>
  </tr>`).join('')}</tbody></table></div>` + paginacionHtml('bitacora', f.pagina, lista.length, r.datos.total);
}

// ── Operadores (solo admin) ──────────────────────────────────
function vistaOperadores(el) {
  el.innerHTML = `<div class="filtros"><span class="espacio"></span>${puede('operadores') ? `<button class="boton primario" data-accion="nuevo-operador">${t('op.nuevo')}</button>` : ''}</div><div id="tabla-operadores">${cargando()}</div>`;
  S.acciones.reintentar = cargarOperadores;
  S.acciones['nuevo-operador'] = async () => {
    const v = await dialogo({ titulo: t('op.nuevo'), descripcion: t('op.crear.desc'), campos: [
      { nombre: 'nombre', etiqueta: t('op.nombre'), requerido: true, autocompletar: 'off' },
      { nombre: 'email', etiqueta: t('correo'), tipo: 'email', requerido: true, autocompletar: 'off', validar: x => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) ? '' : t('op.correoInvalido')) },
      { nombre: 'rol', etiqueta: t('op.rol'), tipo: 'select', opciones: [['soporte', t('rol.soporte')], ['auditor', t('rol.auditor')], ['admin', t('rol.admin')]], valor: 'soporte' },
    ], confirmar: t('op.nuevo') });
    if (!v) return;
    const r = await api('/operadores', { metodo: 'POST', cuerpo: { email: v.email, nombre: v.nombre, rol: v.rol } });
    if (!r.ok) { aviso(mensajeError(r), 'error'); return; }
    aviso(t('op.creadoOk'), 'ok');
    cargarOperadores();
    await mostrarSecreto((r.datos.operador && r.datos.operador.nombre) || v.nombre, r.datos.contrasenaTemporal);
  };
  S.acciones['estado-operador'] = async ds => {
    const activar = ds.activo === '1';
    if (!activar) {
      const v = await dialogo({ titulo: `${t('op.desactivar')} · ${ds.nombre || ''}`, descripcion: t('op.desactivar.desc', { nombre: ds.nombre || '' }), confirmar: t('op.desactivar'), peligro: true });
      if (!v) return;
    }
    const r = await api(`/operadores/${encodeURIComponent(ds.id)}/estado`, { metodo: 'POST', cuerpo: { activo: activar } });
    if (!r.ok) { aviso(mensajeError(r), 'error'); return; }
    aviso(t('op.estadoOk'), 'ok');
    cargarOperadores();
  };
  S.acciones['restablecer-operador'] = async ds => {
    const v = await dialogo({ titulo: `${t('op.restablecer')} · ${ds.nombre || ''}`, descripcion: t('op.restablecer.desc', { nombre: ds.nombre || '' }), confirmar: t('op.restablecer'), peligro: true });
    if (!v) return;
    const r = await api(`/operadores/${encodeURIComponent(ds.id)}/restablecer`, { metodo: 'POST' });
    if (!r.ok) { aviso(mensajeError(r), 'error'); return; }
    cargarOperadores();
    await mostrarSecreto(ds.nombre || '', r.datos.contrasenaTemporal);
  };
  cargarOperadores();
}
function mostrarSecreto(nombre, secreto) {
  return dialogo({
    titulo: t('op.secreto.titulo', { nombre }), descripcion: t('op.secreto.desc'),
    html: `<div class="secreto"><span>${esc(secreto || '—')}</span><button type="button" class="boton chico" data-copiar="${esc(secreto || '')}">${icono('copiar')} ${t('copiar')}</button></div>`,
    confirmar: t('cerrar'), soloCerrar: true,
  });
}
async function cargarOperadores() {
  const caja = document.getElementById('tabla-operadores');
  if (!caja) return;
  caja.innerHTML = cargando();
  const r = await api('/operadores');
  const caja2 = document.getElementById('tabla-operadores');
  if (!caja2) return;
  if (!r.ok) { caja2.innerHTML = errorHtml(r, 'reintentar'); return; }
  const lista = r.datos.operadores || [];
  if (!lista.length) { caja2.innerHTML = vacio(t('sinDatos')); return; }
  const yo = S.operador ? S.operador.id : null;
  caja2.innerHTML = `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>${t('op.nombre')}</th><th>${t('correo')}</th><th>${t('op.rol')}</th><th>${t('op.estado')}</th><th>${t('op.ultimoAcceso')}</th><th>${t('op.creado')}</th><th></th></tr></thead><tbody>${lista.map(o => `<tr>
    <td><b>${esc(o.nombre)}</b>${o.id === yo ? ` <span class="tenue pequeno">(${t('op.tu')})</span>` : ''}</td>
    <td class="tenue">${esc(o.email)}</td>
    <td><span class="rol ${esc(o.rol)}">${tv('rol.', o.rol)}</span></td>
    <td>${o.activo ? chip(t('op.activo'), 'verde') : chip(t('op.inactivo'), 'gris')}${o.debeCambiarContrasena ? ' ' + chip(t('op.debeCambiar'), 'ambar') : ''}</td>
    <td class="tenue">${o.ultimoAcceso ? fmtFecha(o.ultimoAcceso) : t('op.nunca')}</td>
    <td class="tenue">${fmtFecha(o.creadoEn, false)}</td>
    <td class="acciones">${puede('operadores') && o.id !== yo ? `<button class="boton chico ${o.activo ? '' : 'verde'}" data-accion="estado-operador" data-id="${esc(o.id)}" data-nombre="${esc(o.nombre)}" data-activo="${o.activo ? '0' : '1'}">${o.activo ? t('op.desactivar') : t('op.activar')}</button><button class="boton chico" data-accion="restablecer-operador" data-id="${esc(o.id)}" data-nombre="${esc(o.nombre)}" title="${t('op.restablecer')}">${t('op.restablecerCorto')}</button>` : ''}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

// ── Sondeo: apelaciones, retiros y solicitudes pendientes cada 20 s ──
function actualizarCola(parcial) {
  for (const k of Object.keys(parcial)) if (typeof parcial[k] === 'number') S.cola[k] = parcial[k];
  pintarContadores();
}
function iniciarSondeo() {
  detenerSondeo();
  S.sondeo.timer = setInterval(sondear, SONDEO_MS);
  S.sondeo.vivoTimer = setInterval(pintarVivo, 5000);
  sondear();
}
function detenerSondeo() {
  if (S.sondeo.timer) clearInterval(S.sondeo.timer);
  if (S.sondeo.vivoTimer) clearInterval(S.sondeo.vivoTimer);
  S.sondeo.timer = null; S.sondeo.vivoTimer = null;
}
let sondeando = false;
async function sondear() {
  if (!S.token || sondeando || document.hidden) { pintarVivo(); return; }
  sondeando = true;
  try {
    const [a, r, g] = await Promise.all([api('/apelaciones'), api('/retiros?estado=pendiente'), api('/agentes?estado=pendiente')]);
    if (!S.token) return;
    const nuevo = {};
    if (a.ok) {
      const n = (a.datos.ordenes || []).length;
      if (S.cola.apelaciones != null && n > S.cola.apelaciones) aviso(t('nueva.apelacion'));
      nuevo.apelaciones = n;
      if (S.refrescar.apelaciones) S.refrescar.apelaciones(a.datos.ordenes || []);
    }
    if (r.ok) {
      const n = (r.datos.retiros || []).length;
      if (S.cola.retiros != null && n > S.cola.retiros) aviso(t('nuevo.retiro'));
      nuevo.retiros = n;
      if (S.refrescar.retirosPendientes) S.refrescar.retirosPendientes(r.datos.retiros || []);
    }
    if (g.ok) {
      const n = (g.datos.solicitudes || []).length;
      if (S.cola.agentes != null && n > S.cola.agentes) aviso(t('nueva.solicitud'));
      nuevo.agentes = n;
      if (S.refrescar.solicitudes) S.refrescar.solicitudes(g.datos.solicitudes || []);
    }
    actualizarCola(nuevo);
    S.sondeo.error = !(a.ok && r.ok && g.ok);
    S.sondeo.ultimo = Date.now();
    // La orden abierta ya tiene su propio ciclo de 5 s; aquí solo se refresca si está cerrada.
    if (S.refrescar.orden && !S.sondeoOrden) S.refrescar.orden();
  } finally {
    sondeando = false;
    pintarVivo();
  }
}
function pintarVivo() {
  const v = document.getElementById('vivo');
  if (!v) return;
  const txt = v.querySelector('span');
  if (document.hidden) { v.className = 'vivo pausa'; if (txt) txt.textContent = t('vivo.pausa'); return; }
  if (S.sondeo.error) { v.className = 'vivo error'; if (txt) txt.textContent = t('vivo.error'); return; }
  if (!S.sondeo.ultimo) { v.className = 'vivo pausa'; if (txt) txt.textContent = t('vivo'); return; }
  v.className = 'vivo';
  if (txt) txt.textContent = t('vivo.hace', { hace: hace(new Date(S.sondeo.ultimo).toISOString()) });
}

// ── Arranque ─────────────────────────────────────────────────
async function arrancar() {
  cargarSesion();
  document.documentElement.lang = S.idioma;
  const app = document.getElementById('app');
  app.addEventListener('click', ev => {
    const b = ev.target.closest('[data-accion]');
    if (b && !b.disabled && S.acciones[b.dataset.accion]) { ev.preventDefault(); S.acciones[b.dataset.accion](b.dataset, b); return; }
    const fila = ev.target.closest('tr[data-ir]');
    if (fila && !ev.target.closest('a,button,input,details,summary')) ir(fila.dataset.ir);
  });
  document.addEventListener('click', ev => {
    const c = ev.target.closest('[data-copiar]');
    if (c) { ev.preventDefault(); copiar(c.dataset.copiar || ''); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token) { sondear(); if (S.sondeoOrden && S.refrescar.orden) S.refrescar.orden(); } else pintarVivo(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.menuAbierto) cerrarMenu(); });
  window.addEventListener('hashchange', render);
  if (S.token) {
    const r = await api('/sesion/yo');
    if (r.ok && r.datos.operador) { S.operador = r.datos.operador; guardarSesion(); }
    else if (r.estado === 401 || r.estado === 403) { cerrarSesion(r.estado === 401); return; }
  }
  if (!location.hash || location.hash === '#/entrar' || location.hash === '#/') location.hash = S.token ? '#/resumen' : '#/entrar';
  render();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})();
