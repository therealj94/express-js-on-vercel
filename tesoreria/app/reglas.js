/* ============================================================
   Orden Global · Tesorería — reglas y comandos
   ------------------------------------------------------------
   Este archivo corre IGUAL en el navegador y en el servidor.
   El navegador lo usa para explicar (dictamen anticipado, techos,
   alertas) y el servidor para impedir (ninguna mutación entra si
   no pasa por aquí). Una sola fuente de verdad para el negocio.

   Todo cambio de estado es un COMANDO con nombre:
     ejecutar(estado, 'reserva.registrar', datos, ctx)
   El comando valida, muta y devuelve qué asentar en el libro.
   ============================================================ */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TesoreriaReglas = fabrica();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---------------- utilidades ---------------- */
  const num = (n, d) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const compacto = (n) => {
    const a = Math.abs(Number(n) || 0);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, '') + ' MM';
    if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, '') + ' M';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + ' k';
    return num(n);
  };
  const usd = (n) => '$' + compacto(n);
  const pct = (n, d) => Number(n).toFixed(d === undefined ? 2 : d) + '%';
  const esNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const positivo = (v, que) => { if (!esNum(v) || v <= 0) throw new Error(`${que}: hace falta un número mayor que cero`); return v; };
  const texto = (v, que, max) => {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!s) throw new Error(`${que}: no puede ir vacío`);
    return s.slice(0, max || 500);
  };
  const clon = (o) => JSON.parse(JSON.stringify(o));

  /* Hash de respaldo para cuando el entorno no da uno (el navegador). FNV-1a. */
  function hashFnv(txt) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < txt.length; i++) {
      const c = txt.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (h2 + Math.imul(c, 0x85ebca6b)) >>> 0; h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
    }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).toUpperCase();
  }
  const idAzar = (pre) => pre + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

  /* ---------------- catálogos ---------------- */
  const ACCIONES = {
    emision_inicial: 'Emisión inicial',
    emision_adicional: 'Emisión adicional',
    revaluacion: 'Revaluación al alza',
    recompra: 'Recompra',
    quema: 'Quema',
  };
  const etiquetaAccion = (a) => ACCIONES[a] || a;

  const CAUSAS = {
    security: [
      { v: 'nuevo_activo', t: 'Aporte de nuevo activo al patrimonio', pide: 'Certificado de aporte + tasación del activo nuevo' },
      { v: 'revaluacion', t: 'Revaluación al alza certificada', pide: 'Informe de valuador independiente y acta del Comité' },
      { v: 'ampliacion_capital', t: 'Ampliación de capital aprobada en asamblea', pide: 'Acta de asamblea y folleto suplementario' },
      { v: 'canje', t: 'Canje / conversión de instrumento previo', pide: 'Contrato de conversión y quema equivalente' },
    ],
    utility: [
      { v: 'capacidad', t: 'Ampliación de capacidad de servicio', pide: 'Contrato de capacidad e infraestructura verificable' },
      { v: 'demanda', t: 'Demanda de uso comprobada (consumo > 85%)', pide: 'Métricas de consumo de los últimos 90 días' },
      { v: 'programa', t: 'Programa de incentivos aprobado', pide: 'Presupuesto del programa y calendario de vesting' },
      { v: 'reposicion', t: 'Reposición por quema', pide: 'Comprobante de quema equivalente' },
    ],
  };

  /** Qué puede hacer cada rol. `*` lo puede todo. */
  const PERMISOS = {
    presidente: ['*'],
    // Consejero: firma y dictamina; también puede solicitar y operar las tesorerías.
    consejero: ['solicitud.firmar', 'solicitud.dictaminar', 'solicitud.crear', 'tesoreria.operar', 'origen.reservas', 'origen.emitir', 'origen.freno'],
    // Tesorero: opera los tokens y pide emisión, pero no firma ni dictamina.
    tesorero: ['solicitud.crear', 'tesoreria.operar', 'origen.reservas'],
    // Auditor: mira todo, no toca nada.
    auditor: [],
  };
  const ROLES = Object.keys(PERMISOS);
  function puede(rol, permiso) {
    const suyos = PERMISOS[rol] || [];
    return suyos.includes('*') || suyos.includes(permiso);
  }

  /* ---------------- reglas de respaldo (el corazón) ---------------- */

  /** Cuántos USD vale una unidad de ORIGEN con el precio de referencia del oro. */
  function valorUnidad(estado) {
    return estado.origen.gramosPorUnidad * estado.politica.oroUsdPorGramo;
  }

  /** Valor admisible de una reserva = valor certificado menos el aforo. Vencida o en revisión vale cero. */
  function valorAdmisible(r, ahora) {
    if (r.estado !== 'certificada') return 0;
    if (r.vence && new Date(r.vence) < (ahora || new Date())) return 0;
    return r.valorCertificado * (1 - r.haircut);
  }
  const reservasAdmisibles = (estado, ahora) => estado.reservas.reduce((s, r) => s + valorAdmisible(r, ahora), 0);

  /** Fotografía completa del respaldo. Toda decisión de emisión se toma con esto. */
  function respaldo(estado, ahora) {
    const vu = valorUnidad(estado);
    const admisible = reservasAdmisibles(estado, ahora);
    const emitidoUnidades = estado.origen.emitido - estado.origen.quemado;
    const emitido = emitidoUnidades * vu;               // en USD
    const comprometido = estado.asignaciones.filter((a) => a.estado === 'comprometida').reduce((s, a) => s + a.monto, 0);
    const libre = emitido - comprometido;
    const enCola = estado.solicitudes.filter((s) => ['en_revision', 'objecion'].includes(s.estado)).reduce((s, x) => s + x.origenRequerido, 0);
    const ratio = emitido > 0 ? (admisible / emitido) * 100 : Infinity;
    return {
      valorUnidad: vu, admisible, emitidoUnidades, emitido, comprometido, libre, enCola, ratio,
      holgura: admisible - emitido,
      libreTrasCola: libre - enCola,
      salud: ratio === Infinity || ratio >= estado.politica.ratioObjetivo ? 'ok' : ratio >= estado.politica.ratioMinimo ? 'warn' : 'bad',
      congelado: !!estado.politica.congelado,
    };
  }

  /** ¿Puede comprometerse `monto` USD de respaldo? Devuelve los motivos si no. */
  function puedeEmitir(estado, monto, ahora) {
    const r = respaldo(estado, ahora);
    const faltas = [];
    if (r.congelado) faltas.push('La emisión global está congelada por el Consejo.');
    if (monto > r.libre) faltas.push(`Solo hay ${usd(r.libre)} de ORIGEN libre; se piden ${usd(monto)}.`);
    if (r.ratio < estado.politica.ratioMinimo) faltas.push(`El ratio de respaldo está en ${pct(r.ratio)}, bajo el mínimo de ${estado.politica.ratioMinimo}%.`);
    return { ok: faltas.length === 0, faltas, respaldo: r };
  }

  /** Security: valor emitido ≤ valuación certificada y ≤ ORIGEN asignado. */
  function saludSecurity(t, ahora) {
    const hoy = ahora || new Date();
    const valorEmitido = t.supply.emitido * t.precioUnitario;
    const cobertura = valorEmitido > 0 ? (t.valuacion.valorCertificado / valorEmitido) * 100 : Infinity;
    const cabecera = t.supply.autorizado - t.supply.emitido;
    const origenOk = t.origenAsignado + 0.01 >= valorEmitido;
    const valVence = !!(t.valuacion.proximaRevision && new Date(t.valuacion.proximaRevision) < hoy);
    const alertas = [];
    if (!origenOk) alertas.push('Valor emitido por encima del ORIGEN asignado');
    if (cobertura < 100) alertas.push('Valor emitido por encima de la valuación certificada');
    if (valVence) alertas.push('Valuación vencida: requiere revisión del Comité');
    const vencidos = (t.cumplimiento.reportes || []).filter((r) => r.estado === 'vencido').length;
    if (vencidos) alertas.push(`${vencidos} reporte(s) periódico(s) vencido(s)`);
    return { valorEmitido, cobertura, cabecera, origenOk, valVence, alertas, salud: !alertas.length ? 'ok' : (!origenOk || cobertura < 100) ? 'bad' : 'warn' };
  }

  /** Utility: circulante ≤ capacidad de servicio y la porción redimible ≤ ORIGEN asignado. */
  function saludUtility(t) {
    const circulante = t.supply.emitido - t.supply.quemado - t.supply.enTesoreria;
    const ratioUtilidad = circulante > 0 ? (t.capacidad.comprometida / circulante) * 100 : Infinity;
    const pasivoRedimible = circulante * t.precioAncla * t.redimible;
    const origenOk = t.origenAsignado + 0.01 >= pasivoRedimible;
    const alertas = [];
    if (ratioUtilidad < 100) alertas.push('Circulante por encima de la capacidad de servicio comprometida');
    if (!origenOk) alertas.push('Pasivo redimible por encima del ORIGEN asignado');
    if (t.quema30d > 0 && t.consumo30d / Math.max(t.quema30d, 1) < 0.5) alertas.push('Consumo real muy por debajo de la emisión: revisar grifos');
    return { circulante, ratioUtilidad, pasivoRedimible, origenOk, alertas, salud: !alertas.length ? 'ok' : (!origenOk || ratioUtilidad < 100) ? 'bad' : 'warn' };
  }

  /* ---------------- consultas ---------------- */
  const buscar = {
    security: (e, i) => e.securities.find((t) => t.id === i),
    utility: (e, i) => e.utilities.find((t) => t.id === i),
    token: (e, i) => e.securities.find((t) => t.id === i) || e.utilities.find((t) => t.id === i),
    reserva: (e, i) => e.reservas.find((r) => r.id === i),
    solicitud: (e, i) => e.solicitudes.find((s) => s.id === i),
    emisor: (e, i) => e.emisores.find((x) => x.id === i),
    pendientes: (e) => e.solicitudes.filter((s) => ['en_revision', 'objecion'].includes(s.estado)),
  };
  const oToken = (e, i) => { const t = buscar.token(e, i); if (!t) throw new Error('Token no encontrado'); return t; };
  const oSec = (e, i) => { const t = buscar.security(e, i); if (!t) throw new Error('Security token no encontrado'); return t; };
  const oUtl = (e, i) => { const t = buscar.utility(e, i); if (!t) throw new Error('Utility token no encontrado'); return t; };
  const oSol = (e, i) => { const s = buscar.solicitud(e, i); if (!s) throw new Error('Solicitud no encontrada'); return s; };
  const oRes = (e, i) => { const r = buscar.reserva(e, i); if (!r) throw new Error('Reserva no encontrada'); return r; };

  /** Lo que se firma de una solicitud: nada que pueda cambiar después. */
  const canonSolicitud = (s) => JSON.stringify({ id: s.id, tokenId: s.tokenId, accion: s.accion, cantidad: s.cantidad, precio: s.precio, origenRequerido: s.origenRequerido, creada: s.creada });

  /* ---------------- comandos ----------------
     Cada uno: { permiso, run(estado, datos, ctx) → { detalle, nivel } }
     ctx: { actor, rol, ahora (Date), id(pre), firmar?(canon) → {firma, clavePublica} }
  */
  const C = {};

  /* --- sistema --- */
  C['sistema.freno'] = { permiso: 'origen.freno', run(e, d) {
    const on = !!d.congelar;
    e.politica.congelado = on;
    return { detalle: on ? 'El Consejo congeló toda emisión del ecosistema' : 'El Consejo levantó el freno de emisión', nivel: on ? 'bad' : 'ok' };
  } };

  C['politica.modificar'] = { permiso: 'origen.politica', run(e, d) {
    const n = {
      ratioObjetivo: positivo(d.ratioObjetivo, 'Ratio objetivo'), ratioMinimo: positivo(d.ratioMinimo, 'Ratio mínimo'),
      firmasRequeridas: positivo(d.firmasRequeridas, 'Firmas requeridas'),
      diasObjecion: esNum(d.diasObjecion) && d.diasObjecion >= 0 ? d.diasObjecion : 7,
      revisionValuacionMeses: positivo(d.revisionValuacionMeses, 'Meses de revisión'),
      bandaSecundario: esNum(d.bandaSecundario) && d.bandaSecundario >= 0 ? d.bandaSecundario : e.politica.bandaSecundario,
    };
    if (n.ratioMinimo > n.ratioObjetivo) throw new Error('El ratio mínimo no puede superar al objetivo');
    if (n.ratioMinimo < 100) throw new Error('El ratio mínimo no puede bajar de 100%: eso sería emitir sin respaldo');
    if (n.firmasRequeridas > e.consejo.length) throw new Error(`Solo hay ${e.consejo.length} consejeros; no pueden exigirse ${n.firmasRequeridas} firmas`);
    Object.assign(e.politica, n);
    return { detalle: `Ratio ${n.ratioObjetivo}%/${n.ratioMinimo}%, ${n.firmasRequeridas} firmas, ${n.diasObjecion} días de objeción`, nivel: 'warn' };
  } };

  C['politica.oro'] = { permiso: 'origen.politica', run(e, d) {
    const p = positivo(d.usdPorGramo, 'Precio del oro');
    const fuente = texto(d.fuente || 'Referencia del Consejo', 'Fuente', 120);
    const antes = e.politica.oroUsdPorGramo;
    e.politica.oroUsdPorGramo = p; e.politica.oroFuente = fuente; e.politica.oroFecha = new Date().toISOString();
    const r = respaldo(e);
    return { detalle: `Oro de referencia ${num(antes, 2)} → ${num(p, 2)} USD/g (${fuente}) · ratio ahora ${pct(r.ratio)}`, nivel: r.salud === 'ok' ? 'info' : 'warn' };
  } };

  /* --- reservas --- */
  C['reserva.registrar'] = { permiso: 'origen.reservas', run(e, d, ctx) {
    const nombre = texto(d.nombre, 'Nombre', 120);
    const valor = positivo(d.valorCertificado, 'Valor certificado');
    const haircut = Math.min(0.9, Math.max(0, Number(d.haircut) || 0));
    const certificado = String(d.certificado || '').trim();
    const vence = d.vence ? new Date(d.vence).toISOString() : null;
    const r = {
      id: ctx.id('RES'), nombre, clase: texto(d.clase || 'Otro', 'Clase', 60), detalle: String(d.detalle || '').trim().slice(0, 500),
      custodio: String(d.custodio || '—').trim().slice(0, 120), auditor: String(d.auditor || '—').trim().slice(0, 120),
      certificado: certificado || '—', valorCertificado: valor, moneda: 'USD', haircut,
      estado: certificado && vence ? 'certificada' : 'en_revision',
      fechaCert: certificado && vence ? ctx.ahora.toISOString() : null, vence,
      docHash: (ctx.hash || hashFnv)(nombre + valor + ctx.ahora.getTime()).slice(0, 8), origenSerie: String(d.origenSerie || 'Orden Global Corp'),
    };
    e.reservas.push(r);
    return { detalle: `${r.id} · ${nombre} por ${usd(valor)} (aforo ${pct(haircut * 100, 0)})`, nivel: 'ok', creado: r.id };
  } };

  C['reserva.revaluar'] = { permiso: 'origen.reservas', run(e, d) {
    const r = oRes(e, d.id); const v = positivo(d.valorCertificado, 'Valor certificado');
    const antes = r.valorCertificado; r.valorCertificado = v;
    const s = respaldo(e);
    if (s.ratio < e.politica.ratioMinimo && v < antes) {
      // Se permite bajar (la verdad manda), pero queda marcado en rojo: el sistema se bloquea solo.
      return { detalle: `${r.id} revaluada de ${usd(antes)} a ${usd(v)} — el respaldo cae a ${pct(s.ratio)}`, nivel: 'bad' };
    }
    return { detalle: `${r.id} revaluada de ${usd(antes)} a ${usd(v)}`, nivel: 'info' };
  } };

  C['reserva.certificar'] = { permiso: 'origen.reservas', run(e, d, ctx) {
    const r = oRes(e, d.id);
    if (d.certificado) r.certificado = texto(d.certificado, 'Folio', 60);
    if (r.certificado === '—') throw new Error('Para certificar hace falta el folio del certificado del auditor');
    r.estado = 'certificada'; r.fechaCert = ctx.ahora.toISOString();
    r.vence = d.vence ? new Date(d.vence).toISOString() : new Date(ctx.ahora.getTime() + 365 * 86400000).toISOString();
    return { detalle: `${r.id} certificada y admitida al respaldo (${r.certificado}, vence ${r.vence.slice(0, 10)})`, nivel: 'ok' };
  } };

  C['reserva.revision'] = { permiso: 'origen.reservas', run(e, d) {
    const r = oRes(e, d.id); r.estado = 'en_revision';
    return { detalle: `${r.id} pasó a revisión: deja de computar al respaldo`, nivel: 'warn' };
  } };

  C['reserva.retirar'] = { permiso: 'origen.reservas', run(e, d) {
    const r = oRes(e, d.id); r.estado = 'retirada';
    const s = respaldo(e);
    return { detalle: `${r.id} retirada del respaldo (${usd(r.valorCertificado)}) · ratio ${Number.isFinite(s.ratio) ? pct(s.ratio) : '∞'}`, nivel: 'bad' };
  } };

  /* --- ORIGEN --- */
  C['origen.emitir'] = { permiso: 'origen.emitir', run(e, d) {
    const u = positivo(d.unidades, 'Unidades');
    const r = oRes(e, d.reservaId);
    if (valorAdmisible(r) <= 0) throw new Error('Esa reserva no computa al respaldo: no puede emitirse contra ella');
    if (e.politica.congelado) throw new Error('La emisión está congelada por el Consejo');
    const s = respaldo(e);
    const ratioDespues = (s.admisible / (s.emitido + u * s.valorUnidad)) * 100;
    if (ratioDespues < e.politica.ratioMinimo) throw new Error(`El ratio quedaría en ${pct(ratioDespues)}, bajo el mínimo de ${e.politica.ratioMinimo}%`);
    e.origen.emitido += u;
    return { detalle: `Se emitieron ${compacto(u)} ORIGEN (≈ ${usd(u * s.valorUnidad)}) contra ${r.id} · ratio ${pct(ratioDespues)}`, nivel: 'ok' };
  } };

  C['origen.quemar'] = { permiso: 'origen.emitir', run(e, d) {
    const u = positivo(d.unidades, 'Unidades'); const motivo = texto(d.motivo, 'Motivo', 200);
    const s = respaldo(e);
    if (u * s.valorUnidad > s.libre + 0.01) throw new Error(`Solo hay ${usd(s.libre)} de ORIGEN libre; el resto está comprometido en tokens ya emitidos`);
    e.origen.quemado += u;
    return { detalle: `Se quemaron ${compacto(u)} ORIGEN (≈ ${usd(u * s.valorUnidad)}) — ${motivo}`, nivel: 'warn' };
  } };

  /* --- solicitudes de emisión --- */
  C['solicitud.crear'] = { permiso: 'solicitud.crear', run(e, d, ctx) {
    const t = oToken(e, d.tokenId);
    const esSec = t.precioUnitario !== undefined;
    const tipo = esSec ? 'security' : 'utility';
    const cantidad = positivo(d.cantidad, 'Cantidad');
    const precio = positivo(d.precio, 'Precio');
    const motivo = texto(d.motivo, 'Justificación', 1000);
    const causa = String(d.causa || '');
    if (!CAUSAS[tipo].some((c) => c.v === causa)) throw new Error('La causa no está en el catálogo admitido');
    if (esSec && Math.abs(precio - t.precioUnitario) > 1e-9) throw new Error('El precio de una emisión es el precio establecido por el Comité; para cambiarlo hace falta una valuación');
    const origenRequerido = esSec ? cantidad * precio : cantidad * precio * t.redimible;
    if (!esSec && d.capacidadNueva) {
      const cap = positivo(d.capacidadNueva, 'Capacidad nueva');
      t.capacidad.comprometida += cap;
    }
    if (!esSec) {
      const s = saludUtility(t);
      if (s.circulante + t.supply.enTesoreria + (t.supply.autorizado - t.supply.emitido) + cantidad > t.supply.maximo) throw new Error(`Se superaría el techo duro de ${num(t.supply.maximo)} tokens`);
      if (s.circulante + cantidad > t.capacidad.comprometida) throw new Error(`No hay capacidad de servicio para ${num(cantidad)} tokens más (comprometida: ${num(t.capacidad.comprometida)})`);
    } else {
      const valorPost = (t.supply.emitido + (t.supply.autorizado - t.supply.emitido) + cantidad) * precio;
      if (valorPost > t.valuacion.valorCertificado + 0.01) throw new Error(`El valor autorizado (${usd(valorPost)}) superaría la valuación certificada (${usd(t.valuacion.valorCertificado)}). Hace falta una revaluación primero`);
    }
    const s = {
      id: ctx.id('SOL'), tipo, tokenId: t.id, simbolo: t.simbolo,
      accion: t.supply.emitido > 0 || t.supply.autorizado > 0 ? 'emision_adicional' : 'emision_inicial',
      cantidad, precio, origenRequerido, motivo, causa,
      evidencias: (Array.isArray(d.evidencias) ? d.evidencias : []).slice(0, 10).map((ev) => ({
        nombre: String(ev.nombre || '').slice(0, 120), hash: String(ev.hash || (ctx.hash || hashFnv)(String(ev.nombre) + ctx.ahora.getTime()).slice(0, 8)), tipo: String(ev.tipo || 'Adjunto').slice(0, 60),
      })),
      solicitante: ctx.actor, creada: ctx.ahora.toISOString(), estado: 'en_revision', firmas: [],
      firmasRequeridas: e.politica.firmasRequeridas,
      ventanaObjecionHasta: new Date(ctx.ahora.getTime() + e.politica.diasObjecion * 86400000).toISOString(),
      dictamen: null,
    };
    e.solicitudes.unshift(s);
    return { detalle: `${s.simbolo} · ${etiquetaAccion(s.accion)} de ${num(cantidad)} tokens (${usd(origenRequerido)} de ORIGEN)`, nivel: 'info', creado: s.id };
  } };

  C['solicitud.firmar'] = { permiso: 'solicitud.firmar', run(e, d, ctx) {
    const s = oSol(e, d.id);
    if (!['en_revision', 'objecion'].includes(s.estado)) throw new Error('La solicitud ya fue dictaminada');
    // En el servidor firma quien está en sesión; en el navegador (demostración) se elige a quién.
    const quien = ctx.firmar ? ctx.actor : texto(d.firmante || ctx.actor, 'Firmante', 80);
    if (!e.consejo.includes(quien)) throw new Error(`${quien} no forma parte del Consejo`);
    if (s.firmas.some((f) => f.quien === quien)) throw new Error('Ese consejero ya firmó');
    const f = { quien, ts: ctx.ahora.toISOString() };
    if (ctx.firmar) Object.assign(f, ctx.firmar(canonSolicitud(s)));
    s.firmas.push(f);
    return { detalle: `${quien} firmó ${s.id} (${s.firmas.length}/${s.firmasRequeridas})`, nivel: 'info' };
  } };

  C['solicitud.aprobar'] = { permiso: 'solicitud.dictaminar', run(e, d, ctx) {
    const s = oSol(e, d.id);
    if (!['en_revision', 'objecion'].includes(s.estado)) throw new Error('La solicitud ya fue dictaminada');
    if (s.firmas.length < s.firmasRequeridas) throw new Error(`Faltan firmas: ${s.firmas.length}/${s.firmasRequeridas}`);
    const ch = puedeEmitir(e, s.origenRequerido, ctx.ahora);
    if (!ch.ok) throw new Error(ch.faltas.join(' '));
    const t = oToken(e, s.tokenId);
    s.estado = 'aprobada'; s.resuelta = ctx.ahora.toISOString(); s.dictamen = 'Respaldo verificado. Emisión autorizada.'; s.dictaminadaPor = ctx.actor;
    e.asignaciones.push({ id: ctx.id('ASG'), tokenId: s.tokenId, solicitudId: s.id, monto: s.origenRequerido, estado: 'comprometida', fecha: ctx.ahora.toISOString() });
    t.origenAsignado += s.origenRequerido;
    t.supply.autorizado = (t.supply.autorizado || 0) + s.cantidad;
    if (t.estado === 'borrador') t.estado = 'en_registro';
    return { detalle: `${s.simbolo} · ${etiquetaAccion(s.accion)} aprobada — se comprometen ${usd(s.origenRequerido)} de ORIGEN`, nivel: 'ok' };
  } };

  C['solicitud.rechazar'] = { permiso: 'solicitud.dictaminar', run(e, d, ctx) {
    const s = oSol(e, d.id); const motivo = texto(d.motivo, 'Motivo', 500);
    if (!['en_revision', 'objecion'].includes(s.estado)) throw new Error('La solicitud ya fue dictaminada');
    s.estado = 'rechazada'; s.resuelta = ctx.ahora.toISOString(); s.dictamen = motivo; s.dictaminadaPor = ctx.actor;
    return { detalle: `${s.simbolo} · ${etiquetaAccion(s.accion)} rechazada — ${motivo}`, nivel: 'bad' };
  } };

  C['solicitud.objetar'] = { permiso: 'solicitud.firmar', run(e, d, ctx) {
    const s = oSol(e, d.id); const motivo = texto(d.motivo, 'Objeción', 500);
    if (s.estado !== 'en_revision') throw new Error('Solo puede objetarse una solicitud en revisión');
    s.estado = 'objecion'; s.dictamen = motivo; s.objetadaPor = ctx.actor;
    return { detalle: `${s.simbolo} · objeción registrada — ${motivo}`, nivel: 'warn' };
  } };

  /* --- tokens: emisión y quema (comunes) --- */
  C['token.emitir'] = { permiso: 'tesoreria.operar', run(e, d) {
    const t = oToken(e, d.tokenId); const cantidad = positivo(d.cantidad, 'Cantidad');
    const cabecera = t.supply.autorizado - t.supply.emitido;
    if (cantidad > cabecera) throw new Error(`Solo hay ${num(cabecera)} tokens autorizados sin emitir`);
    // Segundo candado: ni con cabecera se emite por encima del respaldo, la valuación o la capacidad.
    const precio = t.precioUnitario !== undefined ? t.precioUnitario : t.precioAncla;
    const porcion = t.redimible !== undefined ? t.redimible : 1;
    if ((t.supply.emitido + cantidad) * precio * porcion > t.origenAsignado + 0.01) {
      throw new Error(`El ORIGEN asignado (${usd(t.origenAsignado)}) solo respalda hasta ${num(Math.floor(t.origenAsignado / (precio * porcion)))} tokens`);
    }
    if (t.valuacion && (t.supply.emitido + cantidad) * precio > t.valuacion.valorCertificado + 0.01) throw new Error(`Se superaría la valuación certificada de ${usd(t.valuacion.valorCertificado)}`);
    if (t.capacidad && (t.supply.emitido + cantidad) - t.supply.quemado - t.supply.enTesoreria > t.capacidad.comprometida) {
      throw new Error(`No hay capacidad de servicio para tantos tokens (${num(t.capacidad.comprometida)} ${t.capacidad.unidad})`);
    }
    t.supply.emitido += cantidad;
    t.supply.enTesoreria = (t.supply.enTesoreria || 0) + cantidad;
    if (t.estado === 'en_registro' || t.estado === 'borrador') t.estado = 'listado';
    return { detalle: `${t.simbolo} · se emitieron ${num(cantidad)} tokens contra respaldo autorizado`, nivel: 'ok' };
  } };

  C['token.quemar'] = { permiso: 'tesoreria.operar', run(e, d) {
    const t = oToken(e, d.tokenId); const cantidad = positivo(d.cantidad, 'Cantidad'); const motivo = texto(d.motivo, 'Motivo', 200);
    const vivos = t.supply.emitido - t.supply.quemado;
    if (cantidad > vivos) throw new Error(`Solo hay ${num(vivos)} tokens vivos`);
    t.supply.quemado += cantidad;
    // Lo quemado sale primero de la tesorería del emisor, luego del circulante.
    const deTesoreria = Math.min(cantidad, t.supply.enTesoreria || 0);
    t.supply.enTesoreria = (t.supply.enTesoreria || 0) - deTesoreria;
    const liberado = cantidad * (t.precioUnitario !== undefined ? t.precioUnitario : t.precioAncla) * (t.redimible !== undefined ? t.redimible : 1);
    t.origenAsignado = Math.max(0, t.origenAsignado - liberado);
    let resto = liberado;
    for (const a of e.asignaciones.filter((x) => x.tokenId === t.id && x.estado === 'comprometida')) {
      if (resto <= 0) break;
      const baja = Math.min(a.monto, resto); a.monto -= baja; resto -= baja;
      if (a.monto <= 0.01) a.estado = 'liberada';
    }
    return { detalle: `${t.simbolo} · se quemaron ${num(cantidad)} tokens (${usd(liberado)} de ORIGEN liberados) — ${motivo}`, nivel: 'warn' };
  } };

  /* --- security --- */
  const TIPOS_SEC = { equity: 'Capital accionario', deuda: 'Instrumento de deuda', asset_backed: 'Respaldado por activos', revenue_share: 'Participación en ingresos' };

  C['security.registrar'] = { permiso: 'tesoreria.operar', run(e, d, ctx) {
    const s = texto(d.simbolo, 'Símbolo', 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s) throw new Error('Símbolo inválido');
    if (buscar.token(e, 'SEC-' + s) || buscar.token(e, 'UTL-' + s)) throw new Error(`Ya existe ${s}`);
    const n = texto(d.nombre, 'Nombre', 80);
    const v = positivo(d.valorCertificado, 'Valuación'); const p = positivo(d.precioUnitario, 'Precio');
    if (!TIPOS_SEC[d.tipo]) throw new Error('Tipo de instrumento inválido');
    if (!buscar.emisor(e, d.emisorId)) throw new Error('Emisor no registrado');
    const ahora = ctx.ahora.toISOString();
    const t = {
      id: 'SEC-' + s, simbolo: s, nombre: n, emisorId: d.emisorId, tipo: d.tipo,
      jurisdiccion: String(d.jurisdiccion || '—').slice(0, 60), exencion: String(d.exencion || 'Oferta privada').slice(0, 80),
      isin: '—', cadena: 'Orden Global Chain (5550)', contrato: /^0x[0-9a-fA-F]{40}$/.test(String(d.contrato || '')) ? d.contrato : null,
      activo: { descripcion: String(d.activo || '—').slice(0, 500), clase: TIPOS_SEC[d.tipo], ubicacion: '—', reservas: [] },
      valuacion: { metodo: String(d.metodo || 'Por definir').slice(0, 120), valorCertificado: v, valuador: String(d.valuador || '—').slice(0, 80), fecha: ahora,
        proximaRevision: new Date(ctx.ahora.getTime() + e.politica.revisionValuacionMeses * 30 * 86400000).toISOString(),
        informeHash: (ctx.hash || hashFnv)(s + v).slice(0, 8), comite: [], historial: [{ fecha: ahora, valor: v, precio: p }] },
      precioUnitario: p, moneda: 'USD',
      supply: { autorizado: 0, emitido: 0, enTesoreria: 0, quemado: 0 },
      tenedores: 0, lockupHasta: new Date(ctx.ahora.getTime() + 365 * 86400000).toISOString(),
      dividendo: { politica: String(d.dividendo || 'Por definir').slice(0, 200), ultimoPago: null, montoUltimo: 0, yield: 0 },
      mercado: { estado: 'suspendido', banda: e.politica.bandaSecundario, referencia: p, ultimaOperacion: null, volumen30d: 0, ventanas: 'Sin listar', proximaVentana: null },
      cumplimiento: { kyc: true, acreditados: true, transferAgent: 'Orden Global Transfer Agent', restricciones: 'Pendiente de autorización de emisión.', reportes: [] },
      origenAsignado: 0, estado: 'borrador', creado: ahora,
    };
    e.securities.push(t);
    return { detalle: `${s} · ${n} registrado con valuación de ${usd(v)}`, nivel: 'ok', creado: t.id };
  } };

  C['valuacion.asentar'] = { permiso: 'tesoreria.operar', run(e, d, ctx) {
    const t = oSec(e, d.tokenId);
    const v = positivo(d.valorCertificado, 'Valor certificado'); const p = positivo(d.precioUnitario, 'Precio');
    const firmas = (Array.isArray(d.firmas) ? d.firmas : []).map(String).filter((x) => e.consejo.includes(x));
    if (firmas.length < 3) throw new Error('El Comité de Valuación necesita al menos 3 firmas de consejeros');
    if (t.supply.emitido * p > v + 0.01) throw new Error(`Con precio ${num(p, 2)} el valor emitido (${usd(t.supply.emitido * p)}) superaría la valuación. Baja el precio o sube el valor`);
    if (t.supply.emitido * p > t.origenAsignado + 0.01) throw new Error(`Subir el precio a ${num(p, 2)} dejaría el valor emitido por encima del ORIGEN asignado (${usd(t.origenAsignado)}). Pide primero la asignación`);
    t.valuacion.valorCertificado = v;
    if (d.metodo) t.valuacion.metodo = String(d.metodo).slice(0, 120);
    if (d.valuador) t.valuacion.valuador = String(d.valuador).slice(0, 80);
    if (d.informe) t.valuacion.informeHash = String(d.informe).slice(0, 40);
    t.valuacion.fecha = ctx.ahora.toISOString();
    t.valuacion.proximaRevision = new Date(ctx.ahora.getTime() + e.politica.revisionValuacionMeses * 30 * 86400000).toISOString();
    t.valuacion.comite = firmas;
    t.valuacion.historial.push({ fecha: ctx.ahora.toISOString(), valor: v, precio: p });
    t.precioUnitario = p; t.mercado.referencia = p;
    return { detalle: `${t.simbolo} revaluado a ${usd(v)} — precio ${num(p, 2)} USD (${firmas.length} firmas del Comité)`, nivel: 'ok' };
  } };

  C['mercado.regimen'] = { permiso: 'tesoreria.operar', run(e, d) {
    const t = oSec(e, d.tokenId);
    if (!['abierto', 'ventana', 'suspendido'].includes(d.estado)) throw new Error('Régimen inválido');
    const banda = esNum(d.banda) ? Math.min(0.5, Math.max(0, d.banda)) : t.mercado.banda;
    if (esNum(d.referencia) && Math.abs(d.referencia - t.precioUnitario) > 1e-9) throw new Error('El precio de referencia debe coincidir con el precio certificado; se cambia con una valuación');
    t.mercado.estado = d.estado; t.mercado.banda = banda;
    if (d.ventanas !== undefined) t.mercado.ventanas = String(d.ventanas).slice(0, 120);
    if (d.estado === 'suspendido' && t.estado === 'listado') t.estado = 'suspendido';
    if (d.estado !== 'suspendido' && t.estado === 'suspendido') t.estado = 'listado';
    return { detalle: `${t.simbolo} · régimen de mercado → ${d.estado} (banda ±${pct(banda * 100, 1)})`, nivel: d.estado === 'suspendido' ? 'warn' : 'info' };
  } };

  C['orden.colocar'] = { permiso: 'tesoreria.operar', run(e, d, ctx) {
    const t = oSec(e, d.tokenId);
    if (t.mercado.estado === 'suspendido') throw new Error('Mercado suspendido: no se admiten órdenes');
    if (!['compra', 'venta'].includes(d.lado)) throw new Error('Lado inválido');
    const q = positivo(d.cantidad, 'Cantidad'); const p = positivo(d.precio, 'Precio');
    const min = t.mercado.referencia * (1 - t.mercado.banda), max = t.mercado.referencia * (1 + t.mercado.banda);
    if (p < min - 1e-9 || p > max + 1e-9) throw new Error(`Precio fuera de banda: admitido ${num(min, 2)} – ${num(max, 2)}`);
    e.ordenes.unshift({ id: ctx.id('ORD'), tokenId: t.id, lado: d.lado, cantidad: q, precio: p, estado: 'abierta', ts: ctx.ahora.toISOString(), por: ctx.actor });
    return { detalle: `${t.simbolo} · ${d.lado} de ${num(q)} @ ${num(p, 2)}`, nivel: 'info' };
  } };

  C['mercado.cruzar'] = { permiso: 'tesoreria.operar', run(e, d) {
    const t = oSec(e, d.tokenId);
    const abiertas = e.ordenes.filter((o) => o.tokenId === t.id && o.estado === 'abierta');
    const c = abiertas.filter((o) => o.lado === 'compra').sort((a, b) => b.precio - a.precio)[0];
    const v = abiertas.filter((o) => o.lado === 'venta').sort((a, b) => a.precio - b.precio)[0];
    if (!c || !v || c.precio < v.precio) throw new Error('No hay cruce posible');
    const q = Math.min(c.cantidad, v.cantidad); const px = (c.precio + v.precio) / 2;
    c.cantidad -= q; v.cantidad -= q;
    if (c.cantidad <= 0) c.estado = 'ejecutada';
    if (v.cantidad <= 0) v.estado = 'ejecutada';
    t.mercado.ultimaOperacion = px; t.mercado.volumen30d += q * px;
    return { detalle: `${t.simbolo} · ${num(q)} cruzados @ ${num(px, 2)}`, nivel: 'ok' };
  } };

  C['token.transferir'] = { permiso: 'tesoreria.operar', run(e, d, ctx) {
    const t = oSec(e, d.tokenId); const q = positivo(d.cantidad, 'Cantidad');
    const de = e.tenedores.find((x) => x.id === d.de && x.tokenId === t.id);
    const a = e.tenedores.find((x) => x.id === d.a && x.tokenId === t.id);
    if (!de || !a || de === a) throw new Error('Selecciona dos tenedores distintos del mismo token');
    if (q > de.cantidad) throw new Error(`${de.nombre} tiene ${num(de.cantidad)} tokens`);
    if (de.lockup && new Date(de.lockup) > ctx.ahora) throw new Error(`${de.nombre} está en lock-up hasta ${de.lockup.slice(0, 10)}`);
    if (a.estado !== 'verificado') throw new Error('El destinatario no tiene Genesis ID verificado');
    de.cantidad -= q; a.cantidad += q;
    return { detalle: `${t.simbolo} · ${num(q)} transferidos de ${de.nombre} a ${a.nombre}`, nivel: 'info' };
  } };

  C['distribucion.registrar'] = { permiso: 'tesoreria.operar', run(e, d, ctx) {
    const t = oSec(e, d.tokenId); const m = positivo(d.monto, 'Monto');
    const porToken = m / Math.max(t.supply.emitido - t.supply.quemado, 1);
    t.dividendo.ultimoPago = ctx.ahora.toISOString(); t.dividendo.montoUltimo = m;
    if (d.concepto) t.dividendo.ultimoConcepto = String(d.concepto).slice(0, 120);
    return { detalle: `${t.simbolo} · ${usd(m)} distribuidos (${num(porToken, 4)} USD por token)`, nivel: 'ok' };
  } };

  C['reporte.presentar'] = { permiso: 'tesoreria.operar', run(e, d, ctx) {
    const t = oSec(e, d.tokenId);
    const r = (t.cumplimiento.reportes || []).find((x) => x.periodo === d.periodo);
    if (!r) throw new Error('Reporte no encontrado');
    r.estado = 'al_corriente'; r.fecha = ctx.ahora.toISOString(); r.presentadoPor = ctx.actor;
    return { detalle: `${t.simbolo} · ${r.tipo} ${r.periodo} presentado ante el registro`, nivel: 'ok' };
  } };

  /* --- utility --- */
  C['utility.registrar'] = { permiso: 'tesoreria.operar', run(e, d, ctx) {
    const s = texto(d.simbolo, 'Símbolo', 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s) throw new Error('Símbolo inválido');
    if (buscar.token(e, 'SEC-' + s) || buscar.token(e, 'UTL-' + s)) throw new Error(`Ya existe ${s}`);
    const n = texto(d.nombre, 'Nombre', 80); const p = positivo(d.precioAncla, 'Precio ancla'); const mx = positivo(d.maximo, 'Techo duro');
    const redimible = Math.min(1, Math.max(0, Number(d.redimible) || 0));
    const t = {
      id: 'UTL-' + s, simbolo: s, nombre: n, servicio: String(d.servicio || '—').slice(0, 200), unidadServicio: String(d.unidadServicio || '—').slice(0, 120),
      emisorId: d.emisorId && buscar.emisor(e, d.emisorId) ? d.emisorId : 'EM-OG', cadena: 'Orden Global Chain (5550)',
      contrato: /^0x[0-9a-fA-F]{40}$/.test(String(d.contrato || '')) ? d.contrato : null,
      precioAncla: p, moneda: 'USD', redimible,
      supply: { maximo: mx, autorizado: 0, emitido: 0, enTesoreria: 0, quemado: 0 },
      capacidad: { comprometida: Math.max(0, Number(d.capacidad) || 0), unidad: String(d.unidadCapacidad || 'unidades de servicio').slice(0, 60), proveedor: 'Por definir', contrato: '—', vigencia: new Date(ctx.ahora.getTime() + 365 * 86400000).toISOString() },
      grifos: [], sumideros: [], consumo30d: 0, quema30d: 0, origenAsignado: 0, estado: 'borrador', creado: ctx.ahora.toISOString(), vesting: [],
    };
    e.utilities.push(t);
    return { detalle: `${s} · ${n} registrado con ancla de ${num(p, 2)} USD`, nivel: 'ok', creado: t.id };
  } };

  C['capacidad.actualizar'] = { permiso: 'tesoreria.operar', run(e, d) {
    const t = oUtl(e, d.tokenId); const c = Math.max(0, Number(d.comprometida) || 0);
    const s = saludUtility(t);
    if (c < s.circulante) throw new Error(`Hay ${num(s.circulante)} tokens en circulación; reducir la capacidad por debajo dejaría tokens sin servicio. Primero hay que quemarlos`);
    const antes = t.capacidad.comprometida;
    t.capacidad.comprometida = c;
    if (d.proveedor) t.capacidad.proveedor = String(d.proveedor).slice(0, 120);
    if (d.contrato) t.capacidad.contrato = String(d.contrato).slice(0, 60);
    if (d.unidad) t.capacidad.unidad = String(d.unidad).slice(0, 60);
    if (d.vigencia) t.capacidad.vigencia = new Date(d.vigencia).toISOString();
    return { detalle: `${t.simbolo} · capacidad ${num(antes)} → ${num(c)} ${t.capacidad.unidad}`, nivel: c >= antes ? 'ok' : 'warn' };
  } };

  C['utility.parametros'] = { permiso: 'tesoreria.operar', run(e, d) {
    const t = oUtl(e, d.tokenId); const p = positivo(d.precioAncla, 'Precio ancla');
    const r = Math.min(1, Math.max(0, Number(d.redimible)));
    if (!esNum(r)) throw new Error('Porción redimible inválida');
    const s = saludUtility(t); const pasivo = s.circulante * p * r;
    if (pasivo > t.origenAsignado + 0.01) throw new Error(`Con esos parámetros el pasivo redimible sería ${usd(pasivo)} y solo hay ${usd(t.origenAsignado)} de ORIGEN asignado`);
    t.precioAncla = p; t.redimible = r;
    if (d.unidadServicio) t.unidadServicio = String(d.unidadServicio).slice(0, 120);
    return { detalle: `${t.simbolo} · ancla ${num(p, 2)} USD, redimible ${pct(r * 100, 0)}`, nivel: 'warn' };
  } };

  C['utility.telemetria'] = { permiso: 'tesoreria.operar', run(e, d) {
    const t = oUtl(e, d.tokenId);
    const c = Math.max(0, Number(d.consumo30d) || 0), q = Math.max(0, Number(d.quema30d) || 0);
    t.consumo30d = c; t.quema30d = q;
    let extra = '';
    if (d.aplicar && q > 0) {
      const r = C['token.quemar'].run(e, { tokenId: t.id, cantidad: q, motivo: 'Quema por consumo del periodo' });
      extra = ' · ' + r.detalle;
    }
    return { detalle: `${t.simbolo} · ${num(c)} consumidos y ${num(q)} quemados en 30 días${extra}`, nivel: 'info' };
  } };

  /* ---------------- ejecución ---------------- */

  /**
   * Ejecuta un comando sobre el estado y asienta el resultado en el libro.
   * Si el comando lanza, el estado NO cambia (se trabaja sobre una copia).
   * Devuelve { estado, evento, resultado }.
   */
  function ejecutar(estado, nombre, datos, ctx) {
    const cmd = C[nombre];
    if (!cmd) throw new Error(`Comando desconocido: ${nombre}`);
    const c = Object.assign({ actor: 'Sistema', rol: 'presidente', ahora: new Date(), id: idAzar, hash: hashFnv }, ctx || {});
    if (!puede(c.rol, cmd.permiso)) {
      const err = new Error(`El rol "${c.rol}" no tiene el permiso "${cmd.permiso}"`); err.codigo = 403; throw err;
    }
    const copia = clon(estado);
    const resultado = cmd.run(copia, datos || {}, c);
    const evento = asentar(copia, { tipo: nombre, detalle: resultado.detalle, nivel: resultado.nivel || 'info', actor: c.actor, rol: c.rol, ahora: c.ahora }, c.hash);
    return { estado: copia, evento, resultado };
  }

  /** Añade un asiento encadenado. `hashFn(texto) → hex`. */
  function asentar(estado, ev, hashFn) {
    const h = hashFn || hashFnv;
    const prev = estado.libro.length ? estado.libro[0].hash : 'GENESIS';
    const asiento = {
      id: 'EV-' + h(ev.tipo + ev.detalle + ev.ahora.toISOString() + prev).slice(0, 10),
      ts: ev.ahora.toISOString(), actor: ev.actor, rol: ev.rol, tipo: ev.tipo, detalle: ev.detalle, nivel: ev.nivel, hashPrev: prev,
    };
    asiento.hash = h(cuerpoAsiento(asiento, prev));
    estado.libro.unshift(asiento);
    if (estado.libro.length > 2000) estado.libro.length = 2000;
    return asiento;
  }
  const cuerpoAsiento = (a, prev) => a.id + a.ts + a.actor + a.tipo + a.detalle + prev;

  /** Re-encadena un libro entero (del más viejo al más nuevo). Para semillas. */
  function sellarLibro(estado, hashFn) {
    const h = hashFn || hashFnv; const l = estado.libro;
    for (let i = l.length - 1; i >= 0; i--) {
      const prev = i + 1 < l.length ? l[i + 1].hash : 'GENESIS';
      l[i].hashPrev = prev; l[i].hash = h(cuerpoAsiento(l[i], prev));
    }
  }

  function verificarLibro(estado, hashFn) {
    const h = hashFn || hashFnv; const l = estado.libro;
    for (let i = 0; i < l.length; i++) {
      const prev = i + 1 < l.length ? l[i + 1].hash : 'GENESIS';
      if (l[i].hashPrev !== prev || l[i].hash !== h(cuerpoAsiento(l[i], prev))) return { ok: false, en: l[i].id, indice: i };
    }
    return { ok: true, total: l.length, sello: l.length ? l[0].hash : 'GENESIS' };
  }

  /** Alertas globales del sistema (las que van arriba del panel de la Autoridad). */
  function avisos(estado, ahora) {
    const hoy = ahora || new Date();
    const r = respaldo(estado, hoy); const av = [];
    if (r.congelado) av.push(['bad', 'Emisión congelada', 'El Consejo activó el freno de emergencia. Ninguna solicitud puede aprobarse hasta levantarlo.']);
    if (r.ratio < estado.politica.ratioMinimo) av.push(['bad', 'Ratio bajo el mínimo', `El respaldo está en ${pct(r.ratio)}. Hay que sumar reservas o quemar ORIGEN antes de cualquier emisión.`]);
    else if (r.ratio < estado.politica.ratioObjetivo) av.push(['warn', 'Ratio bajo el objetivo', `El respaldo está en ${pct(r.ratio)}, debajo del objetivo de ${estado.politica.ratioObjetivo}%.`]);
    if (r.libreTrasCola < 0) av.push(['warn', 'La cola excede el ORIGEN libre', `Las solicitudes pendientes piden ${usd(r.enCola)} y solo hay ${usd(r.libre)} libres. No todas pueden aprobarse.`]);
    const venc = estado.reservas.filter((x) => x.estado === 'certificada' && x.vence && new Date(x.vence) < hoy);
    if (venc.length) av.push(['warn', 'Certificados vencidos', `${venc.length} reserva(s) dejaron de computar: ${venc.map((v) => v.id).join(', ')}.`]);
    const porVencer = estado.reservas.filter((x) => x.estado === 'certificada' && x.vence && new Date(x.vence) > hoy && new Date(x.vence) - hoy < 60 * 86400000);
    if (porVencer.length) av.push(['warn', 'Certificados por vencer', `${porVencer.length} reserva(s) vencen en menos de 60 días.`]);
    const oroViejo = estado.politica.oroFecha && (hoy - new Date(estado.politica.oroFecha)) > 30 * 86400000;
    if (oroViejo) av.push(['warn', 'Precio del oro desactualizado', `La referencia (${num(estado.politica.oroUsdPorGramo, 2)} USD/g) tiene más de 30 días.`]);
    if (!av.length) av.push(['ok', 'Sistema en regla', 'Todo el ORIGEN en circulación tiene respaldo certificado vigente.']);
    return av;
  }

  return {
    ACCIONES, etiquetaAccion, CAUSAS, PERMISOS, ROLES, puede, TIPOS_SEC,
    valorUnidad, valorAdmisible, reservasAdmisibles, respaldo, puedeEmitir, saludSecurity, saludUtility, avisos,
    buscar, comandos: C, nombresComandos: Object.keys(C), ejecutar, asentar, sellarLibro, verificarLibro, canonSolicitud,
    hashFnv, idAzar, clon, fmt: { num, compacto, usd, pct },
  };
});
