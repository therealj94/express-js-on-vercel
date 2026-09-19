/* ============================================================
   Orden Global · Tesorería — núcleo compartido
   Estado, reglas de respaldo, libro sellado y utilidades de UI.
   Las tres plataformas (security / utility / origen) comparten
   este estado: lo que se aprueba en ORIGEN se ve en las otras dos.
   ============================================================ */
(function (global) {
  'use strict';

  const LLAVE = 'og.tesoreria.v1';

  /* ---------------- formato ---------------- */
  const fmt = {
    num(n, d = 0) {
      if (n === null || n === undefined || Number.isNaN(n)) return '—';
      return Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    dinero(n, mon = 'USD', d = 2) {
      if (n === null || n === undefined || Number.isNaN(n)) return '—';
      const s = Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
      return (mon === 'USD' ? '$' : mon === 'MXN' ? 'MX$' : '') + s + (mon === 'USD' ? '' : '');
    },
    compacto(n) {
      const a = Math.abs(Number(n) || 0);
      if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, '') + ' MM';
      if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, '') + ' M';
      if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + ' k';
      return fmt.num(n);
    },
    dineroCorto(n, mon = 'USD') { return (mon === 'USD' ? '$' : 'MX$') + fmt.compacto(n); },
    pct(n, d = 2) {
      if (n === null || n === undefined || Number.isNaN(n)) return '—';
      return Number(n).toFixed(d) + '%';
    },
    fecha(iso) {
      if (!iso) return '—';
      const f = new Date(iso);
      return f.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    },
    fechaHora(iso) {
      if (!iso) return '—';
      const f = new Date(iso);
      return f.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    },
    relativo(iso) {
      if (!iso) return '—';
      const ms = new Date(iso) - Date.now();
      const dias = Math.round(ms / 86400000);
      if (Math.abs(dias) >= 1) return dias > 0 ? `en ${dias} d` : `hace ${-dias} d`;
      const hrs = Math.round(ms / 3600000);
      if (Math.abs(hrs) >= 1) return hrs > 0 ? `en ${hrs} h` : `hace ${-hrs} h`;
      const min = Math.round(ms / 60000);
      return min > 0 ? `en ${min} min` : `hace ${Math.max(0, -min)} min`;
    },
  };

  /* ---------------- sello del libro (cadena de hashes) ---------------- */
  function hash(txt) {
    // FNV-1a de 64 bits simulado con dos palabras de 32 — suficiente para
    // encadenar el libro en el front. El backend firmará con SHA-256.
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < txt.length; i++) {
      const c = txt.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (h2 + Math.imul(c, 0x85ebca6b)) >>> 0; h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
    }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).toUpperCase();
  }

  const id = (pre) => pre + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

  /* ---------------- estado ---------------- */
  let estado = null;
  const oyentes = [];

  function cargar() {
    let crudo = null;
    try { crudo = localStorage.getItem(LLAVE); } catch (e) { crudo = null; }
    if (crudo) {
      try {
        const d = JSON.parse(crudo);
        if (d && d.version === global.TesoreriaSemilla.version) { estado = d; return estado; }
      } catch (e) { /* semilla nueva */ }
    }
    estado = JSON.parse(JSON.stringify(global.TesoreriaSemilla.estado));
    sellarLibro();
    guardar();
    return estado;
  }

  /** Encadena el libro de la semilla (del más viejo al más nuevo). */
  function sellarLibro() {
    const l = estado.libro;
    for (let i = l.length - 1; i >= 0; i--) {
      const prev = i + 1 < l.length ? l[i + 1].hash : 'GENESIS';
      l[i].hashPrev = prev;
      l[i].hash = hash(l[i].id + l[i].ts + l[i].actor + l[i].tipo + l[i].detalle + prev);
    }
  }

  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify(estado)); } catch (e) { /* modo privado: solo memoria */ }
  }

  function reiniciar() {
    try { localStorage.removeItem(LLAVE); } catch (e) {}
    estado = JSON.parse(JSON.stringify(global.TesoreriaSemilla.estado));
    guardar(); emitir();
  }

  function suscribir(fn) { oyentes.push(fn); return () => { const i = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1); }; }
  function emitir() { oyentes.forEach((f) => { try { f(estado); } catch (e) { console.error(e); } }); }

  /** Toda mutación pasa por aquí: se aplica, se asienta en el libro y se sella. */
  function accion(tipo, detalle, mutador, nivel) {
    const antes = JSON.parse(JSON.stringify(estado));
    try { mutador(estado); }
    catch (e) { estado = antes; throw e; }
    asentar(tipo, detalle, nivel || 'info');
    guardar(); emitir();
  }

  function asentar(tipo, detalle, nivel) {
    const prev = estado.libro.length ? estado.libro[0].hash : 'GENESIS';
    const ev = {
      id: id('EV'), ts: new Date().toISOString(), actor: estado.sesion.usuario,
      rol: estado.sesion.rol, tipo, detalle, nivel: nivel || 'info', hashPrev: prev,
    };
    ev.hash = hash(ev.id + ev.ts + ev.actor + ev.tipo + ev.detalle + prev);
    estado.libro.unshift(ev);
    if (estado.libro.length > 400) estado.libro.length = 400;
    return ev;
  }

  function verificarLibro() {
    const l = estado.libro;
    for (let i = 0; i < l.length; i++) {
      const prev = i + 1 < l.length ? l[i + 1].hash : 'GENESIS';
      const esperado = hash(l[i].id + l[i].ts + l[i].actor + l[i].tipo + l[i].detalle + prev);
      if (l[i].hashPrev !== prev || l[i].hash !== esperado) return { ok: false, en: l[i].id, indice: i };
    }
    return { ok: true, total: l.length };
  }

  /* ---------------- reglas de respaldo (el corazón) ---------------- */

  /** Valor admisible de una reserva = valor certificado menos el aforo (haircut). */
  function valorAdmisible(r) {
    if (r.estado !== 'certificada') return 0;
    if (r.vence && new Date(r.vence) < new Date()) return 0; // certificado vencido no respalda
    return r.valorCertificado * (1 - r.haircut);
  }

  function reservasAdmisibles() {
    return estado.reservas.reduce((s, r) => s + valorAdmisible(r), 0);
  }

  /** Fotografía completa del respaldo. Toda decisión de emisión se toma con esto. */
  function respaldo() {
    const admisible = reservasAdmisibles();
    const emitido = estado.origen.emitido - estado.origen.quemado;
    const comprometido = estado.asignaciones
      .filter((a) => a.estado === 'comprometida')
      .reduce((s, a) => s + a.monto, 0);
    const libre = emitido - comprometido;
    const enCola = estado.solicitudes
      .filter((s) => ['en_revision', 'objecion'].includes(s.estado))
      .reduce((s, x) => s + x.origenRequerido, 0);
    const ratio = emitido > 0 ? (admisible / emitido) * 100 : Infinity;
    const holgura = admisible - emitido;
    return {
      admisible, emitido, comprometido, libre, enCola, ratio, holgura,
      libreTrasCola: libre - enCola,
      salud: ratio === Infinity ? 'ok' : ratio >= estado.politica.ratioObjetivo ? 'ok'
        : ratio >= estado.politica.ratioMinimo ? 'warn' : 'bad',
      congelado: estado.politica.congelado,
    };
  }

  /** ¿Puede aprobarse una emisión por `monto` de ORIGEN? Devuelve motivos. */
  function puedeEmitir(monto) {
    const r = respaldo();
    const faltas = [];
    if (r.congelado) faltas.push('La emisión global está congelada por el Consejo.');
    if (monto > r.libre) faltas.push(`Solo hay ${fmt.dineroCorto(r.libre)} de ORIGEN libre; se piden ${fmt.dineroCorto(monto)}.`);
    const ratioDespues = r.emitido > 0 ? (r.admisible / r.emitido) * 100 : Infinity;
    if (ratioDespues < estado.politica.ratioMinimo) faltas.push(`El ratio de respaldo quedaría en ${fmt.pct(ratioDespues)}, bajo el mínimo de ${estado.politica.ratioMinimo}%.`);
    return { ok: faltas.length === 0, faltas, respaldo: r };
  }

  /* ----- invariantes por token ----- */

  /** Security: valor emitido ≤ valuación certificada y ≤ ORIGEN asignado. */
  function saludSecurity(t) {
    const valorEmitido = t.supply.emitido * t.precioUnitario;
    const cobertura = valorEmitido > 0 ? (t.valuacion.valorCertificado / valorEmitido) * 100 : Infinity;
    const cabecera = t.supply.autorizado - t.supply.emitido;
    const origenOk = t.origenAsignado >= valorEmitido;
    const valVence = t.valuacion.proximaRevision && new Date(t.valuacion.proximaRevision) < new Date();
    const alertas = [];
    if (!origenOk) alertas.push('Valor emitido por encima del ORIGEN asignado');
    if (cobertura < 100) alertas.push('Valor emitido por encima de la valuación certificada');
    if (valVence) alertas.push('Valuación vencida: requiere revisión del Comité');
    const reportesVencidos = (t.cumplimiento.reportes || []).filter((r) => r.estado === 'vencido').length;
    if (reportesVencidos) alertas.push(`${reportesVencidos} reporte(s) periódico(s) vencido(s)`);
    return {
      valorEmitido, cobertura, cabecera, origenOk, valVence, alertas,
      salud: alertas.length === 0 ? 'ok' : (!origenOk || cobertura < 100) ? 'bad' : 'warn',
    };
  }

  /** Utility: circulante ≤ capacidad de servicio y la porción redimible ≤ ORIGEN asignado. */
  function saludUtility(t) {
    const circulante = t.supply.emitido - t.supply.quemado - t.supply.enTesoreria;
    const capacidadCubre = t.capacidad.comprometida; // en unidades de servicio
    const ratioUtilidad = circulante > 0 ? (capacidadCubre / circulante) * 100 : Infinity;
    const pasivoRedimible = circulante * t.precioAncla * t.redimible;
    const origenOk = t.origenAsignado >= pasivoRedimible;
    const alertas = [];
    if (ratioUtilidad < 100) alertas.push('Circulante por encima de la capacidad de servicio comprometida');
    if (!origenOk) alertas.push('Pasivo redimible por encima del ORIGEN asignado');
    if (t.quema30d > 0 && t.consumo30d / Math.max(t.quema30d, 1) < 0.5) alertas.push('Consumo real muy por debajo de la emisión: revisar grifos');
    return {
      circulante, ratioUtilidad, pasivoRedimible, origenOk, alertas,
      salud: alertas.length === 0 ? 'ok' : !origenOk || ratioUtilidad < 100 ? 'bad' : 'warn',
    };
  }

  /* ---------------- consultas ---------------- */
  const buscar = {
    security: (i) => estado.securities.find((t) => t.id === i),
    utility: (i) => estado.utilities.find((t) => t.id === i),
    token: (i) => estado.securities.find((t) => t.id === i) || estado.utilities.find((t) => t.id === i),
    reserva: (i) => estado.reservas.find((r) => r.id === i),
    solicitud: (i) => estado.solicitudes.find((s) => s.id === i),
    emisor: (i) => estado.emisores.find((e) => e.id === i),
    asignacionesDe: (i) => estado.asignaciones.filter((a) => a.tokenId === i),
    solicitudesDe: (i) => estado.solicitudes.filter((s) => s.tokenId === i),
    pendientes: () => estado.solicitudes.filter((s) => ['en_revision', 'objecion'].includes(s.estado)),
  };

  /* ---------------- flujo de solicitudes de emisión ---------------- */

  function crearSolicitud(datos) {
    const s = {
      id: id('SOL'),
      tipo: datos.tipo,                 // 'security' | 'utility'
      tokenId: datos.tokenId,
      simbolo: datos.simbolo,
      accion: datos.accion,             // 'emision_inicial' | 'emision_adicional' | 'recompra' | 'quema'
      cantidad: datos.cantidad,
      precio: datos.precio,
      origenRequerido: datos.origenRequerido,
      motivo: datos.motivo,
      causa: datos.causa,               // catálogo de causas admisibles
      evidencias: datos.evidencias || [],
      solicitante: estado.sesion.usuario,
      creada: new Date().toISOString(),
      estado: 'en_revision',
      firmas: [],
      firmasRequeridas: estado.politica.firmasRequeridas,
      ventanaObjecionHasta: new Date(Date.now() + estado.politica.diasObjecion * 86400000).toISOString(),
      dictamen: null,
    };
    accion('solicitud.creada',
      `${s.simbolo} · ${etiquetaAccion(s.accion)} de ${fmt.num(s.cantidad)} tokens (${fmt.dineroCorto(s.origenRequerido)} de ORIGEN)`,
      (e) => e.solicitudes.unshift(s));
    return s;
  }

  function firmar(solId, firmante) {
    const s = buscar.solicitud(solId);
    if (!s) throw new Error('Solicitud no encontrada');
    if (s.firmas.some((f) => f.quien === firmante)) throw new Error('Ese consejero ya firmó');
    accion('solicitud.firmada', `${firmante} firmó ${solId}`, () => {
      s.firmas.push({ quien: firmante, ts: new Date().toISOString() });
    });
    return s;
  }

  function aprobar(solId) {
    const s = buscar.solicitud(solId);
    if (!s) throw new Error('Solicitud no encontrada');
    if (s.firmas.length < s.firmasRequeridas) throw new Error(`Faltan firmas: ${s.firmas.length}/${s.firmasRequeridas}`);
    const chequeo = puedeEmitir(s.origenRequerido);
    if (!chequeo.ok) throw new Error(chequeo.faltas.join(' '));

    accion('solicitud.aprobada', `${s.simbolo} · ${etiquetaAccion(s.accion)} aprobada — se comprometen ${fmt.dineroCorto(s.origenRequerido)} de ORIGEN`, (e) => {
      s.estado = 'aprobada';
      s.resuelta = new Date().toISOString();
      s.dictamen = 'Respaldo verificado. Emisión autorizada.';
      e.asignaciones.push({
        id: id('ASG'), tokenId: s.tokenId, solicitudId: s.id, monto: s.origenRequerido,
        estado: 'comprometida', fecha: new Date().toISOString(),
      });
      const t = buscar.token(s.tokenId);
      if (t) {
        t.origenAsignado += s.origenRequerido;
        t.supply.autorizado = (t.supply.autorizado || 0) + s.cantidad;
        if (t.estado === 'borrador') t.estado = 'en_registro';
      }
    }, 'ok');
    return s;
  }

  function rechazar(solId, motivo) {
    const s = buscar.solicitud(solId);
    if (!s) throw new Error('Solicitud no encontrada');
    accion('solicitud.rechazada', `${s.simbolo} · ${etiquetaAccion(s.accion)} rechazada — ${motivo}`, () => {
      s.estado = 'rechazada'; s.resuelta = new Date().toISOString(); s.dictamen = motivo;
    }, 'bad');
    return s;
  }

  function objetar(solId, motivo) {
    const s = buscar.solicitud(solId);
    accion('solicitud.objetada', `${s.simbolo} · objeción registrada — ${motivo}`, () => {
      s.estado = 'objecion'; s.dictamen = motivo;
    }, 'warn');
    return s;
  }

  /** Ejecuta la emisión ya autorizada: pasa de autorizado a emitido. */
  function emitirTokens(tokenId, cantidad) {
    const t = buscar.token(tokenId);
    if (!t) throw new Error('Token no encontrado');
    const cabecera = t.supply.autorizado - t.supply.emitido;
    if (cantidad > cabecera) throw new Error(`Solo hay ${fmt.num(cabecera)} tokens autorizados sin emitir.`);
    // Segundo candado: ni con cabecera disponible se emite por encima del respaldo.
    const precio = t.precioUnitario || t.precioAncla;
    const porcion = t.redimible !== undefined ? t.redimible : 1;
    const consumo = (t.supply.emitido + cantidad) * precio * porcion;
    if (consumo > t.origenAsignado + 0.01) {
      throw new Error(`El ORIGEN asignado (${fmt.dineroCorto(t.origenAsignado)}) solo respalda hasta ${fmt.num(Math.floor(t.origenAsignado / (precio * porcion)))} tokens.`);
    }
    if (t.valuacion && (t.supply.emitido + cantidad) * precio > t.valuacion.valorCertificado + 0.01) {
      throw new Error(`Se superaría la valuación certificada de ${fmt.dineroCorto(t.valuacion.valorCertificado)}.`);
    }
    if (t.capacidad && (t.supply.emitido + cantidad) - t.supply.quemado - t.supply.enTesoreria > t.capacidad.comprometida) {
      throw new Error(`No hay capacidad de servicio para tantos tokens (${fmt.num(t.capacidad.comprometida)} ${t.capacidad.unidad}).`);
    }
    accion('token.emitido', `${t.simbolo} · se emitieron ${fmt.num(cantidad)} tokens contra respaldo autorizado`, () => {
      t.supply.emitido += cantidad;
      if (t.supply.enTesoreria !== undefined) t.supply.enTesoreria += cantidad;
      if (t.estado === 'en_registro') t.estado = 'listado';
    }, 'ok');
    return t;
  }

  function quemar(tokenId, cantidad, motivo) {
    const t = buscar.token(tokenId);
    accion('token.quemado', `${t.simbolo} · se quemaron ${fmt.num(cantidad)} tokens — ${motivo}`, () => {
      t.supply.quemado += cantidad;
      const liberado = cantidad * (t.precioUnitario || t.precioAncla) * (t.redimible !== undefined ? t.redimible : 1);
      t.origenAsignado = Math.max(0, t.origenAsignado - liberado);
      const asg = estado.asignaciones.filter((a) => a.tokenId === tokenId && a.estado === 'comprometida');
      let resto = liberado;
      for (const a of asg) {
        if (resto <= 0) break;
        const baja = Math.min(a.monto, resto);
        a.monto -= baja; resto -= baja;
        if (a.monto <= 0.01) a.estado = 'liberada';
      }
    }, 'warn');
  }

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

  /* ---------------- UI ---------------- */
  const el = (sel, raiz) => (raiz || document).querySelector(sel);
  const els = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const ICONOS = {
    escudo: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/>',
    panel: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    token: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h5M9.5 14h5"/>',
    balanza: '<path d="M12 4v16M6 8h12M6 8l-3 6h6l-3-6zM18 8l-3 6h6l-3-6zM8 20h8"/>',
    boveda: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8v1.5M12 14.5V16M8 12h1.5M14.5 12H16"/>',
    lista: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    libro: '<path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5z"/><path d="M9 7h7M9 11h7"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    personas: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.3a3 3 0 010 5.4M18 14.2c1.8.9 3 2.7 3 4.8"/>',
    escudo2: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    alerta: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.5 17.4A2 2 0 004.2 20.4h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    candado: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/>',
    fuego: '<path d="M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s1 1.5 2 1.5S12 7 12 3z"/>',
    tienda: '<path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M8 20v-6h4v6"/>',
    doc: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    engrane: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 007.5 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 15H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 8.5l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 009 4.6V3a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1.3z"/>',
    pausa: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M10.9 12.1L20 3M17 6l2 2M14 9l2 2"/>',
  };
  const ic = (n, cls) => `<svg viewBox="0 0 24 24" class="${cls || ''}" aria-hidden="true">${ICONOS[n] || ''}</svg>`;

  /* --- toasts --- */
  function toast(titulo, texto, tipo) {
    let cont = el('.toasts');
    if (!cont) { cont = document.createElement('div'); cont.className = 'toasts'; document.body.appendChild(cont); }
    const t = document.createElement('div');
    t.className = 'toast ' + (tipo || '');
    t.innerHTML = `<b>${esc(titulo)}</b>${texto ? `<span>${esc(texto)}</span>` : ''}`;
    cont.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 4200);
  }

  /* --- modal --- */
  let modalActual = null;
  function modal({ titulo, cuerpo, pie, ancho, alAbrir }) {
    cerrarModal();
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true">
        <div class="cab"><h3>${esc(titulo)}</h3><button class="x" data-cerrar aria-label="Cerrar">&times;</button></div>
        <div class="cuerpo">${cuerpo}</div>
        ${pie ? `<div class="pie">${pie}</div>` : ''}
      </div>`;
    fondo.addEventListener('click', (e) => { if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrarModal(); });
    document.body.appendChild(fondo);
    document.body.style.overflow = 'hidden';
    modalActual = fondo;
    if (alAbrir) alAbrir(fondo);
    return fondo;
  }
  function cerrarModal() {
    if (modalActual) { modalActual.remove(); modalActual = null; document.body.style.overflow = ''; }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarModal(); });

  function confirmar(titulo, texto, alSi, textoBoton, peligro) {
    modal({
      titulo,
      cuerpo: `<p style="font-size:13.5px;line-height:1.6;color:var(--muted)">${texto}</p>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button>
            <button class="btn ${peligro ? 'peligro' : 'pri'}" data-si>${esc(textoBoton || 'Confirmar')}</button>`,
      alAbrir(f) { el('[data-si]', f).addEventListener('click', () => { cerrarModal(); alSi(); }); },
    });
  }

  /* --- tema --- */
  function tema(v) {
    const actual = document.documentElement.getAttribute('data-theme');
    const nuevo = v || (actual === 'light' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', nuevo);
    try { localStorage.setItem('og.tema', nuevo); } catch (e) {}
  }
  (function temaInicial() {
    try { const t = localStorage.getItem('og.tema'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  })();

  /* --- medidor circular --- */
  function medidor(pct, etiqueta, color, tam) {
    const T = tam || 132, R = T / 2 - 10, C = 2 * Math.PI * R;
    const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 100));
    return `<div class="medidor" style="width:${T}px;height:${T}px">
      <svg width="${T}" height="${T}">
        <circle cx="${T / 2}" cy="${T / 2}" r="${R}" stroke="var(--surface3)" stroke-width="9" fill="none"/>
        <circle cx="${T / 2}" cy="${T / 2}" r="${R}" stroke="${color}" stroke-width="9" fill="none"
          stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p / 100)}"/>
      </svg>
      <div class="centro"><b>${Number.isFinite(pct) ? fmt.pct(pct, 1) : '∞'}</b><span>${esc(etiqueta)}</span></div>
    </div>`;
  }

  /* --- chasis compartido (sidebar + topbar) --- */
  function chasis({ montaje, marca, sub, acento, secciones, vistas, inicio }) {
    document.documentElement.setAttribute('data-acento', acento);
    const raiz = el(montaje);
    const navHtml = secciones.map((g) => `
      <div class="grupo">${esc(g.grupo)}</div>
      ${g.items.map((i) => `<a data-vista="${i.v}">${ic(i.ic)}<span>${esc(i.t)}</span>${i.pill ? `<b class="pill" data-pill="${i.v}"></b>` : ''}</a>`).join('')}
    `).join('');

    raiz.innerHTML = `
      <div class="velo" data-velo></div>
      <div class="shell">
        <aside class="side" data-side>
          <div class="brand">
            <div class="mark">${ic('escudo')}</div>
            <div><b>${esc(marca)}</b><span>${esc(sub)}</span></div>
          </div>
          <nav class="nav">${navHtml}</nav>
          <div class="pie">
            <a href="./index.html">← Portal de Tesorería</a>
            <a href="./origen.html">Emisión de ORIGEN</a>
            <a href="./security.html">Tesorería Security</a>
            <a href="./utility.html">Tesorería Utility</a>
            <div style="padding:10px 12px 0" data-sello></div>
          </div>
        </aside>
        <div class="main">
          <header class="top">
            <button class="menu-btn" data-menu aria-label="Menú">${ic('lista')}</button>
            <div><h1 data-titulo></h1><div class="sub" data-subtitulo></div></div>
            <div class="der">
              <span class="tag plano" data-sesion></span>
              <button class="btn chico fantasma" data-tema title="Claro / oscuro">${ic('sol')}</button>
            </div>
          </header>
          <div class="contenido" data-contenido></div>
        </div>
      </div>`;

    const cont = el('[data-contenido]', raiz);
    const side = el('[data-side]', raiz);
    const velo = el('[data-velo]', raiz);
    el('[data-tema]', raiz).addEventListener('click', () => { tema(); render(); });
    el('[data-menu]', raiz).addEventListener('click', () => { side.classList.add('abierto'); velo.classList.add('on'); });
    velo.addEventListener('click', () => { side.classList.remove('abierto'); velo.classList.remove('on'); });

    let vistaActual = (location.hash || '').replace('#', '') || inicio;
    if (!vistas[vistaActual]) vistaActual = inicio;

    els('[data-vista]', raiz).forEach((a) => a.addEventListener('click', () => {
      vistaActual = a.dataset.vista; location.hash = vistaActual;
      side.classList.remove('abierto'); velo.classList.remove('on');
      render(); cont.scrollTop = 0; window.scrollTo(0, 0);
    }));
    window.addEventListener('hashchange', () => {
      const v = (location.hash || '').replace('#', '');
      if (vistas[v] && v !== vistaActual) { vistaActual = v; render(); }
    });

    function render() {
      const v = vistas[vistaActual] || vistas[inicio];
      els('[data-vista]', raiz).forEach((a) => a.classList.toggle('on', a.dataset.vista === vistaActual));
      el('[data-titulo]', raiz).textContent = v.titulo;
      el('[data-subtitulo]', raiz).textContent = typeof v.sub === 'function' ? v.sub() : (v.sub || '');
      el('[data-sesion]', raiz).innerHTML = `${esc(estado.sesion.usuario)} · <span class="faint">${esc(estado.sesion.rol)}</span>`;
      const sello = el('[data-sello]', raiz);
      if (sello) sello.innerHTML = `<span class="ts mono">sello ${esc((estado.libro[0] || {}).hash || '—').slice(0, 12)}</span>`;
      cont.innerHTML = v.render();
      if (v.alMontar) v.alMontar(cont);
      // contadores rojos
      els('[data-pill]', raiz).forEach((b) => {
        const n = buscar.pendientes().length;
        b.textContent = n; b.style.display = n ? '' : 'none';
      });
    }

    suscribir(render);
    render();
    return { render, ir: (v) => { vistaActual = v; location.hash = v; render(); } };
  }

  /* --- delegación de clics por atributo --- */
  function alClic(raiz, attr, fn) {
    raiz.addEventListener('click', (e) => {
      const t = e.target.closest('[' + attr + ']');
      if (t && raiz.contains(t)) fn(t.getAttribute(attr), t, e);
    });
  }

  /* --- export --- */
  function exportarJSON(nombre, datos) {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  global.T = {
    // estado
    get estado() { return estado; },
    cargar, guardar, reiniciar, suscribir, accion, asentar, verificarLibro, hash, id,
    // reglas
    respaldo, puedeEmitir, saludSecurity, saludUtility, valorAdmisible, reservasAdmisibles,
    crearSolicitud, firmar, aprobar, rechazar, objetar, emitirTokens, quemar,
    buscar, etiquetaAccion, ACCIONES, CAUSAS,
    // ui
    fmt, el, els, esc, ic, ICONOS, toast, modal, cerrarModal, confirmar, tema,
    medidor, chasis, alClic, exportarJSON,
  };
})(window);
